import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GatewayDb } from "./db.js";
import type { ReviewExportPolicy } from "./reviewQueue.js";
import { runValidator, type ValidateResult } from "./validator.js";

export type GenerationArchetype =
  | "biped"
  | "multirotor"
  | "rover"
  | "arm"
  | "quadruped"
  | "fixedwing";

export interface GenerationContextRequest {
  prompt: string;
  archetype?: GenerationArchetype;
  categories?: string[];
  limit?: number;
  includePrefixText?: boolean;
}

export interface GenerationRequest extends GenerationContextRequest {
  provider?: GenerationProvider;
  seed?: number;
  maxRepairIterations?: number;
  anthropicApiKey?: string;
}

export type GenerationProvider = "template" | "anthropic";

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
  dims: unknown;
  elec: unknown;
  mech: unknown;
  confidence: number;
  licenseClass: string;
  exportPolicy: ReviewExportPolicy;
  reviewer: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  priceCount: number;
  citationCount: number;
}

export interface RetrievedPattern {
  id: string;
  archetype: string;
  sourceKind: string;
  consent: string;
  summary: unknown;
  createdAt: string | null;
}

export interface PatternExemplar {
  id: string;
  name: string;
  archetype: string;
  source: string;
  contract: unknown;
}

export interface GenerationMaterials {
  schemaText: string;
  engineDocs: string;
  exemplars: PatternExemplar[];
}

export interface PromptPrefix {
  version: "p4-context-v1";
  hash: string;
  schemaHash: string;
  docsHash: string;
  exemplarHashes: string[];
  text: string | null;
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
  retrievedPatterns: RetrievedPattern[];
  promptPrefix: PromptPrefix;
  blockedReasons: string[];
}

export interface SynthesisCandidate {
  contract: unknown;
  modelId: string;
  promptHash: string;
  stopReason?: string;
  usage?: unknown;
}

export interface SynthesisRepairInput {
  context: GenerationContextResponse;
  request: GenerationRequest;
  candidate: SynthesisCandidate;
  attempt: GenerationAttempt;
}

export interface SynthesisAdapter {
  synthesize(context: GenerationContextResponse, request: GenerationRequest): Promise<SynthesisCandidate>;
  repair?(input: SynthesisRepairInput): Promise<SynthesisCandidate | null>;
}

export type GenerationValidator = (contractJson: string, asDraft?: boolean) => Promise<ValidateResult>;

export interface GenerationAttempt {
  index: number;
  phase: "synthesize" | "repair" | "draft";
  modelId: string;
  promptHash: string;
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
  report: unknown | null;
  blockedReasons: string[];
  generatedArtifact?: { artifactId: string; status: "admitted" | "draft" | "rejected"; contractHash: string } | null;
}

interface CatalogComponentRow {
  id: string;
  brand: string;
  model: string;
  rev: string;
  category: string;
  dims: unknown;
  mass_g: string | number;
  elec: unknown;
  mech: unknown;
  confidence: string | number;
  license_class: string;
  export_policy: ReviewExportPolicy | null;
  reviewer: string | null;
  reviewed_at: Date | string | null;
  review_note: string | null;
  price_count: string | number;
  citation_count: string | number;
}

interface PatternRow {
  id: string;
  archetype: string;
  source_kind: string;
  consent: string;
  summary: unknown;
  created_at: Date | string | null;
}

interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  strict: true;
}

interface AnthropicMessagesRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: AnthropicToolDefinition[];
  tool_choice: { type: "tool"; name: string };
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id?: string;
  name: string;
  input: unknown;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

type AnthropicContentBlock = AnthropicToolUseBlock | AnthropicTextBlock | Record<string, unknown>;

interface AnthropicMessagesResponse {
  model?: string;
  stop_reason?: string;
  content?: AnthropicContentBlock[];
  usage?: unknown;
}

export interface AnthropicTransportInput {
  baseUrl: string;
  apiKey: string;
  request: AnthropicMessagesRequest;
}

export type AnthropicTransport = (input: AnthropicTransportInput) => Promise<AnthropicMessagesResponse>;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const DEFAULT_REPAIR_ITERATIONS = 3;
const MAX_REPAIR_ITERATIONS = 3;
const DEFAULT_GENERATION_MAX_TOKENS = 8192;
const ANTHROPIC_API_VERSION = "2023-06-01";
const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
const CONTRACT_TOOL_NAME = "forge_emit_modelspec";
const MODEL_SOURCE_URLS = [
  "https://platform.claude.com/docs/en/about-claude/models/overview",
  "https://platform.claude.com/docs/en/about-claude/pricing",
];

export const ANTHROPIC_MODEL_PINS: AnthropicModelPin[] = [
  {
    role: "synthesis",
    modelId: "claude-fable-5",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 128_000,
    inputUsdPerMTok: 10,
    outputUsdPerMTok: 50,
    cacheWrite5mUsdPerMTok: 12.5,
    cacheWrite1hUsdPerMTok: 20,
    cacheHitUsdPerMTok: 1,
    sourceUrls: MODEL_SOURCE_URLS,
    checkedAt: "2026-06-13",
  },
  {
    role: "repair",
    modelId: "claude-opus-4-8",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 128_000,
    inputUsdPerMTok: 5,
    outputUsdPerMTok: 25,
    cacheWrite5mUsdPerMTok: 6.25,
    cacheWrite1hUsdPerMTok: 10,
    cacheHitUsdPerMTok: 0.5,
    sourceUrls: MODEL_SOURCE_URLS,
    checkedAt: "2026-06-13",
  },
  {
    role: "edit",
    modelId: "claude-sonnet-4-6",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 64_000,
    inputUsdPerMTok: 3,
    outputUsdPerMTok: 15,
    cacheWrite5mUsdPerMTok: 3.75,
    cacheWrite1hUsdPerMTok: 6,
    cacheHitUsdPerMTok: 0.3,
    sourceUrls: MODEL_SOURCE_URLS,
    checkedAt: "2026-06-13",
  },
  {
    role: "etl",
    modelId: "claude-haiku-4-5-20251001",
    apiAlias: "claude-haiku-4-5",
    contextWindowTokens: 200_000,
    maxOutputTokens: 64_000,
    inputUsdPerMTok: 1,
    outputUsdPerMTok: 5,
    cacheWrite5mUsdPerMTok: 1.25,
    cacheWrite1hUsdPerMTok: 2,
    cacheHitUsdPerMTok: 0.1,
    sourceUrls: MODEL_SOURCE_URLS,
    checkedAt: "2026-06-13",
  },
];

