import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  REQUIRED_MILESTONES,
  createManifest,
  milestoneById,
  readRegistry,
  renderRunbook,
  validateManifest,
  validateRegistry,
} from "./external-acceptance-policy.mjs";

const root = process.cwd();
const registry = readRegistry(root);

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function artifact(id, kind = id) {
  const sha256 = digest(id);
  return {
    id,
    kind,
    ref: `urn:sha256:${sha256}`,
    sha256,
    retentionClass: "lifecycle-audit",
    visibility: "private",
    containsPersonalData: false,
  };
}

function completedManifest(milestoneId, status = "passed") {
  const milestone = milestoneById(registry, milestoneId);
  const manifest = createManifest(registry, milestoneId, {
    runId: `${milestoneId}-acceptance-valid`,
    createdAt: "2026-07-13T10:00:00.000Z",
  });
  manifest.status = status;
  manifest.startedAt = "2026-07-13T10:01:00.000Z";
  manifest.completedAt = "2026-07-13T11:00:00.000Z";
  manifest.source = {
    commitSha: "a".repeat(40),
    productVersion: "acceptance-test-v1",
    environment: milestone.allowedEnvironments[0],
    deploymentId: `${milestoneId}-deployment-a1`,
  };
  manifest.participants = milestone.requiredRoles.map((role, index) => ({
    role,
    pseudonymousId: `${role}-p${index + 1}`,
    independent: milestone.independentRoles.includes(role),
    independenceStatement: milestone.independentRoles.includes(role)
      ? "No employment, authorship, repository access, or private owner access."
      : null,
  }));
  manifest.authorityRefs = Object.fromEntries(
    milestone.requiredAuthorityRefs.map((name) => [name, { ref: `urn:sha256:${digest(name)}`, sha256: digest(name) }]),
  );

  const byKind = new Map();
  for (const step of milestone.steps) {
    for (const kind of step.requiredEvidenceKinds) {
      if (!byKind.has(kind)) byKind.set(kind, artifact(`${kind}-${byKind.size + 1}`, kind));
    }
  }
  for (const role of milestone.requiredSignoffs) {
    byKind.set(`signoff-${role}`, artifact(`signoff-${role}`, "signed-attestation"));
  }
  manifest.artifacts = [...byKind.values()];
  manifest.steps = milestone.steps.map((step, index) => ({
    id: step.id,
    status: status === "passed" || index > 0 ? "passed" : status === "stopped" ? "stopped" : "failed",
    evidenceRefs: step.requiredEvidenceKinds.map((kind) => byKind.get(kind).id),
    notes: `Observed result for ${step.id} is preserved in the cited evidence.`,
  }));
  manifest.measurements = Object.fromEntries(milestone.requiredMeasurements.map((name, index) => [name, index + 1]));
  manifest.findings = [];
  manifest.findingsReview = {
    usabilityReviewed: true,
    correctnessReviewed: true,
    summary: "Usability and correctness were explicitly reviewed; this fixture records no observed findings.",
  };
  manifest.incidents = status === "passed"
    ? []
    : [{ id: "bounded-stop", summary: "The first step stopped under its declared boundary.", disposition: "preserved for follow-up", evidenceRefs: manifest.steps[0].evidenceRefs }];
  manifest.signoffs = milestone.requiredSignoffs.map((role) => ({
    role,
    pseudonymousId: manifest.participants.find((entry) => entry.role === role).pseudonymousId,
    attestation: `I reviewed the ${milestoneId} evidence and its stated limitations.`,
    signedAt: "2026-07-13T11:00:00.000Z",
    signatureRef: byKind.get(`signoff-${role}`).id,
  }));
  manifest.outcome = {
    criteriaMet: status === "passed",
    summary: status === "passed"
      ? `The ${milestoneId} fixture meets every registered criterion without changing its maturity boundary.`
      : `The ${milestoneId} fixture preserves a ${status} outcome and does not close its milestone.`,
    limitations: ["This is policy-test data, not external acceptance evidence."],
    followUpTaskIds: status === "passed" ? [] : [milestone.taskIds.find((taskId) => taskId.startsWith("EXT-"))],
  };
  return manifest;
}

test("registry defines exactly the eight QA-010 milestones", () => {
  assert.deepEqual(validateRegistry(registry), []);
  assert.deepEqual(registry.milestones.map((milestone) => milestone.id), REQUIRED_MILESTONES);
});

