#!/usr/bin/env node
// D64 proposal-only evidence: exact admitted catalog-backed snapshot -> pinned
// CMA-ES/TPE -> deterministic 200-proposal plan. No proposal is admitted here.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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
    if (operation.op !== "replace") {
      throw new Error("co-design search-plan patch escaped replace-only authority");
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

const catalogRoot = resolve(root, "catalog");
const componentNames = readdirSync(resolve(catalogRoot, "components"))
  .filter((name) => name.endsWith(".json"))
  .sort();
const catalogHasher = createHash("sha256").update("forge-file-catalog-authority-v1\0");
const catalogRows = new Map();
for (const name of componentNames) {
  const raw = readFileSync(resolve(catalogRoot, "components", name));
  const rowSha256 = sha256(raw);
  catalogHasher.update(`components/${name}\0${rowSha256}\n`);
  const row = JSON.parse(raw);
  catalogRows.set(row.id, { row, rowSha256 });
}
const catalogAuthoritySha256 = catalogHasher.digest("hex");
const contract = JSON.parse(readFileSync(resolve(root, "examples/vx2-proof.forge.json"), "utf8"));
const contractJson = JSON.stringify(stable(contract));
const contractHash = sha256(contractJson);
const dependencyManifestSha256 = sha256(readFileSync(resolve(root, "workers/pyproject.toml")));
const request = {
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
const run = spawnSync(python, ["-m", "forge_workers.codesign_search"], {
  cwd: root,
  encoding: "utf8",
  input: JSON.stringify(request),
  maxBuffer: 32 * 1024 * 1024,
  env: {
    ...process.env,
    FORGE_SOURCE_REVISION: sourceRevision,
    FORGE_CATALOG_DIR: catalogRoot,
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
  plan.schemaVersion !== "forge-codesign-search-plan/3.0.0"
  || plan.artifactKind !== "codesignSearchPlan"
  || plan.provider !== "forge-local-algorithm-search"
  || plan.source?.baseContractHash !== contractHash
  || plan.source?.sourceRevision !== sourceRevision
  || plan.source?.sourceRevisionRecorded !== true
  || plan.source?.dependencyManifestSha256 !== dependencyManifestSha256
  || plan.source?.maturity !== "catalog-bound-platform-algorithm-proposal-plan"
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
  || plan.manifold?.catalogChoiceSearch !== true
  || plan.manifold?.equippedVariantSemantics !== "exactly-one-equipped-d32"
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
const catalogChoiceAuthority = plan.source?.catalogChoiceAuthority;
exactKeys(
  catalogChoiceAuthority,
  [
    "schemaVersion",
    "catalogAuthoritySha256",
    "searchSlotId",
    "searchSlotIndex",
    "baseEquippedChoiceId",
    "choices",
    "marketplacePublicationReviewed",
    "marketplaceExposable",
    "authoritySha256",
  ],
  "co-design catalog-choice authority",
);
const catalogChoiceAuthoritySha256 = sha256(stableJson(Object.fromEntries(
  Object.entries(catalogChoiceAuthority).filter(([name]) => name !== "authoritySha256"),
)));
if (
  catalogChoiceAuthority.schemaVersion !== "forge-codesign-catalog-choice-authority/1.0.0"
  || catalogChoiceAuthority.catalogAuthoritySha256 !== catalogAuthoritySha256
  || catalogChoiceAuthority.authoritySha256 !== catalogChoiceAuthoritySha256
  || catalogChoiceAuthority.searchSlotId !== "battery"
  || catalogChoiceAuthority.choices?.length !== 2
  || catalogChoiceAuthority.marketplacePublicationReviewed !== false
  || catalogChoiceAuthority.marketplaceExposable !== false
) {
  throw new Error("co-design catalog-choice authority drifted");
}
for (const choice of catalogChoiceAuthority.choices) {
  const resolved = catalogRows.get(choice.componentId);
  if (
    resolved?.rowSha256 !== choice.rowSha256
    || resolved?.row.category !== "battery"
    || resolved?.row.elec?.capacityMah !== choice.capacityMah
    || resolved?.row.elec?.maxDischargeA !== choice.maxDischargeA
    || resolved?.row.license?.id !== choice.license?.id
    || resolved?.row.license?.class !== choice.license?.class
    || resolved?.row.license?.exportPolicy !== choice.license?.exportPolicy
    || choice.reviewRequired !== true
  ) {
    throw new Error(`co-design catalog choice ${choice.choiceId} lost row, license, or review authority`);
  }
}
const cma = plan.proposals.filter((proposal) => proposal.algorithm === "cma-es");
const tpe = plan.proposals.filter((proposal) => proposal.algorithm === "optuna-tpe");
const candidateHashes = new Set();
const parameterRows = new Set();
const bounds = {
  tiltMaxRad: [0.32, 0.48],
  yawRateRadS: [2.0, 2.8],
};
for (const [ordinal, proposal] of plan.proposals.entries()) {
  exactKeys(
    proposal,
    ["id", "ordinal", "algorithm", "catalogChoice", "parameters", "acquisition", "patch", "lineage"],
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
    [
      "patchSha256",
      "candidateSnapshotSha256",
      "catalogAuthoritySha256",
      "catalogChoiceAuthoritySha256",
      "selectedRowSha256",
      "selectedExactRevision",
    ],
    `co-design proposal ${ordinal} lineage`,
  );
  if (
    proposal.ordinal !== ordinal
    || proposal.acquisition.evaluator !== "bounded-diversity-acquisition-v1"
    || proposal.acquisition.physicalObjective !== false
    || proposal.acquisition.engineFeedback !== false
    || !Number.isFinite(proposal.acquisition.loss)
    || !Array.isArray(proposal.patch)
    || !catalogChoiceAuthority.choices.some((choice) => stableJson(choice) === stableJson(proposal.catalogChoice))
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
  const expectedPaths = [
    "/slots/1/equippedVariantId",
    "/sim/battery/capacity_mAh",
    "/sim/battery/cRating",
    "/driver/params/tiltMaxRad",
    "/driver/params/yawRate",
  ];
  if (stableJson(proposal.patch.map((operation) => operation.path)) !== stableJson(expectedPaths)) {
    throw new Error(`co-design proposal ${ordinal} escaped exact catalog/driver patch authority`);
  }
  const candidate = applyReplacePatch(contract, proposal.patch);
  const candidateSnapshotSha256 = sha256(stableJson(candidate));
  if (
    proposal.lineage.patchSha256 !== patchSha256
    || proposal.lineage.candidateSnapshotSha256 !== candidateSnapshotSha256
    || proposal.lineage.catalogAuthoritySha256 !== catalogAuthoritySha256
    || proposal.lineage.catalogChoiceAuthoritySha256 !== catalogChoiceAuthoritySha256
    || proposal.lineage.selectedRowSha256 !== proposal.catalogChoice.rowSha256
    || proposal.lineage.selectedExactRevision !== proposal.catalogChoice.exactRevision
    || candidate.slots?.[1]?.equippedVariantId !== proposal.catalogChoice.choiceId
    || candidate.sim?.battery?.capacity_mAh !== proposal.catalogChoice.capacityMah
    || candidate.sim?.battery?.cRating !== proposal.catalogChoice.cRating
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
  "catalogMarketplacePublicationReviewed",
  "catalogLivePersistence",
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
    `codesign.search:v3:${contractHash.slice(0, 16)}:`
    + `${catalogChoiceAuthoritySha256.slice(0, 16)}:`
    + `${runtimeAuthoritySha256.slice(0, 16)}:${planSha256.slice(0, 16)}`
  )
) {
  throw new Error(
    `co-design search-plan aggregate lineage drifted: plan=${plan.planSha256}/${planSha256} cache=${plan.cacheKey}`,
  );
}
const evidence = {
  evidenceSchemaVersion: "p9-search-plan-evidence/3.0.0",
  sourceRevision,
  worktreeClean,
  result: plan,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(
  `codesign-search-plan: 100 CMA-ES + 100 Optuna TPE proposals · 2 exact battery revisions · catalog/runtime bound · no engine/admission authority · ${outPath}`,
);
