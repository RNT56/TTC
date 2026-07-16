# Compatibility and deprecation policy

Owner: repository maintainers  
Policy version: **1.0.0**  
Effective: **2026-07-13**  
Machine-readable source: [`../compatibility/compatibility.json`](../compatibility/compatibility.json)

This policy governs the formats that cross process, package, persistence, and
download boundaries. It does not turn a tagged validator package into a
production-supported service. It makes the compatibility promise explicit at every
release boundary.

## Version domains

The product/package version and persisted-data versions are independent. A validator
patch may read several schema versions; a schema-major change does not require every
package to adopt that same number.

| Surface | Current | Compatibility rule | Current read support |
|---|---:|---|---|
| ModelSpec schema | 2.2.0 | additive optional fields are minor; removals, meaning/type/unit changes, or newly required fields are major | 2.2.0 directly; 2.1.0 slot documents require explicit `migrate` selection proof |
| validator CLI | 0.2.0 | documented flags, exit codes, and stdout JSON are public; before 1.0, breaking changes require a minor bump and migration note | current minor line |
| validator report | 1.0.0 | consumers must ignore unknown fields; additive fields are minor; removal/type/meaning changes are major | major 1 |
| WASM facade | 0.2.0 | exported function signatures follow package SemVer; JSON payloads follow their own format versions | current minor line |
| gateway API | 0.2.0 | registered routes, request constraints, auth class, and documented statuses follow gateway package SemVer before 1.0; independently versioned response documents keep their own domains | current minor line |
| gateway events | 0.2.0 | event names/order/terminal meaning follow gateway package SemVer before 1.0; additive fields and new stage values are minor | current minor line |
| replay tape | 1.0.0 | additive optional fields are minor; frame/header semantic changes are major | major 1 plus deprecated `replay.v1` alias |
| EnvSpec schema | 1.0.0 | `schemaVersion` governs the shape; `version` is only the individual document revision | major 1 |
| license export manifest | 1.0.0 | consumers must reject unsupported majors; asset dispositions, attribution entries, and assembly-policy meaning are governed | major 1 |
| user-data export | 1.5.0 | additive datasets/fields are minor; removal, rename, or meaning/type changes are major; secret fields and retained policy bytes are never part of the format | major 1 |
| consent ledger | 1.0.0 | new purposes/subject kinds are additive only when old consumers can ignore them; changing grant/withdraw authority, notice binding, or subject meaning is major | major 1 |
| account-deletion receipt | 2.0.0 | additive counts/status fields are minor; changes to primary/object deletion meaning or backup-status semantics are major | major 2 |
| data lifecycle | 1.0.0 | retention-class meaning, legal-hold authority, subject digest domain, tombstone/restore semantics, or backup state changes are major; new ignorable evidence fields are minor | major 1 |
| policy tensor | 2.0.0 | `forge-policy-tensor` binds scalar input/output order, names, fixed shapes, Y-up/right-handed/SI frame, normalized action meaning, and advisory rate; any semantic/layout change is major | majors 1 and 2; new producers emit 2, exact v1 execution remains a legacy read path |
| Desktop recorder archive | 1.0.0 | `forge-recorder-archive` binds the exact five-file layout, manifest, serial-JSONL input authority, canonical replay frames, sparse byte-offset index, clean-stop replay/receipt hashes, streaming import refusal, privacy defaults, and explicit non-attestation semantics; changes to any of those meanings are major | major 1 |
| Desktop recorder materialization | 1.0.0 | `forge-recorder-materialization` binds the sanitized upload plan, five private checksum-bound object roles, same-origin native streaming upload, gateway object-integrity transition, and explicit false archive-semantics/device/field/sharing/training authority; changing any role or authority meaning is major | major 1 |
| worker artifacts | 0.2.0 | package SemVer governs unversioned internal envelopes; the machine matrix exact-matches all 17 gateway queue kinds and internal admitted-snapshot/training-bundle/training-task versions; public families must gain an independent `schemaVersion` before external publication | current minor line; training bundle v2 and task v3 are current, while older task/policy metadata remains immutable legacy evidence |

`forge-validate version --json` and the WASM `version()` export report the active
package and data-contract versions. Validator reports carry `reportVersion`.
EnvSpecs now default a missing `schemaVersion` to `1.0.0` for backward-compatible
reads; replay producers emit `1.0.0`, while readers temporarily accept the historical
`replay.v1` alias. Manufacturing exports carry a separately versioned license export
manifest that binds every assembly asset to its ledger class, disposition,
attribution/link-out evidence, and the derived assembly policy.

