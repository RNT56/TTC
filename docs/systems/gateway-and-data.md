# Gateway & Data Plane — implementation doc

**Status:** validation/BOM/review/generation/auth/model/share/job/platform and local user-data/consent lifecycle APIs live · **Phases:** P2 (validation service), grows through P12 ·
**Package:** `packages/gateway` + `infra/` · **Plan refs:** §5, §6
(v3.0) · **Decisions:** D2, D3, D16, D17, D27, D28, D30, D33, D34, D38, D39, D46

## 1. Purpose

A thin, typed Fastify + TypeBox API on Node 24 owning the **validation service** —
which is now mostly process management: the gateway **spawns the `forge-validate`
binary** (process isolation + guaranteed bit-equality with CI, D17) — plus the
registries (models, components, courses, skills), the generation and co-design
orchestrators, auth, and job dispatch. It is also the **open-core boundary (D2)**:
the core crates and `forge-validate` are Apache-2.0; the gateway's services and data
are proprietary.

## 2. Principles

Schema-validated routes for free (TypeBox; route DTOs codegen'd from the schemars
schema where they carry contracts); the gateway stays thin — heavy work goes to the
queue or the validator binary; compute workers have **no public surface**; one
stateful service (Postgres) + object storage; local-first means most studio use never
touches the gateway at all. napi-rs bindings exist as a hot-path option — measured
against binary-spawn at P2 (OD-08, P2-007) before any adoption.

Every HTTP body and direct job/object/provider entry point is also structurally and
resource bounded. Route schemas express product shape; the SEC-006 guards separately
bound bytes, depth, nodes, keys, strings, time, destinations, and process output.
Neither layer substitutes for the other. The canonical security contract is
[`../THREAT-MODEL.md`](../THREAT-MODEL.md).

## 3. API surface

The exhaustive current surface is generated from the registered Fastify routes and
their TypeBox request schemas:

- [`../API-EVENT-ARTIFACT-REFERENCE.md`](../API-EVENT-ARTIFACT-REFERENCE.md) — human
  route/auth/maturity table plus event and artifact guidance;
- [`../contracts/openapi.v0.2.0.json`](../contracts/openapi.v0.2.0.json) — OpenAPI
  3.1 request contract for all 77 registered routes;
- [`../contracts/events.v0.2.0.json`](../contracts/events.v0.2.0.json) — generation
  SSE and persisted job-event ordering/terminal semantics;
- [`../contracts/artifacts.v0.2.0.json`](../contracts/artifacts.v0.2.0.json) — all
  compatibility domains and the exact 17-kind worker envelope catalog.

`contracts/documentation.json` supplies reviewed purpose, authentication, maturity,
response-status, event, and artifact metadata. `pnpm docs:contracts` combines it with
actual route registrations and the compatibility matrix. `pnpm
verify:docs-contracts` fails on undocumented or removed routes, stale TypeBox output,
event-emission drift, queue-kind drift, missing guides/examples, or changed generated
files.

The `/v1` API and event stream are documented pre-1.0 internal surfaces at 0.2.0.
Successful response objects without their own format marker remain open pre-1.0
shapes; independently versioned reports, exports, ledgers, receipts, lifecycle
records, replays, EnvSpecs, and license manifests retain their own compatibility
domains. Compute workers still have no public HTTP surface.

## 4. Data plane

**Postgres 16** (the one stateful service): registries, catalog
(+`component_revisions`), validator reports, provenance, scorecard/lineage, courses/
leaderboards, users; **pgvector** for embeddings; **graphile-worker** for
transactional jobs (job row commits atomically with the domain row that caused it).
**Object storage** (S3-compatible: MinIO locally; Hetzner/R2 viable later): meshes,
photos, policies, telemetry logs, renders. Authenticated `/v1/blobs` registration
creates owner-scoped `object_blobs` rows and returns AWS-compatible presigned
upload/download contracts. Content-hash rows are idempotent per owner.
Client registration requires declared length, MIME type, and SHA-256, caps objects at
2 GiB, validates purpose/MIME and bounded metadata, rejects archive MIME/name classes,
and never extracts user uploads. New client rows are `staged`; an exact retry may
reuse a cache key only for the same owner and unchanged declaration.
Presigned upload contracts carry declared length/type and cryptographically bind the
declared checksum. Completion HEADs the
stored object with checksum mode enabled and atomically marks it `complete` only when
the declaration still matches the exact received length/type/checksum. Partial,
changed, or checksum-less objects remain staged; staged objects cannot be downloaded
or used to grant photoscan-processing consent. Presign and delete operations
reject database-supplied buckets outside the configured boundary and validate keys
before network I/O. Downloads are forced as `application/octet-stream` attachments;
URLs expire within one hour and API responses are non-cacheable. Production requires
explicit endpoint/bucket/access/secret configuration and HTTPS unless a reviewed
internal-transport exception is set. Object-store IAM, encryption, prefix isolation,
and actual received-byte policy remain deployment controls.

