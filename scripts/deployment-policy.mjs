#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEPLOYMENT_POLICY_VERSION = "1.0.0";
export const DEPLOYMENT_MANIFEST_VERSION = "1.0.0";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(MODULE_DIR, "..");
const POLICY_PATH = join(REPOSITORY_ROOT, "infra/deployment/deployment-policy.v1.json");
const SCHEMA_PATH = join(REPOSITORY_ROOT, "schema/forge-deployment-manifest.schema.json");
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_HASH = /^[a-f0-9]{40}$/;
const MANIFEST_MARKER = `forge-deployment-manifest/${DEPLOYMENT_MANIFEST_VERSION}`;
const POLICY_MARKER = `forge-deployment-policy/${DEPLOYMENT_POLICY_VERSION}`;
const AUTHORITY_FIELDS = [
  "publicTraffic",
  "realUserData",
  "providerCredentials",
  "hardware",
  "externalBeta",
  "live",
  "field",
];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function exactKeys(errors, value, path, required, optional = []) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!(key in value)) errors.push(`${path}.${key} is required`);
  }
  return true;
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateStringMap(errors, value, path) {
  if (!isObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    add(errors, /^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(key), `${path}.${key} has an invalid key`);
    add(
      errors,
      typeof entry === "string" && entry.length > 0 && entry.length <= 500,
      `${path}.${key} must be a non-empty string of at most 500 characters`,
    );
  }
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length;
}

function immutableUri(uri, digest) {
  return (
    typeof uri === "string" &&
    (uri.includes(`@sha256:${digest}`) || uri.includes(`#sha256=${digest}`))
  );
}

function ownerIsAccountable(value) {
  if (typeof value !== "string" || value.trim().length < 3) return false;
  const normalized = value.trim().toLowerCase();
  return ![
    "tbd",
    "todo",
    "unknown",
    "team",
    "platform team",
    "security team",
    "repository bot",
    "repo bot",
    "github actions",
  ].includes(normalized);
}

