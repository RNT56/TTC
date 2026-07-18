#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const HARDENED_RUNTIME_VERSION = "1.0.0";
const MARKER = `forge-hardened-runtime/${HARDENED_RUNTIME_VERSION}`;
const SHA256 = /^[a-f0-9]{64}$/;
const PINNED_IMAGE = /^[a-z0-9][a-z0-9./_-]*:[A-Za-z0-9_.-]+@sha256:([a-f0-9]{64})$/;
const APPLICATIONS = ["gateway", "workers", "studio-static"];
const TARGETS = ["gateway", "workers", "studio"];
const LONG_LIVED = ["postgres", "minio", "gateway", "workers", "studio"];
const ROOT_INITIALIZERS = ["postgres-permissions", "minio-permissions"];
const SECRET_CONSUMERS = ["postgres", "minio", "minio-init", "migrate", "gateway", "workers", "studio"];
const SECRET_SUPPLEMENTAL_GID = "10999";
const BASE_NAMES = ["node", "python", "rust", "nginx-unprivileged", "postgres-pgvector", "minio", "minio-client"];
const APPLICATION_CONTRACTS = [
  { user: "10001:10001", writablePaths: ["/tmp"], ports: [8080], liveness: "/healthz", readiness: "/readyz" },
  { user: "10002:10002", writablePaths: ["/tmp"], ports: [], liveness: "python -m forge_workers.health live", readiness: "python -m forge_workers.health ready" },
  { user: "101:101", writablePaths: ["/tmp", "/var/cache/nginx", "/var/run"], ports: [8443], liveness: "/healthz", readiness: "/readyz" },
];
const REQUIRED_EVIDENCE = [
  "application image manifest digests",
  "SPDX SBOM and BuildKit provenance metadata per application image",
  "OS-package vulnerability review",
  "non-root/read-only/capability/no-new-privilege inspection",
  "TLS edge and private-network inspection",
  "liveness/readiness and graceful-stop exercise",
  "clean sandbox install and exact application rollback",
  "forward-only migration and corrected roll-forward exercise",
];

function load(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(errors, value, path, required) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  const expected = new Set(required);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!(key in value)) errors.push(`${path}.${key} is required`);
  }
  return true;
}

export function imageDigest(reference) {
  const match = typeof reference === "string" ? reference.match(/@sha256:([a-f0-9]{64})$/) : null;
  return match?.[1] ?? null;
}

