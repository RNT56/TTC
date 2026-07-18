import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  validateManifest,
  validatePolicy,
  validatePromotion,
} from "./deployment-policy.mjs";

const policy = JSON.parse(readFileSync("infra/deployment/deployment-policy.v1.json", "utf8"));
const H40 = "a".repeat(40);
const H64 = "b".repeat(64);

function digest(label) {
  return createHash("sha256").update(label).digest("hex");
}

function artifact(component) {
  const sha256 = digest(`artifact:${component}`);
  return {
    component,
    uri: `registry.example.test/forge/${component}@sha256:${sha256}`,
    sha256,
    sbomSha256: digest(`sbom:${component}`),
    provenanceSha256: digest(`provenance:${component}`),
  };
}

function manifest(environment, sourceEnvironment = "protected-main", sourceManifestSha256 = null) {
  const environmentPolicy = policy.environments[environment];
  const values = {
    AUTH_URL: `https://${environment}.forge.example.test`,
    FORGE_CATALOG_DIR: "/srv/forge/catalog",
    FORGE_DEPLOYMENT_ENVIRONMENT: environment,
    FORGE_GPU_BACKEND: "modal",
    FORGE_OBJECT_BUCKET: `forge-${environment}`,
    FORGE_OBJECT_ENDPOINT: `https://objects.${environment}.forge.example.test`,
    FORGE_SOURCE_REVISION: H40,
    FORGE_VALIDATE_BIN: "/srv/forge/bin/forge-validate",
    NODE_ENV: "production",
  };
  const secretRefs = Object.fromEntries(
    policy.configuration.baseRequiredSecrets.map((name) => [
      name,
      `secret://forgedttc/${environment}/${name.toLowerCase()}@v1`,
    ]),
  );
  const ownership = Object.fromEntries(
    environmentPolicy.requiredOwnershipRoles.map((role) => [role, `rotation:${environment}-${role}`]),
  );
  const evidence = environmentPolicy.requiredGates.map((gate) => ({
    gate,
    uri: `evidence://forgedttc/${environment}/${gate}`,
    sha256: digest(`evidence:${environment}:${gate}`),
  }));
  const signoffs = environmentPolicy.requiredOwnershipRoles.map((role) => ({
    role,
    owner: ownership[role],
    signedAt: "2026-07-18T12:00:00.000Z",
    evidenceSha256: digest(`signoff:${environment}:${role}`),
  }));
  return {
    $schema: "../../schema/forge-deployment-manifest.schema.json",
    schemaVersion: "forge-deployment-manifest/1.0.0",
    deploymentId: `forge-${environment}-001`,
    environment,
    status: "active",
    source: {
      repository: "RNT56/TTC",
      revision: H40,
      treeHash: "c".repeat(40),
      protectedMain: true,
      worktreeClean: true,
      builtAt: "2026-07-18T11:00:00.000Z",
    },
    artifacts: environmentPolicy.requiredComponents.map(artifact),
    configuration: {
      enabledCapabilities: [],
      values,
      secretRefs,
    },
    ownership,
    evidence,
    promotion: {
      sourceEnvironment,
      sourceManifestSha256,
      sourceEvidenceSha256: H64,
      rollbackPlanSha256: digest(`rollback:${environment}`),
      databasePlanSha256: digest(`database:${environment}`),
      promotedAt: "2026-07-18T12:00:00.000Z",
      signoffs,
    },
    authority: {
      publicTraffic: false,
      realUserData: false,
      providerCredentials: true,
      hardware: false,
      externalBeta: false,
      live: false,
      field: false,
    },
  };
}

function messages(value) {
  return validateManifest(value, policy).join("\n");
}

test("deployment policy has a coherent, disjoint configuration registry", () => {
  assert.deepEqual(validatePolicy(policy), []);
});

test("an active sandbox manifest proves every required binding", () => {
  assert.deepEqual(validateManifest(manifest("sandbox"), policy), []);
});

