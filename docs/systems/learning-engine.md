# Learning Engine — implementation doc

**Status:** deterministic training contract live; live SB3/MuJoCo adapter seams and MJX adoption helper live · **Phases:** P7 (service), P8+ (curricula from reality) ·
**Home:** `workers/training`, `forge-sim::heavy` (+ ONNX playback in `packages/studio`) ·
**Plan refs:** §7.5, §11, Appendix C (v3.0) · **Decisions:** D8, D17, D-evals
(adjacent)

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
Live 2026-06-14: `forge-sim::heavy` defines task kinds/specs and the
course-to-task adapter; `train.policy` emits task metadata and curriculum stage.

## 3. Observation/action contract

Derived from the ModelSpec, never hand-authored (P7-002):
- **Observations:** estimator state (D8 — never ground truth), joint
  angles/velocities, body IMU, target vectors in body frame.
- **Actions:** normalized joint or thrust targets, consumed by the motion engine's
  policy layer beneath the constraint layer.
- The **ONNX policy I/O header** (layout, scaling, archetype, contract hash) makes a
  policy portable metadata — it is what the skills marketplace lists and what
  transfer checks compare.

Live 2026-06-14: observation/action derivation is executable in Rust and the worker
emits an ONNX header with contract hash, task, observation count, and action count.

## 4. Training stack

PyTorch + Stable-Baselines3: **PPO** workhorse (clipped surrogate + GAE), **SAC**
where sample efficiency matters. Seeded, reproducible runs; config + code version +
contract hash + lockfile recorded as lineage (PRV-002). CPU MuJoCo handles
hover-class tasks overnight on one consumer GPU host; **MJX** adoption only after the
P7-010 benchmark says CPU PPO saturates (claims hedged until measured). Curriculum-
from-reality (P8+): behavior cloning over logged (o, a) pairs and conservative
offline RL over telemetry tapes.

Live 2026-06-14: `FORGE_SB3_TRAIN_CMD` can supply live SB3 output in the same
policy artifact shape, and `forge-sim::heavy::evaluate_mjx_adoption` encodes the
P7-010 rule: adopt MJX only when CPU MuJoCo/SB3 misses the overnight/budget target
by more than 25 %, MJX stays inside frozen parity bands, and cost-normalized
throughput is at least 3x.

## 5. Domain randomization (first-class config)

mass ±15 % · motor Kv ±8 % · battery sag ±20 % · actuation latency 0–30 ms · IMU
noise/bias · ground friction 0.4–1.2 · wind 0–4 m/s · observation dropout. The
randomization grid doubles as the **robustness axis of the scorecard**.

Live 2026-06-14: fixture policy jobs carry the default randomization block and tests
assert it is present in the artifact.

## 6. Scorecards (the gate)

`{successRate, robustness: grid results, energy, taskVersion, randomizationConfig,
lineage}`. Computed by the training service; under D17 the evaluation replays are
verifiable on any surface, with server re-verification as anti-cheat hygiene for
marketplace/leaderboard use. Gates: sub-threshold → no export;
**estimator smoke (SIM-004/D8)** — a policy whose performance collapses when run on
estimator output (i.e., trained on ground truth) is rejected at scorecard time.
Renderer in studio: XC-21.

## 7. Pipeline

`train-policy` job: contract → MJCF compile → env build (task + randomization) → SB3
run with checkpoints → ONNX export + I/O header → scorecard evaluation episodes →
artifacts to object storage, lineage to Postgres → studio notification → in-browser
playback through ONNX Runtime Web (P7-008).

Live 2026-06-14: the deterministic fixture path produces the ONNX/scorecard/header
artifact and Studio renders the scorecard, robustness grid, IO counts, ONNX
metadata, and a one-click playback control that feeds the policy action header
through `CoreSession`. `train.sysid-fit` estimates R_int plus a sim-block
JSON-Patch. Live SB3/MuJoCo training and ONNX Runtime Web inference remain adapter
work unless the external command/env integrations are configured.

## 8. Dependencies

`forge-sim` (MJCF compiler, estimator spec), `forge-contract` (schema for
obs/action derivation), MuJoCo/SB3/PyTorch in `workers/training`; ONNX Runtime Web
in the studio for playback. Co-design (P9) calls tier-2/3 evaluations through this
service.

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
