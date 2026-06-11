# Simulation Engine (`forge-sim`) — implementation doc

**Status:** not started · **Phases:** P1 (port + Rapier wiring), P6 (depth) ·
**Home:** `crates/forge-sim` *(proposed)* · **Plan refs:** §7.4, Appendix C (v3.0) ·
**Decisions:** D7, D8, D16, D17, D20

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
- Revolute joints with motors honoring contract `maxTorqueNm`/`maxVelRad`.
- Friction-materialed ground; slopes/steps native — legged contact runs here.
- Fixed 240 Hz substeps; 120 Hz driver tick; render-interpolated; shared-memory
  state mirror; zero per-frame allocation. Budget: ≤ 4 ms amortized (worker), inside
  the ≤ 1.5 ms core-tick share for the models themselves.

## 3. Propulsion & battery models (the HUD's source of truth)

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
only (D17, superseding D6's client/server split).

## 6. Exporters & importer

- **MJCF** (training) and **URDF + ros2_control** (deployment): bodies from nodes,
  geoms from collision policy, actuators from joints/motors; Y-up→Z-up conversion at
  the boundary. Golden fixtures (XC-04).
- **Importer (P6-009):** the same mapping reversed; imported models are slot-less
  until carved in the editor. Fixture corpus from common public robots (XC-05).

## 7. The parity discipline (D20)

Rapier and MuJoCo consume the **same compiled MJCF from the same contract**. Parity
suite — drop tests, pendulum periods, hover trim, gait CoM trajectories — asserts
agreement within stated tolerances and runs on **every engine or exporter upgrade**
(P6-010). Where they disagree, the training side is truth and the client side is
presentation. (Distinct from the golden-number suite, which asserts *our own* code
is bit-identical across targets — XT-001.)

## 8. Dependencies

`forge-contract`, `forge-geometry` (colliders, mass props), `forge-motion` (driver
coupling). Server twin: the training worker consumes the MJCF this crate compiles.

## 9. Testing

SIM-001..003 harness checks; battery/propulsion unit tests vs bench math;
differential tests vs the JS oracle during the port; parity suite (canonical scenes,
tolerance bands — also the physics-regression gates for engine bumps); replay
determinism via the golden-number suite (bit-exact, any target); exporter goldens;
importer round-trip (external URDF → contract → driveable, P6 exit criterion).

## 10. Phase mapping & backlog

P1: port of model stubs + Rapier worker wiring (P1-003). P3: thrust-table module
lands with catalog data (P3-010/XC-06). P6: everything else (P6-001..011). P8: replay
format carries real telemetry (recorder).

## 11. Open questions

Tolerance numbers for parity (set empirically at P6, then frozen); ESC modeling depth
(currently lumped into R_total — revisit with system-ID data at P8); whether
disturbance injectors are contract-side (EnvSpec) or scene-side (lean EnvSpec, P10);
Rapier version-pinning policy across native/WASM (must match exactly per D17).
