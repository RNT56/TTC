import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { downloadPolicyModel } from "../src/gateway.ts";

test("policy download verifies same-origin response length and SHA-256", async () => {
  const previousFetch = globalThis.fetch;
  const bytes = new TextEncoder().encode("retained-policy-model");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let request: RequestInfo | URL | undefined;
  globalThis.fetch = async (input) => {
    request = input;
    return new Response(bytes, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "x-forge-policy-sha256": sha256,
      },
    });
  };
  try {
    const downloaded = await downloadPolicyModel("policy/id", {
      byteSize: bytes.byteLength,
      sha256,
    });
    assert.deepEqual(downloaded, bytes);
    assert.equal(request, "/v1/policies/policy%2Fid/model");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("policy download refuses retained-metadata substitution before playback", async () => {
  const previousFetch = globalThis.fetch;
  const bytes = new TextEncoder().encode("retained-policy-model");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  globalThis.fetch = async () => new Response(bytes, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "x-forge-policy-sha256": sha256,
    },
  });
  try {
    await assert.rejects(
      downloadPolicyModel("policy-1", { sha256: "0".repeat(64) }),
      /checksum differs from retained metadata/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
