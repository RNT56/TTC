# Compute Workers (Python plane) — implementation doc

**Status:** Deterministic worker plane implemented across all families; native
Anthropic ETL and queued vendor normalization at contract/fixture maturity; exact
Modal training deployment controls and the D47 MJX decision contract are protected
at contract/fixture maturity, while credentialed GPU/provider proof remains gated · **Phases:** P3/P4 (ETL), P5
(photoscan), P6 (OCCT full), P7 (training), P11 (commerce) ·
**Home:** `workers/` · **Plan refs:** §5.2, §6, §8.3
(v3.0) · **Decisions:** D13 (refit acceptance), D16 (Python plane unmoved), D27
(fixture-first expansion), D36 (native ETL boundary), D38 (fault-bounded queue), D41
(task coordinate/version authority), D42 (multirotor v2/v3 correction), D44 (ground
trainer authority), D45 (offline source authority), D46 (Modal deployment authority),
and D47 (MJX decision authority)

## 1. Purpose

The Python 3.12 plane where the ML/geometry ecosystem's gravity is: TRELLIS, COLMAP,
trimesh, MuJoCo, OCCT bindings, SB3. Queue-driven processes with **no public network
surface** — they consume graphile-worker jobs and write results transactionally to
Postgres + object storage. GPU work may burst to a reviewed provider; successful
artifacts are content-addressed and reused while their owning retention policy permits.
No provider transport or cache key creates indefinite-retention authority.

## 2. Worker framework

Shared skeleton per worker: poll queue → claim job → validate payload against the
published JSON Schema (the inter-language contract — never hand-mirrored types) →
execute with structured progress events → write artifacts (object storage) + rows
(Postgres) in one transaction → ack. **Idempotent by construction**: jobs are safe to
retry; content-addressed outputs make replays cheap. Pinned dependencies; one
container image per worker family.

Live 2026-06-14: `workers/forge_workers/runner.py` imports and registers the
deterministic handlers used by the Docker Compose worker service. The gateway-owned
job table is the current queue contract for local P4-P12; the runner claims
`local`/`modal` jobs with `FOR UPDATE SKIP LOCKED`, records attempts/events, and,
under D38, assigns a per-attempt opaque token and expiry. The persisted timeout is
passed into command/network adapters and is also the result deadline; only the current
unexpired token may schedule a retry, fail,
succeed, or materialize output. Expired attempts can be reclaimed under a new token,
while stale/duplicate/cancelled completions are discarded. Successful artifact jobs are
materialized into the same sidecar tables as synchronous gateway fixture jobs.
Live adapters can be injected as JSON-stdin/stdout commands through
`FORGE_PHOTOSCAN_CMD`, `FORGE_COLMAP_CMD`, `FORGE_SB3_TRAIN_CMD`,
`FORGE_SYSID_FIT_CMD`, `FORGE_CODESIGN_CMD`, `FORGE_MUJOCO_PARITY_CMD`, and
`FORGE_MJX_BENCH_CMD`; commerce providers use `FORGE_VENDOR_REFRESH_CMD` and
`FORGE_PRINT_QUOTE_CMD`. Absent commands keep the deterministic fixture path as CI
truth for fixture-capable families. Queued `commerce.vendor-refresh` is deliberately
different: its handler requires `FORGE_VENDOR_REFRESH_CMD` at execution and fails the
job if it is absent, so a live-intent job cannot silently become inline fixture
truth. `workers/forge_workers/modal_app.py` provides an optional Modal entrypoint
without importing Modal on local/CI runs and now exposes JSON-serializable task
profiles for burst-GPU deployment planning.

SEC-006 bounds every injected command to 4 MiB JSON input, 8 MiB stdout, 256 KiB
stderr, and a configured 1-second to 8-hour timeout. Temporary files replace
unbounded pipes; timeout or overflow kills the process group; nonzero exit and invalid
output return generic errors without reflecting command stdout/stderr. Output must be
a bounded JSON object. Live deployment must additionally run non-root with filesystem,
CPU, memory, process, network, and device isolation; process bounds are not an OS
sandbox.

## 3. Worker families

### 3.1 `workers/etl` — catalog ingestion (P3-004, P4-015..017)
fetch manufacturer pages/datasheets/STEP → Claude extraction against the component
schema with **per-field source citations** (Batch API for bulk; smaller model tiers) →
hand off geometry to OCCT jobs → dedupe (brand, model, rev) → license-ledger entry
(non-optional) → low-confidence rows to the human review queue. **Nothing
auto-publishes.**

