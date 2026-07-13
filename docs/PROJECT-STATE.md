# PROJECT STATE - evidence snapshot and readiness boundary

Snapshot date: **2026-07-13**
Repository: `RNT56/TTC`
Verified main: `781dac6` (`origin/main`)
Recovery gate: **G0 closed**

This document records current evidence. It is not the product vision and does not
replace the task or phase ledgers. Refresh it after any material change to CI,
releases, provider readiness, hardware proof, or phase status.

## 1. Executive state

ForgedTTC is an advanced deterministic engineering prototype with real implementation
across all architectural planes. Protected `main` now has a truthful green baseline:
core, generation, WASM, browser parity, gateway, Postgres, workers, coverage,
packaging, dependency audits, and CodeQL pass together.

It is still **not release-ready, production-ready, or field-proven**. G0 proves a
trustworthy development baseline, not publication, live operations, external-user
acceptance, hardware safety, or field outcomes. Most P5-P12 product surfaces prove
contracts or fixture workflows; live providers, training, hardware, external users,
operational recovery, and field evidence remain incomplete.

## 2. Current verified results

| Check | Result | Interpretation |
|---|---|---|
| Git state | protected `main` at `781dac6` | GOV-007 compatibility PR #26 and G1 artifact-contract PR #27 are merged; no `v0.1.0` tag/release exists |
| Rust toolchain | pinned 1.96.0 locally and in workflows | local/CI compiler contract is explicit |
| `pnpm verify` | pass: 31 required non-DB gates on the SEC-004 v0.2 candidate | Action pins, compatibility matrix, fmt, Clippy, full tests, WASM, schema, TS, gateway, Brief-25, oracles, budgets, fuzz, sim, packaging, pilots, workers, diff |
| `pnpm verify:compatibility` | pass: 11/11 surfaces match policy 1.0.0 on the SEC-004 candidate | source constants, manifests, legacy aliases, license/user-data/consent/delete-receipt boundaries, and deprecation floor cannot drift from the machine matrix |
| `cargo test --workspace` | pass | includes quadruped slider-grid and pinned golden coverage |
| Declared first-party verdicts | pass: 5/5 | qd-mini is admitted again without changing the expected verdict |
| Brief-25 real-validator gate | pass: 25 admitted, 0 draft/rejected/blocked | exceeds the binding 20/25 threshold with 0 repair iterations |
| Gateway tests | pass: 41/41, no skips on the SEC-004 candidate | adds current-notice consent grants, missing/stale/wrong-subject refusal, direct-library serialization, immutable withdrawals, five action guards/effects, and successful-route coverage to SEC-002/003 evidence |
| Worker tests | pass: 100/100, including a separate Python 3.12.7 run | adds cancelled-job output discard to current/unsupported replay and license-aware export enforcement |
| Postgres/pgvector gate | pass on populated predecessor and clean scratch database | all 16 migrations, seed, P3/refusal invariants, user export/delete/zero-residue, and five-purpose consent grant/withdraw/immutability/effect lifecycles pass; unchanged rerun skips all checksummed migrations |
| S3-compatible deletion | pass against local MinIO | a unique payload uploads, the production batch-delete adapter removes it, and the subsequent head requires 404 |
| Native/WASM golden parity | pass | all four canonical scenes and normalized validator reports are bit-identical |
| Browser parity gallery | pass: 6/6 | edge F1 0.957-0.995; nightly CLI works locally |
| Rust coverage | pass: 84.34% lines | nightly floor is now 80% |
| WASM budgets | pass | measured bake/patch stay inside binding budgets |
| Rapier/pinned-MuJoCo parity | pass | deterministic fixture comparison; not a live MuJoCo provider run |
| Release packaging dry run | pass | local artifact construction works; no public release exists |
| G1 release workflow candidate | corrected branch run and independent download pass | run `29236010204` passed all native/WASM/aggregate jobs at `02f912d`; its downloaded aggregate independently passed checksums, SPDX, macOS binary/example, and clean WASM-consumer verification; protected-main rerun/tag/Release remain |
| XC-28 equipped variants | local v0.2 candidate; protected proof pending | ModelSpec 2.2 explicit selection, migration refusal for ambiguous legacy slots, selected-only physical consumers, stable source pointers, Studio cards, all 31 local gates, rebuilt WASM, and a real-browser switch/HUD proof pass on `codex/xc28-equipped-variants` |
| SEC-002 prohibited briefs | local v0.2 candidate; protected proof pending | versioned pre-retrieval/provider/mutation refusal across five HTTP surfaces and direct APIs, bounded explicit-exclusion handling, minimal non-content audit rows, fail-closed storage, full 31-step and Postgres gates on `codex/sec002-prohibited-briefs` |
| SEC-003 user data | local v0.2 candidate; protected proof pending | base user-data export 1.0.0, deletion receipt 1.0.0, explicit primary-row purge, secret exclusion, S3-compatible delete-before-commit, Postgres zero-residue and MinIO 404 proof on `codex/sec003-user-export-delete`; SEC-004 extends export to 1.1 with consent history and SEC-005 owns backup lifecycle |
| SEC-004 consent | local v0.2 candidate; protected proof pending | consent ledger 1.0.0 binds five independent purposes to owned subjects/current notices; action checks serialize with grants/withdrawals; late worker output is discarded; bounded withdrawal effects, Studio authority controls, user export 1.1, all 31 local gates, clean/populated Postgres, and real-browser notice/grant/withdraw proof pass on `codex/sec004-consent-ledger`; SEC-005 owns retention/hold/tombstone/backup lifecycle |
| npm audit | pass: no known vulnerabilities | `@auth/core` 0.41.2 removed the vulnerable `cookie@0.6.0` path |
| RustSec audit | pass for root; Desktop audited separately | patched Desktop transitive highs; time-bounded Tauri/glib warning is GOV-011 and blocks Linux release |
| CodeQL | pass: JavaScript/TypeScript and Python | first post-merge scans completed successfully |