`GET /v1/account/export` emits user-data export 1.5.0. It includes explicit
owner-scoped database datasets plus authenticated per-blob download endpoints, but
never OAuth access/refresh/ID tokens, session or verification tokens, or provider
API keys. Version 1.1 added complete consent history; 1.2 added causal event sequences
as exact decimal strings,
redacted account/owned-object legal-hold history, and catalogued account/owned-object
backup-copy status without authority/evidence references. Version 1.3 adds each
policy artifact's authoritative job binding and byte-free delivery/model/scorecard/
tensor metadata. Policy ONNX bytes remain outside the export document and require
the authenticated owner-scoped policy-model endpoint.
Version 1.4 adds D46 job provider-call attempt history and the job's byte-free
provider identity, timing, cancellation/refund, and report-ID/time-bound reconciled
cost fields. It does
not embed Modal tokens, provider payloads, function inputs/outputs, ONNX bytes, or
unrelated billing/dashboard data.
Version 1.5 adds owner-scoped recorder materialization rows, their five blob IDs,
sanitized upload plan, object-integrity state, and explicit authority nonclaims. The
archive payloads remain outside the export JSON and use the existing authenticated
blob-access endpoints; local filesystem paths and presigned URLs are never exported.
Consent ledger 1.0.0 binds every append-only grant/withdrawal to a purpose, owned
subject, policy version, exact notice hash, prior event, and bounded evidence; only
the latest event under the current policy/hash can be active. Consent and legal-hold
chronology uses a monotonic database sequence, never timestamp/random-ID ordering.
`DELETE /v1/account` emits deletion receipt 2.0.0 only after the primary database
transaction and S3-compatible object deletion succeed. It includes lifecycle 1.0.0
restore-suppression tombstones, backup deadline, and tombstone expiry; it does not
claim physical provider-backup deletion. Data-lifecycle 1.0.0 governs retention
classes, legal-hold events, backup catalog/expiry states, tombstones, restore checks,
and pseudonymous audit evidence.

The internal Postgres schema uses an ordered migration prefix rather than an
independent SemVer surface. D37 and [`MIGRATIONS.md`](MIGRATIONS.md) support every
exact checked-in predecessor prefix during the pre-1.0 line. Recorded filenames and
checksums are immutable compatibility evidence: gaps, missing source, or checksum
drift are unsupported integrity failures and must never be repaired by editing the
ledger. Retiring a prefix or introducing destructive persisted-data semantics still
requires this policy's decision, backup-impact, release-note, and migration/recovery
procedure.

ModelSpec 2.2 adds `slots[].equippedVariantId`. For a 2.1 slot with exactly one
alternative, `forge-validate migrate <file> --to current` records and equips that
sole alternative. Migration refuses to guess when a legacy slot has multiple
alternatives; set `equippedVariantId` explicitly, then rerun migration. Unselected
alternatives never contribute parts, catalog refs, simulation values, BOM rows, or
lockfile requirements.

The `/v1` gateway API and its event line are documented pre-1.0 internal surfaces at
0.2.0. [`API-EVENT-ARTIFACT-REFERENCE.md`](API-EVENT-ARTIFACT-REFERENCE.md), the
versioned OpenAPI/event catalogs, and their machine manifest are generated from the
actual Fastify/TypeBox registrations plus reviewed metadata. The gate rejects an
undocumented/removed route, stale request schema, event-emission drift, queue-kind
drift, missing example/guide, or edited generated output. Successful response shapes
without an independent format marker remain open pre-1.0 objects. The v0.2 gateway
adds a structured HTTP 422 refusal with code `SAFETY_PROHIBITED_BRIEF`; SSE emits the
same safe body as a terminal error after a hash-only start and ordered stage events.
Clients must not depend on refused prompt echoing or fields outside the documented
code/policy-version/category/refusal-ID response.

The worker queue kind list is also an internal cross-process contract. The gateway
source and `workerArtifacts.queueKinds` matrix must match exactly.
`commerce.vendor-refresh` is an additive kind introduced by migration 0020; its
artifact envelope already belongs to worker package 0.2.0, so this wiring does not
change the artifact version. Older workers safely leave the unknown kind queued.
Rollback must stop enqueueing and drain or cancel every commerce job before deploying
an older gateway/worker; retain migration 0020 and roll forward. Removing the kind or
changing its persisted meaning requires a new migration, compatibility fixture, and
the normal deprecation/breaking-change procedure.

