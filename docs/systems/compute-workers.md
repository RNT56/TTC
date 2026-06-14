# Compute Workers (Python plane) — implementation doc

**Status:** Fixture worker plane live for ETL, photoscan, geometry, training, replay, bridge, co-design, and maintenance; live GPU stacks adapter-backed · **Phases:** P3/P4 (ETL), P5 (photoscan), P6 (OCCT full), P7
(training) · **Home:** `workers/` · **Plan refs:** §5.2, §6, §8.3
(v3.0) · **Decisions:** D13 (refit acceptance), D16 (Python plane unmoved)

## 1. Purpose

The Python 3.12 plane where the ML/geometry ecosystem's gravity is: TRELLIS, COLMAP,
trimesh, MuJoCo, OCCT bindings, SB3. Queue-driven processes with **no public network
surface** — they consume graphile-worker jobs and write results transactionally to
Postgres + object storage. GPU work bursts to Modal/RunPod and **results are cached
forever** (a photoscan or training artifact is never recomputed for the same inputs).

## 2. Worker framework

Shared skeleton per worker: poll queue → claim job → validate payload against the
published JSON Schema (the inter-language contract — never hand-mirrored types) →
execute with structured progress events → write artifacts (object storage) + rows
(Postgres) in one transaction → ack. **Idempotent by construction**: jobs are safe to
retry; content-addressed outputs make replays cheap. Pinned dependencies; one
container image per worker family.

Live 2026-06-14: `workers/forge_workers/runner.py` imports and registers the
deterministic handlers used by the Docker Compose worker service. The gateway-owned
job table is the current queue contract for local P4-P12; the runner claims
`local`/`modal` jobs with `FOR UPDATE SKIP LOCKED`, records attempts/events, and
marks outputs or fail-closed errors back onto the row. Successful artifact jobs are
materialized into the same sidecar tables as synchronous gateway fixture jobs.
Live adapters can be injected as JSON-stdin/stdout commands through
`FORGE_PHOTOSCAN_CMD`, `FORGE_COLMAP_CMD`, `FORGE_SB3_TRAIN_CMD`,
`FORGE_SYSID_FIT_CMD`, `FORGE_CODESIGN_CMD`, `FORGE_MUJOCO_PARITY_CMD`, and
`FORGE_MJX_BENCH_CMD`; absent commands keep the deterministic fixture path as CI
truth. `workers/forge_workers/modal_app.py` provides an optional Modal entrypoint
without importing Modal on local/CI runs.

## 3. Worker families

### 3.1 `workers/etl` — catalog ingestion (P3-004, P4-015..017)
fetch manufacturer pages/datasheets/STEP → Claude extraction against the component
schema with **per-field source citations** (Batch API for bulk; smaller model tiers) →
hand off geometry to OCCT jobs → dedupe (brand, model, rev) → license-ledger entry
(non-optional) → low-confidence rows to the human review queue. **Nothing
auto-publishes.**

Live 2026-06-14: deterministic fixture ingest plus injectable source-fetch,
Claude-style extraction, and OCCT geometry adapter protocols. `etl.ingest-component`
can route source-bundle payloads through those adapters, and deployment-owned
commands can provide `FORGE_CLAUDE_EXTRACT_CMD` and `FORGE_OCCT_TESSELLATE_CMD`.
Fixture fetch/extract and envelope geometry fallback run in CI; HTTP and provider
transports fail closed unless deployment supplies a key/executor.

### 3.2 `workers/occt` — B-rep truth (P3 tessellation; P6 DfM/STEP)
STEP I/O, fillets, exact tessellation → meshoptimizer LOD chain (≤ 800/≤ 150 tris);
DfM evaluation per process profile (feeds MFG-* checks); STEP/3MF export jobs with
the **license export filter** applied (D10).

Live 2026-06-14: `occt.tessellate` has a deterministic fixture handler that emits
stable object keys and mesh metadata. The live OCCT binding remains behind the same
task boundary for P6 DfM and export work.

### 3.3 `workers/photoscan` — image → 3D (P5)
background removal → TRELLIS-class single-image reconstruction (or COLMAP multi-view
when N is large) → manifold repair → decimation → **primitive refit** with the D13
acceptance metric (≥ 70 % fit coverage, Hausdorff ≤ 1.5 % of bounding diagonal, else
mesh-class) → candidate component for the browser alignment UI. SLO: < 5 min
photo → parametric part on burst GPU; cache permanent. Photos grant processing
rights only (privacy rules in [`security-safety-legal.md`](../security-safety-legal.md) §5).

Live 2026-06-14: `photoscan.single` and `photoscan.multiview` handlers produce
stable cache keys, stage records for background removal, reconstruction,
manifold-repair, decimation, and primitive refit, D13 fit coverage/Hausdorff
metrics, COLMAP-style view graph metadata for multiview bursts, candidate component
summaries, owner-review flags, and alignment hints. Materialized scan artifacts can
now receive owner alignment patches for known scale, principal axis, and structured
ports through the gateway/Studio editor path.
Fixture CPU mode is the CI default. `FORGE_PHOTOSCAN_CMD` and `FORGE_COLMAP_CMD`
can replace fixture reconstruction with a live external stack while preserving the
same output shape. Command results are normalized back into permanent cache
metadata, D13 acceptance/reject reasons, pipeline stages, and SLO evidence; missing
fit/Hausdorff metrics fail closed to mesh-class review. Modal is available only
through an injected adapter when configured.

