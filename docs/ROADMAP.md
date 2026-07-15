# ROADMAP — phases, exit criteria, live status

Source: [`FORGE-plan.md`](FORGE-plan.md) §19 (v3.0, binding scope) expanded with
tracking state. **A phase closes only when every exit criterion below is checked, the
docs it invalidates are updated, and the changelog records the close.** Estimates
assume a solo builder pairing with AI agents.

**Schedule honesty (v3.0):** the Rust core moves the wedge (end of P4) from roughly
13–16 weeks (v2) to roughly **16–21 weeks** — the price of one-implementation-
everywhere, paid once, at the start, with the oracle watching. Every later phase is
cheaper for it: P2's validator productization is mostly packaging an existing binary,
and D17 deletes an entire class of client/server consistency work.

**Status legend:** ○ not started · ◑ in progress · ● done · ⛔ blocked
**Task detail** lives in [`TODO.md`](TODO.md) (IDs `P0-…`, `XC-…`); this file tracks
phase-level state only. Parallel execution order and subworker ownership live in
[`EXECUTION-ROADMAP.md`](EXECUTION-ROADMAP.md).

**Recovery/release gates:** G0 closed on 2026-07-12, G1 closed on 2026-07-13, and
QA-012 restored current G0 nightly acceptance on 2026-07-14. Protected PR #50,
post-merge CI/security, and exact-main nightly `29372161650` are green at `6f8509b`;
its downloaded revision-bound artifact proves the required full-Studio WebGL
renderer across all six scenes. Standalone validator v0.1.0 remains built, attested,
published from an annotated tag, downloaded, and independently verified. Live,
external-user, operations, hardware, and field claims remain gated independently.

Protected QA-008 PR #36 adds a 33rd local gate: fourteen schema/render/physics/
validator/corpus/generated-runtime families are machine-registered, the frozen
prototype is immutable, and intentional re-pins require append-only review evidence.
Exact PR and post-merge CI/security are green at protected `2589503`.

Protected QA-002 PR #38 closes the deterministic builder browser loop at `c80accb`:
the production Studio bundle, real WASM, exact validator, and isolated Postgres pass
all ten named flows in exact-head and post-merge CI. Live-provider and independent-
user proof remain separate.

Protected QA-010 PR #40 adds a 34th policy gate with versioned scripts and generated
evidence templates for all eight external milestones. Exact PR and post-merge
CI/security are green at protected `8708de7`. The kit is complete, but it does not
change any `EXT-*`, live-provider, hardware, or field verdict by itself.

Protected QA-003 PR #42 closes deterministic supported-browser/accessibility
acceptance at `9c1802b`. Exact PR and post-merge CI/security are green, and the clean
merge artifact proves the production-bundle real-WASM viewer/configurator journey,
semantics, keyboard, focus, contrast, target size, responsive containment, and
reduced motion across Chromium, Firefox, and WebKit. Chromium owns full WebGL;
Firefox/WebKit draw the dependency-light core-baked schematic without loading the
WebGL presentation chunks. These proxies do not constitute Apple/mobile-device,
assistive-technology, external-user, or field proof.

Protected QA-004 PR #44 closes deterministic migration acceptance under D37 at
`e362c54`. The 35th policy gate protects the transactional/checksummed runner; exact
PR and post-merge CI/security plus the clean merge artifact prove a 20-migration
clean install, every populated predecessor `0001`..`0019`, preservation/idempotency,
atomic recovery, history refusal, and concurrent apply-once. Production
backup/restore, disaster recovery, capacity, and measured RPO/RTO remain OPS-005 and
QA-009.

Protected QA-005 PR #46 closes deterministic isolated-Postgres fault acceptance under
D38/migration 0021 at `7970005`. Exact PR and post-merge CI/security are green; the
clean revision-bound artifacts prove opaque expiring attempt leases, bounded outage/
rate retries, cancellation and stale-result fencing, one-winner materialization, and
partial-upload refusal followed by exact staged-upload completion. Production queue
operations, multi-replica capacity, provider/object-store incident drills, shared
quotas, dead-letter operations, and SLOs remain separate OPS/QA gates.

