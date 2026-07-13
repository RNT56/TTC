import { createHash, randomUUID } from "node:crypto";
import { fixtureLicenseFilteredGeometry } from "./licenseExports.js";
import {
  sourceBlobIdsFromPayload,
  telemetryLogIdsFromPayload,
  withActiveConsents,
} from "./consent.js";
import type { CurrentUser } from "./auth.js";
import type { GatewayDb } from "./db.js";
import type { GenerationRequest, GenerationResponse } from "./generation.js";
import { MAX_OBJECT_BYTES, assertBoundedJson } from "./security.js";
import { runPatch, runValidator, type ValidateResult } from "./validator.js";

export type ModelStatus = "admitted" | "draft" | "rejected";
export type Visibility = "private" | "unlisted" | "public";

export interface ModelRecord {
  id: string;
  ownerUserId: string;
  sourceArtifactId: string | null;
  status: ModelStatus;
  visibility: Visibility;
  name: string;
  archetype: string | null;
  contractHash: string;
  contract: unknown;
  validatorReport: unknown;
  lineage: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ShareSnapshot {
  id: string;
  modelId: string;
  ownerUserId: string;
  contractHash: string;
  contract: unknown;
  validatorReport: unknown;
  createdAt: string;
}

export interface CreditSummary {
  balanceCredits: number;
  ledger: {
    id: number;
    deltaCredits: number;
    reason: string;
    sourceKind: string;
    sourceId: string | null;
    createdAt: string;
  }[];
}

export const JOB_KINDS = [
  "etl.ingest-component",
  "occt.tessellate",
  "photoscan.single",
  "photoscan.multiview",
  "train.policy",
  "train.sysid-fit",
  "replay.verify",
  "codesign.evaluate",
  "bridge.config-diff",
  "bridge.telemetry-ingest",
  "bridge.supervisor-check",
  "commerce.vendor-refresh",
  "maintenance.estimate-wear",
  "maintenance.crash-forensics",
  "maintenance.repair-sheet",
  "maintenance.fleet-summary",
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export interface JobRecord {
  id: string;
  ownerUserId: string | null;
  kind: JobKind;
  status: string;
  provider: "fixture" | "local" | "modal";
  input: unknown;
  output: unknown;
  error: string | null;
  costCredits: number;
  createdAt: string;
}

export interface JobEventRecord {
  id: number;
  jobId: string;
  event: string;
  payload: unknown;
  createdAt: string;
}

export interface ReplayVerification {
  artifactKind: "replay";
  verified: boolean;
  tamperHash: string | null;
  frameCount: number;
  durationS: number;
  header: Record<string, unknown>;
  courseId?: string | null;
  rejectReason: string | null;
}

export interface ReplayArtifact {
  id: string;
  verification: ReplayVerification;
}

export interface ObjectBlobRecord {
  id: string;
  ownerUserId: string | null;
  visibility: Visibility;
  cacheKey: string | null;
  bucket: string;
  objectKey: string;
  contentType: string | null;
  byteSize: number | null;
  sha256: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface PhotoscanArtifactRecord {
  id: string;
  ownerUserId: string | null;
  jobId: string | null;
  sourceBlobIds: string[];
  artifactBlobId: string | null;
  scaleAxesPorts: unknown;
  refitPrimitives: unknown;
  candidateComponent: unknown;
  validatorReport: unknown;
  createdAt: string;
}

export interface PolicyArtifactRecord {
  id: string;
  ownerUserId: string | null;
  modelId: string | null;
  taskKind: string;
  scorecard: unknown;
  artifactBlobId: string | null;
  exportGate: string;
  createdAt: string;
}

export interface ReplayArtifactRecord {
  id: string;
  ownerUserId: string | null;
  modelId: string | null;
  verification: unknown;
  tamperHash: string | null;
  createdAt: string;
}

export interface TelemetryLogRecord {
  id: string;
  ownerUserId: string | null;
  modelId: string | null;
  source: string;
  capturedAt: string;
  tape: unknown;
  privacy: unknown;
  createdAt: string;
}

export type PlatformGateKey = "d28.hardware" | "p11.policy-sharing" | "p11.marketplace-economics";
export type PlatformGateStatus = "blocked" | "accepted" | "revoked";

export interface PlatformGateSignoff {
  id: string;
  gateKey: PlatformGateKey;
  status: PlatformGateStatus;
  policyVersion: string;
  jurisdiction: string;
  reviewer: string;
  evidence: unknown;
  evidenceUrl: string | null;
  effectiveAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobCapabilityState {
  enabled: boolean;
  configured: boolean;
  mode: string;
  reason: string | null;
}

export interface JobCapabilities {
  providers: Record<"fixture" | "local" | "modal", JobCapabilityState>;
  live: Record<
    | "rapier"
    | "mujoco"
    | "sb3"
    | "claudeExtraction"
    | "occt"
    | "colmap"
    | "onnxRuntime"
    | "vendorRefresh"
    | "printQuotes",
    JobCapabilityState
  >;
  gates: PlatformGateSignoff[];
  hardware: {
    labMode: boolean;
    d12RigAllowlist: string[];
    noAutoArm: true;
  };
}

export interface VendorOfferRecord {
  id: string;
  componentId: string;
  vendor: string;
  sku: string | null;
  url: string;
  price: number | null;
  currency: string | null;
  availability: string;
  source: "catalog" | "live" | "sandbox";
  provenance: unknown;
  fetchedAt: string;
  createdAt: string;
}

export interface PrintQuoteRequestRecord {
  id: string;
  ownerUserId: string | null;
  modelId: string | null;
  jobId: string | null;
  artifactBlobId: string | null;
  process: string;
  material: string;
  profile: unknown;
  quantity: number;
  dfmArtifact: unknown;
  status: string;
  createdAt: string;
  updatedAt: string;
  offers: PrintQuoteOfferRecord[];
}

export interface PrintQuoteOfferRecord {
  id: string;
  requestId: string;
  provider: string;
  providerQuoteId: string | null;
  quoteUrl: string;
  price: number | null;
  currency: string | null;
  leadTimeDays: number | null;
  expiresAt: string | null;
  terms: unknown;
  createdAt: string;
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

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function nowIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function reportVerdict(report: unknown): ModelStatus {
  if (isRecord(report) && typeof report.verdict === "string") {
    if (report.verdict === "admitted" || report.verdict === "draft" || report.verdict === "rejected") {
      return report.verdict;
    }
  }
  return "rejected";
}

function contractMeta(contract: unknown): { name: string; archetype: string | null } {
  if (!isRecord(contract) || !isRecord(contract.meta)) {
    return { name: "Untitled model", archetype: null };
  }
  return {
    name: typeof contract.meta.name === "string" ? contract.meta.name : "Untitled model",
    archetype: typeof contract.meta.archetype === "string" ? contract.meta.archetype : null,
  };
}

function mapModel(row: {
  id: string;
  owner_user_id: string;
  source_artifact_id: string | null;
  status: ModelStatus;
  visibility: Visibility;
  name: string;
  archetype: string | null;
  contract_hash: string;
  contract: unknown;
  validator_report: unknown;
  lineage: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}): ModelRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    sourceArtifactId: row.source_artifact_id,
    status: row.status,
    visibility: row.visibility,
    name: row.name,
    archetype: row.archetype,
    contractHash: row.contract_hash,
    contract: row.contract,
    validatorReport: row.validator_report,
    lineage: row.lineage,
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

function mapShare(row: {
  id: string;
  model_id: string;
  owner_user_id: string;
  contract_hash: string;
  contract: unknown;
  validator_report: unknown;
  created_at: Date | string;
}): ShareSnapshot {
  return {
    id: row.id,
    modelId: row.model_id,
    ownerUserId: row.owner_user_id,
    contractHash: row.contract_hash,
    contract: row.contract,
    validatorReport: row.validator_report,
    createdAt: nowIso(row.created_at),
  };
}

function mapJob(row: {
  id: string;
  owner_user_id: string | null;
  kind: JobKind;
  status: string;
  provider: "fixture" | "local" | "modal";
  input: unknown;
  output: unknown;
  error: string | null;
  cost_credits: string | number;
  created_at: Date | string;
}): JobRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    kind: row.kind,
    status: row.status,
    provider: row.provider,
    input: row.input,
    output: row.output,
    error: row.error,
    costCredits: Number(row.cost_credits),
    createdAt: nowIso(row.created_at),
  };
}

function mapObjectBlob(row: {
  id: string;
  owner_user_id: string | null;
  visibility: Visibility;
  cache_key: string | null;
  bucket: string;
  object_key: string;
  content_type: string | null;
  byte_size: string | number | null;
  sha256: string | null;
  metadata: unknown;
  created_at: Date | string;
}): ObjectBlobRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    visibility: row.visibility,
    cacheKey: row.cache_key,
    bucket: row.bucket,
    objectKey: row.object_key,
    contentType: row.content_type,
    byteSize: row.byte_size === null ? null : Number(row.byte_size),
    sha256: row.sha256,
    metadata: row.metadata,
    createdAt: nowIso(row.created_at),
  };
}

function mapJobEvent(row: {
  id: string | number;
  job_id: string;
  event: string;
  payload: unknown;
  created_at: Date | string;
}): JobEventRecord {
  return {
    id: Number(row.id),
    jobId: row.job_id,
    event: row.event,
    payload: row.payload,
    createdAt: nowIso(row.created_at),
  };
}

function mapPhotoscanArtifact(row: {
  id: string;
  owner_user_id: string | null;
  job_id: string | null;
  source_blob_ids: string[] | null;
  artifact_blob_id: string | null;
  scale_axes_ports: unknown;
  refit_primitives: unknown;
  candidate_component: unknown;
  validator_report: unknown;
  created_at: Date | string;
}): PhotoscanArtifactRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    jobId: row.job_id,
    sourceBlobIds: row.source_blob_ids ?? [],
    artifactBlobId: row.artifact_blob_id,
    scaleAxesPorts: row.scale_axes_ports,
    refitPrimitives: row.refit_primitives,
    candidateComponent: row.candidate_component,
    validatorReport: row.validator_report,
    createdAt: nowIso(row.created_at),
  };
}

