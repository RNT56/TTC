# Learning Engine — implementation doc

**Status:** deterministic training contract, protected controlled CPU SB3/MuJoCo
hover runtime, and real browser ONNX/WASM execution implemented; overnight
scorecard passage, object-backed delivery, deployed GPU operations, and field
transfer remain gated · **Phases:** P7 (service), P8+ (curricula from reality) ·
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

Live 2026-07-15: category labels remain transfer/search metadata, while the executable
browser boundary is independently versioned as `forge-policy-tensor` 1.0.0. Its
multirotor v1 input is an exact 11-scalar `[1, 11]` layout: estimator attitude and
corrupted gyro rates, body-frame target error, normalized battery voltage, and
normalized motor current. Its `[1, 4]` outputs are normalized throttle/roll/pitch/yaw
targets at at most 50 Hz. `CoreSession` derives observations inside Rust from the
contract estimator and inline physical constants; simulator truth never crosses the
WASM boundary. Unsupported archetypes/estimators, missing constants, non-finite or
out-of-bound targets, and layout drift refuse.

## 4. Training stack

PyTorch + Stable-Baselines3: **PPO** workhorse (clipped surrogate + GAE), **SAC**
where sample efficiency matters. Seeded, reproducible runs; config + code version +
contract hash + lockfile recorded as lineage (PRV-002). The P7 target is to train
hover-class tasks overnight on declared consumer hardware; **MJX** adoption only
after the P7-010 benchmark says CPU PPO saturates (claims hedged until measured). Curriculum-
from-reality (P8+): behavior cloning over logged (o, a) pairs and conservative
offline RL over telemetry tapes. These paths produce warmstarts first; they do not
become exportable policies until a fine-tune/evaluation job emits a passing
`p7-scorecard-v1`.

Live 2026-06-14: `FORGE_SB3_TRAIN_CMD` can supply live SB3 output, but every result
is normalized back through the P7 scorecard gate before export. External policies
must provide success, robustness grid, energy, estimator-source evidence, and
lineage; missing fields, provider rejection, or ground-truth training fail closed.
`forge-sim::heavy::evaluate_mjx_adoption` encodes the P7-010 rule: adopt MJX only
when CPU MuJoCo/SB3 misses the overnight/budget target by more than 25 %, MJX stays
inside frozen parity bands, and cost-normalized throughput is at least 3x.
The worker-side `mjx_benchmark_report` applies the same rule to payload or
`FORGE_MJX_BENCH_CMD` output and blocks adoption unless D12 quad, D12 rover, and one
legged morphology all have benchmark evidence.

Protected through PR #64/`d1c4c38` on 2026-07-15: the gateway, validator, Rust
simulator, and Python worker form one fail-closed training authority chain. The
gateway accepts an owned admitted `modelId`, freezes the admitted contract as
`forge-admitted-model-snapshot` 1.0.0, and rejects caller-supplied snapshots or hash
drift. `forge-validate training-bundle` re-runs sovereign admission over the exact
snapshot bytes and emits a `trainingMuJoCoBundle` 1.0.0 derived from Rust contract
truth. The native worker runs seeded PPO or SAC with exact NumPy 2.5.1, Gymnasium
1.3.0, CPU PyTorch 2.13.0, Stable-Baselines3 2.9.0, ONNX 1.22.0, and MuJoCo 3.9.0,
then records dependency versions, seed, source/contract/config digests, and model
parameter digests in lineage. Unsupported roots, archetypes, estimators, physical
constants, runtime versions, payloads, or snapshot hashes refuse before training.

The initial real environment is intentionally narrow: a floating-root multirotor
hover task with 11 estimator-only observations and four normalized actions. It uses
the Rust-derived MJCF, hover trim, mass, gravity, 101-point powertrain curve, control
bounds, and declared torque assumptions. Randomization covers mass, motor Kv,
battery sag, actuation latency, friction, wind, sensor noise/bias, and observation
dropout. Evaluation records baseline, mass +15 %, Kv -8 %, and 4 m/s wind scenarios.
This establishes a controlled local/CI CPU training runtime; it does not establish
overnight scorecard passage, waypoint/general-archetype coverage, GPU economics, or
field transfer.

