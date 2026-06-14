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

| Phase | Status | Est. |
|---|---|---|
| Pre-P0 housekeeping | ● *(2026-06-12 — licensing D24, hygiene, naming D23; branch protection = owner click)* | days |
| P0 Freeze & extract | ● for the delivered vintage *(2026-06-12; P0-007 variants gated on the later build or a re-scope decision; remote tag = owner push)* | 1.5–2.5 wk |
| P1 Core & studio | ◑ *(5/6 criteria met 2026-06-12; open: 60 fps verification on real mid hardware — owner-runnable via the perf overlay)* | 6–8 wk |
| P2 Data-driven models | ● *(2026-06-12 — all four exit criteria checked; non-gating tasks P2-001 publication / P2-002 persistence tracked in TODO)* | 3 wk |
| P3 Component DB + proof pair + reference rigs | ● *(tag `p3-baseline` → `6937037`, 2026-06-13: Postgres runner/seed/assert, strict catalog rows, fixture ETL/review queue, catalog HUD/BOM, reference rigs pinned)* | 2–3 wk |
| P4 Text-to-CAD GA | ● *(2026-06-14: deterministic six-archetype template generation, staged SSE, validator repair/draft path, JSON-Patch edit route, Auth.js GitHub/account seam, server-backed shares, Brief-25 real-validator gate 25/25, eval history tables/API, Studio model/edit/share/eval panels)* | 3–4 wk |
| P5 Image → 3D | ◑ *(2026-06-14: fixture photoscan jobs, object-cache keys linked through object_blobs, primitive-refit/candidate rows, editable owner alignment UI, Modal endpoint adapter; live photogrammetry/COLMAP and mesh-click placement remain adapter/config/UI work)* | 3 wk |
| P6 Sim depth + interop | ◑ *(2026-06-14: collider auto-fit, blade-element-lite, disturbances, replay envelope verification, sag/current helpers, URDF/MJCF exporters, ros2_control sidecar, mesh visual manifest, slotless URDF/MJCF fixture import; full engine-backed Rapier/MuJoCo parity and external-driveable import still open)* | 3–4 wk |
| P7 Training service | ◑ *(2026-06-14: task specs, obs/action derivation, domain randomization, curriculum metadata, fixture train.policy/train.sysid-fit jobs, scorecard gate, ONNX headers/blob-linked policy artifacts, and Studio CoreSession policy playback; live SB3/MuJoCo/ONNX Runtime inference remains adapter work)* | 4 wk |
| P8 Bridge + Desktop | ◑ *(2026-06-14: D30 accepts controlled D12 lab pilots; config-diff, telemetry ingest, supervisor, sysid, replay/telemetry/maintenance side-table readers, Studio artifact rows, and gateway/Desktop lab gates exist; real lab adapters/evidence remain open)* | 5–7 wk |
| P9 Co-design | ◑ *(2026-06-14: manifold encoding, deterministic JSON-Patch candidates, tier labels, Pareto outputs, Studio launch buttons; CMA-ES/Optuna/full sim ladder open)* | 4 wk |
| P10 Environments & courses | ◑ *(2026-06-14: `forge-validate env`, expanded EnvSpec runtime checks, course-to-task adapter, courses/leaderboards/replay verification tables and routes, server-side leaderboard replay verification, Studio fixture course/score panel; full environment generation and board UI open)* | 3–4 wk |
| P11 Platform | ◑ *(2026-06-14: Auth.js GitHub, credits, user-owned models, listings/moderation reports, platform gates, policy signoffs, classroom assignments/submissions with validator grading, policy ONNX metadata, DfM/3MF metadata, owner-scoped object blobs, executable job queue, usage-beta rollups, vendor offer APIs, print quote/link APIs, and Studio commerce/gate rows; external provider integrations still env-gated)* | open |
| P12 Maintenance twin | ◑ *(2026-06-14: wear models, crash windows, repair-sheet generation, fleet-summary worker, telemetry/maintenance records, Studio artifact rows, and vendor/print quote-link surfacing; full scrubber/fleet dashboards open)* | 3 wk |

Sequencing rationale (D1–D4): verify-first means P3 (catalog truth) ships and gets
attention before P4 (generation GA); sharing arrives at P4; the marketplace is
deliberately last. The success ladder (plan §1.3) maps rungs to phases: R1 = P1–P4,
R2 = P5–P7, R3 = P7–P9, R4 = P10–P12.

