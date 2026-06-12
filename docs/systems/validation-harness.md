# Validation harness (`forge-validate`) — implementation doc

**Status:** not started · **Phases:** P0 (embryo), P1 (Rust assembly), P2
(productized), evolves always · **Home:** `crates/forge-validate` *(proposed)* ·
**Plan refs:** §10, Appendix B (v3.0) · **Decisions:** D2, D5, D7, D8, D14, D17,
D-evals

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

**GEO — geometry**
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
| CTR-003 | slot defaults | every slot has a valid default variant |
| CTR-004 | explode coverage | ≥ 80 % of parts; ≥ 1 leader-flagged subassembly per slot |
| CTR-005 | materials | a material on every part |
| CTR-006 | lockfile | every componentRef resolves to an immutable catalog revision |
| CTR-007 | collider budget | ≤ 8 convex pieces/node, ≤ 24/model (D7) |
| CTR-008 *(provisional v0)* | driver params | `driver.params` validates against the archetype's schema (P2-003) |

**BEH — behavior**
| ID | Check | Pass condition |
|---|---|---|
| BEH-001 | archetype smoke | biped: walks 1 m, no NaN, penetration ≤ 1 mm · multirotor: holds altitude ± 5 cm · rover: tracks a 1 m arc · (quadruped/arm analogues defined with their drivers) |
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
| MFG-001 | minimum wall thickness per process profile |
| MFG-002 | overhang angle |
| MFG-003 | support-volume estimate |
| MFG-004 | bed fit |

**GEO-007** *(provisional v0 id)* · bake failure — the geometry could not be
built at all (unknown node, degenerate dims, unsupported mesh ref pre-P5).
**RND — render** · RND-001 golden-image perceptual diff (canonical cameras) ·
RND-002 blueprint pass renders cleanly.

> **Implementation state (v0.2, 2026-06-12 — D21):** live in `crates/forge-validate`:
> CTR-001..008, GEO-001 (static frame), GEO-003 (AABB proxy, warn), GEO-004..007,
> SIM-001..003, BEH-001 (multirotor/rover/**quadruped** 1 m smoke), BEH-002, PRV-001 —
> with the diagnostic JSON and report envelope below, the CLI
> (`run`/`bake`/`bom`/`schema`), and the WASM facade producing `target: "wasm"`
> reports in-browser. Animation-frame scans, the BVH joint sweep, and the remaining
> rows land with their phases.
**XT — cross-target (D17)** · XT-001 golden-number suite — canonical scenes
bit-identical native↔WASM (detail: [`core-runtime.md`](core-runtime.md) §5).
**LIF — lifecycle** · LIF-001 upgrade re-validation when lockfiles move (D5).
**PRV — provenance** · PRV-001 prompt/seed hashes present on generated content ·
PRV-002 training lineage present on policies/skills.
**ENV — EnvSpec (P10)** · ENV-001 spawn validity · ENV-002 reachability spawn→goals ·
ENV-003 bounds sanity · ENV-004 no degenerate colliders.

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

Three artifacts from one crate, published at P2-001: **static binary** (CLI; the
gateway spawns it — process isolation + bit-equality with CI), **npm WASM package**
(via the facade), **crates.io crate** (for embedders). Versioned together; a report
names its `validatorVersion` and `target`.

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
a CI gate).

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
