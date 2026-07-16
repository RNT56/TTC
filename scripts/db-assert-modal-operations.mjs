#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

import { closeGatewayDb, gatewayDb } from "../packages/gateway/dist/db.js";
import { cancelOwnedJob, createJob } from "../packages/gateway/dist/platform.js";

const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const runId = randomUUID().replaceAll("-", "");
const ownerIds = [`p7013-gateway-a-${runId}`, `p7013-gateway-b-${runId}`];
const users = ownerIds.map((id) => ({ id, name: null, email: null, image: null }));
const modelIds = ownerIds.map((_, index) => `p7013-model-${index}-${runId}`);
const contract = { meta: { name: "P7-013 Modal database fixture" } };
const contractJson = JSON.stringify(contract);
const contractHash = createHash("sha256").update(contractJson).digest("hex");
const environmentNames = [
  "MODAL_TOKEN_ID",
  "MODAL_TOKEN_SECRET",
  "FORGE_MODAL_ENVIRONMENT",
  "FORGE_MODAL_FUNCTION_VERSION",
  "FORGE_MODAL_SOURCE_REVISION",
  "FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH",
  "FORGE_MODAL_MAX_ACTIVE_JOBS",
  "FORGE_MODAL_DAILY_CREDIT_LIMIT",
];
const previousEnvironment = Object.fromEntries(
  environmentNames.map((name) => [name, process.env[name]]),
);
Object.assign(process.env, {
  MODAL_TOKEN_ID: "database-fixture-token-id",
  MODAL_TOKEN_SECRET: "database-fixture-token-secret",
  FORGE_MODAL_ENVIRONMENT: "p7-013-fixture",
  FORGE_MODAL_FUNCTION_VERSION: "17",
  FORGE_MODAL_SOURCE_REVISION: "ab".repeat(20),
  FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH: "cd".repeat(32),
  FORGE_MODAL_MAX_ACTIVE_JOBS: "1",
  FORGE_MODAL_DAILY_CREDIT_LIMIT: "2",
});

const db = gatewayDb();
const evidence = {
  schemaVersion: "p7-modal-gateway-db/1.0.0",
  task: "P7-013",
  maturity: "fixture",
  sourceRevision: process.env.FORGE_SOURCE_REVISION || revision,
  checkoutRevision: revision,
  status: "running",
  scenarios: {},
  nonClaim: "Gateway/Postgres authority only; no Modal deployment, GPU, billing, alert, deletion, or sandbox run is asserted.",
};

try {
  for (let index = 0; index < users.length; index += 1) {
    const user = users[index];
    await db.query(
      "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
      [user.id, "P7-013 gateway fixture", `${user.id}@example.test`],
    );
    await db.query(
      `INSERT INTO model_registry (
         id, owner_user_id, status, visibility, name, contract_hash, contract,
         validator_report, lineage
       ) VALUES ($1, $2, 'admitted', 'private', $3, $4, $5::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [modelIds[index], user.id, "P7-013 Modal fixture", contractHash, contractJson],
    );
  }

  const request = {
    kind: "train.policy",
    provider: "modal",
    payload: { modelId: modelIds[0], task: "hover-hold", seed: 1201 },
    idempotencyKey: `p7013-modal-${runId}`,
  };
  const first = await createJob(db, users[0], request);
  const retry = await createJob(db, users[0], request);
  assert.equal(retry.id, first.id, "exact retry must return the original Modal job");

  const debit = await db.query(
    `SELECT a.balance_credits, count(l.*) AS debit_count
       FROM credit_accounts a
       LEFT JOIN credit_ledger l
         ON l.user_id = a.user_id AND l.idempotency_key = $2
      WHERE a.user_id = $1
      GROUP BY a.balance_credits`,
    [users[0].id, `${first.id}:debit`],
  );
  assert.equal(Number(debit.rows[0].balance_credits), -1);
  assert.equal(Number(debit.rows[0].debit_count), 1);

  await assert.rejects(
    createJob(db, users[1], {
      ...request,
      payload: { ...request.payload, modelId: modelIds[1] },
      idempotencyKey: `p7013-modal-other-${runId}`,
    }),
    (error) => error instanceof Error
      && error.message.includes("active-job quota")
      && error.statusCode === 429,
    "shared active quota must reject a concurrent owner",
  );

  const cancelled = await cancelOwnedJob(db, users[0], first.id);
  assert.equal(cancelled.status, "cancelled");
  assert.ok(cancelled.cancelRequestedAt);
  assert.ok(cancelled.creditRefundedAt);
  const repeated = await cancelOwnedJob(db, users[0], first.id);
  assert.equal(repeated.id, first.id);
  await assert.rejects(
    cancelOwnedJob(db, users[1], first.id),
    (error) => error instanceof Error && error.statusCode === 404,
    "cross-owner cancellation must stay hidden",
  );

  const refund = await db.query(
    `SELECT a.balance_credits,
            count(l.*) FILTER (WHERE l.idempotency_key = $2) AS refund_count
       FROM credit_accounts a
       LEFT JOIN credit_ledger l ON l.user_id = a.user_id
      WHERE a.user_id = $1
      GROUP BY a.balance_credits`,
    [users[0].id, `${first.id}:refund`],
  );
  assert.equal(Number(refund.rows[0].balance_credits), 0);
  assert.equal(Number(refund.rows[0].refund_count), 1);

  const afterRefund = await createJob(db, users[1], {
    ...request,
    payload: { ...request.payload, modelId: modelIds[1] },
    idempotencyKey: `p7013-modal-after-refund-${runId}`,
  });
  assert.equal(afterRefund.status, "queued", "cancellation must release the shared active slot");
  await cancelOwnedJob(db, users[1], afterRefund.id);
  await assert.rejects(
    createJob(db, users[0], {
      ...request,
      idempotencyKey: `p7013-modal-daily-limit-${runId}`,
    }),
    (error) => error instanceof Error
      && error.message.includes("daily credit quota")
      && error.statusCode === 429,
    "product refunds must not reopen the conservative daily provider-launch ceiling",
  );

  evidence.scenarios = {
    idempotentDebit: { jobId: first.id, debitCount: 1, balanceAfterDebit: -1 },
    sharedActiveQuota: "cross-owner concurrent job refused with 429",
    ownerCancellation: {
      status: cancelled.status,
      cancelRequested: true,
      creditRefunded: true,
      repeatedIdempotent: true,
      crossOwnerHidden: true,
    },
    exactRefund: {
      refundCount: 1,
      balanceAfterRefund: 0,
      activeQuotaReleased: true,
      dailyLaunchCreditsRetained: true,
    },
  };
  evidence.status = "passed";
  await mkdir("artifacts/e2e", { recursive: true });
  await writeFile(
    "artifacts/e2e/p7-modal-gateway-db.json",
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
  console.log("modal-gateway-postgres: quota, idempotent debit, cancellation, and exact refund proven");
} finally {
  try {
    await db.query("DELETE FROM users WHERE id = ANY($1::text[])", [ownerIds]);
  } finally {
    for (const name of environmentNames) {
      const previous = previousEnvironment[name];
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
    await closeGatewayDb();
  }
}
