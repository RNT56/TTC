# Repository governance and required checks

Owner: repository maintainers  
Last reviewed: **2026-07-18**

This is the executable contract for default-branch protection, check stability,
dependency/security triage, and release escalation. It complements `AGENTS.md`; it
does not replace the release gate in `EXECUTION-ROADMAP.md`.

## Default-branch ruleset

`main` must use a repository ruleset with these properties:

- target: default branch;
- active enforcement;
- changes enter through pull requests;
- at least one approving review when more than one maintainer is active; for a solo
  maintainer, require the PR and checks while allowing the owner to merge;
- dismiss stale approvals after new commits;
- require conversation resolution;
- block force pushes and branch deletion;
- require branches to be current before merge;
- administrators bypass only for a documented incident, never ordinary delivery.

The exact merge-blocking check names are:

1. `forge-core (Rust)`
2. `studio + gateway (TypeScript)`
3. `catalog data plane (Postgres)`
4. `compute workers (Python)`
5. `dependency review`
6. `desktop native (macOS)`
7. `hardened runtime images`

As of 2026-07-18, active ruleset `18843164` contains all seven names. The D69 check
was added only after exact implementation head `991deb3` passed job `88066177198`
and its downloaded artifact `8428032260` was independently inspected. Final PR head
`6818812` and protected squash `290060d` then passed that same required job; protected
artifact `8428228432` binds the latter. This changes merge authority, not managed-
runtime maturity.

Do not casually rename these jobs. Change a required name in two stages: first ship
the replacement check while the old name is still present, then update the ruleset
and this document, then remove the old check.

The Postgres job must apply every migration, run QA-004's clean/every-populated-
predecessor/checksum/idempotency/failure/concurrency acceptance, seed the reviewed
catalog, run the P3/user-data/consent/lifecycle assertions owned by `pnpm verify:db`,
and execute any cross-language transactional materializer acceptance added by the
changed surface. Its uploaded evidence must include
`qa004-migration-acceptance.json` bound to the exact checkout.
For QA-005 the same `pnpm verify:db` invocation must also run exact object
staging/partial/refusal/completion and lease-fenced queue fault scenarios. The
uploaded `qa005-fault-acceptance.json` and `qa005-upload-acceptance.json` must bind
source and checkout revision and prove crash/expired reclaim, duplicate-result
discard, one-time materialization, retry/backoff, rate-limit exhaustion, partial
recovery, cancellation, staged consent refusal, and exact completion. This
deterministic fixture never substitutes for a production outage or object-provider
incident drill.
It must also run QA-002 through a production Studio preview with same-origin gateway
proxying, the exact downloaded validator artifact, real built WASM, headless Chromium,
and the isolated Postgres service. The uploaded JSON evidence or failure screenshot
must remain attached to the exact workflow run.
After QA-002, the same required job runs QA-003's separate production-bundle matrix
in Chromium, Firefox, and WebKit. It must retain the default three-engine list,
record the exact source revision and Studio/browser versions, exercise the real-WASM
share/configurator keyboard journey, prove Chromium's full WebGL path and Firefox/
WebKit's positive Canvas2D drawing without scene/Three.js requests, and fail on
semantic, focus, contrast, target-size, responsive, reduced-motion, page-error,
renderer/asset, or support-tier drift. The
uploaded `browser-acceptance-evidence` artifact contains both QA-002 and QA-003
records; WebKit is a compatibility proxy, not an Apple-device claim. The policy and
local commands are owned by [`BROWSER-SUPPORT.md`](BROWSER-SUPPORT.md).
For P11-005 that includes `pnpm db:assert-commerce-jobs`, which executes the exact
gateway upsert under concurrent retry, request drift, and cross-owner key reuse, plus
Python 3.12 and `workers/integration/assert_commerce_postgres.py`, which prove valid
offer commit and corrupt-output rollback plus failed-job recovery against the same
database service. A schema-only insert is not sufficient evidence for gateway or
worker persistence behavior.
For P7-013 the same database job runs `pnpm db:assert-modal-operations` against the
isolated Postgres service. Its exact-source artifact must prove provider-call ID and
attempt persistence, current-lease ownership, stale-lease refusal, cancellation and
late-result fencing, idempotent pre-materialization credit reversal, and cleanup.
That deterministic database fixture is not a credentialed Modal, billing, alert,
deletion, or recovery result.

The required `forge-core (Rust)` job also runs the golden-artifact policy against the
cumulative PR patch. Registered schema/render/physics/validator/corpus/generated
runtime changes must have a new append-only review record; the frozen prototype HTML
is immutable. The machine inventory and review procedure are owned by
[`GOLDEN-ARTIFACTS.md`](GOLDEN-ARTIFACTS.md).

