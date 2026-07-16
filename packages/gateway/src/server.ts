// FORGE gateway — thin, typed, boring (plan §6). Routes are schema-validated
// (TypeBox); heavy work goes to the queue or the validator binary; compute
// workers have no public surface.
import { Type } from "@sinclair/typebox";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  assertAuthConfiguration,
  assertTrustedRequestOrigin,
  getCurrentUser,
  handleAuthRequest,
  requestRateLimitIdentity,
  requireUser,
  type CurrentUser,
} from "./auth.js";
import { deleteUserData, exportUserData } from "./accountData.js";
import {
  CONSENT_POLICIES,
  CONSENT_PURPOSES,
  consentErrorResponse,
  listCurrentConsents,
  recordConsent,
  sourceBlobIdsFromPayload,
  withActiveConsents,
  type ConsentAction,
  type ConsentPurpose,
  type ConsentSubjectKind,
} from "./consent.js";
import {
  DATA_LIFECYCLE_FORMAT_VERSION,
  RETENTION_POLICIES,
  RETENTION_POLICY_VERSION,
  accountLifecycleStatus,
  lifecycleErrorResponse,
} from "./dataLifecycle.js";
import { gatewayDb, type GatewayDb } from "./db.js";
import { recordGeneratedArtifact } from "./generatedArtifacts.js";
import {
  ANTHROPIC_MODEL_PINS,
  buildGenerationContext,
  runGeneration,
  type AnthropicTransport,
  type GenerationArchetype,
  type GenerationMaterials,
  type GenerationProvider,
  type GenerationRequest,
  type GenerationValidator,
  type SynthesisAdapter,
} from "./generation.js";
import {
  listReviewQueue,
  recordReviewDecision,
  type ReviewDecision,
  type ReviewExportPolicy,
  type ReviewStatus,
} from "./reviewQueue.js";
import {
  assertJobKind,
  cancelOwnedJob,
  completeObjectBlobUpload,
  createJob,
  createModel,
  createPrintQuoteRequest,
  creditSummary,
  currentPlatformGate,
  editModel,
  getOwnedObjectBlob,
  getOwnedPolicyArtifact,
  getOwnedJob,
  getOwnedModel,
  getShare,
  insertModelFromGeneration,
  insertReplayArtifact,
  insertVendorOffer,
  jobCapabilities,
  latestBrief25Eval,
  listPlatformGates,
  listPhotoscanArtifacts,
  listPolicyArtifacts,
  listPrintQuoteRequests,
  listReplayArtifacts,
  listTelemetryLogs,
  listJobEvents,
  listJobs,
  listModels,
  listVendorOffers,
  recordMarketplaceUsageRollup,
  recordPlatformGateSignoff,
  recordUsageEvent,
  registerObjectBlob,
  shareModel,
  updatePhotoscanAlignment,
  validatorError,
  verifyReplayTape,
  type JobKind,
  MAX_POLICY_MODEL_BYTES,
  POLICY_DELIVERY_ARTIFACT_VERSION,
  type PlatformGateKey,
  type PlatformGateStatus,
} from "./platform.js";
import {
  deleteStoredObjects,
  inspectStoredObject,
  objectStorageConfigFromEnv,
  presignObjectAccess,
  putStoredObject,
  readStoredObject,
  type ObjectDeletionAdapter,
  type ObjectInspectionAdapter,
  type ObjectReadAdapter,
  type ObjectWriteAdapter,
} from "./objectStorage.js";
import {
  completeRecorderArchive,
  listRecorderArchives,
  stageRecorderArchive,
} from "./recorderArchives.js";
import {
  prohibitedBriefResponse,
  refuseProhibitedBrief,
  type ProhibitedBriefSurface,
} from "./safety.js";
import {
  DEFAULT_RATE_LIMIT_POLICY,
  DEFAULT_REQUEST_BODY_BYTES,
  InMemoryRateLimiter,
  MAX_OBJECT_BYTES,
  assertBoundedJson,
  constantTimeEqual,
  fetchBoundedJson,
  parseExternalHttpsUrl,
  redactSensitiveText,
  secretFingerprint,
  type RateLimitClass,
  type RateLimitPolicy,
} from "./security.js";
import { runBake, runBom, runEnvSpec, runValidator, validatorBin } from "./validator.js";

export interface ServerOptions {
  db?: GatewayDb;
  reviewToken?: string | null;
  generationMaterials?: GenerationMaterials;
  generationAdapter?: SynthesisAdapter;
  generationValidator?: GenerationValidator;
  anthropicTransport?: AnthropicTransport;
  anthropicBaseUrl?: string;
  persistGeneratedArtifacts?: boolean;
  deleteObjects?: ObjectDeletionAdapter;
  inspectObject?: ObjectInspectionAdapter;
  writeObject?: ObjectWriteAdapter;
  readObject?: ObjectReadAdapter;
  rateLimitPolicy?: RateLimitPolicy | null;
  rateLimitNow?: () => number;
  observeRoute?: (route: GatewayRouteObservation) => void;
}

export interface GatewayRouteObservation {
  method: string | string[];
  url: string;
  schema?: unknown;
}

const reviewStatusSchema = Type.Union([
  Type.Literal("needs_review"),
  Type.Literal("approved"),
  Type.Literal("rejected"),
]);

