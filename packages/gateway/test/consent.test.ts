import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { CurrentUser } from "../src/auth.js";
import {
  CONSENT_LEDGER_FORMAT_VERSION,
  CONSENT_POLICIES,
  assertActiveConsent,
  consentErrorResponse,
  listCurrentConsents,
  recordConsent,
  sourceBlobIdsFromPayload,
  telemetryLogIdsFromPayload,
} from "../src/consent.js";
import type { GatewayDb } from "../src/db.js";
import { createJob } from "../src/platform.js";

const user: CurrentUser = {
  id: "consent-user",
  name: "Consent User",
  email: "consent@example.test",
  image: null,
};

type Row = Record<string, unknown>;

function consentDb() {
  const events: Row[] = [];
  const statements: string[] = [];
  const state = { transactions: 0 };
  let next = 1;
  const subjects = {
    "object-blob": new Set(["blob-1"]),
    "telemetry-log": new Set(["telemetry-1"]),
    model: new Set(["model-1"]),
  };
  const db: GatewayDb = {
    async query<T extends object = Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      statements.push(text);
      if (text.includes("SELECT id FROM users")) {
        return { rows: params[0] === user.id ? [{ id: user.id } as T] : [], rowCount: params[0] === user.id ? 1 : 0 } as never;
      }
      for (const [kind, ids] of Object.entries(subjects)) {
        const table = kind === "object-blob" ? "object_blobs" : kind === "telemetry-log" ? "telemetry_logs" : "model_registry";
        if (text.includes(`FROM ${table}`) && text.includes("owner_user_id")) {
          const owned = ids.has(String(params[0])) && params[1] === user.id;
          return { rows: owned ? [{ id: params[0] } as T] : [], rowCount: owned ? 1 : 0 } as never;
        }
      }
      if (text.includes("INSERT INTO user_consent_events")) {
        const row: Row = {
          id: `consent-${next++}`,
          ledger_version: params[0],
          owner_user_id: params[1],
          purpose: params[2],
          subject_kind: params[3],
          subject_id: params[4],
          policy_version: params[5],
          notice_hash: params[6],
          action: params[7],
          evidence: JSON.parse(String(params[8])),
          idempotency_key: params[9],
          previous_event_id: params[10],
          event_sequence: next - 1,
          created_at: `2026-07-13T00:00:0${next}.000Z`,
        };
        events.push(row);
        return { rows: [row as T], rowCount: 1 } as never;
      }
      if (text.includes("INSERT INTO credit_accounts")) {
        return { rows: [], rowCount: 1 } as never;
      }
      if (text.includes("INSERT INTO jobs")) {
        const row = {
          id: "job-consent-1",
          owner_user_id: params[0],
          kind: params[1],
          status: "queued",
          provider: params[2],
          input: JSON.parse(String(params[4])),
          output: null,
          error: null,
          cost_credits: params[5],
          created_at: "2026-07-13T00:00:00.000Z",
        };
        return { rows: [row as T], rowCount: 1 } as never;
      }
      if (text.includes("FROM user_consent_events")) {
        let rows = events.filter((row) => row.owner_user_id === params[0]);
        if (text.includes("idempotency_key = $2")) {
          rows = rows.filter((row) => row.idempotency_key === params[1]);
        } else if (text.includes("purpose = $2")) {
          rows = rows.filter(
            (row) => row.purpose === params[1] && row.subject_kind === params[2] && row.subject_id === params[3],
          );
        }
        if (text.includes("DISTINCT ON")) {
          const latest = new Map<string, Row>();
          for (const row of rows) latest.set(`${row.purpose}:${row.subject_kind}:${row.subject_id}`, row);
          rows = [...latest.values()];
        } else {
          rows = rows.slice(-1);
        }
        return { rows: rows as T[], rowCount: rows.length } as never;
      }
      if (
        text.includes("UPDATE jobs") || text.includes("UPDATE telemetry_logs") ||
        text.includes("DELETE FROM pattern_library") || text.includes("DELETE FROM leaderboard_runs")
      ) {
        return { rows: [], rowCount: 1 } as never;
      }
      throw new Error(`unhandled consent test query: ${text}`);
    },
  };
  db.transaction = async (_options, operation) => {
    state.transactions += 1;
    return operation(db);
  };
  return { db, events, statements, state };
}

function policy(purpose: string) {
  const result = CONSENT_POLICIES.find((candidate) => candidate.purpose === purpose);
  assert.ok(result);
  return result;
}

test("consent policies bind stable versioned notices to SHA-256 hashes", () => {
  assert.equal(CONSENT_LEDGER_FORMAT_VERSION, "1.0.0");
  assert.equal(CONSENT_POLICIES.length, 5);
  assert.equal(new Set(CONSENT_POLICIES.map((item) => item.purpose)).size, 5);
  for (const item of CONSENT_POLICIES) {
    assert.equal(item.noticeHash, createHash("sha256").update(item.notice).digest("hex"));
    assert.match(item.noticeHash, /^[0-9a-f]{64}$/);
    assert.equal(item.ledgerVersion, CONSENT_LEDGER_FORMAT_VERSION);
  }
});