export function validatePolicy(policy) {
  const errors = [];
  add(errors, isObject(policy), "deployment policy must be an object");
  if (!isObject(policy)) return errors;
  add(errors, policy.schemaVersion === POLICY_MARKER, `policy schemaVersion must be ${POLICY_MARKER}`);
  add(
    errors,
    policy.manifestVersion === DEPLOYMENT_MANIFEST_VERSION,
    `policy manifestVersion must be ${DEPLOYMENT_MANIFEST_VERSION}`,
  );
  add(errors, policy.manifestSchema === "schema/forge-deployment-manifest.schema.json", "policy manifestSchema is invalid");
  add(errors, policy.decision === "D68", "policy must cite D68");

  const environmentNames = Object.keys(policy.environments ?? {});
  add(
    errors,
    JSON.stringify(environmentNames) ===
      JSON.stringify(["local", "ci", "sandbox", "staging", "production", "controlled-lab"]),
    "policy environments must contain the canonical ordered environment set",
  );
  for (const [name, environment] of Object.entries(policy.environments ?? {})) {
    add(errors, typeof environment.managed === "boolean", `environment ${name} must declare managed`);
    for (const field of ["requiredComponents", "requiredGates", "requiredOwnershipRoles"]) {
      add(errors, Array.isArray(environment[field]), `environment ${name}.${field} must be an array`);
      if (Array.isArray(environment[field])) {
        add(errors, !hasDuplicates(environment[field]), `environment ${name}.${field} contains duplicates`);
      }
    }
    for (const authority of AUTHORITY_FIELDS) {
      add(
        errors,
        typeof environment.maximumAuthority?.[authority] === "boolean",
        `environment ${name}.maximumAuthority.${authority} must be boolean`,
      );
    }
    for (const component of environment.requiredComponents ?? []) {
      add(errors, policy.topology?.components?.includes(component), `environment ${name} requires unknown component ${component}`);
    }
    for (const role of environment.requiredOwnershipRoles ?? []) {
      add(errors, policy.ownership?.roles?.includes(role), `environment ${name} requires unknown ownership role ${role}`);
    }
    add(errors, environment.maximumAuthority?.field === false, `environment ${name} must never confer field authority`);
  }

  const edgeKeys = [];
  for (const edge of policy.promotion?.edges ?? []) {
    const key = `${edge.from}->${edge.to}`;
    edgeKeys.push(key);
    add(
      errors,
      edge.from === "protected-main" || environmentNames.includes(edge.from),
      `promotion edge ${key} has an unknown source`,
    );
    add(errors, environmentNames.includes(edge.to), `promotion edge ${key} has an unknown target`);
    add(errors, policy.environments?.[edge.to]?.managed === true, `promotion target ${edge.to} must be managed`);
  }
  add(errors, !hasDuplicates(edgeKeys), "promotion edges must be unique");
  add(
    errors,
    JSON.stringify(edgeKeys) ===
      JSON.stringify([
        "protected-main->sandbox",
        "sandbox->staging",
        "staging->production",
        "protected-main->controlled-lab",
      ]),
    "promotion edges must preserve the canonical direct ladder",
  );

  const configuration = policy.configuration ?? {};
  const categories = [
    "valueVariables",
    "secretVariables",
    "runtimeManagedVariables",
    "localOnlyVariables",
  ];
  const seen = new Map();
  for (const category of categories) {
    const variables = configuration[category];
    add(errors, Array.isArray(variables), `configuration.${category} must be an array`);
    if (!Array.isArray(variables)) continue;
    add(errors, !hasDuplicates(variables), `configuration.${category} contains duplicates`);
    add(
      errors,
      JSON.stringify(variables) === JSON.stringify([...variables].sort()),
      `configuration.${category} must be sorted`,
    );
    for (const variable of variables) {
      if (seen.has(variable)) errors.push(`${variable} is classified in both ${seen.get(variable)} and ${category}`);
      seen.set(variable, category);
    }
  }
  const declaredValues = new Set(configuration.valueVariables ?? []);
  const declaredSecrets = new Set(configuration.secretVariables ?? []);
  for (const value of configuration.baseRequiredValues ?? []) {
    add(errors, declaredValues.has(value), `base required value ${value} is not a declared value variable`);
  }
  for (const secret of configuration.baseRequiredSecrets ?? []) {
    add(errors, declaredSecrets.has(secret), `base required secret ${secret} is not a declared secret variable`);
  }
  for (const bootstrapOnly of [configuration.manifestPathVariable, configuration.manifestDigestVariable]) {
    add(
      errors,
      !configuration.baseRequiredValues?.includes(bootstrapOnly),
      `${bootstrapOnly} is bootstrap-only and cannot be self-referential manifest configuration`,
    );
  }
  for (const [capability, requirements] of Object.entries(configuration.capabilities ?? {})) {
    for (const value of requirements.requiredValues ?? []) {
      add(errors, declaredValues.has(value), `capability ${capability} requires undeclared value ${value}`);
    }
    for (const secret of requirements.requiredSecrets ?? []) {
      add(errors, declaredSecrets.has(secret), `capability ${capability} requires undeclared secret ${secret}`);
    }
  }
  add(
    errors,
    typeof policy.secrets?.referencePattern === "string" && policy.secrets.referencePattern.startsWith("^secret://"),
    "secret reference pattern must be anchored to secret://",
  );
  add(
    errors,
    Number.isInteger(policy.secrets?.emergencyRevocationHours) &&
      policy.secrets.emergencyRevocationHours > 0 &&
      policy.secrets.emergencyRevocationHours <= 24,
    "emergency secret revocation must be a positive duration no greater than 24 hours",
  );
  for (const [name, secretClass] of Object.entries(policy.secrets?.classes ?? {})) {
    add(
      errors,
      Number.isInteger(secretClass.maximumAgeDays) && secretClass.maximumAgeDays > 0,
      `secret class ${name} maximumAgeDays must be positive`,
    );
    add(errors, typeof secretClass.overlapRequired === "boolean", `secret class ${name} must declare overlapRequired`);
  }
  return errors;
}

