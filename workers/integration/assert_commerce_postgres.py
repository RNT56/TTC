"""Protected Postgres acceptance for transactional vendor-offer materialization."""

from __future__ import annotations

import os
from typing import Any
from uuid import uuid4

from forge_workers.queue import HandlerRegistry, Job, PostgresQueueStore, run_once


def _offer(component_id: str, *, url: str) -> dict[str, Any]:
    return {
        "componentId": component_id,
        "vendor": "Protected Fixture Vendor",
        "sku": f"SKU-{component_id}",
        "url": url,
        "price": 19.5,
        "currency": "USD",
        "availability": "in-stock",
        "source": "live",
        "provenance": {
            "sourceUrl": url,
            "retrievedAt": "2026-07-13T00:00:00Z",
            "rateLimitKey": "protected-fixture-vendor",
        },
    }


def _output(*offers: dict[str, Any]) -> dict[str, Any]:
    return {
        "artifactKind": "vendor-offer-refresh",
        "provider": "protected-fixture-vendor",
        "offers": list(offers),
        "heldOffers": [],
        "rateLimit": {"requestsPerMinute": 30, "cacheTtlS": 3600},
        "provenance": {
            "sourceUrl": "https://vendor.example.test/catalog",
            "retrievedAt": "2026-07-13T00:00:00Z",
        },
    }


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        raise RuntimeError("DATABASE_URL is required for commerce Postgres acceptance")

    store = PostgresQueueStore(dsn)
    conn = store._conn
    job_ids: list[str] = []
    run_id = uuid4().hex
    try:
        with conn.transaction():
            valid_job = conn.execute(
                """
                INSERT INTO jobs (kind, status, provider, idempotency_key, input)
                VALUES ('commerce.vendor-refresh', 'queued', 'local', %s, %s::jsonb)
                RETURNING id
                """,
                [
                    f"commerce-postgres-valid-{run_id}",
                    store._jsonb({"componentIds": ["cmp_pg_valid"]}),
                ],
            ).fetchone()
        if valid_job is None:
            raise AssertionError("valid commerce job was not inserted")
        valid_job_id = str(valid_job["id"])
        job_ids.append(valid_job_id)

        valid_handlers = HandlerRegistry()

        @valid_handlers.register("commerce.vendor-refresh")
        def _valid_output(_job: Job) -> dict[str, Any]:
            return _output(_offer("cmp_pg_valid", url="https://vendor.example.test/cmp-pg-valid"))

        if not run_once(store, valid_handlers):
            raise AssertionError("valid commerce job was not claimed")

        with conn.transaction():
            valid_state = conn.execute(
                """
                SELECT j.status,
                       count(v.id) AS offer_count,
                       min(v.provenance->>'jobId') AS materialized_job_id
                  FROM jobs j
             LEFT JOIN vendor_offers v ON v.provenance->>'jobId' = j.id::text
                 WHERE j.id = %s
              GROUP BY j.status
                """,
                [valid_job_id],
            ).fetchone()
        if (
            valid_state is None
            or valid_state["status"] != "succeeded"
            or int(valid_state["offer_count"]) != 1
            or valid_state["materialized_job_id"] != valid_job_id
        ):
            raise AssertionError(f"valid commerce materialization drifted: {valid_state}")

        with conn.transaction():
            invalid_job = conn.execute(
                """
                INSERT INTO jobs (kind, status, provider, idempotency_key, input)
                VALUES ('commerce.vendor-refresh', 'queued', 'local', %s, %s::jsonb)
                RETURNING id
                """,
                [
                    f"commerce-postgres-invalid-{run_id}",
                    store._jsonb({"componentIds": ["cmp_pg_invalid"]}),
                ],
            ).fetchone()
        if invalid_job is None:
            raise AssertionError("invalid commerce job fixture was not inserted")
        invalid_job_id = str(invalid_job["id"])
        job_ids.append(invalid_job_id)

        invalid_handlers = HandlerRegistry()

        @invalid_handlers.register("commerce.vendor-refresh")
        def _invalid_output(_job: Job) -> dict[str, Any]:
            return _output(
                _offer("cmp_pg_would_be_partial", url="https://vendor.example.test/partial"),
                _offer("cmp_pg_invalid", url="https://127.0.0.1/private"),
            )

        if not run_once(store, invalid_handlers):
            raise AssertionError("invalid commerce job was not claimed")

        with conn.transaction():
            invalid_state = conn.execute(
                """
                SELECT j.status, j.error, count(v.id) AS offer_count
                  FROM jobs j
             LEFT JOIN vendor_offers v ON v.provenance->>'jobId' = j.id::text
                 WHERE j.id = %s
              GROUP BY j.status, j.error
                """,
                [invalid_job_id],
            ).fetchone()
        if (
            invalid_state is None
            or invalid_state["status"] != "failed"
            or "URL is invalid" not in str(invalid_state["error"])
            or int(invalid_state["offer_count"]) != 0
        ):
            raise AssertionError(f"invalid commerce transaction did not roll back: {invalid_state}")

        print("commerce-postgres: success and corrupt-output rollback are transactionally proven")
    finally:
        if job_ids:
            with conn.transaction():
                conn.execute(
                    "DELETE FROM vendor_offers WHERE provenance->>'jobId' = ANY(%s)",
                    [job_ids],
                )
                conn.execute("DELETE FROM jobs WHERE id = ANY(%s)", [job_ids])
        conn.close()


if __name__ == "__main__":
    main()
