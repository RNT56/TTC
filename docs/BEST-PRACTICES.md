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
- Training task coordinates follow that same frame and must declare
  `forge-y-up-rh-m`; never infer a frame from field order or silently reinterpret a
  stored task. A coordinate/meaning correction requires a task-major version, a
  canonical definition hash, compatibility guidance, and retained legacy reads.
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
storage + Postgres transactionally. At-least-once attempts require an opaque expiring
lease, bounded attempt ceiling/backoff, persisted timeout authority, and compare-and-
set completion; a stale or cancelled attempt never commits.

**General:** small modules with explicit public APIs; pure functions for geometry and
math (testable headlessly); deterministic seeds threaded through anything stochastic;
comments only for constraints the code cannot show.

**API, events, and artifacts:** register request constraints in Fastify/TypeBox first;
record route purpose, authentication class, maturity, and response statuses in
`contracts/documentation.json`; then run `pnpm docs:contracts`. Never hand-edit the
generated OpenAPI/reference/catalog files. A route change is incomplete until
`pnpm verify:docs-contracts` proves exact runtime coverage. Version package APIs,
event lines, and persisted artifact formats independently; preserve old documents and
read fixtures while their support window is active. Examples use synthetic IDs and
fixture values, never secrets, signed URLs, raw user content, or claims of live proof.

**Operational telemetry:** follow D71/D72/D73 and the versioned observability policy. Generate
request/trace authority at a trusted service boundary; never trust a client identifier
as audit continuity. Emit only an exact bounded allowlist with UTC, source, version,
environment, template route, status, duration, outcome, and opaque correlation. Raw
URLs/query strings, headers/cookies, bodies, prompts, errors/provider output, personal
data, telemetry/model bytes, presigned URLs, and secret references stay out. IDs may
correlate bounded logs/traces after their owning authority exists, but never become
metric labels. Persist a trusted request on the job before asynchronous dispatch;
create each attempt ID/span in the same transaction as the D38 claim; close the row
with a bounded outcome/code while excluding leases, payloads, result bytes, and raw
errors. Historical/direct jobs get a new trace root with null request/parent, never
fabricated continuity. In managed environments, propagate a deployment ID only from
successful verification of the exact active D68 manifest; local and CI events carry
null. Propagate a provider-call ID only after it is transactionally persisted under
the current lease, and currently only on the completion of that same Modal
`train.policy` job. Started events and all other provider/job families carry null.
Provider and deployment IDs are correlation, never metric labels or evidence of
provider delivery or deployment health. Telemetry transport failure must not change
product authority, and a local JSON line or attempt row is not a backend, dashboard,
alert, managed, live, or production evidence.

**Executable policy artifacts:** keep category metadata separate from the exact
scalar tensor contract. Version schema/layout/coordinate/rate semantics independently;
bind model bytes, scorecard, and contract lineage by length plus SHA-256; reject held
or estimator-unproven policies before loading untrusted bytes. Lazy-load an exact
same-origin runtime, cap model/rate/value bounds, verify runtime names/shapes/types,
never block the render loop, and zero/stop on any observation or inference failure.
For versioned waypoint policies, bind task ID/version/frame/definition hash and the
ordered target chain through the worker authority, scorecard lineage, ONNX header,
and consumer; advance only from estimator-derived target error, never simulator
truth or render state.
Fixture tasks without real executable bytes stay held rather than gaining a fake
export path.

Treat inline policy bytes as transient producer transport, never persisted product
state. Verify the D38 lease immediately before upload, write a bounded exact
content-addressed object under the owner's prefix, then use one transaction to
recheck the lease, mark the job successful, and materialize one job-bound policy
whose metadata contains no bytes. Recheck storage metadata and streamed bytes at the
authenticated same-origin gateway, then let Studio independently verify length and
digest before runtime creation. Cancellation during upload may leave an unreferenced
object but must never create database authority; reconcile and delete such objects
through the bounded OPS-006 operator path rather than weakening the lease fence.

