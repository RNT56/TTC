# Simulation Engine (`forge-sim`) — implementation doc

**Status:** deterministic sim helpers/exporters/importers, engine-backed Rapier stepping,
and local real-engine MuJoCo 3.9.0 parity implemented; protected required-check
acceptance pending · **Phases:** P1 (port + Rapier wiring), P6 (depth) ·
**Home:** `crates/forge-sim` · **Plan refs:** §7.4, Appendix C (v3.0) ·
**Decisions:** D7, D8, D16, D17, D20, D32

## 1. Purpose

Client-side physical truth-enough plus the compilers that make training-grade truth
possible (MJCF/URDF export), held to the training side by a parity suite. Under D16
the Rapier story simplifies structurally: **Rapier is a Rust crate — natively the
boundary disappears, and in the browser it remains the same library**, driven from
`forge-sim` either way. Every HUD number — AUW, TWR, hover throttle, instantaneous
current, endurance — is a closed-form consequence of models defined here, with
assumptions inspectable.

## 2. Client physics (Rapier)

- Bodies compiled from the contract; **per-node compound colliders within D7 budgets**
  (≤ 8 convex pieces/node, ≤ 24/model) via `forge-geometry`'s auto-fitter (XC-10).
  The runtime fixture compiler emits body masses/collider counts plus joint and
  motor handoff records, and `forge_sim::rapier::RapierWorld` turns those records
  plus fitted primitive colliders into an executable Rapier 0.33 world.
- Fixed, revolute, and spherical joints compile from the contract. Revolute joints
  carry axes, limits, `maxTorqueNm`, `maxVelRad`, and motor target velocity clamps.
- Friction-materialed ground; slopes/steps native — legged contact runs here.
- Fixed 240 Hz substeps under a 120 Hz driver tick are executable in Rust today.
  The Studio core tick path now has a `SharedArrayBuffer` worker pose mirror
  and perf drain (2026-06-15). Rapier also has a WASM `RapierSession` facade
  and Studio module-worker path that builds, steps, mirrors body poses through
  SAB, feeds the visible render loop through the Studio pose-source switch, and
  drains a Rapier worker perf bucket. Budget: ≤ 4 ms amortized (worker), inside
  the ≤ 1.5 ms core-tick share for the models themselves.

## 3. Propulsion & battery models (the HUD's source of truth)

XC-28 closes the slot-backed physical-value ambiguity. Geometry bake, mass, catalog
HUD overrides, propulsion and battery lookup, collider validation, lockfile
resolution, Rapier bodies/colliders, URDF/MJCF inertials and geometry, and BOM rows
consume only the explicit equipped variant; unknown or ambiguous selection fails
validation instead of falling back to array order. Native tests cover selected-only
catalog category/mass behavior, inline geometry/mass, executable Rapier construction,
and export part/mass counts; the WASM facade exposes stable source pointers for the
same flattened physical table.

Per-motor, first-order:

```
n      ≈ Kv · V_eff · u          (RPM from throttle u)
V_eff  = V₀ − I · R_total        (sag through battery + ESC + motor R_int)
T      = C_T · ρ · n² · D⁴       (thrust)
Q      = C_Q · ρ · n² · D⁵       (torque)
endurance ≈ 0.8 · C / I_avg      (usable-capacity convention)
```

C_T/C_Q interpolated from catalog **thrust tables** where published (XC-06),
blade-element-lite estimates where not — and the HUD says which. Battery: internal-
resistance sag + capacity integration, unit-tested against bench math (XC-07).
ρ and g come from the contract's `env` block, never ambient constants.

## 4. Estimator-in-sim (D8)

The contract's estimator block (complementary filter
θ̂ = α(θ̂ + ω·dt) + (1−α)·θ_accel; EKF with bias states as the P7+ upgrade) runs
*inside* the simulation, producing the noisy, latent, biased state that policies
actually observe (XC-08). Ground truth is never exposed to the policy path —
enforced downstream by SIM-004.

## 5. Disturbances & replay (D17)