test("grant is idempotent, current-only, and withdrawal remains in append-only history", async () => {
  const { db, events, statements } = consentDb();
  const current = policy("photoscan.processing");

  await assert.rejects(
    assertActiveConsent(db, user, "photoscan.processing", "object-blob", "blob-1"),
    (error: unknown) => {
      const response = consentErrorResponse(error);
      assert.equal(response?.statusCode, 409);
      assert.equal((response?.body as { code: string }).code, "CONSENT_REQUIRED");
      return true;
    },
  );

  const grant = await recordConsent(db, user, {
    purpose: "photoscan.processing",
    subjectKind: "object-blob",
    subjectId: "blob-1",
    policyVersion: current.policyVersion,
    noticeHash: current.noticeHash,
    action: "grant",
    locale: "en-US",
    idempotencyKey: "photo-grant-1",
  });
  assert.equal(grant.active, true);
  assert.equal(grant.eventSequence, "1");
  assert.equal(grant.previousEventId, null);
  const duplicate = await recordConsent(db, user, {
    purpose: "photoscan.processing",
    subjectKind: "object-blob",
    subjectId: "blob-1",
    policyVersion: current.policyVersion,
    noticeHash: current.noticeHash,
    action: "grant",
    idempotencyKey: "photo-grant-1",
  });
  assert.equal(duplicate.id, grant.id);
  assert.equal(events.length, 1);
  assert.equal((await assertActiveConsent(db, user, "photoscan.processing", "object-blob", "blob-1")).id, grant.id);

  const withdrawal = await recordConsent(db, user, {
    purpose: "photoscan.processing",
    subjectKind: "object-blob",
    subjectId: "blob-1",
    policyVersion: current.policyVersion,
    noticeHash: current.noticeHash,
    action: "withdraw",
    idempotencyKey: "photo-withdraw-1",
  });
  assert.equal(withdrawal.active, false);
  assert.equal(withdrawal.previousEventId, grant.id);
  assert.equal(events.length, 2);
  assert.ok(statements.some((sql) => sql.includes("photoscan consent withdrawn")));
  await assert.rejects(
    assertActiveConsent(db, user, "photoscan.processing", "object-blob", "blob-1"),
    /consent is required/,
  );
  const latest = await listCurrentConsents(db, user);
  assert.equal(latest.length, 1);
  assert.equal(latest[0].action, "withdraw");
});

test("every consent purpose validates subject ownership and executes bounded withdrawal effects", async () => {
  const { db, statements } = consentDb();
  const fixtures = [
    ["photoscan.processing", "object-blob", "blob-1", "photoscan consent withdrawn"],
    ["telemetry.sharing", "telemetry-log", "telemetry-1", "UPDATE telemetry_logs"],
    ["pattern.contribution", "model", "model-1", "DELETE FROM pattern_library"],
    ["leaderboard.publication", "account", user.id, "DELETE FROM leaderboard_runs"],
    ["training.reuse", "telemetry-log", "telemetry-1", "training reuse consent withdrawn"],
  ] as const;
  for (const [purpose, subjectKind, subjectId, effect] of fixtures) {
    const current = policy(purpose);
    await recordConsent(db, user, {
      purpose,
      subjectKind,
      subjectId,
      policyVersion: current.policyVersion,
      noticeHash: current.noticeHash,
      action: "grant",
    });
    await recordConsent(db, user, {
      purpose,
      subjectKind,
      subjectId,
      policyVersion: current.policyVersion,
      noticeHash: current.noticeHash,
      action: "withdraw",
    });
    assert.ok(statements.some((sql) => sql.includes(effect)), `missing ${purpose} withdrawal effect`);
  }
  const trainingWithdrawal = statements.find((sql) => sql.includes("training reuse consent withdrawn"));
  assert.match(trainingWithdrawal ?? "", /kind IN \('train\.policy', 'train\.offline-bc'\)/);
  assert.match(trainingWithdrawal ?? "", /input ->> 'telemetryLogId'/);

  const current = policy("photoscan.processing");
  await assert.rejects(
    recordConsent(db, user, {
      purpose: "photoscan.processing",
      subjectKind: "telemetry-log",
      subjectId: "telemetry-1",
      policyVersion: current.policyVersion,
      noticeHash: current.noticeHash,
      action: "grant",
    }),
    /requires subjectKind object-blob/,
  );
  await assert.rejects(
    recordConsent(db, user, {
      purpose: "photoscan.processing",
      subjectKind: "object-blob",
      subjectId: "missing",
      policyVersion: current.policyVersion,
      noticeHash: current.noticeHash,
      action: "grant",
    }),
    /object-blob not found/,
  );
  await assert.rejects(
    recordConsent(db, user, {
      purpose: "photoscan.processing",
      subjectKind: "object-blob",
      subjectId: "blob-1",
      policyVersion: "0.9.0",
      noticeHash: current.noticeHash,
      action: "grant",
    }),
    /stale/,
  );
});

test("sensitive input references are normalized without accepting arbitrary values", () => {
  assert.deepEqual(sourceBlobIdsFromPayload({ sourceBlobIds: ["a", "a", 3, "b"] }), ["a", "b"]);
  assert.deepEqual(sourceBlobIdsFromPayload({ images: ["raw-content"] }), []);
  assert.deepEqual(
    telemetryLogIdsFromPayload({ telemetryLogIds: ["t1", "t1", null, "t2"], telemetryLogId: "t3" }),
    ["t1", "t2", "t3"],
  );
});

test("direct job-library calls serialize photoscan authority with job creation", async () => {
  const { db, state } = consentDb();
  const current = policy("photoscan.processing");
  await assert.rejects(
    createJob(db, user, {
      kind: "photoscan.single",
      provider: "local",
      payload: { sourceBlobIds: ["blob-1"] },
    }),
    /consent is required/,
  );
  await recordConsent(db, user, {
    purpose: "photoscan.processing",
    subjectKind: "object-blob",
    subjectId: "blob-1",
    policyVersion: current.policyVersion,
    noticeHash: current.noticeHash,
    action: "grant",
  });
  const before = state.transactions;
  const job = await createJob(db, user, {
    kind: "photoscan.single",
    provider: "local",
    payload: { sourceBlobIds: ["blob-1"] },
  });
  assert.equal(job.status, "queued");
  assert.equal(state.transactions, before + 1);
});
