import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { GatewayDb } from "../src/db.js";
import {
  ANTHROPIC_MODEL_PINS,
  type AnthropicTransport,
  type GenerationMaterials,
  type GenerationValidator,
  type SynthesisAdapter,
  TemplateSynthesisAdapter,
} from "../src/generation.js";
import { buildServer } from "../src/server.js";
import { validatorBin } from "../src/validator.js";

const demoPath = join(process.cwd(), "..", "..", "examples", "vx2-mini.forge.json");
const haveBinary = existsSync(validatorBin());
const generationMaterials: GenerationMaterials = {
  schemaText: '{"title":"ModelSpec","type":"object"}',
  engineDocs: "Engine docs: use validator diagnostics and do not invent component truth.",
  exemplars: [
    {
      id: "vx2-proof",
      name: "VX-2 proof",
      archetype: "multirotor",
      source: "fixture",
      contract: { meta: { id: "vx2-proof", archetype: "multirotor" }, skeleton: [], parts: [] },
    },
  ],
};

function parseJsonParam(value: unknown): unknown {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function parseRecordParam(value: unknown): Record<string, unknown> {
  const parsed = parseJsonParam(value);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function platformMemoryDb(): GatewayDb {
  const now = "2026-06-14T00:00:00.000Z";
  const creditAccounts = new Map<string, number>();
  const creditLedgerKeys = new Set<string>();
  const models = new Map<string, Record<string, unknown>>();
  const shares = new Map<string, Record<string, unknown>>();
  const jobs = new Map<string, Record<string, unknown>>();
  const jobIdempotency = new Map<string, string>();
  const jobEvents: Record<string, unknown>[] = [];
  const objectBlobs = new Map<string, Record<string, unknown>>();
  const objectBlobCache = new Map<string, string>();
  const replayArtifacts = new Map<string, Record<string, unknown>>();
  const photoscanArtifacts: Record<string, unknown>[] = [];
  const policyArtifacts: Record<string, unknown>[] = [];
  const telemetryLogs: Record<string, unknown>[] = [];
  const listings: Record<string, unknown>[] = [];
  const courses: Record<string, unknown>[] = [];
  const leaderboardRuns: Record<string, unknown>[] = [];
  const maintenanceRecords: Record<string, unknown>[] = [];
  const classroomAssignments: Record<string, unknown>[] = [];
  const classroomSubmissions: Record<string, unknown>[] = [];
  const moderationReports: Record<string, unknown>[] = [];
  const policySignoffs: Record<string, unknown>[] = [];
  const platformGateSignoffs: Record<string, unknown>[] = [
    {
      id: "gate-d28-default",
      gate_key: "d28.hardware",
      status: "blocked",
      policy_version: "p4-p12-live-gates-2026-06-14",
      jurisdiction: "unspecified",
      reviewer: "system",
      evidence: { reason: "D28 legal/hardware signoff has not been recorded" },
      evidence_url: null,
      effective_at: null,
      revoked_at: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: "gate-policy-default",
      gate_key: "p11.policy-sharing",
      status: "blocked",
      policy_version: "p4-p12-live-gates-2026-06-14",
      jurisdiction: "unspecified",
      reviewer: "system",
      evidence: { reason: "dual-use/export-control platform signoff has not been recorded" },
      evidence_url: null,
      effective_at: null,
      revoked_at: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: "gate-economics-default",
      gate_key: "p11.marketplace-economics",
      status: "blocked",
      policy_version: "p4-p12-live-gates-2026-06-14",
      jurisdiction: "unspecified",
      reviewer: "system",
      evidence: { reason: "usage-beta economics decision is active" },
      evidence_url: null,
      effective_at: null,
      revoked_at: null,
      created_at: now,
      updated_at: now,
    },
  ];
  const vendorOffers: Record<string, unknown>[] = [];
  const printQuoteRequests: Record<string, unknown>[] = [];
  const printQuoteOffers: Record<string, unknown>[] = [];
  const licenseLedgerRows: Record<string, unknown>[] = [
    {
      id: "lic-open-proof",
      class: "open",
      terms: "open catalog proof row",
      source_url: "https://example.test/license/open",
      component_count: "2",
      priced_component_count: "2",
      cited_component_count: "2",
      approved_review_count: "2",
      pending_review_count: "0",
      blocked_export_count: "0",
      export_policies: { "full-geometry-ok": 2 },
    },
    {
      id: "lic-attribution-proof",
      class: "attribution",
      terms: "attribution required",
      source_url: "https://example.test/license/attribution",
      component_count: "1",
      priced_component_count: "1",
      cited_component_count: "1",
      approved_review_count: "0",
      pending_review_count: "1",
      blocked_export_count: "1",
      export_policies: { blocked: 1 },
    },
  ];
  let nextModel = 1;
  let nextShare = 1;
  let nextJob = 1;
  let nextBlob = 1;
  let nextPhotoscan = 1;
  let nextPolicy = 1;
  let nextReplay = 1;
  let nextListing = 1;
  let nextCourse = 1;
  let nextRun = 1;
  let nextMaintenance = 1;
  let nextAssignment = 1;
  let nextSubmission = 1;
  let nextModeration = 1;
  let nextSignoff = 1;
  let nextPlatformGate = 1;
  let nextVendorOffer = 1;
  let nextPrintQuote = 1;
  let nextPrintQuoteOffer = 1;

  return {
    async query<T = unknown>(text: string, params: unknown[] = []) {
      if (text.includes("INSERT INTO users")) {
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("INSERT INTO credit_accounts")) {
        creditAccounts.set(String(params[0]), creditAccounts.get(String(params[0])) ?? 0);
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("SELECT balance_credits FROM credit_accounts")) {
        return {
          rows: [{ balance_credits: creditAccounts.get(String(params[0])) ?? 0 } as T],
          rowCount: 1,
        };
      }
      if (text.includes("INSERT INTO credit_ledger")) {
        const idempotencyKey = String(params[4]);
        if (creditLedgerKeys.has(idempotencyKey)) {
          return { rows: [], rowCount: 0 } as { rows: T[]; rowCount: number };
        }
        creditLedgerKeys.add(idempotencyKey);
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("UPDATE credit_accounts")) {
        const userId = String(params[0]);
        creditAccounts.set(userId, (creditAccounts.get(userId) ?? 0) - Number(params[1]));
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("FROM credit_ledger")) {
        return { rows: [], rowCount: 0 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("INSERT INTO usage_events")) {
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("SELECT DISTINCT ON (gate_key)")) {
        const latest = new Map<string, Record<string, unknown>>();
        for (const row of platformGateSignoffs) latest.set(String(row.gate_key), row);
        const rows = [...latest.values()].sort((a, b) => String(a.gate_key).localeCompare(String(b.gate_key)));
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("FROM platform_gate_signoffs") && text.includes("WHERE gate_key = $1")) {
        const rows = platformGateSignoffs.filter((row) => row.gate_key === params[0]);
        return { rows: rows.slice(-1) as T[], rowCount: rows.length ? 1 : 0 };
      }
      if (text.includes("INSERT INTO platform_gate_signoffs")) {
        const row = {
          id: `gate-${nextPlatformGate++}`,
          gate_key: params[0],
          status: params[1],
          policy_version: params[2],
          jurisdiction: params[3],
          reviewer: params[4],
          evidence: parseJsonParam(params[5]),
          evidence_url: params[6],
          effective_at: params[7],
          revoked_at: params[8],
          created_at: now,
          updated_at: now,
        };
        platformGateSignoffs.push(row);
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("INSERT INTO model_registry")) {
        const id = `model-${nextModel++}`;
        const row = {
          id,
          owner_user_id: params[0],
          source_artifact_id: params[1],
          status: params[2],
          visibility: params[3],
          name: params[4],
          archetype: params[5],
          contract_hash: params[6],
          contract: parseJsonParam(params[7]),
          validator_report: parseJsonParam(params[8]),
          lineage: parseJsonParam(params[9]),
          created_at: now,
          updated_at: now,
        };
        models.set(id, row);
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("FROM model_registry") && text.includes("AND id = $2")) {
        const row = models.get(String(params[1]));
        return {
          rows: row && row.owner_user_id === params[0] ? [row as T] : [],
          rowCount: row && row.owner_user_id === params[0] ? 1 : 0,
        };
      }
      if (text.includes("FROM model_registry") && text.includes("WHERE owner_user_id = $1")) {
        const rows = [...models.values()].filter((row) => row.owner_user_id === params[0]);
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("SET visibility = 'unlisted'")) {
        const row = models.get(String(params[0]));
        if (row) row.visibility = "unlisted";
        return { rows: [], rowCount: row ? 1 : 0 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("INSERT INTO share_snapshots")) {
        const id = `share-${nextShare++}`;
        const row = {
          id,
          model_id: params[0],
          owner_user_id: params[1],
          contract_hash: params[2],
          contract: parseJsonParam(params[3]),
          validator_report: parseJsonParam(params[4]),
          created_at: now,
        };
        shares.set(id, row);
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("FROM share_snapshots")) {
        const row = shares.get(String(params[0]));
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes("INSERT INTO jobs")) {
        const idempotencyKey = params[3] ? String(params[3]) : null;
        const existingId = idempotencyKey ? jobIdempotency.get(idempotencyKey) : undefined;
        const id = existingId ?? `job-${nextJob++}`;
        const queued = text.includes("'queued'");
        const row = {
          id,
          owner_user_id: params[0],
          kind: params[1],
          status: queued ? "queued" : "succeeded",
          provider: params[2],
          input: parseJsonParam(params[4]),
          output: queued ? null : parseJsonParam(params[5]),
          error: null,
          cost_credits: queued ? params[5] : params[6],
          created_at: now,
        };
        jobs.set(id, row);
        if (idempotencyKey) jobIdempotency.set(idempotencyKey, id);
        return { rows: [row as T], rowCount: existingId ? 0 : 1 };
      }
      if (text.includes("INSERT INTO object_blobs")) {
        const cacheKey = params[1] ? String(params[1]) : null;
        const existingId = cacheKey ? objectBlobCache.get(cacheKey) : undefined;
        const id = existingId ?? `obj-${nextBlob++}`;
        const previous = existingId ? objectBlobs.get(existingId) : null;
        const fullBlobRegistration = text.includes("byte_size");
        const row = {
          id,
          owner_user_id: previous?.owner_user_id ?? params[0],
          visibility: previous?.visibility ?? "private",
          cache_key: previous?.cache_key ?? cacheKey,
          bucket: previous?.bucket ?? params[2],
          object_key: previous?.object_key ?? params[3],
          content_type: previous?.content_type ?? params[4],
          byte_size: previous?.byte_size ?? (fullBlobRegistration ? params[5] : null),
          sha256: previous?.sha256 ?? (fullBlobRegistration ? params[6] : null),
          metadata: {
            ...(previous?.metadata as Record<string, unknown> | undefined),
            ...(parseJsonParam(fullBlobRegistration ? params[7] : params[5]) as Record<string, unknown>),
          },
          created_at: now,
        };
        objectBlobs.set(id, row);
        if (cacheKey) objectBlobCache.set(cacheKey, id);
        return { rows: [row as T], rowCount: existingId ? 0 : 1 };
      }
      if (text.includes("FROM object_blobs")) {
        const row = objectBlobs.get(String(params[0]));
        return {
          rows: row && row.owner_user_id === params[1] ? [row as T] : [],
          rowCount: row && row.owner_user_id === params[1] ? 1 : 0,
        };
      }
      if (text.includes("FROM job_events")) {
        const rows = jobEvents.filter((row) => row.job_id === params[1]);
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO job_events")) {
        const row = {
          id: jobEvents.length + 1,
          job_id: params[0],
          event: params[1],
          payload: parseJsonParam(params[2]),
          created_at: now,
        };
        jobEvents.push(row);
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("FROM jobs") && text.includes("AND id = $2")) {
        const row = jobs.get(String(params[1]));
        return {
          rows: row && row.owner_user_id === params[0] ? [row as T] : [],
          rowCount: row && row.owner_user_id === params[0] ? 1 : 0,
        };
      }
      if (text.includes("FROM jobs")) {
        const rows = [...jobs.values()].filter((row) => row.owner_user_id === params[0]);
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO replay_artifacts")) {
        const id = `replay-${nextReplay++}`;
        const row = {
          id,
          owner_user_id: params[0],
          model_id: params[1],
          tape: parseJsonParam(params[2]),
          verification: parseJsonParam(params[3]),
          tamper_hash: params[4],
          created_at: now,
        };
        replayArtifacts.set(id, row);
        return { rows: [{ id } as T], rowCount: 1 };
      }
      if (text.includes("FROM replay_artifacts")) {
        const rows = [...replayArtifacts.values()].filter((row) => row.owner_user_id === params[0]);
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO photoscan_artifacts")) {
        const row = {
          id: `scan-${nextPhotoscan++}`,
          owner_user_id: params[0],
          job_id: params[1],
          source_blob_ids: params[2],
          scale_axes_ports: parseJsonParam(params[3]),
          refit_primitives: parseJsonParam(params[4]),
          candidate_component: parseJsonParam(params[5]),
          validator_report: parseJsonParam(params[6]),
          artifact_blob_id: params[7],
          created_at: now,
        };
        photoscanArtifacts.push(row);
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("UPDATE photoscan_artifacts")) {
        const row = photoscanArtifacts.find((artifact) => artifact.id === params[0] && artifact.owner_user_id === params[1]);
        if (!row) return { rows: [], rowCount: 0 } as { rows: T[]; rowCount: number };
        row.scale_axes_ports = {
          ...parseRecordParam(row.scale_axes_ports),
          ...parseRecordParam(params[2]),
        };
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("FROM photoscan_artifacts")) {
        const rows = photoscanArtifacts.filter((row) => row.owner_user_id === params[0]);
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO policy_artifacts")) {
        const row = {
          id: `pol-${nextPolicy++}`,
          owner_user_id: params[0],
          model_id: params[1],
          task_kind: params[2],
          scorecard: parseJsonParam(params[3]),
          artifact_blob_id: params[4],
          export_gate: params[5],
          created_at: now,
        };
        policyArtifacts.push(row);
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("FROM policy_artifacts")) {
        const rows = policyArtifacts.filter((row) => row.owner_user_id === params[0]);
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO telemetry_logs")) {
        const row = {
          id: `telemetry-${telemetryLogs.length + 1}`,
          owner_user_id: params[0],
          model_id: params[1],
          source: "fixture",
          captured_at: now,
          tape: parseJsonParam(params[2]),
          privacy: parseJsonParam(params[3]),
          created_at: now,
        };
        telemetryLogs.push(row);
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("FROM telemetry_logs")) {
        const rows = telemetryLogs.filter((row) => row.owner_user_id === params[0]);
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO courses")) {
        const row = {
          id: `course-${nextCourse++}`,
          owner_user_id: params[0],
          name: params[1],
          env_spec: parseJsonParam(params[2]),
          validator_report: parseJsonParam(params[3]),
          visibility: params[4],
          created_at: now,
        };
        courses.push(row);
        return { rows: [{ id: row.id } as T], rowCount: 1 };
      }
      if (text.includes("FROM courses") && text.includes("WHERE id = $1")) {
        const rows = courses.filter(
          (row) =>
            row.id === params[0] &&
            (row.visibility === "public" || row.visibility === "unlisted" || row.owner_user_id === params[1]),
        );
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("FROM courses")) {
        const rows = courses.filter((row) => row.visibility === "public" || row.visibility === "unlisted");
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO leaderboard_runs")) {
        const row = {
          id: `run-${nextRun++}`,
          course_id: params[0],
          policy_id: params[1],
          replay_id: params[2],
          user_id: params[3],
          archetype: params[4],
          class_key: params[5],
          score: params[6],
          verified: params[7],
          verification: parseJsonParam(params[8]),
          created_at: now,
        };
        leaderboardRuns.push(row);
        return { rows: [{ id: row.id } as T], rowCount: 1 };
      }
      if (text.includes("FROM leaderboard_runs")) {
        const rows = leaderboardRuns.filter(
          (row) =>
            row.course_id === params[0] &&
            (params[1] === null || row.archetype === params[1]) &&
            (params[2] === null || row.class_key === params[2]),
        );
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO marketplace_listings")) {
        const row = {
          id: `listing-${nextListing++}`,
          owner_user_id: params[0],
          model_id: params[1],
          listing_kind: params[2],
          status: "review",
          title: params[3],
          license_class: "open",
          export_policy: "assembly-policy-derived",
          price_credits: params[4],
          validator_report: parseJsonParam(params[5]),
          moderation: parseJsonParam(params[6]),
          created_at: now,
        };
        listings.push(row);
        return { rows: [{ id: row.id } as T], rowCount: 1 };
      }
      if (text.includes("INSERT INTO policy_signoffs")) {
        const row = {
          id: `signoff-${nextSignoff++}`,
          owner_user_id: params[0],
          target_kind: "marketplace-listing",
          target_id: params[1],
          jurisdiction: params[2],
          policy_version: "p11-local-2026-06-14",
          status: "accepted",
          answers: parseJsonParam(params[3]),
          created_at: now,
        };
        policySignoffs.push(row);
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("UPDATE marketplace_listings")) {
        const row = listings.find((candidate) => candidate.id === params[0]);
        if (!row) return { rows: [], rowCount: 0 } as { rows: T[]; rowCount: number };
        row.status = text.includes("status = 'delisted'") ? "delisted" : params[1];
        row.moderation = { ...parseRecordParam(row.moderation), ...parseRecordParam(params[text.includes("status = 'delisted'") ? 1 : 2]) };
        row.updated_at = now;
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("FROM marketplace_listings")) {
        const rows = listings.filter((row) => row.status === params[0] && (params[1] === null || row.listing_kind === params[1]));
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO moderation_reports")) {
        const repeat = moderationReports.some(
          (row) => row.target_kind === params[1] && row.target_id === params[2] && row.status !== "rejected",
        );
        const row = {
          id: `moderation-${nextModeration++}`,
          reporter_user_id: params[0],
          target_kind: params[1],
          target_id: params[2],
          reason: params[3],
          detail: params[4],
          status: "open",
          sla_due_at: now,
          repeat_infringer_signal: repeat,
          created_at: now,
          updated_at: now,
        };
        moderationReports.push(row);
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("UPDATE moderation_reports")) {
        const row = moderationReports.find((candidate) => candidate.id === params[0]);
        if (!row) return { rows: [], rowCount: 0 } as { rows: T[]; rowCount: number };
        row.status = params[1];
        if (params[2]) row.detail = row.detail ? `${row.detail}\n\n${params[2]}` : params[2];
        row.updated_at = now;
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("FROM moderation_reports")) {
        const rows = moderationReports.filter(
          (row) => row.reporter_user_id === params[0] && (params[1] === null || row.status === params[1]),
        );
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("FROM licenses l")) {
        const rows = licenseLedgerRows.filter((row) => params[0] === null || row.class === params[0]);
        return { rows: rows.slice(0, Number(params[1] ?? rows.length)) as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO vendor_offers")) {
        const row = {
          id: `offer-${nextVendorOffer++}`,
          component_id: params[0],
          vendor: params[1],
          sku: params[2],
          url: params[3],
          price: params[4],
          currency: params[5],
          availability: params[6],
          source: params[7],
          provenance: parseJsonParam(params[8]),
          fetched_at: now,
          created_at: now,
        };
        vendorOffers.push(row);
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("FROM vendor_offers")) {
        const rows = vendorOffers.filter((row) => params[0] === null || row.component_id === params[0]);
        return { rows: rows.slice(0, Number(params[1] ?? rows.length)) as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO print_quote_requests")) {
        const row = {
          id: `print-quote-${nextPrintQuote++}`,
          owner_user_id: params[0],
          model_id: params[1],
          job_id: params[2],
          artifact_blob_id: params[3],
          process: params[4],
          material: params[5],
          profile: parseJsonParam(params[6]),
          quantity: params[7],
          dfm_artifact: parseJsonParam(params[8]),
          status: "quoted",
          created_at: now,
          updated_at: now,
        };
        printQuoteRequests.push(row);
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("INSERT INTO print_quote_offers")) {
        const row = {
          id: `print-offer-${nextPrintQuoteOffer++}`,
          request_id: params[0],
          provider: params[1],
          provider_quote_id: params[2],
          quote_url: params[3],
          price: params[4],
          currency: params[5],
          lead_time_days: params[6],
          expires_at: params[7],
          terms: parseJsonParam(params[8]),
          created_at: now,
        };
        printQuoteOffers.push(row);
        return { rows: [row as T], rowCount: 1 };
      }
      if (text.includes("FROM print_quote_requests")) {
        const rows = printQuoteRequests.filter((row) => row.owner_user_id === params[0]);
        return { rows: rows.slice(0, Number(params[1] ?? rows.length)) as T[], rowCount: rows.length };
      }
      if (text.includes("FROM print_quote_offers")) {
        const ids = Array.isArray(params[0]) ? params[0].map(String) : [];
        const rows = printQuoteOffers.filter((row) => ids.includes(String(row.request_id)));
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO marketplace_usage_rollups")) {
        return { rows: [], rowCount: 1 } as { rows: T[]; rowCount: number };
      }
      if (text.includes("INSERT INTO classroom_assignments")) {
        const row = {
          id: `assignment-${nextAssignment++}`,
          owner_user_id: params[0],
          course_id: params[1],
          title: params[2],
          brief: params[3],
          rubric: parseJsonParam(params[4]),
          visibility: params[5],
          due_at: params[6],
          created_at: now,
        };
        classroomAssignments.push(row);
        return { rows: [{ id: row.id } as T], rowCount: 1 };
      }
      if (text.includes("FROM classroom_assignments") && text.includes("LIMIT 1")) {
        const row = classroomAssignments.find(
          (assignment) =>
            assignment.id === params[0] &&
            (assignment.owner_user_id === params[1] || assignment.visibility === "public" || assignment.visibility === "unlisted"),
        );
        return { rows: row ? [row as T] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes("FROM classroom_assignments")) {
        const rows = classroomAssignments.filter(
          (row) => row.visibility === "public" || row.visibility === "unlisted" || row.owner_user_id === params[0],
        );
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO classroom_submissions")) {
        const row = {
          id: `submission-${nextSubmission++}`,
          assignment_id: params[0],
          student_user_id: params[1],
          model_id: params[2],
          policy_id: params[3],
          replay_id: params[4],
          contract: parseJsonParam(params[5]),
          validator_report: parseJsonParam(params[6]),
          scorecard: parseJsonParam(params[7]),
          grade: parseJsonParam(params[8]),
          status: "graded",
          created_at: now,
        };
        classroomSubmissions.push(row);
        return { rows: [{ id: row.id } as T], rowCount: 1 };
      }
      if (text.includes("FROM classroom_submissions")) {
        const rows = classroomSubmissions.filter((row) => {
          const assignment = classroomAssignments.find((candidate) => candidate.id === row.assignment_id);
          return row.assignment_id === params[0] && (row.student_user_id === params[1] || assignment?.owner_user_id === params[1]);
        });
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("INSERT INTO maintenance_records")) {
        const row = {
          id: `maintenance-${nextMaintenance++}`,
          owner_user_id: params[0],
          model_id: params[1],
          record_kind: params[2],
          severity: params[3],
          summary: params[4],
          payload: parseJsonParam(params[5]),
          created_at: now,
        };
        maintenanceRecords.push(row);
        return { rows: [{ id: row.id } as T], rowCount: 1 };
      }
      if (text.includes("FROM maintenance_records")) {
        const rows = maintenanceRecords.filter(
          (row) => row.owner_user_id === params[0] && (params[1] === null || row.model_id === params[1]),
        );
        return { rows: rows as T[], rowCount: rows.length };
      }
      if (text.includes("FROM eval_runs")) {
        return { rows: [], rowCount: 0 } as { rows: T[]; rowCount: number };
      }
      throw new Error(`unhandled platform test query: ${text}`);
    },
  };
}

const authHeaders = {
  "x-forge-user-id": "user-platform",
  "x-forge-user-name": "Platform User",
  "x-forge-user-email": "platform@example.test",
};

test("healthz reports the validator binary", async () => {
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { ok: boolean; validatorPresent: boolean };
  assert.equal(body.ok, true);
  await app.close();
});

test("validate rejects a malformed body at the schema boundary", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: "/v1/validate",
    payload: { nope: 1 },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test(
  "validate admits the demo contract through the spawned gatekeeper",
  { skip: !haveBinary && "forge-validate binary not built (run: cargo build -p forge-validate)" },
  async () => {
    const app = buildServer();
    const contract = JSON.parse(readFileSync(demoPath, "utf8")) as unknown;
    const res = await app.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract },
    });
    assert.equal(res.statusCode, 200, res.body);
    const report = res.json() as { verdict: string; counts: { parts: number } };
    assert.equal(report.verdict, "admitted");
    assert.equal(report.counts.parts, 16);
    await app.close();
  },
);

test(
  "validate returns 422 with diagnostics for an invalid document",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract: { nope: true } },
    });
    assert.equal(res.statusCode, 422);
    const report = res.json() as { verdict: string; results: { check: string }[] };
    assert.equal(report.verdict, "rejected");
    assert.ok(report.results.some((d) => d.check === "CTR-001"));
    await app.close();
  },
);

test(
  "bake returns buffers and counts",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const contract = JSON.parse(readFileSync(demoPath, "utf8")) as unknown;
    const res = await app.inject({ method: "POST", url: "/v1/bake", payload: { contract } });
    assert.equal(res.statusCode, 200, res.body);
    const artifact = res.json() as { counts: { parts: number; faces: number } };
    assert.equal(artifact.counts.parts, 16);
    assert.ok(artifact.counts.faces > 0);
    await app.close();
  },
);