const reviewDecisionSchema = Type.Union([Type.Literal("approved"), Type.Literal("rejected")]);
const generationArchetypeSchema = Type.Union([
  Type.Literal("biped"),
  Type.Literal("multirotor"),
  Type.Literal("rover"),
  Type.Literal("arm"),
  Type.Literal("quadruped"),
  Type.Literal("fixedwing"),
]);
const generationProviderSchema = Type.Union([
  Type.Literal("template"),
  Type.Literal("anthropic"),
]);
const visibilitySchema = Type.Union([
  Type.Literal("private"),
  Type.Literal("unlisted"),
  Type.Literal("public"),
]);
const jobKindSchema = Type.Union([
  Type.Literal("etl.ingest-component"),
  Type.Literal("occt.tessellate"),
  Type.Literal("photoscan.single"),
  Type.Literal("photoscan.multiview"),
  Type.Literal("train.policy"),
  Type.Literal("train.offline-bc"),
  Type.Literal("train.sysid-fit"),
  Type.Literal("replay.verify"),
  Type.Literal("codesign.evaluate"),
  Type.Literal("bridge.config-diff"),
  Type.Literal("bridge.telemetry-ingest"),
  Type.Literal("bridge.supervisor-check"),
  Type.Literal("commerce.vendor-refresh"),
  Type.Literal("maintenance.estimate-wear"),
  Type.Literal("maintenance.crash-forensics"),
  Type.Literal("maintenance.repair-sheet"),
  Type.Literal("maintenance.fleet-summary"),
]);
const jobProviderSchema = Type.Union([
  Type.Literal("fixture"),
  Type.Literal("local"),
  Type.Literal("modal"),
]);
const blobAccessActionSchema = Type.Union([Type.Literal("upload"), Type.Literal("download")]);
const consentPurposeSchema = Type.Union(CONSENT_PURPOSES.map((purpose) => Type.Literal(purpose)));
const consentSubjectKindSchema = Type.Union([
  Type.Literal("account"),
  Type.Literal("object-blob"),
  Type.Literal("telemetry-log"),
  Type.Literal("model"),
]);
const consentActionSchema = Type.Union([Type.Literal("grant"), Type.Literal("withdraw")]);
const photoscanAxisSchema = Type.Union([Type.Literal("x"), Type.Literal("y"), Type.Literal("z")]);
const photoscanPortSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 80 }),
    kind: Type.String({ minLength: 1, maxLength: 80 }),
    axis: Type.Optional(photoscanAxisSchema),
    role: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
  },
  { additionalProperties: false },
);
const sha256Schema = Type.String({ pattern: "^[a-fA-F0-9]{64}$" });
const blobPurposeSchema = Type.String({ minLength: 1, maxLength: 80, pattern: "^[A-Za-z0-9._:-]+$" });
const recorderArchiveFileNames = [
  "forge-recorder-manifest.json",
  "telemetry.frames.jsonl",
  "telemetry.index.jsonl",
  "telemetry.replay.json",
  "forge-recorder-receipt.json",
] as const;
const recorderUploadFileSchema = Type.Object(
  {
    name: Type.Union([
      Type.Literal("forge-recorder-manifest.json"),
      Type.Literal("telemetry.frames.jsonl"),
      Type.Literal("telemetry.index.jsonl"),
      Type.Literal("telemetry.replay.json"),
      Type.Literal("forge-recorder-receipt.json"),
    ]),
    contentType: Type.Union([Type.Literal("application/json"), Type.Literal("application/x-ndjson")]),
    byteSize: Type.Integer({ minimum: 1, maximum: 512 * 1024 * 1024 }),
    sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  },
  { additionalProperties: false },
);
const recorderUploadPlanSchema = Type.Object(
  {
    schemaVersion: Type.Literal("forge-recorder-upload-plan/1.0.0"),
    archiveSchemaVersion: Type.Literal("forge-recorder-archive/1.0.0"),
    inspectionSchemaVersion: Type.Literal("forge-recorder-inspection/1.0.0"),
    artifactId: Type.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$" }),
    referenceRigId: Type.Union([
      Type.Literal("ref_quad_kakute-h7-source-one-5in"),
      Type.Literal("ref_rover_waveshare-ugv-rover-pt-pi5-ros2"),
    ]),
    contractHash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    lockfileHash: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    sourcePortSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    sampleRateHz: Type.Integer({ minimum: 1, maximum: 1_000 }),
    startedAtUnixMs: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    stoppedAtUnixMs: Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    frameCount: Type.Integer({ minimum: 1, maximum: 1_000_000 }),
    durationS: Type.Number({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
    captureMaturity: Type.Literal("local-serial-integration"),
    aggregateByteSize: Type.Integer({ minimum: 1, maximum: 512 * 1024 * 1024 }),
    files: Type.Array(recorderUploadFileSchema, { minItems: 5, maxItems: 5 }),
    localIntegrityVerified: Type.Literal(true),
    captureComplete: Type.Literal(true),
    captureConsentConfirmed: Type.Literal(true),
    userOwned: Type.Literal(true),
    sharingAuthorized: Type.Literal(false),
    trainingReuseAuthorized: Type.Literal(false),
    recordedDeviceAttested: Type.Literal(false),
    deviceIdentityVerified: Type.Literal(false),
    fieldSessionVerified: Type.Literal(false),
    noAutoArm: Type.Literal(true),
  },
  { additionalProperties: false },
);
const moderationReasonSchema = Type.Union([
  Type.Literal("safety"),
  Type.Literal("ip"),
  Type.Literal("spam"),
  Type.Literal("abuse"),
  Type.Literal("export-control"),
  Type.Literal("other"),
]);
const moderationStatusSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("triaged"),
  Type.Literal("actioned"),
  Type.Literal("rejected"),
]);
const moderationActionSchema = Type.Union([
  Type.Literal("none"),
  Type.Literal("delist-listing"),
]);
const moderationTargetSchema = Type.Union([
  Type.Literal("listing"),
  Type.Literal("course"),
  Type.Literal("share"),
  Type.Literal("model"),
  Type.Literal("policy"),
]);
const listingKindSchema = Type.Union([
  Type.Literal("model"),
  Type.Literal("course"),
  Type.Literal("skill"),
  Type.Literal("component"),
  Type.Literal("policy"),
]);
const listingStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("review"),
  Type.Literal("listed"),
  Type.Literal("rejected"),
  Type.Literal("delisted"),
]);
const licenseClassSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("attribution"),
  Type.Literal("no-redistribution"),
  Type.Literal("view-only"),
]);
const reviewExportPolicySchema = Type.Union([
  Type.Literal("full-geometry-ok"),
  Type.Literal("attribution-manifest-required"),
  Type.Literal("envelope-link-out"),
  Type.Literal("envelope-only"),
  Type.Literal("bom-only"),
  Type.Literal("blocked"),
  Type.Literal("assembly-policy-derived"),
]);
const platformGateKeySchema = Type.Union([
  Type.Literal("d28.hardware"),
  Type.Literal("p11.policy-sharing"),
  Type.Literal("p11.marketplace-economics"),
]);
const platformGateStatusSchema = Type.Union([
  Type.Literal("blocked"),
  Type.Literal("accepted"),
  Type.Literal("revoked"),
]);
const vendorAvailabilitySchema = Type.Union([
  Type.Literal("in-stock"),
  Type.Literal("backorder"),
  Type.Literal("out-of-stock"),
  Type.Literal("unknown"),
]);
const vendorOfferInputSchema = Type.Object(
  {
    componentId: Type.String({ minLength: 1, maxLength: 200 }),
    vendor: Type.String({ minLength: 1, maxLength: 120 }),
    sku: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    url: Type.String({ minLength: 1, maxLength: 2000 }),
    price: Type.Optional(Type.Number({ minimum: 0 })),
    currency: Type.Optional(Type.String({ pattern: "^[A-Za-z]{3}$" })),
    availability: Type.Optional(vendorAvailabilitySchema),
  },
  { additionalProperties: false },
);
const generationBodySchema = Type.Object(
  {
    prompt: Type.String({ minLength: 1, maxLength: 4000 }),
    archetype: Type.Optional(generationArchetypeSchema),
    categories: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 16 }),
    ),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    includePrefixText: Type.Optional(Type.Boolean()),
    provider: Type.Optional(generationProviderSchema),
    seed: Type.Optional(Type.Integer({ minimum: 0 })),
    maxRepairIterations: Type.Optional(Type.Integer({ minimum: 0, maximum: 3 })),
  },
  { additionalProperties: false },
);
const courseGenerationBodySchema = Type.Object(
  {
    prompt: Type.String({ minLength: 1, maxLength: 2000 }),
    name: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
    archetype: Type.Optional(generationArchetypeSchema),
    visibility: Type.Optional(visibilitySchema),
    provider: Type.Optional(Type.Literal("template")),
    seed: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

type CourseGenerationBody = {
  prompt: string;
  name?: string;
  archetype?: GenerationArchetype;
  visibility?: "private" | "unlisted" | "public";
  provider?: "template";
  seed?: number;
};

type CourseRow = {
  id: string;
  owner_user_id?: string | null;
  name: string;
  env_spec: unknown;
  validator_report: unknown;
  visibility: string;
  created_at: Date | string;
};

function unavailable(): { error: string; detail: string } {
  return { error: "service unavailable", detail: "request could not be completed" };
}

function routeError(error: unknown): { statusCode: number; body: unknown } {
  const safety = prohibitedBriefResponse(error);
  if (safety) return safety;
  const consent = consentErrorResponse(error);
  if (consent) return consent;
  const lifecycle = lifecycleErrorResponse(error);
  if (lifecycle) return lifecycle;
  const mapped = validatorError(error);
  if (mapped) return mapped;
  const statusCode = typeof (error as { statusCode?: unknown } | null)?.statusCode === "number"
    ? Number((error as { statusCode: number }).statusCode)
    : 503;
  if (statusCode >= 400 && statusCode < 500) {
    const message = error instanceof Error ? redactSensitiveText(error.message).slice(0, 300) : "request rejected";
    const candidateCode = (error as { code?: unknown } | null)?.code;
    const code = typeof candidateCode === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(candidateCode)
      ? candidateCode
      : null;
    return { statusCode, body: { error: message, ...(code ? { code } : {}) } };
  }
  return { statusCode: 503, body: unavailable() };
}

function reviewAuthorized(request: FastifyRequest, reviewToken: string | null): boolean {
  if (!reviewToken) return process.env.NODE_ENV !== "production";
  const authorization = request.headers.authorization;
  return typeof authorization === "string" && constantTimeEqual(authorization, `Bearer ${reviewToken}`);
}

function rateLimitClass(request: FastifyRequest): RateLimitClass {
  const path = request.url.split("?", 1)[0] ?? request.url;
  if (path === "/auth" || path.startsWith("/auth/")) return "auth";
  if (
    path.startsWith("/v1/generate") ||
    path === "/v1/courses/generate" ||
    (path.startsWith("/v1/models/") && path.endsWith("/edit"))
  ) return "generation";
  if (
    path.startsWith("/v1/jobs") ||
    path.startsWith("/v1/photoscan") ||
    path.startsWith("/v1/policies") ||
    path.startsWith("/v1/commerce/") ||
    path === "/v1/validate" ||
    path === "/v1/bake" ||
    path === "/v1/bom"
  ) return "job";
  if (path.startsWith("/v1/blobs")) return "object";
  return "public";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function leaderboardSlice(input: {
  archetype?: unknown;
  classKey?: unknown;
  verification?: Record<string, unknown>;
}): { archetype: string | null; classKey: string | null } {
  const verification = input.verification ?? {};
  const header = isRecord(verification.header) ? verification.header : {};
  const replayHeader = isRecord(verification.replayHeader) ? verification.replayHeader : {};
  const model = isRecord(verification.model) ? verification.model : {};
  return {
    archetype:
      optionalNonEmptyString(input.archetype) ??
      optionalNonEmptyString(verification.archetype) ??
      optionalNonEmptyString(header.archetype) ??
      optionalNonEmptyString(replayHeader.archetype) ??
      optionalNonEmptyString(model.archetype),
    classKey:
      optionalNonEmptyString(input.classKey) ??
      optionalNonEmptyString(verification.classKey) ??
      optionalNonEmptyString(verification.vehicleClass) ??
      optionalNonEmptyString(verification.class) ??
      optionalNonEmptyString(header.classKey) ??
      optionalNonEmptyString(replayHeader.classKey) ??
      optionalNonEmptyString(model.classKey),
  };
}

function mapCourse(row: CourseRow): {
  id: string;
  name: string;
  envSpec: unknown;
  validatorReport: unknown;
  visibility: string;
  createdAt: string;
} {
  return {
    id: row.id,
    name: row.name,
    envSpec: row.env_spec,
    validatorReport: row.validator_report,
    visibility: row.visibility,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "course";
}

function titleFromPrompt(prompt: string): string {
  const title = prompt.trim().split(/\s+/).slice(0, 8).join(" ");
  return title || "Generated course";
}

function courseTask(archetype: GenerationArchetype): string {
  switch (archetype) {
    case "arm":
      return "reach";
    case "biped":
      return "walk-to-target";
    case "quadruped":
      return "rough-terrain";
    case "rover":
      return "line-follow";
    case "fixedwing":
      return "waypoint-chain";
    case "multirotor":
      return "gate-slalom";
  }
}

function buildTemplateEnvSpec(body: CourseGenerationBody): Record<string, unknown> {
  const archetype = body.archetype ?? "multirotor";
  const seed = Math.max(0, Math.trunc(body.seed ?? 0));
  const prompt = body.prompt.trim();
  const hash = sha256(stableJson({ prompt, archetype, seed, kind: "envspec" }));
  const title = body.name?.trim() || `Generated ${archetype} - ${titleFromPrompt(prompt)}`;
  const airborne = archetype === "multirotor" || archetype === "fixedwing";
  const arm = archetype === "arm";
  const boundsM = arm ? [4, 4, 4] : [20, 6, 20];
  const gateY = airborne ? 1.2 : 0.5;
  const lateral = Number((((seed % 7) - 3) * 0.15).toFixed(3));
  const spawn = airborne ? [-4, 1, 0] : [0, 0, 0];
  const g1 = arm ? [1, 0.5, lateral] : [4, gateY, lateral];
  const g2 = arm ? [1.4, 0.65, 0.4 + lateral] : [7, gateY, 1.2 + lateral];
  return {
    schemaVersion: "1.0.0",
    id: `course-${slugify(title)}-${hash.slice(0, 10)}`,
    name: title,
    version: "1.0.0",
    kind: archetype === "rover" ? "rover" : "course",
    boundsM,
    provenance: {
      kind: "parametric-generator",
      promptHash: hash,
      modelVersion: "forge-course-template-p10-v1",
      provider: body.provider ?? "template",
      seed,
    },
    license: {
      id: "CC0-1.0",
      class: "open",
      terms: "Generated course template; no third-party course assets embedded.",
    },
    terrain: { kind: "flat", sizeM: arm ? [4, 4] : [20, 20] },
    tasks: [courseTask(archetype)],
    obstacles: [
      {
        id: "reference-block",
        centerM: arm ? [0.4, 0.4, -1] : [2.5, 0.45, -2.5],
        sizeM: arm ? [0.35, 0.8, 0.35] : [0.8, 0.9, 0.8],
      },
    ],
    gates: [
      { id: "g1", pose: { p: g1, r: [0, 0, 0] }, widthM: arm ? 0.45 : 1.2, heightM: arm ? 0.45 : 0.8 },
      { id: "g2", pose: { p: g2, r: [0, 0, 0] }, widthM: arm ? 0.45 : 1.2, heightM: arm ? 0.45 : 0.8 },
    ],
    spawns: [{ id: "start", pose: { p: spawn, r: [0, 0, 0] }, archetypeFilter: [archetype] }],
    win: { gateOrder: ["g1", "g2"], timeLimitS: airborne ? 45 : 90, contactPenalties: true },
    env: {
      wind: { meanMps: airborne ? 1.0 : 0.0, gustMps: airborne ? 0.5 : 0.0 },
      lighting: "studio",
    },
  };
}

function reportVerdict(report: unknown): string {
  return isRecord(report) && typeof report.verdict === "string" ? report.verdict : "rejected";
}

function diagnosticErrorCount(report: unknown): number {
  if (!isRecord(report) || !Array.isArray(report.results)) return 0;
  return report.results.filter((item) => isRecord(item) && item.severity === "error").length;
}

function scorecardValue(scorecard: unknown, field: string): number | null {
  if (!isRecord(scorecard)) return null;
  const value = scorecard[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function gradeClassroomSubmission(
  report: unknown,
  rubric: unknown,
  scorecard: unknown,
): { pass: boolean; score: number; reasons: string[]; validatorVerdict: string } {
  const rules = isRecord(rubric) ? rubric : {};
  const verdict = reportVerdict(report);
  const maxErrors = typeof rules.maxErrors === "number" ? Math.max(0, Math.trunc(rules.maxErrors)) : 0;
  const minScore = typeof rules.minScore === "number" ? rules.minScore : 0.8;
  const minSuccessRate = typeof rules.minSuccessRate === "number" ? rules.minSuccessRate : null;
  const reasons: string[] = [];
  const errors = diagnosticErrorCount(report);
  if (verdict !== "admitted") reasons.push(`validator verdict ${verdict}`);
  if (errors > maxErrors) reasons.push(`${errors} validator errors > ${maxErrors}`);
  const successRate = scorecardValue(scorecard, "successRate");
  if (minSuccessRate !== null && (successRate === null || successRate < minSuccessRate)) {
    reasons.push(`successRate ${successRate ?? "missing"} < ${minSuccessRate}`);
  }
  const score = reasons.length === 0 ? 1 : Math.max(0, verdict === "draft" ? 0.5 : 0.2);
  if (score < minScore) reasons.push(`score ${score.toFixed(2)} < ${minScore}`);
  return {
    pass: reasons.length === 0,
    score,
    reasons,
    validatorVerdict: verdict,
  };
}

function policySignoffAccepted(value: unknown): boolean {
  return isRecord(value) && value.accepted === true;
}

function generationApiKeyHeader(request: FastifyRequest): string | undefined {
  const value = request.headers["x-forge-anthropic-key"];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function executeGeneration(
  db: GatewayDb,
  body: GenerationRequest,
  request: FastifyRequest,
  options: ServerOptions,
  user: CurrentUser | null = null,
  surface: Extract<ProhibitedBriefSurface, "generation" | "stream"> = "generation",
  onEvent?: (event: string, data: unknown) => void,
): Promise<Awaited<ReturnType<typeof runGeneration>>> {
  const generationRequest: GenerationRequest = {
    ...body,
    provider: (body.provider ?? "template") as GenerationProvider,
    anthropicApiKey: generationApiKeyHeader(request),
  };
  await refuseProhibitedBrief(db, generationRequest.prompt, {
    surface,
    ownerUserId: user?.id ?? null,
    provider: generationRequest.provider ?? null,
    archetype: generationRequest.archetype ?? null,
  });
  const result = await runGeneration(db, generationRequest, {
    materials: options.generationMaterials,
    adapter: options.generationAdapter,
    anthropicTransport: options.anthropicTransport,
    anthropicBaseUrl: options.anthropicBaseUrl,
    validator: options.generationValidator,
    onEvent,
  });
  if (options.persistGeneratedArtifacts ?? true) {
    result.generatedArtifact = await recordGeneratedArtifact(db, generationRequest, result, user?.id ?? null);
    if (user) {
      await recordUsageEvent(db, user, {
        eventKind: "generation",
        provider: generationRequest.provider ?? "template",
        units: {
          attempts: result.attempts.length,
          verdict: result.verdict,
        },
        costCredits: generationRequest.provider === "template" ? 0 : undefined,
        idempotencyKey: result.generatedArtifact
          ? `generation:${result.generatedArtifact.artifactId}:${result.generatedArtifact.contractHash}`
          : null,
      });
    }
    if (user && result.generatedArtifact) {
      const registeredModel = await insertModelFromGeneration(db, user, generationRequest, result);
      (result as typeof result & { registeredModel?: unknown }).registeredModel = registeredModel
        ? {
            id: registeredModel.id,
            status: registeredModel.status,
            name: registeredModel.name,
            contractHash: registeredModel.contractHash,
          }
        : null;
    }
  }
  return result;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  assertAuthConfiguration();
  const app = Fastify({
    logger: false,
    bodyLimit: DEFAULT_REQUEST_BODY_BYTES,
    trustProxy: false,
    routerOptions: { maxParamLength: 2_000 },
  });
  if (options.observeRoute) {
    app.addHook("onRoute", (route) => {
      options.observeRoute?.({
        method: route.method,
        url: route.url,
        schema: route.schema,
      });
    });
  }
  const rateLimitPolicy = options.rateLimitPolicy === null
    ? null
    : options.rateLimitPolicy ?? DEFAULT_RATE_LIMIT_POLICY;
  const limiter = rateLimitPolicy === null
    ? null
    : new InMemoryRateLimiter(rateLimitPolicy, options.rateLimitNow);
  app.addHook("onRequest", async (request, reply) => {
    try {
      assertTrustedRequestOrigin(request);
      const kind = rateLimitClass(request);
      if (limiter && kind !== "auth") {
        const result = limiter.consume(kind, requestRateLimitIdentity(request));
        reply.header("x-ratelimit-limit", result.limit);
        reply.header("x-ratelimit-remaining", result.remaining);
      }
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode ?? 503);
      const retryAfter = Number((error as { retryAfterSeconds?: number }).retryAfterSeconds ?? 0);
      if (retryAfter > 0) reply.header("retry-after", retryAfter);
      const message = statusCode >= 500
        ? "request could not be completed"
        : redactSensitiveText(error instanceof Error ? error.message : "request rejected").slice(0, 300);
      return reply.status(statusCode).send({ error: message });
    }
  });
  app.addHook("preValidation", async (request) => {
    if (request.body !== undefined) assertBoundedJson(request.body, "request body");
    const path = request.url.split("?", 1)[0] ?? request.url;
    if (
      (path === "/v1/generate" || path === "/v1/generate/stream") &&
      isRecord(request.body) &&
      Object.hasOwn(request.body, "anthropicApiKey")
    ) {
      throw Object.assign(new Error("BYO provider keys are accepted only in the x-forge-anthropic-key header"), {
        statusCode: 400,
      });
    }
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    done(null, body);
  });
  const db = options.db ?? gatewayDb();
  const reviewToken = options.reviewToken ?? process.env.FORGE_REVIEW_TOKEN ?? null;
  if (process.env.NODE_ENV === "production" && reviewToken !== null && reviewToken.length < 32) {
    throw new Error("production FORGE_REVIEW_TOKEN must contain at least 32 characters");
  }
  const deleteObjects =
    options.deleteObjects ??
    ((objects) => deleteStoredObjects(objectStorageConfigFromEnv(), objects));
  const inspectObject = options.inspectObject ?? inspectStoredObject;
  const writeObject = options.writeObject ?? putStoredObject;
  const readObject = options.readObject ?? readStoredObject;
  const writePolicyObject = (input: Parameters<typeof putStoredObject>[1]) =>
    writeObject(objectStorageConfigFromEnv(), input);

  app.get("/healthz", async () => ({
    ok: true,
    service: "forge-gateway",
    validatorBin: validatorBin(),
    validatorPresent: existsSync(validatorBin()),
  }));

  app.register(async (authApp) => {
    if (rateLimitPolicy !== null) {
      await authApp.register(fastifyRateLimit, {
        global: true,
        max: rateLimitPolicy.limits.auth,
        timeWindow: rateLimitPolicy.windowMs,
        cache: 20_000,
        keyGenerator: (request) => secretFingerprint(requestRateLimitIdentity(request)),
        errorResponseBuilder: () => ({ statusCode: 429, error: "rate limit exceeded" }),
      });
    }
    const authRouteOptions = {
      config: {
        rateLimit: {
          max: rateLimitPolicy?.limits.auth ?? DEFAULT_RATE_LIMIT_POLICY.limits.auth,
          timeWindow: rateLimitPolicy?.windowMs ?? DEFAULT_RATE_LIMIT_POLICY.windowMs,
          groupId: "auth",
        },
      },
    };
    authApp.all("/auth", authRouteOptions, async (request, reply) => handleAuthRequest(request, reply));
    authApp.all("/auth/*", authRouteOptions, async (request, reply) => handleAuthRequest(request, reply));
  });

  app.get("/v1/me", async (request, reply) => {
    try {
      const user = await getCurrentUser(request, db);
      return reply.send({
        authenticated: user !== null,
        user,
      });
    } catch (error) {
      const mapped = routeError(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get("/v1/account/export", async (request, reply) => {
    try {
      const user = await requireUser(request, db);
      const exported = await exportUserData(db, user);
      reply.header(
        "content-disposition",
        `attachment; filename="forgedttc-user-data-${user.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json"`,
      );
      return reply.send(exported);
    } catch (error) {
      const mapped = routeError(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get("/v1/data-lifecycle/policy", async (_request, reply) => {
    return reply.send({
      lifecycleVersion: DATA_LIFECYCLE_FORMAT_VERSION,
      policyVersion: RETENTION_POLICY_VERSION,
      policies: RETENTION_POLICIES,
      legalHold: {
        appendOnly: true,
        maximumDaysBeforeReview: 365,
        contentUseAuthorized: false,
      },
      backup: {
        catalogRequired: true,
        restoreTombstoneCheckRequired: true,
        productionRestoreProof: "OPS-005",
      },
    });
  });

  app.get("/v1/account/lifecycle", async (request, reply) => {
    try {
      const user = await requireUser(request, db);
      return reply.send(await accountLifecycleStatus(db, user.id));
    } catch (error) {
      const mapped = routeError(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.delete(
    "/v1/account",
    {
      schema: {
        body: Type.Object(
          { confirmation: Type.Literal("DELETE MY ACCOUNT") },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const receipt = await deleteUserData(db, user, deleteObjects);
        return reply.send({ receipt });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get("/v1/consents/policies", async (_request, reply) => {
    return reply.send({ policies: CONSENT_POLICIES });
  });

  app.get("/v1/consents", async (request, reply) => {
    try {
      const user = await requireUser(request, db);
      return reply.send({ consents: await listCurrentConsents(db, user) });
    } catch (error) {
      const mapped = routeError(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post(
    "/v1/consents",
    {
      schema: {
        body: Type.Object(
          {
            purpose: consentPurposeSchema,
            subjectKind: consentSubjectKindSchema,
            subjectId: Type.String({ minLength: 1, maxLength: 200 }),
            policyVersion: Type.String({ minLength: 1, maxLength: 80 }),
            noticeHash: Type.String({ pattern: "^[0-9a-f]{64}$" }),
            action: consentActionSchema,
            locale: Type.Optional(Type.String({ minLength: 2, maxLength: 35 })),
            idempotencyKey: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          purpose: ConsentPurpose;
          subjectKind: ConsentSubjectKind;
          subjectId: string;
          policyVersion: string;
          noticeHash: string;
          action: ConsentAction;
          locale?: string;
          idempotencyKey?: string;
        };
        const consent = await recordConsent(db, user, body);
        return reply.status(201).send({ consent });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/validate",
    {
      schema: {
        body: Type.Object(
          { contract: Type.Unknown(), asDraft: Type.Optional(Type.Boolean()) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const { contract, asDraft } = request.body as { contract: unknown; asDraft?: boolean };
      const json = typeof contract === "string" ? contract : JSON.stringify(contract);
      const result = await runValidator(json, asDraft ?? false);
      if (result.exitCode === -1 || result.report === null) {
        return reply.status(503).send({
          error: "validator unavailable",
          detail: result.stderr.slice(0, 500),
        });
      }
      const verdict = (result.report as { verdict?: string }).verdict;
      // Admission gate: the sovereign validator's verdict drives the status.
      // A draft is a SUCCESSFUL save-as-draft (D14): the document persists as
      // editable with its diagnostics, but can never train/export/share —
      // enforced at those surfaces as they land (P4+/P7).
      return reply.status(verdict === "rejected" ? 422 : 200).send(result.report);
    },
  );

  app.post(
    "/v1/bake",
    {
      schema: {
        body: Type.Object({ contract: Type.Unknown() }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      const { contract } = request.body as { contract: unknown };
      const json = typeof contract === "string" ? contract : JSON.stringify(contract);
      const result = await runBake(json);
      if (result.exitCode === -1 || result.report === null) {
        return reply.status(result.exitCode === -1 ? 503 : 422).send({
          error: "bake failed",
          detail: result.stderr.slice(0, 500),
        });
      }
      return reply.send(result.report);
    },
  );

  app.post(
    "/v1/bom",
    {
      schema: {
        body: Type.Object({ contract: Type.Unknown() }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      const { contract } = request.body as { contract: unknown };
      const json = typeof contract === "string" ? contract : JSON.stringify(contract);
      const result = await runBom(json);
      if (result.exitCode === -1 || result.report === null) {
        return reply.status(result.exitCode === -1 ? 503 : 422).send({
          error: "bom failed",
          detail: result.stderr.slice(0, 500),
        });
      }
      return reply.send(result.report);
    },
  );

  app.post(
    "/v1/generate/context",
    {
      schema: {
        body: Type.Object(
          {
            prompt: Type.String({ minLength: 1, maxLength: 4000 }),
            archetype: Type.Optional(generationArchetypeSchema),
            categories: Type.Optional(
              Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 16 }),
            ),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
            includePrefixText: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const body = request.body as {
        prompt: string;
        archetype?: GenerationArchetype;
        categories?: string[];
        limit?: number;
        includePrefixText?: boolean;
      };
      try {
        const user = await getCurrentUser(request, db);
        await refuseProhibitedBrief(db, body.prompt, {
          surface: "context",
          ownerUserId: user?.id ?? null,
          provider: null,
          archetype: body.archetype ?? null,
        });
        const context = await buildGenerationContext(db, body, options.generationMaterials);
        return reply.send(context);
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get("/v1/generate/models", async () => ({
    models: ANTHROPIC_MODEL_PINS,
  }));

  app.post(
    "/v1/generate",
    {
      schema: { body: generationBodySchema },
    },
    async (request, reply) => {
      try {
        const body = request.body as GenerationRequest;
        const user = await getCurrentUser(request, db);
        const result = await executeGeneration(db, body, request, options, user, "generation");
        return reply.status(result.verdict === "blocked" ? 409 : 200).send(result);
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/generate/stream",
    {
      schema: { body: generationBodySchema },
    },
    async (request, reply) => {
      const body = request.body as GenerationRequest;
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      reply.raw.write(sse("start", {
        promptHash: sha256(body.prompt.trim()),
        provider: body.provider ?? "template",
      }));
      try {
        const user = await getCurrentUser(request, db);
        const result = await executeGeneration(db, body, request, options, user, "stream", (event, data) => {
          reply.raw.write(sse(event, data));
        });
        reply.raw.write(sse("complete", result));
      } catch (error) {
        const mapped = routeError(error);
        reply.raw.write(sse("error", mapped.body));
      }
      reply.raw.end();
      return reply;
    },
  );

  app.get(
    "/v1/models",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { limit?: number };
        return reply.send({ models: await listModels(db, user, query.limit ?? 50) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/models",
    {
      schema: {
        body: Type.Object(
          {
            contract: Type.Unknown(),
            asDraft: Type.Optional(Type.Boolean()),
            visibility: Type.Optional(visibilitySchema),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as { contract: unknown; asDraft?: boolean };
        const result = await createModel(db, user, body.contract, body.asDraft ?? true);
        return reply.status(result.model.status === "rejected" ? 422 : 201).send(result);
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/models/:id",
    { schema: { params: Type.Object({ id: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const model = await getOwnedModel(db, user, id);
        if (model === null) return reply.status(404).send({ error: "model not found" });
        return reply.send({ model });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/models/:id/edit",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }),
        body: Type.Object(
          { prompt: Type.String({ minLength: 1, maxLength: 2000 }) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const { prompt } = request.body as { prompt: string };
        await refuseProhibitedBrief(db, prompt, {
          surface: "model-edit",
          ownerUserId: user.id,
          provider: "template",
          archetype: null,
        });
        const result = await editModel(db, user, id, prompt);
        return reply.send(result);
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/models/:id/share",
    { schema: { params: Type.Object({ id: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const share = await shareModel(db, user, id);
        return reply.status(201).send({ share, url: `/v1/share/${share.id}` });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/share/:shareId",
    { schema: { params: Type.Object({ shareId: Type.String({ minLength: 1 }) }) } },
    async (request, reply) => {
      try {
        const { shareId } = request.params as { shareId: string };
        const share = await getShare(db, shareId);
        if (share === null) return reply.status(404).send({ error: "share not found" });
        return reply.send({ share });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get("/v1/credits", async (request, reply) => {
    try {
      const user = await requireUser(request, db);
      return reply.send(await creditSummary(db, user));
    } catch (error) {
      const mapped = routeError(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get("/v1/platform/gates", async (request, reply) => {
    try {
      await requireUser(request, db);
      return reply.send({ gates: await listPlatformGates(db) });
    } catch (error) {
      const mapped = routeError(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.post(
    "/v1/platform/gates/:gateKey/signoffs",
    {
      schema: {
        params: Type.Object({ gateKey: platformGateKeySchema }, { additionalProperties: false }),
        body: Type.Object(
          {
            status: platformGateStatusSchema,
            policyVersion: Type.String({ minLength: 1, maxLength: 120 }),
            jurisdiction: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            reviewer: Type.String({ minLength: 1, maxLength: 120 }),
            evidence: Type.Optional(Type.Unknown()),
            evidenceUrl: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
            effectiveAt: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (!reviewAuthorized(request, reviewToken)) {
        return reply.status(401).send({ error: "platform gate admin auth required" });
      }
      try {
        const { gateKey } = request.params as { gateKey: PlatformGateKey };
        const body = request.body as {
          status: PlatformGateStatus;
          policyVersion: string;
          jurisdiction?: string;
          reviewer: string;
          evidence?: unknown;
          evidenceUrl?: string;
          effectiveAt?: string;
        };
        const gate = await recordPlatformGateSignoff(db, {
          gateKey,
          status: body.status,
          policyVersion: body.policyVersion,
          jurisdiction: body.jurisdiction,
          reviewer: body.reviewer,
          evidence: body.evidence ?? {},
          evidenceUrl: body.evidenceUrl ?? null,
          effectiveAt: body.effectiveAt ?? null,
        });
        return reply.status(201).send({ gate });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/blobs",
    {
      schema: {
        body: Type.Object(
          {
            purpose: blobPurposeSchema,
            contentType: Type.String({
              minLength: 1,
              maxLength: 160,
              pattern: "^[A-Za-z0-9][A-Za-z0-9!#$&^_.+\\/-]*$",
            }),
            byteSize: Type.Integer({ minimum: 0, maximum: MAX_OBJECT_BYTES }),
            sha256: sha256Schema,
            cacheKey: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
            metadata: Type.Optional(Type.Record(Type.String({ minLength: 1, maxLength: 80 }), Type.Unknown())),
            expiresInSeconds: Type.Optional(Type.Integer({ minimum: 60, maximum: 3600 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          purpose: string;
          contentType: string;
          byteSize: number;
          sha256: string;
          cacheKey?: string;
          metadata?: Record<string, unknown>;
          expiresInSeconds?: number;
        };
        const config = objectStorageConfigFromEnv();
        const blob = await registerObjectBlob(db, user, {
          bucket: config.bucket,
          purpose: body.purpose,
          contentType: body.contentType,
          byteSize: body.byteSize,
          sha256: body.sha256,
          metadata: body.metadata,
          cacheKey: body.cacheKey,
        });
        const upload = await presignObjectAccess(config, {
          action: "upload",
          bucket: blob.bucket,
          objectKey: blob.objectKey,
          contentType: blob.contentType,
          byteSize: blob.byteSize,
          sha256: blob.sha256,
          expiresInSeconds: body.expiresInSeconds,
        });
        reply.header("cache-control", "no-store");
        return reply.status(201).send({ blob, upload });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/blobs/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const blob = await getOwnedObjectBlob(db, user, id);
        if (!blob) {
          return reply.status(404).send({ error: "object blob not found" });
        }
        return reply.send({ blob });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/blobs/:id/complete",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        body: Type.Object({}, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const blob = await getOwnedObjectBlob(db, user, id);
        if (!blob) return reply.status(404).send({ error: "object blob not found" });
        const config = objectStorageConfigFromEnv();
        const inspection = await inspectObject(config, {
          bucket: blob.bucket,
          objectKey: blob.objectKey,
        });
        const completed = await completeObjectBlobUpload(db, user, blob.id, inspection);
        reply.header("cache-control", "no-store");
        return reply.send({ blob: completed });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/blobs/:id/access",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        body: Type.Object(
          {
            action: blobAccessActionSchema,
            expiresInSeconds: Type.Optional(Type.Integer({ minimum: 60, maximum: 3600 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const body = request.body as { action: "upload" | "download"; expiresInSeconds?: number };
        const blob = await getOwnedObjectBlob(db, user, id);
        if (!blob) {
          return reply.status(404).send({ error: "object blob not found" });
        }
        if (body.action === "download" && blob.uploadStatus !== "complete") {
          return reply.status(409).send({ error: "object upload is not verified complete" });
        }
        const access = await presignObjectAccess(objectStorageConfigFromEnv(), {
          action: body.action,
          bucket: blob.bucket,
          objectKey: blob.objectKey,
          contentType: blob.contentType,
          byteSize: blob.byteSize,
          sha256: blob.sha256,
          expiresInSeconds: body.expiresInSeconds,
        });
        reply.header("cache-control", "no-store");
        return reply.send({ blob, access });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/recorder-archives",
    {
      schema: {
        body: Type.Object({ plan: recorderUploadPlanSchema }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { plan } = request.body as { plan: unknown };
        const config = objectStorageConfigFromEnv();
        const staged = await stageRecorderArchive(db, user, plan, config.bucket);
        const uploads = await Promise.all(staged.blobs.map(async (blob, index) => ({
          name: recorderArchiveFileNames[index],
          blob,
          upload: await presignObjectAccess(config, {
            action: "upload",
            bucket: blob.bucket,
            objectKey: blob.objectKey,
            contentType: blob.contentType,
            byteSize: blob.byteSize,
            sha256: blob.sha256,
            expiresInSeconds: 900,
          }),
        })));
        reply.header("cache-control", "no-store");
        return reply.status(201).send({ materialization: staged.materialization, uploads });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/recorder-archives",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { limit = 20 } = request.query as { limit?: number };
        return reply.send({ materializations: await listRecorderArchives(db, user, limit) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/recorder-archives/:id/complete",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1, maxLength: 128 }) }, { additionalProperties: false }),
        body: Type.Object({}, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const materialization = await completeRecorderArchive(
          db,
          user,
          id,
          objectStorageConfigFromEnv(),
          inspectObject,
          readObject,
        );
        reply.header("cache-control", "no-store");
        return reply.send({ materialization });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/jobs",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { limit?: number };
        return reply.send({ jobs: await listJobs(db, user, query.limit ?? 50) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get("/v1/jobs/capabilities", async (request, reply) => {
    try {
      await requireUser(request, db);
      return reply.send(await jobCapabilities(db));
    } catch (error) {
      const mapped = routeError(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get(
    "/v1/jobs/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        querystring: Type.Object(
          { includeEvents: Type.Optional(Type.Boolean()) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const query = request.query as { includeEvents?: boolean };
        const job = await getOwnedJob(db, user, id);
        if (!job) {
          return reply.status(404).send({ error: "job not found" });
        }
        const events = query.includeEvents ? await listJobEvents(db, user, id, 100) : undefined;
        return reply.send({ job, events });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/jobs/:id/events",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const query = request.query as { limit?: number };
        const job = await getOwnedJob(db, user, id);
        if (!job) {
          return reply.status(404).send({ error: "job not found" });
        }
        return reply.send({ job, events: await listJobEvents(db, user, id, query.limit ?? 100) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.delete(
    "/v1/jobs/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        return reply.send({ job: await cancelOwnedJob(db, user, id) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/jobs",
    {
      schema: {
        body: Type.Object(
          {
            kind: jobKindSchema,
            provider: Type.Optional(jobProviderSchema),
            payload: Type.Optional(Type.Unknown()),
            idempotencyKey: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          kind: string;
          provider?: "fixture" | "local" | "modal";
          payload?: unknown;
          idempotencyKey?: string;
        };
        assertJobKind(body.kind);
        const isPhotoscan = body.kind === "photoscan.single" || body.kind === "photoscan.multiview";
        const sourceBlobIds = isPhotoscan ? sourceBlobIdsFromPayload(body.payload) : [];
        if (isPhotoscan && sourceBlobIds.length === 0) {
          throw Object.assign(new Error("photoscan jobs require owned sourceBlobIds with active processing consent"), {
            statusCode: 400,
          });
        }
        if (body.kind === "photoscan.single" && sourceBlobIds.length !== 1) {
          throw Object.assign(new Error("single photoscan requires exactly one source blob"), { statusCode: 400 });
        }
        if (body.kind === "photoscan.multiview" && sourceBlobIds.length < 2) {
          throw Object.assign(new Error("multiview photoscan requires at least two source blobs"), { statusCode: 400 });
        }
        const job = await createJob(
          db,
          user,
          {
            kind: body.kind as JobKind,
            provider: body.provider,
            payload: body.payload,
            idempotencyKey: body.idempotencyKey,
          },
          { writePolicyObject },
        );
        return reply.status(201).send({ job });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/photoscan/artifacts",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { limit?: number };
        return reply.send({ artifacts: await listPhotoscanArtifacts(db, user, query.limit ?? 50) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.patch(
    "/v1/photoscan/artifacts/:id/alignment",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        body: Type.Object(
          {
            knownDimensionMm: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
            axis: Type.Optional(photoscanAxisSchema),
            ports: Type.Optional(Type.Array(photoscanPortSchema, { maxItems: 64 })),
            note: Type.Optional(Type.String({ minLength: 1, maxLength: 300 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const params = request.params as { id: string };
        const body = request.body as {
          knownDimensionMm?: number;
          axis?: "x" | "y" | "z";
          ports?: { id: string; kind: string; axis?: "x" | "y" | "z"; role?: string }[];
          note?: string;
        };
        const alignmentPatch: Record<string, unknown> = {
          updatedAt: new Date().toISOString(),
          reviewedBy: user.id,
        };
        if (body.knownDimensionMm !== undefined) alignmentPatch.knownDimensionMm = body.knownDimensionMm;
        if (body.axis !== undefined) alignmentPatch.axis = body.axis;
        if (body.ports !== undefined) alignmentPatch.ports = body.ports;
        if (body.note !== undefined) alignmentPatch.note = body.note;

        const artifact = await updatePhotoscanAlignment(db, user, params.id, alignmentPatch);
        if (!artifact) return reply.status(404).send({ error: "photoscan artifact not found" });
        return reply.send({ artifact });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/photoscan",
    {
      schema: {
        body: Type.Object(
          {
            mode: Type.Optional(Type.Union([Type.Literal("single"), Type.Literal("multiview")])),
            sourceBlobIds: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
              minItems: 1,
              maxItems: 64,
              uniqueItems: true,
            }),
            payload: Type.Optional(Type.Unknown()),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as { mode?: "single" | "multiview"; sourceBlobIds: string[]; payload?: unknown };
        const kind: JobKind = body.mode === "multiview" ? "photoscan.multiview" : "photoscan.single";
        if (kind === "photoscan.single" && body.sourceBlobIds.length !== 1) {
          throw Object.assign(new Error("single photoscan requires exactly one source blob"), { statusCode: 400 });
        }
        if (kind === "photoscan.multiview" && body.sourceBlobIds.length < 2) {
          throw Object.assign(new Error("multiview photoscan requires at least two source blobs"), { statusCode: 400 });
        }
        const payload = isRecord(body.payload)
          ? { ...body.payload, sourceBlobIds: body.sourceBlobIds }
          : { sourceBlobIds: body.sourceBlobIds };
        const job = await createJob(db, user, { kind, payload, provider: "fixture" });
        return reply.status(202).send({ job });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/policies",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { limit?: number };
        return reply.send({ artifacts: await listPolicyArtifacts(db, user, query.limit ?? 50) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/policies/:id/model",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1, maxLength: 200 }) }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const artifact = await getOwnedPolicyArtifact(db, user, id);
        if (!artifact || !artifact.artifactBlobId) {
          return reply.status(404).send({ error: "policy artifact not found" });
        }
        if (artifact.exportGate !== "exportable") {
          return reply.status(409).send({ error: "policy scorecard is held; model download is blocked" });
        }
        const blob = await getOwnedObjectBlob(db, user, artifact.artifactBlobId);
        if (
          !blob
          || blob.uploadStatus !== "complete"
          || blob.byteSize === null
          || blob.sha256 === null
          || blob.contentType !== "application/octet-stream"
        ) {
          return reply.status(409).send({ error: "policy object is not verified complete" });
        }
        const metadata = isRecord(artifact.policyMetadata) ? artifact.policyMetadata : null;
        const delivery = metadata && isRecord(metadata.delivery) ? metadata.delivery : null;
        const modelRevision = delivery && isRecord(delivery.modelRevision) ? delivery.modelRevision : null;
        const onnx = metadata && isRecord(metadata.onnx) ? metadata.onnx : null;
        const scorecard = metadata && isRecord(metadata.scorecard) ? metadata.scorecard : null;
        const lineage = scorecard && isRecord(scorecard.lineage) ? scorecard.lineage : null;
        const io = metadata && isRecord(metadata.io) ? metadata.io : null;
        const onnxHeader = io && isRecord(io.onnxHeader) ? io.onnxHeader : null;
        const tensor = io && isRecord(io.tensor) ? io.tensor : null;
        if (
          metadata?.artifactKind !== "policy"
          || metadata.formatVersion !== POLICY_DELIVERY_ARTIFACT_VERSION
          || artifact.jobId === null
          || delivery?.objectBacked !== true
          || delivery.jobId !== artifact.jobId
          || delivery.policyArtifactId !== artifact.id
          || delivery.artifactBlobId !== blob.id
          || delivery.byteSize !== blob.byteSize
          || delivery.sha256 !== blob.sha256
          || modelRevision?.modelId !== artifact.modelId
          || typeof modelRevision.contractHash !== "string"
          || modelRevision.contractHash !== lineage?.contractHash
          || modelRevision.contractHash !== onnxHeader?.contractHash
          || tensor?.schema !== "forge-policy-tensor"
          || onnx?.byteSize !== blob.byteSize
          || onnx.sha256 !== blob.sha256
          || Object.hasOwn(onnx, "modelBase64")
          || scorecard?.exportable !== true
          || stableJson(scorecard) !== stableJson(artifact.scorecard)
        ) {
          return reply.status(409).send({ error: "policy metadata does not bind the retained object" });
        }
        const bytes = await readObject(objectStorageConfigFromEnv(), {
          bucket: blob.bucket,
          objectKey: blob.objectKey,
          byteSize: blob.byteSize,
          sha256: blob.sha256,
          maxBytes: MAX_POLICY_MODEL_BYTES,
        });
        reply.header("cache-control", "private, no-store");
        reply.header("content-length", String(bytes.byteLength));
        reply.header("x-content-type-options", "nosniff");
        reply.header("x-forge-policy-sha256", blob.sha256);
        return reply.type("application/octet-stream").send(Buffer.from(bytes));
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/policies",
    {
      schema: {
        body: Type.Object({ payload: Type.Optional(Type.Unknown()) }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { payload } = request.body as { payload?: unknown };
        const job = await createJob(
          db,
          user,
          { kind: "train.policy", payload, provider: "fixture" },
          { writePolicyObject },
        );
        return reply.status(202).send({ job });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/replays",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { limit?: number };
        return reply.send({ replays: await listReplayArtifacts(db, user, query.limit ?? 50) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/replays",
    {
      schema: {
        body: Type.Object({ tape: Type.Unknown() }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { tape } = request.body as { tape: unknown };
        const verification = verifyReplayTape(tape);
        const job = await createJob(db, user, { kind: "replay.verify", payload: { tape }, provider: "fixture" });
        const replay = await insertReplayArtifact(db, user, { tape, verification });
        return reply.status(202).send({ job, replay });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/telemetry/logs",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { limit?: number };
        return reply.send({ logs: await listTelemetryLogs(db, user, query.limit ?? 50) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/telemetry/logs/:id/share",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const privacy = await withActiveConsents(
          db,
          user,
          [{ purpose: "telemetry.sharing", subjectKind: "telemetry-log", subjectId: id }],
          async (transaction) => {
            const updated = await transaction.query<{ privacy: unknown }>(
              `UPDATE telemetry_logs
                  SET privacy = COALESCE(privacy, '{}'::jsonb) || jsonb_build_object(
                    'sharing', 'shared', 'sharedAt', now()
                  )
                WHERE id = $1 AND owner_user_id = $2
                RETURNING privacy`,
              [id, user.id],
            );
            if (!updated.rows[0]) throw Object.assign(new Error("telemetry-log not found"), { statusCode: 404 });
            return updated.rows[0].privacy;
          },
        );
        return reply.send({ id, privacy });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/models/:id/pattern-contribution",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        body: Type.Object(
          {
            structuralIdioms: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), {
              minItems: 1,
              maxItems: 20,
              uniqueItems: true,
            }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const { structuralIdioms } = request.body as { structuralIdioms: string[] };
        const contribution = await withActiveConsents(
          db,
          user,
          [{ purpose: "pattern.contribution", subjectKind: "model", subjectId: id }],
          async (transaction) => {
            const model = await getOwnedModel(transaction, user, id);
            if (!model) throw Object.assign(new Error("model not found"), { statusCode: 404 });
            if (model.status !== "admitted") {
              throw Object.assign(new Error("only admitted models can contribute patterns"), { statusCode: 409 });
            }
            const summary = {
              structuralIdioms,
              geometryIncluded: false,
              attributionIncluded: false,
              modelContractHash: model.contractHash,
            };
            const inserted = await transaction.query<{ id: string; source_artifact_id: string; created_at: Date | string }>(
              `INSERT INTO pattern_library (
                 owner_user_id, source_model_id, source_artifact_id,
                 source_kind, archetype, consent, summary, token_vector
               ) VALUES ($1, $2, $3, 'user-opt-in', $4, 'opt-in', $5::jsonb, '{}'::jsonb)
               ON CONFLICT (source_model_id) WHERE consent = 'opt-in' AND source_model_id IS NOT NULL
               DO NOTHING
               RETURNING id, source_artifact_id, created_at`,
              [user.id, model.id, model.sourceArtifactId, model.archetype ?? "unknown", JSON.stringify(summary)],
            );
            if (inserted.rows[0]) return inserted.rows[0];
            const existing = await transaction.query<{ id: string; source_artifact_id: string; created_at: Date | string }>(
              `SELECT id, source_artifact_id, created_at FROM pattern_library
                WHERE owner_user_id = $1 AND source_model_id = $2 AND consent = 'opt-in' LIMIT 1`,
              [user.id, model.id],
            );
            return existing.rows[0];
          },
        );
        return reply.status(201).send({ contribution });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get("/v1/evals/brief25/latest", async (_request, reply) => {
    try {
      return reply.send({ eval: await latestBrief25Eval(db) });
    } catch (error) {
      const mapped = routeError(error);
      return reply.status(mapped.statusCode).send(mapped.body);
    }
  });

  app.get(
    "/v1/courses",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const query = request.query as { limit?: number };
        const result = await db.query<CourseRow>(
          `SELECT id, name, env_spec, validator_report, visibility, created_at
             FROM courses
            WHERE visibility IN ('public', 'unlisted')
            ORDER BY created_at DESC
            LIMIT $1`,
          [query.limit ?? 50],
        );
        return reply.send({
          courses: result.rows.map(mapCourse),
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/courses/:courseId",
    {
      schema: {
        params: Type.Object({ courseId: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
      },
    },
    async (request, reply) => {
      try {
        const user = await getCurrentUser(request, db);
        const { courseId } = request.params as { courseId: string };
        const result = await db.query<CourseRow>(
          `SELECT id, owner_user_id, name, env_spec, validator_report, visibility, created_at
             FROM courses
            WHERE id = $1
              AND (visibility IN ('public', 'unlisted') OR owner_user_id = $2)
            LIMIT 1`,
          [courseId, user?.id ?? null],
        );
        const row = result.rows[0];
        if (!row) return reply.status(404).send({ error: "course not found" });
        return reply.send({ course: mapCourse(row) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/courses",
    {
      schema: {
        body: Type.Object(
          {
            name: Type.String({ minLength: 1, maxLength: 160 }),
            envSpec: Type.Unknown(),
            visibility: Type.Optional(visibilitySchema),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as { name: string; envSpec: unknown; visibility?: "private" | "unlisted" | "public" };
        const validation = await runEnvSpec(JSON.stringify(body.envSpec), true);
        if (validation.exitCode === -1 || validation.report === null) {
          throw Object.assign(new Error(validation.stderr || "EnvSpec validator unavailable"), { statusCode: 503 });
        }
        const validatorReport = validation.report;
        const result = await db.query<{ id: string }>(
          `INSERT INTO courses (owner_user_id, name, env_spec, validator_report, visibility)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
           RETURNING id`,
          [user.id, body.name, JSON.stringify(body.envSpec), JSON.stringify(validatorReport), body.visibility ?? "private"],
        );
        return reply.status(201).send({ id: result.rows[0].id, validatorReport });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/courses/generate",
    {
      schema: { body: courseGenerationBodySchema },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as CourseGenerationBody;
        await refuseProhibitedBrief(db, body.prompt, {
          surface: "course-generation",
          ownerUserId: user.id,
          provider: body.provider ?? "template",
          archetype: body.archetype ?? null,
        });
        const envSpec = buildTemplateEnvSpec(body);
        const validation = await runEnvSpec(JSON.stringify(envSpec), false);
        if (validation.exitCode === -1 || validation.report === null) {
          throw Object.assign(new Error(validation.stderr || "EnvSpec validator unavailable"), { statusCode: 503 });
        }
        const validatorReport = validation.report;
        if (validation.exitCode !== 0 || reportVerdict(validatorReport) !== "admitted") {
          throw Object.assign(new Error("generated EnvSpec failed validation"), {
            statusCode: 422,
            report: validatorReport,
          });
        }
        const result = await db.query<{ id: string }>(
          `INSERT INTO courses (owner_user_id, name, env_spec, validator_report, visibility)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
           RETURNING id`,
          [
            user.id,
            typeof envSpec.name === "string" ? envSpec.name : body.name ?? "Generated course",
            JSON.stringify(envSpec),
            JSON.stringify(validatorReport),
            body.visibility ?? "unlisted",
          ],
        );
        return reply.status(201).send({
          id: result.rows[0].id,
          envSpec,
          validatorReport,
          generation: {
            provider: body.provider ?? "template",
            archetype: body.archetype ?? "multirotor",
            promptHash: isRecord(envSpec.provenance) ? envSpec.provenance.promptHash : null,
          },
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/leaderboards",
    {
      schema: {
        querystring: Type.Object(
          {
            courseId: Type.String({ minLength: 1 }),
            archetype: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
            classKey: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const query = request.query as { courseId: string; archetype?: string; classKey?: string; limit?: number };
        const result = await db.query<{
          id: string;
          course_id: string;
          archetype: string | null;
          class_key: string | null;
          score: string | number;
          verified: boolean;
          verification: unknown;
          created_at: Date | string;
        }>(
          `SELECT id, course_id, archetype, class_key, score, verified, verification, created_at
             FROM leaderboard_runs
            WHERE course_id = $1
              AND ($2::text IS NULL OR archetype = $2)
              AND ($3::text IS NULL OR class_key = $3)
            ORDER BY verified DESC, score DESC, created_at ASC
            LIMIT $4`,
          [query.courseId, query.archetype ?? null, query.classKey ?? null, query.limit ?? 50],
        );
        return reply.send({
          runs: result.rows.map((row) => ({
            id: row.id,
            courseId: row.course_id,
            archetype: row.archetype,
            classKey: row.class_key,
            score: Number(row.score),
            verified: row.verified,
            verification: row.verification,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          })),
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/leaderboards",
    {
      schema: {
        body: Type.Object(
          {
            courseId: Type.String({ minLength: 1 }),
            score: Type.Number(),
            replayId: Type.Optional(Type.String({ minLength: 1 })),
            policyId: Type.Optional(Type.String({ minLength: 1 })),
            archetype: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
            classKey: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            tape: Type.Optional(Type.Unknown()),
            expectedReplayHash: Type.Optional(Type.String({ minLength: 1 })),
            expectedContractHash: Type.Optional(Type.String({ minLength: 1 })),
            verification: Type.Optional(Type.Unknown()),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          courseId: string;
          score: number;
          replayId?: string;
          policyId?: string;
          archetype?: string;
          classKey?: string;
          tape?: unknown;
          expectedReplayHash?: string;
          expectedContractHash?: string;
          verification?: unknown;
        };
        const clientVerification =
          typeof body.verification === "object" && body.verification !== null
            ? (body.verification as Record<string, unknown>)
            : {};
        const slice = leaderboardSlice({
          archetype: body.archetype,
          classKey: body.classKey,
          verification: clientVerification,
        });
        const submittedTape = body.tape ?? clientVerification.tape;
        const expectedHash =
          body.expectedReplayHash ??
          (typeof clientVerification.expectedHash === "string" ? clientVerification.expectedHash : undefined) ??
          (typeof clientVerification.tamperHash === "string" ? clientVerification.tamperHash : undefined);
        const expectedContractHash =
          body.expectedContractHash ??
          (typeof clientVerification.expectedContractHash === "string" ? clientVerification.expectedContractHash : undefined);
        const verification =
          submittedTape === undefined
            ? verifyReplayTape(null, { courseId: body.courseId })
            : verifyReplayTape(submittedTape, {
                expectedHash,
                expectedContractHash,
                courseId: body.courseId,
              });
        const published = await withActiveConsents(
          db,
          user,
          [{ purpose: "leaderboard.publication", subjectKind: "account", subjectId: user.id }],
          async (transaction) => {
            const replay = submittedTape === undefined
              ? null
              : await insertReplayArtifact(transaction, user, {
                  tape: submittedTape,
                  verification,
                  modelId: typeof clientVerification.modelId === "string" ? clientVerification.modelId : null,
                });
            const result = await transaction.query<{ id: string }>(
              `INSERT INTO leaderboard_runs (
                 course_id, policy_id, replay_id, user_id, archetype, class_key, score, verified, verification
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
               RETURNING id`,
              [
                body.courseId,
                body.policyId ?? null,
                replay?.id ?? body.replayId ?? null,
                user.id,
                slice.archetype,
                slice.classKey,
                body.score,
                verification.verified,
                JSON.stringify({
                  ...verification,
                  archetype: slice.archetype,
                  classKey: slice.classKey,
                  clientClaim: clientVerification.verified === undefined ? null : Boolean(clientVerification.verified),
                }),
              ],
            );
            return { id: result.rows[0].id, replay };
          },
        );
        return reply.status(201).send({
          id: published.id,
          verified: verification.verified,
          archetype: slice.archetype,
          classKey: slice.classKey,
          verification,
          replay: published.replay,
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/classroom/assignments",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const query = request.query as { limit?: number };
        const user = await getCurrentUser(request, db);
        const result = await db.query<{
          id: string;
          owner_user_id: string | null;
          course_id: string | null;
          title: string;
          brief: string;
          rubric: unknown;
          visibility: string;
          due_at: Date | string | null;
          created_at: Date | string;
        }>(
          `SELECT id, owner_user_id, course_id, title, brief, rubric, visibility, due_at, created_at
             FROM classroom_assignments
            WHERE visibility IN ('public', 'unlisted')
               OR ($1::text IS NOT NULL AND owner_user_id = $1)
            ORDER BY created_at DESC
            LIMIT $2`,
          [user?.id ?? null, query.limit ?? 50],
        );
        return reply.send({
          assignments: result.rows.map((row) => ({
            id: row.id,
            ownerUserId: row.owner_user_id,
            courseId: row.course_id,
            title: row.title,
            brief: row.brief,
            rubric: row.rubric,
            visibility: row.visibility,
            dueAt: row.due_at instanceof Date ? row.due_at.toISOString() : row.due_at,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          })),
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/classroom/assignments",
    {
      schema: {
        body: Type.Object(
          {
            title: Type.String({ minLength: 1, maxLength: 180 }),
            brief: Type.String({ minLength: 1, maxLength: 4000 }),
            rubric: Type.Optional(Type.Unknown()),
            courseId: Type.Optional(Type.String({ minLength: 1 })),
            visibility: Type.Optional(visibilitySchema),
            dueAt: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          title: string;
          brief: string;
          rubric?: unknown;
          courseId?: string;
          visibility?: "private" | "unlisted" | "public";
          dueAt?: string;
        };
        const result = await db.query<{ id: string }>(
          `INSERT INTO classroom_assignments (owner_user_id, course_id, title, brief, rubric, visibility, due_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::timestamptz)
           RETURNING id`,
          [
            user.id,
            body.courseId ?? null,
            body.title,
            body.brief,
            JSON.stringify(body.rubric ?? { maxErrors: 0, minScore: 0.8 }),
            body.visibility ?? "private",
            body.dueAt ?? null,
          ],
        );
        return reply.status(201).send({ id: result.rows[0].id });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/classroom/assignments/:id/submissions",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const query = request.query as { limit?: number };
        const result = await db.query<{
          id: string;
          assignment_id: string;
          student_user_id: string | null;
          model_id: string | null;
          policy_id: string | null;
          replay_id: string | null;
          validator_report: unknown;
          scorecard: unknown;
          grade: unknown;
          status: string;
          created_at: Date | string;
        }>(
          `SELECT s.id, s.assignment_id, s.student_user_id, s.model_id, s.policy_id, s.replay_id,
                  s.validator_report, s.scorecard, s.grade, s.status, s.created_at
             FROM classroom_submissions s
             JOIN classroom_assignments a ON a.id = s.assignment_id
            WHERE s.assignment_id = $1
              AND (a.owner_user_id = $2 OR s.student_user_id = $2)
            ORDER BY s.created_at DESC
            LIMIT $3`,
          [id, user.id, query.limit ?? 50],
        );
        return reply.send({
          submissions: result.rows.map((row) => ({
            id: row.id,
            assignmentId: row.assignment_id,
            studentUserId: row.student_user_id,
            modelId: row.model_id,
            policyId: row.policy_id,
            replayId: row.replay_id,
            validatorReport: row.validator_report,
            scorecard: row.scorecard,
            grade: row.grade,
            status: row.status,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          })),
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/classroom/assignments/:id/submissions",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        body: Type.Object(
          {
            modelId: Type.Optional(Type.String({ minLength: 1 })),
            policyId: Type.Optional(Type.String({ minLength: 1 })),
            replayId: Type.Optional(Type.String({ minLength: 1 })),
            contract: Type.Optional(Type.Unknown()),
            scorecard: Type.Optional(Type.Unknown()),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const { id } = request.params as { id: string };
        const body = request.body as {
          modelId?: string;
          policyId?: string;
          replayId?: string;
          contract?: unknown;
          scorecard?: unknown;
        };
        const assignment = await db.query<{ rubric: unknown }>(
          `SELECT rubric
             FROM classroom_assignments
            WHERE id = $1
              AND (visibility IN ('public', 'unlisted') OR owner_user_id = $2)
            LIMIT 1`,
          [id, user.id],
        );
        if (!assignment.rows[0]) return reply.status(404).send({ error: "assignment not found" });
        let contract = body.contract;
        let validatorReport: unknown;
        if (body.modelId) {
          const model = await getOwnedModel(db, user, body.modelId);
          if (model === null) return reply.status(404).send({ error: "model not found" });
          contract = model.contract;
          validatorReport = model.validatorReport ?? { verdict: model.status, results: [] };
        } else if (contract !== undefined) {
          const validation = await runValidator(JSON.stringify(contract), true);
          if (validation.exitCode === -1 || validation.report === null) {
            throw Object.assign(new Error(validation.stderr || "validator unavailable"), { statusCode: 503 });
          }
          validatorReport = validation.report;
        } else {
          return reply.status(400).send({ error: "classroom submission requires modelId or contract" });
        }
        const grade = gradeClassroomSubmission(validatorReport, assignment.rows[0].rubric, body.scorecard ?? {});
        const result = await db.query<{ id: string }>(
          `INSERT INTO classroom_submissions (
             assignment_id, student_user_id, model_id, policy_id, replay_id,
             contract, validator_report, scorecard, grade, status
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, 'graded')
           RETURNING id`,
          [
            id,
            user.id,
            body.modelId ?? null,
            body.policyId ?? null,
            body.replayId ?? null,
            JSON.stringify(contract ?? null),
            JSON.stringify(validatorReport),
            JSON.stringify(body.scorecard ?? {}),
            JSON.stringify(grade),
          ],
        );
        return reply.status(201).send({ id: result.rows[0].id, grade, validatorReport });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/license-ledger",
    {
      schema: {
        querystring: Type.Object(
          {
            licenseClass: Type.Optional(licenseClassSchema),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const query = request.query as { licenseClass?: string; limit?: number };
        const result = await db.query<{
          id: string;
          class: string;
          terms: string | null;
          source_url: string | null;
          component_count: string | number;
          priced_component_count: string | number;
          cited_component_count: string | number;
          approved_review_count: string | number;
          pending_review_count: string | number;
          blocked_export_count: string | number;
          export_policies: unknown;
        }>(
          `WITH latest_reviews AS (
             SELECT DISTINCT ON (artifact_id)
                    artifact_id, status, export_policy
               FROM review_queue
              WHERE artifact_kind = 'component'
              ORDER BY artifact_id, reviewed_at DESC NULLS LAST, created_at DESC
           ),
           component_counts AS (
             SELECT c.license_id,
                    COUNT(*) AS component_count,
                    COUNT(*) FILTER (WHERE EXISTS (
                      SELECT 1 FROM prices p WHERE p.component_id = c.id
                    )) AS priced_component_count,
                    COUNT(*) FILTER (WHERE EXISTS (
                      SELECT 1 FROM provenance pr WHERE pr.artifact_id = c.id
                    )) AS cited_component_count
               FROM components c
              GROUP BY c.license_id
           ),
           review_counts AS (
             SELECT c.license_id,
                    COUNT(*) FILTER (WHERE lr.status = 'approved') AS approved_review_count,
                    COUNT(*) FILTER (WHERE lr.status = 'needs_review') AS pending_review_count,
                    COUNT(*) FILTER (WHERE COALESCE(lr.export_policy, 'blocked') = 'blocked') AS blocked_export_count
               FROM components c
               LEFT JOIN latest_reviews lr ON lr.artifact_id = c.id
              GROUP BY c.license_id
           ),
           export_counts AS (
             SELECT c.license_id,
                    COALESCE(lr.export_policy, 'blocked') AS export_policy,
                    COUNT(*) AS count
               FROM components c
               LEFT JOIN latest_reviews lr ON lr.artifact_id = c.id
              GROUP BY c.license_id, COALESCE(lr.export_policy, 'blocked')
           ),
           export_policy_counts AS (
             SELECT license_id, jsonb_object_agg(export_policy, count) AS export_policies
               FROM export_counts
              GROUP BY license_id
           )
           SELECT l.id, l.class, l.terms, l.source_url,
                  COALESCE(cc.component_count, 0) AS component_count,
                  COALESCE(cc.priced_component_count, 0) AS priced_component_count,
                  COALESCE(cc.cited_component_count, 0) AS cited_component_count,
                  COALESCE(rc.approved_review_count, 0) AS approved_review_count,
                  COALESCE(rc.pending_review_count, 0) AS pending_review_count,
                  COALESCE(rc.blocked_export_count, 0) AS blocked_export_count,
                  COALESCE(epc.export_policies, '{}'::jsonb) AS export_policies
             FROM licenses l
             LEFT JOIN component_counts cc ON cc.license_id = l.id
             LEFT JOIN review_counts rc ON rc.license_id = l.id
             LEFT JOIN export_policy_counts epc ON epc.license_id = l.id
            WHERE ($1::text IS NULL OR l.class = $1)
            ORDER BY l.class, l.id
            LIMIT $2`,
          [query.licenseClass ?? null, query.limit ?? 50],
        );
        return reply.send({
          ledger: result.rows.map((row) => ({
            id: row.id,
            class: row.class,
            terms: row.terms,
            sourceUrl: row.source_url,
            componentCount: Number(row.component_count),
            pricedComponentCount: Number(row.priced_component_count),
            citedComponentCount: Number(row.cited_component_count),
            approvedReviewCount: Number(row.approved_review_count),
            pendingReviewCount: Number(row.pending_review_count),
            blockedExportCount: Number(row.blocked_export_count),
            exportPolicies: numberMap(row.export_policies),
          })),
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/commerce/vendor-offers",
    {
      schema: {
        querystring: Type.Object(
          {
            componentId: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        await requireUser(request, db);
        const query = request.query as { componentId?: string; limit?: number };
        return reply.send({ offers: await listVendorOffers(db, { componentId: query.componentId ?? null, limit: query.limit ?? 50 }) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/commerce/vendor-offers/refresh",
    {
      schema: {
        body: Type.Object(
          {
            componentIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 50 })),
            offers: Type.Optional(Type.Array(vendorOfferInputSchema, { maxItems: 50 })),
            execution: Type.Optional(Type.Union([Type.Literal("sandbox"), Type.Literal("worker")])),
            idempotencyKey: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
            timeoutS: Type.Optional(Type.Number({ minimum: 1, maximum: 120 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          componentIds?: string[];
          offers?: {
            componentId: string;
            vendor: string;
            sku?: string;
            url: string;
            price?: number;
            currency?: string;
            availability?: string;
          }[];
          execution?: "sandbox" | "worker";
          idempotencyKey?: string;
          timeoutS?: number;
        };
        if ((body.execution ?? "sandbox") === "worker") {
          if (!body.componentIds?.length) {
            return reply.status(400).send({ error: "vendor refresh worker requires componentIds" });
          }
          if (body.offers !== undefined) {
            return reply.status(400).send({ error: "vendor refresh worker does not accept inline offers" });
          }
          if (!body.idempotencyKey) {
            return reply.status(400).send({ error: "vendor refresh worker requires an idempotencyKey" });
          }
          const job = await createJob(db, user, {
            kind: "commerce.vendor-refresh",
            provider: "local",
            payload: {
              componentIds: body.componentIds,
              timeoutS: body.timeoutS ?? 120,
            },
            idempotencyKey: body.idempotencyKey,
          });
          return reply.status(202).send({ job });
        }
        let offers = body.offers ?? [];
        if (offers.length === 0 && body.componentIds?.length) {
          const base = parseExternalHttpsUrl(
            process.env.FORGE_VENDOR_OFFER_BASE_URL ?? "https://vendor.example.invalid/components",
            "vendor offer base URL",
          );
          offers = body.componentIds.map((componentId) => ({
            componentId,
            vendor: "sandbox-vendor-link",
            sku: componentId,
            url: new URL(`${base.pathname.replace(/\/$/, "")}/${encodeURIComponent(componentId)}`, base).href,
            availability: "unknown",
          }));
        }
        if (offers.length === 0) {
          return reply.status(400).send({ error: "vendor offer refresh requires offers or componentIds" });
        }
        const inserted = [];
        for (const offer of offers) {
          if (!offer.componentId || !offer.vendor || !offer.url) continue;
          const url = parseExternalHttpsUrl(offer.url, "vendor offer URL", { errorStatusCode: 400 }).href;
          inserted.push(
            await insertVendorOffer(db, {
              ...offer,
              url,
              availability: offer.availability,
              source: "sandbox",
              provenance: {
                refreshedBy: user.id,
                normalizedBy: "gateway-sandbox",
                quoteLinkOnly: true,
              },
            }),
          );
        }
        await recordUsageEvent(db, user, {
          eventKind: "vendor-offer-refresh",
          provider: "sandbox",
          units: { offers: inserted.length },
          idempotencyKey: null,
        });
        return reply.status(201).send({ offers: inserted });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/commerce/print-quotes",
    {
      schema: {
        querystring: Type.Object(
          { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })) },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { limit?: number };
        return reply.send({ quotes: await listPrintQuoteRequests(db, user, query.limit ?? 50) });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/commerce/print-quotes",
    {
      schema: {
        body: Type.Object(
          {
            artifactBlobId: Type.String({ minLength: 1 }),
            modelId: Type.Optional(Type.String({ minLength: 1 })),
            jobId: Type.Optional(Type.String({ minLength: 1 })),
            process: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
            material: Type.Optional(Type.String({ minLength: 1, maxLength: 80 })),
            profile: Type.Optional(Type.Unknown()),
            quantity: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            dfmArtifact: Type.Optional(Type.Unknown()),
            offer: Type.Optional(Type.Unknown()),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          artifactBlobId: string;
          modelId?: string;
          jobId?: string;
          process?: string;
          material?: string;
          profile?: unknown;
          quantity?: number;
          dfmArtifact?: unknown;
          offer?: unknown;
        };
        const blob = await getOwnedObjectBlob(db, user, body.artifactBlobId);
        if (!blob) return reply.status(404).send({ error: "print quote artifact blob not found" });
        const endpoint = process.env.FORGE_PRINT_QUOTE_ENDPOINT?.trim();
        let offer = isRecord(body.offer) ? body.offer : {};
        if (endpoint) {
          const endpointUrl = parseExternalHttpsUrl(endpoint, "print quote endpoint");
          const { value: remote } = await fetchBoundedJson(endpointUrl.href, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, objectKey: blob.objectKey, bucket: blob.bucket, checkout: "off-platform" }),
          }, {
            label: "print quote endpoint",
            allowedHosts: [endpointUrl.hostname],
            maxResponseBytes: 512 * 1024,
          });
          if (!isRecord(remote) || !isRecord(remote.offer)) {
            throw Object.assign(new Error("print quote endpoint returned invalid JSON"), { statusCode: 503 });
          }
          offer = remote.offer;
        }
        const quote = await createPrintQuoteRequest(db, user, {
          modelId: body.modelId ?? null,
          jobId: body.jobId ?? null,
          artifactBlobId: body.artifactBlobId,
          process: body.process,
          material: body.material,
          profile: body.profile,
          quantity: body.quantity,
          dfmArtifact: body.dfmArtifact ?? { artifactBlobId: body.artifactBlobId, objectKey: blob.objectKey },
          offer: {
            provider: typeof offer.provider === "string" ? offer.provider : undefined,
            providerQuoteId: typeof offer.providerQuoteId === "string" ? offer.providerQuoteId : null,
            quoteUrl: typeof offer.quoteUrl === "string"
              ? parseExternalHttpsUrl(offer.quoteUrl, "print quote URL", { errorStatusCode: 400 }).href
              : undefined,
            price: typeof offer.price === "number" ? offer.price : null,
            currency: typeof offer.currency === "string" ? offer.currency : null,
            leadTimeDays: typeof offer.leadTimeDays === "number" ? offer.leadTimeDays : null,
            expiresAt: typeof offer.expiresAt === "string" ? offer.expiresAt : null,
            terms: isRecord(offer.terms) ? offer.terms : {},
          },
        });
        await recordUsageEvent(db, user, {
          eventKind: "print-quote-link",
          provider: endpoint ? "live" : "sandbox",
          units: { quantity: quote.quantity, offerCount: quote.offers.length },
          idempotencyKey: null,
        });
        return reply.status(201).send({ quote });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.register(async (ownedListingsApp) => {
    if (rateLimitPolicy !== null) {
      await ownedListingsApp.register(fastifyRateLimit, {
        global: true,
        max: rateLimitPolicy.limits.public,
        timeWindow: rateLimitPolicy.windowMs,
        cache: 20_000,
        keyGenerator: (request) => secretFingerprint(requestRateLimitIdentity(request)),
        errorResponseBuilder: () => ({ statusCode: 429, error: "rate limit exceeded" }),
      });
    }
    ownedListingsApp.get(
      "/v1/listings/mine",
      {
        config: {
          rateLimit: {
            max: rateLimitPolicy?.limits.public ?? DEFAULT_RATE_LIMIT_POLICY.limits.public,
            timeWindow: rateLimitPolicy?.windowMs ?? DEFAULT_RATE_LIMIT_POLICY.windowMs,
            groupId: "owner-listings",
          },
        },
        schema: {
          querystring: Type.Object(
            {
              limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            },
            { additionalProperties: false },
          ),
        },
      },
      async (request, reply) => {
        try {
          const user = await requireUser(request, db);
          const query = request.query as { limit?: number };
          const result = await db.query<{
            id: string;
            listing_kind: string;
            status: string;
            title: string;
            license_class: string | null;
            export_policy: string;
            price_credits: string | number;
            created_at: Date | string;
          }>(
            `SELECT id, listing_kind, status, title, license_class, export_policy, price_credits, created_at
             FROM marketplace_listings
            WHERE owner_user_id = $1
            ORDER BY created_at DESC
            LIMIT $2`,
            [user.id, query.limit ?? 50],
          );
          return reply.send({
            listings: result.rows.map((row) => ({
              id: row.id,
              kind: row.listing_kind,
              status: row.status,
              title: row.title,
              licenseClass: row.license_class,
              exportPolicy: row.export_policy,
              priceCredits: Number(row.price_credits),
              createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
            })),
          });
        } catch (error) {
          const mapped = routeError(error);
          return reply.status(mapped.statusCode).send(mapped.body);
        }
      },
    );
  });

  app.get(
    "/v1/listings",
    {
      schema: {
        querystring: Type.Object(
          {
            kind: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
            status: Type.Optional(listingStatusSchema),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const query = request.query as { kind?: string; status?: string; limit?: number };
        const status = query.status ?? "listed";
        if (status !== "listed" && !reviewAuthorized(request, reviewToken)) {
          return reply.status(401).send({ error: "listing curation auth required" });
        }
        const result = await db.query<{
          id: string;
          listing_kind: string;
          status: string;
          title: string;
          license_class: string | null;
          export_policy: string;
          price_credits: string | number;
          created_at: Date | string;
        }>(
          `SELECT id, listing_kind, status, title, license_class, export_policy, price_credits, created_at
             FROM marketplace_listings
            WHERE status = $1
              AND ($2::text IS NULL OR listing_kind = $2)
            ORDER BY created_at DESC
            LIMIT $3`,
          [status, query.kind ?? null, query.limit ?? 50],
        );
        return reply.send({
          listings: result.rows.map((row) => ({
            id: row.id,
            kind: row.listing_kind,
            status: row.status,
            title: row.title,
            licenseClass: row.license_class,
            exportPolicy: row.export_policy,
            priceCredits: Number(row.price_credits),
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          })),
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.patch(
    "/v1/listings/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        body: Type.Object(
          {
            status: listingStatusSchema,
            reviewer: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            note: Type.Optional(Type.String({ maxLength: 2000 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (!reviewAuthorized(request, reviewToken)) {
        return reply.status(401).send({ error: "listing curation auth required" });
      }
      try {
        const { id } = request.params as { id: string };
        const body = request.body as { status: string; reviewer?: string; note?: string };
        const moderation = {
          curatedAt: new Date().toISOString(),
          reviewer: body.reviewer ?? "reviewer",
          note: body.note ?? "",
          status: body.status,
        };
        const result = await db.query<{
          id: string;
          listing_kind: string;
          status: string;
          title: string;
          license_class: string | null;
          export_policy: string;
          price_credits: string | number;
          created_at: Date | string;
        }>(
          `UPDATE marketplace_listings
              SET status = $2,
                  moderation = moderation || $3::jsonb,
                  updated_at = now()
            WHERE id = $1
            RETURNING id, listing_kind, status, title, license_class, export_policy, price_credits, created_at`,
          [id, body.status, JSON.stringify(moderation)],
        );
        const row = result.rows[0];
        if (!row) return reply.status(404).send({ error: "listing not found" });
        return reply.send({
          listing: {
            id: row.id,
            kind: row.listing_kind,
            status: row.status,
            title: row.title,
            licenseClass: row.license_class,
            exportPolicy: row.export_policy,
            priceCredits: Number(row.price_credits),
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          },
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/listings",
    {
      schema: {
        body: Type.Object(
          {
            modelId: Type.String({ minLength: 1 }),
            title: Type.String({ minLength: 1, maxLength: 160 }),
            listingKind: Type.Optional(listingKindSchema),
            priceCredits: Type.Optional(Type.Number({ minimum: 0 })),
            policySignoff: Type.Optional(Type.Unknown()),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          modelId: string;
          title: string;
          listingKind?: string;
          priceCredits?: number;
          policySignoff?: unknown;
        };
        const model = await getOwnedModel(db, user, body.modelId);
        if (model === null) return reply.status(404).send({ error: "model not found" });
        if (model.status !== "admitted") {
          return reply.status(409).send({ error: "marketplace listings require an admitted validator report" });
        }
        if ((body.listingKind ?? "model") === "policy") {
          const platformGate = await currentPlatformGate(db, "p11.policy-sharing");
          if (platformGate.status !== "accepted" || platformGate.revokedAt !== null) {
            return reply.status(409).send({ error: "policy sharing platform gate is not accepted" });
          }
          if (!policySignoffAccepted(body.policySignoff)) {
            return reply.status(409).send({ error: "policy listings require dual-use/export-control signoff" });
          }
        }
        const result = await db.query<{ id: string }>(
          `INSERT INTO marketplace_listings (
             owner_user_id, model_id, listing_kind, status, title, license_class, export_policy,
             price_credits, validator_report, moderation
           )
           VALUES ($1, $2, $3, 'review', $4, 'open', 'assembly-policy-derived', $5, $6::jsonb, $7::jsonb)
           RETURNING id`,
          [
            user.id,
            model.id,
            body.listingKind ?? "model",
            body.title,
            body.priceCredits ?? 0,
            JSON.stringify(model.validatorReport),
            JSON.stringify({ dualUseSignoff: "required-before-listed" }),
          ],
        );
        if ((body.listingKind ?? "model") === "policy") {
          await db.query(
            `INSERT INTO policy_signoffs (
               owner_user_id, target_kind, target_id, jurisdiction, policy_version, status, answers
             )
             VALUES ($1, 'marketplace-listing', $2, $3, 'p11-local-2026-06-14', 'accepted', $4::jsonb)`,
            [
              user.id,
              result.rows[0].id,
              isRecord(body.policySignoff) && typeof body.policySignoff.jurisdiction === "string"
                ? body.policySignoff.jurisdiction
                : "unspecified",
              JSON.stringify(body.policySignoff ?? {}),
            ],
          );
        }
        return reply.status(201).send({ id: result.rows[0].id, status: "review" });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/listings/:id/usage",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        body: Type.Object(
          {
            event: Type.Union([
              Type.Literal("view"),
              Type.Literal("equip"),
              Type.Literal("quote-click"),
              Type.Literal("policy-download"),
              Type.Literal("training-job"),
            ]),
            listingKind: Type.Optional(listingKindSchema),
            creditsSpent: Type.Optional(Type.Number({ minimum: 0 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as {
          event: "view" | "equip" | "quote-click" | "policy-download" | "training-job";
          listingKind?: "model" | "course" | "skill" | "component" | "policy";
          creditsSpent?: number;
        };
        await recordMarketplaceUsageRollup(db, {
          listingId: id,
          listingKind: body.listingKind ?? "model",
          event: body.event,
          creditsSpent: body.creditsSpent ?? 0,
        });
        await recordUsageEvent(db, null, {
          eventKind: `marketplace.${body.event}`,
          provider: "usage-beta",
          units: { listingId: id, listingKind: body.listingKind ?? "model" },
          costCredits: body.creditsSpent ?? 0,
          idempotencyKey: null,
        });
        return reply.status(202).send({ status: "recorded" });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/moderation/reports",
    {
      schema: {
        querystring: Type.Object(
          {
            status: Type.Optional(Type.Union([Type.Literal("open"), Type.Literal("triaged"), Type.Literal("actioned"), Type.Literal("rejected")])),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { status?: string; limit?: number };
        const result = await db.query<{
          id: string;
          target_kind: string;
          target_id: string;
          reason: string;
          detail: string;
          status: string;
          sla_due_at: Date | string;
          repeat_infringer_signal: boolean;
          created_at: Date | string;
        }>(
          `SELECT id, target_kind, target_id, reason, detail, status, sla_due_at,
                  repeat_infringer_signal, created_at
             FROM moderation_reports
            WHERE reporter_user_id = $1
              AND ($2::text IS NULL OR status = $2)
            ORDER BY created_at DESC
            LIMIT $3`,
          [user.id, query.status ?? null, query.limit ?? 50],
        );
        return reply.send({
          reports: result.rows.map((row) => ({
            id: row.id,
            targetKind: row.target_kind,
            targetId: row.target_id,
            reason: row.reason,
            detail: row.detail,
            status: row.status,
            slaDueAt: row.sla_due_at instanceof Date ? row.sla_due_at.toISOString() : row.sla_due_at,
            repeatInfringerSignal: row.repeat_infringer_signal,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          })),
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/moderation/reports",
    {
      schema: {
        body: Type.Object(
          {
            targetKind: moderationTargetSchema,
            targetId: Type.String({ minLength: 1, maxLength: 200 }),
            reason: moderationReasonSchema,
            detail: Type.Optional(Type.String({ maxLength: 4000 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          targetKind: string;
          targetId: string;
          reason: string;
          detail?: string;
        };
        const result = await db.query<{
          id: string;
          status: string;
          sla_due_at: Date | string;
          repeat_infringer_signal: boolean;
        }>(
          `INSERT INTO moderation_reports (
             reporter_user_id, target_kind, target_id, reason, detail, repeat_infringer_signal
           )
           VALUES (
             $1, $2, $3, $4, $5,
             EXISTS (
               SELECT 1 FROM moderation_reports
                WHERE target_kind = $2
                  AND target_id = $3
                  AND status IN ('open', 'triaged', 'actioned')
                LIMIT 1
             )
           )
           RETURNING id, status, sla_due_at, repeat_infringer_signal`,
          [user.id, body.targetKind, body.targetId, body.reason, body.detail ?? ""],
        );
        const row = result.rows[0];
        return reply.status(201).send({
          id: row.id,
          status: row.status,
          slaDueAt: row.sla_due_at instanceof Date ? row.sla_due_at.toISOString() : row.sla_due_at,
          repeatInfringerSignal: row.repeat_infringer_signal,
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.patch(
    "/v1/moderation/reports/:id",
    {
      schema: {
        params: Type.Object({ id: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
        body: Type.Object(
          {
            status: moderationStatusSchema,
            action: Type.Optional(moderationActionSchema),
            reviewer: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            note: Type.Optional(Type.String({ maxLength: 2000 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (!reviewAuthorized(request, reviewToken)) {
        return reply.status(401).send({ error: "moderation auth required" });
      }
      try {
        const { id } = request.params as { id: string };
        const body = request.body as {
          status: "open" | "triaged" | "actioned" | "rejected";
          action?: "none" | "delist-listing";
          reviewer?: string;
          note?: string;
        };
        const note = body.note?.trim()
          ? `curation ${new Date().toISOString()} ${body.reviewer ?? "reviewer"}: ${body.note.trim()}`
          : "";
        const result = await db.query<{
          id: string;
          target_kind: string;
          target_id: string;
          reason: string;
          detail: string;
          status: string;
          sla_due_at: Date | string;
          repeat_infringer_signal: boolean;
          created_at: Date | string;
        }>(
          `UPDATE moderation_reports
              SET status = $2,
                  detail = CASE
                    WHEN $3::text = '' THEN detail
                    WHEN detail = '' THEN $3
                    ELSE detail || E'\n\n' || $3
                  END,
                  updated_at = now()
            WHERE id = $1
            RETURNING id, target_kind, target_id, reason, detail, status,
                      sla_due_at, repeat_infringer_signal, created_at`,
          [id, body.status, note],
        );
        const row = result.rows[0];
        if (!row) return reply.status(404).send({ error: "moderation report not found" });
        let listing: unknown = null;
        if (body.status === "actioned" && body.action === "delist-listing" && row.target_kind === "listing") {
          const listingResult = await db.query<{
            id: string;
            listing_kind: string;
            status: string;
            title: string;
            license_class: string | null;
            export_policy: string;
            price_credits: string | number;
            created_at: Date | string;
          }>(
            `UPDATE marketplace_listings
                SET status = 'delisted',
                    moderation = moderation || $2::jsonb,
                    updated_at = now()
              WHERE id = $1
              RETURNING id, listing_kind, status, title, license_class, export_policy, price_credits, created_at`,
            [
              row.target_id,
              JSON.stringify({
                delistedByReportId: row.id,
                reviewer: body.reviewer ?? "reviewer",
                reason: row.reason,
                actionedAt: new Date().toISOString(),
              }),
            ],
          );
          const listingRow = listingResult.rows[0];
          listing = listingRow
            ? {
                id: listingRow.id,
                kind: listingRow.listing_kind,
                status: listingRow.status,
                title: listingRow.title,
                licenseClass: listingRow.license_class,
                exportPolicy: listingRow.export_policy,
                priceCredits: Number(listingRow.price_credits),
                createdAt: listingRow.created_at instanceof Date ? listingRow.created_at.toISOString() : listingRow.created_at,
              }
            : null;
        }
        return reply.send({
          report: {
            id: row.id,
            targetKind: row.target_kind,
            targetId: row.target_id,
            reason: row.reason,
            detail: row.detail,
            status: row.status,
            slaDueAt: row.sla_due_at instanceof Date ? row.sla_due_at.toISOString() : row.sla_due_at,
            repeatInfringerSignal: row.repeat_infringer_signal,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          },
          listing,
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/maintenance/records",
    {
      schema: {
        querystring: Type.Object(
          {
            modelId: Type.Optional(Type.String({ minLength: 1 })),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const query = request.query as { modelId?: string; limit?: number };
        const result = await db.query<{
          id: string;
          model_id: string | null;
          record_kind: string;
          severity: string;
          summary: string;
          payload: unknown;
          created_at: Date | string;
        }>(
          `SELECT id, model_id, record_kind, severity, summary, payload, created_at
             FROM maintenance_records
            WHERE owner_user_id = $1
              AND ($2::text IS NULL OR model_id = $2)
            ORDER BY created_at DESC
            LIMIT $3`,
          [user.id, query.modelId ?? null, query.limit ?? 100],
        );
        return reply.send({
          records: result.rows.map((row) => ({
            id: row.id,
            modelId: row.model_id,
            kind: row.record_kind,
            severity: row.severity,
            summary: row.summary,
            payload: row.payload,
            createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          })),
        });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.post(
    "/v1/maintenance/records",
    {
      schema: {
        body: Type.Object(
          {
            modelId: Type.Optional(Type.String({ minLength: 1 })),
            kind: Type.Union([Type.Literal("wear"), Type.Literal("crash-forensics"), Type.Literal("repair-sheet"), Type.Literal("reorder")]),
            severity: Type.Optional(Type.Union([Type.Literal("info"), Type.Literal("warn"), Type.Literal("critical")])),
            summary: Type.String({ minLength: 1, maxLength: 1000 }),
            payload: Type.Optional(Type.Unknown()),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      try {
        const user = await requireUser(request, db);
        const body = request.body as {
          modelId?: string;
          kind: string;
          severity?: "info" | "warn" | "critical";
          summary: string;
          payload?: unknown;
        };
        const result = await db.query<{ id: string }>(
          `INSERT INTO maintenance_records (owner_user_id, model_id, record_kind, severity, summary, payload)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           RETURNING id`,
          [user.id, body.modelId ?? null, body.kind, body.severity ?? "info", body.summary, JSON.stringify(body.payload ?? {})],
        );
        return reply.status(201).send({ id: result.rows[0].id });
      } catch (error) {
        const mapped = routeError(error);
        return reply.status(mapped.statusCode).send(mapped.body);
      }
    },
  );

  app.get(
    "/v1/reviews",
    {
      schema: {
        querystring: Type.Object(
          {
            status: Type.Optional(reviewStatusSchema),
            limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
            exportPolicy: Type.Optional(reviewExportPolicySchema),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (!reviewAuthorized(request, reviewToken)) {
        return reply.status(401).send({ error: "review auth required" });
      }
      const query = request.query as {
        status?: ReviewStatus;
        limit?: number;
        exportPolicy?: ReviewExportPolicy;
      };
      try {
        const items = await listReviewQueue(
          db,
          query.status ?? "needs_review",
          query.limit ?? 50,
          query.exportPolicy,
        );
        return reply.send({ items });
      } catch (error) {
        return reply.status(503).send(unavailable());
      }
    },
  );

  app.patch(
    "/v1/reviews/:id",
    {
      schema: {
        params: Type.Object({ id: Type.Integer({ minimum: 1 }) }),
        body: Type.Object(
          {
            status: reviewDecisionSchema,
            reviewer: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
            reviewNote: Type.Optional(Type.String({ maxLength: 2000 })),
            exportPolicy: Type.Optional(reviewExportPolicySchema),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      if (!reviewAuthorized(request, reviewToken)) {
        return reply.status(401).send({ error: "review auth required" });
      }
      const { id } = request.params as { id: number };
      const { status, reviewer, reviewNote, exportPolicy } = request.body as {
        status: ReviewDecision;
        reviewer?: string;
        reviewNote?: string;
        exportPolicy?: ReviewExportPolicy;
      };
      try {
        const item = await recordReviewDecision(db, id, {
          status,
          reviewer: reviewer ?? null,
          reviewNote: reviewNote ?? null,
          exportPolicy: exportPolicy ?? null,
        });
        if (item === null) {
          return reply.status(404).send({ error: "review item not found or already closed" });
        }
        return reply.send(item);
      } catch (error) {
        return reply.status(503).send(unavailable());
      }
    },
  );

  // the schemars-emitted JSON Schema — the single source all clients derive
  // from (D16); served for tooling and the generation prompt prefix (P4).
  app.get("/v1/schema", async (_request, reply) => {
    const schema = await new Promise<string | null>((resolve) => {
      execFile(validatorBin(), ["schema"], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 },
        (error, stdout) => resolve(error ? null : String(stdout)));
    });
    if (schema === null) {
      return reply.status(503).send({ error: "validator unavailable" });
    }
    return reply.type("application/schema+json").send(schema);
  });

  return app;
}
