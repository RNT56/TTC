# EXECUTION ROADMAP - complete program from recovery to field proof

Last rebuilt: **2026-07-13**

Evidence baseline: [`PROJECT-STATE.md`](PROJECT-STATE.md)

Vision and phase contract: [`FORGE-plan.md`](FORGE-plan.md)
Atomic work ledger: [`TODO.md`](TODO.md)

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
No credentialed provider-sourced reviewed row or real vendor operation is proven. The
next ordered work continues Wave 2 with credentialed catalog acceptance and the
QA-010 -> EXT-001 independent-builder path.

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

Status (2026-07-12): **G0 and Wave 0 complete.** `REC-001..008`, `GOV-001..005`,
and `QA-001` are complete with evidence in `PROJECT-STATE.md`. All remaining work
moves through G1 and later gates without reopening G0 unless a baseline check
regresses.

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
- finish real-mid-hardware P1 budgets; XC-28 configurator truth is implemented and
  awaits protected delivery with the v0.2 package boundary.

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
- author the independent-builder script/evidence template under `QA-010`, then
  execute `EXT-001` without repository knowledge.

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
- P6 live Rapier/MuJoCo parity and broader external import corpus (`P6-010`);
- P7 real SB3/MuJoCo pipeline, ONNX Runtime Web, offline learning, and MJX decision
  (`P7-003`, `P7-008..010`, `EXT-003`);
- P9 live optimizer and multi-fidelity ladder (`P9-002`, `P9-003`, conditional
  `P9-005`);
- provider reliability, cost, data-retention, and artifact-integrity work from
  `OPS-*`, `QA-*`, and `SEC-*`.

Acceptance:

- a photographed motor becomes a reviewed equipable component under five minutes or
  the SLO is explicitly revised from evidence;
- real engine baselines pass declared parity tolerances;
- one-click training produces a scorecard-passing policy overnight on declared
  hardware and the browser executes the actual ONNX model;
- MJX adoption/rejection is based on D12 benchmark data;
- co-design returns at least three admitted Pareto points from engine-backed tiers.

### Wave 4 - execute the controlled hardware loop

Objective: close R3 without widening hardware authority.

Work:

- all `P8-001..014` tasks;
- signed Desktop installers/update path;
- real serialport/WebSerial/WebUSB capture and config with explicit diffs;
- flashable Link image, pairing, recovery, and update procedure;
- supervisor, kill switch, fallback, and control-rate measurement;
- reference rover before reference quad; SITL -> HITL -> constrained evidence;
- Desktop field log, replay/ghost, system-ID patch, and policy re-evaluation;
- `EXT-004` controlled lab acceptance.

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

Exit: no open blocking cross-cutting item for the target release/phase.

## 8. Phase closure map

| Phase | Remaining phase work | Adjacent gates | Closure proof |
|---|---|---|---|
| P0 | none | decision hygiene | closed by D32; no fabricated historical variants |
| P1 | P1-004, P1-017 | REC, QA perf/browser; QA-008 protected | real-mid-hardware budget; XC-28 configurator truth complete; registered re-pins are review-gated |
| P2 | none | explicit registry deferral remains policy, not incomplete phase work | closed: v0.1 published/installed and v0.2 exact checks/post-merge proof |
| P3 | P3-004 credentialed ETL sandbox and persistence | D36 native transport, SEC citation/license, OPS provider | one real extracted row is deduped, persisted immutably, owner-reviewed, and consumed through BOM/export with recovery evidence |
| P4 | P4-016 credentialed extraction and external R1 proof | P3 reviewed row, SEC refusal/privacy, QA-002 protected | Brief-25 >=20 remains green, deterministic browser E2E is protected, and an external R1 flow succeeds without bypassing review |
| P5 | P5-001, 002, 006 | OPS GPU, SEC photos | real photo-to-part under declared SLO |
| P6 | P6-010 live parity | QA external corpus | real engines and external driveable model |
| P7 | P7-003, 008, 009, 010 | OPS cost, SEC policy data | live one-click passing policy in browser |
| P8 | P8-001..014 | G4, signed release, lab runbooks | controlled rig plus Desktop field log |
| P9 | P9-002, 003, conditional 005 | P6/P7 evidence | engine-backed admitted Pareto front |
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

Required: validator preview, G2, privacy/deletion basics, browser E2E, support path.

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
