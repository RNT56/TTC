# Modal training operations

Owner: compute/platform maintainers
Decision: D46
Task: P7-013
Current maturity: **contract/fixture only** — no credentialed provider run is retained

This is the deploy, operate, recover, and evidence runbook for the burst-GPU
`train.policy` path. It does not authorize production, personal telemetry, recorded-
device input, or field claims. The exact completion gate is
`forge-modal-training-sandbox-evidence/1.0.0`; structural tests and database fixtures
cannot satisfy it.

## 1. Exact deployment boundary

The source-bound contract is emitted with:

```bash
PYTHONPATH=workers python -m forge_workers.modal_evidence contract \
  --source-revision "$(git rev-parse HEAD)"
```

The current contract owns:

| Control | Exact value |
|---|---|
| SDK | `modal==1.5.2` |
| app/function | `forge-workers.train_policy_gpu` |
| Python | 3.12 |
| accelerator | one `L4`; resolved training device must be CUDA |
| capacity | 4 CPU, 16,384 MiB memory, 20,480 MiB ephemeral disk |
| placement | `eu-west`, maximum one container, no warm/buffer containers |
| execution | eight-hour ceiling, zero provider retries, preemptible, single-use container |
| secrets | no function secrets; credentials exist only in the submitting worker |
| network | blocked network and restricted Modal API access |
| input | gateway-owned admitted snapshot plus locally Rust-compiled training bundle |
| artifact | scorecard-gated exact ONNX bytes; gateway object storage is authoritative |

The remote function independently validates the compiled bundle and refuses any
requested device other than CUDA. The SB3 runtime refuses a non-Linux host, CPU-only
PyTorch build, unavailable CUDA device, device-resolution drift, or CPU fallback.
Device evidence includes name, count, compute capability, memory, CUDA runtime, and
cuDNN version.

The other Modal profiles remain planning contracts. P5 photoscan, offline BC, and P9
co-design do not inherit P7-013 maturity from the training function.

## 2. Provider preparation

Create a dedicated non-production Modal environment and service identity. Give it
only the rights required to deploy and invoke this app. Configure an environment
budget and workspace visibility appropriate to the operator; treat budgets as a
backstop, not real-time billing truth. Add stable app/environment tags for cost
attribution and connect queue, input, container, error, wall-time, and GPU metrics to
the approved monitoring sink.

Provider facts rechecked against official documentation on 2026-07-15:

- function configuration supports exact GPU/resource/concurrency/retry/timeout,
  `block_network`, `restrict_modal_access`, and single-use-container controls;
- `FunctionCall` supports persisted-ID lookup and cancellation;
- function inputs and outputs may remain retrievable for up to seven days;
- the documented FunctionCall API exposes no manual input/output deletion method, so
  expiry verification must wait for the provider's maximum seven-day TTL;
- environment/workspace budgets exist, but environment budgets are marked alpha and
  can omit workspace-level charges;
- billing reports can lag and are stated before credits or reservations;
- app tags support attribution; the Datadog integration exposes queue, input,
  container, and GPU metrics.

Primary references:

- <https://modal.com/docs/sdk/py/latest/modal.App>
- <https://modal.com/docs/sdk/py/latest/modal.Image>
- <https://modal.com/docs/sdk/py/latest/modal.FunctionCall>
- <https://modal.com/docs/guide/budgets>
- <https://modal.com/docs/guide/billing>
- <https://modal.com/docs/guide/security>
- <https://modal.com/docs/guide/datadog-integration/>

Do not put user/provider secrets in a function secret, payload, image layer, result,
tag, log, or evidence file. The function needs no outbound provider credential and
has no egress.

## 3. Clean protected deployment

Deploy only from an exact protected revision after required CI/security is green:

