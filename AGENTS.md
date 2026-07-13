# ForgedTTC repository guide

This is the canonical entry point for humans and coding agents working in this
repository. Read it before changing code, data, workflows, or living documentation.
`CLAUDE.md` is a compatibility pointer to this file.

The parent workspace `AGENTS.md` also applies. Its feature-parity rule is binding if
this repository gains a `FEATURE_PARITY.md`; no such file exists at the time of this
entry.

## 1. Mission

ForgedTTC is an evidence-preserving robotics design system:

> describe -> assemble -> validate -> simulate -> train -> share -> build -> record -> repair -> improve

It is positioned upstream of mechanical CAD. The product bar is a physically honest,
simulation-ready, buildable robotics contract with provenance, not arbitrary
surface-perfect CAD. The canonical model carries geometry, parts, mass properties,
compatibility, validation, exports, policies, BOMs, telemetry, and repair history.

The governing doctrine is "not a toy": SI units, sourced or computed physics,
validator sovereignty, provenance everywhere, license-aware exports, and fail-closed
hardware authority.

## 2. Read order and source-of-truth hierarchy

Read in this order for every non-trivial session:

1. `AGENTS.md` — working rules and required gates.
2. `docs/PROJECT-STATE.md` — dated evidence snapshot and current blockers.
3. The newest `CHANGELOG.md` entry — what changed most recently.
4. `docs/ROADMAP.md` — phase goals and exit criteria.
5. `docs/TODO.md` — atomic task ledger with stable IDs.
6. `docs/EXECUTION-ROADMAP.md` — dependency order, workstreams, and acceptance gates.
7. The relevant `docs/systems/*.md` and `docs/BEST-PRACTICES.md` before implementation.
8. `docs/BROWSER-SUPPORT.md` before changing Studio semantics, focus, keyboard or
   pointer interaction, responsive layout, motion, browser detection, worker/local
   fallback, or browser-support claims.
9. `docs/EXTERNAL-ACCEPTANCE.md` before preparing, executing, reviewing, publishing,
   or using evidence from an external user, provider, course, print, lab, or field run.
10. `docs/GOLDEN-ARTIFACTS.md` before changing any registered schema, render,
   physics, validator, corpus, or committed generated-runtime artifact.
11. `docs/THREAT-MODEL.md` before changing authentication, public routes, providers,
   outbound network access, secrets, uploads, workers, callbacks, rate limits, logs,
   or release archive handling.
12. `docs/COMPATIBILITY.md` before changing schemas, reports, CLI/WASM APIs, replay,
   EnvSpec, consent/export/deletion records, worker artifacts, or version numbers.
13. `docs/REPOSITORY-GOVERNANCE.md` before changing workflows, checks, branch rules,
   dependencies, or releases.
14. `docs/RELEASE.md` before building, tagging, publishing, withdrawing, or verifying
    a validator release.
15. `docs/PUBLICATION.md` before adding registry credentials or publishing crates/npm.
16. `docs/DATA-LIFECYCLE.md` before changing export/deletion, retention, legal holds,
    backup catalogs/adapters, restore behavior, or lifecycle audit evidence.

When documents disagree, use this authority order:

1. Current executable evidence: code, tests, CI, releases, and deployed/field proof.
2. `docs/DECISIONS.md` — binding decisions; supersede with a new decision, never
   silently rewrite history.
3. `docs/FORGE-plan.md` — definitive product vision and architecture.
4. `docs/systems/*.md` — implementation contracts.
5. `docs/PROJECT-STATE.md`, `docs/ROADMAP.md`, `docs/TODO.md`, and
   `docs/EXECUTION-ROADMAP.md` — living execution truth.
6. Historical plans — context only.

If executable evidence contradicts a living status document, update the document in
the same change. Never make code imitate a stale checkbox.

## 3. Current boundary

The repository contains a broad deterministic v0 across the Rust core, React Studio,
Fastify gateway, Postgres data plane, Python workers, and Tauri shell. The standalone
validator v0.1.0 is released and independently verified; the broader product is not
production-proven or ready for live-provider, external-beta, or field claims.

As of the dated snapshot in `docs/PROJECT-STATE.md`:

