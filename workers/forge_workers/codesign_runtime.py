"""Repository-owned controlled engine smoke for the P9 co-design ladder.

This command is the reviewed ``FORGE_CODESIGN_CMD`` implementation for local or
provider images. It is intentionally not the overnight CMA-ES/Optuna optimizer:
it evaluates a small deterministic, contract-derived electrical manifold through
the sovereign native validator, real Rapier, and pinned MuJoCo 3.9.0. Tier 3 is
always held.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, TextIO

import numpy as np

from forge_workers.training.bundle import (
    PINNED_MUJOCO_VERSION,
    SNAPSHOT_SCHEMA,
    TRAINING_BUNDLE_VERSION,
    compile_training_bundle,
)
from forge_workers.training.controllers import multirotor_teacher_action
from forge_workers.training.mujoco_env import ForgeMultirotorTaskEnv
from forge_workers.training.tasks import task_definition

CODESIGN_EVALUATION_SCHEMA = "forge-codesign-evaluation"
CODESIGN_EVALUATION_VERSION = "1.0.0"
CODESIGN_NATIVE_EVALUATION_SCHEMA = "forge-codesign-native-evaluation"
CODESIGN_NATIVE_EVALUATION_VERSION = "1.0.0"
CODESIGN_CATALOG_NATIVE_EVALUATION_VERSION = "2.0.0"
CODESIGN_CATALOG_PROOF_SCHEMA = "forge-codesign-catalog-proof"
CODESIGN_CATALOG_PROOF_VERSION = "1.0.0"
CODESIGN_ENGINE_SMOKE_EVIDENCE_VERSION = "1.0.0"
CODESIGN_MATURITY = "local-engine-controlled-smoke"
CODESIGN_RUNTIME = "forge-codesign-engine-smoke/1.0.0"
RAPIER_ENGINE = "rapier3d/0.33.0"
MAX_INPUT_BYTES = 4 * 1024 * 1024
MAX_NATIVE_OUTPUT_BYTES = 2 * 1024 * 1024
MIN_CANDIDATES = 3
MAX_CONTROLLED_CANDIDATES = 9
TIER0_BUDGET_MS = 50.0
ROLLOUT_EPISODES = 2
ROLLOUT_STEPS = 200
ROLLOUT_CONTROL_PERIOD_S = 0.02

_SCALE_GRID = (
    (1.00, 1.00, 1.00),
    (0.96, 1.04, 1.08),
    (1.04, 0.96, 0.92),
    (0.98, 1.02, 1.04),
    (1.02, 0.98, 0.96),
    (0.94, 1.06, 1.10),
    (1.06, 0.94, 0.90),
    (0.99, 1.01, 1.02),
    (1.01, 0.99, 0.98),
)


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha(value: str | bytes) -> str:
    data = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(data).hexdigest()


def _exact(value: dict[str, Any], fields: set[str], label: str) -> None:
    if set(value) != fields:
        raise ValueError(f"{label} fields are not exact")


def _sha256_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or len(value) != 64 or any(
        character not in "0123456789abcdef" for character in value
    ):
        raise ValueError(f"{label} must be a lower-case SHA-256 digest")
    return value


def _snapshot(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    snapshot = payload.get("modelSnapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("controlled co-design requires a gateway-owned admitted model snapshot")
    _exact(snapshot, {"schemaVersion", "modelId", "contractHash", "contractJson"}, "model snapshot")
    if snapshot.get("schemaVersion") != SNAPSHOT_SCHEMA:
        raise ValueError("unsupported admitted model snapshot version")
    model_id = snapshot.get("modelId")
    contract_hash = snapshot.get("contractHash")
    contract_json = snapshot.get("contractJson")
    if not isinstance(model_id, str) or not 1 <= len(model_id) <= 160:
        raise ValueError("model snapshot modelId is invalid")
    if not isinstance(contract_hash, str) or len(contract_hash) != 64:
        raise ValueError("model snapshot contractHash is invalid")
    if not isinstance(contract_json, str) or len(contract_json.encode("utf-8")) > 512 * 1024:
        raise ValueError("model snapshot contractJson is invalid")
    if _sha(contract_json) != contract_hash or payload.get("contractHash") != contract_hash:
        raise ValueError("model snapshot hash authority drifted")
    try:
        contract = json.loads(contract_json)
    except json.JSONDecodeError as error:
        raise ValueError("model snapshot contractJson is not JSON") from error
    if not isinstance(contract, dict):
        raise ValueError("model snapshot contract must be an object")
    if payload.get("manifold") is not None:
        raise ValueError("controlled co-design derives its manifold; client manifolds are not accepted")
    return snapshot, contract


def _finite_number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _base_values(contract: dict[str, Any]) -> tuple[list[float], list[float], float]:
    meta = contract.get("meta")
    sim = contract.get("sim")
    if not isinstance(meta, dict) or meta.get("archetype") != "multirotor" or not isinstance(sim, dict):
        raise ValueError("controlled co-design currently supports admitted multirotors only")
    motors = sim.get("motors")
    props = sim.get("props")
    battery = sim.get("battery")
    if not isinstance(motors, list) or not motors or not isinstance(props, list) or not props:
        raise ValueError("controlled co-design requires inline motors and props")
    if not isinstance(battery, dict):
        raise ValueError("controlled co-design requires an inline battery")
    motor_kv = [
        _finite_number(motor.get("kv") if isinstance(motor, dict) else None, f"motor[{index}].kv")
        for index, motor in enumerate(motors)
    ]
    prop_diameter = [
        _finite_number(
            prop.get("diameterIn") if isinstance(prop, dict) else None,
            f"prop[{index}].diameterIn",
        )
        for index, prop in enumerate(props)
    ]
    capacity = _finite_number(battery.get("capacity_mAh"), "battery.capacity_mAh")
    if any(value <= 0 for value in (*motor_kv, *prop_diameter, capacity)):
        raise ValueError("controlled co-design electrical manifold values must be positive")
    return motor_kv, prop_diameter, capacity


def _candidate_budget(payload: dict[str, Any]) -> int:
    raw = payload.get("candidateBudget", payload.get("budget", MIN_CANDIDATES))
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise ValueError("candidateBudget must be an integer")
    budget = raw
    if not MIN_CANDIDATES <= budget <= MAX_CONTROLLED_CANDIDATES:
        raise ValueError(
            f"controlled co-design candidateBudget must be {MIN_CANDIDATES}..{MAX_CONTROLLED_CANDIDATES}; "
            "use the separately evidenced overnight optimizer for larger runs"
        )
    return budget


def _seed(payload: dict[str, Any], contract_hash: str) -> int:
    raw = payload.get("seed")
    if raw is None:
        return int(contract_hash[:12], 16)
    if isinstance(raw, bool) or not isinstance(raw, int) or not 0 <= raw <= 2**63 - 1:
        raise ValueError("seed must be an integer in 0..2^63-1")
    return raw


def _source_authority() -> tuple[str | None, str]:
    revision = os.environ.get("FORGE_SOURCE_REVISION", "").strip() or None
    if revision is not None and (len(revision) != 40 or any(character not in "0123456789abcdef" for character in revision)):
        raise ValueError("FORGE_SOURCE_REVISION must be a full lower-case Git SHA")
    manifest = Path(__file__).resolve().parents[1] / "pyproject.toml"
    if not manifest.is_file():
        raise RuntimeError("worker dependency manifest is absent")
    return revision, _sha(manifest.read_bytes())


def _constraints(payload: dict[str, Any]) -> dict[str, float]:
    raw = payload.get("constraints", {})
    if not isinstance(raw, dict) or not set(raw).issubset(
        {"maxMassG", "minEnduranceMin", "maxTaskTimeS", "minScore"}
    ):
        raise ValueError("constraints must contain only the supported co-design objectives")
    defaults = {
        "maxMassG": 900.0,
        "minEnduranceMin": 6.0,
        "maxTaskTimeS": 24.0,
        "minScore": 0.55,
    }
    result = {key: _finite_number(raw.get(key, default), f"constraints.{key}") for key, default in defaults.items()}
    if result["maxMassG"] <= 0 or result["minEnduranceMin"] < 0 or result["maxTaskTimeS"] <= 0:
        raise ValueError("co-design constraints are outside supported positive bounds")
    if not 0 <= result["minScore"] <= 1:
        raise ValueError("constraints.minScore must be in 0..1")
    return result


def _candidate_patch(
    contract: dict[str, Any],
    index: int,
    scales: tuple[float, float, float],
    base: tuple[list[float], list[float], float],
) -> list[dict[str, Any]]:
    kv_scale, prop_scale, capacity_scale = scales
    motor_kv, prop_diameter, capacity = base
    name = contract.get("meta", {}).get("name", "ForgedTTC model")
    patch: list[dict[str, Any]] = [
        {"op": "replace", "path": "/meta/name", "value": f"{name} · co-design smoke {index + 1:02d}"}
    ]
    patch.extend(
        {"op": "replace", "path": f"/sim/motors/{motor_index}/kv", "value": round(value * kv_scale, 6)}
        for motor_index, value in enumerate(motor_kv)
    )
    patch.extend(
        {
            "op": "replace",
            "path": f"/sim/props/{prop_index}/diameterIn",
            "value": round(value * prop_scale, 6),
        }
        for prop_index, value in enumerate(prop_diameter)
    )
    patch.append(
        {
            "op": "replace",
            "path": "/sim/battery/capacity_mAh",
            "value": round(capacity * capacity_scale, 6),
        }
    )
    return patch


def _pointer_tokens(path: str) -> list[str]:
    if not path.startswith("/") or path == "/":
        raise ValueError("controlled patch path must be a non-root JSON Pointer")
    return [token.replace("~1", "/").replace("~0", "~") for token in path[1:].split("/")]


def apply_controlled_patch(contract: dict[str, Any], patch: list[dict[str, Any]]) -> dict[str, Any]:
    """Apply the exact replace-only subset emitted by this controlled runtime."""

    result: Any = copy.deepcopy(contract)
    for operation in patch:
        if not isinstance(operation, dict) or set(operation) != {"op", "path", "value"}:
            raise ValueError("controlled co-design patch operation is not exact")
        if operation["op"] != "replace" or not isinstance(operation["path"], str):
            raise ValueError("controlled co-design patch supports replace operations only")
        tokens = _pointer_tokens(operation["path"])
        parent = result
        for token in tokens[:-1]:
            if isinstance(parent, list):
                if not token.isdigit() or int(token) >= len(parent):
                    raise ValueError("controlled co-design patch index is outside the contract")
                parent = parent[int(token)]
            elif isinstance(parent, dict) and token in parent:
                parent = parent[token]
            else:
                raise ValueError("controlled co-design patch path is absent")
        leaf = tokens[-1]
        if isinstance(parent, list):
            if not leaf.isdigit() or int(leaf) >= len(parent):
                raise ValueError("controlled co-design patch leaf index is outside the contract")
            parent[int(leaf)] = copy.deepcopy(operation["value"])
        elif isinstance(parent, dict) and leaf in parent:
            parent[leaf] = copy.deepcopy(operation["value"])
        else:
            raise ValueError("controlled co-design patch replace target is absent")
    if not isinstance(result, dict):
        raise ValueError("controlled co-design patch did not preserve the contract object")
    return result


def _validator_binary() -> str:
    configured = os.environ.get("FORGE_VALIDATE_BIN", "").strip()
    if configured:
        path = Path(configured)
        if not path.is_file():
            raise RuntimeError("FORGE_VALIDATE_BIN is not a file")
        return str(path)
    root = Path(__file__).resolve().parents[2]
    for candidate in (
        root / "target" / "release" / "forge-validate",
        root / "target" / "debug" / "forge-validate",
    ):
        if candidate.is_file():
            return str(candidate)
    installed = shutil.which("forge-validate")
    if installed:
        return installed
    raise RuntimeError("forge-validate binary is not built; set FORGE_VALIDATE_BIN")


def _native_evaluation(
    contract_json: str,
    contract_hash: str,
    *,
    catalog_path: Path | None = None,
    catalog_authority_sha256: str | None = None,
) -> tuple[dict[str, Any], float]:
    if (catalog_path is None) != (catalog_authority_sha256 is None):
        raise ValueError("native co-design catalog path and authority must be supplied together")
    if catalog_path is not None and not (catalog_path / "components").is_dir():
        raise ValueError("native co-design catalog components directory is absent")
    path: str | None = None
    started = time.perf_counter()
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", suffix=".forge.json", prefix="forge-codesign-", delete=False
        ) as handle:
            handle.write(contract_json)
            path = handle.name
        command = [_validator_binary(), "codesign-evaluate", path, "--snapshot-hash", contract_hash]
        if catalog_path is not None:
            command.extend(["--catalog", str(catalog_path)])
        completed = subprocess.run(
            command,
            capture_output=True,
            timeout=90,
            check=False,
            env={**os.environ, "NO_COLOR": "1"},
        )
    finally:
        if path is not None:
            Path(path).unlink(missing_ok=True)
    runtime_ms = (time.perf_counter() - started) * 1_000.0
    if completed.returncode not in {0, 2}:
        raise RuntimeError("forge-validate codesign evaluation failed")
    if len(completed.stdout) > MAX_NATIVE_OUTPUT_BYTES:
        raise RuntimeError("forge-validate codesign evaluation exceeds the worker boundary")
    try:
        value = json.loads(completed.stdout)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("forge-validate codesign evaluation was not JSON") from error
    _validate_native_evaluation(value, contract_hash, catalog_authority_sha256)
    if (completed.returncode == 0) != bool(value["passed"]):
        raise RuntimeError("forge-validate codesign exit status disagrees with its artifact")
    return value, runtime_ms


def _validate_native_evaluation(
    value: Any, contract_hash: str, catalog_authority_sha256: str | None = None
) -> None:
    if not isinstance(value, dict):
        raise ValueError("native co-design evaluation must be an object")
    expected_fields = {
        "schemaVersion",
        "artifactKind",
        "candidateSnapshotSha256",
        "passed",
        "tier0",
        "nonclaims",
    }
    if "tier1" in value:
        expected_fields.add("tier1")
    expected_version = CODESIGN_NATIVE_EVALUATION_VERSION
    if catalog_authority_sha256 is not None:
        expected_fields.add("catalogProof")
        expected_version = CODESIGN_CATALOG_NATIVE_EVALUATION_VERSION
    _exact(value, expected_fields, "native co-design evaluation")
    if value.get("schemaVersion") != f"{CODESIGN_NATIVE_EVALUATION_SCHEMA}/{expected_version}":
        raise ValueError("unsupported native co-design evaluation version")
    if value.get("artifactKind") != "codesignNativeEvaluation" or value.get("candidateSnapshotSha256") != contract_hash:
        raise ValueError("native co-design evaluation identity drifted")
    tier0 = value.get("tier0")
    if not isinstance(tier0, dict) or tier0.get("engine") != "forge-validate-native" or tier0.get("engineBacked") is not True:
        raise ValueError("native co-design tier 0 authority is invalid")
    if not isinstance(tier0.get("passed"), bool) or isinstance(tier0.get("runtimeMs"), bool) or not isinstance(tier0.get("runtimeMs"), int):
        raise ValueError("native co-design tier 0 result is invalid")
    tier1 = value.get("tier1")
    if tier1 is not None:
        if not isinstance(tier1, dict) or tier1.get("engine") != RAPIER_ENGINE or tier1.get("engineBacked") is not True:
            raise ValueError("native co-design tier 1 authority is invalid")
        if tier1.get("steps") != 120 or tier1.get("substeps") != 2 or tier1.get("simulatedDurationS") != 1.0:
            raise ValueError("native co-design Rapier protocol drifted")
        if not isinstance(tier1.get("trajectorySha256"), str) or len(tier1["trajectorySha256"]) != 64:
            raise ValueError("native co-design Rapier digest is invalid")
    if bool(value.get("passed")) != (tier0.get("passed") is True and isinstance(tier1, dict) and tier1.get("passed") is True):
        raise ValueError("native co-design aggregate verdict drifted")
    nonclaims = value.get("nonclaims")
    if not isinstance(nonclaims, dict) or any(nonclaims.get(key) is not False for key in nonclaims):
        raise ValueError("native co-design nonclaims drifted")
    if catalog_authority_sha256 is not None:
        proof = value.get("catalogProof")
        if not isinstance(proof, dict):
            raise ValueError("native co-design catalog proof is absent")
        _exact(
            proof,
            {
                "schemaVersion",
                "catalogAuthoritySha256",
                "resolutionComplete",
                "equippedComponents",
                "marketplacePublicationReviewed",
                "marketplaceExposable",
            },
            "native co-design catalog proof",
        )
        if (
            proof.get("schemaVersion")
            != f"{CODESIGN_CATALOG_PROOF_SCHEMA}/{CODESIGN_CATALOG_PROOF_VERSION}"
            or proof.get("catalogAuthoritySha256") != catalog_authority_sha256
            or proof.get("resolutionComplete") is not True
            or proof.get("marketplacePublicationReviewed") is not False
            or proof.get("marketplaceExposable") is not False
        ):
            raise ValueError("native co-design catalog authority drifted")
        components = proof.get("equippedComponents")
        if not isinstance(components, list) or not components:
            raise ValueError("native co-design equipped catalog proof is empty")
        for component in components:
            if not isinstance(component, dict):
                raise ValueError("native co-design equipped catalog row proof is invalid")
            required_fields = {
                "slotId",
                "variantId",
                "componentRef",
                "exactRevision",
                "componentId",
                "category",
                "rowSha256",
                "massG",
                "confidence",
                "reviewRequired",
                "license",
            }
            allowed_fields = required_fields | {
                "capacityMah",
                "maxDischargeA",
                "kv",
                "propDiameterIn",
                "review",
            }
            if not required_fields <= set(component) <= allowed_fields:
                raise ValueError("native co-design equipped catalog row proof fields are not exact")
            for field in (
                "slotId",
                "variantId",
                "componentRef",
                "exactRevision",
                "componentId",
                "category",
            ):
                if not isinstance(component.get(field), str) or not component[field]:
                    raise ValueError("native co-design equipped catalog identity is invalid")
            _sha256_string(component.get("rowSha256"), "native co-design catalog row")
            if _finite_number(component.get("massG"), "native co-design catalog mass") <= 0:
                raise ValueError("native co-design catalog mass is outside bounds")
            confidence = _finite_number(
                component.get("confidence"), "native co-design catalog confidence"
            )
            if not 0 < confidence <= 1:
                raise ValueError("native co-design catalog confidence is outside bounds")
            for field in ("capacityMah", "maxDischargeA", "kv", "propDiameterIn"):
                if field in component and _finite_number(
                    component[field], f"native co-design catalog {field}"
                ) <= 0:
                    raise ValueError("native co-design catalog physical value is outside bounds")
            if not isinstance(component.get("reviewRequired"), bool):
                raise ValueError("native co-design catalog review state is invalid")
            if "review" in component and (
                not isinstance(component["review"], str) or not component["review"]
            ):
                raise ValueError("native co-design catalog review evidence is invalid")
            license_proof = component.get("license")
            if not isinstance(license_proof, dict) or set(license_proof) != {
                "id",
                "class",
                "sourceUrl",
                "exportPolicy",
            }:
                raise ValueError("native co-design catalog license proof fields are not exact")
            if any(
                not isinstance(license_proof.get(field), str) or not license_proof[field]
                for field in license_proof
            ) or not license_proof["sourceUrl"].startswith("https://"):
                raise ValueError("native co-design catalog license proof is invalid")


def _candidate_snapshot(candidate: dict[str, Any], model_id: str) -> tuple[str, str, dict[str, Any]]:
    contract_json = _stable_json(candidate)
    contract_hash = _sha(contract_json)
    payload = {
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": SNAPSHOT_SCHEMA,
            "modelId": model_id,
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
    }
    return contract_json, contract_hash, payload


def _mujoco_rollout(bundle: dict[str, Any], seed: int) -> tuple[dict[str, Any], float]:
    task = task_definition("hover-hold")
    scenario = {
        "massScale": 1.0,
        "kvScale": 1.0,
        "sagScale": 1.0,
        "latencyMs": 0.0,
        "frictionScale": 1.0,
        "windMps": 0.0,
        "dropoutPct": 0.0,
        "imuNoiseScale": 1.0,
        "imuBiasScale": 1.0,
    }
    episodes: list[dict[str, Any]] = []
    started = time.perf_counter()
    for episode in range(ROLLOUT_EPISODES):
        env = ForgeMultirotorTaskEnv(
            bundle,
            task=task,
            episode_steps=ROLLOUT_STEPS,
            fixed_scenario=scenario,
        )
        observation, info = env.reset(seed=seed + episode)
        total_reward = 0.0
        first_success_s: float | None = None
        terminated = False
        truncated = False
        steps = 0
        while not (terminated or truncated):
            action = multirotor_teacher_action(observation, bundle, "hover-hold")
            observation, reward, terminated, truncated, info = env.step(action)
            steps += 1
            total_reward += float(reward)
            if first_success_s is None and info.get("instantSuccess") is True:
                first_success_s = steps * float(bundle["controlPeriodS"])
        episodes.append(
            {
                "episode": episode,
                "steps": steps,
                "successFraction": round(float(info["successFraction"]), 9),
                "energyWh": round(float(info["energyWh"]), 12),
                "reward": round(total_reward, 9),
                "timeToFirstSuccessS": round(first_success_s, 9) if first_success_s is not None else None,
                "unsafe": bool(terminated),
                "finalPositionErrorM": round(float(np.linalg.norm(observation[9:12])), 9),
            }
        )
        env.close()
    runtime_ms = (time.perf_counter() - started) * 1_000.0
    mean = lambda key: float(np.mean([episode[key] for episode in episodes]))
    success_times = [
        float(episode["timeToFirstSuccessS"])
        if episode["timeToFirstSuccessS"] is not None
        else ROLLOUT_STEPS * float(bundle["controlPeriodS"])
        for episode in episodes
    ]
    evidence = {
        "engine": f"mujoco/{PINNED_MUJOCO_VERSION}",
        "engineBacked": True,
        "controller": "forge-estimator-teacher-v1",
        "trainedPolicy": False,
        "estimatorOnly": True,
        "task": {
            "id": task["id"],
            "version": task["version"],
            "definitionHash": task["definitionHash"],
        },
        "episodes": ROLLOUT_EPISODES,
        "stepsPerEpisode": ROLLOUT_STEPS,
        "controlPeriodS": float(bundle["controlPeriodS"]),
        "simulatedDurationS": ROLLOUT_EPISODES * ROLLOUT_STEPS * float(bundle["controlPeriodS"]),
        "successRate": sum(episode["successFraction"] >= 0.6 for episode in episodes) / ROLLOUT_EPISODES,
        "meanSuccessFraction": round(mean("successFraction"), 9),
        "meanEnergyWh": round(mean("energyWh"), 12),
        "meanReward": round(mean("reward"), 9),
        "meanTimeToFirstSuccessS": round(float(np.mean(success_times)), 9),
        "unsafeEpisodes": sum(bool(episode["unsafe"]) for episode in episodes),
        "meanFinalPositionErrorM": round(mean("finalPositionErrorM"), 9),
        "rolloutSha256": _sha(_stable_json(episodes)),
    }
    return evidence, runtime_ms


def _tier_records(
    native: dict[str, Any],
    native_runtime_ms: float,
    rollout: dict[str, Any] | None,
    rollout_runtime_ms: float,
    constraints: dict[str, float],
) -> tuple[dict[str, dict[str, Any]], dict[str, float], bool, list[str]]:
    hud = native["tier0"].get("hud")
    mass_g = _finite_number(hud.get("auwG") if isinstance(hud, dict) else None, "native HUD mass")
    endurance = _finite_number(
        hud.get("enduranceMin") if isinstance(hud, dict) else None,
        "native HUD endurance",
    )
    tier0_reasons: list[str] = []
    if native["tier0"]["passed"] is not True:
        tier0_reasons.append("sovereign validator rejected the candidate")
    if mass_g > constraints["maxMassG"]:
        tier0_reasons.append(f"mass {mass_g:.3f} g exceeds {constraints['maxMassG']:.3f} g")
    tier0 = {
        "pass": not tier0_reasons,
        "budgetPassed": float(native["tier0"]["runtimeMs"]) < TIER0_BUDGET_MS,
        "runtimeMs": float(native["tier0"]["runtimeMs"]),
        "engine": "forge-validate-native",
        "engineBacked": True,
        "checks": ["schema", "validator", "static-physics", "mass-constraint", "runtime-budget"],
        "reasons": tier0_reasons,
        "evidence": native["tier0"],
    }
    tier1_proof = native.get("tier1")
    tier1_reasons = [] if tier0["pass"] else ["tier0 failed"]
    if not isinstance(tier1_proof, dict) or tier1_proof.get("passed") is not True:
        tier1_reasons.append("real Rapier smoke did not pass")
    tier1 = {
        "pass": not tier1_reasons,
        "runtimeMs": round(native_runtime_ms, 3),
        "engine": RAPIER_ENGINE,
        "engineBacked": isinstance(tier1_proof, dict),
        "checks": ["scene-compile", "finite-one-second-trajectory", "body-collider-presence"],
        "reasons": tier1_reasons,
        "evidence": tier1_proof,
    }
    tier2_reasons = [] if tier1["pass"] else ["tier1 failed"]
    if rollout is None:
        tier2_reasons.append("MuJoCo rollout was not evaluated")
        score = 0.0
        task_time_s = ROLLOUT_STEPS * ROLLOUT_CONTROL_PERIOD_S
        energy_wh = 0.0
    else:
        score = float(rollout["meanSuccessFraction"])
        task_time_s = float(rollout["meanTimeToFirstSuccessS"])
        energy_wh = float(rollout["meanEnergyWh"])
        if rollout["engineBacked"] is not True or rollout["unsafeEpisodes"] != 0:
            tier2_reasons.append("real MuJoCo rollout was unsafe or lacked engine authority")
        if endurance < constraints["minEnduranceMin"]:
            tier2_reasons.append(f"endurance {endurance:.3f} min is below {constraints['minEnduranceMin']:.3f} min")
        if task_time_s > constraints["maxTaskTimeS"]:
            tier2_reasons.append(f"task time {task_time_s:.3f} s exceeds {constraints['maxTaskTimeS']:.3f} s")
        if score < constraints["minScore"]:
            tier2_reasons.append(f"score {score:.3f} is below {constraints['minScore']:.3f}")
    tier2 = {
        "pass": not tier2_reasons,
        "runtimeMs": round(rollout_runtime_ms, 3),
        "engine": f"mujoco/{PINNED_MUJOCO_VERSION}",
        "engineBacked": rollout is not None,
        "checks": ["short-hover-rollout", "estimator-controller", "energy", "objective-constraints"],
        "reasons": tier2_reasons,
        "evidence": rollout,
    }
    tier3 = {
        "pass": False,
        "evaluated": False,
        "held": True,
        "runtimeMs": 0.0,
        "engine": "not-run",
        "engineBacked": False,
        "checks": [],
        "reasons": ["controlled smoke never trains or evaluates a finalist policy"],
    }
    admission_reasons = [
        f"{tier_name}: {reason}"
        for tier_name, tier in (("tier0", tier0), ("tier1", tier1), ("tier2", tier2))
        for reason in tier["reasons"]
    ]
    metrics = {
        "massG": round(mass_g, 6),
        "enduranceMin": round(endurance, 6),
        "taskTimeS": round(task_time_s, 6),
        "score": round(score, 6),
        "energyWh": round(energy_wh, 12),
    }
    return {"tier0": tier0, "tier1": tier1, "tier2": tier2, "tier3": tier3}, metrics, not admission_reasons, admission_reasons


def _pareto(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    front: list[dict[str, Any]] = []
    for candidate in candidates:
        if candidate["admitted"] is not True:
            continue
        metrics = candidate["metrics"]
        dominated = False
        for other in candidates:
            if other is candidate or other["admitted"] is not True:
                continue
            other_metrics = other["metrics"]
            at_least = (
                other_metrics["score"] >= metrics["score"]
                and other_metrics["enduranceMin"] >= metrics["enduranceMin"]
                and other_metrics["massG"] <= metrics["massG"]
            )
            strictly = (
                other_metrics["score"] > metrics["score"]
                or other_metrics["enduranceMin"] > metrics["enduranceMin"]
                or other_metrics["massG"] < metrics["massG"]
            )
            if at_least and strictly:
                dominated = True
                break
        if not dominated:
            front.append(candidate)
    return front


def evaluate(payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("task") != "codesign.evaluate":
        raise ValueError("controlled co-design command requires task=codesign.evaluate")
    snapshot, contract = _snapshot(payload)
    base_values = _base_values(contract)
    budget = _candidate_budget(payload)
    seed = _seed(payload, snapshot["contractHash"])
    constraints = _constraints(payload)
    source_revision, dependency_manifest_sha256 = _source_authority()
    candidates: list[dict[str, Any]] = []
    tier0_runtime: list[float] = []
    tier2_runtime: list[float] = []
    for index, scales in enumerate(_SCALE_GRID[:budget]):
        patch = _candidate_patch(contract, index, scales, base_values)
        candidate_contract = apply_controlled_patch(contract, patch)
        candidate_json, candidate_hash, training_payload = _candidate_snapshot(
            candidate_contract, f"{snapshot['modelId']}:codesign:{index:02d}"
        )
        native, native_runtime_ms = _native_evaluation(candidate_json, candidate_hash)
        rollout: dict[str, Any] | None = None
        rollout_runtime_ms = 0.0
        if native["passed"] is True:
            bundle = compile_training_bundle(training_payload)
            rollout, rollout_runtime_ms = _mujoco_rollout(bundle, seed + index * 100)
        evaluations, metrics, admitted, admission_reasons = _tier_records(
            native,
            native_runtime_ms,
            rollout,
            rollout_runtime_ms,
            constraints,
        )
        patch_sha = _sha(_stable_json(patch))
        native_sha = _sha(_stable_json(native))
        candidate_id = f"{snapshot['modelId']}-engine-smoke-{index:02d}-{candidate_hash[:12]}"
        candidates.append(
            {
                "id": candidate_id,
                "patch": patch,
                "tier": "mujoco-rollout" if evaluations["tier2"]["pass"] else (
                    "rapier-smoke" if evaluations["tier1"]["pass"] else "validator-oracle"
                ),
                "algorithm": "deterministic-controlled-smoke",
                "admitted": admitted,
                "admission": {"pass": admitted, "reasons": admission_reasons},
                "evaluations": evaluations,
                "metrics": metrics,
                "nativeEvaluation": native,
                "lineage": {
                    "baseContractHash": snapshot["contractHash"],
                    "candidateSnapshotSha256": candidate_hash,
                    "patchSha256": patch_sha,
                    "nativeEvaluationSchema": f"{CODESIGN_NATIVE_EVALUATION_SCHEMA}/{CODESIGN_NATIVE_EVALUATION_VERSION}",
                    "nativeEvaluationSha256": native_sha,
                    "trainingBundleSchema": TRAINING_BUNDLE_VERSION,
                    "mujocoRuntime": PINNED_MUJOCO_VERSION,
                    "maturity": CODESIGN_MATURITY,
                },
            }
        )
        tier0_runtime.append(float(evaluations["tier0"]["runtimeMs"]))
        if rollout is not None:
            tier2_runtime.append(float(evaluations["tier2"]["runtimeMs"]))
    pareto = _pareto(candidates)
    manifold = {
        "source": "exact-admitted-inline-multirotor-contract",
        "categorical": [],
        "continuous": ["motorKvScale", "propDiameterScale", "batteryCapacityScale"],
        "bounds": {
            "motorKvScale": [0.94, 1.06],
            "propDiameterScale": [0.94, 1.06],
            "batteryCapacityScale": [0.90, 1.10],
        },
        "units": {"motorKv": "rpm/V", "propDiameter": "in", "batteryCapacity": "mAh"},
        "catalogChoiceSearch": False,
    }
    identity = {
        "baseContractHash": snapshot["contractHash"],
        "budget": budget,
        "seed": seed,
        "constraints": constraints,
        "grid": _SCALE_GRID[:budget],
    }
    return {
        "schemaVersion": f"{CODESIGN_EVALUATION_SCHEMA}/{CODESIGN_EVALUATION_VERSION}",
        "artifactKind": "codesign",
        "provider": "forge-local-engine-codesign",
        "cacheKey": f"codesign.engine:{snapshot['contractHash'][:16]}:{_sha(_stable_json(identity))[:16]}",
        "source": {
            "snapshotSchema": SNAPSHOT_SCHEMA,
            "modelId": snapshot["modelId"],
            "baseContractHash": snapshot["contractHash"],
            "candidateCount": len(candidates),
            "runtime": CODESIGN_RUNTIME,
            "sourceRevision": source_revision,
            "sourceRevisionRecorded": source_revision is not None,
            "dependencyManifestSha256": dependency_manifest_sha256,
            "maturity": CODESIGN_MATURITY,
        },
        "manifold": manifold,
        "constraints": constraints,
        "tiers": ["validator-oracle", "rapier-smoke", "mujoco-rollout", "training-finalist-held"],
        "optimizer": {
            "algorithm": "deterministic-controlled-smoke",
            "candidateBudget": budget,
            "seed": seed,
            "engineBacked": True,
            "tier0BudgetMs": TIER0_BUDGET_MS,
            "tier2Evaluated": len(tier2_runtime),
            "trainingFinalists": 0,
            "overnightComplete": False,
        },
        "benchmark": {
            "tier0MaxMs": round(max(tier0_runtime), 3),
            "tier0BudgetMs": TIER0_BUDGET_MS,
            "tier2CandidateBudget": len(tier2_runtime),
            "tier2MeasuredRuntimeHours": round(sum(tier2_runtime) / 3_600_000.0, 9),
            "engineBacked": True,
            "controlledSmoke": True,
            "overnightComplete": False,
        },
        "candidates": candidates,
        "pareto": pareto,
        "nonclaims": {
            "cmaEsExecuted": False,
            "optunaTpeExecuted": False,
            "overnight200Candidate": False,
            "trainedFinalist": False,
            "catalogChoiceSearch": False,
            "providerSandbox": False,
            "buildReady": False,
            "hardwareAuthority": False,
            "fieldEvidence": False,
        },
    }


def main(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout, stderr: TextIO = sys.stderr) -> int:
    try:
        encoded = stdin.buffer.read(MAX_INPUT_BYTES + 1) if hasattr(stdin, "buffer") else stdin.read(MAX_INPUT_BYTES + 1).encode("utf-8")
        if len(encoded) > MAX_INPUT_BYTES:
            raise ValueError("controlled co-design input exceeds the worker boundary")
        payload = json.loads(encoded.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("controlled co-design input must be an object")
        result = evaluate(payload)
        stdout.write(_stable_json(result))
        stdout.write("\n")
        return 0
    except (ValueError, RuntimeError, json.JSONDecodeError, UnicodeDecodeError) as error:
        stderr.write(f"codesign-runtime: {error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