function repoRoot(): string {
  return join(process.cwd(), "..", "..");
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
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

function contractHash(contract: unknown): string {
  return sha256(stableJson(contract));
}

function promptHash(prompt: string): string {
  return sha256(prompt.trim());
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function boundedLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit ?? DEFAULT_LIMIT)));
}

function normalizeCategories(categories: string[] | undefined): string[] {
  return [...new Set((categories ?? []).map((item) => item.trim()).filter(Boolean))].sort();
}

function mapCatalogRow(row: CatalogComponentRow): RetrievedCatalogComponent {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    revision: row.rev,
    category: row.category,
    massG: Number(row.mass_g),
    dims: row.dims,
    elec: row.elec,
    mech: row.mech,
    confidence: Number(row.confidence),
    licenseClass: row.license_class,
    exportPolicy: row.export_policy ?? "blocked",
    reviewer: row.reviewer,
    reviewedAt: iso(row.reviewed_at),
    reviewNote: row.review_note,
    priceCount: Number(row.price_count),
    citationCount: Number(row.citation_count),
  };
}

export async function retrieveApprovedComponents(
  db: GatewayDb,
  request: GenerationContextRequest,
): Promise<RetrievedCatalogComponent[]> {
  const categories = normalizeCategories(request.categories);
  const result = await db.query<CatalogComponentRow>(
    `SELECT c.id,
            c.brand,
            c.model,
            c.rev,
            c.category,
            c.dims,
            c.mass_g,
            c.elec,
            c.mech,
            c.confidence,
            l.class AS license_class,
            rq.export_policy,
            rq.reviewer,
            rq.reviewed_at,
            rq.review_note,
            COUNT(DISTINCT p.vendor) FILTER (WHERE p.purchasable) AS price_count,
            COUNT(DISTINCT pr.field) AS citation_count
       FROM components c
       JOIN licenses l ON l.id = c.license_id
       JOIN review_queue rq
         ON rq.artifact_id = c.id
        AND rq.artifact_kind = 'component'
        AND rq.status = 'approved'
        AND COALESCE(rq.export_policy, 'blocked') <> 'blocked'
       LEFT JOIN prices p ON p.component_id = c.id
       LEFT JOIN provenance pr ON pr.artifact_id = c.id
      WHERE ($1::text[] IS NULL OR c.category = ANY($1::text[]))
      GROUP BY c.id, l.class, rq.export_policy, rq.reviewer, rq.reviewed_at, rq.review_note
      ORDER BY
        CASE
          WHEN lower($2) LIKE '%' || lower(c.brand) || '%'
            OR lower($2) LIKE '%' || lower(c.model) || '%'
            OR lower($2) LIKE '%' || lower(c.category) || '%'
          THEN 0 ELSE 1
        END,
        c.category ASC,
        c.brand ASC,
        c.model ASC
      LIMIT $3`,
    [categories.length === 0 ? null : categories, request.prompt, boundedLimit(request.limit)],
  );
  return result.rows.map(mapCatalogRow);
}

function mapPatternRow(row: PatternRow): RetrievedPattern {
  return {
    id: row.id,
    archetype: row.archetype,
    sourceKind: row.source_kind,
    consent: row.consent,
    summary: row.summary,
    createdAt: iso(row.created_at),
  };
}

export async function retrievePatternRows(
  db: GatewayDb,
  request: GenerationContextRequest,
): Promise<RetrievedPattern[]> {
  try {
    const result = await db.query<PatternRow>(
      `SELECT id, archetype, source_kind, consent, summary, created_at
         FROM pattern_library
        WHERE consent <> 'opt-out'
          AND ($1::text IS NULL OR archetype = $1)
        ORDER BY
          CASE
            WHEN lower($2) LIKE '%' || lower(archetype) || '%' THEN 0 ELSE 1
          END,
          created_at DESC
        LIMIT $3`,
      [request.archetype ?? null, request.prompt, Math.min(8, boundedLimit(request.limit))],
    );
    return result.rows.map(mapPatternRow);
  } catch {
    // Pattern retrieval must not block generation on pre-migration local DBs or
    // tests using narrow fake DBs. Catalog retrieval remains fail-closed.
    return [];
  }
}

export async function loadGenerationMaterials(): Promise<GenerationMaterials> {
  const root = repoRoot();
  const [schemaText, generationDocs, contractDocs, vx2Proof, qdMini] = await Promise.all([
    readFile(join(root, "schema", "forge-modelspec.schema.json"), "utf8"),
    readFile(join(root, "docs", "systems", "generation-pipeline.md"), "utf8"),
    readFile(join(root, "docs", "systems", "model-contract.md"), "utf8"),
    readFile(join(root, "examples", "vx2-proof.forge.json"), "utf8"),
    readFile(join(root, "examples", "qd-mini.forge.json"), "utf8"),
  ]);
  const exemplar = (source: string, text: string): PatternExemplar => {
    const contract = JSON.parse(text) as { meta?: { id?: string; name?: string; archetype?: string } };
    return {
      id: contract.meta?.id ?? source,
      name: contract.meta?.name ?? source,
      archetype: contract.meta?.archetype ?? "unknown",
      source,
      contract,
    };
  };
  return {
    schemaText,
    engineDocs: [
      "# generation-pipeline.md",
      generationDocs,
      "# model-contract.md",
      contractDocs,
    ].join("\n\n"),
    exemplars: [
      exemplar("examples/vx2-proof.forge.json", vx2Proof),
      exemplar("examples/qd-mini.forge.json", qdMini),
    ],
  };
}

