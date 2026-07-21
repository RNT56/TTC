import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_OBSERVABILITY_BATCH_BYTES,
  createObservationDeliveryBatch,
} from "./observability-transport.mjs";
import {
  BASELINE_SAMPLE_DENOMINATOR,
  OBSERVABILITY_SIGNAL_SET_SCHEMA,
  projectObservabilitySignals,
  serializeObservabilitySignalSet,
  validateObservabilitySignalsPolicy,
  validateObservabilitySignalSet,
} from "./observability-signals.mjs";

const policy = JSON.parse(
  readFileSync("infra/observability/observability-signals-policy.v1.json", "utf8"),
);
const schema = JSON.parse(
  readFileSync("schema/forge-observability-signal-set.schema.json", "utf8"),
);
const documentation = JSON.parse(readFileSync("contracts/documentation.json", "utf8"));

const FIXED_BATCH_ID = "10000000-0000-4000-8000-000000000001";
const FIXED_SIGNAL_SET_ID = "20000000-0000-4000-8000-000000000002";
const FIXED_ATTEMPT_ID = "30000000-0000-4000-8000-000000000003";
const FIXED_REQUEST_ID = "40000000-0000-4000-8000-000000000004";
const FIXED_DATE = new Date("2026-07-21T12:00:00.000Z");

function correlationForBaseline(sampled) {
  for (let index = 1; index < 10_000; index += 1) {
    const traceId = index.toString(16).padStart(32, "0");
    const spanId = (index + 10_000).toString(16).padStart(16, "0");
    const digest = createHash("sha256").update(`${traceId}:${spanId}`, "utf8").digest();
    if ((digest.readUInt16BE(0) % BASELINE_SAMPLE_DENOMINATOR === 0) === sampled) {
      return { traceId, spanId };
    }
  }
  throw new Error("baseline fixture not found");
}

function gatewayEvent({
  durationMs = 4,
  statusCode = 200,
  route = "/healthz",
  method = "GET",
  baseline = false,
} = {}) {
  const correlation = correlationForBaseline(baseline);
  const outcome = statusCode >= 500 ? "server-error" : statusCode >= 400 ? "client-error" : "success";
  return {
    schemaVersion: "forge-observability-event/3.0.0",
    occurredAt: "2026-07-21T11:59:59.000Z",
    clock: { source: "system", timezone: "UTC" },
    level: outcome === "server-error" ? "error" : outcome === "client-error" ? "warn" : "info",
    eventName: "gateway.request.completed",
    service: "gateway",
    serviceVersion: "0.2.0",
    environment: "ci",
    source: { component: "packages/gateway", revision: null },
    correlation: {
      requestId: FIXED_REQUEST_ID,
      traceId: correlation.traceId,
      spanId: correlation.spanId,
      parentSpanId: null,
      actorDigest: null,
      jobId: null,
      attemptId: null,
      providerCallId: null,
      deploymentId: null,
    },
    attributes: {
      method,
      route,
      statusCode,
      statusClass: `${Math.trunc(statusCode / 100)}xx`,
      outcome,
      durationMs,
    },
  };
}

function workerEvent({
  completed = true,
  outcome = "failed",
  durationMs = 60_000,
  task = "train.policy",
  provider = "local",
  baseline = false,
} = {}) {
  const correlation = correlationForBaseline(baseline);
  const level = !completed ? "info" : {
    succeeded: "info",
    "retry-scheduled": "warn",
    failed: "error",
    discarded: "warn",
  }[outcome];
  const attributes = completed
    ? {
        task,
        provider,
        attempt: 1,
        outcome,
        durationMs,
        errorCode: outcome === "succeeded" ? null : "fixture-failure",
        retryAfterSeconds: outcome === "retry-scheduled" ? 5 : null,
      }
    : { task, provider, attempt: 1 };
  return {
    schemaVersion: "forge-observability-event/3.0.0",
    occurredAt: "2026-07-21T11:59:59.500Z",
    clock: { source: "system", timezone: "UTC" },
    level,
    eventName: completed ? "worker.job.attempt.completed" : "worker.job.attempt.started",
    service: "workers",
    serviceVersion: "0.2.0",
    environment: "ci",
    source: { component: "workers/forge_workers", revision: null },
    correlation: {
      requestId: null,
      traceId: correlation.traceId,
      spanId: correlation.spanId,
      parentSpanId: null,
      actorDigest: null,
      jobId: "job-fixture-1",
      attemptId: FIXED_ATTEMPT_ID,
      providerCallId: null,
      deploymentId: null,
    },
    attributes,
  };
}

