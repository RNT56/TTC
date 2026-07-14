# Golden artifact update: register cross-boundary adversarial corpora

## Artifact IDs

- `golden-policy-registry`
- `boundary-adversarial-corpora`

## Changed paths

- `docs/golden-artifact-registry.json`
- `evals/fuzz/boundaries/catalog-citations.json`
- `evals/fuzz/boundaries/envspec.json`
- `evals/fuzz/boundaries/export-policy.json`
- `evals/fuzz/boundaries/hardware-payloads.json`
- `evals/fuzz/boundaries/imports.json`
- `evals/fuzz/boundaries/json-patch.json`
- `evals/fuzz/boundaries/provider-output.json`
- `evals/fuzz/boundaries/replay.json`

## Drift classification

- `fixture`

## Why this is intentional

QA-007 needs reviewed, stable failure examples across eight trust boundaries rather
than isolated hand-written tests whose inputs can disappear during refactoring. The
new corpora preserve 89 accepted and refused cases for imports, JSON Patch, EnvSpec,
replay, provider output, catalog citations, export policy, and hardware payloads.

## Source-of-truth change

The boundary implementations and their focused Rust/Python consumers changed first:
non-finite import/replay/EnvSpec values, citation authority, and hardware command or
supervisor payloads now fail closed. The corpus records the minimized inputs and
expected outcomes that those implementation boundaries enforce.

## Compatibility and user impact

Previously accepted malformed or non-finite inputs at the governed boundaries are
now rejected with deterministic diagnostics or errors. Valid finite inputs and the
documented replay compatibility aliases remain accepted. No public format version is
changed; this is strict validation of already-invalid physical, provenance, policy,
or hardware data.

## Evidence before

Parent `f2db50c9f0f9e0b51b8c9003b2a6db39c1684a23` had no registered cross-boundary
corpus. Focused inspection showed that single-frame non-finite replay timestamps,
NaN citation confidence, malformed imported numbers, non-finite EnvSpec gate sizes,
hardware command newlines, duplicate/non-finite telemetry time, and malformed
supervisor vectors or limits could evade their intended refusal paths.

## Evidence after

`pnpm fuzz:boundaries:check` passes with the exact eight-file set and 89 unique cases.
`cargo test -p forge-contract --test boundary_fuzz_corpus`, `cargo test -p forge-sim`,
and the Python 3.12 worker suite pass, including 47 forge-sim unit tests, 5 simulation
corpus/property tests, and 127/127 worker tests. The complete 35-step `pnpm verify`
gate passes under Python 3.12, including native/WASM parity, release packaging, and
cumulative patch hygiene.

## Reviewer focus

Review SI finiteness, exact vector arity, replay timestamp ordering, import graph
identity, JSON Pointer behavior, confidence range `[0,1]`, credential-free HTTPS
citations, D10 envelope substitution, bounded JSON, safe command tokens, and the
no-auto-arm/physical-confirmation boundary.

## Decision and task references

QA-007 owns the corpus. QA-008 owns this append-only registration and review record.
No new architecture decision is required because the patch enforces existing
validator sovereignty, provenance, license/export, and fail-closed hardware doctrine.
