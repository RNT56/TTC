# Golden artifact update: document D51 recorder archive import refusal

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D51 makes the existing Desktop recorder archive 1.0.0 read contract executable. The
generated artifact reference must state that the exact five-file layout, canonical
encoding, replay reconstruction, and import-refusal semantics belong to archive-v1
authority. No version, route, event, worker family, persisted field, or privacy/
device-attestation meaning changes.

## Source-of-truth change

`packages/desktop/src-tauri/src/main.rs` now owns the strict streaming reader for the
existing `forge-recorder-archive/1.0.0` format. D51 records why a passing read means
local self-consistency only. `compatibility/compatibility.json` expands the existing
surface's version rule, and `pnpm docs:contracts` regenerates the registered artifact
catalog and human reference from that source.

## Compatibility and user impact

Archive v1 remains 1.0.0. Compatible readers must reject alternate/missing/extra or
symlinked files, unsupported and non-canonical metadata, malformed or non-canonical
frame/index bytes, aggregate/time/count/duration/offset drift, privacy or device-
authority promotion, and any mismatch among frame/index hashes, reconstructed replay,
retained replay, and receipt. `forge-recorder-inspection/1.0.0` is a bounded read-only
command response, not another persisted archive surface. It supplies no signature,
authenticity, device, field, sharing, training, ghost, system-ID, or lab authority.

## Evidence before

Protected parent `225933aaed9c2051a7829400507e2352cf7dbcb6` documented and produced
archive v1 but exposed no native read command or Studio import verifier. A consumer
could parse the replay independently without an executable requirement to reconcile
the canonical frame/index bytes, reconstructed replay, receipt hashes, or false
authority fields.

## Evidence after

`pnpm docs:contracts`, `pnpm verify:docs-contracts`, and
`pnpm verify:compatibility` regenerate and verify the unchanged sixteen-surface
catalog. Desktop Cargo build and fourteen native tests pass; the added tests prove a
complete pseudo-terminal archive imports and reject frame/hash, sparse-index offset,
device-authority, unsupported-major, extra-entry, symlink, and relative-path
substitution. Studio typecheck, sixteen tests, and production build pass with exact
command arguments plus browser, path, response-version/field/numeric/authority
refusal.
The complete 40-step local gate also passes under Python 3.12.13 with 225 workers,
66 gateway tests, sixteen Studio tests, sixteen compatibility surfaces, native/WASM
parity, packaging, training/offline/MJX smokes, and patch hygiene; the separate
three-engine browser matrix passes. Protected PR/post-merge gates remain required.

## Reviewer focus

Confirm that the reader admits exactly the producer's five canonical v1 files,
streams rather than buffers the tape/replay, verifies every expected index entry and
final offset, reconstructs the exact replay digest, checks all retained hashes, and
cannot turn local self-consistency into authenticity, device/field provenance,
sharing, training, lab, ghost, or system-ID authority. Confirm that the Studio bundle
uploads no frame and fails closed outside Tauri.

## Decision and task references

D51 owns the read-only import-verification boundary. P8-003 remains `[~]` because
real adapter/device capture, host suspend, gateway materialization, and lab/field
sessions are open. D50 and P8-013 remain unchanged and protected.
