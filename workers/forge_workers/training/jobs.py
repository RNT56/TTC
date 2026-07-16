"""Fixture-backed training workers (P7/P8).

SB3, MuJoCo, ONNX export, and system-ID can be installed per deployment image.
The local handler contract is deterministic and gates policy export through the
same scorecard object used by tests.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any, Callable

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import configured_gpu_adapter
from forge_workers.queue import Job, registry
from forge_workers.training.bundle import (
    GROUND_POLICY_INPUT_LAYOUT,
    GROUND_POLICY_TENSOR_SCHEMA,
    GROUND_POLICY_TENSOR_VERSION,
    LEGACY_POLICY_INPUT_LAYOUT,
    LEGACY_POLICY_TENSOR_VERSION,
    POLICY_INPUT_LAYOUT,
    POLICY_OUTPUT_LAYOUT as TENSOR_OUTPUT_LAYOUT,
    POLICY_TENSOR_SCHEMA,
    POLICY_TENSOR_VERSION,
    OFFLINE_WARMSTART_SCHEMA,
    OFFLINE_WARMSTART_VERSION,
    compile_training_bundle,
)
from forge_workers.training.offline_dataset import (
    offline_domain_randomization,
    validate_offline_training_tape,
)
from forge_workers.training.policy_fixture import OUTPUT_LAYOUT, hover_policy_fixture
from forge_workers.training.scorecard import DEFAULT_MIN_ROBUST, DEFAULT_MIN_SUCCESS, Scorecard, gate
from forge_workers.training.tasks import course_task_definition, task_definition


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def _modal_training_payload(payload: dict[str, Any], bundle: dict[str, Any]) -> dict[str, Any]:
    allowed = (
        "contractHash",
        "task",
        "recipe",
        "algorithm",
        "seed",
        "timeoutS",
        "totalTimesteps",
        "episodeSteps",
        "evalEpisodes",
        "curriculumStage",
    )
    return {
        **{key: payload[key] for key in allowed if key in payload},
        "jobKind": "train.policy",
        "trainingBundle": bundle,
    }


def train_policy(
    payload: dict[str, Any],
    *,
    provider_call_sink: Callable[[str, dict[str, Any]], None] | None = None,
    cancellation_requested: Callable[[], bool] | None = None,
    provider_cancelled_sink: Callable[[str], None] | None = None,
    provider_call_id: str | None = None,
    provider_call_identity: dict[str, Any] | None = None,
) -> dict[str, Any]:
    contract_hash = str(payload.get("contractHash", "00" * 32))
    seed = str(payload.get("seed", "0"))
    task_meta = _task_meta(payload)
    resolved_task = str(task_meta["id"])
    external = run_json_command(
        "FORGE_SB3_TRAIN_CMD",
        {**payload, "jobKind": "train.policy"},
        timeout_s=float(payload.get("timeoutS", 12 * 3600)),
    )
    if external is not None:
        return _external_policy_result(external, payload, task_meta, resolved_task, contract_hash, seed)
    gpu_adapter = configured_gpu_adapter(
        call_sink=provider_call_sink,
        cancellation_requested=cancellation_requested,
        cancelled_sink=provider_cancelled_sink,
        resume_call_id=provider_call_id,
        resume_identity=provider_call_identity,
    )
    if os.getenv("FORGE_GPU_BACKEND") == "modal":
        bundle = compile_training_bundle(payload)
        modal_result = gpu_adapter.run(
            "train.policy",
            _modal_training_payload(payload, bundle),
        )
        return _external_policy_result(
            modal_result,
            payload,
            task_meta,
            resolved_task,
            contract_hash,
            seed,
        )
    gpu = gpu_adapter.run("train.policy", payload)
    card = Scorecard(
        task=resolved_task,
        task_version=str(task_meta["version"]),
        success_rate=float(payload.get("successRate", 0.91)),
        robustness={
            "mass+15%": float(payload.get("massRobustness", 0.84)),
            "kv-8%": float(payload.get("kvRobustness", 0.88)),
            "wind4ms": float(payload.get("windRobustness", 0.79)),
        },
        energy_wh=float(payload.get("energyWh", 2.2)),
        trained_on_estimator=bool(payload.get("trainedOnEstimator", True)),
        lineage={
            "contractHash": contract_hash,
            "seed": seed,
            "codeVersion": "fixture-p7-v3",
            "taskDefinitionHash": str(task_meta["definitionHash"]),
        },
    )
    result = gate(card)
    observations = [
        "estimator.attitude",
        "estimator.angularRate",
        "estimator.linearVelocity",
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
    policy_targets = [
        {
            "kind": target["kind"],
            "xyzM": target["xyz"],
            "radiusM": target["radiusM"],
        }
        for target in task_meta["env"].get("targets", [])
        if target.get("kind") in {"position", "waypoint"}
        and isinstance(target.get("xyz"), list)
        and isinstance(target.get("radiusM"), (int, float))
    ]
    result = {
        "artifactKind": "policy",
        "provider": gpu["provider"],
        "algorithm": str(payload.get("algorithm", "ppo-fixture")),
        "task": {
            **task_meta,
            **(
                {"target": {"xyzM": policy_targets[0]["xyzM"]}, "targets": policy_targets}
                if policy_targets
                else {}
            ),
        },
        "io": {
            "observations": observations,
            "actions": actions,
            "onnxHeader": {
                "contractHash": contract_hash,
                "task": resolved_task,
                "taskVersion": task_meta["version"],
                "taskDefinitionHash": task_meta["definitionHash"],
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
        task_meta=task_meta,
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
        "io": _external_io(external, contract_hash, resolved_task, task_meta),
        "domainRandomization": external.get("domainRandomization", payload.get("domainRandomization", {})),
        "onnx": onnx_payload,
        "exportGate": "exportable" if exportable else "blocked",
        "scorecard": _scorecard_payload(card, reasons, exportable),
    }
    if resolved_task in {"line-follow", "walk-to-target"}:
        result["archetype"] = external.get("archetype", task_meta.get("archetype"))
        result["scorecard"]["energySemantics"] = raw_scorecard.get("energySemantics")
    if isinstance(external.get("training"), dict):
        result["training"] = external["training"]
    if isinstance(external.get("providerEvidence"), dict):
        result["providerEvidence"] = external["providerEvidence"]
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


def _external_io(
    external: dict[str, Any],
    contract_hash: str,
    resolved_task: str,
    task_meta: dict[str, Any],
) -> dict[str, Any]:
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
            "taskVersion": header.get("taskVersion", task_meta["version"]),
            "taskDefinitionHash": header.get("taskDefinitionHash", task_meta["definitionHash"]),
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
    task_meta: dict[str, Any],
) -> list[str]:
    reasons: list[str] = []
    if card.lineage.get("contractHash") != contract_hash:
        reasons.append("external policy lineage contractHash does not match admitted job authority")
    if card.task != resolved_task:
        reasons.append("external policy scorecard task does not match the requested task")
    if card.task_version != task_meta["version"]:
        reasons.append("external policy scorecard taskVersion does not match worker task authority")
    if card.lineage.get("taskDefinitionHash") != task_meta["definitionHash"]:
        reasons.append("external policy lineage taskDefinitionHash does not match worker task authority")
    if not 0.0 <= card.success_rate <= 1.0:
        reasons.append("external policy successRate must be in [0, 1]")
    if card.energy_wh > 1_000_000_000:
        reasons.append("external policy energyWh exceeds the supported bound")
    if task_meta.get("id") in {"line-follow", "walk-to-target"} and raw_scorecard.get(
        "energySemantics"
    ) != "simulated-positive-mechanical-joint-work":
        reasons.append("external ground policy energy semantics are missing or drifted")
    raw_robustness = raw_scorecard.get("robustness", external.get("robustness"))
    if isinstance(raw_robustness, dict) and any(
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not 0.0 <= float(value) <= 1.0
        for value in raw_robustness.values()
    ):
        reasons.append("external policy robustness values must be numeric rates in [0, 1]")

    external_task = external.get("task")
    expected_targets = _task_targets(task_meta)
    if not isinstance(external_task, dict) or any(
        external_task.get(key) != task_meta[key]
        for key in ("id", "suite", "version", "coordinateFrame", "definitionHash")
    ):
        reasons.append("external policy task metadata does not match worker task authority")
    elif external_task.get("targets") != expected_targets:
        reasons.append("external policy targets do not match worker task authority")

    io = external.get("io")
    if not isinstance(io, dict):
        reasons.append("external policy IO contract is missing")
    else:
        header = io.get("onnxHeader")
        expected_header = {
            "contractHash": contract_hash,
            "task": resolved_task,
            "taskVersion": task_meta["version"],
            "taskDefinitionHash": task_meta["definitionHash"],
        }
        if not isinstance(header, dict) or any(header.get(key) != value for key, value in expected_header.items()):
            reasons.append("external policy ONNX header does not match admitted contract/task authority")
        tensor = io.get("tensor")
        if not isinstance(tensor, dict) or not _policy_tensor_is_exact(tensor, task_meta):
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


def _policy_tensor_is_exact(value: dict[str, Any], task_meta: dict[str, Any]) -> bool:
    if value.get("schema") == GROUND_POLICY_TENSOR_SCHEMA:
        return _ground_policy_tensor_is_exact(value, task_meta)
    input_axis = value.get("input")
    output_axis = value.get("output")
    version = value.get("schemaVersion")
    expected_input = (
        LEGACY_POLICY_INPUT_LAYOUT
        if version == LEGACY_POLICY_TENSOR_VERSION
        else POLICY_INPUT_LAYOUT
    )
    return bool(
        value.get("schema") == POLICY_TENSOR_SCHEMA
        and version in {LEGACY_POLICY_TENSOR_VERSION, POLICY_TENSOR_VERSION}
        and value.get("coordinateFrame") == "forge-y-up-rh-m"
        and value.get("rateHz") == 50
        and isinstance(input_axis, dict)
        and input_axis.get("name") == "observations"
        and input_axis.get("shape") == [1, len(expected_input)]
        and input_axis.get("layout") == list(expected_input)
        and isinstance(output_axis, dict)
        and output_axis.get("name") == "actions"
        and output_axis.get("shape") == [1, 4]
        and output_axis.get("layout") == list(TENSOR_OUTPUT_LAYOUT)
    )


def _ground_policy_tensor_is_exact(value: dict[str, Any], task_meta: dict[str, Any]) -> bool:
    input_axis = value.get("input")
    output_axis = value.get("output")
    if not (
        value.get("schemaVersion") == GROUND_POLICY_TENSOR_VERSION
        and value.get("coordinateFrame") == "forge-y-up-rh-m"
        and value.get("rateHz") == 50
        and isinstance(input_axis, dict)
        and input_axis.get("name") == "observations"
        and isinstance(input_axis.get("layout"), list)
        and isinstance(output_axis, dict)
        and output_axis.get("name") == "actions"
        and isinstance(output_axis.get("layout"), list)
    ):
        return False
    input_layout = input_axis["layout"]
    output_layout = output_axis["layout"]
    if input_axis.get("shape") != [1, len(input_layout)] or output_axis.get("shape") != [
        1,
        len(output_layout),
    ]:
        return False
    if task_meta.get("id") == "line-follow":
        return input_layout == list(GROUND_POLICY_INPUT_LAYOUT) and output_layout == [
            "drive",
            "turn",
        ]
    if task_meta.get("id") != "walk-to-target":
        return False
    if input_layout[: len(GROUND_POLICY_INPUT_LAYOUT)] != list(GROUND_POLICY_INPUT_LAYOUT):
        return False
    remaining = input_layout[len(GROUND_POLICY_INPUT_LAYOUT) :]
    if len(remaining) % 2 != 0:
        return False
    joint_count = len(remaining) // 2
    if not 8 <= joint_count <= 24 or len(output_layout) != joint_count:
        return False
    positions = remaining[:joint_count]
    velocities = remaining[joint_count:]
    names: list[str] = []
    for position in positions:
        prefix = "estimator.jointPosition."
        if not isinstance(position, str) or not position.startswith(prefix) or not position.endswith("Rad"):
            return False
        name = position[len(prefix) : -3]
        if not name or name in names:
            return False
        names.append(name)
    return velocities == [
        f"estimator.jointVelocity.{name}RadS" for name in names
    ] and output_layout == [f"jointTorque.{name}" for name in names]


def _task_targets(task_meta: dict[str, Any]) -> list[dict[str, Any]]:
    env = task_meta["env"]
    if task_meta.get("id") == "line-follow":
        spawn_y = float(env["spawn"]["pose"][1])
        return [
            {
                "kind": "path-point",
                "xyzM": [float(point[0]), spawn_y, float(point[1])],
                "radiusM": float(env["path"]["radiusM"]),
            }
            for point in env["path"]["points"]
        ]
    return [
        {"kind": target["kind"], "xyzM": target["xyz"], "radiusM": target["radiusM"]}
        for target in env.get("targets", [])
    ]


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
        {**payload, "jobKind": "train.offline-bc"},
        timeout_s=float(payload.get("timeoutS", 3600)),
    )
    if external is not None:
        if external.get("artifactKind") == "policy":
            return _external_offline_policy_result(external, payload)
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


def _external_offline_policy_result(
    external: dict[str, Any], payload: dict[str, Any]
) -> dict[str, Any]:
    task_meta = _task_meta(payload)
    resolved_task = str(task_meta["id"])
    contract_hash = str(payload.get("contractHash", "00" * 32))
    seed = str(payload.get("seed", "0"))
    policy = _external_policy_result(
        external,
        payload,
        task_meta,
        resolved_task,
        contract_hash,
        seed,
    )
    reasons: list[str] = []
    expected_dataset: dict[str, Any] | None = None
    io = external.get("io")
    tensor = io.get("tensor") if isinstance(io, dict) else None
    try:
        if not isinstance(tensor, dict):
            raise ValueError("offline fine-tune policy tensor is missing")
        _, _, summary = validate_offline_training_tape(
            payload,
            {"contractHash": contract_hash, "tensor": tensor},
            task_meta,
        )
        expected_dataset = {**summary, "quality": "accepted"}
    except ValueError as error:
        reasons.append(str(error))

    raw_dataset = external.get("dataset")
    if expected_dataset is None or raw_dataset != expected_dataset:
        reasons.append("offline fine-tune dataset summary does not match the exact source tape")

    warmstart = external.get("policyWarmstart")
    if not isinstance(warmstart, dict):
        reasons.append("offline fine-tune warmstart authority is missing")
        warmstart = {}
    expected_warmstart_schema = f"{OFFLINE_WARMSTART_SCHEMA}/{OFFLINE_WARMSTART_VERSION}"
    parameter_digest = warmstart.get("parameterDigest")
    if (
        warmstart.get("schemaVersion") != expected_warmstart_schema
        or expected_dataset is None
        or warmstart.get("datasetHash") != expected_dataset.get("datasetHash")
        or warmstart.get("compatible") is not True
        or not _is_lower_sha256(parameter_digest)
    ):
        reasons.append("offline fine-tune warmstart does not match dataset and parameter authority")

    training = external.get("training")
    curriculum = training.get("curriculum") if isinstance(training, dict) else None
    behavior_stage = curriculum[0] if isinstance(curriculum, list) and curriculum else None
    ppo_stage = curriculum[1] if isinstance(curriculum, list) and len(curriculum) == 2 else None
    expected_randomization = offline_domain_randomization(
        ground=resolved_task in {"line-follow", "walk-to-target"}
    )
    parameter_before = training.get("parameterDigestBefore") if isinstance(training, dict) else None
    parameter_after = training.get("parameterDigestAfter") if isinstance(training, dict) else None
    final_loss = behavior_stage.get("finalMeanSquaredError") if isinstance(behavior_stage, dict) else None
    if (
        not isinstance(training, dict)
        or external.get("algorithm") != "ppo"
        or training.get("recipe") != "p7-offline-bc-v1"
        or training.get("requestedTimesteps") != 256
        or training.get("completedTimesteps") != 256
        or training.get("optimizerUpdated") is not True
        or training.get("deterministicAlgorithms") is not True
        or training.get("truthExposedToPolicy") is not False
        or training.get("device") != "cpu"
        or not _is_lower_sha256(parameter_before)
        or not _is_lower_sha256(parameter_after)
        or parameter_before in {parameter_digest, parameter_after}
        or parameter_digest == parameter_after
        or not isinstance(curriculum, list)
        or len(curriculum) != 2
        or not isinstance(behavior_stage, dict)
        or behavior_stage.get("kind") != "behavior-cloning"
        or behavior_stage.get("parameterDigestAfter") != parameter_digest
        or expected_dataset is None
        or behavior_stage.get("datasetHash") != expected_dataset.get("datasetHash")
        or behavior_stage.get("sourceLogSha256") != expected_dataset.get("sourceLogSha256")
        or behavior_stage.get("samples") != expected_dataset.get("sampleCount")
        or behavior_stage.get("epochs") != 12
        or behavior_stage.get("batchSize") != 64
        or isinstance(final_loss, bool)
        or not isinstance(final_loss, (int, float))
        or not 0 <= float(final_loss) < float("inf")
        or behavior_stage.get("observationSource") != "estimator-policy-tensor"
        or behavior_stage.get("actionSource") != expected_dataset.get("actionSource")
        or behavior_stage.get("captureMaturity") != "controlled-synthetic"
        or behavior_stage.get("truthExposedToPolicy") is not False
        or not isinstance(ppo_stage, dict)
        or ppo_stage.get("kind") != "ppo-randomized-fine-tune"
        or ppo_stage.get("timesteps") != 256
        or ppo_stage.get("domainRandomization") != expected_randomization
        or external.get("domainRandomization") != expected_randomization
    ):
        reasons.append("offline fine-tune did not execute the exact BC-to-PPO recipe")

    lineage = policy.get("scorecard", {}).get("lineage", {})
    if (
        expected_dataset is None
        or not isinstance(lineage, dict)
        or lineage.get("sourceLogId") != expected_dataset.get("sourceLogId")
        or lineage.get("sourceLogSha256") != expected_dataset.get("sourceLogSha256")
        or lineage.get("offlineDatasetHash") != expected_dataset.get("datasetHash")
        or lineage.get("warmstartParameterDigest") != parameter_digest
    ):
        reasons.append("offline fine-tune scorecard lineage does not match source and warmstart authority")

    onnx = external.get("onnx")
    if not isinstance(onnx, dict) or not all(
        key in onnx for key in ("modelBase64", "byteSize", "sha256")
    ):
        reasons.append("offline fine-tune requires exact bounded ONNX bytes")

    if reasons:
        policy["exportGate"] = "blocked"
        policy["onnx"]["exportable"] = False
        policy["scorecard"]["exportable"] = False
        policy["scorecard"]["reasons"] = list(
            dict.fromkeys([*policy["scorecard"].get("reasons", []), *reasons])
        )
    policy["dataset"] = (
        expected_dataset
        if expected_dataset is not None and raw_dataset == expected_dataset
        else {
            **(raw_dataset if isinstance(raw_dataset, dict) else {}),
            "quality": "held",
        }
    )
    policy["policyWarmstart"] = warmstart
    return policy


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


def _is_lower_sha256(value: Any) -> bool:
    return bool(
        isinstance(value, str)
        and len(value) == 64
        and all(char in "0123456789abcdef" for char in value)
    )


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
    return train_policy(
        job.payload,
        provider_call_sink=job.provider_call_sink,
        cancellation_requested=job.cancellation_requested,
        provider_cancelled_sink=job.provider_cancelled_sink,
        provider_call_id=job.provider_call_id,
        provider_call_identity=(
            {
                "environment": job.provider_environment,
                "functionVersion": job.provider_function_version,
                "sourceRevision": os.getenv("FORGE_MODAL_SOURCE_REVISION", "").strip(),
                "deploymentContractHash": job.provider_deployment_contract_hash,
                "submittedAt": job.provider_submitted_at,
            }
            if job.provider_call_id is not None
            else None
        ),
    )


@registry.register("train.offline-bc")
def handle_offline_bc(job: Job) -> dict[str, Any]:
    return train_offline_bc(job.payload)


@registry.register("train.sysid-fit")
def handle_sysid(job: Job) -> dict[str, Any]:
    return fit_sysid(job.payload)
