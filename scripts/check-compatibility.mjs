#!/usr/bin/env node
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const matrix = JSON.parse(read("compatibility/compatibility.json"));
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceConstant(path, name) {
  const match = read(path).match(new RegExp(`(?:pub )?const ${name}(?:\\s*:\\s*&str)?\\s*=\\s*"([^"]+)"`));
  requireValue(match, `${path}: missing ${name}`);
  return match[1];
}

function manifestVersion(path) {
  const match = read(path).match(/^version\s*=\s*"([^"]+)"/m);
  requireValue(match, `${path}: missing package version`);
  return match[1];
}

function typescriptConstant(path, name) {
  const match = read(path).match(new RegExp(`export const ${name}\\s*=\\s*"([^"]+)"`));
  requireValue(match, `${path}: missing ${name}`);
  return match[1];
}

function pythonConstant(path, name) {
  const match = read(path).match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, "m"));
  requireValue(match, `${path}: missing ${name}`);
  return match[1];
}

function numericConstant(path, name) {
  const match = read(path).match(new RegExp(`^(?:export\\s+const\\s+)?${name}\\s*=\\s*([0-9_]+)`, "m"));
  requireValue(match, `${path}: missing numeric ${name}`);
  return Number(match[1].replaceAll("_", ""));
}

