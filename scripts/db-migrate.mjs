#!/usr/bin/env node
import pg from "pg";
import { applyMigrations, loadMigrations } from "./postgres-migrations.mjs";

const { Client } = pg;
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://forge:forge-dev-only@localhost:5432/forge";

const client = new Client({ connectionString: DATABASE_URL });
try {
  await client.connect();
  await applyMigrations(client, loadMigrations());
} finally {
  await client.end();
}
