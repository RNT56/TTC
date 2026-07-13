# Compute Workers (Python plane) — implementation doc

**Status:** Deterministic worker plane implemented across all families; native
Anthropic ETL and queued vendor normalization at contract/fixture maturity; live
GPU/provider stacks remain adapter-backed · **Phases:** P3/P4 (ETL), P5
(photoscan), P6 (OCCT full), P7 (training), P11 (commerce) ·
**Home:** `workers/` · **Plan refs:** §5.2, §6, §8.3
(v3.0) · **Decisions:** D13 (refit acceptance), D16 (Python plane unmoved), D27
(fixture-first expansion), D36 (native ETL boundary), D38 (fault-bounded queue)

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
`local`/`modal` jobs with `FOR UPDATE SKIP LOCKED`, records attempts/events, and,
under D38, assigns a per-attempt opaque token and expiry. The persisted timeout is
passed into command/network adapters and is also the result deadline; only the current
unexpired token may schedule a retry, fail,
succeed, or materialize output. Expired attempts can be reclaimed under a new token,
while stale/duplicate/cancelled completions are discarded. Successful artifact jobs are
materialized into the same sidecar tables as synchronous gateway fixture jobs.
Live adapters can be injected as JSON-stdin/stdout commands through
`FORGE_PHOTOSCAN_CMD`, `FORGE_COLMAP_CMD`, `FORGE_SB3_TRAIN_CMD`,
`FORGE_SYSID_FIT_CMD`, `FORGE_CODESIGN_CMD`, `FORGE_MUJOCO_PARITY_CMD`, and
`FORGE_MJX_BENCH_CMD`; commerce providers use `FORGE_VENDOR_REFRESH_CMD` and
`FORGE_PRINT_QUOTE_CMD`. Absent commands keep the deterministic fixture path as CI
truth for fixture-capable families. Queued `commerce.vendor-refresh` is deliberately
different: its handler requires `FORGE_VENDOR_REFRESH_CMD` at execution and fails the
job if it is absent, so a live-intent job cannot silently become inline fixture
truth. `workers/forge_workers/modal_app.py` provides an optional Modal entrypoint
without importing Modal on local/CI runs and now exposes JSON-serializable task
profiles for burst-GPU deployment planning.

SEC-006 bounds every injected command to 4 MiB JSON input, 8 MiB stdout, 256 KiB
stderr, and a configured 1-second to 8-hour timeout. Temporary files replace
unbounded pipes; timeout or overflow kills the process group; nonzero exit and invalid
output return generic errors without reflecting command stdout/stderr. Output must be
a bounded JSON object. Live deployment must additionally run non-root with filesystem,
CPU, memory, process, network, and device isolation; process bounds are not an OS
sandbox.

## 3. Worker families

### 3.1 `workers/etl` — catalog ingestion (P3-004, P4-015..017)
fetch manufacturer pages/datasheets/STEP → Claude extraction against the component
schema with **per-field source citations** (Batch API for bulk; smaller model tiers) →
hand off geometry to OCCT jobs → dedupe (brand, model, rev) → license-ledger entry
(non-optional) → low-confidence rows to the human review queue. **Nothing
auto-publishes.**

Implemented 2026-06-14: deterministic fixture ingest plus injectable source-fetch,
Claude-style extraction, and OCCT geometry adapter protocols. `etl.ingest-component`
can route source-bundle payloads through those adapters, and deployment-owned
commands can provide `FORGE_CLAUDE_EXTRACT_CMD` and `FORGE_OCCT_TESSELLATE_CMD`.
Fixture fetch/extract and envelope geometry fallback run in CI; HTTP and provider
transports fail closed unless deployment supplies a key/executor. HTTP source and
Modal adapters accept only credential-free HTTPS, exact hosts where configured,
public DNS answers, no redirects, explicit content types, 1..120-second timeouts,
and 1 KiB..8 MiB streamed responses. Application DNS validation still requires a
production egress firewall/proxy to close the connection-time rebinding gap.

