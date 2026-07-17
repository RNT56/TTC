# Postgres migration and recovery contract

Owner: gateway/data maintainers

Decision: D37

Acceptance owner: QA-004

Migration directory: [`../infra/migrations`](../infra/migrations)

This runbook governs the persisted Postgres schema. It does not claim that production
backup, restore, capacity, RPO, RTO, or disaster recovery is complete; those remain
`OPS-005`. It defines what the repository can prove deterministically and what an
operator must do before, during, and after a deployment.

## 1. Supported schema history

The migration files are a single forward-only chain. During the pre-1.0 product
line, every exact checked-in prefix from `0001` through the migration immediately
before current is a supported predecessor. A new migration therefore extends the
acceptance matrix automatically. A clean database is tested separately.

"Supported" means all of the following are true:

- `schema_migrations` is an exact, contiguous filename prefix of the checked-in
  directory;
- every recorded checksum equals the SHA-256 of the corresponding SQL file;
- no recorded filename has disappeared from source;
- the predecessor can contain the fixture families that existed at that prefix;
- the current runner preserves those rows while applying the remaining chain;
- an unchanged rerun applies nothing and does not rewrite ledger timestamps.

A database with a gap, unknown migration, edited checksum, manually altered ledger,
or unreviewed schema objects is not a supported predecessor. Do not make it appear
supported by editing `schema_migrations`. Reconcile it against the exact release and
the last verified backup first.

Retiring a predecessor requires a new decision record, release/deprecation note,
backup impact analysis, and replacement migration or recovery guide. Deleting or
rewriting a historical migration is never the retirement mechanism.

## 2. Runner invariants

`pnpm db:migrate` uses the shared runner in
[`../scripts/postgres-migrations.mjs`](../scripts/postgres-migrations.mjs). It:

1. takes a database-scoped session advisory lock before reading or changing migration
   state, so concurrent deploys serialize;
2. creates the ledger defensively, then validates the entire recorded prefix before
   executing SQL;
3. runs one migration and its ledger insert in the same transaction;
4. rolls both back if any statement or ledger write fails;
5. refuses missing source, history gaps, filename/order drift, and checksum changes;
6. releases the lock when the run ends; a lost session also releases the lock.

Migration SQL must not contain its own transaction control or use operations that
cannot run in a transaction. If a future operation needs a non-transactional phase,
record a decision and implement a separately resumable state machine; do not weaken
the default runner.

The acceptance commands are:

```bash
pnpm db:migrations:test
DATABASE_URL=postgres://... pnpm db:migrate
DATABASE_URL=postgres://... pnpm db:assert-migrations
DATABASE_URL=postgres://... pnpm verify:db
```

`db:assert-migrations` uses disposable schemas in the configured isolated database.
It proves a clean install, every populated predecessor prefix, current-ledger
checksums, idempotent reruns, injected transactional failure and corrected
roll-forward, checksum refusal, history-gap refusal, and two concurrent runners. It
writes `artifacts/e2e/qa004-migration-acceptance.json`, which the required CI job
uploads alongside the browser evidence.

Fixture families grow with their historical availability: catalog from `0001`,
review from `0003`, generation from `0005`, platform data from `0006`, consent
authority from `0016`, and lifecycle authority from `0017`. Migration `0019` is
exercised with deliberately reversed `0018` sequence values so causal backfill, not
insertion order, owns authority chronology.

Migration `0021` adds the D38 fault boundary. Its populated predecessor acceptance
must prove that legacy running rows are safely requeued before the lease constraint,
existing objects remain readable as complete, new client objects are staged by the
gateway, and all new constraints/indexes survive idempotent rerun. The same isolated
database then runs `db:assert-upload-faults` and `db:assert-queue-faults`; they write
`artifacts/e2e/qa005-upload-acceptance.json` and
`artifacts/e2e/qa005-fault-acceptance.json` respectively.

Migration `0022` adds P7-011 delivery authority without rewriting object payloads.
It adds nullable `policy_artifacts.job_id`, byte-free `policy_metadata`, an object
shape constraint, and a partial unique job index. The backfill binds only the first
unambiguous historical policy whose object metadata names a same-owner
`train.policy` job; ambiguous rows remain nullable and cannot become current download
authority. Historical job output is copied only after removing `onnx.modelBase64`.
The populated `0021` predecessor fixture must preserve the row, bind its job, strip
the copied bytes, and retain the original job output for compatibility. The protected
data-plane gate then runs `db:assert-policy-delivery` against PostgreSQL plus pinned
S3-compatible storage and writes `artifacts/e2e/p7-policy-delivery.json`. Protected
PR #68/`9131289` artifact `8340587390` proves the clean 22-migration install, all 21
populated predecessors, one-winner/stale/substitution/cancellation policy scenarios,
exact object readback, the 11-flow browser loop, and the declared browser matrix.

