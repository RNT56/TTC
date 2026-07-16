#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  deleteUserData,
  exportUserData,
} from "../packages/gateway/dist/accountData.js";

const { Pool } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://forge:forge-dev-only@localhost:5432/forge";
const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const suffix = randomUUID();
const user = {
  id: `db-user-data-${suffix}`,
  name: "User Data Gate",
  email: `db-user-data-${suffix}@example.test`,
  image: null,
};
const artifactId = `db-artifact-${suffix}`;
const modelId = `db-model-${suffix}`;
const blobId = `db-blob-${suffix}`;
const photoscanId = `db-scan-${suffix}`;
const replayId = `db-replay-${suffix}`;
const policyId = `db-policy-${suffix}`;
const policyJobId = `db-policy-job-${suffix}`;
const modalJobId = `db-modal-job-${suffix}`;
const modalCallId = `fc-db-user-data-${suffix}`;
const courseId = `db-course-${suffix}`;
const telemetryId = `db-telemetry-${suffix}`;
const listingId = `db-listing-${suffix}`;
const quoteRequestId = `db-quote-request-${suffix}`;
const quoteOfferId = `db-quote-offer-${suffix}`;
const consentId = `db-consent-${suffix}`;
const objectKey = `users/${user.id}/photos/source.jpg`;