Contract/fixture implementation 2026-07-13 (D36): after the injected fixture and
`FORGE_CLAUDE_EXTRACT_CMD` paths, the adapter may use deployment
`ANTHROPIC_API_KEY` for a native standard-library Messages API call. The endpoint is
fixed to `api.anthropic.com/v1/messages`; the key exists only in the header; API
version `2023-06-01`, model `claude-haiku-4-5-20251001`, and an 8,192-token ceiling
are pinned. The request is capped at 4 MiB, the response at 2 MiB, and the extracted
tool input at 512 KiB. A forced strict tool emits a provider-compatible
`canonicalRowJson` plus conflicts; local parsing then rejects non-finite, deep,
oversized, malformed, uncited, unlicensed, or structurally incomplete rows before
the sovereign catalog gate. Model/API/source-hash provenance survives into the
worker result. No credentialed sandbox request, provider billing/recovery evidence,
live review persistence, or live OCCT artifact is claimed.

### 3.2 `workers/occt` — B-rep truth (P3 tessellation; P6 DfM/STEP)
STEP I/O, fillets, exact tessellation → meshoptimizer LOD chain (≤ 800/≤ 150 tris);
DfM evaluation per process profile (feeds MFG-* checks); STEP/3MF export jobs with
the **license export filter** applied (D10).

Live 2026-07-13: `occt.tessellate` has a deterministic fixture handler that emits
stable object keys, mesh metadata, DfM report references, oriented 3MF export
references, print-profile metadata, and printed-part BOM rows for quote-link
handoff. D10 is enforced before fixture or external execution: every asset must carry
a compatible ledger record; assembly policy is derived from the most restrictive
asset; attribution binds a versioned license manifest; and restricted assets become
dimensioned envelopes with datum ports and BOM link-outs. External commands receive
the manifest/hash and must prove attribution embedding or restricted-geometry
exclusion; provider output is rebuilt from allowlisted fields. The live OCCT binding
and real generated artifact inspection remain behind the same task boundary for P6
DfM and export proof.

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
through an injected adapter when configured; the Modal profile pins 300 s timeouts,
GPU use, permanent-cache requirements, and the live command env for each photoscan
path.

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
marking ONNX exportable. `FORGE_OFFLINE_RL_CMD` can supply behavior-cloning/offline
RL warmstarts; those outputs are normalized, dataset-gated, and kept non-exportable
until a fine-tune scorecard passes. `FORGE_SYSID_FIT_CMD` can supply live system-ID
results in the same artifact contract; external fits must include enough samples, an
accepted fit, and a non-empty sim patch before the worker marks them accepted.
`FORGE_MJX_BENCH_CMD` can supply P7-010 benchmark rows; the normalized report
requires D12 quad, D12 rover, and legged coverage, then adopts MJX only when CPU
MuJoCo/SB3 needs help, parity stays inside frozen bands, and cost-normalized
throughput is at least 3x.
The optional Modal app profiles `train.policy` for SB3/MuJoCo/ONNX dependencies and
`codesign.evaluate` for MuJoCo/Optuna plus the live co-design/parity/MJX command
hooks; deployments still need real images, credentials, and benchmark evidence
before claiming live GPU SLOs.

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

### 3.7 `workers/commerce` — provider handoffs (P11)
`refresh_vendor_offers` normalizes provider rows into priced, provenanced,
rate-limited offers and holds malformed rows instead of persisting partial purchase
truth. `request_print_quote` requires DfM-passing 3MF/profile artifacts before it
normalizes print-service quote links, and every offer carries off-platform checkout
terms. The gateway tables/routes own enqueue authority and synchronous sandbox
links; the worker owns the only provider-command shape normalization path.

`commerce.vendor-refresh` is registered with the queue runner. It bounds execution
to 120 seconds and output to 50 offers; accepts only bounded component/vendor/SKU,
finite nonnegative price, three-letter currency, normalized availability, public
credential-free HTTPS offer/provenance links, bounded rate limits, and sanitized held
rows. `PostgresQueueStore` repeats these checks, bounds top-level provenance, and
inserts all accepted rows in the same transaction that marks the job successful.
If revalidation fails, that transaction rolls back, the queue runner records a
bounded failed-job error in a separate transition, and polling continues with no
offer inserts. An empty accepted set may succeed with held diagnostics; it is never a
purchasable-BOM claim.

