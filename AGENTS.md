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
8. `docs/THREAT-MODEL.md` before changing authentication, public routes, providers,
   outbound network access, secrets, uploads, workers, callbacks, rate limits, logs,
   or release archive handling.
9. `docs/COMPATIBILITY.md` before changing schemas, reports, CLI/WASM APIs, replay,
   EnvSpec, consent/export/deletion records, worker artifacts, or version numbers.
10. `docs/REPOSITORY-GOVERNANCE.md` before changing workflows, checks, branch rules,
   dependencies, or releases.
11. `docs/RELEASE.md` before building, tagging, publishing, withdrawing, or verifying
    a validator release.
12. `docs/PUBLICATION.md` before adding registry credentials or publishing crates/npm.
13. `docs/DATA-LIFECYCLE.md` before changing export/deletion, retention, legal holds,
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

- the SEC-006 candidate passes the 32-step `pnpm verify` gate on pinned Rust 1.96.0;
  the last exact Postgres/pgvector proof is protected PR #30, while the local
  SEC-006 rerun is pending a healthy Docker engine and must pass the required remote
  Postgres check before the task closes;
- Brief-25 admits 25/25, every declared first-party verdict matches, and the nightly
  browser/coverage commands pass locally;
- protected `main` is green in PR, post-merge CI/security, and manual nightly proof;
- the byte-exact prototype is published as annotated tag `prototype-final`;
- workflow Actions are immutable-SHA pinned and run under a selected allowlist; the
  security workflow emits a validated SPDX source SBOM;
- compatibility policy 1.0.0 is machine-checked across twelve public format/package
  boundaries; the CLI/WASM facades expose their active versions;
- the frozen prototype is the complete historical parity oracle and predates slot
  variants; D32 forbids fabricated extraction, while ModelSpec 2.2/XC-28 defines one
  explicit equipped alternative across contract, validator, geometry, simulation,
  lockfile, BOM, WASM, and Studio;
- protected `main` at `d34b6fd` contains ModelSpec 2.2/XC-28, D10 manufacturing-
  license enforcement, and SEC-002 pre-retrieval/provider prohibited-brief refusal
  with non-content audit rows; none of these prove live-provider operations;
- SEC-003..005 on protected `main` prove versioned owner-scoped export, primary Postgres and
  S3-compatible deletion, purpose/subject consent grants and withdrawals, bounded
  retention, time-bounded legal holds, pseudonymous tombstones, backup catalog/
  expiry adapters, and pre-restore suppression; production backup/restore remains
  `OPS-005` and is not implied by deterministic local evidence;
- most P5-P12 live providers, hardware steps, and external proof remain gated;
- the SEC-006 candidate adds pinned-origin authentication, header-only ephemeral
  provider credentials, bounded JSON/network/process/object/archive boundaries,
  prompt-injection containment, classed rate limits, and adversarial tests; production
  egress enforcement, distributed quotas, secret rotation, and incident exercises
  remain operations gates;
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
| Browser facade | `crates/forge-wasm`, `packages/studio` | Core truth in WASM; React/Three.js remain presentation and interaction |
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
- the in-memory classed limiter is valid for deterministic and single-process proof
  only. Shared atomic rate, concurrency, and spend controls are required before a
  multi-replica or billable-provider claim. The complete control/residual-risk matrix
  is owned by `docs/THREAT-MODEL.md`.

## 5. Session protocol

1. Check `git status --short --branch`, current branch/worktree, recent commits, and
   active remote PR/check state before selecting work.
2. Read the current-state snapshot, roadmap, relevant TODO rows, execution lane, and
   system docs.
3. Select the smallest dependency-complete slice. Mark its TODO `[~]` only when work
   actually starts.
4. Add or update tests with behavior. New validator invariants require stable check
   IDs, diagnostics, fixtures, and documentation.
5. Run the gates appropriate to the changed surfaces. Do not claim full verification
   when prerequisites caused tests to skip.
6. Update every living document invalidated by the change. Preserve stable TODO IDs;
   mark tasks done rather than deleting them.
7. Add a newest-first `CHANGELOG.md` entry containing evidence, affected IDs, next
   step, and blockers.
8. Before handoff, run `git diff --check`, run the cumulative committed-range check
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
| Studio | `pnpm --filter @forge/studio typecheck`; build; browser smoke for changed interaction; accessibility/perf check when relevant |
| Gateway | build/typecheck; full gateway tests with `forge-validate` built; Postgres-backed tests for persistence paths |
| Workers | Python 3.12 environment; `pnpm --dir workers test`; live-adapter contract tests when touched |
| Auth/network/secrets/uploads | threat-model negative tests; production-config failure tests; origin/CSRF/authorization tests; secret persistence/reflection scan; SSRF/redirect/DNS/body/timeout tests; rate/cost boundary; worker and archive bomb tests |
| Data/migrations | forward migration on empty and populated DB; invariant assertion; rollback/recovery plan; backup impact review |
| User data/privacy | authenticated export/delete tests; populated Postgres lifecycle; secret-exclusion assertions; object-store failure rollback; S3-compatible upload/delete/404 smoke; explicit backup-scope statement |
| Desktop/hardware | scaffold tests plus `pnpm verify:desktop-native`; D30/D12 gate tests; no-auto-arm/physical-confirmation/supervisor assertions; controlled lab evidence |
| Generation | Brief-25 corpus check and real-validator gate; provenance; refusal/logging; draft fallback |
| Export/manufacturing | license matrix, restricted-geometry fallback, DfM, artifact integrity, provider handoff tests |
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
