# Golden artifact update: bind D67 exact grids to curve readback

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D67 coordinates new internal majors for exact SI bench-grid retention and independent
consumer curve reconstruction. The generated worker-artifact catalog must expose
catalog bundle 4.0.0, catalog-physics 2.0.0, curve-readback 1.0.0, co-design training-
authority 2.0.0, and engine batch/evidence 5.0.0 without reinterpreting older evidence.

## Source-of-truth change

`compatibility/compatibility.json` owns the registered versions. Rust owns exact
catalog point retention and the fixed-point curve recipe. Python independently owns
grid validation and full 101-point reconstruction before table-driven acceptance.
`contracts/documentation.json` owns the bounded local maturity description, and
`pnpm docs:contracts` generates both registered paths.

## Compatibility and user impact

This is a coordinated internal pre-release major with no automatic migration. Search-
plan 3.0.0, file-catalog row v1/v2 reads, inline multirotor bundle v2, ground bundle
v1, every public route/event/queue kind, and all prior D59-D66 artifacts remain
immutable. Consumers of the catalog training/batch path must move together. The real
EMAX row remains v1 and rejected; no sourced data, owner review, physical curve,
marketplace, tier-3, provider, build, hardware, or field authority changes.

## Evidence before

Protected parent `15cb53f03e2c98ffe78467b3ab5329fbfe262fcb` registers catalog bundle
3.0.0, catalog-physics/training-authority 1.0.0, and batch/evidence 4.0.0. It retains
table metadata and applicability but not each exact point or an independently
reconstructed consumer curve.

## Evidence after

Focused Rust CLI tests pass 3/3; Python catalog-bundle and co-design-batch tests pass
14/14; compatibility exact-matches twenty top-level surfaces. A controlled-synthetic
10.0/16.8 V × 0/0.5/1 grid retains every exact SI point, independently reconstructs
all 101 curve samples, refuses point/curve tampering, and refuses any fixed-point
lookup outside the measured voltage axis. The local dirty-tree v5
batch retains 7 + zero-dispatch cancel + 193 resume, evaluates 200/200, admits 97,
and returns two Pareto points/two held finalists. Generated documentation reports 81
routes, two event families, and seventeen worker families. All 44 required local
gates pass under Python 3.12.13, including 56 `forge-sim`, 39 Studio, 74 Gateway, and
248 worker tests, native/WASM parity, Brief-25 25/25, packaging, training/offline/MJX,
a second D67 200/97/two-point/two-held batch, and patch hygiene.

## Reviewer focus

Confirm every selected/rejected point retains exact voltage, throttle, thrust, and
current plus row/table/prop/source/confidence authority; Python independently checks
rectangularity, unique coordinates, endpoints, monotonicity, bilinear lookup, and all
101 fixed-point outputs including maximum-current normalization; rejected tables have
null selection and `tableDriven=false`;
training authority partitions cache/checkpoint/resume; older majors remain unchanged;
and controlled-synthetic coverage cannot be read as sourced propulsion evidence.

## Decision and task references

D67 owns the exact-grid/readback major; R36 owns false propulsion authority. P9-002
and P9-003 remain `[~]` pending protected D67 evidence, sourced and owner-reviewed
applicable data or explicit fallback, tier 3, the course-conditioned `>=3` front,
retained overnight/provider billing, and external acceptance.
