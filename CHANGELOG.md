# CHANGELOG

This file is the project's memory between working sessions. **Every session — human or
AI agent — appends an entry here before it ends.** Newest entries first. Never rewrite
or delete prior entries; append corrections as new entries instead.

Entry format (see [`AGENTS.md`](AGENTS.md) for the rules):

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

## 2026-07-18 — Compile Studio before D69 production pruning
**Session:** Codex agent · branch `codex/ops002-hardened-runtime` ·
**Phase:** OPS/QA · **TODO items:** OPS-002 [~]
**Done:** Diagnosed protected CI run `29637289827`/job `88061808590`: the explicit
non-interactive pnpm deployment completed, then Studio could not find `tsc` because
the gateway's legacy production deploy had correctly removed workspace development
dependencies. Reordered the web stage so gateway and Studio both compile before the
gateway-only production deployment prunes dependencies, and made that order a D69
repository invariant.
**Evidence:** BuildKit passed dependency resolution and the non-interactive production
install; the failure was the subsequent `tsc` lookup. Focused validation and another
protected Docker run remain required.
**Changed:** hardened runtime Dockerfile, D69 repository validation, and changelog.
**Decisions:** none; build-only tools must not survive in the gateway runtime image,
but every build consumer must finish before pruning them.
**Next:** Push the corrected build order and continue through image, SBOM, scan, and
runtime acceptance.
**Blockers:** No repository blocker. Docker-only acceptance remains pending in CI.

## 2026-07-18 — Make the D69 pnpm image build non-interactive
**Session:** Codex agent · branch `codex/ops002-hardened-runtime` ·
**Phase:** OPS/QA · **TODO items:** OPS-002 [~]
**Done:** Diagnosed protected CI run `29637189342`/job `88061558009`: Buildx
accepted the Docker load plus max build-record provenance contract and entered the
real build, then `pnpm deploy --legacy` fail-closed when its production install would
have purged a modules directory without a TTY. Made `CI=true` explicit in the pinned
web build stage and added a repository assertion that non-interactive authority stays
ahead of every pnpm install/deploy operation.
**Evidence:** The failure occurred in the web-build layer after dependency resolution,
not in Buildx startup or export. Focused D69 validation and replacement protected CI
remain required before acceptance.
**Changed:** hardened runtime Dockerfile, D69 repository validation, and changelog.
**Decisions:** none; no install prompt or implicit terminal authority is permitted in
a reproducible image build.
**Next:** Push the correction and continue through all remaining container-only gates.
**Blockers:** No repository blocker. Docker-only acceptance remains pending in CI.

## 2026-07-18 — Separate D69 build-record provenance from image loading
**Session:** Codex agent · branch `codex/ops002-hardened-runtime` ·
**Phase:** OPS/QA · **TODO items:** OPS-002 [~]
**Done:** Diagnosed replacement CI run `29637045157`/job `88061184732`:
the pinned Buildx container driver booted successfully, but the Docker exporter
refused the attestation manifest list before reading the Dockerfile. Applied the
documented single-platform Docker-store boundary: each loaded CI image disables the
unsupported attached attestation while `BUILDX_METADATA_PROVENANCE=max` retains full
BuildKit build-record provenance in the per-image metadata file; Buildx warnings are
retained too. Repository validation now fixes that distinction for all three targets.
**Evidence:** Docker's current Buildx reference confirms that the default Docker image
store does not persist attestations and independently defines max provenance in
`--metadata-file`. Focused repository and protected replacement verification remain
required before this correction is accepted.
**Changed:** hardened-image CI export flags, metadata environment, D69 repository
validation, and this changelog entry.
**Decisions:** none; registry publication must attach provenance under the later
managed-sandbox promotion gate, while this CI proof remains contract/fixture only.
**Next:** Push the correction and inspect the first real Dockerfile build, SBOM,
vulnerability scan, and runtime smoke result.
**Blockers:** No repository blocker. Docker-only acceptance remains pending in CI.

## 2026-07-18 — Repair D69 provenance builder selection
**Session:** Codex agent · branch `codex/ops002-hardened-runtime` ·
**Phase:** OPS/QA · **TODO items:** OPS-002 [~]
**Done:** Diagnosed the first protected `hardened runtime images` run
`29636900716`/job `88060820517`: the contract gate passed 7/7, then BuildKit
correctly refused provenance attestations under GitHub's default Docker driver.
Selected upstream immutable release `docker/setup-buildx-action` v4.2.0 at exact
commit `bb05f3f5519dd87d3ba754cc423b652a5edd6d2c`, added its Buildx container driver
before the image builds, and admitted only that exact revision to the repository
Actions allowlist.
**Evidence:** The amended workflow parses as YAML, `pnpm verify:workflows` accepts all
74 immutable action references across four files, and `git diff --check` is clean.
Container build, SBOM, fixed-vulnerability, and runtime-smoke evidence still require
the replacement protected PR run and are not claimed here.
**Changed:** `.github/workflows/ci.yml`, repository Actions selected-action policy,
and this changelog entry.
**Decisions:** none; D69 and R38 remain active unchanged.
**Next:** Push the repair, inspect every Docker-only stage, then add the green context
to the protected-main ruleset and reconcile the exact evidence artifact.
**Blockers:** No repository blocker. Docker-only acceptance remains pending in CI.

## 2026-07-18 — Build the D69 hardened runtime candidate
**Session:** Codex agent · branch `codex/ops002-hardened-runtime` ·
**Phase:** OPS/QA · **TODO items:** OPS-002 [~]
**Done:** Implemented the dependency-complete repository side of D69 without claiming
a managed environment. `forge-hardened-runtime/1.0.0` now governs reviewed exact
base/service/evidence-tool digests, three multi-stage application targets, numeric
non-root identities, read-only roots, explicit writable mounts, file-mounted secret
loading, TLS edge and object storage, private data-plane networks, bounded stateful
initializers, dropped capabilities, finite PID/CPU/memory limits, forward migration,
readiness/liveness, graceful termination, and permanent maturity nonclaims. Gateway
and workers bind their exact image artifact digest to the D68 startup manifest. A new
CI job builds the targets, emits BuildKit provenance metadata and SPDX SBOMs, scans
fixed vulnerabilities, and exercises TLS, isolation headers, effective identities,
filesystem/capability/resource/network/port boundaries, readiness, clean stop, and
same-artifact restart.
**Evidence:** `pnpm verify` passes all 46 required local gates under Python 3.12.13:
11 D68 tests, 7 D69 tests, 22 compatibility surfaces, 18 golden families, generated
82-route/two-event/seventeen-worker docs, 39 Studio tests, 81 Gateway tests, and 255
worker tests plus Rust/WASM parity, Brief-25 25/25, packaging, training, MJX, exact
co-design recovery, and patch hygiene. The hardened Compose profile renders with
explicit fixture inputs. The local Docker daemon is unavailable, so image build and
runtime evidence is intentionally deferred to protected GitHub CI.
**Changed:** D69 runtime/Compose/Docker/nginx contracts and tests; Gateway/worker
secret, artifact-startup, readiness, migration, and termination paths; CI image
evidence job; compatibility 1.0.0 surface; generated API/artifact docs; golden
registry/update record; `AGENTS.md`, operations, roadmaps, task ledger, threat model,
governance, architecture, best practices, project state, decisions, and risk ledger.
**Decisions:** D69. R38 records false container, rollback, and managed-maturity risk.
**Next:** Protect this exact candidate in PR CI, retain and inspect the image evidence,
make `hardened runtime images` the seventh merge-blocking check, and correct any
container-only failure. A later managed sandbox must publish immutable registry
artifacts and prove install, upgrade, rollback, and corrected roll-forward before
OPS-002 can close.
**Blockers:** No repository implementation blocker. There is no local Docker daemon,
immutable application registry publication, active sandbox manifest, managed
sandbox, rollback observation, live service, production service, or external beta.

## 2026-07-18 — Reconcile protected D68 deployment-contract evidence
**Session:** Codex agent · branch `codex/ops001-protected-evidence` ·
**Phase:** OPS/QA · **TODO items:** OPS-001 [x]
**Done:** Closed OPS-001 at protected contract/fixture maturity without promoting any
managed environment. PR #123 exact implementation head `a028acd29e574dd0a4ffc55fb49a9c172176c785`
passed all eleven required checks, CI `29634700980`, and security `29634700969`.
Protected squash `401dac84a143c6ee09e1f8eb2f1723eefd1d5a1a` passed post-merge CI
`29634987939` and security `29634987955`: core, Desktop, workers, TypeScript,
isolated Postgres/production-browser, supported-browser/accessibility, dependency
audit, both CodeQL languages, and the validated SPDX source SBOM are green.
**Evidence:** The exact implementation head passed all 45 local gates under Python
3.12.13, including 11 deployment-policy tests, 21 compatibility surfaces, 17 golden
families, 81 routes/two events/17 worker families, 77 Gateway and 251 worker tests,
Brief-25 25/25, native/WASM parity, packaging, training/offline/MJX/co-design, and
the 200/97/two-Pareto/two-held recovery batch. The stable active ledger is now 206
tasks: 151 done, 31 in progress, 23 open, and one blocked; 55 remain.
**Changed:** Canonical `AGENTS.md`; project-state, phase roadmap, execution roadmap,
stable TODO ledger, and changelog evidence language only. No runtime, schema,
migration, golden artifact, compatibility surface, dependency, or deployment
authority changed in this reconciliation.
**Decisions:** none. D68 and R37 remain active unchanged.
**Next:** Execute OPS-002: produce immutable non-root hardened deployable artifacts,
pin their digests, prove filesystem/network/health/resource constraints, and retain a
clean sandbox install plus rollback before starting OPS-003 observability.
**Blockers:** No local OPS-002 design blocker. No deployment substrate, sandbox,
staging, production, real secret rotation, SLO/backup/incident/capacity proof, live
service, or external beta exists; OPS-002..010 remain required.

## 2026-07-18 — Bind managed deployments to one exact D68 contract
**Session:** Codex agent · branch `codex/ops001-deployment-contract` ·
**Phase:** OPS/QA · **TODO items:** OPS-001 [~]
**Done:** Implemented the OPS-001 contract/fixture candidate without claiming a
managed environment. D68 fixes the first single-region topology, six environment
classes, accountable roles, non-secret configuration inventory, versioned
environment-specific secret references, normal/emergency rotation, direct build-once
promotion ladder, forward-only database rule, and explicit authority ceilings.
`forge-deployment-manifest/1.0.0` is a strict compatibility surface. Offline checks
validate policy, manifests, and exact promotion; managed gateway and worker startup
independently hash and bind the active manifest, source revision, environment, and
required component. `OPERATIONS.md` owns the dependency-complete OPS-002..010 path.
**Evidence:** `pnpm verify:deployment` passes 11/11 policy/adversarial tests and the
runtime-variable/document consistency scan. Compatibility exact-matches 21 surfaces;
generated docs verify 81 routes, two event families, and seventeen worker families.
Gateway typecheck and 77/77 tests pass. Python 3.12.13 passes 7/7 focused deployment/
object tests and all 251 worker tests. Three append-only golden records cover the new
registered policy/schema and generated compatibility output. The cumulative
`pnpm verify` passes all 45 required local gates, including Rust/WASM exact parity,
Brief-25 25/25, release packaging, four-morphology/offline/MJX training, and the exact
200-candidate pause/cancel/resume batch with 97 admissions, two Pareto points, and two
held finalists. Protected evidence remains pending.
**Changed:** Deployment policy/schema/checker/tests; gateway and worker bootstrap;
worker object-production alias; compatibility/generated docs/golden registry;
canonical `AGENTS.md`, operations/best-practices/governance/architecture guidance,
project state, roadmap, TODO, risk register, README, and verification wiring.
**Decisions:** D68. R37 records deployment/configuration/promotion-drift risk.
**Next:** Publish the exact fully verified candidate through protected review,
reconcile post-merge evidence, and only then mark
OPS-001 `[x]`. Start OPS-002 with immutable non-root deployable artifacts afterward.
**Blockers:** No implementation blocker. No sandbox, staging, production, real secret
rotation, deployment substrate, SLO/backup/incident/capacity proof, live service, or
external beta exists; OPS-002..010 remain required.

## 2026-07-17 — Reconcile protected D67 exact-grid readback evidence
**Session:** Codex agent · branch `codex/p9006-d67-protected-evidence` ·
**Phase:** P9/QA · **TODO items:** P9-002 [~], P9-003 [~]
**Done:** Protected D67's exact-grid retention, independent full-curve readback, and
v5 recovery boundary through PR #121. Exact head `3bd22bc`, GitHub reviewed merge
`e4c836c`, reviewed/protected tree `1d8f50f`, protected squash `08e880b`, PR CI/
security `29580572145`/`29580572132`, and post-merge CI/security
`29581121537`/`29581121450` pass. Head, reviewed merge, and protected squash all
carry the same tree.
**Evidence:** All 44 local gates and all 11 PR checks pass under Python 3.12.13 with
56 `forge-sim`, 39 Studio, 74 Gateway, and 248 worker tests plus native/WASM,
generated/golden, database/browser, Brief-25 25/25, package, training/offline/MJX,
co-design, and security gates. Downloaded protected artifact `8407177912` binds a
clean source/checkout to `08e880b`. Its `p9-engine-batch.json` SHA-256 is
`ab956b4a…de06`, result SHA-256 is `137a066f…16645`, and exact recovery retains
7 + zero-dispatch cancel + 193 resume before evaluating 200/200, admitting 97, and
returning two Pareto points/two held finalists. The artifact binds bundle v4,
catalog-physics v2, curve-readback v1, training-authority v2, and batch/evidence v5.
**Changed:** Canonical `AGENTS.md`; project state, roadmap, TODO, execution order,
co-design system contract, generated artifact maturity source/output, golden-review
record, and changelog.
**Decisions:** No new decision. D67 and R36 remain authoritative; this change records
protected evidence without broadening their physical claims.
**Next:** Source and owner-review a voltage-covered, 5×4.3-prop-matched bench grid as
a new immutable component revision, or retain the named analytic fallback. Any real
row must pass protected D67 before tier 3. Separately produce a course-conditioned
`>=3` physical front and retained overnight/provider billing proof.
**Blockers:** The only applicable grid remains controlled-synthetic test data. The
checked-in EMAX row remains v1, review-gated, 25.2 V/5×4.6, and rejected for the
14.8–16.8 V/5×4.3 fixture. Sourced/applicable thrust, owner review, tier 3,
marketplace/live catalog, provider billing, build, hardware, field, and external
evidence remain open.

## 2026-07-17 — Bind exact catalog grids to independent curve readback
**Session:** Codex agent · branch `codex/p9006-exact-grid-readback` · **Phase:** P9 ·
**TODO items:** P9-002 [~], P9-003 [~]
**Done:** Implemented D67's coordinated internal authority majors without changing
file-catalog data or the v3 search plan. Catalog multirotor bundle 4.0.0 and
`forge-training-catalog-physics/2.0.0` retain every exact SI bench point, row major,
table identity, prop, confidence, source, range, and applicability result. Child
`forge-training-catalog-curve-readback/1.0.0` freezes the selected table and complete
101-point/fixed-point recipe. Python independently validates rectangularity,
coordinate uniqueness, endpoints, and monotonicity, then reconstructs every Rust
total-thrust/normalized-voltage/normalized-current point before accepting table-
driven model `catalog-motor-battery-exact-grid-readback-v2`. Rejected tables emit
null selection and `tableDriven=false`. Training-authority 2.0.0 and co-design batch/
evidence 5.0.0 bind exact-grid/readback truth through cache, checkpoint, resume, and
every tier-2 candidate.
**Evidence:** Focused Rust CLI tests pass 3/3; Python catalog-bundle and co-design-
batch tests pass 14/14; compatibility exact-matches all 20 top-level surfaces. A
controlled-synthetic 10.0/16.8 V × 0/0.5/1 test grid proves exact retention,
independent all-101 readback, point/curve tamper refusal, and refusal when fixed-point
sag would leave the measured voltage axis, without modifying the catalog. The local
dirty-tree 200-row smoke preserves 7 + zero-dispatch cancel + 193
resume, evaluates 200/200, admits 97, and returns two Pareto points/two tier-3-held
finalists. Its evidence/result hashes are `9dfc41e1…9efe`/`d747d8fd…c0c66`. Full
`pnpm verify` passes all 44 required local gates under Python 3.12.13, including 56
`forge-sim` tests, native/WASM parity, generated/golden review, 39 Studio, 74 Gateway,
248 worker tests, Brief-25 25/25, packaging, training/offline/MJX, a second exact D67
200/97/two-point/two-held batch, and patch hygiene. Protected evidence is pending.
**Changed:** Rust catalog training authority and CLI expectations; Python training
readback, batch authority, and adversarial tests; batch smoke; compatibility matrix/
checker; generated-contract source; D67 decision; canonical `AGENTS.md` entry guide;
project state, roadmap, TODO, execution order, simulation/co-design contracts, best
practices, risk register, compatibility guide, and changelog.
**Decisions:** D67; R36 now covers exact-grid/readback drift and synthetic-proof
overstatement.
**Next:** Protect the exact D67 tree. After protection, source and owner-review an
applicable voltage/prop grid or keep analytic fallback explicit; pass any real row
through D67 before tier 3, then produce the separate course-conditioned `>=3` front
and retained overnight/provider billing proof.
**Blockers:** No sourced, owner-reviewed 14.8–16.8 V/5×4.3 grid exists. The current
EMAX row remains v1, review-gated, and 25.2 V/5×4.6, so it is retained but rejected
and named analytic fallbacks still drive the curve. Protected D67, tier-3 finalists,
`>=3` phase exit, provider billing, marketplace/live-catalog, build, hardware, field,
and external evidence remain open.

## 2026-07-17 — Reconcile protected D66 performance-grid evidence
**Session:** Codex agent · branch `codex/p9005-per-point-voltage-evidence` ·
**Phase:** P3/P9/QA · **TODO items:** P3-010 [x], P9-002 [~], P9-003 [~],
QA-007 [x]
**Done:** Protected D66 file-catalog row 2.0.0 and migration 0027 through PR #119.
Exact head `7306a6e`, GitHub reviewed merge `0050bcb`, reviewed tree `f5a9a323`,
protected squash `5a162b0`, and the protected tree are exact. PR CI/security
`29575066749`/`29575066748` and post-merge CI/security
`29575647835`/`29575647768` pass.
**Evidence:** All 44 local gates and all 11 PR checks pass with 20 compatibility
surfaces, nine/99 boundary cases, 39 Studio, 74 Gateway, 247 worker tests, Brief-25
25/25, and unchanged D65 200/97/two-point/two-held behavior. Downloaded protected
artifact `8405061774` binds clean source/checkout `5a162b0`. Its
`qa004-migration-acceptance.json` SHA-256 is `d6764fec…313a` and records PostgreSQL
16.14, pgvector 0.8.5, all 27 migrations, a clean idempotent install, exact populated-
data preservation and idempotency for every predecessor 0001–0026, atomic rollback/
corrected roll-forward, checksum/gap refusal, and serialized apply-once concurrency.
The browser, accessibility, fault, policy-delivery, and provider-operation evidence
in the same artifact also passes at the exact protected revision.
**Changed:** Reconciled the canonical `AGENTS.md` entry guide, project-state snapshot,
roadmap, stable TODO ledger, execution order, co-design system contract, and changelog
against exact protected evidence. No code, catalog row, format, schema, generated
contract, API, event, database migration, queue, provider, build, hardware, or field
surface changed.
**Decisions:** none; D66 and R36 remain active without reinterpretation.
**Next:** Source and owner-review a voltage-covered, 5×4.3 prop-matched grid or keep
the named analytic fallback. Create a new immutable component revision and, before
the grid drives training, add a coordinated exact-grid/curve-readback bundle/physics
major with independent Python reconstruction. Then execute tier 3, the separate
course-conditioned `>=3` front, and retained overnight/provider billing proof.
**Blockers:** D66 proves representation and migration, not measurements or review.
Applicable sourced data, downstream authority, actual trained finalists, the `>=3`
phase exit, provider billing, marketplace/live-catalog maturity, external acceptance,
build, hardware, and field proof remain separate gates.

## 2026-07-17 — Version catalog performance grids per voltage point
**Session:** Codex agent · branch `codex/p9004-per-point-voltage-catalog` · **Phase:**
P3/P9/QA · **TODO items:** P3-010 [x], P9-002 [~], P9-003 [~], QA-007 [x]
**Done:** Implemented D66 file-catalog row 2.0.0 without reinterpreting historical
rows or D65 artifacts. Missing/explicit v1 remains one table-level-voltage sweep;
v2 requires voltage on every point. Rust admission and Python ETL exact-match
supported majors and require finite bounded rectangular grids, unique coordinates,
exact throttle endpoints, nondecreasing thrust/current, stable table IDs, prop,
positive confidence, and HTTPS source. Generic thrust-table construction now refuses
non-finite, out-of-bounds, duplicate, and nonmonotonic inputs. Migration 0027 adds
table identity and row version/authority metadata, preserves old points as
`legacy-unattributed` v1 with null missing authority, and prevents distinct tables
from colliding at one component/voltage/throttle coordinate. The current EMAX row
stays v1, review-gated, and D65-inapplicable.
**Evidence:** All 44 required local non-database gates pass under Python 3.12.13,
including Rust fmt/Clippy/workspace tests, native/WASM/schema/golden/compatibility,
81-route/2-event/17-worker generated docs, 39 Studio, 74 Gateway, 247 worker tests,
Brief-25 25/25, packaging, training/offline/MJX, and the unchanged D65 200/97/two-
point/two-held batch. Focused `forge-sim` thrust-table tests pass 4/4; the ten-case Rust
catalog-grid corpus consumer and existing seven proof-pair tests pass; Python 3.12
ETL/boundary tests pass 20/20. The registered boundary family reports nine surfaces/
99 stable cases and compatibility exact-matches twenty top-level surfaces. Migration
0027 separately passes on a fresh PostgreSQL 16 cluster: two populated legacy rows
including RPM survive exactly, the new primary key is exact, two complete v2 table
identities coexist, and incomplete v2 authority refuses. Full clean/every-populated-
predecessor `verify:db` is pending because the pre-existing Docker volume fails before
migration with `global/pg_filenode.map` I/O error; protected CI remains required.
**Changed:** Rust contract/simulation/file-catalog parsing; Python extraction
validation; D66 adversarial corpus and cross-language consumers; compatibility
matrix/checker; Postgres migration/seed/assertions; generated artifact docs and
append-only golden review; decision, compatibility, migration, system, best-practice,
risk, project-state, roadmap, execution, TODO, changelog, and canonical `AGENTS.md`
owners.
**Decisions:** D66; R36 remains active and now covers format-support/data-authority
confusion and migration fabrication.
**Next:** Protect the exact D66 tree and let clean CI supply the all-populated-
predecessor database/browser proof, then reconcile and source/owner-review a voltage-covered,
prop-matched grid. Before that grid drives training, introduce a new exact-grid/
curve-readback bundle/physics authority major; only then execute tier 3.
**Blockers:** No sourced reviewed applicable grid exists. D66 supplies representation,
not measurements or review. Protection, downstream authority, tier-3 scorecards, the
course-conditioned `>=3` front, retained overnight/provider billing, marketplace/
live-catalog maturity, external acceptance, build, hardware, and field proof remain
separate gates.

## 2026-07-17 — Reconcile protected D65 catalog-physics evidence
**Session:** Codex agent · branch `codex/p9003-catalog-physics-evidence` · **Phase:**
P9 · **TODO items:** P9-002 [~], P9-003 [~]
**Done:** Protected the D65 bundle-v3/catalog-physics-v1/batch-v4 implementation
through PR #117. Exact head `d8d18ad`, GitHub reviewed merge `2589e399`, reviewed
tree `8051c127`, protected squash `ad54ab3`, and the protected tree are exact. PR
CI/security `29568639154`/`29568639106` and post-merge CI/security
`29569424726`/`29569424612` pass. Downloaded protected artifact `8402573520`
self-binds to clean protected source `ad54ab3`; the retained batch file/result
SHA-256 values are `f9af2002…ce25`/`cf1504ba…5e84` and its search-plan hash is
`52ea77a6…5212`.
**Evidence:** The protected run retains 7 + zero-dispatch cancel + 193 resume,
evaluates 200/200 exact candidates through native/Rapier/MuJoCo, admits 97, and
returns two Pareto points/two tier-3-held finalists. The 1,500 mAh and 1,300 mAh
finalists close exact catalog-native masses at 0.769 kg and 0.756 kg and bind their
bundle/catalog-physics hashes. Both retain `catalogBenchTableUsed=false`, the exact
25.2 V/5×4.6 rejection lineage, and named resistance/current/prop/`DEFAULT_CT`
fallbacks. All 44 local, PR, and protected gates pass under Python 3.12.13 with 246
worker, 74 Gateway, and 39 Studio tests. The retained artifact keeps applicable-
catalog-thrust, trained-finalist, overnight/provider billing, marketplace/live-
catalog, build, hardware, field, and external claims false.
**Changed:** Reconciled the current-state snapshot, roadmap, stable TODO ledger,
execution order, co-design system contract, canonical `AGENTS.md` entry guidance,
and changelog against exact protected evidence. No code, catalog row, format,
schema, generated contract, API, event, database, queue, provider, build, hardware,
or field surface changed.
**Decisions:** none; D65 and R36 remain active without reinterpretation.
**Next:** Version the file-catalog bench row/loader for sourced per-point voltages
with compatibility, old-row migration/read semantics, corpus, and golden proof;
then source/review a voltage-covered prop-matched grid or retain the analytic
fallback. After that, run actual tier-3 training/scorecards for the exact protected
finalists, expand the course-conditioned physical front to `>=3`, and retain the
reviewed provider/overnight billing proof.
**Blockers:** The current one-voltage-per-table format cannot represent a
non-degenerate range-spanning grid. Applicable reviewed bench data, tier-3
training, the `>=3` phase exit, retained overnight/provider billing, marketplace/
live-catalog maturity, external acceptance, build, hardware, and field proof remain
separate open gates.

## 2026-07-17 — Bind catalog mass and fail-close bench-table applicability
**Session:** Codex agent · branch `codex/p9003-catalog-training-physics` · **Phase:**
P9 · **TODO items:** P9-002 [~], P9-003 [~]
**Done:** Implemented D65 without reinterpreting inline multirotor bundle v2, ground
bundle v1, or D64 batch v3. `trainingMuJoCoBundle` 3.0.0 and
`forge-training-catalog-physics/1.0.0` bind complete catalog/equipped-row hashes,
exact catalog mass, sourced-dimension uniform-solid motor/battery inertia at every
declared mount, review/license state, machine-readable inline fallbacks, and exact
compiled MuJoCo mass closure. The HUD and training path now use a bench table only
when its voltage grid covers the equipped battery range and diameter×pitch matches
the equipped prop; multiple applicable tables fail closed rather than inheriting
array-order precedence. The current 25.2 V/5×4.6 record is retained but rejected for the
14.8–16.8 V/5×4.3 fixture; the analytic fallback replaces the prior unsafe edge
clamp. Batch/evidence 4.0.0 plus `forge-codesign-training-authority/1.0.0` bind exact
bundle/physics hashes and table-use status per tier-2 rollout.
**Evidence:** All 44 required local gates pass under Python 3.12.13, including 246
worker, 74 Gateway, and 39 Studio tests, Rust workspace fmt/Clippy/tests, WASM/schema/
TypeScript parity, Brief-25 25/25, 19-surface compatibility, generated contract docs,
training/offline/MJX/co-design smokes, and patch hygiene. `forge-sim` passes 55 unit
plus 5 boundary-corpus tests; focused Rust CLI tests pass 3/3; focused Python bundle/
batch tests pass 13/13, including independent uniform-solid inertia/COM readback.
Manual pinned MuJoCo 3.9.0
compilation reports body-mass sum exactly equal to bundle mass at 0.769 kg, full
thrust 24.969915 N, and hover trim 0.502424. A dirty-tree local batch v4 smoke
retains 7 + zero-dispatch cancel + 193 resume, evaluates 200/200 through native/
Rapier/MuJoCo, admits 97, and returns two physical battery points/two tier-3-held
finalists. It permanently reports `catalogBenchTableUsed=false`, local execution,
no provider billing, and no overnight completion. The current official [EMAX ECO II
page](https://emaxmodel.com/products/emax-eco-ii-series-2207-3-6s-1700kv-1900kv-2400kv-brushless-motor-for-rc-drone-fpv-racing)
was rechecked and supplies no applicable performance grid in published text.
**Changed:** Rust MJCF lumped-inertial export, catalog powertrain/HUD/training-bundle
producer and CLI; Python exact bundle/MuJoCo/batch validators; compatibility matrix,
focused tests, smoke/CI contract, generated-document source, AGENTS entry guidance,
decision/state/roadmap/TODO/execution, and simulation/training/worker/co-design docs.
The component-database guide now records the one-voltage-per-table representation
gate. No catalog row, public schema, queue kind, API, event, database, inline/ground bundle,
provider, build, hardware, or field format changed.
**Decisions:** D65; R36. D65 records the applicability gate and explicit nonclaims;
R36 watches false propulsion authority; D66 is the next regular decision ID.
**Next:** Inspect and commit the complete locally verified diff, protect the exact
reviewed tree through PR and post-merge CI/security, retain/reconcile a clean 200-row
artifact, then execute actual tier-3 training/scorecards for the exact finalists.
Separately version the file row/loader for sourced per-point voltages with compatibility/
migration/corpus proof, then obtain reviewed voltage-covered, prop-matched bench data
or keep the analytic fallback explicit, and expand the course-conditioned manifold to `>=3`.
**Blockers:** D65 has no protected evidence yet. The current one-voltage-per-table
file format cannot represent an applicable range-spanning grid; its versioned upgrade,
applicable catalog bench data, catalog review/live persistence, tier-3 training, a `>=3` course-conditioned front,
retained overnight/provider billing, external acceptance, build, hardware, and field
maturity remain separate open gates.

## 2026-07-17 — Reconcile protected D64 catalog co-design evidence
**Session:** Codex agent · branch `codex/p9002-catalog-evidence` · **Phase:** P9 ·
**TODO items:** P9-002 [~], P9-003 [~]
**Done:** Protected D64 at exact-runtime-scoped
`local-catalog-engine-200-batch` maturity. PR #115 exact head `b13a817`, reviewed
tree `9934442`, PR CI/security `29561709484`/`29561709504`, protected squash
`609a70d`, byte-identical protected tree, and post-merge CI/security
`29562278744`/`29562278736` pass. Downloaded protected artifact `8399829664`
self-binds to clean source `609a70d`; its batch evidence/result SHA-256 values are
`208d5103…45b8`/`8353900e…a4c`, search-plan evidence/plan values are
`f4dee0ce…98cf`/`19871d39…5bac`, and catalog/runtime authorities are
`f6a7171f…9262`/`31a205c8…725c`.
**Evidence:** The protected batch retains the exact 7 + zero-dispatch cancel + 193
resume sequence, evaluates 200/200 exact hashes through catalog-aware native v2,
Rapier 0.33.0, and MuJoCo 3.9.0, admits 197, and returns the physically expected
two-choice/two-point front with two tier-3-held finalists. The retained artifact
keeps overnight completion, provider billing, trained-finalist, marketplace review,
live catalog persistence, build, hardware, and field authority false. All 44
protected gates pass, including 246 worker, 74 Gateway, 39 Studio, Rust/WASM/schema,
compatibility, security, isolated Postgres, real-browser, and accessibility proof.
**Changed:** Reconciled `AGENTS.md`, current state, roadmap, TODO ledger, execution
sequencing, and the co-design system boundary. No runtime, schema, API, event, queue,
database, catalog row, golden artifact, provider, training, build, hardware, or field
format changed.
**Decisions:** none; D64/R35 remain the governing semantics and risk.
**Next:** Add catalog-native MuJoCo training-bundle physics under a new versioned
contract, then execute actual tier-3 training/scorecards for admitted catalog
finalists. Separately add a physical manifold that can prove the `>=3` front and
retain a real overnight/provider schedule with billing evidence.
**Blockers:** P9 closure still lacks catalog-native tier-2 physics, three admitted
physical Pareto points for the course objective, trained-finalist scorecards,
retained overnight/provider billing, and external acceptance. Marketplace approval,
hardware, field, and live-provider maturity remain independent gates.

## 2026-07-17 — Bind co-design to exact equipped catalog revisions
**Session:** Codex agent · branch `codex/p9002-catalog-categorical` · **Phase:** P9 ·
**TODO items:** P9-002 [~], P9-003 [~]
**Done:** Implemented D64's coordinated catalog-backed co-design majors without
reinterpreting D60-D63 v1/v2. Search-plan/evidence and engine-batch/evidence v3 now
search the two exact lockfile-pinned CNHL battery variants, bind sorted raw catalog
and per-row SHA-256 authority, retain review/license/export lineage, synchronize the
D32 equipped variant with exact inline capacity/discharge mirrors, and bind both
catalog and numeric-runtime authority through cache/checkpoint/resume/candidates.
Native evaluation v2 re-runs the sovereign validator with `FileCatalog` and emits
equipped-only catalog proof; optional `--catalog` also lets training-bundle v2 admit
the same contract while preserving its documented inline-mirror physics.
**Evidence:** Focused worker search/batch tests pass 12/12. Rust catalog tests prove
both equipped revisions, unequipped exclusion, HUD mass response, and deterministic
catalog binding. The independent v3 search smoke recomputes the file/row/choice/plan
hashes and emits 100 CMA-ES plus 100 TPE proposals spanning both exact revisions. A
complete dirty-tree local smoke retains 7 + zero-dispatch cancel + 193 resume,
evaluates 200/200 through catalog-aware native v2, Rapier 0.33.0, and MuJoCo 3.9.0,
admits 197, and returns the expected one non-dominated point per real battery choice
with two tier-3-held finalists. Its two-point front is catalog/recovery proof, not the
separate P9 `>=3` phase exit. All 44 required local gates pass under Python 3.12.13
with 246 worker, 74 Gateway, and 39 Studio tests; the registered contract change has
an append-only golden review record. Protected evidence is recorded separately once
it exists; no protected claim is made by this implementation entry.
**Changed:** Rust file-catalog/native/CLI boundaries; proof contract battery variants;
Python search/runtime/batch/training admission; focused tests; source-bound smokes;
compatibility matrices/checks; CI labels; AGENTS entry guidance; project state,
roadmap/TODO/execution, co-design/catalog/best-practice/governance/risk documents.
**Decisions:** D64; R35.
**Next:** Publish a draft PR, protect the exact reviewed tree, retain the complete v3
200-row artifact, and reconcile post-merge evidence before starting catalog-native
bundle physics or tier-3 finalist training.
**Blockers:** Marketplace review/live catalog persistence, catalog-native MuJoCo
mass/inertia/thrust-table authority, tier-3 training, retained overnight/provider
scheduling/billing, and external acceptance remain explicit downstream gates.

## 2026-07-17 — Reconcile protected D62/D63 runtime-authority evidence
**Session:** Codex agent · branch `codex/p9006-d62-evidence-reconciliation` ·
**Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~], P9-006 [x]
**Done:** Closed P9-006 through protected exact-runtime scheduling and refusal, not
through a false cross-platform-identity claim. PR #113 exact head `ceb6bb0`, reviewed
tree `727f6f5`, PR CI/security `29556593780`/`29556593844`, protected squash
`54385c2`, byte-identical protected tree, and post-merge CI/security
`29556995469`/`29556995445` pass. Downloaded protected artifact `8397860593` binds
clean Linux-x86-64 search evidence file `8535d6df…aff0`, plan `97ead643…3c5b`, and
runtime authority `25ee0796…aff7e`; its batch file/result hashes are
`380b6ff1…7f3c`/`9c1abc43…691e` and retain 7 + zero-dispatch cancel + 193 resume,
200 native/123 eligible Rapier-MuJoCo rows, 87 admissions, four Pareto points, and
three tier-3-held finalists. A clean Apple-arm64 search artifact from the exact same
protected source hashes to `cb67fbd2…bf2b`, with plan `7b5db9f6…963c` and authority
`a99337a8…b312`.
**Evidence:** Independent `p9-platform-authority-comparison/1.0.0` output hashes to
`d255c441…6562` with internal comparison digest `61e5faa5…85e3`. It checks 200/200
ordinals: 120 patch/candidate hashes match and 80 differ exactly at CMA-ES ordinals
20–99; the 100 Optuna rows and first 20 CMA-ES rows match. Both inputs are clean,
source-bound to `54385c2`, and carry distinct authority hashes. Policy remains
`exact-proposal-runtime-authority`; heterogeneous resume, cross-runtime cache reuse,
and cross-runtime tier-3 authority are false.
**Changed:** Reconciled the entry guide, current state, roadmap, TODO ledger,
execution sequencing, co-design system contract, compatibility guidance, best
practices, decisions, and R34. No runtime, schema, API, event, queue, database,
golden artifact, provider, catalog, training, build, hardware, or field format
changed.
**Decisions:** D63's protected evidence satisfies D62's explicit-authority branch.
It does not make CMA-ES portable, reinterpret v1, or permit a checkpoint/cache entry
to cross authority hashes.
**Next:** Implement the next dependency-complete P9 slice: replace synthetic
electrical profiles with exact reviewed catalog-choice revisions, then retain
actual finalist training/scorecards and an overnight/provider schedule with billing
evidence.
**Blockers:** P9 closure still lacks real catalog-choice search, actual tier-3
trained-finalist scorecards, retained overnight/provider scheduling and billing,
and external acceptance. P7 accelerator/provider and P8 hardware/field gates remain
separate.

## 2026-07-17 — Bind co-design recovery to exact numeric-runtime authority
**Session:** Codex agent · branch `codex/p9006-d62-platform-authority` ·
**Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~], P9-006 [~]
**Done:** Implemented D62's D63 exact-runtime branch at local candidate maturity.
Coordinated internal search-plan/evidence and engine-batch/evidence 2.0.0 formats now
bind one self-hashed proposal-runtime authority into plan/cache/scheduler/checkpoint/
candidate lineage. It covers OS/kernel/machine/libc/byte order, Python
implementation/version/cache tag, pinned NumPy distribution/configuration/CPU/
BLAS/LAPACK identity, and pinned CMA-ES/Optuna distribution records. Foreign replay,
evaluation, or resume fails before work; heterogeneous resume and portable cache are
false. Focused search/batch tests pass 11/11, comparison-policy tests pass 2/2,
compatibility passes 19 top-level surfaces, and all 44 local gates pass under Python
3.12.13 with 244 worker, 74 Gateway, and 39 Studio tests. Clean exact-source Apple-
arm64 evidence at implementation SHA `092af38` executes 7 + zero-dispatch cancel +
193 resume, evaluates 200 native and 125 eligible Rapier/MuJoCo rows, admits 89,
returns four Pareto points, and retains the same three tier-3-held finalists. Search
evidence file/plan hashes are `0fca560f…8f64`/`45b5e7a7…8c3f`; batch evidence file/
result hashes are `cb869c7f…7938`/`a3e082b7…61b2`; runtime authority is
`a99337a8…b312`.
**Changed:** Exact authority capture/validation, coordinated plan/batch majors,
runtime-partitioned caches, checkpoint/candidate binding, focused/refusal tests,
independent all-200 comparison command/tests, CI/root verification policy, internal
compatibility registrations, generated-contract sources, append-only golden review,
D63, risk/best-practice/governance/system contracts, entry guidance, and all living
P9 execution/status documents. No public API, event, queue kind, database,
ModelSpec, validator report, CLI/WASM facade, Studio result, provider, catalog,
training-policy, build, hardware, or field format changes. The preceding D61
evidence reconciliation is now protected through PR #112/`4ad8c8b`: reviewed tree
`5ef3a5d` is byte-identical, PR CI/security `29554043285`/`29554043269` and
post-merge CI/security `29555056417`/`29555056481` pass.
**Decisions:** D63 selects exact numeric-runtime scheduling/refusal rather than
custom floating-point arithmetic or ad hoc rounding. V1 stays historical; changing
authority fields/hash preimages, cache partitioning, or foreign-runtime refusal
requires coordinated new majors and a superseding decision.
**Next:** Protect the reviewed tree, then compare Linux/Apple artifacts from that
exact protected revision before reconciling P9-006.
**Blockers:** P9-006 still lacks protected same-source cross-platform evidence.
P9 closure separately lacks real catalog choices, actual tier-3 trained-finalist
scorecards, retained overnight/provider scheduling and billing, and external
acceptance.

## 2026-07-17 — Reconcile protected D61 evidence and expose cross-platform plan drift
**Session:** Codex agent · branch `codex/p9003-d61-protected-evidence` ·
**Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~], P9-006 [~]
**Done:** Reconciled D61 from local candidate to protected platform-scoped
`local-engine-200-batch` maturity. Exact implementation head `6c446a5`, reviewed
tree `c6520fd`, PR #111 CI/security `29552818736`/`29552818716`, protected squash
`1c37567`, byte-identical protected tree, and post-merge CI/security
`29553189264`/`29553189257` pass. Downloaded clean protected artifact `8396554544`
contains `p9-engine-batch.json` SHA-256 `66470448…bbd3`, source `1c37567`, result
SHA-256 `6718e9cb…608f`, 200 native and 123 eligible Rapier/MuJoCo evaluations, 87
admissions, four Pareto points, three tier-3-held finalists, and exact 7 + zero-
dispatch cancel + 193 resume proof. Every overnight/provider/catalog/trained/build/
hardware/field nonclaim remains false.
**Changed:** Corrected every living D61 claim and `AGENTS.md` to protected evidence;
added D62, P9-006, R34, compatibility guidance, and best practice for cross-platform
optimizer identity. Download comparison found that Linux x86-64 PR/protected runs
repeat all 200 hashes, while clean Apple-arm64 differs only at CMA-ES ordinals
20–99. The first CMA generation, all 100 TPE rows, the four-point front, and the same
three finalist hashes remain stable. D60/D61 v1 already rejects foreign replay, so
evidence integrity is fail-closed, but portable recovery is not proven.
**Decisions:** D62 makes cross-platform plan identity or explicit platform-bound
scheduling a blocking prerequisite for tier 3, heterogeneous resume, portable cache,
or overnight/provider authority. Any changed replay/hash/cache meaning requires
coordinated D60/D61 internal majors.
**Next:** Protect this evidence reconciliation, then implement P9-006 as the next
dependency-complete local lane before training any finalist.
**Blockers:** P9 still requires cross-platform plan/recovery authority, catalog-
choice search, actual tier-3 scorecards, retained overnight/provider scheduling and
billing, and external acceptance.

## 2026-07-17 — Execute the D61 exact-hash co-design engine batch
**Session:** Codex agent · branch `codex/p9003-d61-engine-batch` ·
**Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~]
**Done:** Implemented D61 at local `local-engine-200-batch` candidate maturity. A
separate versioned batch deterministically replays D60, consumes exactly 200
proposal hashes as one contiguous prefix, reapplies and rehashes every patch and
candidate, and binds each row to its D59-equivalent ladder outcome: native evidence
for all rows and Rapier/MuJoCo evidence where eligible. The batch atomically
checkpoints after every candidate, fences unfinished
attempts before resume, records zero-dispatch cancellation, and withholds Pareto and
finalists until complete. Focused D59/D60/D61 tests pass 14/14; compatibility passes
19 surfaces and generated docs retain 81 routes, two events, and 17 worker families.
The first development smoke executes 7 + cancel + 193, evaluates 200 native and 125
eligible Rapier/MuJoCo rows, admits 89, derives four Pareto points, selects three
tier-3-held finalists, and measures local engine runtime. It correctly
records `worktreeClean=false`, so it is diagnostic rather than acceptance evidence.
All 43 required local gates pass under Python 3.12.7 with 242 worker, 74 Gateway,
and 39 Studio tests plus Rust/WASM/schema/golden/packaging/training/offline/MJX/D59/
D60/D61 and patch-hygiene proof. Clean-source and protected evidence remain pending.
**Changed:** New batch/checkpoint runtime, tests, exact-source smoke, root/CI gate,
internal compatibility registrations, generated artifact reference, append-only
golden review, D61 decision, entry guide, best practices, co-design system contract,
and all living P9 execution/status documents. No public API, queue kind, database,
ModelSpec, validator report, CLI/WASM version, Studio result, provider, catalog,
training-policy, build, hardware, or field format changed. The adjacent D59 producer
now reports tier-1 engine authority only when Rapier evidence actually exists.
**Decisions:** D61 freezes exact-plan consumption, contiguous per-candidate
checkpoint/recovery, complete-only Pareto/finalist selection, measured-local-cost,
and downstream nonclaims. Selected finalists are not trained finalists; local
completion is not overnight/provider billing.
**Next:** Commit the complete reviewed tree, repeat the D61 smoke from that clean
exact source, then protect the implementation and reconcile its
exact PR/post-merge evidence.
**Blockers:** P9 closure still requires catalog choices, actual tier-3 trained-
finalist scorecards, retained overnight/provider scheduling and billing, and external
acceptance. The current D61 implementation itself has no known local blocker.

## 2026-07-17 — Reconcile protected D60 proposal-plan evidence
**Session:** Codex agent · branch `codex/p9002-d60-protected-evidence` ·
**Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~]
**Done:** Reconciled D60's former local candidate with exact protected evidence.
Implementation head `340c88d22b865ef436e7634716149ea7be43ebae` passed PR #109
CI `29549718149` and security `29549718173`; reviewed tree
`7139ad56a129dd941e222259688909cf10117a17` is byte-identical at protected squash
`71e721730b2c060aa759d83b018c1dfaf27d8670`. Post-merge CI `29550088422`,
security `29550088452`, and dependency-graph run `29550090915` pass. The clean
exact-source smoke binds plan SHA-256
`2c82be7f68b2297bd2fae37a652092b0625abb554299817c51308b5468093717` to 100
CMA-ES plus 100 Optuna TPE proposals and 200 unique candidate hashes.
**Changed:** Evidence-only updates to the entry guide, project state, roadmap, TODO,
execution roadmap, and co-design system contract. No executable code, schema,
generated artifact, dependency, API, queue, database, Studio, validator, provider,
hardware, or field meaning changed.
**Decisions:** D60 remains proposal-only even after protection. Protection verifies
algorithm execution, deterministic lineage, and replay; it does not promote any
physical or downstream nonclaim.
**Next:** Define a separately versioned consumer that schedules the exact 200
proposal hashes through sovereign native/Rapier/MuJoCo evaluation with resumable
recovery, cost, admission, and independently derived Pareto evidence.
**Blockers:** P9 closure still requires real catalog choices, 200 sovereign engine
evaluations, retained scheduled/overnight recovery and cost, at least three admitted
Pareto points, trained finalists, provider operations, and external acceptance.

## 2026-07-16 — Execute the D60 co-design proposal plan
**Session:** Codex agent · branch `codex/p9002-d60-search-plan` ·
**Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~]
**Done:** Implemented D60 at local `local-algorithm-proposal-plan` maturity without
claiming physical optimizer closure. One exact gateway-owned admitted inline-
multirotor snapshot now deterministically produces 200 unique proposal snapshots:
100 from real pinned `cmaes==0.13.0` and 100 from real pinned `optuna==4.9.0` TPE.
The plan freezes the seed, constraints, electrical mixed manifold, exact dependency
manifest, replace-only patches, patch/candidate SHA-256 values, and replay. The
request is exact and byte/depth/node bounded; the Node smoke independently reapplies
every patch and recomputes manifest, parameter, candidate, plan, and cache authority.
The acquisition is bounded diversity only and explicitly has no physical objective
or engine feedback. All 42 required local gates pass under Python 3.12.7 with 238
worker, 74 Gateway, and 39 Studio tests; 19 compatibility surfaces, generated 81-
route/2-event/17-worker documentation, native/WASM parity, packaging, training/
offline/MJX/D59/D60 smokes, golden review, and patch hygiene pass. The pinned local
Python audit reports no known vulnerabilities. Remote evidence remains pending
protected publication. The adjacent D59 runtime now derives its aggregate tier-2
hours from the rounded per-candidate values actually serialized into the envelope,
eliminating a timing-boundary readback flake without changing its schema or meaning.
**Changed:** Proposal planner/tests/smoke, exact worker/Modal dependency pins, CI and
security installs, root verification, compatibility matrix/checker, generated
artifact references, append-only golden review, decision/governance/best-practice/
system contracts, and all living execution documents. No public API, database,
queue kind, ModelSpec, validator report, CLI/WASM version, Studio result, physical
engine, provider, catalog, hardware, or field format changed.
**Decisions:** D60 freezes the separately versioned proposal-only boundary and
requires a future engine consumer to attach sovereign evidence to exact proposal
hashes.
**Next:** Protect this exact implementation and then define the separately versioned
200-candidate engine-consumption/scheduling artifact with admission, Pareto, recovery,
cost, and finalist evidence.
**Blockers:** P9 closure still requires catalog choices, sovereign evaluation of the
200 exact proposals, a retained scheduled/overnight run, at least three admitted
Pareto points, tier-3 finalists, provider operations, and external acceptance. A
D60 plan cannot satisfy any of those gates.

## 2026-07-16 — Reconcile protected D59 controlled-engine evidence
**Session:** Codex agent · branch `codex/p9003-d59-protected-evidence` ·
**Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~]
**Done:** Reconciled D59 to protected `local-engine-controlled-smoke` maturity. PR
#106 exact head `e64c601ade7835d9271d11184917601d4a017e0c` passed PR CI
`29545327465` and security `29545327485`; reviewed tree
`08e8a129e9f10634e0ac766456b7e737135e98a0` is byte-identical at protected
squash `fae00c58d1111c4b98fb5e8b84f404e199a3dec7`. Post-merge CI
`29545811003` and security `29545810996` pass; the push-only security run contains
the expected skip for its PR-scoped dependency-review job. The remote implementation
branch was deleted. This protects only the exact admitted-snapshot, three-candidate
release smoke, sovereign native/Rapier/MuJoCo ladder, strict worker/Studio readback,
and separate passing tier-0 SLO evidence.
**Changed:** Entry guidance, changelog, project state, roadmap, TODO, execution
roadmap, and co-design, Studio, and validation-harness system contracts only. No
runtime, dependency, schema, migration, artifact, worker, optimizer, training,
provider, catalog, hardware, field, or release format changed.
**Decisions:** none; D59 remains active unchanged and D60 remains the next regular
decision ID.
**Next:** Design and execute a separately versioned, protected-source CMA-ES/Optuna
overnight lane with catalog choices, 200 real-engine candidates, at least three
admitted Pareto points, tier-3 trained finalists, and retained cost/recovery proof.
**Blockers:** P9 closure still needs actual algorithm, provider/accelerator budget,
overnight scheduling, trained-finalist, catalog-choice, and external-acceptance
evidence. D59 may not be promoted to satisfy any of those gates.

## 2026-07-16 — Execute the controlled co-design engine ladder
**Session:** Codex agent · branch `codex/p9003-d59-engine-codesign` ·
**Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~]
**Done:** Implemented D59's bounded exact-snapshot engine candidate without claiming
optimizer closure. The repository-owned `FORGE_CODESIGN_CMD` derives three-to-nine
replace-only inline-multirotor electrical variants from the gateway-owned admitted
snapshot. Native `forge-validate codesign-evaluate` independently binds the raw
candidate hash, sovereign validator/bake/HUD result, and a deterministic real Rapier
0.33.0 120-step/two-substep trajectory; native-passing candidates compile training
bundle 2.0.0 and execute two pinned MuJoCo 3.9.0 200-step hover estimator-controller
rollouts. Strict worker readback reapplies patches, recomputes candidate/patch/native-
evidence hashes, rejects source/manifold/constraint/optimizer/benchmark drift, and
derives Pareto only from admitted candidates. Studio displays controlled maturity,
tier-0 SLO evidence, named engines, held tier 3, and the complete false nonclaim set.
The release-binary smoke admits 2/3, returns one Pareto point, and records native tier
0 passes the 50 ms SLO in repeated release-binary runs. All 41 required local gates
pass under Python 3.12.7 with 233 worker,
74 Gateway, and 39 Studio tests, 19 compatibility surfaces, generated 81-route/
2-event/17-worker docs, native/WASM parity, packaging, training/offline/MJX/co-design
smokes, the append-only golden review, and patch hygiene.
Chromium, Firefox, and WebKit also pass the supported-browser matrix.
**Changed:** Native validator/CLI/tests; strict worker boundary and controlled runtime;
shared estimator-teacher controller; worker tests; Studio output parsing/disclosure;
CI and root verification; compatibility and generated artifact references; golden
review; `AGENTS.md`, decision, best-practice, system, roadmap, task, execution, and
current-state documentation. No public route, event, worker kind, persisted schema,
migration, ModelSpec, validator report, CLI/WASM facade version, user-data export,
catalog row, trained policy, provider deployment, hardware path, or field format
changed.
**Decisions:** D59 freezes the three internal 1.0.0 evidence meanings and controlled-
smoke nonclaims; D60 is the next regular decision ID.
**Next:** Inspect the complete exact diff, commit it, then protect the same tree
through reviewed PR and exact PR/post-merge CI/security before reconciling protected
hashes in a separate evidence change. After protection, design a separately versioned
CMA-ES/Optuna 200-candidate overnight lane rather than promoting D59's smoke.
**Blockers:** Protected-main evidence is pending. P9 closure still needs actual CMA-
ES/Optuna and catalog-choice search, at least three admitted Pareto points, 200 real-
engine candidates overnight, tier-3 trained finalists, provider scheduling/cost/
recovery evidence, and external acceptance.

## 2026-07-16 — Reconcile protected D58 deployment-ladder evidence
**Session:** Codex agent · branch `codex/p8007-d58-protected-evidence` ·
**Phase:** P8 · **TODO items:** P8-007 [~], P8-008 [~]
**Done:** Reconciled the living D58 boundary to protected local UX-rehearsal
maturity. PR #104 exact head `3f3c4ecd9850b1958cc06ca8c3568bee23510866`
passed PR CI `29541145577` and security `29541145559`; reviewed tree
`4b36fac3a2c82736ca90ad4ff657bc50f20ebeb0` is byte-identical at protected
squash `f7e7f57eaeee65cd7b4527118a00308205c6b15d`, whose post-merge CI
`29541456427` and security `29541456430` pass. The remote implementation branch
was deleted. This protects the shell-owned contiguous four-stage rehearsal, strict
Studio/browser fail-close, exact D9 display and skip-prevention mechanics only; it
performs no hardware I/O and every physical/deployment/hardware/device/field/
external-beta authority bit remains false.
**Changed:** Entry guidance, changelog, project-state, roadmap, TODO, and execution
roadmap only; no runtime, dependency, schema, migration, artifact, recorder, replay,
policy, consent, sharing, training, hardware, or release format changed.
**Decisions:** none; D58 remains active unchanged and D59 remains the next regular
decision ID.
**Next:** Execute the named props-off D12 controlled-lab D49/D55/D56 seam under a
real deployment trust bundle and retained semantic review before adding any real
ladder transition or physical-evidence authority.
**Blockers:** Named hardware, real trust-root operations, physical confirmation,
measured supervisor/kill-switch behavior, D30/EXT-004 lab acceptance, and field
evidence require controlled external execution and remain open.

## 2026-07-16 — Implement the fail-closed deployment-ladder rehearsal
**Session:** Codex agent · branch `codex/p8007-d58-deployment-ladder` ·
**Phase:** P8 · **TODO items:** P8-007 [~], P8-008 [~]
**Done:** Implemented D58's bounded local UX-rehearsal candidate. A versioned native
Desktop state machine owns exactly one `inactive|rehearsing|rehearsal-complete`
session, accepts only a D12 rig plus safe IDs, client-bound contract/lockfile hashes,
an exportable-policy-shaped input, and an exact passing D9 supervisor result, and enforces the
contiguous SITL → HITL → constrained → free prefix. Every hardware-touching advance
requires its exact physical-confirmation interaction, while reset requires a separate
exact end statement. The shared Studio bundle strictly parses every native field,
rebinds each response to the active session, shows all four stages and the 50 Hz/
200 Hz/fallback contract, and fails closed to a visible locked viewer in browsers.
The state machine performs no hardware I/O and permanently returns false deployment-
evidence, physical-evidence, hardware-execution, device-identity, field-session, and
external-beta authority with no-auto-arm true. Four ladder-specific tests pass inside
28/28 native Desktop tests; 37/37 Studio, 74/74 Gateway, and 227/227 worker tests pass.
All 40 required local gates pass under Python 3.12.13, as do the fresh migration 0026
database from clean plus all 25 populated predecessors, every data-plane assertion,
all 12 production-browser flows, and Chromium/Firefox/WebKit. This remains an
unprotected local candidate; exact PR/protected-main evidence still follows.
**Changed:** Desktop ladder contract/checks/native commands and state machine;
Studio strict client, panel, and tests; pilot and browser-support checks; entry,
compatibility, browser, best-practice, decision, system, roadmap, TODO, execution,
and current-state docs. No hardware writer, recorder/archive, D53/D54, policy,
replay, telemetry, public or persisted schema, migration, API, queue, consent,
sharing, training, or release format changed.
**Decisions:** D58 freezes the rehearsal-only ladder/control 1.0.0 meanings; D59 is
the next regular decision ID.
**Next:** Inspect the whole diff, then protect the exact tree through reviewed PR and
post-merge CI/security before reconciling protected hashes separately.
**Blockers:** Real HITL/constrained/free transitions, physical-confirmation evidence,
named-hardware supervisor timing/kill-switch behavior, deployment authority, D12 lab
acceptance, and field evidence require controlled external execution and remain open.

## 2026-07-16 — Reconcile protected D57 ghost-replay evidence
**Session:** Codex agent · branch `codex/p8005-d57-ghost-evidence` ·
**Phase:** P8/P12 · **TODO items:** P8-004 [~], P12-002 [~], XC-20 [~]
**Done:** Reconciled the living D57 boundary to protected local view maturity. PR
#102 exact head `50abc922a4c695ee3100df6fdf381334d3f86e9a` passed PR CI
`29536927436` and security `29536927492`; reviewed tree
`cc1d483919a799b565d0783b7258d90420d495af` is byte-identical at protected squash
`d33fd57980081e90990e2d4bb96a5c08dbe3c87b`, whose post-merge CI
`29537565069` and security `29537565062` pass. The remote implementation branch was
deleted. This protects the compact controlled-synthetic/unverified overlay, strict
parsing, indexed seeking, and explicit controls only; raw frames remain object-
backed and device, recorded-device, field, sharing, and training authority remain
false.
**Changed:** Entry guidance, changelog, project-state, roadmap, TODO, and execution
roadmap only; no runtime, dependency, schema, migration, artifact, replay, archive,
recorder, consent, sharing, training, or hardware format changed.
**Decisions:** none; D57 remains active unchanged and D58 remains the next regular ID.
**Next:** Implement the separately bounded P8-007 deployment-ladder UX while the
real adapter/device/field prerequisite for a D54-backed ghost remains external.
**Blockers:** Real D54 replay-to-admitted-twin execution, named-mid-hardware render
performance, P8-014, EXT-008, and field provenance remain separately gated.

## 2026-07-16 — Implement bounded indexed ghost replay mechanics
**Session:** Codex agent · branch `codex/p8005-p8-004-ghost-scrubber` ·
**Phase:** P8/P12 · **TODO items:** P8-004 [~], P12-002 [~], XC-20 [~]
**Done:** Added D57's internal `forge-ghost-overlay/1.0.0` candidate. Worker crash
forensics now validates finite strict ≤600-second traces, exact actual/predicted
Y-up/SI position pairs and Euclidean meter divergence, refuses unsupported metrics
and time drift, deterministically decimates to ≤6,001 compact points with exact
endpoints, and emits a sparse seek index plus permanent device/recorded-device/field
nonclaims. The keyless Gateway fixture produces the equivalent ten-minute,
36,001-source-sample/60 Hz controlled-synthetic trace without storing raw frames.
Studio independently parses/refuses every version/layout/value/index/authority
boundary, precomputes observed/predicted X/Z paths, displays live separation and
source/nonclaim state, and provides explicit play/pause and ±1/60-second steps. The
production-browser acceptance now exercises the full indexed view. Focused worker
tests pass 33/33, Gateway 74/74, Studio 33/33, Studio typecheck/build pass, and the
19-surface compatibility check passes. The exact candidate also passes all 40 local
repository gates under Python 3.12.13 with 227 worker tests, a fresh disposable
Postgres database through migration 0026 from clean plus all 25 populated
predecessors and every data-plane assertion, the 12/12 production-browser matrix,
and Chromium/Firefox/WebKit. This is not yet protected evidence and does not claim
full render performance, a real D54 twin, device provenance, or field use.
**Changed:** Worker crash-forensics/tests; Gateway fixture/tests; Studio ghost parser,
indexed seek/projection/UI/tests; production-browser acceptance; compatibility
matrix/checker/policy; `AGENTS.md`, decision, roadmap, task, project-state, execution,
best-practice, browser-adjacent and system documentation.
**Decisions:** D57 records the compact view/object-boundary/nonclaim contract; D58 is
the next regular decision ID.
**Next:** Inspect the exact diff and protect the implementation through reviewed PR
and post-merge CI/security, then reconcile the exact protected hashes in a separate
evidence change.
**Blockers:** Real D54 replay-to-admitted-twin execution requires a reviewed server-
selected streaming adapter/job and actual telemetry semantics; named-mid-hardware,
P8-014, and EXT-008 field evidence are external to this local lane.

## 2026-07-16 — Reconcile protected D56 recorder-custody evidence
**Session:** Codex agent · branch `codex/p8004-d56-custody-evidence` ·
**Phase:** P8 · **TODO items:** P8-002 [~], P8-003 [~]
**Done:** Reconciled every living D56 execution, status, risk, threat, pilot, Studio,
and hardware-bridge statement to the protected implementation. PR #100 exact head
`69c0dd79a66ac5fac4078bfe770cbecdf67c4091` passed PR CI `29530839367` and
security `29530839338`; reviewed tree
`de12c5ac06e4f1d360eabf924f8f41bc15209dd5` is byte-identical at protected squash
`1bf127d20a8d71b600c50159f18e49d7708f77ef`, whose post-merge CI `29531470442`
and security `29531470118` pass. The remote implementation branch was deleted.
This protects only local custody-fixture mechanics: the acceptance authority signs
the reviewed mapping while device cryptography, recorded-device, field, sharing,
and training authority remain false.
**Changed:** `AGENTS.md`, changelog, project-state, roadmap, TODO, execution roadmap,
risk register, threat model, hardware-bridge and Studio system docs, and reference-
quad pilot guidance only; no runtime, dependency, schema, migration, archive,
telemetry, consent, training, or release format changed.
**Decisions:** none; D56 remains active unchanged and D57 remains the next regular ID.
**Next:** Execute the protected D49/D55/D56 sequence on the named props-off Kakute
H7 V1.5 under a deployment-controlled real trust bundle, retain semantically
reviewed acceptance evidence, and run rotation, revocation, reconnect, power-loss,
suspend, and EXT-004 acceptance drills.
**Blockers:** Real trust-root authority, named hardware, lab supervision, host-
suspend behavior, and external acceptance evidence are unavailable in this local
repository lane. Fixture signatures and pseudo-terminals do not close those gates.

## 2026-07-16 — Implement fail-closed D56 signed recorder custody
**Session:** Codex agent · branch `codex/p8004-d56-custody-implementation` ·
**Phase:** P8 · **TODO items:** P8-002 [~], P8-003 [~]
**Done:** Implemented all three D56 1.0.0 formats without changing archive v1,
D53, or D54. Native Desktop now loads a bounded non-symlink public Ed25519 trust
bundle from a deployment-only absolute path, checks its exact SHA-256 pin and
purpose/validity/revocation metadata, strictly verifies an at-most-eight-hour
authorization over the exact protected revision, acceptance pack/signoffs,
artifact/model/contract/lockfile, distinct telemetry and identity port descriptors,
D55 identity/UID hashes, and permanent nonclaims, then opens the identity port and
runs D55 before the telemetry port. Clean custody stop preserves the existing D50
receipt first, requires a fresh props-off confirmation, rechecks the current trust
root/authorization and both OS descriptors, reruns D55, verifies exact start/stop
identity, UID, and response-transcript continuity, sovereignly re-inspects the five-
file archive, and writes a create-new proof outside it with the exact authorization-
file and receipt digests. Any post-probe, authority, continuity, or
proof-write failure leaves the valid archive unchanged and creates no new authority.
Studio has strict start/stop/proof parsers and an optional UI that displays only
bounded hashes and explicit acceptance-authority/device/recorded-device/field/
sharing/training nonclaims. The compatibility matrix now governs 19 surfaces.
Three crypto/refusal tests plus two real two-port pseudo-terminal custody tests bring
Desktop to 24/24; Studio typecheck/build and 30/30 tests pass. All 40 required local
repository gates pass under Python 3.12.7 with 225 worker tests, the generated
81-route/2-event/17-worker-family reference, and 19 compatibility surfaces. The
locked Desktop-native build passes. A fresh disposable Postgres/pgvector database
passes migration 0026 from clean plus all 25 populated predecessors, every queue,
upload, Modal-operation, policy-delivery, user-data, recorder-admission, consent, and
lifecycle assertion, and all 11 production browser flows; the database was removed
afterward. The D55 probe now locks the same shell-owned runtime as recorder commands.
`ed25519-dalek` 3.0.0 is exact-pinned with default features disabled; its current
official release/MSRV/strict-verification API were rechecked on 2026-07-16.
Complete-diff review corrected proof time ordering so creation follows the post-stop
observation and added byte-exact authorization plus cross-session response-transcript
continuity; the focused, 40-step, and fresh database/browser gates all passed again
after those corrections.
**Changed:** Desktop native custody module/commands/runtime/tests and lockfile;
Studio custody API/parser/controls/tests; compatibility matrix/checker; Desktop
contract checker; living entry/status/roadmap/TODO/execution/system/security docs.
No archive-v1 bytes, gateway schema/migration, D53 object set, D54 admission,
telemetry row, consent grant, training path, or release format changed.
**Decisions:** Implements active D56 unchanged; D57 remains the next regular ID.
**Next:** Review the complete diff, protect the implementation through PR and
post-merge evidence, then execute the named Kakute H7 V1.5 lane under a real
deployment trust root and EXT-004 pack.
**Blockers:** Protection and named-hardware/trust-root/rotation/revocation/suspend/
EXT-004 evidence remain open. Fixture keys and pseudo-terminals prove mechanics only;
device cryptography, recorded-device, field, sharing, and training authority remain
false and require later reviewed formats and evidence.

## 2026-07-16 — Define the D56 signed recorder-custody boundary
**Session:** Codex agent · branch `codex/p8003-d56-custody-design` ·
**Phase:** P8 · **TODO items:** P8-002 [~], P8-003 [~]
**Done:** Defined the unprotected D56 successor to D55 as three separate planned
1.0.0 formats: a deployment-owned hash-pinned purpose-limited public Ed25519 trust
bundle, an at-most-eight-hour acceptance authorization over the exact protected
revision/evidence/signoffs/artifact/model/telemetry and identity ports/D55 identity/
nonclaims, and a native create-new custody proof outside archive v1. The ordered flow
requires a pre-open D55 observation in shell-owned state, the unchanged D50 clean
receipt, a new props-off confirmation, and an exact post-stop observation. Failure
creates no proof and never deletes or relabels a valid archive. The acceptance
authority signature is explicitly not a device signature; device cryptography,
recorded-device, field, sharing, and training authority remain false. All 40 required
local repository gates pass under Python 3.12.13; the focused compatibility,
external-acceptance, pilot, and generated-contract checks pass; all 86 tracked
Markdown files resolve locally; and the 205-task/56-decision ledgers remain stable.
**Changed:** Decision, hardware/Studio/learning/worker/pilot systems guidance,
compatibility/API migration policy, threat/risk/best-practice boundaries, external
lab acceptance, project-state/roadmap/TODO/execution ledgers, entry-agent guidance,
and changelog only; no runtime, dependency, schema, migration, archive, D53, D54,
telemetry, consent, or release semantics changed.
**Decisions:** D56 records the signed-custody design; D57 is the next regular ID.
**Next:** Review and protect D56, then implement strict trust-bundle/authorization
verification, native pre/post continuity, proof/refusal semantics, and archive-v1/
D53/D54 regression coverage before named-hardware execution.
**Blockers:** Runtime/protected evidence, a real deployment trust root and rotation/
revocation drill, named Kakute H7 V1.5/operator custody, host-suspend behavior,
EXT-004, WebSerial/WebUSB, signed Desktop delivery, field/ghost/system-ID evidence,
and every recorded-device/sharing/training promotion remain separate gates.

## 2026-07-16 — Protect the D55 read-only adapter identity boundary
**Session:** Codex agent · branch `codex/p8002-d55-adapter-identity-evidence` ·
**Phase:** P8 · **TODO items:** P8-002 [~], P8-003 [~]
**Done:** Reconciled the D55 implementation with exact protected evidence. PR #97
head `4321eaafd5d2c0ef60cf9f38cd1000d16d660668` passed CI
`29519984713` and security `29519984764`; reviewed tree
`673a50c94ecc17a2bd266542cd5f2c611d8a248b` is byte-identical at protected
`370d2140142d1f0cdbfde0625aa024d9b3bbfd81`, whose post-merge CI
`29520651520` and security `29520651581` pass. The remote implementation branch
was deleted. This protects only the strict read-only, two-pass, self-reported MSP
protocol observation and its false-authority boundary. It does not establish
cryptographic attestation, recorder start/end custody, named-controller identity,
host-suspend behavior, lab or field provenance, sharing consent, or training reuse.
**Changed:** Entry-agent, project-state, roadmap, TODO, execution, risk, hardware,
Studio, and changelog evidence language only; no runtime, schema, migration, archive,
telemetry, consent, or compatibility semantics changed.
**Decisions:** D55 remains active and unchanged; D56 remains the next regular ID.
**Next:** Design a separate recorder-bound trust/custody contract, then execute D49
and D55 on the named props-off D12 Kakute H7 V1.5 under controlled-lab authority.
**Blockers:** Trusted identity/custody, named hardware/operator proof, host suspend,
lab/field execution, WebSerial/WebUSB capture, signed Desktop delivery, ghost,
system-ID, sharing, and training authority remain separate gates.

## 2026-07-16 — Add the fail-closed D55 read-only adapter identity probe
**Session:** Codex agent · branch `codex/p8002-d55-adapter-identity` ·
**Phase:** P8 · **TODO items:** P8-002 [~], P8-003 [~]
**Done:** Implemented an unprotected local D55 candidate with exact
`forge-recorder-adapter-probe/1.0.0` and
`forge-betaflight-msp-adapter/1.0.0` semantics. Native Desktop re-enforces
D30/D12/props-off and an OS-enumerated 115200-baud port, then issues only MSP-v1
API-version, variant, FC-version, board-info, build-info, and UID queries while the
native recorder is atomically held inactive. Exact
framing, response direction, echoed command, XOR checksum, one-byte payload length,
three-second deadline, protocol 0/API 1.47, `BTFL`, stable `2025.12.x`, and
`KAKUTEH7` are mandatory. Two byte-identical observations must pass on one open port.
Raw UID and responses remain native; Studio receives only domain-separated hashes
and strictly parses permanently false device/recorded-device/field/sharing/training
authority. Nineteen native tests, including real Unix pseudo-terminal success and
direction/command/checksum/identity/target/stability refusal, and twenty-eight Studio
tests pass with typecheck/build. The locked Desktop native gate, all 40 repository
gates under Python 3.12.13, migration 0026 on a clean database and all 25 populated
predecessors, every database assertion, 11/11 production-browser flows, and Chromium/
Firefox/WebKit pass. The contract follows Betaflight's current MSP reference and tagged
2025.12.5 protocol sources. Stable self-reported MSP identity is explicitly not
cryptographic attestation, recorder custody, physical-device proof, host-suspend,
lab, or field evidence.
**Changed:** Desktop native command/parser/tests and package checks; strict Studio
client, controls, UI, and tests; D55 decision/compatibility/API guidance; threat,
best-practice, pilot, worker/learning, risk, system, project-state, roadmap, TODO,
execution, and entry-agent documentation.
**Decisions:** D55 records the exact read-only two-pass observation and non-attestation
contract; D56 is the next available regular decision ID.
**Next:** Protect the slice through reviewed PR evidence, then design recorder-start/
end trust/custody binding and execute the named props-off D12 controller lane.
**Blockers:** Full/protected evidence, trusted recorder-bound identity, named physical
controller and operator custody, host suspend, lab/field execution, sharing/training
authority, WebSerial/WebUSB, signed Desktop delivery, ghost, and system-ID remain
separately gated.

## 2026-07-16 — Protect D54 sovereign recorder admission
**Session:** Codex agent · branch `codex/p8003-recorder-admission-evidence` ·
**Phase:** P8 · **TODO items:** P8-003 [~]
**Done:** Protected D54's exact semantic-only recorder admission boundary through PR
#95. Exact implementation head `81282f7` passed PR CI `29512245375` and security
`29512245387`; reviewed tree `f71ee1a` is byte-identical at protected squash
`f8efb6f`, whose post-merge CI `29512921138` and security `29512920367` pass. The
merged implementation branch was deleted. This protects native canonical archive-v1
verification, exact D53/current-object/admitted-model binding, the separate admission
row, bounded object-backed telemetry reference, export/deletion coverage, and D45
training refusal. D53 remains immutable and every device/session/field/sharing/
training nonclaim remains false.
**Changed:** Living protected-evidence anchors, readiness verdicts, roadmap/TODO/
execution sequencing, AGENTS guidance, and gateway/Desktop/Studio system status.
**Decisions:** none; D54 remains the binding semantic-self-consistency-only boundary.
**Next:** Define the reviewed real-adapter/device/session identity and attestation
contract before any recorded-device admission, while the named D12 props-off lab
execution remains a separate evidence lane.
**Blockers:** Reviewed adapter/device identity, production object IAM/TLS/SLO/orphan
recovery, host suspend, controlled lab/field execution, sharing/training authority,
ghost/system-ID, and signed Desktop delivery remain separately gated.

## 2026-07-16 — Admit materialized recorder archives through the sovereign validator
**Session:** Codex agent · branch `codex/p8003-recorder-archive-admission` ·
**Phase:** P8 · **TODO items:** P8-003 [~]
**Done:** Implemented D54's unprotected local sovereign archive-semantics candidate.
The gateway streams the exact five complete D53 private objects with declared-size
and SHA-256 enforcement into exclusive mode-0600 files under a mode-0700 temporary
root, invokes native `forge-validate recorder-verify`, removes all temporary bytes
before persistence, and exact-binds the full report to the D53 plan/objects plus one
owner-selected admitted model's contract and lockfile. Migration 0026 stores a
separate immutable admission and one bounded object-backed telemetry reference; D53
is never promoted and replay frames never enter JSON or JSONB. User-data export 1.6
and deletion include the new metadata. Legacy D45 training rejects the reference even
when a training-reuse grant exists. Studio exposes one explicit post-materialization
action and renders object integrity, archive semantics, and every authenticity/
device/field/sharing/training nonclaim separately. Focused proof passes: 2/2 native
recorder tests, 73/73 Gateway tests, 26/26 Studio tests, and the dedicated Postgres
sovereignty/nonclaim/training-refusal/export/deletion assertion, migration 0026 on a
clean database plus all 25 populated predecessors, 11/11 production-browser flows,
all three declared browser engines, and the complete 40-step repository gate under
Python 3.12.13 with 225 worker tests. `pnpm audit` and the root RustSec scan report
no known vulnerabilities; the stricter Desktop warning scan reports only the 17
time-bounded GOV-011 Tauri GTK/Unicode warnings already owned by the Linux-release
blocker. Protected PR/post-merge evidence remains pending.
**Changed:** Native validator CLI/report; gateway object streaming, admission service,
route, object-store and process timeouts, account lifecycle, and training refusal;
migration 0026 and Postgres assertion; Studio client/UI/tests; compatibility surface,
81-route generated contract docs, API/migration/threat/lifecycle/system guidance,
roadmap/TODO/execution/state/agent entry, and golden review record.
**Decisions:** D54 separates sovereign archive self-consistency from D53 object
integrity and from every physical provenance or consent authority.
**Next:** Protect the exact reviewed candidate, reconcile evidence, then define the
reviewed real-adapter/device identity contract before any recorded-device admission.
**Blockers:** None for local verification or protection. Production object IAM/TLS/
SLO/orphan recovery, reviewed adapter/device identity, host suspend, controlled lab/
field execution, sharing/training authority, ghost/system-ID, and signed Desktop
delivery remain separately gated.

## 2026-07-16 — Protect D53 recorder object materialization
**Session:** Codex agent · branch `codex/p8003-recorder-materialization-evidence` ·
**Phase:** P8 · **TODO items:** P8-003 [~]
**Done:** Protected D53's exact five-private-object recorder materialization boundary
through PR #93. Exact implementation head `5d1af49` passed PR CI `29501475412` and
security `29501475414`; reviewed tree `90d8cbf` is byte-identical at protected squash
`08d892f`, whose post-merge CI `29502180736` and security `29502180788` pass. The
merged implementation branch was deleted. This closes local object-integrity
materialization only: archive v1 is unchanged, Studio and gateway receive no local
paths, native Desktop streams exact sized files, and gateway completion retains
archive semantics, telemetry admission, device/field provenance, sharing, and
training authority as false.
**Changed:** Living protected-evidence anchors, readiness verdicts, roadmap/TODO/
execution sequencing, AGENTS guidance, and gateway/Desktop/Studio system status.
**Decisions:** none; D53 remains the binding object-integrity-only boundary.
**Next:** Implement a separate sovereign server-side streaming verifier for exact
archive-v1 frame/index/replay semantics and explicit telemetry admission without
promoting device authenticity or consent authority.
**Blockers:** None for the next local server-verification slice. Production object
IAM/TLS/SLO/orphan recovery, reviewed adapter/device identity, suspend, lab/field,
sharing/training grants, and signed distribution remain separately gated.

## 2026-07-16 — Materialize recorder archives as five private objects
**Session:** Codex agent · branch `codex/p8003-recorder-materialization` · **Phase:** P8 ·
**TODO items:** P8-003 [~]
**Done:** Implemented D53's unprotected local candidate. Desktop reruns the sovereign
local archive-v1 verifier, returns a path-free upload-plan v1, and streams the exact
five regular files with sized bodies to checksum-bound PUTs on one configured origin.
The gateway stages distinct owner-private content-addressed objects, migration 0025
retains materialization state, and completion verifies object length/type/checksum
plus bounded manifest/receipt identity and frame/index/replay hash bindings. Studio
passes no paths or raw frames through gateway JSON and displays object integrity
separately from archive semantics. Export 1.5 and deletion include the new rows.
All required local proof passes under Python 3.12.7: 17/17 locked native tests,
25/25 Studio tests, 70/70 gateway tests, the clean-install plus 24-populated-
predecessor Postgres matrix, user export/deletion/lifecycle assertions, 11/11 browser
E2E flows, all three supported browser engines, and the complete 40-step repository
gate. `pnpm audit` reports no known vulnerability; the Desktop RustSec scan reports
no vulnerability and only the 17 already allowed unmaintained/unsound warnings in
Tauri's transitive Linux GTK/Unicode stack. Protected PR/post-merge evidence remains
pending. The preceding D52 reconciliation is
now fully protected through PR #92: exact head `23e875a` passed CI `29496799162` and
security `29496799206`; reviewed tree `506f736` is byte-identical at `237e46b`, whose
post-merge CI `29497768669` and security `29497768576` pass; its branch was deleted.
**Changed:** Desktop upload commands/contracts/tests and locked Cargo dependencies;
gateway recorder service/routes/tests, migration 0025, export/deletion; Studio client,
strict parsers, UI, and tests; compatibility/API/golden sources; threat, lifecycle,
migration, best-practice, system, state, roadmap, TODO, execution, decision, and agent
guidance.
**Decisions:** D53 separates private object integrity from sovereign archive semantics
and all device/field/consent authority.
**Next:** Protect the exact locally verified candidate, then add a separate server-
side streaming archive-semantics verifier before any telemetry admission.
**Blockers:** None for local verification/protection. Production object IAM/TLS/SLO/
orphan proof, server streaming semantics, reviewed adapter/device identity, suspend,
lab/field, sharing/training grants, and signed distribution remain separate gates.
**Dependencies:** Adds exact `reqwest` 0.13.4 with `default-features=false` and only
`blocking,rustls`, plus `base64` 0.22. Reqwest's official current docs were checked
2026-07-16 for `blocking::Body::sized`, redirect policy, and feature/default-proxy
behavior. The dependency avoids buffering a 512-MiB archive in Rust/React/JSON and
explicitly removes implicit system-proxy routing; Cargo.lock pins the resolved rustls
stack for supply-chain review.

## 2026-07-16 — Protect D52 Desktop recorder controls
**Session:** Codex agent · branch `codex/p8003-recorder-controls-evidence` · **Phase:** P8 ·
**TODO items:** P8-003 [~]
**Done:** Protected D52's versioned Desktop recorder status/start/stop boundary
through PR #91. Exact implementation head `69db857` passed PR CI `29495505253`
and security `29495505262`; reviewed tree `25be1d3` is byte-identical at protected
squash `a8120ab`, whose exact post-merge CI `29496148793` and security
`29496148796` pass. The implementation branch was deleted after proof. This closes
the local shell-control dependency: one shell-owned
`forge-recorder-control/1.0.0` state machine survives webview reloads, accepts
capture identity only from an admitted report plus D30/D12/consent/new-path/
OS-enumerated-115200-port authority, and returns the unchanged persisted receipt v1
only through explicit stop. Studio receives no frames and cannot promote device,
field, sharing, training, lab, ghost, system-ID, or authenticity authority. P8-003
remains `[~]` because the five-file archive still needs a separately authorized,
object-backed gateway materialization/verification path plus reviewed adapter,
device, suspend, lab, and field evidence.
**Changed:** Living protected-evidence anchors, current-state/readiness verdicts,
roadmap/TODO/execution sequencing, AGENTS entry guidance, and hardware/Studio system
status.
**Decisions:** none; D52 remains the binding ephemeral shell-state boundary.
**Next:** Design and implement the smallest fail-closed object-backed gateway
materialization seam for the exact five archive-v1 files, without routing 512 MiB
through JSONB or upgrading local self-consistency to authenticity.
**Blockers:** None for the next local materialization slice. Real adapter/device
identity, host-suspend behavior, controlled lab/field execution, object-store
operations, sharing/training grants, and signed distribution remain separate gates.

## 2026-07-16 — Control the Desktop recorder through versioned shell state
**Session:** Codex agent · branch `codex/p8003-recorder-controls` · **Phase:** P8 ·
**TODO items:** P8-003 [~]
**Done:** Implemented D52's unprotected local status/start/stop candidate on exact
protected parent `9e81ddd`. Native Desktop now exposes strict
`forge-recorder-control/1.0.0` `inactive|recording|finished` state owned by the shell,
so a webview reload cannot lose active capture identity or create a second recorder.
Finished state remains collectable through explicit stop, which returns the unchanged
persisted recorder receipt v1 on success or the fail-closed recorder error. The start
request rejects unknown fields and independently enforces D30/D12, exact per-log
consent, one OS-enumerated 115200-baud port, a new absolute path of at most 4096 UTF-8
bytes, hashes, seed, sample rate, and bounded environment.

Studio strictly parses bridge, port, control, and receipt field sets and versions.
It starts only when the hardware bridge is enabled, the native recorder is inactive,
one enumerated port and consent checkbox are selected, and the active validator report
is admitted; contract hash, lockfile hash, and seed come only from that report. It
restores native capture state after reload, can stop recording or finished state,
receives no frame bytes, and exposes no device/field/sharing/training authority or
gateway upload. Browser builds fail closed before invoke. Desktop fmt/Clippy/build
and 14/14 tests pass; Studio typecheck/build and 20/20 tests pass; all three declared
browser engines pass. The complete 40-step gate passes under Python 3.12.7 with 225
workers, 66 gateway tests, Brief-25 25/25, native/WASM parity, packaging,
training/offline/MJX smokes, and patch hygiene. Protected evidence remains pending.
**Changed:** Native recorder request/control/runtime/commands/tests; strict Studio
Desktop command boundary, responsive recorder controls, report mirror, and tests;
D52; compatibility/migration/threat/best-practice guidance; AGENTS, current state,
roadmap/TODO/execution, and hardware/Studio system docs.
**Decisions:** D52 makes recorder control a strict ephemeral shell-state contract,
separate from persisted archive/receipt v1 and incapable of promoting provenance or
consent authority.
**Next:** Protect and reconcile the exact candidate, then design a separately
authorized object-backed gateway materialization path instead of using the
512-MiB-incompatible JSONB request-body path.
**Blockers:** None for local verification/protection. Real adapter/device identity,
host suspend, controlled lab/field execution, object storage operations,
sharing/training grants, and signed distribution remain separate P8 gates.

## 2026-07-16 — Protect D51 recorder archive inspection
**Session:** Codex agent · branch `codex/p8003-recorder-import-evidence` · **Phase:** P8 ·
**TODO items:** P8-003 [~]
**Done:** Protected D51's read-only recorder archive-v1 verifier and Desktop-only
Studio inspection surface through PR #89. Exact implementation head `dcaed0f` passed
PR CI `29490845998` and security `29490846046`; reviewed tree `2d57349` is
byte-identical at protected squash `b5418ac`, whose exact post-merge CI
`29491389298` and security `29491389270` pass. The feature branch was deleted after
proof. The protected boundary streams pre-read-capped canonical metadata, frames, and
index entries, verifies the exact five-file layout, sparse offsets, count/duration,
frame/index hashes, and reconstructed/retained replay equality, and returns only a
strict bounded local-self-consistency summary. It uploads no tape and promotes no
device, field, sharing, training, lab, ghost, or system-ID authority. P8-003 remains
`[~]` because controls, object-backed gateway materialization, real adapter/device,
suspend, and lab/field execution are still open.
**Changed:** Living evidence anchors, current-state/readiness table, roadmap/TODO,
execution sequencing, AGENTS entry guidance, hardware/Studio system status, and the
nine legacy named post-P3 TODO rows now carry stable `BATCH-001..009` IDs.
**Decisions:** none; D51 remains the binding read-only self-consistency boundary.
**Next:** Add versioned Desktop recorder status/start/stop controls, then separately
design object-backed gateway materialization instead of sending a 512-MiB archive
through the JSONB request-body path.
**Blockers:** None for the next local controls slice. Real adapter/device identity,
host suspend, controlled lab/field execution, sharing/training grants, and signed
distribution remain external P8 gates.

## 2026-07-16 — Verify Desktop recorder archives before import
**Session:** Codex agent · branch `codex/p8003-recorder-import` · **Phase:** P8 ·
**TODO items:** P8-003 [~]
**Done:** Implemented D51's read-only archive-v1 verification candidate on exact
protected parent `225933a`. Desktop accepts one absolute archive directory containing
exactly the five canonical real regular files and refuses symlinks, special/missing/
extra entries, aggregate oversize, unsupported/unknown/non-canonical metadata,
filename/source/privacy/device-authority drift, malformed/non-canonical frames or
index entries, sparse stride/final sequence/time/offset drift, count/duration drift,
and any frame/index/reconstructed-or-retained replay hash mismatch. Verification is
streaming and does not load a 512-MiB tape or replay into memory. The versioned
`forge-recorder-inspection/1.0.0` result exposes only bounded path, identity, hash,
count, duration, and explicit false device/field/sharing/training authority.

Studio now has a Desktop-only recorder-archive import panel. It sends only the
trimmed path to `inspect_recorder_archive`, strictly validates the complete response
field set and numeric/hash/nonclaim bounds, uploads no frames, and tells users that a
passing result is local self-consistency rather than authenticity or device/field
proof. Exact `@tauri-apps/api` 2.11.1 is the only new runtime dependency; it is the
official Tauri 2 bundler API for invoking registered Rust commands and avoids enabling
the broader global API configuration. Desktop native tests pass 14/14; Studio
typecheck, 16/16 tests, and production build pass. Full repository and browser gates
also pass: all three declared engines and all 40 required local checks
under Python 3.12.13, including 225 workers, 66 gateway tests, native/WASM parity,
packaging, training/offline/MJX smokes, and patch hygiene. Protected PR/post-merge
evidence remains pending.
**Changed:** Desktop recorder reader/command/strict parsers/tests; Studio Tauri command
wrapper, response validator, panel/tests, exact dependency and lockfile; D51;
compatibility/archive-read guidance; AGENTS/current-state/roadmap/TODO/execution and
hardware/Studio system docs; threat model; generated artifact docs and golden review
record.
**Decisions:** D51 makes archive import a streaming native self-consistency verifier;
inspection cannot promote authenticity, provenance, consent, or maturity.
**Next:** Protect the exact reviewed candidate, reconcile evidence, then add explicit recorder start/stop
controls and a separately authorized gateway materialization lane.
**Blockers:** None for local protection. Real adapter/device identity, host suspend,
controlled lab/field execution, sharing/training grants, and signed distribution
remain external P8 gates.

## 2026-07-16 — Protect the D50 indexed Desktop recorder
**Session:** Codex agent · branch `codex/p8013-recorder-evidence` · **Phase:** P8 ·
**TODO items:** P8-013 [x]
**Done:** Protected D50's bounded Desktop background recorder and real-filesystem
archive through PR #87. Exact implementation head `5e668a1` passed PR CI
`29485412948` and security `29485412987`; reviewed tree
`528a8783550363d712044e694c5ee4bb9c747ce9` is byte-identical at protected squash
`d8afe7f9796e6eb8b651a5c55c56ed635a00948a`. Protected-main CI `29486146093`
passed Rust, Desktop native, TypeScript/gateway, 225-worker, 24-migration Postgres,
real-browser, accessibility, and supported-browser jobs; security `29486147436`
passed source-SBOM, CodeQL JavaScript/Python, dependency-audit, and aggregate checks,
with push-only dependency review skipped as designed. The complete 40-step local
gate remains green under Python 3.12.13. P8-013 is therefore done at protected local
recorder-integration maturity only: archive/frame/receipt v1, exact consent and
authority gates, exclusive background capture, bounded append-only storage, sparse
byte-offset indexing, clean-stop replay/hash finalization, refusal, and no-overwrite
behavior are protected. No real adapter/device identity, host-suspend behavior,
WebSerial/WebUSB, lab/field capture, ghost/system-ID, sharing/training grant, or
recorded-device attestation is claimed.
**Changed:** Canonical agent boundary, project state, roadmap, TODO ledger, execution
roadmap, hardware/Studio system status, and this changelog.
**Decisions:** none; D50's protected local maturity does not widen device,
configuration, consent, training, or field authority.
**Next:** Bind one reviewed real telemetry adapter to the unchanged recorder archive,
add verified Studio recorder controls/archive import, then execute the named D12 lab
and replay/ghost lanes under D30.
**Blockers:** None for the protected local recorder. Real hardware, suspend, signed
Desktop delivery, browser transport, lab/field, and recorded-device evidence retain
their existing external or downstream gates.

## 2026-07-16 — Capture indexed Desktop replay archives in the background
**Session:** Codex agent · branch `codex/p8013-recorder` · **Phase:** P8 ·
**TODO items:** P8-013 [~]
**Done:** Implemented D50's local P8-013 background-recorder candidate on exact
protected base `63e144c`. Desktop now requires the D30 hardware envs, D12 rig,
per-log telemetry-consent phrase, OS-enumerated port at 115200 baud, lowercase
contract/lockfile hashes, bounded environment, and a new exclusive archive path. One
in-shell thread accepts only exact contiguous, strictly time-increasing
`forge-telemetry-frame/1.0.0` serial JSONL with object state under frame/depth/node,
one-million-frame, and 512-MiB caps. It retains canonical append-only frames plus a
sparse byte-offset index; explicit stop drains buffered input, rejects partial/empty
state, flushes and syncs both files, finalizes replay 1.0.0, hashes frames/index/
replay, and only then creates `forge-recorder-receipt/1.0.0`. Existing archives are
never overwritten and only one recorder may run. Archive, replay, and receipt remain
within the aggregate 512-MiB cap and persist exact capture-consent confirmation while
remaining user-owned, private, not training-authorized, no-auto-arm,
local-serial-integration, and explicitly `recordedDeviceAttested=false`. Capture
consent grants neither sharing nor training reuse. Eleven locked Rust tests pass,
including real pseudo-terminal background capture and exact replay/index/hash output,
sequence/time drift, oversized/empty/partial input without a success receipt,
exclusivity/no-overwrite, and authority refusal.
The complete 40-step local gate passes under Python 3.12.13 with 225 worker, 66
gateway, and 13 Studio tests; sixteen compatibility surfaces; generated 77-route/
2-event/17-worker documentation; Rust/WASM parity; release packaging; the four-task,
offline-training, and MJX smokes; and patch hygiene.
**Changed:** Desktop native recorder/runtime/tests and package checker; compatibility
matrix/reference and API migration guide; D50; AGENTS/current-state/roadmap/TODO/
execution/best-practices/hardware/Studio/risk documents; generated artifact
references and append-only golden review evidence; and this changelog.
**Decisions:** D50 selects an in-shell thread over a sidecar for the first local
background boundary and versions archive/frame/receipt independently. A future real
adapter/device-attestation or training-admission meaning requires separate reviewed
authority rather than relabeling v1.
**Next:** Publish the exact candidate through protected PR CI/security, reconcile
P8-013 as done at deterministic local-integration maturity, then implement the
reviewed real telemetry adapter and Studio recorder/import seam.
**Blockers:** None for local implementation/protection. Real adapter/device identity,
OS suspend/lid behavior, WebSerial/WebUSB, lab/field capture, ghost/system-ID,
sharing/training consent, and recorded-device admission require separate evidence.

## 2026-07-16 — Protect D49 target application verification
**Session:** Codex agent · branch `codex/p8012-target-readback-evidence` · **Phase:** P8 ·
**TODO items:** P8-001 [~]
**Done:** Protected D49's bounded Betaflight target handshake, persistent-save
acknowledgement, reboot/reconnect, exact readback, and receipt 2.0.0 semantics through
PR #85. Exact implementation head `f18185d` passed PR CI `29479621677` and security
`29479621689`; reviewed tree `dfa0007fbdd2527cd1e661ec33931252443c73ae` is
byte-identical at protected squash `4647a105bf852f7a651ce52c80ac08d15de8d6cd`.
Protected-main CI `29480132737` passed all Rust, Desktop native, TypeScript/gateway,
225-worker, 24-migration Postgres, real-browser, and accessibility jobs; security
`29480131433` passed source-SBOM, CodeQL JavaScript/Python, dependency-audit, and
aggregate checks, with push-only dependency review skipped as designed. The complete
40-step local gate remains green under Python 3.12.13. This closes only protected
local protocol integration: the pseudo-terminal does not prove a physical FC,
device-unique identity, applied lab configuration, HITL, tethered supervisor, or
field behavior.
**Changed:** Entry boundary, current-state evidence anchors/results/verdicts, P8
roadmap/TODO/execution wording, hardware-bridge status, and this changelog.
**Decisions:** none; D49 remains active and `forge-bridge-config/1.0.0` remains
unchanged.
**Next:** Execute the protected protocol on the named props-off D12 quad FC under
controlled-lab authority with retained private acceptance evidence; P8-013 Desktop
recorder work may proceed independently without widening configuration authority.
**Blockers:** Physical FC/lab closure requires the D12 rig, physical supervisor,
private evidence storage, and signed acceptance. WebSerial, HITL, recorder/ghost,
signed Desktop, Link, tethered, and field proof remain separate P8 work.

## 2026-07-16 — Require target handshake and persistent readback
**Session:** Codex agent · branch `codex/p8012-target-readback` · **Phase:** P8 ·
**TODO items:** P8-001 [~]
**Done:** Implemented D49's local target/readback candidate on protected base
`15c3be2` without changing `forge-bridge-config/1.0.0`. Native Desktop now requires
the props-removed confirmation, enters Betaflight CLI, bounds every response to
three seconds/16 KiB/valid UTF-8 controls, and accepts exactly one stable numeric
`2025.12.x` identity with MSP API authority before any config byte. After the exact
D48 payload it requires one matching set acknowledgement and `# saving`, waits for
the same OS path after reboot, rechecks the same reported firmware-identity hash, and
requires exactly one matching `get failsafe_delay` value. Wrong/duplicate identity,
wrong/duplicate readback, target errors, timeouts, reconnect failure, and response
ambiguity return no success receipt; every post-transmission error says the state may
be partial and the rig must remain disarmed. Only the complete path emits
`forge-bridge-serial-receipt/2.0.0` with full target patch version, pre/post reported-
identity hashes, SHA-256 digests for the exact pre-version, set/save, post-version,
and readback response bytes, the normalized readback-line hash/value,
target/application verification true, operator readback false, and CLI arming still
disabled. Six locked Rust tests include
two real Unix pseudo-terminal sessions for the exact wire protocol plus substitution
and ambiguity refusals, exact digest assertions, and fast timeout/response-cap proof.
Desktop Cargo fmt/Clippy/tests, root Rust fmt/Clippy/tests,
`pnpm verify:desktop-native`, and the Desktop package contract pass. The complete
40-step `pnpm verify` gate passes under Python 3.12.13, including 225 worker tests,
66 gateway tests, 13 Studio policy-runtime tests, native/WASM parity, real seeded and
offline training smokes, and controlled MJX feasibility.
**Changed:** Desktop native serial protocol, focused package checker, locked Desktop
manifest/lockfile (removing the no-longer-needed direct `libc` test dependency), D49,
compatibility guidance, entry/current-state/roadmap/TODO/execution/system documents,
and this changelog.
**Decisions:** D49 major-bumps only the receipt because application truth changed;
the D48 config artifact and writable command set remain unchanged. Official current
Betaflight CLI/failsafe documentation, stable release 2025.12.5, and its tagged
`version`/`get`/`save` source were rechecked on 2026-07-16.
**Next:** Protect the candidate through exact-head and post-merge CI/security,
reconcile its evidence, then execute the exact protocol on
the named D12 quad FC with propellers removed and a private EXT-004/P8-009 acceptance
pack covering raw responses/hashes, reconnect, failure, and power-loss behavior.
**Blockers:** None for local protocol implementation/protection. A real-FC or lab
claim requires the controlled D12 hardware, physical supervisor, private evidence
storage, and signed acceptance; WebSerial, HITL, recorder/ghost, signed Desktop,
Link, tethered, and field proof remain separate P8 work.

## 2026-07-16 — Protect D48 native serial transport
**Session:** Codex agent · branch `codex/p8012-native-serial-evidence` · **Phase:** P8 ·
**TODO items:** P8-012 [x]
**Done:** Protected D48 and P8-012 deterministic/native serial transport through PR
#83. Exact implementation head `758fd9a` passed PR CI `29468611033` and security
`29468611094`; protected squash `fd26845` has the same reviewed tree
`38a8e3f6d278ef822568183369655aa94b15f92a` and passed exact post-merge CI
`29468966929` and security `29468966748`. The protected CI row passed Rust, macOS
Desktop native compilation, TypeScript/gateway/Brief-25/native-WASM gates, all 225
workers plus training/offline/parity/MJX smokes, and the 24-migration isolated
Postgres/real-browser/accessibility/commerce matrix. Downloaded protected browser
artifact `8364167167` has Actions digest
`sha256:7ab0e8c3ceb5d9345e76537ead11ec0d46709b7f8e6592845bc5c6cef2c27de1`
and binds source and checkout to `fd26845`. This protection proves the exact
Betaflight 2025.12/D12-quad/failsafe-only artifact, independent worker/Desktop
validation, OS-enumerated 115200-baud serialport-rs transport, pseudo-terminal byte
proof, and honest transport-only receipt. It still does not prove target firmware,
applied configuration, a real flight controller, HITL, lab, tethered, or field
maturity.
**Changed:** Protected-evidence anchors and maturity language in `AGENTS.md`, project
state, roadmap, execution overlay, TODO ledger, and the hardware-bridge contract;
this changelog.
**Decisions:** none; D48 and R31 are now protected without widening the writable
command set or receipt claims.
**Next:** Add an exact Betaflight 2025.12 target-version handshake and bounded
post-write `failsafe_delay` readback to the D12 quad adapter, prove substitution,
timeout, malformed-response, and partial-write refusal over a pseudo-terminal, then
run the first propeller-free supervised lab acceptance under P8-009/EXT-004.
**Blockers:** No blocker for protected deterministic/native transport. Real FC/HITL/
tethered/lab/field evidence requires controlled D12 hardware and supervision; signed
Desktop delivery, recorder/capture, browser WebSerial, and Link image remain separate
P8 tasks.

## 2026-07-16 — Bind native serial writes to one reviewed D48 artifact
**Session:** Codex agent · branch `codex/p8012-native-serial` · **Phase:** P8 ·
**TODO items:** P8-012 [x]
**Done:** Implemented the P8-012 candidate at deterministic/native serial-transport
integration maturity on exact protected base `f91c339`. D48 replaces the raw config
string with `forge-bridge-config/1.0.0`: the queue strips only framework-owned
`timeoutS`, then accepts exactly `firmware`/`mixer`/`rates` input,
Betaflight 2025.12, D12 `quadx` scope, one integer `failsafe_delay` from 2 through
200 deciseconds, exact ordered-line SHA-256, physical confirmation, and no auto-arm.
The current official Betaflight CLI permits 1–200 deciseconds, while its failsafe
guidance identifies 200 ms as the minimum safe guard time; v1 therefore refuses 1.
The Rust Desktop independently verifies schema, firmware/version, command/range,
hash, D12 quad, every hardware/lab env gate, confirmation, exact 115200 baud, and an
OS-enumerated port before serialport-rs open/write/flush. Its versioned receipt says
only how many bytes were transmitted and deliberately sets target-firmware and
application verification false with operator readback required. Four locked Rust
tests include an actual Unix pseudo-terminal exact-byte exchange and arbitrary-path
refusal. The worker/gateway/Studio surfaces share the exact fixture and hash; the
hardware corpus pins reviewed-setting, mixer, and safety-floor outcomes.
The complete 40-step gate passes under exact Python 3.12 with 225 worker tests, 66
gateway tests using the real validator, 13 Studio tests, 15 compatibility surfaces,
77 generated routes, two event families, 17 worker families, all 89 governed
boundary cases, native/WASM parity, training/offline/MJX smokes, packaging, pilots,
and hygiene. `pnpm verify:desktop-native`, locked Desktop fmt/Clippy/tests, 239 local
Markdown targets, the append-only golden review, and exact ledger audit also pass.
The stable ledger is 205 tasks: 148 done, 32 in progress, 24 open, and 1 blocked.
**Changed:** Worker bridge compiler and tests; governed hardware corpus and review
record; gateway fixture/oracle; Studio artifact details; Desktop serialport-rs
consumer, receipt, dependency declarations, and native tests; compatibility matrix
and generated artifact reference; D48/R31; quad pilot and complete agent/state/
roadmap/TODO/execution/system/best-practice guidance; this changelog. `sha2` becomes
an explicit Desktop runtime dependency for independent digest verification and
`libc` a Unix test-only dependency for the nonblocking pseudo-terminal reader; both
were already present in the resolved dependency graph.
**Decisions:** D48 fixes the first writable hardware artifact and receipt meaning.
R31 tracks false target-version/application/safety claims from transport success.
**Next:** Protect this exact tree through PR and post-merge CI/security, then add an
exact Betaflight 2025.12 target-version handshake plus post-write `failsafe_delay`
readback before the first propeller-free D12 quad HITL evidence run. Reuse the same
artifact in WebSerial only after that native protocol is proven.
**Blockers:** None for the deterministic/native P8-012 scope. Real FC/HITL/tethered/
lab/field proof requires controlled D12 hardware and remains P8-001/P8-009/P8-014/
EXT-004; signed Desktop delivery and recorder work remain P8-011/P8-013.

## 2026-07-16 — Protect the decision-grade three-morphology MJX gate
**Session:** Codex agent · branch `codex/p7010-decision-protected-evidence` ·
**Phase:** P7 · **TODO items:** P7-010 [~]
**Done:** Protected D47 and the complete decision-grade P7-010 contract through PR
#81. Exact implementation head `6c633d5` passed PR CI `29465812702` and security
`29465812703`; protected squash `d19c911` has reviewed tree
`a17544219701a91b373ab3592b0748e0eee45da6` and passed exact post-merge CI
`29466150120` and security `29466150113`. Downloaded protected artifact
`8363066891` (`mjx-feasibility-evidence`, Actions digest
`sha256:dd74f211832fa07a3d103f0226e85d723f062c58ac19b2b2aeed15bab33f8b5d`)
self-binds to clean `d19c911`; its JSON SHA-256 is
`627386b2edf5870977bee802e351e916999fcb608641f4c2ed698a3f7d63cf24`.
The retained v1 CPU smoke passes float64 parity and remains explicitly
decision-ineligible. It measured native MuJoCo at 272,093 steps/s and CPU-backed MJX
at 54,918 steps/s and reports all missing D12 proxy, declared accelerator,
overnight/tier-2 budget, provider cost, and cost-normalized-throughput evidence as
blockers. The branch and protected runs cover the v2 request/report implementation,
225 worker tests, and the full 40-step local gate; protected browser artifact
`8363142398` separately binds the clean 24-migration Postgres/real-browser matrix to
`d19c911`.
Environment authority was also checked without reading secret values: this Darwin
arm64 host exposes no Modal credential names, Modal CLI, NVIDIA device, or other
declared GPU/TPU authority, so it cannot execute the credentialed accelerator
acceptance run.
**Changed:** Protected-evidence anchors and maturity language in `AGENTS.md`,
project state, roadmap, execution overlay, TODO ledger, and compute-worker contract;
this changelog.
**Decisions:** none; D47 and R30 are now protected without changing the final
adopt/reject rule.
**Next:** Produce reviewed raw D12-proxy/legged scorecard and complete 200-candidate
CPU budget artifacts on one priced CPU host, then execute `MJX-DECISION.md` from an
exact clean protected revision on one authorized float64 CUDA/ROCm GPU or TPU and
retain the current accelerator price/bill.
**Blockers:** Final P7-010 evidence requires compute/provider authority and spend not
available in this host. Apple Metal remains inadmissible because its current JAX
plug-in lacks float64. P7-010 therefore stays `[~]`; protection is not the final MJX
decision.

## 2026-07-16 — Add the decision-grade three-morphology MJX gate
**Session:** Codex agent · branch `codex/p7010-decision-evidence` · **Phase:** P7 ·
**TODO items:** P7-010 [~]
**Done:** Implemented the unprotected D47 decision-evidence candidate on exact
protected base `0695261b0784e468181b286f1f85286dd9b66a3b` without changing or
overclaiming the protected v1 CPU feasibility row. New internal
`mjxDecisionRequest`/`mjx-benchmark` 2.0.0 requires exact ordered `d12-quad`,
`d12-rover`, and `legged` cases; canonical contract snapshots; checked-in
D12/proxy authority identities and file hashes; clean exact source; the unchanged
MuJoCo/MJX 3.9.0, JAX/JAXLIB 0.10.2 float64 protocol; requested GPU/TPU device
authority with fallback forbidden; raw CPU budget-artifact hashes; and a retained
current USD/hour source. The quad and rover bindings are explicitly simulation
proxies rather than exact SKU twins; the controlled legged row is explicitly not a
D12 rig. D47 makes overnight one scorecard-passing exact recipe within 12 hours and
tier 2 the complete declared 200-candidate workload within 12 hours.
The native command refuses CPU, Metal, fallback, wrong-device, runtime, source,
contract, authority, budget, cost, hash, and non-finite substitution before those
claims gain authority. On a supported accelerator it compiles every case through
the sovereign Rust bundle, measures warmed native MuJoCo and synchronized MJX,
retains compile/sample/parity details, computes cost-normalized throughput, and
returns the existing centralized adopt/reject/block rule. `pnpm sim:mjx:decision`
owns all contract and authority paths; callers may provide only reviewed budget and
cost evidence. The operator runbook records prerequisites, input schemas, stop
conditions, exact command, semantic review, retention, nonclaims, and whole-run
recovery. Apple's current primary JAX Metal documentation was rechecked and still
lists the experimental plug-in's `np.float64` support as unavailable, so the local
M2 Pro cannot honestly close this float64 gate. Focused request/report/backend tests
pass 18/18; the exact Python 3.12 worker suite passes 225/225; all 40 required local
gates pass with 15 compatibility surfaces, 77 routes, 17 worker families, native/
WASM parity, four-task training, offline fine-tuning, the unchanged controlled v1 MJX
smoke, and patch hygiene. Ruff reports no issues, 239 local Markdown targets resolve,
and the stable ledger remains 205 unique tasks (147 done, 33 in progress, 24 open,
1 blocked).
**Changed:** New decision benchmark worker and wrapper; centralized internal result
major propagation; P7-010 tests; package command; canonical agent read/gate/ownership
rules; D47; compatibility policy; learning/compute contracts; operator runbook and
documentation index; this changelog.
**Decisions:** D47 fixes proxy honesty, 12-hour overnight and 200-candidate tier-2
envelopes, float64, exact GPU/TPU authority, cost basis, and the final adopt/reject
meaning while preserving v1. R30 tracks false decisions caused by proxy, backend,
cross-request, precision, budget, or price substitution.
**Next:** Run full verification, protect this contract through PR/post-merge
CI/security, then from that exact clean protected revision produce the three raw CPU
budget artifacts and execute the runbook on a reviewed CUDA/ROCm GPU or TPU with a
current retained provider rate/bill.
**Blockers:** The implementation candidate is not protected yet. Final P7-010 still
requires scorecard-passing D12-proxy/legged CPU recipe evidence, the complete
200-candidate tier-2 measurement, current reviewed CPU/accelerator price or billing
evidence, and one authorized supported-accelerator run. Apple Metal cannot supply the
required float64 parity evidence.

## 2026-07-16 — Protect fail-closed Modal training operations
**Session:** Codex agent · branch `codex/p7013-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-013 [~]
**Done:** Protected the D46 Modal deployment-control implementation at contract/fixture
maturity without promoting it to credentialed sandbox, live, production, device, or
field evidence. PR #79 exact head `bc02324f735cdbb9492e76285878e43985917c4a`
passed CI `29462960862` and security `29462960834`; protected squash
`ff39cd8cd91812e3f41656b1b47c65fa98fc69dd` has the exact reviewed tree
`2c9744e34e3e2c7100c6ad377d6b57d30ae6f019` and passed post-merge CI
`29463344103` plus security `29463344085`. The protected database job
`87511370686` applied migration 0024 on a clean database and all 23 populated
predecessors, then passed the real browser/accessibility matrix, shared Modal quota,
exact debit/refund, owner cancellation, provider-call persistence, stale-lease and
late-result refusal, recovery-only reattachment, non-fabricated recovery exhaustion,
and idempotent report-bound cost reconciliation. Downloaded artifact `8362121226`
has GitHub digest `sha256:57996e2f46ec6280a7ee358756843e7b03c123e56462c755ea89924d6af227fe`;
its clean-main `p7-modal-gateway-db.json` and `p7-modal-operation-db.json` hash as
`ee01b3ffc75d8c0fda5a978b09dbd840b2a796a4e7f208378da0ea369ed25388`
and `6155601858f3db337a06e7d0273e0364152ab3307911518c9828f545aa4e829f`.
Post-merge dependency audits, both CodeQL languages, and the validated SPDX source
SBOM also pass. P7-013 deliberately remains `[~]`: none of this deterministic
evidence asserts a Modal deployment, credentialed L4 execution, provider billing,
delivered alert, automatic provider-call expiry, or production recovery result. The
stable ledger is 205 tasks: 147 done, 33 in progress, 24 open, and 1 blocked; this
corrects the stale 32/25 summary after P7-013 moved from open to in progress.
**Changed:** Canonical agent boundary; project state; roadmap and atomic TODO;
execution sequencing; and this changelog. No runtime, schema, migration, generated
contract, dependency, provider configuration, quota, or evidence threshold changed
in this reconciliation.
**Decisions:** none; D46 and R29 remain binding.
**Next:** From clean protected `ff39cd8`, execute the exact credentialed seven-day
sandbox procedure in `docs/MODAL-OPERATIONS.md`, retain and validate the redacted
`forge-modal-training-sandbox-evidence/1.0.0` record, and protect the resulting
evidence reconciliation before considering P7-013 complete.
**Blockers:** Modal credentials and authorized provider spend; lagged billing/tag
report availability; delivered alert/SLO proof; real L4 cancellation and late-result
exercise; application-artifact deletion; automatic provider input/output expiry
within seven days; and persisted-call recovery without duplicate output remain
external prerequisites.

## 2026-07-15 — Implement fail-closed Modal training operations
**Session:** Codex agent · branch `codex/p7013-deployment-control` · **Phase:** P7 ·
**TODO items:** P7-013 [~]
**Done:** Implemented the unprotected D46 contract/fixture candidate on exact protected
base `28191bfe12bd2e605767cc92a4943db33b3244ef` without claiming a deployment,
credentialed GPU call, billing result, alert, provider expiry result, or production
maturity. Modal training is narrowed to exact SDK 1.5.2 and one source-bound Python
3.12/L4 function with exact dependencies, zero provider retries, no function secrets,
blocked egress, restricted Modal access, a single-use container, and no CPU fallback.
The gateway rejects arbitrary Modal input fields; the worker projects only reviewed
training controls plus the sovereign Rust bundle, never the owner/model snapshot or
credential-shaped extras. It persists the FunctionCall ID before waiting, reattaches
every ambiguous persisted call by ID after transport/process ambiguity, cancels on
revoked authority or timeout, and rejects deployment/result drift and late output.
Exhausted recovery keeps the exact call submitted without fabricating provider
completion, and function versions remain exact across JavaScript-safe and Postgres
64-bit storage boundaries.
Migration 0024, a serializable global active/UTC-day-credit quota, debit-after-new-row
idempotency, owner-only cancellation, exact pre-materialization product-credit
reversal without reopening the conservative daily launch ceiling, provider-attempt
history, user-data export 1.4.0, and the additive job-delete
route are implemented. An operator-only serializable command binds a lagged provider
report ID, exact USD amount, and reconciliation time to both job and call, replays
idempotently, refuses conflicting cost authority, and emits one audit event. The strict
sandbox-evidence validator requires a clean
protected source, exact deployment identity, successful CUDA/L4 evidence, billing/tag
attribution, delivered alerts/SLO, spend stop, cancellation, application-artifact
deletion, verified automatic provider-call expiry within seven days, and recovery
without replacement output. The exact Python 3.12 local gate passes all 40 steps with
218 worker tests, 65 gateway tests, 15 compatibility surfaces, 77 generated routes,
17 worker families, 24 migration sources, and all native training/offline/MJX smokes.
Focused Modal tests pass 31/31; the complete SB3/MuJoCo runtime file passes 27/27.
The isolated deployment-extra audit reports no known Python vulnerabilities.
**Changed:** Modal deployment contract, adapter, CUDA trainer and evidence validator;
Postgres queue/migration/integration acceptance; gateway quota/cancellation/export
surfaces; workflow dependency installation; generated API/artifact contracts;
compatibility, roadmap, status, security, lifecycle, system, governance, risk,
operator, agent, and golden-review documentation.
**Decisions:** D46 makes the product database sovereign over provider identity,
cancellation, retry, quota, credit, and recovery authority; R29 tracks deployed-
training cost, retention, cancellation, and duplicate-output risk.
**Next:** Protect this candidate through PR CI/security and the isolated database job,
then deploy only that clean protected revision and execute the credentialed seven-day
sandbox procedure in `docs/MODAL-OPERATIONS.md`.
**Blockers:** The local Docker daemon is unavailable, so the real Postgres migration/
quota/recovery scripts require the PR database job. Modal credentials, provider spend,
lagged billing, alert delivery, and seven-day expiry evidence remain intentionally
external and cannot be inferred from this candidate.

## 2026-07-15 — Protect source-bound offline fine-tuning
**Session:** Codex agent · branch `codex/p7009-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-009 [x]
**Done:** Closed P7-009 at controlled-synthetic offline-training maturity without
promoting its result to recorder, device, field, deployed-GPU, learning-quality, or
external-user proof. PR #77 exact head `8cb70c4` passed CI `29455576345` and security
`29455576393`; synthetic merge `3bb877f` has exact protected parent `f0bb4e2` and
implementation head; protected squash `2c7562d` passed post-merge CI `29456064537`
and security `29456064498`. The required database job applies all 23 migrations on a
clean database and every populated predecessor, then passes MinIO policy delivery,
all 11 real-browser flows, supported-browser/accessibility acceptance, and commerce
materialization. Downloaded protected artifact `8359446894` self-binds to clean
`2c7562d`; `p7-offline-training.json` hashes as
`d1fe7f7ac5ce94f9dc0c443303592f3e577b66500ebd0ad23be46b275e5eac66`.
Independent base64 decoding, byte/digest recomputation, ONNX parsing/checking, and
opset/shape inspection validate hover 23,874 bytes/
`340090a84f2218772bf1b9a8818badc5ee225ae18579456b522f69f54c187c25`
and rover 22,520 bytes/
`c329ddc584846753ba46ca1acee2734d93a5a040e8715f19ca4274640352a05b`.
Both 64-sample controlled-synthetic datasets are accepted, same-seed exactness is
true, BC warmstarts and PPO final parameters are distinct, and the unchanged short
scorecards remain correctly blocked. The hover dataset/warmstart hashes are
`462a4cc1…8c3`/`cac762b8…fe7c`; rover hashes are
`0ae76e66…c56`/`b5912a87…e41c`. The stable ledger is now 205 tasks: 147 done,
32 in progress, 25 open, and 1 blocked.
**Changed:** Canonical agent boundary; project state; roadmap and atomic TODO;
execution sequencing; learning, worker, gateway, and hardware guidance; and this
changelog. No runtime, schema, migration, generated contract,
dependency, scorecard threshold, or golden artifact changed in this reconciliation.
**Decisions:** none; D45 remains binding.
**Next:** Finish P7-010's exact D12 morphology/accelerator/budget/cost decision evidence
or P7-013's deployed Modal/GPU operations, whichever prerequisite-complete lane can be
proved without inventing provider, hardware, or field authority.
**Blockers:** none for P7-009 controlled-synthetic closure. Recorded-device attestation
remains P8; deployed GPU operations remain P7-013; passing-policy delivery integration,
ground browser playback, production storage operations, external users, and field
transfer remain separate gates.

## 2026-07-15 — Implement source-bound offline fine-tuning
**Session:** Codex agent · branch `codex/p7009-offline-finetune` · **Phase:** P7 ·
**TODO items:** P7-009 [~]
**Done:** Implemented the unprotected D45 P7-009 candidate on exact protected base
`f0bb4e2` without claiming recorder, learning-quality, deployment, or field closure.
The gateway admits only local/Modal jobs naming one consented owned telemetry log,
binds the log to the same admitted model, and injects the exact tape, SHA-256, and
snapshot server-side; fixture use, caller tape/hash/snapshot/device/training fields,
missing consent, and cross-model authority fail closed. Exact tape/dataset/warmstart
1.0.0 validators require 64..100,000 finite strictly increasing samples, the exact
task/tensor, estimator-policy observations, reviewed/supervisor actions, and explicit
`controlled-synthetic` maturity without sorting, filling, projection, clipping, or
hidden truth. The worker rejects `recorded-device` until P8 recorder attestation is
defined under a reviewed version; a caller label cannot manufacture that provenance.
The native command runs the frozen 12-epoch behavior-cloning warmstart, verifies a
parameter change, continues with 256 randomized PPO steps in the existing flight or
ground MuJoCo trainer, exports ONNX, and re-enters the outer worker's independent
dataset/curriculum/scorecard gate. Repeated hover-hold and rover line-follow controlled-
synthetic runs have exact same-seed dataset, warmstart-parameter, and ONNX digests;
both short scorecards correctly remain blocked. The complete 40-step local gate passes
with 188 worker tests, 65 gateway tests, 15 compatibility surfaces, 17 generated
worker families, and the native offline smoke.
The final gate also exposed that the adjacent MJX smoke could import an editable
worker package from another worktree while binding the current Git revision. It now
prepends this checkout's `workers/` source, matching the training/offline smokes and
making the benchmark's source claim executable rather than metadata-only.
The first PR database run then exposed a newly reachable QA-004 predecessor case:
when 0022 is already installed, its fixture must write current `job_id` and byte-free
policy metadata instead of expecting the 0022 backfill to rerun. Older prefixes still
exercise that backfill; the 0022 predecessor now exercises correct current writers.
**Changed:** Gateway queue/schema/consent/source authority and tests; migration 0023;
worker dataset, native runner, SB3 curriculum, external normalizer, Modal profile,
bridge metadata, tests, required CI smoke, compatibility/artifact catalogs and golden
review; canonical agent, decision, state, roadmap, TODO, execution, migration, best-
practice, learning, worker, gateway, and hardware guidance; and this changelog.
**Decisions:** D45 defines source-bound offline data, exact no-repair samples, the
BC-to-randomized-PPO curriculum, and the unchanged scorecard as sole export authority.
**Next:** Publish the exact implementation through protected PR CI/security and its
required isolated-database gate, inspect the clean retained offline-training artifact,
merge, verify exact-main checks, and reconcile P7-009 to `[x]` only if that evidence
matches D45.
**Blockers:** The local Docker VM is unavailable, so the populated Postgres/MinIO
matrix awaits required CI; the static 23-migration ledger and both changed assertion
scripts pass. Recorded-device telemetry remains P8; deployed GPU operations remain
P7-013; learning quality, passing-policy delivery, transfer, external users, and field
proof remain separate gates.

## 2026-07-15 — Protect contract-derived rover and quadruped training
**Session:** Codex agent · branch `codex/p7014-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-014 [x]
**Done:** Closed P7-014 at controlled deterministic trainer maturity. PR #75 exact
implementation head `c0f3a8f` passed CI `29433820358` and security `29433818798`;
its synthetic merge `623d392` had exact protected parent `333e779` and exact
implementation head. Protected squash `90b1691` passed post-merge CI `29448974932`
and security `29448974951`. Downloaded protected artifact `8356753424` self-binds
to clean source `90b1691` and hashes as `20f0c25d…56ba`. Independent base64 decode,
SHA-256 recomputation, ONNX parsing/checking, graph-shape inspection, and metadata
comparison validate hover 23,874 bytes/`6b18908f…c555`, waypoint 23,878/
`783753e3…4927`, rover 22,520/`fa6c3cac…e4ad`, and quadruped 28,890/
`b400ac71…8c2e`. All four paths bind exact contract/task/tensor lineage, run 256 CPU
PPO steps with optimizer changes and estimator-only observations, and retain honest
blocked scorecards. Ground rows additionally preserve exact mass +15%, torque -10%,
friction -50%, and simulated-positive-mechanical-joint-work semantics. The exact-head
local 39-step gate plus protected required matrix cover 174 worker tests, 13 Studio
tests, the four-task smoke, Postgres/MinIO/browser acceptance, engine/MJX evidence,
security, and patch hygiene. A direct
stable-ID recount corrects the living summary to 205 total: 146 done, 33 in progress,
25 open, and 1 blocked.
**Changed:** Canonical agent boundary; project state; roadmap and atomic TODO;
execution sequencing; learning, worker, and Studio system docs; and this changelog.
No runtime, schema, golden, generated artifact, dependency, or threshold changed.
**Decisions:** none; D44 remains binding.
**Next:** Execute P7-009's remaining live offline fine-tune adapter as the smallest
dependency-complete local P7 lane, preserving deterministic dataset/warmstart evidence
and fail-closed live-provider authority.
**Blockers:** none for P7-014 controlled trainer closure. Passing ground policies,
browser ground playback, deployed GPU operations, external users, devices, and field
transfer remain separate tasks and must not inherit this smoke claim.

## 2026-07-15 — Implement contract-derived rover and quadruped training
**Session:** Codex agent · branch `codex/p7014-ground-trainers` · **Phase:** P7 ·
**TODO items:** P7-014 [~]
**Done:** Implemented the unprotected P7-014 ground-training candidate without
claiming protected or learning-quality completion. D44 introduces independent
`groundTrainingMuJoCoBundle`, `p7-ground-v1`, and
`forge-ground-policy-tensor` 1.0.0 boundaries while preserving every multirotor
major. Rust now derives a strict flat-ground MuJoCo bundle from admitted rover and
quadruped contracts, including exact joint names, position/velocity/torque limits,
differential-drive wheel geometry, QD-mini joint channels, and unsupported-shape
refusals. The worker admits only built-in line-follow and walk-to-target semantics,
keeps policy observations estimator/encoder-derived, randomizes mass, friction,
latency, sensor quality, and torque degradation without exceeding contract
authority, and reports simulated positive mechanical joint work rather than host or
battery energy. Real seeded PPO/ONNX training, evaluation, outer-worker authority,
scorecard, tamper, same-seed, and Studio-refusal tests are present. Focused evidence
is green: 39 Python tests, 13 Studio runtime tests, 15 compatibility surfaces, and a
four-task 256-step MuJoCo/SB3/ONNX smoke whose sub-threshold outputs remain correctly
blocked. QD-mini now carries generator-owned torque limits and physically owned leg
segments, with its registered Studio mirror and generated contract catalog covered
by an append-only golden review record. The first complete gate stopped correctly
on QD-mini's changed bake hash; the registry-owned generator advanced only that hash,
while all counts and its 600-step tick hash remained exact. The complete 39-step
`pnpm verify` gate then passed under Python 3.12, including Rust fmt/Clippy/workspace,
fresh and committed native/WASM parity, 13 Studio runtime tests, 65 gateway tests,
Brief-25 25/25, packaging, all 174 worker tests, four-task real training smoke,
controlled MJX feasibility, and patch hygiene.
**Changed:** Rust generator, training compiler, validator CLI, QD-mini contract;
Python ground environment, bundle/task/runtime/job authority and tests; four-task
smoke and CI label; compatibility and generated artifact catalog; Studio unsupported-
tensor refusal; canonical agent, decision, project-state, roadmap, TODO, execution,
best-practice, compatibility, model, simulation, learning, worker, and Studio docs;
native/WASM golden number plus golden record; and this changelog.
**Decisions:** D44 makes ground training an exact independent internal contract,
requires explicit contract control authority and estimator/encoder observations,
defines simulated mechanical work narrowly, and refuses browser execution until a
ground consumer is reviewed.
**Next:** Publish the exact rebased head through PR CI/security, inspect the retained
four-task artifact, merge, verify protected post-merge evidence, and only then
reconcile P7-014 to `[x]`.
**Blockers:** none for local implementation/publication. Passing learned ground
policies, browser execution, accelerator use, host/device energy, deployed GPU
operations, external acceptance, real-device transfer, and field proof are not
established by this deterministic smoke candidate.

## 2026-07-15 — Reconcile the protected P7-012 evidence anchor
**Session:** Codex agent · branch `codex/p7012-evidence-reconcile` · **Phase:** P7 ·
**TODO items:** P7-012 [x], P7-014 [~]
**Done:** Reconciled P7-012's implementation and retained-evidence authorities after
both protected changes completed. PR #72 exact implementation head `1bce0d1` passed
CI `29425066833` and security `29425066479`; protected implementation squash
`8e094c0` passed post-merge CI `29426237373` and security `29426237345`. PR #73 exact
evidence head `ecc83d0` passed CI `29428754530` and security `29428751871`; protected
evidence squash `6bfa60f` passed post-merge CI `29429475932` and security
`29429476183`. The canonical current-state surfaces now distinguish the executable
implementation source from the later protected commit that actually retains the
clean interruption/resume JSON, ONNX, and hash manifest.
**Changed:** Canonical agent boundary; project state, roadmap, TODO, execution
sequencing, learning/worker/Studio system guidance, and this changelog.
**Decisions:** none; this is an evidence-lineage correction under existing D42/D43.
**Next:** Complete P7-014's rover and legged trainers with contract-derived authority,
estimator-only observations, task/tensor compatibility, scorecards, deterministic
smoke, export integrity, and explicit unsupported-shape refusals.
**Blockers:** none for the local P7-014 slice. External users, deployed GPU operations,
measured host electricity, real devices, and field transfer remain separate proof.

## 2026-07-15 — Protect and reconcile consumer-hardware learning quality
**Session:** Codex agent · branch `codex/p7012-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-012 [x], P7-014 [~]
**Done:** Protected the P7-012 implementation through PR #72. Exact head `1bce0d1`
passed PR CI `29425066833` and security `29425066479`; protected squash `8e094c0`
passed post-merge CI `29426237373` and security `29426237345`. A clean protected
checkout on the declared Apple M2 Pro host intentionally interrupted after atomic
hover retention, confirmed no suite-success file existed, then resumed by validating
the frozen request, byte count, SHA-256, and export gate before executing waypoint.
Both eight-episode baseline and mass +15%/Kv -8%/wind 4 m/s rows pass at 1.0 under
unchanged 0.85/0.70 thresholds. Hover took 30.203 s and retained a 78,152-byte ONNX
at `9afc1152…fc4c`; waypoint took 10.340 s and retained 78,156 bytes at
`b07b023a…b1a2`. Independent reconciliation parsed both ONNX graphs, recomputed all
file digests/counts, confirmed exact `8e094c0` lineage, and found no serial/UUID or
inline model bytes. The evidence checkout then passed the complete 39-step
`pnpm verify` gate under its pinned Python 3.12 environment, including all 163
worker tests, 12 Studio policy-runtime tests, 65 gateway tests, Rust/WASM and
native/WASM parity, packaging, dual real seeded training smoke, MJX feasibility,
compatibility, security, and patch hygiene. The exact suite/task JSON, ONNX files,
and hash manifest are committed under `docs/evidence/p7-012/`.
**Changed:** P7-012 retained evidence and README; canonical agent boundary; project
state, roadmap, TODO, execution sequencing, best practices, learning/worker/Studio
system guidance, and this changelog.
**Decisions:** none; D42 and D43 are now backed by protected implementation and clean
consumer-hardware evidence.
**Next:** Execute the rover and legged remainder of P7-014, preserving contract-
derived physics, estimator-only observations, task/tensor authority, deterministic
smoke, scorecard/export rules, and explicit unsupported-shape refusals. Exact
passing-policy object delivery, P7-013 deployed GPU operations, P7-010 final MJX
decision evidence, and external/field proof remain separate lanes.
**Blockers:** none for the next local P7-014 slice. P7-012 proves controlled CPU PPO
on a GPU-capable consumer host; it does not prove GPU execution, measured host
energy/electricity cost, deployed operations, external users, real devices, or field
transfer.

## 2026-07-15 — Correct and prove the consumer-hardware training candidate
**Session:** Codex agent · branch `codex/p7012-consumer-gpu` · **Phase:** P7 ·
**TODO items:** P7-012 [~], P7-014 [~]
**Done:** Implemented the P7-012 candidate without claiming protected completion.
The first exact seed-1201 500k-step hover PPO run failed honestly at 0.375 baseline,
0.0 mass/Kv, and 1.0 wind, exposing an unstable curriculum rather than a scorecard
problem. Diagnosis found a memoryless position policy without velocity, Forge Y-up
pitch/yaw decomposition drift, raw-torque versus normalized-flight-target mismatch,
and reward/control semantics not bound to the task. D42 corrects these as coordinated
policy-tensor 2.0.0 `[1,14]`, training-bundle 2.0.0, and `p7-v3`/3.0.0 majors while
retaining exact tensor-v1 observer and 906-byte ONNX execution. The frozen
`p7-overnight-v1` curriculum now distills an estimator-only deterministic controller,
then runs conservative randomized PPO; unchanged `p7-scorecard-v1` thresholds remain
0.85 success and 0.70 robustness. Exact local M2 Pro diagnostics pass hover seed
1201 and waypoint seed 1207 at 1.0 baseline/mass/Kv/wind. Hover retained a
78,152-byte ONNX with SHA-256 `9afc1152b0e99398652274a1b97c97d53292f51995784f03323094727866fc4c`
in 45.63 s task wall time; waypoint retained a 78,156-byte ONNX with SHA-256
`b07b023aa81c4c9d96f38a0f232e92277e5c71f51b0454fcbe1f722529edb1a2`.
The resumable evidence runner freezes source/recipe/seeds/thresholds/runtime/safe
hardware/device/power authority, writes task JSON/ONNX atomically, and reuses only a
matching request hash plus valid byte count/SHA/export gate. Its interruption,
resume, tamper repair, and host-energy nonclaim tests pass. The complete 39-step
`pnpm verify` gate passes locally under Python 3.12: all 163 worker tests, 12 Studio
runtime tests, gateway/Studio typechecks, 65 gateway tests, Rust fmt/Clippy/workspace
and WASM tests, compatibility, generated-contract/golden checks, dual 256-step
MuJoCo/SB3/ONNX smoke, controlled MJX parity, and patch hygiene are green.
**Changed:** Rust training-bundle/control/tensor authority; WASM v1/v2 observers;
Python task/environment/training/evidence runtime; current and legacy ONNX fixtures;
gateway/Studio tensor-major selection; generated WASM; compatibility/migration/
decision/golden policy; project, roadmap, execution, TODO, agent, risk, debugging,
best-practice, learning, worker, motion, and Studio documentation.
**Decisions:** D42 coordinates tensor-v2/bundle-v2/task-v3 semantics and exact legacy
reads. D43 selects CPU on the declared GPU-capable M2 Pro after the same 4,096-step
MLP PPO pilot measured about 1.08 s CPU versus 13.38 s MPS, forbids backend fallback,
and separates accelerator inventory and energy/cost nonclaims from execution.
**Next:** Protect the implementation through exact-head PR and post-merge CI/security,
then run the
exact protected revision with intentional interruption after hover and validated
resume through waypoint; download and reconcile both JSON/ONNX artifacts before
closing P7-012.
**Blockers:** none for implementation/publication. Protected-source evidence is a
required remaining acceptance step, not a waived local prerequisite.

## 2026-07-15 — Reconcile protected waypoint evidence
**Session:** Codex agent · branch `codex/p7014-waypoint-evidence` · **Phase:** P7 ·
**TODO items:** P7-012 [ ], P7-014 [~]
**Done:** Protected the dependency-complete waypoint portion of P7-014 through PR
#70. Exact implementation head `b66e4b3` passed PR CI `29413578031` and security
`29413578124`; protected squash `f220d25` passed post-merge CI `29415036211` and
security `29415036274`. Downloaded artifact `8342801418` self-binds source and clean
checkout to `f220d2592b41f844f40e8c8669704a249b4f3b20`, records schema 2.0.0, and
its JSON hashes to
`8d160870a1d729b4c307953aa84965770c754a5a316ee1e1f99702dbaae041b7`. It retains
both real 256-step CPU PPO outputs. Hover-hold binds task hash
`5fdfb0746707c61f0f36d4323e825d066c0d0b64fc033dfd5dbf60f860b103e0` to a
23,004-byte ONNX graph with SHA-256
`5ff2fc01d92281dff5838479b52a6c45be193e795fef4c69fe241267e06216a7`;
waypoint-chain binds task hash
`e8ab6a92860d6c33cc80a9256f6b1ec4a2989232105417f785d3c48bd0be014d` to a
23,008-byte graph with SHA-256
`f82dc08a24fce29a298f7b4039107f7dd5bb6309150309eb039843f142620a99`.
Both scorecards remain correctly non-exportable, and the artifact explicitly
disclaims overnight/GPU/SLO, live Modal, rover/legged, external-user, and field
claims. D40's waypoint prerequisite is now satisfied; P7-012 is the next executable
training lane while rover and legged trainers remain under P7-014.
**Changed:** Canonical agent boundary; project-state anchors/counts/evidence; P7
phase, task, execution, learning, worker, Studio, and risk guidance; and this
changelog. No runtime, schema, golden, threshold, compatibility, or task semantics
changed in this reconciliation.
**Decisions:** none; D40 and D41 remain active and are now backed by protected
waypoint evidence.
**Next:** Execute P7-012 on declared consumer-GPU hardware without weakening either
scorecard, retain exact seed/config/revision/runtime/hardware/wall-time/energy/cost/
recovery/policy evidence, and reconcile the protected result before resuming the
rover/legged remainder of P7-014.
**Blockers:** none for starting the local consumer-GPU implementation/evidence lane.
A passing overnight result is not yet established; P7-013 deployed Modal/GPU
operations, production storage operations, external acceptance, and field transfer
remain separately open.

## 2026-07-15 — Implement task-v2 sequential waypoint training
**Session:** Codex agent · branch `codex/p7014-waypoint-trainer` · **Phase:** P7 ·
**TODO items:** P7-012 [ ], P7-014 [~]
**Done:** Implemented the dependency-complete waypoint portion of P7-014 without
claiming protected or learning-quality completion. D41 introduces `p7-v2`/2.0.0
with explicit `forge-y-up-rh-m` and canonical task-definition SHA-256 while keeping
v1 historical. The native exact-pinned MuJoCo/SB3 runtime now accepts only worker-
owned hover-hold or waypoint-chain definitions, follows three ordered waypoints from
estimator target error, requires complete-chain evaluation success, and keeps truth
outside policy/transition authority. Task identity/hash is bound into training
config, ONNX metadata/header, scorecard lineage, external-provider normalization,
and Studio playback. The browser retains legacy single-target reads, validates
bounded v2 chains, requests a new Rust estimator snapshot at each transition, and
zeros advisories after completion. Focused worker/SB3 and Studio tests pass; the
schema-2 dual CPU smoke executes 256 real PPO steps for each task, produces valid
digest-bound ONNX graphs, and honestly blocks both sub-threshold scorecards.
**Changed:** Training task definitions and compatibility matrix; MuJoCo task
environment; SB3 evaluation/export; external worker authority; Studio policy output,
playback, and tests; required smoke/CI label; canonical agent, project-state,
roadmap, task, execution, compatibility, learning, worker, Studio, best-practice,
decision, and changelog guidance.
All 39 required local gates pass under Python 3.12, including the registered golden
review, Rust formatting/Clippy/workspace tests, fresh and committed native/WASM
parity, production Studio build plus 11 runtime tests, 65 gateway tests, Brief-25
25/25, release packaging, all 154 worker tests, the dual-task training smoke,
controlled MJX feasibility, and patch hygiene.
**Decisions:** D41 makes the coordinate correction a task-major boundary rather than
silently changing v1 meaning; the independent `forge-policy-tensor` remains 1.0.0
because its Y-up 11-input/4-output contract did not change.
**Next:** Run the complete required gate, publish the candidate through exact-head
PR/CI/security, download and inspect the clean dual-task smoke artifact, merge, and
reconcile protected evidence; only then start P7-012 overnight hover/waypoint runs.
**Blockers:** none for local waypoint implementation. Protected exact-source proof
is pending; P7-012 additionally requires declared consumer-GPU hardware, overnight
passing scores, wall-time, energy/cost, recovery, and retained policy evidence.

## 2026-07-15 — Protect authoritative policy delivery and sequence waypoint training
**Session:** Codex agent · branch `codex/p7011-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-011 [x], P7-012 [ ], P7-014 [ ]
**Done:** Closed P7-011 through protected PR #68. Exact implementation head
`433ff3b` passed PR CI `29408733457` and security `29408733461`; the PR acceptance
artifact `8340343505` binds source `433ff3b` to GitHub's exact synthetic merge
`fc70ca2`, whose parents are the tested protected base and exact head. Protected
squash `9131289` passed post-merge CI `29409341830` and security `29409342305`.
Downloaded artifact `8340587390` self-binds source and checkout to clean
`9131289`. Its `p7-policy-delivery.v1` record hashes to
`fd6b53f3530a5de09dcafe3dd560bc793f5d6b1166a4cc90d4e7a83c79de82a2` and proves
two attempts produce one authoritative policy/object, prevent the stale upload,
persist no inline bytes, and read back the exact retained object. Digest
substitution is rejected before upload with zero rows; cancellation after upload
creates zero authoritative rows and leaves the bounded orphan to OPS-006. The
companion QA-002 record hashes to
`5f3242fc4cfc45e5bbfcd0b00bea29eb8c7340a3a3a591298757107182a3f6f7`, applies 22
migrations, and passes all 11 production-browser flows, including authenticated
same-origin retrieval and Rust estimator/motion execution of the exact 906-byte
ONNX object with SHA-256 `222102cc9a55192f00696399f553781ffc095f6fc0e3195d7456fed01a564d62`.
The QA-003 record hashes to
`a107c8e814beb5a84d14f6ca2723b2b46ab2c42ee2b52c14991922693499ad6d`, is clean and
self-bound to `9131289`, and passes full-Studio Chromium plus viewer-grade Firefox
and WebKit. This is controlled S3-compatible sandbox and deterministic product
acceptance, not production object-storage durability, a passing learned policy,
deployed GPU operations, an external user result, or field transfer.
**Changed:** Canonical agent boundary; project-state anchors/counts/evidence;
P7 phase, execution, task, learning, worker, Studio, and risk guidance; dependency
ordering for P7-012/P7-014; D40; and this changelog. No runtime, schema, golden,
threshold, or compatibility behavior changed in this reconciliation.
**Decisions:** D40 makes the waypoint portion of P7-014 a dependency of P7-012 while
preserving both stable IDs; the rover and legged portions remain after overnight
hover/waypoint proof.
**Next:** Implement the sovereign real waypoint trainer slice under P7-014 with
contract-derived observations/actions, held-out scorecard coverage, deterministic
smoke, and explicit unsupported-shape refusal; then execute P7-012 on declared
consumer GPU hardware.
**Blockers:** none for P7-011. P7-012 still requires the waypoint trainer slice plus
declared consumer-GPU runtime, wall-time, energy/cost, recovery, and retained-policy
evidence.

## 2026-07-15 — Implement lease-fenced object-backed policy delivery
**Session:** Codex agent · branch `codex/p7011-policy-delivery` · **Phase:** P7 ·
**TODO items:** P7-011 [~]
**Done:** Implemented the P7-011 candidate without claiming protected completion.
D39 and migration 0022 bind one winning D38 job to one byte-free policy and one exact
owner-scoped content-addressed ONNX object. Worker and fixture paths verify the
bounded canonical bytes, upload under the current lease, recheck authority in the
serializable success transaction, and prevent duplicate/stale/cancelled attempts
from materializing. Authenticated `GET /v1/policies/:id/model` cross-checks owner,
job, admitted model revision, exportable scorecard, tensor, lineage, complete object,
length, digest, and stored bytes; Studio verifies the retained response again before
ONNX playback. One Studio action now selects the active admitted model, creates a
fixture or configured-local job with idempotency, polls it, and loads the retained
artifact. All 39 required local non-DB gates pass under Python 3.12, including
gateway 65/65, Studio 9/9 and production build, workers 151/151, generated docs/
compatibility, native/fresh-WASM parity, packaging, real training/engine/MJX smokes,
and patch hygiene.
The first protected data-plane attempt reached the pinned image and exposed that its
declared non-root UID 100/GID 101 could not write a root-owned empty `/data` mount.
The follow-up preserves non-root MinIO: CI supplies a UID/GID-owned tmpfs, while
Compose runs a one-shot volume-permission initializer before the service starts.
The next exact-head attempt then reached the populated-predecessor matrix and exposed
that PostgreSQL could not infer the type of job IDs passed only through
`jsonb_build_object`. The fixtures now cast those bound IDs to text explicitly; the
migration itself applied cleanly and was not weakened.
That run passed all 21 populated predecessors and then exposed that the worker's
`ON CONFLICT (job_id)` did not name the partial-index predicate. Both worker and
gateway writers now spell `WHERE job_id IS NOT NULL`, so PostgreSQL can infer the
one-winner index while historical nullable rows remain intentionally outside it.
The following exact-head run passed the complete P7-011 stale-lease, exact-object,
cancellation, and substitution proof, then found the same untyped-JSON parameter
pattern in the downstream user-data 1.3.0 fixture. Its bound `modelId` is now also
explicitly text-typed so export/deletion acceptance can continue past policy setup.
**Changed:** D39 and R26; migration 0022 plus populated-predecessor assertions;
gateway object write/read, transactional policy materialization, policy-model route,
and user-data export 1.3.0; worker S3-compatible transport/materializer and protected
PostgreSQL/MinIO acceptance; Studio create/poll/fetch/play flow and substitution
tests; browser acceptance; exact-digest MinIO Compose/CI services; generated 76-route
contract documents; compatibility, migration, security, system, roadmap, task,
project-state, release, lifecycle, governance, and canonical `AGENTS.md` guidance.
**Decisions:** D39 makes inline policy bytes transient, one job/one policy/object
authority explicit, and same-origin gateway plus Studio double verification binding.
**Next:** Push the exact branch, inspect required CI/security plus the retained P7
policy-delivery and browser evidence, merge
through protection, verify post-merge checks, and reconcile P7-011 to `[x]` only then.
**Blockers:** No implementation blocker. The candidate is not complete until the
isolated protected PostgreSQL/MinIO stale-lease, cancellation-during-upload,
substitution, exact-readback, and production-browser proof is green and reconciled.

## 2026-07-15 — Protect the controlled MuJoCo/MJX feasibility foundation
**Session:** Codex agent · branch `codex/p7010-protected-evidence` · **Phase:** P7/P9 ·
**TODO items:** P7-010 [~], P9-005 [~]
**Done:** Protected the deliberately decision-ineligible P7-010 foundation through
PR #66. Exact head `f72ef09` passed PR CI `29398735858` and security `29398735849`;
protected squash `0614272` passed post-merge CI `29399434491` and security
`29399434519`. The protected worker ran all 146 tests, seeded training, real engine
parity, and the controlled MJX benchmark under exact dependencies. Downloaded
artifact `8337556569` self-binds to clean `0614272`, request SHA-256
`0d4bc68489bcb8fa44a17e193e3db918f022065b74221ff8aceed6b24ee73fc0`, the
admitted contract/MJCF, exact Python 3.12.13, NumPy 2.5.1, MuJoCo/MuJoCo-MJX 3.9.0,
JAX/JAXLIB 0.10.2, and GitHub's 4-CPU x86_64 runner. Native multithreaded MuJoCo
measured 268,902 steps/s versus CPU-backed MJX at 54,698 steps/s. Float64 parity
passed with qpos/qvel absolute errors `3.42e-12`/`2.00e-11`; the artifact JSON hashes
to `d02a5820c21fd6d4640d1192b84c48c985db3341c96ca926e0ad89c688d6a7db`.
**Changed:** Canonical agent current boundary; project-state anchors, counts, and
evidence table; P7 phase/execution roadmap; stable P7-010 ledger; and this changelog.
No runtime code, format, threshold, golden, or maturity claim changed in this
evidence reconciliation.
**Decisions:** none. The existing CPU-need + parity + at least 3x cost-normalized
throughput rule remains binding. A clean CPU/reference row validates the harness; it
cannot authorize MJX adoption, rejection, or P9 batching.
**Next:** Close P7-011's object-backed one-click policy delivery, then acquire exact
D12 quad/rover/legged models, declared accelerator hardware, CPU overnight/tier-2
budgets, and cost evidence before finishing P7-010 or enabling P9-005.
**Blockers:** none for the protected foundation. D12 rover/legged training-ready
contracts and declared accelerator/budget/cost evidence remain prerequisites for the
owning final decision.

## 2026-07-15 — Establish the controlled MuJoCo/MJX benchmark boundary
**Session:** Codex agent · branch `codex/p7010-mjx-benchmark` · **Phase:** P7/P9 ·
**TODO items:** P7-010 [~], P9-005 [~]
**Done:** Implemented the first real, deliberately decision-ineligible P7-010
measurement path. A strict `mjxBenchmarkRequest` 1.0.0 freezes the admitted hover
snapshot, canonical request/source hashes, exact NumPy 2.5.1, MuJoCo/MuJoCo-MJX
3.9.0, JAX/JAXLIB 0.10.2, float64, one SI-unit perturbation protocol, and identical
solver/timestep/controls. The native command compiles through sovereign Rust truth,
warms both engines, separates JAX lowering/compilation, synchronizes every timed
pytree, compares native multithreaded MuJoCo with batched MJX, checks absolute qpos/
qvel bands, and emits a source/request/contract/MJCF/runtime/hardware-bound
`mjx-benchmark` 1.0.0 report. The central policy now distinguishes missing evidence
from failed evidence and requires clean source, declared accelerator, budget, and
cost authority for controlled/sandbox/live rows. A real dirty-checkout Apple ARM CPU
run measured roughly 822k native MuJoCo versus 121k CPU-MJX steps/s with float64
parity errors around `1e-11`; it correctly blocked adoption. All 146 worker tests and
15 focused MJX tests pass under Python 3.12, including finite-number refusal,
direct-checkout binding, and eligible-adopt/eligible-reject outcomes that remain
distinct from missing evidence. The complete repository gate passes all
39 required local steps, including the real seeded training smoke, the new real MJX
feasibility smoke, native/fresh-WASM parity, release packaging, and patch hygiene;
the exact expanded Python environment also passes the pinned advisory audit.
**Changed:** Native MJX command and smoke wrapper; central decision policy and tests;
exact optional dependencies; required local/CI smoke and retained evidence artifact;
security audit installation; compatibility, learning, worker, best-practice, agent,
phase/execution, task, project-state, and changelog documentation.
**Decisions:** none. The existing P7-010 CPU-need + parity + 3x cost-normalized rule
remains binding. Internal evidence envelope 1.0.0 freezes the controlled protocol;
measured benchmark output is not a golden.
**Next:** Publish through protected CI/security, inspect the retained clean-source
artifact, then acquire exact D12 quad/rover/legged models and declared GPU/budget/
cost evidence before making the adoption decision.
**Blockers:** none for the controlled harness. The D12 rover/legged training-ready
contracts and declared accelerator/cost/overnight evidence are prerequisites for
finishing P7-010, not reasons to weaken or close it from this reference CPU run.

## 2026-07-15 — Protect the seeded SB3/MuJoCo training runtime
**Session:** Codex agent · branch `codex/p7003-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-003 [x], P7-011..014 [ ]
**Done:** Closed P7-003 through protected PR #64. Exact head `d81a03c` passed CI
`29393871628` and security `29393871650`; protected squash `d1c4c38` passed CI
`29394580998` and security `29394580959`. Downloaded protected artifact `8334594354`
self-binds to a clean `d1c4c38`, exact runtime/lock/dependency/contract/config/seed
lineage, changed optimizer parameters, estimator-only observations, and a real valid
opset-18 `[1,11] -> [1,4]` ONNX graph whose decoded SHA-256 matches the envelope.
Its 256-step zero-success scorecard remains honestly non-exportable. Browser artifact
`8334722186` records 11/11 production-bundle/real-WASM/isolated-Postgres flows,
including exact saved-model revision binding and completed ONNX playback.
**Changed:** Canonical agent current boundary, project-state evidence/counts,
P7 phase/execution roadmap, stable task ledger and adjacent delivery/quality/
deployment/coverage tasks, learning/worker/Studio/platform status language, and this
changelog. No runtime code, format version, threshold, golden, or maturity claim was
changed by this evidence reconciliation.
**Decisions:** none. D8, D9, D17, validator sovereignty, exact MuJoCo 3.9.0, and
`forge-policy-tensor` 1.0.0 remain binding. A short runtime smoke cannot authorize
policy export or stand in for overnight learning quality.
**Next:** Execute P7-010's real D12 CPU-MuJoCo versus MJX benchmark to make the
adoption decision before investing in tier-2/3 batching, then close P7-011/P7-012.
**Blockers:** none for P7-003. Real D12 benchmark capacity, declared consumer-GPU
overnight proof, deployed Modal operations, external participants, and field transfer
remain explicit prerequisites for their owning tasks.

## 2026-07-15 — Execute the real seeded SB3/MuJoCo training boundary
**Session:** Codex agent · branch `codex/p7003-sb3-runtime` · **Phase:** P7 ·
**TODO items:** P7-003 [~]
**Done:** Implemented a controlled real CPU training path from an authenticated
owner's admitted model to a deterministic fixed-shape opset-18 ONNX candidate. The
gateway rejects caller-owned snapshots and freezes exact admitted bytes/hash;
`forge-validate training-bundle` re-runs sovereign admission and derives the MJCF,
mass/gravity/hover trim, powertrain curve, estimator, control bounds, and policy
layout in Rust. The Python worker verifies both versioned envelopes, exact runtime
pins, and every authoritative field before executing seeded PPO or SAC in a real
MuJoCo hover environment with estimator-only observations, normalized actions, and
mass/Kv/sag/latency/friction/wind/noise/dropout randomization. Evaluation covers
baseline, mass +15 %, Kv -8 %, and 4 m/s wind; lineage binds source, contract,
configuration, dependency, seed, parameter, and ONNX digests. Focused Rust and
gateway tests pass, the complete worker suite passes 138/138 under Python 3.12, both
algorithms and same-seed ONNX reproducibility pass, and a 256-step local PPO smoke
produces a real graph. That dirty-worktree short smoke is explicitly not acceptance
or learning-quality proof. After adding the required append-only review record for
the regenerated internal-schema catalog, the complete Python 3.12 `pnpm verify`
gate passes all 38 required local steps. Saved-model selection now loads the exact
persisted contract/report into Studio, and model-bound fixture/reuse jobs omit a
caller-derived hash so the gateway remains the authority for the selected revision.
Studio tracks that exact snapshot SHA separately from the validator report's
canonical typed-contract hash and clears the binding on non-model loads or patches;
policy playback therefore fails closed unless its lineage matches the loaded saved
revision; browser acceptance re-reads that revision after an edit instead of trusting
the pre-edit hash. Template-generated multirotors now also carry the explicit
complementary-estimator authority required by both training and browser playback,
instead of being admitted but unusable at that boundary.
**Changed:** Rust training-bundle derivation and validator command; gateway job
authority; worker bundle verifier, MuJoCo environment, SB3 trainer/runner, external
job normalization, Modal pins, tests, exact optional dependencies, required CI
training installation/smoke/artifact, compatibility matrix/checker, full-gate
registration, generated artifact catalog and append-only golden review record,
exact Python training-runtime advisory audit and license record,
Studio saved-model/job binding, browser hash-alignment acceptance, system/
compatibility/best-practice docs, current-state/phase/execution roadmaps,
stable P7-003 ledger note, and this changelog.
**Decisions:** none. D8, D9, D17, validator sovereignty, exact MuJoCo 3.9.0, and
`forge-policy-tensor` 1.0.0 remain binding. The pinned legacy TorchScript ONNX
exporter is a controlled implementation detail; migration requires reviewed
fixed-shape/browser parity evidence.
**Next:** Publish the exact clean candidate through protected CI/security and
isolated-Postgres/browser acceptance, inspect the retained clean-source training
artifact, and reconcile only the maturity actually proven.
**Blockers:** none for implementation. Protected evidence, an overnight passing
hover/waypoint policy, one-click object-backed delivery, deployed Modal/GPU proof,
offline fine-tune, broader archetypes, MJX measurements, and EXT-003 remain open.

## 2026-07-15 — Close browser ONNX execution on protected main
**Session:** Codex agent · branch `codex/p7008-protected-evidence` · **Phase:** P7 ·
**TODO items:** P7-008 [x]
**Done:** Closed P7-008 through protected PR #62. Exact implementation head
`2686d1a` passed CI `29387737921` and security `29387737947`; protected squash
`1de7974` passed post-merge CI `29388166478` and security `29388166407`, including
Rust, all 37 acceptance surfaces, 130 Python worker tests, Desktop, isolated
Postgres, dependency audit, SPDX, and both CodeQL languages; exact-head dependency
review also passed.
Browser jobs `87264528677` and `87265803914` retained artifacts `8332187895` and
`8332317185`: both record an 11/11 production-bundle/real-WASM flow set, completed
hash/lineage-bound ONNX policy playback, and lazy same-origin runtime JS/WASM assets.
The protected boundary is 15 compatibility surfaces, 64 gateway tests, 130 worker
tests, and six focused real-runtime Studio tests.
**Changed:** Canonical agent current boundary, project-state evidence/counts,
phase/execution roadmaps, stable P7-008 ledger state, and changelog. No runtime code,
dependency, public compatibility format, golden, provider, hardware authority, or
product-maturity claim changed in this reconciliation.
**Decisions:** none. D8, D9, D16, D17, and policy-tensor 1.0.0 remain binding; this
evidence does not promote fixture playback into live training or field authority.
**Next:** Execute the next dependency-complete P7 lane, beginning with a live
feasibility audit of the pinned D12 MJX benchmark contract under P7-010.
**Blockers:** none for P7-008. Live SB3/MuJoCo training, object-backed external
models, offline fine-tune, D12 MJX measurements, hardware, and field transfer remain
separately gated.

## 2026-07-15 — Execute the real browser ONNX policy boundary
**Session:** Codex agent · branch `codex/p7008-onnx-runtime` · **Phase:** P7 ·
**TODO items:** P7-008 [~]
**Done:** Replaced procedural scorecard-derived playback with a real digest-bound
opset-18 Gemm+Tanh hover policy executed by exact `onnxruntime-web` 1.27.0's lazy
WASM-only entry. `CoreSession` now derives an independently versioned 11-scalar
`forge-policy-tensor` 1.0.0 input from contract estimator and inline powertrain state;
motion truth stays inside Rust. Studio verifies scorecard/D8 authority, exact contract
lineage, schema/version/frame/layout/shapes/rate, strict model encoding/size/SHA-256,
runtime names/type/shape, finite observations/actions, and normalized bounds before
feeding asynchronous 50 Hz advisories into the 120 Hz motion loop. Failure or timeout
zeros commands and stops. Only the real hover fixture exports bytes; other fixture
tasks now stay held. Six Studio tests execute the model and its refusal matrix,
gateway tests pass 64/64, worker tests pass 130/130, focused Rust crates pass, the
production build emits a separate lazy ONNX JS/WASM pair, compatibility/docs drift
passes at 15 surfaces, and the production audit reports no known vulnerabilities.
The complete 37-step gate passes under Python 3.12, including Rust formatting,
Clippy, workspace tests, WASM cross-compilation, native/WASM parity, generated and
golden contracts, release packaging, 64 gateway tests, 130 worker tests, the six
real-runtime Studio tests, and patch hygiene.
**Changed:** Motion truth/estimator/powertrain observer boundary, WASM/local/worker
session protocol, digest-bound gateway and Python fixtures, external inline-model
pass-through, Studio controller/UI/tests, lazy runtime dependency and supply-chain
allowlist, QA-002 browser flow (11 paths), policy-tensor compatibility/migration/
deprecation contracts, system/best-practice docs, living task/phase/execution state,
and generated contract references. The new runtime dependency is MIT-licensed,
exact-pinned, same-origin, and excluded from first paint.
**Decisions:** none. D8, D9, D16, D17, and the compatibility policy already govern
the estimator, advisory rate, core boundary, determinism, and version semantics.
**Next:** Publish the exact candidate through protected CI/security and
isolated-Postgres browser acceptance, inspect retained ONNX evidence, then reconcile
P7-008 to `[x]` only after post-merge checks pass.
**Blockers:** none for implementation. Exact-head/protected evidence is outstanding;
local browser acceptance also lacks an isolated `DATABASE_URL`. Live SB3/MuJoCo
training, object-backed external models, hardware, and field transfer remain separate.

## 2026-07-15 — Close real engine parity on protected main
**Session:** Codex agent · branch `codex/p6010-protected-evidence` · **Phase:** P6 / QA ·
**TODO items:** P6-010 [x]
**Done:** Closed P6-010 and the deterministic P6 phase exit through protected PR #60.
Exact implementation head `aa5b133` passed CI `29383163191` and security
`29383163204`; protected squash `c0f5172` passed post-merge CI `29383489511` and
security `29383489520`, including Rust, TypeScript/gateway, Desktop, isolated
Postgres/real-browser, dependency, SPDX, CodeQL, and the real engine worker. Worker
job `87252899630` retained the request and both baselines plus a passing comparison
bound to source revision `c0f51726d09ebc28852b75f894266e2d2d78a7c3` and request
SHA-256 `66059445aae9ac24b4bd85abbff3bf71e38d355f3c2050d3e2df166db9e4103f`.
Exact MuJoCo 3.9.0 remained paired with Rapier at a 1/240 s driver and four substeps;
the unchanged bands passed with drop, pendulum, hover, and gait deltas of
0.001396765 s, 0.000070124 s, 6.98e-10, and 0.000061964 m.
**Changed:** Canonical agent boundary, project-state evidence/counts, phase and
execution roadmaps, P6-010 ledger state, simulation/worker status, and changelog.
No runtime code, dependency, public compatibility format, golden, tolerance,
provider, hardware authority, or release claim changed in this reconciliation.
**Decisions:** none. D20 and the reviewed MuJoCo 3.9.0 pin remain binding; the
protected evidence did not justify a re-pin or tolerance change.
**Next:** Begin P7-008 as the next dependency-complete product lane: execute a
scorecard-authorized ONNX fixture through ONNX Runtime Web and feed bounded outputs
through the motion policy layer without implying live SB3 training or hardware
authority.
**Blockers:** none for P6-010. Live SB3/GPU work, diverse third-party imports,
providers, hardware, and field transfer remain separately gated.

## 2026-07-15 — Require real contract-derived engine parity
**Session:** Codex agent · branch `codex/p6010-engine-parity` · **Phase:** P6 / QA ·
**TODO items:** P6-010 [~]
**Done:** Replaced the duplicate hand-authored MuJoCo parity scenes with four MJCF
scenes emitted by the checked-out Rust exporter from the same canonical contracts
Rapier executes. A real local MuJoCo 3.9.0 run passes the unchanged bands: drop delta
0.001396765 s, pendulum delta 0.000069847 s, hover-trim delta 6.98e-10, and gait-CoM
delta 0.000061964 m. The first contract-derived run failed closed and exposed that
MJCF joint ranges in documented radians were being compiled under MuJoCo's degree
default; the exporter now declares radians explicitly. The registered exporter and
MuJoCo baseline candidates were regenerated through their named procedures and one
append-only physics review record captures the before/after evidence. Focused Rust
tests, five MuJoCo-worker tests, the registered keyless fixture check, golden policy,
and the real live-engine command pass locally.
**Changed:** Canonical parity scenario/runtime contracts; MJCF runtime export options
and radian unit declaration; validator request CLI; bounded/versioned Python runner;
exact MuJoCo dependency pin; live and reviewed-capture orchestration; registered
physics fixtures/evidence; the existing required worker CI job and artifact upload;
agent, state, phase, execution, simulation, worker, compatibility, governance,
threat-model, risk, task, and changelog guidance.
**Decisions:** none. D20 remains binding. The reviewed MuJoCo 3.9.0 baseline stays
pinned even though official upstream sources list 3.10.0 as current on 2026-07-15;
adopting a new engine version requires a separate measured parity review rather than
an unbounded dependency update. No tolerance, authority, or public format changed.
**Next:** Run the complete local gate, publish the exact candidate through the
existing protected checks, inspect the uploaded real-engine evidence, then reconcile
P6-010 to `[x]` only after exact-head and protected post-merge CI/security pass.
**Blockers:** none for implementation. Protected remote evidence is still required;
SB3 training, GPU performance, diverse external imports, providers, hardware, and
field transfer remain separate tasks.

## 2026-07-15 — Close contributor onboarding on protected main
**Session:** Codex agent · branch `codex/doc006-protected-evidence` · **Phase:** DOC /
governance · **TODO items:** DOC-006 [x]
**Done:** Closed the documentation-completion lane through protected PR #58. Exact
implementation head `c83f036` passed CI `29379546230`, security `29379546201`, and
the separate CodeQL aggregate. Protected squash `3078dba` passed post-merge CI
`29380212006` and security `29380212007`, including the 36-step-equivalent Rust,
workers, TypeScript/gateway, isolated Postgres/real-browser, accessibility, native
Desktop, dependency audit, SPDX, and both CodeQL language paths. The canonical
onboarding contract, maintainer-only curation source, entry links, exclusions,
assignment/reassignment flow, and seed issues #55-#57 are therefore protected. The
open issues remain process evidence only; no external contribution is claimed. The
evidence-reconciliation tree also passes all 69 local Markdown targets, issue-form
YAML parsing, live issue-state checks, `git diff --check`, and the complete 36-step
local gate under Python 3.12.
**Changed:** Canonical agent current boundary, project-state evidence and counts,
phase/execution roadmaps, stable DOC-006 ledger state, and changelog. No runtime API,
dependency, public compatibility format, golden, provider, hardware authority, or
product-maturity claim changed.
**Decisions:** none. Maintainer curation, assignment authority, seven-day inactivity
flow, and sensitive-surface exclusions remain the binding contributor contract.
**Next:** Begin the next dependency-complete product lane from the 61 remaining tasks;
prioritize credentialed catalog acceptance plus EXT-001 only when the owner supplies
the required provider sandbox and qualified independent participant.
**Blockers:** none for documentation completion. Credentials/providers, independent
users, production operations, controlled hardware, and field evidence retain their
existing prerequisites.

## 2026-07-15 — Establish curated contributor onboarding
**Session:** Codex agent · branch `codex/doc006-contributor-onboarding` · **Phase:** DOC /
governance · **TODO items:** DOC-006 [~], GOV-003 maintenance [x]
**Done:** Closed the prerequisite audit-client evidence gap: PR #54 exact head
`00ae9a0` passed CI `29378364147`/security `29378364143`, and protected squash
`41dee2d` passed post-merge CI `29378749550`/security `29378749542`. Added one
canonical contributor-onboarding contract, a maintainer-only curation template, and
consistent discovery/claim/assignment/review links across public and agent entry
surfaces. Exercised the workflow with three live, bounded, unassigned issues:
[#55](https://github.com/RNT56/TTC/issues/55) for a validator-report walkthrough,
[#56](https://github.com/RNT56/TTC/issues/56) for a dependency-free link checker,
and [#57](https://github.com/RNT56/TTC/issues/57) for Markdown-escaping tests. Each
records a mentor, protected-main anchor, exact scope/exclusions, acceptance commands,
and the same seven-day reassignment flow. Open issues prove process shape, not a
successful external contribution. All 69 repository Markdown files resolve their
local targets, all three issue-form YAML files parse, the seed issues remain open and
unassigned with the intended labels, `pnpm audit --audit-level low` reports no known
vulnerabilities, and the complete 36-step gate passes under Python 3.12, including
63 gateway tests, Brief-25 25/25, native/WASM parity, packaging, 127 worker tests,
and patch hygiene.
**Changed:** Contributor onboarding, curation template, issue chooser, pull-request
template, CONTRIBUTING, SUPPORT, README and docs index, canonical agent entry,
repository governance, current state, phase/execution roadmaps, TODO ledger, and
changelog.
**Decisions:** none. Maintainers alone apply `good first issue`; assignment is the
authoritative claim, and sensitive authority remains excluded from entry-level work.
**Next:** Publish the exact candidate through protected PR, require exact-head and
post-merge CI/security, then reconcile DOC-006 as complete without claiming external
contributor success.
**Blockers:** none for deterministic documentation/process work. External contributor
success, credentials/providers, operations, controlled hardware, and field proof
remain separate evidence gates.

## 2026-07-15 — Restore the fail-closed npm advisory gate
**Session:** Codex agent · branch `codex/doc005-protected-evidence` · **Phase:** GOV /
supply chain · **TODO items:** GOV-003 maintenance
**Done:** Diagnosed PR #54 security run `29377444789` as an audit-client protocol
failure, not a vulnerability result: npm returned HTTP 410 for pnpm 10.33.0's
retired `/audits/quick` and `/audits` endpoints. Upgraded the reviewed toolchain pin
to pnpm 11.13.0, whose audit client uses the replacement bulk-advisory endpoint, and
made the required esbuild 0.25.12/esbuild 0.28.1/wasm-pack 0.15.0 lifecycle authority
explicit and version-exact. `pnpm install --frozen-lockfile` and
`pnpm audit --audit-level low` pass locally with no lockfile drift and no known
vulnerabilities. The complete 36-step local gate also passes under Python 3.12,
including generated-contract drift, 63 gateway tests, 127 worker tests, native/WASM
parity, release packaging, and cumulative patch hygiene.
**Changed:** Root package-manager pin; pnpm workspace lifecycle allowlist;
contributor prerequisites; canonical agent and repository-governance supply-chain
rules; current state, phase/execution guidance, stable GOV-003 maintenance record,
and changelog. No application dependency, runtime API, compatibility format, live
provider, hardware boundary, or maturity claim changed.
**Decisions:** none. A registry/audit transport failure remains a failed control and
cannot be waived or reported as a clean audit.
**Next:** Publish the exact candidate to PR #54 and require a green replacement
dependency-audit job plus all protected checks before merge and post-merge
reconciliation.
**Blockers:** none after the toolchain migration. External credentials/providers,
independent users, operations, controlled hardware, and field proof remain separate.

## 2026-07-14 — Close governed interface documentation on protected main
**Session:** Codex agent · branch `codex/doc005-protected-evidence` · **Phase:** DOC /
compatibility · **TODO items:** DOC-005 [x]
**Done:** Closed DOC-005 through protected PR #53. Exact implementation head
`e79bbb1` passed the complete 36-step local gate under Python 3.12, PR CI
`29375146614`, security `29375146592`, and the separate CodeQL aggregate. Protected
squash `22c263b` passed post-merge CI `29376742319` and security `29376742373`,
including 75-route/two-event/sixteen-worker generated-reference drift, fourteen
compatibility surfaces, isolated Postgres and real-browser acceptance, three-engine
accessibility, native Desktop, dependency audits, SPDX, and both CodeQL languages.
The first PR head exposed incomplete Markdown escaping; the exact-head backslash and
newline fix passed all gates and no failing alert carried into protected `main`.
**Changed:** Canonical agent entry, project state, phase/execution roadmaps, stable
DOC-005 ledger row, counts, and changelog. No runtime API, dependency, live-provider
path, hardware authority, or maturity claim changed in this evidence reconciliation.
**Decisions:** none. D31 and the compatibility/deprecation contracts remain binding.
**Next:** Execute DOC-006's maintainer-curated first-good-issue workflow, exercise it
with bounded dependency-free issues, and close the final documentation task through
protected evidence.
**Blockers:** none for DOC-006 documentation/process work. Live credentials/providers,
external users, operations, controlled hardware, and field evidence retain separate
owners and prerequisites.

## 2026-07-14 — Generate governed interface documentation
**Session:** Codex agent · branch `codex/doc005-contract-docs` · **Phase:** DOC /
compatibility · **TODO items:** DOC-005 [~]
**Done:** Added one reviewed source manifest and deterministic generator for the
gateway API, streamed/job events, and worker artifact families. The generated
OpenAPI 3.1 reference exact-matches all 75 Fastify registrations; the event and
artifact catalogs cover two event families and all sixteen worker queue kinds; the
compatibility matrix now governs fourteen surfaces. Migration/deprecation guides and
four synthetic examples preserve the pre-1.0, fixture/contract, authorization, BYO-
key, and independently versioned-response boundaries. The complete 36-step local
gate passes under Python 3.12, including 63/63 gateway tests, 127/127 worker tests,
19 golden-policy tests, native/WASM parity, packaging, generated-doc drift, and patch
hygiene.
**Changed:** Runtime route observation; documentation source/generator and generated
references; migration, deprecation, and example guidance; compatibility and golden
registries; required CI and local gates; canonical agent entry; README; gateway,
governance, best-practice, compatibility, state, phase, execution, and task docs.
**Decisions:** none. D31 and existing compatibility/deprecation authority remain
binding; no runtime API, schema, dependency, live-provider path, or maturity claim
changed.
**Next:** publish this exact candidate through protected PR CI/security, then record
the protected merge and post-merge evidence before closing DOC-005.
**Blockers:** none for deterministic delivery. Live providers, hardware, external
users, operations, and field evidence retain their separate prerequisites.

## 2026-07-14 — Close protected parity reliability acceptance
**Session:** Codex agent · branch `codex/qa012-protected-evidence` · **Phase:** QA /
render reliability · **TODO items:** QA-012 [x]
**Done:** Closed QA-012 through protected runtime evidence. Exact implementation
head `8d4bf63` passed the complete 35-step local gate, authoritative clean-tree local
parity, branch nightly `29370725355`, PR #50 CI `29370722178`, and security
`29370722124`. Protected squash `6f8509b` passed post-merge CI `29371177801`, security
`29371177809`, and exact-main nightly `29372161650`. Downloaded protected artifact
`8326520247` uses `forge-parity-gallery.v1`, binds matching source/checkout SHAs to
the clean merge, records one isolated full-Studio Chromium/high-WebGL preflight with
no page errors, and passes all six low-WebGL scenes at unchanged edge F1
0.957-0.995, 3 draws, and exact 2,208/4,662 triangle counts. Current G0 acceptance is
restored; the earlier Canvas2D runs remain regression evidence, not acceptance.
**Changed:** Canonical agent entry, project state, phase/execution roadmaps, stable
QA-012 ledger row, counts, and changelog. No runtime, golden, camera, threshold,
draw-call budget, browser tier, or compatibility format changed in this evidence
reconciliation.
**Decisions:** none. Existing D15/QA-003 browser tiers and P1-015 parity authority
remain binding; Canvas2D is valid viewer fallback evidence but never parity proof.
**Next:** merge this evidence reconciliation through protected checks, then select the
next smallest dependency-complete lane from the 63 remaining tasks without
misstating credential, external-user, operations, hardware, or field prerequisites.
**Blockers:** none for QA-012 closure. Live-provider, independent-user, operations,
controlled-lab, and field gates remain separate prerequisites.

## 2026-07-14 — Restore fail-closed WebGL parity evidence
**Session:** Codex agent · branch `codex/qa012-parity-reliability` · **Phase:** QA /
render reliability · **TODO items:** QA-012 [~]
**Done:** Diagnosed both current nightly failures as deterministic harness drift from
QA-003, not golden-image or random GPU drift. The custom parity server lacked the
COOP/COEP headers now required for full Studio, so Chromium correctly selected the
viewer-grade Canvas2D path; the new semantic `<main>` wrapper also made the old
direct-child chrome selector match nothing. The candidate now shares the production
isolation contract, hides non-canvas presentation subtrees by canvas ancestry,
requires full-Studio/Chromium/high/WebGL preflight, permits only one fresh-browser
retry after an isolated renderer-initialization failure, asserts low/WebGL/advanced
quality on every capture, and preserves attempt diagnostics. Both JSON evidence files
now carry the `forge-parity-gallery.v1` schema, declared source SHA, checked-out SHA,
and dirty-worktree state; workflow proof rejects SHA drift or a dirty checkout. Nine
policy tests pass. The real local gallery passes all six unchanged structural gates
at edge F1 0.957-0.995, 3 draws, and exact 4,662/2,208 WebGL triangle counts. The complete
35-step gate and focused Chromium browser-support acceptance pass under Python 3.12.
QA-007 evidence PR #49 also passed and merged as `0f31b82`; post-merge CI
`29369026150` and security `29369026035` are green.
**Changed:** Parity server/capture policy and focused tests; package and CI/nightly
commands; canonical agent entry; browser/render/governance/best-practice guidance;
README; project state, phase/execution roadmap, QA-012 task, and changelog.
**Decisions:** none. This enforces existing D15/QA-003 capability tiers and P1-015
render authority; it does not change the frozen oracle, cameras, goldens, edge-F1
threshold, draw-call budget, product browser tiers, or compatibility formats.
**Next:** dispatch the workflow on the final exact branch head, inspect its embedded
source identity plus full-Studio preflight and six-scene artifact, then publish
through protected PR/post-merge checks and a final protected-main nightly before
QA-012/G0 closure.
**Blockers:** none for deterministic implementation. Current protected G0 remains
regressed until exact remote nightly proof passes.

## 2026-07-14 — Close protected adversarial corpus acceptance
**Session:** Codex agent · branch `codex/qa007-protected-evidence` · **Phase:** QA /
cross-boundary quality · **TODO items:** QA-007 [x], QA-012 [~]
**Done:** Closed QA-007 through protected main. Exact implementation head `fb6eacc`
passed PR #48 CI `29366837836` and security `29366838444`, including dependency
review/audit, source SPDX, native Desktop, Rust, workers, TypeScript/gateway,
isolated Postgres/real-browser acceptance, and both CodeQL languages. Protected
squash `e89bb15` passed post-merge CI `29367356078` and security `29367355993`.
The protected 35-step baseline now governs the exact eight-file/89-case boundary
inventory and its Rust/Python consumers. The ledger is 201 tasks: 137 done, 38 in
progress, 25 open, and 1 blocked. Current-state review also found scheduled nightly
`29311327203` passed core coverage but captured the intentional Canvas2D fallback
instead of WebGL for all six parity scenes; exact-current-main rerun `29367911748`
reproduced the same failure while coverage remained green.
**Changed:** Canonical agent entry point; project-state evidence ledger; phase and
execution roadmaps; QA-007 closure; new QA-012 regression task and current-G0
boundary; changelog.
**Decisions:** none. QA-007 remains deterministic fixture evidence and does not claim
credentialed providers, diverse real external imports, hardware, load, external
users, or field maturity. Visual parity still requires the full WebGL renderer; the
Canvas2D support fallback is not acceptable parity proof.
**Next:** harden the nightly parity harness to assert full-WebGL quality, retry only
bounded initialization failures, and preserve the existing six-scene thresholds;
then prove the exact change through a manual nightly and protected CI/security.
**Blockers:** none for QA-007. Credentialed providers, qualified external
participants, production operations, and controlled hardware remain prerequisites
for their own roadmap lanes.

## 2026-07-13 — Govern adversarial trust-boundary failures
**Session:** Codex agent · branch `codex/qa007-adversarial-corpus` · **Phase:** QA /
cross-boundary quality · **TODO items:** QA-007 [~], QA-008
**Done:** Added the exact eight-file `forge-boundary-fuzz.v1` inventory with 89
globally unique reviewed cases for imports, JSON Patch, EnvSpec, replay, provider
output, catalog citations, D10 export policy, and hardware payloads. Registered it as
the fifteenth golden family with an append-only review record and extended the
existing fuzz gate without increasing the 35-step total. Rust consumers pin patch,
import, EnvSpec, and replay outcomes plus randomized no-panic properties; Python
3.12 consumes replay/provider/citation/export/hardware outcomes. Hardened supported
import numerics/graphs and dominant-axis ordering, native/worker replay finiteness,
EnvSpec gate finiteness, finite `[0,1]` citation confidence and HTTPS/extractor
identity, bounded hardware JSON, safe config tokens, unique finite telemetry time,
and strict finite supervisor vectors/limits. Focused corpus and golden-policy checks,
all 47 forge-sim unit tests plus 5 corpus/property tests, the JSON Patch corpus test,
and 127/127 worker tests pass. The complete 35-step local gate also passes under
Python 3.12, including native/WASM parity, packaging, and cumulative patch hygiene.
**Changed:** Registered corpora/checker/record; Rust contract/simulation tests and
import/replay/EnvSpec boundaries; Python replay/citation/bridge boundaries and worker
tests; test-only forge-sim `proptest`; AGENTS, compatibility, risk, best-practice,
state/phase/execution/TODO, golden-policy, and affected system documentation.
**Decisions:** none. This is a patch-level strictness correction for already-invalid
non-finite, malformed, contradictory, or unsafe evidence. Valid format/version
support is unchanged, and fixture evidence does not claim providers, hardware, load,
external users, or field maturity.
**Next:** publish the inspected exact candidate through the protected PR-only
ruleset, and close QA-007 only after exact PR and post-merge CI/security evidence
passes.
**Blockers:** none for deterministic implementation. Live providers, diverse real
external imports, performance/load, controlled hardware, and field evidence retain
their separate prerequisites.

## 2026-07-13 — Close protected queue and upload fault acceptance
**Session:** Codex agent · branch `codex/qa005-protected-evidence` · **Phase:** QA /
worker and object reliability · **TODO items:** QA-005 [x]
**Done:** Closed QA-005 through protected main. Exact implementation head `5663900`
passed PR #46 CI `29291536114` and security `29291536115`, including the required
Postgres data plane, dependency review/audit, source SPDX, native Desktop, workers,
Rust, TypeScript/gateway, both CodeQL languages, and the aggregate check. The PR
artifact bound source `5663900` to synthetic merge `99024b8` and passed both QA-005
matrices. Protected squash `7970005` then passed post-merge CI `29292041469` and
security `29292041441`. Its downloaded clean artifact binds source and checkout
exactly to `7970005`, applies 21/21 clean migrations and all 20 populated
predecessors, and proves crash reclaim, two-attempt one-time materialization,
stale/cancelled-result discard, bounded outage recovery, terminal rate exhaustion
with its 17 s hint, partial-upload refusal/retry, exact metadata completion, and
verified consent/job success. The ledger is now 200 tasks: 136 done, 37 in progress,
26 open, and 1 blocked.
**Changed:** Canonical agent entry point; project-state evidence ledger; phase and
execution roadmaps; QA-005 task status; changelog.
**Decisions:** none; D38 remains active. Deterministic isolated-Postgres proof does
not claim multi-replica queues, deployed object storage, provider incident recovery,
shared quotas, dead-letter operations, production SLOs, or disaster recovery.
**Next:** execute QA-007's dependency-complete fuzz/property/adversarial corpus while
QA-006 real-hardware/provider performance and QA-009 production DR retain their
separate prerequisites.
**Blockers:** none for QA-005. Credentialed providers, qualified external
participants, production operations, and controlled hardware remain prerequisites
for their own roadmap lanes.

## 2026-07-13 — Fence compute attempts and verify client uploads
**Session:** Codex agent · branch `codex/qa005-fault-acceptance` · **Phase:** QA /
worker and object reliability · **TODO items:** QA-005 [~]
**Done:** Implemented D38 and additive migration 0021. Non-fixture jobs now use
bounded at-least-once attempts with opaque expiring tokens, persisted handler
deadlines, deterministic transient-fault backoff, attempt ceilings, cancellation-
first completion, stale/duplicate-result discard, and transactional one-winner
materialization. Client object registration now requires exact length/MIME/SHA-256,
returns a checksum-bound presigned PUT in `staged` state, rejects idempotency
declaration drift, and requires server-side exact metadata inspection before download
or photoscan consent. Added isolated-Postgres fault scripts and made both queue and
upload acceptance part of `pnpm verify:db`. All 35 required local gates pass,
including 122/122 worker tests, 63/63 gateway tests/build, 2/2 migration-policy tests,
compatibility, WASM/native parity, packaging, Python syntax compile, and cumulative
patch hygiene. The ledger remains 200 tasks: 135 done, 38 in progress, 26 open, and
1 blocked.
**Changed:** Queue store/runner/fault taxonomy and external adapters; object-storage,
gateway, consent, and platform boundaries; migration 0021; protected DB workflow and
fault artifacts; AGENTS entry point; migration/compatibility/governance/threat/system/
best-practice/risk/state/roadmap/TODO/README documentation.
**Decisions:** D38 defines at-least-once worker authority and staged-until-verified
client uploads. It does not claim multi-replica operations, provider/object-store
incident recovery, dead-letter reconciliation, shared quotas, SLOs, or production DR.
**Next:** run the full 35-step local gate, publish the exact candidate through the
protected PR-only ruleset, inspect QA-005's revision-bound Postgres artifact, and
close `[x]` only after exact PR and post-merge CI/security pass.
**Blockers:** no implementation blocker. Local Docker/Postgres is unavailable and was
not modified; the required protected Postgres job owns database fault proof.

## 2026-07-13 — Close protected Postgres migration acceptance
**Session:** Codex agent · branch `codex/qa004-postmerge-evidence` · **Phase:** QA /
data operations · **TODO items:** QA-004 [x]
**Done:** Closed QA-004 through protected main. Exact implementation head `f44ee86`
passed PR #44 CI `29286731035` and security `29286731271`, including the required
Postgres data plane, dependency review/audit, source SPDX, native Desktop, workers,
Rust, TypeScript/gateway, and both CodeQL languages. The downloaded PR artifact
passed QA-004 on PostgreSQL 16.14 with pgvector 0.8.5. Protected squash `e362c54`
then passed post-merge CI `29287274236` and security `29287274293`. Its clean artifact
binds source and checkout exactly to `e362c54`, applies all 20 current migrations on
a clean database, preserves realistic populated data through every predecessor
prefix `0001`..`0019`, and proves unchanged reruns, atomic rollback plus corrected
roll-forward, checksum/gap refusal, advisory serialization, and apply-once
concurrency. The ledger is now 200 tasks: 135 done, 37 in progress, 27 open, and 1
blocked.
**Changed:** Canonical agent entry point; project-state evidence ledger; phase and
execution roadmaps; QA-004 task status; migration evidence boundary; changelog.
**Decisions:** none; D37 remains active, and deterministic isolated-Postgres proof
does not close OPS-005 production backup/restore, capacity, RPO/RTO, or disaster
recovery.
**Next:** execute QA-005's dependency-complete fault-behavior matrix while
credentialed providers, qualified external participants, production operations, and
hardware retain their separate prerequisites.
**Blockers:** none for QA-004. OPS-005 and QA-009 remain open for real encrypted
backups, restore exercises, capacity, and measured RPO/RTO.

## 2026-07-13 — Make Postgres migration history executable
**Session:** Codex agent · branch `codex/qa004-migration-acceptance` · **Phase:** QA /
data operations · **TODO items:** QA-004 [~], QA-001
**Done:** Recorded D37 and replaced the best-effort Postgres loop with one shared
runner that takes a database advisory lock, requires an exact contiguous checked-in
checksum prefix, and commits each migration plus its ledger row in one transaction.
Added a structured acceptance harness for a clean install and all 19 populated
historical prefixes through current migration 0020. The fixtures grow with the
historical schema and prove catalog, review, generation, platform, consent, and
lifecycle preservation; migration 0019 receives deliberately reversed 0018
authority sequences. The same gate proves unchanged reruns, injected atomic rollback
and corrected roll-forward, checksum/gap refusal, and two concurrent runners applying
once. `pnpm verify` now has 35 steps and passes completely, including 2/2 focused
migration-policy tests, 61 gateway tests, Brief-25 25/25, native/fresh-WASM parity,
115 worker tests, release packaging, and patch hygiene. The exact protected QA-003
evidence base `3f649f9` also passed post-merge CI `29284689496` and security
`29284689586`. The ledger is now 200 tasks: 134 done, 38 in progress, 27 open, and 1
blocked.
**Changed:** Postgres runner and acceptance scripts; required DB/CI commands and
artifact revision binding; D37; migration/deployment/recovery runbook; canonical
agent entry point; compatibility, governance, release, system, best-practice, risk,
state, phase, execution, TODO, and documentation-index guidance.
**Decisions:** D37 makes every exact checked-in pre-1.0 predecessor prefix supported,
keeps schema forward-only on application rollback, and requires explicit retirement
plus verified recovery guidance rather than edited history or convenience down
migrations.
**Next:** publish the implementation through the exact-check ruleset, inspect the
uploaded QA-004 JSON from PR and protected merge runs, then reconcile QA-004 to `[x]`
only if all 19 populated predecessors and recovery/concurrency scenarios pass.
**Blockers:** no implementation blocker. The local Docker/Postgres prerequisite is
unavailable and was not modified, so database acceptance remains intentionally owned
by required protected CI. Real encrypted backups, restore exercises, capacity, and
measured RPO/RTO remain OPS-005.

## 2026-07-13 — Record protected browser accessibility acceptance
**Session:** Codex agent · branch `codex/qa003-postmerge-evidence` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [x]
**Done:** Closed QA-003 through protected main. Exact implementation head `caed237`
passed PR #42 CI `29282669499` and security `29282669468`, including the required
Postgres/browser job and all dependency, SBOM, Desktop, Rust, worker, gateway, and
CodeQL checks. Protected squash `9c1802b` then passed post-merge CI `29283250843` and
security `29283250865`. The downloaded clean merge artifact binds source/checkout to
`9c1802b`, retains QA-002 10/10, and passes Chromium 148.0.7778.96 at full-Studio /
WebGL / high with 33 draws and the scene/Three.js chunks, plus Firefox 150.0.2 and
WebKit 26.4 at viewer-grade / Canvas2D / low with 17 draws and no WebGL presentation
chunks. Real WASM, validator admission, keyboard orbit/equip/explode/blueprint, AA
contrast, critical targets, narrow containment, reduced motion, and renderer/asset
isolation all pass. The ledger is now 200 tasks: 134 done, 37 in progress, 28 open,
and 1 blocked.
**Changed:** Canonical agent entry point; project-state evidence ledger; phase and
execution roadmaps; QA-003 task status; changelog.
**Decisions:** none; full Studio remains the Chromium/Tauri tier, and the dependency-
light core-baked schematic remains an explicitly viewer-grade presentation.
**Next:** execute the next dependency-complete local quality/operations lane while
EXT-001 awaits a qualified independent participant.
**Blockers:** none for deterministic browser support; Apple/mobile-device,
assistive-technology, real-mid-hardware performance, external-user, and field proof
retain their separate gates.

## 2026-07-13 — Separate viewer grade from WebGL
**Session:** Codex agent · branch `codex/qa003-browser-accessibility` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [~]
**Done:** Protected run `29281411617` disproved N8AO as the sole Firefox blocker:
QA-002 and all ten other checks passed, while Firefox again stalled before paint at
the remaining synchronous WebGL renderer boundary. Added a dependency-light
Canvas2D viewer scene that projects core-baked part centers, preserves orbit,
explode, blueprint, selection, equipped-variant rebuild/revalidation, picking, and
live pose consumption without creating a second source of physical truth. Full
Studio dynamically loads Three.js/WebGL only on the Chromium/Tauri tier; Firefox and
WebKit remain fixed-low viewer grade and do not request those chunks. The local
three-engine matrix now asserts renderer identity, presentation-asset isolation, and
positive draw counts in addition to the existing real-WASM, semantic, keyboard,
focus, contrast, target, responsive, and reduced-motion contract. All 34 required
non-database repository gates pass on the synchronized tree, including 61 gateway
tests, Brief-25 25/25, native/fresh-WASM parity, 115 worker tests, release packaging,
and patch hygiene.
**Changed:** Scene-controller boundary; Canvas2D schematic renderer; dynamic full-
Studio scene loading; browser evidence; agent entry point; current-state, roadmap,
TODO, execution, system, governance, debugging, risk, README, and support guidance.
**Decisions:** none; this implements D15's declared viewer-grade distinction
honestly. Canvas2D presentation is not full 3D and never changes core truth.
**Next:** publish the corrected head and require a new protected PR run with exact
passing evidence.
**Blockers:** none.

## 2026-07-13 — Defer advanced rendering on viewer-grade engines
**Session:** Codex agent · branch `codex/qa003-browser-accessibility` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [~]
**Done:** Used protected rerun `29280441449` to disprove the initial assumption that
disabling AO after scene construction was sufficient: QA-002 and ten other checks
passed, but Firefox again stalled before React painted because the advanced pipeline
was still constructed eagerly. Viewer-grade scenes now receive their initial tier at
construction and do not instantiate N8AO/EffectComposer unless a user explicitly
raises quality. The three-engine gate and the full viewer interaction contract remain
unchanged. Focused Firefox and the full three-engine matrix pass locally with the
advanced-pipeline state asserted per engine. The first full repository rerun exposed
a transient existing macOS process-termination race at worker step 33; its focused
test and all 115 worker tests passed immediately afterward, and a fresh full rerun
passed all 34 required non-database gates.
**Changed:** Studio scene lifecycle plus synchronized browser-support, testing,
README, and changelog guidance.
**Decisions:** none; lazy optional presentation preserves validator sovereignty and
the declared viewer-grade capability rather than treating a CI timeout as support.
**Next:** publish the corrected head and require a new protected PR run with exact
passing evidence.
**Blockers:** none.

## 2026-07-13 — Keep viewer-grade Studio usable under software WebGL
**Session:** Codex agent · branch `codex/qa003-browser-accessibility` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [~]
**Done:** Reconciled protected PR run `29279497748`: QA-002, every security job, and
four CI jobs passed, while QA-003 exposed a Firefox Linux software-rendering stall
before the accessible Studio surface painted. Preserved the three-engine hard gate
and changed viewer-grade engines to start at the low presentation tier (AO off,
device-pixel ratio 1); the acceptance artifact now records and asserts the initial
quality tier. Validator, bake, contract, and simulation truth remain unchanged, and
users can still opt into higher visual quality.
The focused Firefox rerun and full Chromium/Firefox/WebKit matrix pass locally, and
all 34 non-database repository gates pass on the corrected tree.
**Changed:** Studio viewer boot policy; QA-003 evidence; browser-support, testing,
README, and changelog guidance.
**Decisions:** none; this applies the existing XC-22 quality ladder to the declared
viewer-grade boundary instead of weakening the engine matrix or its assertions.
**Next:** publish the corrected head and require fresh protected three-engine
evidence before merge.
**Blockers:** none.

## 2026-07-13 — Gate accessible viewer-grade browser support
**Session:** Codex agent · branch `codex/qa003-browser-accessibility` · **Phase:** QA /
Studio support · **TODO items:** QA-003 [~]
**Done:** Added a fail-closed production-bundle acceptance matrix for Chromium
148.0.7778.96, Firefox 150.0.2, and WebKit 26.4. Every engine loaded the real hashed
WASM facade, admitted an inline equipped-variant fixture, and passed semantic names/
landmarks, skip/focus indication, keyboard orbit/equip/explode/blueprint, live
announcements, WCAG AA fixture contrast (5.41:1 muted, 12.13:1 controls), and 28 px
critical targets. Chromium additionally passed 390 x 844 containment with zero
horizontal overflow and the reduced-motion contract. Studio now exposes semantic
regions and labels, a skip link, visible 3 px focus, keyboard camera controls,
stronger muted text, reduced-motion behavior, explicit support tiers, and a local
non-SAB session boundary. The required Postgres job installs all three engines and
uploads both QA-002 and QA-003 evidence. The ledger remains 200 tasks: 133 done, 38
in progress, 28 open, and 1 blocked; QA-003 is not complete before protected proof.
All 34 non-database repository gates pass after the browser run, including 61
gateway tests, Brief-25 25/25, native/fresh-WASM parity, packaging, 115 worker tests,
and patch hygiene. A 61-file Markdown scan checked 181 local links with zero broken.
**Changed:** Studio shell/scene accessibility and interaction; three-engine browser
runner and required workflow; browser-support contract; README; canonical agent,
system, testing, debugging, governance, risk, project-state, phase/execution roadmap,
and TODO guidance.
**Decisions:** none; full Studio remains the isolated desktop Chromium/Tauri tier,
Firefox/WebKit/mobile remain viewer grade, and proxy evidence grants no Apple-device,
screen-reader, external-user, or field claim. Added risk R22 for accessibility/
viewer regressions hidden by visual success.
**Next:** publish through protected PR/main, reconcile exact PR/post-merge runs and
evidence, then mark QA-003 `[x]`.
**Blockers:** none for deterministic QA-003 delivery; real assistive-technology,
vendor-device, performance, and independent-user evidence retain their later gates.

## 2026-07-13 — Record protected external-acceptance governance
**Session:** Codex agent · branch `codex/qa010-postmerge-evidence` · **Phase:** QA /
external and field proof · **TODO items:** QA-010 [x]
**Done:** Closed QA-010's evidence-governance kit through protected main. Exact PR
head `74bae6e` passed CI `29275447135`, security `29275447237`, the required
Postgres/real-browser job, dependency review/audit, source SPDX, native Desktop, both
CodeQL languages, the new policy step, and 9/9 focused tests. Protected squash
`8708de7` then passed post-merge CI `29275850838` and security `29275851177`,
including all 34 policy/runtime steps. The task ledger now has 133 done, 37 in
progress, 29 open, and 1 blocked.
**Changed:** Canonical entry-agent boundary, project-state evidence ledger,
phase/execution roadmaps, changelog, and QA-010 task status.
**Decisions:** none; structural evidence governance does not grant participant,
provider, spend, hardware, external-beta, or field authority and closes no `EXT-*`.
**Next:** execute the protected builder runbook for EXT-001 with an independent
participant while continuing the next dependency-complete local quality/operations
lane separately.
**Blockers:** EXT-001 requires a qualified independent participant; provider, print,
course/platform, controlled-lab, and field milestones retain their named external
authority and dependency gates.

## 2026-07-13 — Make external acceptance evidence executable
**Session:** Codex agent · branch `codex/qa010-external-acceptance` · **Phase:** QA /
external and field proof · **TODO items:** QA-010 [~], EXT-001..008
**Done:** Added a versioned registry and private run-pack CLI for builder, photoscan,
training, course, controlled D12 lab, print, marketplace, and maintenance acceptance.
Generated templates cannot validate as completed evidence; terminal manifests require
the exact revision/environment, registered roles and independence, authority hashes,
every step/evidence kind, finite measurements, findings review, incidents, matching
signoffs, limitations, and honest pass/fail/stop semantics. Repository-local run
output, unsafe evidence references, credential-shaped values, and public personal
data fail closed; manifest bytes, nodes, depth, containers, and strings are bounded.
Focused policy tests pass 9/9 and all eight generated templates pass
the deterministic registry check. An adversarial direct-object test briefly exposed
a shared-reference/true-cycle false positive; ancestor-scoped cycle detection now
preserves shared evidence references while rejecting actual cycles. After the fresh
worktree's first full run stopped
at TypeScript build because dependencies were not installed, a frozen lockfile
install restored the declared prerequisite and all 34 `pnpm verify` gates
passed. The unchanged worker suite also passes 115/115 in a clean Python 3.12.7
environment; 200 stable IDs remain unique with counts 132 done, 38 in progress, 29
open, and 1 blocked; 58 Markdown files have zero broken local links.
**Changed:** QA-010 registry, policy/CLI/tests, canonical external-acceptance runbook,
entry-agent rules, full/local/required-CI verification, repository governance,
debugging, best practices, README commands, and living execution/status ledgers.
**Decisions:** none; the kit governs evidence but grants no participant, provider,
spend, hardware, live, external-beta, or field authority.
**Next:** run the complete local gates, publish through protected PR/main, reconcile
exact remote evidence, then execute EXT-001 with an independent builder.
**Blockers:** actual EXT-001 needs an independent participant; provider, print,
course/platform, controlled-lab, and field milestones retain their named external
authority and dependency gates.

## 2026-07-13 — Record protected builder-loop acceptance
**Session:** Codex agent · branch `codex/qa002-postmerge-evidence` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [x]
**Done:** Closed QA-002 at deterministic product-acceptance maturity. Exact PR head
`6a8ce28` passed CI `29272067712`, security `29272067617`, the resolved PR-level
CodeQL check, and a structured 10/10 real-WASM/isolated-Postgres browser artifact.
Protected squash `c80accb` then passed post-merge CI `29272532186` and security
`29272531705`, including the ten flows, 20 migrations, transactional commerce
materialization, Rust, workers, TypeScript/gateway, native Desktop, audits, source
SPDX, and both CodeQL languages.
**Changed:** Canonical agent boundary, project-state evidence ledger, phase/execution
roadmaps, and QA task status.
**Decisions:** none; fixture/deterministic closure does not imply live-provider,
external-user, hardware, or field maturity.
**Next:** create QA-010's independent-builder script/evidence template, then execute
EXT-001 while continuing the credentialed P3-004/P4-016 catalog lane separately.
**Blockers:** external acceptance requires an independent participant; credentialed
catalog proof requires owner-scoped provider/deployment authority.

## 2026-07-13 — Bind owner listing reads to the framework limiter
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~], SEC-006
**Done:** Resolved the high-severity CodeQL finding on the new owner-listing query by
binding the route to the official Fastify limiter as well as the existing shared
public-surface limiter. Focused coverage proves the route refuses the second request
under a one-request policy.
**Changed:** Owner-listing route composition, security coverage, and gateway testing
guidance.
**Decisions:** none; the request budget remains fail-closed and identity-keyed.
**Next:** rerun full local and exact-head CI/security/browser acceptance, then inspect
the replacement Advanced Security check before marking PR #38 ready.
**Blockers:** none.

## 2026-07-13 — Keep governed owner listings visible after refresh
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~]
**Done:** Corrected the listing read boundary exposed by protected browser evidence.
Authenticated owners can now reload their own persisted listings across review and
historical states without receiving the global curation queue; Studio deduplicates
those rows with the public listed marketplace. The gateway test proves anonymous
refusal and exact owner-scoped review-row retrieval.
**Changed:** Owner listing API, gateway coverage, Studio marketplace refresh, and
gateway/platform system contracts.
**Decisions:** none; public discovery remains listed-only and review authority remains
separate from listing ownership.
**Next:** rerun the exact-head isolated browser gate from governed listing rendering.
**Blockers:** none.

## 2026-07-13 — Let bodyless mutations reach their product guards
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~]
**Done:** Corrected the Studio API client after browser evidence showed bodyless model
sharing was rejected by Fastify's empty-JSON parser before the draft-status guard.
JSON content type is now sent only with an actual string body, so the server can emit
the intended fail-closed `only admitted models can be shared` refusal.
**Changed:** Studio gateway transport contract and Studio system guidance.
**Decisions:** none; the admitted-only sharing invariant is unchanged.
**Next:** rerun the exact-head isolated browser gate from its fifth flow.
**Blockers:** none.

## 2026-07-13 — Retry the visible account bootstrap in browser acceptance
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~]
**Done:** Hardened the production-preview harness against an observed transient boot
race where the first account request failed while other panels initialized. The gate
now retries only through Studio's visible, idempotent account refresh action and still
requires the exact test identity before any accepted flow begins.
**Changed:** Stable account-refresh selector and browser authentication bootstrap.
**Decisions:** none; authorization semantics and test-header scope are unchanged.
**Next:** rerun exact-head isolated Postgres/browser acceptance and inspect the next
structured artifact.
**Blockers:** none.

## 2026-07-13 — Bind catalog-aware reports to the browser contract
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~]
**Done:** Corrected the Studio contract-load boundary exposed by the isolated browser
gate: the local WASM validator still runs on every load, while a catalog-aware gateway
report is retained only when its non-empty contract hash, report format, schema, and
validator versions exactly match the WASM result. Generated catalog models now retain
their sovereign native admission instead of being falsely rejected by WASM's
intentional empty catalog, and mismatched/stale reports fail closed to the local
verdict.
**Changed:** Studio report selection and the Studio system contract.
**Decisions:** none; the platform catalog remains server-owned and the UI truthfully
displays the active report target.
**Next:** rerun the exact-head isolated Postgres/browser acceptance and continue only
from its structured evidence.
**Blockers:** none for the deterministic gate; live-provider and external-user proof
remain separate.

## 2026-07-13 — Gate the complete builder loop in a real browser
**Session:** Codex agent · branch `codex/qa002-builder-browser-e2e` · **Phase:** QA /
Wave 2 builder loop · **TODO items:** QA-002 [~], QA-001
**Done:** Added a fail-closed Playwright-core harness for the complete QA-002 surface:
authenticated production-bundle startup, real built-WASM validation, approved catalog
rows from Postgres, staged template generation, persisted draft/share refusal,
deterministic edit/revalidation, admitted anonymous share with private model 401,
EnvSpec course creation, governed listing creation, fixture job success, and
Postgres-materialized maintenance rendering. The required Postgres job now downloads
the exact validator artifact from `forge-core (Rust)`, installs Chromium, runs the
entire `pnpm verify:db` contract including the browser harness, and uploads structured
evidence or a failure screenshot. Local Studio/gateway typechecks and production
builds pass; the harness's undeclared-database refusal, 10/10 golden-policy tests, and
62 immutable workflow references pass. QA-002 remains in progress until the isolated
remote database/browser run and protected post-merge evidence are green.
**Changed:** browser E2E runner and selectors, production-preview same-origin proxy,
Postgres CI composition, root verification commands, canonical agent/governance/
debugging/best-practice/system guidance, and living state/roadmap/task ledgers.
**Decisions:** none. The harness uses deterministic fixture providers only, adds no
credential or live-provider authority, and does not change a registered golden.
**Next:** obtain the exact PR-head Postgres/Chromium evidence, merge through the
required ruleset, verify post-merge CI/security, then reconcile QA-002 to `[x]`.
**Blockers:** local Postgres remains unavailable because the existing Docker VM is
unhealthy and was not modified; the required isolated CI service is the acceptance
path. No external credential, hardware, or spending authority is required.

## 2026-07-13 — Record protected golden-review evidence
**Session:** Codex agent · branch `codex/qa008-postmerge-evidence` · **Phase:** QA
cross-cutting · **TODO items:** QA-008 [x], QA-001
**Done:** Golden-review PR #36 passed all required checks at exact implementation
head `4497c83`, including CI `29264389481`, security `29264386113`, the new
cumulative-patch policy in `forge-core (Rust)`, Postgres, workers, TypeScript/gateway,
native Desktop, dependency review/audits, source SPDX, and both CodeQL languages. It
merged through the exact-check ruleset as `2589503`; exact post-merge CI
`29264679254` and security `29264678863` are green on that protected SHA. QA-008 is
closed without changing any provider, user-acceptance, hardware, or field maturity.
**Changed:** canonical agent boundary, project-state evidence ledger, phase/execution
roadmaps, and REC/GOV/QA task ledgers.
**Decisions:** none. D17 and D32 remain binding; this records protected evidence only.
**Next:** begin the smallest dependency-complete QA-002 browser-E2E builder-loop
slice using real built WASM and an isolated database.
**Blockers:** none for QA-008. Live provider, external-user, and field gates remain
independently open.

## 2026-07-13 — Require evidence for every golden re-pin
**Session:** Codex agent · branch `codex/qa008-golden-review-policy` · **Phase:** QA
cross-cutting · **TODO items:** QA-008 [~], QA-001
**Done:** Added a machine-owned registry for fourteen schema, render, physics,
validator, corpus, and committed generated-runtime artifact families. The registry
protects itself, the checker unions parent/current inventories so same-patch removal
cannot hide drift, and the frozen prototype HTML is hard-required immutable. Every
registered change now needs exactly one new append-only Markdown record with matching
path, artifact ID, classification, rationale, source-of-truth change, compatibility
impact, before/after evidence, reviewer focus, and task/decision references. Ten
focused policy tests cover success, missing record, immutable input, history edits,
placeholders, unrelated paths, parent-registry weakening, class mismatch, record-
directory redirection, and ownership overlap. The expanded `pnpm verify` passes all
33 gates with 61/61 gateway tests, 115/115 workers,
Brief-25 25/25, declared verdicts 5/5, native/WASM parity, pinned simulation parity,
release packaging, and patch hygiene.
**Changed:** golden registry, policy/checker/tests, required Rust CI job, full local
gate, canonical agent/read order, contributor/debugging/compatibility/governance/
release/risk/best-practice/system documentation, roadmap/state/task ledgers, and one initial
append-only registry evidence record.
**Decisions:** none. D17 and D32 remain binding; the policy records evidence and adds
no product, provider, hardware, or compatibility authority.
**Next:** deliver QA-008 through the exact-check ruleset and verify its protected
post-merge CI/security; then begin the smallest QA-002 browser-E2E builder-loop slice.
**Blockers:** none for QA-008. Live Wave 2 provider/user acceptance remains external.

## 2026-07-13 — Record protected commerce queue evidence
**Session:** Codex agent · branch `codex/p11-commerce-evidence` · **Phase:** Wave 2 R1
builder loop · **TODO items:** P11-005 [~]
**Done:** Queued-commerce PR #34 passed all required checks and merged through the
exact-check ruleset as `18f54fd`. Exact post-merge CI `29260837182` and security
`29260833090` are green. The protected Postgres log applies migrations 0001..0020 and
records concurrent gateway retry/request-binding/owner-scope acceptance plus worker
success/corrupt-output rollback. Protected workers pass 115/115, gateway 61/61,
Brief-25 25/25, and declared verdicts 5/5; Rust, native Desktop, dependency audit,
source SPDX, and both CodeQL languages also pass.
**Changed:** canonical agent boundary, project-state evidence ledger, roadmap,
execution roadmap, and P11-005 task ledger.
**Decisions:** none. This records evidence for the existing D27/D29-aligned
contract/fixture slice and creates no provider or live authority.
**Next:** execute a credentialed vendor sandbox with deployment-owned egress, quota,
telemetry, retry/recovery, billing, current-terms, and purchasable-BOM evidence.
**Blockers:** external vendor credentials, current provider/commercial terms, and
deployment authority are required for the next maturity step.

## 2026-07-13 — Route vendor offers through the bounded worker queue
**Session:** Codex agent · branch `codex/p11-commerce-worker-bridge` · **Phase:** Wave
2 R1 builder loop · **TODO items:** P11-005 [~]
**Done:** Replaced the legacy direct gateway vendor HTTP lane with an explicit
`sandbox|worker` route contract. Worker execution requires non-empty component IDs,
a 1..200-character idempotency key, the local provider, and configured
`FORGE_VENDOR_REFRESH_CMD`; the dedicated commerce route and generic job entry point
enforce the same provider, idempotency, component-count, timeout, and allowed-field
contract, so neither can accept inline provider offers. The registered Python handler
fails closed if its command disappears,
normalizes at most 50 rows under a 120-second ceiling, sanitizes held rows, and bounds
public credential-free HTTPS links, finite nonnegative prices, three-letter
currencies, availability, rate limits, and provenance. The Postgres worker revalidates
accepted output and inserts offers inside the same transaction as job success. Studio
uses the queue only when capability discovery reports the command configured and
otherwise retains the deterministic sandbox handoff. The machine compatibility
matrix now exact-matches all 16 gateway queue kinds. Client job idempotency keys are
domain-separated owner digests: exact retries return the original job without
duplicate materialization, different request content conflicts, and the same client
key cannot cross tenant boundaries or suppress another owner's credit debit. If
transactional materialization rejects an output, success and all inserts roll back,
the runner records a failed job, and the worker loop continues. `pnpm verify` passes
all 32 gates with 61/61 real-validator gateway tests, 25/25 Brief-25, and 115/115
worker tests; `pnpm audit --audit-level=high` reports no known
vulnerabilities.
**Changed:** gateway route/job capability and tests; Studio commerce client/action;
worker commerce registration, normalization, transactional materialization, and
tests; migration 0020, protected Postgres gateway idempotency/concurrency and worker
materialization acceptance, and CI data-plane wiring;
compatibility matrix/check; canonical agent guidance, best practices,
threat/risk/state/roadmap/task/execution/architecture, and gateway/worker/platform
system documentation.
**Decisions:** none. The slice follows D27 fixture-first expansion and D29's
off-platform quote/link beta, adds no dependency, and does not create payment,
checkout, provider, or live authority.
**Next:** deliver the slice through the exact-check ruleset and use its 20-migration
Postgres job/materialization proof as acceptance; after protected post-merge evidence,
the next P11-005 step is a credentialed vendor sandbox with deployed egress, quotas,
telemetry, retry/recovery, billing, and current terms evidence.
**Blockers:** none for contract/fixture delivery. Local Postgres proof is unavailable
because the existing Docker VM is unhealthy; do not repair or reset that user-owned
runtime in this lane. Credentialed provider and production-operations proof require
external owner/deployment authority.

## 2026-07-13 — Add the bounded native Anthropic ETL transport
**Session:** Codex agent · branch `codex/p4-native-anthropic-etl` · **Phase:** Wave 2
R1 builder loop · **TODO items:** P3-004 [~], P4-016 [~]
**Done:** Added a no-new-dependency native Anthropic Messages API path behind the
existing deterministic fixture and deployment-command precedence. The worker pins
the exact endpoint, API version, Haiku 4.5 snapshot, token/time/byte budgets, forced
strict tool choice, delimiter-safe untrusted source input, header-only service key,
local canonical-row validation, and model/API/source provenance. The provider emits
only a strict supported-subset envelope; local code rejects malformed, non-finite,
deep, uncited, unlicensed, or incomplete candidates before the existing P3 gate.
Focused adapter/security tests pass 18/18 and the complete worker suite passes
110/110 without making a provider call. After installing the frozen worktree
dependencies, the complete 32-step `pnpm verify` gate also passes; the first attempt
had stopped at TypeScript build only because the new worktree had no `node_modules`.
**Changed:** ETL adapters and ingest result provenance; focused worker security tests;
`AGENTS.md`; threat, risk, decision, project-state, roadmap, task, execution, component-
database, generation, compute-worker, and changelog documentation.
**Decisions:** D36 records the native ETL authority boundary. Official Anthropic
Messages, API versioning, strict-tool/structured-output limits, and Haiku model docs
were rechecked on 2026-07-13. The adapter uses the standard library and adds no
runtime dependency.
**Next:** publish through the exact-check ruleset, then execute the next dependency-
complete R1 slice; credentialed ETL acceptance must
eventually prove a real row through dedupe, immutable persistence, owner review, BOM,
and lawful export.
**Blockers:** none for contract/fixture delivery. A credentialed sandbox/live claim
requires owner-supplied provider authority plus deployed egress, quota, log, billing,
outage, retention, and recovery evidence.

## 2026-07-13 — Prove SEC-006 on protected main
**Session:** Codex agent · branch `codex/sec006-postmerge-evidence` · **Phase:** Wave 2 ·
**TODO items:** SEC-006
**Done:** Squash-merged PR #31 through protection at exact `d952f60`. Post-merge CI
`29251978420` passed Postgres/pgvector, workers, Rust, native Desktop, and the full
TypeScript/gateway/oracle stack; security `29251978330` passed JavaScript/TypeScript
and Python CodeQL, npm/root/Desktop RustSec audits, and validated source SPDX.
**Changed:** `AGENTS.md` plus project-state, roadmap, execution, task, and changelog
evidence now identify SEC-006 as protected contract/fixture truth.
**Decisions:** none. Production egress, shared quota/spend state, secret/log drills,
rotation, isolation, backup/restore, and incident evidence remain explicit operations
gates before live or billable claims.
**Next:** execute the smallest dependency-complete Wave 2 R1 builder-loop slice.
**Blockers:** none for SEC-006.

## 2026-07-13 — Close the SEC-006 contract and fixture boundary
**Session:** Codex agent · branch `codex/sec006-threat-boundaries` · **Phase:** Wave 2 ·
**TODO items:** SEC-006
**Done:** Closed SEC-006 at contract/fixture maturity. Exact implementation head
`1f7cf41` passed all 32 local gates plus PR #31 CI `29251276475`, security
`29251276469`, Postgres/pgvector, TypeScript/gateway, Rust, Python, native Desktop,
dependency review/audit, source SPDX, both CodeQL languages, and the PR-level CodeQL
result. CodeQL's Fastify per-route model now follows the shared Auth.js rate-policy
object directly; the runtime regression independently proves one forged-cookie request
gets `200` and a rotated-cookie request from the same peer gets `429` under the scoped
limiter.
**Changed:** SEC-006 rate-policy plumbing and current-boundary, roadmap, execution,
task, and changelog evidence.
**Decisions:** none. The local Docker VM failure is not hidden, but the exact-tree
remote database gate supplies the required acceptance proof. Production egress,
shared quotas, log/secret drills, rotation, workload isolation, and incident evidence
remain separate operations maturity gates.
**Next:** merge PR #31 through protection, verify exact post-merge CI/security, then
start the next dependency-complete Wave 2 builder-loop slice.
**Blockers:** none for SEC-006 contract/fixture acceptance; protected merge and
post-merge verification are workflow steps still to execute.

## 2026-07-13 — Bound every application trust edge
**Session:** Codex agent · branch `codex/sec006-threat-boundaries` · **Phase:** Wave 1/2 ·
**TODO items:** PRE-004, P2-001, SEC-006, QA-001
**Done:** Delivered the public-surface/ModelSpec 2.2/SEC-001..005 v0.2 stack through
protected PR #30 at `d34b6fd`, closing PRE-004 and P2-001 with the registry deferral
still explicit. Implemented the SEC-006 contract/fixture boundary: fail-closed
production Auth.js configuration and trusted origin, built-in CSRF retention,
development/admin authority controls, header-only request-ephemeral Anthropic keys,
key persistence/reflection/env-fallback regression proof, recursive JSON and direct
job/object limits, HTTPS/host/DNS/redirect/type/full-body-deadline/byte provider
guards, delimiter-safe prompt data, configured-bucket/key-bound object presign and
deletion, short-lived forced-download URLs, bounded validator and worker commands,
peer-IP classed rate limits immune to forged session-cookie rotation, generic redacted
errors, and exact bounded
release archive preflight that rejects links, devices, FIFOs, and every other
non-regular member before extraction. Added the canonical threat model with live
deployment and residual-risk gates. `pnpm verify` passes all 32 steps with 59/59 real-
validator gateway tests, 25/25 Brief-25, 104/104 workers, and all 4 archive-policy
tests; the published v0.1.0 assets also pass the hardened verifier.
**Changed:** gateway auth/security/generation/object/platform/server/validator code,
tests, dependency manifest, and lockfile; worker network/command adapters and tests;
release verifier/archive policy;
committed-range patch-hygiene enforcement; `AGENTS.md`, threat/security/system/
release/governance/risk/state/roadmap/task docs.
**Decisions:** no new product authority. Added `@fastify/rate-limit` 11.1.x, the
official Fastify 5-compatible line, only inside the Auth.js route scope so authorization
throttling is framework-enforced and CodeQL-visible; the classed store retains the
other four surfaces. Both are deliberately only single-process proof; production
requires connection-time egress enforcement, shared
rate/concurrency/spend state, secret/log/rotation drills, workload isolation, and
incident/restore evidence. No inbound callback or user-archive importer exists.
**Next:** obtain the exact-tree remote Postgres and remaining protected checks, then
mark SEC-006 done, reconcile the evidence, merge, and proceed to the next autonomous
Wave 2/quality slice.
**Blockers:** local `pnpm verify:db` failed before migration with `ECONNRESET`; Docker
Desktop's VM log reports filesystem inconsistency and no free space to extend its
disk. The migrations are unchanged and PR #30's Postgres proof is green, but SEC-006
will not close until the required remote Postgres check passes on this exact tree.

## 2026-07-13 — Publish and independently verify validator v0.1.0
**Session:** Codex agent · branch `codex/v02-contract-security-stack` · **Phase:** G1 ·
**TODO items:** GOV-008, GOV-009, OPS-011
**Done:** Protected-main manual release run `29241883791` passed the release contract,
Linux, Windows, macOS Intel, WASM, both SPDX SBOMs, checksums, downloaded-payload
verification, provenance attestation, and aggregate upload at exact commit `1093842`.
Its downloaded aggregate independently passed checksums, artifact SPDX, the macOS
binary/version/canonical example, and a clean WASM consumer. Created and pushed
annotated tag `v0.1.0`; tag run `29244972303` rebuilt every platform and published the
non-draft nine-asset GitHub Release. Downloaded every public asset after publication
and repeated the same independent binary/WASM verifier successfully. Rebuilt the
public-surface/XC-28/SEC-001..005 v0.2 stack on exact protected main without duplicate
pre-squash release commits; its full 31-step and Postgres/pgvector gates pass.
**Changed:** canonical agent boundary, project/phase/task/execution/release/risk/v0.2
living documentation, plus the protected v0.2 integration history.
**Decisions:** crates.io/npm publication is explicitly deferred because no
owner-scoped registry credentials or publication decision were supplied; the verified
GitHub Release is the G1 publication boundary.
**Next:** deliver the green v0.2 stack through the exact-check ruleset, then continue
SEC-006 and later Wave 2 work without overstating live/provider/field maturity.
**Blockers:** no G1 blocker remains. Qualified trademark review, Linux Desktop's
time-bounded glib route, production providers/operations, external users, and hardware
evidence remain separate tasks.

## 2026-07-13 — Prove the corrected release bundle on and off CI
**Session:** Codex agent · branch `codex/g1-release-runner` · **Phase:** G1 ·
**TODO items:** GOV-008, OPS-011
**Done:** Manual branch run `29236010204` passed the release contract, Linux,
macOS Intel, Windows, WASM, aggregate checksum/SPDX verification, and provenance
attestation at exact commit `02f912d1dbe1a07f6ea29055ad55c5ae29eca279`.
Downloaded the aggregate artifact outside Actions and independently verified every
checksum, both SPDX documents, the macOS x86_64 binary version and canonical example,
and a clean WASM consumer install. That external check found the verifier had
hard-coded the Linux archive despite documenting a user-runnable download command;
verification now requires all three native bundles and selects the current host's
binary for smoke execution. The same downloaded aggregate then passed end to end on
Apple Silicon through the advertised macOS x86_64 payload.
**Changed:** downloaded release verifier, release runbook, task/state evidence, and
changelog.
**Decisions:** none; the release remains x86_64 on each native OS, and verification
now follows that declared platform matrix.
**Next:** Deliver the verifier correction through protected PR #29, rerun the manual
workflow on the resulting protected `main`, independently download/verify it, then
create annotated tag `v0.1.0`.
**Blockers:** no artifact or runner blocker; protected-main and tag publication proof
remain deliberately incomplete.

## 2026-07-13 — Bound and migrate the Intel macOS release lane
**Session:** Codex agent · branch `codex/g1-release-runner` · **Phase:** G1 ·
**TODO items:** GOV-008, OPS-011
**Done:** Preserved protected manual run `29216053372` as failed operational
evidence after its macOS 15 Intel full-LTO build/smoke produced no artifact in
5h10m; selected the supported macOS 26 Intel runner without changing the x86_64
artifact, smoke, SBOM, checksum, or attestation contract; and added a one-hour
native-job ceiling so this failure mode cannot silently consume a full runner day.
When macOS 26 full-LTO branch run `29227763639` hit the 60-minute job ceiling before
staging/upload, compared clean local arm64 profiles: thin LTO cut wall time from
34.62s to 19.25s while both binaries passed version and canonical-admission smoke.
Native size changed from 2,735,488 to 3,456,528 bytes; no binding native-size budget
exists. Thin-LTO run `29230415603` then built/smoked Linux, Windows, macOS Intel, and
WASM successfully; all PR CI/security checks passed. Its aggregate verifier exposed
that Actions artifact transfer had normalized the staged Linux binary to non-
executable mode before deterministic archive assembly. Assembly now restores the
declared native mode before archiving, uses timestamp-free gzip output, and
verification explicitly rejects a Linux archive without executable bits. The actual
downloaded inputs from that failed run reassemble with mode 0755, and repeated Linux/
macOS tarballs are byte-identical. The thin profile and permission fix pass all 31
required local gates and clean WASM installation.
**Changed:** release workflow/profile, binary assembly and downloaded verification,
release runbook, risk register, task ledger, project state counts, and changelog.
**Decisions:** no architectural decision; OPS-011 uses a measured thin-LTO release
profile and runner migration, with `macos-15-intel` retained through August 2027.
**Next:** Rerun the protected branch workflow with normalized archive permissions,
deliver through protected `main`, download and independently verify the aggregate
artifact, then create `v0.1.0`.
**Blockers:** GOV-008 remains open until the corrected aggregate verifier and
downloaded artifact pass; native runner migration itself is now remotely proven.

## 2026-07-13 — Make deletion survive holds, backups, and restore
**Session:** Codex agent · branch `codex/sec005-retention-backups` · **Phase:** P4/P11 ·
**TODO items:** SEC-005
**Done:** Added data-lifecycle format/policy 1.0.0 with six bounded retention classes,
time-bounded append-only user/object/audit legal holds, monotonic consent/hold event
sequences, pseudonymous deletion tombstones, exact backup subject manifests,
fail-closed restore evaluation, retryable provider deletion with stale-claim recovery,
post-deletion capture refusal, late-catalog tombstone reopening, and dry-run-first
primary retention. Hold placement/release, backup registration/restore evaluation,
and deletion share globally ordered transaction-scoped pseudonymous subject locks;
account deletion checks the owner and every object so concurrent or object-specific
authority cannot race the purge.
Authenticated export 1.2.0 adds redacted hold/backup state, deletion receipt 2.0.0
records restore suppression without claiming provider erasure, and public/account
lifecycle endpoints expose only bounded state. The provider-specific backup adapter,
encrypted production copies, deletion receipts, sandbox restore, monitoring, and
measured RPO/RTO remain explicitly separate under OPS-005.
**Evidence:** `pnpm verify` passes all 31 non-DB gates with 12 compatibility surfaces,
45/45 gateway tests using the real validator with no skips, Brief-25 at 25/25, and
100/100 worker tests. Expanded `pnpm verify:db` passes on the populated predecessor;
a clean scratch database applies all 19 migrations, passes seed/export/deletion/
consent/lifecycle assertions, and skips every unchanged checksummed migration on
rerun. A dedicated upgrade fixture starts from migrations 0001..0018, deliberately
reverses same-time grant/withdraw and place/release sequence values, then proves 0019
reconstructs both causal chains and reinstates the unique indexes/append-only
triggers. The lifecycle fixture proves user and object holds, causal release, exact
backup subject idempotency, post-delete capture refusal, late-catalog reopening,
pre-deletion restore refusal, bounded adapter failure, stale-claim recovery,
tombstone finalization/expiry, user/audit retention holds, causal expiry of closed
hold chains, 400-day restore-test/deleted-catalog/audit expiry, redaction, mutation
rejection, and zero fixture residue. The exact documented
`pnpm lifecycle:ops -- help` command passes, and its dry-run retention command reports
every deletion/finalization class without mutation. Official GDPR Articles 5/17 and
NIST SP 800-209/SP 1339 were rechecked as primary policy/recovery references; product
defaults still require jurisdiction-specific owner/counsel review.
**Changed:** migrations 0017..0019; gateway lifecycle/account/consent/server code and
tests; lifecycle operator and populated/clean Postgres assertions; compatibility
matrix/checker; root `AGENTS.md`; D35; data-lifecycle, security, architecture,
best-practice, gateway/platform, state, roadmap, execution, task, risk, release, and
v0.2 release documentation.
**Decisions:** D35 separates primary deletion plus deterministic restore suppression
from physical provider-backup and disaster-recovery proof.
**Next:** independently download and verify protected-main release run `29241883791`;
only then create annotated `v0.1.0`, verify the published GitHub Release, and deliver
the ordered XC-28/SEC-001..005 v0.2 stack through protected PRs.
**Blockers:** no local SEC-005 blocker. Production backup/DR remains gated by
`OPS-005`; v0.2 delivery remains ordered behind G1 publication proof. Protected
`main` is `1093842` after PR #29 with green post-merge CI/security; manual release
run `29241883791` is still in progress at this entry.

## 2026-07-13 — Make user-content consent explicit and revocable
**Session:** Codex agent · branch `codex/sec004-consent-ledger` · **Phase:** P4/P5/P7/P10/P11 ·
**TODO items:** SEC-004
**Done:** Added consent-ledger format 1.0.0 as immutable grant/withdraw events for
photoscan processing per object, telemetry sharing and training reuse per log,
pattern contribution per model, and leaderboard publication per account. Every event
binds an owned subject, current policy version and notice hash, previous event,
bounded evidence, and idempotency. The gateway locks the owner and rechecks active
consent in the same serializable transaction as each action; generic and direct
photoscan/training job entry points retain the same guard. Withdrawal cancels
affected queued/running work, makes telemetry private, and removes pattern or
leaderboard eligibility. Worker completion now requires the row to remain running,
so a late result cannot overwrite cancellation or materialize an artifact.

Studio adds an expandable privacy-authority panel with the exact five notices,
independent current state, explicit grant/withdraw controls, owned-photo requirements,
and telemetry share, model-pattern, and telemetry-training actions. User-data export
is additively bumped to 1.1.0 with the complete consent history; account deletion
explicitly purges it. No consent or withdrawal claims provider recall, retention/
legal-hold expiry, tombstone completion, or backup erasure.
**Evidence:** `pnpm verify` passes all 31 gates with 11 compatibility surfaces,
41/41 gateway tests using the real validator with no skips, Brief-25 at 25/25, and
100/100 worker tests. The worker suite also passes under Python 3.12.7. Expanded
`pnpm verify:db` passes on both a populated predecessor and a clean scratch database:
all 16 migrations, five grant/withdraw histories and effects, append-only rejection,
export/delete zero residue, and an unchanged checksum/idempotency rerun are green.
Studio typecheck and production build pass. A real Chromium session against the
local gateway and Postgres renders all five notices, grants account leaderboard
publication to `1 active`, then withdraws it back to `0 active` with the explicit
withdrawal confirmation. That smoke exposed and fixed the Compose Studio profile's
cross-origin gateway URL: browser calls now stay same-origin and Vite proxies to the
gateway inside the Compose network.
**Changed:** migration 0016; gateway consent/account/job/server code and tests;
worker cancellation/materialization guard and tests; Studio gateway client and
privacy controls; compatibility matrix/checker; database acceptance scripts; root
`AGENTS.md`; Compose Studio proxy; D34; architecture, best-practice, security, gateway/worker/Studio/
platform, state, roadmap, execution, task, risk, release, and v0.2 release docs.
**Decisions:** D34 supersedes D2's pattern opt-out/marketplace-default mechanic with
explicit per-model opt-in while retaining D2's open-core boundary.
**Next:** implement `SEC-005` retention, legal-hold, tombstone, backup-expiry, and
restore/deletion proof without weakening the primary deletion or consent boundaries.
**Blockers:** no local SEC-004 blocker; protected v0.2 delivery remains ordered
behind G1 release proof and the stacked XC-28/SEC-001/SEC-002/SEC-003 commits.
Corrected G1 branch run `29236010204` and its independently downloaded aggregate
are green; protected-main rerun, tag, and GitHub Release proof remain.

## 2026-07-13 — Make user export and primary deletion complete
**Session:** Codex agent · branch `codex/sec003-user-export-delete` · **Phase:** P4/P11 ·
**TODO items:** SEC-003
**Done:** Added authenticated user-data export format 1.0.0 across account metadata,
generated artifacts, models/shares, object blobs/photoscan, jobs, replays, policies,
courses/leaderboards, marketplace/classroom activity, telemetry/maintenance, quote
requests, refusals, and pattern contributions. Export reads a repeatable snapshot,
points binary payloads to authenticated blob-download routes, and excludes OAuth
access/refresh/ID tokens, session/verification tokens, and provider keys.
Exact-confirmation account deletion now locks the owner in a serializable transaction,
explicitly purges rows that user deletion previously orphaned through `SET NULL`,
batches S3-compatible payload deletion before commit, rolls back database changes on
storage failure, and returns primary-only deletion receipt 1.0.0.
**Evidence:** `pnpm verify` passes all 31 gates with 10 compatibility surfaces,
36/36 gateway tests using the real validator with no skips, Brief-25 at 25/25, and
99/99 worker tests. Expanded `pnpm verify:db` builds the gateway, exports a populated
owner fixture, proves secret exclusion, deletes it, and finds zero named primary
residue. `pnpm --filter @forge/gateway test:object-storage` uploads a unique MinIO
object, exercises the production delete adapter, and requires a 404 afterward.
**Changed:** gateway account-data/transaction/object-storage code and route tests;
Postgres and MinIO acceptance scripts; compatibility matrix/checker; root
`AGENTS.md`; D33; best-practice, security, gateway/platform, state, roadmap,
execution, task, risk, release, and v0.2 release-note documentation.
**Decisions:** D33 makes export and primary deletion explicit, versioned,
secret-minimizing, and fail-closed, while reserving consent and backup lifecycle for
SEC-004/005.
**Next:** implement `SEC-004` consent/version/withdrawal records and enforcement on
photoscan processing, telemetry sharing, pattern contribution, leaderboards, and
training reuse, then close SEC-005 retention/hold/tombstone/backup proof.
**Blockers:** no local SEC-003 blocker; protected v0.2 delivery remains ordered behind
the queued G1 release proof and stacked XC-28/SEC-001/SEC-002 commits. A primary
deletion receipt intentionally does not claim backup erasure.

## 2026-07-13 — Refuse prohibited briefs before execution
**Session:** Codex agent · branch `codex/sec002-prohibited-briefs` · **Phase:** P4/P10 ·
**TODO items:** SEC-002
**Done:** Added a versioned deterministic platform-exclusion guard for weapons,
targeting, munitions, and interdiction briefs before catalog/pattern retrieval,
template or Anthropic synthesis, model edits, and course generation. The five HTTP
surfaces log a minimal refusal record before execution; direct generation APIs also
assert independently. Bounded explicit exclusions such as “no targeting modules”
remain valid, while mixed/obfuscated requests remain refused. Responses and SSE
events never echo the refused prompt or provider key, and audit-store failure prevents
all downstream work.
**Evidence:** `pnpm verify` passes all 31 local gates with 8 compatibility surfaces,
32/32 gateway tests with the real validator and no skips, Brief-25 at 25/25, and
99/99 worker tests. `pnpm verify:db` applies all 15 migrations to the populated
Compose database; a clean scratch database passes migration/seed/invariants, and an
unchanged rerun skips every checksum-pinned migration. Schema assertions prove that
`generation_refusals` has no raw-prompt or credential columns. Focused tests cover
benign robotics language, explicit safety exclusions, mixed and spaced/punctuated
evasion, all guarded routes, direct calls, provider non-invocation, redaction, and
audit failure.
**Changed:** canonical agent/best-practice/compatibility/release guidance, gateway
generation/server/safety code and tests, additive migration 0015 plus DB invariants,
and the security, generation, data, roadmap, state, task, and v0.2 release documents.
**Decisions:** none; implements the existing absolute platform exclusion without
changing its scope.
**Next:** implement `SEC-003` user-scoped export/deletion as the next dependency-
complete privacy slice while the G1 v0.1 release proof and protected v0.2 delivery
remain ordered ahead of publication.
**Blockers:** no local SEC-002 blocker; protected delivery remains dependency-ordered
behind the v0.1 release and the stacked XC-28/SEC-001 v0.2 work.

## 2026-07-13 — Enforce lawful manufacturing exports
**Session:** Codex agent · branch `codex/sec001-license-exports` · **Phase:** P3/P11 ·
**TODO items:** SEC-001, P11-008
**Done:** Made D10 authoritative in the gateway fixture and Python worker export
paths. Every assembly asset now requires compatible ledger evidence; the most
restrictive asset derives the assembly policy; attribution binds a versioned 1.0
manifest; and no-redistribution/view-only geometry becomes a dimensioned envelope
with datum ports and an HTTPS BOM link-out instead of a printable artifact. External
OCCT commands receive the manifest/hash, must prove attribution embedding or
restricted-geometry exclusion, and can return only allowlisted metadata and safe
artifact references.
**Evidence:** `pnpm verify` passes all 31 local gates with 8 compatibility surfaces,
27/27 gateway tests with the real validator and no skips, and 99/99 worker tests.
Focused tests cover open/attribution/restricted and mixed assemblies, missing and
contradictory ledger data, incomplete envelopes/datums, unsafe URLs, manifest proof
mismatch, and an adversarial provider attempting to smuggle raw restricted geometry.
**Changed:** canonical agent entry, compatibility matrix/checker, gateway license
export fixture, worker license/export modules and tests, release notes, and owning
catalog/compute/security/state/roadmap documentation.
**Decisions:** none; implements active D10 and D31 without changing their meaning.
**Next:** implement `SEC-002` prohibited-brief refusal and minimal safe logging while
the dependency-ordered G1 v0.1 release proof remains queued.
**Blockers:** protected delivery remains ordered behind G1/v0.1 and GitHub-hosted
runner availability; live OCCT artifact inspection remains separate sandbox evidence,
not a claim made by this deterministic/adapter slice.

## 2026-07-13 — Make equipped alternatives physically sovereign
**Session:** Codex agent · branch `codex/xc28-equipped-variants` · **Phase:** P1/P3 ·
**TODO items:** P1-014, XC-28, P2-001
**Done:** Added ModelSpec 2.2 `equippedVariantId` with deterministic single-option
migration and fail-closed multi-option migration; made geometry, mass, simulation,
colliders, lockfile resolution, validation, and BOM consume only the equipped
alternative; added stable source JSON Pointers to baked parts; and shipped Studio
variant cards that patch only the equipped ID, disclose inline/catalog consequences,
and preserve selection by source identity. Migrated the proof fixture and generation
template, regenerated schema/TypeScript/WASM artifacts, and moved the pre-1.0 package
boundary to 0.2.0 with release/migration notes.
**Evidence:** `pnpm verify` passes all 31 required local gates: 7 compatibility
surfaces, full Rust/TS/gateway suites, 25/25 Brief-25, native/fresh/committed WASM
parity, 9/9 fuzz outcomes, packaging of `@forge/validate-wasm@0.2.0`, and 89 worker
tests. Focused tests cover missing/unknown/duplicate choices and selected-only
geometry, mass, catalog, BOM, lockfile, Rapier/collider, and URDF/MJCF behavior. A
real-browser WASM switch changed an
inline payload from 334 to 346 faces and recomputed AUW 482→488 g, TWR 4.67→4.61,
and endurance 21.6→21.2 min while the validator re-admitted the document.
**Changed:** canonical agent entry, package/version/compatibility surfaces, Rust
contract/geometry/sim/validator/WASM crates, generated schema/types/WASM, gateway
generation, Studio scene/configurator, proof/fuzz/export fixtures, system/living docs,
and v0.2 release notes.
**Decisions:** no new decision; implements D32 and the compatibility-governed minor
boundary already required by D31/GOV-007.
**Next:** complete and publish v0.1.0 through the queued runner-remediation lane, then
rebase this v0.2 slice onto protected `main`, rerun all gates, and deliver it through
the exact-check ruleset.
**Blockers:** no local XC-28 blocker; protected delivery is dependency-ordered behind
the still-queued G1 v0.1 release proof so v0.2 cannot overtake the first release.

## 2026-07-13 — Separate historical parity from equipped variants
**Session:** Codex agent · branch `codex/g1-public-surfaces` · **Phase:** P0/P1 ·
**TODO items:** P0-007, P1-014, XC-28
**Done:** Closed the impossible 31-variant extraction claim against the complete,
byte-frozen pre-configurator oracle without fabricating source data; identified that
v2.1 consumers currently count every alternative as equipped; and created one stable
cross-surface task for explicit selected-variant semantics.
**Changed:** decision record, phase/task ledgers, project-state counts, ModelSpec and
Studio system contracts, and changelog.
**Decisions:** D32 makes the delivered oracle the complete historical parity boundary
and requires exactly one explicit equipped alternative before variant behavior ships.
**Next:** Implement XC-28 as a compatibility-governed contract/migration/validator/
simulation/BOM/Studio slice after the G1 validator release evidence is complete.
**Blockers:** no historical source blocker remains; implementation is dependency-
ordered behind the active G1 release proof.

## 2026-07-13 — Establish honest public project surfaces
**Session:** Codex agent · branch `codex/g1-public-surfaces` · **Phase:** G1 ·
**TODO items:** PRE-004, PRE-005, GOV-010, DOC-004, DOC-006
**Done:** Set a bounded prototype description, README homepage, and 12 repository
topics; corrected the stale red-gate README claim and added live main CI/security
badges; added security, contribution, support, conduct, issue/PR, and debugging
surfaces; and recorded exact-name USPTO/EUIPO searches with zero `ForgedTTC` results.
**Changed:** live GitHub metadata, README, community health files/templates,
debugging and trademark evidence, docs index, project state, TODO, and changelog.
**Decisions:** exact-name absence is preliminary evidence only; confusing-similarity,
classes, common-law use, geography, and filing remain professional legal work.
**Next:** Deliver these surfaces after the compatibility/release stack, then curate a
real first-good-issue and obtain launch-stage trademark review before broad promotion.
**Blockers:** qualified trademark clearance is external; current exact-name search
found no conflict.

## 2026-07-12 — Build the release artifact verification chain
**Session:** Codex agent · branch `codex/g1-release-artifacts` · **Phase:** G1 ·
**TODO items:** GOV-008
**Done:** Implemented Linux x86_64, macOS x86_64, Windows x86_64, and WASM build
jobs; deterministic archive assembly; source/artifact SPDX; SHA-256 manifest;
GitHub build-provenance attestation; annotated-tag/version enforcement; aggregate
download verification; clean temporary npm consumer installation; explicit registry
deferral; and the release/rollback/publication runbooks. The full 31-step local gate
passes, and the assembly/checksum/SPDX/Linux-smoke/WASM inspection chain passes with
local generated inputs.
**Changed:** release workflow, packaging/assembly/metadata/verification scripts,
WASM pack output, package commands, release notes/runbooks, agent entry, governance,
state, execution roadmap, TODO, docs index, and changelog.
**Decisions:** no new architectural decision; D31 version domains and the existing
G1 evidence gate control this workflow.
**Next:** Merge GOV-007, rebase/merge this stacked slice, run the release workflow
manually on protected `main`, download the aggregate artifact, and record exact
attestation/checksum/binary/WASM install proof before closing GOV-008/009.
**Blockers:** GitHub-hosted runner start degradation delays PR proof; no local code
or packaging blocker.

## 2026-07-12 — Freeze the public compatibility contract
**Session:** Codex agent · branch `codex/g1-compatibility-policy` · **Phase:** G1 ·
**TODO items:** GOV-007
**Done:** Defined compatibility policy 1.0.0 across seven package/data surfaces;
added a machine-checked source-of-truth matrix; independently versioned validator
reports, replay tapes, and EnvSpecs; exposed native and WASM version introspection;
retained the historical replay alias; rejected unsupported replay/EnvSpec majors;
and passed all 31 local gates plus 89 worker tests.
**Changed:** Rust validator/simulation/WASM contracts and tests, generated WASM,
worker replay production/verification, compatibility policy/matrix/checker, root
entry rules, system docs, roadmaps, state, TODO, and changelog.
**Decisions:** D31 separates package SemVer from persisted/public format SemVer and
sets the normal deprecation floor to 90 days plus two minor releases.
**Next:** Build cross-platform validator/WASM release artifacts with artifact-specific
SBOMs, provenance/attestations, checksums, and downloaded verification (GOV-008).
**Blockers:** no validator compatibility blocker; GOV-011 still blocks a Linux
Desktop release and does not block the standalone validator.

## 2026-07-12 — Close workflow supply-chain governance
**Session:** Codex agent · branch `codex/g1-governance-closeout` · **Phase:** G1 ·
**TODO items:** GOV-005
**Done:** Merged PR #23 through all six required checks; activated repository
selected-Action policy with GitHub-owned Actions plus seven exact third-party SHAs;
disabled broad verified-creator access; and proved post-merge CI, both dependency
audits, both CodeQL languages, and the validated SPDX artifact under that policy.
**Changed:** living governance, project-state, roadmap, TODO, and changelog evidence.
**Decisions:** source SBOM is now release-blocking evidence, but artifact-specific
SBOM/provenance/download proof remains GOV-008.
**Next:** Execute GOV-007 compatibility/deprecation policy, then the cross-platform
validator release and external install proof in GOV-008/009.
**Blockers:** GOV-011 blocks Linux Desktop release; other live/lab/field blockers
remain unchanged.

## 2026-07-12 — Publish the frozen prototype and pin workflow execution
**Session:** Codex agent · branch `codex/g1-release-foundations` · **Phase:** G1 ·
**TODO items:** PRE-002, P0-010, GOV-005, GOV-006
**Done:** Verified the frozen prototype SHA-256 at commit `0294a9d`, created and
pushed annotated tag `prototype-final`, pinned all external workflow actions to live
resolved commit SHAs, added an immutable-ref gate, declared least-privilege workflow
permissions, and added validated SPDX source SBOMs to security and release workflows.
Dismissed only the documented glib alert as a time-bounded tolerable risk with the
2026-10-12 expiry and Linux-release block recorded in GitHub.
**Changed:** workflow definitions and policy check, package/verification commands,
prototype evidence, governance contract, project state, roadmaps, TODO, and README.
**Decisions:** GitHub-owned Actions remain allowed; every third-party Action is
allowlisted only at its reviewed SHA. Source SBOM proof does not replace the
artifact-specific release proof required by GOV-008.
**Next:** Merge the pinned workflow change, activate the repository selected-Action
allowlist, verify post-merge CI/security/SBOM evidence, and close GOV-005.
**Blockers:** GitHub-hosted post-merge runners are queued; GOV-011 still blocks Linux
Desktop release.

## 2026-07-12 — Make the native Desktop shell a protected gate
**Session:** Codex agent · branch `codex/g0-evidence-closeout` · **Phase:** Wave 0/G1 hardening ·
**TODO items:** GOV-003, GOV-011, QA-011
**Done:** Updated the nested Tauri dependency lock to current compatible patches,
removing two high RustSec advisories; added an independently audited nested-lock CI
step; committed the app icon required by Tauri's native context; and added
`desktop native (macOS)` as an exact protected compile check. The upstream GTK3/glib
0.18 advisory remains a dated Linux-release blocker rather than a false clean claim.
**Changed:** Desktop icon/config/scripts/lockfile, CI and security workflows,
repository governance, TODO/project-state evidence, and contributor gates.
**Decisions:** accept the currently unexercised Tauri/glib warning only through 2026-10-12;
Linux Desktop release remains blocked until migration or reviewed reachability proof.
**Next:** Merge the protected check and supply-chain evidence, then execute the G1
validator release lane.
**Blockers:** upstream Tauri Linux GTK3/glib chain (`GOV-011`); no released Desktop.

## 2026-07-12 — Close G0 on protected main
**Session:** Codex agent · branch `codex/g0-evidence-closeout` · **Phase:** Wave 0 ·
**TODO items:** REC-005, REC-007, GOV-003
**Done:** Merged recovery PR #11 and RustSec hotfix PR #21 through active ruleset
`18843164`; verified final post-merge CI, npm/RustSec audits, and JS/Python CodeQL;
verified manual nightly parity and the enforced coverage floor. The RustSec closeout
updated `anyhow` to 1.0.103 and granted only `checks:write` to its reporting job.
G0 is now remotely closed, not merely locally green.
**Changed:** `Cargo.lock`, security workflow permissions, `PROJECT-STATE.md`, phase
and execution roadmaps, TODO evidence, and changelog.
**Decisions:** none; existing G0/G1 and ruleset contracts were followed.
**Next:** Complete `GOV-005..010` and G1 validator/core release proof, then run the
external R1 builder loop.
**Blockers:** no G0 blocker; release, provider, external-user, lab, and field gates
remain explicit in the roadmap.

## 2026-07-12 — Restore the truthful local green baseline
**Session:** Codex agent · branch `codex/recover-truthful-green` · **Phase:** Wave 0 recovery ·
**TODO items:** REC-001..008, QA-001, P2-005, P4-010
**Done:** Fixed Clippy and validator CLI regressions; made generated quadrupeds
modular and printable across the full slider grid; regenerated/synchronized qd-mini
and its golden; made six-archetype generation DfM/collider/behavior-correct; added
focused manufacturing repair coverage; restored Brief-25 to 25/25; fixed nightly
Chromium invocation; enforced an 80% coverage floor against a measured 84.34%; pinned
Rust 1.96.0; and added passing 29-step non-DB and isolated Postgres verification
entry points. Local browser parity passes all six scenes at edge F1 0.957–0.995.
Enabled vulnerability/security updates, secret scanning and push protection; added
grouped dependency updates, dependency review/audits, JS/Python CodeQL, and an exact
branch-protection/check-name contract. Upgraded `@auth/core` to remove the sole npm
advisory; `pnpm audit` is clean.
Activated exact-check PR-only ruleset `18843164` for `main` and opened draft PR #11.
**Changed:** Rust core/generator/validator sources and fixtures, gateway generation and
tests, qd-mini examples, workflows/toolchain, `scripts/verify.mjs`, package scripts,
README/AGENTS, repository-governance/security automation, and living
roadmap/state/system documentation.
**Decisions:** coverage below 80% lines is now a nightly failure; no validator or DfM
gate was weakened.
**Next:** Let PR CI/security finish, merge through the active ruleset, verify
post-merge CI and manual nightly, then complete remaining governance/release work.
**Blockers:** remote checks are queued; no release exists, and live/field evidence
remains outside local recovery.

## 2026-07-12 — Rebuild the complete evidence-first program roadmap
**Session:** Codex agent · branch main worktree · **Phase:** recovery through P12 ·
**TODO items:** REC-001..008, GOV-001..010, SEC-001..008, QA-001..010,
OPS-001..010, EXT-001..009, DOC-001..006, plus reconciled phase rows
**Done:** Added the canonical root `AGENTS.md`; converted `CLAUDE.md` into a
compatibility entry; added a dated evidence-backed project-state snapshot; rebuilt
the execution roadmap from current recovery through trusted-core release, external
builder proof, live compute, controlled hardware, platform, field maintenance, and
scale decisions; reconciled stale phase/task states; and added missing governance,
security, privacy, quality, operations, external-proof, documentation, risk, and
release work.
**Changed:** `AGENTS.md`, `CLAUDE.md`,
`docs/{README.md,PROJECT-STATE.md,ROADMAP.md,TODO.md,EXECUTION-ROADMAP.md,BEST-PRACTICES.md,risk-register.md}`,
`CHANGELOG.md`.
**Decisions:** none; this work documents current executable evidence and existing
decision boundaries.
**Next:** Execute Wave 0 (`REC-001..008`, `GOV-001..005`, `QA-001`) and refresh
`PROJECT-STATE.md` with green local/PR/post-merge/nightly evidence.
**Blockers:** current Clippy/workspace/declared-verdict/Brief-25/CI/nightly failures;
main is unprotected; publication and live/field gates remain unmet.

## 2026-06-16 — Draw remaining-work boundary
**Session:** Codex agent · branch main · **Phase:** cleanup · **TODO items:** none
**Done:** Audited the remaining TODO rows after closing local code lanes and
recorded the active boundary in `docs/EXECUTION-ROADMAP.md`: remaining work is
owner-input, D30/D12 lab hardware, external-provider, conditional benchmark, or
phase-fed catalog/slot-system work. No additional unblocked local implementation
lane was identified.
**Changed:** `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Owner/provider/lab inputs must be supplied before the remaining rows can
be closed honestly.
**Blockers:** owner signoffs/assets, lab hardware evidence, provider credentials,
and benchmark data as listed in the execution roadmap boundary.

## 2026-06-15 — Emit print handoff artifacts from geometry jobs
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P11/P6 · **TODO items:** P11-006 [~], XC-18 [~]
**Done:** Extended `occt.tessellate` fixture output with DfM report references,
oriented 3MF export references, print-profile metadata, printed-part BOM rows, and
quote-link-only handoff metadata for DfM-passing structural parts.
**Changed:** `workers/forge_workers/geometry.py`,
`workers/tests/test_geometry_print_artifacts.py`, `docs/systems/compute-workers.md`,
`docs/systems/platform.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Replace fixture orientation with live OCCT/3MF generation and submit the
artifact contract to sandbox print-provider quote APIs.
**Blockers:** live OCCT print export/orientation and print-provider sandbox
credentials remain open.

## 2026-06-15 — Normalize commerce provider handoffs
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P11 · **TODO items:** P11-005 [~], P11-006 [~]
**Done:** Added worker-side commerce normalizers for live vendor refresh and print
quote handoffs. `FORGE_VENDOR_REFRESH_CMD` output now normalizes into rate-limited,
provenanced vendor offers with invalid rows held, and `FORGE_PRINT_QUOTE_CMD`
output stays quote-link-only, blocks before DfM-passing 3MF/profile artifacts, and
marks checkout as off-platform.
**Changed:** `workers/forge_workers/commerce.py`,
`workers/tests/test_commerce.py`, `docs/systems/compute-workers.md`,
`docs/systems/platform.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Wire these normalizers into the gateway commerce routes once that lane is
clear, then run sandbox/live provider refresh and print quote suites.
**Blockers:** real provider credentials/accounts and gateway route integration
remain open.

## 2026-06-15 — Add Modal task runtime profiles
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P5/P7/P9 · **TODO items:** P5-006 [~], P7-003 [~], P9-002 [~]
**Done:** Added test-covered Modal runtime profiles for `photoscan.single`,
`photoscan.multiview`, `train.policy`, `train.offline-bc`, `train.sysid-fit`, and
`codesign.evaluate`. Profiles now declare GPU expectations, timeouts, package
sets, command env hooks, permanent-cache requirements, and photoscan SLO metadata
without importing Modal in local/CI runs.
**Changed:** `workers/forge_workers/modal_app.py`,
`workers/tests/test_modal_app.py`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Build/deploy the Modal image with real TRELLIS/COLMAP/SB3/MuJoCo/Optuna
commands and run the optional live GPU smoke suites.
**Blockers:** provider credentials, live dependency images, and real SLO/benchmark
evidence remain open.

## 2026-06-15 — Assess policy transfer compatibility for skills
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P11/P7 · **TODO items:** P11-003 [~]
**Done:** Added a worker-side policy transfer assessor for skills marketplace
listings. It allows direct transfer only when the policy is exportable and the
buyer twin has matching archetype, observation layout, and action layout; otherwise
it returns an explicit fine-tune-against-buyer-twin offer, or blocks non-exportable
policies.
**Changed:** `workers/forge_workers/policy_transfer.py`,
`workers/tests/test_policy_transfer.py`, `docs/systems/platform.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Wire this assessor into the public policy-listing/equip route once the
gateway/Studio lane is clear, then run it against real ONNX headers and buyer
twins.
**Blockers:** public marketplace routing and live fine-tune execution remain open.

## 2026-06-15 — Normalize MJX benchmark adoption reports
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P7/P9 · **TODO items:** P7-010 [~], P9-005 [~]
**Done:** Added a normalized MJX benchmark report for `FORGE_MJX_BENCH_CMD` and
payload-supplied benchmark rows. The report now requires D12 quad, D12 rover, and
one legged morphology, applies the P7-010 rule for CPU need, frozen parity bands,
and at least 3x cost-normalized throughput, and blocks adoption when evidence is
missing or malformed.
**Changed:** `workers/forge_workers/simulation.py`,
`workers/tests/test_mjx_benchmark.py`, `docs/systems/compute-workers.md`,
`docs/systems/learning-engine.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Run the report against real D12 quad, D12 rover, and legged MuJoCo/MJX
benchmarks, then wire P9 tier-2/3 batching only if the report adopts MJX.
**Blockers:** real benchmark evidence and engine-backed tier-2/3 execution remain
open.

## 2026-06-15 — Normalize external system-ID fits
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P8/P7 · **TODO items:** P8-005 [~]
**Done:** Hardened `FORGE_SYSID_FIT_CMD` output so external bench/log adapters
normalize into the same `train.sysid-fit` artifact shape as fixtures. Live fits now
require at least three samples, an accepted fit, and a non-empty `simPatch`; otherwise
they fail closed without updating the contract sim block.
**Changed:** `workers/forge_workers/training/jobs.py`,
`workers/tests/test_training_live_adapter.py`, `docs/systems/compute-workers.md`,
`docs/systems/learning-engine.md`, `docs/TODO.md`, `docs/ROADMAP.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Run the external sys-ID command on real D12 bench/flight telemetry and
apply the emitted sim patch in the lab evidence flow.
**Blockers:** real bench/flight telemetry remains open.

## 2026-06-15 — Emit leaderboard dimensions from replay verification
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P10 · **TODO items:** P10-005 [~]
**Done:** Extended `replay.verify` output with durable leaderboard dimensions
derived from replay headers or payload metadata: course id, archetype, board class,
model id, policy id, and contract hash. Existing hash/timestamp/contract checks stay
unchanged.
**Changed:** `workers/forge_workers/replay.py`,
`workers/tests/test_replay_dimensions.py`, `docs/systems/environments-courses.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Persist these dimensions as first-class leaderboard columns in the gateway
data model once the gateway lane is clear.
**Blockers:** durable gateway/database leaderboard dimension migration remains open.

## 2026-06-15 — Wire EnvSpec courses into training tasks
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P10/P7 · **TODO items:** P10-006 [x], P7-003 [~]
**Done:** Added a worker-side EnvSpec→P7 task compiler and wired `train.policy` to
consume explicit `envSpec` or `course.envSpec` payloads directly. Course tasks now
preserve course id/name/version, archetype, spawn/gates/bounds/terrain, reward
metadata, and ONNX/scorecard task ids without gateway conversion work.
**Changed:** `workers/forge_workers/training/tasks.py`,
`workers/forge_workers/training/jobs.py`, `workers/tests/test_course_tasks.py`,
`docs/systems/environments-courses.md`, `docs/EXECUTION-ROADMAP.md`,
`docs/TODO.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Prove the full P10 exit with a public/community course, verified
leaderboard run, and a live trainer consuming that course task.
**Blockers:** direct public course fetch/API polish, durable leaderboard dimensions,
and live trainer evidence remain open.

## 2026-06-15 — Compute maintenance ghost divergence
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P12 · **TODO items:** P12-002 [~]
**Done:** Extended `maintenance.crash-forensics` so crash windows now compute ghost
divergence from actual/predicted position samples, emit RMS/max divergence,
tracking/diverged status, and scrub-frame counts for the replay window.
**Changed:** `workers/forge_workers/maintenance.py`,
`workers/tests/test_maintenance_handoffs.py`, `docs/systems/platform.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Feed this worker with a real Desktop-captured field log and compare the
visible Studio scrubber against the emitted divergence status.
**Blockers:** real Desktop field-log capture remains open.

## 2026-06-15 — Attach maintenance repair handoffs in worker output
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P12 · **TODO items:** P12-002 [~], P12-003 [x], P12-004 [~]
**Done:** Enriched `maintenance.repair-sheet` so repair steps can carry vendor
offer handoff links and print quote links supplied by the commerce layer, including
per-step `quoteReady`, flattened `quoteLinks`, and `handoffCount`. The worker still
produces ordered repair steps when no quote links are present.
**Changed:** `workers/forge_workers/maintenance.py`,
`workers/tests/test_maintenance_handoffs.py`, `docs/systems/platform.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Run the end-to-end P12 proof with a Desktop-captured crash log plus live
vendor/print quote rows.
**Blockers:** real field-log evidence and live commerce provider rows remain open.

## 2026-06-14 — Normalize external offline learning warmstarts
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P7 · **TODO items:** P7-009 [~]
**Done:** Hardened `FORGE_OFFLINE_RL_CMD` results so external behavior-cloning or
offline-RL outputs normalize into the same dataset/warmstart artifact as the
fixture path. Warmstarts require at least three samples and action columns, invalid
datasets are held with reject reasons, and every warmstart remains non-exportable
until a live fine-tune scorecard passes.
**Changed:** `workers/forge_workers/training/jobs.py`,
`workers/tests/test_training_live_adapter.py`, `docs/systems/learning-engine.md`,
`docs/systems/compute-workers.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Connect Desktop-captured telemetry logs to a live fine-tune job that
produces a fresh `p7-scorecard-v1` policy artifact.
**Blockers:** real recorder data and live offline-RL/fine-tune runtime remain open.

## 2026-06-14 — Re-gate live SB3 policy artifacts
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P7 · **TODO items:** P7-003 [~], P7-006 [x], P7-008 [~]
**Done:** Normalized every `FORGE_SB3_TRAIN_CMD` result through the P7 scorecard
gate instead of trusting external `artifactKind: policy` payloads. Live SB3 outputs
now carry `p7-scorecard-v1`, required success/robustness/energy/lineage fields,
estimator-smoke evidence, thresholds, `exportGate`, and `onnx.exportable`; missing
scorecard fields and ground-truth-trained policies fail closed.
**Changed:** `workers/forge_workers/training/jobs.py`,
`workers/forge_workers/training/scorecard.py`,
`workers/tests/test_training_live_adapter.py`, `workers/tests/test_scorecard.py`,
`docs/systems/learning-engine.md`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Run a real SB3/MuJoCo hover/waypoint job through the normalized adapter and
feed the resulting ONNX into browser runtime playback.
**Blockers:** live SB3/MuJoCo runtime and ONNX Runtime Web integration remain open.

## 2026-06-14 — Normalize live photoscan adapter output
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P5 · **TODO items:** P5-001 [~], P5-002 [~], P5-006 [~]
**Done:** Hardened `FORGE_PHOTOSCAN_CMD` and `FORGE_COLMAP_CMD` outputs so live
commands are normalized into the same photoscan artifact contract as fixtures:
pipeline stages, permanent object-cache metadata, D13 acceptance/reject reasons,
candidate review flags, COLMAP view graph, and 5-minute SLO evidence. Missing D13
fit/Hausdorff metrics now fail closed instead of being treated as accepted scans.
**Changed:** `workers/forge_workers/photoscan.py`,
`workers/tests/test_photoscan_live_adapter.py`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `docs/ROADMAP.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Run the normalized adapter contract against real TRELLIS/COLMAP GPU
commands and capture the under-5-minute SLO evidence.
**Blockers:** live GPU runtime images, credentials, and photographed-motor evidence
remain deployment/lab work.

## 2026-06-14 — Add constraint-aware co-design ladder
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~], P9-004 [~]
**Done:** Hardened `codesign.evaluate` so the keyless CMA/TPE-shaped search now
attaches structured tier-0/tier-1/tier-2/tier-3 evaluation evidence, applies
objective constraints, keeps rejected candidates out of the Pareto front, and proves
the 200-candidate path returns at least three admitted Pareto points under course
constraints.
**Changed:** `workers/forge_workers/codesign.py`,
`workers/tests/test_codesign_optimizer.py`, `docs/systems/co-design.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Swap the keyless tier evidence for engine-backed Rapier/MuJoCo/SB3
results through `FORGE_CODESIGN_CMD` once the simulation/training lanes land.
**Blockers:** live engine-backed tier 1/2/3 execution and P7-010 MJX benchmark data
remain open.

## 2026-06-14 — Add ETL command adapter routing
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P3/P4 · **TODO items:** P3-004 [~], P4-016 [~]
**Done:** Routed `etl.ingest-component` through the fetch/extract/geometry adapter
protocols when a source bundle payload is supplied, added command-backed Claude and
OCCT seams (`FORGE_CLAUDE_EXTRACT_CMD`, `FORGE_OCCT_TESSELLATE_CMD`), and kept
fixture canonical rows as the keyless CI path.
**Changed:** `workers/forge_workers/etl/adapters.py`,
`workers/forge_workers/etl/ingest.py`, `workers/forge_workers/etl/__init__.py`,
`workers/tests/test_etl_adapters.py`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Deploy provider-owned Claude/OCCT commands with real credentials and
review queue persistence.
**Blockers:** live provider credentials and OCCT runtime images remain deployment
work.

## 2026-06-14 — Enrich photoscan pipeline artifacts
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P5 · **TODO items:** P5-001 [~], P5-002 [~], P5-006 [~]
**Done:** Expanded keyless `photoscan.single` and `photoscan.multiview` outputs to
carry the full pipeline contract: background-removal, reconstruction,
manifold-repair, decimation, primitive-refit stages, D13 fit coverage/Hausdorff
metrics, COLMAP-style view graph metadata, alignment hints, and owner-review flags.
**Changed:** `workers/forge_workers/photoscan.py`,
`workers/tests/test_worker_jobs.py`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Replace the keyless stage records with live TRELLIS/COLMAP execution and
run the 5-minute burst-GPU SLO suite.
**Blockers:** live GPU credentials/runtime images remain deployment work.

## 2026-06-14 — Add P7 task suite and offline BC worker
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P7 · **TODO items:** P7-001 [x], P7-009 [~]
**Done:** Added the versioned P7 task catalog covering hover, waypoint, slalom,
velocity, legged, rover, and arm tasks, wired `train.policy` to emit those
environment definitions, and added `train.offline-bc` for deterministic telemetry
dataset ingestion and behavior-cloning warmstart artifacts.
**Changed:** `workers/forge_workers/training/tasks.py`,
`workers/forge_workers/training/jobs.py`, `workers/tests/test_worker_jobs.py`,
`docs/systems/learning-engine.md`, `docs/systems/compute-workers.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Connect live offline-RL/fine-tune adapters and route Desktop-captured
field logs into the trainer once the P8 recorder lane lands.
**Blockers:** live SB3/MuJoCo/offline-RL execution remains deployment-adapter work.

## 2026-06-14 — Expand co-design optimizer depth
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P9 · **TODO items:** P9-002 [~], P9-003 [~], P9-004 [~]
**Done:** Expanded `codesign.evaluate` from three fixed candidates into a
deterministic, budgeted CMA/TPE-shaped search that emits up to 200 candidates,
optimizer metadata, richer metrics, and a computed Pareto front while preserving
the external optimizer command seam.
**Changed:** `workers/forge_workers/codesign.py`,
`workers/tests/test_worker_jobs.py`, `docs/systems/co-design.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Replace the keyless optimizer fixture with real CMA-ES/Optuna plus
engine-backed tier 1/2/3 evaluation once Rapier/MuJoCo/SB3 lanes are ready.
**Blockers:** engine-backed tiers and overnight hardware benchmarks remain open.

## 2026-06-14 — Add Studio marketplace curation board
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P11 · **TODO items:** P11-002 [~], P11-003 [~]
**Done:** Replaced the flat listing preview with a Studio marketplace board that
filters listings by kind/status and records usage-beta events from each listing:
view, equip, policy download, print quote click, or training job depending on the
listing kind.
**Changed:** `packages/studio/src/App.tsx`, `docs/EXECUTION-ROADMAP.md`,
`docs/TODO.md`, `docs/systems/platform.md`, `docs/systems/studio-ui.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Add durable public curation state and the real skill transfer/fine-tune
offer once marketplace review policy and training adapters are ready.
**Blockers:** external curation and live transfer/fine-tune economics remain out of
this Studio-only slice.

## 2026-06-14 — Attach repair quote handoff links
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P12 · **TODO items:** P12-002 [~], P12-004 [~]
**Done:** Wired Studio maintenance repair sheets to the existing commerce rows:
repair steps now match reorder SKUs to vendor offers and the repair panel exposes
the current print quote handoff link with explicit off-platform payment language.
**Changed:** `packages/studio/src/App.tsx`, `docs/EXECUTION-ROADMAP.md`,
`docs/TODO.md`, `docs/systems/platform.md`, `docs/systems/studio-ui.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Prove the full P12 exit path with a real Desktop-captured field log and
DfM-specific print quote artifacts.
**Blockers:** real field-log evidence remains outside this Studio-only slice.

## 2026-06-14 — Add Studio course URLs
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P10 · **TODO items:** P10-004 [~]
**Done:** Added client-side `?course=<id>` support in Studio: refresh selects a
matching public/unlisted course from the existing course list, the active course
selector updates the URL, and the platform panel exposes a copyable course URL.
**Changed:** `packages/studio/src/App.tsx`,
`docs/systems/environments-courses.md`, `docs/systems/studio-ui.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Add a direct public course lookup endpoint or route when course listings
need to load ids outside the current list window.
**Blockers:** P10-004 remains open until public course pages/API polish are durable
for arbitrary listed course ids.

## 2026-06-14 — Persist admitted co-design points from Studio
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P9 · **TODO items:** P9-004 [~]
**Done:** Added a Studio save action for admitted co-design Pareto candidates. The
action applies the candidate JSON Patch through the core boundary, saves the result
through the model admission route with draft mode disabled, refreshes the model
registry, and opens the persisted point.
**Changed:** `packages/studio/src/App.tsx`, `docs/systems/studio-ui.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Back the explorer with live CMA-ES/Optuna and engine-tier results so
overnight runs produce at least three admitted Pareto points.
**Blockers:** P9-004 remains open until live optimizer runs and persisted points are
fed by engine-backed candidate evaluation rather than fixture patches.

## 2026-06-14 — Add Studio maintenance twin dashboard
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P12 · **TODO items:** P12-002 [~], P12-004 [~]
**Done:** Added a Studio maintenance twin dashboard over materialized
`maintenance_records`: fleet counts, due/critical state, next actions, wear cards,
repair/reorder rows, and a crash-window scrubber that surfaces ghost divergence
status over the last-seconds interval.
**Changed:** `packages/studio/src/App.tsx`, `docs/systems/platform.md`,
`docs/systems/studio-ui.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Connect the dashboard to real Desktop-captured telemetry logs and live
vendor/print quote handoff rows for crash-to-repair closure.
**Blockers:** P12 exit proof still depends on D12 lab/Desktop field-log capture and
live provider handoff evidence.

## 2026-06-14 — Add Studio course editor and leaderboard filters
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P10 · **TODO items:** P10-004 [~], P10-005 [~]
**Done:** Expanded the Studio platform panel from fixture-only course creation and
a top-three leaderboard list into an editable EnvSpec course form plus a
selected-course verified board with filters for EnvSpec archetype, replay-header
class, and official verified/held status. The board surfaces verification metadata
including frames, duration, client claim, hash, reject reason, and rank.
**Changed:** `packages/studio/src/App.tsx`,
`docs/systems/environments-courses.md`, `docs/EXECUTION-ROADMAP.md`,
`docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Add public course URL polish and durable `archetype`/`board_class`
columns or equivalent indexed metadata to leaderboard runs so the gateway can slice
official boards server-side.
**Blockers:** P10-004 and P10-005 remain open until public course sharing and
leaderboard dimensions are persisted/queryable by the gateway API.

## 2026-06-14 — Add ModelSpec schema migration runner
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P2/P4 · **TODO items:** XC-23 [x]
**Done:** Added the XC-23 ModelSpec migration runner in `forge-contract` with
audit reporting, legacy field/provenance alias normalization, schema-marker
cleanup, and post-migration shape validation. Exposed it through
`forge-validate migrate` and a `pnpm schema:migrate` script.
**Changed:** `crates/forge-contract/src/migrations.rs`,
`crates/forge-contract/src/lib.rs`, `crates/forge-contract/tests/migrations.rs`,
`crates/forge-validate/src/main.rs`, `package.json`,
`docs/systems/model-contract.md`, `docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Add new compatibility rows whenever a future schema-breaking DECISIONS
entry lands, and keep migration coverage pinned before regenerating TS/Python
types.
**Blockers:** none.

## 2026-06-14 — Add ModelSpec fuzz seed corpus
**Session:** Codex agent · branch codex/xc24-fuzz-corpus · **Phase:** P4/P2 · **TODO items:** XC-24 [x]
**Done:** Added a deterministic ModelSpec fuzz seed corpus with adversarial
JSON-Pointer mutations over first-party examples, an executable checker that pins
validator verdicts and error check IDs, and a greedy minimizer flow for preserving
future fuzz failures as regression fixtures.
**Changed:** `evals/fuzz/modelspec-seeds.json`,
`scripts/fuzz-contract-seeds.mjs`, `crates/forge-contract/tests/fuzz_corpus.rs`,
`package.json`, `docs/systems/validation-harness.md`,
`docs/EXECUTION-ROADMAP.md`, `docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Wire `pnpm fuzz:contract:check` into CI beside `node scripts/validate-all.mjs`
and use `--write-seeds-dir` when a generated failure needs a committed minimized
fixture.
**Blockers:** none.

## 2026-06-14 — Add FDM v0 DfM validator checks
**Session:** Codex agent · branch main · **Phase:** P6/P11 · **TODO items:** XC-18 [~], P11-006 [~]
**Done:** Added deterministic validator diagnostics for printable inline
structural parts: `MFG-001` minimum wall, `MFG-002` unsupported-overhang warning,
`MFG-003` support-area estimate warning, and `MFG-004` oriented FDM bed fit.
Pinned unit coverage for too-thin and too-large printed parts while keeping the
first-party demo admitted.
**Changed:** `crates/forge-validate/src/lib.rs`,
`docs/systems/validation-harness.md`, `docs/systems/geometry-engine.md`,
`docs/TODO.md`, `CHANGELOG.md`.
**Decisions:** none.
**Next:** Generate oriented 3MF/profile artifacts and attach DfM status/artifact
refs to printed-parts BOM rows so print quote handoff can consume validator output.
**Blockers:** exact B-rep wall analysis, SLA profile support, and quote-ready 3MF
artifacts still require the export/worker slice.

## 2026-06-14 — Record D30 controlled D12 lab signoff
**Session:** Codex agent · branch current worktree · **Phase:** P8 · **TODO items:** P8-000 [x], P8-001 [~], P8-009 [~], P8-010 [~], P8-012 [~], P8-013 [~]
**Done:** Recorded owner signoff for the D28 hardware/legal gate as D30 and added
an active `d28.hardware` migration scoped to controlled D12 lab pilots only.
Updated the README, roadmap, legal/safety doc, hardware bridge doc, pilot
playbooks, Studio/worker docs, and execution roadmap so hardware work now reads as
D30 lab-gated rather than legal-pending.
**Changed:** `infra/migrations/0013_d28_lab_signoff.sql`, `docs/DECISIONS.md`,
`docs/ROADMAP.md`, `docs/TODO.md`, `docs/security-safety-legal.md`,
`docs/systems/hardware-bridge.md`, `docs/EXECUTION-ROADMAP.md`,
`docs/pilots/reference-quad-pilot.md`, `docs/pilots/reference-rover-pilot.md`,
`README.md`,
`docs/assets/readme/hero.svg`, `packages/gateway/src/platform.ts`,
`packages/gateway/test/server.test.ts`, `packages/desktop/src-tauri/src/main.rs`,
`packages/desktop/scripts/check-desktop.mjs`,
`packages/desktop/deployment-ladder.json`, `scripts/check-pilot-docs.mjs`.
**Decisions:** D30 accepts ToS/liability, telemetry consent, ladder UX, physical
confirmation, no-auto-arm, D12 rig allowlist, advisory policy authority, and
supervisor priority for controlled lab pilots only.
**Next:** Implement the D12 lab adapters and capture evidence for HITL,
tethered/constrained runs, Desktop recording, ghost replay, and system-ID before
any external hardware beta.
**Blockers:** external hardware beta remains blocked until post-lab evidence and a
separate rollout gate; arbitrary rigs remain blocked.

## 2026-06-14 — Add remaining-work execution roadmap
**Session:** Codex agent · branch current worktree · **Phase:** P0-P12 · **TODO items:** all remaining open/in-progress/blocked TODOs in `docs/EXECUTION-ROADMAP.md` §4, planning only
**Done:** Added an execution overlay that maps every remaining open,
in-progress, and blocked TODO into parallel subworker tracks with dependencies,
blockers, acceptance gates, and an end-to-end closure order. Linked it from the
docs index and the phase roadmap so future agents can choose work by either phase
or subworker lane.
**Changed:** `docs/EXECUTION-ROADMAP.md`, `docs/README.md`, `docs/ROADMAP.md`,
`CHANGELOG.md`.
**Decisions:** none.
**Next:** Start Wave A with track S (`P6-001`/`P6-010`) or track V
(`P2-001`/`P2-002`), because simulation parity and validator persistence unblock
the largest number of downstream tracks.
**Blockers:** D30 allows controlled D12 lab pilots only; external hardware beta,
P11 policy-sharing signoff, provider sandboxes, physical lab rigs, and the missing
later configurator prototype still gate their respective live-path tasks.

## 2026-06-14 — Implement remaining P4-P12 live gates and commerce seams
**Session:** Codex agent · branch current worktree · **Phase:** P4-P12 · **TODO items:** P7-010 [~], P8-000 [!], P8-001 [~], P8-012 [~], P8-013 [~], P11-000 [~], P11-002 [~], P11-003 [~], P11-005 [~], P11-006 [~], P11-009 [x], P12-003 [x]
**Done:** Added platform gate records for D28 hardware, P11 policy sharing, and P11
marketplace economics; exposed gate and job-capability APIs; enforced D28 lab gates
for live bridge jobs and Desktop native commands; added vendor offer refresh/list,
print quote/link handoff, and marketplace usage-rollup APIs without payment/payout
ledgers. Added external-command seams for photoscan/COLMAP, SB3/sysid, co-design,
MuJoCo parity, and MJX benchmarking plus optional Modal worker app dispatch. Added
sim parity tolerance and MJX adoption helpers. Surfaced gates, capabilities, vendor
links, quote links, and usage-beta actions in Studio.
**Changed:** `infra/migrations/0012_gates_capabilities_commerce.sql`,
`packages/gateway/src/{platform.ts,server.ts}`, `packages/gateway/test/server.test.ts`,
`packages/studio/src/{App.tsx,gateway.ts}`, `packages/desktop/src-tauri/src/main.rs`,
`packages/desktop/scripts/check-desktop.mjs`, `workers/forge_workers/{external.py,photoscan.py,codesign.py,simulation.py,modal_app.py,training/jobs.py}`,
`crates/forge-sim/src/{heavy.rs,interop.rs}`, and roadmap/system docs.
**Decisions:** D29 — P11 marketplace launches as a usage-data beta; no seller
payouts, revenue share, or direct checkout at launch; GPU jobs retain credit
cost-plus until real usage thresholds justify a new decision.
**Next:** Capture real engine-backed Rapier/MuJoCo baselines and run the P7-010 D12
quad/rover/legged MJX benchmark; separately, get owner/legal D28 signoff before any
hardware pilot.
**Blockers:** D28 legal/hardware signoff remains owner/counsel work; live provider
SLOs require configured GPU/vendor/print-service sandboxes and physical lab rigs.

## 2026-06-13 — Add P4 generation UI, audit rows, and Brief-25 scaffold
**Session:** Codex agent · branch `codex/p4-completion-batch` · **Phase:** P4 · **TODO items:** P4-001 [~], P4-006 [x], P4-008 [~], P4-009 [x], P4-010 [~], P4-012 [x]
**Done:** Added `generated_artifacts` with a forward migration and gateway recording
for admitted, draft, and rejected generations. Rows capture prompt/provider,
archetype/categories, seed, stable contract hash, prompt hash, final model, contract
JSON, validator report, attempt history, approved-catalog context, and D26 model
pins. Added `POST /v1/generate/stream` as an SSE-compatible start/complete/error
event surface using the same generation and persistence path as `POST
/v1/generate`. Added the studio generation panel with template/Anthropic provider
selection, local-session BYO key handling, prompt/archetype/category/repair/seed
controls, verdict/attempt/diagnostic display, draft/admitted scene loading, and
admitted-only sharing. Added the Brief-25 corpus and deterministic evaluator; CI
runs it and uploads the JSON artifact.
**Changed:** `infra/migrations/0005_generated_artifacts.sql`,
`packages/gateway/src/{generatedArtifacts.ts,generation.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, `packages/studio/src/{App.tsx,gateway.ts,wasm.ts}`,
`evals/brief25.corpus.json`, `scripts/{brief25-eval.mjs,db-assert-p3.mjs}`,
`.github/workflows/ci.yml`, `package.json`, and P4 docs.
**Decisions:** none.
**Next:** Split explicit multi-pass synthesis and per-pass SSE diagnostics, then
add the time-series Brief-25 dashboard and conversational JSON-Patch editing.
**Blockers:** none.

## 2026-06-13 — Add opt-in Anthropic generation transport
**Session:** Codex agent · branch `codex/p4-anthropic-generation-adapter` · **Phase:** P4 · **TODO items:** P4-001 [~], P4-008 [~]
**Done:** Added the live Anthropic provider behind the existing generation route:
`POST /v1/generate` now accepts `provider: "anthropic"` and a per-request
`x-forge-anthropic-key`/`anthropicApiKey` or deployment `ANTHROPIC_API_KEY`. The
adapter calls the Messages API through a forced strict `forge_emit_modelspec` client
tool using the emitted ModelSpec schema, stamps model/prompt/seed provenance, and
reuses the existing validator repair/draft loop. Tests use an injected transport and
cover synthesis, repair, usage/stop metadata, key redaction, and missing-key failure.
**Changed:** `packages/gateway/src/{generation.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, and P4/security docs.
**Decisions:** none.
**Next:** Build the studio generation panel/BYO-key settings and SSE progress
surface, then add Brief-25 corpus/CI.
**Blockers:** none.

## 2026-06-13 — Add validator-loop generation endpoint
**Session:** Codex agent · branch `codex/p4-generation-orchestrator` · **Phase:** P4 · **TODO items:** P4-001 [~], P4-006 [~], P4-011 [x]
**Done:** Added the executable P4 generation loop: `POST /v1/generate` consumes
approved catalog context, runs an injectable synthesis adapter, validates every
candidate through `forge-validate`, repairs up to three iterations, and falls back
to D14 draft diagnostics when repairs are exhausted. Added `GET /v1/generate/models`
for the D26 Anthropic model/pricing pins and tests for block, repair/admit, draft,
and model-pin behavior.
**Changed:** `packages/gateway/src/{generation.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, and P4 docs.
**Decisions:** D26 — P4 Anthropic model IDs, token limits, output caps, and pricing
pinned from official docs checked 2026-06-13.
**Next:** Replace the default deterministic synthesis adapter with the live
Claude/tool-pass transport behind BYO/API-key plumbing, then add Brief-25 CI.
**Blockers:** none.

## 2026-06-13 — Add generation context builder
**Session:** Codex agent · branch `codex/p4-generation-context` · **Phase:** P4 · **TODO items:** P4-001 [~], P4-002 [x], P4-003 [~]
**Done:** Added the first executable generation-orchestrator slice:
`POST /v1/generate/context` builds a deterministic prompt-cache prefix from the
schemars schema, engine docs, and schema-true contract exemplars, then retrieves
only catalog components with approved review rows and non-blocked export policy.
The endpoint is context-only; it deliberately does not call Claude or synthesize
contracts yet.
**Changed:** `packages/gateway/src/{generation.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, and P4 docs.
**Decisions:** none.
**Next:** Add the actual constrained-synthesis adapter and validator-in-loop repair
loop behind this context, then pin current Anthropic model strings/pricing for
P4-011 before live calls.
**Blockers:** none.

## 2026-06-13 — Wire P4 ingestion adapters and review audit policy
**Session:** Codex agent · branch `codex/p4-ingestion-review-polish` · **Phase:** P4 · **TODO items:** P4-014 [x], P4-015 [x], P4-016 [~], P4-017 [x]
**Done:** Extended the catalog review path with owner audit notes, review decision
payloads, owner-token route auth, and export-policy filtering (`full-geometry-ok`, attribution manifest,
envelope/link-out, BOM-only, blocked, assembly-derived). Added deterministic ETL
adapter seams for source fetch, Claude-style extraction, and OCCT geometry attach:
fixture fetch/extract/envelope adapters are CI-executable; HTTP/source fetching is
rate-limited and injectable; Claude and OCCT live paths fail closed unless a key or
executor is supplied by deployment.
**Changed:** `infra/migrations/0004_review_audit.sql`,
`packages/gateway/src/{reviewQueue.ts,server.ts}`, `packages/studio/src/{App.tsx,gateway.ts}`,
`workers/forge_workers/etl/{adapters.py,ingest.py}`, worker/gateway tests, and P4 docs.
**Decisions:** none.
**Next:** Start the generation orchestrator/retrieval prefix work against only
approved catalog truth; live Claude transport remains deployment-owned behind the
adapter seam.
**Blockers:** none.

## 2026-06-13 — Add studio catalog review panel
**Session:** Codex agent · branch `codex/p4-review-ui-cleanup` · **Phase:** P4 · **TODO items:** P4-014 [~]
**Done:** Continued the P4 review loop with a real studio surface: typed gateway
client, `/v1/reviews` list/filter, approve/reject actions, Vite `/v1` proxy for
local gateway development, and responsive panel cleanup. Verified against seeded
Postgres through the running gateway: pending rows rendered, approving one row
removed it from pending, and the approved filter showed reviewer attribution.
Browser-checked desktop and 390px mobile layouts for panel overflow/overlap.
**Changed:** `packages/studio/src/{App.tsx,gateway.ts}`, `packages/studio/vite.config.ts`,
and P4 docs (`TODO`, `ROADMAP`, generation pipeline, studio UI).
**Decisions:** none.
**Next:** Add live source-fetch and Claude extraction adapters behind fixture-backed
tests, then wire audit notes/export filters into the review decision path.
**Blockers:** none.

## 2026-06-13 — Complete Node 24 action migration
**Session:** Codex agent · branch `codex/node24-action-majors` · **Phase:** CI hygiene · **TODO items:** none
**Done:** Follow-up to the post-P3 PR: the force-env approach made the hosted run
green, but GitHub still annotated that Node-20-targeting actions were being forced
onto Node 24. Upgraded workflow action majors instead: `actions/checkout@v6`,
`actions/setup-node@v6`, `actions/setup-python@v6`, `pnpm/action-setup@v6`, and
`actions/upload-artifact@v7`; removed the force env blocks.
**Changed:** `.github/workflows/{ci,nightly,release}.yml`.
**Decisions:** none.
**Next:** Continue P4 with the studio owner-review surface, then live fetch/Claude/
OCCT adapters behind fixture-backed tests.
**Blockers:** none.

## 2026-06-13 — Post-P3 baseline and P4 review entry slice
**Session:** Codex agent · branch `codex/post-p3-p4-start` · **Phase:** P3/P4 · **TODO items:** P4-014 [~], P4-015/016/017 [queued]
**Done:** Marked the merged P3 catalog slice as the `p3-baseline` tag target
(`6937037`). Removed the hosted CI Node 20 action-runtime warning by opting the
workflows into GitHub's Node 24 JavaScript action runtime. Started P4 per D25 with
an executable review-queue API: `GET /v1/reviews` lists P3 `review_queue` records
and `PATCH /v1/reviews/:id` records approve/reject decisions against pending items;
database failures return a typed 503 without affecting validator/bake/BOM routes.
**Changed:** `.github/workflows/{ci,nightly,release}.yml`,
`packages/gateway/src/{db.ts,reviewQueue.ts,server.ts}`,
`packages/gateway/test/server.test.ts`, package manifests/lockfile, and P4 docs
(`DECISIONS`, `ROADMAP`, `TODO`, generation pipeline, gateway/data).
**Decisions:** D25 — P4 starts with live catalog ingestion/review operations before
full text-to-CAD generation GA.
**Next:** Build the studio owner-review surface on top of `/v1/reviews`, then add
the injectable live fetch/Claude/OCCT adapters behind deterministic fixture tests.
**Blockers:** none.

## 2026-06-12 — Execution batch: collision truth (XC-09/GEO-008), SIM-004, share URLs, gamepad, workflows, incremental re-bake
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1/P3 cross-cutting · **TODO items:** §5 batch (9 of 10 closed), P1-002 [x]
**Done:** The owner-approved improvement list, executed. **XC-09:**
`forge-geometry::collide` — Möller tri-tri (coplanar = touching, by policy)
+ median-split world-space BVH per part, pure f64, no transcendentals;
GEO-003 upgraded to BVH-CONFIRMED mesh intersection (hrx7 53 AABB
candidates → 41 confirmed, 12 false positives silenced). **GEO-008**
(provisional): the validator ticks the model's real driver and sweeps 8
sampled frames — hrx7 shows **2 genuine motion-only contacts** (thigh
shells × pelvis at gait extremes), invisible at rest; whole sweep 127 ms;
cross-target report equality holds. **SIM-004:** inline-sim vs
equipped-catalog drift (deduped) — flagged vx2-proof's inline kv 1750 vs
the cited 1900; reconciled, and the equipped datasheet now flows into the
physics: **TWR 4.70→5.32, hover 43 %→39 %**; regression test pins both
directions. **Share URLs:** contract → deflate-raw → base64url fragment
(`share.ts`); opening re-validates/re-bakes locally (never trusted);
browser-verified round trip (hrx7 = 5.5 kB fragment boots a fresh page).
**Gamepad:** stick polling with deadzone in the drive loop (left =
strafe/forward, right = yaw/throttle); sliders remain fallback. **Patch
consequence diff:** Δ AUW/TWR/hover line after every configurator patch
(D5). **Bundle split:** three+n8ao chunk; app js 78 kB gz, warning gone.
**Workflows:** `nightly.yml` (parity gallery on headless chromium +
cargo-llvm-cov coverage, artifacts uploaded) and `release.yml` (tag v* →
static validator binary + wasm facade package). **Incremental re-bake:**
`bake_incremental` reuses untouched (geom, pose) buffers — a color patch
re-bakes zero geometry; budgets re-measured and hold. Verified: 106 Rust
tests, clippy --all-targets -D clean, golden + report equality, verdict
matrix (5), gateway 7/7, builds green, wasm-pkg rebuilt (320 KB gz).
**Changed:** `crates/forge-geometry/src/{collide.rs (new), lib.rs}`,
`crates/forge-validate/src/{lib.rs (GEO-003/008, SIM-004), file_catalog.rs}`,
`crates/forge-contract/src/lib.rs` (RowSummary on CatalogSource),
`crates/forge-wasm/src/lib.rs` (incremental patch), catalog battery row
(+capacityMah, cited), `examples/vx2-proof.forge.json` (kv reconciled),
`packages/studio/{src/share.ts (new), src/App.tsx, src/store.ts,
vite.config.ts}`, `.github/workflows/{nightly.yml, release.yml}` (new),
`tests/proof_pair.rs` (SIM-004), docs (TODO §5 batch, harness GEO note).
**Decisions:** none new (GEO-008/SIM-004 are provisional check ids per the
harness doc's convention).
**Next:** P3's data-layer remainder (Postgres runner, ETL pipeline, XC-17
export filter, D12 SKUs). *(Addendum, same session: the proptest item also
closed — see the follow-up commit; the batch is 10/10.)*
**Blockers:** none.

## 2026-06-12 — Pre-P0 closed: licensing (D24), hygiene, the name is ForgedTTC (D23)
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** Pre-P0 · **TODO items:** PRE-003 [x], PRE-004 [x], PRE-005 [x]
**Done:** Owner-delegated business calls executed and recorded. **D23 — the
product name is ForgedTTC** (resolves OD-01/PRE-005): living docs, UI title
("ForgedTTC STUDIO"), page title, NOTICE updated; `forge-*`/`@forge/*` code
namespaces deliberately stay (internal prefixes — renaming churns every
crate/import for zero user value); frozen papers keep the historical FORGE
codename; trademark scan recorded as the owner's pre-P4 action.
**D24 — license mechanics** (implements D2, © RNT56): root `LICENSE` states
the open-core split — Apache-2.0 zone = `crates/` (all forge-* crates incl.
the wasm facade and forge-gen: everything published must be usable),
`schema/`, `examples/` (fixtures travel with the validator); everything else
(studio, gateway, workers, prototype, catalog, docs, infra, scripts)
proprietary, all rights reserved; `LICENSES/Apache-2.0.txt` is the canonical
apache.org text (11,358 bytes); `NOTICE` per Apache convention; zone-2
package.json marked "SEE LICENSE IN"; the cargo workspace already declared
Apache-2.0 (the wasm-pack missing-LICENSE warning resolves). Contribution
terms stated in LICENSE. **PRE-004:** `.editorconfig` (LF/utf-8, 2-space,
rust 4, tabs for Make) + `.gitignore` extended (env/secrets, coverage,
logs). **Branch protection on `main` is the one remaining owner click**
(GitHub → Settings → Branches; no API surface in this session's toolset).
Pre-P0 phase → ● in ROADMAP.
**Changed:** `LICENSE`, `LICENSES/Apache-2.0.txt`, `NOTICE`, `.editorconfig`,
`.gitignore`, `package.json` ×3 (license fields), `CLAUDE.md` §1,
`docs/{DECISIONS.md (D23, D24), GLOSSARY.md, TODO.md, ROADMAP.md}`,
`packages/studio/{src/App.tsx, index.html}` (ForgedTTC title).
**Decisions:** D23 (name), D24 (license mechanics).
**Next:** owner clicks branch protection; then the standing P3 queue
(Postgres runner, ETL pipeline, license-export filter XC-17, D12 SKUs).
**Blockers:** none.

## 2026-06-12 — P3-007 proof pair: cited catalog rows, file-backed resolution, dims within 1 %
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P3 · **TODO items:** P3-007 [x], P3-004 [~ format], P3-001 [~ DDL]
**Done:** The proof pair is real and gated. **Rows:** EMAX ECO II 2207 1900KV
(31.5 g w/o wire · Ø27.45×32.6 mm · 16×16 M3 · M5 shaft · 3–6S · 40.6 A ·
2020 g max thrust @ 5×4.6/25.2 V) and CNHL Black Series 4S 1500 mAh 100C
(183 g · 75×35×37 mm · 14.8–16.8 V window · 150 A = 100C×1.5 Ah · XT60) as
`catalog/components/*.json` with **per-field citations** (value-as-printed,
source URLs, accessed date, derivation/discrepancy notes — incl. the
31.5-vs-33.5 g with/without-wire discrepancy). **Provenance stated honestly:**
this environment's egress allowlist blocks direct datasheet fetch (every
storefront/manufacturer/archive fetch 403s; only package registries pass),
so values are transcribed from search-result quotations of the cited pages —
rows carry confidence 0.7 + a mandatory review note (P3-004 review-queue
semantics, loader-enforced: confidence < 1 without a review note is a load
error). **Plumbing:** `FileCatalog` (native-only `CatalogSource` +
`RevisionSource` over `catalog/components/`), CLI `--catalog <dir>`.
**Proof body:** `examples/vx2-proof.forge.json` — VX-2 Mini with
rotors+battery slots as semver refs and a pinned lockfile: **Admitted with
the catalog, CTR-006-rejected without it**; the verdict matrix now runs with
`--catalog` (5 contracts green). **Exit-criterion evidence**
(`tests/proof_pair.rs`): baked AABB within 1 % of cited dims (cylinder/box
from the row envelopes; masses carried from datasheets, never derived from
the primitive approximation), resolver pins both refs, CAT engine finds the
pair compatible (4S window ⊂ 3–6S rating), citation+review enforcement over
every row. ROADMAP P3 → ◑ with the dims criterion checked (owner
verification of citations noted).
**Changed:** `catalog/{README.md, components/*.json}` (new),
`crates/forge-validate/{src/file_catalog.rs (new), src/lib.rs, src/main.rs
(--catalog), tests/proof_pair.rs (new)}`, `examples/{vx2-proof.forge.json
(new), expected-verdicts.json, README.md}`, `scripts/validate-all.mjs`
(runs with the catalog), docs (TODO P3-001/004/007, ROADMAP).
**Decisions:** none (the review-queue gate at confidence < 1 implements
P3-004's stated semantics).
**Next:** P3-008 reference rigs (SKU selection — owner sign-off needed for
D12), P3-001 migration runner against a live Postgres, P3-004 fetch→extract
pipeline (needs API keys + unblocked egress), license-export filter (XC-17).
Owner items: verify the two rows against their citations; prototype-final
tag; P0-007 build question; PRE-003/004/005; mid-hardware fps reading.
**Blockers:** direct datasheet fetch blocked by the environment's egress
policy — recorded on the rows themselves, not worked around.

## 2026-06-12 — P3 core logic: compat rule engine, lockfile resolver, connector taxonomy
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P3 · **TODO items:** P3-002 [x], P3-003 [x], P3-006 [x]
**Done:** The data-layer-independent half of P3. **P3-003 compatibility rule
engine** in `forge-validate::compat` — CORE-side, correcting the component-db
doc's gateway *(proposed)* placement per D16 (gateway/studio consume the same
bits via the facade): CAT-001 mount-pattern equality, CAT-002 voltage-window
intersection, CAT-003 current budget ×1.2, CAT-004 prop tip clearance (v0
spacing form; BVH sweep = XC-09), CAT-005 TWR floors per preset (thrust/AUW
supplied by the caller — never invented), CAT-006 connector matching. Every
violation carries an explanation string (the reason a configurator card
greys); fixture-tested rule by rule, with undeclared-field semantics explicit
(skip when unverifiable, warn when one side declares). **P3-006 lockfile
resolver** in `forge-contract` — `semver` module (exact/^/~, ~120 lines, no
new dependency), `pin_refs` (pin STABILITY: existing pins survive catalog
updates; yanked revisions verify-but-never-freshly-resolve), and
`upgrade_lockfile` (the explicit mover, returning diffs for LIF-001
re-validation + consequence diffs); tested incl. yanked and
unsatisfiable-range reasons. **P3-002 connector taxonomy seed**
(`infra/migrations/0002_connector_taxonomy.sql`): stack 30.5/25.5/20,
motor 16/19/12 bases, prop M5/T-mount, XT60/XT30/JST-PH-2, UART/I2C —
published ecosystem standards; component rows still cite their own
datasheets (D10). Check catalog gains the CAT block
(validation-harness.md). Drive-by: clippy now clean under `--all-targets`
(test-target lints incl. a TAU literal in forge-num's test). Verified: 100
Rust tests, golden + report equality, verdict matrix, wasm32.
**Changed:** `crates/forge-validate/src/{compat.rs (new), lib.rs}`,
`crates/forge-contract/{src/semver.rs (new), src/lib.rs (RevisionSource,
pin_refs, upgrade_lockfile), tests/lockfile_resolution.rs (new)}`,
`crates/forge-num/src/lib.rs` (test literal), `infra/migrations/0002…sql`
(new), docs (validation-harness CAT block, component-database placement +
status, TODO).
**Decisions:** compat engine placement = core (recorded in the system doc;
the prior gateway note was *(proposed)*-level).
**Next:** P3-007 proof pair — needs (a) a file-backed `RevisionSource` for
the CLI so admitted contracts can pin against seed rows pre-Postgres, and
(b) real 2207-motor + 4S-1500 datasheets with per-field citations (web
research); then P3-001 migration runner + P3-004 ETL worker skeleton.
**Blockers:** none.

## 2026-06-12 — P2 closed: verdict matrix in CI, draft semantics, OD-08 → D22
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P2 · **TODO items:** P2-006 [x], P2-007 [x], P2-002 [~], P2-003 (biped ✓)
**Done:** **P2's four exit criteria are all checked — phase closed.**
P2-006: `examples/expected-verdicts.json` declares verdict + the exact ERROR
check-id set for every first-party contract; `scripts/validate-all.mjs`
enforces it in CI (undeclared contracts and stale expectations fail) —
hrx7/vx2-hornet pinned as rejected with exactly CTR-004, vx2-mini/qd-mini
admitted clean. P2-007/OD-08 resolved by measurement and recorded as **D22**:
gateway binary-spawn p50 5.3 ms (16 parts) / 17.8 ms (125 parts) vs
in-process WASM 0.7 / 3.7 ms (`scripts/od08-measure.mjs`) — spawn stays
(isolation + bit-equality with CI, far inside budget); napi-rs deferred
until a measured hot path demands it. P2-002 (D14) validation semantics
live end to end: CLI `--as-draft` → gateway `asDraft` flag → HTTP 200 with
`verdict: draft` and full diagnostics (a draft is a successful save, not a
422); gateway test added (7/7). Draft PERSISTENCE deferred to the data
layer (P3-001) — recorded honestly, not faked with a file store.
**Changed:** `examples/expected-verdicts.json` (new),
`scripts/{validate-all.mjs,od08-measure.mjs}` (new), `.github/workflows/ci.yml`
(P2-006 step), `packages/gateway/{src/server.ts,src/validator.ts,
test/server.test.ts}`, docs (DECISIONS **D22**, TODO P2 section + P2-003
biped tick, ROADMAP P2 criteria + phase table: **P2 ●**, P1 ◑ 5/6).
**Decisions:** **D22** (OD-08 closed: binary-spawn stays, numbers recorded).
**Next:** P1's last open criterion is a real-mid-hardware 60 fps run (owner
can read the perf overlay); then P3 — component DB schema (P3-001 Postgres
DDL), which also unblocks P2-002's persistence half. Owner items still open:
prototype-final tag push (P0-010), configurator-build question (P0-007),
PRE-003/004/005.
**Blockers:** none.

## 2026-06-12 — P1-016 closed: N8AO + the XC-22 quality ladder
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-016 [x]
**Done:** Shaded rendering now goes through EffectComposer (Render → N8AO →
Output; blueprint keeps its dedicated pass; AO is meaningless on a technical
drawing). `n8ao` is the only new dependency — the package the plan names at
XC-22; three's own composer avoids pmndrs postprocessing. Tiers: high /
medium (½-res AO) / low (AO off) over pixel ratio, selectable in the panel;
the **degradation ladder v0** steps the tier DOWN on sustained < 45 fps for
3 s and never up (raising is manual). Parity gallery pins tier=low for
deterministic structural captures — re-ran green (F1 0.957–0.995, precision
≈ 1.000). Measured on the SwiftShader software floor: high 2.6 ms render /
25 draws (AO's internal passes), low 0.6 ms / 8 draws — the ≤ 6 ms render
budget holds with AO on even WITHOUT a GPU. Headless screenshot verifies
contact shading. All gates green (gateway 6/6, builds, gallery).
**Changed:** `packages/studio/src/{scene.ts (composer + setTier), App.tsx
(tier select + auto-degrader), store.ts (tier), n8ao.d.ts (decl shim)}`,
`packages/studio/package.json` (+n8ao), `scripts/parity-gallery.mjs`
(tier=low pin), docs (TODO P1-016, render-engine §4).
**Decisions:** none (N8AO was plan-named; the three-composer-over-pmndrs
choice is implementation detail recorded here).
**Next:** P2 remainder — P2-002 draft semantics, P2-006 CI on all
first-party contracts, OD-08 napi-rs vs binary-spawn measurement, npm/crates
publication plumbing (P2-001).
**Blockers:** none.

## 2026-06-12 — Studio P1 finishers: BatchedMesh, blueprint post pass, outline, jog, configurator
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-008 [x], P1-010 [x], P1-012 [x], P1-013 [x], P1-014 [~ mechanics], P1-017 [~]
**Done:** The render layer is rebuilt around **one BatchedMesh per material
class** (per-instance color + matrix, batchId raycast picking, merged
single-LineSegments leaders, camera near 0.01 for depth precision): hrx7
draws in **8 calls shaded / 9 blueprint / 9 exploded** vs ~260 before; the
≤ 40 budget is now gated inside the parity gallery (which re-ran with
IDENTICAL edge-F1s 0.95–0.995 at 3 draws/scene — the batch refactor is
pixel-equivalent). **Blueprint post pass** (P1-010): view-normal + depth RT →
full-screen discontinuity shader over the flat pass; the 125 per-part
EdgesGeometry objects are deleted; verified by headless screenshot.
**Selection outline** (P1-012): inverted hull (back-face shell inflated along
normals, rim distance-scaled ~2 px) — chosen over stencil for 1 draw call,
no postprocess dep, depth-correct occlusion; first attempt via
MeshBasicMaterial onBeforeCompile silently failed (no objectNormal in
unlit shaders) — replaced with an explicit ShaderMaterial. **Jog + pause +
frame-step** (P1-013 close): `CoreSession.set_jog` applies per-node euler
over the pose layers (the monolith's `nodes[k].rot += jog[k]`), zeros clear;
test proves jog moves the head and clearing restores the bit-identical
stream; studio drags the selected node (orbit suspended during the drag),
pause freezes the drive clock, step advances exactly 1/120 s.
**Configurator mechanics** (P1-014): the selection pane patches
color/material through the live CoreBake handle — JSON-Patch → re-bake in
place; the validator re-judges every patched document; explode/camera/
drive/jog/selection survive (browser-verified: head visor patched to
#39c8ff, material to gloss, verdict honestly stays REJECTED on the
historical hrx7). Variant cards stay gated on slots (P0-007/P3).
**Perf overlay** (P1-017): fps + render ms + draw calls + core-tick ms with
honest multi-pass accounting (`info.autoReset` off); SwiftShader software
floor: render 0.5 ms · core ≤ 0.05 ms · 9 draws — ROADMAP frame-budget
criterion annotated, "shimmer gone" checked (no painter sort exists to
flicker; z-buffer + near-plane fix; gallery is the record). Verified: 89
Rust tests, clippy -D clean, golden + report equality, budgets, gateway 6/6,
gallery green with draw-call gate, wasm-pkg rebuilt (301 KB gz).
**Changed:** `packages/studio/src/{scene.ts (rewrite), App.tsx (rewrite),
store.ts, wasm.ts, materials.ts}`, `crates/forge-wasm/src/{session.rs (jog),
lib.rs (set_jog/clear_jog)}`, `crates/forge-motion/src/quadruped.rs (body
getter)`, `scripts/parity-gallery.mjs` (stats + ≤ 40 gate), wasm-pkg,
`docs/assets/parity/` (refreshed with draw-call metrics), docs (TODO,
ROADMAP, render-engine).
**Decisions:** outline = inverted hull, not stencil (recorded at P1-012 —
implementation-level, system doc updated); jog scope = posed driver paths.
**Next:** P1-016 N8AO + quality tiers (the last open studio finisher), then
P2 remainder (P2-002 drafts, P2-006 CI on all first-party contracts, OD-08
napi-rs measurement).
**Blockers:** none.

## 2026-06-12 — P1-013 (follow half): drive-mode follow camera through the boundary
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-013 [~] (follow camera ✓; jog + pause/frame-step remain)
**Done:** `CoreSession::focus()` (driver body at natural viewing height —
biped/fpv use the ported drvFocus, rover/quadruped their body pose) exported
through the wasm `Session`; the studio's drive loop eases orbit target AND
eye toward it at the monolith's smoothing (min(1, dt·5)), preserving the
user's orbit offset. Verified: 88 tests, clippy clean, golden-compare green
(focus is not part of the hashed streams), budgets hold, builds green.
**Changed:** `crates/forge-wasm/src/{session.rs,lib.rs}`,
`crates/forge-motion/src/quadruped.rs` (body() getter),
`packages/studio/src/{scene.ts,wasm.ts,App.tsx}`, wasm-pkg rebuilt, TODO.
**Decisions:** none. **Next:** P1-014 configurator pane (CoreBake.patch
ready), P1-008 BatchedMesh, P1-010/012 render finishers, P1-013 jog half.
**Blockers:** none.

## 2026-06-12 — P1-005 closed: typed facade boundary, budgets gated; wasm validate trap found+fixed
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-005 [x]
**Done:** The zero-copy boundary is real. Facade grows a stateful `Bake`
handle — meta (counts/HUD/node_world/part table) crosses as JSON once;
positions/normals/indices cross as **typed-array views over wasm linear
memory** (consumed synchronously; the sanctioned `unsafe` per BEST-PRACTICES
§5 lives here with SAFETY notes); `Bake.patch` applies JSON-Patch and
re-bakes in place (the P1-014 configurator primitive); `Session.step` now
returns steps and `Session.pose_view` is the zero-copy per-frame pose read.
Studio: fetches CONTRACTS only and bakes+validates in-browser (demo
.bake/.report payloads deleted; `pnpm demo:sync` copies contracts; drag-drop
unchanged); scene consumes typed arrays without copies; drive loop reads
pose_view. **Budgets measured through the real path and CI-gated as stated —
no runner fudge** (`scripts/budgets.mjs`): hrx7 bake **2.0 ms** (≤ 60 ms,
was ~10 via JSON), patch→re-bake **2.8 ms** (≤ 10 ms, was ~10.8 — the JSON
mesh serialization WAS the budget), facade 298 KB gz (≤ 2 MB). Parity
gallery re-run on the new load path: identical F1s (0.95–0.995) — the
in-browser bake renders equivalently to the old prebaked payloads.
**Finding (D17): wasm `validate` had trapped (`unreachable`) on every
contract since its first build** — `std::time::{SystemTime,Instant}` panic
on wasm32-unknown-unknown, and NO gate exercised the path (gateway spawns
the native binary; the facade test runs the native rlib; the old studio
fetched prebaked reports). Fixed with a cfg'd `clock` module (js-sys
Date.now on wasm — report provenance only, judgment never reads it) and the
gate is closed: golden-compare now ALSO requires native↔wasm
**validator-report equality** (startedAt/durationMs/target normalized) on
all four canonical contracts, in CI.
**Changed:** `crates/forge-wasm/src/lib.rs` (Bake handle, pose_view, bake_meta_json
+ native test), `crates/forge-validate/{src/lib.rs (clock), Cargo.toml (js-sys
wasm-only)}`, `packages/studio/src/{wasm.ts (CoreBake, artifactFrom, poseView),
types.ts (typed mesh), scene.ts (typed attrs), App.tsx (in-browser demo bake)}`,
`packages/studio/public/demo/` (payloads pruned), `scripts/{budgets.mjs (new),
golden-compare.mjs (report leg), parity-gallery.mjs (contract check)}`,
`.github/workflows/ci.yml` (budgets step), root `package.json`
(demo:sync replaces bake:demo), wasm-pkg rebuilt (298 KB gz), docs (TODO,
ROADMAP P1 budgets criterion, core-runtime §3).
**Decisions:** none (unsafe-in-facade was already sanctioned *(proposed)* in
BEST-PRACTICES §5; this makes it real with the documented discipline).
**Next:** studio P1 finishers — P1-008 BatchedMesh, P1-010 blueprint post
pass, P1-012 stencil outline, P1-013 jog/follow camera, P1-014 configurator
pane (CoreBake.patch is ready for it); P1-016/017.
**Blockers:** none.

## 2026-06-12 — P1-015 closed: golden-scene parity gallery, monolith vs studio
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-015 [x]
**Done:** `pnpm parity` (`scripts/parity-gallery.mjs`) renders the SAME models
under the SAME six canonical cameras (hrx7 + vx2-hornet × three-quarter/
profile/high-rear, monolith FOV 2·atan(0.3443) ≈ 38°) in two renderers — the
frozen monolith (served as a bridged in-memory copy because its IIFE hides
state; pinned: auto-rotate off, clock frozen, pose overridden to pure rest,
grid/marker/blob-shadow/gizmo/vignette suppressed) and the built studio
(`window.__forgeParity` hook: load model, pin camera orbit+FOV, grid/shadows
off) — in headless chromium on SwiftShader (the env pre-provisions build 1194
under /opt/pw-browsers; the script falls back to playwright's resolution
elsewhere). Structural metric: Sobel edge maps of downscaled luminance,
binarized top-8 %, F1 with 1-px dilation tolerance. **Measured 0.95–0.995 on
all six scenes; gate 0.85** (observed failure modes — overlaid UI chrome,
background vignette banding, studio ground shadow — scored ≤ 0.4 before they
were eliminated, so the gate separates regimes with wide margin). Luminance
RMS reported as informational (PBR vs painter shading differs by design).
Composites + metrics committed as evidence (`docs/assets/parity/`, ~128 KB);
full gallery regenerates into `artifacts/parity/` (now gitignored). CI
integration deliberately deferred (fresh-chromium flake risk) — recorded in
TODO. ROADMAP P1 "parity gallery" criterion checked.
**Changed:** `scripts/parity-gallery.mjs` (new), `packages/studio/src/{scene.ts
(setCameraPose/setGridVisible/setShadowsVisible), App.tsx (__forgeParity hook)}`,
root `package.json` (parity script; playwright-core+pngjs devDeps — playwright
moved out of the studio package), `.gitignore` (artifacts/),
`docs/assets/parity/*` (new evidence), docs (TODO P1-015, ROADMAP P1,
render-engine §7/§9).
**Decisions:** none (RND-001's open question — screenshots vs re-render —
resolved operationally: the frozen monolith renders itself live, read-only).
**Next:** studio P1 finishers — P1-008 BatchedMesh, P1-010 blueprint post
pass, P1-012 stencil outline, P1-013 jog/follow camera (drivers expose
`focus()`), P1-005 zero-copy views + bake/patch timing; then P1-016/017.
**Blockers:** none.

## 2026-06-12 — P1-001 closed: biped + FPV oracle drivers ported, tape parity at ULP level
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-001 [x]
**Done:** Line-faithful Rust ports of the monolith's two drive pipelines.
`forge-motion/src/biped.rs` (HRX-7: idle breathing/scan/sway, arrive
controller, heading spring, speed ramp, blended phase gait with the monolith's
legIK variant, world placement, head-scan detents, ω16/ζ0.8 servo settle on
head+arms, actuator telltales) and `fpv.rs` (VX-2: hover-drift idle,
drag-limited velocity flight in the bounded arena, tilt servos, per-motor RPM
mixer with alternating spin, ω14/ζ0.85 camera servo). Expression groupings
mirror the JS so FP op order is identical; all transcendentals via forge-num
(D17), which grew `hypot` + `js_round` (JS Math.round tie semantics,
double-rounding safe). **Tape parity measured: max deviation 4.4e-16 (biped)
and 7.1e-15 (fpv)** against `prototype/trajectories/` over 300 frames × all
rot/off channels (`tests/tape_parity.rs`, banded 1e-9, bit-deterministic
replays; tape pos channels == contract skeleton exactly). Session wiring:
`node_world_posed` in forge-geometry implements nm() faithfully — skeleton
`rot` is BASE euler, driver channels ADD to it (hips/shoulders carry base
splay; replacing instead of adding would silently flatten it). `CoreSession`
drives multirotor (pitch/roll/yaw/throttle sticks) and biped
(drive/roll/turn) through the oracle ports with full pose channels; golden
tick corpus re-pinned for vx2-mini/hrx7/vx2-hornet (qd + ALL bake hashes
unchanged; native↔WASM stayed bit-identical on first post-rewire comparison —
forge-num doing its job). BEH-001 biped smoke (2 s walk ≈ 1.49 m) replaces the
"lands P2" warn; hrx7 report now 1 error (CTR-004, historical) + 53 GEO-003
warns. wasm-pkg rebuilt (293 KB gz ≤ 2 MB). Earlier in session: fixed CI
golden-compare path bug (`join(cwd, abs)` → `resolve`) that failed all three
prior runs in the XT-001 step. Verified: 87 Rust tests, clippy -D clean,
wasm32 cross-compiles, studio+gateway build, gateway 6/6, tapes re-record
byte-identical, golden-compare green fresh + committed.
**Changed:** `crates/forge-motion/{src/biped.rs,src/fpv.rs,src/lib.rs,tests/tape_parity.rs}`,
`crates/forge-num/src/lib.rs`, `crates/forge-geometry/src/lib.rs` (node_world_posed),
`crates/forge-wasm/{src/session.rs,tests/fixtures/golden.jsonl}`,
`crates/forge-validate/src/lib.rs` (BEH-001 biped arm),
`packages/studio/src/wasm-pkg/` (rebuilt), `scripts/golden-compare.mjs`,
docs (TODO P1-001, motion-engine, core-runtime §5, examples/README).
**Decisions:** none (golden re-pin is the documented intended-bump path, not a
new decision).
**Next:** P1-015 golden-scene parity gallery vs the monolith (canonical
cameras, perceptual diff), then the studio P1 finishers (P1-008 BatchedMesh,
P1-010 blueprint post pass, P1-012 stencil outline, P1-013 jog/follow camera —
`focus()` is exposed on both drivers for it).
**Blockers:** none. (Owner actions still open: push `prototype-final` tag
(P0-010), the later configurator build question (P0-007), PRE-003/004/005.)

## 2026-06-12 — Golden numbers live: native↔WASM bit-identical; D17 divergence found+fixed
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P1 · **TODO items:** P1-006 [x], P1-007 [x], XC-26 [x], P1-001 (oracle ready)
**Done:** **XT-001 is real and green.** Golden-number suite: FNV-1a hashing of
exact f32 bit patterns inside the core (bake buffers + 600-step scripted tick
streams, four canonical scenes); `forge-golden` native binary vs the WASM
facade in Node, byte-identical required; hashes also pinned in time as a
fixture test. **First run caught a genuine D17 violation** — hrx7/vx2-hornet
bake hashes differed native↔wasm (platform libm vs Rust wasm libm, ULP drift
on lathe angles + pose rotations). Fix: new **`forge-num`** crate routes all
core transcendentals through pure-Rust `libm` (identical bits on every
target); sqrt/arithmetic stay std. After the sweep all four scenes are
bit-identical across targets → **P1-007 met** (binary↔WASM bit-identical on
both translated contracts). Also rebuilt the stale committed wasm-pkg (it
predated the polymesh rework); CI now builds a fresh facade, runs
golden-compare, and fails on committed-pkg staleness. **Oracle axis:**
deterministic motion tapes recorded from the monolith's own drv/pose/post
pipeline (`prototype/trajectories/`, 300 frames × 9 ch/node; hrx7 walks
2.35 m — translation lives in root.off; fpv climbs/banks with spinner
history); CI re-records and fails on drift.
**Changed:** `crates/forge-num` (new), transcendental sweep across
geometry/motion/sim, forge-wasm (golden module + bin + export),
`scripts/{golden-compare,extract-trajectories}.mjs`, tapes, pinned
`golden.jsonl`, CI gates, wasm-pkg rebuild, docs state.
**Decisions:** forge-num/libm adopted as the execution of D17's no-fast-math
policy (core-runtime §5; no new D-number — it implements D17).
**Next:** port the biped + FPV drivers against the trajectory tapes (P1-001
finish) — tolerance-banded vs the JS oracle, bit-exact across our targets;
then the parity gallery (P1-015) and BatchedMesh/blueprint finishers.
**Blockers:** none.

## 2026-06-12 — P0 closed (vintage scope): byte-equivalent translations of both models
**Session:** Claude agent · branch `claude/beautiful-edison-fx5qnz` · **Phase:** P0 · **TODO items:** P0-004 [x], P0-005 [x], P0-006 [x], P1-002 (reconciliation)
**Done:** **Byte-equivalence MET on first comparison** — hrx7 `125 parts · 2195
faces · 2581 vertices`, vx2-hornet `73 · 924 · 1250`, exact against the monolith
extraction, now CI-guarded (extraction drift + translation drift + compare).
How: (1) PRE-002 reconciliation of forge-geometry — line-by-line ports of the
monolith's taper/box/cbox/cyl/lathe as shared-vertex polygon meshes
(origin-centered), part pose T·Ry·Rx·Rz·S, node composition T·Ry·Rx·Rz, the
centroid outward-orientation rule, and the monolith's TAU literal (kept under a
justified clippy allow — position-level golden numbers depend on it); GPU
buffers via fan triangulation at bake; counts now expose polygons + poly-verts
(oracle quantities) alongside render triangles. (2) **Mechanical translation**:
`scripts/translate-monolith.mjs` instruments the monolith's own N()/P() calls
in a vm sandbox and emits `examples/{hrx7,vx2-hornet}.forge.json` — zero hand
transcription; semantic rules (material mapping, collision none pre-D7,
spinner/hip/knee joints, combat naming dropped §17.2) documented in the script.
Contract gained `Part.pose` and chain explode fields (prototype reconciliation);
schema/codegen/goldens/demo artifacts regenerated; vx2-mini + qd-mini re-posed
for centered solids; both translations joined the studio picker. **Findings:**
both translations fail CTR-004 (explode coverage 69 %/42 % vs the later 80 %
gate) — historical models predate the completeness gates; gates unchanged.
hrx7 AUW reads 93 kg from class densities (no masses in the vintage — doctrine
holds: computed, not invented; real masses arrive with sourcing).
**Changed:** crates (contract pose/chains, geometry polymesh+primitives rework,
validate/wasm counts, sim export origins, gen poses), scripts (translate,
extract --out arg), examples (2 new + 2 re-posed), studio (picker, report
truncation), CI (equivalence guard), goldens, schema, codegen, docs state.
**Decisions:** none new (all within PRE-002 reconciliation scope under D21).
**Next:** extend extraction to record gait/flight trajectories → golden-number
corpus (P1-006/XC-26) → bit-identical native↔WASM verification (P1-007). P0 is
now ● for the delivered vintage (P0-007 variants still gated; remote tag still
an owner push).
**Blockers:** none.

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
**Blockers:** none critical. Two owner items: (1) the remote tag — the git proxy
rejects tag pushes (403), so `prototype-final` exists locally only; push it from
any clone or create a Release on `0294a9d`. (2) Open question: does the later
~83 KB configurator monolith (31 variants/11 slots/harness) exist?

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
