"""Bridge, telemetry, and supervisor workers (P8).

Live serial/WebUSB/Tauri capture is UI/runtime-owned. These handlers compile the
same deterministic payloads that those surfaces submit: FC config diffs,
telemetry replay tapes, and fail-closed supervisor decisions.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from forge_workers.queue import Job, registry


def _stable_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def compile_config_diff(payload: dict[str, Any]) -> dict[str, Any]:
    firmware = str(payload.get("firmware", "betaflight")).lower()
    if firmware not in {"betaflight", "ardupilot", "ros2"}:
        raise ValueError("bridge.config-diff firmware must be betaflight, ardupilot, or ros2")
    rates = payload.get("rates", {})
    mixer = payload.get("mixer", "quadx")
    if not isinstance(rates, dict):
        raise ValueError("bridge.config-diff rates must be an object")
    lines = [f"# FORGE generated {firmware} config diff", f"mixer {mixer}"]
    for key in sorted(rates):
        lines.append(f"set {key} = {rates[key]}")
    lines.append("save")
    return {
        "artifactKind": "bridge-config",
        "firmware": firmware,
        "diffHash": _stable_hash(lines),
        "requiresPhysicalConfirmation": True,
        "lines": lines,
    }


def ingest_telemetry(payload: dict[str, Any]) -> dict[str, Any]:
    samples = payload.get("samples", [])
    if not isinstance(samples, list) or not samples:
        raise ValueError("bridge.telemetry-ingest requires non-empty samples")
    frames: list[dict[str, Any]] = []
    for sample in samples:
        if not isinstance(sample, dict) or "t" not in sample:
            raise ValueError("telemetry sample must include t")
        frames.append({"t": float(sample["t"]), "state": sample})
    frames.sort(key=lambda frame: frame["t"])
    tape = {
        "schemaVersion": "replay.v1",
        "header": {
            "contractHash": payload.get("contractHash"),
            "lockfileHash": payload.get("lockfileHash"),
            "seed": payload.get("seed", 0),
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
    cfg = payload.get("config", {})
    state = payload.get("state", {})
    if not isinstance(cfg, dict) or not isinstance(state, dict):
        raise ValueError("bridge.supervisor-check requires config and state objects")
    reasons: list[str] = []
    pos = state.get("positionM", [0, 0, 0])
    attitude = state.get("attitudeRad", [0, 0, 0])
    rates = state.get("rateRadS", [0, 0, 0])
    radius = (float(pos[0]) ** 2 + float(pos[2]) ** 2) ** 0.5 if isinstance(pos, list) and len(pos) >= 3 else 0.0
    if state.get("killSwitch"):
        reasons.append("kill switch asserted")
    if radius > float(cfg.get("geofenceRadiusM", 25.0)):
        reasons.append("geofence exceeded")
    if isinstance(attitude, list) and any(abs(float(v)) > float(cfg.get("maxAttitudeRad", 0.9)) for v in attitude):
        reasons.append("attitude envelope exceeded")
    if isinstance(rates, list) and any(abs(float(v)) > float(cfg.get("maxRateRadS", 6.0)) for v in rates):
        reasons.append("rate envelope exceeded")
    if float(state.get("batteryV", 999.0)) < float(cfg.get("minBatteryV", 0.0)):
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