## 6. Testing pyramid

1. **Unit** — math, geometry, schema validators (mass properties vs analytic solids,
   IK closed forms, sag model vs bench math).
2. **Differential (port-time)** — Rust output vs the JS oracle for every ported
   formula; the prototype + harness recordings define "done" (plan §5.4).
3. **Golden** — exporter outputs (MJCF/URDF), render images (perceptual diff),
   extraction fixtures vs the prototype.
4. **Golden-number** — cross-target bit-exactness, native↔WASM, canonical scenes, on
   every core change (XT-001, D17).
5. **Visual parity** — the built full-Studio Chromium/WebGL renderer versus the frozen
   monolith under canonical cameras. Require production-equivalent isolation,
   fail-closed renderer preflight, chrome-free canvas captures, recorded quality and
   attempts, unchanged structural thresholds, and reviewed composites. Viewer-grade
   Canvas2D is support evidence, never WebGL parity proof (P1-015/QA-012).
6. **Harness** — the full validation suite on every first-party contract, every PR.
7. **Simulation parity** — real Rapier vs exact-pinned MuJoCo on contract-derived
   canonical scenes in the required worker check on every engine/exporter bump
   (training side canonical, D20). Keep the keyless registered fixture for local
   determinism, but never use fixture-only green to close real-engine acceptance;
   bind source, provider, SI/radian units, driver timestep, and substeps in retained
   evidence, and review every engine or baseline re-pin under the golden policy.
8. **Regression** — physics trajectory tolerance bands; minimized fuzz failures
   become permanent cases (XC-24).
9. **Trust-boundary adversarial corpus** — imports, JSON Patch, EnvSpec, replay,
   provider output, catalog citations, export policy, and hardware payloads retain
   stable accepted/refused cases plus random no-panic coverage. Non-finite numbers,
   unbounded inputs, malformed graphs/vectors, unsafe command tokens, and provenance
   or policy contradictions fail closed (QA-007).
10. **Brief-25** — generation quality as CI with a metrics dashboard (D-evals).
11. **Browser E2E** — production Studio bundle + real built WASM + gateway/validator
   + isolated Postgres for the complete builder loop; public-share and private-route
   authorization must be proven in separate browser contexts (QA-002).
12. **Browser support and accessibility** — run the production share/configurator
    journey with real WASM in Chromium, Firefox, and WebKit; assert semantics,
    accessible names, skip/focus behavior, keyboard orbit/equip/explode/blueprint,
    contrast, critical target size, narrow layout, reduced motion, and tier-appropriate
    presentation. Viewer-grade engines use a core-baked Canvas2D schematic, remain
    low quality, and must not load the dynamic scene/Three.js chunks; assert positive
    draw statistics so the fallback cannot become a blank semantic shell. Keep the
    full-Studio/viewer-grade boundary and vendor-device limitations synchronized with
    [`BROWSER-SUPPORT.md`](BROWSER-SUPPORT.md); a proxy engine is not a real-device or
    screen-reader certification (QA-003).
13. **Policy runtime** — execute a digest-bound real ONNX model in focused tests and
    the production browser bundle; assert lazy same-origin runtime assets, D8-derived
    observations, D9 cadence, action bounds, motion-layer consumption, and negative
    authority/layout/version/hash/non-finite cases (P7-008).