export function buildPromptPrefix(
  materials: GenerationMaterials,
  components: RetrievedCatalogComponent[],
  patterns: RetrievedPattern[],
  includeText: boolean,
): PromptPrefix {
  const schemaHash = sha256(materials.schemaText);
  const docsHash = sha256(materials.engineDocs);
  const exemplarHashes = materials.exemplars.map((exemplar) => sha256(stableJson(exemplar.contract)));
  const catalogSummary = components.map((component) => ({
    id: component.id,
    revision: component.revision,
    category: component.category,
    brand: component.brand,
    model: component.model,
    licenseClass: component.licenseClass,
    exportPolicy: component.exportPolicy,
    massG: component.massG,
    priceCount: component.priceCount,
    citationCount: component.citationCount,
  }));
  const prefixSections = [
    "ForgedTTC generation prefix v1.",
    "Emit only JSON matching the ModelSpec schema. Do not emit code.",
    "Use only retrieved catalog components that carry approved review rows.",
    "If the approved catalog context is insufficient, return a draft with diagnostics instead of inventing part truth.",
    `Schema SHA-256: ${schemaHash}`,
    `Engine docs SHA-256: ${docsHash}`,
    `Approved catalog context: ${stableJson(catalogSummary)}`,
    `Approved pattern context: ${stableJson(patterns.map((pattern) => ({
      id: pattern.id,
      archetype: pattern.archetype,
      sourceKind: pattern.sourceKind,
      consent: pattern.consent,
      summary: pattern.summary,
    })))}`,
    `Schema JSON: ${materials.schemaText}`,
    `Engine docs: ${materials.engineDocs}`,
    `Schema-true exemplars: ${stableJson(materials.exemplars)}`,
  ];
  const text = prefixSections.join("\n\n");
  return {
    version: "p4-context-v1",
    hash: sha256(text),
    schemaHash,
    docsHash,
    exemplarHashes,
    text: includeText ? text : null,
  };
}

export async function buildGenerationContext(
  db: GatewayDb,
  request: GenerationContextRequest,
  materials?: GenerationMaterials,
): Promise<GenerationContextResponse> {
  const categories = normalizeCategories(request.categories);
  const retrievedComponents = await retrieveApprovedComponents(db, request);
  const retrievedPatterns = await retrievePatternRows(db, request);
  const promptPrefix = buildPromptPrefix(
    materials ?? (await loadGenerationMaterials()),
    retrievedComponents,
    retrievedPatterns,
    request.includePrefixText ?? true,
  );
  const blockedReasons: string[] = [];
  if (retrievedComponents.length === 0) {
    blockedReasons.push("no approved catalog components matched the generation brief");
  }
  return {
    mode: "context-only",
    catalogPolicy: "approved-review-rows-only",
    brief: {
      prompt: request.prompt,
      archetype: request.archetype ?? null,
      categories,
    },
    retrievedComponents,
    retrievedPatterns,
    promptPrefix,
    blockedReasons,
  };
}

function diagnosticsFromReport(report: unknown): GenerationAttempt["diagnostics"] {
  if (!report || typeof report !== "object") return [];
  const results = (report as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      check: typeof item.check === "string" ? item.check : undefined,
      severity: typeof item.severity === "string" ? item.severity : undefined,
      message: typeof item.message === "string" ? item.message : undefined,
    }));
}

function verdictFromReport(report: unknown, fallback: string): string {
  if (report && typeof report === "object" && typeof (report as { verdict?: unknown }).verdict === "string") {
    return (report as { verdict: string }).verdict;
  }
  return fallback;
}

function pushAttempt(
  attempts: GenerationAttempt[],
  candidate: SynthesisCandidate,
  phase: GenerationAttempt["phase"],
  result: ValidateResult,
): GenerationAttempt {
  const attempt: GenerationAttempt = {
    index: attempts.length,
    phase,
    modelId: candidate.modelId,
    promptHash: candidate.promptHash,
    contractHash: contractHash(candidate.contract),
    verdict: verdictFromReport(result.report, result.exitCode === 0 ? "admitted" : "rejected"),
    diagnostics: diagnosticsFromReport(result.report),
    stopReason: candidate.stopReason,
    usage: candidate.usage,
  };
  attempts.push(attempt);
  return attempt;
}

function repairLimit(limit: number | undefined): number {
  return Math.max(0, Math.min(MAX_REPAIR_ITERATIONS, Math.trunc(limit ?? DEFAULT_REPAIR_ITERATIONS)));
}

function synthesisModel(): AnthropicModelPin {
  return ANTHROPIC_MODEL_PINS.find((pin) => pin.role === "synthesis") ?? ANTHROPIC_MODEL_PINS[0];
}

function repairModel(): AnthropicModelPin {
  return ANTHROPIC_MODEL_PINS.find((pin) => pin.role === "repair") ?? synthesisModel();
}

function generationBaseUrl(): string {
  return process.env.ANTHROPIC_BASE_URL ?? ANTHROPIC_DEFAULT_BASE_URL;
}

function generationApiKey(request: GenerationRequest): string | null {
  return request.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseObjectJson(text: string): Record<string, unknown> {
  const value = JSON.parse(text) as unknown;
  if (!isRecord(value)) {
    throw new Error("generation schema is not a JSON object");
  }
  return value;
}

function reportSummary(attempt: GenerationAttempt): string {
  if (attempt.diagnostics.length === 0) return "validator rejected the candidate without diagnostics";
  return stableJson(
    attempt.diagnostics.map((diagnostic) => ({
      check: diagnostic.check ?? "unknown",
      severity: diagnostic.severity ?? "unknown",
      message: diagnostic.message ?? "",
    })),
  );
}

function extractContractFromAnthropic(response: AnthropicMessagesResponse): unknown {
  const content = response.content ?? [];
  const toolUse = content.find(
    (block): block is AnthropicToolUseBlock =>
      isRecord(block) && block.type === "tool_use" && block.name === CONTRACT_TOOL_NAME,
  );
  if (toolUse === undefined) {
    throw new Error(`Anthropic response did not include ${CONTRACT_TOOL_NAME} tool_use`);
  }
  return toolUse.input;
}

async function defaultAnthropicTransport(
  input: AnthropicTransportInput,
): Promise<AnthropicMessagesResponse> {
  const response = await fetch(`${input.baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify(input.request),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Anthropic Messages API failed (${response.status}): ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as AnthropicMessagesResponse;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Anthropic Messages API returned invalid JSON: ${detail}`);
  }
}

