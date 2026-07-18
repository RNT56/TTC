# Golden artifact update: publish deployment compatibility metadata

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D68 adds deployment manifest 1.0.0 as the twenty-first compatibility surface. The
generated human and machine artifact catalogs must expose that new versioned contract
instead of leaving downstream reviewers with a stale twenty-surface inventory.

## Source-of-truth change

`compatibility/compatibility.json` now registers `deploymentManifest` with its schema,
policy, version field, supported major, and semantic version rule. The existing
`pnpm docs:contracts` generator reads that source and updates only the reviewed
compatibility portions of the two registered outputs.

## Compatibility and user impact

This is an additive surface. The 81 gateway routes, two event families, seventeen
worker families, and every prior compatibility surface keep their versions and
meaning. Consumers may discover deployment manifest 1.0.0; managed runtimes reject
unsupported majors. No HTTP route, event, queue kind, provider, data migration, or
live deployment changes through generated documentation.

## Evidence before

Protected parent `65bbe351b9c70ac0576f92574e573e577a368c5e` generates twenty
compatibility surfaces and has no deployment manifest entry. Editing generated files
directly would fail `pnpm verify:docs-contracts`.

## Evidence after

`pnpm docs:contracts` reports 81 routes, two event families, and seventeen worker
families while adding the twenty-first compatibility surface. The 21-surface
compatibility check, generated-document check, and golden policy validate source and
output agreement.

## Reviewer focus

Confirm only the additive deployment-manifest metadata and compatibility count
change; its version, supported major, schema/policy paths, and major semantics match
the machine matrix; and no route, event, worker kind, or existing format is altered.

## Decision and task references

D68 and OPS-001 own the deployment contract; DOC-005 remains complete because its
generator and coverage rules are unchanged. QA-008 governs this registered output.