Migration `0023` is an additive queue-enum expansion for D45's
`train.offline-bc`. It rewrites only `jobs_kind_check`, preserving all existing rows,
lease state, output, consent references, and policy authority. The populated `0022`
predecessor must retain its delivered policy row while the new kind becomes
insertable exactly once. Application acceptance must also prove that the gateway
cannot enqueue the new kind through the fixture provider, without active per-log
`training.reuse` consent, against a different model, or with client-supplied
tape/hash/snapshot authority.

Migration `0024` additively extends D38/D46 operations. Nullable `jobs` columns retain
the current provider-call identity, deployment version/environment/contract hash,
submit/complete/cancel times, cancellation request, product-credit reversal, and
report-ID/time-bound reconciled provider cost. `job_provider_calls` retains one row
per job attempt with a unique call ID and bounded lifecycle/cost-reconciliation
status. Existing jobs remain valid and are not
fabricated into provider calls. The populated `0023` predecessor must preserve the
offline-training row, admit an exact Modal call attempt, enforce the new constraints,
and cascade its attempt rows when the owning job is deleted. Application acceptance
must additionally prove call persistence before wait, stale-lease refusal,
cancellation request/provider cancellation, idempotent exact credit reversal,
idempotent same-report cost reconciliation plus conflict refusal, and no late
materialization through `pnpm db:assert-modal-operations`.

Migration `0025` additively creates `recorder_archive_materializations` for D53. One
owner/artifact row binds exactly five distinct private object IDs plus the sanitized
upload plan and aggregate size. Database constraints keep the row staged until object
integrity and `materialized_at` advance together and permanently keep archive
semantics, device/field authority, sharing, and training reuse false. No existing row
or object is rewritten. `db:assert-migrations` creates five real object rows, proves
the staged defaults, rejects semantic promotion and a partial state transition,
proves the only allowed materialized transition, and verifies owner deletion removes
the row before object cleanup.

Migration `0026` additively creates `recorder_archive_admissions` for D54. One
owner/materialization row links exactly one telemetry log and one admitted model to
the retained sovereign verification report, replay hash, frame count, and duration.
The D53 row is not rewritten and remains false for archive semantics. Database
constraints require admission semantics true while recorded-device/device/field,
sharing, and training authority remain false. The linked telemetry row stores only a
bounded object-backed reference; no replay frames are backfilled or embedded.
`pnpm db:assert-recorder-admission` proves D53 semantic promotion and D54 training
promotion fail closed, object-backed D45 training is refused even with active
consent, export 1.6 contains both rows without payload bytes, and account deletion
removes admission, telemetry, materialization, and all five objects transactionally.

Migration `0027` versions persisted catalog thrust-table identity for D66. It adds
`table_id`, `row_schema_version`, `prop`, `confidence`, and `source_url`; rebuilds
the primary key as `(component_id, table_id, voltage, throttle)`; and bounds numeric,
version, and v2-authority values. Every populated predecessor includes one historical
thrust point. Migration preserves it exactly under reserved table identity
`legacy-unattributed`, row
1.0.0, with null prop/confidence/source rather than inventing missing authority.
New v2 points require non-empty prop, positive confidence, and HTTPS source. The
application seed/assert path proves the current v1 sourced table, permits two
distinct v2 table identities at one coordinate, and refuses incomplete v2 authority.
This migration creates no applicable bench data and upgrades no component revision.

## 3. Writing a migration

Use the next four-digit prefix and a lowercase descriptive name. Never renumber,
rename, or edit an applied file.

- Prefer expand/backfill/contract: add nullable or safely defaulted structure, deploy
  readers/writers that understand both shapes, backfill in bounded resumable work,
  then remove old structure only in a later reviewed migration.
- Keep locks bounded. Estimate affected rows and table-rewrite behavior; large index
  builds or backfills need an operations plan and cannot be hidden in startup SQL.
- State storage, backup, restore, replication, and older-application impact.
- Preserve owner scope, append-only authority, provenance, license/export policy,
  and data-retention semantics.
- Add a populated fixture that exercises the changed data, not only an empty DDL
  assertion.
- Add invariant queries for success and boundary/failure cases.
- Update compatibility, system, release, risk, status, TODO, and changelog owners
  when their facts change.

Changing an enum/check constraint requires an application compatibility plan. Adding
a column with a default requires a rewrite/lock assessment for the supported
Postgres version. Destructive conversion requires a verified backup and restore
path before deploy, not after a failure.

## 4. Deployment procedure

### Before deploy

1. Freeze the exact protected commit and confirm required CI/security checks.
2. Confirm only one deployment controller owns migrations. The advisory lock is a
   safety net, not permission for competing rollouts.
