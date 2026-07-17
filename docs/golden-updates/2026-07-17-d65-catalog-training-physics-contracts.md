# Golden artifact update: register D65 catalog training physics contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`

## Drift classification

- `schema`

## Why this is intentional

D65 adds separate internal majors for catalog-bound multirotor physics rather than
reinterpreting inline training bundle v2, ground bundle v1, or D64 batch v3. The
generated artifact catalog must expose catalog training bundle 3.0.0, catalog
physics and co-design training authority 1.0.0, and batch/evidence 4.0.0.

## Source-of-truth change

`compatibility/compatibility.json` owns the registered versions. Rust training and
MJCF exporters own exact equipped catalog mass/inertia, complete catalog/row
authority, bench-table applicability, and named fallback semantics. Python owns
strict bundle/MuJoCo/batch readback and exact mass/hash/applicability validation.
Contract generation copies those versions into the artifact catalog.

## Compatibility and user impact

This is a coordinated internal major for catalog mass/inertia, table applicability,
training hashes, and per-rollout lineage. Inline bundle v2, ground bundle v1, batch
v3, native evaluation v2, every public route/event/queue kind, ModelSpec, validator
report, CLI/WASM facade, persisted database format, provider, build, hardware, and
field format remain unchanged. A rejected catalog table remains inspectable but
cannot drive the curve.

## Evidence before

Protected parent `a3b868d74d9de1ee67db5ff26cfcdbb9d9452293` registers D64 catalog
search/batch v3. Its tier-2 path uses bundle v2 inline-mirror physics and does not
compile equipped catalog mass/inertia or record bench-table applicability.

## Evidence after

`forge-sim` passes 55 unit plus 5 boundary-corpus tests; focused Rust CLI tests pass
3/3 and focused Python bundle/batch tests pass 13/13. Manual pinned MuJoCo
compilation exactly closes the 0.769 kg bundle mass.
One dirty-tree local v4 smoke retains 7 + zero-dispatch cancel + 193 resume,
evaluates 200/200 native/Rapier/MuJoCo rows, admits 97, and returns two held battery
points. Both catalog physics variants retain the D12 25.2 V/5×4.6 table but record
`usedForCurve=false` because it does not cover the 14.8–16.8 V range or match the
5×4.3 prop. All 44 required local gates pass under Python 3.12.13 with 246 worker,
74 Gateway, and 39 Studio tests. Protected evidence remains to be run and reconciled.
The current file-catalog row assigns one declared voltage to every point in a table;
applicable grid ingestion remains a separate versioned row/loader change and is not
part of this golden update.

## Reviewer focus

Confirm catalog mass and per-mount inertia close exactly through serialized bundle
and compiled MuJoCo; the worker independently recomputes uniform-solid tensors and
mount-centered COM; complete file/row hashes and D32 equipped-only semantics cannot
drift; collisions remain contract-owned; table voltage coverage, diameter×pitch, and
a unique applicable match are mandatory; rejected tables carry non-empty reasons and
never drive curves; inline fallbacks are exact and hash-bound; and v1/v2/v3 history is not reinterpreted.
No applicable catalog-thrust, trained-finalist, overnight/provider, marketplace/live
catalog, build, hardware, field, or external claim may be inferred.

## Decision and task references

D65 owns the catalog-bound bundle/applicability major. P9-002 and P9-003 remain `[~]`
pending protection/reconciliation, applicable reviewed bench data or explicit
fallback retention, a course-conditioned `>=3` front, trained-finalist scorecards,
overnight/provider billing, and external acceptance.
