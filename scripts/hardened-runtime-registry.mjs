#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const HARDENED_REGISTRY_VERSION = "1.0.0";
export const HARDENED_PUBLICATION_VERSION = "1.0.0";

const REGISTRY_MARKER = `forge-hardened-runtime-registry/${HARDENED_REGISTRY_VERSION}`;
const PUBLICATION_MARKER = `forge-hardened-runtime-publication/${HARDENED_PUBLICATION_VERSION}`;
const POLICY_PATH = "infra/deployment/hardened-registry.v1.json";
const EVIDENCE_SCHEMA_PATH = "schema/forge-hardened-runtime-publication.schema.json";
const WORKFLOW_PATH = ".github/workflows/hardened-runtime-release.yml";
const SOURCE_REPOSITORY = "RNT56/TTC";
const SOURCE_REF = "refs/heads/main";
const SIGNER_WORKFLOW = `${SOURCE_REPOSITORY}/${WORKFLOW_PATH}`;
const LICENSE = "LicenseRef-ForgedTTC-Proprietary";
const SHA1 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:([a-f0-9]{64})$/;
const COMPONENTS = [
  { component: "gateway", target: "gateway", image: "ghcr.io/rnt56/forgedttc-gateway" },
  { component: "workers", target: "workers", image: "ghcr.io/rnt56/forgedttc-workers" },
  { component: "studio", target: "studio", image: "ghcr.io/rnt56/forgedttc-studio" },
];
const FALSE_CLAIMS = [
  "managedEnvironment",
  "sandboxInstalled",
  "rollbackProven",
  "live",
  "production",
  "externalBeta",
];

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function exactKeys(errors, value, path, keys) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
  for (const key of keys) {
    if (!(key in value)) errors.push(`${path}.${key} is required`);
  }
  return true;
}

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function evidencePath(root, relative, errors, label) {
  add(errors, typeof relative === "string" && relative === basename(relative), `${label}.path must be one bounded basename`);
  const path = resolve(root, typeof relative === "string" ? relative : "invalid");
  add(errors, existsSync(path), `${label}.path does not exist: ${relative}`);
  return path;
}

function expectedImage(component) {
  return COMPONENTS.find((entry) => entry.component === component);
}