---

## Pre-P0 — housekeeping (not in the plan; required before P0)

Scope: make the repository workable — documentation system, the prototype committed,
licensing groundwork.

- [x] Documentation system in place (`CLAUDE.md`, `CHANGELOG.md`, `docs/` suite)
- [x] Plan v3.0 adopted as binding; v2.0 archived as historical (2026-06-11)
- [x] **v0 end-to-end implementation on all surfaces** (owner re-order, D21, 2026-06-12): core crates + validator CLI + WASM facade + studio + gateway + workers + CI — prototype-dependent criteria below remain open
- [x] **`cad-object-studio.html` prototype committed** byte-exact + tagged `prototype-final` *(2026-06-12; pre-configurator vintage — see prototype/README.md)*
- [x] License files reflecting open-core split (D2/D24): Apache-2.0 (© RNT56) for crates/ + schema/ + examples/; proprietary for the rest *(2026-06-12)*
- [x] Repo hygiene: `.gitignore` + `.editorconfig` *(2026-06-12)*; default-branch protection = one owner click in GitHub settings

## P0 — Freeze & extract

**Scope:** Monolith tagged as executable reference; contract schema v2.1 (env,
estimator, lockfile, license classes, collider compounds) **authored in
`forge-contract` with schemars emission**; mechanical translation of both prototype
models (humanoid + VX-2) and all 31 variants to JSON; **cargo + pnpm monorepo
scaffold**; **core boundary API frozen** (plan §5.3).
**Owning docs:** [`systems/core-runtime.md`](systems/core-runtime.md),
[`systems/model-contract.md`](systems/model-contract.md),
[`architecture.md`](architecture.md) §3.

Exit criteria:
- [x] Both contracts validate in a first-cut runner with part/face counts **byte-equivalent** to the monolith *(2026-06-12: hrx7 125/2195/2581 ✓, vx2-hornet 73/924/1250 ✓, CI-guarded; "all 31 variants" applies only if the later configurator build is delivered — see P0-007)*
- [x] Contract schema authored as Rust types in `forge-contract`; JSON Schema emitted via schemars *(2026-06-12)*
- [x] TS types codegen from the Rust schema (schemars → TS pipeline working in CI) *(2026-06-12)*
- [x] Cargo workspace + pnpm scaffold builds green in CI *(2026-06-12)*
- [x] Core boundary API (bake / tick / validate / patch) frozen and documented *(2026-06-12 — v1; zero-copy refinement cannot change call shapes)*
- [x] Prototype tagged `prototype-final` and never modified after *(2026-06-12)*

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

## P2 — Data-driven models

**Scope:** Validator productized (check IDs, diagnostic format, draft semantics) —
mostly packaging the existing binary; archetype driver library formalized; parametric
family #1 — quadruped generator with leg-count/wheelbase/mass sliders.
**Owning docs:** [`systems/validation-harness.md`](systems/validation-harness.md),
[`systems/motion-engine.md`](systems/motion-engine.md).

Exit criteria:
- [x] A quadruped spec becomes a valid walking model with **zero hand-written code** *(2026-06-12: `forge-gen quadruped` → admitted + BEH-001 walking smoke, grid-tested)*
- [x] CI green on the full validation suite *(2026-06-12: P2-006 declared-verdict matrix over all first-party contracts, gated in CI)*
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
- [x] ≥ 20/25 Brief-25 briefs admitted without human repair *(2026-06-14: real-validator enforced run is 25/25)*
- [x] Conversational edits apply in < 3 s *(2026-06-14: deterministic NL→JSON-Patch gateway route uses `forge-validate patch`; reports elapsed ms)*
- [x] A shared link renders for a logged-out visitor (orbit, explode, blueprint, drive demo) *(2026-06-14: admitted-only immutable share snapshots via `/v1/share/:shareId`, Studio `?share=` viewer mode; legacy fragment shares remain)*
- [x] Anthropic model strings/limits/pricing pinned from current docs (not from the plan) *(D26)*
- [x] Brief-25 dashboard tracks admission rate, repair iterations, diversity over time *(2026-06-14: `eval_runs`/`eval_brief_results`, `--record-db`, `/v1/evals/brief25/latest`, Studio summary panel)*

## P5 — Image → 3D

