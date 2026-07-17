#!/usr/bin/env node
// D65 retained local evidence: exact D64 catalog plan -> catalog-bound physics -> durable pause,
// zero-dispatch cancellation, resume -> sovereign catalog-aware native/Rapier/
// MuJoCo evaluation. This is not provider, tier-3, or overnight proof.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const outArg = process.argv.indexOf("--out");
const outPath = resolve(
  root,
  outArg >= 0 ? process.argv[outArg + 1] : "artifacts/codesign/p9-engine-batch.json",
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

function runPython(python, args, request, env) {
  const run = spawnSync(python, args, {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify(request),
    maxBuffer: 64 * 1024 * 1024,
    env,
  });
  if (run.error) throw new Error(`co-design engine batch could not launch ${python}: ${run.error.message}`);
  if (run.status !== 0) {
    throw new Error(`co-design engine batch failed (${run.status}): ${(run.stderr || "").trim()}`);
  }
  return JSON.parse(run.stdout);
}

const checkoutRevision = git("rev-parse", "HEAD");
const sourceRevision = process.env.FORGE_SOURCE_REVISION || checkoutRevision;
if (!/^[0-9a-f]{40}$/.test(sourceRevision) || sourceRevision !== checkoutRevision) {
  throw new Error("co-design engine-batch source revision must equal the exact checkout");
}
const worktreeClean = git("status", "--porcelain").length === 0;
if (process.env.FORGE_REQUIRE_CLEAN_EVIDENCE === "1" && !worktreeClean) {
  throw new Error("co-design engine-batch evidence requires a clean exact-source checkout");
}

const catalogRoot = resolve(root, "catalog");
const contract = JSON.parse(readFileSync(resolve(root, "examples/vx2-proof.forge.json"), "utf8"));
const contractJson = stableJson(contract);
const contractHash = sha256(contractJson);
const dependencyManifestSha256 = sha256(readFileSync(resolve(root, "workers/pyproject.toml")));
const searchRequest = {
  task: "codesign.search-plan",
  contractHash,
  modelSnapshot: {
    schemaVersion: "forge-admitted-model-snapshot/1.0.0",
    modelId: "vx2-proof",
    contractHash,
    contractJson,
  },
  candidateBudget: 200,
  seed: 60,
  constraints: {
    maxMassG: 850,
    minEnduranceMin: 4,
    maxTaskTimeS: 21,
    minScore: 0.50,
  },
};
const python = process.env.FORGE_PYTHON || "python3";
const validator = process.env.FORGE_VALIDATE_BIN || resolve(root, "target/debug/forge-validate");
const env = {
  ...process.env,
  FORGE_SOURCE_REVISION: sourceRevision,
  FORGE_VALIDATE_BIN: validator,
  FORGE_CATALOG_DIR: catalogRoot,
  PYTHONPATH: [resolve(root, "workers"), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
};
const plan = runPython(python, ["-m", "forge_workers.codesign_search"], searchRequest, env);
if (
  plan.schemaVersion !== "forge-codesign-search-plan/3.0.0"
  || plan.source?.sourceRevision !== sourceRevision
  || plan.source?.dependencyManifestSha256 !== dependencyManifestSha256
  || plan.proposals?.length !== 200
) {
  throw new Error("co-design engine-batch input plan lost exact D64 source or proposal authority");
}

const request = {
  ...searchRequest,
  task: "codesign.engine-batch",
  searchPlan: plan,
};
const temporary = mkdtempSync(join(tmpdir(), "forge-p9-engine-batch-"));
const checkpointPath = join(temporary, "checkpoint.json");
let paused;
let cancelled;
let result;
try {
  paused = runPython(
    python,
    ["-m", "forge_workers.codesign_batch", "--checkpoint", checkpointPath, "--max-candidates", "7"],
    request,
    env,
  );
  if (
    paused.schemaVersion !== "forge-codesign-engine-batch/4.0.0"
    || paused.scheduler?.state !== "paused"
    || paused.scheduler?.nextOrdinal !== 7
    || paused.candidates?.length !== 7
    || paused.pareto?.length !== 0
    || paused.finalists?.length !== 0
  ) {
    throw new Error("co-design engine-batch did not retain the exact seven-candidate pause boundary");
  }
  cancelled = runPython(
    python,
    ["-m", "forge_workers.codesign_batch", "--checkpoint", checkpointPath, "--cancel"],
    request,
    env,
  );
  if (
    cancelled.scheduler?.state !== "cancelled"
    || cancelled.scheduler?.nextOrdinal !== 7
    || cancelled.candidates?.length !== 7
    || cancelled.scheduler?.attempts?.at(-1)?.candidatesEvaluated !== 0
  ) {
    throw new Error("co-design engine-batch cancellation dispatched work or changed the durable cursor");
  }
  result = runPython(
    python,
    ["-m", "forge_workers.codesign_batch", "--checkpoint", checkpointPath],
    request,
    env,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

if (
  result.schemaVersion !== "forge-codesign-engine-batch/4.0.0"
  || result.artifactKind !== "codesignEngineBatch"
  || result.provider !== "forge-local-engine-batch"
  || result.source?.baseContractHash !== contractHash
  || result.source?.searchPlanSha256 !== plan.planSha256
  || result.source?.proposalRuntimeAuthority?.authoritySha256
    !== plan.source?.proposalRuntimeAuthority?.authoritySha256
  || result.source?.catalogChoiceAuthority?.authoritySha256
    !== plan.source?.catalogChoiceAuthority?.authoritySha256
  || result.source?.trainingPhysics?.trainingBundleSchema !== "3.0.0"
  || result.source?.trainingPhysics?.catalogPhysicsSchema
    !== "forge-training-catalog-physics/1.0.0"
  || result.source?.trainingPhysics?.catalogNativeMassInertia !== true
  || result.source?.trainingPhysics?.catalogBenchTableApplicability
    !== "bound-and-fail-closed"
  || result.source?.trainingPhysics?.analyticFallbackAllowed !== true
  || result.source?.sourceRevision !== sourceRevision
  || result.source?.sourceRevisionRecorded !== true
  || result.source?.dependencyManifestSha256 !== dependencyManifestSha256
  || result.source?.maturity !== "catalog-bound-physics-platform-local-engine-200-batch"
  || result.scheduler?.state !== "complete"
  || result.scheduler?.nextOrdinal !== 200
  || result.scheduler?.completedCandidates !== 200
  || result.scheduler?.resumeObserved !== true
  || result.scheduler?.cancellationObserved !== true
  || result.scheduler?.checkpointEveryCandidate !== true
  || result.scheduler?.resumePolicy !== "exact-proposal-and-catalog-authority"
  || result.scheduler?.requiredRuntimeAuthoritySha256
    !== plan.source?.proposalRuntimeAuthority?.authoritySha256
  || result.scheduler?.requiredCatalogAuthoritySha256
    !== plan.source?.catalogChoiceAuthority?.catalogAuthoritySha256
  || result.scheduler?.heterogeneousResumeAllowed !== false
  || result.benchmark?.exactCandidateHashesEvaluated !== 200
  || result.benchmark?.nativeEvaluated !== 200
  || result.benchmark?.rapierEvaluated !== result.benchmark?.mujocoEvaluated
  || result.benchmark?.engineBatchComplete !== true
  || result.benchmark?.overnightComplete !== false
  || result.candidates?.length !== 200
  // The D64 fixture has exactly two real battery revisions. Driver-only variants
  // share mass/endurance within a revision, so physical dominance intentionally
  // leaves one point per revision. This is not the separate P9 >=3 phase-exit proof.
  || result.pareto?.length !== 2
  || result.finalists?.length !== 2
  || result.cost?.localExecution !== true
  || result.cost?.providerBillingVerified !== false
  || result.cost?.providerChargedAmount !== null
) {
  throw new Error(
    `co-design engine-batch completion, recovery, cost, or Pareto contract drifted: ${stableJson({
      schemaVersion: result.schemaVersion,
      provider: result.provider,
      scheduler: result.scheduler,
      benchmark: result.benchmark,
      paretoCount: result.pareto?.length,
      finalistCount: result.finalists?.length,
      cost: result.cost,
    })}`,
  );
}
for (const [ordinal, candidate] of result.candidates.entries()) {
  const proposal = plan.proposals[ordinal];
  if (
    candidate.ordinal !== ordinal
    || candidate.lineage?.proposalId !== proposal.id
    || candidate.lineage?.candidateSnapshotSha256 !== proposal.lineage?.candidateSnapshotSha256
    || candidate.lineage?.patchSha256 !== proposal.lineage?.patchSha256
    || candidate.lineage?.searchPlanSha256 !== plan.planSha256
    || candidate.lineage?.proposalRuntimeAuthoritySha256
      !== plan.source?.proposalRuntimeAuthority?.authoritySha256
    || candidate.lineage?.catalogAuthoritySha256
      !== plan.source?.catalogChoiceAuthority?.catalogAuthoritySha256
    || candidate.lineage?.catalogChoiceAuthoritySha256
      !== plan.source?.catalogChoiceAuthority?.authoritySha256
    || candidate.lineage?.selectedRowSha256 !== proposal.catalogChoice?.rowSha256
    || candidate.lineage?.selectedExactRevision !== proposal.catalogChoice?.exactRevision
    || stableJson(candidate.catalogChoice) !== stableJson(proposal.catalogChoice)
    || candidate.nativeEvaluation?.candidateSnapshotSha256 !== proposal.lineage?.candidateSnapshotSha256
    || candidate.nativeEvaluation?.schemaVersion !== "forge-codesign-native-evaluation/2.0.0"
    || candidate.nativeEvaluation?.catalogProof?.schemaVersion !== "forge-codesign-catalog-proof/1.0.0"
    || candidate.nativeEvaluation?.catalogProof?.catalogAuthoritySha256
      !== plan.source?.catalogChoiceAuthority?.catalogAuthoritySha256
    || candidate.nativeEvaluation?.catalogProof?.resolutionComplete !== true
    || candidate.nativeEvaluation?.catalogProof?.marketplacePublicationReviewed !== false
    || candidate.nativeEvaluation?.catalogProof?.marketplaceExposable !== false
    || candidate.evaluations?.tier3?.evaluated !== false
    || candidate.evaluations?.tier3?.held !== true
    || candidate.lineage?.mujocoRuntime !== "3.9.0"
    || candidate.lineage?.trainingBundleSchema !== "3.0.0"
    || candidate.evaluations?.tier2?.evidence?.trainingAuthority?.schemaVersion
      !== "forge-codesign-training-authority/1.0.0"
    || candidate.evaluations?.tier2?.evidence?.trainingAuthority?.catalogPhysicsSchema
      !== "forge-training-catalog-physics/1.0.0"
    || candidate.evaluations?.tier2?.evidence?.trainingAuthority?.catalogAuthoritySha256
      !== plan.source?.catalogChoiceAuthority?.catalogAuthoritySha256
    || candidate.evaluations?.tier2?.evidence?.trainingAuthority?.catalogNativeMassInertia
      !== true
    || candidate.evaluations?.tier2?.evidence?.trainingAuthority?.catalogBenchTableAuthority
      !== true
    || candidate.evaluations?.tier2?.evidence?.trainingAuthority?.catalogBenchTableUsed
      !== false
    || candidate.evaluations?.tier2?.evidence?.trainingAuthority?.powertrainModel
      !== "catalog-motor-battery-analytic-fallback-rejected-bench-table-v1"
  ) {
    throw new Error(`co-design engine-batch candidate ${ordinal} lost exact plan or tier authority`);
  }
  const selectedProof = candidate.nativeEvaluation.catalogProof.equippedComponents.filter(
    (component) => component.slotId === proposal.catalogChoice.slotId,
  );
  if (
    selectedProof.length !== 1
    || selectedProof[0].variantId !== proposal.catalogChoice.choiceId
    || selectedProof[0].exactRevision !== proposal.catalogChoice.exactRevision
    || selectedProof[0].rowSha256 !== proposal.catalogChoice.rowSha256
    || selectedProof[0].license?.id !== proposal.catalogChoice.license?.id
    || selectedProof[0].license?.class !== proposal.catalogChoice.license?.class
    || selectedProof[0].license?.exportPolicy !== proposal.catalogChoice.license?.exportPolicy
    || selectedProof[0].reviewRequired !== true
  ) {
    throw new Error(`co-design engine-batch candidate ${ordinal} lost equipped catalog authority`);
  }
  if (candidate.admitted === true && (
    candidate.evaluations?.tier0?.engineBacked !== true
    || candidate.evaluations?.tier1?.engine !== "rapier3d/0.33.0"
    || candidate.evaluations?.tier1?.engineBacked !== true
    || candidate.evaluations?.tier2?.engine !== "mujoco/3.9.0"
    || candidate.evaluations?.tier2?.engineBacked !== true
    || candidate.evaluations?.tier2?.evidence?.trainedPolicy !== false
    || candidate.evaluations?.tier2?.evidence?.estimatorOnly !== true
  )) {
    throw new Error(`admitted co-design engine-batch candidate ${ordinal} lacks sovereign engine evidence`);
  }
}
if (Object.values(result.nonclaims || {}).some((claim) => claim !== false)) {
  throw new Error("co-design engine-batch promoted a held downstream claim");
}
const resultHash = sha256(stableJson(result));
const evidence = {
  evidenceSchemaVersion: "p9-engine-batch-evidence/4.0.0",
  sourceRevision,
  worktreeClean,
  validator,
  searchPlanSha256: plan.planSha256,
  recoveryProof: {
    pausedAtOrdinal: 7,
    pausedCheckpointSha256: paused.checkpointSha256,
    cancelledAtOrdinal: 7,
    cancelledCheckpointSha256: cancelled.checkpointSha256,
    cancellationDispatchedCandidates: 0,
    finalAttempts: result.scheduler.attempts,
  },
  resultSha256: resultHash,
  result,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `codesign-engine-batch: ${result.benchmark.admittedCandidates}/200 admitted · ${result.pareto.length} Pareto · `
  + `${result.finalists.length} tier-3-held finalists · pause/cancel/resume retained · `
  + `${result.cost.measuredEngineRuntimeHours} engine h · ${outPath}`,
);
