import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAuthConfiguration,
  configuredPublicOrigin,
  pinnedAuthRequestUrl,
  type CurrentUser,
} from "../src/auth.js";
import type { GatewayDb } from "../src/db.js";
import { recordGeneratedArtifact } from "../src/generatedArtifacts.js";
import type { GenerationRequest, GenerationResponse } from "../src/generation.js";
import { deleteStoredObjects, objectStorageConfigFromEnv, presignObjectAccess } from "../src/objectStorage.js";
import { insertModelFromGeneration, recordUsageEvent } from "../src/platform.js";
import { buildServer } from "../src/server.js";

const productionEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  AUTH_URL: "https://forge.example.test",
  AUTH_SECRET: "a-production-auth-secret-longer-than-32-characters",
  ...overrides,
});

test("production auth pins an HTTPS origin, strong secret, complete OAuth pair, and no dev auth", () => {
  assert.doesNotThrow(() => assertAuthConfiguration(productionEnv()));
  assert.equal(configuredPublicOrigin(productionEnv()), "https://forge.example.test");
  assert.throws(() => assertAuthConfiguration(productionEnv({ AUTH_URL: "http://forge.example.test" })), /HTTPS/);
  assert.throws(() => assertAuthConfiguration(productionEnv({ AUTH_URL: "https://user:pass@forge.example.test" })), /credential-free/);
  assert.throws(() => assertAuthConfiguration(productionEnv({ AUTH_SECRET: "short" })), /at least 32/);
  assert.throws(() => assertAuthConfiguration(productionEnv({ FORGE_DEV_AUTH: "1" })), /forbidden/);
  assert.throws(
    () => assertAuthConfiguration(productionEnv({ GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "" })),
    /configured together/,
  );
  assert.equal(
    pinnedAuthRequestUrl("https://attacker.example/auth/callback?code=test", "https://forge.example.test").href,
    "https://forge.example.test/auth/callback?code=test",
  );
  assert.equal(
    pinnedAuthRequestUrl("//attacker.example/auth/signin", "https://forge.example.test").href,
    "https://forge.example.test/auth/signin",
  );
});

test("production object storage rejects development defaults and insecure implicit transport", () => {
  assert.throws(() => objectStorageConfigFromEnv({ NODE_ENV: "production" }), /endpoint and bucket/);
  const base = {
    NODE_ENV: "production",
    FORGE_OBJECT_ENDPOINT: "https://objects.example.test",
    FORGE_OBJECT_BUCKET: "forge-artifacts",
    FORGE_OBJECT_ACCESS_KEY_ID: "owner-access-key",
    FORGE_OBJECT_SECRET_ACCESS_KEY: "owner-secret-at-least-16",
  };
  assert.equal(objectStorageConfigFromEnv(base).endpoint, "https://objects.example.test");
  assert.throws(
    () => objectStorageConfigFromEnv({ ...base, FORGE_OBJECT_ENDPOINT: "http://objects.example.test" }),
    /must use HTTPS/,
  );
});

test("object download URLs are short-lived, owner-keyed, and forced to attachment semantics", async () => {
  const config = objectStorageConfigFromEnv({
    FORGE_OBJECT_ENDPOINT: "https://objects.example.test",
    FORGE_OBJECT_BUCKET: "forge-artifacts",
    FORGE_OBJECT_ACCESS_KEY_ID: "fixture-access",
    FORGE_OBJECT_SECRET_ACCESS_KEY: "fixture-secret-value",
  });
  const access = await presignObjectAccess(config, {
    action: "download",
    bucket: config.bucket,
    objectKey: "users/user-1/model.glb",
    expiresInSeconds: 120,
    now: new Date("2026-07-13T00:00:00.000Z"),
  });
  const url = new URL(access.url);
  assert.equal(access.method, "GET");
  assert.equal(access.objectKey, "users/user-1/model.glb");
  assert.equal(url.searchParams.get("response-content-disposition"), "attachment");
  assert.equal(url.searchParams.get("response-content-type"), "application/octet-stream");
  assert.equal(access.expiresAt, "2026-07-13T00:02:00.000Z");
  await assert.rejects(
    presignObjectAccess(config, {
      action: "upload",
      bucket: "another-bucket",
      objectKey: "users/user-1/model.glb",
      contentType: "model/gltf-binary",
      byteSize: 100,
    }),
    /configured boundary/,
  );
  await assert.rejects(
    presignObjectAccess(config, {
      action: "upload",
      bucket: config.bucket,
      objectKey: "users/user-1/model.glb",
      contentType: "model/gltf-binary",
    }),
    /declared byte size/,
  );
  await assert.rejects(
    deleteStoredObjects(config, [{ bucket: "another-bucket", objectKey: "users/user-1/model.glb" }]),
    /configured boundary/,
  );
  await assert.rejects(
    deleteStoredObjects(config, [{ bucket: config.bucket, objectKey: "../another-user/model.glb" }]),
    /object key is invalid/,
  );
});

