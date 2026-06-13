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
- [~] P3-004 — ETL worker v1: fetch → Claude extraction with per-field citations → OCCT tessellation → LOD chain → dedupe → license ledger entry → human review queue. *(2026-06-13: deterministic fixture-backed ingest is live in `workers/forge_workers/etl`, including citation/license/price gates and review-queue records; live fetch/Claude/OCCT adapters remain P4+ / API-key gated.)*
- [x] P3-005 — License ledger + classes (`open/attribution/no-redistribution/view-only`) populated at ingestion, non-optional (D10): catalog rows now require `license { id, class, terms, sourceUrl, exportPolicy }`; Rust loader, DB seed, and worker citation gate reject missing license/price data.
- [x] P3-006 — Lockfile resolver *(2026-06-12)*: `forge-contract::{semver (exact/^/~, no new deps), pin_refs, upgrade_lockfile, RevisionSource}` — pin stability over freshness, yanked revisions verify-but-never-freshly-resolve, upgrades return explicit diffs for LIF-001 re-validation; tested incl. yanked + unsatisfiable-range reasons (= XC-03)
- [x] P3-007 — Proof pair *(2026-06-13 refresh)*: EMAX ECO II 2207 1900KV + CNHL Black 4S 1500 as production-shaped `catalog/components/` rows with license ledger, prices, citations, review state, and lockfile pins. `tests/proof_pair.rs` covers dimensions, resolver pins, CAT compatibility, BOM SKU export, pack-swap HUD response, and reference-rig resolution.
- [x] P3-008 — Reference rigs (D12): pinned `catalog/reference-rigs/ref_quad_kakute-h7-source-one-5in.json` and `ref_rover_waveshare-ugv-rover-pt-pi5-ros2.json`; recorded in DECISIONS.
- [x] P3-009 — BOM v0: `forge-validate bom --catalog catalog --format csv|json` and gateway `/v1/bom` export component IDs, revisions, quantities, vendor SKUs, prices, URLs, license classes, review status, and citations.
- [x] P3-010 — Thrust-table interpolation + proof row: table-over-estimate precedence is wired through catalog-backed HUD; proof motor carries a cited sparse 5x4.6/6S thrust-current table pending owner review.

### P4 — Text-to-CAD GA
- [ ] P4-001 — Generation orchestrator: intent parse → retrieval → multi-pass constrained synthesis → validator-in-loop repair (≤ 3 iterations; in-process WASM for instant feedback, binary in CI — same bits, D17) → admission/draft
- [ ] P4-002 — Prompt-cache prefix builder: schemars-emitted schema + engine docs + pattern exemplars (= XC-14)
- [ ] P4-003 — Retrieval: pgvector over catalog + pattern library; schema-true few-shot exemplars
- [ ] P4-004 — Pattern-library harvester with consent flags (§2.2 terms) (= XC-13)
- [ ] P4-005 — Conversational editing: NL → JSON-Patch (LLM side); **core patch path ✓** (RFC-6902 subset + shape gate, in facade); incremental validation + < 3 s budget pending
- [ ] P4-006 — Provenance stamps: model version, prompt hash, seed, validator report on every generated artifact
- [ ] P4-007 — Share URLs (D4): read-only contract viewer, no account required
- [ ] P4-008 — BYO Anthropic key + metered credits plumbing (D3); studio-free tier boundaries
- [ ] P4-009 — Brief-25 corpus authored (25 canonical briefs across archetypes/scales/constraints) (= XC-15)
- [ ] P4-010 — Brief-25 CI + dashboard: admission rate, repair iterations, diversity; re-run on prompt/schema/model change
- [ ] P4-011 — Pin Anthropic model strings/limits/pricing from https://docs.claude.com/en/api/overview at implementation; record in DECISIONS
- [ ] P4-012 — Draft-state UX in studio (= XC-16)
- [ ] P4-013 — Environment generation reuses the pipeline with EnvSpec schema (delivers with P10; seam designed now)
- [~] P4-014 — Catalog review operations before live generation (D25): gateway exposes `GET /v1/reviews` and `PATCH /v1/reviews/:id` over the P3 `review_queue`; studio owner-review panel now lists, filters, approves, and rejects rows against the local gateway. Auth, audit notes, and export filters remain open.
- [ ] P4-015 — Live source-fetch adapter interface: deterministic fixture path stays the test oracle; HTTP/source adapters are injectable, rate-limited, and never required for CI.
- [ ] P4-016 — Claude extraction adapter behind BYO/API-key plumbing: emits canonical catalog rows, per-field citations, license terms, prices, confidence, and review reasons; no row persists without the P3 validator gates.
- [ ] P4-017 — OCCT ingestion adapter interface: tessellation/LOD outputs attach to catalog revisions after review; failures degrade to envelope geometry, not uncited mesh truth.

