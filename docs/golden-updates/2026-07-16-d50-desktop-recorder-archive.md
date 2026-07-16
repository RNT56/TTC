# Golden artifact update: version the D50 Desktop recorder archive

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D50 promotes the P8-013 Desktop recorder from a manifest-only stub into one persisted
archive format with executable frame, index, replay-finalization, privacy, and
receipt semantics. The generated artifact reference must therefore expose
`desktopRecorderArchive` 1.0.0 as an independently versioned compatibility surface.
No gateway route, event family, worker queue kind, package version, or existing
format meaning changes.

## Source-of-truth change

`packages/desktop/src-tauri/src/main.rs` owns
`forge-recorder-archive/1.0.0`, exact serial input
`forge-telemetry-frame/1.0.0`, and clean-stop
`forge-recorder-receipt/1.0.0`. `compatibility/compatibility.json` registers archive
v1, and `scripts/check-compatibility.mjs` exact-matches the Rust schema token to that
matrix. `pnpm docs:contracts` regenerated the registered artifact catalog and human
reference from the compatibility source.

## Compatibility and user impact

This is the first completed versioned recorder archive; the prior scaffold wrote
only an unversioned manifest and claimed that live capture remained open, so there is
no historical successful archive to migrate or reinterpret. V1 binds exact input
artifact/sequence/time authority, canonical frame JSONL, sparse byte offsets,
replay-v1 finalization, three file hashes, clean-stop receipt meaning, user-owned/
private/no-training/no-auto-arm defaults, capture-consent confirmation that grants
neither sharing nor training reuse, and false device attestation. Changing any of
those meanings requires an archive major. Device-attested or training-admissible
successors also require reviewed external authority and cannot relabel v1.

## Evidence before

Protected parent `63e144c6e9807d8763661619c678bae3422e4840` documented fifteen
compatibility surfaces and a Desktop command that created only
`forge-recorder-manifest.json`. It had no source transport, background capture,
ordered frames, index, completed replay, hashes, success receipt, exclusive archive,
or executable non-attestation/privacy boundary.

## Evidence after

`pnpm docs:contracts`, `pnpm verify:docs-contracts`, and
`pnpm verify:compatibility` pass with 77 routes, two event families, seventeen worker
families, and sixteen compatibility surfaces. Locked Desktop Cargo fmt/Clippy and
eleven Rust tests pass. Real pseudo-terminal proof captures exact versioned frames on
the background thread, retains canonical frames and sparse byte offsets, finalizes a
parseable replay-v1 document, and independently recomputes every receipt hash.
Focused tests reject authority drift, oversized/empty/partial input,
sequence/time drift, concurrent capture, and archive overwrite without emitting a
success receipt. The complete 40-step local gate passes under Python 3.12.13 with
225 workers, 66 gateway tests, 13 Studio tests, sixteen compatibility surfaces,
native/WASM parity, packaging, training/offline/MJX smokes, and patch hygiene.
Protected PR/post-merge gates remain required.

## Reviewer focus

Verify that only a clean explicit stop can emit the completed replay and receipt;
frames/index are flushed and synced first; an archive path is exclusive and never
overwritten; every input is exact, bounded, contiguous, and time-increasing; sparse
offsets reference the canonical frame file; hashes cover the retained bytes; and all
local archive/replay/receipt views keep sharing, training reuse, and device
attestation false. Treat pseudo-terminal capture only as local integration, never as
adapter/device, host-suspend, lab, field, ghost, system-ID, or training evidence.

## Decision and task references

D50 owns the in-shell thread and versioned archive/frame/receipt boundary. R32 tracks
partial/private/synthetic archives becoming false device/training/field evidence.
P8-013 remains `[~]` until the candidate is protected; P8-002/P8-003/P8-004/P8-005,
P8-009/P8-010/P8-014, P7-009, and EXT-004 retain real ingest, device, ghost,
system-ID, training, lab, and field authority.
