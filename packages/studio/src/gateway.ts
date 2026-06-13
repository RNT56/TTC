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
}

interface GenerationModelsResponse {
  models: AnthropicModelPin[];
}

const env = (
  import.meta as ImportMeta & {
    env?: { VITE_FORGE_GATEWAY_URL?: string; VITE_FORGE_REVIEW_TOKEN?: string };
  }
).env;
const gatewayBase = (env?.VITE_FORGE_GATEWAY_URL ?? "").replace(/\/$/, "");
const reviewToken = env?.VITE_FORGE_REVIEW_TOKEN;

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  options: { okStatuses?: number[] } = {},
): Promise<T> {
  const res = await fetch(`${gatewayBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(reviewToken ? { authorization: `Bearer ${reviewToken}` } : {}),
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

export async function listGenerationModels(): Promise<AnthropicModelPin[]> {
  const body = await requestJson<GenerationModelsResponse>("/v1/generate/models");
  return body.models;
}
