#!/usr/bin/env node
import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://forge:forge-dev-only@localhost:5432/forge";

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

const one = async (sql) => Number((await client.query(sql)).rows[0].n);
const checks = [
  ["components", await one("SELECT count(*) AS n FROM components"), 8],
  ["component_revisions", await one("SELECT count(*) AS n FROM component_revisions"), 8],
  ["licenses", await one("SELECT count(*) AS n FROM licenses"), 8],
  ["prices", await one("SELECT count(*) AS n FROM prices WHERE purchasable"), 8],
  ["thrust_tables", await one("SELECT count(*) AS n FROM thrust_tables"), 2],
  ["review_queue", await one("SELECT count(*) AS n FROM review_queue WHERE status = 'needs_review'"), 1],
  ["generated_artifacts", await one("SELECT count(*) AS n FROM generated_artifacts"), 0],
  ["reference_rigs", await one("SELECT count(*) AS n FROM reference_rigs"), 2],
  ["reference_rig_items", await one("SELECT count(*) AS n FROM reference_rig_items"), 7],
  ["provenance", await one("SELECT count(*) AS n FROM provenance"), 20],
];

for (const table of [
  "users",
  "accounts",
  "sessions",
  "credit_accounts",
  "credit_ledger",
  "usage_events",
  "model_registry",
  "share_snapshots",
  "pattern_library",
  "eval_runs",
  "jobs",
  "job_events",
  "object_blobs",
  "photoscan_artifacts",
  "policy_artifacts",
  "replay_artifacts",
  "courses",
  "leaderboard_runs",
  "marketplace_listings",
  "policy_signoffs",
  "moderation_reports",
  "classroom_assignments",
  "classroom_submissions",
  "telemetry_logs",
  "maintenance_records",
  "vendor_offers",
  "print_quote_requests",
  "print_quote_offers",
  "marketplace_usage_rollups",
  "generation_refusals",
  "user_consent_events",
  "legal_hold_events",
  "backup_records",
  "backup_subjects",
  "deletion_tombstones",
  "backup_restore_tests",
  "data_lifecycle_events",
]) {
  checks.push([table, await one(`SELECT count(*) AS n FROM ${table}`), 0]);
}

checks.push([
  "data_retention_policies",
  await one("SELECT count(*) AS n FROM data_retention_policies WHERE policy_version = '1.0.0'"),
  6,
]);

let failures = 0;
for (const [name, got, min] of checks) {
  if (got < min) {
    console.error(`FAIL ${name}: ${got} < ${min}`);
    failures++;
  } else {
    console.log(`ok ${name}: ${got}`);
  }
}

const prohibitedRefusalColumns = await one(`
  SELECT count(*) AS n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'generation_refusals'
     AND column_name IN ('prompt', 'raw_prompt', 'prompt_text', 'provider_api_key', 'api_key')
`);
if (prohibitedRefusalColumns > 0) {
  console.error(`FAIL generation_refusals exposes ${prohibitedRefusalColumns} prohibited content/credential columns`);
  failures++;
} else {
  console.log("ok generation_refusals: no raw prompt or credential columns");
}

await client.query("BEGIN");
try {
  const refusal = await client.query(
    `INSERT INTO generation_refusals (
       prompt_hash, prompt_length_bucket, policy_version, detector_version,
       categories, rule_ids, surface, provider_requested, archetype
     ) VALUES ($1, $2, $3, $4, $5::text[], $6::text[], $7, $8, $9)
     RETURNING id`,
    [
      "a".repeat(64),
      "1-64",
      "db-assert-policy-1",
      "db-assert-detector-1",
      ["weapon"],
      ["weapon-system"],
      "generation",
      "template",
      "rover",
    ],
  );
  if (refusal.rowCount !== 1 || !refusal.rows[0]?.id) {
    console.error("FAIL generation_refusals: valid minimal audit row was not accepted");
    failures++;
  } else {
    console.log("ok generation_refusals: valid minimal audit row accepted transactionally");
  }
} finally {
  await client.query("ROLLBACK");
}

const commerceWorkerConstraint = await one(`
  SELECT count(*) AS n
    FROM pg_constraint
   WHERE conrelid = 'jobs'::regclass
     AND conname = 'jobs_kind_check'
     AND pg_get_constraintdef(oid) LIKE '%commerce.vendor-refresh%'
`);
if (commerceWorkerConstraint !== 1) {
  console.error("FAIL jobs_kind_check does not admit commerce.vendor-refresh");
  failures++;
} else {
  console.log("ok jobs_kind_check: commerce.vendor-refresh is admitted");
}

