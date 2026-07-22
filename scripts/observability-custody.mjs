#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_OBSERVABILITY_SIGNAL_SET_BYTES,
  OBSERVABILITY_SIGNAL_SET_VERSION,
  serializeObservabilitySignalSet,
  validateObservabilitySignalSet,
} from "./observability-signals.mjs";

export const OBSERVABILITY_CUSTODY_POLICY_VERSION = "1.0.0";
export const OBSERVABILITY_CUSTODY_ARTIFACT_VERSION = "1.0.0";
export const OBSERVABILITY_CUSTODY_ARTIFACT_SCHEMA =
  `forge-observability-custody-artifact/${OBSERVABILITY_CUSTODY_ARTIFACT_VERSION}`;
export const MAX_OBSERVABILITY_CUSTODY_RECORDS = 128;
export const MAX_OBSERVABILITY_CUSTODY_ARTIFACT_BYTES = 8_192;
export const OBSERVABILITY_CUSTODY_RETENTION_SECONDS = 86_400;

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIR, "..");
const POLICY_PATH = join(
  REPOSITORY_ROOT,
  "infra/observability/observability-custody-policy.v1.json",
);
const SCHEMA_PATH = join(
  REPOSITORY_ROOT,
  "schema/forge-observability-custody-artifact.schema.json",
);
const SUBDIRECTORIES = ["deletions", "objects", "records"];
const QUERY_KINDS = ["metric-series", "summary", "trace-spans"];
const DELETION_REASONS = ["manual", "retention"];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ARTIFACT_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/;
const DENY_FIELDS = [
  "authorization",
  "body",
  "cookie",
  "errorMessage",
  "headers",
  "idempotencyKey",
  "jobInput",
  "jobOutput",
  "leaseToken",
  "modelBytes",
  "personalData",
  "presignedUrl",
  "prompt",
  "query",
  "secretReference",
  "telemetry",
  "url",
];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...expected].sort());
}

