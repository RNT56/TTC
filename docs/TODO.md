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

- **RESOLVED 2026-06-12** — PRE-002: the owner delivered the prototype; committed
  byte-exact at `prototype/cad-object-studio.html`, tagged `prototype-final`.
  **Vintage caveat:** it is the pre-configurator build (no slots/variants/ports/
  harness — see `prototype/README.md`); P0-007 stays gated on the later ~83 KB
  build or a re-scoping decision. No critical blockers remain open.

## 1. Pre-P0 housekeeping (PRE)

- [x] PRE-001 — Documentation system: `CLAUDE.md`, `CHANGELOG.md`, `docs/` suite *(2026-06-11)*
- [x] PRE-002 — Prototype committed byte-exact + tagged `prototype-final` *(2026-06-12; sha256 ca93489e… — pre-configurator vintage, see prototype/README.md)*
- [x] PRE-003 — Licensing *(2026-06-12, owner-delegated → **D24**)*: root `LICENSE` (open-core split, © RNT56), `LICENSES/Apache-2.0.txt` (canonical text), `NOTICE`; Apache zone = crates/ + schema/ + examples/; everything else proprietary; zone-2 package.json marked; cargo workspace already declared Apache-2.0
- [x] PRE-004 — Repo hygiene *(2026-06-12)*: `.gitignore` (rust/node/python + env/coverage/logs), `.editorconfig` (LF, utf-8, 2-space / rust 4 / tabs for Make). **Branch protection on `main` remains the one owner click** (GitHub → Settings → Branches; no API surface in this session's toolset)
- [x] PRE-005 — Naming *(2026-06-12, owner decision → **D23**)*: the product is **ForgedTTC**; `forge-*` code namespaces stay (minimal churn); formal trademark scan recorded as the owner's pre-P4 action
- [x] PRE-006 — Plan v3.0 adopted; docs suite upgraded; v2.0 archived *(2026-06-11)*

## 2. Phase task breakdowns

### P0 — Freeze & extract
- [x] P0-001 — Author contract schema v2.1 **as Rust types in `forge-contract`** (serde + schemars: meta, env, skeleton, parts, slots, ports, chains, driver, materials, sim incl. colliders/estimator, lockfile) per [`systems/model-contract.md`](systems/model-contract.md) *(2026-06-12, D21 session; Appendix-A round-trip tested)*
- [x] P0-002 — schemars → TypeScript codegen pipeline: emitted JSON Schema → TS types for studio/gateway (= XC-01) *(2026-06-12: `pnpm codegen:contract` → `contract.gen.ts`; CI guards schema drift)*
- [x] P0-003 — Monorepo scaffold: cargo workspace (`crates/forge-*`) + pnpm (`packages/studio`, `packages/gateway`) + `workers/`; CI bootstrap (fmt, clippy -D warnings, cargo test, wasm build, tsc, pytest) *(2026-06-12; Turborepo deferred until >2 TS packages)*
- [x] P0-004 — **Byte-equivalence MET** *(2026-06-12)*: hrx7 `125/2195/2581` and vx2-hornet `73/924/1250` exact vs the monolith extraction; guarded permanently in CI (extraction-drift + translation-drift + compare steps)
- [x] P0-005 — hrx7 → `examples/hrx7.forge.json` *(2026-06-12; mechanical: `scripts/translate-monolith.mjs` instruments the monolith's own N()/P() calls in a vm sandbox — zero hand transcription)*
- [x] P0-006 — fpv → `examples/vx2-hornet.forge.json` *(2026-06-12; same mechanical path; "combat" naming dropped per §17.2)*. Finding: both translations fail CTR-004 (explode coverage 69 %/42 % vs the later 80 % gate) — historical models predate the completeness gates; gates unchanged, recorded honestly
- [!] P0-007 — Translate all 31 slot variants — **the delivered vintage has no slot/variant system**; gated on the later ~83 KB configurator build (owner) or a re-scoping decision
- [x] P0-008 — Extraction harness complete *(2026-06-12)*: counts (`extract-counts.mjs`) + **trajectory tapes** (`extract-trajectories.mjs` → `prototype/trajectories/`, deterministic, CI re-records on drift)
- [x] P0-009 — **Core boundary API frozen (v1)** *(2026-06-12)*: bake + validate + **tick** (CoreSession, bit-deterministic) + **patch** (JSON-Patch with shape gate) all live in binary + WASM facade; zero-copy views remain a P1-005 refinement that cannot change call shapes
- [~] P0-010 — Freeze recorded (sha256 in prototype/README.md + changelog) and annotated tag `prototype-final` created **locally**; the git proxy 403s tag pushes and no MCP tag tool exists — **owner action:** `git push origin prototype-final` from any clone, or create a GitHub Release named `prototype-final` on commit `0294a9d`

### P1 — Core & studio
Rust core (D21 note: v0 implemented directly in Rust on 2026-06-12; "done" for
each item still means **oracle parity** once PRE-002 lands — the JS/prototype
recordings remain the completion criterion):
- [x] P1-001 — `forge-motion` *(2026-06-12)*: 2-bone IK ✓, mixer ✓, servos ✓, clamps ✓, multirotor/rover drivers ✓; **biped + FPV oracle drivers ported line-faithful from the monolith** (`biped.rs`/`fpv.rs`: idle layers, arrive + heading spring + speed ramp, blended phase gait + monolith legIK, drag-limited flight, tilt servos, per-motor RPM mixer, servo settle, head detents, telltales). **Tape parity at ULP level**: max dev 4.4e-16 (biped) / 7.1e-15 (fpv) vs `prototype/trajectories/`, banded 1e-9 in `tests/tape_parity.rs`; wired into `CoreSession` via `node_world_posed` (nm()'s base+animated euler), golden tick corpus re-pinned (bake hashes unchanged), BEH-001 biped walking smoke live
- [x] P1-002 — `forge-geometry` *(2026-06-12)*: prototype-exact polygon builders ✓, massprops ✓, AABB ✓, **per-part BVH + Möller tri-tri (XC-09)** ✓ — GEO-003 upgraded to BVH-CONFIRMED mesh intersection (hrx7: 53 AABB candidates → 41 confirmed, 12 false positives silenced) and **GEO-008** sampled animation sweep ticks the real driver and catches motion-only interpenetrations (hrx7: 2 found — thigh shells × pelvis at gait extremes; 127 ms total)
- [~] P1-003 — `forge-sim`: propulsion/battery/estimator models ✓ (HUD derivations tested); **Rapier world integration + shared-memory worker wiring pending** (P6-001 scope pulled forward only when needed)
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
- [~] P1-014 — Configurator pane *(2026-06-12: mechanics live)*: selection pane patches color/material through the live `CoreBake` handle — **JSON-Patch → re-bake in place**, validator re-judges every patched document, explode/camera/drive/jog state and selection all survive the rebuild (browser-verified). **Variant cards remain gated on the slot system** (P0-007 vintage gap / P3 component DB)
- [x] P1-015 — Golden-scene parity gallery vs monolith *(2026-06-12)*: `pnpm parity` (`scripts/parity-gallery.mjs`) renders both — the frozen monolith (bridged copy, rest pose pinned, chrome suppressed) and the built studio (`__forgeParity` hook: camera pose, grid/shadows off) — under 6 canonical cameras (2 models × 3 views, monolith FOV 2·atan(0.3443)), headless chromium + SwiftShader. Structural gate: Sobel-edge F1 with 1-px tolerance ≥ 0.85; **measured 0.95–0.995 on all six** (wrong configs score ≤ 0.4). Evidence committed: `docs/assets/parity/` composites + metrics; full gallery regenerates into `artifacts/parity/` (gitignored). CI integration deliberately deferred (chromium install flake risk) — local tool + committed evidence
- [x] P1-016 — N8AO + quality tiers *(2026-06-12)*: shaded pipeline renders through EffectComposer (Render → N8AO → Output; blueprint keeps its own pass; `n8ao` is the only new dep — plan-named at XC-22); tiers high/medium(½-res AO)/low(AO off) over pixel ratio, with the **XC-22 degradation ladder v0**: sustained < 45 fps for 3 s steps the tier DOWN (never up — raising is manual); parity gallery captures pin tier=low for determinism. Measured (SwiftShader floor): high 2.6 ms render · low 0.6 ms
- [~] P1-017 — Perf overlay *(2026-06-12)*: fps + render ms + **draw calls + core-tick ms** live (honest per-frame accounting across blueprint's multi-pass — `info.autoReset` off); measured on SwiftShader (software floor): render 0.5 ms · core ≤ 0.05 ms · 9 draws. Rapier split lands with the worker (P6); UI ms pending

### P2 — Data-driven models
- [~] P2-001 — Validator productized: check catalog (CTR-001..008, GEO, SIM, BEH, PRV) + diagnostic JSON stable ✓; in-studio WASM validation live ✓; npm + crates.io publication plumbing pending
- [~] P2-002 — Draft semantics (D14) *(2026-06-12: validation semantics live end to end)* — CLI `--as-draft` (exit 3) → gateway `asDraft` body flag → HTTP 200 with `verdict: draft` and full diagnostics (a draft is a successful save, not a 422; tested). **Persistence** (editable drafts stored server-side) lands with the data layer (P3-001 Postgres); the cannot-train/export/share gates attach to those surfaces as they ship (P4+/P7)
- [~] P2-003 — Driver library: multirotor/rover/quadruped with schemars param schemas + CTR-008 enforcement ✓; **biped ✓** *(2026-06-12 — oracle port, tape parity, P1-001)*; arm pending
- [x] P2-004 — Quadruped driver: trot phase gait, per-leg IK, diagonal pairing, validator smoke ✓ *(2026-06-12)*
- [x] P2-005 — `forge-gen quadruped`: leg-pairs/wheelbase/track/stand/mass sliders → **admitted, walking contracts with zero hand-written code** (grid-tested 2/3/4 pairs) *(2026-06-12)*
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
- [x] P4-010 — Brief-25 CI + dashboard: admission rate, repair iterations, diversity; re-run on prompt/schema/model change *(2026-06-14: root `pnpm eval:brief25` enforces real-validator 20/25+; current run 25/25; `--record-db`, eval tables/API, Studio summary live)*
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
- [~] P5-006 — Burst-GPU integration (Modal/RunPod) + permanent result cache; 5-min SLO *(2026-06-14: Modal adapter, optional HTTP endpoint execution, cache keys, richer pipeline artifacts, `photoscan_artifacts` materialization, linked `object_blobs`, and normalized live-command SLO/cache evidence live; real under-5-minute GPU validation open)*

### P6 — Sim depth + interop
- [~] P6-001 — Contract→Rapier compiler: per-node compound colliders within D7 budgets; joint motors honoring torque/velocity limits *(2026-06-14: runtime scene summary and collider-fit report live; full Rapier world open)*
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
- [~] P7-003 — SB3 PPO/SAC pipeline; seeded, reproducible runs *(2026-06-14: fixture `train.policy` job emits deterministic policy/ONNX/scorecard, materializes `policy_artifacts`, and links ONNX output through `object_blobs`; `FORGE_SB3_TRAIN_CMD` outputs now normalize through the same scorecard/export gate; real SB3/MuJoCo runtime remains adapter work)*
- [x] P7-004 — Domain-randomization config block (mass ±15 %, Kv ±8 %, sag ±20 %, latency 0–30 ms, IMU noise/bias, friction 0.4–1.2, wind 0–4 m/s, obs dropout) *(2026-06-14: fixture policy jobs carry the default randomization block)*
- [x] P7-005 — Curriculum stages in task definitions *(2026-06-14: task spec/worker metadata includes curriculum stage)*
- [x] P7-006 — Scorecard generator: success rate, robustness grid, energy; sub-threshold export block; estimator-smoke gate (D8) *(2026-06-14: `p7-scorecard-v1` requires success, robustness, energy, estimator-source evidence, lineage, thresholds, export reasons, and blocks ONNX export for failed fixture or external SB3 policies)*
- [x] P7-007 — Scorecard renderer in studio (= XC-21) *(2026-06-14: output-aware jobs panel renders success rate, robustness grid, energy, export gate, IO counts, and ONNX metadata)*
- [~] P7-008 — ONNX export + in-browser playback through the motion engine's policy layer *(2026-06-14: ONNX fixture metadata is emitted/rendered and Studio can play policy job action headers through `CoreSession`; live ONNX Runtime Web inference remains open)*
- [~] P7-009 — Behavior cloning + offline RL ingestion seam for telemetry logs (full pipeline lands P8+) *(2026-06-14: telemetry ingest worker emits sorted replay tapes; `train.offline-bc` builds deterministic sorted datasets and warmstart artifacts from telemetry frames, and `FORGE_OFFLINE_RL_CMD` outputs now normalize into non-exportable dataset/warmstart artifacts; live fine-tune adapter remains open)*
- [~] P7-010 — MJX benchmark: measure CPU-MuJoCo PPO saturation on our morphologies before adopting (claims hedged until benchmarked) *(2026-06-14: benchmark command seam plus adoption helper landed; real D12 quad/rover/legged benchmark data still required before adoption)*

### P8 — Bridge + Desktop
- [x] P8-000 — **Entry gate:** ToS/liability legal review (ladder UX, supervisor disclaimers, telemetry consent) — see [`security-safety-legal.md`](security-safety-legal.md) *(2026-06-14: accepted for controlled D12 lab pilots by D30; `platform_gate_signoffs` records `d28.hardware=accepted`; external beta remains separately gated)*
- [~] P8-001 — WebSerial FC configuration writer (Betaflight-configurator pattern; config diffs compiled from contract) *(2026-06-14: deterministic `bridge.config-diff` worker live; gateway/Desktop enforce D30 + lab-mode + D12 rig gates; browser serial write awaits lab adapter)*
- [~] P8-002 — Telemetry ingest over WebSerial/WebUSB into the recorder *(2026-06-14: `bridge.telemetry-ingest` worker emits sorted replay tapes; WebSerial/WebUSB capture open)*
- [~] P8-003 — Flight recorder: real sessions in the replay format; indexed telemetry tape *(2026-06-14: telemetry ingest/replay verify jobs, `telemetry_logs`, and `replay_artifacts` materialization live; Desktop background capture open)*
- [~] P8-004 — Ghost overlay: twin prediction rendered under real telemetry; divergence scrubbing at 60 fps over 10-min logs (= XC-20) *(2026-06-14: crash-forensics output includes ghost overlay metadata and Studio renders crash window/ghost metric; scrubber UI open)*
- [~] P8-005 — System-ID fitting job: bench pulls/logs/step responses → updated sim block → policy fine-tune loop *(2026-06-14: `train.sysid-fit` estimates R_int and emits simPatch; live bench adapter open)*
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
- [~] P9-002 — CMA-ES orchestrator + Optuna TPE for categorical-heavy spaces *(2026-06-14: deterministic candidate/Pareto evaluator live; `codesign.evaluate` now supports a budgeted CMA/TPE-shaped keyless search up to 200 candidates, objective constraints, constraint-rejection reasons, and external `FORGE_CODESIGN_CMD`; live engine-backed CMA-ES/Optuna remains open)*
- [~] P9-003 — Multi-fidelity ladder: tier 0 (schema/compat/static — native via core binary, < 50 ms) → tier 1 (Rapier smoke, s) → tier 2 (short MuJoCo rollouts) → tier 3 (full training, finalists only) *(2026-06-14: tier labels, per-candidate ladder evidence, optimizer metadata, finalist contract, and budgeted keyless tier search live; full simulator ladder open)*
- [~] P9-004 — Pareto-front UI: each point an admitted, openable contract *(2026-06-14: Studio renders Pareto points with metrics, applies admitted JSON-Patch candidates through live patch/re-bake, and can save admitted points through the model admission route; worker Pareto fronts now exclude rejected candidates and prove the 200-candidate constrained-course shape; engine-backed explorer remains open)*
- [ ] P9-005 — MJX batching for tier 2/3 if P7-010 benchmark demands

### P10 — Environments & courses
- [~] P10-001 — EnvSpec schema: terrain, gates/obstacles, spawns, win conditions, env block *(2026-06-14: runtime EnvSpec now includes terrain, gates, spawns, win, env, bounds, tasks, and obstacles; full generated-course schema/versioning polish open)*
- [~] P10-002 — Env gatekeeper checks: reachability, bounds sanity, spawn validity, collider sanity *(2026-06-14: `forge-validate env` emits real ENV reports for id/name, bounds, tasks, spawns, gates, obstacle sizing/bounds, and win gate references; archetype-aware reachability remains open)*
- [~] P10-003 — Environment generation through the P4 pipeline *(2026-06-14: gateway course route now gates EnvSpec through `forge-validate env`; full generation open)*
- [~] P10-004 — Course sharing by URL; courses as community objects *(2026-06-14: courses table/routes/visibility live with validator report persistence; Studio now includes an editable EnvSpec course form with name/visibility controls and `?course=<id>` URL selection/copying for public/unlisted courses; direct course fetch/API polish remains open)*
- [~] P10-005 — Leaderboards: per-course/archetype/class; replay verification — universally checkable (D17), server re-verified as anti-cheat hygiene (= XC-25) *(2026-06-14: leaderboard routes/tables live; `/v1/replays` persists server verification artifacts; leaderboard submissions compute verification server-side and reject blind client `verified` claims; Studio verified-board filters now slice by EnvSpec archetype, verification-header class, and verified/held status; durable server-side board dimensions remain open)*
- [x] P10-006 — Course→RL-task adapter (popular courses become training curricula) *(2026-06-14: `course_to_task` adapter maps EnvSpec/course tasks to RL task specs)*

### P11 — Platform
- [~] P11-000 — **Entry gate (policy sharing):** dual-use/export-control sanity check (EU dual-use, US EAR) *(2026-06-14: `platform_gate_signoffs` carries `p11.policy-sharing`; policy listings fail closed until accepted, with per-listing signoff still required)*
- [x] P11-001 — Accounts (Auth.js; anonymous-local mode remains first-class) *(2026-06-14: GitHub OAuth via Auth.js core/Postgres adapter, `/auth/*`, `/v1/me`, user-owned models)*
- [~] P11-002 — Marketplace: model listings with gatekeeper-stamped validator reports *(2026-06-14: listings table/routes reject non-admitted models; listing-review submission, moderation-report workflow, usage-beta rollups, and Studio marketplace board with kind/status filters plus per-listing view/equip/quote/training usage actions live; public curation state still open)*
- [~] P11-003 — Skills marketplace: ONNX + I/O header + scorecard + training lineage; fine-tune-against-buyer's-twin offer for non-matching morphologies *(2026-06-14: policy jobs emit ONNX header/scorecard/lineage; policy listing route requires accepted `p11.policy-sharing` platform gate plus explicit dual-use/export-control signoff and records `policy_signoffs`; Studio can record policy-download usage per listing; live transfer/fine-tune offer open)*
- [x] P11-004 — Classroom mode: briefs as assignments, rubric = validator config + scorecard thresholds, auto-grading; `forge-validate` free binary as the institutional on-ramp *(2026-06-14: `classroom_assignments`/`classroom_submissions`, gateway routes, deterministic validator/rubric grading, and Studio controls live)*
- [~] P11-005 — BOM agent: live vendor offers for catalog slots *(2026-06-14: `vendor_offers` tables plus vendor offer refresh/list APIs and Studio link surfacing live; external provider refresh remains env-gated/sandboxable)*
- [~] P11-006 — DfM + print ordering: oriented 3MF + profiles → print-service API (Craftcloud-class); printed-parts BOM section (= XC-18 DfM module dependency) *(2026-06-14: print quote request/offer tables plus quote-link handoff API and Studio off-platform quote links live; validator FDM v0 MFG-001..004 diagnostics now cover inline printable structural parts; oriented 3MF artifacts, BOM DfM rows, and direct checkout/payment remain out of scope/open)*
- [x] P11-007 — UGC moderation policy live: report flow, takedown SLA, repeat-infringer rule *(2026-06-14: `moderation_reports`, 72-hour SLA target, repeat-infringer signal, gateway routes, and Studio report action live; legal/process ownership still outside code)*
- [x] P11-008 — License-ledger UI + export filter surfaced to users (= XC-17) *(2026-06-14: public `/v1/license-ledger` reports license classes, component/price/citation counts, review counts, and export-policy distribution; Studio platform panel renders the ledger)*
- [x] P11-009 — Marketplace economics decided with usage data (OD-05); record in DECISIONS *(2026-06-14: D29 records usage-data beta, no seller payouts/revenue share/direct checkout at launch, credit cost-plus retained for GPU jobs)*

### P12 — Maintenance twin
- [x] P12-001 — Wear models: motor hours, pack cycle counts, R_int drift from logged sag *(2026-06-14: Rust helper and maintenance worker compute wear from telemetry)*
- [~] P12-002 — Crash forensics workflow: scrub-last-seconds with ghost separation *(2026-06-14/15: crash-window and ghost-overlay metadata live, materialized to `maintenance_records`, and Studio now has a crash scrubber over the last-seconds window with ghost divergence status; repair sheets preserve vendor/print handoff links when commerce rows exist; real Desktop-captured field-log proof remains open)*
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
| XC-18 | DfM check module — **FDM v0 validator checks live 2026-06-14** (`MFG-001..004`; 3MF/profile artifacts still open) | P6 | systems/geometry-engine.md |
| XC-19 | Pairing-code auth + FORGE Link image build | P8 | systems/hardware-bridge.md |
| XC-20 | Ghost-overlay telemetry view | P8 | systems/hardware-bridge.md |
| XC-21 | Scorecard renderer | P7 | systems/learning-engine.md |
| XC-22 | Quality-tier autoswitcher | P1 | systems/render-engine.md |
| XC-23 | Schema migration runner — **done 2026-06-14** (`forge-contract` migration runner + `forge-validate migrate`) | P2 | systems/model-contract.md |
| XC-24 | Fuzz corpus seed set — **done 2026-06-14** (`evals/fuzz/modelspec-seeds.json` + `scripts/fuzz-contract-seeds.mjs` checker/minimizer) | P4 | systems/validation-harness.md |
| XC-25 | Leaderboard replay verifier — **done 2026-06-14** (server computes replay hash/timestamp/header checks before official verification) | P10 | systems/environments-courses.md |
| XC-26 | Golden-number suite harness — **done 2026-06-12** (XT-001 in CI; forge-num determinism fix) | P1 | systems/core-runtime.md |
| XC-27 | Tauri serial + background-recorder plugins | P8 | systems/hardware-bridge.md |

## 4. Open decisions (OD) — non-blocking, from plan §22

| ID | Question | Decide by |
|---|---|---|
| OD-01 | Product name (FORGE pending trademark scan) | before public launch (P3/P4 marketing) |
| OD-02 | ~~React vs Solid~~ — **resolved by D16** (the face stays React/TS; v3.0) | — |
| OD-03 | Left/right asymmetric slot UX (contract already supports) | when a build needs it |
| OD-04 | WASM user-controller sandbox design | post-P7 design review |
| OD-05 | ~~Marketplace economics (revenue share, skill pricing)~~ — **resolved by D29** as usage-data beta; seller payouts/revenue share deferred until real thresholds | — |
| OD-06 | Fixed-wing archetype priority | when demand signals |
| OD-07 | Photoscan alignment UI: before or with P5 GA | during P5 |
| OD-08 | napi-rs hot-path bindings vs binary-spawn in the gateway | measure in P2 (P2-007) |

Record outcomes in [`DECISIONS.md`](DECISIONS.md) and mark the OD row resolved.

## 5. Post-P3 execution batch (owner: "execute everything", 2026-06-12)
- [x] XC-09 — BVH + tri-tri collision truth: GEO-003 BVH-confirmed (53→41 on hrx7), **GEO-008** sampled animation sweep (2 motion-only contacts found on hrx7), 127 ms
- [x] SIM-004 — inline-sim vs equipped-catalog drift check (deduped warns); vx2-proof reconciled to the cited kv 1900 — **TWR 4.70→5.32, hover 43→39 %** flowed from the datasheet
- [x] Share URLs — contract deflated into the fragment (`share.ts`), re-judged locally on open; round-trip browser-verified (hrx7 = 5.5 kB fragment)
- [x] Gamepad input — left/right sticks with deadzone in the drive loop; sliders stay the fallback
- [x] Patch consequence diff — Δ AUW/TWR/hover line after each configurator patch (D5 diff semantics)
- [x] Bundle split — three+n8ao chunk (app 78 kB gz; chunk warning gone)
- [x] Nightly workflow — parity gallery (headless chromium) + cargo-llvm-cov coverage, artifact-uploaded
- [x] Release workflow — tag v* → static forge-validate binary + wasm facade package
- [x] Incremental re-bake — `bake_incremental` reuses untouched (geom, pose) buffers in `Bake.patch`
- [x] Property-based tests *(2026-06-12)*: proptest (dev-dep) over the schema heart — parse→serialize fixed point + hash stability across 64 generated docs; patch engine never panics and everything it returns passes the shape gate (incl. bad pointers/out-of-range/odd value types)
