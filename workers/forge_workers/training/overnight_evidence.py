"""Strict, resumable P7-012 consumer-hardware evidence runner."""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import platform
import subprocess
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Callable

import torch

from forge_workers.training.bundle import SNAPSHOT_SCHEMA, compile_training_bundle
from forge_workers.training.sb3_training import (
    EXACT_RUNTIME,
    OVERNIGHT_RECIPE,
    train_sb3_policy,
)
from forge_workers.training.scorecard import DEFAULT_MIN_ROBUST, DEFAULT_MIN_SUCCESS

EVIDENCE_VERSION = "p7-overnight-evidence/1.0.0"
TASKS = (("hover-hold", 1201), ("waypoint-chain", 1207))


def run_suite(
    *,
    output_dir: Path,
    power_upper_bound_watts: float,
    resume: bool,
    interrupt_after: str | None = None,
    trainer: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]] = train_sb3_policy,
    bundle: dict[str, Any] | None = None,
    source_revision: str | None = None,
    hardware: dict[str, Any] | None = None,
    require_clean: bool = True,
) -> dict[str, Any]:
    if not 1.0 <= power_upper_bound_watts <= 2_000.0:
        raise ValueError("power upper bound must be finite in [1, 2000] watts")
    root = Path(__file__).resolve().parents[3]
    revision = source_revision or _source_revision(root, require_clean=require_clean)
    host = hardware or _safe_hardware()
    frozen = {
        "schemaVersion": EVIDENCE_VERSION,
        "sourceRevision": revision,
        "recipe": OVERNIGHT_RECIPE,
        "tasks": [{"task": task, "seed": seed} for task, seed in TASKS],
        "thresholds": {"minSuccess": DEFAULT_MIN_SUCCESS, "minRobustness": DEFAULT_MIN_ROBUST},
        "runtime": EXACT_RUNTIME,
        "hardware": host,
        "trainingDevice": "cpu",
        "powerUpperBound": {
            "watts": power_upper_bound_watts,
            "method": "operator-declared-adapter-rating-times-wall-time",
            "measured": False,
        },
    }
    request_hash = _digest_json(frozen)
    output_dir.mkdir(parents=True, exist_ok=True)
    suite_path = output_dir / "suite.json"
    existing_suite = _read_json(suite_path) if resume and suite_path.is_file() else None
    if existing_suite is not None and existing_suite.get("requestHash") != request_hash:
        raise RuntimeError("resume evidence request does not match the frozen suite")

    if bundle is None:
        bundle = _bundle(root)
    reused: list[str] = []
    completed: list[dict[str, Any]] = []
    suite_started = time.monotonic()
    os.environ["FORGE_SOURCE_REVISION"] = revision
    for task, seed in TASKS:
        task_hash = _digest_json({"suiteRequestHash": request_hash, "task": task, "seed": seed})
        task_json = output_dir / f"{task}.json"
        task_onnx = output_dir / f"{task}.onnx"
        checkpoint = _reusable_checkpoint(task_json, task_onnx, task_hash) if resume else None
        if checkpoint is not None:
            reused.append(task)
            completed.append(checkpoint)
            continue
        started = time.monotonic()
        result = trainer(
            {
                "task": task,
                "algorithm": "ppo",
                "recipe": "p7-overnight-v1",
                "seed": seed,
                "evalEpisodes": 8,
                "device": "cpu",
            },
            bundle,
        )
        wall_time_s = time.monotonic() - started
        _assert_passing_result(result, task, seed, revision)
        model_base64 = result["onnx"].pop("modelBase64")
        model_bytes = base64.b64decode(model_base64, validate=True)
        _atomic_bytes(task_onnx, model_bytes)
        host_energy_upper_bound_wh = power_upper_bound_watts * wall_time_s / 3_600.0
        checkpoint = {
            "schemaVersion": EVIDENCE_VERSION,
            "requestHash": task_hash,
            "suiteRequestHash": request_hash,
            "task": task,
            "seed": seed,
            "sourceRevision": revision,
            "generatedAt": datetime.now(UTC).isoformat(),
            "wallTimeS": wall_time_s,
            "hostEnergy": {
                "upperBoundWh": host_energy_upper_bound_wh,
                "watts": power_upper_bound_watts,
                "method": "operator-declared-adapter-rating-times-wall-time",
                "measured": False,
                "nonClaim": "No privileged host-energy sampler was available; this is a conservative upper bound, not consumption telemetry.",
            },
            "cost": {
                "providerCostUsd": 0.0,
                "providerCostBasis": "locally owned hardware; no metered compute provider",
                "electricityCost": None,
                "nonClaim": "No electricity tariff or measured host consumption is asserted.",
            },
            "hardware": host,
            "policy": result,
        }
        _atomic_json(task_json, checkpoint)
        completed.append(checkpoint)
        if interrupt_after == task:
            raise RuntimeError(f"intentional evidence interruption after {task}")

    summary = {
        **frozen,
        "requestHash": request_hash,
        "generatedAt": datetime.now(UTC).isoformat(),
        "wallTimeS": time.monotonic() - suite_started,
        "status": "passed",
        "recovery": {
            "resumeRequested": resume,
            "reusedTasks": reused,
            "atomicTaskCheckpoints": True,
            "checkpointValidation": "request hash plus ONNX byte count and SHA-256",
        },
        "results": [
            {
                "task": row["task"],
                "seed": row["seed"],
                "policySha256": row["policy"]["onnx"]["sha256"],
                "scorecard": row["policy"]["scorecard"],
                "wallTimeS": row["wallTimeS"],
                "hostEnergy": row["hostEnergy"],
                "cost": row["cost"],
            }
            for row in completed
        ],
        "nonClaims": [
            "This is controlled consumer-hardware simulation evidence, not deployed GPU, external-user, real-device, or field proof.",
            "The Apple GPU is inventoried, but PPO runs on CPU because exact-host measurement found MPS slower for this MLP workload.",
            "Policy scorecard energy is simulated vehicle energy; host energy is reported separately only as a conservative upper bound.",
        ],
    }
    _atomic_json(suite_path, summary)
    return summary


