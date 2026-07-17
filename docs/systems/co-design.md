# Co-design Optimizer — implementation doc

**Status:** deterministic fixture evaluator; protected D59-D65 engine/search/recovery/catalog/catalog-physics authority; D66 per-point-voltage format candidate local pending protection; applicable bench data, retained overnight/provider scheduling, and trained finalists open · **Phases:** P9 (after training is boring) · **Home:**
gateway orchestrator + `codesign.evaluate` workers · **Plan refs:** §12
(v3.0) · **Decisions:** D17 (native tier-0), D20 (training-side canonical),
D59 (exact engine smoke), D60 (proposal-only algorithm plan), D61 (checkpointed
exact-hash engine batch), D62 (cross-platform plan identity), D63 (exact-runtime v2),
D64 (catalog-backed categorical v3), D65 (catalog-bound tier-2 physics v4),
D66 (file-catalog performance-grid v2),
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

Protected 2026-07-17 (D63): coordinated plan/batch/evidence v2 binds
`forge-codesign-proposal-runtime-authority/1.0.0`. It hashes OS, CPython, NumPy
distribution/build/CPU/BLAS/LAPACK, and optimizer distribution identity; partitions
plan and batch caches; records exact-runtime-only resume; and binds the authority
hash into every engine candidate. Validation refuses a foreign authority before
evaluation or checkpoint resume. The all-200 comparison tool requires two clean
same-revision artifacts and permanently keeps cross-runtime cache and tier-3
authority false. PR #113/protected `54385c2`, exact PR/post-merge CI/security,
reviewed-tree equality, all 44 gates, and protected artifact `8397860593` pass. Clean
Linux-x86-64 and Apple-arm64 plans from that exact source bind authorities
`25ee0796…aff7e` and `a99337a8…b312`; independent comparison `d255c441…6562`
checks all 200 rows and finds 120 matches plus 80 CMA-ES patch/candidate differences
at ordinals 20–99. This closes P9-006 for exact-authority recovery integrity only.

Protected 2026-07-17 (D64): D64 keeps D60-D63 v1/v2 immutable and introduces a
coordinated v3 plan/batch lane.
The admitted `vx2-proof` battery slot now carries two lockfile-pinned alternatives:
CNHL 1500 mAh and 1300 mAh revision 1.0.0. A self-hashed catalog-choice authority
binds the complete sorted file-catalog byte authority and, for each choice, its slot,
variant, ranged ref, exact pin, row hash, mass, capacity, discharge, confidence,
review requirement, and license/export source. CMA-ES varies contract driver tilt
and yaw limits on the base equipped battery; Optuna TPE searches both exact battery
revisions plus those continuous bounds. Every proposal changes exactly the sole
`equippedVariantId`, matching inline battery capacity/discharge mirror, and driver
parameters. No motor, prop, battery, mass, price, license, or review fact is scaled
or invented.

Catalog-aware native evaluation v2 admits through `FileCatalog`, binds the same
catalog authority, and emits only equipped component proofs; unequipped alternatives
do not enter HUD, validation, BOM, or lineage. Batch v3 binds catalog plus D63
runtime authority in cache/checkpoint/resume/candidate records and rejects foreign
catalog bytes before work. The rows remain review-required and explicitly not
marketplace-exposable. Tier 2 in protected D64 evidence uses training-bundle 2.0.0
after catalog-backed admission and deliberately consumes the exact inline powertrain
mirror; it is not evidence of catalog-bound MuJoCo inertials or table applicability.
PR #115 exact head `b13a817`, reviewed/protected tree `9934442`, protected
`609a70d`, exact PR/post-merge CI/security, and all 44 gates pass. Downloaded clean
artifact `8399829664` binds catalog/runtime authorities `f6a7171…9262`/
`31a205c…725c`, evaluates 200/200 native/Rapier/MuJoCo rows, admits 197, and returns
the expected two-choice/two-point front with two held finalists after 7 + zero-
dispatch cancel + 193 resume. This is protected catalog/recovery proof, not a
`>=3` front, overnight/provider run, or tier-3 scorecard.

