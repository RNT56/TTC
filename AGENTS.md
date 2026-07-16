# ForgedTTC repository guide

This is the canonical entry point for humans and coding agents working in this
repository. Read it before changing code, data, workflows, or living documentation.
`CLAUDE.md` is a compatibility pointer to this file.

The parent workspace `AGENTS.md` also applies. Its feature-parity rule is binding if
this repository gains a `FEATURE_PARITY.md`; no such file exists at the time of this
entry.

## 1. Mission

ForgedTTC is an evidence-preserving robotics design system:

> describe -> assemble -> validate -> simulate -> train -> share -> build -> record -> repair -> improve

It is positioned upstream of mechanical CAD. The product bar is a physically honest,
simulation-ready, buildable robotics contract with provenance, not arbitrary
surface-perfect CAD. The canonical model carries geometry, parts, mass properties,
compatibility, validation, exports, policies, BOMs, telemetry, and repair history.

The governing doctrine is "not a toy": SI units, sourced or computed physics,
validator sovereignty, provenance everywhere, license-aware exports, and fail-closed
hardware authority.

## 2. Read order and source-of-truth hierarchy

Read in this order for every non-trivial session:

1. `AGENTS.md` — working rules and required gates.
2. `docs/PROJECT-STATE.md` — dated evidence snapshot and current blockers.
3. The newest `CHANGELOG.md` entry — what changed most recently.
4. `docs/ROADMAP.md` — phase goals and exit criteria.
5. `docs/TODO.md` — atomic task ledger with stable IDs.
6. `docs/EXECUTION-ROADMAP.md` — dependency order, workstreams, and acceptance gates.
7. The relevant `docs/systems/*.md` and `docs/BEST-PRACTICES.md` before implementation.
8. `docs/CONTRIBUTOR-ONBOARDING.md` before curating, claiming, assigning, reviewing,
   re-scoping, or reassigning a `good first issue`.
9. `docs/BROWSER-SUPPORT.md` before changing Studio semantics, focus, keyboard or
   pointer interaction, responsive layout, motion, browser detection, worker/local
   fallback, or browser-support claims.
10. `docs/EXTERNAL-ACCEPTANCE.md` before preparing, executing, reviewing, publishing,
   or using evidence from an external user, provider, course, print, lab, or field run.
11. `docs/GOLDEN-ARTIFACTS.md` before changing any registered schema, render,
   physics, validator, corpus, or committed generated-runtime artifact.
12. `docs/THREAT-MODEL.md` before changing authentication, public routes, providers,
   outbound network access, secrets, uploads, workers, callbacks, rate limits, logs,
   or release archive handling.
13. `docs/MJX-DECISION.md` before preparing CPU budget/cost evidence, selecting an
   accelerator, running the three-morphology P7-010 benchmark, or changing its verdict.
14. `docs/MODAL-OPERATIONS.md` before deploying, configuring, invoking, cancelling,
   recovering, measuring, or making a maturity claim about Modal training.
15. `docs/MIGRATIONS.md` before changing Postgres schema, migration SQL/runner,
   persisted-data compatibility, backup impact, or database recovery behavior.
16. `docs/API-EVENT-ARTIFACT-REFERENCE.md`, `docs/API-MIGRATIONS.md`, and
   `docs/DEPRECATIONS.md` before changing gateway routes, authentication classes,
   events, externally consumed artifacts, examples, or removal plans.
17. `docs/COMPATIBILITY.md` before changing schemas, reports, CLI/WASM APIs, replay,
   EnvSpec, consent/export/deletion records, worker artifacts, or version numbers.
18. `docs/REPOSITORY-GOVERNANCE.md` before changing workflows, checks, branch rules,
   dependencies, or releases.
19. `docs/RELEASE.md` before building, tagging, publishing, withdrawing, or verifying
   a validator release.
20. `docs/PUBLICATION.md` before adding registry credentials or publishing crates/npm.
21. `docs/DATA-LIFECYCLE.md` before changing export/deletion, retention, legal holds,
    backup catalogs/adapters, restore behavior, or lifecycle audit evidence.

When documents disagree, use this authority order:

1. Current executable evidence: code, tests, CI, releases, and deployed/field proof.
2. `docs/DECISIONS.md` — binding decisions; supersede with a new decision, never
   silently rewrite history.
3. `docs/FORGE-plan.md` — definitive product vision and architecture.
4. `docs/systems/*.md` — implementation contracts.
5. `docs/PROJECT-STATE.md`, `docs/ROADMAP.md`, `docs/TODO.md`, and
   `docs/EXECUTION-ROADMAP.md` — living execution truth.
6. Historical plans — context only.

If executable evidence contradicts a living status document, update the document in
the same change. Never make code imitate a stale checkbox.

## 3. Current boundary

The repository contains a broad deterministic v0 across the Rust core, React Studio,
Fastify gateway, Postgres data plane, Python workers, and Tauri shell. The standalone
validator v0.1.0 is released and independently verified; the broader product is not
production-proven or ready for live-provider, external-beta, or field claims.

As of the dated snapshot in `docs/PROJECT-STATE.md`:

- the SEC-006 contract/fixture runtime evidence remains anchored at protected PR #31
  and exact post-merge CI `29251978420`/security `29251978330` at `d952f60`; the
  latest verified protected descendant is D49 evidence reconciliation PR #86 at
  `63e144c`. Exact head `c1523c3` passed PR CI `29480985615` and security
  `29480985208`; reviewed tree `c006acb` is byte-identical at the protected squash,
  whose post-merge CI `29481540556` and security `29481540540` pass. The latest
  protected runtime descendant remains D49 target/readback PR #85/`4647a10`, with
  exact PR/post-merge CI/security green. PR #81 owns the
  decision-grade D47 MJX request/report contract while PR #79 owns the
  fail-closed Modal deployment-control contract/fixture; PR #77 owns the source-bound
  controlled-synthetic offline-training evidence; PR #75 owns the
  contract-derived rover/quadruped trainer evidence, PR #70/`f220d25` owns the
  task-v2 waypoint history, PR #68/`9131289` owns object-backed one-click delivery,
  PR #66/`0614272` owns controlled
  MJX-feasibility evidence, PR #64/`d1c4c38` remains the owning seeded-training
  anchor, and PR #62/`1de7974` remains the owning base browser-runtime anchor;
- QA-008's protected implementation anchor is PR #36 at `2589503`, with exact
  post-merge CI `29264679254` and security `29264678863` green; this advances the
  quality/governance boundary, not runtime maturity;
- QA-010's protected evidence-governance anchor is PR #40 at `8708de7`, with exact
  PR CI `29275447135`/security `29275447237` and post-merge CI `29275850838`/
  security `29275851177` green; this makes external acceptance executable but does
  not supply an independent participant, provider, controlled rig, or field result;
- Brief-25 admits 25/25 and every declared first-party verdict matches;
- protected `main` is green in exact PR and post-merge CI/security. QA-012 closed the
  deterministic nightly-parity regression through PR #50 at `6f8509b`: exact head
  `8d4bf63` passed branch nightly `29370725355`, PR CI `29370722178`, and security
  `29370722124`; the protected merge passed CI `29371177801`, security `29371177809`,
  and exact-main nightly `29372161650`. Downloaded artifact `8326520247` binds a
  clean source/checkout to `6f8509b`, records one isolated full-Studio Chromium/
  high-WebGL preflight with no page errors, and passes all six low-WebGL scenes at
  unchanged edge F1 0.957-0.995, 3 draws, and exact 2,208/4,662 triangle counts.
  Current G0 acceptance is restored without changing goldens or thresholds;
