# EXECUTION ROADMAP - complete program from recovery to field proof

Last rebuilt: **2026-07-18**

Evidence baseline: [`PROJECT-STATE.md`](PROJECT-STATE.md)

Vision and phase contract: [`FORGE-plan.md`](FORGE-plan.md)
Atomic work ledger: [`TODO.md`](TODO.md)
Operations contract: [`OPERATIONS.md`](OPERATIONS.md)

This document is the master execution overlay. It does not redefine product vision
or duplicate implementation specifications. It orders all remaining phase,
stabilization, governance, security, quality, operations, documentation, and external
proof work into dependency-complete waves and workstreams.

## 1. Program outcomes

The program is complete only when all four outcomes are independently true:

1. **Trusted build-verification product (R1).** A real builder can configure a robot
   from reviewed parts, understand every rejection, validate it, share it, and leave
   with lawful build artifacts and purchasable handoffs.
2. **Simulation-ready standard (R2).** External robots enter through the contract,
   compile to verified artifacts, run in engine-backed simulation, and can train a
   reproducible policy with an honest scorecard.
3. **Controlled autonomy loop (R3).** A policy moves from SITL to controlled hardware,
   Desktop records the field session, system ID tightens the twin, and ghost/repair
   evidence is useful under the D30/D12 safety boundary.
4. **Evidence platform (R4).** External users publish models/courses/skills, verified
   activity accumulates, provider handoffs work, moderation operates, and field
   history improves designs without weakening ownership or safety.

## 2. Current boundary

The broad v0 and most deterministic fixture contracts exist. G0 and G1 are green on
protected `main`: annotated validator v0.1.0 and its nine assets were produced by the
release workflow, downloaded after publication, and independently verified. SEC-006
contract/fixture acceptance is protected on `main` through PR #31 with exact
post-merge CI/security proof. Native Anthropic ETL and queued vendor normalization
exist at contract/fixture maturity through PRs #33/#34; docs-only evidence PR #35 is
green at `4fe0df6`. QA-008 golden review is protected through PR #36 at `2589503`.
QA-002 deterministic builder acceptance is protected through PR #38 at `c80accb`.
QA-010 external-acceptance governance is protected through PR #40 at `8708de7`.
QA-003 deterministic supported-browser/accessibility acceptance is protected through
PR #42 at `9c1802b`: Chromium uses full WebGL, while Firefox/WebKit draw the
core-baked Canvas2D schematic without loading scene/Three.js chunks. Exact PR and
post-merge CI/security plus the clean merge artifact are green.
QA-004 deterministic migration acceptance is protected through PR #44 at `e362c54`:
D37's transactional checksum/gap-refusing runner, all 19 then-current populated
predecessors, failure recovery, concurrency, and the database runbook have exact PR
and post-merge proof. QA-005 deterministic fault acceptance is protected through PR
#46 at `7970005`: D38/migration 0021 lease-fenced attempts, bounded retry/
cancellation/timeout behavior, staged exact-checksum uploads, and the clean 21-
migration plus 20-predecessor matrix have exact PR and post-merge CI/security and
revision-bound artifacts. QA-007 is protected through PR #48 at `e89bb15`: its
eight-file/89-case adversarial inventory, Rust/Python consumers, and fifteenth golden
family passed exact PR CI/security and post-merge CI/security. Production backup/DR,
multi-replica queues, object-store operations, shared quotas, and SLOs remain
OPS-005/QA-009 and OPS-003..007.
OPS-001 is complete at protected D68 contract/fixture maturity through PR #123/
`401dac84` and evidence PR #124/`f68314d`; final post-merge CI/security
`29635605328`/`29635605305` pass. OPS-002 is in progress on D69's compatibility-
governed hardened single-host runtime: exact image/tool pins, multi-stage targets,
staged `root:10999`/`0440` file secrets, non-root/read-only execution, TLS/private
networking, probes, finite resources, and CI SBOM/provenance/vulnerability/smoke
evidence are protected at contract/ephemeral-CI fixture maturity through PR #125 and
exact squash `290060d`. All 46 local gates pass. Final PR head `6818812` passes all
twelve checks in CI/security `29639349787`/`29639349785` and has the same tree as the
protected squash. Post-merge CI/security `29639595976`/`29639595950` pass; downloaded
protected artifact `8428228432` binds clean source, three application
builds/SBOMs/provenance records, zero fixed low-or-higher findings, and a green
ephemeral runtime smoke. Ruleset `18843164` requires the hardened job as its seventh
exact check. The dependency cannot close until a real immutable-registry managed-
sandbox install/upgrade/rollback/roll-forward is retained. No managed environment is
proven.
D70 makes immutable registry publication independently executable and reviewable:
the manual protected-main workflow publishes three build-once proprietary GHCR
objects by digest only, attaches registry provenance, then requires a separate raw-
manifest hash, exact signer/source/ref attestation verification, pull, scan, and D69
runtime smoke. The versioned publication record keeps all managed/live claims false.
The protected contract passes all 47 local gates under Python 3.12.13 with six D70
tests, 23 compatibility surfaces, nineteen golden families, 87 immutable Action
references, 255 worker tests,
and the unchanged 200/97/two-Pareto/two-held recovery batch. PR #128 corrected the
first run's OCI-index config-metadata defect at protected `f1d8850`; all local, PR,
and post-merge gates pass. Successful run `29644408106`, verified artifact
`8429638868`, and independently reproduced public manifest/attestation checks close
immutable publication only. The managed-sandbox install/upgrade/rollback/corrected-
forward half remains open.
D70 evidence reconciliation is protected through PR #129 exact head `3302103` and
squash `b5c358a`; all twelve PR checks and exact-squash post-merge CI/security
`29645096174`/`29645096195` pass. OPS-003 now has a dependency-safe protected D71 first
slice: a versioned exact event allowlist plus executable Gateway request/trace roots
and structured sink. All 48 required local gates pass under Python 3.12.13 with 24
compatibility surfaces, twenty golden families, 84 Gateway tests, 255 worker tests,
and the unchanged 200/97/two-Pareto/two-held recovery batch. It advances contract/
fixture maturity only. PR #130 exact head `f161221`, all twelve PR checks, tree-
identical protected squash `44bb3da`, and post-merge CI/security
`29646886572`/`29646886580` pass while OPS-002's
managed sandbox and every worker/job/provider/Desktop/backend/dashboard/alert/live
criterion remain open.
D71 evidence reconciliation is protected at `694ccc0` through PR #131; exact
post-merge security `29647532626` and CI `29647532654` pass. D72 is protected at
contract/fixture maturity: current major 2 retains v1 reads and adds trusted request-
to-job persistence, database-owned D38 attempt spans/outcomes, bounded worker
lifecycle lines, and owner export 1.7. All 48 local gates and the isolated 28-migration/
27-populated-predecessor/12-browser-flow database matrix pass. PR #135 exact head
`4bb4721`, all twelve required checks in CI `29859593049` and security `29859592862`,
tree-identical protected squash `a17ff74`, and post-merge CI/security
`29860284729`/`29860284861` pass. It cannot close provider/deployment/actor/Desktop
propagation, a backend, metrics/traces, dashboards, alerts, managed, live, or
production criteria.
D73 is protected at event-major-3 contract/fixture maturity through PR #140/
`90cc58c`; it retains frozen v1/v2 reads and adds only exact active-D68 deployment
correlation plus the already persisted Modal `train.policy` call ID on that job's
completion. Local/CI deployment, start events, other provider/job families,
actor/Desktop, and all unbounded labels remain refused. Exact head `283b43a`, all
twelve PR checks in CI `29868001992` and security `29868001971`, tree-identical
protected squash `90cc58c`, and post-merge CI/security `29868693418`/`29868693478`
pass. Provider delivery, deployment health, backends, dashboards, alerts, managed,
live, and production proof remain later acceptance lanes.
All 48 local gates and a disposable 28-migration/27-predecessor/12-browser-flow
database matrix pass, including the persisted Modal-call handoff and all 259 worker
tests. These results support only the protected repository contract/fixture boundary.
D74 is protected at contract/fixture maturity through PR #142/`7abcb56`. It
deliberately keeps event v3 frozen and creates a separate delivery-batch v1/lifecycle
surface plus an independent loopback-only fixture adapter. The protected slice
revalidates each 4 KiB line, buffers at most 32 events/135168 bytes in memory, uses one
credential-free POST with a two-second
ceiling, refuses remote/query/fragment/redirect/non-2xx/invalid/overflow paths, and
has no retry/spool/product-authority coupling. Focused observability, compatibility,
generated-document, golden-policy, and patch-hygiene gates pass, and the complete
48-gate repository matrix is green under Python 3.12.13 with 85 Gateway and all 259
worker tests. Exact head `c7b4035`, all twelve PR checks in CI `29872947817` and
security `29872947795`, tree-identical protected squash `7abcb56`, and post-merge
CI/security `29873512358`/`29873512339` pass. This advances no external collector,
managed custody, metrics/traces, dashboard, alert, managed, live, production, or
external-beta exit. Evidence PR #143 exact head `b23b3a9`, all twelve checks in CI
`29874518707` and security `29874518705`, tree-identical protected squash `0388cf6`,
and post-merge CI/security `29875062096`/`29875062119` reconcile that boundary.