Protected implementation 2026-07-17 (D65): catalog-supplied multirotors now compile as
`trainingMuJoCoBundle` 3.0.0 plus
`forge-training-catalog-physics/1.0.0`. The artifact binds the complete catalog,
exact equipped rows, review/license state, catalog mass, sourced-dimension
uniform-solid inertia at every mount, and exact compiled MuJoCo mass closure.
Engine-batch/evidence 4.0.0 and
`forge-codesign-training-authority/1.0.0` hash that authority per tier-2 rollout.
Bench data is not promoted merely because it exists: the voltage grid must cover the
equipped battery range, diameter×pitch must match, and the applicable table must be
unique. Python independently recomputes each declared uniform-solid tensor before
MuJoCo mass readback. The D12 proof's 25.2 V/5×4.6
row is bound but rejected for 14.8–16.8 V/5×4.3; the resulting curve names its
inline current/resistance/prop/`DEFAULT_CT` fallbacks. PR #117 exact head
`d8d18ad`, reviewed merge/tree `2589e399`/`8051c127`, protected squash `ad54ab3`,
exact PR/post-merge CI/security, and all 44 gates pass. Protected artifact
`8402573520` binds clean source, file/result hashes `f9af2002…ce25`/
`cf1504ba…5e84`, evaluates 200/200, admits 97, and returns two held finalists at
0.769/0.756 kg after exact recovery. This is protected catalog-bound mass/inertia
and rejected-table lineage, not applicable catalog-thrust, tier-3,
overnight/provider, marketplace/live-catalog, build, hardware, field, or external
proof.

Local candidate 2026-07-17 (D66): file-catalog row 2.0.0 now represents a single
bench table as explicit per-point voltage×throttle measurements. Missing/explicit v1
retains exactly one table-voltage sweep; v2 forbids the scalar and requires finite
positive voltage on every point. Rust and Python require a complete rectangular,
unique, monotonic grid with exact throttle endpoints plus stable table ID, prop,
positive confidence, and HTTPS source. Migration 0027 preserves historical points
as `legacy-unattributed` v1 and expands persistence identity by table ID without
fabricating missing authority. The checked-in EMAX row remains v1 and D65-rejected.
This is representation/persistence only: before a reviewed v2 grid drives tier 2 or
tier 3, a new bundle/catalog-physics major must retain the exact grid and Python must
independently reconstruct the curve. All 44 local non-database gates pass; full
clean/every-populated-predecessor database CI and protected evidence remain open.

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
algorithm invocation and reproducible proposal breadth only. D64's v3 successor
preserves the 100/100 allocation while replacing its historical profile categorical
with exact catalog revisions.

D61 consumes all 200 real-algorithm proposals but does not feed physical scores back
into CMA-ES or TPE; proposal order and algorithm identity remain D60 authority. Its
complete batch independently recomputes physical admission and Pareto from the
sovereign engine rows. D64 now supplies exact catalog-choice search and sovereign
catalog admission, but neither algorithm receives engine feedback. P9-002 remains
in progress because no retained overnight/provider scheduler, course-conditioned
objective run, cost reconciliation, or trained-finalist loop exists.

D62/P9-006 is closed by D63 exact-runtime authority instead of modified floating-
point CMA-ES arithmetic. No checkpoint or cache entry may move between authority
hashes; cross-runtime tier-3 authority remains false. The protected comparison does
not authorize training by itself: D64 now supplies catalog-choice lineage, but
finalists still require retained training scorecards and the overnight/provider
gates. Stable
final selections do not erase the 80 changed CMA-ES candidate preimages.

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

The D64 v3 proposal-plan smoke (D60 v1 and D63 v2 remain historical) is:

```bash
FORGE_PYTHON=python3 \
FORGE_CATALOG_DIR=catalog \
FORGE_SOURCE_REVISION="$(git rev-parse HEAD)" \
FORGE_REQUIRE_CLEAN_EVIDENCE=1 \
pnpm codesign:search-plan -- --out /tmp/p9-search-plan.json
```