- the SEC-006 contract/fixture runtime evidence remains anchored at protected PR #31
  and exact post-merge CI `29251978420`/security `29251978330` at `d952f60`; the
  latest verified protected runtime descendant is QA-002 PR #38 at `c80accb`, with
  CI `29272532186` and security `29272531705` green;
- QA-008's protected implementation anchor is PR #36 at `2589503`, with exact
  post-merge CI `29264679254` and security `29264678863` green; this advances the
  quality/governance boundary, not runtime maturity;
- QA-010's protected evidence-governance anchor is PR #40 at `8708de7`, with exact
  PR CI `29275447135`/security `29275447237` and post-merge CI `29275850838`/
  security `29275851177` green; this makes external acceptance executable but does
  not supply an independent participant, provider, controlled rig, or field result;
- Brief-25 admits 25/25, every declared first-party verdict matches, and the nightly
  browser/coverage commands pass locally;
- protected `main` is green in PR, post-merge CI/security, and manual nightly proof;
- the byte-exact prototype is published as annotated tag `prototype-final`;
- workflow Actions are immutable-SHA pinned and run under a selected allowlist; the
  security workflow emits a validated SPDX source SBOM;
- compatibility policy 1.0.0 is machine-checked across twelve public format/package
  boundaries; the CLI/WASM facades expose their active versions;
- QA-008 is protected through PR #36: fourteen registered golden artifact families
  are machine-governed, the frozen prototype is immutable, and any registered re-pin
  requires a new append-only evidence record. QA-010 is protected through PR #40:
  the baseline now has 34 local steps and a machine-checked external-acceptance
  policy across eight milestones;
- QA-002 is protected through PR #38: the production Studio bundle, real built WASM,
  downloaded validator artifact, gateway, and isolated Postgres pass all ten builder
  flows under `pnpm verify:db` on the exact PR head and merge commit; this is
  deterministic product acceptance, not live-provider or external-user proof;
- QA-003 is an active candidate: the production share/configurator journey passes
  locally in Chromium, Firefox, and WebKit with real WASM plus semantic, keyboard,
  focus, contrast, target-size, responsive, and reduced-motion assertions. Chromium
  loads the full WebGL scene; Firefox/WebKit prove the dependency-light core-baked
  Canvas2D schematic without loading Three.js/WebGL. This is not protected or
  complete until exact PR and post-merge evidence is reconciled;
- the frozen prototype is the complete historical parity oracle and predates slot
  variants; D32 forbids fabricated extraction, while ModelSpec 2.2/XC-28 defines one
  explicit equipped alternative across contract, validator, geometry, simulation,
  lockfile, BOM, WASM, and Studio;
- the protected runtime lineage contains ModelSpec 2.2/XC-28, D10 manufacturing-
  license enforcement, and SEC-002 pre-retrieval/provider prohibited-brief refusal
  with non-content audit rows plus the SEC-006 application boundary; none of these
  prove live-provider operations;
- SEC-003..005 on protected `main` prove versioned owner-scoped export, primary Postgres and
  S3-compatible deletion, purpose/subject consent grants and withdrawals, bounded
  retention, time-bounded legal holds, pseudonymous tombstones, backup catalog/
  expiry adapters, and pre-restore suppression; production backup/restore remains
  `OPS-005` and is not implied by deterministic local evidence;
- most P5-P12 live providers, hardware steps, and external proof remain gated;
- the completed SEC-006 contract/fixture boundary adds pinned-origin authentication,
  header-only ephemeral provider credentials, bounded JSON/network/process/object/
  archive boundaries, prompt-injection containment, classed rate limits, and
  adversarial tests; production egress enforcement, distributed quotas, secret
  rotation, and incident exercises remain operations gates;
- the protected P3/P4 ETL adapter has a native Anthropic Messages API contract using the
  pinned Haiku 4.5 snapshot, forced strict tool use, exact-host bounded HTTPS,
  delimiter-safe untrusted-source prompts, local canonical-row validation, and
  extraction provenance. Fixture and deployment-command paths remain first; no
  credentialed sandbox call, live OCCT artifact, or provider operation is implied;
