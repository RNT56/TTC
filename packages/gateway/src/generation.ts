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

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const DEFAULT_REPAIR_ITERATIONS = 3;
const MAX_REPAIR_ITERATIONS = 3;
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

export async function buildDefaultSynthesisAdapter(): Promise<SynthesisAdapter> {
  return new TemplateSynthesisAdapter(await loadGenerationMaterials());
}

export async function runGeneration(
  db: GatewayDb,
  request: GenerationRequest,
  options: {
    materials?: GenerationMaterials;
    adapter?: SynthesisAdapter;
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

  const adapter: SynthesisAdapter = options.adapter ?? new TemplateSynthesisAdapter(materials);
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
