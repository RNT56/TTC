# Golden artifact update: add bounded observability fixture delivery

## Artifact IDs

- `observability-transport-contract`
- `golden-policy-registry`
- `api-event-artifact-docs`

## Changed paths

- `infra/observability/observability-transport-policy.v1.json`
- `schema/forge-observability-delivery-batch.schema.json`
- `docs/golden-artifact-registry.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`
- `fixture`

## Why this is intentional

D73 proves that Gateway and worker producers emit bounded v3 JSON lines, but it does
not define how an independently operated consumer may batch or attempt delivery. A
first transport contract is needed before a real backend can be selected without
silently coupling telemetry loss to request, job, lease, provider, or materialization
authority.

## Source-of-truth change

D74 adds `forge-observability-delivery-batch/1.0.0`, a strict one-to-thirty-two event
envelope that accepts only frozen event major 3. The executable fixture reader
revalidates each event, buffers only in process memory, sends one credential-free
loopback HTTP POST with a two-second ceiling, refuses redirects and non-2xx responses,
never retries or spools, and exits nonzero after discarding a failed batch. The policy
also names the access, availability, deletion, export, residency, and retention work
that a later managed collector must prove.

## Compatibility and user impact

This is a new independent major-1 surface; it does not change event majors 1, 2, or
3, Gateway responses, database rows, worker leases, provider calls, owner exports, or
retention behavior. A future change to accepted event majors, envelope meaning,
limits, endpoint trust, retries, spool, lifecycle, authority isolation, or custody
claims requires compatibility review and normally a new major. External collectors,
authentication, durable queues, managed custody, metric/trace backends, dashboards,
alerts, managed sandbox, live, and production remain false.

## Evidence before

Protected parent `363a8b4d0fefc551b6cfd1932051902ea0cc5aff` contains only producer
event contracts and stdout sinks. It has no versioned delivery batch, bounded
collector adapter, endpoint trust contract, or executable transport failure oracle.

## Evidence after

The focused observability suite passes eleven D73/D74 policy and adversarial tests,
including exact Gateway/worker v3 admission, 32-event flushing, byte bounds,
seeded-query and extension refusal, loopback-only delivery without credentials,
manual redirect refusal, one-attempt non-2xx behavior, timeout abort, and unchanged
event authority on failure. All 48 required local gates pass under Python 3.12.13
with 25 compatibility surfaces, 21 golden families, generated 82-route/two-event/
seventeen-worker docs, 39 Studio tests, 85 Gateway tests, 259 workers, Brief-25 25/25,
native/WASM parity, packaging, training/MJX, and the unchanged 200/97/two-Pareto/two-
held co-design batch. Exact PR/protected-main/post-merge evidence remains required
before the slice is protected.

## Reviewer focus

Review the independent major-1 boundary; frozen v3 event reference; strict envelope;
4 KiB event, 32-event, 135168-byte batch, and two-second bounds; loopback and port
checks; absence of credentials/query/fragment/redirect/retry/spool; response-body
discard; invalid/overflow refusal; failure disposal; product-authority independence;
and every false managed-custody/backend/live maturity flag.

## Decision and task references

D74 owns the fixture delivery batch, transport/lifecycle boundary, compatibility
surface, and nonclaims. OPS-003 remains `[~]`; D73 remains the protected capability
boundary until D74 passes exact PR, protected-main, and post-merge evidence. QA-008
governs this reviewed schema/registry update, and R40 tracks telemetry leakage,
delivery coupling, unbounded buffering, false custody, and false-monitoring claims.
