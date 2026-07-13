# DECISIONS — the binding decision record

Decisions bind all work. They are changed only by **recording a superseding decision**
(new entry, references the old one, states why) — never by silently editing docs or
drifting in code. On any conflict between documents, use the authority order in
[`/AGENTS.md`](../AGENTS.md); executable evidence still owns current-state claims.
The record below reflects plan **v3.0** §21
(D1–D18) plus two structural decisions recorded here for visibility (D19–D20).

## How to add a decision

1. Confirm it is genuinely a decision of consequence (architecture, scope, sequencing,
   security, legal, economics, naming) — not routine implementation detail.
2. Append a row with the next free ID (next regular ID: **D34**), a one-line decision,
   a one-line rationale, and status `active`.
3. If it supersedes an earlier decision, set the old row's status to
   `superseded by Dnn` — exactly as D6 and D11 were retired by v3.0.
4. Reference the ID from the docs and code it affects; note it in your changelog entry.
5. Decisions that reverse the plan should be confirmed with the project owner first.

## Strategy decisions

| # | Decision | Rationale | Status |
|---|---|---|---|
| D1 | **Verify-first wedge**: configurator truth (component DB, P3) ships and gets marketing before generation GA (P4) | builders arrive for honest numbers, stay for the wow layers | active |
| D2 | **Open-core**: contract schema + **core crates** + `forge-validate` are Apache-2.0; platform, catalog data, compute services, marketplace proprietary. ToS states from day one that admitted models contribute anonymized structural patterns (opt-out per model; marketplace listings opt-in by default) | trust + contributions from code; the moat is the data; the Rust core makes the open half a distributable artifact (the R2 rung) | active |
| D3 | **BYO Anthropic API key + metered credits** from day one; the studio (view/configure/validate/local-sim) free forever | generation self-funding; GPU at transparent cost-plus | active |
| D4 | **Read-only share URLs at P4**, not the platform phase | sharing is the growth loop — and the standing argument for the web face | active |
| D18 | **Positioning: upstream of CAD** — mass-properties-correct over surface-exact; OCCT inside, STEP out first-class; Parasolid/CGM licensing documented as a purchasable option, never a roadmap item; non-goals stated (GD&T, surfacing, tooling, certified workflows); success ladder R1–R4 | fight where there is no incumbent, export to where there is | active |

## Runtime & technical decisions

| # | Decision | Rationale | Status |
|---|---|---|---|
| D5 | Pinned `componentRef`s + per-model **lockfile** against immutable catalog revisions; upgrades are explicit, re-validated, diffed (mass/hover/price) | catalog changes must never silently change a model | active |
| D6 | Tolerance-banded client replay with drift detection; bit-exact replay and official scorecards server-side only | obsolete: one implementation made exactness universal | **superseded by D17** |
| D7 | **Collision compounds** per node: ≤ 8 convex pieces/node, ≤ 24/model, validator-enforced; visual parts decoupled from colliders | contact fidelity where it matters; no 136-collider physics cliff | active |
| D8 | **Estimator block** in the contract; policies train on estimator output, never ground truth; scorecards reject ground-truth-trained policies | removes a top-three sim-to-real killer by schema | active |
| D9 | **Control-rate contract**: policy advises ~50 Hz; supervisor ≥ 200 Hz; FC rate loop never touched; missed inference tick degrades to fallback; numbers stated in the ladder UX | stated authority, stated degradation | active |
| D10 | **License classes** (`open / attribution / no-redistribution / view-only`) + export matrix; restricted meshes degrade to dimensioned envelopes + link-out | whole-assembly exports legal by construction | active |
| D11 | Chromium-first declared; Firefox/Safari viewer-grade; iOS viewer; bridge Chromium-only | honesty over pretense | **subsumed by D15** |
| D12 | **Reference rigs frozen at P3**: one ArduPilot-capable 5″ quad + one Pi-class differential rover; exact SKUs pinned at ingestion | de-risks P8; becomes tutorials and standing test fixtures | active |
| D12-P3 | **P3 reference rig SKUs pinned**: quad = TBS Source One V6-class 5″ frame, Holybro Kakute H7 V1.5 FC (`11091`), Holybro Tekko32 F4 4in1 50A ESC (`31102`), EMAX ECO II 2207 1900KV motors (`0101096015`), Gemfan Hurricane 51466 V2 props (`17756`), CNHL Black V2 4S 1500 pack (`1501304BK-2PACK`); rover = Waveshare UGV Rover PT PI5 ROS2 kit (`27255-PT-PI5-ROS2`) | exact local fixtures for P3 catalog/BOM/HUD; retailer-only rows remain review-gated until owner verification | active |
| D13 | **Primitive-refit acceptance**: ≥ 70 % surface-area fit coverage AND Hausdorff residual ≤ 1.5 % of bounding diagonal, else the part admits as mesh-class | "parametric" is a measured claim, not a vibe | active |
| D14 | **Failed generations persist as editable drafts** carrying diagnostics; drafts cannot train, export, or share | no vanishing work; gatekeeper stays sovereign | active |
| D15 | **Browser is the primary surface, permanently; FORGE Desktop (Tauri) ships at P8** as the bridge/power surface (serialport-rs, background recorder, real filesystem); Firefox/Safari/iOS viewer-grade by declaration | the tab wins distribution; the shell arrives when it has a real job | active |
| D16 | **Rust core, web face**: contract/geometry/motion/sim/validator as dual-target Rust crates (`forge-core`) behind a frozen DOM-free boundary (bake/tick/validate/patch); render/UI stay TS + Three.js; gateway TS; compute Python; direct JS→Rust port with the harness as parity oracle | one implementation of truth, paid for once | active |
| D17 | **One validator everywhere**: `forge-validate` as static binary + npm WASM package + crate, bit-exact across targets; no fast-math in core; cross-target **golden-number suite** in CI; platforms that break exactness degrade to declared ULP tolerance | replay verifies anywhere; the R2 rung becomes a distributable artifact | active (supersedes D6) |

