import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  validateArtifactEnvironment,
  validateHardenedCompose,
  validateHardenedRuntime,
} from "./hardened-runtime.mjs";

const contract = JSON.parse(readFileSync("infra/deployment/hardened-runtime.v1.json", "utf8"));
const compose = JSON.parse(readFileSync("infra/compose.hardened.json", "utf8"));
const H40 = "a".repeat(40);
const H64 = "b".repeat(64);

function copy(value) {
  return structuredClone(value);
}

test("D69 hardened runtime and Compose contracts are exact", () => {
  assert.deepEqual(validateHardenedRuntime(contract), []);
  assert.deepEqual(validateHardenedCompose(compose, contract), []);
});

test("base and stateful service images reject mutable tags", () => {
  const mutableContract = copy(contract);
  mutableContract.baseImages[0].reference = "node:22";
  assert.match(validateHardenedRuntime(mutableContract).join("\n"), /exact tag and manifest digest/);

  const mutableCompose = copy(compose);
  mutableCompose.services.postgres.image = "pgvector/pgvector:pg16";
  assert.match(validateHardenedCompose(mutableCompose, contract).join("\n"), /reviewed pinned image/);
});

test("long-lived services require least privilege and finite resources", () => {
  const candidate = copy(compose);
  candidate.services.workers.user = "0:0";
  candidate.services.workers.read_only = false;
  candidate.services.workers.cap_drop = [];
  delete candidate.services.workers.mem_limit;
  const errors = validateHardenedCompose(candidate, contract).join("\n");
  assert.match(errors, /workers must run as the declared non-root identity/);
  assert.match(errors, /workers must use a read-only root/);
  assert.match(errors, /workers must drop all capabilities/);
  assert.match(errors, /workers must set a memory limit/);
});

test("application probe, secret, and writable-path semantics are major-version exact", () => {
  const runtime = copy(contract);
  runtime.applicationArtifacts[1].readiness = "python -c pass";
  assert.match(validateHardenedRuntime(runtime).join("\n"), /readiness must match/);

  const candidate = copy(compose);
  candidate.services.gateway.secrets[0].mode = "0444";
  candidate.services.workers.environment.FORGE_OBJECT_ENDPOINT = "http://minio:9000";
  const errors = validateHardenedCompose(candidate, contract).join("\n");
  assert.match(errors, /gateway secret AUTH_SECRET must be read-only/);
  assert.match(errors, /workers object storage must use private TLS/);
});

test("private services cannot publish ports or enter the edge network", () => {
  const candidate = copy(compose);
  candidate.services.postgres.ports = ["5432:5432"];
  candidate.services.workers.networks = ["edge", "app"];
  const errors = validateHardenedCompose(candidate, contract).join("\n");
  assert.match(errors, /postgres cannot publish a host port/);
  assert.match(errors, /workers must stay off the edge network/);
});

test("deployment-supplied images bind exactly to declared artifact digests", () => {
  const env = {
    FORGE_GATEWAY_IMAGE: `registry.example.test/forge/gateway@sha256:${H64}`,
    FORGE_GATEWAY_ARTIFACT_SHA256: H64,
    FORGE_WORKERS_IMAGE: `registry.example.test/forge/workers@sha256:${H64}`,
    FORGE_WORKERS_ARTIFACT_SHA256: H64,
    FORGE_STUDIO_IMAGE: `registry.example.test/forge/studio@sha256:${H64}`,
    FORGE_STUDIO_ARTIFACT_SHA256: H64,
    FORGE_SOURCE_REVISION: H40,
    FORGE_DEPLOYMENT_MANIFEST_SHA256: H64,
  };
  assert.deepEqual(validateArtifactEnvironment(env), []);
  env.FORGE_WORKERS_ARTIFACT_SHA256 = "c".repeat(64);
  assert.match(validateArtifactEnvironment(env).join("\n"), /workers image and declared artifact digest must match/);
});

test("contract evidence cannot self-promote sandbox, rollback, or live maturity", () => {
  const candidate = copy(contract);
  candidate.currentClaim.sandboxInstalled = true;
  candidate.currentClaim.rollbackProven = true;
  candidate.currentClaim.live = true;
  const errors = validateHardenedRuntime(candidate).join("\n");
  assert.match(errors, /sandboxInstalled must remain false/);
  assert.match(errors, /rollbackProven must remain false/);
  assert.match(errors, /live must remain false/);
});
