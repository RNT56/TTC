"""Controlled source-bound evidence for the native P7-009 offline trainer."""

from __future__ import annotations

import base64
import hashlib
import json
import math
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

from forge_workers.training.bundle import (
    OFFLINE_TRAINING_TAPE_SCHEMA,
    OFFLINE_TRAINING_TAPE_VERSION,
    compile_training_bundle,
)
from forge_workers.training.jobs import train_offline_bc
from forge_workers.training.offline_dataset import stable_sha256
from forge_workers.training.tasks import task_definition

EVIDENCE_VERSION = "p7-offline-training-evidence/1.0.0"
REQUESTS = (
    ("hover-hold", 173, "vx2-mini", "examples/vx2-mini.forge.json"),
    ("line-follow", 179, "training-rover", "workers/tests/fixtures/rover-training.forge.json"),
)


def run_suite() -> dict[str, Any]:
    root = Path(__file__).resolve().parents[3]
    revision = _source_revision(root)
    clean = not _git(root, "status", "--porcelain")
    if os.getenv("FORGE_REQUIRE_CLEAN_EVIDENCE") == "1" and not clean:
        raise RuntimeError("offline training evidence requires a clean exact-source checkout")
    lockfile_hash = _file_sha256(root / "pnpm-lock.yaml")
    dependency_manifest_hash = _file_sha256(root / "workers" / "pyproject.toml")
    results: dict[str, Any] = {}
    determinism: dict[str, Any] = {}
    requests: list[dict[str, Any]] = []
    previous_command = os.environ.get("FORGE_OFFLINE_RL_CMD")
    os.environ["FORGE_OFFLINE_RL_CMD"] = (
        f"{sys.executable} -m forge_workers.training.offline_runner"
    )
    try:
        for task_id, seed, model_id, relative_path in REQUESTS:
            contract = json.loads((root / relative_path).read_text(encoding="utf-8"))
            contract_json = json.dumps(
                contract,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
                allow_nan=False,
            )
            contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
            request: dict[str, Any] = {
                "jobKind": "caller-cannot-override",
                "modelId": model_id,
                "contractHash": contract_hash,
                "lockfileHash": lockfile_hash,
                "modelSnapshot": {
                    "schemaVersion": "forge-admitted-model-snapshot/1.0.0",
                    "modelId": model_id,
                    "contractHash": contract_hash,
                    "contractJson": contract_json,
                },
                "task": task_id,
                "algorithm": "ppo",
                "recipe": "p7-offline-bc-v1",
                "seed": seed,
                "device": "cpu",
                "timeoutS": 600,
            }
            bundle = compile_training_bundle(request)
            task = task_definition(task_id, curriculum_stage=1)
            tape = _controlled_tape(contract_hash, bundle["tensor"], task)
            request.update(
                {
                    "telemetryLogId": f"controlled-{task_id}-{seed}",
                    "telemetryLogSha256": stable_sha256(tape),
                    "tape": tape,
                }
            )
            result = train_offline_bc(request)
            _validate_result(
                result,
                request,
                task,
                revision=revision,
                lockfile_hash=lockfile_hash,
                dependency_manifest_hash=dependency_manifest_hash,
            )
            repeat = train_offline_bc(request)
            _validate_result(
                repeat,
                request,
                task,
                revision=revision,
                lockfile_hash=lockfile_hash,
                dependency_manifest_hash=dependency_manifest_hash,
            )
            determinism[task_id] = {
                "datasetHash": result["dataset"]["datasetHash"],
                "warmstartParameterDigest": result["policyWarmstart"]["parameterDigest"],
                "onnxSha256": result["onnx"]["sha256"],
                "sameSeedExact": all(
                    (
                        result["dataset"]["datasetHash"]
                        == repeat["dataset"]["datasetHash"],
                        result["policyWarmstart"]["parameterDigest"]
                        == repeat["policyWarmstart"]["parameterDigest"],
                        result["onnx"]["sha256"] == repeat["onnx"]["sha256"],
                    )
                ),
            }
            if determinism[task_id]["sameSeedExact"] is not True:
                raise RuntimeError(f"{task_id} offline training is not same-seed deterministic")
            results[task_id] = result
            requests.append(
                {
                    "modelId": model_id,
                    "contractHash": contract_hash,
                    "task": task_id,
                    "seed": seed,
                    "telemetryLogId": request["telemetryLogId"],
                    "telemetryLogSha256": request["telemetryLogSha256"],
                    "sampleCount": len(tape["frames"]),
                    "captureMaturity": "controlled-synthetic",
                }
            )
    finally:
        if previous_command is None:
            os.environ.pop("FORGE_OFFLINE_RL_CMD", None)
        else:
            os.environ["FORGE_OFFLINE_RL_CMD"] = previous_command

    return {
        "artifactKind": "p7OfflineTrainingEvidence",
        "schemaVersion": EVIDENCE_VERSION,
        "sourceRevision": revision,
        "worktreeClean": clean,
        "maturity": "controlled-synthetic-tape",
        "runtime": "exact-pinned-cpu-mujoco-sb3",
        "requests": requests,
        "results": results,
        "determinism": determinism,
        "nonClaims": [
            "The evidence uses controlled synthetic estimator/action tensors, not recorder, device, lab, or field telemetry.",
            "The 256-step fine-tunes prove the executable BC-to-PPO-to-ONNX path, not learning quality, transfer, deployment, or a passing scorecard.",
            "Only the unchanged p7-scorecard-v1 gate may authorize policy export; blocked policies are an honest outcome.",
        ],
    }


