import { createHash } from "node:crypto";
import type { CurrentUser } from "./auth.js";
import { withGatewayTransaction, type GatewayDb } from "./db.js";
import {
  completeObjectBlobUpload,
  getOwnedObjectBlob,
  registerObjectBlob,
  type ObjectBlobRecord,
} from "./platform.js";
import type {
  ObjectInspectionAdapter,
  ObjectReadAdapter,
  ObjectStorageConfig,
} from "./objectStorage.js";
import { assertBoundedJson } from "./security.js";

export const RECORDER_MATERIALIZATION_SCHEMA_VERSION = "forge-recorder-materialization/1.0.0";
export const RECORDER_UPLOAD_PLAN_SCHEMA_VERSION = "forge-recorder-upload-plan/1.0.0";
export const RECORDER_ARCHIVE_SCHEMA_VERSION = "forge-recorder-archive/1.0.0";
export const RECORDER_INSPECTION_SCHEMA_VERSION = "forge-recorder-inspection/1.0.0";
export const RECORDER_RECEIPT_SCHEMA_VERSION = "forge-recorder-receipt/1.0.0";
export const RECORDER_FRAME_SCHEMA_VERSION = "forge-telemetry-frame/1.0.0";
export const REPLAY_SCHEMA_VERSION = "1.0.0";

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_FRAMES = 1_000_000;
const D12_RIGS = new Set([
  "ref_quad_kakute-h7-source-one-5in",
  "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
]);
const FILES = [
  ["forge-recorder-manifest.json", "application/json", "manifest"],
  ["telemetry.frames.jsonl", "application/x-ndjson", "frame"],
  ["telemetry.index.jsonl", "application/x-ndjson", "index"],
  ["telemetry.replay.json", "application/json", "replay"],
  ["forge-recorder-receipt.json", "application/json", "receipt"],
] as const;

type RecorderFileName = (typeof FILES)[number][0];
type RecorderFileRole = (typeof FILES)[number][2];

export interface RecorderUploadFilePlan {
  name: RecorderFileName;
  contentType: string;
  byteSize: number;
  sha256: string;
}

export interface RecorderUploadPlanInput {
  schemaVersion: string;
  archiveSchemaVersion: string;
  inspectionSchemaVersion: string;
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
  captureMaturity: string;
  aggregateByteSize: number;
  files: RecorderUploadFilePlan[];
  localIntegrityVerified: boolean;
  captureComplete: boolean;
  captureConsentConfirmed: boolean;
  userOwned: boolean;
  sharingAuthorized: boolean;
  trainingReuseAuthorized: boolean;
  recordedDeviceAttested: boolean;
  deviceIdentityVerified: boolean;
  fieldSessionVerified: boolean;
  noAutoArm: boolean;
}

export interface RecorderArchiveMaterialization {
  id: string;
  ownerUserId: string;
  artifactId: string;
  schemaVersion: typeof RECORDER_MATERIALIZATION_SCHEMA_VERSION;
  status: "staged" | "materialized";
  manifestBlobId: string;
  frameBlobId: string;
  indexBlobId: string;
  replayBlobId: string;
  receiptBlobId: string;
  uploadPlan: RecorderUploadPlanInput;
  aggregateByteSize: number;
  gatewayObjectIntegrityVerified: boolean;
  gatewayArchiveSemanticsVerified: false;
  recordedDeviceAttested: false;
  deviceIdentityVerified: false;
  fieldSessionVerified: false;
  sharingAuthorized: false;
  trainingReuseAuthorized: false;
  noAutoArm: true;
  verificationErrorCode: string | null;
  createdAt: string;
  materializedAt: string | null;
}