14. **Training runtime** — train only from an immutable gateway-owned admitted-model
    snapshot; re-run validator admission and derive simulator truth in Rust; exact-pin
    every numerical/runtime dependency; keep estimator truth, seeds, source/config/
    contract/parameter digests, robustness scenarios, and export decisions in
    lineage. Required smoke must execute real MuJoCo plus PPO/SAC/ONNX boundaries and
    fail closed on pin or authority drift. Short CI runs explicitly disclaim
    learning quality and overnight SLOs; P7-012 closes those only through clean
    protected consumer-hardware evidence. Deployed GPU economics (P7-013) and field
    transfer (EXT-003) remain separate gates; closing P7-003 does not close them.
    Any observation/action/axis/reward correction that changes a valid policy's
    meaning requires coordinated task/tensor/bundle majors, an executable legacy
    read oracle, migration guidance, generated-runtime review, and retraining rather
    than relabeling old bytes (D42). Overnight evidence freezes the recipe before the
    final run, retains failed attempts honestly, writes atomic task checkpoints,
    validates request hash plus ONNX size/digest/export gate before resume, and keeps
    simulated vehicle energy separate from host energy.
    Ground trainers also keep flight and ground tensor majors separate: derive every
    wheel/joint, mass/inertia, limit, torque, velocity, and contact-plane assumption
    from the admitted contract in Rust; reject missing authority rather than inserting
    a plausible default. Apply available-torque randomization only as degradation,
    never above the contract ceiling. Keep MuJoCo pose/contact truth out of policy
    observations and target progression. For ground scorecards, integrate only
    positive simulated joint work and label it mechanical simulation energy; never
    relabel it as battery, host, electricity-cost, device, or field evidence. A valid
    exported ground ONNX is not browser-playback proof until an exact ground observer,
    actuator, tensor consumer, failure fallback, and focused runtime test exist (D44).
    Offline learning must start from one gateway-owned, consented telemetry log bound
    to the same admitted model. Preserve the exact replay tape and hash; require its
    header to bind task, tensor, estimator observation source, reviewed/supervisor
    action source, and `controlled-synthetic` maturity. Reject `recorded-device`
    until a P8 recorder can attest it under a reviewed version. Reject unsorted,
    duplicate, non-finite,
    hidden-truth, out-of-shape, or out-of-range samples instead of sorting, filling,
    projecting, or clipping them. Hash the exact dataset and BC parameter state,
    prove the frozen BC-to-randomized-PPO curriculum and same-seed output, then apply
    the normal scorecard without special thresholds. Controlled synthetic pairs prove
    the path, not recorder/device provenance, learning quality, transfer, or field
    maturity (D45).
    Deployed training must narrow provider choice into an exact reviewed contract:
    immutable source/deployment/function/image identity, exact accelerator with no
    fallback, zero provider-side retries, no function secrets or unreviewed egress,
    an explicit remote-input allowlist, a durable provider-call ID before waiting,
    and D38 lease polling. Reject arbitrary payload extras before enqueue and omit the
    owner/model snapshot from provider transport. Once a call ID is persisted, treat
    every ambiguous result as recovery-only rather than replacement authority.
    Serialize shared active/spend limits in the database; debit only a newly inserted idempotent job;
    release active capacity on cancellation without refunding the daily launch ceiling;
    cancel product authority before provider work; reject late output; and keep a
    product-credit reversal distinct from provider billing. Contract tests do not
    establish deployment maturity. Close the sandbox only from a clean protected
    revision with real run/device, billing/tag, hard-stop, alert/SLO, cancellation,
    deletion, and no-duplicate recovery evidence validated by the owning schema
    (D46/P7-013).
