# PROJECT STATE - evidence snapshot and readiness boundary

Snapshot date: **2026-07-13**
Repository: `RNT56/TTC`
Verified main: `137c440` (`origin/main`)
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
| Git state | clean protected `main` at `137c440` before the GOV-007 branch | PR #25 and exact post-merge CI/security are green |
| Rust toolchain | pinned 1.96.0 locally and in workflows | local/CI compiler contract is explicit |
| `pnpm verify` | pass: 31 required non-DB gates | Action pins, compatibility matrix, fmt, Clippy, full tests, WASM, schema, TS, gateway, Brief-25, oracles, budgets, fuzz, sim, packaging, pilots, workers, diff |
| `pnpm verify:compatibility` | pass: 7/7 surfaces match policy 1.0.0 | source constants, manifests, legacy aliases, and deprecation floor cannot drift from the machine matrix |
| `cargo test --workspace` | pass | includes quadruped slider-grid and pinned golden coverage |
| Declared first-party verdicts | pass: 5/5 | qd-mini is admitted again without changing the expected verdict |
| Brief-25 real-validator gate | pass: 25 admitted, 0 draft/rejected/blocked | exceeds the binding 20/25 threshold with 0 repair iterations |
| Gateway tests | pass: 26/26 | includes direct oversized-part repair regression coverage |
| Worker tests | pass: 89/89 | includes current and unsupported replay-format behavior |
| Postgres/pgvector gate | pass | all 14 migrations, seed, and P3 invariants pass against the Compose service |
| Native/WASM golden parity | pass | all four canonical scenes and normalized validator reports are bit-identical |
| Browser parity gallery | pass: 6/6 | edge F1 0.957-0.995; nightly CLI works locally |
| Rust coverage | pass: 84.34% lines | nightly floor is now 80% |
| WASM budgets | pass | measured bake/patch stay inside binding budgets |
| Rapier/pinned-MuJoCo parity | pass | deterministic fixture comparison; not a live MuJoCo provider run |
| Release packaging dry run | pass | local artifact construction works; no public release exists |
| G1 release workflow candidate | branch run and external download pass | run `29236010204` passed all native/WASM/aggregate jobs at `02f912d`; the aggregate then passed independent checksum, SPDX, macOS binary/example, and clean WASM-consumer verification; protected-main rerun/tag/Release remain |
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

Consequently G0 is **closed**, and the GOV-007 compatibility contract is locally
complete pending its protected merge. The remaining G1 boundary is cross-platform
artifacts, artifact SBOM/provenance/checksums, downloaded install/version proof, and
accurate public support/security surfaces.

## 4. Capability maturity

| Capability | Current maturity | What is still needed |
|---|---|---|
| Contract/validator/WASM | deterministic local implementation, green as a workspace | protected publication, checksummed release, clean external install |
| Studio inspection/editing | deterministic local implementation | browser E2E, accessibility, real performance matrix, external-user proof |
| Catalog/BOM/license ledger | fixture/local Postgres implementation | live ETL/review operations and actual exporter enforcement |
| Text generation | 25/25 deterministic template implementation plus opt-in provider seam | live model/extraction operation, refusal/logging, external R1 proof |
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

- P11's license/export policy still lacks restricted-geometry envelope substitution
  in actual exporters (`SEC-001`);
- prohibited-brief refusal/logging and full user-content deletion are not implemented
  (`SEC-002..005`);
- release/supply-chain hardening and external/live/field acceptance remain open.

## 6. Go/no-go verdicts

| Milestone | Verdict | Blocking evidence |
|---|---|---|
| Continue local development | **Go** | complete local gates are green |
| Merge ordinary feature PRs | **Go through protection** | exact checks and current-branch policy are active |
| Directly push ordinary work to `main` | **No-go by policy** | active ruleset requires a current PR and exact checks |
| Publish validator v0.1 | **No-go** | branch artifact/download proof is green; protected-main rerun, annotated tag, GitHub Release, and post-publication download proof remain |
| Claim deterministic Brief-25 threshold | **Go** | current local result is 25/25 |
| Claim Text-to-CAD GA/product readiness | **No-go** | live provider, refusal/privacy, external-user and operational proof incomplete |
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
