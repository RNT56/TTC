import { createHash, randomUUID } from "node:crypto";
import type { GatewayDb } from "./db.js";
import { withGatewayTransaction } from "./db.js";

export const DATA_LIFECYCLE_FORMAT_VERSION = "1.0.0";
export const RETENTION_POLICY_VERSION = "1.0.0";
export const BACKUP_MAX_DAYS = 30;
export const TOMBSTONE_DAYS = 45;
export const LEGAL_HOLD_MAX_DAYS = 365;
export const BACKUP_DELETE_LEASE_MINUTES = 15;

export const RETENTION_POLICIES = [
  {
    dataClass: "user-content",
    primaryRule: "account-lifetime-or-owner-deletion",
    primaryRetentionDays: null,
    backupMaxDays: BACKUP_MAX_DAYS,
    tombstoneDays: TOMBSTONE_DAYS,
    legalBasis: "contract-or-consent-until-owner-deletion; explicit current legal hold may defer",
  },
  {
    dataClass: "consent-history",
    primaryRule: "account-lifetime-or-owner-deletion",
    primaryRetentionDays: null,
    backupMaxDays: BACKUP_MAX_DAYS,
    tombstoneDays: TOMBSTONE_DAYS,
    legalBasis: "accountability while account exists; explicit current legal hold may defer",
  },
  {
    dataClass: "safety-refusal-audit",
    primaryRule: "expire-after-created-at",
    primaryRetentionDays: 90,
    backupMaxDays: BACKUP_MAX_DAYS,
    tombstoneDays: TOMBSTONE_DAYS,
    legalBasis: "bounded safety and abuse prevention audit",
  },
  {
    dataClass: "auth-operational",
    primaryRule: "expire-after-native-expiry",
    primaryRetentionDays: 30,
    backupMaxDays: BACKUP_MAX_DAYS,
    tombstoneDays: TOMBSTONE_DAYS,
    legalBasis: "security and authentication operations",
  },
  {
    dataClass: "job-operational",
    primaryRule: "expire-after-terminal-at",
    primaryRetentionDays: 30,
    backupMaxDays: BACKUP_MAX_DAYS,
    tombstoneDays: TOMBSTONE_DAYS,
    legalBasis: "service operation and incident diagnosis",
  },
  {
    dataClass: "lifecycle-audit",
    primaryRule: "expire-after-created-at",
    primaryRetentionDays: 400,
    backupMaxDays: BACKUP_MAX_DAYS,
    tombstoneDays: TOMBSTONE_DAYS,
    legalBasis: "pseudonymous accountability evidence for deletion and restore suppression",
  },
] as const;

export type LifecycleSubjectKind = "user" | "object" | "audit";
export type LegalHoldReason = "litigation" | "regulatory" | "security-incident" | "billing-dispute";

export function digestLifecycleSubject(kind: LifecycleSubjectKind, subjectId: string): string {
  if (!subjectId.trim()) throw Object.assign(new Error("lifecycle subject ID is required"), { statusCode: 400 });
  return createHash("sha256").update(`${kind}:${subjectId}`, "utf8").digest("hex");
}

function boundedReference(value: string, field: string, max = 200, min = 3): string {
  if (!/^[a-zA-Z0-9._:/-]+$/.test(value) || value.length < min || value.length > max) {
    throw Object.assign(new Error(`${field} must be a bounded opaque reference`), { statusCode: 400 });
  }
  return value;
}

function lifecycleId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

