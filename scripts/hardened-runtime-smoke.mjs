#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function flag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error || result.status !== 0) {
    const detail = options.capture ? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() : "";
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `: ${detail.slice(0, 1000)}` : ""}`);
  }
  return (result.stdout ?? "").trim();
}

function commandOutput(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function composeUp(composeArgs, env, timeout) {
  const args = [...composeArgs, "up", "--detach", "--wait", "--wait-timeout", timeout];
  const result = spawnSync("docker", args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (!result.error && result.status === 0) return;
  const commandFailure = result.error?.message ?? `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const ps = commandOutput("docker", [...composeArgs, "ps", "--all"], env);
  const logs = commandOutput("docker", [...composeArgs, "logs", "--no-color", "--tail", "200"], env);
  throw new Error(`hardened Compose startup failed: ${commandFailure}\n\ncompose ps:\n${ps}\n\ncompose logs:\n${logs}`);
}

function checkoutClean() {
  for (const args of [["diff", "--quiet"], ["diff", "--cached", "--quiet"]]) {
    const result = spawnSync("git", args, { cwd: process.cwd(), stdio: "ignore" });
    if (result.error || result.status !== 0) return false;
  }
  return true;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeSecret(directory, name, value) {
  const path = join(directory, name);
  writeFileSync(path, value, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function stageRuntimeFiles(directory, image) {
  run("docker", [
    "run",
    "--rm",
    "--user", "0:0",
    "--volume", `${directory}:/staged`,
    "--entrypoint", "/bin/sh",
    image,
    "-c",
    "for path in /staged/*; do chown 0:10999 \"$path\"; chmod 0440 \"$path\"; done",
  ]);
}

function stagedFileInspection(path) {
  const value = statSync(path);
  return {
    uid: value.uid,
    gid: value.gid,
    mode: (value.mode & 0o777).toString(8).padStart(4, "0"),
  };
}

function certificate(directory, name, commonName, altNames, caCertificate, caKey) {
  const key = join(directory, `${name}.key`);
  const request = join(directory, `${name}.csr`);
  const certificatePath = join(directory, `${name}.crt`);
  run("openssl", [
    "req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256",
    "-subj", `/CN=${commonName}`,
    "-addext", `subjectAltName=${altNames}`,
    "-keyout", key,
    "-out", request,
  ]);
  run("openssl", [
    "x509", "-req", "-sha256", "-days", "1",
    "-in", request,
    "-CA", caCertificate,
    "-CAkey", caKey,
    "-CAcreateserial",
    "-copy_extensions", "copy",
    "-out", certificatePath,
  ]);
  chmodSync(key, 0o600);
  chmodSync(certificatePath, 0o600);
  return { key, certificate: certificatePath };
}

function imageInspection(reference) {
  const value = JSON.parse(run("docker", ["image", "inspect", reference], { capture: true }))[0];
  return {
    reference,
    id: value.Id,
    user: value.Config.User,
    healthcheck: value.Config.Healthcheck?.Test ?? null,
    revision: value.Config.Labels?.["org.opencontainers.image.revision"] ?? null,
  };
}

function containerInspection(id) {
  const value = JSON.parse(run("docker", ["inspect", id], { capture: true }))[0];
  const publishedPorts = Object.entries(value.HostConfig.PortBindings ?? {})
    .filter(([, bindings]) => Array.isArray(bindings) && bindings.length > 0)
    .map(([port]) => port)
    .sort();
  return {
    image: value.Image,
    configuredUser: value.Config.User,
    readOnlyRoot: value.HostConfig.ReadonlyRootfs,
    capDrop: value.HostConfig.CapDrop ?? [],
    securityOptions: value.HostConfig.SecurityOpt ?? [],
    groupAdd: value.HostConfig.GroupAdd ?? [],
    pidsLimit: value.HostConfig.PidsLimit,
    memoryBytes: value.HostConfig.Memory,
    nanoCpus: value.HostConfig.NanoCpus,
    networks: Object.keys(value.NetworkSettings.Networks ?? {}).sort(),
    publishedPorts,
    health: value.State.Health?.Status ?? null,
    exitCode: value.State.ExitCode,
  };
}

const output = resolve(flag("--out", "artifacts/hardened/runtime-smoke.json"));
const composeFile = resolve("infra/compose.hardened.json");
const runtimeContract = JSON.parse(readFileSync(resolve("infra/deployment/hardened-runtime.v1.json"), "utf8"));
const stagingImage = runtimeContract.baseImages.find((image) => image.name === "minio")?.reference;
if (!stagingImage) throw new Error("D69 runtime contract does not declare the secret-staging image");
const temporary = mkdtempSync(join(tmpdir(), "forge-hardened-runtime-"));
const project = `forge-hardened-${process.pid}`;
const sourceRevision = process.env.FORGE_SOURCE_REVISION || run("git", ["rev-parse", "HEAD"], { capture: true });
const images = {
  gateway: process.env.FORGE_GATEWAY_IMAGE || "forge-gateway:ci",
  workers: process.env.FORGE_WORKERS_IMAGE || "forge-workers:ci",
  studio: process.env.FORGE_STUDIO_IMAGE || "forge-studio:ci",
};
const composeArgs = ["compose", "--project-name", project, "--file", composeFile];
let started = false;

try {
  const caKey = join(temporary, "ca.key");
  const caCertificate = join(temporary, "ca.crt");
  const stagedDirectory = join(temporary, "staged");
  mkdirSync(stagedDirectory, { mode: 0o700 });
  run("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "1",
    "-subj", "/CN=ForgedTTC-CI-CA",
    "-keyout", caKey,
    "-out", caCertificate,
  ]);
  chmodSync(caKey, 0o600);
  chmodSync(caCertificate, 0o600);
  const edge = certificate(stagedDirectory, "edge", "localhost", "DNS:localhost,IP:127.0.0.1", caCertificate, caKey);
  const object = certificate(stagedDirectory, "object", "minio", "DNS:minio,DNS:localhost,IP:127.0.0.1", caCertificate, caKey);
  const runtimeCaCertificate = writeSecret(stagedDirectory, "ca.crt", readFileSync(caCertificate));
  const deploymentManifest = writeSecret(stagedDirectory, "deployment.json", "{}\n");
  const deploymentManifestSha256 = sha256(deploymentManifest);
  const postgresPassword = writeSecret(stagedDirectory, "postgres-password", "forge-ci-postgres-password");
  const databaseUrl = writeSecret(stagedDirectory, "database-url", "postgres://forge:forge-ci-postgres-password@postgres:5432/forge");
  const authSecret = writeSecret(stagedDirectory, "auth-secret", "a".repeat(48));
  const objectAccess = writeSecret(stagedDirectory, "object-access", "forge-ci-access");
  const objectSecret = writeSecret(stagedDirectory, "object-secret", "o".repeat(48));
  stageRuntimeFiles(stagedDirectory, stagingImage);
  const stagedSources = Object.fromEntries(Object.entries({
    deploymentManifest,
    postgresPassword,
    databaseUrl,
    authSecret,
    objectAccess,
    objectSecret,
    caCertificate: runtimeCaCertificate,
    edgeCertificate: edge.certificate,
    edgePrivateKey: edge.key,
    objectCertificate: object.certificate,
    objectPrivateKey: object.key,
  }).map(([name, path]) => [name, stagedFileInspection(path)]));
  for (const [name, source] of Object.entries(stagedSources)) {
    if (source.uid !== 0 || source.gid !== 10999 || source.mode !== "0440") {
      throw new Error(`${name} was not staged root:10999/0440`);
    }
  }
  const inspectedImages = Object.fromEntries(Object.entries(images).map(([name, reference]) => [name, imageInspection(reference)]));
  for (const [name, expectedUser] of [["gateway", "10001:10001"], ["workers", "10002:10002"], ["studio", "101:101"]]) {
    if (inspectedImages[name].user !== expectedUser) throw new Error(`${name} image user is ${inspectedImages[name].user}`);
    if (inspectedImages[name].revision !== sourceRevision) throw new Error(`${name} image revision is not the exact source`);
  }

  const environment = {
    ...process.env,
    FORGE_GATEWAY_IMAGE: images.gateway,
    FORGE_GATEWAY_ARTIFACT_SHA256: inspectedImages.gateway.id.replace(/^sha256:/, ""),
    FORGE_WORKERS_IMAGE: images.workers,
    FORGE_WORKERS_ARTIFACT_SHA256: inspectedImages.workers.id.replace(/^sha256:/, ""),
    FORGE_STUDIO_IMAGE: images.studio,
    FORGE_STUDIO_ARTIFACT_SHA256: inspectedImages.studio.id.replace(/^sha256:/, ""),
    FORGE_SOURCE_REVISION: sourceRevision,
    FORGE_DEPLOYMENT_MANIFEST: deploymentManifest,
    FORGE_DEPLOYMENT_MANIFEST_SHA256: deploymentManifestSha256,
    FORGE_RUNTIME_NODE_ENV: "test",
    FORGE_RUNTIME_ENVIRONMENT: "ci",
    FORGE_HTTPS_BIND: "127.0.0.1:8443",
    AUTH_URL: "https://localhost:8443",
    FORGE_PUBLIC_ORIGIN: "https://localhost:8443",
    POSTGRES_PASSWORD_FILE: postgresPassword,
    DATABASE_URL_FILE: databaseUrl,
    AUTH_SECRET_FILE: authSecret,
    FORGE_OBJECT_ACCESS_KEY_ID_FILE: objectAccess,
    FORGE_OBJECT_SECRET_ACCESS_KEY_FILE: objectSecret,
    TLS_CA_CERTIFICATE_FILE: runtimeCaCertificate,
    TLS_EDGE_CERTIFICATE_FILE: edge.certificate,
    TLS_EDGE_PRIVATE_KEY_FILE: edge.key,
    TLS_OBJECT_CERTIFICATE_FILE: object.certificate,
    TLS_OBJECT_PRIVATE_KEY_FILE: object.key,
  };

  run("docker", [...composeArgs, "config", "--quiet"], { env: environment });
  started = true;
  composeUp(composeArgs, environment, "240");
  const health = JSON.parse(run("curl", ["--fail", "--silent", "--cacert", caCertificate, "https://127.0.0.1:8443/healthz"], { capture: true }));
  const readiness = JSON.parse(run("docker", [
    ...composeArgs,
    "exec",
    "--no-TTY",
    "studio",
    "wget",
    "-qO-",
    "--no-check-certificate",
    "https://127.0.0.1:8443/readyz",
  ], { env: environment, capture: true }));
  const headers = run("curl", ["--fail", "--silent", "--cacert", caCertificate, "--head", "https://127.0.0.1:8443/"], { capture: true }).toLowerCase();
  if (!health.ok || !readiness.ok) throw new Error("TLS health/readiness did not pass");
  if (!headers.includes("cross-origin-opener-policy: same-origin") || !headers.includes("cross-origin-embedder-policy: require-corp")) {
    throw new Error("Studio isolation headers are missing");
  }
  run("docker", [...composeArgs, "exec", "--no-TTY", "workers", "python", "-m", "forge_workers.health", "ready"], { env: environment });

  const services = {};
  for (const name of ["postgres", "minio", "gateway", "workers", "studio"]) {
    const id = run("docker", [...composeArgs, "ps", "--quiet", name], { env: environment, capture: true });
    services[name] = containerInspection(id);
    if (!services[name].readOnlyRoot || !services[name].capDrop.includes("ALL") || !services[name].securityOptions.includes("no-new-privileges:true")) {
      throw new Error(`${name} runtime hardening is incomplete`);
    }
    if (services[name].pidsLimit <= 0 || services[name].memoryBytes <= 0 || services[name].nanoCpus <= 0 || services[name].health !== "healthy") {
      throw new Error(`${name} runtime resource or health evidence is incomplete`);
    }
    if (JSON.stringify(services[name].groupAdd) !== JSON.stringify(["10999"])) {
      throw new Error(`${name} runtime secret group drifted`);
    }
    services[name].effectiveGroups = run("docker", [...composeArgs, "exec", "--no-TTY", name, "id", "-G"], { env: environment, capture: true }).split(/\s+/);
    if (!services[name].effectiveGroups.includes("10999")) throw new Error(`${name} process cannot read staged runtime secrets`);
  }
  const secretConsumers = {};
  for (const name of ["postgres", "minio", "minio-init", "migrate", "gateway", "workers", "studio"]) {
    const id = run("docker", [...composeArgs, "ps", "--all", "--quiet", name], { env: environment, capture: true });
    const inspection = containerInspection(id);
    secretConsumers[name] = { configuredUser: inspection.configuredUser, groupAdd: inspection.groupAdd, exitCode: inspection.exitCode };
    if (JSON.stringify(inspection.groupAdd) !== JSON.stringify(["10999"])) throw new Error(`${name} lost the runtime secret group`);
  }
  const expectedNetworks = {
    postgres: [`${project}_app`],
    minio: [`${project}_app`],
    gateway: [`${project}_app`, `${project}_edge`],
    workers: [`${project}_app`],
    studio: [`${project}_edge`],
  };
  for (const [name, networks] of Object.entries(expectedNetworks)) {
    if (JSON.stringify(services[name].networks) !== JSON.stringify(networks.sort())) {
      throw new Error(`${name} runtime network membership drifted`);
    }
    const expectedPorts = name === "studio" ? ["8443/tcp"] : [];
    if (JSON.stringify(services[name].publishedPorts) !== JSON.stringify(expectedPorts)) {
      throw new Error(`${name} runtime host-port boundary drifted`);
    }
  }
  for (const [name, uid] of [["gateway", "10001"], ["workers", "10002"], ["studio", "101"]]) {
    const actual = run("docker", [...composeArgs, "exec", "--no-TTY", name, "id", "-u"], { env: environment, capture: true });
    if (actual !== uid) throw new Error(`${name} effective UID is ${actual}`);
  }

  run("docker", [...composeArgs, "stop", "--timeout", "60", "studio", "gateway", "workers"], { env: environment });
  const stopped = {};
  for (const name of ["gateway", "workers", "studio"]) {
    const id = run("docker", [...composeArgs, "ps", "--all", "--quiet", name], { env: environment, capture: true });
    stopped[name] = containerInspection(id).exitCode;
    if (stopped[name] !== 0) throw new Error(`${name} did not stop cleanly`);
  }
  run("docker", [...composeArgs, "start", "gateway", "workers", "studio"], { env: environment });
  composeUp(composeArgs, environment, "180");
  const restartedReady = JSON.parse(run("docker", [
    ...composeArgs,
    "exec",
    "--no-TTY",
    "studio",
    "wget",
    "-qO-",
    "--no-check-certificate",
    "https://127.0.0.1:8443/readyz",
  ], { env: environment, capture: true }));
  if (!restartedReady.ok) throw new Error("same-artifact restart did not recover readiness");

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify({
    schemaVersion: "forge-hardened-runtime-smoke/1.0.0",
    sourceRevision,
    checkoutClean: checkoutClean(),
    environment: "ephemeral-ci",
    managedSandbox: false,
    images: inspectedImages,
    stagedSources,
    secretConsumers,
    services,
    tls: { edge: true, objectStorage: true, isolationHeaders: true },
    health,
    readiness,
    gracefulExitCodes: stopped,
    sameArtifactRestartReady: restartedReady.ok,
    rollbackProven: false,
    vulnerabilityReview: "separate CI artifact",
    live: false,
    production: false,
    externalBeta: false,
  }, null, 2)}\n`);
  console.log(`hardened runtime smoke evidence: ${output}`);
} finally {
  if (started) {
    spawnSync("docker", [...composeArgs, "down", "--volumes", "--remove-orphans"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORGE_GATEWAY_IMAGE: images.gateway,
        FORGE_WORKERS_IMAGE: images.workers,
        FORGE_STUDIO_IMAGE: images.studio,
        FORGE_DEPLOYMENT_MANIFEST: join(temporary, "staged", "deployment.json"),
        AUTH_URL: "https://localhost:8443",
        FORGE_PUBLIC_ORIGIN: "https://localhost:8443",
        FORGE_SOURCE_REVISION: sourceRevision,
        FORGE_DEPLOYMENT_MANIFEST_SHA256: "0".repeat(64),
        FORGE_GATEWAY_ARTIFACT_SHA256: "0".repeat(64),
        FORGE_WORKERS_ARTIFACT_SHA256: "0".repeat(64),
        FORGE_STUDIO_ARTIFACT_SHA256: "0".repeat(64),
        POSTGRES_PASSWORD_FILE: join(temporary, "staged", "postgres-password"),
        DATABASE_URL_FILE: join(temporary, "staged", "database-url"),
        AUTH_SECRET_FILE: join(temporary, "staged", "auth-secret"),
        FORGE_OBJECT_ACCESS_KEY_ID_FILE: join(temporary, "staged", "object-access"),
        FORGE_OBJECT_SECRET_ACCESS_KEY_FILE: join(temporary, "staged", "object-secret"),
        TLS_CA_CERTIFICATE_FILE: join(temporary, "staged", "ca.crt"),
        TLS_EDGE_CERTIFICATE_FILE: join(temporary, "staged", "edge.crt"),
        TLS_EDGE_PRIVATE_KEY_FILE: join(temporary, "staged", "edge.key"),
        TLS_OBJECT_CERTIFICATE_FILE: join(temporary, "staged", "object.crt"),
        TLS_OBJECT_PRIVATE_KEY_FILE: join(temporary, "staged", "object.key"),
      },
      stdio: "inherit",
    });
  }
  rmSync(temporary, { recursive: true, force: true });
}