D38/migration 0021 changes the internal attempt protocol without changing queue-kind
or worker-artifact 0.2.0 envelopes. New workers require an opaque lease token and
expiry for `running`, use persisted bounded attempts/timeouts, and may commit only
under the same unexpired token. Stop old workers before applying 0021; application
rollback retains the additive schema, drains/cancels live attempts, and must not
resume the old worker. The `/v1` client object API is pre-1.0: `POST /v1/blobs` now
requires length, MIME type, and SHA-256, returns a staged row and checksum-bound PUT,
and adds `POST /v1/blobs/:id/complete`. Consumers must complete verification before
download or photoscan consent. Legacy rows are read as complete; no public artifact
format version changes.

QA-007 is a patch-level strictness correction, not a format-version change. Valid
ModelSpec patches, replay major 1 plus the deprecated `replay.v1` alias, EnvSpec
major 1, the documented URDF/MJCF subset, worker artifact 0.2.0 payloads, and license
manifest major 1 retain their meaning. Inputs containing non-finite physical/time/
confidence values, malformed supported import numerics or graphs, unsafe hardware
command tokens, duplicate telemetry time, malformed supervisor vectors/limits, or
contradictory license authority were never valid supported evidence and now refuse
deterministically. The registered corpora pin both compatible reads and these
refusals; no migration or deprecation clock is introduced.

D48 introduces internal `forge-bridge-config/1.0.0` as a worker-to-Desktop hardware
artifact and registers its version under `workerArtifacts.internalSchemas` without
promoting it to a public compatibility surface. The adjacent
`workerArtifacts.bridgeConfigFirmwareVersion` machine-checks the Python producer and
Rust Desktop consumer against the same reviewed command reference. Version 1 requires Betaflight
2025.12, exactly the `firmware`/`mixer`/`rates` producer fields after the queue strips
its framework-owned `timeoutS`, the D12 `quadx`
scope, exactly one `failsafe_delay` integer from 2
through 200 deciseconds, physical confirmation, `noAutoArm=true`, canonical ordered
lines, and their exact SHA-256. The native consumer accepts only the corresponding
header, `set failsafe_delay = N`, and final `save`; it never accepts arbitrary CLI
tokens or a caller-authored raw diff. Adding firmware families or versions, commands,
mixers, modes, automatic target-version inference, or a different hash preimage is a
new artifact major unless a compatibility fixture proves an additive read. The
serial receipt 1.0.0 is historical transport-only evidence; its transmitted byte
count is not application or target-firmware verification. D49 advances current
Desktop success output to `forge-bridge-serial-receipt/2.0.0` because the truth
semantics changed. Version 2 is emitted only after one bounded pre-write stable
`2025.12.x` identity, exact set/save acknowledgement, reboot/reconnect, the same
reported firmware identity, and one matching `get failsafe_delay` readback. It adds
the exact full patch version, pre/post reported-identity hashes, SHA-256 digests of
the four authoritative response byte streams, normalized readback-line value/hash, and
CLI-arming-disabled state; its verification booleans are true only on that complete
path. Any post-transmission ambiguity returns an error rather than a v2
receipt. Existing v1 receipts retain their original transport-only meaning and must
never be migrated or displayed as v2 application proof. The config artifact remains
1.0.0 unchanged. Publishing either format requires surface registration,
old/current/unsupported fixtures, migration and deprecation guidance, and release
notes. Neither receipt major identifies a physical device uniquely or establishes
real-FC, lab, HITL, tethered, supervisor, or field evidence.

D50 introduces persisted Desktop `forge-recorder-archive/1.0.0`, exact wire input
`forge-telemetry-frame/1.0.0`, and clean-stop
`forge-recorder-receipt/1.0.0`. Archive v1 binds the replay 1.0.0 header authority,
manifest filenames/privacy/non-attestation fields, canonical append-only replay
frames, sparse sequence/time/byte-offset JSONL index, and receipt hashes for the
frame, index, and completed replay files. The input frame schema admits exactly
schema version, active artifact ID, contiguous zero-based sequence, finite strictly
increasing time, and one bounded object state. Adding optional manifest/receipt
evidence is minor only when old readers can safely ignore it. Changing input codec,
sequence/time meaning, canonical frame encoding, index offsets, clean-stop/receipt
semantics, privacy or device-attestation meaning, hash preimages, filenames, or replay
major is an archive major. Readers must refuse unsupported majors rather than infer a
new meaning. There is no migration from the historical manifest-only stub because it
never emitted a completed versioned archive or success receipt.