### P5 — Image → 3D
- [ ] P5-001 — Photoscan worker: background removal → TRELLIS-class single-image reconstruction → manifold repair → decimation
- [ ] P5-002 — COLMAP multi-view path for N-photo bursts
- [ ] P5-003 — Primitive refit with D13 acceptance (≥ 70 % fit coverage, Hausdorff ≤ 1.5 %); mesh-class fallback
- [ ] P5-004 — Alignment UI: known-dimension scale, axis snap, port authoring
- [ ] P5-005 — Photoscan admission path with `source: photoscan` provenance; optional datasheet merge
- [ ] P5-006 — Burst-GPU integration (Modal/RunPod) + permanent result cache; 5-min SLO

### P6 — Sim depth + interop
- [ ] P6-001 — Contract→Rapier compiler: per-node compound colliders within D7 budgets; joint motors honoring torque/velocity limits
- [ ] P6-002 — Collider-compound auto-fitter (hulls/primitives per node) (= XC-10)
- [ ] P6-003 — Propulsion model: motor n ≈ Kv·V_eff·u, T = C_T·ρ·n²·D⁴, Q = C_Q·ρ·n²·D⁵; thrust-table interpolation; blade-element-lite fallback
- [ ] P6-004 — Battery model: sag (R_int), capacity integration; unit tests against bench math (= XC-07)
- [ ] P6-005 — Estimator module (complementary + EKF upgrade path) with noise/bias/latency injection (D8) (= XC-08)
- [ ] P6-006 — HUD analytics: AUW, TWR, hover throttle, instantaneous current, endurance — derived, assumptions inspectable
- [ ] P6-007 — Disturbance injectors: gusts, payload shifts, sensor dropout
- [~] P6-008 — MJCF + URDF exporters v0 ✓ (per-node mass/COM/inertia from baked meshes, Y-up→Z-up, joints/limits/actuators, golden fixtures = XC-04 ✓); ros2_control block + mesh visuals pending
- [ ] P6-009 — URDF/MJCF importer: links→nodes, visual geoms→mesh parts, collision→compounds, joints→joint blocks; importer fixtures (= XC-05)
- [ ] P6-010 — Rapier↔MuJoCo parity suite: drop tests, pendulum periods, hover trim, gait CoM trajectories; runs on every engine/exporter upgrade
- [ ] P6-011 — Replay format v1: {contract hash + lockfile, env, seed, input tape} — verifiable on any surface (D17)

### P7 — Training service
- [ ] P7-001 — Task suite v1 (versioned env definitions): hover-hold, waypoint chain, gate slalom, velocity tracking; walk-to-target, rough-terrain, push recovery; line-follow, obstacle course; reach/track
- [ ] P7-002 — Obs/action space derivation from contract (estimator state in, normalized targets out); ONNX policy I/O header
- [ ] P7-003 — SB3 PPO/SAC pipeline; seeded, reproducible runs
- [ ] P7-004 — Domain-randomization config block (mass ±15 %, Kv ±8 %, sag ±20 %, latency 0–30 ms, IMU noise/bias, friction 0.4–1.2, wind 0–4 m/s, obs dropout)
- [ ] P7-005 — Curriculum stages in task definitions
- [ ] P7-006 — Scorecard generator: success rate, robustness grid, energy; sub-threshold export block; estimator-smoke gate (D8)
- [ ] P7-007 — Scorecard renderer in studio (= XC-21)
- [ ] P7-008 — ONNX export + in-browser playback through the motion engine's policy layer
- [ ] P7-009 — Behavior cloning + offline RL ingestion seam for telemetry logs (full pipeline lands P8+)
- [ ] P7-010 — MJX benchmark: measure CPU-MuJoCo PPO saturation on our morphologies before adopting (claims hedged until benchmarked)

