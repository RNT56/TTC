# Golden artifact update: source-bound offline training contract

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`
- `docs/contracts/openapi.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D45 promotes `train.offline-bc` from a worker-only legacy warmstart seam into an
explicit private queue contract with gateway consent/source authority and a native
BC-to-PPO policy output. The generated API enum and artifact catalog must expose the
additive queue kind and its two honest result families without inventing a public
worker endpoint or live-provider claim.

## Source-of-truth change

`packages/gateway/src/platform.ts` and `server.ts` own the additive job enum and
request schema. `compatibility/compatibility.json` owns the seventeenth queue kind and
three internal 1.0.0 schema versions. `contracts/documentation.json` owns the reviewed
artifact kind and maturity note. `pnpm docs:contracts` regenerated all three paths;
none was hand-edited.

## Compatibility and user impact

The pre-1.0 gateway/worker 0.2 line gains one additive internal queue member.
`train.offline-bc` requires local or Modal execution, one consented owned telemetry
log, and a supported admitted model/task. Legacy external warmstart output remains
held; the new native/external policy envelope remains subject to the existing
scorecard. Public route count, event families, ModelSpec, replay, flight/ground tensor,
and package versions do not change. Migration 0023 expands only `jobs_kind_check`.

## Evidence before

Protected parent `f0bb4e270db5f7c65bce3facac0dc3a550fa75ab` documented 76 runtime
routes, two event families, and sixteen worker queue families. The first regeneration
attempt correctly refused because `contracts/documentation.json` did not yet declare
the new compatibility-matrix queue kind.

## Evidence after

`pnpm docs:contracts` and `pnpm verify:docs-contracts` report 76 routes, two event
families, and seventeen worker families. `pnpm verify:compatibility` reports all 15
surfaces at policy 1.0.0. The complete 40-step repository gate passes with 65/65
gateway tests using the real validator, 188/188 Python 3.12 worker tests, and the
repeated two-task native offline smoke with exact same-seed dataset, warmstart-
parameter, and ONNX digests. Protected CI remains the merge authority.

## Reviewer focus

Verify that the queue kind is private and additive; the gateway—not the caller—owns
the tape/hash/snapshot; consent and model ownership are serialized; the catalog names
legacy held and native policy outputs honestly; task/tensor/sample/provider drift
holds export; and no route, event, public compatibility major, scorecard threshold,
or maturity claim changed.

## Decision and task references

D45 owns exact source-bound BC-to-PPO authority. P7-009 is protected and `[x]` through
PR #77/`2c7562d`, exact PR/post-merge CI/security, and independently checked clean
artifact `8359446894`. The current worker rejects
`recorded-device`; P8 owns recorder attestation and a reviewed admission version.
