import type { Report } from "./types";

export type ReviewStatus = "needs_review" | "approved" | "rejected";
export type ReviewDecision = "approved" | "rejected";
export type ReviewExportPolicy =
  | "full-geometry-ok"
  | "attribution-manifest-required"
  | "envelope-link-out"
  | "envelope-only"
  | "bom-only"
  | "blocked"
  | "assembly-policy-derived";

export interface ReviewQueueItem {
  id: number;
  artifactId: string;
  artifactKind: "component" | "reference-rig";
  reason: string;
  status: ReviewStatus;
  confidence: number;
  payload: unknown;
  createdAt: string;
  reviewedAt: string | null;
  reviewer: string | null;
  reviewNote: string | null;
  exportPolicy: ReviewExportPolicy | null;
  decisionPayload: unknown;
}

interface ReviewListResponse {
  items: ReviewQueueItem[];
}

export type GenerationProvider = "template" | "anthropic";
export type GenerationArchetype =
  | "biped"
  | "multirotor"
  | "rover"
  | "arm"
  | "quadruped"
  | "fixedwing";

export interface GenerationRequest {
  prompt: string;
  provider?: GenerationProvider;
  archetype?: GenerationArchetype;
  categories?: string[];
  limit?: number;
  seed?: number;
  maxRepairIterations?: number;
}

export interface AnthropicModelPin {
  role: "synthesis" | "repair" | "edit" | "etl";
  modelId: string;
  apiAlias?: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  cacheWrite5mUsdPerMTok: number;
  cacheWrite1hUsdPerMTok: number;
  cacheHitUsdPerMTok: number;
  sourceUrls: string[];
  checkedAt: string;
}

export interface RetrievedCatalogComponent {
  id: string;
  brand: string;
  model: string;
  revision: string;
  category: string;
  massG: number;
  confidence: number;
  licenseClass: string;
  exportPolicy: ReviewExportPolicy;
  priceCount: number;
  citationCount: number;
}

export interface GenerationContextResponse {
  mode: "context-only";
  catalogPolicy: "approved-review-rows-only";
  brief: {
    prompt: string;
    archetype: GenerationArchetype | null;
    categories: string[];
  };
  retrievedComponents: RetrievedCatalogComponent[];
  retrievedPatterns: { id: string; archetype: string; sourceKind: string; consent: string; summary: unknown }[];
  promptPrefix: {
    version: "p4-context-v1";
    hash: string;
    schemaHash: string;
    docsHash: string;
    exemplarHashes: string[];
    text: string | null;
  };
  blockedReasons: string[];
}

export interface GenerationAttempt {
  index: number;
  phase: "synthesize" | "repair" | "draft";
  modelId: string;
  contractHash: string;
  verdict: string;
  diagnostics: { check?: string; severity?: string; message?: string }[];
  stopReason?: string;
  usage?: unknown;
}

export interface GenerationResponse {
  mode: "synthesis";
  catalogPolicy: "approved-review-rows-only";
  modelPins: AnthropicModelPin[];
  context: GenerationContextResponse;
  verdict: "admitted" | "draft" | "blocked" | "rejected";
  attempts: GenerationAttempt[];
  contract: unknown | null;
  report: Report | null;
  blockedReasons: string[];
  registeredModel?: {
    id: string;
    status: "admitted" | "draft" | "rejected";
    name: string;
    contractHash: string;
  } | null;
}

interface GenerationModelsResponse {
  models: AnthropicModelPin[];
}

export interface MeResponse {
  authenticated: boolean;
  user: { id: string; name: string | null; email: string | null; image: string | null } | null;
}

export interface ModelRecord {
  id: string;
  ownerUserId: string;
  sourceArtifactId: string | null;
  status: "admitted" | "draft" | "rejected";
  visibility: "private" | "unlisted" | "public";
  name: string;
  archetype: string | null;
  contractHash: string;
  contract: unknown;
  validatorReport: Report | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  id: string;
  kind: string;
  status: string;
  provider: "fixture" | "local" | "modal";
  input: unknown;
  output: unknown;
  error: string | null;
  costCredits: number;
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
    "rapier" | "mujoco" | "sb3" | "colmap" | "onnxRuntime" | "vendorRefresh" | "printQuotes",
    JobCapabilityState
  >;
  gates: PlatformGateSignoff[];
  hardware: {
    labMode: boolean;
    d12RigAllowlist: string[];
    noAutoArm: true;
  };
}

