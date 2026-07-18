# Golden artifact update: define the D68 deployment policy and manifest schema

## Artifact IDs

- `deployment-policy-and-schema`

## Changed paths

- `infra/deployment/deployment-policy.v1.json`
- `schema/forge-deployment-manifest.schema.json`

## Drift classification

- `schema`

## Why this is intentional

OPS-001 requires one inspectable source for supported topology, environments,
configuration classification, secret rotation/reference rules, accountable owners,
promotion edges, and authority ceilings. The existing source-mounted Compose profile
and scattered runtime variables were explicitly local/prod-like and could not supply
that contract.

## Source-of-truth change

D68 defines the first single-region shape and direct build-once promotion ladder.
The policy supplies exact requirements and the Draft 2020-12 schema supplies the
strict non-secret manifest shape. `scripts/deployment-policy.mjs` validates both,
checks source runtime-variable coverage, and enforces manifest/promotion semantics;
gateway and worker startup independently bind exact manifest bytes.

## Compatibility and user impact

This adds `forge-deployment-manifest/1.0.0` as a new public/persisted compatibility
surface without changing an existing input. Manifest consumers must reject unknown
majors. Literal secret values are outside the format; promotions keep exact source,
tree, artifact, SBOM, and provenance identity while using target-specific versioned
secret references. The schema or an active manifest alone does not prove a deployed,
live, hardware, field, or field-proven environment.

## Evidence before

Protected parent `65bbe351b9c70ac0576f92574e573e577a368c5e` has no deployment manifest
schema, policy gate, runtime-variable registry, direct-promotion validator, or exact
managed startup binding. `infra/docker-compose.yml` has development defaults and
source mounts and is not production evidence.

## Evidence after

Eleven deterministic policy tests admit a complete sandbox manifest and exact
sandbox-to-staging promotion while refusing literal/unversioned/cross-environment
secrets, missing owners/gates, authority inflation, dirty source, skipped stages,
rebuilds, and secret-reference reuse. `pnpm verify:deployment`, the 21-surface
compatibility checker, Gateway typecheck, and all 77 Gateway tests pass locally.
Python 3.12.13 passes all 251 worker tests. The complete `pnpm verify` passes all 45
required local gates, including exact native/WASM parity, Brief-25 25/25, packaging,
four-morphology/offline/MJX training, exact 200-candidate recovery, and cumulative
patch hygiene. No managed environment is claimed.

## Reviewer focus

Inspect environment ceilings and required gates, configuration category
completeness/disjointness, non-self-referential bootstrap, secret reference and
emergency rotation rules, direct promotion/no-rebuild checks, owner/signoff
requirements, production forbidden values, runtime startup bindings, forward-only
database rollback, and permanent field-authority nonclaim.

## Decision and task references

D68 owns this new surface. OPS-001 is `[~]` pending protected proof; OPS-002 is the
next dependency. R37 covers configuration/promotion drift and false production
claims; QA-008 governs this reviewed schema addition.
