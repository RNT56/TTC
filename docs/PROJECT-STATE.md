# PROJECT STATE - evidence snapshot and readiness boundary

Snapshot date: **2026-07-16**
Repository: `RNT56/TTC`
Runtime/security evidence anchor: `d952f60` (PR #31)
Latest verified protected runtime descendant: `1bf127d` (PR #100; D56 recorder custody)
Latest verified protected runtime/parity anchor: `1de7974` (PR #62; real browser policy runtime)
P7-003 controlled-training evidence anchor: `d1c4c38` (PR #64)
P7-010 controlled-MJX-feasibility evidence anchor: `0614272` (PR #66)
P7-010 decision-contract evidence anchor: `d19c911` (PR #81)
P7-011 policy-delivery evidence anchor: `9131289` (PR #68)
P7-014 waypoint-training evidence anchor: `f220d25` (PR #70)
P7-014 ground-training evidence anchor: `90b1691` (PR #75)
P7-014 evidence-reconciliation anchor: `f0bb4e2` (PR #76)
P7-009 offline-training evidence anchor: `2c7562d` (PR #77)
P7-013 deployment-control evidence anchor: `ff39cd8` (PR #79)
P8-012 native-serial evidence anchor: `fd26845` (PR #83)
P8-012 evidence-reconciliation anchor: `15c3be2` (PR #84)
D49 target/readback evidence anchor: `4647a10` (PR #85)
D49 evidence-reconciliation anchor: `63e144c` (PR #86)
P8-013 Desktop-recorder evidence anchor: `d8afe7f` (PR #87)
P8-013 evidence-reconciliation anchor: `225933a` (PR #88)
D51 recorder-import evidence anchor: `b5418ac` (PR #89)
D51 evidence-reconciliation anchor: `9e81ddd` (PR #90)
D52 recorder-control evidence anchor: `a8120ab` (PR #91)
D52 evidence-reconciliation anchor: `237e46b` (PR #92)
D53 recorder-materialization evidence anchor: `08d892f` (PR #93)
D54 recorder-admission evidence anchor: `f8efb6f` (PR #95)
D54 evidence-reconciliation anchor: `b4b5ad9` (PR #96)
D55 adapter-identity evidence anchor: `370d214` (PR #97)
D55 evidence-reconciliation anchor: `9e94c71` (PR #98)
D56 recorder-custody evidence anchor: `1bf127d` (PR #100)
P7-012 implementation anchor: `8e094c0` (PR #72)
P7-012 consumer-hardware evidence anchor: `6bfa60f` (PR #73)
QA-008 quality/governance evidence anchor: `2589503` (PR #36)
QA-002 browser-builder evidence anchor: `c80accb` (PR #38)
QA-010 external-acceptance evidence anchor: `8708de7` (PR #40)
QA-003 browser/accessibility evidence anchor: `9c1802b` (PR #42)
QA-005 fault-acceptance evidence anchor: `7970005` (PR #46)
QA-007 adversarial-corpus evidence anchor: `e89bb15` (PR #48)
QA-012 parity-reliability evidence anchor: `6f8509b` (PR #50)
Recovery/release gates: **G0 current acceptance restored; G1 historical release closed**

This document records current evidence. It is not the product vision and does not
replace the task or phase ledgers. Refresh it after any material change to CI,
releases, provider readiness, hardware proof, or phase status.

## 1. Executive state

ForgedTTC is an advanced deterministic engineering prototype with real implementation
across all architectural planes. Protected `main` has a green required baseline for
core, generation, WASM, gateway, Postgres, workers, packaging, dependency audits,
CodeQL, nightly coverage, and governed visual parity. QA-012 restored the full-Studio
WebGL parity path through protected PR #50 and exact-main nightly `29372161650`; the
downloaded artifact binds a clean checkout to protected `6f8509b` and passes all six
canonical scenes. Current G0 acceptance is restored, while published v0.1.0/G1
evidence remains valid.

The standalone validator v0.1.0 is now **released and independently install-verified**.
The broader ForgedTTC product remains **not production-ready or field-proven**: G0/G1
prove a trustworthy baseline and release, not live operations, external-user
acceptance, hardware safety, or field outcomes. Most P5-P12 product surfaces prove
contracts or fixture workflows; live providers, deployed training operations, hardware,
external users, operational recovery, and field evidence remain incomplete.

The native Anthropic ETL and queued vendor-normalizer paths are protected at
**contract/fixture**, not live. Their bounded transports, normalization, persistence,
and local validation are tested without a real credential or provider call. Sandbox
provider output, recovery/observability, billing, and current-terms evidence remain
open.

DOC-005 is complete through protected PR #53 at `22c263b`. Versioned
OpenAPI/event/artifact references exact-match 75 registered Fastify/TypeBox routes,
two event families, fourteen compatibility domains, and sixteen worker queue kinds,
with migration/deprecation guides and synthetic examples. The complete 36-step local
gate, exact-head PR CI `29375146614`/security `29375146592`, and post-merge CI
`29376742319`/security `29376742373` pass. This advances deterministic documentation
and compatibility evidence, not live-provider or broader product maturity. That is
the DOC-005 closeout snapshot; current protected `d8afe7f` additively verifies 77
routes, two event families, sixteen compatibility surfaces, and seventeen worker
families through the same drift gate. D50's protected recorder surface does not
change route/event/worker counts.

PR #54 exposed and closed a registry-protocol regression after npm retired the legacy
audit endpoints used by the pinned pnpm 10 client. This was not an advisory finding
and was never treated as a clean audit. pnpm 11.13.0 uses the replacement bulk-
advisory path and limits the three required dependency build scripts by exact package
version. Exact head `00ae9a0` passed CI `29378364147`/security `29378364143`, and
protected squash `41dee2d` passed post-merge CI `29378749550`/security `29378749542`.
Frozen install, low-severity audit, and the complete 36-step gate pass without
lockfile drift.

DOC-006's implementation is protected through PR #58 at `3078dba`: the canonical onboarding
contract and maintainer-only curation template are linked from contributor, support,
issue, pull-request, repository, and agent entry surfaces. Live unassigned issues
[#55](https://github.com/RNT56/TTC/issues/55),
[#56](https://github.com/RNT56/TTC/issues/56), and
[#57](https://github.com/RNT56/TTC/issues/57) prove the discovery, scope, mentor,
assignment, acceptance, and exclusion shape against protected `41dee2d`. These open
issues are process evidence, not evidence that an external contribution succeeded;
exact head `c83f036` passed CI `29379546230`/security `29379546201`, and the
protected squash passed post-merge CI `29380212006`/security `29380212007`.
Evidence reconciliation PR #59 exact head `47f4e3d` passed CI `29380952442` and
security `29380952454`; protected descendant `484aefa` passed post-merge CI
`29381316922` and security `29381316924`. DOC-006 is therefore closed without
turning its still-open seed issues into a contribution-success claim.

P6-010 and the deterministic P6 exit are protected through PR #60. Exact head
`aa5b133` passed CI `29383163191`/security `29383163204`; protected squash
`c0f5172` passed post-merge CI `29383489511`/security `29383489520`. Required worker
job `87252899630` retained a request and both real-engine baselines bound to protected
source revision `c0f51726d09ebc28852b75f894266e2d2d78a7c3` and request SHA-256
`66059445aae9ac24b4bd85abbff3bf71e38d355f3c2050d3e2df166db9e4103f`. Exact
MuJoCo 3.9.0 and Rapier passed all four contract-derived scenes at matched timing and
unchanged bands; this is engine/phase proof, not live training, broad external-corpus,
GPU, provider, hardware, or field evidence.

P7-008 is protected through PR #62. Exact head `2686d1a` passed CI `29387737921`
and security `29387737947`; protected squash `1de7974` passed post-merge CI
`29388166478` and security `29388166407`. A 906-byte digest-bound opset-18 hover
graph executes through exact `onnxruntime-web` 1.27.0/WASM against an 11-scalar Rust
estimator/powertrain observer under `forge-policy-tensor` 1.0.0. Both exact-head and
protected browser artifacts record 11/11 flows, a production bundle, real WASM,
completed hash/lineage-bound policy playback, and lazy same-origin ONNX JS/WASM
assets; Chromium, Firefox, and WebKit support acceptance also passes. This closes
fixture-grade browser execution, not a passing/deployed training service,
object-backed external model transport, hardware authority, or field transfer.

P7-008 evidence reconciliation is protected through PR #63. Exact head `9124427`
passed CI `29388759113` and security `29388759133`; protected squash `766f7b8`
passed post-merge CI `29389051743` and security `29389051735`. This is the latest
P7-008 evidence-only descendant and does not replace PR #62/`1de7974` as the owning
runtime/browser evidence anchor; P7-003 PR #64 remains the owning seeded-training
anchor, P7-010 PR #66 owns MJX feasibility, and P7-011 PR #68 is now the latest
verified runtime descendant.

P7-003 is complete through protected PR #64 at `d1c4c38`. The gateway owns and
freezes an admitted-model snapshot; the validator re-admits it and derives the exact
MuJoCo bundle from Rust truth; and the exact-pinned CPU worker executes seeded PPO or
SAC with estimator-only observations, executable randomization, four-scenario
evaluation, and deterministic fixed-shape ONNX export. Exact head `d81a03c` passed
CI `29393871628` and security `29393871650`; the protected squash passed CI
`29394580998` and security `29394580959`. Protected training artifact `8334594354`
self-binds to a clean `d1c4c38`, records exact runtime/lock/dependency/contract/
config/seed/parameter lineage, and contains a valid opset-18 `[1,11] -> [1,4]` graph.
Its 256-step scorecard is correctly non-exportable at zero success. This closes the
seeded PPO/SAC pipeline, not overnight learning quality, deployed Modal/GPU
operations, waypoint/general-archetype coverage, MJX, offline fine-tuning, external
acceptance, or field transfer; durable one-click delivery closed later under P7-011.

P7-010's controlled feasibility foundation is protected through PR #66. Exact head
`f72ef09` passed PR CI `29398735858` and security `29398735849`; protected squash
`0614272` passed post-merge CI `29399434491` and security `29399434519`. Retained
artifact `8337556569` self-binds to clean protected `0614272`, request SHA-256
`0d4bc68489bcb8fa44a17e193e3db918f022065b74221ff8aceed6b24ee73fc0`, exact
Python 3.12.13, NumPy 2.5.1, MuJoCo/MuJoCo-MJX 3.9.0, JAX/JAXLIB 0.10.2, the
admitted contract/MJCF, and the GitHub x86_64 4-CPU runner. Native multithreaded
MuJoCo measured 268,902 steps/s versus CPU-backed MJX at 54,698 steps/s; float64
parity passed with qpos/qvel absolute errors `3.42e-12`/`2.00e-11`. This is clean
protected harness/parity evidence, not an adoption decision: the report still blocks
missing D12 quad/rover/legged, declared accelerator, overnight/tier-2 budget, cost,
and cost-normalized throughput evidence.

PR #81 protects D47's separate P7-010 decision path without changing that v1
result. `mjxDecisionRequest`/`mjx-benchmark` 2.0.0 binds
exact ordered quad/rover/legged simulation proxies, checked-in D12/proxy authority
hashes, clean source, the unchanged float64 runtime/protocol, exact GPU/TPU device
with no fallback, 12-hour scorecard and 200-candidate CPU budget artifacts, and a
retained current USD/hour basis. The native worker measures all three sovereign Rust
bundles and applies the existing centralized rule; `docs/MJX-DECISION.md` owns its
operator and evidence procedure. The D12 registry bindings explicitly do not claim
exact SKU-level twins. Exact head `6c633d5` passed PR CI `29465812702`/security
`29465812703`; protected `d19c911` passed post-merge CI `29466150120`/security
`29466150113`. Downloaded protected artifact `8363066891` self-binds its clean v1
smoke to `d19c911` and remains decision-ineligible; it is protection/harness proof,
not the missing v2 result. No supported-accelerator/budget/cost result exists, and
this host exposes no Modal credential names, Modal CLI, NVIDIA device, or other
declared GPU/TPU authority. Apple's documented lack of JAX Metal float64 support
means the local M2 Pro is not an admissible substitute.

P7-010's evidence reconciliation is protected through PR #82 at `f91c339`. Exact
head `24f2e22` passed PR CI `29466626678` and security `29466626703`; the protected
docs-only descendant passed post-merge CI `29467326791` and security `29467326725`.
This verifies the D47 evidence ledger and does not replace `d19c911` as the owning
runtime/decision-contract anchor or supply the missing v2 accelerator result.

P7-011 is complete through protected PR #68. Exact head `433ff3b` passed CI
`29408733457` and security `29408733461`; protected squash `9131289` passed
post-merge CI `29409341830` and security `29409342305`. Downloaded artifact
`8340587390` self-binds source and checkout to clean `9131289`. Its sandbox-maturity
policy-delivery record proves one authoritative policy/object across two attempts,
stale-upload prevention, no inline persistence, exact readback, pre-upload digest-
substitution refusal with zero rows, and cancellation after upload with zero
database authority. The companion QA-002 record applies 22 migrations and passes
all 11 production-browser flows, including authenticated same-origin retrieval and
Rust estimator/motion execution of the exact retained 906-byte ONNX object; QA-003
passes full-Studio Chromium and viewer-grade Firefox/WebKit. This closes controlled
authoritative delivery, not P7-012 learning quality, P7-013 deployed GPU operations,
production object-store durability/SLO, OPS-006 orphan reconciliation, external
acceptance, or field transfer.

The P7-014 waypoint slice is protected through PR #70. D41 corrects the new task
line to `p7-v2`/2.0.0 with explicit
`forge-y-up-rh-m` and a canonical task-definition digest while retaining v1 as a
legacy read. The exact-pinned native command executes hover-hold or the three-target
waypoint chain, advances targets only from estimator error, requires full-chain
evaluation success, binds task/hash through config, ONNX metadata/header, scorecard
lineage, external-provider authority, and Studio playback, and refuses unsupported
task/archetype/frame drift. Exact head `b66e4b3` passed PR CI `29413578031` and
security `29413578124`; protected squash `f220d25` passed post-merge CI
`29415036211` and security `29415036274`. Downloaded artifact `8342801418` self-
binds to clean protected source `f220d25` and retains dual 256-step CPU PPO smoke
outputs: hover ONNX is 23,004 bytes with SHA-256 `5ff2fc01…16a7`; waypoint ONNX is
23,008 bytes with SHA-256 `f82dc08a…0a99`. Both scorecards are valid and correctly
non-exportable. This satisfies D40's executable waypoint prerequisite for P7-012;
it does not prove overnight learning quality, consumer-GPU economics, deployed GPU
operations, rover/legged coverage, external acceptance, or field transfer.

P7-012 is closed at controlled consumer-hardware simulation maturity through the
PR #72 implementation and PR #73 retained-evidence closeout. D42 advances the
current executable boundary to `forge-policy-tensor` 2.0.0 `[1,14]`,
`trainingMuJoCoBundle` 2.0.0, and `p7-v3`/3.0.0, correcting the under-observed
position policy, Forge Y-up angular-axis order, raw-torque/hover-trim mismatch, and
unbound reward/control semantics while retaining exact tensor-v1 ONNX/observer
execution. A frozen estimator-only controller-distillation plus conservative
randomized-PPO recipe passes unchanged scorecard gates at seeds 1201/1207:
both hover-hold and waypoint-chain score 1.0 baseline and 1.0 for mass +15%, Kv -8%,
and wind 4 m/s. Exact head `1bce0d1` passed PR CI `29425066833` and security
`29425066479`; protected implementation `8e094c0` passed post-merge CI
`29426237373` and security `29426237345`. Evidence head `ecc83d0` passed PR CI
`29428754530` and security `29428751871`; protected evidence `6bfa60f` passed
post-merge CI `29429475932` and security `29429476183`. From a clean protected
checkout, the evidence command intentionally stopped after atomically retaining
hover, then resumed by validating the frozen
request, byte count, SHA-256, and export gate before executing waypoint. The hover
task took 30.203 s and retained a 78,152-byte ONNX at SHA-256 `9afc1152…fc4c`;
waypoint took 10.340 s and retained 78,156 bytes at `b07b023a…b1a2`. All JSON/ONNX
files and their independent hashes are committed under `docs/evidence/p7-012/`.
D43 selects CPU after an exact-host 4,096-step MLP PPO pilot measured about 1.08 s
CPU versus 13.38 s MPS; the 19-core MPS device is inventory, not the execution
backend. The 140 W adapter-rating-times-wall-time host-energy fields are unmeasured
upper bounds (1.175 Wh and 0.402 Wh), local provider cost is zero, and electricity
cost is null. This is not deployed GPU, external-user, real-device, or field proof.

P7-014 is closed at controlled deterministic trainer maturity through PR #75 under
D44. It adds exact built-in rover `line-follow` and quadruped `walk-to-target`
execution without changing multirotor bundle v2, task v3, or policy tensor v1/v2.
Rust derives `groundTrainingMuJoCoBundle` 1.0.0, the explicit flat plane, computed
mass/inertia, wheel geometry, joint ordering/limits, and every torque/velocity
ceiling from the admitted contract. Python independently verifies the dynamic
`forge-ground-policy-tensor` 1.0.0 and `p7-ground-v1` task, trains only from noisy/
latent estimator and joint-encoder state, enforces the admitted torque ceiling,
evaluates baseline/mass/torque/friction, and labels `energyWh` as simulated positive
mechanical joint work. The required smoke candidate runs four real 256-step CPU PPO
jobs and retains valid but correctly blocked ONNX outputs. Studio explicitly refuses
the ground tensor because no browser ground observer/actuator exists. Exact head
`c0f3a8f` passed PR CI `29433820358` and security `29433818798`; synthetic merge
`623d392` had the exact protected parent and implementation head. Protected squash
`90b1691` passed post-merge CI `29448974932` and security `29448974951`. Downloaded
artifact `8356753424` self-binds to clean protected source `90b1691`; its JSON SHA-256
is `20f0c25d…56ba`. Independent decoding and ONNX checking confirms hover 23,874
bytes/`6b18908f…c555`, waypoint 23,878/`783753e3…4927`, rover 22,520/
`fa6c3cac…e4ad`, and quadruped 28,890/`b400ac71…8c2e`, with exact tensor/task/
contract metadata and blocked scorecards. The exact implementation head's complete
39-step local gate and the protected required matrix pass with 174 worker tests and
13 Studio runtime tests. Passing ground-policy quality, browser
playback, device transfer, external users, and field proof remain separate work.

P7-009 is closed at controlled-synthetic offline-training maturity through PR #77/
protected `2c7562d` under D45. The gateway accepts one consented owned log and
supported admitted model/task, injects the immutable tape, stable tape hash, and
admitted snapshot, and refuses fixture execution or caller-supplied training
authority. The native worker validates exact tape/task/tensor/sample/action
provenance, runs 12 behavior-cloning epochs plus 256 recipe-owned randomized PPO
steps, exports ONNX, and independently revalidates the dataset, warmstart digest,
two-stage curriculum, and ordinary scorecard at the outer command boundary. Exact
head `8cb70c4` passed PR CI `29455576345` and security `29455576393`; synthetic merge
`3bb877f` has exact protected parent `f0bb4e2` and implementation head. Protected
squash `2c7562d` passed post-merge CI `29456064537` and security `29456064498`.
The complete 40-step gate, 23-migration clean/every-predecessor Postgres matrix,
MinIO delivery, 11-flow real-browser suite, supported-browser/accessibility matrix,
188 worker tests, 65 gateway tests, 15 compatibility surfaces, and 17 generated
worker families pass. Downloaded artifact `8359446894` self-binds to clean protected
source; offline JSON SHA-256 is `d1fe7f7a…ac66`. Independent decode and ONNX checking
validate exact hover 23,874 bytes/`340090a8…7c25` and rover 22,520 bytes/
`c329ddc5…a05b`; both same-seed dataset/warmstart/model chains are exact, and both
short scorecards remain correctly blocked. This closure does not claim recorder/
device/field telemetry, learning quality, passing-policy delivery, transfer, deployed
GPU operations, or external acceptance.

P7-013's D46 deployment-control boundary is protected through PR #79 at `ff39cd8`.
It narrows Modal training to exact SDK 1.5.2 and one source-bound Python 3.12/L4
function with no provider retries, function secrets, egress, or CPU fallback. The
sovereign Rust bundle is compiled locally; every FunctionCall ID/attempt is persisted
before wait; D38 cancellation terminates provider work and rejects late output.
Migration 0024, the additive owner cancellation route, shared Postgres active/UTC-day-
credit quota, debit/refund authority, user-data export 1.4.0, strict sandbox-evidence
validator, and operator runbook are implemented and protected. Exact head `bc02324`
passed PR CI `29462960862`/security `29462960834`; protected `ff39cd8` passed CI
`29463344103`/security `29463344085`. Downloaded artifact `8362121226` binds the
24-migration Postgres/browser fixture matrix to the clean protected source. No
credentialed Modal call, deployment, L4 result, provider billing, delivered alert,
verified automatic provider-call expiry, or real recovery result is retained. P7-013
remains `[~]`; only the exact seven-day procedure in `MODAL-OPERATIONS.md` can close
it.

P8-012 closes D48 at protected deterministic/native serial-transport integration
maturity through PR #83 and `fd26845`. Worker and Desktop independently
accept only `forge-bridge-config/1.0.0` for Betaflight 2025.12, the D12 quad, and one
`failsafe_delay` integer from 2 through 200 deciseconds; exact ordered lines are
SHA-256 bound and no-auto-arm/physical-confirmation flags are mandatory. The native
path additionally requires the hardware-enable, D30-signoff, and lab-mode env gates,
the exact D12 quad ID,
115200 baud, and an OS-enumerated port before serialport-rs opens, writes, and
flushes. A real Unix pseudo-terminal test proves exact bytes. The versioned receipt
honestly marks target firmware and application unverified and requires operator
readback. Exact head `758fd9a` passed PR CI `29468611033` and security
`29468611094`; its reviewed tree is byte-identical at protected `fd26845`, whose
post-merge CI `29468966929` and security `29468966748` pass. This is not a real FC,
HITL, tethered, lab, or field result.

PR #84 protects the D48 evidence reconciliation at `15c3be2`; its reviewed tree is
byte-identical to exact head `4ad85ce`, post-merge CI `29476868373` and security
`29476868328` pass, and exact-main nightly `29476991042` passes. D49 is protected
through PR #85/`4647a10`: it leaves the D48 artifact unchanged but requires
props-off confirmation, one bounded stable Betaflight
`2025.12.x` identity before writing, exact set/save acknowledgement, reboot/reconnect
to the same OS path, the same reported firmware-identity hash, and one exact
`failsafe_delay` readback before receipt 2.0.0 can claim target/application
verification. The receipt binds the exact pre-version, set/save, post-version, and
readback response byte streams by SHA-256 for private evidence resolution. Six
locked Rust tests include a real two-session Unix pseudo-terminal protocol plus
wrong/ambiguous identity and readback refusal. Exact implementation head `f18185d`
passed PR CI `29479621677` and security `29479621689`; reviewed tree `dfa0007` is
byte-identical at protected squash `4647a10`, whose post-merge CI `29480132737` and
security `29480131433` pass. This is protected local protocol integration, not a
physical FC identity, lab, HITL, tethered, supervisor, or field result.

PR #86 protects that D49 evidence reconciliation at `63e144c`; exact docs head
`c1523c3` passed PR CI `29480985615` and security `29480985208`, reviewed tree
`c006acb` is byte-identical at the protected squash, and post-merge CI
`29481540556`/security `29481540540` pass.

PR #87 protects D50/P8-013 at local recorder-integration maturity. Exact
implementation head `5e668a1` passed PR CI `29485412948` and security `29485412987`;
reviewed tree `528a878` is byte-identical at protected squash `d8afe7f`, whose
post-merge CI `29486146093` and security `29486147436` pass. The Desktop accepts only
a new exclusive archive, D30/D12/consent/OS-enumerated 115200-baud input, and bounded
contiguous, strictly time-increasing `forge-telemetry-frame/1.0.0` serial JSONL. One
in-shell thread writes canonical append-only frames and a sparse byte-offset index,
drains on explicit stop, flushes/syncs, finalizes replay 1.0.0, hashes
frames/index/replay, and only then emits `forge-recorder-receipt/1.0.0`. Empty,
partial, malformed, drifted, over-budget, interrupted, concurrent, and overwrite
paths emit no success receipt. Eleven locked Rust tests include real pseudo-terminal
recorder round-trip, exact replay/index/hash assertions, drift refusal, exclusivity,
caps, and no overwrite. This is protected local capture-mechanics evidence with
user-owned/private/no-training/no-auto-arm defaults and
`recordedDeviceAttested=false`, not an adapter, physical device, OS suspend,
WebSerial/WebUSB, lab, field, ghost, system-ID, or training result.

PR #88 protects the D50 evidence reconciliation at `225933a`. Exact docs head
`9623c23` passed PR CI `29487091671` and security `29487091594`; its reviewed tree
is byte-identical at the protected squash, whose exact post-merge CI `29487715718`
and security `29487715678` pass. This remains the D50 reconciliation anchor; PR #89
below is the latest protected descendant and runtime change.

D51/P8-003 is protected through PR #89 at `b5418ac`. One read-only native command
admits exactly five canonical real archive-v1 files,
streams bounded frames and sparse index entries, verifies time/count/duration and
every expected sequence/time/byte offset, hashes frames/index, reconstructs the exact
replay-v1 digest, and matches the retained replay and receipt. Symlink, extra/missing,
unsupported/non-canonical, hash/index, and privacy/device-authority substitutions fail
closed. Studio uses exact Tauri API 2.11.1, sends only an absolute path, rejects any
response-field/version/numeric/authority drift, uploads no frames, and renders local
self-consistency with device/field/sharing/training nonclaims. Fourteen native tests,
sixteen Studio tests, all three declared browser engines, the clean dependency audit,
and the complete 40-step gate under Python 3.12.13 pass. Exact head `dcaed0f` passed
PR CI `29490845998` and security `29490846046`; reviewed tree `2d57349` is
byte-identical at protected `b5418ac`, whose post-merge CI `29491389298` and security
`29491389270` pass. This protects local archive inspection only; no authenticity,
adapter/device, materialization, lab, or field claim is made.

PR #90 protects the D51 evidence reconciliation at `9e81ddd`. Exact docs head
`4153406` passed PR CI `29492398120` and security `29492398122`; reviewed tree
`5785262` is byte-identical at the protected squash, whose post-merge CI
`29492938423` and security `29492938419` pass. It remains D51's reconciliation
anchor; PR #91 below is the latest protected descendant and runtime change.

D52/P8-003 is protected at local recorder-control maturity through PR #91/
`a8120ab`. Native shell state has exact `forge-recorder-control/1.0.0`
`inactive|recording|finished` semantics across webview reloads; Studio derives
contract/lockfile hashes and seed only from an active admitted report and requires a
D12 rig, explicit per-log consent, a new absolute archive path, one OS-enumerated
115200-baud port, and bounded sample rate before start. Native code independently
re-enforces D30/D12, consent, path, port, baud, hash, seed, and environment authority.
Stop returns the unchanged persisted receipt v1 or collects the recorder failure;
raw frames, upload/materialization, device/field verification, sharing, and training
reuse remain absent. Fourteen native and twenty Studio tests plus Studio typecheck
and build pass; all three declared browser engines and the complete 40-step gate pass
under Python 3.12.7 with 225 workers, 66 gateway tests, native/WASM parity, packaging,
training/offline/MJX smokes, and patch hygiene. Exact head `69db857` passed PR CI
`29495505253` and security `29495505262`; reviewed tree `25be1d3` is byte-identical
at protected `a8120ab`, whose post-merge CI `29496148793` and security `29496148796`
pass. This protects local control mechanics only, not object-backed materialization,
device/session identity, host suspend, lab/field, sharing/training, ghost, or
system-ID maturity.

PR #92 protects the D52 evidence reconciliation at `237e46b`. Exact docs head
`23e875a` passed PR CI `29496799162` and security `29496799206`; reviewed tree
`506f736` is byte-identical at the protected squash, whose post-merge CI
`29497768669` and security `29497768576` pass. The merged feature branch was deleted.

D53/P8-003 is protected at local private-object-integrity maturity through PR #93/
`08d892f`.
Desktop reruns D51 and returns only path-free upload-plan v1 identity/nonclaims plus
five exact file name/type/size/hash declarations. Native reqwest 0.13.4 streams sized
files to one configured HTTPS-or-loopback origin with redirects and default proxy
discovery disabled. The gateway stages five distinct private objects, migration 0025
retains the materialization, and completion HEAD-verifies all files plus bounded
manifest/receipt cross-bindings. Studio never receives raw frames and renders object
integrity separately from archive semantics. Focused native, gateway, account, and
Studio tests pass. The complete 40-step repository gate, clean/24-predecessor
Postgres matrix, 11-flow browser E2E, and three-engine browser matrix also pass under
Python 3.12.7. Exact head `5d1af49` passed PR CI `29501475412` and security
`29501475414`; reviewed tree `90d8cbf` is byte-identical at protected `08d892f`,
whose post-merge CI `29502180736` and security `29502180788` pass. D53 cannot set
archive semantics, create telemetry admission, or promote recorded-device/device/
field/sharing/training authority.

D54/P8-003 is protected at local sovereign archive-semantics admission maturity
through PR #95/`f8efb6f`. The gateway requires one owner-selected admitted model,
streams the exact five complete D53 objects with length/SHA-256 checks into mode-0600
files below a mode-0700 temporary root, invokes native `forge-validate recorder-
verify`, deletes the temporary root before persistence, and exact-binds the report to
the plan, object hashes, model, contract, and lockfile. Migration 0026 creates a
separate admission plus one bounded object-backed telemetry reference; D53 is not
updated. Export 1.6 and deletion include the new metadata, while D45 rejects the
reference from legacy offline training even when consent exists. Focused native
recorder tests pass 2/2, Gateway passes 73/73, Studio passes 26/26, and the dedicated
Postgres sovereign/nonclaim/training-refusal/export/deletion assertion passes. The
complete isolated database gate passes migration 0026 on a clean database and all 25
populated predecessors plus 11/11 production-browser flows, and the three-engine
browser-support matrix passes. The complete repository gate also passes all 40 steps
under Python 3.12.13 with 225 worker tests. Exact head `81282f7` passed PR CI
`29512245375` and security `29512245387`; reviewed tree `f71ee1a` is byte-identical
at protected `f8efb6f`, whose post-merge CI `29512921138` and security
`29512920367` pass. This protected boundary proves semantic self-consistency
only—not device/session authenticity, recorded-device/field provenance, sharing,
training, production object operations, suspend, lab, ghost, or system-ID maturity.

PR #96 protects the D54 evidence reconciliation at `b4b5ad9`. Exact docs head
`66f9a028702dcae9b3964734e811a3b91e6c678d` passed PR CI `29514004302` and
security `29514005968`; reviewed tree
`45ed82deb033193adbdc8c8032753c495baa5b01` is byte-identical at the protected
squash, whose post-merge CI `29515192093` and security `29515192052` pass. It was
the latest protected descendant before D55; PR #95/`f8efb6f` remains the D54 runtime
anchor.

D55/P8-002/P8-003 is protected at local read-only protocol-fixture maturity through
PR #97/`370d214`. One
native command uses exact `forge-recorder-adapter-probe/1.0.0` and
`forge-betaflight-msp-adapter/1.0.0` semantics, re-enforces D30/D12/props-off and an
OS-enumerated 115200-baud port, issues only MSP-v1 commands 1/2/3/4/5/160, and
requires protocol 0/API 1.47, `BTFL`, stable `2025.12.x`, target `KAKUTEH7`, exact
framing/checksum/command, a three-second bound, and two byte-stable identity passes
on one open port. Raw UID and responses stay native; Studio receives strict
domain-separated hashes and permanently false device/recorded-device/field/sharing/
training authority. Nineteen native and twenty-eight Studio focused tests pass,
including pseudo-terminal success plus checksum, identity, target, pass-stability,
field, command, and authority refusal. The locked Desktop native gate, complete
40-step repository gate under Python 3.12.13, clean/25-predecessor isolated database
matrix, 11-flow production-browser suite, and Chromium/Firefox/WebKit support matrix
also pass. Exact head `4321eaafd5d2c0ef60cf9f38cd1000d16d660668` passed PR
CI `29519984713` and security `29519984764`; reviewed tree
`673a50c94ecc17a2bd266542cd5f2c611d8a248b` is byte-identical at protected
`370d2140142d1f0cdbfde0625aa024d9b3bbfd81`, whose post-merge CI
`29520651520` and security `29520651581` pass. This is a self-reported protocol
observation, not cryptographic attestation, recorder start/end binding,
physical-device custody, host-suspend, lab,
or field evidence. Named hardware and trusted recorder-bound evidence remain pending.

PR #98 protects the D55 evidence reconciliation at `9e94c71`. Exact docs head
`46d792893be52f34be67cbdb2747c9619e49a09e` passed PR CI `29522780487` and
security `29522780670`; reviewed tree
`badc1acca924ba887a3c7c770cccf803b67de3c0` is byte-identical at the protected
squash, whose post-merge CI `29523361960` and security `29523361913` pass. The
remote evidence branch was deleted. PR #97/`370d214` remains the latest protected
runtime anchor before D56.

D56 is protected at local custody-fixture maturity through PR #100/`1bf127d`. Desktop
strictly verifies the hash-pinned purpose-limited public Ed25519 trust bundle and
at-most-eight-hour signed exact revision/evidence/signoffs/artifact/model/two-port/
D55 identity/nonclaim authorization, brackets a real pseudo-terminal telemetry
archive with independent start/stop D55 pseudo-terminal sessions, revalidates the
canonical D50 receipt/archive, and writes a create-new proof outside archive v1 with
the exact authorization-file and receipt digests. Identity, UID, descriptors, and
full D55 response transcripts must remain exact across both sessions; proof creation
time follows the post-stop observation.
Studio strictly parses and controls the separate path without exposing signature or
raw device material. Twenty-four native and thirty Studio tests cover strict crypto,
revocation/time/binding/identity/proof-overwrite refusal and valid-archive
preservation; locked fmt/Clippy, typecheck/build, Desktop checks, all 40 required
repository gates under Python 3.12.7, and 19-surface compatibility pass. A fresh
disposable Postgres/pgvector database passes migration 0026 from clean plus all 25
populated predecessors, every data-plane assertion, and all 11 production-browser
flows. Exact implementation head
`69c0dd79a66ac5fac4078bfe770cbecdf67c4091` passed PR CI `29530839367` and
security `29530839338`; reviewed tree
`de12c5ac06e4f1d360eabf924f8f41bc15209dd5` is byte-identical at protected
`1bf127d20a8d71b600c50159f18e49d7708f77ef`, whose post-merge CI
`29531470442` and security `29531470118` pass. The remote implementation branch was
deleted. This changes neither D53 nor D54 and remains an acceptance-
authority signature, not device cryptography, recorded-device, sharing, training,
lab, or field proof. Named-hardware execution, real trust-root operations, suspend
behavior, and EXT-004 remain pending.

D57/P8-004 is protected at local controlled-synthetic/unverified view maturity
through PR #102/`d33fd57980081e90990e2d4bb96a5c08dbe3c87b`. It introduces
internal `forge-ghost-overlay/1.0.0` with exact
Y-up/SI compact point order, finite/strict time and Euclidean-divergence validation,
≤600-second/100,000-source/6,001-render-point bounds, deterministic decimation, and
a sparse seek index. The keyless Gateway fixture represents 36,001 controlled-
synthetic 60 Hz samples as 6,001 points; the generic worker labels caller input
unverified. Studio independently rejects version/layout/value/index/authority drift,
precomputes observed/predicted X/Z tracks, and provides explicit 60 Hz play/pause and
frame steps while displaying device/recorded-device/field nonclaims. Focused Python
worker tests pass 33/33, Gateway passes 74/74, Studio passes 33/33, Studio
typecheck/build pass, and 19-surface compatibility passes. All 40 local repository
gates pass under Python 3.12.13 with 227 worker tests; a fresh disposable Postgres
database passes migration 0026 from clean plus all 25 populated predecessors and
every data-plane assertion; all 12 production-browser flows and Chromium/Firefox/
WebKit pass. Exact head `50abc922a4c695ee3100df6fdf381334d3f86e9a`, reviewed
tree `cc1d483919a799b565d0783b7258d90420d495af`, PR CI/security
`29536927436`/`29536927492`, protected-tree equality, and post-merge CI/security
`29537565069`/`29537565062` pass. Named-mid-hardware, real D54-to-twin, P8-014 and
EXT-008 evidence remain outstanding. Raw recorder frames remain in D53/D54 objects
and do not enter the maintenance payload.

## 2. Current verified results

| Check | Result | Interpretation |
|---|---|---|
| D57 protected local ghost view | Focused worker 33/33, Gateway 74/74, Studio 33/33, Studio typecheck/build, and 19-surface compatibility pass. The ten-minute fixture has 36,001 source samples, 6,001 render points, 601 seek entries, exact controlled-synthetic/nonclaim fields, strict Studio parser/refusal coverage, and indexed seek computation below the per-frame 60 Hz budget. All 40 local repository gates pass under Python 3.12.13 with 227 worker tests; a fresh clean/25-predecessor Postgres matrix, all 12 production-browser flows, and Chromium/Firefox/WebKit pass | proves protected local compact-artifact and interaction mechanics through PR #102 exact head `50abc92`, reviewed tree `cc1d483`, protected `d33fd57`, PR CI/security `29536927436`/`29536927492`, and post-merge CI/security `29537565069`/`29537565062`. Full render performance on named mid hardware, server-selected D54 replay/twin execution, device/recorded-device/field provenance, and real field evidence are not proven |
| D56 protected custody implementation | Desktop locked fmt/Clippy and 24/24 tests pass: three strict Ed25519/trust/time/revocation/binding suites plus two real two-role pseudo-terminal custody flows prove pre-open identity, live telemetry, clean receipt, post-stop identity, proof creation, substitution/no-overwrite refusal, and archive-v1 preservation. Studio typecheck/build and 30/30 tests pass with strict command/proof/nonclaim parsing. Desktop scaffold, locked native build, all 40 repository gates under Python 3.12.7 with 225 workers, and 19-surface compatibility pass. A fresh disposable Postgres/pgvector database passes migration 0026 from clean plus all 25 populated predecessors, every data-plane assertion, and 11/11 production-browser flows | proves protected local custody mechanics through PR #100 exact head `69c0dd7`, reviewed tree `de12c5a`, protected `1bf127d`, PR CI/security `29530839367`/`29530839338`, and post-merge CI/security `29531470442`/`29531470118`. The proof is outside archive v1 and means acceptance-authority signature plus self-reported identity continuity, with device cryptography, recorded-device, field, sharing, and training authority false. Real trust-root operations, named Kakute H7 V1.5, suspend, and EXT-004 remain open |
| D55 protected adapter identity | Desktop locked check and 19/19 tests pass, including real Unix pseudo-terminal two-pass identity and direction/command/checksum/target/stability refusal. Studio typecheck/build and 28/28 tests pass. All 40 repository gates under Python 3.12.13, migration 0026 on a clean database plus all 25 populated predecessors, every database assertion, 11/11 production-browser flows, and Chromium/Firefox/WebKit pass | proves protected local protocol-fixture maturity for a read-only self-reported MSP identity observation through PR #97 exact head `4321eaa`, reviewed tree `673a50c`, protected `370d214`, PR CI/security `29519984713`/`29519984764`, and post-merge CI/security `29520651520`/`29520651581`. Named hardware, cryptographic attestation, recorder binding, suspend, lab, and field proof remain pending |
| D54 protected recorder admission | Native focused recorder verification passes 2/2; Gateway passes 73/73 including streamed temp-file/model binding, exact current-blob-plan rebinding, retry idempotency, and report substitution refusal; Studio passes 26/26 including exact admission parsing and proof drift refusal; the dedicated Postgres assertion proves sovereign semantics, immutable D53 nonclaims, legacy-training refusal despite consent, export 1.6, deletion, and tombstoning. Migration 0026 passes a clean database and all 25 populated predecessors, all 11 production-browser flows and Chromium/Firefox/WebKit pass, and all 40 repository gates pass under Python 3.12.13 with 225 worker tests. Generated contracts describe 81 routes, 18 compatibility surfaces, 2 event families, and 17 worker families | proves protected local semantic self-consistency, exact object/model binding, bounded reference persistence, lifecycle coverage, and explicit nonclaims through PR #95 exact head `81282f7`, reviewed tree `f71ee1a`, protected `f8efb6f`, PR CI/security `29512245375`/`29512245387`, and post-merge CI/security `29512921138`/`29512920367`. It does not prove production object operations, device/session authenticity, recorded-device/field provenance, sharing/training authority, suspend, lab/field, ghost, or system-ID maturity |
| D53 protected recorder materialization | Desktop locked fmt/Clippy/tests pass 17/17, including a real loopback streamed five-file PUT and origin/header/hash substitution refusal. Studio typecheck/build and 25/25 tests pass, including sanitized plan/command binding, browser refusal, staged/completed response parsing, and authority drift. Gateway build and 70/70 tests pass, including owner-authenticated stage/list/complete and anonymous/substitution refusal. Migration 0025 passes clean install plus all 24 populated predecessors; user export/deletion/lifecycle, 11/11 browser E2E, all three browser engines, and all 40 repository gates pass under Python 3.12.7 with 225 workers and 17 compatibility surfaces | proves protected local path-free five-object transport, object metadata/readback binding, export/deletion coverage, and explicit nonclaims through PR #93 exact head `5d1af49`, reviewed tree `90d8cbf`, protected `08d892f`, PR CI/security `29501475412`/`29501475414`, and post-merge CI/security `29502180736`/`29502180788`. It does not prove production object operations, sovereign archive semantics, telemetry admission, device/session identity, suspend, lab/field, sharing/training, ghost, or system-ID maturity |
| D52 protected recorder controls | Desktop Cargo fmt/Clippy/build and 14/14 native Rust tests pass, including inactive/recording/finished state, webview-independent shell identity, explicit-stop error collection, strict request fields, new absolute path bounds, D30/D12/consent/port/hash authority, and invariant nonclaims. Studio typecheck/build and 20/20 tests pass, including exact bridge/port/status/start/stop commands, admitted-report-shaped request bounds, browser refusal, strict version/field/state/authority/receipt drift refusal, and start/stop identity substitution refusal. All three browser engines and all 40 local gates pass under Python 3.12.7 with 225 workers and 66 gateway tests | proves protected local control mechanics through PR #91 exact head `69db857`, reviewed tree `25be1d3`, protected `a8120ab`, PR CI/security `29495505253`/`29495505262`, and post-merge CI/security `29496148793`/`29496148796`. It changes no archive/receipt bytes, receives no frames, and proves no device/session identity, host suspend, gateway materialization, lab/field, sharing/training, ghost, or system-ID maturity |
| D51 protected recorder archive inspection | Desktop Cargo fmt/Clippy/build and 14/14 native Rust tests pass, including exact archive inspection plus frame/replay/hash, sparse-index offset, privacy/device-authority, unsupported-major, extra-entry, symlink, relative-path, oversized-metadata, and oversized-frame refusal. Studio typecheck/build and 16/16 tests pass, including exact command arguments, browser/path refusal, strict bounded response parsing, and version/field/numeric/authority drift refusal. The clean dependency audit, three-engine browser matrix, and complete 40-step gate pass under Python 3.12.13 with 225 workers, 66 gateway tests, 16 compatibility surfaces, generated 77-route/2-event/17-worker docs, native/WASM parity, packaging, training/offline/MJX smokes, and patch hygiene | proves protected local streaming self-consistency and the Desktop-only UI boundary through PR #89 exact head `dcaed0f`, reviewed tree `2d57349`, protected `b5418ac`, PR CI/security `29490845998`/`29490846046`, and post-merge CI/security `29491389298`/`29491389270`. It neither uploads/materializes logs nor authenticates a device/session; real adapter/device, suspend, lab/field, sharing/training, ghost, and system-ID evidence remain pending |
| P8-013 protected Desktop recorder | Desktop Cargo fmt/Clippy and 11/11 Rust tests pass; a real Unix pseudo-terminal feeds three exact versioned frames through the background thread into canonical frames, a two-entry sparse byte-offset index, replay 1.0.0, and exact frame/index/replay hashes. Focused tests reject unenumerated authority, consent/hash drift, non-contiguous sequence/time, oversized/empty/partial input, concurrent capture, and archive overwrite. The complete 40-step local gate passes under Python 3.12.13 with 225 workers, 66 gateway tests, 13 Studio tests, 16 compatibility surfaces, generated 77-route/2-event/17-worker docs, native/WASM parity, packaging, training/offline/MJX smokes, and patch hygiene | proves the protected local D50 archive/frame/receipt semantics and background capture mechanics through PR #87 exact head `5e668a1`, reviewed tree `528a878`, protected `d8afe7f`, PR CI/security `29485412948`/`29485412987`, and post-merge CI/security `29486146093`/`29486147436`. No real adapter/device identity, host suspend, WebSerial/WebUSB, lab, field, ghost, system-ID, sharing/training grant, or recorded-device attestation is claimed |
| D49 protected native target/readback | Desktop Cargo fmt/Clippy/tests pass 6/6; `pnpm verify:desktop-native`, the Desktop package contract, root Rust fmt/Clippy/tests, and the complete 40-step `pnpm verify` pass. Real Unix pseudo-terminals prove the two-session pre-write/version/set/save/reboot-session/readback protocol, exact receipt digests, response caps, and timeouts; focused tests reject wrong/duplicate identity, wrong/duplicate readback, target errors, command/hash/path drift, and unsafe bounds | proves the protected local bounded protocol and receipt 2.0.0 semantics only through PR #85 exact head `f18185d`, reviewed tree `dfa0007`, protected `4647a10`, PR CI/security `29479621677`/`29479621689`, and post-merge CI/security `29480132737`/`29480131433`. The D48 config artifact remains 1.0.0. No physical FC, device-unique identity, lab, HITL, tethered, supervisor, WebSerial, or field evidence is claimed |
| P8-012 protected native serial transport | PR #83 exact head `758fd9a` and protected `fd26845` retain the complete 40-step local gate under exact Python 3.12, 225/225 workers, 66/66 gateway with the real validator, 15/15 compatibility surfaces, the governed 14-case hardware corpus, generated 77-route/2-event/17-worker docs, Desktop native Cargo check, locked Desktop fmt/Clippy, and 4/4 Rust tests including exact bytes over a real Unix pseudo-terminal plus OS-enumerated-path refusal | proves D48 producer/consumer/native transport and the honest receipt at protected deterministic integration maturity. PR CI `29468611033`/security `29468611094` and post-merge CI `29468966929`/security `29468966748` pass. Target-version handshake, post-write readback, real FC, HITL, lab, and field evidence are not claimed |
| P7-013 protected deployment control | PR #79 exact head `bc02324` and protected `ff39cd8` pass the exact Python 3.12 40-step gate: 218/218 workers, 65/65 gateway with the real validator, 15/15 compatibility surfaces, 77 generated routes, 17 worker families, 24 migration sources, and all native training/offline/MJX smokes | proves D46's contract/fixture and fail-closed CUDA/deployment/call/quota/cancellation/refund/recovery boundaries. Exact PR CI `29462960862`/security `29462960834` and post-merge CI `29463344103`/security `29463344085` are green; no deployment, credentialed L4 call, provider billing, delivered alert, automatic provider expiry, real recovery drill, or production result is claimed |
| Git state | latest verified protected runtime anchor is D56 recorder custody `1bf127d`. D55 evidence `9e94c71`/runtime `370d214`, D54 evidence `b4b5ad9`/admission `f8efb6f`, D53 materialization `08d892f`, D52 evidence `237e46b`/controls `a8120ab`, D51 evidence `9e81ddd`/runtime `b5418ac`, D50 evidence `225933a`/recorder `d8afe7f`, D49 evidence `63e144c`/target-readback `4647a10`, P8-012 evidence `15c3be2`/serial `fd26845`, and all listed P7/QA/DOC/release anchors remain green; annotated `v0.1.0` is published | PR #100 exact implementation head `69c0dd79a66ac5fac4078bfe770cbecdf67c4091` passed CI `29530839367`/security `29530839338`; reviewed tree `de12c5ac06e4f1d360eabf924f8f41bc15209dd5` is byte-identical at protected `1bf127d20a8d71b600c50159f18e49d7708f77ef`, which passed post-merge CI `29531470442` and security `29531470118`. The remote implementation branch was deleted |
| Rust toolchain | pinned 1.96.0 locally and in workflows | local/CI compiler contract is explicit |
| JS supply-chain client | pnpm 11.13.0 protected through PR #54; frozen install and `pnpm audit --audit-level low` remain binding, and all 40 gates pass without lockfile drift | replaces npm's retired legacy audit protocol with bulk advisories and fails closed on all dependency build scripts except the version-exact reviewed entries; exact PR and post-merge security for Modal 1.5.2 and the complete training runtime are green |
| `pnpm verify` | protected D56 PR #100/`1bf127d` passes all 40 required gates under Python 3.12.7 | generated contract-doc drift, migration policy, external acceptance, registered golden updates, Action pins, Rust fmt/Clippy/tests, WASM/schema/TS, 30 Studio tests, 73 gateway tests, Brief-25 25/25, oracles, budgets, the governed 89-case boundary family, sim, packaging, pilots, 225 worker tests, four-task/offline/MJX smokes, and patch hygiene pass. Nineteen compatibility surfaces and 81 generated routes verify at the protected D56 tree |
| Golden artifact and parity-harness review | protected through PR #53 with 16 governed artifact families and 19 focused policy tests | the DOC-005 schema family joins the protected registry; nine parity tests pin source identity/clean checkout, isolation, full-Studio WebGL readiness, non-retryable configuration failure, one bounded renderer retry, viewer-fallback refusal, and low-tier WebGL capture. No existing registered artifact, golden, camera, metric threshold, or draw-call budget changed |
| External acceptance policy | QA-010 complete through protected PR #40: 8 milestone contracts/templates and 9/9 focused tests pass locally and in required CI | versioned builder/photoscan/training/course/lab/print/marketplace/maintenance scripts require exact revision/environment, role separation, authority, evidence kinds, measurements, findings review, signoffs, and honest pass/fail/stop outcomes; this is evidence governance, not an `EXT-*` result |
| `pnpm verify:compatibility` | protected D56 PR #100/`1bf127d` passes 19/19 surfaces against policy 1.0.0 | recorder custody adds one additive governed surface covering exact trust-bundle, authorization, and proof versions while preserving every recorder archive/materialization/admission, policy tensor, gateway API/event, source, manifest, legacy, license, user-data, consent, lifecycle, and deprecation boundary |
| DOC-005 contract documentation | closed through protected PR #53 at `22c263b`; the current protected D56 reference verifies 81 runtime routes, 2 event families, 19 compatibility surfaces, and 17 worker families | D56 adds no route/event/worker family; it registers the Desktop custody surface and keeps generated documentation drift-checked |
| DOC-006 contributor workflow | complete through implementation PR #58 at `3078dba` and evidence PR #59 at `484aefa`: canonical onboarding, maintainer-only curation, linked entry surfaces, sensitive-authority exclusions, assignment/reassignment rules, and three live seed issues | all 69 Markdown files resolve locally, issue-form YAML parses, #55-#57 remain correctly labeled and unassigned, all 36 local gates pass, and exact PR/post-merge CI/security are green; no external contribution outcome is claimed |
| `cargo test --workspace` | pass | includes quadruped slider-grid and pinned golden coverage |
| Declared first-party verdicts | pass: 5/5 | qd-mini is admitted again without changing the expected verdict |
| Brief-25 real-validator gate | pass: 25 admitted, 0 draft/rejected/blocked | exceeds the binding 20/25 threshold with 0 repair iterations |
| Gateway tests | protected P8-012 passes 66/66 with the real validator locally and in exact PR/post-merge CI | the D48 fixture adds one exact cross-language schema/firmware/line/hash oracle while preserving every D46 deployment/quota/cancellation and prior gateway boundary |
| Worker tests | protected P8-012 passes 225/225 under Python 3.12 locally and in exact PR/post-merge CI | D48 adds exact field/firmware/mixer/setting/range/hash authority and representative refusal coverage while preserving every prior training/offline/MJX/deployment test |
| P7-012 implementation tests | protected through PR #72/`8e094c0`; all 39 local gates and exact-head/post-merge CI/security pass | 163/163 workers, 12/12 Studio runtime tests, tensor-v2/task-v3/bundle-v2 authority, exact tensor-v1 execution, Y-up/velocity/action/reward regressions, CPU/MPS no-fallback authority, atomic interrupt/resume/tamper evidence, dual-task smoke, MJX parity, and patch hygiene are protected |
| P7-003 controlled trainer | protected through PR #64/`d1c4c38`; exact-head and post-merge CI/security pass, and artifact `8334594354` is a clean source-bound 256-step CPU PPO/MuJoCo/ONNX smoke | proves the seeded PPO/SAC runtime executes with exact dependencies and produces a source/lockfile/dependency-manifest/contract/config-bound valid ONNX artifact; short blocked-export smoke does not prove learning quality, overnight SLO, GPU economics, deployed operations, or field transfer |
| P7-010 controlled MJX feasibility | protected through PR #66/`0614272`; exact-head and post-merge CI/security pass, and artifact `8337556569` is clean source/request/contract/MJCF/runtime/hardware-bound evidence | GitHub's 4-CPU x86_64 row measured 268,902 native MuJoCo versus 54,698 CPU-MJX steps/s with passing float64 parity. It validates the harness and fail-closed report on the admitted hover reference; it does not supply D12 morphology, accelerator, PPO/SAC wall-time, overnight/tier-2 budget, cost, or adoption evidence |
| P7-011 authoritative policy delivery | complete through PR #68/`9131289`; exact-head and post-merge CI/security pass, and artifact `8340587390` is clean source/checkout-bound controlled S3-compatible evidence | two attempts yield one exact object/policy with no inline persistence; stale upload and digest substitution fail closed; cancellation creates no database authority; authenticated same-origin exact readback executes through the Rust estimator/motion browser boundary. Production object-store durability/SLO and OPS-006 orphan cleanup remain open |
| P7-014 waypoint trainer | protected through PR #70/`f220d25`; exact-head and post-merge CI/security pass, and artifact `8342801418` is clean source/task/runtime-bound dual-task evidence | task v2/Y-up/hash authority, sequential estimator-only waypoint transitions, full-chain evaluation, task-bound PPO/SAC/ONNX/scorecard/provider output, Studio target-chain playback, reproducibility, and refusals remain protected historical evidence feeding the completed P7-014 trainer boundary |
| P7-014 ground trainers | closed through PR #75/`90b1691`; exact-head and post-merge CI/security pass, and artifact `8356753424` is clean protected-source four-task evidence | D44 protects exact rover `[1,11] -> [1,2]` and current QD-Mini `[1,27] -> [1,8]` ground tensors, contract-only physics/control authority, estimator-only target progress, mass/torque/friction evaluation, mechanical-work energy, outer-worker/ONNX validation, four-task smoke, and Studio/unsupported-shape refusals. All short scorecards correctly remain blocked; browser, device, and field claims remain open |
| P7-009 source-bound offline fine-tuning | closed through PR #77/protected `2c7562d`; exact-head and post-merge CI/security pass, and artifact `8359446894` is clean protected-source controlled-synthetic evidence | D45 proves exact consented source-log -> BC dataset -> warmstart parameters -> randomized PPO -> ONNX -> unchanged scorecard execution. Both same-seed chains and valid ONNX graphs independently verify; the worker rejects `recorded-device`, and controlled-synthetic tapes do not establish recorder/device/field provenance, deployed GPU operations, or learning quality |
| P7-012 protected learning quality | implementation protected through PR #72/`8e094c0`; retained evidence protected through PR #73/`6bfa60f` | clean intentional interruption/resume retains exact JSON and ONNX under `docs/evidence/p7-012/`; hover and waypoint each pass 1.0 baseline and mass/Kv/wind on the declared M2 Pro host under frozen seeds/runtime/thresholds. Exact CPU authority, recovery, bytes, hardware, task/runtime/source lineage, unmeasured host-energy upper bounds, zero provider cost, and null electricity cost are retained; deployed GPU, external-user, device, and field proof remain open |
| Postgres/pgvector gate | pass on protected P7-013 CI `29463344103` for 24 migrations | job `87511370686` applies the clean plus 23 populated-predecessor matrix, proves migration 0024 and both P7-013 gateway/worker database fixtures, then passes QA-005 queue/upload faults, P7-011 policy delivery, transactional commerce, the current 11-flow QA-002 browser loop, and QA-003's three-engine matrix. Downloaded artifact `8362121226` self-binds to clean `ff39cd8`; no provider result is inferred from database fixtures |
| S3-compatible deletion | pass against local MinIO | a unique payload uploads, the production batch-delete adapter removes it, and the subsequent head requires 404 |
| Native/WASM golden parity | pass | all four canonical scenes and normalized validator reports are bit-identical |
| Browser parity gallery | **pass on protected `6f8509b`; QA-012 closed** | scheduled run `29311327203` and exact-current-main rerun `29367911748` exposed missing isolation headers and stale semantic-wrapper chrome suppression. PR #50 restores the governed full-WebGL path and version-binds both JSON artifacts. Exact branch nightly `29370725355` and exact-main nightly `29372161650` pass. Downloaded artifact `8326520247` records one isolated full-Studio Chromium/high-WebGL preflight with no page errors and six low-WebGL captures at unchanged edge F1 0.957-0.995, 3 draws, and 2,208/4,662 triangles; source/checkout equal `6f8509b` and the worktree is clean |
| QA-002 builder browser E2E | complete at deterministic product-acceptance maturity through PR #38 and protected `c80accb`; extended through P7-008/P7-011 and revalidated on protected `90b1691` | protected CI `29448974932` retains the 11/11 production-bundle/real-WASM flows, including authenticated same-origin fetch of the retained 906-byte object, exact digest/lineage/tensor/model verification, and ONNX Runtime Web execution through the Rust estimator/motion boundary, alongside catalog review, generation, edit, draft refusal, anonymous share/private 401, course, governed listing, job, and maintenance materialization; no live-provider or external-user claim |
| QA-003 browser/accessibility acceptance | complete at deterministic supported-browser maturity through PR #42 and protected `9c1802b` | exact PR CI `29282669499`/security `29282669468` and post-merge CI `29283250843`/security `29283250865` pass. The clean merge artifact records real WASM/validator admission and all semantic, skip/focus, keyboard orbit/equip/explode/blueprint, AA contrast, critical-target, responsive, reduced-motion, renderer, asset-isolation, and positive-draw assertions across Chromium 148.0.7778.96, Firefox 150.0.2, and WebKit 26.4. Chromium is full WebGL at 33 draws; Firefox/WebKit are core-baked Canvas2D at 17 draws with no scene/Three.js chunks. WebKit/narrow checks remain proxies, not Apple/mobile-device, assistive-technology, external-user, or field proof |
| QA-004 migration acceptance | complete through PR #44 and protected `e362c54` | exact PR CI `29286731035`/security `29286731271` and post-merge CI `29287274236`/security `29287274293` pass. The clean merge artifact binds source/checkout to `e362c54`, applies 20/20 clean migrations, preserves and idempotently reruns all 19 populated predecessors, and proves atomic rollback/corrected roll-forward, checksum/gap refusal, advisory serialization, and apply once. Production backup/restore/RPO/RTO remains OPS-005 |
| QA-005 fault acceptance | complete at deterministic isolated-Postgres maturity through PR #46 and protected `7970005` | exact implementation head `5663900` passed PR CI `29291536114`/security `29291536115`; synthetic merge `99024b8` had no non-doc implementation delta; post-merge CI `29292041469`/security `29292041441` pass. The clean artifact binds source/checkout to `7970005` and proves crash reclaim, two-attempt one-time materialization, stale/cancelled-result discard, bounded outage recovery, terminal rate exhaustion with its 17 s hint, partial-upload refusal/retry, exact metadata completion, and consent/job success. Multi-replica queues, deployed object storage, provider incidents, shared quotas, and production SLOs remain separate gates |
| QA-007 boundary adversarial corpus | complete through PR #48 and protected `e89bb15` | exact eight-file `forge-boundary-fuzz.v1` inventory contains 89 unique cases. Rust contract/sim tests consume patch/import/EnvSpec/replay cases with property-based no-panic checks; Python consumes replay/provider/citation/export/hardware cases. Exact head `fb6eacc` passed PR CI `29366837836`/security `29366838444`; protected merge `e89bb15` passed post-merge CI `29367356078`/security `29367355993`, including the isolated Postgres/real-browser job. This remains deterministic fixture evidence, not provider, diverse real-import, hardware, load, or field proof |
| QA-012 parity reliability | complete through PR #50 and protected `6f8509b` | exact head `8d4bf63` passed all 35 local gates, branch nightly `29370725355`, PR CI `29370722178`, and security `29370722124`; protected merge passed CI `29371177801`, security `29371177809`, and exact-main nightly `29372161650`. Both downloaded JSON artifacts self-bind to the clean merge revision and refuse Canvas2D or source drift; this restores G0 parity acceptance without changing the QA-003 viewer fallback or any golden/threshold |
| Rust coverage | pass: 84.34% lines | nightly floor is now 80% |
| WASM budgets | pass | measured bake/patch stay inside binding budgets |
| Rapier/MuJoCo parity | complete through PR #60 and protected `c0f5172`; real Rapier plus exact MuJoCo 3.9.0 and the registered keyless fixture pass | required worker job `87252899630` retained four contract-derived scenes, explicit radian MJCF, matched 1/240 s driver/four substeps, unchanged tolerances, protected source/request identity, and a passing comparison; re-run on every engine/exporter upgrade |
| Validator v0.1.0 release | pass; G1 closed | protected-main run `29241883791` and tag run `29244972303` passed every contract/native/WASM/SPDX/checksum/attestation step; the public nine-asset Release was downloaded and independently re-verified on macOS |
| XC-28 equipped variants | protected on `main` through PR #30 | ModelSpec 2.2 explicit selection, migration refusal for ambiguous legacy slots, selected-only physical consumers, stable source pointers, Studio cards, native/WASM/browser switch/HUD proof |
| SEC-002 prohibited briefs | protected on `main` through PR #30 | versioned pre-retrieval/provider/mutation refusal across five HTTP surfaces and direct APIs, bounded explicit-exclusion handling, minimal non-content audit rows, and fail-closed storage |
| SEC-003 user data | protected on `main` through PR #30 | explicit primary-row purge, secret exclusion, S3-compatible delete-before-commit, Postgres zero-residue and MinIO 404 proof; SEC-005 extends it to receipt 2.0.0 and restore suppression |
| SEC-004 consent | protected on `main` through PR #30 | consent ledger 1.0.0, five independent purposes, serialized action authority, late-output discard, bounded withdrawal effects, Studio controls, monotonic chronology, Postgres and browser proof |
| SEC-005 data lifecycle | protected contract/fixture on `main` through PR #30 | six retention classes, holds/locks/causal order, tombstones, exact backup manifests, restore suppression, retry/lease recovery, populated/clean/idempotent 19-migration proof; live backup/DR remains OPS-005 |
| SEC-006 application threats | protected contract/fixture complete on `main` through PR #31 | pinned-origin Auth.js/CSRF boundary, production config failure, header-only ephemeral provider key with persistence/reflection regression, bounded JSON/network/process/object/archive controls, prompt-injection containment, framework-visible plus classed rate limits, 32/32 local gate with 59/59 gateway and 104/104 workers, archive/published-release proof, exact-tree remote Postgres, CI/security, dependency, SBOM, CodeQL, and Desktop proof; deployed egress/distributed quotas/rotation/incident evidence remain operations work |
| Native Anthropic catalog ETL | protected contract/fixture through PR #33 at `12b65d2` (D36), P3-004/P4-016 remain in progress | fixture and command precedence; fixed Messages endpoint/API/model; header-only deployment key; forced strict supported-subset envelope; bounded request/response/tool input; local identity/mass/confidence/license/price/citation validation; source/model/API provenance; no credentialed sandbox, live persistence, billing/recovery, or OCCT proof |
| Queued vendor refresh | protected contract/fixture through PR #34 at `18f54fd`; P11-005 remains in progress | explicit local-only queue path; owner-scoped request-bound idempotency; command required at enqueue and execution; bounded normalized output; second transactional validation before `vendor_offers`; no direct gateway live HTTP bypass, credentialed provider, deployed quota/monitoring/recovery, billing, or current-terms proof |
| npm audit | pass: no known vulnerabilities | `@auth/core` 0.41.2 removed the vulnerable `cookie@0.6.0` path |
| RustSec audit | pass for root; Desktop audited separately | patched Desktop transitive highs; time-bounded Tauri/glib warning is GOV-011 and blocks Linux release |
| CodeQL | pass: JavaScript/TypeScript and Python | first post-merge scans completed successfully |

The repaired generation baseline is intentionally stronger than the minimum:

- quadruped bodies are printable modules across the full generator slider grid;
- rover compute electronics do not consume a physical collider slot;
- biped, fixed-wing, and quadruped templates split oversized structure;
- arm templates carry executable joint/target parameters;
- deterministic repair can split diagnosed oversized box/cbox/cylinder primitives,
  preserve mass, place modules, and regenerate explode windows.

## 3. GitHub and release posture

Live GitHub evidence checked on 2026-07-15:

- recovery [PR #11](https://github.com/RNT56/TTC/pull/11) and security closeout
  [PR #21](https://github.com/RNT56/TTC/pull/21), then native Desktop
  [PR #22](https://github.com/RNT56/TTC/pull/22) and workflow/SBOM
  [PR #23](https://github.com/RNT56/TTC/pull/23), followed by governance evidence
  [PR #25](https://github.com/RNT56/TTC/pull/25), merged through protection;
- v0.2 integration [PR #30](https://github.com/RNT56/TTC/pull/30) delivered
  ModelSpec 2.2/XC-28, SEC-001..005, public support/security surfaces, and the G1
  evidence reconciliation at exact merge `d34b6fd` after all required checks,
  dependency audit/review, both CodeQL languages, and source SPDX passed;
- application-threat [PR #31](https://github.com/RNT56/TTC/pull/31) completed the
  SEC-006 contract/fixture acceptance on implementation head `1f7cf41`: CI run
  `29251276475`, security run `29251276469`, and the PR-level CodeQL result passed,
  including the exact-tree Postgres gate and the two Auth.js route-rate findings;
  it merged through protection at exact `d952f60`;
- post-merge `main` CI [run 29251978420](https://github.com/RNT56/TTC/actions/runs/29251978420)
  and security [run 29251978330](https://github.com/RNT56/TTC/actions/runs/29251978330)
  completed successfully at exact merge `d952f60` and are the SEC-006 exact-commit
  evidence, including Postgres, TypeScript/gateway, both CodeQL languages, dependency
  audits, source SPDX, and native Desktop;
- evidence reconciliation [PR #32](https://github.com/RNT56/TTC/pull/32) merged as
  docs-only `b48f8a0`; descendant CI
  [29252793587](https://github.com/RNT56/TTC/actions/runs/29252793587) and security
  [29252793485](https://github.com/RNT56/TTC/actions/runs/29252793485) passed workers,
  Postgres, Rust, TypeScript/gateway, native Desktop, both CodeQL languages,
  dependency audits, and source SPDX. These runs prove the descendant is green; the
  SEC-006 runtime evidence remains anchored at `d952f60` rather than creating a
  documentation-hash loop;
- native Anthropic ETL [PR #33](https://github.com/RNT56/TTC/pull/33) merged at
  `12b65d2`; exact post-merge CI
  [29255595803](https://github.com/RNT56/TTC/actions/runs/29255595803) and security
  [29255595829](https://github.com/RNT56/TTC/actions/runs/29255595829) passed the
  19-migration Postgres gate, workers, Rust, TypeScript/gateway, native Desktop,
  audits, source SPDX, and both CodeQL languages. This proves the bounded native ETL
  contract/fixture descendant, not a credentialed provider call;
- queued commerce [PR #34](https://github.com/RNT56/TTC/pull/34) merged at
  `18f54fd`; exact post-merge CI
  [29260837182](https://github.com/RNT56/TTC/actions/runs/29260837182) and security
  [29260833090](https://github.com/RNT56/TTC/actions/runs/29260833090) passed all 20
  migrations, concurrent gateway retry/request-binding/owner-scope acceptance,
  worker success/corrupt-output rollback, 115 worker tests, 61 gateway tests,
  Brief-25 25/25, Rust, native Desktop, audits, source SPDX, and both CodeQL
  languages. This proves the queue and transactional normalizer at contract/fixture
  maturity, not a credentialed vendor operation;
- commerce evidence [PR #35](https://github.com/RNT56/TTC/pull/35) merged docs-only
  at `4fe0df6`; exact post-merge CI
  [29262255427](https://github.com/RNT56/TTC/actions/runs/29262255427) and security
  [29262256860](https://github.com/RNT56/TTC/actions/runs/29262256860) passed Rust,
  Postgres, workers, TypeScript/gateway, native Desktop, dependency audits, source
  SPDX, and both CodeQL languages. This proves the descendant is green without
  changing PR #34's runtime maturity boundary;
- golden review [PR #36](https://github.com/RNT56/TTC/pull/36) passed exact-head CI
  [29264389481](https://github.com/RNT56/TTC/actions/runs/29264389481) and security
  [29264386113](https://github.com/RNT56/TTC/actions/runs/29264386113) at `4497c83`,
  then merged through protection as `2589503`. Exact post-merge CI
  [29264679254](https://github.com/RNT56/TTC/actions/runs/29264679254) and security
  [29264678863](https://github.com/RNT56/TTC/actions/runs/29264678863) passed the new
  golden-policy step, Rust, Postgres, workers, TypeScript/gateway, native Desktop,
  dependency audits, source SPDX, and both CodeQL languages. This closes QA-008
  without adding provider, user-acceptance, hardware, or field authority;
- builder acceptance [PR #38](https://github.com/RNT56/TTC/pull/38) passed exact-head
  CI [29272067712](https://github.com/RNT56/TTC/actions/runs/29272067712) and security
  [29272067617](https://github.com/RNT56/TTC/actions/runs/29272067617) at `6a8ce28`,
  including the green replacement PR-level CodeQL result after the owner-listing
  route was bound to the official framework limiter. It merged through protection as
  `c80accb`; exact post-merge CI
  [29272532186](https://github.com/RNT56/TTC/actions/runs/29272532186) and security
  [29272531705](https://github.com/RNT56/TTC/actions/runs/29272531705) passed all ten
  structured browser flows, 20 migrations, transactional commerce materialization,
  Rust, workers, TypeScript/gateway, native Desktop, audits, source SPDX, and both
  CodeQL languages. This closes QA-002 at deterministic product-acceptance maturity,
  not external-user or live-provider maturity;
- external-acceptance governance [PR #40](https://github.com/RNT56/TTC/pull/40)
  passed exact-head CI
  [29275447135](https://github.com/RNT56/TTC/actions/runs/29275447135) and security
  [29275447237](https://github.com/RNT56/TTC/actions/runs/29275447237) at `74bae6e`,
  including the required external-acceptance policy step, 9/9 focused tests, the
  isolated Postgres/real-browser gate, dependency review/audit, source SPDX, native
  Desktop, and both CodeQL languages. It merged through protection as `8708de7`;
  exact post-merge CI
  [29275850838](https://github.com/RNT56/TTC/actions/runs/29275850838) and security
  [29275851177](https://github.com/RNT56/TTC/actions/runs/29275851177) passed the
  34-step policy baseline and all runtime/security jobs. This closes QA-010's
  evidence kit only; every `EXT-*`, live-provider, hardware, and field verdict stays
  unchanged;
- browser/accessibility acceptance [PR #42](https://github.com/RNT56/TTC/pull/42)
  passed exact-head CI
  [29282669499](https://github.com/RNT56/TTC/actions/runs/29282669499) and security
  [29282669468](https://github.com/RNT56/TTC/actions/runs/29282669468) at `caed237`,
  then merged through protection as `9c1802b`. Exact post-merge CI
  [29283250843](https://github.com/RNT56/TTC/actions/runs/29283250843) and security
  [29283250865](https://github.com/RNT56/TTC/actions/runs/29283250865) passed all
  runtime/security jobs. The clean merge artifact binds source and checkout to
  `9c1802b`, passes QA-002 10/10, and records QA-003's three declared engine tiers,
  real hashed WASM, renderer/asset isolation, positive draws, keyboard interaction,
  AA contrast, narrow containment, and reduced motion. This closes QA-003 only at
  deterministic supported-browser maturity;
- migration acceptance [PR #44](https://github.com/RNT56/TTC/pull/44) passed
  exact-head CI
  [29286731035](https://github.com/RNT56/TTC/actions/runs/29286731035) and security
  [29286731271](https://github.com/RNT56/TTC/actions/runs/29286731271) at `f44ee86`,
  then merged through protection as `e362c54`. Exact post-merge CI
  [29287274236](https://github.com/RNT56/TTC/actions/runs/29287274236) and security
  [29287274293](https://github.com/RNT56/TTC/actions/runs/29287274293) passed all
  runtime/security jobs. The clean merge artifact binds source and checkout to
  `e362c54`, applies 20/20 current migrations on clean Postgres 16.14/pgvector 0.8.5,
  preserves and idempotently reruns every populated predecessor `0001`..`0019`, and
  proves atomic failure recovery, drift/gap refusal, and concurrent apply-once. This
  closes QA-004 at deterministic isolated-Postgres maturity, not OPS-005 or QA-009;
- fault acceptance [PR #46](https://github.com/RNT56/TTC/pull/46) passed exact-head
  CI `29291536114` and security `29291536115`, then merged through protection as
  `7970005`. Exact post-merge CI `29292041469` and security `29292041441` plus the
  clean revision-bound artifact prove QA-005's D38 attempt and staged-upload matrix.
  Evidence reconciliation [PR #47](https://github.com/RNT56/TTC/pull/47) merged as
  `f2db50c`; exact post-merge CI `29292998692` and security `29292998720` are green;
- adversarial corpus [PR #48](https://github.com/RNT56/TTC/pull/48) passed exact-head
  CI [29366837836](https://github.com/RNT56/TTC/actions/runs/29366837836) and security
  [29366838444](https://github.com/RNT56/TTC/actions/runs/29366838444) at `fb6eacc`,
  including all required runtime, database/browser, dependency, SBOM, Desktop, and
  CodeQL checks. It merged through protection as `e89bb15`; exact post-merge CI
  [29367356078](https://github.com/RNT56/TTC/actions/runs/29367356078) and security
  [29367355993](https://github.com/RNT56/TTC/actions/runs/29367355993) are green. This
  closes QA-007's deterministic boundary corpus, not provider, real-import,
  hardware, load, external-user, or field maturity;
- QA-007 evidence [PR #49](https://github.com/RNT56/TTC/pull/49) passed exact-head
  CI `29368394642` and security `29368394719` at `c2514f5`, then merged through
  protection as `0f31b82`. Exact post-merge CI
  [29369026150](https://github.com/RNT56/TTC/actions/runs/29369026150) and security
  [29369026035](https://github.com/RNT56/TTC/actions/runs/29369026035) are green. It
  closes the evidence loop and registers QA-012 without changing QA-007 maturity;
- parity reliability [PR #50](https://github.com/RNT56/TTC/pull/50) closed QA-012.
  Exact head `8d4bf63` passed branch nightly
  [29370725355](https://github.com/RNT56/TTC/actions/runs/29370725355), PR CI
  [29370722178](https://github.com/RNT56/TTC/actions/runs/29370722178), and security
  [29370722124](https://github.com/RNT56/TTC/actions/runs/29370722124). Protected
  squash `6f8509b` passed post-merge CI
  [29371177801](https://github.com/RNT56/TTC/actions/runs/29371177801), security
  [29371177809](https://github.com/RNT56/TTC/actions/runs/29371177809), and exact-main
  nightly [29372161650](https://github.com/RNT56/TTC/actions/runs/29372161650).
  Downloaded artifact `8326520247` binds a clean source/checkout to `6f8509b`, records
  one isolated full-Studio Chromium/high-WebGL preflight without page errors, and
  passes all six low-WebGL scenes at unchanged edge F1 0.957-0.995 and 3 draws. The
  earlier Canvas2D failures remain the diagnosis record, not current acceptance;
- QA-012 evidence [PR #52](https://github.com/RNT56/TTC/pull/52) passed exact-head CI
  `29372629644` and security `29372629628` at `6895248`, then merged through
  protection as `2dfc960`. Exact post-merge CI
  [29373122748](https://github.com/RNT56/TTC/actions/runs/29373122748) and security
  [29373122777](https://github.com/RNT56/TTC/actions/runs/29373122777) passed every
  applicable runtime, database/browser, native Desktop, dependency, SBOM, and CodeQL
  job. This closes the documentation descendant without replacing PR #50's runtime
  or exact-main nightly anchors;
- interface documentation [PR #53](https://github.com/RNT56/TTC/pull/53) passed
  exact-head CI
  [29375146614](https://github.com/RNT56/TTC/actions/runs/29375146614) and security
  [29375146592](https://github.com/RNT56/TTC/actions/runs/29375146592) at `e79bbb1`,
  including the generated-route/event/artifact drift gate, isolated Postgres/browser
  acceptance, dependency audits, SPDX, Desktop, and both CodeQL languages. It merged
  through protection as `22c263b`; exact post-merge CI
  [29376742319](https://github.com/RNT56/TTC/actions/runs/29376742319) and security
  [29376742373](https://github.com/RNT56/TTC/actions/runs/29376742373) are green. This
  closes DOC-005 at deterministic documentation/compatibility maturity only;
- browser policy execution [PR #62](https://github.com/RNT56/TTC/pull/62) passed
  exact-head CI [29387737921](https://github.com/RNT56/TTC/actions/runs/29387737921)
  and security [29387737947](https://github.com/RNT56/TTC/actions/runs/29387737947)
  at `2686d1a`, then merged through protection as `1de7974`. Exact post-merge CI
  [29388166478](https://github.com/RNT56/TTC/actions/runs/29388166478) and security
  [29388166407](https://github.com/RNT56/TTC/actions/runs/29388166407) pass. Browser
  jobs `87264528677` and `87265803914` retain artifacts `8332187895` and
  `8332317185`, each recording 11/11 flows, real WASM, completed ONNX policy
  playback, and lazy same-origin runtime assets. This closes P7-008 at fixture-grade
  browser-execution maturity only;
- P7-008 evidence reconciliation [PR #63](https://github.com/RNT56/TTC/pull/63)
  passed exact-head CI
  [29388759113](https://github.com/RNT56/TTC/actions/runs/29388759113) and security
  [29388759133](https://github.com/RNT56/TTC/actions/runs/29388759133) at `9124427`,
  then merged through protection as `766f7b8`. Exact post-merge CI
  [29389051743](https://github.com/RNT56/TTC/actions/runs/29389051743) and security
  [29389051735](https://github.com/RNT56/TTC/actions/runs/29389051735) pass. This is
  its protected P7-008 documentation descendant; PR #62/`1de7974` remains the
  runtime/browser evidence anchor;
- [ruleset 18843164](https://github.com/RNT56/TTC/rules/18843164) protects `main` with PR-only delivery, strict current
  branches, resolved threads, no force pushes/deletions, and six required checks,
  including the native macOS Desktop compile;
- manual nightly parity/coverage passed on the recovery merge at
  [run 29211055558](https://github.com/RNT56/TTC/actions/runs/29211055558); final-commit rerun
  [29211517706](https://github.com/RNT56/TTC/actions/runs/29211517706) also passed and is the closeout record;
- corrected G1 branch [run 29236010204](https://github.com/RNT56/TTC/actions/runs/29236010204)
  passed Linux, macOS Intel, Windows, WASM, aggregate verification, and provenance at
  `02f912d`; its downloaded aggregate independently passed on macOS and established
  the pre-merge positive proof;
- annotated [`prototype-final`](https://github.com/RNT56/TTC/tree/prototype-final)
  resolves to commit `0294a9d`; its frozen file SHA-256 is `ca93489e…`;
- vulnerability alerts, Dependabot security updates, secret scanning, and push
  protection are enabled; dependency review/audit and CodeQL have remote proof;
- Dependabot alert 1 for the upstream Tauri Linux glib chain is dismissed as
  `tolerable_risk` only through 2026-10-12; GOV-011 still blocks Linux release;
- repository Actions policy is `selected`: GitHub-owned Actions plus seven exact
  third-party SHAs are allowed, broad verified-creator access is disabled, and the
  green runs above executed under that policy;
- repository description, README homepage, and 12 focused topics are set; security,
  contribution, support, conduct, issue/PR, debugging, release, and publication
  surfaces are protected on `main` through PR #30;
- compatibility [PR #26](https://github.com/RNT56/TTC/pull/26), release-artifact
  [PR #27](https://github.com/RNT56/TTC/pull/27), and runner/download verification
  [PR #29](https://github.com/RNT56/TTC/pull/29) are merged on protected `main` at
  `1093842`; the first main release run exposed the macOS runner/profile bottleneck;
- runner remediation [PR #29](https://github.com/RNT56/TTC/pull/29) selects
  `macos-26-intel`, a 60-minute ceiling, and measured thin LTO. Run
  [29230415603](https://github.com/RNT56/TTC/actions/runs/29230415603) proved every
  platform build/smoke and all required CI/security checks, then found that Actions
  transfer had removed the Linux execute bit before aggregate archiving. Fix
  `02f912d` normalizes and verifies native modes and uses timestamp-free gzip.
  Corrected run [29236010204](https://github.com/RNT56/TTC/actions/runs/29236010204)
  passed every native/WASM/aggregate job; its downloaded aggregate independently
  passed checksum, SPDX, macOS binary/example, and clean WASM-consumer verification;
- protected-main manual release run
  [29241883791](https://github.com/RNT56/TTC/actions/runs/29241883791) passed the
  contract, Linux, Windows, macOS, WASM, both SPDX SBOMs, checksums, downloaded-payload
  verification, provenance attestation, and aggregate upload at exact `1093842`; its
  downloaded aggregate then passed the verifier outside Actions;
- annotated tag `v0.1.0` points to `1093842`; tag
  [run 29244972303](https://github.com/RNT56/TTC/actions/runs/29244972303) rebuilt and
  verified every platform and published the non-draft
  [nine-asset GitHub Release](https://github.com/RNT56/TTC/releases/tag/v0.1.0);
- every published asset was downloaded after publication. `SHA256SUMS`, artifact
  SPDX, macOS x86_64 `forge-validate 0.1.0`, canonical admission, and a clean
  `@forge/validate-wasm` 0.1.0 consumer all passed independently;
- crates.io/npm publication is deliberately deferred: no registry token is present,
  and no owner decision authorized a credentialed registry publication.

Consequently G0 and G1 are **closed**, and the public-surface/XC-28/SEC-001..005 v0.2
stack is protected on `main`. Remaining Wave 1 work is the real-mid-hardware P1
budget, qualified name review, and the explicitly deferred owner-credential registry
decision; none is a hidden release claim.

## 4. Capability maturity

| Capability | Current maturity | What is still needed |
|---|---|---|
| Contract/validator/WASM | v0.1.0 released with protected-main/tag attestations and post-publication install proof; ModelSpec 2.2 equipped semantics are protected on `main` | registry publication only after an explicit owner/credential decision |
| Studio inspection/editing | protected deterministic implementation with truthful variant cards, stable-source selection, complete QA-002 real-WASM/isolated-DB browser acceptance, and protected QA-003 three-engine semantic/keyboard/focus/contrast/target/responsive/reduced-motion acceptance | representative assistive-technology and vendor-device review, real performance matrix, and external-user proof |
| Catalog/BOM/license ledger | fixture/local Postgres implementation, D10 exporter enforcement, and native bounded Anthropic ETL contract | credentialed ETL sandbox, real-result persistence/review operations, provider recovery, and live OCCT artifact audit |
| Text generation | 25/25 deterministic template implementation, opt-in provider seam, protected SEC-002/D34/D35 authority, protected SEC-006 key/network/input/prompt bounds, and native ETL contract | credentialed model/extraction sandbox, deployed egress/quotas/log review, OPS-005 backup/DR, external R1 proof |
| Photoscan | fixture plus command/Modal contracts | real TRELLIS/COLMAP, cache, D13 and under-five-minute evidence |
| Simulation/interop | deterministic P6 exit protected: real Rapier, exporters/importers, admitted driveable URDF/MJCF fixtures, registered parity baseline, and required exact-MuJoCo-3.9.0 evidence | broader diverse third-party model acceptance remains product QA before a GA claim |
| Training/policy | protected exact-pinned CPU SB3/MuJoCo flight/ground trainers, clean scorecard-passing consumer-hardware evidence, authoritative object delivery, browser playback, controlled MJX feasibility, and D45 exact source-bound controlled-synthetic BC-to-PPO evidence | recorded-device capture; deployed Modal/GPU operations; exact passing-policy delivery integration; ground browser playback; final D12 accelerator/budget/cost MJX decision; production storage operations; external acceptance; and field transfer |
| Co-design | deterministic candidate/Pareto contracts | live optimizer and multi-fidelity simulator evidence |
| Courses/leaderboards | schema, routes, verification, Studio fixture surface | real community course, competitors, and verified public board |
| Marketplace/classroom | data/API/UI implementation | dual-use gate, external users, live policy transfer and process ownership |
| Commerce/printing | synchronous sandbox links plus protected contract/fixture queued vendor normalizer and transactional offer materialization; print quote normalizer remains a helper contract | credentialed vendor sandbox, deployed egress/quotas/monitoring/retry/recovery/billing/current terms, true orientation, and real print quote handoff |
| Desktop/hardware | fail-closed scaffold plus protected D48-D57 transport/readback/recorder/inspection/controls/materialization/admission/self-reported MSP identity/signed-custody/compact ghost-view mechanics; D57 preserves archive v1/D53/D54 and all device/recorded-device/field/sharing/training nonclaims | execute D49/D55/D56 seams on named D12 hardware with a real trust bundle, rotation/revocation/suspend drills, and retained acceptance evidence; add server-selected D54 replay/admitted-twin execution; browser WebSerial/WebUSB; signed apps; real ghost/system-ID; Link image; lab/field proof |
| Maintenance | deterministic wear/crash/repair/fleet contracts | Desktop-captured field evidence and operating fleet data |
| External acceptance governance | versioned QA-010 registry/CLI/templates are protected through PR #40 at `8708de7` | separately execute and review `EXT-001..008` runs with intended people/providers/hardware; structural validation alone never closes them |

## 5. Reconciled truth and remaining discrepancies

The 2026-07-12 recovery reconciled stale claims about Rapier, driveable imports,
draft persistence, arm support, qd-mini admission, Brief-25, test counts, verification
commands, and the agent entry point. Remaining known gaps are now explicit backlog:

- D10 export enforcement is protected on `main`; real OCCT artifacts and provider
  operations still need sandbox/live evidence under P6/P11;
- prohibited-brief refusal/logging, user-scoped export/primary deletion,
  purpose/subject consent-withdrawal, and retention/hold/tombstone/restore suppression
  are protected on `main`; production backup/provider deletion/restore/DR remains
  open under `OPS-005`;
- SEC-006 deterministically bounds application trust surfaces; connection-time
  egress, distributed rate/cost state, external-log inspection, workload isolation,
  rotation, and incident drills remain operations evidence;
- native Anthropic ETL is implemented and adversarially tested without a credential;
  real provider output through dedupe, immutable catalog persistence, owner review,
  BOM, and lawful export remains the P3-004/P4-016 R1 acceptance path;
- queued vendor refresh now has one local-only, idempotent gateway-to-worker path and
  transactionally revalidated offer materialization with protected 20-migration,
  concurrency, and rollback proof; a real vendor sandbox with egress, quota,
  monitoring, recovery, billing, and terms evidence remains P11-005 work;
- QA-005's protected D38 boundary fences each at-least-once attempt with an opaque
  expiry, bounds transient retry, rejects stale/cancelled completion, and keeps client
  uploads staged until server-inspected length/type/checksum match. Exact PR and
  post-merge isolated-Postgres artifacts prove this deterministic boundary; production
  partitions, dead-letter operations, object-provider incidents, queue SLOs, and
  shared quotas remain OPS/QA work;
- QA-007's protected corpus makes malformed/non-finite imports, replay, EnvSpec,
  citations, D10 exports, provider rows, and hardware payloads durable governed
  regressions. It also rejects command newlines, duplicate telemetry time, malformed
  supervisor vectors, and non-finite safety limits. The corpus is deterministic
  fixture evidence, not provider, external-import diversity, hardware, load, or field
  proof;
- QA-002 deterministic builder acceptance, QA-003's production-bundle three-engine
  semantic/keyboard/focus/contrast/target/responsive/reduced-motion matrix, and
  QA-010's machine-checked external scripts/evidence templates are protected on
  `main`. Real assistive-technology/device review, performance, and the actual
  independent-builder run remain QA-006 and EXT-001;
- external/live/field acceptance remains open; public support/v0.2 delivery and the
  standalone v0.1.0 release/supply-chain gate are closed.

## 6. Go/no-go verdicts

| Milestone | Verdict | Blocking evidence |
|---|---|---|
| Continue local development | **Go** | complete local gates are green |
| Merge ordinary feature PRs | **Go through protection** | exact checks and current-branch policy are active |
| Directly push ordinary work to `main` | **No-go by policy** | active ruleset requires a current PR and exact checks |
| Publish validator v0.1 | **Complete** | protected-main and tag workflows, annotated tag, nine assets, checksums/SPDX/provenance, and post-publication binary/WASM verification are green |
| Claim deterministic Brief-25 threshold | **Go** | current local result is 25/25 |
| Claim P7-012 protected overnight learning quality | **Go at controlled consumer-hardware simulation maturity** | PR #72/protected `8e094c0` owns the implementation and PR #73/protected `6bfa60f` owns the exact retained interrupt/resume evidence; do not restate this as deployed GPU, measured host energy, external-user, device, or field proof |
| Claim P7-014 rover/quadruped trainer closure | **Go at controlled deterministic trainer maturity** | PR #75/protected `90b1691`, exact PR/post-merge CI/security, and independently checked artifact `8356753424` close executable contract-derived rover/quadruped training; passing learned policies, Studio ground playback, external users, devices, and field transfer are separately open |
| Claim P7-009 source-bound offline-training closure | **Go at controlled-synthetic maturity** | PR #77/protected `2c7562d`, exact PR/post-merge CI/security, the 23-migration database/browser matrix, and independently checked artifact `8359446894` close the exact consented-log BC-to-PPO seam; recorder/device/field, deployed GPU, passing-policy, and external-user claims remain open |
| Claim P7-010 decision-contract protection | **Go at contract/fixture maturity only** | PR #81/protected `d19c911`, exact PR/post-merge CI/security, and independently checked artifact `8363066891` protect D47's exact three-proxy request, source/authority/budget/cost hashes, float64 GPU/TPU no-fallback enforcement, centralized verdict, and operator runbook. The retained v1 CPU smoke remains decision-ineligible; no final adoption or rejection is proven |
| Claim P7-010 MJX adoption or rejection | **No-go** | retain reviewed raw D12-proxy/legged scorecard and complete 200-candidate CPU budget artifacts, current CPU/accelerator price or bill, and one clean protected decision-eligible v2 run on an authorized float64 CUDA/ROCm GPU or TPU first |
| Claim P7-013 deployment-control protection | **Go at contract/fixture maturity only** | PR #79/protected `ff39cd8`, exact PR/post-merge CI/security, the 24-migration database/browser matrix, and independently checked artifact `8362121226` protect fail-closed deployment identity, CUDA authority, call recovery, quota, cancellation/refund, and cost-reconciliation contracts. No Modal deployment, credentialed L4 execution, provider billing, delivered alert, automatic expiry, or live recovery is proven |
| Claim P7-013 credentialed sandbox closure | **No-go** | execute and retain the exact clean-protected seven-day `MODAL-OPERATIONS.md` provider/billing/alert/spend-stop/cancel/delete/expiry/recovery evidence first |
| Claim Text-to-CAD GA/product readiness | **No-go** | live provider, user-content privacy, external-user and operational proof incomplete |
| Invite external builders under a product promise | **No-go** | R1 has not been independently proven |
| Enable live provider billing | **No-go** | provider, recovery, cost, and privacy evidence incomplete |
| Execute controlled D12 lab work | **Conditional go** | only under D30 gates and documented physical supervision |
| Claim P8-012 native serial transport closure | **Go at protected deterministic/native integration maturity only** | PR #83/`fd26845`, exact PR/post-merge CI/security, independent cross-language artifact validation, and real pseudo-terminal byte proof close transport. They do not prove target-version match, applied config, FC, HITL, lab, or field maturity |
| Claim D49 target/readback protocol closure | **Go at protected local integration maturity only** | PR #85/`4647a10`, exact PR/post-merge CI/security, and two-session pseudo-terminal proof protect the bounded handshake/save/reconnect/readback protocol. The named physical FC must still produce reviewed lab evidence before any physical-device or applied-configuration claim |
| Claim P8-013 recorder closure | **Go at protected local semantic-admission maturity only** | PR #87/`d8afe7f`, exact PR/post-merge CI/security, reviewed-tree equality, and pseudo-terminal proof protect D50's archive/frame/receipt, background thread, replay/index/hash, refusal, exclusivity, caps, and no-overwrite behavior. D51 separately protects read-only Studio archive inspection, PR #91/`a8120ab` protects versioned shell-owned controls, PR #93/`08d892f` protects five private checksum-bound objects plus object-integrity-only completion, and PR #95/`f8efb6f` protects semantic-only admission. Real adapter/device identity, host suspend, lab/field, ghost/system-ID, sharing/training reuse, and recorded-device claims require separate evidence |
| Claim D51 recorder-import protection | **Go at protected local archive-inspection maturity only** | PR #89/`b5418ac`, exact PR/post-merge CI/security, reviewed-tree equality, and strict native/Studio refusal tests protect local archive-v1 self-consistency. Inspection does not authenticate a device/session or authorize upload, sharing, training, lab, field, ghost, or system-ID maturity |
| Claim D52 recorder-control protection | **Go at protected local control maturity only** | exact head `69db857`, reviewed tree `25be1d3`, PR CI/security `29495505253`/`29495505262`, protected squash `a8120ab`, and post-merge CI/security `29496148793`/`29496148796` protect the versioned shell-control boundary. It still proves no device/session, suspend, gateway, lab/field, sharing/training, ghost, or system-ID maturity |
| Claim D53 recorder materialization protection | **Go at protected local private-object-integrity maturity only** | PR #93/`08d892f`, exact PR/post-merge CI/security, reviewed-tree equality, strict native/gateway/Studio refusal tests, and the clean/24-predecessor Postgres plus browser matrices protect the five-object boundary. D53 proves only private object integrity—not sovereign archive semantics, telemetry admission, device/field provenance, sharing, training, lab, or field maturity |
| Claim D54 recorder admission protection | **Go at protected local semantic-admission maturity only** | PR #95/`f8efb6f`, exact PR/post-merge CI/security, reviewed-tree equality, native/Gateway/Studio/Postgres refusal proof, the clean/25-predecessor database/browser matrices, and all 40 local gates protect the semantic-only boundary, immutable D53 nonclaims, bounded object reference, lifecycle coverage, and legacy-training refusal. This does not prove device/session authenticity, recorded-device/field provenance, sharing/training authority, production object operations, suspend, lab, ghost, or system-ID maturity |
| Claim D55 adapter identity | **Go at protected local protocol-fixture maturity only** | PR #97/`370d214`, exact PR/post-merge CI/security, reviewed-tree equality, 19 native and 28 Studio tests, all 40 repository gates, the clean/25-predecessor database matrix, 11 browser flows, and three engines protect the strict read-only two-pass MSP observation boundary. Protected D56 can bracket this observation, but named hardware and real-trust-root recorder binding remain pending; self-reported firmware/board/build/UID stability is not cryptographic device attestation, recorded-device provenance, or field proof |
| Claim D56 recorder custody | **Go at protected local custody-fixture maturity only** | PR #100/`1bf127d`, exact PR/post-merge CI/security, reviewed-tree equality, strict trust/signature/binding verification, shell-owned pre/post D55 continuity, proof creation/refusal, and archive-v1 preservation protect local mechanics. No real trust root, named controller, rotation/revocation drill, suspend, or EXT-004 evidence exists. Even a valid D56 proof is an acceptance-authority signature with device/recorded-device/field/sharing/training claims false |
| Claim D57 ghost-view protection | **Go at protected local view maturity only** | PR #102/`d33fd57`, exact PR/post-merge CI/security, reviewed-tree equality, focused worker/Gateway/Studio/refusal checks, all 40 local gates, clean/25-predecessor Postgres, 12/12 production-browser flows, and all three browser engines protect controlled-synthetic/unverified compact-view mechanics. Real D54 twin replay, device/recorded-device/field provenance, full named-hardware render performance, P8-014 and EXT-008 remain separate no-go gates |
| External hardware beta | **No-go** | no lab evidence or explicit rollout gate |
| Public marketplace/policy sharing | **No-go** | dual-use/process/external proof incomplete |

## 7. Next evidence refresh

The stable ledger currently contains **205 tasks: 149 done, 31 in progress, 24 open,
and 1 explicitly blocked**. All 8 recovery tasks and QA-012 retain completed evidence.
The 56 remaining tasks include the phase/live/field program, 2 governance, 2
security, 2 quality, 10 operations, and 9 external-proof tasks; the documentation
completion lane is closed. Dependency
order is owned by
`EXECUTION-ROADMAP.md`.

Refresh this snapshot when the next task changes the boundary or any current gate
regresses. Preserve the v0.1.0 tag/run/asset evidence and record exact remaining
task/phase counts after every status transition.
