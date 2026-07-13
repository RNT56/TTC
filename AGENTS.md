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
8. `docs/COMPATIBILITY.md` before changing schemas, reports, CLI/WASM APIs, replay,
   EnvSpec, worker artifacts, or version numbers.
9. `docs/REPOSITORY-GOVERNANCE.md` before changing workflows, checks, branch rules,
   dependencies, or releases.
10. `docs/RELEASE.md` before building, tagging, publishing, withdrawing, or verifying
    a validator release.
11. `docs/PUBLICATION.md` before adding registry credentials or publishing crates/npm.

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
Fastify gateway, Postgres data plane, Python workers, and Tauri shell. It is not
currently release-ready or production-proven.

As of the dated snapshot in `docs/PROJECT-STATE.md`:

- the recovery worktree passes the 31-step `pnpm verify` gate and the isolated
  Postgres/pgvector `pnpm verify:db` gate on pinned Rust 1.96.0;
- Brief-25 admits 25/25, every declared first-party verdict matches, and the nightly
  browser/coverage commands pass locally;
- protected `main` is green in PR, post-merge CI/security, and manual nightly proof;
- the byte-exact prototype is published as annotated tag `prototype-final`;
- workflow Actions are immutable-SHA pinned and run under a selected allowlist; the
  security workflow emits a validated SPDX source SBOM;
- compatibility policy 1.0.0 is machine-checked across seven public format/package
  boundaries; the CLI/WASM facades expose their active versions;
- the frozen prototype is the complete historical parity oracle and predates slot
  variants; D32 forbids fabricated extraction, while ModelSpec 2.2/XC-28 defines one
  explicit equipped alternative across contract, validator, geometry, simulation,
  lockfile, BOM, WASM, and Studio;
- most P5-P12 live providers, hardware steps, and external proof remain gated;
- `main` has an active PR-only exact-check ruleset; no release exists.

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
8. Before handoff, run `git diff --check`, inspect the complete diff, and report both
   passing and failing gates.

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
| Data/migrations | forward migration on empty and populated DB; invariant assertion; rollback/recovery plan; backup impact review |
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
6. No weapons, targeting, munitions, or interdiction functionality. Refuse and log
   prohibited briefs.
7. Generated, trained, imported, exported, and deployed artifacts carry provenance.
8. License/export policy is enforced in actual exporters, not only displayed.
9. User photos, models, and telemetry require explicit ownership, consent, retention,
   export, and deletion semantics.
10. Hardware is fail-closed: no auto-arm; policy is advisory; supervisor/FC retains
    authority; ladder transitions require physical confirmation.
11. External model/provider identifiers, limits, prices, and regulations are verified
    from current primary sources at implementation time.
12. Decisions, exceptions, and owner reordering are recorded in `docs/DECISIONS.md`.

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