test(
  "bom returns catalog-backed purchasable rows",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const contract = JSON.parse(
      readFileSync(join(process.cwd(), "..", "..", "examples", "vx2-proof.forge.json"), "utf8"),
    ) as unknown;
    const res = await app.inject({ method: "POST", url: "/v1/bom", payload: { contract } });
    assert.equal(res.statusCode, 200, res.body);
    const rows = res.json() as { componentId?: string; sku?: string }[];
    assert.ok(rows.some((row) => row.componentId === "cmp_motor_emax-eco2-2207-1900kv"));
    assert.ok(rows.some((row) => row.sku === "1501304BK-2PACK"));
    await app.close();
  },
);

test(
  "schema endpoint serves the emitted JSON Schema",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/v1/schema" });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes("ModelSpec") || res.body.includes("skeleton"));
    await app.close();
  },
);

test("generate context retrieves only approved catalog rows", async () => {
  const db: GatewayDb = {
    async query(text, params) {
      assert.match(text, /rq\.status = 'approved'/);
      assert.match(text, /COALESCE\(rq\.export_policy, 'blocked'\) <> 'blocked'/);
      assert.deepEqual(params, [["motor", "prop"], "5 inch quad motor", 2]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "0.7",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const app = buildServer({ db, generationMaterials });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate/context",
    payload: {
      prompt: "5 inch quad motor",
      archetype: "multirotor",
      categories: ["prop", "motor", "motor"],
      limit: 2,
      includePrefixText: false,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as {
    mode: string;
    catalogPolicy: string;
    brief: { categories: string[] };
    retrievedComponents: { id: string; exportPolicy: string; priceCount: number }[];
    promptPrefix: { text: string | null; hash: string; schemaHash: string };
    blockedReasons: string[];
  };
  assert.equal(body.mode, "context-only");
  assert.equal(body.catalogPolicy, "approved-review-rows-only");
  assert.deepEqual(body.brief.categories, ["motor", "prop"]);
  assert.equal(body.retrievedComponents[0].id, "cmp_motor_emax-eco2-2207-1900kv");
  assert.equal(body.retrievedComponents[0].exportPolicy, "full-geometry-ok");
  assert.equal(body.retrievedComponents[0].priceCount, 1);
  assert.equal(body.promptPrefix.text, null);
  assert.match(body.promptPrefix.hash, /^[a-f0-9]{64}$/);
  assert.match(body.promptPrefix.schemaHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(body.blockedReasons, []);
  await app.close();
});

test("generate context blocks synthesis when no approved catalog rows match", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "make a rover", 8]);
      return { rows: [], rowCount: 0 } as never;
    },
  };
  const app = buildServer({ db, generationMaterials });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate/context",
    payload: { prompt: "make a rover", includePrefixText: false },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { retrievedComponents: unknown[]; blockedReasons: string[] };
  assert.equal(body.retrievedComponents.length, 0);
  assert.ok(body.blockedReasons.some((reason) => reason.includes("no approved catalog")));
  await app.close();
});

