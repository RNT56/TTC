#!/usr/bin/env node
// D60 proposal-only evidence: exact admitted snapshot -> real pinned CMA-ES/TPE
// -> deterministic 200-proposal plan. No proposal is evaluated or admitted here.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outArg = process.argv.indexOf("--out");
const outPath = resolve(
  root,
  outArg >= 0 ? process.argv[outArg + 1] : "artifacts/codesign/p9-search-plan.json",
);

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

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function exactKeys(value, expected, label) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())
  ) {
    throw new Error(`${label} fields are not exact`);
  }
}

function pointerTokens(pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/") || pointer === "/") {
    throw new Error("co-design search-plan patch path is invalid");
  }
  return pointer.slice(1).split("/").map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function applyReplacePatch(source, patch) {
  const result = structuredClone(source);
  for (const operation of patch) {
    exactKeys(operation, ["op", "path", "value"], "co-design search-plan patch operation");
    if (
      operation.op !== "replace"
      || !/^\/sim\/(motors\/\d+\/kv|props\/\d+\/diameterIn|battery\/capacity_mAh)$/.test(operation.path)
    ) {
      throw new Error("co-design search-plan patch escaped the frozen electrical manifold");
    }
    const tokens = pointerTokens(operation.path);
    let parent = result;
    for (const token of tokens.slice(0, -1)) {
      if (Array.isArray(parent)) {
        if (!/^\d+$/.test(token) || Number(token) >= parent.length) {
          throw new Error("co-design search-plan patch index is outside the source snapshot");
        }
        parent = parent[Number(token)];
      } else if (parent && typeof parent === "object" && Object.hasOwn(parent, token)) {
        parent = parent[token];
      } else {
        throw new Error("co-design search-plan patch path is absent from the source snapshot");
      }
    }
    const leaf = tokens.at(-1);
    if (Array.isArray(parent)) {
      if (!/^\d+$/.test(leaf) || Number(leaf) >= parent.length) {
        throw new Error("co-design search-plan patch leaf is outside the source snapshot");
      }
      parent[Number(leaf)] = structuredClone(operation.value);
    } else if (parent && typeof parent === "object" && Object.hasOwn(parent, leaf)) {
      parent[leaf] = structuredClone(operation.value);
    } else {
      throw new Error("co-design search-plan patch target is absent from the source snapshot");
    }
  }
  return result;
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const checkoutRevision = git("rev-parse", "HEAD");
const sourceRevision = process.env.FORGE_SOURCE_REVISION || checkoutRevision;
if (!/^[0-9a-f]{40}$/.test(sourceRevision) || sourceRevision !== checkoutRevision) {
  throw new Error("co-design search-plan source revision must equal the exact checkout");
}
const worktreeClean = git("status", "--porcelain").length === 0;
if (process.env.FORGE_REQUIRE_CLEAN_EVIDENCE === "1" && !worktreeClean) {
  throw new Error("co-design search-plan evidence requires a clean exact-source checkout");
}

const contract = JSON.parse(readFileSync(resolve(root, "examples/vx2-mini.forge.json"), "utf8"));
const contractJson = JSON.stringify(stable(contract));
const contractHash = sha256(contractJson);
const dependencyManifestSha256 = sha256(readFileSync(resolve(root, "workers/pyproject.toml")));
const request = {
  task: "codesign.search-plan",
  contractHash,
  modelSnapshot: {
    schemaVersion: "forge-admitted-model-snapshot/1.0.0",
    modelId: "vx2-mini",
    contractHash,
    contractJson,
  },
  candidateBudget: 200,
  seed: 60,
  constraints: {
    maxMassG: 850,
    minEnduranceMin: 8,
    maxTaskTimeS: 21,
    minScore: 0.70,
  },
};
const python = process.env.FORGE_PYTHON || "python3";
const run = spawnSync(python, ["-m", "forge_workers.codesign_search"], {
  cwd: root,
  encoding: "utf8",
  input: JSON.stringify(request),
  maxBuffer: 32 * 1024 * 1024,
  env: {
    ...process.env,
    FORGE_SOURCE_REVISION: sourceRevision,
    PYTHONPATH: [resolve(root, "workers"), process.env.PYTHONPATH].filter(Boolean).join(delimiter),
  },
});
if (run.error) throw new Error(`co-design search-plan could not launch ${python}: ${run.error.message}`);
if (run.status !== 0) {
  throw new Error(`co-design search-plan failed (${run.status}): ${(run.stderr || "").trim()}`);
}
const plan = JSON.parse(run.stdout);
exactKeys(
  plan,
  [
    "schemaVersion",
    "artifactKind",
    "provider",
    "cacheKey",
    "source",
    "manifold",
    "constraints",
    "algorithms",
    "proposals",
    "nonclaims",
    "planSha256",
  ],
  "co-design search-plan",
);
if (
  plan.schemaVersion !== "forge-codesign-search-plan/2.0.0"
  || plan.artifactKind !== "codesignSearchPlan"
  || plan.provider !== "forge-local-algorithm-search"
  || plan.source?.baseContractHash !== contractHash
  || plan.source?.sourceRevision !== sourceRevision
  || plan.source?.sourceRevisionRecorded !== true
  || plan.source?.dependencyManifestSha256 !== dependencyManifestSha256
  || plan.source?.maturity !== "platform-bound-algorithm-proposal-plan"
  || plan.source?.resumePolicy !== "exact-proposal-runtime-authority"
  || plan.source?.heterogeneousResumeAllowed !== false
  || plan.algorithms?.candidateBudget !== 200
  || plan.algorithms?.cmaEs?.version !== "0.13.0"
  || plan.algorithms?.cmaEs?.proposals !== 100
  || plan.algorithms?.cmaEs?.engineFeedback !== false
  || plan.algorithms?.optunaTpe?.version !== "4.9.0"
  || plan.algorithms?.optunaTpe?.proposals !== 100
  || plan.algorithms?.optunaTpe?.engineFeedback !== false
  || plan.proposals?.length !== 200
  || plan.manifold?.catalogChoiceSearch !== false
) {
  throw new Error("co-design search-plan identity, source, algorithm, or maturity contract drifted");
}
const runtimeAuthority = plan.source?.proposalRuntimeAuthority;
exactKeys(
  runtimeAuthority,
  ["schemaVersion", "platform", "python", "numpy", "algorithms", "authoritySha256"],
  "co-design proposal runtime authority",
);
exactKeys(
  runtimeAuthority.platform,
  ["system", "release", "version", "machine", "byteOrder", "libc"],
  "co-design proposal platform authority",
);
exactKeys(runtimeAuthority.platform.libc, ["name", "version"], "co-design proposal libc authority");
exactKeys(
  runtimeAuthority.python,
  ["implementation", "version", "cacheTag"],
  "co-design proposal Python authority",
);
exactKeys(
  runtimeAuthority.numpy,
  [
    "version",
    "distributionRecordSha256",
    "configurationSha256",
    "cpuFeatures",
    "blas",
    "lapack",
  ],
  "co-design proposal NumPy authority",
);
exactKeys(runtimeAuthority.algorithms, ["cmaes", "optuna"], "co-design proposal algorithm authority");
for (const algorithm of ["cmaes", "optuna"]) {
  exactKeys(
    runtimeAuthority.algorithms[algorithm],
    ["version", "distributionRecordSha256"],
    `co-design proposal ${algorithm} authority`,
  );
}
const runtimeAuthoritySha256 = sha256(stableJson(Object.fromEntries(
  Object.entries(runtimeAuthority).filter(([name]) => name !== "authoritySha256"),
)));
if (
  runtimeAuthority.schemaVersion !== "forge-codesign-proposal-runtime-authority/1.0.0"
  || runtimeAuthority.authoritySha256 !== runtimeAuthoritySha256
  || !/^[0-9a-f]{64}$/.test(runtimeAuthority.numpy.distributionRecordSha256)
  || !/^[0-9a-f]{64}$/.test(runtimeAuthority.numpy.configurationSha256)
  || Object.keys(runtimeAuthority.numpy.cpuFeatures || {}).length === 0
) {
  throw new Error("co-design proposal runtime authority drifted");
}
const cma = plan.proposals.filter((proposal) => proposal.algorithm === "cma-es");
const tpe = plan.proposals.filter((proposal) => proposal.algorithm === "optuna-tpe");
const candidateHashes = new Set();
const parameterRows = new Set();
const bounds = {
  motorKvScale: [0.94, 1.06],
  propDiameterScale: [0.94, 1.06],
  batteryCapacityScale: [0.90, 1.10],
};
for (const [ordinal, proposal] of plan.proposals.entries()) {
  exactKeys(
    proposal,
    ["id", "ordinal", "algorithm", "profile", "parameters", "acquisition", "patch", "lineage"],
    `co-design proposal ${ordinal}`,
  );
  exactKeys(proposal.parameters, Object.keys(bounds), `co-design proposal ${ordinal} parameters`);
  exactKeys(
    proposal.acquisition,
    ["evaluator", "loss", "physicalObjective", "engineFeedback"],
    `co-design proposal ${ordinal} acquisition`,
  );
  exactKeys(
    proposal.lineage,
    ["patchSha256", "candidateSnapshotSha256"],
    `co-design proposal ${ordinal} lineage`,
  );
  if (
    proposal.ordinal !== ordinal
    || proposal.acquisition.evaluator !== "bounded-diversity-acquisition-v1"
    || proposal.acquisition.physicalObjective !== false
    || proposal.acquisition.engineFeedback !== false
    || !Number.isFinite(proposal.acquisition.loss)
    || !Array.isArray(proposal.patch)
  ) {
    throw new Error(`co-design proposal ${ordinal} identity or acquisition drifted`);
  }
  for (const [name, [low, high]] of Object.entries(bounds)) {
    const value = proposal.parameters[name];
    if (!Number.isFinite(value) || value < low || value > high) {
      throw new Error(`co-design proposal ${ordinal} escaped ${name} bounds`);
    }
  }
  const patchSha256 = sha256(stableJson(proposal.patch));
  const candidate = applyReplacePatch(contract, proposal.patch);
  const candidateSnapshotSha256 = sha256(stableJson(candidate));
  if (
    proposal.lineage.patchSha256 !== patchSha256
    || proposal.lineage.candidateSnapshotSha256 !== candidateSnapshotSha256
    || proposal.id !== `proposal-${String(ordinal).padStart(3, "0")}-${candidateSnapshotSha256.slice(0, 12)}`
  ) {
    throw new Error(`co-design proposal ${ordinal} lineage drifted`);
  }
  candidateHashes.add(candidateSnapshotSha256);
  parameterRows.add(stableJson(proposal.parameters));
}
if (cma.length !== 100 || tpe.length !== 100 || candidateHashes.size !== 200 || parameterRows.size !== 200) {
  throw new Error("co-design search-plan did not retain two exact 100-proposal families and 200 unique snapshots");
}
const expectedNonclaims = [
  "validatorEvaluated",
  "rapierEvaluated",
  "mujocoEvaluated",
  "candidateAdmitted",
  "paretoComputed",
  "physicalConstraintsEvaluated",
  "overnight200Candidate",
  "trainedFinalist",
  "catalogChoiceSearch",
  "providerSandbox",
  "buildReady",
  "hardwareAuthority",
  "fieldEvidence",
];
exactKeys(plan.nonclaims, expectedNonclaims, "co-design search-plan nonclaims");
if (
  Object.values(plan.nonclaims || {}).some((value) => value !== false)
  || plan.nonclaims?.physicalConstraintsEvaluated !== false
  || plan.nonclaims?.overnight200Candidate !== false
  || plan.nonclaims?.candidateAdmitted !== false
) {
  throw new Error("co-design search-plan promoted an unevaluated proposal");
}
const planHashPayload = {
  source: plan.source,
  manifold: plan.manifold,
  constraints: plan.constraints,
  algorithms: plan.algorithms,
  proposals: plan.proposals,
  nonclaims: plan.nonclaims,
};
const planSha256 = sha256(stableJson(planHashPayload));
if (
  plan.planSha256 !== planSha256
  || plan.cacheKey !== (
    `codesign.search:v2:${contractHash.slice(0, 16)}:`
    + `${runtimeAuthoritySha256.slice(0, 16)}:${planSha256.slice(0, 16)}`
  )
) {
  throw new Error("co-design search-plan aggregate lineage drifted");
}
const evidence = {
  evidenceSchemaVersion: "p9-search-plan-evidence/2.0.0",
  sourceRevision,
  worktreeClean,
  result: plan,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `codesign-search-plan: 100 CMA-ES + 100 Optuna TPE proposals · platform-bound runtime · no engine/admission authority · ${outPath}`,
);
