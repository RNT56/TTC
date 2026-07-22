# Golden artifact update: add bounded observability custody

## Artifact IDs

- `observability-custody-contract`
- `golden-policy-registry`
- `api-event-artifact-docs`

## Changed paths

- `infra/observability/observability-custody-policy.v1.json`
- `schema/forge-observability-custody-artifact.schema.json`
- `docs/golden-artifact-registry.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`
- `fixture`

## Why this is intentional

D75 proves finite metric projection and deterministic completion-trace sampling but
deliberately keeps every signal set in process memory. OPS-003 needs a separately
versioned custody contract before storage, query, retention, deletion, or recovery
mechanics can be reviewed without confusing a local file with an installed managed
telemetry backend.

## Source-of-truth change

D76 adds `forge-observability-custody-artifact/1.0.0` and a network-free local
filesystem fixture. It accepts only a validated D75 signal set, requires an operator-
created absolute private root outside the checkout, uses owner-only directories and
files, exclusive temporary writes with fsync and atomic publication, at most 128 live
records, exact UUID lookup, fixed summary/metric/trace query views, SHA-256/length/
schema revalidation before reads, 24-hour fixture retention, bounded deletion
receipts, and non-mutating integrity audit. Product authority is independent.

## Compatibility and user impact

This is a new independent major-1 surface. It does not change event majors 1..3,
delivery-batch major 1, signal-set major 1, Gateway/worker producers, product database
state, user export, or transport. Accepted input versions, storage identity/modes,
count/byte/retention limits, stored/deleted meanings, integrity/query/audit behavior,
authority isolation, and backend nonclaims are major-version semantics.

## Evidence before

Protected parent `61b5233fed0b976fb61b65c281d52946c65b3e0c` contains protected finite
signal projection and reconciled D75 evidence but no persistence, integrity-checked
independent read, exact query, retention sweep, deletion receipt, or custody audit
fixture.

## Evidence after

Focused tests cover policy/schema coherence, private persistence across calls, exact
query views, root/mode/symlink refusal, invalid input, the 128-record ceiling,
tampering/missing/symlink/orphan detection, manual deletion, exact retention expiry,
restart-safe CLI reads, and non-reflecting failures. Compatibility, generated-
document, JSON Schema, and golden-policy checks plus all 48 required repository gates
pass locally. Exact-head PR, protected-main, and post-merge proof remain pending.

## Reviewer focus

Review the independent major-1 boundary; frozen D75/D74/D73 inputs; private root and
file requirements; exclusive bounded writes; exact digest/length/schema bindings;
query allowlist; retention and deletion ordering; corrupt/orphan/incomplete-state
detection without automatic repair; no network/credentials/deduplication; product-
authority independence; and every false external collector, managed custody, owner
export, residency, HA, backup, backend, dashboard, alert, managed/live flag.

## Decision and task references

D76 owns the local custody-artifact format, storage/query/lifecycle fixture, bounds,
audit behavior, compatibility surface, and nonclaims. OPS-003 remains `[~]`; QA-008
governs this reviewed schema/registry update, and R40 tracks telemetry leakage,
correlation/cardinality, custody, sampling, integrity, lifecycle, and false-monitoring
claims.
