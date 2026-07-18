import { randomBytes, randomUUID } from "node:crypto";

export const OBSERVABILITY_EVENT_VERSION = "1.0.0";
export const OBSERVABILITY_EVENT_SCHEMA = `forge-observability-event/${OBSERVABILITY_EVENT_VERSION}`;
export const GATEWAY_OBSERVABILITY_SERVICE_VERSION = "0.2.0";

export const OBSERVABILITY_ENVIRONMENTS = [
  "local",
  "ci",
  "sandbox",
  "staging",
  "production",
  "controlled-lab",
] as const;

export type ObservabilityEnvironment = (typeof OBSERVABILITY_ENVIRONMENTS)[number];
export type GatewayObservationSink = (event: GatewayRequestObservation) => void;

export interface GatewayObservabilityRuntimeContext {
  environment: ObservabilityEnvironment;
  sourceRevision: string | null;
}

export interface GatewayRequestCorrelation {
  requestId: string;
  traceId: string;
  spanId: string;
}

export interface GatewayRequestObservation {
  schemaVersion: typeof OBSERVABILITY_EVENT_SCHEMA;
  occurredAt: string;
  clock: {
    source: "system";
    timezone: "UTC";
  };
  level: "info" | "warn" | "error";
  eventName: "gateway.request.completed";
  service: "gateway";
  serviceVersion: typeof GATEWAY_OBSERVABILITY_SERVICE_VERSION;
  environment: ObservabilityEnvironment;
  source: {
    component: "packages/gateway";
    revision: string | null;
  };
  correlation: {
    requestId: string;
    traceId: string;
    spanId: string;
    parentSpanId: null;
    actorDigest: null;
    jobId: null;
    providerCallId: null;
    deploymentId: null;
  };
  attributes: {
    method: string;
    route: string;
    statusCode: number;
    statusClass: string;
    outcome: "success" | "client-error" | "server-error";
    durationMs: number;
  };
}

type Environment = Record<string, string | undefined>;
type ObservationOutput = { write(chunk: string): unknown };

const GIT_HASH = /^[a-f0-9]{40}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TRACE_ID = /^(?!0{32}$)[a-f0-9]{32}$/;
const SPAN_ID = /^(?!0{16}$)[a-f0-9]{16}$/;
const SAFE_ROUTE = /^(?:unmatched|\/[A-Za-z0-9_/:.*-]{0,255})$/;
const SAFE_METHOD = /^(?:DELETE|GET|HEAD|OPTIONS|PATCH|POST|PUT)$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_EVENT_BYTES = 4_096;

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: unknown, required: readonly string[]): value is Record<string, unknown> {
  return isObject(value) &&
    Object.keys(value).length === required.length &&
    required.every((key) => Object.hasOwn(value, key));
}

export function gatewayObservabilityRuntimeContext(
  env: Environment = process.env,
): GatewayObservabilityRuntimeContext {
  const requestedEnvironment = env.FORGE_DEPLOYMENT_ENVIRONMENT;
  const environment = OBSERVABILITY_ENVIRONMENTS.includes(requestedEnvironment as ObservabilityEnvironment)
    ? requestedEnvironment as ObservabilityEnvironment
    : "local";
  const revision = env.FORGE_SOURCE_REVISION;
  return {
    environment,
    sourceRevision: revision && GIT_HASH.test(revision) ? revision : null,
  };
}

export function newGatewayRequestCorrelation(
  requestId: string = newGatewayRequestId(),
): GatewayRequestCorrelation {
  return {
    requestId,
    traceId: randomBytes(16).toString("hex"),
    spanId: randomBytes(8).toString("hex"),
  };
}

export function newGatewayRequestId(): string {
  return randomUUID();
}

export function traceParent(correlation: GatewayRequestCorrelation): string {
  return `00-${correlation.traceId}-${correlation.spanId}-00`;
}

function requestOutcome(statusCode: number): GatewayRequestObservation["attributes"]["outcome"] {
  if (statusCode >= 500) return "server-error";
  if (statusCode >= 400) return "client-error";
  return "success";
}

export function createGatewayRequestObservation(input: {
  runtime: GatewayObservabilityRuntimeContext;
  correlation: GatewayRequestCorrelation;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  occurredAt?: Date;
}): GatewayRequestObservation {
  const statusCode = Math.trunc(input.statusCode);
  const durationMs = Math.round(Math.max(0, input.durationMs) * 1_000) / 1_000;
  const outcome = requestOutcome(statusCode);
  return {
    schemaVersion: OBSERVABILITY_EVENT_SCHEMA,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    clock: { source: "system", timezone: "UTC" },
    level: outcome === "server-error" ? "error" : outcome === "client-error" ? "warn" : "info",
    eventName: "gateway.request.completed",
    service: "gateway",
    serviceVersion: GATEWAY_OBSERVABILITY_SERVICE_VERSION,
    environment: input.runtime.environment,
    source: {
      component: "packages/gateway",
      revision: input.runtime.sourceRevision,
    },
    correlation: {
      ...input.correlation,
      parentSpanId: null,
      actorDigest: null,
      jobId: null,
      providerCallId: null,
      deploymentId: null,
    },
    attributes: {
      method: input.method,
      route: input.route,
      statusCode,
      statusClass: `${Math.trunc(statusCode / 100)}xx`,
      outcome,
      durationMs,
    },
  };
}

