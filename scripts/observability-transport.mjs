#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

export const OBSERVABILITY_TRANSPORT_POLICY_VERSION = "1.0.0";
export const OBSERVABILITY_DELIVERY_BATCH_VERSION = "1.0.0";
export const OBSERVABILITY_DELIVERY_BATCH_SCHEMA =
  `forge-observability-delivery-batch/${OBSERVABILITY_DELIVERY_BATCH_VERSION}`;
export const ACCEPTED_OBSERVABILITY_EVENT_SCHEMA = "forge-observability-event/3.0.0";
export const MAX_OBSERVABILITY_EVENT_BYTES = 4_096;
export const MAX_OBSERVABILITY_EVENTS_PER_BATCH = 32;
export const MAX_OBSERVABILITY_BATCH_BYTES = 135_168;
export const OBSERVABILITY_REQUEST_TIMEOUT_MS = 2_000;

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIR, "..");
const POLICY_PATH = join(
  REPOSITORY_ROOT,
  "infra/observability/observability-transport-policy.v1.json",
);
const BATCH_SCHEMA_PATH = join(
  REPOSITORY_ROOT,
  "schema/forge-observability-delivery-batch.schema.json",
);
const EVENT_SCHEMA_PATH = join(
  REPOSITORY_ROOT,
  "schema/forge-observability-event.v3.schema.json",
);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TRACE_ID = /^(?!0{32}$)[a-f0-9]{32}$/;
const SPAN_ID = /^(?!0{16}$)[a-f0-9]{16}$/;
const GIT_HASH = /^[a-f0-9]{40}$/;
const DEPLOYMENT_ID = /^[a-z0-9][a-z0-9-]{2,62}$/;
const JOB_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const PROVIDER_CALL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$/;
const TASK = /^[a-z][a-z0-9.-]{0,79}$/;
const ERROR_CODE = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ROUTE = /^(?:unmatched|\/[A-Za-z0-9_/:.*-]{0,255})$/;
const METHODS = new Set(["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);
const ENVIRONMENTS = new Set([
  "local",
  "ci",
  "sandbox",
  "staging",
  "production",
  "controlled-lab",
]);
const MANAGED_CUSTODY_REQUIREMENTS = [
  "access-control-and-audit",
  "availability-objective-and-failure-monitoring",
  "deletion-execution-and-proof",
  "owner-scoped-export-review",
  "region-and-data-residency-review",
  "retention-policy-and-enforcement",
];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return JSON.stringify(actual) === JSON.stringify(wanted);
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

function finiteNumber(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function gatewayOutcome(statusCode) {
  if (statusCode >= 500) return "server-error";
  if (statusCode >= 400) return "client-error";
  return "success";
}

function gatewayLevel(outcome) {
  return outcome === "server-error" ? "error" : outcome === "client-error" ? "warn" : "info";
}

export function validateObservationEvent(value) {
  const errors = [];
  if (!exactKeys(value, [
    "schemaVersion",
    "occurredAt",
    "clock",
    "level",
    "eventName",
    "service",
    "serviceVersion",
    "environment",
    "source",
    "correlation",
    "attributes",
  ])) return ["event must contain only the v3 top-level allowlist"];

  add(errors, value.schemaVersion === ACCEPTED_OBSERVABILITY_EVENT_SCHEMA, "event schemaVersion is unsupported");
  add(errors, canonicalTimestamp(value.occurredAt), "event occurredAt must be canonical UTC");
  add(
    errors,
    exactKeys(value.clock, ["source", "timezone"]) &&
      value.clock.source === "system" && value.clock.timezone === "UTC",
    "event clock must bind system UTC",
  );
  add(errors, new Set(["info", "warn", "error"]).has(value.level), "event level is invalid");
  add(errors, value.serviceVersion === "0.2.0", "event serviceVersion is invalid");
  add(errors, ENVIRONMENTS.has(value.environment), "event environment is invalid");

  if (!exactKeys(value.source, ["component", "revision"])) {
    errors.push("event source must contain only component and revision");
  } else {
    add(
      errors,
      value.source.revision === null ||
        (typeof value.source.revision === "string" && GIT_HASH.test(value.source.revision)),
      "event source revision is invalid",
    );
    if (!["local", "ci"].includes(value.environment)) {
      add(errors, typeof value.source.revision === "string", "managed event requires an exact source revision");
    }
  }

  const correlationKeys = [
    "requestId",
    "traceId",
    "spanId",
    "parentSpanId",
    "actorDigest",
    "jobId",
    "attemptId",
    "providerCallId",
    "deploymentId",
  ];
  if (!exactKeys(value.correlation, correlationKeys)) {
    errors.push("event correlation must contain only the v3 allowlist");
    return errors;
  }
  const correlation = value.correlation;
  add(
    errors,
    correlation.requestId === null ||
      (typeof correlation.requestId === "string" && UUID_V4.test(correlation.requestId)),
    "event requestId is invalid",
  );
  add(errors, typeof correlation.traceId === "string" && TRACE_ID.test(correlation.traceId), "event traceId is invalid");
  add(errors, typeof correlation.spanId === "string" && SPAN_ID.test(correlation.spanId), "event spanId is invalid");
  add(
    errors,
    correlation.parentSpanId === null ||
      (typeof correlation.parentSpanId === "string" && SPAN_ID.test(correlation.parentSpanId)),
    "event parentSpanId is invalid",
  );
  add(errors, correlation.actorDigest === null, "event actorDigest is unsupported");
  add(
    errors,
    correlation.jobId === null ||
      (typeof correlation.jobId === "string" && JOB_ID.test(correlation.jobId)),
    "event jobId is invalid",
  );
  add(
    errors,
    correlation.attemptId === null ||
      (typeof correlation.attemptId === "string" && UUID_V4.test(correlation.attemptId)),
    "event attemptId is invalid",
  );
  add(
    errors,
    correlation.providerCallId === null ||
      (typeof correlation.providerCallId === "string" && PROVIDER_CALL_ID.test(correlation.providerCallId)),
    "event providerCallId is invalid",
  );
  add(
    errors,
    correlation.deploymentId === null ||
      (typeof correlation.deploymentId === "string" && DEPLOYMENT_ID.test(correlation.deploymentId)),
    "event deploymentId is invalid",
  );
  if (["local", "ci"].includes(value.environment)) {
    add(errors, correlation.deploymentId === null, "unmanaged event cannot claim deploymentId authority");
  } else {
    add(errors, typeof correlation.deploymentId === "string", "managed event requires deploymentId authority");
  }

  if (value.eventName === "gateway.request.completed") {
    add(
      errors,
      value.service === "gateway" && value.source?.component === "packages/gateway",
      "gateway event service/source is invalid",
    );
    add(errors, typeof correlation.requestId === "string", "gateway event requires requestId authority");
    for (const field of ["parentSpanId", "jobId", "attemptId", "providerCallId"]) {
      add(errors, correlation[field] === null, `gateway event ${field} must be null`);
    }
    if (!exactKeys(value.attributes, [
      "method",
      "route",
      "statusCode",
      "statusClass",
      "outcome",
      "durationMs",
    ])) {
      errors.push("gateway event attributes do not match the allowlist");
    } else {
      const attributes = value.attributes;
      add(errors, METHODS.has(attributes.method), "gateway event method is invalid");
      add(
        errors,
        typeof attributes.route === "string" && ROUTE.test(attributes.route),
        "gateway event route is invalid",
      );
      const validStatus = Number.isInteger(attributes.statusCode) &&
        attributes.statusCode >= 100 && attributes.statusCode <= 599;
      add(errors, validStatus, "gateway event statusCode is invalid");
      if (validStatus) {
        const outcome = gatewayOutcome(attributes.statusCode);
        add(errors, attributes.statusClass === `${Math.trunc(attributes.statusCode / 100)}xx`, "gateway event statusClass contradicts statusCode");
        add(errors, attributes.outcome === outcome, "gateway event outcome contradicts statusCode");
        add(errors, value.level === gatewayLevel(outcome), "gateway event level contradicts statusCode");
      }
      add(errors, finiteNumber(attributes.durationMs, 0, 3_600_000), "gateway event durationMs is invalid");
    }
  } else if (
    value.eventName === "worker.job.attempt.started" ||
    value.eventName === "worker.job.attempt.completed"
  ) {
    add(
      errors,
      value.service === "workers" && value.source?.component === "workers/forge_workers",
      "worker event service/source is invalid",
    );
    add(
      errors,
      (correlation.requestId === null) === (correlation.parentSpanId === null),
      "worker requestId and parentSpanId authority must be paired",
    );
    add(errors, typeof correlation.jobId === "string", "worker event requires jobId authority");
    add(errors, typeof correlation.attemptId === "string", "worker event requires attemptId authority");
    const completed = value.eventName === "worker.job.attempt.completed";
    const expectedAttributes = completed
      ? ["task", "provider", "attempt", "outcome", "durationMs", "errorCode", "retryAfterSeconds"]
      : ["task", "provider", "attempt"];
    if (!exactKeys(value.attributes, expectedAttributes)) {
      errors.push("worker event attributes do not match the allowlist");
    } else {
      const attributes = value.attributes;
      add(errors, typeof attributes.task === "string" && TASK.test(attributes.task), "worker event task is invalid");
      add(errors, new Set(["local", "modal"]).has(attributes.provider), "worker event provider is invalid");
      add(
        errors,
        Number.isInteger(attributes.attempt) && attributes.attempt >= 1 && attributes.attempt <= 10,
        "worker event attempt is invalid",
      );
      if (!completed) {
        add(errors, value.level === "info", "worker start level must be info");
        add(errors, correlation.providerCallId === null, "worker start cannot claim providerCallId authority");
      } else {
        const levels = {
          succeeded: "info",
          "retry-scheduled": "warn",
          failed: "error",
          discarded: "warn",
        };
        add(errors, Object.hasOwn(levels, attributes.outcome), "worker completion outcome is invalid");
        if (Object.hasOwn(levels, attributes.outcome)) {
          add(errors, value.level === levels[attributes.outcome], "worker completion level contradicts outcome");
        }
        add(errors, finiteNumber(attributes.durationMs, 0, 28_800_000), "worker completion durationMs is invalid");
        add(
          errors,
          attributes.errorCode === null ||
            (typeof attributes.errorCode === "string" && ERROR_CODE.test(attributes.errorCode)),
          "worker completion errorCode is invalid",
        );
        add(
          errors,
          attributes.retryAfterSeconds === null || finiteNumber(attributes.retryAfterSeconds, 0, 900),
          "worker completion retryAfterSeconds is invalid",
        );
        if (attributes.outcome === "succeeded") {
          add(errors, attributes.errorCode === null && attributes.retryAfterSeconds === null, "succeeded outcome cannot carry error or retry state");
        } else if (attributes.outcome === "retry-scheduled") {
          add(errors, typeof attributes.errorCode === "string" && typeof attributes.retryAfterSeconds === "number", "retry-scheduled outcome requires error and delay");
        } else if (attributes.outcome === "failed" || attributes.outcome === "discarded") {
          add(errors, typeof attributes.errorCode === "string" && attributes.retryAfterSeconds === null, `${attributes.outcome} outcome requires one error code and no retry delay`);
        }
        if (correlation.providerCallId !== null) {
          add(
            errors,
            attributes.provider === "modal" && attributes.task === "train.policy",
            "providerCallId is limited to persisted Modal train.policy completion",
          );
        }
      }
    }
  } else {
    errors.push("eventName is unsupported by the fixture transport");
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    errors.push("event must be JSON serializable");
  }
  if (serialized !== undefined) {
    add(
      errors,
      Buffer.byteLength(serialized, "utf8") <= MAX_OBSERVABILITY_EVENT_BYTES,
      "event exceeds 4096 bytes",
    );
  }
  return errors;
}

export function validateObservationDeliveryBatch(value) {
  const errors = [];
  if (!exactKeys(value, [
    "schemaVersion",
    "batchId",
    "createdAt",
    "eventSchemaVersion",
    "eventCount",
    "events",
  ])) return ["delivery batch must contain only the v1 top-level allowlist"];
  add(errors, value.schemaVersion === OBSERVABILITY_DELIVERY_BATCH_SCHEMA, "delivery batch schemaVersion is unsupported");
  add(errors, typeof value.batchId === "string" && UUID_V4.test(value.batchId), "delivery batch batchId is invalid");
  add(errors, canonicalTimestamp(value.createdAt), "delivery batch createdAt must be canonical UTC");
  add(errors, value.eventSchemaVersion === ACCEPTED_OBSERVABILITY_EVENT_SCHEMA, "delivery batch eventSchemaVersion is unsupported");
  add(
    errors,
    Array.isArray(value.events) && value.events.length >= 1 &&
      value.events.length <= MAX_OBSERVABILITY_EVENTS_PER_BATCH,
    "delivery batch events must contain 1..32 entries",
  );
  if (Array.isArray(value.events)) {
    add(
      errors,
      Number.isInteger(value.eventCount) && value.eventCount === value.events.length,
      "delivery batch eventCount must equal events length",
    );
    value.events.forEach((event, index) => {
      for (const error of validateObservationEvent(event)) errors.push(`events[${index}]: ${error}`);
    });
  }
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    errors.push("delivery batch must be JSON serializable");
  }
  if (serialized !== undefined) {
    add(
      errors,
      Buffer.byteLength(serialized, "utf8") <= MAX_OBSERVABILITY_BATCH_BYTES,
      `delivery batch exceeds ${MAX_OBSERVABILITY_BATCH_BYTES} bytes`,
    );
  }
  return errors;
}

export function createObservationDeliveryBatch(
  events,
  { batchId = randomUUID(), createdAt = new Date() } = {},
) {
  if (!Array.isArray(events)) {
    throw new Error("unsafe observability delivery batch refused: events must be an array");
  }
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw new Error("unsafe observability delivery batch refused: createdAt must be a valid Date");
  }
  const batch = {
    schemaVersion: OBSERVABILITY_DELIVERY_BATCH_SCHEMA,
    batchId,
    createdAt: createdAt.toISOString(),
    eventSchemaVersion: ACCEPTED_OBSERVABILITY_EVENT_SCHEMA,
    eventCount: events.length,
    events: [...events],
  };
  const errors = validateObservationDeliveryBatch(batch);
  if (errors.length > 0) throw new Error(`unsafe observability delivery batch refused: ${errors.join("; ")}`);
  return batch;
}

export function serializeObservationDeliveryBatch(batch) {
  const errors = validateObservationDeliveryBatch(batch);
  if (errors.length > 0) throw new Error(`unsafe observability delivery batch refused: ${errors.join("; ")}`);
  return JSON.stringify(batch);
}

export function validateFixtureEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return ["fixture collector endpoint is invalid"];
  }
  const errors = [];
  add(errors, url.protocol === "http:", "fixture collector must use loopback HTTP");
  add(errors, url.hostname === "127.0.0.1" || url.hostname === "[::1]", "fixture collector must use an exact loopback host");
  add(errors, url.username === "" && url.password === "", "fixture collector credentials are forbidden");
  add(errors, url.search === "", "fixture collector query is forbidden");
  add(errors, url.hash === "", "fixture collector fragment is forbidden");
  add(errors, url.port !== "", "fixture collector requires an explicit non-privileged port");
  if (url.port !== "") {
    const port = Number(url.port);
    add(errors, Number.isInteger(port) && port >= 1024 && port <= 65_535, "fixture collector port is invalid");
  }
  return errors;
}

