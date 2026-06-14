# EXECUTION ROADMAP - remaining work split for parallel subworkers

Source of truth: [`TODO.md`](TODO.md) is still the task ledger and
[`ROADMAP.md`](ROADMAP.md) is still the phase status ledger. This file is the
execution overlay: it groups every remaining open, in-progress, or blocked task
into parallel subworker tracks, names dependencies, and defines the acceptance
gate for closing work.

Last rebuilt: 2026-06-14 from `TODO.md`, `ROADMAP.md`, and the v3.0 plan.

## 0. Rules for every subworker

- Start from a branch named `codex/<track>-<short-scope>` unless the owner says
  otherwise.
- Read `/CLAUDE.md`, the relevant `docs/systems/*.md`, and the TODO rows listed
  in the track before changing code.
- Do not edit frozen planning papers: `FORGE-plan.md`, `FORGE-plan-v2.md`, or
  `FORGE-vision-and-architecture.md`.
- Mark a TODO `[~]` only when real work starts; mark `[x]` only after code,
  tests, docs, and changelog are complete.
- Keep D30/P11 gates fail-closed. D30 accepts controlled D12 lab pilots only;
  external beta, policy sharing, and external-provider actions must not silently
  bypass legal, lab, or owner signoff.
- Each subworker owns its tests. If a dependency is missing, add a deterministic
  fixture or adapter seam first, then leave the live path gated.

## 1. Dependency waves

### Wave A - unblocked foundations

These tracks can run now without physical rigs or live hardware gates:

- V: validator, publishing, draft persistence, schema/fuzz cleanup.
- G: geometry/configurator/motion gaps.
- S: Rapier/MuJoCo engine integration and parity harness.
- C: compute adapters for ETL/photoscan/OCCT.
- L: training tasks, SB3, ONNX playback, BC/offline RL.
- E: environments, courses, and leaderboard UI.
- P: marketplace, vendors, print handoff, and maintenance dashboards.

### Wave B - external sandboxes

These need configured external services but not necessarily physical hardware:

- C live GPU photoscan/COLMAP and 5-minute SLO.
- L live SB3/MuJoCo training and P7-010 MJX benchmark.
- S engine-backed Rapier/MuJoCo parity.
- P vendor-offer and print-provider sandboxes.

### Wave C - controlled lab gated

These can proceed only under D30's controlled D12 lab rules:

- H WebSerial/WebUSB writes/capture on real devices.
- H Desktop serialport-rs, background recorder, and signed installers.
- H reference quad/rover pilots and field demo.
- H system-ID from bench or flight telemetry.

External hardware beta remains out of scope until a later rollout gate is
accepted from lab evidence.

### Wave D - community/external validation

These close only with real external usage or accepted stand-ins:

- E verified community course race.
- P first external marketplace publish/equip.
- P first printed structural part provider handoff.
- M crash-to-repair workflow from logged crash data.

## 2. Parallel subworker tracks

### Track V - validator, releases, schema, and drafts

Owns: `P1-004`, `P2-001`, `P2-002`, `XC-02`, `XC-23`, `XC-24`.

Scope:

- Finish the remaining validator check rows as they become concrete in later
  phases, especially manufacturing, lifecycle, scorecard, replay, and
  marketplace checks.
- Package `forge-validate` for npm and crates.io without changing the D17
  single-implementation contract.
- Finish editable draft persistence and make draft state authoritative across
  train/export/share gates.
- `XC-23` is closed as of 2026-06-14: ModelSpec migrations live in
  `forge-contract`, are exposed by `forge-validate migrate`, and normalize
  historical schema markers/field aliases before re-running the shape gate.
- `XC-24` is closed as of 2026-06-14: generator fuzz seeds live under
  `evals/fuzz/modelspec-seeds.json`, with `scripts/fuzz-contract-seeds.mjs`
  checking pinned outcomes and minimizing future regressions.

Dependencies:

