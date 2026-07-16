# Golden artifact update: register D57 ghost-overlay contract metadata

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D57 additively gives the existing internal `maintenance.crash-forensics` output a
versioned `forge-ghost-overlay/1.0.0` child artifact. The generated catalog note must
name its bounded ten-minute/6,001-point indexed Y-up/SI view, current controlled-
synthetic or unverified maturity, permanent device/recorded-device/field nonclaims,
and the rule that raw recorder frames remain object-backed.

## Source-of-truth change

`contracts/documentation.json` owns the reviewed worker-family note;
`compatibility/compatibility.json` owns the internal ghost-overlay version, frame,
and render-point bound. Worker, Gateway, and Studio source constants are checked
against that matrix by `scripts/check-compatibility.mjs`. `pnpm docs:contracts`
regenerates the registered artifact catalog from those sources.

## Compatibility and user impact

The queue kind, top-level `crash-forensics` discriminator, Gateway API/event line,
maintenance schema, replay tape, archive v1, D53, D54, and D56 do not change. Older
workers and Studio builds may ignore the new child artifact while retaining the
parent maintenance row. Point order/units/frame, time/divergence, decimation/index,
bounds, maturity, or provenance-flag changes require a new internal major. The
current version supplies no device, recorded-device, field, sharing, or training
authority and no raw replay bytes.

## Evidence before

Protected parent `9035d0972d1b8a820ece61d1bf40688dd2518e98` generated 81 routes,
two event families, nineteen compatibility surfaces, and seventeen worker families.
Its crash-forensics catalog row named only the top-level fixture discriminator and
the Studio surface displayed summary metadata without indexed geometry.

## Evidence after

`pnpm docs:contracts` still generates 81 routes, two event families, and seventeen
worker families; only the reviewed crash-forensics note changes.
`pnpm verify:compatibility` passes all nineteen surfaces. Focused Python worker tests
pass 33/33, Gateway 74/74, Studio 33/33, and Studio typecheck/build pass. The exact
candidate passes all 40 local repository gates under Python 3.12.13 with 227 worker
tests, a fresh disposable Postgres database from clean plus all 25 populated
predecessors and every assertion, all 12 production-browser flows, and Chromium/
Firefox/WebKit. Exact PR and post-merge gates remain required before protection may
be claimed.

## Reviewer focus

Confirm the generated diff changes only the existing crash-forensics note; the
version/frame/6,001-point bounds match all three consumers; raw recorder frames do
not enter job JSON or maintenance JSONB; the keyless fixture is not described as
real telemetry, device, admitted-twin, full-render-performance, or field evidence;
and no existing route, event, queue kind, or compatibility surface is reinterpreted.

## Decision and task references

D57 owns the compact view and nonclaim boundary. P8-004/P12-002 remain `[~]` because
exact protected evidence, a server-selected owned D54 replay plus exact admitted
twin, named-mid-hardware performance, P8-014, and EXT-008 remain open.