export function validateRegistryPolicy(policy) {
  const errors = [];
  if (!exactKeys(errors, policy, "registryPolicy", [
    "schemaVersion",
    "decision",
    "maturity",
    "registry",
    "workflow",
    "artifacts",
    "publicationRules",
    "publicationEvidenceSchema",
    "authorityCeiling",
  ])) return errors;
  add(errors, policy.schemaVersion === REGISTRY_MARKER, `registryPolicy.schemaVersion must be ${REGISTRY_MARKER}`);
  add(errors, policy.decision === "D70", "registryPolicy.decision must be D70");
  add(errors, policy.maturity === "contract", "registryPolicy.maturity must remain contract");

  exactKeys(errors, policy.registry, "registryPolicy.registry", [
    "host",
    "owner",
    "sourceRepository",
    "credentialAuthority",
    "packageVisibilityClaim",
  ]);
  add(errors, policy.registry?.host === "ghcr.io", "registryPolicy.registry.host must be ghcr.io");
  add(errors, policy.registry?.owner === "rnt56", "registryPolicy.registry.owner must be lowercase rnt56");
  add(errors, policy.registry?.sourceRepository === SOURCE_REPOSITORY, "registryPolicy.registry.sourceRepository is invalid");
  add(errors, policy.registry?.credentialAuthority === "github-actions-repository-token", "registry credential authority is invalid");
  add(errors, policy.registry?.packageVisibilityClaim === "unreviewed", "registry visibility cannot be claimed before publication review");

  exactKeys(errors, policy.workflow, "registryPolicy.workflow", ["path", "environment", "sourceRef", "signerWorkflow"]);
  add(errors, policy.workflow?.path === WORKFLOW_PATH, "registry workflow path is invalid");
  add(errors, policy.workflow?.environment === "hardened-runtime-registry", "registry workflow environment is invalid");
  add(errors, policy.workflow?.sourceRef === SOURCE_REF, "registry workflow sourceRef is invalid");
  add(errors, policy.workflow?.signerWorkflow === SIGNER_WORKFLOW, "registry signer workflow is invalid");

  add(errors, Array.isArray(policy.artifacts) && policy.artifacts.length === COMPONENTS.length, "registry policy must contain exactly three application artifacts");
  for (const [index, expected] of COMPONENTS.entries()) {
    const artifact = policy.artifacts?.[index];
    const path = `registryPolicy.artifacts[${index}]`;
    if (!exactKeys(errors, artifact, path, ["component", "target", "image", "license"])) continue;
    add(errors, artifact.component === expected.component, `${path}.component is invalid`);
    add(errors, artifact.target === expected.target, `${path}.target is invalid`);
    add(errors, artifact.image === expected.image, `${path}.image is invalid or mutable`);
    add(errors, !artifact.image.includes(":"), `${path}.image cannot contain a mutable tag`);
    add(errors, artifact.license === LICENSE, `${path}.license must preserve the proprietary image boundary`);
  }

  const ruleKeys = [
    "manualDispatchOnly",
    "protectedMainOnly",
    "exactHeadInputRequired",
    "digestOnlyPublication",
    "mutableTagsAllowed",
    "buildOnce",
    "buildkitSbomAttestationRequired",
    "buildkitProvenanceAttestationRequired",
    "githubBuildProvenanceRequired",
    "githubAttestationPushRequired",
    "independentRegistryPullRequired",
    "registryManifestHashRequired",
    "spdxDocumentRequired",
    "fixedVulnerabilityThreshold",
    "runtimeSmokeRequired",
    "evidenceRetentionDays",
  ];
  exactKeys(errors, policy.publicationRules, "registryPolicy.publicationRules", ruleKeys);
  for (const key of ruleKeys.filter((key) => !["mutableTagsAllowed", "fixedVulnerabilityThreshold", "evidenceRetentionDays"].includes(key))) {
    add(errors, policy.publicationRules?.[key] === true, `registryPolicy.publicationRules.${key} must be true`);
  }
  add(errors, policy.publicationRules?.mutableTagsAllowed === false, "mutable registry tags must remain forbidden");
  add(errors, policy.publicationRules?.fixedVulnerabilityThreshold === "LOW", "fixed vulnerability threshold must remain LOW");
  add(errors, policy.publicationRules?.evidenceRetentionDays === 90, "registry evidence must be retained for 90 days");
  add(errors, policy.publicationEvidenceSchema === EVIDENCE_SCHEMA_PATH, "registry publication evidence schema path is invalid");
  exactKeys(errors, policy.authorityCeiling, "registryPolicy.authorityCeiling", FALSE_CLAIMS);
  for (const claim of FALSE_CLAIMS) add(errors, policy.authorityCeiling?.[claim] === false, `registryPolicy.authorityCeiling.${claim} must remain false`);
  return errors;
}

