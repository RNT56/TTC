# Golden artifact update: register D62 co-design runtime-authority contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`

## Drift classification

- `schema`

## Why this is intentional

D62/D63 additively register internal
`forge-codesign-proposal-runtime-authority/1.0.0` and coordinated
search-plan/search-evidence/engine-batch/batch-evidence 2.0.0 envelopes. Generated
documentation must describe exact-runtime scheduling and refusal without
reinterpreting the protected D60/D61 v1 artifacts or implying cross-platform hash
identity.

## Source-of-truth change

`compatibility/compatibility.json` owns the internal versions;
`contracts/documentation.json` owns the reviewed co-design description;
`workers/forge_workers/codesign_search.py` owns proposal-runtime authority, plan,
replay, and cache semantics; `workers/forge_workers/codesign_batch.py` owns
checkpoint/candidate runtime binding; and `scripts/codesign-platform-compare.mjs`
owns independent all-200 comparison. `pnpm docs:contracts` regenerates the
registered artifact catalog and reference.

## Compatibility and user impact

This is a coordinated internal major because replay, cache partitioning, scheduling,
checkpoint, and candidate lineage gain exact runtime identity. V1 artifacts remain
historical evidence and are not reinterpreted. No public Gateway route, event family,
queue kind, persisted database format, ModelSpec, validator report, CLI/WASM facade,
Studio result, user-data export, provider, catalog, training-policy, build, hardware,
or field format changes. V2 explicitly forbids heterogeneous resume and portable
cache authority.

## Evidence before

Protected D61 documents plan/batch/evidence 1.0.0 at platform-scoped maturity.
Downloaded Linux evidence and a clean Apple run differ at CMA-ES ordinals 20–99;
v1 rejects the foreign plan but records no numeric-runtime authority.

## Evidence after

The local v2 candidate self-hashes OS/kernel/machine/libc/byte order, Python
implementation/version/cache tag, pinned NumPy distribution/configuration/CPU/
BLAS/LAPACK identity, and pinned CMA-ES/Optuna distribution records. Plan and batch
caches, scheduler/checkpoint state, and every candidate bind that hash; foreign
runtime replay/evaluation/resume fails before work. Eleven focused tests, two
comparison-policy tests, and all 44 local gates with 244 worker, 74 Gateway, and 39
Studio tests pass. A dirty Apple-arm64 diagnostic completes all 200
candidates and preserves the prior front/finalists, but it is not acceptance
evidence. Clean exact-source, protected Linux, same-protected-source Apple,
independent comparison, and reconciliation evidence remain required.

## Reviewer focus

Confirm authority field sets and SHA-256 preimages are exact; dependency RECORD,
NumPy build/CPU/BLAS/LAPACK, Python, and platform identity cannot drift silently;
plan/batch cache keys partition on authority; candidates and checkpoints bind the
same hash; foreign replay/resume is refused before evaluation; and the comparison
artifact never grants portable cache, heterogeneous resume, tier-3, overnight,
provider, or trained-finalist authority.

## Decision and task references

D62 owns the portability prerequisite and D63 owns exact-runtime v2 semantics.
P9-006 remains `[~]` until clean protected same-source Linux/Apple evidence is
compared and reconciled. P9-002/P9-003 remain `[~]` for catalog-choice search,
retained overnight/provider operations, and actual tier-3 trained-finalist
scorecards.
