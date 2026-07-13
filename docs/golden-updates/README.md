# Golden artifact update records

Add one file named `YYYY-MM-DD-lower-kebab-case.md` for each intentional patch that
changes registered golden artifacts. Records are append-only and must use every
heading below. Replace the instructional text completely; placeholder text is rejected
by `pnpm verify:goldens`.

```markdown
# Golden artifact update: concise reviewed change

## Artifact IDs

- `registry-id`

## Changed paths

- `path/from/repository/root`

## Drift classification

- `schema`

## Why this is intentional

Explain the corrected behavior or accepted design change.

## Source-of-truth change

Name the implementation, model, measurement, or contract that changed first.

## Compatibility and user impact

State the exact supported-input, output, diagnostic, physical, or visual impact.

## Evidence before

Record the parent SHA, failing command, and old observed result.

## Evidence after

List the focused and full commands plus the new observed result.

## Reviewer focus

Name the equations, units, thresholds, schema fields, or visual deltas to inspect.

## Decision and task references

Link the owning TODO and any compatibility or decision record; explain when none is needed.
```
