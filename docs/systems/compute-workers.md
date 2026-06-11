# Compute Workers (Python plane) — implementation doc

**Status:** not started · **Phases:** P3 (ETL), P5 (photoscan), P6 (OCCT full), P7
(training) · **Home:** `workers/` *(proposed)* · **Plan refs:** §5, §6, §8.3, §8.4 ·
**Decisions:** D13 (refit acceptance)

## 1. Purpose

The Python 3.12 plane where the ML/geometry ecosystem's gravity is: TRELLIS, COLMAP,
trimesh, MuJoCo, OCCT bindings, SB3. Queue-driven processes with **no public network
surface** — they consume graphile-worker jobs and write results transactionally to
Postgres + object storage. GPU work bursts to Modal/RunPod and **results are cached
forever** (a photoscan or training artifact is never recomputed for the same inputs).

## 2. Worker framework *(proposed)*

Shared skeleton per worker: poll queue → claim job → validate payload against the
published JSON Schema (the inter-language contract — never hand-mirrored types) →
execute with structured progress events → write artifacts (object storage) + rows
(Postgres) in one transaction → ack. **Idempotent by construction**: jobs are safe to
retry; content-addressed outputs make replays cheap. Pinned dependencies; one
container image per worker family.

## 3. Worker families

### 3.1 `workers/etl` — catalog ingestion (P3-004)
fetch manufacturer pages/datasheets/STEP → Claude extraction against the component
schema with **per-field source citations** (Batch API for bulk; smaller model tiers) →
hand off geometry to OCCT jobs → dedupe (brand, model, rev) → license-ledger entry
(non-optional) → low-confidence rows to the human review queue. **Nothing
auto-publishes.**

### 3.2 `workers/occt` — B-rep truth (P3 tessellation; P6 DfM/STEP)
STEP I/O, fillets, exact tessellation → meshoptimizer LOD chain (≤ 800/≤ 150 tris);
DfM evaluation per process profile (feeds MFG-* checks); STEP/3MF export jobs with
the **license export filter** applied (D10).

### 3.3 `workers/photoscan` — image → 3D (P5)
background removal → TRELLIS-class single-image reconstruction (or COLMAP multi-view
when N is large) → manifold repair → decimation → **primitive refit** with the D13
acceptance metric (≥ 70 % fit coverage, Hausdorff ≤ 1.5 % of bounding diagonal, else
mesh-class) → candidate component for the browser alignment UI. SLO: < 5 min
photo → parametric part on burst GPU; cache permanent. Photos grant processing
rights only (privacy rules in [`security-safety-legal.md`](../security-safety-legal.md) §5).

### 3.4 `workers/training` — RL + system ID (P7/P8)
`train.policy` (MJCF → SB3 PPO/SAC → ONNX + scorecard — details in
[`learning-engine.md`](learning-engine.md)); `train.sysid-fit` (bench pulls/logs/step
responses → fitted Kv/R_int/time-constants/friction → sim-block update proposal);
`replay.verify` (bit-exact server replay for scorecards/leaderboards, D6);
`codesign.evaluate` (tier-2/3 rollouts for P9; MJX batching when the P7-010
benchmark demands).

## 4. GPU burst policy

Burst-only (Modal/RunPod-class): no idle GPU. Job cost is metered to credits (D3) at
transparent cost-plus. Permanent caching is the cost ceiling: cache key =
content hash of inputs (photos / contract+lockfile+task+seed).

## 5. Dependencies

Postgres (queue + rows), object storage, published contract JSON Schema, Anthropic
API (ETL), the MJCF compiler output from `engines/sim`.

## 6. Testing

Golden-fixture jobs per family in CI (small datasheet → expected row; tiny mesh →
refit verdict; micro-task → learning-signal smoke); idempotency tests (run twice,
one result); poison-payload handling; cache-hit tests.

## 7. Phase mapping & backlog

P3: etl + occt tessellation (P3-004, P3-010). P5: photoscan (P5-001..006). P6: DfM +
STEP export (XC-18 integration). P7: training (P7-003+). P8: sysid + replay.verify.
P9: codesign.evaluate.

## 8. Open questions

Queue consumption from Python (graphile-worker tables directly vs a thin Node
dispatcher *(proposed: direct table polling — one less moving part)*); TRELLIS-class
model pick + hosting at P5 (the field moves fast — pin at implementation); review
queue UI ownership (likely gateway + studio admin pane).
