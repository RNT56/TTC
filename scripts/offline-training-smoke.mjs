#!/usr/bin/env node
// Exact P7-009 source-bound telemetry -> BC -> PPO -> ONNX evidence.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outArg = process.argv.indexOf("--out");
const outPath = resolve(
  root,
  outArg >= 0 ? process.argv[outArg + 1] : "artifacts/training/p7-offline-training.json",
);
const python = process.env.FORGE_PYTHON || "python3";
const run = spawnSync(python, ["-m", "forge_workers.training.offline_evidence"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
  env: {
    ...process.env,
    FORGE_VALIDATE_BIN: process.env.FORGE_VALIDATE_BIN || resolve(root, "target/debug/forge-validate"),
    PYTHONPATH: [resolve(root, "workers"), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  },
});
if (run.error) throw new Error(`offline training smoke could not launch ${python}: ${run.error.message}`);
if (run.status !== 0) {
  throw new Error(`offline training smoke failed (${run.status}): ${(run.stderr || "").trim()}`);
}
const artifact = JSON.parse(run.stdout);
const results = Object.values(artifact.results || {});
if (artifact.artifactKind !== "p7OfflineTrainingEvidence" || results.length !== 2) {
  throw new Error("offline training smoke returned an incomplete evidence artifact");
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(
  `offline-training-smoke: ${results.map((result) => result.task.id).join("/")} · BC ${results.map((result) => result.dataset.sampleCount).join("/")} samples · PPO ${results.map((result) => result.training.completedTimesteps).join("/")} steps · export ${results.map((result) => result.scorecard.exportable ? "allowed" : "blocked").join("/")} · ${outPath}`,
);
