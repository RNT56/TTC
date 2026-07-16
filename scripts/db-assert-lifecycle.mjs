#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { deleteUserData, exportUserData } from "../packages/gateway/dist/accountData.js";
import {
  DATA_LIFECYCLE_FORMAT_VERSION,
  RETENTION_POLICIES,
  RETENTION_POLICY_VERSION,
  accountLifecycleStatus,
  activeLegalHolds,
  deleteExpiredBackups,
  digestLifecycleSubject,
  evaluateRestoreCandidate,
  recordLegalHold,
  registerBackup,
  runPrimaryRetentionSweep,
} from "../packages/gateway/dist/dataLifecycle.js";

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://forge:forge-dev-only@localhost:5432/forge";
const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
const suffix = randomUUID();
const now = new Date();
const day = 86_400_000;
const iso = (deltaDays) => new Date(now.getTime() + deltaDays * day).toISOString();
const user = {
  id: `lifecycle-user-${suffix}`,
  name: "Lifecycle deletion fixture",
  email: `lifecycle-${suffix}@example.test`,
  image: null,
};
const retainedUser = {
  id: `lifecycle-held-${suffix}`,
  name: "Lifecycle retention fixture",
  email: `lifecycle-held-${suffix}@example.test`,
  image: null,
};
const blobId = `lifecycle-blob-${suffix}`;
const objectKey = `users/${user.id}/photos/source.jpg`;
const refusalId = `lifecycle-refusal-${suffix}`;
const auditRefusalId = `lifecycle-audit-refusal-${suffix}`;
const jobId = `lifecycle-job-${suffix}`;
const manifestSha = "a".repeat(64);
const failedManifestSha = "b".repeat(64);
const staleManifestSha = "d".repeat(64);
const lateManifestSha = "e".repeat(64);
const createdBackups = [];
const deletedObjects = [];
const deletedBackups = [];
let restoreTestId = null;