15. **Accelerator benchmarks** — compare the same Rust-derived model, initial state,
    controls, solver, precision, timestep, and step count. Warm each path before
    timing, measure JAX lowering/compilation separately, synchronize every timed JAX
    result with `block_until_ready`, report every sample plus the median, and compare
    MJX against MuJoCo's native multithreaded rollout rather than a Python step loop.
    Bind the exact source, contract, compiled MJCF, request, runtime pins, hardware,
    and clean-checkout state. A single CPU/reference-morphology feasibility run can
    validate the harness and parity bands; it cannot establish accelerator speedup,
    training-wall-time savings, cost normalization, an overnight budget, D12
    morphology coverage, or an adoption decision (P7-010).
    The decision-grade run is a separate major: bind explicit D12 simulation-proxy
    identities without claiming SKU-level twin fidelity, hash the raw scorecard/
    200-candidate budget and provider-cost sources, resolve exactly to requested
    float64-capable GPU/TPU with no fallback, and preserve all three rows under one
    clean request. Do not splice revisions or weaken precision/parity for a locally
    available backend; follow D47 and `MJX-DECISION.md`.
    A GPU-capable host does not imply GPU execution: benchmark the same workload,
    choose the measured backend, record requested/resolved device with fallback
    forbidden, and label unused accelerator inventory separately. Adapter-rating ×
    wall-time is only a conservative host-energy upper bound, never measured
    consumption or a basis for electricity cost without telemetry and tariff (D43).
16. **External acceptance** — execute the versioned QA-010 milestone script against
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
- Keep rehearsal progress separate from deployment evidence. One shell-owned session
  may prove exact stage order, reload continuity, skip refusal, and deliberate UI
  interactions, but a checkbox or client-supplied report/policy/job ID does not prove
  a controller, restraint, observer, kill switch, supervisor deadline, or field run.
  A rehearsal state machine must perform no hardware I/O, reject parallel or skipped
  transitions, display D9 rates/fallback, and return explicit false physical,
  deployment, hardware, device, field, and external-beta authority at every stage.
  Real transitions require a separate named-hardware evidence consumer; never promote
  rehearsal acknowledgments in place.
- Treat a hardware write as a versioned artifact, not a string. For D48 bridge-config
  v1, independently verify the Betaflight 2025.12/D12-quad authority, exact
  failsafe-only command list and 2–200 decisecond range, canonical hash, D30/D12/lab
  gates, physical confirmation, 115200 baud, and OS-enumerated port. A successful
  write/flush proves bytes transmitted only; never say the target firmware matched or
  the setting applied until an independent device handshake/readback proves it.
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
- Treat recorder completion as a transaction over append-only evidence. Create one
  exclusive archive, accept only a versioned and bounded input frame, preserve exact
  contiguous sequence and strictly increasing time, retain sparse byte offsets, then
  flush and sync frames/index before finalizing replay and its hash-bound receipt.
  Never overwrite an archive or emit a completed replay/receipt after partial,
  malformed, empty, interrupted, or over-budget input.
- Separate capture mechanics from provenance and consent authority. A D30-gated,
  OS-enumerated serial path or pseudo-terminal proves only the path it actually ran;
  a port/path hash is not device identity. Persist exact capture-consent confirmation
  while keeping archives user-owned and sharing/training reuse false until their
  separate ledger grants exist; capture consent grants neither. Keep
  `recordedDeviceAttested=false` until a reviewed adapter and real-device acceptance
  can prove it. An in-process background thread is not host-suspend/lid-closed proof.
- Treat protocol identity as bounded observation unless a reviewed trust root proves
  otherwise. For a read-only MSP probe, allowlist exact query commands, validate
  framing/direction/command/checksum and deadlines, repeat the complete observation
  on one open port while the recorder is atomically held inactive, keep raw UID/
  responses native, and return domain-separated hashes.
  Stable self-reported firmware/board/build/UID replies can still be emulated or
  replayed: never call them cryptographic attestation, recorded-device provenance,
  recorder custody, lab evidence, or field evidence, and never let them mutate an
  archive/admission record.
- Make recorder custody a separate signed authority and proof, never a caller label
  or archive-v1 field. Load only a bounded, hash-pinned, purpose-limited public-key
  bundle; keep signing keys outside Desktop; strictly verify a domain-separated
  canonical authorization; bind its evidence pack, exact protected revision,
  artifact/model hashes, short validity window, both OS serial descriptors, and D55
  identity/UID hashes. Re-enumerate and observe identity before telemetry opens and
  after a clean stop. Write a create-new proof outside the five-file archive only
  when signed/pre/post/receipt bindings all agree.
