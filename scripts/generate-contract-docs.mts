#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildServer,
  type GatewayRouteObservation,
} from "../packages/gateway/src/server.js";

type JsonObject = Record<string, unknown>;

interface RouteDocumentation {
  method: string;
  path: string;
  summary: string;
  auth: "public" | "optional-session" | "session" | "optional-review" | "review-token";
  success: number[];
  maturity?: "contract" | "fixture" | "sandbox" | "live" | "field-proven";
}

interface DocumentationSource {
  schemaVersion: string;
  documentationVersion: string;
  gatewayApi: {
    versionSurface: string;
    status: string;
    defaultMaturity: "contract" | "fixture" | "sandbox" | "live" | "field-proven";
    routes: RouteDocumentation[];
  };
  events: JsonObject[];
  workerArtifacts: Array<{
    queueKind: string;
    artifactKinds: string[];
    maturity: "contract" | "fixture" | "sandbox" | "live" | "field-proven";
    notes?: string;
  }>;
  examples: Array<{ id: string; path: string; kind: string }>;
  guides: { migration: string; deprecations: string; compatibility: string };
}

interface CompatibilityMatrix {
  policyVersion: string;
  productVersion: string;
  status: string;
  surfaces: Record<string, JsonObject>;
  deprecation: JsonObject;
}

