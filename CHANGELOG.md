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

## 2026-06-12 — PRE-002 executed: prototype delivered, frozen, oracle extracted
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** pre-P0/P0 · **TODO items:** PRE-002, P0-004 (oracle side), P0-008 (counts), P0-010
**Done:** The owner delivered `cad-object-studio.html` (50,967 bytes, sha256
`ca93489e…`). Searched first (TTC refs/tags, all 45 owner repos by name and code
content — zero hits; recorded). Committed **byte-exact** at
`prototype/cad-object-studio.html`, tagged **`prototype-final`**. Built the
extraction harness (`scripts/extract-counts.mjs`): slices the monolith's pure
builder segment into a Node vm sandbox (read-only) and replicates `loadModel`'s
reset+build+count core. **Oracle numbers extracted** →
`prototype/extracted-counts.json`: hrx7 humanoid **125 parts · 2195 faces ·
2581 vertices · 20 nodes · 15 chains**; fpv VX-2 **73 parts · 924 faces · 1250
vertices · 14 nodes · 13 chains**. Byte-equivalence comparator ready
(`scripts/compare-counts.mjs`). **Vintage finding (recorded in
prototype/README.md):** this is the pre-configurator build — N/P registry,
chains, gait+IK (L1=L2=0.39, Appendix-C verbatim), FPV mixer, servos (ω 14–16,
ζ 0.8–0.85), blueprint/jog/click-to-move are all present; slots/variants/ports/
bellows/squircle/harness (the plan's ~83 KB audit) are not. P0-007 (31 variants)
stays gated on the later build or a re-scope decision; everything else
prototype-gated is now **unblocked** (P0-005/006 translations, P1-006/007/015).
**Changed:** `prototype/` (monolith + README + extracted-counts.json),
`scripts/extract-counts.mjs`, `scripts/compare-counts.mjs`, CLAUDE.md §2,
TODO (blocker resolved; P0 items re-stated), ROADMAP (P0 ⛔→◑).
**Decisions:** none new (vintage re-scope of P0-007 awaits the owner's answer on
whether the configurator build exists).
**Next:** P0-005/006 — translate hrx7 + fpv from the frozen source into
`ModelSpec` JSON and drive `compare-counts` to byte-equivalence; then extend
extraction to record gait/flight trajectories (golden-number corpus, P1-006).
**Blockers:** none critical. Open question to the owner: does the later ~83 KB
configurator monolith (31 variants/11 slots/harness) exist?

## 2026-06-12 — Boundary frozen; P2 quadruped family; in-browser core; exporters
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P0/P1/P2 interleaved (D21) · **TODO items:** P0-009, P1-004/005/009/010/011/012/017, P2-001/003/004/005, P3-009/010, P4-005 (core path), P6-008, XC-04, XC-06
**Done (all verified: 66 Rust tests, clippy -D clean, studio+gateway builds, 6
gateway tests, 12 worker tests):**
**Core boundary FROZEN v1 (P0-009)** — all four calls live: `patch` (RFC-6902
subset with shape gate, in `forge-contract`), `tick` (`CoreSession`: fixed-step
120 Hz accumulator, multirotor spinner kinematics, rover/quadruped body+joint
poses, bit-deterministic under uneven dts — tested), alongside bake/validate.
**P2 substantially delivered** — quadruped driver (trot phase gait, per-leg IK,
diagonal pairing, hip_/knee_/foot_ chain discovery); typed driver-param schemas
(schemars) for multirotor/rover/quadruped with new check CTR-008; **`forge-gen
quadruped`**: slider params → admitted, walking contracts with zero hand-written
code, grid-tested at 2/3/4 leg pairs (P2 exit criterion); demo committed as
`examples/qd-mini.forge.json` (Admitted, 0/0).
**In-browser core (D17 made real)** — wasm-pack builds the facade into the studio
(committed pkg, **275 KB gz vs ≤ 2 MB budget**); the studio now validates and
bakes dropped `.forge.json` files locally (same bits as CI), and **Drive mode
ticks the core in-browser** (spinners spin, the quadruped walks). Studio also
gained: blueprint mode v0, raycast selection + info panel, explode leader lines,
model picker, fps overlay.
**Pull-forwards** — MJCF/URDF exporters v0 with per-node mass/COM/inertia from
baked meshes, Y-up→Z-up conversion, joints/limits/actuators + golden fixtures
(XC-04); thrust-table bilinear interpolation with table-over-estimate precedence
(XC-06); BOM v0 (`forge-validate bom`); gateway `/v1/bake` + `/v1/schema`.
**Changed:** `crates/*` (patch.rs, session.rs, quadruped.rs, params.rs,
thrust_table.rs, export.rs, forge-gen new), `packages/studio/*` (wasm.ts,
scene/store/App rewrites, wasm-pkg committed), `packages/gateway/*`,
`examples/qd-mini.forge.json` + demo artifacts, `scripts/build-wasm.sh`,
docs/TODO/ROADMAP/validation-harness/core-runtime.
**Decisions:** none new (all under D21's recorded scope).
**Next:** PRE-002 still the highest-value unlock. Independent: P1-014 configurator
pane via the patch path; P1-016 AO/quality tiers; P2-002 draft persistence;
P2-007 napi-rs measurement; zero-copy facade views.
**Blockers:** PRE-002 (unchanged).

## 2026-06-12 — Fix PR #1 CI: pnpm version double-pin
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P0/P1 (D21) · **TODO items:** none
**Done:** PR #1's "studio + gateway" check failed in setup: `pnpm/action-setup@v4`
errors when the workflow pins `version: 10` while `package.json` carries
`packageManager: pnpm@10.33.0`. Removed the workflow pin (packageManager is the
single source). Rust core and Python workers jobs were already green on the runner.
**Changed:** `.github/workflows/ci.yml`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Merge PR #1 to `main` once all three checks are green (owner instruction),
then PRE-002 as before.
**Blockers:** PRE-002 (unchanged).

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