```bash
test -z "$(git status --porcelain)"
REVISION="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$REVISION" origin/main
python -m pip install -e "workers[deployment]"
CONTRACT_FILE="$(mktemp -t forge-modal-contract.XXXXXX.json)"
trap 'rm -f "$CONTRACT_FILE"' EXIT
PYTHONPATH=workers python -m forge_workers.modal_evidence contract \
  --source-revision "$REVISION" > "$CONTRACT_FILE"
CONTRACT_HASH="$(python -c 'import json,sys; print(json.load(open(sys.argv[1]))["contractHash"])' "$CONTRACT_FILE")"
export FORGE_MODAL_DEPLOY_SOURCE_REVISION="$REVISION"
PYTHONPATH=workers modal deploy --env sandbox -m forge_workers.modal_app
```

Record the provider-returned environment, deployment/function version, immutable
image ID, deploy time, operator, source revision, and emitted deployment contract
hash (`$CONTRACT_HASH`), then remove the temporary contract file. Do not configure
the gateway until all values are exact and independently reviewed. Any tracked or
untracked checkout change invalidates the deployment source claim.

The submitting worker requires:

```text
MODAL_TOKEN_ID
MODAL_TOKEN_SECRET
FORGE_GPU_BACKEND=modal
FORGE_MODAL_ENVIRONMENT
FORGE_MODAL_FUNCTION_VERSION
FORGE_MODAL_SOURCE_REVISION
FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH
FORGE_MODAL_MAX_ACTIVE_JOBS=1
FORGE_MODAL_DAILY_CREDIT_LIMIT=<reviewed positive integer>
```

The gateway capability remains disabled when tokens or the four deployment-identity
values are incomplete. The worker independently requires exact SDK 1.5.2 and rejects
identity/evidence drift.

## 4. Queue, quota, cost, and cancellation

Migration `0024_modal_job_operations.sql` is deployed with the gateway and worker.
Before any Modal insert, a serializable transaction takes the shared
`forge-modal-job-quota` Postgres advisory lock and checks active jobs plus the current
UTC-day credit total. A newly inserted job is debited exactly once under
`<job-id>:debit`; an idempotent retry neither creates another job nor another debit.
Cancellation releases the active slot and may reverse the owner's product debit, but
it does not erase that launch from the conservative UTC-day provider ceiling. This
prevents repeated launch/cancel cycles from reopening spend authority before lagged
provider billing is known.

When the worker spawns Modal, it persists the FunctionCall ID, attempt, environment,
function version, deployment hash, and submit time in `job_provider_calls` before it
waits. A lost lease at that point cancels the provider call rather than creating
unowned work. The gateway rejects arbitrary Modal training fields, and the worker
projects only reviewed training controls plus the sovereign bundle; owner/model
snapshots and credential-shaped extras do not cross into provider retention. After
the call ID is persisted, any ambiguous provider result enters FunctionCall-ID
recovery and cannot authorize a replacement call.

If the bounded recovery attempts are exhausted while that call is still ambiguous,
the job fails with `provider-recovery-pending` but retains the exact `submitted`
attempt and no provider-completion timestamp. Treat that row as an operator incident:
reattach or terminate the exact call ID before any application-level resubmission.

The owner cancels with:

```http
DELETE /v1/jobs/{jobId}
```

Only a queued or running owner job can transition. The transaction clears the D38
lease, records `cancel_requested_at`, appends a job event, and exactly reverses a
positive Modal debit when no artifact was materialized. The waiting worker polls at
most every five seconds, observes the revoked lease, calls provider cancellation with
container termination, records the provider cancellation, and cannot materialize a
late result. Repeated cancellation is idempotent; cross-owner cancellation is 404.

Reconcile provider billing separately. A product credit refund is not a claim that
Modal charged nothing. Store provider cost in USD only from the cited provider report
and preserve its report ID, lag, tags, credits/reservations basis, and reconciliation
time.

After the cited billing row is final enough for the evidence policy, bind its exact
amount and report reference to both the job and call attempt:

```bash
DATABASE_URL="<operator database URL>" node scripts/modal-reconcile-cost.mjs \
  --call-id "<persisted FunctionCall ID>" \
  --billing-report-id "<bounded provider report reference>" \
  --cost-usd "<non-negative USD decimal>"
```

The serializable command is idempotent for the same call/report/amount, rejects a
conflicting second authority, and appends one `provider-cost-reconciled` job event.
It does not infer cost from product credits or remove the separate lag, tag,
credits/reservations, and report-review evidence required below.

## 5. Retention and deletion

Use only controlled, synthetic, non-personal sandbox input. Recorded-device tapes,
photos, user telemetry, and other personal content are prohibited because the current
provider call lifecycle allows input/output retrieval for up to seven days and no
reviewed immediate erasure guarantee is established.

The successful ONNX artifact is retained in gateway-owned content-addressed object
storage under P7-011/D39. Provider output is transport evidence, not authoritative
artifact storage. The sandbox exercise must delete the test artifact through the
normal lifecycle path and verify that outcome immediately. Record the provider's
automatic-expiry deadline, then verify after the maximum seven-day TTL that the call
input/output is no longer retrievable. Do not fabricate a manual deletion action: the
reviewed FunctionCall API exposes none. Production object orphan inventory/deletion
remains OPS-006.

## 6. SLO and recovery drill

Before starting the run, freeze queue-start and completion targets, alert thresholds,
the on-call owner, seed, task, policy thresholds, source/deployment identity, and spend
cap. Exercise and retain all of the following:

1. successful exact CUDA training with provider call, wall time, scorecard, and ONNX
   digest;
2. active-job or daily-credit quota rejection under concurrency;
3. owner cancellation, provider termination, late-result discard, and exact credit
   reversal;
4. alert delivery for a synthetic queue/SLO breach;
5. a controlled failure followed by FunctionCall-ID recovery without duplicate
   artifact materialization;
6. provider billing/tag reconciliation, including known reporting lag;
7. immediate application-artifact deletion and provider-call automatic-expiry
   verification after the documented maximum seven-day TTL.

Never retry inside Modal. D38 owns retries. When a provider result is ambiguous,
recover by the persisted FunctionCall ID first; starting a new call without resolving
the prior attempt can duplicate cost and output.

## 7. Evidence and closeout

Build the private evidence JSON outside the repository, then validate it:

```bash
PYTHONPATH=workers python -m forge_workers.modal_evidence validate \
  /private/path/p7-013-sandbox.json \
  --source-revision "$(git rev-parse HEAD)"
```

The validator requires clean/protected source, exact deployment/image/function,
real call and CUDA-L4 authority, ONNX and provider-output hashes, spend below budget,
hard-stop proof, cancellation/refund, retention/deletion, billing attribution, SLO
and alert delivery, recovery, and explicit non-claims. Retain only redacted evidence
through the repository's reviewed artifact path. Never commit tokens, raw provider
payloads containing user content, or dashboard exports with unrelated tenant data.

P7-013 remains `[~]` until a clean protected revision passes this credentialed
sandbox run and its PR plus post-merge CI/security and downloaded evidence are
independently checked. Sandbox closure is not live, external-user, device, or field
proof.

## 8. Rollback and incident response

Migration 0024 is additive. Application rollback keeps its columns/table/indexes;
do not down-migrate or delete provider-call history. Before rollback:

1. disable new Modal enqueueing;
2. enumerate queued/running jobs and `submitted`/`cancellation-requested` calls;
3. cancel or reconcile every provider call by its exact ID;
4. confirm no active lease can materialize after rollback;
5. reconcile product credits against provider billing;
6. preserve evidence and incident timestamps, then deploy the prior application.

If a token, payload, or result may have leaked, revoke the service token, stop the
app, preserve the minimum incident evidence, execute provider/application deletion,
and follow `SECURITY.md`, `THREAT-MODEL.md`, and `DATA-LIFECYCLE.md`. If quota or
billing data is delayed, stop new launches; uncertainty is not permission to spend.
