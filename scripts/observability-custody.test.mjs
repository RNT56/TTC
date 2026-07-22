import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createObservationDeliveryBatch } from "./observability-transport.mjs";
import { projectObservabilitySignals } from "./observability-signals.mjs";
import {
  MAX_OBSERVABILITY_CUSTODY_RECORDS,
  OBSERVABILITY_CUSTODY_ARTIFACT_SCHEMA,
  OBSERVABILITY_CUSTODY_RETENTION_SECONDS,
  auditCustodyRoot,
  deleteCustodyRecord,
  initializeCustodyRoot,
  queryCustodyRecord,
  readCustodyRecord,
  storeObservabilitySignalSet,
  sweepCustodyRoot,
  validateCustodyArtifact,
  validateObservabilityCustodyPolicy,
} from "./observability-custody.mjs";

const policy = JSON.parse(
  readFileSync("infra/observability/observability-custody-policy.v1.json", "utf8"),
);
const schema = JSON.parse(
  readFileSync("schema/forge-observability-custody-artifact.schema.json", "utf8"),
);

const CREATED_AT = new Date("2026-07-22T00:00:00.000Z");
const EXPIRES_AT = new Date(
  CREATED_AT.getTime() + OBSERVABILITY_CUSTODY_RETENTION_SECONDS * 1_000,
);
const SIGNAL_SET_ID = "20000000-0000-4000-8000-000000000002";
const CALLER_RECORD_ID = "10000000-0000-4000-8000-000000000001";
const BATCH_ID = "30000000-0000-4000-8000-000000000003";
const REQUEST_ID = "40000000-0000-4000-8000-000000000004";

function gatewayEvent({ statusCode = 503, durationMs = 1_500 } = {}) {
  return {
    schemaVersion: "forge-observability-event/3.0.0",
    occurredAt: "2026-07-21T23:59:59.000Z",
    clock: { source: "system", timezone: "UTC" },
    level: statusCode >= 500 ? "error" : "info",
    eventName: "gateway.request.completed",
    service: "gateway",
    serviceVersion: "0.2.0",
    environment: "ci",
    source: { component: "packages/gateway", revision: null },
    correlation: {
      requestId: REQUEST_ID,
      traceId: "11111111111111111111111111111111",
      spanId: "2222222222222222",
      parentSpanId: null,
      actorDigest: null,
      jobId: null,
      attemptId: null,
      providerCallId: null,
      deploymentId: null,
    },
    attributes: {
      method: "GET",
      route: "/healthz",
      statusCode,
      statusClass: `${Math.trunc(statusCode / 100)}xx`,
      outcome: statusCode >= 500 ? "server-error" : "success",
      durationMs,
    },
  };
}

function signalSet() {
  const batch = createObservationDeliveryBatch([gatewayEvent()], {
    batchId: BATCH_ID,
    createdAt: CREATED_AT,
  });
  return projectObservabilitySignals(batch, {
    signalSetId: SIGNAL_SET_ID,
    createdAt: CREATED_AT,
  });
}

function privateRoot() {
  const root = mkdtempSync(join(tmpdir(), "forge-observability-custody-"));
  chmodSync(root, 0o700);
  return root;
}

