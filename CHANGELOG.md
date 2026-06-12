# CHANGELOG

This file is the project's memory between working sessions. **Every session — human or
AI agent — appends an entry here before it ends.** Newest entries first. Never rewrite
or delete prior entries; append corrections as new entries instead.

Entry format (see [`CLAUDE.md`](CLAUDE.md) §6 for the rules):

```markdown
## YYYY-MM-DD — Short imperative title
**Session:** <agent/branch> · **Phase:** <Px / pre-P0> · **TODO items:** <IDs or none>
**Done:** What was actually completed (verified, not intended).
**Changed:** Files/areas touched.
**Decisions:** New/changed DECISIONS.md entries, or "none".
**Next:** The single most useful next step for whoever picks this up.
**Blockers:** Anything stopping progress, or "none".
```

---

## 2026-06-12 — v0 end-to-end build: all surfaces implemented and green
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P0/P1 interleaved (owner re-order, D21) · **TODO items:** P0-001..004, P0-009, P1-001..005, P1-008/009/011/013, XC-01, PRE-004 (partial)
**Done:** Implemented the v0 system end to end, all verified locally:
**Rust core** (40 tests, clippy -D clean, fmt clean) — `forge-contract` (full v2.1
types, schemars emission, Appendix-A round-trip, contract/lockfile hashing, lockfile
resolver); `forge-geometry` (all 7 primitive builders with byte-stable bake,
signed-tetrahedra mass properties verified vs analytic solids ≤0.1%, node world
transforms, AABB interference v0); `forge-motion` (closed-form 2-bone IK verified by
FK round-trip, critically damped servos stable at dt=50ms, quad mixer with symmetry
tests, multirotor/rover drivers, constraint clamps); `forge-sim` (propulsion with
fixed-point battery sag, momentum-theory power, complementary estimator with
deterministic seeded noise, HUD derivation with inspectable assumptions, replay
header); `forge-validate` (14 live checks, machine-readable diagnostics, report
envelope, CLI run/bake/schema, exit codes, D14 draft flag); `forge-wasm` facade
(validate/bake/schema; compiles to wasm32-unknown-unknown).
**TS face** — studio (Vite/React 19/Zustand/Three.js viewer consuming core-baked
buffers zero-math: PBR five-class mapping, IBL-lite rig, staged explode slider, HUD
panel with assumptions, validator report panel; tsc+vite build green); gateway
(Fastify+TypeBox, spawns the validator binary per D17, 4 tests incl. live
admit/reject round-trips). **XC-01**: `pnpm codegen:contract` generates TS types from
the emitted schema; CI fails on drift. **Python workers** (12 tests): schema
validation against the emitted artifact (cross-language contract proven), job
registry, scorecard gate (estimator smoke D8 + thresholds + PRV-002 lineage), ETL
citation gate (per-field citations, D10 license non-optional, review queue floor).
**Infra**: GitHub Actions CI (core/face/workers jobs), docker-compose (pgvector
Postgres), `infra/migrations/0001_catalog.sql` (full catalog DDL incl. immutable
`component_revisions`). **Demo**: `examples/vx2-mini.forge.json` (16 parts,
synthetic, clearly labeled) — **Admitted**, 0 errors/0 warns; HUD: AUW 479 g, TWR
4.70, hover 43 %, endurance 21.8 min.
**Changed:** `Cargo.toml`, `crates/*` (6 crates), `package.json`,
`pnpm-workspace.yaml`, `pnpm-lock.yaml`, `scripts/codegen-contract.mjs`,
`packages/studio/*`, `packages/gateway/*`, `workers/*`, `schema/`, `examples/*`,
`infra/*`, `.github/workflows/ci.yml`, `.gitignore`; docs state: CLAUDE.md §2/§4,
ROADMAP (pre-P0/P0 checks), TODO (P0/P1 states), DECISIONS (D21),
architecture §3, validation-harness (v0 state note).
**Decisions:** **D21** — owner-ordered start ahead of PRE-002; consequences recorded
(synthetic fixture ≠ translation; *(proposed)* parameterizations reconcile at
PRE-002; oracle parity still gates P1).
**Next:** PRE-002 remains the single highest-value step — committing the prototype
unblocks P0-005..008/010 (translations + byte-equivalence) and P1-006/007/015
(golden numbers, bit-identical verification, parity gallery). Independent of it:
P1-005 zero-copy facade views + tick/patch, BatchedMesh batching (P1-008), blueprint
mode (P1-010).
**Blockers:** PRE-002 (prototype absent). Python here is 3.11 (plan says 3.12 — CI
uses 3.12; workers require ≥3.11, no code impact).