- the byte-exact prototype is published as annotated tag `prototype-final`;
- workflow Actions are immutable-SHA pinned and run under a selected allowlist; the
  security workflow emits a validated SPDX source SBOM;
- compatibility policy 1.0.0 is machine-checked across fifteen API/event/format/
  package boundaries; the CLI/WASM facades expose their active versions;
- QA-008 is protected through PR #36: fourteen registered golden artifact families
  are machine-governed, the frozen prototype is immutable, and any registered re-pin
  requires a new append-only evidence record. QA-010 is protected through PR #40:
  its 34th step machine-checks external-acceptance policy across eight milestones.
  QA-004 is protected through PR #44, whose 35th step machine-checks the migration
  runner policy. QA-005 is protected through PR #46; the same isolated-Postgres job
  proves its D38 queue and staged-upload recovery matrix. QA-007 is protected through
  PR #48 at `e89bb15`: the fifteenth family contains eight versioned boundary corpora
  and 89 reviewed cases, and exact PR/post-merge CI/security are green;
- DOC-005 is protected through PR #53 at `22c263b`: its sixteenth registered schema
  family and generator
  exact-matches all 75 Fastify routes, two event families, fourteen compatibility
  domains, and sixteen worker queue kinds, and emits versioned OpenAPI/event/artifact
  references plus migration, example, and deprecation guidance. The complete 36-step
  local gate, exact-head PR CI `29375146614`/security `29375146592`, and post-merge CI
  `29376742319`/security `29376742373` pass;
- GOV-003 maintenance is protected through PR #54 at `41dee2d`: pnpm 11.13.0 uses
  npm's bulk-advisory protocol, dependency build authority is version-exact, exact
  head `00ae9a0` passed CI `29378364147`/security `29378364143`, and post-merge CI
  `29378749550`/security `29378749542` pass;
- DOC-006 is protected through PR #58 at `3078dba`: the canonical onboarding
  contract, maintainer-only curation source, public entry links, sensitive-authority
  exclusions, assignment/reassignment flow, and live seed issues #55-#57 passed
  exact-head CI `29379546230`/security `29379546201` and post-merge CI
  `29380212006`/security `29380212007`. Open issues prove workflow shape, not a
  successful external contribution;
- DOC-006 evidence PR #59 at `484aefa` passed exact-head and post-merge CI/security,
  so the documentation lane is closed without implying that seed issues #55-#57 have
  produced an external contribution;
- P6-010 is protected through PR #60 at `c0f5172`: real Rapier and exact MuJoCo
  3.9.0 execute four contract-derived MJCF scenes with explicit radians, matched
  timestep/substeps, and unchanged tolerances in the existing required worker check.
  Exact head `aa5b133` passed CI `29383163191`/security `29383163204`; protected CI
  `29383489511`/security `29383489520` pass, and worker job `87252899630` retained a
  source-bound passing engine artifact. This closes the deterministic P6 phase exit,
  not SB3 training, GPU performance, diverse third-party imports, or field transfer;
- P7-008 is protected through PR #62 at `1de7974`: a digest-bound real opset-18
  hover policy executes in lazy exact ONNX Runtime Web 1.27.0/WASM against an
  estimator-derived 11-scalar `forge-policy-tensor` 1.0.0 input and feeds bounded
  50 Hz advisories through the 120 Hz Rust motion loop. Exact head `2686d1a` passed
  CI `29387737921`/security `29387737947`; protected CI `29388166478`/security
  `29388166407` pass, and the retained 11-flow browser artifacts prove real WASM,
  completed policy playback, and lazy same-origin ONNX JS/WASM assets. This is real
  fixture-grade browser execution, not a passing learned policy, external model
  storage, hardware authority, or field transfer;
- P7-003 is protected through PR #64 at `d1c4c38`: the gateway freezes an owned
  admitted-model snapshot, the validator re-admits it and emits a Rust-derived
  MuJoCo bundle, and an exact-pinned CPU worker executes seeded PPO/SAC hover
  training, real randomization/evaluation, and deterministic opset-18 export. Exact
  head `d81a03c` passed CI `29393871628`/security `29393871650`; protected CI
  `29394580998`/security `29394580959` pass. Retained artifact `8334594354` binds a
  clean 256-step smoke to `d1c4c38`, and its valid `[1,11] -> [1,4]` ONNX remains
  honestly non-exportable at a zero success score. Overnight passing hover/waypoint
  proof, deployed Modal/GPU evidence, broader archetypes, and external acceptance
  remain open under separate tasks;
- P7-010's controlled feasibility foundation is protected through PR #66 at
  `0614272`. Required CI retained clean artifact `8337556569`, which binds exact
  Python 3.12.13, NumPy 2.5.1, MuJoCo/MuJoCo-MJX 3.9.0, JAX/JAXLIB 0.10.2, the
  frozen request, admitted contract/MJCF, and x86_64 CPU hardware to the protected
  source. Native multithreaded MuJoCo measured 268,902 steps/s versus CPU-backed MJX
  at 54,698 steps/s; float64 parity passed. This reference row remains deliberately
  decision-ineligible: exact D12 quad/rover/legged, declared accelerator,
  overnight/tier-2 budget, cost, and the existing 3x cost-normalized rule still own
  the adoption decision;
- P7-010's decision-grade D47 contract is protected through PR #81 at `d19c911`.
  Exact head `6c633d5` passed PR CI `29465812702`/security `29465812703`; the
  protected squash passed CI `29466150120`/security `29466150113`. Downloaded
  artifact `8363066891` binds a clean v1 smoke to `d19c911`, passes float64 parity,
  and correctly refuses decision eligibility because the D12 proxy, declared
  accelerator, overnight/tier-2 budget, cost, and cost-normalized-throughput rows
  remain absent. D47's exact three-proxy v2 request, authority/budget/cost hashes,
  GPU/TPU no-fallback enforcement, centralized verdict, and runbook are protected;
  a real clean supported-accelerator v2 result is not. The current Darwin arm64 host
  exposes no Modal credential names, Modal CLI, NVIDIA device, or other declared
  GPU/TPU authority, and Apple Metal cannot satisfy the frozen float64 protocol;
- P8-012/D48 is protected through PR #83 at `fd26845` and closes Desktop
  serialport-rs at deterministic/native transport integration maturity. Exact head
  `758fd9a` passed PR CI `29468611033` and security `29468611094`; the reviewed tree
  is byte-identical at protected `main`, whose post-merge CI `29468966929` and
  security `29468966748` pass. Worker and
  Desktop independently enforce `forge-bridge-config/1.0.0`, Betaflight 2025.12,
  the D12 quad, one 2–200 decisecond `failsafe_delay`, exact ordered-line SHA-256,
  no-auto-arm, physical confirmation, 115200 baud, and an OS-enumerated port. Four
  locked Rust tests include real Unix pseudo-terminal byte proof and path refusal;
  the complete 40-step gate, 225 worker tests, 66 gateway tests, and Desktop native
  compile pass. The receipt leaves target firmware/application unverified and
  requires readback. This protected proof is not a real FC, HITL, lab, tethered, or
  field result. Protected D49 keeps the D48 artifact unchanged
  but gates receipt 2.0.0 on props-off confirmation, bounded pre/post stable
  `2025.12.x` identity, exact set/save acknowledgement, reboot/reconnect, and exact
  `failsafe_delay` readback across two real pseudo-terminal sessions, with SHA-256
  digests for the four authoritative response byte streams. That remains protected
  local protocol integration only until executed on the named FC;