It must produce 100 CMA-ES plus 100 Optuna TPE proposals, bind both exact battery
revisions and the full catalog/runtime authorities, and keep every validator,
Rapier, MuJoCo, physical-constraint, admission, Pareto, overnight-result, trained-
finalist, marketplace-review/live-catalog, provider, build, hardware, and field
claim false. Runtime speed is not an overnight claim.

The D65 v4 checkpoint/recovery smoke (D64 v3 remains historical evidence) is:

```bash
FORGE_PYTHON=python3 \
FORGE_VALIDATE_BIN=target/debug/forge-validate \
FORGE_CATALOG_DIR=catalog \
FORGE_SOURCE_REVISION="$(git rev-parse HEAD)" \
FORGE_REQUIRE_CLEAN_EVIDENCE=1 \
pnpm codesign:engine-batch -- --out /tmp/p9-engine-batch.json
```

It first evaluates seven exact hashes and retains the checkpoint, then records a
zero-dispatch cancellation at ordinal seven, resumes the remaining 193, and requires
one contiguous complete 200-row result. Every row runs native validation; only
native/Rapier-passing rows run the short pinned MuJoCo rollout through catalog-bound
bundle v3, physics authority v1, and exact compiled-mass closure. The complete result
derives admission and Pareto itself and selects up to three engine-admitted Pareto
candidates as tier-3-held finalists. The exact D65 fixture has two real battery
revisions; driver-only variations share mass/endurance within each revision, so its
expected physical front is exactly two points and two held finalists. That is a
catalog-binding/recovery proof, not P9's separate `>=3` phase-exit evidence. Each row
must retain the D12 table as rejected/inapplicable and bind all named analytic
fallbacks; it may not claim applicable catalog thrust. The run records measured
local engine/attempt wall runtime only. Catalog-choice evaluation is true and exact,
while marketplace review, live catalog persistence,
`overnight200Candidate`, trained-finalist, provider sandbox/billing, energy, build,
hardware, and field authority remain false. Protected artifact `8402573520` at
`ad54ab3` is the current canonical retained v4 execution: 200/200 evaluated, 97
admitted, two physical front points, and two held finalists after 7 + zero-dispatch
cancel + 193 resume.

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
D64 v3 retains that boundary: catalog-backed local evidence is not a new queue kind,
marketplace publication approval, saved Studio front, or provider operation.

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
Apple-arm64/Linux-x86-64 divergence is tracked under P9-006/R34. D63's protected v2
adds exact runtime-authority/hash/cache/scheduler/candidate validation,
foreign-runtime refusal, two cross-platform comparison-policy tests, and focused
search/batch coverage. Eleven focused tests and all 44 local/PR/protected gates pass
with 244 worker, 74 Gateway, and 39 Studio tests. PR #113, artifact `8397860593`,
and comparison `d255c441…6562` supply the clean protected Linux/Apple evidence and
close P9-006 without granting portability, heterogeneous resume, or tier 3.

D64 adds cross-language file-catalog authority hashing, exact two-revision choice
coverage, equipped-only HUD/proof semantics, capacity/discharge mirror checks,
license/export/review binding, catalog-aware native v2, plan/checkpoint/candidate
tamper refusal, and real one-candidate native/Rapier/MuJoCo integration. The v3
search smoke independently recomputes catalog row and aggregate hashes. PR #115 and
protected artifact `8399829664` retain the clean full 200-row CI proof; it still
cannot be called an overnight/provider or trained-finalist result.

## 8. Phase mapping & backlog

P9: P9-001..006. Ships only once P7 training is routine ("boring") — the ladder's
tiers 2/3 lean on it.

## 9. Open questions

Objective specification UX (constraint sliders vs NL brief parsed to objectives —
likely both, NL compiling to the structured form); warm-starting policies across
morphology neighbors at tier 2; population-size defaults per archetype.
