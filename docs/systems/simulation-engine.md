# Simulation Engine — implementation doc

**Status:** not started · **Phases:** P1 (worker skeleton), P6 (depth) · **Package:**
`packages/engines/sim` *(proposed)* · **Plan refs:** §7.4, Appendix C · **Decisions:**
D6, D7, D8, D16

## 1. Purpose

Client-side physical truth-enough (Rapier WASM in a worker) plus the compilers that
make training-grade truth possible (MJCF/URDF export), held to the training side by a
parity suite. Every HUD number — AUW, TWR, hover throttle, instantaneous current,
endurance — is a closed-form consequence of models defined here, with assumptions
inspectable.

## 2. Client physics (Rapier)

- Bodies compiled from the contract; **per-node compound colliders within D7 budgets**
  (≤ 8 convex pieces/node, ≤ 24/model) via the geometry engine's auto-fitter (XC-10).
- Revolute joints with motors honoring contract `maxTorqueNm`/`maxVelRad`.
- Friction-materialed ground; slopes/steps native — legged contact runs here.
- Fixed 240 Hz substeps; 120 Hz driver tick; render-interpolated; SharedArrayBuffer
  mirror; zero per-frame allocation. Budget: ≤ 4 ms amortized.

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

## 5. Disturbances & replay

Disturbance injectors: gusts, payload shifts, sensor dropout — serving play and
pre-training sanity. **Replay (P6-011):** every session serializes to
`{contractHash + lockfile, env, seed, input tape}`. Client replay is
tolerance-banded with drift detection; **bit-exact replay and official scorecards are
server-side only** (D6).

## 6. Exporters & importer

- **MJCF** (training) and **URDF + ros2_control** (deployment): bodies from nodes,
  geoms from collision policy, actuators from joints/motors; Y-up→Z-up conversion at
  the boundary. Golden fixtures (XC-04).
- **Importer (P6-009):** the same mapping reversed; imported models are slot-less
  until carved in the editor. Fixture corpus from common public robots (XC-05).

## 7. The parity discipline (D16)

Rapier and MuJoCo consume the **same compiled MJCF from the same contract**. Parity
suite — drop tests, pendulum periods, hover trim, gait CoM trajectories — asserts
agreement within stated tolerances and runs on **every engine or exporter upgrade**
(P6-010). Where they disagree, the training side is truth and the client side is
presentation.

## 8. Dependencies

`contract`, `geometry` (colliders, mass props), `engines/motion` (driver coupling).
Server twin: the training worker consumes the MJCF this package compiles.

## 9. Testing

SIM-001..003 harness checks; battery/propulsion unit tests vs bench math; parity
suite (canonical scenes, tolerance bands — these are also the physics-regression
gates for engine bumps); replay determinism tests (client tolerance bands, server
bit-exact); exporter goldens; importer round-trip (external URDF → contract →
driveable, P6 exit criterion).

## 10. Phase mapping & backlog

P1: Rapier worker skeleton (P1-009). P3: thrust-table module lands with catalog data
(P3-010/XC-06). P6: everything else (P6-001..011). P8: replay format carries real
telemetry (recorder).

## 11. Open questions

Tolerance numbers for parity (set empirically at P6, then frozen); ESC modeling depth
(currently lumped into R_total — revisit with system-ID data at P8); whether
disturbance injectors are contract-side (EnvSpec) or scene-side (lean EnvSpec, P10).
