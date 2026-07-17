# Co-design Optimizer — implementation doc

**Status:** deterministic fixture evaluator; protected D59 controlled native/Rapier/MuJoCo smoke, D60 v1 proposal plan, and platform-scoped D61 v1 engine batch; D62/D63 exact-runtime v2 plan/recovery candidate local, protection and same-revision cross-runtime evidence open; overnight/provider scheduling, catalog choices, and trained finalists open · **Phases:** P9 (after training is boring) · **Home:**
gateway orchestrator + `codesign.evaluate` workers · **Plan refs:** §12
(v3.0) · **Decisions:** D17 (native tier-0), D20 (training-side canonical),
D59 (exact engine smoke), D60 (proposal-only algorithm plan), D61 (checkpointed
exact-hash engine batch), D62 (cross-platform plan identity), D63 (exact-runtime v2),
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

Protected 2026-07-17 (D60): `python -m forge_workers.codesign_search` starts from the
same exact admitted-snapshot authority and emits a separately versioned plan of
exactly 200 unique candidate snapshots. The frozen proposal manifold uses bounded
inline motor-Kv, prop-diameter, and battery-capacity scales. Optuna TPE additionally
selects one of four explicit electrical proposal profiles; this categorical is not
a catalog component choice. Caller-authored manifolds and any other budget fail
closed. The request field set is exact, SHA authority is lower-case hex, and both
the outer request and embedded contract are byte/depth/node bounded before an
algorithm runs. Each row contains only replace operations plus patch/candidate
hashes that reapply against the exact source snapshot.

Protected 2026-07-17 (D61): `python -m forge_workers.codesign_batch` accepts
that exact source snapshot and complete D60 plan only after deterministic replay. It
consumes proposal ordinals as one contiguous append-only prefix, recomputes every
patch and candidate hash, and binds each engine row to the plan. The versioned batch
is also its durable checkpoint and is atomically replaced after every candidate. A
partial or cancelled checkpoint contains neither Pareto nor finalist authority.
Unfinished attempts are fenced as interrupted before resume, and cancellation may
advance no candidate cursor.

Protected artifact `8396554544` at `1c37567` proves 200 native and 123 eligible
Rapier/MuJoCo rows, 87 admissions, four Pareto points, three tier-3-held finalists,
and the 7 + zero-dispatch cancel + 193 resume sequence. D62 records a separate
portability limit: repeated Linux x86-64 plans match all 200 hashes, while clean
Apple-arm64 changes CMA-ES ordinals 20–99. V1 replay rejects that foreign plan, so
integrity fails closed, but cross-platform recovery is not proven.

Local 2026-07-17 (D63): coordinated plan/batch/evidence v2 binds
`forge-codesign-proposal-runtime-authority/1.0.0`. It hashes OS, CPython, NumPy
distribution/build/CPU/BLAS/LAPACK, and optimizer distribution identity; partitions
plan and batch caches; records exact-runtime-only resume; and binds the authority
hash into every engine candidate. Validation refuses a foreign authority before
evaluation or checkpoint resume. The all-200 comparison tool requires two clean
same-revision artifacts and permanently keeps cross-runtime cache and tier-3
authority false. A dirty-worktree Apple-arm64 diagnostic v2 batch still executes
7 + cancel + 193, evaluates 200 native/125 eligible Rapier-MuJoCo rows, admits 89,
returns four Pareto points, and selects three held finalists. Clean/protected Linux
and same-revision cross-runtime evidence remain required.

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
`overnight200Candidate=false`.

D60 executes actual pinned `cmaes==0.13.0` and `optuna==4.9.0`, allocating 100
proposals to each. CMA-ES uses ten generations of population ten on the continuous
electrical scales. TPE uses twenty startup trials on the mixed profile/continuous
space. Both receive only the deterministic `bounded-diversity-acquisition-v1`
loss; it declares `physicalObjective=false` and `engineFeedback=false`. This closes
algorithm invocation and reproducible proposal breadth only. P9-002 remains in
progress until the exact proposals are consumed by sovereign physical evaluation,
catalog choices are searched, and a retained scheduled run proves recovery and
cost.

D61 consumes all 200 real-algorithm proposals but does not feed physical scores back
into CMA-ES or TPE; proposal order and algorithm identity remain D60 authority. Its
complete batch independently recomputes physical admission and Pareto from the
sovereign engine rows. P9-002 remains in progress because the current electrical
profiles are not catalog choices and no retained overnight/provider scheduler or
cost reconciliation exists.

D62/P9-006 remains the next algorithm prerequisite. D63 selects exact-runtime
authority instead of modifying floating-point CMA-ES arithmetic. No finalist may
enter tier 3 and no checkpoint may move between authority hashes until v2 is clean,
protected, and compared across the supported Apple-arm64/Linux-x86-64 pair. Stable
final selections do not erase the 80 changed v1 CMA-ES candidate preimages.

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

D60's separate proposal-plan smoke is:

```bash
FORGE_PYTHON=python3 \
FORGE_SOURCE_REVISION="$(git rev-parse HEAD)" \
FORGE_REQUIRE_CLEAN_EVIDENCE=1 \
pnpm codesign:search-plan -- --out /tmp/p9-search-plan.json
```