D75 is protected as a dependency-safe repository contract/fixture slice. It
introduces an independent
signal-set v1 projection over one D74 batch: five fixed metric families with exact
generated route/task authority and finite labels, plus completion-trace sampling for
all failures, fixed slow thresholds, and a deterministic SHA-256 one-in-64 healthy
baseline. Starts are never trace spans; correlation/provider/deployment identifiers
remain forbidden as metric labels. The local projection is memory-only, stdout-only,
and capped at 64 metric series, 32 trace spans, and 262144 bytes. All 48 required
local gates pass under Python 3.12.13 with 20 observability tests, 26 compatibility
surfaces, 22 golden families, 39 Studio tests, 85 Gateway tests, all 259 workers, and
the unchanged deterministic recovery batch. PR #144 exact head `729aa6b` passed all
twelve checks in CI `29877152636` and security `29877152523`; tree-identical
protected squash `3899ce3` passed post-merge CI `29877635436` and security
`29877635422`. This slice does not advance
external collector/authentication, durable custody, a metric/trace backend,
dashboard, alert, managed, live, production, or
external-beta acceptance.
Evidence PR #145 exact head `f72a18f` passed all twelve checks in CI `29878662250`
and security `29878662212`; tree-identical protected squash `61b5233` passed post-
merge CI `29879631808` and security `29879631786`.

D76 is the active dependency-safe repository slice. It introduces an independent
custody-artifact v1 over one D75 signal set and a network-free filesystem fixture:
private root/file authority, exact object/record binding, fixed queries, 128-record
and 24-hour limits, bounded deletion receipts, and non-mutating integrity audit.
Focused policy, persistence, query, root/symlink, capacity, tamper/orphan, deletion,
retention, restart, and non-reflection tests pass. All 48 required local gates pass;
exact-head remote protection remains pending. This slice cannot advance authenticated transport, external collection,
managed custody, owner export, residency, HA, backup, a managed metric/trace backend,
dashboard, alert, managed, live, production, or external-beta acceptance.
No credentialed provider-sourced reviewed row or real vendor operation is proven. The
product dependency path continues Wave 2 with credentialed catalog acceptance and the
EXT-001 independent-builder path. QA-012's dependency-complete reliability lane is
closed through protected PR #50 at `6f8509b`: the isolation-aware, semantic-wrapper-
independent harness requires full-Studio Chromium/WebGL, records bounded diagnostics,
and binds both JSON artifacts to one clean exact revision. Exact branch nightly
`29370725355`, PR CI `29370722178`/security `29370722124`, post-merge CI
`29371177801`/security `29371177809`, and exact-main nightly `29372161650` are green;
the downloaded protected artifact passes all six scenes at unchanged thresholds.
Current G0 acceptance is restored without changing historical G1 evidence.
QA-010's eight-milestone evidence kit is complete; the actual EXT-001 run still
requires a qualified independent participant and frozen protected revision/
environment.

DOC-005 is closed through protected PR #53 at `22c263b`. Versioned generated API,
event, and artifact references now exact-match runtime routes and worker kinds;
migration/deprecation guidance, synthetic examples, and the registered schema
family share the drift gate. The closeout snapshot covered fourteen compatibility
domains; current protected `90b1691` covers fifteen. Exact-head PR CI
`29375146614`/security `29375146592` and post-merge CI `29376742319`/security
`29376742373` pass. DOC-006 closes the documentation-completion X-lane through
protected PR #58 at `3078dba`. The maintainer-curated first-good-issue workflow links
every entry surface and exercises the contract with bounded live issues #55-#57
without assigning security, credentials/providers, hardware, user data,
compatibility migrations, or golden/oracle authority to entry-level work. Exact head
`c83f036` passed CI `29379546230`/security `29379546201`; post-merge CI
`29380212006`/security `29380212007` pass. Evidence PR #59 exact head `47f4e3d`
passed CI `29380952442`/security `29380952454`, and protected `484aefa` passed
post-merge CI `29381316922`/security `29381316924`. No external contribution is
claimed.

PR #54's evidence closeout exposed a time-dependent GOV-003 maintenance prerequisite:
npm retired pnpm 10's audit endpoints. pnpm 11.13.0 restores the bulk-advisory
protocol and makes dependency lifecycle scripts version-exact and fail-closed.
Exact head `00ae9a0` passed CI `29378364147`/security `29378364143`, and protected
`41dee2d` passed post-merge CI `29378749550`/security `29378749542`; an audit
transport failure remains a failed control and is never waived as a clean result.

Current Wave 1/2 boundary:

- public support/security surfaces, ModelSpec 2.2, and SEC-001..006 are protected on
  `main` through PRs #30/#31 with exact local, Postgres, CI, security, dependency,
  SBOM, CodeQL, Desktop, and post-merge proof;
- native ETL and the idempotent transactional commerce queue are protected at
  contract/fixture maturity through PRs #33/#34, with evidence reconciled by PR #35;
- QA-008 machine-registers protected evidence artifacts and requires append-only
  review records for intentional re-pins through PR #36;
- QA-002 is closed at deterministic product-acceptance maturity: exact PR and
  post-merge evidence prove the production Studio bundle, real built WASM, downloaded
  validator, gateway, isolated Postgres, and all ten builder-loop flows through PR
  #38; this does not substitute for independent-user proof;
- QA-010 has a protected versioned registry, private run-pack generator, completed-manifest
  validator, milestone runbooks, and focused policy coverage across builder,
  photoscan, training, course, D30/D12 lab, print, marketplace, and maintenance. It
  is closed through PR #40 at `8708de7`; the kit never substitutes for an intended
  participant, real provider, controlled rig, or field event;
- QA-003 is closed at deterministic supported-browser maturity through PR #42:
  exact PR/post-merge evidence proves the real-WASM share/configurator journey across
  Chromium, Firefox, and WebKit, including semantic names, skip/focus behavior,
  keyboard orbit/equip/explode/blueprint, contrast, target size, responsive
  containment, reduced motion, positive drawing, and renderer/asset isolation. Full
  WebGL is Chromium-only; Apple/mobile devices, assistive technologies, external
  users, and field behavior retain separate gates;
- QA-004 is closed at deterministic isolated-Postgres maturity through PR #44:
  exact PR/post-merge evidence proves clean and every populated predecessor,
  preservation/idempotency, atomic recovery, history refusal, and concurrent
  apply-once behavior; production backups, restore drills, capacity, and measured
  RPO/RTO retain OPS-005/QA-009;
- QA-005 is closed at deterministic isolated-Postgres maturity through PR #46:
  exact PR/post-merge evidence proves current unexpired attempt authority, crash
  reclaim, bounded outage/rate retries, cancellation/stale-result refusal, one-winner
  materialization, staged-object refusal, and exact verified upload completion;
  multi-replica, deployed provider/object-store, incident, quota, dead-letter, and SLO
  evidence retains OPS/QA ownership;
- QA-007 is closed through protected PR #48: it registers the fifteenth golden family,
  keeps the 35-step gate count stable by extending `fuzz:contract:check`, and pins
  import/patch/EnvSpec/replay/provider/citation/export/hardware refusal behavior.
  Exact PR CI `29366837836`/security `29366838444` at `fb6eacc` and post-merge CI
  `29367356078`/security `29367355993` at `e89bb15` pass. Its fixture corpus is not a
  credentialed-provider, real-hardware, load, or field claim;
- QA-012 is closed through protected PR #50 at `6f8509b`: exact branch, PR,
  post-merge, and protected-main nightly evidence proves the isolation-aware,
  revision-bound full-WebGL parity contract across all six scenes. The QA-003
  Canvas2D viewer fallback remains intentional and separately accepted; no golden,
  threshold, browser support tier, or product maturity claim changed;