export function validateManifest(manifest, policy = loadJson(POLICY_PATH)) {
  const errors = [];
  const policyErrors = validatePolicy(policy);
  if (policyErrors.length) return policyErrors.map((error) => `policy: ${error}`);
  if (
    !exactKeys(
      errors,
      manifest,
      "manifest",
      [
        "schemaVersion",
        "deploymentId",
        "environment",
        "status",
        "source",
        "artifacts",
        "configuration",
        "ownership",
        "evidence",
        "promotion",
        "authority",
      ],
      ["$schema"],
    )
  ) return errors;
  add(errors, manifest.schemaVersion === MANIFEST_MARKER, `manifest.schemaVersion must be ${MANIFEST_MARKER}`);
  add(errors, /^[a-z0-9][a-z0-9-]{2,62}$/.test(manifest.deploymentId ?? ""), "manifest.deploymentId is invalid");
  const environment = policy.environments[manifest.environment];
  add(errors, Boolean(environment), `manifest.environment ${String(manifest.environment)} is not supported`);
  add(errors, ["planned", "active", "retired"].includes(manifest.status), "manifest.status is invalid");

  if (exactKeys(errors, manifest.source, "manifest.source", ["repository", "revision", "treeHash", "protectedMain", "worktreeClean", "builtAt"])) {
    add(errors, manifest.source.repository === "RNT56/TTC", "manifest.source.repository must be RNT56/TTC");
    add(errors, GIT_HASH.test(manifest.source.revision ?? ""), "manifest.source.revision must be a full Git hash");
    add(errors, GIT_HASH.test(manifest.source.treeHash ?? ""), "manifest.source.treeHash must be a full Git tree hash");
    add(errors, validDate(manifest.source.builtAt), "manifest.source.builtAt must be an ISO date-time");
    if (environment?.managed) {
      add(errors, manifest.source.protectedMain === true, "managed deployments require protected-main source");
      add(errors, manifest.source.worktreeClean === true, "managed deployments require a clean source worktree");
    }
  }

  const components = [];
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    errors.push("manifest.artifacts must be a non-empty array");
  } else {
    for (const [index, artifact] of manifest.artifacts.entries()) {
      const path = `manifest.artifacts[${index}]`;
      if (!exactKeys(errors, artifact, path, ["component", "uri", "sha256", "sbomSha256", "provenanceSha256"])) continue;
      add(errors, typeof artifact.component === "string" && artifact.component.length >= 2, `${path}.component is invalid`);
      components.push(artifact.component);
      for (const field of ["sha256", "sbomSha256", "provenanceSha256"]) {
        add(errors, SHA256.test(artifact[field] ?? ""), `${path}.${field} must be a SHA-256 digest`);
      }
      add(errors, typeof artifact.uri === "string" && artifact.uri.length >= 8, `${path}.uri is invalid`);
      if (environment?.managed && SHA256.test(artifact.sha256 ?? "")) {
        add(errors, immutableUri(artifact.uri, artifact.sha256), `${path}.uri must bind the exact artifact SHA-256`);
      }
    }
    add(errors, !hasDuplicates(components), "manifest artifact components must be unique");
  }
  if (environment && manifest.status === "active") {
    for (const component of environment.requiredComponents) {
      add(errors, components.includes(component), `active ${manifest.environment} deployment requires component ${component}`);
    }
  }

  if (exactKeys(errors, manifest.configuration, "manifest.configuration", ["enabledCapabilities", "values", "secretRefs"])) {
    const capabilities = manifest.configuration.enabledCapabilities;
    add(errors, Array.isArray(capabilities), "manifest.configuration.enabledCapabilities must be an array");
    if (Array.isArray(capabilities)) {
      add(errors, !hasDuplicates(capabilities), "enabled capabilities must be unique");
      for (const capability of capabilities) {
        add(errors, Boolean(policy.configuration.capabilities[capability]), `capability ${capability} is not declared by policy`);
      }
    }
    validateStringMap(errors, manifest.configuration.values, "manifest.configuration.values");
    validateStringMap(errors, manifest.configuration.secretRefs, "manifest.configuration.secretRefs");
    const valueNames = Object.keys(manifest.configuration.values ?? {});
    const secretNames = Object.keys(manifest.configuration.secretRefs ?? {});
    const declaredValues = new Set(policy.configuration.valueVariables);
    const declaredSecrets = new Set(policy.configuration.secretVariables);
    for (const variable of valueNames) {
      add(errors, declaredValues.has(variable), `configuration value ${variable} is not a declared non-secret variable`);
      add(errors, !declaredSecrets.has(variable), `secret variable ${variable} must use secretRefs`);
    }
    const referencePattern = new RegExp(policy.secrets.referencePattern);
    for (const variable of secretNames) {
      const reference = manifest.configuration.secretRefs[variable];
      add(errors, declaredSecrets.has(variable), `secret reference ${variable} is not a declared secret variable`);
      add(errors, referencePattern.test(reference ?? ""), `secret reference ${variable} must be versioned secret:// authority`);
      if (environment?.managed) {
        add(errors, reference.includes(`/${manifest.environment}/`), `secret reference ${variable} must be environment-specific`);
      }
    }
    for (const variable of policy.configuration.localOnlyVariables) {
      if (environment?.managed) {
        add(errors, !valueNames.includes(variable) && !secretNames.includes(variable), `${variable} is local-only`);
      }
    }
    if (manifest.environment === "production") {
      for (const variable of policy.configuration.productionForbiddenVariables) {
        add(errors, !valueNames.includes(variable) && !secretNames.includes(variable), `${variable} is forbidden in production`);
      }
    }
    if (environment?.managed && manifest.status === "active") {
      for (const variable of policy.configuration.baseRequiredValues) {
        add(errors, valueNames.includes(variable), `active managed deployment requires value ${variable}`);
      }
      for (const variable of policy.configuration.baseRequiredSecrets) {
        add(errors, secretNames.includes(variable), `active managed deployment requires secret reference ${variable}`);
      }
      for (const capability of capabilities ?? []) {
        const requirements = policy.configuration.capabilities[capability];
        for (const variable of requirements?.requiredValues ?? []) {
          add(errors, valueNames.includes(variable), `capability ${capability} requires value ${variable}`);
        }
        for (const variable of requirements?.requiredSecrets ?? []) {
          add(errors, secretNames.includes(variable), `capability ${capability} requires secret reference ${variable}`);
        }
      }
    }
    const values = manifest.configuration.values ?? {};
    add(
      errors,
      !environment?.managed || values.FORGE_DEPLOYMENT_ENVIRONMENT === manifest.environment,
      "FORGE_DEPLOYMENT_ENVIRONMENT must equal manifest.environment",
    );
    add(
      errors,
      !environment?.managed || values.FORGE_SOURCE_REVISION === manifest.source?.revision,
      "FORGE_SOURCE_REVISION must equal manifest.source.revision",
    );
    add(errors, !environment?.managed || values.NODE_ENV === "production", "managed deployments require NODE_ENV=production");
    for (const variable of ["AUTH_URL", "FORGE_OBJECT_ENDPOINT"]) {
      if (environment?.managed && variable in values) {
        add(errors, values[variable].startsWith("https://"), `${variable} must use HTTPS in managed environments`);
      }
    }
    if (manifest.environment === "production") {
      add(errors, values.FORGE_GPU_BACKEND !== "fixture", "production cannot use the fixture GPU backend");
    }
  }

  validateStringMap(errors, manifest.ownership, "manifest.ownership");
  if (environment?.managed && manifest.status === "active") {
    for (const role of environment.requiredOwnershipRoles) {
      add(errors, ownerIsAccountable(manifest.ownership?.[role]), `active ${manifest.environment} deployment requires a named ${role}`);
    }
  }

  const gates = [];
  if (!Array.isArray(manifest.evidence)) {
    errors.push("manifest.evidence must be an array");
  } else {
    for (const [index, evidence] of manifest.evidence.entries()) {
      const path = `manifest.evidence[${index}]`;
      if (!exactKeys(errors, evidence, path, ["gate", "uri", "sha256"])) continue;
      gates.push(evidence.gate);
      add(errors, typeof evidence.gate === "string" && evidence.gate.length >= 2, `${path}.gate is invalid`);
      add(errors, typeof evidence.uri === "string" && evidence.uri.length >= 8, `${path}.uri is invalid`);
      add(errors, SHA256.test(evidence.sha256 ?? ""), `${path}.sha256 must be a SHA-256 digest`);
    }
    add(errors, !hasDuplicates(gates), "manifest evidence gates must be unique");
  }
  if (environment?.managed && manifest.status === "active") {
    for (const gate of environment.requiredGates) {
      add(errors, gates.includes(gate), `active ${manifest.environment} deployment requires evidence gate ${gate}`);
    }
  }

  if (exactKeys(errors, manifest.promotion, "manifest.promotion", ["sourceEnvironment", "sourceManifestSha256", "sourceEvidenceSha256", "rollbackPlanSha256", "databasePlanSha256", "promotedAt", "signoffs"])) {
    const promotion = manifest.promotion;
    add(errors, validDate(promotion.promotedAt), "manifest.promotion.promotedAt must be an ISO date-time");
    for (const field of ["sourceEvidenceSha256", "rollbackPlanSha256", "databasePlanSha256"]) {
      add(errors, SHA256.test(promotion[field] ?? ""), `manifest.promotion.${field} must be a SHA-256 digest`);
    }
    const directEdge = policy.promotion.edges.some(
      (edge) => edge.from === promotion.sourceEnvironment && edge.to === manifest.environment,
    );
    if (environment?.managed) add(errors, directEdge, `${promotion.sourceEnvironment}->${manifest.environment} is not an allowed promotion`);
    if (promotion.sourceEnvironment === "protected-main") {
      add(errors, promotion.sourceManifestSha256 === null, "protected-main promotion must not cite a source manifest");
    } else {
      add(errors, SHA256.test(promotion.sourceManifestSha256 ?? ""), "promotion from an environment requires sourceManifestSha256");
    }
    if (!Array.isArray(promotion.signoffs) || promotion.signoffs.length === 0) {
      errors.push("manifest.promotion.signoffs must be a non-empty array");
    } else {
      const roles = [];
      for (const [index, signoff] of promotion.signoffs.entries()) {
        const path = `manifest.promotion.signoffs[${index}]`;
        if (!exactKeys(errors, signoff, path, ["role", "owner", "signedAt", "evidenceSha256"])) continue;
        roles.push(signoff.role);
        add(errors, ownerIsAccountable(signoff.owner), `${path}.owner must name an accountable owner`);
        add(errors, validDate(signoff.signedAt), `${path}.signedAt must be an ISO date-time`);
        add(errors, SHA256.test(signoff.evidenceSha256 ?? ""), `${path}.evidenceSha256 must be a SHA-256 digest`);
      }
      add(errors, !hasDuplicates(roles), "promotion signoff roles must be unique");
      if (environment?.managed && manifest.status === "active") {
        for (const role of environment.requiredOwnershipRoles) {
          add(errors, roles.includes(role), `active ${manifest.environment} promotion requires ${role} signoff`);
        }
      }
    }
  }

  if (exactKeys(errors, manifest.authority, "manifest.authority", AUTHORITY_FIELDS)) {
    for (const field of AUTHORITY_FIELDS) {
      add(errors, typeof manifest.authority[field] === "boolean", `manifest.authority.${field} must be boolean`);
      if (environment) {
        add(
          errors,
          manifest.authority[field] !== true || environment.maximumAuthority[field] === true,
          `${manifest.environment} cannot claim ${field} authority`,
        );
      }
      if (manifest.status !== "active") {
        add(errors, manifest.authority[field] !== true, `${manifest.status} manifests cannot claim ${field} authority`);
      }
    }
    add(errors, manifest.authority.field !== true, "deployment manifests never confer field-proven authority");
  }
  return errors;
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function validatePromotion(source, target, policy = loadJson(POLICY_PATH), options = {}) {
  const errors = [
    ...validateManifest(source, policy).map((error) => `source: ${error}`),
    ...validateManifest(target, policy).map((error) => `target: ${error}`),
  ];
  add(errors, source.status === "active", "source deployment must be active");
  add(errors, target.status === "active", "target deployment must be active");
  add(
    errors,
    policy.promotion.edges.some((edge) => edge.from === source.environment && edge.to === target.environment),
    `${source.environment}->${target.environment} is not an allowed direct promotion`,
  );
  add(
    errors,
    target.promotion?.sourceEnvironment === source.environment,
    "target promotion sourceEnvironment must equal the source manifest environment",
  );
  if (options.sourceDigest) {
    add(
      errors,
      target.promotion?.sourceManifestSha256 === options.sourceDigest,
      "target promotion sourceManifestSha256 does not match the exact source manifest bytes",
    );
  }
  add(errors, target.source?.revision === source.source?.revision, "promotion cannot change source revision");
  add(errors, target.source?.treeHash === source.source?.treeHash, "promotion cannot change source tree hash");
  const sourceArtifacts = new Map((source.artifacts ?? []).map((artifact) => [artifact.component, artifact]));
  const targetArtifacts = new Map((target.artifacts ?? []).map((artifact) => [artifact.component, artifact]));
  for (const [component, artifact] of sourceArtifacts) {
    const promoted = targetArtifacts.get(component);
    add(errors, Boolean(promoted), `promoted manifest is missing source component ${component}`);
    if (promoted) {
      for (const field of ["uri", "sha256", "sbomSha256", "provenanceSha256"]) {
        add(errors, promoted[field] === artifact[field], `promotion rebuilt or substituted ${component}.${field}`);
      }
    }
  }
  const sourceSecretRefs = source.configuration?.secretRefs ?? {};
  const targetSecretRefs = target.configuration?.secretRefs ?? {};
  for (const [variable, reference] of Object.entries(targetSecretRefs)) {
    if (variable in sourceSecretRefs) {
      add(errors, sourceSecretRefs[variable] !== reference, `promotion must not reuse ${variable} secret reference across environments`);
    }
  }
  return errors;
}