function buildContractTool(materials: GenerationMaterials): AnthropicToolDefinition {
  return {
    name: CONTRACT_TOOL_NAME,
    description: [
      "Emit one complete ForgedTTC ModelSpec contract JSON object.",
      "Use only approved catalog component references provided in the generation context.",
      "Do not invent mechanical, electrical, mass, price, citation, or license truth.",
      "Generated contracts must include meta.provenance with modelVersion, promptHash, and seed.",
    ].join(" "),
    input_schema: parseObjectJson(materials.schemaText),
    strict: true,
  };
}

function buildAnthropicSystem(materials: GenerationMaterials, context: GenerationContextResponse): string {
  return [
    buildPromptPrefix(materials, context.retrievedComponents, context.retrievedPatterns, true).text ?? "",
    "You are the constrained synthesis pass for ForgedTTC.",
    "Always call the forge_emit_modelspec tool exactly once. The tool input must be the full ModelSpec contract.",
    "Every referenced catalog component must come from the approved catalog context.",
  ].join("\n\n");
}

function buildSynthesisPrompt(request: GenerationRequest): string {
  return [
    `User brief: ${request.prompt}`,
    `Archetype: ${request.archetype ?? "unspecified"}`,
    `Categories: ${normalizeCategories(request.categories).join(", ") || "unspecified"}`,
    `Seed: ${Math.max(0, Math.trunc(request.seed ?? 0))}`,
    "Return only the tool call; no explanatory text is needed.",
  ].join("\n");
}

function buildRepairPrompt(input: SynthesisRepairInput): string {
  return [
    "Repair the previous ModelSpec candidate so it can pass forge-validate.",
    `Original user brief: ${input.request.prompt}`,
    `Previous validator verdict: ${input.attempt.verdict}`,
    `Diagnostics: ${reportSummary(input.attempt)}`,
    `Previous candidate JSON: ${stableJson(input.candidate.contract)}`,
    "Return the repaired full ModelSpec as the tool input.",
  ].join("\n\n");
}

function promptHashForRepair(request: GenerationRequest, attempt: GenerationAttempt): string {
  return sha256([request.prompt.trim(), attempt.contractHash, reportSummary(attempt)].join("\n"));
}

type JsonObject = Record<string, unknown>;

function inferArchetype(request: GenerationRequest): GenerationArchetype {
  if (request.archetype) return request.archetype;
  const prompt = request.prompt.toLowerCase();
  if (/rover|ugv|wheeled|tracked/.test(prompt)) return "rover";
  if (/quadruped|four[- ]leg|dog/.test(prompt)) return "quadruped";
  if (/biped|humanoid|walker/.test(prompt)) return "biped";
  if (/arm|gripper|manipulator/.test(prompt)) return "arm";
  if (/fixed[- ]?wing|plane|aircraft|glider/.test(prompt)) return "fixedwing";
  return "multirotor";
}

function node(name: string, parent: string | null, pos: [number, number, number], extra: JsonObject = {}): JsonObject {
  return { name, parent, pos, ...extra };
}

function explode(index: number, total: number, leader: string): JsonObject {
  return {
    dir: [0, 1, 0],
    mag: Number((0.045 + index * 0.004).toFixed(3)),
    t0: Number((index / Math.max(1, total)).toFixed(3)),
    t1: Number(((index + 1) / Math.max(1, total)).toFixed(3)),
    leader,
  };
}

function part(
  nodeName: string,
  geom: JsonObject,
  index: number,
  total: number,
  massG: number,
  comp: string,
  options: { material?: string; color?: string; pose?: JsonObject; collision?: string } = {},
): JsonObject {
  return {
    node: nodeName,
    geom,
    ...(options.pose ? { pose: options.pose } : {}),
    material: options.material ?? "matte",
    color: options.color ?? "#334155",
    comp,
    mass: { valueG: massG },
    collision: options.collision ?? "primitive",
    explode: explode(index, total, comp),
  };
}

function templateMeta(
  archetype: GenerationArchetype,
  request: GenerationRequest,
  hash: string,
  seed: number,
): JsonObject {
  const title = request.prompt.trim().split(/\s+/).slice(0, 8).join(" ");
  return {
    id: `gen-${hash.slice(0, 12)}`,
    name: `Generated ${archetype} - ${title || "model"}`,
    version: "0.1.0",
    archetype,
    provenance: {
      kind: "llm-generation",
      promptHash: hash,
      modelVersion: "forge-template-p4-v1",
      seed,
    },
    license: "CC0",
  };
}

function majorRange(revision: string): string {
  const major = revision.match(/^(\d+)/)?.[1] ?? "1";
  return `^${major}`;
}

function catalogSlots(
  context: GenerationContextResponse,
  mountMap: Record<string, string[]>,
): { slots: JsonObject[]; lockfile: Record<string, string> } {
  const seen = new Set<string>();
  const slots: JsonObject[] = [];
  const lockfile: Record<string, string> = {};
  for (const component of context.retrievedComponents) {
    if (seen.has(component.category)) continue;
    const mounts = mountMap[component.category];
    if (!mounts || mounts.length === 0) continue;
    seen.add(component.category);
    const componentRef = `${component.id}@${majorRange(component.revision)}`;
    lockfile[componentRef] = `${component.id}@${component.revision}`;
    slots.push({
      id: `${component.category}-catalog`,
      label: `${component.category} catalog selection`,
      mountNodes: mounts,
      variants: [
        {
          id: component.id.replace(/^cmp_/, ""),
          name: `${component.brand} ${component.model}`,
          componentRef,
          ports: {},
        },
      ],
    });
  }
  return { slots, lockfile };
}

function commonSim(): JsonObject {
  return {
    colliders: { policy: "per-node-compound", budget: { perNode: 8, perModel: 24 } },
  };
}