- protected P11-005 contract/fixture work now gives vendor refresh one idempotent
  local `commerce.vendor-refresh` queue path: the worker alone may invoke
  `FORGE_VENDOR_REFRESH_CMD`, and accepted offers are revalidated and materialized
  transactionally. This does not prove a credentialed provider sandbox, deployed
  egress/quotas/telemetry/recovery, billing, current terms, or purchasable BOM use;
- `main` has an active PR-only exact-check ruleset; annotated validator tag `v0.1.0`
  and its nine-asset GitHub Release were built from protected `1093842`, attested,
  downloaded after publication, and independently re-verified;
- crates.io/npm publication remains explicitly deferred to owner-scoped credentials.

Do not repeat these facts without re-running or re-checking them. Update
`docs/PROJECT-STATE.md` whenever the boundary materially changes.

## 4. Runtime and ownership boundaries

| Area | Home | Rule |
|---|---|---|
| Contract/schema | `crates/forge-contract`, `schema/` | Rust types are the source; generated schema/TS types must not drift; every non-empty slot explicitly equips one unique variant |
| Geometry/DfM | `crates/forge-geometry` | Deterministic, SI-unit, test-backed; no presentation-only truth |
| Motion/drivers | `crates/forge-motion` | Versioned data-driven drivers; no executable code in contracts |
| Simulation/export/import | `crates/forge-sim` | Rapier interactive; MuJoCo training-canonical; parity on upgrades |
| Admission | `crates/forge-validate` | The validator is sovereign; fix artifacts, never weaken checks to green them |
| Browser facade | `crates/forge-wasm`, `packages/studio` | Core truth in WASM; React/Three.js remain presentation and interaction; support tiers and accessibility acceptance are owned by `docs/BROWSER-SUPPORT.md` |
| API/data/platform | `packages/gateway`, `infra/migrations` | Validate writes, scope ownership, fail closed, preserve audit history |
| Compute | `workers` | Deterministic fixture oracle plus explicit live adapter; no public worker surface |
| Desktop/hardware | `packages/desktop` | D30/D12 lab gates, physical confirmation, no auto-arm, supervisor authority |
| Catalog | `catalog` | Citations, immutable revisions, review state, license and export policy required |
| Plans/status | `docs` | One fact, one owning document; status follows evidence |

Equipped-variant boundary (D32/XC-28):

- only `slots[].equippedVariantId` selects physical truth; array order is never a
  default and unselected alternatives are inert for geometry, mass, simulation,
  lockfile resolution, validation, exports, and BOMs;
- 2.1 migration may auto-equip a sole alternative, but it must refuse to guess among
  multiple alternatives until the author records an explicit choice;
- flattened baked parts carry source JSON Pointers. Studio patches those pointers and
  preserves inspection state by source identity, not by unstable flattened index.

License-export boundary (D10/SEC-001):

- manufacturing export jobs require a complete license ledger record for every
  assembly asset; missing, unknown, contradictory, or unsafe link evidence fails
  before a provider runs;
- `open` geometry may export in full, `attribution` geometry also requires the
  versioned license manifest, and `no-redistribution`/`view-only` geometry is replaced
  by a dimensioned envelope plus datum ports and an HTTPS BOM link-out;
- external OCCT output is untrusted. It must prove the requested manifest hash and
  required attribution/restriction behavior; exporters retain only allowlisted
  metadata and policy-safe artifact references.

Prohibited-brief boundary (SEC-002):

- screen briefs before catalog/pattern retrieval, synthesis, provider transport,
  course generation, or model editing. The guarded surfaces are context, generation,
  streaming generation, course generation, and model edit; direct generation-library
  callers retain an independent assertion;
- the versioned deterministic detector is the admission boundary. Prompt instructions
  and provider moderation are defense in depth and never override a local refusal;
- refusal rows contain only the prompt SHA-256, length bucket, policy/detector
  versions, matched categories/rule IDs, surface, requested provider/archetype, and
  optional owner. Never persist or return the raw refused prompt or a provider key;
- refusal auditing is fail-closed: if the metadata row cannot be written, no
  retrieval, synthesis, provider, edit, or environment-generation action may run.
  Rule changes require benign-language, adversarial-normalization, secret-redaction,
  audit-failure, and every-surface regression tests.

