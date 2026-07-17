import assert from "node:assert/strict";
import test from "node:test";

import { controlledCodesignDisclosure } from "../src/jobOutputs.ts";

function candidate(id: string) {
  return {
    id,
    admitted: true,
    lineage: {
      maturity: "local-engine-controlled-smoke",
      mujocoRuntime: "3.9.0",
      trainingBundleSchema: "2.0.0",
      candidateSnapshotSha256: "a".repeat(64),
      nativeEvaluationSha256: "b".repeat(64),
    },
    evaluations: {
      tier0: { pass: true, engine: "forge-validate-native", engineBacked: true },
      tier1: { pass: true, engine: "rapier3d/0.33.0", engineBacked: true },
      tier2: { pass: true, engine: "mujoco/3.9.0", engineBacked: true },
      tier3: { pass: false, evaluated: false, held: true, engine: "not-run", engineBacked: false },
    },
  };
}

function output() {
  const candidates = [candidate("a"), candidate("b"), candidate("c")];
  return {
    schemaVersion: "forge-codesign-evaluation/1.0.0",
    artifactKind: "codesign",
    provider: "forge-local-engine-codesign",
    source: {
      runtime: "forge-codesign-engine-smoke/1.0.0",
      maturity: "local-engine-controlled-smoke",
      sourceRevisionRecorded: true,
      sourceRevision: "c".repeat(40),
      dependencyManifestSha256: "d".repeat(64),
    },
    tiers: ["validator-oracle", "rapier-smoke", "mujoco-rollout", "training-finalist-held"],
    optimizer: {
      algorithm: "deterministic-controlled-smoke",
      engineBacked: true,
      overnightComplete: false,
      trainingFinalists: 0,
    },
    benchmark: {
      tier0MaxMs: 7,
      tier0BudgetMs: 50,
      engineBacked: true,
      controlledSmoke: true,
      overnightComplete: false,
    },
    nonclaims: {
      cmaEsExecuted: false,
      optunaTpeExecuted: false,
      overnight200Candidate: false,
      trainedFinalist: false,
      catalogChoiceSearch: false,
      providerSandbox: false,
      buildReady: false,
      hardwareAuthority: false,
      fieldEvidence: false,
    },
    candidates,
    pareto: [candidates[0]],
  };
}

test("accepts only the exact controlled co-design disclosure boundary", () => {
  assert.deepEqual(controlledCodesignDisclosure(output()), {
    tier0MaxMs: 7,
    tier0BudgetMs: 50,
    candidateCount: 3,
    paretoCount: 1,
  });
});

test("refuses engine, tier, Pareto, and nonclaim promotion", () => {
  for (const mutate of [
    (value: ReturnType<typeof output>) => { value.optimizer.overnightComplete = true; },
    (value: ReturnType<typeof output>) => { value.candidates[0].evaluations.tier3.held = false; },
    (value: ReturnType<typeof output>) => { value.pareto = [candidate("unknown")]; },
    (value: ReturnType<typeof output>) => { value.nonclaims.trainedFinalist = true; },
  ]) {
    const value = output();
    mutate(value);
    assert.equal(controlledCodesignDisclosure(value), null);
  }
});
