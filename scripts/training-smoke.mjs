#!/usr/bin/env node
// Source-bound P7-003 smoke: gateway-shaped immutable snapshot -> Rust bundle ->
// real MuJoCo/SB3 optimization -> ONNX + scorecard artifact.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outArg = process.argv.indexOf("--out");
const outPath = resolve(root, outArg >= 0 ? process.argv[outArg + 1] : "artifacts/training/p7-sb3-smoke.json");

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

const contract = JSON.parse(readFileSync(resolve(root, "examples/vx2-mini.forge.json"), "utf8"));
const contractJson = JSON.stringify(stable(contract));
const contractHash = sha256(contractJson);
const lockfileHash = sha256(readFileSync(resolve(root, "pnpm-lock.yaml")));
const dependencyManifestHash = sha256(readFileSync(resolve(root, "workers/pyproject.toml")));
const checkoutRevision = git("rev-parse", "HEAD");
const sourceRevision = process.env.FORGE_SOURCE_REVISION || checkoutRevision;
if (!/^[0-9a-f]{40}$/.test(sourceRevision)) throw new Error("source revision must be a full Git SHA");
if (sourceRevision !== checkoutRevision) throw new Error("source revision must equal the checked-out Git revision");
const worktreeClean = git("status", "--porcelain").length === 0;
if (process.env.FORGE_REQUIRE_CLEAN_EVIDENCE === "1" && !worktreeClean) {
  throw new Error("training evidence requires a clean exact-source checkout");
}

const request = {
  jobKind: "train.policy",
  modelId: "vx2-mini",
  contractHash,
  lockfileHash,
  modelSnapshot: {
    schemaVersion: "forge-admitted-model-snapshot/1.0.0",
    modelId: "vx2-mini",
    contractHash,
    contractJson,
  },
  task: "hover-hold",
  algorithm: "ppo",
  seed: 73,
  totalTimesteps: 256,
  episodeSteps: 40,
  evalEpisodes: 2,
  device: "cpu",
};
const run = spawnSync("python", ["-m", "forge_workers.training.sb3_runner"], {
  cwd: root,
  encoding: "utf8",
  input: JSON.stringify(request),
  maxBuffer: 16 * 1024 * 1024,
  env: {
    ...process.env,
    FORGE_VALIDATE_BIN: process.env.FORGE_VALIDATE_BIN || resolve(root, "target/debug/forge-validate"),
    FORGE_SOURCE_REVISION: sourceRevision,
  },
});
if (run.status !== 0) throw new Error(`training smoke failed (${run.status}): ${run.stderr.trim()}`);
const result = JSON.parse(run.stdout);
if (result.provider !== "local-sb3-mujoco" || result.algorithm !== "ppo") {
  throw new Error("training smoke did not use the real pinned PPO runtime");
}
if (result.training?.optimizerUpdated !== true || result.training?.truthExposedToPolicy !== false) {
  throw new Error("training smoke lacks optimizer or estimator-boundary proof");
}
if (
  result.scorecard?.lineage?.contractHash !== contractHash
  || result.scorecard?.lineage?.sourceRevision !== sourceRevision
  || result.scorecard?.lineage?.lockfileHash !== lockfileHash
  || result.scorecard?.lineage?.dependencyManifestHash !== dependencyManifestHash
) {
  throw new Error("training smoke lineage is not source/contract bound");
}
if (result.io?.tensor?.schema !== "forge-policy-tensor" || result.io?.tensor?.schemaVersion !== "1.0.0") {
  throw new Error("training smoke tensor contract drifted");
}
const onnxBytes = Buffer.from(result.onnx?.modelBase64 || "", "base64");
if (onnxBytes.length !== result.onnx?.byteSize || sha256(onnxBytes) !== result.onnx?.sha256) {
  throw new Error("training smoke ONNX bytes do not match their size/digest");
}

const artifact = {
  artifactKind: "p7Sb3SmokeEvidence",
  schemaVersion: "1.0.0",
  sourceRevision,
  worktreeClean,
  generatedAt: new Date().toISOString(),
  maturity: "controlled-smoke",
  nonClaims: [
    "This 256-step CPU smoke does not prove an overnight passing policy, consumer-GPU SLO, live Modal deployment, or field readiness.",
    "A blocked export gate is an honest smoke outcome; only p7-scorecard-v1 thresholds authorize export.",
  ],
  request: {
    modelId: request.modelId,
    contractHash,
    lockfileHash,
    dependencyManifestHash,
    task: request.task,
    algorithm: request.algorithm,
    seed: request.seed,
    totalTimesteps: request.totalTimesteps,
    episodeSteps: request.episodeSteps,
    evalEpisodes: request.evalEpisodes,
  },
  result,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`training-smoke: ${result.training.completedTimesteps} steps · ONNX ${result.onnx.byteSize} bytes · export ${result.scorecard.exportable ? "allowed" : "blocked"} · ${outPath}`);