User-data lifecycle boundary (D33/SEC-003):

- `GET /v1/account/export` is an authenticated repeatable-read snapshot. Keep its
  format versioned, enumerate new owner-scoped tables explicitly, provide blob
  download endpoints, and never include OAuth access/refresh/ID tokens, session or
  verification tokens, or provider API keys;
- `DELETE /v1/account` requires the exact confirmation phrase, a serializable owner
  lock, explicit purge of every owned/derived row, and S3-compatible payload deletion
  before commit. Do not rely on `ON DELETE SET NULL`, which anonymizes ownership but
  leaves user content behind;
- object deletion failure rolls the database transaction back. Test success,
  authorization, malformed confirmation, secret exclusion, storage failure, a real
  populated Postgres lifecycle, and an S3-compatible upload/delete/404 smoke;
- receipt 2.0.0 proves primary database/object deletion and creation of
  restore-suppression tombstones. It never proves physical backup deletion; only a
  catalogued provider adapter result plus restore evidence may make that claim.

Consent boundary (D34/SEC-004):

- consent is an append-only event ledger, never a mutable flag. Every grant and
  withdrawal binds ledger version, purpose, owned subject, current policy version,
  exact notice SHA-256, prior event, bounded non-content evidence, and idempotency;
- the five independent purposes are photoscan processing per object, telemetry
  sharing per log, pattern contribution per model, leaderboard publication per
  account, and training reuse per telemetry log. A grant for one never authorizes
  another, and a stale policy/hash is inactive until the owner grants the current
  notice;
- lock the owner and validate current consent in the same serializable transaction
  that starts processing, sharing, contribution, publication, or training reuse.
  Direct job-library entry points retain the same assertion; UI state is not
  authority;
- withdrawal appends history and immediately cancels queued/running affected jobs,
  makes telemetry private, removes contributed patterns or leaderboard rows as
  appropriate. It does not claim in-flight provider recall, primary content
  deletion, legal-hold expiry, or backup erasure; those use account deletion and
  SEC-005 lifecycle proof;
- authority chronology uses monotonic `event_sequence`, not timestamps or random
  IDs. Same-timestamp grant/withdraw or place/release pairs must resolve causally.

Data-lifecycle boundary (D35/SEC-005):

- lifecycle 1.0.0 defines six data classes, a 30-day maximum backup window, a
  45-day pseudonymous tombstone window, bounded primary audit/job/auth periods, and
  a 400-day pseudonymous lifecycle-audit period. These are versioned product
  defaults, not universal legal conclusions;
- legal holds are append-only, subject-digested, reason-coded, reference-only, and
  expire within 365 days unless a new reviewed event renews them. A hold permits
  retention only; it never authorizes use, training, sharing, or operator browsing.
  Hold mutation, backup register/restore evaluation, and deletion must share globally
  ordered transaction-scoped locks for the affected user and objects so authority
  cannot race a purge;
- deletion receipt 2.0.0 creates user/object tombstones and suppresses pre-deletion
  restore through backup expiry. Every backup must be catalogued with manifest hash,
  covered subject digests, affirmative delete deadline, provider adapter evidence,
  exact subject-manifest idempotency, and retryable failure state. Provider deletion
  adapters are idempotent and stale in-progress claims are reclaimed only after the
  bounded lease. Reject a copy captured after its subject's primary deletion; a
  valid late-catalogued pre-deletion copy reopens tombstone completion until erased;
- no restore enters primary storage before exact manifest and tombstone checks.
  Local Postgres fixtures prove the contract; real encrypted backup automation,
  provider deletion receipts, sandbox restores, RPO/RTO, and DR promotion remain
  `OPS-005`.

Application threat boundary (SEC-006):

- production auth uses an explicit credential-free HTTPS origin and strong secret;
  untrusted forwarded hosts never reach Auth.js, built-in CSRF remains enabled,
  unsafe cookie requests require the trusted origin, and development identities are
  forbidden in production;
- HTTP generation accepts BYO provider credentials only through the dedicated header.
  It never reads a server-key fallback, serializes the key into generated-artifact,
  usage, or model records, reflects it in errors, or records it in product logs;