Implemented 2026-06-14: deterministic fixture ingest plus injectable source-fetch,
Claude-style extraction, and OCCT geometry adapter protocols. `etl.ingest-component`
can route source-bundle payloads through those adapters, and deployment-owned
commands can provide `FORGE_CLAUDE_EXTRACT_CMD` and `FORGE_OCCT_TESSELLATE_CMD`.
Fixture fetch/extract and envelope geometry fallback run in CI; HTTP and provider
transports fail closed unless deployment supplies a key/executor. HTTP source and
Modal adapters accept only credential-free HTTPS, exact hosts where configured,
public DNS answers, no redirects, explicit content types, 1..120-second timeouts,
and 1 KiB..8 MiB streamed responses. Application DNS validation still requires a
production egress firewall/proxy to close the connection-time rebinding gap.

Contract/fixture implementation 2026-07-13 (D36): after the injected fixture and
`FORGE_CLAUDE_EXTRACT_CMD` paths, the adapter may use deployment
`ANTHROPIC_API_KEY` for a native standard-library Messages API call. The endpoint is
fixed to `api.anthropic.com/v1/messages`; the key exists only in the header; API
version `2023-06-01`, model `claude-haiku-4-5-20251001`, and an 8,192-token ceiling
are pinned. The request is capped at 4 MiB, the response at 2 MiB, and the extracted
tool input at 512 KiB. A forced strict tool emits a provider-compatible
`canonicalRowJson` plus conflicts; local parsing then rejects non-finite, deep,
oversized, malformed, uncited, unlicensed, or structurally incomplete rows before
the sovereign catalog gate. Model/API/source-hash provenance survives into the
worker result. No credentialed sandbox request, provider billing/recovery evidence,
live review persistence, or live OCCT artifact is claimed.

### 3.2 `workers/occt` — B-rep truth (P3 tessellation; P6 DfM/STEP)
STEP I/O, fillets, exact tessellation → meshoptimizer LOD chain (≤ 800/≤ 150 tris);
DfM evaluation per process profile (feeds MFG-* checks); STEP/3MF export jobs with
the **license export filter** applied (D10).

Live 2026-07-13: `occt.tessellate` has a deterministic fixture handler that emits
stable object keys, mesh metadata, DfM report references, oriented 3MF export
references, print-profile metadata, and printed-part BOM rows for quote-link
handoff. D10 is enforced before fixture or external execution: every asset must carry
a compatible ledger record; assembly policy is derived from the most restrictive
asset; attribution binds a versioned license manifest; and restricted assets become
dimensioned envelopes with datum ports and BOM link-outs. External commands receive
the manifest/hash and must prove attribution embedding or restricted-geometry
exclusion; provider output is rebuilt from allowlisted fields. The live OCCT binding
and real generated artifact inspection remain behind the same task boundary for P6
DfM and export proof.

### 3.3 `workers/photoscan` — image → 3D (P5)
background removal → TRELLIS-class single-image reconstruction (or COLMAP multi-view
when N is large) → manifold repair → decimation → **primitive refit** with the D13
acceptance metric (≥ 70 % fit coverage, Hausdorff ≤ 1.5 % of bounding diagonal, else
mesh-class) → candidate component for the browser alignment UI. SLO: < 5 min
photo → parametric part on burst GPU; cache permanent. Photos grant processing
rights only (privacy rules in [`security-safety-legal.md`](../security-safety-legal.md) §5).

Live 2026-06-14: `photoscan.single` and `photoscan.multiview` handlers produce
stable cache keys, stage records for background removal, reconstruction,
manifold-repair, decimation, and primitive refit, D13 fit coverage/Hausdorff
metrics, COLMAP-style view graph metadata for multiview bursts, candidate component
summaries, owner-review flags, and alignment hints. Materialized scan artifacts can
now receive owner alignment patches for known scale, principal axis, and structured
ports through the gateway/Studio editor path.
Fixture CPU mode is the CI default. `FORGE_PHOTOSCAN_CMD` and `FORGE_COLMAP_CMD`
can replace fixture reconstruction with a live external stack while preserving the
same output shape. Command results are normalized back into permanent cache
metadata, D13 acceptance/reject reasons, pipeline stages, and SLO evidence; missing
fit/Hausdorff metrics fail closed to mesh-class review. Modal is available only
through an injected adapter when configured; the Modal profile pins 300 s timeouts,
GPU use, permanent-cache requirements, and the live command env for each photoscan
path.