export interface ObjectBlobRecord {
  id: string;
  ownerUserId: string | null;
  visibility: "private" | "unlisted" | "public";
  cacheKey: string | null;
  bucket: string;
  objectKey: string;
  contentType: string | null;
  byteSize: number | null;
  sha256: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface ObjectAccessContract {
  action: "upload" | "download";
  method: "GET" | "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
  bucket: string;
  objectKey: string;
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

export interface PhotoscanAlignmentInput {
  knownDimensionMm?: number;
  axis?: "x" | "y" | "z";
  ports?: PhotoscanPortInput[];
  note?: string;
}

export interface PhotoscanPortInput {
  id: string;
  kind: string;
  axis?: "x" | "y" | "z";
  role?: string;
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

export interface MaintenanceRecord {
  id: string;
  modelId: string | null;
  kind: string;
  severity: "info" | "warn" | "critical";
  summary: string;
  payload: unknown;
  createdAt: string;
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

export interface LicenseLedgerEntry {
  id: string;
  class: "open" | "attribution" | "no-redistribution" | "view-only";
  terms: string | null;
  sourceUrl: string | null;
  componentCount: number;
  pricedComponentCount: number;
  citedComponentCount: number;
  approvedReviewCount: number;
  pendingReviewCount: number;
  blockedExportCount: number;
  exportPolicies: Record<string, number>;
}

export interface CourseRecord {
  id: string;
  name: string;
  envSpec: unknown;
  validatorReport: unknown;
  visibility: "private" | "unlisted" | "public";
  createdAt: string;
}

export interface LeaderboardRunRecord {
  id: string;
  courseId: string;
  score: number;
  verified: boolean;
  verification: unknown;
  createdAt: string;
}

export interface ListingRecord {
  id: string;
  kind: string;
  status: string;
  title: string;
  licenseClass: string | null;
  exportPolicy: string;
  priceCredits: number;
  createdAt: string;
}

export interface ClassroomAssignmentRecord {
  id: string;
  ownerUserId: string | null;
  courseId: string | null;
  title: string;
  brief: string;
  rubric: unknown;
  visibility: "private" | "unlisted" | "public";
  dueAt: string | null;
  createdAt: string;
}

export interface ClassroomSubmissionRecord {
  id: string;
  assignmentId: string;
  studentUserId: string | null;
  modelId: string | null;
  policyId: string | null;
  replayId: string | null;
  validatorReport: unknown;
  scorecard: unknown;
  grade: unknown;
  status: string;
  createdAt: string;
}

export interface ModerationReportRecord {
  id: string;
  targetKind: "listing" | "course" | "share" | "model" | "policy";
  targetId: string;
  reason: "safety" | "ip" | "spam" | "abuse" | "export-control" | "other";
  detail: string;
  status: "open" | "triaged" | "actioned" | "rejected";
  slaDueAt: string;
  repeatInfringerSignal: boolean;
  createdAt: string;
}

export interface ShareSnapshot {
  id: string;
  modelId: string;
  contractHash: string;
  contract: unknown;
  validatorReport: Report;
  createdAt: string;
}

export interface GenerationStageEvent {
  stage?: string;
  [key: string]: unknown;
}

const env = (
  import.meta as ImportMeta & {
    env?: {
      VITE_FORGE_GATEWAY_URL?: string;
      VITE_FORGE_REVIEW_TOKEN?: string;
      VITE_FORGE_DEV_USER_ID?: string;
      VITE_FORGE_DEV_USER_EMAIL?: string;
      VITE_FORGE_DEV_USER_NAME?: string;
    };
  }
).env;
const gatewayBase = (env?.VITE_FORGE_GATEWAY_URL ?? "").replace(/\/$/, "");
const reviewToken = env?.VITE_FORGE_REVIEW_TOKEN;
const devUserId = env?.VITE_FORGE_DEV_USER_ID?.trim();
const devUserEmail = env?.VITE_FORGE_DEV_USER_EMAIL?.trim();
const devUserName = env?.VITE_FORGE_DEV_USER_NAME?.trim();

function devAuthHeaders(): Record<string, string> {
  if (!devUserId) return {};
  return {
    "x-forge-user-id": devUserId,
    ...(devUserEmail ? { "x-forge-user-email": devUserEmail } : {}),
    ...(devUserName ? { "x-forge-user-name": devUserName } : {}),
  };
}

export function gatewayUrl(path: string): string {
  return `${gatewayBase}${path}`;
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options: { okStatuses?: number[] } = {},
): Promise<T> {
  const res = await fetch(`${gatewayBase}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(reviewToken ? { authorization: `Bearer ${reviewToken}` } : {}),
      ...devAuthHeaders(),
      ...init?.headers,
    },
  });
  if (!res.ok && !options.okStatuses?.includes(res.status)) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error ?? detail;
    } catch {
      /* keep status text */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function listReviews(status: ReviewStatus, limit = 25): Promise<ReviewQueueItem[]> {
  const params = new URLSearchParams({ status, limit: String(limit) });
  const body = await requestJson<ReviewListResponse>(`/v1/reviews?${params}`);
  return body.items;
}

export function decideReview(
  id: number,
  status: ReviewDecision,
  options: {
    reviewer?: string;
    reviewNote?: string;
    exportPolicy?: ReviewExportPolicy;
  } = {},
): Promise<ReviewQueueItem> {
  return requestJson<ReviewQueueItem>(`/v1/reviews/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, reviewer: options.reviewer ?? "owner", ...options }),
  });
}

export function generateContract(
  request: GenerationRequest,
  options: { anthropicApiKey?: string } = {},
): Promise<GenerationResponse> {
  const headers: Record<string, string> = {};
  const key = options.anthropicApiKey?.trim();
  if (request.provider === "anthropic" && key) {
    headers["x-forge-anthropic-key"] = key;
  }
  return requestJson<GenerationResponse>(
    "/v1/generate",
    {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    },
    { okStatuses: [409] },
  );
}

export async function generateContractStream(
  request: GenerationRequest,
  callbacks: { onStage?: (event: GenerationStageEvent) => void } = {},
  options: { anthropicApiKey?: string } = {},
): Promise<GenerationResponse> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const key = options.anthropicApiKey?.trim();
  if (request.provider === "anthropic" && key) headers["x-forge-anthropic-key"] = key;
  const response = await fetch(`${gatewayBase}/v1/generate/stream`, {
    method: "POST",
    credentials: "include",
    headers: { ...headers, ...devAuthHeaders() },
    body: JSON.stringify(request),
  });
  if (!response.ok || !response.body) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete: GenerationResponse | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const dataLine = lines.find((line) => line.startsWith("data: "));
      if (!event || !dataLine) continue;
      const data = JSON.parse(dataLine.slice(6)) as unknown;
      if (event === "stage") callbacks.onStage?.(data as GenerationStageEvent);
      if (event === "complete") complete = data as GenerationResponse;
      if (event === "error") throw new Error(JSON.stringify(data));
    }
  }
  if (complete === null) throw new Error("generation stream ended without complete event");
  return complete;
}