test("generate context rejects malformed bodies at the schema boundary", async () => {
  const app = buildServer({ generationMaterials });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate/context",
    payload: { prompt: "" },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("generate blocks before synthesis when approved catalog context is empty", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "make a quad", 8]);
      return { rows: [], rowCount: 0 } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      throw new Error("synthesis should not run without approved catalog context");
    },
  };
  const app = buildServer({
    db,
    generationMaterials,
    generationAdapter: adapter,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: { prompt: "make a quad" },
  });
  assert.equal(res.statusCode, 409, res.body);
  const body = res.json() as {
    verdict: string;
    contract: unknown;
    attempts: unknown[];
    blockedReasons: string[];
  };
  assert.equal(body.verdict, "blocked");
  assert.equal(body.contract, null);
  assert.deepEqual(body.attempts, []);
  assert.ok(body.blockedReasons.some((reason) => reason.includes("no approved catalog")));
  await app.close();
});

test("generate repairs validator diagnostics and admits the repaired contract", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [["motor"], "5 inch quad motor", 1]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      return { contract: { bad: true }, modelId: "claude-fable-5", promptHash: "p1" };
    },
    async repair(input) {
      assert.equal(input.attempt.phase, "synthesize");
      assert.equal(input.attempt.diagnostics[0]?.check, "CTR-001");
      return { contract: { ok: true }, modelId: "claude-opus-4-8", promptHash: "p1" };
    },
  };
  const validator: GenerationValidator = async (contractJson) => {
    const contract = JSON.parse(contractJson) as { ok?: boolean };
    if (contract.ok) {
      return { exitCode: 0, report: { verdict: "admitted", results: [] }, stderr: "" };
    }
    return {
      exitCode: 1,
      report: {
        verdict: "rejected",
        results: [{ check: "CTR-001", severity: "error", message: "missing ModelSpec fields" }],
      },
      stderr: "",
    };
  };
  const app = buildServer({
    db,
    generationMaterials,
    generationAdapter: adapter,
    generationValidator: validator,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: {
      prompt: "5 inch quad motor",
      categories: ["motor"],
      limit: 1,
      maxRepairIterations: 1,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as {
    verdict: string;
    contract: { ok?: boolean };
    attempts: { phase: string; modelId: string; verdict: string; diagnostics: { check?: string }[] }[];
  };
  assert.equal(body.verdict, "admitted");
  assert.deepEqual(body.contract, { ok: true });
  assert.deepEqual(
    body.attempts.map((attempt) => attempt.phase),
    ["synthesize", "repair"],
  );
  assert.equal(body.attempts[0].modelId, "claude-fable-5");
  assert.equal(body.attempts[0].diagnostics[0]?.check, "CTR-001");
  assert.equal(body.attempts[1].modelId, "claude-opus-4-8");
  assert.equal(body.attempts[1].verdict, "admitted");
  await app.close();
});

test("template repair splits an oversized primitive into printable modules", async () => {
  const adapter = new TemplateSynthesisAdapter(generationMaterials);
  const repaired = await adapter.repair({
    context: {
      mode: "context-only",
      catalogPolicy: "approved-review-rows-only",
      brief: { prompt: "repair this rover", archetype: "rover", categories: [] },
      retrievedComponents: [],
      retrievedPatterns: [],
      promptPrefix: {
        version: "p4-context-v1",
        hash: "prefix",
        schemaHash: "schema",
        docsHash: "docs",
        exemplarHashes: [],
        text: null,
      },
      blockedReasons: [],
    },
    request: { prompt: "repair this rover", archetype: "rover", seed: 7 },
    candidate: {
      modelId: "template",
      promptHash: "prompt",
      contract: {
        meta: { archetype: "rover" },
        parts: [
          {
            node: "root",
            geom: { kind: "box", w: 0.4, h: 0.08, d: 0.12 },
            pose: { p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1] },
            comp: "chassis",
            mass: { valueG: 100 },
            collision: "primitive",
          },
        ],
      },
    },
    attempt: {
      index: 0,
      phase: "synthesize",
      modelId: "template",
      promptHash: "prompt",
      contractHash: "contract",
      verdict: "rejected",
      diagnostics: [{ check: "MFG-004", severity: "error", message: "bed_fit: part 0 is oversized" }],
    },
  });

  assert.ok(repaired);
  const parts = (repaired.contract as { parts: Record<string, unknown>[] }).parts;
  assert.equal(parts.length, 2);
  assert.deepEqual(
    parts.map((part) => (part.geom as { w: number }).w),
    [0.2, 0.2],
  );
  assert.deepEqual(
    parts.map((part) => (part.mass as { valueG: number }).valueG),
    [50, 50],
  );
  assert.deepEqual(
    parts.map((part) => (part.pose as { p: number[] }).p),
    [
      [-0.1, 0, 0],
      [0.1, 0, 0],
    ],
  );
  assert.deepEqual(
    parts.map((part) => part.comp),
    ["chassis-module-1", "chassis-module-2"],
  );
  assert.deepEqual(
    parts.map((part) => (part.explode as { t0: number; t1: number }).t0),
    [0, 0.5],
  );
});

