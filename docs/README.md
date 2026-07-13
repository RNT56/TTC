# FORGE documentation index

Entry point for the whole repository is [`/AGENTS.md`](../AGENTS.md) — read it first.
`/CLAUDE.md` is retained only as a compatibility pointer.
This index maps the `docs/` tree and gives reading orders by role.

## Reading order

**Every session (any role):**
[`/AGENTS.md`](../AGENTS.md) → [`PROJECT-STATE.md`](PROJECT-STATE.md) → top of
[`/CHANGELOG.md`](../CHANGELOG.md) → [`ROADMAP.md`](ROADMAP.md) →
[`TODO.md`](TODO.md) → [`EXECUTION-ROADMAP.md`](EXECUTION-ROADMAP.md).

**New to the project:** add [`FORGE-plan.md`](FORGE-plan.md) (the binding v3.0 plan,
~35 min), then [`GLOSSARY.md`](GLOSSARY.md) and [`architecture.md`](architecture.md).

**About to implement something:** the relevant `systems/*.md` doc, plus
[`BEST-PRACTICES.md`](BEST-PRACTICES.md) and the budgets in
[`architecture.md`](architecture.md) §7. Anything touching admission, exports,
hardware, or user content also requires
[`security-safety-legal.md`](security-safety-legal.md). Authentication, public routes,
providers, outbound network access, secrets, uploads, workers, callbacks, rate limits,
logs, or release archives additionally require
[`THREAT-MODEL.md`](THREAT-MODEL.md). Export, deletion, retention,
legal-hold, backup, restore, or tombstone work additionally requires
[`DATA-LIFECYCLE.md`](DATA-LIFECYCLE.md). Any schema, render, physics, validator,
corpus, or committed generated-runtime re-pin additionally requires
[`GOLDEN-ARTIFACTS.md`](GOLDEN-ARTIFACTS.md). Studio semantics, interaction,
responsive behavior, motion, worker fallback, or browser claims additionally require
[`BROWSER-SUPPORT.md`](BROWSER-SUPPORT.md). Postgres schema, migration runner,
persisted-data compatibility, backup impact, or database recovery changes additionally
require [`MIGRATIONS.md`](MIGRATIONS.md).

## Document map

| Doc | Purpose | Nature |
|---|---|---|
| [`PROJECT-STATE.md`](PROJECT-STATE.md) | Dated evidence snapshot, current gates, capability maturity, and go/no-go verdicts | **Living; evidence-backed** |
| [`FORGE-plan.md`](FORGE-plan.md) | The definitive plan v3.0 — positioning, runtime architecture (Rust core / web face), strategy, engines, roadmap, decisions D1–D18, appendices | **Frozen** planning paper (binding) |
| [`FORGE-plan-v2.md`](FORGE-plan-v2.md) | v2.0 predecessor plan | **Frozen**, historical — superseded by v3.0 |
| [`FORGE-vision-and-architecture.md`](FORGE-vision-and-architecture.md) | v1.0 predecessor paper | **Frozen**, historical |
| [`ROADMAP.md`](ROADMAP.md) | Phases P0–P12: scope, exit-criteria checkboxes, live status | Living |
| [`TODO.md`](TODO.md) | Every open task across all surfaces, with stable IDs | Living |
| [`EXECUTION-ROADMAP.md`](EXECUTION-ROADMAP.md) | Complete dependency-ordered program: recovery, releases, phases, security, quality, operations, external/field proof, and acceptance gates | Living |
| [`DECISIONS.md`](DECISIONS.md) | Binding decision record D1–D16+, open decisions, decision process | Living (append-only semantics) |
| [`BEST-PRACTICES.md`](BEST-PRACTICES.md) | Doctrine, conventions, code/test/AI-usage standards, git discipline | Living |
| [`REPOSITORY-GOVERNANCE.md`](REPOSITORY-GOVERNANCE.md) | Exact required checks, ruleset contract, security/dependency operations, and evidence cadence | Living |
| [`COMPATIBILITY.md`](COMPATIBILITY.md) | SemVer domains, support matrix, deprecation windows, migration and breaking-change rules | Living; machine-checked |
| [`MIGRATIONS.md`](MIGRATIONS.md) | Postgres predecessor support, transactional runner, acceptance matrix, deployment, backup impact, roll-forward, rollback, and failure recovery | Living; required-CI evidence contract |
| [`GOLDEN-ARTIFACTS.md`](GOLDEN-ARTIFACTS.md) | Machine-registered golden inventory, immutable-oracle rule, re-pin procedure, review evidence, and focused commands | Living; machine-enforced |
| [`RELEASE.md`](RELEASE.md) | Cross-platform validator artifact, attestation, verification, tag, publication, and rollback procedure | Living runbook |
| [`PUBLICATION.md`](PUBLICATION.md) | crates.io/npm ownership, credentials, ordered publication, explicit deferral, and clean-consumer evidence | Living policy |
| [`DATA-LIFECYCLE.md`](DATA-LIFECYCLE.md) | Retention classes, legal-hold authority, primary deletion, backup expiry/restore, tombstones, audit events, operator commands, and maturity boundary | Living operating contract |
| [`THREAT-MODEL.md`](THREAT-MODEL.md) | Assets, actors, trust boundaries, auth/secrets/network/input/object/worker/archive controls, negative-test matrix, deployment checklist, and residual risks | Living security contract |
| [`DEBUGGING.md`](DEBUGGING.md) | Failure routing, evidence preservation, reproduction, redaction, and safety escalation | Living runbook |
| [`BROWSER-SUPPORT.md`](BROWSER-SUPPORT.md) | Full-Studio/viewer-grade policy, accessibility and keyboard contract, engine matrix, evidence commands, and claim limits | Living; required-CI evidence contract |
| [`TRADEMARK-SEARCH.md`](TRADEMARK-SEARCH.md) | Dated exact-name search evidence and remaining legal-clearance boundary | Living governance evidence |
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
