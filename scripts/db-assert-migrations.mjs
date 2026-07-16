#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  applyMigrations,
  loadMigrations,
  migrationChecksum,
} from "./postgres-migrations.mjs";

const { Client } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "artifacts", "e2e");
const evidencePath = join(outDir, "qa004-migration-acceptance.json");
const databaseUrl = process.env.DATABASE_URL?.trim();
const runSuffix = `${process.pid}-${randomUUID().slice(0, 8)}`;
const migrations = loadMigrations(join(root, "infra", "migrations"));
const d38MigrationPosition = migrations.findIndex((migration) =>
  migration.filename.startsWith("0021_job_leases_and_upload_verification")) + 1;
const d39MigrationPosition = migrations.findIndex((migration) =>
  migration.filename.startsWith("0022_policy_delivery_authority")) + 1;
const noLog = () => undefined;

if (!databaseUrl) throw new Error("DATABASE_URL is required for migration acceptance");
assert.ok(migrations.length >= 2, "migration acceptance requires a current and a prior schema");
assert.ok(d38MigrationPosition > 0, "migration acceptance requires the D38 migration");
assert.ok(d39MigrationPosition > 0, "migration acceptance requires the D39 migration");

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const checkoutRevision = git("rev-parse", "HEAD");
const declaredRevision =
  process.env.FORGE_SOURCE_REVISION?.trim() || process.env.GITHUB_SHA?.trim() || checkoutRevision;
assert.match(declaredRevision, /^[0-9a-f]{40}$/, "source revision must be a full Git SHA");
assert.match(checkoutRevision, /^[0-9a-f]{40}$/, "checkout revision must be a full Git SHA");

const evidence = {
  formatVersion: "qa004-migration-acceptance.v1",
  status: "running",
  startedAt: new Date().toISOString(),
  sourceRevision: declaredRevision,
  checkoutRevision,
  sourceRevisionKind:
    process.env.FORGE_SOURCE_REVISION || process.env.GITHUB_SHA ? "ci-event" : "local-checkout",
  worktreeDirty: git("status", "--porcelain").length > 0,
  currentMigration: migrations.at(-1).filename,
  migrationCount: migrations.length,
  cleanInstall: null,
  supportedPredecessors: [],
  recovery: null,
  concurrency: null,
};

function quotedIdentifier(value) {
  assert.match(value, /^[a-z0-9_]+$/);
  return `"${value}"`;
}

async function setSchema(client, schema) {
  await client.query(`SET search_path TO ${quotedIdentifier(schema)}, public`);
}

async function withSchema(client, label, callback) {
  const schema = `qa004_${label}_${runSuffix}`.replaceAll("-", "_");
  await client.query(`CREATE SCHEMA ${quotedIdentifier(schema)}`);
  try {
    await setSchema(client, schema);
    return await callback(schema);
  } finally {
    await client.query("SET search_path TO public");
    await client.query(`DROP SCHEMA IF EXISTS ${quotedIdentifier(schema)} CASCADE`);
  }
}

function migrationFor(filename, sql) {
  return { filename, sql, checksum: migrationChecksum(sql) };
}

async function migrationRows(client) {
  return (
    await client.query(
      "SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename",
    )
  ).rows;
}