test("generate persists exhausted repairs as a diagnostic draft", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "rough draft rover", 8]);
      return {
        rows: [
          {
            id: "cmp_rover_waveshare-ugv-rover-pt-pi5-ros2",
            brand: "Waveshare",
            model: "UGV Rover PT PI5 ROS2",
            rev: "1.0.0",
            category: "rover",
            dims: { lengthMm: 265 },
            mass_g: "1800",
            elec: {},
            mech: {},
            confidence: "0.8",
            license_class: "attribution",
            export_policy: "attribution-manifest-required",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "6",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      return { contract: { stillBad: true }, modelId: "claude-fable-5", promptHash: "p2" };
    },
  };
  const validator: GenerationValidator = async (_contractJson, asDraft = false) => ({
    exitCode: asDraft ? 0 : 1,
    report: {
      verdict: asDraft ? "draft" : "rejected",
      results: [{ check: "CTR-004", severity: "error", message: "slot unresolved" }],
    },
    stderr: "",
  });
  const app = buildServer({
    db,
    generationMaterials,
    generationAdapter: adapter,
    generationValidator: validator,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: { prompt: "rough draft rover", maxRepairIterations: 0 },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { verdict: string; attempts: { phase: string; verdict: string }[] };
  assert.equal(body.verdict, "draft");
  assert.deepEqual(
    body.attempts.map((attempt) => `${attempt.phase}:${attempt.verdict}`),
    ["synthesize:rejected", "draft:draft"],
  );
  await app.close();
});

test("generate records admitted artifacts in the audit table", async () => {
  let insertSeen = false;
  const db: GatewayDb = {
    async query(text, params) {
      if (text.includes("INSERT INTO generated_artifacts")) {
        insertSeen = true;
        assert.equal(params?.[0], "gen-audit");
        assert.equal(params?.[1], "admitted");
        assert.equal(params?.[2], "audit this quad");
        assert.equal(params?.[3], "template");
        assert.deepEqual(params?.[5], ["motor"]);
        assert.equal(params?.[6], 11);
        assert.match(String(params?.[7]), /^[a-f0-9]{64}$/);
        assert.match(String(params?.[8]), /^[a-f0-9]{64}$/);
        assert.equal(params?.[9], "claude-fable-5");
        assert.match(String(params?.[10]), /gen-audit/);
        assert.match(String(params?.[12]), /claude-fable-5/);
        return { rows: [], rowCount: 1 } as never;
      }
      assert.deepEqual(params, [["motor"], "audit this quad", 1]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      return {
        contract: { meta: { id: "gen-audit" }, ok: true },
        modelId: "claude-fable-5",
        promptHash: "f".repeat(64),
      };
    },
  };
  const validator: GenerationValidator = async () => ({
    exitCode: 0,
    report: { verdict: "admitted", results: [] },
    stderr: "",
  });
  const app = buildServer({ db, generationMaterials, generationAdapter: adapter, generationValidator: validator });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: {
      prompt: "audit this quad",
      categories: ["motor"],
      limit: 1,
      seed: 11,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(insertSeen, true);
  const body = res.json() as { generatedArtifact?: { artifactId: string; status: string } };
  assert.equal(body.generatedArtifact?.artifactId, "gen-audit");
  assert.equal(body.generatedArtifact?.status, "admitted");
  await app.close();
});

test("generate stream returns SSE-compatible progress events", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "stream a quad", 8]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      return { contract: { meta: { id: "stream" }, ok: true }, modelId: "claude-fable-5", promptHash: "s" };
    },
  };
  const validator: GenerationValidator = async () => ({
    exitCode: 0,
    report: { verdict: "admitted", results: [] },
    stderr: "",
  });
  const app = buildServer({
    db,
    generationMaterials,
    generationAdapter: adapter,
    generationValidator: validator,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate/stream",
    payload: { prompt: "stream a quad" },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(res.headers["content-type"] as string, /text\/event-stream/);
  assert.match(res.body, /event: start/);
  assert.match(res.body, /event: complete/);
  assert.match(res.body, /"verdict":"admitted"/);
  await app.close();
});

test("generate model pins expose the implementation-time Anthropic contract", async () => {
  const app = buildServer({ generationMaterials });
  const res = await app.inject({ method: "GET", url: "/v1/generate/models" });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { models: typeof ANTHROPIC_MODEL_PINS };
  assert.equal(body.models.find((pin) => pin.role === "synthesis")?.modelId, "claude-fable-5");
  assert.equal(body.models.find((pin) => pin.role === "repair")?.modelId, "claude-opus-4-8");
  assert.equal(body.models.find((pin) => pin.role === "edit")?.modelId, "claude-sonnet-4-6");
  assert.equal(body.models.find((pin) => pin.role === "etl")?.modelId, "claude-haiku-4-5-20251001");
  assert.equal(body.models.find((pin) => pin.role === "synthesis")?.inputUsdPerMTok, 10);
  assert.equal(body.models.find((pin) => pin.role === "synthesis")?.outputUsdPerMTok, 50);
  assert.deepEqual(body.models, ANTHROPIC_MODEL_PINS);
  await app.close();
});

test("generate can use the Anthropic tool-pass adapter with a per-request key", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [["motor"], "5 inch quad motor", 1]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const calls: Parameters<AnthropicTransport>[0][] = [];
  const transport: AnthropicTransport = async (input) => {
    calls.push(input);
    assert.equal(input.apiKey, "sk-byo-test");
    assert.equal(input.baseUrl, "https://anthropic.test");
    assert.equal(input.request.tool_choice.name, "forge_emit_modelspec");
    assert.equal(input.request.tools[0]?.name, "forge_emit_modelspec");
    assert.equal(input.request.tools[0]?.strict, true);
    if (input.request.model === "claude-fable-5") {
      return {
        model: "claude-fable-5",
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            name: "forge_emit_modelspec",
            input: { bad: true, meta: { id: "first-pass" } },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 20 },
      };
    }
    assert.equal(input.request.model, "claude-opus-4-8");
    assert.match(input.request.messages[0]?.content ?? "", /CTR-001/);
    return {
      model: "claude-opus-4-8",
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          name: "forge_emit_modelspec",
          input: { ok: true, meta: { id: "repaired-pass" } },
        },
      ],
      usage: { input_tokens: 120, output_tokens: 30 },
    };
  };
  const validator: GenerationValidator = async (contractJson) => {
    const contract = JSON.parse(contractJson) as { ok?: boolean };
    if (contract.ok) {
      return { exitCode: 0, report: { verdict: "admitted", results: [] }, stderr: "" };
    }
    return {
      exitCode: 1,
      report: {
        verdict: "rejected",
        results: [{ check: "CTR-001", severity: "error", message: "missing fields" }],
      },
      stderr: "",
    };
  };
  const app = buildServer({
    db,
    generationMaterials,
    anthropicTransport: transport,
    anthropicBaseUrl: "https://anthropic.test",
    generationValidator: validator,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    headers: { "x-forge-anthropic-key": "sk-byo-test" },
    payload: {
      provider: "anthropic",
      prompt: "5 inch quad motor",
      categories: ["motor"],
      limit: 1,
      maxRepairIterations: 1,
      seed: 7,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(calls.length, 2);
  const body = res.json() as {
    verdict: string;
    contract: { ok?: boolean; meta?: { provenance?: { modelVersion?: string; seed?: number } } };
    attempts: { phase: string; modelId: string; stopReason?: string; usage?: unknown }[];
  };
  assert.equal(body.verdict, "admitted");
  assert.equal(body.contract.ok, true);
  assert.equal(body.contract.meta?.provenance?.modelVersion, "claude-opus-4-8");
  assert.equal(body.contract.meta?.provenance?.seed, 7);
  assert.deepEqual(
    body.attempts.map((attempt) => `${attempt.phase}:${attempt.modelId}:${attempt.stopReason}`),
    ["synthesize:claude-fable-5:tool_use", "repair:claude-opus-4-8:tool_use"],
  );
  assert.ok(!res.body.includes("sk-byo-test"));
  await app.close();
});

test("generate Anthropic provider fails closed without a key", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "make a quad", 8]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const app = buildServer({ db, generationMaterials });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: { provider: "anthropic", prompt: "make a quad" },
  });
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /Anthropic generation requires/);
  await app.close();
});

