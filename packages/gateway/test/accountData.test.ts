import assert from "node:assert/strict";
import test from "node:test";
import { deleteUserData, exportUserData } from "../src/accountData.js";
import type { CurrentUser } from "../src/auth.js";
import type { GatewayDb } from "../src/db.js";
import { buildServer } from "../src/server.js";

const user: CurrentUser = {
  id: "usr-export-test",
  name: "Export Test",
  email: "export@example.test",
  image: null,
};

function transactionDb(
  query: GatewayDb["query"],
  outerQuery: GatewayDb["query"] = query,
): GatewayDb {
  const transaction: GatewayDb = { query };
  return {
    query: outerQuery,
    async transaction(_options, operation) {
      return operation(transaction);
    },
  };
}

test("user-data export is owner-scoped, complete, and excludes authentication secrets", async () => {
  const statements: string[] = [];
  const db = transactionDb(async (text, params) => {
    statements.push(text);
    assert.deepEqual(params, [user.id]);
    if (text.includes("FROM users WHERE id")) return { rows: [user], rowCount: 1 } as never;
    if (text.includes("FROM accounts")) {
      return {
        rows: [
          {
            id: "acct-1",
            provider: "github",
            type: "oauth",
            providerAccountId: "external-1",
            scope: "read:user",
          },
        ],
        rowCount: 1,
      } as never;
    }
    if (text.includes("SELECT id, visibility") && text.includes("FROM object_blobs")) {
      return {
        rows: [
          {
            id: "obj-1",
            bucket: "forge-artifacts",
            objectKey: "users/usr-export-test/photo.jpg",
            contentType: "image/jpeg",
          },
        ],
        rowCount: 1,
      } as never;
    }
    if (text.includes("FROM telemetry_logs")) {
      return { rows: [{ id: "tel-1", tape: { samples: 2 } }], rowCount: 1 } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });

  const exported = await exportUserData(db, user);
  assert.equal(exported.formatVersion, "1.3.0");
  assert.equal(exported.subject.userId, user.id);
  assert.equal(exported.data.account.length, 1);
  assert.equal(exported.data.authenticationProviders.length, 1);
  assert.equal(exported.data.telemetryLogs.length, 1);
  assert.deepEqual(exported.objectDownloads, [
    { blobId: "obj-1", accessEndpoint: "/v1/blobs/obj-1/access" },
  ]);
  assert.ok(statements.length >= 20, "all declared account-data surfaces were queried");
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /access_token|refresh_token|id_token|sessionToken|verification_token/);
  assert.doesNotMatch(statements.find((sql) => sql.includes("FROM accounts")) ?? "", /access_token|refresh_token|id_token/);
  assert.doesNotMatch(statements.find((sql) => sql.includes("FROM sessions")) ?? "", /sessionToken/);
});

test("account deletion purges every owner-scoped surface and hands all objects to storage deletion", async () => {
  const statements: string[] = [];
  const objects: { bucket: string; objectKey: string }[] = [];
  const db = transactionDb(async (text, params) => {
    statements.push(text);
    if (text.includes("SELECT id, email FROM users")) {
      assert.deepEqual(params, [user.id]);
      return { rows: [{ id: user.id, email: user.email }], rowCount: 1 } as never;
    }
    if (text.includes("SELECT bucket, object_key")) {
      return {
        rows: [
          { bucket: "forge-artifacts", objectKey: "users/usr-export-test/photo.jpg" },
          { bucket: "forge-artifacts", objectKey: "users/usr-export-test/policy.onnx" },
        ],
        rowCount: 2,
      } as never;
    }
    return { rows: [], rowCount: text.startsWith("DELETE") ? 1 : 0 } as never;
  });

  const receipt = await deleteUserData(db, user, async (requested) => {
    objects.push(...requested);
  });
  assert.equal(receipt.primaryDataDeleted, true);
  assert.equal(receipt.objectPayloadsDeleted, true);
  assert.equal(receipt.formatVersion, "2.0.0");
  assert.equal(receipt.backupLifecycle.state, "restore-suppressed-pending-expiry");
  assert.equal(receipt.backupLifecycle.lifecycleVersion, "1.0.0");
  assert.equal(receipt.backupLifecycle.objectTombstoneCount, 2);
  assert.match(receipt.backupLifecycle.tombstoneId, /^tmb-/);
  assert.match(receipt.deletionId, /^del-/);
  assert.equal(receipt.counts.users, 1);
  assert.equal(receipt.counts.models, 1);
  assert.equal(receipt.counts.photoscanArtifacts, 1);
  assert.equal(receipt.counts.telemetryLogs, 1);
  assert.equal(receipt.counts.policyArtifacts, 1);
  assert.equal(receipt.counts.courses, 1);
  assert.equal(receipt.counts.objectBlobs, 1);
  assert.deepEqual(objects, [
    { bucket: "forge-artifacts", objectKey: "users/usr-export-test/photo.jpg" },
    { bucket: "forge-artifacts", objectKey: "users/usr-export-test/policy.onnx" },
  ]);
  assert.ok(statements.at(-1)?.includes("DELETE FROM users"));
});

test("storage failure aborts before the account row is deleted", async () => {
  const statements: string[] = [];
  const db = transactionDb(async (text) => {
    statements.push(text);
    if (text.includes("SELECT id, email FROM users")) {
      return { rows: [{ id: user.id, email: user.email }], rowCount: 1 } as never;
    }
    if (text.includes("SELECT bucket, object_key")) {
      return {
        rows: [{ bucket: "forge-artifacts", objectKey: "users/usr-export-test/photo.jpg" }],
        rowCount: 1,
      } as never;
    }
    return { rows: [], rowCount: 1 } as never;
  });

  await assert.rejects(
    deleteUserData(db, user, async () => {
      throw Object.assign(new Error("object store unavailable"), { statusCode: 503 });
    }),
    /object store unavailable/,
  );
  assert.equal(statements.some((sql) => sql.includes("DELETE FROM users WHERE")), false);
});

