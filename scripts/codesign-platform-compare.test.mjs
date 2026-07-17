import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const script = resolve(root, "scripts/codesign-platform-compare.mjs");

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

function authority(machine) {
  const value = {
    schemaVersion: "forge-codesign-proposal-runtime-authority/1.0.0",
    platform: {
      system: machine === "arm64" ? "Darwin" : "Linux",
      release: "fixture-release",
      version: "fixture-version",
      machine,
      byteOrder: "little",
      libc: { name: machine === "arm64" ? "" : "glibc", version: machine === "arm64" ? "" : "2.39" },
    },
    python: { implementation: "CPython", version: "3.12.13", cacheTag: "cpython-312" },
    numpy: {
      version: "2.5.1",
      distributionRecordSha256: sha256(`numpy:${machine}`),
      configurationSha256: sha256(`numpy-config:${machine}`),
      cpuFeatures: { ASIMD: machine === "arm64", AVX2: machine !== "arm64" },
      blas: { name: machine === "arm64" ? "accelerate" : "scipy-openblas" },
      lapack: { name: machine === "arm64" ? "accelerate" : "scipy-openblas" },
    },
    algorithms: {
      cmaes: { version: "0.13.0", distributionRecordSha256: sha256("cmaes") },
      optuna: { version: "4.9.0", distributionRecordSha256: sha256("optuna") },
    },
    authoritySha256: "",
  };
  value.authoritySha256 = sha256(stableJson(Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== "authoritySha256"),
  )));
  return value;
}

function evidence(machine, sourceRevision, changed = false) {
  const runtime = authority(machine);
  const proposals = Array.from({ length: 200 }, (_, ordinal) => {
    const platformRow = changed && ordinal >= 20 && ordinal < 100 ? machine : "shared";
    return {
      ordinal,
      lineage: {
        candidateSnapshotSha256: sha256(`candidate:${platformRow}:${ordinal}`),
        patchSha256: sha256(`patch:${platformRow}:${ordinal}`),
      },
    };
  });
  const plan = {
    schemaVersion: "forge-codesign-search-plan/2.0.0",
    artifactKind: "codesignSearchPlan",
    provider: "forge-local-algorithm-search",
    cacheKey: "",
    source: {
      snapshotSchema: "forge-admitted-model-snapshot/1.0.0",
      modelId: "vx2-mini",
      sourceRevision,
      sourceRevisionRecorded: true,
      baseContractHash: sha256("contract"),
      dependencyManifestSha256: sha256("manifest"),
      proposalRuntimeAuthority: runtime,
      resumePolicy: "exact-proposal-runtime-authority",
      heterogeneousResumeAllowed: false,
      runtime: "forge-codesign-search-plan/2.0.0",
      maturity: "platform-bound-algorithm-proposal-plan",
    },
    manifold: { source: "fixture" },
    constraints: { maxMassG: 850 },
    algorithms: { candidateBudget: 200, seed: 60 },
    proposals,
    nonclaims: { trainedFinalist: false },
    planSha256: "",
  };
  plan.planSha256 = sha256(stableJson({
    source: plan.source,
    manifold: plan.manifold,
    constraints: plan.constraints,
    algorithms: plan.algorithms,
    proposals: plan.proposals,
    nonclaims: plan.nonclaims,
  }));
  plan.cacheKey = (
    `codesign.search:v2:${plan.source.baseContractHash.slice(0, 16)}:`
    + `${runtime.authoritySha256.slice(0, 16)}:${plan.planSha256.slice(0, 16)}`
  );
  return {
    evidenceSchemaVersion: "p9-search-plan-evidence/2.0.0",
    sourceRevision,
    worktreeClean: true,
    result: plan,
  };
}

function run(left, right) {
  const directory = mkdtempSync(join(tmpdir(), "forge-codesign-platform-"));
  const leftPath = join(directory, "left.json");
  const rightPath = join(directory, "right.json");
  const outPath = join(directory, "comparison.json");
  writeFileSync(leftPath, `${JSON.stringify(left)}\n`);
  writeFileSync(rightPath, `${JSON.stringify(right)}\n`);
  const result = spawnSync(
    process.execPath,
    [script, "--left", leftPath, "--right", rightPath, "--out", outPath],
    { cwd: root, encoding: "utf8" },
  );
  const value = result.status === 0 ? JSON.parse(readFileSync(outPath, "utf8")) : null;
  rmSync(directory, { recursive: true, force: true });
  return { ...result, value };
}

test("distinct exact runtimes compare all 200 hashes and retain platform-bound refusal", () => {
  const revision = "a".repeat(40);
  const result = run(evidence("x86_64", revision), evidence("arm64", revision, true));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.schemaVersion, "p9-platform-authority-comparison/1.0.0");
  assert.equal(result.value.comparison.exactOrdinalsCompared, 200);
  assert.equal(result.value.comparison.matchingCandidateHashes, 120);
  assert.equal(result.value.comparison.differingCandidateHashes, 80);
  assert.deepEqual(
    result.value.comparison.differingCandidateOrdinals,
    Array.from({ length: 80 }, (_, index) => index + 20),
  );
  assert.equal(result.value.policy.heterogeneousResumeAllowed, false);
  assert.equal(result.value.policy.crossRuntimeCacheReuseAllowed, false);
});

test("comparison refuses the same runtime and source drift", () => {
  const revision = "b".repeat(40);
  const same = run(evidence("arm64", revision), evidence("arm64", revision));
  assert.notEqual(same.status, 0);
  assert.match(same.stderr, /distinct runtime authorities/);

  const drift = run(evidence("x86_64", revision), evidence("arm64", "c".repeat(40), true));
  assert.notEqual(drift.status, 0);
  assert.match(drift.stderr, /same exact source revision/);
});
