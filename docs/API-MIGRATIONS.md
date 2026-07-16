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

- user-data export is 1.6.0;
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
Export 1.5 adds recorder materialization metadata: the sanitized upload plan, five
owner blob IDs, object-integrity state, and explicit archive/device/field/sharing/
training nonclaims. Archive payloads remain separate authenticated blob downloads;
filesystem paths, raw frames, and presigned URLs are excluded.
Export 1.6 adds the separate recorder admission, exact bounded native-verification
report, and object-backed telemetry-reference metadata. It still excludes frame and
replay bytes, temporary paths, presigned URLs, device/session authenticity, field
provenance, and sharing/training authority.
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

## Desktop recorder archive 1.0

P8-013 adds the local `forge-recorder-archive/1.0.0` family rather than upgrading a
previous recorder archive. The old Desktop recorder command wrote only an unindexed
manifest stub and never represented a completed replay. Do not migrate that stub into
success evidence or synthesize a receipt for it. A completed v1 archive requires the
manifest, append-only frame stream, sparse byte-offset index, finalized replay, and
success receipt with exact hashes for all three replay-bearing files.

Readers must require exactly the five canonical real regular files, refuse symlinks
and alternate/extra/missing names, enforce the actual aggregate cap, and require the
supported archive major plus canonical strict metadata/frame/index bytes. They must
independently verify every sparse stride/final sequence/time/byte offset, frame
count/duration, frame and index hashes, and an exact reconstructed replay digest
against both the retained replay and receipt before treating the archive as complete.
D51 implements that streaming v1 read path; its inspection response means local
self-consistency only and supplies no signature, device/session identity, field/lab,
sharing, or training authority. A directory without both a finalized replay and success receipt
is interrupted raw capture only: preserve it for explicit recovery or deletion, but do
not import, share, train from, or relabel it as a completed archive. Version 1 records
local-serial-integration maturity, user ownership, sharing and training reuse disabled,
exact capture-consent confirmation, and `recordedDeviceAttested: false`. Capture
consent does not grant sharing or training reuse; later device-attested,
sharing-authorized, or training-authorized semantics require new authority and
compatibility evidence rather than an in-place field edit.

Rollback stops and drains the active recorder first. Retain every archive directory,
including incomplete captures, and roll forward to a v1-aware reader; an older Desktop
build must not claim v1 completion or delete evidence it cannot interpret. Validate the
runtime and generated catalog with Desktop native tests, `pnpm verify:compatibility`,
`pnpm docs:contracts`, `pnpm verify:docs-contracts`, and `pnpm verify:goldens`.

### Desktop recorder controls 1.0

D52 adds `recorder_status` and changes the non-persisted
`start_background_recording` result from an archive-version-labeled acknowledgement
to exact `forge-recorder-control/1.0.0`; `stop_background_recording` still returns
the unchanged persisted receipt 1.0.0. The old start acknowledgement was never
completion evidence and is not migrated or retained. Current clients must require
the exact control field set and `inactive|recording|finished` semantics, reject every
device/field/sharing/training authority promotion, and collect a finished recorder
through explicit stop before another start.

Control v1 does not migrate archive bytes. Studio derives contract hash, lockfile
hash, and seed only from its active admitted validator report and passes them with
one D12 rig, one OS-enumerated 115200-baud port, a new absolute output directory,
and exact per-log capture consent. Native code independently re-enforces the hardware
gates and request bounds. Browser builds fail closed before invoking any command, and
the response never includes frames or authorizes gateway materialization.

For rollback, first query status and explicitly stop/drain or collect the recorder
error while the D52-aware shell is still running. Preserve complete or interrupted
archive directories, then roll forward to a v1-aware archive reader. Never replace
the shell or relabel a start response as a receipt while capture is active.

### Desktop recorder materialization 1.0

D53 adds `forge-recorder-upload-plan/1.0.0`, native upload receipt
`forge-recorder-upload/1.0.0`, and persisted
`forge-recorder-materialization/1.0.0` without changing archive v1. Desktop reruns
the D51 verifier and emits only identity/count/nonclaim metadata plus the exact five
file names, sizes, MIME types, and SHA-256 values. It never sends local paths or frame
bytes through gateway JSON. The authenticated gateway stages five private objects;
Desktop streams each regular file directly to the exact checksum-bound presigned PUT
on one configured object origin, with redirects and system proxy discovery disabled.

Completion requires gateway inspection of all five object length/type/checksum
declarations and bounded reads of manifest plus receipt to cross-bind artifact, rig,
contract, lockfile, source-port hash, time/count, and frame/index/replay object hashes.
Success sets only `gatewayObjectIntegrityVerified=true`.
`gatewayArchiveSemanticsVerified`, device identity, field verification, sharing,
training reuse, and recorded-device attestation remain false. D53 is object
materialization, not telemetry admission or server-side streaming replay verification.

