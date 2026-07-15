# PROJECT STATE - evidence snapshot and readiness boundary

Snapshot date: **2026-07-15**
Repository: `RNT56/TTC`
Runtime/security evidence anchor: `d952f60` (PR #31)
Latest verified protected runtime descendant: `9131289` (PR #68; P7-011 authoritative policy delivery)
Latest verified protected runtime/parity anchor: `1de7974` (PR #62; real browser policy runtime)
P7-003 controlled-training evidence anchor: `d1c4c38` (PR #64)
P7-010 controlled-MJX-feasibility evidence anchor: `0614272` (PR #66)
P7-011 policy-delivery evidence anchor: `9131289` (PR #68)
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
contracts or fixture workflows; live providers, deployed/passing training, hardware,
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
and compatibility evidence, not live-provider or broader product maturity.

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

The P7-014 waypoint slice is now an implementation candidate, not yet protected
evidence. D41 corrects the new task line to `p7-v2`/2.0.0 with explicit
`forge-y-up-rh-m` and a canonical task-definition digest while retaining v1 as a
legacy read. The exact-pinned native command executes hover-hold or the three-target
waypoint chain, advances targets only from estimator error, requires full-chain
evaluation success, binds task/hash through config, ONNX metadata/header, scorecard
lineage, external-provider authority, and Studio playback, and refuses unsupported
task/archetype/frame drift. All 39 required local gates pass under Python 3.12,
including 154 worker tests, 11 Studio runtime tests, and a dual 256-step CPU smoke
with two valid but correctly non-exportable ONNX policies.
This is controlled candidate runtime proof, not protected exact-source evidence,
overnight learning quality, deployed GPU operations, rover/legged coverage, or
field transfer.

## 2. Current verified results

| Check | Result | Interpretation |
|---|---|---|
| Git state | latest verified protected runtime descendant is P7-011 anchor `9131289`; P7-010 MJX anchor `0614272`, P7-003 training anchor `d1c4c38`, P7-008 browser anchor `1de7974`, SEC-006 runtime/security anchor `d952f60`, P6 engine anchor `c0f5172`, DOC-006 evidence `484aefa`, QA-012 parity anchor `6f8509b`, QA-007 anchor `e89bb15`, QA-005 anchor `7970005`, QA-004 anchor `e362c54`, QA-003 anchor `9c1802b`, QA-008 anchor `2589503`, and QA-010 anchor `8708de7` remain green; annotated `v0.1.0` published | PR #68 exact head `433ff3b` passed CI `29408733457`/security `29408733461`; protected squash `9131289` passed post-merge CI `29409341830`/security `29409342305`. PR #66/`0614272` remains the MJX-feasibility anchor, PR #64/`d1c4c38` the seeded-training anchor, and PR #62/`1de7974` the base browser-runtime anchor |
| Rust toolchain | pinned 1.96.0 locally and in workflows | local/CI compiler contract is explicit |
| JS supply-chain client | pnpm 11.13.0 protected through PR #54; frozen install and `pnpm audit --audit-level low` remain binding, and all 39 current gates pass without lockfile drift | replaces npm's retired legacy audit protocol with bulk advisories and fails closed on all dependency build scripts except the version-exact reviewed entries; PR #68 exact-head and protected security both pass with the exact training/MJX and policy-delivery runtime audit |
| `pnpm verify` | P7-011 exact head passes all 39 required non-DB gates locally under Python 3.12; PR and protected required remote checks are green | generated contract-doc drift joins migration source/history/checksum policy, external acceptance, browser support, golden/parity policy, Action pins, 15-surface compatibility, fmt, Clippy, full tests, WASM, schema, TS, 9 Studio tests, 65 gateway tests, Brief-25 25/25, oracles, budgets, boundary fuzz, sim, packaging, pilots, 151 worker tests, real training/engine/MJX smokes, and patch hygiene; protected CI `29409341830` also passes the 22-migration Postgres/MinIO/browser acceptance |
| Golden artifact and parity-harness review | protected through PR #53 with 16 governed artifact families and 19 focused policy tests | the DOC-005 schema family joins the protected registry; nine parity tests pin source identity/clean checkout, isolation, full-Studio WebGL readiness, non-retryable configuration failure, one bounded renderer retry, viewer-fallback refusal, and low-tier WebGL capture. No existing registered artifact, golden, camera, metric threshold, or draw-call budget changed |
| External acceptance policy | QA-010 complete through protected PR #40: 8 milestone contracts/templates and 9/9 focused tests pass locally and in required CI | versioned builder/photoscan/training/course/lab/print/marketplace/maintenance scripts require exact revision/environment, role separation, authority, evidence kinds, measurements, findings review, signoffs, and honest pass/fail/stop outcomes; this is evidence governance, not an `EXT-*` result |
| `pnpm verify:compatibility` | protected pass: 15/15 surfaces match policy 1.0.0 | policy tensor 1.0.0 joins gateway API/events, source constants, manifests, legacy aliases, license/user-data/consent/delete-receipt/lifecycle boundaries, and the deprecation floor in the machine matrix |
| DOC-005 contract documentation | complete through protected PR #53 at `22c263b`: 75 runtime routes, 2 event families, 14 compatibility surfaces, and 16 worker families | `pnpm docs:contracts`, generated drift, compatibility, 63 gateway tests, 127 worker tests on Python 3.12, 19 golden-policy tests, native/WASM parity, packaging, and patch hygiene pass locally and through exact PR/post-merge CI/security |
| DOC-006 contributor workflow | complete through implementation PR #58 at `3078dba` and evidence PR #59 at `484aefa`: canonical onboarding, maintainer-only curation, linked entry surfaces, sensitive-authority exclusions, assignment/reassignment rules, and three live seed issues | all 69 Markdown files resolve locally, issue-form YAML parses, #55-#57 remain correctly labeled and unassigned, all 36 local gates pass, and exact PR/post-merge CI/security are green; no external contribution outcome is claimed |
| `cargo test --workspace` | pass | includes quadruped slider-grid and pinned golden coverage |
| Declared first-party verdicts | pass: 5/5 | qd-mini is admitted again without changing the expected verdict |
| Brief-25 real-validator gate | pass: 25 admitted, 0 draft/rejected/blocked | exceeds the binding 20/25 threshold with 0 repair iterations |
| Gateway tests | pass: 65/65 with the real validator in the full gate | admitted snapshot/hash authority and training-ready multirotor estimator coverage join the digest-bound policy fixture, staged object declaration/completion/refusal, worker-mode command/provider/idempotency/capability negatives, owner-scoped key digests, retry-drift conflict, cross-owner isolation, and no duplicate fixture materialization |
| Worker tests | protected 151/151 at P7-011 under Python 3.12 | adds exact S3-compatible SigV4 object transport, D38 lease rechecks around upload, byte-free one-winner policy materialization, substitution/cancellation refusal, and exact-readback coverage to the frozen MJX request/protocol/hash, real PPO/SAC/MuJoCo/ONNX, same-seed reproducibility, training-bundle authority, corpus consumers, real engine parity, commerce, native ETL, and SEC-006 coverage |
| P7-003 controlled trainer | protected through PR #64/`d1c4c38`; exact-head and post-merge CI/security pass, and artifact `8334594354` is a clean source-bound 256-step CPU PPO/MuJoCo/ONNX smoke | proves the seeded PPO/SAC runtime executes with exact dependencies and produces a source/lockfile/dependency-manifest/contract/config-bound valid ONNX artifact; short blocked-export smoke does not prove learning quality, overnight SLO, GPU economics, deployed operations, or field transfer |
| P7-010 controlled MJX feasibility | protected through PR #66/`0614272`; exact-head and post-merge CI/security pass, and artifact `8337556569` is clean source/request/contract/MJCF/runtime/hardware-bound evidence | GitHub's 4-CPU x86_64 row measured 268,902 native MuJoCo versus 54,698 CPU-MJX steps/s with passing float64 parity. It validates the harness and fail-closed report on the admitted hover reference; it does not supply D12 morphology, accelerator, PPO/SAC wall-time, overnight/tier-2 budget, cost, or adoption evidence |
| P7-011 authoritative policy delivery | complete through PR #68/`9131289`; exact-head and post-merge CI/security pass, and artifact `8340587390` is clean source/checkout-bound controlled S3-compatible evidence | two attempts yield one exact object/policy with no inline persistence; stale upload and digest substitution fail closed; cancellation creates no database authority; authenticated same-origin exact readback executes through the Rust estimator/motion browser boundary. Production object-store durability/SLO and OPS-006 orphan cleanup remain open |
| P7-014 waypoint trainer candidate | all 39 required local gates pass under Python 3.12, including 154 worker tests, 11 Studio runtime tests, and dual 256-step hover/waypoint CPU smoke; protection and a clean retained artifact are pending | task v2/Y-up/hash authority, sequential estimator-only waypoint transitions, full-chain evaluation, task-bound PPO/SAC/ONNX/scorecard/provider output, Studio target-chain playback, reproducibility, and refusals are implemented. Both short scorecards remain blocked; P7-012 overnight GPU quality and the rover/legged remainder of P7-014 remain open |
| Postgres/pgvector gate | pass on protected P7-011 CI `29409341830` for 22 migrations | the clean plus 21 populated-predecessor matrix, migration 0022 invariants, QA-005 queue/upload fault artifacts, P7-011 policy-delivery scenarios, transactional commerce materialization, current 11-flow QA-002 browser loop, and QA-003 three-engine matrix share one isolated job/database boundary; the local Docker VM remains unhealthy and was not modified |
| S3-compatible deletion | pass against local MinIO | a unique payload uploads, the production batch-delete adapter removes it, and the subsequent head requires 404 |
| Native/WASM golden parity | pass | all four canonical scenes and normalized validator reports are bit-identical |
| Browser parity gallery | **pass on protected `6f8509b`; QA-012 closed** | scheduled run `29311327203` and exact-current-main rerun `29367911748` exposed missing isolation headers and stale semantic-wrapper chrome suppression. PR #50 restores the governed full-WebGL path and version-binds both JSON artifacts. Exact branch nightly `29370725355` and exact-main nightly `29372161650` pass. Downloaded artifact `8326520247` records one isolated full-Studio Chromium/high-WebGL preflight with no page errors and six low-WebGL captures at unchanged edge F1 0.957-0.995, 3 draws, and 2,208/4,662 triangles; source/checkout equal `6f8509b` and the worktree is clean |
| QA-002 builder browser E2E | complete at deterministic product-acceptance maturity through PR #38 and protected `c80accb`; extended through P7-008/P7-011 and revalidated on protected `9131289` | protected CI `29409341830` retained artifact `8340587390`: 11/11 production-bundle/real-WASM flows include authenticated same-origin fetch of the retained 906-byte object, exact digest/lineage/tensor/model verification, and ONNX Runtime Web execution through the Rust estimator/motion boundary, alongside catalog review, generation, edit, draft refusal, anonymous share/private 401, course, governed listing, job, and maintenance materialization; no live-provider or external-user claim |
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
| Training/policy | protected controlled exact-pinned CPU SB3/MuJoCo hover training with authoritative snapshots/bundles, seeded PPO/SAC, deterministic ONNX export, fixture scorecards, lease-fenced exact object-backed one-click delivery, real digest-bound browser playback through Rust estimator observations, a local controlled CPU MuJoCo/MJX feasibility candidate, and an unprotected real waypoint candidate under D41 task-v2 authority | protect the waypoint trainer slice, then overnight passing hover/waypoint scorecard, deployed Modal/GPU evidence, offline fine-tune evidence, broader rover/legged archetypes, exact D12 accelerator/budget/cost benchmark and final MJX decision, production object-store SLO/orphan operations, external acceptance, and field transfer |
| Co-design | deterministic candidate/Pareto contracts | live optimizer and multi-fidelity simulator evidence |
| Courses/leaderboards | schema, routes, verification, Studio fixture surface | real community course, competitors, and verified public board |
| Marketplace/classroom | data/API/UI implementation | dual-use gate, external users, live policy transfer and process ownership |
| Commerce/printing | synchronous sandbox links plus protected contract/fixture queued vendor normalizer and transactional offer materialization; print quote normalizer remains a helper contract | credentialed vendor sandbox, deployed egress/quotas/monitoring/retry/recovery/billing/current terms, true orientation, and real print quote handoff |
| Desktop/hardware | fail-closed scaffold and pilot documents | signed apps, serial/capture, Link image, lab pilots, field logs |
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
| Claim Text-to-CAD GA/product readiness | **No-go** | live provider, user-content privacy, external-user and operational proof incomplete |
| Invite external builders under a product promise | **No-go** | R1 has not been independently proven |
| Enable live provider billing | **No-go** | provider, recovery, cost, and privacy evidence incomplete |
| Execute controlled D12 lab work | **Conditional go** | only under D30 gates and documented physical supervision |
| External hardware beta | **No-go** | no lab evidence or explicit rollout gate |
| Public marketplace/policy sharing | **No-go** | dual-use/process/external proof incomplete |

## 7. Next evidence refresh

The stable ledger currently contains **201 tasks: 142 done, 34 in progress, 24 open,
and 1 explicitly blocked**. All 8 recovery tasks and QA-012 retain completed evidence.
The 59 remaining tasks are the phase/live/field program plus 2 governance, 2 security,
2 quality, 10 operations,
and 9 external-proof tasks; the documentation completion lane is closed. Dependency
order is owned by
`EXECUTION-ROADMAP.md`.

Refresh this snapshot when the next task changes the boundary or any current gate
regresses. Preserve the v0.1.0 tag/run/asset evidence and record exact remaining
task/phase counts after every status transition.
