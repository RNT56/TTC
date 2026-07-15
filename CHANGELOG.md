# CHANGELOG

This file is the project's memory between working sessions. **Every session — human or
AI agent — appends an entry here before it ends.** Newest entries first. Never rewrite
or delete prior entries; append corrections as new entries instead.

Entry format (see [`AGENTS.md`](AGENTS.md) for the rules):

```markdown
## YYYY-MM-DD — Short imperative title
**Session:** <agent/branch> · **Phase:** <Px / pre-P0> · **TODO items:** <IDs or none>
**Done:** What was actually completed (verified, not intended).
**Changed:** Files/areas touched.
**Decisions:** New/changed DECISIONS.md entries, or "none".
**Next:** The single most useful next step for whoever picks this up.
**Blockers:** Anything stopping progress, or "none".
```

---

## 2026-07-15 — Protect contract-derived rover and quadruped training
**Session:** Codex agent · branch `codex/p7014-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-014 [x]
**Done:** Closed P7-014 at controlled deterministic trainer maturity. PR #75 exact
implementation head `c0f3a8f` passed CI `29433820358` and security `29433818798`;
its synthetic merge `623d392` had exact protected parent `333e779` and exact
implementation head. Protected squash `90b1691` passed post-merge CI `29448974932`
and security `29448974951`. Downloaded protected artifact `8356753424` self-binds
to clean source `90b1691` and hashes as `20f0c25d…56ba`. Independent base64 decode,
SHA-256 recomputation, ONNX parsing/checking, graph-shape inspection, and metadata
comparison validate hover 23,874 bytes/`6b18908f…c555`, waypoint 23,878/
`783753e3…4927`, rover 22,520/`fa6c3cac…e4ad`, and quadruped 28,890/
`b400ac71…8c2e`. All four paths bind exact contract/task/tensor lineage, run 256 CPU
PPO steps with optimizer changes and estimator-only observations, and retain honest
blocked scorecards. Ground rows additionally preserve exact mass +15%, torque -10%,
friction -50%, and simulated-positive-mechanical-joint-work semantics. The exact-head
local 39-step gate plus protected required matrix cover 174 worker tests, 13 Studio
tests, the four-task smoke, Postgres/MinIO/browser acceptance, engine/MJX evidence,
security, and patch hygiene. A direct
stable-ID recount corrects the living summary to 205 total: 146 done, 33 in progress,
25 open, and 1 blocked.
**Changed:** Canonical agent boundary; project state; roadmap and atomic TODO;
execution sequencing; learning, worker, and Studio system docs; and this changelog.
No runtime, schema, golden, generated artifact, dependency, or threshold changed.
**Decisions:** none; D44 remains binding.
**Next:** Execute P7-009's remaining live offline fine-tune adapter as the smallest
dependency-complete local P7 lane, preserving deterministic dataset/warmstart evidence
and fail-closed live-provider authority.
**Blockers:** none for P7-014 controlled trainer closure. Passing ground policies,
browser ground playback, deployed GPU operations, external users, devices, and field
transfer remain separate tasks and must not inherit this smoke claim.

## 2026-07-15 — Implement contract-derived rover and quadruped training
**Session:** Codex agent · branch `codex/p7014-ground-trainers` · **Phase:** P7 ·
**TODO items:** P7-014 [~]
**Done:** Implemented the unprotected P7-014 ground-training candidate without
claiming protected or learning-quality completion. D44 introduces independent
`groundTrainingMuJoCoBundle`, `p7-ground-v1`, and
`forge-ground-policy-tensor` 1.0.0 boundaries while preserving every multirotor
major. Rust now derives a strict flat-ground MuJoCo bundle from admitted rover and
quadruped contracts, including exact joint names, position/velocity/torque limits,
differential-drive wheel geometry, QD-mini joint channels, and unsupported-shape
refusals. The worker admits only built-in line-follow and walk-to-target semantics,
keeps policy observations estimator/encoder-derived, randomizes mass, friction,
latency, sensor quality, and torque degradation without exceeding contract
authority, and reports simulated positive mechanical joint work rather than host or
battery energy. Real seeded PPO/ONNX training, evaluation, outer-worker authority,
scorecard, tamper, same-seed, and Studio-refusal tests are present. Focused evidence
is green: 39 Python tests, 13 Studio runtime tests, 15 compatibility surfaces, and a
four-task 256-step MuJoCo/SB3/ONNX smoke whose sub-threshold outputs remain correctly
blocked. QD-mini now carries generator-owned torque limits and physically owned leg
segments, with its registered Studio mirror and generated contract catalog covered
by an append-only golden review record. The first complete gate stopped correctly
on QD-mini's changed bake hash; the registry-owned generator advanced only that hash,
while all counts and its 600-step tick hash remained exact. The complete 39-step
`pnpm verify` gate then passed under Python 3.12, including Rust fmt/Clippy/workspace,
fresh and committed native/WASM parity, 13 Studio runtime tests, 65 gateway tests,
Brief-25 25/25, packaging, all 174 worker tests, four-task real training smoke,
controlled MJX feasibility, and patch hygiene.
**Changed:** Rust generator, training compiler, validator CLI, QD-mini contract;
Python ground environment, bundle/task/runtime/job authority and tests; four-task
smoke and CI label; compatibility and generated artifact catalog; Studio unsupported-
tensor refusal; canonical agent, decision, project-state, roadmap, TODO, execution,
best-practice, compatibility, model, simulation, learning, worker, and Studio docs;
native/WASM golden number plus golden record; and this changelog.
**Decisions:** D44 makes ground training an exact independent internal contract,
requires explicit contract control authority and estimator/encoder observations,
defines simulated mechanical work narrowly, and refuses browser execution until a
ground consumer is reviewed.
**Next:** Publish the exact rebased head through PR CI/security, inspect the retained
four-task artifact, merge, verify protected post-merge evidence, and only then
reconcile P7-014 to `[x]`.
**Blockers:** none for local implementation/publication. Passing learned ground
policies, browser execution, accelerator use, host/device energy, deployed GPU
operations, external acceptance, real-device transfer, and field proof are not
established by this deterministic smoke candidate.

## 2026-07-15 — Reconcile the protected P7-012 evidence anchor
**Session:** Codex agent · branch `codex/p7012-evidence-reconcile` · **Phase:** P7 ·
**TODO items:** P7-012 [x], P7-014 [~]
**Done:** Reconciled P7-012's implementation and retained-evidence authorities after
both protected changes completed. PR #72 exact implementation head `1bce0d1` passed
CI `29425066833` and security `29425066479`; protected implementation squash
`8e094c0` passed post-merge CI `29426237373` and security `29426237345`. PR #73 exact
evidence head `ecc83d0` passed CI `29428754530` and security `29428751871`; protected
evidence squash `6bfa60f` passed post-merge CI `29429475932` and security
`29429476183`. The canonical current-state surfaces now distinguish the executable
implementation source from the later protected commit that actually retains the
clean interruption/resume JSON, ONNX, and hash manifest.
**Changed:** Canonical agent boundary; project state, roadmap, TODO, execution
sequencing, learning/worker/Studio system guidance, and this changelog.
**Decisions:** none; this is an evidence-lineage correction under existing D42/D43.
**Next:** Complete P7-014's rover and legged trainers with contract-derived authority,
estimator-only observations, task/tensor compatibility, scorecards, deterministic
smoke, export integrity, and explicit unsupported-shape refusals.
**Blockers:** none for the local P7-014 slice. External users, deployed GPU operations,
measured host electricity, real devices, and field transfer remain separate proof.

## 2026-07-15 — Protect and reconcile consumer-hardware learning quality
**Session:** Codex agent · branch `codex/p7012-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-012 [x], P7-014 [~]
**Done:** Protected the P7-012 implementation through PR #72. Exact head `1bce0d1`
passed PR CI `29425066833` and security `29425066479`; protected squash `8e094c0`
passed post-merge CI `29426237373` and security `29426237345`. A clean protected
checkout on the declared Apple M2 Pro host intentionally interrupted after atomic
hover retention, confirmed no suite-success file existed, then resumed by validating
the frozen request, byte count, SHA-256, and export gate before executing waypoint.
Both eight-episode baseline and mass +15%/Kv -8%/wind 4 m/s rows pass at 1.0 under
unchanged 0.85/0.70 thresholds. Hover took 30.203 s and retained a 78,152-byte ONNX
at `9afc1152…fc4c`; waypoint took 10.340 s and retained 78,156 bytes at
`b07b023a…b1a2`. Independent reconciliation parsed both ONNX graphs, recomputed all
file digests/counts, confirmed exact `8e094c0` lineage, and found no serial/UUID or
inline model bytes. The evidence checkout then passed the complete 39-step
`pnpm verify` gate under its pinned Python 3.12 environment, including all 163
worker tests, 12 Studio policy-runtime tests, 65 gateway tests, Rust/WASM and
native/WASM parity, packaging, dual real seeded training smoke, MJX feasibility,
compatibility, security, and patch hygiene. The exact suite/task JSON, ONNX files,
and hash manifest are committed under `docs/evidence/p7-012/`.
**Changed:** P7-012 retained evidence and README; canonical agent boundary; project
state, roadmap, TODO, execution sequencing, best practices, learning/worker/Studio
system guidance, and this changelog.
**Decisions:** none; D42 and D43 are now backed by protected implementation and clean
consumer-hardware evidence.
**Next:** Execute the rover and legged remainder of P7-014, preserving contract-
derived physics, estimator-only observations, task/tensor authority, deterministic
smoke, scorecard/export rules, and explicit unsupported-shape refusals. Exact
passing-policy object delivery, P7-013 deployed GPU operations, P7-010 final MJX
decision evidence, and external/field proof remain separate lanes.
**Blockers:** none for the next local P7-014 slice. P7-012 proves controlled CPU PPO
on a GPU-capable consumer host; it does not prove GPU execution, measured host
energy/electricity cost, deployed operations, external users, real devices, or field
transfer.

## 2026-07-15 — Correct and prove the consumer-hardware training candidate
**Session:** Codex agent · branch `codex/p7012-consumer-gpu` · **Phase:** P7 ·
**TODO items:** P7-012 [~], P7-014 [~]
**Done:** Implemented the P7-012 candidate without claiming protected completion.
The first exact seed-1201 500k-step hover PPO run failed honestly at 0.375 baseline,
0.0 mass/Kv, and 1.0 wind, exposing an unstable curriculum rather than a scorecard
problem. Diagnosis found a memoryless position policy without velocity, Forge Y-up
pitch/yaw decomposition drift, raw-torque versus normalized-flight-target mismatch,
and reward/control semantics not bound to the task. D42 corrects these as coordinated
policy-tensor 2.0.0 `[1,14]`, training-bundle 2.0.0, and `p7-v3`/3.0.0 majors while
retaining exact tensor-v1 observer and 906-byte ONNX execution. The frozen
`p7-overnight-v1` curriculum now distills an estimator-only deterministic controller,
then runs conservative randomized PPO; unchanged `p7-scorecard-v1` thresholds remain
0.85 success and 0.70 robustness. Exact local M2 Pro diagnostics pass hover seed
1201 and waypoint seed 1207 at 1.0 baseline/mass/Kv/wind. Hover retained a
78,152-byte ONNX with SHA-256 `9afc1152b0e99398652274a1b97c97d53292f51995784f03323094727866fc4c`
in 45.63 s task wall time; waypoint retained a 78,156-byte ONNX with SHA-256
`b07b023aa81c4c9d96f38a0f232e92277e5c71f51b0454fcbe1f722529edb1a2`.
The resumable evidence runner freezes source/recipe/seeds/thresholds/runtime/safe
hardware/device/power authority, writes task JSON/ONNX atomically, and reuses only a
matching request hash plus valid byte count/SHA/export gate. Its interruption,
resume, tamper repair, and host-energy nonclaim tests pass. The complete 39-step
`pnpm verify` gate passes locally under Python 3.12: all 163 worker tests, 12 Studio
runtime tests, gateway/Studio typechecks, 65 gateway tests, Rust fmt/Clippy/workspace
and WASM tests, compatibility, generated-contract/golden checks, dual 256-step
MuJoCo/SB3/ONNX smoke, controlled MJX parity, and patch hygiene are green.
**Changed:** Rust training-bundle/control/tensor authority; WASM v1/v2 observers;
Python task/environment/training/evidence runtime; current and legacy ONNX fixtures;
gateway/Studio tensor-major selection; generated WASM; compatibility/migration/
decision/golden policy; project, roadmap, execution, TODO, agent, risk, debugging,
best-practice, learning, worker, motion, and Studio documentation.
**Decisions:** D42 coordinates tensor-v2/bundle-v2/task-v3 semantics and exact legacy
reads. D43 selects CPU on the declared GPU-capable M2 Pro after the same 4,096-step
MLP PPO pilot measured about 1.08 s CPU versus 13.38 s MPS, forbids backend fallback,
and separates accelerator inventory and energy/cost nonclaims from execution.
**Next:** Protect the implementation through exact-head PR and post-merge CI/security,
then run the
exact protected revision with intentional interruption after hover and validated
resume through waypoint; download and reconcile both JSON/ONNX artifacts before
closing P7-012.
**Blockers:** none for implementation/publication. Protected-source evidence is a
required remaining acceptance step, not a waived local prerequisite.

## 2026-07-15 — Reconcile protected waypoint evidence
**Session:** Codex agent · branch `codex/p7014-waypoint-evidence` · **Phase:** P7 ·
**TODO items:** P7-012 [ ], P7-014 [~]
**Done:** Protected the dependency-complete waypoint portion of P7-014 through PR
#70. Exact implementation head `b66e4b3` passed PR CI `29413578031` and security
`29413578124`; protected squash `f220d25` passed post-merge CI `29415036211` and
security `29415036274`. Downloaded artifact `8342801418` self-binds source and clean
checkout to `f220d2592b41f844f40e8c8669704a249b4f3b20`, records schema 2.0.0, and
its JSON hashes to
`8d160870a1d729b4c307953aa84965770c754a5a316ee1e1f99702dbaae041b7`. It retains
both real 256-step CPU PPO outputs. Hover-hold binds task hash
`5fdfb0746707c61f0f36d4323e825d066c0d0b64fc033dfd5dbf60f860b103e0` to a
23,004-byte ONNX graph with SHA-256
`5ff2fc01d92281dff5838479b52a6c45be193e795fef4c69fe241267e06216a7`;
waypoint-chain binds task hash
`e8ab6a92860d6c33cc80a9256f6b1ec4a2989232105417f785d3c48bd0be014d` to a
23,008-byte graph with SHA-256
`f82dc08a24fce29a298f7b4039107f7dd5bb6309150309eb039843f142620a99`.
Both scorecards remain correctly non-exportable, and the artifact explicitly
disclaims overnight/GPU/SLO, live Modal, rover/legged, external-user, and field
claims. D40's waypoint prerequisite is now satisfied; P7-012 is the next executable
training lane while rover and legged trainers remain under P7-014.
**Changed:** Canonical agent boundary; project-state anchors/counts/evidence; P7
phase, task, execution, learning, worker, Studio, and risk guidance; and this
changelog. No runtime, schema, golden, threshold, compatibility, or task semantics
changed in this reconciliation.
**Decisions:** none; D40 and D41 remain active and are now backed by protected
waypoint evidence.
**Next:** Execute P7-012 on declared consumer-GPU hardware without weakening either
scorecard, retain exact seed/config/revision/runtime/hardware/wall-time/energy/cost/
recovery/policy evidence, and reconcile the protected result before resuming the
rover/legged remainder of P7-014.
**Blockers:** none for starting the local consumer-GPU implementation/evidence lane.
A passing overnight result is not yet established; P7-013 deployed Modal/GPU
operations, production storage operations, external acceptance, and field transfer
remain separately open.

## 2026-07-15 — Implement task-v2 sequential waypoint training
**Session:** Codex agent · branch `codex/p7014-waypoint-trainer` · **Phase:** P7 ·
**TODO items:** P7-012 [ ], P7-014 [~]
**Done:** Implemented the dependency-complete waypoint portion of P7-014 without
claiming protected or learning-quality completion. D41 introduces `p7-v2`/2.0.0
with explicit `forge-y-up-rh-m` and canonical task-definition SHA-256 while keeping
v1 historical. The native exact-pinned MuJoCo/SB3 runtime now accepts only worker-
owned hover-hold or waypoint-chain definitions, follows three ordered waypoints from
estimator target error, requires complete-chain evaluation success, and keeps truth
outside policy/transition authority. Task identity/hash is bound into training
config, ONNX metadata/header, scorecard lineage, external-provider normalization,
and Studio playback. The browser retains legacy single-target reads, validates
bounded v2 chains, requests a new Rust estimator snapshot at each transition, and
zeros advisories after completion. Focused worker/SB3 and Studio tests pass; the
schema-2 dual CPU smoke executes 256 real PPO steps for each task, produces valid
digest-bound ONNX graphs, and honestly blocks both sub-threshold scorecards.
**Changed:** Training task definitions and compatibility matrix; MuJoCo task
environment; SB3 evaluation/export; external worker authority; Studio policy output,
playback, and tests; required smoke/CI label; canonical agent, project-state,
roadmap, task, execution, compatibility, learning, worker, Studio, best-practice,
decision, and changelog guidance.
All 39 required local gates pass under Python 3.12, including the registered golden
review, Rust formatting/Clippy/workspace tests, fresh and committed native/WASM
parity, production Studio build plus 11 runtime tests, 65 gateway tests, Brief-25
25/25, release packaging, all 154 worker tests, the dual-task training smoke,
controlled MJX feasibility, and patch hygiene.
**Decisions:** D41 makes the coordinate correction a task-major boundary rather than
silently changing v1 meaning; the independent `forge-policy-tensor` remains 1.0.0
because its Y-up 11-input/4-output contract did not change.
**Next:** Run the complete required gate, publish the candidate through exact-head
PR/CI/security, download and inspect the clean dual-task smoke artifact, merge, and
reconcile protected evidence; only then start P7-012 overnight hover/waypoint runs.
**Blockers:** none for local waypoint implementation. Protected exact-source proof
is pending; P7-012 additionally requires declared consumer-GPU hardware, overnight
passing scores, wall-time, energy/cost, recovery, and retained policy evidence.

## 2026-07-15 — Protect authoritative policy delivery and sequence waypoint training
**Session:** Codex agent · branch `codex/p7011-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-011 [x], P7-012 [ ], P7-014 [ ]
**Done:** Closed P7-011 through protected PR #68. Exact implementation head
`433ff3b` passed PR CI `29408733457` and security `29408733461`; the PR acceptance
artifact `8340343505` binds source `433ff3b` to GitHub's exact synthetic merge
`fc70ca2`, whose parents are the tested protected base and exact head. Protected
squash `9131289` passed post-merge CI `29409341830` and security `29409342305`.
Downloaded artifact `8340587390` self-binds source and checkout to clean
`9131289`. Its `p7-policy-delivery.v1` record hashes to
`fd6b53f3530a5de09dcafe3dd560bc793f5d6b1166a4cc90d4e7a83c79de82a2` and proves
two attempts produce one authoritative policy/object, prevent the stale upload,
persist no inline bytes, and read back the exact retained object. Digest
substitution is rejected before upload with zero rows; cancellation after upload
creates zero authoritative rows and leaves the bounded orphan to OPS-006. The
companion QA-002 record hashes to
`5f3242fc4cfc45e5bbfcd0b00bea29eb8c7340a3a3a591298757107182a3f6f7`, applies 22
migrations, and passes all 11 production-browser flows, including authenticated
same-origin retrieval and Rust estimator/motion execution of the exact 906-byte
ONNX object with SHA-256 `222102cc9a55192f00696399f553781ffc095f6fc0e3195d7456fed01a564d62`.
The QA-003 record hashes to
`a107c8e814beb5a84d14f6ca2723b2b46ab2c42ee2b52c14991922693499ad6d`, is clean and
self-bound to `9131289`, and passes full-Studio Chromium plus viewer-grade Firefox
and WebKit. This is controlled S3-compatible sandbox and deterministic product
acceptance, not production object-storage durability, a passing learned policy,
deployed GPU operations, an external user result, or field transfer.
**Changed:** Canonical agent boundary; project-state anchors/counts/evidence;
P7 phase, execution, task, learning, worker, Studio, and risk guidance; dependency
ordering for P7-012/P7-014; D40; and this changelog. No runtime, schema, golden,
threshold, or compatibility behavior changed in this reconciliation.
**Decisions:** D40 makes the waypoint portion of P7-014 a dependency of P7-012 while
preserving both stable IDs; the rover and legged portions remain after overnight
hover/waypoint proof.
**Next:** Implement the sovereign real waypoint trainer slice under P7-014 with
contract-derived observations/actions, held-out scorecard coverage, deterministic
smoke, and explicit unsupported-shape refusal; then execute P7-012 on declared
consumer GPU hardware.
**Blockers:** none for P7-011. P7-012 still requires the waypoint trainer slice plus
declared consumer-GPU runtime, wall-time, energy/cost, recovery, and retained-policy
evidence.

## 2026-07-15 — Implement lease-fenced object-backed policy delivery
**Session:** Codex agent · branch `codex/p7011-policy-delivery` · **Phase:** P7 ·
**TODO items:** P7-011 [~]
**Done:** Implemented the P7-011 candidate without claiming protected completion.
D39 and migration 0022 bind one winning D38 job to one byte-free policy and one exact
owner-scoped content-addressed ONNX object. Worker and fixture paths verify the
bounded canonical bytes, upload under the current lease, recheck authority in the
serializable success transaction, and prevent duplicate/stale/cancelled attempts
from materializing. Authenticated `GET /v1/policies/:id/model` cross-checks owner,
job, admitted model revision, exportable scorecard, tensor, lineage, complete object,
length, digest, and stored bytes; Studio verifies the retained response again before
ONNX playback. One Studio action now selects the active admitted model, creates a
fixture or configured-local job with idempotency, polls it, and loads the retained
artifact. All 39 required local non-DB gates pass under Python 3.12, including
gateway 65/65, Studio 9/9 and production build, workers 151/151, generated docs/
compatibility, native/fresh-WASM parity, packaging, real training/engine/MJX smokes,
and patch hygiene.
The first protected data-plane attempt reached the pinned image and exposed that its
declared non-root UID 100/GID 101 could not write a root-owned empty `/data` mount.
The follow-up preserves non-root MinIO: CI supplies a UID/GID-owned tmpfs, while
Compose runs a one-shot volume-permission initializer before the service starts.
The next exact-head attempt then reached the populated-predecessor matrix and exposed
that PostgreSQL could not infer the type of job IDs passed only through
`jsonb_build_object`. The fixtures now cast those bound IDs to text explicitly; the
migration itself applied cleanly and was not weakened.
That run passed all 21 populated predecessors and then exposed that the worker's
`ON CONFLICT (job_id)` did not name the partial-index predicate. Both worker and
gateway writers now spell `WHERE job_id IS NOT NULL`, so PostgreSQL can infer the
one-winner index while historical nullable rows remain intentionally outside it.
The following exact-head run passed the complete P7-011 stale-lease, exact-object,
cancellation, and substitution proof, then found the same untyped-JSON parameter
pattern in the downstream user-data 1.3.0 fixture. Its bound `modelId` is now also
explicitly text-typed so export/deletion acceptance can continue past policy setup.
**Changed:** D39 and R26; migration 0022 plus populated-predecessor assertions;
gateway object write/read, transactional policy materialization, policy-model route,
and user-data export 1.3.0; worker S3-compatible transport/materializer and protected
PostgreSQL/MinIO acceptance; Studio create/poll/fetch/play flow and substitution
tests; browser acceptance; exact-digest MinIO Compose/CI services; generated 76-route
contract documents; compatibility, migration, security, system, roadmap, task,
project-state, release, lifecycle, governance, and canonical `AGENTS.md` guidance.
**Decisions:** D39 makes inline policy bytes transient, one job/one policy/object
authority explicit, and same-origin gateway plus Studio double verification binding.
**Next:** Push the exact branch, inspect required CI/security plus the retained P7
policy-delivery and browser evidence, merge
through protection, verify post-merge checks, and reconcile P7-011 to `[x]` only then.
**Blockers:** No implementation blocker. The candidate is not complete until the
isolated protected PostgreSQL/MinIO stale-lease, cancellation-during-upload,
substitution, exact-readback, and production-browser proof is green and reconciled.

## 2026-07-15 — Protect the controlled MuJoCo/MJX feasibility foundation
**Session:** Codex agent · branch `codex/p7010-protected-evidence` · **Phase:** P7/P9 ·
**TODO items:** P7-010 [~], P9-005 [~]
**Done:** Protected the deliberately decision-ineligible P7-010 foundation through
PR #66. Exact head `f72ef09` passed PR CI `29398735858` and security `29398735849`;
protected squash `0614272` passed post-merge CI `29399434491` and security
`29399434519`. The protected worker ran all 146 tests, seeded training, real engine
parity, and the controlled MJX benchmark under exact dependencies. Downloaded
artifact `8337556569` self-binds to clean `0614272`, request SHA-256
`0d4bc68489bcb8fa44a17e193e3db918f022065b74221ff8aceed6b24ee73fc0`, the
admitted contract/MJCF, exact Python 3.12.13, NumPy 2.5.1, MuJoCo/MuJoCo-MJX 3.9.0,
JAX/JAXLIB 0.10.2, and GitHub's 4-CPU x86_64 runner. Native multithreaded MuJoCo
measured 268,902 steps/s versus CPU-backed MJX at 54,698 steps/s. Float64 parity
passed with qpos/qvel absolute errors `3.42e-12`/`2.00e-11`; the artifact JSON hashes
to `d02a5820c21fd6d4640d1192b84c48c985db3341c96ca926e0ad89c688d6a7db`.
**Changed:** Canonical agent current boundary; project-state anchors, counts, and
evidence table; P7 phase/execution roadmap; stable P7-010 ledger; and this changelog.
No runtime code, format, threshold, golden, or maturity claim changed in this
evidence reconciliation.
**Decisions:** none. The existing CPU-need + parity + at least 3x cost-normalized
throughput rule remains binding. A clean CPU/reference row validates the harness; it
cannot authorize MJX adoption, rejection, or P9 batching.
**Next:** Close P7-011's object-backed one-click policy delivery, then acquire exact
D12 quad/rover/legged models, declared accelerator hardware, CPU overnight/tier-2
budgets, and cost evidence before finishing P7-010 or enabling P9-005.
**Blockers:** none for the protected foundation. D12 rover/legged training-ready
contracts and declared accelerator/budget/cost evidence remain prerequisites for the
owning final decision.

## 2026-07-15 — Establish the controlled MuJoCo/MJX benchmark boundary
**Session:** Codex agent · branch `codex/p7010-mjx-benchmark` · **Phase:** P7/P9 ·
**TODO items:** P7-010 [~], P9-005 [~]
**Done:** Implemented the first real, deliberately decision-ineligible P7-010
measurement path. A strict `mjxBenchmarkRequest` 1.0.0 freezes the admitted hover
snapshot, canonical request/source hashes, exact NumPy 2.5.1, MuJoCo/MuJoCo-MJX
3.9.0, JAX/JAXLIB 0.10.2, float64, one SI-unit perturbation protocol, and identical
solver/timestep/controls. The native command compiles through sovereign Rust truth,
warms both engines, separates JAX lowering/compilation, synchronizes every timed
pytree, compares native multithreaded MuJoCo with batched MJX, checks absolute qpos/
qvel bands, and emits a source/request/contract/MJCF/runtime/hardware-bound
`mjx-benchmark` 1.0.0 report. The central policy now distinguishes missing evidence
from failed evidence and requires clean source, declared accelerator, budget, and
cost authority for controlled/sandbox/live rows. A real dirty-checkout Apple ARM CPU
run measured roughly 822k native MuJoCo versus 121k CPU-MJX steps/s with float64
parity errors around `1e-11`; it correctly blocked adoption. All 146 worker tests and
15 focused MJX tests pass under Python 3.12, including finite-number refusal,
direct-checkout binding, and eligible-adopt/eligible-reject outcomes that remain
distinct from missing evidence. The complete repository gate passes all
39 required local steps, including the real seeded training smoke, the new real MJX
feasibility smoke, native/fresh-WASM parity, release packaging, and patch hygiene;
the exact expanded Python environment also passes the pinned advisory audit.
**Changed:** Native MJX command and smoke wrapper; central decision policy and tests;
exact optional dependencies; required local/CI smoke and retained evidence artifact;
security audit installation; compatibility, learning, worker, best-practice, agent,
phase/execution, task, project-state, and changelog documentation.
**Decisions:** none. The existing P7-010 CPU-need + parity + 3x cost-normalized rule
remains binding. Internal evidence envelope 1.0.0 freezes the controlled protocol;
measured benchmark output is not a golden.
**Next:** Publish through protected CI/security, inspect the retained clean-source
artifact, then acquire exact D12 quad/rover/legged models and declared GPU/budget/
cost evidence before making the adoption decision.
**Blockers:** none for the controlled harness. The D12 rover/legged training-ready
contracts and declared accelerator/cost/overnight evidence are prerequisites for
finishing P7-010, not reasons to weaken or close it from this reference CPU run.

## 2026-07-15 — Protect the seeded SB3/MuJoCo training runtime
**Session:** Codex agent · branch `codex/p7003-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-003 [x], P7-011..014 [ ]
**Done:** Closed P7-003 through protected PR #64. Exact head `d81a03c` passed CI
`29393871628` and security `29393871650`; protected squash `d1c4c38` passed CI
`29394580998` and security `29394580959`. Downloaded protected artifact `8334594354`
self-binds to a clean `d1c4c38`, exact runtime/lock/dependency/contract/config/seed
lineage, changed optimizer parameters, estimator-only observations, and a real valid
opset-18 `[1,11] -> [1,4]` ONNX graph whose decoded SHA-256 matches the envelope.
Its 256-step zero-success scorecard remains honestly non-exportable. Browser artifact
`8334722186` records 11/11 production-bundle/real-WASM/isolated-Postgres flows,
including exact saved-model revision binding and completed ONNX playback.
**Changed:** Canonical agent current boundary, project-state evidence/counts,
P7 phase/execution roadmap, stable task ledger and adjacent delivery/quality/
deployment/coverage tasks, learning/worker/Studio/platform status language, and this
changelog. No runtime code, format version, threshold, golden, or maturity claim was
changed by this evidence reconciliation.
**Decisions:** none. D8, D9, D17, validator sovereignty, exact MuJoCo 3.9.0, and
`forge-policy-tensor` 1.0.0 remain binding. A short runtime smoke cannot authorize
policy export or stand in for overnight learning quality.
**Next:** Execute P7-010's real D12 CPU-MuJoCo versus MJX benchmark to make the
adoption decision before investing in tier-2/3 batching, then close P7-011/P7-012.
**Blockers:** none for P7-003. Real D12 benchmark capacity, declared consumer-GPU
overnight proof, deployed Modal operations, external participants, and field transfer
remain explicit prerequisites for their owning tasks.