- D50/P8-013 is an unprotected local recorder candidate on exact protected
  `63e144c`: one exclusive in-shell thread captures bounded, versioned, contiguous,
  strictly time-increasing serial JSONL into a no-overwrite recorder-archive v1,
  canonical append-only frames, and sparse byte-offset index; clean stop drains,
  flushes/syncs, finalizes replay v1, hashes frames/index/replay, and only then emits
  receipt v1 under an aggregate 512-MiB cap. D30/D12/consent/OS-enumerated-source
  gates, persisted capture-confirmation, privacy/no-training/no-auto-arm defaults,
  and false device attestation remain explicit. Real
  pseudo-terminal proof plus the complete 40-step local gate under Python 3.12.13
  covers mechanics only; protection, adapter/device identity, OS suspend,
  WebSerial/WebUSB, lab/field, ghost/system-ID, and recorded-device training
  authority remain open;
- P7-011 is protected through PR #68 at `9131289`: migration 0022, the D38/D39
  lease-fenced content-addressed writer, byte-free job/policy authority,
  authenticated retained-model delivery, and Studio one-click queue/poll/fetch/play
  are closed at controlled S3-compatible sandbox maturity. Exact head `433ff3b`
  passed CI `29408733457`/security `29408733461`; protected CI `29409341830` and
  security `29409342305` pass. Downloaded artifact `8340587390` self-binds to clean
  `9131289`, proves one winner across two attempts, stale-upload prevention, no
  inline persistence, pre-upload digest-substitution refusal, cancellation without
  database authority, exact retained-object readback, 22 migrations, all 11
  production-browser flows, and the three declared browser tiers. OPS-006 still owns
  orphan reconciliation; production object-storage durability/SLO, passing learned
  policy quality, deployed GPU operations, external users, and field transfer remain
  open;
- the P7-014 waypoint slice is protected through PR #70 at `f220d25` and implements
  D41 `p7-v2`/`2.0.0` task authority:
  every built-in 3D task is explicitly Forge Y-up/right-handed/SI and canonically
  hashed, while `p7-v1` stays historical. The real MuJoCo/SB3 command now supports
  hover-hold and sequential waypoint-chain with estimator-only target advancement,
  exact task-bound ONNX/scorecard/provider authority, Studio target-chain playback,
  and a dual 256-step deterministic CPU smoke. Exact head `b66e4b3` passed PR CI
  `29413578031`/security `29413578124`; protected CI `29415036211` and security
  `29415036274` pass. Downloaded artifact `8342801418` self-binds to clean `f220d25`
  and retains two valid, correctly non-exportable task-bound ONNX policies. D40's
  prerequisite for P7-012 was satisfied; the later D44/PR #75 ground implementation
  closes the rover/legged trainer requirement without rewriting this history;
- P7-012 is closed at controlled consumer-hardware simulation maturity. PR #72 and
  protected `8e094c0` own the executable implementation; PR #73 and protected
  `6bfa60f` own the retained JSON/ONNX evidence. It advances current multirotor
  training to D42 policy tensor 2.0.0 `[1,14]`, `trainingMuJoCoBundle` 2.0.0, and
  `p7-v3`/3.0.0 while retaining an executable tensor-v1 observer/ONNX oracle. It
  fixes Forge Y-up angular-axis order, adds estimator body velocity, interprets
  normalized flight targets around contract hover trim, freezes an estimator-only
  distillation plus randomized-PPO curriculum, and adds atomic interruption/resume/
  tamper-checked evidence. Exact head `1bce0d1` passed PR CI `29425066833` and
  security `29425066479`; protected implementation CI `29426237373` and security
  `29426237345` pass. Evidence head `ecc83d0` passed CI `29428754530` and security
  `29428751871`; protected evidence `6bfa60f` passed CI `29429475932` and security
  `29429476183`. From a clean protected checkout, an intentional post-hover
  interruption and
  validated resume retained the exact hover/waypoint JSON and ONNX files under
  `docs/evidence/p7-012/`; both score 1.0 baseline and every mass/Kv/wind robustness
  row. All 163 worker tests and 12 Studio runtime tests pass. D43 selects CPU
  after the same 4,096-step MLP PPO pilot measured MPS about 12.4x slower, inventories
  but does not claim the 19-core MPS device as the training backend, and permits only
  an explicitly non-measured 140 W adapter-rating wall-time upper bound. This is not
  deployed GPU, measured electricity, external-user, real-device, or field proof;
- P7-014's ground implementation is protected through PR #75/`90b1691` under D44.
  It adds independent
  `groundTrainingMuJoCoBundle`, `p7-ground-v1`, and
  `forge-ground-policy-tensor` 1.0.0 authorities for exactly rover line-follow and
  quadruped walk-to-target. Rust derives mass/inertia, contact plane, wheel geometry,
  joint order/limits, and torque/velocity ceilings from the admitted contract; Python
  independently revalidates those authorities, trains only on estimator/encoder
  state, evaluates mass/torque/friction, and labels energy as simulated positive
  mechanical joint work. Unsupported tasks/morphologies, missing authority, task or
  tensor drift, and external substitution fail closed. The required smoke candidate
  runs four real 256-step CPU PPO tasks. The exact implementation head's complete
  39-step local gate passed; `c0f3a8f` then passed
  PR CI `29433820358` and security `29433818798`; protected squash `90b1691` passed
  post-merge CI `29448974932` and security `29448974951`. Downloaded artifact
  `8356753424` binds clean protected source `90b1691`; its JSON SHA-256 is
  `20f0c25d…56ba`, and all four embedded ONNX graphs independently parse, validate,
  and match their declared bytes, digests, tensor layouts, task hashes, and contract
  hashes. The protected required matrix retains 174 worker tests and 13 Studio runtime
  tests. This closes P7-014 at controlled deterministic trainer maturity. Studio
  deliberately refuses the ground tensor; passing learned ground policies, browser
  execution, device transfer, external acceptance, and field proof remain separate;
- P7-009 is closed at controlled-synthetic offline-training maturity through PR #77/
  protected `2c7562d` under D45. Exact head `8cb70c4` passed PR CI `29455576345` and
  security `29455576393`; the synthetic merge `3bb877f` has exact parents `f0bb4e2`
  and `8cb70c4`; and protected-main CI `29456064537`/security `29456064498` pass.
  The gateway queues one consented owned telemetry log only through local/Modal,
  binds it to the same admitted snapshot, and injects the tape/hash server-side.
  Exact tape/dataset/warmstart 1.0.0 authorities reject sample, task, tensor, truth,
  action, timestamp, and lineage drift. The native command performs 12 behavior-
  cloning epochs then 256 recipe-owned randomized PPO steps through the existing
  flight or ground trainer, ONNX exporter, and unchanged scorecard. A repeated
  hover/rover controlled-synthetic smoke has identical dataset, warmstart-parameter,
  and ONNX digests and correctly blocked scorecards; the complete 40-step gate and
  isolated 23-migration Postgres/MinIO/browser matrix pass with 188 worker tests,
  65 gateway tests, and 17 generated worker families. Downloaded protected artifact
  `8359446894` self-binds to clean `2c7562d`; its offline JSON SHA-256 is
  `d1fe7f7a…ac66`, and independent decoding validates exact 23,874-byte hover and
  22,520-byte rover opset-18 graphs. This closes P7-009, not recorder/device/field
  data, learning quality, deployment, passing-policy delivery, or external acceptance;