export async function deliverObservationBatch(
  batch,
  {
    endpoint,
    fetchImpl = globalThis.fetch,
    timeoutMs = OBSERVABILITY_REQUEST_TIMEOUT_MS,
  },
) {
  const endpointErrors = validateFixtureEndpoint(endpoint);
  if (endpointErrors.length > 0) throw new Error(`fixture observability delivery refused: ${endpointErrors.join("; ")}`);
  if (typeof fetchImpl !== "function") throw new Error("fixture observability delivery refused: fetch is unavailable");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > OBSERVABILITY_REQUEST_TIMEOUT_MS) {
    throw new Error("fixture observability delivery refused: timeout exceeds the policy bound");
  }
  const body = serializeObservationDeliveryBatch(batch);
  const controller = new AbortController();
  let rejectTimeout;
  const timeout = new Promise((_, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectTimeout(new Error("fixture delivery deadline exceeded"));
  }, timeoutMs);
  let response;
  try {
    response = await Promise.race([
      fetchImpl(endpoint, {
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-forge-observability-contract": OBSERVABILITY_DELIVERY_BATCH_SCHEMA,
        },
        body,
      }),
      timeout,
    ]);
  } catch {
    clearTimeout(timer);
    throw new Error("fixture observability delivery failed before a bounded response");
  }
  if (!Number.isInteger(response?.status) || response.status < 100 || response.status > 599) {
    clearTimeout(timer);
    throw new Error("fixture observability delivery failed before a bounded response");
  }
  try {
    await Promise.race([
      Promise.resolve(response.body?.cancel?.()),
      timeout,
    ]);
  } catch {
    clearTimeout(timer);
    throw new Error("fixture observability delivery failed while discarding its response");
  }
  clearTimeout(timer);
  if (response.status < 200 || response.status > 299) {
    throw new Error(`fixture observability delivery refused status ${response.status}`);
  }
  return {
    outcome: "accepted",
    statusCode: response.status,
    batchId: batch.batchId,
    eventCount: batch.eventCount,
  };
}