## 2026-07-15 — Execute the real seeded SB3/MuJoCo training boundary
**Session:** Codex agent · branch `codex/p7003-sb3-runtime` · **Phase:** P7 ·
**TODO items:** P7-003 [~]
**Done:** Implemented a controlled real CPU training path from an authenticated
owner's admitted model to a deterministic fixed-shape opset-18 ONNX candidate. The
gateway rejects caller-owned snapshots and freezes exact admitted bytes/hash;
`forge-validate training-bundle` re-runs sovereign admission and derives the MJCF,
mass/gravity/hover trim, powertrain curve, estimator, control bounds, and policy
layout in Rust. The Python worker verifies both versioned envelopes, exact runtime
pins, and every authoritative field before executing seeded PPO or SAC in a real
MuJoCo hover environment with estimator-only observations, normalized actions, and
mass/Kv/sag/latency/friction/wind/noise/dropout randomization. Evaluation covers
baseline, mass +15 %, Kv -8 %, and 4 m/s wind; lineage binds source, contract,
configuration, dependency, seed, parameter, and ONNX digests. Focused Rust and
gateway tests pass, the complete worker suite passes 138/138 under Python 3.12, both
algorithms and same-seed ONNX reproducibility pass, and a 256-step local PPO smoke
produces a real graph. That dirty-worktree short smoke is explicitly not acceptance
or learning-quality proof. After adding the required append-only review record for
the regenerated internal-schema catalog, the complete Python 3.12 `pnpm verify`
gate passes all 38 required local steps. Saved-model selection now loads the exact
persisted contract/report into Studio, and model-bound fixture/reuse jobs omit a
caller-derived hash so the gateway remains the authority for the selected revision.
Studio tracks that exact snapshot SHA separately from the validator report's
canonical typed-contract hash and clears the binding on non-model loads or patches;
policy playback therefore fails closed unless its lineage matches the loaded saved
revision; browser acceptance re-reads that revision after an edit instead of trusting
the pre-edit hash. Template-generated multirotors now also carry the explicit
complementary-estimator authority required by both training and browser playback,
instead of being admitted but unusable at that boundary.
**Changed:** Rust training-bundle derivation and validator command; gateway job
authority; worker bundle verifier, MuJoCo environment, SB3 trainer/runner, external
job normalization, Modal pins, tests, exact optional dependencies, required CI
training installation/smoke/artifact, compatibility matrix/checker, full-gate
registration, generated artifact catalog and append-only golden review record,
exact Python training-runtime advisory audit and license record,
Studio saved-model/job binding, browser hash-alignment acceptance, system/
compatibility/best-practice docs, current-state/phase/execution roadmaps,
stable P7-003 ledger note, and this changelog.
**Decisions:** none. D8, D9, D17, validator sovereignty, exact MuJoCo 3.9.0, and
`forge-policy-tensor` 1.0.0 remain binding. The pinned legacy TorchScript ONNX
exporter is a controlled implementation detail; migration requires reviewed
fixed-shape/browser parity evidence.
**Next:** Publish the exact clean candidate through protected CI/security and
isolated-Postgres/browser acceptance, inspect the retained clean-source training
artifact, and reconcile only the maturity actually proven.
**Blockers:** none for implementation. Protected evidence, an overnight passing
hover/waypoint policy, one-click object-backed delivery, deployed Modal/GPU proof,
offline fine-tune, broader archetypes, MJX measurements, and EXT-003 remain open.