function mapPolicyArtifact(row: {
  id: string;
  owner_user_id: string | null;
  model_id: string | null;
  task_kind: string;
  scorecard: unknown;
  artifact_blob_id: string | null;
  export_gate: string;
  created_at: Date | string;
}): PolicyArtifactRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    modelId: row.model_id,
    taskKind: row.task_kind,
    scorecard: row.scorecard,
    artifactBlobId: row.artifact_blob_id,
    exportGate: row.export_gate,
    createdAt: nowIso(row.created_at),
  };
}

function mapReplayArtifact(row: {
  id: string;
  owner_user_id: string | null;
  model_id: string | null;
  verification: unknown;
  tamper_hash: string | null;
  created_at: Date | string;
}): ReplayArtifactRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    modelId: row.model_id,
    verification: row.verification,
    tamperHash: row.tamper_hash,
    createdAt: nowIso(row.created_at),
  };
}

function mapTelemetryLog(row: {
  id: string;
  owner_user_id: string | null;
  model_id: string | null;
  source: string;
  captured_at: Date | string;
  tape: unknown;
  privacy: unknown;
  created_at: Date | string;
}): TelemetryLogRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    modelId: row.model_id,
    source: row.source,
    capturedAt: nowIso(row.captured_at),
    tape: row.tape,
    privacy: row.privacy,
    createdAt: nowIso(row.created_at),
  };
}

function mapPlatformGate(row: {
  id: string;
  gate_key: PlatformGateKey;
  status: PlatformGateStatus;
  policy_version: string;
  jurisdiction: string;
  reviewer: string;
  evidence: unknown;
  evidence_url: string | null;
  effective_at: Date | string | null;
  revoked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}): PlatformGateSignoff {
  return {
    id: row.id,
    gateKey: row.gate_key,
    status: row.status,
    policyVersion: row.policy_version,
    jurisdiction: row.jurisdiction,
    reviewer: row.reviewer,
    evidence: row.evidence,
    evidenceUrl: row.evidence_url,
    effectiveAt: row.effective_at === null ? null : nowIso(row.effective_at),
    revokedAt: row.revoked_at === null ? null : nowIso(row.revoked_at),
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
  };
}

function mapVendorOffer(row: {
  id: string;
  component_id: string;
  vendor: string;
  sku: string | null;
  url: string;
  price: string | number | null;
  currency: string | null;
  availability: string;
  source: "catalog" | "live" | "sandbox";
  provenance: unknown;
  fetched_at: Date | string;
  created_at: Date | string;
}): VendorOfferRecord {
  return {
    id: row.id,
    componentId: row.component_id,
    vendor: row.vendor,
    sku: row.sku,
    url: row.url,
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    availability: row.availability,
    source: row.source,
    provenance: row.provenance,
    fetchedAt: nowIso(row.fetched_at),
    createdAt: nowIso(row.created_at),
  };
}

function mapPrintQuoteOffer(row: {
  id: string;
  request_id: string;
  provider: string;
  provider_quote_id: string | null;
  quote_url: string;
  price: string | number | null;
  currency: string | null;
  lead_time_days: string | number | null;
  expires_at: Date | string | null;
  terms: unknown;
  created_at: Date | string;
}): PrintQuoteOfferRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    provider: row.provider,
    providerQuoteId: row.provider_quote_id,
    quoteUrl: row.quote_url,
    price: row.price === null ? null : Number(row.price),
    currency: row.currency,
    leadTimeDays: row.lead_time_days === null ? null : Number(row.lead_time_days),
    expiresAt: row.expires_at === null ? null : nowIso(row.expires_at),
    terms: row.terms,
    createdAt: nowIso(row.created_at),
  };
}

function mapPrintQuoteRequest(row: {
  id: string;
  owner_user_id: string | null;
  model_id: string | null;
  job_id: string | null;
  artifact_blob_id: string | null;
  process: string;
  material: string;
  profile: unknown;
  quantity: string | number;
  dfm_artifact: unknown;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  offers?: PrintQuoteOfferRecord[];
}): PrintQuoteRequestRecord {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    modelId: row.model_id,
    jobId: row.job_id,
    artifactBlobId: row.artifact_blob_id,
    process: row.process,
    material: row.material,
    profile: row.profile,
    quantity: Number(row.quantity),
    dfmArtifact: row.dfm_artifact,
    status: row.status,
    createdAt: nowIso(row.created_at),
    updatedAt: nowIso(row.updated_at),
    offers: row.offers ?? [],
  };
}

function safeObjectSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "artifact";
}

function blobCacheKey(user: CurrentUser, input: { cacheKey?: string | null; sha256?: string | null }): string | null {
  if (input.cacheKey) return `${safeObjectSegment(user.id)}:${input.cacheKey}`;
  if (input.sha256) return `${safeObjectSegment(user.id)}:sha256:${input.sha256.toLowerCase()}`;
  return null;
}

function scopedJobIdempotencyKey(userId: string, key: string): string {
  return createHash("sha256")
    .update("forge-job-idempotency-v1\0")
    .update(userId)
    .update("\0")
    .update(key)
    .digest("hex");
}

function newJobId(): string {
  return `job-${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function defaultObjectKey(user: CurrentUser, purpose: string, sha: string | null): string {
  const owner = safeObjectSegment(user.id);
  const safePurpose = safeObjectSegment(purpose);
  const leaf = sha ? sha.toLowerCase() : randomUUID();
  return `users/${owner}/${safePurpose}/${leaf}`;
}

function objectBucket(): string {
  return process.env.FORGE_OBJECT_BUCKET ?? "forge-artifacts";
}

const PLATFORM_GATE_KEYS: PlatformGateKey[] = ["d28.hardware", "p11.policy-sharing", "p11.marketplace-economics"];
const D12_RIG_ALLOWLIST = [
  "ref_quad_kakute-h7-source-one-5in",
  "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
];

function envEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function envConfigured(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

function capability(
  enabled: boolean,
  configured: boolean,
  mode: string,
  reason: string | null,
): JobCapabilityState {
  return { enabled, configured, mode, reason: enabled ? null : reason };
}

function defaultGate(gateKey: PlatformGateKey): PlatformGateSignoff {
  const reasons: Record<PlatformGateKey, string> = {
    "d28.hardware": "D28 legal/hardware signoff has not been recorded",
    "p11.policy-sharing": "dual-use/export-control platform signoff has not been recorded",
    "p11.marketplace-economics": "usage-beta economics decision is active; payout economics are deferred",
  };
  return {
    id: `default-${gateKey}`,
    gateKey,
    status: "blocked",
    policyVersion: "p4-p12-live-gates-2026-06-14",
    jurisdiction: "unspecified",
    reviewer: "system",
    evidence: { reason: reasons[gateKey] },
    evidenceUrl: null,
    effectiveAt: null,
    revokedAt: null,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
}

function artifactObjectKey(user: CurrentUser, purpose: string, cacheKey: string): string {
  const owner = safeObjectSegment(user.id);
  const safePurpose = safeObjectSegment(purpose);
  const safeKey = safeObjectSegment(cacheKey);
  return `users/${owner}/${safePurpose}/${safeKey}-${sha256(cacheKey).slice(0, 16)}`;
}

function nestedCacheKey(output: Record<string, unknown>, field: string): string | null {
  const value = output[field];
  return isRecord(value) && typeof value.cacheKey === "string"
    ? value.cacheKey
    : isRecord(value) && typeof value.key === "string"
      ? value.key
      : null;
}

async function upsertArtifactBlob(
  db: GatewayDb,
  user: CurrentUser,
  input: { purpose: string; cacheKey: string | null; contentType?: string | null; metadata?: Record<string, unknown> },
): Promise<string | null> {
  if (!input.cacheKey) return null;
  const cacheKey = blobCacheKey(user, { cacheKey: input.cacheKey });
  const result = await db.query<{ id: string }>(
    `INSERT INTO object_blobs (
       owner_user_id, visibility, cache_key, bucket, object_key,
       content_type, metadata
     )
     VALUES ($1, 'private', $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (cache_key) DO UPDATE
     SET metadata = object_blobs.metadata || EXCLUDED.metadata,
         content_type = COALESCE(object_blobs.content_type, EXCLUDED.content_type)
     RETURNING id`,
    [
      user.id,
      cacheKey,
      objectBucket(),
      artifactObjectKey(user, input.purpose, input.cacheKey),
      input.contentType ?? "application/octet-stream",
      json({ ...(input.metadata ?? {}), purpose: input.purpose, cacheKey: input.cacheKey }),
    ],
  );
  return result.rows[0]?.id ?? null;
}

function numericFrameTimes(tape: unknown): { times: number[]; rejectReason: string | null } {
  if (!isRecord(tape)) return { times: [], rejectReason: "replay.verify requires tape object" };
  const frames = tape.frames;
  if (!Array.isArray(frames) || frames.length === 0) {
    return { times: [], rejectReason: "replay tape requires non-empty frames" };
  }
  const times: number[] = [];
  for (const frame of frames) {
    if (!isRecord(frame) || typeof frame.t !== "number" || !Number.isFinite(frame.t)) {
      return { times: [], rejectReason: "replay frames must be objects with numeric t" };
    }
    times.push(frame.t);
  }
  return { times, rejectReason: null };
}

export function verifyReplayTape(
  tape: unknown,
  options: { expectedHash?: string | null; expectedContractHash?: string | null; courseId?: string | null } = {},
): ReplayVerification {
  const { times, rejectReason } = numericFrameTimes(tape);
  const tamperHash = rejectReason ? null : sha256(stableJson(tape));
  const header = isRecord(tape) && isRecord(tape.header) ? tape.header : {};
  const monotonic = times.every((time, index) => index === 0 || times[index - 1] < time);
  const expectedHashOk = !options.expectedHash || options.expectedHash === tamperHash;
  const expectedContractOk = !options.expectedContractHash || header.contractHash === options.expectedContractHash;
  let reason = rejectReason;
  if (!reason && !monotonic) reason = "replay timestamps are not strictly increasing";
  if (!reason && !expectedHashOk) reason = "replay hash mismatch";
  if (!reason && !expectedContractOk) reason = "contract hash mismatch";
  return {
    artifactKind: "replay",
    verified: reason === null,
    tamperHash,
    frameCount: times.length,
    durationS: times.length > 0 ? Math.max(0, times[times.length - 1] - times[0]) : 0,
    header,
    courseId: options.courseId ?? null,
    rejectReason: reason,
  };
}

export async function insertReplayArtifact(
  db: GatewayDb,
  user: CurrentUser,
  input: { tape: unknown; verification: ReplayVerification; modelId?: string | null },
): Promise<ReplayArtifact> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO replay_artifacts (owner_user_id, model_id, tape, verification, tamper_hash)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
     RETURNING id`,
    [
      user.id,
      input.modelId ?? null,
      json(input.tape),
      json(input.verification),
      input.verification.tamperHash,
    ],
  );
  return { id: result.rows[0].id, verification: input.verification };
}

