"""External live-executor adapters for heavyweight worker paths.

Commands receive the worker payload as JSON on stdin and must return a JSON object
on stdout. This lets deployments pin COLMAP/SB3/MuJoCo/MJX stacks in their own
images without making local fixture workers import those dependencies.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
from typing import Any


def configured_command(env_name: str) -> list[str] | None:
    raw = os.environ.get(env_name, "").strip()
    if not raw:
        return None
    return shlex.split(raw)


def run_json_command(env_name: str, payload: dict[str, Any], *, timeout_s: float = 3600.0) -> dict[str, Any] | None:
    command = configured_command(env_name)
    if command is None:
        return None
    proc = subprocess.run(
        command,
        input=json.dumps(payload, sort_keys=True),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout_s,
        check=False,
    )
    if proc.returncode != 0:
        detail = proc.stderr.strip() or proc.stdout.strip() or f"exit {proc.returncode}"
        raise RuntimeError(f"{env_name} failed: {detail[:1000]}")
    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"{env_name} returned invalid JSON") from exc
    if not isinstance(result, dict):
        raise RuntimeError(f"{env_name} returned non-object JSON")
    return result