- all request/provider/job/object/worker/archive inputs have explicit size, depth,
  time, content, and destination bounds. External HTTP is credential-free HTTPS,
  redirect-free, exact-host where known, public-address checked, and structurally
  validated; production still requires connection-time egress enforcement because
  application DNS checks cannot eliminate rebinding;
- prompt and retrieval text are untrusted data. Local prohibited-brief refusal,
  reviewed-catalog policy, bounded tool output, allowlisted provider results, and the
  sovereign validator remain the hard controls;
- worker ETL credentials come only from deployment configuration, stay in the
  `x-api-key` header, and are absent from request JSON, command payloads, persistence,
  and errors. The native provider envelope uses Anthropic's supported strict-schema
  subset; its JSON string is reparsed under local byte/depth/node/type/license/price/
  citation checks before it can reach catalog admission or review;
- live vendor results never travel directly from an HTTP route into purchase truth.
  The gateway queues only a local, idempotent `commerce.vendor-refresh` job; the
  dedicated commerce route and generic job entry point share the same bounded
  component/timeout/no-inline-offer contract; the worker requires
  `FORGE_VENDOR_REFRESH_CMD`, sanitizes held rows, and bounds offer count, strings,
  price, currency, availability, public HTTPS links, rate limits, timeout, and
  provenance;
- successful vendor offers are validated a second time and inserted inside the same
  Postgres transaction that marks the job successful. Any invalid accepted row rolls
  back the job success and every offer insert; the runner then marks the job failed
  without stopping the worker loop. Sandbox links remain a separate, synchronous,
  explicitly `sandbox` path and may never be labeled provider truth;
- client job idempotency is owner-scoped before persistence using a domain-separated
  digest. Exact retries return the original job without rematerializing fixture
  outputs; reusing a key for a different kind/provider/input returns conflict, and a
  second owner may safely use the same client key;
- the in-memory classed limiter is valid for deterministic and single-process proof
  only. Shared atomic rate, concurrency, and spend controls are required before a
  multi-replica or billable-provider claim. The complete control/residual-risk matrix
  is owned by `docs/THREAT-MODEL.md`.

External acceptance boundary (QA-010/EXT-001..008):

- the versioned registry and CLI under `docs/external-acceptance/` and `scripts/`
  define and structurally validate builder, photoscan, training, course, controlled
  lab, print, marketplace, and maintenance evidence; generated templates are not
  proof and cannot close an external task;
- initialize run packs outside the repository. Git may contain only a reviewed,
  minimized record with pseudonymous roles, exact revision/deployment, content-
  addressed evidence references, measurements, findings, limitations, and signoffs;
  never raw identity, photos, telemetry, provider payloads, signatures, signed URLs,
  or credentials;
- freeze revision, environment, participants, authority, criteria, and thresholds
  before a run. Preserve `failed` and `stopped` outcomes; a changed product,
  deployment, participant, or criterion starts a new linked run;
- independent builders, competitors, verifiers, and equippers receive no repository
  access, private owner state, hidden fixture knowledge, direct database authority,
  or implementation coaching. They may not also fill owner/facilitator roles;
- a structurally valid manifest proves evidence completeness only. The acceptance
  owner must resolve and hash-check retained artifacts, inspect role separation and
  authority, bind the exact protected revision/checks, review limitations, and then
  reconcile the owning `EXT-*`, phase, gate, maturity, risks, and changelog;
- controlled hardware evidence remains D30/D12-only: rover before quad, local
  provider, physical confirmation, no-auto-arm, supervisor and kill authority,
  telemetry consent, signed lab record, and external beta disabled.

## 5. Session protocol

1. Check `git status --short --branch`, current branch/worktree, recent commits, and
   active remote PR/check state before selecting work.
2. Read the current-state snapshot, roadmap, relevant TODO rows, execution lane, and
   system docs.
3. Select the smallest dependency-complete slice. Mark its TODO `[~]` only when work
   actually starts.
4. Add or update tests with behavior. New validator invariants require stable check
   IDs, diagnostics, fixtures, and documentation.
5. Before changing a registered golden artifact, preserve the failing parent evidence,
   change the owning source of truth first, and add one new append-only record under
   `docs/golden-updates/`; never edit the frozen prototype oracle.