async function lockLifecycleSubjectDigest(
  db: GatewayDb,
  subjectKind: LifecycleSubjectKind,
  subjectDigest: string,
): Promise<void> {
  await db.query(
    `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`forgedttc-lifecycle:${subjectKind}:${subjectDigest}`],
  );
}

async function lockLifecycleSubject(
  db: GatewayDb,
  subjectKind: LifecycleSubjectKind,
  subjectId: string,
): Promise<void> {
  await lockLifecycleSubjectDigest(db, subjectKind, digestLifecycleSubject(subjectKind, subjectId));
}

type HoldRow = {
  id: string;
  hold_key: string;
  action: "place" | "release";
  subject_kind: LifecycleSubjectKind;
  subject_digest: string;
  reason_code: LegalHoldReason;
  authority_reference: string;
  jurisdiction: string;
  evidence_reference: string;
  expires_at: Date | string;
  idempotency_key: string;
  previous_event_id: string | null;
  event_sequence: number | string;
  created_at: Date | string;
};

export interface LegalHoldEvent {
  id: string;
  holdKey: string;
  action: "place" | "release";
  subjectKind: LifecycleSubjectKind;
  subjectDigest: string;
  reasonCode: LegalHoldReason;
  authorityReference: string;
  jurisdiction: string;
  evidenceReference: string;
  expiresAt: string;
  previousEventId: string | null;
  eventSequence: string;
  createdAt: string;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapHold(row: HoldRow): LegalHoldEvent {
  return {
    id: row.id,
    holdKey: row.hold_key,
    action: row.action,
    subjectKind: row.subject_kind,
    subjectDigest: row.subject_digest,
    reasonCode: row.reason_code,
    authorityReference: row.authority_reference,
    jurisdiction: row.jurisdiction,
    evidenceReference: row.evidence_reference,
    expiresAt: iso(row.expires_at),
    previousEventId: row.previous_event_id,
    eventSequence: String(row.event_sequence),
    createdAt: iso(row.created_at),
  };
}

const HOLD_COLUMNS = `id, hold_key, action, subject_kind, subject_digest, reason_code,
  authority_reference, jurisdiction, evidence_reference, expires_at, idempotency_key,
  previous_event_id, event_sequence, created_at`;

export async function recordLegalHold(
  db: GatewayDb,
  input: {
    action: "place" | "release";
    holdKey: string;
    subjectKind: LifecycleSubjectKind;
    subjectId: string;
    reasonCode: LegalHoldReason;
    authorityReference: string;
    jurisdiction: string;
    evidenceReference: string;
    expiresAt?: string;
    idempotencyKey: string;
    now?: Date;
  },
): Promise<LegalHoldEvent> {
  const now = input.now ?? new Date();
  const holdKey = boundedReference(input.holdKey, "holdKey", 120);
  const authorityReference = boundedReference(input.authorityReference, "authorityReference", 160);
  const evidenceReference = boundedReference(input.evidenceReference, "evidenceReference");
  const jurisdiction = boundedReference(input.jurisdiction, "jurisdiction", 35, 2);
  const idempotencyKey = boundedReference(input.idempotencyKey, "idempotencyKey", 160);
  const subjectDigest = digestLifecycleSubject(input.subjectKind, input.subjectId);

  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    await lockLifecycleSubject(transaction, input.subjectKind, input.subjectId);
    const existing = await transaction.query<HoldRow>(
      `SELECT ${HOLD_COLUMNS} FROM legal_hold_events WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      const event = mapHold(existing.rows[0]);
      if (
        event.action !== input.action || event.holdKey !== holdKey ||
        event.subjectKind !== input.subjectKind || event.subjectDigest !== subjectDigest
      ) {
        throw Object.assign(new Error("legal-hold idempotency key was reused"), { statusCode: 409 });
      }
      return event;
    }

    const previous = await transaction.query<HoldRow>(
      `SELECT ${HOLD_COLUMNS} FROM legal_hold_events
        WHERE hold_key = $1 AND subject_kind = $2 AND subject_digest = $3
        ORDER BY event_sequence DESC LIMIT 1 FOR UPDATE`,
      [holdKey, input.subjectKind, subjectDigest],
    );
    if (input.action === "release" && (!previous.rows[0] || previous.rows[0].action !== "place")) {
      throw Object.assign(new Error("legal hold is not active"), { statusCode: 409 });
    }

    const expiresAt = input.action === "release"
      ? new Date(previous.rows[0].expires_at)
      : new Date(input.expiresAt ?? "");
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      throw Object.assign(new Error("legal hold expiry must be in the future"), { statusCode: 400 });
    }
    if (expiresAt > addDays(now, LEGAL_HOLD_MAX_DAYS)) {
      throw Object.assign(new Error(`legal hold requires review within ${LEGAL_HOLD_MAX_DAYS} days`), { statusCode: 400 });
    }

    const inserted = await transaction.query<HoldRow>(
      `INSERT INTO legal_hold_events (
         lifecycle_version, hold_key, action, subject_kind, subject_digest, reason_code,
         authority_reference, jurisdiction, evidence_reference, expires_at,
         idempotency_key, previous_event_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${HOLD_COLUMNS}`,
      [
        DATA_LIFECYCLE_FORMAT_VERSION,
        holdKey,
        input.action,
        input.subjectKind,
        subjectDigest,
        input.reasonCode,
        authorityReference,
        jurisdiction,
        evidenceReference,
        expiresAt.toISOString(),
        idempotencyKey,
        previous.rows[0]?.id ?? null,
        now.toISOString(),
      ],
    );
    return mapHold(inserted.rows[0]);
  });
}

export async function activeLegalHolds(
  db: GatewayDb,
  subjectKind: LifecycleSubjectKind,
  subjectId: string,
  now = new Date(),
): Promise<LegalHoldEvent[]> {
  const subjectDigest = digestLifecycleSubject(subjectKind, subjectId);
  const result = await db.query<HoldRow>(
    `SELECT ${HOLD_COLUMNS} FROM (
       SELECT DISTINCT ON (hold_key) ${HOLD_COLUMNS}
         FROM legal_hold_events
        WHERE subject_kind = $1 AND subject_digest = $2
        ORDER BY hold_key, event_sequence DESC
     ) latest
     WHERE action = 'place' AND expires_at > $3
     ORDER BY event_sequence`,
    [subjectKind, subjectDigest, now.toISOString()],
  );
  return result.rows.map(mapHold);
}

export async function accountLifecycleStatus(
  db: GatewayDb,
  userId: string,
  now = new Date(),
): Promise<{
  lifecycleVersion: typeof DATA_LIFECYCLE_FORMAT_VERSION;
  policyVersion: typeof RETENTION_POLICY_VERSION;
  activeLegalHoldCount: number;
  cataloguedBackupCount: number;
  latestBackupDeleteAfter: string | null;
}> {
  const objectRows = await db.query<{ bucket: string; object_key: string }>(
    `SELECT bucket, object_key FROM object_blobs
      WHERE owner_user_id = $1 ORDER BY bucket, object_key`,
    [userId],
  );
  const holds = await activeLegalHolds(db, "user", userId, now);
  for (const object of objectRows.rows) {
    holds.push(...await activeLegalHolds(db, "object", `${object.bucket}/${object.object_key}`, now));
  }
  const backup = await db.query<{ backup_count: number; latest_delete_after: Date | string | null }>(
    `SELECT count(DISTINCT b.id)::int AS backup_count, max(b.delete_after) AS latest_delete_after
       FROM backup_records b
       JOIN backup_subjects s ON s.backup_id = b.id
      WHERE b.status <> 'deleted'
        AND (
          (s.subject_kind = 'user' AND s.subject_digest = $1)
          OR (
            s.subject_kind = 'object' AND s.subject_digest IN (
              SELECT encode(digest('object:' || bucket || '/' || object_key, 'sha256'), 'hex')
                FROM object_blobs WHERE owner_user_id = $2
            )
          )
        )`,
    [digestLifecycleSubject("user", userId), userId],
  );
  return {
    lifecycleVersion: DATA_LIFECYCLE_FORMAT_VERSION,
    policyVersion: RETENTION_POLICY_VERSION,
    activeLegalHoldCount: holds.length,
    cataloguedBackupCount: Number(backup.rows[0]?.backup_count ?? 0),
    latestBackupDeleteAfter: backup.rows[0]?.latest_delete_after ? iso(backup.rows[0].latest_delete_after) : null,
  };
}

