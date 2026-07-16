import assert from "node:assert/strict";
import test from "node:test";
import {
  RECORDER_ARCHIVE_SCHEMA_VERSION,
  RECORDER_INSPECTION_SCHEMA_VERSION,
  RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
  parseRecorderUploadPlan,
} from "../src/desktopRecorder.ts";
import {
  admitRecorderArchive,
  completeRecorderArchive,
  stageRecorderArchive,
} from "../src/gateway.ts";

function planFixture() {
  const files = [
    { name: "forge-recorder-manifest.json", contentType: "application/json", byteSize: 100, sha256: "10".repeat(32) },
    { name: "telemetry.frames.jsonl", contentType: "application/x-ndjson", byteSize: 200, sha256: "20".repeat(32) },
    { name: "telemetry.index.jsonl", contentType: "application/x-ndjson", byteSize: 80, sha256: "30".repeat(32) },
    { name: "telemetry.replay.json", contentType: "application/json", byteSize: 300, sha256: "40".repeat(32) },
    { name: "forge-recorder-receipt.json", contentType: "application/json", byteSize: 120, sha256: "50".repeat(32) },
  ];
  return parseRecorderUploadPlan({
    schemaVersion: RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
    archiveSchemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
    inspectionSchemaVersion: RECORDER_INSPECTION_SCHEMA_VERSION,
    artifactId: "art_gateway_1",
    referenceRigId: "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
    contractHash: "11".repeat(32),
    lockfileHash: "22".repeat(32),
    sourcePortSha256: "33".repeat(32),
    sampleRateHz: 120,
    startedAtUnixMs: 1_750_000_000_000,
    stoppedAtUnixMs: 1_750_000_000_500,
    frameCount: 3,
    durationS: 0.5,
    captureMaturity: "local-serial-integration",
    aggregateByteSize: 800,
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
  });
}

function materializationFixture(status: "staged" | "materialized" = "staged") {
  const plan = planFixture();
  return {
    id: "ram-1234567890",
    ownerUserId: "user-recorder",
    artifactId: plan.artifactId,
    schemaVersion: "forge-recorder-materialization/1.0.0",
    status,
    manifestBlobId: "obj-manifest",
    frameBlobId: "obj-frame",
    indexBlobId: "obj-index",
    replayBlobId: "obj-replay",
    receiptBlobId: "obj-receipt",
    uploadPlan: plan,
    aggregateByteSize: plan.aggregateByteSize,
    gatewayObjectIntegrityVerified: status === "materialized",
    gatewayArchiveSemanticsVerified: false,
    recordedDeviceAttested: false,
    deviceIdentityVerified: false,
    fieldSessionVerified: false,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    noAutoArm: true,
    verificationErrorCode: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    materializedAt: status === "materialized" ? "2026-07-16T00:01:00.000Z" : null,
  };
}

function stageFixture() {
  const materialization = materializationFixture();
  const blobIds = [
    materialization.manifestBlobId,
    materialization.frameBlobId,
    materialization.indexBlobId,
    materialization.replayBlobId,
    materialization.receiptBlobId,
  ];
  return {
    materialization,
    uploads: materialization.uploadPlan.files.map((file, index) => {
      const objectKey = `users/user-recorder/recorder-v1/${file.sha256}`;
      return {
        name: file.name,
        blob: {
          id: blobIds[index],
          ownerUserId: "user-recorder",
          visibility: "private",
          cacheKey: `cache-${index}`,
          bucket: "forge-artifacts",
          objectKey,
          contentType: file.contentType,
          byteSize: file.byteSize,
          sha256: file.sha256,
          metadata: {},
          createdAt: "2026-07-16T00:00:00.000Z",
        },
        upload: {
          action: "upload",
          method: "PUT",
          url: `https://objects.example.test/${objectKey}?X-Amz-Signature=test`,
          headers: {
            "content-type": file.contentType,
            "x-amz-checksum-sha256": "checksum",
          },
          expiresAt: "2026-07-16T00:15:00.000Z",
          bucket: "forge-artifacts",
          objectKey,
        },
      };
    }),
  };
}

