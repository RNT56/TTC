import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { QueryResult } from "pg";
import type { CurrentUser } from "../src/auth.js";
import type { GatewayDb, GatewayTransactionOptions } from "../src/db.js";
import { buildServer } from "../src/server.js";
import {
  completeRecorderArchive,
  RECORDER_ARCHIVE_SCHEMA_VERSION,
  RECORDER_FRAME_SCHEMA_VERSION,
  RECORDER_INSPECTION_SCHEMA_VERSION,
  RECORDER_MATERIALIZATION_SCHEMA_VERSION,
  RECORDER_RECEIPT_SCHEMA_VERSION,
  RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  stageRecorderArchive,
  validateRecorderUploadPlan,
  type RecorderUploadPlanInput,
} from "../src/recorderArchives.js";
import {
  admitRecorderArchive,
  RECORDER_ADMISSION_SCHEMA_VERSION,
  RECORDER_TELEMETRY_REFERENCE_SCHEMA_VERSION,
  RECORDER_VERIFICATION_SCHEMA_VERSION,
  type RecorderVerificationReport,
} from "../src/recorderAdmission.js";
import type {
  ObjectStorageConfig,
  ObjectStreamAdapter,
  StoredObjectInspection,
} from "../src/objectStorage.js";

const user: CurrentUser = { id: "usr-recorder", name: "Recorder", email: "recorder@example.test", image: null };
const config: ObjectStorageConfig = {
  endpoint: "http://127.0.0.1:9000",
  region: "us-east-1",
  bucket: "forge-artifacts",
  accessKeyId: "forge",
  secretAccessKey: "forge-dev-only",
  forcePathStyle: true,
  readTimeoutMs: 30_000,
  deleteTimeoutMs: 1_000,
};