function walkFiles(root) {
  const files = [];
  for (const name of readdirSync(root)) {
    if (["__pycache__", "node_modules", "dist"].includes(name)) continue;
    const path = join(root, name);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function scanRuntimeVariables() {
  const roots = [
    join(REPOSITORY_ROOT, "packages/gateway/src"),
    join(REPOSITORY_ROOT, "workers/forge_workers"),
    join(REPOSITORY_ROOT, "packages/desktop/src-tauri/src"),
  ];
  const pattern = /\b(?:FORGE_[A-Z0-9_]+|NODE_ENV|PORT|DATABASE_URL|AUTH_URL|AUTH_SECRET|GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET|ANTHROPIC_API_KEY|MODAL_TOKEN_ID|MODAL_TOKEN_SECRET|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_REGION|NO_COLOR|PYTORCH_ENABLE_MPS_FALLBACK|CUBLAS_WORKSPACE_CONFIG)\b/g;
  const variables = new Map();
  for (const root of roots) {
    for (const path of walkFiles(root)) {
      if (!/\.(?:ts|py|rs)$/.test(path) || /(?:^|\/)test[^/]*\//.test(path)) continue;
      for (const match of readFileSync(path, "utf8").matchAll(pattern)) {
        if (!variables.has(match[0])) variables.set(match[0], relative(REPOSITORY_ROOT, path));
      }
    }
  }
  return variables;
}

export function checkRepository(root = REPOSITORY_ROOT) {
  const errors = [];
  const policyPath = join(root, "infra/deployment/deployment-policy.v1.json");
  const schemaPath = join(root, "schema/forge-deployment-manifest.schema.json");
  add(errors, existsSync(policyPath), "deployment policy file is missing");
  add(errors, existsSync(schemaPath), "deployment manifest schema is missing");
  if (!existsSync(policyPath) || !existsSync(schemaPath)) return errors;
  const policy = loadJson(policyPath);
  const schema = loadJson(schemaPath);
  errors.push(...validatePolicy(policy));
  add(errors, schema.$schema === "https://json-schema.org/draft/2020-12/schema", "deployment schema must use JSON Schema 2020-12");
  add(errors, schema.$id === "https://forgedttc.dev/schemas/forge-deployment-manifest.v1.json", "deployment schema $id is invalid");
  add(errors, schema.properties?.schemaVersion?.const === MANIFEST_MARKER, "deployment schema version marker is invalid");
  add(errors, schema.additionalProperties === false, "deployment schema must reject unknown top-level fields");
  add(
    errors,
    JSON.stringify(schema.properties?.environment?.enum) === JSON.stringify(Object.keys(policy.environments)),
    "deployment schema environments must exactly match policy",
  );
  add(
    errors,
    JSON.stringify(schema.properties?.configuration?.properties?.enabledCapabilities?.items?.enum) ===
      JSON.stringify(Object.keys(policy.configuration.capabilities)),
    "deployment schema capabilities must exactly match policy",
  );
  add(
    errors,
    JSON.stringify(schema.properties?.authority?.required) === JSON.stringify(AUTHORITY_FIELDS),
    "deployment schema authority fields must exactly match policy",
  );

  const registered = new Set([
    ...policy.configuration.valueVariables,
    ...policy.configuration.secretVariables,
    ...policy.configuration.runtimeManagedVariables,
    ...policy.configuration.localOnlyVariables,
  ]);
  for (const [variable, path] of scanRuntimeVariables()) {
    add(errors, registered.has(variable), `runtime variable ${variable} in ${path} is missing from deployment policy`);
  }
  const packageJson = loadJson(join(root, "package.json"));
  add(
    errors,
    packageJson.scripts?.["verify:deployment"] ===
      "node --test scripts/deployment-policy.test.mjs && node scripts/deployment-policy.mjs check",
    "package.json must expose the canonical verify:deployment gate",
  );
  const verify = readFileSync(join(root, "scripts/verify.mjs"), "utf8");
  add(errors, verify.includes('run("Deployment topology and configuration policy", "pnpm", ["verify:deployment"]);'), "pnpm verify must run verify:deployment");
  const compose = readFileSync(join(root, "infra/docker-compose.yml"), "utf8");
  add(errors, /local[^\n]*prod(?:uction)?-like|prod(?:uction)?-like[^\n]*local/i.test(compose), "docker-compose must identify itself as local and production-like");
  add(errors, /not (?:a )?production/i.test(compose), "docker-compose must explicitly disclaim production authority");
  for (const path of ["AGENTS.md", "docs/OPERATIONS.md", "docs/COMPATIBILITY.md"]) {
    const contents = existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "";
    add(errors, contents.includes("deployment-policy.v1.json"), `${path} must reference the deployment policy`);
  }
  return errors;
}

function printErrors(errors) {
  for (const error of errors) console.error(`- ${error}`);
}

function runCli(argv) {
  const [command, ...args] = argv;
  if (command === "check" && args.length === 0) {
    const errors = checkRepository();
    if (errors.length) {
      console.error(`deployment policy check failed with ${errors.length} error(s):`);
      printErrors(errors);
      return 1;
    }
    console.log(`deployment policy ${DEPLOYMENT_POLICY_VERSION}: repository contract is valid`);
    return 0;
  }
  if (command === "validate" && args.length === 1) {
    const errors = validateManifest(loadJson(resolve(args[0])));
    if (errors.length) {
      console.error(`deployment manifest validation failed with ${errors.length} error(s):`);
      printErrors(errors);
      return 1;
    }
    console.log(`deployment manifest ${args[0]} is valid`);
    return 0;
  }
  if (command === "promote" && args.length === 2) {
    const sourcePath = resolve(args[0]);
    const targetPath = resolve(args[1]);
    const errors = validatePromotion(loadJson(sourcePath), loadJson(targetPath), loadJson(POLICY_PATH), {
      sourceDigest: sha256File(sourcePath),
    });
    if (errors.length) {
      console.error(`deployment promotion validation failed with ${errors.length} error(s):`);
      printErrors(errors);
      return 1;
    }
    console.log(`deployment promotion ${args[0]} -> ${args[1]} is valid`);
    return 0;
  }
  console.error("usage: deployment-policy.mjs check | validate <manifest> | promote <source> <target>");
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runCli(process.argv.slice(2));
}
