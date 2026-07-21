import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";

import {
  ACCEPTED_OBSERVABILITY_EVENT_SCHEMA,
  boundedJsonLines,
  createObservationDeliveryBatch,
  deliverObservationBatch,
  deliverObservationLines,
  serializeObservationDeliveryBatch,
  validateFixtureEndpoint,
  validateObservationDeliveryBatch,
  validateObservationEvent,
  validateObservabilityTransportPolicy,
} from "./observability-transport.mjs";

const policy = JSON.parse(
  readFileSync("infra/observability/observability-transport-policy.v1.json", "utf8"),
);
const batchSchema = JSON.parse(
  readFileSync("schema/forge-observability-delivery-batch.schema.json", "utf8"),
);
const eventSchema = JSON.parse(
  readFileSync("schema/forge-observability-event.v3.schema.json", "utf8"),
);

function gatewayEvent(overrides = {}) {
  const event = {
    schemaVersion: ACCEPTED_OBSERVABILITY_EVENT_SCHEMA,
    occurredAt: "2026-07-21T12:00:00.000Z",
    clock: { source: "system", timezone: "UTC" },
    level: "info",
    eventName: "gateway.request.completed",
    service: "gateway",
    serviceVersion: "0.2.0",
    environment: "ci",
    source: { component: "packages/gateway", revision: null },
    correlation: {
      requestId: "6f1fe0c0-9fb1-4a82-8f68-9d3a33f15e91",
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "0123456789abcdef",
      parentSpanId: null,
      actorDigest: null,
      jobId: null,
      attemptId: null,
      providerCallId: null,
      deploymentId: null,
    },
    attributes: {
      method: "GET",
      route: "/v1/models/:id",
      statusCode: 200,
      statusClass: "2xx",
      outcome: "success",
      durationMs: 1.25,
    },
  };
  return Object.assign(event, overrides);
}

function workerCompletionEvent(overrides = {}) {
  const event = {
    schemaVersion: ACCEPTED_OBSERVABILITY_EVENT_SCHEMA,
    occurredAt: "2026-07-21T12:00:00.000Z",
    clock: { source: "system", timezone: "UTC" },
    level: "info",
    eventName: "worker.job.attempt.completed",
    service: "workers",
    serviceVersion: "0.2.0",
    environment: "ci",
    source: { component: "workers/forge_workers", revision: null },
    correlation: {
      requestId: "6f1fe0c0-9fb1-4a82-8f68-9d3a33f15e91",
      traceId: "0123456789abcdef0123456789abcdef",
      spanId: "fedcba9876543210",
      parentSpanId: "0123456789abcdef",
      actorDigest: null,
      jobId: "job-observability-fixture",
      attemptId: "b5c2dd0c-7458-4f59-8af0-fd74519a379f",
      providerCallId: "modal-call-fixture",
      deploymentId: null,
    },
    attributes: {
      task: "train.policy",
      provider: "modal",
      attempt: 1,
      outcome: "succeeded",
      durationMs: 14.5,
      errorCode: null,
      retryAfterSeconds: null,
    },
  };
  return Object.assign(event, overrides);
}

test("D74 transport policy and delivery-batch schema are coherent", () => {
  assert.deepEqual(validateObservabilityTransportPolicy(policy, batchSchema, eventSchema), []);
  const drifted = structuredClone(policy);
  drifted.endpoint.authority = "any-host";
  drifted.limits.automaticRetries = 3;
  drifted.limits.durableSpoolBytes = 1_000_000;
  drifted.lifecycle.productAuthority = "required-for-job-completion";
  drifted.maturity.externalCollector = true;
  const errors = validateObservabilityTransportPolicy(drifted, batchSchema, eventSchema).join("\n");
  assert.match(errors, /loopback HTTP only/);
  assert.match(errors, /retries must remain disabled/);
  assert.match(errors, /durable spool must remain disabled/);
  assert.match(errors, /authority-independent/);
  assert.match(errors, /externalCollector must remain false/);
});

test("strict Gateway and worker v3 events form one exact bounded delivery batch", () => {
  const gateway = gatewayEvent();
  const worker = workerCompletionEvent();
  assert.deepEqual(validateObservationEvent(gateway), []);
  assert.deepEqual(validateObservationEvent(worker), []);
  const batch = createObservationDeliveryBatch([gateway, worker], {
    batchId: "b5c2dd0c-7458-4f59-8af0-fd74519a379f",
    createdAt: new Date("2026-07-21T12:00:01.000Z"),
  });
  assert.deepEqual(validateObservationDeliveryBatch(batch), []);
  assert.equal(batch.eventCount, 2);
  assert.equal(JSON.parse(serializeObservationDeliveryBatch(batch)).events[0].attributes.route, "/v1/models/:id");
});

test("unversioned, extended, queried, oversized, and overfull input fails before delivery", async () => {
  const legacy = gatewayEvent({ schemaVersion: "forge-observability-event/2.0.0" });
  assert.match(validateObservationEvent(legacy).join("\n"), /schemaVersion is unsupported/);

  const extended = gatewayEvent();
  extended.authorization = "seed-secret-never-deliver";
  assert.match(validateObservationEvent(extended).join("\n"), /top-level allowlist/);

  const queried = gatewayEvent();
  queried.attributes.route = "/v1/models?token=seed-secret-never-deliver";
  assert.match(validateObservationEvent(queried).join("\n"), /route is invalid/);

  const forgedProvider = workerCompletionEvent();
  forgedProvider.attributes.provider = "local";
  assert.match(
    validateObservationEvent(forgedProvider).join("\n"),
    /providerCallId is limited to persisted Modal train.policy completion/,
  );

  assert.throws(
    () => createObservationDeliveryBatch(Array.from({ length: 33 }, () => gatewayEvent())),
    /events must contain 1\.\.32 entries/,
  );

  const oversized = `${"x".repeat(4_097)}\n`;
  await assert.rejects(
    async () => {
      for await (const _line of boundedJsonLines(Readable.from([oversized]))) {
        assert.fail("oversized line must not be yielded");
      }
    },
    /line exceeds 4096 bytes/,
  );
});

