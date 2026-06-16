#!/usr/bin/env node
// P6-010 local runner: always produce the Rapier baseline through the same
// forge-validate binary CI ships, then compare it with a MuJoCo baseline JSON.
//
//   node scripts/sim-parity.mjs [--mujoco mujoco-baseline.json]
//                              [--validator target/debug/forge-validate]
//                              [--out artifacts/sim-parity]
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

if (!existsSync(validator)) {
  throw new Error(`validator binary not found at ${validator}; run: cargo build -p forge-validate`);
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

const request = {
  artifactKind: "simParityMuJoCoRequest",
  task: "sim.parity",
  gravity,
  dropHeightM: 1.0,
  pendulumLengthM,
  hoverTrim,
  gaitComM,
  expectedOutput: {
    artifactKind: "simParityMuJoCoBaseline",
    baselineFields: [
      "dropHeightM",
      "mujocoDropTimeS",
      "pendulumLengthM",
      "mujocoPendulumPeriodS",
      "mujocoHoverTrim",
      "mujocoGaitComM",
    ],
  },
};
writeFileSync(requestPath, `${JSON.stringify(request, null, 2)}\n`);

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
    input: JSON.stringify(request),
  });
  JSON.parse(result.stdout);
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
console.log(
  `sim-parity: ${comparison.report.passed ? "passed" : "failed"} · artifacts in ${outDir}`,
);