The same required job runs the `QA-010` external-acceptance policy. All eight
milestone contracts and generated templates must remain machine-valid; independent
roles, required authority/evidence/measurement/signoff fields, D30/D12 hardware
terms, secret rejection, and non-repository evidence storage cannot be weakened
without failing the protected check. This deterministic policy check never stands in
for an actual external run; the protocol is owned by
[`EXTERNAL-ACCEPTANCE.md`](EXTERNAL-ACCEPTANCE.md).

The same full gate runs `pnpm verify:deployment`. D68's
[`deployment-policy.v1.json`](../infra/deployment/deployment-policy.v1.json), manifest
schema, compatibility versions, runtime-variable inventory, offline manifest and
direct-promotion rules, managed gateway/worker bootstrap constants, and explicit
local-Compose nonclaim must stay synchronized. A registered policy/schema change
also requires append-only golden review. This deterministic gate proves contract and
fixture behavior only; it does not prove a sandbox, production deploy, secret
rotation, backup, SLO, or external beta. The operational acceptance sequence is
owned by [`OPERATIONS.md`](OPERATIONS.md).

The required CI workflow also owns D69's `hardened runtime images` job. It validates
[`hardened-runtime.v1.json`](../infra/deployment/hardened-runtime.v1.json), builds the
three exact application targets, retains build metadata plus SPDX SBOM and
vulnerability reports, and exercises the TLS/private-network/least-privilege/probe/
graceful-restart fixture. The job must stay required before OPS-002 can close, but its
ephemeral output is not managed-sandbox install or rollback evidence.

The required `compute workers (Python)` job depends on the exact validator artifact
from `forge-core`. It installs exact `workers[dev,mujoco,training,mjx,deployment,codesign]` so
the Modal 1.5.2 deployment contract/evidence validator and CUDA authority cannot skip
for a missing optional dependency. In addition to the complete Python 3.12 suite, it installs the
reviewed MuJoCo 3.9.0 parity extra, generates source-revision/request-hash-bound MJCF
from the checked-out Rust exporter, executes real Rapier and MuJoCo
drop/pendulum/hover/gait scenes, and uploads the request, both baselines, and
comparison even on failure. A provider/version/source/timestep/substep mismatch or a
tolerance failure blocks the same existing check; the job name and default-branch
ruleset do not change. The keyless local full gate still compares against the
registered engine-backed fixture. The same job executes D64's exact-source
`forge-codesign-search-plan/3.0.0` smoke under pinned `cmaes==0.13.0` and
`optuna==4.9.0`; this checks exact 100/100 proposal breadth, raw catalog authority,
both exact equipped battery revisions, review/license/export lineage, and every held
nonclaim, not an overnight result. D62/D63 policy tests retain v2 historical coverage
for exact numeric-runtime identity, cache partitioning, heterogeneous-resume refusal,
and the all-200 comparison shape without portable or tier-3 authority. The v3 batch
additionally requires catalog-aware native v2, equipped-only proof, catalog/runtime-
bound checkpoints, and foreign-catalog refusal; marketplace review/live persistence,
catalog-native MuJoCo physics, tier 3, and provider/overnight claims remain false.
The D65 v4 batch additionally binds bundle-v3/catalog-physics-v1 mass, inertia,
compiled-mass closure, and table applicability. D66 does not alter that artifact: the
same Rust/Python job consumes the registered catalog-grid corpus and exact-matches
row-v1/v2 format semantics, while the Postgres job proves migration 0027 on clean and
every populated predecessor. Format support alone remains neither sourced grid nor
training authority.
The worker check validates D46 structure only. P7-013 closure separately deploys from
a clean protected revision and retains the real L4/device, billing/tag, spend-stop,
alert/SLO, cancellation, deletion, and no-duplicate recovery evidence described in
`MODAL-OPERATIONS.md`.

The required `studio + gateway (TypeScript)` job runs
`pnpm verify:compatibility` and `pnpm verify:docs-contracts` before building. The
generated OpenAPI, event/artifact catalogs, manifest, and human reference must
exact-match all registered Fastify/TypeBox routes, documented event emissions,
compatibility domains, worker queue kinds, examples, and guide links. A route or
contract-documentation change cannot merge by editing generated output directly.

## Release-blocking checks

The following are not required on every PR, but must be green on the release commit:

- `golden-scene parity gallery (P1-015)`;
- `core coverage (>=80% lines)`;
- `dependency audit`;
- `source SBOM (SPDX)`;
- `CodeQL (javascript-typescript)` and `CodeQL (python)`;
- validator `attest and verify release bundle` workflow job plus downloaded
  checksum/install/version and GitHub-attestation proof.

Nightly or scheduled failure opens a release blocker immediately. It becomes a merge
blocker when the failure is deterministic on the PR tree or affects the changed
surface.

