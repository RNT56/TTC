import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { fixtureJobOutput } from "../src/platform.js";
import { HOVER_POLICY_FIXTURE_V1 } from "../src/policyFixture.js";

test("P7 fixture bytes, digest, tensor layout, and scorecard authority are exact", () => {
  const bytes = Buffer.from(HOVER_POLICY_FIXTURE_V1.modelBase64, "base64");
  assert.equal(bytes.byteLength, HOVER_POLICY_FIXTURE_V1.byteSize);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), HOVER_POLICY_FIXTURE_V1.sha256);
  assert.deepEqual(HOVER_POLICY_FIXTURE_V1.input.shape, [1, HOVER_POLICY_FIXTURE_V1.input.layout.length]);
  assert.deepEqual(HOVER_POLICY_FIXTURE_V1.output.shape, [1, HOVER_POLICY_FIXTURE_V1.output.layout.length]);
  assert.equal(new Set(HOVER_POLICY_FIXTURE_V1.input.layout).size, HOVER_POLICY_FIXTURE_V1.input.layout.length);

  const contractHash = "ab".repeat(32);
  const output = fixtureJobOutput("train.policy", { contractHash }) as {
    io: { onnxHeader: Record<string, string>; tensor: { schemaVersion: string } };
    onnx: { byteSize: number; sha256: string; modelBase64: string };
    scorecard: {
      exportable: boolean;
      trainedOnEstimator: boolean;
      estimatorSmoke: string;
      lineage: { contractHash: string };
    };
  };
  assert.equal(output.io.onnxHeader.contractHash, contractHash);
  assert.equal(output.io.tensor.schemaVersion, HOVER_POLICY_FIXTURE_V1.schemaVersion);
  assert.equal(output.onnx.byteSize, HOVER_POLICY_FIXTURE_V1.byteSize);
  assert.equal(output.onnx.sha256, HOVER_POLICY_FIXTURE_V1.sha256);
  assert.equal(output.onnx.modelBase64, HOVER_POLICY_FIXTURE_V1.modelBase64);
  assert.equal(output.scorecard.exportable, true);
  assert.equal(output.scorecard.trainedOnEstimator, true);
  assert.equal(output.scorecard.estimatorSmoke, "passed");
  assert.equal(output.scorecard.lineage.contractHash, contractHash);
});
