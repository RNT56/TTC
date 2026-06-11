# Learning Engine — implementation doc

**Status:** not started · **Phases:** P7 (service), P8+ (curricula from reality) ·
**Home:** `workers/training` + `packages/engines/policy` *(proposed)* · **Plan
refs:** §7.5, §11, Appendix C · **Decisions:** D6, D8, D-evals (adjacent)

## 1. Purpose

Turn an admitted contract into trained, portable, honestly-scored autonomy: tasks as
versioned environments, PPO/SAC training against the MuJoCo twin under domain
randomization, ONNX policies with derived I/O headers, and **scorecards as gatekeeper
artifacts** — sub-threshold policies do not export.

## 2. Tasks (versioned environment definitions)

v1 suite (P7-001): multirotor — hover-hold, waypoint chain, gate slalom, velocity
tracking; legged — walk-to-target, rough-terrain traverse, push recovery; rover —
line-follow, obstacle course; arm — reach/track. Task definition carries reward
terms, termination conditions, **curriculum stages** (hover before waypoints before
slalom), and randomization config. P10 makes community courses importable as tasks.

## 3. Observation/action contract

Derived from the ModelSpec, never hand-authored (P7-002):
- **Observations:** estimator state (D8 — never ground truth), joint
  angles/velocities, body IMU, target vectors in body frame.
- **Actions:** normalized joint or thrust targets, consumed by the motion engine's
  policy layer beneath the constraint layer.
- The **ONNX policy I/O header** (layout, scaling, archetype, contract hash) makes a
  policy portable metadata — it is what the skills marketplace lists and what
  transfer checks compare.

## 4. Training stack

PyTorch + Stable-Baselines3: **PPO** workhorse (clipped surrogate + GAE), **SAC**
where sample efficiency matters. Seeded, reproducible runs; config + code version +
contract hash + lockfile recorded as lineage (PRV-002). CPU MuJoCo handles
hover-class tasks overnight on one consumer GPU host; **MJX** adoption only after the
P7-010 benchmark says CPU PPO saturates (claims hedged until measured). Curriculum-
from-reality (P8+): behavior cloning over logged (o, a) pairs and conservative
offline RL over telemetry tapes.

## 5. Domain randomization (first-class config)

mass ±15 % · motor Kv ±8 % · battery sag ±20 % · actuation latency 0–30 ms · IMU
noise/bias · ground friction 0.4–1.2 · wind 0–4 m/s · observation dropout. The
randomization grid doubles as the **robustness axis of the scorecard**.

## 6. Scorecards (the gate)

`{successRate, robustness: grid results, energy, taskVersion, randomizationConfig,
lineage}`. Computed **server-side** (D6). Gates: sub-threshold → no export;
**estimator smoke (SIM-004/D8)** — a policy whose performance collapses when run on
estimator output (i.e., trained on ground truth) is rejected at scorecard time.
Renderer in studio: XC-21.

## 7. Pipeline *(proposed)*

`train-policy` job: contract → MJCF compile → env build (task + randomization) → SB3
run with checkpoints → ONNX export + I/O header → scorecard evaluation episodes →
artifacts to object storage, lineage to Postgres → studio notification → in-browser
playback through ONNX Runtime Web (P7-008).

## 8. Dependencies

`engines/sim` (MJCF compiler, estimator spec), `contract`, MuJoCo/SB3/PyTorch in
`workers/training`; `engines/policy` for the browser side. Co-design (P9) calls
tier-2/3 evaluations through this service.

## 9. Testing

Deterministic smoke-train on a tiny task in CI (minutes, fixed seed, asserts learning
signal); scorecard reproducibility (same seed → same card server-side); estimator-
smoke negative test (deliberately ground-truth-trained policy must be rejected);
header derivation unit tests across archetypes.

## 10. Phase mapping & backlog

P7: P7-001..010, XC-21. P8: BC/offline-RL ingestion from recorder logs (P7-009 seam).
P9: batch evaluation API for co-design. P11: skills marketplace consumes headers +
scorecards.

## 11. Open questions

Scorecard thresholds per task (set with P7 data, then frozen per task version);
fine-tune-on-corrected-twin workflow shape (post system-ID); MJX migration trigger
numbers (from P7-010).
