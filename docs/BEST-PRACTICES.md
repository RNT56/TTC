# BEST PRACTICES — doctrine, conventions, standards

Binding on all contributors, human or agent. Where this file and
[`DECISIONS.md`](DECISIONS.md) overlap, decisions win.

## 1. Doctrine — "not a toy" (plan §1.3, binding)

1. **SI units everywhere.** Meters, kilograms, newtons, volts, ampere-hours, radians,
   seconds. Schema surface uses grams for mass (kg internally).
2. **Mass and inertia are computed or sourced, never invented** — geometry × material
   density for generated parts; datasheets (with citations) for catalog parts.
3. **Compatibility is checked, not assumed** — mount patterns, voltage windows,
   current budgets, prop clearance, torque margins.
4. **Every HUD claim derives from a stated model** with inspectable assumptions.
5. **Manufacturability is an export target** — STEP/3MF with DfM checks; BOMs name
   real SKUs.
6. **The validator is sovereign** — nothing enters registry, marketplace, or training
   queue without passing. Never weaken a check to green a build.
7. **Provenance everywhere** — origin chains on contracts, components, policies,
   deployments.

## 2. Units, coordinates, conventions (plan §3.2)

- Internal coordinates: **Y-up, right-handed, meters** (matches prototype and
  Three.js). Exporters convert to Z-up for URDF/MJCF/STEP.
- Angles in **radians**; time in **seconds**; masses in **grams at the schema
  surface**, kilograms internally; gravity default 9.80665 m/s², air density 1.225
  kg/m³ — but always from the contract's `env` block, never ambient constants.
- Geometry-meets-manufacturing tolerance: **±0.1 mm default**, explicit tolerance
  fields where it matters.
- Fixed timesteps: motion 120 Hz, physics substeps 240 Hz, render-interpolated.
- **Determinism is a feature (D17):** no fast-math or platform-float flags anywhere
  in core crates; deterministic iteration order on any path that reaches an output;
  the golden-number suite guards native↔WASM bit-exactness.
- Naming: schema/JSON keys `camelCase`; Rust `snake_case`/`CamelCase` per rustfmt;
  SQL `snake_case`; check IDs `CAT-NNN` (validation doc); TODO IDs as established;
  semver everywhere a version appears.

## 3. Data, not code (D19)

- A model is a JSON document. Behavior lives in versioned engine libraries
  parameterized by the document. PRs adding executable semantics to contract data are
  rejected on principle.
- Engine libraries are versioned; contracts reference them by name + version range.
- The WASM user-controller escape hatch is post-P7 and requires a sandbox design
  review (OD-04) — do not build it early.

## 4. Validation discipline

- **Checks accompany features.** A feature that introduces an invariant ships with
  the harness check that enforces it, registered in the check catalog
  ([`systems/validation-harness.md`](systems/validation-harness.md)).
- Every contract write runs the harness: CI for first-party, admission for generated,
  publish for marketplace, re-validation on lockfile upgrades.
- Failures must be **machine-readable diagnostics** (stable check ID, subject,
  observed value, limit, hint) — the generation repair loop consumes them.
- Never special-case a model to pass; fix the model or (with a decision entry) the
  check.

## 5. Code standards

**Rust (core crates — where truth lives, D16):** the gentle kind — math and data
structures over flat buffers; **no async, no DOM, no I/O** (only `forge-validate`'s
CLI does I/O, native-only); no fast-math (D17); `clippy` + `rustfmt` clean;
`#![forbid(unsafe_code)]` outside the facade's view plumbing *(proposed)*; the
contract types carry serde + schemars derives — **the schemars-emitted JSON Schema is
the single source**, all other languages derive from it; every ported formula lands
with a differential test against the JS oracle and membership in the golden-number
corpus.

**TypeScript (studio, gateway):** `strict: true`, no `any` outside typed boundaries;
contract types **codegen'd from the schemars output** — never hand-mirrored; no
geometry/physics math in TS (it belongs in core; the render layer consumes baked
buffers zero-copy); no per-frame allocation in render-path code; React only in
`studio`.

