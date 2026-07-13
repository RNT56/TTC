import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKUP_MAX_DAYS,
  BACKUP_DELETE_LEASE_MINUTES,
  DATA_LIFECYCLE_FORMAT_VERSION,
  LEGAL_HOLD_MAX_DAYS,
  RETENTION_POLICIES,
  TOMBSTONE_DAYS,
  digestLifecycleSubject,
  lifecycleErrorResponse,
  registerBackup,
} from "../src/dataLifecycle.js";
import type { GatewayDb } from "../src/db.js";

test("lifecycle policy is bounded, versioned, and domain-separated", () => {
  assert.equal(DATA_LIFECYCLE_FORMAT_VERSION, "1.0.0");
  assert.equal(BACKUP_MAX_DAYS, 30);
  assert.equal(BACKUP_DELETE_LEASE_MINUTES, 15);
  assert.equal(TOMBSTONE_DAYS, 45);
  assert.equal(LEGAL_HOLD_MAX_DAYS, 365);
  assert.equal(RETENTION_POLICIES.length, 6);
  assert.ok(RETENTION_POLICIES.every((policy) => policy.tombstoneDays > policy.backupMaxDays));
  assert.notEqual(digestLifecycleSubject("user", "same"), digestLifecycleSubject("object", "same"));
  assert.match(digestLifecycleSubject("user", "user-1"), /^[0-9a-f]{64}$/);
});

test("backup registration refuses retention beyond the policy before touching storage", async () => {
  const db: GatewayDb = {
    async query() {
      throw new Error("database must not be reached");
    },
  };
  await assert.rejects(
    registerBackup(db, {
      provider: "fixture",
      externalReference: "backup/too-long",
      manifestSha256: "a".repeat(64),
      capturedAt: "2026-07-13T00:00:00.000Z",
      deleteAfter: "2026-08-13T00:00:00.000Z",
      subjects: [{ kind: "user", id: "user-1" }],
    }),
    /exceeds 30 days/,
  );
});

test("lifecycle errors expose bounded public state only", () => {
  const response = lifecycleErrorResponse(Object.assign(new Error("deferred"), {
    code: "LEGAL_HOLD_ACTIVE",
    statusCode: 423,
    details: { policyVersion: "1.0.0", activeHoldCount: 1, reviewRequired: true },
    authorityReference: "must-not-leak",
  }));
  assert.equal(response?.statusCode, 423);
  assert.deepEqual(response?.body, {
    error: "deferred",
    code: "LEGAL_HOLD_ACTIVE",
    policyVersion: "1.0.0",
    activeHoldCount: 1,
    reviewRequired: true,
  });
});