export function validateHardenedRuntime(contract) {
  const errors = [];
  if (!exactKeys(errors, contract, "runtime", [
    "schemaVersion",
    "decision",
    "maturity",
    "substrate",
    "composeFile",
    "dockerfile",
    "verifiedUpstreamAt",
    "baseImages",
    "toolImages",
    "applicationArtifacts",
    "runtimeRules",
    "requiredEvidence",
    "currentClaim",
  ])) return errors;
  add(errors, contract.schemaVersion === MARKER, `runtime.schemaVersion must be ${MARKER}`);
  add(errors, contract.decision === "D69", "runtime.decision must be D69");
  add(errors, contract.maturity === "contract-fixture", "runtime.maturity must remain contract-fixture");
  add(errors, contract.substrate === "docker-compose-single-host", "runtime.substrate is invalid");
  add(errors, contract.composeFile === "infra/compose.hardened.json", "runtime.composeFile is invalid");
  add(errors, contract.dockerfile === "infra/docker/runtime.Dockerfile", "runtime.dockerfile is invalid");
  add(errors, Number.isFinite(Date.parse(contract.verifiedUpstreamAt)), "runtime.verifiedUpstreamAt must be a date-time");

  const baseNames = [];
  for (const [index, image] of (contract.baseImages ?? []).entries()) {
    const path = `runtime.baseImages[${index}]`;
    if (!exactKeys(errors, image, path, ["name", "reference", "registry"])) continue;
    baseNames.push(image.name);
    add(errors, PINNED_IMAGE.test(image.reference), `${path}.reference must use an exact tag and manifest digest`);
    add(errors, image.registry === `https://registry-1.docker.io/v2/${image.reference.split(":", 1)[0] === image.name ? `library/${image.name}` : image.reference.split(":", 1)[0]}/manifests/${image.reference.split(":")[1]?.split("@")[0]}`, `${path}.registry must name the exact Docker registry manifest endpoint`);
  }
  add(errors, JSON.stringify(baseNames) === JSON.stringify(BASE_NAMES), "runtime must pin the exact ordered seven reviewed base/service images");
  const toolNames = [];
  for (const [index, image] of (contract.toolImages ?? []).entries()) {
    const path = `runtime.toolImages[${index}]`;
    if (!exactKeys(errors, image, path, ["name", "reference", "registry"])) continue;
    toolNames.push(image.name);
    add(errors, PINNED_IMAGE.test(image.reference), `${path}.reference must use an exact tag and manifest digest`);
    const repository = image.reference.split(":", 1)[0];
    const tag = image.reference.split(":")[1]?.split("@")[0];
    add(errors, image.registry === `https://registry-1.docker.io/v2/${repository}/manifests/${tag}`, `${path}.registry must name the exact Docker registry manifest endpoint`);
  }
  add(errors, JSON.stringify(toolNames) === JSON.stringify(["syft", "trivy"]), "runtime must pin the reviewed SBOM and vulnerability tools");

  const components = [];
  const targets = [];
  for (const [index, artifact] of (contract.applicationArtifacts ?? []).entries()) {
    const path = `runtime.applicationArtifacts[${index}]`;
    if (!exactKeys(errors, artifact, path, [
      "component",
      "target",
      "user",
      "readOnlyRoot",
      "writablePaths",
      "ports",
      "liveness",
      "readiness",
    ])) continue;
    components.push(artifact.component);
    targets.push(artifact.target);
    add(errors, /^\d{2,5}:\d{2,5}$/.test(artifact.user ?? ""), `${path}.user must be numeric non-root authority`);
    add(errors, !artifact.user?.startsWith("0:"), `${path}.user cannot be root`);
    add(errors, artifact.readOnlyRoot === true, `${path}.readOnlyRoot must be true`);
    add(errors, Array.isArray(artifact.writablePaths) && artifact.writablePaths.every((entry) => entry.startsWith("/")), `${path}.writablePaths must be absolute`);
    add(errors, Array.isArray(artifact.ports), `${path}.ports must be an array`);
    const expected = APPLICATION_CONTRACTS[index];
    for (const field of ["user", "writablePaths", "ports", "liveness", "readiness"]) {
      add(errors, JSON.stringify(artifact[field]) === JSON.stringify(expected[field]), `${path}.${field} must match the D69 application contract`);
    }
  }
  add(errors, JSON.stringify(components) === JSON.stringify(APPLICATIONS), "runtime application component order is invalid");
  add(errors, JSON.stringify(targets) === JSON.stringify(TARGETS), "runtime Docker target order is invalid");
  exactKeys(errors, contract.runtimeRules, "runtime.runtimeRules", [
    "publicServices",
    "privateServices",
    "rootInitOnly",
    "dropAllCapabilities",
    "noNewPrivileges",
    "readOnlyRoots",
    "tlsEdgeRequired",
    "tlsObjectStorageRequired",
    "fileMountedSecretsRequired",
    "secretFileMode",
    "secretSupplementalGid",
    "resourceLimitsRequired",
    "gracefulStopRequired",
    "migrationMode",
    "imageRule",
    "promotionRule",
  ]);
  for (const [name, expected] of Object.entries({
    dropAllCapabilities: true,
    noNewPrivileges: true,
    readOnlyRoots: true,
    tlsEdgeRequired: true,
    tlsObjectStorageRequired: true,
    fileMountedSecretsRequired: true,
    resourceLimitsRequired: true,
    gracefulStopRequired: true,
  })) add(errors, contract.runtimeRules?.[name] === expected, `runtime.runtimeRules.${name} must be true`);
  add(errors, JSON.stringify(contract.runtimeRules?.publicServices) === JSON.stringify(["studio"]), "runtime public-service boundary is invalid");
  add(errors, JSON.stringify(contract.runtimeRules?.privateServices) === JSON.stringify(["gateway", "workers", "postgres", "minio"]), "runtime private-service boundary is invalid");
  add(errors, JSON.stringify(contract.runtimeRules?.rootInitOnly) === JSON.stringify(["postgres-permissions", "minio-permissions"]), "runtime root-init boundary is invalid");
  add(errors, contract.runtimeRules?.secretFileMode === "0440", "runtime secret source-file mode is invalid");
  add(errors, contract.runtimeRules?.secretSupplementalGid === SECRET_SUPPLEMENTAL_GID, "runtime secret supplemental GID is invalid");
  add(errors, contract.runtimeRules?.migrationMode === "forward-only-one-shot", "runtime migration mode is invalid");
  add(errors, contract.runtimeRules?.imageRule === "tag-plus-manifest-digest", "runtime image rule is invalid");
  add(errors, contract.runtimeRules?.promotionRule === "identical-application-digests", "runtime promotion rule is invalid");
  exactKeys(errors, contract.currentClaim, "runtime.currentClaim", [
    "managedEnvironment",
    "sandboxInstalled",
    "rollbackProven",
    "live",
    "production",
    "externalBeta",
  ]);
  for (const claim of ["managedEnvironment", "sandboxInstalled", "rollbackProven", "live", "production", "externalBeta"]) {
    add(errors, contract.currentClaim?.[claim] === false, `runtime.currentClaim.${claim} must remain false without retained external evidence`);
  }
  add(errors, JSON.stringify(contract.requiredEvidence) === JSON.stringify(REQUIRED_EVIDENCE), "runtime must list the exact eight OPS-002 evidence classes");
  return errors;
}