await client.query("BEGIN");
try {
  const commerceJob = await client.query(
    `INSERT INTO jobs (kind, status, provider, idempotency_key, input)
     VALUES ('commerce.vendor-refresh', 'queued', 'local', $1, $2::jsonb)
     RETURNING id`,
    ["db-assert-commerce-vendor-refresh", JSON.stringify({ componentIds: ["cmp_motor_fixture"] })],
  );
  if (commerceJob.rowCount !== 1 || !commerceJob.rows[0]?.id) {
    console.error("FAIL commerce.vendor-refresh job was not accepted");
    failures++;
  } else {
    console.log("ok commerce.vendor-refresh: valid local job accepted transactionally");
  }
} finally {
  await client.query("ROLLBACK");
}

const missing = await client.query(`
  SELECT c.id
  FROM components c
  LEFT JOIN prices p ON p.component_id = c.id AND p.purchasable
  WHERE c.license_id IS NULL OR p.component_id IS NULL
`);
if (missing.rowCount > 0) {
  console.error(`FAIL missing license or purchasable price: ${missing.rows.map((r) => r.id).join(", ")}`);
  failures++;
}

const seededGrid = await client.query(`
  SELECT table_id, row_schema_version, prop, confidence, source_url,
         min(voltage) AS min_voltage, max(voltage) AS max_voltage, count(*)::int AS point_count
    FROM thrust_tables
   WHERE component_id = 'cmp_motor_emax-eco2-2207-1900kv'
   GROUP BY table_id, row_schema_version, prop, confidence, source_url
`);
if (
  seededGrid.rowCount !== 1
  || seededGrid.rows[0].table_id !== "tt_emax_eco2_2207_1900kv_5x46_6s_sparse"
  || seededGrid.rows[0].row_schema_version !== "1.0.0"
  || seededGrid.rows[0].prop !== "5x4.6"
  || seededGrid.rows[0].source_url !== "https://www.aliexpress.com/s/wiki-ssr/article/emax-eco-ii-2207-1900kv_1005001609557497"
  || seededGrid.rows[0].min_voltage !== "25.2"
  || seededGrid.rows[0].max_voltage !== "25.2"
  || seededGrid.rows[0].point_count !== 2
) {
  console.error(`FAIL seeded thrust-table authority drifted: ${JSON.stringify(seededGrid.rows)}`);
  failures++;
} else {
  console.log("ok thrust_tables: source table identity and v1 single-voltage meaning preserved");
}

await client.query("BEGIN");
try {
  const componentId = "cmp_motor_emax-eco2-2207-1900kv";
  for (const tableId of ["qa-p3-grid-a", "qa-p3-grid-b"]) {
    await client.query(
      `INSERT INTO thrust_tables (
         component_id, table_id, row_schema_version, prop, confidence, source_url,
         voltage, throttle, thrust_g, current_a
       ) VALUES
         ($1, $2, '2.0.0', '5x4.3', 1, 'https://example.test/grid', 16.8, 0, 0, 0),
         ($1, $2, '2.0.0', '5x4.3', 1, 'https://example.test/grid', 16.8, 1, 1000, 20)`,
      [componentId, tableId],
    );
  }
  const distinct = await one(
    "SELECT count(DISTINCT table_id) AS n FROM thrust_tables WHERE component_id = 'cmp_motor_emax-eco2-2207-1900kv' AND table_id LIKE 'qa-p3-grid-%'",
  );
  if (distinct !== 2) {
    console.error(`FAIL thrust table identity collapsed distinct benches: ${distinct}`);
    failures++;
  } else {
    console.log("ok thrust_tables: distinct table identities may share one voltage/throttle coordinate");
  }
  await assert.rejects(
    client.query(
      `INSERT INTO thrust_tables (
         component_id, table_id, row_schema_version, voltage, throttle, thrust_g, current_a
       ) VALUES ($1, 'qa-p3-incomplete', '2.0.0', 16.8, 1, 1000, 20)`,
      [componentId],
    ),
    /check constraint/,
  );
} finally {
  await client.query("ROLLBACK");
}

await client.end();
if (failures > 0) process.exit(1);
