import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertDeploymentBootstrap } from "../src/deployment.js";

const revision = "a".repeat(40);

function fixture(environment = "staging") {
  const directory = mkdtempSync(join(tmpdir(), "forge-gateway-deployment-"));
  const path = join(directory, "manifest.json");
  const manifest = {
    schemaVersion: "forge-deployment-manifest/1.0.0",
    environment,
    status: "active",
    source: {
      revision,
      protectedMain: true,
      worktreeClean: true,
    },
    artifacts: [{ component: "gateway" }],
    configuration: {
      values: {
        FORGE_DEPLOYMENT_ENVIRONMENT: environment,
        FORGE_SOURCE_REVISION: revision,
        NODE_ENV: "production",
      },
    },
  };
  const bytes = Buffer.from(JSON.stringify(manifest));
  writeFileSync(path, bytes);
  return {
    directory,
    path,
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
}

function managedEnv(path: string, digest: string) {
  return {
    NODE_ENV: "production",
    FORGE_DEPLOYMENT_ENVIRONMENT: "staging",
    FORGE_DEPLOYMENT_MANIFEST: path,
    FORGE_DEPLOYMENT_MANIFEST_SHA256: digest,
    FORGE_SOURCE_REVISION: revision,
  };
}

test("local gateway startup needs no managed deployment authority", () => {
  assert.doesNotThrow(() => assertDeploymentBootstrap({ NODE_ENV: "development" }));
  assert.throws(
    () => assertDeploymentBootstrap({ NODE_ENV: "development", FORGE_DEPLOYMENT_ENVIRONMENT: "staging" }),
    /requires NODE_ENV=production/,
  );
});

test("production gateway requires an exact active manifest binding", () => {
  const value = fixture();
  try {
    assert.doesNotThrow(() => assertDeploymentBootstrap(managedEnv(value.path, value.digest)));
    assert.throws(
      () => assertDeploymentBootstrap(managedEnv(value.path, "b".repeat(64))),
      /digest mismatch/,
    );
    assert.throws(
      () => assertDeploymentBootstrap({ ...managedEnv(value.path, value.digest), FORGE_SOURCE_REVISION: "c".repeat(40) }),
      /does not authorize/,
    );
    const bytes = Buffer.from(JSON.stringify({
      schemaVersion: "forge-deployment-manifest/1.0.0",
      environment: "staging",
      status: "active",
      source: { revision, protectedMain: true, worktreeClean: true },
      artifacts: [{ component: "workers" }],
      configuration: {
        values: {
          FORGE_DEPLOYMENT_ENVIRONMENT: "staging",
          FORGE_SOURCE_REVISION: revision,
          NODE_ENV: "production",
        },
      },
    }));
    writeFileSync(value.path, bytes);
    assert.throws(
      () => assertDeploymentBootstrap(managedEnv(value.path, createHash("sha256").update(bytes).digest("hex"))),
      /does not authorize/,
    );
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});

test("production gateway rejects missing authority and the legacy environment alias", () => {
  assert.throws(() => assertDeploymentBootstrap({ NODE_ENV: "production" }), /requires sandbox, staging, or production/);
  const value = fixture();
  try {
    assert.throws(
      () => assertDeploymentBootstrap({ ...managedEnv(value.path, value.digest), FORGE_ENV: "production" }),
      /rejects legacy FORGE_ENV/,
    );
  } finally {
    rmSync(value.directory, { recursive: true, force: true });
  }
});
