"""Bridge, telemetry, and supervisor workers (P8).

Live serial/WebUSB/Tauri capture is UI/runtime-owned. These handlers compile the
same deterministic payloads that those surfaces submit: FC config diffs,
telemetry replay tapes, and fail-closed supervisor decisions.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from typing import Any

from forge_workers.contract import REPLAY_FORMAT_VERSION
from forge_workers.net_security import assert_bounded_json

from forge_workers.queue import Job, registry


_COMMAND_TOKEN = re.compile(r"^[A-Za-z0-9_.:+/-]{1,128}$")


def _stable_hash(value: Any) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _bounded_payload(payload: Any, label: str, *, max_bytes: int, max_nodes: int) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} payload must be an object")
    assert_bounded_json(
        payload,
        label=label,
        max_bytes=max_bytes,
        max_depth=24,
        max_nodes=max_nodes,
    )


def _command_token(value: Any, label: str) -> str:
    if not isinstance(value, str) or not _COMMAND_TOKEN.fullmatch(value):
        raise ValueError(f"{label} must be a single safe command token")
    return value


def _command_value(value: Any, label: str) -> str:
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a finite number or safe command token")
    if isinstance(value, (int, float)):
        try:
            number = float(value)
        except OverflowError as exc:
            raise ValueError(
                f"{label} must be a finite number or safe command token"
            ) from exc
        if not math.isfinite(number):
            raise ValueError(f"{label} must be a finite number or safe command token")
        return str(value)
    return _command_token(value, label)


def _finite_number(
    value: Any, label: str, *, minimum: float | None = None, strict: bool = False
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be finite")
    try:
        number = float(value)
    except OverflowError as exc:
        raise ValueError(f"{label} must be finite") from exc
    if not math.isfinite(number):
        raise ValueError(f"{label} must be finite")
    if minimum is not None and (number <= minimum if strict else number < minimum):
        comparator = "greater than" if strict else "at least"
        raise ValueError(f"{label} must be {comparator} {minimum}")
    return number


def _finite_vector(value: Any, label: str) -> list[float]:
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(f"{label} must be a finite 3-vector")
    return [_finite_number(entry, label) for entry in value]


def compile_config_diff(payload: dict[str, Any]) -> dict[str, Any]:
    _bounded_payload(payload, "bridge.config-diff", max_bytes=64 * 1024, max_nodes=2_000)
    firmware = str(payload.get("firmware", "betaflight")).lower()
    if firmware not in {"betaflight", "ardupilot", "ros2"}:
        raise ValueError("bridge.config-diff firmware must be betaflight, ardupilot, or ros2")
    rates = payload.get("rates", {})
    mixer = _command_token(payload.get("mixer", "quadx"), "bridge.config-diff mixer")
    if not isinstance(rates, dict):
        raise ValueError("bridge.config-diff rates must be an object")
    if len(rates) > 256:
        raise ValueError("bridge.config-diff rates exceeds the entry limit")
    if any(not isinstance(key, str) for key in rates):
        raise ValueError("bridge.config-diff rate keys must be strings")
    lines = [f"# FORGE generated {firmware} config diff", f"mixer {mixer}"]
    for key in sorted(rates):
        safe_key = _command_token(key, "bridge.config-diff rate key")
        safe_value = _command_value(rates[key], f"bridge.config-diff rate {safe_key}")
        lines.append(f"set {safe_key} = {safe_value}")
    lines.append("save")
    return {
        "artifactKind": "bridge-config",
        "firmware": firmware,
        "diffHash": _stable_hash(lines),
        "requiresPhysicalConfirmation": True,
        "lines": lines,
    }


def ingest_telemetry(payload: dict[str, Any]) -> dict[str, Any]:
    _bounded_payload(
        payload,
        "bridge.telemetry-ingest",
        max_bytes=4 * 1024 * 1024,
        max_nodes=100_000,
    )
    samples = payload.get("samples", [])
    if not isinstance(samples, list) or not samples:
        raise ValueError("bridge.telemetry-ingest requires non-empty samples")
    frames: list[dict[str, Any]] = []
    for sample in samples:
        if not isinstance(sample, dict) or "t" not in sample:
            raise ValueError("telemetry sample must include finite numeric t")
        timestamp = _finite_number(sample["t"], "telemetry sample t")
        frames.append({"t": timestamp, "state": sample})
    frames.sort(key=lambda frame: frame["t"])
    if any(left["t"] >= right["t"] for left, right in zip(frames, frames[1:])):
        raise ValueError("telemetry timestamps must be unique and strictly increasing")
    training = payload.get("training")
    tape = {
        "schemaVersion": REPLAY_FORMAT_VERSION,
        "header": {
            "contractHash": payload.get("contractHash"),
            "lockfileHash": payload.get("lockfileHash"),
            "seed": payload.get("seed", 0),
            **({"training": training} if isinstance(training, dict) else {}),
        },
        "frames": frames,
    }
    return {
        "artifactKind": "telemetry-replay",
        "tape": tape,
        "tapeHash": _stable_hash(tape),
        "frameCount": len(frames),
        "durationS": max(0.0, frames[-1]["t"] - frames[0]["t"]),
    }


def supervisor_check(payload: dict[str, Any]) -> dict[str, Any]:
    _bounded_payload(
        payload,
        "bridge.supervisor-check",
        max_bytes=64 * 1024,
        max_nodes=2_000,
    )
    cfg = payload.get("config", {})
    state = payload.get("state", {})
    if not isinstance(cfg, dict) or not isinstance(state, dict):
        raise ValueError("bridge.supervisor-check requires config and state objects")
    reasons: list[str] = []
    pos = _finite_vector(state.get("positionM", [0, 0, 0]), "state.positionM")
    attitude = _finite_vector(state.get("attitudeRad", [0, 0, 0]), "state.attitudeRad")
    rates = _finite_vector(state.get("rateRadS", [0, 0, 0]), "state.rateRadS")
    geofence_radius = _finite_number(
        cfg.get("geofenceRadiusM", 25.0), "config.geofenceRadiusM", minimum=0.0, strict=True
    )
    max_attitude = _finite_number(
        cfg.get("maxAttitudeRad", 0.9), "config.maxAttitudeRad", minimum=0.0, strict=True
    )
    max_rate = _finite_number(
        cfg.get("maxRateRadS", 6.0), "config.maxRateRadS", minimum=0.0, strict=True
    )
    min_battery = _finite_number(
        cfg.get("minBatteryV", 0.0), "config.minBatteryV", minimum=0.0
    )
    battery = _finite_number(state.get("batteryV", 999.0), "state.batteryV", minimum=0.0)
    kill_switch = state.get("killSwitch", False)
    if not isinstance(kill_switch, bool):
        raise ValueError("state.killSwitch must be a boolean")
    radius = math.hypot(pos[0], pos[2])
    if kill_switch:
        reasons.append("kill switch asserted")
    if radius > geofence_radius:
        reasons.append("geofence exceeded")
    if any(abs(value) > max_attitude for value in attitude):
        reasons.append("attitude envelope exceeded")
    if any(abs(value) > max_rate for value in rates):
        reasons.append("rate envelope exceeded")
    if battery < min_battery:
        reasons.append("battery floor reached")
    return {
        "artifactKind": "supervisor-decision",
        "allowPolicy": not reasons,
        "command": "policy-advisory" if not reasons else "supervisor-hold",
        "rateHz": {"policyAdvisory": 50, "supervisor": 200},
        "reasons": reasons,
    }


@registry.register("bridge.config-diff")
def handle_config_diff(job: Job) -> dict[str, Any]:
    return compile_config_diff(job.payload)


@registry.register("bridge.telemetry-ingest")
def handle_telemetry_ingest(job: Job) -> dict[str, Any]:
    return ingest_telemetry(job.payload)


@registry.register("bridge.supervisor-check")
def handle_supervisor_check(job: Job) -> dict[str, Any]:
    return supervisor_check(job.payload)
