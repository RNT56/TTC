"""Replay verification workers (P6/P10).

Stable replay tapes are hashed before leaderboard/course admission. The fixture
path rejects obvious tampering while keeping the contract deterministic.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from forge_workers.queue import Job, registry


def replay_hash(tape: Any) -> str:
    encoded = json.dumps(tape, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def verify_replay(payload: dict[str, Any]) -> dict[str, Any]:
    tape = payload.get("tape")
    if not isinstance(tape, dict):
        raise ValueError("replay.verify requires tape object")
    frames = tape.get("frames", [])
    if not isinstance(frames, list) or not frames:
        raise ValueError("replay tape requires non-empty frames")
    times = [float(frame.get("t", 0)) for frame in frames if isinstance(frame, dict)]
    if len(times) != len(frames):
        raise ValueError("replay frames must be objects with numeric t")
    digest = replay_hash(tape)
    expected = payload.get("expectedHash")
    monotonic = all(a < b for a, b in zip(times, times[1:]))
    header = tape.get("header", {})
    header_record = header if isinstance(header, dict) else {}
    expected_contract_hash = payload.get("expectedContractHash")
    contract_ok = (
        expected_contract_hash is None
        or header_record.get("contractHash") == expected_contract_hash
    )
    dimensions = _leaderboard_dimensions(payload, header_record)
    verified = expected in (None, digest) and monotonic and contract_ok
    reject_reason = None
    if expected not in (None, digest):
        reject_reason = "replay hash mismatch"
    elif not monotonic:
        reject_reason = "replay timestamps are not strictly increasing"
    elif not contract_ok:
        reject_reason = "contract hash mismatch"
    return {
        "artifactKind": "replay",
        "verified": verified,
        "tamperHash": digest,
        "frameCount": len(frames),
        "durationS": max(0.0, times[-1] - times[0]) if times else 0.0,
        "header": header_record,
        "courseId": dimensions["courseId"],
        "archetype": dimensions["archetype"],
        "class": dimensions["class"],
        "dimensions": dimensions,
        "rejectReason": reject_reason,
    }


def _leaderboard_dimensions(payload: dict[str, Any], header: dict[str, Any]) -> dict[str, str | None]:
    return {
        "courseId": _first_string(payload.get("courseId"), header.get("courseId"), _nested(header, "env", "courseId")),
        "archetype": _first_string(
            payload.get("archetype"),
            header.get("archetype"),
            header.get("modelArchetype"),
            header.get("contractArchetype"),
        ),
        "class": _first_string(
            payload.get("class"),
            payload.get("className"),
            header.get("class"),
            header.get("modelClass"),
            header.get("boardClass"),
        ),
        "modelId": _first_string(payload.get("modelId"), header.get("modelId")),
        "policyId": _first_string(payload.get("policyId"), header.get("policyId")),
        "contractHash": _first_string(header.get("contractHash")),
    }


def _nested(value: dict[str, Any], *path: str) -> Any:
    current: Any = value
    for key in path:
        if not isinstance(current, dict):
            return None
        current = current.get(key)
    return current


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return None


@registry.register("replay.verify")
def handle_replay_verify(job: Job) -> dict[str, Any]:
    return verify_replay(job.payload)