function admissionFixture() {
  const materialization = materializationFixture("materialized");
  const plan = materialization.uploadPlan;
  const byName = new Map(plan.files.map((file) => [file.name, file]));
  const verification = {
    schemaVersion: "forge-recorder-verification/1.0.0",
    archiveSchemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
    replaySchemaVersion: "1.0.0",
    receiptSchemaVersion: "forge-recorder-receipt/1.0.0",
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
  return {
    materialization,
    admission: {
      id: "raa-0123456789abcdef0123",
      ownerUserId: "user-recorder",
      materializationId: materialization.id,
      telemetryLogId: "tel-recorder-1",
      modelId: "mdl-recorder-1",
      schemaVersion: "forge-recorder-admission/1.0.0",
      verification,
      replayFileSha256: verification.replayFileSha256,
      frameCount: verification.frameCount,
      durationS: verification.durationS,
      gatewayArchiveSemanticsVerified: true,
      recordedDeviceAttested: false,
      deviceIdentityVerified: false,
      fieldSessionVerified: false,
      sharingAuthorized: false,
      trainingReuseAuthorized: false,
      noAutoArm: true,
      createdAt: "2026-07-16T00:02:00.000Z",
    },
  };
}

test("gateway recorder client stages the sanitized plan and retains every nonclaim", async () => {
  const previousFetch = globalThis.fetch;
  let requestedBody: unknown;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/v1/recorder-archives");
    assert.equal(init?.method, "POST");
    requestedBody = JSON.parse(String(init?.body));
    return Response.json(stageFixture(), { status: 201 });
  };
  try {
    const plan = planFixture();
    const staged = await stageRecorderArchive(plan);
    assert.deepEqual(requestedBody, { plan });
    assert.doesNotMatch(JSON.stringify(requestedBody), /archivePath|replayPath|rawFrames/);
    assert.equal(staged.uploads.length, 5);
    assert.equal(staged.materialization.gatewayObjectIntegrityVerified, false);
    assert.equal(staged.materialization.gatewayArchiveSemanticsVerified, false);
    assert.equal(staged.materialization.recordedDeviceAttested, false);
    assert.equal(staged.materialization.sharingAuthorized, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("gateway recorder client accepts completion only with object integrity and no promoted authority", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ materialization: materializationFixture("materialized") });
  try {
    const completed = await completeRecorderArchive("ram-1234567890");
    assert.equal(completed.gatewayObjectIntegrityVerified, true);
    assert.equal(completed.gatewayArchiveSemanticsVerified, false);
    assert.equal(completed.deviceIdentityVerified, false);
    assert.equal(completed.fieldSessionVerified, false);
    assert.equal(completed.trainingReuseAuthorized, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("gateway recorder client rejects checksum binding and semantic-authority drift", async () => {
  const previousFetch = globalThis.fetch;
  const substituted = stageFixture();
  substituted.uploads[2].blob.sha256 = "ff".repeat(32);
  globalThis.fetch = async () => Response.json(substituted, { status: 201 });
  try {
    await assert.rejects(stageRecorderArchive(planFixture()), /does not match its checksum-bound file/);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const promoted = materializationFixture("materialized");
  promoted.gatewayArchiveSemanticsVerified = true;
  globalThis.fetch = async () => Response.json({ materialization: promoted });
  try {
    await assert.rejects(completeRecorderArchive("ram-1234567890"), /state or authority has drifted/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("gateway recorder client admits only the exact sovereign report and explicit nonclaims", async () => {
  const previousFetch = globalThis.fetch;
  const fixture = admissionFixture();
  let requestedBody: unknown;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/v1/recorder-archives/ram-1234567890/admit");
    assert.equal(init?.method, "POST");
    requestedBody = JSON.parse(String(init?.body));
    return Response.json({ admission: fixture.admission }, { status: 201 });
  };
  try {
    const admission = await admitRecorderArchive(fixture.materialization, "mdl-recorder-1");
    assert.deepEqual(requestedBody, { modelId: "mdl-recorder-1" });
    assert.equal(admission.gatewayArchiveSemanticsVerified, true);
    assert.equal(admission.telemetryLogId, "tel-recorder-1");
    assert.equal(admission.recordedDeviceAttested, false);
    assert.equal(admission.deviceIdentityVerified, false);
    assert.equal(admission.fieldSessionVerified, false);
    assert.equal(admission.sharingAuthorized, false);
    assert.equal(admission.trainingReuseAuthorized, false);
  } finally {
    globalThis.fetch = previousFetch;
  }

  const substituted = admissionFixture();
  substituted.admission.verification.replayFileSha256 = "ff".repeat(32);
  globalThis.fetch = async () => Response.json({ admission: substituted.admission }, { status: 201 });
  try {
    await assert.rejects(
      admitRecorderArchive(substituted.materialization, "mdl-recorder-1"),
      /identity, proof, or authority has drifted/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
