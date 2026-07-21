import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateObservabilityPolicy } from "./observability-policy.mjs";

const policy = JSON.parse(readFileSync("infra/observability/observability-policy.v3.json", "utf8"));
const schema = JSON.parse(readFileSync("schema/forge-observability-event.v3.schema.json", "utf8"));

function messages(candidate) {
  return validateObservabilityPolicy(candidate, schema).join("\n");
}

test("D73 observability policy and event schema are coherent", () => {
  assert.deepEqual(validateObservabilityPolicy(policy, schema), []);
});

test("client-controlled correlation and unsafe payload fields fail closed", () => {
  const candidate = structuredClone(policy);
  candidate.headers.clientRequestIdAuthority = true;
  candidate.headers.clientTraceParentAuthority = true;
  candidate.denyFields = candidate.denyFields.filter((field) => !["prompt", "authorization", "query"].includes(field));
  const errors = messages(candidate);
  assert.match(errors, /clients must not control request IDs/);
  assert.match(errors, /clients must not control root traces/);
  assert.match(errors, /denyFields must be exactly/);
});

test("high-cardinality metric labels and unsupported maturity claims fail closed", () => {
  const candidate = structuredClone(policy);
  candidate.cardinality.forbiddenMetricLabels = candidate.cardinality.forbiddenMetricLabels.filter((field) => field !== "requestId");
  candidate.cardinality.allowedMetricLabels.push("userId");
  candidate.requiredContext = candidate.requiredContext.filter((field) => field !== "source.revision");
  candidate.trust.providerCallId = "caller-controlled";
  candidate.trust.deploymentId = "environment-name-only";
  candidate.maturity.dashboards = true;
  candidate.maturity.live = true;
  const errors = messages(candidate);
  assert.match(errors, /forbiddenMetricLabels must be exactly/);
  assert.match(errors, /allowedMetricLabels must be exactly/);
  assert.match(errors, /requiredContext must be exactly/);
  assert.match(errors, /providerCallId trust is invalid/);
  assert.match(errors, /deploymentId trust is invalid/);
  assert.match(errors, /dashboards must remain false/);
  assert.match(errors, /live must remain false/);
});

test("schema extension and runtime-bound markers are protected", () => {
  const driftedSchema = structuredClone(schema);
  driftedSchema.additionalProperties = true;
  driftedSchema.properties.correlation.additionalProperties = true;
  driftedSchema.$defs.workerAttemptCompletedAttributes.additionalProperties = true;
  driftedSchema.properties.serviceVersion.const = "unversioned";
  driftedSchema.properties.occurredAt.pattern = ".*";
  driftedSchema.$defs.providerCallId.pattern = ".*";
  driftedSchema.$defs.deploymentId.pattern = ".*";
  const environmentRule = driftedSchema.allOf.find(
    (rule) => JSON.stringify(rule.if?.properties?.environment?.enum) === JSON.stringify(["local", "ci"]),
  );
  environmentRule.else.properties.correlation.properties.deploymentId = { type: "null" };
  const providerRule = driftedSchema.allOf.find(
    (rule) => rule.if?.properties?.correlation?.properties?.providerCallId?.$ref === "#/$defs/providerCallId",
  );
  providerRule.then.properties.attributes.properties.provider.const = "local";
  const errors = validateObservabilityPolicy(policy, driftedSchema).join("\n");
  assert.match(errors, /deny top-level extensions/);
  assert.match(errors, /correlation schema must deny extensions/);
  assert.match(errors, /workerAttemptCompletedAttributes schema must deny extensions/);
  assert.match(errors, /service version is invalid/);
  assert.match(errors, /UTC timestamp pattern is invalid/);
  assert.match(errors, /providerCallId schema bound is invalid/);
  assert.match(errors, /deploymentId schema bound is invalid/);
  assert.match(errors, /deploymentId environment authority rule is invalid/);
  assert.match(errors, /providerCallId completion authority rule is invalid/);
});