function multirotorTemplate(
  context: GenerationContextResponse,
  request: GenerationRequest,
  hash: string,
  seed: number,
): JsonObject {
  const skeleton = [
    node("root", null, [0, 0.05, 0]),
    node("m0", "root", [0.13, 0, 0.13]),
    node("m1", "root", [-0.13, 0, 0.13]),
    node("m2", "root", [-0.13, 0, -0.13]),
    node("m3", "root", [0.13, 0, -0.13]),
  ];
  const motorNodes = ["m0", "m1", "m2", "m3"];
  const total = 11;
  const parts = [
    part("root", { kind: "cbox", w: 0.18, h: 0.02, d: 0.14, ch: 0.015 }, 0, total, 120, "frame"),
    part("root", { kind: "box", w: 0.13, h: 0.035, d: 0.08 }, 1, total, 170, "battery", {
      color: "#111827",
      pose: { p: [0, 0.035, 0], r: [0, 0, 0], s: [1, 1, 1] },
    }),
    part("root", { kind: "box", w: 0.04, h: 0.012, d: 0.04 }, 2, total, 15, "fc", {
      material: "gloss",
      color: "#0f172a",
    }),
    ...motorNodes.flatMap((name, index) => [
      part(name, { kind: "cyl", r0: 0.018, h: 0.015, n: 16 }, 3 + index * 2, total, 33, "motor", {
        material: "metal",
        color: "#475569",
      }),
      part(name, { kind: "cyl", r0: 0.064, h: 0.003, n: 24 }, 4 + index * 2, total, 4, "prop", {
        material: "satin",
        color: "#94a3b8",
        collision: "none",
      }),
    ]),
  ];
  const catalog = catalogSlots(context, {
    motor: motorNodes,
    prop: motorNodes,
    battery: ["root"],
    fc: ["root"],
    esc: ["root"],
    frame: ["root"],
  });
  return {
    meta: templateMeta("multirotor", request, hash, seed),
    skeleton,
    parts,
    slots: catalog.slots,
    lockfile: catalog.lockfile,
    driver: { archetype: "multirotor", params: { tiltMaxRad: 0.4, yawRate: 2.4, mixer: "x4" } },
    sim: {
      battery: { cells: 4, capacity_mAh: 1500, cRating: 130, r_int_mohm: 8 },
      motors: motorNodes.map((mount, index) => ({
        mount,
        kv: 1900,
        r_int_mohm: 85,
        maxCurrentA: 35,
        dir: index % 2 === 0 ? 1 : -1,
      })),
      props: [{ diameterIn: 5, pitchIn: 4.3, blades: 3 }],
      ...commonSim(),
    },
  };
}

function roverTemplate(
  context: GenerationContextResponse,
  request: GenerationRequest,
  hash: string,
  seed: number,
): JsonObject {
  const total = 6;
  const skeleton = [node("root", null, [0, 0.08, 0])];
  const wheelPose = (x: number, z: number): JsonObject => ({ p: [x, -0.03, z], r: [0, 0, 1.5708], s: [1, 1, 1] });
  const parts = [
    part("root", { kind: "cbox", w: 0.28, h: 0.07, d: 0.38, ch: 0.02 }, 0, total, 900, "chassis", {
      color: "#1f2937",
    }),
    part("root", { kind: "box", w: 0.12, h: 0.05, d: 0.1 }, 1, total, 220, "compute", {
      material: "gloss",
      color: "#0f172a",
      pose: { p: [0, 0.055, 0.03], r: [0, 0, 0], s: [1, 1, 1] },
    }),
    part("root", { kind: "cyl", r0: 0.045, h: 0.035, n: 16 }, 2, total, 90, "wheel", { pose: wheelPose(-0.16, 0.14), material: "rubber" }),
    part("root", { kind: "cyl", r0: 0.045, h: 0.035, n: 16 }, 3, total, 90, "wheel", { pose: wheelPose(0.16, 0.14), material: "rubber" }),
    part("root", { kind: "cyl", r0: 0.045, h: 0.035, n: 16 }, 4, total, 90, "wheel", { pose: wheelPose(-0.16, -0.14), material: "rubber" }),
    part("root", { kind: "cyl", r0: 0.045, h: 0.035, n: 16 }, 5, total, 90, "wheel", { pose: wheelPose(0.16, -0.14), material: "rubber" }),
  ];
  const catalog = catalogSlots(context, { rover: ["root"], battery: ["root"], fc: ["root"] });
  return {
    meta: templateMeta("rover", request, hash, seed),
    skeleton,
    parts,
    slots: catalog.slots,
    lockfile: catalog.lockfile,
    driver: { archetype: "rover", params: { wheelbaseM: 0.32, maxSpeedMs: 1.0 } },
    sim: commonSim(),
  };
}

function quadrupedTemplate(
  context: GenerationContextResponse,
  request: GenerationRequest,
  hash: string,
  seed: number,
): JsonObject {
  const sides = [
    ["0l", 0.12, 0.18],
    ["1l", -0.12, 0.18],
    ["2l", -0.12, -0.18],
    ["3l", 0.12, -0.18],
  ] as const;
  const skeleton: JsonObject[] = [node("root", null, [0, 0.27, 0])];
  for (const [id, x, z] of sides) {
    skeleton.push(
      node(`hip_${id}`, "root", [x, 0, z], {
        limits: [[-1.4, 1.4], [0, 0], [0, 0]],
        joint: { type: "revolute", axis: [1, 0, 0], maxVelRad: 12 },
      }),
      node(`knee_${id}`, `hip_${id}`, [0, -0.13, 0], {
        limits: [[0, 2.6], [0, 0], [0, 0]],
        joint: { type: "revolute", axis: [1, 0, 0], maxVelRad: 12 },
      }),
      node(`foot_${id}`, `knee_${id}`, [0, -0.13, 0]),
    );
  }
  const total = 1 + sides.length * 2;
  const parts: JsonObject[] = [
    part("root", { kind: "cbox", w: 0.3, h: 0.06, d: 0.46, ch: 0.02 }, 0, total, 1200, "body", {
      color: "#28313d",
    }),
  ];
  let index = 1;
  for (const [id] of sides) {
    parts.push(
      part(`knee_${id}`, { kind: "cyl", r0: 0.018, r1: 0.014, h: 0.13, n: 16 }, index, total, 95, "thigh", {
        material: "satin",
        pose: { p: [0, 0.065, 0], r: [0, 0, 0], s: [1, 1, 1] },
      }),
    );
    index += 1;
    parts.push(
      part(`foot_${id}`, { kind: "cyl", r0: 0.014, r1: 0.01, h: 0.13, n: 16 }, index, total, 65, "shank", {
        material: "satin",
        pose: { p: [0, 0.065, 0], r: [0, 0, 0], s: [1, 1, 1] },
      }),
    );
    index += 1;
  }
  const catalog = catalogSlots(context, { battery: ["root"], fc: ["root"] });
  return {
    meta: templateMeta("quadruped", request, hash, seed),
    skeleton,
    parts,
    slots: catalog.slots,
    lockfile: catalog.lockfile,
    driver: {
      archetype: "quadruped",
      params: { cadenceHz: 2.0, duty: 0.5, liftM: 0.048, standHeightM: 0.228, strideM: 0.18 },
    },
    sim: commonSim(),
  };
}