### 3.4 `workers/training` — RL + system ID (P7/P8)
`train.policy` (MJCF → SB3 PPO/SAC → ONNX + scorecard — details in
[`learning-engine.md`](learning-engine.md)); `train.sysid-fit` (bench pulls/logs/step
responses → fitted Kv/R_int/time-constants/friction → sim-block update proposal);
`replay.verify` (server re-verification of replay tapes for official
scorecards/leaderboards — anti-cheat hygiene under D17);
`codesign.evaluate` (tier-2/3 rollouts for P9; MJX batching when the P7-010
benchmark demands; tier-0 runs in the gateway via the native `forge-validate`
binary, not here).

Live 2026-06-14: fixture handlers exist for `train.policy`, `train.sysid-fit`,
`replay.verify`, and `codesign.evaluate`. They emit deterministic ONNX/scorecard,
system-ID, replay verdict, and Pareto candidate metadata so the gateway and studio
can exercise the product surfaces without SB3/MuJoCo/GPU dependencies in CI.
`train.policy` now also emits task metadata, domain-randomization settings, and an
ONNX I/O header; `train.sysid-fit` estimates internal resistance and emits a
contract patch proposal. `FORGE_SB3_TRAIN_CMD` can supply live SB3 results, but the
worker re-runs every external policy through the scorecard/export gate before
marking ONNX exportable. Under D41/D42, versioned external policies must also exact-match
the worker-owned task ID, suite/version, Y-up frame, ordered targets, canonical task
hash, scorecard task/hash lineage, ONNX task header, and the declared tensor major/layout;
any missing or substituted authority holds export. Under D45,
`FORGE_OFFLINE_RL_CMD` receives a worker-owned `jobKind=train.offline-bc` envelope and
can return either the legacy held warmstart envelope or a normal policy. Policy
results are exportable only when the worker independently reconstructs the exact
source-bound dataset, verifies the warmstart parameter digest and both frozen BC/PPO
curriculum stages, and the unchanged scorecard passes. The native
`forge_workers.training.offline_runner` supplies that controlled path; caller job-kind,
recipe, tape, hash, snapshot, and external-summary substitution fail closed.
`FORGE_SYSID_FIT_CMD` can supply live system-ID
results in the same artifact contract; external fits must include enough samples, an
accepted fit, and a non-empty sim patch before the worker marks them accepted.
`FORGE_MJX_BENCH_CMD` can supply P7-010 benchmark rows; the normalized report
requires D12 quad, D12 rover, and legged coverage, then adopts MJX only when CPU
MuJoCo/SB3 needs help, parity stays inside frozen bands, and cost-normalized
throughput is at least 3x.

Under D59, `FORGE_CODESIGN_CMD` no longer gains authority by returning a dictionary
with `artifactKind=codesign`. The worker requires
`forge-codesign-evaluation/1.0.0`, reapplies every bounded replace-only patch to the
exact Gateway-owned admitted snapshot, recomputes candidate/patch/native-evidence
SHA-256 values, recomputes the admitted-only Pareto front, and exact-checks source,
engine, tier, metric, runtime, and permanent nonclaim fields. The repository-owned
`python -m forge_workers.codesign_runtime` is a 3–9-candidate controlled smoke:
native `forge-validate codesign-evaluate` plus Rapier 0.33.0, then training-bundle
2.0.0 plus two estimator-only 200-step MuJoCo 3.9.0 rollouts. It never runs CMA-ES,
Optuna, catalog-choice search, 200 candidates, or tier-3 training. Use
`pnpm codesign:engine-smoke`; add `--require-tier0-budget` only with the release
validator binary when recording the <50 ms latency proof.

Under D60/D63, `python -m forge_workers.codesign_search` is a separate proposal-only
planner, not a `codesign.evaluate` result and not a new queue kind. It requires one
exact Gateway-owned admitted inline-multirotor snapshot and exactly 200 proposals,
refuses extra request fields, and applies the shared byte/depth/node JSON boundary
before algorithm execution. It then runs pinned `cmaes==0.13.0` for 100 continuous
proposals and `optuna==4.9.0` TPE for 100 mixed profile/continuous proposals. It
freezes source revision, worker-manifest digest, seed, constraints, manifold,
replace-only patches, and candidate/patch hashes. V2 additionally binds exact OS,
Python, NumPy distribution/build/CPU/BLAS/LAPACK, and optimizer distribution RECORD
authority in `forge-codesign-search-plan/2.0.0`;
`p9-search-plan-evidence/2.0.0` adds the exact checkout and clean marker. Cache keys
are runtime-partitioned and foreign-runtime replay is refused. The acquisition is
bounded diversity only. No validator,
Rapier, MuJoCo, physical constraint, admission, Pareto, overnight engine result,
trained finalist, catalog choice, provider, build, hardware, or field authority is
created. Run `pnpm codesign:search-plan`.

