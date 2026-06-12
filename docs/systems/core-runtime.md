# forge-core runtime — boundary, port plan, golden numbers

**Status:** not started · **Phases:** P0 (boundary frozen), P1 (port) · **Home:**
`crates/` cargo workspace *(proposed layout)* · **Plan refs:** §5 (v3.0) ·
**Decisions:** D15, D16, D17

## 1. Purpose

The implementation home of "one implementation of truth, everywhere" (D16): five Rust
crates — `forge-contract`, `forge-geometry`, `forge-motion`, `forge-sim`,
`forge-validate` — dual-compiled to **native** (server binary/CLI, napi-rs, Tauri) and
**WASM** (the browser studio, via a single facade crate). The same bits judge a model
in the studio, in CI, at admission, and on the desktop. This doc owns the boundary
API, the port methodology, and the golden-number suite; per-engine detail stays in
each engine's doc.

## 2. Workspace layout *(proposed)*

```
crates/
├── forge-contract/   # serde types; schemars JSON-Schema emission; lockfile resolver;
│                     # schema versioning + migrations (XC-23). Depends on nothing.
├── forge-geometry/   # primitives → byte-stable bake (flat buffers, smoothing groups);
│                     # massprops; BVH/interference; CSG trait (Manifold native-C / WASM);
│                     # couplers; DfM rules shared with OCCT jobs
├── forge-motion/     # archetype drivers, IK/gait/servos/mixer, constraint layer; 120 Hz tick
├── forge-sim/        # propulsion/battery/estimator models; Rapier world build + step;
│                     # replay tape record/verify
├── forge-validate/   # every check (validation-harness.md), report assembly, CLI
└── forge-wasm/       # the single wasm-pack facade: bake/tick/validate/patch (≤ 2 MB gz)
```