## 2026-07-15 — Close browser ONNX execution on protected main
**Session:** Codex agent · branch `codex/p7008-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-008 [x]
**Done:** Closed P7-008 through protected PR #62. Exact implementation head
`2686d1a` passed CI `29387737921` and security `29387737947`; protected squash
`1de7974` passed post-merge CI `29388166478` and security `29388166407`, including
Rust, all 37 acceptance surfaces, 130 Python worker tests, Desktop, isolated
Postgres, dependency audit, SPDX, and both CodeQL languages; exact-head dependency
review also passed.
Browser jobs `87264528677` and `87265803914` retained artifacts `8332187895` and
`8332317185`: both record an 11/11 production-bundle/real-WASM flow set, completed
hash/lineage-bound ONNX policy playback, and lazy same-origin runtime JS/WASM assets.
The protected boundary is 15 compatibility surfaces, 64 gateway tests, 130 worker
tests, and six focused real-runtime Studio tests.
**Changed:** Canonical agent current boundary, project-state evidence/counts,
phase/execution roadmaps, stable P7-008 ledger state, and changelog. No runtime code,
dependency, public compatibility format, golden, provider, hardware authority, or
product-maturity claim changed in this reconciliation.
**Decisions:** none. D8, D9, D16, D17, and policy-tensor 1.0.0 remain binding; this
evidence does not promote fixture playback into live training or field authority.
**Next:** Execute the next dependency-complete P7 lane, beginning with a live
feasibility audit of the pinned D12 MJX benchmark contract under P7-010.
**Blockers:** none for P7-008. Live SB3/MuJoCo training, object-backed external
models, offline fine-tune, D12 MJX measurements, hardware, and field transfer remain
separately gated.

## 2026-07-15 — Execute the real browser ONNX policy boundary
**Session:** Codex agent · branch `codex/p7008-onnx-runtime` · **Phase:** P7 ·
**TODO items:** P7-008 [~]
**Done:** Replaced procedural scorecard-derived playback with a real digest-bound
opset-18 Gemm+Tanh hover policy executed by exact `onnxruntime-web` 1.27.0's lazy
WASM-only entry. `CoreSession` now derives an independently versioned 11-scalar
`forge-policy-tensor` 1.0.0 input from contract estimator and inline powertrain state;
motion truth stays inside Rust. Studio verifies scorecard/D8 authority, exact contract
lineage, schema/version/frame/layout/shapes/rate, strict model encoding/size/SHA-256,
runtime names/type/shape, finite observations/actions, and normalized bounds before
feeding asynchronous 50 Hz advisories into the 120 Hz motion loop. Failure or timeout
zeros commands and stops. Only the real hover fixture exports bytes; other fixture
tasks now stay held. Six Studio tests execute the model and its refusal matrix,
gateway tests pass 64/64, worker tests pass 130/130, focused Rust crates pass, the
production build emits a separate lazy ONNX JS/WASM pair, compatibility/docs drift
passes at 15 surfaces, and the production audit reports no known vulnerabilities.
The complete 37-step gate passes under Python 3.12, including Rust formatting,
Clippy, workspace tests, WASM cross-compilation, native/WASM parity, generated and
golden contracts, release packaging, 64 gateway tests, 130 worker tests, the six
real-runtime Studio tests, and patch hygiene.
**Changed:** Motion truth/estimator/powertrain observer boundary, WASM/local/worker
session protocol, digest-bound gateway and Python fixtures, external inline-model
pass-through, Studio controller/UI/tests, lazy runtime dependency and supply-chain
allowlist, QA-002 browser flow (11 paths), policy-tensor compatibility/migration/
deprecation contracts, system/best-practice docs, living task/phase/execution state,
and generated contract references. The new runtime dependency is MIT-licensed,
exact-pinned, same-origin, and excluded from first paint.
**Decisions:** none. D8, D9, D16, D17, and the compatibility policy already govern
the estimator, advisory rate, core boundary, determinism, and version semantics.
**Next:** Publish the exact candidate through protected CI/security and
isolated-Postgres browser acceptance, inspect retained ONNX evidence, then reconcile
P7-008 to `[x]` only after post-merge checks pass.
**Blockers:** none for implementation. Exact-head/protected evidence is outstanding;
local browser acceptance also lacks an isolated `DATABASE_URL`. Live SB3/MuJoCo
training, object-backed external models, hardware, and field transfer remain separate.

## 2026-07-15 — Close real engine parity on protected main
**Session:** Codex agent · branch `codex/p6010-protected-evidence` · **Phase:** P6 / QA ·
**TODO items:** P6-010 [x]
**Done:** Closed P6-010 and the deterministic P6 phase exit through protected PR #60.
Exact implementation head `aa5b133` passed CI `29383163191` and security
`29383163204`; protected squash `c0f5172` passed post-merge CI `29383489511` and
security `29383489520`, including Rust, TypeScript/gateway, Desktop, isolated
Postgres/real-browser, dependency, SPDX, CodeQL, and the real engine worker. Worker
job `87252899630` retained the request and both baselines plus a passing comparison
bound to source revision `c0f51726d09ebc28852b75f894266e2d2d78a7c3` and request
SHA-256 `66059445aae9ac24b4bd85abbff3bf71e38d355f3c2050d3e2df166db9e4103f`.
Exact MuJoCo 3.9.0 remained paired with Rapier at a 1/240 s driver and four substeps;
the unchanged bands passed with drop, pendulum, hover, and gait deltas of
0.001396765 s, 0.000070124 s, 6.98e-10, and 0.000061964 m.
**Changed:** Canonical agent boundary, project-state evidence/counts, phase and
execution roadmaps, P6-010 ledger state, simulation/worker status, and changelog.
No runtime code, dependency, public compatibility format, golden, tolerance,
provider, hardware authority, or release claim changed in this reconciliation.
**Decisions:** none. D20 and the reviewed MuJoCo 3.9.0 pin remain binding; the
protected evidence did not justify a re-pin or tolerance change.
**Next:** Begin P7-008 as the next dependency-complete product lane: execute a
scorecard-authorized ONNX fixture through ONNX Runtime Web and feed bounded outputs
through the motion policy layer without implying live SB3 training or hardware
authority.
**Blockers:** none for P6-010. Live SB3/GPU work, diverse third-party imports,
providers, hardware, and field transfer remain separately gated.

## 2026-07-15 — Require real contract-derived engine parity
**Session:** Codex agent · branch `codex/p6010-engine-parity` · **Phase:** P6 / QA ·
**TODO items:** P6-010 [~]
**Done:** Replaced the duplicate hand-authored MuJoCo parity scenes with four MJCF
scenes emitted by the checked-out Rust exporter from the same canonical contracts
Rapier executes. A real local MuJoCo 3.9.0 run passes the unchanged bands: drop delta
0.001396765 s, pendulum delta 0.000069847 s, hover-trim delta 6.98e-10, and gait-CoM
delta 0.000061964 m. The first contract-derived run failed closed and exposed that
MJCF joint ranges in documented radians were being compiled under MuJoCo's degree
default; the exporter now declares radians explicitly. The registered exporter and
MuJoCo baseline candidates were regenerated through their named procedures and one
append-only physics review record captures the before/after evidence. Focused Rust
tests, five MuJoCo-worker tests, the registered keyless fixture check, golden policy,
and the real live-engine command pass locally.
**Changed:** Canonical parity scenario/runtime contracts; MJCF runtime export options
and radian unit declaration; validator request CLI; bounded/versioned Python runner;
exact MuJoCo dependency pin; live and reviewed-capture orchestration; registered
physics fixtures/evidence; the existing required worker CI job and artifact upload;
agent, state, phase, execution, simulation, worker, compatibility, governance,
threat-model, risk, task, and changelog guidance.
**Decisions:** none. D20 remains binding. The reviewed MuJoCo 3.9.0 baseline stays
pinned even though official upstream sources list 3.10.0 as current on 2026-07-15;
adopting a new engine version requires a separate measured parity review rather than
an unbounded dependency update. No tolerance, authority, or public format changed.
**Next:** Run the complete local gate, publish the exact candidate through the
existing protected checks, inspect the uploaded real-engine evidence, then reconcile
P6-010 to `[x]` only after exact-head and protected post-merge CI/security pass.
**Blockers:** none for implementation. Protected remote evidence is still required;
SB3 training, GPU performance, diverse external imports, providers, hardware, and
field transfer remain separate tasks.

## 2026-07-15 — Close contributor onboarding on protected main
**Session:** Codex agent · branch `codex/doc006-protected-evidence` · **Phase:** DOC /
governance · **TODO items:** DOC-006 [x]
**Done:** Closed the documentation-completion lane through protected PR #58. Exact
implementation head `c83f036` passed CI `29379546230`, security `29379546201`, and
the separate CodeQL aggregate. Protected squash `3078dba` passed post-merge CI
`29380212006` and security `29380212007`, including the 36-step-equivalent Rust,
workers, TypeScript/gateway, isolated Postgres/real-browser, accessibility, native
Desktop, dependency audit, SPDX, and both CodeQL language paths. The canonical
onboarding contract, maintainer-only curation source, entry links, exclusions,
assignment/reassignment flow, and seed issues #55-#57 are therefore protected. The
open issues remain process evidence only; no external contribution is claimed. The
evidence-reconciliation tree also passes all 69 local Markdown targets, issue-form
YAML parsing, live issue-state checks, `git diff --check`, and the complete 36-step
local gate under Python 3.12.
**Changed:** Canonical agent current boundary, project-state evidence and counts,
phase/execution roadmaps, stable DOC-006 ledger state, and changelog. No runtime API,
dependency, public compatibility format, golden, provider, hardware authority, or
product-maturity claim changed.
**Decisions:** none. Maintainer curation, assignment authority, seven-day inactivity
flow, and sensitive-surface exclusions remain the binding contributor contract.
**Next:** Begin the next dependency-complete product lane from the 61 remaining tasks;
prioritize credentialed catalog acceptance plus EXT-001 only when the owner supplies
the required provider sandbox and qualified independent participant.
**Blockers:** none for documentation completion. Credentials/providers, independent
users, production operations, controlled hardware, and field evidence retain their
existing prerequisites.

## 2026-07-15 — Establish curated contributor onboarding
**Session:** Codex agent · branch `codex/doc006-contributor-onboarding` · **Phase:** DOC /
governance · **TODO items:** DOC-006 [~], GOV-003 maintenance [x]
**Done:** Closed the prerequisite audit-client evidence gap: PR #54 exact head
`00ae9a0` passed CI `29378364147`/security `29378364143`, and protected squash
`41dee2d` passed post-merge CI `29378749550`/security `29378749542`. Added one
canonical contributor-onboarding contract, a maintainer-only curation template, and
consistent discovery/claim/assignment/review links across public and agent entry
surfaces. Exercised the workflow with three live, bounded, unassigned issues:
[#55](https://github.com/RNT56/TTC/issues/55) for a validator-report walkthrough,
[#56](https://github.com/RNT56/TTC/issues/56) for a dependency-free link checker,
and [#57](https://github.com/RNT56/TTC/issues/57) for Markdown-escaping tests. Each
records a mentor, protected-main anchor, exact scope/exclusions, acceptance commands,
and the same seven-day reassignment flow. Open issues prove process shape, not a
successful external contribution. All 69 repository Markdown files resolve their
local targets, all three issue-form YAML files parse, the seed issues remain open and
unassigned with the intended labels, `pnpm audit --audit-level low` reports no known
vulnerabilities, and the complete 36-step gate passes under Python 3.12, including
63 gateway tests, Brief-25 25/25, native/WASM parity, packaging, 127 worker tests,
and patch hygiene.
**Changed:** Contributor onboarding, curation template, issue chooser, pull-request
template, CONTRIBUTING, SUPPORT, README and docs index, canonical agent entry,
repository governance, current state, phase/execution roadmaps, TODO ledger, and
changelog.
**Decisions:** none. Maintainers alone apply `good first issue`; assignment is the
authoritative claim, and sensitive authority remains excluded from entry-level work.
**Next:** Publish the exact candidate through protected PR, require exact-head and
post-merge CI/security, then reconcile DOC-006 as complete without claiming external
contributor success.
**Blockers:** none for deterministic documentation/process work. External contributor
success, credentials/providers, operations, controlled hardware, and field proof
remain separate evidence gates.

## 2026-07-15 — Restore the fail-closed npm advisory gate
**Session:** Codex agent · branch `codex/doc005-protected-evidence` · **Phase:** GOV /
supply chain · **TODO items:** GOV-003 maintenance
**Done:** Diagnosed PR #54 security run `29377444789` as an audit-client protocol
failure, not a vulnerability result: npm returned HTTP 410 for pnpm 10.33.0's
retired `/audits/quick` and `/audits` endpoints. Upgraded the reviewed toolchain pin
to pnpm 11.13.0, whose audit client uses the replacement bulk-advisory endpoint, and
made the required esbuild 0.25.12/esbuild 0.28.1/wasm-pack 0.15.0 lifecycle authority
explicit and version-exact. `pnpm install --frozen-lockfile` and
`pnpm audit --audit-level low` pass locally with no lockfile drift and no known
vulnerabilities. The complete 36-step local gate also passes under Python 3.12,
including generated-contract drift, 63 gateway tests, 127 worker tests, native/WASM
parity, release packaging, and cumulative patch hygiene.
**Changed:** Root package-manager pin; pnpm workspace lifecycle allowlist;
contributor prerequisites; canonical agent and repository-governance supply-chain
rules; current state, phase/execution guidance, stable GOV-003 maintenance record,
and changelog. No application dependency, runtime API, compatibility format, live
provider, hardware boundary, or maturity claim changed.
**Decisions:** none. A registry/audit transport failure remains a failed control and
cannot be waived or reported as a clean audit.
**Next:** Publish the exact candidate to PR #54 and require a green replacement
dependency-audit job plus all protected checks before merge and post-merge
reconciliation.
**Blockers:** none after the toolchain migration. External credentials/providers,
independent users, operations, controlled hardware, and field proof remain separate.

## 2026-07-14 — Close governed interface documentation on protected main
**Session:** Codex agent · branch `codex/doc005-protected-evidence` · **Phase:** DOC /
compatibility · **TODO items:** DOC-005 [x]
**Done:** Closed DOC-005 through protected PR #53. Exact implementation head
`e79bbb1` passed the complete 36-step local gate under Python 3.12, PR CI
`29375146614`, security `29375146592`, and the separate CodeQL aggregate. Protected
squash `22c263b` passed post-merge CI `29376742319` and security `29376742373`,
including 75-route/two-event/sixteen-worker generated-reference drift, fourteen
compatibility surfaces, isolated Postgres and real-browser acceptance, three-engine
accessibility, native Desktop, dependency audits, SPDX, and both CodeQL languages.
The first PR head exposed incomplete Markdown escaping; the exact-head backslash and
newline fix passed all gates and no failing alert carried into protected `main`.
**Changed:** Canonical agent entry, project state, phase/execution roadmaps, stable
DOC-005 ledger row, counts, and changelog. No runtime API, dependency, live-provider
path, hardware authority, or maturity claim changed in this evidence reconciliation.
**Decisions:** none. D31 and the compatibility/deprecation contracts remain binding.
**Next:** Execute DOC-006's maintainer-curated first-good-issue workflow, exercise it
with bounded dependency-free issues, and close the final documentation task through
protected evidence.
**Blockers:** none for DOC-006 documentation/process work. Live credentials/providers,
external users, operations, controlled hardware, and field evidence retain separate
owners and prerequisites.

## 2026-07-14 — Generate governed interface documentation
**Session:** Codex agent · branch `codex/doc005-contract-docs` · **Phase:** DOC /
compatibility · **TODO items:** DOC-005 [~]
**Done:** Added one reviewed source manifest and deterministic generator for the
gateway API, streamed/job events, and worker artifact families. The generated
OpenAPI 3.1 reference exact-matches all 75 Fastify registrations; the event and
artifact catalogs cover two event families and all sixteen worker queue kinds; the
compatibility matrix now governs fourteen surfaces. Migration/deprecation guides and
four synthetic examples preserve the pre-1.0, fixture/contract, authorization, BYO-
key, and independently versioned-response boundaries. The complete 36-step local
gate passes under Python 3.12, including 63/63 gateway tests, 127/127 worker tests,
19 golden-policy tests, native/WASM parity, packaging, generated-doc drift, and patch
hygiene.
**Changed:** Runtime route observation; documentation source/generator and generated
references; migration, deprecation, and example guidance; compatibility and golden
registries; required CI and local gates; canonical agent entry; README; gateway,
governance, best-practice, compatibility, state, phase, execution, and task docs.
**Decisions:** none. D31 and existing compatibility/deprecation authority remain
binding; no runtime API, schema, dependency, live-provider path, or maturity claim
changed.
**Next:** publish this exact candidate through protected PR CI/security, then record
the protected merge and post-merge evidence before closing DOC-005.
**Blockers:** none for deterministic delivery. Live providers, hardware, external
users, operations, and field evidence retain their separate prerequisites.

## 2026-07-14 — Close protected parity reliability acceptance
**Session:** Codex agent · branch `codex/qa012-protected-evidence` · **Phase:** QA /
render reliability · **TODO items:** QA-012 [x]
**Done:** Closed QA-012 through protected runtime evidence. Exact implementation
head `8d4bf63` passed the complete 35-step local gate, authoritative clean-tree local
parity, branch nightly `29370725355`, PR #50 CI `29370722178`, and security
`29370722124`. Protected squash `6f8509b` passed post-merge CI `29371177801`, security
`29371177809`, and exact-main nightly `29372161650`. Downloaded protected artifact
`8326520247` uses `forge-parity-gallery.v1`, binds matching source/checkout SHAs to
the clean merge, records one isolated full-Studio Chromium/high-WebGL preflight with
no page errors, and passes all six low-WebGL scenes at unchanged edge F1
0.957-0.995, 3 draws, and exact 2,208/4,662 triangle counts. Current G0 acceptance is
restored; the earlier Canvas2D runs remain regression evidence, not acceptance.
**Changed:** Canonical agent entry, project state, phase/execution roadmaps, stable
QA-012 ledger row, counts, and changelog. No runtime, golden, camera, threshold,
draw-call budget, browser tier, or compatibility format changed in this evidence
reconciliation.
**Decisions:** none. Existing D15/QA-003 browser tiers and P1-015 parity authority
remain binding; Canvas2D is valid viewer fallback evidence but never parity proof.
**Next:** merge this evidence reconciliation through protected checks, then select the
next smallest dependency-complete lane from the 63 remaining tasks without
misstating credential, external-user, operations, hardware, or field prerequisites.
**Blockers:** none for QA-012 closure. Live-provider, independent-user, operations,
controlled-lab, and field gates remain separate prerequisites.

## 2026-07-14 — Restore fail-closed WebGL parity evidence
**Session:** Codex agent · branch `codex/qa012-parity-reliability` · **Phase:** QA /
render reliability · **TODO items:** QA-012 [~]
**Done:** Diagnosed both current nightly failures as deterministic harness drift from
QA-003, not golden-image or random GPU drift. The custom parity server lacked the
COOP/COEP headers now required for full Studio, so Chromium correctly selected the
viewer-grade Canvas2D path; the new semantic `<main>` wrapper also made the old
direct-child chrome selector match nothing. The candidate now shares the production
isolation contract, hides non-canvas presentation subtrees by canvas ancestry,
requires full-Studio/Chromium/high/WebGL preflight, permits only one fresh-browser
retry after an isolated renderer-initialization failure, asserts low/WebGL/advanced
quality on every capture, and preserves attempt diagnostics. Both JSON evidence files
now carry the `forge-parity-gallery.v1` schema, declared source SHA, checked-out SHA,
and dirty-worktree state; workflow proof rejects SHA drift or a dirty checkout. Nine
policy tests pass. The real local gallery passes all six unchanged structural gates
at edge F1 0.957-0.995, 3 draws, and exact 4,662/2,208 WebGL triangle counts. The complete
35-step gate and focused Chromium browser-support acceptance pass under Python 3.12.
QA-007 evidence PR #49 also passed and merged as `0f31b82`; post-merge CI
`29369026150` and security `29369026035` are green.
**Changed:** Parity server/capture policy and focused tests; package and CI/nightly
commands; canonical agent entry; browser/render/governance/best-practice guidance;
README; project state, phase/execution roadmap, QA-012 task, and changelog.
**Decisions:** none. This enforces existing D15/QA-003 capability tiers and P1-015
render authority; it does not change the frozen oracle, cameras, goldens, edge-F1
threshold, draw-call budget, product browser tiers, or compatibility formats.
**Next:** dispatch the workflow on the final exact branch head, inspect its embedded
source identity plus full-Studio preflight and six-scene artifact, then publish
through protected PR/post-merge checks and a final protected-main nightly before
QA-012/G0 closure.
**Blockers:** none for deterministic implementation. Current protected G0 remains
regressed until exact remote nightly proof passes.

## 2026-07-14 — Close protected adversarial corpus acceptance
**Session:** Codex agent · branch `codex/qa007-protected-evidence` · **Phase:** QA /
cross-boundary quality · **TODO items:** QA-007 [x], QA-012 [~]
**Done:** Closed QA-007 through protected main. Exact implementation head `fb6eacc`
passed PR #48 CI `29366837836` and security `29366838444`, including dependency
review/audit, source SPDX, native Desktop, Rust, workers, TypeScript/gateway,
isolated Postgres/real-browser acceptance, and both CodeQL languages. Protected
squash `e89bb15` passed post-merge CI `29367356078` and security `29367355993`.
The protected 35-step baseline now governs the exact eight-file/89-case boundary
inventory and its Rust/Python consumers. The ledger is 201 tasks: 137 done, 38 in
progress, 25 open, and 1 blocked. Current-state review also found scheduled nightly
`29311327203` passed core coverage but captured the intentional Canvas2D fallback
instead of WebGL for all six parity scenes; exact-current-main rerun `29367911748`
reproduced the same failure while coverage remained green.
**Changed:** Canonical agent entry point; project-state evidence ledger; phase and
execution roadmaps; QA-007 closure; new QA-012 regression task and current-G0
boundary; changelog.
**Decisions:** none. QA-007 remains deterministic fixture evidence and does not claim
credentialed providers, diverse real external imports, hardware, load, external
users, or field maturity. Visual parity still requires the full WebGL renderer; the
Canvas2D support fallback is not acceptable parity proof.
**Next:** harden the nightly parity harness to assert full-WebGL quality, retry only
bounded initialization failures, and preserve the existing six-scene thresholds;
then prove the exact change through a manual nightly and protected CI/security.
**Blockers:** none for QA-007. Credentialed providers, qualified external
participants, production operations, and controlled hardware remain prerequisites
for their own roadmap lanes.

## 2026-07-13 — Govern adversarial trust-boundary failures
**Session:** Codex agent · branch `codex/qa007-adversarial-corpus` · **Phase:** QA /
cross-boundary quality · **TODO items:** QA-007 [~], QA-008
**Done:** Added the exact eight-file `forge-boundary-fuzz.v1` inventory with 89
globally unique reviewed cases for imports, JSON Patch, EnvSpec, replay, provider
output, catalog citations, D10 export policy, and hardware payloads. Registered it as
the fifteenth golden family with an append-only review record and extended the
existing fuzz gate without increasing the 35-step total. Rust consumers pin patch,
import, EnvSpec, and replay outcomes plus randomized no-panic properties; Python
3.12 consumes replay/provider/citation/export/hardware outcomes. Hardened supported
import numerics/graphs and dominant-axis ordering, native/worker replay finiteness,
EnvSpec gate finiteness, finite `[0,1]` citation confidence and HTTPS/extractor
identity, bounded hardware JSON, safe config tokens, unique finite telemetry time,
and strict finite supervisor vectors/limits. Focused corpus and golden-policy checks,
all 47 forge-sim unit tests plus 5 corpus/property tests, the JSON Patch corpus test,
and 127/127 worker tests pass. The complete 35-step local gate also passes under
Python 3.12, including native/WASM parity, packaging, and cumulative patch hygiene.
**Changed:** Registered corpora/checker/record; Rust contract/simulation tests and
import/replay/EnvSpec boundaries; Python replay/citation/bridge boundaries and worker
tests; test-only forge-sim `proptest`; AGENTS, compatibility, risk, best-practice,
state/phase/execution/TODO, golden-policy, and affected system documentation.
**Decisions:** none. This is a patch-level strictness correction for already-invalid
non-finite, malformed, contradictory, or unsafe evidence. Valid format/version
support is unchanged, and fixture evidence does not claim providers, hardware, load,
external users, or field maturity.
**Next:** publish the inspected exact candidate through the protected PR-only
ruleset, and close QA-007 only after exact PR and post-merge CI/security evidence
passes.
**Blockers:** none for deterministic implementation. Live providers, diverse real
external imports, performance/load, controlled hardware, and field evidence retain
their separate prerequisites.

## 2026-07-13 — Close protected queue and upload fault acceptance
**Session:** Codex agent · branch `codex/qa005-protected-evidence` · **Phase:** QA /
worker and object reliability · **TODO items:** QA-005 [x]
**Done:** Closed QA-005 through protected main. Exact implementation head `5663900`
passed PR #46 CI `29291536114` and security `29291536115`, including the required
Postgres data plane, dependency review/audit, source SPDX, native Desktop, workers,
Rust, TypeScript/gateway, both CodeQL languages, and the aggregate check. The PR
artifact bound source `5663900` to synthetic merge `99024b8` and passed both QA-005
matrices. Protected squash `7970005` then passed post-merge CI `29292041469` and
security `29292041441`. Its downloaded clean artifact binds source and checkout
exactly to `7970005`, applies 21/21 clean migrations and all 20 populated
predecessors, and proves crash reclaim, two-attempt one-time materialization,
stale/cancelled-result discard, bounded outage recovery, terminal rate exhaustion
with its 17 s hint, partial-upload refusal/retry, exact metadata completion, and
verified consent/job success. The ledger is now 200 tasks: 136 done, 37 in progress,
26 open, and 1 blocked.
**Changed:** Canonical agent entry point; project-state evidence ledger; phase and
execution roadmaps; QA-005 task status; changelog.
**Decisions:** none; D38 remains active. Deterministic isolated-Postgres proof does
not claim multi-replica queues, deployed object storage, provider incident recovery,
shared quotas, dead-letter operations, production SLOs, or disaster recovery.
**Next:** execute QA-007's dependency-complete fuzz/property/adversarial corpus while
QA-006 real-hardware/provider performance and QA-009 production DR retain their
separate prerequisites.
**Blockers:** none for QA-005. Credentialed providers, qualified external
participants, production operations, and controlled hardware remain prerequisites
for their own roadmap lanes.

## 2026-07-13 — Fence compute attempts and verify client uploads
**Session:** Codex agent · branch `codex/qa005-fault-acceptance` · **Phase:** QA /
worker and object reliability · **TODO items:** QA-005 [~]
**Done:** Implemented D38 and additive migration 0021. Non-fixture jobs now use
bounded at-least-once attempts with opaque expiring tokens, persisted handler
deadlines, deterministic transient-fault backoff, attempt ceilings, cancellation-
first completion, stale/duplicate-result discard, and transactional one-winner
materialization. Client object registration now requires exact length/MIME/SHA-256,
returns a checksum-bound presigned PUT in `staged` state, rejects idempotency
declaration drift, and requires server-side exact metadata inspection before download
or photoscan consent. Added isolated-Postgres fault scripts and made both queue and
upload acceptance part of `pnpm verify:db`. All 35 required local gates pass,
including 122/122 worker tests, 63/63 gateway tests/build, 2/2 migration-policy tests,
compatibility, WASM/native parity, packaging, Python syntax compile, and cumulative
patch hygiene. The ledger remains 200 tasks: 135 done, 38 in progress, 26 open, and
1 blocked.
**Changed:** Queue store/runner/fault taxonomy and external adapters; object-storage,
gateway, consent, and platform boundaries; migration 0021; protected DB workflow and
fault artifacts; AGENTS entry point; migration/compatibility/governance/threat/system/
best-practice/risk/state/roadmap/TODO/README documentation.
**Decisions:** D38 defines at-least-once worker authority and staged-until-verified
client uploads. It does not claim multi-replica operations, provider/object-store
incident recovery, dead-letter reconciliation, shared quotas, SLOs, or production DR.
**Next:** run the full 35-step local gate, publish the exact candidate through the
protected PR-only ruleset, inspect QA-005's revision-bound Postgres artifact, and
close `[x]` only after exact PR and post-merge CI/security pass.
**Blockers:** no implementation blocker. Local Docker/Postgres is unavailable and was
not modified; the required protected Postgres job owns database fault proof.

## 2026-07-13 — Close protected Postgres migration acceptance
**Session:** Codex agent · branch `codex/qa004-postmerge-evidence` · **Phase:** QA /
data operations · **TODO items:** QA-004 [x]
**Done:** Closed QA-004 through protected main. Exact implementation head `f44ee86`
passed PR #44 CI `29286731035` and security `29286731271`, including the required
Postgres data plane, dependency review/audit, source SPDX, native Desktop, workers,
Rust, TypeScript/gateway, and both CodeQL languages. The downloaded PR artifact
passed QA-004 on PostgreSQL 16.14 with pgvector 0.8.5. Protected squash `e362c54`
then passed post-merge CI `29287274236` and security `29287274293`. Its clean artifact
binds source and checkout exactly to `e362c54`, applies all 20 current migrations on
a clean database, preserves realistic populated data through every predecessor
prefix `0001`..`0019`, and proves unchanged reruns, atomic rollback plus corrected
roll-forward, checksum/gap refusal, advisory serialization, and apply-once
concurrency. The ledger is now 200 tasks: 135 done, 37 in progress, 27 open, and 1
blocked.
**Changed:** Canonical agent entry point; project-state evidence ledger; phase and
execution roadmaps; QA-004 task status; migration evidence boundary; changelog.
**Decisions:** none; D37 remains active, and deterministic isolated-Postgres proof
does not close OPS-005 production backup/restore, capacity, RPO/RTO, or disaster
recovery.
**Next:** execute QA-005's dependency-complete fault-behavior matrix while
credentialed providers, qualified external participants, production operations, and
hardware retain their separate prerequisites.
**Blockers:** none for QA-004. OPS-005 and QA-009 remain open for real encrypted
backups, restore exercises, capacity, and measured RPO/RTO.

## 2026-07-13 — Make Postgres migration history executable
**Session:** Codex agent · branch `codex/qa004-migration-acceptance` · **Phase:** QA /
data operations · **TODO items:** QA-004 [~], QA-001
**Done:** Recorded D37 and replaced the best-effort Postgres loop with one shared
runner that takes a database advisory lock, requires an exact contiguous checked-in
checksum prefix, and commits each migration plus its ledger row in one transaction.
Added a structured acceptance harness for a clean install and all 19 populated
historical prefixes through current migration 0020. The fixtures grow with the
historical schema and prove catalog, review, generation, platform, consent, and
lifecycle preservation; migration 0019 receives deliberately reversed 0018
authority sequences. The same gate proves unchanged reruns, injected atomic rollback
and corrected roll-forward, checksum/gap refusal, and two concurrent runners applying
once. `pnpm verify` now has 35 steps and passes completely, including 2/2 focused
migration-policy tests, 61 gateway tests, Brief-25 25/25, native/fresh-WASM parity,
115 worker tests, release packaging, and patch hygiene. The exact protected QA-003
evidence base `3f649f9` also passed post-merge CI `29284689496` and security
`29284689586`. The ledger is now 200 tasks: 134 done, 38 in progress, 27 open, and 1
blocked.
**Changed:** Postgres runner and acceptance scripts; required DB/CI commands and
artifact revision binding; D37; migration/deployment/recovery runbook; canonical
agent entry point; compatibility, governance, release, system, best-practice, risk,
state, phase, execution, TODO, and documentation-index guidance.
**Decisions:** D37 makes every exact checked-in pre-1.0 predecessor prefix supported,
keeps schema forward-only on application rollback, and requires explicit retirement
plus verified recovery guidance rather than edited history or convenience down
migrations.
**Next:** publish the implementation through the exact-check ruleset, inspect the
uploaded QA-004 JSON from PR and protected merge runs, then reconcile QA-004 to `[x]`
only if all 19 populated predecessors and recovery/concurrency scenarios pass.
**Blockers:** no implementation blocker. The local Docker/Postgres prerequisite is
unavailable and was not modified, so database acceptance remains intentionally owned
by required protected CI. Real encrypted backups, restore exercises, capacity, and
measured RPO/RTO remain OPS-005.

## 2026-07-13 — Record protected browser accessibility acceptance
**Session:** Codex agent · branch `codex/qa003-postmerge-evidence` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [x]
**Done:** Closed QA-003 through protected main. Exact implementation head `caed237`
passed PR #42 CI `29282669499` and security `29282669468`, including the required
Postgres/browser job and all dependency, SBOM, Desktop, Rust, worker, gateway, and
CodeQL checks. Protected squash `9c1802b` then passed post-merge CI `29283250843` and
security `29283250865`. The downloaded clean merge artifact binds source/checkout to
`9c1802b`, retains QA-002 10/10, and passes Chromium 148.0.7778.96 at full-Studio /
WebGL / high with 33 draws and the scene/Three.js chunks, plus Firefox 150.0.2 and
WebKit 26.4 at viewer-grade / Canvas2D / low with 17 draws and no WebGL presentation
chunks. Real WASM, validator admission, keyboard orbit/equip/explode/blueprint, AA
contrast, critical targets, narrow containment, reduced motion, and renderer/asset
isolation all pass. The ledger is now 200 tasks: 134 done, 37 in progress, 28 open,
and 1 blocked.
**Changed:** Canonical agent entry point; project-state evidence ledger; phase and
execution roadmaps; QA-003 task status; changelog.
**Decisions:** none; full Studio remains the Chromium/Tauri tier, and the dependency-
light core-baked schematic remains an explicitly viewer-grade presentation.
**Next:** execute the next dependency-complete local quality/operations lane while
EXT-001 awaits a qualified independent participant.
**Blockers:** none for deterministic browser support; Apple/mobile-device,
assistive-technology, real-mid-hardware performance, external-user, and field proof
retain their separate gates.

## 2026-07-13 — Separate viewer grade from WebGL
**Session:** Codex agent · branch `codex/qa003-browser-accessibility` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [~]
**Done:** Protected run `29281411617` disproved N8AO as the sole Firefox blocker:
QA-002 and all ten other checks passed, while Firefox again stalled before paint at
the remaining synchronous WebGL renderer boundary. Added a dependency-light
Canvas2D viewer scene that projects core-baked part centers, preserves orbit,
explode, blueprint, selection, equipped-variant rebuild/revalidation, picking, and
live pose consumption without creating a second source of physical truth. Full
Studio dynamically loads Three.js/WebGL only on the Chromium/Tauri tier; Firefox and
WebKit remain fixed-low viewer grade and do not request those chunks. The local
three-engine matrix now asserts renderer identity, presentation-asset isolation, and
positive draw counts in addition to the existing real-WASM, semantic, keyboard,
focus, contrast, target, responsive, and reduced-motion contract. All 34 required
non-database repository gates pass on the synchronized tree, including 61 gateway
tests, Brief-25 25/25, native/fresh-WASM parity, 115 worker tests, release packaging,
and patch hygiene.
**Changed:** Scene-controller boundary; Canvas2D schematic renderer; dynamic full-
Studio scene loading; browser evidence; agent entry point; current-state, roadmap,
TODO, execution, system, governance, debugging, risk, README, and support guidance.
**Decisions:** none; this implements D15's declared viewer-grade distinction
honestly. Canvas2D presentation is not full 3D and never changes core truth.
**Next:** publish the corrected head and require a new protected PR run with exact
passing evidence.
**Blockers:** none.

## 2026-07-13 — Defer advanced rendering on viewer-grade engines
**Session:** Codex agent · branch `codex/qa003-browser-accessibility` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [~]
**Done:** Used protected rerun `29280441449` to disprove the initial assumption that
disabling AO after scene construction was sufficient: QA-002 and ten other checks
passed, but Firefox again stalled before React painted because the advanced pipeline
was still constructed eagerly. Viewer-grade scenes now receive their initial tier at
construction and do not instantiate N8AO/EffectComposer unless a user explicitly
raises quality. The three-engine gate and the full viewer interaction contract remain
unchanged. Focused Firefox and the full three-engine matrix pass locally with the
advanced-pipeline state asserted per engine. The first full repository rerun exposed
a transient existing macOS process-termination race at worker step 33; its focused
test and all 115 worker tests passed immediately afterward, and a fresh full rerun
passed all 34 required non-database gates.
**Changed:** Studio scene lifecycle plus synchronized browser-support, testing,
README, and changelog guidance.
**Decisions:** none; lazy optional presentation preserves validator sovereignty and
the declared viewer-grade capability rather than treating a CI timeout as support.
**Next:** publish the corrected head and require a new protected PR run with exact
passing evidence.
**Blockers:** none.

## 2026-07-13 — Keep viewer-grade Studio usable under software WebGL
**Session:** Codex agent · branch `codex/qa003-browser-accessibility` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [~]
**Done:** Reconciled protected PR run `29279497748`: QA-002, every security job, and
four CI jobs passed, while QA-003 exposed a Firefox Linux software-rendering stall
before the accessible Studio surface painted. Preserved the three-engine hard gate
and changed viewer-grade engines to start at the low presentation tier (AO off,
device-pixel ratio 1); the acceptance artifact now records and asserts the initial
quality tier. Validator, bake, contract, and simulation truth remain unchanged, and
users can still opt into higher visual quality.
The focused Firefox rerun and full Chromium/Firefox/WebKit matrix pass locally, and
all 34 non-database repository gates pass on the corrected tree.
**Changed:** Studio viewer boot policy; QA-003 evidence; browser-support, testing,
README, and changelog guidance.
**Decisions:** none; this applies the existing XC-22 quality ladder to the declared
viewer-grade boundary instead of weakening the engine matrix or its assertions.
**Next:** publish the corrected head and require fresh protected three-engine
evidence before merge.
**Blockers:** none.

## 2026-07-13 — Gate accessible viewer-grade browser support
**Session:** Codex agent · branch `codex/qa003-browser-accessibility` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [~]
**Done:** Added a fail-closed production-bundle acceptance matrix for Chromium
148.0.7778.96, Firefox 150.0.2, and WebKit 26.4. Every engine loaded the real hashed
WASM facade, admitted an inline equipped-variant fixture, and passed semantic names/
landmarks, skip/focus indication, keyboard orbit/equip/explode/blueprint, live
announcements, WCAG AA fixture contrast (5.41:1 muted, 12.13:1 controls), and 28 px
critical targets. Chromium additionally passed 390 x 844 containment with zero
horizontal overflow and the reduced-motion contract. Studio now exposes semantic
regions and labels, a skip link, visible 3 px focus, keyboard camera controls,
stronger muted text, reduced-motion behavior, explicit support tiers, and a local
non-SAB session boundary. The required Postgres job installs all three engines and
uploads both QA-002 and QA-003 evidence. The ledger remains 200 tasks: 133 done, 38
in progress, 28 open, and 1 blocked; QA-003 is not complete before protected proof.
All 34 non-database repository gates pass after the browser run, including 61
gateway tests, Brief-25 25/25, native/fresh-WASM parity, packaging, 115 worker tests,
and patch hygiene. A 61-file Markdown scan checked 181 local links with zero broken.
**Changed:** Studio shell/scene accessibility and interaction; three-engine browser
runner and required workflow; browser-support contract; README; canonical agent,
system, testing, debugging, governance, risk, project-state, phase/execution roadmap,
and TODO guidance.
**Decisions:** none; full Studio remains the isolated desktop Chromium/Tauri tier,
Firefox/WebKit/mobile remain viewer grade, and proxy evidence grants no Apple-device,
screen-reader, external-user, or field claim. Added risk R22 for accessibility/
viewer regressions hidden by visual success.
**Next:** publish through protected PR/main, reconcile exact PR/post-merge runs and
evidence, then mark QA-003 `[x]`.
**Blockers:** none for deterministic QA-003 delivery; real assistive-technology,
vendor-device, performance, and independent-user evidence retain their later gates.

## 2026-07-13 — Record protected external-acceptance governance
**Session:** Codex agent · branch `codex/qa010-postmerge-evidence` · **Phase:** QA /
external and field proof · **TODO items:** QA-010 [x]
**Done:** Closed QA-010's evidence-governance kit through protected main. Exact PR
head `74bae6e` passed CI `29275447135`, security `29275447237`, the required
Postgres/real-browser job, dependency review/audit, source SPDX, native Desktop, both
CodeQL languages, the new policy step, and 9/9 focused tests. Protected squash
`8708de7` then passed post-merge CI `29275850838` and security `29275851177`,
including all 34 policy/runtime steps. The task ledger now has 133 done, 37 in
progress, 29 open, and 1 blocked.
**Changed:** Canonical entry-agent boundary, project-state evidence ledger,
phase/execution roadmaps, changelog, and QA-010 task status.
**Decisions:** none; structural evidence governance does not grant participant,
provider, spend, hardware, external-beta, or field authority and closes no `EXT-*`.
**Next:** execute the protected builder runbook for EXT-001 with an independent
participant while continuing the next dependency-complete local quality/operations
lane separately.
**Blockers:** EXT-001 requires a qualified independent participant; provider, print,
course/platform, controlled-lab, and field milestones retain their named external
authority and dependency gates.

## 2026-07-13 — Make external acceptance evidence executable
**Session:** Codex agent · branch `codex/qa010-external-acceptance` · **Phase:** QA /
external and field proof · **TODO items:** QA-010 [~], EXT-001..008
**Done:** Added a versioned registry and private run-pack CLI for builder, photoscan,
training, course, controlled D12 lab, print, marketplace, and maintenance acceptance.
Generated templates cannot validate as completed evidence; terminal manifests require
the exact revision/environment, registered roles and independence, authority hashes,
every step/evidence kind, finite measurements, findings review, incidents, matching
signoffs, limitations, and honest pass/fail/stop semantics. Repository-local run
output, unsafe evidence references, credential-shaped values, and public personal
data fail closed; manifest bytes, nodes, depth, containers, and strings are bounded.
Focused policy tests pass 9/9 and all eight generated templates pass
the deterministic registry check. An adversarial direct-object test briefly exposed
a shared-reference/true-cycle false positive; ancestor-scoped cycle detection now
preserves shared evidence references while rejecting actual cycles. After the fresh
worktree's first full run stopped
at TypeScript build because dependencies were not installed, a frozen lockfile
install restored the declared prerequisite and all 34 `pnpm verify` gates
passed. The unchanged worker suite also passes 115/115 in a clean Python 3.12.7
environment; 200 stable IDs remain unique with counts 132 done, 38 in progress, 29
open, and 1 blocked; 58 Markdown files have zero broken local links.
**Changed:** QA-010 registry, policy/CLI/tests, canonical external-acceptance runbook,
entry-agent rules, full/local/required-CI verification, repository governance,
debugging, best practices, README commands, and living execution/status ledgers.
**Decisions:** none; the kit governs evidence but grants no participant, provider,
spend, hardware, live, external-beta, or field authority.
**Next:** run the complete local gates, publish through protected PR/main, reconcile
exact remote evidence, then execute EXT-001 with an independent builder.
**Blockers:** actual EXT-001 needs an independent participant; provider, print,
course/platform, controlled-lab, and field milestones retain their named external
authority and dependency gates.

## 2026-07-13 — Record protected builder-loop acceptance
**Session:** Codex agent · branch `codex/qa002-postmerge-evidence` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [x]
**Done:** Closed QA-002 at deterministic product-acceptance maturity. Exact PR head
`6a8ce28` passed CI `29272067712`, security `29272067617`, the resolved PR-level
CodeQL check, and a structured 10/10 real-WASM/isolated-Postgres browser artifact.
Protected squash `c80accb` then passed post-merge CI `29272532186` and security
`29272531705`, including the ten flows, 20 migrations, transactional commerce
materialization, Rust, workers, TypeScript/gateway, native Desktop, audits, source
SPDX, and both CodeQL languages.
**Changed:** Canonical agent boundary, project-state evidence ledger, phase/execution
roadmaps, and QA task status.
**Decisions:** none; fixture/deterministic closure does not imply live-provider,
external-user, hardware, or field maturity.
**Next:** create QA-010's independent-builder script/evidence template, then execute
EXT-001 while continuing the credentialed P3-004/P4-016 catalog lane separately.
**Blockers:** external acceptance requires an independent participant; credentialed
catalog proof requires owner-scoped provider/deployment authority.

## 2026-07-13 — Bind owner listing reads to the framework limiter
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~], SEC-006
**Done:** Resolved the high-severity CodeQL finding on the new owner-listing query by
binding the route to the official Fastify limiter as well as the existing shared
public-surface limiter. Focused coverage proves the route refuses the second request
under a one-request policy.
**Changed:** Owner-listing route composition, security coverage, and gateway testing
guidance.
**Decisions:** none; the request budget remains fail-closed and identity-keyed.
**Next:** rerun full local and exact-head CI/security/browser acceptance, then inspect
the replacement Advanced Security check before marking PR #38 ready.
**Blockers:** none.

## 2026-07-13 — Keep governed owner listings visible after refresh
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~]
**Done:** Corrected the listing read boundary exposed by protected browser evidence.
Authenticated owners can now reload their own persisted listings across review and
historical states without receiving the global curation queue; Studio deduplicates
those rows with the public listed marketplace. The gateway test proves anonymous
refusal and exact owner-scoped review-row retrieval.
**Changed:** Owner listing API, gateway coverage, Studio marketplace refresh, and
gateway/platform system contracts.
**Decisions:** none; public discovery remains listed-only and review authority remains
separate from listing ownership.
**Next:** rerun the exact-head isolated browser gate from governed listing rendering.
**Blockers:** none.

## 2026-07-13 — Let bodyless mutations reach their product guards
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~]
**Done:** Corrected the Studio API client after browser evidence showed bodyless model
sharing was rejected by Fastify's empty-JSON parser before the draft-status guard.
JSON content type is now sent only with an actual string body, so the server can emit
the intended fail-closed `only admitted models can be shared` refusal.
**Changed:** Studio gateway transport contract and Studio system guidance.
**Decisions:** none; the admitted-only sharing invariant is unchanged.
**Next:** rerun the exact-head isolated browser gate from its fifth flow.
**Blockers:** none.

## 2026-07-13 — Retry the visible account bootstrap in browser acceptance
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~]
**Done:** Hardened the production-preview harness against an observed transient boot
race where the first account request failed while other panels initialized. The gate
now retries only through Studio's visible, idempotent account refresh action and still
requires the exact test identity before any accepted flow begins.
**Changed:** Stable account-refresh selector and browser authentication bootstrap.
**Decisions:** none; authorization semantics and test-header scope are unchanged.
**Next:** rerun exact-head isolated Postgres/browser acceptance and inspect the next
structured artifact.
**Blockers:** none.

## 2026-07-13 — Bind catalog-aware reports to the browser contract
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~]
**Done:** Corrected the Studio contract-load boundary exposed by the isolated browser
gate: the local WASM validator still runs on every load, while a catalog-aware gateway
report is retained only when its non-empty contract hash, report format, schema, and
validator versions exactly match the WASM result. Generated catalog models now retain
their sovereign native admission instead of being falsely rejected by WASM's
intentional empty catalog, and mismatched/stale reports fail closed to the local
verdict.
**Changed:** Studio report selection and the Studio system contract.
**Decisions:** none; the platform catalog remains server-owned and the UI truthfully
displays the active report target.
**Next:** rerun the exact-head isolated Postgres/browser acceptance and continue only
from its structured evidence.
**Blockers:** none for the deterministic gate; live-provider and external-user proof
remain separate.

## 2026-07-13 — Gate the complete builder loop in a real browser
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~], QA-001
**Done:** Added a fail-closed Playwright-core harness for the complete QA-002 surface:
authenticated production-bundle startup, real built-WASM validation, approved catalog
rows from Postgres, staged template generation, persisted draft/share refusal,
deterministic edit/revalidation, admitted anonymous share with private model 401,
EnvSpec course creation, governed listing creation, fixture job success, and
Postgres-materialized maintenance rendering. The required Postgres job now downloads
the exact validator artifact from `forge-core (Rust)`, installs Chromium, runs the
entire `pnpm verify:db` contract including the browser harness, and uploads structured
evidence or a failure screenshot. Local Studio/gateway typechecks and production
builds pass; the harness's undeclared-database refusal, 10/10 golden-policy tests, and
62 immutable workflow references pass. QA-002 remains in progress until the isolated
remote database/browser run and protected post-merge evidence are green.
**Changed:** browser E2E runner and selectors, production-preview same-origin proxy,
Postgres CI composition, root verification commands, canonical agent/governance/
debugging/best-practice/system guidance, and living state/roadmap/task ledgers.
**Decisions:** none. The harness uses deterministic fixture providers only, adds no
credential or live-provider authority, and does not change a registered golden.
**Next:** obtain the exact PR-head Postgres/Chromium evidence, merge through the
required ruleset, verify post-merge CI/security, then reconcile QA-002 to `[x]`.
**Blockers:** local Postgres remains unavailable because the existing Docker VM is
unhealthy and was not modified; the required isolated CI service is the acceptance
path. No external credential, hardware, or spending authority is required.

## 2026-07-13 — Record protected golden-review evidence
**Session:** Codex agent · branch `codex/qa008-postmerge-evidence` · **Phase:** QA
cross-cutting · **TODO items:** QA-008 [x], QA-001
**Done:** Golden-review PR #36 passed all required checks at exact implementation
head `4497c83`, including CI `29264389481`, security `29264386113`, the new
cumulative-patch policy in `forge-core (Rust)`, Postgres, workers, TypeScript/gateway,
native Desktop, dependency review/audits, source SPDX, and both CodeQL languages. It
merged through the exact-check ruleset as `2589503`; exact post-merge CI
`29264679254` and security `29264678863` are green on that protected SHA. QA-008 is
closed without changing any provider, user-acceptance, hardware, or field maturity.
**Changed:** canonical agent boundary, project-state evidence ledger, phase/execution
roadmaps, and REC/GOV/QA task ledgers.
**Decisions:** none. D17 and D32 remain binding; this records protected evidence only.
**Next:** begin the smallest dependency-complete QA-002 browser-E2E builder-loop
slice using real built WASM and an isolated database.
**Blockers:** none for QA-008. Live provider, external-user, and field gates remain
independently open.

## 2026-07-13 — Require evidence for every golden re-pin
**Session:** Codex agent · branch `codex/qa008-golden-review-policy` · **Phase:** QA
cross-cutting · **TODO items:** QA-008 [~], QA-001
**Done:** Added a machine-owned registry for fourteen schema, render, physics,
validator, corpus, and committed generated-runtime artifact families. The registry
protects itself, the checker unions parent/current inventories so same-patch removal
cannot hide drift, and the frozen prototype HTML is hard-required immutable. Every
registered change now needs exactly one new append-only Markdown record with matching
path, artifact ID, classification, rationale, source-of-truth change, compatibility
impact, before/after evidence, reviewer focus, and task/decision references. Ten
focused policy tests cover success, missing record, immutable input, history edits,
placeholders, unrelated paths, parent-registry weakening, class mismatch, record-
directory redirection, and ownership overlap. The expanded `pnpm verify` passes all
33 gates with 61/61 gateway tests, 115/115 workers,
Brief-25 25/25, declared verdicts 5/5, native/WASM parity, pinned simulation parity,
release packaging, and patch hygiene.
**Changed:** golden registry, policy/checker/tests, required Rust CI job, full local
gate, canonical agent/read order, contributor/debugging/compatibility/governance/
release/risk/best-practice/system documentation, roadmap/state/task ledgers, and one initial
append-only registry evidence record.
**Decisions:** none. D17 and D32 remain binding; the policy records evidence and adds
no product, provider, hardware, or compatibility authority.
**Next:** deliver QA-008 through the exact-check ruleset and verify its protected
post-merge CI/security; then begin the smallest QA-002 browser-E2E builder-loop slice.
**Blockers:** none for QA-008. Live Wave 2 provider/user acceptance remains external.

## 2026-07-13 — Record protected commerce queue evidence
**Session:** Codex agent · branch `codex/p11-commerce-evidence` · **Phase:** Wave 2 R1
builder loop · **TODO items:** P11-005 [~]
**Done:** Queued-commerce PR #34 passed all required checks and merged through the
exact-check ruleset as `18f54fd`. Exact post-merge CI `29260837182` and security
`29260833090` are green. The protected Postgres log applies migrations 0001..0020 and
records concurrent gateway retry/request-binding/owner-scope acceptance plus worker
success/corrupt-output rollback. Protected workers pass 115/115, gateway 61/61,
Brief-25 25/25, and declared verdicts 5/5; Rust, native Desktop, dependency audit,
source SPDX, and both CodeQL languages also pass.
**Changed:** canonical agent boundary, project-state evidence ledger, roadmap,
execution roadmap, and P11-005 task ledger.
**Decisions:** none. This records evidence for the existing D27/D29-aligned
contract/fixture slice and creates no provider or live authority.
**Next:** execute a credentialed vendor sandbox with deployment-owned egress, quota,
telemetry, retry/recovery, billing, current-terms, and purchasable-BOM evidence.
**Blockers:** external vendor credentials, current provider/commercial terms, and
deployment authority are required for the next maturity step.

## 2026-07-13 — Route vendor offers through the bounded worker queue
**Session:** Codex agent · branch `codex/p11-commerce-worker-bridge` · **Phase:** Wave
2 R1 builder loop · **TODO items:** P11-005 [~]
**Done:** Replaced the legacy direct gateway vendor HTTP lane with an explicit
`sandbox|worker` route contract. Worker execution requires non-empty component IDs,
a 1..200-character idempotency key, the local provider, and configured
`FORGE_VENDOR_REFRESH_CMD`; the dedicated commerce route and generic job entry point
enforce the same provider, idempotency, component-count, timeout, and allowed-field
contract, so neither can accept inline provider offers. The registered Python handler
fails closed if its command disappears,
normalizes at most 50 rows under a 120-second ceiling, sanitizes held rows, and bounds
public credential-free HTTPS links, finite nonnegative prices, three-letter
currencies, availability, rate limits, and provenance. The Postgres worker revalidates
accepted output and inserts offers inside the same transaction as job success. Studio
uses the queue only when capability discovery reports the command configured and
otherwise retains the deterministic sandbox handoff. The machine compatibility
matrix now exact-matches all 16 gateway queue kinds. Client job idempotency keys are
domain-separated owner digests: exact retries return the original job without
duplicate materialization, different request content conflicts, and the same client
key cannot cross tenant boundaries or suppress another owner's credit debit. If
transactional materialization rejects an output, success and all inserts roll back,
the runner records a failed job, and the worker loop continues. `pnpm verify` passes
all 32 gates with 61/61 real-validator gateway tests, 25/25 Brief-25, and 115/115
worker tests; `pnpm audit --audit-level=high` reports no known
vulnerabilities.
**Changed:** gateway route/job capability and tests; Studio commerce client/action;
worker commerce registration, normalization, transactional materialization, and
tests; migration 0020, protected Postgres gateway idempotency/concurrency and worker
materialization acceptance, and CI data-plane wiring;
compatibility matrix/check; canonical agent guidance, best practices,
threat/risk/state/roadmap/task/execution/architecture, and gateway/worker/platform
system documentation.
**Decisions:** none. The slice follows D27 fixture-first expansion and D29's
off-platform quote/link beta, adds no dependency, and does not create payment,
checkout, provider, or live authority.
**Next:** deliver the slice through the exact-check ruleset and use its 20-migration
Postgres job/materialization proof as acceptance; after protected post-merge evidence,
the next P11-005 step is a credentialed vendor sandbox with deployed egress, quotas,
telemetry, retry/recovery, billing, and current terms evidence.
**Blockers:** none for contract/fixture delivery. Local Postgres proof is unavailable
because the existing Docker VM is unhealthy; do not repair or reset that user-owned
runtime in this lane. Credentialed provider and production-operations proof require
external owner/deployment authority.

## 2026-07-13 — Add the bounded native Anthropic ETL transport
**Session:** Codex agent · branch `codex/p4-native-anthropic-etl` · **Phase:** Wave 2
R1 builder loop · **TODO items:** P3-004 [~], P4-016 [~]
**Done:** Added a no-new-dependency native Anthropic Messages API path behind the
existing deterministic fixture and deployment-command precedence. The worker pins
the exact endpoint, API version, Haiku 4.5 snapshot, token/time/byte budgets, forced
strict tool choice, delimiter-safe untrusted source input, header-only service key,
local canonical-row validation, and model/API/source provenance. The provider emits
only a strict supported-subset envelope; local code rejects malformed, non-finite,
deep, uncited, unlicensed, or incomplete candidates before the existing P3 gate.
Focused adapter/security tests pass 18/18 and the complete worker suite passes
110/110 without making a provider call. After installing the frozen worktree
dependencies, the complete 32-step `pnpm verify` gate also passes; the first attempt
had stopped at TypeScript build only because the new worktree had no `node_modules`.
**Changed:** ETL adapters and ingest result provenance; focused worker security tests;
`AGENTS.md`; threat, risk, decision, project-state, roadmap, task, execution, component-
database, generation, compute-worker, and changelog documentation.
**Decisions:** D36 records the native ETL authority boundary. Official Anthropic
Messages, API versioning, strict-tool/structured-output limits, and Haiku model docs
were rechecked on 2026-07-13. The adapter uses the standard library and adds no
runtime dependency.
**Next:** publish through the exact-check ruleset, then execute the next dependency-
complete R1 slice; credentialed ETL acceptance must
eventually prove a real row through dedupe, immutable persistence, owner review, BOM,
and lawful export.
**Blockers:** none for contract/fixture delivery. A credentialed sandbox/live claim
requires owner-supplied provider authority plus deployed egress, quota, log, billing,
outage, retention, and recovery evidence.

## 2026-07-13 — Prove SEC-006 on protected main
**Session:** Codex agent · branch `codex/sec006-postmerge-evidence` · **Phase:** Wave 2 ·
**TODO items:** SEC-006
**Done:** Squash-merged PR #31 through protection at exact `d952f60`. Post-merge CI
`29251978420` passed Postgres/pgvector, workers, Rust, native Desktop, and the full
TypeScript/gateway/oracle stack; security `29251978330` passed JavaScript/TypeScript
and Python CodeQL, npm/root/Desktop RustSec audits, and validated source SPDX.
**Changed:** `AGENTS.md` plus project-state, roadmap, execution, task, and changelog
evidence now identify SEC-006 as protected contract/fixture truth.
**Decisions:** none. Production egress, shared quota/spend state, secret/log drills,
rotation, isolation, backup/restore, and incident evidence remain explicit operations
gates before live or billable claims.
**Next:** execute the smallest dependency-complete Wave 2 R1 builder-loop slice.
**Blockers:** none for SEC-006.

## 2026-07-13 — Close the SEC-006 contract and fixture boundary
**Session:** Codex agent · branch `codex/sec006-threat-boundaries` · **Phase:** Wave 2 ·
**TODO items:** SEC-006
**Done:** Closed SEC-006 at contract/fixture maturity. Exact implementation head
`1f7cf41` passed all 32 local gates plus PR #31 CI `29251276475`, security
`29251276469`, Postgres/pgvector, TypeScript/gateway, Rust, Python, native Desktop,
dependency review/audit, source SPDX, both CodeQL languages, and the PR-level CodeQL
result. CodeQL's Fastify per-route model now follows the shared Auth.js rate-policy
object directly; the runtime regression independently proves one forged-cookie request
gets `200` and a rotated-cookie request from the same peer gets `429` under the scoped
limiter.
**Changed:** SEC-006 rate-policy plumbing and current-boundary, roadmap, execution,
task, and changelog evidence.
**Decisions:** none. The local Docker VM failure is not hidden, but the exact-tree
remote database gate supplies the required acceptance proof. Production egress,
shared quotas, log/secret drills, rotation, workload isolation, and incident evidence
remain separate operations maturity gates.
**Next:** merge PR #31 through protection, verify exact post-merge CI/security, then
start the next dependency-complete Wave 2 builder-loop slice.
**Blockers:** none for SEC-006 contract/fixture acceptance; protected merge and
post-merge verification are workflow steps still to execute.

## 2026-07-13 — Bound every application trust edge
**Session:** Codex agent · branch `codex/sec006-threat-boundaries` · **Phase:** Wave 1/2 ·
**TODO items:** PRE-004, P2-001, SEC-006, QA-001
**Done:** Delivered the public-surface/ModelSpec 2.2/SEC-001..005 v0.2 stack through
protected PR #30 at `d34b6fd`, closing PRE-004 and P2-001 with the registry deferral
still explicit. Implemented the SEC-006 contract/fixture boundary: fail-closed
production Auth.js configuration and trusted origin, built-in CSRF retention,
development/admin authority controls, header-only request-ephemeral Anthropic keys,
key persistence/reflection/env-fallback regression proof, recursive JSON and direct
job/object limits, HTTPS/host/DNS/redirect/type/full-body-deadline/byte provider
guards, delimiter-safe prompt data, configured-bucket/key-bound object presign and
deletion, short-lived forced-download URLs, bounded validator and worker commands,
peer-IP classed rate limits immune to forged session-cookie rotation, generic redacted
errors, and exact bounded
release archive preflight that rejects links, devices, FIFOs, and every other
non-regular member before extraction. Added the canonical threat model with live
deployment and residual-risk gates. `pnpm verify` passes all 32 steps with 59/59 real-
validator gateway tests, 25/25 Brief-25, 104/104 workers, and all 4 archive-policy
tests; the published v0.1.0 assets also pass the hardened verifier.
**Changed:** gateway auth/security/generation/object/platform/server/validator code,
tests, dependency manifest, and lockfile; worker network/command adapters and tests;
release verifier/archive policy;
committed-range patch-hygiene enforcement; `AGENTS.md`, threat/security/system/
release/governance/risk/state/roadmap/task docs.
**Decisions:** no new product authority. Added `@fastify/rate-limit` 11.1.x, the
official Fastify 5-compatible line, only inside the Auth.js route scope so authorization
throttling is framework-enforced and CodeQL-visible; the classed store retains the
other four surfaces. Both are deliberately only single-process proof; production
requires connection-time egress enforcement, shared
rate/concurrency/spend state, secret/log/rotation drills, workload isolation, and
incident/restore evidence. No inbound callback or user-archive importer exists.
**Next:** obtain the exact-tree remote Postgres and remaining protected checks, then
mark SEC-006 done, reconcile the evidence, merge, and proceed to the next autonomous
Wave 2/quality slice.
**Blockers:** local `pnpm verify:db` failed before migration with `ECONNRESET`; Docker
Desktop's VM log reports filesystem inconsistency and no free space to extend its
disk. The migrations are unchanged and PR #30's Postgres proof is green, but SEC-006
will not close until the required remote Postgres check passes on this exact tree.

## 2026-07-13 — Publish and independently verify validator v0.1.0
**Session:** Codex agent · branch `codex/v02-contract-security-stack` · **Phase:** G1 ·
**TODO items:** GOV-008, GOV-009, OPS-011
**Done:** Protected-main manual release run `29241883791` passed the release contract,
Linux, Windows, macOS Intel, WASM, both SPDX SBOMs, checksums, downloaded-payload
verification, provenance attestation, and aggregate upload at exact commit `1093842`.
Its downloaded aggregate independently passed checksums, artifact SPDX, the macOS
binary/version/canonical example, and a clean WASM consumer. Created and pushed
annotated tag `v0.1.0`; tag run `29244972303` rebuilt every platform and published the
non-draft nine-asset GitHub Release. Downloaded every public asset after publication
and repeated the same independent binary/WASM verifier successfully. Rebuilt the
public-surface/XC-28/SEC-001..005 v0.2 stack on exact protected main without duplicate
pre-squash release commits; its full 31-step and Postgres/pgvector gates pass.
**Changed:** canonical agent boundary, project/phase/task/execution/release/risk/v0.2
living documentation, plus the protected v0.2 integration history.
**Decisions:** crates.io/npm publication is explicitly deferred because no
owner-scoped registry credentials or publication decision were supplied; the verified
GitHub Release is the G1 publication boundary.
**Next:** deliver the green v0.2 stack through the exact-check ruleset, then continue
SEC-006 and later Wave 2 work without overstating live/provider/field maturity.
**Blockers:** no G1 blocker remains. Qualified trademark review, Linux Desktop's
time-bounded glib route, production providers/operations, external users, and hardware
evidence remain separate tasks.

## 2026-07-13 — Prove the corrected release bundle on and off CI
**Session:** Codex agent · branch `codex/g1-release-runner` · **Phase:** G1 ·
**TODO items:** GOV-008, OPS-011
**Done:** Manual branch run `29236010204` passed the release contract, Linux,
macOS Intel, Windows, WASM, aggregate checksum/SPDX verification, and provenance
attestation at exact commit `02f912d1dbe1a07f6ea29055ad55c5ae29eca279`.
Downloaded the aggregate artifact outside Actions and independently verified every
checksum, both SPDX documents, the macOS x86_64 binary version and canonical example,
and a clean WASM consumer install. That external check found the verifier had
hard-coded the Linux archive despite documenting a user-runnable download command;
verification now requires all three native bundles and selects the current host's
binary for smoke execution. The same downloaded aggregate then passed end to end on
Apple Silicon through the advertised macOS x86_64 payload.
**Changed:** downloaded release verifier, release runbook, task/state evidence, and
changelog.
**Decisions:** none; the release remains x86_64 on each native OS, and verification
now follows that declared platform matrix.
**Next:** Deliver the verifier correction through protected PR #29, rerun the manual
workflow on the resulting protected `main`, independently download/verify it, then
create annotated tag `v0.1.0`.
**Blockers:** no artifact or runner blocker; protected-main and tag publication proof
remain deliberately incomplete.

## 2026-07-13 — Bound and migrate the Intel macOS release lane
**Session:** Codex agent · branch `codex/g1-release-runner` · **Phase:** G1 ·
**TODO items:** GOV-008, OPS-011
**Done:** Preserved protected manual run `29216053372` as failed operational
evidence after its macOS 15 Intel full-LTO build/smoke produced no artifact in
5h10m; selected the supported macOS 26 Intel runner without changing the x86_64
artifact, smoke, SBOM, checksum, or attestation contract; and added a one-hour
native-job ceiling so this failure mode cannot silently consume a full runner day.
When macOS 26 full-LTO branch run `29227763639` hit the 60-minute job ceiling before
staging/upload, compared clean local arm64 profiles: thin LTO cut wall time from
34.62s to 19.25s while both binaries passed version and canonical-admission smoke.
Native size changed from 2,735,488 to 3,456,528 bytes; no binding native-size budget
exists. Thin-LTO run `29230415603` then built/smoked Linux, Windows, macOS Intel, and
WASM successfully; all PR CI/security checks passed. Its aggregate verifier exposed
that Actions artifact transfer had normalized the staged Linux binary to non-
executable mode before deterministic archive assembly. Assembly now restores the
declared native mode before archiving, uses timestamp-free gzip output, and
verification explicitly rejects a Linux archive without executable bits. The actual
downloaded inputs from that failed run reassemble with mode 0755, and repeated Linux/
macOS tarballs are byte-identical. The thin profile and permission fix pass all 31
required local gates and clean WASM installation.
**Changed:** release workflow/profile, binary assembly and downloaded verification,
release runbook, risk register, task ledger, project state counts, and changelog.
**Decisions:** no architectural decision; OPS-011 uses a measured thin-LTO release
profile and runner migration, with `macos-15-intel` retained through August 2027.
**Next:** Rerun the protected branch workflow with normalized archive permissions,
deliver through protected `main`, download and independently verify the aggregate
artifact, then create `v0.1.0`.
**Blockers:** GOV-008 remains open until the corrected aggregate verifier and
downloaded artifact pass; native runner migration itself is now remotely proven.

## 2026-07-13 — Make deletion survive holds, backups, and restore
**Session:** Codex agent · branch `codex/sec005-retention-backups` · **Phase:** P4/P11 ·
**TODO items:** SEC-005
**Done:** Added data-lifecycle format/policy 1.0.0 with six bounded retention classes,
time-bounded append-only user/object/audit legal holds, monotonic consent/hold event
sequences, pseudonymous deletion tombstones, exact backup subject manifests,
fail-closed restore evaluation, retryable provider deletion with stale-claim recovery,
post-deletion capture refusal, late-catalog tombstone reopening, and dry-run-first
primary retention. Hold placement/release, backup registration/restore evaluation,
and deletion share globally ordered transaction-scoped pseudonymous subject locks;
account deletion checks the owner and every object so concurrent or object-specific
authority cannot race the purge.
Authenticated export 1.2.0 adds redacted hold/backup state, deletion receipt 2.0.0
records restore suppression without claiming provider erasure, and public/account
lifecycle endpoints expose only bounded state. The provider-specific backup adapter,
encrypted production copies, deletion receipts, sandbox restore, monitoring, and
measured RPO/RTO remain explicitly separate under OPS-005.
**Evidence:** `pnpm verify` passes all 31 non-DB gates with 12 compatibility surfaces,
45/45 gateway tests using the real validator with no skips, Brief-25 at 25/25, and
100/100 worker tests. Expanded `pnpm verify:db` passes on the populated predecessor;
a clean scratch database applies all 19 migrations, passes seed/export/deletion/
consent/lifecycle assertions, and skips every unchanged checksummed migration on
rerun. A dedicated upgrade fixture starts from migrations 0001..0018, deliberately
reverses same-time grant/withdraw and place/release sequence values, then proves 0019
reconstructs both causal chains and reinstates the unique indexes/append-only
triggers. The lifecycle fixture proves user and object holds, causal release, exact
backup subject idempotency, post-delete capture refusal, late-catalog reopening,
pre-deletion restore refusal, bounded adapter failure, stale-claim recovery,
tombstone finalization/expiry, user/audit retention holds, causal expiry of closed
hold chains, 400-day restore-test/deleted-catalog/audit expiry, redaction, mutation
rejection, and zero fixture residue. The exact documented
`pnpm lifecycle:ops -- help` command passes, and its dry-run retention command reports
every deletion/finalization class without mutation. Official GDPR Articles 5/17 and
NIST SP 800-209/SP 1339 were rechecked as primary policy/recovery references; product
defaults still require jurisdiction-specific owner/counsel review.
**Changed:** migrations 0017..0019; gateway lifecycle/account/consent/server code and
tests; lifecycle operator and populated/clean Postgres assertions; compatibility
matrix/checker; root `AGENTS.md`; D35; data-lifecycle, security, architecture,
best-practice, gateway/platform, state, roadmap, execution, task, risk, release, and
v0.2 release documentation.
**Decisions:** D35 separates primary deletion plus deterministic restore suppression
from physical provider-backup and disaster-recovery proof.
**Next:** independently download and verify protected-main release run `29241883791`;
only then create annotated `v0.1.0`, verify the published GitHub Release, and deliver
the ordered XC-28/SEC-001..005 v0.2 stack through protected PRs.
**Blockers:** no local SEC-005 blocker. Production backup/DR remains gated by
`OPS-005`; v0.2 delivery remains ordered behind G1 publication proof. Protected
`main` is `1093842` after PR #29 with green post-merge CI/security; manual release
run `29241883791` is still in progress at this entry.

## 2026-07-13 — Make user-content consent explicit and revocable
**Session:** Codex agent · branch `codex/sec004-consent-ledger` · **Phase:** P4/P5/P7/P10/P11 ·
**TODO items:** SEC-004
**Done:** Added consent-ledger format 1.0.0 as immutable grant/withdraw events for
photoscan processing per object, telemetry sharing and training reuse per log,
pattern contribution per model, and leaderboard publication per account. Every event
binds an owned subject, current policy version and notice hash, previous event,
bounded evidence, and idempotency. The gateway locks the owner and rechecks active
consent in the same serializable transaction as each action; generic and direct
photoscan/training job entry points retain the same guard. Withdrawal cancels
affected queued/running work, makes telemetry private, and removes pattern or
leaderboard eligibility. Worker completion now requires the row to remain running,
so a late result cannot overwrite cancellation or materialize an artifact.

Studio adds an expandable privacy-authority panel with the exact five notices,
independent current state, explicit grant/withdraw controls, owned-photo requirements,
and telemetry share, model-pattern, and telemetry-training actions. User-data export
is additively bumped to 1.1.0 with the complete consent history; account deletion
explicitly purges it. No consent or withdrawal claims provider recall, retention/
legal-hold expiry, tombstone completion, or backup erasure.
**Evidence:** `pnpm verify` passes all 31 gates with 11 compatibility surfaces,
41/41 gateway tests using the real validator with no skips, Brief-25 at 25/25, and
100/100 worker tests. The worker suite also passes under Python 3.12.7. Expanded
`pnpm verify:db` passes on both a populated predecessor and a clean scratch database:
all 16 migrations, five grant/withdraw histories and effects, append-only rejection,
export/delete zero residue, and an unchanged checksum/idempotency rerun are green.
Studio typecheck and production build pass. A real Chromium session against the
local gateway and Postgres renders all five notices, grants account leaderboard
publication to `1 active`, then withdraws it back to `0 active` with the explicit
withdrawal confirmation. That smoke exposed and fixed the Compose Studio profile's
cross-origin gateway URL: browser calls now stay same-origin and Vite proxies to the
gateway inside the Compose network.
**Changed:** migration 0016; gateway consent/account/job/server code and tests;
worker cancellation/materialization guard and tests; Studio gateway client and
privacy controls; compatibility matrix/checker; database acceptance scripts; root
`AGENTS.md`; Compose Studio proxy; D34; architecture, best-practice, security, gateway/worker/Studio/
platform, state, roadmap, execution, task, risk, release, and v0.2 release docs.
**Decisions:** D34 supersedes D2's pattern opt-out/marketplace-default mechanic with
explicit per-model opt-in while retaining D2's open-core boundary.
**Next:** implement `SEC-005` retention, legal-hold, tombstone, backup-expiry, and
restore/deletion proof without weakening the primary deletion or consent boundaries.
**Blockers:** no local SEC-004 blocker; protected v0.2 delivery remains ordered
behind G1 release proof and the stacked XC-28/SEC-001/SEC-002/SEC-003 commits.
Corrected G1 branch run `29236010204` and its independently downloaded aggregate
are green; protected-main rerun, tag, and GitHub Release proof remain.

## 2026-07-13 — Make user export and primary deletion complete
**Session:** Codex agent · branch `codex/sec003-user-export-delete` · **Phase:** P4/P11 ·
**TODO items:** SEC-003
**Done:** Added authenticated user-data export format 1.0.0 across account metadata,
generated artifacts, models/shares, object blobs/photoscan, jobs, replays, policies,
courses/leaderboards, marketplace/classroom activity, telemetry/maintenance, quote
requests, refusals, and pattern contributions. Export reads a repeatable snapshot,
points binary payloads to authenticated blob-download routes, and excludes OAuth
access/refresh/ID tokens, session/verification tokens, and provider keys.
Exact-confirmation account deletion now locks the owner in a serializable transaction,
explicitly purges rows that user deletion previously orphaned through `SET NULL`,
batches S3-compatible payload deletion before commit, rolls back database changes on
storage failure, and returns primary-only deletion receipt 1.0.0.
**Evidence:** `pnpm verify` passes all 31 gates with 10 compatibility surfaces,
36/36 gateway tests using the real validator with no skips, Brief-25 at 25/25, and
99/99 worker tests. Expanded `pnpm verify:db` builds the gateway, exports a populated
owner fixture, proves secret exclusion, deletes it, and finds zero named primary
residue. `pnpm --filter @forge/gateway test:object-storage` uploads a unique MinIO
object, exercises the production delete adapter, and requires a 404 afterward.
**Changed:** gateway account-data/transaction/object-storage code and route tests;
Postgres and MinIO acceptance scripts; compatibility matrix/checker; root
`AGENTS.md`; D33; best-practice, security, gateway/platform, state, roadmap,
execution, task, risk, release, and v0.2 release-note documentation.
**Decisions:** D33 makes export and primary deletion explicit, versioned,
secret-minimizing, and fail-closed, while reserving consent and backup lifecycle for
SEC-004/005.
**Next:** implement `SEC-004` consent/version/withdrawal records and enforcement on
photoscan processing, telemetry sharing, pattern contribution, leaderboards, and
training reuse, then close SEC-005 retention/hold/tombstone/backup proof.
**Blockers:** no local SEC-003 blocker; protected v0.2 delivery remains ordered behind
the queued G1 release proof and stacked XC-28/SEC-001/SEC-002 commits. A primary
deletion receipt intentionally does not claim backup erasure.

## 2026-07-13 — Refuse prohibited briefs before execution
**Session:** Codex agent · branch `codex/sec002-prohibited-briefs` · **Phase:** P4/P10 ·
**TODO items:** SEC-002
**Done:** Added a versioned deterministic platform-exclusion guard for weapons,
targeting, munitions, and interdiction briefs before catalog/pattern retrieval,
template or Anthropic synthesis, model edits, and course generation. The five HTTP
surfaces log a minimal refusal record before execution; direct generation APIs also
assert independently. Bounded explicit exclusions such as “no targeting modules”
remain valid, while mixed/obfuscated requests remain refused. Responses and SSE
events never echo the refused prompt or provider key, and audit-store failure prevents
all downstream work.
**Evidence:** `pnpm verify` passes all 31 local gates with 8 compatibility surfaces,
32/32 gateway tests with the real validator and no skips, Brief-25 at 25/25, and
99/99 worker tests. `pnpm verify:db` applies all 15 migrations to the populated
Compose database; a clean scratch database passes migration/seed/invariants, and an
unchanged rerun skips every checksum-pinned migration. Schema assertions prove that
`generation_refusals` has no raw-prompt or credential columns. Focused tests cover
benign robotics language, explicit safety exclusions, mixed and spaced/punctuated
evasion, all guarded routes, direct calls, provider non-invocation, redaction, and
audit failure.
**Changed:** canonical agent/best-practice/compatibility/release guidance, gateway
generation/server/safety code and tests, additive migration 0015 plus DB invariants,
and the security, generation, data, roadmap, state, task, and v0.2 release documents.
**Decisions:** none; implements the existing absolute platform exclusion without
changing its scope.
**Next:** implement `SEC-003` user-scoped export/deletion as the next dependency-
complete privacy slice while the G1 v0.1 release proof and protected v0.2 delivery
remain ordered ahead of publication.
**Blockers:** no local SEC-002 blocker; protected delivery remains dependency-ordered
behind the v0.1 release and the stacked XC-28/SEC-001 v0.2 work.

## 2026-07-13 — Enforce lawful manufacturing exports
**Session:** Codex agent · branch `codex/sec001-license-exports` · **Phase:** P3/P11 ·
**TODO items:** SEC-001, P11-008
**Done:** Made D10 authoritative in the gateway fixture and Python worker export
paths. Every assembly asset now requires compatible ledger evidence; the most
restrictive asset derives the assembly policy; attribution binds a versioned 1.0
manifest; and no-redistribution/view-only geometry becomes a dimensioned envelope
with datum ports and an HTTPS BOM link-out instead of a printable artifact. External
OCCT commands receive the manifest/hash, must prove attribution embedding or
restricted-geometry exclusion, and can return only allowlisted metadata and safe
artifact references.
**Evidence:** `pnpm verify` passes all 31 local gates with 8 compatibility surfaces,
27/27 gateway tests with the real validator and no skips, and 99/99 worker tests.
Focused tests cover open/attribution/restricted and mixed assemblies, missing and
contradictory ledger data, incomplete envelopes/datums, unsafe URLs, manifest proof
mismatch, and an adversarial provider attempting to smuggle raw restricted geometry.
**Changed:** canonical agent entry, compatibility matrix/checker, gateway license
export fixture, worker license/export modules and tests, release notes, and owning
catalog/compute/security/state/roadmap documentation.
**Decisions:** none; implements active D10 and D31 without changing their meaning.
**Next:** implement `SEC-002` prohibited-brief refusal and minimal safe logging while
the dependency-ordered G1 v0.1 release proof remains queued.
**Blockers:** protected delivery remains ordered behind G1/v0.1 and GitHub-hosted
runner availability; live OCCT artifact inspection remains separate sandbox evidence,
not a claim made by this deterministic/adapter slice.

## 2026-07-13 — Make equipped alternatives physically sovereign
**Session:** Codex agent · branch `codex/xc28-equipped-variants` · **Phase:** P1/P3 ·
**TODO items:** P1-014, XC-28, P2-001
**Done:** Added ModelSpec 2.2 `equippedVariantId` with deterministic single-option
migration and fail-closed multi-option migration; made geometry, mass, simulation,
colliders, lockfile resolution, validation, and BOM consume only the equipped
alternative; added stable source JSON Pointers to baked parts; and shipped Studio
variant cards that patch only the equipped ID, disclose inline/catalog consequences,
and preserve selection by source identity. Migrated the proof fixture and generation
template, regenerated schema/TypeScript/WASM artifacts, and moved the pre-1.0 package
boundary to 0.2.0 with release/migration notes.
**Evidence:** `pnpm verify` passes all 31 required local gates: 7 compatibility
surfaces, full Rust/TS/gateway suites, 25/25 Brief-25, native/fresh/committed WASM
parity, 9/9 fuzz outcomes, packaging of `@forge/validate-wasm@0.2.0`, and 89 worker
tests. Focused tests cover missing/unknown/duplicate choices and selected-only
geometry, mass, catalog, BOM, lockfile, Rapier/collider, and URDF/MJCF behavior. A
real-browser WASM switch changed an
inline payload from 334 to 346 faces and recomputed AUW 482→488 g, TWR 4.67→4.61,
and endurance 21.6→21.2 min while the validator re-admitted the document.
**Changed:** canonical agent entry, package/version/compatibility surfaces, Rust
contract/geometry/sim/validator/WASM crates, generated schema/types/WASM, gateway
generation, Studio scene/configurator, proof/fuzz/export fixtures, system/living docs,
and v0.2 release notes.
**Decisions:** no new decision; implements D32 and the compatibility-governed minor
boundary already required by D31/GOV-007.
**Next:** complete and publish v0.1.0 through the queued runner-remediation lane, then
rebase this v0.2 slice onto protected `main`, rerun all gates, and deliver it through
the exact-check ruleset.
**Blockers:** no local XC-28 blocker; protected delivery is dependency-ordered behind
the still-queued G1 v0.1 release proof so v0.2 cannot overtake the first release.

## 2026-07-13 — Separate historical parity from equipped variants
**Session:** Codex agent · branch `codex/g1-public-surfaces` · **Phase:** P0/P1 ·
**TODO items:** P0-007, P1-014, XC-28
**Done:** Closed the impossible 31-variant extraction claim against the complete,
byte-frozen pre-configurator oracle without fabricating source data; identified that
v2.1 consumers currently count every alternative as equipped; and created one stable
cross-surface task for explicit selected-variant semantics.
**Changed:** decision record, phase/task ledgers, project-state counts, ModelSpec and
Studio system contracts, and changelog.
**Decisions:** D32 makes the delivered oracle the complete historical parity boundary
and requires exactly one explicit equipped alternative before variant behavior ships.
**Next:** Implement XC-28 as a compatibility-governed contract/migration/validator/
simulation/BOM/Studio slice after the G1 validator release evidence is complete.
**Blockers:** no historical source blocker remains; implementation is dependency-
ordered behind the active G1 release proof.

## 2026-07-13 — Establish honest public project surfaces
**Session:** Codex agent · branch `codex/g1-public-surfaces` · **Phase:** G1 ·
**TODO items:** PRE-004, PRE-005, GOV-010, DOC-004, DOC-006
**Done:** Set a bounded prototype description, README homepage, and 12 repository
topics; corrected the stale red-gate README claim and added live main CI/security
badges; added security, contribution, support, conduct, issue/PR, and debugging
surfaces; and recorded exact-name USPTO/EUIPO searches with zero `ForgedTTC` results.
**Changed:** live GitHub metadata, README, community health files/templates,
debugging and trademark evidence, docs index, project state, TODO, and changelog.
**Decisions:** exact-name absence is preliminary evidence only; confusing-similarity,
classes, common-law use, geography, and filing remain professional legal work.
**Next:** Deliver these surfaces after the compatibility/release stack, then curate a
real first-good-issue and obtain launch-stage trademark review before broad promotion.
**Blockers:** qualified trademark clearance is external; current exact-name search
found no conflict.

## 2026-07-12 — Build the release artifact verification chain
**Session:** Codex agent · branch `codex/g1-release-artifacts` · **Phase:** G1 ·
**TODO items:** GOV-008
**Done:** Implemented Linux x86_64, macOS x86_64, Windows x86_64, and WASM build
jobs; deterministic archive assembly; source/artifact SPDX; SHA-256 manifest;
GitHub build-provenance attestation; annotated-tag/version enforcement; aggregate
download verification; clean temporary npm consumer installation; explicit registry
deferral; and the release/rollback/publication runbooks. The full 31-step local gate
passes, and the assembly/checksum/SPDX/Linux-smoke/WASM inspection chain passes with
local generated inputs.
**Changed:** release workflow, packaging/assembly/metadata/verification scripts,
WASM pack output, package commands, release notes/runbooks, agent entry, governance,
state, execution roadmap, TODO, docs index, and changelog.
**Decisions:** no new architectural decision; D31 version domains and the existing
G1 evidence gate control this workflow.
**Next:** Merge GOV-007, rebase/merge this stacked slice, run the release workflow
manually on protected `main`, download the aggregate artifact, and record exact
attestation/checksum/binary/WASM install proof before closing GOV-008/009.
**Blockers:** GitHub-hosted runner start degradation delays PR proof; no local code
or packaging blocker.

## 2026-07-12 — Freeze the public compatibility contract
**Session:** Codex agent · branch `codex/g1-compatibility-policy` · **Phase:** G1 ·
**TODO items:** GOV-007
**Done:** Defined compatibility policy 1.0.0 across seven package/data surfaces;
added a machine-checked source-of-truth matrix; independently versioned validator
reports, replay tapes, and EnvSpecs; exposed native and WASM version introspection;
retained the historical replay alias; rejected unsupported replay/EnvSpec majors;
and passed all 31 local gates plus 89 worker tests.
**Changed:** Rust validator/simulation/WASM contracts and tests, generated WASM,
worker replay production/verification, compatibility policy/matrix/checker, root
entry rules, system docs, roadmaps, state, TODO, and changelog.
**Decisions:** D31 separates package SemVer from persisted/public format SemVer and
sets the normal deprecation floor to 90 days plus two minor releases.
**Next:** Build cross-platform validator/WASM release artifacts with artifact-specific
SBOMs, provenance/attestations, checksums, and downloaded verification (GOV-008).
**Blockers:** no validator compatibility blocker; GOV-011 still blocks a Linux
Desktop release and does not block the standalone validator.

## 2026-07-12 — Close workflow supply-chain governance
**Session:** Codex agent · branch `codex/g1-governance-closeout` · **Phase:** G1 ·
**TODO items:** GOV-005
**Done:** Merged PR #23 through all six required checks; activated repository
selected-Action policy with GitHub-owned Actions plus seven exact third-party SHAs;
disabled broad verified-creator access; and proved post-merge CI, both dependency
audits, both CodeQL languages, and the validated SPDX artifact under that policy.
**Changed:** living governance, project-state, roadmap, TODO, and changelog evidence.
**Decisions:** source SBOM is now release-blocking evidence, but artifact-specific
SBOM/provenance/download proof remains GOV-008.
**Next:** Execute GOV-007 compatibility/deprecation policy, then the cross-platform
validator release and external install proof in GOV-008/009.
**Blockers:** GOV-011 blocks Linux Desktop release; other live/lab/field blockers
remain unchanged.

## 2026-07-12 — Publish the frozen prototype and pin workflow execution
**Session:** Codex agent · branch `codex/g1-release-foundations` · **Phase:** G1 ·
**TODO items:** PRE-002, P0-010, GOV-005, GOV-006
**Done:** Verified the frozen prototype SHA-256 at commit `0294a9d`, created and
pushed annotated tag `prototype-final`, pinned all external workflow actions to live
resolved commit SHAs, added an immutable-ref gate, declared least-privilege workflow
permissions, and added validated SPDX source SBOMs to security and release workflows.
Dismissed only the documented glib alert as a time-bounded tolerable risk with the
2026-10-12 expiry and Linux-release block recorded in GitHub.
**Changed:** workflow definitions and policy check, package/verification commands,
prototype evidence, governance contract, project state, roadmaps, TODO, and README.
**Decisions:** GitHub-owned Actions remain allowed; every third-party Action is
allowlisted only at its reviewed SHA. Source SBOM proof does not replace the
artifact-specific release proof required by GOV-008.
**Next:** Merge the pinned workflow change, activate the repository selected-Action
allowlist, verify post-merge CI/security/SBOM evidence, and close GOV-005.
**Blockers:** GitHub-hosted post-merge runners are queued; GOV-011 still blocks Linux
Desktop release.

## 2026-07-12 — Make the native Desktop shell a protected gate
**Session:** Codex agent · branch `codex/g0-evidence-closeout` · **Phase:** Wave 0/G1 hardening ·
**TODO items:** GOV-003, GOV-011, QA-011
**Done:** Updated the nested Tauri dependency lock to current compatible patches,
removing two high RustSec advisories; added an independently audited nested-lock CI
step; committed the app icon required by Tauri's native context; and added
`desktop native (macOS)` as an exact protected compile check. The upstream GTK3/glib
0.18 advisory remains a dated Linux-release blocker rather than a false clean claim.
**Changed:** Desktop icon/config/scripts/lockfile, CI and security workflows,
repository governance, TODO/project-state evidence, and contributor gates.
**Decisions:** accept the currently unexercised Tauri/glib warning only through 2026-10-12;
Linux Desktop release remains blocked until migration or reviewed reachability proof.
**Next:** Merge the protected check and supply-chain evidence, then execute the G1
validator release lane.
**Blockers:** upstream Tauri Linux GTK3/glib chain (`GOV-011`); no released Desktop.

## 2026-07-12 — Close G0 on protected main
**Session:** Codex agent · branch `codex/g0-evidence-closeout` · **Phase:** Wave 0 ·
**TODO items:** REC-005, REC-007, GOV-003
**Done:** Merged recovery PR #11 and RustSec hotfix PR #21 through active ruleset
`18843164`; verified final post-merge CI, npm/RustSec audits, and JS/Python CodeQL;
verified manual nightly parity and the enforced coverage floor. The RustSec closeout
updated `anyhow` to 1.0.103 and granted only `checks:write` to its reporting job.
G0 is now remotely closed, not merely locally green.
**Changed:** `Cargo.lock`, security workflow permissions, `PROJECT-STATE.md`, phase
and execution roadmaps, TODO evidence, and changelog.
**Decisions:** none; existing G0/G1 and ruleset contracts were followed.
**Next:** Complete `GOV-005..010` and G1 validator/core release proof, then run the
external R1 builder loop.
**Blockers:** no G0 blocker; release, provider, external-user, lab, and field gates
remain explicit in the roadmap.

## 2026-07-12 — Restore the truthful local green baseline
**Session:** Codex agent · branch `codex/recover-truthful-green` · **Phase:** Wave 0 recovery ·
**TODO items:** REC-001..008, QA-001, P2-005, P4-010
**Done:** Fixed Clippy and validator CLI regressions; made generated quadrupeds
modular and printable across the full slider grid; regenerated/synchronized qd-mini
and its golden; made six-archetype generation DfM/collider/behavior-correct; added
focused manufacturing repair coverage; restored Brief-25 to 25/25; fixed nightly
Chromium invocation; enforced an 80% coverage floor against a measured 84.34%; pinned
Rust 1.96.0; and added passing 29-step non-DB and isolated Postgres verification
entry points. Local browser parity passes all six scenes at edge F1 0.957–0.995.
Enabled vulnerability/security updates, secret scanning and push protection; added
grouped dependency updates, dependency review/audits, JS/Python CodeQL, and an exact
branch-protection/check-name contract. Upgraded `@auth/core` to remove the sole npm
advisory; `pnpm audit` is clean.
Activated exact-check PR-only ruleset `18843164` for `main` and opened draft PR #11.
**Changed:** Rust core/generator/validator sources and fixtures, gateway generation and
tests, qd-mini examples, workflows/toolchain, `scripts/verify.mjs`, package scripts,
README/AGENTS, repository-governance/security automation, and living
roadmap/state/system documentation.
**Decisions:** coverage below 80% lines is now a nightly failure; no validator or DfM
gate was weakened.
**Next:** Let PR CI/security finish, merge through the active ruleset, verify
post-merge CI and manual nightly, then complete remaining governance/release work.
**Blockers:** remote checks are queued; no release exists, and live/field evidence
remains outside local recovery.

## 2026-07-12 — Rebuild the complete evidence-first program roadmap
**Session:** Codex agent · branch main worktree · **Phase:** recovery through P12 ·
**TODO items:** REC-001..008, GOV-001..010, SEC-001..008, QA-001..010,
OPS-001..010, EXT-001..009, DOC-001..006, plus reconciled phase rows
**Done:** Added the canonical root `AGENTS.md`; converted `CLAUDE.md` into a
compatibility entry; added a dated evidence-backed project-state snapshot; rebuilt
the execution roadmap from current recovery through trusted-core release, external
builder proof, live compute, controlled hardware, platform, field maintenance, and
scale decisions; reconciled stale phase/task states; and added missing governance,
security, privacy, quality, operations, external-proof, documentation, risk, and
release work.
**Changed:** `AGENTS.md`, `CLAUDE.md`,
`docs/{README.md,PROJECT-STATE.md,ROADMAP.md,TODO.md,EXECUTION-ROADMAP.md,BEST-PRACTICES.md,risk-register.md}`,
`CHANGELOG.md`.
**Decisions:** none; this work documents current executable evidence and existing
decision boundaries.
**Next:** Execute Wave 0 (`REC-001..008`, `GOV-001..005`, `QA-001`) and refresh
`PROJECT-STATE.md` with green local/PR/post-merge/nightly evidence.
**Blockers:** current Clippy/workspace/declared-verdict/Brief-25/CI/nightly failures;
main is unprotected; publication and live/field gates remain unmet.

## 2026-06-16 — Draw remaining-work boundary
**Session:** Codex agent · branch main · **Phase:** cleanup · **TODO items:** none
**Done:** Audited the remaining TODO rows after closing local code lanes and
recorded the active boundary in `docs/EXECUTION-ROADMAP.md`: remaining work is
owner-input, D30/D12 lab hardware, external-provider, conditional benchmark, or
phase-fed catalog/slot-system work. No additional unblocked local implementation
lane was identified.
**Changed:** `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Owner/provider/lab inputs must be supplied before the remaining rows can
be closed honestly.
**Blockers:** owner signoffs/assets, lab hardware evidence, provider credentials,
and benchmark data as listed in the execution roadmap boundary.

