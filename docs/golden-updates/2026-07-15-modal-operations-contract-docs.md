# Golden artifact update: Modal operations contract

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`
- `docs/contracts/openapi.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

P7-013 adds the authenticated owner-scoped job-cancellation route and D46's byte-free
Modal operation/export metadata. The generated API and artifact references must match
the registered runtime, user-data compatibility boundary, and seventeenth worker
family exactly.

## Source-of-truth change

`packages/gateway/src/server.ts` registers `DELETE /v1/jobs/{jobId}`;
`contracts/documentation.json` owns its reviewed authentication, maturity, status,
and purpose metadata; and `compatibility/compatibility.json` advances the additive
user-data export from 1.3.0 to 1.4.0. `pnpm docs:contracts` regenerated the three
checked-in projections. They were not hand-edited.

## Compatibility and user impact

The new route is additive within the documented pre-1.0 gateway 0.2 line. It hides
cross-owner IDs, cancels only queued/running owner jobs, and is idempotent after
cancellation. User-data export 1.4.0 is an additive major-1 change: the owner's jobs
gain byte-free provider operation fields and a provider-call attempt dataset. Modal
tokens, raw provider input/output, retained ONNX bytes, and unrelated billing data
remain excluded.

## Evidence before

Protected parent `28191bfe12bd2e605767cc92a4943db33b3244ef` documented 76 runtime
routes, two event families, seventeen worker families, and user-data export 1.3.0.
It had no owner cancellation route or D46 provider-call export surface.

## Evidence after

`pnpm docs:contracts` reports 77 runtime routes, two event families, and seventeen
worker families. Focused Modal tests pass 31/31, the complete SB3/MuJoCo runtime file
passes 27/27, all 218 worker tests pass, and gateway tests pass 65/65 with the real
validator. `pnpm verify:docs-contracts`, `pnpm verify:compatibility`,
`pnpm verify:goldens`, migration acceptance, and the full local gate are required
before this candidate may be protected; final exact results are recorded in the
newest changelog and project-state entry.

## Reviewer focus

Verify the route is authenticated and owner-scoped, repeat cancellation cannot
double-refund, the generated schemas are additive, export 1.4 remains byte-free and
secret-free, worker kinds did not drift, and no public worker/provider surface was
introduced.

## Decision and task references

P7-013 owns this change under D38, D39, D46, R29, and compatibility policy 1.0.0.