- P7-013's D46 contract/fixture boundary is protected through PR #79 at `ff39cd8`:
  exact Modal SDK 1.5.2 and one source-bound
  `forge-workers.train_policy_gpu` L4 function, local sovereign bundle compilation,
  exact CUDA authority without fallback, durable provider-call attempt history,
  shared Postgres active/daily-credit quota authority, owner cancellation and exact
  pre-materialization credit reversal, migration 0024, a strict sandbox-evidence
  validator, and `docs/MODAL-OPERATIONS.md`. Arbitrary Modal fields fail before
  enqueue; the provider receives only reviewed training controls plus the sovereign
  bundle, and an ambiguous persisted call is recovery-only. Exact head `bc02324`
  passed PR CI `29462960862`/security `29462960834`; protected squash `ff39cd8`
  passed CI `29463344103`/security `29463344085`. Downloaded protected artifact
  `8362121226` self-binds the 24-migration Postgres/browser fixture matrix to clean
  `ff39cd8`. This is protected contract/fixture evidence, not a deployment or
  credentialed provider result. P7-013 stays `[~]` until a clean protected revision
  completes the real L4, billing/tag, alert/SLO, spend-stop, cancellation/late-result,
  application-artifact deletion, verified automatic provider-call expiry, and
  persisted-call recovery exercise;
- QA-002 is protected through PR #38: the production Studio bundle, real built WASM,
  downloaded validator artifact, gateway, and isolated Postgres established its ten
  builder flows; PR #62 extends the current protected suite to eleven with real ONNX
  policy execution. This is deterministic product acceptance, not live-provider or
  external-user proof;
- QA-003 is protected through PR #42 at `9c1802b`: the production share/configurator
  journey passes in Chromium, Firefox, and WebKit with real WASM plus semantic,
  keyboard, focus, contrast, target-size, responsive, and reduced-motion assertions.
  Chromium loads the full WebGL scene; Firefox/WebKit prove the dependency-light
  core-baked Canvas2D schematic without loading Three.js/WebGL. Exact PR and
  post-merge CI/security plus the clean exact-revision artifact are green; this does
  not prove Apple/mobile devices, assistive technologies, external users, or field
  maturity;
- QA-004 is protected through PR #44 at `e362c54`: D37's advisory-lock runner
  validates an exact contiguous checksummed prefix and commits each migration with
  its ledger row atomically. Exact PR and post-merge CI/security are green; the clean
  merge artifact binds source/checkout to `e362c54` and proves 20/20 clean install,
  all 19 populated predecessors, preservation/idempotency, failure recovery, history
  refusal, and concurrent apply-once behavior. Production backup/restore, capacity,
  and measured RPO/RTO remain OPS-005;
- QA-005 is protected through PR #46 at `7970005`. Exact implementation head
  `5663900`, PR CI `29291536114`/security `29291536115`, synthetic merge `99024b8`,
  and post-merge CI `29292041469`/security `29292041441` are green. The clean
  revision-bound artifact proves 21 migrations plus D38 crash reclaim, one-winner
  materialization, bounded outage/rate retries, cancellation/stale-result refusal,
  partial-upload recovery, and exact staged-upload completion. This is deterministic
  isolated-Postgres maturity, not multi-replica, deployed object-provider, or SLO
  evidence;
- the frozen prototype is the complete historical parity oracle and predates slot
  variants; D32 forbids fabricated extraction, while ModelSpec 2.2/XC-28 defines one
  explicit equipped alternative across contract, validator, geometry, simulation,
  lockfile, BOM, WASM, and Studio;
- the protected runtime lineage contains ModelSpec 2.2/XC-28, D10 manufacturing-
  license enforcement, and SEC-002 pre-retrieval/provider prohibited-brief refusal
  with non-content audit rows plus the SEC-006 application boundary; none of these
  prove live-provider operations;
- SEC-003..005 on protected `main` prove versioned owner-scoped export, primary Postgres and
  S3-compatible deletion, purpose/subject consent grants and withdrawals, bounded
  retention, time-bounded legal holds, pseudonymous tombstones, backup catalog/
  expiry adapters, and pre-restore suppression; production backup/restore remains
  `OPS-005` and is not implied by deterministic local evidence;
- most P5-P12 live providers, hardware steps, and external proof remain gated;
- the completed SEC-006 contract/fixture boundary adds pinned-origin authentication,
  header-only ephemeral provider credentials, bounded JSON/network/process/object/
  archive boundaries, prompt-injection containment, classed rate limits, and
  adversarial tests; production egress enforcement, distributed quotas, secret
  rotation, and incident exercises remain operations gates;
- the protected P3/P4 ETL adapter has a native Anthropic Messages API contract using the
  pinned Haiku 4.5 snapshot, forced strict tool use, exact-host bounded HTTPS,
  delimiter-safe untrusted-source prompts, local canonical-row validation, and
  extraction provenance. Fixture and deployment-command paths remain first; no
  credentialed sandbox call, live OCCT artifact, or provider operation is implied;
- protected P11-005 contract/fixture work now gives vendor refresh one idempotent
  local `commerce.vendor-refresh` queue path: the worker alone may invoke
  `FORGE_VENDOR_REFRESH_CMD`, and accepted offers are revalidated and materialized
  transactionally. This does not prove a credentialed provider sandbox, deployed
  egress/quotas/telemetry/recovery, billing, current terms, or purchasable BOM use;
- `main` has an active PR-only exact-check ruleset; annotated validator tag `v0.1.0`
  and its nine-asset GitHub Release were built from protected `1093842`, attested,
  downloaded after publication, and independently re-verified;
- crates.io/npm publication remains explicitly deferred to owner-scoped credentials.

Do not repeat these facts without re-running or re-checking them. Update
`docs/PROJECT-STATE.md` whenever the boundary materially changes.

## 4. Runtime and ownership boundaries

