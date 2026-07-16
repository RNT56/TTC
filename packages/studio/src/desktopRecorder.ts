import { invoke, isTauri } from "@tauri-apps/api/core";

export const RECORDER_INSPECTION_SCHEMA_VERSION = "forge-recorder-inspection/1.0.0";
export const RECORDER_ARCHIVE_SCHEMA_VERSION = "forge-recorder-archive/1.0.0";
export const RECORDER_RECEIPT_SCHEMA_VERSION = "forge-recorder-receipt/1.0.0";
export const RECORDER_CONTROL_SCHEMA_VERSION = "forge-recorder-control/1.0.0";
export const RECORDER_UPLOAD_PLAN_SCHEMA_VERSION = "forge-recorder-upload-plan/1.0.0";
export const RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION = "forge-recorder-upload/1.0.0";
export const RECORDER_ADAPTER_PROBE_SCHEMA_VERSION = "forge-recorder-adapter-probe/1.0.0";
export const RECORDER_ADAPTER_SCHEMA_VERSION = "forge-betaflight-msp-adapter/1.0.0";
export const RECORDER_FRAME_SCHEMA_VERSION = "forge-telemetry-frame/1.0.0";
export const REPLAY_SCHEMA_VERSION = "1.0.0";
export const RECORDER_BAUD = 115_200;
export const RECORDER_PHYSICAL_CONFIRMATION = "I consent to record this telemetry log";
export const RECORDER_ADAPTER_PROBE_CONFIRMATION =
  "I confirm propellers are removed and authorize a read-only adapter identity probe";
export const RECORDER_ADAPTER_READ_ONLY_COMMAND_IDS = [1, 2, 3, 4, 5, 160] as const;
export const D12_REFERENCE_RIG_IDS = [
  "ref_quad_kakute-h7-source-one-5in",
  "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
] as const;

export type D12ReferenceRigId = (typeof D12_REFERENCE_RIG_IDS)[number];
export type RecorderControlState = "inactive" | "recording" | "finished";

export interface DesktopBridgeStatus {
  enabled: boolean;
  reason: string;
  noAutoArm: true;
  policyRateHz: 50;
  supervisorRateHz: 200;
}

export interface DesktopSerialPort {
  name: string;
  kind: string;
}

export interface RecorderAdapterProbeRequest {
  port: string;
  baud: typeof RECORDER_BAUD;
  referenceRigId: typeof D12_REFERENCE_RIG_IDS[0];
  physicalConfirmation: typeof RECORDER_ADAPTER_PROBE_CONFIRMATION;
}

export interface RecorderAdapterProbe {
  schemaVersion: typeof RECORDER_ADAPTER_PROBE_SCHEMA_VERSION;
  adapterSchemaVersion: typeof RECORDER_ADAPTER_SCHEMA_VERSION;
  probeMaturity: "unattested-read-only-probe";
  referenceRigId: typeof D12_REFERENCE_RIG_IDS[0];
  sourcePortSha256: string;
  osDescriptorSha256: string;
  baud: typeof RECORDER_BAUD;
  observedAtUnixMs: number;
  firmware: "betaflight";
  firmwareVersion: string;
  mspProtocolVersion: 0;
  mspApiMajor: 1;
  mspApiMinor: 47;
  flightControllerVariant: "BTFL";
  boardIdentifier: string;
  targetName: "KAKUTEH7";
  boardName: string;
  manufacturerId: string;
  deviceUidSha256: string;
  identitySha256: string;
  preIdentityResponseSha256: string;
  postIdentityResponseSha256: string;
  transcriptSha256: string;
  readOnlyCommandIds: typeof RECORDER_ADAPTER_READ_ONLY_COMMAND_IDS;
  adapterProtocolVerified: true;
  stableIdentityObserved: true;
  deviceIdentityVerified: false;
  cryptographicDeviceAttestation: false;
  recordedDeviceAttested: false;
  fieldSessionVerified: false;
  sharingAuthorized: false;
  trainingReuseAuthorized: false;
  noAutoArm: true;
}

export interface RecorderControlStatus {
  schemaVersion: typeof RECORDER_CONTROL_SCHEMA_VERSION;
  state: RecorderControlState;
  artifactId: string | null;
  archivePath: string | null;
  manifestPath: string | null;
  referenceRigId: D12ReferenceRigId | null;
  contractHash: string | null;
  lockfileHash: string | null;
  sourcePortSha256: string | null;
  sourceBaud: typeof RECORDER_BAUD | null;
  sampleRateHz: number | null;
  startedAtUnixMs: number | null;
  captureMaturity: "local-serial-integration" | null;
  captureConsentConfirmed: boolean;
  recordedDeviceAttested: false;
  deviceIdentityVerified: false;
  fieldSessionVerified: false;
  userOwned: boolean;
  sharingAuthorized: false;
  trainingReuseAuthorized: false;
  noAutoArm: true;
}

export interface RecorderStartRequest {
  artifactId: string;
  outputDir: string;
  sampleRateHz: number;
  referenceRigId: D12ReferenceRigId;
  physicalConfirmation: typeof RECORDER_PHYSICAL_CONFIRMATION;
  port: string;
  baud: typeof RECORDER_BAUD;
  contractHash: string;
  lockfileHash: string;
  environment: Record<string, unknown>;
  seed: number;
}

