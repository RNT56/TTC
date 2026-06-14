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
    expected_contract_hash = payload.get("expectedContractHash")
    contract_ok = (
        expected_contract_hash is None
        or isinstance(header, dict)
        and header.get("contractHash") == expected_contract_hash
    )
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
        "header": header if isinstance(header, dict) else {},
        "courseId": payload.get("courseId"),
        "rejectReason": reject_reason,
    }


@registry.register("replay.verify")
def handle_replay_verify(job: Job) -> dict[str, Any]:
    return verify_replay(job.payload)
