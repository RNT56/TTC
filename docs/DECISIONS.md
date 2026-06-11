# DECISIONS — the binding decision record

Decisions bind all work. They are changed only by **recording a superseding decision**
(new entry, references the old one, states why) — never by silently editing docs or
drifting in code. On any conflict between documents, this file wins
([`/CLAUDE.md`](../CLAUDE.md) §3).

## How to add a decision

1. Confirm it is genuinely a decision of consequence (architecture, scope, sequencing,
   security, legal, economics, naming) — not routine implementation detail.
2. Append a row with the next free ID (next regular ID: **D17**), a one-line decision,
   a one-line rationale, the date, and status `active`.
3. If it supersedes an earlier decision, set the old row's status to
   `superseded by Dnn`.
4. Reference the ID from the docs and code it affects; note it in your changelog entry.
5. Decisions that reverse the frozen plan should be confirmed with the project owner
   first.

## Strategy decisions (from plan §2, §21 — active)

| # | Decision | Rationale | Status |
|---|---|---|---|
| D1 | **Verify-first wedge**: configurator truth (component DB, P3) ships and gets marketing before generation GA (P4) | builders arrive for honest numbers, stay for the wow layers | active |
| D2 | **Open-core**: contract schema + five engines + harness are Apache-2.0; platform, catalog data, compute services, marketplace proprietary. ToS states from day one that admitted models contribute anonymized structural patterns (opt-out per model; marketplace listings opt-in by default) | trust + contributions from code; the moat is the data (corpus, catalog, provenance, community) | active |
| D3 | **BYO Anthropic API key + metered credits** from day one; the studio (view/configure/validate/local-sim) free forever | compute costs start at P4, not P9; BYO key makes generation self-funding | active |
| D4 | **Read-only share URLs at P4**, not the platform phase | sharing is the growth loop; nearly free once contracts load anywhere | active |

## Technical decisions (from plan §21 — active)

| # | Decision | Rationale | Status |
|---|---|---|---|
| D5 | Pinned `componentRef`s + per-model **lockfile** against immutable catalog revisions; upgrades are explicit, re-validated, diffed (mass/hover/price) | catalog changes must never silently change a model | active |
| D6 | **Replay determinism**: client replay tolerance-banded with drift detection; bit-exact replay and all official scorecards/leaderboards computed server-side | cross-browser floats make client bit-exactness a lie; leaderboards need truth | active |
| D7 | **Collision compounds** per node: ≤ 8 convex pieces/node, ≤ 24/model, validator-enforced; visual parts decoupled from colliders | contact fidelity where it matters; no 136-collider physics cliff | active |
| D8 | **Estimator block** in the contract; policies train on estimator output, never ground truth; scorecards reject ground-truth-trained policies | removes a top-three sim-to-real killer by schema | active |
| D9 | **Control-rate contract**: policy advises ~50 Hz; supervisor ≥ 200 Hz; FC rate loop never touched; missed inference tick degrades to fallback; numbers stated in the ladder UX | stated authority, stated degradation | active |
| D10 | **License classes** (`open / attribution / no-redistribution / view-only`) + export matrix; restricted meshes degrade to dimensioned envelopes + link-out | whole-assembly exports legal by construction | active |
| D11 | **Chromium-first declared**: full studio + bridge on Chromium; Firefox/Safari viewer-grade; iOS viewer; bridge Chromium-only | honesty over pretense; budgets and docs state the floor | active |
| D12 | **Reference rigs frozen at P3**: one ArduPilot-capable 5″ quad + one Pi-class differential rover; exact SKUs pinned at ingestion | de-risks P8; becomes tutorials and standing test fixtures | active |
| D13 | **Primitive-refit acceptance**: ≥ 70 % surface-area fit coverage AND Hausdorff residual ≤ 1.5 % of bounding diagonal, else the part admits as mesh-class | "parametric" is a measured claim, not a vibe | active |
| D14 | **Failed generations persist as editable drafts** carrying diagnostics; drafts cannot train, export, or share | no vanishing work; gatekeeper stays sovereign | active |
| D-r1 | **Wiring v1** is cosmetic verlet splines + an exact BOM wire list; routed harness design through joints is deferred research | honest scoping of a genuinely hard problem | active |
| D-evals | **Brief-25** generation benchmark as permanent CI (re-run on every prompt/schema/pattern/model change) with tracked admission/repair/diversity metrics | generation quality is an engineering quantity with a dashboard | active |

## Structural decisions implicit in the plan (recorded here for visibility)

| # | Decision | Rationale | Status |
|---|---|---|---|
| D15 | **No code in contracts** — models are data; drivers are parameterized references into versioned engine libraries; the only future exception is the sandboxed-WASM controller (post-P7, capability-limited, no I/O, fuel-metered, marketplace-reviewed) | the central security + generability decision (plan §4, §17) | active |
| D16 | **Two physics engines on one compiled source of truth** — Rapier (client/interactive) + MuJoCo (training/canonical), both consuming the same MJCF from the same contract, parity suite on every upgrade; training side wins disagreements | interactivity and training-grade contact have different needs (plan §6) | active |

## Open decisions

Tracked as OD-01…OD-07 in [`TODO.md`](TODO.md) §4 (naming, React-vs-Solid, asymmetric
slots, WASM sandbox, marketplace economics, fixed-wing priority, alignment-UI timing).
None blocks a phase boundary. Resolve → append a D-row here → mark the OD row.

## Expected near-term additions

These will need entries when their phase arrives:
- P3: reference-rig SKU selection (fulfils D12).
- P4: pinned Anthropic model strings/limits/pricing (per CLAUDE.md non-negotiable #10).
- P8: legal-review sign-off record (entry gate).
- P11: dual-use check record; marketplace economics (OD-05).
