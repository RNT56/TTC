import assert from "node:assert/strict";
import test from "node:test";
import {
  D12_REFERENCE_RIG_IDS,
  RECORDER_ADAPTER_PROBE_CONFIRMATION,
  RECORDER_ADAPTER_PROBE_SCHEMA_VERSION,
  RECORDER_ADAPTER_READ_ONLY_COMMAND_IDS,
  RECORDER_ADAPTER_SCHEMA_VERSION,
  RECORDER_ARCHIVE_SCHEMA_VERSION,
  RECORDER_BAUD,
  RECORDER_CONTROL_SCHEMA_VERSION,
  RECORDER_FRAME_SCHEMA_VERSION,
  RECORDER_INSPECTION_SCHEMA_VERSION,
  RECORDER_PHYSICAL_CONFIRMATION,
  RECORDER_RECEIPT_SCHEMA_VERSION,
  RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
  RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION,
  REPLAY_SCHEMA_VERSION,
  getDesktopBridgeStatus,
  getRecorderStatus,
  inspectRecorderArchive,
  listDesktopSerialPorts,
  parseDesktopBridgeStatus,
  parseDesktopSerialPorts,
  parseRecorderAdapterProbe,
  parseRecorderArchiveInspection,
  parseRecorderControlStatus,
  parseRecorderStopReceipt,
  parseRecorderUploadPlan,
  parseRecorderUploadReceipt,
  prepareRecorderArchiveUpload,
  probeDesktopRecorderAdapter,
  startDesktopRecorder,
  stopDesktopRecorder,
  uploadRecorderArchiveFiles,
  type DesktopCommandRuntime,
  type RecorderStartRequest,
} from "../src/desktopRecorder.ts";

function adapterProbeFixture(): Record<string, unknown> {
  return {
    schemaVersion: RECORDER_ADAPTER_PROBE_SCHEMA_VERSION,
    adapterSchemaVersion: RECORDER_ADAPTER_SCHEMA_VERSION,
    probeMaturity: "unattested-read-only-probe",
    referenceRigId: D12_REFERENCE_RIG_IDS[0],
    sourcePortSha256: "10".repeat(32),
    osDescriptorSha256: "20".repeat(32),
    baud: RECORDER_BAUD,
    observedAtUnixMs: 1_750_000_000_000,
    firmware: "betaflight",
    firmwareVersion: "2025.12.5",
    mspProtocolVersion: 0,
    mspApiMajor: 1,
    mspApiMinor: 47,
    flightControllerVariant: "BTFL",
    boardIdentifier: "KH7",
    targetName: "KAKUTEH7",
    boardName: "Kakute H7 V1.5",
    manufacturerId: "HBRO",
    deviceUidSha256: "30".repeat(32),
    identitySha256: "40".repeat(32),
    preIdentityResponseSha256: "50".repeat(32),
    postIdentityResponseSha256: "50".repeat(32),
    transcriptSha256: "60".repeat(32),
    readOnlyCommandIds: [...RECORDER_ADAPTER_READ_ONLY_COMMAND_IDS],
    adapterProtocolVerified: true,
    stableIdentityObserved: true,
    deviceIdentityVerified: false,
    cryptographicDeviceAttestation: false,
    recordedDeviceAttested: false,
    fieldSessionVerified: false,
    sharingAuthorized: false,
    trainingReuseAuthorized: false,
    noAutoArm: true,
  };
}

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

function uploadPlanFixture(): Record<string, unknown> {
  const files = [
    ["forge-recorder-manifest.json", "application/json", 100, "10".repeat(32)],
    ["telemetry.frames.jsonl", "application/x-ndjson", 200, "20".repeat(32)],
    ["telemetry.index.jsonl", "application/x-ndjson", 80, "30".repeat(32)],
    ["telemetry.replay.json", "application/json", 300, "40".repeat(32)],
    ["forge-recorder-receipt.json", "application/json", 120, "50".repeat(32)],
  ].map(([name, contentType, byteSize, sha256]) => ({ name, contentType, byteSize, sha256 }));
  return {
    schemaVersion: RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
    archiveSchemaVersion: RECORDER_ARCHIVE_SCHEMA_VERSION,
    inspectionSchemaVersion: RECORDER_INSPECTION_SCHEMA_VERSION,
    artifactId: "art_replay_1",
    referenceRigId: D12_REFERENCE_RIG_IDS[1],
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
  };
}

function uploadReceiptFixture(): Record<string, unknown> {
  return {
    schemaVersion: RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION,
    uploadPlanSchemaVersion: RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
    artifactId: "art_replay_1",
    uploadedFileCount: 5,
    uploadedByteSize: 800,
    localIntegrityVerified: true,
    gatewayObjectIntegrityVerified: false,
    recordedDeviceAttested: false,
    deviceIdentityVerified: false,
    fieldSessionVerified: false,
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

test("invokes the exact read-only adapter probe and retains every non-attestation flag", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const runtime: DesktopCommandRuntime = {
    available: () => true,
    invoke: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return adapterProbeFixture() as T;
    },
  };
  const request = {
    port: "/dev/tty.usbmodem1",
    baud: RECORDER_BAUD,
    referenceRigId: D12_REFERENCE_RIG_IDS[0],
    physicalConfirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION,
  } as const;
  const probe = await probeDesktopRecorderAdapter(request, runtime);
  assert.deepEqual(calls, [{ command: "probe_recorder_adapter", args: { request } }]);
  assert.equal(probe.adapterProtocolVerified, true);
  assert.equal(probe.stableIdentityObserved, true);
  assert.equal(probe.deviceIdentityVerified, false);
  assert.equal(probe.cryptographicDeviceAttestation, false);
  assert.equal(probe.recordedDeviceAttested, false);
});

