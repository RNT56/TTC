# DECISIONS — the binding decision record

Decisions bind all work. They are changed only by **recording a superseding decision**
(new entry, references the old one, states why) — never by silently editing docs or
drifting in code. On any conflict between documents, this file wins
([`/CLAUDE.md`](../CLAUDE.md) §3). The record below reflects plan **v3.0** §21
(D1–D18) plus two structural decisions recorded here for visibility (D19–D20).

## How to add a decision

1. Confirm it is genuinely a decision of consequence (architecture, scope, sequencing,
   security, legal, economics, naming) — not routine implementation detail.
2. Append a row with the next free ID (next regular ID: **D22**), a one-line decision,
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
| D24 | **License mechanics (implements D2, owner-delegated business calls, 2026-06-12):** Apache-2.0, copyright RNT56, scoped to the open core = `crates/` (ALL forge-* crates incl. the wasm facade and forge-gen — everything published to crates.io/npm must be usable), `schema/`, and `examples/` (fixtures are unusable if closed). Everything else (studio, gateway, workers, prototype, catalog, docs, infra, scripts) proprietary, all rights reserved. Root `LICENSE` states the split; `LICENSES/Apache-2.0.txt` canonical text; `NOTICE` per Apache convention; zone-2 package.json marked "SEE LICENSE IN". Catalog rows keep their per-row licenseClass (D10). Contribution terms stated in LICENSE. | open core must cover every published artifact or publication (P2-001) deadlocks; examples/fixtures travel with the validator | active |

## Open decisions

Tracked as OD-items in [`TODO.md`](TODO.md) §4 (naming, asymmetric slots, WASM
sandbox, marketplace economics, fixed-wing priority, alignment-UI timing, napi-rs vs
binary-spawn). None blocks a phase boundary. Resolve → append a D-row here → mark the
OD row. OD-02 (React vs Solid) was resolved by D16: the face stays React/TS.

## Expected near-term additions

- ~~P2: napi-rs hot-path bindings vs binary-spawn in the gateway (OD-08)~~ — resolved as D22.
- P3: reference-rig SKU selection (fulfils D12).
- P4: pinned Anthropic model strings/limits/pricing (CLAUDE.md non-negotiable #11).
- P8: legal-review sign-off record (entry gate).
- P11: dual-use check record; marketplace economics (OD-05).
