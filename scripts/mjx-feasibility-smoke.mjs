#!/usr/bin/env node
// P7-010 controlled feasibility: admitted snapshot -> Rust MuJoCo bundle ->
// native MuJoCo rollout + synchronized MJX-JAX rollout -> blocked adoption report.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outArg = process.argv.indexOf("--out");
const outPath = resolve(
  root,
  outArg >= 0 ? process.argv[outArg + 1] : "artifacts/mjx/p7-mjx-feasibility.json",
);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const contract = JSON.parse(readFileSync(resolve(root, "examples/vx2-mini.forge.json"), "utf8"));
const contractJson = stableJson(contract);
const contractHash = sha256(contractJson);
const checkoutRevision = git("rev-parse", "HEAD");
const sourceRevision = process.env.FORGE_SOURCE_REVISION?.trim() || checkoutRevision;
if (!/^[0-9a-f]{40}$/.test(sourceRevision)) {
  throw new Error("source revision must be a full lowercase Git SHA");
}
if (sourceRevision !== checkoutRevision) {
  throw new Error("source revision must equal the checked-out Git revision");
}
const worktreeClean = git("status", "--porcelain").length === 0;
if (process.env.FORGE_REQUIRE_CLEAN_EVIDENCE === "1" && !worktreeClean) {
  throw new Error("MJX feasibility evidence requires a clean exact-source checkout");
}

const request = {
  artifactKind: "mjxBenchmarkRequest",
  schemaVersion: "1.0.0",
  task: "sim.mjx-benchmark",
  sourceRevision,
  requestSha256: "0".repeat(64),
  worktreeClean,
  maturity: "controlled-feasibility",
  morphology: "p7-hover-multirotor",
  contractHash,
  modelSnapshot: {
    schemaVersion: "forge-admitted-model-snapshot/1.0.0",
    modelId: "vx2-mini",
    contractHash,
    contractJson,
  },
  protocol: {
    seed: 710,
    initialQvelScaleMicroradS: 1000,
    controlScaleNanonewtonM: 100,
    batchSize: 16,
    rolloutSteps: 64,
    paritySteps: 64,
    cpuThreads: 4,
    repeats: 3,
    unrollSteps: 1,
    solver: "newton",
    iterations: 1,
    lsIterations: 4,
    jaxEnableX64: true,
  },
  runtimePins: {
    numpy: "2.5.1",
    mujoco: "3.9.0",
    mujocoMjx: "3.9.0",
    jax: "0.10.2",
    jaxlib: "0.10.2",
  },
};
const requestBody = Object.fromEntries(
  Object.entries(request).filter(([key]) => !["sourceRevision", "requestSha256"].includes(key)),
);
request.requestSha256 = sha256(stableJson(requestBody));

const run = spawnSync("python", ["-m", "forge_workers.mjx_benchmark"], {
  cwd: root,
  encoding: "utf8",
  input: stableJson(request),
  maxBuffer: 16 * 1024 * 1024,
  env: {
    ...process.env,
    PYTHONPATH: [resolve(root, "workers"), process.env.PYTHONPATH]
      .filter(Boolean)
      .join(delimiter),
    FORGE_VALIDATE_BIN:
      process.env.FORGE_VALIDATE_BIN || resolve(root, "target/debug/forge-validate"),
    JAX_ENABLE_X64: "1",
  },
});
if (run.status !== 0) {
  throw new Error(`MJX feasibility smoke failed (${run.status}): ${run.stderr.trim()}`);
}
const result = JSON.parse(run.stdout);
if (
  result.artifactKind !== "mjx-benchmark" ||
  result.schemaVersion !== "1.0.0" ||
  result.sourceRevision !== sourceRevision ||
  result.requestSha256 !== request.requestSha256 ||
  result.worktreeClean !== worktreeClean
) {
  throw new Error("MJX feasibility result is not bound to the exact request and source");
}
if (result.adopt || result.decisionEligible || result.maturity !== "controlled-feasibility") {
  throw new Error("controlled MJX feasibility smoke must remain decision-ineligible");
}
if (result.morphologies?.[0]?.morphology !== "p7-hover-multirotor") {
  throw new Error("MJX feasibility smoke returned the wrong reference morphology");
}
if (result.parity?.passed !== true || !(result.cpu?.stepsPerS > 0) || !(result.mjx?.stepsPerS > 0)) {
  throw new Error(
    "MJX feasibility smoke lacks real parity/throughput measurements: " +
      stableJson({ parity: result.parity, cpu: result.cpu, mjx: result.mjx }),
  );
}
for (const required of ["d12-quad", "d12-rover", "legged"]) {
  if (!result.blockers.some((blocker) => blocker.includes(required))) {
    throw new Error(`MJX feasibility smoke did not preserve the ${required} blocker`);
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `mjx-feasibility: CPU ${Math.round(result.cpu.stepsPerS)} steps/s · ` +
    `MJX ${Math.round(result.mjx.stepsPerS)} steps/s · parity pass · adoption blocked · ${outPath}`,
);