- Distinguish acceptance-authority signatures from device signatures. A reviewed
  operator/lab mapping can establish bounded session custody without making an
  unauthenticated MSP UID cryptographic device attestation. Fixture keys establish
  only contract mechanics. Expired/revoked/wrong-purpose roots, signature/clock/
  revision/port drift, recorder failure, or post-observation failure produce no
  custody proof; they never erase or relabel an otherwise valid v1 archive, promote
  D54, grant sharing/training, or establish lab/field maturity.
- Keep recorder lifecycle in the native shell, not React state. Expose one exact
  versioned `inactive|recording|finished` status so webview reloads cannot create a
  second capture or lose an ended thread; require explicit stop to collect either a
  persisted receipt or the fail-closed recorder error before another start.
- Derive recorder contract hash, lockfile hash, and seed only from the active admitted
  validator report. Strictly parse bridge, port, control, and receipt responses; send
  no raw frames through Studio; and never let status/start/stop promote device, field,
  sharing, training, authenticity, or gateway-materialization authority. Require a
  new bounded absolute output path for every capture and keep native D30/D12,
  OS-enumerated-port, baud, and consent checks sovereign over the UI.
- Materialize recorder archives as five private checksum-bound objects, never one
  512-MiB JSON request or a database JSONB tape. Rerun native streaming verification,
  emit a path-free exact plan, pin every presigned PUT to one configured origin,
  disable redirects and implicit proxies, stream sized files, then require server
  length/type/checksum inspection plus bounded manifest/receipt cross-binding. Keep
  object-integrity, archive-semantics, device/field provenance, and sharing/training
  authority as separate explicit states; D53 may set only the first.
- Admit materialized recorder archives only through a separate sovereign native
  verifier. Stream all five owned objects with declared-size and SHA-256 enforcement
  into private exclusive temporary files, bound both read and process time, delete the
  temporary root before persistence, and require an exact report-to-plan/object/
  admitted-model/contract/lockfile match. Store only a bounded object-backed
  telemetry reference, never the tape in JSONB. Keep D53 immutable and keep device,
  field, recorded-device, sharing, training, and auto-arm authority false; explicitly
  refuse the reference from legacy training even if consent exists until a separately
  versioned recorded-device contract is reviewed.
- Treat ghost geometry as a compact versioned view, not another telemetry store or a
  provenance upgrade. Keep raw recorder frames object-backed; bind SI/Y-up point
  order, finite increasing time, divergence math, decimation and sparse-index
  semantics; cap the current view at ten minutes and 6,001 points. Strictly reparse
  it in Studio, precompute static paths, and interpolate only through the index.
  Caller-supplied inputs stay unverified and fixture inputs stay
  controlled-synthetic; device, recorded-device and field flags remain false. A
  seek-computation benchmark is not a full render, named-hardware or field claim.
- Treat co-design as an untrusted patch-producing optimization boundary. Start from
  one exact gateway-owned admitted snapshot; allow only a versioned bounded patch
  subset; reapply every patch and recompute candidate, native-evidence, admission,
  and Pareto truth inside the worker. Keep the sovereign native validator separate
  from the runtime-budget measurement so host jitter never changes an engineering
  verdict. Pin and name each real engine, timestep/substep protocol, training-bundle
  version, task/controller maturity, and source/dependency digest. A three-candidate
  controlled engine smoke proves plumbing, not CMA-ES/Optuna breadth, 200-candidate
  overnight completion, trained finalists, catalog search, provider maturity, build
  readiness, hardware authority, or field evidence; those require separately
  versioned retained proof.