export async function listGenerationModels(): Promise<AnthropicModelPin[]> {
  const body = await requestJson<GenerationModelsResponse>("/v1/generate/models");
  return body.models;
}

export function getMe(): Promise<MeResponse> {
  return requestJson<MeResponse>("/v1/me");
}

export async function listModels(limit = 25): Promise<ModelRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ models: ModelRecord[] }>(`/v1/models?${params}`);
  return body.models;
}

export function saveModel(contract: unknown, asDraft = true): Promise<{ model: ModelRecord; report: Report }> {
  return requestJson<{ model: ModelRecord; report: Report }>("/v1/models", {
    method: "POST",
    body: JSON.stringify({ contract, asDraft }),
  });
}

export function editModel(id: string, prompt: string): Promise<{ model: ModelRecord; patch: unknown[]; report: Report; elapsedMs: number }> {
  return requestJson<{ model: ModelRecord; patch: unknown[]; report: Report; elapsedMs: number }>(`/v1/models/${id}/edit`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function shareModel(id: string): Promise<{ share: ShareSnapshot; url: string }> {
  return requestJson<{ share: ShareSnapshot; url: string }>(`/v1/models/${id}/share`, {
    method: "POST",
  });
}

export function getShare(shareId: string): Promise<{ share: ShareSnapshot }> {
  return requestJson<{ share: ShareSnapshot }>(`/v1/share/${shareId}`);
}

export async function listJobs(limit = 20): Promise<JobRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ jobs: JobRecord[] }>(`/v1/jobs?${params}`);
  return body.jobs;
}

export function getJobCapabilities(): Promise<JobCapabilities> {
  return requestJson<JobCapabilities>("/v1/jobs/capabilities");
}