function legalHoldError(holdCount: number): Error {
  return Object.assign(new Error("account deletion is deferred by an active legal hold"), {
    name: "LegalHoldActiveError",
    statusCode: 423,
    code: "LEGAL_HOLD_ACTIVE",
    details: {
      policyVersion: RETENTION_POLICY_VERSION,
      activeHoldCount: holdCount,
      reviewRequired: true,
    },
  });
}

export function lifecycleErrorResponse(error: unknown): { statusCode: number; body: unknown } | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  if (error.code !== "LEGAL_HOLD_ACTIVE" && error.code !== "TOMBSTONE_RESTORE_BLOCKED") return null;
  const statusCode = "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 409;
  const message = "message" in error && typeof error.message === "string" ? error.message : "lifecycle authority blocked";
  const details = "details" in error && typeof error.details === "object" && error.details ? error.details : {};
  return { statusCode, body: { error: message, code: error.code, ...details } };
}

export interface AccountDeletionLifecycle {
  deletionId: string;
  userDigest: string;
  tombstoneId: string;
  backupDeleteAfter: string;
  tombstoneExpiresAt: string;
  objectTombstoneCount: number;
}

export async function prepareAccountDeletionLifecycle(
  db: GatewayDb,
  input: {
    userId: string;
    objectKeys: readonly { bucket: string; objectKey: string }[];
    deletionId: string;
    now: Date;
  },
): Promise<AccountDeletionLifecycle> {
  const objectIds = [...new Set(input.objectKeys.map((object) => `${object.bucket}/${object.objectKey}`))].sort();
  const lockedSubjects = [
    { kind: "user" as const, id: input.userId },
    ...objectIds.map((id) => ({ kind: "object" as const, id })),
  ].sort((a, b) => {
    const aKey = `${a.kind}:${digestLifecycleSubject(a.kind, a.id)}`;
    const bKey = `${b.kind}:${digestLifecycleSubject(b.kind, b.id)}`;
    return aKey.localeCompare(bKey);
  });
  for (const subject of lockedSubjects) await lockLifecycleSubject(db, subject.kind, subject.id);

  const holds = await activeLegalHolds(db, "user", input.userId, input.now);
  for (const objectId of objectIds) {
    holds.push(...await activeLegalHolds(db, "object", objectId, input.now));
  }
  if (holds.length > 0) throw legalHoldError(holds.length);

  const userDigest = digestLifecycleSubject("user", input.userId);
  const backupDeleteAfter = addDays(input.now, BACKUP_MAX_DAYS);
  const tombstoneExpiresAt = addDays(input.now, TOMBSTONE_DAYS);
  const tombstoneId = lifecycleId("tmb");
  await db.query(
    `INSERT INTO deletion_tombstones (
       id, lifecycle_version, deletion_id, subject_kind, subject_digest,
       primary_deleted_at, backup_delete_after, tombstone_expires_at
     ) VALUES ($1, $2, $3, 'user', $4, $5, $6, $7)`,
    [
      tombstoneId,
      DATA_LIFECYCLE_FORMAT_VERSION,
      input.deletionId,
      userDigest,
      input.now.toISOString(),
      backupDeleteAfter.toISOString(),
      tombstoneExpiresAt.toISOString(),
    ],
  );

  for (const object of input.objectKeys) {
    await db.query(
      `INSERT INTO deletion_tombstones (
         id, lifecycle_version, deletion_id, subject_kind, subject_digest,
         primary_deleted_at, backup_delete_after, tombstone_expires_at
       ) VALUES ($1, $2, $3, 'object', $4, $5, $6, $7)`,
      [
        lifecycleId("tmb"),
        DATA_LIFECYCLE_FORMAT_VERSION,
        input.deletionId,
        digestLifecycleSubject("object", `${object.bucket}/${object.objectKey}`),
        input.now.toISOString(),
        backupDeleteAfter.toISOString(),
        tombstoneExpiresAt.toISOString(),
      ],
    );
  }
  await db.query(
    `INSERT INTO data_lifecycle_events (
       lifecycle_version, event_type, subject_kind, subject_digest,
       actor_kind, reason_code, evidence_reference, details, created_at
     ) VALUES ($1, 'deletion-primary-complete', 'user', $2, 'owner',
               'owner-account-deletion', $3, $4::jsonb, $5)`,
    [
      DATA_LIFECYCLE_FORMAT_VERSION,
      userDigest,
      input.deletionId,
      JSON.stringify({ objectTombstoneCount: input.objectKeys.length }),
      input.now.toISOString(),
    ],
  );
  return {
    deletionId: input.deletionId,
    userDigest,
    tombstoneId,
    backupDeleteAfter: backupDeleteAfter.toISOString(),
    tombstoneExpiresAt: tombstoneExpiresAt.toISOString(),
    objectTombstoneCount: input.objectKeys.length,
  };
}

export async function recordLegalHoldBlockedDeletion(
  db: GatewayDb,
  userId: string,
  now = new Date(),
): Promise<void> {
  await db.query(
    `INSERT INTO data_lifecycle_events (
       lifecycle_version, event_type, subject_kind, subject_digest,
       actor_kind, reason_code, details, created_at
     ) VALUES ($1, 'legal-hold-blocked', 'user', $2, 'owner',
               'active-legal-hold', '{}'::jsonb, $3)`,
    [DATA_LIFECYCLE_FORMAT_VERSION, digestLifecycleSubject("user", userId), now.toISOString()],
  );
}