def _assert_passing_result(result: dict[str, Any], task: str, seed: int, revision: str) -> None:
    scorecard = result.get("scorecard")
    training = result.get("training")
    onnx = result.get("onnx")
    if not isinstance(scorecard, dict) or scorecard.get("exportable") is not True:
        raise RuntimeError(f"{task} did not pass p7-scorecard-v1")
    if scorecard.get("successRate", 0.0) < DEFAULT_MIN_SUCCESS:
        raise RuntimeError(f"{task} success rate is below the frozen threshold")
    robustness = scorecard.get("robustness")
    if not isinstance(robustness, dict) or min(robustness.values(), default=0.0) < DEFAULT_MIN_ROBUST:
        raise RuntimeError(f"{task} robustness is below the frozen threshold")
    lineage = scorecard.get("lineage")
    if not isinstance(lineage, dict) or lineage.get("sourceRevision") != revision or lineage.get("seed") != str(seed):
        raise RuntimeError(f"{task} lineage is not bound to the frozen source and seed")
    if not isinstance(training, dict) or training.get("recipe") != "p7-overnight-v1":
        raise RuntimeError(f"{task} did not execute the frozen overnight recipe")
    if training.get("device") != "cpu" or training.get("truthExposedToPolicy") is not False:
        raise RuntimeError(f"{task} device or estimator authority drifted")
    if not isinstance(onnx, dict) or not isinstance(onnx.get("modelBase64"), str):
        raise RuntimeError(f"{task} did not retain exact ONNX bytes")
    model = base64.b64decode(onnx["modelBase64"], validate=True)
    if len(model) != onnx.get("byteSize") or hashlib.sha256(model).hexdigest() != onnx.get("sha256"):
        raise RuntimeError(f"{task} ONNX bytes do not match their size and digest")