export async function registerObjectBlob(
  db: GatewayDb,
  user: CurrentUser,
  input: {
    bucket: string;
    purpose: string;
    contentType?: string | null;
    byteSize?: number | null;
    sha256?: string | null;
    metadata?: unknown;
    cacheKey?: string | null;
  },
): Promise<ObjectBlobRecord> {
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(input.purpose)) {
    throw Object.assign(new Error("object purpose is invalid"), { statusCode: 400 });
  }
  const contentType = input.contentType?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
  const archiveTypes = new Set([
    "application/zip",
    "application/x-7z-compressed",
    "application/x-rar-compressed",
    "application/x-tar",
    "application/gzip",
  ]);
  const originalName = isRecord(input.metadata) && typeof input.metadata.originalName === "string"
    ? input.metadata.originalName.toLowerCase()
    : "";
  if ((contentType && archiveTypes.has(contentType)) || /\.(?:zip|7z|rar|tar|tgz|tar\.gz)$/.test(originalName)) {
    throw Object.assign(new Error("archive uploads are not accepted by the current object boundary"), {
      statusCode: 400,
    });
  }
  if (contentType && !/^[a-z0-9][a-z0-9!#$&^_.+\/-]{0,159}$/.test(contentType)) {
    throw Object.assign(new Error("object content type is invalid"), { statusCode: 400 });
  }
  if (input.byteSize !== undefined && input.byteSize !== null && (
    !Number.isSafeInteger(input.byteSize) || input.byteSize < 0 || input.byteSize > MAX_OBJECT_BYTES
  )) {
    throw Object.assign(new Error("object byte size is outside the supported range"), { statusCode: 400 });
  }
  assertBoundedJson(input.metadata ?? {}, "object metadata", {
    maxBytes: 128 * 1024,
    maxDepth: 12,
    maxNodes: 5_000,
    maxObjectKeys: 256,
  });
  const sha = input.sha256?.toLowerCase() ?? null;
  const cacheKey = blobCacheKey(user, { cacheKey: input.cacheKey, sha256: sha });
  const metadata = isRecord(input.metadata) ? input.metadata : {};
  const result = await db.query<Parameters<typeof mapObjectBlob>[0]>(
    `INSERT INTO object_blobs (
       owner_user_id, visibility, cache_key, bucket, object_key,
       content_type, byte_size, sha256, metadata
     )
     VALUES ($1, 'private', $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (cache_key) DO UPDATE
     SET metadata = object_blobs.metadata || EXCLUDED.metadata,
         content_type = COALESCE(object_blobs.content_type, EXCLUDED.content_type),
         byte_size = COALESCE(object_blobs.byte_size, EXCLUDED.byte_size),
         sha256 = COALESCE(object_blobs.sha256, EXCLUDED.sha256)
     RETURNING id, owner_user_id, visibility, cache_key, bucket, object_key,
               content_type, byte_size, sha256, metadata, created_at`,
    [
      user.id,
      cacheKey,
      input.bucket,
      defaultObjectKey(user, input.purpose, sha),
      input.contentType ?? null,
      input.byteSize ?? null,
      sha,
      json({ ...metadata, purpose: input.purpose }),
    ],
  );
  const blob = mapObjectBlob(result.rows[0]);
  if (blob.ownerUserId !== user.id) {
    throw Object.assign(new Error("object blob cache key is not owned by the current user"), { statusCode: 403 });
  }
  return blob;
}

export async function getOwnedObjectBlob(
  db: GatewayDb,
  user: CurrentUser,
  blobId: string,
): Promise<ObjectBlobRecord | null> {
  const result = await db.query<Parameters<typeof mapObjectBlob>[0]>(
    `SELECT id, owner_user_id, visibility, cache_key, bucket, object_key,
            content_type, byte_size, sha256, metadata, created_at
       FROM object_blobs
      WHERE id = $1
        AND owner_user_id = $2
      LIMIT 1`,
    [blobId, user.id],
  );
  return result.rows[0] ? mapObjectBlob(result.rows[0]) : null;
}

