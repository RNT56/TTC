import assert from "node:assert/strict";
import test from "node:test";

import {
  OBSERVABILITY_EVENT_SCHEMA,
  createGatewayRequestObservation,
  createStdoutObservationSink,
  gatewayObservabilityRuntimeContext,
  newGatewayRequestCorrelation,
  serializeGatewayRequestObservation,
  traceParent,
  type GatewayRequestObservation,
} from "../src/observability.js";
import { buildServer } from "../src/server.js";

const revision = "a".repeat(40);

test("gateway creates trusted request and trace identities and ignores client claims", async () => {
  const observed: GatewayRequestObservation[] = [];
  const app = buildServer({
    observationSink: (event) => observed.push(event),
    observabilityRuntime: { environment: "sandbox", sourceRevision: revision },
  });
  try {
    const response = await app.inject({
      method: "GET",
      url: "/healthz?token=token-super-secret-value&email=person@example.test",
      headers: {
        "x-forge-request-id": "client-controlled-request-id",
        "x-request-id": "client-controlled-alias",
        traceparent: `00-${"b".repeat(32)}-${"c".repeat(16)}-01`,
        authorization: "Bearer token-super-secret-value",
      },
    });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers["x-forge-request-id"]), /^[0-9a-f-]{36}$/);
    assert.notEqual(response.headers["x-forge-request-id"], "client-controlled-request-id");
    assert.match(String(response.headers.traceparent), /^00-[a-f0-9]{32}-[a-f0-9]{16}-00$/);
    assert.notEqual(response.headers.traceparent, `00-${"b".repeat(32)}-${"c".repeat(16)}-01`);
    assert.equal(observed.length, 1);
    const event = observed[0];
    assert.equal(event.schemaVersion, OBSERVABILITY_EVENT_SCHEMA);
    assert.equal(event.attributes.route, "/healthz");
    assert.equal(event.environment, "sandbox");
    assert.equal(event.source.revision, revision);
    assert.equal(event.correlation.requestId, response.headers["x-forge-request-id"]);
    assert.equal(traceParent(event.correlation), response.headers.traceparent);
    const serialized = serializeGatewayRequestObservation(event);
    for (const forbidden of [
      "token-super-secret-value",
      "person@example.test",
      "client-controlled-request-id",
      "client-controlled-alias",
      "authorization",
      "?token=",
    ]) assert.equal(serialized.includes(forbidden), false, forbidden);
  } finally {
    await app.close();
  }
});

test("request observations are bounded, versioned, and deny arbitrary fields", () => {
  const event = createGatewayRequestObservation({
    runtime: gatewayObservabilityRuntimeContext({
      FORGE_DEPLOYMENT_ENVIRONMENT: "staging",
      FORGE_SOURCE_REVISION: revision,
    }),
    correlation: newGatewayRequestCorrelation(),
    method: "POST",
    route: "/v1/jobs/:id",
    statusCode: 503,
    durationMs: 12.34567,
    occurredAt: new Date("2026-07-18T13:00:00.000Z"),
  });
  assert.equal(event.level, "error");
  assert.equal(event.attributes.outcome, "server-error");
  assert.equal(event.attributes.durationMs, 12.346);
  assert.equal(event.clock.timezone, "UTC");
  assert.doesNotThrow(() => serializeGatewayRequestObservation(event));

  const withPayload = { ...event, payload: { prompt: "private prompt" } } as unknown as GatewayRequestObservation;
  assert.throws(() => serializeGatewayRequestObservation(withPayload), /top-level allowlist/);
  const withQuery = {
    ...event,
    attributes: { ...event.attributes, route: "/v1/jobs?secret=value" },
  };
  assert.throws(() => serializeGatewayRequestObservation(withQuery), /without a query/);
  const withActor = {
    ...event,
    correlation: { ...event.correlation, actorDigest: "raw-user-id" },
  } as unknown as GatewayRequestObservation;
  assert.throws(() => serializeGatewayRequestObservation(withActor), /not implemented/);
  const contradictoryStatus = {
    ...event,
    level: "info",
    attributes: { ...event.attributes, outcome: "success" },
  } as unknown as GatewayRequestObservation;
  assert.throws(() => serializeGatewayRequestObservation(contradictoryStatus), /contradicts statusCode/);
  const unboundManagedSource = {
    ...event,
    source: { ...event.source, revision: null },
  };
  assert.throws(() => serializeGatewayRequestObservation(unboundManagedSource), /require an exact source revision/);
  const invalidCalendarTime = {
    ...event,
    occurredAt: "2026-02-31T13:00:00.000Z",
  };
  assert.throws(() => serializeGatewayRequestObservation(invalidCalendarTime), /bounded UTC timestamp/);
});

test("stdout sink emits one validated JSON line and sink failure cannot alter the response", async () => {
  let output = "";
  const sink = createStdoutObservationSink({ write: (chunk) => { output += chunk; } });
  const event = createGatewayRequestObservation({
    runtime: { environment: "ci", sourceRevision: null },
    correlation: newGatewayRequestCorrelation(),
    method: "GET",
    route: "/healthz",
    statusCode: 200,
    durationMs: 1,
  });
  sink(event);
  assert.equal(output.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(output), event);

  const app = buildServer({ observationSink: () => { throw new Error("transport unavailable"); } });
  try {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    assert.equal(response.statusCode, 200);
  } finally {
    await app.close();
  }
});
