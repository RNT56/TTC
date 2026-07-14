# Golden artifact update: add generated contract documentation

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/manifest.json`
- `docs/contracts/openapi.v0.2.0.json`
- `docs/contracts/events.v0.2.0.json`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

DOC-005 requires the registered gateway, event, and artifact contracts to have one
versioned generated reference instead of drifting across source, tests, and prose.

## Source-of-truth change

The gateway now exposes a read-only route-registration observer. The documentation
generator combines those actual Fastify/TypeBox registrations with the machine
compatibility matrix and reviewed `contracts/documentation.json` metadata. Generated
files are outputs, never an independent authority.

## Compatibility and user impact

This is additive documentation for the existing pre-1.0 0.2 gateway/event and worker
lines. No route, request constraint, response meaning, event, queue kind, artifact
payload, validator verdict, physical model, or live capability changes. Gateway API
and event versions become explicit compatibility-matrix surfaces.

## Evidence before

Protected parent `2dfc960` had 75 registered gateway routes, two event families,
twelve format/package domains, and sixteen worker queue kinds, but no generated
route-parity reference, versioned OpenAPI, event catalog, or artifact catalog.

## Evidence after

`pnpm docs:contracts`, `pnpm verify:docs-contracts`,
`pnpm verify:compatibility`, and `pnpm verify:goldens` generate and check exact runtime
route coverage, TypeBox request constraints, event emission, queue-kind equality,
examples, guide links, compatibility versions, and stale-output refusal. The complete
repository gate is recorded in the owning changelog entry.

## Reviewer focus

Inspect all route authentication classes and response statuses, the pre-1.0/open-
response boundary, event terminal/order semantics, worker queue/artifact mapping,
version linkage, migration/deprecation guidance, and fail-closed drift checks.

## Decision and task references

DOC-005 owns the work. D31 and compatibility policy 1.0.0 remain binding; no new
product authority or compatibility decision is created.
