# PROJECT STATE - evidence snapshot and readiness boundary

Snapshot date: **2026-07-12**  
Repository: `RNT56/TTC`  
Remote base: `3745d1f` (`origin/main`)  
Recovery state: `codex/recover-truthful-green`, pending PR/merge

This document records current evidence. It is not the product vision and does not
replace the task or phase ledgers. Refresh it after any material change to CI,
releases, provider readiness, hardware proof, or phase status.

## 1. Executive state

ForgedTTC is an advanced deterministic engineering prototype with real implementation
across all architectural planes. The local recovery tree now has a truthful green
baseline: core, generation, WASM, browser parity, gateway, Postgres, workers,
coverage, packaging, and documentation gates pass together.

It is still **not release-ready, production-ready, or field-proven**. The recovery
has not been merged, remote `main` still reports the previous failures, and default-
branch governance is absent. Most P5-P12 product surfaces prove contracts or
fixture workflows; live providers, training, hardware, external users, operational
recovery, and field evidence remain incomplete.

## 2. Current verified results

| Check | Result | Interpretation |
|---|---|---|
| Git state | recovery branch based on remote `3745d1f` | local evidence is current but not yet merged |
| Rust toolchain | pinned 1.96.0 locally and in workflows | local/CI compiler contract is explicit |
| `pnpm verify` | pass: 29 required non-DB gates | fmt, Clippy, full tests, WASM, schema, TS, gateway, Brief-25, oracles, budgets, fuzz, sim, packaging, pilots, workers, diff |
| `cargo test --workspace` | pass | includes quadruped slider-grid and pinned golden coverage |
| Declared first-party verdicts | pass: 5/5 | qd-mini is admitted again without changing the expected verdict |
| Brief-25 real-validator gate | pass: 25 admitted, 0 draft/rejected/blocked | exceeds the binding 20/25 threshold with 0 repair iterations |
| Gateway tests | pass: 26/26 | includes direct oversized-part repair regression coverage |
| Worker tests | pass: 88/88 | deterministic Python plane healthy locally |
| Postgres/pgvector gate | pass | all 14 migrations, seed, and P3 invariants pass against the Compose service |
| Native/WASM golden parity | pass | all four canonical scenes and normalized validator reports are bit-identical |
| Browser parity gallery | pass: 6/6 | edge F1 0.957-0.995; nightly CLI works locally |
| Rust coverage | pass: 84.34% lines | nightly floor is now 80% |
| WASM budgets | pass | measured bake/patch stay inside binding budgets |
| Rapier/pinned-MuJoCo parity | pass | deterministic fixture comparison; not a live MuJoCo provider run |
| Release packaging dry run | pass | local artifact construction works; no public release exists |
| npm audit | pass: no known vulnerabilities | `@auth/core` 0.41.2 removed the vulnerable `cookie@0.6.0` path |

The repaired generation baseline is intentionally stronger than the minimum:

- quadruped bodies are printable modules across the full generator slider grid;
- rover compute electronics do not consume a physical collider slot;
- biped, fixed-wing, and quadruped templates split oversized structure;
- arm templates carry executable joint/target parameters;
- deterministic repair can split diagnosed oversized box/cbox/cylinder primitives,
  preserve mass, place modules, and regenerate explode windows.

## 3. GitHub and release posture

Live GitHub state checked on 2026-07-12:

- remote `main` is still `3745d1f`; its latest CI/nightly evidence is red because the
  recovery tree has not been published;
- no open PR exists;
- `main` is unprotected and no repository ruleset is active;
- no GitHub Release exists;
- the only remote tag is `p3-baseline`;
- `prototype-final` is absent locally and remotely;
- vulnerability alerts, Dependabot security updates, secret scanning, and push
  protection are enabled; new update/audit/CodeQL workflows await merge and first run;
- repository description and homepage remain empty.

Consequently G0 is **locally satisfied but not remotely closed**. Required remaining
proof is one PR on this exact tree, green PR checks, an active exact-check ruleset,
protected merge, green post-merge checks, and a green manual/scheduled nightly.

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
- `prototype-final` must be recreated only after its intended commit is verified;
- remote governance, security automation, release proof, and external/live/field
  acceptance remain open.

## 6. Go/no-go verdicts

| Milestone | Verdict | Blocking evidence |
|---|---|---|
| Continue local development | **Go** | complete local gates are green |
| Open a recovery PR | **Go** | exact tree is locally verified; remote review/checks are the next gate |
| Directly push/merge ordinary work to `main` | **No-go** | no protection or required checks |
| Publish validator v0.1 | **No-go** | G0 remote closeout and release contract incomplete |
| Claim deterministic Brief-25 threshold | **Go** | current local result is 25/25 |
| Claim Text-to-CAD GA/product readiness | **No-go** | live provider, refusal/privacy, external-user and operational proof incomplete |
| Invite external builders under a product promise | **No-go** | R1 has not been independently proven |
| Enable live provider billing | **No-go** | provider, recovery, cost, and privacy evidence incomplete |
| Execute controlled D12 lab work | **Conditional go** | only under D30 gates and documented physical supervision |
| External hardware beta | **No-go** | no lab evidence or explicit rollout gate |
| Public marketplace/policy sharing | **No-go** | dual-use/process/external proof incomplete |

## 7. Next evidence refresh

Refresh this snapshot when G0 closes. Attach:

- recovery commit and PR URL;
- green PR and post-merge CI URLs;
- active ruleset with exact required check names;
- green manual/scheduled nightly URL and artifacts;
- dependency/security automation evidence;
- exact remaining task and phase counts.
