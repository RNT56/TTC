# Golden artifact update: SB3 training internal schemas

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

P7-003 adds a real worker training boundary and therefore must document the two
internal envelopes that prevent user-authored or Python-reinterpreted simulator truth:
`forge-admitted-model-snapshot` 1.0.0 and `trainingMuJoCoBundle` 1.0.0. The generated
artifact catalog gains only these internal schema-version rows; no queue kind, public
route, event, worker package version, or existing artifact field changes.

## Source-of-truth change

`compatibility/compatibility.json` owns the internal worker schema versions. The
gateway owns admitted snapshot construction, `forge-sim::training` owns the Rust
bundle version and contents, and `scripts/check-compatibility.mjs` requires those
sources and the Python verifier to agree. `pnpm docs:contracts` regenerated the
registered catalog from that compatibility source.

## Compatibility and user impact

Both envelopes are internal machine contracts under existing worker package 0.2.0.
They add no public API surface and remove or reinterpret no supported document.
Gateway, validator, and worker consumers reject unsupported versions, extra fields,
hash drift, or authority drift. Publishing either envelope independently would first
require normal compatibility-surface promotion, fixtures, migration policy, and
release notes.

## Evidence before

Protected parent `766f7b8c16e6ce3f860a0babff8b75e4d57b41f8` documented 16 worker
families but no internal training-envelope versions. The first complete 38-step gate
stopped at `pnpm verify:goldens` with
`docs/contracts/artifacts.v0.2.0.json: no new golden update record cites this change`;
the generator and generated-drift check had already passed with 75 routes, two event
families, and 16 worker families.

## Evidence after

`pnpm docs:contracts`, `pnpm verify:docs-contracts`, and
`pnpm verify:compatibility` pass; the compatibility checker still reports 15 public
surfaces because the two new rows are explicitly internal. Focused Rust training
bundle tests, 64 gateway tests, and 138 Python worker tests pass. Real PPO and SAC
tests execute MuJoCo, update model parameters, reproduce same-seed ONNX digests, and
retain exact source/lockfile/dependency-manifest/contract/configuration lineage. The
complete Python 3.12 `pnpm verify` gate then passed all 38 required local steps,
including this golden policy, Rust formatting/Clippy/workspace tests, fresh WASM and
native parity, six real ONNX browser-runtime tests, the gateway/Brief-25 boundaries,
release packaging, all 138 worker tests, the real seeded training smoke, and patch
hygiene.

## Reviewer focus

Verify that the generated diff contains exactly the two internal schema versions,
that gateway/Rust/Python version tokens are machine-aligned, that the gateway owns
snapshot bytes, that Rust owns simulator derivation, and that no public compatibility
surface or existing worker artifact meaning changed.

## Decision and task references

P7-003 owns this additive internal boundary under validator sovereignty, D8, D17,
and compatibility policy 1.0.0. It implements existing authority and provenance
doctrine, so no new product decision is required.
