"""Queue consumption skeleton (graphile-worker table polling — plan §6).

The DB wiring (psycopg, SKIP LOCKED claim loop) lands with P3's first real
worker; the handler registry and idempotency discipline are real now and
unit-tested. Handlers must be safe to retry (BEST-PRACTICES §5).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


@dataclass
class Job:
    """One claimed job row. `idempotency_key` makes retries safe to dedupe."""

    id: str
    task: str
    payload: dict[str, Any]
    idempotency_key: str
    attempts: int = 0


class JobHandler(Protocol):
    def __call__(self, job: Job) -> dict[str, Any]: ...


@dataclass
class HandlerRegistry:
    """Task name → handler. Job families: etl.*, occt.*, photoscan.*, train.*,
    replay.*, codesign.* (architecture §3 job taxonomy)."""

    _handlers: dict[str, JobHandler] = field(default_factory=dict)

    def register(self, task: str) -> Callable[[JobHandler], JobHandler]:
        def deco(fn: JobHandler) -> JobHandler:
            if task in self._handlers:
                raise ValueError(f"duplicate handler for task '{task}'")
            self._handlers[task] = fn
            return fn

        return deco

    def dispatch(self, job: Job) -> dict[str, Any]:
        try:
            handler = self._handlers[job.task]
        except KeyError as exc:
            raise KeyError(
                f"no handler for task '{job.task}' "
                f"(registered: {sorted(self._handlers)})"
            ) from exc
        result = handler(job)
        # results must be JSON-serializable — they land in Postgres
        json.dumps(result)
        return result

    def tasks(self) -> list[str]:
        return sorted(self._handlers)


registry = HandlerRegistry()
"""Process-global registry the worker families register into on import."""