const checkOnly = process.argv.includes("--check");
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
process.env.NODE_ENV ??= "test";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeOrCheck(path: string, content: string): void {
  if (checkOnly) {
    requireValue(existsSync(path), `${path}: generated contract documentation is missing`);
    requireValue(
      readFileSync(path, "utf8") === content,
      `${path}: generated contract documentation drift; run pnpm docs:contracts`,
    );
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function methods(route: GatewayRouteObservation): string[] {
  return (Array.isArray(route.method) ? route.method : [route.method]).map((method) =>
    method.toUpperCase()
  );
}

function routeKey(method: string, path: string): string {
  if (path === "/auth" || path === "/auth/*") return `* ${path}`;
  return `${method.toUpperCase()} ${path}`;
}

function operationId(method: string, path: string): string {
  const suffix = path
    .replace(/^\//, "")
    .replace(/\*/g, "wildcard")
    .replace(/:([A-Za-z0-9_]+)/g, "-by-$1")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${method.toLowerCase()}-${suffix || "root"}`;
}

function openApiPath(path: string): string {
  return path
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\/\*$/, "/{path}");
}

function schemaObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function requestParameters(schema: JsonObject | null): JsonObject[] {
  if (!schema) return [];
  const result: JsonObject[] = [];
  for (const [locationKey, location] of [["params", "path"], ["querystring", "query"]] as const) {
    const target = schemaObject(schema[locationKey]);
    const properties = schemaObject(target?.properties);
    if (!target || !properties) continue;
    const required = new Set(Array.isArray(target.required) ? target.required.map(String) : []);
    for (const [name, propertySchema] of Object.entries(properties)) {
      result.push({
        name,
        in: location,
        required: location === "path" || required.has(name),
        schema: propertySchema,
      });
    }
  }
  return result;
}

function responseDescription(status: number): string {
  const descriptions: Record<number, string> = {
    200: "Successful response",
    201: "Resource created",
    202: "Request accepted for bounded asynchronous work",
    409: "Domain gate blocked the operation",
    422: "Structurally valid request refused by validation or safety policy",
  };
  return descriptions[status] ?? "Documented response";
}

function tagFor(path: string): string {
  if (path === "/healthz") return "health";
  if (path.startsWith("/auth")) return "auth";
  const segments = path.split("/").filter(Boolean);
  return segments[1] ?? "gateway";
}

function securityFor(auth: RouteDocumentation["auth"]): JsonObject[] | undefined {
  if (auth === "public") return undefined;
  if (auth === "optional-session") return [{ sessionCookie: [] }, {}];
  if (auth === "optional-review") return [{ reviewToken: [] }, {}];
  if (auth === "review-token") return [{ reviewToken: [] }];
  return [{ sessionCookie: [] }];
}

function responseContent(route: RouteDocumentation, status: number): JsonObject {
  if (route.path === "/v1/generate/stream" && status === 200) {
    return { "text/event-stream": { schema: { type: "string" } } };
  }
  if (route.path === "/v1/schema" && status === 200) {
    return { "application/schema+json": { schema: { type: "object" } } };
  }
  return {
    "application/json": {
      schema: { type: "object", additionalProperties: true },
    },
  };
}

function versionedResponseSurface(route: RouteDocumentation): string | undefined {
  const surfaces: Record<string, string> = {
    "GET /v1/account/export": "userDataExport",
    "DELETE /v1/account": "accountDeletionReceipt",
    "GET /v1/data-lifecycle/policy": "dataLifecycle",
    "GET /v1/account/lifecycle": "dataLifecycle",
    "GET /v1/consents": "consentLedger",
    "POST /v1/consents": "consentLedger",
    "POST /v1/validate": "validatorReport",
    "POST /v1/generate/stream": "gatewayEvents",
    "GET /v1/jobs/:id/events": "workerArtifacts",
    "GET /v1/replays": "replay",
    "POST /v1/replays": "replay",
    "GET /v1/schema": "modelSpec",
  };
  return surfaces[`${route.method} ${route.path}`];
}

function markdownEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

const source = readJson<DocumentationSource>("contracts/documentation.json");
const compatibility = readJson<CompatibilityMatrix>("compatibility/compatibility.json");
const gatewayPackage = readJson<{ version: string }>("packages/gateway/package.json");
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

requireValue(source.schemaVersion === "forge-contract-documentation.v1", "unsupported documentation source schema");
requireValue(semver.test(source.documentationVersion), "documentationVersion must be SemVer");
requireValue(source.gatewayApi.routes.length > 0, "gateway route documentation cannot be empty");

for (const name of ["gatewayApi", "gatewayEvents", "workerArtifacts"]) {
  requireValue(compatibility.surfaces[name], `compatibility matrix is missing ${name}`);
}
for (const name of ["gatewayApi", "gatewayEvents"]) {
  requireValue(
    compatibility.surfaces[name].current === gatewayPackage.version,
    `${name} version must match the gateway package before 1.0`,
  );
}

const observed: GatewayRouteObservation[] = [];
const app = buildServer({
  rateLimitPolicy: null,
  observeRoute: (route) => observed.push(route),
});
await app.ready();
await app.close();

const observedKeys = new Set<string>();
const observedSchemas = new Map<string, JsonObject>();
for (const route of observed) {
  for (const method of methods(route)) {
    if (method === "HEAD" || method === "OPTIONS") continue;
    const key = routeKey(method, route.url);
    observedKeys.add(key);
    const schema = schemaObject(route.schema);
    if (schema && !observedSchemas.has(key)) observedSchemas.set(key, schema);
  }
}

const documentedKeys = new Set<string>();
for (const route of source.gatewayApi.routes) {
  requireValue(route.summary.trim().length >= 12, `${route.method} ${route.path}: summary is too short`);
  requireValue(route.success.length > 0, `${route.method} ${route.path}: response status list is empty`);
  const key = routeKey(route.method, route.path);
  requireValue(!documentedKeys.has(key), `${key}: duplicate route documentation`);
  documentedKeys.add(key);
}
const undocumentedRoutes = [...observedKeys].filter((key) => !documentedKeys.has(key)).sort();
const unregisteredRoutes = [...documentedKeys].filter((key) => !observedKeys.has(key)).sort();
requireValue(
  undocumentedRoutes.length === 0,
  `runtime routes are undocumented: ${undocumentedRoutes.join(", ")}`,
);
requireValue(
  unregisteredRoutes.length === 0,
  `documented routes are not registered: ${unregisteredRoutes.join(", ")}`,
);

const queueKinds = compatibility.surfaces.workerArtifacts.queueKinds;
requireValue(Array.isArray(queueKinds), "workerArtifacts.queueKinds must be an array");
requireValue(
  JSON.stringify(source.workerArtifacts.map((item) => item.queueKind)) === JSON.stringify(queueKinds),
  "documented worker artifact queue kinds must exactly match the compatibility matrix",
);

const generationSource = readFileSync("packages/gateway/src/server.ts", "utf8");
const workerQueueSource = readFileSync("workers/forge_workers/queue.py", "utf8");
for (const event of ["start", "complete", "error"]) {
  requireValue(generationSource.includes(`sse("${event}"`), `generation SSE event ${event} is not emitted`);
}
requireValue(
  readFileSync("packages/gateway/src/generation.ts", "utf8").includes('emit("stage"'),
  "generation stage event is not emitted",
);
const generationImplementation = readFileSync("packages/gateway/src/generation.ts", "utf8");
const generationEvent = source.events.find((event) => event.id === "generation-sse");
const documentedStageEvent = Array.isArray(generationEvent?.events)
  ? (generationEvent.events as JsonObject[]).find((event) => event.name === "stage")
  : undefined;
for (const stage of Array.isArray(documentedStageEvent?.stageValues) ? documentedStageEvent.stageValues : []) {
  requireValue(
    generationImplementation.includes(`stage: "${String(stage)}"`),
    `documented generation stage ${String(stage)} is not emitted`,
  );
}
for (const event of ["started", "retry-scheduled", "succeeded", "failed", "discarded"]) {
  requireValue(workerQueueSource.includes(`"${event}"`), `job lifecycle event ${event} is not emitted`);
}

for (const example of source.examples) {
  requireValue(existsSync(example.path), `${example.id}: example path does not exist: ${example.path}`);
  const content = readFileSync(example.path, "utf8");
  requireValue(content.trim().length > 0, `${example.id}: example is empty`);
  if (example.path.endsWith(".json")) JSON.parse(content);
  if (example.kind === "event-stream") {
    requireValue(content.includes("event: start") && content.includes("event: complete"), `${example.id}: incomplete SSE example`);
  }
}
for (const guide of Object.values(source.guides)) {
  requireValue(existsSync(guide), `required guide is missing: ${guide}`);
}

const apiVersion = String(compatibility.surfaces.gatewayApi.current);
const eventVersion = String(compatibility.surfaces.gatewayEvents.current);
const workerVersion = String(compatibility.surfaces.workerArtifacts.current);
const openapiPaths: Record<string, JsonObject> = {};
const operationIds = new Set<string>();

for (const route of source.gatewayApi.routes) {
  const methodsToDocument = route.method === "*" ? ["GET", "POST"] : [route.method];
  const runtimeSchema = observedSchemas.get(routeKey(route.method, route.path)) ?? null;
  for (const method of methodsToDocument) {
    const path = openApiPath(route.path);
    const parameters = requestParameters(runtimeSchema);
    if (route.path.endsWith("/*") && !parameters.some((parameter) => parameter.in === "path" && parameter.name === "path")) {
      parameters.push({
        name: "path",
        in: "path",
        required: true,
        description: "Auth.js catch-all path beneath /auth.",
        schema: { type: "string", minLength: 1 },
      });
    }
    if (route.path === "/v1/generate" || route.path === "/v1/generate/stream") {
      parameters.push({
        name: "x-forge-anthropic-key",
        in: "header",
        required: false,
        description: "Ephemeral BYO provider key; required only when provider is anthropic and never persisted or reflected.",
        schema: { type: "string", minLength: 1 },
      });
    }
    const requestBodySchema = runtimeSchema ? runtimeSchema.body : undefined;
    const responses: Record<string, JsonObject> = {};
    for (const status of route.success) {
      responses[String(status)] = {
        description: responseDescription(status),
        content: responseContent(route, status),
      };
    }
    responses["400"] ??= { description: "Malformed or bounded-input refusal", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
    if (route.auth === "session" || route.auth === "review-token" || route.auth === "optional-review") {
      responses["401"] ??= { description: "Authentication or review authority required", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
    }
    responses["429"] ??= { description: "Rate limit exceeded", headers: { "Retry-After": { schema: { type: "integer", minimum: 0 } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
    responses["503"] ??= { description: "Required local service or configured adapter unavailable", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };

    const id = operationId(method, route.path);
    requireValue(!operationIds.has(id), `duplicate generated operationId: ${id}`);
    operationIds.add(id);
    for (const parameterName of [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1])) {
      requireValue(
        parameters.some((parameter) => parameter.in === "path" && parameter.name === parameterName),
        `${method} ${path}: generated path parameter ${parameterName} is undocumented`,
      );
    }
    const operation: JsonObject = {
      operationId: id,
      summary: route.summary,
      tags: [tagFor(route.path)],
      "x-forge-auth": route.auth,
      "x-forge-capability-maturity": route.maturity ?? source.gatewayApi.defaultMaturity,
      responses,
    };
    const responseSurface = versionedResponseSurface(route);
    if (responseSurface) {
      operation["x-forge-versioned-response"] = {
        surface: responseSurface,
        current: compatibility.surfaces[responseSurface].current,
      };
    }
    if (parameters.length > 0) operation.parameters = parameters;
    if (requestBodySchema !== undefined && method !== "GET") {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: requestBodySchema } },
      };
    }
    const security = securityFor(route.auth);
    if (security) operation.security = security;
    openapiPaths[path] ??= {};
    openapiPaths[path][method.toLowerCase()] = operation;
  }
}

const openapi = {
  openapi: "3.1.0",
  info: {
    title: "ForgedTTC gateway API",
    version: apiVersion,
    summary: "Versioned pre-1.0 internal API generated from registered Fastify routes and TypeBox request schemas.",
    description: "Contract/fixture documentation only. It does not imply a deployed, live, or field-proven service. Successful response bodies remain pre-1.0 and are intentionally open unless a separately versioned format governs them.",
  },
  servers: [{ url: "http://localhost:8080", description: "Local deterministic gateway" }],
  paths: openapiPaths,
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "authjs.session-token" },
      reviewToken: { type: "http", scheme: "bearer", description: "Production reviewer authority. Anonymous review mode exists only in the explicit single-user local fixture configuration." },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          detail: { type: "string" },
          code: { type: "string" },
        },
        additionalProperties: true,
      },
    },
  },
  "x-forge-documentation-version": source.documentationVersion,
  "x-forge-status": source.gatewayApi.status,
  "x-forge-route-count": source.gatewayApi.routes.length,
};

const eventCatalog = {
  schemaVersion: "forge-event-catalog.v1",
  catalogVersion: source.documentationVersion,
  gatewayEventVersion: eventVersion,
  capabilityBoundary: "contract/fixture; no deployed live event-service claim",
  events: source.events.map((event) => ({
    ...event,
    currentVersion: String(compatibility.surfaces[String(event.versionSurface)].current),
  })),
};

const artifactCatalog = {
  schemaVersion: "forge-artifact-catalog.v1",
  catalogVersion: source.documentationVersion,
  compatibilityPolicyVersion: compatibility.policyVersion,
  capabilityBoundary: "format documentation plus deterministic fixtures; provider, hardware, operations, and field maturity remain separate",
  formats: compatibility.surfaces,
  workerEnvelope: {
    version: workerVersion,
    externalPublicationRule: compatibility.surfaces.workerArtifacts.versionRule,
    families: source.workerArtifacts,
  },
};

const currentFiles = {
  openapi: `docs/contracts/openapi.v${apiVersion}.json`,
  events: `docs/contracts/events.v${eventVersion}.json`,
  artifacts: `docs/contracts/artifacts.v${workerVersion}.json`,
};
const bundleManifest = {
  schemaVersion: "forge-contract-docs-manifest.v1",
  documentationVersion: source.documentationVersion,
  compatibilityPolicyVersion: compatibility.policyVersion,
  current: currentFiles,
  sources: [
    "contracts/documentation.json",
    "compatibility/compatibility.json",
    "packages/gateway/src/server.ts",
    "packages/gateway/src/generation.ts",
    "packages/gateway/src/platform.ts",
    "workers/forge_workers/queue.py",
  ],
  examples: source.examples,
  guides: source.guides,
  regenerate: "pnpm docs:contracts",
  verify: "pnpm verify:docs-contracts",
};

const routeRows = source.gatewayApi.routes.map((route) =>
  `| \`${route.method} ${route.path}\` | ${markdownEscape(route.summary)} | ${route.auth} | ${(route.maturity ?? source.gatewayApi.defaultMaturity)} | ${route.success.join(", ")} |`
).join("\n");
const formatRows = Object.entries(compatibility.surfaces).map(([name, format]) =>
  `| \`${name}\` | ${String(format.current)} | ${Array.isArray(format.supported) ? format.supported.join(", ") : Array.isArray(format.supportedMajors) ? `major ${format.supportedMajors.join(", ")}` : "current line"} |`
).join("\n");
const workerRows = source.workerArtifacts.map((family) =>
  `| \`${family.queueKind}\` | ${family.artifactKinds.length > 0 ? family.artifactKinds.map((kind) => `\`${kind}\``).join(", ") : "none; structured internal result"} | ${family.maturity} |`
).join("\n");

const reference = `# API, event, and artifact reference\n\nThis file is generated by \`pnpm docs:contracts\`. Edit the runtime route schemas,\n[documentation source](../contracts/documentation.json), or\n[compatibility matrix](../compatibility/compatibility.json), then regenerate.\n\nThe reference is **contract/fixture evidence** for the pre-1.0 line. It does not claim\na deployed live service, provider operation, hardware authority, or field acceptance.\n\n## Current bundle\n\n- gateway API: ${apiVersion} — [OpenAPI 3.1](contracts/openapi.v${apiVersion}.json)\n- gateway events: ${eventVersion} — [event catalog](contracts/events.v${eventVersion}.json)\n- worker artifacts: ${workerVersion} — [artifact catalog](contracts/artifacts.v${workerVersion}.json)\n- [machine manifest](contracts/manifest.json)\n- [migration guide](API-MIGRATIONS.md)\n- [deprecation ledger](DEPRECATIONS.md)\n- [compatibility policy](COMPATIBILITY.md)\n\n## Authentication vocabulary\n\n- \`public\`: no session is required.\n- \`optional-session\`: anonymous and authenticated shapes are both supported.\n- \`optional-review\`: public reads are supported; non-public curation filters need reviewer authority.\n- \`session\`: an owner session is required and ownership is scoped server-side.\n- \`review-token\`: a constant-time checked owner/reviewer bearer token is required.\n\nProvider keys are accepted only by the dedicated generation header and are never part\nof the OpenAPI request body, persistence, examples, or response schemas.\n\n## Gateway routes\n\n| Route | Purpose | Auth | Maturity | Documented response statuses |\n|---|---|---|---|---|\n${routeRows}\n\nRequest bodies, path parameters, and query constraints in the OpenAPI document are\ntaken from the actual Fastify/TypeBox registrations. The verifier fails when a runtime\nroute is undocumented, a documented route disappears, a queue kind drifts, an event\nis no longer emitted, an example is invalid, or generated output is stale.\n\n## Versioned format domains\n\n| Surface | Current | Read support |\n|---|---:|---|\n${formatRows}\n\nThese versions are independent. A package version, ModelSpec version, report version,\nand document revision are never interchangeable. Consult the compatibility policy\nbefore changing any listed surface.\n\n## Worker artifact families\n\nWorker envelopes remain internal and follow worker package ${workerVersion}. Before a\nfamily is published externally it must gain an independent \`schemaVersion\`,\ncompatibility fixtures, migration/deprecation guidance, and a documented read policy.\n\n| Queue kind | Output artifact discriminator(s) | Maturity |\n|---|---|---|\n${workerRows}\n\n## Event behavior\n\nGeneration SSE emits one \`start\`, zero or more ordered \`stage\` records, then exactly\none terminal \`complete\` or \`error\`. Persisted job events are read in ascending\nnumeric \`id\` order and use \`started\`, \`retry-scheduled\`, \`succeeded\`, \`failed\`,\nor \`discarded\`. A discarded event means a stale, cancelled, or lease-losing attempt\ndid not gain authority to materialize output. See the event catalog for fields and\nstage values.\n\n## Examples\n\n${source.examples.map((example) => `- [${example.id}](${example.path.replace(/^docs\//, "")}) — ${example.kind}`).join("\n")}\n\nExamples contain synthetic identifiers and fixture evidence. They are safe shapes for\nclient tests, not evidence that a provider, production database, or hardware rig ran.\n`;

writeOrCheck(currentFiles.openapi, stableJson(openapi));
writeOrCheck(currentFiles.events, stableJson(eventCatalog));
writeOrCheck(currentFiles.artifacts, stableJson(artifactCatalog));
writeOrCheck("docs/contracts/manifest.json", stableJson(bundleManifest));
writeOrCheck("docs/API-EVENT-ARTIFACT-REFERENCE.md", reference);

console.log(
  `contract docs: ${source.gatewayApi.routes.length} routes, ${source.events.length} event families, ${source.workerArtifacts.length} worker families ${checkOnly ? "verified" : "generated"}`,
);