export interface BackupRecord {
  id: string;
  provider: string;
  externalReference: string;
  manifestSha256: string;
  capturedAt: string;
  deleteAfter: string;
  status: "available" | "deleting" | "deleted" | "delete-failed";
  deletedAt: string | null;
}

type BackupRow = {
  id: string;
  provider: string;
  external_reference: string;
  manifest_sha256: string;
  captured_at: Date | string;
  delete_after: Date | string;
  status: BackupRecord["status"];
  deleted_at: Date | string | null;
};

function mapBackup(row: BackupRow): BackupRecord {
  return {
    id: row.id,
    provider: row.provider,
    externalReference: row.external_reference,
    manifestSha256: row.manifest_sha256,
    capturedAt: iso(row.captured_at),
    deleteAfter: iso(row.delete_after),
    status: row.status,
    deletedAt: row.deleted_at ? iso(row.deleted_at) : null,
  };
}

const BACKUP_COLUMNS = `id, provider, external_reference, manifest_sha256,
  captured_at, delete_after, status, deleted_at`;

async function reconcileBackupSubjectsWithTombstones(
  db: GatewayDb,
  backup: BackupRecord,
  subjects: Iterable<{ kind: LifecycleSubjectKind; digest: string }>,
): Promise<void> {
  for (const subject of subjects) {
    const tombstone = await db.query<{
      id: string;
      primary_deleted_at: Date | string;
      tombstone_expires_at: Date | string;
    }>(
      `SELECT id, primary_deleted_at, tombstone_expires_at
         FROM deletion_tombstones
        WHERE subject_kind = $1 AND subject_digest = $2
        FOR UPDATE`,
      [subject.kind, subject.digest],
    );
    for (const row of tombstone.rows) {
      if (new Date(backup.capturedAt).getTime() > new Date(iso(row.primary_deleted_at)).getTime()) {
        throw Object.assign(new Error("backup subject was captured after primary deletion"), { statusCode: 409 });
      }
      if (new Date(backup.deleteAfter).getTime() > new Date(iso(row.tombstone_expires_at)).getTime()) {
        throw Object.assign(new Error("backup deletion deadline exceeds the restore-suppression window"), { statusCode: 409 });
      }
      if (backup.status !== "deleted") {
        await db.query(
          `UPDATE deletion_tombstones SET backup_deleted_at = NULL WHERE id = $1`,
          [row.id],
        );
      }
    }
  }
}

export async function registerBackup(
  db: GatewayDb,
  input: {
    provider: string;
    externalReference: string;
    manifestSha256: string;
    capturedAt: string;
    deleteAfter: string;
    subjects: readonly { kind: LifecycleSubjectKind; id: string }[];
    now?: Date;
  },
): Promise<BackupRecord> {
  const provider = boundedReference(input.provider, "provider", 80);
  const externalReference = boundedReference(input.externalReference, "externalReference");
  if (!/^[0-9a-f]{64}$/.test(input.manifestSha256)) {
    throw Object.assign(new Error("backup manifest SHA-256 is invalid"), { statusCode: 400 });
  }
  const now = input.now ?? new Date();
  const capturedAt = new Date(input.capturedAt);
  const deleteAfter = new Date(input.deleteAfter);
  if (Number.isNaN(capturedAt.getTime()) || Number.isNaN(deleteAfter.getTime()) || deleteAfter <= capturedAt) {
    throw Object.assign(new Error("backup capture/delete timestamps are invalid"), { statusCode: 400 });
  }
  if (deleteAfter > addDays(capturedAt, BACKUP_MAX_DAYS)) {
    throw Object.assign(new Error(`backup retention exceeds ${BACKUP_MAX_DAYS} days`), { statusCode: 400 });
  }
  if (capturedAt > new Date(now.getTime() + 5 * 60_000)) {
    throw Object.assign(new Error("backup capture time is in the future"), { statusCode: 400 });
  }
  if (input.subjects.length === 0) {
    throw Object.assign(new Error("backup subject manifest is required"), { statusCode: 400 });
  }
  const uniqueSubjects = new Map(
    input.subjects.map((subject) => [
      `${subject.kind}:${digestLifecycleSubject(subject.kind, subject.id)}`,
      { kind: subject.kind, id: subject.id, digest: digestLifecycleSubject(subject.kind, subject.id) },
    ]),
  );
  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    const orderedSubjects = [...uniqueSubjects.values()]
      .sort((a, b) => `${a.kind}:${a.digest}`.localeCompare(`${b.kind}:${b.digest}`));
    for (const subject of orderedSubjects) {
      await lockLifecycleSubjectDigest(transaction, subject.kind, subject.digest);
    }
    const existing = await transaction.query<BackupRow>(
      `SELECT ${BACKUP_COLUMNS} FROM backup_records
        WHERE provider = $1 AND external_reference = $2 LIMIT 1 FOR UPDATE`,
      [provider, externalReference],
    );
    if (existing.rows[0]) {
      if (
        existing.rows[0].manifest_sha256 !== input.manifestSha256 ||
        iso(existing.rows[0].captured_at) !== capturedAt.toISOString() ||
        iso(existing.rows[0].delete_after) !== deleteAfter.toISOString()
      ) {
        throw Object.assign(new Error("backup reference was reused with different metadata"), { statusCode: 409 });
      }
      const existingSubjects = await transaction.query<{ subject_kind: LifecycleSubjectKind; subject_digest: string }>(
        `SELECT subject_kind, subject_digest FROM backup_subjects
          WHERE backup_id = $1 ORDER BY subject_kind, subject_digest`,
        [existing.rows[0].id],
      );
      const expectedSubjects = [...uniqueSubjects.values()]
        .map((subject) => `${subject.kind}:${subject.digest}`)
        .sort();
      const actualSubjects = existingSubjects.rows
        .map((subject) => `${subject.subject_kind}:${subject.subject_digest}`)
        .sort();
      if (JSON.stringify(actualSubjects) !== JSON.stringify(expectedSubjects)) {
        throw Object.assign(new Error("backup reference was reused with a different subject manifest"), { statusCode: 409 });
      }
      const backup = mapBackup(existing.rows[0]);
      await reconcileBackupSubjectsWithTombstones(transaction, backup, uniqueSubjects.values());
      return backup;
    }

    const id = lifecycleId("bkp");
    const inserted = await transaction.query<BackupRow>(
      `INSERT INTO backup_records (
         id, lifecycle_version, provider, external_reference, manifest_sha256,
         captured_at, delete_after, status, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'available', $8, $8)
       RETURNING ${BACKUP_COLUMNS}`,
      [
        id,
        DATA_LIFECYCLE_FORMAT_VERSION,
        provider,
        externalReference,
        input.manifestSha256,
        capturedAt.toISOString(),
        deleteAfter.toISOString(),
        now.toISOString(),
      ],
    );
    for (const subject of uniqueSubjects.values()) {
      await transaction.query(
        `INSERT INTO backup_subjects (backup_id, subject_kind, subject_digest)
         VALUES ($1, $2, $3)`,
        [id, subject.kind, subject.digest],
      );
    }
    await transaction.query(
      `INSERT INTO data_lifecycle_events (
         lifecycle_version, event_type, subject_kind, subject_digest,
         actor_kind, reason_code, evidence_reference, details, created_at
       ) VALUES ($1, 'backup-registered', 'backup', $2, 'operator',
                 'catalogued-backup', $3, $4::jsonb, $5)`,
      [
        DATA_LIFECYCLE_FORMAT_VERSION,
        createHash("sha256").update(`backup:${id}`).digest("hex"),
        externalReference,
        JSON.stringify({ subjectCount: uniqueSubjects.size }),
        now.toISOString(),
      ],
    );
    const backup = mapBackup(inserted.rows[0]);
    await reconcileBackupSubjectsWithTombstones(transaction, backup, uniqueSubjects.values());
    return backup;
  });
}