- Uses D17 native/WASM equality and existing Postgres migrations.
- Needs track P and track E to expose marketplace/course validator rows, but can
  land generic check plumbing first.

Acceptance:

- `pnpm codegen:contract`, `cargo test`, `pnpm test`, and validator
  native/WASM comparison are green.
- Draft rows survive restart and are blocked from train/export/share unless
  admitted.
- `TODO.md` rows above are either closed or narrowed with a new explicit TODO.

### Track G - geometry, slots, configurator, couplers, and motion

Owns: `P0-007`, `P1-014`, `P2-003`, `XC-03`, `XC-11`, `XC-12`.

Scope:

- If the later configurator prototype arrives, translate all 31 slot variants.
  If it does not arrive, prepare the rescope patch that records what cannot be
  recovered from the delivered vintage.
- Finish variant cards in the Studio configurator over the live `CoreBake`
  patch/re-bake path.
- Implement the arm driver with schemars params, validator enforcement, and
  smoke coverage.
- Finish lockfile upgrade-diff UI, using the existing contract upgrade diff
  data instead of inventing a second diff format.
- Implement procedural connection v2: port graph resolution, couplers sized from
  equipped variants, fastener sets, and an exact wire-list emitter.

Dependencies:

- `P0-007` is blocked on owner artifact or rescope.
- Configurator variant cards depend on real slots/components from P3 data.
- Wire list should feed BOM/export surfaces owned by track P.

Acceptance:

- At least one first-party slot-equipped contract exercises cards, couplers,
  fasteners, and wire lists.
- Arm contract validates and passes a motion smoke test.
- Studio shows upgrade consequences and variant consequences without losing
  selection, camera, drive, explode, or jog state.

### Track S - simulation, interop, parity, and performance

Owns: `P1-003`, `P1-017`, `P6-001`, `P6-010`, P1 and P6 open exit criteria.

Scope:

- Build the full Contract-to-Rapier compiler: per-node compound colliders,
  joints, motors, torque and velocity limits.
- Wire shared-memory worker execution where the Studio/Rapier split requires it.
- Complete engine-backed Rapier/MuJoCo parity: drop tests, pendulum periods,
  hover trim, and gait CoM trajectories.
- Convert at least one external URDF/MJCF into a driveable contract, not just a
  slotless static fixture.
- Finish perf overlay accounting for UI ms and Rapier worker ms; capture the
  60 fps mid-hardware proof.

Dependencies:

- Uses `forge-sim` runtime summaries, existing exporters/importers, and replay
  envelope verification.
- Blocks training realism in track L and co-design tiers in track O.

Acceptance:

- Hover trim agrees across Rapier and MuJoCo within documented tolerance.
- External import round-trips into an admitted, driveable contract.
- Perf artifact records render/core/Rapier/UI budgets on real mid hardware.

### Track C - catalog ETL, photoscan, OCCT, and GPU adapters

Owns: `P3-004`, `P4-016`, `P5-001`, `P5-002`, `P5-006`, P5 open exit criteria.

Scope:

- Replace fixture-only ETL with deployable live source-fetch, Claude extraction,
  and OCCT execution adapters behind BYO/API-key and review gates.
- Land live TRELLIS-class single-image reconstruction.
- Land live COLMAP multi-view reconstruction.
- Prove permanent object-cache behavior and the 5-minute burst-GPU SLO.
- Make a photographed motor become an equipable parametric component end to end:
  scan, refit, D13 acceptance, alignment, catalog row, review, slot equip.

Dependencies:

- Needs provider credentials or sandbox endpoints for live SLO proof.
- Needs track G slot/configurator path for final equipable component demo.

Acceptance:

- Live path produces a reviewed component with citations, license, price data,
  object blobs, refit report, and catalog revision.
- D13 acceptance is enforced in the live admission path.
- Cached rerun avoids recompute and keeps artifacts addressable.

### Track L - learning, policies, scorecards, and telemetry learning

