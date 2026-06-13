import type { GatewayDb } from "./db.js";

export type ReviewStatus = "needs_review" | "approved" | "rejected";
export type ReviewDecision = "approved" | "rejected";

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
  };
}

export async function listReviewQueue(
  db: GatewayDb,
  status: ReviewStatus = "needs_review",
  limit = 50,
): Promise<ReviewQueueItem[]> {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const result = await db.query<ReviewQueueRow>(
    `SELECT id, artifact_id, artifact_kind, reason, status, confidence, payload,
            created_at, reviewed_at, reviewer
       FROM review_queue
      WHERE status = $1
      ORDER BY created_at ASC, id ASC
      LIMIT $2`,
    [status, boundedLimit],
  );
  return result.rows.map(mapRow);
}

export async function recordReviewDecision(
  db: GatewayDb,
  id: number,
  decision: ReviewDecision,
  reviewer: string | null,
): Promise<ReviewQueueItem | null> {
  const result = await db.query<ReviewQueueRow>(
    `UPDATE review_queue
        SET status = $2,
            reviewer = $3,
            reviewed_at = now()
      WHERE id = $1
        AND status = 'needs_review'
      RETURNING id, artifact_id, artifact_kind, reason, status, confidence, payload,
                created_at, reviewed_at, reviewer`,
    [id, decision, reviewer],
  );
  return result.rows.length === 0 ? null : mapRow(result.rows[0]);
}