## 4. GPU burst policy

Burst-only (Modal by default): no idle GPU. Job cost is metered to credits (D3) at
transparent cost-plus. Permanent caching is the cost ceiling: cache key =
content hash of inputs (photos / contract+lockfile+task+seed). The fixture adapter is
the default; live Modal jobs require deployment configuration and are optional smoke
tests, not CI prerequisites. Modal runtime profiles are test-covered in CI, but
performance and provider billing are proved only by explicit live suites.

## 5. Dependencies

Postgres (queue + rows), object storage, published contract JSON Schema, Anthropic
API (ETL), Modal client configuration for live GPU runs, the MJCF compiler output
from `forge-sim`.

## 6. Testing

Golden-fixture jobs per family in CI (small datasheet → expected row; tiny mesh →
refit verdict; micro-task → learning-signal smoke); idempotency tests (run twice,
one result); poison-payload handling; cache-hit tests. SEC-006 negative tests cover
private/reserved/host-drift URLs, redirects, content and response ceilings, bounded
JSON depth/non-finite values, command-secret non-reflection, and output-overflow
process termination. Native ETL tests additionally assert exact endpoint/version/
model/tool choice, command precedence, secret-free JSON, delimiter containment,
strict-schema compatibility, local row validation, extraction provenance, missing or
duplicate tool rejection, captured-source-only provenance URLs, redirect/private-DNS
failure, and reflected-error redaction. See
[`../THREAT-MODEL.md`](../THREAT-MODEL.md).

Commerce persistence additionally runs
`python workers/integration/assert_commerce_postgres.py` in the protected Postgres
job. It proves a valid worker result commits job success plus one offer, while a
mixed valid/corrupt result rolls back job success and all offer inserts, then records
the job failed without stopping the runner.

QA-005 adds deterministic worker coverage for owner/request idempotency, bounded
retry, rate-limit hints, provider outage, process timeout, partial-object faults,
cancellation, max-attempt exhaustion, and persisted-timeout authority. Protected
Postgres acceptance in `workers/integration/assert_queue_faults_postgres.py` forces an
attempt lease to expire, reclaims it through a second store, rejects the stale first
result, materializes the winner once, and exercises outage recovery, rate-limit
exhaustion, partial recovery, and cancellation. It writes
`artifacts/e2e/qa005-fault-acceptance.json`; this is isolated deterministic fault
injection, not a production outage drill.

## 7. Phase mapping & backlog

P3/P4: ETL fixture, command, and native Anthropic contract paths exist
(P3-004, P3-010, P4-015..017); credentialed sandbox extraction, real-result
persistence, and live OCCT remain open. P5: fixture photoscan is live; full
TRELLIS/COLMAP remains adapter work. P6: fixture tessellation, DfM
metadata, D10 policy enforcement, and runtime sim helpers are live; full live
OCCT/STEP artifact proof remains open. P7:
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

D34 withdrawal is authoritative over worker completion. Photoscan/training
withdrawal changes matching queued or running jobs to `cancelled`; the Postgres
worker clears the attempt lease and may mark success/failure and materialize output
only while the row is still `running` under the same unexpired token. A late result
from already-started compute is recorded as discarded and cannot overwrite
cancellation or enter artifact tables. This prevents the local
data-plane race but does not claim that an external provider can stop work already
in flight.

## 8. Open questions

Multi-replica queue capacity, heartbeat policy for tasks that legitimately exceed one
attempt deadline, dead-letter/reconciliation operations, and queue SLOs; TRELLIS-class
model pick and hosting at P5 (the field moves fast — pin at implementation); live
SB3/MuJoCo/MJX/OCCT dependency pinning and benchmark evidence; review queue UI
ownership beyond the existing gateway/studio scaffolds.
