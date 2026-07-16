# API, event, and artifact migration guide

Owner: gateway and compatibility maintainers

Current gateway/event line: **0.2.0**

Compatibility policy: [`COMPATIBILITY.md`](COMPATIBILITY.md)

This guide covers supported client and artifact changes in the documented pre-1.0
line. It does not replace the transactional Postgres procedure in
[`MIGRATIONS.md`](MIGRATIONS.md), and it does not authorize live-provider, hardware,
or production-data migration claims.

## Before any upgrade

1. Freeze the exact client, gateway, validator, worker, and schema versions.
2. Download or generate the current [contract manifest](contracts/manifest.json) and
   retain the old versioned documents beside the new ones.
3. Run `forge-validate version --json` and read the WASM `version()` export. Do not
   infer a persisted-format version from a package version.
4. Inventory stored ModelSpecs, reports, replay tapes, EnvSpecs, exports, consent
   records, deletion receipts, lifecycle records, and worker outputs independently.
5. Test supported-old, current, and unsupported-major fixtures before changing
   writers. Upgrade readers before writers.
6. For persisted Postgres changes, follow `MIGRATIONS.md` and retain its exact
   checksum, backup-impact, and recovery evidence.

## Gateway and events: 0.1 to 0.2

The gateway remains pre-1.0. Route names, TypeBox request constraints,
authentication class, response statuses, and event names are now generated into the
[OpenAPI document](contracts/openapi.v0.2.0.json) and
[event catalog](contracts/events.v0.2.0.json).

Client actions:

- generate clients from the pinned `openapi.v0.2.0.json`, not a moving URL;
- keep response decoders forward-compatible because successful response bodies that
  lack their own format version remain open pre-1.0 objects;
- treat HTTP 422 `SAFETY_PROHIBITED_BRIEF` as a terminal local refusal and never
  expect the raw prompt to be echoed;
- for generation SSE, accept exactly one `start`, ordered `stage` records, and one
  terminal `complete` or `error`; ignore unknown additive stage fields;
- read job events in ascending numeric `id` order. `discarded` means a stale,
  cancelled, or lease-losing attempt did not gain output authority;
- send provider keys only through the dedicated request header. Never serialize a
  key into a request body, example, persisted model, event, or error report.

Rollback: keep the 0.2 reader while stopping new 0.2-only writes. Do not reinterpret
an unknown field or event as authority. Roll forward after the incompatibility is
fixed; do not edit stored event history.

## ModelSpec 2.1 to 2.2

ModelSpec 2.2 adds `slots[].equippedVariantId`. Only the equipped alternative may
affect geometry, mass, simulation, lockfiles, validation, exports, or BOMs.

```bash
forge-validate migrate old.forge.json --to current --out migrated.forge.json
forge-validate run migrated.forge.json
```

A legacy slot with one alternative migrates deterministically. A slot with multiple
alternatives refuses migration until the author records an explicit
`equippedVariantId`. Never choose the first array entry or sum all alternatives.
Retain the original file and migration output as provenance.

## Validator and WASM 0.1 to 0.2

CLI flags, exit codes, stdout JSON, and WASM exports follow their package SemVer.
Validator report documents independently remain report format 1.0.0.

```bash
forge-validate version --json
forge-validate schema --out forge-modelspec.schema.json
forge-validate run model.forge.json > report.json
```

Regenerate clients from the schema and run native/WASM golden comparison. A client
must reject an unsupported report major even when the CLI package itself starts.

## Replay spelling migration

New replay producers must emit `schemaVersion: "1.0.0"`. Readers temporarily accept
the historical `replay.v1` spelling.

1. Read the old tape without changing frame order or numeric values.
2. Replace only the format marker with `1.0.0`.
3. Re-run replay verification and compare tamper hash, frame count, duration, and
   verdict.
4. Keep the old-read fixture until the deprecation floor is satisfied.

The alias cannot be removed before both 2026-10-11 and two subsequent public minor
releases. See [`DEPRECATIONS.md`](DEPRECATIONS.md).

## Staged object upload migration

The 0.2 object API replaces an optimistic object registration with a verified staged
upload:

1. `POST /v1/blobs` with exact byte length, normalized MIME type, SHA-256, purpose,
   and bounded metadata.
2. Upload bytes using the returned checksum-bound PUT contract.
3. `POST /v1/blobs/:id/complete` with an empty JSON object.
4. Request download or photoscan consent only after the row reports `complete`.

Legacy rows are read as complete. New clients must not mark a row complete locally,
retry with changed declarations under the same idempotency key, or use a staged object
as consent authority. On rollback retain the additive 0.2 columns and stop new staged
uploads until the 0.2 gateway returns.

## User-data formats

- user-data export is 1.4.0;
- consent ledger is 1.0.0;
- account-deletion receipt is 2.0.0;
- data lifecycle is 1.0.0.

Readers must check each format's own version field. Export 1.2 added exact decimal
causal sequences plus redacted legal-hold and backup status. Export 1.3 adds the
policy artifact's authoritative `jobId` and byte-free `policyMetadata`; retained ONNX
bytes are still downloaded separately through the authenticated policy-model route.
Export 1.4 additively exposes provider-call attempt history plus byte-free provider
identity, timing, cancellation/refund, and reconciled-cost fields for the owner's
jobs. Major-1 readers must ignore the new dataset/fields when unused. The export
never contains Modal tokens, raw function input/output, retained ONNX bytes, or
unrelated provider billing data.
Deletion receipt 2.0 adds restore-suppression evidence but does not claim physical
backup deletion. Do not downgrade these meanings into an older success boolean.

## Policy tensor 1.0.0 introduction

P7-008 is the first executable policy-tensor format, so no legacy policy-tensor
reader or migration exists. Producers must emit `io.tensor.schema` as
`forge-policy-tensor`, `schemaVersion` as `1.0.0`, the exact fixed `[1, N]` input and
output shapes/layouts, `forge-y-up-rh-m`, and an integer advisory rate no greater
than 50 Hz. The ONNX artifact must bind byte count and SHA-256 to the same contract
hash recorded in the header and passing estimator-backed scorecard lineage.

Consumers must fail closed before session creation when any of those fields drift.
After creation they must also verify runtime input/output names, output shape/type,
finite observations/actions, and normalized action bounds. There is no downgrade:
stop playback, preserve the artifact and diagnostic, and use a runtime that supports
the declared major. Category-level observation labels are search/transfer metadata,
not a substitute for the scalar `io.tensor.input.layout`.

## Policy tensor 1.0.0 to 2.0.0

D42 makes this a deliberate major migration. New producers emit tensor 2.0.0 with
input shape `[1, 14]` and insert these estimator-derived body-frame velocity scalars
after the six attitude/rate entries:

1. `estimator.linearVelocity.bodyXMps`
2. `estimator.linearVelocity.bodyYMps`
3. `estimator.linearVelocity.bodyZMps`

The target-error, voltage, and current entries follow them. Output shape remains
`[1, 4]`, but task v3 explicitly defines those values as normalized collective,
roll, pitch, and yaw flight targets interpreted by the deterministic inner loop;
zero collective maps to contract-derived hover trim. Training bundle 2.0.0 supplies
the required tilt/yaw authority, and `p7-v3`/3.0.0 supplies the corrected Forge Y-up
axis, reward, control, velocity-filter, and completion contract.

There is no byte rewrite or zero-padding migration for an existing policy. Keep a
v1 policy's exact ONNX bytes, v1 layout, and v1 observer, or retrain it from the
admitted contract with bundle v2/task v3. Studio and WASM retain tested v1 execution;
new training, fixtures, and evidence use v2. A producer must not relabel v1 bytes as
v2, synthesize velocity semantics, or copy a v3 task hash onto an older task.

Rollback stops new v2 training first. A v2-unaware client must refuse playback while
retaining the artifact; deploying it does not authorize conversion to v1. A current
client may continue exact v1 reads during rollback. Run `pnpm build:wasm`, focused
Rust/Python/gateway/Studio compatibility tests, `pnpm verify:compatibility`,
`pnpm docs:contracts`, `pnpm verify:docs-contracts`, and the full release gate.

## Object-backed policy delivery 0.2