- DOC-005 is complete through protected PR #53 at `22c263b`: its 75 runtime routes,
  two event families, fourteen compatibility domains, and sixteen worker queue kinds
  exact-matched the generated references; current protected `d8afe7f` additively
  verifies 77 routes, two event families, sixteen compatibility surfaces, and
  seventeen worker families through the same drift gate. D50's recorder surface is
  protected through PR #87;
- DOC-006 is complete through implementation PR #58 at `3078dba` and evidence PR #59
  at `484aefa`: contributor discovery,
  maintainer-only curation, assignment/reassignment, sensitive-authority exclusions,
  seed issues, and all public/agent entry surfaces have exact PR/post-merge proof;
  open seed issues do not substitute for an external contributor outcome;
- P7-012's implementation is closed through PR #72/protected `8e094c0` and its
  retained evidence through PR #73/protected `6bfa60f`. D42's tensor-v2/bundle-v2/
  task-v3 semantics, exact tensor-v1 reads, frozen estimator-only distillation plus
  randomized-PPO recipe, and interruption/resume/tamper evidence are protected.
  Clean evidence under `docs/evidence/p7-012/` binds both passing tasks to the exact
  M2 Pro host, source, seeds, runtime, thresholds, task/config/model digests, retained
  bytes, recovery, and honest energy/cost nonclaims. D43 records CPU execution on a
  GPU-capable host rather than fabricating accelerator use. P7-014 is closed through
  PR #75/protected `90b1691`: D44's contract-derived rover/quadruped path, independent
  ground bundle/task/tensor v1 authority, four-task exact-source smoke, mechanical-
  work semantics, and fail-closed unsupported/browser boundary are protected;
- registry publication is explicitly deferred to owner-scoped credentials and is not
  required to claim the verified GitHub release;
- remaining security, operations, live-provider, external-user, and field work is
  still open.

No downstream phase may claim closure from G1 alone; each live/external/field gate
retains its own acceptance evidence.

## 3. Execution principles

- Fix evidence before status text; then update status text in the same change.
- Preserve validator strength. Generated contracts/templates must satisfy new checks.
- Keep fixture truth deterministic and keyless; add live paths without replacing the
  fixture oracle.
- Split work by contracts and files, not by vague phases.
- Generate API/event/artifact references from registered runtime and compatibility
  sources; a hand-maintained route table is not acceptance evidence.
- Every live integration has capability discovery, timeouts, rate limits, idempotency,
  cost bounds, structured errors, audit records, and recovery behavior.
- Every user/hardware action has authorization, consent, and fail-closed tests.
- Close one externally useful loop before expanding the next platform surface.
- Phase completion requires current evidence, not presence of routes or tables.

## 4. Definition of ready and done

### A task is ready when

- dependencies and owner/external inputs are named;
- the owning system document and decision boundary are known;
- acceptance tests and proof type are explicit;
- no overlapping active lane owns the same files/contracts;
- credentials, hardware, or spending authority are available when required.

### A task is done when

- implementation, failure handling, tests, docs, and changelog are complete;
- deterministic and live behavior are clearly distinguished;
- required local gates pass without hidden skips;
- required remote checks pass on the final tree;
- the appropriate proof artifact is stored and linked;
- TODO and phase status match the evidence.

## 5. Program gates

| Gate | Entry requirement | Exit evidence | Blocks |
|---|---|---|---|
| G0 Truthful green baseline | none | local full gate, PR CI, post-merge CI, nightly all green | every release/phase close |
| G1 Trusted-core release | G0 | protected main, versioned release, downloaded checksummed artifacts, install/version proof | public validator claim |
| G2 R1 external builder | G1 plus catalog/generation readiness | independent builder completes configure/validate/share/BOM flow | broad external beta |
| G3 Live compute sandbox | G0 plus provider credentials/budget | photoscan, training, sim, provider runs with observability and cost evidence | P5-P7 live claims |
| G4 Hardware lab | D30 accepted, D12 rig, local provider, physical supervisor | signed lab record, no-auto-arm proof, telemetry and recovery evidence | P8 close |
| G5 Policy sharing | dual-use/export-control signoff and policy-level signoff | documented accepted gate plus moderation process | skill marketplace |
| G6 Public platform | G2, privacy/deletion, moderation, operations | external model/course/print activity and support runbook | P10-P11 close |
| G7 Field loop | G4 plus retention/consent | Desktop log -> ghost -> system ID -> repair evidence | P12 close |

## 6. Dependency waves

### Wave 0 - recover truth and green state

Objective: make `main` trustworthy before new feature work.

Status (updated 2026-07-14): **Wave 0 and current G0 acceptance are closed.**
`REC-001..008`, `GOV-001..005`, and `QA-001` retain their completed evidence in
`PROJECT-STATE.md`. QA-012 diagnosed the later Canvas2D parity-harness regression,
restored the governed full-WebGL path without changing product fallback behavior,
and passed exact branch, PR, post-merge, and protected-main nightly proof through PR
#50 at `6f8509b`.

Work:

- `REC-001..008`: Clippy, generator/DfM, declared verdict, Brief-25 repair,
  Playwright/nightly, coverage, toolchain pinning, and status reconciliation.
- `GOV-001..005`: protect main, define required checks, enable security automation,
  fix known advisory, and harden workflow dependencies.
- `QA-001`: create a single documented full local gate that reproduces required CI.

Acceptance:

- `cargo fmt`, Clippy, full Rust tests, WASM cross-build, schema drift, golden numbers,
  declared verdicts, Brief-25, TypeScript build/tests, Postgres invariants, Python
  tests, Desktop tests, pilot docs, and diff checks pass;
- Brief-25 admits at least 20/25 without human repair;
- PR CI, post-merge CI, and nightly are green;
- main ruleset is active and references exact passing check names;
- the native Desktop shell compiles in its required macOS check;
- `PROJECT-STATE.md`, `ROADMAP.md`, and `TODO.md` match the final evidence.

### Wave 1 - package and prove the trusted core

Objective: turn the strongest asset into a consumable, supported release.

Status (2026-07-13): **G1 and protected v0.2 delivery complete.** Manual
protected-main run `29241883791`, annotated-tag run `29244972303`, the nine-asset
v0.1.0 GitHub Release, and independent aggregate/public-asset verification are green.
crates.io/npm publication is an explicit owner-credential deferral. Public support
surfaces and XC-28/SEC-001..005 reached protected `main` through PR #30 at `d34b6fd`.

Work:

- retain D32's honest closure of `P0-007` and the published `prototype-final`
  evidence (`P0-010`/`GOV-006`) as immutable release inputs;
- retain the published, independently installed validator baseline and explicit
  registry deferral (`P2-001`, `GOV-007..009`);
- retain the protected accurate public surfaces plus ModelSpec 2.2 and SEC-001..005;
  `GOV-010` remains in progress only for qualified confusing-similarity/common-law/
  class review;
- finish real-mid-hardware P1 budgets; retain XC-28 configurator truth at its
  protected v0.2 package boundary.

Acceptance:

- static validator artifacts for supported platforms and WASM package are reproducible;
- crate/npm publication or explicit deferral is recorded;
- downloaded artifacts match checksums and report the intended version;
- public README and repository metadata describe only proven capability;
- one clean external installation runs validation and produces the expected report.

### Wave 2 - close the R1 builder loop

Objective: prove the verify-first wedge with reviewed data and a real user.

Work:

- finish the credentialed catalog ETL sandbox through dedupe, immutable persistence,
  owner review, BOM/export use, and recovery (`P3-004`, `P4-016`); the native bounded
  transport contract is complete, but is not that acceptance evidence;
- consume the delivered XC-28 equipped semantics in live catalog/retrieval flows;
- retain the completed local license-export enforcement (`SEC-001`) and inspect its
  manifest/envelope proof against real OCCT artifacts in the provider sandbox;
- retain the completed prohibited-brief refusal/minimal-audit and SEC-006 application
  boundaries, then add production egress, shared quotas, log/secret drills, provider
  monitoring, and adversarial deployment evidence (`SEC-002`, `SEC-006`, `OPS-*`);
- retain the completed local owner-scoped export/primary deletion, append-only
  purpose/subject consent-withdrawal, and retention/legal-hold/tombstone/restore-
  suppression boundaries (`SEC-003..005`); production backup adapters, deletion
  receipts, sandbox restores, and measured RPO/RTO remain `OPS-005`;
