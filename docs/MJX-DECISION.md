# P7-010 MJX decision runbook

This is the operating and evidence contract for the final MuJoCo/MJX
adoption-or-rejection decision. It does not replace the protected
`mjxBenchmarkRequest` 1.0.0 feasibility row. That row proves the harness on one
CPU-backed hover reference; this runbook owns the separate three-morphology,
accelerator, budget, and cost gate under D47.

## 1. Decision rule and maturity boundary

The centralized report may decide only when all of these are true on one exact clean
protected revision:

1. `d12-quad`, `d12-rover`, and `legged` execute from sovereign Rust-derived MJCF;
2. every row binds the exact contract, compiled MJCF, request, runtime, hardware, and
   benchmark authority;
3. JAX resolves to the requested `gpu` or `tpu` backend and device kind, with float64
   enabled and fallback forbidden;
4. native MuJoCo and MJX start from the same states and controls and remain inside the
   frozen qpos/qvel parity bands;
5. reviewed CPU evidence says whether the morphology's scorecard-passing recipe fits
   the 12-hour overnight envelope and whether 200 tier-2 candidates fit 12 hours;
6. a retained provider rate or bill binds the CPU and accelerator host USD/hour
   basis; and
7. if CPU needs help, MJX provides at least 3x cost-normalized throughput for every
   morphology.

When CPU meets both budgets, complete evidence authorizes **rejection** of MJX. When
CPU misses either budget and every MJX threshold passes, it authorizes **adoption**.
Any missing, substituted, dirty, CPU/Metal-backed, non-finite, parity-failing, or
under-3x row leaves the report blocked. A sandbox verdict is not deployed production,
device, field, or external-user proof.

The quad and rover contracts are explicitly **simulation proxies** bound to the
frozen D12 registry identities. They are not exact physical twins of every pinned
SKU. The legged row uses the controlled `qd-mini` benchmark reference and is not a
D12 rig. D47 prevents either binding from being restated as hardware accuracy.

## 2. Why Apple Metal is not an accepted backend

The protocol requires JAX float64 so parity has one precision and tolerance meaning
across native MuJoCo and MJX. Apple's current Metal plug-in documentation labels the
plug-in experimental, lists `np.float64` as unsupported, and says it does not pass
all JAX tests. The M2 Pro therefore cannot supply authoritative P7-010 accelerator
evidence without weakening the frozen protocol. The decision command accepts only
JAX `gpu` or `tpu` and rejects CPU, Metal, fallback, or the wrong device before
timing. Recheck current primary documentation before changing runtime pins or backend
policy:

