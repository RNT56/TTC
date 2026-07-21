#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCEPTED_OBSERVABILITY_EVENT_SCHEMA,
  MAX_OBSERVABILITY_BATCH_BYTES,
  MAX_OBSERVABILITY_EVENTS_PER_BATCH,
  OBSERVABILITY_DELIVERY_BATCH_SCHEMA,
  OBSERVABILITY_DELIVERY_BATCH_VERSION,
  validateObservationDeliveryBatch,
  validateObservationEvent,
} from "./observability-transport.mjs";

export const OBSERVABILITY_SIGNALS_POLICY_VERSION = "1.0.0";
export const OBSERVABILITY_SIGNAL_SET_VERSION = "1.0.0";
export const OBSERVABILITY_SIGNAL_SET_SCHEMA =
  `forge-observability-signal-set/${OBSERVABILITY_SIGNAL_SET_VERSION}`;
export const MAX_OBSERVABILITY_METRIC_SERIES = 64;
export const MAX_OBSERVABILITY_TRACE_SPANS = 32;
export const MAX_OBSERVABILITY_SIGNAL_SET_BYTES = 262_144;
export const GATEWAY_SLOW_THRESHOLD_MS = 1_000;
export const WORKER_SLOW_THRESHOLD_MS = 60_000;
export const BASELINE_SAMPLE_DENOMINATOR = 64;

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIR, "..");
const POLICY_PATH = join(
  REPOSITORY_ROOT,
  "infra/observability/observability-signals-policy.v1.json",
);
const SCHEMA_PATH = join(
  REPOSITORY_ROOT,
  "schema/forge-observability-signal-set.schema.json",
);
const DOCUMENTATION_PATH = join(REPOSITORY_ROOT, "contracts/documentation.json");

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const METHODS = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"];
const ENVIRONMENTS = ["local", "ci", "sandbox", "staging", "production", "controlled-lab"];
const STATUS_CLASSES = ["1xx", "2xx", "3xx", "4xx", "5xx"];
const PROVIDERS = ["local", "modal"];
const WORKER_OUTCOMES = ["succeeded", "retry-scheduled", "failed", "discarded"];
const SAMPLE_REASONS = ["baseline", "failure", "slow"];
const DENY_FIELDS = [
  "authorization",
  "body",
  "cookie",
  "errorMessage",
  "headers",
  "idempotencyKey",
  "jobInput",
  "jobOutput",
  "leaseToken",
  "modelBytes",
  "personalData",
  "presignedUrl",
  "prompt",
  "query",
  "secretReference",
  "telemetry",
  "url",
];
const FORBIDDEN_METRIC_LABELS = [
  "actorDigest",
  "attempt",
  "attemptId",
  "deploymentId",
  "errorCode",
  "jobId",
  "providerCallId",
  "requestId",
  "retryAfterSeconds",
  "sourceRevision",
  "spanId",
  "statusCode",
  "traceId",
];
const GATEWAY_BUCKETS_MS = [
  5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000,
  300_000, 3_600_000,
];
const WORKER_BUCKETS_MS = [
  100, 500, 1_000, 5_000, 10_000, 30_000, 60_000, 300_000, 900_000, 1_800_000,
  3_600_000, 7_200_000, 14_400_000, 28_800_000,
];
const METRIC_DEFINITIONS = [
  {
    name: "forge_gateway_request_duration_ms",
    kind: "histogram",
    unit: "ms",
    labelKeys: ["environment", "method", "route", "statusClass"],
    bucketsMs: GATEWAY_BUCKETS_MS,
  },
  {
    name: "forge_gateway_requests_total",
    kind: "counter",
    unit: "1",
    labelKeys: ["environment", "method", "route", "statusClass"],
  },
  {
    name: "forge_worker_attempt_duration_ms",
    kind: "histogram",
    unit: "ms",
    labelKeys: ["environment", "outcome", "provider", "task"],
    bucketsMs: WORKER_BUCKETS_MS,
  },
  {
    name: "forge_worker_attempts_completed_total",
    kind: "counter",
    unit: "1",
    labelKeys: ["environment", "outcome", "provider", "task"],
  },
  {
    name: "forge_worker_attempts_started_total",
    kind: "counter",
    unit: "1",
    labelKeys: ["environment", "provider", "task"],
  },
];
const METRIC_BY_NAME = new Map(METRIC_DEFINITIONS.map((definition) => [definition.name, definition]));

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function canonicalTimestamp(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function exactArray(value, expected) {
  return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
}

function roundMillis(value) {
  return Math.round(value * 1_000) / 1_000;
}

function canonicalLabels(labels, keys) {
  return Object.fromEntries(keys.map((key) => [key, labels[key]]));
}

function seriesKey(name, labels) {
  return `${name}\u0000${JSON.stringify(labels)}`;
}

function seriesSortKey(series) {
  return seriesKey(series.name, series.labels);
}

function authorityFromDocumentation(documentation = loadJson(DOCUMENTATION_PATH)) {
  const routeEntries = documentation?.gatewayApi?.routes;
  const workerEntries = documentation?.workerArtifacts;
  if (!Array.isArray(routeEntries) || !Array.isArray(workerEntries)) {
    throw new Error("observability signals authority documentation is invalid");
  }
  const routeMethods = new Set();
  const routeKeys = new Set();
  for (const route of routeEntries) {
    if (
      !isObject(route) || typeof route.path !== "string" ||
      !(route.method === "*" || METHODS.includes(route.method))
    ) {
      throw new Error("observability signals route authority is invalid");
    }
    const routeKey = `${route.method} ${route.path}`;
    if (routeKeys.has(routeKey)) {
      throw new Error("observability signals route authority contains duplicates");
    }
    routeKeys.add(routeKey);
    const methods = route?.method === "*" ? METHODS : [route?.method];
    for (const method of methods) {
      const expanded = `${method} ${route.path}`;
      if (routeMethods.has(expanded)) {
        throw new Error("observability signals expanded route authority contains duplicates");
      }
      routeMethods.add(expanded);
    }
  }
  const workerTasks = new Set();
  for (const entry of workerEntries) {
    if (!isObject(entry) || typeof entry.queueKind !== "string") {
      throw new Error("observability signals worker authority is invalid");
    }
    if (workerTasks.has(entry.queueKind)) {
      throw new Error("observability signals worker authority contains duplicates");
    }
    workerTasks.add(entry.queueKind);
  }
  return { routeEntries, workerEntries, routeMethods, workerTasks };
}

function knownGatewayRoute(authority, method, route) {
  return route === "unmatched" || authority.routeMethods.has(`${method} ${route}`);
}

function labelsAreValid(definition, labels, authority) {
  if (!exactKeys(labels, definition.labelKeys)) return false;
  if (!ENVIRONMENTS.includes(labels.environment)) return false;
  if (definition.name.startsWith("forge_gateway_")) {
    return METHODS.includes(labels.method) &&
      STATUS_CLASSES.includes(labels.statusClass) &&
      knownGatewayRoute(authority, labels.method, labels.route);
  }
  if (!PROVIDERS.includes(labels.provider) || !authority.workerTasks.has(labels.task)) return false;
  return !definition.labelKeys.includes("outcome") || WORKER_OUTCOMES.includes(labels.outcome);
}

function addCounter(series, name, labels) {
  const definition = METRIC_BY_NAME.get(name);
  const canonical = canonicalLabels(labels, definition.labelKeys);
  const key = seriesKey(name, canonical);
  const current = series.get(key);
  if (current) {
    current.value += 1;
  } else {
    series.set(key, { name, kind: "counter", unit: "1", labels: canonical, value: 1 });
  }
}

function addHistogram(series, name, labels, value) {
  const definition = METRIC_BY_NAME.get(name);
  const canonical = canonicalLabels(labels, definition.labelKeys);
  const key = seriesKey(name, canonical);
  let current = series.get(key);
  if (!current) {
    current = {
      name,
      kind: "histogram",
      unit: "ms",
      labels: canonical,
      count: 0,
      sumMs: 0,
      buckets: definition.bucketsMs.map((upperBoundMs) => ({ upperBoundMs, count: 0 })),
    };
    series.set(key, current);
  }
  current.count += 1;
  current.sumMs = roundMillis(current.sumMs + roundMillis(value));
  for (const bucket of current.buckets) {
    if (value <= bucket.upperBoundMs) bucket.count += 1;
  }
}

function baselineSampled(correlation) {
  const digest = createHash("sha256")
    .update(`${correlation.traceId}:${correlation.spanId}`, "utf8")
    .digest();
  return digest.readUInt16BE(0) % BASELINE_SAMPLE_DENOMINATOR === 0;
}

function traceReasons(event) {
  if (event.eventName === "worker.job.attempt.started") return [];
  const reasons = [];
  const failure = event.eventName === "gateway.request.completed"
    ? event.attributes.outcome !== "success"
    : event.attributes.outcome !== "succeeded";
  const slow = event.attributes.durationMs >= (
    event.eventName === "gateway.request.completed"
      ? GATEWAY_SLOW_THRESHOLD_MS
      : WORKER_SLOW_THRESHOLD_MS
  );
  if (failure) reasons.push("failure");
  if (slow) reasons.push("slow");
  if (reasons.length === 0 && baselineSampled(event.correlation)) reasons.push("baseline");
  return reasons;
}

function traceFromEvent(event, sampleReasons) {
  const correlation = event.correlation;
  return {
    occurredAt: event.occurredAt,
    level: event.level,
    eventName: event.eventName,
    service: event.service,
    serviceVersion: event.serviceVersion,
    environment: event.environment,
    source: { ...event.source },
    sampleReasons,
    correlation: {
      requestId: correlation.requestId,
      traceId: correlation.traceId,
      spanId: correlation.spanId,
      parentSpanId: correlation.parentSpanId,
      jobId: correlation.jobId,
      attemptId: correlation.attemptId,
      providerCallId: correlation.providerCallId,
      deploymentId: correlation.deploymentId,
    },
    attributes: { ...event.attributes },
  };
}

function forbiddenPath(value, path = "signalSet") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbiddenPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (DENY_FIELDS.includes(key)) return `${path}.${key}`;
    const found = forbiddenPath(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function validateMetricSeries(series, authority) {
  const errors = [];
  const seen = new Set();
  let previous = null;
  for (let index = 0; index < series.length; index += 1) {
    const item = series[index];
    if (!isObject(item) || typeof item.name !== "string") {
      errors.push(`metricSeries[${index}] is invalid`);
      continue;
    }
    const definition = METRIC_BY_NAME.get(item.name);
    if (!definition) {
      errors.push(`metricSeries[${index}] name is unsupported`);
      continue;
    }
    const expectedKeys = definition.kind === "counter"
      ? ["name", "kind", "unit", "labels", "value"]
      : ["name", "kind", "unit", "labels", "count", "sumMs", "buckets"];
    add(errors, exactKeys(item, expectedKeys), `metricSeries[${index}] fields are invalid`);
    add(
      errors,
      item.kind === definition.kind && item.unit === definition.unit,
      `metricSeries[${index}] kind/unit is invalid`,
    );
    add(
      errors,
      labelsAreValid(definition, item.labels, authority),
      `metricSeries[${index}] labels lack finite authority`,
    );
    for (const forbidden of FORBIDDEN_METRIC_LABELS) {
      add(
        errors,
        !isObject(item.labels) || !Object.hasOwn(item.labels, forbidden),
        `metricSeries[${index}] contains forbidden label ${forbidden}`,
      );
    }
    if (definition.kind === "counter") {
      add(
        errors,
        Number.isInteger(item.value) && item.value >= 1 && item.value <= MAX_OBSERVABILITY_EVENTS_PER_BATCH,
        `metricSeries[${index}] counter value is invalid`,
      );
    } else {
      add(
        errors,
        Number.isInteger(item.count) && item.count >= 1 && item.count <= MAX_OBSERVABILITY_EVENTS_PER_BATCH,
        `metricSeries[${index}] histogram count is invalid`,
      );
      add(
        errors,
        typeof item.sumMs === "number" && Number.isFinite(item.sumMs) && item.sumMs >= 0 &&
          Number.isInteger(item.count) &&
          item.sumMs <= item.count * definition.bucketsMs.at(-1),
        `metricSeries[${index}] histogram sum is invalid`,
      );
      add(
        errors,
        Array.isArray(item.buckets) && item.buckets.length === definition.bucketsMs.length,
        `metricSeries[${index}] histogram buckets are invalid`,
      );
      if (Array.isArray(item.buckets)) {
        let priorCount = -1;
        item.buckets.forEach((bucket, bucketIndex) => {
          add(
            errors,
            exactKeys(bucket, ["upperBoundMs", "count"]) &&
              bucket.upperBoundMs === definition.bucketsMs[bucketIndex],
            `metricSeries[${index}] bucket ${bucketIndex} boundary is invalid`,
          );
          add(
            errors,
            Number.isInteger(bucket?.count) && bucket.count >= priorCount && bucket.count <= item.count,
            `metricSeries[${index}] bucket ${bucketIndex} count is invalid`,
          );
          priorCount = bucket?.count;
        });
        add(
          errors,
          item.buckets.at(-1)?.count === item.count,
          `metricSeries[${index}] final bucket must equal count`,
        );
      }
    }
    const key = seriesSortKey(item);
    add(errors, !seen.has(key), `metricSeries[${index}] duplicates a series`);
    add(errors, previous === null || previous < key, "metricSeries must be canonically sorted");
    seen.add(key);
    previous = key;
  }
  return errors;
}

function validateSignalSetIntegrity(value) {
  const errors = [];
  if (!Array.isArray(value.metricSeries)) return errors;
  const series = new Map();
  for (const item of value.metricSeries) {
    if (isObject(item) && typeof item.name === "string" && isObject(item.labels)) {
      series.set(seriesKey(item.name, item.labels), item);
    }
  }
  let eventCount = 0;
  const pairs = [
    ["forge_gateway_requests_total", "forge_gateway_request_duration_ms"],
    ["forge_worker_attempts_completed_total", "forge_worker_attempt_duration_ms"],
  ];
  for (const [counterName, histogramName] of pairs) {
    for (const item of value.metricSeries) {
      if (!isObject(item) || item.name !== counterName || !isObject(item.labels)) continue;
      if (Number.isInteger(item.value)) eventCount += item.value;
      const histogram = series.get(seriesKey(histogramName, item.labels));
      add(
        errors,
        isObject(histogram) && histogram.count === item.value,
        `${counterName} must have one count-matched histogram`,
      );
    }
    for (const item of value.metricSeries) {
      if (!isObject(item) || item.name !== histogramName || !isObject(item.labels)) continue;
      const counter = series.get(seriesKey(counterName, item.labels));
      add(
        errors,
        isObject(counter) && counter.value === item.count,
        `${histogramName} must have one count-matched counter`,
      );
    }
  }
  for (const item of value.metricSeries) {
    if (
      isObject(item) && item.name === "forge_worker_attempts_started_total" &&
      Number.isInteger(item.value)
    ) {
      eventCount += item.value;
    }
  }
  if (Number.isInteger(value.source?.eventCount)) {
    add(errors, eventCount === value.source.eventCount, "metric event total must equal source eventCount");
    add(
      errors,
      !Array.isArray(value.traceSpans) || value.traceSpans.length <= value.source.eventCount,
      "trace span count cannot exceed source eventCount",
    );
  }
  return errors;
}

function validateTraceSpan(trace, index, authority) {
  const errors = [];
  const expectedKeys = [
    "occurredAt", "level", "eventName", "service", "serviceVersion", "environment",
    "source", "sampleReasons", "correlation", "attributes",
  ];
  if (!exactKeys(trace, expectedKeys)) return [`traceSpans[${index}] fields are invalid`];
  add(
    errors,
    trace.eventName === "gateway.request.completed" ||
      trace.eventName === "worker.job.attempt.completed",
    `traceSpans[${index}] must be a completion event`,
  );
  add(
    errors,
    Array.isArray(trace.sampleReasons) && trace.sampleReasons.length >= 1 &&
      trace.sampleReasons.length <= 2 &&
      new Set(trace.sampleReasons).size === trace.sampleReasons.length &&
      trace.sampleReasons.every((reason) => SAMPLE_REASONS.includes(reason)) &&
      JSON.stringify(trace.sampleReasons) ===
        JSON.stringify(SAMPLE_REASONS.filter((reason) => trace.sampleReasons.includes(reason))),
    `traceSpans[${index}] sample reasons are invalid`,
  );
  if (!exactKeys(trace.correlation, [
    "requestId", "traceId", "spanId", "parentSpanId", "jobId", "attemptId",
    "providerCallId", "deploymentId",
  ])) {
    errors.push(`traceSpans[${index}] correlation fields are invalid`);
    return errors;
  }
  const event = {
    schemaVersion: ACCEPTED_OBSERVABILITY_EVENT_SCHEMA,
    occurredAt: trace.occurredAt,
    clock: { source: "system", timezone: "UTC" },
    level: trace.level,
    eventName: trace.eventName,
    service: trace.service,
    serviceVersion: trace.serviceVersion,
    environment: trace.environment,
    source: trace.source,
    correlation: { ...trace.correlation, actorDigest: null },
    attributes: trace.attributes,
  };
  for (const error of validateObservationEvent(event)) {
    errors.push(`traceSpans[${index}]: ${error}`);
  }
  if (trace.eventName === "gateway.request.completed") {
    add(
      errors,
      knownGatewayRoute(authority, trace.attributes?.method, trace.attributes?.route),
      `traceSpans[${index}] route lacks finite authority`,
    );
  } else {
    add(
      errors,
      authority.workerTasks.has(trace.attributes?.task),
      `traceSpans[${index}] task lacks finite authority`,
    );
  }
  const expectedReasons = traceReasons(event);
  add(
    errors,
    JSON.stringify(trace.sampleReasons) === JSON.stringify(expectedReasons),
    `traceSpans[${index}] contradicts deterministic sampling policy`,
  );
  return errors;
}

export function validateObservabilitySignalSet(value, documentation = loadJson(DOCUMENTATION_PATH)) {
  const errors = [];
  if (!exactKeys(value, [
    "schemaVersion", "signalSetId", "createdAt", "source", "metricSeries", "traceSpans",
  ])) return ["signal set must contain only the v1 top-level allowlist"];
  add(errors, value.schemaVersion === OBSERVABILITY_SIGNAL_SET_SCHEMA, "signal set schemaVersion is unsupported");
  add(errors, typeof value.signalSetId === "string" && UUID_V4.test(value.signalSetId), "signal set ID is invalid");
  add(errors, canonicalTimestamp(value.createdAt), "signal set createdAt must be canonical UTC");
  if (!exactKeys(value.source, [
    "deliveryBatchSchemaVersion", "batchId", "eventSchemaVersion", "eventCount",
  ])) {
    errors.push("signal set source fields are invalid");
  } else {
    add(
      errors,
      value.source.deliveryBatchSchemaVersion === OBSERVABILITY_DELIVERY_BATCH_SCHEMA,
      "signal set source delivery version is invalid",
    );
    add(errors, typeof value.source.batchId === "string" && UUID_V4.test(value.source.batchId), "signal set source batch ID is invalid");
    add(errors, value.source.eventSchemaVersion === ACCEPTED_OBSERVABILITY_EVENT_SCHEMA, "signal set source event version is invalid");
    add(
      errors,
      Number.isInteger(value.source.eventCount) && value.source.eventCount >= 1 &&
        value.source.eventCount <= MAX_OBSERVABILITY_EVENTS_PER_BATCH,
      "signal set source event count is invalid",
    );
  }
  const authority = authorityFromDocumentation(documentation);
  add(
    errors,
    Array.isArray(value.metricSeries) && value.metricSeries.length >= 1 &&
      value.metricSeries.length <= MAX_OBSERVABILITY_METRIC_SERIES,
    "signal set metricSeries must contain 1..64 entries",
  );
  if (Array.isArray(value.metricSeries)) errors.push(...validateMetricSeries(value.metricSeries, authority));
  errors.push(...validateSignalSetIntegrity(value));
  add(
    errors,
    Array.isArray(value.traceSpans) && value.traceSpans.length <= MAX_OBSERVABILITY_TRACE_SPANS,
    "signal set traceSpans exceeds 32 entries",
  );
  if (Array.isArray(value.traceSpans)) {
    value.traceSpans.forEach((trace, index) => errors.push(...validateTraceSpan(trace, index, authority)));
  }
  const denied = forbiddenPath(value);
  add(errors, denied === null, denied ? `${denied} is forbidden` : "signal set contains forbidden data");
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    errors.push("signal set must be JSON serializable");
  }
  if (serialized !== undefined) {
    add(
      errors,
      Buffer.byteLength(serialized, "utf8") <= MAX_OBSERVABILITY_SIGNAL_SET_BYTES,
      `signal set exceeds ${MAX_OBSERVABILITY_SIGNAL_SET_BYTES} bytes`,
    );
  }
  return errors;
}

export function projectObservabilitySignals(
  batch,
  { signalSetId = randomUUID(), createdAt = new Date(), documentation = loadJson(DOCUMENTATION_PATH) } = {},
) {
  const batchErrors = validateObservationDeliveryBatch(batch);
  if (batchErrors.length > 0) {
    throw new Error(`unsafe observability signal projection refused: ${batchErrors.join("; ")}`);
  }
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw new Error("unsafe observability signal projection refused: createdAt must be a valid Date");
  }
  const authority = authorityFromDocumentation(documentation);
  const metricSeries = new Map();
  const traceSpans = [];
  for (const event of batch.events) {
    if (event.eventName === "gateway.request.completed") {
      if (!knownGatewayRoute(authority, event.attributes.method, event.attributes.route)) {
        throw new Error("unsafe observability signal projection refused: gateway route lacks generated finite-cardinality authority");
      }
      const labels = {
        environment: event.environment,
        method: event.attributes.method,
        route: event.attributes.route,
        statusClass: event.attributes.statusClass,
      };
      addCounter(metricSeries, "forge_gateway_requests_total", labels);
      addHistogram(
        metricSeries,
        "forge_gateway_request_duration_ms",
        labels,
        event.attributes.durationMs,
      );
    } else {
      if (!authority.workerTasks.has(event.attributes.task)) {
        throw new Error("unsafe observability signal projection refused: worker task lacks generated finite-cardinality authority");
      }
      const labels = {
        environment: event.environment,
        provider: event.attributes.provider,
        task: event.attributes.task,
      };
      if (event.eventName === "worker.job.attempt.started") {
        addCounter(metricSeries, "forge_worker_attempts_started_total", labels);
      } else {
        const completedLabels = { ...labels, outcome: event.attributes.outcome };
        addCounter(metricSeries, "forge_worker_attempts_completed_total", completedLabels);
        addHistogram(
          metricSeries,
          "forge_worker_attempt_duration_ms",
          completedLabels,
          event.attributes.durationMs,
        );
      }
    }
    const sampleReasons = traceReasons(event);
    if (sampleReasons.length > 0) traceSpans.push(traceFromEvent(event, sampleReasons));
  }
  const signalSet = {
    schemaVersion: OBSERVABILITY_SIGNAL_SET_SCHEMA,
    signalSetId,
    createdAt: createdAt.toISOString(),
    source: {
      deliveryBatchSchemaVersion: batch.schemaVersion,
      batchId: batch.batchId,
      eventSchemaVersion: batch.eventSchemaVersion,
      eventCount: batch.eventCount,
    },
    metricSeries: [...metricSeries.values()].sort((left, right) => {
      const leftKey = seriesSortKey(left);
      const rightKey = seriesSortKey(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
    traceSpans,
  };
  const errors = validateObservabilitySignalSet(signalSet, documentation);
  if (errors.length > 0) {
    throw new Error(`unsafe observability signal projection refused: ${errors.join("; ")}`);
  }
  return signalSet;
}

export function serializeObservabilitySignalSet(signalSet) {
  const errors = validateObservabilitySignalSet(signalSet);
  if (errors.length > 0) {
    throw new Error(`unsafe observability signal set refused: ${errors.join("; ")}`);
  }
  return JSON.stringify(signalSet);
}

export function validateObservabilitySignalsPolicy(
  policy,
  schema = loadJson(SCHEMA_PATH),
  documentation = loadJson(DOCUMENTATION_PATH),
) {
  const errors = [];
  exactKeys(policy, [
    "schemaVersion", "signalSetVersion", "signalSetSchema", "acceptedDeliveryBatchVersions",
    "acceptedEventVersions", "decision", "status", "inputAuthority", "metrics", "traces",
    "lifecycle", "denyFields", "maturity",
  ]) || errors.push("signals policy top-level fields are invalid");
  add(errors, policy.schemaVersion === `forge-observability-signals-policy/${OBSERVABILITY_SIGNALS_POLICY_VERSION}`, "signals policy schemaVersion is invalid");
  add(errors, policy.signalSetVersion === OBSERVABILITY_SIGNAL_SET_VERSION, "signals policy signalSetVersion is invalid");
  add(errors, policy.signalSetSchema === "schema/forge-observability-signal-set.schema.json", "signals policy schema path is invalid");
  add(errors, exactArray(policy.acceptedDeliveryBatchVersions, [OBSERVABILITY_DELIVERY_BATCH_VERSION]), "signals policy delivery batch versions are invalid");
  add(errors, exactArray(policy.acceptedEventVersions, ["3.0.0"]), "signals policy event versions are invalid");
  add(errors, policy.decision === "D75", "signals policy must cite D75");
  add(errors, policy.status === "contract-fixture", "signals policy cannot claim maturity above contract-fixture");
  const authority = authorityFromDocumentation(documentation);
  add(errors, authority.routeEntries.length === 82, "generated Gateway route authority must contain 82 entries");
  add(errors, authority.workerEntries.length === 17, "generated worker task authority must contain 17 entries");
  add(
    errors,
    exactKeys(policy.inputAuthority, [
      "gatewayRoutes", "workerTasks", "documentedGatewayRoutes", "documentedWorkerTasks",
      "maxDeliveryBatchBytes", "maxEventsPerBatch",
    ]),
    "signals policy inputAuthority fields are invalid",
  );
  add(errors, policy.inputAuthority?.gatewayRoutes === "contracts/documentation.json#gatewayApi.routes", "Gateway route authority path is invalid");
  add(errors, policy.inputAuthority?.workerTasks === "contracts/documentation.json#workerArtifacts.queueKind", "worker task authority path is invalid");
  add(errors, policy.inputAuthority?.documentedGatewayRoutes === authority.routeEntries.length, "documented Gateway route count drifted");
  add(errors, policy.inputAuthority?.documentedWorkerTasks === authority.workerEntries.length, "documented worker task count drifted");
  add(errors, policy.inputAuthority?.maxDeliveryBatchBytes === MAX_OBSERVABILITY_BATCH_BYTES, "signals input batch byte bound drifted");
  add(errors, policy.inputAuthority?.maxEventsPerBatch === MAX_OBSERVABILITY_EVENTS_PER_BATCH, "signals input event bound drifted");
  add(errors, exactKeys(policy.metrics, ["maxSeriesPerSignalSet", "series", "forbiddenLabelKeys"]), "signals metrics fields are invalid");
  add(errors, policy.metrics?.maxSeriesPerSignalSet === MAX_OBSERVABILITY_METRIC_SERIES, "metric series bound drifted");
  add(errors, JSON.stringify(policy.metrics?.series) === JSON.stringify(METRIC_DEFINITIONS), "metric definitions drifted");
  add(errors, exactArray(policy.metrics?.forbiddenLabelKeys, FORBIDDEN_METRIC_LABELS), "forbidden metric labels drifted");
  add(
    errors,
    exactKeys(policy.traces, [
      "completionEventsOnly", "maxSpansPerSignalSet", "gatewaySlowThresholdMs",
      "workerSlowThresholdMs", "baselineSampleDenominator", "baselineHash",
      "failureOutcomes", "sampleReasons", "allowedCorrelationKeys",
    ]),
    "signals traces fields are invalid",
  );
  add(errors, policy.traces?.completionEventsOnly === true, "trace projection must remain completion-only");
  add(errors, policy.traces?.maxSpansPerSignalSet === MAX_OBSERVABILITY_TRACE_SPANS, "trace span bound drifted");
  add(errors, policy.traces?.gatewaySlowThresholdMs === GATEWAY_SLOW_THRESHOLD_MS, "Gateway slow threshold drifted");
  add(errors, policy.traces?.workerSlowThresholdMs === WORKER_SLOW_THRESHOLD_MS, "worker slow threshold drifted");
  add(errors, policy.traces?.baselineSampleDenominator === BASELINE_SAMPLE_DENOMINATOR, "baseline sample denominator drifted");
  add(errors, policy.traces?.baselineHash === "sha256-trace-id-colon-span-id-first-u16", "baseline hash contract drifted");
  add(errors, exactArray(policy.traces?.failureOutcomes, ["client-error", "discarded", "failed", "retry-scheduled", "server-error"]), "failure sampling outcomes drifted");
  add(errors, exactArray(policy.traces?.sampleReasons, SAMPLE_REASONS), "trace sample reasons drifted");
  add(errors, exactArray(policy.traces?.allowedCorrelationKeys, ["attemptId", "deploymentId", "jobId", "parentSpanId", "providerCallId", "requestId", "spanId", "traceId"]), "trace correlation allowlist drifted");
  add(errors, exactKeys(policy.lifecycle, ["input", "output", "buffer", "persistentRetentionSeconds", "network", "productAuthority", "maxSignalSetBytes"]), "signals lifecycle fields are invalid");
  add(errors, policy.lifecycle?.input === "one-validated-delivery-batch-json", "signals lifecycle input is invalid");
  add(errors, policy.lifecycle?.output === "one-signal-set-json-on-stdout", "signals lifecycle output is invalid");
  add(errors, policy.lifecycle?.buffer === "process-memory-only", "signals lifecycle buffer must remain memory-only");
  add(errors, policy.lifecycle?.persistentRetentionSeconds === 0, "signals lifecycle cannot claim persistence");
  add(errors, policy.lifecycle?.network === "none", "signals fixture cannot use a network");
  add(errors, policy.lifecycle?.productAuthority === "independent", "signals must remain authority-independent");
  add(errors, policy.lifecycle?.maxSignalSetBytes === MAX_OBSERVABILITY_SIGNAL_SET_BYTES, "signal set byte bound drifted");
  add(errors, exactArray(policy.denyFields, DENY_FIELDS), "signals deny fields drifted");
  add(
    errors,
    exactKeys(policy.maturity, [
      "metricProjectionContract", "traceSamplingContract", "localProjectionFixture",
      "externalCollector", "authenticatedTransport", "durableQueue", "managedCustody",
      "metricsBackend", "traceBackend", "dashboards", "alertRouting",
      "syntheticAlertDelivery", "managedSandbox", "live", "production",
    ]),
    "signals maturity fields are invalid",
  );
  for (const name of ["metricProjectionContract", "traceSamplingContract", "localProjectionFixture"]) {
    add(errors, policy.maturity?.[name] === true, `${name} must be implemented`);
  }
  for (const [name, value] of Object.entries(policy.maturity ?? {})) {
    if (!["metricProjectionContract", "traceSamplingContract", "localProjectionFixture"].includes(name)) {
      add(errors, value === false, `${name} must remain false in the D75 fixture slice`);
    }
  }
  add(errors, schema?.properties?.schemaVersion?.const === OBSERVABILITY_SIGNAL_SET_SCHEMA, "signal set schema marker is invalid");
  add(errors, schema?.additionalProperties === false, "signal set schema must deny extensions");
  add(errors, schema?.properties?.metricSeries?.maxItems === MAX_OBSERVABILITY_METRIC_SERIES, "signal set schema metric bound drifted");
  add(errors, schema?.properties?.traceSpans?.maxItems === MAX_OBSERVABILITY_TRACE_SPANS, "signal set schema trace bound drifted");
  add(errors, schema?.properties?.source?.properties?.deliveryBatchSchemaVersion?.const === OBSERVABILITY_DELIVERY_BATCH_SCHEMA, "signal set schema delivery source drifted");
  add(errors, schema?.properties?.source?.properties?.eventSchemaVersion?.const === ACCEPTED_OBSERVABILITY_EVENT_SCHEMA, "signal set schema event source drifted");
  return errors;
}

export function checkObservabilitySignalsPolicy() {
  return validateObservabilitySignalsPolicy(
    loadJson(POLICY_PATH),
    loadJson(SCHEMA_PATH),
    loadJson(DOCUMENTATION_PATH),
  );
}

async function readBoundedStdin(input = process.stdin) {
  const chunks = [];
  let total = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_OBSERVABILITY_BATCH_BYTES) {
      throw new Error(`delivery batch input exceeds ${MAX_OBSERVABILITY_BATCH_BYTES} bytes`);
    }
    chunks.push(bytes);
  }
  if (total === 0) throw new Error("delivery batch input is empty");
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const command = process.argv[2] ?? "check";
  if (command === "check") {
    const errors = checkObservabilitySignalsPolicy();
    if (errors.length > 0) {
      for (const error of errors) console.error(`observability-signals: ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      "observability-signals: D75 finite metric projection and deterministic trace sampling are coherent; backends and live claims remain false",
    );
    return;
  }
  if (command !== "project") {
    console.error("usage: node scripts/observability-signals.mjs <check|project>");
    process.exitCode = 2;
    return;
  }
  try {
    const input = await readBoundedStdin();
    let batch;
    try {
      batch = JSON.parse(input);
    } catch {
      throw new Error("delivery batch input is invalid JSON");
    }
    const signalSet = projectObservabilitySignals(batch);
    process.stdout.write(`${serializeObservabilitySignalSet(signalSet)}\n`);
  } catch (error) {
    console.error(`observability-signals: ${error instanceof Error ? error.message : "projection failed"}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
