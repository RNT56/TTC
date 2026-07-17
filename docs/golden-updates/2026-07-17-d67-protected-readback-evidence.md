# Golden artifact update: record protected D67 readback maturity

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

PR #121 protects D67's already-reviewed exact-grid retention and independent
curve-readback consumer. The generated worker-artifact catalog must stop describing
that consumer as local/unprotected while preserving the same bounded platform-local
maturity and every physical nonclaim.

## Source-of-truth change

`contracts/documentation.json` advances only the maturity label from local to
protected for the existing D67 consumer. The compatibility versions, worker queue
surface, artifact discriminator, runtime behavior, and catalog rows are unchanged.
`pnpm docs:contracts` regenerates both registered paths.

## Compatibility and user impact

No schema, route, event, queue, package, migration, or read policy changes. Existing
catalog bundle 4.0.0, catalog-physics 2.0.0, curve-readback 1.0.0, training-authority
2.0.0, and batch/evidence 5.0.0 remain exact. This is evidence-state metadata only;
it grants no sourced/applicable thrust, owner review, portable recovery, overnight/
provider billing, trained-finalist, marketplace, build, hardware, field, or external
authority.

## Evidence before

The implementation tree recorded D67 as local pending exact PR and protected-main
proof. Its controlled-synthetic tests and dirty-tree batch already passed, but they
could not establish a protected evidence boundary.

## Evidence after

Exact head `3bd22bc`, reviewed merge/tree `e4c836c`/`1d8f50f`, protected squash
`08e880b`, PR CI/security `29580572145`/`29580572132`, and post-merge CI/security
`29581121537`/`29581121450` pass. All 44 local gates and all 11 PR checks are green.
Protected artifact `8407177912` binds a clean `08e880b` checkout, repeats exact 7 +
zero-dispatch cancel + 193 resume, evaluates 200/200, admits 97, and returns two
Pareto points/two held finalists. Its file/result hashes are
`ab956b4a…de06`/`137a066f…16645`.

## Reviewer focus

Confirm the generated maturity says protected platform-local consumer/readback,
not physical or provider maturity. Confirm older D59-D66 claims remain immutable,
the current real table remains v1/rejected, the controlled-synthetic grid is not
catalog data, and every nonclaim remains explicit.

## Decision and task references

D67 and R36 remain authoritative. P9-002 and P9-003 remain `[~]` pending sourced and
owner-reviewed applicable data or explicit fallback, tier 3, the course-conditioned
`>=3` front, retained overnight/provider billing, and external acceptance.
