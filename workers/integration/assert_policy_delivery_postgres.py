"""Protected PostgreSQL + S3-compatible acceptance for P7-011 policy delivery."""

from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import subprocess
from pathlib import Path
from typing import Any
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from forge_workers.object_storage import S3PolicyObjectStore, StoredPolicyObject
from forge_workers.queue import PostgresQueueStore
from forge_workers.training.policy_fixture import MODEL_BASE64, MODEL_BYTE_SIZE, MODEL_SHA256


CONTRACT_HASH = "ab" * 32


def _revision() -> str:
    return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()


def _policy_output(*, label: str, model_base64: str = MODEL_BASE64) -> dict[str, Any]:
    model_bytes = base64.b64decode(model_base64, validate=True)
    digest = hashlib.sha256(model_bytes).hexdigest()
    return {
        "artifactKind": "policy",
        "provider": "p7-011-protected-fixture",
        "task": {"id": label, "version": "1.0.0"},
        "io": {
            "onnxHeader": {"contractHash": CONTRACT_HASH, "task": label},
            "tensor": {
                "schema": "forge-policy-tensor",
                "schemaVersion": "1.0.0",
                "coordinateFrame": "forge-y-up-rh-m",
                "input": {"name": "observations", "shape": [1, 11]},
                "output": {"name": "actions", "shape": [1, 4]},
            },
        },
        "onnx": {
            "opset": 18,
            "byteSize": len(model_bytes),
            "sha256": digest,
            "modelBase64": model_base64,
        },
        "scorecard": {
            "schemaVersion": "p7-scorecard-v1",
            "task": label,
            "exportable": True,
            "lineage": {"contractHash": CONTRACT_HASH, "seed": "7", "codeVersion": "p7-011-acceptance"},
        },
    }


class CountingPolicyStore:
    def __init__(self, delegate: S3PolicyObjectStore) -> None:
        self.delegate = delegate
        self.puts = 0

    def put_policy(self, *, object_key: str, model_bytes: bytes, sha256: str) -> StoredPolicyObject:
        self.puts += 1
        return self.delegate.put_policy(object_key=object_key, model_bytes=model_bytes, sha256=sha256)


