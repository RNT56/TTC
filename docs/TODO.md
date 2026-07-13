# TODO — every open task, all surfaces

The single consolidated backlog. Sources: the v3.0 plan's phase scopes (§19), its
cross-cutting backlog, its open items (§22), and repository housekeeping. Phase-level
*status* lives in [`ROADMAP.md`](ROADMAP.md); this file holds task-level detail.

**How to use this file**
- States: `[ ]` open · `[~]` in progress (add date + session) · `[x]` done · `[!]` blocked (say by what).
- IDs are stable; never renumber. Add new items at the end of the relevant section
  with the next free ID. Discovered work gets a TODO entry before (or instead of) a
  mental note.
- When you take an item: mark `[~]`, note it in your changelog entry; when done, mark
  `[x]` and check any ROADMAP exit criterion it satisfies.
- Items marked **blocker** stop a phase from closing.

---

## 0. Critical blockers

- **Recovery baseline:** G0 is closed on protected `main`; local full gates, PR checks,
  post-merge CI/security, and manual nightly evidence are linked in `PROJECT-STATE.md`.
- **P4 deterministic gate restored:** Brief-25 admits 25/25 without human repair;
  live provider/external-user proof remains separate phase and external work.
- **Governance/release blocker (`GOV-008..011`):** cross-platform
  release/artifact-SBOM/provenance/install proof, public repository surfaces, and
  the Linux Desktop dependency route remain open.
- **Resolved historical blocker 2026-07-13 (D32):** PRE-002 delivered the byte-exact
  pre-configurator prototype. The delivered vintage has no 31-variant slot system, so
  P0-007 is closed without fabricated parity; real equipped-variant semantics are
  tracked as XC-28/P1-014.

## 1. Pre-P0 housekeeping (PRE)

- [x] PRE-001 — Documentation system: canonical `AGENTS.md`, compatibility `CLAUDE.md`, `PROJECT-STATE.md`, changelog, phase/task/execution ledgers, and system docs *(rebuilt 2026-07-12)*
- [x] PRE-002 — Prototype committed byte-exact with sha256 `ca93489e…`; the pre-configurator vintage is frozen in-tree and published as annotated tag `prototype-final` at `0294a9d` *(remote proof refreshed 2026-07-12 under P0-010/GOV-006)*.
- [x] PRE-003 — Licensing *(2026-06-12, owner-delegated → **D24**)*: root `LICENSE` (open-core split, © RNT56), `LICENSES/Apache-2.0.txt` (canonical text), `NOTICE`; Apache zone = crates/ + schema/ + examples/; everything else proprietary; zone-2 package.json marked; cargo workspace already declared Apache-2.0
- [~] PRE-004 — Repo hygiene, active `main` protection, remote security scans, immutable Action pins, selected-Action allowlist, accurate metadata/topics, issue/PR templates, and contributor/security/support/conduct surfaces exist; release publication remains GOV work.
- [~] PRE-005 — Naming *(2026-06-12, owner decision → **D23**)*: the product is **ForgedTTC** and `forge-*` code namespaces stay. USPTO/EUIPO exact-name searches found no `ForgedTTC` record on 2026-07-13; confusing-similarity/common-law/class review by qualified counsel remains before filing or broad launch.
- [x] PRE-006 — Plan v3.0 adopted; docs suite upgraded; v2.0 archived *(2026-06-11)*

## 2. Phase task breakdowns