D53 adds a purpose-built recorder materialization service rather than weakening the
general object route or storing a 512-MiB tape in JSONB. `POST /v1/recorder-archives`
accepts only `forge-recorder-upload-plan/1.0.0` with the exact five names/types/sizes/
hashes and private authority nonclaims, stages five owner-private content-addressed
objects, and returns short-lived checksum-bound PUTs. Completion verifies all five
stored declarations and bounded manifest/receipt identity/hash bindings before
migration 0025 advances `gateway_object_integrity_verified`. It deliberately never
sets `gateway_archive_semantics_verified` and does not create `telemetry_logs`, replay
admission, device/field provenance, sharing, or training authority. User-data export
1.5 and account deletion cover the materialization row and reuse normal authenticated
blob access/deletion for its payloads.
Fixture job outputs currently materialize to `photoscan_artifacts`,
`policy_artifacts`, `telemetry_logs`, `replay_artifacts`, and
`maintenance_records`; `local` and `modal` jobs persist as queued rows for the
Docker Compose worker to claim and materialize. Photoscan result caches and policy
ONNX outputs also upsert owner-scoped `object_blobs` rows and link those rows from
their artifact tables.
P7-011 policy delivery accepts canonical inline ONNX bytes only as transient
producer output. The current D38 lease verifies and uploads the bounded bytes to an
owner-scoped content-addressed key, then one serializable transaction rechecks that
lease, marks the job successful, inserts the complete object declaration, and
creates exactly one job-bound policy with byte-free model revision, scorecard,
tensor, lineage, size, and digest metadata. Authenticated
`GET /v1/policies/:id/model` owner-scopes the row and revalidates every binding plus
the stored bytes before returning a non-cacheable octet stream; Studio hashes it
again. Workers remain private and neither storage credentials nor presigned policy
URLs cross the browser boundary.
`train.offline-bc` is a private queued worker kind, never a fixture compute path.
The request may name only one `telemetryLogId`, admitted `modelId`, supported task,
frozen recipe/algorithm, seed, and timeout. In the same serializable consent boundary,
the gateway requires active `training.reuse`, rechecks ownership, binds the log to the
same model, injects the immutable admitted snapshot and stored tape, and computes the
tape SHA-256. Clients cannot supply a tape, frame set, hash, snapshot, device, domain
randomization, or training override. Migration 0023 adds only the queue enum; no
historical job is reclassified. Consent withdrawal cancels both policy and offline
training jobs through singular or array log references. Workers remain responsible
for exact task/tensor/sample validation and the unchanged scorecard export gate.
This boundary is protected through PR #77/`2c7562d`: exact PR/post-merge CI/security,
the clean plus every-predecessor 23-migration matrix, and artifact `8359446894` prove
the controlled-synthetic path. They do not attest a recorder or device source.
Migration 0024 adds D46 provider-operation fields to `jobs` and an attempt-preserving
`job_provider_calls` table. A Modal `train.policy` insert requires tokens plus exact
environment, function version, source revision, and deployment-contract hash. One
serializable advisory-locked transaction enforces the shared active-job and UTC-day
credit ceilings, inserts the new idempotent job, and then debits it exactly once.
`DELETE /v1/jobs/{jobId}` is owner-scoped and idempotently cancels queued/running
work: it clears the current D38 lease, requests provider termination, appends the job
event, and reverses one positive Modal debit only when no artifact exists. Every
provider call retains attempt, identity, submit/complete/cancel state, and later cost
reconciliation fields; a retry starts a new attempt rather than overwriting history.
These are contract/fixture controls pending protected and credentialed P7-013 proof.
The local-only `commerce.vendor-refresh` kind is command-gated at enqueue and worker
execution. Successful normalized rows materialize to `vendor_offers` in the same
worker transaction as job success; a corrupt accepted row rolls back both state
changes. The route requires idempotency and cannot enqueue fixture/modal providers or
inline provider offers. The generic `/v1/jobs` entry point applies the same provider,
idempotency, component-count, timeout, and allowed-field checks, so it cannot bypass
the dedicated commerce route. Synchronous deterministic links stay source `sandbox`.
All client job idempotency keys are persisted as domain-separated owner digests.
Conflict lookup also requires exact kind, provider, and canonical JSON input: an
exact retry returns the original row, a drifted request returns 409, a fixture retry
does not materialize twice, and one owner's key cannot collide with another owner's
job or credit debit.
Classroom assignments/submissions, moderation reports, and policy-sharing signoffs
are local P11 tables; submissions store the exact validator report and deterministic
grade object used by the production admission gate.