- Separate proposal generation from physical optimization evidence. A real CMA-ES or
  TPE library may generate a deterministic, hash-bound plan against a synthetic
  acquisition function, but those rows are proposals only. Freeze algorithm pins,
  seed, exact snapshot, manifold, budget split, replace-only patch semantics,
  candidate hashes, replay, and nonclaims. Do not evaluate constraints, assign
  validator/engine verdicts, compute Pareto, or call a fast 200-proposal command an
  overnight run. The next lane must consume exact proposal hashes and add sovereign
  native/Rapier/MuJoCo evidence before any candidate can be admitted.
- Make expensive co-design consumption a contiguous, hash-bound checkpointed prefix.
  Persist after every candidate; on resume, validate the complete retained prefix
  and fence an unfinished attempt before dispatch. Cancellation advances no cursor.
  Partial and cancelled checkpoints expose no Pareto or finalists. Only after all
  200 exact plan hashes have sovereign evidence may the consumer independently
  derive admission/Pareto and select tier-3 finalists. Keep selected finalists
  distinct from trained finalists, and measured local wall runtime distinct from an
  overnight schedule, provider billing/currency, energy measurement, or production
  cost. A complete local batch grants catalog authority only when the separately
  versioned choice, row, and native proofs below are present; it never grants build,
  hardware, or field authority.
- Test seeded optimizer identity across every supported worker architecture before
  calling a proposal plan portable or deterministic. Same-host replay proves only a
  local fixed point. Compare all patch/candidate hashes across hosts; if any differ,
  record the platform boundary, pin one architecture for the complete batch, reject
  heterogeneous resume, and require a reviewed major that either canonicalizes
  arithmetic/update semantics or binds exact platform and scheduler authority.
  Exact-platform binding may close recovery integrity, but it never grants cross-
  runtime cache/resume or tier-3 authority; training and overnight/provider claims
  retain their own evidence gates.
- When selecting platform-bound recovery, bind more than an architecture label.
  Hash the exact OS/runtime, Python ABI, numerical wheel RECORD and build metadata,
  CPU feature map, BLAS/LAPACK backend, and optimizer package RECORDs; include that
  hash in plan/checkpoint cache keys and candidate lineage. Refuse a foreign
  authority before dispatch, compare every proposal hash at one clean source
  revision, and keep cross-runtime cache/tier-3 claims false.
- Treat a co-design categorical as an exact equipped revision, not a preference
  label. Hash the sorted raw catalog rows, bind slot/variant/ranged ref/exact pin,
  row digest, physical fields, confidence/review state, and license/export source;
  then switch only `equippedVariantId` and exact required simulation mirrors under
  D32. Re-run the sovereign validator with the same catalog and record only equipped
  component proofs. Unequipped choices must not affect HUD, BOM, lockfile resolution,
  simulation, or lineage. Any catalog-byte drift partitions cache and blocks resume.
  Repository row authority is not marketplace approval or live persistence: keep
  review and exposure false until an explicit owner workflow proves them. If a
  downstream bundle still consumes inline mirrors, say so and do not call it
  catalog-native mass/inertia/thrust-table physics.
- Treat bench-table presence and bench-table applicability as different facts. Bind
  the exact row/table/source even when unusable, but let it drive propulsion only
  when its voltage grid covers the equipped battery operating range and its prop
  diameter×pitch matches exactly. Require one unique applicable table; ambiguous
  matches fail closed rather than gaining array-order precedence. Never edge-clamp,
  rescale, or infer a missing voltage/prop regime. Record non-empty rejection reasons
  and every fallback in the versioned physics artifact. Add catalog mass and sourced-
  dimension inertias only at declared mounts, independently recompute each declared
  uniform-solid tensor and mount-centered COM at readback, leave collision geometry
  contract-owned, and require the compiled MuJoCo body-mass sum to close exactly. A
  review-gated, rejected table is lineage—not applicable thrust, marketplace
  approval, or physical validation.
