import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  checkRepository,
  createPublicationEvidence,
  validatePublicationEvidence,
  validatePublicationEvidenceFiles,
  validateRegistryPolicy,
} from "./hardened-runtime-registry.mjs";

const policy = JSON.parse(readFileSync("infra/deployment/hardened-registry.v1.json", "utf8"));
const SOURCE = "a".repeat(40);
const TREE = "b".repeat(40);
const CONFIG = {
  gateway: `sha256:${"1".repeat(64)}`,
  workers: `sha256:${"2".repeat(64)}`,
  studio: `sha256:${"3".repeat(64)}`,
};
const COMPONENTS = [
  { component: "gateway", image: "ghcr.io/rnt56/forgedttc-gateway" },
  { component: "workers", image: "ghcr.io/rnt56/forgedttc-workers" },
  { component: "studio", image: "ghcr.io/rnt56/forgedttc-studio" },
];

function copy(value) {
  return structuredClone(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "forge-registry-test-"));
  const attestations = {};
  for (const { component, image } of COMPONENTS) {
    const manifest = Buffer.from(`{"component":"${component}","schemaVersion":2}\n`);
    const manifestDigest = `sha256:${sha256(manifest)}`;
    writeFileSync(join(root, `${component}.registry-manifest.json`), manifest);
    writeJson(join(root, `${component}.spdx.json`), {
      spdxVersion: "SPDX-2.3",
      dataLicense: "CC0-1.0",
      packages: [{ name: component }],
      files: [{ fileName: component }],
      relationships: [{ relationshipType: "CONTAINS" }],
    });
    writeJson(join(root, `${component}.trivy.json`), {
      ArtifactName: `${image}@${manifestDigest}`,
      Results: [{ Target: component, Vulnerabilities: null }],
    });
    writeJson(join(root, `${component}.build-record.json`), {
      "buildx.build.provenance": {
        materials: [{ uri: "pkg:docker/example", digest: { sha256: "4".repeat(64) } }],
        invocation: {
          parameters: {
            args: {
              "build-arg:SOURCE_REVISION": SOURCE,
              target: component,
            },
            root: {
              request: {
                args: {
                  "vcs:revision": SOURCE,
                  "vcs:source": "https://github.com/RNT56/TTC",
                },
              },
            },
          },
        },
      },
      "containerimage.digest": manifestDigest,
      "containerimage.config.digest": CONFIG[component],
    });
    writeFileSync(join(root, `${component}.github-attestation.jsonl`), `${component}-bundle\n`);
    writeJson(join(root, `${component}.attestation-verification.json`), [{
      verificationResult: {
        statement: {
          subject: [{ name: image, digest: { sha256: manifestDigest.slice(7) } }],
        },
      },
    }]);
    attestations[component] = {
      id: `${component}-attestation-id`,
      url: `https://github.com/RNT56/TTC/attestations/${component}-attestation-id`,
    };
  }
  writeJson(join(root, "attestations.json"), attestations);
  writeJson(join(root, "runtime-smoke.json"), {
    sourceRevision: SOURCE,
    environment: "ephemeral-ci",
    images: {
      gateway: { id: CONFIG.gateway },
      workers: { id: CONFIG.workers },
      studio: { id: CONFIG.studio },
    },
    sameArtifactRestartReady: true,
    rollbackProven: false,
    live: false,
    production: false,
    externalBeta: false,
  });
  return root;
}

function create(root) {
  return createPublicationEvidence({
    evidenceRoot: root,
    sourceRevision: SOURCE,
    sourceTree: TREE,
    repository: "RNT56/TTC",
    runId: "1234",
    runAttempt: "1",
  });
}

test("D70 registry policy and repository publication contract are exact", () => {
  assert.deepEqual(validateRegistryPolicy(policy), []);
  assert.deepEqual(checkRepository(), []);
});

test("registry policy refuses mutable names, permissive dispatch, and maturity promotion", () => {
  const candidate = copy(policy);
  candidate.artifacts[0].image = "ghcr.io/rnt56/forgedttc-gateway:latest";
  candidate.publicationRules.manualDispatchOnly = false;
  candidate.publicationRules.mutableTagsAllowed = true;
  candidate.authorityCeiling.sandboxInstalled = true;
  const errors = validateRegistryPolicy(candidate).join("\n");
  assert.match(errors, /image is invalid or mutable/);
  assert.match(errors, /manualDispatchOnly must be true/);
  assert.match(errors, /mutable registry tags must remain forbidden/);
  assert.match(errors, /sandboxInstalled must remain false/);
});

test("publication evidence binds exact registry manifests, source, scans, attestations, and pulled runtime", () => {
  const root = fixture();
  try {
    const record = create(root);
    assert.deepEqual(validatePublicationEvidence(record), []);
    assert.deepEqual(validatePublicationEvidenceFiles(record, root), []);
    assert.equal(record.images.length, 3);
    assert.equal(record.claims.immutableRegistryPublished, true);
    assert.equal(record.claims.managedEnvironment, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("publication evidence refuses digest, source, vulnerability, and attestation substitution", () => {
  const root = fixture();
  try {
    const record = create(root);
    const drifted = copy(record);
    drifted.images[0].reference = `${drifted.images[0].image}@sha256:${"9".repeat(64)}`;
    drifted.images[1].sourceRevision = "c".repeat(40);
    drifted.images[2].vulnerabilityReport.fixedLowOrHigher = 1;
    drifted.images[2].githubAttestation.verified = false;
    const errors = validatePublicationEvidence(drifted).join("\n");
    assert.match(errors, /reference must use the exact manifest digest/);
    assert.match(errors, /sourceRevision must match/);
    assert.match(errors, /fixedLowOrHigher must be zero/);
    assert.match(errors, /verified must be true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("downloaded evidence refuses changed bytes and a mismatched verified subject", () => {
  const root = fixture();
  try {
    const record = create(root);
    writeFileSync(join(root, "gateway.registry-manifest.json"), "changed\n");
    writeJson(join(root, "workers.attestation-verification.json"), [{
      verificationResult: {
        statement: {
          subject: [{ name: "ghcr.io/rnt56/substituted", digest: { sha256: record.images[1].manifestDigest.slice(7) } }],
        },
      },
    }]);
    const errors = validatePublicationEvidenceFiles(record, root).join("\n");
    assert.match(errors, /registryManifest.sha256 does not match/);
    assert.match(errors, /registryManifest must hash to the manifest digest/);
    assert.match(errors, /githubAttestation subject does not match/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("registry proof cannot become managed sandbox or rollback evidence", () => {
  const root = fixture();
  try {
    const record = create(root);
    record.claims.managedEnvironment = true;
    record.claims.sandboxInstalled = true;
    record.claims.rollbackProven = true;
    const errors = validatePublicationEvidence(record).join("\n");
    assert.match(errors, /managedEnvironment must remain false/);
    assert.match(errors, /sandboxInstalled must remain false/);
    assert.match(errors, /rollbackProven must remain false/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
