# Co-design Optimizer — implementation doc

**Status:** deterministic budgeted candidate/Pareto evaluator live; live engine-backed optimizer adapter open · **Phases:** P9 (after training is boring) · **Home:**
gateway orchestrator + `codesign.evaluate` workers · **Plan refs:** §12
(v3.0) · **Decisions:** D17 (native tier-0), D20 (training-side canonical),
validator-as-oracle

## 1. Purpose

Because a design is a document, an optimizer can mutate it. The co-design
orchestrator searches **contract space** against user objectives — *"lightest quad
that finishes this course under 20 s with ≥ 8 min endurance"* — returning a **Pareto
front** (mass × endurance × task time) rather than a single answer, **each point a
fully admitted contract** the user can open, inspect, and build. Morphology-and-
policy co-design as a consumer surface is the crown-jewel consequence of
contract-as-data.

## 2. Search space encoding (P9-001)

The exposed parameter manifold: slot choices as **categoricals** (catalog-backed
variants), dimensions and driver params as **continuous** within validator bounds.
Encoding/decoding is deterministic contract surgery (JSON-Patch under the hood),
lockfile-aware (candidates pin revisions like any model).

Live 2026-06-14: `codesign.evaluate` emits categorical and continuous manifold
metadata, validator-bounded dimensions, deterministic JSON-Patch candidates,
optimizer metadata, and a computed Pareto front. The keyless path now runs a
budgeted CMA/TPE-shaped search up to 200 candidates. `FORGE_CODESIGN_CMD` can
replace that deterministic evaluator with a live CMA-ES/Optuna/simulator ladder
while preserving the same candidate and Pareto output contract.

## 3. Algorithms (P9-002)

Gradient-free, because the landscape is a constraint oracle:
- **CMA-ES** — sample θ ~ N(m, σ²C); rank by multi-fidelity objective; update
  m, σ, C from elite weights. Workhorse for continuous-heavy spaces.
- **Bayesian optimization (Optuna TPE)** for low-dimensional, categorical-heavy slot
  spaces.
- **The validator is the constraint oracle**: infeasible candidates are rejected (or
  repaired-then-rejected) before costing simulation time; objectives are evaluated
  only on valid designs.

## 4. Multi-fidelity evaluation ladder (P9-003 — what makes cost sane)

| Tier | Evaluation | Cost |
|---|---|---|
| 0 | schema + compatibility + static physics (mass, TWR, hover trim closed-form) — **native via the core binary** | **< 50 ms** |
| 1 | Rapier smoke runs (hover hold, short maneuvers) | seconds |
| 2 | short MuJoCo rollouts with a frozen or lightly tuned policy | minutes, batched |
| 3 | full training — **finalists only** | hours |

Budgets (binding): tier-0 candidate < 50 ms native; a 200-candidate CMA-ES
generation overnight at tier 2. MJX batch parallelism is what makes tiers 2/3
feasible at scale only if the P7-010 benchmark demands it and the `forge-sim`
adoption helper's parity/throughput/cost thresholds pass.

## 5. Output

A Pareto front UI (P9-004): each point opens as a normal admitted contract with its
validator report and (tier-3 points) scorecard; provenance records the optimization
run (objectives, seed, generations) like any generation lineage.

Live 2026-06-14: Studio can launch the co-design job, render budgeted Pareto points
with metrics, apply admitted JSON-Patch candidates through the live patch/re-bake
path, and save admitted points as openable models. Engine-backed tier 1/2/3
evaluation remains open.

## 6. Dependencies

`forge-validate` binary (oracle, native-fast), `forge-contract` (surgery +
lockfiles), `forge-sim` (tier 0/1), training workers (tier 2/3), component DB
(categorical domains), studio (front explorer).

## 7. Testing

Known-landscape fixtures (a toy contract family with an analytically known Pareto
front — the optimizer must recover it); oracle-rejection accounting (infeasible rate
tracked, must not dominate budget); determinism per seed; budget assertions per tier.

## 8. Phase mapping & backlog

P9: P9-001..005. Ships only once P7 training is routine ("boring") — the ladder's
tiers 2/3 lean on it.

## 9. Open questions

Objective specification UX (constraint sliders vs NL brief parsed to objectives —
likely both, NL compiling to the structured form); warm-starting policies across
morphology neighbors at tier 2; population-size defaults per archetype.
