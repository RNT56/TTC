# Motion Engine — implementation doc

**Status:** not started · **Phases:** P1 (port), P2 (library formalized) ·
**Package:** `packages/engines/motion` *(proposed)* · **Plan refs:** §7.3, Appendix C
· **Decisions:** D6, D15, D16

## 1. Purpose

A deterministic, fixed-step (120 Hz) layer stack evaluated in a worker and
interpolated for render. Drivers are **library code keyed by archetype,
parameterized by the contract** — the only behavior a model has (D15). The policy
layer feeds trained behavior into the same pipeline *beneath* the constraint layer,
so a policy can never command an invalid pose.

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
   self-collision guards fed by the geometry engine's interference queries.
3. **Secondary layer:** critically damped servos (ω, ζ per joint class), scan
   detents, actuator telltales, verlet cables/antennae.
4. **Policy layer:** active ONNX policy writes joint/thrust *targets* into the
   pipeline — below the constraint layer, never above it.

Keyframe clips and blend trees exist as an additive authoring layer for cinematics,
never required for function.

## 3. Driver interface *(proposed)*

```ts
interface ArchetypeDriver<P> {
  readonly archetype: Archetype;
  readonly paramsSchema: TSchema;            // validated at contract admission
  init(model: CompiledModel, params: P): DriverState;
  tick(s: DriverState, input: InputFrame, dt: 1/120): JointTargets;
  reset(s: DriverState): void;
  focus?(s: DriverState): CameraHint;        // follow-camera hint
}
```

Drivers are registered in a versioned library; contracts name `archetype` + params.
Param schemas make driver configs LLM-generable and harness-checkable.

## 4. Algorithms (from Appendix C — the shipped math)

- **2-bone leg IK (closed form):** for hip-frame target (dy, dz): D = √(dy²+dz²)
  clamped below L1+L2; knee β = acos((D²−L1²−L2²)/2L1L2); γ = atan2(dz, −dy);
  δ = atan2(L2 sin β, L1+L2 cos β); hip pitch = −γ−δ; level ankle = −(hip+knee).
- **DLS arms:** Δθ = Jᵀ(JJᵀ + λ²I)⁻¹e; **FABRIK** as N-bone fallback.
- **Servo layer:** ẍ = ω²(x_t − x) − 2ζω·ẋ, semi-implicit Euler; stable for
  ω·dt < 2 (shipping ω 14–16, ζ 0.8–0.85); must pass BEH-002 at dt = 50 ms.
- **Quad mixer:** rpm_i = base + k_t·thr − k_p·p·s_z(i) − k_r·r·s_x(i) + k_y·y·dir(i).

## 5. Determinism & timing

Fixed 120 Hz tick in a worker; render interpolates. Zero per-frame allocation;
state mirrored via SharedArrayBuffer. Client determinism is tolerance-banded with
drift detection (D6) — bit-exactness is only claimed server-side. Budget: ≤ 3 ms of
the frame.

## 6. Dependencies

`contract`, `geometry` (interference queries), `engines/policy` (ONNX targets),
`engines/sim` (physics coupling for multirotor, P6).

## 7. Testing

Gait regression (stride/contact fixtures vs the prototype at P1); BEH-001 smoke per
archetype (biped 1 m walk; multirotor altitude ±5 cm; rover 1 m arc; quadruped/arm
analogues defined at P2-003/004); BEH-002 servo stability; IK unit tests against the
closed forms; determinism drift tests across browsers (tolerance bands).

## 8. Phase mapping & backlog

P1: port gait/IK/mixer/servos (P1-008). P2: driver library formalized + quadruped
(P2-003/004), param schemas into the harness. P6: physics coupling. P7: policy layer
consumes real ONNX outputs.

## 9. Open questions

Quadruped gait parameterization detail (stance/swing curve shapes — derive from
biped's proven curves); whether arm null-space posture bias is per-contract or
per-driver-default; input-tape format versioning shared with the replay system.
