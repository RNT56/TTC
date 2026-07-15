# Contributor onboarding and curated first issues

Owner: repository maintainers
Last reviewed: **2026-07-15**
Status: living contributor-governance contract

This document owns the path from "I want to help" to a reviewed, protected merge.
It complements [`../CONTRIBUTING.md`](../CONTRIBUTING.md), the canonical working
rules in [`../AGENTS.md`](../AGENTS.md), and the repository check contract in
[`REPOSITORY-GOVERNANCE.md`](REPOSITORY-GOVERNANCE.md).

## 1. Start with the right route

| Intent | Route |
|---|---|
| First contribution | Choose an open maintainer-curated [`good first issue`](https://github.com/RNT56/TTC/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22), then follow the claim flow below |
| Reproducible defect | Use the structured bug form with sanitized evidence |
| Product or engineering proposal | Use the proposal form and identify the user outcome plus relevant TODO/decision |
| Security, credentials, unsafe hardware authority, or private data | Stop; use [private vulnerability reporting](https://github.com/RNT56/TTC/security/advisories/new), never a public issue |
| Legal, licensing, conduct, or personal-data concern | Follow [`../SUPPORT.md`](../SUPPORT.md) and avoid posting sensitive material |

A `good first issue` is small in scope, not lower in correctness. Validator,
security, privacy, compatibility, provenance, licensing, and hardware rules apply to
every contribution.

## 2. Prepare the repository

Read, in order:

1. [`../AGENTS.md`](../AGENTS.md);
2. [`PROJECT-STATE.md`](PROJECT-STATE.md) and the newest changelog entry;
3. the issue and its stable TODO/decision reference;
4. the named owning documentation and exact acceptance commands;
5. [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for setup, licensing, and PR rules.

Baseline setup:

```bash
corepack enable
pnpm install --frozen-lockfile
python3 -m pip install -e 'workers[dev]'
pnpm verify
```

Use the focused commands named in the issue while iterating. The full command can be
left to the end when the issue explicitly requires it. A missing Docker service,
credential, GPU, external account, or hardware rig is a scope error for a first issue,
not something a newcomer must acquire.

## 3. What qualifies as a curated first issue

Maintainers apply `good first issue` only when every item below is true:

- one concrete outcome and one owning stable TODO/decision are named;
- the expected files or directories are bounded, normally five files or fewer;
- acceptance commands are exact, deterministic, and runnable without secrets,
  paid services, production access, special hardware, or private evidence;
- success, failure, and "done" are observable without maintainer-only context;
- the issue names an available maintainer/mentor and the intended maturity boundary;
- no new runtime dependency, broad refactor, public format change, migration, release,
  or re-pin is hidden inside the task;
- likely adjacent work is explicitly out of scope;
- the default branch is green when the issue is published.

The maintainer copies [the curation template](../.github/GOOD_FIRST_ISSUE_TEMPLATE.md),
removes instructional comments, verifies every command on current protected `main`,
then applies `good first issue` and `help wanted`. Public bug/proposal forms never
apply `good first issue` automatically.

## 4. Excluded first-issue authority

Do not curate these surfaces as first contributions:

- credentials, authentication, cryptography, vulnerability remediation, secret
  handling, outbound-network policy, or security-control exceptions;
- live provider configuration, billable compute, production operations, backup/DR,
  service quotas, or incident response;
- user photos, telemetry, personal data, consent, retention, deletion, legal holds,
  moderation, trademark, or export-control decisions;
- Postgres migrations or persisted-data compatibility;
- public schemas, reports, API/event/artifact versions, deprecation/removal policy,
  release versions, publication, or branch-protection/workflow authority;
- frozen prototype changes, registered golden artifacts, baseline/threshold re-pins,
  declared verdict changes, or validator weakening;
- hardware commands, arming, capture, supervisor/FC authority, D30/D12 evidence, or
  uncontrolled physical tests;
- weapons, targeting, munitions, or interdiction functionality.

A focused test or documentation task near one of these systems is eligible only when
it cannot change the protected authority and the issue states that boundary plainly.

## 5. Claim, assignment, and handoff

1. Comment on the issue before starting. State that you read the issue, name the
   focused acceptance command you will run, and ask to be assigned.
2. A maintainer checks for overlap, confirms the scope is still current, and assigns
   the issue. A comment alone is not a reservation.
3. Work on one active first issue at a time unless the maintainer explicitly agrees
   otherwise.
4. Post a short update or draft PR within seven calendar days. If there is no update,
   the maintainer asks whether the issue is still active.
5. After a further seven days without a reply, the maintainer may unassign and reopen
   the issue. Communicated pauses are handled case by case.
6. If blocked, report the exact prerequisite or failing command. The maintainer may
   narrow, re-scope, or reclaim the issue; do not expand into excluded authority.

Assignment is a coordination tool, not ownership of repository direction. Maintainers
may pause a task when protected `main`, the owning TODO, or its evidence boundary
changes.

## 6. Implement and request review

- Branch from current `main`; do not push ordinary work directly to `main`.
- Stay inside the issue's named files and outcome. Ask before making a material scope
  change.
- Add or update focused tests when behavior changes.
- Preserve stable diagnostics, generated-file ownership, provenance, and maturity
  language.
- Run the issue's exact acceptance commands and `git diff --check`.
- Update documentation and the changelog only when the issue says they are part of
  the slice or a changed fact requires it.
- Open a PR with the issue number, exact commands/results, and explicit unavailable
  prerequisites. Use `Closes #<issue>` only when the PR fully satisfies the issue.
- Resolve review conversations through code, tests, or a clear evidence-backed
  explanation. Do not weaken a gate to make the PR green.

The same protected checks and review bar apply to first contributions. The label
does not promise merge, a support SLA, or a reduced safety/correctness standard.

## 7. Maintainer review and closure

Before merge, the maintainer verifies:

- the contributor was assigned and no competing implementation was displaced;
- the diff matches the promised files and outcome;
- issue acceptance, focused tests, required repository checks, and patch hygiene pass;
- no excluded authority or maturity claim changed;
- the PR body records exact evidence and closes only the named issue;
- follow-up ideas are new issues, not hidden scope in the current PR.

After merge, close the issue, thank the contributor without overstating product
maturity, and record any recurring onboarding friction in this document or the
curation template.

## 8. Exercised seed set

The first workflow exercise uses three independent, dependency-free slices:

| Issue | Learning surface | Authority boundary |
|---|---|---|
| [#55 — validator report walkthrough](https://github.com/RNT56/TTC/issues/55) | Documentation and stable diagnostics | Explains current output only; no validator/report change |
| [#56 — local Markdown link checker](https://github.com/RNT56/TTC/issues/56) | Node standard-library tooling | No dependency, workflow, or required-check change |
| [#57 — contract-doc Markdown escaping tests](https://github.com/RNT56/TTC/issues/57) | Focused TypeScript test/refactor | Generated outputs and compatibility versions must not change |

All three were published unassigned from protected-main anchor `41dee2d`, with a
named mentor, exact acceptance commands, `good first issue` plus `help wanted`, and
the applicable `documentation`/`javascript` labels. Their continued presence proves
that discovery, labeling, scope, commands, mentorship, claim, and reassignment are
executable; an open issue is not evidence that an external contribution succeeded.

## 9. Maintenance and measurement

At least monthly while the project is accepting contributions, maintainers review:

- whether each labeled issue still reproduces on protected `main`;
- unassigned, claimed, stale, blocked, merged, and withdrawn counts;
- time to first maintainer response and first review, without presenting a support SLA;
- repeated setup, documentation, or command failures worth fixing centrally;
- whether the seed set spans documentation, tests, and tooling without drifting into
  excluded authority.

Remove the label immediately when scope, prerequisites, or default-branch evidence
drifts. Do not maintain a quota by publishing filler work.
