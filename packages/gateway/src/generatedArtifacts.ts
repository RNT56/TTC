import { createHash } from "node:crypto";
import type { GatewayDb } from "./db.js";
import type { GenerationRequest, GenerationResponse } from "./generation.js";

export interface GeneratedArtifactRecord {
  artifactId: string;
  status: "admitted" | "draft" | "rejected";
  contractHash: string;
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

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function generatedMetaId(contract: unknown): string | null {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return null;
  const meta = (contract as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const id = (meta as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export async function recordGeneratedArtifact(
  db: GatewayDb,
  request: GenerationRequest,
  response: GenerationResponse,
): Promise<GeneratedArtifactRecord | null> {
  if (response.contract === null || response.verdict === "blocked") return null;
  if (!["admitted", "draft", "rejected"].includes(response.verdict)) return null;

  const contractHash =
    response.attempts.at(-1)?.contractHash ?? sha256(stableJson(response.contract));
  const promptHash = response.attempts.at(-1)?.promptHash ?? sha256(request.prompt.trim());
  const artifactId = generatedMetaId(response.contract) ?? `gen-${contractHash.slice(0, 16)}`;
  const modelId = response.attempts.at(-1)?.modelId ?? null;
  const provider = request.provider ?? "template";

  await db.query(
    `INSERT INTO generated_artifacts (
        artifact_id,
        status,
        prompt,
        provider,
        archetype,
        categories,
        seed,
        contract_hash,
        prompt_hash,
        model_id,
        contract,
        validator_report,
        attempts,
        context,
        model_pins
      ) VALUES (
        $1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10,
        $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb
      )
      ON CONFLICT (artifact_id) DO UPDATE SET
        status = EXCLUDED.status,
        prompt = EXCLUDED.prompt,
        provider = EXCLUDED.provider,
        archetype = EXCLUDED.archetype,
        categories = EXCLUDED.categories,
        seed = EXCLUDED.seed,
        contract_hash = EXCLUDED.contract_hash,
        prompt_hash = EXCLUDED.prompt_hash,
        model_id = EXCLUDED.model_id,
        contract = EXCLUDED.contract,
        validator_report = EXCLUDED.validator_report,
        attempts = EXCLUDED.attempts,
        context = EXCLUDED.context,
        model_pins = EXCLUDED.model_pins,
        created_at = now()`,
    [
      artifactId,
      response.verdict,
      request.prompt,
      provider,
      request.archetype ?? null,
      request.categories ?? [],
      request.seed ?? null,
      contractHash,
      promptHash,
      modelId,
      json(response.contract),
      json(response.report),
      json(response.attempts),
      json(response.context),
      json(response.modelPins),
    ],
  );

  return {
    artifactId,
    status: response.verdict,
    contractHash,
  };
}