export async function* boundedJsonLines(input) {
  const decoder = new StringDecoder("utf8");
  let pending = "";
  for await (const chunk of input) {
    pending += typeof chunk === "string" ? chunk : decoder.write(chunk);
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline).replace(/\r$/, "");
      pending = pending.slice(newline + 1);
      if (Buffer.byteLength(line, "utf8") > MAX_OBSERVABILITY_EVENT_BYTES) {
        throw new Error("fixture observability input refused: line exceeds 4096 bytes");
      }
      if (line.length > 0) yield line;
      newline = pending.indexOf("\n");
    }
    if (Buffer.byteLength(pending, "utf8") > MAX_OBSERVABILITY_EVENT_BYTES) {
      throw new Error("fixture observability input refused: line exceeds 4096 bytes");
    }
  }
  pending += decoder.end();
  const line = pending.replace(/\r$/, "");
  if (Buffer.byteLength(line, "utf8") > MAX_OBSERVABILITY_EVENT_BYTES) {
    throw new Error("fixture observability input refused: line exceeds 4096 bytes");
  }
  if (line.length > 0) yield line;
}

export async function deliverObservationLines(lines, options) {
  let buffered = [];
  let deliveredBatches = 0;
  let deliveredEvents = 0;
  const flush = async () => {
    if (buffered.length === 0) return;
    const batch = createObservationDeliveryBatch(buffered);
    await deliverObservationBatch(batch, options);
    deliveredBatches += 1;
    deliveredEvents += buffered.length;
    buffered = [];
  };
  for await (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > MAX_OBSERVABILITY_EVENT_BYTES) {
      throw new Error("fixture observability input refused: line exceeds 4096 bytes");
    }
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      throw new Error("fixture observability input refused: line is not JSON");
    }
    const errors = validateObservationEvent(event);
    if (errors.length > 0) throw new Error(`fixture observability input refused: ${errors.join("; ")}`);
    buffered.push(event);
    if (buffered.length === MAX_OBSERVABILITY_EVENTS_PER_BATCH) await flush();
  }
  await flush();
  if (deliveredEvents === 0) {
    throw new Error("fixture observability input refused: no events");
  }
  return { deliveredBatches, deliveredEvents };
}

