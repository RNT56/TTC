"""Queue consumption for the local worker plane.

The handler registry stays dependency-free for tests. The Postgres store is
loaded lazily by the runner so CI can exercise the deterministic fixture
handlers without requiring a database driver.
"""

from __future__ import annotations

import json
import hashlib
import ipaddress
import math
import os
import time
import urllib.parse
from dataclasses import dataclass, field, replace
from typing import Any, Callable, Protocol, Sequence

from forge_workers.faults import RetryableJobError, retry_delay_seconds


@dataclass
class Job:
    """One claimed job row. `idempotency_key` makes retries safe to dedupe."""

    id: str
    task: str
    payload: dict[str, Any]
    idempotency_key: str
    attempts: int = 0
    provider: str = "local"
    lease_token: str | None = None
    lease_expires_at: str | None = None
    max_attempts: int = 3
    timeout_seconds: int = 3600


class JobHandler(Protocol):
    def __call__(self, job: Job) -> dict[str, Any]: ...


class QueueStore(Protocol):
    """Persistence boundary used by the worker loop."""

    def claim_one(self, tasks: Sequence[str]) -> Job | None: ...

    def mark_succeeded(self, job: Job, output: dict[str, Any]) -> bool: ...

    def mark_failed(self, job: Job, error: str, code: str) -> bool: ...

    def mark_retryable(
        self,
        job: Job,
        error: str,
        code: str,
        retry_after_seconds: float,
    ) -> str | None: ...

    def record_event(self, job_id: str, event: str, payload: dict[str, Any]) -> None: ...


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
        # The persisted lease deadline is authoritative. Handlers receive the same
        # timeout through the existing payload seam so an external process cannot
        # outlive its attempt and occupy a worker after the result fence expires.
        effective_job = replace(
            job,
            payload={**job.payload, "timeoutS": job.timeout_seconds},
        )
        result = handler(effective_job)
        # results must be JSON-serializable — they land in Postgres
        json.dumps(result)
        return result

    def tasks(self) -> list[str]:
        return sorted(self._handlers)


registry = HandlerRegistry()
"""Process-global registry the worker families register into on import."""


def run_once(store: QueueStore, handlers: HandlerRegistry = registry) -> bool:
    """Claim and execute one queued job.

    Returns True when a job was claimed, regardless of success or failure. Handler
    exceptions fail the job closed and are not re-raised, so the long-running
    loop can continue processing subsequent jobs.
    """

    tasks = handlers.tasks()
    if not tasks:
        return False
    job = store.claim_one(tasks)
    if job is None:
        return False
    store.record_event(job.id, "started", {"task": job.task, "attempt": max(1, job.attempts)})
    try:
        output = handlers.dispatch(job)
        accepted = store.mark_succeeded(job, output)
    except RetryableJobError as exc:
        retry_after_seconds = retry_delay_seconds(job.attempts, exc.retry_after_seconds)
        error = f"{exc.code}: retryable worker failure"
        disposition = store.mark_retryable(
            job,
            error,
            exc.code,
            retry_after_seconds,
        )
        store.record_event(
            job.id,
            "retry-scheduled" if disposition == "queued" else "failed" if disposition == "failed" else "discarded",
            {
                "code": exc.code,
                "attempt": max(1, job.attempts),
                "retryAfterSeconds": retry_after_seconds,
            }
            if disposition == "queued"
            else {"code": exc.code} if disposition == "failed"
            else {"reason": "job lease is no longer current"},
        )
    except Exception as exc:  # noqa: BLE001 - queue workers must fail closed.
        error = f"{type(exc).__name__}: {exc}"
        accepted = store.mark_failed(job, error, "handler-failed")
        store.record_event(
            job.id,
            "failed" if accepted else "discarded",
            {"code": "handler-failed"} if accepted else {"reason": "job lease is no longer current"},
        )
    else:
        store.record_event(
            job.id,
            "succeeded" if accepted else "discarded",
            {"task": job.task} if accepted else {"reason": "job lease is no longer current"},
        )
    return True


