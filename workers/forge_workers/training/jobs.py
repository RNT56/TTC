"""Fixture-backed training workers (P7/P8).

SB3, MuJoCo, ONNX export, and system-ID can be installed per deployment image.
The local handler contract is deterministic and gates policy export through the
same scorecard object used by tests.
"""

from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import configured_gpu_adapter
from forge_workers.queue import Job, registry
from forge_workers.training.bundle import (
    POLICY_INPUT_LAYOUT,
    POLICY_OUTPUT_LAYOUT as TENSOR_OUTPUT_LAYOUT,
    POLICY_TENSOR_SCHEMA,
    POLICY_TENSOR_VERSION,
)
from forge_workers.training.policy_fixture import OUTPUT_LAYOUT, hover_policy_fixture
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
        {"jobKind": "train.policy", **payload},
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
    fixture = hover_policy_fixture() if resolved_task == "hover-hold" and actions == OUTPUT_LAYOUT else None
    exportable = result.exportable and fixture is not None
    reasons = list(result.reasons)
    if result.exportable and fixture is None:
        reasons.append("no executable deterministic ONNX fixture exists for this task/action layout")
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
            "imuNoiseScale": [0.5, 1.5],
            "imuBiasScale": [0.5, 1.5],
        },
    )
    result = {
        "artifactKind": "policy",
        "provider": gpu["provider"],
        "algorithm": str(payload.get("algorithm", "ppo-fixture")),
        "task": {**task_meta, **({"target": fixture["target"]} if fixture is not None else {})},
        "io": {
            "observations": observations,
            "actions": actions,
            "onnxHeader": {
                "contractHash": contract_hash,
                "task": resolved_task,
                "observationCount": str(len(observations)),
                "actionCount": str(len(actions)),
                **(
                    {
                        "tensorSchema": fixture["tensor"]["schema"],
                        "tensorVersion": fixture["tensor"]["schemaVersion"],
                    }
                    if fixture is not None
                    else {}
                ),
            },
            **({"tensor": fixture["tensor"]} if fixture is not None else {}),
        },
        "domainRandomization": randomization,
        "onnx": {
            "cacheKey": gpu["cacheKey"],
            "opset": fixture["onnx"]["opset"] if fixture is not None else 18,
            "fixture": fixture is not None,
            "path": f"{gpu['cacheKey']}/policy.onnx",
            "exportable": exportable,
            **(
                {
                    "byteSize": fixture["onnx"]["byteSize"],
                    "sha256": fixture["onnx"]["sha256"],
                    "modelBase64": fixture["onnx"]["modelBase64"],
                }
                if fixture is not None
                else {}
            ),
        },
        "exportGate": "exportable" if exportable else "blocked",
        "scorecard": _scorecard_payload(card, reasons, exportable),
    }
    return result


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
    authority_reasons = _external_policy_authority_reasons(
        external,
        raw_scorecard,
        card,
        contract_hash=contract_hash,
        resolved_task=resolved_task,
    )
    reasons = [*gate_result.reasons, *provider_reasons, *authority_reasons]
    exportable = gate_result.exportable and not provider_reasons and not authority_reasons
    onnx = external.get("onnx") if isinstance(external.get("onnx"), dict) else {}
    onnx_payload = {
        "cacheKey": onnx.get("cacheKey", external.get("cacheKey", f"external-sb3:{contract_hash[:12]}")),
        "opset": onnx.get("opset", 18),
        "fixture": False,
        "path": onnx.get("path"),
        "exportable": exportable,
    }
    for key in ("byteSize", "sha256", "modelBase64"):
        if key in onnx:
            onnx_payload[key] = onnx[key]
    result = {
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
    if isinstance(external.get("training"), dict):
        result["training"] = external["training"]
    return result


def _scorecard_payload(card: Scorecard, reasons: list[str], exportable: bool) -> dict[str, Any]:
    return {
        "schemaVersion": "p7-scorecard-v1",
        "task": card.task,
        "taskVersion": card.task_version,
        "successRate": card.success_rate,
        "robustness": card.robustness,
        "energyWh": card.energy_wh,
        "trainedOnEstimator": card.trained_on_estimator,
        "estimatorSmoke": "passed" if card.trained_on_estimator else "failed",
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


def _external_policy_authority_reasons(
    external: dict[str, Any],
    raw_scorecard: dict[str, Any],
    card: Scorecard,
    *,
    contract_hash: str,
    resolved_task: str,
) -> list[str]:
    reasons: list[str] = []
    if card.lineage.get("contractHash") != contract_hash:
        reasons.append("external policy lineage contractHash does not match admitted job authority")
    if card.task != resolved_task:
        reasons.append("external policy scorecard task does not match the requested task")
    if not 0.0 <= card.success_rate <= 1.0:
        reasons.append("external policy successRate must be in [0, 1]")
    if card.energy_wh > 1_000_000_000:
        reasons.append("external policy energyWh exceeds the supported bound")
    raw_robustness = raw_scorecard.get("robustness", external.get("robustness"))
    if isinstance(raw_robustness, dict) and any(
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not 0.0 <= float(value) <= 1.0
        for value in raw_robustness.values()
    ):
        reasons.append("external policy robustness values must be numeric rates in [0, 1]")

    io = external.get("io")
    if isinstance(io, dict):
        header = io.get("onnxHeader")
        if isinstance(header, dict) and header.get("contractHash") != contract_hash:
            reasons.append("external policy ONNX header contractHash does not match admitted job authority")
        tensor = io.get("tensor")
        if isinstance(tensor, dict) and not _policy_tensor_is_exact(tensor):
            reasons.append("external policy tensor contract is unsupported or drifted")

    onnx = external.get("onnx")
    if isinstance(onnx, dict) and any(key in onnx for key in ("modelBase64", "byteSize", "sha256")):
        try:
            encoded = onnx.get("modelBase64")
            expected_size = onnx.get("byteSize")
            expected_hash = onnx.get("sha256")
            if (
                not isinstance(encoded, str)
                or isinstance(expected_size, bool)
                or not isinstance(expected_size, int)
                or not 0 < expected_size <= 5 * 1024 * 1024
                or onnx.get("opset") != 18
                or not isinstance(expected_hash, str)
                or len(expected_hash) != 64
                or any(char not in "0123456789abcdef" for char in expected_hash)
            ):
                raise ValueError
            model_bytes = base64.b64decode(encoded, validate=True)
            if len(model_bytes) != expected_size or hashlib.sha256(model_bytes).hexdigest() != expected_hash:
                raise ValueError
        except (ValueError, TypeError):
            reasons.append("external policy ONNX bytes do not match their bounded size/digest authority")
    return reasons


def _policy_tensor_is_exact(value: dict[str, Any]) -> bool:
    input_axis = value.get("input")
    output_axis = value.get("output")
    return bool(
        value.get("schema") == POLICY_TENSOR_SCHEMA
        and value.get("schemaVersion") == POLICY_TENSOR_VERSION
        and value.get("coordinateFrame") == "forge-y-up-rh-m"
        and value.get("rateHz") == 50
        and isinstance(input_axis, dict)
        and input_axis.get("name") == "observations"
        and input_axis.get("shape") == [1, 11]
        and input_axis.get("layout") == list(POLICY_INPUT_LAYOUT)
        and isinstance(output_axis, dict)
        and output_axis.get("name") == "actions"
        and output_axis.get("shape") == [1, 4]
        and output_axis.get("layout") == list(TENSOR_OUTPUT_LAYOUT)
    )


def _robustness(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, float] = {}
    for key, raw in value.items():
        if not isinstance(raw, bool) and isinstance(raw, (int, float)):
            out[str(key)] = float(raw)
    return out


def _string_dict(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {str(key): str(raw) for key, raw in value.items() if isinstance(raw, (str, int, float, bool))}


def _number(value: Any, default: float) -> float:
    if not isinstance(value, bool) and isinstance(value, (int, float)):
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
        return _external_sysid_result(external, payload)
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


def _external_sysid_result(external: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    raw_fit = external.get("fit") if isinstance(external.get("fit"), dict) else {}
    sample_count = _int(external.get("sampleCount"), len(payload.get("samples", [])) if isinstance(payload.get("samples"), list) else 0)
    sim_patch = external.get("simPatch") if isinstance(external.get("simPatch"), list) else []
    r_int = _number(raw_fit.get("rIntMohm", external.get("rIntMohm")), None)
    accepted_claim = bool(raw_fit.get("accepted", external.get("accepted", False)))
    reasons: list[str] = []
    if sample_count < 3:
        reasons.append("system-ID requires at least 3 telemetry samples")
    if not accepted_claim:
        reasons.append("external system-ID fit was not marked accepted")
    if not sim_patch:
        reasons.append("system-ID fit requires a simPatch")
    accepted = not reasons
    return {
        "artifactKind": "sysid",
        "provider": external.get("provider", "external-sysid"),
        "sampleCount": sample_count,
        "fit": {
            "batterySagRmse": raw_fit.get("batterySagRmse", external.get("batterySagRmse")),
            "currentRmseA": raw_fit.get("currentRmseA", external.get("currentRmseA")),
            "rIntMohm": r_int,
            "frictionScale": _number(raw_fit.get("frictionScale", external.get("frictionScale")), 1.0),
            "timeConstantMs": _number(raw_fit.get("timeConstantMs", external.get("timeConstantMs")), 45.0),
            "accepted": accepted,
            "reasons": reasons,
        },
        "simPatch": sim_patch if accepted else [],
        "rejectReason": None if accepted else reasons[0],
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
