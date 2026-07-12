# Repository governance and required checks

Owner: repository maintainers  
Last reviewed: **2026-07-12**

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

## Release-blocking checks

The following are not required on every PR, but must be green on the release commit:

- `golden-scene parity gallery (P1-015)`;
- `core coverage (>=80% lines)`;
- `dependency audit`;
- `CodeQL (javascript-typescript)` and `CodeQL (python)`;
- validator artifact workflow plus downloaded checksum/install/version proof.

Nightly or scheduled failure opens a release blocker immediately. It becomes a merge
blocker when the failure is deterministic on the PR tree or affects the changed
surface.

## Security and dependency operations

- Dependabot vulnerability alerts, security updates, secret scanning, and push
  protection remain enabled.
- `.github/dependabot.yml` opens grouped weekly Cargo, pnpm, Python, and Actions
  updates. Major updates stay separate and require compatibility review.
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