def _controlled_tape(
    contract_hash: str,
    tensor: dict[str, Any],
    task: dict[str, Any],
) -> dict[str, Any]:
    observation_count = int(tensor["input"]["shape"][1])
    action_count = int(tensor["output"]["shape"][1])
    frames = []
    for sample in range(64):
        timestamp = round(sample * 0.02, 6)
        observation = [
            round(0.1 * math.sin(sample * 0.05 + axis * 0.11), 8)
            for axis in range(observation_count)
        ]
        action = [
            round(0.2 * math.tanh(math.cos(sample * 0.07 + axis * 0.19)), 8)
            for axis in range(action_count)
        ]
        frames.append(
            {
                "t": timestamp,
                "state": {"t": timestamp, "observation": observation, "action": action},
            }
        )
    return {
        "schemaVersion": "1.0.0",
        "header": {
            "contractHash": contract_hash,
            "training": {
                "schemaVersion": (
                    f"{OFFLINE_TRAINING_TAPE_SCHEMA}/{OFFLINE_TRAINING_TAPE_VERSION}"
                ),
                "task": {
                    key: task[key]
                    for key in ("id", "suite", "version", "coordinateFrame", "definitionHash")
                },
                "tensor": tensor,
                "observationSource": "estimator-policy-tensor",
                "actionSource": "reviewed-controller-action",
                "captureMaturity": "controlled-synthetic",
            },
        },
        "frames": frames,
    }


def _validate_result(
    result: dict[str, Any],
    request: dict[str, Any],
    task: dict[str, Any],
    *,
    revision: str,
    lockfile_hash: str,
    dependency_manifest_hash: str,
) -> None:
    if result.get("artifactKind") != "policy" or result.get("provider") != "local-sb3-mujoco":
        raise RuntimeError(f"{task['id']} offline evidence did not use the native policy runtime")
    dataset = result.get("dataset")
    warmstart = result.get("policyWarmstart")
    training = result.get("training")
    scorecard = result.get("scorecard")
    if (
        not isinstance(dataset, dict)
        or dataset.get("quality") != "accepted"
        or dataset.get("sourceLogId") != request["telemetryLogId"]
        or dataset.get("sourceLogSha256") != request["telemetryLogSha256"]
        or dataset.get("captureMaturity") != "controlled-synthetic"
        or dataset.get("observationSource") != "estimator-policy-tensor"
        or dataset.get("actionSource") != "reviewed-controller-action"
    ):
        raise RuntimeError(f"{task['id']} offline dataset authority drifted")
    if (
        not isinstance(warmstart, dict)
        or warmstart.get("schemaVersion") != "forge-policy-warmstart/1.0.0"
        or warmstart.get("datasetHash") != dataset.get("datasetHash")
        or warmstart.get("compatible") is not True
    ):
        raise RuntimeError(f"{task['id']} warmstart authority drifted")
    curriculum = training.get("curriculum") if isinstance(training, dict) else None
    if (
        not isinstance(training, dict)
        or training.get("recipe") != "p7-offline-bc-v1"
        or training.get("completedTimesteps") != 256
        or training.get("optimizerUpdated") is not True
        or training.get("truthExposedToPolicy") is not False
        or not isinstance(curriculum, list)
        or [stage.get("kind") for stage in curriculum if isinstance(stage, dict)]
        != ["behavior-cloning", "ppo-randomized-fine-tune"]
    ):
        raise RuntimeError(f"{task['id']} BC-to-PPO execution authority drifted")
    lineage = scorecard.get("lineage") if isinstance(scorecard, dict) else None
    if (
        not isinstance(lineage, dict)
        or lineage.get("contractHash") != request["contractHash"]
        or lineage.get("taskDefinitionHash") != task["definitionHash"]
        or lineage.get("sourceRevision") != revision
        or lineage.get("lockfileHash") != lockfile_hash
        or lineage.get("dependencyManifestHash") != dependency_manifest_hash
        or lineage.get("sourceLogSha256") != request["telemetryLogSha256"]
        or lineage.get("offlineDatasetHash") != dataset.get("datasetHash")
        or lineage.get("warmstartParameterDigest") != warmstart.get("parameterDigest")
    ):
        raise RuntimeError(f"{task['id']} offline policy lineage drifted")
    onnx = result.get("onnx")
    if not isinstance(onnx, dict):
        raise RuntimeError(f"{task['id']} offline policy ONNX is missing")
    model_bytes = base64.b64decode(str(onnx.get("modelBase64", "")), validate=True)
    if (
        not model_bytes
        or len(model_bytes) != onnx.get("byteSize")
        or hashlib.sha256(model_bytes).hexdigest() != onnx.get("sha256")
        or onnx.get("opset") != 18
    ):
        raise RuntimeError(f"{task['id']} offline policy ONNX authority drifted")


def _source_revision(root: Path) -> str:
    checkout = _git(root, "rev-parse", "HEAD")
    revision = os.getenv("FORGE_SOURCE_REVISION", checkout)
    if len(revision) != 40 or any(char not in "0123456789abcdef" for char in revision):
        raise RuntimeError("offline evidence source revision must be a full Git SHA")
    if revision != checkout:
        raise RuntimeError("offline evidence source revision must equal the checkout")
    return revision


def _git(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    json.dump(run_suite(), sys.stdout, sort_keys=True, separators=(",", ":"), allow_nan=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