**Python (compute workers):** 3.12; queue-driven, idempotent jobs (safe to retry);
no public network surface; pinned dependencies; payloads validated against the
emitted JSON Schema; every job logs structured progress and writes results to object
storage + Postgres transactionally.

**General:** small modules with explicit public APIs; pure functions for geometry and
math (testable headlessly); deterministic seeds threaded through anything stochastic;
comments only for constraints the code cannot show.

## 6. Testing pyramid

1. **Unit** — math, geometry, schema validators (mass properties vs analytic solids,
   IK closed forms, sag model vs bench math).
2. **Differential (port-time)** — Rust output vs the JS oracle for every ported
   formula; the prototype + harness recordings define "done" (plan §5.4).
3. **Golden** — exporter outputs (MJCF/URDF), render images (perceptual diff),
   extraction fixtures vs the prototype.
4. **Golden-number** — cross-target bit-exactness, native↔WASM, canonical scenes, on
   every core change (XT-001, D17).
5. **Harness** — the full validation suite on every first-party contract, every PR.
6. **Parity** — Rapier vs MuJoCo on canonical scenes on every engine/exporter bump
   (training side canonical, D20).
7. **Regression** — physics trajectory tolerance bands; minimized fuzz failures
   become permanent cases (XC-24).
8. **Brief-25** — generation quality as CI with a metrics dashboard (D-evals).
9. **Browser E2E** — production Studio bundle + real built WASM + gateway/validator
   + isolated Postgres for the complete builder loop; public-share and private-route
   authorization must be proven in separate browser contexts (QA-002).
10. **Browser support and accessibility** — run the production share/configurator
    journey with real WASM in Chromium, Firefox, and WebKit; assert semantics,
    accessible names, skip/focus behavior, keyboard orbit/equip/explode/blueprint,
    contrast, critical target size, narrow layout, reduced motion, and tier-appropriate
    initial quality. Viewer-grade engines start low with AO off so software-rendered
    WebGL cannot block the accessible contract. Keep the
    full-Studio/viewer-grade boundary and vendor-device limitations synchronized with
    [`BROWSER-SUPPORT.md`](BROWSER-SUPPORT.md); a proxy engine is not a real-device or
    screen-reader certification (QA-003).
11. **External acceptance** — execute the versioned QA-010 milestone script against
    an exact product revision with the intended independent user, real provider, D30/
    D12 controlled rig, or field event. Preserve pass/fail/stop evidence, authority,
    measurements, findings, limitations, and signoffs outside Git; machine-valid
    evidence shape still requires semantic review before any `EXT-*` or maturity close.

A red harness blocks merge. Flaky tests are bugs, not noise.

Golden files are evidence, not an escape hatch. Change the owning implementation,
model, or measurement first; inspect the semantic delta; then follow
[`GOLDEN-ARTIFACTS.md`](GOLDEN-ARTIFACTS.md), use the registered regeneration path,
and add a new append-only update record. Never regenerate an expectation merely
because its test failed, and never edit the frozen prototype oracle.

## 7. Performance budget discipline

Budgets ([`architecture.md`](architecture.md) §7) are acceptance criteria — including
the core's: facade ≤ 2 MB gz, bake ≤ 60 ms, patch re-bake ≤ 10 ms, core tick
≤ 1.5 ms, incremental validate < 150 ms. Changes to hot paths land with before/after
numbers against the budget. Degradation is handled by the quality-tier ladder (AO
off → shadow res → pixel ratio), never by silently blowing the frame budget. State
the tiers owned by [`BROWSER-SUPPORT.md`](BROWSER-SUPPORT.md) (D15: isolated desktop
Chromium for the full web Studio; viewer grade elsewhere; Desktop for the bridge) in
every user-facing capability claim.

## 8. AI usage discipline

- **Model tiers:** frontier (Fable-5 class) for full synthesis and repair reasoning;
  smaller tiers (Sonnet/Haiku class) for edits, classification, ETL extraction; Batch
  API for catalog ingestion. BYO key honored throughout (D3).
