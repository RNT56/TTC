import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GatewayDb } from "./db.js";
import type { ReviewExportPolicy } from "./reviewQueue.js";

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