Migrations follow D37 and the complete [`../MIGRATIONS.md`](../MIGRATIONS.md)
runbook: forward-only SQL in `infra/migrations`, serialized by a database advisory
lock, with each migration and `schema_migrations` row committed in one transaction.
The runner refuses missing source, non-contiguous history, and checksum drift. The
pre-1.0 support promise covers every exact checked-in predecessor prefix; required
`pnpm db:assert-migrations` acceptance upgrades realistic populated fixtures from
each prefix, reruns idempotently, injects a failed transaction and corrected
roll-forward, and proves concurrent runners apply once. Back up before deploy, stop
incompatible writers on failure, and never edit recorded history or use a destructive
down migration as application rollback.

Migration `0020_commerce_worker_jobs.sql` additively extends `jobs_kind_check` with
`commerce.vendor-refresh`; it does not rewrite existing rows or touch object storage.
Older workers leave the new kind queued because they do not register it. Application
rollback must first stop enqueueing, then drain or explicitly cancel all queued/
running commerce jobs before deploying an older gateway/worker. Keep the migration
and constraint in place; removing the enum member is safe only after proving no such
row exists, and requires a new forward migration rather than editing 0020.
`pnpm db:assert-commerce-jobs` runs the built gateway against migrated Postgres and
proves that simultaneous/sequential exact retries converge, request drift conflicts,
owner scope holds, and raw client keys never persist; the in-memory route suite is not
used as a substitute for that SQL evidence.

Migration `0021_job_leases_and_upload_verification.sql` adds job availability,
attempt-token/expiry, retry ceiling, timeout, and stable error code fields, plus
object upload state and verification evidence. During the stopped-worker deploy it
returns any legacy tokenless `running` row to `queued`; the new lease-state constraint
then forbids running without both token and expiry, or terminal/queued state with a
live token. Existing pre-D38 object rows remain `complete` for compatibility, while
all new gateway client registrations explicitly write `staged`. Rollback stops new
workers and enqueueing first, then drains/cancels running jobs; retain 0021 and deploy
forward because an older worker cannot satisfy the running-row constraint.

Migration `0022_policy_delivery_authority.sql` adds the nullable historical
`policy_artifacts.job_id` binding, byte-free `policy_metadata`, and a unique partial
job index. It backfills only an unambiguous matching job and strips legacy inline
bytes when copying delivery evidence; it never invents authority for ambiguous
rows. Deploy with policy workers stopped, verify the configured private bucket and
new reader first, then resume writers. Rollback keeps the additive columns and any
content-addressed objects, stops incompatible writers, and rolls forward. The
protected `db:assert-policy-delivery` acceptance proves stale-lease refusal,
one-winner exact materialization, cancellation during upload without database
authority, substitution refusal, byte-free persistence, and exact readback through
PR #68/`9131289` artifact `8340587390`. Keep that assertion required on migration,
queue, object-store, policy, export, or authenticated-read changes.

Review queue operations sit on the P3 `review_queue` table. `GET /v1/reviews`
filters by status and export policy; `PATCH /v1/reviews/:id` records approve/reject,
reviewer, audit note, decision payload, reviewed time, and the export policy the
row may flow through. When `FORGE_REVIEW_TOKEN` is set, review routes require
`Authorization: Bearer <token>`; when unset, anonymous-local review mode stays
available for the single-user local slice. Production routes fail closed when it is
absent; configured production tokens require at least 32 characters and complete
bearer values use constant-shape comparison. Named revocable operator roles remain a
future platform requirement before delegated administration. The gateway treats the database as
optional for local validator-only use: review routes return 503 when the catalog
database is unavailable, while validation/bake/BOM routes keep working from the
binary and file catalog.