- [Apple: Accelerated JAX on Mac](https://developer.apple.com/metal/jax/)
- [MuJoCo: MJX documentation](https://mujoco.readthedocs.io/en/latest/mjx.html)

Third-party Metal backends are not accepted by implication. Adding one requires a
reviewed dependency/security/license change, a new compatibility major if precision
or result meaning changes, and a superseding decision.

## 3. Exact benchmark models

| Decision row | Contract used for simulation | Authority bound in the request | Honest limitation |
|---|---|---|---|
| `d12-quad` | `examples/vx2-mini.forge.json` | `catalog/reference-rigs/ref_quad_kakute-h7-source-one-5in.json` | synthetic multirotor simulation proxy, not an exact SKU-level twin |
| `d12-rover` | `workers/tests/fixtures/rover-training.forge.json` | `catalog/reference-rigs/ref_rover_waveshare-ugv-rover-pt-pi5-ros2.json` | controlled differential-drive simulation proxy, not an exact kit twin |
| `legged` | `examples/qd-mini.forge.json` | the same exact contract file | controlled benchmark reference, not D12/device/field evidence |

Changing a contract, authority path/identity, required morphology, budget envelope,
precision, parity meaning, or adoption threshold requires a new internal major and
the compatibility review in `COMPATIBILITY.md`.

## 4. Required retained inputs

Do not create these inputs from memory or placeholder values. Retain the underlying
raw training/tier-2 artifact and provider rate/receipt outside Git when it contains
private or provider data, then put only the reviewed redacted evidence JSON in the
operator evidence directory.

### CPU budget evidence 1.0.0

The JSON object has these exact top-level fields:

```json
{
  "artifactKind": "p7-mjx-cpu-budget-evidence",
  "schemaVersion": "1.0.0",
  "sourceRevision": "<40-char protected commit>",
  "worktreeClean": true,
  "overnightTargetSeconds": 43200,
  "tier2CandidateCount": 200,
  "tier2TargetSeconds": 43200,
  "measurements": []
}
```

`measurements` must be ordered `d12-quad`, `d12-rover`, `legged`. Each row has
exactly `morphology`, `contractSha256`, `trainingRecipe`,
`cpuHostSku`, `cpuHardwareSha256`, `cpuBenchmarkProtocolSha256`,
`cpuMujocoStepsPerS`, `cpuTrainingWallSeconds`, `cpuTrainingScorecardPassed`,
`cpuTier2WallSeconds`, and `evidenceArtifactSha256`. The CPU host SKU must equal the
cost evidence's CPU host, and the protocol hash must equal the canonical frozen
benchmark protocol. The worker uses this retained CPU-host throughput—not the GPU
host's same-process native parity timing—for economic comparison. Otherwise applying
a cheaper CPU rate to a different machine's timing would fabricate
cost-normalized throughput. The final hash binds the retained raw source artifact;
it is not a self-attested label. A failed scorecard makes the overnight target miss
even when wall time is short. `cpuTier2WallSeconds` measures the complete declared
200-candidate tier-2 workload, not one candidate multiplied without preserving the
batching/scheduler method.

### Cost evidence 1.0.0

The JSON object has these exact top-level fields:

```json
{
  "artifactKind": "p7-mjx-cost-evidence",
  "schemaVersion": "1.0.0",
  "sourceRevision": "<40-char protected commit>",
  "provider": "<provider or controlled lab authority>",
  "currency": "USD",
  "retrievedAt": "<UTC timestamp ending Z>",
  "sourceUrl": "https://<primary rate or billing source>",
  "rateOrReceiptSha256": "<SHA-256 of retained source>",
  "cpuHost": {
    "sku": "<exact CPU comparator>",
    "backend": "cpu",
    "deviceKind": "<declared CPU shape>",
    "usdPerHour": 0.0
  },
  "acceleratorHost": {
    "sku": "<exact accelerated host>",
    "backend": "gpu",
    "deviceKind": "NVIDIA L4",
    "usdPerHour": 0.0
  }
}
```

Replace both `0.0` placeholders with positive current values before use; the
validator rejects zero. The accelerator backend/device must equal the runtime request
and actual JAX device. A catalog price, marketing estimate, or adapter power rating
is not a billing source. Recheck current provider pricing at execution time and keep
the receipt/rate hash.

## 5. Prerequisites and stop conditions

Prerequisites:

- exact protected `main`, no tracked or untracked changes;
- Python 3.12 with `workers[dev,mujoco,training,mjx]` exact pins;
- built `target/debug/forge-validate` from the same revision;
- `JAX_ENABLE_X64=1` and a requested CUDA/ROCm GPU or TPU visible to JAX;
- reviewed budget and cost JSON whose `sourceRevision` is that exact checkout;
- provider/lab authorization and spend ceiling already approved; and
- enough wall time and retained storage for three compile/warmup/measurement rows.

Stop without retrying or editing evidence when:

- source cleanliness or revision differs;
- runtime pins, contract/authority hashes, or request hash differ;
- JAX resolves to CPU/Metal, fallback, or another device kind;
- any compile, state, timing, parity, cost, or budget value is non-finite;
- a model has no actuator or Rust bundle admission fails;
- provider rate/receipt or raw budget evidence cannot be semantically reviewed; or
- the provider/lab budget or safety authority expires.

Never loosen parity, remove a morphology, relabel a proxy, substitute an unreviewed
price, or change the device request to make a run green.

## 6. Execute

From the clean protected checkout:

```bash
corepack pnpm install --frozen-lockfile
cargo build -p forge-validate
python3.12 -m venv /tmp/forge-p7-mjx
source /tmp/forge-p7-mjx/bin/activate
python -m pip install -e "workers[dev,mujoco,training,mjx]"
python -m pip freeze > /private/evidence/p7-mjx-dependencies.txt
JAX_ENABLE_X64=1 FORGE_REQUIRE_CLEAN_EVIDENCE=1 \
  pnpm sim:mjx:decision -- \
  --budget-evidence /private/evidence/p7-mjx-budget.json \
  --cost-evidence /private/evidence/p7-mjx-cost.json \
  --out artifacts/mjx/p7-mjx-decision.json
```

The worker extras pin every direct numerical/training runtime used by the command.
Review and hash the resulting `pip freeze` manifest, run the repository's pinned
`pip-audit` procedure, and retain both beside the result; do not treat an old local
environment as current evidence.

The wrapper constructs `mjxDecisionRequest` 2.0.0 from the three checked-in
contracts and authority files, hashes the canonical request, invokes
`python -m forge_workers.mjx_decision_benchmark`, and writes `mjx-benchmark` 2.0.0.
It never accepts caller-selected contracts or authority paths.

## 7. Review and preserve

Inspect the JSON itself. At minimum verify:

- `sourceRevision`, `requestSha256`, `worktreeClean`, exact runtime pins, and every
  contract/MJCF/authority/evidence hash;
- requested/resolved backend and device kind, with no CPU or Metal row;
- all native and MJX sample durations, medians, JIT compile time, and step counts;
- qpos/qvel absolute errors and `parityPassed` for all three models;
- the CPU scorecard/budget derivation and exact provider cost basis;
- every cost-normalized throughput value and centralized decision reason; and
- `decisionEligible`, `adoptionTriggered`, `adopt`, `blockers`, and `nonClaims`.

Retain the request, result, underlying budget artifacts, rate/bill source, dependency
manifest, command log, and independent SHA-256 list. Redact credentials, account
identifiers, and private billing detail without deleting the SKU/rate/time/hash basis.
Protect the evidence through PR and post-merge CI/security before changing P9 to use
MJX. A decision-eligible local file on an unprotected commit is not the finish line.

## 8. Recovery and rerun policy

Compilation or timing failure produces no partial JSON. Preserve stderr and the
request, fix the actual source/runtime/provider problem on a new revision, and start
a new run with new evidence bindings. Do not splice rows from different source
revisions, runtimes, devices, cost timestamps, or request hashes. A provider
interruption may be retried only as a wholly new request after confirming the prior
work is terminated and cannot continue billing; the P7-013 Modal call/lease rules
remain authoritative when that provider is used.

If a complete report rejects MJX because CPU meets the budgets, retain the rejection
and keep CPU as the P7/P9 default. If it adopts MJX, implementation still requires a
separate reviewed P9 integration change with deterministic CPU fallback as an
explicit product mode—not silent runtime fallback during the benchmark.