The repaired generation baseline is intentionally stronger than the minimum:

- quadruped bodies are printable modules across the full generator slider grid;
- rover compute electronics do not consume a physical collider slot;
- biped, fixed-wing, and quadruped templates split oversized structure;
- arm templates carry executable joint/target parameters;
- deterministic repair can split diagnosed oversized box/cbox/cylinder primitives,
  preserve mass, place modules, and regenerate explode windows.

## 3. GitHub and release posture

Live GitHub evidence checked on 2026-07-13:

- recovery [PR #11](https://github.com/RNT56/TTC/pull/11) and security closeout
  [PR #21](https://github.com/RNT56/TTC/pull/21), then native Desktop
  [PR #22](https://github.com/RNT56/TTC/pull/22) and workflow/SBOM
  [PR #23](https://github.com/RNT56/TTC/pull/23), followed by governance evidence
  [PR #25](https://github.com/RNT56/TTC/pull/25), merged through protection;
- final `main` CI is green at [run 29213288206](https://github.com/RNT56/TTC/actions/runs/29213288206);
- final dependency audits, source SPDX SBOM, and both CodeQL languages are green at
  [run 29213288195](https://github.com/RNT56/TTC/actions/runs/29213288195);
- [ruleset 18843164](https://github.com/RNT56/TTC/rules/18843164) protects `main` with PR-only delivery, strict current
  branches, resolved threads, no force pushes/deletions, and six required checks,
  including the native macOS Desktop compile;
- manual nightly parity/coverage passed on the recovery merge at
  [run 29211055558](https://github.com/RNT56/TTC/actions/runs/29211055558); final-commit rerun
  [29211517706](https://github.com/RNT56/TTC/actions/runs/29211517706) also passed and is the closeout record;
- corrected G1 branch [run 29236010204](https://github.com/RNT56/TTC/actions/runs/29236010204)
  passed Linux, macOS Intel, Windows, WASM, aggregate verification, and provenance at
  `02f912d`; its downloaded aggregate independently passed on macOS, but this is not
  yet protected-main or tagged-release evidence;
- no GitHub Release exists;
- annotated [`prototype-final`](https://github.com/RNT56/TTC/tree/prototype-final)
  resolves to commit `0294a9d`; its frozen file SHA-256 is `ca93489e…`;
- vulnerability alerts, Dependabot security updates, secret scanning, and push
  protection are enabled; dependency review/audit and CodeQL have remote proof;
- Dependabot alert 1 for the upstream Tauri Linux glib chain is dismissed as
  `tolerable_risk` only through 2026-10-12; GOV-011 still blocks Linux release;
- repository Actions policy is `selected`: GitHub-owned Actions plus seven exact
  third-party SHAs are allowed, broad verified-creator access is disabled, and the
  green runs above executed under that policy;
- repository description, README homepage, and 12 focused topics are set; security,
  contribution, support, conduct, issue/PR, debugging, release, and publication
  surfaces are implemented on `codex/g1-public-surfaces` pending protected delivery.
- compatibility [PR #26](https://github.com/RNT56/TTC/pull/26) and release-artifact
  [PR #27](https://github.com/RNT56/TTC/pull/27) are merged on protected `main` at
  `781dac6`; the first main release run exposed the macOS runner/profile bottleneck;
- runner remediation [PR #29](https://github.com/RNT56/TTC/pull/29) selects
  `macos-26-intel`, a 60-minute ceiling, and measured thin LTO. Run
  [29230415603](https://github.com/RNT56/TTC/actions/runs/29230415603) proved every
  platform build/smoke and all required CI/security checks, then found that Actions
  transfer had removed the Linux execute bit before aggregate archiving. Fix
  `02f912d` normalizes and verifies native modes and uses timestamp-free gzip.
  Corrected run [29236010204](https://github.com/RNT56/TTC/actions/runs/29236010204)
  passed every native/WASM/aggregate job; its downloaded aggregate independently
  passed checksum, SPDX, macOS binary/example, and clean WASM-consumer verification;
- no `v0.1.0` tag or GitHub Release exists.

Consequently G0 is **closed** and GOV-007 is protected-main complete. The remaining
G1 boundary is protected delivery and a protected-main release rerun, the annotated
`v0.1.0` tag and verified GitHub Release with post-publication download proof, plus
protected delivery of the public support/security surfaces.

## 4. Capability maturity

| Capability | Current maturity | What is still needed |
|---|---|---|
| Contract/validator/WASM | deterministic local implementation; ModelSpec 2.2 equipped semantics are locally proven | protected v0.2 delivery/publication, checksummed release, clean external install |
| Studio inspection/editing | deterministic local implementation with truthful variant cards and stable-source selection | broader browser E2E, accessibility, real performance matrix, external-user proof |
| Catalog/BOM/license ledger | fixture/local Postgres implementation plus D10 exporter enforcement | live ETL/review operations and live OCCT artifact audit |
| Text generation | 25/25 deterministic template implementation, opt-in provider seam, SEC-002 refusal/audit, and local D34 training-reuse/pattern consent authority | live model/extraction operation, production monitoring/adversarial evaluation, retention/backup privacy, external R1 proof |
| Photoscan | fixture plus command/Modal contracts | real TRELLIS/COLMAP, cache, D13 and under-five-minute evidence |
| Simulation/interop | real Rapier, exporters/importers, pinned parity | live MuJoCo baseline and broader external model proof |
| Training/policy | fixture scorecards and external command seams | real SB3/MuJoCo training and ONNX Runtime browser inference |
| Co-design | deterministic candidate/Pareto contracts | live optimizer and multi-fidelity simulator evidence |
| Courses/leaderboards | schema, routes, verification, Studio fixture surface | real community course, competitors, and verified public board |
| Marketplace/classroom | data/API/UI implementation | dual-use gate, external users, live policy transfer and process ownership |
| Commerce/printing | normalized offer/quote contracts | gateway/provider wiring, true orientation, real quote handoff |
| Desktop/hardware | fail-closed scaffold and pilot documents | signed apps, serial/capture, Link image, lab pilots, field logs |
| Maintenance | deterministic wear/crash/repair/fleet contracts | Desktop-captured field evidence and operating fleet data |

## 5. Reconciled truth and remaining discrepancies

The 2026-07-12 recovery reconciled stale claims about Rapier, driveable imports,
draft persistence, arm support, qd-mini admission, Brief-25, test counts, verification
commands, and the agent entry point. Remaining known gaps are now explicit backlog:

- D10 export enforcement is locally implemented; real OCCT artifacts and provider
  operations still need sandbox/live evidence under P6/P11;
- prohibited-brief refusal/logging, user-scoped export/primary deletion, and
  purpose/subject consent-withdrawal are locally implemented; retention, legal holds,
  tombstones, and backup deletion/restoration remain open (`SEC-005`);
- release/supply-chain hardening and external/live/field acceptance remain open.

## 6. Go/no-go verdicts

| Milestone | Verdict | Blocking evidence |
|---|---|---|
| Continue local development | **Go** | complete local gates are green |
| Merge ordinary feature PRs | **Go through protection** | exact checks and current-branch policy are active |
| Directly push ordinary work to `main` | **No-go by policy** | active ruleset requires a current PR and exact checks |
| Publish validator v0.1 | **No-go** | branch artifact/download proof is green; protected-main rerun, annotated tag, GitHub Release, and post-publication download proof remain |
| Claim deterministic Brief-25 threshold | **Go** | current local result is 25/25 |
| Claim Text-to-CAD GA/product readiness | **No-go** | live provider, user-content privacy, external-user and operational proof incomplete |
| Invite external builders under a product promise | **No-go** | R1 has not been independently proven |
| Enable live provider billing | **No-go** | provider, recovery, cost, and privacy evidence incomplete |
| Execute controlled D12 lab work | **Conditional go** | only under D30 gates and documented physical supervision |
| External hardware beta | **No-go** | no lab evidence or explicit rollout gate |
| Public marketplace/policy sharing | **No-go** | dual-use/process/external proof incomplete |

## 7. Next evidence refresh

The stable ledger currently contains **200 tasks: 116 done, 39 in progress, 43 open,
and 2 explicitly blocked**. All 8 recovery tasks are done. The 84 remaining tasks are
the phase/live/field program plus 4 governance, 8 security, 9 quality, 11 operations,
9 external-proof, and 3 documentation tasks; dependency order is owned by
`EXECUTION-ROADMAP.md`.

Refresh this snapshot when G1 closes or any current gate regresses. Attach release
commit/tag, artifact/checksum/SBOM/provenance links, clean external install/version
proof, rollback notes, security conclusions, and exact remaining task/phase counts.