D61/D63's separate `python -m forge_workers.codesign_batch` consumer accepts only
that exact v2 plan and snapshot. It retains one contiguous 200-ordinal prefix,
atomically checkpoints every candidate, fences interrupted attempts, proves zero-
dispatch cancellation, and runs native/Rapier/eligible-MuJoCo evidence before
complete-only admission, Pareto, and three tier-3-held finalists. Engine-batch v2
copies the full proposal runtime authority into source, binds its hash into every
candidate and cache key, and records `resumePolicy=exact-proposal-runtime-authority`
with heterogeneous resume false. `pnpm codesign:engine-batch` exercises 7 + cancel +
193 recovery. `pnpm codesign:platform-compare` compares all 200 lineages from two
clean same-revision plan artifacts without authorizing cross-runtime cache or tier 3.

The repository also owns a native controlled command,
`python -m forge_workers.mjx_benchmark`, and the required
`pnpm sim:mjx:feasibility` wrapper. It reuses the admitted-model/Rust training-bundle
authority, exact-pins MuJoCo/MuJoCo-MJX 3.9.0 plus NumPy 2.5.1 and JAX/JAXLIB 0.10.2,
compares native multithreaded MuJoCo with synchronized JIT-compiled MJX over one
frozen float64 batched protocol, and records source/request/contract/MJCF/runtime/
hardware identity with measured parity and throughput. Its only morphology is the
controlled `p7-hover-multirotor` reference on the available backend. The report must
remain decision-ineligible until clean protected D12 quad/rover/legged accelerator,
overnight/tier-2 budget, and cost evidence exists; a CPU feasibility run never
promotes this command into a deployed GPU worker.

D47's separate decision command is
`python -m forge_workers.mjx_decision_benchmark`, normally invoked through
`pnpm sim:mjx:decision` and [`../MJX-DECISION.md`](../MJX-DECISION.md). It accepts
only internal `mjxDecisionRequest` 2.0.0: exact ordered quad/rover/legged proxy
contracts and authority hashes, clean protected source, the unchanged float64
protocol/pins, one scorecard/200-candidate CPU budget artifact per row, a retained
current USD/hour source, and a requested GPU/TPU device with fallback forbidden.
The wrapper owns all contract and authority paths. The worker refuses CPU/Metal or a
different device before timing, then compiles each Rust bundle, measures native and
MJX rows, binds MJCF and evidence hashes, computes cost-normalized throughput, and
returns the centralized `mjx-benchmark` 2.0.0 verdict. Registry identity makes the
D12 rows named simulation proxies, not exact SKU twins. v1 remains the required CI
harness; v2 remains an operator sandbox gate and cannot close from fixtures.

Protected through PR #64/`d1c4c38` on 2026-07-15: the repository supplies a native
`FORGE_SB3_TRAIN_CMD` target rather than only an injection hook. The gateway freezes
an owned admitted contract as `forge-admitted-model-snapshot` 1.0.0; the worker
verifies its exact bytes/hash, invokes the validator's sovereign
`training-bundle` command; D42's current boundary accepts only
`trainingMuJoCoBundle` 2.0.0 with policy tensor 2.0.0 and contract-derived tilt/yaw
authority. The native
runner executes real seeded PPO or SAC in a Rust-derived MuJoCo hover environment,
evaluates baseline plus mass/Kv/wind robustness scenarios, and exports a digest-bound
fixed-shape opset-18 ONNX graph with scorecard and lineage. The required CPU stack is
exact-pinned to NumPy 2.5.1, Gymnasium 1.3.0, PyTorch 2.13.0, Stable-Baselines3
2.9.0, ONNX 1.22.0, and MuJoCo 3.9.0. Required CI runs both the complete worker suite
and a tiny clean-source training smoke; that smoke is runtime proof, not a passing
policy or overnight-SLO claim.

Protected 2026-07-15 through PR #70/`f220d25` for the P7-014 waypoint slice: the
native runtime is generalized only to worker-owned `hover-hold` and
`waypoint-chain` task-v2 definitions. It
sequentially advances waypoint targets from estimator error, requires full-chain
completion in evaluation, includes task identity/hash in config, ONNX metadata and
scorecard lineage, and rejects gate/rover/legged or drifted-frame/task shapes. The
required training smoke now runs both tasks for 256 PPO steps and retains two honest
blocked scorecards. Clean artifact `8342801418` binds them to exact protected source.
This historical artifact is controlled CPU runtime proof, not P7-012's later
overnight learning quality, deployed GPU operations, or broader-archetype closure.