## 2026-06-15 — Emit print handoff artifacts from geometry jobs
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P11/P6 · **TODO items:** P11-006 [~], XC-18 [~]
**Done:** Extended `occt.tessellate` fixture output with DfM report references,
oriented 3MF export references, print-profile metadata, printed-part BOM rows, and
quote-link-only handoff metadata for DfM-passing structural parts.
**Changed:** `workers/forge_workers/geometry.py`,
`workers/tests/test_geometry_print_artifacts.py`, `docs/systems/compute-workers.md`,
`docs/systems/platform.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Replace fixture orientation with live OCCT/3MF generation and submit the
artifact contract to sandbox print-provider quote APIs.
**Blockers:** live OCCT print export/orientation and print-provider sandbox
credentials remain open.

## 2026-06-15 — Normalize commerce provider handoffs
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P11 · **TODO items:** P11-005 [~], P11-006 [~]
**Done:** Added worker-side commerce normalizers for live vendor refresh and print
quote handoffs. `FORGE_VENDOR_REFRESH_CMD` output now normalizes into rate-limited,
provenanced vendor offers with invalid rows held, and `FORGE_PRINT_QUOTE_CMD`
output stays quote-link-only, blocks before DfM-passing 3MF/profile artifacts, and
marks checkout as off-platform.
**Changed:** `workers/forge_workers/commerce.py`,
`workers/tests/test_commerce.py`, `docs/systems/compute-workers.md`,
`docs/systems/platform.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Wire these normalizers into the gateway commerce routes once that lane is
clear, then run sandbox/live provider refresh and print quote suites.
**Blockers:** real provider credentials/accounts and gateway route integration
remain open.