Owns: `P7-001`, `P7-003`, `P7-008`, `P7-009`, `P7-010`, P7 open exit criteria.

Scope:

- P7 task suite v1 environment definitions are live in the worker task catalog as
  of 2026-06-14 for hover-hold, waypoint chain, gate slalom, velocity tracking,
  walk-to-target, rough terrain, push recovery, line follow, obstacle course,
  reach, and track.
- Replace fixture `train.policy` with live seeded SB3 PPO/SAC runs.
- Add ONNX Runtime Web inference so browser playback uses real policy outputs,
  not only fixture action headers.
- `train.offline-bc` now builds deterministic telemetry warmstart datasets;
  live offline-RL/fine-tune remains open.
- Run the P7-010 MJX benchmark on D12 quad, rover, and legged morphologies before
  any adoption claim.
- Finalize scorecard schema and estimator-smoke rejection for ground-truth-trained
  policies.

Dependencies:

- Needs track S engine-backed simulation for credible training.
- Needs track H telemetry ingest for full BC/offline-RL value, but trainer
  interfaces can land against fixtures now.

Acceptance:

- One-click job trains hover + waypoint and flies the twin in-browser.
- Hover-class task reaches passing scorecard overnight on one consumer GPU.
- Sub-threshold and ground-truth-trained policies are blocked from export.

### Track H - bridge, Desktop, hardware, and safety

Owns: `P8-001` through `P8-014`, `XC-19`, `XC-20`, `XC-27`.

Scope:

- Keep D30 fail-closed: controlled D12 lab pilots only, with lab mode, local
  provider, D12 rig allowlist, and physical confirmation.
- Finish browser WebSerial FC config writes from contract diffs.
- Finish WebSerial/WebUSB telemetry ingest and Desktop background capture.
- Complete real flight recorder archives and replay indexing.
- Build the 60 fps ghost overlay scrubber for 10-minute logs.
- Connect system-ID fitting to live bench pulls/logs/step responses and patch the
  contract sim block.
- Build the flashable FORGE Link image with rosbridge, MAVLink router, ONNX
  runtime, and pairing-code auth.
- Finish Studio deployment-ladder UX and safety supervisor hardware loop.
- Run and document real reference quad and rover pilots.
- Finish Tauri signed installers/updater, serialport-rs plugin, sidecar recorder,
  and archive indexing.
- Produce the P8 field demo: Desktop-captured log replays with visible ghost
  divergence.

Dependencies and gates:

- `P8-000` is closed for controlled D12 lab pilots by D30; external beta still
  needs a later rollout gate.
- Needs D12 rigs and lab confirmation.
- Needs track L for ONNX runtime/policy handoff and track S for replay parity.

Acceptance:

- Lab gate requirements are enforced before any live hardware action.
- A real quad is configured from its contract via WebSerial.
- SITL to HITL to tethered is demonstrated and documented on the reference quad.
- Desktop captures a field log that replays with visible ghost divergence.
- System-ID updates the contract sim block from real telemetry.

### Track O - co-design optimizer

Owns: `P9-002`, `P9-003`, `P9-004`, `P9-005`, P9 open exit criteria.

Scope:

- Keyless `codesign.evaluate` now has a budgeted CMA/TPE-shaped deterministic
  search up to 200 candidates plus optimizer metadata; live engine-backed CMA-ES
  and Optuna TPE orchestration remains open.
- Finish the multi-fidelity ladder: tier 0 native static checks, tier 1 Rapier
  smoke, tier 2 short MuJoCo rollouts, tier 3 finalist training.
- Persisted/openable Pareto point UI is live in Studio as of 2026-06-14 for
  admitted patch candidates; worker-side budgeted Pareto depth is live, while
  engine-backed explorer evaluation remains open.
- Add MJX batching for tier 2/3 only if the P7-010 benchmark demands it.

Dependencies:

