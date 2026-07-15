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
| user-data export | 1.2.0 | additive datasets/fields are minor; removal, rename, or meaning/type changes are major; secret fields are never part of the format | major 1 |
| consent ledger | 1.0.0 | new purposes/subject kinds are additive only when old consumers can ignore them; changing grant/withdraw authority, notice binding, or subject meaning is major | major 1 |
| account-deletion receipt | 2.0.0 | additive counts/status fields are minor; changes to primary/object deletion meaning or backup-status semantics are major | major 2 |
| data lifecycle | 1.0.0 | retention-class meaning, legal-hold authority, subject digest domain, tombstone/restore semantics, or backup state changes are major; new ignorable evidence fields are minor | major 1 |
| policy tensor | 1.0.0 | `forge-policy-tensor` binds scalar input/output order, names, fixed shapes, Y-up/right-handed/SI frame, normalized action meaning, and advisory rate; any semantic/layout change is major | major 1 |
| worker artifacts | 0.2.0 | package SemVer governs unversioned internal envelopes; the machine matrix exact-matches all 16 gateway queue kinds; public families must gain an independent `schemaVersion` before external publication | current minor line |

`forge-validate version --json` and the WASM `version()` export report the active
package and data-contract versions. Validator reports carry `reportVersion`.
EnvSpecs now default a missing `schemaVersion` to `1.0.0` for backward-compatible
reads; replay producers emit `1.0.0`, while readers temporarily accept the historical
`replay.v1` alias. Manufacturing exports carry a separately versioned license export
manifest that binds every assembly asset to its ledger class, disposition,
attribution/link-out evidence, and the derived assembly policy.

`GET /v1/account/export` emits user-data export 1.2.0. It includes explicit
owner-scoped database datasets plus authenticated per-blob download endpoints, but
never OAuth access/refresh/ID tokens, session or verification tokens, or provider
API keys. Version 1.1 added complete consent history; 1.2 adds causal event sequences
as exact decimal strings,
redacted account/owned-object legal-hold history, and catalogued account/owned-object
backup-copy status without authority/evidence references.
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

P7-008 introduces the first independently versioned executable policy boundary:
`io.tensor.schema = forge-policy-tensor` and `schemaVersion = 1.0.0`. A v1 consumer
must reject an unsupported major, a non-Y-up/right-handed/SI coordinate frame,
unknown or reordered scalar/action layouts, non-fixed `[1, N]` shapes, rates above
D9's 50 Hz advisory ceiling, held or estimator-unproven scorecards, contract-lineage
drift, digest/byte-count mismatch, non-finite values, and outputs outside normalized
`[-1, 1]` motion bounds. This is the first version, so there is no legacy read or
migration path. The five category-level observation labels remain transfer/search
metadata; `io.tensor.input.layout` is the executable scalar truth.

P7-003 adds two internal machine-checked schemas under worker package 0.2.0:
`forge-admitted-model-snapshot` 1.0.0 and `trainingMuJoCoBundle` 1.0.0. The former is
a gateway-owned immutable envelope around exact admitted ModelSpec bytes and their
SHA-256. The latter is emitted only by `forge-validate training-bundle` after
sovereign re-admission and carries the Rust-derived MJCF, mass/gravity/hover trim,
powertrain curve, estimator, policy tensor layout, control bounds, and assumptions
consumed by the Python environment. Gateway, Rust, Python, and the compatibility
checker must agree on both exact versions. These remain internal schemas; exposing
either as a public API or independently published artifact requires an explicit
compatibility-surface promotion, migration policy, fixtures, and release notes.

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
