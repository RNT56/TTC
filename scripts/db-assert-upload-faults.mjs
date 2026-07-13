#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { CONSENT_POLICIES, recordConsent } from "../packages/gateway/dist/consent.js";
import { closeGatewayDb, gatewayDb } from "../packages/gateway/dist/db.js";
import {
  completeObjectBlobUpload,
  createJob,
  registerObjectBlob,
} from "../packages/gateway/dist/platform.js";

const runId = randomUUID().replaceAll("-", "");
const user = { id: `qa005-upload-owner-${runId}`, name: null, email: null, image: null };
const sha256 = "ef".repeat(32);
const db = gatewayDb();

try {
  await db.query(
    "INSERT INTO users (id, name, email, image) VALUES ($1, $2, $3, $4)",
    [user.id, user.name, user.email, user.image],
  );
  const blob = await registerObjectBlob(db, user, {
    bucket: process.env.FORGE_OBJECT_BUCKET ?? "forge-artifacts",
    purpose: "photoscan-source",
    contentType: "image/jpeg",
    byteSize: 4096,
    sha256,
    metadata: { source: "qa005-deterministic-fixture" },
  });
  assert.equal(blob.uploadStatus, "staged");

  const policy = CONSENT_POLICIES.find((candidate) => candidate.purpose === "photoscan.processing");
  assert.ok(policy);
  const consentInput = {
    purpose: "photoscan.processing",
    subjectKind: "object-blob",
    subjectId: blob.id,
    policyVersion: policy.policyVersion,
    noticeHash: policy.noticeHash,
    action: "grant",
    idempotencyKey: `qa005-upload-consent-${runId}`,
  };
  await assert.rejects(
    recordConsent(db, user, consentInput),
    (error) => error instanceof Error
      && error.message.includes("not verified complete")
      && error.statusCode === 409,
    "staged uploads must not receive photoscan processing authority",
  );

  await assert.rejects(
    completeObjectBlobUpload(db, user, blob.id, {
      byteSize: 2048,
      contentType: "image/jpeg",
      sha256,
    }),
    (error) => error instanceof Error
      && error.statusCode === 409
      && error.code === "partial-object-upload",
    "partial stored bytes must not complete the upload",
  );
  const partial = await db.query(
    "SELECT upload_status, verification_error_code FROM object_blobs WHERE id = $1",
    [blob.id],
  );
  assert.equal(partial.rows[0].upload_status, "staged");
  assert.equal(partial.rows[0].verification_error_code, "partial-object-upload");

  const complete = await completeObjectBlobUpload(db, user, blob.id, {
    byteSize: 4096,
    contentType: "image/jpeg",
    sha256,
  });
  assert.equal(complete.uploadStatus, "complete");
  assert.ok(complete.verifiedAt);
  assert.equal(complete.verificationErrorCode, null);

  await recordConsent(db, user, consentInput);
  const job = await createJob(db, user, {
    kind: "photoscan.single",
    provider: "fixture",
    payload: { sourceBlobIds: [blob.id], images: [blob.id] },
    idempotencyKey: `qa005-upload-job-${runId}`,
  });
  assert.equal(job.status, "succeeded");

  const checkoutRevision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const evidence = {
    schemaVersion: "1.0.0",
    task: "QA-005",
    status: "passed",
    maturity: "deterministic isolated-Postgres",
    sourceRevision: process.env.FORGE_SOURCE_REVISION || checkoutRevision,
    checkoutRevision,
    scenarios: {
      stagedConsentRefused: true,
      partialLengthRejected: true,
      verificationErrorPersisted: "partial-object-upload",
      exactMetadataCompleted: true,
      verifiedConsentAndFixtureJobSucceeded: true,
    },
    limitations: [
      "Stored-object metadata is injected into the gateway service boundary; no deployed S3-compatible provider is claimed.",
      "Malware scanning, semantic media validation, production IAM, and provider incident recovery remain separate gates.",
    ],
  };
  mkdirSync("artifacts/e2e", { recursive: true });
  writeFileSync(
    "artifacts/e2e/qa005-upload-acceptance.json",
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );

  console.log("qa005-upload-postgres: partial bytes refused, exact verification admitted once");
} finally {
  try {
    await db.query("DELETE FROM photoscan_artifacts WHERE owner_user_id = $1", [user.id]);
    await db.query("DELETE FROM jobs WHERE owner_user_id = $1", [user.id]);
    await db.query("DELETE FROM user_consent_events WHERE owner_user_id = $1", [user.id]);
    await db.query("DELETE FROM object_blobs WHERE owner_user_id = $1", [user.id]);
    await db.query("DELETE FROM credit_accounts WHERE user_id = $1", [user.id]);
    await db.query("DELETE FROM users WHERE id = $1", [user.id]);
  } finally {
    await closeGatewayDb();
  }
}
