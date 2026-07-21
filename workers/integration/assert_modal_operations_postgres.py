"""Protected PostgreSQL acceptance for P7-013 Modal operation authority."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from uuid import uuid4

from forge_workers.queue import PostgresQueueStore


def _revision() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        raise RuntimeError("DATABASE_URL is required for P7-013 database acceptance")
    store = PostgresQueueStore(dsn)
    conn = store._conn
    run_id = uuid4().hex
    user_id = f"p7013-user-{run_id}"
    call_id = f"fc-p7013-{run_id}"
    contract_hash = "d" * 64
    evidence = {
        "schemaVersion": "p7-modal-operation-db/1.0.0",
        "task": "P7-013",
        "maturity": "fixture",
        "sourceRevision": os.environ.get("FORGE_SOURCE_REVISION") or _revision(),
        "checkoutRevision": _revision(),
        "status": "running",
        "scenarios": {},
        "nonClaim": "Database authority proof only; no Modal credential, deployment, GPU, billing, or sandbox run is asserted.",
    }
    job_id: str | None = None
    stale_job_id: str | None = None
    recovery_job_id: str | None = None
    try:
        with conn.transaction():
            conn.execute(
                "INSERT INTO users (id, name, email) VALUES (%s, 'P7-013 fixture', %s)",
                [user_id, f"{user_id}@example.test"],
            )
            conn.execute(
                "INSERT INTO credit_accounts (user_id, balance_credits) VALUES (%s, -1)",
                [user_id],
            )
            row = conn.execute(
                """
                INSERT INTO jobs (
                  owner_user_id, kind, status, provider, idempotency_key, input,
                  cost_credits, timeout_seconds, available_at
                )
                VALUES (%s, 'train.policy', 'queued', 'modal', %s, '{}'::jsonb, 1, 30, now())
                RETURNING id
                """,
                [user_id, f"p7013-call-{run_id}"],
            ).fetchone()
        job_id = str(row["id"])
        job = store.claim_one(["train.policy"])
        if job is None or job.id != job_id or job.provider_call_sink is None:
            raise AssertionError("Modal fixture job was not claimed with provider-call authority")
        if job.cancellation_requested is None or job.provider_cancelled_sink is None:
            raise AssertionError("Modal fixture job lacks cancellation callbacks")
        job.provider_call_sink(
            call_id,
            {
                "functionVersion": 17,
                "environment": "p7-013-fixture",
                "deploymentContractHash": contract_hash,
                "submittedAt": "2026-07-15T12:00:00+00:00",
            },
        )
        if job.provider_call_id != call_id:
            raise AssertionError("persisted provider call did not become worker completion correlation")
        with conn.transaction():
            persisted = conn.execute(
                """
                SELECT j.provider_call_id, j.provider_function_version,
                       j.provider_environment, j.provider_deployment_contract_hash,
                       c.attempt, c.status
                  FROM jobs j JOIN job_provider_calls c ON c.job_id = j.id
                 WHERE j.id = %s AND c.call_id = %s
                """,
                [job_id, call_id],
            ).fetchone()
        if dict(persisted) != {
            "provider_call_id": call_id,
            "provider_function_version": 17,
            "provider_environment": "p7-013-fixture",
            "provider_deployment_contract_hash": contract_hash,
            "attempt": 1,
            "status": "submitted",
        }:
            raise AssertionError("provider call identity did not persist exactly")
        evidence["scenarios"]["callPersistence"] = dict(persisted)

        with conn.transaction():
            conn.execute(
                """
                INSERT INTO credit_ledger (
                  user_id, delta_credits, reason, source_kind, source_id, idempotency_key
                )
                VALUES (%s, 1, 'provider-cancelled-before-materialization', 'job', %s, %s)
                """,
                [user_id, job_id, f"{job_id}:refund"],
            )
            conn.execute(
                "UPDATE credit_accounts SET balance_credits = balance_credits + 1 WHERE user_id = %s",
                [user_id],
            )
            conn.execute(
                """
                UPDATE jobs
                   SET status = 'cancelled', cancel_requested_at = now(), credit_refunded_at = now(),
                       finished_at = now(), lease_token = NULL, lease_expires_at = NULL
                 WHERE id = %s
                """,
                [job_id],
            )
            conn.execute(
                "UPDATE job_provider_calls SET status = 'cancellation-requested' WHERE call_id = %s",
                [call_id],
            )
        if not job.cancellation_requested():
            raise AssertionError("revoked database lease did not request provider cancellation")
        job.provider_cancelled_sink(call_id)
        if store.mark_succeeded(job, {"artifactKind": "policy", "late": True}):
            raise AssertionError("revoked Modal lease materialized a late provider result")
        with conn.transaction():
            cancelled = conn.execute(
                """
                SELECT j.status, j.cancel_requested_at IS NOT NULL AS cancel_requested,
                       j.provider_cancelled_at IS NOT NULL AS provider_cancelled,
                       j.credit_refunded_at IS NOT NULL AS credit_refunded,
                       a.balance_credits, c.status AS call_status,
                       c.cancelled_at IS NOT NULL AS call_cancelled
                  FROM jobs j
                  JOIN credit_accounts a ON a.user_id = j.owner_user_id
                  JOIN job_provider_calls c ON c.job_id = j.id
                 WHERE j.id = %s AND c.call_id = %s
                """,
                [job_id, call_id],
            ).fetchone()
        expected = {
            "status": "cancelled",
            "cancel_requested": True,
            "provider_cancelled": True,
            "credit_refunded": True,
            "balance_credits": 0,
            "call_status": "cancelled",
            "call_cancelled": True,
        }
        normalized = {**dict(cancelled), "balance_credits": int(cancelled["balance_credits"])}
        if normalized != expected:
            raise AssertionError(f"cancellation/refund authority drifted: {normalized}")
        evidence["scenarios"]["cancelRefund"] = normalized
        evidence["scenarios"]["lateResultDiscarded"] = True

        reconcile_command = [
            "node",
            "scripts/modal-reconcile-cost.mjs",
            "--call-id",
            call_id,
            "--billing-report-id",
            f"billing-fixture-{run_id}",
            "--cost-usd",
            "0.25",
        ]
        reconcile_env = {**os.environ, "DATABASE_URL": dsn}
        first_reconciliation = json.loads(
            subprocess.check_output(reconcile_command, text=True, env=reconcile_env)
        )
        repeated_reconciliation = json.loads(
            subprocess.check_output(reconcile_command, text=True, env=reconcile_env)
        )
        if first_reconciliation["idempotentReplay"] is not False:
            raise AssertionError("first provider-cost reconciliation was not new")
        if repeated_reconciliation["idempotentReplay"] is not True:
            raise AssertionError("repeated provider-cost reconciliation was not idempotent")
        if first_reconciliation["jobEventId"] != repeated_reconciliation["jobEventId"]:
            raise AssertionError("idempotent provider-cost reconciliation changed its audit event")
        conflicting = subprocess.run(
            [*reconcile_command[:-1], "0.50"],
            text=True,
            capture_output=True,
            env=reconcile_env,
            check=False,
        )
        if conflicting.returncode == 0:
            raise AssertionError("conflicting provider-cost reconciliation was accepted")
        with conn.transaction():
            reconciled = conn.execute(
                """
                SELECT j.provider_cost_usd, j.provider_billing_report_id,
                       j.provider_cost_reconciled_at IS NOT NULL AS job_reconciled,
                       c.provider_cost_usd AS call_cost_usd,
                       c.billing_report_id AS call_billing_report_id,
                       c.cost_reconciled_at IS NOT NULL AS call_reconciled,
                       (SELECT count(*) FROM job_events e
                         WHERE e.job_id = j.id AND e.event = 'provider-cost-reconciled') AS event_count
                  FROM jobs j JOIN job_provider_calls c ON c.job_id = j.id
                 WHERE j.id = %s AND c.call_id = %s
                """,
                [job_id, call_id],
            ).fetchone()
        reconciled_shape = {
            **dict(reconciled),
            "provider_cost_usd": str(reconciled["provider_cost_usd"]),
            "call_cost_usd": str(reconciled["call_cost_usd"]),
            "event_count": int(reconciled["event_count"]),
        }
        expected_reconciliation = {
            "provider_cost_usd": "0.25",
            "provider_billing_report_id": f"billing-fixture-{run_id}",
            "job_reconciled": True,
            "call_cost_usd": "0.25",
            "call_billing_report_id": f"billing-fixture-{run_id}",
            "call_reconciled": True,
            "event_count": 1,
        }
        if reconciled_shape != expected_reconciliation:
            raise AssertionError(f"provider-cost reconciliation drifted: {reconciled_shape}")
        evidence["scenarios"]["costReconciliation"] = {
            **expected_reconciliation,
            "firstWrite": True,
            "idempotentReplay": True,
            "conflictRefused": True,
        }

        with conn.transaction():
            row = conn.execute(
                """
                INSERT INTO jobs (
                  owner_user_id, kind, status, provider, idempotency_key, input,
                  cost_credits, timeout_seconds, available_at
                )
                VALUES (%s, 'train.policy', 'queued', 'modal', %s, '{}'::jsonb, 1, 30, now())
                RETURNING id
                """,
                [user_id, f"p7013-stale-{run_id}"],
            ).fetchone()
        stale_job_id = str(row["id"])
        stale = store.claim_one(["train.policy"])
        if stale is None or stale.id != stale_job_id or stale.provider_call_sink is None:
            raise AssertionError("stale-lease fixture was not claimed")
        with conn.transaction():
            conn.execute(
                """
                UPDATE jobs SET status = 'cancelled', cancel_requested_at = now(),
                                finished_at = now(), lease_token = NULL, lease_expires_at = NULL
                 WHERE id = %s
                """,
                [stale_job_id],
            )
        try:
            stale.provider_call_sink(
                f"fc-stale-{run_id}",
                {
                    "functionVersion": 17,
                    "environment": "p7-013-fixture",
                    "deploymentContractHash": contract_hash,
                    "submittedAt": "2026-07-15T12:01:00+00:00",
                },
            )
        except RuntimeError as error:
            evidence["scenarios"]["staleLeaseRefused"] = str(error)
        else:
            raise AssertionError("stale lease created provider-call authority")
        with conn.transaction():
            count = conn.execute(
                "SELECT count(*) AS count FROM job_provider_calls WHERE job_id = %s",
                [stale_job_id],
            ).fetchone()
        if int(count["count"]) != 0:
            raise AssertionError("stale provider call left a history row")

        recovery_call_id = f"fc-recovery-{run_id}"
        with conn.transaction():
            row = conn.execute(
                """
                INSERT INTO jobs (
                  owner_user_id, kind, status, provider, idempotency_key, input,
                  cost_credits, timeout_seconds, available_at
                )
                VALUES (%s, 'train.policy', 'queued', 'modal', %s, '{}'::jsonb, 1, 30, now())
                RETURNING id
                """,
                [user_id, f"p7013-recovery-{run_id}"],
            ).fetchone()
        recovery_job_id = str(row["id"])
        original = store.claim_one(["train.policy"])
        if original is None or original.id != recovery_job_id or original.provider_call_sink is None:
            raise AssertionError("recovery fixture was not claimed")
        original.provider_call_sink(
            recovery_call_id,
            {
                "functionVersion": 17,
                "environment": "p7-013-fixture",
                "deploymentContractHash": contract_hash,
                "submittedAt": "2026-07-15T12:02:00+00:00",
            },
        )
        with conn.transaction():
            conn.execute(
                "UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = %s",
                [recovery_job_id],
            )
        recovered = store.claim_one(["train.policy"])
        if recovered is None or recovered.id != recovery_job_id:
            raise AssertionError("expired Modal job was not reclaimed")
        if (
            recovered.provider_call_id != recovery_call_id
            or recovered.provider_function_version != 17
            or recovered.provider_environment != "p7-013-fixture"
            or recovered.provider_deployment_contract_hash != contract_hash
            or recovered.provider_submitted_at is None
        ):
            raise AssertionError("reclaimed job lost persisted provider-call recovery identity")
        disposition = store.mark_retryable(
            recovered,
            "provider-recovery-pending: persisted call remains unresolved",
            "provider-recovery-pending",
            1.0,
        )
        if disposition != "queued":
            raise AssertionError("unresolved provider recovery was not safely requeued")
        with conn.transaction():
            preserved = conn.execute(
                """
                SELECT j.status, j.provider_call_id, c.status AS call_status
                  FROM jobs j JOIN job_provider_calls c ON c.job_id = j.id
                 WHERE j.id = %s AND c.call_id = %s
                """,
                [recovery_job_id, recovery_call_id],
            ).fetchone()
        if dict(preserved) != {
            "status": "queued",
            "provider_call_id": recovery_call_id,
            "call_status": "submitted",
        }:
            raise AssertionError("unresolved recovery cleared or replaced provider-call authority")
        evidence["scenarios"]["functionCallRecovery"] = {
            "reclaimedAttempt": recovered.attempts,
            **dict(preserved),
            "replacementSpawnAllowed": False,
        }

        with conn.transaction():
            conn.execute("UPDATE jobs SET available_at = now() WHERE id = %s", [recovery_job_id])
        final_recovery = store.claim_one(["train.policy"])
        if final_recovery is None or final_recovery.id != recovery_job_id:
            raise AssertionError("preserved Modal call did not reach its bounded final recovery attempt")
        terminal = store.mark_retryable(
            final_recovery,
            "provider-recovery-pending: persisted call remains unresolved",
            "provider-recovery-pending",
            1.0,
        )
        if terminal != "failed":
            raise AssertionError("unresolved provider recovery did not stop at the attempt ceiling")
        with conn.transaction():
            unresolved = conn.execute(
                """
                SELECT j.status, j.last_error_code, j.provider_call_id,
                       j.provider_completed_at, c.status AS call_status,
                       c.completed_at AS call_completed_at
                  FROM jobs j JOIN job_provider_calls c ON c.job_id = j.id
                 WHERE j.id = %s AND c.call_id = %s
                """,
                [recovery_job_id, recovery_call_id],
            ).fetchone()
        if dict(unresolved) != {
            "status": "failed",
            "last_error_code": "provider-recovery-pending",
            "provider_call_id": recovery_call_id,
            "provider_completed_at": None,
            "call_status": "submitted",
            "call_completed_at": None,
        }:
            raise AssertionError("unresolved recovery fabricated provider completion authority")
        evidence["scenarios"]["recoveryExhaustion"] = {
            **dict(unresolved),
            "providerCompletionFabricated": False,
        }

        evidence["status"] = "passed"
        output = Path("artifacts/e2e/p7-modal-operation-db.json")
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"ok P7-013 database operations: {output}")
    finally:
        with conn.transaction():
            conn.execute("DELETE FROM users WHERE id = %s", [user_id])
        store._conn.close()


if __name__ == "__main__":
    main()