### P0 — Freeze & extract
- [x] P0-001 — Author contract schema v2.1 **as Rust types in `forge-contract`** (serde + schemars: meta, env, skeleton, parts, slots, ports, chains, driver, materials, sim incl. colliders/estimator, lockfile) per [`systems/model-contract.md`](systems/model-contract.md) *(2026-06-12, D21 session; Appendix-A round-trip tested)*
- [x] P0-002 — schemars → TypeScript codegen pipeline: emitted JSON Schema → TS types for studio/gateway (= XC-01) *(2026-06-12: `pnpm codegen:contract` → `contract.gen.ts`; CI guards schema drift)*
- [x] P0-003 — Monorepo scaffold: cargo workspace (`crates/forge-*`) + pnpm (`packages/studio`, `packages/gateway`) + `workers/`; CI bootstrap (fmt, clippy -D warnings, cargo test, wasm build, tsc, pytest) *(2026-06-12; Turborepo deferred until >2 TS packages)*
- [x] P0-004 — **Byte-equivalence MET** *(2026-06-12)*: hrx7 `125/2195/2581` and vx2-hornet `73/924/1250` exact vs the monolith extraction; guarded permanently in CI (extraction-drift + translation-drift + compare steps)
- [x] P0-005 — hrx7 → `examples/hrx7.forge.json` *(2026-06-12; mechanical: `scripts/translate-monolith.mjs` instruments the monolith's own N()/P() calls in a vm sandbox — zero hand transcription)*
- [x] P0-006 — fpv → `examples/vx2-hornet.forge.json` *(2026-06-12; same mechanical path; "combat" naming dropped per §17.2)*. Finding: both translations fail CTR-004 (explode coverage 69 %/42 % vs the later 80 % gate) — historical models predate the completeness gates; gates unchanged, recorded honestly
- [x] P0-007 — Translate all 31 slot variants — **closed as not applicable by D32 (2026-07-13):** the byte-frozen delivered vintage has no slot/variant system, so no defensible 31-variant source exists to translate. The repository will not invent historical parity; actual equipped-variant behavior is XC-28/P1-014.
- [x] P0-008 — Extraction harness complete *(2026-06-12)*: counts (`extract-counts.mjs`) + **trajectory tapes** (`extract-trajectories.mjs` → `prototype/trajectories/`, deterministic, CI re-records on drift)
- [x] P0-009 — **Core boundary API frozen (v1)** *(2026-06-12)*: bake + validate + **tick** (CoreSession, bit-deterministic) + **patch** (JSON-Patch with shape gate) all live in binary + WASM facade; zero-copy views remain a P1-005 refinement that cannot change call shapes
- [x] P0-010 — Verified the current file and commit `0294a9d` both hash to `ca93489e05df87f94c0da0aacbedfd41a24274b19ab5a440df46bee3d5d21cbe`; created and pushed annotated tag `prototype-final` at that commit *(2026-07-12; = `GOV-006`)*.

### P1 — Core & studio
Rust core (D21 note: v0 implemented directly in Rust on 2026-06-12; "done" for
each item still means **oracle parity** once PRE-002 lands — the JS/prototype
recordings remain the completion criterion):
- [x] P1-001 — `forge-motion` *(2026-06-12)*: 2-bone IK ✓, mixer ✓, servos ✓, clamps ✓, multirotor/rover drivers ✓; **biped + FPV oracle drivers ported line-faithful from the monolith** (`biped.rs`/`fpv.rs`: idle layers, arrive + heading spring + speed ramp, blended phase gait + monolith legIK, drag-limited flight, tilt servos, per-motor RPM mixer, servo settle, head detents, telltales). **Tape parity at ULP level**: max dev 4.4e-16 (biped) / 7.1e-15 (fpv) vs `prototype/trajectories/`, banded 1e-9 in `tests/tape_parity.rs`; wired into `CoreSession` via `node_world_posed` (nm()'s base+animated euler), golden tick corpus re-pinned (bake hashes unchanged), BEH-001 biped walking smoke live
- [x] P1-002 — `forge-geometry` *(2026-06-12)*: prototype-exact polygon builders ✓, massprops ✓, AABB ✓, **per-part BVH + Möller tri-tri (XC-09)** ✓ — GEO-003 upgraded to BVH-CONFIRMED mesh intersection (hrx7: 53 AABB candidates → 41 confirmed, 12 false positives silenced) and **GEO-008** sampled animation sweep ticks the real driver and catches motion-only interpenetrations (hrx7: 2 found — thigh shells × pelvis at gait extremes; 127 ms total)
- [x] P1-003 — `forge-sim` propulsion/battery/estimator plus engine-backed Rapier world and browser worker/session wiring *(reconciled 2026-07-12: `forge-sim::rapier`, WASM `RapierSession`, `rapier.worker.ts`, engine tests; real-mid-hardware performance remains P1-017)*
- [~] P1-004 — `forge-validate`: 15 checks live (CTR-001..008, GEO-001/003v0/004/005/006/007, SIM-001..003, BEH-001v0/002, PRV-001) with diagnostics + report envelope + CLI (run/bake/bom/schema) ✓; remaining catalog rows land per phase
- [x] P1-005 — WASM facade *(2026-06-12)*: validate/bake/schema/tick/patch in the browser, **plus the typed boundary** — `Bake` handle (meta JSON once; positions/normals/indices as typed-array views over wasm memory, geometry never JSON-round-trips; in-place `patch` re-bake = the configurator primitive) and `Session.pose_view` (zero-copy per-frame poses). **Budgets measured and CI-gated** (`scripts/budgets.mjs`, binding): hrx7 bake **2.0 ms** ≤ 60 · patch→re-bake **2.8 ms** ≤ 10 (was ~10/~10.8 through JSON); facade 298 KB gz ≤ 2 MB. Studio fetches contracts only and bakes/validates in-browser (demo .bake/.report payloads pruned; `pnpm demo:sync`). **Found+fixed: wasm `validate` had trapped since day one** (`std::time` panics on wasm32; no gate exercised the path) → cfg'd report clock (js-sys on wasm) + golden-compare now requires native↔wasm **validator-report equality** (volatile fields normalized) on all four canonical contracts
- [x] P1-006 — **Golden-number suite live** *(2026-06-12, XC-26)*: core-side FNV-1a/ULP hashing of bake buffers + 600-step scripted tick streams; `forge-golden` binary ↔ WASM facade byte-identical in CI; hashes pinned in time (`crates/forge-wasm/tests/fixtures/golden.jsonl`). **Found+fixed a real D17 divergence on first run** (native vs wasm libm ULPs) → all core transcendentals route through `forge-num` (pure-Rust libm). Monolith trajectory tapes recorded (`prototype/trajectories/`) as the oracle axis for the driver ports (P0-008 trajectory half also done)
- [x] P1-007 — **Binary ↔ WASM bit-identical on both translated contracts** *(2026-06-12: hrx7 + vx2-hornet bake/tick hashes equal across targets — golden-compare, CI-gated)*

Studio (TypeScript face):
- [x] P1-008 — Three.js scene graph consuming core-baked buffers *(2026-06-12)*: **one BatchedMesh per material class** (≤ 5 batches/model, per-instance color + matrix; batchId raycast picking; merged single-LineSegments leaders) — hrx7 draws in **8 calls shaded / 9 blueprint / 9 exploded** vs ~260 before (≤ 40 budget now gated in the parity gallery); camera near 0.01 for 10× depth precision
- [x] P1-009 — PBR material classes per mapping table ✓; three-point IBL-lite rig + PCF shadows ✓ *(2026-06-12)*
- [x] P1-010 — Blueprint mode *(2026-06-12)*: flat pass + blueprint background + **normal/depth edge post pass** (view-normal + depth RT → full-screen discontinuity shader, transparent line overlay) — the 125 per-part EdgesGeometry objects are gone; verified headless (screenshot + 9 draw calls)
- [x] P1-011 — Explode: per-part windows ✓ + dashed leader lines on leader-flagged parts ✓ *(2026-06-12; Line2 fat-line upgrade cosmetic)*
- [x] P1-012 — Selection *(2026-06-12)*: batchId raycast picking + info panel + **inverted-hull outline** (back-face shell inflated along normals, rim distance-scaled to ~2 px) — chosen over stencil: 1 draw call, no postprocess dependency, depth-correct for occluded parts; recorded here as the implementation decision
- [x] P1-013 — Camera + inspection *(2026-06-12)*: orbit ✓; follow camera ✓ (`Session.focus()`, monolith min(1, dt·5) easing); **jog teach-pendant** ✓ (core `Session.set_jog` — per-node euler over the pose layers, the monolith's `nodes[k].rot += jog[k]`; studio drag on the selected node, zero button; clearing restores the bit-identical stream — tested); **pause + 1/120 s frame-step** ✓. Jog applies on the posed paths (biped/multirotor); quadruped/rover jog lands with their posed-path upgrade
- [x] P1-014 — Configurator pane *(completed 2026-07-13 with XC-28)*: color/material edits and equipped-variant cards patch the live `CoreBake` handle; only `equippedVariantId` changes on a card click, the validator re-judges the result, catalog cards disclose missing lockfile resolution, and selection survives flattened part-index changes by stable source JSON Pointer with same-node fallback. Browser proof switched an inline payload alternative and observed topology/HUD consequences while the WASM validator remained sovereign.
- [x] P1-015 — Golden-scene parity gallery vs monolith *(2026-06-12)*: `pnpm parity` (`scripts/parity-gallery.mjs`) renders both — the frozen monolith (bridged copy, rest pose pinned, chrome suppressed) and the built studio (`__forgeParity` hook: camera pose, grid/shadows off) — under 6 canonical cameras (2 models × 3 views, monolith FOV 2·atan(0.3443)), headless chromium + SwiftShader. Structural gate: Sobel-edge F1 with 1-px tolerance ≥ 0.85; **measured 0.95–0.995 on all six** (wrong configs score ≤ 0.4). Evidence committed: `docs/assets/parity/` composites + metrics; full gallery regenerates into `artifacts/parity/` (gitignored). CI integration deliberately deferred (chromium install flake risk) — local tool + committed evidence
- [x] P1-016 — N8AO + quality tiers *(2026-06-12)*: shaded pipeline renders through EffectComposer (Render → N8AO → Output; blueprint keeps its own pass; `n8ao` is the only new dep — plan-named at XC-22); tiers high/medium(½-res AO)/low(AO off) over pixel ratio, with the **XC-22 degradation ladder v0**: sustained < 45 fps for 3 s steps the tier DOWN (never up — raising is manual); parity gallery captures pin tier=low for determinism. Measured (SwiftShader floor): high 2.6 ms render · low 0.6 ms
- [~] P1-017 — Perf overlay *(2026-06-12)*: fps + render ms + **draw calls + core-tick ms** live (honest per-frame accounting across blueprint's multi-pass — `info.autoReset` off); measured on SwiftShader (software floor): render 0.5 ms · core ≤ 0.05 ms · 9 draws. Rapier split lands with the worker (P6); UI ms pending

### P2 — Data-driven models
- [~] P2-001 — Validator productized: check catalog (CTR-001..008, GEO, SIM, BEH, PRV) + diagnostic JSON stable ✓; in-studio WASM validation live ✓; npm + crates.io publication plumbing pending
- [x] P2-002 — Draft semantics and persistence (D14): CLI/gateway save-as-draft behavior, `generated_artifacts` persistence, Studio draft UX, and admitted-only train/export/deploy/share gates are implemented and tested *(reconciled 2026-07-12)*
- [x] P2-003 — Driver library: multirotor, rover, quadruped, biped, FPV, and arm parameter schemas/validation; arm damped-least-squares driver is implemented and tested *(reconciled 2026-07-12)*
- [x] P2-004 — Quadruped driver: trot phase gait, per-leg IK, diagonal pairing, validator smoke ✓ *(2026-06-12)*
- [x] P2-005 — `forge-gen quadruped`: the structural body is tiled into printable modules while preserving DfM sovereignty, mass closure, collider budgets, and full-slider-grid admission *(recovered 2026-07-12; `REC-002`)*.
- [x] P2-006 — CI: declared-verdict matrix on every first-party contract *(2026-06-12)* — `examples/expected-verdicts.json` pins verdict + the exact ERROR check-id set per contract; `scripts/validate-all.mjs` enforces in CI (undeclared contracts and stale expectations both fail)
- [x] P2-007 — OD-08 measured and recorded as **D22** *(2026-06-12)*: spawn p50 5.3/17.8 ms (16/125 parts) vs in-process 0.7/3.7 ms (`scripts/od08-measure.mjs`) — binary-spawn stays (isolation + bit-equality), napi-rs deferred until a measured hot path demands it

### P3 — Component DB + proof pair + reference rigs
- [x] P3-001 — Postgres schema + local runner *(2026-06-13)*: DDL now spans `0001_catalog.sql` + `0002_connector_taxonomy.sql` + `0003_p3_completion.sql`; `pnpm db:migrate`, `pnpm db:seed-catalog`, and `pnpm db:assert-p3` provide the local pgvector-backed production slice.
- [x] P3-002 — Connector taxonomy seed *(2026-06-12)*: `infra/migrations/0002_connector_taxonomy.sql` — stack 30.5/25.5/20 patterns, motor 16/19/12 bases, prop M5/T-mount, XT60/XT30/JST-PH-2, UART/I2C (published ecosystem standards; component rows still cite their own datasheets)
- [x] P3-003 — Compatibility rule engine *(2026-06-12)*: `forge-validate::compat` (CORE-side, correcting the doc's gateway *(proposed)* placement per D16) — CAT-001..006 with explanation strings on every violation; fixture-tested rule by rule. v0 scope stated: prop clearance is the spacing form (BVH sweep = XC-09); TWR takes thrust/AUW from the caller
- [~] P3-004 — ETL worker v1: fetch → Claude extraction with per-field citations → OCCT tessellation → LOD chain → dedupe → license ledger entry → human review queue. *(2026-06-14: deterministic fixture-backed ingest is live; `etl.ingest-component` can now route source-bundle payloads through fetch/extract/geometry adapters, with command-backed Claude/OCCT seams; live provider credentials and review persistence remain open.)*
- [x] P3-005 — License ledger + classes (`open/attribution/no-redistribution/view-only`) populated at ingestion, non-optional (D10): catalog rows now require `license { id, class, terms, sourceUrl, exportPolicy }`; Rust loader, DB seed, and worker citation gate reject missing license/price data.
- [x] P3-006 — Lockfile resolver *(2026-06-12)*: `forge-contract::{semver (exact/^/~, no new deps), pin_refs, upgrade_lockfile, RevisionSource}` — pin stability over freshness, yanked revisions verify-but-never-freshly-resolve, upgrades return explicit diffs for LIF-001 re-validation; tested incl. yanked + unsatisfiable-range reasons (= XC-03)
- [x] P3-007 — Proof pair *(2026-06-13 refresh)*: EMAX ECO II 2207 1900KV + CNHL Black 4S 1500 as production-shaped `catalog/components/` rows with license ledger, prices, citations, review state, and lockfile pins. `tests/proof_pair.rs` covers dimensions, resolver pins, CAT compatibility, BOM SKU export, pack-swap HUD response, and reference-rig resolution.
- [x] P3-008 — Reference rigs (D12): pinned `catalog/reference-rigs/ref_quad_kakute-h7-source-one-5in.json` and `ref_rover_waveshare-ugv-rover-pt-pi5-ros2.json`; recorded in DECISIONS.
- [x] P3-009 — BOM v0: `forge-validate bom --catalog catalog --format csv|json` and gateway `/v1/bom` export component IDs, revisions, quantities, vendor SKUs, prices, URLs, license classes, review status, and citations.
- [x] P3-010 — Thrust-table interpolation + proof row: table-over-estimate precedence is wired through catalog-backed HUD; proof motor carries a cited sparse 5x4.6/6S thrust-current table pending owner review.

### P4 — Text-to-CAD GA
- [x] P4-001 — Generation orchestrator: intent parse → retrieval → deterministic six-archetype synthesis → validator-in-loop repair (≤ 3 iterations) → admission/draft *(2026-06-14: `POST /v1/generate` and `/stream` emit staged events for intent, retrieval, skeleton/slot, part/detail, validation, repair, admission/draft; deterministic templates are the GA gate, Anthropic remains opt-in)*
- [x] P4-002 — Prompt-cache prefix builder *(2026-06-13)*: schemars-emitted schema + engine docs + pattern exemplars (= XC-14)
- [x] P4-003 — Retrieval: approved catalog rows + pattern-library table/query + export-policy filters *(2026-06-14: pattern query is optional/fail-open on pre-migration DBs; pgvector ranking can refine later without changing the contract)*
- [x] P4-004 — Pattern-library harvester with consent flags (§2.2 terms) (= XC-13) *(2026-06-14: table/schema + retrieval contract landed; harvesting itself is deterministic first-party rows, live marketplace opt-in remains policy work)*
- [x] P4-005 — Conversational editing: deterministic NL → JSON-Patch through `forge-validate patch`, full re-validation, < 3 s gateway path *(2026-06-14: dimensions, colors/materials, speed, battery cell count, prop guards/ducts)*
- [x] P4-006 — Provenance stamps: model version, prompt hash, seed, validator report on every generated artifact *(2026-06-13: generated contracts carry model/prompt/seed provenance; `generated_artifacts` persists contract/report/context/model pins/attempts for admitted, draft, and rejected generations)*
- [x] P4-007 — Share URLs (D4): read-only contract viewer, no account required *(2026-06-14: admitted-only `share_snapshots`, public `/v1/share/:shareId`, Studio `?share=` mode)*
- [x] P4-008 — BYO Anthropic key + metered credits plumbing (D3); studio-free tier boundaries *(2026-06-14: BYO key remains opt-in; Auth.js users, credit accounts, usage events, zero-cost template usage, Modal-job debit scaffolding landed)*
- [x] P4-009 — Brief-25 corpus authored (25 canonical briefs across archetypes/scales/constraints) (= XC-15) *(2026-06-13: `evals/brief25.corpus.json`)*
- [x] P4-010 — Brief-25 CI + dashboard: deterministic templates now admit **25/25** without repair; manufacturing repair splits oversized primitives with direct regression coverage, and arm behavior repair emits executable driver parameters *(recovered 2026-07-12; `REC-004`)*.
- [x] P4-011 — Pin Anthropic model strings/limits/pricing from official Anthropic docs at implementation; record in DECISIONS *(2026-06-13: D26; exposed by `GET /v1/generate/models`)*
- [x] P4-012 — Draft-state UX in studio (= XC-16) *(2026-06-13: generation panel displays blocked/draft/rejected/admitted states, validator attempts/diagnostics, loads admitted or draft contracts into the scene, and disables share for non-admitted drafts)*
- [x] P4-013 — Environment generation reuses the pipeline with EnvSpec schema (delivers with P10; seam designed now) *(2026-06-14: schema-generic route/data seam and `forge_sim::runtime::EnvSpec` validation stub landed)*
- [x] P4-014 — Catalog review operations before live generation (D25) *(2026-06-13)*: gateway exposes `GET /v1/reviews` and `PATCH /v1/reviews/:id` over the P3 `review_queue`; studio owner-review panel lists, filters, approves, and rejects rows against the local gateway. Audit notes, decision payloads, export-policy filters, and local/admin owner-token auth are live; full account Auth.js remains P11 platform scope.
- [x] P4-015 — Live source-fetch adapter interface *(2026-06-13)*: deterministic fixture path stays the test oracle; HTTP/source adapters are injectable, rate-limited, and never required for CI.
- [~] P4-016 — Claude extraction adapter behind BYO/API-key plumbing *(2026-06-14: fixture/injected extractor seam plus `FORGE_CLAUDE_EXTRACT_CMD` command transport live; live Claude provider credentials remain deployment-owned)*: emits canonical catalog rows, per-field citations, license terms, prices, confidence, and review reasons; no row persists without the P3 validator gates.
- [x] P4-017 — OCCT ingestion adapter interface *(2026-06-13)*: tessellation/LOD outputs attach to catalog revisions after review through an injected executor; missing OCCT degrades to envelope geometry, not uncited mesh truth.

### P5 — Image → 3D
- [~] P5-001 — Photoscan worker: background removal → TRELLIS-class single-image reconstruction → manifold repair → decimation *(2026-06-14: `photoscan.single` fixture handler emits full stage records and the live `FORGE_PHOTOSCAN_CMD` path now normalizes command output into the same D13/cache/SLO contract; live reconstruction runtime remains deployment work)*
- [~] P5-002 — COLMAP multi-view path for N-photo bursts *(2026-06-14: `photoscan.multiview` validates multi-image payloads, emits COLMAP-style view graph, and the live `FORGE_COLMAP_CMD` path now normalizes command output into the same D13/cache/SLO contract; real COLMAP runtime remains deployment work)*
- [x] P5-003 — Primitive refit with D13 acceptance (≥ 70 % fit coverage, Hausdorff ≤ 1.5 %); mesh-class fallback *(2026-06-14: deterministic acceptance/refit records in worker output)*
- [x] P5-004 — Alignment UI: known-dimension scale, axis snap, port authoring *(2026-06-14: owner-scoped `PATCH /v1/photoscan/artifacts/:id/alignment` plus Studio editor persist known scale, principal axis, and structured authored ports on materialized scan artifacts; direct mesh-click port placement remains polish beyond the deterministic P5 closure slice)*
- [x] P5-005 — Photoscan admission path with `source: photoscan` provenance; optional datasheet merge *(2026-06-14: candidate component row shape with confidence/review flag emitted)*
- [~] P5-006 — Burst-GPU integration (Modal/RunPod) + permanent result cache; 5-min SLO *(2026-06-15: Modal task profiles now pin photoscan/COLMAP GPU runtime expectations, 300 s timeout, cache requirement, and command envs; real under-5-minute GPU validation open)*

### P6 — Sim depth + interop
- [x] P6-001 — Contract→Rapier compiler and engine-backed world: per-node compound colliders, joints/motor limits, stepping, pose export, WASM session, and browser worker are implemented/tested *(reconciled 2026-07-12; live engine parity remains P6-010)*
- [x] P6-002 — Collider-compound auto-fitter (hulls/primitives per node) (= XC-10) *(2026-06-14: deterministic box/cylinder/hull fit report with per-node budget overflow tests in `forge-sim::heavy`)*
- [x] P6-003 — Propulsion model: motor n ≈ Kv·V_eff·u, T = C_T·ρ·n²·D⁴, Q = C_Q·ρ·n²·D⁵; thrust-table interpolation; blade-element-lite fallback *(2026-06-14: table path plus blade-element-lite torque/current helper tested)*
- [x] P6-004 — Battery model: sag (R_int), capacity integration; unit tests against bench math (= XC-07) *(2026-06-14: explicit runtime sag helper + existing HUD powertrain tests)*
- [x] P6-005 — Estimator module (complementary + EKF upgrade path) with noise/bias/latency injection (D8) (= XC-08) *(complementary filter live; EKF remains upgrade path)*
- [x] P6-006 — HUD analytics: AUW, TWR, hover throttle, instantaneous current, endurance — derived, assumptions inspectable
- [x] P6-007 — Disturbance injectors: gusts, payload shifts, sensor dropout *(2026-06-14: deterministic disturbance sampler with dropout tests)*
- [x] P6-008 — MJCF + URDF exporters v0 ✓ (per-node mass/COM/inertia from baked meshes, Y-up→Z-up, joints/limits/actuators, golden fixtures = XC-04 ✓); ros2_control sidecar + mesh visual manifest live *(2026-06-14: sidecars are explicit so pinned exporter goldens stay stable)*
- [x] P6-009 — URDF/MJCF importer: links→nodes, visual geoms→mesh parts, collision→compounds, joints→joint blocks; importer fixtures (= XC-05) *(2026-06-14: deterministic URDF/MJCF subset imports to slotless schema-valid contracts with static rover fixtures; full external-driveable import remains the P6 exit criterion)*
- [~] P6-010 — Rapier↔MuJoCo parity suite: drop tests, pendulum periods, hover trim, gait CoM trajectories; runs on every engine/exporter upgrade *(2026-06-14: deterministic parity fixture checks live; actual engine-backed Rapier/MuJoCo execution still open)*
- [x] P6-011 — Replay format v1: {contract hash + lockfile, env, seed, input tape} — verifiable on any surface (D17) *(2026-06-14: replay envelope/header verification in Rust plus worker hash/timestamp/contract checks)*

### P7 — Training service
- [x] P7-001 — Task suite v1 (versioned env definitions): hover-hold, waypoint chain, gate slalom, velocity tracking; walk-to-target, rough-terrain, push recovery; line-follow, obstacle course; reach/track *(2026-06-14: `workers/forge_workers/training/tasks.py` defines the full P7 v1 env suite and `train.policy` emits the selected task definition)*
- [x] P7-002 — Obs/action space derivation from contract (estimator state in, normalized targets out); ONNX policy I/O header *(2026-06-14: Rust derivation and worker ONNX header emitted/tested)*
- [~] P7-003 — SB3 PPO/SAC pipeline; seeded, reproducible runs *(2026-06-15: fixture/export gates remain live and the Modal task profile now declares SB3/MuJoCo/ONNX dependencies plus the `FORGE_SB3_TRAIN_CMD` hook; real SB3/MuJoCo runtime remains adapter work)*
- [x] P7-004 — Domain-randomization config block (mass ±15 %, Kv ±8 %, sag ±20 %, latency 0–30 ms, IMU noise/bias, friction 0.4–1.2, wind 0–4 m/s, obs dropout) *(2026-06-14: fixture policy jobs carry the default randomization block)*
- [x] P7-005 — Curriculum stages in task definitions *(2026-06-14: task spec/worker metadata includes curriculum stage)*
- [x] P7-006 — Scorecard generator: success rate, robustness grid, energy; sub-threshold export block; estimator-smoke gate (D8) *(2026-06-14: `p7-scorecard-v1` requires success, robustness, energy, estimator-source evidence, lineage, thresholds, export reasons, and blocks ONNX export for failed fixture or external SB3 policies)*
- [x] P7-007 — Scorecard renderer in studio (= XC-21) *(2026-06-14: output-aware jobs panel renders success rate, robustness grid, energy, export gate, IO counts, and ONNX metadata)*
- [~] P7-008 — ONNX export + in-browser playback through the motion engine's policy layer *(2026-06-14: ONNX fixture metadata is emitted/rendered and Studio can play policy job action headers through `CoreSession`; live ONNX Runtime Web inference remains open)*
- [~] P7-009 — Behavior cloning + offline RL ingestion seam for telemetry logs (full pipeline lands P8+) *(2026-06-14: telemetry ingest worker emits sorted replay tapes; `train.offline-bc` builds deterministic sorted datasets and warmstart artifacts from telemetry frames, and `FORGE_OFFLINE_RL_CMD` outputs now normalize into non-exportable dataset/warmstart artifacts; live fine-tune adapter remains open)*
- [~] P7-010 — MJX benchmark: measure CPU-MuJoCo PPO saturation on our morphologies before adopting (claims hedged until benchmarked) *(2026-06-15: worker benchmark report normalizes payload/`FORGE_MJX_BENCH_CMD` rows, requires D12 quad/rover/legged coverage, and applies CPU-need + parity + 3x cost-normalized-throughput adoption rules; real D12 benchmark data still required before adoption)*

### P8 — Bridge + Desktop
- [x] P8-000 — **Entry gate:** ToS/liability legal review (ladder UX, supervisor disclaimers, telemetry consent) — see [`security-safety-legal.md`](security-safety-legal.md) *(2026-06-14: accepted for controlled D12 lab pilots by D30; `platform_gate_signoffs` records `d28.hardware=accepted`; external beta remains separately gated)*
- [~] P8-001 — WebSerial FC configuration writer (Betaflight-configurator pattern; config diffs compiled from contract) *(2026-06-14: deterministic `bridge.config-diff` worker live; gateway/Desktop enforce D30 + lab-mode + D12 rig gates; browser serial write awaits lab adapter)*
- [~] P8-002 — Telemetry ingest over WebSerial/WebUSB into the recorder *(2026-06-14: `bridge.telemetry-ingest` worker emits sorted replay tapes; WebSerial/WebUSB capture open)*
- [~] P8-003 — Flight recorder: real sessions in the replay format; indexed telemetry tape *(2026-06-14: telemetry ingest/replay verify jobs, `telemetry_logs`, and `replay_artifacts` materialization live; Desktop background capture open)*
- [~] P8-004 — Ghost overlay: twin prediction rendered under real telemetry; divergence scrubbing at 60 fps over 10-min logs (= XC-20) *(2026-06-14: crash-forensics output includes ghost overlay metadata and Studio renders crash window/ghost metric; scrubber UI open)*
- [~] P8-005 — System-ID fitting job: bench pulls/logs/step responses → updated sim block → policy fine-tune loop *(2026-06-15: `train.sysid-fit` estimates R_int and emits simPatch; `FORGE_SYSID_FIT_CMD` output now normalizes through the same contract and fails closed without enough samples, accepted fit state, and non-empty simPatch; real bench/flight telemetry open)*
- [~] P8-006 — FORGE Link image: Pi-class; rosbridge + MAVLink router + ONNX runtime + pairing-code auth (= XC-19) *(2026-06-14: checked image manifest/service contract live in `packages/desktop/forge-link/manifest.json`; flashable image build remains open)*
- [~] P8-007 — Deployment-ladder UX: SITL → HITL → constrained → free; physical confirmation at each transition; control-rate contract surfaced (D9) *(2026-06-14: checked ladder contract live in `packages/desktop/deployment-ladder.json`; D30 permits D12 lab pilot UX implementation)*
- [~] P8-008 — Safety supervisor: geofence, attitude/rate envelopes, battery floor, kill switch, fallback controller; policy advisory at ~50 Hz, supervisor ≥ 200 Hz *(2026-06-14: deterministic supervisor decision worker/Rust helper live; D30 permits D12 lab integration only)*
- [~] P8-009 — Pilot: reference quad SITL→HITL→tethered, documented *(2026-06-14: D30 accepted; dry-run playbook and `pnpm pilot:check` live; real HITL/tethered execution now awaits lab adapter/evidence capture)*
- [~] P8-010 — Pilot: reference rover deployment via ROS 2 path, documented *(2026-06-14: D30 accepted; ROS 2 playbook and `pnpm pilot:check` live; real constrained driving now awaits lab adapter/evidence capture)*
- [~] P8-011 — **FORGE Desktop (Tauri) shell**: same web bundle in webview; build + signing + update pipeline for the three desktop OSes (D15) *(2026-06-14: `@forge/desktop` Tauri scaffold wraps Studio and validates bundle targets; signed OS installers/updater open)*
- [~] P8-012 — Desktop serial plugin (serialport-rs): bridge beyond Chromium (= XC-27 part 1) *(2026-06-14: fail-closed Tauri command contract exists and now requires D30 signoff env, hardware lab mode, and D12 rig allowlist; real serialport-rs integration is the next lab implementation step)*
- [~] P8-013 — Desktop background recorder + real-filesystem log archives (= XC-27 part 2) *(2026-06-14: fail-closed Tauri recorder command contract exists with the same D30/D12 lab gate; sidecar recorder and archive indexing open)*
- [ ] P8-014 — Field demo: a log captured by Desktop replays with visible ghost divergence (P8 exit criterion)

### P9 — Co-design optimizer
- [x] P9-001 — Parameter-manifold encoding: slot choices categorical, dims/driver params continuous, validator bounds *(2026-06-14: codesign worker emits categorical/continuous manifold and bounds)*
- [~] P9-002 — CMA-ES orchestrator + Optuna TPE for categorical-heavy spaces *(2026-06-15: deterministic candidate/Pareto evaluator and external `FORGE_CODESIGN_CMD` remain live; Modal profile now declares MuJoCo/Optuna and parity/MJX hooks, while live engine-backed CMA-ES/Optuna remains open)*
- [~] P9-003 — Multi-fidelity ladder: tier 0 (schema/compat/static — native via core binary, < 50 ms) → tier 1 (Rapier smoke, s) → tier 2 (short MuJoCo rollouts) → tier 3 (full training, finalists only) *(2026-06-14: tier labels, per-candidate ladder evidence, optimizer metadata, finalist contract, and budgeted keyless tier search live; full simulator ladder open)*
- [x] P9-004 — Pareto-front UI: each point an admitted, openable contract *(2026-06-16: Studio renders Pareto points with metrics, applies admitted JSON-Patch candidates through live patch/re-bake, and can save admitted points through the model admission route; worker Pareto fronts exclude rejected candidates and prove the 200-candidate constrained-course shape. Engine-backed optimizer/simulator evidence remains tracked under P9-002/P9-003.)*
- [~] P9-005 — MJX batching for tier 2/3 if P7-010 benchmark demands *(2026-06-15: P7-010 report now decides whether MJX is allowed; actual tier-2/3 batching remains open until real benchmark evidence adopts MJX)*

### P10 — Environments & courses
- [x] P10-001 — EnvSpec schema: terrain, gates/obstacles, spawns, win conditions, env block *(2026-06-16: runtime EnvSpec carries id/name/version/kind, provenance/license, bounds, terrain, task adapters, obstacles, gates, spawns, win conditions, env overrides, semver validation, and fixture coverage.)*
- [x] P10-002 — Env gatekeeper checks: reachability, bounds sanity, spawn validity, collider sanity *(2026-06-16: `forge-validate env`/`forge-sim::runtime::validate_envspec` cover id/name, semver, positive bounds, tasks, spawn presence/bounds, gate dimensions/bounds, obstacle sizing/bounds, win gate references/time, and conservative archetype-aware spawn-to-gate reachability.)*
- [x] P10-003 — Environment generation through the P4 pipeline *(2026-06-16: gateway `/v1/courses/generate` accepts prompt/archetype/seed, emits a versioned provenance-stamped EnvSpec template, runs `forge-validate env`, and persists only admitted generated courses.)*
- [x] P10-004 — Course sharing by URL; courses as community objects *(2026-06-16: public/unlisted `GET /v1/courses/:id`, Studio editable EnvSpec course form, and `?course=<id>` URL selection/copying are live; private courses stay owner-only.)*
- [x] P10-005 — Leaderboards: per-course/archetype/class; replay verification — universally checkable (D17), server re-verified as anti-cheat hygiene (= XC-25) *(2026-06-16: leaderboard routes/tables persist course/archetype/class dimensions, replay submissions compute server-side verification, blind client `verified` claims fail closed, and Studio filters boards by archetype/class/verification state.)*
- [x] P10-006 — Course→RL-task adapter (popular courses become training curricula) *(2026-06-15: `course_to_task` adapter maps EnvSpec/course tasks to RL task specs, and `train.policy` now consumes explicit `envSpec`/`course.envSpec` payloads directly with course ids preserved in ONNX/scorecard metadata)*

### P11 — Platform
- [~] P11-000 — **Entry gate (policy sharing):** dual-use/export-control sanity check (EU dual-use, US EAR) *(2026-06-14: `platform_gate_signoffs` carries `p11.policy-sharing`; policy listings fail closed until accepted, with per-listing signoff still required)*
- [x] P11-001 — Accounts (Auth.js; anonymous-local mode remains first-class) *(2026-06-14: GitHub OAuth via Auth.js core/Postgres adapter, `/auth/*`, `/v1/me`, user-owned models)*
- [x] P11-002 — Marketplace: model listings with gatekeeper-stamped validator reports *(2026-06-16: listings reject non-admitted models, review-status listings can be listed/rejected/delisted through review-token curation, public listings expose validator-stamped rows, usage-beta rollups record views/equips/quotes/training, and actioned moderation reports can delist listings.)*
- [~] P11-003 — Skills marketplace: ONNX + I/O header + scorecard + training lineage; fine-tune-against-buyer's-twin offer for non-matching morphologies *(2026-06-15: policy jobs emit ONNX header/scorecard/lineage, policy listing remains gate/signoff protected, and worker transfer assessment now allows direct transfer only for exportable policies with matching archetype + observation/action layouts while returning fine-tune offers for non-matching twins; public marketplace routing and live fine-tune execution remain open)*
- [x] P11-004 — Classroom mode: briefs as assignments, rubric = validator config + scorecard thresholds, auto-grading; `forge-validate` free binary as the institutional on-ramp *(2026-06-14: `classroom_assignments`/`classroom_submissions`, gateway routes, deterministic validator/rubric grading, and Studio controls live)*
- [~] P11-005 — BOM agent: live vendor offers for catalog slots *(2026-06-15: `vendor_offers` tables/routes remain live and worker commerce normalization now gates `FORGE_VENDOR_REFRESH_CMD` output into priced, provenanced, rate-limited offers with invalid rows held; gateway wiring to the normalizer and real provider credentials remain open)*
- [~] P11-006 — DfM + print ordering: oriented 3MF + profiles → print-service API (Craftcloud-class); printed-parts BOM section (= XC-18 DfM module dependency) *(2026-06-15: `occt.tessellate` now emits DfM report refs, oriented 3MF export refs, print profiles, quote-link-only handoff metadata, and printed-part BOM rows; worker commerce normalization blocks quotes without DfM-passing 3MF/profile artifacts and forces quote-link/off-platform checkout terms; gateway wiring, live provider quote submission, and true OCCT-generated orientation remain open)*
- [x] P11-007 — UGC moderation policy live: report flow, takedown SLA, repeat-infringer rule *(2026-06-14: `moderation_reports`, 72-hour SLA target, repeat-infringer signal, gateway routes, and Studio report action live; legal/process ownership still outside code)*
- [x] P11-008 — License ledger and export enforcement *(2026-07-13: API/UI remain live; `SEC-001` adds a versioned attribution/assembly manifest, restricted envelope + datum + HTTPS link-out substitution, BOM fallback, external manifest-hash proof, and adversarial output filtering across gateway/worker export paths.)*
- [x] P11-009 — Marketplace economics decided with usage data (OD-05); record in DECISIONS *(2026-06-14: D29 records usage-data beta, no seller payouts/revenue share/direct checkout at launch, credit cost-plus retained for GPU jobs)*

### P12 — Maintenance twin
- [x] P12-001 — Wear models: motor hours, pack cycle counts, R_int drift from logged sag *(2026-06-14: Rust helper and maintenance worker compute wear from telemetry)*
- [~] P12-002 — Crash forensics workflow: scrub-last-seconds with ghost separation *(2026-06-15: crash-window, scrub-frame counts, and computed ghost-divergence RMS/max/status live in the worker output and materialize to `maintenance_records`; Studio has a crash scrubber over the last-seconds window; real Desktop-captured field-log proof remains open)*
- [x] P12-003 — Repair sheets: explode chain order → repair steps + reorder links *(2026-06-15: Rust helper and maintenance worker generate ordered repair steps/reorder SKUs; worker steps now attach vendor offer and print quote handoff links supplied by commerce rows; Studio can refresh vendor quote/link handoffs without direct carts)*
- [~] P12-004 — Fleet view *(2026-06-14: fleet-summary worker live; maintenance job outputs materialize records; Studio now renders a fleet dashboard with counts, due service, critical state, next actions, wear, crash, repair, reorder rows, and vendor/print handoff links; live fleet data/field evidence remains open)*

## 3. Cross-cutting backlog (XC) — tracked from day one

From the plan §19 (v3.0). Each lands no later than its phase; build earlier when
touched.

| ID | Item | Earliest | Owning doc |
|---|---|---|---|
| XC-01 | schemars → TypeScript codegen pipeline (Rust schema is the single source) | P0 | systems/model-contract.md |
| XC-02 | Harness check IDs + diagnostic format | P2 | systems/validation-harness.md |
| XC-03 | Lockfile resolver + upgrade-diff UI | P3 | systems/component-database.md |
| XC-04 | MJCF/URDF exporter goldens — **done 2026-06-12** (`crates/forge-sim/tests/fixtures`) | P6 | systems/simulation-engine.md |
| XC-05 | URDF/MJCF importer fixtures — **done 2026-06-14** (`crates/forge-sim/tests/fixtures/import_rover.*`) | P6 | systems/model-contract.md |
| XC-06 | Thrust-table interpolation module — **done 2026-06-12** | P3 | systems/simulation-engine.md |
| XC-07 | Battery-sag unit tests | P6 | systems/simulation-engine.md |
| XC-08 | Estimator (complementary/EKF) module with noise injection | P6 | systems/simulation-engine.md |
| XC-09 | BVH interference service | P1 | systems/geometry-engine.md |
| XC-10 | Collider-compound auto-fitter | P6 | systems/geometry-engine.md |
| XC-11 | Port-graph coupler generator v2 | P2 | systems/geometry-engine.md |
| XC-12 | Wire-list emitter (cosmetic splines + exact BOM list, D-r1) | P3 | systems/geometry-engine.md |
| XC-13 | Pattern-library harvester with consent flags | P4 | systems/generation-pipeline.md |
| XC-14 | Prompt-cache prefix builder | P4 | systems/generation-pipeline.md |
| XC-15 | Brief-25 corpus + dashboard | P4 | systems/generation-pipeline.md |
| XC-16 | Draft-state UX | P4 | systems/studio-ui.md |
| XC-17 | License-ledger UI + export filter — **done 2026-06-14** (`/v1/license-ledger` + Studio platform panel) | P3 | systems/component-database.md |
| XC-18 | DfM check module — **FDM v0 validator checks live 2026-06-14** (`MFG-001..004`; worker 3MF/profile/BOM artifact refs live 2026-06-15; live provider quotes/open true orientation remain open) | P6 | systems/geometry-engine.md |
| XC-19 | Pairing-code auth + FORGE Link image build | P8 | systems/hardware-bridge.md |
| XC-20 | Ghost-overlay telemetry view | P8 | systems/hardware-bridge.md |
| XC-21 | Scorecard renderer | P7 | systems/learning-engine.md |
| XC-22 | Quality-tier autoswitcher | P1 | systems/render-engine.md |
| XC-23 | Schema migration runner — **done 2026-06-14** (`forge-contract` migration runner + `forge-validate migrate`) | P2 | systems/model-contract.md |
| XC-24 | Fuzz corpus seed set — **done 2026-06-14** (`evals/fuzz/modelspec-seeds.json` + `scripts/fuzz-contract-seeds.mjs` checker/minimizer) | P4 | systems/validation-harness.md |
| XC-25 | Leaderboard replay verifier — **done 2026-06-14** (server computes replay hash/timestamp/header checks before official verification) | P10 | systems/environments-courses.md |
| XC-26 | Golden-number suite harness — **done 2026-06-12** (XT-001 in CI; forge-num determinism fix) | P1 | systems/core-runtime.md |
| XC-27 | Tauri serial + background-recorder plugins | P8 | systems/hardware-bridge.md |
| XC-28 | **Done 2026-07-13:** ModelSpec 2.2 `equippedVariantId`, deterministic/refusing migration, exactly-one CTR-003 invariant, selected-only geometry/mass/sim/BOM/lockfile behavior, stable source pointers, Studio consequence cards, v0.2 package boundary, and native/WASM/real-browser proof | P1/P3 | systems/model-contract.md, systems/studio-ui.md, systems/simulation-engine.md, COMPATIBILITY.md |

## 4. Open decisions (OD) — non-blocking, from plan §22

| ID | Question | Decide by |
|---|---|---|
| OD-01 | ~~Product name~~ resolved as ForgedTTC by D23; formal trademark scan remains `GOV-010` | before public launch |
| OD-02 | ~~React vs Solid~~ — **resolved by D16** (the face stays React/TS; v3.0) | — |
| OD-03 | Left/right asymmetric slot UX (contract already supports) | when a build needs it |
| OD-04 | WASM user-controller sandbox design | post-P7 design review |
| OD-05 | ~~Marketplace economics (revenue share, skill pricing)~~ — **resolved by D29** as usage-data beta; seller payouts/revenue share deferred until real thresholds | — |
| OD-06 | Fixed-wing archetype priority | when demand signals |
| OD-07 | ~~Photoscan alignment timing~~ resolved: alignment UI landed with P5-004 | — |
| OD-08 | ~~napi-rs vs binary-spawn~~ resolved by D22/P2-007: keep spawn until measured need | — |

Record outcomes in [`DECISIONS.md`](DECISIONS.md) and mark the OD row resolved.

## 5. Post-P3 execution batch (owner: "execute everything", 2026-06-12)
- [x] XC-09 — BVH + tri-tri collision truth: GEO-003 BVH-confirmed (53→41 on hrx7), **GEO-008** sampled animation sweep (2 motion-only contacts found on hrx7), 127 ms
- [x] SIM-004 — inline-sim vs equipped-catalog drift check (deduped warns); vx2-proof reconciled to the cited kv 1900 — **TWR 4.70→5.32, hover 43→39 %** flowed from the datasheet
- [x] Share URLs — contract deflated into the fragment (`share.ts`), re-judged locally on open; round-trip browser-verified (hrx7 = 5.5 kB fragment)
- [x] Gamepad input — left/right sticks with deadzone in the drive loop; sliders stay the fallback
- [x] Patch consequence diff — Δ AUW/TWR/hover line after each configurator patch (D5 diff semantics)
- [x] Bundle split — three+n8ao chunk (app 78 kB gz; chunk warning gone)
- [x] Nightly workflow — browser CLI fixed; all six parity scenes pass and coverage is 84.34% lines against an enforced 80% floor; manual merged-main evidence is linked in `PROJECT-STATE.md` *(2026-07-12)*.
- [x] Release workflow — tag v* → static forge-validate binary + wasm facade package
- [x] Incremental re-bake — `bake_incremental` reuses untouched (geom, pose) buffers in `Bake.patch`
- [x] Property-based tests *(2026-06-12)*: proptest (dev-dep) over the schema heart — parse→serialize fixed point + hash stability across 64 generated docs; patch engine never panics and everything it returns passes the shape gate (incl. bad pointers/out-of-range/odd value types)

## 6. Recovery and truth baseline (REC)

- [x] REC-001 — Fixed Clippy without blanket allows; pinned Rust 1.96.0 in `rust-toolchain.toml` and every workflow; pinned-toolchain fmt, Clippy, and workspace tests pass locally *(2026-07-12)*.
- [x] REC-002 — Reconciled quadruped geometry with `MFG-004` using modular printable body panels; the full generator slider grid admits without weakening DfM *(2026-07-12)*.
- [x] REC-003 — Regenerated `qd-mini` from the corrected generator, synchronized the Studio demo and golden fixture, and restored all five declared verdicts *(2026-07-12)*.
- [x] REC-004 — Restored Brief-25 to 25/25; added diagnostic-aware manufacturing/arm repair and focused oversized-part repair coverage *(2026-07-12)*.
- [x] REC-005 — Fixed `playwright-core` installation, retained always-uploaded parity artifacts, and proved all six scenes plus enforced coverage in manual merged-main nightly runs *(2026-07-12)*.
- [x] REC-006 — `cargo llvm-cov --workspace` passes at 84.34% line coverage; nightly enforces a reviewed 80% line floor *(2026-07-12)*.
- [x] REC-007 — The original 30-step recovery gate, Postgres gate, green PR checks, protected merges, final post-merge CI/security, and manual nightly are linked in `PROJECT-STATE.md`; the current gate has 31 steps after GOV-007 compatibility enforcement *(2026-07-12)*.
- [x] REC-008 — Reconciled the agent entry, project state, phase/TODO/execution roadmaps, system docs, README verification flow, and changelog to the recovery evidence *(2026-07-12)*.

## 7. Governance, publication, and supply chain (GOV)

- [x] GOV-001 — Activated repository ruleset `18843164` for `main`: PR-only changes, strict current branches, resolved review threads, no force pushes/deletions, and the six exact merge-blocking checks from `REPOSITORY-GOVERNANCE.md` *(updated 2026-07-12 with native Desktop compile)*.
- [x] GOV-002 — Defined exact merge/release check names, safe rename protocol, ruleset behavior, evidence requirements, and nightly/security escalation in `REPOSITORY-GOVERNANCE.md` *(2026-07-12)*.
- [x] GOV-003 — Enabled vulnerability alerts, security updates, secret scanning/push protection, weekly grouped updates, dependency review/audits, and JS/Python CodeQL; first PR and post-merge runs are green *(2026-07-12)*.
- [x] GOV-004 — Upgraded direct `@auth/core` from 0.34.3 to 0.41.2, removing transitive `cookie@0.6.0`; `pnpm audit` reports no known vulnerabilities and gateway build/tests pass *(2026-07-12)*.
- [x] GOV-005 — All workflow Actions are pinned by immutable SHA; the workflow-pin step in the current 31-step local gate and required dependency-review job reject mutable refs; workflows use explicit read-only defaults and narrow job grants; security/release generate SPDX SBOMs; and repository Actions policy allows GitHub-owned Actions plus only the seven reviewed third-party SHAs. Protected PR and post-merge CI/security/SBOM proof is green *(2026-07-12)*.
- [x] GOV-006 — Recreated and remotely published annotated `prototype-final` at verified commit `0294a9d`; current and historical prototype SHA-256 both equal `ca93489e05df87f94c0da0aacbedfd41a24274b19ab5a440df46bee3d5d21cbe` *(2026-07-12)*.
- [x] GOV-007 — Defined policy 1.0.0 and a machine-checked seven-surface compatibility matrix for ModelSpec, validator CLI/report, WASM, replay, EnvSpec, and worker artifacts; added CLI/WASM version introspection, independently versioned reports, SemVer replay production with legacy-alias reads, EnvSpec schema-version enforcement, and current/legacy/unsupported tests *(2026-07-12)*.
- [~] GOV-008 — Cross-platform CLI/WASM matrix, deterministic archive assembly, source/artifact SPDX, checksums, manifest, GitHub provenance attestation, release notes, host-native downloaded smoke verification, annotated-tag enforcement, and release runbook are implemented. Manual branch run `29236010204` passed every build and aggregate job at `02f912d`; its downloaded bundle independently passed checksums, SPDX, macOS binary/example, and clean WASM-consumer verification. Protected-main rerun, annotated `v0.1.0`, GitHub Release, and post-publication download proof remain *(updated 2026-07-13)*.
- [~] GOV-009 — crates.io/npm v0.1.0 publication is explicitly deferred behind protected GitHub Release proof and owner-scoped registry credentials; clean binary version/example/checksum verification and a clean temporary npm consumer install are executable in the release verifier. Exact downloaded workflow evidence and final registry disposition remain *(2026-07-13)*.
- [~] GOV-010 — Accurate GitHub description/homepage/12 topics and SECURITY, CONTRIBUTING, SUPPORT, conduct, issue/PR templates, README status/badges, and dated USPTO/EUIPO exact-name evidence are complete *(2026-07-13)*; confusing-similarity/common-law/class review by qualified counsel remains before filing or broad launch.
- [!] GOV-011 — Replace Tauri's Linux GTK3/glib 0.18 chain or prove a safe patched route. `glib::VariantStrIter` is not called by FORGE and Desktop is not released, so Dependabot alert 1 is dismissed as `tolerable_risk` only through **2026-10-12** with the same rationale in its remote audit trail; Linux Desktop release remains blocked until resolution or reviewed reachability proof.

## 8. Security, privacy, safety, and legal completion (SEC)

- [x] SEC-001 — Enforce D10 in actual exporters: attribution manifests, restricted-mesh envelope substitution, link-outs, assembly policy derivation, and adversarial tests. *(2026-07-13: gateway/worker paths fail closed on missing/contradictory ledger evidence, derive the most restrictive assembly policy, govern license manifest 1.0, require restricted envelopes/datums/component/HTTPS link-outs, bind external OCCT proof to the manifest hash, and discard raw/unknown provider output; 31-step gate green.)*
- [x] SEC-002 — Implement prohibited weapons/targeting/munition/interdiction brief refusal and minimal safe refusal logging across deterministic and live generation paths. *(2026-07-13: versioned deterministic guard runs before retrieval/provider/mutation on context, generation/stream, course-generation, model-edit, and direct-library paths; explicit safety exclusions remain allowed; refusals store only hash/bucket/version/category/rule/surface/provider/archetype/optional-owner metadata; raw prompt/key echo is absent; audit failure fails closed; 31-step, 32/32 gateway, 25/25 Brief-25, populated/clean/idempotent 15-migration Postgres gates green.)*
- [x] SEC-003 — Implement user-scoped export and deletion for photos, models, generated artifacts, object blobs, telemetry, policies, courses, and account data. *(2026-07-13: D33 governs versioned repeatable-read export and exact-confirmation primary deletion; all owned/derived rows are purged explicitly, auth/provider secrets are excluded, S3-compatible payload deletion precedes commit and storage failure rolls back; 31-step, populated Postgres export/delete/residue, and MinIO upload/delete/404 gates pass. SEC-005/D35 extends this boundary with hold-aware receipt 2.0.0 and restore suppression.)*
- [x] SEC-004 — Implement explicit consent/version/withdrawal records for photoscan processing, telemetry sharing, pattern contribution, leaderboards, and training reuse. *(2026-07-13: D34 append-only ledger 1.0.0 binds five current-notice purposes to owned subjects; action checks and direct jobs serialize with withdrawal; late worker output cannot resurrect cancellation; Studio exposes explicit notices/grant/withdraw/actions; the consent history remains in user-data export 1.2.0; 31-step, gateway, Python 3.12 100/100 worker, clean/populated/idempotent Postgres, and real-browser notice/grant/withdraw gates pass.)*
- [x] SEC-005 — Define retention, legal hold, backup deletion, object tombstone, and audit-event policies; test deletion through primary and backup lifecycles. *(2026-07-13: D35/data-lifecycle 1.0.0 adds six versioned retention classes, monotonic append-only user/object/audit holds, causal sequence backfill, globally ordered authority locks, hold-aware deletion receipt 2.0.0, pseudonymous user/object tombstones, exact backup subject manifests, post-delete capture refusal, late-catalog tombstone reopening, restore suppression, bounded deletion retry with stale-claim recovery, dry-run-first primary retention, 400-day causal hold/restore/catalog/audit expiry, and redacted export 1.2.0. All 31 non-DB gates, 45/45 gateway tests, 100/100 worker tests, populated and clean/idempotent 19-migration Postgres gates, deliberately reversed same-time authority backfill, and zero-residue fixture cleanup pass. This closes contract/fixture maturity only; real encrypted backups, provider receipts, sandbox restore, and measured RPO/RTO remain OPS-005.)*
- [ ] SEC-006 — Threat-model auth/session/BYO-key/provider callbacks/object URLs/job payloads/SSRF/prompt injection/zip or model bombs and add negative tests/rate limits.
- [ ] SEC-007 — Complete P11 dual-use/export-control review, jurisdiction/version records, per-policy signoff, takedown/appeals/escalation ownership, and external-beta gate.
- [ ] SEC-008 — Harden hardware/update supply chain: signed Desktop/Link artifacts, pairing/revocation, rollback, local-only authority, kill-switch and supervisor fault injection.

## 9. Quality, testing, and product acceptance (QA)

- [x] QA-001 — Added `pnpm verify` as the 31-step non-DB gate and `pnpm verify:db` for isolated Postgres/pgvector invariants; both fail on missing prerequisites or stale generated/oracle/workflow/compatibility artifacts and are documented in README/AGENTS *(workflow-pin and compatibility gates added 2026-07-12)*.
- [ ] QA-002 — Add browser E2E coverage for generate/draft/edit/validate/share/catalog/course/listing/job/maintenance flows using real built WASM and an isolated DB.
- [ ] QA-003 — Add accessibility, keyboard, focus, contrast, reduced-motion, responsive, and viewer-grade browser acceptance; publish the supported-browser matrix.
- [ ] QA-004 — Test migrations from every supported prior schema with populated data; document backup, rollback/roll-forward, and failed-migration recovery.
- [ ] QA-005 — Add idempotency, retry, cancellation, timeout, rate-limit, duplicate-delivery, worker-crash, provider-outage, and partial-object-upload tests.
- [ ] QA-006 — Build the performance matrix: real mid hardware, cold/warm load, large scenes, long replay, concurrent jobs, DB queries, and provider SLOs.
- [ ] QA-007 — Add fuzz/property/adversarial corpora for imports, JSON Patch, EnvSpec, replay, provider output, catalog citations, export policy, and hardware payloads.
- [ ] QA-008 — Define golden-artifact review/update procedure so intentional schema/render/physics drift cannot be casually re-pinned.
- [ ] QA-009 — Add end-to-end backup/restore and disaster-recovery exercises with measured RPO/RTO.
- [ ] QA-010 — Create external acceptance scripts and evidence templates for builder, photoscan, training, course, lab, print, marketplace, and maintenance milestones.
- [x] QA-011 — Add a real native Tauri compile gate, commit the required app icon, and require `desktop native (macOS)` on protected PRs; retain scaffold checks for platform-neutral contract validation *(2026-07-12)*.

## 10. Production operations and economics (OPS)

- [ ] OPS-001 — Define supported deployment topology/environments, infrastructure ownership, configuration schema, secrets rotation, and environment promotion.
- [ ] OPS-002 — Replace mutable images/default dev secrets for deployable profiles; pin images, run non-root/read-only where possible, add health/readiness and resource limits.
- [ ] OPS-003 — Implement structured logs, request/job correlation, metrics, traces, dashboards, alert routing, and redaction rules across gateway/workers/providers/Desktop.
- [ ] OPS-004 — Define SLOs and error budgets for API, generation, queue latency, photoscan, training, object storage, auth, and provider handoffs.
- [ ] OPS-005 — Implement Postgres/object backup, restore verification, retention, capacity, migration, and disaster-recovery runbooks.
- [ ] OPS-006 — Define job quotas, concurrency, cancellation/refund, idempotency, dead-letter/reconciliation, cost attribution, and runaway-spend kill switches.
- [ ] OPS-007 — Add provider capability discovery, sandbox/prod separation, timeouts, circuit breakers, rate limits, credential rotation, and degraded-mode UX.
- [ ] OPS-008 — Define support, incident severity, on-call/escalation, status communication, security reporting, and postmortem processes.
- [ ] OPS-009 — Instrument unit economics: model/API tokens, GPU/CPU time, storage/egress, vendor/print calls, credits, refunds, and margin by workflow.
- [ ] OPS-010 — Run load/capacity/cost tests and set launch limits; no Kubernetes or multi-region expansion without measured need and a decision record.
- [~] OPS-011 — Migrate the x86_64 validator release lane from `macos-15-intel` to `macos-26-intel`, use the measured thin-LTO release profile, retain a 60-minute native-job ceiling and the macOS 15 rollback through August 2027, and record protected before/after evidence. Baseline run `29216053372` stalled for 5h10m; macOS 26 full-LTO run `29227763639` hit the ceiling; thin run `29230415603` exposed lost archive execute bits. Corrected thin run `29236010204` then passed every native/WASM/aggregate job at `02f912d`, and its downloaded aggregate passed independent macOS verification. Protected merge and final main rerun remain *(updated 2026-07-13)*.

## 11. External and field proof (EXT)

- [ ] EXT-001 — Independent builder completes catalog-backed configure -> validate -> share -> BOM/export flow and records usability/correctness findings.
- [ ] EXT-002 — Real photographed motor completes TRELLIS/COLMAP -> D13 -> alignment -> reviewed equipable component under the declared SLO.
- [ ] EXT-003 — Real one-click hover/waypoint training reaches a passing scorecard and the actual ONNX policy flies the twin in-browser.
- [ ] EXT-004 — Controlled D12 rover then quad pilots prove config/capture/supervisor/kill/recovery and produce signed lab evidence.
- [ ] EXT-005 — External community course receives independently verified leaderboard submissions and is used directly as a training task.
- [ ] EXT-006 — First external user publishes an admitted model that an unrelated user equips successfully.
- [ ] EXT-007 — First DfM-passing structural part reaches a real provider quote link with lawful artifact and profile handoff.
- [ ] EXT-008 — Real Desktop-captured field event produces ghost divergence, accepted/rejected system-ID update, and actionable repair evidence.
- [ ] EXT-009 — Conduct post-alpha interviews/metrics review and record which product rung to deepen, defer, or remove before scaling scope.

## 12. Documentation and contributor completion (DOC)

- [x] DOC-001 — Add canonical root `AGENTS.md`, compatibility `CLAUDE.md`, documentation hierarchy, and evidence-first working protocol *(2026-07-12)*.
- [x] DOC-002 — Add dated `PROJECT-STATE.md` with verified current results, maturity boundary, discrepancies, and go/no-go verdicts *(2026-07-12)*.
- [x] DOC-003 — Rebuild the complete execution roadmap across phases, recovery, governance, security, quality, operations, external proof, metrics, and releases *(2026-07-12)*.
- [x] DOC-004 — Corrected the stale red-gate claim, linked the dated project state, and added live protected-main CI/security badges without inventing a release badge *(2026-07-13)*.
- [ ] DOC-005 — Generate and maintain versioned API/event/artifact documentation (OpenAPI or equivalent), migration guides, examples, and deprecation notes.
- [~] DOC-006 — Contributor setup, decision path, debugging/release/publication runbooks, security reporting, support/conduct boundaries, and structured issue/PR templates are live *(2026-07-13)*; an actual curated first-good-issue workflow remains.
