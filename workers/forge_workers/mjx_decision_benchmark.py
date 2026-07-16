"""Decision-grade P7-010 three-morphology MuJoCo/MJX benchmark.

This command is deliberately separate from the immutable
``mjxBenchmarkRequest`` 1.0.0 feasibility command.  Version 2 binds all three
required benchmark contracts, the D12 registry identities, reviewed CPU budget
measurements, an external cost source, and a real float64-capable accelerator.
It fails before timing when JAX resolves to CPU/Metal or to a different device.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import sys
from pathlib import Path
from typing import Any, TextIO

from forge_workers.mjx_benchmark import (
    CONTROLLED_PROTOCOL,
    MAX_REQUEST_BYTES,
    PINNED_VERSIONS,
    _configure_solver,
    _cpu_rollout_benchmark,
    _hex,
    _initial_conditions,
    _mjx_rollout_benchmark,
    _parity_check,
    _verify_checkout,
)
from forge_workers.simulation import evaluate_mjx_benchmark_source
from forge_workers.training.bundle import compile_training_bundle

REQUEST_VERSION = "2.0.0"
RESULT_VERSION = "2.0.0"
BUDGET_EVIDENCE_VERSION = "1.0.0"
COST_EVIDENCE_VERSION = "1.0.0"
OVERNIGHT_TARGET_SECONDS = 12 * 60 * 60
TIER2_CANDIDATE_COUNT = 200
TIER2_TARGET_SECONDS = 12 * 60 * 60

CASE_AUTHORITY = {
    "d12-quad": {
        "authorityKind": "d12-simulation-proxy",
        "authorityId": "ref_quad_kakute-h7-source-one-5in",
        "authorityPath": "catalog/reference-rigs/ref_quad_kakute-h7-source-one-5in.json",
        "decisionId": "D12-P3-REFERENCE-RIGS",
        "simulationProxy": True,
        "exactHardwareTwin": False,
        "limitation": "The benchmark contract is a simulation proxy bound to the frozen D12 rig identity; it is not an exact hardware twin or field claim.",
    },
    "d12-rover": {
        "authorityKind": "d12-simulation-proxy",
        "authorityId": "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
        "authorityPath": "catalog/reference-rigs/ref_rover_waveshare-ugv-rover-pt-pi5-ros2.json",
        "decisionId": "D12-P3-REFERENCE-RIGS",
        "simulationProxy": True,
        "exactHardwareTwin": False,
        "limitation": "The benchmark contract is a simulation proxy bound to the frozen D12 rig identity; it is not an exact hardware twin or field claim.",
    },
    "legged": {
        "authorityKind": "controlled-legger-reference",
        "authorityId": "qd-2x2-w040-m2500",
        "authorityPath": "examples/qd-mini.forge.json",
        "decisionId": "D47",
        "simulationProxy": True,
        "exactHardwareTwin": False,
        "limitation": "The benchmark contract is the controlled P7 legged reference; it is not a D12 rig, exact hardware twin, device, or field claim.",
    },
}
REQUIRED_MORPHOLOGIES = tuple(CASE_AUTHORITY)
REPOSITORY_ROOT = Path(__file__).parents[2]


def run_decision_benchmark(payload: dict[str, Any]) -> dict[str, Any]:
    request = validate_decision_request(payload)
    _verify_checkout(request)

    # Heavy packages remain optional and import only at this command boundary.
    import jax  # type: ignore[import-not-found]
    import jax.numpy as jnp  # type: ignore[import-not-found]
    import jaxlib  # type: ignore[import-not-found]
    import mujoco  # type: ignore[import-not-found]
    import numpy as np  # type: ignore[import-not-found]

    with contextlib.redirect_stdout(sys.stderr):
        from mujoco import mjx, rollout  # type: ignore[import-not-found]

    versions = {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "mujoco": mujoco.__version__,
        "mujocoMjx": importlib.metadata.version("mujoco-mjx"),
        "jax": jax.__version__,
        "jaxlib": jaxlib.__version__,
    }
    for name, expected in PINNED_VERSIONS.items():
        if versions[name] != expected:
            raise RuntimeError(
                f"{name} runtime {versions[name]} does not match reviewed pin {expected}"
            )
    if not bool(jax.config.read("jax_enable_x64")):
        raise RuntimeError("JAX_ENABLE_X64=1 is required for MuJoCo/MJX parity")

    devices = _jax_devices(jax)
    accelerator_backend = _require_accelerator(request["requiredAccelerator"], jax, devices)
    budgets = {
        row["morphology"]: row for row in request["budgetEvidence"]["measurements"]
    }
    costs = request["costEvidence"]
    rows: list[dict[str, Any]] = []
    models: list[dict[str, Any]] = []

    for case in request["cases"]:
        bundle = compile_training_bundle(case)
        model = mujoco.MjModel.from_xml_string(bundle["mjcf"])
        if not math.isclose(
            float(model.opt.timestep), float(bundle["timestepS"]), rel_tol=0.0, abs_tol=1e-12
        ):
            raise RuntimeError("compiled MuJoCo timestep does not match the Rust bundle")
        if model.nu <= 0:
            raise RuntimeError(f"{case['morphology']} benchmark model has no actuators")

        protocol = request["protocol"]
        _configure_solver(model, protocol, mujoco)
        initial_states, qvels, controls = _initial_conditions(model, protocol, mujoco, np)
        cpu = _cpu_rollout_benchmark(
            model, initial_states, controls, protocol, mujoco, np, rollout
        )
        accelerator, compiled_rollout, batched_data = _mjx_rollout_benchmark(
            model, qvels, controls, protocol, jax, jnp, mjx, np
        )
        parity = _parity_check(
            model,
            initial_states[0],
            controls[0, : protocol["paritySteps"]],
            compiled_rollout,
            batched_data,
            protocol,
            jax,
            jnp,
            mujoco,
            np,
        )
        budget = budgets[case["morphology"]]
        cpu_cost = costs["cpuHost"]["usdPerHour"]
        accelerator_cost = costs["acceleratorHost"]["usdPerHour"]
        # The native rollout above is the same-host parity reference. Economic
        # comparison uses the separately retained exact CPU-host measurement;
        # applying a cheaper CPU SKU to this accelerator host's CPU timing would
        # fabricate cost-normalized throughput.
        cpu_comparator_steps = budget["cpuMujocoStepsPerS"]
        speedup = accelerator["stepsPerS"] / cpu_comparator_steps
        cost_normalized = speedup * cpu_cost / accelerator_cost
        mjcf_sha = hashlib.sha256(bundle["mjcf"].encode("utf-8")).hexdigest()
        rows.append(
            {
                "morphology": case["morphology"],
                "cpuMujocoStepsPerS": cpu_comparator_steps,
                "mjxStepsPerS": accelerator["stepsPerS"],
                "speedup": round(speedup, 4),
                "costNormalizedThroughput": round(cost_normalized, 4),
                "cpuOvernightTargetHit": budget["cpuTrainingScorecardPassed"]
                and budget["cpuTrainingWallSeconds"] <= OVERNIGHT_TARGET_SECONDS,
                "tier2BudgetMissPct": round(
                    max(
                        0.0,
                        100.0
                        * (budget["cpuTier2WallSeconds"] - TIER2_TARGET_SECONDS)
                        / TIER2_TARGET_SECONDS,
                    ),
                    4,
                ),
                "parityPassed": parity["passed"],
                "parityMaxErrorPct": parity["maxRelativeErrorPct"],
                "sourceBound": True,
                "sourceRevision": request["sourceRevision"],
                "worktreeClean": request["worktreeClean"],
                "contractSha256": case["contractHash"],
                "mjcfSha256": mjcf_sha,
                "requestSha256": request["requestSha256"],
                "acceleratorBackend": accelerator_backend,
                "costEvidence": True,
                "budgetEvidence": True,
                "authorityId": case["authority"]["authorityId"],
                "authoritySha256": case["authority"]["authoritySha256"],
                "budgetArtifactSha256": budget["evidenceArtifactSha256"],
            }
        )
        models.append(
            {
                "id": case["modelSnapshot"]["modelId"],
                "morphology": case["morphology"],
                "archetype": bundle["archetype"],
                "contractSha256": case["contractHash"],
                "mjcfSha256": mjcf_sha,
                "authority": case["authority"],
                "cpu": cpu,
                "mjx": accelerator,
                "parity": parity,
            }
        )

    source = {
        "artifactKind": "mjxDecisionMeasurements",
        "schemaVersion": RESULT_VERSION,
        "provider": "forge-mujoco-mjx-jax",
        "maturity": "sandbox",
        "sourceRevision": request["sourceRevision"],
        "requestSha256": request["requestSha256"],
        "worktreeClean": request["worktreeClean"],
        "runtime": versions,
        "hardware": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "processor": platform.processor() or "unknown",
            "logicalCpuCount": os.cpu_count(),
            "jaxDefaultBackend": jax.default_backend(),
            "jaxDevices": devices,
        },
        "protocol": request["protocol"],
        "models": models,
        "budgetEvidence": request["budgetEvidence"],
        "costEvidence": request["costEvidence"],
        "morphologies": rows,
        "nonClaims": [
            "D12 registry bindings identify benchmark proxies; they do not make the contracts exact hardware twins.",
            "A sandbox benchmark does not establish deployed production, device, field, or external-user maturity.",
            "Decision eligibility does not waive semantic review of the retained budget and provider-cost artifacts.",
        ],
    }
    report = evaluate_mjx_benchmark_source(source)
    if not report["decisionEligible"]:
        return report
    if report["schemaVersion"] != RESULT_VERSION:
        raise RuntimeError("decision report version drifted")
    return report


def validate_decision_request(payload: dict[str, Any]) -> dict[str, Any]:
    expected = {
        "artifactKind",
        "schemaVersion",
        "task",
        "sourceRevision",
        "requestSha256",
        "worktreeClean",
        "maturity",
        "cases",
        "protocol",
        "runtimePins",
        "requiredAccelerator",
        "budgetEvidence",
        "costEvidence",
    }
    if set(payload) != expected:
        raise ValueError("request fields must exactly match mjxDecisionRequest 2.0.0")
    if payload.get("artifactKind") != "mjxDecisionRequest":
        raise ValueError("artifactKind must be 'mjxDecisionRequest'")
    if payload.get("schemaVersion") != REQUEST_VERSION:
        raise ValueError(f"schemaVersion must be {REQUEST_VERSION}")
    if payload.get("task") != "sim.mjx-benchmark":
        raise ValueError("task must be 'sim.mjx-benchmark'")
    if payload.get("maturity") != "sandbox":
        raise ValueError("maturity must be 'sandbox'")
    if payload.get("worktreeClean") is not True:
        raise ValueError("decision evidence requires a clean exact-source checkout")
    _hex(payload.get("sourceRevision"), (40,), "sourceRevision")
    _hex(payload.get("requestSha256"), (64,), "requestSha256")
    if payload.get("runtimePins") != PINNED_VERSIONS:
        raise ValueError("runtimePins do not match the reviewed P7-010 stack")
    if payload.get("protocol") != CONTROLLED_PROTOCOL:
        raise ValueError("protocol does not match frozen decision benchmark 2.0.0")

    accelerator = payload.get("requiredAccelerator")
    if not isinstance(accelerator, dict) or set(accelerator) != {
        "backend",
        "deviceKind",
        "fallbackForbidden",
        "precision",
    }:
        raise ValueError("requiredAccelerator fields are invalid")
    if accelerator.get("backend") not in {"gpu", "tpu"}:
        raise ValueError("requiredAccelerator backend must be gpu or tpu; CPU and Metal are forbidden")
    if not _bounded_string(accelerator.get("deviceKind"), 1, 120):
        raise ValueError("requiredAccelerator deviceKind is invalid")
    if accelerator.get("fallbackForbidden") is not True or accelerator.get("precision") != "float64":
        raise ValueError("accelerator fallback must be forbidden and precision must be float64")

    cases = payload.get("cases")
    if not isinstance(cases, list) or [case.get("morphology") for case in cases if isinstance(case, dict)] != list(REQUIRED_MORPHOLOGIES):
        raise ValueError("cases must contain exact ordered d12-quad, d12-rover, and legged morphologies")
    for case in cases:
        _validate_case(case)
    _validate_budget_evidence(payload.get("budgetEvidence"), payload["sourceRevision"], cases)
    _validate_cost_evidence(payload.get("costEvidence"), payload["sourceRevision"], accelerator)
    for measurement in payload["budgetEvidence"]["measurements"]:
        if measurement["cpuHostSku"] != payload["costEvidence"]["cpuHost"]["sku"]:
            raise ValueError(
                f"{measurement['morphology']} CPU benchmark host does not match costEvidence"
            )

    body = {
        key: value
        for key, value in payload.items()
        if key not in {"sourceRevision", "requestSha256"}
    }
    actual_hash = _sha256_json(body)
    if actual_hash != payload["requestSha256"]:
        raise ValueError("requestSha256 does not match the canonical request payload")
    return payload


def _validate_case(case: Any) -> None:
    if not isinstance(case, dict) or set(case) != {
        "morphology",
        "contractHash",
        "modelSnapshot",
        "authority",
    }:
        raise ValueError("benchmark case fields are invalid")
    morphology = case.get("morphology")
    if morphology not in CASE_AUTHORITY:
        raise ValueError("benchmark case morphology is unsupported")
    _hex(case.get("contractHash"), (64,), "case contractHash")
    snapshot = case.get("modelSnapshot")
    if not isinstance(snapshot, dict) or set(snapshot) != {
        "schemaVersion",
        "modelId",
        "contractHash",
        "contractJson",
    }:
        raise ValueError("modelSnapshot fields are invalid")
    if snapshot.get("schemaVersion") != "forge-admitted-model-snapshot/1.0.0":
        raise ValueError("modelSnapshot schemaVersion is unsupported")
    if snapshot.get("contractHash") != case["contractHash"]:
        raise ValueError("modelSnapshot contractHash does not match its case")
    contract_json = snapshot.get("contractJson")
    if not isinstance(contract_json, str) or hashlib.sha256(contract_json.encode()).hexdigest() != case["contractHash"]:
        raise ValueError("modelSnapshot contractJson hash does not match its case")
    try:
        contract = json.loads(contract_json)
    except json.JSONDecodeError as error:
        raise ValueError("modelSnapshot contractJson is invalid") from error
    if not isinstance(contract, dict) or contract.get("meta", {}).get("id") != snapshot.get("modelId"):
        raise ValueError("modelSnapshot modelId does not match contract meta.id")

    authority = case.get("authority")
    canonical = CASE_AUTHORITY[morphology]
    if not isinstance(authority, dict) or set(authority) != {*canonical, "authoritySha256"}:
        raise ValueError("benchmark authority fields are invalid")
    for key, expected in canonical.items():
        if authority.get(key) != expected:
            raise ValueError(f"{morphology} benchmark authority {key} drifted")
    _hex(authority.get("authoritySha256"), (64,), "authoritySha256")
    authority_path = Path(authority["authorityPath"])
    if authority_path.is_absolute() or ".." in authority_path.parts:
        raise ValueError("benchmark authorityPath must remain repository-relative")
    try:
        authority_bytes = (REPOSITORY_ROOT / authority_path).read_bytes()
    except OSError as error:
        raise ValueError(f"benchmark authority file is unavailable: {authority_path}") from error
    if hashlib.sha256(authority_bytes).hexdigest() != authority["authoritySha256"]:
        raise ValueError(f"{morphology} benchmark authority hash drifted")
    if morphology == "legged":
        try:
            authority_contract = json.loads(authority_bytes)
        except json.JSONDecodeError as error:
            raise ValueError("legged authority contract is invalid") from error
        if _sha256_json(authority_contract) != case["contractHash"]:
            raise ValueError("legged authority must be the exact benchmark contract")


def _validate_budget_evidence(value: Any, revision: str, cases: list[dict[str, Any]]) -> None:
    if not isinstance(value, dict) or set(value) != {
        "artifactKind",
        "schemaVersion",
        "sourceRevision",
        "worktreeClean",
        "overnightTargetSeconds",
        "tier2CandidateCount",
        "tier2TargetSeconds",
        "measurements",
    }:
        raise ValueError("budgetEvidence fields are invalid")
    if value.get("artifactKind") != "p7-mjx-cpu-budget-evidence" or value.get("schemaVersion") != BUDGET_EVIDENCE_VERSION:
        raise ValueError("budgetEvidence identity is unsupported")
    if value.get("sourceRevision") != revision or value.get("worktreeClean") is not True:
        raise ValueError("budgetEvidence must bind the clean benchmark source revision")
    if value.get("overnightTargetSeconds") != OVERNIGHT_TARGET_SECONDS:
        raise ValueError("budgetEvidence overnight target must be 12 hours")
    if value.get("tier2CandidateCount") != TIER2_CANDIDATE_COUNT or value.get("tier2TargetSeconds") != TIER2_TARGET_SECONDS:
        raise ValueError("budgetEvidence tier-2 target must be 200 candidates in 12 hours")
    measurements = value.get("measurements")
    if not isinstance(measurements, list) or [row.get("morphology") for row in measurements if isinstance(row, dict)] != list(REQUIRED_MORPHOLOGIES):
        raise ValueError("budgetEvidence measurements must cover exact ordered required morphologies")
    contract_hashes = {case["morphology"]: case["contractHash"] for case in cases}
    for row in measurements:
        if set(row) != {
            "morphology",
            "contractSha256",
            "trainingRecipe",
            "cpuHostSku",
            "cpuHardwareSha256",
            "cpuBenchmarkProtocolSha256",
            "cpuMujocoStepsPerS",
            "cpuTrainingWallSeconds",
            "cpuTrainingScorecardPassed",
            "cpuTier2WallSeconds",
            "evidenceArtifactSha256",
        }:
            raise ValueError("budgetEvidence measurement fields are invalid")
        morphology = row["morphology"]
        if row.get("contractSha256") != contract_hashes[morphology]:
            raise ValueError(f"{morphology} budget contract hash drifted")
        if not _bounded_string(row.get("trainingRecipe"), 1, 120):
            raise ValueError(f"{morphology} trainingRecipe is invalid")
        if not _bounded_string(row.get("cpuHostSku"), 1, 160):
            raise ValueError(f"{morphology} cpuHostSku is invalid")
        _hex(row.get("cpuHardwareSha256"), (64,), "cpuHardwareSha256")
        if row.get("cpuBenchmarkProtocolSha256") != _sha256_json(CONTROLLED_PROTOCOL):
            raise ValueError(f"{morphology} CPU benchmark protocol hash drifted")
        _positive_finite(row.get("cpuMujocoStepsPerS"), "cpuMujocoStepsPerS")
        _positive_finite(row.get("cpuTrainingWallSeconds"), "cpuTrainingWallSeconds")
        _positive_finite(row.get("cpuTier2WallSeconds"), "cpuTier2WallSeconds")
        if not isinstance(row.get("cpuTrainingScorecardPassed"), bool):
            raise ValueError("cpuTrainingScorecardPassed must be a boolean")
        _hex(row.get("evidenceArtifactSha256"), (64,), "evidenceArtifactSha256")


def _validate_cost_evidence(value: Any, revision: str, accelerator: dict[str, Any]) -> None:
    if not isinstance(value, dict) or set(value) != {
        "artifactKind",
        "schemaVersion",
        "sourceRevision",
        "provider",
        "currency",
        "retrievedAt",
        "sourceUrl",
        "rateOrReceiptSha256",
        "cpuHost",
        "acceleratorHost",
    }:
        raise ValueError("costEvidence fields are invalid")
    if value.get("artifactKind") != "p7-mjx-cost-evidence" or value.get("schemaVersion") != COST_EVIDENCE_VERSION:
        raise ValueError("costEvidence identity is unsupported")
    if value.get("sourceRevision") != revision or value.get("currency") != "USD":
        raise ValueError("costEvidence must bind the benchmark source and USD basis")
    if not _bounded_string(value.get("provider"), 1, 120):
        raise ValueError("costEvidence provider is invalid")
    if not _bounded_string(value.get("retrievedAt"), 20, 40) or not str(value["retrievedAt"]).endswith("Z"):
        raise ValueError("costEvidence retrievedAt must be an explicit UTC timestamp")
    if not _bounded_string(value.get("sourceUrl"), 12, 500) or not str(value["sourceUrl"]).startswith("https://"):
        raise ValueError("costEvidence sourceUrl must be HTTPS")
    _hex(value.get("rateOrReceiptSha256"), (64,), "rateOrReceiptSha256")
    for key in ("cpuHost", "acceleratorHost"):
        host = value.get(key)
        if not isinstance(host, dict) or set(host) != {"sku", "backend", "deviceKind", "usdPerHour"}:
            raise ValueError(f"costEvidence {key} fields are invalid")
        if not _bounded_string(host.get("sku"), 1, 160) or not _bounded_string(host.get("deviceKind"), 1, 120):
            raise ValueError(f"costEvidence {key} identity is invalid")
        _positive_finite(host.get("usdPerHour"), f"{key}.usdPerHour")
    if value["cpuHost"]["backend"] != "cpu":
        raise ValueError("costEvidence cpuHost backend must be cpu")
    if value["acceleratorHost"]["backend"] != accelerator["backend"] or value["acceleratorHost"]["deviceKind"] != accelerator["deviceKind"]:
        raise ValueError("costEvidence accelerator host does not match requiredAccelerator")


def _jax_devices(jax: Any) -> list[dict[str, Any]]:
    return [
        {
            "platform": str(device.platform),
            "kind": str(getattr(device, "device_kind", device)),
            "id": int(device.id),
        }
        for device in jax.devices()
    ]


def _require_accelerator(required: dict[str, Any], jax: Any, devices: list[dict[str, Any]]) -> str:
    resolved = str(jax.default_backend())
    if resolved != required["backend"]:
        raise RuntimeError(
            f"required JAX backend {required['backend']} resolved as {resolved}; fallback is forbidden"
        )
    matching = [device for device in devices if device["platform"] == resolved]
    if not matching or not any(
        required["deviceKind"].casefold() in device["kind"].casefold() for device in matching
    ):
        raise RuntimeError("resolved JAX device kind does not match requiredAccelerator")
    if resolved not in {"gpu", "tpu"}:
        raise RuntimeError("P7-010 decision evidence requires CUDA/ROCm GPU or TPU execution")
    return resolved


def _positive_finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or float(value) <= 0:
        raise ValueError(f"{label} must be a positive finite number")
    return float(value)


def _bounded_string(value: Any, minimum: int, maximum: int) -> bool:
    return isinstance(value, str) and minimum <= len(value) <= maximum and "\x00" not in value


def _sha256_json(value: Any) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def main(
    stdin: TextIO = sys.stdin,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
) -> int:
    try:
        raw = stdin.read(MAX_REQUEST_BYTES + 1)
        if not raw or len(raw.encode("utf-8")) > MAX_REQUEST_BYTES:
            raise ValueError("MJX decision request is empty or exceeds 2 MiB")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("MJX decision request must be one JSON object")
        result = run_decision_benchmark(payload)
        json.dump(result, stdout, sort_keys=True, separators=(",", ":"), allow_nan=False)
        stdout.write("\n")
        return 0
    except Exception as error:  # noqa: BLE001 - fail-closed command boundary.
        print(f"forge-mjx-decision-benchmark: {error}", file=stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
