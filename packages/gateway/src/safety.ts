import { createHash } from "node:crypto";
import type { GatewayDb } from "./db.js";
import type { GenerationArchetype, GenerationProvider } from "./generation.js";

export const BRIEF_SAFETY_POLICY_VERSION = "forge-platform-exclusions-1.0.0";
export const BRIEF_SAFETY_DETECTOR_VERSION = "prohibited-brief-rules-1.0.0";

export type ProhibitedBriefCategory = "targeting" | "munition" | "weapon" | "interdiction";
export type ProhibitedBriefSurface =
  | "context"
  | "generation"
  | "stream"
  | "course-generation"
  | "model-edit";

export interface BriefSafetyAssessment {
  prohibited: boolean;
  categories: ProhibitedBriefCategory[];
  ruleIds: string[];
  promptHash: string;
  promptLengthBucket: "1-64" | "65-256" | "257-1024" | "1025-4000" | "4001+";
  policyVersion: string;
  detectorVersion: string;
}

export interface GenerationRefusalRecord {
  id: string;
  createdAt: string;
}

interface Rule {
  id: string;
  category: ProhibitedBriefCategory;
  pattern: RegExp;
}

const rules: Rule[] = [
  {
    id: "targeting-system",
    category: "targeting",
    pattern: /\b(?:target(?:ing|ed)?\s+(?:system|module|computer|camera|sensor|acquisition|tracking|lock)|fire\s*control|track\s+and\s+(?:engage|attack)|autonomous(?:ly)?\s+(?:select|identify|track|engage)\s+(?:a\s+)?target|homing\s+(?:guidance|system|drone))\b/,
  },
  {
    id: "munition-payload",
    category: "munition",
    pattern: /\b(?:munitions?|warheads?|missiles?|torpedoes?|grenades?|ammunition|explosive\s+(?:payload|charge|device)|bomb(?:ing|er|s|\s+(?:drop|release|bay)))\b/,
  },
  {
    id: "weapon-system",
    category: "weapon",
    pattern: /\b(?:weapon(?:ized|ization|s|\s+(?:system|mount))?|gun\s+mount|cannons?|firearms?|rifles?|machine\s+guns?|flamethrowers?|combat\s+(?:drone|robot|rover|quadcopter)|armed\s+(?:drone|robot|rover|quadcopter))\b/,
  },
  {
    id: "interdiction-system",
    category: "interdiction",
    pattern: /\b(?:interdiction|interdict(?:ion|or)?|anti\s*drone|counter\s*uas|disable\s+(?:another|other|an)\s+(?:drone|robot|vehicle)|ramming\s+(?:drone|robot)|intercept(?:or|ion)?\s+(?:drone|robot))\b/,
  },
];

const spacedProhibitedTerms = [
  "target",
  "weapon",
  "weaponized",
  "weaponization",
  "targeting",
  "munition",
  "munitions",
  "ammunition",
  "interdiction",
  "interdict",
  "missile",
  "torpedo",
  "warhead",
  "grenade",
  "explosive",
  "bomb",
  "firearm",
  "rifle",
  "cannon",
  "gun",
] as const;

export function assessBriefSafety(prompt: string): BriefSafetyAssessment {
  const normalized = stripExplicitExclusions(normalizePrompt(prompt));
  const matches = rules.filter((rule) => rule.pattern.test(normalized));
  return {
    prohibited: matches.length > 0,
    categories: [...new Set(matches.map((match) => match.category))].sort(),
    ruleIds: matches.map((match) => match.id).sort(),
    promptHash: createHash("sha256").update(prompt.trim()).digest("hex"),
    promptLengthBucket: lengthBucket(prompt.length),
    policyVersion: BRIEF_SAFETY_POLICY_VERSION,
    detectorVersion: BRIEF_SAFETY_DETECTOR_VERSION,
  };
}

const explicitExclusion = new RegExp(
  String.raw`\b(?:no|without|avoid(?:ing)?|exclude|excluding|do\s+not\s+include|must\s+not\s+include|must\s+exclude|never\s+include)\s+(?:any\s+)?` +
    String.raw`(?:(?:payloads?|releases?|manipulators?|weapons?|weaponized|weaponization|targeting|munitions?|ammunition|` +
    String.raw`interdiction|interdictors?|missiles?|torpedoes?|warheads?|grenades?|explosive|bombs?|` +
    String.raw`firearms?|rifles?|cannons?|guns?|modules?|mechanisms?|hardware|systems?|appendages?|` +
    String.raw`high|force|or|and)\s*){1,16}`,
  "g",
);

function stripExplicitExclusions(normalized: string): string {
  return normalized.replace(explicitExclusion, " ").replace(/\s+/g, " ").trim();
}

export function assertBriefAllowed(prompt: string): void {
  const assessment = assessBriefSafety(prompt);
  if (assessment.prohibited) throw new ProhibitedBriefError(assessment, null);
}

export async function refuseProhibitedBrief(
  db: GatewayDb,
  prompt: string,
  context: {
    surface: ProhibitedBriefSurface;
    ownerUserId: string | null;
    provider: GenerationProvider | "template" | null;
    archetype: GenerationArchetype | null;
  },
): Promise<void> {
  const assessment = assessBriefSafety(prompt);
  if (!assessment.prohibited) return;
  const result = await db.query<{ id: string; created_at: Date | string }>(
    `INSERT INTO generation_refusals (
       owner_user_id, prompt_hash, prompt_length_bucket, policy_version,
       detector_version, categories, rule_ids, surface, provider_requested, archetype
     ) VALUES ($1, $2, $3, $4, $5, $6::text[], $7::text[], $8, $9, $10)
     RETURNING id, created_at`,
    [
      context.ownerUserId,
      assessment.promptHash,
      assessment.promptLengthBucket,
      assessment.policyVersion,
      assessment.detectorVersion,
      assessment.categories,
      assessment.ruleIds,
      context.surface,
      context.provider,
      context.archetype,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("prohibited brief was refused but its audit event could not be recorded");
  throw new ProhibitedBriefError(assessment, {
    id: row.id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  });
}

export class ProhibitedBriefError extends Error {
  readonly statusCode = 422;
  readonly code = "SAFETY_PROHIBITED_BRIEF";

  constructor(
    readonly assessment: BriefSafetyAssessment,
    readonly refusal: GenerationRefusalRecord | null,
  ) {
    super("Brief refused by the ForgedTTC platform-exclusions policy.");
    this.name = "ProhibitedBriefError";
  }
}

export function prohibitedBriefResponse(error: unknown): { statusCode: number; body: unknown } | null {
  if (!(error instanceof ProhibitedBriefError)) return null;
  return {
    statusCode: error.statusCode,
    body: {
      error: error.message,
      code: error.code,
      policyVersion: error.assessment.policyVersion,
      categories: error.assessment.categories,
      refusalId: error.refusal?.id ?? null,
    },
  };
}

function normalizePrompt(prompt: string): string {
  let normalized = prompt
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const term of spacedProhibitedTerms) {
    const spaced = [...term].join("\\s+");
    normalized = normalized.replace(new RegExp(`\\b${spaced}\\b`, "g"), term);
  }
  return normalized;
}

function lengthBucket(length: number): BriefSafetyAssessment["promptLengthBucket"] {
  if (length <= 64) return "1-64";
  if (length <= 256) return "65-256";
  if (length <= 1024) return "257-1024";
  if (length <= 4000) return "1025-4000";
  return "4001+";
}
