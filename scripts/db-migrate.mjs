#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const { Client } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://forge:forge-dev-only@localhost:5432/forge";

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

const migrations = readdirSync("infra/migrations")
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const filename of migrations) {
  const sql = readFileSync(join("infra/migrations", filename), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex");
  const existing = await client.query(
    "SELECT checksum FROM schema_migrations WHERE filename = $1",
    [filename],
  );
  if (existing.rowCount > 0) {
    if (existing.rows[0].checksum !== checksum) {
      throw new Error(`${filename}: checksum changed after migration was applied`);
    }
    console.log(`skip ${filename}`);
    continue;
  }
  await client.query(sql);
  await client.query(
    "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
    [filename, checksum],
  );
  console.log(`applied ${filename}`);
}

await client.end();
