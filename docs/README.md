# FORGE documentation index

Entry point for the whole repository is [`/CLAUDE.md`](../CLAUDE.md) — read it first.
This index maps the `docs/` tree and gives reading orders by role.

## Reading order

**Every session (any role):**
[`/CLAUDE.md`](../CLAUDE.md) → top of [`/CHANGELOG.md`](../CHANGELOG.md) →
[`ROADMAP.md`](ROADMAP.md) → [`TODO.md`](TODO.md).

**New to the project:** add [`FORGE-plan.md`](FORGE-plan.md) (the binding v3.0 plan,
~35 min), then [`GLOSSARY.md`](GLOSSARY.md) and [`architecture.md`](architecture.md).

**About to implement something:** the relevant `systems/*.md` doc, plus
[`BEST-PRACTICES.md`](BEST-PRACTICES.md) and the budgets in
[`architecture.md`](architecture.md) §6. Anything touching admission, exports,
hardware, or user content also requires
[`security-safety-legal.md`](security-safety-legal.md).

## Document map

| Doc | Purpose | Nature |
|---|---|---|
| [`FORGE-plan.md`](FORGE-plan.md) | The definitive plan v3.0 — positioning, runtime architecture (Rust core / web face), strategy, engines, roadmap, decisions D1–D18, appendices | **Frozen** planning paper (binding) |
| [`FORGE-plan-v2.md`](FORGE-plan-v2.md) | v2.0 predecessor plan | **Frozen**, historical — superseded by v3.0 |
| [`FORGE-vision-and-architecture.md`](FORGE-vision-and-architecture.md) | v1.0 predecessor paper | **Frozen**, historical |
| [`ROADMAP.md`](ROADMAP.md) | Phases P0–P12: scope, exit-criteria checkboxes, live status | Living |
| [`TODO.md`](TODO.md) | Every open task across all surfaces, with stable IDs | Living |
| [`DECISIONS.md`](DECISIONS.md) | Binding decision record D1–D16+, open decisions, decision process | Living (append-only semantics) |
| [`BEST-PRACTICES.md`](BEST-PRACTICES.md) | Doctrine, conventions, code/test/AI-usage standards, git discipline | Living |
| [`GLOSSARY.md`](GLOSSARY.md) | Project vocabulary | Living |
| [`architecture.md`](architecture.md) | Runtime split (Rust core / web face), core boundary, repo layout, stack, deployment, budgets | Living |
| [`security-safety-legal.md`](security-safety-legal.md) | Security model, platform exclusions, legal gates, license export matrix, privacy | Living |
| [`risk-register.md`](risk-register.md) | Risks, mitigations, monitoring triggers | Living |

## System docs (`systems/`)

Implementation-level documentation, one per system. Each follows the same template
(purpose → responsibilities → module layout → interfaces → data & algorithms →
dependencies → budgets → validation & testing → phase mapping → backlog → open
questions). Details beyond the frozen plan are marked *(proposed)*.

| Doc | System | Main phases |
|---|---|---|
| [`core-runtime.md`](systems/core-runtime.md) | `forge-core`: the Rust workspace, boundary API, port plan, golden-number suite | P0–P1, evolves always |
| [`model-contract.md`](systems/model-contract.md) | Model Contract v2.1 — Rust types + schemars schema everything compiles from | P0, evolves always |
| [`validation-harness.md`](systems/validation-harness.md) | `forge-validate`: check catalog, diagnostics — one implementation everywhere | P0–P2, evolves always |
| [`geometry-engine.md`](systems/geometry-engine.md) | Primitives & bake, CSG, mass properties, interference, couplers, refit, DfM | P1, P5–P6 |
| [`render-engine.md`](systems/render-engine.md) | Three.js render layer (TS, deliberately) consuming core-baked buffers | P1 |
| [`motion-engine.md`](systems/motion-engine.md) | Archetype drivers, layer stack, IK, servos (`forge-motion`) | P1–P2 |
| [`simulation-engine.md`](systems/simulation-engine.md) | Rapier coupling, propulsion/battery/estimator, replay, parity (`forge-sim`) | P1, P6 |
| [`learning-engine.md`](systems/learning-engine.md) | Tasks, PPO/SAC training, scorecards, ONNX policies | P7 |
| [`generation-pipeline.md`](systems/generation-pipeline.md) | Text-to-CAD orchestrator, drafts, editing, Brief-25 | P4 |
| [`component-database.md`](systems/component-database.md) | Catalog schema, compatibility, ETL, license ledger, lockfiles | P3 |
| [`studio-ui.md`](systems/studio-ui.md) | React client shell, panes, HUD, local-first persistence, share viewer | P1+ |
| [`gateway-and-data.md`](systems/gateway-and-data.md) | Fastify API, Postgres/queue/storage, auth, registries | P2+ |
| [`compute-workers.md`](systems/compute-workers.md) | Python GPU workers: photoscan, OCCT, training, ETL | P3+ |
| [`hardware-bridge.md`](systems/hardware-bridge.md) | WebSerial, recorder/ghost, **FORGE Desktop (Tauri)**, FORGE Link, ladder, supervisor | P8 |
| [`co-design.md`](systems/co-design.md) | Objective-driven design-space search | P9 |
| [`environments-courses.md`](systems/environments-courses.md) | EnvSpec, course gatekeeper, leaderboards | P10 |
| [`platform.md`](systems/platform.md) | Sharing, accounts, marketplace, skills, classroom, maintenance twin | P4, P11–P12 |

## Maintenance rules

- One fact, one home — link instead of duplicating. The frozen papers are never
  edited; corrections of substance go through `DECISIONS.md` and the living docs.
- A code change that invalidates a doc is not done until the doc is updated.
- Keep [`TODO.md`](TODO.md) IDs stable; mark items done rather than deleting them
  within a phase, and prune only at phase close (noting the prune in the changelog).