Disturbance injectors: gusts, payload shifts, sensor dropout — serving play and
pre-training sanity. **Replay (P6-011):** every session serializes to
`{contractHash + lockfile, env, seed, input tape}` — and because the same bits run
on every target, a tape **verifies anywhere**: in the browser, in CI, on the
gateway. Official leaderboard runs are re-verified server-side as anti-cheat hygiene
only (D17, superseding D6's client/server split). Every frame timestamp must be
finite and strictly increasing, including a single-frame tape; non-finite values
cannot pass a vacuous pairwise window.

## 6. Exporters & importer

- **MJCF** (training) and **URDF + ros2_control** (deployment): bodies from nodes,
  geoms from collision policy, actuators from joints/motors; Y-up→Z-up conversion at
  the boundary. Golden fixtures (XC-04). The `ros2_control` block and mesh visual
  manifest are explicit sidecars so the pinned URDF/MJCF goldens remain stable.
- **Importer (P6-009):** the same mapping reversed for the deterministic subset:
  links/bodies → nodes, visual geoms → bakeable primitive parts when possible
  and mesh refs when assets are external, collision geoms → primitive collision
  parts, joints → joint blocks. Imported models are slot-less until carved in
  the editor. Fixture corpus starts with `import_rover.urdf` and
  `import_rover.mjcf` (XC-05); as of 2026-06-15 both external rover fixtures
  validate as admitted, driveable contracts with inferred rover wheelbase and
  conservative explode windows. QA-007 additionally caps import text, rejects NUL or
  malformed/non-finite supported numeric attributes, requires a non-empty unique
  node graph with valid parents, and uses total ordering for dominant-axis selection
  so malformed input cannot panic or silently become zero-valued geometry.

## 7. The parity discipline (D20)

Rapier and MuJoCo now start from the **same four canonical ModelSpec scenarios**.
Rapier compiles those contracts directly; MuJoCo receives MJCF emitted by the
checked-out `forge-sim` exporter from those same contracts. The parity suite — drop
tests, pendulum periods, hover trim, and gait CoM trajectories — asserts agreement
within unchanged stated tolerances and runs in the existing merge-blocking
`compute workers (Python)` check on every pull request and protected-main push
(P6-010). Where they disagree, the training side is truth and the client side is
presentation. This is distinct from XT-001's native/WASM bit-exact golden numbers.

`forge-validate sim-parity mujoco-request` emits the source-revision- and
request-hash-bound, versioned request and contract-derived MJCF; the Python runner
refuses missing or external-file scenes, non-finite/bad bounds, source/version drift,
oversized input, a request-hash mismatch, compiled gravity/timestep drift, and any
installed engine other than the reviewed MuJoCo 3.9.0 pin. The MJCF exporter
declares radians explicitly, and parity-only options declare free versus fixed roots,
Euler integration, and the same 1/240 s driver with four 1/960 s substeps used by
Rapier. The Rust comparator also refuses mismatched scenario dimensions, driver
timestep, or substep count before applying the frozen tolerances.

After `python -m pip install -e "workers[dev,mujoco]"`, run
`pnpm sim:parity:live` for both engines. `pnpm sim:parity:check` remains the keyless
local gate against the reviewed engine-backed fixture. The registered
`--capture-baseline` path writes a baseline candidate only after a real pinned-engine
comparison passes; every accepted re-pin still requires the append-only golden
review procedure. The 2026-07-15 local MuJoCo 3.9.0 run measured drop delta
0.001396765 s, pendulum delta 0.000069847 s, hover-trim delta 6.98e-10, and gait-CoM
delta 0.000061964 m, inside the unchanged 0.002 s / 0.01 s / 0.02 / 0.02 m bands.
P6-010 remains in progress until the exact PR head and protected merge both retain
this required live-engine proof.

## 8. Dependencies

`forge-contract`, `forge-geometry` (colliders, mass props), `forge-motion` (driver
coupling). Server twin: the training worker consumes the MJCF this crate compiles.

## 9. Testing

SIM-001..003 harness checks; battery/propulsion unit tests vs bench math;
differential tests vs the JS oracle during the port; parity suite (canonical scenes,
tolerance bands — also the physics-regression gates for engine/exporter bumps, with
the real pinned MuJoCo execution in required CI and a keyless reviewed fixture locally); replay
determinism via the golden-number suite (bit-exact, any target); exporter goldens;
importer round-trip (external URDF/MJCF → admitted contract → `RoverDriver`
drive smoke, P6 exit criterion closed 2026-06-15). The registered QA-007 corpus adds
ten import, eleven EnvSpec, and ten replay cases plus randomized bounded import text
and replay timestamp vectors. EnvSpec bounds, poses, obstacle sizes, gate dimensions,
and win times remain finite SI values with stable `ENV-*` diagnostics.

## 10. Phase mapping & backlog

P1: port of model stubs + shared-memory Studio tick worker + visible Rapier
worker pose source. P3:
thrust-table module lands with catalog data (P3-010/XC-06). P6: collider fitting,
engine-backed Rapier stepping, propulsion/battery, disturbances, replay,
MJCF/URDF export/import, and Rapier↔MuJoCo parity contracts are live; P8: replay
format carries real telemetry (recorder).

## 11. Open questions

ESC modeling depth (currently lumped into
R_total — revisit with system-ID data at P8); whether disturbance injectors are
contract-side (EnvSpec) or scene-side (lean EnvSpec, P10); Rapier version-pinning
policy across native/WASM (currently Rapier 0.33.0, must match exactly per D17).