function batch(events) {
  return createObservationDeliveryBatch(events, {
    batchId: FIXED_BATCH_ID,
    createdAt: FIXED_DATE,
  });
}

function project(events) {
  return projectObservabilitySignals(batch(events), {
    signalSetId: FIXED_SIGNAL_SET_ID,
    createdAt: FIXED_DATE,
    documentation,
  });
}

test("D75 signals policy, schema, and generated authorities are coherent", () => {
  assert.deepEqual(validateObservabilitySignalsPolicy(policy, schema, documentation), []);
  const duplicatedAuthority = structuredClone(documentation);
  duplicatedAuthority.workerArtifacts[1].queueKind =
    duplicatedAuthority.workerArtifacts[0].queueKind;
  assert.throws(
    () => validateObservabilitySignalsPolicy(policy, schema, duplicatedAuthority),
    /worker authority contains duplicates/,
  );
});

test("validated events aggregate into canonical finite metric series", () => {
  const signalSet = project([
    gatewayEvent({ durationMs: 4 }),
    gatewayEvent({ durationMs: 6 }),
    workerEvent({ completed: false }),
    workerEvent(),
  ]);
  assert.equal(signalSet.schemaVersion, OBSERVABILITY_SIGNAL_SET_SCHEMA);
  assert.equal(signalSet.source.eventCount, 4);
  assert.deepEqual(signalSet.metricSeries.map((series) => series.name), [
    "forge_gateway_request_duration_ms",
    "forge_gateway_requests_total",
    "forge_worker_attempt_duration_ms",
    "forge_worker_attempts_completed_total",
    "forge_worker_attempts_started_total",
  ]);
  assert.equal(signalSet.metricSeries[0].count, 2);
  assert.equal(signalSet.metricSeries[0].sumMs, 10);
  assert.equal(signalSet.metricSeries[0].buckets[0].count, 1);
  assert.equal(signalSet.metricSeries[0].buckets.at(-1).count, 2);
  assert.equal(signalSet.metricSeries[1].value, 2);
  assert.deepEqual(Object.keys(signalSet.metricSeries[1].labels), [
    "environment", "method", "route", "statusClass",
  ]);
  assert.equal(signalSet.traceSpans.length, 1);
  assert.deepEqual(signalSet.traceSpans[0].sampleReasons, ["failure", "slow"]);
  assert.deepEqual(validateObservabilitySignalSet(signalSet, documentation), []);
  assert.doesNotMatch(serializeObservabilitySignalSet(signalSet), /jobInput|leaseToken|authorization/);
});

test("generated route and task authorities refuse safe-looking cardinality expansion", () => {
  assert.throws(
    () => project([gatewayEvent({ route: "/v1/not-a-documented-route" })]),
    /route lacks generated finite-cardinality authority/,
  );
  assert.throws(
    () => project([workerEvent({ task: "custom.safe-looking-task" })]),
    /task lacks generated finite-cardinality authority/,
  );
  assert.doesNotThrow(() => project([gatewayEvent({ route: "unmatched" })]));
});

test("failure and slow completions are retained while worker starts are never trace spans", () => {
  const signalSet = project([
    gatewayEvent({ statusCode: 503, durationMs: 1_500 }),
    workerEvent({ completed: false, baseline: true }),
    workerEvent({ outcome: "succeeded", durationMs: 60_000 }),
  ]);
  assert.equal(signalSet.traceSpans.length, 2);
  assert.deepEqual(signalSet.traceSpans[0].sampleReasons, ["failure", "slow"]);
  assert.deepEqual(signalSet.traceSpans[1].sampleReasons, ["slow"]);
  assert.equal(signalSet.traceSpans.some((span) => span.eventName.endsWith("started")), false);
});

test("healthy baseline sampling is deterministic and bounded to one in sixty-four hashes", () => {
  const sampled = project([gatewayEvent({ baseline: true })]);
  const excluded = project([gatewayEvent({ baseline: false })]);
  assert.deepEqual(sampled.traceSpans.map((span) => span.sampleReasons), [["baseline"]]);
  assert.deepEqual(excluded.traceSpans, []);
  assert.deepEqual(
    project([gatewayEvent({ baseline: true })]).traceSpans,
    sampled.traceSpans,
  );
});

