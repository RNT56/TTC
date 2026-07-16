import { createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";
import type { CurrentUser } from "./auth.js";
import { withGatewayTransaction, type GatewayDb } from "./db.js";
import { getOwnedObjectBlob, type ObjectBlobRecord } from "./platform.js";
import {
  RECORDER_ARCHIVE_SCHEMA_VERSION,
  RECORDER_RECEIPT_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  getRecorderArchive,
  type RecorderArchiveMaterialization,
} from "./recorderArchives.js";
import type { ObjectStorageConfig, ObjectStreamAdapter } from "./objectStorage.js";
import { assertBoundedJson } from "./security.js";
import { runRecorderArchiveVerifier, type ValidateResult } from "./validator.js";

export const RECORDER_VERIFICATION_SCHEMA_VERSION = "forge-recorder-verification/1.0.0";
export const RECORDER_ADMISSION_SCHEMA_VERSION = "forge-recorder-admission/1.0.0";
export const RECORDER_TELEMETRY_REFERENCE_SCHEMA_VERSION = "forge-recorder-telemetry-reference/1.0.0";

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const FILES = [
  ["forge-recorder-manifest.json", "manifestBlobId"],
  ["telemetry.frames.jsonl", "frameBlobId"],
  ["telemetry.index.jsonl", "indexBlobId"],
  ["telemetry.replay.json", "replayBlobId"],
  ["forge-recorder-receipt.json", "receiptBlobId"],
] as const;

export interface RecorderVerificationReport {
  schemaVersion: typeof RECORDER_VERIFICATION_SCHEMA_VERSION;
  archiveSchemaVersion: typeof RECORDER_ARCHIVE_SCHEMA_VERSION;
  replaySchemaVersion: typeof REPLAY_SCHEMA_VERSION;
  receiptSchemaVersion: typeof RECORDER_RECEIPT_SCHEMA_VERSION;
  artifactId: string;
  referenceRigId: string;
  contractHash: string;
  lockfileHash: string;
  sourcePortSha256: string;
  sampleRateHz: number;
  startedAtUnixMs: number;
  stoppedAtUnixMs: number;
  frameCount: number;
  durationS: number;
  aggregateByteSize: number;
  frameFileSha256: string;
  indexFileSha256: string;
  replayFileSha256: string;
  captureMaturity: "local-serial-integration";
  archiveSemanticsVerified: true;
  captureComplete: true;
  captureConsentConfirmed: true;
  userOwned: true;
  sharingAuthorized: false;
  trainingReuseAuthorized: false;
  recordedDeviceAttested: false;
  deviceIdentityVerified: false;
  fieldSessionVerified: false;
  noAutoArm: true;
}

export interface RecorderArchiveAdmission {
  id: string;
  ownerUserId: string;
  materializationId: string;
  telemetryLogId: string;
  modelId: string;
  schemaVersion: typeof RECORDER_ADMISSION_SCHEMA_VERSION;
  verification: RecorderVerificationReport;
  replayFileSha256: string;
  frameCount: number;
  durationS: number;
  gatewayArchiveSemanticsVerified: true;
  recordedDeviceAttested: false;
  deviceIdentityVerified: false;
  fieldSessionVerified: false;
  sharingAuthorized: false;
  trainingReuseAuthorized: false;
  noAutoArm: true;
  createdAt: string;
}

interface AdmissionRow {
  id: string;
  owner_user_id: string;
  materialization_id: string;
  telemetry_log_id: string;
  model_id: string;
  schema_version: typeof RECORDER_ADMISSION_SCHEMA_VERSION;
  verification: RecorderVerificationReport;
  replay_file_sha256: string;
  frame_count: string | number;
  duration_s: string | number;
  gateway_archive_semantics_verified: true;
  recorded_device_attested: false;
  device_identity_verified: false;
  field_session_verified: false;
  sharing_authorized: false;
  training_reuse_authorized: false;
  no_auto_arm: true;
  created_at: Date | string;
}

interface AdmissionModelRow {
  id: string;
  status: string;
  contract_hash: string;
  validator_report: unknown;
}

const admissionColumns = `id, owner_user_id, materialization_id, telemetry_log_id, model_id,
  schema_version, verification, replay_file_sha256, frame_count, duration_s,
  gateway_archive_semantics_verified, recorded_device_attested,
  device_identity_verified, field_session_verified, sharing_authorized,
  training_reuse_authorized, no_auto_arm, created_at`;

function mapAdmission(row: AdmissionRow): RecorderArchiveAdmission {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    materializationId: row.materialization_id,
    telemetryLogId: row.telemetry_log_id,
    modelId: row.model_id,
    schemaVersion: row.schema_version,
    verification: row.verification,
    replayFileSha256: row.replay_file_sha256,
    frameCount: Number(row.frame_count),
    durationS: Number(row.duration_s),
    gatewayArchiveSemanticsVerified: true,
    recordedDeviceAttested: false,
    deviceIdentityVerified: false,
    fieldSessionVerified: false,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    noAutoArm: true,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function exactFields(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((field, index) => field === wanted[index]);
}

function validateReport(
  value: unknown,
  materialization: RecorderArchiveMaterialization,
  blobs: Record<(typeof FILES)[number][1], ObjectBlobRecord>,
): RecorderVerificationReport {
  if (!isRecord(value) || !exactFields(value, [
    "schemaVersion", "archiveSchemaVersion", "replaySchemaVersion", "receiptSchemaVersion",
    "artifactId", "referenceRigId", "contractHash", "lockfileHash", "sourcePortSha256",
    "sampleRateHz", "startedAtUnixMs", "stoppedAtUnixMs", "frameCount", "durationS",
    "aggregateByteSize", "frameFileSha256", "indexFileSha256", "replayFileSha256",
    "captureMaturity", "archiveSemanticsVerified", "captureComplete",
    "captureConsentConfirmed", "userOwned", "sharingAuthorized", "trainingReuseAuthorized",
    "recordedDeviceAttested", "deviceIdentityVerified", "fieldSessionVerified", "noAutoArm",
  ])) {
    throw Object.assign(new Error("recorder verifier returned an invalid report contract"), {
      statusCode: 503,
      code: "recorder-verifier-contract-invalid",
    });
  }
  assertBoundedJson(value, "recorder verification report", {
    maxBytes: 64 * 1024,
    maxDepth: 8,
    maxNodes: 256,
    maxObjectKeys: 64,
  });
  const plan = materialization.uploadPlan;
  if (
    value.schemaVersion !== RECORDER_VERIFICATION_SCHEMA_VERSION
    || value.archiveSchemaVersion !== RECORDER_ARCHIVE_SCHEMA_VERSION
    || value.replaySchemaVersion !== REPLAY_SCHEMA_VERSION
    || value.receiptSchemaVersion !== RECORDER_RECEIPT_SCHEMA_VERSION
    || value.artifactId !== plan.artifactId
    || value.referenceRigId !== plan.referenceRigId
    || value.contractHash !== plan.contractHash
    || value.lockfileHash !== plan.lockfileHash
    || value.sourcePortSha256 !== plan.sourcePortSha256
    || value.sampleRateHz !== plan.sampleRateHz
    || value.startedAtUnixMs !== plan.startedAtUnixMs
    || value.stoppedAtUnixMs !== plan.stoppedAtUnixMs
    || value.frameCount !== plan.frameCount
    || value.durationS !== plan.durationS
    || value.aggregateByteSize !== plan.aggregateByteSize
    || value.frameFileSha256 !== blobs.frameBlobId.sha256
    || value.indexFileSha256 !== blobs.indexBlobId.sha256
    || value.replayFileSha256 !== blobs.replayBlobId.sha256
    || value.captureMaturity !== "local-serial-integration"
    || value.archiveSemanticsVerified !== true
    || value.captureComplete !== true
    || value.captureConsentConfirmed !== true
    || value.userOwned !== true
    || value.sharingAuthorized !== false
    || value.trainingReuseAuthorized !== false
    || value.recordedDeviceAttested !== false
    || value.deviceIdentityVerified !== false
    || value.fieldSessionVerified !== false
    || value.noAutoArm !== true
    || !safeInteger(value.sampleRateHz, 1, 1_000)
    || !safeInteger(value.startedAtUnixMs)
    || !safeInteger(value.stoppedAtUnixMs)
    || !safeInteger(value.frameCount, 1, 1_000_000)
    || !safeInteger(value.aggregateByteSize, 1, MAX_ARCHIVE_BYTES)
    || typeof value.durationS !== "number"
    || !Number.isFinite(value.durationS)
    || value.durationS < 0
    || !sha256(value.contractHash)
    || !sha256(value.lockfileHash)
    || !sha256(value.sourcePortSha256)
    || !sha256(value.frameFileSha256)
    || !sha256(value.indexFileSha256)
    || !sha256(value.replayFileSha256)
  ) {
    throw Object.assign(new Error("recorder verification report does not match staged authority"), {
      statusCode: 409,
      code: "recorder-verification-binding-mismatch",
    });
  }
  return value as unknown as RecorderVerificationReport;
}

function requireAdmittedModelProof(
  model: AdmissionModelRow | undefined,
  contractHash: string,
  lockfileHash: string,
): void {
  if (!model) throw Object.assign(new Error("recorder admission model not found"), { statusCode: 404 });
  const validatorReport = isRecord(model.validator_report) ? model.validator_report : null;
  if (
    model.status !== "admitted"
    || model.contract_hash !== contractHash
    || validatorReport?.verdict !== "admitted"
    || validatorReport?.contractHash !== contractHash
    || validatorReport?.lockfileHash !== lockfileHash
  ) {
    throw Object.assign(new Error("recorder archive is not bound to the selected admitted model proof"), {
      statusCode: 409,
    });
  }
}

async function streamPrivateArchive(
  materialization: RecorderArchiveMaterialization,
  user: CurrentUser,
  db: GatewayDb,
  config: ObjectStorageConfig,
  streamObject: ObjectStreamAdapter,
  runVerifier: (archiveDirectory: string) => Promise<ValidateResult>,
): Promise<RecorderVerificationReport> {
  const blobs = {} as Record<(typeof FILES)[number][1], ObjectBlobRecord>;
  const observedBlobIds = new Set<string>();
  for (const [name, property] of FILES) {
    const blob = await getOwnedObjectBlob(db, user, materialization[property]);
    const planned = materialization.uploadPlan.files.find((file) => file.name === name);
    if (
      !blob
      || !planned
      || observedBlobIds.has(blob.id)
      || blob.visibility !== "private"
      || blob.uploadStatus !== "complete"
      || blob.contentType !== planned.contentType
      || blob.byteSize !== planned.byteSize
      || blob.sha256 !== planned.sha256
    ) {
      throw Object.assign(new Error("recorder archive object is not materialized"), {
        statusCode: 409,
        code: "recorder-object-not-materialized",
      });
    }
    observedBlobIds.add(blob.id);
    blobs[property] = blob;
  }

  const root = await mkdtemp(join(tmpdir(), "forge-recorder-admission-"));
  const archiveDirectory = join(root, "archive");
  try {
    await chmod(root, 0o700);
    await mkdir(archiveDirectory, { mode: 0o700 });
    for (const [name, property] of FILES) {
      const blob = blobs[property];
      const planned = materialization.uploadPlan.files.find((file) => file.name === name)!;
      const source = streamObject(config, {
        bucket: blob.bucket,
        objectKey: blob.objectKey,
        byteSize: planned.byteSize,
        sha256: planned.sha256,
        maxBytes: planned.byteSize,
      });
      await pipeline(
        Readable.from(source, { objectMode: false }),
        createWriteStream(join(archiveDirectory, name), { flags: "wx", mode: 0o600 }),
      );
    }
    const result = await runVerifier(archiveDirectory);
    if (result.exitCode !== 0 || result.report == null) {
      throw Object.assign(new Error("recorder archive failed sovereign archive-v1 verification"), {
        statusCode: result.exitCode === -1 ? 503 : 409,
        code: result.exitCode === -1 ? "recorder-verifier-unavailable" : "recorder-archive-semantics-invalid",
        cause: result.stderr.slice(0, 4_096),
      });
    }
    return validateReport(result.report, materialization, blobs);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function getRecorderArchiveAdmission(
  db: GatewayDb,
  user: CurrentUser,
  materializationId: string,
): Promise<RecorderArchiveAdmission | null> {
  const result = await db.query<AdmissionRow>(
    `SELECT ${admissionColumns} FROM recorder_archive_admissions
      WHERE materialization_id = $1 AND owner_user_id = $2 LIMIT 1`,
    [materializationId, user.id],
  );
  return result.rows[0] ? mapAdmission(result.rows[0]) : null;
}

export async function admitRecorderArchive(
  db: GatewayDb,
  user: CurrentUser,
  materializationId: string,
  modelId: string,
  config: ObjectStorageConfig,
  streamObject: ObjectStreamAdapter,
  runVerifier: (archiveDirectory: string) => Promise<ValidateResult> = runRecorderArchiveVerifier,
): Promise<RecorderArchiveAdmission> {
  const materialization = await getRecorderArchive(db, user, materializationId);
  if (!materialization) {
    throw Object.assign(new Error("recorder archive materialization not found"), { statusCode: 404 });
  }
  if (materialization.status !== "materialized" || !materialization.gatewayObjectIntegrityVerified) {
    throw Object.assign(new Error("recorder archive must complete object materialization before admission"), {
      statusCode: 409,
    });
  }
  const existing = await getRecorderArchiveAdmission(db, user, materializationId);
  if (existing) {
    if (existing.modelId !== modelId) {
      throw Object.assign(new Error("recorder archive is already admitted for a different model"), { statusCode: 409 });
    }
    return existing;
  }

  const preflightModel = (await db.query<AdmissionModelRow>(
    `SELECT id, status, contract_hash, validator_report FROM model_registry
      WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [modelId, user.id],
  )).rows[0];
  requireAdmittedModelProof(
    preflightModel,
    materialization.uploadPlan.contractHash,
    materialization.uploadPlan.lockfileHash,
  );

  const verification = await streamPrivateArchive(
    materialization,
    user,
    db,
    config,
    streamObject,
    runVerifier,
  );
  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    const locked = await transaction.query<{ id: string }>(
      `SELECT id FROM recorder_archive_materializations
        WHERE id = $1 AND owner_user_id = $2 AND status = 'materialized'
          AND gateway_object_integrity_verified = true
        FOR UPDATE`,
      [materializationId, user.id],
    );
    if (!locked.rows[0]) {
      throw Object.assign(new Error("recorder materialization changed during admission"), { statusCode: 409 });
    }
    const concurrent = await transaction.query<AdmissionRow>(
      `SELECT ${admissionColumns} FROM recorder_archive_admissions
        WHERE materialization_id = $1 AND owner_user_id = $2 LIMIT 1`,
      [materializationId, user.id],
    );
    if (concurrent.rows[0]) {
      const admission = mapAdmission(concurrent.rows[0]);
      if (admission.modelId !== modelId) {
        throw Object.assign(new Error("recorder archive is already admitted for a different model"), { statusCode: 409 });
      }
      return admission;
    }
    const model = (await transaction.query<AdmissionModelRow>(
      `SELECT id, status, contract_hash, validator_report FROM model_registry
        WHERE id = $1 AND owner_user_id = $2 LIMIT 1 FOR UPDATE`,
      [modelId, user.id],
    )).rows[0];
    requireAdmittedModelProof(model, verification.contractHash, verification.lockfileHash);

    const admissionId = `raa-${randomBytes(10).toString("hex")}`;
    const tape = {
      schemaVersion: RECORDER_TELEMETRY_REFERENCE_SCHEMA_VERSION,
      storage: "object-backed",
      admissionId,
      materializationId,
      replayBlobId: materialization.replayBlobId,
      archiveSchemaVersion: verification.archiveSchemaVersion,
      replaySchemaVersion: verification.replaySchemaVersion,
      contractHash: verification.contractHash,
      lockfileHash: verification.lockfileHash,
      replayFileSha256: verification.replayFileSha256,
      aggregateByteSize: verification.aggregateByteSize,
      frameCount: verification.frameCount,
      durationS: verification.durationS,
      gatewayArchiveSemanticsVerified: true,
      recordedDeviceAttested: false,
      deviceIdentityVerified: false,
      fieldSessionVerified: false,
      sharingAuthorized: false,
      trainingReuseAuthorized: false,
      noAutoArm: true,
    };
    const privacy = {
      sharing: "private",
      captureConsentConfirmed: true,
      userOwned: true,
      sharingAuthorized: false,
      trainingReuseAuthorized: false,
    };
    const telemetry = await transaction.query<{ id: string }>(
      `INSERT INTO telemetry_logs (owner_user_id, model_id, source, captured_at, tape, privacy)
       VALUES ($1, $2, 'desktop', $3, $4::jsonb, $5::jsonb) RETURNING id`,
      [user.id, modelId, new Date(verification.startedAtUnixMs), JSON.stringify(tape), JSON.stringify(privacy)],
    );
    const telemetryLogId = telemetry.rows[0]?.id;
    if (!telemetryLogId) throw new Error("recorder telemetry admission did not return an id");
    const inserted = await transaction.query<AdmissionRow>(
      `INSERT INTO recorder_archive_admissions (
         id, owner_user_id, materialization_id, telemetry_log_id, model_id,
         verification, replay_file_sha256, frame_count, duration_s
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
       RETURNING ${admissionColumns}`,
      [admissionId, user.id, materializationId, telemetryLogId, modelId,
        JSON.stringify(verification), verification.replayFileSha256,
        verification.frameCount, verification.durationS],
    );
    if (!inserted.rows[0]) throw new Error("recorder archive admission did not persist");
    return mapAdmission(inserted.rows[0]);
  });
}
