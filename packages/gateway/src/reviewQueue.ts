import type { GatewayDb } from "./db.js";

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

export interface ReviewDecisionInput {
  status: ReviewDecision;
  reviewer: string | null;
  reviewNote?: string | null;
  exportPolicy?: ReviewExportPolicy | null;
}

interface ReviewQueueRow {
  id: string | number;
  artifact_id: string;
  artifact_kind: "component" | "reference-rig";
  reason: string;
  status: ReviewStatus;
  confidence: string | number;
  payload: unknown;
  created_at: Date | string;
  reviewed_at: Date | string | null;
  reviewer: string | null;
  review_note: string | null;
  export_policy: ReviewExportPolicy | null;
  decision_payload: unknown;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: ReviewQueueRow): ReviewQueueItem {
  return {
    id: Number(row.id),
    artifactId: row.artifact_id,
    artifactKind: row.artifact_kind,
    reason: row.reason,
    status: row.status,
    confidence: Number(row.confidence),
    payload: row.payload,
    createdAt: iso(row.created_at),
    reviewedAt: row.reviewed_at === null ? null : iso(row.reviewed_at),
    reviewer: row.reviewer,
    reviewNote: row.review_note,
    exportPolicy: row.export_policy,
    decisionPayload: row.decision_payload,
  };
}

export async function listReviewQueue(
  db: GatewayDb,
  status: ReviewStatus = "needs_review",
  limit = 50,
  exportPolicy?: ReviewExportPolicy,
): Promise<ReviewQueueItem[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const exportClause = exportPolicy === undefined ? "" : "AND export_policy = $3";
  const result = await db.query<ReviewQueueRow>(
    `SELECT id, artifact_id, artifact_kind, reason, status, confidence, payload,
            created_at, reviewed_at, reviewer, review_note, export_policy, decision_payload
       FROM review_queue
      WHERE status = $1
        ${exportClause}
      ORDER BY created_at ASC, id ASC
      LIMIT $2`,
    exportPolicy === undefined ? [status, boundedLimit] : [status, boundedLimit, exportPolicy],
  );
  return result.rows.map(mapRow);
}

export async function recordReviewDecision(
  db: GatewayDb,
  id: number,
  decision: ReviewDecisionInput,
): Promise<ReviewQueueItem | null> {
  const result = await db.query<ReviewQueueRow>(
    `UPDATE review_queue
        SET status = $2,
            reviewer = $3::text,
            review_note = NULLIF($4::text, ''),
            export_policy = COALESCE(
              $5::text,
              CASE
                WHEN $2 = 'approved' THEN COALESCE(payload #>> '{license,exportPolicy}', 'assembly-policy-derived')
                ELSE 'blocked'
              END
            ),
            decision_payload = jsonb_strip_nulls(jsonb_build_object(
              'status', $2::text,
              'reviewer', $3::text,
              'reviewNote', NULLIF($4::text, ''),
              'requestedExportPolicy', $5::text,
              'decidedBy', 'gateway-review-api'
            )),
            reviewed_at = now()
      WHERE id = $1
        AND status = 'needs_review'
      RETURNING id, artifact_id, artifact_kind, reason, status, confidence, payload,
                created_at, reviewed_at, reviewer, review_note, export_policy, decision_payload`,
    [id, decision.status, decision.reviewer, decision.reviewNote ?? null, decision.exportPolicy ?? null],
  );
  return result.rows.length === 0 ? null : mapRow(result.rows[0]);
}
