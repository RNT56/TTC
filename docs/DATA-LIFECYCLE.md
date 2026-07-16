# Data lifecycle, deletion, holds, backups, and restore

Owner: repository maintainers and the future privacy/operations owner · Policy
version: **1.0.0** · Executable format: **data lifecycle 1.0.0**
Maturity: **contract + deterministic/local Postgres fixture proof**

This is the operating contract for `SEC-005`. It connects owner deletion to primary
stores, legal holds, backup cataloguing, restore suppression, tombstone expiry, and
bounded audit evidence. It does not claim that a production backup service, disaster
recovery environment, or jurisdiction-specific retention decision exists. Those
remain `OPS-005` and counsel/owner work.

## 1. Binding principles

1. Retain identifiable data only for an explicit purpose and bounded period.
2. Owner deletion removes primary Postgres and S3-compatible payloads immediately
   unless a current, reviewed legal hold blocks the operation.
3. A legal hold is append-only authority, not a mutable flag. It permits retention;
   it does not authorize product use, training, sharing, or operator browsing.
4. Backups are immutable recovery copies, not alternate live storage. Every copy must
   be catalogued, encrypted/protected at least like primary data, assigned an
   affirmative deletion deadline, and tested through a sandbox restore process.
5. A pre-deletion backup must never resurrect a deleted user or object. Restore
   staging checks domain-separated subject digests against deletion tombstones before
   any row or object may enter primary storage.
6. Lifecycle evidence is pseudonymous and bounded: no raw user IDs, object keys,
   content, credentials, or free-form legal narrative.
7. If the catalog, checksum, tombstone check, deletion adapter, or audit write cannot
   prove its result, fail closed and keep the tombstone.

These rules implement storage limitation and accountable erasure without pretending
that erasure overrides lawful exceptions. Product defaults require counsel review
before broad launch. Primary references checked on 2026-07-13:

- [GDPR Article 5 (official EUR-Lex text)](https://eur-lex.europa.eu/eli/reg/2016/679/art_5/oj/eng)
  establishes storage limitation and accountability principles;
- [GDPR Article 17 (official EUR-Lex text)](https://eur-lex.europa.eu/eli/reg/2016/679/art_17/oj/eng)
  governs erasure and its specified exceptions;
- [NIST SP 800-209](https://csrc.nist.gov/pubs/sp/800/209/final) calls for a recovery
  catalog, retention tracking, affirmative deletion of obsolete copies, restore
  procedures, audit trails, and periodic end-to-end restore tests;
- [NIST SP 1339](https://csrc.nist.gov/pubs/sp/1339/final) reinforces creating,
  testing, and reviewing backups during recovery exercises.

## 2. Versioned product defaults

These are conservative pre-production defaults, not universal statutory periods.
Changing a duration, data-class meaning, restore rule, or hold authority requires a
new policy version, compatibility review, migration, tests, changelog entry, and—if
the legal posture changes—a decision record.

| Data class | Primary rule | Primary period | Backup maximum | Tombstone | Purpose |
|---|---|---:|---:|---:|---|
| user content | account lifetime or owner deletion | event-driven | 30 days | 45 days | requested product function |
| consent history | account lifetime or owner deletion | event-driven | 30 days | 45 days | consent accountability |
| safety-refusal audit | age from event | 90 days | 30 days | 45 days | bounded abuse/safety evidence |
| auth operational | native expiry, then sweep | 30-day ceiling | 30 days | 45 days | authentication security |
| terminal job operational | age from terminal time | 30 days | 30 days | 45 days | incident/service diagnosis |
| lifecycle audit | age from event/closed chain | 400 days | 30 days | 45 days | pseudonymous hold/deletion/restore evidence |

`data_retention_policies` is the database copy; `RETENTION_POLICIES` in
`packages/gateway/src/dataLifecycle.ts` is the application copy. The compatibility
gate and Postgres acceptance gate prevent silent drift.

D46 `job_provider_calls` rows are terminal-job operational evidence, not a new
indefinite class. They cascade with the owning job and share its hold and 30-day
terminal retention boundary. The product database stores only byte-free call identity,
deployment/lifecycle state, bounded errors, and reconciled cost. Modal input/output
retrieval may persist provider-side for up to seven days; recorded-device or personal
input is therefore prohibited until an independently reviewed provider-erasure
contract exists. The current FunctionCall API exposes cancellation/lookup but no
manual call input/output deletion method. P7-013 sandbox close therefore requires
immediate application-artifact deletion plus verified provider automatic expiry after
the maximum seven-day TTL; neither replaces provider billing or backup lifecycle
controls.

## 3. Authority and state machines

### 3.1 Legal holds

```text
none -> place(expires <= 365 days) -> active -> release
                              \-> automatic expiry
```

- `legal_hold_events` stores monotonic append-only events linked to the previous
  event. Random IDs and timestamps are not chronology; `event_sequence` is.
- Holds target a SHA-256 digest of `user:ID`, `object:ID`, or `audit:ID`.
- Canonical operator subject IDs are the account ID for `user`, `<bucket>/<objectKey>`
  for `object`, and a stable record reference for `audit`: `generation-refusal/<id>`,
  `job/<id>`, `backup/<id>`, `backup-restore/<id>`, or `lifecycle-event/<id>`. The CLI
  hashes them before persistence.
- Allowed reason codes are `litigation`, `regulatory`, `security-incident`, and
  `billing-dispute`; authority/evidence are opaque references, not narrative.
- A placement must expire within 365 days. Continuing need requires a reviewed new
  event; there is no forgotten indefinite flag.
- Hold mutation, backup registration/restore evaluation, and owner deletion take the
  same globally ordered transaction-scoped advisory locks for each pseudonymous
  subject. Owner deletion checks both the account and every object it will remove,
  so concurrent hold/catalog/restore authority cannot race the purge.
  A block returns HTTP `423` with code `LEGAL_HOLD_ACTIVE`, policy version, count, and
  review requirement—never authority, evidence, or legal narrative.
- Place/release is an operator-only CLI/library operation. No public admin HTTP route
  exists until `SEC-006` supplies a reviewed role/credential boundary.

### 3.2 Account and object deletion

```text
confirmed owner request
  -> lock account
  -> reject if current hold
  -> enumerate object payloads
  -> create user + object tombstones
  -> purge explicit owned/derived rows
  -> delete S3-compatible payloads
  -> delete account
  -> emit receipt 2.0.0 + pseudonymous lifecycle event
```

The whole database side remains serializable. Object deletion failure rolls database
changes back. Receipt 2.0.0 still proves primary/object completion and now adds:

- lifecycle version;
- `restore-suppressed-pending-expiry` state;
- user tombstone ID;
- maximum backup-deletion date;
- tombstone expiry date;
- number of object tombstones.

The receipt does **not** claim that a provider backup was physically deleted. That
claim comes only from the backup adapter and catalog state.

### 3.3 Backup catalog and expiry

```text
register available copy -> due -> deleting -> deleted
                                  \-> delete-failed -> retry
```

- `backup_records` carries provider, opaque external reference, manifest SHA-256,
  capture time, deletion deadline, and bounded status/error code.
- `backup_subjects` maps a copy to domain-separated subject digests. Every backup
  implementation must register every covered subject; an unregistered copy violates
  the policy and prevents a truthful production claim.
- Registration rejects deadlines beyond the 30-day maximum and rejects reuse of a
  provider/reference with different metadata or a different subject manifest. A copy
  covering a tombstoned subject must predate primary deletion and expire before the
  tombstone; a late-discovered valid copy reopens backup completion until deletion.
- `deleteExpiredBackups` claims due rows, invokes an idempotent provider-specific
  deletion adapter, records only a bounded error class on failure, retries failed
  rows, reclaims a crashed `deleting` claim after a 15-minute lease, and marks
  tombstones backup-complete only when no non-deleted catalogued copy remains.
- The generic CLI deliberately cannot mark physical deletion. Production wiring
  must supply a real provider adapter and retained provider evidence under `OPS-005`.

### 3.4 Restore gate

```text
catalogued available copy
  -> exact manifest checksum
  -> not past delete deadline
  -> join subjects against active tombstones
       -> any match: BLOCK restore, record evidence
       -> no match: eligible for isolated restore staging
```

`evaluateRestoreCandidate` is mandatory before restore and must be rerun immediately
before promotion. “Eligible” is not “restored”:
the production drill must restore into an isolated environment, apply the tombstone
filter, verify integrity/application consistency, prove deleted subjects remain
absent, and only then promote unaffected data. `backup_restore_tests` records the
manifest, result, blocked count, and evidence reference. `OPS-005` owns the real
provider/sandbox drill, RPO/RTO, encryption/key recovery, and disaster runbook.

## 4. Retention sweep

`runPrimaryRetentionSweep` is dry-run by default. `--execute` removes:

- expired sessions and verification tokens;
- refusal metadata older than 90 days unless its owner has a current hold;
- terminal jobs older than 30 days unless their owner has a current hold;
- closed/expired legal-hold history, deleted backup-catalog rows, and restore-test
  evidence older than 400 days;
- tombstones only after backup completion and the 45-day expiry;
- pseudonymous lifecycle events older than 400 days.

Legal holds do not extend authentication credentials: expired sessions and
verification tokens are security material, not evidentiary content, and always
follow native expiry. User holds defer their refusal/job rows; audit holds defer the
named refusal, job, deleted backup row, restore test, or lifecycle event. A backup
catalog row is purged only after any retained restore tests. Active and recently
closed hold chains are never purged; a closed/expired chain ages from its newest event.

Every executed sweep appends a bounded summary event. Schedule it only after
`OPS-001..005` assign runtime ownership, alerting, backup coverage, and failure
reconciliation. Until then it is an owner-invoked acceptance/operations tool.
Dry-run returns counts for every class above, including tombstone finalization/
expiry and lifecycle-audit expiry, without mutating rows or appending an event.

## 5. Interfaces

User/API:

- `GET /v1/data-lifecycle/policy` — public versioned defaults and maturity boundary;
- `GET /v1/account/lifecycle` — authenticated account-plus-owned-object hold count
  and catalogued backup exposure, without authority/evidence details;
- `GET /v1/account/export` — export 1.4.0 retains causal-sequence-ordered redacted
  account/owned-object hold history and backup-copy status and adds authoritative
  policy job/byte-free delivery metadata plus the owner's byte-free provider-call
  attempt history without embedding retained ONNX bytes, tokens, or provider payloads;
- `DELETE /v1/account` — exact confirmation, hold-aware receipt 2.0.0.

Operator CLI (builds the gateway first):

```bash
pnpm lifecycle:ops -- help
pnpm lifecycle:ops -- retention-sweep --evidence runbook/2026-07-13
pnpm lifecycle:ops -- restore-check --backup-id <id> \
  --manifest-sha256 <sha256> --evidence restore/<ticket>
```

Hold mutations also require the explicit shell acknowledgement printed by `help`.
Never paste legal narrative, credentials, raw content, or object keys into evidence
or authority fields.

## 6. Acceptance and handoff

Local completion requires:

```bash
pnpm verify
pnpm verify:db
pnpm lifecycle:ops -- help
git diff --check
```

The Postgres gate proves, with unique fixtures:

- current user and object holds block owner deletion, while user/audit holds block
  their age-based retention targets;
- release is append-only and monotonic; released/expired hold history ages out in
  child-before-parent order after 400 days;
- primary rows and object payload handoff complete after release;
- user and object tombstones are pseudonymous;
- a backup captured before deletion is blocked at restore;
- an audit hold defers aged restore-test deletion until its release;
- provider deletion failure stores no private error detail, retries, and a stale
  in-progress claim is safely reclaimed; post-deletion capture is refused and a
  late-catalogued pre-deletion copy reopens the tombstone until it is deleted;
- deleted backups finalize tombstones, which expire only after the policy window;
- exported lifecycle data omits authority/evidence references;
- in-place mutation of authority/audit events is rejected;
- all fixtures clean up and migrations rerun byte-identically.

SEC-005 can be complete at **contract/fixture** maturity with that evidence. A live
privacy or disaster-recovery claim additionally requires `OPS-005`: encrypted real
Postgres/object backups, complete catalog automation, provider deletion receipts,
monthly critical-data sandbox restores, measured RPO/RTO, monitoring/alerts,
documented recovery promotion, and proof that tombstoned subjects do not reappear.