6. Run the gates appropriate to the changed surfaces. Do not claim full verification
   when prerequisites caused tests to skip.
7. Update every living document invalidated by the change. Preserve stable TODO IDs;
   mark tasks done rather than deleting them.
8. Add a newest-first `CHANGELOG.md` entry containing evidence, affected IDs, next
   step, and blockers.
9. Before handoff, run `git diff --check`, run the cumulative committed-range check
   through `node scripts/check-patch-hygiene.mjs`, inspect the complete diff, and
   report both passing and failing gates.

Shared checkout rules:

- Preserve unrelated user/agent changes.
- Check the live task/claim state before taking an overlapping lane.
- Prefer a `codex/<lane>-<scope>` branch for implementation or publication work.
- Rebase/merge conservatively and re-run gates on the resulting tree.
- Do not use destructive reset/checkout operations to discard work.

## 6. Status vocabulary and definition of done

Task states in `docs/TODO.md`:

- `[ ]` open — not started.
- `[~]` in progress — partial implementation or proof exists.
- `[x]` done — code, tests, docs, and required proof are complete.
- `[!]` blocked — an explicit external/owner/lab prerequisite prevents progress.

Capability maturity must be stated separately:

- **contract** — interface/schema exists;
- **fixture** — deterministic keyless implementation proves the shape;
- **sandbox** — real provider path works in a controlled external environment;
- **live** — production-configured path works with observability and recovery;
- **field-proven** — acceptance evidence exists from intended users or hardware.

An adapter, table, button, or fixture does not close a live or field criterion.

Definition of done for a normal implementation task:

- behavior implemented at the correct architectural layer;
- success, failure, authorization, and boundary cases tested;
- deterministic/local acceptance path retained;
- live capability explicit and fail-closed when unconfigured;
- relevant schema/API/system/status docs updated;
- security, privacy, provenance, license, and hardware gates applied;
- required local and remote checks green;
- changelog entry records verifiable outcome.

## 7. Required validation by change type

Use the narrowest sufficient set, then run the full release gate before phase closure.

| Change | Minimum gates |
|---|---|
| Rust core/validator | `cargo fmt --all --check`; `cargo clippy --workspace -- -D warnings`; relevant tests; `cargo test --workspace`; schema/golden/declared-verdict checks when affected |
| Schema/contract | `pnpm codegen:contract`; generated diff review; migration/property/fuzz tests; native/WASM golden comparison |
| Registered golden/generated artifact | `pnpm verify:goldens`; new append-only review record; registry-named focused regeneration and verification; compatibility review when flagged |
| Studio | `pnpm --filter @forge/studio typecheck`; build; `FORGE_BROWSER_SUPPORT=1 pnpm verify:browser-support` for semantics/interaction/layout/support changes; `pnpm verify:browser-e2e` against an explicit migrated isolated DB for builder-loop changes; QA-006 evidence for performance claims |
| Gateway | build/typecheck; full gateway tests with `forge-validate` built; Postgres-backed tests for persistence paths |
| Workers | Python 3.12 environment; `pnpm --dir workers test`; live-adapter contract tests when touched |
| Auth/network/secrets/uploads | threat-model negative tests; production-config failure tests; origin/CSRF/authorization tests; secret persistence/reflection scan; SSRF/redirect/DNS/body/timeout tests; rate/cost boundary; worker and archive bomb tests |
| Data/migrations | forward migration on empty and populated DB; invariant assertion; rollback/recovery plan; backup impact review; `pnpm verify:db` including browser acceptance; run `python workers/integration/assert_commerce_postgres.py` when commerce queue/materialization changes |
| User data/privacy | authenticated export/delete tests; populated Postgres lifecycle; secret-exclusion assertions; object-store failure rollback; S3-compatible upload/delete/404 smoke; explicit backup-scope statement |
| Desktop/hardware | scaffold tests plus `pnpm verify:desktop-native`; D30/D12 gate tests; no-auto-arm/physical-confirmation/supervisor assertions; controlled lab evidence |
| Generation | Brief-25 corpus check and real-validator gate; provenance; refusal/logging; draft fallback |
| Export/manufacturing | license matrix, restricted-geometry fallback, DfM, artifact integrity, provider handoff tests |
| External acceptance/evidence | `pnpm verify:external-acceptance`; initialize packs outside Git; freeze exact revision/environment/roles/authority; execute the registered milestone script; preserve pass/fail/stop evidence; validate the completed manifest; semantically inspect retained hashes/signoffs; required protected checks; no maturity/task closure from a template or structural pass alone |
| Docs-only | link/reference scan; stable-ID coverage; status/evidence consistency; `git diff --check` |

