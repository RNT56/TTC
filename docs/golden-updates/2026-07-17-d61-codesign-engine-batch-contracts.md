# Golden artifact update: register D61 co-design engine-batch contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`

## Drift classification

- `schema`

## Why this is intentional

D61 additively registers internal `forge-codesign-engine-batch/1.0.0` and
`p9-engine-batch-evidence/1.0.0` envelopes. Generated documentation must distinguish
an exact-hash, checkpointed 200-candidate native/Rapier/MuJoCo run from D59's
three-candidate controlled smoke and D60's proposal-only algorithm plan.

## Source-of-truth change

`compatibility/compatibility.json` owns both internal schema versions;
`contracts/documentation.json` owns the reviewed co-design artifact description;
`workers/forge_workers/codesign_batch.py` owns exact plan consumption, candidate
evidence, checkpoint, recovery, cost, admission, Pareto, and finalist semantics;
and `scripts/codesign-engine-batch-smoke.mjs` owns the clean-source evidence wrapper.
`pnpm docs:contracts` regenerates the registered artifact catalog.

## Compatibility and user impact

This is additive internal evidence metadata. No public Gateway route, persisted
database format, event family, queue kind, ModelSpec, validator report, CLI/WASM
facade version, or user-data export version changes. D59 and D60 artifacts remain
readable. Batch v1 does not promote proposal plan v1, and measured local completion
is not an overnight/provider-billing claim. Tier-3 training, catalog choices, build,
hardware, and field authority remain held.

## Evidence before

Protected parent `d8fce83d2010f007f1ce354a02b1a4c219e30cef` generates 81 routes,
two event families, seventeen worker families, and nineteen top-level compatibility
surfaces. It documents the D59 engine-smoke and D60 proposal-plan envelopes, but no
separately versioned consumer of all 200 exact hashes.

## Evidence after

Focused tests prove exact plan replay, contiguous hash consumption, per-candidate
checkpoint persistence, interrupted-attempt fencing, zero-dispatch cancellation,
resume, derived admission/Pareto/finalists, cost/nonclaim integrity, and tamper
refusal. The clean-source smoke must evaluate all 200 hashes natively, retain
Rapier/MuJoCo evidence for eligible rows, keep at least three admitted Pareto points,
select three tier-3-held finalists, and preserve false overnight/provider/catalog/training/build/
hardware/field claims. All 43 local gates pass under Python 3.12.7 with 242 worker,
74 Gateway, and 39 Studio tests; clean exact-source and protected evidence remain to
be recorded only after they exist.

## Reviewer focus

Confirm the final candidate prefix exactly matches D60 proposal ordinals and hashes;
partial checkpoints expose no Pareto/finalists; cancellation advances no cursor;
resume never recomputes an authoritative prefix; only native-admitted candidates run
MuJoCo; complete admission and Pareto are independently derived; and measured local
runtime cannot be read as provider cost or overnight execution.

## Decision and task references

D61 owns the engine-batch/checkpoint 1.0.0 meanings. P9-002 and P9-003 remain `[~]`
until catalog-choice search, a retained overnight/provider schedule, and actual
tier-3 trained-finalist scorecards satisfy their remaining exit criteria.