It must produce 100 CMA-ES plus 100 Optuna TPE proposals and keep every validator,
Rapier, MuJoCo, physical-constraint, admission, Pareto, overnight-result, trained-
finalist, catalog, provider, build, hardware, and field claim false. Runtime speed
is not an overnight claim. Any engine consumer needs its own format and must attach
D59-equivalent sovereign evidence to the exact proposal hashes. D61 is that
separate local consumer; it does not reinterpret or promote plan v1.

D61's checkpoint/recovery smoke is:

```bash
FORGE_PYTHON=python3 \
FORGE_VALIDATE_BIN=target/debug/forge-validate \
FORGE_SOURCE_REVISION="$(git rev-parse HEAD)" \
FORGE_REQUIRE_CLEAN_EVIDENCE=1 \
pnpm codesign:engine-batch -- --out /tmp/p9-engine-batch.json
```

It first evaluates seven exact hashes and retains the checkpoint, then records a
zero-dispatch cancellation at ordinal seven, resumes the remaining 193, and requires
one contiguous complete 200-row result. Every row runs native validation; only
native/Rapier-passing rows run the short pinned MuJoCo rollout. The complete result
derives admission and Pareto itself and selects three engine-admitted Pareto
candidates as tier-3-held finalists. It records measured local engine/attempt wall
runtime only. `overnight200Candidate`, trained-finalist, catalog-choice, provider
sandbox/billing, energy, build, hardware, and field authority remain false.

## 5. Output

A Pareto front UI (P9-004): each point opens as a normal admitted contract with its
validator report and (tier-3 points) scorecard; provenance records the optimization
run (objectives, seed, generations) like any generation lineage.

Studio can launch the co-design job, render budgeted Pareto points
with metrics, apply admitted JSON-Patch candidates through the live patch/re-bake
path, and save admitted points as openable models. D59 additionally labels a v1
result as controlled engine smoke, shows native/Rapier/MuJoCo authority and the
tier-0 measurement, and states that tier 3, overnight evaluated optimization,
trained-finalist, build, and field claims remain held. Worker tests exercise the
"lightest quad under course constraints" shape: a 200-candidate run must yield at
least three admitted Pareto points, and impossible constraints must produce rejected
candidates instead of a false front. The D59 smoke deliberately returns only its actually admitted Pareto
subset; it does not satisfy the overnight `>=3` exit criterion.

D60 does not alter the Studio result or queue contract. A proposal plan has no
metrics, admitted candidates, or Pareto points to show or save. Only a later engine-
evaluated result may enter that surface.

D61 remains outside the queue and Studio result contract at protected platform-
scoped evidence maturity. Its complete batch has real metrics and a Pareto front,
but publication to
the product surface requires a reviewed orchestration/materialization boundary; a
partial or cancelled checkpoint must never be shown or saved as a completed front.

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
Pareto points, and trained-finalist scorecards. D60 adds exact dependency-pin,
100/100 allocation, mixed-manifold, replace-only patch reapplication, unique
candidate-hash, same-seed replay, changed-seed, caller-manifold/budget, tamper, and
nonclaim refusal tests plus an exact-source smoke. It does not reduce any D59 or P9
closure gate. PR #109 protects exact head `340c88d`, reviewed tree `7139ad5`, and
protected squash `71e7217` with passing PR/post-merge CI/security.

D61 adds exact-plan replay, 200-ordinal prefix, candidate/native/engine lineage,
per-candidate atomic checkpoint, interrupted-attempt recovery, zero-dispatch
cancellation, admission/Pareto/finalist recomputation, measured-local-cost, tamper,
partial-result, and nonclaim tests. PR #111 protects exact head `6c446a5`, reviewed
tree `c6520fd`, and protected `1c37567` with passing exact PR/post-merge CI/security.
Downloaded artifact `8396554544` evaluates 200 native/123 eligible Rapier-MuJoCo
rows, admits 87, returns four Pareto points, and selects three tier-3-held finalists.
D62 adds a required cross-architecture all-200 hash comparison; the observed
Apple-arm64/Linux-x86-64 divergence is tracked under P9-006/R34 before tier 3. D63's
local v2 adds exact runtime-authority/hash/cache/scheduler/candidate validation,
foreign-runtime refusal, two cross-platform comparison-policy tests, and focused
search/batch coverage. Eleven focused tests and the diagnostic real Apple-arm64
200-candidate batch pass; all 44 local gates pass with 244 worker, 74 Gateway, and
39 Studio tests. Clean exact-source, protected Linux, downloaded artifact,
same-revision comparison, and evidence reconciliation remain required.

## 8. Phase mapping & backlog

P9: P9-001..006. Ships only once P7 training is routine ("boring") — the ladder's
tiers 2/3 lean on it.

## 9. Open questions

Objective specification UX (constraint sliders vs NL brief parsed to objectives —
likely both, NL compiling to the structured form); warm-starting policies across
morphology neighbors at tier 2; population-size defaults per archetype.