export interface RecorderStopReceipt {
  schemaVersion: typeof RECORDER_RECEIPT_SCHEMA_VERSION;
  archiveSchemaVersion: typeof RECORDER_ARCHIVE_SCHEMA_VERSION;
  replaySchemaVersion: typeof REPLAY_SCHEMA_VERSION;
  frameSchemaVersion: typeof RECORDER_FRAME_SCHEMA_VERSION;
  artifactId: string;
  referenceRigId: D12ReferenceRigId;
  contractHash: string;
  lockfileHash: string;
  startedAtUnixMs: number;
  stoppedAtUnixMs: number;
  frameCount: number;
  durationS: number;
  frameFileSha256: string;
  indexFileSha256: string;
  replayFileSha256: string;
  sourcePortSha256: string;
  captureComplete: true;
  captureMaturity: "local-serial-integration";
  captureConsentConfirmed: true;
  recordedDeviceAttested: false;
  userOwned: true;
  sharingAuthorized: false;
  trainingReuseAuthorized: false;
  noAutoArm: true;
}

export interface RecorderArchiveInspection {
  schemaVersion: typeof RECORDER_INSPECTION_SCHEMA_VERSION;
  archiveSchemaVersion: typeof RECORDER_ARCHIVE_SCHEMA_VERSION;
  replaySchemaVersion: typeof REPLAY_SCHEMA_VERSION;
  receiptSchemaVersion: typeof RECORDER_RECEIPT_SCHEMA_VERSION;
  artifactId: string;
  archivePath: string;
  replayPath: string;
  referenceRigId: string;
  contractHash: string;
  lockfileHash: string;
  sourcePortSha256: string;
  sampleRateHz: number;
  startedAtUnixMs: number;
  stoppedAtUnixMs: number;
  frameCount: number;
  durationS: number;
  captureMaturity: "local-serial-integration";
  integrityVerified: true;
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

export const RECORDER_ARCHIVE_FILE_NAMES = [
  "forge-recorder-manifest.json",
  "telemetry.frames.jsonl",
  "telemetry.index.jsonl",
  "telemetry.replay.json",
  "forge-recorder-receipt.json",
] as const;

export type RecorderArchiveFileName = (typeof RECORDER_ARCHIVE_FILE_NAMES)[number];

export interface RecorderUploadFilePlan {
  name: RecorderArchiveFileName;
  contentType: "application/json" | "application/x-ndjson";
  byteSize: number;
  sha256: string;
}

export interface RecorderUploadPlan {
  schemaVersion: typeof RECORDER_UPLOAD_PLAN_SCHEMA_VERSION;
  archiveSchemaVersion: typeof RECORDER_ARCHIVE_SCHEMA_VERSION;
  inspectionSchemaVersion: typeof RECORDER_INSPECTION_SCHEMA_VERSION;
  artifactId: string;
  referenceRigId: D12ReferenceRigId;
  contractHash: string;
  lockfileHash: string;
  sourcePortSha256: string;
  sampleRateHz: number;
  startedAtUnixMs: number;
  stoppedAtUnixMs: number;
  frameCount: number;
  durationS: number;
  captureMaturity: "local-serial-integration";
  aggregateByteSize: number;
  files: RecorderUploadFilePlan[];
  localIntegrityVerified: true;
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

export interface RecorderObjectUploadContract {
  name: RecorderArchiveFileName;
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  byteSize: number;
  sha256: string;
}

export interface RecorderUploadReceipt {
  schemaVersion: typeof RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION;
  uploadPlanSchemaVersion: typeof RECORDER_UPLOAD_PLAN_SCHEMA_VERSION;
  artifactId: string;
  uploadedFileCount: 5;
  uploadedByteSize: number;
  localIntegrityVerified: true;
  gatewayObjectIntegrityVerified: false;
  recordedDeviceAttested: false;
  deviceIdentityVerified: false;
  fieldSessionVerified: false;
  sharingAuthorized: false;
  trainingReuseAuthorized: false;
  noAutoArm: true;
}

export interface DesktopCommandRuntime {
  available(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

const tauriRuntime: DesktopCommandRuntime = {
  available: isTauri,
  invoke,
};

const INSPECTION_FIELDS = [
  "schemaVersion",
  "archiveSchemaVersion",
  "replaySchemaVersion",
  "receiptSchemaVersion",
  "artifactId",
  "archivePath",
  "replayPath",
  "referenceRigId",
  "contractHash",
  "lockfileHash",
  "sourcePortSha256",
  "sampleRateHz",
  "startedAtUnixMs",
  "stoppedAtUnixMs",
  "frameCount",
  "durationS",
  "captureMaturity",
  "integrityVerified",
  "captureComplete",
  "captureConsentConfirmed",
  "userOwned",
  "sharingAuthorized",
  "trainingReuseAuthorized",
  "recordedDeviceAttested",
  "deviceIdentityVerified",
  "fieldSessionVerified",
  "noAutoArm",
] as const;

const BRIDGE_STATUS_FIELDS = [
  "enabled",
  "reason",
  "noAutoArm",
  "policyRateHz",
  "supervisorRateHz",
] as const;

const SERIAL_PORT_FIELDS = ["name", "kind"] as const;

const ADAPTER_PROBE_FIELDS = [
  "schemaVersion",
  "adapterSchemaVersion",
  "probeMaturity",
  "referenceRigId",
  "sourcePortSha256",
  "osDescriptorSha256",
  "baud",
  "observedAtUnixMs",
  "firmware",
  "firmwareVersion",
  "mspProtocolVersion",
  "mspApiMajor",
  "mspApiMinor",
  "flightControllerVariant",
  "boardIdentifier",
  "targetName",
  "boardName",
  "manufacturerId",
  "deviceUidSha256",
  "identitySha256",
  "preIdentityResponseSha256",
  "postIdentityResponseSha256",
  "transcriptSha256",
  "readOnlyCommandIds",
  "adapterProtocolVerified",
  "stableIdentityObserved",
  "deviceIdentityVerified",
  "cryptographicDeviceAttestation",
  "recordedDeviceAttested",
  "fieldSessionVerified",
  "sharingAuthorized",
  "trainingReuseAuthorized",
  "noAutoArm",
] as const;

const CONTROL_STATUS_FIELDS = [
  "schemaVersion",
  "state",
  "artifactId",
  "archivePath",
  "manifestPath",
  "referenceRigId",
  "contractHash",
  "lockfileHash",
  "sourcePortSha256",
  "sourceBaud",
  "sampleRateHz",
  "startedAtUnixMs",
  "captureMaturity",
  "captureConsentConfirmed",
  "recordedDeviceAttested",
  "deviceIdentityVerified",
  "fieldSessionVerified",
  "userOwned",
  "sharingAuthorized",
  "trainingReuseAuthorized",
  "noAutoArm",
] as const;

const STOP_RECEIPT_FIELDS = [
  "schemaVersion",
  "archiveSchemaVersion",
  "replaySchemaVersion",
  "frameSchemaVersion",
  "artifactId",
  "referenceRigId",
  "contractHash",
  "lockfileHash",
  "startedAtUnixMs",
  "stoppedAtUnixMs",
  "frameCount",
  "durationS",
  "frameFileSha256",
  "indexFileSha256",
  "replayFileSha256",
  "sourcePortSha256",
  "captureComplete",
  "captureMaturity",
  "captureConsentConfirmed",
  "recordedDeviceAttested",
  "userOwned",
  "sharingAuthorized",
  "trainingReuseAuthorized",
  "noAutoArm",
] as const;

const UPLOAD_PLAN_FIELDS = [
  "schemaVersion", "archiveSchemaVersion", "inspectionSchemaVersion", "artifactId",
  "referenceRigId", "contractHash", "lockfileHash", "sourcePortSha256", "sampleRateHz",
  "startedAtUnixMs", "stoppedAtUnixMs", "frameCount", "durationS", "captureMaturity",
  "aggregateByteSize", "files", "localIntegrityVerified", "captureComplete",
  "captureConsentConfirmed", "userOwned", "sharingAuthorized", "trainingReuseAuthorized",
  "recordedDeviceAttested", "deviceIdentityVerified", "fieldSessionVerified", "noAutoArm",
] as const;

const UPLOAD_FILE_FIELDS = ["name", "contentType", "byteSize", "sha256"] as const;

const UPLOAD_RECEIPT_FIELDS = [
  "schemaVersion", "uploadPlanSchemaVersion", "artifactId", "uploadedFileCount",
  "uploadedByteSize", "localIntegrityVerified", "gatewayObjectIntegrityVerified",
  "recordedDeviceAttested", "deviceIdentityVerified", "fieldSessionVerified",
  "sharingAuthorized", "trainingReuseAuthorized", "noAutoArm",
] as const;

export function desktopRecorderAvailable(runtime: DesktopCommandRuntime = tauriRuntime): boolean {
  return runtime.available();
}

export async function getDesktopBridgeStatus(
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<DesktopBridgeStatus> {
  requireDesktop(runtime, "recorder controls");
  return parseDesktopBridgeStatus(await runtime.invoke<unknown>("bridge_status"));
}

export async function listDesktopSerialPorts(
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<DesktopSerialPort[]> {
  requireDesktop(runtime, "recorder controls");
  return parseDesktopSerialPorts(await runtime.invoke<unknown>("list_serial_ports"));
}

export async function probeDesktopRecorderAdapter(
  request: RecorderAdapterProbeRequest,
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<RecorderAdapterProbe> {
  requireDesktop(runtime, "recorder adapter probing");
  if (!isRecord(request)
    || request.referenceRigId !== D12_REFERENCE_RIG_IDS[0]
    || request.physicalConfirmation !== RECORDER_ADAPTER_PROBE_CONFIRMATION
    || request.baud !== RECORDER_BAUD
    || typeof request.port !== "string"
    || request.port.trim() !== request.port
    || request.port.length === 0
    || utf8Length(request.port) > 4_096) {
    throw new Error("Desktop adapter probe request is outside the props-off D12 quad contract");
  }
  return parseRecorderAdapterProbe(await runtime.invoke<unknown>("probe_recorder_adapter", {
    request,
  }));
}

export function parseRecorderAdapterProbe(value: unknown): RecorderAdapterProbe {
  requireExactFields(value, ADAPTER_PROBE_FIELDS, "Desktop recorder adapter probe");
  if (value.schemaVersion !== RECORDER_ADAPTER_PROBE_SCHEMA_VERSION
    || value.adapterSchemaVersion !== RECORDER_ADAPTER_SCHEMA_VERSION
    || value.probeMaturity !== "unattested-read-only-probe") {
    throw new Error("Desktop recorder adapter probe declares an unsupported contract version");
  }
  if (value.referenceRigId !== D12_REFERENCE_RIG_IDS[0]
    || value.baud !== RECORDER_BAUD
    || !isBoundedSafeInteger(value.observedAtUnixMs, 0)
    || value.firmware !== "betaflight"
    || typeof value.firmwareVersion !== "string"
    || !/^2025\.12\.(?:0|[1-9][0-9]{0,2})$/.test(value.firmwareVersion)
    || Number(value.firmwareVersion.split(".")[2]) > 255
    || value.mspProtocolVersion !== 0
    || value.mspApiMajor !== 1
    || value.mspApiMinor !== 47
    || value.flightControllerVariant !== "BTFL"
    || typeof value.boardIdentifier !== "string"
    || !/^[A-Z0-9]{1,4}$/.test(value.boardIdentifier)
    || value.targetName !== "KAKUTEH7"
    || !isBoundedPrintableAscii(value.boardName, 1, 64)
    || !isBoundedPrintableAscii(value.manufacturerId, 1, 32)) {
    throw new Error("Desktop recorder adapter probe identity or numeric bounds are invalid");
  }
  for (const field of [
    "sourcePortSha256",
    "osDescriptorSha256",
    "deviceUidSha256",
    "identitySha256",
    "preIdentityResponseSha256",
    "postIdentityResponseSha256",
    "transcriptSha256",
  ] as const) {
    if (typeof value[field] !== "string" || !isSha256(value[field])) {
      throw new Error(`Desktop recorder adapter probe ${field} is not a lowercase SHA-256`);
    }
  }
  if (!Array.isArray(value.readOnlyCommandIds)
    || value.readOnlyCommandIds.length !== RECORDER_ADAPTER_READ_ONLY_COMMAND_IDS.length
    || value.readOnlyCommandIds.some((command, index) => command !== RECORDER_ADAPTER_READ_ONLY_COMMAND_IDS[index])) {
    throw new Error("Desktop recorder adapter probe command allowlist has drifted");
  }
  if (value.preIdentityResponseSha256 !== value.postIdentityResponseSha256
    || value.adapterProtocolVerified !== true
    || value.stableIdentityObserved !== true
    || value.deviceIdentityVerified !== false
    || value.cryptographicDeviceAttestation !== false
    || value.recordedDeviceAttested !== false
    || value.fieldSessionVerified !== false
    || value.sharingAuthorized !== false
    || value.trainingReuseAuthorized !== false
    || value.noAutoArm !== true) {
    throw new Error("Desktop recorder adapter probe stability or authority flags have drifted");
  }
  return value as unknown as RecorderAdapterProbe;
}

export async function getRecorderStatus(
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<RecorderControlStatus> {
  requireDesktop(runtime, "recorder controls");
  return parseRecorderControlStatus(await runtime.invoke<unknown>("recorder_status"));
}

export async function startDesktopRecorder(
  request: RecorderStartRequest,
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<RecorderControlStatus> {
  requireDesktop(runtime, "recorder controls");
  const normalized = validateRecorderStartRequest(request);
  const status = parseRecorderControlStatus(await runtime.invoke<unknown>("start_background_recording", {
    request: normalized,
  }));
  if (status.state !== "recording"
    || status.artifactId !== normalized.artifactId
    || status.archivePath !== normalized.outputDir
    || status.referenceRigId !== normalized.referenceRigId
    || status.contractHash !== normalized.contractHash
    || status.lockfileHash !== normalized.lockfileHash
    || status.sourceBaud !== normalized.baud
    || status.sampleRateHz !== normalized.sampleRateHz) {
    throw new Error("Desktop recorder start status does not match the admitted capture request");
  }
  return status;
}

export async function stopDesktopRecorder(
  expectedStatus: RecorderControlStatus,
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<RecorderStopReceipt> {
  requireDesktop(runtime, "recorder controls");
  if (expectedStatus.state === "inactive") {
    throw new Error("cannot stop an inactive Desktop recorder");
  }
  const receipt = parseRecorderStopReceipt(await runtime.invoke<unknown>("stop_background_recording"));
  if (receipt.artifactId !== expectedStatus.artifactId
    || receipt.referenceRigId !== expectedStatus.referenceRigId
    || receipt.contractHash !== expectedStatus.contractHash
    || receipt.lockfileHash !== expectedStatus.lockfileHash
    || receipt.sourcePortSha256 !== expectedStatus.sourcePortSha256
    || receipt.startedAtUnixMs !== expectedStatus.startedAtUnixMs) {
    throw new Error("Desktop recorder stop receipt does not match the active capture identity");
  }
  return receipt;
}

export async function inspectRecorderArchive(
  archivePath: string,
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<RecorderArchiveInspection> {
  if (!runtime.available()) {
    throw new Error("recorder archive inspection requires FORGE Desktop");
  }
  const normalizedPath = archivePath.trim();
  if (!normalizedPath || new TextEncoder().encode(normalizedPath).byteLength > 4_096) {
    throw new Error("archive path must contain 1 through 4096 UTF-8 bytes");
  }
  const response = await runtime.invoke<unknown>("inspect_recorder_archive", {
    archivePath: normalizedPath,
  });
  return parseRecorderArchiveInspection(response);
}

export async function prepareRecorderArchiveUpload(
  archivePath: string,
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<RecorderUploadPlan> {
  requireDesktop(runtime, "recorder archive materialization");
  const normalizedPath = normalizeArchivePath(archivePath);
  return parseRecorderUploadPlan(await runtime.invoke<unknown>("prepare_recorder_archive_upload", {
    archivePath: normalizedPath,
  }));
}

export async function uploadRecorderArchiveFiles(
  archivePath: string,
  plan: RecorderUploadPlan,
  uploads: RecorderObjectUploadContract[],
  runtime: DesktopCommandRuntime = tauriRuntime,
): Promise<RecorderUploadReceipt> {
  requireDesktop(runtime, "recorder archive materialization");
  const normalizedPath = normalizeArchivePath(archivePath);
  const normalizedPlan = parseRecorderUploadPlan(plan);
  validateRecorderObjectUploads(normalizedPlan, uploads);
  const receipt = parseRecorderUploadReceipt(await runtime.invoke<unknown>("upload_recorder_archive_files", {
    archivePath: normalizedPath,
    uploads,
  }));
  if (receipt.artifactId !== normalizedPlan.artifactId
    || receipt.uploadedFileCount !== normalizedPlan.files.length
    || receipt.uploadedByteSize !== normalizedPlan.aggregateByteSize) {
    throw new Error("Desktop recorder upload receipt does not match the prepared upload plan");
  }
  return receipt;
}

export function parseRecorderUploadPlan(value: unknown): RecorderUploadPlan {
  requireExactFields(value, UPLOAD_PLAN_FIELDS, "Desktop recorder upload plan");
  if (value.schemaVersion !== RECORDER_UPLOAD_PLAN_SCHEMA_VERSION
    || value.archiveSchemaVersion !== RECORDER_ARCHIVE_SCHEMA_VERSION
    || value.inspectionSchemaVersion !== RECORDER_INSPECTION_SCHEMA_VERSION) {
    throw new Error("Desktop recorder upload plan declares an unsupported format version");
  }
  if (typeof value.artifactId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(value.artifactId)
    || !isD12Rig(value.referenceRigId)) {
    throw new Error("Desktop recorder upload plan identity is invalid");
  }
  for (const field of ["contractHash", "lockfileHash", "sourcePortSha256"] as const) {
    if (typeof value[field] !== "string" || !isSha256(value[field])) {
      throw new Error(`Desktop recorder upload plan ${field} is not a lowercase SHA-256`);
    }
  }
  if (!isBoundedSafeInteger(value.sampleRateHz, 1, 1_000)
    || !isBoundedSafeInteger(value.startedAtUnixMs, 0)
    || !isBoundedSafeInteger(value.stoppedAtUnixMs, Number(value.startedAtUnixMs))
    || !isBoundedSafeInteger(value.frameCount, 1, 1_000_000)
    || typeof value.durationS !== "number" || !Number.isFinite(value.durationS)
    || value.durationS < 0 || value.durationS > Number.MAX_SAFE_INTEGER
    || !isBoundedSafeInteger(value.aggregateByteSize, 1, 512 * 1024 * 1024)) {
    throw new Error("Desktop recorder upload plan numeric bounds are invalid");
  }
  if (value.captureMaturity !== "local-serial-integration"
    || value.localIntegrityVerified !== true || value.captureComplete !== true
    || value.captureConsentConfirmed !== true || value.userOwned !== true
    || value.sharingAuthorized !== false || value.trainingReuseAuthorized !== false
    || value.recordedDeviceAttested !== false || value.deviceIdentityVerified !== false
    || value.fieldSessionVerified !== false || value.noAutoArm !== true) {
    throw new Error("Desktop recorder upload plan authority or privacy flags have drifted");
  }
  if (!Array.isArray(value.files) || value.files.length !== RECORDER_ARCHIVE_FILE_NAMES.length) {
    throw new Error("Desktop recorder upload plan must declare exactly five files");
  }
  const files = value.files.map((file, index) => {
    requireExactFields(file, UPLOAD_FILE_FIELDS, `Desktop recorder upload file ${index}`);
    const expectedName = RECORDER_ARCHIVE_FILE_NAMES[index];
    const expectedContentType = index === 1 || index === 2 ? "application/x-ndjson" : "application/json";
    if (file.name !== expectedName || file.contentType !== expectedContentType
      || !isBoundedSafeInteger(file.byteSize, 1, 512 * 1024 * 1024)
      || typeof file.sha256 !== "string" || !isSha256(file.sha256)) {
      throw new Error(`Desktop recorder upload file ${index} has drifted`);
    }
    return file as unknown as RecorderUploadFilePlan;
  });
  if (files.reduce((total, file) => total + file.byteSize, 0) !== value.aggregateByteSize) {
    throw new Error("Desktop recorder upload plan aggregate byte size has drifted");
  }
  return value as unknown as RecorderUploadPlan;
}

export function parseRecorderUploadReceipt(value: unknown): RecorderUploadReceipt {
  requireExactFields(value, UPLOAD_RECEIPT_FIELDS, "Desktop recorder upload receipt");
  if (value.schemaVersion !== RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION
    || value.uploadPlanSchemaVersion !== RECORDER_UPLOAD_PLAN_SCHEMA_VERSION) {
    throw new Error("Desktop recorder upload receipt declares an unsupported format version");
  }
  if (typeof value.artifactId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(value.artifactId)
    || value.uploadedFileCount !== 5
    || !isBoundedSafeInteger(value.uploadedByteSize, 1, 512 * 1024 * 1024)
    || value.localIntegrityVerified !== true || value.gatewayObjectIntegrityVerified !== false
    || value.recordedDeviceAttested !== false || value.deviceIdentityVerified !== false
    || value.fieldSessionVerified !== false || value.sharingAuthorized !== false
    || value.trainingReuseAuthorized !== false || value.noAutoArm !== true) {
    throw new Error("Desktop recorder upload receipt fields or authority have drifted");
  }
  return value as unknown as RecorderUploadReceipt;
}

function validateRecorderObjectUploads(
  plan: RecorderUploadPlan,
  uploads: RecorderObjectUploadContract[],
): void {
  if (!Array.isArray(uploads) || uploads.length !== plan.files.length) {
    throw new Error("recorder materialization requires exactly five upload contracts");
  }
  uploads.forEach((upload, index) => {
    const file = plan.files[index];
    const headerNames = isRecord(upload) && isRecord(upload.headers)
      ? Object.keys(upload.headers).map((name) => name.toLowerCase()).sort()
      : [];
    if (!isRecord(upload)
      || upload.name !== file.name || upload.method !== "PUT"
      || upload.byteSize !== file.byteSize || upload.sha256 !== file.sha256
      || typeof upload.url !== "string" || upload.url.length === 0 || utf8Length(upload.url) > 8_192
      || !isRecord(upload.headers)
      || headerNames.join("\0") !== "content-type\0x-amz-checksum-sha256"
      || upload.headers["content-type"] !== file.contentType
      || typeof upload.headers["x-amz-checksum-sha256"] !== "string") {
      throw new Error(`recorder upload contract ${index} does not match the prepared file plan`);
    }
  });
}

export function parseRecorderArchiveInspection(value: unknown): RecorderArchiveInspection {
  if (!isRecord(value)) throw new Error("Desktop recorder inspection response must be an object");
  const actualFields = Object.keys(value).sort();
  const expectedFields = [...INSPECTION_FIELDS].sort();
  if (actualFields.length !== expectedFields.length
    || actualFields.some((field, index) => field !== expectedFields[index])) {
    throw new Error("Desktop recorder inspection response fields have drifted");
  }
  if (value.schemaVersion !== RECORDER_INSPECTION_SCHEMA_VERSION
    || value.archiveSchemaVersion !== RECORDER_ARCHIVE_SCHEMA_VERSION
    || value.replaySchemaVersion !== REPLAY_SCHEMA_VERSION
    || value.receiptSchemaVersion !== RECORDER_RECEIPT_SCHEMA_VERSION) {
    throw new Error("Desktop recorder inspection response declares an unsupported format version");
  }
  for (const field of ["artifactId", "archivePath", "replayPath", "referenceRigId"] as const) {
    if (typeof value[field] !== "string" || value[field].length === 0 || value[field].length > 4_096) {
      throw new Error(`Desktop recorder inspection ${field} is invalid`);
    }
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value.artifactId as string)) {
    throw new Error("Desktop recorder inspection artifactId is outside archive v1");
  }
  if (value.referenceRigId !== "ref_quad_kakute-h7-source-one-5in"
    && value.referenceRigId !== "ref_rover_waveshare-ugv-rover-pt-pi5-ros2") {
    throw new Error("Desktop recorder inspection referenceRigId is not a frozen D12 rig");
  }
  if (!(value.replayPath as string).endsWith("/telemetry.replay.json")
    && !(value.replayPath as string).endsWith("\\telemetry.replay.json")) {
    throw new Error("Desktop recorder inspection replayPath is not the archive-v1 replay");
  }
  for (const field of ["contractHash", "lockfileHash", "sourcePortSha256"] as const) {
    if (typeof value[field] !== "string" || !/^[0-9a-f]{64}$/.test(value[field])) {
      throw new Error(`Desktop recorder inspection ${field} is not a lowercase SHA-256`);
    }
  }
  if (typeof value.sampleRateHz !== "number"
    || !Number.isSafeInteger(value.sampleRateHz) || value.sampleRateHz < 1 || value.sampleRateHz > 1_000
    || typeof value.startedAtUnixMs !== "number"
    || !Number.isSafeInteger(value.startedAtUnixMs) || value.startedAtUnixMs < 0
    || typeof value.stoppedAtUnixMs !== "number"
    || !Number.isSafeInteger(value.stoppedAtUnixMs) || value.stoppedAtUnixMs < value.startedAtUnixMs
    || typeof value.frameCount !== "number"
    || !Number.isSafeInteger(value.frameCount) || value.frameCount < 1 || value.frameCount > 1_000_000
    || typeof value.durationS !== "number" || !Number.isFinite(value.durationS) || value.durationS < 0) {
    throw new Error("Desktop recorder inspection numeric bounds are invalid");
  }
  if (value.captureMaturity !== "local-serial-integration"
    || value.integrityVerified !== true
    || value.captureComplete !== true
    || value.captureConsentConfirmed !== true
    || value.userOwned !== true
    || value.sharingAuthorized !== false
    || value.trainingReuseAuthorized !== false
    || value.recordedDeviceAttested !== false
    || value.deviceIdentityVerified !== false
    || value.fieldSessionVerified !== false
    || value.noAutoArm !== true) {
    throw new Error("Desktop recorder inspection authority or privacy flags have drifted");
  }
  return value as unknown as RecorderArchiveInspection;
}

export function parseDesktopBridgeStatus(value: unknown): DesktopBridgeStatus {
  requireExactFields(value, BRIDGE_STATUS_FIELDS, "Desktop bridge status");
  if (typeof value.enabled !== "boolean"
    || typeof value.reason !== "string"
    || value.reason.length === 0
    || utf8Length(value.reason) > 4_096
    || value.noAutoArm !== true
    || value.policyRateHz !== 50
    || value.supervisorRateHz !== 200) {
    throw new Error("Desktop bridge status fields or safety authority have drifted");
  }
  return value as unknown as DesktopBridgeStatus;
}

export function parseDesktopSerialPorts(value: unknown): DesktopSerialPort[] {
  if (!Array.isArray(value) || value.length > 256) {
    throw new Error("Desktop serial-port response must be an array of at most 256 ports");
  }
  return value.map((port, index) => {
    requireExactFields(port, SERIAL_PORT_FIELDS, `Desktop serial port ${index}`);
    if (typeof port.name !== "string" || port.name.length === 0 || utf8Length(port.name) > 4_096
      || typeof port.kind !== "string" || port.kind.length === 0 || utf8Length(port.kind) > 512) {
      throw new Error(`Desktop serial port ${index} is invalid`);
    }
    return port as unknown as DesktopSerialPort;
  });
}

export function parseRecorderControlStatus(value: unknown): RecorderControlStatus {
  requireExactFields(value, CONTROL_STATUS_FIELDS, "Desktop recorder control status");
  if (value.schemaVersion !== RECORDER_CONTROL_SCHEMA_VERSION
    || (value.state !== "inactive" && value.state !== "recording" && value.state !== "finished")) {
    throw new Error("Desktop recorder control status declares an unsupported version or state");
  }
  if (value.recordedDeviceAttested !== false
    || value.deviceIdentityVerified !== false
    || value.fieldSessionVerified !== false
    || value.sharingAuthorized !== false
    || value.trainingReuseAuthorized !== false
    || value.noAutoArm !== true) {
    throw new Error("Desktop recorder control status promotes unsupported authority");
  }
  if (value.state === "inactive") {
    if (value.artifactId !== null
      || value.archivePath !== null
      || value.manifestPath !== null
      || value.referenceRigId !== null
      || value.contractHash !== null
      || value.lockfileHash !== null
      || value.sourcePortSha256 !== null
      || value.sourceBaud !== null
      || value.sampleRateHz !== null
      || value.startedAtUnixMs !== null
      || value.captureMaturity !== null
      || value.captureConsentConfirmed !== false
      || value.userOwned !== false) {
      throw new Error("inactive Desktop recorder status contains active-capture authority");
    }
  } else {
    if (typeof value.artifactId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(value.artifactId)
      || typeof value.archivePath !== "string" || !validAbsolutePath(value.archivePath)
      || typeof value.manifestPath !== "string" || !validAbsolutePath(value.manifestPath)
      || (!value.manifestPath.endsWith("/forge-recorder-manifest.json")
        && !value.manifestPath.endsWith("\\forge-recorder-manifest.json"))
      || !isD12Rig(value.referenceRigId)
      || typeof value.contractHash !== "string" || !isSha256(value.contractHash)
      || typeof value.lockfileHash !== "string" || !isSha256(value.lockfileHash)
      || typeof value.sourcePortSha256 !== "string" || !isSha256(value.sourcePortSha256)
      || value.sourceBaud !== RECORDER_BAUD
      || typeof value.sampleRateHz !== "number"
      || !Number.isSafeInteger(value.sampleRateHz) || value.sampleRateHz < 1 || value.sampleRateHz > 1_000
      || typeof value.startedAtUnixMs !== "number"
      || !Number.isSafeInteger(value.startedAtUnixMs) || value.startedAtUnixMs < 0
      || value.captureMaturity !== "local-serial-integration"
      || value.captureConsentConfirmed !== true
      || value.userOwned !== true) {
      throw new Error("active Desktop recorder status fields have drifted");
    }
  }
  return value as unknown as RecorderControlStatus;
}

export function parseRecorderStopReceipt(value: unknown): RecorderStopReceipt {
  requireExactFields(value, STOP_RECEIPT_FIELDS, "Desktop recorder stop receipt");
  if (value.schemaVersion !== RECORDER_RECEIPT_SCHEMA_VERSION
    || value.archiveSchemaVersion !== RECORDER_ARCHIVE_SCHEMA_VERSION
    || value.replaySchemaVersion !== REPLAY_SCHEMA_VERSION
    || value.frameSchemaVersion !== RECORDER_FRAME_SCHEMA_VERSION) {
    throw new Error("Desktop recorder stop receipt declares an unsupported format version");
  }
  if (typeof value.artifactId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(value.artifactId)
    || !isD12Rig(value.referenceRigId)) {
    throw new Error("Desktop recorder stop receipt identity fields are invalid");
  }
  for (const field of [
    "contractHash",
    "lockfileHash",
    "frameFileSha256",
    "indexFileSha256",
    "replayFileSha256",
    "sourcePortSha256",
  ] as const) {
    if (typeof value[field] !== "string" || !isSha256(value[field])) {
      throw new Error(`Desktop recorder stop receipt ${field} is not a lowercase SHA-256`);
    }
  }
  if (typeof value.startedAtUnixMs !== "number"
    || !Number.isSafeInteger(value.startedAtUnixMs) || value.startedAtUnixMs < 0
    || typeof value.stoppedAtUnixMs !== "number"
    || !Number.isSafeInteger(value.stoppedAtUnixMs) || value.stoppedAtUnixMs < value.startedAtUnixMs
    || typeof value.frameCount !== "number"
    || !Number.isSafeInteger(value.frameCount) || value.frameCount < 1 || value.frameCount > 1_000_000
    || typeof value.durationS !== "number" || !Number.isFinite(value.durationS) || value.durationS < 0) {
    throw new Error("Desktop recorder stop receipt numeric bounds are invalid");
  }
  if (value.captureComplete !== true
    || value.captureMaturity !== "local-serial-integration"
    || value.captureConsentConfirmed !== true
    || value.recordedDeviceAttested !== false
    || value.userOwned !== true
    || value.sharingAuthorized !== false
    || value.trainingReuseAuthorized !== false
    || value.noAutoArm !== true) {
    throw new Error("Desktop recorder stop receipt authority or privacy flags have drifted");
  }
  return value as unknown as RecorderStopReceipt;
}

function validateRecorderStartRequest(request: RecorderStartRequest): RecorderStartRequest {
  const artifactId = request.artifactId.trim();
  const outputDir = request.outputDir.trim();
  const port = request.port.trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(artifactId)) {
    throw new Error("recorder artifact ID must use 1 through 128 safe ASCII characters");
  }
  if (!validAbsolutePath(outputDir)) {
    throw new Error("recorder output directory must be an absolute path of at most 4096 UTF-8 bytes");
  }
  if (!Number.isSafeInteger(request.sampleRateHz)
    || request.sampleRateHz < 1 || request.sampleRateHz > 1_000) {
    throw new Error("recorder sample rate must be an integer from 1 through 1000 Hz");
  }
  if (!isD12Rig(request.referenceRigId)) {
    throw new Error("recorder reference rig must be one frozen D12 rig");
  }
  if (request.physicalConfirmation !== RECORDER_PHYSICAL_CONFIRMATION) {
    throw new Error("recorder capture consent phrase mismatch");
  }
  if (port.length === 0 || utf8Length(port) > 4_096 || request.baud !== RECORDER_BAUD) {
    throw new Error("recorder capture requires one bounded serial port at 115200 baud");
  }
  if (!isSha256(request.contractHash) || !isSha256(request.lockfileHash)) {
    throw new Error("recorder contract and lockfile hashes must be lowercase SHA-256 values");
  }
  validateBoundedEnvironment(request.environment);
  if (!Number.isSafeInteger(request.seed) || request.seed < 0) {
    throw new Error("recorder seed must be a non-negative safe integer");
  }
  return { ...request, artifactId, outputDir, port };
}

function validateBoundedEnvironment(value: unknown): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new Error("recorder environment must be an object");
  let nodes = 0;
  const visit = (item: unknown, depth: number): void => {
    if (depth > 32 || ++nodes > 2_048) {
      throw new Error("recorder environment exceeds the depth or node bound");
    }
    if (typeof item === "number" && !Number.isFinite(item)) {
      throw new Error("recorder environment numbers must be finite");
    }
    if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number") return;
    if (Array.isArray(item)) {
      item.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (isRecord(item)) {
      Object.values(item).forEach((child) => visit(child, depth + 1));
      return;
    }
    throw new Error("recorder environment contains an unsupported JSON value");
  };
  visit(value, 0);
  const encoded = JSON.stringify(value);
  if (utf8Length(encoded) > 64 * 1_024) {
    throw new Error("recorder environment exceeds 65536 UTF-8 bytes");
  }
}

function requireDesktop(runtime: DesktopCommandRuntime, surface: string): void {
  if (!runtime.available()) throw new Error(`${surface} require FORGE Desktop`);
}

function requireExactFields<const T extends readonly string[]>(
  value: unknown,
  expected: T,
  label: string,
): asserts value is Record<T[number], unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  const actualFields = Object.keys(value).sort();
  const expectedFields = [...expected].sort();
  if (actualFields.length !== expectedFields.length
    || actualFields.some((field, index) => field !== expectedFields[index])) {
    throw new Error(`${label} fields have drifted`);
  }
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isBoundedPrintableAscii(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === "string"
    && value.length >= minimum
    && value.length <= maximum
    && /^[\x20-\x7e]+$/.test(value);
}

function normalizeArchivePath(value: string): string {
  const normalized = value.trim();
  if (!validAbsolutePath(normalized)) {
    throw new Error("archive path must be absolute and contain 1 through 4096 UTF-8 bytes");
  }
  return normalized;
}

function isBoundedSafeInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum;
}

function validAbsolutePath(value: string): boolean {
  if (value.length === 0 || utf8Length(value) > 4_096) return false;
  return value.startsWith("/")
    || /^[A-Za-z]:[\\/]/.test(value)
    || /^\\\\[^\\/]+[\\/][^\\/]+/.test(value);
}

function isD12Rig(value: unknown): value is D12ReferenceRigId {
  return typeof value === "string" && (D12_REFERENCE_RIG_IDS as readonly string[]).includes(value);
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