## 2026-06-15 — Add Modal task runtime profiles
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P5/P7/P9 · **TODO items:** P5-006 [~], P7-003 [~], P9-002 [~]
**Done:** Added test-covered Modal runtime profiles for `photoscan.single`,
`photoscan.multiview`, `train.policy`, `train.offline-bc`, `train.sysid-fit`, and
`codesign.evaluate`. Profiles now declare GPU expectations, timeouts, package
sets, command env hooks, permanent-cache requirements, and photoscan SLO metadata
without importing Modal in local/CI runs.
**Changed:** `workers/forge_workers/modal_app.py`,
`workers/tests/test_modal_app.py`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Build/deploy the Modal image with real TRELLIS/COLMAP/SB3/MuJoCo/Optuna
commands and run the optional live GPU smoke suites.
**Blockers:** provider credentials, live dependency images, and real SLO/benchmark
evidence remain open.

## 2026-06-15 — Assess policy transfer compatibility for skills
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P11/P7 · **TODO items:** P11-003 [~]
**Done:** Added a worker-side policy transfer assessor for skills marketplace
listings. It allows direct transfer only when the policy is exportable and the
buyer twin has matching archetype, observation layout, and action layout; otherwise
it returns an explicit fine-tune-against-buyer-twin offer, or blocks non-exportable
policies.
**Changed:** `workers/forge_workers/policy_transfer.py`,
`workers/tests/test_policy_transfer.py`, `docs/systems/platform.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Wire this assessor into the public policy-listing/equip route once the
gateway/Studio lane is clear, then run it against real ONNX headers and buyer
twins.
**Blockers:** public marketplace routing and live fine-tune execution remain open.

## 2026-06-15 — Normalize MJX benchmark adoption reports
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P7/P9 · **TODO items:** P7-010 [~], P9-005 [~]
**Done:** Added a normalized MJX benchmark report for `FORGE_MJX_BENCH_CMD` and
payload-supplied benchmark rows. The report now requires D12 quad, D12 rover, and
one legged morphology, applies the P7-010 rule for CPU need, frozen parity bands,
and at least 3x cost-normalized throughput, and blocks adoption when evidence is
missing or malformed.
**Changed:** `workers/forge_workers/simulation.py`,
`workers/tests/test_mjx_benchmark.py`, `docs/systems/compute-workers.md`,
`docs/systems/learning-engine.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Run the report against real D12 quad, D12 rover, and legged MuJoCo/MJX
benchmarks, then wire P9 tier-2/3 batching only if the report adopts MJX.
**Blockers:** real benchmark evidence and engine-backed tier-2/3 execution remain
open.

