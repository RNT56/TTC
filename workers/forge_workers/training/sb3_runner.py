"""JSON-stdin command for FORGE_SB3_TRAIN_CMD."""

from __future__ import annotations

import json
import sys
from typing import TextIO

from forge_workers.training.bundle import compile_training_bundle


def main(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout, stderr: TextIO = sys.stderr) -> int:
    try:
        raw = stdin.read(2 * 1024 * 1024 + 1)
        if not raw or len(raw.encode("utf-8")) > 2 * 1024 * 1024:
            raise ValueError("SB3 request is empty or exceeds 2 MiB")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("SB3 request must be one JSON object")
        if payload.get("jobKind") != "train.policy":
            raise ValueError("SB3 command accepts train.policy requests only")
        bundle = compile_training_bundle(payload)
        from forge_workers.training.sb3_training import train_sb3_policy

        result = train_sb3_policy(payload, bundle)
        json.dump(result, stdout, sort_keys=True, separators=(",", ":"), allow_nan=False)
        stdout.write("\n")
        return 0
    except Exception as error:  # noqa: BLE001 - command boundary converts all failures.
        print(f"forge-sb3: {error}", file=stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
