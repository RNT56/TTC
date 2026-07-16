# Golden artifact update: register D53 recorder materialization contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`
- `docs/contracts/openapi.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D53 additively exposes three authenticated recorder-materialization routes, advances
user-data export from 1.4.0 to additive 1.5.0, and registers the independent
`forge-recorder-materialization/1.0.0` surface. Generated documentation must describe
the exact sanitized five-file request bounds and keep object integrity distinct from
archive semantics, device/field provenance, sharing, and training authority.

## Source-of-truth change

`packages/gateway/src/server.ts` owns the TypeBox request schemas and route registry;
`contracts/documentation.json` owns reviewed route summaries/auth/maturity;
`compatibility/compatibility.json` owns the seventeenth format domain and export 1.5.
`pnpm docs:contracts` regenerates all three registered paths from those sources.

## Compatibility and user impact

The gateway 0.2 line gains additive session-owned stage/list/complete routes. Archive
v1 remains byte-for-byte unchanged. Materialization v1 binds exactly five private
object roles and permanently false archive/device/field/sharing/training authority.
Export 1.5 additively includes the new row metadata and blob references but excludes
archive bytes, local paths, and presigned URLs. Existing major-1 export readers may
ignore the new dataset; older gateways may ignore migration 0025 rows but must retain
them and roll forward.

## Evidence before

Protected parent `237e46b48ced33e9a925e4a7b558ec0e5dd2a46c` generated 77 routes,
sixteen compatibility surfaces, and user-data export 1.4.0. It had no gateway route
or persisted format for the five Desktop recorder files.

## Evidence after

`pnpm verify:compatibility` passes 17/17 surfaces and `pnpm docs:contracts` generates
80 routes, two event families, and seventeen worker families. Seventeen locked
native tests, twenty-five Studio tests, and seventy gateway tests pass. The
clean-install plus 24-populated-predecessor Postgres matrix, user-data/lifecycle
assertions, 11/11 browser E2E flows, three-engine browser-support matrix, generated-
doc and golden checks, and all 40 repository gates pass under Python 3.12.7.
Protected PR and post-merge evidence remain required before a protection claim.

## Reviewer focus

Confirm the OpenAPI request is path-free, exact-five, size/hash/type bounded, and
private/nonclaim-only; the three session/fixture descriptions match runtime; the
new format surface does not reinterpret archive v1; and export 1.5 exposes metadata
without payloads, credentials, local paths, or presigned URLs.

## Decision and task references

D53 owns the object-integrity boundary. P8-003 stays `[~]`: sovereign gateway
streaming archive admission, protected evidence, production object operations,
reviewed adapter/device identity, suspend, lab, and field proof remain open.
