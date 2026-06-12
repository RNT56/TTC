# BEST PRACTICES — doctrine, conventions, standards

Binding on all contributors, human or agent. Where this file and
[`DECISIONS.md`](DECISIONS.md) overlap, decisions win.

## 1. Doctrine — "not a toy" (plan §1.3, binding)

1. **SI units everywhere.** Meters, kilograms, newtons, volts, ampere-hours, radians,
   seconds. Schema surface uses grams for mass (kg internally).
2. **Mass and inertia are computed or sourced, never invented** — geometry × material
   density for generated parts; datasheets (with citations) for catalog parts.
3. **Compatibility is checked, not assumed** — mount patterns, voltage windows,
   current budgets, prop clearance, torque margins.
4. **Every HUD claim derives from a stated model** with inspectable assumptions.
5. **Manufacturability is an export target** — STEP/3MF with DfM checks; BOMs name
   real SKUs.
6. **The validator is sovereign** — nothing enters registry, marketplace, or training
   queue without passing. Never weaken a check to green a build.
7. **Provenance everywhere** — origin chains on contracts, components, policies,
   deployments.

## 2. Units, coordinates, conventions (plan §3.2)

- Internal coordinates: **Y-up, right-handed, meters** (matches prototype and
  Three.js). Exporters convert to Z-up for URDF/MJCF/STEP.
- Angles in **radians**; time in **seconds**; masses in **grams at the schema
  surface**, kilograms internally; gravity default 9.80665 m/s², air density 1.225
  kg/m³ — but always from the contract's `env` block, never ambient constants.
- Geometry-meets-manufacturing tolerance: **±0.1 mm default**, explicit tolerance
  fields where it matters.
- Fixed timesteps: motion 120 Hz, physics substeps 240 Hz, render-interpolated.
- **Determinism is a feature (D17):** no fast-math or platform-float flags anywhere
  in core crates; deterministic iteration order on any path that reaches an output;
  the golden-number suite guards native↔WASM bit-exactness.
- Naming: schema/JSON keys `camelCase`; Rust `snake_case`/`CamelCase` per rustfmt;
  SQL `snake_case`; check IDs `CAT-NNN` (validation doc); TODO IDs as established;
  semver everywhere a version appears.

## 3. Data, not code (D19)

- A model is a JSON document. Behavior lives in versioned engine libraries
  parameterized by the document. PRs adding executable semantics to contract data are
  rejected on principle.
- Engine libraries are versioned; contracts reference them by name + version range.
- The WASM user-controller escape hatch is post-P7 and requires a sandbox design
  review (OD-04) — do not build it early.

## 4. Validation discipline

- **Checks accompany features.** A feature that introduces an invariant ships with
  the harness check that enforces it, registered in the check catalog
  ([`systems/validation-harness.md`](systems/validation-harness.md)).
- Every contract write runs the harness: CI for first-party, admission for generated,
  publish for marketplace, re-validation on lockfile upgrades.
- Failures must be **machine-readable diagnostics** (stable check ID, subject,
  observed value, limit, hint) — the generation repair loop consumes them.
- Never special-case a model to pass; fix the model or (with a decision entry) the
  check.

## 5. Code standards

**Rust (core crates — where truth lives, D16):** the gentle kind — math and data
structures over flat buffers; **no async, no DOM, no I/O** (only `forge-validate`'s
CLI does I/O, native-only); no fast-math (D17); `clippy` + `rustfmt` clean;
`#![forbid(unsafe_code)]` outside the facade's view plumbing *(proposed)*; the
contract types carry serde + schemars derives — **the schemars-emitted JSON Schema is
the single source**, all other languages derive from it; every ported formula lands
with a differential test against the JS oracle and membership in the golden-number
corpus.

**TypeScript (studio, gateway):** `strict: true`, no `any` outside typed boundaries;
contract types **codegen'd from the schemars output** — never hand-mirrored; no
geometry/physics math in TS (it belongs in core; the render layer consumes baked
buffers zero-copy); no per-frame allocation in render-path code; React only in
`studio`.

**Python (compute workers):** 3.12; queue-driven, idempotent jobs (safe to retry);
no public network surface; pinned dependencies; payloads validated against the
emitted JSON Schema; every job logs structured progress and writes results to object
storage + Postgres transactionally.