3. Record the current ledger:

   ```sql
   SELECT filename, checksum, applied_at
   FROM schema_migrations
   ORDER BY filename;
   ```

4. Take the environment's approved database backup and record its immutable
   reference, capture time, encryption/retention status, and manifest checksum.
5. Verify the backup is eligible for restore and not suppressed by deletion
   tombstones or legal-hold policy. A backup record alone is not restore proof.
6. Review disk headroom, lock/statement timeouts, replication lag budget, application
   version compatibility, and any object-store coupling.
7. Stop or drain writers when the migration plan requires it. Hardware, provider,
   and worker queues keep their own fail-closed procedures.

For `0021`, stop every old Python worker before migration. Confirm no provider can
continue writing through an old process, record queued/running counts, and let the
migration requeue tokenless legacy running rows. Deploy the D38-capable gateway and
workers together; do not resume queue consumption until the lease-state invariant and
the QA-005 upload/queue assertions pass.

For `0022`, keep training workers stopped until the migration and P7-011 application
version are deployed together. Inventory policy rows with missing/duplicate object
`jobId` metadata; the migration intentionally leaves ambiguous history nullable.
Verify the configured object bucket is reachable and private before resuming policy
jobs. Older readers may ignore the additive columns, but older workers must not
resume because they can publish database-only policy rows and inline model bytes.

For `0023`, stop queue writers and workers before deploying the migration plus the
D45 gateway/worker version. Record queued/running `train.policy` counts, verify no old
binary can claim the new kind, apply the constraint expansion, then run the complete
migration, consent, queue-fault, gateway, and offline-training acceptance. Resume
only after the configured local/Modal worker advertises `FORGE_OFFLINE_RL_CMD`; an
unconfigured worker must leave the row unclaimed rather than improvise a fixture.

For `0024`, disable new Modal enqueueing and stop old training workers. Inventory all
queued/running Modal jobs and external calls; cancel or reconcile any call that lacks
a durable current job/attempt identity. Apply migration 0024, then deploy the D46
gateway and worker together. Configure the exact environment/function version/source/
deployment-contract hash only after the protected function deployment is reviewed.
Run the full migration/queue assertions plus `pnpm db:assert-modal-operations` before
resuming one job at a time. Older applications may ignore the additive columns, but
older workers must not resume because they cannot fence or cancel provider calls.

For `0025`, stop D53 recorder staging while the migration and matching gateway are
deployed. Inventory any manually uploaded recorder objects; the migration does not
discover or fabricate materialization rows for them. Apply 0025, deploy the D53
gateway/Desktop pair, verify the object bucket is private and its presigned origin
matches `FORGE_DESKTOP_OBJECT_UPLOAD_ORIGIN`, then run migration, gateway, Studio,
Desktop, and object-storage assertions before enabling one staged archive. Older
applications may ignore the additive table but must not resume writers that bypass
its exact five-object and nonclaim rules.

For `0026`, disable the D54 admission route while the migration and matching native
validator/gateway are deployed. Let any verifier process finish or terminate it;
temporary roots are failure-cleaned and never backfilled. Inventory D53 materialized
rows and retain all five private objects, but do not fabricate admission rows from
object metadata. Apply 0026, deploy the D54-aware validator and gateway together,
run migration, recorder-admission, user-data, gateway, Studio, and object-streaming
assertions, then enable one explicit admission. Older applications may ignore the
additive table but must not resume writers that reinterpret D53, delete linked rows,
inline replay bytes, or train from object-backed references.

For `0027`, stop catalog ingestion and seeding writers while the migration and D66
Rust/Python/database readers are deployed together. Inventory row counts and duplicate
`(component_id, voltage, throttle)` coordinates before deploy. The primary-key rebuild
takes a table lock; use the reviewed lock budget and schedule a maintenance window if
production volume makes that nontrivial. Capture the approved backup reference before
applying it. Historical readers may continue to inspect the expanded table, but old
writers must remain stopped because they cannot supply stable table identity or v2
authority and may collide under the new key. After migration, prove every old point
is byte/numerically preserved under `legacy-unattributed`, run the D66 seed/domain
assertions, then resume only the new writer. Do not backfill prop, confidence, source,
review, or applicability from guesses.

### Apply and verify

1. Run `pnpm db:migrate` from the exact release checkout.
2. Treat any lock wait beyond the deployment budget as another active/stuck deploy;
   investigate it instead of bypassing the lock.
3. Re-read the ledger and compare filename/checksum order with the release.
4. Run the changed-surface assertions and health/readiness smoke. Required CI runs
   the complete `pnpm verify:db` boundary.
5. Resume traffic gradually and watch errors, latency, locks, replication, queue
   depth, storage, and changed-domain invariants.
6. Retain the predeploy backup until the reviewed recovery window closes.

