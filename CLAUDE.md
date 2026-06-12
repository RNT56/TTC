# CLAUDE.md — FORGE agent entry point

> **Start here.** This file is the single source of truth for *how to work in this
> repository*. Read it top to bottom before touching anything. Every working session —
> human or AI agent — ends by appending an entry to [`CHANGELOG.md`](CHANGELOG.md) and
> updating any roadmap/TODO checkboxes the session affected. **No exceptions.**

---

## 1. What this project is

**FORGE** (working codename — *Fabricate · Operate · Rehearse · Generate · Export*; the
repository name `TTC` = text-to-CAD) is a robotics studio that closes the loop:

> **describe → assemble → verify → rehearse → deploy → evolve**

A user describes a machine in natural language; Claude (Anthropic API) generates a
schema-constrained, physically parameterized, animated 3D model; the user swaps in real
purchasable components with exact geometry, mass, and electrical properties; the studio
verifies the build (compatibility, thrust-to-weight, hover throttle, endurance — all
derived, never decorative) and simulates it; reinforcement-learning policies train
against the digital twin under domain randomization; the BOM and the trained behavior
deploy to the physical machine through a safety-gated ladder — and real telemetry flows
back to tighten the twin.

**Positioning (D18): upstream of CAD.** FORGE is not mechanical CAD and does not
compete with geometry kernels. Its bar is **mass-properties-correct over
surface-exact**; STEP export is first-class so mechanical CAD consumes FORGE's output.
Non-goals: GD&T, surfacing, tooling, certified-aerospace workflows.

**Runtime (D16): Rust core, web face.** Everything that must be *correct* — contract,
geometry, motion, sim models, validator — is Rust (`forge-core` crates), dual-compiled
to native and WASM so the same bits judge a model everywhere (D17). Everything that
must be *seen* — React UI, Three.js render layer, gateway — is TypeScript. Everything
that must be *trained* is Python.

**Governing doctrine — "not a toy":** SI units everywhere; masses computed or sourced,
never invented; compatibility checked, not assumed; every HUD claim derived from an
inspectable model; manufacturability as an export target; a **sovereign validator**
that gates every artifact; provenance on everything. The full doctrine is binding — see
[`docs/BEST-PRACTICES.md`](docs/BEST-PRACTICES.md) §1.

## 2. Project status

| Fact | State |
|---|---|
| Lifecycle | **v0 implementation live on all surfaces** (owner re-order D21, 2026-06-12); P0/P1 exit criteria partially met — see ROADMAP |
| Binding plan | [`docs/FORGE-plan.md`](docs/FORGE-plan.md) (**v3.0, definitive**) |
| Current phase | **P0/P1 (interleaved under D21)** — live status in [`docs/ROADMAP.md`](docs/ROADMAP.md) |
| Code in repo | Rust core (`crates/forge-*`: contract, geometry, motion, sim, validate, wasm facade — 40 tests), studio + gateway (`packages/*`), Python workers (`workers/`, 12 tests), CI, catalog migration. Demo: `examples/vx2-mini.forge.json` (admitted; AUW 479 g · TWR 4.70 · hover 43 %). Quickstart: `cargo run -p forge-validate -- run examples/vx2-mini.forge.json` |
| Critical blocker | The prototype **`cad-object-studio.html`** is the executable specification **and the parity oracle** (P0 byte-equivalence, P1 golden numbers) but is **not in this repository**. P0-005..008/010, P1-006/007/015 stay blocked until it is committed. Tracked as `PRE-002` in [`docs/TODO.md`](docs/TODO.md). |

## 3. Source-of-truth hierarchy

When documents disagree, this is the order of authority:

1. **[`docs/DECISIONS.md`](docs/DECISIONS.md)** — the binding decision record (D1–D20+).
   Decisions are only changed by recording a superseding decision, never by silent edits.
2. **[`docs/FORGE-plan.md`](docs/FORGE-plan.md)** — the v3.0 plan: positioning, runtime
   architecture, strategy, engines, roadmap, risk register, appendices.
