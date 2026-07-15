# Golden artifact update: object-backed policy delivery contract

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`
- `docs/contracts/openapi.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

P7-011 adds the authenticated owner-scoped retained-policy byte route and changes the
internal policy artifact guidance from durable inline model bytes to D39's byte-free
object-backed delivery envelope. The generated API and artifact references must
describe that runtime route and compatibility boundary exactly.

## Source-of-truth change

`packages/gateway/src/server.ts` registers
`GET /v1/policies/:id/model`; `contracts/documentation.json` owns its reviewed auth,
maturity, status, and purpose metadata; and `compatibility/compatibility.json` moves
the additive user-data export from 1.2.0 to 1.3.0. `pnpm docs:contracts` regenerated
the three checked-in projections. They were not hand-edited.

## Compatibility and user impact

The new route is additive within the documented pre-1.0 gateway 0.2 line and returns
only authenticated owner-scoped bytes after exact metadata and stored-byte
verification. User-data export 1.3.0 is an additive major-1 change: policy rows gain
`jobId` and byte-free `policyMetadata`; retained ONNX bytes remain a separate
authenticated download and never enter the JSON export. Policy-tensor 1.0.0 does not
change.

## Evidence before

Protected parent `038c37566cd430198f86e1ec065889f25ef6903a` documented 75 runtime
routes and described policy bytes only through the earlier artifact envelope. The
first full-gate attempt on this branch reached `pnpm verify:goldens` and correctly
refused these three registered generated changes because this append-only review
record did not yet exist.

## Evidence after

`pnpm docs:contracts` and `pnpm verify:docs-contracts` report 76 runtime routes, two
event families, and sixteen worker families. `pnpm verify:compatibility` reports all
15 surfaces at policy 1.0.0. Focused evidence passes 65/65 gateway tests, 9/9 Studio
tests plus its production build, and 151/151 Python 3.12 worker tests under the exact
declared training/MuJoCo/MJX stack. With this record admitted, all 39 required local
gates pass, including native/fresh-WASM parity, packaging, real training/engine/MJX
smokes, and patch hygiene.

## Reviewer focus

Verify the route is authenticated, cross-owner IDs are hidden, scorecard and every
job/model/tensor/lineage/object binding fail closed, response length/digest are exact,
the generated schema is additive, user-data export remains byte-free, and no worker
or object-store credential/public surface was introduced.

## Decision and task references

P7-011 owns this change under D38, D39, R24, R26, and compatibility policy 1.0.0.
