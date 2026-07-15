# Golden artifact update: task-v2 training contract catalog

## Artifact IDs

- `api-event-artifact-docs`

## Changed paths

- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `schema`

## Why this is intentional

D41 corrects a semantic defect in the P7 task table: v1 stored conventional Z-up
positions even though ModelSpec, the Rust/WASM observer, Studio, and the policy
tensor use Forge Y-up. New task definitions therefore move to internal training-task
2.0.0 with an explicit frame and canonical hash. The generated artifact catalog adds
only that internal version row; no route, event, queue kind, worker package version,
policy-tensor layout, or public artifact field changes.

## Source-of-truth change

`workers/forge_workers/training/tasks.py` owns `TASK_VERSION = "2.0.0"`, the explicit
frame, canonical hash, and corrected built-in coordinates. The compatibility matrix
records that internal version, and `scripts/check-compatibility.mjs` exact-matches it
to the Python source. `pnpm docs:contracts` regenerated the registered catalog from
the matrix; the catalog was not hand-edited.

## Compatibility and user impact

Training-task 2.0.0 is an internal worker schema under worker package 0.2.0. Stable
task IDs remain unchanged, `p7-v1` policy metadata stays readable through the legacy
single-target consumer, and no old artifact is rewritten. New native/external
policies must exact-match task ID, v2 suite/version, Y-up frame, ordered targets,
definition hash, scorecard lineage, and ONNX header. The independent
`forge-policy-tensor` remains 1.0.0 because its scalar order, shapes, frame, actions,
and rate did not change.

## Evidence before

Protected parent `f95a3809ad431d37bd449dd4a675baa38800be19` documented only
`admittedModelSnapshot` 1.0.0 and `trainingBundle` 1.0.0 as internal worker schemas.
The first 39-step `PATH="$PWD/workers/.venv/bin:$PATH" pnpm verify` attempt passed
workflow pins, all 15 compatibility surfaces, generated-document drift, and migration
policy, then correctly stopped at the golden policy because this registered catalog
change had no append-only review record.

## Evidence after

`pnpm docs:contracts`, `pnpm verify:docs-contracts`, `pnpm verify:compatibility`, and
`pnpm verify:workflows` pass. Python 3.12 passes all 154 worker tests, including real
MuJoCo/SB3/ONNX waypoint execution, same-seed reproduction, exact worker-owned task
refusal, and external-provider authority. Studio passes typecheck and all 11 focused
tests with real ONNX Runtime WASM, legacy playback, ordered estimator-only waypoint
advancement, and substitution refusals. The dual 256-step hover/waypoint CPU smoke
emits two digest-valid task-bound graphs and correctly blocked scorecards. The full
Python-3.12 `PATH="$PWD/workers/.venv/bin:$PATH" pnpm verify` gate passes all 39
required steps, including this golden policy, Rust formatting/Clippy/workspace tests,
fresh and committed native/WASM parity, production Studio build, 65 gateway tests,
Brief-25 25/25, fuzz, packaging, all 154 worker tests, dual-task training smoke,
controlled MJX feasibility, and patch hygiene.

## Reviewer focus

Verify the generated diff adds only `trainingTask: 2.0.0`; inspect D41's explicit
major/frame/hash boundary, corrected Y-up coordinates, retained v1 read behavior,
unchanged policy-tensor 1.0.0, exact worker/external/browser task bindings, and the
absence of any public route, event, or queue-kind change.

## Decision and task references

D41 owns the semantic-major correction; P7-014 owns the real waypoint slice; R27
tracks coordinate/version drift. Compatibility policy 1.0.0 treats the task version
as an internal worker schema until any future external publication promotes it.