test("an active legal hold blocks deletion without exposing authority details", async () => {
  const statements: string[] = [];
  const db = transactionDb(async (text) => {
    statements.push(text);
    if (text.includes("SELECT id, email FROM users")) {
      return { rows: [{ id: user.id, email: user.email }], rowCount: 1 } as never;
    }
    if (text.includes("SELECT bucket, object_key")) return { rows: [], rowCount: 0 } as never;
    if (text.includes("FROM (\n       SELECT DISTINCT ON (hold_key)")) {
      return {
        rows: [{
          id: "hold-1",
          hold_key: "case-1",
          action: "place",
          subject_kind: "user",
          subject_digest: "a".repeat(64),
          reason_code: "litigation",
          authority_reference: "authority/internal-1",
          jurisdiction: "EU",
          evidence_reference: "evidence/internal-1",
          expires_at: "2027-01-01T00:00:00.000Z",
          idempotency_key: "hold-place-1",
          previous_event_id: null,
          event_sequence: 1,
          created_at: "2026-07-13T00:00:00.000Z",
        }],
        rowCount: 1,
      } as never;
    }
    return { rows: [], rowCount: text.startsWith("INSERT") ? 1 : 0 } as never;
  });

  await assert.rejects(
    deleteUserData(db, user, async () => undefined),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "LEGAL_HOLD_ACTIVE");
      assert.doesNotMatch(JSON.stringify(error), /authority\/internal|evidence\/internal/);
      return true;
    },
  );
  assert.equal(statements.some((sql) => sql.includes("DELETE FROM users WHERE")), false);
  assert.ok(statements.some((sql) => sql.includes("'legal-hold-blocked'")));
});

test("account routes require authentication and explicit destructive confirmation", async () => {
  const deletedObjects: { bucket: string; objectKey: string }[] = [];
  const db = transactionDb(
    async (text) => {
      if (text.includes("FROM users WHERE id")) return { rows: [user], rowCount: 1 } as never;
      if (text.includes("SELECT id, email FROM users")) {
        return { rows: [{ id: user.id, email: user.email }], rowCount: 1 } as never;
      }
      if (text.includes("SELECT bucket, object_key")) {
        return {
          rows: [{ bucket: "forge-artifacts", objectKey: "users/usr-export-test/photo.jpg" }],
          rowCount: 1,
        } as never;
      }
      return { rows: [], rowCount: text.startsWith("DELETE") ? 1 : 0 } as never;
    },
    async (text) => {
      if (text.includes("FROM sessions s")) return { rows: [user], rowCount: 1 } as never;
      return { rows: [], rowCount: 0 } as never;
    },
  );
  const app = buildServer({
    db,
    deleteObjects: async (objects) => {
      deletedObjects.push(...objects);
    },
  });
  try {
    const publicPolicy = await app.inject({ method: "GET", url: "/v1/data-lifecycle/policy" });
    assert.equal(publicPolicy.statusCode, 200, publicPolicy.body);
    assert.equal((publicPolicy.json() as { policies: unknown[] }).policies.length, 6);

    const anonymous = await app.inject({ method: "GET", url: "/v1/account/export" });
    assert.equal(anonymous.statusCode, 401);

    const malformed = await app.inject({
      method: "DELETE",
      url: "/v1/account",
      headers: { cookie: "authjs.session-token=test-session" },
      payload: { confirmation: "delete" },
    });
    assert.equal(malformed.statusCode, 400);

    const exported = await app.inject({
      method: "GET",
      url: "/v1/account/export",
      headers: { cookie: "authjs.session-token=test-session" },
    });
    assert.equal(exported.statusCode, 200, exported.body);
    assert.match(exported.headers["content-disposition"] ?? "", /forgedttc-user-data-/);
    assert.equal((exported.json() as { formatVersion: string }).formatVersion, "1.3.0");

    const lifecycle = await app.inject({
      method: "GET",
      url: "/v1/account/lifecycle",
      headers: { cookie: "authjs.session-token=test-session" },
    });
    assert.equal(lifecycle.statusCode, 200, lifecycle.body);
    assert.deepEqual(lifecycle.json(), {
      lifecycleVersion: "1.0.0",
      policyVersion: "1.0.0",
      activeLegalHoldCount: 0,
      cataloguedBackupCount: 0,
      latestBackupDeleteAfter: null,
    });

    const deleted = await app.inject({
      method: "DELETE",
      url: "/v1/account",
      headers: { cookie: "authjs.session-token=test-session" },
      payload: { confirmation: "DELETE MY ACCOUNT" },
    });
    assert.equal(deleted.statusCode, 200, deleted.body);
    assert.equal(
      (deleted.json() as { receipt: { primaryDataDeleted: boolean; formatVersion: string } }).receipt.primaryDataDeleted,
      true,
    );
    assert.equal(
      (deleted.json() as { receipt: { formatVersion: string } }).receipt.formatVersion,
      "2.0.0",
    );
    assert.deepEqual(deletedObjects, [
      { bucket: "forge-artifacts", objectKey: "users/usr-export-test/photo.jpg" },
    ]);
  } finally {
    await app.close();
  }
});