3. **`docs/systems/*.md`** — implementation-level docs per system. These *expand* the
   plan into engineering detail; where they go beyond it they are marked *(proposed)*.
4. **[`docs/ROADMAP.md`](docs/ROADMAP.md) / [`docs/TODO.md`](docs/TODO.md)** — live
   execution state.
5. [`docs/FORGE-plan-v2.md`](docs/FORGE-plan-v2.md) and
   [`docs/FORGE-vision-and-architecture.md`](docs/FORGE-vision-and-architecture.md) —
   **v2.0 and v1.0, historical**. Superseded by v3.0; consult only for background.

## 4. Repository map

```
TTC/
├── CLAUDE.md                          ← you are here (agent entry point)
├── CHANGELOG.md                       ← session-by-session progress log (mandatory)
└── docs/
    ├── README.md                      ← documentation index & reading order
    ├── FORGE-plan.md                  ← THE PLAN (v3.0, definitive, binding)
    ├── FORGE-plan-v2.md               ← v2.0 (frozen, historical)
    ├── FORGE-vision-and-architecture.md  ← v1.0 (frozen, historical)
    ├── ROADMAP.md                     ← phases P0–P12, exit criteria, live status
    ├── TODO.md                        ← every open task, all surfaces, with IDs
    ├── DECISIONS.md                   ← decision record + how to add decisions
    ├── BEST-PRACTICES.md              ← doctrine, conventions, code & test standards
    ├── GLOSSARY.md                    ← project vocabulary
    ├── architecture.md                ← runtime split, repo layout, stack, budgets
    ├── security-safety-legal.md       ← security model, legal gates, license matrix
    ├── risk-register.md               ← risks, mitigations, monitoring triggers
    └── systems/                       ← implementation-level docs (one per system)
        ├── core-runtime.md            ← forge-core: boundary API, port plan, golden numbers
        ├── model-contract.md          ← Contract v2.1 schema (the heart of the system)
        ├── validation-harness.md      ← forge-validate: check catalog, diagnostics
        ├── geometry-engine.md         ├── render-engine.md
        ├── motion-engine.md           ├── simulation-engine.md
        ├── learning-engine.md        ├── generation-pipeline.md
        ├── component-database.md      ├── studio-ui.md
        ├── gateway-and-data.md        ├── compute-workers.md
        ├── hardware-bridge.md         ├── co-design.md
        ├── environments-courses.md    └── platform.md
```

Code layout (scaffolded 2026-06-12, D21): cargo workspace `crates/{forge-contract,
forge-geometry, forge-motion, forge-sim, forge-validate, forge-wasm}` beside pnpm
packages `packages/{studio, gateway}`, Python `workers/`, `schema/` (emitted JSON
Schema — the codegen source), `examples/`, `infra/` (compose + migrations), and
`.github/workflows/ci.yml`. `desktop/` (Tauri) arrives at P8. See
[`docs/architecture.md`](docs/architecture.md) §3.

## 5. Session protocol — how to pick up work

Follow this every session, in order:

1. **Read this file** (you are doing it).
2. **Read the top of [`CHANGELOG.md`](CHANGELOG.md)** — the most recent entries tell
   you exactly where the last session stopped, what is in flight, and any blockers.
3. **Check [`docs/ROADMAP.md`](docs/ROADMAP.md)** — identify the current phase and its
   unmet exit criteria.
4. **Pick work from [`docs/TODO.md`](docs/TODO.md)** — prefer the current phase's open
   items and anything marked **blocker**. Mark the item `[~]` (in progress) with the
   date when you start.
5. **Read the relevant `docs/systems/*.md`** before writing code in that area, plus
   [`docs/BEST-PRACTICES.md`](docs/BEST-PRACTICES.md) once per session.
6. **Do the work.** Keep changes scoped; follow conventions; tests and harness checks
   accompany features, not follow them.
7. **Update the docs you invalidated** — system docs, ROADMAP checkboxes, TODO states.
   If you made a decision of consequence, record it in `docs/DECISIONS.md`.