interface MaterializationRow {
  id: string;
  owner_user_id: string;
  artifact_id: string;
  schema_version: typeof RECORDER_MATERIALIZATION_SCHEMA_VERSION;
  status: "staged" | "materialized";
  manifest_blob_id: string;
  frame_blob_id: string;
  index_blob_id: string;
  replay_blob_id: string;
  receipt_blob_id: string;
  upload_plan: RecorderUploadPlanInput;
  aggregate_byte_size: string | number;
  gateway_object_integrity_verified: boolean;
  gateway_archive_semantics_verified: false;
  recorded_device_attested: false;
  device_identity_verified: false;
  field_session_verified: false;
  sharing_authorized: false;
  training_reuse_authorized: false;
  no_auto_arm: true;
  verification_error_code: string | null;
  created_at: Date | string;
  materialized_at: Date | string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
  statusCode = 400,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((field, index) => field !== wanted[index])) {
    throw Object.assign(new Error(`${label} fields do not match the recorder-v1 contract`), { statusCode });
  }
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function mapRow(row: MaterializationRow): RecorderArchiveMaterialization {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    artifactId: row.artifact_id,
    schemaVersion: row.schema_version,
    status: row.status,
    manifestBlobId: row.manifest_blob_id,
    frameBlobId: row.frame_blob_id,
    indexBlobId: row.index_blob_id,
    replayBlobId: row.replay_blob_id,
    receiptBlobId: row.receipt_blob_id,
    uploadPlan: row.upload_plan,
    aggregateByteSize: Number(row.aggregate_byte_size),
    gatewayObjectIntegrityVerified: row.gateway_object_integrity_verified,
    gatewayArchiveSemanticsVerified: false,
    recordedDeviceAttested: false,
    deviceIdentityVerified: false,
    fieldSessionVerified: false,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    noAutoArm: true,
    verificationErrorCode: row.verification_error_code,
    createdAt: new Date(row.created_at).toISOString(),
    materializedAt: row.materialized_at == null ? null : new Date(row.materialized_at).toISOString(),
  };
}

const rowColumns = `id, owner_user_id, artifact_id, schema_version, status,
  manifest_blob_id, frame_blob_id, index_blob_id, replay_blob_id, receipt_blob_id,
  upload_plan, aggregate_byte_size, gateway_object_integrity_verified,
  gateway_archive_semantics_verified, recorded_device_attested,
  device_identity_verified, field_session_verified, sharing_authorized,
  training_reuse_authorized, no_auto_arm, verification_error_code,
  created_at, materialized_at`;