export interface RestoreEvaluation {
  restoreTestId: string;
  backupId: string;
  result: "eligible" | "blocked";
  blockedSubjectCount: number;
}

export async function evaluateRestoreCandidate(
  db: GatewayDb,
  input: {
    backupId: string;
    manifestSha256: string;
    evidenceReference: string;
    now?: Date;
  },
): Promise<RestoreEvaluation> {
  const evidenceReference = boundedReference(input.evidenceReference, "evidenceReference");
  const now = input.now ?? new Date();
  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    const subjects = await transaction.query<{ subject_kind: LifecycleSubjectKind; subject_digest: string }>(
      `SELECT subject_kind, subject_digest FROM backup_subjects
        WHERE backup_id = $1 ORDER BY subject_kind, subject_digest`,
      [input.backupId],
    );
    for (const subject of subjects.rows) {
      await lockLifecycleSubjectDigest(transaction, subject.subject_kind, subject.subject_digest);
    }
    const backup = await transaction.query<BackupRow>(
      `SELECT ${BACKUP_COLUMNS} FROM backup_records WHERE id = $1 FOR UPDATE`,
      [input.backupId],
    );
    const row = backup.rows[0];
    if (!row) throw Object.assign(new Error("backup record not found"), { statusCode: 404 });
    if (row.manifest_sha256 !== input.manifestSha256) {
      throw Object.assign(new Error("backup manifest checksum mismatch"), { statusCode: 409 });
    }
    if (row.status !== "available" || new Date(iso(row.delete_after)) <= now) {
      throw Object.assign(new Error("backup is not eligible for restore"), { statusCode: 409 });
    }
    const blocked = await transaction.query<{ subject_kind: string; subject_digest: string }>(
      `SELECT DISTINCT s.subject_kind, s.subject_digest
         FROM backup_subjects s
         JOIN deletion_tombstones t
           ON t.subject_kind = s.subject_kind AND t.subject_digest = s.subject_digest
        WHERE s.backup_id = $1 AND t.tombstone_expires_at > $2
        ORDER BY s.subject_kind, s.subject_digest`,
      [input.backupId, now.toISOString()],
    );
    const result = blocked.rows.length > 0 ? "blocked" : "eligible";
    const restoreTestId = lifecycleId("rst");
    await transaction.query(
      `INSERT INTO backup_restore_tests (
         id, lifecycle_version, backup_id, manifest_sha256, result,
         blocked_subject_count, evidence_reference, tested_at, details
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        restoreTestId,
        DATA_LIFECYCLE_FORMAT_VERSION,
        input.backupId,
        input.manifestSha256,
        result,
        blocked.rows.length,
        evidenceReference,
        now.toISOString(),
        JSON.stringify({ tombstoneFilterApplied: true }),
      ],
    );
    await transaction.query(
      `INSERT INTO data_lifecycle_events (
         lifecycle_version, event_type, subject_kind, subject_digest,
         actor_kind, reason_code, evidence_reference, details, created_at
       ) VALUES ($1, $2, 'backup', $3, 'operator', $4, $5, $6::jsonb, $7)`,
      [
        DATA_LIFECYCLE_FORMAT_VERSION,
        result === "blocked" ? "restore-blocked" : "restore-eligible",
        createHash("sha256").update(`backup:${input.backupId}`).digest("hex"),
        result === "blocked" ? "active-deletion-tombstone" : "tombstone-check-passed",
        evidenceReference,
        JSON.stringify({ blockedSubjectCount: blocked.rows.length }),
        now.toISOString(),
      ],
    );
    return { restoreTestId, backupId: input.backupId, result, blockedSubjectCount: blocked.rows.length };
  });
}

export type BackupDeletionAdapter = (backup: BackupRecord) => Promise<void>;

export async function deleteExpiredBackups(
  db: GatewayDb,
  deleteBackup: BackupDeletionAdapter,
  now = new Date(),
  limit = 50,
): Promise<{ deleted: string[]; failed: string[] }> {
  const due = await db.query<BackupRow>(
    `SELECT ${BACKUP_COLUMNS} FROM backup_records
      WHERE delete_after <= $1
        AND (status IN ('available', 'delete-failed')
          OR (status = 'deleting'
            AND updated_at <= $1::timestamptz - interval '${BACKUP_DELETE_LEASE_MINUTES} minutes'))
      ORDER BY delete_after, id LIMIT $2`,
    [now.toISOString(), Math.max(1, Math.min(limit, 200))],
  );
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const candidate of due.rows) {
    const claimed = await db.query<BackupRow>(
      `UPDATE backup_records SET status = 'deleting', last_error_code = NULL, updated_at = $2
        WHERE id = $1
          AND (status IN ('available', 'delete-failed')
            OR (status = 'deleting'
              AND updated_at <= $2::timestamptz - interval '${BACKUP_DELETE_LEASE_MINUTES} minutes'))
        RETURNING ${BACKUP_COLUMNS}`,
      [candidate.id, now.toISOString()],
    );
    if (!claimed.rows[0]) continue;
    const backup = mapBackup(claimed.rows[0]);
    try {
      await deleteBackup(backup);
      await withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
        await transaction.query(
          `UPDATE backup_records
              SET status = 'deleted', deleted_at = $2, last_error_code = NULL, updated_at = $2
            WHERE id = $1 AND status = 'deleting'`,
          [backup.id, now.toISOString()],
        );
        await transaction.query(
          `UPDATE deletion_tombstones t SET backup_deleted_at = $2
            WHERE backup_deleted_at IS NULL
              AND EXISTS (
                SELECT 1 FROM backup_subjects s
                 WHERE s.backup_id = $1
                   AND s.subject_kind = t.subject_kind
                   AND s.subject_digest = t.subject_digest
              )
              AND NOT EXISTS (
                SELECT 1 FROM backup_subjects s2
                JOIN backup_records b2 ON b2.id = s2.backup_id
                 WHERE s2.subject_kind = t.subject_kind
                   AND s2.subject_digest = t.subject_digest
                   AND b2.status <> 'deleted'
              )`,
          [backup.id, now.toISOString()],
        );
        await transaction.query(
          `INSERT INTO data_lifecycle_events (
             lifecycle_version, event_type, subject_kind, subject_digest,
             actor_kind, reason_code, evidence_reference, details, created_at
           ) VALUES ($1, 'backup-deleted', 'backup', $2, 'system',
                     'retention-expiry', $3, '{}'::jsonb, $4)`,
          [
            DATA_LIFECYCLE_FORMAT_VERSION,
            createHash("sha256").update(`backup:${backup.id}`).digest("hex"),
            backup.externalReference,
            now.toISOString(),
          ],
        );
      });
      deleted.push(backup.id);
    } catch (error) {
      const errorCode = error instanceof Error && error.name ? error.name.slice(0, 120) : "BackupDeleteError";
      await db.query(
        `UPDATE backup_records
            SET status = 'delete-failed', last_error_code = $2, updated_at = $3
          WHERE id = $1 AND status = 'deleting'`,
        [backup.id, errorCode, now.toISOString()],
      );
      await db.query(
        `INSERT INTO data_lifecycle_events (
           lifecycle_version, event_type, subject_kind, subject_digest,
           actor_kind, reason_code, evidence_reference, details, created_at
         ) VALUES ($1, 'backup-delete-failed', 'backup', $2, 'system',
                   'adapter-failure', $3, $4::jsonb, $5)`,
        [
          DATA_LIFECYCLE_FORMAT_VERSION,
          createHash("sha256").update(`backup:${backup.id}`).digest("hex"),
          backup.externalReference,
          JSON.stringify({ errorCode }),
          now.toISOString(),
        ],
      );
      failed.push(backup.id);
    }
  }
  return { deleted, failed };
}

export async function runPrimaryRetentionSweep(
  db: GatewayDb,
  input: { now?: Date; execute?: boolean; evidenceReference?: string } = {},
): Promise<Record<string, number>> {
  const now = input.now ?? new Date();
  const execute = input.execute ?? false;
  const queries = [
    {
      key: "expiredSessions",
      count: `SELECT count(*)::int AS n FROM sessions WHERE expires <= $1`,
      remove: `DELETE FROM sessions WHERE expires <= $1`,
    },
    {
      key: "expiredVerificationTokens",
      count: `SELECT count(*)::int AS n FROM verification_token WHERE expires <= $1`,
      remove: `DELETE FROM verification_token WHERE expires <= $1`,
    },
    {
      key: "expiredRefusalAudits",
      count: `SELECT count(*)::int AS n FROM generation_refusals r
               WHERE r.created_at <= $1::timestamptz - interval '90 days'
                 AND NOT EXISTS (
                   SELECT 1 FROM (
                     SELECT DISTINCT ON (subject_kind, subject_digest, hold_key)
                            action, subject_kind, subject_digest, expires_at
                       FROM legal_hold_events
                      WHERE subject_kind IN ('user', 'audit')
                      ORDER BY subject_kind, subject_digest, hold_key, event_sequence DESC
                   ) h
                  WHERE h.action = 'place' AND h.expires_at > $1
                    AND (
                      (h.subject_kind = 'user'
                       AND h.subject_digest = encode(digest('user:' || r.owner_user_id, 'sha256'), 'hex'))
                      OR (h.subject_kind = 'audit'
                          AND h.subject_digest = encode(digest('audit:generation-refusal/' || r.id, 'sha256'), 'hex'))
                    )
                 )`,
      remove: `DELETE FROM generation_refusals r
               WHERE r.created_at <= $1::timestamptz - interval '90 days'
                 AND NOT EXISTS (
                   SELECT 1 FROM (
                     SELECT DISTINCT ON (subject_kind, subject_digest, hold_key)
                            action, subject_kind, subject_digest, expires_at
                       FROM legal_hold_events
                      WHERE subject_kind IN ('user', 'audit')
                      ORDER BY subject_kind, subject_digest, hold_key, event_sequence DESC
                   ) h
                  WHERE h.action = 'place' AND h.expires_at > $1
                    AND (
                      (h.subject_kind = 'user'
                       AND h.subject_digest = encode(digest('user:' || r.owner_user_id, 'sha256'), 'hex'))
                      OR (h.subject_kind = 'audit'
                          AND h.subject_digest = encode(digest('audit:generation-refusal/' || r.id, 'sha256'), 'hex'))
                    )
                 )`,
    },
    {
      key: "expiredJobs",
      count: `SELECT count(*)::int AS n FROM jobs j
               WHERE j.status IN ('succeeded', 'failed', 'cancelled')
                 AND COALESCE(j.finished_at, j.created_at) <= $1::timestamptz - interval '30 days'
                 AND NOT EXISTS (
                   SELECT 1 FROM (
                     SELECT DISTINCT ON (subject_kind, subject_digest, hold_key)
                            action, subject_kind, subject_digest, expires_at
                       FROM legal_hold_events
                      WHERE subject_kind IN ('user', 'audit')
                      ORDER BY subject_kind, subject_digest, hold_key, event_sequence DESC
                   ) h
                  WHERE h.action = 'place' AND h.expires_at > $1
                    AND (
                      (h.subject_kind = 'user'
                       AND h.subject_digest = encode(digest('user:' || j.owner_user_id, 'sha256'), 'hex'))
                      OR (h.subject_kind = 'audit'
                          AND h.subject_digest = encode(digest('audit:job/' || j.id, 'sha256'), 'hex'))
                    )
                 )`,
      remove: `DELETE FROM jobs j
               WHERE j.status IN ('succeeded', 'failed', 'cancelled')
                 AND COALESCE(j.finished_at, j.created_at) <= $1::timestamptz - interval '30 days'
                 AND NOT EXISTS (
                   SELECT 1 FROM (
                     SELECT DISTINCT ON (subject_kind, subject_digest, hold_key)
                            action, subject_kind, subject_digest, expires_at
                       FROM legal_hold_events
                      WHERE subject_kind IN ('user', 'audit')
                      ORDER BY subject_kind, subject_digest, hold_key, event_sequence DESC
                   ) h
                  WHERE h.action = 'place' AND h.expires_at > $1
                    AND (
                      (h.subject_kind = 'user'
                       AND h.subject_digest = encode(digest('user:' || j.owner_user_id, 'sha256'), 'hex'))
                      OR (h.subject_kind = 'audit'
                          AND h.subject_digest = encode(digest('audit:job/' || j.id, 'sha256'), 'hex'))
                    )
                 )`,
    },
  ] as const;

  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    const counts: Record<string, number> = {};
    for (const query of queries) {
      if (execute) {
        const result = await transaction.query(query.remove, [now.toISOString()]);
        counts[query.key] = result.rowCount ?? 0;
      } else {
        const result = await transaction.query<{ n: number }>(query.count, [now.toISOString()]);
        counts[query.key] = Number(result.rows[0]?.n ?? 0);
      }
    }
    const expiredHoldEvents = await transaction.query<{ id: string }>(
      `WITH latest AS (
         SELECT DISTINCT ON (subject_kind, subject_digest, hold_key)
                subject_kind, subject_digest, hold_key, action, expires_at
           FROM legal_hold_events
          ORDER BY subject_kind, subject_digest, hold_key, event_sequence DESC
       ), aged AS (
         SELECT subject_kind, subject_digest, hold_key
           FROM legal_hold_events
          GROUP BY subject_kind, subject_digest, hold_key
         HAVING max(created_at) <= $1::timestamptz - interval '400 days'
       )
       SELECT event.id
         FROM legal_hold_events event
         JOIN aged USING (subject_kind, subject_digest, hold_key)
         JOIN latest USING (subject_kind, subject_digest, hold_key)
        WHERE NOT (latest.action = 'place' AND latest.expires_at > $1)
        ORDER BY event.event_sequence DESC`,
      [now.toISOString()],
    );
    counts.expiredLegalHoldEvents = expiredHoldEvents.rows.length;

    const expiredRestoreTests = await transaction.query<{ id: string }>(
      `SELECT test.id
         FROM backup_restore_tests test
        WHERE test.tested_at <= $1::timestamptz - interval '400 days'
          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT DISTINCT ON (subject_digest, hold_key)
                     action, subject_digest, expires_at
                FROM legal_hold_events
               WHERE subject_kind = 'audit'
               ORDER BY subject_digest, hold_key, event_sequence DESC
            ) hold
           WHERE hold.action = 'place' AND hold.expires_at > $1
             AND hold.subject_digest = encode(
               digest('audit:backup-restore/' || test.id, 'sha256'), 'hex'
             )
          )
        ORDER BY test.tested_at, test.id`,
      [now.toISOString()],
    );
    counts.expiredBackupRestoreTests = expiredRestoreTests.rows.length;

    const expiredBackupRecords = await transaction.query<{ id: string }>(
      `WITH active_audit_holds AS (
         SELECT subject_digest
           FROM (
             SELECT DISTINCT ON (subject_digest, hold_key)
                    action, subject_digest, expires_at
               FROM legal_hold_events
              WHERE subject_kind = 'audit'
              ORDER BY subject_digest, hold_key, event_sequence DESC
           ) latest
          WHERE action = 'place' AND expires_at > $1
       )
       SELECT backup.id
         FROM backup_records backup
        WHERE backup.status = 'deleted'
          AND backup.deleted_at <= $1::timestamptz - interval '400 days'
          AND NOT EXISTS (
            SELECT 1 FROM active_audit_holds hold
             WHERE hold.subject_digest = encode(
               digest('audit:backup/' || backup.id, 'sha256'), 'hex'
             )
          )
          AND NOT EXISTS (
            SELECT 1 FROM backup_restore_tests test
             WHERE test.backup_id = backup.id
               AND (
                 test.tested_at > $1::timestamptz - interval '400 days'
                 OR EXISTS (
                   SELECT 1 FROM active_audit_holds hold
                    WHERE hold.subject_digest = encode(
                      digest('audit:backup-restore/' || test.id, 'sha256'), 'hex'
                    )
                 )
               )
          )
        ORDER BY backup.deleted_at, backup.id`,
      [now.toISOString()],
    );
    counts.expiredBackupRecords = expiredBackupRecords.rows.length;

    const expiredLifecycleEvents = await transaction.query<{ id: string }>(
      `SELECT event.id
         FROM data_lifecycle_events event
        WHERE event.created_at <= $1::timestamptz - interval '400 days'
          AND NOT EXISTS (
            SELECT 1 FROM (
              SELECT DISTINCT ON (subject_digest, hold_key)
                     action, subject_digest, expires_at
                FROM legal_hold_events
               WHERE subject_kind = 'audit'
               ORDER BY subject_digest, hold_key, event_sequence DESC
            ) hold
           WHERE hold.action = 'place' AND hold.expires_at > $1
             AND hold.subject_digest = encode(
               digest('audit:lifecycle-event/' || event.id, 'sha256'), 'hex'
             )
          )
        ORDER BY event.created_at, event.id`,
      [now.toISOString()],
    );
    counts.expiredLifecycleEvents = expiredLifecycleEvents.rows.length;

    if (execute) {
      for (const event of expiredHoldEvents.rows) {
        await transaction.query(`DELETE FROM legal_hold_events WHERE id = $1`, [event.id]);
      }
      if (expiredRestoreTests.rows.length > 0) {
        await transaction.query(
          `DELETE FROM backup_restore_tests WHERE id = ANY($1::text[])`,
          [expiredRestoreTests.rows.map((row) => row.id)],
        );
      }
      if (expiredBackupRecords.rows.length > 0) {
        await transaction.query(
          `DELETE FROM backup_records WHERE id = ANY($1::text[])`,
          [expiredBackupRecords.rows.map((row) => row.id)],
        );
      }
      if (expiredLifecycleEvents.rows.length > 0) {
        await transaction.query(
          `DELETE FROM data_lifecycle_events WHERE id = ANY($1::text[])`,
          [expiredLifecycleEvents.rows.map((row) => row.id)],
        );
      }
      const finalized = await transaction.query(
        `UPDATE deletion_tombstones t SET backup_deleted_at = $1
          WHERE backup_deleted_at IS NULL AND backup_delete_after <= $1
            AND NOT EXISTS (
              SELECT 1 FROM backup_subjects s
              JOIN backup_records b ON b.id = s.backup_id
               WHERE s.subject_kind = t.subject_kind
                 AND s.subject_digest = t.subject_digest
                 AND b.status <> 'deleted'
            )`,
        [now.toISOString()],
      );
      counts.finalizedTombstones = finalized.rowCount ?? 0;
      const expiredTombstones = await transaction.query(
        `DELETE FROM deletion_tombstones
          WHERE backup_deleted_at IS NOT NULL AND tombstone_expires_at <= $1`,
        [now.toISOString()],
      );
      counts.expiredTombstones = expiredTombstones.rowCount ?? 0;
      await transaction.query(
        `INSERT INTO data_lifecycle_events (
           lifecycle_version, event_type, subject_kind, subject_digest,
           actor_kind, reason_code, evidence_reference, details, created_at
         ) VALUES ($1, 'retention-sweep', NULL, NULL, 'system',
                   'scheduled-retention', $2, $3::jsonb, $4)`,
        [
          DATA_LIFECYCLE_FORMAT_VERSION,
          input.evidenceReference ? boundedReference(input.evidenceReference, "evidenceReference") : null,
          JSON.stringify(counts),
          now.toISOString(),
        ],
      );
    } else {
      const finalizable = await transaction.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM deletion_tombstones t
          WHERE backup_deleted_at IS NULL AND backup_delete_after <= $1
            AND NOT EXISTS (
              SELECT 1 FROM backup_subjects s
              JOIN backup_records b ON b.id = s.backup_id
               WHERE s.subject_kind = t.subject_kind
                 AND s.subject_digest = t.subject_digest
                 AND b.status <> 'deleted'
            )`,
        [now.toISOString()],
      );
      counts.finalizedTombstones = Number(finalizable.rows[0]?.n ?? 0);
      const expiredTombstones = await transaction.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM deletion_tombstones
          WHERE backup_deleted_at IS NOT NULL AND tombstone_expires_at <= $1`,
        [now.toISOString()],
      );
      counts.expiredTombstones = Number(expiredTombstones.rows[0]?.n ?? 0);
    }
    return counts;
  });
}