| Area | Home | Rule |
|---|---|---|
| Contract/schema | `crates/forge-contract`, `schema/` | Rust types are the source; generated schema/TS types must not drift; every non-empty slot explicitly equips one unique variant |
| Geometry/DfM | `crates/forge-geometry` | Deterministic, SI-unit, test-backed; no presentation-only truth |
| Motion/drivers | `crates/forge-motion` | Versioned data-driven drivers; no executable code in contracts |
| Simulation/export/import | `crates/forge-sim` | Rapier interactive; MuJoCo training-canonical; parity on upgrades |
| Admission | `crates/forge-validate` | The validator is sovereign; fix artifacts, never weaken checks to green them |
| Browser facade | `crates/forge-wasm`, `packages/studio` | Core truth in WASM; React/Three.js remain presentation and interaction; support tiers and accessibility acceptance are owned by `docs/BROWSER-SUPPORT.md` |
| API/data/platform | `packages/gateway`, `infra/migrations`, `contracts/documentation.json` | Validate writes, scope ownership, fail closed, preserve audit history; registered routes and TypeBox request schemas generate the versioned API/event/artifact reference without hand-edited drift; policy reads cross-check owner/job/model/scorecard/tensor/lineage/object bytes |
| Compute | `workers` | Deterministic fixture oracle plus explicit live adapter; no public worker surface; D38 attempt leases fence retries and late output; D39 makes inline policy bytes transient and permits one exact job-bound durable policy only |
| Desktop/hardware | `packages/desktop` | D30/D12 lab gates, physical confirmation, no auto-arm, supervisor authority |
| Catalog | `catalog` | Citations, immutable revisions, review state, license and export policy required |
| Plans/status | `docs` | One fact, one owning document; status follows evidence |

Equipped-variant boundary (D32/XC-28):

- only `slots[].equippedVariantId` selects physical truth; array order is never a
  default and unselected alternatives are inert for geometry, mass, simulation,
  lockfile resolution, validation, exports, and BOMs;
- 2.1 migration may auto-equip a sole alternative, but it must refuse to guess among
  multiple alternatives until the author records an explicit choice;
- flattened baked parts carry source JSON Pointers. Studio patches those pointers and
  preserves inspection state by source identity, not by unstable flattened index.

License-export boundary (D10/SEC-001):

- manufacturing export jobs require a complete license ledger record for every
  assembly asset; missing, unknown, contradictory, or unsafe link evidence fails
  before a provider runs;
- `open` geometry may export in full, `attribution` geometry also requires the
  versioned license manifest, and `no-redistribution`/`view-only` geometry is replaced
  by a dimensioned envelope plus datum ports and an HTTPS BOM link-out;
- external OCCT output is untrusted. It must prove the requested manifest hash and
  required attribution/restriction behavior; exporters retain only allowlisted
  metadata and policy-safe artifact references.

Prohibited-brief boundary (SEC-002):

- screen briefs before catalog/pattern retrieval, synthesis, provider transport,
  course generation, or model editing. The guarded surfaces are context, generation,
  streaming generation, course generation, and model edit; direct generation-library
  callers retain an independent assertion;
- the versioned deterministic detector is the admission boundary. Prompt instructions
  and provider moderation are defense in depth and never override a local refusal;
- refusal rows contain only the prompt SHA-256, length bucket, policy/detector
  versions, matched categories/rule IDs, surface, requested provider/archetype, and
  optional owner. Never persist or return the raw refused prompt or a provider key;
- refusal auditing is fail-closed: if the metadata row cannot be written, no
  retrieval, synthesis, provider, edit, or environment-generation action may run.
  Rule changes require benign-language, adversarial-normalization, secret-redaction,
  audit-failure, and every-surface regression tests.

User-data lifecycle boundary (D33/SEC-003):

- `GET /v1/account/export` is an authenticated repeatable-read snapshot. Keep its
  format versioned, enumerate new owner-scoped tables explicitly, provide blob
  download endpoints, and never include OAuth access/refresh/ID tokens, session or
  verification tokens, or provider API keys;
- `DELETE /v1/account` requires the exact confirmation phrase, a serializable owner
  lock, explicit purge of every owned/derived row, and S3-compatible payload deletion
  before commit. Do not rely on `ON DELETE SET NULL`, which anonymizes ownership but
  leaves user content behind;
- object deletion failure rolls the database transaction back. Test success,
  authorization, malformed confirmation, secret exclusion, storage failure, a real
  populated Postgres lifecycle, and an S3-compatible upload/delete/404 smoke;
- receipt 2.0.0 proves primary database/object deletion and creation of
  restore-suppression tombstones. It never proves physical backup deletion; only a
  catalogued provider adapter result plus restore evidence may make that claim.

Consent boundary (D34/SEC-004):

- consent is an append-only event ledger, never a mutable flag. Every grant and
  withdrawal binds ledger version, purpose, owned subject, current policy version,
  exact notice SHA-256, prior event, bounded non-content evidence, and idempotency;
- the five independent purposes are photoscan processing per object, telemetry
  sharing per log, pattern contribution per model, leaderboard publication per
  account, and training reuse per telemetry log. A grant for one never authorizes
  another, and a stale policy/hash is inactive until the owner grants the current
  notice;
- lock the owner and validate current consent in the same serializable transaction
  that starts processing, sharing, contribution, publication, or training reuse.
  Direct job-library entry points retain the same assertion; UI state is not
  authority;
- withdrawal appends history and immediately cancels queued/running affected jobs,
  makes telemetry private, removes contributed patterns or leaderboard rows as
  appropriate. It does not claim in-flight provider recall, primary content
  deletion, legal-hold expiry, or backup erasure; those use account deletion and
  SEC-005 lifecycle proof;
- authority chronology uses monotonic `event_sequence`, not timestamps or random
  IDs. Same-timestamp grant/withdraw or place/release pairs must resolve causally.

Data-lifecycle boundary (D35/SEC-005):

- lifecycle 1.0.0 defines six data classes, a 30-day maximum backup window, a
  45-day pseudonymous tombstone window, bounded primary audit/job/auth periods, and
  a 400-day pseudonymous lifecycle-audit period. These are versioned product
  defaults, not universal legal conclusions;
- legal holds are append-only, subject-digested, reason-coded, reference-only, and
  expire within 365 days unless a new reviewed event renews them. A hold permits
  retention only; it never authorizes use, training, sharing, or operator browsing.
  Hold mutation, backup register/restore evaluation, and deletion must share globally
  ordered transaction-scoped locks for the affected user and objects so authority
  cannot race a purge;
- deletion receipt 2.0.0 creates user/object tombstones and suppresses pre-deletion
  restore through backup expiry. Every backup must be catalogued with manifest hash,
  covered subject digests, affirmative delete deadline, provider adapter evidence,
  exact subject-manifest idempotency, and retryable failure state. Provider deletion
  adapters are idempotent and stale in-progress claims are reclaimed only after the
  bounded lease. Reject a copy captured after its subject's primary deletion; a
  valid late-catalogued pre-deletion copy reopens tombstone completion until erased;
- no restore enters primary storage before exact manifest and tombstone checks.
  Local Postgres fixtures prove the contract; real encrypted backup automation,
  provider deletion receipts, sandbox restores, RPO/RTO, and DR promotion remain
  `OPS-005`.

Application threat boundary (SEC-006):

- production auth uses an explicit credential-free HTTPS origin and strong secret;
  untrusted forwarded hosts never reach Auth.js, built-in CSRF remains enabled,
  unsafe cookie requests require the trusted origin, and development identities are
  forbidden in production;
- HTTP generation accepts BYO provider credentials only through the dedicated header.
  It never reads a server-key fallback, serializes the key into generated-artifact,
  usage, or model records, reflects it in errors, or records it in product logs;
- all request/provider/job/object/worker/archive inputs have explicit size, depth,
  time, content, and destination bounds. External HTTP is credential-free HTTPS,
  redirect-free, exact-host where known, public-address checked, and structurally
  validated; production still requires connection-time egress enforcement because
  application DNS checks cannot eliminate rebinding;