export function validateRecorderUploadPlan(value: unknown): RecorderUploadPlanInput {
  if (!isRecord(value)) throw Object.assign(new Error("recorder upload plan must be an object"), { statusCode: 400 });
  exactFields(value, [
    "schemaVersion", "archiveSchemaVersion", "inspectionSchemaVersion", "artifactId",
    "referenceRigId", "contractHash", "lockfileHash", "sourcePortSha256", "sampleRateHz",
    "startedAtUnixMs", "stoppedAtUnixMs", "frameCount", "durationS", "captureMaturity",
    "aggregateByteSize", "files", "localIntegrityVerified", "captureComplete",
    "captureConsentConfirmed", "userOwned", "sharingAuthorized", "trainingReuseAuthorized",
    "recordedDeviceAttested", "deviceIdentityVerified", "fieldSessionVerified", "noAutoArm",
  ], "recorder upload plan");
  assertBoundedJson(value, "recorder upload plan", {
    maxBytes: 64 * 1024,
    maxDepth: 8,
    maxNodes: 512,
    maxObjectKeys: 128,
  });
  if (
    value.schemaVersion !== RECORDER_UPLOAD_PLAN_SCHEMA_VERSION
    || value.archiveSchemaVersion !== RECORDER_ARCHIVE_SCHEMA_VERSION
    || value.inspectionSchemaVersion !== RECORDER_INSPECTION_SCHEMA_VERSION
  ) throw Object.assign(new Error("recorder upload plan declares an unsupported version"), { statusCode: 400 });
  if (typeof value.artifactId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value.artifactId)) {
    throw Object.assign(new Error("recorder upload artifactId is invalid"), { statusCode: 400 });
  }
  if (typeof value.referenceRigId !== "string" || !D12_RIGS.has(value.referenceRigId)) {
    throw Object.assign(new Error("recorder upload referenceRigId is not a frozen D12 rig"), { statusCode: 400 });
  }
  if (!isSha256(value.contractHash) || !isSha256(value.lockfileHash) || !isSha256(value.sourcePortSha256)) {
    throw Object.assign(new Error("recorder upload identity hashes are invalid"), { statusCode: 400 });
  }
  if (!safeInteger(value.sampleRateHz, 1, 1_000)
    || !safeInteger(value.startedAtUnixMs)
    || !safeInteger(value.stoppedAtUnixMs)
    || Number(value.stoppedAtUnixMs) < Number(value.startedAtUnixMs)
    || !safeInteger(value.frameCount, 1, MAX_FRAMES)
    || typeof value.durationS !== "number" || !Number.isFinite(value.durationS)
    || value.durationS < 0 || value.durationS > Number.MAX_SAFE_INTEGER
  ) throw Object.assign(new Error("recorder upload time, rate, count, or duration is invalid"), { statusCode: 400 });
  if (value.captureMaturity !== "local-serial-integration") {
    throw Object.assign(new Error("recorder upload maturity authority has drifted"), { statusCode: 400 });
  }
  if (
    value.localIntegrityVerified !== true || value.captureComplete !== true
    || value.captureConsentConfirmed !== true || value.userOwned !== true
    || value.sharingAuthorized !== false || value.trainingReuseAuthorized !== false
    || value.recordedDeviceAttested !== false || value.deviceIdentityVerified !== false
    || value.fieldSessionVerified !== false || value.noAutoArm !== true
  ) throw Object.assign(new Error("recorder upload authority flags have drifted"), { statusCode: 400 });
  if (!Array.isArray(value.files) || value.files.length !== FILES.length) {
    throw Object.assign(new Error("recorder upload plan requires exactly five files"), { statusCode: 400 });
  }
  const byName = new Map<string, RecorderUploadFilePlan>();
  for (const raw of value.files) {
    if (!isRecord(raw)) throw Object.assign(new Error("recorder upload file must be an object"), { statusCode: 400 });
    exactFields(raw, ["name", "contentType", "byteSize", "sha256"], "recorder upload file");
    if (typeof raw.name !== "string" || typeof raw.contentType !== "string"
      || !safeInteger(raw.byteSize, 1, MAX_ARCHIVE_BYTES) || !isSha256(raw.sha256)
    ) throw Object.assign(new Error("recorder upload file declaration is invalid"), { statusCode: 400 });
    if (byName.has(raw.name)) throw Object.assign(new Error("recorder upload filenames must be unique"), { statusCode: 400 });
    byName.set(raw.name, raw as unknown as RecorderUploadFilePlan);
  }
  let aggregate = 0;
  for (const [name, contentType] of FILES) {
    const file = byName.get(name);
    if (!file || file.contentType !== contentType) {
      throw Object.assign(new Error("recorder upload file names or content types have drifted"), { statusCode: 400 });
    }
    if ((name === "forge-recorder-manifest.json" || name === "forge-recorder-receipt.json")
      && file.byteSize > MAX_METADATA_BYTES
    ) throw Object.assign(new Error("recorder upload metadata file exceeds the v1 cap"), { statusCode: 400 });
    aggregate += file.byteSize;
  }
  if (!safeInteger(value.aggregateByteSize, 1, MAX_ARCHIVE_BYTES) || value.aggregateByteSize !== aggregate) {
    throw Object.assign(new Error("recorder upload aggregate size is invalid"), { statusCode: 400 });
  }
  return value as unknown as RecorderUploadPlanInput;
}

function fileCacheKey(user: CurrentUser, plan: RecorderUploadPlanInput, file: RecorderUploadFilePlan): string {
  return createHash("sha256")
    .update("forge-recorder-materialization-v1\0")
    .update(user.id).update("\0").update(plan.artifactId).update("\0")
    .update(file.name).update("\0").update(file.sha256)
    .digest("hex");
}

function roleBlobIds(blobs: Map<string, ObjectBlobRecord>): Record<RecorderFileRole, string> {
  const result = {} as Record<RecorderFileRole, string>;
  for (const [name, , role] of FILES) result[role] = blobs.get(name)!.id;
  return result;
}