function exactArray(value, expected) {
  return Array.isArray(value) && JSON.stringify(value) === JSON.stringify(expected);
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function canonicalTimestamp(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value;
}

function timestampAfter(value, seconds) {
  return new Date(Date.parse(value) + seconds * 1_000).toISOString();
}

function forbiddenPath(value, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = forbiddenPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const [key, nested] of Object.entries(value)) {
    if (DENY_FIELDS.includes(key)) return `${path}.${key}`;
    const found = forbiddenPath(nested, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function validateStoredArtifact(value, errors) {
  add(errors, exactKeys(value, [
    "schemaVersion", "kind", "recordId", "createdAt", "source", "storage",
    "lifecycle", "authority",
  ]), "stored custody artifact top-level fields are invalid");
  add(errors, canonicalTimestamp(value.createdAt), "stored custody artifact createdAt is invalid");
  add(errors, exactKeys(value.source, [
    "signalSetSchemaVersion", "signalSetId", "sha256", "bytes",
    "metricSeriesCount", "traceSpanCount",
  ]), "stored custody artifact source fields are invalid");
  add(
    errors,
    value.source?.signalSetSchemaVersion ===
      `forge-observability-signal-set/${OBSERVABILITY_SIGNAL_SET_VERSION}`,
    "stored custody artifact signal-set version is invalid",
  );
  add(errors, typeof value.source?.signalSetId === "string" && UUID_V4.test(value.source.signalSetId), "stored custody artifact signal-set ID is invalid");
  add(errors, typeof value.source?.sha256 === "string" && SHA256.test(value.source.sha256), "stored custody artifact digest is invalid");
  add(errors, Number.isInteger(value.source?.bytes) && value.source.bytes >= 1 && value.source.bytes <= MAX_OBSERVABILITY_SIGNAL_SET_BYTES, "stored custody artifact byte count is invalid");
  add(errors, Number.isInteger(value.source?.metricSeriesCount) && value.source.metricSeriesCount >= 1 && value.source.metricSeriesCount <= 64, "stored custody artifact metric count is invalid");
  add(errors, Number.isInteger(value.source?.traceSpanCount) && value.source.traceSpanCount >= 0 && value.source.traceSpanCount <= 32, "stored custody artifact trace count is invalid");
  add(errors, exactKeys(value.storage, [
    "backend", "objectPath", "rootMode", "objectMode", "network",
    "durableAcrossProcess",
  ]), "stored custody artifact storage fields are invalid");
  add(errors, value.storage?.backend === "local-file-fixture", "custody backend is invalid");
  add(errors, value.storage?.objectPath === `objects/${value.recordId}.json`, "custody object path is invalid");
  add(errors, value.storage?.rootMode === "0700" && value.storage?.objectMode === "0600", "custody file modes are invalid");
  add(errors, value.storage?.network === "none", "custody fixture cannot use a network");
  add(errors, value.storage?.durableAcrossProcess === true, "custody fixture must preserve an independently readable object");
  add(errors, exactKeys(value.lifecycle, ["dataClass", "retentionSeconds", "expiresAt"]), "stored custody lifecycle fields are invalid");
  add(errors, value.lifecycle?.dataClass === "operational-telemetry-fixture", "custody data class is invalid");
  add(errors, value.lifecycle?.retentionSeconds === OBSERVABILITY_CUSTODY_RETENTION_SECONDS, "custody retention duration drifted");
  add(errors, canonicalTimestamp(value.lifecycle?.expiresAt), "custody expiry is invalid");
  if (canonicalTimestamp(value.createdAt)) {
    add(
      errors,
      value.lifecycle?.expiresAt === timestampAfter(value.createdAt, OBSERVABILITY_CUSTODY_RETENTION_SECONDS),
      "custody expiry does not match the retention contract",
    );
  }
  add(errors, exactKeys(value.authority, [
    "productAuthority", "ownerScopedExport", "geographicResidency",
    "highAvailability", "managedCustody",
  ]), "stored custody authority fields are invalid");
  add(errors, value.authority?.productAuthority === "independent", "custody must remain product-authority independent");
  add(errors, value.authority?.ownerScopedExport === false, "local custody cannot claim owner-scoped export");
  add(errors, value.authority?.geographicResidency === null, "local custody cannot claim geographic residency");
  add(errors, value.authority?.highAvailability === false, "local custody cannot claim high availability");
  add(errors, value.authority?.managedCustody === false, "local custody cannot claim managed custody");
}

function validateDeletionArtifact(value, errors) {
  add(errors, exactKeys(value, [
    "schemaVersion", "kind", "recordId", "deletedAt", "reason", "source", "authority",
  ]), "deletion custody artifact top-level fields are invalid");
  add(errors, canonicalTimestamp(value.deletedAt), "custody deletion timestamp is invalid");
  add(errors, DELETION_REASONS.includes(value.reason), "custody deletion reason is invalid");
  add(errors, exactKeys(value.source, ["sha256", "bytes"]), "custody deletion source fields are invalid");
  add(errors, typeof value.source?.sha256 === "string" && SHA256.test(value.source.sha256), "custody deletion digest is invalid");
  add(errors, Number.isInteger(value.source?.bytes) && value.source.bytes >= 1 && value.source.bytes <= MAX_OBSERVABILITY_SIGNAL_SET_BYTES, "custody deletion byte count is invalid");
  add(errors, exactKeys(value.authority, ["objectAbsent", "productAuthority", "managedCustody"]), "custody deletion authority fields are invalid");
  add(errors, value.authority?.objectAbsent === true, "custody deletion cannot claim an extant object");
  add(errors, value.authority?.productAuthority === "independent", "custody deletion must remain authority independent");
  add(errors, value.authority?.managedCustody === false, "custody deletion cannot claim managed custody");
}

export function validateCustodyArtifact(value) {
  const errors = [];
  if (!isObject(value)) return ["custody artifact must be an object"];
  add(errors, value.schemaVersion === OBSERVABILITY_CUSTODY_ARTIFACT_SCHEMA, "custody artifact schemaVersion is unsupported");
  add(errors, typeof value.recordId === "string" && UUID_V4.test(value.recordId), "custody record ID is invalid");
  if (value.kind === "stored") validateStoredArtifact(value, errors);
  else if (value.kind === "deleted") validateDeletionArtifact(value, errors);
  else errors.push("custody artifact kind is invalid");
  const denied = forbiddenPath(value);
  add(errors, denied === null, denied ? `${denied} is forbidden` : "custody artifact contains forbidden data");
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    errors.push("custody artifact must be JSON serializable");
  }
  if (serialized !== undefined) {
    add(errors, Buffer.byteLength(serialized, "utf8") <= MAX_OBSERVABILITY_CUSTODY_ARTIFACT_BYTES, "custody artifact exceeds its byte bound");
  }
  return errors;
}

function currentUserOwns(stat) {
  return typeof process.getuid !== "function" || stat.uid === process.getuid();
}

function privateMode(stat, expected) {
  return (stat.mode & 0o777) === expected;
}

function validateRootPath(root) {
  if (typeof root !== "string" || !isAbsolute(root) || resolve(root) !== root) {
    throw new Error("custody root must be an exact absolute path");
  }
  if (root === parse(root).root) throw new Error("custody root cannot be a filesystem root");
  const fromRepository = relative(REPOSITORY_ROOT, root);
  if (fromRepository === "" || (!fromRepository.startsWith("..") && !isAbsolute(fromRepository))) {
    throw new Error("custody root must be outside the repository checkout");
  }
  return root;
}

function assertPrivateDirectory(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("custody directory is not a private regular directory");
  if (!privateMode(stat, 0o700) || !currentUserOwns(stat)) throw new Error("custody directory ownership or mode is invalid");
}

function assertPrivateFile(path, maxBytes) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("custody file is not a private regular file");
  if (!privateMode(stat, 0o600) || !currentUserOwns(stat)) throw new Error("custody file ownership or mode is invalid");
  if (stat.size < 1 || stat.size > maxBytes) throw new Error("custody file size is invalid");
  return stat;
}

function fsyncDirectory(path) {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function ensureCustodyRoot(root, { createDirectories = true } = {}) {
  validateRootPath(root);
  assertPrivateDirectory(root);
  for (const name of SUBDIRECTORIES) {
    const path = join(root, name);
    if (!existsSync(path)) {
      if (!createDirectories) throw new Error("custody root is not initialized");
      mkdirSync(path, { mode: 0o700 });
      chmodSync(path, 0o700);
      fsyncDirectory(root);
    }
    assertPrivateDirectory(path);
  }
  return root;
}

export function initializeCustodyRoot(root) {
  return ensureCustodyRoot(root);
}

function prepareWrite(path, bytes, mode) {
  if (existsSync(path)) throw new Error("custody destination already exists");
  const temporary = `${path}.tmp-${randomUUID()}`;
  const descriptor = openSync(temporary, "wx", mode);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } catch (error) {
    closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
  closeSync(descriptor);
  chmodSync(temporary, mode);
  return temporary;
}

function publishPrepared(temporary, destination) {
  if (existsSync(destination)) throw new Error("custody destination already exists");
  renameSync(temporary, destination);
  fsyncDirectory(dirname(destination));
}

function atomicWrite(path, bytes, mode) {
  const temporary = prepareWrite(path, bytes, mode);
  try {
    publishPrepared(temporary, path);
  } catch (error) {
    if (existsSync(temporary)) unlinkSync(temporary);
    throw error;
  }
}

function withMutationLock(root, operation) {
  const lockPath = join(root, ".mutation-lock");
  const descriptor = openSync(lockPath, "wx", 0o600);
  try {
    try {
      writeFileSync(descriptor, `${process.pid}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
      fsyncDirectory(root);
    }
    throw error;
  }
  try {
    return operation();
  } finally {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
      fsyncDirectory(root);
    }
  }
}

function artifactPath(root, directory, recordId) {
  if (typeof recordId !== "string" || !UUID_V4.test(recordId)) {
    throw new Error("custody record ID is invalid");
  }
  return join(root, directory, `${recordId}.json`);
}

function loadArtifact(path) {
  assertPrivateFile(path, MAX_OBSERVABILITY_CUSTODY_ARTIFACT_BYTES);
  let artifact;
  try {
    artifact = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("custody artifact is invalid JSON");
  }
  const errors = validateCustodyArtifact(artifact);
  if (errors.length > 0) throw new Error(`custody artifact failed validation: ${errors.join("; ")}`);
  return artifact;
}

function listArtifactIds(root, directory) {
  const ids = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const match = ARTIFACT_NAME.exec(entry.name);
    if (!entry.isFile() || !match) throw new Error("custody directory contains an unexpected entry");
    ids.push(match[1]);
  }
  return ids.sort();
}

function storedArtifact(recordId, createdAt, signalSet, bytes, sha256) {
  return {
    schemaVersion: OBSERVABILITY_CUSTODY_ARTIFACT_SCHEMA,
    kind: "stored",
    recordId,
    createdAt,
    source: {
      signalSetSchemaVersion: signalSet.schemaVersion,
      signalSetId: signalSet.signalSetId,
      sha256,
      bytes: bytes.length,
      metricSeriesCount: signalSet.metricSeries.length,
      traceSpanCount: signalSet.traceSpans.length,
    },
    storage: {
      backend: "local-file-fixture",
      objectPath: `objects/${recordId}.json`,
      rootMode: "0700",
      objectMode: "0600",
      network: "none",
      durableAcrossProcess: true,
    },
    lifecycle: {
      dataClass: "operational-telemetry-fixture",
      retentionSeconds: OBSERVABILITY_CUSTODY_RETENTION_SECONDS,
      expiresAt: timestampAfter(createdAt, OBSERVABILITY_CUSTODY_RETENTION_SECONDS),
    },
    authority: {
      productAuthority: "independent",
      ownerScopedExport: false,
      geographicResidency: null,
      highAvailability: false,
      managedCustody: false,
    },
  };
}

export function storeObservabilitySignalSet(
  root,
  signalSet,
  { createdAt = new Date() } = {},
) {
  ensureCustodyRoot(root);
  const recordId = randomUUID();
  const signalErrors = validateObservabilitySignalSet(signalSet);
  if (signalErrors.length > 0) {
    throw new Error(`unsafe observability custody refused: ${signalErrors.join("; ")}`);
  }
  if (!(createdAt instanceof Date) || !Number.isFinite(createdAt.getTime())) {
    throw new Error("unsafe observability custody refused: createdAt must be a valid Date");
  }
  if (typeof recordId !== "string" || !UUID_V4.test(recordId)) {
    throw new Error("unsafe observability custody refused: record ID is invalid");
  }
  const bytes = Buffer.from(serializeObservabilitySignalSet(signalSet), "utf8");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const record = storedArtifact(recordId, createdAt.toISOString(), signalSet, bytes, sha256);
  const recordErrors = validateCustodyArtifact(record);
  if (recordErrors.length > 0) {
    throw new Error(`unsafe observability custody refused: ${recordErrors.join("; ")}`);
  }
  return withMutationLock(root, () => {
    if (listArtifactIds(root, "records").length >= MAX_OBSERVABILITY_CUSTODY_RECORDS) {
      throw new Error("observability custody live-record bound reached");
    }
    const objectPath = artifactPath(root, "objects", recordId);
    const recordPath = artifactPath(root, "records", recordId);
    const deletionPath = artifactPath(root, "deletions", recordId);
    if (existsSync(objectPath) || existsSync(recordPath) || existsSync(deletionPath)) {
      throw new Error("observability custody record identity already exists");
    }
    atomicWrite(objectPath, bytes, 0o600);
    try {
      atomicWrite(recordPath, Buffer.from(JSON.stringify(record), "utf8"), 0o600);
    } catch (error) {
      if (existsSync(objectPath)) {
        unlinkSync(objectPath);
        fsyncDirectory(join(root, "objects"));
      }
      throw error;
    }
    return record;
  });
}

export function readCustodyRecord(root, recordId) {
  ensureCustodyRoot(root, { createDirectories: false });
  const recordPath = artifactPath(root, "records", recordId);
  if (!existsSync(recordPath)) throw new Error("custody record does not exist");
  const record = loadArtifact(recordPath);
  if (record.kind !== "stored" || record.recordId !== recordId) {
    throw new Error("custody live record identity is invalid");
  }
  const objectPath = artifactPath(root, "objects", recordId);
  const stat = assertPrivateFile(objectPath, MAX_OBSERVABILITY_SIGNAL_SET_BYTES);
  if (stat.size !== record.source.bytes) throw new Error("custody object byte count drifted");
  const bytes = readFileSync(objectPath);
  if (createHash("sha256").update(bytes).digest("hex") !== record.source.sha256) {
    throw new Error("custody object digest drifted");
  }
  let signalSet;
  try {
    signalSet = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("custody object is invalid JSON");
  }
  const signalErrors = validateObservabilitySignalSet(signalSet);
  if (signalErrors.length > 0) throw new Error(`custody signal set failed validation: ${signalErrors.join("; ")}`);
  if (
    signalSet.schemaVersion !== record.source.signalSetSchemaVersion ||
    signalSet.signalSetId !== record.source.signalSetId ||
    signalSet.metricSeries.length !== record.source.metricSeriesCount ||
    signalSet.traceSpans.length !== record.source.traceSpanCount
  ) {
    throw new Error("custody record does not bind the stored signal set");
  }
  return { record, signalSet };
}

export function queryCustodyRecord(root, recordId, kind) {
  if (!QUERY_KINDS.includes(kind)) throw new Error("custody query kind is invalid");
  const { record, signalSet } = readCustodyRecord(root, recordId);
  if (kind === "metric-series") return signalSet.metricSeries;
  if (kind === "trace-spans") return signalSet.traceSpans;
  return {
    schemaVersion: record.schemaVersion,
    recordId: record.recordId,
    createdAt: record.createdAt,
    expiresAt: record.lifecycle.expiresAt,
    source: { ...record.source },
    authority: { ...record.authority },
  };
}

function deletionArtifact(record, deletedAt, reason) {
  return {
    schemaVersion: OBSERVABILITY_CUSTODY_ARTIFACT_SCHEMA,
    kind: "deleted",
    recordId: record.recordId,
    deletedAt,
    reason,
    source: {
      sha256: record.source.sha256,
      bytes: record.source.bytes,
    },
    authority: {
      objectAbsent: true,
      productAuthority: "independent",
      managedCustody: false,
    },
  };
}

function deleteUnlocked(root, recordId, reason, deletedAt) {
  const { record } = readCustodyRecord(root, recordId);
  if (!DELETION_REASONS.includes(reason)) throw new Error("custody deletion reason is invalid");
  if (!(deletedAt instanceof Date) || !Number.isFinite(deletedAt.getTime())) {
    throw new Error("custody deletion timestamp is invalid");
  }
  if (deletedAt.getTime() < Date.parse(record.createdAt)) {
    throw new Error("custody deletion predates storage");
  }
  if (reason === "retention" && deletedAt.getTime() < Date.parse(record.lifecycle.expiresAt)) {
    throw new Error("custody retention deletion is premature");
  }
  const receipt = deletionArtifact(record, deletedAt.toISOString(), reason);
  const receiptErrors = validateCustodyArtifact(receipt);
  if (receiptErrors.length > 0) throw new Error(`custody deletion receipt is invalid: ${receiptErrors.join("; ")}`);
  const objectPath = artifactPath(root, "objects", recordId);
  const recordPath = artifactPath(root, "records", recordId);
  const deletionPath = artifactPath(root, "deletions", recordId);
  const temporaryReceipt = prepareWrite(
    deletionPath,
    Buffer.from(JSON.stringify(receipt), "utf8"),
    0o600,
  );
  let objectRemoved = false;
  try {
    unlinkSync(objectPath);
    objectRemoved = true;
    fsyncDirectory(join(root, "objects"));
    publishPrepared(temporaryReceipt, deletionPath);
    unlinkSync(recordPath);
    fsyncDirectory(join(root, "records"));
  } catch (error) {
    if (!objectRemoved && existsSync(temporaryReceipt)) unlinkSync(temporaryReceipt);
    throw error;
  }
  return receipt;
}

export function deleteCustodyRecord(
  root,
  recordId,
  { reason = "manual", deletedAt = new Date() } = {},
) {
  ensureCustodyRoot(root, { createDirectories: false });
  return withMutationLock(root, () => deleteUnlocked(root, recordId, reason, deletedAt));
}

export function sweepCustodyRoot(root, { at = new Date() } = {}) {
  ensureCustodyRoot(root, { createDirectories: false });
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new Error("custody sweep timestamp is invalid");
  return withMutationLock(root, () => {
    const deleted = [];
    for (const recordId of listArtifactIds(root, "records")) {
      const { record } = readCustodyRecord(root, recordId);
      if (at.getTime() >= Date.parse(record.lifecycle.expiresAt)) {
        deleted.push(deleteUnlocked(root, recordId, "retention", at).recordId);
      }
    }
    return { at: at.toISOString(), deleted };
  });
}

export function auditCustodyRoot(root) {
  const issues = [];
  try {
    ensureCustodyRoot(root, { createDirectories: false });
  } catch {
    return { ok: false, liveRecords: 0, deletionReceipts: 0, issues: ["ROOT_INVALID"] };
  }
  const rootEntries = readdirSync(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!SUBDIRECTORIES.includes(entry.name) || !entry.isDirectory()) {
      issues.push("ROOT_ENTRY_UNEXPECTED");
    }
  }
  let recordIds = [];
  let objectIds = [];
  let deletionIds = [];
  try {
    recordIds = listArtifactIds(root, "records");
  } catch {
    issues.push("RECORD_DIRECTORY_INVALID");
  }
  try {
    objectIds = listArtifactIds(root, "objects");
  } catch {
    issues.push("OBJECT_DIRECTORY_INVALID");
  }
  try {
    deletionIds = listArtifactIds(root, "deletions");
  } catch {
    issues.push("DELETION_DIRECTORY_INVALID");
  }
  const records = new Set(recordIds);
  const objects = new Set(objectIds);
  const deletions = new Set(deletionIds);
  if (recordIds.length > MAX_OBSERVABILITY_CUSTODY_RECORDS) issues.push("LIVE_RECORD_BOUND_EXCEEDED");
  for (const recordId of recordIds) {
    if (deletions.has(recordId)) issues.push("LIVE_AND_DELETED_CONFLICT");
    try {
      readCustodyRecord(root, recordId);
    } catch {
      issues.push("LIVE_RECORD_INVALID");
    }
  }
  for (const objectId of objectIds) {
    if (!records.has(objectId)) issues.push("OBJECT_ORPHANED");
  }
  for (const deletionId of deletionIds) {
    if (records.has(deletionId) || objects.has(deletionId)) issues.push("DELETION_INCOMPLETE");
    try {
      const receipt = loadArtifact(artifactPath(root, "deletions", deletionId));
      if (receipt.kind !== "deleted" || receipt.recordId !== deletionId) {
        issues.push("DELETION_RECEIPT_INVALID");
      }
    } catch {
      issues.push("DELETION_RECEIPT_INVALID");
    }
  }
  return {
    ok: issues.length === 0,
    liveRecords: recordIds.length,
    deletionReceipts: deletionIds.length,
    issues: [...new Set(issues)].sort(),
  };
}

export function validateObservabilityCustodyPolicy(
  policy,
  schema = loadJson(SCHEMA_PATH),
) {
  const errors = [];
  add(errors, exactKeys(policy, [
    "schemaVersion", "custodyArtifactVersion", "custodyArtifactSchema",
    "acceptedSignalSetVersions", "acceptedDeliveryBatchVersions",
    "acceptedEventVersions", "decision", "status", "storage", "lifecycle",
    "query", "audit", "denyFields", "maturity",
  ]), "custody policy top-level fields are invalid");
  add(errors, policy.schemaVersion === `forge-observability-custody-policy/${OBSERVABILITY_CUSTODY_POLICY_VERSION}`, "custody policy schemaVersion is invalid");
  add(errors, policy.custodyArtifactVersion === OBSERVABILITY_CUSTODY_ARTIFACT_VERSION, "custody artifact version drifted");
  add(errors, policy.custodyArtifactSchema === "schema/forge-observability-custody-artifact.schema.json", "custody schema path is invalid");
  add(errors, exactArray(policy.acceptedSignalSetVersions, [OBSERVABILITY_SIGNAL_SET_VERSION]), "custody accepted signal-set versions are invalid");
  add(errors, exactArray(policy.acceptedDeliveryBatchVersions, ["1.0.0"]), "custody accepted delivery versions are invalid");
  add(errors, exactArray(policy.acceptedEventVersions, ["3.0.0"]), "custody accepted event versions are invalid");
  add(errors, policy.decision === "D76", "custody policy must cite D76");
  add(errors, policy.status === "contract-fixture", "custody policy cannot claim maturity above contract-fixture");
  add(errors, exactKeys(policy.storage, [
    "backend", "root", "rootMode", "directoryMode", "objectMode", "objectWrite",
    "recordWrite", "deduplication", "network", "credentials", "maxLiveRecords",
    "maxSignalSetBytes", "maxArtifactBytes",
  ]), "custody storage fields are invalid");
  add(errors, policy.storage?.backend === "local-file-fixture", "custody backend drifted");
  add(errors, policy.storage?.root === "operator-created-absolute-private-directory-outside-checkout", "custody root authority drifted");
  add(errors, policy.storage?.rootMode === "0700" && policy.storage?.directoryMode === "0700" && policy.storage?.objectMode === "0600", "custody private modes drifted");
  add(errors, policy.storage?.objectWrite === "exclusive-temp-fsync-atomic-rename" && policy.storage?.recordWrite === "exclusive-temp-fsync-atomic-rename", "custody write contract drifted");
  add(errors, policy.storage?.deduplication === "none", "custody fixture cannot deduplicate identities");
  add(errors, policy.storage?.network === "none" && policy.storage?.credentials === "none", "custody fixture cannot use network credentials");
  add(errors, policy.storage?.maxLiveRecords === MAX_OBSERVABILITY_CUSTODY_RECORDS, "custody live-record bound drifted");
  add(errors, policy.storage?.maxSignalSetBytes === MAX_OBSERVABILITY_SIGNAL_SET_BYTES, "custody signal-set bound drifted");
  add(errors, policy.storage?.maxArtifactBytes === MAX_OBSERVABILITY_CUSTODY_ARTIFACT_BYTES, "custody artifact bound drifted");
  add(errors, exactKeys(policy.lifecycle, [
    "dataClass", "retentionSeconds", "deletionReasons", "deletionOrder",
    "automaticRepair", "backup", "productAuthority",
  ]), "custody lifecycle fields are invalid");
  add(errors, policy.lifecycle?.dataClass === "operational-telemetry-fixture", "custody data class drifted");
  add(errors, policy.lifecycle?.retentionSeconds === OBSERVABILITY_CUSTODY_RETENTION_SECONDS, "custody retention drifted");
  add(errors, exactArray(policy.lifecycle?.deletionReasons, DELETION_REASONS), "custody deletion reasons drifted");
  add(errors, exactArray(policy.lifecycle?.deletionOrder, [
    "validate-record-and-object", "prepare-deletion-receipt",
    "unlink-object-and-fsync", "publish-deletion-receipt-and-fsync",
    "unlink-live-record-and-fsync",
  ]), "custody deletion order drifted");
  add(errors, policy.lifecycle?.automaticRepair === false && policy.lifecycle?.backup === "none", "custody fixture cannot claim repair or backup");
  add(errors, policy.lifecycle?.productAuthority === "independent", "custody lifecycle must remain authority independent");
  add(errors, exactKeys(policy.query, ["lookup", "kinds", "filters", "maxResponseBytes"]), "custody query fields are invalid");
  add(errors, policy.query?.lookup === "exact-server-generated-record-id", "custody query lookup drifted");
  add(errors, exactArray(policy.query?.kinds, QUERY_KINDS), "custody query kinds drifted");
  add(errors, policy.query?.filters === "none", "custody fixture cannot add dynamic filters");
  add(errors, policy.query?.maxResponseBytes === MAX_OBSERVABILITY_SIGNAL_SET_BYTES, "custody query byte bound drifted");
  add(errors, exactKeys(policy.audit, [
    "readBeforeQuery", "verifySignalSetSchema", "verifyObjectLength",
    "verifyObjectSha256", "detectMissingObjects", "detectOrphanObjects",
    "detectSymlinks", "detectTemporaryFiles", "detectIncompleteDeletion",
    "mutatesStorage",
  ]), "custody audit fields are invalid");
  add(errors, policy.audit?.readBeforeQuery === true && policy.audit?.verifySignalSetSchema === true && policy.audit?.verifyObjectLength === true && policy.audit?.verifyObjectSha256 === true, "custody read integrity checks drifted");
  add(errors, policy.audit?.detectMissingObjects === true && policy.audit?.detectOrphanObjects === true && policy.audit?.detectSymlinks === true && policy.audit?.detectTemporaryFiles === true && policy.audit?.detectIncompleteDeletion === true, "custody audit detection contract drifted");
  add(errors, policy.audit?.mutatesStorage === false, "custody audit must not mutate storage");
  add(errors, exactArray(policy.denyFields, DENY_FIELDS), "custody deny fields drifted");
  add(errors, exactKeys(policy.maturity, [
    "storageContract", "integrityContract", "queryContract",
    "retentionDeletionContract", "localFilesystemFixture", "authenticatedTransport",
    "durableQueue", "externalCollector", "managedCustody", "ownerScopedExport",
    "geographicResidency", "highAvailability", "backupRecovery", "metricsBackend",
    "traceBackend", "dashboards", "alertRouting", "syntheticAlertDelivery",
    "managedSandbox", "live", "production",
  ]), "custody maturity fields are invalid");
  for (const claim of ["storageContract", "integrityContract", "queryContract", "retentionDeletionContract", "localFilesystemFixture"]) {
    add(errors, policy.maturity?.[claim] === true, `custody ${claim} contract must remain true`);
  }
  for (const claim of [
    "authenticatedTransport", "durableQueue", "externalCollector", "managedCustody",
    "ownerScopedExport", "geographicResidency", "highAvailability", "backupRecovery",
    "metricsBackend", "traceBackend", "dashboards", "alertRouting",
    "syntheticAlertDelivery", "managedSandbox", "live", "production",
  ]) {
    add(errors, policy.maturity?.[claim] === false, `custody ${claim} cannot be claimed`);
  }
  add(errors, schema?.oneOf?.length === 2, "custody schema must contain stored and deleted variants");
  add(errors, schema?.$defs?.storedRecord?.properties?.schemaVersion?.const === OBSERVABILITY_CUSTODY_ARTIFACT_SCHEMA, "stored custody schema version drifted");
  add(errors, schema?.$defs?.deletionReceipt?.properties?.schemaVersion?.const === OBSERVABILITY_CUSTODY_ARTIFACT_SCHEMA, "deleted custody schema version drifted");
  add(errors, schema?.$defs?.storedSource?.properties?.signalSetSchemaVersion?.const === `forge-observability-signal-set/${OBSERVABILITY_SIGNAL_SET_VERSION}`, "custody schema signal-set binding drifted");
  add(errors, schema?.$defs?.storedSource?.properties?.bytes?.maximum === MAX_OBSERVABILITY_SIGNAL_SET_BYTES, "custody schema object byte bound drifted");
  return errors;
}

export function checkObservabilityCustodyPolicy() {
  return validateObservabilityCustodyPolicy(loadJson(POLICY_PATH), loadJson(SCHEMA_PATH));
}

async function readBoundedStdin(input = process.stdin) {
  const chunks = [];
  let total = 0;
  for await (const chunk of input) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_OBSERVABILITY_SIGNAL_SET_BYTES) throw new Error("custody input exceeds its byte bound");
    chunks.push(bytes);
  }
  if (total === 0) throw new Error("custody input is empty");
  return Buffer.concat(chunks).toString("utf8");
}

function parseOptions(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("custody command options are invalid");
    }
    const name = key.slice(2);
    if (options[name] !== undefined) throw new Error("custody command option is duplicated");
    options[name] = value;
  }
  return options;
}

function parseDateOption(value) {
  if (value === undefined) return new Date();
  if (!canonicalTimestamp(value)) throw new Error("custody command timestamp is invalid");
  return new Date(value);
}

async function main() {
  const command = process.argv[2] ?? "check";
  if (command === "check") {
    const errors = checkObservabilityCustodyPolicy();
    if (errors.length > 0) {
      for (const error of errors) console.error(`observability-custody: ${error}`);
      process.exitCode = 1;
      return;
    }
    console.log(
      "observability-custody: D76 private filesystem storage/query/lifecycle fixture is coherent; external backends and live claims remain false",
    );
    return;
  }
  try {
    const options = parseOptions(process.argv.slice(3));
    if (command === "store") {
      if (!exactKeys(options, ["root"])) throw new Error("custody store options are invalid");
      const input = await readBoundedStdin();
      let signalSet;
      try {
        signalSet = JSON.parse(input);
      } catch {
        throw new Error("custody input is invalid JSON");
      }
      const record = storeObservabilitySignalSet(options.root, signalSet);
      process.stdout.write(`${JSON.stringify(record)}\n`);
      return;
    }
    if (command === "query") {
      if (!exactKeys(options, ["root", "record", "kind"])) throw new Error("custody query options are invalid");
      process.stdout.write(`${JSON.stringify(queryCustodyRecord(options.root, options.record, options.kind))}\n`);
      return;
    }
    if (command === "delete") {
      if (!exactKeys(options, ["root", "record", "reason", "at"])) throw new Error("custody delete options are invalid");
      const receipt = deleteCustodyRecord(options.root, options.record, {
        reason: options.reason,
        deletedAt: parseDateOption(options.at),
      });
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      return;
    }
    if (command === "sweep") {
      if (!exactKeys(options, ["root", "at"])) throw new Error("custody sweep options are invalid");
      process.stdout.write(`${JSON.stringify(sweepCustodyRoot(options.root, { at: parseDateOption(options.at) }))}\n`);
      return;
    }
    if (command === "audit") {
      if (!exactKeys(options, ["root"])) throw new Error("custody audit options are invalid");
      const result = auditCustodyRoot(options.root);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    throw new Error("custody command is unsupported");
  } catch {
    console.error("observability-custody: command failed closed");
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
