# Golden artifact update: register D60 co-design proposal-plan contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D60 additively registers internal `forge-codesign-search-plan/1.0.0` and
`p9-search-plan-evidence/1.0.0` envelopes. Generated documentation must distinguish
real pinned CMA-ES/TPE proposal generation from physical constraint evaluation,
engine execution, admission, Pareto, overnight completion, and every downstream
authority claim.

## Source-of-truth change

`compatibility/compatibility.json` owns both internal schema versions;
`contracts/documentation.json` owns the reviewed co-design artifact description;
`workers/forge_workers/codesign_search.py` owns the executable proposal and replay
semantics; and `scripts/codesign-search-plan-smoke.mjs` owns the exact-source evidence
wrapper. `pnpm docs:contracts` regenerates the registered artifact catalog.

## Compatibility and user impact

This is additive internal evidence metadata. No public Gateway route, persisted
database format, event family, queue kind, ModelSpec, validator report, CLI/WASM
facade version, or user-data export version changes. Existing fixture and D59
controlled-engine results remain readable. Plan v1 is not a `codesign.evaluate`
result and cannot be promoted to candidate, Pareto, overnight, trained-policy,
provider, build, hardware, or field maturity.

## Evidence before

Protected parent `9adb02fa11206c04c7e43e9ba141595d2c6e565e` generated 81 routes,
two event families, seventeen worker families, and nineteen top-level compatibility
surfaces. It documented the fixture and D59 engine-smoke envelopes but no exact
real-algorithm proposal-plan format.

## Evidence after

`pnpm docs:contracts` regenerates 81 routes, two event families, and seventeen worker
families; `pnpm verify:compatibility` passes all nineteen top-level surfaces and
cross-checks both internal D60 versions. Focused Python tests and the exact-source
smoke prove 100 CMA-ES plus 100 Optuna TPE proposals, unique candidate hashes,
deterministic replay, and false nonclaims. All 42 required local gates pass under
Python 3.12.7 with 238 worker, 74 Gateway, and 39 Studio tests; the pinned Python
dependency audit reports no known vulnerabilities. Protected PR/post-merge evidence
remains required before a protection claim.

## Reviewer focus

Confirm the generated text names actual `cmaes==0.13.0` and `optuna==4.9.0`, the
100/100 split, exact admitted snapshot, replace-only patch and candidate hashes, and
the synthetic no-engine-feedback acquisition. Confirm every physical, engine,
admission, Pareto, overnight-result, trained-finalist, catalog, provider, build,
hardware, and field claim remains false and no public or persisted compatibility
surface changed.

## Decision and task references

D60 owns the proposal-plan 1.0.0 meanings. P9-002 and P9-003 remain `[~]`; a
separately versioned engine consumer, retained scheduled run, admitted Pareto front,
and trained-finalist evidence still own the phase exit criteria.
