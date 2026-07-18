"""Container liveness and readiness probes for the private queue worker."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Mapping

from forge_workers.deployment import assert_deployment_bootstrap
from forge_workers.runtime_secrets import load_managed_runtime_secrets


def process_is_live(command_path: Path = Path("/proc/1/cmdline")) -> bool:
    try:
        command = command_path.read_bytes().replace(b"\x00", b" ")
    except OSError:
        return False
    return b"forge_workers.runner" in command


def worker_is_ready(env: Mapping[str, str] | None = None) -> bool:
    values = os.environ if env is None else env
    try:
        assert_deployment_bootstrap(values)
        validator = Path(values.get("FORGE_VALIDATE_BIN", "forge-validate"))
        if not validator.is_file() or not os.access(validator, os.X_OK):
            return False
        database_url = values.get("DATABASE_URL")
        if not database_url:
            return False
        import psycopg

        with psycopg.connect(database_url, connect_timeout=3) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                return cursor.fetchone() == (1,)
    except Exception:
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("live", "ready"))
    args = parser.parse_args(argv)
    if args.mode == "live":
        return 0 if process_is_live() else 1
    load_managed_runtime_secrets()
    return 0 if worker_is_ready() else 1


if __name__ == "__main__":
    raise SystemExit(main())
