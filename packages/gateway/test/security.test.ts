import assert from "node:assert/strict";
import test from "node:test";
import type { GatewayDb } from "../src/db.js";
import { createJob, registerObjectBlob } from "../src/platform.js";
import {
  InMemoryRateLimiter,
  assertBoundedJson,
  assertPublicEndpointResolution,
  constantTimeEqual,
  fetchBoundedJson,
  isPrivateAddress,
  parseExternalHttpsUrl,
  redactSensitiveText,
} from "../src/security.js";

test("bounded JSON rejects depth, node, string, prototype, and byte bombs", () => {
  assert.doesNotThrow(() => assertBoundedJson({ ok: [1, "two"] }, "payload"));
  assert.throws(
    () => assertBoundedJson({ a: { b: { c: true } } }, "payload", { maxDepth: 2 }),
    /nesting limit/,
  );
  assert.throws(() => assertBoundedJson([1, 2, 3], "payload", { maxNodes: 2 }), /node limit/);
  assert.throws(() => assertBoundedJson("oversized", "payload", { maxStringBytes: 4 }), /oversized string/);
  assert.throws(() => assertBoundedJson(JSON.parse('{"__proto__":1}'), "payload"), /forbidden object key/);
  assert.throws(() => assertBoundedJson({ text: "123456" }, "payload", { maxBytes: 8 }), /byte limit/);
  assert.throws(() => assertBoundedJson({ value: Number.NaN }, "payload"), /non-finite/);
  assert.throws(() => assertBoundedJson({ value: new Date() }, "payload"), /non-JSON object/);
  assert.throws(() => assertBoundedJson({ value: undefined }, "payload"), /non-JSON value/);
});

test("external endpoint policy refuses credentials, redirects, private hosts, and host drift", () => {
  assert.equal(parseExternalHttpsUrl("https://api.anthropic.com/v1/messages", "provider", {
    allowedHosts: ["api.anthropic.com"],
  }).hostname, "api.anthropic.com");
  for (const candidate of [
    "http://example.com/provider",
    "https://user:pass@example.com/provider",
    "https://example.com/provider#fragment",
    "https://localhost/provider",
    "https://127.0.0.1/provider",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.4/provider",
    "https://[::1]/provider",
  ]) {
    assert.throws(() => parseExternalHttpsUrl(candidate, "provider"));
  }
  assert.throws(
    () => parseExternalHttpsUrl("https://example.com/provider", "provider", { allowedHosts: ["api.anthropic.com"] }),
    /allowlisted/,
  );
});

test("private address classifier covers loopback, link-local, RFC1918, and IPv6 local ranges", () => {
  for (const address of [
    "127.0.0.1",
    "10.2.3.4",
    "172.16.0.1",
    "192.168.1.2",
    "169.254.1.2",
    "198.51.100.4",
    "203.0.113.7",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("rate limiter is isolated by class and identity and resets deterministically", () => {
  let now = 1_000;
  const limiter = new InMemoryRateLimiter(
    {
      windowMs: 10_000,
      limits: { auth: 1, generation: 2, job: 2, object: 2, public: 2 },
    },
    () => now,
  );
  assert.equal(limiter.consume("auth", "ip-a").remaining, 0);
  assert.throws(() => limiter.consume("auth", "ip-a"), (error: unknown) => {
    const detail = error as Error & { statusCode?: number; retryAfterSeconds?: number };
    return detail.statusCode === 429 && detail.retryAfterSeconds === 10;
  });
  assert.equal(limiter.consume("auth", "ip-b").remaining, 0);
  assert.equal(limiter.consume("generation", "ip-a").remaining, 1);
  now = 11_000;
  assert.equal(limiter.consume("auth", "ip-a").remaining, 0);
});

test("DNS and bounded provider fetch reject rebinding, redirects, content drift, and oversized bodies", async () => {
  const url = new URL("https://provider.example.test/v1/result");
  await assert.rejects(
    assertPublicEndpointResolution(url, "provider", false, async () => [{ address: "127.0.0.1" }]),
    /private or unavailable/,
  );
  const resolveHost = async () => [{ address: "8.8.8.8" }];
  await assert.rejects(
    fetchBoundedJson(url.href, {}, {
      label: "provider",
      resolveHost,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://example.test" } }),
    }),
    /redirects are not allowed/,
  );
  await assert.rejects(
    fetchBoundedJson(url.href, {}, {
      label: "provider",
      resolveHost,
      maxResponseBytes: 1024,
      fetchImpl: async () => new Response("{}", {
        headers: { "content-type": "application/json", "content-length": "4096" },
      }),
    }),
    /byte limit/,
  );
  await assert.rejects(
    fetchBoundedJson(url.href, {}, {
      label: "provider",
      resolveHost,
      fetchImpl: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }),
    }),
    /unsupported content type/,
  );
  const result = await fetchBoundedJson(url.href, {}, {
    label: "provider",
    resolveHost,
    fetchImpl: async () => new Response('{"ok":true}', { headers: { "content-type": "application/problem+json" } }),
  });
  assert.deepEqual(result.value, { ok: true });
});

test("secret comparison is constant-shape and public redaction removes credential forms", () => {
  assert.equal(constantTimeEqual("owner-token", "owner-token"), true);
  assert.equal(constantTimeEqual("owner-token", "other-token"), false);
  const redacted = redactSensitiveText(
    "Bearer abc.def secret=sk-live-123456789 https://user:pass@example.test key-token-123456789",
  );
  assert.doesNotMatch(redacted, /abc\.def|sk-live|user:pass|token-123456789/);
});

test("direct job and object-library entry points enforce the same bounded payload contract", async () => {
  const db: GatewayDb = {
    async query() {
      throw new Error("bounded payload must fail before the database");
    },
  };
  const user = { id: "user-security", name: null, email: null, image: null };
  let nested: unknown = { leaf: true };
  for (let index = 0; index < 20; index += 1) nested = { next: nested };
  await assert.rejects(
    createJob(db, user, { kind: "codesign.evaluate", payload: nested }),
    /nesting limit/,
  );
  await assert.rejects(
    registerObjectBlob(db, user, {
      bucket: "forge-artifacts",
      purpose: "test",
      byteSize: Number.MAX_SAFE_INTEGER,
      metadata: {},
    }),
    /byte size/,
  );
  await assert.rejects(
    registerObjectBlob(db, user, {
      bucket: "forge-artifacts",
      purpose: "photoscan-source",
      contentType: "application/octet-stream",
      byteSize: 100,
      metadata: { originalName: "model.tar.gz" },
    }),
    /archive uploads are not accepted/,
  );
});
