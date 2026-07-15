# Learning Engine — implementation doc

**Status:** deterministic training contract, protected controlled CPU SB3/MuJoCo
hover and real sequential-waypoint runtime, lease-fenced exact object-backed
one-click delivery, real browser ONNX/WASM execution, and a controlled CPU MuJoCo/
MJX feasibility harness implemented; overnight scorecard passage, decision-grade D12
accelerator evidence, deployed GPU/storage operations, and field transfer remain
gated · **Phases:** P7 (service), P8+ (curricula from reality) ·
**Home:** `workers/training`, `forge-sim::heavy` (+ ONNX playback in `packages/studio`) ·
**Plan refs:** §7.5, §11, Appendix C (v3.0) · **Decisions:** D8, D17, D39, D40, D41,
D-evals (adjacent)

## 1. Purpose

Turn an admitted contract into trained, portable, honestly-scored autonomy: tasks as
versioned environments, PPO/SAC training against the MuJoCo twin under domain
randomization, ONNX policies with derived I/O headers, and **scorecards as gatekeeper
artifacts** — sub-threshold policies do not export.

## 2. Tasks (versioned environment definitions)

The historical v1 suite (P7-001) established the stable task IDs: multirotor —
hover-hold, waypoint chain, gate slalom, velocity
tracking; legged — walk-to-target, rough-terrain traverse, push recovery; rover —
line-follow, obstacle course; arm — reach/track. Task definition carries reward
terms, termination conditions, **curriculum stages** (hover before waypoints before
slalom), and randomization config. P10 makes community courses importable as tasks.
Live 2026-06-14: `forge-sim::heavy` defines task kinds/specs and the
course-to-task adapter; `train.policy` emits task metadata and curriculum stage.

Protected 2026-07-15 through PR #70/`f220d25` under D41: new tasks initially emitted
`p7-v2`/`2.0.0`, explicit
`forge-y-up-rh-m`, and a SHA-256 over canonical sorted task JSON without the
self-referential hash field. Every built-in 3D spawn, bound, target, gate, obstacle,
and arm point is now expressed in Forge Y-up; 2D rover paths declare the `xz` plane.
Stable task IDs are unchanged. `p7-v1` evidence is retained as historical/legacy
read input and is never silently reinterpreted as v2.

D42 advances the current executable multirotor task to `p7-v3`/3.0.0. Stable IDs
and Y-up coordinates remain, but v3 additionally binds the corrected Y-up angular
axis order, normalized-flight-target inner loop, estimator velocity filter, reward
coefficients, and full-chain completion meaning. Task v2 remains immutable evidence;
it is not relabeled or rewritten as v3.

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
browser boundary is independently versioned as `forge-policy-tensor`. D42 makes v2
current with an exact 14-scalar `[1, 14]` input: estimator attitude, corrupted gyro
rates, estimator-derived body-frame linear velocity, body-frame target error,
normalized battery voltage, and normalized motor current. Its `[1, 4]` outputs are
normalized collective/roll/pitch/yaw flight targets at no more than 50 Hz; zero
collective maps to contract-derived hover trim rather than half of maximum thrust.
`CoreSession` derives observations inside Rust from the contract estimator and inline
physical constants; simulator truth never crosses the WASM boundary. Tensor-v1's
exact `[1, 11]` observer and 906-byte ONNX oracle remain readable through explicit
version selection. Unsupported majors/archetypes/estimators, missing constants,
non-finite or out-of-bound targets, and cross-version layout drift refuse.

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

P7-010 now has a deliberately narrower executable foundation. The
`mjxBenchmarkRequest` 1.0.0 command compiles the admitted `vx2-mini` snapshot through
the sovereign Rust `training-bundle` path, then runs the same fixed initial states,
controls, Newton solver, float64 precision, 0.005 s timestep, and 64-step scan through
MuJoCo 3.9.0's native multithreaded `rollout.Rollout` and `mujoco-mjx` 3.9.0 on exact
JAX/JAXLIB 0.10.2. The frozen 16-scene protocol uses seeded 1,000 microradian/s
velocity perturbations and nonzero 100 nanonewton-meter motor controls so the
low-inertia rotor joints remain inside a meaningful parity trajectory. It separates
lowering/compilation, warms both engines, synchronizes every JAX pytree, records all
timed samples and medians, and enforces qpos `1e-4`/qvel `5e-4` absolute bands.