async function assertRecorderMaterializationConstraints(client) {
  assert.ok(
    (await client.query("SELECT to_regclass('recorder_archive_materializations') AS name")).rows[0].name,
  );
  const userId = "qa004-recorder-user";
  const blobIds = ["manifest", "frame", "index", "replay", "receipt"].map(
    (role) => `qa004-recorder-${role}`,
  );
  await client.query(
    "INSERT INTO users (id, name, email) VALUES ($1, 'QA-004 recorder', 'qa004-recorder@example.test')",
    [userId],
  );
  for (let index = 0; index < blobIds.length; index += 1) {
    await client.query(
      `INSERT INTO object_blobs (
         id, owner_user_id, visibility, bucket, object_key, content_type,
         byte_size, sha256, upload_status, verified_at, metadata
       ) VALUES ($1, $2, 'private', 'qa004', $3, $4, $5, $6, 'complete', now(), '{}'::jsonb)`,
      [
        blobIds[index],
        userId,
        `users/${userId}/recorder/${index}`,
        index === 1 || index === 2 ? "application/x-ndjson" : "application/json",
        100 + index,
        String(index + 1).repeat(64),
      ],
    );
  }
  const inserted = await client.query(
    `INSERT INTO recorder_archive_materializations (
       id, owner_user_id, artifact_id, manifest_blob_id, frame_blob_id, index_blob_id,
       replay_blob_id, receipt_blob_id, upload_plan, aggregate_byte_size
     ) VALUES (
       'qa004-recorder-materialization', $1, 'qa004-recorder-artifact', $2, $3, $4, $5, $6,
       '{"schemaVersion":"forge-recorder-upload-plan/1.0.0"}'::jsonb, 510
     ) RETURNING status, gateway_object_integrity_verified, gateway_archive_semantics_verified,
                 recorded_device_attested, sharing_authorized, training_reuse_authorized, no_auto_arm`,
    [userId, ...blobIds],
  );
  assert.deepEqual(inserted.rows[0], {
    status: "staged",
    gateway_object_integrity_verified: false,
    gateway_archive_semantics_verified: false,
    recorded_device_attested: false,
    sharing_authorized: false,
    training_reuse_authorized: false,
    no_auto_arm: true,
  });
  await assert.rejects(
    client.query(
      "UPDATE recorder_archive_materializations SET gateway_archive_semantics_verified = true WHERE id = 'qa004-recorder-materialization'",
    ),
    /check constraint/,
  );
  await assert.rejects(
    client.query(
      "UPDATE recorder_archive_materializations SET status = 'materialized' WHERE id = 'qa004-recorder-materialization'",
    ),
    /check constraint/,
  );
  const materialized = await client.query(
    `UPDATE recorder_archive_materializations
        SET status = 'materialized', gateway_object_integrity_verified = true, materialized_at = now()
      WHERE id = 'qa004-recorder-materialization'
      RETURNING status, gateway_object_integrity_verified,
                gateway_archive_semantics_verified, materialized_at IS NOT NULL AS has_materialized_at`,
  );
  assert.deepEqual(materialized.rows[0], {
    status: "materialized",
    gateway_object_integrity_verified: true,
    gateway_archive_semantics_verified: false,
    has_materialized_at: true,
  });
  await client.query("DELETE FROM users WHERE id = $1", [userId]);
  assert.equal(
    Number((await client.query("SELECT count(*) AS n FROM recorder_archive_materializations")).rows[0].n),
    0,
  );
}

