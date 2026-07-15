# Golden artifact update: contract-derived engine parity

## Artifact IDs

- `sim-export-goldens`
- `sim-parity-baseline`
- `golden-policy-registry`

## Changed paths

- `crates/forge-sim/tests/fixtures/vx2-mini.mjcf.xml`
- `crates/forge-sim/tests/fixtures/mujoco-parity-baseline.json`
- `docs/golden-artifact-registry.json`

## Drift classification

- `physics`
- `fixture`

## Why this is intentional

P6-010 requires Rapier and MuJoCo to execute the same canonical scenario contracts
with explicit SI units and matched substeps. The old MuJoCo producer maintained four
separate hand-authored MJCF strings, and the general MJCF exporter omitted MuJoCo's
radian compiler declaration even though contract joint angles and ranges are radians.

## Source-of-truth change

`forge-sim::interop` now owns the four canonical scenario contracts. Rapier builds
directly from those contracts, while MuJoCo receives MJCF produced by
`forge-sim::export` from the same contracts. The exporter now emits an explicit
radian compiler declaration; parity-only export options add explicit free roots,
Euler integration, and the matched 1/960 s physics substep without changing the
default root-mobility contract.

## Compatibility and user impact

Existing MJCF joint ranges now have their documented radian meaning in MuJoCo instead
of being interpreted as degrees. This is a correctness fix to a previously invalid
unit interpretation, not a new input format or tolerance change. The pinned MuJoCo
3.9.0 baseline remains inside the unchanged drop, pendulum, hover, and gait bands.

## Evidence before

Protected parent `484aefa772082ac810785aaeb509c440afdbb050` compared real Rapier
against a hand-authored MuJoCo 3.9.0 producer: drop 0.4521218466494958 s, pendulum
1.270112620088624 s, hover trim 0.4200000000419095, and gait CoM
0.004020575954833466 m. When the same run was first routed through the checked-out
exporter, `node scripts/sim-parity.mjs` failed closed with `MuJoCo pendulum baseline
did not complete a period within timeout`; inspection showed a radian range being
compiled under MuJoCo's degree default.

## Evidence after

The registered exporter command adds only the explicit radian compiler row to the
default `vx2-mini` MJCF. The registered live capture command on MuJoCo 3.9.0 measures
drop 0.45286544367797626 s, pendulum 1.2706999182464798 s, hover trim
0.4200000000419095, and gait CoM 0.00402050250861172 m. Against real Rapier this is
drop delta 0.0013967650854047609 s, pendulum delta 0.00006984706185098055 s,
hover delta 0.0000000006984919309616089, and gait delta
0.00006196396705384927 m; all pass the unchanged tolerance contract. Focused Rust,
Python, golden-policy, pinned-fixture, and live-engine commands plus the full gate are
recorded in the owning changelog entry.

## Reviewer focus

Verify the radian unit declaration, free-versus-fixed root choice, exported mass and
inertia lineage, exact 1/240 s driver and four-substep metadata, MuJoCo 3.9.0 pin, and
that no parity threshold was widened.

## Decision and task references

P6-010 and D20 own this correction. D17 determinism and the compatibility policy are
unchanged; no new product-authority decision is introduced.