### 3.4 `workers/training` — RL + system ID (P7/P8)
`train.policy` (MJCF → SB3 PPO/SAC → ONNX + scorecard — details in
[`learning-engine.md`](learning-engine.md)); `train.sysid-fit` (bench pulls/logs/step
responses → fitted Kv/R_int/time-constants/friction → sim-block update proposal);
`replay.verify` (server re-verification of replay tapes for official
scorecards/leaderboards — anti-cheat hygiene under D17);
`codesign.evaluate` (tier-2/3 rollouts for P9; MJX batching when the P7-010
benchmark demands; tier-0 runs in the gateway via the native `forge-validate`
binary, not here).

Live 2026-06-14: fixture handlers exist for `train.policy`, `train.sysid-fit`,
`replay.verify`, and `codesign.evaluate`. They emit deterministic ONNX/scorecard,
system-ID, replay verdict, and Pareto candidate metadata so the gateway and studio
can exercise the product surfaces without SB3/MuJoCo/GPU dependencies in CI.
`train.policy` now also emits task metadata, domain-randomization settings, and an
ONNX I/O header; `train.sysid-fit` estimates internal resistance and emits a
contract patch proposal. `FORGE_SB3_TRAIN_CMD` can supply live SB3 results, but the
worker re-runs every external policy through the scorecard/export gate before
marking ONNX exportable. `FORGE_SYSID_FIT_CMD` can supply live system-ID results in
the same artifact contract.

### 3.5 `workers/bridge` — config, recorder, supervisor (P8)
`bridge.config-diff` compiles deployment config diffs with physical-confirmation
metadata; `bridge.telemetry-ingest` turns captured samples into sorted replay tapes;
`bridge.supervisor-check` applies geofence, attitude/rate, battery, and kill-switch
checks with explicit 50 Hz advisory / 200 Hz supervisor rates. Live hardware write
and capture are D30 lab-gated: accepted `d28.hardware` signoff, lab-mode env, local
provider, D12 rig ID, physical confirmation, and lab adapter are all required.

### 3.6 `workers/maintenance` — lifecycle twin (P12)
`maintenance.estimate-wear`, `maintenance.crash-forensics`,
`maintenance.repair-sheet`, and `maintenance.fleet-summary` compute motor hours,
pack cycles, R_int estimates, crash windows, repair steps, reorder SKUs, and fleet
service summaries from deterministic telemetry/build payloads. Vendor and print
quote links are attached by the platform commerce APIs rather than direct carts.

## 4. GPU burst policy

Burst-only (Modal by default): no idle GPU. Job cost is metered to credits (D3) at
transparent cost-plus. Permanent caching is the cost ceiling: cache key =
content hash of inputs (photos / contract+lockfile+task+seed). The fixture adapter is
the default; live Modal jobs require deployment configuration and are optional smoke
tests, not CI prerequisites.

## 5. Dependencies

Postgres (queue + rows), object storage, published contract JSON Schema, Anthropic
API (ETL), Modal client configuration for live GPU runs, the MJCF compiler output
from `forge-sim`.

## 6. Testing

Golden-fixture jobs per family in CI (small datasheet → expected row; tiny mesh →
refit verdict; micro-task → learning-signal smoke); idempotency tests (run twice,
one result); poison-payload handling; cache-hit tests.

## 7. Phase mapping & backlog

P3/P4: etl + adapter seams (P3-004, P3-010, P4-015..017). P5: fixture photoscan is
live; full TRELLIS/COLMAP remains adapter work. P6: fixture tessellation, DfM
metadata, and runtime sim helpers are live; full OCCT/STEP export remains open. P7:
versioned task definitions, fixture training scorecards, ONNX headers, and
`train.offline-bc` telemetry dataset ingestion are live; SB3/MuJoCo/offline-RL
training remains open. P8: config-diff, telemetry ingest, supervisor, sysid, and replay.verify
fixtures are live. P9: codesign.evaluate candidate/Pareto fixture is live. P12:
wear/crash/repair/fleet workers are live. Gateway fixture job creation materializes
matching outputs into `photoscan_artifacts`, `policy_artifacts`, `telemetry_logs`,
`replay_artifacts`, and `maintenance_records`; non-fixture jobs enter the same
Postgres queue and are executable/materialized by the local Docker Compose worker.
Photoscan result caches and policy ONNX outputs are linked through `object_blobs`
for durable S3/MinIO storage.

## 8. Open questions

Production lease hardening beyond the local `jobs` table; TRELLIS-class model pick
and hosting at P5 (the field moves fast — pin at implementation); live
SB3/MuJoCo/MJX/OCCT dependency pinning and benchmark evidence; review queue UI
ownership beyond the existing gateway/studio scaffolds.