- retain the deterministic sandbox handoff and locally completed single
  gateway-to-worker vendor-normalization path with its protected 20-migration proof;
  finish a credentialed, observable, recoverable vendor sandbox and purchasable BOM
  acceptance (`P11-005`);
- retain closed QA-002 as the deterministic regression gate on every required
  data-plane run;
- retain protected QA-003's three-engine accessibility/viewer-grade matrix without
  treating its Canvas2D fallback as full 3D, or WebKit/a narrow viewport as Apple-
  device, screen-reader, or mobile field proof;
- execute the protected QA-010 builder script for `EXT-001` with an independent
  participant who has no repository knowledge.

Acceptance:

- live-ingested rows cannot bypass citation, review, revision, and license gates;
- an admitted configuration produces lawful exports and a purchasable BOM;
- restricted geometry becomes the documented envelope/link-out representation;
- rejected prohibited briefs are safely logged without storing unnecessary content;
- an external builder completes the flow without repository knowledge.

### Wave 3 - close simulation, photoscan, and training truth

Objective: move R2 from adapter contracts to measured live compute.

Work:

- P5 live photoscan/COLMAP/cache/SLO (`P5-001`, `P5-002`, `P5-006`, `EXT-002`);
- retain protected P6-010 real Rapier/MuJoCo 3.9.0 evidence on every engine/exporter
  upgrade, and treat a broader diverse import corpus as adjacent product QA rather
  than reopening the completed phase exit;
- P7 real SB3/MuJoCo pipeline, offline learning, and MJX decision (`P7-003`,
  `P7-009`..`P7-014`, `EXT-003`); P7-003 is protected through PR #64/`d1c4c38`
  and P7-008 through PR #62/`1de7974`. P7-010's controlled CPU reference runner is
  protected through PR #66/`0614272`; clean artifact `8337556569` owns the frozen
  request, real-engine comparison, parity bands, timing method, and fail-closed
  decision report. Its x86_64 reference row passed parity while native MuJoCo was
  about 4.9x faster than CPU-backed MJX, so it is harness feasibility, not D12
  adoption or rejection evidence. PR #81/protected `d19c911` preserves v1 and
  protects D47's final-request machinery: three explicit D12/controlled simulation
  proxies and authority hashes, 12-hour scorecard and complete 200-candidate CPU
  envelopes, retained provider USD/hour authority, exact GPU/TPU resolution with
  float64/no fallback, a three-bundle native runner, centralized v2 verdict, and
  `MJX-DECISION.md`. Exact head `6c633d5` and protected `d19c911` passed PR and
  post-merge CI/security; downloaded artifact `8363066891` is a clean protected v1
  smoke and remains decision-ineligible. Run v2 from an exact clean protected
  revision with reviewed raw budget/cost artifacts and a supported accelerator; the
  M2 Pro/Metal path cannot satisfy the frozen float64 protocol. P7-011 is protected
  through PR #68/`9131289`;
  clean artifact `8340587390` proves one-click admitted-model create/poll,
  D38/D39 one-winner content-addressed object delivery, byte-free policy metadata,
  authenticated retained-byte readback, exact browser playback, stale-lease and
  substitution refusal, and cancellation without database authority at controlled
  S3-compatible sandbox maturity. D40 sequences the waypoint slice of P7-014
  first. It is protected through PR #70/`f220d25` under D41 `p7-v2` Y-up/hash
  authority:
  a contract-derived sequential environment, estimator-only target transitions,
  task-bound scorecard/export/Studio playback, deterministic dual-task smoke, and
  unsupported-shape/provider-drift refusal. Clean artifact `8342801418` satisfies
  that prerequisite. P7-012 implementation/evidence is closed through PR
  #72/`8e094c0` and PR #73/`6bfa60f`; its clean intentional-interruption/resume
  evidence retains both scorecard-passing policies
  under exact D42/D43 authority. D44's P7-014 ground implementation supplies exact
  built-in rover line-follow and quadruped walk-to-target trainers, independent
  bundle/task/tensor v1 authority, four-task smoke, mechanical-energy semantics, and
  explicit unsupported/browser refusals. PR #75/protected `90b1691` and independently
  checked clean artifact `8356753424` close that controlled trainer requirement.
  D45's P7-009 implementation is closed through PR #77/protected `2c7562d`. It adds
  one consented gateway-owned source log, exact tape/task/tensor/action/capture
  authority, dataset/warmstart hashes, and a frozen BC-to-randomized-PPO-to-ONNX
  command for flight and ground tensors. Its
  complete 40-step gate, 188 worker tests, 65 gateway tests, migration 0023 and its
  clean/every-predecessor isolated Postgres matrix, 17-family artifact catalog, and
  repeated hover/rover same-seed smoke pass with correctly blocked short scorecards.
  Exact PR/post-merge CI/security pass, and independently checked artifact `8359446894`
  binds valid ONNX and exact digests to clean protected source. Recorder/device/field
  capture remains P8 rather than an implied result. Continue exact D12 quad/
  rover/legged declared-accelerator, CPU overnight/tier-2 budget, and cost evidence
  to finish the MJX decision (`P7-010`) and external acceptance. P7-013's D46
  contract/fixture is protected through PR #79/`ff39cd8`: one exact source-bound Modal
  1.5.2/L4 function, CUDA no-fallback authority, durable call history, shared Postgres
  quota/debit/refund transactions, D38 cancellation/recovery, migration 0024, a strict
  evidence validator, and the operator runbook pass exact PR/post-merge CI/security
  plus the clean 24-migration database/browser matrix. Deploy only that clean protected
  revision and retain the real L4, billing/tag, hard-stop,
  alert/SLO, cancellation, deletion, and no-duplicate recovery evidence before
  calling the sandbox complete. OPS-006 separately
  closes policy-object inventory/orphan cleanup and production storage operations;
- P9 protected controlled-engine seam followed by the live optimizer and full
  multi-fidelity ladder (`P9-002`, `P9-003`, conditional `P9-005`). D59 now proves
  the exact admitted-snapshot/native-validator/Rapier/MuJoCo shape at protected
  local maturity through PR #106/`fae00c5` for three
  candidates. D60 now has a protected exact-snapshot proposal plan through PR
  #109/`71e7217` that executes 100 pinned CMA-ES plus 100 pinned Optuna TPE
  proposals with no physical/engine feedback. Consume its exact hashes through
  D61's separately versioned checkpointed 200-candidate engine artifact. PR #111/
  protected `1c37567` and artifact `8396554544` prove exact-prefix consumption,
  per-candidate durability, zero-dispatch cancellation, resume, measured local
  runtime, 200 native/123 eligible Rapier-MuJoCo rows, 87 admissions, four Pareto
  points, and three tier-3-held finalists in all 43 gates with 242 worker tests.
  D62/P9-006 discovered that Apple-arm64 changes CMA-ES ordinals 20–99 relative to
  repeated Linux-x86-64 hashes. D63's coordinated v2 contract
  binds exact platform/Python/NumPy/BLAS/LAPACK/algorithm-distribution identity into
  every plan, cache, checkpoint, and candidate and refuses foreign replay/evaluation/
  resume. PR #113/protected `54385c2`, all 44 gates with 244 workers, artifact
  `8397860593`, and a clean same-protected-source all-200 Linux/Apple comparison pass;
  P9-006 is closed for exact-authority recovery integrity. PR #115/protected
  `609a70d` then protects D64's exact catalog-choice successor; clean artifact
  `8399829664` evaluates 200/200 native/Rapier/MuJoCo rows, admits 197, and retains
  two physical front points/two held finalists through same-authority recovery.
  These lanes still supply no portable/heterogeneous recovery, catalog-native tier-2
  physics, `>=3` physical front, overnight/provider billing, actual trained finalists,
  or external evidence;
- provider reliability, cost, data-retention, and artifact-integrity work from
  `OPS-*`, `QA-*`, and `SEC-*`.

Acceptance:

- a photographed motor becomes a reviewed equipable component under five minutes or
  the SLO is explicitly revised from evidence;
- real engine baselines pass declared parity tolerances on the exact protected
  revision with source/provider/timestep/substep-bound artifacts;