### P8 — Bridge + Desktop
- [ ] P8-000 — **Entry gate:** ToS/liability legal review (ladder UX, supervisor disclaimers, telemetry consent) — see [`security-safety-legal.md`](security-safety-legal.md)
- [ ] P8-001 — WebSerial FC configuration writer (Betaflight-configurator pattern; config diffs compiled from contract)
- [ ] P8-002 — Telemetry ingest over WebSerial/WebUSB into the recorder
- [ ] P8-003 — Flight recorder: real sessions in the replay format; indexed telemetry tape
- [ ] P8-004 — Ghost overlay: twin prediction rendered under real telemetry; divergence scrubbing at 60 fps over 10-min logs (= XC-20)
- [ ] P8-005 — System-ID fitting job: bench pulls/logs/step responses → updated sim block → policy fine-tune loop
- [ ] P8-006 — FORGE Link image: Pi-class; rosbridge + MAVLink router + ONNX runtime + pairing-code auth (= XC-19)
- [ ] P8-007 — Deployment-ladder UX: SITL → HITL → constrained → free; physical confirmation at each transition; control-rate contract surfaced (D9)
- [ ] P8-008 — Safety supervisor: geofence, attitude/rate envelopes, battery floor, kill switch, fallback controller; policy advisory at ~50 Hz, supervisor ≥ 200 Hz
- [ ] P8-009 — Pilot: reference quad SITL→HITL→tethered, documented
- [ ] P8-010 — Pilot: reference rover deployment via ROS 2 path, documented
- [ ] P8-011 — **FORGE Desktop (Tauri) shell**: same web bundle in webview; build + signing + update pipeline for the three desktop OSes (D15)
- [ ] P8-012 — Desktop serial plugin (serialport-rs): bridge beyond Chromium (= XC-27 part 1)
- [ ] P8-013 — Desktop background recorder + real-filesystem log archives (= XC-27 part 2)
- [ ] P8-014 — Field demo: a log captured by Desktop replays with visible ghost divergence (P8 exit criterion)

### P9 — Co-design optimizer
- [ ] P9-001 — Parameter-manifold encoding: slot choices categorical, dims/driver params continuous, validator bounds
- [ ] P9-002 — CMA-ES orchestrator + Optuna TPE for categorical-heavy spaces
- [ ] P9-003 — Multi-fidelity ladder: tier 0 (schema/compat/static — native via core binary, < 50 ms) → tier 1 (Rapier smoke, s) → tier 2 (short MuJoCo rollouts) → tier 3 (full training, finalists only)
- [ ] P9-004 — Pareto-front UI: each point an admitted, openable contract
- [ ] P9-005 — MJX batching for tier 2/3 if P7-010 benchmark demands

### P10 — Environments & courses
- [ ] P10-001 — EnvSpec schema: terrain, gates/obstacles, spawns, win conditions, env block
- [ ] P10-002 — Env gatekeeper checks: reachability, bounds sanity, spawn validity, collider sanity
- [ ] P10-003 — Environment generation through the P4 pipeline
- [ ] P10-004 — Course sharing by URL; courses as community objects
- [ ] P10-005 — Leaderboards: per-course/archetype/class; replay verification — universally checkable (D17), server re-verified as anti-cheat hygiene (= XC-25)
- [ ] P10-006 — Course→RL-task adapter (popular courses become training curricula)

