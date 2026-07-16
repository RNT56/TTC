#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import {
  deleteUserData,
  exportUserData,
} from "../packages/gateway/dist/accountData.js";
import { createJob } from "../packages/gateway/dist/platform.js";
import { CONSENT_POLICIES } from "../packages/gateway/dist/consent.js";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required for recorder admission acceptance");
const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const suffix = randomUUID();
const user = {
  id: `db-recorder-${suffix}`,
  name: "Recorder Admission Gate",
  email: `db-recorder-${suffix}@example.test`,
  image: null,
};
const modelId = `mdl-db-recorder-${suffix}`;
const artifactId = `db-recorder-${suffix}`;
const materializationId = `ram-db-recorder-${suffix}`;
const admissionId = `raa-${randomBytes(10).toString("hex")}`;
const telemetryId = `db-recorder-telemetry-${suffix}`;
const contractHash = createHash("sha256").update("{}").digest("hex");
const lockfileHash = "22".repeat(32);
const sourcePortSha256 = "33".repeat(32);
const files = [
  ["forge-recorder-manifest.json", "application/json", "44".repeat(32), 400],
  ["telemetry.frames.jsonl", "application/x-ndjson", "55".repeat(32), 600],
  ["telemetry.index.jsonl", "application/x-ndjson", "66".repeat(32), 120],
  ["telemetry.replay.json", "application/json", "77".repeat(32), 900],
  ["forge-recorder-receipt.json", "application/json", "88".repeat(32), 420],
];
const blobIds = files.map((_, index) => `db-recorder-blob-${index}-${suffix}`);
const objectKeys = files.map(([name]) => `users/${user.id}/recorder/${name}`);
const aggregateByteSize = files.reduce((sum, file) => sum + Number(file[3]), 0);
const uploadPlan = {
  schemaVersion: "forge-recorder-upload-plan/1.0.0",
  archiveSchemaVersion: "forge-recorder-archive/1.0.0",
  inspectionSchemaVersion: "forge-recorder-inspection/1.0.0",
  artifactId,
  referenceRigId: "ref_quad_kakute-h7-source-one-5in",
  contractHash,
  lockfileHash,
  sourcePortSha256,
  sampleRateHz: 120,
  startedAtUnixMs: 1_750_000_000_000,
  stoppedAtUnixMs: 1_750_000_000_500,
  frameCount: 3,
  durationS: 0.5,
  captureMaturity: "local-serial-integration",
  aggregateByteSize,
  files: files.map(([name, contentType, sha256, byteSize]) => ({
    name, contentType, sha256, byteSize,
  })),
  localIntegrityVerified: true,
  captureComplete: true,
  captureConsentConfirmed: true,
  userOwned: true,
  sharingAuthorized: false,
  trainingReuseAuthorized: false,
  recordedDeviceAttested: false,
  deviceIdentityVerified: false,
  fieldSessionVerified: false,
  noAutoArm: true,
};
const verification = {
  schemaVersion: "forge-recorder-verification/1.0.0",
  archiveSchemaVersion: "forge-recorder-archive/1.0.0",
  replaySchemaVersion: "1.0.0",
  receiptSchemaVersion: "forge-recorder-receipt/1.0.0",
  artifactId,
  referenceRigId: uploadPlan.referenceRigId,
  contractHash,
  lockfileHash,
  sourcePortSha256,
  sampleRateHz: uploadPlan.sampleRateHz,
  startedAtUnixMs: uploadPlan.startedAtUnixMs,
  stoppedAtUnixMs: uploadPlan.stoppedAtUnixMs,
  frameCount: uploadPlan.frameCount,
  durationS: uploadPlan.durationS,
  aggregateByteSize,
  frameFileSha256: files[1][2],
  indexFileSha256: files[2][2],
  replayFileSha256: files[3][2],
  captureMaturity: "local-serial-integration",
  archiveSemanticsVerified: true,
  captureComplete: true,
  captureConsentConfirmed: true,
  userOwned: true,
  sharingAuthorized: false,
  trainingReuseAuthorized: false,
  recordedDeviceAttested: false,
  deviceIdentityVerified: false,
  fieldSessionVerified: false,
  noAutoArm: true,
};
const tape = {
  schemaVersion: "forge-recorder-telemetry-reference/1.0.0",
  storage: "object-backed",
  admissionId,
  materializationId,
  replayBlobId: blobIds[3],
  archiveSchemaVersion: verification.archiveSchemaVersion,
  replaySchemaVersion: verification.replaySchemaVersion,
  contractHash,
  lockfileHash,
  replayFileSha256: verification.replayFileSha256,
  aggregateByteSize,
  frameCount: verification.frameCount,
  durationS: verification.durationS,
  gatewayArchiveSemanticsVerified: true,
  recordedDeviceAttested: false,
  deviceIdentityVerified: false,
  fieldSessionVerified: false,
  sharingAuthorized: false,
  trainingReuseAuthorized: false,
  noAutoArm: true,
};

