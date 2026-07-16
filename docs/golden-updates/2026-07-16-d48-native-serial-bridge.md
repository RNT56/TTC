# Golden artifact update: narrow the D48 native serial bridge

## Artifact IDs

- `api-event-artifact-docs`
- `boundary-adversarial-corpora`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`
- `evals/fuzz/boundaries/hardware-payloads.json`

## Drift classification

- `schema`
- `fixture`

## Why this is intentional

D48 turns the P8-012 Desktop serial seam from a raw caller-authored string into one
versioned, digest-bound hardware artifact. The generated artifact reference must
record the new internal schema and reviewed firmware authority, while the hardware
corpus must replace generic safe-token examples with the smaller accepted
Betaflight failsafe operation and explicit unreviewed-authority/safety-floor
refusals.

## Source-of-truth change

`workers/forge_workers/bridge.py` owns `forge-bridge-config/1.0.0`, the Betaflight
2025.12 authority, D12 `quadx` producer scope, exact `failsafe_delay` range, canonical
line hash, physical confirmation, and no-auto-arm flags. The Rust Desktop consumer
independently validates those meanings before serialport-rs transport.
`compatibility/compatibility.json` registers the internal artifact and firmware
version; `pnpm docs:contracts` regenerated the artifact reference. The minimized
hardware cases pin the accepted operation and representative refused authority.

## Compatibility and user impact

This is a pre-protection internal v1 introduction, not reinterpretation of a
published format. Existing raw config strings never had compatibility authority.
The worker output is now deliberately narrower: ArduPilot, ROS 2, mixer/mode changes,
arbitrary settings, unsafe failsafe delays, and unversioned firmware are refused.
The public route count, event families, queue-kind count, ModelSpec, replay, policy
tensors, and package versions do not change. Future command or firmware expansion
requires a reviewed artifact-major decision and compatibility fixtures.

## Evidence before

Protected parent `f91c339742000906ab7c9fca48cbe1c7e4580ad1` documented a generic
`bridge.config-diff` worker output and a Tauri command that accepted a raw config
string. Its corpus checked newline-safe tokens, but neither producer nor consumer
bound an artifact schema, firmware version, exact command set, ordered-line hash,
OS-enumerated port, or honest application-verification receipt.

## Evidence after

The complete 40-step gate passes under exact Python 3.12 with the cross-language
hash oracle, governed 14-case hardware corpus, 225 worker tests, 66 gateway tests
with the real validator, 15-surface compatibility matrix, generated 77-route/
2-event/17-worker artifact documentation, and every Rust/WASM/schema/golden/fuzz/
training/parity/release/pilot/hygiene gate. The separate Desktop native compile,
locked Cargo fmt/Clippy, and four Rust tests pass. The Rust suite proves exact native
bytes over a real Unix pseudo-terminal and refuses an unenumerated path; the receipt
marks target firmware and application unverified. Protected PR/post-merge checks
remain required before the candidate becomes protected evidence.

## Reviewer focus

Verify that the queue strips only its framework-owned `timeoutS`, the producer then
accepts exactly `firmware`/`mixer`/`rates`, the hash
preimage is the exact ordered line array, and only Betaflight 2025.12, D12 quad,
`failsafe_delay` 2–200, and final `save` are accepted; worker and
Desktop refuse authority independently; the native path requires every lab gate,
physical confirmation, 115200 baud, and an OS-enumerated port; pseudo-terminal
success is described as bytes transmitted only; and target handshake/readback,
real FC, HITL, lab, tethered, and field claims remain open.

## Decision and task references

D48 owns the versioned serial artifact and honest receipt. R31 tracks transport
success becoming a false compatibility/application/safety claim. P8-012 closes only
at deterministic/native transport integration maturity; P8-001, P8-009, P8-014, and
EXT-004 retain browser, device, lab, tethered, and field authority.
