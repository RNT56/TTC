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
from forge_workers.training.scorecard import DEFAULT_MIN_ROBUST, DEFAULT_MIN_SUCCESS, Scorecard, gate
from forge_workers.training.tasks import course_task_definition, task_definition


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def train_policy(payload: dict[str, Any]) -> dict[str, Any]:
    contract_hash = str(payload.get("contractHash", "00" * 32))
    seed = str(payload.get("seed", "0"))
    task_meta = _task_meta(payload)
    resolved_task = str(task_meta["id"])
    external = run_json_command(
        "FORGE_SB3_TRAIN_CMD",
        {"task": "train.policy", **payload},
        timeout_s=float(payload.get("timeoutS", 12 * 3600)),
    )
    if external is not None:
        return _external_policy_result(external, payload, task_meta, resolved_task, contract_hash, seed)
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
        "onnx": {
            "cacheKey": gpu["cacheKey"],
            "opset": 18,
            "fixture": True,
            "path": f"{gpu['cacheKey']}/policy.onnx",
            "exportable": result.exportable,
        },
        "exportGate": "exportable" if result.exportable else "blocked",
        "scorecard": _scorecard_payload(card, result.reasons, result.exportable),
    }


def _task_meta(payload: dict[str, Any]) -> dict[str, Any]:
    course = payload.get("course") if isinstance(payload.get("course"), dict) else {}
    env_spec = payload.get("envSpec") if isinstance(payload.get("envSpec"), dict) else course.get("envSpec")
    curriculum_stage = int(payload.get("curriculumStage", 1))
    horizon_s = _number(payload.get("horizonS"), None)
    if isinstance(env_spec, dict):
        return course_task_definition(
            env_spec,
            course_id=str(course.get("id", payload.get("courseId"))) if course.get("id") or payload.get("courseId") else None,
            curriculum_stage=curriculum_stage,
            horizon_s=horizon_s,
            archetype=str(payload.get("archetype")) if payload.get("archetype") else None,
        )
    task = str(payload.get("task", "hover-hold"))
    base = task_definition(task)
    return task_definition(task, curriculum_stage=curriculum_stage, horizon_s=horizon_s if horizon_s is not None else float(base["horizonS"]))


def _external_policy_result(
    external: dict[str, Any],
    payload: dict[str, Any],
    task_meta: dict[str, Any],
    resolved_task: str,
    contract_hash: str,
    seed: str,
) -> dict[str, Any]:
    raw_scorecard = external.get("scorecard") if isinstance(external.get("scorecard"), dict) else {}
    lineage = _string_dict(
        raw_scorecard.get(
            "lineage",
            external.get("lineage", {"contractHash": contract_hash, "seed": seed, "codeVersion": external.get("codeVersion", "external-sb3")}),
        )
    )
    card = Scorecard(
        task=str(raw_scorecard.get("task", external.get("taskId", resolved_task))),
        task_version=str(raw_scorecard.get("taskVersion", payload.get("taskVersion", task_meta["version"]))),
        success_rate=_number(raw_scorecard.get("successRate", external.get("successRate")), 0.0),
        robustness=_robustness(raw_scorecard.get("robustness", external.get("robustness"))),
        energy_wh=_number(raw_scorecard.get("energyWh", external.get("energyWh")), 0.0),
        trained_on_estimator=_bool(raw_scorecard.get("trainedOnEstimator", external.get("trainedOnEstimator")), False),
        lineage=lineage,
    )
    gate_result = gate(card)
    provider_reasons = _provider_reasons(raw_scorecard, external)
    reasons = [*gate_result.reasons, *provider_reasons]
    exportable = gate_result.exportable and not provider_reasons
    onnx = external.get("onnx") if isinstance(external.get("onnx"), dict) else {}
    onnx_payload = {
        "cacheKey": onnx.get("cacheKey", external.get("cacheKey", f"external-sb3:{contract_hash[:12]}")),
        "opset": onnx.get("opset", 18),
        "fixture": False,
        "path": onnx.get("path"),
        "exportable": exportable,
    }
    return {
        "artifactKind": "policy",
        "provider": external.get("provider", "external-sb3"),
        "algorithm": external.get("algorithm", payload.get("algorithm", "ppo")),
        "task": external.get("task", task_meta) if isinstance(external.get("task"), dict) else task_meta,
        "io": _external_io(external, contract_hash, resolved_task),
        "domainRandomization": external.get("domainRandomization", payload.get("domainRandomization", {})),
        "onnx": onnx_payload,
        "exportGate": "exportable" if exportable else "blocked",
        "scorecard": _scorecard_payload(card, reasons, exportable),
    }


def _scorecard_payload(card: Scorecard, reasons: list[str], exportable: bool) -> dict[str, Any]:
    return {
        "schemaVersion": "p7-scorecard-v1",
        "task": card.task,
        "taskVersion": card.task_version,
        "successRate": card.success_rate,
        "robustness": card.robustness,
        "energyWh": card.energy_wh,
        "trainedOnEstimator": card.trained_on_estimator,
        "lineage": card.lineage,
        "thresholds": {"minSuccess": DEFAULT_MIN_SUCCESS, "minRobustness": DEFAULT_MIN_ROBUST},
        "exportable": exportable,
        "reasons": reasons,
    }