export async function listPhotoscanArtifacts(
  db: GatewayDb,
  user: CurrentUser,
  limit: number,
): Promise<PhotoscanArtifactRecord[]> {
  const result = await db.query<Parameters<typeof mapPhotoscanArtifact>[0]>(
    `SELECT id, owner_user_id, job_id, source_blob_ids, artifact_blob_id,
            scale_axes_ports, refit_primitives, candidate_component, validator_report, created_at
       FROM photoscan_artifacts
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  return result.rows.map(mapPhotoscanArtifact);
}

export async function updatePhotoscanAlignment(
  db: GatewayDb,
  user: CurrentUser,
  artifactId: string,
  alignmentPatch: Record<string, unknown>,
): Promise<PhotoscanArtifactRecord | null> {
  const result = await db.query<Parameters<typeof mapPhotoscanArtifact>[0]>(
    `UPDATE photoscan_artifacts
        SET scale_axes_ports = COALESCE(scale_axes_ports, '{}'::jsonb) || $3::jsonb
      WHERE id = $1
        AND owner_user_id = $2
      RETURNING id, owner_user_id, job_id, source_blob_ids, artifact_blob_id,
                scale_axes_ports, refit_primitives, candidate_component, validator_report, created_at`,
    [artifactId, user.id, json(alignmentPatch)],
  );
  return result.rows[0] ? mapPhotoscanArtifact(result.rows[0]) : null;
}

export async function listPolicyArtifacts(
  db: GatewayDb,
  user: CurrentUser,
  limit: number,
): Promise<PolicyArtifactRecord[]> {
  const result = await db.query<Parameters<typeof mapPolicyArtifact>[0]>(
    `SELECT id, owner_user_id, model_id, task_kind, scorecard, artifact_blob_id, export_gate, created_at
       FROM policy_artifacts
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  return result.rows.map(mapPolicyArtifact);
}

export async function listReplayArtifacts(
  db: GatewayDb,
  user: CurrentUser,
  limit: number,
): Promise<ReplayArtifactRecord[]> {
  const result = await db.query<Parameters<typeof mapReplayArtifact>[0]>(
    `SELECT id, owner_user_id, model_id, verification, tamper_hash, created_at
       FROM replay_artifacts
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  return result.rows.map(mapReplayArtifact);
}

export async function listTelemetryLogs(
  db: GatewayDb,
  user: CurrentUser,
  limit: number,
): Promise<TelemetryLogRecord[]> {
  const result = await db.query<Parameters<typeof mapTelemetryLog>[0]>(
    `SELECT id, owner_user_id, model_id, source, captured_at, tape, privacy, created_at
       FROM telemetry_logs
      WHERE owner_user_id = $1
      ORDER BY captured_at DESC, created_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  return result.rows.map(mapTelemetryLog);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function modelIdFrom(value: unknown): string | null {
  return isRecord(value) && typeof value.modelId === "string" ? value.modelId : null;
}

const ADMITTED_MODEL_JOB_KINDS = new Set<JobKind>([
  "occt.tessellate",
  "train.policy",
  "train.sysid-fit",
  "codesign.evaluate",
  "bridge.config-diff",
]);

async function assertAdmittedModelReference(
  db: GatewayDb,
  user: CurrentUser,
  modelId: string | null,
  surface: string,
): Promise<void> {
  if (modelId === null) return;
  const model = await getOwnedModel(db, user, modelId);
  if (model === null) {
    throw Object.assign(new Error(`${surface} model not found`), { statusCode: 404 });
  }
  if (model.status !== "admitted") {
    throw Object.assign(new Error(`${surface} requires an admitted model; drafts cannot train, export, deploy, or share`), {
      statusCode: 409,
    });
  }
}

function rigIdFrom(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.rigId === "string"
    ? value.rigId
    : typeof value.referenceRigId === "string"
      ? value.referenceRigId
      : null;
}

function hardwareTouchingJob(kind: JobKind, provider: "fixture" | "local" | "modal", payload: unknown): boolean {
  if (provider === "fixture") return false;
  if (kind === "bridge.telemetry-ingest" || kind === "bridge.supervisor-check") return true;
  if (kind !== "bridge.config-diff") return false;
  return isRecord(payload) && (payload.hardware === true || payload.stage === "hitl" || payload.stage === "constrained" || payload.stage === "free");
}

async function assertHardwareGateForJob(
  db: GatewayDb,
  kind: JobKind,
  provider: "fixture" | "local" | "modal",
  payload: unknown,
): Promise<void> {
  if (!hardwareTouchingJob(kind, provider, payload)) return;
  const gate = await currentPlatformGate(db, "d28.hardware");
  if (gate.status !== "accepted" || gate.revokedAt !== null) {
    throw Object.assign(new Error("D30 controlled D12 lab signoff is required before live hardware bridge jobs"), { statusCode: 409 });
  }
  if (!envEnabled("FORGE_HARDWARE_LAB_MODE")) {
    throw Object.assign(new Error("FORGE_HARDWARE_LAB_MODE=1 is required for D30 lab hardware jobs"), { statusCode: 409 });
  }
  const rigId = rigIdFrom(payload);
  if (!rigId || !D12_RIG_ALLOWLIST.includes(rigId)) {
    throw Object.assign(new Error("live hardware jobs are limited to D12 reference rigs in lab mode"), { statusCode: 409 });
  }
  if (provider !== "local") {
    throw Object.assign(new Error("hardware bridge jobs must run on the local provider, never modal"), { statusCode: 409 });
  }
}

async function materializeJobOutput(db: GatewayDb, user: CurrentUser, job: JobRecord): Promise<void> {
  const output = isRecord(job.output) ? job.output : null;
  if (!output || typeof output.artifactKind !== "string") return;
  const input = isRecord(job.input) ? job.input : {};
  switch (output.artifactKind) {
    case "photoscan": {
      const artifactBlobId = await upsertArtifactBlob(db, user, {
        purpose: "photoscan-result",
        cacheKey: nestedCacheKey(output, "objectCache"),
        contentType: "model/gltf-binary",
        metadata: { jobId: job.id, artifactKind: "photoscan" },
      });
      await db.query(
        `INSERT INTO photoscan_artifacts (
           owner_user_id, job_id, source_blob_ids, scale_axes_ports,
           refit_primitives, candidate_component, validator_report, artifact_blob_id
         )
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)`,
        [
          user.id,
          job.id,
          stringList(input.sourceBlobIds).length > 0
            ? stringList(input.sourceBlobIds)
            : stringList(output.sourceImages),
          json(output.alignment ?? {}),
          json(output.primitiveRefit ?? []),
          json(output.candidateComponent ?? null),
          json({ artifactKind: "photoscan", acceptance: output.acceptance ?? {} }),
          artifactBlobId,
        ],
      );
      return;
    }
    case "policy": {
      const artifactBlobId = await upsertArtifactBlob(db, user, {
        purpose: "policy-onnx",
        cacheKey: nestedCacheKey(output, "onnx"),
        contentType: "application/octet-stream",
        metadata: { jobId: job.id, artifactKind: "policy" },
      });
      await db.query(
        `INSERT INTO policy_artifacts (
           owner_user_id, model_id, task_kind, scorecard, artifact_blob_id, export_gate
         )
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          user.id,
          modelIdFrom(input),
          isRecord(output.task) && typeof output.task.id === "string" ? output.task.id : "fixture",
          json(output.scorecard ?? {}),
          artifactBlobId,
          isRecord(output.scorecard) && output.scorecard.exportable === true ? "exportable" : "blocked",
        ],
      );
      return;
    }
    case "telemetry-replay":
      await db.query(
        `INSERT INTO telemetry_logs (owner_user_id, model_id, source, tape, privacy)
         VALUES ($1, $2, 'fixture', $3::jsonb, $4::jsonb)`,
        [
          user.id,
          modelIdFrom(input),
          json(output.tape ?? { frames: [] }),
          json({ sharing: "private" }),
        ],
      );
      return;
    case "wear-estimate":
    case "crash-forensics":
    case "repair-sheet": {
      const kind =
        output.artifactKind === "wear-estimate"
          ? "wear"
          : output.artifactKind === "crash-forensics"
            ? "crash-forensics"
            : "repair-sheet";
      await db.query(
        `INSERT INTO maintenance_records (owner_user_id, model_id, record_kind, severity, summary, payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          user.id,
          modelIdFrom(input),
          kind,
          output.artifactKind === "crash-forensics" && output.crashDetected === true ? "warn" : "info",
          output.artifactKind,
          json(output),
        ],
      );
      return;
    }
    default:
      return;
  }
}

export async function ensureCreditAccount(db: GatewayDb, user: CurrentUser): Promise<void> {
  await db.query(
    `INSERT INTO credit_accounts (user_id, balance_credits)
     VALUES ($1, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [user.id],
  );
}

export async function recordUsageEvent(
  db: GatewayDb,
  user: CurrentUser | null,
  input: {
    eventKind: string;
    provider: string | null;
    units?: unknown;
    costCredits?: number;
    idempotencyKey?: string | null;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO usage_events (user_id, event_kind, provider, units, cost_credits, idempotency_key)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      user?.id ?? null,
      input.eventKind,
      input.provider,
      json(input.units ?? {}),
      input.costCredits ?? 0,
      input.idempotencyKey ?? null,
    ],
  );
}

export async function listPlatformGates(db: GatewayDb): Promise<PlatformGateSignoff[]> {
  const result = await db.query<Parameters<typeof mapPlatformGate>[0]>(
    `SELECT DISTINCT ON (gate_key)
            id, gate_key, status, policy_version, jurisdiction, reviewer,
            evidence, evidence_url, effective_at, revoked_at, created_at, updated_at
       FROM platform_gate_signoffs
      ORDER BY gate_key, created_at DESC`,
  );
  const latest = new Map<PlatformGateKey, PlatformGateSignoff>();
  for (const row of result.rows) {
    latest.set(row.gate_key, mapPlatformGate(row));
  }
  return PLATFORM_GATE_KEYS.map((key) => latest.get(key) ?? defaultGate(key));
}

export async function currentPlatformGate(db: GatewayDb, gateKey: PlatformGateKey): Promise<PlatformGateSignoff> {
  const result = await db.query<Parameters<typeof mapPlatformGate>[0]>(
    `SELECT id, gate_key, status, policy_version, jurisdiction, reviewer,
            evidence, evidence_url, effective_at, revoked_at, created_at, updated_at
       FROM platform_gate_signoffs
      WHERE gate_key = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [gateKey],
  );
  return result.rows[0] ? mapPlatformGate(result.rows[0]) : defaultGate(gateKey);
}

export async function recordPlatformGateSignoff(
  db: GatewayDb,
  input: {
    gateKey: PlatformGateKey;
    status: PlatformGateStatus;
    policyVersion: string;
    jurisdiction?: string;
    reviewer: string;
    evidence?: unknown;
    evidenceUrl?: string | null;
    effectiveAt?: string | null;
  },
): Promise<PlatformGateSignoff> {
  const effectiveAt = input.status === "accepted" ? (input.effectiveAt ?? new Date().toISOString()) : input.effectiveAt ?? null;
  const revokedAt = input.status === "revoked" ? new Date().toISOString() : null;
  const result = await db.query<Parameters<typeof mapPlatformGate>[0]>(
    `INSERT INTO platform_gate_signoffs (
       gate_key, status, policy_version, jurisdiction, reviewer,
       evidence, evidence_url, effective_at, revoked_at
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     RETURNING id, gate_key, status, policy_version, jurisdiction, reviewer,
               evidence, evidence_url, effective_at, revoked_at, created_at, updated_at`,
    [
      input.gateKey,
      input.status,
      input.policyVersion,
      input.jurisdiction ?? "unspecified",
      input.reviewer,
      json(input.evidence ?? {}),
      input.evidenceUrl ?? null,
      effectiveAt,
      revokedAt,
    ],
  );
  return mapPlatformGate(result.rows[0]);
}

export async function jobCapabilities(db: GatewayDb): Promise<JobCapabilities> {
  const gates = await listPlatformGates(db);
  const modalConfigured = envConfigured("MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET");
  const modalEndpoint = Boolean(process.env.FORGE_MODAL_ENDPOINT?.trim());
  const hardwareGate = gates.find((gate) => gate.gateKey === "d28.hardware");
  const hardwareAccepted = hardwareGate?.status === "accepted" && hardwareGate.revokedAt === null;
  const labMode = envEnabled("FORGE_HARDWARE_LAB_MODE");
  return {
    providers: {
      fixture: capability(true, true, "fixture", null),
      local: capability(true, true, "postgres-queue", null),
      modal: capability(
        modalConfigured,
        modalConfigured && modalEndpoint,
        modalEndpoint ? "modal-endpoint" : "modal-submit",
        "MODAL_TOKEN_ID and MODAL_TOKEN_SECRET are required",
      ),
    },
    live: {
      rapier: capability(
        envEnabled("FORGE_RAPIER_ENGINE"),
        envEnabled("FORGE_RAPIER_ENGINE"),
        "feature-gated",
        "FORGE_RAPIER_ENGINE=1 is required",
      ),
      mujoco: capability(
        envConfigured("FORGE_MUJOCO_PARITY_CMD") || envEnabled("FORGE_MUJOCO_ENABLED"),
        envConfigured("FORGE_MUJOCO_PARITY_CMD"),
        envConfigured("FORGE_MUJOCO_PARITY_CMD") ? "external-runner" : "feature-gated",
        "FORGE_MUJOCO_PARITY_CMD or FORGE_MUJOCO_ENABLED=1 is required",
      ),
      sb3: capability(
        envConfigured("FORGE_SB3_TRAIN_CMD") || process.env.FORGE_TRAINING_BACKEND === "sb3",
        envConfigured("FORGE_SB3_TRAIN_CMD"),
        envConfigured("FORGE_SB3_TRAIN_CMD") ? "external-runner" : "python-import",
        "FORGE_SB3_TRAIN_CMD or FORGE_TRAINING_BACKEND=sb3 is required",
      ),
      claudeExtraction: capability(
        envConfigured("FORGE_CLAUDE_EXTRACT_CMD") || envConfigured("ANTHROPIC_API_KEY"),
        envConfigured("FORGE_CLAUDE_EXTRACT_CMD"),
        envConfigured("FORGE_CLAUDE_EXTRACT_CMD") ? "external-runner" : "deployment-owned",
        "FORGE_CLAUDE_EXTRACT_CMD or ANTHROPIC_API_KEY is required",
      ),
      occt: capability(
        envConfigured("FORGE_OCCT_TESSELLATE_CMD") || envEnabled("FORGE_OCCT_ENABLED"),
        envConfigured("FORGE_OCCT_TESSELLATE_CMD"),
        envConfigured("FORGE_OCCT_TESSELLATE_CMD") ? "external-runner" : "feature-gated",
        "FORGE_OCCT_TESSELLATE_CMD or FORGE_OCCT_ENABLED=1 is required",
      ),
      colmap: capability(
        envConfigured("FORGE_COLMAP_CMD") || envConfigured("FORGE_PHOTOSCAN_CMD"),
        envConfigured("FORGE_COLMAP_CMD") || envConfigured("FORGE_PHOTOSCAN_CMD"),
        envConfigured("FORGE_COLMAP_CMD") ? "colmap-command" : "photoscan-command",
        "FORGE_COLMAP_CMD or FORGE_PHOTOSCAN_CMD is required",
      ),
      onnxRuntime: capability(
        envEnabled("FORGE_ONNX_RUNTIME_WEB"),
        envEnabled("FORGE_ONNX_RUNTIME_WEB"),
        "studio-web",
        "FORGE_ONNX_RUNTIME_WEB=1 is required",
      ),
      vendorRefresh: capability(
        envConfigured("FORGE_VENDOR_REFRESH_CMD") || envEnabled("FORGE_VENDOR_REFRESH_SANDBOX"),
        envConfigured("FORGE_VENDOR_REFRESH_CMD"),
        envConfigured("FORGE_VENDOR_REFRESH_CMD") ? "worker-command" : "sandbox",
        "FORGE_VENDOR_REFRESH_CMD or FORGE_VENDOR_REFRESH_SANDBOX=1 is required",
      ),
      printQuotes: capability(
        envConfigured("FORGE_PRINT_QUOTE_ENDPOINT") || envEnabled("FORGE_PRINT_QUOTE_SANDBOX"),
        envConfigured("FORGE_PRINT_QUOTE_ENDPOINT"),
        envConfigured("FORGE_PRINT_QUOTE_ENDPOINT") ? "http-endpoint" : "sandbox",
        "FORGE_PRINT_QUOTE_ENDPOINT or FORGE_PRINT_QUOTE_SANDBOX=1 is required",
      ),
    },
    gates,
    hardware: {
      labMode: hardwareAccepted && labMode,
      d12RigAllowlist: D12_RIG_ALLOWLIST,
      noAutoArm: true,
    },
  };
}

export async function insertVendorOffer(
  db: GatewayDb,
  input: {
    componentId: string;
    vendor: string;
    sku?: string | null;
    url: string;
    price?: number | null;
    currency?: string | null;
    availability?: string;
    source?: "catalog" | "live" | "sandbox";
    provenance?: unknown;
  },
): Promise<VendorOfferRecord> {
  const result = await db.query<Parameters<typeof mapVendorOffer>[0]>(
    `INSERT INTO vendor_offers (
       component_id, vendor, sku, url, price, currency, availability, source, provenance
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id, component_id, vendor, sku, url, price, currency, availability,
               source, provenance, fetched_at, created_at`,
    [
      input.componentId,
      input.vendor,
      input.sku ?? null,
      input.url,
      input.price ?? null,
      input.currency ?? null,
      input.availability ?? "unknown",
      input.source ?? "sandbox",
      json(input.provenance ?? {}),
    ],
  );
  return mapVendorOffer(result.rows[0]);
}

export async function listVendorOffers(
  db: GatewayDb,
  input: { componentId?: string | null; limit: number },
): Promise<VendorOfferRecord[]> {
  const result = await db.query<Parameters<typeof mapVendorOffer>[0]>(
    `SELECT id, component_id, vendor, sku, url, price, currency, availability,
            source, provenance, fetched_at, created_at
       FROM vendor_offers
      WHERE ($1::text IS NULL OR component_id = $1)
      ORDER BY fetched_at DESC, created_at DESC
      LIMIT $2`,
    [input.componentId ?? null, input.limit],
  );
  return result.rows.map(mapVendorOffer);
}

export async function createPrintQuoteRequest(
  db: GatewayDb,
  user: CurrentUser,
  input: {
    modelId?: string | null;
    jobId?: string | null;
    artifactBlobId?: string | null;
    process?: string;
    material?: string;
    profile?: unknown;
    quantity?: number;
    dfmArtifact?: unknown;
    offer?: {
      provider?: string;
      providerQuoteId?: string | null;
      quoteUrl?: string;
      price?: number | null;
      currency?: string | null;
      leadTimeDays?: number | null;
      expiresAt?: string | null;
      terms?: unknown;
    };
  },
): Promise<PrintQuoteRequestRecord> {
  await assertAdmittedModelReference(db, user, input.modelId ?? null, "print quote export");
  const requestResult = await db.query<Omit<Parameters<typeof mapPrintQuoteRequest>[0], "offers">>(
    `INSERT INTO print_quote_requests (
       owner_user_id, model_id, job_id, artifact_blob_id, process, material,
       profile, quantity, dfm_artifact, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, 'quoted')
     RETURNING id, owner_user_id, model_id, job_id, artifact_blob_id, process,
               material, profile, quantity, dfm_artifact, status, created_at, updated_at`,
    [
      user.id,
      input.modelId ?? null,
      input.jobId ?? null,
      input.artifactBlobId ?? null,
      input.process ?? "fdm",
      input.material ?? "pla",
      json(input.profile ?? {}),
      input.quantity ?? 1,
      json(input.dfmArtifact ?? {}),
    ],
  );
  const request = requestResult.rows[0];
  const offerInput = input.offer ?? {};
  const quoteUrl =
    offerInput.quoteUrl ??
    `${(process.env.FORGE_PRINT_QUOTE_BASE_URL ?? "https://print.example.invalid/quotes").replace(/\/$/, "")}/${request.id}`;
  const offerResult = await db.query<Parameters<typeof mapPrintQuoteOffer>[0]>(
    `INSERT INTO print_quote_offers (
       request_id, provider, provider_quote_id, quote_url, price, currency,
       lead_time_days, expires_at, terms
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id, request_id, provider, provider_quote_id, quote_url, price,
               currency, lead_time_days, expires_at, terms, created_at`,
    [
      request.id,
      offerInput.provider ?? (process.env.FORGE_PRINT_QUOTE_PROVIDER ?? "sandbox-print-link"),
      offerInput.providerQuoteId ?? request.id,
      quoteUrl,
      offerInput.price ?? null,
      offerInput.currency ?? null,
      offerInput.leadTimeDays ?? null,
      offerInput.expiresAt ?? null,
      json({
        checkout: "off-platform",
        noDirectPayment: true,
        ...(isRecord(offerInput.terms) ? offerInput.terms : {}),
      }),
    ],
  );
  return mapPrintQuoteRequest({ ...request, offers: [mapPrintQuoteOffer(offerResult.rows[0])] });
}

export async function listPrintQuoteRequests(
  db: GatewayDb,
  user: CurrentUser,
  limit: number,
): Promise<PrintQuoteRequestRecord[]> {
  const requests = await db.query<Omit<Parameters<typeof mapPrintQuoteRequest>[0], "offers">>(
    `SELECT id, owner_user_id, model_id, job_id, artifact_blob_id, process,
            material, profile, quantity, dfm_artifact, status, created_at, updated_at
       FROM print_quote_requests
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  if (requests.rows.length === 0) return [];
  const ids = requests.rows.map((row) => row.id);
  const offers = await db.query<Parameters<typeof mapPrintQuoteOffer>[0]>(
    `SELECT id, request_id, provider, provider_quote_id, quote_url, price,
            currency, lead_time_days, expires_at, terms, created_at
       FROM print_quote_offers
      WHERE request_id = ANY($1::text[])
      ORDER BY created_at DESC`,
    [ids],
  );
  const byRequest = new Map<string, PrintQuoteOfferRecord[]>();
  for (const row of offers.rows) {
    const offer = mapPrintQuoteOffer(row);
    byRequest.set(offer.requestId, [...(byRequest.get(offer.requestId) ?? []), offer]);
  }
  return requests.rows.map((row) => mapPrintQuoteRequest({ ...row, offers: byRequest.get(row.id) ?? [] }));
}

export async function recordMarketplaceUsageRollup(
  db: GatewayDb,
  input: {
    listingId: string;
    listingKind: "model" | "course" | "skill" | "component" | "policy";
    event: "view" | "equip" | "quote-click" | "policy-download" | "training-job";
    creditsSpent?: number;
  },
): Promise<void> {
  const columns = {
    view: "views",
    equip: "equips",
    "quote-click": "quote_clicks",
    "policy-download": "policy_downloads",
    "training-job": "training_jobs",
  } as const;
  const column = columns[input.event];
  await db.query(
    `INSERT INTO marketplace_usage_rollups (
       bucket_date, listing_id, listing_kind, ${column}, credits_spent
     )
     VALUES (CURRENT_DATE, $1, $2, 1, $3)
     ON CONFLICT (bucket_date, listing_id) DO UPDATE
     SET ${column} = marketplace_usage_rollups.${column} + 1,
         credits_spent = marketplace_usage_rollups.credits_spent + EXCLUDED.credits_spent,
         updated_at = now()`,
    [input.listingId, input.listingKind, input.creditsSpent ?? 0],
  );
}

export async function creditSummary(db: GatewayDb, user: CurrentUser): Promise<CreditSummary> {
  await ensureCreditAccount(db, user);
  const [account, ledger] = await Promise.all([
    db.query<{ balance_credits: string | number }>(
      "SELECT balance_credits FROM credit_accounts WHERE user_id = $1",
      [user.id],
    ),
    db.query<{
      id: string | number;
      delta_credits: string | number;
      reason: string;
      source_kind: string;
      source_id: string | null;
      created_at: Date | string;
    }>(
      `SELECT id, delta_credits, reason, source_kind, source_id, created_at
         FROM credit_ledger
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [user.id],
    ),
  ]);
  return {
    balanceCredits: Number(account.rows[0]?.balance_credits ?? 0),
    ledger: ledger.rows.map((row) => ({
      id: Number(row.id),
      deltaCredits: Number(row.delta_credits),
      reason: row.reason,
      sourceKind: row.source_kind,
      sourceId: row.source_id,
      createdAt: nowIso(row.created_at),
    })),
  };
}

export async function insertModel(
  db: GatewayDb,
  user: CurrentUser,
  input: {
    contract: unknown;
    validatorReport: unknown;
    sourceArtifactId?: string | null;
    visibility?: Visibility;
    lineage?: unknown;
  },
): Promise<ModelRecord> {
  const status = reportVerdict(input.validatorReport);
  const { name, archetype } = contractMeta(input.contract);
  const contractHash = sha256(stableJson(input.contract));
  const result = await db.query<Parameters<typeof mapModel>[0]>(
    `INSERT INTO model_registry (
       owner_user_id, source_artifact_id, status, visibility, name, archetype,
       contract_hash, contract, validator_report, lineage
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)
     RETURNING id, owner_user_id, source_artifact_id, status, visibility, name, archetype,
               contract_hash, contract, validator_report, lineage, created_at, updated_at`,
    [
      user.id,
      input.sourceArtifactId ?? null,
      status,
      input.visibility ?? "private",
      name,
      archetype,
      contractHash,
      json(input.contract),
      json(input.validatorReport),
      json(input.lineage ?? {}),
    ],
  );
  return mapModel(result.rows[0]);
}

export async function createModel(
  db: GatewayDb,
  user: CurrentUser,
  contract: unknown,
  asDraft = true,
): Promise<{ model: ModelRecord; report: unknown }> {
  const contractJson = typeof contract === "string" ? contract : JSON.stringify(contract);
  const validation = await runValidator(contractJson, asDraft);
  if (validation.exitCode === -1 || validation.report === null) {
    throw Object.assign(new Error(validation.stderr || "validator unavailable"), { statusCode: 503 });
  }
  const status = reportVerdict(validation.report);
  if (status === "rejected" && !asDraft) {
    throw Object.assign(new Error("model rejected by validator"), {
      statusCode: 422,
      report: validation.report,
    });
  }
  const parsed = JSON.parse(contractJson) as unknown;
  const model = await insertModel(db, user, {
    contract: parsed,
    validatorReport: validation.report,
    lineage: { sourceKind: "model-crud" },
  });
  return { model, report: validation.report };
}

export async function insertModelFromGeneration(
  db: GatewayDb,
  user: CurrentUser,
  request: GenerationRequest,
  response: GenerationResponse,
): Promise<ModelRecord | null> {
  if (response.contract === null || response.report === null || response.generatedArtifact === undefined) {
    return null;
  }
  return insertModel(db, user, {
    contract: response.contract,
    validatorReport: response.report,
    sourceArtifactId: response.generatedArtifact?.artifactId ?? null,
    lineage: {
      sourceKind: "generation",
      provider: request.provider ?? "template",
      promptHash: response.attempts.at(-1)?.promptHash ?? null,
      attempts: response.attempts.length,
    },
  });
}

export async function listModels(db: GatewayDb, user: CurrentUser, limit: number): Promise<ModelRecord[]> {
  const result = await db.query<Parameters<typeof mapModel>[0]>(
    `SELECT id, owner_user_id, source_artifact_id, status, visibility, name, archetype,
            contract_hash, contract, validator_report, lineage, created_at, updated_at
       FROM model_registry
      WHERE owner_user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  return result.rows.map(mapModel);
}

export async function getOwnedModel(
  db: GatewayDb,
  user: CurrentUser,
  modelId: string,
): Promise<ModelRecord | null> {
  const result = await db.query<Parameters<typeof mapModel>[0]>(
    `SELECT id, owner_user_id, source_artifact_id, status, visibility, name, archetype,
            contract_hash, contract, validator_report, lineage, created_at, updated_at
       FROM model_registry
      WHERE owner_user_id = $1
        AND id = $2
      LIMIT 1`,
    [user.id, modelId],
  );
  return result.rows[0] ? mapModel(result.rows[0]) : null;
}

export async function updateModelContract(
  db: GatewayDb,
  modelId: string,
  contract: unknown,
  validatorReport: unknown,
  lineage: unknown,
): Promise<ModelRecord> {
  const status = reportVerdict(validatorReport);
  const { name, archetype } = contractMeta(contract);
  const contractHash = sha256(stableJson(contract));
  const result = await db.query<Parameters<typeof mapModel>[0]>(
    `UPDATE model_registry
        SET status = $2,
            name = $3,
            archetype = $4,
            contract_hash = $5,
            contract = $6::jsonb,
            validator_report = $7::jsonb,
            lineage = lineage || $8::jsonb,
            updated_at = now()
      WHERE id = $1
      RETURNING id, owner_user_id, source_artifact_id, status, visibility, name, archetype,
                contract_hash, contract, validator_report, lineage, created_at, updated_at`,
    [modelId, status, name, archetype, contractHash, json(contract), json(validatorReport), json(lineage)],
  );
  return mapModel(result.rows[0]);
}

function replaceOp(path: string, value: unknown): Record<string, unknown> {
  return { op: "replace", path, value };
}

function addOp(path: string, value: unknown): Record<string, unknown> {
  return { op: "add", path, value };
}

function colorFromPrompt(prompt: string): string | null {
  const colors: Record<string, string> = {
    black: "#16181c",
    blue: "#2563eb",
    green: "#16a34a",
    orange: "#f97316",
    purple: "#7c3aed",
    red: "#dc2626",
    white: "#f8fafc",
    yellow: "#eab308",
  };
  for (const [name, hex] of Object.entries(colors)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(prompt)) return hex;
  }
  return null;
}

function firstGeomPath(contract: unknown, field: "w" | "h" | "d"): { path: string; value: number } | null {
  if (!isRecord(contract) || !Array.isArray(contract.parts)) return null;
  for (const [index, part] of contract.parts.entries()) {
    if (!isRecord(part) || !isRecord(part.geom)) continue;
    const value = part.geom[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      return { path: `/parts/${index}/geom/${field}`, value };
    }
  }
  return null;
}

function numericMultiplier(prompt: string): number {
  const percent = prompt.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) {
    const amount = Number(percent[1]) / 100;
    if (/smaller|shorter|lower|slower|reduce|decrease/i.test(prompt)) return Math.max(0.1, 1 - amount);
    return 1 + amount;
  }
  if (/double|twice/i.test(prompt)) return 2;
  if (/half|halve/i.test(prompt)) return 0.5;
  if (/smaller|shorter|lower|slower|reduce|decrease/i.test(prompt)) return 0.85;
  if (/larger|longer|wider|taller|faster|increase/i.test(prompt)) return 1.15;
  return 1;
}

export function compileEditPatch(prompt: string, contract: unknown): Record<string, unknown>[] {
  const patch: Record<string, unknown>[] = [];
  const color = colorFromPrompt(prompt);
  if (color && isRecord(contract) && Array.isArray(contract.parts) && contract.parts.length > 0) {
    patch.push(replaceOp("/parts/0/color", color));
  }

  const material = prompt.match(/\b(gloss|metal|satin|matte|rubber)\b/i)?.[1]?.toLowerCase();
  if (material && isRecord(contract) && Array.isArray(contract.parts) && contract.parts.length > 0) {
    patch.push(replaceOp("/parts/0/material", material));
  }

  const multiplier = numericMultiplier(prompt);
  const dimension =
    /wide|wider|width/i.test(prompt) ? "w" : /tall|height|higher|lower/i.test(prompt) ? "h" : "d";
  if (/larger|longer|wider|taller|smaller|shorter|height|width|\d+(?:\.\d+)?\s*%/i.test(prompt)) {
    const target = firstGeomPath(contract, dimension);
    if (target) patch.push(replaceOp(target.path, Number((target.value * multiplier).toFixed(4))));
  }

  if (isRecord(contract) && isRecord(contract.driver) && isRecord(contract.driver.params)) {
    const currentSpeed = contract.driver.params.maxSpeedMs;
    if (typeof currentSpeed === "number" && /speed|faster|slower/i.test(prompt)) {
      patch.push(replaceOp("/driver/params/maxSpeedMs", Number((currentSpeed * multiplier).toFixed(3))));
    }
  }

  const cells = prompt.match(/\b([3456])s\b/i)?.[1];
  if (cells && isRecord(contract) && isRecord(contract.sim) && isRecord(contract.sim.battery)) {
    patch.push(replaceOp("/sim/battery/cells", Number(cells)));
  }

  if (/prop\s*guard|duct/i.test(prompt) && isRecord(contract) && Array.isArray(contract.parts)) {
    patch.push(
      addOp("/parts/-", {
        node: "root",
        geom: { kind: "cbox", w: 0.24, h: 0.006, d: 0.24, ch: 0.03 },
        pose: { p: [0, 0.015, 0], r: [0, 0, 0], s: [1, 1, 1] },
        material: "satin",
        color: "#64748b",
        comp: "prop-guard",
        mass: { valueG: 18 },
        collision: "primitive",
        explode: { dir: [0, 1, 0], mag: 0.08, t0: 0.72, t1: 0.88, leader: "prop guard" },
      }),
    );
  }

  if (patch.length === 0) {
    throw Object.assign(new Error("edit prompt did not match a supported deterministic operation"), {
      statusCode: 400,
    });
  }
  return patch;
}

export async function editModel(
  db: GatewayDb,
  user: CurrentUser,
  modelId: string,
  prompt: string,
): Promise<{ model: ModelRecord; patch: unknown[]; report: unknown; elapsedMs: number }> {
  const started = Date.now();
  const current = await getOwnedModel(db, user, modelId);
  if (current === null) {
    throw Object.assign(new Error("model not found"), { statusCode: 404 });
  }
  const patch = compileEditPatch(prompt, current.contract);
  const patched = await runPatch(JSON.stringify(current.contract), JSON.stringify(patch));
  if (patched.exitCode !== 0 || patched.report === null) {
    throw Object.assign(new Error(patched.stderr || "patch rejected by contract boundary"), {
      statusCode: patched.exitCode === -1 ? 503 : 422,
    });
  }
  const validation = await runValidator(JSON.stringify(patched.report), true);
  if (validation.exitCode === -1 || validation.report === null) {
    throw Object.assign(new Error(validation.stderr || "validator unavailable"), { statusCode: 503 });
  }
  const model = await updateModelContract(db, modelId, patched.report, validation.report, {
    lastEdit: {
      promptHash: sha256(prompt.trim()),
      patch,
      at: new Date().toISOString(),
    },
  });
  return { model, patch, report: validation.report, elapsedMs: Date.now() - started };
}

export async function shareModel(
  db: GatewayDb,
  user: CurrentUser,
  modelId: string,
): Promise<ShareSnapshot> {
  const model = await getOwnedModel(db, user, modelId);
  if (model === null) {
    throw Object.assign(new Error("model not found"), { statusCode: 404 });
  }
  if (model.status !== "admitted") {
    throw Object.assign(new Error("only admitted models can be shared"), { statusCode: 409 });
  }
  const result = await db.query<Parameters<typeof mapShare>[0]>(
    `INSERT INTO share_snapshots (model_id, owner_user_id, contract_hash, contract, validator_report)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
     RETURNING id, model_id, owner_user_id, contract_hash, contract, validator_report, created_at`,
    [model.id, user.id, model.contractHash, json(model.contract), json(model.validatorReport)],
  );
  await db.query(
    `UPDATE model_registry
        SET visibility = 'unlisted',
            updated_at = now()
      WHERE id = $1`,
    [model.id],
  );
  return mapShare(result.rows[0]);
}

export async function getShare(db: GatewayDb, shareId: string): Promise<ShareSnapshot | null> {
  const result = await db.query<Parameters<typeof mapShare>[0]>(
    `SELECT id, model_id, owner_user_id, contract_hash, contract, validator_report, created_at
       FROM share_snapshots
      WHERE id = $1
        AND revoked_at IS NULL
      LIMIT 1`,
    [shareId],
  );
  return result.rows[0] ? mapShare(result.rows[0]) : null;
}

type CreateJobInput = {
  kind: JobKind;
  provider?: "fixture" | "local" | "modal";
  payload?: unknown;
  idempotencyKey?: string | null;
};

function assertCommerceVendorRefreshJob(input: CreateJobInput): void {
  if (input.provider !== "local") {
    throw Object.assign(new Error("commerce vendor refresh jobs must use the local worker provider"), {
      statusCode: 400,
    });
  }
  if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
    throw Object.assign(new Error("commerce vendor refresh jobs require an idempotency key"), { statusCode: 400 });
  }
  if (!isRecord(input.payload)) {
    throw Object.assign(new Error("commerce vendor refresh jobs require a bounded payload"), { statusCode: 400 });
  }
  const allowedKeys = new Set(["componentIds", "timeoutS"]);
  if (Object.keys(input.payload).some((key) => !allowedKeys.has(key))) {
    throw Object.assign(new Error("commerce vendor refresh job payload contains unsupported fields"), {
      statusCode: 400,
    });
  }
  const componentIds = input.payload.componentIds;
  if (
    !Array.isArray(componentIds)
    || componentIds.length < 1
    || componentIds.length > 50
    || componentIds.some((value) => (
      typeof value !== "string" || !value.trim() || value.length > 200
    ))
  ) {
    throw Object.assign(new Error("commerce vendor refresh jobs require 1..50 bounded componentIds"), {
      statusCode: 400,
    });
  }
  const timeoutS = input.payload.timeoutS;
  if (
    timeoutS !== undefined
    && (typeof timeoutS !== "number" || !Number.isFinite(timeoutS) || timeoutS < 1 || timeoutS > 120)
  ) {
    throw Object.assign(new Error("commerce vendor refresh job timeoutS must be between 1 and 120"), {
      statusCode: 400,
    });
  }
}

export async function createJob(
  db: GatewayDb,
  user: CurrentUser,
  input: CreateJobInput,
): Promise<JobRecord> {
  assertBoundedJson(input.payload ?? {}, "job payload", {
    maxBytes: 512 * 1024,
    maxDepth: 16,
    maxNodes: 20_000,
  });
  if (input.idempotencyKey != null && (
    input.idempotencyKey.length < 1 || input.idempotencyKey.length > 200
  )) {
    throw Object.assign(new Error("job idempotency key is outside the supported range"), { statusCode: 400 });
  }
  if (input.kind === "commerce.vendor-refresh") {
    assertCommerceVendorRefreshJob(input);
  }
  const requirements = [] as {
    purpose: "photoscan.processing" | "training.reuse";
    subjectKind: "object-blob" | "telemetry-log";
    subjectId: string;
  }[];
  if (input.kind === "photoscan.single" || input.kind === "photoscan.multiview") {
    const sourceBlobIds = sourceBlobIdsFromPayload(input.payload);
    if (
      (input.kind === "photoscan.single" && sourceBlobIds.length !== 1) ||
      (input.kind === "photoscan.multiview" && sourceBlobIds.length < 2)
    ) {
      throw Object.assign(new Error(`${input.kind} requires explicit owned sourceBlobIds`), { statusCode: 400 });
    }
    for (const subjectId of sourceBlobIds) {
      requirements.push({ purpose: "photoscan.processing", subjectKind: "object-blob", subjectId });
    }
  }
  if (input.kind === "train.policy") {
    for (const subjectId of telemetryLogIdsFromPayload(input.payload)) {
      requirements.push({ purpose: "training.reuse", subjectKind: "telemetry-log", subjectId });
    }
  }
  return requirements.length > 0
    ? withActiveConsents(db, user, requirements, (transaction) => createJobUnchecked(transaction, user, input))
    : createJobUnchecked(db, user, input);
}

async function createJobUnchecked(
  db: GatewayDb,
  user: CurrentUser,
  input: CreateJobInput,
): Promise<JobRecord> {
  const provider = input.provider ?? "fixture";
  const databaseIdempotencyKey = input.idempotencyKey == null
    ? null
    : scopedJobIdempotencyKey(user.id, input.idempotencyKey);
  if (input.kind === "commerce.vendor-refresh") {
    if (!envConfigured("FORGE_VENDOR_REFRESH_CMD")) {
      throw Object.assign(new Error("commerce vendor refresh worker is not configured"), { statusCode: 409 });
    }
  }
  const costCredits = provider === "modal" ? 1 : 0;
  if (ADMITTED_MODEL_JOB_KINDS.has(input.kind)) {
    await assertAdmittedModelReference(db, user, modelIdFrom(input.payload), `${input.kind} job`);
  }
  await assertHardwareGateForJob(db, input.kind, provider, input.payload ?? {});
  await ensureCreditAccount(db, user);
  if (costCredits > 0) {
    const debitKey = databaseIdempotencyKey ? `${databaseIdempotencyKey}:credit` : randomUUID();
    const debit = await db.query(
      `INSERT INTO credit_ledger (user_id, delta_credits, reason, source_kind, source_id, idempotency_key)
       VALUES ($1, $2, $3, 'job', $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [user.id, -costCredits, `modal ${input.kind}`, input.kind, debitKey],
    );
    if ((debit.rowCount ?? 0) > 0) {
      await db.query(
        `UPDATE credit_accounts
            SET balance_credits = balance_credits - $2,
                updated_at = now()
          WHERE user_id = $1`,
        [user.id, costCredits],
      );
    }
  }
  if (provider !== "fixture") {
    const proposedJobId = newJobId();
    const result = await db.query<Parameters<typeof mapJob>[0] & { inserted: boolean }>(
      `INSERT INTO jobs (
         id, owner_user_id, kind, status, provider, idempotency_key, input, output, cost_credits
       )
       VALUES ($7, $1, $2, 'queued', $3, $4, $5::jsonb, NULL, $6)
       ON CONFLICT (idempotency_key) DO UPDATE
       SET idempotency_key = EXCLUDED.idempotency_key
       WHERE jobs.owner_user_id = EXCLUDED.owner_user_id
         AND jobs.kind = EXCLUDED.kind
         AND jobs.provider = EXCLUDED.provider
         AND jobs.input = EXCLUDED.input
       RETURNING id, owner_user_id, kind, status, provider, input, output, error,
                 cost_credits, created_at, id = $7 AS inserted`,
      [
        user.id,
        input.kind,
        provider,
        databaseIdempotencyKey,
        json(input.payload ?? {}),
        costCredits,
        proposedJobId,
      ],
    );
    if (!result.rows[0]) {
      throw Object.assign(new Error("job idempotency key is already bound to a different request"), {
        statusCode: 409,
      });
    }
    return mapJob(result.rows[0]);
  }

  const fixtureOutput = fixtureJobOutput(input.kind, input.payload ?? {});
  const proposedJobId = newJobId();
  const result = await db.query<Parameters<typeof mapJob>[0] & { inserted: boolean }>(
    `INSERT INTO jobs (
       id, owner_user_id, kind, status, provider, idempotency_key, input, output,
       cost_credits, started_at, finished_at
     )
     VALUES ($8, $1, $2, 'succeeded', $3, $4, $5::jsonb, $6::jsonb, $7, now(), now())
     ON CONFLICT (idempotency_key) DO UPDATE
     SET idempotency_key = EXCLUDED.idempotency_key
     WHERE jobs.owner_user_id = EXCLUDED.owner_user_id
       AND jobs.kind = EXCLUDED.kind
       AND jobs.provider = EXCLUDED.provider
       AND jobs.input = EXCLUDED.input
     RETURNING id, owner_user_id, kind, status, provider, input, output, error,
               cost_credits, created_at, id = $8 AS inserted`,
    [
      user.id,
      input.kind,
      provider,
      databaseIdempotencyKey,
      json(input.payload ?? {}),
      json(fixtureOutput),
      costCredits,
      proposedJobId,
    ],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error("job idempotency key is already bound to a different request"), {
      statusCode: 409,
    });
  }
  const job = mapJob(result.rows[0]);
  if (result.rows[0].inserted) {
    await materializeJobOutput(db, user, job);
  }
  return job;
}