Auth is pulled forward for P4/P11: Auth.js core runs under Fastify at `/auth/*`,
using GitHub OAuth and the Auth.js Postgres adapter schema. Local deterministic
tests and automation can opt into header auth with `FORGE_DEV_AUTH=1`; public share
reads never require authentication. Production startup requires an explicit
credential-free HTTPS public origin and a non-development `AUTH_SECRET` of at least
32 characters; GitHub OAuth credentials are an all-or-nothing pair and development
header auth is forbidden. Auth.js receives a gateway-rebuilt URL/Host rather than
caller forwarding headers, its CSRF behavior remains enabled, and unsafe cookie-
authenticated requests require the configured origin.

User-data lifecycle follows D33. `GET /v1/account/export` opens a repeatable-read
transaction and returns format 1.5.0 across every explicit owner-scoped table,
including consent history. It
lists `/v1/blobs/:id/access` for payload downloads and deliberately omits OAuth
access/refresh/ID tokens, session and verification tokens, and provider keys.
Policy rows add authoritative `jobId` and byte-free `policyMetadata`; retained ONNX
bytes stay behind the authenticated policy-model endpoint and are never embedded in
the export JSON. Version 1.4 additionally exports the owner's byte-free D46 provider-
call attempts and job operation fields; provider tokens, raw call payloads/results,
and unrelated billing data remain excluded.
Version 1.5 adds `recorder_archive_materializations`: five owner-scoped blob IDs, the
sanitized upload plan, object-integrity state, and explicit false archive-semantics,
device, field, sharing, and training claims. Archive bytes remain outside JSON and
local filesystem paths plus presigned URLs are never persisted or exported.
`DELETE /v1/account` accepts only `{"confirmation":"DELETE MY ACCOUNT"}`, locks the
user in a serializable transaction, removes user/derived rows explicitly rather than
trusting `SET NULL`, batches S3-compatible object deletes, and commits only after the
bounded storage call succeeds (`FORGE_OBJECT_DELETE_TIMEOUT_MS`, default 15 seconds).
Receipt 2.0.0 proves primary Postgres/object deletion plus lifecycle 1.0.0 user/object
tombstone creation. It does not claim provider-backup deletion. Migrations
`0017_data_lifecycle.sql`, `0018_authority_event_sequences.sql`, and
`0019_authority_sequence_backfill.sql` add six versioned
retention classes, time-bounded append-only holds, monotonic authority ordering,
backup catalog/subject coverage, deletion tombstones, restore tests, and bounded
pseudonymous lifecycle audit. `GET /v1/data-lifecycle/policy` exposes public defaults;
`GET /v1/account/lifecycle` exposes only the owner's hold count and backup exposure.
`deleteExpiredBackups` requires an idempotent physical provider adapter, rejects
backup-reference subject-manifest drift, retains retry state, and reclaims a stale
deletion claim after its bounded lease. Registration rejects a post-deletion capture
and reopens tombstone completion for a valid late-discovered pre-deletion copy;
`evaluateRestoreCandidate` rejects a mismatched/due copy and blocks any subject with
an active tombstone before staging. The Postgres fixture proves this state machine;
real encrypted backup/restore, provider receipts, RPO/RTO, and DR remain `OPS-005`.

Consent follows D34. Migration `0016_user_consent_events.sql` adds an append-only
ledger with current purpose/subject/policy/notice bindings and explicit previous-event
links, plus owner/model provenance for opt-in pattern rows. `POST /v1/consents`
accepts only the current version/hash published by `/v1/consents/policies`; grant and
withdraw use an owner lock and subject ownership check. The same serializable action
transaction rechecks active consent before photoscan processing, per-log telemetry
sharing, model-pattern contribution, leaderboard publication, or telemetry-backed
training. Generic `/v1/jobs` and direct `createJob` calls retain the photoscan/training
guard. Withdrawal cancels matching queued/running jobs, makes the log private, or
removes the pattern/leaderboard rows. It does not delete primary content or prove
provider recall/backups; account deletion and D35 lifecycle authority own those
boundaries. Consent and hold ledgers order same-timestamp events by monotonic
`event_sequence`, not random IDs.