8. **Append a `CHANGELOG.md` entry** (format in §6 below).
9. **Commit and push** with a clear message (conventions in BEST-PRACTICES §9).

If you are blocked, *say so in the changelog entry* — the next agent inherits your
state, not your context window.

## 6. Changelog discipline (mandatory)

`CHANGELOG.md` is the project's memory between sessions. Append a new entry at the
**top** of the log section at the end of every working session, even for small or
failed sessions ("attempted X, abandoned because Y" is valuable). Format:

```markdown
## 2026-06-12 — Short imperative title
**Session:** <agent/human name or branch> · **Phase:** <e.g. P0> · **TODO items:** <IDs>
**Done:** What was actually completed (verified, not intended).
**Changed:** Files/areas touched.
**Decisions:** Any new/changed DECISIONS.md entries, or "none".
**Next:** The single most useful next step for whoever picks this up.
**Blockers:** Anything stopping progress, or "none".
```

Rules: newest first; never rewrite or delete prior entries (append corrections
instead); reference TODO IDs so state is traceable; keep it factual — the changelog
records what *is*, the TODO records what *should be*.

## 7. Non-negotiables

These come from the plan's doctrine and decision record. Violating them is never a
judgment call:

1. **SI units everywhere** — meters, kilograms (grams at schema surface), newtons,
   volts, ampere-hours, radians, seconds. Y-up, right-handed, meters internally.
2. **No invented physics** — mass/inertia from geometry × density or from datasheets,
   with citations. HUD numbers are derived from stated models.
3. **The validator is sovereign** — nothing enters the registry, marketplace, or
   training queue without passing `forge-validate`. Agents do not bypass, weaken, or
   special-case gatekeeper checks to make work pass; fix the work.
4. **No code in contracts** (D19) — models are JSON documents;
   behavior comes from versioned engine libraries parameterized by data. The only
   future exception is the sandboxed-WASM controller path, post-P7, design-reviewed.
5. **Truth lives in the core** (D16/D17) — physics, geometry, motion, and validation
   logic belong in the Rust core crates, never re-implemented in TypeScript; no
   fast-math in core; cross-target bit-exactness is guarded by the golden-number
   suite.
6. **No weapons** — no targeting systems, munition payloads, or interdiction modules
   in catalog, generation, or marketplace. Briefs in that direction are refused and
   the refusal is logged.
7. **Provenance everywhere** — generated artifacts carry model versions, prompt
   hashes, seeds, validator reports; policies carry training lineage.
8. **Decisions are recorded, not drifted** — deviating from `docs/DECISIONS.md` or the
   plan requires a new decision entry with rationale, ideally confirmed with the
   project owner.
9. **Licenses are honored** — every catalog asset carries a license class; the export
   matrix (security doc §4) is enforced by construction.
10. **The deployment ladder is never skipped** — SITL → HITL → constrained reality →
    free operation; the bridge never auto-arms anything.
11. **Pin volatile externals at implementation time** — Anthropic model strings,
    limits, and pricing from https://docs.claude.com/en/api/overview; do not hardcode
    from memory or from the plan.

## 8. Engineering quick reference

- **Runtime split (D16):** Rust `forge-core` workspace (`forge-contract`,
  `forge-geometry`, `forge-motion`, `forge-sim`, `forge-validate`) dual-targeted
  native + WASM (facade ≤ 2 MB gz); TypeScript face (React 19 + Zustand, Three.js as
  a thin consumer of core-baked buffers, Fastify gateway that spawns the
  `forge-validate` binary); Python 3.12 compute workers (MuJoCo/MJX, SB3, TRELLIS,
  OCCT, ETL); Postgres 16 + pgvector + graphile-worker; S3-compatible storage.
  Full table: [`docs/architecture.md`](docs/architecture.md) §4.
- **The schema's single source is Rust** — `forge-contract` emits JSON Schema via
  schemars; TS types are codegen'd from it. Never hand-mirror types.