test("adapter probe refuses browser, request, response, command, identity, and authority drift", async () => {
  let invoked = false;
  const unavailable: DesktopCommandRuntime = {
    available: () => false,
    invoke: async <T>() => {
      invoked = true;
      return adapterProbeFixture() as T;
    },
  };
  const request = {
    port: "/dev/tty.usbmodem1",
    baud: RECORDER_BAUD,
    referenceRigId: D12_REFERENCE_RIG_IDS[0],
    physicalConfirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION,
  } as const;
  await assert.rejects(probeDesktopRecorderAdapter(request, unavailable), /require FORGE Desktop/);
  const available = { ...unavailable, available: () => true };
  await assert.rejects(
    probeDesktopRecorderAdapter({ ...request, referenceRigId: D12_REFERENCE_RIG_IDS[1] } as never, available),
    /props-off D12 quad contract/,
  );
  assert.equal(invoked, false);

  const extra = adapterProbeFixture();
  extra.rawUid = "010203";
  assert.throws(() => parseRecorderAdapterProbe(extra), /fields have drifted/);
  const commands = adapterProbeFixture();
  commands.readOnlyCommandIds = [1, 2, 3, 4, 5, 99];
  assert.throws(() => parseRecorderAdapterProbe(commands), /command allowlist/);
  const unstable = adapterProbeFixture();
  unstable.postIdentityResponseSha256 = "99".repeat(32);
  assert.throws(() => parseRecorderAdapterProbe(unstable), /stability or authority/);
  const promoted = adapterProbeFixture();
  promoted.cryptographicDeviceAttestation = true;
  assert.throws(() => parseRecorderAdapterProbe(promoted), /stability or authority/);
  const wrongTarget = adapterProbeFixture();
  wrongTarget.targetName = "OTHERH7";
  assert.throws(() => parseRecorderAdapterProbe(wrongTarget), /identity or numeric bounds/);
  const controlCharacter = adapterProbeFixture();
  controlCharacter.boardName = "Kakute\nH7";
  assert.throws(() => parseRecorderAdapterProbe(controlCharacter), /identity or numeric bounds/);
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

test("recorder materialization invokes only sanitized plan and exact streaming upload commands", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const runtime: DesktopCommandRuntime = {
    available: () => true,
    invoke: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return (command === "prepare_recorder_archive_upload"
        ? uploadPlanFixture()
        : uploadReceiptFixture()) as T;
    },
  };
  const plan = await prepareRecorderArchiveUpload("  /tmp/art_replay_1  ", runtime);
  const uploads = plan.files.map((file) => ({
    name: file.name,
    method: "PUT" as const,
    url: `http://127.0.0.1:9000/${file.name}?X-Amz-Algorithm=test&X-Amz-Credential=test&X-Amz-Date=test&X-Amz-Expires=900&X-Amz-SignedHeaders=test&X-Amz-Signature=test`,
    headers: {
      "content-type": file.contentType,
      "x-amz-checksum-sha256": "checksum",
    },
    byteSize: file.byteSize,
    sha256: file.sha256,
  }));
  const receipt = await uploadRecorderArchiveFiles("/tmp/art_replay_1", plan, uploads, runtime);
  assert.equal(receipt.gatewayObjectIntegrityVerified, false);
  assert.equal(receipt.recordedDeviceAttested, false);
  assert.deepEqual(calls, [
    { command: "prepare_recorder_archive_upload", args: { archivePath: "/tmp/art_replay_1" } },
    { command: "upload_recorder_archive_files", args: { archivePath: "/tmp/art_replay_1", uploads } },
  ]);
  assert.doesNotMatch(JSON.stringify(plan), /archivePath|replayPath|rawFrames/);
});

test("recorder materialization parsers refuse plan, upload, and authority substitution", async () => {
  const wrongOrder = uploadPlanFixture();
  (wrongOrder.files as unknown[]).reverse();
  assert.throws(() => parseRecorderUploadPlan(wrongOrder), /file 0 has drifted/);

  const promoted = uploadReceiptFixture();
  promoted.gatewayObjectIntegrityVerified = true;
  assert.throws(() => parseRecorderUploadReceipt(promoted), /authority have drifted/);

  let invoked = false;
  const runtime: DesktopCommandRuntime = {
    available: () => true,
    invoke: async <T>() => {
      invoked = true;
      return uploadReceiptFixture() as T;
    },
  };
  const plan = parseRecorderUploadPlan(uploadPlanFixture());
  const uploads = plan.files.map((file) => ({
    name: file.name,
    method: "PUT" as const,
    url: "https://objects.example.test/upload?X-Amz-Signature=test",
    headers: { "content-type": file.contentType, "x-amz-checksum-sha256": "checksum" },
    byteSize: file.byteSize,
    sha256: file.sha256,
  }));
  uploads[2] = { ...uploads[2], sha256: "ff".repeat(32) };
  await assert.rejects(
    uploadRecorderArchiveFiles("/tmp/art_replay_1", plan, uploads, runtime),
    /does not match the prepared file plan/,
  );
  assert.equal(invoked, false);
});
