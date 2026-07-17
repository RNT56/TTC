# Golden artifact update: register D59 controlled co-design engine contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D59 additively registers the internal `forge-codesign-evaluation/1.0.0`,
`forge-codesign-native-evaluation/1.0.0`, and
`p9-engine-smoke-evidence/1.0.0` envelopes. Generated documentation must name their
exact snapshot/engine/lineage authority and must keep a bounded controlled smoke
distinct from CMA-ES, Optuna, overnight, trained-finalist, catalog, provider, build,
hardware, and field evidence.

## Source-of-truth change

`compatibility/compatibility.json` owns the three internal schema versions;
`contracts/documentation.json` owns the reviewed co-design artifact description;
`workers/forge_workers/codesign_runtime.py` and
`crates/forge-validate/src/codesign.rs` own the executable producer semantics.
`pnpm docs:contracts` regenerates both registered paths from those sources.

## Compatibility and user impact

This is additive internal evidence metadata. No public Gateway route, persisted
database format, event family, worker kind, ModelSpec, validator report, CLI/WASM
facade version, or user-data export version changes. Existing keyless co-design
fixture output remains readable. The strict D59 path accepts only its exact v1
envelope and cannot promote the fixture or controlled smoke to optimizer, overnight,
trained-policy, provider, build, hardware, or field maturity.

## Evidence before

Protected parent `59478640b0c59a54dcd0dbd4604cafb68c10c666` generated 81 routes,
two event families, seventeen worker families, and nineteen top-level compatibility
surfaces. It documented the keyless co-design fixture shape but no exact native/
Rapier/MuJoCo controlled-engine envelope.

## Evidence after

`pnpm docs:contracts` regenerates 81 routes, two event families, and seventeen worker
families; `pnpm verify:compatibility` passes all nineteen top-level surfaces and
cross-checks the three internal D59 versions. Focused Rust validator, Python worker,
Studio, and release-binary engine-smoke checks pass. All 41 required local gates pass
under Python 3.12.7 with 233 worker, 74 Gateway, and 39 Studio tests. Protected PR/
post-merge evidence remains required before a protection claim.

## Reviewer focus

Confirm the generated text identifies the gateway-owned admitted snapshot, sovereign
native validator, exact Rapier 0.33.0 and MuJoCo 3.9.0 meanings, strict lineage
recomputation, held tier 3, separate tier-0 runtime SLO, and every false nonclaim.
Confirm no public or persisted compatibility surface changed.

## Decision and task references

D59 owns the controlled-engine 1.0.0 meanings. P9-002 and P9-003 remain `[~]` until
the exact tree is protected and a separately versioned CMA-ES/Optuna 200-candidate
overnight run with trained finalists satisfies the remaining exit criteria.
