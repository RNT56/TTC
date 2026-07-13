#!/usr/bin/env node
import assert from "node:assert/strict";
import test from "node:test";
import {
  migrationChecksum,
  validateMigrationHistory,
  validateMigrationSources,
} from "./postgres-migrations.mjs";

const migration = (filename, sql) => ({ filename, sql, checksum: migrationChecksum(sql) });
const migrations = [
  migration("0001_first.sql", "SELECT 1;"),
  migration("0002_second.sql", "SELECT 2;"),
  migration("0003_third.sql", "SELECT 3;"),
];

test("migration sources are strict, ordered, and checksum-bound", () => {
  assert.doesNotThrow(() => validateMigrationSources(migrations));
  assert.throws(
    () => validateMigrationSources([migrations[1], migrations[0]]),
    /strictly ordered/,
  );
  assert.throws(
    () => validateMigrationSources([{ ...migrations[0], checksum: "0".repeat(64) }]),
    /does not match SQL/,
  );
  assert.throws(
    () => validateMigrationSources([migration("migration-one.sql", "SELECT 1;")]),
    /NNNN_name\.sql/,
  );
});

test("recorded history must be an exact contiguous source prefix", () => {
  const prefix = migrations.slice(0, 2).map(({ filename, checksum }) => ({ filename, checksum }));
  assert.doesNotThrow(() => validateMigrationHistory(prefix, migrations));
  assert.throws(
    () => validateMigrationHistory([prefix[1]], migrations),
    /not a contiguous checked-in prefix/,
  );
  assert.throws(
    () => validateMigrationHistory([{ filename: "0009_removed.sql", checksum: "a" }], migrations),
    /no checked-in source/,
  );
  assert.throws(
    () => validateMigrationHistory([{ ...prefix[0], checksum: "f".repeat(64) }], migrations),
    /checksum changed/,
  );
  assert.throws(
    () => validateMigrationHistory([...prefix, migrations[2], migrations[2]], migrations),
    /no checked-in source/,
  );
});
