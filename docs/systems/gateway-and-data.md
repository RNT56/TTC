# Gateway & Data Plane — implementation doc

**Status:** validation/BOM/review/generation APIs live · **Phases:** P2 (validation service), grows through P11 ·
**Package:** `packages/gateway` + `infra/` *(proposed)* · **Plan refs:** §5, §6
(v3.0) · **Decisions:** D2, D3, D16, D17

## 1. Purpose

A thin, typed Fastify + TypeBox API on Node 22 owning the **validation service** —
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

## 3. API surface *(proposed sketch — finalize per phase)*

| Area | Routes | Phase |
|---|---|---|
| Validation | `POST /v1/validate` (contract → report); `GET /v1/reports/:hash` | P2 |
| Registry: models | CRUD `/v1/models`, admission-gated; `GET /v1/share/:id` (public read-only, D4) | P2/P4 |
| Generation | `POST /v1/generate/context` (brief → approved catalog context + prompt-cache prefix) live; `POST /v1/generate` (brief → deterministic or opt-in Anthropic tool-pass synthesis + validator repair loop + D14 draft fallback) live; `GET /v1/generate/models` (D26 model pins) live; SSE stream of passes/diagnostics/slots proposed; `POST /v1/models/:id/edit` (NL → JSON-Patch) proposed | P4 |
| Catalog | `GET /v1/components` (search/filter/embedding); `GET /v1/components/:id@:rev`; `POST /v1/lockfile/resolve`; upgrade-diff; `POST /v1/bom` live | P3 |
| Review queue | `GET /v1/reviews` (pending/approved/rejected catalog review records); `PATCH /v1/reviews/:id` (approve/reject one pending record) | P4 entry |
| Jobs | `POST /v1/jobs/{photoscan,train,sysid,export-step}`; `GET /v1/jobs/:id` (status/SSE) | P5+ |
| Policies | `GET/POST /v1/policies`, scorecards; export gating | P7 |
| Courses | CRUD + leaderboards + replay verification submit | P10 |
| Platform | accounts, listings, classroom, moderation endpoints | P11 |

Conventions *(proposed)*: versioned prefix `/v1`; SSE for long-running streams
(generation, jobs); presigned S3 URLs for all binary upload/download; idempotency
keys on job creation.

## 4. Data plane

**Postgres 16** (the one stateful service): registries, catalog
(+`component_revisions`), validator reports, provenance, scorecard/lineage, courses/
leaderboards, users; **pgvector** for embeddings; **graphile-worker** for
transactional jobs (job row commits atomically with the domain row that caused it).
**Object storage** (S3-compatible: Hetzner/R2): meshes, photos, policies, telemetry
logs, renders — presigned browser upload, content-addressed keys *(proposed)*.

Migrations: forward-only SQL in `infra/migrations`, run on deploy; schema changes
reviewed like code.

Review queue operations sit on the P3 `review_queue` table. `GET /v1/reviews`
filters by status and export policy; `PATCH /v1/reviews/:id` records approve/reject,
reviewer, audit note, decision payload, reviewed time, and the export policy the
row may flow through. When `FORGE_REVIEW_TOKEN` is set, review routes require
`Authorization: Bearer <token>`; when unset, anonymous-local review mode stays
available for the single-user local slice. The gateway treats the database as
optional for local validator-only use: review routes return 503 when the catalog
database is unavailable, while validation/bake/BOM routes keep working from the
binary and file catalog.

Generation operations consume only approved review rows with non-blocked export
policies. `POST /v1/generate/context` is retrieval-only; `POST /v1/generate` runs
the validator-gated synthesis loop with an injectable adapter and deterministic
fixture-backed default. Callers can opt into live Anthropic synthesis with
`provider: "anthropic"` and a per-request `x-forge-anthropic-key` header or
`anthropicApiKey` body field; deployments may instead provide `ANTHROPIC_API_KEY`
for managed-key environments. The live path uses a forced client tool call whose
schema is the emitted ModelSpec JSON Schema, then feeds each candidate through the
same validator/repair/draft loop. The current non-streaming response returns
attempt history, diagnostics, the admitted/draft contract, and the validator report;
SSE progress events remain proposed for the studio streaming UX.

## 5. Job queue taxonomy *(proposed — names final at first implementation)*

`photoscan.reconstruct` · `occt.tessellate` · `occt.step-export` · `occt.dfm` ·
`etl.ingest-component` · `train.policy` · `train.sysid-fit` · `replay.verify`
(leaderboards — anti-cheat re-verification, D17) · `codesign.evaluate` (tiered;
tier-0 runs in-gateway via the native binary). Python workers poll
graphile-worker; results land transactionally (Postgres) + object storage. Every job
carries `{userId, provenance, idempotencyKey}`.

## 6. Auth & metering (D3)

Auth.js (email + OAuth) — **anonymous-local mode first-class**; identity only gates
server features. BYO Anthropic key: client-held, per-request, never persisted
server-side *(proposed — verify against the vetted integration pattern at P4)*.
Metered credits for keyless generation and all GPU jobs at transparent cost-plus;
studio (view/configure/validate/local-sim) free forever.

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
poison-message handling.

## 10. Open questions

napi-rs hot-path vs binary-spawn (OD-08 — measure at P2-007; binary-spawn is the
default until numbers say otherwise); SSE vs WebSocket for generation streaming (SSE
assumed *(proposed)*); rate limiting strategy for anonymous share views;
object-storage provider pick (Hetzner vs R2 — cost decision at first deploy).