test("ephemeral provider credentials never enter generation, model, or usage persistence", async () => {
  const credential = "sk-ephemeral-must-never-be-persisted";
  const persisted: unknown[][] = [];
  const now = "2026-07-13T00:00:00.000Z";
  const user: CurrentUser = {
    id: "usr-security-test",
    name: "Security Test",
    email: "security@example.test",
    image: null,
  };
  const db: GatewayDb = {
    async query(text, params = []) {
      persisted.push(params);
      if (text.includes("INSERT INTO model_registry")) {
        return {
          rows: [{
            id: "model-security-test",
            owner_user_id: user.id,
            source_artifact_id: "gen-security-test",
            status: "admitted",
            visibility: "private",
            name: "Security test rover",
            archetype: "rover",
            contract_hash: "c".repeat(64),
            contract: { meta: { id: "gen-security-test", name: "Security test rover", archetype: "rover" } },
            validator_report: { verdict: "admitted", results: [] },
            lineage: { sourceKind: "generation", provider: "anthropic" },
            created_at: now,
            updated_at: now,
          }],
          rowCount: 1,
        } as never;
      }
      return { rows: [], rowCount: 1 } as never;
    },
  };
  const request: GenerationRequest = {
    prompt: "security test rover",
    provider: "anthropic",
    anthropicApiKey: credential,
  };
  const response = {
    mode: "synthesis",
    catalogPolicy: "approved-review-rows-only",
    modelPins: [],
    context: {},
    verdict: "admitted",
    attempts: [{
      phase: "synthesize",
      modelId: "fixture-model",
      promptHash: "p".repeat(64),
      contractHash: "c".repeat(64),
      verdict: "admitted",
      diagnostics: [],
    }],
    contract: { meta: { id: "gen-security-test", name: "Security test rover", archetype: "rover" } },
    report: { verdict: "admitted", results: [] },
    blockedReasons: [],
  } as GenerationResponse;

  const generatedArtifact = await recordGeneratedArtifact(db, request, response, user.id);
  assert.ok(generatedArtifact);
  response.generatedArtifact = generatedArtifact;
  await recordUsageEvent(db, user, {
    eventKind: "generation",
    provider: request.provider ?? null,
    units: { attempts: response.attempts.length, verdict: response.verdict },
    idempotencyKey: `generation:${generatedArtifact.artifactId}:${generatedArtifact.contractHash}`,
  });
  await insertModelFromGeneration(db, user, request, response);

  const serialized = JSON.stringify(persisted);
  assert.doesNotMatch(serialized, new RegExp(credential));
  assert.doesNotMatch(serialized, /anthropicApiKey/);
  assert.match(serialized, /anthropic/);
});