P7-011 changes policy delivery without changing policy-tensor 1.0.0. Producers may
include canonical base64 bytes only inside the transient worker result. The current
unexpired D38 attempt verifies the exact size and SHA-256, uploads the bytes to the
owner-scoped content-addressed object key, and then wins a single transaction that
marks the job successful and creates exactly one job-bound policy artifact. Persisted
job output and `policy_artifacts.policy_metadata` contain only byte-free delivery,
model-revision, scorecard, tensor, lineage, size, and digest evidence.

Authenticated clients read retained bytes through `GET /v1/policies/:id/model`.
The gateway requires owner scope, a complete matching object row, exportable
scorecard authority, and exact agreement among the job, model snapshot, policy
metadata, object declaration, response bytes, and checksum header. Studio then
verifies the same size and digest again before ONNX session creation. The route is a
same-origin byte relay; workers remain private and object-store credentials or
presigned URLs are never exposed to Studio.

Rows created before migration 0022 may have a null `job_id` and are not rewritten
into fabricated authority. The migration backfills only an unambiguous matching job
and strips historical inline bytes when copying delivery evidence. Application
rollback must stop new policy writers and workers, retain migration 0022 and any
uploaded content-addressed objects, and roll forward with a reader that understands
the byte-free 0.2 envelope. A cancellation during upload may leave an unreferenced
object, but cannot create database or download authority; OPS-006 owns bounded
reconciliation and deletion of such orphans.

## Worker envelope 0.2 and queue changes

Worker artifacts remain internal and follow worker package 0.2.0. The
[artifact catalog](contracts/artifacts.v0.2.0.json) exact-matches all 17 gateway queue
kinds.

- `commerce.vendor-refresh` is additive. Before an older-worker rollback, stop
  enqueueing, then drain or cancel every commerce job.
- `train.offline-bc` is additive in migration 0023. It accepts one consented owned
  telemetry-log reference and emits either the legacy held warmstart envelope or a
  normal policy after exact BC-to-PPO execution. Clients cannot supply tape/hash/
  snapshot/training authority. Before rollback, stop enqueueing, drain or cancel the
  new kind with a D45-capable worker, retain source/consent/lease evidence, and roll
  forward; never relabel the row as `train.policy` or fabricate fixture output.
- D46 Modal operations are additive in migration 0024. Jobs gain byte-free provider
  identity/lifecycle/refund fields plus report-ID/time-bound reconciled cost, and
  export 1.4 adds the owner's attempt rows with the same cost authority.
  `DELETE /v1/jobs/{jobId}` additively provides owner cancellation for queued/running
  jobs. Older clients may ignore these fields and route; they must still treat
  `cancelled` as terminal and `discarded` events as non-authority. Before rollback,
  disable Modal enqueueing, cancel or reconcile every durable FunctionCall ID, retain
  migration 0024/history, and roll forward with a D46 worker. Never clear call history,
  call a product-credit reversal a provider refund, or let an older worker resume.
- D38 attempt leases are additive persisted state. Stop all old workers before
  applying migration 0021. An older worker cannot resume after the lease constraint
  is active.
- keep migration 0021, drain or cancel current attempts, and roll forward to the
  D38-capable worker. Never clear lease evidence or mark staged objects complete as a
  rollback shortcut.
- before publishing any worker artifact family externally, give it an independent
  `schemaVersion`, supported-read matrix, old/current/unsupported fixtures, migration
  guidance, and deprecation entry.

## Shipping a future compatibility change

1. Classify the change as patch, minor, or major under `COMPATIBILITY.md`.
2. Update the runtime source, `compatibility/compatibility.json`, and
   `contracts/documentation.json` together.
3. Add old/current/unsupported fixtures and an executable migration or manual guide.
4. Run:

   ```bash
   pnpm docs:contracts
   pnpm verify:docs-contracts
   pnpm verify:compatibility
   pnpm verify:goldens
   pnpm verify
   ```

5. Add the compatibility and deprecation sections to release notes. Preserve prior
   versioned documents when a supported old line remains readable.
6. For removals, satisfy the notice clock, public-release count, decision, backup
   impact, and rollback/roll-forward requirements before deleting a read path.