The resulting `mjx-benchmark` 1.0.0 report is source/request/contract/MJCF/runtime/
hardware-bound and intentionally decision-ineligible. The current reference row is
`p7-hover-multirotor`, not D12 quad, D12 rover, or legged; CPU-backed JAX is not a
declared accelerator; and it has no PPO/SAC overnight, tier-2 budget, energy, or cost
evidence. The central report therefore preserves every missing-morphology,
accelerator, budget, cost, throughput, and dirty-source blocker. P9 tier-2/3 batching
remains forbidden unless later clean protected D12 evidence clears the existing
adoption rule.

Protected through PR #64/`d1c4c38` on 2026-07-15: the gateway, validator, Rust
simulator, and Python worker form one fail-closed training authority chain. The
gateway accepts an owned admitted `modelId`, freezes the admitted contract as
`forge-admitted-model-snapshot` 1.0.0, and rejects caller-supplied snapshots or hash
drift. `forge-validate training-bundle` re-runs sovereign admission over the exact
snapshot bytes; D42's current output is `trainingMuJoCoBundle` 2.0.0 derived from
Rust contract truth, while v1 remains historical. The native worker runs seeded PPO
or SAC with exact NumPy 2.5.1, Gymnasium
1.3.0, CPU PyTorch 2.13.0, Stable-Baselines3 2.9.0, ONNX 1.22.0, and MuJoCo 3.9.0,
then records dependency versions, seed, source/contract/config digests, and model
parameter digests in lineage. Unsupported roots, archetypes, estimators, physical
constants, runtime versions, payloads, or snapshot hashes refuse before training.

The protected initial environment remains the floating-root multirotor hover task.
P7-014 generalized that same sovereign runtime to the worker-owned `hover-hold` and
`waypoint-chain` v2 definitions. D42's P7-012 implementation corrects that runtime
under task v3 with 14 estimator-only observations and four normalized flight-target
actions. It uses
the Rust-derived MJCF, hover trim, mass, gravity, 101-point powertrain curve, control
bounds, and declared torque assumptions. Randomization covers mass, motor Kv,
battery sag, actuation latency, friction, wind, sensor noise/bias, and observation
dropout. Waypoints advance in declared order only when the estimator-derived body-
frame target-error norm reaches the active radius; MuJoCo truth remains available
only for bounded safety termination and never enters policy observation or target
authority. Evaluation records baseline, mass +15 %, Kv -8 %, and 4 m/s wind
scenarios; waypoint success requires the complete chain, not a partial success
fraction. Protected PR #70 and clean artifact `8342801418` establish a controlled
CPU runtime for both multirotor tasks. The implementation candidate now adds a
frozen `p7-overnight-v1` curriculum: estimator-only deterministic-controller
distillation followed by conservative randomized PPO, eight held-out episodes per
baseline/mass/Kv/wind row, exact source/runtime/hardware lineage, resumable atomic
task checkpoints, retained ONNX bytes, and a separate host-energy upper bound. Local
M2 Pro diagnostics pass both frozen tasks at 1.0 success/robustness without changing
the scorecard; protected clean-source evidence is still required before P7-012 closes.
This does not establish rover/legged coverage, deployed GPU operations, production
economics, external users, or field transfer.

## 5. Domain randomization (first-class config)

mass ±15 % · motor Kv ±8 % · battery sag ±20 % · actuation latency 0–30 ms · IMU
noise/bias · ground friction 0.4–1.2 · wind 0–4 m/s · observation dropout. The
randomization grid doubles as the **robustness axis of the scorecard**.

Live 2026-06-14: fixture policy jobs carry the default randomization block and tests
assert it is present in the artifact. The task suite has versioned
environment definitions for hover, waypoint, slalom, velocity tracking, legged,
rover, and arm reach tasks, and `train.policy` emits the selected definition. D41
advanced the coordinate-frame correction to task v2. D42 advances the current
multirotor task to v3 and tensor to v2 because velocity state, axis order, normalized
action interpretation, reward, and inner-loop control are semantic changes.