- prompt and retrieval text are untrusted data. Local prohibited-brief refusal,
  reviewed-catalog policy, bounded tool output, allowlisted provider results, and the
  sovereign validator remain the hard controls;
- worker ETL credentials come only from deployment configuration, stay in the
  `x-api-key` header, and are absent from request JSON, command payloads, persistence,
  and errors. The native provider envelope uses Anthropic's supported strict-schema
  subset; its JSON string is reparsed under local byte/depth/node/type/license/price/
  citation checks before it can reach catalog admission or review;
- live vendor results never travel directly from an HTTP route into purchase truth.
  The gateway queues only a local, idempotent `commerce.vendor-refresh` job; the
  dedicated commerce route and generic job entry point share the same bounded
  component/timeout/no-inline-offer contract; the worker requires
  `FORGE_VENDOR_REFRESH_CMD`, sanitizes held rows, and bounds offer count, strings,
  price, currency, availability, public HTTPS links, rate limits, timeout, and
  provenance;
- successful vendor offers are validated a second time and inserted inside the same
  Postgres transaction that marks the job successful. Any invalid accepted row rolls
  back the job success and every offer insert; the runner then marks the job failed
  without stopping the worker loop. Sandbox links remain a separate, synchronous,
  explicitly `sandbox` path and may never be labeled provider truth;
- client job idempotency is owner-scoped before persistence using a domain-separated
  digest. Exact retries return the original job without rematerializing fixture
  outputs; reusing a key for a different kind/provider/input returns conflict, and a
  second owner may safely use the same client key;
- the in-memory classed limiter is valid for deterministic and single-process proof
  only. Shared atomic rate, concurrency, and spend controls are required before a
  multi-replica or billable-provider claim. The complete control/residual-risk matrix
  is owned by `docs/THREAT-MODEL.md`.

Queue and client-upload fault boundary (D38/QA-005):

- non-fixture jobs are at-least-once. A claim increments the bounded attempt count,
  assigns an opaque token and expiry, and passes the persisted timeout to the handler;
  only that current unexpired token may retry, fail, succeed, or materialize output;
- an expired lease is reclaimable under a new token. A stale duplicate, cancelled
  attempt, timed-out completion, or result arriving after another attempt wins is
  discarded. Cancellation clears the lease; it always outranks worker completion;
- provider outage, rate limit, process timeout, and incomplete-object faults use
  stable codes and deterministic bounded backoff. Unknown/invalid results fail
  terminally; max-attempt exhaustion cannot silently requeue forever;
- authenticated client objects start `staged`. Upload contracts carry declared size
  and MIME type, while the signature binds the checksum;
  `POST /v1/blobs/:id/complete` independently inspects the stored object and
  compare-and-sets `complete` only for the unchanged declaration.
  Staged/mismatched objects cannot be downloaded or grant photoscan authority;
- these controls prove deterministic/local and isolated-Postgres recovery only.
  Multi-replica capacity, durable dead-letter operations, provider circuit breakers,
  shared quotas, object-provider incident drills, and SLO evidence remain OPS-003,
  OPS-004, OPS-006, OPS-007, QA-006, and QA-009.

Cross-boundary adversarial evidence (QA-007/QA-008):

- `evals/fuzz/boundaries/` is one registered golden family with exactly eight files:
  imports, JSON Patch, EnvSpec, replay, provider output, catalog citations, export
  policy, and hardware payloads. Case IDs are stable and globally unique; removals,
  changed outcomes, or new files require the QA-008 append-only review procedure;
- `pnpm fuzz:contract:check` runs both the existing ModelSpec seed oracle and the
  boundary-corpus structure check without adding another full-gate step. Rust tests
  consume patch/import/EnvSpec/replay cases; Python 3.12 workers consume replay,
  provider, citation, export, and hardware cases;
- non-finite SI values, malformed imported numeric attributes/graphs, unsupported
  patch behavior, unbounded or non-finite provider/replay payloads, invalid citation
  confidence or URLs, contradictory D10 export policy, command-token injection,
  duplicate telemetry time, and malformed supervisor state must fail closed. A
  refusal case is never re-pinned to acceptance merely to make a test green;
- this corpus proves deterministic fixture behavior only. It does not replace
  external imported-model diversity, credentialed providers, controlled hardware,
  production load/fault drills, or field evidence.

External acceptance boundary (QA-010/EXT-001..008):

- the versioned registry and CLI under `docs/external-acceptance/` and `scripts/`
  define and structurally validate builder, photoscan, training, course, controlled
  lab, print, marketplace, and maintenance evidence; generated templates are not
  proof and cannot close an external task;
- initialize run packs outside the repository. Git may contain only a reviewed,
  minimized record with pseudonymous roles, exact revision/deployment, content-
  addressed evidence references, measurements, findings, limitations, and signoffs;
  never raw identity, photos, telemetry, provider payloads, signatures, signed URLs,
  or credentials;
- freeze revision, environment, participants, authority, criteria, and thresholds
  before a run. Preserve `failed` and `stopped` outcomes; a changed product,
  deployment, participant, or criterion starts a new linked run;
- independent builders, competitors, verifiers, and equippers receive no repository
  access, private owner state, hidden fixture knowledge, direct database authority,
  or implementation coaching. They may not also fill owner/facilitator roles;
- a structurally valid manifest proves evidence completeness only. The acceptance
  owner must resolve and hash-check retained artifacts, inspect role separation and
  authority, bind the exact protected revision/checks, review limitations, and then
  reconcile the owning `EXT-*`, phase, gate, maturity, risks, and changelog;
- controlled hardware evidence remains D30/D12-only: rover before quad, local
  provider, physical confirmation, no-auto-arm, supervisor and kill authority,
  telemetry consent, signed lab record, and external beta disabled. D48 bridge-config
  v1 is additionally Betaflight 2025.12/D12-quad/failsafe-only, canonical-hash bound,
  115200 baud, and OS-enumerated-port only. A serial receipt proves bytes transmitted,
  never target-version match or applied configuration; retain handshake/readback
  before any device claim;

## 5. Session protocol

1. Check `git status --short --branch`, current branch/worktree, recent commits, and
   active remote PR/check state before selecting work.
2. Read the current-state snapshot, roadmap, relevant TODO rows, execution lane, and
   system docs.
3. Select the smallest dependency-complete slice. Mark its TODO `[~]` only when work
   actually starts.
4. Add or update tests with behavior. New validator invariants require stable check
   IDs, diagnostics, fixtures, and documentation.
5. Before changing a registered golden artifact, preserve the failing parent evidence,
   change the owning source of truth first, and add one new append-only record under
   `docs/golden-updates/`; never edit the frozen prototype oracle.
6. Run the gates appropriate to the changed surfaces. Do not claim full verification
   when prerequisites caused tests to skip.
7. Update every living document invalidated by the change. Preserve stable TODO IDs;
   mark tasks done rather than deleting them.
8. Add a newest-first `CHANGELOG.md` entry containing evidence, affected IDs, next
   step, and blockers.
9. Before handoff, run `git diff --check`, run the cumulative committed-range check
   through `node scripts/check-patch-hygiene.mjs`, inspect the complete diff, and
   report both passing and failing gates.

Shared checkout rules:

- Preserve unrelated user/agent changes.
- Check the live task/claim state before taking an overlapping lane.
- For a curated first issue, require a current maintainer assignment before work;
  follow the documented seven-day update and reassignment flow, and keep excluded
  security/data/hardware/format/golden/release authority out of the issue.
- Prefer a `codex/<lane>-<scope>` branch for implementation or publication work.
- Rebase/merge conservatively and re-run gates on the resulting tree.
- Do not use destructive reset/checkout operations to discard work.

## 6. Status vocabulary and definition of done

Task states in `docs/TODO.md`:

- `[ ]` open — not started.
- `[~]` in progress — partial implementation or proof exists.
- `[x]` done — code, tests, docs, and required proof are complete.
- `[!]` blocked — an explicit external/owner/lab prerequisite prevents progress.

Capability maturity must be stated separately:

- **contract** — interface/schema exists;
- **fixture** — deterministic keyless implementation proves the shape;
- **sandbox** — real provider path works in a controlled external environment;
- **live** — production-configured path works with observability and recovery;
- **field-proven** — acceptance evidence exists from intended users or hardware.

An adapter, table, button, or fixture does not close a live or field criterion.

Definition of done for a normal implementation task:

- behavior implemented at the correct architectural layer;
- success, failure, authorization, and boundary cases tested;
- deterministic/local acceptance path retained;
- live capability explicit and fail-closed when unconfigured;
- relevant schema/API/system/status docs updated;
- security, privacy, provenance, license, and hardware gates applied;
- required local and remote checks green;
- changelog entry records verifiable outcome.

## 7. Required validation by change type

Use the narrowest sufficient set, then run the full release gate before phase closure.

| Change | Minimum gates |
|---|---|
| Rust core/validator | `cargo fmt --all --check`; `cargo clippy --workspace -- -D warnings`; relevant tests; `cargo test --workspace`; schema/golden/declared-verdict checks when affected |
| Schema/contract | `pnpm codegen:contract`; generated diff review; migration/property/fuzz tests; native/WASM golden comparison |
| Gateway API/event/artifact docs | `pnpm docs:contracts`; inspect generated OpenAPI/reference/catalog diff; `pnpm verify:docs-contracts`; `pnpm verify:compatibility`; append-only golden review record; gateway build/tests; full `pnpm verify` before closure |
| Registered golden/generated artifact | `pnpm verify:goldens`; new append-only review record; registry-named focused regeneration and verification; compatibility review when flagged |
| Visual parity/nightly | `pnpm --filter @forge/studio build`; `pnpm parity`; inspect the matching source/checkout SHA and clean-worktree identity in `artifacts/parity/{preflight,metrics}.json`, renderer preflight, metrics, and all six composites; require full-Studio Chromium/WebGL and unchanged gates; branch nightly for harness changes |
| Cross-boundary parser/fuzz corpus | `pnpm fuzz:contract:check`; Rust contract/sim boundary tests; Python 3.12 worker suite; registered-golden review; full `pnpm verify` |
| Simulation engine/exporter | `cargo test -p forge-sim -p forge-validate`; `pnpm sim:parity:check`; for engine/exporter changes install `workers[dev,mujoco]` and run `pnpm sim:parity:live`; inspect source/provider/unit/timestep/substep-bound artifacts; append-only golden review for registered output; require the real-engine worker check before closure |
| Studio | `pnpm --filter @forge/studio typecheck`; build; `FORGE_BROWSER_SUPPORT=1 pnpm verify:browser-support` for semantics/interaction/layout/support changes; `pnpm verify:browser-e2e` against an explicit migrated isolated DB for builder-loop changes; QA-006 evidence for performance claims |
| Gateway | build/typecheck; full gateway tests with `forge-validate` built; Postgres-backed tests for persistence paths |
| Workers | Python 3.12 environment; `pnpm --dir workers test`; live-adapter contract tests when touched; for native training install exact `workers[dev,mujoco,training]`, run both PPO/SAC focused tests plus `pnpm training:smoke`, inspect runtime pins/source/lockfile/dependency-manifest/contract/config/model digests and honest nonclaims, and run the pinned local `pip-audit`; for P7-009 additionally run `pnpm training:offline-smoke`, require one gateway-owned consented source log and exact tape/dataset/warmstart hashes, reject task/tensor/truth/action/timestamp/sample/provider substitution, prove the frozen BC-to-randomized-PPO stages plus optimizer update and same-seed dataset/warmstart/ONNX digests, apply the unchanged scorecard, and state controlled-synthetic versus recorder/device/field maturity; for P7-012 additionally prove tensor-v1/v2 execution/refusal, exact device authority with no fallback, frozen recipes/thresholds/seeds, all baseline/mass/Kv/wind rows, atomic interruption/resume, request-hash and ONNX size/digest/export validation, safe hardware metadata, separate simulated-vehicle and host-energy fields, cost/nonclaims, exact retained policy bytes, clean protected source, and downloaded evidence; for P7-010 install `workers[dev,mujoco,training,mjx]`, retain `pnpm sim:mjx:feasibility` as the immutable v1 harness check, and follow `docs/MJX-DECISION.md` for v2: exact ordered proxy/authority hashes, 12-hour scorecard and 200-candidate budget artifacts, current provider USD/hour evidence, clean protected source, float64, resolved CUDA/ROCm GPU or TPU with fallback forbidden, all compile/sample/parity/cost-normalized measurements, centralized verdict/blockers, and independent retained hashes; CPU/Metal/reference feasibility never authorizes a decision; for P7-013 install exact `workers[dev,mujoco,training,deployment,queue]`, test the exact deployment contract/evidence validator, CUDA refusal and no-fallback authority, provider-call persistence/cancellation/recovery, shared quota/debit/refund transactions, and migration 0024; a real sandbox close additionally requires a clean protected revision, immutable deploy/function/image identity, successful L4 run, billing/tag reconciliation, alert/SLO delivery, cancellation and late-result refusal, application-artifact deletion, verified automatic provider-call expiry within seven days, recovery without duplicate output, and validation by `forge-modal-training-sandbox-evidence/1.0.0`; D38 lease/retry/cancellation/timeout/duplicate/crash matrix for queue changes; for policy delivery prove lease checks before and after upload, one job/one policy, byte-free persistence, digest substitution refusal, cancellation-without-authority, and exact object readback |
| Auth/network/secrets/uploads | threat-model negative tests; production-config failure tests; origin/CSRF/authorization tests; secret persistence/reflection scan; SSRF/redirect/DNS/body/timeout tests; rate/cost boundary; worker and archive bomb tests |
| Data/migrations | `pnpm db:migrations:test`; forward migration on clean DB and every supported populated predecessor; exact ledger/checksum/idempotency evidence; injected failure and concurrency proof; rollback/roll-forward plan; backup impact review; `pnpm verify:db` including browser acceptance; run `python workers/integration/assert_commerce_postgres.py` when commerce queue/materialization changes; retain `db:assert-upload-faults` and `db:assert-queue-faults` for D38 queue/object changes; run `pnpm db:assert-policy-delivery` against isolated Postgres/S3-compatible storage for D39 policy materialization; run `pnpm db:assert-modal-operations` for P7-013 provider-call/cancellation/refund and idempotent report-bound cost-reconciliation authority |
| User data/privacy | authenticated export/delete tests; populated Postgres lifecycle; secret-exclusion assertions; object-store failure rollback; S3-compatible upload/delete/404 smoke; explicit backup-scope statement |
| Desktop/hardware | scaffold tests plus `pnpm verify:desktop-native`; locked Desktop Cargo fmt/Clippy/tests; D30/D12 gate tests; no-auto-arm/props-off physical-confirmation/supervisor assertions; for D48 config writes prove exact schema/firmware version/command/range/hash, 115200 baud, OS-enumerated-port refusal, real pseudo-terminal bytes, and receipt-v1 nonclaims; for D49 prove bounded two-session stable-2025.12.x handshake, set/save acknowledgement, reconnect, repeated reported-identity hash, exact readback, SHA-256 binding of the four authoritative raw response streams, v2 receipt semantics, malformed/ambiguous/timeout/partial-state refusal, and CLI-arming-disabled state; execute the exact protocol on the named props-off FC with retained controlled-lab evidence before physical-device or lab claims; for D50/P8-013 prove independent archive/frame/receipt v1 versions, exact consent/D30/D12/OS-enumerated 115200-baud gates, one exclusive in-shell thread, bounded exact artifact/sequence/increasing-time object frames, no-overwrite append-only storage, sparse byte-offset index, drain/flush/sync before replay/receipt, exact frame/index/replay hashes, empty/partial/drift/cap/interruption refusal, private/no-training/no-auto-arm/false-device-attestation semantics, and a real pseudo-terminal round-trip; never call local capture adapter/device, host-suspend, lab/field, ghost/system-ID, or recorded-device proof |
| Generation | Brief-25 corpus check and real-validator gate; provenance; refusal/logging; draft fallback |
| Export/manufacturing | license matrix, restricted-geometry fallback, DfM, artifact integrity, provider handoff tests |
| External acceptance/evidence | `pnpm verify:external-acceptance`; initialize packs outside Git; freeze exact revision/environment/roles/authority; execute the registered milestone script; preserve pass/fail/stop evidence; validate the completed manifest; semantically inspect retained hashes/signoffs; required protected checks; no maturity/task closure from a template or structural pass alone |
| Docs-only | link/reference scan; stable-ID coverage; status/evidence consistency; `git diff --check` |