- Requires track S for engine-backed simulation.
- Requires track L for tier 3 training and MJX benchmark decision.
- Uses track E courses as objective environments.

Acceptance:

- "Lightest quad for this course under constraints" returns at least 3 admitted
  Pareto points overnight.
- Tier 0 is under 50 ms native; 200-candidate CMA-ES generation completes
  overnight at tier 2.
- Every returned point is a fully admitted contract.

### Track E - environments, courses, and leaderboards

Owns: `P10-001`, `P10-002`, `P10-003`, `P10-004`, `P10-005`, P10 open exit criteria.

Scope:

- Finish generated-course schema/versioning polish for EnvSpec.
- Add archetype-aware reachability to `forge-validate env`.
- Build full environment generation through the P4 pipeline.
- Studio now has an editable EnvSpec course form and `?course=<id>` URL
  selection/copying for public/unlisted courses; direct course fetch/API polish
  remains open.
- Finish durable leaderboard slicing by course, archetype, and class.
- Studio verified-board UI filters are live as of 2026-06-14 using course
  EnvSpec archetypes and replay verification headers.
- Preserve server-side replay verification as the only official leaderboard path.

Dependencies:

- Uses track V validator migration/check infrastructure.
- Feeds track L task definitions and track O optimization objectives.

Acceptance:

- A community course races with a verified leaderboard.
- A popular course becomes an RL task through the course-to-task adapter without
  conversion work.

### Track P - platform, marketplace, vendors, print, and policy sharing

Owns: `P11-000`, `P11-002`, `P11-003`, `P11-005`, `P11-006`, P11 open exit criteria.

Scope:

- Keep P11 policy sharing fail-closed until dual-use/export-control sanity check
  is accepted.
- Finish public marketplace curation and external publish/equip flow.
- Studio now has a marketplace board with kind/status filters and per-listing
  usage-beta actions for view, equip, policy download, quote click, and training
  job events; public curation state remains open.
- Finish skills marketplace transfer/fine-tune offer for non-matching twins.
- Connect live vendor offer providers for catalog slots behind env-gated,
  sandboxable refresh.
- Finish DfM/3MF printed-parts BOM section and print-provider quote/link handoff.
- Keep direct checkout/payment out of scope unless a new decision changes D29.

Dependencies:

- Needs track V for publish-time validator rows.
- Needs track G wire lists and track D manufacturing checks for printed parts.
- P11 policy listing requires gate acceptance.

Acceptance:

- First external user publishes an admitted model that strangers can equip.
- First printed structural part is handed off through a provider quote link.
- Moderation flow remains live and does not regress.

### Track D - manufacturing checks and export artifacts

Owns: `XC-18` and the DfM portion of `P11-006`.

Scope:

- Implement DfM checks in the validator or worker path for printable structural
  parts: minimum wall, overhang angle, support-volume estimate, and bed fit for
  FDM/SLA profiles.
- Produce oriented 3MF/profile artifacts that can be consumed by track P's quote
  handoff.
- Surface failing diagnostics with suggested fixes, without implying guarantee
  or certification.

Dependencies:

- Uses geometry bake outputs and OCCT/worker support from track C where exact
  B-rep checks are needed.
- Feeds track V check catalog and track P print handoff.

Acceptance:

- Printable structural parts either pass DfM with an artifact or fail with
  actionable diagnostics.
- Printed-parts BOM rows include DfM status and quote-ready artifact references.

### Track M - maintenance twin and repair workflows

Owns: `P12-002`, `P12-004`, P12 open exit criterion.

Scope:

- Crash-forensics scrubber UI over ghost separation and last-seconds replay
  windows is live in Studio as of 2026-06-14 for materialized maintenance records.
- Fleet dashboard is live in Studio as of 2026-06-14 with vehicle counts, due
  maintenance, next actions, wear, repairs, crash windows, reorder rows, and
  vendor/print quote handoff links where the platform commerce rows exist.