Rollback first stops new staging, lets in-flight PUT URLs expire, and completes or
deletes staged rows and their private objects under the normal orphan policy. Retain
migration 0025 and user-data export 1.5 metadata; an older application may ignore the
additive table but must not relabel its objects as telemetry logs or completed archive
semantics. Roll forward to a D53-aware gateway/Desktop pair.

### Recorder archive admission 1.0

D54 additively adds authenticated
`POST /v1/recorder-archives/:id/admit` with exact request body `{ "modelId":
"mdl-..." }`. The materialization must already be D53-complete. The gateway streams
all five private objects into an exclusive temporary directory, invokes native
`forge-validate recorder-verify`, removes the temporary bytes, and exact-binds the
`forge-recorder-verification/1.0.0` report to the materialization, replay object, and
selected owned admitted-model proof.

Success returns `forge-recorder-admission/1.0.0` and creates one bounded
`forge-recorder-telemetry-reference/1.0.0` log. No replay frames cross gateway JSON
or enter JSONB. D53 object integrity remains an unchanged separate row whose archive-
semantics field is still false. Device/field identity, recorded-device attestation,
sharing, and training reuse remain false, and D45 rejects the object-backed reference
even if training consent is later granted. User-data export 1.6 additively includes
the admission/report metadata without object bytes or temporary paths.

Rollback disables the admission route first and lets any in-flight verifier finish
or fail closed. Retain migration 0026, its admission rows, linked telemetry
references, and all five private objects. An older gateway may ignore these additive
rows but must not delete them, reinterpret D53 semantics, inline archive bytes, or
feed object-backed references to legacy offline training. Roll forward to a D54-
aware gateway/validator pair; no down-conversion exists.

### Desktop recorder adapter probe 1.0

D55 additively introduces the ephemeral native command
`probe_recorder_adapter` and exact response
`forge-recorder-adapter-probe/1.0.0`, naming adapter
`forge-betaflight-msp-adapter/1.0.0`. It changes no archive, replay, upload,
materialization, admission, telemetry-log, or database format. Current Studio
clients must require the exact response field set; the ordered read-only MSP command
IDs `[1,2,3,4,5,160]`; protocol 0/API 1.47, `BTFL`, stable Betaflight 2025.12.x,
and `KAKUTEH7`; an atomically inactive native recorder; equal pre/post response-set
hashes; bounded lowercase hashes; and
all device/cryptographic-attestation/recorded-device/field/sharing/training flags
false.

Older Studio builds may ignore the command and continue using D50-D54 surfaces.
Rollback removes only the probe UI/command after any active probe finishes; there is
no persisted row or conversion. Never copy a probe result into archive v1, D54, a
telemetry-log maturity field, or consent authority. A future recorder-bound adapter
format must use a new reviewed major and independently bind start/end identity,
capture bytes, custody, and the named real-device/lab evidence.

### Desktop recorder custody authorization/proof 1.0 (D56 design)

D56 plans three additive formats:
`forge-recorder-custody-trust-bundle/1.0.0`,
`forge-recorder-custody-authorization/1.0.0`, and
`forge-recorder-custody-proof/1.0.0`. None exists in runtime yet. The trust bundle is
a deployment-owned, separately SHA-256-pinned public-key root. The authorization is
a short-lived, purpose-limited Ed25519-signed canonical binding for one exact
protected revision, evidence pack/signoff set, D12 artifact/model identity, two OS
serial descriptors, and expected D55 identity. The proof is a create-new local file
outside the five-file archive and binds the verified authorization, pre/post D55
observations, and canonical v1 receipt hash.

Implementation must add new commands/responses rather than adding fields to
`forge-recorder-control/1.0.0`, `forge-recorder-receipt/1.0.0`, or
`forge-recorder-adapter-probe/1.0.0`. Existing archive v1, D51 inspection, D53 five-
object materialization, migration 0026/D54 admission, telemetry references, and
training refusal remain byte-for-byte and semantically unchanged. Older Desktop and
Studio builds may ignore the new custody files/commands; they must never place the
proof inside an archive-v1 directory or infer provenance from its absence.

Rollback disables the D56 commands, removes no completed v1 archive, and retains any
private authorization/proof evidence under its declared lifecycle. A failed post-
capture identity check emits no proof but does not invalidate an otherwise clean v1
receipt. Gateway ingestion, a sixth object, D54 promotion, archive v2, field status,
recorded-device attestation, or training admission requires a later decision,
version, migration, compatibility registration, and roll-forward plan.

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