function sha(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function pretty(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function fixture(): { plan: RecorderUploadPlanInput; manifest: Uint8Array; receipt: Uint8Array } {
  const base = {
    artifactId: "art_gateway_materialization",
    referenceRigId: "ref_quad_kakute-h7-source-one-5in",
    contractHash: "11".repeat(32),
    lockfileHash: "22".repeat(32),
    sourcePortSha256: "66".repeat(32),
    startedAtUnixMs: 1_750_000_000_000,
    stoppedAtUnixMs: 1_750_000_000_500,
    frameCount: 3,
    durationS: 0.5,
  };
  const manifest = pretty({
    schemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
    replaySchemaVersion: REPLAY_SCHEMA_VERSION,
    frameSchemaVersion: RECORDER_FRAME_SCHEMA_VERSION,
    receiptSchemaVersion: RECORDER_RECEIPT_SCHEMA_VERSION,
    artifactId: base.artifactId,
    referenceRigId: base.referenceRigId,
    sampleRateHz: 120,
    startedAtUnixMs: base.startedAtUnixMs,
    contractHash: base.contractHash,
    lockfileHash: base.lockfileHash,
    environment: { courseId: "bench" },
    seed: 17,
    sourceKind: "serial-jsonl",
    sourcePortSha256: base.sourcePortSha256,
    sourceBaud: 115_200,
    captureMaturity: "local-serial-integration",
    recordedDeviceAttested: false,
    frameFile: "telemetry.frames.jsonl",
    indexFile: "telemetry.index.jsonl",
    replayFile: "telemetry.replay.json",
    receiptFile: "forge-recorder-receipt.json",
    captureConsentConfirmed: true,
    userOwned: true,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    noAutoArm: true,
  });
  const frameSha = "33".repeat(32);
  const indexSha = "44".repeat(32);
  const replaySha = "55".repeat(32);
  const receipt = pretty({
    schemaVersion: RECORDER_RECEIPT_SCHEMA_VERSION,
    archiveSchemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
    replaySchemaVersion: REPLAY_SCHEMA_VERSION,
    frameSchemaVersion: RECORDER_FRAME_SCHEMA_VERSION,
    ...base,
    frameFileSha256: frameSha,
    indexFileSha256: indexSha,
    replayFileSha256: replaySha,
    captureComplete: true,
    captureMaturity: "local-serial-integration",
    captureConsentConfirmed: true,
    recordedDeviceAttested: false,
    userOwned: true,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    noAutoArm: true,
  });
  const files = [
    { name: "forge-recorder-manifest.json" as const, contentType: "application/json", byteSize: manifest.byteLength, sha256: sha(manifest) },
    { name: "telemetry.frames.jsonl" as const, contentType: "application/x-ndjson", byteSize: 120, sha256: frameSha },
    { name: "telemetry.index.jsonl" as const, contentType: "application/x-ndjson", byteSize: 80, sha256: indexSha },
    { name: "telemetry.replay.json" as const, contentType: "application/json", byteSize: 300, sha256: replaySha },
    { name: "forge-recorder-receipt.json" as const, contentType: "application/json", byteSize: receipt.byteLength, sha256: sha(receipt) },
  ];
  return {
    manifest,
    receipt,
    plan: {
      schemaVersion: RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
      archiveSchemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
      inspectionSchemaVersion: RECORDER_INSPECTION_SCHEMA_VERSION,
      ...base,
      sampleRateHz: 120,
      captureMaturity: "local-serial-integration",
      aggregateByteSize: files.reduce((sum, file) => sum + file.byteSize, 0),
      files,
      localIntegrityVerified: true,
      captureComplete: true,
      captureConsentConfirmed: true,
      userOwned: true,
      sharingAuthorized: false,
      trainingReuseAuthorized: false,
      recordedDeviceAttested: false,
      deviceIdentityVerified: false,
      fieldSessionVerified: false,
      noAutoArm: true,
    },
  };
}

function queryResult<T extends object>(rows: T[], rowCount = rows.length): QueryResult<T> {
  return { rows, rowCount, command: "TEST", oid: 0, fields: [] };
}

class RecorderDb implements GatewayDb {
  readonly blobs = new Map<string, Record<string, unknown>>();
  materialization: Record<string, unknown> | null = null;
  admission: Record<string, unknown> | null = null;
  telemetry: Record<string, unknown> | null = null;
  nextBlob = 1;

  transaction<T>(_options: GatewayTransactionOptions, operation: (transaction: GatewayDb) => Promise<T>): Promise<T> {
    return operation(this);
  }

  async query<T extends object>(text: string, params: readonly unknown[] = []): Promise<QueryResult<T>> {
    if (text.includes("WITH by_id") || text.includes("INSERT INTO users")) {
      return queryResult([user as T]);
    }
    if (text.includes("INSERT INTO credit_accounts")) return queryResult<T>([], 1);
    if (text.includes("INSERT INTO object_blobs")) {
      const cacheKey = String(params[1]);
      const existing = [...this.blobs.values()].find((blob) => blob.cache_key === cacheKey);
      if (existing) return queryResult([existing as T]);
      const id = `obj-rec-${this.nextBlob++}`;
      const row = {
        id,
        owner_user_id: params[0], visibility: "private", cache_key: cacheKey,
        bucket: params[2], object_key: params[3], content_type: params[4], byte_size: params[5],
        sha256: params[6], upload_status: "staged", verified_at: null,
        verification_error_code: null, metadata: JSON.parse(String(params[7])),
        created_at: new Date("2026-07-16T00:00:00.000Z"),
      };
      this.blobs.set(id, row);
      return queryResult([row as T]);
    }
    if (text.includes("INSERT INTO recorder_archive_materializations")) {
      if (this.materialization) return queryResult<T>([], 0);
      this.materialization = {
        id: "ram-test", owner_user_id: params[0], artifact_id: params[1],
        schema_version: RECORDER_MATERIALIZATION_SCHEMA_VERSION, status: "staged",
        manifest_blob_id: params[2], frame_blob_id: params[3], index_blob_id: params[4],
        replay_blob_id: params[5], receipt_blob_id: params[6], upload_plan: JSON.parse(String(params[7])),
        aggregate_byte_size: params[8], gateway_object_integrity_verified: false,
        gateway_archive_semantics_verified: false, recorded_device_attested: false,
        device_identity_verified: false, field_session_verified: false, sharing_authorized: false,
        training_reuse_authorized: false, no_auto_arm: true, verification_error_code: null,
        created_at: new Date("2026-07-16T00:00:00.000Z"), materialized_at: null,
      };
      return queryResult([this.materialization as T]);
    }
    if (text.includes("FROM recorder_archive_materializations")) {
      return queryResult(this.materialization ? [this.materialization as T] : []);
    }
    if (text.includes("FROM recorder_archive_admissions")) {
      return queryResult(this.admission ? [this.admission as T] : []);
    }
    if (text.includes("FROM object_blobs")) {
      const row = this.blobs.get(String(params[0]));
      return queryResult(row && row.owner_user_id === params[1] ? [row as T] : []);
    }
    if (text.includes("UPDATE object_blobs") && text.includes("upload_status = 'complete'")) {
      const row = this.blobs.get(String(params[0]));
      if (!row) return queryResult<T>([], 0);
      row.upload_status = "complete";
      row.verified_at = new Date("2026-07-16T00:01:00.000Z");
      row.verification_error_code = null;
      return queryResult([row as T]);
    }
    if (text.includes("UPDATE object_blobs") && text.includes("upload_status = 'staged'")) {
      return queryResult<T>([], 0);
    }
    if (text.includes("UPDATE recorder_archive_materializations") && text.includes("status = 'materialized'")) {
      assert(this.materialization);
      this.materialization.status = "materialized";
      this.materialization.gateway_object_integrity_verified = true;
      this.materialization.verification_error_code = null;
      this.materialization.materialized_at = new Date("2026-07-16T00:02:00.000Z");
      return queryResult([this.materialization as T]);
    }
    if (text.includes("UPDATE recorder_archive_materializations") && text.includes("verification_error_code")) {
      if (this.materialization) this.materialization.verification_error_code = params[2];
      return queryResult<T>([], 1);
    }
    if (text.includes("FROM model_registry")) {
      return queryResult([{
        id: params[0],
        status: "admitted",
        contract_hash: "11".repeat(32),
        validator_report: {
          verdict: "admitted",
          contractHash: "11".repeat(32),
          lockfileHash: "22".repeat(32),
        },
      } as T]);
    }
    if (text.includes("INSERT INTO telemetry_logs")) {
      this.telemetry = {
        id: "tel-recorder-admitted",
        owner_user_id: params[0],
        model_id: params[1],
        source: "desktop",
        captured_at: params[2],
        tape: JSON.parse(String(params[3])),
        privacy: JSON.parse(String(params[4])),
      };
      return queryResult([{ id: "tel-recorder-admitted" } as T]);
    }
    if (text.includes("INSERT INTO recorder_archive_admissions")) {
      this.admission = {
        id: params[0], owner_user_id: params[1], materialization_id: params[2],
        telemetry_log_id: params[3], model_id: params[4],
        schema_version: RECORDER_ADMISSION_SCHEMA_VERSION,
        verification: JSON.parse(String(params[5])), replay_file_sha256: params[6],
        frame_count: params[7], duration_s: params[8], gateway_archive_semantics_verified: true,
        recorded_device_attested: false, device_identity_verified: false,
        field_session_verified: false, sharing_authorized: false,
        training_reuse_authorized: false, no_auto_arm: true,
        created_at: new Date("2026-07-16T00:03:00.000Z"),
      };
      return queryResult([this.admission as T]);
    }
    throw new Error(`unexpected query: ${text}`);
  }
}

function verificationReport(plan: RecorderUploadPlanInput): RecorderVerificationReport {
  const byName = new Map(plan.files.map((file) => [file.name, file]));
  return {
    schemaVersion: RECORDER_VERIFICATION_SCHEMA_VERSION,
    archiveSchemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
    replaySchemaVersion: REPLAY_SCHEMA_VERSION,
    receiptSchemaVersion: RECORDER_RECEIPT_SCHEMA_VERSION,
    artifactId: plan.artifactId,
    referenceRigId: plan.referenceRigId,
    contractHash: plan.contractHash,
    lockfileHash: plan.lockfileHash,
    sourcePortSha256: plan.sourcePortSha256,
    sampleRateHz: plan.sampleRateHz,
    startedAtUnixMs: plan.startedAtUnixMs,
    stoppedAtUnixMs: plan.stoppedAtUnixMs,
    frameCount: plan.frameCount,
    durationS: plan.durationS,
    aggregateByteSize: plan.aggregateByteSize,
    frameFileSha256: byName.get("telemetry.frames.jsonl")!.sha256,
    indexFileSha256: byName.get("telemetry.index.jsonl")!.sha256,
    replayFileSha256: byName.get("telemetry.replay.json")!.sha256,
    captureMaturity: "local-serial-integration",
    archiveSemanticsVerified: true,
    captureComplete: true,
    captureConsentConfirmed: true,
    userOwned: true,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    recordedDeviceAttested: false,
    deviceIdentityVerified: false,
    fieldSessionVerified: false,
    noAutoArm: true,
  };
}

test("recorder upload plan accepts only the exact five-file private nonclaim shape", () => {
  const { plan } = fixture();
  assert.equal(validateRecorderUploadPlan(plan).artifactId, plan.artifactId);
  assert.throws(() => validateRecorderUploadPlan({ ...plan, sharingAuthorized: true }), /authority flags/);
  assert.throws(() => validateRecorderUploadPlan({ ...plan, aggregateByteSize: plan.aggregateByteSize + 1 }), /aggregate size/);
  assert.throws(() => validateRecorderUploadPlan({ ...plan, files: [...plan.files.slice(0, 4), plan.files[0]] }), /unique|names/);
});

test("recorder materialization stages five private blobs then verifies object bindings without provenance promotion", async () => {
  const { plan, manifest, receipt } = fixture();
  const db = new RecorderDb();
  const staged = await stageRecorderArchive(db, user, plan, config.bucket);
  assert.equal(staged.blobs.length, 5);
  assert.equal(staged.materialization.status, "staged");
  assert.equal(staged.materialization.gatewayObjectIntegrityVerified, false);
  assert.equal(staged.materialization.gatewayArchiveSemanticsVerified, false);

  const retried = await stageRecorderArchive(
    db,
    user,
    Object.fromEntries(Object.entries(plan).reverse()),
    config.bucket,
  );
  assert.equal(retried.materialization.id, staged.materialization.id);
  assert.equal(db.blobs.size, 5);

  const inspectObject = async (_config: ObjectStorageConfig, object: { objectKey: string }): Promise<StoredObjectInspection> => {
    const blob = [...db.blobs.values()].find((candidate) => candidate.object_key === object.objectKey)!;
    return { byteSize: Number(blob.byte_size), contentType: String(blob.content_type), sha256: String(blob.sha256) };
  };
  const readObject = async (_config: ObjectStorageConfig, object: { objectKey: string }): Promise<Uint8Array> =>
    object.objectKey.includes("recorder-v1-manifest") ? manifest : receipt;
  const complete = await completeRecorderArchive(db, user, staged.materialization.id, config, inspectObject, readObject);
  assert.equal(complete.status, "materialized");
  assert.equal(complete.gatewayObjectIntegrityVerified, true);
  assert.equal(complete.gatewayArchiveSemanticsVerified, false);
  assert.equal(complete.recordedDeviceAttested, false);
  assert.equal(complete.deviceIdentityVerified, false);
  assert.equal(complete.fieldSessionVerified, false);
  assert.equal(complete.sharingAuthorized, false);
  assert.equal(complete.trainingReuseAuthorized, false);
  assert.equal(complete.noAutoArm, true);
});

test("recorder materialization refuses object checksum substitution and remains staged", async () => {
  const { plan } = fixture();
  const db = new RecorderDb();
  const staged = await stageRecorderArchive(db, user, plan, config.bucket);
  const inspectObject = async (): Promise<StoredObjectInspection> => ({
    byteSize: 1,
    contentType: "application/json",
    sha256: "00".repeat(32),
  });
  await assert.rejects(
    completeRecorderArchive(db, user, staged.materialization.id, config, inspectObject, async () => new Uint8Array()),
    /object declaration changed during upload verification/,
  );
  assert.equal(db.materialization?.status, "staged");
  assert.equal(db.materialization?.gateway_object_integrity_verified, false);
  assert.equal(db.materialization?.verification_error_code, "object-declaration-changed");
});

test("recorder admission streams exact private objects, persists a bounded reference, and keeps nonclaims false", async () => {
  const { plan, manifest, receipt } = fixture();
  const db = new RecorderDb();
  const staged = await stageRecorderArchive(db, user, plan, config.bucket);
  const inspectObject = async (
    _config: ObjectStorageConfig,
    object: { objectKey: string },
  ): Promise<StoredObjectInspection> => {
    const blob = [...db.blobs.values()].find((candidate) => candidate.object_key === object.objectKey)!;
    return {
      byteSize: Number(blob.byte_size),
      contentType: String(blob.content_type),
      sha256: String(blob.sha256),
    };
  };
  await completeRecorderArchive(
    db,
    user,
    staged.materialization.id,
    config,
    inspectObject,
    async (_config, object) => object.objectKey.includes("recorder-v1-manifest") ? manifest : receipt,
  );

  let streamedBytes = 0;
  const streamObject: ObjectStreamAdapter = (_config, object) => (async function* () {
    streamedBytes += object.byteSize;
    yield Buffer.alloc(object.byteSize, 0x61);
  })();
  let verifierCalls = 0;
  const admission = await admitRecorderArchive(
    db,
    user,
    staged.materialization.id,
    "mdl-recorder",
    config,
    streamObject,
    async (archiveDirectory) => {
      verifierCalls += 1;
      const { readdir, stat } = await import("node:fs/promises");
      const names = (await readdir(archiveDirectory)).sort();
      assert.deepEqual(names, plan.files.map((file) => file.name).sort());
      for (const file of plan.files) {
        assert.equal((await stat(`${archiveDirectory}/${file.name}`)).size, file.byteSize);
      }
      return { exitCode: 0, report: verificationReport(plan), stderr: "" };
    },
  );
  assert.equal(streamedBytes, plan.aggregateByteSize);
  assert.equal(verifierCalls, 1);
  assert.equal(admission.schemaVersion, RECORDER_ADMISSION_SCHEMA_VERSION);
  assert.equal(admission.gatewayArchiveSemanticsVerified, true);
  assert.equal(admission.recordedDeviceAttested, false);
  assert.equal(admission.deviceIdentityVerified, false);
  assert.equal(admission.fieldSessionVerified, false);
  assert.equal(admission.sharingAuthorized, false);
  assert.equal(admission.trainingReuseAuthorized, false);
  assert.equal(admission.noAutoArm, true);
  assert.equal(db.materialization?.gateway_archive_semantics_verified, false);
  assert.equal(db.telemetry?.source, "desktop");
  assert.deepEqual(db.telemetry?.tape, {
    ...(db.telemetry?.tape as Record<string, unknown>),
    schemaVersion: RECORDER_TELEMETRY_REFERENCE_SCHEMA_VERSION,
    storage: "object-backed",
    admissionId: admission.id,
    materializationId: staged.materialization.id,
    replayBlobId: staged.materialization.replayBlobId,
    gatewayArchiveSemanticsVerified: true,
    recordedDeviceAttested: false,
    deviceIdentityVerified: false,
    fieldSessionVerified: false,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    noAutoArm: true,
  });
  assert.equal("frames" in (db.telemetry?.tape as Record<string, unknown>), false);

  const retry = await admitRecorderArchive(
    db,
    user,
    staged.materialization.id,
    "mdl-recorder",
    config,
    () => { throw new Error("retry must not redownload"); },
  );
  assert.equal(retry.id, admission.id);
  await assert.rejects(
    admitRecorderArchive(
      db,
      user,
      staged.materialization.id,
      "mdl-other",
      config,
      () => { throw new Error("wrong-model retry must not redownload"); },
    ),
    /different model/,
  );
});

test("recorder admission fails closed on sovereign report substitution", async () => {
  const { plan, manifest, receipt } = fixture();
  const db = new RecorderDb();
  const staged = await stageRecorderArchive(db, user, plan, config.bucket);
  await completeRecorderArchive(
    db,
    user,
    staged.materialization.id,
    config,
    async (_config, object) => {
      const blob = [...db.blobs.values()].find((candidate) => candidate.object_key === object.objectKey)!;
      return {
        byteSize: Number(blob.byte_size),
        contentType: String(blob.content_type),
        sha256: String(blob.sha256),
      };
    },
    async (_config, object) => object.objectKey.includes("recorder-v1-manifest") ? manifest : receipt,
  );
  await assert.rejects(
    admitRecorderArchive(
      db,
      user,
      staged.materialization.id,
      "mdl-recorder",
      config,
      (_config, object) => (async function* () { yield Buffer.alloc(object.byteSize); })(),
      async () => ({
        exitCode: 0,
        report: { ...verificationReport(plan), trainingReuseAuthorized: true },
        stderr: "",
      }),
    ),
    /does not match staged authority/,
  );
  assert.equal(db.telemetry, null);
  assert.equal(db.admission, null);
});

test("recorder admission rebinds every private object declaration to the D53 plan", async () => {
  const { plan, manifest, receipt } = fixture();
  const db = new RecorderDb();
  const staged = await stageRecorderArchive(db, user, plan, config.bucket);
  await completeRecorderArchive(
    db,
    user,
    staged.materialization.id,
    config,
    async (_config, object) => {
      const blob = [...db.blobs.values()].find((candidate) => candidate.object_key === object.objectKey)!;
      return {
        byteSize: Number(blob.byte_size),
        contentType: String(blob.content_type),
        sha256: String(blob.sha256),
      };
    },
    async (_config, object) => object.objectKey.includes("recorder-v1-manifest") ? manifest : receipt,
  );
  const manifestBlob = db.blobs.get(staged.materialization.manifestBlobId)!;
  manifestBlob.sha256 = "99".repeat(32);
  let streamCalls = 0;
  await assert.rejects(
    admitRecorderArchive(
      db,
      user,
      staged.materialization.id,
      "mdl-recorder",
      config,
      () => {
        streamCalls += 1;
        return (async function* () { yield new Uint8Array(); })();
      },
    ),
    /object is not materialized/,
  );
  assert.equal(streamCalls, 0);
  assert.equal(db.telemetry, null);
  assert.equal(db.admission, null);
});

test("recorder archive routes require an owner and preserve object-only maturity", async () => {
  const previousDevAuth = process.env.FORGE_DEV_AUTH;
  process.env.FORGE_DEV_AUTH = "1";
  const { plan, manifest, receipt } = fixture();
  const db = new RecorderDb();
  const inspectObject = async (
    _config: ObjectStorageConfig,
    object: { objectKey: string },
  ): Promise<StoredObjectInspection> => {
    const blob = [...db.blobs.values()].find((candidate) => candidate.object_key === object.objectKey)!;
    return {
      byteSize: Number(blob.byte_size),
      contentType: String(blob.content_type),
      sha256: String(blob.sha256),
    };
  };
  const readObject = async (
    _config: ObjectStorageConfig,
    object: { objectKey: string },
  ): Promise<Uint8Array> => object.objectKey.includes("recorder-v1-manifest") ? manifest : receipt;
  const app = buildServer({
    db,
    inspectObject,
    readObject,
    streamObject: (_config, object) => (async function* () { yield Buffer.alloc(object.byteSize); })(),
    recorderVerifier: async () => ({ exitCode: 0, report: verificationReport(plan), stderr: "" }),
    rateLimitPolicy: null,
  });
  const headers = {
    "x-forge-user-id": user.id,
    "x-forge-user-name": user.name ?? "Recorder",
    "x-forge-user-email": user.email ?? "recorder@example.test",
  };

  try {
    const anonymous = await app.inject({
      method: "POST",
      url: "/v1/recorder-archives",
      payload: { plan },
    });
    assert.equal(anonymous.statusCode, 401, anonymous.body);

    const staged = await app.inject({
      method: "POST",
      url: "/v1/recorder-archives",
      headers,
      payload: { plan },
    });
    assert.equal(staged.statusCode, 201, staged.body);
    assert.equal(staged.headers["cache-control"], "no-store");
    const stagedBody = staged.json() as {
      materialization: { id: string; status: string; gatewayObjectIntegrityVerified: boolean };
      uploads: Array<{ name: string; upload: { method: string; url: string } }>;
    };
    assert.equal(stagedBody.materialization.status, "staged");
    assert.equal(stagedBody.materialization.gatewayObjectIntegrityVerified, false);
    assert.deepEqual(stagedBody.uploads.map((upload) => upload.name), plan.files.map((file) => file.name));
    assert.ok(stagedBody.uploads.every((upload) => upload.upload.method === "PUT"));

    const listed = await app.inject({
      method: "GET",
      url: "/v1/recorder-archives?limit=1",
      headers,
    });
    assert.equal(listed.statusCode, 200, listed.body);
    assert.equal((listed.json() as { materializations: unknown[] }).materializations.length, 1);

    const completed = await app.inject({
      method: "POST",
      url: `/v1/recorder-archives/${stagedBody.materialization.id}/complete`,
      headers,
      payload: {},
    });
    assert.equal(completed.statusCode, 200, completed.body);
    assert.equal(completed.headers["cache-control"], "no-store");
    const completedMaterialization = (completed.json() as {
      materialization: {
        status: string;
        gatewayObjectIntegrityVerified: boolean;
        gatewayArchiveSemanticsVerified: boolean;
        deviceIdentityVerified: boolean;
        fieldSessionVerified: boolean;
        sharingAuthorized: boolean;
        trainingReuseAuthorized: boolean;
        noAutoArm: boolean;
      };
    }).materialization;
    assert.deepEqual(completedMaterialization, {
      ...completedMaterialization,
      status: "materialized",
      gatewayObjectIntegrityVerified: true,
      gatewayArchiveSemanticsVerified: false,
      deviceIdentityVerified: false,
      fieldSessionVerified: false,
      sharingAuthorized: false,
      trainingReuseAuthorized: false,
      noAutoArm: true,
    });

    const admitted = await app.inject({
      method: "POST",
      url: `/v1/recorder-archives/${stagedBody.materialization.id}/admit`,
      headers,
      payload: { modelId: "mdl-recorder" },
    });
    assert.equal(admitted.statusCode, 201, admitted.body);
    assert.equal(admitted.headers["cache-control"], "no-store");
    const admittedBody = admitted.json() as {
      admission: {
        telemetryLogId: string;
        gatewayArchiveSemanticsVerified: boolean;
        recordedDeviceAttested: boolean;
        deviceIdentityVerified: boolean;
        fieldSessionVerified: boolean;
        sharingAuthorized: boolean;
        trainingReuseAuthorized: boolean;
        noAutoArm: boolean;
      };
    };
    assert.deepEqual(admittedBody.admission, {
      ...admittedBody.admission,
      telemetryLogId: "tel-recorder-admitted",
      gatewayArchiveSemanticsVerified: true,
      recordedDeviceAttested: false,
      deviceIdentityVerified: false,
      fieldSessionVerified: false,
      sharingAuthorized: false,
      trainingReuseAuthorized: false,
      noAutoArm: true,
    });
  } finally {
    await app.close();
    if (previousDevAuth === undefined) delete process.env.FORGE_DEV_AUTH;
    else process.env.FORGE_DEV_AUTH = previousDevAuth;
  }
});
