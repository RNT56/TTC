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
| replay tape | 1.0.0 | additive optional fields are minor; frame/header semantic changes are major | major 1 plus deprecated `replay.v1` alias |
| EnvSpec schema | 1.0.0 | `schemaVersion` governs the shape; `version` is only the individual document revision | major 1 |
| license export manifest | 1.0.0 | consumers must reject unsupported majors; asset dispositions, attribution entries, and assembly-policy meaning are governed | major 1 |
| user-data export | 1.2.0 | additive datasets/fields are minor; removal, rename, or meaning/type changes are major; secret fields are never part of the format | major 1 |
| consent ledger | 1.0.0 | new purposes/subject kinds are additive only when old consumers can ignore them; changing grant/withdraw authority, notice binding, or subject meaning is major | major 1 |
| account-deletion receipt | 2.0.0 | additive counts/status fields are minor; changes to primary/object deletion meaning or backup-status semantics are major | major 2 |
| data lifecycle | 1.0.0 | retention-class meaning, legal-hold authority, subject digest domain, tombstone/restore semantics, or backup state changes are major; new ignorable evidence fields are minor | major 1 |
| worker artifacts | 0.2.0 | package SemVer governs unversioned internal envelopes; public families must gain an independent `schemaVersion` before external publication | current minor line |

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

ModelSpec 2.2 adds `slots[].equippedVariantId`. For a 2.1 slot with exactly one
alternative, `forge-validate migrate <file> --to current` records and equips that
sole alternative. Migration refuses to guess when a legacy slot has multiple
alternatives; set `equippedVariantId` explicitly, then rerun migration. Unselected
alternatives never contribute parts, catalog refs, simulation values, BOM rows, or
lockfile requirements.

The `/v1` gateway API remains a pre-1.0 internal surface pending `DOC-005`. The v0.2
gateway adds a structured HTTP 422 refusal with code `SAFETY_PROHIBITED_BRIEF` for
locally prohibited generation-family inputs; successful response shapes are
unchanged, and SSE emits the same safe body as an error event after a hash-only start
event. Clients must not depend on refused prompt echoing or on fields outside the
documented code/policy-version/category/refusal-ID response.

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

The historical `replay.v1` spelling is deprecated now, but its removal clock has not
started because no public validator release exists. Markerless worker replay inputs
remain readable only for the pre-1.0 worker line; new producers must emit
`schemaVersion: "1.0.0"`.

## Required change procedure

Every compatibility-affecting pull request must update the machine matrix and this
document, add or modify migration/compatibility fixtures, run
`pnpm verify:compatibility`, regenerate schema/TypeScript/WASM outputs when relevant,
and record the user-visible effect in `CHANGELOG.md`. Never infer support from a
lenient parser: a version is supported only when it is listed in the matrix and
covered by an acceptance test.

Release notes must include a compatibility section with supported input ranges,
new deprecations, removals, migration commands, and rollback notes. GOV-008 owns the
cross-platform artifact proof; GOV-009 owns external install and publication proof.