## 2026-06-15 — Normalize external system-ID fits
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P8/P7 · **TODO items:** P8-005 [~]
**Done:** Hardened `FORGE_SYSID_FIT_CMD` output so external bench/log adapters
normalize into the same `train.sysid-fit` artifact shape as fixtures. Live fits now
require at least three samples, an accepted fit, and a non-empty `simPatch`; otherwise
they fail closed without updating the contract sim block.
**Changed:** `workers/forge_workers/training/jobs.py`,
`workers/tests/test_training_live_adapter.py`, `docs/systems/compute-workers.md`,
`docs/systems/learning-engine.md`, `docs/TODO.md`, `docs/ROADMAP.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Run the external sys-ID command on real D12 bench/flight telemetry and
apply the emitted sim patch in the lab evidence flow.
**Blockers:** real bench/flight telemetry remains open.

## 2026-06-15 — Emit leaderboard dimensions from replay verification
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P10 · **TODO items:** P10-005 [~]
**Done:** Extended `replay.verify` output with durable leaderboard dimensions
derived from replay headers or payload metadata: course id, archetype, board class,
model id, policy id, and contract hash. Existing hash/timestamp/contract checks stay
unchanged.
**Changed:** `workers/forge_workers/replay.py`,
`workers/tests/test_replay_dimensions.py`, `docs/systems/environments-courses.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Persist these dimensions as first-class leaderboard columns in the gateway
data model once the gateway lane is clear.
**Blockers:** durable gateway/database leaderboard dimension migration remains open.

## 2026-06-15 — Wire EnvSpec courses into training tasks
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P10/P7 · **TODO items:** P10-006 [x], P7-003 [~]
**Done:** Added a worker-side EnvSpec→P7 task compiler and wired `train.policy` to
consume explicit `envSpec` or `course.envSpec` payloads directly. Course tasks now
preserve course id/name/version, archetype, spawn/gates/bounds/terrain, reward
metadata, and ONNX/scorecard task ids without gateway conversion work.
**Changed:** `workers/forge_workers/training/tasks.py`,
`workers/forge_workers/training/jobs.py`, `workers/tests/test_course_tasks.py`,
`docs/systems/environments-courses.md`, `docs/EXECUTION-ROADMAP.md`,
`docs/TODO.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Prove the full P10 exit with a public/community course, verified
leaderboard run, and a live trainer consuming that course task.
**Blockers:** direct public course fetch/API polish, durable leaderboard dimensions,
and live trainer evidence remain open.

## 2026-06-15 — Compute maintenance ghost divergence
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P12 · **TODO items:** P12-002 [~]
**Done:** Extended `maintenance.crash-forensics` so crash windows now compute ghost
divergence from actual/predicted position samples, emit RMS/max divergence,
tracking/diverged status, and scrub-frame counts for the replay window.
**Changed:** `workers/forge_workers/maintenance.py`,
`workers/tests/test_maintenance_handoffs.py`, `docs/systems/platform.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Feed this worker with a real Desktop-captured field log and compare the
visible Studio scrubber against the emitted divergence status.
**Blockers:** real Desktop field-log capture remains open.

## 2026-06-15 — Attach maintenance repair handoffs in worker output
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P12 · **TODO items:** P12-002 [~], P12-003 [x], P12-004 [~]
**Done:** Enriched `maintenance.repair-sheet` so repair steps can carry vendor
offer handoff links and print quote links supplied by the commerce layer, including
per-step `quoteReady`, flattened `quoteLinks`, and `handoffCount`. The worker still
produces ordered repair steps when no quote links are present.
**Changed:** `workers/forge_workers/maintenance.py`,
`workers/tests/test_maintenance_handoffs.py`, `docs/systems/platform.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Run the end-to-end P12 proof with a Desktop-captured crash log plus live
vendor/print quote rows.
**Blockers:** real field-log evidence and live commerce provider rows remain open.

## 2026-06-14 — Normalize external offline learning warmstarts
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P7 · **TODO items:** P7-009 [~]
**Done:** Hardened `FORGE_OFFLINE_RL_CMD` results so external behavior-cloning or
offline-RL outputs normalize into the same dataset/warmstart artifact as the
fixture path. Warmstarts require at least three samples and action columns, invalid
datasets are held with reject reasons, and every warmstart remains non-exportable
until a live fine-tune scorecard passes.
**Changed:** `workers/forge_workers/training/jobs.py`,
`workers/tests/test_training_live_adapter.py`, `docs/systems/learning-engine.md`,
`docs/systems/compute-workers.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Connect Desktop-captured telemetry logs to a live fine-tune job that
produces a fresh `p7-scorecard-v1` policy artifact.
**Blockers:** real recorder data and live offline-RL/fine-tune runtime remain open.

## 2026-06-14 — Re-gate live SB3 policy artifacts
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P7 · **TODO items:** P7-003 [~], P7-006 [x], P7-008 [~]
**Done:** Normalized every `FORGE_SB3_TRAIN_CMD` result through the P7 scorecard
gate instead of trusting external `artifactKind: policy` payloads. Live SB3 outputs
now carry `p7-scorecard-v1`, required success/robustness/energy/lineage fields,
estimator-smoke evidence, thresholds, `exportGate`, and `onnx.exportable`; missing
scorecard fields and ground-truth-trained policies fail closed.
**Changed:** `workers/forge_workers/training/jobs.py`,
`workers/forge_workers/training/scorecard.py`,
`workers/tests/test_training_live_adapter.py`, `workers/tests/test_scorecard.py`,
`docs/systems/learning-engine.md`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Run a real SB3/MuJoCo hover/waypoint job through the normalized adapter and
feed the resulting ONNX into browser runtime playback.
**Blockers:** live SB3/MuJoCo runtime and ONNX Runtime Web integration remain open.

## 2026-06-14 — Normalize live photoscan adapter output
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P5 · **TODO items:** P5-001 [~], P5-002 [~], P5-006 [~]
**Done:** Hardened `FORGE_PHOTOSCAN_CMD` and `FORGE_COLMAP_CMD` outputs so live
commands are normalized into the same photoscan artifact contract as fixtures:
pipeline stages, permanent object-cache metadata, D13 acceptance/reject reasons,
candidate review flags, COLMAP view graph, and 5-minute SLO evidence. Missing D13
fit/Hausdorff metrics now fail closed instead of being treated as accepted scans.
**Changed:** `workers/forge_workers/photoscan.py`,
`workers/tests/test_photoscan_live_adapter.py`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Run the normalized adapter contract against real TRELLIS/COLMAP GPU
commands and capture the under-5-minute SLO evidence.
**Blockers:** live GPU runtime images, credentials, and photographed-motor evidence
remain deployment/lab work.

## 2026-06-14 — Add constraint-aware co-design ladder
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~], P9-004 [~]
**Done:** Hardened `codesign.evaluate` so the keyless CMA/TPE-shaped search now
attaches structured tier-0/tier-1/tier-2/tier-3 evaluation evidence, applies
objective constraints, keeps rejected candidates out of the Pareto front, and proves
the 200-candidate path returns at least three admitted Pareto points under course
constraints.
**Changed:** `workers/forge_workers/codesign.py`,
`workers/tests/test_codesign_optimizer.py`, `docs/systems/co-design.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Swap the keyless tier evidence for engine-backed Rapier/MuJoCo/SB3
results through `FORGE_CODESIGN_CMD` once the simulation/training lanes land.
**Blockers:** live engine-backed tier 1/2/3 execution and P7-010 MJX benchmark data
remain open.

## 2026-06-14 — Add ETL command adapter routing
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P3/P4 · **TODO items:** P3-004 [~], P4-016 [~]
**Done:** Routed `etl.ingest-component` through the fetch/extract/geometry adapter
protocols when a source bundle payload is supplied, added command-backed Claude and
OCCT seams (`FORGE_CLAUDE_EXTRACT_CMD`, `FORGE_OCCT_TESSELLATE_CMD`), and kept
fixture canonical rows as the keyless CI path.
**Changed:** `workers/forge_workers/etl/adapters.py`,
`workers/forge_workers/etl/ingest.py`, `workers/forge_workers/etl/__init__.py`,
`workers/tests/test_etl_adapters.py`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Deploy provider-owned Claude/OCCT commands with real credentials and
review queue persistence.
**Blockers:** live provider credentials and OCCT runtime images remain deployment
work.

## 2026-06-14 — Enrich photoscan pipeline artifacts
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P5 · **TODO items:** P5-001 [~], P5-002 [~], P5-006 [~]
**Done:** Expanded keyless `photoscan.single` and `photoscan.multiview` outputs to
carry the full pipeline contract: background-removal, reconstruction,
manifold-repair, decimation, primitive-refit stages, D13 fit coverage/Hausdorff
metrics, COLMAP-style view graph metadata, alignment hints, and owner-review flags.
**Changed:** `workers/forge_workers/photoscan.py`,
`workers/tests/test_worker_jobs.py`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Replace the keyless stage records with live TRELLIS/COLMAP execution and
run the 5-minute burst-GPU SLO suite.
**Blockers:** live GPU credentials/runtime images remain deployment work.

## 2026-06-14 — Add P7 task suite and offline BC worker
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P7 · **TODO items:** P7-001 [x], P7-009 [~]
**Done:** Added the versioned P7 task catalog covering hover, waypoint, slalom,
velocity, legged, rover, and arm tasks, wired `train.policy` to emit those
environment definitions, and added `train.offline-bc` for deterministic telemetry
dataset ingestion and behavior-cloning warmstart artifacts.
**Changed:** `workers/forge_workers/training/tasks.py`,
`workers/forge_workers/training/jobs.py`, `workers/tests/test_worker_jobs.py`,
`docs/systems/learning-engine.md`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Connect live offline-RL/fine-tune adapters and route Desktop-captured
field logs into the trainer once the P8 recorder lane lands.
**Blockers:** live SB3/MuJoCo/offline-RL execution remains deployment-adapter work.

## 2026-06-14 — Expand co-design optimizer depth
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~], P9-004 [~]
**Done:** Expanded `codesign.evaluate` from three fixed candidates into a
deterministic, budgeted CMA/TPE-shaped search that emits up to 200 candidates,
optimizer metadata, richer metrics, and a computed Pareto front while preserving
the external optimizer command seam.
**Changed:** `workers/forge_workers/codesign.py`,
`workers/tests/test_worker_jobs.py`, `docs/systems/co-design.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Replace the keyless optimizer fixture with real CMA-ES/Optuna plus
engine-backed tier 1/2/3 evaluation once Rapier/MuJoCo/SB3 lanes are ready.
**Blockers:** engine-backed tiers and overnight hardware benchmarks remain open.

## 2026-06-14 — Add Studio marketplace curation board
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P11 · **TODO items:** P11-002 [~], P11-003 [~]
**Done:** Replaced the flat listing preview with a Studio marketplace board that
filters listings by kind/status and records usage-beta events from each listing:
view, equip, policy download, print quote click, or training job depending on the
listing kind.
**Changed:** `packages/studio/src/App.tsx`, `docs/EXECUTION-ROADMAP.md`,
`docs/TODO.md`, `docs/systems/platform.md`, `docs/systems/studio-ui.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Add durable public curation state and the real skill transfer/fine-tune
offer once marketplace review policy and training adapters are ready.
**Blockers:** external curation and live transfer/fine-tune economics remain out of
this Studio-only slice.

## 2026-06-14 — Attach repair quote handoff links
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P12 · **TODO items:** P12-002 [~], P12-004 [~]
**Done:** Wired Studio maintenance repair sheets to the existing commerce rows:
repair steps now match reorder SKUs to vendor offers and the repair panel exposes
the current print quote handoff link with explicit off-platform payment language.
**Changed:** `packages/studio/src/App.tsx`, `docs/EXECUTION-ROADMAP.md`,
`docs/TODO.md`, `docs/systems/platform.md`, `docs/systems/studio-ui.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Prove the full P12 exit path with a real Desktop-captured field log and
DfM-specific print quote artifacts.
**Blockers:** real field-log evidence remains outside this Studio-only slice.

## 2026-06-14 — Add Studio course URLs
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P10 · **TODO items:** P10-004 [~]
**Done:** Added client-side `?course=<id>` support in Studio: refresh selects a
matching public/unlisted course from the existing course list, the active course
selector updates the URL, and the platform panel exposes a copyable course URL.
**Changed:** `packages/studio/src/App.tsx`,
`docs/systems/environments-courses.md`, `docs/systems/studio-ui.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Add a direct public course lookup endpoint or route when course listings
need to load ids outside the current list window.
**Blockers:** P10-004 remains open until public course pages/API polish are durable
for arbitrary listed course ids.

## 2026-06-14 — Persist admitted co-design points from Studio
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P9 · **TODO items:** P9-004 [~]
**Done:** Added a Studio save action for admitted co-design Pareto candidates. The
action applies the candidate JSON Patch through the core boundary, saves the result
through the model admission route with draft mode disabled, refreshes the model
registry, and opens the persisted point.
**Changed:** `packages/studio/src/App.tsx`, `docs/systems/studio-ui.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Back the explorer with live CMA-ES/Optuna and engine-tier results so
overnight runs produce at least three admitted Pareto points.
**Blockers:** P9-004 remains open until live optimizer runs and persisted points are
fed by engine-backed candidate evaluation rather than fixture patches.

## 2026-06-14 — Add Studio maintenance twin dashboard
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P12 · **TODO items:** P12-002 [~], P12-004 [~]
**Done:** Added a Studio maintenance twin dashboard over materialized
`maintenance_records`: fleet counts, due/critical state, next actions, wear cards,
repair/reorder rows, and a crash-window scrubber that surfaces ghost divergence
status over the last-seconds interval.
**Changed:** `packages/studio/src/App.tsx`, `docs/systems/platform.md`,
`docs/systems/studio-ui.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Connect the dashboard to real Desktop-captured telemetry logs and live
vendor/print quote handoff rows for crash-to-repair closure.
**Blockers:** P12 exit proof still depends on D12 lab/Desktop field-log capture and
live provider handoff evidence.

## 2026-06-14 — Add Studio course editor and leaderboard filters
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P10 · **TODO items:** P10-004 [~], P10-005 [~]
**Done:** Expanded the Studio platform panel from fixture-only course creation and
a top-three leaderboard list into an editable EnvSpec course form plus a
selected-course verified board with filters for EnvSpec archetype, replay-header
class, and official verified/held status. The board surfaces verification metadata
including frames, duration, client claim, hash, reject reason, and rank.
**Changed:** `packages/studio/src/App.tsx`,
`docs/systems/environments-courses.md`, `docs/EXECUTION-ROADMAP.md`,
`docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Add public course URL polish and durable `archetype`/`board_class`
columns or equivalent indexed metadata to leaderboard runs so the gateway can slice
official boards server-side.
**Blockers:** P10-004 and P10-005 remain open until public course sharing and
leaderboard dimensions are persisted/queryable by the gateway API.

## 2026-06-14 — Add ModelSpec schema migration runner
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P2/P4 · **TODO items:** XC-23 [x]
**Done:** Added the XC-23 ModelSpec migration runner in `forge-contract` with
audit reporting, legacy field/provenance alias normalization, schema-marker
cleanup, and post-migration shape validation. Exposed it through
`forge-validate migrate` and a `pnpm schema:migrate` script.
**Changed:** `crates/forge-contract/src/migrations.rs`,
`crates/forge-contract/src/lib.rs`, `crates/forge-contract/tests/migrations.rs`,
`crates/forge-validate/src/main.rs`, `package.json`,
`docs/systems/model-contract.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Add new compatibility rows whenever a future schema-breaking DECISIONS
entry lands, and keep migration coverage pinned before regenerating TS/Python
types.
**Blockers:** none.

## 2026-06-14 — Add ModelSpec fuzz seed corpus
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P4/P2 · **TODO items:** XC-24 [x]
**Done:** Added a deterministic ModelSpec fuzz seed corpus with adversarial
JSON-Pointer mutations over first-party examples, an executable checker that pins
validator verdicts and error check IDs, and a greedy minimizer flow for preserving
future fuzz failures as regression fixtures.
**Changed:** `evals/fuzz/modelspec-seeds.json`,
`scripts/fuzz-contract-seeds.mjs`, `crates/forge-contract/tests/fuzz_corpus.rs`,
`package.json`, `docs/systems/validation-harness.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Wire `pnpm fuzz:contract:check` into CI beside `node scripts/validate-all.mjs`
and use `--write-seeds-dir` when a generated failure needs a committed minimized
fixture.
**Blockers:** none.

## 2026-06-14 — Add FDM v0 DfM validator checks
**Session:** Codex agent · branch main · **Phase:** P6/P11 · **TODO items:** XC-18 [~], P11-006 [~]
**Done:** Added deterministic validator diagnostics for printable inline
structural parts: `MFG-001` minimum wall, `MFG-002` unsupported-overhang warning,
`MFG-003` support-area estimate warning, and `MFG-004` oriented FDM bed fit.
Pinned unit coverage for too-thin and too-large printed parts while keeping the
first-party demo admitted.
**Changed:** `crates/forge-validate/src/lib.rs`,
`docs/systems/validation-harness.md`, `docs/systems/geometry-engine.md`,
`docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Generate oriented 3MF/profile artifacts and attach DfM status/artifact
refs to printed-parts BOM rows so print quote handoff can consume validator output.
**Blockers:** exact B-rep wall analysis, SLA profile support, and quote-ready 3MF
artifacts still require the export/worker slice.

## 2026-06-14 — Record D30 controlled D12 lab signoff
**Session:** Codex agent · branch current worktree · **Phase:** P8 · **TODO items:** P8-000 [x], P8-001 [~], P8-009 [~], P8-010 [~], P8-012 [~], P8-013 [~]
**Done:** Recorded owner signoff for the D28 hardware/legal gate as D30 and added
an active `d28.hardware` migration scoped to controlled D12 lab pilots only.
Updated the README, roadmap, legal/safety doc, hardware bridge doc, pilot
playbooks, Studio/worker docs, and execution roadmap so hardware work now reads as
D30 lab-gated rather than legal-pending.
**Changed:** `infra/migrations/0013_d28_lab_signoff.sql`, `docs/DECISIONS.md`,
`docs/ROADMAP.md`, `docs/TODO.md`, `docs/security-safety-legal.md`,
`docs/systems/hardware-bridge.md`, `docs/EXECUTION-ROADMAP.md`,
`docs/pilots/reference-quad-pilot.md`, `docs/pilots/reference-rover-pilot.md`,
`README.md`,
`docs/assets/readme/hero.svg`, `packages/gateway/src/platform.ts`,
`packages/gateway/test/server.test.ts`, `packages/desktop/src-tauri/src/main.rs`,
`packages/desktop/scripts/check-desktop.mjs`,
`packages/desktop/deployment-ladder.json`, `scripts/check-pilot-docs.mjs`.
**Decisions:** D30 accepts ToS/liability, telemetry consent, ladder UX, physical
confirmation, no-auto-arm, D12 rig allowlist, advisory policy authority, and
supervisor priority for controlled lab pilots only.
**Next:** Implement the D12 lab adapters and capture evidence for HITL,
tethered/constrained runs, Desktop recording, ghost replay, and system-ID before
any external hardware beta.
**Blockers:** external hardware beta remains blocked until post-lab evidence and a
separate rollout gate; arbitrary rigs remain blocked.

## 2026-06-14 — Add remaining-work execution roadmap
**Session:** Codex agent · branch current worktree · **Phase:** P0-P12 · **TODO items:** all remaining open/in-progress/blocked TODOs in `docs/EXECUTION-ROADMAP.md` §4, planning only
**Done:** Added an execution overlay that maps every remaining open,
in-progress, and blocked TODO into parallel subworker tracks with dependencies,
blockers, acceptance gates, and an end-to-end closure order. Linked it from the
docs index and the phase roadmap so future agents can choose work by either phase
or subworker lane.
**Changed:** `docs/EXECUTION-ROADMAP.md`, `docs/README.md`, `docs/ROADMAP.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Start Wave A with track S (`P6-001`/`P6-010`) or track V
(`P2-001`/`P2-002`), because simulation parity and validator persistence unblock
the largest number of downstream tracks.
**Blockers:** D30 allows controlled D12 lab pilots only; external hardware beta,
P11 policy-sharing signoff, provider sandboxes, physical lab rigs, and the missing
later configurator prototype still gate their respective live-path tasks.

## 2026-06-14 — Implement remaining P4-P12 live gates and commerce seams
**Session:** Codex agent · branch current worktree · **Phase:** P4-P12 · **TODO items:** P7-010 [~], P8-000 [!], P8-001 [~], P8-012 [~], P8-013 [~], P11-000 [~], P11-002 [~], P11-003 [~], P11-005 [~], P11-006 [~], P11-009 [x], P12-003 [x]
**Done:** Added platform gate records for D28 hardware, P11 policy sharing, and P11
marketplace economics; exposed gate and job-capability APIs; enforced D28 lab gates
for live bridge jobs and Desktop native commands; added vendor offer refresh/list,
print quote/link handoff, and marketplace usage-rollup APIs without payment/payout
ledgers. Added external-command seams for photoscan/COLMAP, SB3/sysid, co-design,
MuJoCo parity, and MJX benchmarking plus optional Modal worker app dispatch. Added
sim parity tolerance and MJX adoption helpers. Surfaced gates, capabilities, vendor
links, quote links, and usage-beta actions in Studio.
**Changed:** `infra/migrations/0012_gates_capabilities_commerce.sql`,
`packages/gateway/src/{platform.ts,server.ts}`, `packages/gateway/test/server.test.ts`,
`packages/studio/src/{App.tsx,gateway.ts}`, `packages/desktop/src-tauri/src/main.rs`,
`packages/desktop/scripts/check-desktop.mjs`, `workers/forge_workers/{external.py,photoscan.py,codesign.py,simulation.py,modal_app.py,training/jobs.py}`,
`crates/forge-sim/src/{heavy.rs,interop.rs}`, and roadmap/system docs.
**Decisions:** D29 — P11 marketplace launches as a usage-data beta; no seller
payouts, revenue share, or direct checkout at launch; GPU jobs retain credit
cost-plus until real usage thresholds justify a new decision.
**Next:** Capture real engine-backed Rapier/MuJoCo baselines and run the P7-010 D12
quad/rover/legged MJX benchmark; separately, get owner/legal D28 signoff before any
hardware pilot.
**Blockers:** D28 legal/hardware signoff remains owner/counsel work; live provider
SLOs require configured GPU/vendor/print-service sandboxes and physical lab rigs.

