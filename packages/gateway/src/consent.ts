import { createHash } from "node:crypto";
import type { CurrentUser } from "./auth.js";
import { withGatewayTransaction, type GatewayDb } from "./db.js";

export const CONSENT_LEDGER_FORMAT_VERSION = "1.0.0";

export const CONSENT_PURPOSES = [
  "photoscan.processing",
  "telemetry.sharing",
  "pattern.contribution",
  "leaderboard.publication",
  "training.reuse",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];
export type ConsentAction = "grant" | "withdraw";
export type ConsentSubjectKind = "account" | "object-blob" | "telemetry-log" | "model";

interface ConsentPolicyDefinition {
  purpose: ConsentPurpose;
  subjectKind: ConsentSubjectKind;
  policyVersion: string;
  notice: string;
}

const POLICY_DEFINITIONS: readonly ConsentPolicyDefinition[] = [
  {
    purpose: "photoscan.processing",
    subjectKind: "object-blob",
    policyVersion: "1.0.0",
    notice: "Allow ForgedTTC to process this owned photo object into a private photoscan result. This does not allow training reuse or public sharing.",
  },
  {
    purpose: "telemetry.sharing",
    subjectKind: "telemetry-log",
    policyVersion: "1.0.0",
    notice: "Allow this owned telemetry log to be shared through an explicit product action. The log remains private until that action occurs.",
  },
  {
    purpose: "pattern.contribution",
    subjectKind: "model",
    policyVersion: "1.0.0",
    notice: "Allow non-geometric structural idioms from this owned model to enter the pattern library with source provenance. Geometry and attribution are not published.",
  },
  {
    purpose: "leaderboard.publication",
    subjectKind: "account",
    policyVersion: "1.0.0",
    notice: "Allow verified run results from this account to appear on public leaderboards. Withdrawal removes this account's existing leaderboard rows.",
  },
  {
    purpose: "training.reuse",
    subjectKind: "telemetry-log",
    policyVersion: "1.0.0",
    notice: "Allow this owned telemetry log to be reused as training input. This is separate from photoscan processing, telemetry sharing, and pattern contribution.",
  },
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export interface ConsentPolicy extends ConsentPolicyDefinition {
  noticeHash: string;
  ledgerVersion: typeof CONSENT_LEDGER_FORMAT_VERSION;
}

export const CONSENT_POLICIES: readonly ConsentPolicy[] = POLICY_DEFINITIONS.map((policy) => ({
  ...policy,
  noticeHash: sha256(policy.notice),
  ledgerVersion: CONSENT_LEDGER_FORMAT_VERSION,
}));

export interface ConsentEvent {
  id: string;
  ledgerVersion: string;
  ownerUserId: string;
  purpose: ConsentPurpose;
  subjectKind: ConsentSubjectKind;
  subjectId: string;
  policyVersion: string;
  noticeHash: string;
  action: ConsentAction;
  evidence: unknown;
  idempotencyKey: string | null;
  previousEventId: string | null;
  eventSequence: string;
  createdAt: string;
  active: boolean;
}

type ConsentRow = {
  id: string;
  ledger_version: string;
  owner_user_id: string;
  purpose: ConsentPurpose;
  subject_kind: ConsentSubjectKind;
  subject_id: string;
  policy_version: string;
  notice_hash: string;
  action: ConsentAction;
  evidence: unknown;
  idempotency_key: string | null;
  previous_event_id: string | null;
  event_sequence: number | string;
  created_at: Date | string;
};

function policyFor(purpose: ConsentPurpose): ConsentPolicy {
  const policy = CONSENT_POLICIES.find((candidate) => candidate.purpose === purpose);
  if (!policy) throw Object.assign(new Error("unsupported consent purpose"), { statusCode: 400 });
  return policy;
}

function mapEvent(row: ConsentRow): ConsentEvent {
  const policy = policyFor(row.purpose);
  return {
    id: row.id,
    ledgerVersion: row.ledger_version,
    ownerUserId: row.owner_user_id,
    purpose: row.purpose,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    policyVersion: row.policy_version,
    noticeHash: row.notice_hash,
    action: row.action,
    evidence: row.evidence,
    idempotencyKey: row.idempotency_key,
    previousEventId: row.previous_event_id,
    eventSequence: String(row.event_sequence),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    active:
      row.action === "grant" &&
      row.ledger_version === CONSENT_LEDGER_FORMAT_VERSION &&
      row.policy_version === policy.policyVersion &&
      row.notice_hash === policy.noticeHash,
  };
}

function consentError(message: string, details: Record<string, unknown>): Error {
  return Object.assign(new Error(message), {
    name: "ConsentRequiredError",
    statusCode: 409,
    code: "CONSENT_REQUIRED",
    details,
  });
}

export function consentErrorResponse(error: unknown): { statusCode: number; body: unknown } | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "CONSENT_REQUIRED"
  ) {
    const message = "message" in error && typeof error.message === "string" ? error.message : "consent required";
    const details = "details" in error && typeof error.details === "object" ? error.details : {};
    return { statusCode: 409, body: { error: message, code: "CONSENT_REQUIRED", ...details } };
  }
  return null;
}