export function validatePublicationEvidence(record) {
  const errors = [];
  if (!exactKeys(errors, record, "publication", [
    "schemaVersion",
    "decision",
    "sourceRevision",
    "sourceTree",
    "repository",
    "workflow",
    "registry",
    "images",
    "runtimeSmoke",
    "claims",
  ])) return errors;
  add(errors, record.schemaVersion === PUBLICATION_MARKER, `publication.schemaVersion must be ${PUBLICATION_MARKER}`);
  add(errors, record.decision === "D70", "publication.decision must be D70");
  add(errors, SHA1.test(record.sourceRevision ?? ""), "publication.sourceRevision must be an exact Git object ID");
  add(errors, SHA1.test(record.sourceTree ?? ""), "publication.sourceTree must be an exact Git tree ID");
  add(errors, record.repository === SOURCE_REPOSITORY, "publication.repository is invalid");

  exactKeys(errors, record.workflow, "publication.workflow", ["name", "path", "runId", "runAttempt", "ref", "protected"]);
  add(errors, record.workflow?.name === "hardened-runtime-release", "publication.workflow.name is invalid");
  add(errors, record.workflow?.path === WORKFLOW_PATH, "publication.workflow.path is invalid");
  add(errors, Number.isSafeInteger(record.workflow?.runId) && record.workflow.runId > 0, "publication.workflow.runId is invalid");
  add(errors, Number.isSafeInteger(record.workflow?.runAttempt) && record.workflow.runAttempt > 0, "publication.workflow.runAttempt is invalid");
  add(errors, record.workflow?.ref === SOURCE_REF, "publication.workflow.ref must be protected main");
  add(errors, record.workflow?.protected === true, "publication.workflow.protected must be true");
  exactKeys(errors, record.registry, "publication.registry", ["host", "owner", "credentialAuthority", "packageVisibilityClaim"]);
  add(errors, record.registry?.host === "ghcr.io" && record.registry?.owner === "rnt56", "publication.registry identity is invalid");
  add(errors, record.registry?.credentialAuthority === "github-actions-repository-token", "publication.registry credential authority is invalid");
  add(errors, record.registry?.packageVisibilityClaim === "unreviewed", "publication cannot invent a package visibility claim");

  add(errors, Array.isArray(record.images) && record.images.length === COMPONENTS.length, "publication.images must contain exactly three records");
  for (const [index, expected] of COMPONENTS.entries()) {
    const image = record.images?.[index];
    const path = `publication.images[${index}]`;
    if (!exactKeys(errors, image, path, [
      "component",
      "target",
      "image",
      "reference",
      "manifestDigest",
      "configDigest",
      "sourceRevision",
      "license",
      "registryManifest",
      "spdx",
      "vulnerabilityReport",
      "buildRecord",
      "githubAttestation",
    ])) continue;
    add(errors, image.component === expected.component, `${path}.component is invalid`);
    add(errors, image.target === expected.target, `${path}.target is invalid`);
    add(errors, image.image === expected.image, `${path}.image is invalid`);
    add(errors, DIGEST.test(image.manifestDigest ?? ""), `${path}.manifestDigest is invalid`);
    add(errors, DIGEST.test(image.configDigest ?? ""), `${path}.configDigest is invalid`);
    add(errors, image.reference === `${expected.image}@${image.manifestDigest}`, `${path}.reference must use the exact manifest digest`);
    add(errors, image.sourceRevision === record.sourceRevision, `${path}.sourceRevision must match the publication`);
    add(errors, image.license === LICENSE, `${path}.license is invalid`);
    for (const field of ["registryManifest", "buildRecord"]) {
      exactKeys(errors, image[field], `${path}.${field}`, ["path", "sha256"]);
      add(errors, SHA256.test(image[field]?.sha256 ?? ""), `${path}.${field}.sha256 is invalid`);
    }
    exactKeys(errors, image.spdx, `${path}.spdx`, ["path", "sha256", "packages", "files"]);
    add(errors, SHA256.test(image.spdx?.sha256 ?? ""), `${path}.spdx.sha256 is invalid`);
    add(errors, Number.isSafeInteger(image.spdx?.packages) && image.spdx.packages > 0, `${path}.spdx.packages must be positive`);
    add(errors, Number.isSafeInteger(image.spdx?.files) && image.spdx.files > 0, `${path}.spdx.files must be positive`);
    exactKeys(errors, image.vulnerabilityReport, `${path}.vulnerabilityReport`, ["path", "sha256", "fixedLowOrHigher"]);
    add(errors, SHA256.test(image.vulnerabilityReport?.sha256 ?? ""), `${path}.vulnerabilityReport.sha256 is invalid`);
    add(errors, image.vulnerabilityReport?.fixedLowOrHigher === 0, `${path}.vulnerabilityReport.fixedLowOrHigher must be zero`);
    exactKeys(errors, image.githubAttestation, `${path}.githubAttestation`, [
      "id",
      "url",
      "bundlePath",
      "bundleSha256",
      "verificationPath",
      "verificationSha256",
      "verified",
    ]);
    add(errors, typeof image.githubAttestation?.id === "string" && image.githubAttestation.id.length > 0, `${path}.githubAttestation.id is required`);
    add(errors, image.githubAttestation?.url?.startsWith(`https://github.com/${SOURCE_REPOSITORY}/attestations/`), `${path}.githubAttestation.url is invalid`);
    add(errors, SHA256.test(image.githubAttestation?.bundleSha256 ?? ""), `${path}.githubAttestation.bundleSha256 is invalid`);
    add(errors, SHA256.test(image.githubAttestation?.verificationSha256 ?? ""), `${path}.githubAttestation.verificationSha256 is invalid`);
    add(errors, image.githubAttestation?.verified === true, `${path}.githubAttestation.verified must be true`);
  }

  exactKeys(errors, record.runtimeSmoke, "publication.runtimeSmoke", ["path", "sha256", "exactRegistryImages", "sameArtifactRestartReady"]);
  add(errors, record.runtimeSmoke?.path === "runtime-smoke.json", "publication.runtimeSmoke.path is invalid");
  add(errors, SHA256.test(record.runtimeSmoke?.sha256 ?? ""), "publication.runtimeSmoke.sha256 is invalid");
  add(errors, record.runtimeSmoke?.exactRegistryImages === true, "publication runtime must prove the exact registry images");
  add(errors, record.runtimeSmoke?.sameArtifactRestartReady === true, "publication runtime must prove same-artifact restart");
  exactKeys(errors, record.claims, "publication.claims", ["immutableRegistryPublished", "registryVerified", ...FALSE_CLAIMS]);
  add(errors, record.claims?.immutableRegistryPublished === true, "publication must prove immutable registry publication");
  add(errors, record.claims?.registryVerified === true, "publication must prove registry verification");
  for (const claim of FALSE_CLAIMS) add(errors, record.claims?.[claim] === false, `publication.claims.${claim} must remain false`);
  return errors;
}

