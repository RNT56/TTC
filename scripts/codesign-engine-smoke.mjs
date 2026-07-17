#!/usr/bin/env node
// D59 controlled smoke: exact admitted snapshot -> native validator/Rapier ->
// pinned MuJoCo, with every candidate patch/hash rechecked by the worker seam.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outArg = process.argv.indexOf("--out");
const outPath = resolve(
  root,
  outArg >= 0 ? process.argv[outArg + 1] : "artifacts/codesign/p9-engine-smoke.json",
);
const requireTier0Budget = process.argv.includes("--require-tier0-budget");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const checkoutRevision = git("rev-parse", "HEAD");
const sourceRevision = process.env.FORGE_SOURCE_REVISION || checkoutRevision;
if (!/^[0-9a-f]{40}$/.test(sourceRevision) || sourceRevision !== checkoutRevision) {
  throw new Error("co-design smoke source revision must equal the exact checkout");
}
const worktreeClean = git("status", "--porcelain").length === 0;
if (process.env.FORGE_REQUIRE_CLEAN_EVIDENCE === "1" && !worktreeClean) {
  throw new Error("co-design evidence requires a clean exact-source checkout");
}

const contract = JSON.parse(readFileSync(resolve(root, "examples/vx2-mini.forge.json"), "utf8"));
const contractJson = JSON.stringify(stable(contract));
const contractHash = sha256(contractJson);
const request = {
  task: "codesign.evaluate",
  contractHash,
  modelSnapshot: {
    schemaVersion: "forge-admitted-model-snapshot/1.0.0",
    modelId: "vx2-mini",
    contractHash,
    contractJson,
  },
  candidateBudget: 3,
  seed: 59,
};
const python = process.env.FORGE_PYTHON || "python3";
const validator = process.env.FORGE_VALIDATE_BIN || resolve(root, "target/debug/forge-validate");
const command = `${python} -m forge_workers.codesign_runtime`;
const run = spawnSync(
  python,
  [
    "-c",
    "import json,sys; from forge_workers.codesign import evaluate; print(json.dumps(evaluate(json.load(sys.stdin)),sort_keys=True,separators=(',',':')))",
  ],
  {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify(request),
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      FORGE_CODESIGN_CMD: command,
      FORGE_SOURCE_REVISION: sourceRevision,
      FORGE_VALIDATE_BIN: validator,
      PYTHONPATH: [resolve(root, "workers"), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
    },
  },
);
if (run.error) throw new Error(`co-design smoke could not launch ${python}: ${run.error.message}`);
if (run.status !== 0) {
  throw new Error(`co-design smoke failed (${run.status}): ${(run.stderr || "").trim()}`);
}
const artifact = JSON.parse(run.stdout);
if (
  artifact.schemaVersion !== "forge-codesign-evaluation/1.0.0"
  || artifact.provider !== "forge-local-engine-codesign"
  || artifact.source?.baseContractHash !== contractHash
  || artifact.source?.sourceRevision !== sourceRevision
  || artifact.source?.sourceRevisionRecorded !== true
  || artifact.candidates?.length !== 3
  || artifact.optimizer?.engineBacked !== true
  || artifact.benchmark?.controlledSmoke !== true
  || artifact.benchmark?.overnightComplete !== false
) {
  throw new Error("co-design smoke identity, source, or maturity contract drifted");
}
const admitted = artifact.candidates.filter((candidate) => candidate.admitted === true);
if (admitted.length < 2 || artifact.pareto.length < 1) {
  throw new Error("co-design smoke did not retain at least two engine-admitted candidates and one Pareto point");
}
for (const candidate of artifact.candidates) {
  if (
    candidate.nativeEvaluation?.schemaVersion !== "forge-codesign-native-evaluation/1.0.0"
    || candidate.nativeEvaluation?.candidateSnapshotSha256 !== candidate.lineage?.candidateSnapshotSha256
    || candidate.evaluations?.tier3?.evaluated !== false
    || candidate.evaluations?.tier3?.held !== true
    || candidate.lineage?.mujocoRuntime !== "3.9.0"
    || candidate.lineage?.trainingBundleSchema !== "2.0.0"
  ) {
    throw new Error(`co-design candidate ${candidate.id} lost exact engine or tier-hold authority`);
  }
}
for (const candidate of admitted) {
  if (
    candidate.evaluations.tier0.engineBacked !== true
    || candidate.evaluations.tier1.engine !== "rapier3d/0.33.0"
    || candidate.evaluations.tier1.engineBacked !== true
    || candidate.evaluations.tier2.engine !== "mujoco/3.9.0"
    || candidate.evaluations.tier2.engineBacked !== true
    || candidate.evaluations.tier2.evidence?.trainedPolicy !== false
    || candidate.evaluations.tier2.evidence?.estimatorOnly !== true
  ) {
    throw new Error(`admitted co-design candidate ${candidate.id} lacks real controlled engine evidence`);
  }
}
if (requireTier0Budget && artifact.benchmark.tier0MaxMs >= artifact.benchmark.tier0BudgetMs) {
  throw new Error(
    `release co-design tier 0 exceeded budget: ${artifact.benchmark.tier0MaxMs} >= ${artifact.benchmark.tier0BudgetMs} ms`,
  );
}
const evidence = {
  evidenceSchemaVersion: "p9-engine-smoke-evidence/1.0.0",
  sourceRevision,
  worktreeClean,
  validator,
  tier0BudgetRequired: requireTier0Budget,
  result: artifact,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `codesign-engine-smoke: ${admitted.length}/3 admitted · ${artifact.pareto.length} Pareto · tier0 ${artifact.benchmark.tier0MaxMs}/${artifact.benchmark.tier0BudgetMs} ms · Rapier 0.33.0 · MuJoCo 3.9.0 · ${outPath}`,
);
