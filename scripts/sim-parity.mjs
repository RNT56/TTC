#!/usr/bin/env node
// P6-010 runner: produce Rapier measurements and contract-derived MuJoCo scenes
// through the same forge-validate binary CI ships, then execute or compare a
// MuJoCo baseline JSON.
//
//   node scripts/sim-parity.mjs [--mujoco mujoco-baseline.json]
//                              [--validator target/debug/forge-validate]
//                              [--out artifacts/sim-parity]
//                              [--capture-baseline path/to/reviewed-fixture.json]
//
// Without --mujoco, FORGE_MUJOCO_PARITY_CMD may be configured. The command
// receives the request JSON on stdin and must emit a MuJoCo parity baseline JSON
// object on stdout. If neither is present, the script writes mujoco-request.json
// and exits 1 so the capture contract is explicit.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function numberFlag(name, fallback) {
  const raw = flag(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

const validator = resolve(root, flag("--validator", "target/debug/forge-validate"));
const outDir = resolve(root, flag("--out", "artifacts/sim-parity"));
const keepOut = args.includes("--keep-out");
const captureBaseline = flag("--capture-baseline");
const gravity = numberFlag("--gravity", 9.80665);
const pendulumLengthM = numberFlag("--pendulum-length", 0.4);
const hoverTrim = numberFlag("--hover-trim", 0.42);
const gaitComM = numberFlag("--gait-com", 0.004);
const rapierPath = join(outDir, "rapier-baseline.json");
const mujocoPath = flag("--mujoco")
  ? resolve(root, flag("--mujoco"))
  : join(outDir, "mujoco-baseline.json");
const requestPath = join(outDir, "mujoco-request.json");
const comparisonPath = join(outDir, "comparison.json");

function run(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`$ ${printable}`);
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: options.stdio ?? "inherit",
    input: options.input,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw Object.assign(new Error(`${printable} failed with exit ${result.status}`), {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return result;
}

function capture(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit ${result.status}`);
  }
  return result.stdout.trim();
}

function validateLiveMuJoCoArtifact(artifact, request) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("MuJoCo command must emit one JSON object");
  }
  if (artifact.artifactKind !== "simParityMuJoCoBaseline") {
    throw new Error(`MuJoCo command emitted unexpected artifactKind ${artifact.artifactKind}`);
  }
  if (artifact.schemaVersion !== "1.0.0") {
    throw new Error(`MuJoCo command emitted unsupported schemaVersion ${artifact.schemaVersion}`);
  }
  const expectedProvider = `mujoco-python-${request.mujocoVersion}`;
  if (artifact.provider !== expectedProvider) {
    throw new Error(`MuJoCo provider mismatch: expected ${expectedProvider}, got ${artifact.provider}`);
  }
  if (artifact.sourceRevision !== request.sourceRevision) {
    throw new Error(
      `MuJoCo source revision mismatch: expected ${request.sourceRevision}, got ${artifact.sourceRevision}`,
    );
  }
  if (artifact.requestSha256 !== request.requestSha256) {
    throw new Error(
      `MuJoCo request hash mismatch: expected ${request.requestSha256}, got ${artifact.requestSha256}`,
    );
  }
  if (
    !artifact.baseline ||
    artifact.baseline.driverDtS !== request.driverDtS ||
    artifact.baseline.substeps !== request.substeps
  ) {
    throw new Error("MuJoCo baseline timestep/substep metadata does not match the request");
  }
  for (const field of [
    "dropHeightM",
    "mujocoDropTimeS",
    "pendulumLengthM",
    "mujocoPendulumPeriodS",
    "mujocoHoverTrim",
    "mujocoGaitComM",
  ]) {
    if (!Number.isFinite(artifact.baseline[field])) {
      throw new Error(`MuJoCo baseline field ${field} must be finite`);
    }
  }
}

if (!existsSync(validator)) {
  throw new Error(`validator binary not found at ${validator}; run: cargo build -p forge-validate`);
}
if (captureBaseline && flag("--mujoco")) {
  throw new Error("--capture-baseline requires a live MuJoCo command, not --mujoco");
}
if (!keepOut) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

const baselineArgs = [
  "sim-parity",
  "rapier-baseline",
  "--out",
  rapierPath,
  "--gravity",
  String(gravity),
  "--pendulum-length",
  String(pendulumLengthM),
  "--hover-trim",
  String(hoverTrim),
  "--gait-com",
  String(gaitComM),
];
run(validator, baselineArgs);

const checkoutRevision = capture("git", ["rev-parse", "HEAD"]);
const sourceRevision = process.env.FORGE_SOURCE_REVISION?.trim() || checkoutRevision;
if (sourceRevision !== checkoutRevision) {
  throw new Error(
    `FORGE_SOURCE_REVISION ${sourceRevision} does not match checkout ${checkoutRevision}`,
  );
}
run(validator, [
  "sim-parity",
  "mujoco-request",
  "--out",
  requestPath,
  "--source-revision",
  sourceRevision,
  "--gravity",
  String(gravity),
  "--pendulum-length",
  String(pendulumLengthM),
  "--hover-trim",
  String(hoverTrim),
  "--gait-com",
  String(gaitComM),
]);
const request = JSON.parse(readFileSync(requestPath, "utf8"));

if (!flag("--mujoco")) {
  const command = process.env.FORGE_MUJOCO_PARITY_CMD?.trim();
  if (!command) {
    console.error(
      `sim-parity: wrote ${requestPath}; pass --mujoco <baseline.json> or configure FORGE_MUJOCO_PARITY_CMD`,
    );
    process.exit(1);
  }
  const shell = process.env.SHELL || "/bin/sh";
  const result = run(shell, ["-lc", command], {
    stdio: "pipe",
    input: readFileSync(requestPath, "utf8"),
  });
  const artifact = JSON.parse(result.stdout);
  validateLiveMuJoCoArtifact(artifact, request);
  writeFileSync(mujocoPath, result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
}

run(validator, [
  "sim-parity",
  "compare",
  "--rapier",
  rapierPath,
  "--mujoco",
  mujocoPath,
  "--out",
  comparisonPath,
]);

const comparison = JSON.parse(readFileSync(comparisonPath, "utf8"));
if (captureBaseline) {
  if (!comparison.report?.passed) {
    throw new Error("refusing to capture a MuJoCo baseline from a failed parity comparison");
  }
  const liveArtifact = JSON.parse(readFileSync(mujocoPath, "utf8"));
  const reviewedFixture = {
    artifactKind: liveArtifact.artifactKind,
    schemaVersion: liveArtifact.schemaVersion,
    provider: liveArtifact.provider,
    baseline: liveArtifact.baseline,
  };
  const capturePath = resolve(root, captureBaseline);
  mkdirSync(dirname(capturePath), { recursive: true });
  writeFileSync(capturePath, `${JSON.stringify(reviewedFixture, null, 2)}\n`);
  console.log(`sim-parity: captured reviewed baseline candidate at ${capturePath}`);
}
console.log(
  `sim-parity: ${comparison.report.passed ? "passed" : "failed"} · artifacts in ${outDir}`,
);
