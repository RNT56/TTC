# Golden artifact update: bind provider and deployment correlation

## Artifact IDs

- `observability-policy-and-schema`
- `golden-policy-registry`
- `api-event-artifact-docs`

## Changed paths

- `infra/observability/observability-policy.v3.json`
- `schema/forge-observability-event.v3.schema.json`
- `docs/golden-artifact-registry.json`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`
- `fixture`

## Why this is intentional

D72 can follow a trusted request through a job and each D38 attempt, but it leaves
provider and deployment fields permanently null. D46 already persists the exact
Modal FunctionCall before waiting, and D68 already refuses managed startup unless an
exact active manifest authorizes the component. D73 permits those two existing
authorities to enter correlation without accepting a caller, provider response,
ambient environment name, or arbitrary log field as truth.

## Source-of-truth change

D73 introduces `forge-observability-event/3.0.0`. Managed Gateway and worker events
carry the bounded deployment ID returned by successful verification of the exact
active D68 manifest; local and CI events require null. A worker completion carries a
provider-call ID only for the same Modal `train.policy` job after that ID has been
persisted transactionally under the current lease. Worker-start events and every
other provider/job family require null. Provider and deployment IDs are forbidden
metric labels. The v1 Gateway and v2 job/attempt policies and schemas remain frozen.

## Compatibility and user impact

Observability readers now support majors 1, 2, and 3, and current producers emit
major 3. Readers supporting only majors 1 or 2 must reject v3 rather than reinterpret
the new correlations. D73 requires no migration and changes no response, owner
export, retention, consent, deletion, provider execution, or deployment authority.
A v2 rollback retains the same database and manifest state but omits the new fields.
No other provider/job family, actor/Desktop, backend, dashboard, alert, provider-
delivery, deployment-health, managed, live, or production authority is added.

## Evidence before

Protected parent `a02f42b1dbaa3bc8116b8153c31d8e7ea0816e53` emits event major 2.
Provider and deployment correlation are null even though D46 and D68 independently
own the underlying identifiers.

## Evidence after

Focused local validation passes four D73 policy/adversarial tests, all 24
compatibility surfaces, generated-contract verification for 82 routes/two event
families/seventeen worker families, Gateway typechecking plus six deployment/event
tests, and seven Python deployment/event tests including JSON Schema refusal of
missing, forged, pre-persistence, and wrong-provider bindings. The complete 48-step
repository gate also passes with 85 Gateway tests, all 259 fully enabled worker tests,
Brief-25 25/25, native/WASM parity, and the unchanged 200/97/two-Pareto/two-held
recovery batch. A disposable isolated Postgres/pgvector database passes all 28
migrations, every 27 populated predecessor, the strengthened Modal persistence-to-
claimed-job assertion, all other data-plane invariants, and all 12 production-browser
flows. Exact PR and protected-main evidence remain required before protection.

## Reviewer focus

Review the frozen v1/v2 paths; explicit v3 major; exact D68 bootstrap return as the
only managed deployment source; local/CI null requirement; D46 persistence before
the Modal `train.policy` completion field; start/other-provider/other-job refusal;
4 KiB and exact allowlists; absence of payload/provider/error/secret content;
provider/deployment metric-label refusal; rollback behavior; sink-failure isolation;
and every false backend/live maturity flag.

## Decision and task references

D73 owns the two correlations, v3 compatibility boundary, and nonclaims. OPS-003
remains `[~]`; D72 remains the protected capability boundary until D73 passes exact
PR, protected-main, and post-merge evidence. QA-008 governs this reviewed schema/
registry update, and R40 tracks correlation forgery, leakage, cardinality, delivery
coupling, and false-monitoring risk.
