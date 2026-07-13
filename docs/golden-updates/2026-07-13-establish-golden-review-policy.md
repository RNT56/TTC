# Golden artifact update: establish the review-policy registry

## Artifact IDs

- `golden-policy-registry`

## Changed paths

- `docs/golden-artifact-registry.json`

## Drift classification

- `fixture`

## Why this is intentional

QA-008 requires a complete machine-owned inventory before artifact re-pins can be
enforced consistently across local work, pull requests, and protected main.

## Source-of-truth change

The repository now names fourteen artifact families, their owners, source-of-truth
boundaries, regeneration procedures, focused verification, and compatibility review
requirements. The policy code unions the parent and changed registries so removing a
family cannot hide a protected artifact change in the same patch.

## Compatibility and user impact

No product format, runtime behavior, physics model, verdict, or public artifact changes.
Contributors must now attach review evidence when changing registered expectations.

## Evidence before

Protected parent `4fe0df6` had only prose warnings against casual re-pinning and no
machine inventory, immutable-oracle rejection, or patch-level review-record check.

## Evidence after

Focused policy tests cover required records, valid coverage, immutable inputs,
append-only history, placeholders, unrelated paths, parent-registry protection,
classification matching, record-directory redirection, and ownership overlap. The
focused policy, workflow-pin, compatibility, documentation, and full repository gates
are recorded in the owning changelog entry.

## Reviewer focus

Inspect registry completeness, parent/current union behavior, the hard-required frozen
prototype boundary, append-only record semantics, and cumulative-patch detection.

## Decision and task references

QA-008 owns this quality control. D17 and D32 remain unchanged; no new product
authority or compatibility decision is created.
