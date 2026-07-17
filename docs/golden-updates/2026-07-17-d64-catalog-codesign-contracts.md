# Golden artifact update: register D64 catalog-backed co-design contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D64 replaces the internal synthetic-profile co-design plan/batch v2 line with
coordinated v3 catalog-backed semantics. The generated artifact catalog must expose
native catalog evaluation 2.0.0, catalog proof and catalog-choice authority 1.0.0,
and plan/evidence/batch/evidence 3.0.0 without reinterpreting historical v1/v2
artifacts.

## Source-of-truth change

`compatibility/compatibility.json` owns the registered internal versions.
`crates/forge-validate/src/codesign.rs` and `file_catalog.rs` own sovereign catalog
admission, raw-row authority, and equipped-only native proof. The v3 worker search
and batch modules own exact choice materialization, dual catalog/runtime authority,
checkpoint/recovery, and candidate evidence. Contract generation copies those
versions into `docs/contracts/artifacts.v0.2.0.json`.

## Compatibility and user impact

This is a coordinated internal major for catalog choice, replay, cache, checkpoint,
and candidate lineage. Search/batch v1/v2 and native evaluation v1 remain historical
evidence. No public Gateway route, event family, queue kind, persisted database
format, ModelSpec version, validator report, CLI/WASM facade version, Studio result,
user-data export, provider, training-policy, build, hardware, or field format changes.
The additive CLI `--catalog` admission option does not change training-bundle 2.0.0
physics, which remains an inline mirror.

## Evidence before

Protected parent `e8480a8d568c38ce4ce5d188e912eff57e93c507` registers exact-runtime
search-plan/search-evidence and engine-batch/batch-evidence 2.0.0 plus proposal-
runtime authority 1.0.0. It has no registered catalog-choice authority, catalog
proof, or catalog-native evaluation major, and synthetic electrical profiles do not
identify a purchasable equipped revision.

## Evidence after

Focused search/batch tests pass 12/12 and all 246 worker tests pass under Python
3.12.13. Rust formatting, workspace Clippy with warnings denied, all workspace tests,
and doctests pass. Compatibility checks all nineteen top-level surfaces and generated
documentation verifies 81 routes, two event families, and seventeen worker families.
The independent v3 plan smoke emits exact 100 CMA-ES plus 100 TPE proposals across
both pinned batteries. The dirty-tree local batch evaluates 200/200 through catalog-
aware native/Rapier/MuJoCo, admits 197, retains 7 + zero-dispatch cancel + 193 resume,
and returns the expected two-choice/two-point front with two held finalists. This is
implementation evidence, not protected or `>=3` phase-exit evidence. The complete
`pnpm verify` rerun passes all 44 required local gates with 74 Gateway and 39 Studio
tests plus the 246-worker suite above.

## Reviewer focus

Confirm the cross-language catalog-authority preimage is identical; only the D32
equipped revision contributes catalog proof and physics; exact pin, row hash, mass,
capacity, discharge, confidence, review, license, and export fields cannot drift;
foreign catalog/runtime replay and resume fail before work; partial checkpoints have
no Pareto/finalists; and the two-point D64 fixture cannot be cited as the separate P9
`>=3`, catalog-native MuJoCo, tier-3, overnight/provider, marketplace, build, hardware,
field, or external-acceptance result.

## Decision and task references

D64 owns the coordinated catalog-backed majors and R35 owns false catalog/marketplace
authority risk. P9-002 and P9-003 remain `[~]` pending protection, a `>=3` physical
front, catalog-native bundle physics, actual tier-3 scorecards, retained overnight/
provider billing, and external acceptance.