function validateFileHash(errors, root, evidence, label) {
  const path = evidencePath(root, evidence?.path, errors, label);
  if (existsSync(path)) add(errors, sha256File(path) === evidence?.sha256, `${label}.sha256 does not match ${evidence?.path}`);
  return path;
}

export function validatePublicationEvidenceFiles(record, root) {
  const errors = validatePublicationEvidence(record);
  if (errors.length > 0) return errors;
  for (const image of record.images) {
    const label = `publication.images.${image.component}`;
    const manifestPath = validateFileHash(errors, root, image.registryManifest, `${label}.registryManifest`);
    if (existsSync(manifestPath)) add(errors, sha256File(manifestPath) === image.manifestDigest.slice(7), `${label}.registryManifest must hash to the manifest digest`);

    const spdxPath = validateFileHash(errors, root, image.spdx, `${label}.spdx`);
    if (existsSync(spdxPath)) {
      const spdx = json(spdxPath);
      add(errors, spdx.spdxVersion === "SPDX-2.3", `${label}.spdx must be SPDX-2.3`);
      add(errors, spdx.dataLicense === "CC0-1.0", `${label}.spdx dataLicense is invalid`);
      add(errors, spdx.packages?.length === image.spdx.packages && image.spdx.packages > 0, `${label}.spdx package count is invalid`);
      add(errors, spdx.files?.length === image.spdx.files && image.spdx.files > 0, `${label}.spdx file count is invalid`);
    }

    const trivyPath = validateFileHash(errors, root, image.vulnerabilityReport, `${label}.vulnerabilityReport`);
    if (existsSync(trivyPath)) {
      const trivy = json(trivyPath);
      const findings = (trivy.Results ?? []).flatMap((result) => result.Vulnerabilities ?? []);
      add(errors, findings.length === 0 && image.vulnerabilityReport.fixedLowOrHigher === 0, `${label}.vulnerabilityReport contains fixed low-or-higher findings`);
      add(errors, trivy.ArtifactName === image.reference, `${label}.vulnerabilityReport must scan the exact registry reference`);
    }

    const buildPath = validateFileHash(errors, root, image.buildRecord, `${label}.buildRecord`);
    if (existsSync(buildPath)) {
      const build = json(buildPath);
      const provenance = build["buildx.build.provenance"];
      add(errors, build["containerimage.digest"] === image.manifestDigest, `${label}.buildRecord manifest digest drifted`);
      add(errors, build["containerimage.config.digest"] === image.configDigest, `${label}.buildRecord config digest drifted`);
      add(errors, provenance?.invocation?.parameters?.args?.["build-arg:SOURCE_REVISION"] === record.sourceRevision, `${label}.buildRecord source build argument drifted`);
      add(errors, provenance?.invocation?.parameters?.args?.target === image.target, `${label}.buildRecord target drifted`);
      add(errors, provenance?.invocation?.parameters?.root?.request?.args?.["vcs:revision"] === record.sourceRevision, `${label}.buildRecord VCS revision drifted`);
      add(errors, provenance?.invocation?.parameters?.root?.request?.args?.["vcs:source"] === `https://github.com/${SOURCE_REPOSITORY}`, `${label}.buildRecord VCS source drifted`);
      add(errors, Array.isArray(provenance?.materials) && provenance.materials.length > 0, `${label}.buildRecord materials are missing`);
    }

    const bundlePath = validateFileHash(errors, root, {
      path: image.githubAttestation.bundlePath,
      sha256: image.githubAttestation.bundleSha256,
    }, `${label}.githubAttestation.bundle`);
    if (existsSync(bundlePath)) add(errors, readFileSync(bundlePath).length > 0, `${label}.githubAttestation.bundle is empty`);
    const verificationPath = validateFileHash(errors, root, {
      path: image.githubAttestation.verificationPath,
      sha256: image.githubAttestation.verificationSha256,
    }, `${label}.githubAttestation.verification`);
    if (existsSync(verificationPath)) {
      const verification = json(verificationPath);
      add(errors, Array.isArray(verification) && verification.length > 0, `${label}.githubAttestation.verification must contain a verified statement`);
      const subjects = (verification ?? []).flatMap((entry) => entry.verificationResult?.statement?.subject ?? []);
      add(errors, subjects.some((subject) => subject.name === image.image && subject.digest?.sha256 === image.manifestDigest.slice(7)), `${label}.githubAttestation subject does not match the image manifest`);
    }
  }

  const runtimePath = validateFileHash(errors, root, {
    path: record.runtimeSmoke.path,
    sha256: record.runtimeSmoke.sha256,
  }, "publication.runtimeSmoke");
  if (existsSync(runtimePath)) {
    const runtime = json(runtimePath);
    add(errors, runtime.sourceRevision === record.sourceRevision, "publication.runtimeSmoke source revision drifted");
    add(errors, runtime.environment === "ephemeral-ci", "publication.runtimeSmoke must remain ephemeral CI evidence");
    add(errors, runtime.sameArtifactRestartReady === true, "publication.runtimeSmoke restart proof is missing");
    add(errors, runtime.rollbackProven === false && runtime.live === false && runtime.production === false && runtime.externalBeta === false, "publication.runtimeSmoke promoted a forbidden maturity claim");
    for (const image of record.images) add(errors, runtime.images?.[image.component]?.id === image.configDigest, `publication.runtimeSmoke ${image.component} config digest drifted`);
  }
  return errors;
}

