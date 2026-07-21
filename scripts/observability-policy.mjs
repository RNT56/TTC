#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OBSERVABILITY_POLICY_VERSION = "3.0.0";
export const OBSERVABILITY_EVENT_VERSION = "3.0.0";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIR, "..");
const POLICY_PATH = join(REPOSITORY_ROOT, "infra/observability/observability-policy.v3.json");
const SCHEMA_PATH = join(REPOSITORY_ROOT, "schema/forge-observability-event.v3.schema.json");
const RUNTIME_PATH = join(REPOSITORY_ROOT, "packages/gateway/src/observability.ts");
const WORKER_RUNTIME_PATH = join(REPOSITORY_ROOT, "workers/forge_workers/observability.py");

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
    "legacyEventSchemas",
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
  add(errors, policy.eventSchema === "schema/forge-observability-event.v3.schema.json", "policy eventSchema is invalid");
  add(
    errors,
    JSON.stringify(policy.legacyEventSchemas) === JSON.stringify([
      "schema/forge-observability-event.schema.json",
      "schema/forge-observability-event.v2.schema.json",
    ]),
    "legacyEventSchemas must retain the D71 v1 and D72 v2 schemas",
  );
  add(errors, policy.decision === "D73", "policy must cite D73");
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
    "attemptId",
    "providerCallId",
    "deploymentId",
  ]);
  add(
    errors,
    policy.trust?.requestId === "server-generated-gateway-uuid-v4-or-null-for-non-request-jobs",
    "request identity trust is invalid",
  );
  add(errors, policy.trust?.traceId === "server-generated-gateway-or-job-root", "trace identity trust is invalid");
  add(errors, policy.trust?.jobId === "database-owned-job-id", "job identity trust is invalid");
  add(
    errors,
    policy.trust?.attemptId === "database-generated-uuid-v4-per-d38-claim",
    "attempt identity trust is invalid",
  );
  add(errors, policy.trust?.actorDigest === "not-implemented", "actorDigest must remain an explicit nonclaim");
  add(
    errors,
    policy.trust?.providerCallId === "persisted-modal-function-call-id-for-train-policy-completion-or-null",
    "providerCallId trust is invalid",
  );
  add(
    errors,
    policy.trust?.deploymentId === "active-d68-manifest-id-for-managed-gateway-workers-or-null-local-ci",
    "deploymentId trust is invalid",
  );
  add(
    errors,
    JSON.stringify(policy.eventNames) === JSON.stringify([
      "gateway.request.completed",
      "worker.job.attempt.completed",
      "worker.job.attempt.started",
    ]),
    "eventNames must contain exactly the implemented events",
  );
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
  exactSortedValues(errors, policy.denyFields, "denyFields", deniedFields);

  exactKeys(errors, policy.cardinality, "cardinality", ["allowedMetricLabels", "forbiddenMetricLabels"]);
  exactSortedValues(errors, policy.cardinality?.allowedMetricLabels, "allowedMetricLabels", [
    "environment",
    "eventName",
    "method",
    "outcome",
    "provider",
    "route",
    "service",
    "statusClass",
    "task",
  ]);
  exactSortedValues(errors, policy.cardinality?.forbiddenMetricLabels, "forbiddenMetricLabels", [
    "actorDigest",
    "attemptId",
    "deploymentId",
    "jobId",
    "providerCallId",
    "requestId",
    "spanId",
    "traceId",
  ]);

  exactKeys(errors, policy.maturity, "maturity", [
    "gatewayRequestEvents",
    "jobPropagation",
    "workerPropagation",
    "persistentAttemptEvidence",
    "providerPropagation",
    "deploymentPropagation",
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
  add(errors, policy.maturity?.jobPropagation === true, "job propagation must be implemented");
  add(errors, policy.maturity?.workerPropagation === true, "worker propagation must be implemented");
  add(errors, policy.maturity?.persistentAttemptEvidence === true, "persistent attempt evidence must be implemented");
  add(errors, policy.maturity?.providerPropagation === true, "bounded Modal training provider propagation must be implemented");
  add(errors, policy.maturity?.deploymentPropagation === true, "D68 deployment propagation must be implemented");
  for (const [name, value] of Object.entries(policy.maturity ?? {})) {
    if (![
      "gatewayRequestEvents",
      "jobPropagation",
      "workerPropagation",
      "persistentAttemptEvidence",
      "providerPropagation",
      "deploymentPropagation",
    ].includes(name)) {
      add(errors, value === false, `${name} must remain false in the current slice`);
    }
  }

  add(errors, schema?.properties?.schemaVersion?.const === `forge-observability-event/${OBSERVABILITY_EVENT_VERSION}`, "event schema marker is invalid");
  add(errors, schema?.additionalProperties === false, "event schema must deny top-level extensions");
  for (const section of ["clock", "source", "correlation"]) {
    add(errors, schema?.properties?.[section]?.additionalProperties === false, `${section} schema must deny extensions`);
  }
  for (const definition of ["gatewayRequestAttributes", "workerAttemptStartedAttributes", "workerAttemptCompletedAttributes"]) {
    add(errors, schema?.$defs?.[definition]?.additionalProperties === false, `${definition} schema must deny extensions`);
  }
  add(
    errors,
    JSON.stringify(schema?.properties?.eventName?.enum) === JSON.stringify([
      "gateway.request.completed",
      "worker.job.attempt.started",
      "worker.job.attempt.completed",
    ]),
    "event schema event names are invalid",
  );
  add(errors, schema?.properties?.serviceVersion?.const === "0.2.0", "event schema service version is invalid");
  add(
    errors,
    schema?.properties?.occurredAt?.pattern === "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$",
    "event schema UTC timestamp pattern is invalid",
  );
  add(
    errors,
    schema?.$defs?.providerCallId?.pattern === "^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$",
    "providerCallId schema bound is invalid",
  );
  add(
    errors,
    schema?.$defs?.deploymentId?.pattern === "^[a-z0-9][a-z0-9-]{2,62}$",
    "deploymentId schema bound is invalid",
  );
  const schemaRules = Array.isArray(schema?.allOf) ? schema.allOf : [];
  const environmentRule = schemaRules.find(
    (rule) => JSON.stringify(rule?.if?.properties?.environment?.enum) === JSON.stringify(["local", "ci"]),
  );
  add(
    errors,
    environmentRule?.then?.properties?.correlation?.properties?.deploymentId?.type === "null" &&
      environmentRule?.else?.properties?.correlation?.properties?.deploymentId?.$ref === "#/$defs/deploymentId",
    "deploymentId environment authority rule is invalid",
  );
  const gatewayRule = schemaRules.find(
    (rule) => rule?.if?.properties?.eventName?.const === "gateway.request.completed",
  );
  add(
    errors,
    gatewayRule?.then?.properties?.correlation?.properties?.providerCallId?.type === "null",
    "gateway providerCallId authority rule is invalid",
  );
  const startedRule = schemaRules.find(
    (rule) => rule?.if?.properties?.eventName?.const === "worker.job.attempt.started",
  );
  add(
    errors,
    startedRule?.then?.properties?.correlation?.properties?.providerCallId?.type === "null",
    "worker-start providerCallId authority rule is invalid",
  );
  const providerRule = schemaRules.find(
    (rule) => rule?.if?.properties?.correlation?.properties?.providerCallId?.$ref === "#/$defs/providerCallId",
  );
  add(
    errors,
    providerRule?.then?.properties?.eventName?.const === "worker.job.attempt.completed" &&
      providerRule?.then?.properties?.attributes?.properties?.task?.const === "train.policy" &&
      providerRule?.then?.properties?.attributes?.properties?.provider?.const === "modal",
    "providerCallId completion authority rule is invalid",
  );
  const runtime = readFileSync(RUNTIME_PATH, "utf8");
  add(errors, runtime.includes(`OBSERVABILITY_EVENT_VERSION = "${OBSERVABILITY_EVENT_VERSION}"`), "gateway runtime event version drifted");
  add(errors, runtime.includes('GATEWAY_OBSERVABILITY_SERVICE_VERSION = "0.2.0"'), "gateway runtime service version drifted");
  add(errors, runtime.includes("const MAX_EVENT_BYTES = 4_096"), "gateway runtime event size bound drifted");
  const workerRuntime = readFileSync(WORKER_RUNTIME_PATH, "utf8");
  add(errors, workerRuntime.includes(`OBSERVABILITY_EVENT_VERSION = "${OBSERVABILITY_EVENT_VERSION}"`), "worker runtime event version drifted");
  add(errors, workerRuntime.includes('WORKER_OBSERVABILITY_SERVICE_VERSION = "0.2.0"'), "worker runtime service version drifted");
  add(errors, workerRuntime.includes("MAX_OBSERVABILITY_EVENT_BYTES = 4_096"), "worker runtime event size bound drifted");
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
      console.log("observability-policy: D73 trusted D68 deployment and bounded Modal call correlation is coherent; external backends and live claims remain false");
    }
  }
}
