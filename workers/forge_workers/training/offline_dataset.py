"""Exact telemetry-to-policy dataset authority for P7-009.

The recorder owns capture. This module owns the narrower training view: one
source-bound replay tape containing only the exact estimator tensor consumed by
the policy and one reviewed normalized action tensor per timestamp. It never
sorts, fills, projects, or otherwise repairs authority-bearing input.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any

from forge_workers.contract import REPLAY_FORMAT_VERSION
from forge_workers.training.bundle import (
    OFFLINE_DATASET_SCHEMA,
    OFFLINE_DATASET_VERSION,
    OFFLINE_TRAINING_TAPE_SCHEMA,
    OFFLINE_TRAINING_TAPE_VERSION,
)

MIN_OFFLINE_SAMPLES = 64
MAX_OFFLINE_SAMPLES = 100_000
MAX_OBSERVATION_ABS = 1_000_000.0
ACTION_SOURCES = {"reviewed-controller-action", "supervisor-approved-action"}
CAPTURE_MATURITIES = {"controlled-synthetic"}
OFFLINE_FLIGHT_RANDOMIZATION = {
    "massPct": 15.0,
    "kvPct": 8.0,
    "sagPct": 20.0,
    "latencyMs": [0.0, 30.0],
    "friction": [0.4, 1.2],
    "windMps": [0.0, 4.0],
    "obsDropoutPct": [0.0, 5.0],
    "imuNoiseScale": [0.5, 1.5],
    "imuBiasScale": [0.5, 1.5],
}
OFFLINE_GROUND_RANDOMIZATION = {
    "massPct": 15.0,
    "torquePct": 10.0,
    "latencyMs": [0.0, 30.0],
    "friction": [0.4, 1.2],
    "obsDropoutPct": [0.0, 5.0],
    "imuNoiseScale": [0.5, 1.5],
    "imuBiasScale": [0.5, 1.5],
}


def offline_domain_randomization(*, ground: bool) -> dict[str, Any]:
    authority = OFFLINE_GROUND_RANDOMIZATION if ground else OFFLINE_FLIGHT_RANDOMIZATION
    return {key: list(value) if isinstance(value, list) else value for key, value in authority.items()}


def stable_sha256(value: Any) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def validate_offline_training_tape(
    payload: dict[str, Any],
    bundle: dict[str, Any],
    task: dict[str, Any],
) -> tuple[list[list[float]], list[list[float]], dict[str, Any]]:
    tape = payload.get("tape")
    if not isinstance(tape, dict):
        raise ValueError("offline training requires one gateway-owned telemetry tape")
    source_log_id = _bounded_string(payload.get("telemetryLogId"), "telemetryLogId", 200)
    declared_source_hash = _lower_sha256(payload.get("telemetryLogSha256"), "telemetryLogSha256")
    try:
        actual_source_hash = stable_sha256(tape)
    except (TypeError, ValueError) as error:
        raise ValueError("offline training tape must contain finite JSON") from error
    if declared_source_hash != actual_source_hash:
        raise ValueError("offline training telemetry log hash does not match the exact tape")
    if tape.get("schemaVersion") != REPLAY_FORMAT_VERSION:
        raise ValueError("offline training requires replay tape 1.0.0")

    header = tape.get("header")
    if not isinstance(header, dict):
        raise ValueError("offline training tape header is required")
    if header.get("contractHash") != bundle.get("contractHash"):
        raise ValueError("offline training tape contract hash does not match admitted authority")
    training = header.get("training")
    if not isinstance(training, dict):
        raise ValueError("offline training tape lacks training authority")
    _exact(
        training,
        {
            "schemaVersion",
            "task",
            "tensor",
            "observationSource",
            "actionSource",
            "captureMaturity",
        },
        "offline training tape authority",
    )
    if training.get("schemaVersion") != (
        f"{OFFLINE_TRAINING_TAPE_SCHEMA}/{OFFLINE_TRAINING_TAPE_VERSION}"
    ):
        raise ValueError("offline training tape schema version is unsupported")
    expected_task = {
        key: task[key]
        for key in ("id", "suite", "version", "coordinateFrame", "definitionHash")
    }
    if training.get("task") != expected_task:
        raise ValueError("offline training tape task authority drifted")
    tensor = bundle.get("tensor")
    if not isinstance(tensor, dict) or training.get("tensor") != tensor:
        raise ValueError("offline training tape tensor authority drifted")
    if training.get("observationSource") != "estimator-policy-tensor":
        raise ValueError("offline training observations must come from the estimator policy tensor")
    action_source = training.get("actionSource")
    if action_source not in ACTION_SOURCES:
        raise ValueError("offline training actions require reviewed or supervisor-approved authority")
    capture_maturity = training.get("captureMaturity")
    if capture_maturity not in CAPTURE_MATURITIES:
        raise ValueError("offline training capture maturity is missing or unsupported")

    input_axis = tensor.get("input")
    output_axis = tensor.get("output")
    if not isinstance(input_axis, dict) or not isinstance(output_axis, dict):
        raise ValueError("offline training tensor axes are missing")
    input_layout = input_axis.get("layout")
    output_layout = output_axis.get("layout")
    if not isinstance(input_layout, list) or not isinstance(output_layout, list):
        raise ValueError("offline training tensor layouts are missing")
    observation_count = len(input_layout)
    action_count = len(output_layout)
    if input_axis.get("shape") != [1, observation_count] or output_axis.get("shape") != [1, action_count]:
        raise ValueError("offline training tensor shapes do not match their layouts")

    frames = tape.get("frames")
    if not isinstance(frames, list) or not MIN_OFFLINE_SAMPLES <= len(frames) <= MAX_OFFLINE_SAMPLES:
        raise ValueError(
            f"offline training requires {MIN_OFFLINE_SAMPLES}..{MAX_OFFLINE_SAMPLES} exact samples"
        )
    observations: list[list[float]] = []
    actions: list[list[float]] = []
    timestamps: list[float] = []
    for index, frame in enumerate(frames):
        if not isinstance(frame, dict):
            raise ValueError(f"offline training frame {index} must be an object")
        _exact(frame, {"t", "state"}, f"offline training frame {index}")
        timestamp = _finite(frame.get("t"), f"offline training frame {index} timestamp")
        state = frame.get("state")
        if not isinstance(state, dict):
            raise ValueError(f"offline training frame {index} state is missing")
        _exact(state, {"t", "observation", "action"}, f"offline training frame {index} state")
        state_time = _finite(state.get("t"), f"offline training frame {index} state timestamp")
        if state_time != timestamp:
            raise ValueError(f"offline training frame {index} timestamp authority drifted")
        if timestamps and timestamp <= timestamps[-1]:
            raise ValueError("offline training timestamps must be unique and strictly increasing")
        timestamps.append(timestamp)
        observations.append(
            _vector(
                state.get("observation"),
                observation_count,
                f"offline training frame {index} observation",
                lower=-MAX_OBSERVATION_ABS,
                upper=MAX_OBSERVATION_ABS,
            )
        )
        actions.append(
            _vector(
                state.get("action"),
                action_count,
                f"offline training frame {index} action",
                lower=-1.0,
                upper=1.0,
            )
        )

    dataset_hash = stable_sha256(
        {
            "schemaVersion": f"{OFFLINE_DATASET_SCHEMA}/{OFFLINE_DATASET_VERSION}",
            "contractHash": bundle["contractHash"],
            "taskDefinitionHash": task["definitionHash"],
            "tensor": tensor,
            "sourceLogId": source_log_id,
            "sourceLogSha256": actual_source_hash,
            "timestamps": timestamps,
            "observations": observations,
            "actions": actions,
        }
    )
    summary = {
        "schemaVersion": f"{OFFLINE_DATASET_SCHEMA}/{OFFLINE_DATASET_VERSION}",
        "datasetHash": dataset_hash,
        "sampleCount": len(frames),
        "durationS": round(timestamps[-1] - timestamps[0], 6),
        "sourceOrderVerified": True,
        "sourceLogId": source_log_id,
        "sourceLogSha256": actual_source_hash,
        "contractHash": bundle["contractHash"],
        "taskDefinitionHash": task["definitionHash"],
        "tensorSchema": tensor["schema"],
        "tensorVersion": tensor["schemaVersion"],
        "observationColumns": list(input_layout),
        "actionColumns": list(output_layout),
        "observationSource": "estimator-policy-tensor",
        "actionSource": action_source,
        "captureMaturity": capture_maturity,
    }
    return observations, actions, summary


def _vector(
    value: Any,
    size: int,
    label: str,
    *,
    lower: float,
    upper: float,
) -> list[float]:
    if not isinstance(value, list) or len(value) != size:
        raise ValueError(f"{label} must contain exactly {size} scalars")
    result = [_finite(raw, f"{label}[{index}]") for index, raw in enumerate(value)]
    if any(raw < lower or raw > upper for raw in result):
        raise ValueError(f"{label} is outside [{lower}, {upper}]")
    return result


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be finite numeric")
    try:
        number = float(value)
    except OverflowError as error:
        raise ValueError(f"{label} must be finite numeric") from error
    if not math.isfinite(number):
        raise ValueError(f"{label} must be finite numeric")
    return number


def _bounded_string(value: Any, label: str, maximum: int) -> str:
    if not isinstance(value, str) or not value or len(value.encode("utf-8")) > maximum or "\x00" in value:
        raise ValueError(f"{label} must be a non-empty bounded string")
    return value


def _lower_sha256(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(char not in "0123456789abcdef" for char in value)
    ):
        raise ValueError(f"{label} must be lowercase SHA-256")
    return value


def _exact(value: dict[str, Any], keys: set[str], label: str) -> None:
    if set(value) != keys:
        raise ValueError(f"{label} fields drifted")