export function validateGatewayRequestObservation(value: unknown): string[] {
  const errors: string[] = [];
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
  ])) return ["observation must contain only the versioned top-level allowlist"];
  if (value.schemaVersion !== OBSERVABILITY_EVENT_SCHEMA) errors.push("schemaVersion is unsupported");
  if (
    typeof value.occurredAt !== "string" ||
    !ISO_UTC.test(value.occurredAt) ||
    !Number.isFinite(Date.parse(value.occurredAt)) ||
    new Date(value.occurredAt).toISOString() !== value.occurredAt
  ) {
    errors.push("occurredAt must be a bounded UTC timestamp");
  }
  if (!exactKeys(value.clock, ["source", "timezone"]) || value.clock.source !== "system" || value.clock.timezone !== "UTC") {
    errors.push("clock must bind the system UTC source");
  }
  if (!new Set(["info", "warn", "error"]).has(String(value.level))) errors.push("level is invalid");
  if (value.eventName !== "gateway.request.completed") errors.push("eventName is unsupported");
  if (value.service !== "gateway" || value.serviceVersion !== GATEWAY_OBSERVABILITY_SERVICE_VERSION) {
    errors.push("service identity/version is invalid");
  }
  if (!OBSERVABILITY_ENVIRONMENTS.includes(value.environment as ObservabilityEnvironment)) {
    errors.push("environment is invalid");
  }
  if (!exactKeys(value.source, ["component", "revision"]) || value.source.component !== "packages/gateway") {
    errors.push("source must contain only the gateway component and revision");
  } else if (value.source.revision !== null && (typeof value.source.revision !== "string" || !GIT_HASH.test(value.source.revision))) {
    errors.push("source revision must be a Git hash or null");
  } else if (!["local", "ci"].includes(String(value.environment)) && value.source.revision === null) {
    errors.push("managed-environment observations require an exact source revision");
  }
  if (!exactKeys(value.correlation, [
    "requestId",
    "traceId",
    "spanId",
    "parentSpanId",
    "actorDigest",
    "jobId",
    "providerCallId",
    "deploymentId",
  ])) {
    errors.push("correlation must contain only the bounded correlation allowlist");
  } else {
    if (typeof value.correlation.requestId !== "string" || !UUID_V4.test(value.correlation.requestId)) errors.push("requestId is invalid");
    if (typeof value.correlation.traceId !== "string" || !TRACE_ID.test(value.correlation.traceId)) errors.push("traceId is invalid");
    if (typeof value.correlation.spanId !== "string" || !SPAN_ID.test(value.correlation.spanId)) errors.push("spanId is invalid");
    for (const field of ["parentSpanId", "actorDigest", "jobId", "providerCallId", "deploymentId"] as const) {
      if (value.correlation[field] !== null) errors.push(`${field} is not implemented in this gateway-only slice`);
    }
  }
  if (!exactKeys(value.attributes, ["method", "route", "statusCode", "statusClass", "outcome", "durationMs"])) {
    errors.push("attributes must contain only the request-completion allowlist");
  } else {
    const statusCode = value.attributes.statusCode;
    if (typeof value.attributes.method !== "string" || !SAFE_METHOD.test(value.attributes.method)) errors.push("method is invalid");
    if (typeof value.attributes.route !== "string" || !SAFE_ROUTE.test(value.attributes.route)) errors.push("route must be a bounded template without a query");
    if (typeof statusCode !== "number" || !Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
      errors.push("statusCode is invalid");
    } else {
      const outcome = requestOutcome(statusCode);
      const level = outcome === "server-error" ? "error" : outcome === "client-error" ? "warn" : "info";
      if (value.attributes.statusClass !== `${Math.trunc(statusCode / 100)}xx`) errors.push("statusClass is invalid");
      if (value.attributes.outcome !== outcome) errors.push("outcome contradicts statusCode");
      if (value.level !== level) errors.push("level contradicts statusCode");
    }
    if (!new Set(["success", "client-error", "server-error"]).has(String(value.attributes.outcome))) errors.push("outcome is invalid");
    if (typeof value.attributes.durationMs !== "number" || !Number.isFinite(value.attributes.durationMs) || value.attributes.durationMs < 0 || value.attributes.durationMs > 3_600_000) {
      errors.push("durationMs is invalid");
    }
  }
  return errors;
}

export function serializeGatewayRequestObservation(event: GatewayRequestObservation): string {
  const errors = validateGatewayRequestObservation(event);
  if (errors.length > 0) throw new Error(`unsafe observability event refused: ${errors.join("; ")}`);
  const serialized = JSON.stringify(event);
  if (Buffer.byteLength(serialized, "utf8") > MAX_EVENT_BYTES) {
    throw new Error("unsafe observability event refused: serialized event exceeds 4096 bytes");
  }
  return serialized;
}

export function createStdoutObservationSink(
  output: ObservationOutput = process.stdout,
): GatewayObservationSink {
  return (event) => {
    output.write(`${serializeGatewayRequestObservation(event)}\n`);
  };
}