Crate rules: **no DOM, no I/O** (only `forge-validate`'s CLI does I/O, native-only);
**no async**; **no fast-math** or platform-float flags (D17); flat-buffer outputs;
deterministic iteration order everywhere (no HashMap iteration into output paths);
`#![forbid(unsafe_code)]` except in the facade's view plumbing *(proposed)*.

## 3. The core boundary (FROZEN v1 — P0-009, 2026-06-12)

All four calls are live: **bake** and **validate** in the facade + binary;
**tick** as `CoreSession` (fixed-step 120 Hz accumulator, bit-deterministic —
tested); **patch** as RFC-6902-subset JSON-Patch with the shape gate. v1 carries
JSON/copy envelopes; the zero-copy linear-memory views and the ≤ 60 ms bake /
≤ 10 ms patch budget measurements are the P1-005 refinement and may not change
the call shapes.

Four calls, allocation-disciplined, identical across facade (WASM), napi-rs, and the
in-crate API:

```rust
// (proposed signatures — freeze at P0)
fn bake(contract_json: &str) -> BakeResult;          // edit-time only
//   BakeResult exposes views over linear memory: positions/normals (f32),
//   indices (u32), material ids, part table — consumed as Three.js
//   BufferAttributes zero-copy. No per-frame JSON ever.
fn tick(dt: f64, input: &InputFrame) -> TickStatus;  // fixed-step motion/sim advance;
//   writes pose matrices + HUD scalars into a shared region the render
//   layer interpolates from.
fn validate(contract_json: &str, mode: Full | Incremental(checks)) -> Report;
fn patch(json_patch: &str) -> PatchResult;           // applies + re-bakes affected parts
```

Budgets (binding): facade ≤ 2 MB gz · humanoid bake ≤ 60 ms · incremental patch
re-bake ≤ 10 ms · core tick ≤ 1.5 ms inside the frame · incremental validate
< 150 ms.

## 4. The port, de-risked (plan §5.4)

A port of *proven* code with the oracle watching:

- **Oracle #1 — the monolith + harness:** P0-008 instruments the prototype
  (read-only) to record part/face counts and canonical trajectories. The port is
  done when `forge-validate` produces **identical diagnostics** and the golden-number
  suite produces **identical trajectories** against those recordings — "looks right"
  is not a completion criterion.
- **Oracle #2 — the JS implementations:** every formula's existing TS/JS form stays
  available for differential testing during the port.
- **Landing order** (risk mitigation): `forge-contract` → `forge-motion` →
  `forge-geometry` → `forge-sim` → `forge-validate`. Each crate lands green against
  its oracle before the next starts.
- **Fallback (sanctioned):** if a crate lags, ship its TS implementation behind the
  frozen boundary first and swap later — with a DECISIONS entry, never silently.
- The code is math-and-data-structures Rust — no async, no lifetime gymnastics,
  arithmetic over flat buffers. CSG sits behind a trait (Manifold native C API /
  Manifold WASM in-browser); OCCT stays server-side.

## 5. The golden-number suite (XC-26, D17) — LIVE 2026-06-12

Implemented and CI-gated: core-side FNV-1a hashing over exact f32 bit patterns
(bake buffers + 600-step scripted tick streams), compared byte-identical between
the native `forge-golden` binary and the WASM facade, plus time-pinned fixture
hashes. **First run caught a real divergence** (platform libm vs wasm libm ULPs
on lathe angles and pose rotations) — resolved by routing every
non-correctly-rounded transcendental in core through **`forge-num`** (the
pure-Rust `libm` crate: identical bits on every target). IEEE-correctly-rounded
ops (sqrt, arithmetic) stay on std. This is now core policy: new core math uses
`forge_num::{sin,cos,sin_cos,acos,asin,atan2,pow}` — never `f64::` trig — plus
the oracle-compat helpers `forge_num::{hypot,js_round}` (plain-sqrt hypot and
JS `Math.round` tie semantics, both deterministic everywhere).

**Re-pin 2026-06-12 (P1-001):** the tick corpus now exercises the ported
oracle drivers — `CoreSession` drives multirotor through `fpv.rs` and biped
through `biped.rs` with full pose channels (`node_world_posed`). Tick hashes
for vx2-mini/hrx7/vx2-hornet were re-pinned accordingly (qd-mini and **all
bake hashes unchanged**); native ↔ WASM stayed bit-identical on first
comparison after the rewire.

The cross-target exactness gate, run in CI on every core change:

- **Corpus:** canonical scenes (both P0 contracts + minimal synthetic cases per
  subsystem: IK poses, servo steps, mixer frames, propulsion curves, bake outputs).
- **Recordings:** trajectories and buffers captured once from the oracle (P0-008),
  versioned with the corpus.
- **Assertion:** native and WASM outputs are **bit-identical** to each other and to
  the recordings (where the oracle's JS floats allow; divergences from the oracle are
  reviewed and re-recorded with justification — divergence between our own targets is
  never accepted silently).
- **Degradation path:** if a platform breaks exactness, that platform is declared at
  ULP tolerance in the suite's manifest and the docs say so (D17).

## 6. Build & distribution

- **WASM:** one `forge-wasm` facade via wasm-pack → npm package; streaming compile;
  code-split from the studio bundle.
- **Native:** `forge-validate` static binary (the gateway's default integration is
  spawning it — process isolation + bit-equality with CI); napi-rs bindings exist for
  hot paths if P2 measurement says so (OD-08).
- **Crates.io + npm publication** of the open-core artifacts lands with P2's
  validator productization (D2: Apache-2.0).
- **Desktop:** Tauri consumes the same web bundle; native plugins live in
  `desktop/`, not in core ([`hardware-bridge.md`](hardware-bridge.md)).

## 7. Dependencies

`forge-contract` ← everything; Rapier (crate) in `forge-sim`; Manifold behind the
geometry trait; the TS face consumes only the facade/binary; Python validates against
the schemars-emitted schema.

## 8. Testing

Golden-number suite (the centerpiece); per-crate unit tests against closed forms;
differential tests vs the JS oracle during the port; facade size + budget assertions
in CI; determinism lints (clippy + a grep-gate for float-fast flags *(proposed)*).

## 9. Phase mapping & backlog

P0: boundary frozen (P0-009), schema in `forge-contract` (P0-001), scaffold (P0-003),
oracle recordings (P0-008). P1: the port (P1-001..007), facade (P1-005), golden
numbers (P1-006/XC-26). P2: binary/npm/crate packaging (P2-001), napi-rs measurement
(P2-007/OD-08).

## 10. Open questions

Exact facade API freeze details (error model across WASM/napi-rs; shared-region
layout for tick) — settle at P0-009; Manifold WASM vs native build parity for CSG
outputs (golden-number coverage required); whether migrations (XC-23) run in-core or
as a contract-crate helper invoked by hosts.