test(
  "platform routes cover dev auth, owned models, public shares, jobs, courses, listings, and maintenance",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const previousDevAuth = process.env.FORGE_DEV_AUTH;
    process.env.FORGE_DEV_AUTH = "1";
    const app = buildServer({ db: platformMemoryDb() });
    try {
      const unauthenticated = await app.inject({ method: "GET", url: "/v1/models" });
      assert.equal(unauthenticated.statusCode, 401);

      const me = await app.inject({ method: "GET", url: "/v1/me", headers: authHeaders });
      assert.equal(me.statusCode, 200, me.body);
      assert.equal((me.json() as { authenticated: boolean; user: { id: string } }).user.id, "user-platform");

      const contract = JSON.parse(readFileSync(demoPath, "utf8")) as unknown;
      const created = await app.inject({
        method: "POST",
        url: "/v1/models",
        headers: authHeaders,
        payload: { contract, asDraft: false },
      });
      assert.equal(created.statusCode, 201, created.body);
      const createdBody = created.json() as {
        model: { id: string; status: string; name: string };
        report: { verdict: string };
      };
      assert.equal(createdBody.model.status, "admitted");
      assert.equal(createdBody.report.verdict, "admitted");

    const listedModels = await app.inject({ method: "GET", url: "/v1/models", headers: authHeaders });
    assert.equal(listedModels.statusCode, 200, listedModels.body);
    assert.equal((listedModels.json() as { models: unknown[] }).models.length, 1);

    const fetchedModel = await app.inject({
      method: "GET",
      url: `/v1/models/${createdBody.model.id}`,
      headers: authHeaders,
    });
    assert.equal(fetchedModel.statusCode, 200, fetchedModel.body);

    const shared = await app.inject({
      method: "POST",
      url: `/v1/models/${createdBody.model.id}/share`,
      headers: authHeaders,
    });
    assert.equal(shared.statusCode, 201, shared.body);
    const shareId = (shared.json() as { share: { id: string } }).share.id;
    const publicShare = await app.inject({ method: "GET", url: `/v1/share/${shareId}` });
    assert.equal(publicShare.statusCode, 200, publicShare.body);
    assert.equal((publicShare.json() as { share: { modelId: string } }).share.modelId, createdBody.model.id);

    const draftContract = JSON.parse(
      readFileSync(join(process.cwd(), "..", "..", "examples", "hrx7.forge.json"), "utf8"),
    ) as unknown;
    const draftCreated = await app.inject({
      method: "POST",
      url: "/v1/models",
      headers: authHeaders,
      payload: { contract: draftContract, asDraft: true },
    });
    assert.equal(draftCreated.statusCode, 201, draftCreated.body);
    const draftBody = draftCreated.json() as { model: { id: string; status: string }; report: { verdict: string } };
    assert.equal(draftBody.model.status, "draft");
    assert.equal(draftBody.report.verdict, "draft");

    const draftShare = await app.inject({
      method: "POST",
      url: `/v1/models/${draftBody.model.id}/share`,
      headers: authHeaders,
    });
    assert.equal(draftShare.statusCode, 409, draftShare.body);
    assert.match(draftShare.body, /only admitted models can be shared/);

      const credits = await app.inject({ method: "GET", url: "/v1/credits", headers: authHeaders });
      assert.equal(credits.statusCode, 200, credits.body);
      assert.equal((credits.json() as { balanceCredits: number }).balanceCredits, 0);

      const gates = await app.inject({ method: "GET", url: "/v1/platform/gates", headers: authHeaders });
      assert.equal(gates.statusCode, 200, gates.body);
      const gateBody = gates.json() as { gates: { gateKey: string; status: string }[] };
      assert.equal(gateBody.gates.length, 3);
      assert.equal(gateBody.gates.find((gate) => gate.gateKey === "d28.hardware")?.status, "blocked");

      const capabilities = await app.inject({ method: "GET", url: "/v1/jobs/capabilities", headers: authHeaders });
      assert.equal(capabilities.statusCode, 200, capabilities.body);
      const capabilityBody = capabilities.json() as {
        providers: { fixture: { enabled: boolean }; local: { enabled: boolean }; modal: { enabled: boolean } };
        live: { printQuotes: { enabled: boolean } };
        hardware: { noAutoArm: boolean };
      };
      assert.equal(capabilityBody.providers.fixture.enabled, true);
      assert.equal(capabilityBody.providers.local.enabled, true);
      assert.equal(capabilityBody.hardware.noAutoArm, true);

      const licenseLedger = await app.inject({ method: "GET", url: "/v1/license-ledger" });
      assert.equal(licenseLedger.statusCode, 200, licenseLedger.body);
      const licenseLedgerBody = licenseLedger.json() as {
        ledger: { id: string; componentCount: number; exportPolicies: Record<string, number> }[];
      };
      assert.equal(licenseLedgerBody.ledger.length, 2);
      assert.equal(licenseLedgerBody.ledger[0].id, "lic-open-proof");
      assert.equal(licenseLedgerBody.ledger[0].componentCount, 2);
      assert.equal(licenseLedgerBody.ledger[0].exportPolicies["full-geometry-ok"], 2);

    const sourceBlob = await app.inject({
      method: "POST",
      url: "/v1/blobs",
      headers: authHeaders,
      payload: {
        purpose: "photoscan-source",
        contentType: "image/jpeg",
        byteSize: 12345,
        sha256: "ab".repeat(32),
        metadata: { originalName: "front.jpg" },
      },
    });
    assert.equal(sourceBlob.statusCode, 201, sourceBlob.body);
    const sourceBlobBody = sourceBlob.json() as {
      blob: { id: string; objectKey: string; contentType: string; byteSize: number; metadata: { purpose: string } };
      upload: { method: string; url: string; headers: Record<string, string>; bucket: string };
    };
    assert.equal(sourceBlobBody.blob.contentType, "image/jpeg");
    assert.equal(sourceBlobBody.blob.byteSize, 12345);
    assert.equal(sourceBlobBody.blob.metadata.purpose, "photoscan-source");
    assert.match(sourceBlobBody.blob.objectKey, /^users\/user-platform\/photoscan-source\/abab/);
    assert.equal(sourceBlobBody.upload.method, "PUT");
    assert.equal(sourceBlobBody.upload.headers["content-type"], "image/jpeg");
    assert.match(sourceBlobBody.upload.url, /X-Amz-Signature=/);

    const duplicateBlob = await app.inject({
      method: "POST",
      url: "/v1/blobs",
      headers: authHeaders,
      payload: {
        purpose: "photoscan-source",
        contentType: "image/jpeg",
        sha256: "ab".repeat(32),
      },
    });
    assert.equal(duplicateBlob.statusCode, 201, duplicateBlob.body);
    assert.equal((duplicateBlob.json() as { blob: { id: string } }).blob.id, sourceBlobBody.blob.id);

    const fetchedBlob = await app.inject({
      method: "GET",
      url: `/v1/blobs/${sourceBlobBody.blob.id}`,
      headers: authHeaders,
    });
    assert.equal(fetchedBlob.statusCode, 200, fetchedBlob.body);

    const downloadAccess = await app.inject({
      method: "POST",
      url: `/v1/blobs/${sourceBlobBody.blob.id}/access`,
      headers: authHeaders,
      payload: { action: "download", expiresInSeconds: 300 },
    });
    assert.equal(downloadAccess.statusCode, 200, downloadAccess.body);
    const downloadBody = downloadAccess.json() as { access: { method: string; url: string; headers: Record<string, string> } };
	    assert.equal(downloadBody.access.method, "GET");
	    assert.deepEqual(downloadBody.access.headers, {});
	    assert.match(downloadBody.access.url, /X-Amz-Signature=/);

	    const vendorRefresh = await app.inject({
	      method: "POST",
	      url: "/v1/commerce/vendor-offers/refresh",
	      headers: authHeaders,
	      payload: {
	        offers: [
	          {
	            componentId: "cmp_motor_fixture",
	            vendor: "Fixture Vendor",
	            sku: "MOTOR-1",
	            url: "https://vendor.example.test/motor-1",
	            price: 19.5,
	            currency: "USD",
	            availability: "in-stock",
	          },
	        ],
	      },
	    });
	    assert.equal(vendorRefresh.statusCode, 201, vendorRefresh.body);
	    assert.equal((vendorRefresh.json() as { offers: { componentId: string }[] }).offers[0].componentId, "cmp_motor_fixture");
	    const vendorOffers = await app.inject({
	      method: "GET",
	      url: "/v1/commerce/vendor-offers?componentId=cmp_motor_fixture",
	      headers: authHeaders,
	    });
	    assert.equal(vendorOffers.statusCode, 200, vendorOffers.body);
	    assert.equal((vendorOffers.json() as { offers: unknown[] }).offers.length, 1);

	    const printQuote = await app.inject({
	      method: "POST",
	      url: "/v1/commerce/print-quotes",
	      headers: authHeaders,
	      payload: {
	        artifactBlobId: sourceBlobBody.blob.id,
	        process: "fdm",
	        material: "petg",
	        quantity: 2,
	        dfmArtifact: { pass: true, threeMf: "fixture://print.3mf" },
	      },
	    });
	    assert.equal(printQuote.statusCode, 201, printQuote.body);
	    const printQuoteBody = printQuote.json() as { quote: { offers: { quoteUrl: string; terms: { noDirectPayment: boolean } }[] } };
	    assert.equal(printQuoteBody.quote.offers[0].terms.noDirectPayment, true);
	    assert.match(printQuoteBody.quote.offers[0].quoteUrl, /print\.example\.invalid/);
	    const draftPrintQuote = await app.inject({
	      method: "POST",
	      url: "/v1/commerce/print-quotes",
	      headers: authHeaders,
	      payload: {
	        artifactBlobId: sourceBlobBody.blob.id,
	        modelId: draftBody.model.id,
	        process: "fdm",
	        material: "petg",
	        dfmArtifact: { pass: true, threeMf: "fixture://print.3mf" },
	      },
	    });
	    assert.equal(draftPrintQuote.statusCode, 409, draftPrintQuote.body);
	    assert.match(draftPrintQuote.body, /drafts cannot train, export, deploy, or share/);
	    const printQuotes = await app.inject({ method: "GET", url: "/v1/commerce/print-quotes", headers: authHeaders });
	    assert.equal(printQuotes.statusCode, 200, printQuotes.body);
	    assert.equal((printQuotes.json() as { quotes: unknown[] }).quotes.length, 1);

	    const job = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: authHeaders,
      payload: {
        kind: "photoscan.single",
        payload: { objectKey: "fixture://single.jpg" },
        idempotencyKey: "photoscan-single",
      },
    });
    assert.equal(job.statusCode, 201, job.body);
    const jobId = (job.json() as { job: { id: string; output: { artifactKind: string } } }).job.id;
    assert.equal((job.json() as { job: { output: { artifactKind: string } } }).job.output.artifactKind, "photoscan");

    const duplicateJob = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: authHeaders,
      payload: {
        kind: "photoscan.single",
        payload: { objectKey: "fixture://single.jpg" },
        idempotencyKey: "photoscan-single",
      },
    });
    assert.equal(duplicateJob.statusCode, 201, duplicateJob.body);
    assert.equal((duplicateJob.json() as { job: { id: string } }).job.id, jobId);

    const queuedLocalJob = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: authHeaders,
      payload: {
        kind: "codesign.evaluate",
        provider: "local",
        payload: { modelId: createdBody.model.id },
        idempotencyKey: "codesign-local",
      },
    });
    assert.equal(queuedLocalJob.statusCode, 201, queuedLocalJob.body);
    const queuedJobBody = queuedLocalJob.json() as { job: { id: string; provider: string; status: string; output: unknown } };
    assert.equal(queuedJobBody.job.provider, "local");
    assert.equal(queuedJobBody.job.status, "queued");
    assert.equal(queuedJobBody.job.output, null);

    const fetchedJob = await app.inject({
      method: "GET",
      url: `/v1/jobs/${queuedJobBody.job.id}`,
      headers: authHeaders,
    });
    assert.equal(fetchedJob.statusCode, 200, fetchedJob.body);
    assert.equal((fetchedJob.json() as { job: { id: string; status: string } }).job.id, queuedJobBody.job.id);

    const jobEvents = await app.inject({
      method: "GET",
      url: `/v1/jobs/${queuedJobBody.job.id}/events`,
      headers: authHeaders,
    });
    assert.equal(jobEvents.statusCode, 200, jobEvents.body);
    assert.deepEqual((jobEvents.json() as { events: unknown[] }).events, []);

    const photoscan = await app.inject({
      method: "POST",
      url: "/v1/photoscan",
      headers: authHeaders,
      payload: { mode: "multiview", payload: { imageCount: 4 } },
    });
    assert.equal(photoscan.statusCode, 202, photoscan.body);

    const policy = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: authHeaders,
      payload: { payload: { task: "hover" } },
    });
    assert.equal(policy.statusCode, 202, policy.body);
    const draftPolicy = await app.inject({
      method: "POST",
      url: "/v1/policies",
      headers: authHeaders,
      payload: { payload: { modelId: draftBody.model.id, task: "hover" } },
    });
    assert.equal(draftPolicy.statusCode, 409, draftPolicy.body);
    assert.match(draftPolicy.body, /drafts cannot train, export, deploy, or share/);

    const photoscanArtifacts = await app.inject({
      method: "GET",
      url: "/v1/photoscan/artifacts",
      headers: authHeaders,
    });
    assert.equal(photoscanArtifacts.statusCode, 200, photoscanArtifacts.body);
    const photoscanArtifactBody = photoscanArtifacts.json() as {
      artifacts: { id: string; artifactBlobId: string | null }[];
    };
    assert.ok(photoscanArtifactBody.artifacts.length >= 2);
    assert.ok(photoscanArtifactBody.artifacts.every((artifact) => artifact.artifactBlobId));

    const alignedScan = await app.inject({
      method: "PATCH",
      url: `/v1/photoscan/artifacts/${photoscanArtifactBody.artifacts[0].id}/alignment`,
      headers: authHeaders,
      payload: {
        knownDimensionMm: 150,
        axis: "z",
        ports: [{ id: "motor-mount", kind: "mount", axis: "z" }],
        note: "owner scale and port pass",
      },
    });
    assert.equal(alignedScan.statusCode, 200, alignedScan.body);
    const alignedScanBody = alignedScan.json() as {
      artifact: { scaleAxesPorts: { knownDimensionMm?: number; axis?: string; ports?: unknown[] } };
    };
    assert.equal(alignedScanBody.artifact.scaleAxesPorts.knownDimensionMm, 150);
    assert.equal(alignedScanBody.artifact.scaleAxesPorts.axis, "z");
    assert.equal(alignedScanBody.artifact.scaleAxesPorts.ports?.length, 1);

    const malformedAlignment = await app.inject({
      method: "PATCH",
      url: `/v1/photoscan/artifacts/${photoscanArtifactBody.artifacts[0].id}/alignment`,
      headers: authHeaders,
      payload: { ports: [{ kind: "mount" }] },
    });
    assert.equal(malformedAlignment.statusCode, 400, malformedAlignment.body);

    const policyArtifacts = await app.inject({
      method: "GET",
      url: "/v1/policies",
      headers: authHeaders,
    });
    assert.equal(policyArtifacts.statusCode, 200, policyArtifacts.body);
    const policyArtifactBody = policyArtifacts.json() as {
      artifacts: { artifactBlobId: string | null; exportGate: string; taskKind: string }[];
    };
    assert.equal(policyArtifactBody.artifacts.length, 1);
    assert.ok(policyArtifactBody.artifacts[0].artifactBlobId);
    assert.equal(policyArtifactBody.artifacts[0].taskKind, "hover-hold");

    const replay = await app.inject({
      method: "POST",
      url: "/v1/replays",
      headers: authHeaders,
      payload: { tape: { frames: [{ t: 0 }] } },
    });
    assert.equal(replay.statusCode, 202, replay.body);
    assert.equal((replay.json() as { replay: { verification: { verified: boolean } } }).replay.verification.verified, true);
    const replays = await app.inject({ method: "GET", url: "/v1/replays", headers: authHeaders });
    assert.equal(replays.statusCode, 200, replays.body);
    const replayBody = replays.json() as { replays: { verification: { verified: boolean }; tamperHash: string | null }[] };
    assert.equal(replayBody.replays.length, 1);
    assert.equal(replayBody.replays[0].verification.verified, true);
    assert.ok(replayBody.replays[0].tamperHash);

    const supervisorJob = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: authHeaders,
      payload: {
        kind: "bridge.supervisor-check",
        payload: { state: { positionM: [0, 0, 0] } },
      },
    });
    assert.equal(supervisorJob.statusCode, 201, supervisorJob.body);
    assert.equal((supervisorJob.json() as { job: { output: { command: string } } }).job.output.command, "policy-advisory");

	    const telemetryJob = await app.inject({
	      method: "POST",
	      url: "/v1/jobs",
	      headers: authHeaders,
      payload: {
        kind: "bridge.telemetry-ingest",
        payload: { samples: [{ t: 0 }, { t: 1 }] },
      },
    });
    assert.equal(telemetryJob.statusCode, 201, telemetryJob.body);
    assert.equal((telemetryJob.json() as { job: { output: { artifactKind: string } } }).job.output.artifactKind, "telemetry-replay");
    const telemetryLogs = await app.inject({ method: "GET", url: "/v1/telemetry/logs", headers: authHeaders });
    assert.equal(telemetryLogs.statusCode, 200, telemetryLogs.body);
    const telemetryBody = telemetryLogs.json() as { logs: { source: string; tape: { frames?: unknown[] } }[] };
	    assert.equal(telemetryBody.logs.length, 1);
	    assert.equal(telemetryBody.logs[0].source, "fixture");

	    const previousHardwareLabMode = process.env.FORGE_HARDWARE_LAB_MODE;
	    delete process.env.FORGE_HARDWARE_LAB_MODE;
	    try {
	      const liveTelemetryBlocked = await app.inject({
	        method: "POST",
	        url: "/v1/jobs",
	        headers: authHeaders,
	        payload: {
	          kind: "bridge.telemetry-ingest",
	          provider: "local",
	          payload: {
	            rigId: "ref_quad_kakute-h7-source-one-5in",
	            samples: [{ t: 0 }, { t: 1 }],
	          },
	        },
	      });
	      assert.equal(liveTelemetryBlocked.statusCode, 409, liveTelemetryBlocked.body);
	      assert.match(liveTelemetryBlocked.body, /D30 controlled D12 lab signoff/);

	      const hardwareGate = await app.inject({
	        method: "POST",
	        url: "/v1/platform/gates/d28.hardware/signoffs",
	        payload: {
	          status: "accepted",
	          policyVersion: "d30-d28-lab-signoff-test",
	          jurisdiction: "US/EU",
	          reviewer: "test-owner",
	          evidence: { scope: "controlled D12 lab pilots only" },
	        },
	      });
	      assert.equal(hardwareGate.statusCode, 201, hardwareGate.body);

	      const liveTelemetryWithoutLabMode = await app.inject({
	        method: "POST",
	        url: "/v1/jobs",
	        headers: authHeaders,
	        payload: {
	          kind: "bridge.telemetry-ingest",
	          provider: "local",
	          payload: {
	            rigId: "ref_quad_kakute-h7-source-one-5in",
	            samples: [{ t: 2 }, { t: 3 }],
	          },
	        },
	      });
	      assert.equal(liveTelemetryWithoutLabMode.statusCode, 409, liveTelemetryWithoutLabMode.body);
	      assert.match(liveTelemetryWithoutLabMode.body, /FORGE_HARDWARE_LAB_MODE=1/);

	      process.env.FORGE_HARDWARE_LAB_MODE = "1";
	      const liveTelemetryLabQueued = await app.inject({
	        method: "POST",
	        url: "/v1/jobs",
	        headers: authHeaders,
	        payload: {
	          kind: "bridge.telemetry-ingest",
	          provider: "local",
	          payload: {
	            rigId: "ref_quad_kakute-h7-source-one-5in",
	            samples: [{ t: 4 }, { t: 5 }],
	          },
	        },
	      });
	      assert.equal(liveTelemetryLabQueued.statusCode, 201, liveTelemetryLabQueued.body);
	      const liveTelemetryLabBody = liveTelemetryLabQueued.json() as { job: { provider: string; status: string; output: unknown } };
	      assert.equal(liveTelemetryLabBody.job.provider, "local");
	      assert.equal(liveTelemetryLabBody.job.status, "queued");
	      assert.equal(liveTelemetryLabBody.job.output, null);

	      const labCapabilities = await app.inject({ method: "GET", url: "/v1/jobs/capabilities", headers: authHeaders });
	      assert.equal(labCapabilities.statusCode, 200, labCapabilities.body);
	      assert.equal((labCapabilities.json() as { hardware: { labMode: boolean } }).hardware.labMode, true);
	    } finally {
	      if (previousHardwareLabMode === undefined) {
	        delete process.env.FORGE_HARDWARE_LAB_MODE;
	      } else {
	        process.env.FORGE_HARDWARE_LAB_MODE = previousHardwareLabMode;
	      }
	    }

	    const wearJob = await app.inject({
      method: "POST",
      url: "/v1/jobs",
      headers: authHeaders,
      payload: {
        kind: "maintenance.estimate-wear",
        payload: { samples: [] },
      },
    });
    assert.equal(wearJob.statusCode, 201, wearJob.body);
    assert.equal((wearJob.json() as { job: { output: { artifactKind: string } } }).job.output.artifactKind, "wear-estimate");
    const maintenanceRecords = await app.inject({ method: "GET", url: "/v1/maintenance/records", headers: authHeaders });
    assert.equal(maintenanceRecords.statusCode, 200, maintenanceRecords.body);
    const maintenanceBody = maintenanceRecords.json() as { records: { kind: string; severity: string }[] };
    assert.equal(maintenanceBody.records.length, 1);
    assert.equal(maintenanceBody.records[0].kind, "wear");

    const jobs = await app.inject({ method: "GET", url: "/v1/jobs", headers: authHeaders });
    assert.equal(jobs.statusCode, 200, jobs.body);
    assert.equal((jobs.json() as { jobs: unknown[] }).jobs.length, 9);

    const course = await app.inject({
      method: "POST",
      url: "/v1/courses",
      headers: authHeaders,
      payload: {
        name: "Fixture slalom",
        envSpec: {
          id: "fixture-slalom",
          name: "Fixture slalom",
          kind: "slalom",
          boundsM: [20, 6, 20],
          terrain: { kind: "flat" },
          tasks: ["gate-slalom"],
          spawns: [{ id: "start", pose: { p: [0, 0, 0] }, archetypeFilter: ["multirotor"] }],
          gates: [{ id: "g1", pose: { p: [4, 1, 0] }, widthM: 1.2, heightM: 0.8 }],
          win: { gateOrder: ["g1"], timeLimitS: 30, contactPenalties: true },
        },
        visibility: "unlisted",
      },
    });
    assert.equal(course.statusCode, 201, course.body);
    const courseId = (course.json() as { id: string }).id;
    const courseById = await app.inject({ method: "GET", url: `/v1/courses/${courseId}` });
    assert.equal(courseById.statusCode, 200, courseById.body);
    assert.equal((courseById.json() as { course: { id: string } }).course.id, courseId);
    const generatedCourse = await app.inject({
      method: "POST",
      url: "/v1/courses/generate",
      headers: authHeaders,
      payload: {
        prompt: "tight indoor multirotor slalom with one reference block",
        archetype: "multirotor",
        seed: 7,
        visibility: "unlisted",
      },
    });
    assert.equal(generatedCourse.statusCode, 201, generatedCourse.body);
    const generatedBody = generatedCourse.json() as {
      id: string;
      envSpec: { version: string; provenance: { promptHash: string } };
      generation: { archetype: string; provider: string };
    };
    assert.equal(generatedBody.envSpec.version, "1.0.0");
    assert.equal(generatedBody.generation.archetype, "multirotor");
    assert.match(generatedBody.envSpec.provenance.promptHash, /^[a-f0-9]{64}$/);
    const courses = await app.inject({ method: "GET", url: "/v1/courses" });
    assert.equal(courses.statusCode, 200, courses.body);
    assert.equal((courses.json() as { courses: unknown[] }).courses.length, 2);

    const blindLeaderboardClaim = await app.inject({
      method: "POST",
      url: "/v1/leaderboards",
      headers: authHeaders,
      payload: { courseId, score: 92.5, verification: { verified: true } },
    });
    assert.equal(blindLeaderboardClaim.statusCode, 201, blindLeaderboardClaim.body);
    assert.equal((blindLeaderboardClaim.json() as { verified: boolean }).verified, false);

    const leaderboard = await app.inject({
      method: "POST",
      url: "/v1/leaderboards",
      headers: authHeaders,
      payload: {
        courseId,
        score: 92.5,
        archetype: "multirotor",
        classKey: "stock-vx2",
        tape: { frames: [{ t: 0 }, { t: 1 / 60 }] },
      },
    });
    assert.equal(leaderboard.statusCode, 201, leaderboard.body);
    assert.equal((leaderboard.json() as { verified: boolean; archetype: string; classKey: string }).verified, true);
    assert.equal((leaderboard.json() as { verified: boolean; archetype: string; classKey: string }).archetype, "multirotor");
    assert.equal((leaderboard.json() as { verified: boolean; archetype: string; classKey: string }).classKey, "stock-vx2");
    const leaderboardList = await app.inject({ method: "GET", url: `/v1/leaderboards?courseId=${courseId}` });
    assert.equal(leaderboardList.statusCode, 200, leaderboardList.body);
    assert.equal((leaderboardList.json() as { runs: unknown[] }).runs.length, 2);
    const slicedLeaderboard = await app.inject({
      method: "GET",
      url: `/v1/leaderboards?courseId=${courseId}&archetype=multirotor&classKey=stock-vx2`,
    });
    assert.equal(slicedLeaderboard.statusCode, 200, slicedLeaderboard.body);
    const slicedRuns = slicedLeaderboard.json() as { runs: { archetype: string; classKey: string }[] };
    assert.equal(slicedRuns.runs.length, 1);
    assert.equal(slicedRuns.runs[0].archetype, "multirotor");
    assert.equal(slicedRuns.runs[0].classKey, "stock-vx2");

    const listing = await app.inject({
      method: "POST",
      url: "/v1/listings",
      headers: authHeaders,
      payload: { modelId: createdBody.model.id, title: "VX-2 Mini", priceCredits: 5 },
    });
    assert.equal(listing.statusCode, 201, listing.body);
    assert.equal((listing.json() as { status: string }).status, "review");
    const listingId = (listing.json() as { id: string }).id;
    const reviewListings = await app.inject({ method: "GET", url: "/v1/listings?status=review" });
    assert.equal(reviewListings.statusCode, 200, reviewListings.body);
    assert.equal((reviewListings.json() as { listings: unknown[] }).listings.length, 1);
    const curatedListing = await app.inject({
      method: "PATCH",
      url: `/v1/listings/${listingId}`,
      payload: { status: "listed", reviewer: "test-owner", note: "fixture curation pass" },
    });
    assert.equal(curatedListing.statusCode, 200, curatedListing.body);
    assert.equal((curatedListing.json() as { listing: { status: string } }).listing.status, "listed");
    const draftListing = await app.inject({
      method: "POST",
      url: "/v1/listings",
      headers: authHeaders,
      payload: { modelId: draftBody.model.id, title: "Draft VX-2 Mini", priceCredits: 5 },
    });
    assert.equal(draftListing.statusCode, 409, draftListing.body);
    assert.match(draftListing.body, /marketplace listings require an admitted validator report/);
	    const unsignedPolicyListing = await app.inject({
	      method: "POST",
	      url: "/v1/listings",
	      headers: authHeaders,
	      payload: { modelId: createdBody.model.id, title: "VX-2 skill", listingKind: "policy" },
	    });
	    assert.equal(unsignedPolicyListing.statusCode, 409, unsignedPolicyListing.body);
	    const signedPolicyListingBlocked = await app.inject({
	      method: "POST",
	      url: "/v1/listings",
	      headers: authHeaders,
	      payload: {
	        modelId: createdBody.model.id,
	        title: "VX-2 skill",
	        listingKind: "policy",
	        policySignoff: { accepted: true, jurisdiction: "US/EU", operatorUse: "simulation-only" },
	      },
	    });
	    assert.equal(signedPolicyListingBlocked.statusCode, 409, signedPolicyListingBlocked.body);
	    assert.match(signedPolicyListingBlocked.body, /platform gate/);
	    const policyGate = await app.inject({
	      method: "POST",
	      url: "/v1/platform/gates/p11.policy-sharing/signoffs",
	      payload: {
	        status: "accepted",
	        policyVersion: "p11-policy-sharing-test",
	        jurisdiction: "US/EU",
	        reviewer: "test-owner",
	        evidence: { scope: "test signoff" },
	      },
	    });
	    assert.equal(policyGate.statusCode, 201, policyGate.body);
	    const signedPolicyListing = await app.inject({
	      method: "POST",
	      url: "/v1/listings",
	      headers: authHeaders,
      payload: {
        modelId: createdBody.model.id,
        title: "VX-2 skill",
        listingKind: "policy",
        policySignoff: { accepted: true, jurisdiction: "US/EU", operatorUse: "simulation-only" },
      },
	    });
	    assert.equal(signedPolicyListing.statusCode, 201, signedPolicyListing.body);
	    const usage = await app.inject({
	      method: "POST",
	      url: `/v1/listings/${listingId}/usage`,
	      payload: { event: "view", listingKind: "model" },
	    });
	    assert.equal(usage.statusCode, 202, usage.body);
	    const publicListings = await app.inject({ method: "GET", url: "/v1/listings" });
    assert.equal(publicListings.statusCode, 200, publicListings.body);
    assert.equal((publicListings.json() as { listings: unknown[] }).listings.length, 1);

    const moderation = await app.inject({
      method: "POST",
      url: "/v1/moderation/reports",
      headers: authHeaders,
      payload: { targetKind: "listing", targetId: listingId, reason: "safety", detail: "fixture report" },
    });
    assert.equal(moderation.statusCode, 201, moderation.body);
    assert.equal((moderation.json() as { repeatInfringerSignal: boolean }).repeatInfringerSignal, false);
    const moderationId = (moderation.json() as { id: string }).id;
    const repeatedModeration = await app.inject({
      method: "POST",
      url: "/v1/moderation/reports",
      headers: authHeaders,
      payload: { targetKind: "listing", targetId: listingId, reason: "safety", detail: "repeat fixture report" },
    });
    assert.equal(repeatedModeration.statusCode, 201, repeatedModeration.body);
    assert.equal((repeatedModeration.json() as { repeatInfringerSignal: boolean }).repeatInfringerSignal, true);
    const moderationList = await app.inject({ method: "GET", url: "/v1/moderation/reports", headers: authHeaders });
    assert.equal(moderationList.statusCode, 200, moderationList.body);
    assert.equal((moderationList.json() as { reports: unknown[] }).reports.length, 2);
    const actionedModeration = await app.inject({
      method: "PATCH",
      url: `/v1/moderation/reports/${moderationId}`,
      payload: {
        status: "actioned",
        action: "delist-listing",
        reviewer: "test-owner",
        note: "delist unsafe listing",
      },
    });
    assert.equal(actionedModeration.statusCode, 200, actionedModeration.body);
    assert.equal((actionedModeration.json() as { listing: { status: string } }).listing.status, "delisted");
    const publicListingsAfterDelist = await app.inject({ method: "GET", url: "/v1/listings" });
    assert.equal(publicListingsAfterDelist.statusCode, 200, publicListingsAfterDelist.body);
    assert.equal((publicListingsAfterDelist.json() as { listings: unknown[] }).listings.length, 0);

    const assignment = await app.inject({
      method: "POST",
      url: "/v1/classroom/assignments",
      headers: authHeaders,
      payload: {
        title: "Admit a safe mini quad",
        brief: "Submit an admitted contract and explain validator diagnostics.",
        courseId,
        visibility: "unlisted",
        rubric: { maxErrors: 0, minScore: 0.8, minSuccessRate: 0.8 },
      },
    });
    assert.equal(assignment.statusCode, 201, assignment.body);
    const assignmentId = (assignment.json() as { id: string }).id;
    const assignments = await app.inject({ method: "GET", url: "/v1/classroom/assignments", headers: authHeaders });
    assert.equal(assignments.statusCode, 200, assignments.body);
    assert.equal((assignments.json() as { assignments: unknown[] }).assignments.length, 1);
    const submission = await app.inject({
      method: "POST",
      url: `/v1/classroom/assignments/${assignmentId}/submissions`,
      headers: authHeaders,
      payload: { modelId: createdBody.model.id, scorecard: { successRate: 0.92 } },
    });
    assert.equal(submission.statusCode, 201, submission.body);
    assert.equal((submission.json() as { grade: { pass: boolean } }).grade.pass, true);
    const submissions = await app.inject({
      method: "GET",
      url: `/v1/classroom/assignments/${assignmentId}/submissions`,
      headers: authHeaders,
    });
    assert.equal(submissions.statusCode, 200, submissions.body);
    assert.equal((submissions.json() as { submissions: unknown[] }).submissions.length, 1);

    const maintenance = await app.inject({
      method: "POST",
      url: "/v1/maintenance/records",
      headers: authHeaders,
      payload: {
        modelId: createdBody.model.id,
        kind: "wear",
        severity: "warn",
        summary: "pack sag trending upward",
        payload: { packCycles: 42 },
      },
    });
    assert.equal(maintenance.statusCode, 201, maintenance.body);
    const maintenanceList = await app.inject({
      method: "GET",
      url: `/v1/maintenance/records?modelId=${createdBody.model.id}`,
      headers: authHeaders,
    });
    assert.equal(maintenanceList.statusCode, 200, maintenanceList.body);
    assert.equal((maintenanceList.json() as { records: unknown[] }).records.length, 1);

    } finally {
      await app.close();
      if (previousDevAuth === undefined) {
        delete process.env.FORGE_DEV_AUTH;
      } else {
        process.env.FORGE_DEV_AUTH = previousDevAuth;
      }
    }
  },
);