Generation operations consume only approved review rows with non-blocked export
policies. `POST /v1/generate/context` is retrieval-only; `POST /v1/generate` runs
the validator-gated synthesis loop with deterministic multi-archetype templates by
default and an injectable adapter for live providers. Callers can opt into live
Anthropic synthesis with
`provider: "anthropic"` and a per-request `x-forge-anthropic-key` header. The HTTP
surface rejects `anthropicApiKey` in JSON and does not read a deployment
`ANTHROPIC_API_KEY` fallback. The live path uses a forced client tool call whose
schema is the emitted ModelSpec JSON Schema, then feeds each candidate through the
same validator/repair/draft loop. The JSON response returns attempt history,
diagnostics, the admitted/draft/rejected contract, the validator report, and the
`generatedArtifact` audit pointer when persistence is enabled. The stream endpoint
uses `text/event-stream`: one hash-only `start`, ordered `stage` events for intent,
retrieval, synthesis, validation, repair, and admission, then exactly one terminal
`complete` or `error`. The generated event catalog owns the current stage vocabulary
and payload-field contract.

All generation-family entry points first apply the SEC-002 platform-exclusion guard.
Refused briefs never reach retrieval, provider transport, model edit, or course
construction. `generation_refusals` stores only hash/bucket/version/category/rule/
surface/provider/archetype/owner metadata; there is deliberately no raw prompt or
credential column. The write is part of the authority boundary: if it fails, the
request returns unavailable and no downstream action runs. SSE start events expose a
prompt hash rather than content.

Generated-artifact persistence is in Postgres table `generated_artifacts`: prompt,
provider, archetype/categories, seed, stable contract hash, prompt hash, final model
ID, contract JSON, validator report, attempts, approved-catalog context, and D26
model pins. Authenticated generation also creates a user-owned `model_registry` row.
This allowed-generation history is distinct from the minimal refusal ledger; a
prohibited request never creates a generated artifact.
Persistence selects these fields explicitly; the ephemeral provider credential is
not serialized into generated artifacts, usage events, model lineage, responses, or
errors. A regression test inspects all three persistence query parameter sets.

Gateway/native-worker-managed Anthropic and print HTTP traffic is credential-free
HTTPS, exact-host allowlisted where configured, public-address checked,
redirect-free, content-type checked, and bounded by timeout, streamed bytes, and JSON
structure. Vendor refresh no longer has a direct gateway HTTP path. Its deployment-
owned command runs behind bounded JSON/time/process output controls, but that command
owns its network client; production must sandbox it and enforce destinations at the
connection-time egress proxy/firewall. ForgedTTC validates returned vendor links as
credential-free public HTTPS references and never server-fetches them. These controls
do not by themselves prove provider identity, DNS ownership, current terms, or a
credentialed sandbox.

Migration `0015_generation_refusals.sql` is additive and has no backfill or object-
storage impact. Expected storage is one small metadata row per refusal plus timestamp
and owner indexes. Application rollback may stop writing new rows but must retain the
audit table and its evidence; dropping or purging it requires an explicit privacy/
legal retention decision and an export/backup first. A partially interrupted deploy
is recovered by keeping the application stopped, restoring if the database itself is
damaged, and rerunning the unchanged idempotent migration before traffic resumes.

Lifecycle migrations are additive. Application rollback may stop creating new holds,
backups, tombstones, or restore checks, but must retain their tables and continue
restore suppression for any existing tombstone. Never drop the backup catalog or
tombstones while a backup may still exist. Roll forward with the unchanged
checksummed migration; breaking receipt/lifecycle changes require compatibility and
decision records. Run `pnpm lifecycle:ops -- help` for the operator surface and
[`../DATA-LIFECYCLE.md`](../DATA-LIFECYCLE.md) for the full state machine.

## 5. Job queue taxonomy

`etl.ingest-component` · `occt.tessellate` · `photoscan.single` ·
`photoscan.multiview` · `train.policy` · `train.sysid-fit` · `replay.verify`
(leaderboards — anti-cheat re-verification, D17) · `codesign.evaluate` ·
`bridge.config-diff` · `bridge.telemetry-ingest` · `bridge.supervisor-check` ·
`commerce.vendor-refresh` ·
`maintenance.estimate-wear` · `maintenance.crash-forensics` ·
`maintenance.repair-sheet` · `maintenance.fleet-summary`. The local
runner registers handlers for all names; commerce is local-command-only rather than
fixture-backed, and Modal/GPU work sits behind
the exact D46 adapter. Owners cancel queued/running jobs through
`DELETE /v1/jobs/{jobId}`; cross-owner lookups remain 404. Fixture jobs complete
synchronously for deterministic CI; non-fixture
jobs remain queued until claimed by the Python worker. Every job carries
`{userId, provider, payload, idempotencyKey}` plus persisted availability, attempt
count/ceiling, timeout, and the current lease expiry. The opaque lease token is
worker-internal and is never returned by the gateway.