test("literal secrets cannot be disguised as non-secret values", () => {
  const candidate = manifest("sandbox");
  candidate.configuration.values.AUTH_SECRET = "literal-secret";
  assert.match(messages(candidate), /secret variable AUTH_SECRET must use secretRefs/);
});

test("secret authority must be versioned and environment-specific", () => {
  const candidate = manifest("sandbox");
  candidate.configuration.secretRefs.AUTH_SECRET = "secret://forgedttc/production/auth_secret";
  const errors = messages(candidate);
  assert.match(errors, /must be versioned secret:\/\/ authority/);
  assert.match(errors, /must be environment-specific/);
});

test("active manifests fail closed on missing gates and accountable owners", () => {
  const candidate = manifest("sandbox");
  candidate.evidence = candidate.evidence.filter(({ gate }) => gate !== "security");
  candidate.ownership.securityOwner = "TBD";
  const errors = messages(candidate);
  assert.match(errors, /requires evidence gate security/);
  assert.match(errors, /requires a named securityOwner/);
});

test("managed artifacts are immutable and capabilities require their exact configuration", () => {
  const candidate = manifest("sandbox");
  candidate.artifacts[0].uri = "registry.example.test/forge/studio-static:mutable";
  candidate.configuration.enabledCapabilities.push("github-oauth");
  const errors = messages(candidate);
  assert.match(errors, /uri must bind the exact artifact SHA-256/);
  assert.match(errors, /capability github-oauth requires secret reference GITHUB_CLIENT_ID/);
  assert.match(errors, /capability github-oauth requires secret reference GITHUB_CLIENT_SECRET/);
});

test("production rejects development authority and fixture compute", () => {
  const candidate = manifest("production", "staging", H64);
  candidate.configuration.values.FORGE_DEV_AUTH = "1";
  candidate.configuration.values.FORGE_GPU_BACKEND = "fixture";
  const errors = messages(candidate);
  assert.match(errors, /FORGE_DEV_AUTH is local-only/);
  assert.match(errors, /FORGE_DEV_AUTH is forbidden in production/);
  assert.match(errors, /production cannot use the fixture GPU backend/);
});

test("environment ceilings and status prevent authority inflation", () => {
  const candidate = manifest("sandbox");
  candidate.authority.publicTraffic = true;
  candidate.authority.field = true;
  const errors = messages(candidate);
  assert.match(errors, /sandbox cannot claim publicTraffic authority/);
  assert.match(errors, /deployment manifests never confer field-proven authority/);
});

test("managed deployments require clean protected source", () => {
  const candidate = manifest("sandbox");
  candidate.source.protectedMain = false;
  candidate.source.worktreeClean = false;
  const errors = messages(candidate);
  assert.match(errors, /require protected-main source/);
  assert.match(errors, /require a clean source worktree/);
});

test("promotion preserves exact source and artifact identity while rotating secret refs", () => {
  const source = manifest("sandbox");
  const sourceDigest = digest("serialized-source-manifest");
  const target = manifest("staging", "sandbox", sourceDigest);
  assert.deepEqual(validatePromotion(source, target, policy, { sourceDigest }), []);
});

test("promotion rejects skipped stages, rebuilds, and secret-reference reuse", () => {
  const source = manifest("sandbox");
  const sourceDigest = digest("serialized-source-manifest");
  const target = manifest("production", "sandbox", sourceDigest);
  target.artifacts[0].sha256 = digest("rebuilt");
  target.configuration.secretRefs.AUTH_SECRET = source.configuration.secretRefs.AUTH_SECRET;
  const errors = validatePromotion(source, target, policy, { sourceDigest }).join("\n");
  assert.match(errors, /sandbox->production is not an allowed/);
  assert.match(errors, /rebuilt or substituted/);
  assert.match(errors, /must not reuse AUTH_SECRET secret reference/);
});