function readAttestations(root) {
  return json(resolve(root, "attestations.json"));
}

export function createPublicationEvidence({ evidenceRoot, sourceRevision, sourceTree, repository, runId, runAttempt }) {
  if (!SHA1.test(sourceRevision)) throw new Error("sourceRevision must be a full Git object ID");
  if (!SHA1.test(sourceTree)) throw new Error("sourceTree must be a full Git tree ID");
  if (repository !== SOURCE_REPOSITORY) throw new Error(`repository must be ${SOURCE_REPOSITORY}`);
  const attestations = readAttestations(evidenceRoot);
  const images = COMPONENTS.map((expected) => {
    const component = expected.component;
    const buildPath = `${component}.build-record.json`;
    const build = json(resolve(evidenceRoot, buildPath));
    const manifestDigest = build["containerimage.digest"];
    const configDigest = build["containerimage.config.digest"];
    const spdxPath = `${component}.spdx.json`;
    const spdx = json(resolve(evidenceRoot, spdxPath));
    const trivyPath = `${component}.trivy.json`;
    const trivy = json(resolve(evidenceRoot, trivyPath));
    const findings = (trivy.Results ?? []).flatMap((result) => result.Vulnerabilities ?? []);
    const registryManifestPath = `${component}.registry-manifest.json`;
    const bundlePath = `${component}.github-attestation.jsonl`;
    const verificationPath = `${component}.attestation-verification.json`;
    return {
      component,
      target: expected.target,
      image: expected.image,
      reference: `${expected.image}@${manifestDigest}`,
      manifestDigest,
      configDigest,
      sourceRevision,
      license: LICENSE,
      registryManifest: {
        path: registryManifestPath,
        sha256: sha256File(resolve(evidenceRoot, registryManifestPath)),
      },
      spdx: {
        path: spdxPath,
        sha256: sha256File(resolve(evidenceRoot, spdxPath)),
        packages: spdx.packages?.length ?? 0,
        files: spdx.files?.length ?? 0,
      },
      vulnerabilityReport: {
        path: trivyPath,
        sha256: sha256File(resolve(evidenceRoot, trivyPath)),
        fixedLowOrHigher: findings.length,
      },
      buildRecord: {
        path: buildPath,
        sha256: sha256File(resolve(evidenceRoot, buildPath)),
      },
      githubAttestation: {
        id: attestations[component]?.id,
        url: attestations[component]?.url,
        bundlePath,
        bundleSha256: sha256File(resolve(evidenceRoot, bundlePath)),
        verificationPath,
        verificationSha256: sha256File(resolve(evidenceRoot, verificationPath)),
        verified: true,
      },
    };
  });
  const runtimePath = resolve(evidenceRoot, "runtime-smoke.json");
  const record = {
    schemaVersion: PUBLICATION_MARKER,
    decision: "D70",
    sourceRevision,
    sourceTree,
    repository,
    workflow: {
      name: "hardened-runtime-release",
      path: WORKFLOW_PATH,
      runId: Number(runId),
      runAttempt: Number(runAttempt),
      ref: SOURCE_REF,
      protected: true,
    },
    registry: {
      host: "ghcr.io",
      owner: "rnt56",
      credentialAuthority: "github-actions-repository-token",
      packageVisibilityClaim: "unreviewed",
    },
    images,
    runtimeSmoke: {
      path: "runtime-smoke.json",
      sha256: sha256File(runtimePath),
      exactRegistryImages: true,
      sameArtifactRestartReady: json(runtimePath).sameArtifactRestartReady === true,
    },
    claims: {
      immutableRegistryPublished: true,
      registryVerified: true,
      managedEnvironment: false,
      sandboxInstalled: false,
      rollbackProven: false,
      live: false,
      production: false,
      externalBeta: false,
    },
  };
  const errors = validatePublicationEvidenceFiles(record, evidenceRoot);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return record;
}

