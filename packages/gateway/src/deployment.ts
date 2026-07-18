import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

export const DEPLOYMENT_MANIFEST_VERSION = "1.0.0";
export const DEPLOYMENT_ENVIRONMENTS = [
  "local",
  "ci",
  "sandbox",
  "staging",
  "production",
  "controlled-lab",
] as const;

const GATEWAY_ENVIRONMENTS = new Set(["sandbox", "staging", "production"]);
const GIT_HASH = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_MANIFEST_BYTES = 1024 * 1024;

type Environment = Record<string, string | undefined>;
type JsonObject = Record<string, unknown>;

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as JsonObject;
}

function required(env: Environment, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`managed gateway startup requires ${name}`);
  return value;
}

function parseManifest(bytes: Buffer): JsonObject {
  try {
    return object(JSON.parse(bytes.toString("utf8")), "deployment manifest");
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("deployment manifest is not valid JSON");
    throw error;
  }
}

export function assertDeploymentBootstrap(env: Environment = process.env): void {
  const nodeEnvironment = env.NODE_ENV;
  const deploymentEnvironment = env.FORGE_DEPLOYMENT_ENVIRONMENT;
  if (nodeEnvironment !== "production") {
    if (deploymentEnvironment && GATEWAY_ENVIRONMENTS.has(deploymentEnvironment)) {
      throw new Error("managed gateway environment requires NODE_ENV=production");
    }
    return;
  }
  if (!deploymentEnvironment || !GATEWAY_ENVIRONMENTS.has(deploymentEnvironment)) {
    throw new Error("production gateway requires sandbox, staging, or production deployment environment");
  }
  if (env.FORGE_ENV) {
    throw new Error("managed gateway startup rejects legacy FORGE_ENV");
  }

  const manifestPath = required(env, "FORGE_DEPLOYMENT_MANIFEST");
  const expectedDigest = required(env, "FORGE_DEPLOYMENT_MANIFEST_SHA256");
  const artifactDigest = required(env, "FORGE_DEPLOYMENT_ARTIFACT_SHA256");
  const sourceRevision = required(env, "FORGE_SOURCE_REVISION");
  if (!SHA256.test(expectedDigest)) throw new Error("FORGE_DEPLOYMENT_MANIFEST_SHA256 is invalid");
  if (!SHA256.test(artifactDigest)) throw new Error("FORGE_DEPLOYMENT_ARTIFACT_SHA256 is invalid");
  if (!GIT_HASH.test(sourceRevision)) throw new Error("FORGE_SOURCE_REVISION is invalid");
  if (env.FORGE_RUNTIME_SECRETS_SOURCE !== "files") {
    throw new Error("managed gateway startup requires file-mounted runtime secrets");
  }
  const stats = statSync(manifestPath);
  if (!stats.isFile() || stats.size === 0 || stats.size > MAX_MANIFEST_BYTES) {
    throw new Error("deployment manifest file size is invalid");
  }
  const bytes = readFileSync(manifestPath);
  const actualDigest = createHash("sha256").update(bytes).digest("hex");
  if (actualDigest !== expectedDigest) throw new Error("deployment manifest digest mismatch");
  const manifest = parseManifest(bytes);
  const source = object(manifest.source, "deployment manifest source");
  const configuration = object(manifest.configuration, "deployment manifest configuration");
  const values = object(configuration.values, "deployment manifest configuration values");
  const artifacts = manifest.artifacts;
  if (
    manifest.schemaVersion !== `forge-deployment-manifest/${DEPLOYMENT_MANIFEST_VERSION}` ||
    manifest.status !== "active" ||
    manifest.environment !== deploymentEnvironment ||
    source.revision !== sourceRevision ||
    source.protectedMain !== true ||
    source.worktreeClean !== true ||
    values.FORGE_DEPLOYMENT_ENVIRONMENT !== deploymentEnvironment ||
    values.FORGE_SOURCE_REVISION !== sourceRevision ||
    values.NODE_ENV !== "production" ||
    !Array.isArray(artifacts) ||
    !artifacts.some((entry) => {
      try {
        const artifact = object(entry, "deployment artifact");
        return artifact.component === "gateway" && artifact.sha256 === artifactDigest;
      } catch {
        return false;
      }
    })
  ) {
    throw new Error("deployment manifest does not authorize this gateway process");
  }
}