def run_forever(
    store: QueueStore,
    handlers: HandlerRegistry = registry,
    *,
    poll_seconds: float = 1.0,
    should_stop: Callable[[], bool] | None = None,
) -> None:
    """Poll the queue until `should_stop` returns True."""

    stop = should_stop or (lambda: False)
    while not stop():
        claimed = run_once(store, handlers)
        if not claimed:
            time.sleep(poll_seconds)


class PostgresQueueStore:
    """Postgres-backed job store using FOR UPDATE SKIP LOCKED claims."""

    def __init__(self, dsn: str) -> None:
        try:
            import psycopg
            from psycopg.rows import dict_row
            from psycopg.types.json import Jsonb
        except ModuleNotFoundError as exc:  # pragma: no cover - exercised in Compose.
            raise RuntimeError(
                "psycopg is required for DATABASE_URL-backed workers; install workers with .[queue]"
            ) from exc
        self._jsonb = Jsonb
        self._conn = psycopg.connect(dsn, autocommit=False, row_factory=dict_row)

    def claim_one(self, tasks: Sequence[str]) -> Job | None:
        if not tasks:
            return None
        with self._conn.transaction():
            self._conn.execute(
                """
                WITH exhausted AS (
                  UPDATE jobs
                     SET status = 'failed',
                         error = 'worker-crash-exhausted: retry attempts exhausted',
                         last_error_code = 'worker-crash-exhausted',
                         finished_at = now(),
                         lease_token = NULL,
                         lease_expires_at = NULL
                   WHERE status = 'running'
                     AND provider IN ('local', 'modal')
                     AND kind = ANY(%s)
                     AND lease_expires_at <= now()
                     AND attempts >= max_attempts
                  RETURNING id
                )
                INSERT INTO job_events (job_id, event, payload)
                SELECT id, 'failed', '{"code":"worker-crash-exhausted"}'::jsonb
                  FROM exhausted
                """,
                [list(tasks)],
            )
            row = self._conn.execute(
                """
                WITH claimed AS (
                  SELECT id
                    FROM jobs
                   WHERE provider IN ('local', 'modal')
                     AND kind = ANY(%s)
                     AND attempts < max_attempts
                     AND (
                       (status = 'queued' AND available_at <= now())
                       OR
                       (status = 'running' AND lease_expires_at <= now())
                     )
                   ORDER BY
                     CASE WHEN status = 'running' THEN 0 ELSE 1 END,
                     COALESCE(lease_expires_at, available_at),
                     created_at
                   FOR UPDATE SKIP LOCKED
                   LIMIT 1
                )
                UPDATE jobs AS target
                   SET status = 'running',
                       attempts = attempts + 1,
                       started_at = COALESCE(started_at, now()),
                       finished_at = NULL,
                       error = NULL,
                       last_error_code = NULL,
                       lease_token = encode(gen_random_bytes(16), 'hex'),
                       lease_expires_at = now() + make_interval(secs => timeout_seconds)
                  FROM claimed
                 WHERE target.id = claimed.id
                RETURNING target.id, target.kind, target.provider, target.input,
                          COALESCE(target.idempotency_key, target.id) AS idempotency_key,
                          target.attempts, target.lease_token, target.lease_expires_at,
                          target.max_attempts, target.timeout_seconds
                """,
                [list(tasks)],
            ).fetchone()
        if row is None:
            return None
        payload = row["input"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        if not isinstance(payload, dict):
            payload = {}
        return Job(
            id=str(row["id"]),
            task=str(row["kind"]),
            payload=payload,
            idempotency_key=str(row["idempotency_key"]),
            attempts=int(row["attempts"]),
            provider=str(row["provider"]),
            lease_token=str(row["lease_token"]),
            lease_expires_at=str(row["lease_expires_at"]),
            max_attempts=int(row["max_attempts"]),
            timeout_seconds=int(row["timeout_seconds"]),
        )

    def mark_succeeded(self, job: Job, output: dict[str, Any]) -> bool:
        if not job.lease_token:
            return False
        with self._conn.transaction():
            row = self._conn.execute(
                """
                UPDATE jobs
                   SET status = 'succeeded',
                       output = %s::jsonb,
                       error = NULL,
                       last_error_code = NULL,
                       finished_at = now(),
                       lease_token = NULL,
                       lease_expires_at = NULL
                 WHERE id = %s
                   AND status = 'running'
                   AND lease_token = %s
                   AND lease_expires_at > now()
                RETURNING owner_user_id, input
                """,
                [self._jsonb(output), job.id, job.lease_token],
            ).fetchone()
            if row is not None:
                self._materialize_job_output(
                    job_id=job.id,
                    owner_user_id=row["owner_user_id"],
                    job_input=_object(row["input"]),
                    output=output,
                )
                return True
        return False

    def mark_failed(self, job: Job, error: str, code: str) -> bool:
        if not job.lease_token:
            return False
        with self._conn.transaction():
            row = self._conn.execute(
                """
                UPDATE jobs
                   SET status = 'failed',
                       error = %s,
                       last_error_code = %s,
                       finished_at = now(),
                       lease_token = NULL,
                       lease_expires_at = NULL
                 WHERE id = %s
                   AND status = 'running'
                   AND lease_token = %s
                   AND lease_expires_at > now()
                RETURNING id
                """,
                [error, code, job.id, job.lease_token],
            ).fetchone()
        return row is not None

    def mark_retryable(
        self,
        job: Job,
        error: str,
        code: str,
        retry_after_seconds: float,
    ) -> str | None:
        if not job.lease_token:
            return None
        delay = retry_delay_seconds(job.attempts, retry_after_seconds)
        with self._conn.transaction():
            row = self._conn.execute(
                """
                UPDATE jobs
                   SET status = CASE WHEN attempts < max_attempts THEN 'queued' ELSE 'failed' END,
                       available_at = CASE
                         WHEN attempts < max_attempts THEN now() + make_interval(secs => %s)
                         ELSE available_at
                       END,
                       error = %s,
                       last_error_code = %s,
                       finished_at = CASE WHEN attempts < max_attempts THEN NULL ELSE now() END,
                       lease_token = NULL,
                       lease_expires_at = NULL
                 WHERE id = %s
                   AND status = 'running'
                   AND lease_token = %s
                   AND lease_expires_at > now()
                RETURNING status
                """,
                [delay, error, code, job.id, job.lease_token],
            ).fetchone()
        return str(row["status"]) if row is not None else None

    def record_event(self, job_id: str, event: str, payload: dict[str, Any]) -> None:
        with self._conn.transaction():
            self._conn.execute(
                """
                INSERT INTO job_events (job_id, event, payload)
                SELECT id, %s, %s::jsonb FROM jobs WHERE id = %s
                """,
                [event, self._jsonb(payload), job_id],
            )

    def _materialize_job_output(
        self,
        *,
        job_id: str,
        owner_user_id: str | None,
        job_input: dict[str, Any],
        output: dict[str, Any],
    ) -> None:
        artifact_kind = output.get("artifactKind")
        if artifact_kind == "vendor-offer-refresh":
            offers = _materializable_vendor_offers(output)
            provider = _required_bounded_string(output.get("provider"), "vendor refresh provider", 120)
            rate_limit = _materializable_rate_limit(output.get("rateLimit"))
            refresh_provenance = _materializable_refresh_provenance(output.get("provenance"))
            for offer in offers:
                provenance = {
                    **offer["provenance"],
                    "jobId": job_id,
                    "provider": provider,
                    "rateLimit": rate_limit,
                    "refreshProvenance": refresh_provenance,
                    "refreshedBy": str(owner_user_id) if owner_user_id is not None else None,
                    "normalizedBy": "forge-workers",
                }
                self._conn.execute(
                    """
                    INSERT INTO vendor_offers (
                      component_id, vendor, sku, url, price, currency,
                      availability, source, provenance
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    [
                        offer["componentId"],
                        offer["vendor"],
                        offer["sku"],
                        offer["url"],
                        offer["price"],
                        offer["currency"],
                        offer["availability"],
                        offer["source"],
                        self._jsonb(provenance),
                    ],
                )
            return
        if artifact_kind == "photoscan":
            artifact_blob_id = self._upsert_artifact_blob(
                owner_user_id=owner_user_id,
                purpose="photoscan-result",
                cache_key=_nested_cache_key(output, "objectCache"),
                content_type="model/gltf-binary",
                metadata={"jobId": job_id, "artifactKind": "photoscan"},
            )
            self._conn.execute(
                """
                INSERT INTO photoscan_artifacts (
                  owner_user_id, job_id, source_blob_ids, scale_axes_ports,
                  refit_primitives, candidate_component, validator_report, artifact_blob_id
                )
                VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s)
                """,
                [
                    owner_user_id,
                    job_id,
                    _string_list(output.get("sourceImages")),
                    self._jsonb(_object(output.get("alignment"))),
                    self._jsonb(output.get("primitiveRefit") if isinstance(output.get("primitiveRefit"), list) else []),
                    self._jsonb(output.get("candidateComponent")),
                    self._jsonb({"artifactKind": "photoscan", "acceptance": _object(output.get("acceptance"))}),
                    artifact_blob_id,
                ],
            )
            return
        if artifact_kind == "policy":
            scorecard = _object(output.get("scorecard"))
            artifact_blob_id = self._upsert_artifact_blob(
                owner_user_id=owner_user_id,
                purpose="policy-onnx",
                cache_key=_nested_cache_key(output, "onnx"),
                content_type="application/octet-stream",
                metadata={"jobId": job_id, "artifactKind": "policy"},
            )
            self._conn.execute(
                """
                INSERT INTO policy_artifacts (
                  owner_user_id, model_id, task_kind, scorecard, artifact_blob_id, export_gate
                )
                VALUES (%s, %s, %s, %s::jsonb, %s, %s)
                """,
                [
                    owner_user_id,
                    _model_id_from(job_input),
                    _task_id_from(output),
                    self._jsonb(scorecard),
                    artifact_blob_id,
                    "exportable" if scorecard.get("exportable") is True else "blocked",
                ],
            )
            return
        if artifact_kind == "telemetry-replay":
            self._conn.execute(
                """
                INSERT INTO telemetry_logs (owner_user_id, model_id, source, tape, privacy)
                VALUES (%s, %s, 'fixture', %s::jsonb, %s::jsonb)
                """,
                [
                    owner_user_id,
                    _model_id_from(job_input),
                    self._jsonb(output.get("tape") if isinstance(output.get("tape"), dict) else {"frames": []}),
                    self._jsonb({"sharing": "private"}),
                ],
            )
            return
        if artifact_kind == "replay":
            self._conn.execute(
                """
                INSERT INTO replay_artifacts (owner_user_id, model_id, tape, verification, tamper_hash)
                VALUES (%s, %s, %s::jsonb, %s::jsonb, %s)
                """,
                [
                    owner_user_id,
                    _model_id_from(job_input),
                    self._jsonb(job_input.get("tape") if isinstance(job_input.get("tape"), dict) else {"frames": []}),
                    self._jsonb(output),
                    output.get("tamperHash") if isinstance(output.get("tamperHash"), str) else None,
                ],
            )
            return
        if artifact_kind in {"wear-estimate", "crash-forensics", "repair-sheet"}:
            record_kind = {
                "wear-estimate": "wear",
                "crash-forensics": "crash-forensics",
                "repair-sheet": "repair-sheet",
            }[str(artifact_kind)]
            self._conn.execute(
                """
                INSERT INTO maintenance_records (owner_user_id, model_id, record_kind, severity, summary, payload)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                """,
                [
                    owner_user_id,
                    _model_id_from(job_input),
                    record_kind,
                    "warn" if artifact_kind == "crash-forensics" and output.get("crashDetected") is True else "info",
                    str(artifact_kind),
                    self._jsonb(output),
                ],
            )

    def _upsert_artifact_blob(
        self,
        *,
        owner_user_id: str | None,
        purpose: str,
        cache_key: str | None,
        content_type: str,
        metadata: dict[str, Any],
    ) -> str | None:
        if not cache_key:
            return None
        scoped_cache_key = f"{_owner_segment(owner_user_id)}:{cache_key}"
        row = self._conn.execute(
            """
            INSERT INTO object_blobs (
              owner_user_id, visibility, cache_key, bucket, object_key,
              content_type, metadata
            )
            VALUES (%s, 'private', %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (cache_key) DO UPDATE
            SET metadata = object_blobs.metadata || EXCLUDED.metadata,
                content_type = COALESCE(object_blobs.content_type, EXCLUDED.content_type)
            RETURNING id
            """,
            [
                owner_user_id,
                scoped_cache_key,
                os.environ.get("FORGE_OBJECT_BUCKET", "forge-artifacts"),
                _artifact_object_key(owner_user_id, purpose, cache_key),
                content_type,
                self._jsonb({**metadata, "purpose": purpose, "cacheKey": cache_key}),
            ],
        ).fetchone()
        return str(row["id"]) if row else None


def _object(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return value if isinstance(value, dict) else {}


def _string_list(value: Any) -> list[str]:
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _model_id_from(value: dict[str, Any]) -> str | None:
    model_id = value.get("modelId")
    return model_id if isinstance(model_id, str) else None


def _task_id_from(output: dict[str, Any]) -> str:
    task = _object(output.get("task"))
    task_id = task.get("id")
    return task_id if isinstance(task_id, str) else "fixture"


def _nested_cache_key(output: dict[str, Any], field: str) -> str | None:
    value = output.get(field)
    if not isinstance(value, dict):
        return None
    cache_key = value.get("cacheKey") or value.get("key")
    return cache_key if isinstance(cache_key, str) else None


def _safe_segment(value: str) -> str:
    segment = "".join(ch.lower() if ch.isalnum() or ch in "._-" else "-" for ch in value)
    segment = segment.strip("-")[:80]
    return segment or "artifact"


def _owner_segment(owner_user_id: str | None) -> str:
    return _safe_segment(owner_user_id or "system")


def _artifact_object_key(owner_user_id: str | None, purpose: str, cache_key: str) -> str:
    owner = _owner_segment(owner_user_id)
    safe_purpose = _safe_segment(purpose)
    safe_key = _safe_segment(cache_key)
    digest = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:16]
    return f"users/{owner}/{safe_purpose}/{safe_key}-{digest}"


def _materializable_vendor_offers(output: dict[str, Any]) -> list[dict[str, Any]]:
    raw_offers = output.get("offers")
    if not isinstance(raw_offers, list) or len(raw_offers) > 50:
        raise RuntimeError("vendor refresh result has an invalid offers array")
    offers: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_offers):
        if not isinstance(raw, dict):
            raise RuntimeError(f"vendor refresh offer {index} is not an object")
        component_id = _required_bounded_string(raw.get("componentId"), f"vendor offer {index} componentId", 200)
        vendor = _required_bounded_string(raw.get("vendor"), f"vendor offer {index} vendor", 120)
        sku = _optional_bounded_string(raw.get("sku"), f"vendor offer {index} sku", 160)
        url = _required_public_https(raw.get("url"), f"vendor offer {index} URL")
        price = raw.get("price")
        if (
            isinstance(price, bool)
            or not isinstance(price, (int, float))
            or not math.isfinite(float(price))
            or float(price) < 0
        ):
            raise RuntimeError(f"vendor refresh offer {index} has invalid price")
        currency = _required_bounded_string(raw.get("currency"), f"vendor offer {index} currency", 3).upper()
        if len(currency) != 3 or not currency.isalpha():
            raise RuntimeError(f"vendor refresh offer {index} has invalid currency")
        availability = raw.get("availability")
        if availability not in {"in-stock", "backorder", "out-of-stock", "unknown"}:
            raise RuntimeError(f"vendor refresh offer {index} has invalid availability")
        source = raw.get("source")
        if source not in {"catalog", "live", "sandbox"}:
            raise RuntimeError(f"vendor refresh offer {index} has invalid source")
        provenance = _object(raw.get("provenance"))
        source_url = _required_public_https(
            provenance.get("sourceUrl"),
            f"vendor offer {index} provenance sourceUrl",
        )
        retrieved_at = _optional_bounded_string(
            provenance.get("retrievedAt"),
            f"vendor offer {index} provenance retrievedAt",
            64,
        )
        rate_limit_key = _required_bounded_string(
            provenance.get("rateLimitKey"),
            f"vendor offer {index} provenance rateLimitKey",
            160,
        )
        offers.append(
            {
                "componentId": component_id,
                "vendor": vendor,
                "sku": sku,
                "url": url,
                "price": round(float(price), 4),
                "currency": currency,
                "availability": availability,
                "source": source,
                "provenance": {
                    "sourceUrl": source_url,
                    "retrievedAt": retrieved_at,
                    "rateLimitKey": rate_limit_key,
                },
            }
        )
    return offers


def _materializable_rate_limit(value: Any) -> dict[str, int]:
    raw = _object(value)
    requests_per_minute = raw.get("requestsPerMinute")
    cache_ttl_s = raw.get("cacheTtlS")
    if (
        isinstance(requests_per_minute, bool)
        or not isinstance(requests_per_minute, int)
        or not 1 <= requests_per_minute <= 600
        or isinstance(cache_ttl_s, bool)
        or not isinstance(cache_ttl_s, int)
        or not 1 <= cache_ttl_s <= 86_400
    ):
        raise RuntimeError("vendor refresh result has an invalid rateLimit")
    return {"requestsPerMinute": requests_per_minute, "cacheTtlS": cache_ttl_s}


def _materializable_refresh_provenance(value: Any) -> dict[str, str | None]:
    raw = _object(value)
    source_url = raw.get("sourceUrl")
    if source_url is not None:
        source_url = _required_public_https(source_url, "vendor refresh provenance sourceUrl")
    retrieved_at = _optional_bounded_string(
        raw.get("retrievedAt"),
        "vendor refresh provenance retrievedAt",
        64,
    )
    return {"sourceUrl": source_url, "retrievedAt": retrieved_at}


def _required_bounded_string(value: Any, label: str, max_length: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > max_length:
        raise RuntimeError(f"{label} is invalid")
    return value.strip()


def _optional_bounded_string(value: Any, label: str, max_length: int) -> str | None:
    if value is None:
        return None
    return _required_bounded_string(value, label, max_length)


def _required_public_https(value: Any, label: str) -> str:
    raw = _required_bounded_string(value, label, 2000)
    try:
        parsed = urllib.parse.urlsplit(raw)
        hostname = (parsed.hostname or "").rstrip(".").lower()
        if (
            parsed.scheme != "https"
            or not hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
            or hostname == "localhost"
            or hostname.endswith((".localhost", ".local"))
        ):
            raise RuntimeError(f"{label} is invalid")
        try:
            if not ipaddress.ip_address(hostname).is_global:
                raise RuntimeError(f"{label} is invalid")
        except ValueError:
            pass
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"{label} is invalid") from exc
    return raw