- one-click training delivery proves the browser executes the exact retained ONNX
  object authorized by the winning owned-model job; this is closed through P7-011.
  Separately, the P7-014 waypoint slice makes the second task executable, P7-012
  proves both scorecard-passing policies on declared consumer hardware with frozen
  seeds/config/runtime, exact device authority, recovery, retained bytes, and honest
  energy/cost evidence, and PR #75/protected `90b1691` closes controlled rover and
  quadruped trainer execution with clean exact-source four-task evidence;
- MJX adoption/rejection is based on D12 benchmark data;
- co-design returns at least three admitted Pareto points from engine-backed tiers.

### Wave 4 - execute the controlled hardware loop

Objective: close R3 without widening hardware authority.

Work:

- all `P8-001..014` tasks;
- P8-012 is complete at protected deterministic/native transport integration
  maturity under D48 through PR #83/`fd26845` and exact PR/post-merge CI/security:
  exact Betaflight 2025.12/D12-quad/failsafe-only artifact, independent
  producer/consumer validation, OS-enumerated 115200-baud serialport-rs write, honest
  receipt, and real pseudo-terminal byte proof. Do not count it as target firmware,
  application, FC, HITL, lab, or field evidence;
- D49 is protected at local integration maturity through PR #85/`4647a10` and exact
  PR/post-merge CI/security. It keeps that artifact unchanged but requires one bounded
  stable `2025.12.x` version handshake before writing, exact set/save acknowledgement,
  reboot/reconnect to the same OS path, repeated reported-identity hash, and one exact
  `get failsafe_delay` readback before emitting receipt 2.0.0; bind the four authoritative
  response byte streams by SHA-256. Two real pseudo-terminal sessions prove the
  protected protocol and refusals; this is still local
  integration evidence, not a physical target or lab result;
- D50/P8-013 is protected at local recorder-integration maturity through PR
  #87/`d8afe7f` and exact PR/post-merge CI/security: one exclusive in-shell
  thread accepts only D30/D12/consent/OS-enumerated 115200-baud versioned JSONL,
  exact artifact/sequence/increasing time, and bounded object frames; it retains
  no-overwrite append-only canonical frames plus a sparse byte-offset index, flushes
  and syncs before finalizing replay 1.0.0, and emits a hash-bound receipt only on a
  clean explicit stop. Privacy/training authorization and device attestation remain
  false; pseudo-terminal proof is not an adapter, device, lab, field, ghost,
  system-ID, host-suspend, or recorded-device result;
- D51/P8-003 is protected through PR #89/`b5418ac`: the read-only Desktop command
  requires exactly five
  canonical real archive-v1 files, streams and bounds frames/index entries, verifies
  stride/final offsets, counts/duration and frame/index hashes, reconstructs the
  replay-v1 digest, and returns only strict local-self-consistency/nonclaim metadata
  to the Desktop-only Studio panel. Fourteen native tests, sixteen Studio tests, the
  three-engine browser matrix, and the complete 40-step local gate pass. Exact
  PR/post-merge CI/security and reviewed-tree equality protect this local boundary.
  It is not gateway import/materialization, authenticity,
  adapter/device, lab/field, sharing/training, ghost, or system-ID evidence;
- D52/P8-003 is protected at local recorder-control maturity through PR
  #91/`a8120ab`. Native shell state
  is exposed only as exact `forge-recorder-control/1.0.0`
  `inactive|recording|finished`; Studio starts from the active admitted report's
  contract/lockfile hashes and seed plus D30/D12, exact capture consent, a new
  absolute path, one OS-enumerated 115200-baud port, and bounded rate/environment.
  Webview reload cannot create a second recorder or erase finished identity, explicit
  stop returns receipt v1 or collects the fail-closed recorder error, and raw frames
  plus device/field/sharing/training authority never cross into Studio. Focused native
  and Studio gates, the three-engine browser matrix, and all 40 local gates pass;
  exact head `69db857`, reviewed tree `25be1d3`, PR CI/security
  `29495505253`/`29495505262`, protected-tree equality, and post-merge CI/security
  `29496148793`/`29496148796` pass;
- D53/P8-003 is protected at local private-object-integrity maturity through PR
  #93/`08d892f`. Desktop
  reruns D51 and emits path-free upload-plan v1; the gateway stages exactly five
  private checksum-bound objects; native Desktop pins one object origin, forbids
  redirects/system proxy, and streams exact sized files; gateway completion HEADs all
  objects and reads bounded manifest/receipt bindings before setting object integrity.
  Migration 0025 and user-data export 1.5 retain the row. Archive semantics,
  telemetry admission, recorded-device/device/field provenance, sharing, and training
  remain false. Exact implementation head `5d1af49`, reviewed tree `90d8cbf`, PR
  CI/security `29501475412`/`29501475414`, protected-tree equality, and post-merge
  CI/security `29502180736`/`29502180788` pass. Seventeen native, twenty-five
  Studio, seventy gateway, clean/24-
  predecessor Postgres, 11-flow browser E2E, three-engine browser, and all 40 local
  repository gates pass;
- D54/P8-003 is protected at local sovereign archive-semantics admission maturity
  through PR #95/`f8efb6f`. The gateway exact-authorizes one owner materialization and
  admitted model, streams the five complete D53 objects with length/SHA-256 checks
  into exclusive private temporary files, invokes native `forge-validate recorder-
  verify`, deletes the temporary root before persistence, and exact-binds the report
  to D53, object hashes, model, contract, and lockfile. Migration 0026 stores a
  separate semantics admission plus one bounded object-backed telemetry reference;
  export 1.6, deletion, and explicit D45 training refusal preserve all device/field/
  sharing/training nonclaims. Focused Rust, Gateway, Studio, and Postgres assertions
  pass; the clean/25-predecessor database, 11-flow browser E2E, and three-engine
  browser gates and all 40 repository gates under Python 3.12.13 also pass. Exact
  head `81282f7`, reviewed tree `f71ee1a`, PR CI/security
  `29512245375`/`29512245387`, protected-tree equality, and post-merge CI/security
  `29512921138`/`29512920367` pass;
- D55/P8-002/P8-003 is protected at local read-only protocol-fixture maturity
  through PR #97/`370d214`. Exact head `4321eaa`, reviewed tree `673a50c`, PR
  CI/security `29519984713`/`29519984764`, protected-tree equality, and post-merge
  CI/security `29520651520`/`29520651581` pass.
  Native Desktop re-enforces D30/D12/props-off and an OS-enumerated 115200-baud
  port, issues only MSP-v1 API/variant/version/board/build/UID queries, requires
  protocol 0/API 1.47/`BTFL`/stable `2025.12.x`/`KAKUTEH7`, and compares two exact
  observations on one open port. Raw UID/responses remain native; only domain-
  separated hashes cross into strict Studio parsing. Nineteen native and twenty-
  eight Studio focused tests pass. All device/recorded-device/field/sharing/training
  authority remains false because a stable self-reported transcript is neither
  cryptographic attestation nor recorder-bound custody. The locked Desktop native
  gate, all 40 repository gates under Python 3.12.13, clean/25-predecessor database,
  11-flow production-browser, and three-engine matrices pass. Real named-controller,
  real-trust-root recorder-bound custody, suspend, lab, and field evidence remain pending;
- D56 is protected at local custody-fixture maturity through PR #100/`1bf127d`. It preserves
  archive v1, D53, and D54 and strictly executes a separately hash-pinned purpose-
  limited Ed25519 public trust bundle, an at-most-eight-hour exact signed revision/
  evidence/signoffs/artifact/model/two-port/D55-identity/nonclaim authorization,
  shell-owned pre-open/post-clean-stop D55 continuity, sovereign archive/receipt
  revalidation, and a create-new proof outside the five-file archive. Twenty-four
  native and thirty Studio tests cover strict crypto/time/revocation/binding,
  independent identity pseudo-terminal sessions around live pseudo-terminal capture,
  substitution/no-overwrite refusal, and valid-archive preservation. The acceptance
  authority—not the FC—signs the mapping; device-cryptographic, recorded-device,
  sharing, training, lab, and field authority remains false. All 40 repository
  gates, the locked Desktop-native build, and a fresh clean/25-predecessor isolated
  Postgres plus 11-flow production-browser matrix pass. Exact head `69c0dd7`,
  reviewed tree `de12c5a`, PR CI/security `29530839367`/`29530839338`, protected-tree
  equality, and post-merge CI/security `29531470442`/`29531470118` pass;
