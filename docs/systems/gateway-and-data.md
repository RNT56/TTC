# Gateway & Data Plane — implementation doc

**Status:** validation/BOM/review/generation/auth/model/share/job/platform APIs live · **Phases:** P2 (validation service), grows through P12 ·
**Package:** `packages/gateway` + `infra/` · **Plan refs:** §5, §6
(v3.0) · **Decisions:** D2, D3, D16, D17, D27, D28, D30

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

## 3. API surface

| Area | Routes | Phase |
|---|---|---|
| Validation | `POST /v1/validate` (contract → report); `POST /v1/bake`; `POST /v1/bom`; `GET /v1/schema` | P2/P3 |
| Auth/account | `/auth/*` (Auth.js GitHub OAuth); `GET /v1/me`; `GET /v1/credits` | P4/P11 |
| Registry: models | `GET/POST /v1/models`; `GET /v1/models/:id`; `POST /v1/models/:id/edit`; `POST /v1/models/:id/share`; `GET /v1/share/:shareId` (public read-only, D4) | P4 |
| Generation | `POST /v1/generate/context`; `POST /v1/generate`; `POST /v1/generate/stream` (staged SSE); `GET /v1/generate/models` (D26 model pins) | P4 |
| Catalog | `GET /v1/components` (search/filter/embedding); `GET /v1/components/:id@:rev`; `POST /v1/lockfile/resolve`; upgrade-diff; `POST /v1/bom` live | P3 |
| Review queue | `GET /v1/reviews` (pending/approved/rejected catalog review records); `PATCH /v1/reviews/:id` (approve/reject one pending record) | P4 entry |
| Object blobs | `POST /v1/blobs`; `GET /v1/blobs/:id`; `POST /v1/blobs/:id/access` for owner-scoped S3/MinIO presigned upload/download | P5+ |
| Jobs | `GET/POST /v1/jobs`; `GET /v1/jobs/:id`; `GET /v1/jobs/:id/events`; task kinds `etl.ingest-component`, `occt.tessellate`, `photoscan.single`, `photoscan.multiview`, `train.policy`, `train.sysid-fit`, `replay.verify`, `codesign.evaluate`, `bridge.*`, `maintenance.*`; fixture outputs materialize sidecar rows where tables exist | P5+ |
| Policies/replays/photoscan | `POST /v1/photoscan`; `GET /v1/photoscan/artifacts`; `PATCH /v1/photoscan/artifacts/:id/alignment`; `POST /v1/policies`; `GET /v1/policies`; `GET/POST /v1/replays`; `GET /v1/telemetry/logs` | P5/P7/P8 |
| Courses/leaderboards/classroom | `GET/POST /v1/courses`; `GET /v1/courses/:id`; `POST /v1/courses/generate`; `GET/POST /v1/leaderboards` with course/archetype/class slices; `GET/POST /v1/classroom/assignments`; `GET/POST /v1/classroom/assignments/:id/submissions` | P10/P11 |
| Platform | `GET/POST/PATCH /v1/listings`; `GET/POST/PATCH /v1/moderation/reports`; `GET/POST /v1/maintenance/records`; `GET /v1/evals/brief25/latest` | P11/P12 |

Conventions *(proposed)*: versioned prefix `/v1`; SSE for long-running streams
(generation, jobs); presigned S3 URLs for all binary upload/download; idempotency
keys on job creation.

## 4. Data plane

**Postgres 16** (the one stateful service): registries, catalog
(+`component_revisions`), validator reports, provenance, scorecard/lineage, courses/
leaderboards, users; **pgvector** for embeddings; **graphile-worker** for
transactional jobs (job row commits atomically with the domain row that caused it).
**Object storage** (S3-compatible: MinIO locally; Hetzner/R2 viable later): meshes,
photos, policies, telemetry logs, renders. Authenticated `/v1/blobs` registration
creates owner-scoped `object_blobs` rows and returns AWS-compatible presigned
upload/download contracts. Content-hash rows are idempotent per owner.
Fixture job outputs currently materialize to `photoscan_artifacts`,
`policy_artifacts`, `telemetry_logs`, `replay_artifacts`, and
`maintenance_records`; `local` and `modal` jobs persist as queued rows for the
Docker Compose worker to claim and materialize. Photoscan result caches and policy
ONNX outputs also upsert owner-scoped `object_blobs` rows and link those rows from
their artifact tables.
Classroom assignments/submissions, moderation reports, and policy-sharing signoffs
are local P11 tables; submissions store the exact validator report and deterministic
grade object used by the production admission gate.

Migrations: forward-only SQL in `infra/migrations`, run on deploy; schema changes
reviewed like code. A new change must be exercised on a clean database and a populated
supported predecessor, then rerun to prove checksum/idempotency behavior. Back up
before deploy, stop the application if a migration fails, inspect
`schema_migrations`, and roll forward with corrected additive SQL; never edit an
already-recorded migration checksum.