export async function stageRecorderArchive(
  db: GatewayDb,
  user: CurrentUser,
  planValue: unknown,
  bucket: string,
): Promise<{ materialization: RecorderArchiveMaterialization; blobs: ObjectBlobRecord[] }> {
  const plan = validateRecorderUploadPlan(planValue);
  return withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
    const blobs = new Map<string, ObjectBlobRecord>();
    for (const [name, , role] of FILES) {
      const file = plan.files.find((candidate) => candidate.name === name)!;
      blobs.set(name, await registerObjectBlob(transaction, user, {
        bucket,
        purpose: `recorder-v1-${role}`,
        contentType: file.contentType,
        byteSize: file.byteSize,
        sha256: file.sha256,
        cacheKey: fileCacheKey(user, plan, file),
        metadata: {
          purpose: `recorder-v1-${role}`,
          originalName: name,
          artifactId: plan.artifactId,
          uploadPlanSchemaVersion: RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
        },
      }));
    }
    const ids = roleBlobIds(blobs);
    const inserted = await transaction.query<MaterializationRow>(
      `INSERT INTO recorder_archive_materializations (
         owner_user_id, artifact_id, manifest_blob_id, frame_blob_id, index_blob_id,
         replay_blob_id, receipt_blob_id, upload_plan, aggregate_byte_size
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
       ON CONFLICT (owner_user_id, artifact_id) DO NOTHING
       RETURNING ${rowColumns}`,
      [user.id, plan.artifactId, ids.manifest, ids.frame, ids.index, ids.replay, ids.receipt,
        JSON.stringify(plan), plan.aggregateByteSize],
    );
    const existing = inserted.rows[0] ?? (await transaction.query<MaterializationRow>(
      `SELECT ${rowColumns} FROM recorder_archive_materializations
        WHERE owner_user_id = $1 AND artifact_id = $2 FOR UPDATE`,
      [user.id, plan.artifactId],
    )).rows[0];
    if (!existing
      || existing.manifest_blob_id !== ids.manifest || existing.frame_blob_id !== ids.frame
      || existing.index_blob_id !== ids.index || existing.replay_blob_id !== ids.replay
      || existing.receipt_blob_id !== ids.receipt
      || stableJson(existing.upload_plan) !== stableJson(plan)
    ) throw Object.assign(new Error("recorder artifactId is already bound to different materialization evidence"), { statusCode: 409 });
    return { materialization: mapRow(existing), blobs: FILES.map(([name]) => blobs.get(name)!) };
  });
}