- D57/P8-004 is protected at local controlled-synthetic/unverified view maturity
  through PR #102/`d33fd57`. `forge-ghost-overlay/1.0.0` caps one compact Y-up/SI
  trace at ten minutes
  and 6,001 points, exact-matches Euclidean divergence and a sparse seek index, and
  permanently keeps device/recorded-device/field authority false. Worker tests cover
  a 36,001-sample 60 Hz source and refusal; Gateway produces the keyless equivalent;
  Studio strictly reparses, precomputes observed/predicted X/Z paths, and provides
  explicit 60 Hz play/pause/frame steps. Focused worker/Gateway/Studio/build and
  compatibility gates pass, as do all 40 local gates under Python 3.12.13 with 227
  worker tests, a fresh clean/25-predecessor Postgres matrix, all 12 production-
  browser flows, and Chromium/Firefox/WebKit. Exact head `50abc92`, reviewed tree
  `cc1d483`, PR CI/security `29536927436`/`29536927492`, protected-tree equality,
  and post-merge CI/security `29537565069`/`29537565062` pass. Raw D53/D54 frames
  remain object-backed; real-mid-hardware, real D54-to-twin, P8-014 and EXT-008
  evidence remain required;
- D58/P8-007 is protected at local `local-ux-rehearsal` maturity through PR #104/
  `f7e7f57`. Internal ladder/control 1.0.0 drive one shell-owned session through the
  exact contiguous four-stage prefix, bind D12/report-hash/exportable-policy/passing-D9-supervisor-
  shaped inputs, require exact transition interactions, survive webview reloads,
  and refuse browser use, parallel sessions, skips, substitution, and authority
  promotion. The native path performs no hardware I/O; every physical/deployment/
  hardware/device/field/external-beta claim remains false. Four native ladder tests,
  28 total native Desktop tests, 37 Studio, 74 Gateway, and 227 worker tests pass.
  All 40 local gates under Python 3.12.13, the fresh clean/25-predecessor database,
  all 12 production-browser flows, and Chromium/Firefox/WebKit pass. Exact head
  `3f3c4ec`, reviewed tree `4b36fac`, PR CI/security `29541145577`/`29541145559`,
  protected-tree equality, and post-merge CI/security `29541456427`/`29541456430`
  pass; real ladder execution remains an external named-hardware lane;
- D59/P9-002/P9-003 is protected at local `local-engine-controlled-smoke` maturity
  through PR #106/`fae00c5`. The gateway-owned admitted snapshot is the only source
  model; the
  repository-owned command derives three-to-nine replace-only inline multirotor
  electrical variants, and worker readback recomputes patched snapshots, hashes,
  admission, and Pareto membership. `forge-validate codesign-evaluate` supplies the
  sovereign validator/bake/HUD result and deterministic real Rapier 0.33.0 one-
  second trajectory; the worker compiles training bundle 2.0.0 and executes two
  200-step pinned MuJoCo 3.9.0 hover estimator-controller rollouts per native-passing
  candidate. A release-binary smoke admits 2/3, returns one Pareto point, and records
  passing release-native 50 ms tier-0 SLO; all 41 required local gates pass under
  Python
  3.12.7 with 233 workers, 74 Gateway tests, and 39 Studio tests. Tier 3 is held and
  every CMA-ES/Optuna/overnight/trained-
  finalist/catalog/provider/build/hardware/field claim is false. Exact head
  `e64c601`, reviewed tree `08e8a12`, PR CI/security `29545327465`/`29545327485`,
  protected-tree equality, and post-merge CI/security `29545811003`/`29545810996`
  pass. D60 and D61 now supply separate proposal-plan and protected platform-scoped
  batch lanes without
  reusing or promoting the controlled-smoke claim;
- D60/P9-002 is protected at `local-algorithm-proposal-plan` maturity.
  `forge-codesign-search-plan/1.0.0` and `p9-search-plan-evidence/1.0.0` bind the
  exact admitted snapshot, source/manifest, frozen seed/constraints/manifold,
  100 `cmaes==0.13.0` proposals, 100 `optuna==4.9.0` TPE proposals, replace-only
  patch hashes, 200 unique candidate hashes, and deterministic replay. The
  bounded-diversity acquisition has no physical objective or engine feedback and
  every validator/Rapier/MuJoCo/constraint/admission/Pareto/overnight/training/
  catalog/provider/build/hardware/field claim is false. Focused tests and smoke pass;
  all 42 local gates pass under Python 3.12.7 with 238 worker, 74 Gateway, and 39
  Studio tests, and the pinned dependency audit is clean. Exact head `340c88d`,
  reviewed tree `7139ad5`, PR #109 CI/security `29549718149`/`29549718173`,
  protected squash `71e7217`, protected-tree equality, and post-merge CI/security
  `29550088422`/`29550088452` pass. D61 is the separate protected platform-scoped
  engine-consumption
  artifact; it does not promote this plan;
- D61/P9-002/P9-003 is protected at platform-scoped
  `local-engine-200-batch` maturity.
  `forge-codesign-engine-batch/1.0.0` deterministically replays the D60 plan, accepts
  exactly 200 proposal hashes, and retains one hash-bound ordinal-contiguous prefix.
  It atomically checkpoints after each candidate, fences an unfinished attempt as
  interrupted, records cancellation only with zero dispatch, and withholds Pareto/
  finalists until complete. Artifact `8396554544` at protected `1c37567` executes
  7 + cancel + 193, evaluates 200 native/123 eligible Rapier-MuJoCo rows, admits 87,
  derives four Pareto points, selects three real engine-admitted finalists with tier
  3 held, and records measured local engine hours. Exact head `6c446a5`, reviewed
  tree `c6520fd`, PR #111 CI/security `29552818736`/`29552818716`, protected-tree
  equality, and post-merge CI/security `29553189264`/`29553189257` pass. D62/P9-006
  exposed cross-platform drift; D63 below closes exact-runtime recovery while
  portable/heterogeneous recovery, tier 3, overnight/provider billing, and catalog
  choices remain unsupported or open;
- D63 is the protected D62 recovery contract. Search-plan/evidence and engine-batch/
  evidence 2.0.0 bind one self-hashed proposal-runtime authority into plan/cache/
  scheduler/checkpoint/candidate lineage. The manifest covers OS/kernel/machine/
  libc/byte order, Python implementation/version/cache tag, pinned NumPy
  distribution/configuration/CPU/BLAS/LAPACK identity, and pinned CMA-ES/Optuna
  distributions. Foreign replay, evaluation, and resume fail before work;
  heterogeneous resume and portable cache remain false. PR #113 exact head
  `ceb6bb0`, reviewed/protected tree `727f6f5`, protected `54385c2`, exact PR/post-
  merge CI/security, all 44 gates, and protected artifact `8397860593` pass. Clean
  Linux and Apple plans at source `54385c2` bind authorities `25ee0796…aff7e` and
  `a99337a8…b312`; independent all-200 comparison `d255c441…6562` proves 120 matches
  and 80 CMA-ES patch/candidate differences at ordinals 20–99. P9-006 is closed for
  exact-authority scheduling/refusal only;
- signed Desktop installers/update path;
- real serialport/WebSerial/WebUSB capture and config with explicit diffs;
- flashable Link image, pairing, recovery, and update procedure;
- supervisor, kill switch, fallback, and control-rate measurement;
- reference rover before reference quad; SITL -> HITL -> constrained evidence;
- Desktop field log, replay/ghost, system-ID patch, and policy re-evaluation;
- `EXT-004` controlled lab acceptance.

Next dependency-complete external step: execute D49, D55, and D56 on the named props-off D12 Kakute H7 V1.5
under controlled-lab authority with a real deployment trust bundle and retained
semantic acceptance review; retain bounded response/signature/hash plus failure,
reconnect, power-loss, revocation, and suspend evidence, and exercise the recorder
seam under P8-009's SITL -> HITL procedure. Browser WebSerial should consume the
unchanged D48 artifact only after native real-target proof. No stable self-reported
MSP transcript, fixture signature, adapter, import path, or acceptance-authority
signature may promote a log to recorded-device or field maturity without a later
reviewed format and acceptance proof.

The current dependency-complete external step is the named props-off D12 D49/D55/D56
controlled-lab seam above, followed only after retained semantic review by a new
real-transition boundary. No further local acknowledgment or fixture can satisfy
that evidence requirement. Do not fabricate a D54 ghost source: the real D57
successor must wait for the named-hardware/D54-to-twin gate above.