## Scoping & evals

| # | Decision | Rationale | Status |
|---|---|---|---|
| D-r1 | **Wiring v1** is cosmetic verlet splines + an exact BOM wire list; routed harness design through joints is deferred research | honest scoping of a genuinely hard problem | active |
| D-evals | **Brief-25** generation benchmark as permanent CI (re-run on every prompt/schema/pattern/model change) with tracked admission/repair/diversity metrics | generation quality is an engineering quantity with a dashboard | active |

## Structural decisions implicit in the plan (recorded here for visibility)

| # | Decision | Rationale | Status |
|---|---|---|---|
| D19 | **No code in contracts** — models are data; drivers are parameterized references into versioned engine libraries; the only future exception is the sandboxed-WASM controller (post-P7, capability-limited, no I/O, fuel-metered, marketplace-reviewed). *(Recorded as D15 in this file before v3.0 took D15–D18; renumbered.)* | the central security + generability decision (plan §4, §17) | active |
| D20 | **Two physics engines on one compiled source of truth** — Rapier (client/interactive) + MuJoCo (training/canonical), both consuming the same MJCF from the same contract, parity suite on every upgrade; training side wins disagreements. *(Previously recorded as D16 in this file; renumbered.)* | interactivity and training-grade contact have different needs (plan §6) | active |

## Project-execution decisions

