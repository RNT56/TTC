# Co-design Optimizer — implementation doc

**Status:** deterministic fixture evaluator plus D59 protected controlled native/Rapier/MuJoCo smoke live; overnight CMA-ES/Optuna and trained finalists open · **Phases:** P9 (after training is boring) · **Home:**
gateway orchestrator + `codesign.evaluate` workers · **Plan refs:** §12
(v3.0) · **Decisions:** D17 (native tier-0), D20 (training-side canonical),
D59 (exact engine smoke), validator-as-oracle

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
budgeted CMA/TPE-shaped search up to 200 candidates with structured tier evidence,
constraint rejection reasons, and Pareto filtering that only returns admitted
candidates. `FORGE_CODESIGN_CMD` can replace that deterministic evaluator with a
live CMA-ES/Optuna/simulator ladder while preserving the same candidate and Pareto
output contract.

Live 2026-07-16 (D59): the repository-owned controlled command derives a narrow
three-to-nine-point electrical manifold only from an exact Gateway-owned admitted
inline-multirotor snapshot. It scales every inline motor Kv, every prop diameter,
and battery capacity within 0.94–1.06/0.94–1.06/0.90–1.10 respectively. It does not
change mass, invent catalog choices, or accept a client-authored manifold. Every
candidate is a replace-only JSON Patch; the worker reapplies the patch to the base
snapshot and recomputes candidate/patch/native-evidence hashes before accepting an
external result. This is controlled smoke coverage of the transport and engines,
not completion of the catalog-backed categorical manifold or optimizer.

## 3. Algorithms (P9-002)

Gradient-free, because the landscape is a constraint oracle:
- **CMA-ES** — sample θ ~ N(m, σ²C); rank by multi-fidelity objective; update
  m, σ, C from elite weights. Workhorse for continuous-heavy spaces.
- **Bayesian optimization (Optuna TPE)** for low-dimensional, categorical-heavy slot
  spaces.
- **The validator is the constraint oracle**: infeasible candidates are rejected (or
  repaired-then-rejected) before costing simulation time; objectives are evaluated
  only on valid designs.

D59 does not implement either production algorithm. Its algorithm token is
`deterministic-controlled-smoke`, it refuses budgets above nine, and every artifact
sets `cmaEsExecuted=false`, `optunaTpeExecuted=false`, and
`overnight200Candidate=false`. P9-002 remains in progress until actual pinned
CMA-ES and Optuna TPE execute the full mixed manifold with recovery, cost, and
overnight evidence.

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

The keyless worker still emits per-candidate fixture records for all four tiers
with explicit runtimes, engines, checks, and reject reasons. Tier-0 budget metadata
is capped below 50 ms, tier-2 constraint admission is the Pareto gate, and tier-3 is
marked only for synthetic finalists. Those records remain fixture evidence.

Live 2026-07-16 (D59): `forge-validate codesign-evaluate` verifies the exact raw
candidate SHA-256, re-runs the sovereign validator, bakes the admitted contract,
compiles real Rapier 0.33.0, and records a deterministic finite one-second
trajectory digest. The worker then compiles the exact candidate through Rust
training-bundle 2.0.0 and runs two 200-step `hover-hold` rollouts in pinned MuJoCo
3.9.0 using the reviewed estimator-only controller shared with the training
curriculum. Tier 0 reports its real native runtime and a separate `<50 ms` budget
boolean; latency never changes the validator verdict. Tier 2 score is measured
success fraction, task time is measured time to first success, energy is simulated
electrical work, and mass/endurance come only from the Rust HUD. Tier 3 is always
held and the artifact permanently denies a trained-policy claim.

The required release-binary smoke command is:

```bash
FORGE_PYTHON=python3 \
FORGE_VALIDATE_BIN=target/release/forge-validate \
pnpm codesign:engine-smoke -- --require-tier0-budget \
  --out /tmp/p9-engine-smoke.json
```

The normal full gate also runs this smoke with the available validator binary; only
the explicit release-binary evidence command may close the tier-0 latency SLO.

## 5. Output

A Pareto front UI (P9-004): each point opens as a normal admitted contract with its
validator report and (tier-3 points) scorecard; provenance records the optimization
run (objectives, seed, generations) like any generation lineage.

Studio can launch the co-design job, render budgeted Pareto points
with metrics, apply admitted JSON-Patch candidates through the live patch/re-bake
path, and save admitted points as openable models. D59 additionally labels a v1
result as controlled engine smoke, shows native/Rapier/MuJoCo authority and the
tier-0 measurement, and states that tier 3, overnight CMA-ES/Optuna, trained
finalist, build, and field claims remain held. Worker tests exercise the "lightest quad under course
constraints" shape: a 200-candidate run must yield at least three admitted Pareto
points, and impossible constraints must produce rejected candidates instead of a
false front. The D59 smoke deliberately returns only its actually admitted Pareto
subset; it does not satisfy the overnight `>=3` exit criterion.

## 6. Dependencies

`forge-validate` binary (oracle, native-fast), `forge-contract` (surgery +
lockfiles), `forge-sim` (tier 0/1), training workers (tier 2/3), component DB
(categorical domains), studio (front explorer).

## 7. Testing

Known-landscape fixtures (a toy contract family with an analytically known Pareto
front — the optimizer must recover it); oracle-rejection accounting (infeasible rate
tracked, must not dominate budget); determinism per seed; budget assertions per tier.
D59 adds native CLI hash-drift/rejection tests, exact external-field/patch/lineage
recomputation, provider-tamper rejection, seed-stable candidate/Rapier/MuJoCo
digests, explicit >9 budget refusal, focused Studio type/build checks, and a source-
bound release-binary smoke. PR #106/`fae00c5` protects exact head `e64c601`,
reviewed tree `08e8a12`, and passing PR/post-merge CI/security. Full P9 closure still
requires a retained clean
overnight artifact over 200 candidates, real algorithm evidence, >=3 admitted
Pareto points, and trained-finalist scorecards.

## 8. Phase mapping & backlog

P9: P9-001..005. Ships only once P7 training is routine ("boring") — the ladder's
tiers 2/3 lean on it.

## 9. Open questions

Objective specification UX (constraint sliders vs NL brief parsed to objectives —
likely both, NL compiling to the structured form); warm-starting policies across
morphology neighbors at tier 2; population-size defaults per archetype.