function armTemplate(
  context: GenerationContextResponse,
  request: GenerationRequest,
  hash: string,
  seed: number,
): JsonObject {
  const skeleton = [
    node("root", null, [0, 0.04, 0]),
    node("shoulder", "root", [0, 0.08, 0], { joint: { type: "revolute", axis: [0, 1, 0], maxVelRad: 4 } }),
    node("elbow", "shoulder", [0, 0.22, 0], { joint: { type: "revolute", axis: [1, 0, 0], maxVelRad: 4 } }),
    node("wrist", "elbow", [0, 0.18, 0], { joint: { type: "revolute", axis: [1, 0, 0], maxVelRad: 4 } }),
  ];
  const total = 5;
  const parts = [
    part("root", { kind: "cyl", r0: 0.06, h: 0.05, n: 24 }, 0, total, 260, "base", { material: "metal" }),
    part("shoulder", { kind: "cyl", r0: 0.025, h: 0.24, n: 16 }, 1, total, 180, "upper-arm", {
      pose: { p: [0, 0.12, 0], r: [0, 0, 0], s: [1, 1, 1] },
      material: "satin",
    }),
    part("elbow", { kind: "cyl", r0: 0.021, h: 0.2, n: 16 }, 2, total, 130, "forearm", {
      pose: { p: [0, 0.1, 0], r: [0, 0, 0], s: [1, 1, 1] },
      material: "satin",
    }),
    part("wrist", { kind: "box", w: 0.08, h: 0.025, d: 0.03 }, 3, total, 60, "gripper-left", {
      pose: { p: [-0.03, 0.04, 0], r: [0, 0, 0], s: [1, 1, 1] },
    }),
    part("wrist", { kind: "box", w: 0.08, h: 0.025, d: 0.03 }, 4, total, 60, "gripper-right", {
      pose: { p: [0.03, 0.04, 0], r: [0, 0, 0], s: [1, 1, 1] },
    }),
  ];
  const catalog = catalogSlots(context, { battery: ["root"], fc: ["root"] });
  return {
    meta: templateMeta("arm", request, hash, seed),
    skeleton,
    parts,
    slots: catalog.slots,
    lockfile: catalog.lockfile,
    driver: { archetype: "arm", params: { reachM: 0.48, dof: 4 } },
    sim: commonSim(),
  };
}

function bipedTemplate(
  context: GenerationContextResponse,
  request: GenerationRequest,
  hash: string,
  seed: number,
): JsonObject {
  const skeleton = [
    node("root", null, [0, 0.9, 0]),
    node("chest", "root", [0, 0.25, 0]),
    node("head", "chest", [0, 0.24, 0]),
    node("hp-1", "root", [-0.08, -0.1, 0]),
    node("kn-1", "hp-1", [0, -0.39, 0]),
    node("an-1", "kn-1", [0, -0.39, 0]),
    node("hp1", "root", [0.08, -0.1, 0]),
    node("kn1", "hp1", [0, -0.39, 0]),
    node("an1", "kn1", [0, -0.39, 0]),
    node("sh-1", "chest", [-0.18, 0.1, 0]),
    node("el-1", "sh-1", [0, -0.24, 0]),
    node("ha-1", "el-1", [0, -0.22, 0]),
    node("sh1", "chest", [0.18, 0.1, 0]),
    node("el1", "sh1", [0, -0.24, 0]),
    node("ha1", "el1", [0, -0.22, 0]),
  ];
  const total = 11;
  const limb = (nodeName: string, radius: number, height: number, index: number, comp: string, mass = 80) =>
    part(nodeName, { kind: "cyl", r0: radius, h: height, n: 12 }, index, total, mass, comp, {
      material: "satin",
      pose: { p: [0, height / 2, 0], r: [0, 0, 0], s: [1, 1, 1] },
    });
  const parts = [
    part("root", { kind: "box", w: 0.18, h: 0.18, d: 0.08 }, 0, total, 600, "pelvis"),
    part("chest", { kind: "box", w: 0.24, h: 0.32, d: 0.1 }, 1, total, 800, "torso"),
    part("head", { kind: "cyl", r0: 0.08, h: 0.1, n: 16 }, 2, total, 200, "head"),
    limb("kn-1", 0.03, 0.39, 3, "thigh"),
    limb("an-1", 0.025, 0.39, 4, "shank"),
    limb("kn1", 0.03, 0.39, 5, "thigh"),
    limb("an1", 0.025, 0.39, 6, "shank"),
    limb("el-1", 0.025, 0.24, 7, "upper-arm", 60),
    limb("ha-1", 0.02, 0.22, 8, "forearm", 50),
    limb("el1", 0.025, 0.24, 9, "upper-arm", 60),
    limb("ha1", 0.02, 0.22, 10, "forearm", 50),
  ];
  const catalog = catalogSlots(context, { battery: ["root"], fc: ["chest"] });
  return {
    meta: templateMeta("biped", request, hash, seed),
    skeleton,
    parts,
    slots: catalog.slots,
    lockfile: catalog.lockfile,
    driver: { archetype: "biped", params: { pen: 2.35 } },
    sim: commonSim(),
  };
}

