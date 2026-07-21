# Golden artifact update: bind trusted jobs and worker attempts

## Artifact IDs

- `observability-policy-and-schema`
- `golden-policy-registry`
- `api-event-artifact-docs`

## Changed paths

- `infra/observability/observability-policy.v2.json`
- `schema/forge-observability-event.v2.schema.json`
- `docs/golden-artifact-registry.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`
- `docs/contracts/openapi.v0.2.0.json`

## Drift classification

- `schema`
- `fixture`

## Why this is intentional

The protected D71 Gateway event cannot correlate asynchronous work. OPS-003 needs
trusted request-to-job continuity and one independently identifiable lifecycle per
D38 claim before any telemetry backend, dashboard, or alert work can be credible.
Adding worker identity and terminal meaning to v1 would silently change the contract
for existing readers, so the extension is an explicit new major.

## Source-of-truth change

D72 introduces `forge-observability-event/2.0.0`, migration 0028, and a database-
owned attempt lifecycle. Gateway-created jobs persist the server request UUID, trace,
and request span parent. Direct/historical jobs receive a new trace root with null
request/parent. Each atomic D38 claim creates one database UUIDv4 attempt ID and span;
the worker emits exact bounded start/completion events while durable rows close on
success, retry, failure, cancellation, or expiry without payload or secret fields.
The v1 policy and schema remain unchanged historical readers.

## Compatibility and user impact

Observability readers now support majors 1 and 2 and current producers emit major 2.
Major-1 readers must reject v2 rather than reinterpret worker/job fields. User export
1.7 additively exposes owner-scoped job correlation and attempt lifecycle metadata;
major-1 export readers may ignore the new fields/dataset. No request input or existing
event is redefined, and no provider/deployment/actor/Desktop, backend, dashboard,
alert, managed, live, or production authority is added.

## Evidence before

Protected parent `694ccc060c2139a5e95728a1d30edeec9dad3dd3` retains only
`forge-observability-event/1.0.0`: one Gateway request-completion producer with null
job/attempt/provider/deployment correlation and no persisted asynchronous continuity.

## Evidence after

Focused validation passes four D72 policy/adversarial tests, 24 compatibility
surfaces, all 85 Gateway tests with the real validator, and all 258 worker tests under
the complete pinned training/MJX/co-design environment. A fresh local Postgres/
pgvector database passes all 28
migrations, every 27 populated predecessor, migration recovery/concurrency, D38
crash/outage/retry/cancellation/success correlation, export/deletion/lifecycle, and
all 12 production-browser flows. `pnpm docs:contracts` regenerates 82 routes, two
event families, and seventeen worker families. The complete `pnpm verify` passes all
48 required local gates, including native/WASM parity, Brief-25 25/25, 39 Studio
tests, packaging, training/offline/MJX, and the unchanged 200/97/two-Pareto/two-held
recovery batch. External telemetry and protected-main evidence remain separate gates.

## Reviewer focus

Review the frozen v1 paths; explicit v2 major; request/parent pairing; database-
generated job/attempt/span authority; atomic claim insertion; all attempt terminal
transitions; 4 KiB exact allowlists; absence of lease/idempotency/payload/result/error/
provider/secret content; finite metric labels; sink-failure isolation; migration
backfill/rollback; export ownership; and every false backend/live maturity flag.

## Decision and task references

D72 owns the major, correlation parentage, attempt lifecycle, and nonclaims. OPS-003
remains `[~]`; D71 remains the protected boundary until D72 passes PR, protected-main,
and post-merge evidence. QA-008 governs this reviewed schema/registry update, and R40
tracks leakage, forgery, cardinality, delivery coupling, and false-monitoring risk.