- **Pin at implementation:** model strings, context limits, pricing from
  https://docs.claude.com/en/api/overview — never from memory or from the plan; record
  the pin in DECISIONS.
- **Schema-constrained output only** for generation (tool use with the
  schemars-emitted JSON Schema enforced — the same artifact the core is built from);
  bounded self-repair (≤ 3 iterations) against machine diagnostics; then draft
  fallback (D14).
- **Prompt caching** for the schema + engine-doc prefix; multi-pass emission to keep
  each output small and checkable.
- Every generated artifact carries provenance (model version, prompt hash, seed,
  validator report).

## 9. Git, sessions, and documentation discipline

- **Branches:** work on scoped feature branches (`codex/<lane>-<scope>` by default);
  never force-push shared branches. Treat unprotected `main` as a release blocker,
  not permission for direct feature pushes.
- **Commits:** imperative subject ≤ 72 chars; body explains *why*; reference TODO IDs
  (e.g. `P0-004`) where applicable. Push with `git push -u origin <branch>`.
- **Every session ends with a `CHANGELOG.md` entry** (protocol in
  [`/AGENTS.md`](../AGENTS.md)) and updated PROJECT-STATE/ROADMAP/TODO entries when
  affected. This is the
  project's continuity mechanism — treat skipping it as breaking the build.
- **Docs move with code:** a change that invalidates a doc updates the doc in the same
  PR. New invariants → harness check + doc. New decisions → DECISIONS entry.
- The frozen planning papers (`FORGE-plan.md` v3.0, `FORGE-plan-v2.md`,
  `FORGE-vision-and-architecture.md`) are never edited.

## 10. Security & safety basics (full doc: [`security-safety-legal.md`](security-safety-legal.md))

- No code in contracts (D19); future WASM controllers sandboxed and reviewed.
- No weapons, targeting, munition, or interdiction content anywhere. Refuse before
  retrieval/provider/mutation work; log only hash/bucket/version/category/rule/
  surface metadata; never log the raw refused prompt or a credential; if audit
  persistence fails, fail closed.
- License classes enforced by the export matrix (D10); ingestion without a license
  record is rejected.
- The deployment ladder is product-enforced; the bridge never auto-arms; supervisor
  authority is absolute (D9).
- Photos: processing rights only; deletion on request; never training data without
  explicit opt-in. Telemetry logs belong to the user; sharing is per-log explicit.
- Treat consent as append-only authority, not UI state: bind purpose, owned subject,
  policy version, exact notice hash, previous event, and idempotency; serialize
  grants/withdrawals with the action they authorize. Separate photoscan processing,
  telemetry sharing, pattern contribution, leaderboard publication, and training
  reuse so one grant can never imply another. Policy drift invalidates old grants.
- Withdrawal must stop future eligibility immediately and perform its documented
  primary-plane effect, while stating what it cannot recall. Never use withdrawal to
  imply account deletion, provider recall, legal-hold expiry, or backup erasure.
- User export enumerates every owner-scoped dataset from a repeatable snapshot and
  excludes auth/session/verification/provider secrets. Blob payloads remain behind
  authenticated per-object download contracts.
- Primary account deletion is an explicit serializable purge, not a user-row cascade:
  lock the owner, remove owned/derived rows, delete S3-compatible payloads before
  commit, and roll back database changes if storage fails. Receipt 2.0.0 adds
  pseudonymous restore-suppression evidence, not a claim that provider backups are
  already deleted (D33/D35).
- Version retention by data class; keep legal holds append-only, reference-only, and
  time-bounded. A hold permits retention only. It never grants content use, sharing,
  training, or broad operator access. Serialize hold mutation and deletion with the
  same globally ordered transaction-scoped user/object locks as backup registration,
  restore evaluation, and deletion so authority cannot race a purge.
