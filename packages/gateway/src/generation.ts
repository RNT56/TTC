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
  const promptPrefix = buildPromptPrefix(
    materials ?? (await loadGenerationMaterials()),
    retrievedComponents,
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
    buildPromptPrefix(materials, context.retrievedComponents, true).text ?? "",
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

function pickExemplar(materials: GenerationMaterials, request: GenerationRequest): PatternExemplar {
  const exemplar =
    materials.exemplars.find((exemplar) => exemplar.archetype === request.archetype) ??
    materials.exemplars[0];
  if (exemplar === undefined) {
    throw new Error("no generation exemplars available");
  }
  return exemplar;
}

export class TemplateSynthesisAdapter implements SynthesisAdapter {
  constructor(private readonly materials: GenerationMaterials) {}

  async synthesize(_context: GenerationContextResponse, request: GenerationRequest): Promise<SynthesisCandidate> {
    const exemplar = pickExemplar(this.materials, request);
    const contract = stable(exemplar.contract) as Record<string, unknown>;
    if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
      throw new Error(`generation exemplar ${exemplar.id} is not an object contract`);
    }
    const meta = (contract.meta && typeof contract.meta === "object"
      ? { ...(contract.meta as Record<string, unknown>) }
      : {}) satisfies Record<string, unknown>;
    const hash = promptHash(request.prompt);
    const seed = Math.max(0, Math.trunc(request.seed ?? 0));
    contract.meta = {
      ...meta,
      id: `gen-${hash.slice(0, 12)}`,
      name: `Generated ${exemplar.name}`,
      version: "0.1.0",
      provenance: {
        kind: "llm-generation",
        promptHash: hash,
        modelVersion: synthesisModel().modelId,
        seed,
      },
    };
    return { contract, modelId: synthesisModel().modelId, promptHash: hash };
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
  } = {},
): Promise<GenerationResponse> {
  const materials = options.materials ?? (await loadGenerationMaterials());
  const context = await buildGenerationContext(
    db,
    { ...request, includePrefixText: request.includePrefixText ?? false },
    materials,
  );
  const blockedReasons = [...context.blockedReasons];
  const attempts: GenerationAttempt[] = [];
  if (blockedReasons.length > 0) {
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
  let candidate = await adapter.synthesize(context, request);
  const maxRepairs = repairLimit(request.maxRepairIterations);

  for (let repairIndex = 0; repairIndex <= maxRepairs; repairIndex++) {
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
    if (attempt.verdict === "admitted") {
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
    const repaired = await adapter.repair({ context, request, candidate, attempt });
    if (repaired === null) break;
    candidate = repaired;
  }

  const draftResult = await validator(JSON.stringify(candidate.contract), true);
  if (draftResult.exitCode === -1) {
    throw new Error(draftResult.stderr || "validator unavailable");
  }
  const draftAttempt = pushAttempt(attempts, candidate, "draft", draftResult);
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
