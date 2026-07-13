import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { evaluatePolicy, parseRecord, pathMatches } from "./golden-artifact-policy.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "forge-golden-policy-"));
  mkdirSync(join(root, "goldens"), { recursive: true });
  mkdirSync(join(root, "prototype"), { recursive: true });
  mkdirSync(join(root, "docs", "golden-updates"), { recursive: true });
  writeFileSync(join(root, "goldens", "physics.json"), "{}\n");
  writeFileSync(join(root, "prototype", "frozen.html"), "frozen\n");
  writeFileSync(join(root, "prototype", "cad-object-studio.html"), "frozen\n");
  writeFileSync(join(root, "docs", "golden-artifact-registry.json"), "{}\n");
  const registry = {
    schemaVersion: "golden-artifact-registry.v1",
    recordDirectory: "docs/golden-updates",
    immutablePaths: ["prototype/cad-object-studio.html", "prototype/frozen.html"],
    artifacts: [
      {
        id: "golden-policy-registry",
        classification: "fixture",
        paths: ["docs/golden-artifact-registry.json"],
        owner: "quality workstream",
        sourceOfTruth: "reviewed repository inventory",
        regenerate: "edit with a review record",
        verify: ["run the policy"],
        compatibilityReview: false,
      },
      {
        id: "physics-baseline",
        classification: "physics",
        paths: ["goldens/**"],
        owner: "forge-sim",
        sourceOfTruth: "deterministic simulator output",
        regenerate: "run the fixture writer",
        verify: ["run the parity test"],
        compatibilityReview: false,
      },
    ],
  };
  return { root, registry };
}

function recordContent(path = "goldens/physics.json", id = "physics-baseline") {
  return `# Golden artifact update: reviewed physics baseline\n\n## Artifact IDs\n\n- \`${id}\`\n\n## Changed paths\n\n- \`${path}\`\n\n## Drift classification\n\n- \`physics\`\n\n## Why this is intentional\n\nThe reviewed source model changed its documented physical behavior.\n\n## Source-of-truth change\n\nThe deterministic simulator equation and its focused regression changed together.\n\n## Compatibility and user impact\n\nExisting documents keep their meaning; only the corrected predicted trajectory changes.\n\n## Evidence before\n\nThe focused regression demonstrated the old incorrect trajectory at the exact parent SHA.\n\n## Evidence after\n\nThe parity, workspace, and native-WASM checks pass with the reviewed new baseline.\n\n## Reviewer focus\n\nInspect the equation, units, tolerance, and semantic baseline delta independently.\n\n## Decision and task references\n\nQA-008 governs this record; no new product authority or compatibility decision is created.\n`;
}

test("exact and recursive registry patterns are deterministic", () => {
  assert.equal(pathMatches("a.json", "a.json"), true);
  assert.equal(pathMatches("dir/**", "dir/a.json"), true);
  assert.equal(pathMatches("dir/**", "dir"), false);
  assert.equal(pathMatches("dir/**", "other/a.json"), false);
});

test("a protected change requires a new review record", () => {
  const { root, registry } = fixture();
  const result = evaluatePolicy({ registry, root, changedPaths: ["goldens/physics.json"], addedRecords: [] });
  assert.match(result.errors.join("\n"), /without a new record/);
  assert.match(result.errors.join("\n"), /no new golden update record cites/);
});

test("one valid append-only record covers one protected change", () => {
  const { root, registry } = fixture();
  const result = evaluatePolicy({
    registry,
    root,
    changedPaths: ["goldens/physics.json", "docs/golden-updates/2026-07-13-physics-baseline.md"],
    addedRecords: [
      {
        path: "docs/golden-updates/2026-07-13-physics-baseline.md",
        content: recordContent(),
      },
    ],
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.protectedChanges.length, 1);
  assert.equal(result.parsedRecords.length, 1);
});

test("immutable oracle changes fail even with a record", () => {
  const { root, registry } = fixture();
  const result = evaluatePolicy({ registry, root, changedPaths: ["prototype/frozen.html"], addedRecords: [] });
  assert.match(result.errors.join("\n"), /immutable oracle input may not change/);
});

test("review records are append-only and cannot pre-authorize future drift", () => {
  const { root, registry } = fixture();
  const result = evaluatePolicy({
    registry,
    root,
    changedPaths: ["docs/golden-updates/2026-07-13-old.md"],
    addedRecords: [],
  });
  assert.match(result.errors.join("\n"), /records are append-only/);
});

test("records reject placeholders and unrelated cited paths", () => {
  const parsed = parseRecord(
    "docs/golden-updates/2026-07-13-invalid.md",
    recordContent("goldens/not-changed.json").replace("reviewed source model", "TBD source model"),
  );
  assert.match(parsed.errors.join("\n"), /placeholder/);

  const { root, registry } = fixture();
  const result = evaluatePolicy({
    registry,
    root,
    changedPaths: ["goldens/physics.json", "docs/golden-updates/2026-07-13-invalid.md"],
    addedRecords: [
      {
        path: "docs/golden-updates/2026-07-13-invalid.md",
        content: recordContent("goldens/not-changed.json"),
      },
    ],
  });
  assert.match(result.errors.join("\n"), /is not a protected change in this patch/);
});

test("the baseline registry still protects a family removed by the changed registry", () => {
  const { root, registry } = fixture();
  const current = { ...registry, artifacts: registry.artifacts.filter((artifact) => artifact.id !== "physics-baseline") };
  const result = evaluatePolicy({
    registry: current,
    baselineRegistry: registry,
    root,
    changedPaths: ["goldens/physics.json"],
    addedRecords: [],
  });
  assert.equal(result.protectedChanges[0].artifact.id, "physics-baseline");
  assert.match(result.errors.join("\n"), /without a new record/);
});

test("a record classification must match the registered artifact", () => {
  const { root, registry } = fixture();
  const result = evaluatePolicy({
    registry,
    root,
    changedPaths: ["goldens/physics.json", "docs/golden-updates/2026-07-13-wrong-class.md"],
    addedRecords: [
      {
        path: "docs/golden-updates/2026-07-13-wrong-class.md",
        content: recordContent().replace("- `physics`", "- `schema`"),
      },
    ],
  });
  assert.match(result.errors.join("\n"), /requires classification 'physics'/);
});

test("the review-record directory is fixed so prior evidence cannot be hidden", () => {
  const { root, registry } = fixture();
  const result = evaluatePolicy({
    registry: { ...registry, recordDirectory: "docs/replacement-records" },
    root,
    changedPaths: [],
    addedRecords: [],
  });
  assert.match(result.errors.join("\n"), /recordDirectory must remain 'docs\/golden-updates'/);
});

test("registry ownership cannot overlap across artifact families", () => {
  const { root, registry } = fixture();
  const overlapping = {
    ...registry,
    artifacts: [
      ...registry.artifacts,
      {
        id: "nested-physics-baseline",
        classification: "physics",
        paths: ["goldens/physics.json"],
        owner: "forge-sim",
        sourceOfTruth: "a conflicting source",
        regenerate: "run a conflicting generator",
        verify: ["run a conflicting check"],
        compatibilityReview: false,
      },
    ],
  };
  const result = evaluatePolicy({ registry: overlapping, root, changedPaths: [], addedRecords: [] });
  assert.match(result.errors.join("\n"), /registry ownership overlaps/);
});
