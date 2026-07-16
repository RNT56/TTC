import { invoke, isTauri } from "@tauri-apps/api/core";

export const RECORDER_INSPECTION_SCHEMA_VERSION = "forge-recorder-inspection/1.0.0";
export const RECORDER_ARCHIVE_SCHEMA_VERSION = "forge-recorder-archive/1.0.0";
export const RECORDER_RECEIPT_SCHEMA_VERSION = "forge-recorder-receipt/1.0.0";
export const REPLAY_SCHEMA_VERSION = "1.0.0";

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

export function desktopRecorderAvailable(runtime: DesktopCommandRuntime = tauriRuntime): boolean {
  return runtime.available();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
