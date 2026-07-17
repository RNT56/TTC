"""Co-design oracle/evaluation workers (P9).

The keyless implementation generates deterministic JSON-Patch candidates with a
budgeted optimizer-shaped search. Higher tiers can swap in Optuna/CMA-ES and
Modal-backed simulation without changing the queue contract.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import random
from typing import Any

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import configured_gpu_adapter
from forge_workers.queue import Job, registry

CODESIGN_EVALUATION_SCHEMA = "forge-codesign-evaluation"
CODESIGN_EVALUATION_VERSION = "1.0.0"
CODESIGN_NATIVE_EVALUATION_SCHEMA = "forge-codesign-native-evaluation"
CODESIGN_NATIVE_EVALUATION_VERSION = "1.0.0"
PINNED_MUJOCO_VERSION = "3.9.0"
RAPIER_ENGINE = "rapier3d/0.33.0"
MAX_EXTERNAL_CANDIDATES = 200
MAX_PATCH_OPERATIONS = 256
TIER0_BUDGET_MS = 50.0
CONTROLLED_RUNTIME = "forge-codesign-engine-smoke/1.0.0"
CONTROLLED_MATURITY = "local-engine-controlled-smoke"
CONTROLLED_PROVIDER = "forge-local-engine-codesign"
CONTROLLED_ALGORITHM = "deterministic-controlled-smoke"
CONTROLLED_GRID = (
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
CONTROLLED_MANIFOLD = {
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


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode("utf-8")).hexdigest()[:10]


def _seed(payload: dict[str, Any]) -> int:
    if isinstance(payload.get("seed"), int):
        return int(payload["seed"])
    seed_payload = {key: value for key, value in payload.items() if key not in {"budget", "candidateBudget"}}
    return int(_digest(seed_payload), 16)


def evaluate(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_CODESIGN_CMD",
        {"task": "codesign.evaluate", **payload},
        timeout_s=float(payload.get("timeoutS", 12 * 3600)),
    )
    if external is not None:
        return validate_external_result(external, payload)
    base = payload.get("modelId") or payload.get("contractHash") or "candidate"
    gpu = configured_gpu_adapter().run("codesign.evaluate", payload)
    budget = _candidate_budget(payload)
    seed = _seed(payload)
    manifold = payload.get(
        "manifold",
        {
            "categorical": ["battery", "prop", "motor"],
            "continuous": ["mass", "armLength", "capacityMah", "maxSpeedMs"],
            "bounds": {"mass": [0.7, 1.15], "capacityMah": [1300, 2200]},
        },
    )
    constraints = _constraints(payload)
    candidates = _search_candidates(base, payload, budget, seed, constraints)
    pareto = _pareto(candidates)
    tier0_ms = [float(c["evaluations"]["tier0"]["runtimeMs"]) for c in candidates]
    tier2_ms = [float(c["evaluations"]["tier2"]["runtimeMs"]) for c in candidates if c["evaluations"]["tier2"]["pass"]]
    return {
        "schemaVersion": f"{CODESIGN_EVALUATION_SCHEMA}/{CODESIGN_EVALUATION_VERSION}",
        "artifactKind": "codesign",
        "provider": gpu["provider"],
        "cacheKey": gpu["cacheKey"],
        "manifold": manifold,
        "constraints": constraints,
        "tiers": ["validator-oracle", "rapier-smoke", "mujoco-rollout", "training-finalist"],
        "optimizer": {
            "algorithm": "deterministic-cma-tpe-fixture",
            "candidateBudget": budget,
            "seed": seed,
            "liveAdapter": "FORGE_CODESIGN_CMD",
            "tier2EngineBacked": False,
            "tier0BudgetMs": 50,
            "tier2Evaluated": len(tier2_ms),
            "trainingFinalists": sum(1 for candidate in candidates if candidate["tier"] == "training-finalist"),
        },
        "benchmark": {
            "tier0MaxMs": round(max(tier0_ms) if tier0_ms else 0.0, 3),
            "tier0BudgetMs": 50,
            "tier2CandidateBudget": budget,
            "tier2EstimatedRuntimeHours": round(sum(tier2_ms) / 3_600_000, 4),
            "overnightBudgetHours": float(payload.get("overnightBudgetHours", 12.0)),
            "engineBacked": False,
        },
        "candidates": candidates,
        "pareto": pareto,
    }


def _exact(value: dict[str, Any], fields: set[str], label: str) -> None:
    if set(value) != fields:
        raise ValueError(f"{label} fields are not exact")


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha(value: Any) -> str:
    encoded = value if isinstance(value, bytes) else str(value).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _controlled_budget(payload: dict[str, Any]) -> int:
    raw = payload.get("candidateBudget", payload.get("budget", 3))
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise ValueError("external controlled co-design candidate budget is invalid")
    budget = raw
    if not 3 <= budget <= len(CONTROLLED_GRID):
        raise ValueError("external controlled co-design candidate budget is outside 3..9")
    return budget


def _controlled_seed(payload: dict[str, Any], contract_hash: str) -> int:
    seed = payload.get("seed")
    if seed is None:
        return int(contract_hash[:12], 16)
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2**63 - 1:
        raise ValueError("external controlled co-design seed is invalid")
    return seed


def _controlled_constraints(payload: dict[str, Any]) -> dict[str, float]:
    raw = payload.get("constraints", {})
    if not isinstance(raw, dict) or not set(raw).issubset(
        {"maxMassG", "minEnduranceMin", "maxTaskTimeS", "minScore"}
    ):
        raise ValueError("external controlled co-design constraints are invalid")
    defaults = {
        "maxMassG": 900.0,
        "minEnduranceMin": 6.0,
        "maxTaskTimeS": 24.0,
        "minScore": 0.55,
    }
    constraints = {
        name: _finite(raw.get(name, default), f"external controlled constraint {name}")
        for name, default in defaults.items()
    }
    if constraints["maxMassG"] <= 0 or constraints["minEnduranceMin"] < 0 or constraints["maxTaskTimeS"] <= 0:
        raise ValueError("external controlled co-design constraints are outside positive bounds")
    if not 0 <= constraints["minScore"] <= 1:
        raise ValueError("external controlled co-design score constraint is outside 0..1")
    return constraints


def _pointer_tokens(path: str) -> list[str]:
    if not path.startswith("/") or path == "/":
        raise ValueError("co-design patch path must be a non-root JSON Pointer")
    return [token.replace("~1", "/").replace("~0", "~") for token in path[1:].split("/")]


def _apply_patch(document: dict[str, Any], operations: Any) -> dict[str, Any]:
    if not isinstance(operations, list) or not 1 <= len(operations) <= MAX_PATCH_OPERATIONS:
        raise ValueError("external co-design patch operation count is invalid")
    result: Any = copy.deepcopy(document)
    for operation in operations:
        if not isinstance(operation, dict) or operation.get("op") != "replace" or set(operation) != {"op", "path", "value"}:
            raise ValueError("external co-design v1 accepts exact replace operations only")
        path = operation.get("path")
        if not isinstance(path, str) or len(path.encode("utf-8")) > 512:
            raise ValueError("external co-design patch path is invalid")
        parent = result
        tokens = _pointer_tokens(path)
        for token in tokens[:-1]:
            if isinstance(parent, list):
                if not token.isdigit() or int(token) >= len(parent):
                    raise ValueError("external co-design patch index is outside the contract")
                parent = parent[int(token)]
            elif isinstance(parent, dict) and token in parent:
                parent = parent[token]
            else:
                raise ValueError("external co-design patch path is absent")
        leaf = tokens[-1]
        if isinstance(parent, list):
            if not leaf.isdigit() or int(leaf) >= len(parent):
                raise ValueError("external co-design patch leaf index is outside the contract")
            parent[int(leaf)] = copy.deepcopy(operation["value"])
        elif isinstance(parent, dict) and leaf in parent:
            parent[leaf] = copy.deepcopy(operation["value"])
        else:
            raise ValueError("external co-design patch replace target is absent")
    if not isinstance(result, dict):
        raise ValueError("external co-design patch did not preserve a contract object")
    return result


def _external_snapshot(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    snapshot = payload.get("modelSnapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("external co-design requires the gateway-owned admitted model snapshot")
    _exact(snapshot, {"schemaVersion", "modelId", "contractHash", "contractJson"}, "external model snapshot")
    if snapshot.get("schemaVersion") != "forge-admitted-model-snapshot/1.0.0":
        raise ValueError("external co-design model snapshot version is unsupported")
    contract_json = snapshot.get("contractJson")
    contract_hash = snapshot.get("contractHash")
    if not isinstance(contract_json, str) or not isinstance(contract_hash, str) or _sha(contract_json) != contract_hash:
        raise ValueError("external co-design model snapshot hash drifted")
    if payload.get("contractHash") != contract_hash:
        raise ValueError("external co-design job hash drifted from its snapshot")
    try:
        contract = json.loads(contract_json)
    except json.JSONDecodeError as error:
        raise ValueError("external co-design model snapshot is not JSON") from error
    if not isinstance(contract, dict):
        raise ValueError("external co-design model snapshot is not an object")
    return snapshot, contract


def _validate_native(value: Any, candidate_hash: str) -> None:
    if not isinstance(value, dict):
        raise ValueError("external candidate native evaluation must be an object")
    required = {"schemaVersion", "artifactKind", "candidateSnapshotSha256", "passed", "tier0", "nonclaims"}
    if "tier1" in value:
        required.add("tier1")
    _exact(value, required, "external candidate native evaluation")
    if value.get("schemaVersion") != f"{CODESIGN_NATIVE_EVALUATION_SCHEMA}/{CODESIGN_NATIVE_EVALUATION_VERSION}":
        raise ValueError("external candidate native evaluation version is unsupported")
    if value.get("artifactKind") != "codesignNativeEvaluation" or value.get("candidateSnapshotSha256") != candidate_hash:
        raise ValueError("external candidate native evaluation identity drifted")
    tier0 = value.get("tier0")
    if not isinstance(tier0, dict) or tier0.get("engine") != "forge-validate-native" or tier0.get("engineBacked") is not True:
        raise ValueError("external candidate native tier 0 authority is invalid")
    tier0_fields = {
        "engine",
        "engineBacked",
        "passed",
        "reportVersion",
        "validatorVersion",
        "contractHash",
        "runtimeMs",
        "diagnostics",
    }
    if "hud" in tier0:
        tier0_fields.add("hud")
    _exact(tier0, tier0_fields, "external candidate native tier 0")
    if not isinstance(tier0.get("passed"), bool) or _finite(tier0.get("runtimeMs"), "native tier0 runtime") < 0:
        raise ValueError("external candidate native tier 0 result is invalid")
    tier1 = value.get("tier1")
    if tier1 is not None:
        if not isinstance(tier1, dict) or tier1.get("engine") != RAPIER_ENGINE or tier1.get("engineBacked") is not True:
            raise ValueError("external candidate native tier 1 authority is invalid")
        if tier1.get("steps") != 120 or tier1.get("substeps") != 2 or tier1.get("simulatedDurationS") != 1.0:
            raise ValueError("external candidate native Rapier protocol drifted")
        _exact(
            tier1,
            {
                "engine",
                "engineBacked",
                "passed",
                "dtS",
                "substeps",
                "steps",
                "simulatedDurationS",
                "bodyCount",
                "colliderCount",
                "jointCount",
                "rootNode",
                "startRootTranslationM",
                "endRootTranslationM",
                "maxAbsTranslationM",
                "maxLinearSpeedMps",
                "trajectorySha256",
            },
            "external candidate native tier 1",
        )
        trajectory_hash = tier1.get("trajectorySha256")
        if not isinstance(trajectory_hash, str) or len(trajectory_hash) != 64:
            raise ValueError("external candidate native Rapier digest is invalid")
    expected_pass = tier0.get("passed") is True and isinstance(tier1, dict) and tier1.get("passed") is True
    if value.get("passed") is not expected_pass:
        raise ValueError("external candidate native aggregate verdict drifted")
    nonclaims = value.get("nonclaims")
    if not isinstance(nonclaims, dict):
        raise ValueError("external candidate native nonclaims drifted")
    _exact(
        nonclaims,
        {"mujocoEvaluated", "trainedPolicyEvaluated", "buildReady", "hardwareAuthority", "fieldEvidence"},
        "external candidate native nonclaims",
    )
    if any(nonclaims.get(key) is not False for key in nonclaims):
        raise ValueError("external candidate native nonclaims drifted")


def _validate_evaluations(candidate: dict[str, Any], constraints: dict[str, float]) -> None:
    evaluations = candidate.get("evaluations")
    if not isinstance(evaluations, dict):
        raise ValueError("external candidate evaluations must be an object")
    _exact(evaluations, {"tier0", "tier1", "tier2", "tier3"}, "external candidate evaluations")
    for name in ("tier0", "tier1", "tier2", "tier3"):
        tier = evaluations[name]
        if not isinstance(tier, dict) or not isinstance(tier.get("pass"), bool):
            raise ValueError(f"external candidate {name} result is invalid")
        if _finite(tier.get("runtimeMs"), f"external candidate {name} runtime") < 0:
            raise ValueError(f"external candidate {name} runtime is negative")
        if not isinstance(tier.get("reasons"), list) or not all(isinstance(reason, str) for reason in tier["reasons"]):
            raise ValueError(f"external candidate {name} reasons are invalid")
        _exact(
            tier,
            {"pass", "runtimeMs", "engine", "engineBacked", "checks", "reasons", "evidence", "budgetPassed"}
            if name == "tier0"
            else {"pass", "runtimeMs", "engine", "engineBacked", "checks", "reasons", "evidence"}
            if name in {"tier1", "tier2"}
            else {"pass", "evaluated", "held", "runtimeMs", "engine", "engineBacked", "checks", "reasons"},
            f"external candidate {name}",
        )
    native = candidate["nativeEvaluation"]
    if evaluations["tier0"].get("engine") != "forge-validate-native" or evaluations["tier0"].get("evidence") != native["tier0"]:
        raise ValueError("external candidate tier 0 does not bind native evidence")
    if evaluations["tier0"].get("budgetPassed") is not (
        float(native["tier0"]["runtimeMs"]) < TIER0_BUDGET_MS
    ):
        raise ValueError("external candidate tier 0 budget evidence is invalid")
    if evaluations["tier1"].get("engine") != RAPIER_ENGINE or evaluations["tier1"].get("evidence") != native.get("tier1"):
        raise ValueError("external candidate tier 1 does not bind Rapier evidence")
    tier2 = evaluations["tier2"]
    evidence = tier2.get("evidence")
    if evidence is not None:
        if tier2.get("engine") != f"mujoco/{PINNED_MUJOCO_VERSION}" or tier2.get("engineBacked") is not True:
            raise ValueError("external candidate tier 2 lacks pinned MuJoCo authority")
        if not isinstance(evidence, dict) or evidence.get("engine") != f"mujoco/{PINNED_MUJOCO_VERSION}":
            raise ValueError("external candidate MuJoCo evidence is invalid")
        _exact(
            evidence,
            {
                "engine",
                "engineBacked",
                "controller",
                "trainedPolicy",
                "estimatorOnly",
                "task",
                "episodes",
                "stepsPerEpisode",
                "controlPeriodS",
                "simulatedDurationS",
                "successRate",
                "meanSuccessFraction",
                "meanEnergyWh",
                "meanReward",
                "meanTimeToFirstSuccessS",
                "unsafeEpisodes",
                "meanFinalPositionErrorM",
                "rolloutSha256",
            },
            "external candidate MuJoCo evidence",
        )
        if evidence.get("engineBacked") is not True or evidence.get("trainedPolicy") is not False or evidence.get("estimatorOnly") is not True:
            raise ValueError("external candidate MuJoCo evidence overclaims its controller")
        unsafe_episodes = evidence.get("unsafeEpisodes")
        if (
            evidence.get("controller") != "forge-estimator-teacher-v1"
            or evidence.get("episodes") != 2
            or evidence.get("stepsPerEpisode") != 200
            or evidence.get("controlPeriodS") != 0.02
            or evidence.get("simulatedDurationS") != 8.0
            or isinstance(unsafe_episodes, bool)
            or not isinstance(unsafe_episodes, int)
            or not 0 <= unsafe_episodes <= 2
        ):
            raise ValueError("external candidate MuJoCo protocol drifted")
        task = evidence.get("task")
        if not isinstance(task, dict):
            raise ValueError("external candidate MuJoCo task authority is invalid")
        _exact(task, {"id", "version", "definitionHash"}, "external candidate MuJoCo task")
        definition_hash = task.get("definitionHash")
        if (
            task.get("id") != "hover-hold"
            or task.get("version") != "3.0.0"
            or not isinstance(definition_hash, str)
            or len(definition_hash) != 64
            or any(character not in "0123456789abcdef" for character in definition_hash)
        ):
            raise ValueError("external candidate MuJoCo task authority is invalid")
        digest = evidence.get("rolloutSha256")
        if not isinstance(digest, str) or len(digest) != 64:
            raise ValueError("external candidate MuJoCo rollout digest is invalid")
    tier3 = evaluations["tier3"]
    if tier3.get("pass") is not False or tier3.get("evaluated") is not False or tier3.get("held") is not True:
        raise ValueError("external co-design v1 must hold tier 3")
    metrics = candidate["metrics"]
    tier0_reasons: list[str] = []
    if native["tier0"].get("passed") is not True:
        tier0_reasons.append("sovereign validator rejected the candidate")
    if float(metrics["massG"]) > constraints["maxMassG"]:
        tier0_reasons.append(
            f"mass {float(metrics['massG']):.3f} g exceeds {constraints['maxMassG']:.3f} g"
        )
    tier0_passed = not tier0_reasons
    tier1_reasons = [] if tier0_passed else ["tier0 failed"]
    native_tier1 = native.get("tier1")
    if not isinstance(native_tier1, dict) or native_tier1.get("passed") is not True:
        tier1_reasons.append("real Rapier smoke did not pass")
    tier1_passed = not tier1_reasons
    tier2_reasons = [] if tier1_passed else ["tier1 failed"]
    if evidence is None:
        tier2_reasons.append("MuJoCo rollout was not evaluated")
    else:
        if evidence.get("engineBacked") is not True or evidence.get("unsafeEpisodes") != 0:
            tier2_reasons.append("real MuJoCo rollout was unsafe or lacked engine authority")
        if float(metrics["enduranceMin"]) < constraints["minEnduranceMin"]:
            tier2_reasons.append(
                f"endurance {float(metrics['enduranceMin']):.3f} min is below {constraints['minEnduranceMin']:.3f} min"
            )
        if float(metrics["taskTimeS"]) > constraints["maxTaskTimeS"]:
            tier2_reasons.append(
                f"task time {float(metrics['taskTimeS']):.3f} s exceeds {constraints['maxTaskTimeS']:.3f} s"
            )
        if float(metrics["score"]) < constraints["minScore"]:
            tier2_reasons.append(
                f"score {float(metrics['score']):.3f} is below {constraints['minScore']:.3f}"
            )
    expected_tiers = {
        "tier0": (tier0_passed, tier0_reasons),
        "tier1": (tier1_passed, tier1_reasons),
        "tier2": (not tier2_reasons, tier2_reasons),
    }
    for name, (expected_pass, expected_reasons) in expected_tiers.items():
        if evaluations[name].get("pass") is not expected_pass or evaluations[name].get("reasons") != expected_reasons:
            raise ValueError(f"external candidate {name} verdict drifted from engine and constraint truth")
    expected_admitted = all(expected_tiers[name][0] for name in ("tier0", "tier1", "tier2"))
    admission = candidate.get("admission")
    if not isinstance(admission, dict):
        raise ValueError("external candidate admission is invalid")
    _exact(admission, {"pass", "reasons"}, "external candidate admission")
    if admission.get("pass") is not expected_admitted or candidate.get("admitted") is not expected_admitted:
        raise ValueError("external candidate admission disagrees with the engine ladder")
    expected_reasons = [
        f"{name}: {reason}"
        for name in ("tier0", "tier1", "tier2")
        for reason in evaluations[name]["reasons"]
    ]
    if admission.get("reasons") != expected_reasons:
        raise ValueError("external candidate admission reasons drifted")
    expected_tier = "mujoco-rollout" if evaluations["tier2"]["pass"] else (
        "rapier-smoke" if evaluations["tier1"]["pass"] else "validator-oracle"
    )
    if candidate.get("tier") != expected_tier:
        raise ValueError("external candidate deepest tier drifted")


def _validate_candidate(
    candidate: Any,
    snapshot: dict[str, Any],
    contract: dict[str, Any],
    constraints: dict[str, float],
) -> None:
    if not isinstance(candidate, dict):
        raise ValueError("external co-design candidate must be an object")
    _exact(
        candidate,
        {"id", "patch", "tier", "algorithm", "admitted", "admission", "evaluations", "metrics", "nativeEvaluation", "lineage"},
        "external co-design candidate",
    )
    if not isinstance(candidate.get("id"), str) or not 1 <= len(candidate["id"]) <= 240:
        raise ValueError("external co-design candidate id is invalid")
    patched = _apply_patch(contract, candidate["patch"])
    candidate_hash = _sha(_stable_json(patched))
    patch_hash = _sha(_stable_json(candidate["patch"]))
    lineage = candidate.get("lineage")
    if not isinstance(lineage, dict):
        raise ValueError("external co-design candidate lineage must be an object")
    _exact(
        lineage,
        {
            "baseContractHash",
            "candidateSnapshotSha256",
            "patchSha256",
            "nativeEvaluationSchema",
            "nativeEvaluationSha256",
            "trainingBundleSchema",
            "mujocoRuntime",
            "maturity",
        },
        "external co-design candidate lineage",
    )
    if (
        lineage.get("baseContractHash") != snapshot["contractHash"]
        or lineage.get("candidateSnapshotSha256") != candidate_hash
        or lineage.get("patchSha256") != patch_hash
        or lineage.get("nativeEvaluationSchema")
        != f"{CODESIGN_NATIVE_EVALUATION_SCHEMA}/{CODESIGN_NATIVE_EVALUATION_VERSION}"
        or lineage.get("nativeEvaluationSha256") != _sha(_stable_json(candidate["nativeEvaluation"]))
        or lineage.get("trainingBundleSchema") != "2.0.0"
        or lineage.get("mujocoRuntime") != PINNED_MUJOCO_VERSION
        or lineage.get("maturity") != CONTROLLED_MATURITY
    ):
        raise ValueError("external co-design candidate lineage drifted")
    if candidate.get("algorithm") != CONTROLLED_ALGORITHM:
        raise ValueError("external co-design candidate algorithm drifted")
    _validate_native(candidate["nativeEvaluation"], candidate_hash)
    metrics = candidate.get("metrics")
    if not isinstance(metrics, dict):
        raise ValueError("external co-design candidate metrics must be an object")
    _exact(metrics, {"massG", "enduranceMin", "taskTimeS", "score", "energyWh"}, "external candidate metrics")
    for name, value in metrics.items():
        _finite(value, f"external candidate metric {name}")
    if not 0 <= float(metrics["score"]) <= 1 or min(float(metrics[name]) for name in ("massG", "enduranceMin", "taskTimeS", "energyWh")) < 0:
        raise ValueError("external co-design candidate metrics are outside supported bounds")
    hud = candidate["nativeEvaluation"]["tier0"].get("hud")
    if isinstance(hud, dict):
        if not math.isclose(float(metrics["massG"]), float(hud.get("auwG")), rel_tol=0.0, abs_tol=1e-6) or not math.isclose(
            float(metrics["enduranceMin"]), float(hud.get("enduranceMin")), rel_tol=0.0, abs_tol=1e-6
        ):
            raise ValueError("external co-design candidate metrics drifted from native HUD truth")
    _validate_evaluations(candidate, constraints)
    tier2_evidence = candidate["evaluations"]["tier2"].get("evidence")
    if isinstance(tier2_evidence, dict):
        if any(
            not math.isclose(float(metrics[metric]), float(tier2_evidence[evidence]), rel_tol=0.0, abs_tol=1e-6)
            for metric, evidence in (
                ("score", "meanSuccessFraction"),
                ("taskTimeS", "meanTimeToFirstSuccessS"),
                ("energyWh", "meanEnergyWh"),
            )
        ):
            raise ValueError("external co-design candidate metrics drifted from MuJoCo truth")


def validate_external_result(value: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("external co-design output must be an object")
    _exact(
        value,
        {
            "schemaVersion",
            "artifactKind",
            "provider",
            "cacheKey",
            "source",
            "manifold",
            "constraints",
            "tiers",
            "optimizer",
            "benchmark",
            "candidates",
            "pareto",
            "nonclaims",
        },
        "external co-design output",
    )
    if value.get("schemaVersion") != f"{CODESIGN_EVALUATION_SCHEMA}/{CODESIGN_EVALUATION_VERSION}":
        raise ValueError("external co-design output version is unsupported")
    if value.get("artifactKind") != "codesign":
        raise ValueError("external co-design output artifact kind is invalid")
    if value.get("provider") != CONTROLLED_PROVIDER:
        raise ValueError("external co-design provider identity is invalid")
    if not isinstance(value.get("cacheKey"), str) or not 1 <= len(value["cacheKey"]) <= 240:
        raise ValueError("external co-design cache key is invalid")
    snapshot, contract = _external_snapshot(payload)
    requested_budget = _controlled_budget(payload)
    requested_seed = _controlled_seed(payload, snapshot["contractHash"])
    requested_constraints = _controlled_constraints(payload)
    candidates = value.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != requested_budget:
        raise ValueError("external co-design candidate count is invalid")
    source = value.get("source")
    if not isinstance(source, dict):
        raise ValueError("external co-design source is invalid")
    _exact(
        source,
        {
            "snapshotSchema",
            "modelId",
            "baseContractHash",
            "candidateCount",
            "runtime",
            "sourceRevision",
            "sourceRevisionRecorded",
            "dependencyManifestSha256",
            "maturity",
        },
        "external co-design source",
    )
    if (
        source.get("snapshotSchema") != snapshot["schemaVersion"]
        or source.get("modelId") != snapshot["modelId"]
        or source.get("baseContractHash") != snapshot["contractHash"]
        or source.get("candidateCount") != len(candidates)
        or source.get("runtime") != CONTROLLED_RUNTIME
        or source.get("maturity") != CONTROLLED_MATURITY
    ):
        raise ValueError("external co-design source drifted from the admitted snapshot")
    revision = source.get("sourceRevision")
    if source.get("sourceRevisionRecorded") is not (revision is not None):
        raise ValueError("external co-design source-revision authority drifted")
    if revision is not None and (not isinstance(revision, str) or len(revision) != 40 or any(character not in "0123456789abcdef" for character in revision)):
        raise ValueError("external co-design source revision is invalid")
    dependency_hash = source.get("dependencyManifestSha256")
    if not isinstance(dependency_hash, str) or len(dependency_hash) != 64 or any(
        character not in "0123456789abcdef" for character in dependency_hash
    ):
        raise ValueError("external co-design dependency-manifest digest is invalid")
    ids: set[str] = set()
    for candidate in candidates:
        _validate_candidate(candidate, snapshot, contract, requested_constraints)
        if candidate["id"] in ids:
            raise ValueError("external co-design candidate ids must be unique")
        ids.add(candidate["id"])
    expected_pareto = _pareto(candidates)
    pareto = value.get("pareto")
    if not isinstance(pareto, list) or pareto != expected_pareto:
        raise ValueError("external co-design Pareto front is not recomputed from admitted candidates")
    optimizer = value.get("optimizer")
    benchmark = value.get("benchmark")
    if not isinstance(optimizer, dict):
        raise ValueError("external co-design optimizer is invalid")
    _exact(
        optimizer,
        {
            "algorithm",
            "candidateBudget",
            "seed",
            "engineBacked",
            "tier0BudgetMs",
            "tier2Evaluated",
            "trainingFinalists",
            "overnightComplete",
        },
        "external co-design optimizer",
    )
    if (
        optimizer.get("candidateBudget") != len(candidates)
        or optimizer.get("seed") != requested_seed
        or optimizer.get("algorithm") != CONTROLLED_ALGORITHM
        or optimizer.get("tier0BudgetMs") != TIER0_BUDGET_MS
    ):
        raise ValueError("external co-design optimizer budget drifted")
    if optimizer.get("engineBacked") is not True or optimizer.get("overnightComplete") is not False:
        raise ValueError("external co-design optimizer maturity drifted")
    tier2_count = sum(candidate["evaluations"]["tier2"].get("evidence") is not None for candidate in candidates)
    if optimizer.get("tier2Evaluated") != tier2_count or optimizer.get("trainingFinalists") != 0:
        raise ValueError("external co-design optimizer tier counts drifted")
    if not isinstance(benchmark, dict):
        raise ValueError("external co-design benchmark is invalid")
    _exact(
        benchmark,
        {
            "tier0MaxMs",
            "tier0BudgetMs",
            "tier2CandidateBudget",
            "tier2MeasuredRuntimeHours",
            "engineBacked",
            "controlledSmoke",
            "overnightComplete",
        },
        "external co-design benchmark",
    )
    if benchmark.get("engineBacked") is not True or benchmark.get("controlledSmoke") is not True or benchmark.get("overnightComplete") is not False:
        raise ValueError("external co-design benchmark maturity drifted")
    expected_tier0_max = round(max(float(candidate["evaluations"]["tier0"]["runtimeMs"]) for candidate in candidates), 3)
    expected_tier2_hours = round(
        sum(
            float(candidate["evaluations"]["tier2"]["runtimeMs"])
            for candidate in candidates
            if candidate["evaluations"]["tier2"].get("evidence") is not None
        )
        / 3_600_000.0,
        9,
    )
    if (
        benchmark.get("tier2CandidateBudget") != tier2_count
        or benchmark.get("tier0BudgetMs") != TIER0_BUDGET_MS
        or benchmark.get("tier0MaxMs") != expected_tier0_max
        or not math.isclose(
            _finite(benchmark.get("tier2MeasuredRuntimeHours"), "external co-design measured runtime"),
            expected_tier2_hours,
            rel_tol=0.0,
            abs_tol=1e-9,
        )
    ):
        raise ValueError("external co-design benchmark tier count drifted")
    nonclaims = value.get("nonclaims")
    if not isinstance(nonclaims, dict):
        raise ValueError("external co-design nonclaims drifted")
    _exact(
        nonclaims,
        {
            "cmaEsExecuted",
            "optunaTpeExecuted",
            "overnight200Candidate",
            "trainedFinalist",
            "catalogChoiceSearch",
            "providerSandbox",
            "buildReady",
            "hardwareAuthority",
            "fieldEvidence",
        },
        "external co-design nonclaims",
    )
    if any(nonclaims.get(key) is not False for key in nonclaims):
        raise ValueError("external co-design nonclaims drifted")
    if value.get("manifold") != CONTROLLED_MANIFOLD or value.get("constraints") != requested_constraints:
        raise ValueError("external co-design manifold or constraints drifted")
    identity = {
        "baseContractHash": snapshot["contractHash"],
        "budget": requested_budget,
        "seed": requested_seed,
        "constraints": requested_constraints,
        "grid": CONTROLLED_GRID[:requested_budget],
    }
    expected_cache_key = (
        f"codesign.engine:{snapshot['contractHash'][:16]}:{_sha(_stable_json(identity))[:16]}"
    )
    if value.get("cacheKey") != expected_cache_key:
        raise ValueError("external co-design cache key drifted")
    if not isinstance(value.get("tiers"), list) or value["tiers"] != [
        "validator-oracle",
        "rapier-smoke",
        "mujoco-rollout",
        "training-finalist-held",
    ]:
        raise ValueError("external co-design tier contract drifted")
    return value


def _candidate_budget(payload: dict[str, Any]) -> int:
    raw = payload.get("candidateBudget", payload.get("budget", 24))
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = 24
    return max(3, min(200, value))


def _constraints(payload: dict[str, Any]) -> dict[str, float]:
    raw = payload.get("constraints")
    values = raw if isinstance(raw, dict) else {}

    def number(name: str, default: float) -> float:
        try:
            return float(values.get(name, payload.get(name, default)))
        except (TypeError, ValueError):
            return default

    return {
        "maxMassG": number("maxMassG", 900.0),
        "minEnduranceMin": number("minEnduranceMin", 6.0),
        "maxTaskTimeS": number("maxTaskTimeS", 24.0),
        "minScore": number("minScore", 0.55),
    }


def _search_candidates(base: str, payload: dict[str, Any], budget: int, seed: int, constraints: dict[str, float]) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    colors = ["#39c8ff", "#7dd87d", "#f6c85f", "#f08a8a", "#b48cff", "#f4f4f4"]
    materials = ["satin", "carbon", "nylon-pa12", "petg-cf"]
    id_payload = {key: value for key, value in payload.items() if key not in {"budget", "candidateBudget"}}
    candidates: list[dict[str, Any]] = []
    for index in range(budget):
        family = "cma-es" if index % 3 != 1 else "tpe"
        phase = index / 199
        if family == "cma-es":
            center = 0.48 + 0.22 * math.sin(seed * 0.001 + index * 0.61)
            sigma = max(0.04, 0.24 * (1.0 - phase))
            mass_axis = min(1.0, max(0.0, rng.gauss(center, sigma)))
            capacity_axis = min(1.0, max(0.0, rng.gauss(0.52 + phase * 0.32, sigma * 0.8)))
        else:
            mass_axis = (index % 7) / 6
            capacity_axis = ((index * 5 + seed) % 11) / 10
        speed_axis = min(1.0, max(0.0, 0.2 + 0.65 * rng.random() + 0.15 * phase))
        metrics = _candidate_metrics(mass_axis, capacity_axis, speed_axis)
        evaluations = _tier_evaluations(metrics, constraints, index)
        admission_reasons = _admission_reasons(evaluations)
        admitted = len(admission_reasons) == 0
        tier = _deepest_tier(evaluations, index)
        color = colors[index % len(colors)]
        material = materials[(index + int(capacity_axis * 10)) % len(materials)]
        candidate_id = f"{base}-{family}-{index:03d}-{_digest([id_payload, index, metrics])}"
        candidates.append(
            {
                "id": candidate_id,
                "patch": [
                    {"op": "replace", "path": "/meta/name", "value": f"FORGE co-design {index + 1:03d}"},
                    {"op": "replace", "path": "/parts/0/color", "value": color},
                    {"op": "replace", "path": "/parts/0/material", "value": material},
                ],
                "tier": tier,
                "algorithm": family,
                "admitted": admitted,
                "admission": {"pass": admitted, "reasons": admission_reasons},
                "evaluations": evaluations,
                "metrics": metrics,
            }
        )
    return candidates


def _candidate_metrics(mass_axis: float, capacity_axis: float, speed_axis: float) -> dict[str, float]:
    mass_g = 650 + 165 * mass_axis + 95 * capacity_axis
    endurance_min = 6.1 + 3.6 * capacity_axis - 1.25 * mass_axis
    task_time_s = 24.0 - 7.0 * speed_axis + 2.5 * mass_axis
    score = 0.48 + 0.28 * speed_axis + 0.22 * capacity_axis - 0.08 * mass_axis
    return {
        "massG": round(mass_g, 2),
        "enduranceMin": round(max(3.0, endurance_min), 3),
        "taskTimeS": round(max(8.0, task_time_s), 3),
        "stabilityMargin": round(max(0.0, 0.28 + 0.18 * capacity_axis - 0.12 * mass_axis), 4),
        "score": round(max(0.0, min(1.0, score)), 4),
    }


def _tier_evaluations(metrics: dict[str, float], constraints: dict[str, float], index: int) -> dict[str, dict[str, Any]]:
    tier0_reasons = []
    if metrics["massG"] > constraints["maxMassG"]:
        tier0_reasons.append(f"mass {metrics['massG']:.1f} g exceeds {constraints['maxMassG']:.1f} g")

    tier0 = {
        "pass": not tier0_reasons,
        "runtimeMs": round(6.0 + (index % 9) * 3.7, 3),
        "engine": "forge-validate-native",
        "checks": ["schema", "validator", "static-physics"],
        "reasons": tier0_reasons,
    }

    tier1_reasons = []
    if not tier0["pass"]:
        tier1_reasons.append("tier0 failed")
    if metrics["stabilityMargin"] < 0.18:
        tier1_reasons.append(f"stability margin {metrics['stabilityMargin']:.2f} < 0.18")
    tier1 = {
        "pass": not tier1_reasons,
        "runtimeMs": round(900.0 + (index % 11) * 70.0, 3),
        "engine": "rapier-smoke-fixture",
        "checks": ["drop", "hover-trim", "collision-budget"],
        "reasons": tier1_reasons,
    }

    tier2_reasons = []
    if not tier1["pass"]:
        tier2_reasons.append("tier1 failed")
    if metrics["enduranceMin"] < constraints["minEnduranceMin"]:
        tier2_reasons.append(f"endurance {metrics['enduranceMin']:.2f} min < {constraints['minEnduranceMin']:.2f} min")
    if metrics["taskTimeS"] > constraints["maxTaskTimeS"]:
        tier2_reasons.append(f"task time {metrics['taskTimeS']:.2f} s > {constraints['maxTaskTimeS']:.2f} s")
    if metrics["score"] < constraints["minScore"]:
        tier2_reasons.append(f"score {metrics['score']:.3f} < {constraints['minScore']:.3f}")
    tier2 = {
        "pass": not tier2_reasons,
        "runtimeMs": round(42_000.0 + (index % 13) * 2500.0, 3),
        "engine": "mujoco-rollout-fixture",
        "checks": ["short-rollout", "energy", "course-objective"],
        "reasons": tier2_reasons,
    }

    tier3_reasons = []
    if not tier2["pass"]:
        tier3_reasons.append("tier2 failed")
    if metrics["score"] < constraints["minScore"] + 0.08:
        tier3_reasons.append("below finalist score margin")
    tier3 = {
        "pass": not tier3_reasons,
        "runtimeMs": round(4_800_000.0 + (index % 5) * 540_000.0, 3),
        "engine": "training-finalist-fixture",
        "checks": ["policy-scorecard", "robustness-grid", "energy"],
        "reasons": tier3_reasons,
    }

    return {"tier0": tier0, "tier1": tier1, "tier2": tier2, "tier3": tier3}


def _admission_reasons(evaluations: dict[str, dict[str, Any]]) -> list[str]:
    if evaluations["tier2"]["pass"]:
        return []
    reasons: list[str] = []
    for tier in ("tier0", "tier1", "tier2"):
        reasons.extend(f"{tier}: {reason}" for reason in evaluations[tier]["reasons"])
    return reasons


def _deepest_tier(evaluations: dict[str, dict[str, Any]], index: int) -> str:
    if evaluations["tier3"]["pass"] and index % 4 == 0:
        return "training-finalist"
    if evaluations["tier2"]["pass"]:
        return "mujoco-rollout"
    if evaluations["tier1"]["pass"]:
        return "rapier-smoke"
    return "validator-oracle"


def _pareto(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    front: list[dict[str, Any]] = []
    for candidate in candidates:
        if not candidate.get("admitted"):
            continue
        metrics = candidate["metrics"]
        dominated = False
        for other in candidates:
            if other is candidate:
                continue
            if not other.get("admitted"):
                continue
            om = other["metrics"]
            at_least = om["score"] >= metrics["score"] and om["enduranceMin"] >= metrics["enduranceMin"] and om["massG"] <= metrics["massG"]
            strictly = om["score"] > metrics["score"] or om["enduranceMin"] > metrics["enduranceMin"] or om["massG"] < metrics["massG"]
            if at_least and strictly:
                dominated = True
                break
        if not dominated:
            front.append(candidate)
    return front


@registry.register("codesign.evaluate")
def handle_codesign(job: Job) -> dict[str, Any]:
    return evaluate(job.payload)
