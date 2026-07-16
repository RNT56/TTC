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
`29376742319`/security `29376742373` pass. That closeout snapshot was 75/2/14/16;
current protected `d8afe7f` additively verifies 77 routes, two event families,
sixteen compatibility surfaces, and seventeen worker families through the same
drift gate. D50/P8-013 is protected through PR #87. PR #54 restored the GOV-003 audit client
after npm's legacy-endpoint retirement:
exact head `00ae9a0` passed CI `29378364147`/security `29378364143`, and protected
`41dee2d` passed post-merge CI `29378749550`/security `29378749542`. DOC-006 closed
the documentation lane through PR #58 at `3078dba`: exact head `c83f036` passed CI
`29379546230`/security `29379546201`, and post-merge CI `29380212006`/security
`29380212007` pass. Evidence PR #59 protected the final ledger reconciliation at
`484aefa` after exact-head CI `29380952442`/security `29380952454` and post-merge CI
`29381316922`/security `29381316924`. The curated workflow and seed issues #55-#57
are executable, but no external contribution outcome is claimed.

| Phase | Status | Est. |
|---|---|---|
| Pre-P0 housekeeping | ◑ *(repository hygiene/public surfaces are protected; qualified confusing-similarity/common-law/class name review remains PRE-005/GOV-010)* | days |
| P0 Freeze & extract | ● **done** *(delivered vintage frozen in-tree and remotely tagged `prototype-final`; D32 closed historical variant parity honestly and XC-28 implements product variants separately)* | 1.5–2.5 wk |
| P1 Core & studio | ◑ *(6/7 criteria met; QA-003's cross-engine accessibility matrix is protected through PR #42; sole phase exit still open: 60 fps verification on real mid hardware — owner-runnable via the perf overlay)* | 6–8 wk |
| P2 Data-driven models | ● **done** *(full validation suite restored; validator v0.1.0 published and independently verified; v0.2 protected through PR #30; registry publication explicitly deferred to an owner-credential decision)* | 3 wk |
| P3 Component DB + proof pair + reference rigs | ● **deterministic/local exit** *(tag `p3-baseline`; Postgres runner/seed/assert, strict fixture rows, review queue, HUD/BOM, reference rigs, and native bounded Anthropic ETL contract; credentialed extraction through reviewed persistence remains P3-004/R1 work)* | 2–3 wk |
| P4 Text-to-CAD GA | ◑ *(deterministic real-validator gate is 25/25, QA-002's real-WASM/isolated-DB browser loop is protected through PR #38 and currently passes 11 flows after P7-008 PR #62, and QA-003's three-engine semantic/interaction matrix is protected through PR #42; SEC-002..006 remain contract/fixture, D36 native ETL is contract/fixture only, and credentialed extraction, deployed egress/quotas/backup/DR, and external R1 proof remain gated)* | 3–4 wk |
| P5 Image → 3D | ◑ *(2026-06-14: fixture photoscan jobs, normalized live-command TRELLIS/COLMAP adapter contract, object-cache keys linked through object_blobs, primitive-refit/candidate rows, editable owner alignment UI, Modal endpoint adapter; real GPU SLO and mesh-click placement remain adapter/config/UI work)* | 3 wk |
| P6 Sim depth + interop | ● **done** *(engine-backed Rapier world/WASM worker, admitted driveable URDF/MJCF fixture imports, and real pinned MuJoCo 3.9.0 parity over the same four canonical contracts are protected through PR #60/`c0f5172`; required CI retains source-bound evidence under unchanged bands. Diverse third-party import acceptance remains broader product QA, not an unrecorded P6 exit.)* | 3–4 wk |
| P7 Training service | ◑ *(2026-07-16: P7-003, P7-008, P7-009, P7-011, P7-012, and P7-014 are protected: exact admitted-snapshot/Rust-bundle CPU MuJoCo/SB3 training, browser playback, source-bound controlled-synthetic offline fine-tuning, object-backed delivery, scorecard-passing hover/waypoint consumer-hardware evidence, and contract-derived rover/quadruped trainers retain their owning PR/artifact evidence. P7-013's D46 deployment-control contract/fixture is protected through PR #79/`ff39cd8`: an exact source-bound Modal 1.5.2/L4 function, CUDA/no-fallback authority, durable provider-call attempts, shared Postgres quotas, cancellation/refund fencing, migration 0024, a strict sandbox-evidence validator, and a complete operator runbook pass exact PR/post-merge CI/security and the clean 24-migration database/browser matrix. P7-013 remains `[~]` until one real clean-protected provider run proves billing attribution, alerts/SLO, spend stop, cancellation, application-artifact deletion, verified automatic provider-call expiry within seven days, and recovery. P7-010's protected CPU feasibility row remains decision-ineligible; PR #81/protected `d19c911` now protects D47's exact three-proxy `mjxDecisionRequest` 2.0.0, 12-hour scorecard/200-candidate budgets, provider cost authority, GPU/TPU no-fallback enforcement, centralized verdict, and complete operator runbook. Downloaded protected artifact `8363066891` confirms the v1 smoke still refuses decision eligibility. One real clean supported-accelerator v2 run with reviewed raw CPU budget/cost evidence remains required. Recorded-device data, exact passing-policy delivery integration, ground browser playback, final MJX decision, production storage operations, and EXT-003 remain open under P8/P7-010/P7-013/OPS-006.)* | 4 wk |
| P8 Bridge + Desktop | ◑ *(2026-07-16: D30 accepts controlled D12 lab pilots. D48/P8-012 closes deterministic native serial transport at protected integration maturity through PR #83/`fd26845`, exact PR/post-merge CI/security, and a byte-identical reviewed tree: the exact versioned Betaflight 2025.12/D12-quad/failsafe-only artifact is independently validated and hash-bound, serialport-rs restricts writes to an OS-enumerated port at 115200 baud, and a real pseudo-terminal proves exact bytes. D49 is protected at local integration maturity through PR #85/`4647a10`, exact PR/post-merge CI/security, and byte-identical reviewed tree `dfa0007`; receipt 2.0.0 requires props-off confirmation, bounded pre/post stable `2025.12.x` identity, exact set/save acknowledgement, reboot/reconnect, exact `failsafe_delay` readback, and four raw-response digests across two pseudo-terminal sessions. D50/P8-013 is protected at local recorder-integration maturity through PR #87/`d8afe7f`, exact PR/post-merge CI/security, and byte-identical reviewed tree `528a878`: one exclusive background thread captures bounded versioned serial JSONL into no-overwrite append-only frames plus a sparse index, then emits replay 1.0.0 and exact hashes only on a clean stop while privacy/training/device-attestation authority stays false. D51 protects exact five-file streaming archive verification plus a Desktop-only Studio inspection panel through PR #89/`b5418ac`, byte-identical reviewed tree `2d57349`, and exact PR/post-merge CI/security; canonical metadata/frame/index bytes, sparse offsets, hashes, and reconstructed replay are verified without upload or provenance promotion. D52 protects strict versioned shell-owned `inactive|recording|finished` status plus Studio start/stop controls through PR #91/`a8120ab`, reviewed tree `25be1d3`, and exact PR/post-merge CI/security; controls are sourced only from an admitted report, exact per-log consent, a D12 rig, new absolute path, and an OS-enumerated 115200-baud port, preserve receipt v1, and keep raw frames/device/field/sharing/training authority outside Studio. D53 protects exact five-object private materialization at local private-object-integrity maturity through PR #93/`08d892f`, reviewed tree `90d8cbf`, and exact PR/post-merge CI/security: native Desktop streams path-free checksum-bound files and gateway completion separates true object integrity from false archive semantics and provenance. D54 protects separate native sovereign archive verification, exact D53/admitted-model binding, a bounded object-backed telemetry reference, export 1.6/deletion coverage, and explicit refusal from legacy training through PR #95/`f8efb6f`, reviewed tree `f71ee1a`, and exact PR/post-merge CI/security; D53 and all device/field/sharing/training nonclaims remain unchanged. D55 is protected at local read-only protocol-fixture maturity through PR #97/`370d214`: an exact six-command MSP-v1 allowlist observes protocol/API/variant/version/board/build/UID twice on one open OS-enumerated port, returns only domain-separated hashes, and keeps every authenticity/device/recorded-device/field/sharing/training claim false; 19 native and 28 Studio focused tests pass. D56 is protected at local custody-fixture maturity through PR #100/`1bf127d`: strict signed acceptance authorization brackets the unchanged recorder with exact pre/post D55 continuity and creates a separate proof without promoting archive v1, D53, D54, or any device/recorded-device/field/sharing/training claim. Exact head `69c0dd7`, reviewed tree `de12c5a`, PR CI/security `29530839367`/`29530839338`, protected-tree equality, post-merge CI/security `29531470442`/`29531470118`, 24 native, 30 Studio, all 40 repository gates, the clean/25-predecessor database, and the 11-flow browser matrix pass. D57 is protected at local controlled-synthetic/unverified view maturity through PR #102/`d33fd57`: one versioned compact ten-minute/6,001-point Y-up/SI overlay, exact divergence/index validation, precomputed observed/predicted X/Z paths, explicit 60 Hz controls, and permanent device/recorded-device/field nonclaims pass focused worker/Gateway/Studio/build/compatibility checks, all 40 local gates under Python 3.12.13 with 227 worker tests, a fresh clean/25-predecessor Postgres matrix, all 12 production-browser flows, and Chromium/Firefox/WebKit. Exact head `50abc92`, reviewed tree `cc1d483`, PR CI/security `29536927436`/`29536927492`, protected-tree equality, and post-merge CI/security `29537565069`/`29537565062` pass. Raw recorder frames remain object-backed. D58 is an unprotected local rehearsal-only candidate: one shell-owned four-stage prefix, exact D9 and interaction contracts, strict Studio/browser fail-close, no hardware I/O, and permanent false physical/deployment/hardware/device/field/external-beta authority pass 4 ladder-specific tests within 28 native Desktop tests, 37 Studio, 74 Gateway, 227 worker, all 40 local gates, the fresh clean/25-predecessor Postgres matrix, all 12 production-browser flows, and Chromium/Firefox/WebKit. Config-diff, telemetry ingest, supervisor, sysid, replay/telemetry/maintenance readers, Studio artifact rows, and gateway/Desktop lab gates also exist. Reviewed D58 protection, real D54-to-twin execution, named-mid-hardware performance, real trust-root/named-FC custody, host suspend, WebSerial/WebUSB, signed Desktop delivery, Link image, lab pilots, and field evidence remain open.)* | 5–7 wk |
| P9 Co-design | ◑ *(2026-06-14: manifold encoding, deterministic JSON-Patch candidates, objective constraints, tier evidence, admitted-only Pareto outputs, Studio launch/save buttons; live CMA-ES/Optuna/full sim ladder open)* | 4 wk |
| P10 Environments & courses | ◑ *(EnvSpec, generation, routes, course-to-task adapter, replay verification, and Studio fixture surface exist; community race and popular-course live proof remain open)* | 3–4 wk |
| P11 Platform | ◑ *(local platform contracts, D10/D33-D35 authority, and one protected contract/fixture idempotent gateway-to-worker vendor-normalization path exist; credentialed vendor/print sandboxes, production backup/DR, external users, and policy process ownership remain gated)* | open |
| P12 Maintenance twin | ◑ *(D57 protected local view 2026-07-16 upgrades crash forensics from summary metadata to a strict compact indexed ten-minute observed/twin path with live separation and explicit 60 Hz controls while preserving provenance nonclaims. Wear models, repair-sheet vendor/print handoffs, fleet summary, telemetry/maintenance rows, and quote links remain. PR #102/`d33fd57` protects full local/database/12-flow/three-engine evidence; real field-log and live provider proof remain open.)* | 3 wk |

**D56 implementation overlay (protected through PR #100/`1bf127d`, 2026-07-16):** all three independent
1.0.0 formats now execute locally: deployment-pinned public trust bundle, strict
at-most-eight-hour exact acceptance authorization, and create-new native pre/post
continuity proof outside archive v1. Twenty-four native and thirty Studio tests cover
strict crypto/binding/time/revocation, two independent identity pseudo-terminal
sessions around live telemetry capture, proof overwrite/substitution refusal, and
valid archive preservation. This leaves archive v1, D53, and D54 unchanged and all
device/recorded-device/field/sharing/training authority false. All 40 repository
gates, the locked Desktop-native build, and a fresh clean/25-predecessor isolated
Postgres plus 11-flow production-browser matrix pass. Exact head `69c0dd7`, reviewed
tree `de12c5a`, PR CI/security `29530839367`/`29530839338`, protected-tree equality,
and post-merge CI/security `29531470442`/`29531470118` pass. A real trust root,
named D12 controller, rotation/revocation, suspend, and EXT-004 evidence remain required before custody or lab
maturity beyond fixture mechanics.

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
- [~] Repo hygiene: `.gitignore` + `.editorconfig`, default-branch ruleset `18843164`, remote security scans, immutable Action pins, the selected-Action allowlist, repository metadata, and contributor/security surfaces are protected; qualified name clearance and the Linux Desktop dependency route remain GOV work.

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
- [x] Hover trim agrees across Rapier and MuJoCo within tolerance *(closed 2026-07-15 through PR #60/protected `c0f5172`: exact-head and protected required CI execute all four contract-derived scenarios with exact MuJoCo 3.9.0, matched timing, unchanged bands, and retained source-bound evidence)*
- [x] An external URDF/MJCF fixture round-trips into an admitted driveable contract *(reconciled 2026-07-12: `import_driveable` tests pass; broaden external corpus under QA-007 without reopening this fixture criterion)*
- [x] Endurance estimate within stated error of bench math; assumptions inspectable in HUD
- [x] Replay format stable: {contract hash + lockfile, env, seed, input tape} — verifiable on any surface (D17)

## P7 — Training service

**Scope:** Task suite v1, SB3 PPO/SAC pipeline, randomization config, scorecards,
ONNX export, in-browser policy playback; estimator-smoke gate (D8).
**Owning docs:** [`systems/learning-engine.md`](systems/learning-engine.md).

Exit criteria:
- [~] A trained hover + waypoint policy flies the twin in-browser from a one-click job *(controlled real training and digest-bound browser inference are protected through P7-003/P7-008. P7-011 closes one-click exact-object delivery through PR #68/`9131289`; P7-014 closes executable waypoint training through PR #70/`f220d25`; and P7-012 closes protected task-v3/tensor-v2 hover/waypoint quality through implementation PR #72/`8e094c0` and evidence PR #73/`6bfa60f`. End-to-end retained-object execution of these exact passing P7-012 policy bytes remains before this combined exit closes.)*
- [x] Ground-truth-trained policies rejected at scorecard time (estimator smoke) *(fixture and external SB3 worker gates reject SIM-004)*
- [x] Hover-class task to passing scorecard overnight on one consumer GPU *(implementation PR #72/`8e094c0`; retained-evidence PR #73/`6bfa60f`; clean M2 Pro evidence intentionally interrupts/resumes and retains exact hover/waypoint JSON/ONNX under `docs/evidence/p7-012/`. Both pass unchanged baseline/mass/Kv/wind gates. D43 records CPU execution on the GPU-capable host and honest energy/cost nonclaims.)*
- [x] Scorecard schema final: success rate, robustness grid, energy; sub-threshold policies do not export *(p7-scorecard-v1 plus blocked ONNX export metadata live)*
- [x] At least one real rover and one real legged task execute through the sovereign trainer *(closed through PR #75/protected `90b1691`: D44 runs rover `line-follow` and quadruped `walk-to-target` from admitted contract-derived physics, estimator/encoder-only tensors, bounded torque, task-specific robustness, exact ONNX, and four-task smoke. Artifact `8356753424` self-binds to clean protected source and independently validates all four graphs/layouts/hashes. The short policies remain correctly blocked; Studio ground playback, passing-policy quality, device transfer, and field proof are separate.)*

## P8 — Bridge + Desktop

**Scope:** WebSerial config writer, telemetry ingest, system-ID fitting, flight
recorder + ghost overlay, **FORGE Desktop (Tauri): serial plugin, fs, background
recorder (D15)**, FORGE Link companion image, deployment-ladder UX with the safety
supervisor and control-rate contract (D9); pilots on both reference rigs. The
deterministic package scaffold now exists under `packages/desktop`; gateway and
Desktop commands also require the D30-accepted platform gate, explicit lab-mode envs,
D12 rig allowlists, local execution, and physical confirmation. Live hardware
remains limited to controlled D12 lab pilots.

D48 closes P8-012 at protected deterministic/native transport integration maturity
through PR #83/`fd26845`; exact PR CI `29468611033`/security `29468611094` and
post-merge CI `29468966929`/security `29468966748` pass. Desktop
accepts only a SHA-256-bound `forge-bridge-config/1.0.0` artifact for Betaflight
2025.12 on the D12 quad, one 2–200 decisecond `failsafe_delay`, no auto-arm, exact
confirmation, 115200 baud, and an OS-enumerated port. A real pseudo-terminal proves
the exact bytes; historical receipt 1.0.0 explicitly leaves target firmware and
application unverified.

D49's protected local integration requires the props-removed phrase, a bounded exact
stable `2025.12.x` identity before writing, exact set/save acknowledgement, reboot
and same-path reconnect, the same reported firmware-identity hash, and one matching
`get failsafe_delay` value before receipt 2.0.0 can assert target/application
verification; the receipt binds the four exact response streams by SHA-256 so the
private lab evidence can be resolved without committing device output. PR
#85/`4647a10` and exact PR/post-merge CI/security protect the implementation; two
real pseudo-terminal sessions prove the protocol and fail-closed
parsers, not a physical device. Real D12 execution, WebSerial, HITL, and lab/field
evidence remain separate exit work.

D50's protected P8-013 implementation provides the Desktop recorder as one exclusive in-shell
thread with independent archive/frame/receipt v1 schemas. It accepts only the
D30/D12/consent/OS-enumerated 115200-baud local seam, exact artifact/sequence/time,
bounded object frames, and a new archive path. Append-only canonical frames plus a
sparse byte-offset index are flushed and synced before clean stop finalizes replay
1.0.0 and hashes all three retained files. Partial, empty, malformed, over-budget,
drifted, or interrupted input emits no completed replay/receipt; capture remains
user-owned, private, not training-authorized, no-auto-arm, and explicitly not
recorded-device-attested. Real pseudo-terminal tests prove the mechanics, not an
adapter, physical device, OS suspend, lab, field, ghost, system-ID, or training
result. PR #87/`d8afe7f` closes P8-013's capture mechanics at protected local
recorder-integration maturity; PR #91/`a8120ab` separately protects D52 controls.
Sovereign gateway archive admission, real adapter/device, suspend, and field proof remain owned
by the adjacent P8 tasks.

D51 advances P8-003 with a protected read-only import-verification seam.
The native command accepts exactly the complete five-file archive-v1 layout, rejects
symlinks/extras/unsupported or non-canonical inputs, streams bounded frames and the
sparse index, verifies exact sequence/time/count/duration/byte offsets, reconstructs
the replay-v1 digest, and checks all retained hashes without loading large artifacts
into Studio. The Desktop-only panel calls that command through exact Tauri API 2.11.1
and rejects response-version, field, numeric, privacy, or authority drift. It uploads
nothing and explicitly labels the result local self-consistency rather than
authenticity, device, recorded-device, field, sharing, training, lab, ghost, or
system-ID proof. The complete 40-step local gate and the three-engine browser matrix
pass; PR #89 exact head `dcaed0f`, reviewed tree `2d57349`, protected `b5418ac`, and
exact PR/post-merge CI/security protect this local inspection boundary. D52 now
supplies the next local dependency, recorder status/start/stop control, as a
protected boundary. Its exact control v1 reports shell-owned
`inactive|recording|finished` state across webview reloads, starts only from an active
admitted report plus D30/D12/consent/new-absolute-path/OS-enumerated-115200-port
authority, and stops into the unchanged persisted receipt v1. Strict native/Studio
parsers preserve private/no-training/no-device/no-field/no-auto-arm nonclaims and
move no frame bytes into React. Fourteen native tests, twenty Studio tests, all
three browser engines, and the complete 40-step local gate pass. Exact head
`69db857`, reviewed tree `25be1d3`, protected `a8120ab`, and exact PR/post-merge
CI/security protect it. D53 now supplies the protected next local dependency through
PR #93/`08d892f`, reviewed tree `90d8cbf`, and exact PR/post-merge CI/security: a
path-free five-file plan, native same-origin streaming PUTs, five
private checksum-bound gateway objects, migration 0025, and gateway readback that
sets only object integrity. Archive semantics, telemetry admission, device/field
provenance, sharing, and training remain false. Its 17 native, 25 Studio, 70 gateway,
clean/24-predecessor Postgres, 11-flow browser E2E, three-engine browser, and complete
40-step local gates pass. D54 now supplies the protected separate sovereign seam
through PR #95/`f8efb6f`, reviewed tree `f71ee1a`, and exact PR/post-merge
CI/security: the gateway streams and verifies all five objects through
native `forge-validate recorder-verify`, deletes private temporary bytes before
persistence, exact-binds one owned admitted model, and creates a separate admission
plus bounded object-backed telemetry reference. Migration 0026, export 1.6, deletion,
and D45 training refusal preserve the broader nonclaims. The clean/25-predecessor
database, 11-flow browser E2E, three-engine browser, and complete 40-step repository
gates pass under Python 3.12.13. D55 now supplies the protected local read-only
protocol-fixture identity-observation boundary through PR #97/`370d214`: exact
head `4321eaa`, reviewed tree `673a50c`, PR CI/security
`29519984713`/`29519984764`, protected-tree equality, and post-merge CI/security
`29520651520`/`29520651581` pass. Exact MSP-v1 commands 1/2/3/4/5/160, strict protocol
0/API 1.47/`BTFL`/stable `2025.12.x`/`KAKUTEH7` parsing, two byte-stable passes on
one open port, raw UID/response confinement, and domain-separated hashes. Nineteen
native, twenty-eight Studio, all 40 repository, clean/25-predecessor database, and
11-flow/three-engine browser gates pass. This self-reported protocol result is not
cryptographic attestation and is not yet bound to recorder start/end. Trusted
custody, real-device, suspend, and lab/field execution proceed only under
their separate P8 evidence lanes.

D56 protects that successor without changing any protected format or row through PR
#100/`1bf127d`. The
native boundary verifies a separately hash-pinned purpose-limited Ed25519
public trust bundle and short-lived signed authorization, re-enumerates separate
telemetry and identity ports, runs the exact D55 observation before telemetry open,
retains the verified authorization/pre-observation in shell-owned state, preserves
the existing clean D50 receipt ordering, and runs a second props-off D55 observation
before creating a new proof outside the exact five-file archive. The signature is by
the acceptance authority—not the device—and the proof keeps device cryptography,
recorded-device, field, sharing, and training authority false. Strict fixture-key
tests plus two independent identity pseudo-terminal sessions around real pseudo-
terminal telemetry capture pass, including substitution, revocation/time, proof
no-overwrite, and archive-preservation refusal. All 40 local gates, the locked
Desktop-native build, a fresh clean/25-predecessor isolated Postgres plus 11-flow
production-browser matrix, and exact PR/post-merge CI/security pass.
Named-controller and real-trust-root execution, rotation/revocation, host suspend,
EXT-004, and every later gateway/training promotion remain required.

D58 now implements the next bounded P8-007 slice at unprotected local
`local-ux-rehearsal` maturity. Internal ladder/control 1.0.0 replace the checked JSON
scaffold with one native shell-owned session, the exact contiguous SITL → HITL →
constrained → free prefix, D12/safe-ID/report-hash/exportable-policy/passing-D9-
supervisor-shaped inputs, and exact start/transition/end interactions. Studio
strictly reparses and rebinds native status, exposes D9's 50 Hz advisory/200 Hz
supervisor/fallback meanings, and leaves browser transitions locked. Native code
performs no hardware I/O and every physical/deployment/hardware/device/field/external-
beta claim remains false. Four ladder-specific tests inside 28 native Desktop tests,
37 Studio, 74 Gateway, and 227 worker tests pass; all 40 local gates under Python
3.12.13, a fresh clean/25-predecessor Postgres matrix, all 12 production-browser
flows, and Chromium/Firefox/WebKit pass. Reviewed remote protection and any real
transition evidence remain open, so P8-007 stays in progress.

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