Archive v1 explicitly records local serial integration, user ownership, sharing
false, training reuse false, no-auto-arm, exact capture-consent confirmation, and
`recordedDeviceAttested=false`. Capture consent authorizes this local log only; it
does not authorize sharing or training reuse. Changing either false value requires
external authority/evidence, not a compatible parser update. An incomplete directory
without the receipt and completed replay is recoverable raw local data only; it is
never a successful archive. Publishing a device-attested or training-admissible
successor requires a reviewed adapter/device identity contract, consent-ledger
bindings, fixtures for old/current/unsupported majors, migration/deprecation
guidance, and a superseding decision.

D51 defines the archive-v1 read contract without changing its version. A successful
Desktop inspection requires exactly the five canonical real regular files and
rejects symlinks, extra/missing entries, unsupported or non-canonical metadata,
aggregate over-budget bytes, field/version/privacy drift, malformed or non-canonical
frames/index entries, time/count/duration/offset drift, and any mismatch among the
frame hash, index hash, reconstructed replay bytes, retained replay hash, and receipt.
The reader streams the tape and index and reconstructs the replay digest without
loading either large artifact into memory. `forge-recorder-inspection/1.0.0` is a
bounded Desktop command response, not another persisted archive surface. Its
`integrityVerified=true` means local v1 self-consistency only; device identity,
recorded-device provenance, signatures/authenticity, field/lab status, sharing,
training reuse, ghost, system ID, and gateway materialization remain false or absent.
An importer that accepts alternate filenames/encodings/index semantics or promotes
those authorities is incompatible with archive v1 even if it still parses the JSON.

D52 adds `forge-recorder-control/1.0.0` as a bounded ephemeral Desktop command
response, not an independently persisted/public compatibility surface. It exact-matches
the field set and `inactive|recording|finished` state meanings; inactive carries no
capture identity, and recording/finished carry the unchanged archive identity while
device, field, sharing, and training authority remain false. Adding a state,
changing a field's meaning, accepting caller-declared provenance, or treating start
as completion requires a control-schema major. Successful stop continues to return
the persisted `forge-recorder-receipt/1.0.0`, and D52 changes no archive, frame,
index, replay, inspection, or receipt byte. Older Studio builds may ignore the new
commands but must not infer recorder state; after a control rollback, operators must
stop/drain any active shell recorder and retain the archive for a v1-aware reader.

D53 adds the seventeenth public/persisted surface,
`forge-recorder-materialization/1.0.0`, with companion path-free upload plan
`forge-recorder-upload-plan/1.0.0` and native transport receipt
`forge-recorder-upload/1.0.0`. Its five object roles, lengths, MIME types, hashes,
private owner scope, staged/materialized transition, and authority nonclaims are exact
major semantics. `gatewayObjectIntegrityVerified=true` means all five stored objects
matched their declarations and bounded manifest/receipt bindings; it never implies
`gatewayArchiveSemanticsVerified`, telemetry admission, device/field provenance,
sharing, or training. Changing object roles or upgrading those false meanings is a
major change with new migration and admission evidence. Older applications may ignore
migration 0025 rows but must retain them and roll forward; they may not transform
them into legacy `telemetry_logs`.

P6-010's MJCF correction is also patch-level. ModelSpec joint angles and limits have
always been radians, but the exporter previously omitted MuJoCo's explicit radian
compiler declaration and therefore allowed the engine's degree default to reinterpret
valid values. Adding that declaration restores the documented meaning; it does not
change ModelSpec, CLI/WASM, gateway, replay, EnvSpec, or worker-artifact versions.
The new `simParityMuJoCoRequest` and `simParityMuJoCoBaseline` 1.0.0 documents are
internal required-CI evidence envelopes, not externally published worker formats.
Their exact source revision, MuJoCo 3.9.0 provider, canonical scene set, timestep,
and substeps fail closed. Any external publication would first require promotion to
the compatibility matrix and its normal migration/deprecation policy.

P7-008 introduced the first independently versioned executable policy boundary:
`io.tensor.schema = forge-policy-tensor` and `schemaVersion = 1.0.0`. A consumer
must reject an unsupported major, a non-Y-up/right-handed/SI coordinate frame,
unknown or reordered scalar/action layouts for the declared major, non-fixed `[1, N]` shapes, rates above
D9's 50 Hz advisory ceiling, held or estimator-unproven scorecards, contract-lineage
drift, digest/byte-count mismatch, non-finite values, and outputs outside normalized
`[-1, 1]` motion bounds. The five category-level observation labels remain transfer/search
metadata; `io.tensor.input.layout` is the executable scalar truth.