export function validateObservabilityTransportPolicy(
  policy,
  batchSchema = loadJson(BATCH_SCHEMA_PATH),
  eventSchema = loadJson(EVENT_SCHEMA_PATH),
) {
  const errors = [];
  if (!exactKeys(policy, [
    "schemaVersion",
    "deliveryBatchVersion",
    "deliveryBatchSchema",
    "acceptedEventVersions",
    "decision",
    "status",
    "limits",
    "endpoint",
    "lifecycle",
    "managedCustodyRequirements",
    "maturity",
  ])) return ["transport policy keys are invalid"];
  add(errors, policy.schemaVersion === `forge-observability-transport-policy/${OBSERVABILITY_TRANSPORT_POLICY_VERSION}`, "transport policy schemaVersion is invalid");
  add(errors, policy.deliveryBatchVersion === OBSERVABILITY_DELIVERY_BATCH_VERSION, "transport policy deliveryBatchVersion is invalid");
  add(errors, policy.deliveryBatchSchema === "schema/forge-observability-delivery-batch.schema.json", "transport policy deliveryBatchSchema is invalid");
  add(errors, JSON.stringify(policy.acceptedEventVersions) === JSON.stringify(["3.0.0"]), "transport policy must accept only frozen event v3");
  add(errors, policy.decision === "D74", "transport policy must cite D74");
  add(errors, policy.status === "contract-fixture", "transport policy cannot claim maturity above contract-fixture");

  add(errors, exactKeys(policy.limits, ["maxEventBytes", "maxEventsPerBatch", "maxBatchBytes", "requestTimeoutMs", "automaticRetries", "durableSpoolBytes"]), "transport policy limits keys are invalid");
  add(errors, policy.limits?.maxEventBytes === MAX_OBSERVABILITY_EVENT_BYTES, "transport event byte bound is invalid");
  add(errors, policy.limits?.maxEventsPerBatch === MAX_OBSERVABILITY_EVENTS_PER_BATCH, "transport batch event bound is invalid");
  add(errors, policy.limits?.maxBatchBytes === MAX_OBSERVABILITY_BATCH_BYTES, "transport batch byte bound is invalid");
  add(errors, policy.limits?.requestTimeoutMs === OBSERVABILITY_REQUEST_TIMEOUT_MS, "transport timeout bound is invalid");
  add(errors, policy.limits?.automaticRetries === 0, "fixture transport retries must remain disabled");
  add(errors, policy.limits?.durableSpoolBytes === 0, "fixture transport durable spool must remain disabled");

  add(errors, exactKeys(policy.endpoint, ["method", "scheme", "authority", "credentials", "query", "fragment", "redirects", "contentType"]), "transport endpoint keys are invalid");
  add(errors, policy.endpoint?.method === "POST", "transport endpoint method is invalid");
  add(errors, policy.endpoint?.scheme === "http" && policy.endpoint?.authority === "loopback-only", "transport endpoint must remain loopback HTTP only");
  add(errors, policy.endpoint?.credentials === "forbidden", "transport endpoint credentials must remain forbidden");
  add(errors, policy.endpoint?.query === "forbidden" && policy.endpoint?.fragment === "forbidden", "transport endpoint URL metadata must remain forbidden");
  add(errors, policy.endpoint?.redirects === "refuse", "transport redirects must remain refused");
  add(errors, policy.endpoint?.contentType === "application/json", "transport content type is invalid");

  add(errors, exactKeys(policy.lifecycle, ["input", "buffer", "success", "failure", "invalidInput", "overflow", "partialAcknowledgement", "persistentRetentionSeconds", "productAuthority"]), "transport lifecycle keys are invalid");
  add(errors, policy.lifecycle?.input === "stdin-json-lines", "transport input boundary is invalid");
  add(errors, policy.lifecycle?.buffer === "process-memory-only", "transport buffer must remain memory-only");
  add(errors, policy.lifecycle?.success === "discard-after-2xx-response", "transport success lifecycle is invalid");
  add(errors, policy.lifecycle?.failure === "discard-batch-and-exit-nonzero", "transport failure lifecycle is invalid");
  add(errors, policy.lifecycle?.invalidInput === "refuse-before-delivery" && policy.lifecycle?.overflow === "refuse-before-delivery", "transport invalid/overflow behavior is invalid");
  add(errors, policy.lifecycle?.partialAcknowledgement === "unsupported", "partial acknowledgement must remain unsupported");
  add(errors, policy.lifecycle?.persistentRetentionSeconds === 0, "fixture persistent retention must remain zero");
  add(errors, policy.lifecycle?.productAuthority === "independent", "telemetry delivery must remain authority-independent");
  add(errors, JSON.stringify(policy.managedCustodyRequirements) === JSON.stringify(MANAGED_CUSTODY_REQUIREMENTS), "managed custody requirements are invalid");

  add(errors, exactKeys(policy.maturity, ["deliveryBatchContract", "boundedFixtureTransport", "externalCollector", "authenticatedTransport", "durableQueue", "managedCustody", "metricsBackend", "traceBackend", "dashboards", "alertRouting", "syntheticAlertDelivery", "managedSandbox", "live", "production"]), "transport maturity keys are invalid");
  add(errors, policy.maturity?.deliveryBatchContract === true, "delivery batch contract must be implemented");
  add(errors, policy.maturity?.boundedFixtureTransport === true, "bounded fixture transport must be implemented");
  for (const [name, value] of Object.entries(policy.maturity ?? {})) {
    if (!["deliveryBatchContract", "boundedFixtureTransport"].includes(name)) {
      add(errors, value === false, `${name} must remain false in D74`);
    }
  }

  add(errors, batchSchema?.additionalProperties === false, "delivery batch schema must deny extensions");
  add(errors, batchSchema?.properties?.schemaVersion?.const === OBSERVABILITY_DELIVERY_BATCH_SCHEMA, "delivery batch schema marker is invalid");
  add(errors, batchSchema?.properties?.eventSchemaVersion?.const === ACCEPTED_OBSERVABILITY_EVENT_SCHEMA, "delivery batch event marker is invalid");
  add(errors, batchSchema?.properties?.eventCount?.maximum === MAX_OBSERVABILITY_EVENTS_PER_BATCH, "delivery batch eventCount bound is invalid");
  add(errors, batchSchema?.properties?.events?.maxItems === MAX_OBSERVABILITY_EVENTS_PER_BATCH, "delivery batch events bound is invalid");
  add(errors, batchSchema?.properties?.events?.items?.$ref === "forge-observability-event.v3.schema.json", "delivery batch must reference frozen event v3");
  add(errors, eventSchema?.properties?.schemaVersion?.const === ACCEPTED_OBSERVABILITY_EVENT_SCHEMA, "referenced event schema marker is invalid");
  add(errors, eventSchema?.additionalProperties === false, "referenced event schema must deny extensions");
  return errors;
}

