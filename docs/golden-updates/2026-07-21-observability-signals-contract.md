# Golden artifact update: add finite observability signals

## Artifact IDs

- `observability-signals-contract`
- `golden-policy-registry`
- `api-event-artifact-docs`

## Changed paths

- `infra/observability/observability-signals-policy.v1.json`
- `schema/forge-observability-signal-set.schema.json`
- `docs/golden-artifact-registry.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`
- `fixture`

## Why this is intentional

D74 proves bounded authority-independent delivery mechanics but deliberately creates
no metric series or trace-sampling semantics. OPS-003 needs a separately versioned,
reviewable projection before any backend can be chosen without silently accepting
unbounded labels, retaining all traces, or turning the presence of local output into
a monitoring-maturity claim.

## Source-of-truth change

D75 adds `forge-observability-signal-set/1.0.0`. Its executable local projector
accepts only validated delivery-batch 1.0.0/event 3.0.0 input, admits Gateway route/
method pairs and worker tasks only from the generated 82-route/17-task contract,
aggregates five fixed counter/histogram families with fixed units, labels, and
buckets, and forbids correlation/error/source identities as metric labels. Completion
traces retain every failure and fixed-threshold slow span plus a deterministic 1/64
healthy baseline derived from trace/span identity; worker starts are never trace
spans. Input, output, series, spans, memory, and CLI error reflection are bounded.

## Compatibility and user impact

This is a new independent major-1 surface. It does not change event majors 1..3,
delivery-batch major 1, Gateway/worker producers, database state, user export,
transport, retention, or product authority. Input versions, generated route/task
authority, metric names/kinds/units/labels/buckets, trace selection/correlation,
output bounds, lifecycle, authority isolation, and backend nonclaims are major-version
semantics. Additive operational adoption still requires a separately reviewed
backend/custody deployment.

## Evidence before

Protected parent `0388cf65da3d3bdd84784b6fe1264f3339313e0c` contains protected event and
delivery contracts but no versioned metric output, fixed histograms, generated finite
label authority, deterministic healthy sampling, or executable signals oracle.

## Evidence after

The focused observability suite covers policy/schema coherence, aggregation,
histogram boundaries, generated authority refusal, failure/slow/baseline sampling,
started-event exclusion, hostile batch/event extensions, high-cardinality labels,
unsupported maturity, bounded stdin, and non-reflecting CLI errors. Compatibility,
generated-document, and golden-policy checks pass. The complete 48-gate repository
matrix also passes under Python 3.12.13 with 20 observability tests, 26 compatibility
surfaces, 22 golden families, 39 Studio tests, 85 Gateway tests, all 259 workers, and
the unchanged deterministic recovery batch. Exact PR/protected-main/post-merge
results remain pending and must be recorded in the accompanying changelog and
project-state update before any maturity claim advances.

## Reviewer focus

Review the independent major-1 boundary; frozen D74/D73 inputs; generated route/task
authority; five exact metric definitions; absence of request/job/attempt/trace/
provider/deployment/error/source labels; cumulative bucket math; failure and slow
selection; deterministic 1/64 healthy baseline; completion-only spans; bounded input,
series, spans, output, memory, and stderr; no network or persistence; product-authority
independence; and every false collector/backend/dashboard/alert/managed/live flag.

## Decision and task references

D75 owns the signal-set format, finite metric projection, deterministic trace sampling,
compatibility surface, lifecycle, and nonclaims. OPS-003 remains `[~]`; D74 remains
the protected capability boundary until D75 passes exact PR, protected-main, and post-
merge evidence. QA-008 governs this reviewed schema/registry update, and R40 tracks
telemetry leakage, forged correlation, cardinality, delivery/custody, sampling, and
false-monitoring claims.