D42 advances new producers to policy tensor 2.0.0. Tensor v2 is `[1, 14]`: the six
v1 attitude/angular-rate scalars, three estimator-derived body-frame linear-velocity
scalars, three body-frame target-error scalars, normalized voltage, and normalized
motor current. It retains `[1, 4]` normalized collective/roll/pitch/yaw flight
targets. The added velocity state and corrected output interpretation are semantic,
so they cannot be smuggled into v1. Studio/WASM choose an exact v1 or v2 observer
from the declared major; the committed 906-byte v1 fixture remains an executable
read oracle, while the current 1,056-byte fixture and all new native training emit
v2. Unsupported majors, cross-major layout substitution, and silent downgrade fail
closed. There is no automatic policy migration: retrain against bundle v2/task v3,
or retain the old policy with the exact v1 observer/runtime.

P7-003 adds two internal machine-checked schemas under worker package 0.2.0:
`forge-admitted-model-snapshot` 1.0.0 and `trainingMuJoCoBundle`. The former is
a gateway-owned immutable envelope around exact admitted ModelSpec bytes and their
SHA-256. The latter is emitted only by `forge-validate training-bundle` after
sovereign re-admission and carries the Rust-derived MJCF, mass/gravity/hover trim,
powertrain curve, estimator, policy tensor layout, control bounds, and assumptions
consumed by the Python environment. D42 advances the bundle to 2.0.0 by adding
contract-derived `tiltMaxRad` and `yawRateRadS` authority and binding policy tensor
2.0.0. It also advances the worker-owned task to `p7-v3`/3.0.0 to bind the corrected
Y-up angular mapping, normalized-flight-target inner loop, estimator-velocity filter,
reward, and completion meaning. Gateway, Rust, Python, and the compatibility
checker must agree on both exact versions. These remain internal schemas; exposing
either as a public API or independently published artifact requires an explicit
compatibility-surface promotion, migration policy, fixtures, and release notes.

D44 adds four independently machine-checked internal authorities without changing
the public `forge-policy-tensor` surface: `groundTrainingMuJoCoBundle` 1.0.0,
`p7-ground-v1` task 1.0.0, `forge-ground-policy-tensor` 1.0.0, and
`forge-sb3-mujoco/3.0.0`. Ground task v1 applies only to the built-in rover
`line-follow` and quadruped `walk-to-target` runtime. Its tensor has an exact common
11-scalar estimator prefix; rover output is exact `[1,2]` drive/turn, while
quadruped inputs and outputs append the same ordered 8–24 contract joint names.
Bundle, task, runtime, or tensor major changes; reordered/renamed channels; altered
frame/rate/action meaning; defaulted actuation authority; or changed mechanical-
energy meaning require a new internal major and explicit retraining guidance. There
is no conversion to the flight tensor and no Studio read support: the browser must
reject `forge-ground-policy-tensor` until a separately versioned ground consumer is
implemented. External publication still requires compatibility-surface promotion,
supported/unsupported fixtures, migration/deprecation policy, and release notes.

D45 adds three independently versioned internal worker artifacts without changing a
public package surface: `forge-offline-training-tape` 1.0.0,
`forge-behavior-cloning-dataset` 1.0.0, and `forge-policy-warmstart` 1.0.0. Tape v1
requires replay 1.0.0, exact task/tensor equality, estimator-policy observations,
reviewed/supervisor actions, `controlled-synthetic` maturity, and 64..100,000 finite unique
strictly increasing samples. Dataset v1 hashes the exact source log, timestamps,
observations, actions, contract, task definition, and tensor. Warmstart v1 binds that
dataset hash to an exact lower-case parameter SHA-256. `train.offline-bc` is an
additive seventeenth queue kind; its native policy output still uses the existing
worker policy envelope and scorecard. Any changed field set, task/tensor/source
meaning, sample repair rule, hash preimage, action bound, or BC-to-PPO curriculum
requires a new internal major and retraining guidance. External publication requires
promotion, fixtures, migration/deprecation policy, and release notes.

