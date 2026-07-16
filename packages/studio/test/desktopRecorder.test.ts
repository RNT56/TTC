import assert from "node:assert/strict";
import test from "node:test";
import {
  RECORDER_ARCHIVE_SCHEMA_VERSION,
  RECORDER_INSPECTION_SCHEMA_VERSION,
  RECORDER_RECEIPT_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  inspectRecorderArchive,
  parseRecorderArchiveInspection,
  type DesktopCommandRuntime,
} from "../src/desktopRecorder.ts";

function inspectionFixture(): Record<string, unknown> {
  return {
    schemaVersion: RECORDER_INSPECTION_SCHEMA_VERSION,
    archiveSchemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
    replaySchemaVersion: REPLAY_SCHEMA_VERSION,
    receiptSchemaVersion: RECORDER_RECEIPT_SCHEMA_VERSION,
    artifactId: "art_replay_1",
    archivePath: "/tmp/art_replay_1",
    replayPath: "/tmp/art_replay_1/telemetry.replay.json",
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
    integrityVerified: true,
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

test("invokes the exact Desktop inspection command and parses its bounded summary", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const runtime: DesktopCommandRuntime = {
    available: () => true,
    invoke: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return inspectionFixture() as T;
    },
  };
  const inspection = await inspectRecorderArchive("  /tmp/art_replay_1  ", runtime);
  assert.deepEqual(calls, [{
    command: "inspect_recorder_archive",
    args: { archivePath: "/tmp/art_replay_1" },
  }]);
  assert.equal(inspection.artifactId, "art_replay_1");
  assert.equal(inspection.integrityVerified, true);
  assert.equal(inspection.recordedDeviceAttested, false);
  assert.equal(inspection.trainingReuseAuthorized, false);
});

test("refuses browser use and invalid archive paths without invoking Desktop", async () => {
  let invoked = false;
  const unavailable: DesktopCommandRuntime = {
    available: () => false,
    invoke: async <T>() => {
      invoked = true;
      return inspectionFixture() as T;
    },
  };
  await assert.rejects(inspectRecorderArchive("/tmp/archive", unavailable), /requires FORGE Desktop/);
  assert.equal(invoked, false);

  const available = { ...unavailable, available: () => true };
  await assert.rejects(inspectRecorderArchive("   ", available), /1 through 4096 UTF-8 bytes/);
  await assert.rejects(
    inspectRecorderArchive("é".repeat(3_000), available),
    /1 through 4096 UTF-8 bytes/,
  );
  assert.equal(invoked, false);
});

test("refuses response version, field, numeric, and authority drift", () => {
  const unsupported = inspectionFixture();
  unsupported.archiveSchemaVersion = "forge-recorder-archive/2.0.0";
  assert.throws(() => parseRecorderArchiveInspection(unsupported), /unsupported format version/);

  const extra = inspectionFixture();
  extra.rawFrames = [];
  assert.throws(() => parseRecorderArchiveInspection(extra), /fields have drifted/);

  const oversized = inspectionFixture();
  oversized.frameCount = 1_000_001;
  assert.throws(() => parseRecorderArchiveInspection(oversized), /numeric bounds/);

  const promoted = inspectionFixture();
  promoted.recordedDeviceAttested = true;
  assert.throws(() => parseRecorderArchiveInspection(promoted), /authority or privacy flags/);

  const wrongRig = inspectionFixture();
  wrongRig.referenceRigId = "caller-authored-rig";
  assert.throws(() => parseRecorderArchiveInspection(wrongRig), /not a frozen D12 rig/);

  const wrongReplay = inspectionFixture();
  wrongReplay.replayPath = "/tmp/art_replay_1/alternate.json";
  assert.throws(() => parseRecorderArchiveInspection(wrongReplay), /archive-v1 replay/);
});