- Version bench-grid representation independently from component revision and
  downstream physics artifacts. Missing or v1 rows remain exact single-voltage
  sweeps; v2 carries voltage on every point and forbids the table scalar. Require a
  finite bounded rectangular voltage×throttle grid, unique coordinates, exact
  throttle endpoints, monotonic thrust/current per voltage, stable table identity,
  prop, positive confidence, and HTTPS source. Preserve unattributed database history
  as such—never synthesize prop/source/review authority during migration. Copying a
  v1 scalar onto every point is a shape migration only, not new measurement coverage.
  Before a v2 grid drives training, bump the downstream physics authority, retain
  the exact grid, and independently recompute the curve in the consumer.
- Make exact-grid readback a complete consumer proof, not a metadata spot-check.
  Retain every SI voltage/throttle/thrust/current point and exact table authority;
  independently validate rectangularity, coordinate uniqueness, endpoints, and
  per-voltage monotonicity; then reproduce every emitted thrust, voltage, and current
  curve sample under an explicitly versioned interpolation and fixed-point recipe.
  Bind the grid, recipe, readback result, cache, checkpoint, and resume authority.
  If no uniquely applicable table exists, emit null selection and `tableDriven=false`
  instead of claiming the rejected grid was reconstructed. Controlled-synthetic grids
  prove the implementation path, never catalog sourcing, owner review, marketplace
  readiness, or physical accuracy.
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
- Treat upload registration as intent, not proof. Require declared length, MIME type,
  and SHA-256; return length/type in the contract and bind the checksum into the
  presigned PUT; keep the row staged; then inspect the stored object server-side and
  atomically complete only the unchanged exact
  declaration. Never let staged bytes authorize processing or download.
- Classify transient worker faults narrowly. Provider outage/rate limit, process
  timeout, and explicitly incomplete upstream objects may retry under deterministic
  bounded backoff; invalid output and unknown faults fail terminally. Reclaim expiry
  with a new fence token and record late duplicates as discarded, not succeeded.
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
- Data changes follow D37 and [`MIGRATIONS.md`](MIGRATIONS.md): prove the clean path
  and every supported populated predecessor, exact checksum/idempotency history,
  atomic failure recovery, concurrent serialization, backup/restore impact, and the
  roll-forward/application-rollback procedure.
- Production readiness includes secrets rotation, non-root/minimal images,
  observability, SLOs, alert ownership, incident response, retention, deletion, and
  disaster recovery.
- Managed deployments follow D68 and [`OPERATIONS.md`](OPERATIONS.md): build once
  from clean protected main, promote identical digest/SBOM/provenance identities one
  direct stage at a time, bind startup to exact manifest bytes, and keep secret
  values out of manifests/evidence. An environment name, schema, test, image, or
  successful deploy is not live or field proof.
- Hardened artifacts follow D69 and
  [`hardened-runtime.v1.json`](../infra/deployment/hardened-runtime.v1.json): exact
  base/tool digests, multi-stage minimal targets, numeric non-root users, read-only
  roots, explicit writable paths, file-mounted secrets, private data-plane networks,
  TLS, dropped capabilities, finite resources, distinct liveness/readiness, graceful
  stop, SPDX/provenance/vulnerability evidence, and retained nonclaims. An ephemeral
  CI container restart is not a managed-sandbox rollback.
- Registry publication follows D70 and
  [`hardened-registry.v1.json`](../infra/deployment/hardened-registry.v1.json): dispatch
  only the exact protected `main` head, build each proprietary application image
  once, push without mutable tags, bind the raw registry-manifest digest, attach both
  BuildKit and GitHub provenance, scan and generate SPDX from the exact registry
  reference, then pull and verify it in a separate job before emitting the versioned
  publication record. A registry object is a promotable artifact, not an installed
  sandbox, rollback, live service, production release, or license grant.
- Keep database history forward-only. Roll back application artifacts with an exact
  compatible manifest; restore data only for verified loss/corruption under the
  backup/DR procedure, never to erase a migration.
- Local green is not remote green. Remote green is not a release. A release is not
  field proof.
