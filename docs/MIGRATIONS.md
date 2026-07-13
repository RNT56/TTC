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

After `0021`, an older worker is not application-compatible: it cannot create the
required token/expiry when setting a row to `running`. To roll the application back,
stop enqueueing and all workers, drain or explicitly cancel live attempts with the
D38 version, deploy the prior gateway only if it will not create new staged uploads,
retain the additive columns/constraints, and roll forward to the D38 worker before
queue service resumes. Do not drop lease/upload evidence or mark staged rows complete
as a rollback shortcut.

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
