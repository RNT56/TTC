# Golden artifact update: version D66 catalog performance grids

## Artifact IDs

- `api-event-artifact-docs`
- `boundary-adversarial-corpora`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`
- `evals/fuzz/boundaries/catalog-performance-grid.json`

## Drift classification

- `schema`
- `fixture`

## Why this is intentional

D66 closes the representation gap that prevented one catalog bench table from
carrying sourced voltage at every point. The generated artifact catalog must expose
file-catalog row 2.0.0 as an independently versioned compatibility surface, while a
new cross-language corpus pins legacy/current reads and malformed-grid refusals.

## Source-of-truth change

`compatibility/compatibility.json` owns the current and supported row majors. Rust
file-catalog admission and Python ETL independently enforce the exact v1/v2 shape,
grid, and authority rules. The corpus is the reviewed minimized boundary oracle;
`pnpm docs:contracts` copies the compatibility declaration into the generated
artifact reference and machine catalog.

## Compatibility and user impact

Missing or explicit row 1.0.0 remains readable as one table-declared-voltage sweep.
New 2.0.0 rows place voltage on every point and reject a table voltage. Unsupported
majors, mixed shapes, incomplete rectangles, duplicate coordinates, nonmonotonic
sweeps, and incomplete throttle domains fail closed. The checked-in EMAX row remains
v1 and inapplicable; no source data, component review, training bundle, public API,
event, queue kind, package version, marketplace approval, or physical authority is
upgraded.

## Evidence before

Protected parent `7d63512cb5a6645207d935af28df0a954d12d721` registered nineteen
top-level compatibility surfaces and eight boundary files with 89 cases. Its
file-catalog loader assigned one table scalar voltage to every point, so it could not
represent a non-degenerate range-spanning grid without unsupported table merging.

## Evidence after

All 44 required local non-database gates pass under Python 3.12.13, including Rust
fmt/Clippy/workspace tests, golden/generated-doc review, 39 Studio, 74 Gateway, 247
worker tests, Brief-25 25/25, packaging, training/offline/MJX, and the unchanged D65
200/97/two-point/two-held batch. Focused Rust simulation/file-catalog and Python ETL/
boundary tests pass; the corpus reports nine surfaces/99 stable cases and
compatibility exact-matches twenty surfaces. Migration 0027 separately passes on a
fresh PostgreSQL 16 cluster with exact populated-row/RPM preservation, primary-key/
table-identity proof, and incomplete-v2-authority refusal. Clean/every-populated-
predecessor `verify:db` and protected evidence remain required; the host's existing
Docker volume failed before migration with a PostgreSQL relmapper I/O error.

## Reviewer focus

Confirm missing-marker/v1 compatibility, strict v2 point voltage, finite bounded
rectangular grids, unique coordinates, exact throttle endpoints, monotonic
thrust/current, stable table IDs, positive confidence, HTTPS source, and Rust/Python
agreement. Confirm migration 0027 preserves old points as unattributed v1 rather than
fabricating metadata, distinct table identities cannot collide, and no v2 grid may
drive D65 training without a later exact-grid/curve-readback authority major.

## Decision and task references

D66 owns row-format and persisted-identity semantics. R36 owns false propulsion
authority. P3-010 and QA-007 gain compatibility/corpus coverage; P9-002 and P9-003
remain in progress pending sourced applicable data, downstream authority, tier 3, a
course-conditioned `>=3` front, retained overnight/provider billing, and external
acceptance.
