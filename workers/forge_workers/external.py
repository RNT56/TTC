"""External live-executor adapters for heavyweight worker paths.

Commands receive the worker payload as JSON on stdin and must return a JSON object
on stdout. This lets deployments pin COLMAP/SB3/MuJoCo/MJX stacks in their own
images without making local fixture workers import those dependencies.
"""

from __future__ import annotations

import json
import os
import shlex
import signal
import subprocess
import tempfile
import time
from typing import Any

from forge_workers.faults import JobTimeoutError, ProviderUnavailableError
from forge_workers.net_security import assert_bounded_json

MAX_COMMAND_INPUT_BYTES = 4 * 1024 * 1024
MAX_COMMAND_OUTPUT_BYTES = 8 * 1024 * 1024
MAX_COMMAND_ERROR_BYTES = 256 * 1024


def configured_command(env_name: str) -> list[str] | None:
    raw = os.environ.get(env_name, "").strip()
    if not raw:
        return None
    return shlex.split(raw)


def _terminate(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return
    try:
        if os.name != "nt":
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            proc.kill()
    except ProcessLookupError:
        return
    proc.wait(timeout=5)


def _read_bounded(stream, limit: int, label: str) -> bytes:  # noqa: ANN001
    size = os.fstat(stream.fileno()).st_size
    if size > limit:
        raise RuntimeError(f"{label} exceeds the byte limit")
    stream.seek(0)
    return stream.read(limit + 1)


def run_json_command(env_name: str, payload: dict[str, Any], *, timeout_s: float = 3600.0) -> dict[str, Any] | None:
    command = configured_command(env_name)
    if command is None:
        return None
    assert_bounded_json(payload, label=f"{env_name} input", max_bytes=MAX_COMMAND_INPUT_BYTES)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    timeout = max(1.0, min(float(timeout_s), 8 * 60 * 60))
    overflow = False
    timed_out = False
    with (
        tempfile.TemporaryFile() as stdin,
        tempfile.TemporaryFile() as stdout,
        tempfile.TemporaryFile() as stderr,
    ):
        stdin.write(encoded)
        stdin.seek(0)
        proc = subprocess.Popen(
            command,
            stdin=stdin,
            stdout=stdout,
            stderr=stderr,
            start_new_session=os.name != "nt",
        )
        deadline = time.monotonic() + timeout
        while proc.poll() is None:
            if time.monotonic() >= deadline:
                timed_out = True
                _terminate(proc)
                break
            if (
                os.fstat(stdout.fileno()).st_size > MAX_COMMAND_OUTPUT_BYTES
                or os.fstat(stderr.fileno()).st_size > MAX_COMMAND_ERROR_BYTES
            ):
                overflow = True
                _terminate(proc)
                break
            time.sleep(0.05)
        if timed_out:
            raise JobTimeoutError(f"{env_name} timed out")
        if overflow:
            raise RuntimeError(f"{env_name} output exceeds the byte limit")
        stdout_bytes = _read_bounded(stdout, MAX_COMMAND_OUTPUT_BYTES, f"{env_name} stdout")
        _read_bounded(stderr, MAX_COMMAND_ERROR_BYTES, f"{env_name} stderr")
        returncode = int(proc.returncode or 0)
    if returncode != 0:
        raise ProviderUnavailableError(f"{env_name} failed (exit {returncode})")
    try:
        result = json.loads(stdout_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
        raise RuntimeError(f"{env_name} returned invalid JSON") from exc
    if not isinstance(result, dict):
        raise RuntimeError(f"{env_name} returned non-object JSON")
    assert_bounded_json(result, label=f"{env_name} output", max_bytes=MAX_COMMAND_OUTPUT_BYTES)
    return result
