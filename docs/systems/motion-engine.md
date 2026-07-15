# Motion Engine (`forge-motion`) — implementation doc

**Status:** P1 port done (2026-06-12 — biped/FPV oracle drivers tape-parity
green); P2 arm/quadruped library and P7 multirotor policy-observer boundary live ·
**Phases:** P1 (Rust port), P2 (library formalized), P7 (policy layer) ·
**Home:** `crates/forge-motion` · **Plan refs:** §7.3, Appendix C
(v3.0) · **Decisions:** D16, D17, D19, D20

## 1. Purpose

A deterministic, fixed-step (120 Hz) layer stack **ticked in core (Rust),
render-interpolated in TS**. Drivers are **library code keyed by archetype,
parameterized by the contract** — the only behavior a model has (D19). The policy
layer feeds trained behavior into the same pipeline *beneath* the constraint layer,
so a policy can never command an invalid pose. First crate ported after
`forge-contract` in the P1 landing order — its closed-form math and the prototype's
recorded gait fixtures make it the gentlest oracle-checked start.

## 2. The layer stack (evaluation order, per tick)

1. **Base layer — archetype drivers:**
   - `biped`: proven phase gait; closed-form 2-bone IK; planted-feet idle; heading
     spring; arrive controller (click-to-move). **Ported 2026-06-12**
     (`biped.rs`, line-faithful to the monolith; tape parity 4.4e-16).
   - `multirotor`: angle-mode model with per-motor mixer; consumes simulation forces
     when physics-coupled (P6). **Ported 2026-06-12** (`fpv.rs`, drag-limited
     velocity flight + tilt servos + RPM mixer; tape parity 7.1e-15).
   - `rover`: differential or Ackermann steering with wheel-spin kinematics.
   - `arm`: damped-least-squares IK with null-space posture bias. **Live
     2026-06-14** (`arm.rs`, planar Y/Z solver, joint discovery or explicit
     `jointNodes`, CTR-008 schema, BEH-001 reach smoke).
   - `quadruped` (first NEW archetype — proves the contract generalizes): trot/walk
     generator with per-leg 3-DOF IK.
2. **Constraint layer:** joint limits from the skeleton; velocity clamps;
   self-collision guards fed by `forge-geometry`'s interference queries.
3. **Secondary layer:** critically damped servos (ω, ζ per joint class), scan
   detents, actuator telltales, verlet cables/antennae.
4. **Policy layer:** active ONNX policy writes normalized joint/thrust *targets* into
   the pipeline — below the constraint layer, never above it. P7-008's multirotor
   path receives bounded throttle/roll/pitch/yaw targets from ONNX Runtime Web at no
   more than 50 Hz; the fixed 120 Hz driver holds only the last verified advisory.

Keyframe clips and blend trees exist as an additive authoring layer for cinematics,
never required for function.

## 3. Driver interface *(proposed)*

```rust
// crates/forge-motion
pub trait ArchetypeDriver {
    fn archetype(&self) -> Archetype;
    fn params_schema() -> schemars::Schema;          // validated at admission
    fn init(&self, model: &CompiledModel, params: &DriverParams) -> DriverState;
    fn tick(&self, s: &mut DriverState, input: &InputFrame, dt: f64) -> JointTargets;
    fn reset(&self, s: &mut DriverState);
    fn focus(&self, s: &DriverState) -> Option<CameraHint>;  // follow-camera hint
}
```

Drivers are registered in a versioned library; contracts name `archetype` + params.
Param schemas (schemars, like the contract itself) make driver configs LLM-generable
and harness-checkable.

## 4. Algorithms (from Appendix C — the shipped math)

- **2-bone leg IK (closed form):** for hip-frame target (dy, dz): D = √(dy²+dz²)
  clamped below L1+L2; knee β = acos((D²−L1²−L2²)/2L1L2); γ = atan2(dz, −dy);
  δ = atan2(L2 sin β, L1+L2 cos β); hip pitch = −γ−δ; level ankle = −(hip+knee).
- **DLS arms:** Δθ = Jᵀ(JJᵀ + λ²I)⁻¹e; **FABRIK** as N-bone fallback.
- **Servo layer:** ẍ = ω²(x_t − x) − 2ζω·ẋ, semi-implicit Euler; stable for
  ω·dt < 2 (shipping ω 14–16, ζ 0.8–0.85); must pass BEH-002 at dt = 50 ms.
- **Quad mixer:** rpm_i = base + k_t·thr − k_p·p·s_z(i) − k_r·r·s_x(i) + k_y·y·dir(i).

## 5. Determinism & timing (D17)

Fixed 120 Hz tick inside the core's `tick` boundary call; the TS render layer
interpolates from the shared pose region. Zero per-frame allocation; flat-buffer
state; **no fast-math**; deterministic iteration order. Bit-exactness across
native↔WASM is asserted by the golden-number suite (XT-001) — IK poses, servo steps,
and mixer frames are part of its corpus. Budget: ≤ 1.5 ms core tick (motion + sim
models combined) inside the frame.

## 6. Dependencies

`forge-contract`, `forge-geometry` (interference queries). The policy layer receives
ONNX outputs from the TS side (ONNX Runtime Web) through the tick input; `forge-sim`
couples physics forces at P6.

The reverse observation boundary remains in Rust. `CoreSession::policy_observations`
uses the contract's complementary estimator, a latency-derived position estimate,
and the deterministic inline powertrain to emit `forge-policy-tensor` 1.0.0. Only
this estimator-side tensor crosses WASM; `FpvDriver::policy_truth` is internal input
to the observer and is never exposed to Studio policy code (D8).

## 7. Testing

Differential tests vs the JS oracle: **done for biped + FPV** —
`tests/tape_parity.rs` replays the scripted 600-step tapes
(`prototype/trajectories/`) and bands every rot/off channel at 1e-9 (measured
max dev 4.4e-16 / 7.1e-15; JS↔Rust libm ULPs are the only residual, which is
why the band exists — bit-exactness across OUR targets is XT-001's job and
holds). BEH-001 smoke per archetype (biped 2 s walk ≈ 1.49 m; rover 1 m arc;
quadruped 1 m trot; arm reachable-target solve; multirotor hover-trim
existence); BEH-002 servo stability; IK unit tests against the closed forms;
golden-number membership for every formula (the session tick corpus now
exercises both oracle drivers).

## 8. Phase mapping & backlog

P1: the port (P1-001) — **done 2026-06-12**: gait/IK/mixer/servos/constraint
layer green against the oracle tapes; `CoreSession` drives biped + multirotor
through the ported pipelines (`node_world_posed` = the monolith's nm() with
base+animated euler). P2: driver library formalized with quadruped (P2-004) and
arm DLS IK (P2-003) live, plus param schemas into the harness. Fixedwing remains
a later driver. P6: physics coupling. P7: policy layer consumes real ONNX outputs;
the P7-008 protected evidence closeout remains separate from live SB3 training and
hardware authority.

## 9. Open questions

Quadruped gait parameterization detail (stance/swing curve shapes — derive from
biped's proven curves); whether arm null-space posture bias is per-contract or
per-driver-default; input-tape format versioning shared with the replay system
(owned by `forge-sim`).
