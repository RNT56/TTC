# Golden artifact update: register contract documentation

## Artifact IDs

- `golden-policy-registry`

## Changed paths

- `docs/golden-artifact-registry.json`

## Drift classification

- `fixture`

## Why this is intentional

DOC-005 adds generated API, event, and artifact references that must be reviewed and
regenerated from their owning runtime and compatibility sources instead of hand-
edited or silently re-pinned.

## Source-of-truth change

The registry gains one non-overlapping schema family with exact versioned paths,
source ownership, regeneration command, focused verification, and required
compatibility review.

## Compatibility and user impact

The registry change adds review policy only. It does not change a route, request,
response, event, queue kind, artifact payload, physical model, or maturity claim.

## Evidence before

Protected parent `2dfc960` governed fifteen artifact families but had no owner or
regeneration policy for generated API/event/artifact documentation.

## Evidence after

`pnpm verify:goldens` recognizes sixteen non-overlapping families and requires the
separate schema-class review record for the generated documentation outputs.

## Reviewer focus

Inspect exact path ownership, regeneration/verification commands, compatibility
review, and the separation between the fixture-class registry change and schema-
class generated outputs.

## Decision and task references

DOC-005 owns the addition. QA-008 owns the registry procedure; D31 remains unchanged.