Full release candidate gate is defined in `docs/EXECUTION-ROADMAP.md`.

## 8. Non-negotiables

1. SI units everywhere; Y-up/right-handed/meters internally.
2. Mass, inertia, electrical, price, and performance claims are sourced or computed.
3. Never bypass or weaken the validator to make generated content pass.
4. No code in contracts. Future user controllers require the reviewed sandbox path.
5. No fast-math or unrecorded nondeterminism in the core.
6. No weapons, targeting, munitions, or interdiction functionality. Refuse before
   retrieval/provider work and log only the minimal non-content audit record; an
   audit-write failure must fail closed.
7. Generated, trained, imported, exported, and deployed artifacts carry provenance.
8. License/export policy is enforced in actual exporters, not only displayed.
9. User photos, models, and telemetry require explicit ownership, consent, retention,
   export, and deletion semantics.
10. Hardware is fail-closed: no auto-arm; policy is advisory; supervisor/FC retains
    authority; ladder transitions require physical confirmation.
11. External model/provider identifiers, limits, prices, and regulations are verified
    from current primary sources at implementation time.
12. Decisions, exceptions, and owner reordering are recorded in `docs/DECISIONS.md`.
13. Secrets are request- or service-scoped, never persisted or reflected; outbound
    destinations, resource use, and archive contents fail closed under explicit bounds.
14. External evidence is pseudonymous, content-addressed, consent/retention-aware,
    and revision-bound; generated templates and self-attestation never substitute for
    the intended independent person, real provider, controlled rig, or field event.

## 9. Dependency and supply-chain policy

- Prefer the existing stack and standard library before adding dependencies.
- Explain new runtime dependencies in the changelog and system docs.
- Pin reproducible toolchains and release inputs; pin GitHub Actions by immutable SHA
  for release-sensitive workflows.
- Keep lockfiles committed and audit Rust, npm, Python, containers, and Actions.
- Do not use mutable `latest` images for production or release evidence.
- Never commit credentials. Development defaults in Compose are not production
  configuration.

## 10. Documentation discipline

- `docs/FORGE-plan.md` and historical plans are planning papers; do not use them as
  current-state proof.
- `docs/PROJECT-STATE.md` owns dated evidence and readiness verdicts.
- `docs/ROADMAP.md` owns phase status and exit criteria.
- `docs/TODO.md` owns stable atomic tasks.
- `docs/EXECUTION-ROADMAP.md` owns sequencing, workstreams, gates, and handoffs.
- `docs/GOLDEN-ARTIFACTS.md` and its machine registry own re-pin procedure,
  immutable-oracle policy, regeneration commands, and append-only review evidence.
- `docs/EXTERNAL-ACCEPTANCE.md` and its machine registry own external scripts,
  evidence shape, independence, data minimization, stop outcomes, and task-close
  review; raw acceptance material stays outside Git.
- System docs own implementation contracts; `DECISIONS.md` owns binding choices;
  `risk-register.md` owns risks and watch triggers.
- Use executable commands and explicit acceptance evidence.
- Distinguish fixture, sandbox, live, and field claims in every document and UI.
- Do not duplicate long plans across files; link to the owner.

## 11. Release and phase-close rules

A phase closes only when every exit criterion is supported by current evidence and all
blocking checks are green. A release requires:

- clean protected-main commit and required checks;
- version/tag/release notes and reproducible artifacts;
- checksums and installation/version proof;
- dependency/security review;
- migration and rollback notes where applicable;
- accurate README/current-state/live-vs-gated language;
- downloaded artifact verification after publication;
- post-release smoke evidence.

Local green alone is not a release. Fixture green alone is not live proof.