**Scope:** TRELLIS/photogrammetry workers, primitive refit with the D13 acceptance
metric, browser alignment UI, photoscan admission path.
**Owning docs:** [`systems/compute-workers.md`](systems/compute-workers.md) §3.3,
[`systems/geometry-engine.md`](systems/geometry-engine.md).

Exit criteria:
- [ ] A photographed motor becomes an equipable parametric component end to end
- [ ] D13 acceptance enforced (≥ 70 % fit coverage, Hausdorff ≤ 1.5 % of bounding diagonal, else mesh-class)
- [ ] Photo→part job under the 5-minute SLO on burst GPU; results cached permanently

## P6 — Sim depth + interop out/in

**Scope:** Full Rapier coupling, propulsion/battery/estimator models, HUD analytics,
disturbance injectors; MJCF/URDF exporters with parity suite; URDF/MJCF **importer**.
**Owning docs:** [`systems/simulation-engine.md`](systems/simulation-engine.md),
[`systems/model-contract.md`](systems/model-contract.md) §6.

Exit criteria:
- [~] Hover trim agrees across Rapier and MuJoCo within tolerance (deterministic parity fixture green; engine-backed parity open)
- [~] An external URDF round-trips into a driveable contract (slotless fixture import green; external-driveable conversion open)
- [x] Endurance estimate within stated error of bench math; assumptions inspectable in HUD
- [x] Replay format stable: {contract hash + lockfile, env, seed, input tape} — verifiable on any surface (D17)

## P7 — Training service

**Scope:** Task suite v1, SB3 PPO/SAC pipeline, randomization config, scorecards,
ONNX export, in-browser policy playback; estimator-smoke gate (D8).
**Owning docs:** [`systems/learning-engine.md`](systems/learning-engine.md).

Exit criteria:
- [~] A trained hover + waypoint policy flies the twin in-browser from a one-click job *(fixture policy action-header playback live; live ONNX inference open)*
- [ ] Ground-truth-trained policies rejected at scorecard time (estimator smoke)
- [ ] Hover-class task to passing scorecard overnight on one consumer GPU
- [ ] Scorecard schema final: success rate, robustness grid, energy; sub-threshold policies do not export

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
- [ ] System-ID fit updates the contract's sim block from bench/flight telemetry

## P9 — Co-design optimizer

**Scope:** CMA-ES/Bayesian-optimization orchestrator, multi-fidelity evaluation
ladder (tier 0 native-fast via the core binary), Pareto-front UI; MJX batching as
needed.
**Owning docs:** [`systems/co-design.md`](systems/co-design.md).

Exit criteria:
- [ ] "Lightest quad for this course under constraints" returns ≥ 3 admitted Pareto points overnight
- [ ] Tier-0 candidate evaluation < 50 ms native; 200-candidate CMA-ES generation overnight at tier 2
- [ ] Every returned point is a fully admitted contract (validator as constraint oracle)

## P10 — Environments & courses

**Scope:** EnvSpec schema + gatekeeper, environment generation, course sharing,
leaderboards with replay verification (universally checkable under D17; server
re-verification as anti-cheat hygiene).
**Owning docs:** [`systems/environments-courses.md`](systems/environments-courses.md).

Exit criteria:
- [ ] A community course races with a verified leaderboard
- [ ] A popular course doubles as an RL task without conversion work

## P11 — Platform

**Scope:** Accounts, marketplace (models + skills with scorecards), classroom mode,
BOM agent vendor links, DfM + print-service ordering, UGC moderation policy.
**Entry gate (hard):** dual-use/export-control sanity check before policy sharing
([`security-safety-legal.md`](security-safety-legal.md) §3).
**Owning docs:** [`systems/platform.md`](systems/platform.md).

Exit criteria:
- [ ] First external user publishes a model that strangers equip
- [ ] First printed structural part handed off through a provider quote link
- [ ] Moderation policy live (report flow, takedown SLA, repeat-infringer rule)
- [x] Marketplace usage-beta economics recorded (D29); seller payouts/revenue share deferred until real thresholds

## P12 — Maintenance twin

**Scope:** Wear models from telemetry, crash forensics workflow,
repair-steps-from-explode with reorder links, fleet view.
**Owning docs:** [`systems/platform.md`](systems/platform.md) §6.

Exit criteria:
- [ ] A logged crash produces an actionable repair sheet with vendor/print quote links