test("fixture endpoint rejects remote, credentialed, query, fragment, and privileged targets", () => {
  assert.match(validateFixtureEndpoint("https://127.0.0.1:8443/collect").join("\n"), /loopback HTTP/);
  assert.match(validateFixtureEndpoint("http://localhost:8080/collect").join("\n"), /exact loopback host/);
  assert.match(validateFixtureEndpoint("http://user:pass@127.0.0.1:8080/collect").join("\n"), /credentials are forbidden/);
  assert.match(validateFixtureEndpoint("http://127.0.0.1:8080/collect?token=secret").join("\n"), /query is forbidden/);
  assert.match(validateFixtureEndpoint("http://127.0.0.1:8080/collect#secret").join("\n"), /fragment is forbidden/);
  assert.match(
    validateFixtureEndpoint("http://127.0.0.1:80/collect").join("\n"),
    /explicit non-privileged port/,
  );
});

test("one loopback POST delivers exact bytes without credentials and does not read a response body", async (t) => {
  let observed = null;
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      observed = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      response.statusCode = 204;
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/fixture-collector`;
  const batch = createObservationDeliveryBatch([gatewayEvent()]);
  const result = await deliverObservationBatch(batch, { endpoint });
  assert.deepEqual(result, {
    outcome: "accepted",
    statusCode: 204,
    batchId: batch.batchId,
    eventCount: 1,
  });
  assert.equal(observed.method, "POST");
  assert.equal(observed.url, "/fixture-collector");
  assert.equal(observed.headers.authorization, undefined);
  assert.equal(observed.headers.cookie, undefined);
  assert.equal(observed.headers["content-type"], "application/json");
  assert.equal(
    observed.headers["x-forge-observability-contract"],
    "forge-observability-delivery-batch/1.0.0",
  );
  assert.deepEqual(JSON.parse(observed.body), batch);
});

test("redirect, non-2xx, and timeout fail once without retry or authority mutation", async () => {
  const event = gatewayEvent();
  const before = structuredClone(event);
  const batch = createObservationDeliveryBatch([event]);
  let calls = 0;
  const redirect = async (_endpoint, options) => {
    calls += 1;
    assert.equal(options.redirect, "manual");
    return { status: 302, body: { cancel: async () => {} } };
  };
  await assert.rejects(
    deliverObservationBatch(batch, {
      endpoint: "http://127.0.0.1:8080/collect",
      fetchImpl: redirect,
    }),
    /refused status 302/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(event, before);

  const unavailable = async () => {
    calls += 1;
    return { status: 503, body: { cancel: async () => {} } };
  };
  await assert.rejects(
    deliverObservationBatch(batch, {
      endpoint: "http://127.0.0.1:8080/collect",
      fetchImpl: unavailable,
    }),
    /refused status 503/,
  );
  assert.equal(calls, 2);

  const hangsUntilAbort = async (_endpoint, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("seed-secret-never-reflect")), { once: true });
  });
  await assert.rejects(
    deliverObservationBatch(batch, {
      endpoint: "http://127.0.0.1:8080/collect",
      fetchImpl: hangsUntilAbort,
      timeoutMs: 5,
    }),
    /failed before a bounded response/,
  );

  await assert.rejects(
    deliverObservationBatch(batch, {
      endpoint: "http://127.0.0.1:8080/collect",
      fetchImpl: async () => ({
        status: 200,
        body: { cancel: async () => { throw new Error("seed-secret-never-reflect"); } },
      }),
    }),
    /failed while discarding its response/,
  );
  await assert.rejects(
    deliverObservationBatch(batch, {
      endpoint: "http://127.0.0.1:8080/collect",
      fetchImpl: async () => ({
        status: 200,
        body: { cancel: async () => new Promise(() => {}) },
      }),
      timeoutMs: 5,
    }),
    /failed while discarding its response/,
  );
});

test("JSON-line delivery flushes fixed 32-event batches and stops on first failure", async () => {
  const bodies = [];
  const accepted = async (_endpoint, options) => {
    bodies.push(JSON.parse(options.body));
    return { status: 202, body: { cancel: async () => {} } };
  };
  const lines = Array.from({ length: 33 }, () => JSON.stringify(gatewayEvent()));
  const result = await deliverObservationLines(lines, {
    endpoint: "http://127.0.0.1:8080/collect",
    fetchImpl: accepted,
  });
  assert.deepEqual(result, { deliveredBatches: 2, deliveredEvents: 33 });
  assert.deepEqual(bodies.map((body) => body.eventCount), [32, 1]);

  let calls = 0;
  const failed = async () => {
    calls += 1;
    return { status: 500, body: { cancel: async () => {} } };
  };
  await assert.rejects(
    deliverObservationLines(lines, {
      endpoint: "http://127.0.0.1:8080/collect",
      fetchImpl: failed,
    }),
    /refused status 500/,
  );
  assert.equal(calls, 1);

  await assert.rejects(
    deliverObservationLines([], {
      endpoint: "http://127.0.0.1:8080/collect",
      fetchImpl: accepted,
    }),
    /input refused: no events/,
  );
});