try {
  const storedPolicies = await pool.query(
    `SELECT data_class AS "dataClass", primary_rule AS "primaryRule",
            primary_retention_days AS "primaryRetentionDays",
            backup_max_days AS "backupMaxDays", tombstone_days AS "tombstoneDays",
            legal_basis AS "legalBasis"
       FROM data_retention_policies
      WHERE policy_version = $1 ORDER BY data_class`,
    [RETENTION_POLICY_VERSION],
  );
  assert.deepEqual(
    storedPolicies.rows,
    [...RETENTION_POLICIES].map((policy) => ({ ...policy })).sort((a, b) => a.dataClass.localeCompare(b.dataClass)),
  );
  const preview = await runPrimaryRetentionSweep(pool, { now });
  for (const key of [
    "expiredSessions",
    "expiredVerificationTokens",
    "expiredRefusalAudits",
    "expiredJobs",
    "expiredLegalHoldEvents",
    "expiredBackupRestoreTests",
    "expiredBackupRecords",
    "finalizedTombstones",
    "expiredTombstones",
    "expiredLifecycleEvents",
  ]) {
    assert.equal(typeof preview[key], "number", `dry-run retention omitted ${key}`);
  }
  const archivedBackup = await registerBackup(pool, {
    provider: "fixture-backup",
    externalReference: `backup/archive-retention-${suffix}`,
    manifestSha256: "8".repeat(64),
    capturedAt: iso(-600),
    deleteAfter: iso(-590),
    subjects: [{ kind: "audit", id: `archive-retention-${suffix}` }],
    now: new Date(iso(-600)),
  });
  createdBackups.push(archivedBackup.id);
  const archivedDeleted = await deleteExpiredBackups(pool, async () => undefined, new Date(iso(-589)));
  assert.deepEqual(archivedDeleted.deleted, [archivedBackup.id]);
  const archiveSweep = await runPrimaryRetentionSweep(pool, {
    now,
    execute: true,
    evidenceReference: `sweep/archive-retention-${suffix}`,
  });
  assert.equal(archiveSweep.expiredBackupRecords, 1);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM backup_records WHERE id = $1`, [archivedBackup.id])).rows[0].n), 0);
  await pool.query(
    `INSERT INTO users (id, name, email) VALUES ($1, $2, $3), ($4, $5, $6)`,
    [user.id, user.name, user.email, retainedUser.id, retainedUser.name, retainedUser.email],
  );
  await pool.query(
    `INSERT INTO object_blobs (id, owner_user_id, bucket, object_key, metadata)
     VALUES ($1, $2, 'forge-artifacts', $3, '{"purpose":"photoscan-source"}'::jsonb)`,
    [blobId, user.id, objectKey],
  );
  await pool.query(
    `INSERT INTO generation_refusals (
       id, owner_user_id, prompt_hash, prompt_length_bucket, policy_version,
       detector_version, categories, rule_ids, surface, created_at
     ) VALUES ($1, $2, $3, '1-64', 'forge-platform-exclusions-1.0.0',
               'prohibited-brief-rules-1.0.0', ARRAY['weaponization'], ARRAY['SAFE-001'],
               'generation', $4)`,
    [refusalId, retainedUser.id, "c".repeat(64), iso(-100)],
  );
  await pool.query(
    `INSERT INTO generation_refusals (
       id, prompt_hash, prompt_length_bucket, policy_version,
       detector_version, categories, rule_ids, surface, created_at
     ) VALUES ($1, $2, '1-64', 'forge-platform-exclusions-1.0.0',
               'prohibited-brief-rules-1.0.0', ARRAY['weaponization'], ARRAY['SAFE-001'],
               'generation', $3)`,
    [auditRefusalId, "d".repeat(64), iso(-100)],
  );
  await pool.query(
    `INSERT INTO jobs (id, owner_user_id, kind, status, input, finished_at, created_at)
     VALUES ($1, $2, 'replay.verify', 'succeeded', '{}'::jsonb, $3, $3)`,
    [jobId, retainedUser.id, iso(-40)],
  );

  const hold = await recordLegalHold(pool, {
    action: "place",
    holdKey: `case-${suffix}`,
    subjectKind: "user",
    subjectId: user.id,
    reasonCode: "litigation",
    authorityReference: `authority/case-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/case-${suffix}`,
    expiresAt: iso(60),
    idempotencyKey: `place-${suffix}`,
    now,
  });
  assert.equal(hold.action, "place");
  assert.equal((await activeLegalHolds(pool, "user", user.id, now)).length, 1);
  await assert.rejects(
    deleteUserData(pool, user, async () => assert.fail("held deletion reached object storage")),
    (error) => {
      assert.equal(error.code, "LEGAL_HOLD_ACTIVE");
      assert.equal(error.details.activeHoldCount, 1);
      return true;
    },
  );
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM users WHERE id = $1`, [user.id])).rows[0].n), 1);
  assert.equal(
    Number((await pool.query(
      `SELECT count(*) AS n FROM data_lifecycle_events
        WHERE event_type = 'legal-hold-blocked' AND subject_digest = $1`,
      [digestLifecycleSubject("user", user.id)],
    )).rows[0].n),
    1,
  );

  await recordLegalHold(pool, {
    action: "release",
    holdKey: `case-${suffix}`,
    subjectKind: "user",
    subjectId: user.id,
    reasonCode: "litigation",
    authorityReference: `authority/case-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/release-${suffix}`,
    idempotencyKey: `release-${suffix}`,
    now,
  });
  assert.equal((await activeLegalHolds(pool, "user", user.id, now)).length, 0);

  const objectSubjectId = `forge-artifacts/${objectKey}`;
  await recordLegalHold(pool, {
    action: "place",
    holdKey: `object-case-${suffix}`,
    subjectKind: "object",
    subjectId: objectSubjectId,
    reasonCode: "regulatory",
    authorityReference: `authority/object-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/object-${suffix}`,
    expiresAt: iso(60),
    idempotencyKey: `object-place-${suffix}`,
    now,
  });
  await assert.rejects(
    deleteUserData(pool, user, async () => assert.fail("object-held deletion reached object storage")),
    (error) => {
      assert.equal(error.code, "LEGAL_HOLD_ACTIVE");
      assert.equal(error.details.activeHoldCount, 1);
      return true;
    },
  );
  assert.equal((await accountLifecycleStatus(pool, user.id, now)).activeLegalHoldCount, 1);
  await recordLegalHold(pool, {
    action: "release",
    holdKey: `object-case-${suffix}`,
    subjectKind: "object",
    subjectId: objectSubjectId,
    reasonCode: "regulatory",
    authorityReference: `authority/object-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/object-release-${suffix}`,
    idempotencyKey: `object-release-${suffix}`,
    now,
  });

  const retentionHold = await recordLegalHold(pool, {
    action: "place",
    holdKey: `retention-${suffix}`,
    subjectKind: "user",
    subjectId: retainedUser.id,
    reasonCode: "security-incident",
    authorityReference: `authority/incident-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/incident-${suffix}`,
    expiresAt: iso(60),
    idempotencyKey: `retention-place-${suffix}`,
    now,
  });
  assert.equal(retentionHold.action, "place");
  await recordLegalHold(pool, {
    action: "place",
    holdKey: `audit-retention-${suffix}`,
    subjectKind: "audit",
    subjectId: `generation-refusal/${auditRefusalId}`,
    reasonCode: "security-incident",
    authorityReference: `authority/audit-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/audit-${suffix}`,
    expiresAt: iso(60),
    idempotencyKey: `audit-place-${suffix}`,
    now,
  });
  const heldSweep = await runPrimaryRetentionSweep(pool, {
    now,
    execute: true,
    evidenceReference: `sweep/held-${suffix}`,
  });
  assert.ok(heldSweep.expiredRefusalAudits >= 0);
  assert.ok(heldSweep.expiredJobs >= 0);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM generation_refusals WHERE id = $1`, [refusalId])).rows[0].n), 1);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM generation_refusals WHERE id = $1`, [auditRefusalId])).rows[0].n), 1);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM jobs WHERE id = $1`, [jobId])).rows[0].n), 1);
  await recordLegalHold(pool, {
    action: "release",
    holdKey: `retention-${suffix}`,
    subjectKind: "user",
    subjectId: retainedUser.id,
    reasonCode: "security-incident",
    authorityReference: `authority/incident-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/incident-release-${suffix}`,
    idempotencyKey: `retention-release-${suffix}`,
    now,
  });
  const releasedSweep = await runPrimaryRetentionSweep(pool, {
    now,
    execute: true,
    evidenceReference: `sweep/released-${suffix}`,
  });
  assert.ok(releasedSweep.expiredRefusalAudits >= 1);
  assert.ok(releasedSweep.expiredJobs >= 1);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM generation_refusals WHERE id = $1`, [refusalId])).rows[0].n), 0);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM generation_refusals WHERE id = $1`, [auditRefusalId])).rows[0].n), 1);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM jobs WHERE id = $1`, [jobId])).rows[0].n), 0);
  await recordLegalHold(pool, {
    action: "release",
    holdKey: `audit-retention-${suffix}`,
    subjectKind: "audit",
    subjectId: `generation-refusal/${auditRefusalId}`,
    reasonCode: "security-incident",
    authorityReference: `authority/audit-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/audit-release-${suffix}`,
    idempotencyKey: `audit-release-${suffix}`,
    now,
  });
  const oldNow = new Date(iso(-500));
  await recordLegalHold(pool, {
    action: "place",
    holdKey: `expired-history-${suffix}`,
    subjectKind: "audit",
    subjectId: `expired-history/${suffix}`,
    reasonCode: "regulatory",
    authorityReference: `authority/history-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/history-${suffix}`,
    expiresAt: iso(-200),
    idempotencyKey: `history-place-${suffix}`,
    now: oldNow,
  });
  await recordLegalHold(pool, {
    action: "release",
    holdKey: `expired-history-${suffix}`,
    subjectKind: "audit",
    subjectId: `expired-history/${suffix}`,
    reasonCode: "regulatory",
    authorityReference: `authority/history-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/history-release-${suffix}`,
    idempotencyKey: `history-release-${suffix}`,
    now: oldNow,
  });
  const auditSweep = await runPrimaryRetentionSweep(pool, {
    now,
    execute: true,
    evidenceReference: `sweep/audit-release-${suffix}`,
  });
  assert.ok(auditSweep.expiredRefusalAudits >= 1);
  assert.ok(auditSweep.expiredLegalHoldEvents >= 2);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM generation_refusals WHERE id = $1`, [auditRefusalId])).rows[0].n), 0);

  const backup = await registerBackup(pool, {
    provider: "fixture-backup",
    externalReference: `backup/pre-delete-${suffix}`,
    manifestSha256: manifestSha,
    capturedAt: iso(-1),
    deleteAfter: iso(1),
    subjects: [
      { kind: "user", id: user.id },
      { kind: "object", id: `forge-artifacts/${objectKey}` },
    ],
    now,
  });
  createdBackups.push(backup.id);
  const duplicateBackup = await registerBackup(pool, {
    provider: "fixture-backup",
    externalReference: `backup/pre-delete-${suffix}`,
    manifestSha256: manifestSha,
    capturedAt: iso(-1),
    deleteAfter: iso(1),
    subjects: [
      { kind: "user", id: user.id },
      { kind: "object", id: `forge-artifacts/${objectKey}` },
    ],
    now,
  });
  assert.equal(duplicateBackup.id, backup.id);
  await assert.rejects(
    registerBackup(pool, {
      provider: "fixture-backup",
      externalReference: `backup/pre-delete-${suffix}`,
      manifestSha256: manifestSha,
      capturedAt: iso(-1),
      deleteAfter: iso(1),
      subjects: [{ kind: "user", id: user.id }],
      now,
    }),
    /different subject manifest/,
  );

  const exported = await exportUserData(pool, user);
  assert.equal(exported.formatVersion, "1.5.0");
  assert.equal(exported.data.lifecycleLegalHolds.length, 4);
  assert.deepEqual(
    exported.data.lifecycleLegalHolds.map((event) => event.eventSequence),
    [...exported.data.lifecycleLegalHolds.map((event) => event.eventSequence)]
      .sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0),
  );
  assert.equal(exported.data.backupCopies.length, 1);
  assert.equal(JSON.stringify(exported).includes(`authority/case-${suffix}`), false);
  assert.equal(JSON.stringify(exported).includes(`evidence/case-${suffix}`), false);

  const receipt = await deleteUserData(pool, user, async (objects) => deletedObjects.push(...objects));
  assert.equal(receipt.formatVersion, "2.0.0");
  assert.equal(receipt.backupLifecycle.lifecycleVersion, DATA_LIFECYCLE_FORMAT_VERSION);
  assert.equal(receipt.backupLifecycle.state, "restore-suppressed-pending-expiry");
  assert.equal(receipt.backupLifecycle.objectTombstoneCount, 1);
  assert.deepEqual(deletedObjects, [{ bucket: "forge-artifacts", objectKey }]);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM users WHERE id = $1`, [user.id])).rows[0].n), 0);
  assert.equal(
    Number((await pool.query(`SELECT count(*) AS n FROM deletion_tombstones WHERE deletion_id = $1`, [receipt.deletionId])).rows[0].n),
    2,
  );
  await assert.rejects(
    registerBackup(pool, {
      provider: "fixture-backup",
      externalReference: `backup/impossible-post-delete-${suffix}`,
      manifestSha256: "f".repeat(64),
      capturedAt: iso(0.5),
      deleteAfter: iso(2),
      subjects: [{ kind: "user", id: user.id }],
      now: new Date(iso(1)),
    }),
    /captured after primary deletion/,
  );

  const restore = await evaluateRestoreCandidate(pool, {
    backupId: backup.id,
    manifestSha256: manifestSha,
    evidenceReference: `restore/check-${suffix}`,
    now,
  });
  restoreTestId = restore.restoreTestId;
  assert.equal(restore.result, "blocked");
  assert.equal(restore.blockedSubjectCount, 2);
  await pool.query(`UPDATE backup_restore_tests SET tested_at = $2 WHERE id = $1`, [restore.restoreTestId, iso(-500)]);
  await recordLegalHold(pool, {
    action: "place",
    holdKey: `restore-audit-${suffix}`,
    subjectKind: "audit",
    subjectId: `backup-restore/${restore.restoreTestId}`,
    reasonCode: "regulatory",
    authorityReference: `authority/restore-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/restore-${suffix}`,
    expiresAt: iso(60),
    idempotencyKey: `restore-audit-place-${suffix}`,
    now,
  });
  const heldRestoreSweep = await runPrimaryRetentionSweep(pool, {
    now,
    execute: true,
    evidenceReference: `sweep/restore-held-${suffix}`,
  });
  assert.equal(heldRestoreSweep.expiredBackupRestoreTests, 0);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM backup_restore_tests WHERE id = $1`, [restore.restoreTestId])).rows[0].n), 1);
  await recordLegalHold(pool, {
    action: "release",
    holdKey: `restore-audit-${suffix}`,
    subjectKind: "audit",
    subjectId: `backup-restore/${restore.restoreTestId}`,
    reasonCode: "regulatory",
    authorityReference: `authority/restore-${suffix}`,
    jurisdiction: "EU-DE",
    evidenceReference: `evidence/restore-release-${suffix}`,
    idempotencyKey: `restore-audit-release-${suffix}`,
    now,
  });
  const releasedRestoreSweep = await runPrimaryRetentionSweep(pool, {
    now,
    execute: true,
    evidenceReference: `sweep/restore-released-${suffix}`,
  });
  assert.equal(releasedRestoreSweep.expiredBackupRestoreTests, 1);
  assert.equal(Number((await pool.query(`SELECT count(*) AS n FROM backup_restore_tests WHERE id = $1`, [restore.restoreTestId])).rows[0].n), 0);

  const failingBackup = await registerBackup(pool, {
    provider: "fixture-backup",
    externalReference: `backup/failure-${suffix}`,
    manifestSha256: failedManifestSha,
    capturedAt: iso(-2),
    deleteAfter: iso(-1),
    subjects: [{ kind: "audit", id: `audit-${suffix}` }],
    now,
  });
  createdBackups.push(failingBackup.id);
  const failed = await deleteExpiredBackups(pool, async () => {
    throw Object.assign(new Error("fixture delete failure with private detail"), { name: "FixtureBackupUnavailable" });
  }, now);
  assert.deepEqual(failed.failed, [failingBackup.id]);
  const errorRow = await pool.query(
    `SELECT status, last_error_code FROM backup_records WHERE id = $1`,
    [failingBackup.id],
  );
  assert.deepEqual(errorRow.rows[0], { status: "delete-failed", last_error_code: "FixtureBackupUnavailable" });
  assert.equal(JSON.stringify(errorRow.rows[0]).includes("private detail"), false);

  const staleBackup = await registerBackup(pool, {
    provider: "fixture-backup",
    externalReference: `backup/stale-claim-${suffix}`,
    manifestSha256: staleManifestSha,
    capturedAt: iso(-2),
    deleteAfter: iso(-1),
    subjects: [{ kind: "audit", id: `stale-claim-${suffix}` }],
    now,
  });
  createdBackups.push(staleBackup.id);
  await pool.query(
    `UPDATE backup_records SET status = 'deleting', updated_at = $2 WHERE id = $1`,
    [staleBackup.id, iso(-1)],
  );

  const expired = await deleteExpiredBackups(pool, async (record) => {
    deletedBackups.push(record.externalReference);
  }, new Date(iso(2)));
  assert.ok(expired.deleted.includes(backup.id));
  assert.ok(expired.deleted.includes(failingBackup.id));
  assert.ok(expired.deleted.includes(staleBackup.id));
  assert.deepEqual(deletedBackups.sort(), [
    `backup/failure-${suffix}`,
    `backup/pre-delete-${suffix}`,
    `backup/stale-claim-${suffix}`,
  ].sort());
  const tombstoneState = await pool.query(
    `SELECT count(*) FILTER (WHERE backup_deleted_at IS NOT NULL)::int AS finalized
       FROM deletion_tombstones WHERE deletion_id = $1`,
    [receipt.deletionId],
  );
  assert.equal(tombstoneState.rows[0].finalized, 2);

  const lateBackup = await registerBackup(pool, {
    provider: "fixture-backup",
    externalReference: `backup/late-catalog-${suffix}`,
    manifestSha256: lateManifestSha,
    capturedAt: iso(-1),
    deleteAfter: iso(3),
    subjects: [{ kind: "user", id: user.id }],
    now: new Date(iso(2)),
  });
  createdBackups.push(lateBackup.id);
  const reopened = await pool.query(
    `SELECT backup_deleted_at FROM deletion_tombstones
      WHERE deletion_id = $1 AND subject_kind = 'user'`,
    [receipt.deletionId],
  );
  assert.equal(reopened.rows[0].backup_deleted_at, null);
  const lateDeleted = await deleteExpiredBackups(pool, async (record) => {
    deletedBackups.push(record.externalReference);
  }, new Date(iso(4)));
  assert.deepEqual(lateDeleted.deleted, [lateBackup.id]);

  const expirySweep = await runPrimaryRetentionSweep(pool, {
    now: new Date(iso(46)),
    execute: true,
    evidenceReference: `sweep/expiry-${suffix}`,
  });
  assert.equal(expirySweep.expiredTombstones, 2);
  assert.equal(
    Number((await pool.query(`SELECT count(*) AS n FROM deletion_tombstones WHERE deletion_id = $1`, [receipt.deletionId])).rows[0].n),
    0,
  );

  await assert.rejects(
    pool.query(`UPDATE legal_hold_events SET reason_code = 'regulatory' WHERE id = $1`, [hold.id]),
    /append-only/,
  );
  await assert.rejects(
    pool.query(`UPDATE data_lifecycle_events SET reason_code = 'tampered' WHERE subject_digest = $1`, [
      digestLifecycleSubject("user", user.id),
    ]),
    /append-only/,
  );

  console.log("ok lifecycle holds: user/object deletion and user/audit retention authority are bounded; old chains expire causally");
  console.log("ok lifecycle deletion: primary/object purge emits pseudonymous user and object tombstones");
  console.log("ok lifecycle backup: manifest drift and post-delete capture are refused; late catalog, restore, retry, lease, and expiry gates pass");
  console.log("ok lifecycle audit: policy rows match code; exports redact authority/evidence and events reject mutation");
} finally {
  const subjectDigests = [
    ...[user.id, retainedUser.id].map((id) => digestLifecycleSubject("user", id)),
    digestLifecycleSubject("object", `forge-artifacts/${objectKey}`),
    digestLifecycleSubject("audit", `generation-refusal/${auditRefusalId}`),
    digestLifecycleSubject("audit", `expired-history/${suffix}`),
    ...(restoreTestId ? [digestLifecycleSubject("audit", `backup-restore/${restoreTestId}`)] : []),
  ];
  await pool.query(`DELETE FROM backup_restore_tests WHERE backup_id = ANY($1::text[])`, [createdBackups]);
  await pool.query(`DELETE FROM backup_records WHERE id = ANY($1::text[])`, [createdBackups]);
  await pool.query(
    `DELETE FROM deletion_tombstones
      WHERE subject_digest = ANY($1::text[])
         OR subject_digest = $2`,
    [subjectDigests, digestLifecycleSubject("object", `forge-artifacts/${objectKey}`)],
  );
  const holdIds = await pool.query(
    `SELECT id FROM legal_hold_events WHERE subject_digest = ANY($1::text[])
      ORDER BY event_sequence DESC`,
    [subjectDigests],
  );
  for (const row of holdIds.rows) await pool.query(`DELETE FROM legal_hold_events WHERE id = $1`, [row.id]);
  await pool.query(`DELETE FROM data_lifecycle_events WHERE subject_digest = ANY($1::text[]) OR evidence_reference LIKE $2`, [
    subjectDigests,
    `%${suffix}%`,
  ]);
  await pool.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
  await pool.query(`DELETE FROM generation_refusals WHERE id = ANY($1::text[])`, [[refusalId, auditRefusalId]]);
  await pool.query(`DELETE FROM object_blobs WHERE id = $1`, [blobId]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[user.id, retainedUser.id]]);
  await pool.end();
}