### P11 — Platform
- [ ] P11-000 — **Entry gate (policy sharing):** dual-use/export-control sanity check (EU dual-use, US EAR)
- [ ] P11-001 — Accounts (Auth.js; anonymous-local mode remains first-class)
- [ ] P11-002 — Marketplace: model listings with gatekeeper-stamped validator reports
- [ ] P11-003 — Skills marketplace: ONNX + I/O header + scorecard + training lineage; fine-tune-against-buyer's-twin offer for non-matching morphologies
- [ ] P11-004 — Classroom mode: briefs as assignments, rubric = validator config + scorecard thresholds, auto-grading; `forge-validate` free binary as the institutional on-ramp
- [ ] P11-005 — BOM agent: live vendor offers for catalog slots
- [ ] P11-006 — DfM + print ordering: oriented 3MF + profiles → print-service API (Craftcloud-class); printed-parts BOM section (= XC-18 DfM module dependency)
- [ ] P11-007 — UGC moderation policy live: report flow, takedown SLA, repeat-infringer rule
- [ ] P11-008 — License-ledger UI + export filter surfaced to users (= XC-17)
- [ ] P11-009 — Marketplace economics decided with usage data (OD-05); record in DECISIONS

### P12 — Maintenance twin
- [ ] P12-001 — Wear models: motor hours, pack cycle counts, R_int drift from logged sag
- [ ] P12-002 — Crash forensics workflow: scrub-last-seconds with ghost separation
- [ ] P12-003 — Repair sheets: explode chain order → repair steps + reorder links
- [ ] P12-004 — Fleet view

## 3. Cross-cutting backlog (XC) — tracked from day one

From the plan §19 (v3.0). Each lands no later than its phase; build earlier when
touched.

| ID | Item | Earliest | Owning doc |
|---|---|---|---|
| XC-01 | schemars → TypeScript codegen pipeline (Rust schema is the single source) | P0 | systems/model-contract.md |
| XC-02 | Harness check IDs + diagnostic format | P2 | systems/validation-harness.md |
| XC-03 | Lockfile resolver + upgrade-diff UI | P3 | systems/component-database.md |
| XC-04 | MJCF/URDF exporter goldens — **done 2026-06-12** (`crates/forge-sim/tests/fixtures`) | P6 | systems/simulation-engine.md |
| XC-05 | URDF importer fixtures | P6 | systems/model-contract.md |
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
| XC-17 | License-ledger UI + export filter | P3 | systems/component-database.md |
| XC-18 | DfM check module | P6 | systems/geometry-engine.md |
| XC-19 | Pairing-code auth + FORGE Link image build | P8 | systems/hardware-bridge.md |
| XC-20 | Ghost-overlay telemetry view | P8 | systems/hardware-bridge.md |
| XC-21 | Scorecard renderer | P7 | systems/learning-engine.md |
| XC-22 | Quality-tier autoswitcher | P1 | systems/render-engine.md |
| XC-23 | Schema migration runner | P2 | systems/model-contract.md |
| XC-24 | Fuzz corpus seed set | P4 | systems/validation-harness.md |
| XC-25 | Leaderboard replay verifier | P10 | systems/environments-courses.md |
| XC-26 | Golden-number suite harness — **done 2026-06-12** (XT-001 in CI; forge-num determinism fix) | P1 | systems/core-runtime.md |
| XC-27 | Tauri serial + background-recorder plugins | P8 | systems/hardware-bridge.md |

## 4. Open decisions (OD) — non-blocking, from plan §22

| ID | Question | Decide by |
|---|---|---|
| OD-01 | Product name (FORGE pending trademark scan) | before public launch (P3/P4 marketing) |
| OD-02 | ~~React vs Solid~~ — **resolved by D16** (the face stays React/TS; v3.0) | — |
| OD-03 | Left/right asymmetric slot UX (contract already supports) | when a build needs it |
| OD-04 | WASM user-controller sandbox design | post-P7 design review |
| OD-05 | Marketplace economics (revenue share, skill pricing) | inside P11 with usage data |
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