P7-012's implementation is protected through PR #72/`8e094c0` and its retained
evidence through PR #73/`6bfa60f`. It advances new jobs to `p7-v3`/3.0.0 and tensor
2.0.0. The worker fixes Forge Y-up angular-axis decomposition, exposes estimator-
derived body velocity, interprets policy outputs as normalized flight targets around
contract hover trim, and binds the inner loop and reward into the task definition.
`p7-overnight-v1` freezes an estimator-only controller-distillation plus randomized
PPO curriculum and the unchanged scorecard grid. The resumable evidence command
writes atomic per-task JSON/ONNX checkpoints, reuses only a matching request hash and
valid size/digest/export gate, and retains safe hardware/runtime/wall-time/host-energy/
cost/nonclaim metadata. Clean protected-source execution intentionally interrupts
after hover, validates and reuses the atomic checkpoint, then passes waypoint. Exact
JSON/ONNX files and their hashes are retained under `docs/evidence/p7-012/`. This
closes controlled consumer-hardware simulation quality, not deployed GPU or field proof.

Protected P7-014 under D44 adds an independent ground path rather than
relabeling flight actions. `forge-validate training-bundle` emits
`groundTrainingMuJoCoBundle` 1.0.0 for admitted rover/quadruped contracts only. Rust
owns the floating-root MJCF, explicit flat plane, computed mass/inertia, equal rover
wheel radius/track, bounded joint order, and explicit torque/velocity ceilings.
Python independently verifies the exact bundle and dynamic
`forge-ground-policy-tensor` 1.0.0, then runs `line-follow` or `walk-to-target` under
`p7-ground-v1` with estimator/encoder observations, bounded differential or per-joint
torque, mass/torque/friction robustness, and simulated-positive-mechanical-work
energy semantics. Missing authority, unsupported morphology/task, external MJCF,
task/path/hash drift, reordered joint channels, or model-byte substitution refuses.

The required smoke executes hover, waypoint, rover, and quadruped for
256 real CPU PPO steps apiece and verifies exact source/contract/task/tensor/ONNX
lineage. Studio explicitly rejects the ground tensor because browser ground playback
is not implemented. Exact implementation head `c0f3a8f` passed PR CI `29433820358`
and security `29433818798`; protected PR #75 squash `90b1691` passed post-merge CI
`29448974932` and security `29448974951`. Downloaded clean-source artifact
`8356753424` has JSON SHA-256 `20f0c25d…56ba`; independent ONNX parsing/checking
confirms all four exact byte counts, digests, layouts, task hashes, contract hashes,
optimizer updates, estimator-only inputs, and blocked scorecards. This closes P7-014
at controlled deterministic trainer maturity, not browser, device, or field maturity.

Required CI installs the separate `mjx` extra, runs the complete worker suite, then
retains `mjx-feasibility-evidence` after the real command. The smoke fails on runtime
pin drift, non-float64 JAX, request/source/hash drift, non-finite state, parity-band
failure, missing measurements, or accidental decision eligibility. The artifact is
measured evidence, not a committed golden.

The optional Modal app retains planning profiles for other families, but D46 makes
only `train.policy` deployable under this lane. With an explicit source revision it
constructs exact SDK 1.5.2 app/function identity, Python 3.12 image dependencies, one
L4, four CPUs, 16 GiB memory, 20 GiB ephemeral disk, `eu-west`, one single-use
container, zero provider retries, eight-hour ceiling, blocked network, restricted
Modal API access, and no function secrets. The submitting worker requires the exact
environment/function-version/source/contract hash, compiles the Rust training bundle
locally, projects only reviewed training controls plus the bundle across the provider
boundary, records the FunctionCall before waiting, and rejects result/device drift.
Arbitrary fields, model snapshots, and credential-shaped extras never enter provider
transport; an ambiguous persisted call reattaches by ID instead of spawning a replacement.
`codesign.evaluate`, photoscan, and offline-training profile presence does not inherit
this maturity. Real provider, billing, SLO, cancellation, retention/deletion, and
recovery evidence remain required by [`../MODAL-OPERATIONS.md`](../MODAL-OPERATIONS.md).

### 3.5 `workers/bridge` — config, recorder, supervisor (P8)
`bridge.config-diff` compiles deployment config diffs with physical-confirmation
metadata; `bridge.telemetry-ingest` turns captured samples into sorted replay tapes;
`bridge.supervisor-check` applies geofence, attitude/rate, battery, and kill-switch
checks with explicit 50 Hz advisory / 200 Hz supervisor rates. Live hardware write
and capture are D30 lab-gated: accepted `d28.hardware` signoff, lab-mode env, local
provider, D12 rig ID, physical confirmation, and lab adapter are all required.
QA-007 bounds all three JSON inputs. D48 narrows bridge-config v1 to Betaflight
2025.12 on the D12 quad, exactly one integer `failsafe_delay` from 2 through 200
deciseconds, canonical ordered-line SHA-256, physical confirmation, and no auto-arm;
the Desktop independently revalidates it before native transport. Telemetry requires
finite unique timestamps and rejects non-finite nested state before hashing;
supervisor inputs require exact finite 3-vectors plus positive finite limits. Worker
fixture checks do not authorize, arm, or prove a physical hardware write.

