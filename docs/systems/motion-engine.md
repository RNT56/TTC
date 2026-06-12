# Motion Engine (`forge-motion`) — implementation doc

**Status:** not started · **Phases:** P1 (Rust port), P2 (library formalized) ·
**Home:** `crates/forge-motion` *(proposed)* · **Plan refs:** §7.3, Appendix C
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
     spring; arrive controller (click-to-move).
   - `multirotor`: angle-mode model with per-motor mixer; consumes simulation forces
     when physics-coupled (P6).
   - `rover`: differential or Ackermann steering with wheel-spin kinematics.
   - `arm`: damped-least-squares IK with null-space posture bias.
   - `quadruped` (first NEW archetype — proves the contract generalizes): trot/walk
     generator with per-leg 3-DOF IK.
2. **Constraint layer:** joint limits from the skeleton; velocity clamps;
   self-collision guards fed by `forge-geometry`'s interference queries.
3. **Secondary layer:** critically damped servos (ω, ζ per joint class), scan
   detents, actuator telltales, verlet cables/antennae.
4. **Policy layer:** active ONNX policy writes joint/thrust *targets* into the
   pipeline — below the constraint layer, never above it.

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

## 7. Testing

Differential tests vs the JS oracle during the port (P1-001); gait regression
(stride/contact fixtures recorded from the prototype, P0-008); BEH-001 smoke per
archetype (biped 1 m walk; multirotor altitude ±5 cm; rover 1 m arc; quadruped/arm
analogues defined at P2-003/004); BEH-002 servo stability; IK unit tests against the
closed forms; golden-number membership for every formula.

## 8. Phase mapping & backlog

P1: the port (P1-001) — gait/IK/mixer/servos/constraint layer green against the
oracle. P2: driver library formalized + quadruped (P2-003/004), param schemas into
the harness. P6: physics coupling. P7: policy layer consumes real ONNX outputs.

## 9. Open questions

Quadruped gait parameterization detail (stance/swing curve shapes — derive from
biped's proven curves); whether arm null-space posture bias is per-contract or
per-driver-default; input-tape format versioning shared with the replay system
(owned by `forge-sim`).
