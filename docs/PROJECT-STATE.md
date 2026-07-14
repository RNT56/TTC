# PROJECT STATE - evidence snapshot and readiness boundary

Snapshot date: **2026-07-13**
Repository: `RNT56/TTC`
Runtime/security evidence anchor: `d952f60` (PR #31)
Latest verified protected runtime descendant: `7970005` (PR #46; QA-005 fault acceptance)
Latest verified protected evidence descendant: `f2db50c` (PR #47; QA-005 reconciliation)
QA-008 quality/governance evidence anchor: `2589503` (PR #36)
QA-002 browser-builder evidence anchor: `c80accb` (PR #38)
QA-010 external-acceptance evidence anchor: `8708de7` (PR #40)
QA-003 browser/accessibility evidence anchor: `9c1802b` (PR #42)
QA-005 fault-acceptance evidence anchor: `7970005` (PR #46)
QA-007 adversarial-corpus candidate: local branch `codex/qa007-adversarial-corpus` (`[~]`)
Recovery/release gates: **G0 and G1 closed**

This document records current evidence. It is not the product vision and does not
replace the task or phase ledgers. Refresh it after any material change to CI,
releases, provider readiness, hardware proof, or phase status.

## 1. Executive state

ForgedTTC is an advanced deterministic engineering prototype with real implementation
across all architectural planes. Protected `main` now has a truthful green baseline:
core, generation, WASM, browser parity, gateway, Postgres, workers, coverage,
packaging, dependency audits, and CodeQL pass together.

The standalone validator v0.1.0 is now **released and independently install-verified**.
The broader ForgedTTC product remains **not production-ready or field-proven**: G0/G1
prove a trustworthy baseline and release, not live operations, external-user
acceptance, hardware safety, or field outcomes. Most P5-P12 product surfaces prove
contracts or fixture workflows; live providers, training, hardware, external users,
operational recovery, and field evidence remain incomplete.

The native Anthropic ETL and queued vendor-normalizer paths are protected at
**contract/fixture**, not live. Their bounded transports, normalization, persistence,
and local validation are tested without a real credential or provider call. Sandbox
provider output, recovery/observability, billing, and current-terms evidence remain
open.

## 2. Current verified results

| Check | Result | Interpretation |
|---|---|---|
| Git state | SEC-006 runtime/security evidence anchored at protected `d952f60`; latest runtime/QA-005 anchor `7970005`, latest evidence descendant `f2db50c`, QA-004 anchor `e362c54`, QA-003 anchor `9c1802b`, QA-008 anchor `2589503`, and QA-010 evidence-governance anchor `8708de7` are green; annotated `v0.1.0` published | PR #47 reconciliation passed post-merge CI `29292998692` and security `29292998720` at exact `f2db50c`. QA-007 is an unprotected local candidate and cannot change a protected readiness verdict yet |
| Rust toolchain | pinned 1.96.0 locally and in workflows | local/CI compiler contract is explicit |
| `pnpm verify` | pass: 35 required non-DB gates locally at exact QA-005 head `5663900`; equivalent required protected jobs pass at `7970005` | migration source/history/checksum policy joins external acceptance, browser support, golden review, Action pins, compatibility, fmt, Clippy, full tests, WASM, schema, TS, 63 gateway tests, Brief-25 25/25, oracles, budgets, fuzz, sim, packaging, pilots, 122 worker tests, and patch hygiene; the separate required Postgres job owns the populated predecessor and QA-005 fault matrices |
| Golden artifact review | protected through PR #36 for the governing policy and 14-family baseline; QA-007 candidate registers family 15 with 8 exact files/89 cases and one valid append-only record; 10/10 policy tests pass | parent/current registries are unioned against same-patch weakening; record history and ownership cannot be redirected or overlapped; the frozen prototype is immutable; candidate inventory is not protected evidence until required PR/post-merge checks pass |
| External acceptance policy | QA-010 complete through protected PR #40: 8 milestone contracts/templates and 9/9 focused tests pass locally and in required CI | versioned builder/photoscan/training/course/lab/print/marketplace/maintenance scripts require exact revision/environment, role separation, authority, evidence kinds, measurements, findings review, signoffs, and honest pass/fail/stop outcomes; this is evidence governance, not an `EXT-*` result |
| `pnpm verify:compatibility` | pass: 12/12 surfaces match policy 1.0.0 | source constants, manifests, legacy aliases, license/user-data/consent/delete-receipt/lifecycle boundaries, and deprecation floor cannot drift from the machine matrix |
| `cargo test --workspace` | pass | includes quadruped slider-grid and pinned golden coverage |
| Declared first-party verdicts | pass: 5/5 | qd-mini is admitted again without changing the expected verdict |
| Brief-25 real-validator gate | pass: 25 admitted, 0 draft/rejected/blocked | exceeds the binding 20/25 threshold with 0 repair iterations |
| Gateway tests | pass: 63/63 with the real validator in the full gate | includes staged object declaration/completion/refusal, worker-mode command/provider/idempotency/capability negatives, owner-scoped key digests, retry-drift conflict, cross-owner isolation, and no duplicate fixture materialization while retaining the synchronous sandbox route |
| Worker tests | pass: 127/127 on the QA-007 candidate under Python 3.12 | the five new corpus consumers cover replay/provider/citation/export/hardware boundaries; D38, commerce, native ETL, and SEC-006 coverage remain green |
| Postgres/pgvector gate | pass on protected QA-005 merge CI `29292041469` for 21 migrations | the clean plus 20 populated-predecessor matrix, migration 0021 invariants, QA-005 queue/upload fault artifacts, transactional commerce materialization, QA-002 browser loop, and QA-003 three-engine matrix share one isolated job/database boundary; the local Docker VM remains unhealthy and was not modified |
| S3-compatible deletion | pass against local MinIO | a unique payload uploads, the production batch-delete adapter removes it, and the subsequent head requires 404 |
| Native/WASM golden parity | pass | all four canonical scenes and normalized validator reports are bit-identical |
| Browser parity gallery | pass: 6/6 | edge F1 0.957-0.995; nightly CLI works locally |
| QA-002 builder browser E2E | complete at deterministic product-acceptance maturity through PR #38 and protected `c80accb`; revalidated at `7970005` | exact PR CI `29272067712`/security `29272067617` and post-merge CI `29272532186`/security `29272531705` close the task; current protected CI re-proves the production bundle, real WASM, 21 migrations, catalog review, generation, edit, draft refusal, anonymous share/private 401, course, governed owner listing, job, and materialized maintenance; no live-provider or external-user claim |
| QA-003 browser/accessibility acceptance | complete at deterministic supported-browser maturity through PR #42 and protected `9c1802b` | exact PR CI `29282669499`/security `29282669468` and post-merge CI `29283250843`/security `29283250865` pass. The clean merge artifact records real WASM/validator admission and all semantic, skip/focus, keyboard orbit/equip/explode/blueprint, AA contrast, critical-target, responsive, reduced-motion, renderer, asset-isolation, and positive-draw assertions across Chromium 148.0.7778.96, Firefox 150.0.2, and WebKit 26.4. Chromium is full WebGL at 33 draws; Firefox/WebKit are core-baked Canvas2D at 17 draws with no scene/Three.js chunks. WebKit/narrow checks remain proxies, not Apple/mobile-device, assistive-technology, external-user, or field proof |
| QA-004 migration acceptance | complete through PR #44 and protected `e362c54` | exact PR CI `29286731035`/security `29286731271` and post-merge CI `29287274236`/security `29287274293` pass. The clean merge artifact binds source/checkout to `e362c54`, applies 20/20 clean migrations, preserves and idempotently reruns all 19 populated predecessors, and proves atomic rollback/corrected roll-forward, checksum/gap refusal, advisory serialization, and apply once. Production backup/restore/RPO/RTO remains OPS-005 |
| QA-005 fault acceptance | complete at deterministic isolated-Postgres maturity through PR #46 and protected `7970005` | exact implementation head `5663900` passed PR CI `29291536114`/security `29291536115`; synthetic merge `99024b8` had no non-doc implementation delta; post-merge CI `29292041469`/security `29292041441` pass. The clean artifact binds source/checkout to `7970005` and proves crash reclaim, two-attempt one-time materialization, stale/cancelled-result discard, bounded outage recovery, terminal rate exhaustion with its 17 s hint, partial-upload refusal/retry, exact metadata completion, and consent/job success. Multi-replica queues, deployed object storage, provider incidents, shared quotas, and production SLOs remain separate gates |
| QA-007 boundary adversarial corpus | in progress on local candidate | exact eight-file `forge-boundary-fuzz.v1` inventory contains 89 unique cases. Rust contract/sim tests consume patch/import/EnvSpec/replay cases with property-based no-panic checks; Python consumes replay/provider/citation/export/hardware cases. All 35 local gates pass under Python 3.12, including 47 forge-sim unit tests, 5 corpus/property tests, 127/127 worker tests, native/WASM parity, packaging, and patch hygiene. Protected PR/post-merge proof remains required before closure |
| Rust coverage | pass: 84.34% lines | nightly floor is now 80% |
| WASM budgets | pass | measured bake/patch stay inside binding budgets |
| Rapier/pinned-MuJoCo parity | pass | deterministic fixture comparison; not a live MuJoCo provider run |
| Validator v0.1.0 release | pass; G1 closed | protected-main run `29241883791` and tag run `29244972303` passed every contract/native/WASM/SPDX/checksum/attestation step; the public nine-asset Release was downloaded and independently re-verified on macOS |
| XC-28 equipped variants | protected on `main` through PR #30 | ModelSpec 2.2 explicit selection, migration refusal for ambiguous legacy slots, selected-only physical consumers, stable source pointers, Studio cards, native/WASM/browser switch/HUD proof |
| SEC-002 prohibited briefs | protected on `main` through PR #30 | versioned pre-retrieval/provider/mutation refusal across five HTTP surfaces and direct APIs, bounded explicit-exclusion handling, minimal non-content audit rows, and fail-closed storage |
| SEC-003 user data | protected on `main` through PR #30 | explicit primary-row purge, secret exclusion, S3-compatible delete-before-commit, Postgres zero-residue and MinIO 404 proof; SEC-005 extends it to receipt 2.0.0 and restore suppression |
| SEC-004 consent | protected on `main` through PR #30 | consent ledger 1.0.0, five independent purposes, serialized action authority, late-output discard, bounded withdrawal effects, Studio controls, monotonic chronology, Postgres and browser proof |
| SEC-005 data lifecycle | protected contract/fixture on `main` through PR #30 | six retention classes, holds/locks/causal order, tombstones, exact backup manifests, restore suppression, retry/lease recovery, populated/clean/idempotent 19-migration proof; live backup/DR remains OPS-005 |
| SEC-006 application threats | protected contract/fixture complete on `main` through PR #31 | pinned-origin Auth.js/CSRF boundary, production config failure, header-only ephemeral provider key with persistence/reflection regression, bounded JSON/network/process/object/archive controls, prompt-injection containment, framework-visible plus classed rate limits, 32/32 local gate with 59/59 gateway and 104/104 workers, archive/published-release proof, exact-tree remote Postgres, CI/security, dependency, SBOM, CodeQL, and Desktop proof; deployed egress/distributed quotas/rotation/incident evidence remain operations work |
| Native Anthropic catalog ETL | protected contract/fixture through PR #33 at `12b65d2` (D36), P3-004/P4-016 remain in progress | fixture and command precedence; fixed Messages endpoint/API/model; header-only deployment key; forced strict supported-subset envelope; bounded request/response/tool input; local identity/mass/confidence/license/price/citation validation; source/model/API provenance; no credentialed sandbox, live persistence, billing/recovery, or OCCT proof |
| Queued vendor refresh | protected contract/fixture through PR #34 at `18f54fd`; P11-005 remains in progress | explicit local-only queue path; owner-scoped request-bound idempotency; command required at enqueue and execution; bounded normalized output; second transactional validation before `vendor_offers`; no direct gateway live HTTP bypass, credentialed provider, deployed quota/monitoring/recovery, billing, or current-terms proof |
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
- v0.2 integration [PR #30](https://github.com/RNT56/TTC/pull/30) delivered
  ModelSpec 2.2/XC-28, SEC-001..005, public support/security surfaces, and the G1
  evidence reconciliation at exact merge `d34b6fd` after all required checks,
  dependency audit/review, both CodeQL languages, and source SPDX passed;
- application-threat [PR #31](https://github.com/RNT56/TTC/pull/31) completed the
  SEC-006 contract/fixture acceptance on implementation head `1f7cf41`: CI run
  `29251276475`, security run `29251276469`, and the PR-level CodeQL result passed,
  including the exact-tree Postgres gate and the two Auth.js route-rate findings;
  it merged through protection at exact `d952f60`;
- post-merge `main` CI [run 29251978420](https://github.com/RNT56/TTC/actions/runs/29251978420)
  and security [run 29251978330](https://github.com/RNT56/TTC/actions/runs/29251978330)
  completed successfully at exact merge `d952f60` and are the SEC-006 exact-commit
  evidence, including Postgres, TypeScript/gateway, both CodeQL languages, dependency
  audits, source SPDX, and native Desktop;
- evidence reconciliation [PR #32](https://github.com/RNT56/TTC/pull/32) merged as
  docs-only `b48f8a0`; descendant CI
  [29252793587](https://github.com/RNT56/TTC/actions/runs/29252793587) and security
  [29252793485](https://github.com/RNT56/TTC/actions/runs/29252793485) passed workers,
  Postgres, Rust, TypeScript/gateway, native Desktop, both CodeQL languages,
  dependency audits, and source SPDX. These runs prove the descendant is green; the
  SEC-006 runtime evidence remains anchored at `d952f60` rather than creating a
  documentation-hash loop;
- native Anthropic ETL [PR #33](https://github.com/RNT56/TTC/pull/33) merged at
  `12b65d2`; exact post-merge CI
  [29255595803](https://github.com/RNT56/TTC/actions/runs/29255595803) and security
  [29255595829](https://github.com/RNT56/TTC/actions/runs/29255595829) passed the
  19-migration Postgres gate, workers, Rust, TypeScript/gateway, native Desktop,
  audits, source SPDX, and both CodeQL languages. This proves the bounded native ETL
  contract/fixture descendant, not a credentialed provider call;
- queued commerce [PR #34](https://github.com/RNT56/TTC/pull/34) merged at
  `18f54fd`; exact post-merge CI
  [29260837182](https://github.com/RNT56/TTC/actions/runs/29260837182) and security
  [29260833090](https://github.com/RNT56/TTC/actions/runs/29260833090) passed all 20
  migrations, concurrent gateway retry/request-binding/owner-scope acceptance,
  worker success/corrupt-output rollback, 115 worker tests, 61 gateway tests,
  Brief-25 25/25, Rust, native Desktop, audits, source SPDX, and both CodeQL
  languages. This proves the queue and transactional normalizer at contract/fixture
  maturity, not a credentialed vendor operation;
- commerce evidence [PR #35](https://github.com/RNT56/TTC/pull/35) merged docs-only
  at `4fe0df6`; exact post-merge CI
  [29262255427](https://github.com/RNT56/TTC/actions/runs/29262255427) and security
  [29262256860](https://github.com/RNT56/TTC/actions/runs/29262256860) passed Rust,
  Postgres, workers, TypeScript/gateway, native Desktop, dependency audits, source
  SPDX, and both CodeQL languages. This proves the descendant is green without
  changing PR #34's runtime maturity boundary;
- golden review [PR #36](https://github.com/RNT56/TTC/pull/36) passed exact-head CI
  [29264389481](https://github.com/RNT56/TTC/actions/runs/29264389481) and security
  [29264386113](https://github.com/RNT56/TTC/actions/runs/29264386113) at `4497c83`,
  then merged through protection as `2589503`. Exact post-merge CI
  [29264679254](https://github.com/RNT56/TTC/actions/runs/29264679254) and security
  [29264678863](https://github.com/RNT56/TTC/actions/runs/29264678863) passed the new
  golden-policy step, Rust, Postgres, workers, TypeScript/gateway, native Desktop,
  dependency audits, source SPDX, and both CodeQL languages. This closes QA-008
  without adding provider, user-acceptance, hardware, or field authority;
- builder acceptance [PR #38](https://github.com/RNT56/TTC/pull/38) passed exact-head
  CI [29272067712](https://github.com/RNT56/TTC/actions/runs/29272067712) and security
  [29272067617](https://github.com/RNT56/TTC/actions/runs/29272067617) at `6a8ce28`,
  including the green replacement PR-level CodeQL result after the owner-listing
  route was bound to the official framework limiter. It merged through protection as
  `c80accb`; exact post-merge CI
  [29272532186](https://github.com/RNT56/TTC/actions/runs/29272532186) and security
  [29272531705](https://github.com/RNT56/TTC/actions/runs/29272531705) passed all ten
  structured browser flows, 20 migrations, transactional commerce materialization,
  Rust, workers, TypeScript/gateway, native Desktop, audits, source SPDX, and both
  CodeQL languages. This closes QA-002 at deterministic product-acceptance maturity,
  not external-user or live-provider maturity;
- external-acceptance governance [PR #40](https://github.com/RNT56/TTC/pull/40)
  passed exact-head CI
  [29275447135](https://github.com/RNT56/TTC/actions/runs/29275447135) and security
  [29275447237](https://github.com/RNT56/TTC/actions/runs/29275447237) at `74bae6e`,
  including the required external-acceptance policy step, 9/9 focused tests, the
  isolated Postgres/real-browser gate, dependency review/audit, source SPDX, native
  Desktop, and both CodeQL languages. It merged through protection as `8708de7`;
  exact post-merge CI
  [29275850838](https://github.com/RNT56/TTC/actions/runs/29275850838) and security
  [29275851177](https://github.com/RNT56/TTC/actions/runs/29275851177) passed the
  34-step policy baseline and all runtime/security jobs. This closes QA-010's
  evidence kit only; every `EXT-*`, live-provider, hardware, and field verdict stays
  unchanged;
- browser/accessibility acceptance [PR #42](https://github.com/RNT56/TTC/pull/42)
  passed exact-head CI
  [29282669499](https://github.com/RNT56/TTC/actions/runs/29282669499) and security
  [29282669468](https://github.com/RNT56/TTC/actions/runs/29282669468) at `caed237`,
  then merged through protection as `9c1802b`. Exact post-merge CI
  [29283250843](https://github.com/RNT56/TTC/actions/runs/29283250843) and security
  [29283250865](https://github.com/RNT56/TTC/actions/runs/29283250865) passed all
  runtime/security jobs. The clean merge artifact binds source and checkout to
  `9c1802b`, passes QA-002 10/10, and records QA-003's three declared engine tiers,
  real hashed WASM, renderer/asset isolation, positive draws, keyboard interaction,
  AA contrast, narrow containment, and reduced motion. This closes QA-003 only at
  deterministic supported-browser maturity;
- migration acceptance [PR #44](https://github.com/RNT56/TTC/pull/44) passed
  exact-head CI
  [29286731035](https://github.com/RNT56/TTC/actions/runs/29286731035) and security
  [29286731271](https://github.com/RNT56/TTC/actions/runs/29286731271) at `f44ee86`,
  then merged through protection as `e362c54`. Exact post-merge CI
  [29287274236](https://github.com/RNT56/TTC/actions/runs/29287274236) and security
  [29287274293](https://github.com/RNT56/TTC/actions/runs/29287274293) passed all
  runtime/security jobs. The clean merge artifact binds source and checkout to
  `e362c54`, applies 20/20 current migrations on clean Postgres 16.14/pgvector 0.8.5,
  preserves and idempotently reruns every populated predecessor `0001`..`0019`, and
  proves atomic failure recovery, drift/gap refusal, and concurrent apply-once. This
  closes QA-004 at deterministic isolated-Postgres maturity, not OPS-005 or QA-009;
- [ruleset 18843164](https://github.com/RNT56/TTC/rules/18843164) protects `main` with PR-only delivery, strict current
  branches, resolved threads, no force pushes/deletions, and six required checks,
  including the native macOS Desktop compile;
- manual nightly parity/coverage passed on the recovery merge at
  [run 29211055558](https://github.com/RNT56/TTC/actions/runs/29211055558); final-commit rerun
  [29211517706](https://github.com/RNT56/TTC/actions/runs/29211517706) also passed and is the closeout record;
- corrected G1 branch [run 29236010204](https://github.com/RNT56/TTC/actions/runs/29236010204)
  passed Linux, macOS Intel, Windows, WASM, aggregate verification, and provenance at
  `02f912d`; its downloaded aggregate independently passed on macOS and established
  the pre-merge positive proof;
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
  surfaces are protected on `main` through PR #30;
- compatibility [PR #26](https://github.com/RNT56/TTC/pull/26), release-artifact
  [PR #27](https://github.com/RNT56/TTC/pull/27), and runner/download verification
  [PR #29](https://github.com/RNT56/TTC/pull/29) are merged on protected `main` at
  `1093842`; the first main release run exposed the macOS runner/profile bottleneck;
- runner remediation [PR #29](https://github.com/RNT56/TTC/pull/29) selects
  `macos-26-intel`, a 60-minute ceiling, and measured thin LTO. Run
  [29230415603](https://github.com/RNT56/TTC/actions/runs/29230415603) proved every
  platform build/smoke and all required CI/security checks, then found that Actions
  transfer had removed the Linux execute bit before aggregate archiving. Fix
  `02f912d` normalizes and verifies native modes and uses timestamp-free gzip.
  Corrected run [29236010204](https://github.com/RNT56/TTC/actions/runs/29236010204)
  passed every native/WASM/aggregate job; its downloaded aggregate independently
  passed checksum, SPDX, macOS binary/example, and clean WASM-consumer verification;
- protected-main manual release run
  [29241883791](https://github.com/RNT56/TTC/actions/runs/29241883791) passed the
  contract, Linux, Windows, macOS, WASM, both SPDX SBOMs, checksums, downloaded-payload
  verification, provenance attestation, and aggregate upload at exact `1093842`; its
  downloaded aggregate then passed the verifier outside Actions;
- annotated tag `v0.1.0` points to `1093842`; tag
  [run 29244972303](https://github.com/RNT56/TTC/actions/runs/29244972303) rebuilt and
  verified every platform and published the non-draft
  [nine-asset GitHub Release](https://github.com/RNT56/TTC/releases/tag/v0.1.0);
- every published asset was downloaded after publication. `SHA256SUMS`, artifact
  SPDX, macOS x86_64 `forge-validate 0.1.0`, canonical admission, and a clean
  `@forge/validate-wasm` 0.1.0 consumer all passed independently;
- crates.io/npm publication is deliberately deferred: no registry token is present,
  and no owner decision authorized a credentialed registry publication.

Consequently G0 and G1 are **closed**, and the public-surface/XC-28/SEC-001..005 v0.2
stack is protected on `main`. Remaining Wave 1 work is the real-mid-hardware P1
budget, qualified name review, and the explicitly deferred owner-credential registry
decision; none is a hidden release claim.

## 4. Capability maturity

| Capability | Current maturity | What is still needed |
|---|---|---|
| Contract/validator/WASM | v0.1.0 released with protected-main/tag attestations and post-publication install proof; ModelSpec 2.2 equipped semantics are protected on `main` | registry publication only after an explicit owner/credential decision |
| Studio inspection/editing | protected deterministic implementation with truthful variant cards, stable-source selection, complete QA-002 real-WASM/isolated-DB browser acceptance, and protected QA-003 three-engine semantic/keyboard/focus/contrast/target/responsive/reduced-motion acceptance | representative assistive-technology and vendor-device review, real performance matrix, and external-user proof |
| Catalog/BOM/license ledger | fixture/local Postgres implementation, D10 exporter enforcement, and native bounded Anthropic ETL contract | credentialed ETL sandbox, real-result persistence/review operations, provider recovery, and live OCCT artifact audit |
| Text generation | 25/25 deterministic template implementation, opt-in provider seam, protected SEC-002/D34/D35 authority, protected SEC-006 key/network/input/prompt bounds, and native ETL contract | credentialed model/extraction sandbox, deployed egress/quotas/log review, OPS-005 backup/DR, external R1 proof |
| Photoscan | fixture plus command/Modal contracts | real TRELLIS/COLMAP, cache, D13 and under-five-minute evidence |
| Simulation/interop | real Rapier, exporters/importers, pinned parity | live MuJoCo baseline and broader external model proof |
| Training/policy | fixture scorecards and external command seams | real SB3/MuJoCo training and ONNX Runtime browser inference |
| Co-design | deterministic candidate/Pareto contracts | live optimizer and multi-fidelity simulator evidence |
| Courses/leaderboards | schema, routes, verification, Studio fixture surface | real community course, competitors, and verified public board |
| Marketplace/classroom | data/API/UI implementation | dual-use gate, external users, live policy transfer and process ownership |
| Commerce/printing | synchronous sandbox links plus protected contract/fixture queued vendor normalizer and transactional offer materialization; print quote normalizer remains a helper contract | credentialed vendor sandbox, deployed egress/quotas/monitoring/retry/recovery/billing/current terms, true orientation, and real print quote handoff |
| Desktop/hardware | fail-closed scaffold and pilot documents | signed apps, serial/capture, Link image, lab pilots, field logs |
| Maintenance | deterministic wear/crash/repair/fleet contracts | Desktop-captured field evidence and operating fleet data |
| External acceptance governance | versioned QA-010 registry/CLI/templates are protected through PR #40 at `8708de7` | separately execute and review `EXT-001..008` runs with intended people/providers/hardware; structural validation alone never closes them |

## 5. Reconciled truth and remaining discrepancies

The 2026-07-12 recovery reconciled stale claims about Rapier, driveable imports,
draft persistence, arm support, qd-mini admission, Brief-25, test counts, verification
commands, and the agent entry point. Remaining known gaps are now explicit backlog:

- D10 export enforcement is protected on `main`; real OCCT artifacts and provider
  operations still need sandbox/live evidence under P6/P11;
- prohibited-brief refusal/logging, user-scoped export/primary deletion,
  purpose/subject consent-withdrawal, and retention/hold/tombstone/restore suppression
  are protected on `main`; production backup/provider deletion/restore/DR remains
  open under `OPS-005`;
- SEC-006 deterministically bounds application trust surfaces; connection-time
  egress, distributed rate/cost state, external-log inspection, workload isolation,
  rotation, and incident drills remain operations evidence;
- native Anthropic ETL is implemented and adversarially tested without a credential;
  real provider output through dedupe, immutable catalog persistence, owner review,
  BOM, and lawful export remains the P3-004/P4-016 R1 acceptance path;
- queued vendor refresh now has one local-only, idempotent gateway-to-worker path and
  transactionally revalidated offer materialization with protected 20-migration,
  concurrency, and rollback proof; a real vendor sandbox with egress, quota,
  monitoring, recovery, billing, and terms evidence remains P11-005 work;
- QA-005's protected D38 boundary fences each at-least-once attempt with an opaque
  expiry, bounds transient retry, rejects stale/cancelled completion, and keeps client
  uploads staged until server-inspected length/type/checksum match. Exact PR and
  post-merge isolated-Postgres artifacts prove this deterministic boundary; production
  partitions, dead-letter operations, object-provider incidents, queue SLOs, and
  shared quotas remain OPS/QA work;
- QA-007's local candidate makes malformed/non-finite imports, replay, EnvSpec,
  citations, D10 exports, provider rows, and hardware payloads durable governed
  regressions. It also rejects command newlines, duplicate telemetry time, malformed
  supervisor vectors, and non-finite safety limits. The corpus is deterministic
  fixture evidence, not provider, external-import diversity, hardware, load, or field
  proof, and it remains `[~]` pending protection;
- QA-002 deterministic builder acceptance, QA-003's production-bundle three-engine
  semantic/keyboard/focus/contrast/target/responsive/reduced-motion matrix, and
  QA-010's machine-checked external scripts/evidence templates are protected on
  `main`. Real assistive-technology/device review, performance, and the actual
  independent-builder run remain QA-006 and EXT-001;
- external/live/field acceptance remains open; public support/v0.2 delivery and the
  standalone v0.1.0 release/supply-chain gate are closed.

## 6. Go/no-go verdicts

| Milestone | Verdict | Blocking evidence |
|---|---|---|
| Continue local development | **Go** | complete local gates are green |
| Merge ordinary feature PRs | **Go through protection** | exact checks and current-branch policy are active |
| Directly push ordinary work to `main` | **No-go by policy** | active ruleset requires a current PR and exact checks |
| Publish validator v0.1 | **Complete** | protected-main and tag workflows, annotated tag, nine assets, checksums/SPDX/provenance, and post-publication binary/WASM verification are green |
| Claim deterministic Brief-25 threshold | **Go** | current local result is 25/25 |
| Claim Text-to-CAD GA/product readiness | **No-go** | live provider, user-content privacy, external-user and operational proof incomplete |
| Invite external builders under a product promise | **No-go** | R1 has not been independently proven |
| Enable live provider billing | **No-go** | provider, recovery, cost, and privacy evidence incomplete |
| Execute controlled D12 lab work | **Conditional go** | only under D30 gates and documented physical supervision |
| External hardware beta | **No-go** | no lab evidence or explicit rollout gate |
| Public marketplace/policy sharing | **No-go** | dual-use/process/external proof incomplete |

## 7. Next evidence refresh

The stable ledger currently contains **200 tasks: 136 done, 38 in progress, 25 open,
and 1 explicitly blocked**. All 8 recovery tasks are done. The 64 remaining tasks are
the phase/live/field program plus 2 governance, 2 security, 3 quality, 10 operations,
9 external-proof, and 2 documentation tasks; dependency order is owned by
`EXECUTION-ROADMAP.md`.

Refresh this snapshot when the next task changes the boundary or any current gate
regresses. Preserve the v0.1.0 tag/run/asset evidence and record exact remaining
task/phase counts after every status transition.
