# Golden artifact update: register D56 recorder custody contracts

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D56 additively registers the separate recorder-custody compatibility surface and
its trust-bundle, authorization, and proof 1.0.0 formats. The generated catalog must
make this bounded acceptance-authority/start-stop-continuity proof discoverable while
preserving archive v1, D53, D54, and every device/recorded-device/field/sharing/
training nonclaim.

## Source-of-truth change

`compatibility/compatibility.json` owns the nineteenth format domain.
`packages/desktop/src-tauri/src/main.rs` and
`packages/studio/src/desktopRecorder.ts` own the three exact source constants, and
`scripts/check-compatibility.mjs` checks them against the matrix. `pnpm docs:contracts`
regenerates both registered paths from that authority.

## Compatibility and user impact

The change is additive. Older applications may ignore a proof that remains outside
the exact five-file archive. No gateway route, event, worker family, archive-v1 file,
D53 object, D54 row, telemetry reference, consent grant, sharing grant, or training
format changes. A D56 proof means only that a strict acceptance authorization and
self-reported D55 identity continuity bracket one clean receipt; it is not a device
signature or recorded-device/field authority.

## Evidence before

Protected parent `17292ec438f9db1316b679f6922e873cd682c591` generated 81 routes,
two event families, eighteen compatibility surfaces, and seventeen worker families.
It documented D56 as a reserved design without a registered runtime surface.

## Evidence after

`pnpm docs:contracts` still generates 81 routes, two event families, and seventeen
worker families while additively reporting nineteen compatibility surfaces.
`node scripts/check-compatibility.mjs`, Desktop locked fmt/Clippy with 24 tests,
Studio typecheck/build with 30 tests, and the Desktop scaffold checker pass. The
complete 40-step local gate, locked Desktop-native build, and fresh clean/25-
predecessor isolated Postgres plus 11-flow production-browser matrix pass. Protected
PR and post-merge evidence remain required before a protection claim.

## Reviewer focus

Confirm the catalog names exactly the three 1.0.0 schemas, the proof is a separate
surface outside archive v1, and the version rule freezes the hash-pinned public root,
eight-hour maximum, exact revision/evidence/artifact/model/two-port/D55/receipt
bindings, create-new behavior, and permanent nonclaims. Confirm no generated route,
event, worker family, or existing surface changed.

## Decision and task references

D56 owns the separate signed-custody boundary. P8-002 and P8-003 remain `[~]` because
protection, a real trust root, named Kakute H7 V1.5, rotation/revocation, suspend,
EXT-004, and all recorded-device/field/sharing/training authority remain open.