export function validateHardenedCompose(compose, contract) {
  const errors = [];
  add(errors, compose.name === "forgedttc-managed", "compose project name is invalid");
  const services = compose.services ?? {};
  for (const name of ["postgres-permissions", "postgres", "minio-permissions", "minio", "minio-init", "migrate", "gateway", "workers", "studio"]) {
    add(errors, isObject(services[name]), `compose service ${name} is required`);
  }
  const pins = new Set((contract.baseImages ?? []).map((entry) => entry.reference));
  for (const name of ["postgres-permissions", "postgres", "minio-permissions", "minio", "minio-init"]) {
    add(errors, pins.has(services[name]?.image), `compose service ${name} must use a reviewed pinned image`);
  }
  add(errors, services.gateway?.image === "${FORGE_GATEWAY_IMAGE:?set an immutable gateway image reference}", "gateway image must be deployment-supplied and immutable");
  add(errors, services.migrate?.image === services.gateway?.image, "migration must use the exact gateway artifact");
  add(errors, services.workers?.image === "${FORGE_WORKERS_IMAGE:?set an immutable workers image reference}", "workers image must be deployment-supplied and immutable");
  add(errors, services.studio?.image === "${FORGE_STUDIO_IMAGE:?set an immutable Studio image reference}", "Studio image must be deployment-supplied and immutable");

  for (const [name, service] of Object.entries(services)) {
    if (ROOT_INITIALIZERS.includes(name)) {
      add(errors, service.user === "0:0", `${name} must declare its bounded root identity`);
      add(errors, service.read_only === true, `${name} must use a read-only root`);
      add(errors, JSON.stringify(service.cap_drop) === JSON.stringify(["ALL"]), `${name} must drop all capabilities before its exact additions`);
      add(errors, JSON.stringify(service.cap_add) === JSON.stringify(["CHOWN", "DAC_OVERRIDE", "FOWNER"]), `${name} must add only bounded volume-ownership capabilities`);
      add(errors, service.security_opt?.includes("no-new-privileges:true"), `${name} must forbid new privileges`);
      add(errors, Number(service.pids_limit) > 0 && Number(service.cpus) > 0 && typeof service.mem_limit === "string", `${name} must retain finite resources`);
      add(errors, !("restart" in service), `${name} cannot restart after its one-shot volume operation`);
    } else {
      add(errors, /^\d{2,5}:\d{2,5}$/.test(service.user ?? "") && !service.user.startsWith("0:"), `${name} must declare a numeric non-root identity`);
    }
  }

  for (const name of LONG_LIVED) {
    const service = services[name] ?? {};
    add(errors, service.read_only === true, `${name} must use a read-only root`);
    add(errors, service.cap_drop?.length === 1 && service.cap_drop[0] === "ALL", `${name} must drop all capabilities`);
    add(errors, service.security_opt?.includes("no-new-privileges:true"), `${name} must forbid new privileges`);
    add(errors, !Array.isArray(service.cap_add) || service.cap_add.length === 0, `${name} cannot add Linux capabilities`);
    add(errors, Number(service.pids_limit) > 0, `${name} must set a PID limit`);
    add(errors, Number(service.cpus) > 0, `${name} must set a CPU limit`);
    add(errors, typeof service.mem_limit === "string" && service.mem_limit.length > 1, `${name} must set a memory limit`);
    add(errors, typeof service.stop_grace_period === "string", `${name} must set a graceful-stop period`);
    add(errors, isObject(service.healthcheck), `${name} must define a health check`);
    add(errors, Array.isArray(service.tmpfs) || Array.isArray(service.volumes), `${name} must inventory writable mounts`);
  }
  add(errors, services.postgres?.user === "999:999", "Postgres must run as the declared non-root identity");
  add(errors, services.gateway?.user === "10001:10001", "gateway must run as the declared non-root identity");
  add(errors, services.workers?.user === "10002:10002", "workers must run as the declared non-root identity");
  add(errors, services.studio?.user === "101:101", "Studio must run as the declared non-root identity");
  for (const [name, service] of Object.entries(services)) {
    if (name !== "studio") add(errors, !Array.isArray(service.ports) || service.ports.length === 0, `${name} cannot publish a host port`);
  }
  add(errors, Array.isArray(services.studio?.ports) && services.studio.ports.length === 1, "Studio must own the only published TLS port");
  add(errors, compose.networks?.app?.internal === true, "application/data network must be internal");
  add(errors, JSON.stringify(services.workers?.networks) === JSON.stringify(["app"]), "workers must stay off the edge network");
  add(errors, JSON.stringify(services.postgres?.networks) === JSON.stringify(["app"]), "Postgres must stay off the edge network");
  add(errors, JSON.stringify(services.minio?.networks) === JSON.stringify(["app"]), "object storage must stay off the edge network");
  add(errors, JSON.stringify(services.studio?.networks) === JSON.stringify(["edge"]), "Studio must stay off the data network");
  add(errors, services.gateway?.environment?.FORGE_OBJECT_ENDPOINT === "https://minio:9000", "gateway object storage must use private TLS");
  add(errors, services.workers?.environment?.FORGE_OBJECT_ENDPOINT === "https://minio:9000", "workers object storage must use private TLS");
  add(errors, JSON.stringify(services.postgres?.depends_on) === JSON.stringify({ "postgres-permissions": { condition: "service_completed_successfully" } }), "Postgres must wait for its bounded volume initializer");
  add(errors, JSON.stringify(services.migrate?.depends_on) === JSON.stringify({ postgres: { condition: "service_healthy" } }), "migration must wait for healthy Postgres only");
  add(errors, services.gateway?.depends_on?.migrate?.condition === "service_completed_successfully", "gateway must wait for the forward migration");
  add(errors, services.workers?.depends_on?.migrate?.condition === "service_completed_successfully", "workers must wait for the forward migration");
  for (const name of SECRET_CONSUMERS) {
    add(errors, JSON.stringify(services[name]?.group_add) === JSON.stringify([SECRET_SUPPLEMENTAL_GID]), `${name} must receive only the runtime secret supplemental group`);
    for (const secret of services[name]?.secrets ?? []) {
      add(errors, isObject(secret) && Object.keys(secret).every((key) => key === "source" || key === "target"), `${name} secret ${secret.source} cannot claim unsupported Compose ownership or mode`);
      add(errors, typeof secret.source === "string" && typeof secret.target === "string", `${name} secret mount must declare source and target`);
    }
    for (const config of services[name]?.configs ?? []) {
      add(errors, isObject(config) && Object.keys(config).every((key) => key === "source" || key === "target"), `${name} config ${config.source} cannot claim unsupported Compose ownership or mode`);
    }
  }
  add(errors, JSON.stringify(services.gateway?.healthcheck?.test ?? []).includes("/readyz"), "gateway health check must use readiness");
  add(errors, JSON.stringify(services.workers?.healthcheck?.test ?? []).includes('"ready"'), "workers health check must use readiness");
  add(errors, JSON.stringify(services.studio?.healthcheck?.test ?? []).includes("/readyz"), "Studio health check must transitively use gateway readiness");
  for (const name of ["POSTGRES_PASSWORD", "AUTH_SECRET", "DATABASE_URL", "FORGE_OBJECT_ACCESS_KEY_ID", "FORGE_OBJECT_SECRET_ACCESS_KEY", "TLS_CA_CERTIFICATE", "TLS_EDGE_CERTIFICATE", "TLS_EDGE_PRIVATE_KEY", "TLS_OBJECT_CERTIFICATE", "TLS_OBJECT_PRIVATE_KEY"]) {
    add(errors, typeof compose.secrets?.[name]?.file === "string" && compose.secrets[name].file.includes(":?"), `compose secret ${name} must be an explicit file mount`);
  }
  add(errors, compose.configs?.deployment_manifest?.file?.includes(":?"), "deployment manifest must be an explicit read-only config file");
  return errors;
}