class CancelAfterUploadStore:
    def __init__(self, delegate: S3PolicyObjectStore, dsn: str) -> None:
        self.delegate = delegate
        self.dsn = dsn
        self.job_id: str | None = None
        self.puts = 0

    def put_policy(self, *, object_key: str, model_bytes: bytes, sha256: str) -> StoredPolicyObject:
        stored = self.delegate.put_policy(object_key=object_key, model_bytes=model_bytes, sha256=sha256)
        self.puts += 1
        if self.job_id is None:
            raise AssertionError("cancellation store has no active job identity")
        with psycopg.connect(self.dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE jobs
                       SET status = 'cancelled', finished_at = now(),
                           error = 'p7-011 cancellation during object upload',
                           last_error_code = 'job-cancelled',
                           lease_token = NULL, lease_expires_at = NULL
                     WHERE id = %s AND status = 'running'
                    """,
                    [self.job_id],
                )
                if cursor.rowcount != 1:
                    raise AssertionError("cancellation race did not revoke the active lease")
        return stored


def main() -> None:
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        raise RuntimeError("DATABASE_URL is required for P7-011 acceptance")
    delegate = S3PolicyObjectStore()
    counting_store = CountingPolicyStore(delegate)
    worker = PostgresQueueStore(dsn, policy_store=counting_store)
    conn = worker._conn
    run_id = uuid4().hex
    user_id = f"p7011-user-{run_id}"
    model_id = f"p7011-model-{run_id}"
    job_ids: list[str] = []
    evidence: dict[str, Any] = {
        "schemaVersion": "p7-policy-delivery.v1",
        "task": "P7-011",
        "status": "running",
        "maturity": "sandbox",
        "sourceRevision": os.environ.get("FORGE_SOURCE_REVISION") or _revision(),
        "checkoutRevision": _revision(),
        "objectStore": "S3-compatible protected acceptance service",
        "scenarios": {},
    }

    def insert_job(label: str) -> str:
        with conn.transaction():
            row = conn.execute(
                """
                INSERT INTO jobs (
                  owner_user_id, kind, status, provider, idempotency_key, input,
                  max_attempts, timeout_seconds, available_at
                )
                VALUES (%s, 'train.policy', 'queued', 'local', %s, %s::jsonb, 3, 30, now())
                RETURNING id
                """,
                [
                    user_id,
                    f"p7-011-{label}-{run_id}",
                    worker._jsonb(
                        {
                            "modelId": model_id,
                            "contractHash": CONTRACT_HASH,
                            "modelSnapshot": {"modelId": model_id, "contractHash": CONTRACT_HASH},
                        }
                    ),
                ],
            ).fetchone()
        if row is None:
            raise AssertionError(f"{label} job was not inserted")
        job_id = str(row["id"])
        job_ids.append(job_id)
        return job_id

    def materialized_count(job_id: str) -> tuple[int, int]:
        with conn.transaction():
            row = conn.execute(
                """
                SELECT
                  (SELECT count(*) FROM policy_artifacts WHERE job_id = %s) AS policies,
                  (SELECT count(*) FROM object_blobs WHERE metadata->>'jobId' = %s) AS blobs
                """,
                [job_id, job_id],
            ).fetchone()
        return int(row["policies"]), int(row["blobs"])

    try:
        with conn.transaction():
            conn.execute(
                "INSERT INTO users (id, name, email) VALUES (%s, 'P7-011 acceptance', %s)",
                [user_id, f"{user_id}@example.test"],
            )
            conn.execute(
                """
                INSERT INTO model_registry (
                  id, owner_user_id, status, visibility, name, archetype,
                  contract_hash, contract, validator_report, lineage
                )
                VALUES (%s, %s, 'admitted', 'private', 'P7-011 acceptance model', 'multirotor',
                        %s, '{"meta":{"id":"p7-011","archetype":"multirotor"}}'::jsonb,
                        '{"verdict":"admitted"}'::jsonb, '{"source":"protected-acceptance"}'::jsonb)
                """,
                [model_id, user_id, CONTRACT_HASH],
            )

        winner_id = insert_job("winner")
        stale = worker.claim_one(["train.policy"])
        if stale is None or stale.id != winner_id or stale.lease_token is None:
            raise AssertionError("winner scenario did not claim its first lease")
        with conn.transaction():
            conn.execute("UPDATE jobs SET lease_expires_at = now() - interval '1 second' WHERE id = %s", [winner_id])
        current = worker.claim_one(["train.policy"])
        if current is None or current.id != winner_id or current.lease_token == stale.lease_token:
            raise AssertionError("winner scenario did not reclaim with a distinct lease")
        output = _policy_output(label="hover-hold")
        if worker.mark_succeeded(stale, output):
            raise AssertionError("stale policy attempt was allowed to materialize")
        if counting_store.puts != 0:
            raise AssertionError("stale policy attempt reached object storage")
        if not worker.mark_succeeded(current, output):
            raise AssertionError("current policy attempt did not materialize")
        if counting_store.puts != 1 or materialized_count(winner_id) != (1, 1):
            raise AssertionError("current policy attempt did not materialize exactly once")

        with conn.transaction():
            row = conn.execute(
                """
                SELECT j.status, j.output, p.id AS policy_id, p.model_id, p.policy_metadata,
                       b.id AS blob_id, b.bucket, b.object_key, b.byte_size, b.sha256,
                       b.upload_status, b.verified_at
                  FROM jobs j
                  JOIN policy_artifacts p ON p.job_id = j.id
                  JOIN object_blobs b ON b.id = p.artifact_blob_id
                 WHERE j.id = %s
                """,
                [winner_id],
            ).fetchone()
        if row is None:
            raise AssertionError("materialized policy evidence disappeared")
        persisted_output = dict(row["output"])
        if "modelBase64" in persisted_output.get("onnx", {}):
            raise AssertionError("persisted job output retained inline model bytes")
        delivery = persisted_output.get("delivery", {})
        if (
            row["status"] != "succeeded"
            or row["model_id"] != model_id
            or row["upload_status"] != "complete"
            or row["verified_at"] is None
            or delivery.get("jobId") != winner_id
            or delivery.get("policyArtifactId") != row["policy_id"]
            or delivery.get("artifactBlobId") != row["blob_id"]
            or delivery.get("modelRevision") != {"modelId": model_id, "contractHash": CONTRACT_HASH}
            or row["policy_metadata"] != row["output"]
        ):
            raise AssertionError(f"policy metadata authority drifted: {dict(row)}")
        retained = delegate.read_policy(
            object_key=str(row["object_key"]),
            byte_size=int(row["byte_size"]),
            sha256=str(row["sha256"]),
        )
        if len(retained) != MODEL_BYTE_SIZE or hashlib.sha256(retained).hexdigest() != MODEL_SHA256:
            raise AssertionError("retained ONNX bytes failed exact readback")
        evidence["scenarios"]["oneWinner"] = {
            "attempts": 2,
            "staleUploadPrevented": True,
            "policyRows": 1,
            "objectRows": 1,
            "inlineBytesPersisted": False,
            "exactReadback": True,
        }

        substitution_id = insert_job("substitution")
        substitution = worker.claim_one(["train.policy"])
        if substitution is None or substitution.id != substitution_id:
            raise AssertionError("substitution scenario was not claimed")
        tampered = copy.deepcopy(_policy_output(label="digest-substitution"))
        tampered["onnx"]["sha256"] = "0" * 64
        try:
            worker.mark_succeeded(substitution, tampered)
        except RuntimeError as error:
            if "size/digest authority" not in str(error):
                raise
        else:
            raise AssertionError("digest substitution was accepted")
        if not worker.mark_failed(substitution, "p7-011 digest substitution", "handler-failed"):
            raise AssertionError("substitution job could not fail under its current lease")
        if materialized_count(substitution_id) != (0, 0) or counting_store.puts != 1:
            raise AssertionError("digest substitution reached storage or persistence")
        evidence["scenarios"]["digestSubstitution"] = {
            "rejectedBeforeUpload": True,
            "policyRows": 0,
            "objectRows": 0,
        }

        cancellation_bytes = base64.b64encode(b"p7-011-cancelled-policy-object").decode("ascii")
        cancellation_output = _policy_output(label="cancel-during-upload", model_base64=cancellation_bytes)
        cancellation_store = CancelAfterUploadStore(delegate, dsn)
        cancellation_worker = PostgresQueueStore(dsn, policy_store=cancellation_store)
        cancellation_id = insert_job("cancellation")
        cancelled = cancellation_worker.claim_one(["train.policy"])
        if cancelled is None or cancelled.id != cancellation_id:
            raise AssertionError("cancellation scenario was not claimed")
        cancellation_store.job_id = cancellation_id
        if cancellation_worker.mark_succeeded(cancelled, cancellation_output):
            raise AssertionError("cancelled upload was allowed to bind database authority")
        if cancellation_store.puts != 1 or materialized_count(cancellation_id) != (0, 0):
            raise AssertionError("cancelled upload created authoritative database rows")
        cancellation_digest = cancellation_output["onnx"]["sha256"]
        cancellation_key = f"users/{user_id}/policy-onnx/{cancellation_digest}"
        cancellation_retained = delegate.read_policy(
            object_key=cancellation_key,
            byte_size=len(base64.b64decode(cancellation_bytes)),
            sha256=cancellation_digest,
        )
        if cancellation_retained != base64.b64decode(cancellation_bytes):
            raise AssertionError("cancelled orphan object was not exact")
        evidence["scenarios"]["cancellationDuringUpload"] = {
            "objectUploaded": True,
            "authoritativePolicyRows": 0,
            "authoritativeObjectRows": 0,
            "orphanReconciliationOwner": "OPS-006",
        }
        cancellation_worker._conn.close()

        evidence["status"] = "passed"
        evidence["limitations"] = [
            "The protected service proves controlled S3-compatible sandbox behavior, not production durability or SLOs.",
            "Cancellation can leave an unreferenced content-addressed object; OPS-006 owns bounded orphan reconciliation.",
        ]
        output_path = Path("artifacts/e2e/p7-policy-delivery.json")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print("p7-policy-delivery: exact object, lease fence, cancellation, and substitution proof passed")
    finally:
        with conn.transaction():
            if job_ids:
                conn.execute("DELETE FROM policy_artifacts WHERE job_id = ANY(%s)", [job_ids])
                conn.execute("DELETE FROM object_blobs WHERE metadata->>'jobId' = ANY(%s)", [job_ids])
                conn.execute("DELETE FROM jobs WHERE id = ANY(%s)", [job_ids])
            conn.execute("DELETE FROM model_registry WHERE id = %s", [model_id])
            conn.execute("DELETE FROM users WHERE id = %s", [user_id])
        conn.close()


if __name__ == "__main__":
    main()