function typescriptStringArray(path, name) {
  const match = read(path).match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`));
  requireValue(match, `${path}: missing ${name}`);
  const residual = match[1].replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, "").replace(/[\s,]/g, "");
  requireValue(!residual, `${path}: ${name} must contain only string literals`);
  return [...match[1].matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)].map((entry) => entry[1]);
}

requireValue(semver.test(matrix.policyVersion), "policyVersion must be SemVer");
requireValue(semver.test(matrix.productVersion), "productVersion must be SemVer");

const required = [
  "modelSpec",
  "validatorCli",
  "validatorReport",
  "wasmFacade",
  "gatewayApi",
  "gatewayEvents",
  "replay",
  "envSpec",
  "licenseExportManifest",
  "userDataExport",
  "consentLedger",
  "accountDeletionReceipt",
  "dataLifecycle",
  "policyTensor",
  "desktopRecorderArchive",
  "desktopRecorderMaterialization",
  "recorderArchiveAdmission",
  "desktopRecorderCustody",
  "workerArtifacts",
];
for (const name of required) {
  const surface = matrix.surfaces[name];
  requireValue(surface, `missing compatibility surface: ${name}`);
  requireValue(semver.test(surface.current), `${name}.current must be SemVer`);
  for (const supported of surface.supported ?? []) {
    requireValue(semver.test(supported), `${name}.supported contains non-SemVer ${supported}`);
  }
}

requireValue(matrix.deprecation.minimumNoticeDays >= 90, "deprecation notice must be at least 90 days");
requireValue(
  matrix.deprecation.minimumSupportedMinorReleases >= 2,
  "deprecations must span at least two minor releases",
);

const workspaceVersion = manifestVersion("Cargo.toml");
const workerVersion = JSON.parse(read("workers/package.json")).version;
const gatewayVersion = JSON.parse(read("packages/gateway/package.json")).version;
const expected = {
  modelSpec: sourceConstant("crates/forge-contract/src/lib.rs", "SCHEMA_VERSION"),
  validatorCli: workspaceVersion,
  validatorReport: sourceConstant("crates/forge-validate/src/lib.rs", "REPORT_FORMAT_VERSION"),
  wasmFacade: workspaceVersion,
  gatewayApi: gatewayVersion,
  gatewayEvents: gatewayVersion,
  replay: sourceConstant("crates/forge-sim/src/runtime.rs", "REPLAY_FORMAT_VERSION"),
  envSpec: sourceConstant("crates/forge-sim/src/runtime.rs", "ENVSPEC_SCHEMA_VERSION"),
  userDataExport: typescriptConstant(
    "packages/gateway/src/accountData.ts",
    "USER_DATA_EXPORT_VERSION",
  ),
  consentLedger: typescriptConstant(
    "packages/gateway/src/consent.ts",
    "CONSENT_LEDGER_FORMAT_VERSION",
  ),
  accountDeletionReceipt: typescriptConstant(
    "packages/gateway/src/accountData.ts",
    "ACCOUNT_DELETION_RECEIPT_VERSION",
  ),
  dataLifecycle: typescriptConstant(
    "packages/gateway/src/dataLifecycle.ts",
    "DATA_LIFECYCLE_FORMAT_VERSION",
  ),
  policyTensor: typescriptConstant(
    "packages/studio/src/policyRuntime.ts",
    "POLICY_TENSOR_VERSION",
  ),
  workerArtifacts: workerVersion,
};

for (const [name, version] of Object.entries(expected)) {
  requireValue(
    matrix.surfaces[name].current === version,
    `${name}: matrix ${matrix.surfaces[name].current} != source ${version}`,
  );
}
requireValue(matrix.productVersion === workspaceVersion, "productVersion must match the Cargo workspace version");
requireValue(
  matrix.surfaces.policyTensor.schema ===
    typescriptConstant("packages/studio/src/policyRuntime.ts", "POLICY_TENSOR_SCHEMA"),
  "policyTensor schema token must match the Studio runtime",
);
requireValue(
  sourceConstant("packages/desktop/src-tauri/src/main.rs", "RECORDER_ARCHIVE_SCHEMA_VERSION") ===
    `${matrix.surfaces.desktopRecorderArchive.schema}/${matrix.surfaces.desktopRecorderArchive.current}`,
  "Desktop recorder archive schema/version does not match compatibility matrix",
);
requireValue(
  typescriptConstant("packages/gateway/src/recorderArchives.ts", "RECORDER_MATERIALIZATION_SCHEMA_VERSION") ===
    `${matrix.surfaces.desktopRecorderMaterialization.schema}/${matrix.surfaces.desktopRecorderMaterialization.current}`,
  "recorder materialization schema/version does not match compatibility matrix",
);
requireValue(
  sourceConstant("packages/desktop/src-tauri/src/main.rs", "RECORDER_UPLOAD_PLAN_SCHEMA_VERSION") ===
    matrix.surfaces.desktopRecorderMaterialization.uploadPlanSchema,
  "Desktop recorder upload-plan version does not match compatibility matrix",
);
requireValue(
  sourceConstant("packages/desktop/src-tauri/src/main.rs", "RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION") ===
    matrix.surfaces.desktopRecorderMaterialization.uploadReceiptSchema,
  "Desktop recorder upload-receipt version does not match compatibility matrix",
);
requireValue(
  typescriptConstant("packages/gateway/src/recorderAdmission.ts", "RECORDER_ADMISSION_SCHEMA_VERSION") ===
    `${matrix.surfaces.recorderArchiveAdmission.schema}/${matrix.surfaces.recorderArchiveAdmission.current}`,
  "recorder admission schema/version does not match compatibility matrix",
);
requireValue(
  sourceConstant("crates/forge-validate/src/recorder.rs", "RECORDER_VERIFICATION_SCHEMA_VERSION") ===
    matrix.surfaces.recorderArchiveAdmission.verificationSchema,
  "recorder verification schema/version does not match compatibility matrix",
);
requireValue(
  typescriptConstant(
    "packages/gateway/src/recorderAdmission.ts",
    "RECORDER_TELEMETRY_REFERENCE_SCHEMA_VERSION",
  ) === matrix.surfaces.recorderArchiveAdmission.telemetryReferenceSchema,
  "recorder telemetry-reference schema/version does not match compatibility matrix",
);
for (const [constant, field] of [
  ["RECORDER_CUSTODY_TRUST_BUNDLE_SCHEMA_VERSION", "trustBundleSchema"],
  ["RECORDER_CUSTODY_AUTHORIZATION_SCHEMA_VERSION", "authorizationSchema"],
  ["RECORDER_CUSTODY_PROOF_SCHEMA_VERSION", "proofSchema"],
]) {
  requireValue(
    sourceConstant("packages/desktop/src-tauri/src/main.rs", constant) ===
      matrix.surfaces.desktopRecorderCustody[field],
    `Desktop recorder custody ${field} does not match compatibility matrix`,
  );
  requireValue(
    typescriptConstant("packages/studio/src/desktopRecorder.ts", constant) ===
      matrix.surfaces.desktopRecorderCustody[field],
    `Studio recorder custody ${field} does not match compatibility matrix`,
  );
}
requireValue(
  matrix.surfaces.desktopRecorderCustody.proofSchema ===
    `${matrix.surfaces.desktopRecorderCustody.schema}/${matrix.surfaces.desktopRecorderCustody.current}`,
  "recorder custody proof schema/version does not match its compatibility surface",
);

const gatewayJobKinds = typescriptStringArray("packages/gateway/src/platform.ts", "JOB_KINDS");
requireValue(
  JSON.stringify(matrix.surfaces.workerArtifacts.queueKinds) === JSON.stringify(gatewayJobKinds),
  "workerArtifacts.queueKinds must exactly match gateway JOB_KINDS",
);
requireValue(
  matrix.surfaces.workerArtifacts.internalSchemas.admittedModelSnapshot ===
    sourceConstant("packages/gateway/src/platform.ts", "ADMITTED_MODEL_SNAPSHOT_VERSION"),
  "worker admitted-model snapshot version does not match gateway source",
);
requireValue(
  matrix.surfaces.workerArtifacts.internalSchemas.trainingBundle ===
    sourceConstant("crates/forge-sim/src/training.rs", "TRAINING_BUNDLE_VERSION"),
  "worker training-bundle version does not match Rust source",
);
requireValue(
  matrix.surfaces.workerArtifacts.internalSchemas.trainingTask ===
    pythonConstant("workers/forge_workers/training/tasks.py", "TASK_VERSION"),
  "worker training-task version does not match Python source",
);
requireValue(
  matrix.surfaces.workerArtifacts.internalSchemas.groundTrainingBundle ===
    sourceConstant("crates/forge-sim/src/training.rs", "GROUND_TRAINING_BUNDLE_VERSION"),
  "worker ground-training-bundle version does not match Rust source",
);
requireValue(
  matrix.surfaces.workerArtifacts.internalSchemas.groundTrainingTask ===
    pythonConstant("workers/forge_workers/training/tasks.py", "GROUND_TASK_VERSION"),
  "worker ground-training-task version does not match Python source",
);
requireValue(
  matrix.surfaces.workerArtifacts.internalSchemas.groundPolicyTensor ===
    sourceConstant("crates/forge-sim/src/training.rs", "GROUND_POLICY_TENSOR_VERSION"),
  "worker ground-policy-tensor version does not match Rust source",
);
requireValue(
  pythonConstant("workers/forge_workers/training/bundle.py", "GROUND_POLICY_TENSOR_SCHEMA") ===
    sourceConstant("crates/forge-sim/src/training.rs", "GROUND_POLICY_TENSOR_SCHEMA"),
  "worker ground-policy-tensor schema token does not match Rust source",
);
requireValue(
  pythonConstant("workers/forge_workers/training/sb3_training.py", "RUNTIME_VERSION") ===
    `forge-sb3-mujoco/${matrix.surfaces.workerArtifacts.internalSchemas.sb3Runtime}`,
  "worker SB3 runtime version does not match compatibility matrix",
);
requireValue(
  pythonConstant("workers/forge_workers/bridge.py", "BRIDGE_CONFIG_VERSION") ===
    matrix.surfaces.workerArtifacts.internalSchemas.bridgeConfig,
  "worker bridge-config version does not match compatibility matrix",
);
requireValue(
  pythonConstant("workers/forge_workers/bridge.py", "BETAFLIGHT_CLI_VERSION") ===
    matrix.surfaces.workerArtifacts.bridgeConfigFirmwareVersion,
  "worker bridge-config firmware version does not match compatibility matrix",
);
requireValue(
  sourceConstant("packages/desktop/src-tauri/src/main.rs", "BETAFLIGHT_CLI_VERSION") ===
    matrix.surfaces.workerArtifacts.bridgeConfigFirmwareVersion,
  "Desktop bridge-config firmware version does not match compatibility matrix",
);
for (const [path, helper, label] of [
  ["workers/forge_workers/maintenance.py", pythonConstant, "worker"],
  ["packages/gateway/src/platform.ts", typescriptConstant, "gateway"],
  ["packages/studio/src/ghostReplay.ts", typescriptConstant, "Studio"],
]) {
  requireValue(
    helper(path, "GHOST_OVERLAY_VERSION") === matrix.surfaces.workerArtifacts.internalSchemas.ghostOverlay,
    `${label} ghost-overlay version does not match compatibility matrix`,
  );
  requireValue(
    helper(path, "GHOST_OVERLAY_FRAME") === matrix.surfaces.workerArtifacts.ghostOverlayFrame,
    `${label} ghost-overlay frame does not match compatibility matrix`,
  );
  requireValue(
    numericConstant(path, "GHOST_MAX_RENDER_POINTS") === matrix.surfaces.workerArtifacts.ghostOverlayMaxRenderPoints,
    `${label} ghost-overlay render-point bound does not match compatibility matrix`,
  );
}

const workerContract = read("workers/forge_workers/contract.py");
const trainingBundleContract = read("workers/forge_workers/training/bundle.py");
for (const [name, version] of [
  ["WORKER_ARTIFACT_FORMAT_VERSION", matrix.surfaces.workerArtifacts.current],
  ["REPLAY_FORMAT_VERSION", matrix.surfaces.replay.current],
]) {
  requireValue(
    workerContract.includes(`${name} = "${version}"`),
    `worker ${name} does not match compatibility matrix`,
  );
}
requireValue(
  workerContract.includes(
    `LICENSE_EXPORT_MANIFEST_FORMAT_VERSION = "${matrix.surfaces.licenseExportManifest.current}"`,
  ),
  "worker license export manifest version does not match compatibility matrix",
);
for (const [name, version] of Object.entries(matrix.surfaces.workerArtifacts.internalSchemas).filter(
  ([name]) => !["trainingTask", "groundTrainingTask", "sb3Runtime", "bridgeConfig", "ghostOverlay"].includes(name),
)) {
  requireValue(
    trainingBundleContract.includes(`${version}`),
    `worker internal schema ${name} does not match compatibility matrix`,
  );
}
requireValue(
  trainingBundleContract.includes("forge-admitted-model-snapshot/1.0.0"),
  "worker admitted-model snapshot token does not match gateway source",
);
requireValue(
  read("packages/gateway/src/licenseExports.ts").includes(
    `LICENSE_EXPORT_MANIFEST_FORMAT_VERSION = "${matrix.surfaces.licenseExportManifest.current}"`,
  ),
  "gateway license export manifest version does not match compatibility matrix",
);

const legacyReplay = sourceConstant(
  "crates/forge-sim/src/runtime.rs",
  "LEGACY_REPLAY_FORMAT_VERSION",
);
requireValue(
  matrix.surfaces.replay.legacyAliases.includes(legacyReplay),
  "legacy replay alias is not declared in the matrix",
);

for (const path of ["packages/gateway/src/server.ts", "packages/studio/src/App.tsx"]) {
  requireValue(
    read(path).includes(`schemaVersion: "${matrix.surfaces.envSpec.current}"`),
    `${path}: EnvSpec producer does not emit the current schemaVersion`,
  );
}

console.log(`compatibility: ${required.length} surfaces match policy ${matrix.policyVersion}`);
