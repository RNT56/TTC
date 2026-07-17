# Validation harness (`forge-validate`) — implementation doc

**Status:** productized and released; evolves always · **Phases:** P0 (embryo), P1
(Rust assembly), P2 (productized), P9 (co-design oracle) · **Home:**
`crates/forge-validate` ·
**Plan refs:** §10, Appendix B (v3.0) · **Decisions:** D2, D5, D7, D8, D14, D17,
D59, D-evals

## 1. Purpose

The **sovereign gatekeeper** — and, under D17, **the same bits everywhere**: in-studio
WASM for instant feedback as users edit, a static binary in gateway admission and CI,
a crates.io crate (plus npm package) for anyone embedding it. Nothing —
human-authored, parametric, LLM-generated, or community-submitted — enters the
registry, marketplace, or training queue without passing. At the R2 rung of the
success ladder, *this distribution is the strategy* (D2): any lab, classroom, or CI
pipeline can run the exact gatekeeper FORGE runs. It is also the **repair oracle**:
generation self-repair (P4) and co-design (P9) consume its machine-readable
diagnostics.

## 2. Where it runs

| Trigger | Form | Mode |
|---|---|---|
| In-studio, as the user edits | WASM (facade `validate`) | incremental checks, < 150 ms |
| CI on every PR | static binary | full suite over all first-party contracts |
| Generation pipeline | WASM per-pass + binary at admission (same bits, D17) | failures → diagnostics → bounded self-repair → draft (D14) |
| Marketplace publish | binary | full suite; report attached to listing |
| Lockfile upgrade | binary | re-validation + consequence diff (D5) |
| Co-design | binary (native, tier-0 oracle) | < 50 ms per candidate |
| Third parties (R2) | binary / crate / npm | their CI, their rules, our checks |

Budgets: **full suite < 10 s per model (binary); incremental < 150 ms (WASM)**.
Determinism: simulated clock, seeded synthetic input, fixed dt, no real render; **no
fast-math (D17)** — binary and WASM must be bit-identical (P1 exit criterion).

## 3. Check catalog *(proposed IDs — stabilize at P2-001; IDs are append-only once stable)*

Severity: `error` blocks admission; `warn` admits with notice.

**GEO — geometry** *(GEO-003 = BVH-confirmed mesh intersection, GEO-008 = sampled animation-frame sweep — both live 2026-06-12 via XC-09)*
| ID | Check | Pass condition |
|---|---|---|
| GEO-001 | NaN/Inf scan | no NaN/Inf in baked vertices across animation frames |
| GEO-002 | ground contact | within [−1 mm, +4 mm] across the idle cycle |
| GEO-003 | joint-limit sweep | BVH solid-solid penetration ≤ 0.5 mm over the full limit box |
| GEO-004 | face budget | total faces within quality-tier budget |
| GEO-005 | degenerate faces | zero degenerate/zero-area faces |
| GEO-006 | mass closure | Σ part masses = aggregate within 2 % |

**CTR — contract**
| ID | Check | Pass condition |
|---|---|---|
| CTR-001 | schema validity | document validates against schema version |
| CTR-002 | port resolution | all ports resolved or explicitly capped |
| CTR-003 | equipped slot semantics | every non-empty slot names exactly one unique equipped variant; variant IDs are unique and each alternative carries exactly one of inline parts or `componentRef` |
| CTR-004 | explode coverage | ≥ 80 % of parts; ≥ 1 leader-flagged subassembly per slot |
| CTR-005 | materials | a material on every part |
| CTR-006 | lockfile | every componentRef resolves to an immutable catalog revision |
| CTR-007 | collider budget | ≤ 8 convex pieces/node, ≤ 24/model (D7) |
| CTR-008 *(provisional v0)* | driver params | `driver.params` validates against the archetype's schema (P2-003) |

**BEH — behavior**
| ID | Check | Pass condition |
|---|---|---|
| BEH-001 | archetype smoke | biped: walks 1 m, no NaN, penetration ≤ 1 mm · multirotor: holds altitude ± 5 cm · rover: tracks a 1 m arc · quadruped: finite 1 m trot · arm: reachable IK target solve |
| BEH-002 | servo stability | no oscillation growth at dt = 50 ms |
| BEH-003 | explode round-trip | explode→assemble is deterministic |
| BEH-004 | pick resolution | every visible part maps to a component or core |

**SIM — simulation**
| ID | Check | Pass condition |
|---|---|---|
| SIM-001 | hover trim | exists below 75 % throttle |
| SIM-002 | TWR floor | per preset (freestyle: error < 1.8, warn < 2.5) |
| SIM-003 | current budget | battery max discharge ≥ Σ motor max × 1.2 |
| SIM-004 | estimator smoke | scorecards reject ground-truth-trained policies (D8) |