| # | Decision | Rationale | Status |
|---|---|---|---|
| D21 | **Implementation started ahead of PRE-002 by owner order** (2026-06-12): the v0 end-to-end build proceeds on all surfaces while the prototype is absent. Consequences, recorded: (a) P0's byte-equivalence and the model translations stay **open** until the monolith lands; (b) the synthetic `examples/vx2-mini.forge.json` is a fixture, never a stand-in for the translations; (c) primitive parameterizations beyond Appendix A are *(proposed)* in code and reconciled at PRE-002; (d) the Rust core was implemented directly rather than ported — oracle parity (P1 golden numbers) still gates P1 close. | the owner explicitly re-ordered ("build the whole project end to end"); CLAUDE.md §10 requires this entry | active |
| D22 | **Gateway keeps binary-spawn; napi-rs deferred (OD-08 resolved by measurement, 2026-06-12).** Measured on the shipping path (temp files + execFile of the debug binary, report parsed): spawn p50 **5.3 ms** (vx2-mini, 16 parts) / **17.8 ms** (hrx7, 125 parts); in-process WASM-in-Node (a conservative napi proxy — napi would only be faster): p50 **0.7 / 3.7 ms** (`scripts/od08-measure.mjs`). Both sit far inside the < 150 ms interactive-validate budget, and spawn buys process isolation plus guaranteed bit-equality with the CI artifact. napi-rs would add a third build artifact to save ~5–15 ms — revisit only when a measured server-side hot path demands it (candidate: the P4 generation orchestrator validating every draft iteration at volume). | measurement over preference; the in-process option already exists (WASM) wherever latency matters | active |
| D23 | **The product name is ForgedTTC** (owner decision, 2026-06-12 — resolves OD-01/PRE-005). "FORGE" remains the historical working codename in frozen papers; living docs and public artifacts say ForgedTTC. **Scope call:** code namespaces stay `forge-*` / `@forge/*` — they are internal artifact prefixes, renaming them churns every crate/package/import for zero user value; public-facing naming (UI title, README, published package descriptions, NOTICE) carries ForgedTTC. A formal trademark scan remains the owner's pre-P4 action (recorded, not blocking). | owner instruction; minimal-churn scoping per "boring everywhere" | active |
| D24 | **License mechanics (implements D2, owner-delegated business calls, 2026-06-12):** Apache-2.0, copyright RNT56, scoped to the open core = `crates/` (ALL forge-* crates incl. the wasm facade and forge-gen — everything published to crates.io/npm must be usable), `schema/`, and `examples/` (fixtures are unusable if closed). Everything else (studio, gateway, workers, prototype, catalog, docs, infra, scripts) proprietary, all rights reserved. Root `LICENSE` states the split; `LICENSES/Apache-2.0.txt` canonical text; `NOTICE` per Apache convention; zone-2 package.json marked "SEE LICENSE IN". Catalog rows keep their per-row `license` metadata (D10). Contribution terms stated in LICENSE. | open core must cover every published artifact or publication (P2-001) deadlocks; examples/fixtures travel with the validator | active |
| D25 | **P4 starts with live catalog ingestion and review operations before full text-to-CAD generation GA.** The first P4 slice is the owner-facing review API/UI plus injectable fetch/Claude/OCCT adapters; the generation orchestrator then consumes reviewed catalog truth, not unaudited rows. | generation quality depends on trusted parts/provenance; closing the review loop first avoids building LLM flows on unresolved catalog debt | active |
| D26 | **P4 Anthropic model pins are fixed from official docs checked 2026-06-13:** synthesis `claude-fable-5` (1M context, 128k max output, $10/$50 per MTok input/output), repair `claude-opus-4-8` (1M, 128k, $5/$25), edit `claude-sonnet-4-6` (1M, 64k, $3/$15), ETL `claude-haiku-4-5-20251001` / alias `claude-haiku-4-5` (200k, 64k, $1/$5). Prompt-cache write/hit prices are recorded in code; `claude-mythos-5` is not used because official docs mark it limited availability. | model IDs, limits, and prices move faster than planning docs; generated artifacts must carry auditable model provenance before live calls | active |
| D27 | **P4-P12 executes as a deterministic local production slice before live cloud/hardware expansion** (2026-06-14): P4 generation uses deterministic multi-archetype templates by default, Auth.js GitHub OAuth is pulled forward, Docker Compose is the runnable stack, MinIO-compatible object storage backs blobs, and Modal remains the burst-GPU adapter behind fixture-default workers. Live Anthropic, live fetch, live photogrammetry, SB3/MuJoCo, and hardware deployment stay injectable/optional until explicitly configured. | the owner requested full P4-P12 execution, but CI/local closure must not depend on external keys, GPUs, or physical hardware | active |
| D28 | **P8 legal gate remains binding despite scaffold implementation** (2026-06-14): bridge/Desktop data tables, fixture jobs, Studio controls, replay/system-ID seams, and worker handlers may exist before counsel review; WebSerial writes, auto-deploy, free-flight/tethered steps, and any policy/hardware deployment surface remain blocked until the ToS/liability/legal sign-off record is completed. | legal gates are entry conditions, not cleanup; scaffold code must not silently turn into hardware authority | **superseded by D30** |
| D29 | **P11 marketplace launches as a usage-data beta; economics decision is deferred until real thresholds are met** (2026-06-14): listed models/courses/skills/components may collect views, equips, quote clicks, policy downloads, and training-job usage, but launch has no seller payouts, no revenue share, and no direct marketplace checkout. Credit cost-plus remains retained for GPU jobs. | pricing and revenue share need real usage distribution; quote/link handoff and usage rollups give evidence without creating a payout/payment system prematurely | active |
| D30 | **D28 hardware/legal signoff is accepted for controlled D12 lab pilots only** (2026-06-14): owner signoff covers ToS/liability posture, telemetry consent, ladder UX, physical confirmation, no-auto-arm, D12 rig allowlist, policy-advisory authority, and supervisor priority. Runtime remains lab-gated: `d28.hardware` accepted, `FORGE_HARDWARE_LAB_MODE=1`, local provider, D12 rig ID, and physical confirmation are all required. External beta is not enabled by this decision; it requires post-lab evidence and an explicit rollout gate. | unlocks the next implementation step without turning scaffolded hardware authority into a general product capability | active |
| D31 | **Package releases and persisted/public data contracts have independent SemVer domains** (2026-07-12): ModelSpec, validator reports, replay, and EnvSpec carry explicit format versions; CLI and WASM follow package SemVer; unversioned worker envelopes follow the worker package until promoted to their own schema. Additive fields are minor, semantic/type/unit removals or changes are major, and normal deprecations remain readable for at least 90 days and two minor releases after the first public replacement release. | package cadence must not silently redefine stored designs, reports, courses, or evidence; machine-readable compatibility lets every surface reject unsupported majors consistently | active |
| D32 | **The frozen pre-configurator prototype is the complete historical parity boundary; absent variants are not reconstructed or fabricated** (2026-07-13). P0-007 closes as not applicable to the delivered vintage. Product variant support proceeds independently through XC-28: a versioned contract must identify exactly one equipped variant per non-empty slot, and only that variant may affect bake, validation, simulation, BOM, lockfile resolution, or Studio state. Legacy slot-bearing 2.1 documents require an explicit deterministic migration rule before the new contract is accepted. | the only delivered oracle contains no 31-variant slot system, while the current contract incorrectly lets every alternative contribute to mass/BOM/simulation; honest provenance and physical truth require separating unavailable historical extraction from real selected-configuration semantics | active |
| D33 | **Account export and deletion are explicit primary-data operations, not implied cascades** (2026-07-13). User-data export 1.0.0 reads a repeatable snapshot of every owner-scoped dataset, exposes authenticated blob-download endpoints, and excludes OAuth/session/verification/provider secrets. Account deletion requires exact destructive confirmation, locks the owner in a serializable transaction, explicitly purges owned and derived rows, deletes all S3-compatible payloads before commit, and rolls back database deletion when object removal fails. Deletion receipt 1.0.0 says `primary` only: legal holds, retention periods, tombstones, and backup expiry/restoration remain SEC-005 and must never be inferred from a successful primary receipt. | `ON DELETE SET NULL` would orphan photos, generated artifacts, telemetry, policies, courses, and audit rows; a durable privacy boundary needs complete scope, fail-closed storage coordination, a versioned portable export, and an honest separation between primary deletion and backup lifecycle proof | active |

## Open decisions

Tracked as OD-items in [`TODO.md`](TODO.md) §4. The product name (D23), React face
(D16), marketplace economics (D29), alignment timing (P5-004), and binary-spawn
(D22) are resolved. Remaining decision work is asymmetric slot UX (OD-03), the WASM
user-controller sandbox (OD-04), fixed-wing priority (OD-06), plus the formal
ForgedTTC trademark scan tracked as GOV-010. Resolve a real decision by appending a
D-row here and updating the OD row; do not silently mutate earlier decisions.

## Expected near-term additions

- ~~P2: napi-rs hot-path bindings vs binary-spawn in the gateway (OD-08)~~ — resolved as D22.
- ~~P3: reference-rig SKU selection (fulfils D12).~~ — resolved in P3.
- ~~P4: pinned Anthropic model strings/limits/pricing (CLAUDE.md non-negotiable #11)~~ — resolved as D26.
- ~~P8: legal-review sign-off record (entry gate).~~ — accepted for controlled D12 lab pilots by D30.
- P11: dual-use check record remains gate-tracked; marketplace economics deferred by D29.