- Catalogue every backup copy and covered subject digest, enforce an affirmative
  deletion deadline, reject idempotency-key subject-manifest drift, retain bounded
  retry state, reclaim crashed claims only after a lease, and require exact manifest
  plus tombstone checks before restore. Provider deletion adapters must be idempotent.
  Reject any copy claiming a tombstoned subject after primary deletion; a valid
  late-discovered pre-deletion copy reopens completion until it is deleted. Restore
  into isolation first; never promote a deleted subject back to primary storage. Real
  backup/DR proof remains separate from a deterministic lifecycle fixture.
- Use monotonic database sequences for authority ledgers. Timestamps and random IDs
  cannot reliably order same-instant grant/withdraw or place/release events.
- Keep authority/audit retention causal and hold-aware: never delete an active chain,
  remove closed self-linked chains child-first, and retain a named audit target while
  its current hold remains active.
- Legal gates are entry conditions, not afterthoughts: ToS review before P8,
  dual-use check before P11 policy sharing.
- Keep provider purchase truth behind one queue-owned normalizer. Gateway routes may
  enqueue bounded component IDs, timeout, and idempotency only; do not accept inline
  provider output or add a second direct-live HTTP path. Require the deployment
  command again at worker execution time, sanitize rejected rows, and revalidate
  every accepted URL, price, currency, availability, rate-limit, and provenance
  field in the same transaction that marks the job successful.
- Scope client idempotency keys to authenticated ownership before persistence. Bind
  one key to one canonical kind/provider/input tuple, reject request drift, and do
  not rematerialize domain rows on an exact retry. A globally unique caller string is
  not tenant isolation and must never suppress another owner's charge or return
  another owner's job.
- Preserve the synchronous deterministic commerce path as explicitly `sandbox`.
  A configured command, queued row, or materialized offer is contract evidence until
  a credentialed sandbox also proves provider output, billing, retries, monitoring,
  recovery, and current vendor terms.

## 11. Evidence and maturity discipline

Use five explicit maturity labels: **contract**, **fixture**, **sandbox**, **live**,
and **field-proven**. Never use “implemented,” “production slice,” or a checked task
to imply a higher maturity level than the evidence supports.

- Routes, schemas, tables, buttons, and fixture outputs prove contracts.
- Deterministic fixture jobs prove local behavior and are permanent test oracles.
- A command adapter proves a seam, not the provider.
- A sandbox run needs real credentials, provider output, cost/latency, timeouts,
  redaction, retry/idempotency, and retained artifacts.
- A live claim additionally needs deployment, monitoring, recovery, ownership, and
  support evidence.
- A field claim needs evidence from the intended user/hardware context.

Status documents are not proof. When code/tests/CI contradict a checkbox, current
executable evidence wins and the living docs are corrected in the same change.

External evidence follows [`EXTERNAL-ACCEPTANCE.md`](EXTERNAL-ACCEPTANCE.md). Freeze
the revision, deployment, participants, authority, criteria, and thresholds before
observing results. Independent roles receive no repository/private-owner access and
cannot also be the owner or facilitator. Generated runbooks are scaffolds; do not
close a task until retained artifacts and signoffs are resolved, hash-checked,
semantically reviewed, and bound to exact protected checks.

## 12. Recovery, release, and operations discipline

- Restore the complete truthful green baseline before feature expansion or release.
- Required gates must fail on missing prerequisites or skipped coverage; build the
  validator before gateway tests that depend on it.
- Pin toolchains and release-sensitive actions; do not let “stable” or `latest`
  silently change release evidence.
- Release from protected `main` with versioned artifacts, checksums, SBOM/provenance,
  install/version proof, and post-release smoke.
- Live providers require sandbox/prod separation, capability discovery, timeout,
  rate limit, circuit breaker, idempotency, cancellation, cost bound, and degraded UX.
- Data changes require populated forward-migration proof, backup/restore impact, and
  roll-forward/rollback procedure.
- Production readiness includes secrets rotation, non-root/minimal images,
  observability, SLOs, alert ownership, incident response, retention, deletion, and
  disaster recovery.
- Local green is not remote green. Remote green is not a release. A release is not
  field proof.