P7-010's controlled benchmark adds internal required-CI evidence envelopes
`mjxBenchmarkRequest` 1.0.0 and `mjx-benchmark` 1.0.0 without changing a public or
queued worker artifact. Request v1 freezes the admitted snapshot/hash, exact runtime
pins, source revision, clean-checkout marker, SI perturbation scales, batch/rollout
shape, float64 requirement, solver, iterations, repetitions, and canonical request
digest. Result v1 may gain additive measurements or nonclaims, but changing required
morphologies, units, parity meanings, CPU-need rule, 3x cost-normalized threshold, or
decision eligibility is a major change. These measured artifacts are not goldens and
must not be re-pinned as deterministic expectations. External publication first
requires compatibility-surface promotion, old/current/unsupported fixtures,
migration/deprecation guidance, and release notes.

D47 adds separate internal evidence envelopes `mjxDecisionRequest` 2.0.0 and
`mjx-benchmark` 2.0.0; v1 remains accepted only by its existing controlled-feasibility
command and is not reinterpreted. Request v2 requires exact ordered `d12-quad`,
`d12-rover`, and `legged` cases; canonical contract snapshots; D12/proxy authority
identity and file hashes; clean protected source; the unchanged float64 solver/parity
protocol and runtime pins; exact GPU/TPU device authority with fallback forbidden;
12-hour scorecard and 200-candidate CPU budget artifacts with exact CPU host,
hardware, protocol, and throughput; and a current retained matching
CPU/accelerator USD/hour source. Result v2 adds all three model measurements,
authority/budget/cost lineage, and the centralized adoption-or-rejection verdict.
Changing proxy identity or exactness meaning, budget envelopes, evidence hash
preimages, accepted backend/precision, required morphology/order, cost-normalization,
parity bands, CPU-need rule, or the 3x threshold requires a new internal major. These
artifacts remain non-public measured evidence: publication still requires registered
compatibility fixtures, deprecation/migration guidance, and release notes.

## Change classification

- **Patch:** fixes implementation without changing a valid document's meaning,
  verdict, required fields, units, or serialized field types. Diagnostic wording may
  improve; stable check IDs and severities do not silently change.
- **Minor:** adds optional fields, commands, checks, enum members that consumers are
  required to treat as unknown, or new artifact families. A stricter validator rule
  is minor only when it corrects a documented invariant and ships fixtures and notes.
- **Major:** removes/renames fields or commands, changes type/unit/meaning/default,
  changes exit-code or verdict semantics, rejects a previously supported format
  without a migration, or breaks a WASM signature.

Model document `meta.version`, EnvSpec `version`, catalog revision versions, task
versions, policy versions, and release/package versions describe different objects.
They must not be used as substitutes for their schema version.

## Support and deprecation

1. Announce a deprecated surface in the changelog, this matrix, generated API or
   artifact docs, and runtime diagnostics where possible.
2. Provide the replacement and an executable migration or a concrete manual guide.
3. Keep the old read path for at least **90 days and two minor releases**, whichever
   is longer. The clock starts with the first public release containing the
   replacement; no unpublished development time counts.
4. Removal needs passing old/current/unsupported-version fixtures. Persisted-data
   breakage additionally needs a `DECISIONS.md` entry, backup impact, and rollback or
   roll-forward procedure.
5. Security or safety removals may be faster only with a published advisory,
   maintainer decision, affected-version range, and fail-closed replacement.

The historical `replay.v1` spelling remains readable but deprecated. Its removal
clock started with public validator `v0.1.0` on 2026-07-13, which contains the
replacement replay 1.x spelling. It therefore cannot be removed before both
2026-10-11 and two subsequent minor releases, and any removal still needs the proof
above. Markerless worker replay inputs remain readable only for the pre-1.0 worker
line; new producers must emit `schemaVersion: "1.0.0"`.

## Required change procedure

Every compatibility-affecting pull request must update the machine matrix and this
document, add or modify migration/compatibility fixtures, run
`pnpm verify:compatibility`, regenerate and check API/event/artifact docs with
`pnpm docs:contracts` and `pnpm verify:docs-contracts` when relevant, regenerate
schema/TypeScript/WASM outputs when relevant,
add the review evidence required by [`GOLDEN-ARTIFACTS.md`](GOLDEN-ARTIFACTS.md) when
a registered artifact changes, and record the user-visible effect in `CHANGELOG.md`.
Never infer support from a lenient parser: a version is supported only when it is
listed in the matrix and covered by an acceptance test.

Release notes must include a compatibility section with supported input ranges,
new deprecations, removals, migration commands, and rollback notes. GOV-008 owns the
cross-platform artifact proof; GOV-009 owns external install and publication proof.