export function createJob(kind: string, payload: unknown = {}): Promise<{ job: JobRecord }> {
  return requestJson<{ job: JobRecord }>("/v1/jobs", {
    method: "POST",
    body: JSON.stringify({ kind, provider: "fixture", payload }),
  });
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function uploadObjectBlob(
  file: File,
  purpose = "photoscan-source",
): Promise<{ blob: ObjectBlobRecord; upload: ObjectAccessContract }> {
  const sha256 = await sha256Hex(file);
  const registered = await requestJson<{ blob: ObjectBlobRecord; upload: ObjectAccessContract }>("/v1/blobs", {
    method: "POST",
    body: JSON.stringify({
      purpose,
      contentType: file.type || "application/octet-stream",
      byteSize: file.size,
      sha256,
      metadata: { originalName: file.name },
    }),
  });
  const res = await fetch(registered.upload.url, {
    method: registered.upload.method,
    headers: registered.upload.headers,
    body: file,
  });
  if (!res.ok) {
    throw new Error(`blob upload failed: ${res.status} ${res.statusText}`);
  }
  return registered;
}

export function accessObjectBlob(
  id: string,
  action: "upload" | "download" = "download",
): Promise<{ access: ObjectAccessContract }> {
  return requestJson<{ access: ObjectAccessContract }>(`/v1/blobs/${id}/access`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export async function listPhotoscanArtifacts(limit = 10): Promise<PhotoscanArtifactRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ artifacts: PhotoscanArtifactRecord[] }>(`/v1/photoscan/artifacts?${params}`);
  return body.artifacts;
}

export function updatePhotoscanAlignment(
  id: string,
  input: PhotoscanAlignmentInput,
): Promise<{ artifact: PhotoscanArtifactRecord }> {
  return requestJson<{ artifact: PhotoscanArtifactRecord }>(`/v1/photoscan/artifacts/${encodeURIComponent(id)}/alignment`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listPolicyArtifacts(limit = 10): Promise<PolicyArtifactRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ artifacts: PolicyArtifactRecord[] }>(`/v1/policies?${params}`);
  return body.artifacts;
}

export async function listReplayArtifacts(limit = 10): Promise<ReplayArtifactRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ replays: ReplayArtifactRecord[] }>(`/v1/replays?${params}`);
  return body.replays;
}

export async function listTelemetryLogs(limit = 10): Promise<TelemetryLogRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ logs: TelemetryLogRecord[] }>(`/v1/telemetry/logs?${params}`);
  return body.logs;
}

export async function listMaintenanceRecords(limit = 10): Promise<MaintenanceRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ records: MaintenanceRecord[] }>(`/v1/maintenance/records?${params}`);
  return body.records;
}

export function getCredits(): Promise<CreditSummary> {
  return requestJson<CreditSummary>("/v1/credits");
}

export async function getPlatformGates(): Promise<PlatformGateSignoff[]> {
  const body = await requestJson<{ gates: PlatformGateSignoff[] }>("/v1/platform/gates");
  return body.gates;
}

export async function listLicenseLedger(limit = 20): Promise<LicenseLedgerEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ ledger: LicenseLedgerEntry[] }>(`/v1/license-ledger?${params}`);
  return body.ledger;
}

export async function listVendorOffers(limit = 10): Promise<VendorOfferRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ offers: VendorOfferRecord[] }>(`/v1/commerce/vendor-offers?${params}`);
  return body.offers;
}

export function refreshVendorOffers(input: {
  componentIds?: string[];
  offers?: Array<{
    componentId: string;
    vendor: string;
    sku?: string;
    url: string;
    price?: number;
    currency?: string;
    availability?: string;
  }>;
}): Promise<{ offers: VendorOfferRecord[] }> {
  return requestJson<{ offers: VendorOfferRecord[] }>("/v1/commerce/vendor-offers/refresh", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listPrintQuotes(limit = 10): Promise<PrintQuoteRequestRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ quotes: PrintQuoteRequestRecord[] }>(`/v1/commerce/print-quotes?${params}`);
  return body.quotes;
}

