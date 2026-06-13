#!/usr/bin/env node
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
  ["review_queue", await one("SELECT count(*) AS n FROM review_queue WHERE status = 'needs_review'"), 1],
  ["reference_rigs", await one("SELECT count(*) AS n FROM reference_rigs"), 2],
  ["reference_rig_items", await one("SELECT count(*) AS n FROM reference_rig_items"), 7],
  ["provenance", await one("SELECT count(*) AS n FROM provenance"), 20],
];

let failures = 0;
for (const [name, got, min] of checks) {
  if (got < min) {
    console.error(`FAIL ${name}: ${got} < ${min}`);
    failures++;
  } else {
    console.log(`ok ${name}: ${got}`);
  }
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

await client.end();
if (failures > 0) process.exit(1);
