import assert from "node:assert/strict";
import test from "node:test";
import {
  PARITY_EVIDENCE_SCHEMA,
  PARITY_ISOLATION_HEADERS,
  assessParityCapture,
  assessParityPreflight,
  assessParitySourceEvidence,
} from "./parity-gallery-policy.mjs";

const REVISION = "0123456789abcdef0123456789abcdef01234567";

const ready = () => ({
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  support: { tier: "full-studio", surface: "chromium" },
  hookAvailable: true,
  loaded: true,
  quality: { tier: "high", renderer: "webgl", advancedEffectsInitialized: true },
  pageErrors: [],
  waitError: null,
});

test("parity server owns the same isolation contract as full Studio", () => {
  assert.deepEqual(PARITY_ISOLATION_HEADERS, {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  });
});

test("source evidence binds one clean checkout to the versioned artifact", () => {
  assert.deepEqual(
    assessParitySourceEvidence(
      {
        schema: PARITY_EVIDENCE_SCHEMA,
        sourceRevision: REVISION,
        checkoutRevision: REVISION,
        worktreeDirty: false,
      },
      { requireClean: true },
    ),
    { ready: true, failures: [] },
  );
});

test("authoritative evidence rejects revision drift and a dirty checkout", () => {
  const result = assessParitySourceEvidence(
    {
      schema: PARITY_EVIDENCE_SCHEMA,
      sourceRevision: REVISION,
      checkoutRevision: "fedcba9876543210fedcba9876543210fedcba98",
      worktreeDirty: true,
    },
    { requireClean: true },
  );
  assert.equal(result.ready, false);
  assert.match(result.failures.join(" "), /does not match checkout/);
  assert.match(result.failures.join(" "), /clean worktree/);
});

test("source evidence rejects malformed or incomplete identity fields", () => {
  const result = assessParitySourceEvidence({
    schema: "forge-parity-gallery.future",
    sourceRevision: "main",
    checkoutRevision: null,
    worktreeDirty: "no",
  });
  assert.equal(result.ready, false);
  assert.equal(result.failures.length, 4);
});

test("full-Studio Chromium with initialized WebGL passes preflight", () => {
  assert.deepEqual(assessParityPreflight(ready()), {
    ready: true,
    category: "ready",
    retryable: false,
    failures: [],
  });
});

test("missing isolation is a non-retryable server configuration failure", () => {
  const diagnostics = ready();
  diagnostics.crossOriginIsolated = false;
  diagnostics.sharedArrayBuffer = false;
  diagnostics.support = { tier: "viewer-grade", surface: "non-chromium" };
  const result = assessParityPreflight(diagnostics);
  assert.equal(result.ready, false);
  assert.equal(result.category, "configuration");
  assert.equal(result.retryable, false);
  assert.match(result.failures.join(" "), /cross-origin isolated/);
  assert.match(result.failures.join(" "), /full-studio/);
});

test("isolated Chromium may retry one renderer initialization failure", () => {
  const diagnostics = ready();
  diagnostics.hookAvailable = false;
  diagnostics.loaded = false;
  diagnostics.quality = null;
  diagnostics.pageErrors = ["Error creating WebGL context"];
  const result = assessParityPreflight(diagnostics);
  assert.equal(result.ready, false);
  assert.equal(result.category, "renderer-initialization");
  assert.equal(result.retryable, true);
  assert.match(result.failures.join(" "), /WebGL context/);
});

test("viewer-grade capture can never satisfy the parity renderer contract", () => {
  const result = assessParityCapture({
    tier: "low",
    renderer: "schematic-2d",
    advancedEffectsInitialized: false,
  });
  assert.equal(result.ready, false);
  assert.match(result.failures.join(" "), /expected \"webgl\"/);
});

test("deterministic low-tier WebGL capture remains accepted", () => {
  assert.deepEqual(
    assessParityCapture({ tier: "low", renderer: "webgl", advancedEffectsInitialized: true }),
    { ready: true, failures: [] },
  );
});