## 5. Domain randomization (first-class config)

mass ±15 % · motor Kv ±8 % · battery sag ±20 % · actuation latency 0–30 ms · IMU
noise/bias · ground friction 0.4–1.2 · wind 0–4 m/s · observation dropout. The
randomization grid doubles as the **robustness axis of the scorecard**.

Live 2026-06-14: fixture policy jobs carry the default randomization block and tests
assert it is present in the artifact. The P7 v1 task suite now has versioned
environment definitions for hover, waypoint, slalom, velocity tracking, legged,
rover, and arm reach tasks, and `train.policy` emits the selected definition.

Protected through PR #64/`d1c4c38` on 2026-07-15: the real hover environment applies
each declared randomization source in execution rather than merely serializing the
configuration. The same seed reproduces the exported ONNX digest in focused PPO and
SAC tests.

## 6. Scorecards (the gate)

`p7-scorecard-v1 = {successRate, robustness: grid results, energyWh,
trainedOnEstimator, taskVersion, lineage, thresholds, exportable, reasons}`.
Computed by the training service; under D17 the evaluation replays are verifiable on
any surface, with server re-verification as anti-cheat hygiene for
marketplace/leaderboard use. Gates: sub-threshold → no export;
**estimator smoke (SIM-004/D8)** — a policy whose performance collapses when run on
estimator output (i.e., trained on ground truth) is rejected at scorecard time.
Renderer in studio: XC-21.

Live 2026-06-14: fixture and external SB3 policy artifacts both pass through this
schema and export gate. The ONNX metadata carries `exportable: false` whenever the
scorecard is blocked, and the gateway stores the same state as a blocked export
gate.

Behavior-cloning/offline-RL adapters are intentionally stricter: `FORGE_OFFLINE_RL_CMD`
normalizes external output into a dataset and warmstart artifact, validates sample
count and action columns, and always keeps the scorecard non-exportable until a
separate live fine-tune/evaluation run passes the policy gate.

System-ID follows the same fail-closed rule for P8: `FORGE_SYSID_FIT_CMD` output is
normalized through `train.sysid-fit`, and a live bench/log fit is accepted only when
it has at least three samples, an accepted fit marker, and a non-empty contract
`simPatch`.

## 7. Pipeline

`train-policy` job: contract → MJCF compile → env build (task + randomization) → SB3
run with checkpoints → ONNX export + I/O header → scorecard evaluation episodes →
artifacts to object storage, lineage to Postgres → studio notification → in-browser
playback through ONNX Runtime Web (P7-008).

Live 2026-06-14: the deterministic fixture path produces the ONNX/scorecard/header
artifact and Studio renders the scorecard, robustness grid, IO counts, ONNX
metadata, and a one-click playback control that feeds the policy action header
through `CoreSession`. `train.sysid-fit` estimates R_int plus a sim-block
JSON-Patch, and `train.offline-bc` builds deterministic sorted behavior-cloning
datasets plus warmstart artifact metadata from telemetry tapes. Controlled native
SB3/MuJoCo training is protected through P7-003; offline-RL fine-tune remains adapter
work unless the external command/env integration is configured.

Protected through PR #64/`d1c4c38` on 2026-07-15:
`workers/.../sb3_runner.py` is the native JSON command boundary used by
`FORGE_SB3_TRAIN_CMD`. The required CI worker job installs the exact CPU training
stack, runs the complete worker suite, and executes a tiny source-bound hover smoke
through the same gateway-shaped snapshot and Rust bundle path. The smoke proves real
simulation, optimization, deterministic fixed-shape opset-18 ONNX export, and
scorecard generation, but is deliberately too short to claim a passing policy.
Durable object upload, one-click Studio queueing/download, deployed Modal/GPU proof,
and an overnight passing run remain P7-011..013.

