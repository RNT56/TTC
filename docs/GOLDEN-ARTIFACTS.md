# Golden artifact review and update procedure

Owner: validator/core quality workstream

Policy version: **1.0.0**

Machine registry: [`golden-artifact-registry.json`](golden-artifact-registry.json)

Golden artifacts are reviewed evidence, not convenient test output. A schema, render
capture, trajectory, physics baseline, declared verdict, corpus, or committed generated
runtime may change only because its owning source of truth changed intentionally. A
failing test is never, by itself, permission to regenerate the expected file.

`pnpm verify:goldens` enforces this policy locally and in the required Rust CI job. It
inspects the cumulative branch patch, staged and unstaged changes, and untracked files.
Any registered artifact change requires one new append-only review record under the
fixed [`golden-updates/`](golden-updates/README.md) directory. Registry validation
rejects redirecting that history or assigning overlapping ownership. The immutable
frozen prototype HTML is rejected outright; superseding it requires a new decision
and a new oracle family, not an edit.

## Required workflow

1. Preserve the failing parent SHA, command, environment, input, first causal error,
   and old artifact. Do not regenerate yet.
2. Classify the change as `schema`, `render`, `physics`, `validator`, `fixture`, or
   `generated-runtime`. Identify the owning source file or external measurement.
3. Decide whether the change affects a supported format, stable diagnostic, unit,
   default, physical meaning, exporter, or public runtime. If it does, follow
   [`COMPATIBILITY.md`](COMPATIBILITY.md) and add migration/deprecation/decision work
   before updating an artifact.
4. Change the source of truth and add focused success/failure/boundary tests first.
5. Regenerate only with the registry's named command or procedure. Never hand-edit a
   measured physics row, generated schema, WASM binary, or render metric.
6. Inspect the semantic diff. For binary/render artifacts, retain machine metrics and
   visually inspect the reviewed composites. For schema and text artifacts, explain
   added, removed, and meaning-changing fields or values.
7. Add exactly one new record that cites every changed registered path and registry
   artifact ID. Records are evidence and therefore append-only; correct an old record
   by adding a new correction record.
8. Run every focused command in the registry plus `pnpm verify:goldens`. Run the full
   `pnpm verify` gate before phase or release closure and any additional gate required
   by the changed surface.
9. Update `CHANGELOG.md`, the relevant TODO/status row, and `DECISIONS.md` when a
   threshold, compatibility promise, physical model, or accepted authority changed.
10. In the PR, ask reviewers to inspect the source-of-truth change before the
    regenerated diff. A green snapshot test does not prove the new expectation is
    correct.

## Review rules by artifact class

| Class | Minimum independent question | Required evidence |
|---|---|---|
| Schema | Can old supported documents still be read with the same meaning? | compatibility classification, migration fixtures when needed, regenerated schema diff |
| Render | Is geometry/camera/pose truth preserved rather than hidden by styling? | deterministic capture settings, structural metric delta, reviewed composites |
| Physics | Did equations, units, inputs, engine versions, or tolerances change? | before/after numbers, canonical scenario, parity or analytic reference |
| Validator | Was an invariant corrected without weakening sovereignty? | stable check IDs, success/failure/boundary fixtures, verdict delta |
| Fixture | Does the corpus still represent the stated risk and coverage? | minimized case or coverage delta, version/rationale, no removed failure without replacement |
| Generated runtime | Does the generated output come from the pinned source/toolchain? | exact generator command, clean regeneration, runtime/build/parity checks |

## Prohibited shortcuts

- Do not update an expected value merely because CI is red.
- Do not combine an unexplained artifact re-pin with an unrelated feature.
- Do not weaken a threshold, delete a corpus case, or change an expected verdict to
  make a new implementation pass.
- Do not edit the frozen prototype HTML. D32 owns that historical boundary.
- Do not claim native/WASM equality, render parity, simulator parity, or compatibility
  from an updated file unless the corresponding executable comparison passed.
- Do not edit or reuse a prior review record to authorize a later change.

The registry is machine-owned inventory. Adding or removing an artifact family must
update this document, registry validation tests, and the owning system documentation.

The current inventory has **fifteen families**. QA-007's
`boundary-adversarial-corpora` family owns the exact eight JSON files under
`evals/fuzz/boundaries/`. Its cases are reviewed fixture evidence: stable IDs,
accepted/refused outcomes, special non-finite sentinels, and the exact file set are
machine-checked. Rust and Python consumers prove behavior; the structural checker
alone cannot justify changing an outcome.