## 6. Auth & metering (D3)

Auth.js + GitHub OAuth are live. BYO Anthropic key is client-held, per-request, and
never persisted server-side. `credit_accounts`, `credit_ledger`, and `usage_events`
are live; template generation records zero-cost authenticated usage and Modal jobs
debit the scaffold ledger only after a new job row exists. Product-credit reversal is
not provider-cost evidence and does not reopen the conservative UTC-day launch
ceiling; billing reports, tags, lag, credits/reservations, and USD
cost are reconciled separately under the Modal runbook. The operator-only
`modal-reconcile-cost.mjs` transaction binds one exact FunctionCall to the same report
ID, USD amount, and reconciliation time in both the job and attempt row, appends one
audit event, replays idempotently, and refuses conflicting authority; it exposes no
public admin route.

## 7. Determinism duties (D17)

Bit-exactness is a property of the system, not a server privilege: replay tapes
verify anywhere the core runs. The gateway still runs `replay.verify` for official
scorecards and leaderboard entries — but as **anti-cheat hygiene** (clients could lie
about results, not produce different ones), not as the only place truth exists.

## 8. Observability & ops

The current deterministic gateway disables Fastify logging. Production structured
allowlist logging, trace/error tooling, secret-seeded log inspection, alerting, and
retention remain `OPS-*`; raw authorization/cookies, bodies, provider output,
presigned URLs, and private content must never be fields. Docker Compose on one
Hetzner-class VM (gateway + Postgres + workers) + CDN for the studio remains a
proposed first deployment; GPU is burst-only. Backups require the D35/OPS-005 catalog,
deletion, restore-suppression, encryption, and recovery evidence rather than generic
snapshot claims.

The local Compose Studio keeps `/v1` and `/auth` same-origin and sets
`FORGE_GATEWAY_PROXY=http://gateway:8080` for Vite's server-side proxy. Do not point
the browser directly at the gateway unless a reviewed CORS/preflight policy is added;
the gateway intentionally exposes neither in the current local contract.

## 9. Testing

Route schema round-trips (TypeBox gives this nearly free); admission-gate integration
tests (invalid contract → 422 with diagnostics; draft semantics); share-URL
anonymous-access test (P4 exit criterion); job idempotency tests; queue
claim/fail-closed tests; poison-message handling. User-data changes additionally run:

```bash
pnpm verify:db
docker compose -f infra/docker-compose.yml up -d minio
pnpm --filter @forge/gateway test:object-storage
```

The first command builds the gateway, creates a complete owner fixture in populated
Postgres, exports it, asserts credential redaction, deletes it, checks zero primary
residue, and then proves all five consent grant/withdraw histories, effects,
append-only enforcement, and deletion residue against real transactions. It then
runs QA-002 through the production Studio bundle, exact validator binary, built WASM,
and headless Chromium against that isolated database. The runner covers all ten
builder-loop surfaces, including authenticated reload of an owner's governed listing
without granting review-queue access. That owner query is bounded by both the shared
public-surface limiter and an official route-scoped Fastify limiter. The runner emits
`artifacts/e2e/qa002-browser-e2e.json`, captures a
screenshot on failure, and refuses an implicit or unmarked database. The object smoke
uploads a unique payload through MinIO, invokes the
production batch-deletion adapter, and requires a 404 afterward.

SEC-006 additionally tests production auth/object/admin failure, origin and header-
only key behavior, secret persistence/reflection, recursive JSON bombs, direct job/
object bounds, private-address and DNS/redirect/content/byte refusal, provider prompt
injection containment, peer-IP/per-class limiter isolation that ignores unverified
cookie/header identities, and safe generic errors. Auth routes additionally use the
official Fastify 5-compatible `@fastify/rate-limit` plugin in their route scope so the
framework and CodeQL can verify the authorization throttle; other classes retain the
bounded classed store. Both are in-memory and single-process; shared atomic account/
IP/provider rate/concurrency/spend quotas
are required before multi-replica or billable-provider operation.

## 10. Open questions

napi-rs hot-path vs binary-spawn (OD-08 resolved in favor of binary spawn); SSE vs
WebSocket for generation streaming (SSE assumed *(proposed)*); distributed rate,
concurrency, and cost quota backend including anonymous shares; named operator RBAC;
connection-time egress enforcement; object quarantine before any future importer;
object-storage provider pick (Hetzner vs R2 — cost decision at first deploy).
