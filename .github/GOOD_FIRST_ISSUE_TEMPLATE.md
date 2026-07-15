<!--
Maintainer-only curation source. Copy into a new issue, remove this comment, verify
every command on protected main, and only then add `good first issue` + `help wanted`.
Do not move this file under ISSUE_TEMPLATE: public submissions must not self-apply
curated labels. See docs/CONTRIBUTOR-ONBOARDING.md.
-->

## Outcome

Describe one observable result and why it is useful.

## Ownership and mentor

- Stable TODO/decision: `ID`
- Owning area/document:
- Maintainer/mentor: @RNT56
- Maturity boundary: documentation/test/tooling only; no product-maturity change

## Bounded scope

May change:

- `exact/path`

Must not change:

- list adjacent systems, formats, dependencies, goldens, policies, or live paths

## Acceptance

Run exactly:

```bash
focused command
git diff --check
```

Done means:

- [ ] observable success criterion
- [ ] failure/boundary criterion
- [ ] focused commands pass
- [ ] no excluded authority or maturity claim changed

## Claim flow

Before starting, comment that you read the issue, name the focused command you will
run, and ask to be assigned. A maintainer confirms scope and assigns the issue. Post
an update or draft PR within seven days; after a further seven days without reply,
the issue may be unassigned and reopened.

Read [CONTRIBUTING.md](https://github.com/RNT56/TTC/blob/main/CONTRIBUTING.md), the
[contributor workflow](https://github.com/RNT56/TTC/blob/main/docs/CONTRIBUTOR-ONBOARDING.md),
and the named owning documentation before editing.