export function createPrintQuote(input: {
  artifactBlobId: string;
  modelId?: string;
  jobId?: string;
  process?: string;
  material?: string;
  profile?: unknown;
  quantity?: number;
  dfmArtifact?: unknown;
  offer?: unknown;
}): Promise<{ quote: PrintQuoteRequestRecord }> {
  return requestJson<{ quote: PrintQuoteRequestRecord }>("/v1/commerce/print-quotes", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listCourses(limit = 10): Promise<CourseRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ courses: CourseRecord[] }>(`/v1/courses?${params}`);
  return body.courses;
}

export function createCourse(input: {
  name: string;
  envSpec: unknown;
  visibility?: "private" | "unlisted" | "public";
}): Promise<{ id: string; validatorReport: unknown }> {
  return requestJson<{ id: string; validatorReport: unknown }>("/v1/courses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listLeaderboardRuns(courseId: string, limit = 10): Promise<LeaderboardRunRecord[]> {
  const params = new URLSearchParams({ courseId, limit: String(limit) });
  const body = await requestJson<{ runs: LeaderboardRunRecord[] }>(`/v1/leaderboards?${params}`);
  return body.runs;
}

export function submitLeaderboardRun(input: {
  courseId: string;
  score: number;
  tape?: unknown;
  policyId?: string;
  expectedReplayHash?: string;
  expectedContractHash?: string;
}): Promise<{ id: string; verified: boolean; verification: unknown; replay: ReplayArtifactRecord | null }> {
  return requestJson<{ id: string; verified: boolean; verification: unknown; replay: ReplayArtifactRecord | null }>(
    "/v1/leaderboards",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function listListings(kind?: string, limit = 10): Promise<ListingRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (kind) params.set("kind", kind);
  const body = await requestJson<{ listings: ListingRecord[] }>(`/v1/listings?${params}`);
  return body.listings;
}

export function createListing(input: {
  modelId: string;
  title: string;
  listingKind?: "model" | "course" | "skill" | "component" | "policy";
  priceCredits?: number;
  policySignoff?: unknown;
}): Promise<{ id: string; status: string }> {
  return requestJson<{ id: string; status: string }>("/v1/listings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function recordListingUsage(
  listingId: string,
  input: {
    event: "view" | "equip" | "quote-click" | "policy-download" | "training-job";
    listingKind?: "model" | "course" | "skill" | "component" | "policy";
    creditsSpent?: number;
  },
): Promise<{ status: "recorded" }> {
  return requestJson<{ status: "recorded" }>(`/v1/listings/${encodeURIComponent(listingId)}/usage`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listClassroomAssignments(limit = 10): Promise<ClassroomAssignmentRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ assignments: ClassroomAssignmentRecord[] }>(`/v1/classroom/assignments?${params}`);
  return body.assignments;
}

export function createClassroomAssignment(input: {
  title: string;
  brief: string;
  rubric?: unknown;
  courseId?: string;
  visibility?: "private" | "unlisted" | "public";
}): Promise<{ id: string }> {
  return requestJson<{ id: string }>("/v1/classroom/assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listClassroomSubmissions(
  assignmentId: string,
  limit = 10,
): Promise<ClassroomSubmissionRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ submissions: ClassroomSubmissionRecord[] }>(
    `/v1/classroom/assignments/${encodeURIComponent(assignmentId)}/submissions?${params}`,
  );
  return body.submissions;
}

export function submitClassroomSubmission(
  assignmentId: string,
  input: { modelId?: string; contract?: unknown; scorecard?: unknown; policyId?: string; replayId?: string },
): Promise<{ id: string; grade: unknown; validatorReport: unknown }> {
  return requestJson<{ id: string; grade: unknown; validatorReport: unknown }>(
    `/v1/classroom/assignments/${encodeURIComponent(assignmentId)}/submissions`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function listModerationReports(limit = 10): Promise<ModerationReportRecord[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  const body = await requestJson<{ reports: ModerationReportRecord[] }>(`/v1/moderation/reports?${params}`);
  return body.reports;
}

export function createModerationReport(input: {
  targetKind: "listing" | "course" | "share" | "model" | "policy";
  targetId: string;
  reason: "safety" | "ip" | "spam" | "abuse" | "export-control" | "other";
  detail?: string;
}): Promise<{ id: string; status: string; slaDueAt: string; repeatInfringerSignal: boolean }> {
  return requestJson<{ id: string; status: string; slaDueAt: string; repeatInfringerSignal: boolean }>(
    "/v1/moderation/reports",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function latestBrief25Eval(): Promise<{ eval: unknown | null }> {
  return requestJson<{ eval: unknown | null }>("/v1/evals/brief25/latest");
}