The parity job must execute `pnpm parity`, including the focused harness-policy
tests. Its custom server carries the production COOP/COEP isolation contract; a
preflight must prove full-Studio Chromium, available `SharedArrayBuffer`, high/WebGL
scene quality, initialized advanced effects, no page errors, and a loaded artifact
before any image comparison. Only an isolated renderer-initialization failure may
retry, once, with a fresh browser. Every capture remains low-tier WebGL with the
unchanged edge-F1 ≥ 0.85 and ≤ 40 draw-call gates. Always upload preflight, metrics,
composites, and failure images. Both JSON evidence files must use the
`forge-parity-gallery.v1` schema and embed matching declared-source and checkout Git
SHAs plus the checkout dirty state; workflow evidence fails closed on a mismatch or
dirty checkout. Canvas2D viewer output is valid QA-003 fallback evidence but never
P1-015 parity evidence.

## Security and dependency operations

- Dependabot vulnerability alerts, security updates, secret scanning, and push
  protection remain enabled.
- `.github/dependabot.yml` opens grouped weekly Cargo, pnpm, Python, and Actions
  updates. Major updates stay separate and require compatibility review.
- The root `packageManager` pin and `pnpm-workspace.yaml` lifecycle allowlist are
  supply-chain controls. Package-manager upgrades require a frozen install with no
  lockfile drift, a low-severity audit, the full relevant local gate, and exact-head
  protected security proof. `allowBuilds` entries stay version-exact; broad or
  global lifecycle-script authority is prohibited.
- Every external workflow action uses an immutable 40-character commit SHA with a
  human-readable version comment. `pnpm verify:workflows` enforces this locally and
  the required `dependency review` job enforces it on pull requests.
- CI and Compose service images that participate in persisted-data or artifact proof
  use an explicit upstream release tag plus immutable manifest digest. Record why a
  substitute distribution is used, review its provenance and license, and rerun the
  complete dependent acceptance before changing either tag or digest. Never treat a
  mutable `latest` image or an unpinned object-store client as release evidence.
- Repository Actions policy permits GitHub-owned actions plus only the exact pinned
  third-party action revisions used in-tree; all other external actions are denied.
- Security and release workflows generate a validated SPDX JSON source SBOM. Release
  publication still requires artifact-specific SBOM, provenance, and downloaded
  verification under GOV-008.
- Release verification inspects every native/WASM archive under exact entry
  allowlists plus compressed/member byte ceilings before extraction or installation;
  traversal, absolute/drive/backslash paths, duplicates, or extra members fail.
- Authentication, provider/network, secret, upload/object, worker/command, callback,
  abuse-control, log, or archive changes must update `THREAT-MODEL.md` and its
  negative-test matrix in the same PR. Deterministic application guards never replace
  the listed live deployment controls.
- Low-or-higher advisories fail the security audit. Exceptions require a dated owner,
  expiry, exploitability analysis, compensating control, and TODO/decision record.
- Registry or audit-client protocol failure is a failed security control, not a
  clean result. Repair the client/toolchain against the current documented endpoint
  and re-run the exact protected head; never use `|| true` or downgrade the gate.
- Secret alerts are triaged immediately: revoke/rotate first, then remove exposure and
  document impact. Never merely delete history and assume the credential is safe.
- CodeQL alerts are triaged within seven days; high/critical findings block merge and
  release. False positives require a documented dismissal reason.

## Evidence and audit cadence

For each protected merge record the PR, exact commit, required check conclusions,
and post-merge CI. For releases additionally record nightly/security conclusions,
artifact checksums, install/version proof, and rollback notes. Review this contract
quarterly and whenever a workflow job, default branch, maintainer model, or release
surface changes.

## Curated contributor workflow

`good first issue` is a maintainer-applied readiness label, never a user-selected
category. Before applying it, copy `.github/GOOD_FIRST_ISSUE_TEMPLATE.md`, verify the
focused commands on current protected `main`, and confirm the issue has one outcome,
a stable TODO/decision, bounded files, deterministic keyless acceptance, a named
mentor, explicit exclusions, and no new runtime dependency or protected authority.

Do not curate security/credential, user-data/privacy, migration, public-format,
golden/oracle, release/workflow, live-provider/operations, legal, or hardware-
authority changes as first issues. The public bug and proposal forms must not
auto-apply `good first issue`.

Contributors comment and request assignment before work. Maintainers check overlap
and scope, then assign; a comment alone is not a reservation. Ask for a status update
after seven days without a draft or update, and allow reassignment after a further
seven days without reply. Remove the label immediately when protected-main evidence,
scope, prerequisites, or mentor availability drifts. The complete contract and
monthly maintenance measures are in
[`CONTRIBUTOR-ONBOARDING.md`](CONTRIBUTOR-ONBOARDING.md).