test("production admin surfaces fail closed when the owner token is absent", async () => {
  const names = ["NODE_ENV", "AUTH_URL", "AUTH_SECRET", "FORGE_DEV_AUTH", "FORGE_REVIEW_TOKEN"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.NODE_ENV = "production";
  process.env.AUTH_URL = "https://forge.example.test";
  process.env.AUTH_SECRET = "a-production-auth-secret-longer-than-32-characters";
  delete process.env.FORGE_DEV_AUTH;
  delete process.env.FORGE_REVIEW_TOKEN;
  try {
    const app = buildServer({ rateLimitPolicy: null });
    const response = await app.inject({ method: "GET", url: "/v1/reviews" });
    assert.equal(response.statusCode, 401, response.body);
    await app.close();
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("gateway enforces per-surface rate limits, trusted origins, bounded bodies, and header-only BYO keys", async () => {
  const previousOrigin = process.env.FORGE_PUBLIC_ORIGIN;
  process.env.FORGE_PUBLIC_ORIGIN = "https://forge.example.test";
  try {
    const app = buildServer({
      rateLimitPolicy: {
        windowMs: 60_000,
        limits: { auth: 5, generation: 1, job: 5, object: 5, public: 5 },
      },
      rateLimitNow: () => 1_000,
    });
    const originDenied = await app.inject({
      method: "POST",
      url: "/v1/generate",
      headers: { origin: "https://evil.example.test" },
      payload: { prompt: "benign rover" },
    });
    assert.equal(originDenied.statusCode, 403, originDenied.body);

    const bodyKey = await app.inject({
      method: "POST",
      url: "/v1/generate",
      headers: { cookie: "authjs.session-token=forged-a" },
      payload: { prompt: "benign rover", provider: "anthropic", anthropicApiKey: "sk-must-not-enter-json" },
    });
    assert.equal(bodyKey.statusCode, 400, bodyKey.body);
    assert.doesNotMatch(bodyKey.body, /sk-must-not-enter-json/);

    const limited = await app.inject({
      method: "POST",
      url: "/v1/generate",
      headers: {
        cookie: "authjs.session-token=forged-b",
        "x-forge-anthropic-key": "sk-header-only-test",
      },
      payload: { prompt: "another benign rover", provider: "anthropic" },
    });
    assert.equal(limited.statusCode, 429, limited.body);
    assert.equal(limited.headers["retry-after"], "60");
    assert.doesNotMatch(limited.body, /sk-header-only-test/);
    await app.close();

    const bodyApp = buildServer({ rateLimitPolicy: null });
    let nested: unknown = { leaf: true };
    for (let index = 0; index < 20; index += 1) nested = { next: nested };
    const deep = await bodyApp.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract: nested },
    });
    assert.equal(deep.statusCode, 400, deep.body);
    assert.match(deep.body, /nesting limit/);
    await bodyApp.close();

    const relatedGenerationApp = buildServer({
      rateLimitPolicy: {
        windowMs: 60_000,
        limits: { auth: 5, generation: 1, job: 5, object: 5, public: 5 },
      },
      rateLimitNow: () => 1_000,
    });
    const courseAttempt = await relatedGenerationApp.inject({
      method: "POST",
      url: "/v1/courses/generate",
      payload: { prompt: "benign inspection course" },
    });
    assert.equal(courseAttempt.statusCode, 401, courseAttempt.body);
    const editLimited = await relatedGenerationApp.inject({
      method: "POST",
      url: "/v1/models/model-test/edit",
      payload: { prompt: "make the arms longer" },
    });
    assert.equal(editLimited.statusCode, 429, editLimited.body);
    await relatedGenerationApp.close();

    const authApp = buildServer({
      rateLimitPolicy: {
        windowMs: 60_000,
        limits: { auth: 1, generation: 5, job: 5, object: 5, public: 5 },
      },
    });
    const authFirst = await authApp.inject({
      method: "GET",
      url: "/auth/providers",
      headers: { cookie: "authjs.session-token=forged-auth-a" },
    });
    assert.equal(authFirst.statusCode, 200, authFirst.body);
    const authLimited = await authApp.inject({
      method: "GET",
      url: "/auth/providers",
      headers: { cookie: "authjs.session-token=forged-auth-b" },
    });
    assert.equal(authLimited.statusCode, 429, authLimited.body);
    assert.equal(authLimited.json().error, "rate limit exceeded");
    await authApp.close();
  } finally {
    if (previousOrigin === undefined) delete process.env.FORGE_PUBLIC_ORIGIN;
    else process.env.FORGE_PUBLIC_ORIGIN = previousOrigin;
  }
});
