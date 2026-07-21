"""Local worker runner used by docker-compose."""

from __future__ import annotations

import os
import signal
import sys
import time

from forge_workers import register_all_handlers
from forge_workers.deployment import assert_deployment_bootstrap
from forge_workers.queue import PostgresQueueStore, registry, run_forever
from forge_workers.observability import (
    create_stdout_worker_observation_sink,
    worker_observability_runtime_context,
)
from forge_workers.runtime_secrets import load_managed_runtime_secrets


def main() -> None:
    load_managed_runtime_secrets()
    assert_deployment_bootstrap()
    register_all_handlers()
    print(f"forge-workers ready: {', '.join(registry.tasks())}", file=sys.stderr, flush=True)
    database_url = os.environ.get("DATABASE_URL")
    running = True

    def stop(_signum: int, _frame: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    if database_url:
        store = PostgresQueueStore(database_url)
        print("forge-workers queue connected", file=sys.stderr, flush=True)
        run_forever(
            store,
            registry,
            poll_seconds=float(os.environ.get("FORGE_WORKER_POLL_SECONDS", "1")),
            should_stop=lambda: not running,
            observation_sink=create_stdout_worker_observation_sink(),
            observability_runtime=worker_observability_runtime_context(),
        )
        return

    print("forge-workers idle: DATABASE_URL is not set", file=sys.stderr, flush=True)
    while running:
        time.sleep(1)


if __name__ == "__main__":
    main()