P9-006 is closed at protected `54385c2`: exact-platform authority permits same-
authority scheduling and resume only and never grants portable cache, heterogeneous
resume, or cross-runtime tier-3 authority. D64 protects the next local slice through
PR #115/`609a70d`:
search-plan/batch v3 replaces the four synthetic electrical profiles with exact
lockfile-pinned CNHL 1500/1300 battery revisions, binds raw catalog row plus review/
license/export authority, switches only the D32 equipped variant and required inline
mirrors, and re-runs catalog-aware native admission before Rapier/MuJoCo. Exact PR/
reviewed/protected tree proof and post-merge CI/security pass; clean artifact
`8399829664` proves 7 + zero-dispatch cancel + 193 resume, 200/200 native/Rapier/
MuJoCo rows, 197 admissions, and the expected two-choice/two-point front. That passes
inside all 44 local/PR/protected gates with 246 worker, 74 Gateway, and 39 Studio
tests, but does not satisfy the separate P9 `>=3` phase exit.

D65 is now protected as the next compatibility-complete tier-2 slice:
catalog-supplied multirotors emit bundle v3/physics v1, compile exact equipped
catalog mass and sourced-dimension uniform-solid inertia into MJCF, and bind exact
MuJoCo mass closure plus per-table applicability into batch/evidence v4. The D12
fixture retains but rejects its 25.2 V/5×4.6 bench row for the 14.8–16.8 V/5×4.3
configuration; named resistance/current/prop/`DEFAULT_CT` fallbacks drive the curve.
PR #117 exact head `d8d18ad`, reviewed merge/tree `2589e399`/`8051c127`, PR
CI/security `29568639154`/`29568639106`, protected squash `ad54ab3`, and post-merge
CI/security `29569424726`/`29569424612` pass. Protected artifact `8402573520`
binds clean source, retains 7 + zero-dispatch cancel + 193 resume, evaluates every
row through native/Rapier/MuJoCo, admits 97, and returns two held battery points at
0.769/0.756 kg. All 44 local/PR/protected gates pass under Python 3.12.13 with 246
worker, 74 Gateway, and 39 Studio tests. It creates no applicable-catalog-thrust,
tier-3, overnight/provider, marketplace/live-catalog, build, hardware, field, or
external claim.

D66 is protected as the compatibility-complete format/persistence slice through PR
#119 at `5a162b0`. All 44 local gates, exact PR/post-merge CI/security, and protected
artifact `8405061774` pass. File-catalog row
2.0.0 moves voltage onto every point, retains exact markerless/explicit v1 reads,
requires complete rectangular unique monotonic grids, and exact-matches Rust
admission with Python ETL through the registered nine-surface/99-case corpus.
Migration 0027 preserves every populated predecessor's thrust point as
`legacy-unattributed` v1 with null missing authority and expands the primary key by
stable table ID. The current EMAX row remains v1 and inapplicable; D66 changes no D65
bundle, curve, review, marketplace, or physical claim.

D67 is protected as the compatibility-complete downstream consumer slice through
PR #121/`08e880b`.
Catalog bundle v4/physics v2 retain exact row/table authority and every SI bench point;
curve-readback v1 freezes the 101-point/fixed-point recipe and Python independently
reconstructs every thrust/voltage/current sample before table-driven authority.
Training-authority v2 and engine batch/evidence v5 bind this result through cache,
checkpoint, resume, and every tier-2 row. All 44 local gates, all 11 PR checks, and
exact PR/post-merge CI/security pass under Python 3.12.13 with 248 worker tests.
Protected artifact `8407177912` binds clean `08e880b` and passes with 97 admissions,
two Pareto points, and two held finalists after 7 + zero-dispatch cancel + 193
resume. The accepted grid exists only
in a controlled-synthetic test copy; the catalog is unchanged and the real EMAX row
remains v1, rejected, and analytic-fallback driven. This is not sourced/reviewed
thrust, tier 3, overnight/provider, build, hardware, field, or external maturity.

Next dependency order for P9 is exact and must not be collapsed:

1. source and owner-review an actually voltage-covered, prop-matched grid (or keep
   the analytic fallback explicit). Create a new immutable component revision; never
   merge, infer, or rescale separate legacy sweeps;
2. run that exact reviewed row through protected D67's bundle-v4/physics-v2/
   readback-v1 authority and protect the clean 101-point readback/recovery evidence
   for the real row; only then run
   tier-3 training for the exact admitted finalists, retaining policy bytes,
   scorecards, bundle/physics/catalog/runtime lineage, failure/cancellation/recovery,
   and keep build/hardware/field authority false;
3. expand the course-conditioned physical manifold to produce at least three
   independently admitted Pareto points rather than duplicate driver variants;
4. execute the 200-candidate schedule through the reviewed provider path, reconcile
   wall time, energy, amount/currency/tags, cancellation, spend stop, and billing;
5. close P9 only after protected clean evidence and the relevant external acceptance
   record prove every exit criterion.

Fast local completion is not an overnight run, a held finalist is not a trained
policy, and a review-gated catalog row is not marketplace or live authority.
Fast proposal or local engine completion is not an overnight run.

Acceptance:

- D30/D12 gates are technically and procedurally enforced;
- no command can auto-arm or elevate policy authority;
- signed evidence covers failure/reconnect/power-loss/kill-switch scenarios;
- a Desktop-captured log replays with visible measured divergence;
- an accepted system-ID patch improves or honestly fails to improve the twin;
- external beta remains disabled until a separate recorded rollout decision.

### Wave 5 - prove the community and platform

Objective: close R4 with real people and provider handoffs.

Work:

- public course and verified leaderboard (`EXT-005`);
- external model publication/equip (`EXT-006`);
- policy sharing after G5 (`P11-000`, `P11-003`);
- live vendor and print handoff (`P11-005`, `P11-006`, `EXT-007`);
- moderation policy ownership, SLA operation, appeals, repeat-infringer process;
- classroom privacy/accessibility and support proof;
- production operations, backups, retention, incident response, and cost controls;
- field maintenance proof (`P12-002`, `P12-004`, `EXT-008`).

Acceptance:

- a real community course has independently verified competitors;
- a stranger equips an external user's admitted model;
- a structural print is handed to a provider through a lawful quote link;
- moderation is exercised against a test or real report inside the SLA;
- a real field event produces actionable, reviewed repair evidence;
- operating dashboards, alerts, restore test, and support runbook are live.

### Wave 6 - scale, harden, and decide expansion

Objective: decide whether evidence justifies broader investment.

Work:

- measure activation, admitted-design rate, time-to-valid-build, provider success,
  policy scorecard pass rate, field divergence, repair usefulness, and support load;
- revisit fixed-wing priority, seller economics, broader hardware beta, and any
  licensed geometry-kernel investment through new decision records;
- run load/cost/capacity exercises and privacy/security review;
- address bus factor through contributor docs, ownership, runbooks, and release
  automation;
- retire fixtures or UI surfaces that do not support proven user outcomes.

Acceptance:

- expansion decisions cite observed product and operating data;
- no maturity claim depends on fixture counts alone;
- roadmap is narrowed to the highest-value demonstrated loop.

## 7. Workstreams

### T - truth, CI, and quality

Owns `REC-*`, `QA-*`, workflow reliability, and current-state reconciliation.

Required practices:

- pin toolchains or intentionally test a version matrix;
- keep full-gate commands runnable locally;
- avoid dependency chains that hide downstream failures where parallel jobs are safe;
- upload diagnostics/eval/parity artifacts on failure;
- treat warnings and test skips as explicit evidence, not success.
- require the machine registry and a new append-only record before any protected
  schema/render/physics/validator/corpus/generated-runtime artifact re-pin.
- retain the unmodified Chromium/Firefox/WebKit QA-003 matrix and its exact-revision
  evidence for Studio semantics, interaction, layout, motion, renderer/presentation-
  asset isolation, or support-tier changes.
- retain D37's advisory-lock, contiguous-checksum, per-migration transaction, clean
  plus every populated predecessor, idempotency, failure-recovery, and concurrency
  assertions in the required Postgres job; database rollback guidance lives in
  `MIGRATIONS.md`, while production DR remains OPS-005.
- retain D38's current-token/current-expiry completion predicate, deterministic retry
  ceiling/backoff, cancellation-first lease clearing, staged-until-inspected object
  state, and exact QA-005 Postgres artifact. Never turn a stale-result discard or
  structural fixture into multi-replica/live recovery proof.