## 2026-06-13 — Add P4 generation UI, audit rows, and Brief-25 scaffold
**Session:** Codex agent · branch `codex/p4-completion-batch` · **Phase:** P4 · **TODO items:** P4-001 [~], P4-006 [x], P4-008 [~], P4-009 [x], P4-010 [~], P4-012 [x]
**Done:** Added `generated_artifacts` with a forward migration and gateway recording
for admitted, draft, and rejected generations. Rows capture prompt/provider,
archetype/categories, seed, stable contract hash, prompt hash, final model, contract
JSON, validator report, attempt history, approved-catalog context, and D26 model
pins. Added `POST /v1/generate/stream` as an SSE-compatible start/complete/error
event surface using the same generation and persistence path as `POST
/v1/generate`. Added the studio generation panel with template/Anthropic provider
selection, local-session BYO key handling, prompt/archetype/category/repair/seed
controls, verdict/attempt/diagnostic display, draft/admitted scene loading, and
admitted-only sharing. Added the Brief-25 corpus and deterministic evaluator; CI
runs it and uploads the JSON artifact.
**Changed:** `infra/migrations/0005_generated_artifacts.sql`,
`packages/gateway/src/{generatedArtifacts.ts,generation.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, `packages/studio/src/{App.tsx,gateway.ts,wasm.ts}`,
`evals/brief25.corpus.json`, `scripts/{brief25-eval.mjs,db-assert-p3.mjs}`,
`.github/workflows/ci.yml`, `package.json`, and P4 docs.
**Decisions:** none.
**Next:** Split explicit multi-pass synthesis and per-pass SSE diagnostics, then
add the time-series Brief-25 dashboard and conversational JSON-Patch editing.
**Blockers:** none.

## 2026-06-13 — Add opt-in Anthropic generation transport
**Session:** Codex agent · branch `codex/p4-anthropic-generation-adapter` · **Phase:** P4 · **TODO items:** P4-001 [~], P4-008 [~]
**Done:** Added the live Anthropic provider behind the existing generation route:
`POST /v1/generate` now accepts `provider: "anthropic"` and a per-request
`x-forge-anthropic-key`/`anthropicApiKey` or deployment `ANTHROPIC_API_KEY`. The
adapter calls the Messages API through a forced strict `forge_emit_modelspec` client
tool using the emitted ModelSpec schema, stamps model/prompt/seed provenance, and
reuses the existing validator repair/draft loop. Tests use an injected transport and
cover synthesis, repair, usage/stop metadata, key redaction, and missing-key failure.
**Changed:** `packages/gateway/src/{generation.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, and P4/security docs.
**Decisions:** none.
**Next:** Build the studio generation panel/BYO-key settings and SSE progress
surface, then add Brief-25 corpus/CI.
**Blockers:** none.

## 2026-06-13 — Add validator-loop generation endpoint
**Session:** Codex agent · branch `codex/p4-generation-orchestrator` · **Phase:** P4 · **TODO items:** P4-001 [~], P4-006 [~], P4-011 [x]
**Done:** Added the executable P4 generation loop: `POST /v1/generate` consumes
approved catalog context, runs an injectable synthesis adapter, validates every
candidate through `forge-validate`, repairs up to three iterations, and falls back
to D14 draft diagnostics when repairs are exhausted. Added `GET /v1/generate/models`
for the D26 Anthropic model/pricing pins and tests for block, repair/admit, draft,
and model-pin behavior.
**Changed:** `packages/gateway/src/{generation.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, and P4 docs.
**Decisions:** D26 — P4 Anthropic model IDs, token limits, output caps, and pricing
pinned from official docs checked 2026-06-13.
**Next:** Replace the default deterministic synthesis adapter with the live
Claude/tool-pass transport behind BYO/API-key plumbing, then add Brief-25 CI.
**Blockers:** none.

## 2026-06-13 — Add generation context builder
**Session:** Codex agent · branch `codex/p4-generation-context` · **Phase:** P4 · **TODO items:** P4-001 [~], P4-002 [x], P4-003 [~]
**Done:** Added the first executable generation-orchestrator slice:
`POST /v1/generate/context` builds a deterministic prompt-cache prefix from the
schemars schema, engine docs, and schema-true contract exemplars, then retrieves
only catalog components with approved review rows and non-blocked export policy.
The endpoint is context-only; it deliberately does not call Claude or synthesize
contracts yet.
**Changed:** `packages/gateway/src/{generation.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, and P4 docs.
**Decisions:** none.
**Next:** Add the actual constrained-synthesis adapter and validator-in-loop repair
loop behind this context, then pin current Anthropic model strings/pricing for
P4-011 before live calls.
**Blockers:** none.

## 2026-06-13 — Wire P4 ingestion adapters and review audit policy
**Session:** Codex agent · branch `codex/p4-ingestion-review-polish` · **Phase:** P4 · **TODO items:** P4-014 [x], P4-015 [x], P4-016 [~], P4-017 [x]
**Done:** Extended the catalog review path with owner audit notes, review decision
payloads, owner-token route auth, and export-policy filtering (`full-geometry-ok`, attribution manifest,
envelope/link-out, BOM-only, blocked, assembly-derived). Added deterministic ETL
adapter seams for source fetch, Claude-style extraction, and OCCT geometry attach:
fixture fetch/extract/envelope adapters are CI-executable; HTTP/source fetching is
rate-limited and injectable; Claude and OCCT live paths fail closed unless a key or
executor is supplied by deployment.
**Changed:** `infra/migrations/0004_review_audit.sql`,
`packages/gateway/src/{reviewQueue.ts,server.ts}`, `packages/studio/src/{App.tsx,gateway.ts}`,
`workers/forge_workers/etl/{adapters.py,ingest.py}`, worker/gateway tests, and P4 docs.
**Decisions:** none.
**Next:** Start the generation orchestrator/retrieval prefix work against only
approved catalog truth; live Claude transport remains deployment-owned behind the
adapter seam.
**Blockers:** none.

## 2026-06-13 — Add studio catalog review panel
**Session:** Codex agent · branch `codex/p4-review-ui-cleanup` · **Phase:** P4 · **TODO items:** P4-014 [~]
**Done:** Continued the P4 review loop with a real studio surface: typed gateway
client, `/v1/reviews` list/filter, approve/reject actions, Vite `/v1` proxy for
local gateway development, and responsive panel cleanup. Verified against seeded
Postgres through the running gateway: pending rows rendered, approving one row
removed it from pending, and the approved filter showed reviewer attribution.
Browser-checked desktop and 390px mobile layouts for panel overflow/overlap.
**Changed:** `packages/studio/src/{App.tsx,gateway.ts}`, `packages/studio/vite.config.ts`,
and P4 docs (`TODO`, `ROADMAP`, generation pipeline, studio UI).
**Decisions:** none.
**Next:** Add live source-fetch and Claude extraction adapters behind fixture-backed
tests, then wire audit notes/export filters into the review decision path.
**Blockers:** none.

## 2026-06-13 — Complete Node 24 action migration
**Session:** Codex agent · branch `codex/node24-action-majors` · **Phase:** CI hygiene · **TODO items:** none
**Done:** Follow-up to the post-P3 PR: the force-env approach made the hosted run
green, but GitHub still annotated that Node-20-targeting actions were being forced
onto Node 24. Upgraded workflow action majors instead: `actions/checkout@v6`,
`actions/setup-node@v6`, `actions/setup-python@v6`, `pnpm/action-setup@v6`, and
`actions/upload-artifact@v7`; removed the force env blocks.
**Changed:** `.github/workflows/{ci,nightly,release}.yml`.
**Decisions:** none.
**Next:** Continue P4 with the studio owner-review surface, then live fetch/Claude/
OCCT adapters behind fixture-backed tests.
**Blockers:** none.

## 2026-06-13 — Post-P3 baseline and P4 review entry slice
**Session:** Codex agent · branch `codex/post-p3-p4-start` · **Phase:** P3/P4 · **TODO items:** P4-014 [~], P4-015/016/017 [queued]
**Done:** Marked the merged P3 catalog slice as the `p3-baseline` tag target
(`6937037`). Removed the hosted CI Node 20 action-runtime warning by opting the
workflows into GitHub's Node 24 JavaScript action runtime. Started P4 per D25 with
an executable review-queue API: `GET /v1/reviews` lists P3 `review_queue` records
and `PATCH /v1/reviews/:id` records approve/reject decisions against pending items;
database failures return a typed 503 without affecting validator/bake/BOM routes.
**Changed:** `.github/workflows/{ci,nightly,release}.yml`,
`packages/gateway/src/{db.ts,reviewQueue.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, package manifests/lockfile, and P4 docs
(`DECISIONS`, `ROADMAP`, `TODO`, generation pipeline, gateway/data).
**Decisions:** D25 — P4 starts with live catalog ingestion/review operations before
full text-to-CAD generation GA.
**Next:** Build the studio owner-review surface on top of `/v1/reviews`, then add
the injectable live fetch/Claude/OCCT adapters behind deterministic fixture tests.
**Blockers:** none.

## 2026-06-12 — Execution batch: collision truth (XC-09/GEO-008), SIM-004, share URLs, gamepad, workflows, incremental re-bake
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1/P3 cross-cutting · **TODO items:** §5 batch (9 of 10 closed), P1-002 [x]
**Done:** The owner-approved improvement list, executed. **XC-09:**
`forge-geometry::collide` — Möller tri-tri (coplanar = touching, by policy)
+ median-split world-space BVH per part, pure f64, no transcendentals;
GEO-003 upgraded to BVH-CONFIRMED mesh intersection (hrx7 53 AABB
candidates → 41 confirmed, 12 false positives silenced). **GEO-008**
(provisional): the validator ticks the model's real driver and sweeps 8
sampled frames — hrx7 shows **2 genuine motion-only contacts** (thigh
shells × pelvis at gait extremes), invisible at rest; whole sweep 127 ms;
cross-target report equality holds. **SIM-004:** inline-sim vs
equipped-catalog drift (deduped) — flagged vx2-proof's inline kv 1750 vs
the cited 1900; reconciled, and the equipped datasheet now flows into the
physics: **TWR 4.70→5.32, hover 43 %→39 %**; regression test pins both
directions. **Share URLs:** contract → deflate-raw → base64url fragment
(`share.ts`); opening re-validates/re-bakes locally (never trusted);
browser-verified round trip (hrx7 = 5.5 kB fragment boots a fresh page).
**Gamepad:** stick polling with deadzone in the drive loop (left =
strafe/forward, right = yaw/throttle); sliders remain fallback. **Patch
consequence diff:** Δ AUW/TWR/hover line after every configurator patch
(D5). **Bundle split:** three+n8ao chunk; app js 78 kB gz, warning gone.
**Workflows:** `nightly.yml` (parity gallery on headless chromium +
cargo-llvm-cov coverage, artifacts uploaded) and `release.yml` (tag v* →
static validator binary + wasm facade package). **Incremental re-bake:**
`bake_incremental` reuses untouched (geom, pose) buffers — a color patch
re-bakes zero geometry; budgets re-measured and hold. Verified: 106 Rust
tests, clippy --all-targets -D clean, golden + report equality, verdict
matrix (5), gateway 7/7, builds green, wasm-pkg rebuilt (320 KB gz).
**Changed:** `crates/forge-geometry/src/{collide.rs (new), lib.rs}`,
`crates/forge-validate/src/{lib.rs (GEO-003/008, SIM-004), file_catalog.rs}`,
`crates/forge-contract/src/lib.rs` (RowSummary on CatalogSource),
`crates/forge-wasm/src/lib.rs` (incremental patch), catalog battery row
(+capacityMah, cited), `examples/vx2-proof.forge.json` (kv reconciled),
`packages/studio/{src/share.ts (new), src/App.tsx, src/store.ts,
vite.config.ts}`, `.github/workflows/{nightly.yml, release.yml}` (new),
`tests/proof_pair.rs` (SIM-004), docs (TODO §5 batch, harness GEO note).
**Decisions:** none new (GEO-008/SIM-004 are provisional check ids per the
harness doc's convention).
**Next:** P3's data-layer remainder (Postgres runner, ETL pipeline, XC-17
export filter, D12 SKUs). *(Addendum, same session: the proptest item also
closed — see the follow-up commit; the batch is 10/10.)*
**Blockers:** none.

## 2026-06-12 — Pre-P0 closed: licensing (D24), hygiene, the name is ForgedTTC (D23)
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** Pre-P0 · **TODO items:** PRE-003 [x], PRE-004 [x], PRE-005 [x]
**Done:** Owner-delegated business calls executed and recorded. **D23 — the
product name is ForgedTTC** (resolves OD-01/PRE-005): living docs, UI title
("ForgedTTC STUDIO"), page title, NOTICE updated; `forge-*`/`@forge/*` code
namespaces deliberately stay (internal prefixes — renaming churns every
crate/import for zero user value); frozen papers keep the historical FORGE
codename; trademark scan recorded as the owner's pre-P4 action.
**D24 — license mechanics** (implements D2, © RNT56): root `LICENSE` states
the open-core split — Apache-2.0 zone = `crates/` (all forge-* crates incl.
the wasm facade and forge-gen: everything published must be usable),
`schema/`, `examples/` (fixtures travel with the validator); everything else
(studio, gateway, workers, prototype, catalog, docs, infra, scripts)
proprietary, all rights reserved; `LICENSES/Apache-2.0.txt` is the canonical
apache.org text (11,358 bytes); `NOTICE` per Apache convention; zone-2
package.json marked "SEE LICENSE IN"; the cargo workspace already declared
Apache-2.0 (the wasm-pack missing-LICENSE warning resolves). Contribution
terms stated in LICENSE. **PRE-004:** `.editorconfig` (LF/utf-8, 2-space,
rust 4, tabs for Make) + `.gitignore` extended (env/secrets, coverage,
logs). **Branch protection on `main` is the one remaining owner click**
(GitHub → Settings → Branches; no API surface in this session's toolset).
Pre-P0 phase → ● in ROADMAP.
**Changed:** `LICENSE`, `LICENSES/Apache-2.0.txt`, `NOTICE`, `.editorconfig`,
`.gitignore`, `package.json` ×3 (license fields), `CLAUDE.md` §1,
`docs/{DECISIONS.md (D23, D24), GLOSSARY.md, TODO.md, ROADMAP.md}`,
`packages/studio/{src/App.tsx, index.html}` (ForgedTTC title).
**Decisions:** D23 (name), D24 (license mechanics).
**Next:** owner clicks branch protection; then the standing P3 queue
(Postgres runner, ETL pipeline, license-export filter XC-17, D12 SKUs).
**Blockers:** none.

## 2026-06-12 — P3-007 proof pair: cited catalog rows, file-backed resolution, dims within 1 %
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P3 · **TODO items:** P3-007 [x], P3-004 [~ format], P3-001 [~ DDL]
**Done:** The proof pair is real and gated. **Rows:** EMAX ECO II 2207 1900KV
(31.5 g w/o wire · Ø27.45×32.6 mm · 16×16 M3 · M5 shaft · 3–6S · 40.6 A ·
2020 g max thrust @ 5×4.6/25.2 V) and CNHL Black Series 4S 1500 mAh 100C
(183 g · 75×35×37 mm · 14.8–16.8 V window · 150 A = 100C×1.5 Ah · XT60) as
`catalog/components/*.json` with **per-field citations** (value-as-printed,
source URLs, accessed date, derivation/discrepancy notes — incl. the
31.5-vs-33.5 g with/without-wire discrepancy). **Provenance stated honestly:**
this environment's egress allowlist blocks direct datasheet fetch (every
storefront/manufacturer/archive fetch 403s; only package registries pass),
so values are transcribed from search-result quotations of the cited pages —
rows carry confidence 0.7 + a mandatory review note (P3-004 review-queue
semantics, loader-enforced: confidence < 1 without a review note is a load
error). **Plumbing:** `FileCatalog` (native-only `CatalogSource` +
`RevisionSource` over `catalog/components/`), CLI `--catalog <dir>`.
**Proof body:** `examples/vx2-proof.forge.json` — VX-2 Mini with
rotors+battery slots as semver refs and a pinned lockfile: **Admitted with
the catalog, CTR-006-rejected without it**; the verdict matrix now runs with
`--catalog` (5 contracts green). **Exit-criterion evidence**
(`tests/proof_pair.rs`): baked AABB within 1 % of cited dims (cylinder/box
from the row envelopes; masses carried from datasheets, never derived from
the primitive approximation), resolver pins both refs, CAT engine finds the
pair compatible (4S window ⊂ 3–6S rating), citation+review enforcement over
every row. ROADMAP P3 → ◑ with the dims criterion checked (owner
verification of citations noted).
**Changed:** `catalog/{README.md, components/*.json}` (new),
`crates/forge-validate/{src/file_catalog.rs (new), src/lib.rs, src/main.rs
(--catalog), tests/proof_pair.rs (new)}`, `examples/{vx2-proof.forge.json
(new), expected-verdicts.json, README.md}`, `scripts/validate-all.mjs`
(runs with the catalog), docs (TODO P3-001/004/007, ROADMAP).
**Decisions:** none (the review-queue gate at confidence < 1 implements
P3-004's stated semantics).
**Next:** P3-008 reference rigs (SKU selection — owner sign-off needed for
D12), P3-001 migration runner against a live Postgres, P3-004 fetch→extract
pipeline (needs API keys + unblocked egress), license-export filter (XC-17).
Owner items: verify the two rows against their citations; prototype-final
tag; P0-007 build question; PRE-003/004/005; mid-hardware fps reading.
**Blockers:** direct datasheet fetch blocked by the environment's egress
policy — recorded on the rows themselves, not worked around.

## 2026-06-12 — P3 core logic: compat rule engine, lockfile resolver, connector taxonomy
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P3 · **TODO items:** P3-002 [x], P3-003 [x], P3-006 [x]
**Done:** The data-layer-independent half of P3. **P3-003 compatibility rule
engine** in `forge-validate::compat` — CORE-side, correcting the component-db
doc's gateway *(proposed)* placement per D16 (gateway/studio consume the same
bits via the facade): CAT-001 mount-pattern equality, CAT-002 voltage-window
intersection, CAT-003 current budget ×1.2, CAT-004 prop tip clearance (v0
spacing form; BVH sweep = XC-09), CAT-005 TWR floors per preset (thrust/AUW
supplied by the caller — never invented), CAT-006 connector matching. Every
violation carries an explanation string (the reason a configurator card
greys); fixture-tested rule by rule, with undeclared-field semantics explicit
(skip when unverifiable, warn when one side declares). **P3-006 lockfile
resolver** in `forge-contract` — `semver` module (exact/^/~, ~120 lines, no
new dependency), `pin_refs` (pin STABILITY: existing pins survive catalog
updates; yanked revisions verify-but-never-freshly-resolve), and
`upgrade_lockfile` (the explicit mover, returning diffs for LIF-001
re-validation + consequence diffs); tested incl. yanked and
unsatisfiable-range reasons. **P3-002 connector taxonomy seed**
(`infra/migrations/0002_connector_taxonomy.sql`): stack 30.5/25.5/20,
motor 16/19/12 bases, prop M5/T-mount, XT60/XT30/JST-PH-2, UART/I2C —
published ecosystem standards; component rows still cite their own
datasheets (D10). Check catalog gains the CAT block
(validation-harness.md). Drive-by: clippy now clean under `--all-targets`
(test-target lints incl. a TAU literal in forge-num's test). Verified: 100
Rust tests, golden + report equality, verdict matrix, wasm32.
**Changed:** `crates/forge-validate/src/{compat.rs (new), lib.rs}`,
`crates/forge-contract/{src/semver.rs (new), src/lib.rs (RevisionSource,
pin_refs, upgrade_lockfile), tests/lockfile_resolution.rs (new)}`,
`crates/forge-num/src/lib.rs` (test literal), `infra/migrations/0002…sql`
(new), docs (validation-harness CAT block, component-database placement +
status, TODO).
**Decisions:** compat engine placement = core (recorded in the system doc;
the prior gateway note was *(proposed)*-level).
**Next:** P3-007 proof pair — needs (a) a file-backed `RevisionSource` for
the CLI so admitted contracts can pin against seed rows pre-Postgres, and
(b) real 2207-motor + 4S-1500 datasheets with per-field citations (web
research); then P3-001 migration runner + P3-004 ETL worker skeleton.
**Blockers:** none.

## 2026-06-12 — P2 closed: verdict matrix in CI, draft semantics, OD-08 → D22
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P2 · **TODO items:** P2-006 [x], P2-007 [x], P2-002 [~], P2-003 (biped ✓)
**Done:** **P2's four exit criteria are all checked — phase closed.**
P2-006: `examples/expected-verdicts.json` declares verdict + the exact ERROR
check-id set for every first-party contract; `scripts/validate-all.mjs`
enforces it in CI (undeclared contracts and stale expectations fail) —
hrx7/vx2-hornet pinned as rejected with exactly CTR-004, vx2-mini/qd-mini
admitted clean. P2-007/OD-08 resolved by measurement and recorded as **D22**:
gateway binary-spawn p50 5.3 ms (16 parts) / 17.8 ms (125 parts) vs
in-process WASM 0.7 / 3.7 ms (`scripts/od08-measure.mjs`) — spawn stays
(isolation + bit-equality with CI, far inside budget); napi-rs deferred
until a measured hot path demands it. P2-002 (D14) validation semantics
live end to end: CLI `--as-draft` → gateway `asDraft` flag → HTTP 200 with
`verdict: draft` and full diagnostics (a draft is a successful save, not a
422); gateway test added (7/7). Draft PERSISTENCE deferred to the data
layer (P3-001) — recorded honestly, not faked with a file store.
**Changed:** `examples/expected-verdicts.json` (new),
`scripts/{validate-all.mjs,od08-measure.mjs}` (new), `.github/workflows/ci.yml`
(P2-006 step), `packages/gateway/{src/server.ts,src/validator.ts,
test/server.test.ts}`, docs (DECISIONS **D22**, TODO P2 section + P2-003
biped tick, ROADMAP P2 criteria + phase table: **P2 ●**, P1 ◑ 5/6).
**Decisions:** **D22** (OD-08 closed: binary-spawn stays, numbers recorded).
**Next:** P1's last open criterion is a real-mid-hardware 60 fps run (owner
can read the perf overlay); then P3 — component DB schema (P3-001 Postgres
DDL), which also unblocks P2-002's persistence half. Owner items still open:
prototype-final tag push (P0-010), configurator-build question (P0-007),
PRE-003/004/005.
**Blockers:** none.

## 2026-06-12 — P1-016 closed: N8AO + the XC-22 quality ladder
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-016 [x]
**Done:** Shaded rendering now goes through EffectComposer (Render → N8AO →
Output; blueprint keeps its dedicated pass; AO is meaningless on a technical
drawing). `n8ao` is the only new dependency — the package the plan names at
XC-22; three's own composer avoids pmndrs postprocessing. Tiers: high /
medium (½-res AO) / low (AO off) over pixel ratio, selectable in the panel;
the **degradation ladder v0** steps the tier DOWN on sustained < 45 fps for
3 s and never up (raising is manual). Parity gallery pins tier=low for
deterministic structural captures — re-ran green (F1 0.957–0.995, precision
≈ 1.000). Measured on the SwiftShader software floor: high 2.6 ms render /
25 draws (AO's internal passes), low 0.6 ms / 8 draws — the ≤ 6 ms render
budget holds with AO on even WITHOUT a GPU. Headless screenshot verifies
contact shading. All gates green (gateway 6/6, builds, gallery).
**Changed:** `packages/studio/src/{scene.ts (composer + setTier), App.tsx
(tier select + auto-degrader), store.ts (tier), n8ao.d.ts (decl shim)}`,
`packages/studio/package.json` (+n8ao), `scripts/parity-gallery.mjs`
(tier=low pin), docs (TODO P1-016, render-engine §4).
**Decisions:** none (N8AO was plan-named; the three-composer-over-pmndrs
choice is implementation detail recorded here).
**Next:** P2 remainder — P2-002 draft semantics, P2-006 CI on all
first-party contracts, OD-08 napi-rs vs binary-spawn measurement, npm/crates
publication plumbing (P2-001).
**Blockers:** none.

## 2026-06-12 — Studio P1 finishers: BatchedMesh, blueprint post pass, outline, jog, configurator
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-008 [x], P1-010 [x], P1-012 [x], P1-013 [x], P1-014 [~ mechanics], P1-017 [~]
**Done:** The render layer is rebuilt around **one BatchedMesh per material
class** (per-instance color + matrix, batchId raycast picking, merged
single-LineSegments leaders, camera near 0.01 for depth precision): hrx7
draws in **8 calls shaded / 9 blueprint / 9 exploded** vs ~260 before; the
≤ 40 budget is now gated inside the parity gallery (which re-ran with
IDENTICAL edge-F1s 0.95–0.995 at 3 draws/scene — the batch refactor is
pixel-equivalent). **Blueprint post pass** (P1-010): view-normal + depth RT →
full-screen discontinuity shader over the flat pass; the 125 per-part
EdgesGeometry objects are deleted; verified by headless screenshot.
**Selection outline** (P1-012): inverted hull (back-face shell inflated along
normals, rim distance-scaled ~2 px) — chosen over stencil for 1 draw call,
no postprocess dep, depth-correct occlusion; first attempt via
MeshBasicMaterial onBeforeCompile silently failed (no objectNormal in
unlit shaders) — replaced with an explicit ShaderMaterial. **Jog + pause +
frame-step** (P1-013 close): `CoreSession.set_jog` applies per-node euler
over the pose layers (the monolith's `nodes[k].rot += jog[k]`), zeros clear;
test proves jog moves the head and clearing restores the bit-identical
stream; studio drags the selected node (orbit suspended during the drag),
pause freezes the drive clock, step advances exactly 1/120 s.
**Configurator mechanics** (P1-014): the selection pane patches
color/material through the live CoreBake handle — JSON-Patch → re-bake in
place; the validator re-judges every patched document; explode/camera/
drive/jog/selection survive (browser-verified: head visor patched to
#39c8ff, material to gloss, verdict honestly stays REJECTED on the
historical hrx7). Variant cards stay gated on slots (P0-007/P3).
**Perf overlay** (P1-017): fps + render ms + draw calls + core-tick ms with
honest multi-pass accounting (`info.autoReset` off); SwiftShader software
floor: render 0.5 ms · core ≤ 0.05 ms · 9 draws — ROADMAP frame-budget
criterion annotated, "shimmer gone" checked (no painter sort exists to
flicker; z-buffer + near-plane fix; gallery is the record). Verified: 89
Rust tests, clippy -D clean, golden + report equality, budgets, gateway 6/6,
gallery green with draw-call gate, wasm-pkg rebuilt (301 KB gz).
**Changed:** `packages/studio/src/{scene.ts (rewrite), App.tsx (rewrite),
store.ts, wasm.ts, materials.ts}`, `crates/forge-wasm/src/{session.rs (jog),
lib.rs (set_jog/clear_jog)}`, `crates/forge-motion/src/quadruped.rs (body
getter)`, `scripts/parity-gallery.mjs` (stats + ≤ 40 gate), wasm-pkg,
`docs/assets/parity/` (refreshed with draw-call metrics), docs (TODO,
ROADMAP, render-engine).
**Decisions:** outline = inverted hull, not stencil (recorded at P1-012 —
implementation-level, system doc updated); jog scope = posed driver paths.
**Next:** P1-016 N8AO + quality tiers (the last open studio finisher), then
P2 remainder (P2-002 drafts, P2-006 CI on all first-party contracts, OD-08
napi-rs measurement).
**Blockers:** none.

## 2026-06-12 — P1-013 (follow half): drive-mode follow camera through the boundary
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-013 [~] (follow camera ✓; jog + pause/frame-step remain)
**Done:** `CoreSession::focus()` (driver body at natural viewing height —
biped/fpv use the ported drvFocus, rover/quadruped their body pose) exported
through the wasm `Session`; the studio's drive loop eases orbit target AND
eye toward it at the monolith's smoothing (min(1, dt·5)), preserving the
user's orbit offset. Verified: 88 tests, clippy clean, golden-compare green
(focus is not part of the hashed streams), budgets hold, builds green.
**Changed:** `crates/forge-wasm/src/{session.rs,lib.rs}`,
`crates/forge-motion/src/quadruped.rs` (body() getter),
`packages/studio/src/{scene.ts,wasm.ts,App.tsx}`, wasm-pkg rebuilt, TODO.
**Decisions:** none. **Next:** P1-014 configurator pane (CoreBake.patch
ready), P1-008 BatchedMesh, P1-010/012 render finishers, P1-013 jog half.
**Blockers:** none.

## 2026-06-12 — P1-005 closed: typed facade boundary, budgets gated; wasm validate trap found+fixed
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-005 [x]
**Done:** The zero-copy boundary is real. Facade grows a stateful `Bake`
handle — meta (counts/HUD/node_world/part table) crosses as JSON once;
positions/normals/indices cross as **typed-array views over wasm linear
memory** (consumed synchronously; the sanctioned `unsafe` per BEST-PRACTICES
§5 lives here with SAFETY notes); `Bake.patch` applies JSON-Patch and
re-bakes in place (the P1-014 configurator primitive); `Session.step` now
returns steps and `Session.pose_view` is the zero-copy per-frame pose read.
Studio: fetches CONTRACTS only and bakes+validates in-browser (demo
.bake/.report payloads deleted; `pnpm demo:sync` copies contracts; drag-drop
unchanged); scene consumes typed arrays without copies; drive loop reads
pose_view. **Budgets measured through the real path and CI-gated as stated —
no runner fudge** (`scripts/budgets.mjs`): hrx7 bake **2.0 ms** (≤ 60 ms,
was ~10 via JSON), patch→re-bake **2.8 ms** (≤ 10 ms, was ~10.8 — the JSON
mesh serialization WAS the budget), facade 298 KB gz (≤ 2 MB). Parity
gallery re-run on the new load path: identical F1s (0.95–0.995) — the
in-browser bake renders equivalently to the old prebaked payloads.
**Finding (D17): wasm `validate` had trapped (`unreachable`) on every
contract since its first build** — `std::time::{SystemTime,Instant}` panic
on wasm32-unknown-unknown, and NO gate exercised the path (gateway spawns
the native binary; the facade test runs the native rlib; the old studio
fetched prebaked reports). Fixed with a cfg'd `clock` module (js-sys
Date.now on wasm — report provenance only, judgment never reads it) and the
gate is closed: golden-compare now ALSO requires native↔wasm
**validator-report equality** (startedAt/durationMs/target normalized) on
all four canonical contracts, in CI.
**Changed:** `crates/forge-wasm/src/lib.rs` (Bake handle, pose_view, bake_meta_json
+ native test), `crates/forge-validate/{src/lib.rs (clock), Cargo.toml (js-sys
wasm-only)}`, `packages/studio/src/{wasm.ts (CoreBake, artifactFrom, poseView),
types.ts (typed mesh), scene.ts (typed attrs), App.tsx (in-browser demo bake)}`,
`packages/studio/public/demo/` (payloads pruned), `scripts/{budgets.mjs (new),
golden-compare.mjs (report leg), parity-gallery.mjs (contract check)}`,
`.github/workflows/ci.yml` (budgets step), root `package.json`
(demo:sync replaces bake:demo), wasm-pkg rebuilt (298 KB gz), docs (TODO,
ROADMAP P1 budgets criterion, core-runtime §3).
**Decisions:** none (unsafe-in-facade was already sanctioned *(proposed)* in
BEST-PRACTICES §5; this makes it real with the documented discipline).
**Next:** studio P1 finishers — P1-008 BatchedMesh, P1-010 blueprint post
pass, P1-012 stencil outline, P1-013 jog/follow camera, P1-014 configurator
pane (CoreBake.patch is ready for it); P1-016/017.
**Blockers:** none.

## 2026-06-12 — P1-015 closed: golden-scene parity gallery, monolith vs studio
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-015 [x]
**Done:** `pnpm parity` (`scripts/parity-gallery.mjs`) renders the SAME models
under the SAME six canonical cameras (hrx7 + vx2-hornet × three-quarter/
profile/high-rear, monolith FOV 2·atan(0.3443) ≈ 38°) in two renderers — the
frozen monolith (served as a bridged in-memory copy because its IIFE hides
state; pinned: auto-rotate off, clock frozen, pose overridden to pure rest,
grid/marker/blob-shadow/gizmo/vignette suppressed) and the built studio
(`window.__forgeParity` hook: load model, pin camera orbit+FOV, grid/shadows
off) — in headless chromium on SwiftShader (the env pre-provisions build 1194
under /opt/pw-browsers; the script falls back to playwright's resolution
elsewhere). Structural metric: Sobel edge maps of downscaled luminance,
binarized top-8 %, F1 with 1-px dilation tolerance. **Measured 0.95–0.995 on
all six scenes; gate 0.85** (observed failure modes — overlaid UI chrome,
background vignette banding, studio ground shadow — scored ≤ 0.4 before they
were eliminated, so the gate separates regimes with wide margin). Luminance
RMS reported as informational (PBR vs painter shading differs by design).
Composites + metrics committed as evidence (`docs/assets/parity/`, ~128 KB);
full gallery regenerates into `artifacts/parity/` (now gitignored). CI
integration deliberately deferred (fresh-chromium flake risk) — recorded in
TODO. ROADMAP P1 "parity gallery" criterion checked.
**Changed:** `scripts/parity-gallery.mjs` (new), `packages/studio/src/{scene.ts
(setCameraPose/setGridVisible/setShadowsVisible), App.tsx (__forgeParity hook)}`,
root `package.json` (parity script; playwright-core+pngjs devDeps — playwright
moved out of the studio package), `.gitignore` (artifacts/),
`docs/assets/parity/*` (new evidence), docs (TODO P1-015, ROADMAP P1,
render-engine §7/§9).
**Decisions:** none (RND-001's open question — screenshots vs re-render —
resolved operationally: the frozen monolith renders itself live, read-only).
**Next:** studio P1 finishers — P1-008 BatchedMesh, P1-010 blueprint post
pass, P1-012 stencil outline, P1-013 jog/follow camera (drivers expose
`focus()`), P1-005 zero-copy views + bake/patch timing; then P1-016/017.
**Blockers:** none.

## 2026-06-12 — P1-001 closed: biped + FPV oracle drivers ported, tape parity at ULP level
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-001 [x]
**Done:** Line-faithful Rust ports of the monolith's two drive pipelines.
`forge-motion/src/biped.rs` (HRX-7: idle breathing/scan/sway, arrive
controller, heading spring, speed ramp, blended phase gait with the monolith's
legIK variant, world placement, head-scan detents, ω16/ζ0.8 servo settle on
head+arms, actuator telltales) and `fpv.rs` (VX-2: hover-drift idle,
drag-limited velocity flight in the bounded arena, tilt servos, per-motor RPM
mixer with alternating spin, ω14/ζ0.85 camera servo). Expression groupings
mirror the JS so FP op order is identical; all transcendentals via forge-num
(D17), which grew `hypot` + `js_round` (JS Math.round tie semantics,
double-rounding safe). **Tape parity measured: max deviation 4.4e-16 (biped)
and 7.1e-15 (fpv)** against `prototype/trajectories/` over 300 frames × all
rot/off channels (`tests/tape_parity.rs`, banded 1e-9, bit-deterministic
replays; tape pos channels == contract skeleton exactly). Session wiring:
`node_world_posed` in forge-geometry implements nm() faithfully — skeleton
`rot` is BASE euler, driver channels ADD to it (hips/shoulders carry base
splay; replacing instead of adding would silently flatten it). `CoreSession`
drives multirotor (pitch/roll/yaw/throttle sticks) and biped
(drive/roll/turn) through the oracle ports with full pose channels; golden
tick corpus re-pinned for vx2-mini/hrx7/vx2-hornet (qd + ALL bake hashes
unchanged; native↔WASM stayed bit-identical on first post-rewire comparison —
forge-num doing its job). BEH-001 biped smoke (2 s walk ≈ 1.49 m) replaces the
"lands P2" warn; hrx7 report now 1 error (CTR-004, historical) + 53 GEO-003
warns. wasm-pkg rebuilt (293 KB gz ≤ 2 MB). Earlier in session: fixed CI
golden-compare path bug (`join(cwd, abs)` → `resolve`) that failed all three
prior runs in the XT-001 step. Verified: 87 Rust tests, clippy -D clean,
wasm32 cross-compiles, studio+gateway build, gateway 6/6, tapes re-record
byte-identical, golden-compare green fresh + committed.
**Changed:** `crates/forge-motion/{src/biped.rs,src/fpv.rs,src/lib.rs,tests/tape_parity.rs}`,
`crates/forge-num/src/lib.rs`, `crates/forge-geometry/src/lib.rs` (node_world_posed),
`crates/forge-wasm/{src/session.rs,tests/fixtures/golden.jsonl}`,
`crates/forge-validate/src/lib.rs` (BEH-001 biped arm),
`packages/studio/src/wasm-pkg/` (rebuilt), `scripts/golden-compare.mjs`,
docs (TODO P1-001, motion-engine, core-runtime §5, examples/README).
**Decisions:** none (golden re-pin is the documented intended-bump path, not a
new decision).
**Next:** P1-015 golden-scene parity gallery vs the monolith (canonical
cameras, perceptual diff), then the studio P1 finishers (P1-008 BatchedMesh,
P1-010 blueprint post pass, P1-012 stencil outline, P1-013 jog/follow camera —
`focus()` is exposed on both drivers for it).
**Blockers:** none. (Owner actions still open: push `prototype-final` tag
(P0-010), the later configurator build question (P0-007), PRE-003/004/005.)

## 2026-06-12 — Golden numbers live: native↔WASM bit-identical; D17 divergence found+fixed
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-006 [x], P1-007 [x], XC-26 [x], P1-001 (oracle ready)
**Done:** **XT-001 is real and green.** Golden-number suite: FNV-1a hashing of
exact f32 bit patterns inside the core (bake buffers + 600-step scripted tick
streams, four canonical scenes); `forge-golden` native binary vs the WASM
facade in Node, byte-identical required; hashes also pinned in time as a
fixture test. **First run caught a genuine D17 violation** — hrx7/vx2-hornet
bake hashes differed native↔wasm (platform libm vs Rust wasm libm, ULP drift
on lathe angles + pose rotations). Fix: new **`forge-num`** crate routes all
core transcendentals through pure-Rust `libm` (identical bits on every
target); sqrt/arithmetic stay std. After the sweep all four scenes are
bit-identical across targets → **P1-007 met** (binary↔WASM bit-identical on
both translated contracts). Also rebuilt the stale committed wasm-pkg (it
predated the polymesh rework); CI now builds a fresh facade, runs
golden-compare, and fails on committed-pkg staleness. **Oracle axis:**
deterministic motion tapes recorded from the monolith's own drv/pose/post
pipeline (`prototype/trajectories/`, 300 frames × 9 ch/node; hrx7 walks
2.35 m — translation lives in root.off; fpv climbs/banks with spinner
history); CI re-records and fails on drift.
**Changed:** `crates/forge-num` (new), transcendental sweep across
geometry/motion/sim, forge-wasm (golden module + bin + export),
`scripts/{golden-compare,extract-trajectories}.mjs`, tapes, pinned
`golden.jsonl`, CI gates, wasm-pkg rebuild, docs state.
**Decisions:** forge-num/libm adopted as the execution of D17's no-fast-math
policy (core-runtime §5; no new D-number — it implements D17).
**Next:** port the biped + FPV drivers against the trajectory tapes (P1-001
finish) — tolerance-banded vs the JS oracle, bit-exact across our targets;
then the parity gallery (P1-015) and BatchedMesh/blueprint finishers.
**Blockers:** none.

## 2026-06-12 — P0 closed (vintage scope): byte-equivalent translations of both models
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P0 · **TODO items:** P0-004 [x], P0-005 [x], P0-006 [x], P1-002 (reconciliation)
**Done:** **Byte-equivalence MET on first comparison** — hrx7 `125 parts · 2195
faces · 2581 vertices`, vx2-hornet `73 · 924 · 1250`, exact against the monolith
extraction, now CI-guarded (extraction drift + translation drift + compare).
How: (1) PRE-002 reconciliation of forge-geometry — line-by-line ports of the
monolith's taper/box/cbox/cyl/lathe as shared-vertex polygon meshes
(origin-centered), part pose T·Ry·Rx·Rz·S, node composition T·Ry·Rx·Rz, the
centroid outward-orientation rule, and the monolith's TAU literal (kept under a
justified clippy allow — position-level golden numbers depend on it); GPU
buffers via fan triangulation at bake; counts now expose polygons + poly-verts
(oracle quantities) alongside render triangles. (2) **Mechanical translation**:
`scripts/translate-monolith.mjs` instruments the monolith's own N()/P() calls
in a vm sandbox and emits `examples/{hrx7,vx2-hornet}.forge.json` — zero hand
transcription; semantic rules (material mapping, collision none pre-D7,
spinner/hip/knee joints, combat naming dropped §17.2) documented in the script.
Contract gained `Part.pose` and chain explode fields (prototype reconciliation);
schema/codegen/goldens/demo artifacts regenerated; vx2-mini + qd-mini re-posed
for centered solids; both translations joined the studio picker. **Findings:**
both translations fail CTR-004 (explode coverage 69 %/42 % vs the later 80 %
gate) — historical models predate the completeness gates; gates unchanged.
hrx7 AUW reads 93 kg from class densities (no masses in the vintage — doctrine
holds: computed, not invented; real masses arrive with sourcing).
**Changed:** crates (contract pose/chains, geometry polymesh+primitives rework,
validate/wasm counts, sim export origins, gen poses), scripts (translate,
extract --out arg), examples (2 new + 2 re-posed), studio (picker, report
truncation), CI (equivalence guard), goldens, schema, codegen, docs state.
**Decisions:** none new (all within PRE-002 reconciliation scope under D21).
**Next:** extend extraction to record gait/flight trajectories → golden-number
corpus (P1-006/XC-26) → bit-identical native↔WASM verification (P1-007). P0 is
now ● for the delivered vintage (P0-007 variants still gated; remote tag still
an owner push).
**Blockers:** none.

## 2026-06-12 — PRE-002 executed: prototype delivered, frozen, oracle extracted
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** pre-P0/P0 · **TODO items:** PRE-002, P0-004 (oracle side), P0-008 (counts), P0-010
**Done:** The owner delivered `cad-object-studio.html` (50,967 bytes, sha256
`ca93489e…`). Searched first (TTC refs/tags, all 45 owner repos by name and code
content — zero hits; recorded). Committed **byte-exact** at
`prototype/cad-object-studio.html`, tagged **`prototype-final`**. Built the
extraction harness (`scripts/extract-counts.mjs`): slices the monolith's pure
builder segment into a Node vm sandbox (read-only) and replicates `loadModel`'s
reset+build+count core. **Oracle numbers extracted** →
`prototype/extracted-counts.json`: hrx7 humanoid **125 parts · 2195 faces ·
2581 vertices · 20 nodes · 15 chains**; fpv VX-2 **73 parts · 924 faces · 1250
vertices · 14 nodes · 13 chains**. Byte-equivalence comparator ready
(`scripts/compare-counts.mjs`). **Vintage finding (recorded in
prototype/README.md):** this is the pre-configurator build — N/P registry,
chains, gait+IK (L1=L2=0.39, Appendix-C verbatim), FPV mixer, servos (ω 14–16,
ζ 0.8–0.85), blueprint/jog/click-to-move are all present; slots/variants/ports/
bellows/squircle/harness (the plan's ~83 KB audit) are not. P0-007 (31 variants)
stays gated on the later build or a re-scope decision; everything else
prototype-gated is now **unblocked** (P0-005/006 translations, P1-006/007/015).
**Changed:** `prototype/` (monolith + README + extracted-counts.json),
`scripts/extract-counts.mjs`, `scripts/compare-counts.mjs`, CLAUDE.md §2,
TODO (blocker resolved; P0 items re-stated), ROADMAP (P0 ⛔→◑).
**Decisions:** none new (vintage re-scope of P0-007 awaits the owner's answer on
whether the configurator build exists).
**Next:** P0-005/006 — translate hrx7 + fpv from the frozen source into
`ModelSpec` JSON and drive `compare-counts` to byte-equivalence; then extend
extraction to record gait/flight trajectories (golden-number corpus, P1-006).
**Blockers:** none critical. Two owner items: (1) the remote tag — the git proxy
rejects tag pushes (403), so `prototype-final` exists locally only; push it from
any clone or create a Release on `0294a9d`. (2) Open question: does the later
~83 KB configurator monolith (31 variants/11 slots/harness) exist?

## 2026-06-12 — Boundary frozen; P2 quadruped family; in-browser core; exporters
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P0/P1/P2 interleaved (D21) · **TODO items:** P0-009, P1-004/005/009/010/011/012/017, P2-001/003/004/005, P3-009/010, P4-005 (core path), P6-008, XC-04, XC-06
**Done (all verified: 66 Rust tests, clippy -D clean, studio+gateway builds, 6
gateway tests, 12 worker tests):**
**Core boundary FROZEN v1 (P0-009)** — all four calls live: `patch` (RFC-6902
subset with shape gate, in `forge-contract`), `tick` (`CoreSession`: fixed-step
120 Hz accumulator, multirotor spinner kinematics, rover/quadruped body+joint
poses, bit-deterministic under uneven dts — tested), alongside bake/validate.
**P2 substantially delivered** — quadruped driver (trot phase gait, per-leg IK,
diagonal pairing, hip_/knee_/foot_ chain discovery); typed driver-param schemas
(schemars) for multirotor/rover/quadruped with new check CTR-008; **`forge-gen
quadruped`**: slider params → admitted, walking contracts with zero hand-written
code, grid-tested at 2/3/4 leg pairs (P2 exit criterion); demo committed as
`examples/qd-mini.forge.json` (Admitted, 0/0).
**In-browser core (D17 made real)** — wasm-pack builds the facade into the studio
(committed pkg, **275 KB gz vs ≤ 2 MB budget**); the studio now validates and
bakes dropped `.forge.json` files locally (same bits as CI), and **Drive mode
ticks the core in-browser** (spinners spin, the quadruped walks). Studio also
gained: blueprint mode v0, raycast selection + info panel, explode leader lines,
model picker, fps overlay.
**Pull-forwards** — MJCF/URDF exporters v0 with per-node mass/COM/inertia from
baked meshes, Y-up→Z-up conversion, joints/limits/actuators + golden fixtures
(XC-04); thrust-table bilinear interpolation with table-over-estimate precedence
(XC-06); BOM v0 (`forge-validate bom`); gateway `/v1/bake` + `/v1/schema`.
**Changed:** `crates/*` (patch.rs, session.rs, quadruped.rs, params.rs,
thrust_table.rs, export.rs, forge-gen new), `packages/studio/*` (wasm.ts,
scene/store/App rewrites, wasm-pkg committed), `packages/gateway/*`,
`examples/qd-mini.forge.json` + demo artifacts, `scripts/build-wasm.sh`,
docs/TODO/ROADMAP/validation-harness/core-runtime.
**Decisions:** none new (all under D21's recorded scope).
**Next:** PRE-002 still the highest-value unlock. Independent: P1-014 configurator
pane via the patch path; P1-016 AO/quality tiers; P2-002 draft persistence;
P2-007 napi-rs measurement; zero-copy facade views.
**Blockers:** PRE-002 (unchanged).

## 2026-06-12 — Fix PR #1 CI: pnpm version double-pin
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P0/P1 (D21) · **TODO items:** none
**Done:** PR #1's "studio + gateway" check failed in setup: `pnpm/action-setup@v4`
errors when the workflow pins `version: 10` while `package.json` carries
`packageManager: pnpm@10.33.0`. Removed the workflow pin (packageManager is the
single source). Rust core and Python workers jobs were already green on the runner.
**Changed:** `.github/workflows/ci.yml`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Merge PR #1 to `main` once all three checks are green (owner instruction),
then PRE-002 as before.
**Blockers:** PRE-002 (unchanged).

## 2026-06-12 — v0 end-to-end build: all surfaces implemented and green
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P0/P1 interleaved (owner re-order, D21) · **TODO items:** P0-001..004, P0-009, P1-001..005, P1-008/009/011/013, XC-01, PRE-004 (partial)
**Done:** Implemented the v0 system end to end, all verified locally:
**Rust core** (40 tests, clippy -D clean, fmt clean) — `forge-contract` (full v2.1
types, schemars emission, Appendix-A round-trip, contract/lockfile hashing, lockfile
resolver); `forge-geometry` (all 7 primitive builders with byte-stable bake,
signed-tetrahedra mass properties verified vs analytic solids ≤0.1%, node world
transforms, AABB interference v0); `forge-motion` (closed-form 2-bone IK verified by
FK round-trip, critically damped servos stable at dt=50ms, quad mixer with symmetry
tests, multirotor/rover drivers, constraint clamps); `forge-sim` (propulsion with
fixed-point battery sag, momentum-theory power, complementary estimator with
deterministic seeded noise, HUD derivation with inspectable assumptions, replay
header); `forge-validate` (14 live checks, machine-readable diagnostics, report
envelope, CLI run/bake/schema, exit codes, D14 draft flag); `forge-wasm` facade
(validate/bake/schema; compiles to wasm32-unknown-unknown).
**TS face** — studio (Vite/React 19/Zustand/Three.js viewer consuming core-baked
buffers zero-math: PBR five-class mapping, IBL-lite rig, staged explode slider, HUD
panel with assumptions, validator report panel; tsc+vite build green); gateway
(Fastify+TypeBox, spawns the validator binary per D17, 4 tests incl. live
admit/reject round-trips). **XC-01**: `pnpm codegen:contract` generates TS types from
the emitted schema; CI fails on drift. **Python workers** (12 tests): schema
validation against the emitted artifact (cross-language contract proven), job
registry, scorecard gate (estimator smoke D8 + thresholds + PRV-002 lineage), ETL
citation gate (per-field citations, D10 license non-optional, review queue floor).
**Infra**: GitHub Actions CI (core/face/workers jobs), docker-compose (pgvector
Postgres), `infra/migrations/0001_catalog.sql` (full catalog DDL incl. immutable
`component_revisions`). **Demo**: `examples/vx2-mini.forge.json` (16 parts,
synthetic, clearly labeled) — **Admitted**, 0 errors/0 warns; HUD: AUW 479 g, TWR
4.70, hover 43 %, endurance 21.8 min.
**Changed:** `Cargo.toml`, `crates/*` (6 crates), `package.json`,
`pnpm-workspace.yaml`, `pnpm-lock.yaml`, `scripts/codegen-contract.mjs`,
`packages/studio/*`, `packages/gateway/*`, `workers/*`, `schema/`, `examples/*`,
`infra/*`, `.github/workflows/ci.yml`, `.gitignore`; docs state: CLAUDE.md §2/§4,
ROADMAP (pre-P0/P0 checks), TODO (P0/P1 states), DECISIONS (D21),
architecture §3, validation-harness (v0 state note).
**Decisions:** **D21** — owner-ordered start ahead of PRE-002; consequences recorded
(synthetic fixture ≠ translation; *(proposed)* parameterizations reconcile at
PRE-002; oracle parity still gates P1).
**Next:** PRE-002 remains the single highest-value step — committing the prototype
unblocks P0-005..008/010 (translations + byte-equivalence) and P1-006/007/015
(golden numbers, bit-identical verification, parity gallery). Independent of it:
P1-005 zero-copy facade views + tick/patch, BatchedMesh batching (P1-008), blueprint
mode (P1-010).
**Blockers:** PRE-002 (prototype absent). Python here is 3.11 (plan says 3.12 — CI
uses 3.12; workers require ≥3.11, no code impact).

## 2026-06-11 — Plan v3.0 adopted: Rust core / web face; docs suite upgraded
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** pre-P0 · **TODO items:** PRE-006
**Done:** Adopted the owner-provided plan v3.0 as the binding plan and propagated it
through the entire documentation system. Headline changes: runtime settled as **Rust
core, web face** (D16 — `forge-core` crates dual-compiled native+WASM; TS face;
Python compute); **FORGE Desktop (Tauri) scheduled at P8** (D15, subsumes old D11);
**one validator everywhere, bit-exact, golden-number suite** (D17, supersedes D6);
positioning settled **upstream of CAD** with the R1–R4 success ladder (D18). Archived
v2.0 as `docs/FORGE-plan-v2.md`; installed v3.0 at `docs/FORGE-plan.md`. Rewrote
CLAUDE.md, ROADMAP (new P0/P1/P8 scope+criteria, 16–21 wk wedge), TODO (P0/P1/P8
restructured for the port and Desktop; XC-26 golden-number suite, XC-27 Tauri
plugins; OD-02 resolved by D16; OD-08 napi-rs-vs-binary added), DECISIONS (D1–D18
per plan; prior derived D15/D16 renumbered **D19/D20**; next free ID D21),
architecture (runtime split, core boundary, crates/ layout, new budgets),
risk-register (R12 Rust-port cost, R13 float divergence). Added
`docs/systems/core-runtime.md` (boundary API, port-with-oracle plan, golden-number
suite). Updated all 16 existing system docs (crate homes, D-renumbering, D17
replay/leaderboard semantics, Desktop in hardware-bridge, schemars as schema source,
tier-0 native co-design), BEST-PRACTICES (Rust standards, codegen direction,
determinism rules, testing pyramid), GLOSSARY (new terms), README, security doc.
**Changed:** `CLAUDE.md`, `CHANGELOG.md`, `docs/FORGE-plan.md` (new v3.0),
`docs/FORGE-plan.md → docs/FORGE-plan-v2.md` (rename), all living docs, all
`docs/systems/*.md` (+ new `core-runtime.md`).
**Decisions:** v3.0 record adopted: D15–D18 new; D6 superseded by D17; D11 subsumed
by D15; this file's prior D15/D16 renumbered to D19/D20 to clear the collision.
**Next:** Unchanged and now doubly important — PRE-002: commit the prototype; it is
both the byte-equivalence reference (P0) and the parity oracle for the Rust port
(P1). Then P0-001: author the contract schema as Rust types in `forge-contract`.
**Blockers:** PRE-002 — the prototype monolith is still absent from the repository.

## 2026-06-11 — Documentation system established
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** pre-P0 · **TODO items:** PRE-001
**Done:** Created the full documentation system from the v2.0 plan: `CLAUDE.md` agent
entry point (source-of-truth hierarchy, session protocol, non-negotiables), this
changelog, and the `docs/` suite — README index, ROADMAP (P0–P12 with exit-criteria
checkboxes), TODO (all tasks across all surfaces with stable IDs), DECISIONS (D1–D16
record + process), BEST-PRACTICES, GLOSSARY, architecture, security-safety-legal,
risk-register, and 16 implementation-level system docs under `docs/systems/`
(contract, validation harness with a proposed check-ID catalog and diagnostic format,
five engines, generation pipeline, component DB, studio UI, gateway/data, compute
workers, hardware bridge, co-design, environments/courses, platform).
**Changed:** `CLAUDE.md`, `CHANGELOG.md`, `docs/README.md`, `docs/ROADMAP.md`,
`docs/TODO.md`, `docs/DECISIONS.md`, `docs/BEST-PRACTICES.md`, `docs/GLOSSARY.md`,
`docs/architecture.md`, `docs/security-safety-legal.md`, `docs/risk-register.md`,
`docs/systems/*.md` (16 files). The two FORGE planning papers are untouched and frozen.
**Decisions:** None new. Implementation details beyond the plan (check-ID scheme,
diagnostic JSON shape, route/job/package naming) are marked *(proposed)* in the system
docs and await confirmation at implementation time.
**Next:** Resolve PRE-002 — obtain `cad-object-studio.html` (the prototype / executable
specification) from the project owner and commit it; P0's byte-equivalence exit
criterion is impossible without it. Then begin P0: author the contract JSON Schema
(`P0-001`).
**Blockers:** PRE-002 — the prototype monolith is referenced everywhere but absent
from the repository.

## 2026-06-11 — FORGE planning docs added
**Session:** project owner (commit `3148dd2`) · **Phase:** planning · **TODO items:** none
**Done:** Initial commit: `docs/FORGE-vision-and-architecture.md` (v1.0 planning paper)
and `docs/FORGE-plan.md` (v2.0, decisions-complete — the binding plan). Repository
otherwise empty; no code exists yet.
**Changed:** `docs/`, `.gitignore`.
**Decisions:** D1–D14, D-r1, D-evals recorded inside the v2.0 plan §21.
**Next:** Stand up the documentation/working system (done in the entry above).
**Blockers:** none recorded.