test("review queue lists pending catalog items", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, ["needs_review", 50]);
      return {
        rows: [
          {
            id: 7,
            artifact_id: "cmp_frame_tbs-source-one-v6-5in",
            artifact_kind: "component",
            reason: "retailer-only dimensions require owner verification",
            status: "needs_review",
            confidence: "0.7",
            payload: { id: "cmp_frame_tbs-source-one-v6-5in" },
            created_at: "2026-06-13T18:00:00.000Z",
            reviewed_at: null,
            reviewer: null,
            review_note: null,
            export_policy: null,
            decision_payload: {},
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const app = buildServer({ db });
  const res = await app.inject({ method: "GET", url: "/v1/reviews" });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { items: { id: number; artifactId: string; confidence: number }[] };
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].artifactId, "cmp_frame_tbs-source-one-v6-5in");
  assert.equal(body.items[0].confidence, 0.7);
  await app.close();
});

test("review queue records an approval decision", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [7, "approved", "owner", "datasheet checked", "full-geometry-ok"]);
      return {
        rows: [
          {
            id: 7,
            artifact_id: "ref_quad_kakute-h7-source-one-5in",
            artifact_kind: "reference-rig",
            reason: "reference rig owner verification required",
            status: "approved",
            confidence: "0.8",
            payload: { id: "ref_quad_kakute-h7-source-one-5in" },
            created_at: "2026-06-13T18:00:00.000Z",
            reviewed_at: "2026-06-13T18:05:00.000Z",
            reviewer: "owner",
            review_note: "datasheet checked",
            export_policy: "full-geometry-ok",
            decision_payload: { status: "approved" },
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const app = buildServer({ db });
  const res = await app.inject({
    method: "PATCH",
    url: "/v1/reviews/7",
    payload: {
      status: "approved",
      reviewer: "owner",
      reviewNote: "datasheet checked",
      exportPolicy: "full-geometry-ok",
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const item = res.json() as {
    status: string;
    reviewer: string;
    reviewNote: string;
    exportPolicy: string;
  };
  assert.equal(item.status, "approved");
  assert.equal(item.reviewer, "owner");
  assert.equal(item.reviewNote, "datasheet checked");
  assert.equal(item.exportPolicy, "full-geometry-ok");
  await app.close();
});

test("review queue filters closed rows by export policy", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, ["approved", 10, "attribution-manifest-required"]);
      return { rows: [], rowCount: 0 } as never;
    },
  };
  const app = buildServer({ db });
  const res = await app.inject({
    method: "GET",
    url: "/v1/reviews?status=approved&limit=10&exportPolicy=attribution-manifest-required",
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual((res.json() as { items: unknown[] }).items, []);
  await app.close();
});

test("review queue can be guarded by an owner token", async () => {
  const db: GatewayDb = {
    async query() {
      return { rows: [], rowCount: 0 } as never;
    },
  };
  const app = buildServer({ db, reviewToken: "secret-token" });
  const denied = await app.inject({ method: "GET", url: "/v1/reviews" });
  assert.equal(denied.statusCode, 401);
  const allowed = await app.inject({
    method: "GET",
    url: "/v1/reviews",
    headers: { authorization: "Bearer secret-token" },
  });
  assert.equal(allowed.statusCode, 200, allowed.body);
  await app.close();
});

test("review queue reports database unavailability cleanly", async () => {
  const db: GatewayDb = {
    async query() {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    },
  };
  const app = buildServer({ db });
  const res = await app.inject({ method: "GET", url: "/v1/reviews" });
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /catalog database unavailable/);
  await app.close();
});

test(
  "asDraft turns a failing contract into an editable draft (D14)",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const hrx7 = JSON.parse(
      readFileSync(join(process.cwd(), "..", "..", "examples", "hrx7.forge.json"), "utf8"),
    ) as unknown;
    // without the flag: rejected, 422
    const rejected = await app.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract: hrx7 },
    });
    assert.equal(rejected.statusCode, 422);
    assert.equal((rejected.json() as { verdict: string }).verdict, "rejected");
    // with it: a successful save-as-draft, diagnostics intact
    const draft = await app.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract: hrx7, asDraft: true },
    });
    assert.equal(draft.statusCode, 200, draft.body);
    const report = draft.json() as { verdict: string; results: { check: string }[] };
    assert.equal(report.verdict, "draft");
    assert.ok(report.results.some((d) => d.check === "CTR-004"), "diagnostics carried");
    await app.close();
  },
);
