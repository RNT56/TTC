#!/usr/bin/env node
// D62 cross-runtime evidence: compare every proposal hash while retaining an exact
// platform/runtime boundary. Differing candidates are allowed only because v2
// explicitly forbids heterogeneous replay and resume.

import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const MAX_EVIDENCE_BYTES = 32 * 1024 * 1024;
const COMPARISON_SCHEMA = "p9-platform-authority-comparison/1.0.0";

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

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) {
    throw new Error(`missing ${name}`);
  }
  return process.argv[index + 1];
}

function readEvidence(pathValue, label) {
  const path = resolve(pathValue);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_EVIDENCE_BYTES) {
    throw new Error(`${label} evidence is not one bounded regular file`);
  }
  const bytes = readFileSync(path);
  let evidence;
  try {
    evidence = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} evidence is not JSON`, { cause: error });
  }
  exactKeys(
    evidence,
    ["evidenceSchemaVersion", "sourceRevision", "worktreeClean", "result"],
    `${label} evidence`,
  );
  if (
    evidence.evidenceSchemaVersion !== "p9-search-plan-evidence/2.0.0"
    || !/^[0-9a-f]{40}$/.test(evidence.sourceRevision)
    || evidence.worktreeClean !== true
  ) {
    throw new Error(`${label} evidence lacks clean v2 source authority`);
  }
  const plan = evidence.result;
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
    `${label} plan`,
  );
  if (
    plan.schemaVersion !== "forge-codesign-search-plan/2.0.0"
    || plan.artifactKind !== "codesignSearchPlan"
    || plan.provider !== "forge-local-algorithm-search"
    || plan.source?.sourceRevision !== evidence.sourceRevision
    || plan.source?.sourceRevisionRecorded !== true
    || plan.source?.resumePolicy !== "exact-proposal-runtime-authority"
    || plan.source?.heterogeneousResumeAllowed !== false
    || plan.algorithms?.candidateBudget !== 200
    || !Array.isArray(plan.proposals)
    || plan.proposals.length !== 200
  ) {
    throw new Error(`${label} plan lacks exact platform-bound v2 authority`);
  }
  exactKeys(
    plan.source,
    [
      "snapshotSchema",
      "modelId",
      "baseContractHash",
      "sourceRevision",
      "sourceRevisionRecorded",
      "dependencyManifestSha256",
      "proposalRuntimeAuthority",
      "resumePolicy",
      "heterogeneousResumeAllowed",
      "runtime",
      "maturity",
    ],
    `${label} plan source`,
  );
  if (
    plan.source.snapshotSchema !== "forge-admitted-model-snapshot/1.0.0"
    || typeof plan.source.modelId !== "string"
    || plan.source.modelId.length === 0
    || !/^[0-9a-f]{64}$/.test(plan.source.baseContractHash)
    || !/^[0-9a-f]{64}$/.test(plan.source.dependencyManifestSha256)
    || plan.source.runtime !== "forge-codesign-search-plan/2.0.0"
    || plan.source.maturity !== "platform-bound-algorithm-proposal-plan"
  ) {
    throw new Error(`${label} plan source identity drifted`);
  }
  const authority = plan.source.proposalRuntimeAuthority;
  exactKeys(
    authority,
    ["schemaVersion", "platform", "python", "numpy", "algorithms", "authoritySha256"],
    `${label} runtime authority`,
  );
  exactKeys(
    authority.platform,
    ["system", "release", "version", "machine", "byteOrder", "libc"],
    `${label} platform authority`,
  );
  exactKeys(authority.platform.libc, ["name", "version"], `${label} libc authority`);
  exactKeys(
    authority.python,
    ["implementation", "version", "cacheTag"],
    `${label} Python authority`,
  );
  exactKeys(
    authority.numpy,
    [
      "version",
      "distributionRecordSha256",
      "configurationSha256",
      "cpuFeatures",
      "blas",
      "lapack",
    ],
    `${label} NumPy authority`,
  );
  exactKeys(authority.algorithms, ["cmaes", "optuna"], `${label} algorithm authority`);
  exactKeys(
    authority.algorithms.cmaes,
    ["version", "distributionRecordSha256"],
    `${label} CMA-ES authority`,
  );
  exactKeys(
    authority.algorithms.optuna,
    ["version", "distributionRecordSha256"],
    `${label} Optuna authority`,
  );
  const authoritySha256 = sha256(stableJson(Object.fromEntries(
    Object.entries(authority).filter(([name]) => name !== "authoritySha256"),
  )));
  if (
    authority.schemaVersion !== "forge-codesign-proposal-runtime-authority/1.0.0"
    || authority.authoritySha256 !== authoritySha256
    || !["little", "big"].includes(authority.platform.byteOrder)
    || ["system", "release", "version", "machine"].some(
      (name) => typeof authority.platform[name] !== "string" || !authority.platform[name],
    )
    || ["name", "version"].some((name) => typeof authority.platform.libc[name] !== "string")
    || authority.python.implementation !== "CPython"
    || ["version", "cacheTag"].some(
      (name) => typeof authority.python[name] !== "string" || !authority.python[name],
    )
    || authority.numpy.version !== "2.5.1"
    || !/^[0-9a-f]{64}$/.test(authority.numpy.distributionRecordSha256)
    || !/^[0-9a-f]{64}$/.test(authority.numpy.configurationSha256)
    || !authority.numpy.cpuFeatures
    || typeof authority.numpy.cpuFeatures !== "object"
    || Array.isArray(authority.numpy.cpuFeatures)
    || Object.keys(authority.numpy.cpuFeatures).length === 0
    || Object.entries(authority.numpy.cpuFeatures).some(
      ([name, enabled]) => !name || typeof enabled !== "boolean",
    )
    || !authority.numpy.blas
    || typeof authority.numpy.blas !== "object"
    || Array.isArray(authority.numpy.blas)
    || !authority.numpy.lapack
    || typeof authority.numpy.lapack !== "object"
    || Array.isArray(authority.numpy.lapack)
    || authority.algorithms.cmaes.version !== "0.13.0"
    || !/^[0-9a-f]{64}$/.test(authority.algorithms.cmaes.distributionRecordSha256)
    || authority.algorithms.optuna.version !== "4.9.0"
    || !/^[0-9a-f]{64}$/.test(authority.algorithms.optuna.distributionRecordSha256)
    || plan.cacheKey !== (
      `codesign.search:v2:${plan.source.baseContractHash.slice(0, 16)}:`
      + `${authoritySha256.slice(0, 16)}:${plan.planSha256.slice(0, 16)}`
    )
  ) {
    throw new Error(`${label} runtime authority hash or cache partition drifted`);
  }
  const planHashPayload = {
    source: plan.source,
    manifold: plan.manifold,
    constraints: plan.constraints,
    algorithms: plan.algorithms,
    proposals: plan.proposals,
    nonclaims: plan.nonclaims,
  };
  if (plan.planSha256 !== sha256(stableJson(planHashPayload))) {
    throw new Error(`${label} plan hash drifted`);
  }
  const candidateHashes = [];
  const patchHashes = [];
  for (const [ordinal, proposal] of plan.proposals.entries()) {
    if (
      proposal?.ordinal !== ordinal
      || !/^[0-9a-f]{64}$/.test(proposal?.lineage?.candidateSnapshotSha256 || "")
      || !/^[0-9a-f]{64}$/.test(proposal?.lineage?.patchSha256 || "")
    ) {
      throw new Error(`${label} proposal ${ordinal} lineage is invalid`);
    }
    candidateHashes.push(proposal.lineage.candidateSnapshotSha256);
    patchHashes.push(proposal.lineage.patchSha256);
  }
  if (new Set(candidateHashes).size !== 200 || new Set(patchHashes).size !== 200) {
    throw new Error(`${label} plan lacks 200 unique proposal lineages`);
  }
  return {
    path,
    fileSha256: sha256(bytes),
    evidence,
    plan,
    authority,
    candidateHashes,
    patchHashes,
  };
}

function platformSummary(authority) {
  return {
    authoritySha256: authority.authoritySha256,
    system: authority.platform.system,
    release: authority.platform.release,
    machine: authority.platform.machine,
    python: authority.python.version,
    numpy: authority.numpy.version,
    numpyDistributionRecordSha256: authority.numpy.distributionRecordSha256,
    numpyConfigurationSha256: authority.numpy.configurationSha256,
  };
}

const left = readEvidence(argument("--left"), "left");
const right = readEvidence(argument("--right"), "right");
const outPath = resolve(argument("--out"));
if (left.evidence.sourceRevision !== right.evidence.sourceRevision) {
  throw new Error("cross-platform evidence must bind the same exact source revision");
}
for (const field of ["baseContractHash", "dependencyManifestSha256"]) {
  if (left.plan.source[field] !== right.plan.source[field]) {
    throw new Error(`cross-platform ${field} drifted`);
  }
}
for (const field of ["manifold", "constraints", "algorithms", "nonclaims"]) {
  if (stableJson(left.plan[field]) !== stableJson(right.plan[field])) {
    throw new Error(`cross-platform ${field} drifted`);
  }
}
if (left.authority.authoritySha256 === right.authority.authoritySha256) {
  throw new Error("cross-platform comparison requires two distinct runtime authorities");
}
const differingCandidateOrdinals = [];
const differingPatchOrdinals = [];
for (let ordinal = 0; ordinal < 200; ordinal += 1) {
  if (left.candidateHashes[ordinal] !== right.candidateHashes[ordinal]) {
    differingCandidateOrdinals.push(ordinal);
  }
  if (left.patchHashes[ordinal] !== right.patchHashes[ordinal]) {
    differingPatchOrdinals.push(ordinal);
  }
}
const value = {
  schemaVersion: COMPARISON_SCHEMA,
  sourceRevision: left.evidence.sourceRevision,
  left: {
    evidenceFileSha256: left.fileSha256,
    planSha256: left.plan.planSha256,
    runtime: platformSummary(left.authority),
  },
  right: {
    evidenceFileSha256: right.fileSha256,
    planSha256: right.plan.planSha256,
    runtime: platformSummary(right.authority),
  },
  comparison: {
    exactOrdinalsCompared: 200,
    matchingCandidateHashes: 200 - differingCandidateOrdinals.length,
    differingCandidateHashes: differingCandidateOrdinals.length,
    differingCandidateOrdinals,
    matchingPatchHashes: 200 - differingPatchOrdinals.length,
    differingPatchHashes: differingPatchOrdinals.length,
    differingPatchOrdinals,
  },
  policy: {
    resumePolicy: "exact-proposal-runtime-authority",
    heterogeneousResumeAllowed: false,
    crossRuntimeCacheReuseAllowed: false,
    crossRuntimeTier3Authority: false,
  },
  comparisonSha256: "",
};
value.comparisonSha256 = sha256(stableJson(
  Object.fromEntries(Object.entries(value).filter(([name]) => name !== "comparisonSha256")),
));
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(value, null, 2)}\n`);
console.log(
  `codesign-platform-compare: 200/200 compared · ${value.comparison.differingCandidateHashes} candidate `
  + `and ${value.comparison.differingPatchHashes} patch hashes differ · heterogeneous resume refused · ${outPath}`,
);