export async function getRecorderArchive(
  db: GatewayDb,
  user: CurrentUser,
  id: string,
): Promise<RecorderArchiveMaterialization | null> {
  const result = await db.query<MaterializationRow>(
    `SELECT ${rowColumns} FROM recorder_archive_materializations
      WHERE id = $1 AND owner_user_id = $2 LIMIT 1`,
    [id, user.id],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function listRecorderArchives(
  db: GatewayDb,
  user: CurrentUser,
  limit: number,
): Promise<RecorderArchiveMaterialization[]> {
  const result = await db.query<MaterializationRow>(
    `SELECT ${rowColumns} FROM recorder_archive_materializations
      WHERE owner_user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [user.id, limit],
  );
  return result.rows.map(mapRow);
}

function parseStrictJson(bytes: Uint8Array, label: string, expectedFields: readonly string[]): Record<string, unknown> {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_METADATA_BYTES || bytes[bytes.byteLength - 1] !== 0x0a) {
    throw Object.assign(new Error(`recorder ${label} is outside the bounded newline-terminated metadata contract`), { statusCode: 409 });
  }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw Object.assign(new Error(`recorder ${label} is not strict UTF-8 JSON`), { statusCode: 409 }); }
  if (!isRecord(value)) throw Object.assign(new Error(`recorder ${label} must be an object`), { statusCode: 409 });
  exactFields(value, expectedFields, `recorder ${label}`, 409);
  assertBoundedJson(value, `recorder ${label}`, {
    maxBytes: MAX_METADATA_BYTES,
    maxDepth: 32,
    maxNodes: 4_096,
    maxObjectKeys: 256,
  });
  return value;
}

function verifyManifestReceiptBindings(
  plan: RecorderUploadPlanInput,
  blobs: Record<RecorderFileRole, ObjectBlobRecord>,
  manifestBytes: Uint8Array,
  receiptBytes: Uint8Array,
): void {
  const manifest = parseStrictJson(manifestBytes, "manifest", [
    "schemaVersion", "replaySchemaVersion", "frameSchemaVersion", "receiptSchemaVersion",
    "artifactId", "referenceRigId", "sampleRateHz", "startedAtUnixMs", "contractHash",
    "lockfileHash", "environment", "seed", "sourceKind", "sourcePortSha256", "sourceBaud",
    "captureMaturity", "recordedDeviceAttested", "frameFile", "indexFile", "replayFile",
    "receiptFile", "captureConsentConfirmed", "userOwned", "sharingAuthorized",
    "trainingReuseAuthorized", "noAutoArm",
  ]);
  const receipt = parseStrictJson(receiptBytes, "receipt", [
    "schemaVersion", "archiveSchemaVersion", "replaySchemaVersion", "frameSchemaVersion",
    "artifactId", "referenceRigId", "contractHash", "lockfileHash", "startedAtUnixMs",
    "stoppedAtUnixMs", "frameCount", "durationS", "frameFileSha256", "indexFileSha256",
    "replayFileSha256", "sourcePortSha256", "captureComplete", "captureMaturity",
    "captureConsentConfirmed", "recordedDeviceAttested", "userOwned", "sharingAuthorized",
    "trainingReuseAuthorized", "noAutoArm",
  ]);
  if (manifest.schemaVersion !== RECORDER_ARCHIVE_SCHEMA_VERSION
    || manifest.replaySchemaVersion !== REPLAY_SCHEMA_VERSION
    || manifest.frameSchemaVersion !== RECORDER_FRAME_SCHEMA_VERSION
    || manifest.receiptSchemaVersion !== RECORDER_RECEIPT_SCHEMA_VERSION
    || manifest.artifactId !== plan.artifactId || manifest.referenceRigId !== plan.referenceRigId
    || manifest.sampleRateHz !== plan.sampleRateHz || manifest.startedAtUnixMs !== plan.startedAtUnixMs
    || manifest.contractHash !== plan.contractHash || manifest.lockfileHash !== plan.lockfileHash
    || manifest.sourceKind !== "serial-jsonl" || manifest.sourcePortSha256 !== plan.sourcePortSha256
    || manifest.sourceBaud !== 115_200 || manifest.captureMaturity !== "local-serial-integration"
    || manifest.recordedDeviceAttested !== false || manifest.frameFile !== FILES[1][0]
    || manifest.indexFile !== FILES[2][0] || manifest.replayFile !== FILES[3][0]
    || manifest.receiptFile !== FILES[4][0] || manifest.captureConsentConfirmed !== true
    || manifest.userOwned !== true || manifest.sharingAuthorized !== false
    || manifest.trainingReuseAuthorized !== false || manifest.noAutoArm !== true
    || !isRecord(manifest.environment) || !safeInteger(manifest.seed)
  ) throw Object.assign(new Error("recorder manifest does not match the staged upload authority"), { statusCode: 409 });
  if (receipt.schemaVersion !== RECORDER_RECEIPT_SCHEMA_VERSION
    || receipt.archiveSchemaVersion !== RECORDER_ARCHIVE_SCHEMA_VERSION
    || receipt.replaySchemaVersion !== REPLAY_SCHEMA_VERSION
    || receipt.frameSchemaVersion !== RECORDER_FRAME_SCHEMA_VERSION
    || receipt.artifactId !== plan.artifactId || receipt.referenceRigId !== plan.referenceRigId
    || receipt.contractHash !== plan.contractHash || receipt.lockfileHash !== plan.lockfileHash
    || receipt.startedAtUnixMs !== plan.startedAtUnixMs || receipt.stoppedAtUnixMs !== plan.stoppedAtUnixMs
    || receipt.frameCount !== plan.frameCount || receipt.durationS !== plan.durationS
    || receipt.frameFileSha256 !== blobs.frame.sha256 || receipt.indexFileSha256 !== blobs.index.sha256
    || receipt.replayFileSha256 !== blobs.replay.sha256 || receipt.sourcePortSha256 !== plan.sourcePortSha256
    || receipt.captureComplete !== true || receipt.captureMaturity !== "local-serial-integration"
    || receipt.captureConsentConfirmed !== true || receipt.recordedDeviceAttested !== false
    || receipt.userOwned !== true || receipt.sharingAuthorized !== false
    || receipt.trainingReuseAuthorized !== false || receipt.noAutoArm !== true
  ) throw Object.assign(new Error("recorder receipt does not match the staged object authority"), { statusCode: 409 });
}

function rowBlobIds(row: RecorderArchiveMaterialization): Record<RecorderFileRole, string> {
  return {
    manifest: row.manifestBlobId,
    frame: row.frameBlobId,
    index: row.indexBlobId,
    replay: row.replayBlobId,
    receipt: row.receiptBlobId,
  };
}

export async function completeRecorderArchive(
  db: GatewayDb,
  user: CurrentUser,
  id: string,
  config: ObjectStorageConfig,
  inspectObject: ObjectInspectionAdapter,
  readObject: ObjectReadAdapter,
): Promise<RecorderArchiveMaterialization> {
  const materialization = await getRecorderArchive(db, user, id);
  if (!materialization) throw Object.assign(new Error("recorder archive materialization not found"), { statusCode: 404 });
  const ids = rowBlobIds(materialization);
  const blobs = {} as Record<RecorderFileRole, ObjectBlobRecord>;
  try {
    for (const [, contentType, role] of FILES) {
      const blob = await getOwnedObjectBlob(db, user, ids[role]);
      if (!blob || blob.contentType !== contentType || blob.byteSize === null || blob.sha256 === null) {
        throw Object.assign(new Error("recorder archive blob declaration has drifted"), { statusCode: 409, code: "recorder-blob-drift" });
      }
      const inspection = await inspectObject(config, { bucket: blob.bucket, objectKey: blob.objectKey });
      blobs[role] = await completeObjectBlobUpload(db, user, blob.id, inspection);
    }
    const manifest = blobs.manifest;
    const receipt = blobs.receipt;
    const [manifestBytes, receiptBytes] = await Promise.all([
      readObject(config, { bucket: manifest.bucket, objectKey: manifest.objectKey, byteSize: manifest.byteSize!, sha256: manifest.sha256!, maxBytes: MAX_METADATA_BYTES }),
      readObject(config, { bucket: receipt.bucket, objectKey: receipt.objectKey, byteSize: receipt.byteSize!, sha256: receipt.sha256!, maxBytes: MAX_METADATA_BYTES }),
    ]);
    verifyManifestReceiptBindings(materialization.uploadPlan, blobs, manifestBytes, receiptBytes);
    const result = await withGatewayTransaction(db, { isolation: "serializable" }, async (transaction) => {
      const updated = await transaction.query<MaterializationRow>(
        `UPDATE recorder_archive_materializations
            SET status = 'materialized', gateway_object_integrity_verified = true,
                verification_error_code = NULL, materialized_at = COALESCE(materialized_at, now())
          WHERE id = $1 AND owner_user_id = $2
          RETURNING ${rowColumns}`,
        [id, user.id],
      );
      if (!updated.rows[0]) throw Object.assign(new Error("recorder archive materialization changed during completion"), { statusCode: 409 });
      return mapRow(updated.rows[0]);
    });
    return result;
  } catch (error) {
    const rawCode = typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : "recorder-materialization-failed";
    const code = /^[a-z0-9][a-z0-9-]{0,79}$/.test(rawCode) ? rawCode : "recorder-materialization-failed";
    await db.query(
      `UPDATE recorder_archive_materializations SET verification_error_code = $3
        WHERE id = $1 AND owner_user_id = $2 AND status = 'staged'`,
      [id, user.id, code],
    );
    throw error;
  }
}