- Close the logged-crash exit criterion by producing an actionable repair sheet
  with vendor and print quote links.

Dependencies:

- Needs track H real telemetry/flight recorder for non-fixture crash data.
- Needs track P vendor/print quote links and track D DfM artifacts for repair
  handoff.

Acceptance:

- A logged crash produces a repair sheet ordered by explode chain, with reorder
  SKUs plus vendor and print quote handoff links where needed.
- Fleet dashboard reflects the maintenance records produced by worker jobs.

### Track R - owner/legal/release gates

Owns: `P0-010`, `P11-000`, release/handoff gate coordination, and any future
external hardware rollout gate.

Scope:

- Push or release the local `prototype-final` tag for commit `0294a9d`, or record
  that the owner will do it outside this repo.
- Preserve the D30 lab-only scope: no external beta without a later rollout gate
  based on lab evidence.
- Complete P11 dual-use/export-control sanity check before policy sharing.
- Coordinate physical rig availability and provider sandbox credentials.

Dependencies and blockers:

- Contains owner/counsel actions that code subworkers cannot complete alone.
- Code can prepare fail-closed gates and dry-run fixtures while waiting.

Acceptance:

- Gate records are accepted in `platform_gate_signoffs` only after real owner/legal
  approval.
- Changelog records the signoff source and any scope limits.

## 3. End-to-end closure order

1. Close V/G/S foundations enough that generated, imported, and scanned models
   can all be admitted through the same validator.
2. Close C live photoscan and ETL so catalog truth can come from real sources.
3. Close L one-click training on real engine-backed simulation.
4. Close E courses and O co-design using the same replay/task interfaces.
5. Under D30 lab rules, close H hardware deployment, recorder, ghost, and sys-ID;
   do not expand to external beta without a later rollout gate.
6. Close P marketplace/vendor/print flows and M maintenance twin with real or
   accepted pilot data.
7. Reconcile the TODO ledger: no `[ ]`, `[~]`, or `[!]` rows remain without either
   a closed implementation, a new scoped TODO, or an explicit owner decision.

## 4. Coverage map

| TODO IDs | Track | Current gate |
|---|---|---|
| `P0-007` | G | blocked on later prototype or rescope |
| `P0-010` | R | owner remote tag/release |
| `P1-003`, `P6-001`, `P6-010` | S | engine integration |
| `P1-004`, `P2-001`, `P2-002` | V | validator/package/draft persistence |
| `P1-014`, `P2-003` | G | slots/configurator/arm |
| `P1-017` | S | perf accounting and hardware proof |
| `P3-004`, `P4-016` | C | live ETL/Claude/OCCT adapters |
| `P5-001`, `P5-002`, `P5-006` | C | live GPU/COLMAP/SLO |
| `P7-001`, `P7-003`, `P7-008`, `P7-009`, `P7-010` | L | training and policy adapters |
| `P8-001`, `P8-002`, `P8-003`, `P8-004`, `P8-005`, `P8-006`, `P8-007`, `P8-008`, `P8-009`, `P8-010`, `P8-011`, `P8-012`, `P8-013`, `P8-014` | H | D30 controlled D12 lab gate |
| `P9-002` through `P9-005` | O | simulation/training dependencies |
| `P10-001` through `P10-005` | E | courses/leaderboard UI |
| `P11-000`, `P11-002`, `P11-003`, `P11-005`, `P11-006` | P/R/D | policy gate and providers |
| `P12-002`, `P12-004` | M | telemetry and platform dependencies |
| `XC-03` | G | upgrade-diff UI |
| `XC-11`, `XC-12` | G | couplers and wire lists |
| `XC-18` | D | real DfM checks |
| `XC-19`, `XC-20`, `XC-27` | H | bridge/Desktop hardware work |
| `XC-23` | V | done 2026-06-14: ModelSpec migration runner and CLI |
| `XC-24` | V | done 2026-06-14: fuzz corpus and minimizer |