def _external_io(external: dict[str, Any], contract_hash: str, resolved_task: str) -> dict[str, Any]:
    io = external.get("io")
    if isinstance(io, dict):
        return io
    observations = external.get("observations") if isinstance(external.get("observations"), list) else []
    actions = external.get("actions") if isinstance(external.get("actions"), list) else []
    header = external.get("onnxHeader") if isinstance(external.get("onnxHeader"), dict) else {}
    return {
        "observations": observations,
        "actions": actions,
        "onnxHeader": {
            "contractHash": header.get("contractHash", contract_hash),
            "task": header.get("task", resolved_task),
            "observationCount": str(header.get("observationCount", len(observations))),
            "actionCount": str(header.get("actionCount", len(actions))),
        },
    }


def _provider_reasons(scorecard: dict[str, Any], external: dict[str, Any]) -> list[str]:
    reasons = []
    if scorecard.get("exportable", external.get("exportable", True)) is False:
        reasons.append("external scorecard marked policy non-exportable")
    raw = scorecard.get("reasons")
    if isinstance(raw, list):
        reasons.extend(str(reason) for reason in raw)
    return reasons


def _robustness(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, float] = {}
    for key, raw in value.items():
        if isinstance(raw, (int, float)):
            out[str(key)] = float(raw)
    return out


def _string_dict(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {str(key): str(raw) for key, raw in value.items() if isinstance(raw, (str, int, float, bool))}


def _number(value: Any, default: float) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return default


def _bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    return default


def train_offline_bc(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_OFFLINE_RL_CMD",
        {"task": "train.offline-bc", **payload},
        timeout_s=float(payload.get("timeoutS", 3600)),
    )
    if external is not None:
        return _external_offline_learning_result(external, payload)

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


def _external_offline_learning_result(external: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    task = str(payload.get("task", "hover-hold"))
    task_meta = external.get("task") if isinstance(external.get("task"), dict) else task_definition(task)
    resolved_task = str(task_meta.get("id", task)) if isinstance(task_meta, dict) else task
    raw_dataset = external.get("dataset") if isinstance(external.get("dataset"), dict) else {}
    action_columns = _string_list(raw_dataset.get("actionColumns", external.get("actionColumns")))
    observation_columns = _string_list(raw_dataset.get("observationColumns", external.get("observationColumns")))
    sample_count = _int(raw_dataset.get("sampleCount", external.get("sampleCount")), 0)
    duration_s = _number(raw_dataset.get("durationS", external.get("durationS")), 0.0)
    source_log_id = raw_dataset.get("sourceLogId", external.get("telemetryLogId", payload.get("telemetryLogId")))
    reasons = []
    if sample_count < 3:
        reasons.append("offline BC requires at least 3 samples")
    if not action_columns:
        reasons.append("offline BC requires action columns")
    accepted = not reasons
    raw_warmstart = external.get("policyWarmstart") if isinstance(external.get("policyWarmstart"), dict) else {}
    contract_hash = str(payload.get("contractHash", "00" * 32))
    seed = str(payload.get("seed", "0"))
    cache_key = str(raw_warmstart.get("cacheKey", external.get("cacheKey", f"offline-bc:{_digest({'task': resolved_task, 'contractHash': contract_hash, 'external': raw_dataset})}")))
    provider_notes = _string_list(external.get("notes"))
    raw_scorecard = external.get("scorecard") if isinstance(external.get("scorecard"), dict) else {}
    scorecard_reasons = ["offline BC warmstart requires live fine-tune before export", *_string_list(raw_scorecard.get("reasons"))]
    return {
        "artifactKind": "offline-learning",
        "provider": external.get("provider", "external-offline-rl"),
        "algorithm": external.get("algorithm", payload.get("algorithm", "behavior-cloning")),
        "task": task_meta,
        "dataset": {
            "sampleCount": sample_count,
            "durationS": duration_s,
            "sorted": bool(raw_dataset.get("sorted", True)),
            "sourceLogId": source_log_id,
            "observationColumns": observation_columns,
            "actionColumns": action_columns,
            "quality": "accepted" if accepted else "held",
        },
        "policyWarmstart": {
            "cacheKey": cache_key,
            "format": str(raw_warmstart.get("format", "behavior-cloning-dataset-v1")),
            "compatible": accepted and bool(raw_warmstart.get("compatible", True)),
        },
        "scorecard": {
            "task": str(raw_scorecard.get("task", resolved_task)),
            "taskVersion": str(raw_scorecard.get("taskVersion", task_meta.get("version", "1.0.0") if isinstance(task_meta, dict) else "1.0.0")),
            "exportable": False,
            "reasons": scorecard_reasons,
            "lineage": _string_dict(raw_scorecard.get("lineage", {"contractHash": contract_hash, "seed": seed, "codeVersion": external.get("codeVersion", "external-offline-rl")})),
        },
        "rejectReason": None if accepted else reasons[0],
        "notes": [*reasons, *provider_notes],
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


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _int(value: Any, default: int) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return default


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
