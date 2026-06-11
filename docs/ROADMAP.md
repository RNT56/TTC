# ROADMAP — phases, exit criteria, live status

Source: [`FORGE-plan.md`](FORGE-plan.md) §19 (binding scope) expanded with tracking
state. **A phase closes only when every exit criterion below is checked, the docs it
invalidates are updated, and the changelog records the close.** Estimates assume a
solo builder pairing with AI agents.

**Status legend:** ○ not started · ◑ in progress · ● done · ⛔ blocked
**Task detail** lives in [`TODO.md`](TODO.md) (IDs `P0-…`, `XC-…`); this file tracks
phase-level state only.

| Phase | Status | Est. |
|---|---|---|
| Pre-P0 housekeeping | ◑ | days |
| P0 Freeze & extract | ⛔ (needs PRE-002, the prototype file) | 1–2 wk |
| P1 Render & core port | ○ | 3–4 wk |
| P2 Data-driven models | ○ | 3 wk |
| P3 Component DB + proof pair + reference rigs | ○ | 2–3 wk |
| P4 Text-to-CAD GA | ○ | 3–4 wk |
| P5 Image → 3D | ○ | 3 wk |
| P6 Simulation depth + interop | ○ | 3–4 wk |
| P7 Training service | ○ | 4 wk |
| P8 Hardware bridge + recorder | ○ | 4–6 wk |
| P9 Co-design optimizer | ○ | 4 wk |
| P10 Environments & courses | ○ | 3–4 wk |
| P11 Platform | ○ | open |
| P12 Maintenance twin | ○ | 3 wk |

Sequencing rationale (decisions D1–D4): verify-first means P3 (catalog truth) ships
and gets attention before P4 (generation GA); sharing arrives at P4, not the platform
phase; the marketplace is deliberately last.

---

## Pre-P0 — housekeeping (not in the plan; required before P0)

Scope: make the repository workable — documentation system, the prototype committed,
licensing groundwork.

- [x] Documentation system in place (`CLAUDE.md`, `CHANGELOG.md`, `docs/` suite)
- [ ] **`cad-object-studio.html` prototype committed** as the executable reference (PRE-002 — blocks P0)
- [ ] License files reflecting open-core split (D2): Apache-2.0 for schema/engines/harness; proprietary notice for the rest (PRE-003)
- [ ] Repo hygiene: Node/TS `.gitignore`, `.editorconfig`, default-branch protection (PRE-004)

## P0 — Freeze & extract

**Scope:** Monolith tagged as the executable reference; contract schema v2.1 written
(env, estimator, lockfile, license classes, collider compounds); mechanical
translation of both prototype models (humanoid + VX-2 quad) and all 31 variants to
JSON; monorepo scaffold.
**Owning docs:** [`systems/model-contract.md`](systems/model-contract.md),
[`systems/validation-harness.md`](systems/validation-harness.md),
[`architecture.md`](architecture.md) §3.

Exit criteria:
- [ ] Both contracts validate in a Node runner
- [ ] Part/face counts **byte-equivalent** to the monolith for both models across all 31 variants
- [ ] Contract JSON Schema v2.1 published in `packages/contract` with TypeBox codegen
- [ ] Monorepo scaffold builds green in CI (pnpm + Turborepo + Vite)
- [ ] Prototype tagged (e.g. `prototype-final`) and never modified after

## P1 — Render & core port

**Scope:** Three.js studio (scene graph, PBR materials, blueprint, explode + leader
lines, selection, jog, configurator pane, orbit); motion-engine port (gait/IK, mixer,
servos); Rapier worker skeleton.
**Owning docs:** [`systems/render-engine.md`](systems/render-engine.md),
[`systems/motion-engine.md`](systems/motion-engine.md),
[`systems/studio-ui.md`](systems/studio-ui.md).

Exit criteria:
- [ ] Golden-scene parity gallery versus the monolith (canonical cameras, perceptual diff)
- [ ] **Shimmer gone** — z-buffer renderer resolves all deliberately overlapping solids
- [ ] 60 fps on mid hardware within the frame budget (≤ 6 ms render / ≤ 3 ms motion / ≤ 4 ms physics / ≤ 2 ms UI)
- [ ] React-vs-Solid decision revisited with profiling data (OD-02; expected outcome: stay)

## P2 — Data-driven models

**Scope:** Validation service productized (check IDs, diagnostic format, draft
semantics); archetype driver library formalized; parametric family #1 — quadruped
generator with leg-count/wheelbase/mass sliders.
**Owning docs:** [`systems/validation-harness.md`](systems/validation-harness.md),
[`systems/motion-engine.md`](systems/motion-engine.md).

Exit criteria:
- [ ] A quadruped spec becomes a valid walking model with **zero hand-written code**
- [ ] CI green on the full validation suite
- [ ] Diagnostic format stable and machine-readable (consumed later by generation repair, P4)

## P3 — Component DB + proof pair + reference rigs

**Scope:** Component schema, connector taxonomy, compatibility rules, ETL worker,
license ledger, lockfile resolution; VX-2 `rotors` and `battery` slots
component-backed; reference quad and rover SKUs pinned at ingestion (D12).
**Owning docs:** [`systems/component-database.md`](systems/component-database.md),
[`systems/compute-workers.md`](systems/compute-workers.md).

Exit criteria:
- [ ] Proof pair renders to datasheet dimensions within tolerance
- [ ] HUD physics responds to the pack swap (hover throttle, endurance change)
- [ ] BOM exports purchasable SKUs
- [ ] Reference rigs (ArduPilot-capable 5″ quad + Pi-class rover) selected, SKUs pinned, recorded in DECISIONS
- [ ] Every ingested datum carries a per-field source citation

## P4 — Text-to-CAD GA

