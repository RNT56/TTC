import assert from "node:assert/strict";
import test from "node:test";
import {
  D12_REFERENCE_RIG_IDS,
  RECORDER_ARCHIVE_SCHEMA_VERSION,
  RECORDER_BAUD,
  RECORDER_CONTROL_SCHEMA_VERSION,
  RECORDER_FRAME_SCHEMA_VERSION,
  RECORDER_INSPECTION_SCHEMA_VERSION,
  RECORDER_PHYSICAL_CONFIRMATION,
  RECORDER_RECEIPT_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  getDesktopBridgeStatus,
  getRecorderStatus,
  inspectRecorderArchive,
  listDesktopSerialPorts,
  parseDesktopBridgeStatus,
  parseDesktopSerialPorts,
  parseRecorderArchiveInspection,
  parseRecorderControlStatus,
  parseRecorderStopReceipt,
  startDesktopRecorder,
  stopDesktopRecorder,
  type DesktopCommandRuntime,
  type RecorderStartRequest,
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

function controlFixture(state: "inactive" | "recording" | "finished" = "recording"): Record<string, unknown> {
  const active = state !== "inactive";
  return {
    schemaVersion: RECORDER_CONTROL_SCHEMA_VERSION,
    state,
    artifactId: active ? "art_replay_1" : null,
    archivePath: active ? "/tmp/art_replay_1" : null,
    manifestPath: active ? "/tmp/art_replay_1/forge-recorder-manifest.json" : null,
    referenceRigId: active ? D12_REFERENCE_RIG_IDS[1] : null,
    contractHash: active ? "11".repeat(32) : null,
    lockfileHash: active ? "22".repeat(32) : null,
    sourcePortSha256: active ? "33".repeat(32) : null,
    sourceBaud: active ? RECORDER_BAUD : null,
    sampleRateHz: active ? 120 : null,
    startedAtUnixMs: active ? 1_750_000_000_000 : null,
    captureMaturity: active ? "local-serial-integration" : null,
    captureConsentConfirmed: active,
    recordedDeviceAttested: false,
    deviceIdentityVerified: false,
    fieldSessionVerified: false,
    userOwned: active,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    noAutoArm: true,
  };
}

function stopFixture(): Record<string, unknown> {
  return {
    schemaVersion: RECORDER_RECEIPT_SCHEMA_VERSION,
    archiveSchemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
    replaySchemaVersion: REPLAY_SCHEMA_VERSION,
    frameSchemaVersion: RECORDER_FRAME_SCHEMA_VERSION,
    artifactId: "art_replay_1",
    referenceRigId: D12_REFERENCE_RIG_IDS[1],
    contractHash: "11".repeat(32),
    lockfileHash: "22".repeat(32),
    startedAtUnixMs: 1_750_000_000_000,
    stoppedAtUnixMs: 1_750_000_000_500,
    frameCount: 3,
    durationS: 0.5,
    frameFileSha256: "33".repeat(32),
    indexFileSha256: "44".repeat(32),
    replayFileSha256: "55".repeat(32),
    sourcePortSha256: "33".repeat(32),
    captureComplete: true,
    captureMaturity: "local-serial-integration",
    captureConsentConfirmed: true,
    recordedDeviceAttested: false,
    userOwned: true,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
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

test("invokes exact versioned recorder status, start, stop, bridge, and port commands", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const runtime: DesktopCommandRuntime = {
    available: () => true,
    invoke: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      const responses: Record<string, unknown> = {
        bridge_status: {
          enabled: true,
          reason: "hardware bridge enabled for D12 lab mode by environment",
          noAutoArm: true,
          policyRateHz: 50,
          supervisorRateHz: 200,
        },
        list_serial_ports: [{ name: "/dev/tty.usbmodem1", kind: "usb:FC:local" }],
        recorder_status: controlFixture("inactive"),
        start_background_recording: controlFixture("recording"),
        stop_background_recording: stopFixture(),
      };
      return responses[command] as T;
    },
  };
  const request: RecorderStartRequest = {
    artifactId: "art_replay_1",
    outputDir: "/tmp/art_replay_1",
    sampleRateHz: 120,
    referenceRigId: D12_REFERENCE_RIG_IDS[1],
    physicalConfirmation: RECORDER_PHYSICAL_CONFIRMATION,
    port: "/dev/tty.usbmodem1",
    baud: RECORDER_BAUD,
    contractHash: "11".repeat(32),
    lockfileHash: "22".repeat(32),
    environment: {},
    seed: 17,
  };

  assert.equal((await getDesktopBridgeStatus(runtime)).enabled, true);
  assert.equal((await listDesktopSerialPorts(runtime))[0]?.name, "/dev/tty.usbmodem1");
  assert.equal((await getRecorderStatus(runtime)).state, "inactive");
  assert.equal((await startDesktopRecorder(request, runtime)).state, "recording");
  const activeStatus = parseRecorderControlStatus(controlFixture("recording"));
  assert.equal((await stopDesktopRecorder(activeStatus, runtime)).frameCount, 3);
  assert.deepEqual(calls, [
    { command: "bridge_status", args: undefined },
    { command: "list_serial_ports", args: undefined },
    { command: "recorder_status", args: undefined },
    { command: "start_background_recording", args: { request } },
    { command: "stop_background_recording", args: undefined },
  ]);
});

test("recorder controls refuse browser use and untrusted start requests before invocation", async () => {
  let invoked = false;
  const unavailable: DesktopCommandRuntime = {
    available: () => false,
    invoke: async <T>() => {
      invoked = true;
      return controlFixture() as T;
    },
  };
  await assert.rejects(getRecorderStatus(unavailable), /require FORGE Desktop/);
  const activeStatus = parseRecorderControlStatus(controlFixture("recording"));
  await assert.rejects(
    stopDesktopRecorder(activeStatus, unavailable),
    /require FORGE Desktop/,
  );

  const available = { ...unavailable, available: () => true };
  const request: RecorderStartRequest = {
    artifactId: "art_replay_1",
    outputDir: "relative/archive",
    sampleRateHz: 120,
    referenceRigId: D12_REFERENCE_RIG_IDS[1],
    physicalConfirmation: RECORDER_PHYSICAL_CONFIRMATION,
    port: "/dev/tty.usbmodem1",
    baud: RECORDER_BAUD,
    contractHash: "11".repeat(32),
    lockfileHash: "22".repeat(32),
    environment: {},
    seed: 17,
  };
  await assert.rejects(startDesktopRecorder(request, available), /absolute path/);
  request.outputDir = "/tmp/art_replay_1";
  request.physicalConfirmation = "substituted consent" as typeof RECORDER_PHYSICAL_CONFIRMATION;
  await assert.rejects(startDesktopRecorder(request, available), /consent phrase mismatch/);
  request.physicalConfirmation = RECORDER_PHYSICAL_CONFIRMATION;
  request.environment = { invalid: Number.NaN };
  await assert.rejects(startDesktopRecorder(request, available), /numbers must be finite/);
  assert.equal(invoked, false);
});

test("recorder controls bind start and stop responses to the requested capture identity", async () => {
  const request: RecorderStartRequest = {
    artifactId: "art_replay_1",
    outputDir: "/tmp/art_replay_1",
    sampleRateHz: 120,
    referenceRigId: D12_REFERENCE_RIG_IDS[1],
    physicalConfirmation: RECORDER_PHYSICAL_CONFIRMATION,
    port: "/dev/tty.usbmodem1",
    baud: RECORDER_BAUD,
    contractHash: "11".repeat(32),
    lockfileHash: "22".repeat(32),
    environment: {},
    seed: 17,
  };
  const driftedStart: DesktopCommandRuntime = {
    available: () => true,
    invoke: async <T>() => ({ ...controlFixture(), artifactId: "substituted" }) as T,
  };
  await assert.rejects(
    startDesktopRecorder(request, driftedStart),
    /does not match the admitted capture request/,
  );

  const driftedStop: DesktopCommandRuntime = {
    available: () => true,
    invoke: async <T>() => ({ ...stopFixture(), contractHash: "99".repeat(32) }) as T,
  };
  const activeStatus = parseRecorderControlStatus(controlFixture("finished"));
  await assert.rejects(
    stopDesktopRecorder(activeStatus, driftedStop),
    /does not match the active capture identity/,
  );
});

test("recorder control parsers refuse field, state, authority, port, and receipt drift", () => {
  assert.equal(parseRecorderControlStatus(controlFixture("finished")).state, "finished");
  assert.equal(parseRecorderControlStatus(controlFixture("inactive")).state, "inactive");

  const promoted = controlFixture();
  promoted.deviceIdentityVerified = true;
  assert.throws(() => parseRecorderControlStatus(promoted), /promotes unsupported authority/);

  const invalidInactive = controlFixture("inactive");
  invalidInactive.artifactId = "caller-state";
  assert.throws(() => parseRecorderControlStatus(invalidInactive), /active-capture authority/);

  const extra = controlFixture();
  extra.rawFrames = [];
  assert.throws(() => parseRecorderControlStatus(extra), /fields have drifted/);

  const bridge = {
    enabled: false,
    reason: "hardware gates disabled",
    noAutoArm: true,
    policyRateHz: 50,
    supervisorRateHz: 200,
  };
  assert.equal(parseDesktopBridgeStatus(bridge).enabled, false);
  assert.throws(
    () => parseDesktopBridgeStatus({ ...bridge, noAutoArm: false }),
    /safety authority have drifted/,
  );
  assert.throws(
    () => parseDesktopSerialPorts([{ name: "/dev/tty0", kind: "usb", extra: true }]),
    /fields have drifted/,
  );

  const receipt = stopFixture();
  receipt.trainingReuseAuthorized = true;
  assert.throws(() => parseRecorderStopReceipt(receipt), /authority or privacy flags/);
});
