import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const MIGRATION_LOCK_KEY = "forgedttc:postgres-schema-migrations:v1";

export function migrationChecksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

export function loadMigrations(directory = "infra/migrations") {
  const migrations = readdirSync(directory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
    .map((filename) => {
      const sql = readFileSync(join(directory, filename), "utf8");
      return { filename, sql, checksum: migrationChecksum(sql) };
    });
  validateMigrationSources(migrations);
  return migrations;
}

export function validateMigrationSources(migrations) {
  let previous = null;
  for (const migration of migrations) {
    if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(migration.filename)) {
      throw new Error(`${migration.filename}: migration filename must match NNNN_name.sql`);
    }
    if (previous !== null && migration.filename <= previous) {
      throw new Error(`${migration.filename}: migrations must be unique and strictly ordered`);
    }
    if (migrationChecksum(migration.sql) !== migration.checksum) {
      throw new Error(`${migration.filename}: supplied checksum does not match SQL`);
    }
    previous = migration.filename;
  }
}

export function validateMigrationHistory(appliedRows, migrations) {
  if (appliedRows.length > migrations.length) {
    const removed = appliedRows[migrations.length]?.filename ?? "unknown";
    throw new Error(`${removed}: recorded migration has no checked-in source`);
  }

  for (let index = 0; index < appliedRows.length; index += 1) {
    const applied = appliedRows[index];
    const source = migrations[index];
    if (applied.filename !== source.filename) {
      const sourceNames = new Set(migrations.map((migration) => migration.filename));
      if (!sourceNames.has(applied.filename)) {
        throw new Error(`${applied.filename}: recorded migration has no checked-in source`);
      }
      throw new Error(
        `${applied.filename}: migration history is not a contiguous checked-in prefix; expected ${source.filename}`,
      );
    }
    if (applied.checksum !== source.checksum) {
      throw new Error(`${applied.filename}: checksum changed after migration was applied`);
    }
  }
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function migrationHistory(client) {
  const result = await client.query(
    "SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename",
  );
  return result.rows;
}

export async function applyMigrations(
  client,
  migrations,
  { lockKey = MIGRATION_LOCK_KEY, log = (message) => console.log(message) } = {},
) {
  validateMigrationSources(migrations);
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [lockKey]);
    locked = true;
    await ensureMigrationTable(client);

    const appliedBefore = await migrationHistory(client);
    validateMigrationHistory(appliedBefore, migrations);
    const applied = [];
    const skipped = appliedBefore.map((row) => row.filename);

    for (const migration of migrations.slice(appliedBefore.length)) {
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
          [migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(
          `${migration.filename}: migration failed and was rolled back: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }
      applied.push(migration.filename);
      log(`applied ${migration.filename}`);
    }

    for (const filename of skipped) log(`skip ${filename}`);
    return { applied, skipped, history: await migrationHistory(client) };
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [lockKey]);
    }
  }
}