async function assertOwnedSubject(
  db: GatewayDb,
  user: CurrentUser,
  purpose: ConsentPurpose,
  subjectKind: ConsentSubjectKind,
  subjectId: string,
): Promise<void> {
  const expected = policyFor(purpose).subjectKind;
  if (subjectKind !== expected) {
    throw Object.assign(new Error(`${purpose} requires subjectKind ${expected}`), { statusCode: 400 });
  }
  if (subjectKind === "account") {
    if (subjectId !== user.id) throw Object.assign(new Error("account consent must target the current user"), { statusCode: 403 });
    return;
  }
  if (subjectKind === "object-blob") {
    const owned = await db.query<{ id: string; upload_status?: string }>(
      `SELECT id, upload_status FROM object_blobs WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
      [subjectId, user.id],
    );
    if (!owned.rows[0]) throw Object.assign(new Error("object-blob not found"), { statusCode: 404 });
    if (purpose === "photoscan.processing" && (owned.rows[0].upload_status ?? "complete") !== "complete") {
      throw Object.assign(new Error("photoscan source upload is not verified complete"), {
        statusCode: 409,
        code: "UPLOAD_INCOMPLETE",
      });
    }
    return;
  }
  const ownershipSql: Record<Exclude<ConsentSubjectKind, "account">, string> = {
    "object-blob": "SELECT id FROM object_blobs WHERE id = $1 AND owner_user_id = $2 LIMIT 1",
    "telemetry-log": "SELECT id FROM telemetry_logs WHERE id = $1 AND owner_user_id = $2 LIMIT 1",
    model: "SELECT id FROM model_registry WHERE id = $1 AND owner_user_id = $2 LIMIT 1",
  };
  const owned = await db.query<{ id: string }>(ownershipSql[subjectKind], [subjectId, user.id]);
  if (!owned.rows[0]) throw Object.assign(new Error(`${subjectKind} not found`), { statusCode: 404 });
}

const EVENT_COLUMNS = `id, ledger_version, owner_user_id, purpose, subject_kind, subject_id,
  policy_version, notice_hash, action, evidence, idempotency_key, previous_event_id,
  event_sequence, created_at`;

export async function listCurrentConsents(db: GatewayDb, user: CurrentUser): Promise<ConsentEvent[]> {
  const result = await db.query<ConsentRow>(
    `SELECT DISTINCT ON (purpose, subject_kind, subject_id) ${EVENT_COLUMNS}
      FROM user_consent_events
      WHERE owner_user_id = $1
      ORDER BY purpose, subject_kind, subject_id, event_sequence DESC`,
    [user.id],
  );
  return result.rows.map(mapEvent);
}

export async function assertActiveConsent(
  db: GatewayDb,
  user: CurrentUser,
  purpose: ConsentPurpose,
  subjectKind: ConsentSubjectKind,
  subjectId: string,
): Promise<ConsentEvent> {
  await assertOwnedSubject(db, user, purpose, subjectKind, subjectId);
  const policy = policyFor(purpose);
  const result = await db.query<ConsentRow>(
    `SELECT ${EVENT_COLUMNS}
       FROM user_consent_events
      WHERE owner_user_id = $1 AND purpose = $2 AND subject_kind = $3 AND subject_id = $4
      ORDER BY event_sequence DESC
      LIMIT 1`,
    [user.id, purpose, subjectKind, subjectId],
  );
  const event = result.rows[0] ? mapEvent(result.rows[0]) : null;
  if (!event?.active) {
    throw consentError(`${purpose} consent is required`, {
      purpose,
      subjectKind,
      subjectId,
      requiredPolicyVersion: policy.policyVersion,
      requiredNoticeHash: policy.noticeHash,
      latestAction: event?.action ?? null,
    });
  }
  return event;
}

export async function withActiveConsents<T>(
  db: GatewayDb,
  user: CurrentUser,
  requirements: readonly {
    purpose: ConsentPurpose;
    subjectKind: ConsentSubjectKind;
    subjectId: string;
  }[],
  operation: (transaction: GatewayDb) => Promise<T>,
): Promise<T> {
  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    const account = await transaction.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [user.id],
    );
    if (!account.rows[0]) throw Object.assign(new Error("account not found"), { statusCode: 404 });
    for (const requirement of requirements) {
      await assertActiveConsent(
        transaction,
        user,
        requirement.purpose,
        requirement.subjectKind,
        requirement.subjectId,
      );
    }
    return operation(transaction);
  });
}

async function applyWithdrawal(
  db: GatewayDb,
  user: CurrentUser,
  purpose: ConsentPurpose,
  subjectId: string,
): Promise<void> {
  switch (purpose) {
    case "photoscan.processing":
      await db.query(
        `UPDATE jobs SET status = 'cancelled', error = 'photoscan consent withdrawn',
                         last_error_code = 'consent-withdrawn', finished_at = now(),
                         lease_token = NULL, lease_expires_at = NULL
          WHERE owner_user_id = $1 AND kind IN ('photoscan.single', 'photoscan.multiview')
            AND status IN ('queued', 'running')
            AND COALESCE(input -> 'sourceBlobIds', '[]'::jsonb) @> to_jsonb(ARRAY[$2]::text[])`,
        [user.id, subjectId],
      );
      return;
    case "telemetry.sharing":
      await db.query(
        `UPDATE telemetry_logs
            SET privacy = COALESCE(privacy, '{}'::jsonb) || jsonb_build_object(
              'sharing', 'private', 'sharingWithdrawnAt', now()
            )
          WHERE id = $1 AND owner_user_id = $2`,
        [subjectId, user.id],
      );
      return;
    case "pattern.contribution":
      await db.query(
        `DELETE FROM pattern_library
          WHERE owner_user_id = $2 AND source_model_id = $1`,
        [subjectId, user.id],
      );
      return;
    case "leaderboard.publication":
      await db.query(`DELETE FROM leaderboard_runs WHERE user_id = $1`, [user.id]);
      return;
    case "training.reuse":
      await db.query(
        `UPDATE jobs SET status = 'cancelled', error = 'training reuse consent withdrawn',
                         last_error_code = 'consent-withdrawn', finished_at = now(),
                         lease_token = NULL, lease_expires_at = NULL
          WHERE owner_user_id = $1
            AND kind IN ('train.policy', 'train.offline-bc')
            AND status IN ('queued', 'running')
            AND (
              COALESCE(input -> 'telemetryLogIds', '[]'::jsonb) @> to_jsonb(ARRAY[$2]::text[])
              OR input ->> 'telemetryLogId' = $2
            )`,
        [user.id, subjectId],
      );
      return;
  }
}

export async function recordConsent(
  db: GatewayDb,
  user: CurrentUser,
  input: {
    purpose: ConsentPurpose;
    subjectKind: ConsentSubjectKind;
    subjectId: string;
    policyVersion: string;
    noticeHash: string;
    action: ConsentAction;
    locale?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<ConsentEvent> {
  const policy = policyFor(input.purpose);
  if (input.policyVersion !== policy.policyVersion || input.noticeHash !== policy.noticeHash) {
    throw Object.assign(new Error("consent policy version or notice hash is stale"), {
      statusCode: 409,
      requiredPolicyVersion: policy.policyVersion,
      requiredNoticeHash: policy.noticeHash,
    });
  }
  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    const account = await transaction.query<{ id: string }>(
      `SELECT id FROM users WHERE id = $1 FOR UPDATE`,
      [user.id],
    );
    if (!account.rows[0]) throw Object.assign(new Error("account not found"), { statusCode: 404 });
    await assertOwnedSubject(transaction, user, input.purpose, input.subjectKind, input.subjectId);

    if (input.idempotencyKey) {
      const existing = await transaction.query<ConsentRow>(
        `SELECT ${EVENT_COLUMNS} FROM user_consent_events
          WHERE owner_user_id = $1 AND idempotency_key = $2 LIMIT 1`,
        [user.id, input.idempotencyKey],
      );
      if (existing.rows[0]) {
        const event = mapEvent(existing.rows[0]);
        if (
          event.purpose !== input.purpose || event.subjectKind !== input.subjectKind ||
          event.subjectId !== input.subjectId || event.action !== input.action
        ) {
          throw Object.assign(new Error("consent idempotency key was already used for a different event"), { statusCode: 409 });
        }
        return event;
      }
    }

    const previous = await transaction.query<ConsentRow>(
      `SELECT ${EVENT_COLUMNS} FROM user_consent_events
        WHERE owner_user_id = $1 AND purpose = $2 AND subject_kind = $3 AND subject_id = $4
        ORDER BY event_sequence DESC LIMIT 1`,
      [user.id, input.purpose, input.subjectKind, input.subjectId],
    );
    const inserted = await transaction.query<ConsentRow>(
      `INSERT INTO user_consent_events (
         ledger_version, owner_user_id, purpose, subject_kind, subject_id,
         policy_version, notice_hash, action, evidence, idempotency_key, previous_event_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
       RETURNING ${EVENT_COLUMNS}`,
      [
        CONSENT_LEDGER_FORMAT_VERSION,
        user.id,
        input.purpose,
        input.subjectKind,
        input.subjectId,
        input.policyVersion,
        input.noticeHash,
        input.action,
        JSON.stringify({ channel: "api", locale: input.locale ?? null }),
        input.idempotencyKey ?? null,
        previous.rows[0]?.id ?? null,
      ],
    );
    if (input.action === "withdraw") {
      await applyWithdrawal(transaction, user, input.purpose, input.subjectId);
    }
    return mapEvent(inserted.rows[0]);
  });
}

export function telemetryLogIdsFromPayload(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return [];
  const record = payload as Record<string, unknown>;
  const ids = Array.isArray(record.telemetryLogIds)
    ? record.telemetryLogIds.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  if (typeof record.telemetryLogId === "string" && record.telemetryLogId.length > 0) ids.push(record.telemetryLogId);
  return [...new Set(ids)];
}

export function sourceBlobIdsFromPayload(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return [];
  const value = (payload as Record<string, unknown>).sourceBlobIds;
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))]
    : [];
}
