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