function withRoot(operation) {
  const root = privateRoot();
  try {
    return operation(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function store(root) {
  return storeObservabilitySignalSet(root, signalSet(), {
    createdAt: CREATED_AT,
    recordId: CALLER_RECORD_ID,
  });
}

test("D76 custody policy and stored/deleted schema variants are coherent", () => {
  assert.deepEqual(validateObservabilityCustodyPolicy(policy, schema), []);
  const drifted = structuredClone(policy);
  drifted.maturity.metricsBackend = true;
  assert.match(
    validateObservabilityCustodyPolicy(drifted, schema).join("\n"),
    /metricsBackend cannot be claimed/,
  );
  const schemaDrift = structuredClone(schema);
  schemaDrift.$defs.storedSource.properties.bytes.maximum += 1;
  assert.match(
    validateObservabilityCustodyPolicy(policy, schemaDrift).join("\n"),
    /object byte bound drifted/,
  );
});

test("one validated signal set persists privately and reads across independent calls", () => {
  withRoot((root) => {
    const record = store(root);
    const recordId = record.recordId;
    assert.notEqual(recordId, CALLER_RECORD_ID);
    assert.equal(record.schemaVersion, OBSERVABILITY_CUSTODY_ARTIFACT_SCHEMA);
    assert.equal(record.kind, "stored");
    assert.equal(record.lifecycle.expiresAt, EXPIRES_AT.toISOString());
    assert.deepEqual(validateCustodyArtifact(record), []);
    assert.equal(lstatSync(root).mode & 0o777, 0o700);
    assert.equal(lstatSync(join(root, "records", `${recordId}.json`)).mode & 0o777, 0o600);
    assert.equal(lstatSync(join(root, "objects", `${recordId}.json`)).mode & 0o777, 0o600);
    const loaded = readCustodyRecord(root, recordId);
    assert.deepEqual(loaded.signalSet, signalSet());
    assert.equal(auditCustodyRoot(root).ok, true);
  });
});

test("queries expose only exact summary, metric-series, or trace-span views", () => {
  withRoot((root) => {
    const record = store(root);
    assert.deepEqual(queryCustodyRecord(root, record.recordId, "metric-series"), signalSet().metricSeries);
    assert.deepEqual(queryCustodyRecord(root, record.recordId, "trace-spans"), signalSet().traceSpans);
    const summary = queryCustodyRecord(root, record.recordId, "summary");
    assert.equal(summary.recordId, record.recordId);
    assert.equal(summary.source.sha256, record.source.sha256);
    assert.equal(summary.authority.managedCustody, false);
    assert.throws(() => queryCustodyRecord(root, record.recordId, "search-by-job"), /query kind/);
  });
});

test("custody refuses checkout roots, permissive roots, and symlink roots", () => {
  assert.throws(() => initializeCustodyRoot(process.cwd()), /outside the repository/);
  withRoot((root) => {
    chmodSync(root, 0o755);
    assert.throws(() => initializeCustodyRoot(root), /ownership or mode/);
  });
  withRoot((root) => {
    const link = `${root}-link`;
    symlinkSync(root, link);
    try {
      assert.throws(() => initializeCustodyRoot(link), /exact absolute path|private regular directory/);
    } finally {
      unlinkSync(link);
    }
  });
});

test("invalid signal sets and the exact 128-live-record ceiling fail before widening custody", () => {
  withRoot((root) => {
    const invalid = signalSet();
    invalid.metricSeries[0].labels.jobId = "job-forbidden";
    assert.throws(() => storeObservabilitySignalSet(root, invalid), /unsafe observability custody refused/);
    for (let index = 0; index < MAX_OBSERVABILITY_CUSTODY_RECORDS; index += 1) {
      storeObservabilitySignalSet(root, signalSet(), {
        createdAt: CREATED_AT,
      });
    }
    assert.throws(
      () => storeObservabilitySignalSet(root, signalSet(), {
        createdAt: CREATED_AT,
      }),
      /live-record bound/,
    );
  });
});

test("tampering, missing objects, symlinks, or orphan objects fail audit and query", () => {
  withRoot((root) => {
    const recordId = store(root).recordId;
    const objectPath = join(root, "objects", `${recordId}.json`);
    writeFileSync(objectPath, `${readFileSync(objectPath, "utf8")} `);
    assert.throws(() => readCustodyRecord(root, recordId), /byte count drifted/);
    assert.deepEqual(auditCustodyRoot(root).issues, ["LIVE_RECORD_INVALID"]);
  });
  withRoot((root) => {
    const recordId = store(root).recordId;
    const objectPath = join(root, "objects", `${recordId}.json`);
    unlinkSync(objectPath);
    symlinkSync(join(root, "records", `${recordId}.json`), objectPath);
    assert.equal(auditCustodyRoot(root).issues.includes("OBJECT_DIRECTORY_INVALID"), true);
    assert.equal(auditCustodyRoot(root).issues.includes("LIVE_RECORD_INVALID"), true);
  });
  withRoot((root) => {
    initializeCustodyRoot(root);
    const orphanId = "70000000-0000-4000-8000-000000000001";
    const orphan = join(root, "objects", `${orphanId}.json`);
    writeFileSync(orphan, "{}", { mode: 0o600 });
    chmodSync(orphan, 0o600);
    assert.deepEqual(auditCustodyRoot(root).issues, ["OBJECT_ORPHANED"]);
  });
});

test("manual deletion removes the object, retains a bounded receipt, and stays query-closed", () => {
  withRoot((root) => {
    const record = store(root);
    const receipt = deleteCustodyRecord(root, record.recordId, {
      reason: "manual",
      deletedAt: new Date("2026-07-22T00:01:00.000Z"),
    });
    assert.equal(receipt.kind, "deleted");
    assert.equal(receipt.source.sha256, record.source.sha256);
    assert.deepEqual(validateCustodyArtifact(receipt), []);
    assert.equal(lstatSync(join(root, "deletions", `${record.recordId}.json`)).mode & 0o777, 0o600);
    assert.throws(() => readCustodyRecord(root, record.recordId), /does not exist/);
    assert.deepEqual(auditCustodyRoot(root), {
      ok: true,
      liveRecords: 0,
      deletionReceipts: 1,
      issues: [],
    });
  });
});

test("retention deletion refuses premature sweeps and deletes at the exact expiry", () => {
  withRoot((root) => {
    const recordId = store(root).recordId;
    assert.throws(
      () => deleteCustodyRecord(root, recordId, {
        reason: "retention",
        deletedAt: new Date(EXPIRES_AT.getTime() - 1),
      }),
      /premature/,
    );
    assert.deepEqual(
      sweepCustodyRoot(root, { at: new Date(EXPIRES_AT.getTime() - 1) }).deleted,
      [],
    );
    assert.deepEqual(sweepCustodyRoot(root, { at: EXPIRES_AT }).deleted, [recordId]);
    assert.equal(auditCustodyRoot(root).ok, true);
  });
});

test("CLI store/query/audit is restart-safe and failures do not reflect attacker input", () => {
  withRoot((root) => {
    const stored = spawnSync(
      process.execPath,
      ["scripts/observability-custody.mjs", "store", "--root", root],
      { input: JSON.stringify(signalSet()), encoding: "utf8" },
    );
    assert.equal(stored.status, 0, stored.stderr);
    const record = JSON.parse(stored.stdout);
    const queried = spawnSync(
      process.execPath,
      [
        "scripts/observability-custody.mjs", "query", "--root", root,
        "--record", record.recordId, "--kind", "summary",
      ],
      { encoding: "utf8" },
    );
    assert.equal(queried.status, 0, queried.stderr);
    assert.equal(JSON.parse(queried.stdout).recordId, record.recordId);
    const audited = spawnSync(
      process.execPath,
      ["scripts/observability-custody.mjs", "audit", "--root", root],
      { encoding: "utf8" },
    );
    assert.equal(audited.status, 0, audited.stderr);
    assert.equal(JSON.parse(audited.stdout).ok, true);
    const attacker = "secret-root-value";
    const refused = spawnSync(
      process.execPath,
      ["scripts/observability-custody.mjs", "query", "--root", attacker],
      { encoding: "utf8" },
    );
    assert.equal(refused.status, 1);
    assert.equal(refused.stderr.includes(attacker), false);
    assert.match(refused.stderr, /failed closed/);
  });
});