function fixedwingTemplate(
  context: GenerationContextResponse,
  request: GenerationRequest,
  hash: string,
  seed: number,
): JsonObject {
  const skeleton = [
    node("root", null, [0, 0.08, 0]),
    node("leftWing", "root", [-0.24, 0, 0.02]),
    node("rightWing", "root", [0.24, 0, 0.02]),
    node("tail", "root", [0, 0, -0.32]),
    node("nose", "root", [0, 0, 0.32]),
  ];
  const total = 5;
  const parts = [
    part("root", { kind: "cbox", w: 0.08, h: 0.06, d: 0.6, ch: 0.015 }, 0, total, 280, "fuselage", {
      color: "#f8fafc",
    }),
    part("leftWing", { kind: "box", w: 0.48, h: 0.018, d: 0.12 }, 1, total, 120, "left-wing", {
      color: "#2563eb",
      pose: { p: [-0.12, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    }),
    part("rightWing", { kind: "box", w: 0.48, h: 0.018, d: 0.12 }, 2, total, 120, "right-wing", {
      color: "#2563eb",
      pose: { p: [0.12, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
    }),
    part("tail", { kind: "box", w: 0.22, h: 0.015, d: 0.08 }, 3, total, 40, "tailplane", {
      color: "#94a3b8",
    }),
    part("nose", { kind: "cyl", r0: 0.035, h: 0.04, n: 16 }, 4, total, 55, "motor-pod", {
      material: "metal",
    }),
  ];
  const catalog = catalogSlots(context, { motor: ["nose"], prop: ["nose"], battery: ["root"], fc: ["root"] });
  return {
    meta: templateMeta("fixedwing", request, hash, seed),
    skeleton,
    parts,
    slots: catalog.slots,
    lockfile: catalog.lockfile,
    driver: { archetype: "fixedwing", params: { wingSpanM: 0.96, cruiseSpeedMs: 12 } },
    sim: commonSim(),
  };
}

function buildTemplateContract(
  context: GenerationContextResponse,
  request: GenerationRequest,
  hash: string,
  seed: number,
): JsonObject {
  switch (inferArchetype(request)) {
    case "rover":
      return stable(roverTemplate(context, request, hash, seed)) as JsonObject;
    case "quadruped":
      return stable(quadrupedTemplate(context, request, hash, seed)) as JsonObject;
    case "biped":
      return stable(bipedTemplate(context, request, hash, seed)) as JsonObject;
    case "arm":
      return stable(armTemplate(context, request, hash, seed)) as JsonObject;
    case "fixedwing":
      return stable(fixedwingTemplate(context, request, hash, seed)) as JsonObject;
    case "multirotor":
      return stable(multirotorTemplate(context, request, hash, seed)) as JsonObject;
  }
}

export class TemplateSynthesisAdapter implements SynthesisAdapter {
  constructor(_materials: GenerationMaterials) {}

  async synthesize(context: GenerationContextResponse, request: GenerationRequest): Promise<SynthesisCandidate> {
    const hash = promptHash(request.prompt);
    const seed = Math.max(0, Math.trunc(request.seed ?? 0));
    const contract = buildTemplateContract(context, request, hash, seed);
    return { contract, modelId: synthesisModel().modelId, promptHash: hash };
  }

  async repair(input: SynthesisRepairInput): Promise<SynthesisCandidate | null> {
    const contract = stable(input.candidate.contract) as Record<string, unknown>;
    if (!isRecord(contract)) return null;
    let changed = false;
    const checks = new Set(input.attempt.diagnostics.map((diagnostic) => diagnostic.check));

    if (checks.has("EVAL-ARCHETYPE") || checks.has("CTR-001")) {
      return this.synthesize(input.context, input.request);
    }

    if (checks.has("PRV-001")) {
      const meta = isRecord(contract.meta) ? contract.meta : {};
      contract.meta = {
        ...meta,
        provenance: {
          kind: "llm-generation",
          promptHash: promptHashForRepair(input.request, input.attempt),
          modelVersion: repairModel().modelId,
          seed: Math.max(0, Math.trunc(input.request.seed ?? 0)),
        },
      };
      changed = true;
    }

    if (checks.has("CTR-005") && Array.isArray(contract.parts)) {
      for (const part of contract.parts) {
        if (isRecord(part) && typeof part.color === "string" && !/^#[a-f0-9]{6}$/i.test(part.color)) {
          part.color = "#334155";
          changed = true;
        }
      }
    }

    if (checks.has("CTR-004") && Array.isArray(contract.parts)) {
      const parts = contract.parts;
      parts.forEach((part, index) => {
        if (!isRecord(part) || part.explode !== undefined) return;
        part.explode = {
          dir: [0, 1, 0],
          mag: 0.05 + index * 0.002,
          t0: Number((index / Math.max(1, parts.length)).toFixed(3)),
          t1: Number(((index + 1) / Math.max(1, parts.length)).toFixed(3)),
          leader: part.comp ?? `part-${index}`,
        };
        changed = true;
      });
    }

    if (checks.has("SIM-003") && isRecord(contract.sim)) {
      const battery = contract.sim.battery;
      if (isRecord(battery)) {
        battery.cRating = Math.max(Number(battery.cRating ?? 0), 150);
        changed = true;
      }
    }

    if (!changed) return null;
    return {
      contract,
      modelId: repairModel().modelId,
      promptHash: promptHashForRepair(input.request, input.attempt),
    };
  }
}

export class AnthropicSynthesisAdapter implements SynthesisAdapter {
  private readonly baseUrl: string;
  private readonly transport: AnthropicTransport;

  constructor(
    private readonly materials: GenerationMaterials,
    private readonly apiKey: string,
    options: {
      baseUrl?: string;
      transport?: AnthropicTransport;
    } = {},
  ) {
    if (!apiKey.trim()) {
      throw new Error("Anthropic generation requires an API key");
    }
    this.baseUrl = options.baseUrl ?? generationBaseUrl();
    this.transport = options.transport ?? defaultAnthropicTransport;
  }

  async synthesize(context: GenerationContextResponse, request: GenerationRequest): Promise<SynthesisCandidate> {
    return this.callClaude(context, request, synthesisModel(), buildSynthesisPrompt(request), promptHash(request.prompt));
  }

  async repair(input: SynthesisRepairInput): Promise<SynthesisCandidate | null> {
    return this.callClaude(
      input.context,
      input.request,
      repairModel(),
      buildRepairPrompt(input),
      promptHashForRepair(input.request, input.attempt),
    );
  }

  private async callClaude(
    context: GenerationContextResponse,
    request: GenerationRequest,
    model: AnthropicModelPin,
    userPrompt: string,
    hash: string,
  ): Promise<SynthesisCandidate> {
    const response = await this.transport({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      request: {
        model: model.modelId,
        max_tokens: Math.min(DEFAULT_GENERATION_MAX_TOKENS, model.maxOutputTokens),
        system: buildAnthropicSystem(this.materials, context),
        messages: [{ role: "user", content: userPrompt }],
        tools: [buildContractTool(this.materials)],
        tool_choice: { type: "tool", name: CONTRACT_TOOL_NAME },
      },
    });
    const contract = extractContractFromAnthropic(response);
    if (isRecord(contract)) {
      const meta = isRecord(contract.meta) ? contract.meta : {};
      contract.meta = {
        ...meta,
        provenance: {
          ...(isRecord(meta.provenance) ? meta.provenance : {}),
          kind: "llm-generation",
          promptHash: hash,
          modelVersion: response.model ?? model.modelId,
          seed: Math.max(0, Math.trunc(request.seed ?? 0)),
        },
      };
    }
    return {
      contract,
      modelId: response.model ?? model.modelId,
      promptHash: hash,
      stopReason: response.stop_reason,
      usage: response.usage,
    };
  }
}

export async function buildDefaultSynthesisAdapter(): Promise<SynthesisAdapter> {
  return new TemplateSynthesisAdapter(await loadGenerationMaterials());
}

export async function runGeneration(
  db: GatewayDb,
  request: GenerationRequest,
  options: {
    materials?: GenerationMaterials;
    adapter?: SynthesisAdapter;
    anthropicTransport?: AnthropicTransport;
    anthropicBaseUrl?: string;
    validator?: GenerationValidator;
    onEvent?: (event: string, data: unknown) => void;
  } = {},
): Promise<GenerationResponse> {
  const materials = options.materials ?? (await loadGenerationMaterials());
  const emit: (event: string, data: unknown) => void = options.onEvent ?? (() => undefined);
  emit("stage", {
    stage: "intent-parse",
    archetype: request.archetype ?? inferArchetype(request),
    categories: normalizeCategories(request.categories),
    provider: request.provider ?? "template",
  });
  const context = await buildGenerationContext(
    db,
    { ...request, includePrefixText: request.includePrefixText ?? false },
    materials,
  );
  emit("stage", {
    stage: "retrieval",
    retrievedComponents: context.retrievedComponents.length,
    retrievedPatterns: context.retrievedPatterns.length,
    blockedReasons: context.blockedReasons,
  });
  const blockedReasons = [...context.blockedReasons];
  const attempts: GenerationAttempt[] = [];
  if (blockedReasons.length > 0) {
    emit("stage", { stage: "blocked", blockedReasons });
    return {
      mode: "synthesis",
      catalogPolicy: "approved-review-rows-only",
      modelPins: ANTHROPIC_MODEL_PINS,
      context,
      verdict: "blocked",
      attempts,
      contract: null,
      report: null,
      blockedReasons,
    };
  }

  let adapter: SynthesisAdapter;
  if (options.adapter !== undefined) {
    adapter = options.adapter;
  } else if (request.provider === "anthropic") {
    const apiKey = generationApiKey(request);
    if (apiKey === null) {
      throw new Error(
        "Anthropic generation requires anthropicApiKey, x-forge-anthropic-key, or ANTHROPIC_API_KEY",
      );
    }
    adapter = new AnthropicSynthesisAdapter(materials, apiKey, {
      baseUrl: options.anthropicBaseUrl,
      transport: options.anthropicTransport,
    });
  } else {
    adapter = new TemplateSynthesisAdapter(materials);
  }
  const validator = options.validator ?? runValidator;
  emit("stage", { stage: "skeleton-slot-pass" });
  let candidate = await adapter.synthesize(context, request);
  emit("stage", {
    stage: "part-detail-pass",
    modelId: candidate.modelId,
    contractHash: contractHash(candidate.contract),
  });
  const maxRepairs = repairLimit(request.maxRepairIterations);

  for (let repairIndex = 0; repairIndex <= maxRepairs; repairIndex++) {
    emit("stage", {
      stage: "validation-repair-pass",
      attempt: repairIndex,
      phase: repairIndex === 0 ? "synthesize" : "repair",
    });
    const result = await validator(JSON.stringify(candidate.contract), false);
    if (result.exitCode === -1) {
      throw new Error(result.stderr || "validator unavailable");
    }
    const attempt = pushAttempt(
      attempts,
      candidate,
      repairIndex === 0 ? "synthesize" : "repair",
      result,
    );
    emit("stage", {
      stage: "validator-result",
      attempt: attempt.index,
      phase: attempt.phase,
      verdict: attempt.verdict,
      diagnostics: attempt.diagnostics.map((diagnostic) => diagnostic.check ?? "unknown"),
    });
    if (attempt.verdict === "admitted") {
      emit("stage", { stage: "admission", verdict: "admitted", attempt: attempt.index });
      return {
        mode: "synthesis",
        catalogPolicy: "approved-review-rows-only",
        modelPins: ANTHROPIC_MODEL_PINS,
        context,
        verdict: "admitted",
        attempts,
        contract: candidate.contract,
        report: result.report,
        blockedReasons,
      };
    }
    if (repairIndex === maxRepairs || adapter.repair === undefined) break;
    emit("stage", {
      stage: "deterministic-repair",
      attempt: attempt.index,
      diagnostics: attempt.diagnostics.map((diagnostic) => diagnostic.check ?? "unknown"),
    });
    const repaired = await adapter.repair({ context, request, candidate, attempt });
    if (repaired === null) break;
    candidate = repaired;
  }

  emit("stage", { stage: "draft-admission", reason: "repair budget exhausted" });
  const draftResult = await validator(JSON.stringify(candidate.contract), true);
  if (draftResult.exitCode === -1) {
    throw new Error(draftResult.stderr || "validator unavailable");
  }
  const draftAttempt = pushAttempt(attempts, candidate, "draft", draftResult);
  emit("stage", {
    stage: "validator-result",
    attempt: draftAttempt.index,
    phase: draftAttempt.phase,
    verdict: draftAttempt.verdict,
    diagnostics: draftAttempt.diagnostics.map((diagnostic) => diagnostic.check ?? "unknown"),
  });
  return {
    mode: "synthesis",
    catalogPolicy: "approved-review-rows-only",
    modelPins: ANTHROPIC_MODEL_PINS,
    context,
    verdict: draftAttempt.verdict === "draft" ? "draft" : "rejected",
    attempts,
    contract: candidate.contract,
    report: draftResult.report,
    blockedReasons,
  };
}