Protected QA-007 PR #48 closes the governed cross-boundary adversarial corpus at
`e89bb15`. The fifteenth golden family contains the exact eight required trust-
boundary files and 89 stable cases. Rust and Python consumers pin accepted/refused
behavior for imports, JSON Patch, EnvSpec, replay, provider rows, citations, D10
exports, and hardware payloads; exact PR and post-merge CI/security are green. This
deterministic corpus does not close live-provider, external-import diversity,
hardware, performance, or field criteria. QA-012 is closed through protected PR #50
at `6f8509b`: the custom server carries the required isolation contract, semantic-
wrapper changes cannot contaminate captures, and versioned artifacts fail closed on
renderer or source-revision drift. Exact-head branch nightly `29370725355`, PR CI/
security, post-merge CI/security, and exact-main nightly `29372161650` are green. The
protected artifact passes all six scenes at unchanged edge F1 0.957-0.995 and 3 draws
without re-pinning any golden or threshold.

DOC-005 is closed through protected PR #53 at `22c263b`. The sixteenth registered
schema family and 36th full-gate step generate OpenAPI 3.1 plus event/artifact
catalogs that exact-match 75 registered routes, two event families, fourteen
compatibility domains, and sixteen worker queue kinds. Migration, deprecation, and
synthetic example guides share the drift gate. The complete 36-step local gate,
exact-head PR CI `29375146614`/security `29375146592`, and post-merge CI
`29376742319`/security `29376742373` pass. DOC-006 is the remaining documentation
lane. Before it starts, PR #54 must restore the GOV-003 audit client after npm's
legacy-endpoint retirement and pass exact protected security; the local pnpm 11.13.0
candidate already passes frozen install and low-severity bulk-advisory audit without
lockfile drift plus the complete 36-step gate under Python 3.12.