**Scope:** Generation orchestrator (retrieval, multi-pass constrained synthesis,
validator-in-loop repair, draft fallback D14, JSON-Patch editing, provenance stamps);
share URLs (D4); BYO key + metered credits (D3); Brief-25 suite live (D-evals).
**Owning docs:** [`systems/generation-pipeline.md`](systems/generation-pipeline.md),
[`systems/platform.md`](systems/platform.md) §2.

Exit criteria:
- [ ] ≥ 20/25 Brief-25 briefs admitted without human repair
- [ ] Conversational edits apply in < 3 s
- [ ] A shared link renders for a logged-out visitor (orbit, explode, blueprint, drive demo)
- [ ] Anthropic model strings/limits/pricing pinned from current docs (not from the plan)
- [ ] Brief-25 dashboard tracks admission rate, repair iterations, diversity over time

## P5 — Image → 3D

**Scope:** TRELLIS/photogrammetry workers, primitive refit with the D13 acceptance
metric, browser alignment UI, photoscan admission path.
**Owning docs:** [`systems/compute-workers.md`](systems/compute-workers.md) §4,
[`systems/geometry-engine.md`](systems/geometry-engine.md) §refit.

Exit criteria:
- [ ] A photographed motor becomes an equipable parametric component end to end
- [ ] D13 acceptance enforced (≥ 70 % fit coverage, Hausdorff ≤ 1.5 % of bounding diagonal, else mesh-class)
- [ ] Photo→part job under the 5-minute SLO on burst GPU; results cached permanently

## P6 — Simulation depth + interop out/in

**Scope:** Full Rapier coupling, propulsion/battery/estimator models, HUD analytics,
disturbance injectors; MJCF/URDF exporters with parity suite; URDF/MJCF **importer**.
**Owning docs:** [`systems/simulation-engine.md`](systems/simulation-engine.md),
[`systems/model-contract.md`](systems/model-contract.md) §compile-targets.

Exit criteria:
- [ ] Hover trim agrees across Rapier and MuJoCo within tolerance (parity suite green)
- [ ] An external URDF round-trips into a driveable contract
- [ ] Endurance estimate within stated error of bench math; assumptions inspectable in HUD
- [ ] Replay format stable: {contract hash + lockfile, env, seed, input tape}

## P7 — Training service

**Scope:** Task suite v1, SB3 PPO/SAC pipeline, randomization config, scorecards,
ONNX export, in-browser policy playback; estimator-smoke gate (D8).
**Owning docs:** [`systems/learning-engine.md`](systems/learning-engine.md).

Exit criteria:
- [ ] A trained hover + waypoint policy flies the twin in-browser from a one-click job
- [ ] Ground-truth-trained policies rejected at scorecard time (estimator smoke)
- [ ] Hover-class task to passing scorecard overnight on one consumer GPU
- [ ] Scorecard schema final: success rate, robustness grid, energy; sub-threshold policies do not export

## P8 — Hardware bridge + recorder

**Scope:** WebSerial config writer, telemetry ingest, system-ID fitting, flight
recorder + ghost overlay, FORGE Link companion image, deployment-ladder UX with the
safety supervisor and control-rate contract (D9); pilots on both reference rigs.
**Entry gate (hard):** ToS/liability legal review complete
([`security-safety-legal.md`](security-safety-legal.md) §3).
**Owning docs:** [`systems/hardware-bridge.md`](systems/hardware-bridge.md).

Exit criteria:
- [ ] Legal review of ladder UX, supervisor disclaimers, telemetry consent — **before any deployment feature ships**
- [ ] A real quad configured from its contract via WebSerial
- [ ] SITL → HITL → tethered demonstrated and documented on the reference quad
- [ ] A real log replayed with ghost divergence visible
- [ ] System-ID fit updates the contract's sim block from bench/flight telemetry

## P9 — Co-design optimizer

**Scope:** CMA-ES/Bayesian-optimization orchestrator, multi-fidelity evaluation
ladder, Pareto-front UI; MJX batching as needed.
**Owning docs:** [`systems/co-design.md`](systems/co-design.md).

Exit criteria:
- [ ] "Lightest quad for this course under constraints" returns ≥ 3 admitted Pareto points overnight
- [ ] Tier-0/1 candidate evaluation < 5 s; 200-candidate CMA-ES generation overnight at tier 2
- [ ] Every returned point is a fully admitted contract (validator as constraint oracle)

## P10 — Environments & courses

**Scope:** EnvSpec schema + gatekeeper, environment generation, course sharing,
leaderboards with server-replayed verification (D6).
**Owning docs:** [`systems/environments-courses.md`](systems/environments-courses.md).

Exit criteria:
- [ ] A community course races with a verified leaderboard (server-side bit-exact replay)
- [ ] A popular course doubles as an RL task without conversion work

## P11 — Platform

**Scope:** Accounts, marketplace (models + skills with scorecards), classroom mode,
BOM agent vendor links, DfM + print-service ordering, UGC moderation policy.
**Entry gate (hard):** dual-use/export-control sanity check before policy sharing
([`security-safety-legal.md`](security-safety-legal.md) §3).
**Owning docs:** [`systems/platform.md`](systems/platform.md).

Exit criteria:
- [ ] First external user publishes a model that strangers equip
- [ ] First printed structural part ordered through the flow
- [ ] Moderation policy live (report flow, takedown SLA, repeat-infringer rule)
- [ ] Marketplace economics decided with real usage data (OD-05)

## P12 — Maintenance twin

**Scope:** Wear models from telemetry, crash forensics workflow,
repair-steps-from-explode with reorder links, fleet view.
**Owning docs:** [`systems/platform.md`](systems/platform.md) §6.

Exit criteria:
- [ ] A logged crash produces an actionable repair sheet with parts in the cart
