# Repository governance and required checks

Owner: repository maintainers  
Last reviewed: **2026-07-13**

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

Do not casually rename these jobs. Change a required name in two stages: first ship
the replacement check while the old name is still present, then update the ruleset
and this document, then remove the old check.

The Postgres job must apply every migration, seed the reviewed catalog, run the P3/
user-data/consent/lifecycle assertions owned by `pnpm verify:db`, and execute any
cross-language transactional materializer acceptance added by the changed surface.
It must also run QA-002 through a production Studio preview with same-origin gateway
proxying, the exact downloaded validator artifact, real built WASM, headless Chromium,
and the isolated Postgres service. The uploaded JSON evidence or failure screenshot
must remain attached to the exact workflow run.
For P11-005 that includes `pnpm db:assert-commerce-jobs`, which executes the exact
gateway upsert under concurrent retry, request drift, and cross-owner key reuse, plus
Python 3.12 and `workers/integration/assert_commerce_postgres.py`, which prove valid
offer commit and corrupt-output rollback plus failed-job recovery against the same
database service. A schema-only insert is not sufficient evidence for gateway or
worker persistence behavior.

The required `forge-core (Rust)` job also runs the golden-artifact policy against the
cumulative PR patch. Registered schema/render/physics/validator/corpus/generated
runtime changes must have a new append-only review record; the frozen prototype HTML
is immutable. The machine inventory and review procedure are owned by
[`GOLDEN-ARTIFACTS.md`](GOLDEN-ARTIFACTS.md).

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

## Security and dependency operations

- Dependabot vulnerability alerts, security updates, secret scanning, and push
  protection remain enabled.
- `.github/dependabot.yml` opens grouped weekly Cargo, pnpm, Python, and Actions
  updates. Major updates stay separate and require compatibility review.
- Every external workflow action uses an immutable 40-character commit SHA with a
  human-readable version comment. `pnpm verify:workflows` enforces this locally and
  the required `dependency review` job enforces it on pull requests.
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
