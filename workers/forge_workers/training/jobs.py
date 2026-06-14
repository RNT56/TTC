"""Fixture-backed training workers (P7/P8).

SB3, MuJoCo, ONNX export, and system-ID can be installed per deployment image.
The local handler contract is deterministic and gates policy export through the
same scorecard object used by tests.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import configured_gpu_adapter
from forge_workers.queue import Job, registry
from forge_workers.training.scorecard import Scorecard, gate
from forge_workers.training.tasks import task_definition


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def train_policy(payload: dict[str, Any]) -> dict[str, Any]:
    task = str(payload.get("task", "hover-hold"))
    contract_hash = str(payload.get("contractHash", "00" * 32))
    seed = str(payload.get("seed", "0"))
    curriculum_stage = int(payload.get("curriculumStage", 1))
    horizon_s = float(payload.get("horizonS", task_definition(task)["horizonS"]))
    task_meta = task_definition(task, curriculum_stage=curriculum_stage, horizon_s=horizon_s)
    resolved_task = str(task_meta["id"])
    external = run_json_command(
        "FORGE_SB3_TRAIN_CMD",
        {"task": "train.policy", **payload},
        timeout_s=float(payload.get("timeoutS", 12 * 3600)),
    )
    if external is not None:
        if external.get("artifactKind") == "policy":
            return external
        scorecard = external.get("scorecard") if isinstance(external.get("scorecard"), dict) else {}
        exportable = bool(scorecard.get("exportable", external.get("exportable", False))) if isinstance(scorecard, dict) else False
        return {
            "artifactKind": "policy",
            "provider": external.get("provider", "external-sb3"),
            "algorithm": external.get("algorithm", payload.get("algorithm", "ppo")),
            "task": external.get("task", task_meta),
            "io": external.get(
                "io",
                {
                    "observations": external.get("observations", []),
                    "actions": external.get("actions", []),
                    "onnxHeader": external.get(
                        "onnxHeader",
                        {"contractHash": contract_hash, "task": resolved_task, "observationCount": "0", "actionCount": "0"},
                    ),
                },
            ),
            "domainRandomization": external.get("domainRandomization", payload.get("domainRandomization", {})),
            "onnx": external.get("onnx", {"cacheKey": external.get("cacheKey", f"external-sb3:{contract_hash[:12]}"), "opset": 18, "fixture": False}),
            "scorecard": {
                **scorecard,
                "task": scorecard.get("task", resolved_task) if isinstance(scorecard, dict) else resolved_task,
                "taskVersion": scorecard.get("taskVersion", payload.get("taskVersion", task_meta["version"])) if isinstance(scorecard, dict) else task_meta["version"],
                "lineage": scorecard.get("lineage", {"contractHash": contract_hash, "seed": seed, "codeVersion": external.get("codeVersion", "external-sb3")}) if isinstance(scorecard, dict) else {},
                "exportable": exportable,
                "reasons": scorecard.get("reasons", [] if exportable else ["external scorecard did not mark policy exportable"]) if isinstance(scorecard, dict) else [],
            },
        }
    gpu = configured_gpu_adapter().run("train.policy", payload)
    card = Scorecard(
        task=resolved_task,
        task_version=str(payload.get("taskVersion", task_meta["version"])),
        success_rate=float(payload.get("successRate", 0.91)),
        robustness={
            "mass+15%": float(payload.get("massRobustness", 0.84)),
            "kv-8%": float(payload.get("kvRobustness", 0.88)),
            "wind4ms": float(payload.get("windRobustness", 0.79)),
        },
        energy_wh=float(payload.get("energyWh", 2.2)),
        trained_on_estimator=bool(payload.get("trainedOnEstimator", True)),
        lineage={"contractHash": contract_hash, "seed": seed, "codeVersion": "fixture-p7-v1"},
    )
    result = gate(card)
    observations = [
        "estimator.attitude",
        "estimator.angularRate",
        "target.error",
        "battery.normalizedVoltage",
        "powertrain.motorCurrent",
    ]
    actions = payload.get("actions") or ["throttle", "roll", "pitch", "yaw"]
    randomization = payload.get(
        "domainRandomization",
        {
            "massPct": 15,
            "kvPct": 8,
            "sagPct": 20,
            "latencyMs": [0, 30],
            "friction": [0.4, 1.2],
            "windMps": [0, 4],
            "obsDropoutPct": [0, 5],
        },
    )
    return {
        "artifactKind": "policy",
        "provider": gpu["provider"],
        "algorithm": str(payload.get("algorithm", "ppo-fixture")),
        "task": task_meta,
        "io": {
            "observations": observations,
            "actions": actions,
            "onnxHeader": {
                "contractHash": contract_hash,
                "task": resolved_task,
                "observationCount": str(len(observations)),
                "actionCount": str(len(actions)),
            },
        },
        "domainRandomization": randomization,
        "onnx": {"cacheKey": gpu["cacheKey"], "opset": 18, "fixture": True, "path": f"{gpu['cacheKey']}/policy.onnx"},
        "scorecard": {
            "task": card.task,
            "taskVersion": card.task_version,
            "successRate": card.success_rate,
            "robustness": card.robustness,
            "energyWh": card.energy_wh,
            "lineage": card.lineage,
            "exportable": result.exportable,
            "reasons": result.reasons,
        },
}


def train_offline_bc(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_OFFLINE_RL_CMD",
        {"task": "train.offline-bc", **payload},
        timeout_s=float(payload.get("timeoutS", 3600)),
    )
    if external is not None:
        if external.get("artifactKind") == "offline-learning":
            return external
        return {
            "artifactKind": "offline-learning",
            "provider": external.get("provider", "external-offline-rl"),
            "algorithm": external.get("algorithm", payload.get("algorithm", "behavior-cloning")),
            "task": external.get("task", task_definition(str(payload.get("task", "hover-hold")))),
            "dataset": external.get("dataset", {}),
            "policyWarmstart": external.get("policyWarmstart", {}),
            "scorecard": external.get("scorecard", {"exportable": False, "reasons": ["external offline trainer did not return a scorecard"]}),
            "rejectReason": external.get("rejectReason"),
        }

    task = str(payload.get("task", "hover-hold"))
    task_meta = task_definition(task)
    resolved_task = str(task_meta["id"])
    frames = _telemetry_frames(payload)
    sorted_frames = sorted(frames, key=lambda frame: float(frame.get("t", frame.get("timeS", 0.0))))
    was_sorted = frames == sorted_frames
    observation_columns = sorted(_matching_columns(sorted_frames, ("estimator.", "target.", "battery.", "imu.", "pose.", "velocity.")))
    action_columns = sorted(_matching_columns(sorted_frames, ("action.", "stick.", "motor.", "cmd.")))
    sample_count = len(sorted_frames)
    duration_s = _duration_s(sorted_frames)
    accepted = sample_count >= 3 and bool(action_columns)
    reasons = [] if accepted else ["offline BC requires at least 3 frames with action columns"]
    if not was_sorted:
        reasons.append("input frames were sorted by timestamp before dataset build")
    contract_hash = str(payload.get("contractHash", "00" * 32))
    seed = str(payload.get("seed", "0"))
    cache_key = f"offline-bc:{_digest({'task': resolved_task, 'contractHash': contract_hash, 'frames': sorted_frames})}"
    return {
        "artifactKind": "offline-learning",
        "provider": "fixture-offline-bc",
        "algorithm": str(payload.get("algorithm", "behavior-cloning-fixture")),
        "task": task_meta,
        "dataset": {
            "sampleCount": sample_count,
            "durationS": duration_s,
            "sorted": True,
            "sourceLogId": payload.get("telemetryLogId"),
            "observationColumns": observation_columns,
            "actionColumns": action_columns,
            "quality": "accepted" if accepted else "held",
        },
        "policyWarmstart": {
            "cacheKey": cache_key,
            "format": "behavior-cloning-dataset-v1",
            "compatible": accepted,
        },
        "scorecard": {
            "task": resolved_task,
            "taskVersion": task_meta["version"],
            "exportable": False,
            "reasons": ["offline BC warmstart requires live fine-tune before export"],
            "lineage": {"contractHash": contract_hash, "seed": seed, "codeVersion": "fixture-p7-bc-v1"},
        },
        "rejectReason": None if accepted else reasons[0],
        "notes": reasons,
    }


def _telemetry_frames(payload: dict[str, Any]) -> list[dict[str, Any]]:
    tape = payload.get("tape")
    if isinstance(tape, dict) and isinstance(tape.get("frames"), list):
        rows = tape["frames"]
    elif isinstance(payload.get("frames"), list):
        rows = payload["frames"]
    else:
        rows = []
    return [row for row in rows if isinstance(row, dict)]


def _matching_columns(frames: list[dict[str, Any]], prefixes: tuple[str, ...]) -> set[str]:
    out: set[str] = set()
    for frame in frames:
        for key in _flatten_keys(frame):
            if key in {"t", "timeS"}:
                continue
            if key.startswith(prefixes):
                out.add(key)
    return out


def _flatten_keys(value: dict[str, Any], prefix: str = "") -> list[str]:
    keys: list[str] = []
    for key, raw in value.items():
        current = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(raw, dict):
            keys.extend(_flatten_keys(raw, current))
        else:
            keys.append(current)
    return keys


def _duration_s(frames: list[dict[str, Any]]) -> float:
    if len(frames) < 2:
        return 0.0
    start = float(frames[0].get("t", frames[0].get("timeS", 0.0)))
    end = float(frames[-1].get("t", frames[-1].get("timeS", start)))
    return round(max(0.0, end - start), 3)


def fit_sysid(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_SYSID_FIT_CMD",
        {"task": "train.sysid-fit", **payload},
        timeout_s=float(payload.get("timeoutS", 1800)),
    )
    if external is not None:
        if external.get("artifactKind") == "sysid":
            return external
        return {
            "artifactKind": "sysid",
            "sampleCount": external.get("sampleCount", len(payload.get("samples", [])) if isinstance(payload.get("samples"), list) else 0),
            "fit": external.get("fit", {}),
            "simPatch": external.get("simPatch", []),
            "rejectReason": external.get("rejectReason"),
        }
    samples = payload.get("samples", [])
    sample_count = len(samples) if isinstance(samples, list) else 0
    accepted = sample_count >= 3
    sag_errors: list[float] = []
    current_values: list[float] = []
    sample_rows = samples if isinstance(samples, list) else []
    for sample in sample_rows:
        if not isinstance(sample, dict):
            continue
        voltage = float(sample.get("voltageV", payload.get("nominalVoltageV", 16.8)))
        current = float(sample.get("currentA", 0))
        nominal = float(payload.get("nominalVoltageV", 16.8))
        if current > 0:
            sag_errors.append(max(0.0, nominal - voltage))
            current_values.append(current)
    r_int_mohm = None
    if current_values:
        r_int_mohm = sum((sag / current) * 1000 for sag, current in zip(sag_errors, current_values)) / len(current_values)
    return {
        "artifactKind": "sysid",
        "sampleCount": sample_count,
        "fit": {
            "batterySagRmse": 0.041 if accepted else None,
            "currentRmseA": 1.2 if accepted else None,
            "rIntMohm": r_int_mohm,
            "frictionScale": float(payload.get("frictionScale", 1.0)),
            "timeConstantMs": float(payload.get("timeConstantMs", 45.0)),
            "accepted": accepted,
        },
        "simPatch": [{"op": "replace", "path": "/sim/battery/r_int_mohm", "value": round(r_int_mohm, 3)}] if accepted and r_int_mohm is not None else [],
        "rejectReason": None if accepted else "system-ID requires at least 3 telemetry samples",
    }


@registry.register("train.policy")
def handle_train_policy(job: Job) -> dict[str, Any]:
    return train_policy(job.payload)


@registry.register("train.offline-bc")
def handle_offline_bc(job: Job) -> dict[str, Any]:
    return train_offline_bc(job.payload)


@registry.register("train.sysid-fit")
def handle_sysid(job: Job) -> dict[str, Any]:
    return fit_sysid(job.payload)