Protected through PR #64/`d1c4c38` on 2026-07-15: the real hover environment applies
each declared randomization source in execution rather than merely serializing the
configuration. The same seed reproduces the exported ONNX digest in focused PPO and
SAC tests. P7-012's frozen curriculum samples the same complete envelope during
training and evaluates exact held-out baseline, mass +15%, Kv -8%, and wind 4 m/s
rows without weakening `p7-scorecard-v1`'s 0.85/0.70 thresholds.

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
stack, runs the complete worker suite, and executes the source-bound training smoke
through the same gateway-shaped snapshot and Rust bundle path. Protected P7-014 PR
#70 upgrades that artifact to schema 2.0 and runs both hover-hold and waypoint-chain
for 256 PPO steps. It verifies exact task version/frame/hash across task metadata,
config, scorecard lineage and ONNX header, plus real optimization and byte/digest-valid
fixed-shape opset-18 export. Both scorecards are deliberately blocked; the smoke is
too short to claim learning quality.
Protected artifact `8342801418` self-binds the two blocked outputs to clean source
`f220d25`; this satisfies D40's executable-waypoint prerequisite without claiming
learning quality. P7-011 is protected through PR #68/`9131289`: durable object
upload, one-click Studio queueing/download/playback, isolated Postgres/S3-compatible
acceptance, and the
production-browser path are closed at controlled sandbox maturity. Deployed Modal/
GPU proof and a protected overnight passing run remain P7-012..013; D40's real-waypoint
prerequisite is now satisfied. The P7-012 implementation candidate adds
`python -m forge_workers.training.overnight_evidence`: it freezes both task seeds,
recipe, scorecard thresholds, exact runtime, safe hardware inventory, CPU device, and
operator-declared power bound into one request hash; writes each passing JSON/ONNX
pair atomically; validates request hash, byte count, digest, and exportability before
resume; and deliberately supports interruption after either task. Failed/tampered
checkpoints never become reusable authority.

Live 2026-07-15: the current hover fixture is a real 1,056-byte tensor-v2 opset-18
Gemm+Tanh ONNX graph bound by SHA-256
`48c08ad27c27a5e78bb3b63ea722c14a2a8e35095c8a45ecbc1d8042f27976a0`.
The historical 906-byte tensor-v1 graph remains an executable read-compatibility
oracle at SHA-256 `222102cc9a55192f00696399f553781ffc095f6fc0e3195d7456fed01a564d62`.
Studio dynamically imports exact `onnxruntime-web` 1.27.0's WASM-only entry only when
the owner presses play, verifies exportable estimator-backed scorecard authority,
contract lineage, tensor schema/version/frame/layout/shapes/rate, strict base64,
byte count, digest, runtime names, output type/shape, finiteness, and normalized
bounds, then runs inference asynchronously at 50 Hz while the 120 Hz Rust motion
loop consumes the last safe action. A missed inference holds the previous bounded
advisory; any error zeros commands and stops playback. Non-hover keyless fixture
tasks remain held rather than fabricating model bytes.

The protected P7-014 Studio consumer preserves that legacy single-target read path
and adds bounded v2 target chains. It requires exact task suite/version/frame/hash
agreement across task metadata, scorecard lineage, and the ONNX header. For waypoint policies,
the controller requests the current target from `CoreSession`, advances only from
the returned estimator target-error scalars, requests a fresh snapshot for the next
target before inference, and zeroes advisories after completing the chain. Render
state and simulator truth do not authorize progression.

P7-011 treats inline bytes as transient producer transport. The current D38 attempt
uploads one exact owner content-addressed object and a serializable
transaction materializes one job-bound, byte-free policy whose delivery metadata
binds the model revision, scorecard, tensor header, lineage, size, and digest.
Studio's one-click action selects the active admitted model, creates the appropriate
fixture or configured-local job with an idempotency key, polls to a terminal state,
then requests the retained bytes through the authenticated same-origin policy-model
route. Both gateway and Studio rehash before ONNX runtime creation. Protected
artifact `8340587390` self-binds to clean `9131289` and proves one winner, stale-
upload prevention, byte-free persistence, substitution refusal, cancellation
without database authority, exact readback, 22 migrations, all 11 product-browser
flows, and the declared three-browser matrix. This does not prove production
object-store durability/SLO or bounded orphan cleanup; OPS-006 owns those operations.

## 8. Dependencies

