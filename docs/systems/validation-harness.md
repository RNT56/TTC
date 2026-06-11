# Validation harness — implementation doc

**Status:** not started · **Phases:** P0 (embryo), P2 (productized), evolves always ·
**Package:** `packages/harness` *(proposed)* · **Plan refs:** §10, Appendix B ·
**Decisions:** D5, D7, D8, D14, D-evals

## 1. Purpose

The **sovereign gatekeeper**: a deterministic headless runner (Node + engine
libraries, render stubbed) executing the full check suite on every contract write.
Nothing — human-authored, parametric, LLM-generated, or community-submitted — enters
the registry, marketplace, or training queue without passing. The same machine that
admits first-party content admits everyone's; the validator report ships with every
listing. It is also the **repair oracle**: generation self-repair (P4) and co-design
(P9) consume its machine-readable diagnostics.

## 2. Where it runs

| Trigger | Mode |
|---|---|
| CI on every PR | full suite over all first-party contracts |
| Generation pipeline | per-pass incremental + full suite before admission; failures → diagnostics → bounded self-repair → draft (D14) |
| Marketplace publish | full suite; report attached to listing |
| Lockfile upgrade | re-validation + consequence diff (D5) |
| Co-design | tier-0 oracle (schema/compat/static) per candidate |

Budget: **< 10 s full suite per model** (headless, parallel checks, BVH reuse).
Determinism: simulated clock, seeded synthetic input, fixed dt, no real render.

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

**RND — render** · RND-001 golden-image perceptual diff (canonical cameras) ·
RND-002 blueprint pass renders cleanly.
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

Report envelope: `{contractHash, lockfileHash, schemaVersion, harnessVersion, seed,
startedAt, durationMs, results[], verdict: "admitted" | "draft" | "rejected"}`.
Verdict `draft` = D14 semantics (renders/edits; no train/export/share). Reports are
stored with the artifact and are part of provenance.

## 5. Runner & module layout *(proposed)*

```
packages/harness/
├── src/runner.ts        # orchestration, parallelism, seeding, report assembly
├── src/checks/{geo,ctr,beh,sim,mfg,rnd,lif,prv,env}/...   # one module per check
├── src/registry.ts      # check catalog: id, severity, phase-applicability, deps
└── cli.ts               # `harness run <contract.json> [--checks GEO,CTR] [--report out.json]`
```

Checks declare dependencies (e.g. BEH-* needs CTR-001 pass) so the runner can
short-circuit and parallelize. Render checks stub the GPU (rasterize via the
geometry layer or run in CI with headless GL — decide at P2).

## 6. Dependencies

`contract` (shapes), `geometry` (BVH, mass props, builds), `engines/motion` +
`engines/sim` (smoke tests). The gateway wraps it as the validation service; CI
invokes the CLI.

## 7. Quality machinery around the harness (platform scale, plan §10)

Golden-image render tests; physics regression with trajectory tolerance bands per
canonical scene; schema compatibility matrix; **generator fuzzing** with every
failure minimized into a permanent regression case (XC-24); **Brief-25** generation
suite with dashboard (D-evals — lives with the generation pipeline but is enforced
here as a CI gate).

## 8. Phase mapping

- **P0:** embryo — schema validity + part/face byte-equivalence vs the monolith (P0-008/009).
- **P2:** productized — full catalog with stable IDs, diagnostic format, draft semantics (P2-001/002).
- Grows a row whenever a feature introduces an invariant (BEST-PRACTICES §4).

## 9. Open questions

Headless render strategy for RND checks (software rasterize vs headless GL); whether
warn-level findings surface in share-view UI; per-tier face budgets (numbers TBD with
P1 profiling).