**General:** small modules with explicit public APIs; pure functions for geometry and
math (testable headlessly); deterministic seeds threaded through anything stochastic;
comments only for constraints the code cannot show.

## 6. Testing pyramid

1. **Unit** — math, geometry, schema validators (mass properties vs analytic solids,
   IK closed forms, sag model vs bench math).
2. **Differential (port-time)** — Rust output vs the JS oracle for every ported
   formula; the prototype + harness recordings define "done" (plan §5.4).
3. **Golden** — exporter outputs (MJCF/URDF), render images (perceptual diff),
   extraction fixtures vs the prototype.
4. **Golden-number** — cross-target bit-exactness, native↔WASM, canonical scenes, on
   every core change (XT-001, D17).
5. **Harness** — the full validation suite on every first-party contract, every PR.
6. **Parity** — Rapier vs MuJoCo on canonical scenes on every engine/exporter bump
   (training side canonical, D20).
7. **Regression** — physics trajectory tolerance bands; minimized fuzz failures
   become permanent cases (XC-24).
8. **Brief-25** — generation quality as CI with a metrics dashboard (D-evals).

A red harness blocks merge. Flaky tests are bugs, not noise.

## 7. Performance budget discipline

Budgets ([`architecture.md`](architecture.md) §7) are acceptance criteria — including
the core's: facade ≤ 2 MB gz, bake ≤ 60 ms, patch re-bake ≤ 10 ms, core tick
≤ 1.5 ms, incremental validate < 150 ms. Changes to hot paths land with before/after
numbers against the budget. Degradation is handled by the quality-tier ladder (AO
off → shadow res → pixel ratio), never by silently blowing the frame budget. State
the surface tiers (D15: Chromium floor for the full web studio; viewer-grade
elsewhere; Desktop for the bridge) in any user-facing capability claim.

## 8. AI usage discipline

- **Model tiers:** frontier (Fable-5 class) for full synthesis and repair reasoning;
  smaller tiers (Sonnet/Haiku class) for edits, classification, ETL extraction; Batch
  API for catalog ingestion. BYO key honored throughout (D3).
- **Pin at implementation:** model strings, context limits, pricing from
  https://docs.claude.com/en/api/overview — never from memory or from the plan; record
  the pin in DECISIONS.
- **Schema-constrained output only** for generation (tool use with the
  schemars-emitted JSON Schema enforced — the same artifact the core is built from);
  bounded self-repair (≤ 3 iterations) against machine diagnostics; then draft
  fallback (D14).
- **Prompt caching** for the schema + engine-doc prefix; multi-pass emission to keep
  each output small and checkable.
- Every generated artifact carries provenance (model version, prompt hash, seed,
  validator report).

## 9. Git, sessions, and documentation discipline

- **Branches:** work on feature branches (`claude/...` for agent sessions); never
  force-push shared branches; `main` is protected once code lands.
- **Commits:** imperative subject ≤ 72 chars; body explains *why*; reference TODO IDs
  (e.g. `P0-004`) where applicable. Push with `git push -u origin <branch>`.
- **Every session ends with a `CHANGELOG.md` entry** (format in
  [`/CLAUDE.md`](../CLAUDE.md) §6) and updated ROADMAP/TODO checkboxes. This is the
  project's continuity mechanism — treat skipping it as breaking the build.
- **Docs move with code:** a change that invalidates a doc updates the doc in the same
  PR. New invariants → harness check + doc. New decisions → DECISIONS entry.
- The frozen planning papers (`FORGE-plan.md` v3.0, `FORGE-plan-v2.md`,
  `FORGE-vision-and-architecture.md`) are never edited.

## 10. Security & safety basics (full doc: [`security-safety-legal.md`](security-safety-legal.md))

- No code in contracts (D19); future WASM controllers sandboxed and reviewed.
- No weapons content anywhere; refusals logged.
- License classes enforced by the export matrix (D10); ingestion without a license
  record is rejected.
- The deployment ladder is product-enforced; the bridge never auto-arms; supervisor
  authority is absolute (D9).
- Photos: processing rights only; deletion on request; never training data without
  explicit opt-in. Telemetry logs belong to the user; sharing is per-log explicit.
- Legal gates are entry conditions, not afterthoughts: ToS review before P8,
  dual-use check before P11 policy sharing.