Live 2026-07-15: the hover fixture is a real 906-byte opset-18 Gemm+Tanh ONNX graph,
generated with ONNX 1.19.1 and bound by SHA-256
`222102cc9a55192f00696399f553781ffc095f6fc0e3195d7456fed01a564d62`.
Studio dynamically imports exact `onnxruntime-web` 1.27.0's WASM-only entry only when
the owner presses play, verifies exportable estimator-backed scorecard authority,
contract lineage, tensor schema/version/frame/layout/shapes/rate, strict base64,
byte count, digest, runtime names, output type/shape, finiteness, and normalized
bounds, then runs inference asynchronously at 50 Hz while the 120 Hz Rust motion
loop consumes the last safe action. A missed inference holds the previous bounded
advisory; any error zeros commands and stops playback. Non-hover keyless fixture
tasks remain held rather than fabricating model bytes. Inline external model bytes
can traverse the existing worker seam, but object-backed live-model download remains
P7-011/operations work and is not claimed here.

## 8. Dependencies

`forge-sim` (MJCF compiler, estimator spec), `forge-contract` (schema for
obs/action derivation), exact Python 3.12, NumPy 2.5.1, Gymnasium 1.3.0, CPU PyTorch 2.13.0,
Stable-Baselines3 2.9.0, ONNX 1.22.0, and MuJoCo 3.9.0 in `workers/training`; exact
`onnxruntime-web` 1.27.0 in the Studio for lazy WASM playback. Runtime integration
follows the official [ONNX Runtime Web tutorial](https://onnxruntime.ai/docs/tutorials/web/)
and [deployment guidance](https://onnxruntime.ai/docs/tutorials/web/deploy.html):
conditional WASM import, same-origin bundled assets, and explicit WASM execution.
Co-design (P9) calls tier-2/3 evaluations through this service.

Installed metadata records NumPy's BSD/0BSD/MIT/Zlib/CC0 license expression,
Gymnasium and Stable-Baselines3 as MIT, PyTorch's Apache/LLVM/BSD/Boost/MIT set,
and ONNX plus MuJoCo as Apache-2.0. Required security CI installs only the exact
reviewed CPU stack with binary dependencies, upgrades to exact pip 26.1.2, and runs
exact pip-audit 2.10.1 against the installed environment; an advisory blocks the
existing dependency-audit check.

The native exporter currently selects PyTorch's pinned legacy TorchScript ONNX path
to obtain a deterministic, fixed-shape graph compatible with the browser contract.
Its deprecation warnings are expected under the exact pin; migration to the newer
exporter requires a reviewed parity change, regenerated evidence, and confirmation
that names, shapes, opset, digests, and browser execution remain authoritative.

## 9. Testing

Deterministic smoke-train on a tiny task in CI (minutes, fixed seed, asserts learning
signal); scorecard reproducibility (same seed → same card server-side); estimator-
smoke negative test (deliberately ground-truth-trained policy must be rejected);
header derivation unit tests across archetypes.

P7-008 adds Rust observer determinism/missing-authority tests, Python and gateway
fixture digest/tensor tests, six Studio runtime tests including actual ONNX Runtime
WASM inference plus tamper/held/D8/lineage/layout/version/non-finite refusals, and a
production-browser flow that proves the ONNX JS/WASM assets are absent from first
paint, load same-origin on demand, and execute through the Rust observer/motion path.

P7-003 adds Rust training-bundle tests, gateway ownership/snapshot/hash
tests, strict Python bundle tests, real MuJoCo environment tests, PPO and SAC command
boundary tests, same-seed ONNX digest checks, dependency-pin assertions, and a
required controlled training smoke. The full worker suite must run with the training
extra installed; a skipped or fixture-only runtime is not acceptance evidence.

## 10. Phase mapping & backlog

P7: P7-001..010, XC-21. P8: BC/offline-RL ingestion from recorder logs (P7-009 seam).
P9: batch evaluation API for co-design. P11: skills marketplace consumes headers +
scorecards.

## 11. Open questions

Scorecard thresholds per task (set with P7 data, then frozen per task version);
durable object-backed policy delivery and one-click Studio orchestration; the
overnight passing hover/waypoint envelope; fine-tune-on-corrected-twin workflow
shape (post system-ID); MJX migration trigger numbers (from P7-010).