D50's Desktop recorder is deliberately upstream of this worker boundary. It stores
bounded, exact, contiguous serial-JSONL frames, a sparse index, and a completed replay
1.0.0 only after clean stop, but labels the result local serial integration with
device attestation, sharing, and training reuse false. `bridge.telemetry-ingest`
does not upgrade that provenance, and P7-009 continues to reject recorded-device
input. D55 adds only a read-only, two-pass, self-reported MSP identity observation;
because it is not bound to recorder start/end and is not cryptographic attestation.
D56 implements a signed acceptance-authority authorization and native bracketing proof
outside archive v1, but that proof deliberately keeps recorded-device/training false.
Workers must continue rejecting recorded-device input until a later reviewed gateway
format plus consented materialization explicitly owns it; D56 intentionally does not.

### 3.6 `workers/maintenance` — lifecycle twin (P12)
`maintenance.estimate-wear`, `maintenance.crash-forensics`,
`maintenance.repair-sheet`, and `maintenance.fleet-summary` compute motor hours,
pack cycles, R_int estimates, crash windows, repair steps, reorder SKUs, and fleet
service summaries from deterministic telemetry/build payloads. Vendor and print
quote links are attached by the platform commerce APIs rather than direct carts.
Under D57, crash forensics additionally emits `forge-ghost-overlay/1.0.0`: finite
strictly ordered actual/predicted SI position pairs are deterministically decimated
to at most 6,001 compact points across at most 600 seconds, with exact endpoints,
Euclidean divergence and a sparse seek index. Missing pairs disable geometry;
duplicate/non-finite/out-of-range time or an unsupported metric fails the job. This
internal output is visualization evidence only and keeps device, recorded-device,
and field verification false.

### 3.7 `workers/commerce` — provider handoffs (P11)
`refresh_vendor_offers` normalizes provider rows into priced, provenanced,
rate-limited offers and holds malformed rows instead of persisting partial purchase
truth. `request_print_quote` requires DfM-passing 3MF/profile artifacts before it
normalizes print-service quote links, and every offer carries off-platform checkout
terms. The gateway tables/routes own enqueue authority and synchronous sandbox
links; the worker owns the only provider-command shape normalization path.

`commerce.vendor-refresh` is registered with the queue runner. It bounds execution
to 120 seconds and output to 50 offers; accepts only bounded component/vendor/SKU,
finite nonnegative price, three-letter currency, normalized availability, public
credential-free HTTPS offer/provenance links, bounded rate limits, and sanitized held
rows. `PostgresQueueStore` repeats these checks, bounds top-level provenance, and
inserts all accepted rows in the same transaction that marks the job successful.
If revalidation fails, that transaction rolls back, the queue runner records a
bounded failed-job error in a separate transition, and polling continues with no
offer inserts. An empty accepted set may succeed with held diagnostics; it is never a
purchasable-BOM claim.

### 3.8 `workers/mujoco_parity` — required engine evidence (P6-010)

This direct JSON-stdin/stdout utility is an internal CI/maintainer proof surface, not
a public listener or queue family. `forge-validate` emits four source-revision- and
request-hash-bound MJCF scenes from the same canonical contracts Rapier executes. The
worker accepts at most 4 MiB total and 512 KiB per scene, requires the
generated-source marker and radian compiler declaration, rejects NUL, external
include/asset/plugin/file
references, malformed body names, non-finite values, and timestep/substep drift, and
refuses any installed engine other than exact MuJoCo 3.9.0. It independently
recomputes the canonical request SHA-256 and checks the compiled runtime gravity and
timestep before execution. It then echoes source revision, request hash, engine
version, and measured baseline metadata; the Node orchestrator verifies them before
the Rust comparator applies the unchanged parity bands.

The existing required `compute workers (Python)` job downloads the exact validator
from the Rust job, installs the full reviewed extras including `codesign`, runs the full Python suite, executes
real Rapier and MuJoCo for drop, pendulum, hover, and gait, and always uploads the
request, both baselines, and comparison. The keyless local full gate retains the
reviewed baseline fixture; `pnpm sim:parity:live` is the reproducible maintainer path.
It also runs the exact-source D60 200-proposal smoke. This proves a local/CI CPU
engine pair and deterministic proposal planning, not 200 engine candidates, SB3
training, GPU performance, provider operations, or field transfer.