let deleted = false;
try {
  await pool.query(
    `INSERT INTO users (id, name, email) VALUES ($1, $2, $3)`,
    [user.id, user.name, user.email],
  );
  await pool.query(
    `INSERT INTO accounts (
       id, "userId", provider, type, "providerAccountId", access_token, refresh_token, id_token, scope
     ) VALUES ($1, $2, 'github', 'oauth', $3, 'do-not-export-access', 'do-not-export-refresh',
               'do-not-export-id', 'read:user')`,
    [`db-account-${suffix}`, user.id, `provider-${suffix}`],
  );
  await pool.query(
    `INSERT INTO sessions (id, "sessionToken", "userId", expires)
     VALUES ($1, 'do-not-export-session', $2, now() + interval '1 day')`,
    [`db-session-${suffix}`, user.id],
  );
  await pool.query(
    `INSERT INTO verification_token (identifier, expires, token)
     VALUES ($1, now() + interval '1 hour', 'do-not-export-verification')`,
    [user.email],
  );
  await pool.query(
    `INSERT INTO credit_accounts (user_id, balance_credits) VALUES ($1, 4)`,
    [user.id],
  );
  await pool.query(
    `INSERT INTO generated_artifacts (
       artifact_id, status, prompt, provider, contract_hash, prompt_hash, contract,
       validator_report, attempts, context, model_pins, owner_user_id
     ) VALUES ($1, 'admitted', 'safe inspection rover', 'template', $2, $3, '{}'::jsonb,
               '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, $4)`,
    [artifactId, "a".repeat(64), "b".repeat(64), user.id],
  );
  await pool.query(
    `INSERT INTO model_registry (
       id, owner_user_id, source_artifact_id, status, name, contract_hash, contract
     ) VALUES ($1, $2, $3, 'admitted', 'DB user-data model', $4, '{}'::jsonb)`,
    [modelId, user.id, artifactId, "a".repeat(64)],
  );
  await pool.query(
    `INSERT INTO object_blobs (
       id, owner_user_id, bucket, object_key, content_type, byte_size, sha256, metadata
     ) VALUES ($1, $2, 'forge-artifacts', $3, 'image/jpeg', 12, $4, '{"purpose":"photoscan"}'::jsonb)`,
    [blobId, user.id, objectKey, "c".repeat(64)],
  );
  await pool.query(
    `INSERT INTO photoscan_artifacts (
       id, owner_user_id, source_blob_ids, artifact_blob_id
     ) VALUES ($1, $2, ARRAY[$3]::text[], $3)`,
    [photoscanId, user.id, blobId],
  );
  await pool.query(
    `INSERT INTO replay_artifacts (id, owner_user_id, model_id, tape)
     VALUES ($1, $2, $3, '{"frames":[]}'::jsonb)`,
    [replayId, user.id, modelId],
  );
  await pool.query(
    `INSERT INTO jobs (
       id, owner_user_id, kind, status, provider, input, output, started_at, finished_at
     ) VALUES ($1, $2, 'train.policy', 'succeeded', 'fixture',
               jsonb_build_object('modelId', $3::text),
               '{"artifactKind":"policy","formatVersion":"0.2.0","onnx":{"byteSize":12,"sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"delivery":{"objectBacked":true}}'::jsonb,
               now(), now())`,
    [policyJobId, user.id, modelId],
  );
  await pool.query(
    `INSERT INTO policy_artifacts (
       id, owner_user_id, job_id, model_id, task_kind, scorecard, policy_metadata, artifact_blob_id
     ) VALUES ($1, $2, $3, $4, 'inspection', '{}'::jsonb,
               '{"artifactKind":"policy","formatVersion":"0.2.0","onnx":{"byteSize":12,"sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"delivery":{"objectBacked":true}}'::jsonb,
               $5)`,
    [policyId, user.id, policyJobId, modelId, blobId],
  );
  await pool.query(
    `INSERT INTO jobs (
       id, owner_user_id, kind, status, provider, input, output, cost_credits,
       provider_call_id, provider_function_version, provider_environment,
       provider_deployment_contract_hash, provider_submitted_at,
       provider_completed_at, provider_cost_usd, provider_billing_report_id,
       provider_cost_reconciled_at, started_at, finished_at
     ) VALUES ($1, $2, 'train.policy', 'succeeded', 'modal', '{}'::jsonb,
               '{"artifactKind":"policy","delivery":{"objectBacked":true}}'::jsonb, 1,
               $3, 17, 'db-user-data', $4, now() - interval '1 minute', now(), 0.25,
               $5, now(), now() - interval '1 minute', now())`,
    [modalJobId, user.id, modalCallId, "e".repeat(64), `billing-user-data-${suffix}`],
  );
  await pool.query(
    `INSERT INTO job_provider_calls (
       call_id, job_id, attempt, provider, function_version, environment,
       deployment_contract_hash, status, submitted_at, completed_at, provider_cost_usd,
       billing_report_id, cost_reconciled_at
     ) VALUES ($1, $2, 1, 'modal', 17, 'db-user-data', $3, 'succeeded',
               now() - interval '1 minute', now(), 0.25, $4, now())`,
    [modalCallId, modalJobId, "e".repeat(64), `billing-user-data-${suffix}`],
  );
  await pool.query(
    `INSERT INTO courses (id, owner_user_id, name, env_spec)
     VALUES ($1, $2, 'DB user-data course', '{"formatVersion":"1.0.0"}'::jsonb)`,
    [courseId, user.id],
  );
  await pool.query(
    `INSERT INTO telemetry_logs (id, owner_user_id, model_id, source, tape)
     VALUES ($1, $2, $3, 'fixture', '{"samples":[]}'::jsonb)`,
    [telemetryId, user.id, modelId],
  );
  await pool.query(
    `INSERT INTO user_consent_events (
       id, ledger_version, owner_user_id, purpose, subject_kind, subject_id,
       policy_version, notice_hash, action, evidence
     ) VALUES ($1, '1.0.0', $2, 'telemetry.sharing', 'telemetry-log', $3,
               '1.0.0', $4, 'grant', '{"channel":"db-gate"}'::jsonb)`,
    [consentId, user.id, telemetryId, "d".repeat(64)],
  );
  await pool.query(
    `INSERT INTO marketplace_listings (
       id, owner_user_id, model_id, listing_kind, title
     ) VALUES ($1, $2, $3, 'model', 'DB user-data listing')`,
    [listingId, user.id, modelId],
  );
  await pool.query(
    `INSERT INTO marketplace_usage_rollups (bucket_date, listing_id, listing_kind, views)
     VALUES (current_date, $1, 'model', 3)`,
    [listingId],
  );
  await pool.query(
    `INSERT INTO print_quote_requests (
       id, owner_user_id, model_id, artifact_blob_id, status
     ) VALUES ($1, $2, $3, $4, 'quoted')`,
    [quoteRequestId, user.id, modelId, blobId],
  );
  await pool.query(
    `INSERT INTO print_quote_offers (
       id, request_id, provider, quote_url, price, currency
     ) VALUES ($1, $2, 'fixture', 'https://quotes.example.test/db-proof', 12, 'EUR')`,
    [quoteOfferId, quoteRequestId],
  );

  const exported = await exportUserData(pool, user);
  assert.equal(exported.data.account.length, 1);
  assert.equal(exported.data.generatedArtifacts.length, 1);
  assert.equal(exported.data.models.length, 1);
  assert.equal(exported.data.objectBlobs.length, 1);
  assert.equal(exported.data.photoscanArtifacts.length, 1);
  assert.equal(exported.data.replayArtifacts.length, 1);
  assert.equal(exported.data.policyArtifacts.length, 1);
  assert.equal(exported.data.courses.length, 1);
  assert.equal(exported.data.telemetryLogs.length, 1);
  assert.equal(exported.data.consentEvents.length, 1);
  assert.equal(exported.data.jobProviderCalls.length, 1);
  assert.equal(exported.data.jobProviderCalls[0].callId, modalCallId);
  assert.equal(exported.data.jobProviderCalls[0].jobId, modalJobId);
  assert.equal(exported.data.jobProviderCalls[0].providerCostUsd, "0.25");
  assert.equal(exported.data.jobProviderCalls[0].billingReportId, `billing-user-data-${suffix}`);
  assert.ok(exported.data.jobProviderCalls[0].costReconciledAt);
  const exportedModalJob = exported.data.jobs.find((job) => job.id === modalJobId);
  assert.equal(exportedModalJob.providerCostUsd, "0.25");
  assert.equal(exportedModalJob.providerBillingReportId, `billing-user-data-${suffix}`);
  assert.ok(exportedModalJob.providerCostReconciledAt);
  assert.equal(exported.formatVersion, "1.4.0");
  assert.equal(exported.data.policyArtifacts[0].jobId, policyJobId);
  assert.equal(exported.data.policyArtifacts[0].policyMetadata.delivery.objectBacked, true);
  assert.equal(exported.data.lifecycleLegalHolds.length, 0);
  assert.equal(exported.data.backupCopies.length, 0);
  assert.equal(exported.data.marketplaceListings.length, 1);
  assert.equal(exported.data.marketplaceUsageRollups.length, 1);
  assert.equal(exported.data.printQuoteRequests.length, 1);
  assert.equal(exported.data.printQuoteOffers.length, 1);
  assert.deepEqual(exported.objectDownloads, [
    { blobId, accessEndpoint: `/v1/blobs/${blobId}/access` },
  ]);
  const exportJson = JSON.stringify(exported);
  for (const secret of [
    "do-not-export-access",
    "do-not-export-refresh",
    "do-not-export-id",
    "do-not-export-session",
    "do-not-export-verification",
  ]) {
    assert.equal(exportJson.includes(secret), false, `${secret} leaked into export`);
  }

  const deletedObjects = [];
  const receipt = await deleteUserData(pool, user, async (objects) => {
    deletedObjects.push(...objects);
  });
  deleted = true;
  assert.equal(receipt.primaryDataDeleted, true);
  assert.equal(receipt.objectPayloadsDeleted, true);
  assert.equal(receipt.formatVersion, "2.0.0");
  assert.equal(receipt.backupLifecycle.state, "restore-suppressed-pending-expiry");
  assert.equal(receipt.backupLifecycle.objectTombstoneCount, 1);
  assert.deepEqual(deletedObjects, [{ bucket: "forge-artifacts", objectKey }]);

  const residue = await pool.query(
    `SELECT
       (SELECT count(*) FROM users WHERE id = $1) AS users,
       (SELECT count(*) FROM accounts WHERE "userId" = $1) AS accounts,
       (SELECT count(*) FROM sessions WHERE "userId" = $1) AS sessions,
       (SELECT count(*) FROM verification_token WHERE identifier = $2) AS verification_tokens,
       (SELECT count(*) FROM generated_artifacts WHERE artifact_id = $3) AS generated_artifacts,
       (SELECT count(*) FROM model_registry WHERE id = $4) AS models,
       (SELECT count(*) FROM object_blobs WHERE id = $5) AS object_blobs,
       (SELECT count(*) FROM photoscan_artifacts WHERE id = $6) AS photoscan_artifacts,
       (SELECT count(*) FROM replay_artifacts WHERE id = $7) AS replay_artifacts,
       (SELECT count(*) FROM policy_artifacts WHERE id = $8) AS policy_artifacts,
       (SELECT count(*) FROM courses WHERE id = $9) AS courses,
       (SELECT count(*) FROM telemetry_logs WHERE id = $10) AS telemetry_logs,
       (SELECT count(*) FROM marketplace_listings WHERE id = $11) AS marketplace_listings,
       (SELECT count(*) FROM marketplace_usage_rollups WHERE listing_id = $11) AS marketplace_usage_rollups,
       (SELECT count(*) FROM print_quote_requests WHERE id = $12) AS print_quote_requests,
       (SELECT count(*) FROM print_quote_offers WHERE id = $13) AS print_quote_offers,
       (SELECT count(*) FROM user_consent_events WHERE id = $14) AS user_consent_events,
       (SELECT count(*) FROM job_provider_calls WHERE call_id = $15) AS job_provider_calls`,
    [
      user.id,
      user.email,
      artifactId,
      modelId,
      blobId,
      photoscanId,
      replayId,
      policyId,
      courseId,
      telemetryId,
      listingId,
      quoteRequestId,
      quoteOfferId,
      consentId,
      modalCallId,
    ],
  );
  for (const [name, count] of Object.entries(residue.rows[0])) {
    assert.equal(Number(count), 0, `${name} survived account deletion`);
  }
  const lifecycleResidue = await pool.query(
    `SELECT count(*)::int AS tombstones
       FROM deletion_tombstones WHERE deletion_id = $1`,
    [receipt.deletionId],
  );
  assert.equal(lifecycleResidue.rows[0].tombstones, 2);
  await pool.query(`DELETE FROM deletion_tombstones WHERE deletion_id = $1`, [receipt.deletionId]);
  await pool.query(
    `DELETE FROM data_lifecycle_events WHERE evidence_reference = $1`,
    [receipt.deletionId],
  );
  console.log("ok user-data export: all declared datasets queried without auth secrets");
  console.log("ok account deletion: primary rows purged, object handoff verified, lifecycle tombstones emitted");
} finally {
  if (!deleted) {
    try {
      await deleteUserData(pool, user, async () => undefined);
    } catch {
      // The unique fixture IDs keep failed evidence isolated for diagnosis.
    }
  }
  await pool.end();
}