Full release candidate gate is defined in `docs/EXECUTION-ROADMAP.md`.

## 8. Non-negotiables

1. SI units everywhere; Y-up/right-handed/meters internally.
2. Mass, inertia, electrical, price, and performance claims are sourced or computed.
3. Never bypass or weaken the validator to make generated content pass.
4. No code in contracts. Future user controllers require the reviewed sandbox path.
5. No fast-math or unrecorded nondeterminism in the core.
6. No weapons, targeting, munitions, or interdiction functionality. Refuse before
   retrieval/provider work and log only the minimal non-content audit record; an
   audit-write failure must fail closed.
7. Generated, trained, imported, exported, and deployed artifacts carry provenance.
8. License/export policy is enforced in actual exporters, not only displayed.
9. User photos, models, and telemetry require explicit ownership, consent, retention,
   export, and deletion semantics.
10. Hardware is fail-closed: no auto-arm; policy is advisory; supervisor/FC retains
    authority; ladder transitions require physical confirmation.
11. External model/provider identifiers, limits, prices, and regulations are verified
    from current primary sources at implementation time.
12. Decisions, exceptions, and owner reordering are recorded in `docs/DECISIONS.md`.
13. Secrets are request- or service-scoped, never persisted or reflected; outbound
    destinations, resource use, and archive contents fail closed under explicit bounds.
14. External evidence is pseudonymous, content-addressed, consent/retention-aware,
    and revision-bound; generated templates and self-attestation never substitute for
    the intended independent person, real provider, controlled rig, or field event.

## 9. Dependency and supply-chain policy

- Prefer the existing stack and standard library before adding dependencies.
- Explain new runtime dependencies in the changelog and system docs.
- Pin reproducible toolchains and release inputs; pin GitHub Actions by immutable SHA
  for release-sensitive workflows.
- The root `packageManager` pin is part of the reviewed toolchain. A pnpm upgrade must
  pass a frozen install without lockfile drift, `pnpm audit --audit-level low`, the
  full relevant verification gate, and protected security checks.
- Keep dependency lifecycle authority fail-closed in `pnpm-workspace.yaml`.
  `allowBuilds` entries are version-exact and reviewed; never replace them with
  `dangerouslyAllowAllBuilds` or an unbounded package range.
- Keep lockfiles committed and audit Rust, npm, Python, containers, and Actions.
- Do not use mutable `latest` images for production or release evidence.
- Never commit credentials. Development defaults in Compose are not production
  configuration.

## 10. Documentation discipline

- `docs/FORGE-plan.md` and historical plans are planning papers; do not use them as
  current-state proof.
- `docs/PROJECT-STATE.md` owns dated evidence and readiness verdicts.
- `docs/ROADMAP.md` owns phase status and exit criteria.
- `docs/TODO.md` owns stable atomic tasks.
- `docs/EXECUTION-ROADMAP.md` owns sequencing, workstreams, gates, and handoffs.
- `docs/MJX-DECISION.md` owns the exact P7-010 proxy bindings, CPU budget and cost
  inputs, accelerator stop conditions, command, verdict review, evidence retention,
  and rerun policy.
- `docs/MODAL-OPERATIONS.md` owns the exact P7-013 provider deployment, quota,
  cancellation, evidence, retention, recovery, rollback, and incident runbook.
- `docs/MIGRATIONS.md` owns the supported Postgres prefix, transactional runner,
  backup-impact, deployment, rollback/roll-forward, and failed-migration runbook.
- `docs/CONTRIBUTOR-ONBOARDING.md` owns curated first-issue readiness, exclusions,
  discovery, claim/assignment, inactivity, review, and maintenance. Public issue
  forms never self-apply `good first issue`; maintainers copy the root `.github`
  curation template only after verifying the task on protected `main`.
- `docs/GOLDEN-ARTIFACTS.md` and its machine registry own re-pin procedure,
  immutable-oracle policy, regeneration commands, and append-only review evidence.
- `docs/EXTERNAL-ACCEPTANCE.md` and its machine registry own external scripts,
  evidence shape, independence, data minimization, stop outcomes, and task-close
  review; raw acceptance material stays outside Git.
- `contracts/documentation.json` plus the registered gateway routes and compatibility
  matrix own generated API/event/artifact reference metadata. Never hand-edit files
  under `docs/contracts/` or `docs/API-EVENT-ARTIFACT-REFERENCE.md`; regenerate and
  check them with the documented commands.
- System docs own implementation contracts; `DECISIONS.md` owns binding choices;
  `risk-register.md` owns risks and watch triggers.
- Use executable commands and explicit acceptance evidence.
- Distinguish fixture, sandbox, live, and field claims in every document and UI.
- Do not duplicate long plans across files; link to the owner.

## 11. Release and phase-close rules

A phase closes only when every exit criterion is supported by current evidence and all
blocking checks are green. A release requires:

- clean protected-main commit and required checks;
- version/tag/release notes and reproducible artifacts;
- checksums and installation/version proof;
- dependency/security review;
- migration and rollback notes where applicable;
- accurate README/current-state/live-vs-gated language;
- downloaded artifact verification after publication;
- post-release smoke evidence.

Local green alone is not a release. Fixture green alone is not live proof.