async function assertCurrentLedger(client) {
  const rows = await migrationRows(client);
  assert.equal(rows.length, migrations.length);
  for (let index = 0; index < migrations.length; index += 1) {
    assert.equal(rows[index].filename, migrations[index].filename);
    assert.equal(rows[index].checksum, migrations[index].checksum);
  }
  assert.ok((await client.query("SELECT to_regclass('licenses') AS name")).rows[0].name);
  assert.ok((await client.query("SELECT to_regclass('jobs') AS name")).rows[0].name);
  const jobsKindConstraint = (
    await client.query(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'jobs'::regclass
          AND conname = 'jobs_kind_check'`,
    )
  ).rows[0]?.definition;
  assert.match(jobsKindConstraint ?? "", /train\.offline-bc/);
  const offline = await client.query(
    `INSERT INTO jobs (kind, status, provider, input)
     VALUES ('train.offline-bc', 'queued', 'local', '{}'::jsonb)
     RETURNING id`,
  );
  assert.equal(offline.rowCount, 1);
  await client.query("DELETE FROM jobs WHERE id = $1", [offline.rows[0].id]);
  assert.ok((await client.query("SELECT to_regclass('job_provider_calls') AS name")).rows[0].name);
  const modalJob = await client.query(
    `INSERT INTO jobs (
       kind, status, provider, input, provider_call_id, provider_function_version,
       provider_environment, provider_deployment_contract_hash, provider_submitted_at
     )
     VALUES (
       'train.policy', 'queued', 'modal', '{}'::jsonb, 'fc-qa004-current', 9007199254740991,
       'qa004', $1, now()
     )
     RETURNING id`,
    ["d".repeat(64)],
  );
  await client.query(
    `INSERT INTO job_provider_calls (
       call_id, job_id, attempt, provider, function_version, environment,
       deployment_contract_hash, submitted_at
     )
     VALUES ('fc-qa004-current', $1, 1, 'modal', 9007199254740991, 'qa004', $2, now())`,
    [modalJob.rows[0].id, "d".repeat(64)],
  );
  assert.equal(
    Number((await client.query("SELECT count(*) AS n FROM job_provider_calls WHERE job_id = $1", [modalJob.rows[0].id])).rows[0].n),
    1,
  );
  await client.query("DELETE FROM jobs WHERE id = $1", [modalJob.rows[0].id]);
  await assertRecorderMaterializationConstraints(client);
  return rows;
}

async function populatePredecessor(client, prefix) {
  const ids = {
    license: `qa004-license-${prefix}`,
    component: `qa004-component-${prefix}`,
    artifact: `qa004-artifact-${prefix}`,
    user: `qa004-user-${prefix}`,
    job: `qa004-job-${prefix}`,
    blob: `qa004-blob-${prefix}`,
    policyJob: `qa004-policy-job-${prefix}`,
    policyBlob: `qa004-policy-blob-${prefix}`,
    policyArtifact: `qa004-policy-${prefix}`,
    ambiguousPolicyJob: `qa004-policy-job-ambiguous-${prefix}`,
    ambiguousPolicyBlobA: `qa004-policy-blob-ambiguous-a-${prefix}`,
    ambiguousPolicyBlobB: `qa004-policy-blob-ambiguous-b-${prefix}`,
    ambiguousPolicyArtifactA: `qa004-policy-ambiguous-a-${prefix}`,
    ambiguousPolicyArtifactB: `qa004-policy-ambiguous-b-${prefix}`,
    modalJob: `qa004-modal-job-${prefix}`,
    course: `qa004-course-${prefix}`,
    leaderboard: `qa004-leaderboard-${prefix}`,
    consentParent: `qa004-consent-parent-${prefix}`,
    consentChild: `qa004-consent-child-${prefix}`,
    holdParent: `qa004-hold-parent-${prefix}`,
    holdChild: `qa004-hold-child-${prefix}`,
  };
  const fixtureFamilies = ["catalog"];

  await client.query(
    "INSERT INTO licenses (id, class, terms, source_url) VALUES ($1, 'open', 'QA-004 fixture', 'https://example.test/license')",
    [ids.license],
  );
  await client.query(
    `INSERT INTO components (
       id, brand, model, rev, category, dims, mass_g, license_id, source, confidence
     ) VALUES ($1, 'QA004', $2, 'r1', 'motor', '{"x":0.01,"y":0.02,"z":0.03}'::jsonb,
               12.5, $3, 'datasheet', 1)`,
    [ids.component, `Model-${prefix}`, ids.license],
  );
  await client.query(
    "INSERT INTO component_revisions (component_id, version, snapshot) VALUES ($1, '1.0.0', '{\"qa004\":true}'::jsonb)",
    [ids.component],
  );
  await client.query(
    `INSERT INTO prices (component_id, vendor, price, currency, url)
     VALUES ($1, 'QA004 Vendor', 42.5, 'EUR', 'https://example.test/component')`,
    [ids.component],
  );
  await client.query(
    `INSERT INTO provenance (artifact_id, field, source_url, extractor, confidence)
     VALUES ($1, 'mass_g', 'https://example.test/datasheet', 'qa004', 1)`,
    [ids.component],
  );

  if (prefix >= 3) {
    fixtureFamilies.push("review");
    await client.query(
      `INSERT INTO review_queue (artifact_id, artifact_kind, reason, confidence, payload)
       VALUES ($1, 'component', 'qa004 predecessor proof', 1, '{"qa004":true}'::jsonb)`,
      [ids.component],
    );
  }

  if (prefix >= 5) {
    fixtureFamilies.push("generation");
    await client.query(
      `INSERT INTO generated_artifacts (
         artifact_id, status, prompt, provider, contract_hash, contract, attempts, context, model_pins
       ) VALUES ($1, 'admitted', 'QA-004 predecessor', 'template', $2,
                 '{"qa004":true}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [ids.artifact, "a".repeat(64)],
    );
  }

  if (prefix >= 6) {
    fixtureFamilies.push("platform");
    const legacyJobStatus = prefix < d38MigrationPosition ? "running" : "queued";
    await client.query(
      "INSERT INTO users (id, name, email) VALUES ($1, 'QA-004 user', $2)",
      [ids.user, `qa004-${prefix}@example.test`],
    );
    await client.query(
      `INSERT INTO jobs (id, owner_user_id, kind, status, provider, input)
       VALUES ($1, $2, 'etl.ingest-component', $3, 'fixture', '{"qa004":true}'::jsonb)`,
      [ids.job, ids.user, legacyJobStatus],
    );
    await client.query(
      `INSERT INTO object_blobs (id, bucket, object_key, metadata)
       VALUES ($1, 'qa004', $2, '{"qa004":true}'::jsonb)`,
      [ids.blob, `prefix-${prefix}/fixture.bin`],
    );
    await client.query(
      `INSERT INTO courses (id, owner_user_id, name, env_spec)
       VALUES ($1, $2, 'QA-004 course', '{"schemaVersion":"1.0.0"}'::jsonb)`,
      [ids.course, ids.user],
    );
    await client.query(
      `INSERT INTO leaderboard_runs (id, course_id, user_id, score, verified)
       VALUES ($1, $2, $3, 7.5, true)`,
      [ids.leaderboard, ids.course, ids.user],
    );
  }

  if (prefix >= 16) {
    fixtureFamilies.push("consent-authority");
    const common = [
      ids.consentParent,
      ids.consentChild,
      ids.user,
      "b".repeat(64),
    ];
    if (prefix === 18) {
      await client.query(
        `INSERT INTO user_consent_events (
           id, ledger_version, owner_user_id, purpose, subject_kind, subject_id,
           policy_version, notice_hash, action, idempotency_key, previous_event_id,
           created_at, event_sequence
         ) VALUES
           ($1, '1.0.0', $3, 'leaderboard.publication', 'account', $3,
            'qa004-policy', $4, 'grant', 'qa004-consent-parent', NULL,
            '2026-07-13T00:00:00Z', 200),
           ($2, '1.0.0', $3, 'leaderboard.publication', 'account', $3,
            'qa004-policy', $4, 'withdraw', 'qa004-consent-child', $1,
            '2026-07-13T00:00:00Z', 100)`,
        common,
      );
    } else {
      await client.query(
        `INSERT INTO user_consent_events (
           id, ledger_version, owner_user_id, purpose, subject_kind, subject_id,
           policy_version, notice_hash, action, idempotency_key, previous_event_id, created_at
         ) VALUES
           ($1, '1.0.0', $3, 'leaderboard.publication', 'account', $3,
            'qa004-policy', $4, 'grant', 'qa004-consent-parent', NULL, '2026-07-13T00:00:00Z'),
           ($2, '1.0.0', $3, 'leaderboard.publication', 'account', $3,
            'qa004-policy', $4, 'withdraw', 'qa004-consent-child', $1, '2026-07-13T00:00:00Z')`,
        common,
      );
    }
  }

  if (prefix >= 17) {
    fixtureFamilies.push("lifecycle-authority");
    const common = [ids.holdParent, ids.holdChild, "c".repeat(64)];
    const sequenceColumns = prefix === 18 ? ", event_sequence" : "";
    const parentSequence = prefix === 18 ? ", 200" : "";
    const childSequence = prefix === 18 ? ", 100" : "";
    await client.query(
      `INSERT INTO legal_hold_events (
         id, lifecycle_version, hold_key, action, subject_kind, subject_digest,
         reason_code, authority_reference, jurisdiction, evidence_reference,
         expires_at, idempotency_key, previous_event_id, created_at${sequenceColumns}
       ) VALUES
         ($1, '1.0.0', 'qa004-hold', 'place', 'user', $3, 'litigation',
          'authority/qa004', 'EU-DE', 'evidence/qa004-place', '2027-01-01T00:00:00Z',
          'qa004-hold-parent', NULL, '2026-07-13T00:00:00Z'${parentSequence}),
         ($2, '1.0.0', 'qa004-hold', 'release', 'user', $3, 'litigation',
          'authority/qa004', 'EU-DE', 'evidence/qa004-release', '2027-01-01T00:00:00Z',
          'qa004-hold-child', $1, '2026-07-13T00:00:00Z'${childSequence})`,
      common,
    );
  }

  if (prefix >= 21) {
    fixtureFamilies.push("policy-delivery-authority");
    await client.query(
      `INSERT INTO jobs (
         id, owner_user_id, kind, status, provider, input, output, started_at, finished_at
       ) VALUES (
         $1, $2, 'train.policy', 'succeeded', 'local',
         '{"modelId":null,"contractHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
         '{"artifactKind":"policy","onnx":{"modelBase64":"AQ==","byteSize":1,"sha256":"4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7c0d7d5b7455e34"},"io":{"tensor":{"schema":"forge-policy-tensor"}},"scorecard":{"exportable":true,"lineage":{"contractHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}'::jsonb,
         now(), now()
       )`,
      [ids.policyJob, ids.user],
    );
    await client.query(
      `INSERT INTO object_blobs (
         id, owner_user_id, visibility, bucket, object_key, content_type,
         byte_size, sha256, upload_status, verified_at, metadata
       ) VALUES (
         $1, $2, 'private', 'qa004', $3, 'application/octet-stream', 1,
         '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7c0d7d5b7455e34',
         'complete', now(), jsonb_build_object('jobId', $4::text, 'artifactKind', 'policy')
       )`,
      [ids.policyBlob, ids.user, `users/${ids.user}/policy-onnx/fixture`, ids.policyJob],
    );
    const currentPolicyColumns = prefix >= d39MigrationPosition
      ? ", job_id, policy_metadata"
      : "";
    const currentPolicyValues = prefix >= d39MigrationPosition
      ? `, $4,
         '{"artifactKind":"policy","onnx":{"byteSize":1,"sha256":"4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7c0d7d5b7455e34"},"io":{"tensor":{"schema":"forge-policy-tensor"}},"scorecard":{"exportable":true,"lineage":{"contractHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}}'::jsonb`
      : "";
    await client.query(
      `INSERT INTO policy_artifacts (
         id, owner_user_id, task_kind, scorecard, artifact_blob_id, export_gate${currentPolicyColumns}
       ) VALUES (
         $1, $2, 'hover-hold',
         '{"exportable":true,"lineage":{"contractHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}'::jsonb,
         $3, 'exportable'${currentPolicyValues}
       )`,
      [
        ids.policyArtifact,
        ids.user,
        ids.policyBlob,
        ...(prefix >= d39MigrationPosition ? [ids.policyJob] : []),
      ],
    );
    await client.query(
      `INSERT INTO jobs (
         id, owner_user_id, kind, status, provider, input, output, started_at, finished_at
       ) VALUES (
         $1, $2, 'train.policy', 'succeeded', 'local', '{}'::jsonb,
         '{"artifactKind":"policy","onnx":{"modelBase64":"AQ==","byteSize":1,"sha256":"4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7c0d7d5b7455e34"}}'::jsonb,
         now(), now()
       )`,
      [ids.ambiguousPolicyJob, ids.user],
    );
    await client.query(
      `INSERT INTO object_blobs (
         id, owner_user_id, visibility, bucket, object_key, content_type,
         byte_size, sha256, upload_status, verified_at, metadata
       ) VALUES
         ($1, $3, 'private', 'qa004', $4, 'application/octet-stream', 1,
          '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7c0d7d5b7455e34',
          'complete', now(), jsonb_build_object('jobId', $6::text, 'artifactKind', 'policy')),
         ($2, $3, 'private', 'qa004', $5, 'application/octet-stream', 1,
          '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7c0d7d5b7455e34',
          'complete', now(), jsonb_build_object('jobId', $6::text, 'artifactKind', 'policy'))`,
      [
        ids.ambiguousPolicyBlobA,
        ids.ambiguousPolicyBlobB,
        ids.user,
        `users/${ids.user}/policy-onnx/ambiguous-a`,
        `users/${ids.user}/policy-onnx/ambiguous-b`,
        ids.ambiguousPolicyJob,
      ],
    );
    await client.query(
      `INSERT INTO policy_artifacts (
         id, owner_user_id, task_kind, scorecard, artifact_blob_id, export_gate
       ) VALUES
         ($1, $3, 'hover-a', '{}'::jsonb, $4, 'blocked'),
         ($2, $3, 'hover-b', '{}'::jsonb, $5, 'blocked')`,
      [
        ids.ambiguousPolicyArtifactA,
        ids.ambiguousPolicyArtifactB,
        ids.user,
        ids.ambiguousPolicyBlobA,
        ids.ambiguousPolicyBlobB,
      ],
    );
  }

  if (prefix >= 23) {
    fixtureFamilies.push("modal-operation-predecessor");
    await client.query(
      `INSERT INTO jobs (id, owner_user_id, kind, status, provider, input, cost_credits)
       VALUES ($1, $2, 'train.policy', 'queued', 'modal', '{"qa004":true}'::jsonb, 1)`,
      [ids.modalJob, ids.user],
    );
  }

  return { ids, fixtureFamilies };
}

async function assertFixturePreserved(client, prefix, fixture) {
  const { ids } = fixture;
  const component = (
    await client.query(
      `SELECT c.mass_g, p.region, p.purchasable,
              (SELECT count(*)::int FROM provenance WHERE artifact_id = c.id) AS provenance_count
         FROM components c JOIN prices p ON p.component_id = c.id WHERE c.id = $1`,
      [ids.component],
    )
  ).rows[0];
  assert.equal(component.mass_g, "12.5");
  assert.equal(component.region, "US");
  assert.equal(component.purchasable, true);
  assert.equal(component.provenance_count, 1);

  if (prefix >= 3) {
    const review = (
      await client.query("SELECT decision_payload FROM review_queue WHERE artifact_id = $1", [ids.component])
    ).rows[0];
    assert.deepEqual(review.decision_payload, {});
  }
  if (prefix >= 5) {
    const artifact = (
      await client.query(
        "SELECT status, visibility, source_kind, share_eligible FROM generated_artifacts WHERE artifact_id = $1",
        [ids.artifact],
      )
    ).rows[0];
    assert.deepEqual(artifact, {
      status: "admitted",
      visibility: "private",
      source_kind: "generation",
      share_eligible: false,
    });
  }
  if (prefix >= 6) {
    const legacyJobWasRequeued = prefix < d38MigrationPosition;
    const platform = (
      await client.query(
        `SELECT
           (SELECT status FROM jobs WHERE id = $1) AS job_status,
           (SELECT attempts FROM jobs WHERE id = $1) AS attempts,
           (SELECT lease_token FROM jobs WHERE id = $1) AS lease_token,
           (SELECT lease_expires_at FROM jobs WHERE id = $1) AS lease_expires_at,
           (SELECT last_error_code FROM jobs WHERE id = $1) AS last_error_code,
           (SELECT visibility FROM object_blobs WHERE id = $2) AS visibility,
           (SELECT upload_status FROM object_blobs WHERE id = $2) AS upload_status,
           (SELECT archetype FROM leaderboard_runs WHERE id = $3) AS archetype,
           (SELECT class_key FROM leaderboard_runs WHERE id = $3) AS class_key`,
        [ids.job, ids.blob, ids.leaderboard],
      )
    ).rows[0];
    assert.deepEqual(platform, {
      job_status: "queued",
      attempts: 0,
      lease_token: null,
      lease_expires_at: null,
      last_error_code: legacyJobWasRequeued ? "lease-migration-requeue" : null,
      visibility: "private",
      upload_status: "complete",
      archetype: null,
      class_key: null,
    });
  }
  if (prefix >= 16) {
    const rows = (
      await client.query(
        "SELECT id, event_sequence, previous_event_id FROM user_consent_events WHERE id IN ($1, $2)",
        [ids.consentParent, ids.consentChild],
      )
    ).rows;
    const parent = rows.find((row) => row.id === ids.consentParent);
    const child = rows.find((row) => row.id === ids.consentChild);
    assert.ok(Number(parent.event_sequence) < Number(child.event_sequence));
    assert.equal(child.previous_event_id, parent.id);
  }
  if (prefix >= 17) {
    const rows = (
      await client.query(
        "SELECT id, event_sequence, previous_event_id FROM legal_hold_events WHERE id IN ($1, $2)",
        [ids.holdParent, ids.holdChild],
      )
    ).rows;
    const parent = rows.find((row) => row.id === ids.holdParent);
    const child = rows.find((row) => row.id === ids.holdChild);
    assert.ok(Number(parent.event_sequence) < Number(child.event_sequence));
    assert.equal(child.previous_event_id, parent.id);
  }
  if (prefix >= 21) {
    const policy = (
      await client.query(
        `SELECT job_id, policy_metadata,
                policy_metadata #>> '{onnx,modelBase64}' AS inline_model,
                jsonb_typeof(policy_metadata) AS metadata_type
           FROM policy_artifacts
          WHERE id = $1`,
        [ids.policyArtifact],
      )
    ).rows[0];
    assert.equal(policy.job_id, ids.policyJob);
    assert.equal(policy.policy_metadata.artifactKind, "policy");
    assert.equal(policy.policy_metadata.onnx.byteSize, 1);
    assert.equal(policy.inline_model, null);
    assert.equal(policy.metadata_type, "object");
    const ambiguous = (
      await client.query(
        `SELECT id, job_id, policy_metadata
           FROM policy_artifacts
          WHERE id IN ($1, $2)
          ORDER BY id`,
        [ids.ambiguousPolicyArtifactA, ids.ambiguousPolicyArtifactB],
      )
    ).rows;
    assert.equal(ambiguous.length, 2);
    assert.ok(ambiguous.every((row) => row.job_id === null));
    assert.ok(ambiguous.every((row) => Object.keys(row.policy_metadata).length === 0));
    assert.ok((await client.query("SELECT to_regclass('policy_artifacts_job_id_idx') AS name")).rows[0].name);
  }
  if (prefix >= 23) {
    const modal = (
      await client.query(
        `SELECT status, provider, cost_credits, provider_call_id, cancel_requested_at,
                credit_refunded_at
           FROM jobs WHERE id = $1`,
        [ids.modalJob],
      )
    ).rows[0];
    assert.deepEqual(modal, {
      status: "queued",
      provider: "modal",
      cost_credits: "1",
      provider_call_id: null,
      cancel_requested_at: null,
      credit_refunded_at: null,
    });
  }
}

async function assertIdempotentRerun(client, lockKey, beforeRows) {
  const rerun = await applyMigrations(client, migrations, { lockKey, log: noLog });
  assert.deepEqual(rerun.applied, []);
  assert.deepEqual(rerun.skipped, migrations.map((migration) => migration.filename));
  const afterRows = await migrationRows(client);
  assert.deepEqual(
    afterRows.map((row) => [row.filename, row.checksum, row.applied_at.toISOString()]),
    beforeRows.map((row) => [row.filename, row.checksum, row.applied_at.toISOString()]),
  );
}

async function proveFailureRecovery(client) {
  return withSchema(client, "recovery", async (schema) => {
    const failing = migrationFor(
      "9000_atomic_failure.sql",
      "CREATE TABLE qa004_partial (id integer PRIMARY KEY); INSERT INTO qa004_partial VALUES (1); SELECT qa004_missing_function();",
    );
    await assert.rejects(
      applyMigrations(client, [failing], { lockKey: `qa004:${schema}`, log: noLog }),
      /migration failed and was rolled back/,
    );
    assert.equal((await client.query("SELECT to_regclass('qa004_partial') AS name")).rows[0].name, null);
    assert.equal(
      Number((await client.query("SELECT count(*) AS n FROM schema_migrations")).rows[0].n),
      0,
    );

    const corrected = migrationFor(
      failing.filename,
      "CREATE TABLE qa004_partial (id integer PRIMARY KEY); INSERT INTO qa004_partial VALUES (1);",
    );
    const recovered = await applyMigrations(client, [corrected], {
      lockKey: `qa004:${schema}`,
      log: noLog,
    });
    assert.deepEqual(recovered.applied, [corrected.filename]);
    assert.equal(Number((await client.query("SELECT count(*) AS n FROM qa004_partial")).rows[0].n), 1);

    const drifted = migrationFor(corrected.filename, `${corrected.sql} SELECT 2;`);
    await assert.rejects(
      applyMigrations(client, [drifted], { lockKey: `qa004:${schema}`, log: noLog }),
      /checksum changed after migration was applied/,
    );
    return { atomicRollback: true, correctedRollForward: true, checksumDriftRefused: true };
  });
}

async function proveGapRefusal(client) {
  return withSchema(client, "gap", async (schema) => {
    const sources = [
      migrationFor("9001_first.sql", "SELECT 1;"),
      migrationFor("9002_second.sql", "SELECT 2;"),
    ];
    await client.query(`
      CREATE TABLE schema_migrations (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query("INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)", [
      sources[1].filename,
      sources[1].checksum,
    ]);
    await assert.rejects(
      applyMigrations(client, sources, { lockKey: `qa004:${schema}`, log: noLog }),
      /not a contiguous checked-in prefix/,
    );
    return true;
  });
}

async function proveConcurrentSerialization(client) {
  return withSchema(client, "concurrent", async (schema) => {
    const source = migrationFor(
      "9001_concurrent.sql",
      "CREATE TABLE qa004_concurrent (id integer PRIMARY KEY); INSERT INTO qa004_concurrent VALUES (1); SELECT pg_sleep(0.2);",
    );
    const clients = [new Client({ connectionString: databaseUrl }), new Client({ connectionString: databaseUrl })];
    try {
      await Promise.all(clients.map((candidate) => candidate.connect()));
      await Promise.all(clients.map((candidate) => setSchema(candidate, schema)));
      const results = await Promise.all(
        clients.map((candidate) =>
          applyMigrations(candidate, [source], { lockKey: `qa004:${schema}`, log: noLog }),
        ),
      );
      assert.equal(results.reduce((total, result) => total + result.applied.length, 0), 1);
      assert.equal(results.reduce((total, result) => total + result.skipped.length, 0), 1);
      assert.equal(Number((await client.query("SELECT count(*) AS n FROM qa004_concurrent")).rows[0].n), 1);
      return { serialized: true, appliedOnce: true };
    } finally {
      await Promise.allSettled(clients.map((candidate) => candidate.end()));
    }
  });
}

mkdirSync(outDir, { recursive: true });
const client = new Client({ connectionString: databaseUrl });
let connected = false;
try {
  await client.connect();
  connected = true;
  await client.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public");
  await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public");
  evidence.database = {
    serverVersion: (await client.query("SHOW server_version")).rows[0].server_version,
    vectorVersion: (
      await client.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
    ).rows[0].extversion,
    pgcryptoPresent: Boolean(
      (await client.query("SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'")).rowCount,
    ),
  };

  evidence.cleanInstall = await withSchema(client, "clean", async (schema) => {
    const result = await applyMigrations(client, migrations, { lockKey: `qa004:${schema}`, log: noLog });
    assert.equal(result.applied.length, migrations.length);
    const rows = await assertCurrentLedger(client);
    await assertIdempotentRerun(client, `qa004:${schema}`, rows);
    return { applied: result.applied.length, idempotentRerun: true };
  });

  for (let prefix = 1; prefix < migrations.length; prefix += 1) {
    const scenario = await withSchema(client, `p${String(prefix).padStart(2, "0")}`, async (schema) => {
      const predecessor = migrations.slice(0, prefix);
      const initial = await applyMigrations(client, predecessor, {
        lockKey: `qa004:${schema}`,
        log: noLog,
      });
      assert.equal(initial.applied.length, prefix);
      const fixture = await populatePredecessor(client, prefix);
      const upgrade = await applyMigrations(client, migrations, {
        lockKey: `qa004:${schema}`,
        log: noLog,
      });
      assert.equal(upgrade.applied.length, migrations.length - prefix);
      await assertFixturePreserved(client, prefix, fixture);
      const rows = await assertCurrentLedger(client);
      await assertIdempotentRerun(client, `qa004:${schema}`, rows);
      return {
        prefix,
        predecessor: predecessor.at(-1).filename,
        migrationsApplied: upgrade.applied.length,
        fixtureFamilies: fixture.fixtureFamilies,
        populatedDataPreserved: true,
        idempotentRerun: true,
      };
    });
    evidence.supportedPredecessors.push(scenario);
    console.log(
      `ok migration predecessor ${scenario.predecessor}: ${scenario.fixtureFamilies.join(", ")} preserved`,
    );
  }

  evidence.recovery = await proveFailureRecovery(client);
  evidence.recovery.historyGapRefused = await proveGapRefusal(client);
  evidence.concurrency = await proveConcurrentSerialization(client);
  evidence.status = "passed";
  evidence.completedAt = new Date().toISOString();
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    `ok QA-004: clean install plus ${evidence.supportedPredecessors.length} populated predecessors; atomic recovery and concurrent serialization verified`,
  );
  console.log(`evidence ${evidencePath}`);
} catch (error) {
  evidence.status = "failed";
  evidence.completedAt = new Date().toISOString();
  evidence.error = error instanceof Error ? error.message : String(error);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  throw error;
} finally {
  if (connected) await client.end();
}
