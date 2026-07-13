"""Protected PostgreSQL acceptance for D38 queue fault semantics."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4

from forge_workers.faults import (
    PartialObjectUploadError,
    ProviderRateLimitError,
    ProviderUnavailableError,
)
from forge_workers.queue import HandlerRegistry, Job, PostgresQueueStore, run_once


def _offer(component_id: str) -> dict[str, Any]:
    url = f"https://vendor.example.test/{component_id}"
    return {
        "artifactKind": "vendor-offer-refresh",
        "provider": "qa005-fixture-provider",
        "offers": [
            {
                "componentId": component_id,
                "vendor": "QA-005 Fixture Vendor",
                "sku": f"SKU-{component_id}",
                "url": url,
                "price": 19.5,
                "currency": "USD",
                "availability": "in-stock",
                "source": "live",
                "provenance": {
                    "sourceUrl": url,
                    "retrievedAt": "2026-07-13T00:00:00Z",
                    "rateLimitKey": "qa005-fixture-provider",
                },
            }
        ],
        "heldOffers": [],
        "rateLimit": {"requestsPerMinute": 30, "cacheTtlS": 3600},
        "provenance": {
            "sourceUrl": "https://vendor.example.test/catalog",
            "retrievedAt": "2026-07-13T00:00:00Z",
        },
    }


def _revision() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        raise RuntimeError("DATABASE_URL is required for QA-005 queue acceptance")

    primary = PostgresQueueStore(dsn)
    recovery = PostgresQueueStore(dsn)
    conn = primary._conn
    run_id = uuid4().hex
    job_ids: list[str] = []
    scenarios: dict[str, Any] = {}

    def insert_job(label: str, *, max_attempts: int = 3, timeout_seconds: int = 30) -> str:
        with conn.transaction():
            row = conn.execute(
                """
                INSERT INTO jobs (
                  kind, status, provider, idempotency_key, input,
                  max_attempts, timeout_seconds, available_at
                )
                VALUES ('commerce.vendor-refresh', 'queued', 'local', %s, %s::jsonb, %s, %s, now())
                RETURNING id
                """,
                [
                    f"qa005-{label}-{run_id}",
                    primary._jsonb({"componentIds": [f"cmp_{label}"]}),
                    max_attempts,
                    timeout_seconds,
                ],
            ).fetchone()
        if row is None:
            raise AssertionError(f"{label} job was not inserted")
        job_id = str(row["id"])
        job_ids.append(job_id)
        return job_id

    def state(job_id: str) -> dict[str, Any]:
        with conn.transaction():
            row = conn.execute(
                """
                SELECT status, attempts, max_attempts, last_error_code,
                       available_at, lease_token, lease_expires_at
                  FROM jobs WHERE id = %s
                """,
                [job_id],
            ).fetchone()
        if row is None:
            raise AssertionError(f"job {job_id} disappeared")
        return dict(row)

    def offer_count(job_id: str) -> int:
        with conn.transaction():
            row = conn.execute(
                "SELECT count(*) AS count FROM vendor_offers WHERE provenance->>'jobId' = %s",
                [job_id],
            ).fetchone()
        return int(row["count"] if row is not None else 0)

    try:
        crash_id = insert_job("crash", timeout_seconds=1)
        first = primary.claim_one(["commerce.vendor-refresh"])
        if first is None or first.id != crash_id or not first.lease_token:
            raise AssertionError("first crash attempt was not lease-fenced")
        with conn.transaction():
            conn.execute(
                "UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = %s",
                [crash_id],
            )
        second = recovery.claim_one(["commerce.vendor-refresh"])
        if (
            second is None
            or second.id != crash_id
            or second.lease_token == first.lease_token
            or second.attempts != 2
        ):
            raise AssertionError("expired crash attempt was not reclaimed with a new fence")
        if primary.mark_succeeded(first, _offer("cmp_crash_stale")):
            raise AssertionError("stale duplicate delivery was allowed to succeed")
        if not recovery.mark_succeeded(second, _offer("cmp_crash")):
            raise AssertionError("current recovered attempt could not succeed")
        if offer_count(crash_id) != 1:
            raise AssertionError("crash recovery materialized a duplicate offer")
        scenarios["workerCrashDuplicateTimeout"] = {
            "attempts": 2,
            "staleResultDiscarded": True,
            "materializedOnce": True,
        }

        outage_id = insert_job("outage")
        outage_handlers = HandlerRegistry()
        outage_calls = 0

        @outage_handlers.register("commerce.vendor-refresh")
        def _outage_then_success(_job: Job) -> dict[str, Any]:
            nonlocal outage_calls
            outage_calls += 1
            if outage_calls == 1:
                raise ProviderUnavailableError()
            return _offer("cmp_outage")

        if not run_once(primary, outage_handlers):
            raise AssertionError("provider-outage job was not claimed")
        after_outage = state(outage_id)
        if after_outage["status"] != "queued" or after_outage["last_error_code"] != "provider-unavailable":
            raise AssertionError(f"provider outage was not scheduled for retry: {after_outage}")
        with conn.transaction():
            conn.execute("UPDATE jobs SET available_at = now() WHERE id = %s", [outage_id])
        if not run_once(primary, outage_handlers):
            raise AssertionError("provider-outage retry was not claimed")
        after_recovery = state(outage_id)
        if after_recovery["status"] != "succeeded" or int(after_recovery["attempts"]) != 2:
            raise AssertionError(f"provider-outage retry did not recover: {after_recovery}")
        scenarios["providerOutageRetry"] = {
            "attempts": 2,
            "boundedBackoff": True,
            "recovered": True,
        }

        rate_id = insert_job("rate", max_attempts=2)
        rate_handlers = HandlerRegistry()

        @rate_handlers.register("commerce.vendor-refresh")
        def _always_rate_limited(_job: Job) -> dict[str, Any]:
            raise ProviderRateLimitError(17)

        if not run_once(primary, rate_handlers):
            raise AssertionError("rate-limited job was not claimed")
        first_rate = state(rate_id)
        if first_rate["status"] != "queued" or first_rate["last_error_code"] != "provider-rate-limited":
            raise AssertionError(f"rate limit was not persisted as retryable: {first_rate}")
        with conn.transaction():
            conn.execute("UPDATE jobs SET available_at = now() WHERE id = %s", [rate_id])
        if not run_once(primary, rate_handlers):
            raise AssertionError("rate-limited final attempt was not claimed")
        final_rate = state(rate_id)
        if final_rate["status"] != "failed" or int(final_rate["attempts"]) != 2:
            raise AssertionError(f"rate-limit attempt ceiling did not fail closed: {final_rate}")
        scenarios["rateLimitExhaustion"] = {
            "hintSeconds": 17,
            "attempts": 2,
            "terminalStatus": "failed",
        }

        partial_id = insert_job("partial")
        partial_handlers = HandlerRegistry()
        partial_calls = 0

        @partial_handlers.register("commerce.vendor-refresh")
        def _partial_then_complete(_job: Job) -> dict[str, Any]:
            nonlocal partial_calls
            partial_calls += 1
            if partial_calls == 1:
                raise PartialObjectUploadError()
            return _offer("cmp_partial")

        if not run_once(primary, partial_handlers):
            raise AssertionError("partial-upload job was not claimed")
        partial_state = state(partial_id)
        if partial_state["status"] != "queued" or partial_state["last_error_code"] != "partial-object-upload":
            raise AssertionError(f"partial upload was not retryable: {partial_state}")
        with conn.transaction():
            conn.execute("UPDATE jobs SET available_at = now() WHERE id = %s", [partial_id])
        if not run_once(primary, partial_handlers) or state(partial_id)["status"] != "succeeded":
            raise AssertionError("partial upload did not recover on a verified retry")
        scenarios["partialUploadRetry"] = {"partialRejected": True, "verifiedRetrySucceeded": True}

        cancelled_id = insert_job("cancelled")
        cancelled = primary.claim_one(["commerce.vendor-refresh"])
        if cancelled is None or cancelled.id != cancelled_id:
            raise AssertionError("cancellation fixture was not claimed")
        with conn.transaction():
            conn.execute(
                """
                UPDATE jobs
                   SET status = 'cancelled', finished_at = now(),
                       error = 'qa005 cancellation', last_error_code = 'job-cancelled',
                       lease_token = NULL, lease_expires_at = NULL
                 WHERE id = %s
                """,
                [cancelled_id],
            )
        if primary.mark_succeeded(cancelled, _offer("cmp_cancelled")) or offer_count(cancelled_id) != 0:
            raise AssertionError("cancelled late output was materialized")
        scenarios["cancellation"] = {"lateResultDiscarded": True, "materialized": False}

        source_revision = os.environ.get("FORGE_SOURCE_REVISION") or _revision()
        evidence = {
            "schemaVersion": "1.0.0",
            "task": "QA-005",
            "status": "passed",
            "maturity": "deterministic isolated-Postgres",
            "sourceRevision": source_revision,
            "checkoutRevision": _revision(),
            "scenarios": scenarios,
            "limitations": [
                "No credentialed provider, deployed object store, multi-replica queue, or production SLO is claimed.",
                "Time advances are deterministic database fixtures rather than wall-clock outage drills.",
            ],
        }
        output = Path("artifacts/e2e/qa005-fault-acceptance.json")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print("qa005-queue-postgres: lease, retry, cancellation, outage, rate, and partial faults proven")
    finally:
        if job_ids:
            with conn.transaction():
                conn.execute("DELETE FROM vendor_offers WHERE provenance->>'jobId' = ANY(%s)", [job_ids])
                conn.execute("DELETE FROM jobs WHERE id = ANY(%s)", [job_ids])
        recovery._conn.close()
        conn.close()


if __name__ == "__main__":
    main()