## 2026-06-11 — Plan v3.0 adopted: Rust core / web face; docs suite upgraded
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** pre-P0 · **TODO items:** PRE-006
**Done:** Adopted the owner-provided plan v3.0 as the binding plan and propagated it
through the entire documentation system. Headline changes: runtime settled as **Rust
core, web face** (D16 — `forge-core` crates dual-compiled native+WASM; TS face;
Python compute); **FORGE Desktop (Tauri) scheduled at P8** (D15, subsumes old D11);
**one validator everywhere, bit-exact, golden-number suite** (D17, supersedes D6);
positioning settled **upstream of CAD** with the R1–R4 success ladder (D18). Archived
v2.0 as `docs/FORGE-plan-v2.md`; installed v3.0 at `docs/FORGE-plan.md`. Rewrote
CLAUDE.md, ROADMAP (new P0/P1/P8 scope+criteria, 16–21 wk wedge), TODO (P0/P1/P8
restructured for the port and Desktop; XC-26 golden-number suite, XC-27 Tauri
plugins; OD-02 resolved by D16; OD-08 napi-rs-vs-binary added), DECISIONS (D1–D18
per plan; prior derived D15/D16 renumbered **D19/D20**; next free ID D21),
architecture (runtime split, core boundary, crates/ layout, new budgets),
risk-register (R12 Rust-port cost, R13 float divergence). Added
`docs/systems/core-runtime.md` (boundary API, port-with-oracle plan, golden-number
suite). Updated all 16 existing system docs (crate homes, D-renumbering, D17
replay/leaderboard semantics, Desktop in hardware-bridge, schemars as schema source,
tier-0 native co-design), BEST-PRACTICES (Rust standards, codegen direction,
determinism rules, testing pyramid), GLOSSARY (new terms), README, security doc.
**Changed:** `CLAUDE.md`, `CHANGELOG.md`, `docs/FORGE-plan.md` (new v3.0),
`docs/FORGE-plan.md → docs/FORGE-plan-v2.md` (rename), all living docs, all
`docs/systems/*.md` (+ new `core-runtime.md`).
**Decisions:** v3.0 record adopted: D15–D18 new; D6 superseded by D17; D11 subsumed
by D15; this file's prior D15/D16 renumbered to D19/D20 to clear the collision.
**Next:** Unchanged and now doubly important — PRE-002: commit the prototype; it is
both the byte-equivalence reference (P0) and the parity oracle for the Rust port
(P1). Then P0-001: author the contract schema as Rust types in `forge-contract`.
**Blockers:** PRE-002 — the prototype monolith is still absent from the repository.

## 2026-06-11 — Documentation system established
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** pre-P0 · **TODO items:** PRE-001
**Done:** Created the full documentation system from the v2.0 plan: `CLAUDE.md` agent
entry point (source-of-truth hierarchy, session protocol, non-negotiables), this
changelog, and the `docs/` suite — README index, ROADMAP (P0–P12 with exit-criteria
checkboxes), TODO (all tasks across all surfaces with stable IDs), DECISIONS (D1–D16
record + process), BEST-PRACTICES, GLOSSARY, architecture, security-safety-legal,
risk-register, and 16 implementation-level system docs under `docs/systems/`
(contract, validation harness with a proposed check-ID catalog and diagnostic format,
five engines, generation pipeline, component DB, studio UI, gateway/data, compute
workers, hardware bridge, co-design, environments/courses, platform).
**Changed:** `CLAUDE.md`, `CHANGELOG.md`, `docs/README.md`, `docs/ROADMAP.md`,
`docs/TODO.md`, `docs/DECISIONS.md`, `docs/BEST-PRACTICES.md`, `docs/GLOSSARY.md`,
`docs/architecture.md`, `docs/security-safety-legal.md`, `docs/risk-register.md`,
`docs/systems/*.md` (16 files). The two FORGE planning papers are untouched and frozen.
**Decisions:** None new. Implementation details beyond the plan (check-ID scheme,
diagnostic JSON shape, route/job/package naming) are marked *(proposed)* in the system
docs and await confirmation at implementation time.
**Next:** Resolve PRE-002 — obtain `cad-object-studio.html` (the prototype / executable
specification) from the project owner and commit it; P0's byte-equivalence exit
criterion is impossible without it. Then begin P0: author the contract JSON Schema
(`P0-001`).
**Blockers:** PRE-002 — the prototype monolith is referenced everywhere but absent
from the repository.

## 2026-06-11 — FORGE planning docs added
**Session:** project owner (commit `3148dd2`) · **Phase:** planning · **TODO items:** none
**Done:** Initial commit: `docs/FORGE-vision-and-architecture.md` (v1.0 planning paper)
and `docs/FORGE-plan.md` (v2.0, decisions-complete — the binding plan). Repository
otherwise empty; no code exists yet.
**Changed:** `docs/`, `.gitignore`.
**Decisions:** D1–D14, D-r1, D-evals recorded inside the v2.0 plan §21.
**Next:** Stand up the documentation/working system (done in the entry above).
**Blockers:** none recorded.
