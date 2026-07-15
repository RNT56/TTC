# Golden artifact update: contract-derived ground training

## Artifact IDs

- `api-event-artifact-docs`
- `studio-demo-mirrors`
- `native-wasm-golden-numbers`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`
- `packages/studio/public/demo/qd-mini.forge.json`
- `crates/forge-wasm/tests/fixtures/golden.jsonl`

## Drift classification

- `schema`
- `generated-runtime`
- `physics`

## Why this is intentional

D44 adds the first exact rover and quadruped training contract instead of extending
the flight tensor by implication. The generated artifact catalog now names the
separate internal ground bundle, task, tensor, and SB3 runtime majors. The QD-mini
demo mirror gains the explicit joint torque ceilings and physically owned leg
segments required for validator-sovereign MuJoCo compilation; it remains a byte-for-
Moving those segments to the bodies that physically own them intentionally changes
QD-mini's native bake hash while preserving its part/face/vertex counts and motion
tick hash, so the registered native/WASM number fixture advances by exactly one row.

## Source-of-truth change

`compatibility/compatibility.json` owns the internal schema versions and
`crates/forge-gen/src/lib.rs` owns the QD-mini generator. Rust training compilation
derives control authority from the admitted contract. `pnpm docs:contracts` and
`pnpm demo:sync` regenerate the two registered artifacts from those sources; neither
registered output was edited as an independent source of truth. The registry-owned
`forge-golden` command regenerated all four canonical number rows from the same
contracts; only QD-mini's expected bake hash changed.

## Compatibility and user impact

The four catalog rows are additive internal contracts and do not change a public
route, queue kind, event, or published package. Ground policies use their own
`forge-ground-policy-tensor` 1.0.0 declaration: rover is `[1,11]` to `[1,2]`, while
QD-mini is `[1,27]` to `[1,8]` with ordered joint position, velocity, and torque
channels. Studio refuses that tensor until a reviewed browser consumer exists.
Existing multirotor tensor and task majors retain their exact meanings.
QD-mini keeps 18 parts, 404 faces, 592 vertices, and its exact 600-step tick hash;
the bake-hash change reflects corrected part-to-body ownership, not a compatibility
migration or silent dynamics change.

## Evidence before

Protected source parent `333e779282aab1dc8b6178fc62972d21818c2eaa` documented only
the admitted snapshot, multirotor training bundle, and multirotor task internal
schemas. QD-mini omitted joint torque ceilings and assigned its moving leg geometry
to non-actuated descendants, so strict contract-derived ground compilation had no
complete control-authority source. `pnpm verify:goldens` correctly required a review
record once the generated catalog and Studio mirror changed. The first complete gate
then stopped at `cargo test -p forge-wasm --test golden_pinned`: QD-mini's computed
bake hash was `f78e98a4c7c6f20e` while the protected fixture still held
`e7e3a2d78940a66e`; both sides retained tick hash `a40c1fbd93f9bc65`.

## Evidence after

Focused Rust training, validator-import, and generator tests pass. Thirty-nine
focused Python bundle, real-MuJoCo environment, SB3/ONNX, scorecard, and course tests
pass; 13 Studio policy-runtime tests pass; compatibility still reports 15 public
surfaces. The four-task smoke runs 256 real PPO steps each for hover, waypoint,
line-follow, and walk-to-target, emits exact task/tensor-bound ONNX files, and keeps
all sub-threshold policies blocked. `pnpm docs:contracts` emits 76 routes, two event
families, and 16 worker families with the reviewed internal-version-only catalog
delta. The complete 39-step `pnpm verify` gate passes under Python 3.12 with all 174
worker tests, 13 Studio runtime tests, 65 gateway tests, Brief-25 25/25, Rust and
WASM gates, packaging, four-task real training smoke, MJX feasibility, and hygiene.
The exact registry regeneration command changes only QD-mini's bake hash to
`f78e98a4c7c6f20e`; `cargo test -p forge-wasm --test golden_pinned` and fresh
native/WASM parity verify the reviewed row.

## Reviewer focus

Inspect the ground tensor scalar and joint order, exact torque/velocity/limit
derivation, equal-radius differential-drive rule, QD-mini segment ownership and SI
units, generated-only mirror equality, estimator-only policy observations, torque
degradation never exceeding contract authority, positive mechanical-work accounting,
the explicit Studio refusal of an unsupported tensor family, and that the golden
number diff changes only QD-mini's bake hash while counts and tick hash remain exact.

## Decision and task references

D44 owns the independent ground bundle/task/tensor boundary and energy semantics.
P7-014 owns rover and legged trainers; D42 preserves multirotor major compatibility,
and D43 keeps accelerator and host-energy claims separate from simulated mechanical
work.