**MFG — manufacturing (printable structural parts)**
| ID | Check |
|---|---|
| MFG-001 | minimum wall thickness per process profile *(live: FDM/SLA structural mesh-derived profiles)* |
| MFG-002 | overhang angle *(live: best-orientation profile check)* |
| MFG-003 | support-volume estimate *(live: support volume vs oriented bounding volume)* |
| MFG-004 | bed fit *(live: oriented extents against FDM/SLA print volumes)* |

**GEO-007** *(provisional v0 id)* · bake failure — the geometry could not be
built at all (unknown node, degenerate dims, unsupported mesh ref pre-P5).
**RND — render** · RND-001 golden-image perceptual diff (canonical cameras) ·
RND-002 blueprint pass renders cleanly.

> **Implementation state (v0.3, 2026-06-14 — D21):** live in `crates/forge-validate`:
> CTR-001..008, GEO-001 (static frame), GEO-003 (AABB proxy, warn), GEO-004..007,
> SIM-001..003, BEH-001 (multirotor/rover/quadruped/**arm** smoke), BEH-002,
> MFG-001..004 (mesh-derived FDM/SLA structural profiles), PRV-001 —
> with the diagnostic JSON and report envelope below, the CLI
> (`run`/`bake`/`bom`/`schema`/`sim-parity`/`codesign-evaluate`), and the WASM facade producing `target: "wasm"`
> reports in-browser. Animation-frame scans, the BVH joint sweep, and the remaining
> rows land with their phases.

> **D59 co-design boundary (2026-07-16 candidate):** `codesign-evaluate` is a native-
> only internal evidence command. It hashes the exact raw candidate snapshot, runs
> the sovereign validator plus bake/HUD path, and—only for native-admitted input—runs
> a deterministic real Rapier 0.33.0 world for 120 steps at 1/120 s with two
> substeps. Its versioned result carries native tier-0 and Rapier tier-1 evidence plus
> explicit MuJoCo/training/build/hardware/field nonclaims. Worker orchestration owns
> the separately pinned MuJoCo tier and must rebind the native artifact hash. The
> measured <50 ms tier-0 budget is reported separately and never changes the
> validator verdict. This candidate is not yet protected and does not authorize an
> overnight optimizer or trained finalist.
**XT — cross-target (D17)** · XT-001 golden-number suite — canonical scenes
bit-identical native↔WASM (detail: [`core-runtime.md`](core-runtime.md) §5).
**CAT — catalog compatibility (P3-003; live 2026-06-12 in `forge-validate::compat`)** ·
CAT-001 mount-pattern equality (stack parts vs frame) · CAT-002 voltage-window
intersection (battery↔ESC↔motor) · CAT-003 current budget (discharge ≥ Σ motor
max × 1.2) · CAT-004 prop tip clearance (v0 spacing form; geometric BVH = XC-09) ·
CAT-005 TWR floors per preset (freestyle: reject < 1.8, warn < 2.5; thrust/AUW
supplied by the caller from thrust tables) · CAT-006 connector matching
(battery↔ESC). Every violation carries an explanation string — the reason a
configurator card greys out. Rules run wherever the core runs (D17); they
activate against real rows at catalog ingestion (P3-004).
**LIF — lifecycle** · LIF-001 upgrade re-validation when lockfiles move (D5).
**PRV — provenance** · PRV-001 prompt/seed hashes present on generated content ·
PRV-002 training lineage present on policies/skills.
**ENV — EnvSpec (P10)** · ENV-001 identity/spawn validity · ENV-002 bounds,
references, and conservative spawn→gate reachability · ENV-003 task/win sanity ·
ENV-004 no degenerate colliders.

## 4. Diagnostic format *(proposed — stabilize at P2-001)*

Failures are data, designed for the LLM repair loop and the UI alike:

```json
{
  "check": "GEO-002",
  "severity": "error",
  "subject": {"kind": "node", "id": "an1"},
  "observed": -4.2, "limit": [-1, 4], "units": "mm",
  "phase": 0.31,
  "message": "ground_penetration: an1 -4.2 mm @ phase 0.31",
  "hint": "raise idle ankle target or shorten shin part bbox"
}
```

Report envelope: `{contractHash, lockfileHash, schemaVersion, validatorVersion, seed,
target: "native" | "wasm", startedAt, durationMs, results[], verdict: "admitted" |
"draft" | "rejected"}`. Verdict `draft` = D14 semantics (renders/edits; no
train/export/share). Reports are stored with the artifact and are part of provenance.
Because the bits are identical across targets (D17), a report is trustworthy
wherever it was produced; official marketplace/leaderboard admission re-runs
server-side as anti-cheat hygiene only.

## 5. Crate & module layout *(proposed)*

```
crates/forge-validate/
├── src/runner.rs        # orchestration, parallelism, seeding, report assembly
├── src/checks/{geo,ctr,beh,sim,mfg,rnd,lif,prv,env}/...   # one module per check family
├── src/registry.rs      # check catalog: id, severity, phase-applicability, deps
└── src/bin/forge-validate.rs   # CLI: `forge-validate run <contract.json>
                                #       [--checks GEO,CTR] [--report out.json]`
```

Checks declare dependencies (e.g. BEH-* needs CTR-001 pass) so the runner can
short-circuit and parallelize. Render checks (RND-*) need pixels: they run via the
studio's golden-image harness in CI rather than inside the crate *(proposed — the
crate exposes the pass/fail contract; the pixel diff is a CI sibling)*.

## 6. Distribution (D2, D17)

Three artifacts from one crate family, with release plumbing live at P2-001:
**static binary** (CLI; the gateway spawns it — process isolation + bit-equality
with CI), **npm WASM package** (via the facade), **crates.io crates** (for
embedders). `scripts/prepare-validator-release.mjs` checks internal Cargo package
metadata, builds the release binary and `@forge/validate-wasm`, runs
`npm pack --dry-run`, writes checksums, and powers the tag workflow. Actual
publication remains owner-token gated and follows the internal crate order:
`forge-num` → `forge-contract` → `forge-geometry` → `forge-motion` →
`forge-sim` → `forge-validate` → `forge-wasm`. Versioned together; a report names
its independently versioned `reportVersion`, `validatorVersion`, and `target`.
`forge-validate version --json` and the WASM `version()` export expose the active
package, ModelSpec, report, replay, and EnvSpec versions. Compatibility and
deprecation rules are owned by [`../COMPATIBILITY.md`](../COMPATIBILITY.md).

## 7. Dependencies

`forge-contract` (shapes), `forge-geometry` (BVH, mass props, bake), `forge-motion` +
`forge-sim` (smoke tests). The gateway wraps the binary as the validation service;
the studio calls the facade; CI invokes the CLI.

## 8. Quality machinery around the harness (platform scale, plan §10)

Golden-image render tests; physics regression with trajectory tolerance bands per
canonical scene; the **golden-number suite** (XT-001) guarding native↔WASM
exactness; schema compatibility matrix; **generator fuzzing** with every failure
minimized into a permanent regression case (XC-24); **Brief-25** generation suite
with dashboard (D-evals — lives with the generation pipeline but is enforced here as
a CI gate). The inventory, immutable-oracle rule, regeneration procedure, and
append-only review records for these artifacts are owned by
[`../GOLDEN-ARTIFACTS.md`](../GOLDEN-ARTIFACTS.md) and enforced by
`pnpm verify:goldens`.

Live 2026-06-14: XC-24 has a deterministic ModelSpec fuzz seed corpus at
[`evals/fuzz/modelspec-seeds.json`](../../evals/fuzz/modelspec-seeds.json) and an
executable checker/minimizer at
[`scripts/fuzz-contract-seeds.mjs`](../../scripts/fuzz-contract-seeds.mjs). The
corpus materializes first-party examples plus JSON-Pointer mutations, pins verdict
and error check IDs, and the minimizer greedily removes optional model content while
preserving a requested diagnostic check for permanent regression fixtures.

QA-007 extends that gate without adding a new top-level verification step.
`pnpm fuzz:contract:check` now also runs
[`scripts/check-boundary-fuzz-corpora.mjs`](../../scripts/check-boundary-fuzz-corpora.mjs),
which requires the exact eight-file `forge-boundary-fuzz.v1` inventory, substantive
case rationale, globally unique stable IDs, pinned accept/reject outcomes, and valid
non-finite sentinels. The registered family currently contains 89 cases. Rust
consumers own JSON Patch, URDF/MJCF import, EnvSpec, and replay behavior; Python 3.12
consumers own replay, provider output, catalog citations, D10 export policy, and
hardware payloads. Structural validity is not behavioral proof, so the registry also
requires both Rust consumers and the worker suite.

## 9. Phase mapping

- **P0:** embryo — schema validity + part/face byte-equivalence vs the monolith
  (P0-004/008).
- **P1:** full Rust assembly over the ported crates; binary = WASM bit-identical
  (P1-004/007).
- **P2:** productized — stable check IDs, diagnostic format, draft semantics,
  binary/npm/crate publication (P2-001/002).
- Grows a row whenever a feature introduces an invariant (BEST-PRACTICES §4).

## 10. Open questions

Pixel-diff harness placement for RND checks (CI sibling assumed *(proposed)*);
whether warn-level findings surface in share-view UI; per-tier face budgets (numbers
TBD with P1 profiling); report signing for third-party-produced reports (post-R2
question).