export function validateArtifactEnvironment(env) {
  const errors = [];
  for (const [label, imageName, digestName] of [
    ["gateway", "FORGE_GATEWAY_IMAGE", "FORGE_GATEWAY_ARTIFACT_SHA256"],
    ["workers", "FORGE_WORKERS_IMAGE", "FORGE_WORKERS_ARTIFACT_SHA256"],
    ["studio", "FORGE_STUDIO_IMAGE", "FORGE_STUDIO_ARTIFACT_SHA256"],
  ]) {
    const digest = imageDigest(env[imageName]);
    add(errors, digest !== null, `${label} image must use an immutable manifest digest`);
    add(errors, SHA256.test(env[digestName] ?? ""), `${digestName} must be a SHA-256 digest`);
    add(errors, digest !== null && digest === env[digestName], `${label} image and declared artifact digest must match`);
  }
  add(errors, /^[a-f0-9]{40}$/.test(env.FORGE_SOURCE_REVISION ?? ""), "FORGE_SOURCE_REVISION must be exact");
  add(errors, SHA256.test(env.FORGE_DEPLOYMENT_MANIFEST_SHA256 ?? ""), "FORGE_DEPLOYMENT_MANIFEST_SHA256 must be exact");
  return errors;
}

export function checkRepository(root = process.cwd()) {
  const errors = [];
  const contract = load(resolve(root, "infra/deployment/hardened-runtime.v1.json"));
  const compose = load(resolve(root, contract.composeFile));
  errors.push(...validateHardenedRuntime(contract));
  errors.push(...validateHardenedCompose(compose, contract));
  const dockerfile = readFileSync(resolve(root, contract.dockerfile), "utf8");
  for (const image of contract.baseImages.slice(0, 4)) {
    add(errors, dockerfile.includes(`FROM ${image.reference}`), `Dockerfile must pin ${image.name}`);
  }
  for (const target of TARGETS) add(errors, new RegExp(` AS ${target}(?:\\s|$)`).test(dockerfile), `Dockerfile target ${target} is missing`);
  add(errors, / AS web-build\s+ENV CI=true[\s\S]*?RUN pnpm install --frozen-lockfile/.test(dockerfile), "web build must make non-interactive pnpm deployment explicit");
  add(errors, /pnpm --filter @forge\/gateway build \\\s+&& pnpm --filter @forge\/studio build \\\s+&& pnpm --filter @forge\/gateway deploy --prod --legacy/.test(dockerfile), "all web compilation must precede production dependency pruning");
  add(errors, dockerfile.includes("rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack"), "gateway runtime must remove unused package-manager code");
  add(errors, dockerfile.includes("cargo build --locked --release -p forge-validate"), "Dockerfile must build the release validator from the lockfile");
  add(errors, dockerfile.includes("pnpm install --frozen-lockfile"), "Dockerfile must install the exact JavaScript lockfile");
  add(errors, dockerfile.includes("python -m pip install --no-cache-dir '.[queue]'"), "Dockerfile must install the bounded worker queue runtime");
  add(errors, dockerfile.includes("python -m pip uninstall --yes pip setuptools wheel"), "worker runtime must remove unused Python package-manager code");
  add(errors, dockerfile.includes('forge_workers.health", "live"'), "worker image liveness must remain process-only");
  add(errors, dockerfile.includes("127.0.0.1:8080/healthz"), "gateway image liveness must remain process-only");
  const nginx = readFileSync(resolve(root, "infra/docker/studio.nginx.conf"), "utf8");
  add(errors, /listen 8443 ssl;/.test(nginx), "Studio edge must require TLS");
  add(errors, nginx.includes("Cross-Origin-Opener-Policy"), "Studio edge must retain COOP");
  add(errors, nginx.includes("Cross-Origin-Embedder-Policy"), "Studio edge must retain COEP");
  add(errors, /location = \/readyz \{[\s\S]*?allow 127\.0\.0\.1;[\s\S]*?deny all;/.test(nginx), "Studio readiness must be local-probe-only at the public edge");
  const packageJson = load(resolve(root, "package.json"));
  add(errors, packageJson.scripts?.["verify:hardened-runtime"] === "node --test scripts/hardened-runtime.test.mjs && node scripts/hardened-runtime.mjs check", "package.json must expose verify:hardened-runtime");
  const verify = readFileSync(resolve(root, "scripts/verify.mjs"), "utf8");
  add(errors, verify.includes('run("Hardened deployable runtime contract", "pnpm", ["verify:hardened-runtime"]);'), "pnpm verify must include hardened runtime validation");
  const workflow = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");
  add(errors, workflow.includes("BUILDX_METADATA_PROVENANCE: max"), "hardened image CI must retain max-mode Buildx build-record provenance");
  add(errors, workflow.includes('BUILDX_METADATA_WARNINGS: "1"'), "hardened image CI must retain Buildx warnings in its metadata evidence");
  add(errors, (workflow.match(/--provenance=false/g) ?? []).length === TARGETS.length, "Docker-loaded hardened images must disable unsupported attached attestations exactly once per target");
  add(errors, (workflow.match(/--metadata-file artifacts\/hardened\/[a-z]+-provenance\.json/g) ?? []).length === TARGETS.length, "every hardened image target must emit Buildx provenance metadata");
  for (const path of ["AGENTS.md", "docs/OPERATIONS.md", "docs/THREAT-MODEL.md"]) {
    add(errors, readFileSync(resolve(root, path), "utf8").includes("hardened-runtime.v1.json"), `${path} must reference the hardened runtime contract`);
  }
  return errors;
}

function report(errors) {
  for (const error of errors) console.error(`- ${error}`);
}

function run(argv) {
  const [command] = argv;
  let errors;
  if (command === "check" && argv.length === 1) errors = checkRepository();
  else if (command === "validate-env" && argv.length === 1) errors = validateArtifactEnvironment(process.env);
  else {
    console.error("usage: hardened-runtime.mjs check | validate-env");
    return 2;
  }
  if (errors.length) {
    console.error(`hardened runtime validation failed with ${errors.length} error(s):`);
    report(errors);
    return 1;
  }
  console.log(`hardened runtime ${HARDENED_RUNTIME_VERSION}: ${command} passed`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = run(process.argv.slice(2));