Do not report success from a migration process exit alone. Success includes current
ledger proof, domain invariants, application smoke, and an explicit capability
maturity statement.

## 5. Failure recovery

### SQL or invariant failure before commit

- Stop the rollout and keep incompatible application writers stopped.
- The runner rolls back both the migration SQL and its ledger row. Confirm that the
  failed filename is absent and inspect database logs plus application invariants.
- If the failure is reproducible and the migration has never been applied in a
  protected/shared environment, fix it before merge. Once any protected/shared
  environment has recorded it, never edit it; add a new forward repair migration.
- Rerun only after the root cause and recovery impact are reviewed.

### Checksum mismatch, unknown source, or history gap

- Stop. These are evidence-integrity failures, not warnings.
- Compare the running checkout, release artifact, and ledger with the last known-good
  protected revision.
- Restore the correct source/release or investigate unauthorized/manual database
  changes. Never overwrite a checksum, insert a fake row, or delete ledger history.

### Database damage or committed semantic failure

- Keep traffic stopped and preserve logs/evidence.
- Prefer a reviewed additive roll-forward when data remains trustworthy and older
  application binaries can safely coexist with the expanded schema.
- Restore only from a verified eligible backup when the database is damaged or the
  approved recovery plan requires it. Reapply the exact migration chain, honor
  tombstone/hold suppression, and re-run invariants before promotion.
- Record affected revisions, rows, backup reference, recovery commands, validation,
  data loss window, and incident owner.

## 6. Rollback versus roll-forward

Postgres migrations are not reversed in place. Normal application rollback deploys
the prior application while retaining additive schema. Before that rollback, stop
new writes that the older application cannot understand and drain/cancel incompatible
jobs. Migration-specific rules remain in the owning system docs; for example,
`0020` requires commerce jobs to stop and drain while the expanded job-kind
constraint stays in place.

After `0027`, application rollback retains the expanded columns and primary key.
Stop v2 catalog writes before running an older reader/writer; export any newly written
v2 rows as evidence, and roll forward to the D66-capable application. Never collapse
table identities, drop per-point voltages, or relabel v2 rows as v1 to make an older
binary accept them. Database restore is reserved for the verified-backup damage path,
not ordinary application rollback.
For `0025`, stop new recorder staging, let issued PUT contracts expire, and reconcile
or delete every staged private object under OPS-006. Retain the table and export 1.5
metadata, deploy an application that ignores them safely, and roll forward; never
convert these objects into `telemetry_logs` or mark archive semantics verified as a
rollback shortcut.

After `0021`, an older worker is not application-compatible: it cannot create the
required token/expiry when setting a row to `running`. To roll the application back,
stop enqueueing and all workers, drain or explicitly cancel live attempts with the
D38 version, deploy the prior gateway only if it will not create new staged uploads,
retain the additive columns/constraints, and roll forward to the D38 worker before
queue service resumes. Do not drop lease/upload evidence or mark staged rows complete
as a rollback shortcut.

After `0022`, retain both additive columns and the unique partial index during an
application rollback. Stop policy creation and workers first. An older gateway may
read existing policy rows but must not expose the new authenticated model route, and
an older worker must not materialize new policies. Roll forward to the P7-011 writer;
never repopulate inline model bytes, null authoritative job IDs, or mark an object
complete without exact storage evidence.

After `0023`, retain the expanded constraint during application rollback. First stop
enqueueing `train.offline-bc`, cancel or drain those rows with the D45-capable worker,
and preserve their consent/source/lease history. An older worker may ignore the new
kind but must not be used to rewrite it as `train.policy` or a fixture artifact. Roll
forward before offline queue service resumes; a down migration that rejects retained
offline rows is not safe.

Use roll-forward for a committed schema defect: add a new migration that restores
the intended invariant and preserves evidence. Use backup restore only under the
reviewed recovery plan. A down migration that drops new data, authority history,
tombstones, audit rows, or provenance is not an acceptable convenience rollback.

## 7. Evidence and maturity boundary

QA-004 is closed through protected PR #44 at `e362c54`. Exact implementation-head CI
`29286731035`/security `29286731271` and post-merge CI `29287274236`/security
`29287274293` passed. The inspected clean merge JSON binds source and checkout to
`e362c54` and proves PostgreSQL 16.14/pgvector 0.8.5, 20/20 clean migrations, all 19
populated predecessors, preservation/idempotency, atomic recovery, checksum/gap
refusal, and concurrent apply-once behavior.

This is deterministic isolated-Postgres proof. It does not prove production backup
automation, encrypted provider copies, point-in-time recovery, replica promotion,
capacity, measured RPO/RTO, or a disaster exercise. Those remain `OPS-005` and
`QA-009`, and no release or project-state claim may collapse that distinction.
