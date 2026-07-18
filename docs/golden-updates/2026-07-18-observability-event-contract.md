# Golden artifact update: define the D71 observability event contract

## Artifact IDs

- `observability-policy-and-schema`
- `golden-policy-registry`
- `api-event-artifact-docs`

## Changed paths

- `infra/observability/observability-policy.v1.json`
- `schema/forge-observability-event.schema.json`
- `docs/golden-artifact-registry.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`
- `fixture`

## Why this is intentional

OPS-003 needs a safe cross-process event boundary before any telemetry transport,
dashboard, alert, provider, job, worker, or Desktop integration can be trusted. The
repository previously had local error redaction but no versioned structured-event
allowlist or correlation authority.

## Source-of-truth change

D71 introduces `forge-observability-event/1.0.0` and a machine policy for trusted
server-generated request/trace roots, UTC/source/version binding, bounded route and
status attributes, deny-by-default sensitive fields, high-cardinality label refusal,
and explicit maturity nonclaims. The Gateway producer implements only the request-
completion subset.

## Compatibility and user impact

This is a new additive compatibility surface. Changing event identity, correlation
authority, field meanings, redaction exclusions, or metric-cardinality rules requires
a coordinated major. No existing API input changes. Clients may read the new opaque
response request ID and W3C trace root but cannot supply either as authority.

## Evidence before

Protected parent `b5c358aacb767bc131b106993da9e13fee5146ca` has no observability event
schema, cross-process compatibility surface, structured stdout sink, or trusted
request/trace response contract. Fastify logging is disabled and error-message
redaction alone cannot prove safe transport.

## Evidence after

Focused policy, compatibility, Gateway type/build/test, workflow-pin, generated-doc,
golden-policy, and patch-hygiene gates validate the new surface and adversarially
refuse client correlation claims, query/header/body/prompt fields, arbitrary
extensions, high-cardinality metric identifiers, and unsupported maturity claims.
All 48 required local gates pass under Python 3.12.13 with four policy tests, three
focused producer tests, 24 compatibility surfaces, twenty golden families, 87
immutable Action references, 39 Studio tests, 84 Gateway tests, 255 worker tests,
generated 82-route/two-event/seventeen-worker docs, and the unchanged 200/97/two-
Pareto/two-held recovery batch. The schema itself grants no backend, dashboard,
alert, managed, live, or production authority.

## Reviewer focus

Inspect the exact field allowlist, generated UUID/trace authority, raw-URL/query and
message exclusion, event byte/time bounds, schema/runtime/package version binding,
metric-label cardinality split, sink-failure isolation, and all explicit false
maturity flags.

## Decision and task references

D71 owns the new contract. OPS-003 moves to `[~]` at gateway contract/fixture
maturity only; worker/job/provider/Desktop propagation, metrics, traces, dashboards,
alert delivery, managed environments, and live proof remain open. QA-008 governs the
reviewed schema addition.