Exit: G0.

### V - validator, contract, packaging, and releases

Owns P0/P1/P2 core gaps, publication, schema evolution, fuzz/property/golden gates,
release artifacts, and compatibility policy.

Exit: G1 plus a documented external install.

### C - catalog, generation, and configuration

Owns P3/P4, reviewed retrieval, live extraction, variants, draft/repair behavior,
provenance, Brief-25, BOM truth, and R1 acceptance.

Exit: G2.

### M - manufacturing, photoscan, and commerce

Owns P5, DfM, license-aware export, OCCT/3MF orientation, photoscan admission,
vendor offers, and provider quote handoff.

Current P11-005 handoff: the gateway queues only local idempotent component refresh
requests with owner-scoped, request-bound retry keys; the Python worker owns the
command invocation and normalization; Postgres owns transactional offer
materialization. The synchronous sandbox path stays separate. The lane does not exit
until a real provider sandbox covers egress, quotas, telemetry, retry/recovery,
billing, terms, and BOM use.

Exit: live photo-to-part plus real quote-link handoff.

### S - simulation, learning, and co-design

Owns P6/P7/P9, engine parity, replay, live training, ONNX execution, offline learning,
MJX evidence, optimizer tiers, and scorecards.

Exit: R2 and the engine-backed P9 objective.

### H - Desktop, bridge, hardware, and safety

Owns P8 and G4. This lane is never a generic external-provider lane; it requires the
controlled lab, approved rigs, physical confirmation, and a named supervisor.

Exit: R3 field-log criterion, not external beta.

### P - courses, marketplace, classroom, and moderation

Owns P10/P11, external community proof, policy gates, marketplace usage beta,
classroom privacy/accessibility, and moderation operations.

Exit: G5 and G6.

### F - field evidence and maintenance

Owns P12, telemetry retention, wear, crash investigation, repair usefulness, fleet
views, and feedback into design/training.

Exit: G7.

### X - security, privacy, governance, operations, and documentation

Owns `SEC-*`, `GOV-*`, `OPS-*`, and `DOC-*`. These are product work, not cleanup.
Every functional lane consumes its gates.

D68/OPS-001 fixes the operations dependency order as OPS-002 hardened artifacts,
then OPS-003 observability, then parallel SLO/data-resilience/job-control work
(OPS-004..006), provider resilience (OPS-007), incident/support and economics
(OPS-008/009), and capacity/launch limits (OPS-010). Do not run a production
promotion or external beta around an incomplete predecessor; exact deliverables and
acceptance evidence are owned by `OPERATIONS.md`.

Exit: no open blocking cross-cutting item for the target release/phase.

## 8. Phase closure map

| Phase | Remaining phase work | Adjacent gates | Closure proof |
|---|---|---|---|
| P0 | none | decision hygiene | closed by D32; no fabricated historical variants |
| P1 | P1-004, P1-017 | REC, QA performance; QA-003 and QA-008 protected | real-mid-hardware budget; XC-28 configurator truth complete; protected cross-engine accessibility evidence; registered re-pins are review-gated |
| P2 | none | explicit registry deferral remains policy, not incomplete phase work | closed: v0.1 published/installed and v0.2 exact checks/post-merge proof |
| P3 | P3-004 credentialed ETL sandbox and persistence | D36 native transport, SEC citation/license, OPS provider | one real extracted row is deduped, persisted immutably, owner-reviewed, and consumed through BOM/export with recovery evidence |
| P4 | P4-016 credentialed extraction and external R1 proof | P3 reviewed row, SEC refusal/privacy, QA-002/003 protected | Brief-25 >=20 remains green, deterministic browser E2E and the supported-browser/accessibility matrix are protected, and an external R1 flow succeeds without bypassing review |
| P5 | P5-001, 002, 006 | OPS GPU, SEC photos | real photo-to-part under declared SLO |
| P6 | none | retain P6-010 required engine evidence; broaden third-party imports as adjacent QA | closed through protected PR #60: real engines plus admitted driveable URDF/MJCF fixtures |
| P7 | finish P7-010 and execute P7-013's exact credentialed sandbox evidence from protected `ff39cd8`; P7-009/P7-011/P7-012/P7-014 closed | P8 recorded-device source proof, OPS storage/SLO/orphans, SEC policy data, EXT-003 | protected controlled scorecard-passing hover/waypoint quality, authoritative one-click object delivery, contract-derived rover/quadruped trainers, source-bound controlled-synthetic BC-to-PPO evidence, and protected P7-013 deployment-control contract/fixtures; P7-013 still requires the clean-protected L4/billing/alert/spend-stop/cancel/application-artifact-delete/provider-call-expiry/recovery run; exact passing-policy delivery integration, ground browser playback, and final D12 MJX decision remain open |
| P8 | P8-001..014 | G4, signed release, lab runbooks | controlled rig plus Desktop field log |
| P9 | P9-002, 003, conditional 005; P9-006 closed at protected D63; exact catalog choices protected at D64; catalog-bound tier-2 physics protected at D65; D66 row-v2/read-v1/persistence protected at `5a162b0`; D67 exact-grid/readback consumer protected at `08e880b` | P6/P7 evidence; reviewed applicable bench data or explicit fallback through protected D67 authority; accelerator/provider budget for overnight/tier-3 work | preserve exact-authority recovery; add a `>=3` course-conditioned physical front; retain overnight/provider billing and actual scorecard-passing tier-3 finalists |
| P10 | no open implementation row; external proof remains | GOV/OPS/public abuse controls | community verified leaderboard and course-to-task use |
| P11 | P11-000, 003, 005, 006 | G5/G6, moderation/privacy | external model, policy gate, provider print handoff |
| P12 | P12-002, 004 | G7, retention/support | real crash-to-repair and useful fleet evidence |

## 9. Release trains

### Validator/core preview

Scope: schema, validator, CLI, WASM, examples, docs. No hosted product promise.

Required: G0, G1, compatibility statement, checksums/SBOM, install proof.

### Builder alpha

Scope: local Studio, reviewed catalog, configuration, validation, BOM, share, lawful
exports. Providers may remain sandboxed and clearly labeled.

Required: validator preview, G2, privacy/deletion basics, browser E2E, protected
supported-browser/accessibility matrix, and support path.

### Simulation/training alpha

Scope: external imports, Rapier/MuJoCo, live training, scorecards, ONNX playback.

Required: G3, cost bounds, reproducibility, artifact retention, honest scorecards.

### Controlled lab preview

Scope: D12 rigs only. No general hardware beta.

Required: G4, signed Desktop artifacts, supervisor/runbooks, incident procedure.

### Platform beta

Scope: courses, listings, classroom, usage beta, provider handoffs. No seller payouts
or direct checkout under D29.

Required: G5, G6, operations/privacy/moderation readiness, external evidence.

## 10. Metrics and review cadence

Track outcomes, not implementation counts:

- percent of user designs admitted and median repair iterations;
- time from brief/import to valid, purchasable build;
- catalog citation/review freshness and provider-offer success;
- photo-to-part D13 pass rate, latency, and cost;
- engine parity drift and replay reproducibility;
- training scorecard pass rate, wall time, energy/cost;
- hardware abort/fallback/reconnect performance and ghost divergence;
- course verification rate and moderation SLA;
- print handoff completion and repair-sheet usefulness;
- CI/nightly reliability, escaped regressions, restore-test age, and support load.

Cadence:

- every PR: task/gate evidence;
- weekly while active: current-state delta, blockers, provider cost, risks;
- phase close: full evidence pack and roadmap/TODO reconciliation;
- release: artifact/security/migration/rollback proof;
- post-release: smoke, support issues, and metric review before expanding scope.

## 11. Final program acceptance checklist

- [ ] G0 truthful green baseline remains stable.
- [x] G1 trusted core is reproducibly released and independently installed.
- [ ] R1 external builder completes a reviewed lawful build flow.
- [ ] R2 external robot trains and runs a real policy with honest evidence.
- [ ] R3 controlled rig produces a Desktop field log and improved/assessed twin.
- [ ] R4 external users create verified platform activity.
- [ ] License, privacy, refusal, moderation, and deletion paths are exercised.
- [ ] Production backup restore, incident response, and observability are proven.
- [ ] Every phase exit criterion has a current evidence link.
- [ ] README, project state, roadmap, TODO, decisions, risks, and releases agree.
- [ ] Expansion decisions are evidence-backed and explicitly recorded.