Protected acceptance is complete through PR #60. Exact head `aa5b133` passed
CI `29383163191`/security `29383163204`; protected `c0f5172` passed post-merge CI
`29383489511`/security `29383489520`. Required worker job `87252899630` uploaded all
four files with protected source revision `c0f51726d09ebc28852b75f894266e2d2d78a7c3`,
request SHA-256 `66059445aae9ac24b4bd85abbff3bf71e38d355f3c2050d3e2df166db9e4103f`, exact
provider `mujoco-python-3.9.0`, matched timing, unchanged bands, and a passing report.

## 4. GPU burst policy

Burst-only: no idle deployed GPU. Job cost is metered to credits (D3), while provider
billing is independently reconciled and never inferred from product credits. Shared
active-job and UTC-day credit caps live in Postgres; an idempotent new job debits once,
and owner cancellation reverses that debit only before artifact materialization.
Cancellation releases active capacity but never subtracts the launch from the daily
ceiling because provider billing can still arrive later.
Lagged provider cost enters authority only through the operator reconciliation
transaction's exact call/report/amount binding; same-input replay is idempotent and a
conflicting report or amount fails closed.
Recovery exhaustion retains the unresolved call as `submitted` with no fabricated
provider-completion time, so operators can reattach or terminate that exact identity.
Content-addressed reuse is a secondary cost control, subject to lifecycle policy. The
fixture adapter is the default. D46 Modal execution requires the complete reviewed
deployment identity and remains disabled otherwise; contract tests are required CI,
while a credentialed run is explicit protected-revision acceptance evidence, never an
optional smoke presented as live truth. D43 separately allows CPU PPO on a declared GPU-capable
consumer host when a same-workload exact-host pilot shows the MLP policy is faster
on CPU; the accelerator is inventoried but never claimed as the training backend.
MPS and CUDA diagnostics forbid fallback. Modal contract/fixture controls are tested
in CI, but performance, provider billing, alerts, deletion, cancellation, and recovery
are proved only by the exact P7-013 sandbox suite.

## 5. Dependencies

Postgres (queue + rows), object storage, published contract JSON Schema, Anthropic
API (ETL), Modal client configuration for live GPU runs, the MJCF compiler output
from `forge-sim`.

## 6. Testing

Golden-fixture jobs per family in CI (small datasheet → expected row; tiny mesh →
refit verdict; micro-task → learning-signal smoke); idempotency tests (run twice,
one result); poison-payload handling; cache-hit tests. SEC-006 negative tests cover
private/reserved/host-drift URLs, redirects, content and response ceilings, bounded
JSON depth/non-finite values, command-secret non-reflection, and output-overflow
process termination. Native ETL tests additionally assert exact endpoint/version/
model/tool choice, command precedence, secret-free JSON, delimiter containment,
strict-schema compatibility, local row validation, extraction provenance, missing or
duplicate tool rejection, captured-source-only provenance URLs, redirect/private-DNS
failure, and reflected-error redaction. See
[`../THREAT-MODEL.md`](../THREAT-MODEL.md).

Commerce persistence additionally runs
`python workers/integration/assert_commerce_postgres.py` in the protected Postgres
job. It proves a valid worker result commits job success plus one offer, while a
mixed valid/corrupt result rolls back job success and all offer inserts, then records
the job failed without stopping the runner.

QA-005 adds deterministic worker coverage for owner/request idempotency, bounded
retry, rate-limit hints, provider outage, process timeout, partial-object faults,
cancellation, max-attempt exhaustion, and persisted-timeout authority. Protected
Postgres acceptance in `workers/integration/assert_queue_faults_postgres.py` forces an
attempt lease to expire, reclaims it through a second store, rejects the stale first
result, materializes the winner once, and exercises outage recovery, rate-limit
exhaustion, partial recovery, and cancellation. It writes
`artifacts/e2e/qa005-fault-acceptance.json`; this is isolated deterministic fault
injection, not a production outage drill.

