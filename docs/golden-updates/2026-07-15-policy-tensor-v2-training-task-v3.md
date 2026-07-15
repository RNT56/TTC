# Golden artifact update: policy tensor v2 and training task v3

## Artifact IDs

- `committed-wasm-facade`
- `api-event-artifact-docs`

## Changed paths

- `packages/studio/src/wasm-pkg/forge_wasm.d.ts`
- `packages/studio/src/wasm-pkg/forge_wasm.js`
- `packages/studio/src/wasm-pkg/forge_wasm_bg.wasm`
- `packages/studio/src/wasm-pkg/forge_wasm_bg.wasm.d.ts`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `generated-runtime`
- `schema`

## Why this is intentional

D42 corrects a coupled learning-contract defect rather than re-pinning output after
a test failure. A memoryless multirotor position policy could not observe linear
velocity, the worker interpreted normalized flight targets as raw torque fractions,
and its conventional Z-up decomposition swapped Forge Y-up pitch/yaw. The current
policy tensor therefore moves to major 2, the Rust training bundle to major 2, and
the worker task to major 3. Exact tensor-v1 observer and ONNX execution remain as an
executable compatibility oracle.

## Source-of-truth change

`crates/forge-sim/src/training.rs` owns bundle/tensor v2 and contract-derived control
authority. `crates/forge-wasm/src/session.rs` owns separate exact v1 and current v2
observer functions. `workers/forge_workers/training/tasks.py` owns task v3's axis,
control, reward, and completion semantics. `compatibility/compatibility.json` records
current/supported versions. `pnpm build:wasm` and `pnpm docs:contracts` regenerated
the registered artifacts; no generated file was hand-edited.

## Compatibility and user impact

New policies use `[1,14]` tensor v2 with three estimator-derived body-frame velocity
scalars and task-v3 normalized flight targets. Tensor v1 `[1,11]` remains supported
through explicit version-selected Rust/WASM and Studio paths and the exact historical
906-byte model. There is no byte rewrite, zero-padding migration, or relabeling:
existing policies keep their declared major; new behavior requires retraining.
Unsupported majors or layout/version substitution still fail closed.

## Evidence before

Protected parent `d43a60b65a4a25d4c142a2b5c295c7f6a2274d3b` emitted only
tensor v1, bundle v1, and task v2. The exact seed-1201 500k-step hover PPO diagnostic
under the corrected physical environment failed honestly at 0.375 baseline and zero
mass/Kv robustness, exposing under-observation/curriculum instability rather than
authorizing a threshold or golden change.

## Evidence after

`pnpm build:wasm` regenerates the facade; `cargo test -p forge-wasm` passes 13 unit
tests plus native/WASM golden comparison; both exact tensor-v1 and tensor-v2 ONNX
fixtures execute in Studio. `pnpm docs:contracts` emits the reviewed version-only
catalog delta. Focused Rust, Python, gateway, and Studio tests pass, including 163
worker tests, 12 Studio runtime tests, version/layout/refusal coverage, exact-seed
passing hover/waypoint diagnostics, and interruption/resume/tamper recovery. The
complete 39-step `pnpm verify` gate passes under Python 3.12, including Rust
fmt/Clippy/workspace tests, 65 gateway tests, generated-contract/golden checks, real
dual-task MuJoCo/SB3/ONNX smoke, controlled MJX parity, and patch hygiene.

## Reviewer focus

Inspect the v2 scalar order and velocity estimator, v1/v2 method separation, Y-up
angular-rate order, hover-trim/action interpretation, task-bound reward/control,
exact v1 fixture digest, current v2 fixture digest, supported-major matrix, generated
WASM exports, and the absence of any silent v1 semantic change.

## Decision and task references

D42 owns the coordinated major changes and legacy-read rule; D43 owns device/energy
evidence semantics; P7-012 owns protected learning-quality proof; P7-014 retains the
rover/legged remainder; R27 and R28 track semantic drift and evidence overclaiming.
