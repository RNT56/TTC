# Golden artifact update: register D54 recorder admission contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`
- `docs/contracts/openapi.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D54 additively exposes one authenticated recorder-admission route, advances
user-data export from 1.5.0 to additive 1.6.0, and registers independent
`forge-recorder-admission/1.0.0` semantics with exact verification and object-backed
telemetry-reference child schemas. The generated documentation must distinguish
sovereign archive semantics from D53 object integrity and from device, field,
sharing, or training authority.

## Source-of-truth change

`packages/gateway/src/server.ts` owns the TypeBox request schema and route registry;
`contracts/documentation.json` owns the reviewed route summary/auth/maturity;
`compatibility/compatibility.json` owns the eighteenth format domain and export 1.6.
`pnpm docs:contracts` regenerates all three registered paths from those sources.

## Compatibility and user impact

Gateway 0.2 gains one additive session-owned admission action. Archive v1 and D53
materialization v1 remain byte-for-byte and meaning-for-meaning unchanged. Admission
v1 binds a sovereign native verification report, one exact materialization, one
owned admitted model, and one bounded object-backed telemetry reference. Device,
field, sharing, and training authority remain false. Export 1.6 additively includes
the admission row and verification metadata without archive bytes, temporary paths,
credentials, or presigned URLs. Existing major-1 readers may ignore the dataset.

## Evidence before

Protected parent `dcc6f2756cd49f872531351ad921200c2a96d83e` generated 80 routes,
seventeen compatibility surfaces, and user-data export 1.5.0. It had no server-side
archive-semantics proof or telemetry-admission row.

## Evidence after

`pnpm docs:contracts` generates 81 routes, two event families, eighteen
compatibility surfaces, and seventeen worker families. Focused Rust, gateway,
Studio, migration, export/deletion, training-refusal, and Postgres acceptance pass.
The complete local gate plus protected PR and post-merge evidence remain required
before a protection claim.

## Reviewer focus

Confirm the route accepts only an explicit model ID; all five private objects stream
through bounded temporary files and the sovereign native verifier; the D53 row stays
false for semantics; Postgres stores only the bounded reference and report; object-
backed logs cannot enter D45 training; and every device/field/sharing/training
nonclaim remains false in code, schema, UI, export, and deletion paths.

## Decision and task references

D54 owns sovereign archive admission. P8-003 stays `[~]`: reviewed real-adapter and
device/session identity, suspend, production object operations, lab, field, ghost,
system-ID, and recorded-device training evidence remain open.
