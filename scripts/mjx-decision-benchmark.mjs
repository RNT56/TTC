#!/usr/bin/env node
// P7-010 decision run: three exact benchmark proxies + reviewed budget/cost
// evidence -> native MuJoCo/MJX measurements -> centralized adoption verdict.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const budgetPath = argument("--budget-evidence");
const costPath = argument("--cost-evidence");
const outPath = resolve(
  root,
  argument("--out", "artifacts/mjx/p7-mjx-decision.json"),
);
if (!budgetPath || !costPath) {
  throw new Error(
    "usage: pnpm sim:mjx:decision -- --budget-evidence <json> --cost-evidence <json> [--out <json>]",
  );
}

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

function fileSha(path) {
  return sha256(readFileSync(resolve(root, path)));
}

const checkoutRevision = git("rev-parse", "HEAD");
const sourceRevision = process.env.FORGE_SOURCE_REVISION?.trim() || checkoutRevision;
if (!/^[0-9a-f]{40}$/.test(sourceRevision) || sourceRevision !== checkoutRevision) {
  throw new Error("source revision must equal the checked-out full lowercase Git SHA");
}
if (git("status", "--porcelain").length !== 0) {
  throw new Error("MJX decision evidence requires a clean exact-source checkout");
}

const caseDefinitions = [
  {
    morphology: "d12-quad",
    contractPath: "examples/vx2-mini.forge.json",
    authority: {
      authorityKind: "d12-simulation-proxy",
      authorityId: "ref_quad_kakute-h7-source-one-5in",
      authorityPath: "catalog/reference-rigs/ref_quad_kakute-h7-source-one-5in.json",
      decisionId: "D12-P3-REFERENCE-RIGS",
      simulationProxy: true,
      exactHardwareTwin: false,
      limitation:
        "The benchmark contract is a simulation proxy bound to the frozen D12 rig identity; it is not an exact hardware twin or field claim.",
    },
  },
  {
    morphology: "d12-rover",
    contractPath: "workers/tests/fixtures/rover-training.forge.json",
    authority: {
      authorityKind: "d12-simulation-proxy",
      authorityId: "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
      authorityPath: "catalog/reference-rigs/ref_rover_waveshare-ugv-rover-pt-pi5-ros2.json",
      decisionId: "D12-P3-REFERENCE-RIGS",
      simulationProxy: true,
      exactHardwareTwin: false,
      limitation:
        "The benchmark contract is a simulation proxy bound to the frozen D12 rig identity; it is not an exact hardware twin or field claim.",
    },
  },
  {
    morphology: "legged",
    contractPath: "examples/qd-mini.forge.json",
    authority: {
      authorityKind: "controlled-legger-reference",
      authorityId: "qd-2x2-w040-m2500",
      authorityPath: "examples/qd-mini.forge.json",
      decisionId: "D47",
      simulationProxy: true,
      exactHardwareTwin: false,
      limitation:
        "The benchmark contract is the controlled P7 legged reference; it is not a D12 rig, exact hardware twin, device, or field claim.",
    },
  },
];

const cases = caseDefinitions.map((definition) => {
  const contract = JSON.parse(readFileSync(resolve(root, definition.contractPath), "utf8"));
  const contractJson = stableJson(contract);
  const contractHash = sha256(contractJson);
  return {
    morphology: definition.morphology,
    contractHash,
    modelSnapshot: {
      schemaVersion: "forge-admitted-model-snapshot/1.0.0",
      modelId: contract.meta.id,
      contractHash,
      contractJson,
    },
    authority: {
      ...definition.authority,
      authoritySha256: fileSha(definition.authority.authorityPath),
    },
  };
});

const budgetEvidence = JSON.parse(readFileSync(resolve(budgetPath), "utf8"));
const costEvidence = JSON.parse(readFileSync(resolve(costPath), "utf8"));
const request = {
  artifactKind: "mjxDecisionRequest",
  schemaVersion: "2.0.0",
  task: "sim.mjx-benchmark",
  sourceRevision,
  requestSha256: "0".repeat(64),
  worktreeClean: true,
  maturity: "sandbox",
  cases,
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
  requiredAccelerator: {
    backend: costEvidence.acceleratorHost?.backend,
    deviceKind: costEvidence.acceleratorHost?.deviceKind,
    fallbackForbidden: true,
    precision: "float64",
  },
  budgetEvidence,
  costEvidence,
};
const requestBody = Object.fromEntries(
  Object.entries(request).filter(([key]) => !["sourceRevision", "requestSha256"].includes(key)),
);
request.requestSha256 = sha256(stableJson(requestBody));

const run = spawnSync("python", ["-m", "forge_workers.mjx_decision_benchmark"], {
  cwd: root,
  encoding: "utf8",
  input: stableJson(request),
  maxBuffer: 32 * 1024 * 1024,
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
  throw new Error(`MJX decision benchmark failed (${run.status}): ${run.stderr.trim()}`);
}
const result = JSON.parse(run.stdout);
if (
  result.artifactKind !== "mjx-benchmark" ||
  result.schemaVersion !== "2.0.0" ||
  result.sourceRevision !== sourceRevision ||
  result.requestSha256 !== request.requestSha256 ||
  result.worktreeClean !== true ||
  result.morphologies?.length !== 3
) {
  throw new Error("MJX decision result is not bound to the exact request and source");
}
for (const morphology of ["d12-quad", "d12-rover", "legged"]) {
  const row = result.morphologies.find((candidate) => candidate.morphology === morphology);
  if (!row || !["gpu", "tpu"].includes(row.acceleratorBackend) || row.sourceBound !== true) {
    throw new Error(`MJX decision result lacks strict ${morphology} accelerator evidence`);
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `mjx-decision: ${result.decisionEligible ? (result.adopt ? "adopt" : "reject") : "blocked"} · ` +
    `${result.blockers.length} blocker(s) · ${outPath}`,
);