def _reusable_checkpoint(json_path: Path, onnx_path: Path, request_hash: str) -> dict[str, Any] | None:
    if not json_path.is_file() or not onnx_path.is_file():
        return None
    row = _read_json(json_path)
    if row.get("requestHash") != request_hash:
        return None
    policy = row.get("policy")
    onnx = policy.get("onnx") if isinstance(policy, dict) else None
    if not isinstance(onnx, dict):
        return None
    model = onnx_path.read_bytes()
    if len(model) != onnx.get("byteSize") or hashlib.sha256(model).hexdigest() != onnx.get("sha256"):
        return None
    scorecard = policy.get("scorecard")
    return row if isinstance(scorecard, dict) and scorecard.get("exportable") is True else None


def _bundle(root: Path) -> dict[str, Any]:
    contract_json = (root / "examples" / "vx2-mini.forge.json").read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    return compile_training_bundle(
        {
            "contractHash": contract_hash,
            "modelSnapshot": {
                "schemaVersion": SNAPSHOT_SCHEMA,
                "modelId": "vx2-mini",
                "contractHash": contract_hash,
                "contractJson": contract_json,
            },
        }
    )


def _source_revision(root: Path, *, require_clean: bool) -> str:
    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True, timeout=10
    ).stdout.strip()
    if len(revision) != 40 or any(char not in "0123456789abcdef" for char in revision):
        raise RuntimeError("evidence source revision is not an exact Git commit")
    if require_clean:
        status = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=no"],
            cwd=root,
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        ).stdout.strip()
        if status:
            raise RuntimeError("overnight evidence requires a clean tracked source checkout")
    return revision


def _safe_hardware() -> dict[str, Any]:
    result: dict[str, Any] = {
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "cpuLogicalCount": os.cpu_count(),
    }
    if platform.system() == "Darwin":
        completed = subprocess.run(
            ["system_profiler", "SPHardwareDataType", "-json"],
            capture_output=True,
            text=True,
            check=True,
            timeout=30,
        )
        rows = json.loads(completed.stdout).get("SPHardwareDataType", [])
        row = rows[0] if isinstance(rows, list) and rows else {}
        safe_keys = {
            "machine_name": "machineName",
            "machine_model": "modelIdentifier",
            "chip_type": "chip",
            "number_processors": "processorDescription",
            "physical_memory": "memory",
        }
        result.update(
            {target: row[source] for source, target in safe_keys.items() if isinstance(row.get(source), str)}
        )
    if torch.backends.mps.is_built() or torch.backends.mps.is_available():
        name_fn = getattr(torch.backends.mps, "get_name", None)
        cores_fn = getattr(torch.backends.mps, "get_core_count", None)
        result["accelerator"] = {
            "backend": "mps",
            "name": name_fn() if callable(name_fn) else "Apple Metal GPU",
            "coreCount": cores_fn() if callable(cores_fn) else None,
            "built": torch.backends.mps.is_built(),
            "available": torch.backends.mps.is_available(),
        }
    return result


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    encoded = json.dumps(value, allow_nan=False, indent=2, sort_keys=True).encode("utf-8") + b"\n"
    _atomic_bytes(path, encoded)


def _atomic_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as handle:
        handle.write(value)
        handle.flush()
        os.fsync(handle.fileno())
        temporary = Path(handle.name)
    temporary.replace(path)


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"evidence document {path.name} is not an object")
    return value


def _digest_json(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, allow_nan=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--power-upper-bound-watts", type=float, required=True)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--interrupt-after", choices=[task for task, _ in TASKS])
    args = parser.parse_args()
    summary = run_suite(
        output_dir=args.output_dir,
        power_upper_bound_watts=args.power_upper_bound_watts,
        resume=args.resume,
        interrupt_after=args.interrupt_after,
    )
    print(json.dumps(summary, allow_nan=False, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