test("every generated scaffold is structurally valid but cannot pass as evidence", () => {
  for (const milestone of registry.milestones) {
    const manifest = createManifest(registry, milestone.id, {
      runId: `${milestone.id}-template-test`,
      createdAt: "2026-07-13T00:00:00.000Z",
    });
    assert.deepEqual(validateManifest(manifest, registry, { requireComplete: false }), []);
    assert.match(renderRunbook(registry, milestone.id, manifest), new RegExp(milestone.steps[0].id));
    assert.match(validateManifest(manifest, registry, { requireComplete: true }).join("\n"), /status 'incomplete'/);
  }
});

test("complete passed evidence validates for every milestone", () => {
  for (const milestoneId of REQUIRED_MILESTONES) {
    assert.deepEqual(validateManifest(completedManifest(milestoneId), registry), [], milestoneId);
  }
});

test("a passed step cannot omit any registered evidence kind", () => {
  const manifest = completedManifest("builder");
  manifest.steps[0].evidenceRefs.pop();
  assert.match(validateManifest(manifest, registry).join("\n"), /missing evidence kind/);
});

test("independent builder cannot share the facilitator identity", () => {
  const manifest = completedManifest("builder");
  manifest.participants[0].pseudonymousId = manifest.participants[1].pseudonymousId;
  manifest.signoffs[0].pseudonymousId = manifest.participants[0].pseudonymousId;
  assert.match(validateManifest(manifest, registry).join("\n"), /cannot fill an owner\/facilitator role/);
});

test("lab evidence is controlled-lab only and preserves stop outcomes", () => {
  const invalid = completedManifest("lab");
  invalid.source.environment = "live";
  assert.match(validateManifest(invalid, registry).join("\n"), /not allowed/);

  const stopped = completedManifest("lab", "stopped");
  assert.deepEqual(validateManifest(stopped, registry), []);
});

test("evidence rejects credential-shaped values and public personal data", () => {
  const secret = completedManifest("photoscan");
  secret.outcome.summary = "Provider returned Bearer abcdefghijklmnopqrstuvwxyz and the run otherwise passed.";
  assert.match(validateManifest(secret, registry).join("\n"), /possible credential material/);

  const personal = completedManifest("maintenance");
  personal.artifacts[0] = {
    ...personal.artifacts[0],
    visibility: "public",
    containsPersonalData: true,
    subjectDigest: digest("owner"),
    deleteAfter: "2026-08-12T11:00:00.000Z",
  };
  assert.match(validateManifest(personal, registry).join("\n"), /cannot be public/);

  personal.artifacts[0].visibility = "private";
  personal.artifacts[0].deleteAfter = "2026-07-13T10:30:00.000Z";
  assert.match(validateManifest(personal, registry).join("\n"), /must follow the evidence lifecycle start/);
});

test("manifest shapes reject undeclared raw or identity-bearing fields", () => {
  const manifest = completedManifest("course");
  manifest.participants[0].realName = "Not allowed";
  manifest.artifacts[0].rawContent = "Not allowed";
  const errors = validateManifest(manifest, registry).join("\n");
  assert.match(errors, /participants\[0\]\.realName is not allowed/);
  assert.match(errors, /artifacts\[0\]\.rawContent is not allowed/);

  const oversized = completedManifest("builder");
  oversized.outcome.summary = "x".repeat(4_097);
  assert.match(validateManifest(oversized, registry).join("\n"), /string exceeds the 4,096-character evidence boundary/);
});

test("CLI initializes outside the repository and refuses repository-local evidence", () => {
  const out = mkdtempSync(join(tmpdir(), "forge-external-acceptance-"));
  const initialized = join(out, "builder-run");
  const result = spawnSync("node", ["scripts/external-acceptance.mjs", "init", "builder", "--out", initialized, "--run-id", "builder-cli-test"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(initialized, "acceptance.json")), true);
  assert.match(readFileSync(join(initialized, "RUNBOOK.md"), "utf8"), /Do not commit this run directory/);

  writeFileSync(join(initialized, "acceptance.json"), `${JSON.stringify(completedManifest("builder"), null, 2)}\n`);
  const validated = spawnSync("node", ["scripts/external-acceptance.mjs", "validate", initialized], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(validated.status, 0, validated.stderr);
  assert.match(validated.stdout, /passed evidence is structurally complete for builder/);

  const refused = spawnSync("node", ["scripts/external-acceptance.mjs", "init", "builder", "--out", join(root, "artifacts", "acceptance-test")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /refusing repository-local run output/);
});
