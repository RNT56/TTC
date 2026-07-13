#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { closeGatewayDb, gatewayDb } from "../packages/gateway/dist/db.js";
import { createJob } from "../packages/gateway/dist/platform.js";

const runId = randomUUID().replaceAll("-", "");
const ownerIds = [
  `commerce-db-owner-a-${runId}`,
  `commerce-db-owner-b-${runId}`,
];
const users = ownerIds.map((id) => ({ id, name: null, email: null, image: null }));
const clientKey = `commerce-db-idempotency-${runId}`;
const db = gatewayDb();
const previousCommand = process.env.FORGE_VENDOR_REFRESH_CMD;
process.env.FORGE_VENDOR_REFRESH_CMD = "protected-commerce-db-fixture";

try {
  for (const user of users) {
    await db.query(
      `INSERT INTO users (id, name, email, image)
       VALUES ($1, $2, $3, $4)`,
      [user.id, user.name, user.email, user.image],
    );
  }

  const request = {
    kind: "commerce.vendor-refresh",
    provider: "local",
    payload: { componentIds: ["cmp_commerce_db_fixture"], timeoutS: 30 },
    idempotencyKey: clientKey,
  };
  const [first, concurrentRetry] = await Promise.all([
    createJob(db, users[0], request),
    createJob(db, users[0], request),
  ]);
  assert.equal(concurrentRetry.id, first.id, "concurrent exact retry must return the original job");

  const sequentialRetry = await createJob(db, users[0], request);
  assert.equal(sequentialRetry.id, first.id, "sequential exact retry must return the original job");

  await assert.rejects(
    createJob(db, users[0], {
      ...request,
      payload: { componentIds: ["cmp_commerce_db_drift"] },
    }),
    (error) => error instanceof Error
      && error.message.includes("already bound to a different request")
      && error.statusCode === 409,
    "request drift must fail with 409",
  );

  const otherOwner = await createJob(db, users[1], request);
  assert.notEqual(otherOwner.id, first.id, "the same client key must remain isolated across owners");

  const persisted = await db.query(
    `SELECT id, owner_user_id, idempotency_key
       FROM jobs
      WHERE owner_user_id = ANY($1::text[])
      ORDER BY owner_user_id`,
    [ownerIds],
  );
  assert.equal(persisted.rowCount, 2, "exact retries must persist one job per owner");
  const keys = persisted.rows.map((row) => String(row.idempotency_key));
  assert.ok(keys.every((key) => /^[a-f0-9]{64}$/.test(key)), "persisted keys must be SHA-256 digests");
  assert.ok(keys.every((key) => key !== clientKey), "raw client keys must not be persisted");
  assert.notEqual(keys[0], keys[1], "owner-scoped digests must differ");

  console.log("commerce-jobs-postgres: concurrent retry, request binding, and owner scope proven");
} finally {
  try {
    await db.query("DELETE FROM jobs WHERE owner_user_id = ANY($1::text[])", [ownerIds]);
    await db.query("DELETE FROM credit_accounts WHERE user_id = ANY($1::text[])", [ownerIds]);
    await db.query("DELETE FROM users WHERE id = ANY($1::text[])", [ownerIds]);
  } finally {
    if (previousCommand === undefined) delete process.env.FORGE_VENDOR_REFRESH_CMD;
    else process.env.FORGE_VENDOR_REFRESH_CMD = previousCommand;
    await closeGatewayDb();
  }
}