export function checkRepository(root = process.cwd()) {
  const errors = [];
  const policy = json(resolve(root, POLICY_PATH));
  errors.push(...validateRegistryPolicy(policy));
  const schema = json(resolve(root, EVIDENCE_SCHEMA_PATH));
  add(errors, schema.$id === "https://forgedttc.dev/schemas/forge-hardened-runtime-publication.v1.json", "publication evidence schema $id is invalid");
  add(errors, schema.properties?.schemaVersion?.const === PUBLICATION_MARKER, "publication evidence schema marker is invalid");
  add(errors, schema.properties?.decision?.const === "D70", "publication evidence schema decision is invalid");

  const workflow = readFileSync(resolve(root, WORKFLOW_PATH), "utf8");
  add(errors, /on:\s*\n\s*workflow_dispatch:/.test(workflow), "registry workflow must be manual-dispatch only");
  add(errors, !/^\s*(?:push|pull_request|schedule):/m.test(workflow), "registry workflow cannot run on push, pull request, or schedule");
  add(errors, workflow.includes("environment: hardened-runtime-registry"), "registry workflow must use the protected publication environment");
  add(errors, workflow.includes("packages: write") && workflow.includes("id-token: write") && workflow.includes("attestations: write"), "registry workflow must declare exact publication permissions");
  add(errors, workflow.includes('github.ref == \'refs/heads/main\'') && workflow.includes("github.ref_protected == true"), "registry workflow must refuse non-protected or non-main dispatch");
  add(errors, workflow.includes('github.sha == inputs.source_revision'), "registry workflow must require the exact dispatched main head");
  add(errors, (workflow.match(/push-by-digest=true/g) ?? []).length === COMPONENTS.length, "registry workflow must publish exactly three digest-only images");
  add(errors, !/--tag\s|tags?:/m.test(workflow), "registry workflow cannot publish mutable image tags");
  add(errors, (workflow.match(/push-to-registry:\s*true/g) ?? []).length === COMPONENTS.length, "registry workflow must attach three GitHub provenance attestations");
  add(errors, workflow.includes("--bundle-from-oci"), "registry workflow must verify attestations from the registry");
  add(errors, workflow.includes("--source-digest \"$SOURCE_REVISION\""), "registry workflow must verify the attestation source digest");
  add(errors, workflow.includes("hardened-runtime-smoke.mjs"), "registry workflow must run the exact pulled images");
  add(errors, workflow.includes("retention-days: 90"), "registry workflow must retain final evidence for 90 days");

  const dockerfile = readFileSync(resolve(root, "infra/docker/runtime.Dockerfile"), "utf8");
  add(errors, (dockerfile.match(/org\.opencontainers\.image\.licenses="LicenseRef-ForgedTTC-Proprietary"/g) ?? []).length === COMPONENTS.length, "all proprietary application images must carry the exact license label");
  const packageJson = json(resolve(root, "package.json"));
  add(errors, packageJson.scripts?.["verify:hardened-registry"] === "node --test scripts/hardened-runtime-registry.test.mjs && node scripts/hardened-runtime-registry.mjs check", "package.json must expose verify:hardened-registry");
  const verify = readFileSync(resolve(root, "scripts/verify.mjs"), "utf8");
  add(errors, verify.includes('run("Protected runtime registry publication", "pnpm", ["verify:hardened-registry"]);'), "pnpm verify must include hardened registry validation");
  const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
  add(errors, ci.includes("pnpm verify:hardened-registry"), "required hardened CI must validate the registry publication contract");
  for (const path of ["AGENTS.md", "docs/OPERATIONS.md", "docs/THREAT-MODEL.md", "docs/REPOSITORY-GOVERNANCE.md"]) {
    add(errors, readFileSync(resolve(root, path), "utf8").includes("hardened-registry.v1.json"), `${path} must reference the hardened registry policy`);
  }
  return errors;
}

function argValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) throw new Error(`${name} is required`);
  return args[index + 1];
}

function report(errors) {
  for (const error of errors) console.error(`- ${error}`);
}

function writeAttestationMetadata(out) {
  const result = {};
  for (const { component } of COMPONENTS) {
    const prefix = `FORGE_${component.toUpperCase()}_ATTESTATION_`;
    result[component] = {
      id: process.env[`${prefix}ID`],
      url: process.env[`${prefix}URL`],
    };
    if (!result[component].id || !result[component].url) throw new Error(`missing ${component} attestation outputs`);
  }
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
}

function run(args) {
  const [command] = args;
  if (command === "check" && args.length === 1) {
    const errors = checkRepository();
    if (errors.length > 0) {
      console.error(`hardened registry validation failed with ${errors.length} error(s):`);
      report(errors);
      return 1;
    }
    console.log(`hardened registry ${HARDENED_REGISTRY_VERSION}: repository contract passed`);
    return 0;
  }
  if (command === "write-attestations") {
    writeAttestationMetadata(argValue(args, "--out"));
    return 0;
  }
  if (command === "create") {
    const evidenceRoot = resolve(argValue(args, "--evidence"));
    const record = createPublicationEvidence({
      evidenceRoot,
      sourceRevision: argValue(args, "--source"),
      sourceTree: argValue(args, "--tree"),
      repository: argValue(args, "--repository"),
      runId: argValue(args, "--run-id"),
      runAttempt: argValue(args, "--run-attempt"),
    });
    writeFileSync(argValue(args, "--out"), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    console.log(`hardened registry publication ${record.sourceRevision}: evidence created`);
    return 0;
  }
  if (command === "verify") {
    const record = json(resolve(argValue(args, "--file")));
    const errors = validatePublicationEvidenceFiles(record, resolve(argValue(args, "--evidence")));
    if (errors.length > 0) {
      console.error(`hardened registry evidence validation failed with ${errors.length} error(s):`);
      report(errors);
      return 1;
    }
    console.log(`hardened registry publication ${record.sourceRevision}: evidence verified`);
    return 0;
  }
  console.error("usage: hardened-runtime-registry.mjs check | write-attestations --out <path> | create --evidence <dir> --source <sha> --tree <sha> --repository <owner/repo> --run-id <id> --run-attempt <n> --out <path> | verify --file <path> --evidence <dir>");
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
