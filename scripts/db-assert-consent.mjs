#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { deleteUserData } from "../packages/gateway/dist/accountData.js";
import {
  CONSENT_POLICIES,
  assertActiveConsent,
  listCurrentConsents,
  recordConsent,
} from "../packages/gateway/dist/consent.js";

const { Pool } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://forge:forge-dev-only@localhost:5432/forge";
const pool = new Pool({ connectionString: DATABASE_URL, max: 3 });
const suffix = randomUUID();
const user = {
  id: `db-consent-${suffix}`,
  name: "Consent DB Gate",
  email: `db-consent-${suffix}@example.test`,
  image: null,
};
const ids = {
  blob: `db-consent-blob-${suffix}`,
  telemetry: `db-consent-telemetry-${suffix}`,
  artifact: `db-consent-artifact-${suffix}`,
  model: `db-consent-model-${suffix}`,
  course: `db-consent-course-${suffix}`,
  leaderboard: `db-consent-leaderboard-${suffix}`,
  photoJob: `db-consent-photo-job-${suffix}`,
  trainingJob: `db-consent-training-job-${suffix}`,
};

const policy = (purpose) => {
  const match = CONSENT_POLICIES.find((candidate) => candidate.purpose === purpose);
  assert.ok(match, `missing policy ${purpose}`);
  return match;
};

const fixtures = [
  ["photoscan.processing", "object-blob", ids.blob],
  ["telemetry.sharing", "telemetry-log", ids.telemetry],
  ["pattern.contribution", "model", ids.model],
  ["leaderboard.publication", "account", user.id],
  ["training.reuse", "telemetry-log", ids.telemetry],
];