| Phase | Status | Est. |
|---|---|---|
| Pre-P0 housekeeping | ◑ *(repository hygiene/public surfaces are protected; qualified confusing-similarity/common-law/class name review remains PRE-005/GOV-010)* | days |
| P0 Freeze & extract | ● **done** *(delivered vintage frozen in-tree and remotely tagged `prototype-final`; D32 closed historical variant parity honestly and XC-28 implements product variants separately)* | 1.5–2.5 wk |
| P1 Core & studio | ◑ *(6/7 criteria met; QA-003's cross-engine accessibility matrix is protected through PR #42; sole phase exit still open: 60 fps verification on real mid hardware — owner-runnable via the perf overlay)* | 6–8 wk |
| P2 Data-driven models | ● **done** *(full validation suite restored; validator v0.1.0 published and independently verified; v0.2 protected through PR #30; registry publication explicitly deferred to an owner-credential decision)* | 3 wk |
| P3 Component DB + proof pair + reference rigs | ● **deterministic/local exit** *(tag `p3-baseline`; Postgres runner/seed/assert, strict fixture rows, review queue, HUD/BOM, reference rigs, and native bounded Anthropic ETL contract; credentialed extraction through reviewed persistence remains P3-004/R1 work)* | 2–3 wk |
| P4 Text-to-CAD GA | ◑ *(deterministic real-validator gate is 25/25, QA-002's ten-flow real-WASM/isolated-DB browser loop is protected through PR #38, and QA-003's three-engine semantic/interaction matrix is protected through PR #42; SEC-002..006 remain contract/fixture, D36 native ETL is contract/fixture only, and credentialed extraction, deployed egress/quotas/backup/DR, and external R1 proof remain gated)* | 3–4 wk |
| P5 Image → 3D | ◑ *(2026-06-14: fixture photoscan jobs, normalized live-command TRELLIS/COLMAP adapter contract, object-cache keys linked through object_blobs, primitive-refit/candidate rows, editable owner alignment UI, Modal endpoint adapter; real GPU SLO and mesh-click placement remain adapter/config/UI work)* | 3 wk |
| P6 Sim depth + interop | ◑ *(engine-backed Rapier world/WASM worker and admitted driveable URDF/MJCF fixture imports now exist; pinned MuJoCo comparison passes; protected QA-007 adds malformed/non-finite import/replay/EnvSpec regression coverage, while live MuJoCo baseline and diverse real external corpus remain open)* | 3–4 wk |
| P7 Training service | ◑ *(2026-06-14: task specs, obs/action derivation, domain randomization, curriculum metadata, fixture train.policy/train.sysid-fit jobs, external SB3 scorecard re-gating, ONNX headers/blob-linked policy artifacts, and Studio CoreSession policy playback; live SB3/MuJoCo/ONNX Runtime inference remains adapter work)* | 4 wk |
| P8 Bridge + Desktop | ◑ *(D30 accepts controlled D12 lab pilots; config-diff, telemetry ingest, supervisor, sysid, replay/telemetry/maintenance side-table readers, Studio artifact rows, and gateway/Desktop lab gates exist; protected QA-007 bounds payloads and refuses command injection, duplicate/non-finite time, malformed vectors, and invalid safety limits; real lab adapters/evidence remain open)* | 5–7 wk |
| P9 Co-design | ◑ *(2026-06-14: manifold encoding, deterministic JSON-Patch candidates, objective constraints, tier evidence, admitted-only Pareto outputs, Studio launch/save buttons; live CMA-ES/Optuna/full sim ladder open)* | 4 wk |
| P10 Environments & courses | ◑ *(EnvSpec, generation, routes, course-to-task adapter, replay verification, and Studio fixture surface exist; community race and popular-course live proof remain open)* | 3–4 wk |
| P11 Platform | ◑ *(local platform contracts, D10/D33-D35 authority, and one protected contract/fixture idempotent gateway-to-worker vendor-normalization path exist; credentialed vendor/print sandboxes, production backup/DR, external users, and policy process ownership remain gated)* | open |
| P12 Maintenance twin | ◑ *(2026-06-15: wear models, crash windows, repair-sheet generation with vendor/print handoff links, fleet-summary worker, telemetry/maintenance records, Studio artifact rows, and quote-link surfacing; real field-log evidence remains open)* | 3 wk |

Sequencing rationale (D1–D4): verify-first means P3 (catalog truth) ships and gets
attention before P4 (generation GA); sharing arrives at P4; the marketplace is
deliberately last. The success ladder (plan §1.3) maps rungs to phases: R1 = P1–P4,
R2 = P5–P7, R3 = P7–P9, R4 = P10–P12.

---

## Pre-P0 — housekeeping (not in the plan; required before P0)

Scope: make the repository workable — documentation system, the prototype committed,
licensing groundwork.

- [x] Documentation system in place (`AGENTS.md`, compatibility `CLAUDE.md`, `PROJECT-STATE.md`, `CHANGELOG.md`, `docs/` suite; rebuilt 2026-07-12)
- [x] Plan v3.0 adopted as binding; v2.0 archived as historical (2026-06-11)
- [x] **v0 end-to-end implementation on all surfaces** (owner re-order, D21, 2026-06-12): core crates + validator CLI + WASM facade + studio + gateway + workers + CI — prototype-dependent criteria below remain open
- [x] **`cad-object-studio.html` prototype committed and remotely tagged** byte-exact as annotated `prototype-final` at `0294a9d`; SHA-256 `ca93489e…` verified before publication *(2026-07-12; pre-configurator vintage — see prototype/README.md)*
- [x] License files reflecting open-core split (D2/D24): Apache-2.0 (© RNT56) for crates/ + schema/ + examples/; proprietary for the rest *(2026-06-12)*
- [~] Repo hygiene: `.gitignore` + `.editorconfig`, default-branch ruleset `18843164`, remote security scans, immutable Action pins, and the selected-Action allowlist are active; contributor/security surfaces and repository metadata remain GOV work.

## P0 — Freeze & extract

**Scope:** Monolith tagged as executable reference; contract schema v2.1 (env,
estimator, lockfile, license classes, collider compounds) **authored in
`forge-contract` with schemars emission**; mechanical translation of both prototype
models (humanoid + VX-2) to JSON; the plan's 31-variant claim is closed as
non-applicable because the delivered oracle predates that configurator (D32);
product-equipped variants are delivered separately by XC-28/P1-014; **cargo + pnpm monorepo
scaffold**; **core boundary API frozen** (plan §5.3).
**Owning docs:** [`systems/core-runtime.md`](systems/core-runtime.md),
[`systems/model-contract.md`](systems/model-contract.md),
[`architecture.md`](architecture.md) §3.

Exit criteria:
- [x] Both contracts validate in a first-cut runner with part/face counts **byte-equivalent** to the monolith *(2026-06-12: hrx7 125/2195/2581 ✓, vx2-hornet 73/924/1250 ✓, CI-guarded; D32 closes the unavailable 31-variant historical claim without inventing source data)*
- [x] Contract schema authored as Rust types in `forge-contract`; JSON Schema emitted via schemars *(2026-06-12)*
- [x] TS types codegen from the Rust schema (schemars → TS pipeline working in CI) *(2026-06-12)*
- [x] Cargo workspace + pnpm scaffold builds green in CI *(2026-06-12)*
- [x] Core boundary API (bake / tick / validate / patch) frozen and documented *(2026-06-12 — v1; zero-copy refinement cannot change call shapes)*
- [x] Prototype content is hash-recorded and unmodified; annotated `prototype-final` is published at the verified commit (P0-010/GOV-006, 2026-07-12).

## P1 — Core & studio

**Scope:** `forge-core` crates ported from the proven JS with the **harness as parity
oracle** (plan §5.4), landing order contract → motion → geometry → sim → validate;
WASM facade crate; Three.js studio (scene graph, PBR, blueprint, explode + leaders,
selection, jog, configurator pane, orbit) **consuming core-baked buffers**; Rapier
worker driven from `forge-sim`.
**Owning docs:** [`systems/core-runtime.md`](systems/core-runtime.md),
[`systems/render-engine.md`](systems/render-engine.md),
[`systems/motion-engine.md`](systems/motion-engine.md),
[`systems/studio-ui.md`](systems/studio-ui.md).

Exit criteria:
- [x] **Golden-number suite green native↔WASM** *(2026-06-12: 4 canonical scenes, bake + 600-step tick streams bit-identical; forge-num/libm determinism fix; CI-gated)*
- [x] Golden-scene parity gallery versus the monolith *(2026-06-12: 6 canonical scenes — 2 models × 3 cameras, shared FOV/orbit — Sobel-edge F1 0.95–0.995 vs gate 0.85; evidence in `docs/assets/parity/`, regenerate via `pnpm parity`)*
- [x] **Shimmer gone** — z-buffer renderer resolves all deliberately overlapping solids *(2026-06-12: depth-tested BatchedMesh render, camera near 0.01 for depth precision; the GEO-003-flagged interpenetrations resolve per-pixel by construction — no painter sort exists to flicker; parity gallery is the visual record)*
- [ ] 60 fps on mid hardware within the frame budget (≤ 6 ms render / ≤ 1.5 ms core tick / ≤ 4 ms Rapier / ≤ 2 ms UI) *(software-renderer floor measured 2026-06-12: render 0.5 ms · core ≤ 0.05 ms · 9 draw calls on SwiftShader — budgets hold with huge margin even without a GPU; the 60 fps claim still wants a real-mid-hardware run, owner-verifiable via the perf overlay)*
- [x] `forge-validate` binary and WASM produce **bit-identical results** on both translated contracts *(2026-06-12 — golden-compare on hrx7 + vx2-hornet)*
- [x] WASM facade ≤ 2 MB gz; humanoid bake ≤ 60 ms; incremental patch re-bake ≤ 10 ms *(2026-06-12: 298 KB gz · bake 2.0 ms · patch→re-bake 2.8 ms through the typed `Bake` handle; CI-gated via `scripts/budgets.mjs`)*
- [x] Equipped-variant configurator truth *(2026-07-13: ModelSpec 2.2 explicit choice, selected-only physical consumers, stable source-pointer selection, consequence cards, and native/WASM/browser proof; P1-014/XC-28)*

## P2 — Data-driven models

**Scope:** Validator productized (check IDs, diagnostic format, draft semantics) —
mostly packaging the existing binary; archetype driver library formalized; parametric
family #1 — quadruped generator with leg-count/wheelbase/mass sliders.
**Owning docs:** [`systems/validation-harness.md`](systems/validation-harness.md),
[`systems/motion-engine.md`](systems/motion-engine.md).

Exit criteria:
- [x] A quadruped spec becomes a valid walking model with **zero hand-written code** *(2026-07-12: modular printable generator passes the full slider-grid admission test)*
- [x] CI green on the full validation suite *(complete local suite is green on pinned Rust 1.96.0; v0.1 release and v0.2 PR #30/post-merge protected evidence are proven)*
- [x] Diagnostic format stable and machine-readable *(2026-06-12: check IDs + diagnostic JSON + CTR-008)*
- [x] napi-rs hot-path vs binary-spawn measured in the gateway; outcome recorded (OD-08) *(2026-06-12: D22 — spawn stays; numbers in the decision row)*

## P3 — Component DB + proof pair + reference rigs

**Scope:** Component schema, connector taxonomy, compatibility rules, ETL worker,
license ledger, lockfile resolution; VX-2 `rotors` and `battery` slots
component-backed; reference quad and rover SKUs pinned at ingestion (D12).
**Owning docs:** [`systems/component-database.md`](systems/component-database.md),
[`systems/compute-workers.md`](systems/compute-workers.md).

Exit criteria:
- [x] Proof pair renders to datasheet dimensions within tolerance *(2026-06-12: EMAX ECO II 2207 + CNHL 4S 1500 — baked AABB within 1 % of cited dims, masses carried from datasheets; `tests/proof_pair.rs`, CI-run; rows at confidence 0.7 pending owner verification of citations)*
- [x] HUD physics responds to the pack swap (hover throttle, endurance change)
- [x] BOM exports purchasable SKUs
- [x] Reference rigs (ArduPilot-capable 5″ quad + Pi-class rover) selected, SKUs pinned, recorded in DECISIONS
- [x] Every ingested datum carries a per-field source citation

## P4 — Text-to-CAD GA

**Scope:** Generation orchestrator (retrieval, multi-pass constrained synthesis,
validator-in-loop repair via in-process WASM, draft fallback D14, JSON-Patch editing
through the core patch/re-bake path, provenance stamps); share URLs (D4); BYO key +
metered credits (D3); Brief-25 suite live (D-evals).
**Owning docs:** [`systems/generation-pipeline.md`](systems/generation-pipeline.md),
[`systems/platform.md`](systems/platform.md) §2.

Exit criteria:
- [x] Catalog review loop has an owner-facing API/UI before generated artifacts can consume new live-ingested rows *(2026-06-13: API/UI, audit notes, export-policy filters, owner-token auth, and fixture-backed ingestion adapters live)*
- [x] ≥ 20/25 Brief-25 briefs admitted without human repair *(2026-07-12: 25 admitted, 0 drafts/rejects/blocked, 0 repair iterations)*
- [x] Conversational edits apply in < 3 s *(2026-06-14: deterministic NL→JSON-Patch gateway route uses `forge-validate patch`; reports elapsed ms)*
- [x] A shared link renders for a logged-out visitor (orbit, explode, blueprint, drive demo) *(2026-06-14: admitted-only immutable share snapshots via `/v1/share/:shareId`, Studio `?share=` viewer mode; legacy fragment shares remain)*
- [x] Required browser acceptance covers generation, drafts, editing, real-WASM validation, anonymous share, reviewed catalog, courses, listings, jobs, and maintenance against isolated Postgres *(QA-002: exact implementation head `6a8ce28` passed CI `29272067712` and security `29272067617`; protected merge `c80accb` passed post-merge CI `29272532186` and security `29272531705`, with a 10/10 structured artifact)*
- [x] Anthropic model strings/limits/pricing pinned from current docs (not from the plan) *(D26)*
- [x] Brief-25 dashboard tracks admission rate, repair iterations, diversity over time *(2026-07-12: artifact records the restored 25/25 baseline; focused diagnostic-aware repair coverage protects non-template candidates)*

## P5 — Image → 3D

**Scope:** TRELLIS/photogrammetry workers, primitive refit with the D13 acceptance
metric, browser alignment UI, photoscan admission path.
**Owning docs:** [`systems/compute-workers.md`](systems/compute-workers.md) §3.3,
[`systems/geometry-engine.md`](systems/geometry-engine.md).

Exit criteria:
- [ ] A photographed motor becomes an equipable parametric component end to end
- [~] D13 acceptance enforced (≥ 70 % fit coverage, Hausdorff ≤ 1.5 % of bounding diagonal, else mesh-class) *(fixture and live-command normalization fail closed; real photographed-part proof open)*
- [~] Photo→part job under the 5-minute SLO on burst GPU; results cached permanently *(SLO/cache metadata live; real GPU timing proof open)*

## P6 — Sim depth + interop out/in

**Scope:** Full Rapier coupling, propulsion/battery/estimator models, HUD analytics,
disturbance injectors; MJCF/URDF exporters with parity suite; URDF/MJCF **importer**.
**Owning docs:** [`systems/simulation-engine.md`](systems/simulation-engine.md),
[`systems/model-contract.md`](systems/model-contract.md) §6.

Exit criteria:
- [~] Hover trim agrees across Rapier and MuJoCo within tolerance (deterministic parity fixture green; engine-backed parity open)
- [x] An external URDF/MJCF fixture round-trips into an admitted driveable contract *(reconciled 2026-07-12: `import_driveable` tests pass; broaden external corpus under QA-007 without reopening this fixture criterion)*
- [x] Endurance estimate within stated error of bench math; assumptions inspectable in HUD
- [x] Replay format stable: {contract hash + lockfile, env, seed, input tape} — verifiable on any surface (D17)

## P7 — Training service

**Scope:** Task suite v1, SB3 PPO/SAC pipeline, randomization config, scorecards,
ONNX export, in-browser policy playback; estimator-smoke gate (D8).
**Owning docs:** [`systems/learning-engine.md`](systems/learning-engine.md).

Exit criteria:
- [~] A trained hover + waypoint policy flies the twin in-browser from a one-click job *(fixture policy action-header playback live; live ONNX inference open)*
- [x] Ground-truth-trained policies rejected at scorecard time (estimator smoke) *(fixture and external SB3 worker gates reject SIM-004)*
- [ ] Hover-class task to passing scorecard overnight on one consumer GPU
- [x] Scorecard schema final: success rate, robustness grid, energy; sub-threshold policies do not export *(p7-scorecard-v1 plus blocked ONNX export metadata live)*

## P8 — Bridge + Desktop

**Scope:** WebSerial config writer, telemetry ingest, system-ID fitting, flight
recorder + ghost overlay, **FORGE Desktop (Tauri): serial plugin, fs, background
recorder (D15)**, FORGE Link companion image, deployment-ladder UX with the safety
supervisor and control-rate contract (D9); pilots on both reference rigs. The
deterministic package scaffold now exists under `packages/desktop`; gateway and
Desktop commands also require the D30-accepted platform gate, explicit lab-mode envs,
D12 rig allowlists, local execution, and physical confirmation. Live hardware
remains limited to controlled D12 lab pilots.
**Entry gate:** ToS/liability legal review complete for controlled D12 lab pilots
by D30 ([`security-safety-legal.md`](security-safety-legal.md) §3). External beta
requires a later rollout gate after lab evidence.
**Owning docs:** [`systems/hardware-bridge.md`](systems/hardware-bridge.md).

Exit criteria:
- [x] Legal review of ladder UX, supervisor disclaimers, telemetry consent — **accepted for controlled D12 lab pilots by D30**
- [ ] A real quad configured from its contract via WebSerial
- [~] SITL → HITL → tethered demonstrated and documented on the reference quad *(D30 accepted; dry-run pilot playbooks and `pnpm pilot:check` live; real HITL/tethered execution awaits lab adapter/evidence capture)*
- [ ] **A field log captured by FORGE Desktop replays with visible ghost divergence**
- [~] System-ID fit updates the contract's sim block from bench/flight telemetry *(worker/external sys-ID patch contract live; real bench/flight telemetry proof open)*

## P9 — Co-design optimizer

**Scope:** CMA-ES/Bayesian-optimization orchestrator, multi-fidelity evaluation
ladder (tier 0 native-fast via the core binary), Pareto-front UI; MJX batching as
needed.
**Owning docs:** [`systems/co-design.md`](systems/co-design.md).

Exit criteria:
- [~] "Lightest quad for this course under constraints" returns ≥ 3 admitted Pareto points overnight *(keyless 200-candidate constrained-course worker proof live; overnight engine-backed proof open)*
- [~] Tier-0 candidate evaluation < 50 ms native; 200-candidate CMA-ES generation overnight at tier 2 *(tier evidence and budget metadata live; native/engine timing proof open)*
- [~] Every returned point is a fully admitted contract (validator as constraint oracle) *(worker Pareto front filters rejected candidates; engine-backed validator oracle proof open)*

## P10 — Environments & courses

**Scope:** EnvSpec schema + gatekeeper, environment generation, course sharing,
leaderboards with replay verification (universally checkable under D17; server
re-verification as anti-cheat hygiene).
**Owning docs:** [`systems/environments-courses.md`](systems/environments-courses.md).

Exit criteria:
- [ ] A community course races with a verified leaderboard
- [~] A popular course doubles as an RL task without conversion work *(worker `train.policy` consumes EnvSpec directly; popular public-course/live-training proof open)*

## P11 — Platform

**Scope:** Accounts, marketplace (models + skills with scorecards), classroom mode,
BOM agent vendor links, DfM + print-service ordering, UGC moderation policy.
**Entry gate (hard):** dual-use/export-control sanity check before policy sharing
([`security-safety-legal.md`](security-safety-legal.md) §3).
**Owning docs:** [`systems/platform.md`](systems/platform.md).

Current P11-005 maturity is contract/fixture: Studio can retain synchronous sandbox
links or enqueue `commerce.vendor-refresh` only when the local worker command is
configured; normalized offers are revalidated transactionally. This is not the
external provider quote-link exit criterion.

Exit criteria:
- [ ] First external user publishes a model that strangers equip
- [ ] First printed structural part handed off through a provider quote link
- [~] Moderation policy live *(report/action code and 72-hour target exist; named legal/process ownership, appeals/escalation, and exercised SLA remain SEC-007/G6)*
- [x] Marketplace usage-beta economics recorded (D29); seller payouts/revenue share deferred until real thresholds

## P12 — Maintenance twin

**Scope:** Wear models from telemetry, crash forensics workflow,
repair-steps-from-explode with reorder links, fleet view.
**Owning docs:** [`systems/platform.md`](systems/platform.md) §6.

Exit criteria:
- [~] A logged crash produces an actionable repair sheet with vendor/print quote links *(worker repair sheets now preserve supplied vendor/print handoff links; real Desktop-captured crash proof open)*
