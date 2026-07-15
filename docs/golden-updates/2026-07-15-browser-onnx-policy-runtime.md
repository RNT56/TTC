# Golden artifact update: browser ONNX policy runtime

## Artifact IDs

- `api-event-artifact-docs`
- `committed-wasm-facade`

## Changed paths

- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`
- `packages/studio/src/wasm-pkg/forge_wasm.d.ts`
- `packages/studio/src/wasm-pkg/forge_wasm.js`
- `packages/studio/src/wasm-pkg/forge_wasm_bg.wasm`
- `packages/studio/src/wasm-pkg/forge_wasm_bg.wasm.d.ts`

## Drift classification

- `schema`
- `generated-runtime`

## Why this is intentional

P7-008 adds the fifteenth public compatibility surface for executable browser policy
tensors and replaces Studio's procedural training playback with fail-closed ONNX
Runtime Web inference. The generated API and artifact reference must describe the
new tensor contract, while the committed WASM facade must expose observations derived
from Rust-owned simulation and estimator truth.

## Source-of-truth change

The Rust `ForgeSession` facade now owns policy layout and observation exports, and
`compatibility/compatibility.json` plus the contract documentation source own the
independent `forge-policy-tensor` 1.0.0 surface. The checked-in documentation and
WASM package are regenerated projections of those sources.

## Compatibility and user impact

The WASM exports are additive pre-1.0 methods and remove no existing signature. The
policy tensor is a new, independently versioned 1.0.0 contract with no legacy input:
Studio refuses unknown schemas, versions, frames, layouts, rates, shapes, digests,
or non-finite values instead of guessing or adapting them.

## Evidence before

Protected parent `7da3b163a680a352adb3723b83c1a346fee7c999` had 14 compatibility
surfaces, no facade policy-layout or policy-observation methods, and a committed WASM
binary of 2,289,383 bytes raw and 722,106 bytes gzip. The first complete-gate attempt
failed at `pnpm verify:goldens` only because these six intentional registered changes
did not yet have this append-only review record.

## Evidence after

`pnpm build:wasm` regenerated a 2,304,626-byte raw and 727,996-byte gzip facade,
remaining below the 2 MB gzip budget, and the compatibility matrix now has 15
surfaces. Focused evidence passes 6 Studio policy-runtime tests with real ONNX Runtime
Web WASM inference, 64 gateway tests, 130 worker tests, and the relevant
`forge-motion`, `forge-sim`, and `forge-wasm` Rust tests. The full 37-step Python 3.12
gate will be rerun after this record is admitted.

## Reviewer focus

Verify D8 truth isolation, the exact 11-scalar input and four-scalar output layouts,
the `forge-y-up-rh-m` frame, the 1-50 Hz bound, exported WASM signatures, the 2 MB
gzip ceiling, generated documentation drift, and that no existing facade signature
or supported artifact was broken.

## Decision and task references

P7-008 owns this change under D8, D9, D16, D17, and the compatibility policy. It
implements already-decided authority and versioning boundaries, so no new product
decision is required.