`forge-sim` (MJCF compiler, estimator spec), `forge-contract` (schema for
obs/action derivation), exact Python 3.12, NumPy 2.5.1, Gymnasium 1.3.0, CPU PyTorch 2.13.0,
Stable-Baselines3 2.9.0, ONNX 1.22.0, MuJoCo/MuJoCo-MJX 3.9.0, and JAX/JAXLIB
0.10.2 in `workers/training`; exact
`onnxruntime-web` 1.27.0 in the Studio for lazy WASM playback. Runtime integration
follows the official [ONNX Runtime Web tutorial](https://onnxruntime.ai/docs/tutorials/web/)
and [deployment guidance](https://onnxruntime.ai/docs/tutorials/web/deploy.html):
conditional WASM import, same-origin bundled assets, and explicit WASM execution.
Co-design (P9) calls tier-2/3 evaluations through this service.

Installed metadata records NumPy's BSD/0BSD/MIT/Zlib/CC0 license expression,
Gymnasium and Stable-Baselines3 as MIT, PyTorch's Apache/LLVM/BSD/Boost/MIT set,
and ONNX, MuJoCo/MuJoCo-MJX, JAX, and JAXLIB as Apache-2.0. Required security CI installs only the exact
reviewed CPU stack with binary dependencies, upgrades to exact pip 26.1.2, and runs
exact pip-audit 2.10.1 against the installed environment; an advisory blocks the
existing dependency-audit check.

Benchmark timing follows the official
[JAX benchmarking guidance](https://docs.jax.dev/en/latest/benchmarking.html) and
[MuJoCo MJX guidance](https://mujoco.readthedocs.io/en/latest/mjx.html): compile and
warm up before steady-state timing, synchronize asynchronous work, and use MJX for
large identical batches rather than assuming one CPU scene is faster. The native
reference uses MuJoCo's official
[`rollout` API](https://mujoco.readthedocs.io/en/latest/python.html#rollout).

The native exporter currently selects PyTorch's pinned legacy TorchScript ONNX path
to obtain a deterministic, fixed-shape graph compatible with the browser contract.
Its deprecation warnings are expected under the exact pin; migration to the newer
exporter requires a reviewed parity change, regenerated evidence, and confirmation
that names, shapes, opset, digests, and browser execution remain authoritative.

## 9. Testing

Deterministic smoke-train on hover and waypoint tasks in CI (minutes, fixed seeds, asserts learning
signal); scorecard reproducibility (same seed → same card server-side); estimator-
smoke negative test (deliberately ground-truth-trained policy must be rejected);
header derivation unit tests across archetypes.

P7-008 adds Rust observer determinism/missing-authority tests, Python and gateway
fixture digest/tensor tests, Studio runtime tests including actual ONNX Runtime
WASM inference plus tamper/held/D8/lineage/layout/version/non-finite refusals, and a
production-browser flow that proves the ONNX JS/WASM assets are absent from first
paint, load same-origin on demand, and execute through the Rust observer/motion path.

P7-003 adds Rust training-bundle tests, gateway ownership/snapshot/hash
tests, strict Python bundle tests, real MuJoCo environment tests, PPO and SAC command
boundary tests, same-seed ONNX digest checks, dependency-pin assertions, and a
required controlled training smoke. The full worker suite must run with the training
extra installed; a skipped or fixture-only runtime is not acceptance evidence.

P7-012 adds v1/v2 observer and real ONNX compatibility oracles, Y-up axis and
velocity-aware controller tests, frozen-recipe refusal tests, exact CPU/MPS device
authority with no fallback, interruption/resume/tamper recovery tests, safe hardware
redaction, host-energy nonclaims, and passing exact-seed diagnostics for both tasks.
Closure additionally requires a clean protected revision, intentional interrupt then
resume, downloaded JSON/ONNX digest verification, and protected CI/security.

P7-011 adds gateway/Studio/worker unit coverage plus protected isolated-Postgres and
S3-compatible acceptance. Protected artifact `8340587390` proves stale-lease refusal
before upload, one winner with byte-free persisted metadata, cancellation during
upload without database authority, digest-substitution refusal, exact retained-
object readback, and one Studio action that creates the owned-model job and fetches
the authenticated object. Keep this evidence required on delivery changes; a
database-only row or fixture inline bytes cannot preserve the closed task.

P7-010 adds strict request/hash/runtime/protocol and central-decision tests plus a
required real feasibility command. Run it under Python 3.12 with
`workers[dev,mujoco,training,mjx]`, `JAX_ENABLE_X64=1`, and an executable
`FORGE_VALIDATE_BIN`. Inspect the retained JSON rather than trusting the console
summary: source/checkout cleanliness, exact pins/devices, compile and sample times,
absolute parity errors, and every decision blocker are acceptance-critical.

## 10. Phase mapping & backlog

P7: P7-001..014, XC-21. P8: BC/offline-RL ingestion from recorder logs (P7-009 seam).
P9: batch evaluation API for co-design. P11: skills marketplace consumes headers +
scorecards.

## 11. Open questions

Scorecard thresholds beyond the frozen multirotor v3 0.85/0.70 gate; policy-object
orphan inventory/reconciliation; protected overnight evidence publication; fine-tune-
on-corrected-twin workflow shape (post system-ID); exact D12 quad/rover/legged
benchmark contracts, declared accelerator and cost source, and the CPU overnight/
tier-2 budget envelope needed to finish P7-010.