Review queue operations sit on the P3 `review_queue` table. `GET /v1/reviews`
filters by status and export policy; `PATCH /v1/reviews/:id` records approve/reject,
reviewer, audit note, decision payload, reviewed time, and the export policy the
row may flow through. When `FORGE_REVIEW_TOKEN` is set, review routes require
`Authorization: Bearer <token>`; when unset, anonymous-local review mode stays
available for the single-user local slice. The gateway treats the database as
optional for local validator-only use: review routes return 503 when the catalog
database is unavailable, while validation/bake/BOM routes keep working from the
binary and file catalog.

Auth is pulled forward for P4/P11: Auth.js core runs under Fastify at `/auth/*`,
using GitHub OAuth and the Auth.js Postgres adapter schema. Local deterministic
tests and automation can opt into header auth with `FORGE_DEV_AUTH=1`; public share
reads never require authentication.

Generation operations consume only approved review rows with non-blocked export
policies. `POST /v1/generate/context` is retrieval-only; `POST /v1/generate` runs
the validator-gated synthesis loop with deterministic multi-archetype templates by
default and an injectable adapter for live providers. Callers can opt into live
Anthropic synthesis with
`provider: "anthropic"` and a per-request `x-forge-anthropic-key` header or
`anthropicApiKey` body field; deployments may instead provide `ANTHROPIC_API_KEY`
for managed-key environments. The live path uses a forced client tool call whose
schema is the emitted ModelSpec JSON Schema, then feeds each candidate through the
same validator/repair/draft loop. The JSON response returns attempt history,
diagnostics, the admitted/draft/rejected contract, the validator report, and the
`generatedArtifact` audit pointer when persistence is enabled. The stream endpoint
uses `text/event-stream` and emits start plus final complete/error events; per-pass
slot/diagnostic streaming remains proposed for the richer studio UX.

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

Migration `0015_generation_refusals.sql` is additive and has no backfill or object-
storage impact. Expected storage is one small metadata row per refusal plus timestamp
and owner indexes. Application rollback may stop writing new rows but must retain the
audit table and its evidence; dropping or purging it requires an explicit privacy/
legal retention decision and an export/backup first. A partially interrupted deploy
is recovered by keeping the application stopped, restoring if the database itself is
damaged, and rerunning the unchanged idempotent migration before traffic resumes.

## 5. Job queue taxonomy

`etl.ingest-component` · `occt.tessellate` · `photoscan.single` ·
`photoscan.multiview` · `train.policy` · `train.sysid-fit` · `replay.verify`
(leaderboards — anti-cheat re-verification, D17) · `codesign.evaluate` ·
`bridge.config-diff` · `bridge.telemetry-ingest` · `bridge.supervisor-check` ·
`maintenance.estimate-wear` · `maintenance.crash-forensics` ·
`maintenance.repair-sheet` · `maintenance.fleet-summary`. The local
runner registers fixture-backed handlers for all names; Modal/GPU work sits behind
adapters. Fixture jobs complete synchronously for deterministic CI; non-fixture
jobs remain queued until claimed by the Python worker. Every job carries
`{userId, provider, payload, idempotencyKey}`.

## 6. Auth & metering (D3)

Auth.js + GitHub OAuth are live. BYO Anthropic key is client-held, per-request, and
never persisted server-side. `credit_accounts`, `credit_ledger`, and `usage_events`
are live; template generation records zero-cost authenticated usage and Modal jobs
debit the scaffold ledger.

## 7. Determinism duties (D17)

Bit-exactness is a property of the system, not a server privilege: replay tapes
verify anywhere the core runs. The gateway still runs `replay.verify` for official
scorecards and leaderboard entries — but as **anti-cheat hygiene** (clients could lie
about results, not produce different ones), not as the only place truth exists.

## 8. Observability & ops

pino structured logs; Sentry; OpenTelemetry optional. Docker Compose on one
Hetzner-class VM (gateway + Postgres + workers) + CDN for the studio; GPU burst-only.
Backups: Postgres snapshots + object-storage lifecycle rules *(proposed)*.

## 9. Testing

Route schema round-trips (TypeBox gives this nearly free); admission-gate integration
tests (invalid contract → 422 with diagnostics; draft semantics); share-URL
anonymous-access test (P4 exit criterion); job idempotency tests; queue
claim/fail-closed tests; poison-message handling.

## 10. Open questions

napi-rs hot-path vs binary-spawn (OD-08 — measure at P2-007; binary-spawn is the
default until numbers say otherwise); SSE vs WebSocket for generation streaming (SSE
assumed *(proposed)*); rate limiting strategy for anonymous share views;
object-storage provider pick (Hetzner vs R2 — cost decision at first deploy).