QA-007 registers 55 Python-consumed cases across replay, provider output, catalog
citations, D10 exports, and hardware payloads (within the 89-case cross-language
family). The suite materializes explicit non-finite sentinels only in memory, asserts
bounded provider JSON, finite `[0,1]` confidence, credential-free HTTPS citation
sources, most-restrictive export policy, command-token refusal, telemetry ordering,
and supervisor fail-closed behavior. The QA-007 landing passed 127/127 under Python
3.12; protected P7-014 waypoint history passed 154 tests. Protected P7-012 passes
163/163, including
exact tensor-v1/v2 fixtures, corrected multirotor semantics,
device authority, and interruption/resume/tamper evidence. Protected P7-014 ground
closure passes 174/174 and adds contract-derived rover/quadruped execution,
ground-tensor authority, outer-worker/ONNX validation, and fail-closed refusals. Credentialed
providers and physical adapters remain separate acceptance lanes.

P6-010 additionally tests request schema/version/source identity, exact engine pin,
contract-derived scene bounds, external-file refusal, missing-scene refusal,
timestep/substep identity, real four-scenario execution, and fail-closed baseline
capture. Required CI retains the complete engine evidence directory for review.

## 7. Phase mapping & backlog

P3/P4: ETL fixture, command, and native Anthropic contract paths exist
(P3-004, P3-010, P4-015..017); credentialed sandbox extraction, real-result
persistence, and live OCCT remain open. P5: fixture photoscan is live; full
TRELLIS/COLMAP remains adapter work. P6: fixture tessellation, DfM
metadata, D10 policy enforcement, and runtime sim helpers are live; full live
OCCT/STEP artifact proof remains open. P6 real CPU Rapier/MuJoCo parity is protected
through required PR and post-merge CI with retained source-bound evidence. P7:
versioned task definitions, fixture training scorecards, ONNX headers, and
`train.offline-bc` telemetry dataset ingestion are live; a controlled native CPU
SB3/MuJoCo hover runtime is protected through PR #64. P7-012's tensor-v2/task-v3
implementation and clean protected scorecard-passing evidence are closed through PR
#72/`8e094c0` and evidence PR #73/`6bfa60f`. The protected P7-009 D45 path executes
exact behavior cloning plus randomized PPO for flight and ground tensors, repeats
same-seed dataset/warmstart/ONNX hashes, and reuses the ordinary scorecard/export
gate. PR #77/protected `2c7562d`, exact PR/post-merge CI/security, the 23-migration
database/browser matrix, and independently checked clean artifact `8359446894` close
it at controlled-synthetic offline-training maturity; recorder/device/field telemetry
and deployed Modal/GPU runs remain open. P7-011 durable delivery is protected through
PR #68/`9131289`: the worker accepts ONNX bytes only in transient output, verifies/
uploads one exact owner content-addressed object under the current D38 lease, and
transactionally creates one byte-free job-bound policy. Clean artifact `8340587390`
proves stale/substituted/cancelled attempts cannot create authority and exact retained
bytes execute through the browser. Preserve that protected acceptance on changes; a
database-only object row, inline byte field, or successful upload without the winning
lease is not delivery proof. D40's real-waypoint dependency before overnight P7-012
is satisfied through protected PR #70/`f220d25` and artifact `8342801418`; P7-012 is
closed. P7-014's rover/quadruped implementation is closed through PR #75/protected
`90b1691` and independently checked clean artifact `8356753424`. P8: config-diff,
telemetry ingest, supervisor, sysid, and replay.verify fixtures are live. P9:
codesign.evaluate candidate/Pareto fixture is live. P12:
wear/crash/repair/fleet workers are live. Gateway fixture job creation materializes
matching outputs into `photoscan_artifacts`, `policy_artifacts`, `telemetry_logs`,
`replay_artifacts`, and `maintenance_records`; non-fixture jobs enter the same
Postgres queue and are executable/materialized by the local Docker Compose worker.
Photoscan result caches and policy ONNX outputs are linked through `object_blobs`
for durable S3/MinIO storage.

D34 withdrawal is authoritative over worker completion. Photoscan/training
withdrawal changes matching queued or running jobs to `cancelled`; the Postgres
worker clears the attempt lease and may mark success/failure and materialize output
only while the row is still `running` under the same unexpired token. A late result
from already-started compute is recorded as discarded and cannot overwrite
cancellation or enter artifact tables. This prevents the local
data-plane race but does not claim that an external provider can stop work already
in flight.

## 8. Open questions

Multi-replica queue capacity, heartbeat policy for tasks that legitimately exceed one
attempt deadline, dead-letter/reconciliation operations including unreferenced
content-addressed policy uploads, and queue SLOs; TRELLIS-class model pick and hosting
at P5 (the field moves fast — pin at implementation); live deployed Modal/GPU
training, real rover/legged environments, protected overnight scorecard/SLO
proof, MJX adoption evidence, and OCCT dependency/benchmark evidence; review queue
UI ownership beyond the existing gateway/studio scaffolds.