let deleted = false;
try {
  await pool.query(`INSERT INTO users (id, name, email) VALUES ($1, $2, $3)`, [user.id, user.name, user.email]);
  await pool.query(
    `INSERT INTO generated_artifacts (
       artifact_id, status, prompt, provider, contract_hash, contract, attempts, context, model_pins, owner_user_id
     ) VALUES ($1, 'admitted', 'consent db proof', 'template', $2, '{}'::jsonb,
               '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, $3)`,
    [ids.artifact, "a".repeat(64), user.id],
  );
  await pool.query(
    `INSERT INTO model_registry (
       id, owner_user_id, source_artifact_id, status, name, archetype, contract_hash, contract
     ) VALUES ($1, $2, $3, 'admitted', 'Consent DB model', 'rover', $4, '{}'::jsonb)`,
    [ids.model, user.id, ids.artifact, "a".repeat(64)],
  );
  await pool.query(
    `INSERT INTO object_blobs (id, owner_user_id, bucket, object_key, metadata)
     VALUES ($1, $2, 'forge-artifacts', $3, '{"purpose":"photoscan-source"}'::jsonb)`,
    [ids.blob, user.id, `users/${user.id}/photos/source.jpg`],
  );
  await pool.query(
    `INSERT INTO telemetry_logs (id, owner_user_id, model_id, source, tape, privacy)
     VALUES ($1, $2, $3, 'fixture', '{"frames":[]}'::jsonb, '{"sharing":"private"}'::jsonb)`,
    [ids.telemetry, user.id, ids.model],
  );
  await pool.query(
    `INSERT INTO courses (id, owner_user_id, name, env_spec, visibility)
     VALUES ($1, $2, 'Consent DB course', '{"schemaVersion":"1.0.0"}'::jsonb, 'public')`,
    [ids.course, user.id],
  );

  for (const [purpose, subjectKind, subjectId] of fixtures) {
    const current = policy(purpose);
    const event = await recordConsent(pool, user, {
      purpose,
      subjectKind,
      subjectId,
      policyVersion: current.policyVersion,
      noticeHash: current.noticeHash,
      action: "grant",
      idempotencyKey: `${purpose}:grant:${suffix}`,
      locale: "en-US",
    });
    assert.equal(event.active, true);
    assert.equal((await assertActiveConsent(pool, user, purpose, subjectKind, subjectId)).id, event.id);
  }

  await pool.query(
    `INSERT INTO pattern_library (
       owner_user_id, source_model_id, source_artifact_id, source_kind, archetype, consent, summary
     ) VALUES ($1, $2, $3, 'user-opt-in', 'rover', 'opt-in',
               '{"structuralIdioms":["db-proof"]}'::jsonb)`,
    [user.id, ids.model, ids.artifact],
  );
  await pool.query(
    `INSERT INTO leaderboard_runs (id, course_id, user_id, score, verified)
     VALUES ($1, $2, $3, 1, true)`,
    [ids.leaderboard, ids.course, user.id],
  );
  await pool.query(
    `INSERT INTO jobs (
       id, owner_user_id, kind, status, input, lease_token, lease_expires_at
     )
     VALUES ($1, $2, 'photoscan.single', 'queued', $3::jsonb, NULL, NULL),
            ($4, $2, 'train.policy', 'running', $5::jsonb, $6, now() + interval '1 hour')`,
    [
      ids.photoJob,
      user.id,
      JSON.stringify({ sourceBlobIds: [ids.blob] }),
      ids.trainingJob,
      JSON.stringify({ telemetryLogIds: [ids.telemetry] }),
      `db-consent-training-lease-${suffix}`,
    ],
  );

  const firstEvent = (await listCurrentConsents(pool, user))[0];
  await assert.rejects(
    pool.query(`UPDATE user_consent_events SET action = 'withdraw' WHERE id = $1`, [firstEvent.id]),
    /append-only/,
  );

  for (const [purpose, subjectKind, subjectId] of fixtures) {
    const current = policy(purpose);
    const event = await recordConsent(pool, user, {
      purpose,
      subjectKind,
      subjectId,
      policyVersion: current.policyVersion,
      noticeHash: current.noticeHash,
      action: "withdraw",
      idempotencyKey: `${purpose}:withdraw:${suffix}`,
    });
    assert.equal(event.active, false);
    assert.ok(event.previousEventId);
  }

  const latest = await listCurrentConsents(pool, user);
  assert.equal(latest.length, 5);
  assert.ok(latest.every((event) => event.action === "withdraw" && !event.active));
  const state = await pool.query(
    `SELECT
       (SELECT status FROM jobs WHERE id = $1) AS photo_job,
       (SELECT status FROM jobs WHERE id = $2) AS training_job,
       (SELECT lease_token FROM jobs WHERE id = $1) AS photo_lease,
       (SELECT lease_token FROM jobs WHERE id = $2) AS training_lease,
       (SELECT privacy ->> 'sharing' FROM telemetry_logs WHERE id = $3) AS telemetry_sharing,
       (SELECT count(*) FROM pattern_library WHERE source_artifact_id = $4) AS pattern_rows,
       (SELECT count(*) FROM leaderboard_runs WHERE id = $5) AS leaderboard_rows`,
    [ids.photoJob, ids.trainingJob, ids.telemetry, ids.artifact, ids.leaderboard],
  );
  assert.equal(state.rows[0].photo_job, "cancelled");
  assert.equal(state.rows[0].training_job, "cancelled");
  assert.equal(state.rows[0].photo_lease, null);
  assert.equal(state.rows[0].training_lease, null);
  assert.equal(state.rows[0].telemetry_sharing, "private");
  assert.equal(Number(state.rows[0].pattern_rows), 0);
  assert.equal(Number(state.rows[0].leaderboard_rows), 0);

  const deletion = await deleteUserData(pool, user, async () => undefined);
  deleted = true;
  const residue = await pool.query(
    `SELECT count(*) AS n FROM user_consent_events WHERE owner_user_id = $1`,
    [user.id],
  );
  assert.equal(Number(residue.rows[0].n), 0);
  await pool.query(`DELETE FROM deletion_tombstones WHERE deletion_id = $1`, [deletion.deletionId]);
  await pool.query(
    `DELETE FROM data_lifecycle_events WHERE evidence_reference = $1`,
    [deletion.deletionId],
  );
  console.log("ok consent ledger: five versioned grant/withdraw histories and bounded effects verified");
  console.log("ok consent immutability: in-place update rejected; account deletion leaves zero consent residue");
} finally {
  if (!deleted) {
    try {
      await deleteUserData(pool, user, async () => undefined);
    } catch {
      // Unique fixture identifiers preserve failed evidence for diagnosis.
    }
  }
  await pool.end();
}
