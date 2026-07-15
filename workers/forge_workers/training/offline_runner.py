"""JSON-stdin command for the exact P7-009 offline-learning adapter."""

from __future__ import annotations

import json
import sys
from typing import TextIO

from forge_workers.external import MAX_COMMAND_INPUT_BYTES
from forge_workers.training.bundle import compile_training_bundle


def main(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout, stderr: TextIO = sys.stderr) -> int:
    try:
        raw = stdin.read(MAX_COMMAND_INPUT_BYTES + 1)
        if not raw or len(raw.encode("utf-8")) > MAX_COMMAND_INPUT_BYTES:
            raise ValueError("offline training request is empty or exceeds 4 MiB")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("offline training request must be one JSON object")
        if payload.get("jobKind") != "train.offline-bc":
            raise ValueError("offline training command accepts train.offline-bc requests only")
        if payload.get("recipe") != "p7-offline-bc-v1":
            raise ValueError("offline training command requires p7-offline-bc-v1")
        bundle = compile_training_bundle(payload)
        from forge_workers.training.sb3_training import train_sb3_policy

        result = train_sb3_policy(payload, bundle)
        json.dump(result, stdout, sort_keys=True, separators=(",", ":"), allow_nan=False)
        stdout.write("\n")
        return 0
    except Exception as error:  # noqa: BLE001 - command boundary converts all failures.
        print(f"forge-offline-training: {error}", file=stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