export function checkObservabilityTransportPolicy() {
  return validateObservabilityTransportPolicy(
    loadJson(POLICY_PATH),
    loadJson(BATCH_SCHEMA_PATH),
    loadJson(EVENT_SCHEMA_PATH),
  );
}

async function runCli() {
  const command = process.argv[2] ?? "check";
  if (command === "check") {
    const errors = checkObservabilityTransportPolicy();
    if (errors.length > 0) {
      for (const error of errors) console.error(`observability-transport: ${error}`);
      process.exitCode = 1;
    } else {
      console.log("observability-transport: D74 bounded loopback fixture delivery is coherent; managed custody and telemetry backends remain false");
    }
    return;
  }
  if (command !== "deliver" || process.argv[3] !== "--endpoint" || !process.argv[4] || process.argv.length !== 5) {
    console.error("usage: node scripts/observability-transport.mjs check | deliver --endpoint http://127.0.0.1:PORT/PATH");
    process.exitCode = 2;
    return;
  }
  try {
    const result = await deliverObservationLines(boundedJsonLines(process.stdin), {
      endpoint: process.argv[4],
    });
    console.error(`observability-transport: delivered ${result.deliveredEvents} event(s) in ${result.deliveredBatches} batch(es) to the loopback fixture`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "fixture observability delivery failed");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
