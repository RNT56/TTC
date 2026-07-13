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

requireValue(semver.test(matrix.policyVersion), "policyVersion must be SemVer");
requireValue(semver.test(matrix.productVersion), "productVersion must be SemVer");

const required = [
  "modelSpec",
  "validatorCli",
  "validatorReport",
  "wasmFacade",
  "replay",
  "envSpec",
  "licenseExportManifest",
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
const expected = {
  modelSpec: sourceConstant("crates/forge-contract/src/lib.rs", "SCHEMA_VERSION"),
  validatorCli: workspaceVersion,
  validatorReport: sourceConstant("crates/forge-validate/src/lib.rs", "REPORT_FORMAT_VERSION"),
  wasmFacade: workspaceVersion,
  replay: sourceConstant("crates/forge-sim/src/runtime.rs", "REPLAY_FORMAT_VERSION"),
  envSpec: sourceConstant("crates/forge-sim/src/runtime.rs", "ENVSPEC_SCHEMA_VERSION"),
  workerArtifacts: workerVersion,
};

for (const [name, version] of Object.entries(expected)) {
  requireValue(
    matrix.surfaces[name].current === version,
    `${name}: matrix ${matrix.surfaces[name].current} != source ${version}`,
  );
}
requireValue(matrix.productVersion === workspaceVersion, "productVersion must match the Cargo workspace version");

const workerContract = read("workers/forge_workers/contract.py");
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
