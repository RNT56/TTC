#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OBSERVABILITY_POLICY_VERSION = "1.0.0";
export const OBSERVABILITY_EVENT_VERSION = "1.0.0";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIR, "..");
const POLICY_PATH = join(REPOSITORY_ROOT, "infra/observability/observability-policy.v1.json");
const SCHEMA_PATH = join(REPOSITORY_ROOT, "schema/forge-observability-event.schema.json");
const RUNTIME_PATH = join(REPOSITORY_ROOT, "packages/gateway/src/observability.ts");

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function exactKeys(errors, value, path, expected) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  add(errors, JSON.stringify(actual) === JSON.stringify(wanted), `${path} keys must be exactly ${wanted.join(", ")}`);
}

function sortedUnique(values) {
  return Array.isArray(values) &&
    new Set(values).size === values.length &&
    JSON.stringify(values) === JSON.stringify([...values].sort());
}

function exactSortedValues(errors, value, path, expected) {
  add(errors, sortedUnique(value), `${path} must be sorted and unique`);
  add(
    errors,
    JSON.stringify(value) === JSON.stringify(expected),
    `${path} must be exactly ${expected.join(", ")}`,
  );
}

export function validateObservabilityPolicy(policy, schema = loadJson(SCHEMA_PATH)) {
  const errors = [];
  exactKeys(errors, policy, "policy", [
    "schemaVersion",
    "eventVersion",
    "eventSchema",
    "decision",
    "status",
    "maxEventBytes",
    "headers",
    "trust",
    "eventNames",
    "requiredContext",
    "denyFields",
    "cardinality",
    "maturity",
  ]);
  add(errors, policy.schemaVersion === `forge-observability-policy/${OBSERVABILITY_POLICY_VERSION}`, "policy schemaVersion is invalid");
  add(errors, policy.eventVersion === OBSERVABILITY_EVENT_VERSION, "policy eventVersion is invalid");
  add(errors, policy.eventSchema === "schema/forge-observability-event.schema.json", "policy eventSchema is invalid");
  add(errors, policy.decision === "D71", "policy must cite D71");
  add(errors, policy.status === "contract-fixture", "policy cannot claim maturity above contract-fixture");
  add(errors, policy.maxEventBytes === 4096, "policy maxEventBytes must remain 4096");

  exactKeys(errors, policy.headers, "headers", [
    "responseRequestId",
    "responseTraceParent",
    "clientRequestIdAuthority",
    "clientTraceParentAuthority",
  ]);
  add(errors, policy.headers?.responseRequestId === "x-forge-request-id", "request ID response header is invalid");
  add(errors, policy.headers?.responseTraceParent === "traceparent", "trace response header is invalid");
  add(errors, policy.headers?.clientRequestIdAuthority === false, "clients must not control request IDs");
  add(errors, policy.headers?.clientTraceParentAuthority === false, "clients must not control root traces in this slice");

  exactKeys(errors, policy.trust, "trust", [
    "requestId",
    "traceId",
    "actorDigest",
    "jobId",
    "providerCallId",
    "deploymentId",
  ]);
  add(errors, policy.trust?.requestId === "server-generated-uuid-v4", "request identity trust is invalid");
  add(errors, policy.trust?.traceId === "server-generated-w3c-root", "trace identity trust is invalid");
  for (const name of ["actorDigest", "jobId", "providerCallId", "deploymentId"]) {
    add(errors, policy.trust?.[name] === "not-implemented", `${name} must remain an explicit nonclaim`);
  }
  add(errors, JSON.stringify(policy.eventNames) === JSON.stringify(["gateway.request.completed"]), "eventNames must contain only the implemented event");
  exactSortedValues(errors, policy.requiredContext, "requiredContext", [
    "clock.source",
    "clock.timezone",
    "environment",
    "occurredAt",
    "service",
    "serviceVersion",
    "source.component",
    "source.revision",
  ]);
  const deniedFields = [
    "authorization",
    "body",
    "cookie",
    "errorMessage",
    "headers",
    "modelBytes",
    "personalData",
    "presignedUrl",
    "prompt",
    "query",
    "secretReference",
    "telemetry",
    "url",
  ];
  exactSortedValues(errors, policy.denyFields, "denyFields", deniedFields);

  exactKeys(errors, policy.cardinality, "cardinality", ["allowedMetricLabels", "forbiddenMetricLabels"]);
  exactSortedValues(errors, policy.cardinality?.allowedMetricLabels, "allowedMetricLabels", [
    "environment",
    "eventName",
    "method",
    "outcome",
    "route",
    "service",
    "statusClass",
  ]);
  exactSortedValues(errors, policy.cardinality?.forbiddenMetricLabels, "forbiddenMetricLabels", [
    "actorDigest",
    "deploymentId",
    "jobId",
    "providerCallId",
    "requestId",
    "spanId",
    "traceId",
  ]);

  exactKeys(errors, policy.maturity, "maturity", [
    "gatewayRequestEvents",
    "workerPropagation",
    "jobPropagation",
    "providerPropagation",
    "desktopEvents",
    "metricsBackend",
    "traceBackend",
    "dashboards",
    "alertRouting",
    "syntheticAlertDelivery",
    "managedSandbox",
    "live",
    "production",
  ]);
  add(errors, policy.maturity?.gatewayRequestEvents === true, "gateway request events must be implemented");
  for (const [name, value] of Object.entries(policy.maturity ?? {})) {
    if (name !== "gatewayRequestEvents") add(errors, value === false, `${name} must remain false in the first slice`);
  }

  add(errors, schema?.properties?.schemaVersion?.const === `forge-observability-event/${OBSERVABILITY_EVENT_VERSION}`, "event schema marker is invalid");
  add(errors, schema?.additionalProperties === false, "event schema must deny top-level extensions");
  for (const section of ["clock", "source", "correlation", "attributes"]) {
    add(errors, schema?.properties?.[section]?.additionalProperties === false, `${section} schema must deny extensions`);
  }
  add(errors, schema?.properties?.eventName?.const === "gateway.request.completed", "event schema must admit only the implemented event");
  add(errors, schema?.properties?.serviceVersion?.const === "0.2.0", "event schema service version is invalid");
  add(
    errors,
    schema?.properties?.occurredAt?.pattern === "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    "event schema UTC timestamp pattern is invalid",
  );
  const runtime = readFileSync(RUNTIME_PATH, "utf8");
  add(errors, runtime.includes(`OBSERVABILITY_EVENT_VERSION = "${OBSERVABILITY_EVENT_VERSION}"`), "gateway runtime event version drifted");
  add(errors, runtime.includes('GATEWAY_OBSERVABILITY_SERVICE_VERSION = "0.2.0"'), "gateway runtime service version drifted");
  add(errors, runtime.includes("const MAX_EVENT_BYTES = 4_096"), "gateway runtime event size bound drifted");
  return errors;
}

export function checkObservabilityPolicy() {
  return validateObservabilityPolicy(loadJson(POLICY_PATH), loadJson(SCHEMA_PATH));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] ?? "check";
  if (command !== "check") {
    console.error("usage: node scripts/observability-policy.mjs check");
    process.exitCode = 2;
  } else {
    const errors = checkObservabilityPolicy();
    if (errors.length > 0) {
      for (const error of errors) console.error(`observability-policy: ${error}`);
      process.exitCode = 1;
    } else {
      console.log("observability-policy: D71 gateway contract/fixture is coherent; all downstream maturity claims remain false");
    }
  }
}
