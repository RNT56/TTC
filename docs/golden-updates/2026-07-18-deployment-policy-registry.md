# Golden artifact update: register the D68 deployment contract

## Artifact IDs

- `golden-policy-registry`

## Changed paths

- `docs/golden-artifact-registry.json`

## Drift classification

- `fixture`

## Why this is intentional

D68 introduces a compatibility-governed deployment policy and manifest schema whose
environment, secret-reference, promotion, and authority meanings must not drift to
match ambient infrastructure. The golden inventory needs an explicit non-overlapping
family before either file can become deployment authority.

## Source-of-truth change

D68 and `docs/OPERATIONS.md` define the reviewed operating contract. The new
`deployment-policy-and-schema` registry family assigns the two machine files to
platform/release/security maintainers and requires deployment, compatibility, and
full verification.

## Compatibility and user impact

The registry change adds protection; it removes or reclassifies no existing family.
Future changes to deployment environment, configuration, secret-reference,
promotion, or authority semantics require compatibility and append-only golden
review. It creates no managed environment or live authority.

## Evidence before

Protected parent `65bbe351b9c70ac0576f92574e573e577a368c5e` has sixteen registered
families and no owner for a deployment policy or manifest schema, so such files
could not yet be reviewed as governed schema evidence.

## Evidence after

The registry parses with seventeen unique non-overlapping families. The golden
policy tests and `pnpm verify:goldens` validate current-plus-parent ownership and this
append-only record; `pnpm verify:deployment` and compatibility checks validate the
new family's focused contract.

## Reviewer focus

Confirm the two paths have one owner, the class is `schema`, compatibility review is
mandatory, existing family ownership is unchanged, and the verification commands
cover focused plus full repository behavior.

## Decision and task references

D68 owns the deployment authority contract; OPS-001 remains `[~]` until protected
evidence. QA-008 owns this inventory update, and R37 owns deployment-drift risk.