test("invalid batches, event extensions, and unsupported event majors fail before projection", () => {
  const extended = gatewayEvent();
  extended.headers = { authorization: "seeded-secret" };
  assert.throws(() => project([extended]), /top-level allowlist/);
  const unsupported = gatewayEvent();
  unsupported.schemaVersion = "forge-observability-event/2.0.0";
  assert.throws(() => project([unsupported]), /schemaVersion is unsupported/);
  const mismatched = batch([gatewayEvent()]);
  mismatched.eventCount = 2;
  assert.throws(
    () => projectObservabilitySignals(mismatched, { documentation }),
    /eventCount must equal events length/,
  );
});

test("signal validation rejects high-cardinality metric labels and sampling drift", () => {
  const signalSet = project([workerEvent()]);
  const highCardinality = structuredClone(signalSet);
  highCardinality.metricSeries[0].labels.jobId = "job-fixture-1";
  assert.match(
    validateObservabilitySignalSet(highCardinality, documentation).join("\n"),
    /labels lack finite authority|forbidden label jobId/,
  );
  const driftedTrace = structuredClone(signalSet);
  driftedTrace.traceSpans[0].sampleReasons = ["baseline"];
  assert.match(
    validateObservabilitySignalSet(driftedTrace, documentation).join("\n"),
    /contradicts deterministic sampling policy/,
  );
  const leaked = structuredClone(signalSet);
  leaked.traceSpans[0].attributes.body = "private";
  assert.match(
    validateObservabilitySignalSet(leaked, documentation).join("\n"),
    /attributes do not match the allowlist|body is forbidden/,
  );
  const mismatchedMetricPair = structuredClone(signalSet);
  mismatchedMetricPair.metricSeries[0].count += 1;
  assert.match(
    validateObservabilitySignalSet(mismatchedMetricPair, documentation).join("\n"),
    /count-matched counter|count-matched histogram/,
  );
  const mismatchedEventTotal = structuredClone(signalSet);
  mismatchedEventTotal.source.eventCount += 1;
  assert.match(
    validateObservabilitySignalSet(mismatchedEventTotal, documentation).join("\n"),
    /metric event total must equal source eventCount/,
  );
});

test("backend claims, network use, persistence, and relaxed schema bounds fail policy review", () => {
  const candidate = structuredClone(policy);
  candidate.maturity.metricsBackend = true;
  candidate.maturity.traceBackend = true;
  candidate.lifecycle.network = "remote";
  candidate.lifecycle.persistentRetentionSeconds = 86_400;
  candidate.metrics.forbiddenLabelKeys = candidate.metrics.forbiddenLabelKeys.filter(
    (label) => label !== "traceId",
  );
  const driftedSchema = structuredClone(schema);
  driftedSchema.additionalProperties = true;
  driftedSchema.properties.metricSeries.maxItems = 1_000;
  const errors = validateObservabilitySignalsPolicy(
    candidate,
    driftedSchema,
    documentation,
  ).join("\n");
  assert.match(errors, /metricsBackend must remain false/);
  assert.match(errors, /traceBackend must remain false/);
  assert.match(errors, /cannot use a network/);
  assert.match(errors, /cannot claim persistence/);
  assert.match(errors, /forbidden metric labels drifted/);
  assert.match(errors, /schema must deny extensions/);
  assert.match(errors, /schema metric bound drifted/);
});

test("bounded stdin CLI projects one batch and refuses oversized input without reflection", () => {
  const input = JSON.stringify(batch([gatewayEvent({ statusCode: 503 })]));
  const projected = spawnSync(
    process.execPath,
    ["scripts/observability-signals.mjs", "project"],
    { input, encoding: "utf8" },
  );
  assert.equal(projected.status, 0, projected.stderr);
  assert.deepEqual(
    validateObservabilitySignalSet(JSON.parse(projected.stdout), documentation),
    [],
  );
  const oversized = spawnSync(
    process.execPath,
    ["scripts/observability-signals.mjs", "project"],
    { input: "s".repeat(MAX_OBSERVABILITY_BATCH_BYTES + 1), encoding: "utf8" },
  );
  assert.notEqual(oversized.status, 0);
  assert.match(oversized.stderr, /input exceeds 135168 bytes/);
  assert.doesNotMatch(oversized.stderr, /s{32}/);
  const malformed = spawnSync(
    process.execPath,
    ["scripts/observability-signals.mjs", "project"],
    { input: '{"secret":"seeded-private-value"', encoding: "utf8" },
  );
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /input is invalid JSON/);
  assert.doesNotMatch(malformed.stderr, /seeded-private-value/);
});