let deleted = false;
try {
  await pool.query(`INSERT INTO users (id, name, email) VALUES ($1,$2,$3)`, [user.id, user.name, user.email]);
  await pool.query(
    `INSERT INTO model_registry (
       id, owner_user_id, status, visibility, name, contract_hash, contract, validator_report
     ) VALUES ($1,$2,'admitted','private','Recorder DB model',$3,'{}'::jsonb,$4::jsonb)`,
    [modelId, user.id, contractHash, JSON.stringify({
      verdict: "admitted", contractHash, lockfileHash,
    })],
  );
  for (let index = 0; index < files.length; index += 1) {
    const [name, contentType, sha256, byteSize] = files[index];
    await pool.query(
      `INSERT INTO object_blobs (
         id, owner_user_id, bucket, object_key, content_type, byte_size, sha256,
         upload_status, verified_at, metadata
       ) VALUES ($1,$2,'forge-artifacts',$3,$4,$5,$6,'complete',now(),$7::jsonb)`,
      [blobIds[index], user.id, objectKeys[index], contentType, byteSize, sha256,
        JSON.stringify({ purpose: "recorder-admission-gate", originalName: name })],
    );
  }
  await pool.query(
    `INSERT INTO recorder_archive_materializations (
       id, owner_user_id, artifact_id, status, manifest_blob_id, frame_blob_id,
       index_blob_id, replay_blob_id, receipt_blob_id, upload_plan,
       aggregate_byte_size, gateway_object_integrity_verified,
       gateway_archive_semantics_verified, materialized_at
     ) VALUES ($1,$2,$3,'materialized',$4,$5,$6,$7,$8,$9::jsonb,$10,true,false,now())`,
    [materializationId, user.id, artifactId, ...blobIds, JSON.stringify(uploadPlan), aggregateByteSize],
  );
  await pool.query(
    `INSERT INTO telemetry_logs (id, owner_user_id, model_id, source, captured_at, tape, privacy)
     VALUES ($1,$2,$3,'desktop',to_timestamp($4 / 1000.0),$5::jsonb,$6::jsonb)`,
    [telemetryId, user.id, modelId, verification.startedAtUnixMs, JSON.stringify(tape),
      JSON.stringify({ sharing: "private", sharingAuthorized: false, trainingReuseAuthorized: false })],
  );
  const trainingPolicy = CONSENT_POLICIES.find((policy) => policy.purpose === "training.reuse");
  assert.ok(trainingPolicy);
  await pool.query(
    `INSERT INTO user_consent_events (
       ledger_version, owner_user_id, purpose, subject_kind, subject_id, policy_version,
       notice_hash, action, evidence
     ) VALUES ($1,$2,'training.reuse','telemetry-log',$3,$4,$5,'grant',$6::jsonb)`,
    [trainingPolicy.ledgerVersion, user.id, telemetryId, trainingPolicy.policyVersion, trainingPolicy.noticeHash,
      JSON.stringify({ channel: "recorder-admission-db-gate" })],
  );
  await pool.query(
    `INSERT INTO recorder_archive_admissions (
       id, owner_user_id, materialization_id, telemetry_log_id, model_id,
       verification, replay_file_sha256, frame_count, duration_s
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
    [admissionId, user.id, materializationId, telemetryId, modelId,
      JSON.stringify(verification), verification.replayFileSha256,
      verification.frameCount, verification.durationS],
  );

  await assert.rejects(
    pool.query(
      `UPDATE recorder_archive_materializations
          SET gateway_archive_semantics_verified = true WHERE id = $1`,
      [materializationId],
    ),
    /check constraint/,
  );
  await assert.rejects(
    pool.query(
      `UPDATE recorder_archive_admissions
          SET training_reuse_authorized = true WHERE id = $1`,
      [admissionId],
    ),
    /check constraint/,
  );
  await assert.rejects(
    createJob(pool, user, {
      kind: "train.offline-bc",
      provider: "local",
      payload: {
        modelId,
        telemetryLogId: telemetryId,
        recipe: "p7-offline-bc-v1",
        algorithm: "ppo",
        task: "hover-hold",
      },
    }),
    /object-backed recorder telemetry is not authorized/,
  );

  const exported = await exportUserData(pool, user);
  assert.equal(exported.formatVersion, "1.6.0");
  assert.equal(exported.data.recorderArchiveMaterializations.length, 1);
  assert.equal(exported.data.recorderArchiveAdmissions.length, 1);
  assert.equal(exported.data.telemetryLogs.length, 1);
  assert.equal(exported.data.recorderArchiveMaterializations[0].gatewayArchiveSemanticsVerified, false);
  assert.equal(exported.data.recorderArchiveAdmissions[0].gatewayArchiveSemanticsVerified, true);
  assert.equal(exported.data.recorderArchiveAdmissions[0].trainingReuseAuthorized, false);
  assert.equal(exported.data.telemetryLogs[0].tape.schemaVersion, "forge-recorder-telemetry-reference/1.0.0");
  assert.equal("frames" in exported.data.telemetryLogs[0].tape, false);

  const deletedObjects = [];
  const receipt = await deleteUserData(pool, user, async (objects) => deletedObjects.push(...objects));
  deleted = true;
  assert.equal(receipt.counts.recorderArchiveAdmissions, 1);
  assert.equal(receipt.counts.recorderArchiveMaterializations, 1);
  assert.equal(receipt.counts.telemetryLogs, 1);
  assert.equal(receipt.backupLifecycle.objectTombstoneCount, 5);
  assert.deepEqual(
    deletedObjects.map((object) => object.objectKey).sort(),
    [...objectKeys].sort(),
  );
  const residue = await pool.query(
    `SELECT
       (SELECT count(*) FROM users WHERE id = $1) AS users,
       (SELECT count(*) FROM model_registry WHERE id = $2) AS models,
       (SELECT count(*) FROM object_blobs WHERE owner_user_id = $1) AS object_blobs,
       (SELECT count(*) FROM telemetry_logs WHERE id = $3) AS telemetry_logs,
       (SELECT count(*) FROM recorder_archive_materializations WHERE id = $4) AS materializations,
       (SELECT count(*) FROM recorder_archive_admissions WHERE id = $5) AS admissions`,
    [user.id, modelId, telemetryId, materializationId, admissionId],
  );
  for (const [name, count] of Object.entries(residue.rows[0])) {
    assert.equal(Number(count), 0, `${name} survived recorder account deletion`);
  }
  await pool.query(`DELETE FROM deletion_tombstones WHERE deletion_id = $1`, [receipt.deletionId]);
  await pool.query(`DELETE FROM data_lifecycle_events WHERE evidence_reference = $1`, [receipt.deletionId]);
  console.log("recorder-admission-postgres: sovereign proof, nonclaims, training refusal, export, and deletion proven");
} finally {
  if (!deleted) {
    try {
      await deleteUserData(pool, user, async () => undefined);
    } catch {
      // Unique fixture IDs retain failed evidence for diagnosis.
    }
  }
  await pool.end();
}
