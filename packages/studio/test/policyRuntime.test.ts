import assert from "node:assert/strict";
import test from "node:test";
import { fixtureJobOutput } from "../../gateway/src/platform.ts";
import type { PolicyOutput } from "../src/jobOutputs.ts";
import { BrowserPolicyController, preparePolicyArtifact } from "../src/policyRuntime.ts";

const CONTRACT_HASH = "ab".repeat(32);

function fixture(): PolicyOutput {
  return structuredClone(fixtureJobOutput("train.policy", { contractHash: CONTRACT_HASH })) as PolicyOutput;
}

function waypointFixture(): PolicyOutput {
  const output = fixture();
  const definitionHash = "cd".repeat(32);
  output.task = {
    id: "waypoint-chain",
    suite: "p7-v2",
    version: "2.0.0",
    coordinateFrame: "forge-y-up-rh-m",
    definitionHash,
    horizonS: 90,
    target: { xyzM: [-4, 2, 2] },
    targets: [
      { kind: "waypoint", xyzM: [-4, 2, 2], radiusM: 0.8 },
      { kind: "waypoint", xyzM: [3, 2.5, -3], radiusM: 0.8 },
    ],
  };
  output.scorecard!.task = "waypoint-chain";
  output.scorecard!.taskVersion = "2.0.0";
  output.scorecard!.lineage = { ...output.scorecard!.lineage, taskDefinitionHash: definitionHash };
  output.io!.onnxHeader = {
    ...output.io!.onnxHeader,
    task: "waypoint-chain",
    taskVersion: "2.0.0",
    taskDefinitionHash: definitionHash,
  };
  return output;
}

function layout(output: PolicyOutput): string[] {
  return output.io?.tensor?.input?.layout ?? [];
}

test("executes the digest-bound opset-18 model through ONNX Runtime WASM", async () => {
  const output = fixture();
  const source = {
    policySnapshot: async () => ({
      layout: layout(output),
      observations: [0, 0, 0, 0, 0, 0, 0, 1.1, 0, 1, 0],
    }),
  };
  const controller = await BrowserPolicyController.create(output, CONTRACT_HASH, source);
  assert.equal(controller.inferenceCount, 1);
  assert.ok(Math.abs(controller.input.throttle - 0.7064194083) < 1e-6);
  assert.deepEqual(
    { ...controller.input, throttle: 0 },
    { throttle: 0, roll: 0, pitch: 0, yaw: 0, drive: 0, turn: 0 },
  );
  controller.dispose();
});

test("refuses model-byte tampering before session creation", async () => {
  const output = fixture();
  const original = output.onnx?.modelBase64 ?? "";
  output.onnx!.modelBase64 = `${original.slice(0, -4)}AAAA`;
  await assert.rejects(preparePolicyArtifact(output, CONTRACT_HASH, layout(output)), /SHA-256 mismatch/);
});

test("accepts exact retained bytes when object-backed metadata omits inline ONNX", async () => {
  const output = fixture();
  const retained = Buffer.from(output.onnx?.modelBase64 ?? "", "base64");
  delete output.onnx!.modelBase64;
  const prepared = await preparePolicyArtifact(output, CONTRACT_HASH, layout(output), retained);
  assert.deepEqual(Buffer.from(prepared.modelBytes), retained);
  await assert.rejects(
    preparePolicyArtifact(output, CONTRACT_HASH, layout(output)),
    /ONNX model bytes/,
  );
});

test("refuses held or estimator-unproven scorecards", async () => {
  const held = fixture();
  held.scorecard!.exportable = false;
  await assert.rejects(preparePolicyArtifact(held, CONTRACT_HASH, layout(held)), /scorecard is held/);

  const unproven = fixture();
  unproven.scorecard!.estimatorSmoke = "failed";
  await assert.rejects(preparePolicyArtifact(unproven, CONTRACT_HASH, layout(unproven)), /estimator-source evidence/);
});

test("refuses contract-lineage and core-layout drift", async () => {
  const output = fixture();
  await assert.rejects(preparePolicyArtifact(output, "cd".repeat(32), layout(output)), /lineage/);
  await assert.rejects(
    preparePolicyArtifact(output, CONTRACT_HASH, [...layout(output)].reverse()),
    /input layout\/core observer mismatch/,
  );
});

test("refuses an unsupported policy-tensor major", async () => {
  const output = fixture();
  output.io!.tensor!.schemaVersion = "2.0.0";
  await assert.rejects(preparePolicyArtifact(output, CONTRACT_HASH, layout(output)), /missing forge-policy-tensor 1\.0\.0/);
});

test("refuses non-finite core observations without retaining an action", async () => {
  const output = fixture();
  const source = {
    policySnapshot: async () => ({
      layout: layout(output),
      observations: [Number.NaN, 0, 0, 0, 0, 0, 0, 1.1, 0, 1, 0],
    }),
  };
  await assert.rejects(BrowserPolicyController.create(output, CONTRACT_HASH, source), /non-finite/);
});

test("advances a versioned waypoint chain only from estimator target error", async () => {
  const output = waypointFixture();
  const requestedTargets: number[][] = [];
  let snapshotCount = 0;
  const source = {
    policySnapshot: async (target: readonly number[]) => {
      requestedTargets.push([...target]);
      const observations = [0, 0, 0, 0, 0, 0, snapshotCount === 0 ? 0 : 5, 0, 0, 1, 0];
      snapshotCount += 1;
      return { layout: layout(output), observations };
    },
  };

  const controller = await BrowserPolicyController.create(output, CONTRACT_HASH, source);
  assert.deepEqual(requestedTargets, [[-4, 2, 2], [3, 2.5, -3]]);
  assert.equal(controller.targetIndex, 1);
  assert.equal(controller.targetCount, 2);
  assert.equal(controller.targetsCompleted, 1);
  assert.equal(controller.taskCompleted, false);
  assert.equal(controller.inferenceCount, 1);

  snapshotCount = 0;
  controller.schedule(1, {
    policySnapshot: async (target: readonly number[]) => {
      requestedTargets.push([...target]);
      return { layout: layout(output), observations: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0] };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(controller.targetsCompleted, 2);
  assert.equal(controller.taskCompleted, true);
  assert.deepEqual(controller.input, { throttle: 0, roll: 0, pitch: 0, yaw: 0, drive: 0, turn: 0 });
  controller.dispose();
});

test("refuses drift across versioned task, scorecard, and ONNX authority", async () => {
  const wrongFrame = waypointFixture();
  wrongFrame.task!.coordinateFrame = "z-up";
  await assert.rejects(preparePolicyArtifact(wrongFrame, CONTRACT_HASH, layout(wrongFrame)), /Y-up/);

  const wrongLineage = waypointFixture();
  wrongLineage.scorecard!.lineage!.taskDefinitionHash = "ef".repeat(32);
  await assert.rejects(preparePolicyArtifact(wrongLineage, CONTRACT_HASH, layout(wrongLineage)), /task definition/);

  const wrongHeader = waypointFixture();
  wrongHeader.io!.onnxHeader!.taskVersion = "1.0.0";
  await assert.rejects(preparePolicyArtifact(wrongHeader, CONTRACT_HASH, layout(wrongHeader)), /ONNX header/);
});