- **One validator everywhere (D17):** static binary + npm WASM + crate, bit-exact;
  golden-number suite in CI on every core change.
- **Two physics engines is intentional (D20):** Rapier interactive, MuJoCo canonical
  for training; parity suite on every engine/exporter upgrade.
- **Surfaces (D15):** browser is primary, permanently; **FORGE Desktop (Tauri) ships
  at P8** as the bridge/power surface; Firefox/Safari/iOS viewer-grade by declaration.
- **Performance budgets** are binding acceptance criteria, not aspirations:
  [`docs/architecture.md`](docs/architecture.md) §7.
- **Validation:** check IDs and diagnostic format in
  [`docs/systems/validation-harness.md`](docs/systems/validation-harness.md).

## 9. Roadmap at a glance

Live status and full exit criteria: [`docs/ROADMAP.md`](docs/ROADMAP.md).

| Phase | One-liner | Status |
|---|---|---|
| Pre-P0 | Repo hygiene, prototype committed, scaffold prerequisites | ◑ in progress |
| P0 | Freeze monolith; contract schema in `forge-contract` (schemars); translate both models; cargo+pnpm scaffold; core boundary frozen | ○ |
| P1 | **Core & studio**: Rust port with harness as parity oracle; WASM facade; Three.js studio; **shimmer gone**; golden numbers green | ○ |
| P2 | Validator productized; driver library; quadruped generator | ○ |
| P3 | Component DB, compatibility, proof pair, reference rigs | ○ |
| P4 | Text-to-CAD GA: orchestrator, drafts, share URLs, BYO key, Brief-25 | ○ |
| P5 | Image → 3D: TRELLIS workers, primitive refit, alignment UI | ○ |
| P6 | Simulation depth; MJCF/URDF exporters **and importer**; parity suite | ○ |
| P7 | Training service: tasks, PPO/SAC, scorecards, in-browser playback | ○ |
| P8 | **Bridge + Desktop**: WebSerial, recorder + ghost, FORGE Desktop (Tauri), FORGE Link; ToS review gate | ○ |
| P9 | Co-design optimizer (CMA-ES/BO, multi-fidelity, Pareto front) | ○ |
| P10 | Environments, courses, leaderboards | ○ |
| P11 | Platform: marketplace, skills, classroom, print ordering | ○ |
| P12 | Maintenance twin: wear, crash forensics, repair sheets | ○ |

Legend: ○ not started · ◑ in progress · ● done. **Phases close only when every exit
criterion is checked in ROADMAP.md and the changelog records it.** Schedule honesty
(v3.0): the Rust core moves the wedge (end of P4) to ~16–21 weeks — paid once, with
the oracle watching; later phases get cheaper for it.

## 10. What NOT to do

- Do not start coding a phase before its predecessor's exit criteria are met (or the
  owner explicitly re-orders — record it as a decision).
- Do not edit the frozen planning papers — `docs/FORGE-plan.md` (v3.0),
  `docs/FORGE-plan-v2.md`, `docs/FORGE-vision-and-architecture.md`. Changes of
  substance go through `docs/DECISIONS.md` and the living docs.
- Do not re-implement core-crate logic in TypeScript or Python "temporarily" — the
  core boundary (architecture §2) is where truth lives; the sanctioned fallback for a
  lagging crate is a decision entry, not a quiet shadow implementation.
- Do not introduce fast-math, platform-specific float paths, or non-determinism into
  core crates (D17).
- Do not duplicate content across docs — link to the owning doc instead. One fact,
  one home.
- Do not leave a session without a changelog entry, even for exploratory or failed
  work.
- Do not invent component data, masses, thrust figures, or prices — datasheets and
  citations or nothing (placeholder values must be marked `TODO` and gated from
  admission).
- Do not weaken a failing validator check to green a build.
- Do not add a dependency, service, or language outside the decided stack without a
  decision entry (the stack is deliberately boring everywhere but one place — and
  that one, the Rust core, is decided).