export async function listJobs(db: GatewayDb, user: CurrentUser, limit: number): Promise<JobRecord[]> {
  const result = await db.query<Parameters<typeof mapJob>[0]>(
    `SELECT id, owner_user_id, kind, status, provider, input, output, error, cost_credits, created_at
       FROM jobs
      WHERE owner_user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [user.id, limit],
  );
  return result.rows.map(mapJob);
}

export async function getOwnedJob(db: GatewayDb, user: CurrentUser, jobId: string): Promise<JobRecord | null> {
  const result = await db.query<Parameters<typeof mapJob>[0]>(
    `SELECT id, owner_user_id, kind, status, provider, input, output, error, cost_credits, created_at
       FROM jobs
      WHERE owner_user_id = $1
        AND id = $2
      LIMIT 1`,
    [user.id, jobId],
  );
  return result.rows[0] ? mapJob(result.rows[0]) : null;
}

export async function listJobEvents(
  db: GatewayDb,
  user: CurrentUser,
  jobId: string,
  limit: number,
): Promise<JobEventRecord[]> {
  const result = await db.query<Parameters<typeof mapJobEvent>[0]>(
    `SELECT e.id, e.job_id, e.event, e.payload, e.created_at
       FROM job_events e
       JOIN jobs j ON j.id = e.job_id
      WHERE j.owner_user_id = $1
        AND e.job_id = $2
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT $3`,
    [user.id, jobId, limit],
  );
  return result.rows.map(mapJobEvent);
}

export function fixtureJobOutput(kind: JobKind, payload: unknown): unknown {
  const payloadHash = sha256(stableJson(payload)).slice(0, 16);
  switch (kind) {
    case "photoscan.single":
    case "photoscan.multiview":
      {
        const multiview = kind === "photoscan.multiview";
        const confidence = multiview ? 0.78 : 0.68;
        const fitCoveragePct = multiview ? 76 : 71;
        const hausdorffPct = multiview ? 1.2 : 1.45;
        return {
          artifactKind: "photoscan",
          sourceImages: isRecord(payload) && Array.isArray(payload.images) ? payload.images : ["fixture-front"],
          objectCache: { key: `photoscan:${payloadHash}`, provider: "fixture" },
          alignment: {
            scaleLocked: isRecord(payload) && Boolean(payload.scale),
            axesLocked: isRecord(payload) && Boolean(payload.axes),
            portsMarked: isRecord(payload) && Boolean(payload.ports),
          },
          acceptance: {
            gate: "D13",
            pass: fitCoveragePct >= 70 && hausdorffPct <= 1.5,
            fitCoveragePct,
            hausdorffPct,
            meshClassFallback: !(fitCoveragePct >= 70 && hausdorffPct <= 1.5),
            scaleErrorPct: multiview ? 1.4 : 2.6,
            axisErrorDeg: multiview ? 1.8 : 3.2,
          },
          primitiveRefit: [
            { kind: "box", rmsMm: 1.8, confidence },
            { kind: "cylinder", rmsMm: 2.4, confidence: confidence - 0.08 },
          ],
          candidateComponent: {
            id: `cmp_photoscan_${payloadHash}`,
            source: "photoscan",
            confidence,
            review: "photoscan candidate requires owner port/scale review",
          },
        };
      }
    case "train.policy":
      return {
        artifactKind: "policy",
        provider: "fixture",
        algorithm: "ppo-fixture",
        task: { id: "hover-hold", suite: "p7-v1", curriculumStage: 1, horizonS: 60 },
        io: {
          observations: [
            "estimator.attitude",
            "estimator.angularRate",
            "target.error",
            "battery.normalizedVoltage",
            "powertrain.motorCurrent",
          ],
          actions: ["throttle", "roll", "pitch", "yaw"],
          onnxHeader: {
            contractHash: isRecord(payload) && typeof payload.contractHash === "string" ? payload.contractHash : "fixture",
            task: "hover-hold",
            observationCount: "5",
            actionCount: "4",
          },
        },
        domainRandomization: {
          massPct: 15,
          kvPct: 8,
          sagPct: 20,
          latencyMs: [0, 30],
          friction: [0.4, 1.2],
          windMps: [0, 4],
          obsDropoutPct: [0, 5],
        },
        onnx: { fixture: true, cacheKey: `onnx:${payloadHash}`, opset: 18, path: `onnx:${payloadHash}/policy.onnx` },
        scorecard: {
          task: "hover-hold",
          taskVersion: "1.0.0",
          successRate: 0.91,
          robustness: { "mass+15%": 0.84, "kv-8%": 0.88, wind4ms: 0.79 },
          energyWh: 2.2,
          lineage: {
            contractHash: isRecord(payload) && typeof payload.contractHash === "string" ? payload.contractHash : "fixture",
            seed: "7",
            codeVersion: "fixture-p7-v1",
          },
          exportable: true,
          reasons: [],
        },
      };
    case "train.sysid-fit":
      return {
        artifactKind: "sysid",
        fit: { batterySagRmse: 0.041, currentRmseA: 1.2, accepted: true },
      };
    case "replay.verify":
      return verifyReplayTape(isRecord(payload) ? payload.tape : null, {
        expectedHash: isRecord(payload) && typeof payload.expectedHash === "string" ? payload.expectedHash : null,
        expectedContractHash: isRecord(payload) && typeof payload.expectedContractHash === "string" ? payload.expectedContractHash : null,
        courseId: isRecord(payload) && typeof payload.courseId === "string" ? payload.courseId : null,
      });
    case "codesign.evaluate":
      return {
        artifactKind: "codesign",
        provider: "fixture",
        cacheKey: `codesign:${payloadHash}`,
        manifold: {
          categorical: ["battery", "prop", "motor"],
          continuous: ["color", "material", "driver"],
          bounds: { enduranceMin: [6.8, 8.4], massG: [690, 735] },
        },
        tiers: ["validator-oracle", "fixture-rapier", "short-rollout", "modal-finalist"],
        candidates: [
          {
            id: `color-${payloadHash}`,
            patch: [replaceOp("/parts/0/color", "#39c8ff")],
            tier: "validator-oracle",
            admitted: true,
            metrics: { massG: 720, enduranceMin: 7.4, score: 0.74 },
          },
          {
            id: `material-${payloadHash}`,
            patch: [replaceOp("/parts/0/material", "satin")],
            tier: "fixture-rapier",
            admitted: true,
            metrics: { massG: 690, enduranceMin: 6.9, score: 0.81 },
          },
          {
            id: `name-${payloadHash}`,
            patch: [replaceOp("/meta/name", "FORGE co-design candidate")],
            tier: "short-rollout",
            admitted: true,
            metrics: { massG: 735, enduranceMin: 8.2, score: 0.84 },
          },
        ],
        pareto: [
          {
            id: `material-${payloadHash}`,
            patch: [replaceOp("/parts/0/material", "satin")],
            tier: "fixture-rapier",
            admitted: true,
            metrics: { massG: 690, enduranceMin: 6.9, score: 0.81 },
          },
          {
            id: `name-${payloadHash}`,
            patch: [replaceOp("/meta/name", "FORGE co-design candidate")],
            tier: "short-rollout",
            admitted: true,
            metrics: { massG: 735, enduranceMin: 8.2, score: 0.84 },
          },
        ],
      };
    case "bridge.config-diff":
      return {
        artifactKind: "bridge-config",
        firmware: "betaflight",
        requiresPhysicalConfirmation: true,
        lines: ["# FORGE generated betaflight config diff", "mixer quadx", "save"],
      };
    case "bridge.telemetry-ingest":
      {
        const samples = isRecord(payload) && Array.isArray(payload.samples) ? payload.samples : [];
        const frames = samples
          .filter(isRecord)
          .map((sample) => ({ t: typeof sample.t === "number" ? sample.t : 0, state: sample }))
          .sort((a, b) => a.t - b.t);
        const tape = {
          schemaVersion: "replay.v1",
          header: {
            contractHash: isRecord(payload) && typeof payload.contractHash === "string" ? payload.contractHash : null,
            lockfileHash: isRecord(payload) && typeof payload.lockfileHash === "string" ? payload.lockfileHash : null,
            seed: 0,
          },
          frames,
        };
      return {
        artifactKind: "telemetry-replay",
          tape,
          frameCount: frames.length,
        tapeHash: `telemetry:${payloadHash}`,
          durationS: frames.length > 1 ? Math.max(0, frames[frames.length - 1].t - frames[0].t) : 0,
      };
      }
    case "bridge.supervisor-check":
      return {
        artifactKind: "supervisor-decision",
        allowPolicy: true,
        command: "policy-advisory",
        rateHz: { policyAdvisory: 50, supervisor: 200 },
        reasons: [],
      };
    case "maintenance.estimate-wear":
      return {
        artifactKind: "wear-estimate",
        motorHours: 0.12,
        packCycles: 0.34,
        rIntMohm: 42,
        warnings: [],
      };
    case "maintenance.crash-forensics":
      return {
        artifactKind: "crash-forensics",
        crashDetected: true,
        window: { startS: 8, impactS: 10, endS: 14 },
        ghostOverlay: { enabled: true, divergenceMetric: "position-rmse" },
      };
    case "maintenance.repair-sheet":
      return {
        artifactKind: "repair-sheet",
        steps: [{ order: 1, action: "remove, inspect, and replace damaged part", reorderSku: "fixture-sku" }],
        reorderCount: 1,
      };
    case "maintenance.fleet-summary":
      return {
        artifactKind: "fleet-summary",
        vehicleCount: 1,
        criticalCount: 0,
        serviceDueCount: 0,
        nextActions: [],
      };
    case "etl.ingest-component":
      return {
        artifactKind: "component-row",
        canonical: true,
        reviewRequired: true,
        confidence: 0.82,
      };
    case "occt.tessellate":
      return fixtureLicenseFilteredGeometry(payload, payloadHash);
  }
}

export function assertJobKind(value: string): asserts value is JobKind {
  if (!JOB_KINDS.includes(value as JobKind)) {
    throw Object.assign(new Error(`unsupported job kind '${value}'`), { statusCode: 400 });
  }
}

export async function latestBrief25Eval(db: GatewayDb): Promise<unknown | null> {
  const result = await db.query<{ artifact: unknown }>(
    `SELECT artifact
       FROM eval_runs
      WHERE suite = 'brief25'
      ORDER BY created_at DESC
      LIMIT 1`,
  );
  return result.rows[0]?.artifact ?? null;
}

export async function persistBrief25Eval(db: GatewayDb, artifact: unknown): Promise<string> {
  const summary = isRecord(artifact) ? artifact.summary ?? {} : {};
  const validatorKind = isRecord(artifact) && isRecord(artifact.validator) && typeof artifact.validator.kind === "string"
    ? artifact.validator.kind
    : "unknown";
  const provider = isRecord(artifact) && typeof artifact.provider === "string" ? artifact.provider : "template";
  const result = await db.query<{ id: string }>(
    `INSERT INTO eval_runs (suite, mode, validator_kind, provider, summary, artifact)
     VALUES ('brief25', 'gateway-template', $1, $2, $3::jsonb, $4::jsonb)
     RETURNING id`,
    [validatorKind, provider, json(summary), json(artifact)],
  );
  if (isRecord(artifact) && Array.isArray(artifact.briefs)) {
    for (const brief of artifact.briefs) {
      if (!isRecord(brief) || typeof brief.id !== "string") continue;
      await db.query(
        `INSERT INTO eval_brief_results (
           eval_run_id, brief_id, archetype, verdict, repair_iterations, diagnostics
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (eval_run_id, brief_id) DO UPDATE
         SET verdict = EXCLUDED.verdict,
             repair_iterations = EXCLUDED.repair_iterations,
             diagnostics = EXCLUDED.diagnostics`,
        [
          result.rows[0].id,
          brief.id,
          typeof brief.archetype === "string" ? brief.archetype : "unknown",
          typeof brief.verdict === "string" ? brief.verdict : "unknown",
          typeof brief.repairIterations === "number" ? brief.repairIterations : 0,
          json(Array.isArray(brief.diagnostics) ? brief.diagnostics : []),
        ],
      );
    }
  }
  return result.rows[0].id;
}

export function validatorError(error: unknown): { statusCode: number; body: unknown } | null {
  if (isRecord(error) && typeof error.statusCode === "number") {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message ?? "request failed",
        report: "report" in error ? error.report : undefined,
      },
    };
  }
  return null;
}

export function ensureValidatorSuccess(result: ValidateResult): unknown {
  if (result.exitCode === -1 || result.report === null) {
    throw Object.assign(new Error(result.stderr || "validator unavailable"), { statusCode: 503 });
  }
  return result.report;
}
