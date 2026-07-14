# Deprecation ledger

Owner: repository maintainers

Policy version: **1.0.0**

Machine policy: [`../compatibility/compatibility.json`](../compatibility/compatibility.json)

This ledger is the human-readable companion to the generated API/event/artifact
reference. An entry announces a compatibility commitment; it does not by itself
remove a reader, migrate stored data, or prove a production rollout.

## Active deprecations

| Surface | Deprecated form | Replacement | First public replacement | Earliest removal | Current state |
|---|---|---|---|---|---|
| replay tape | `schemaVersion: "replay.v1"` | `schemaVersion: "1.0.0"` | validator `v0.1.0`, 2026-07-13 | after both 2026-10-11 and two subsequent public minor releases | readable; warning/documentation active |

Removal is not yet authorized. At least the date floor and the release-count floor
must both pass, and old/current/unsupported-major fixtures must remain green through
the removal release.

## Pre-1.0 compatibility notices

- Markerless worker replay inputs remain readable only for the pre-1.0 worker line.
  New producers must emit replay `schemaVersion: "1.0.0"`. No independent public
  removal clock exists because worker envelopes are still internal.
- Successful gateway response objects without their own format marker remain a
  documented pre-1.0 surface. Clients must use the pinned OpenAPI version, tolerate
  additive fields, and depend only on documented fields/statuses. No route or event
  removal is currently scheduled.
- Worker artifact envelopes follow worker package 0.2.0 until a family is promoted
  to an independently versioned public format. Promotion is additive documentation,
  not permission to drop the internal reader.

## Required lifecycle for a new deprecation

1. Add the deprecated form, replacement, affected versions, owner, and first public
   replacement release to this ledger.
2. Update `compatibility/compatibility.json`, `COMPATIBILITY.md`, the generated
   API/event/artifact source, changelog, and runtime diagnostics where possible.
3. Provide an executable migration or a concrete manual procedure with rollback or
   roll-forward guidance.
4. Keep the old read path for at least 90 days and two public minor releases,
   whichever is longer. Unpublished development time does not count.
5. Add supported-old, current, and unsupported-version fixtures. Persisted-data
   breakage additionally needs a decision record and backup-impact analysis.
6. Remove only in a protected release whose notes name the old form, replacement,
   affected range, migration command, and recovery path.

Security or safety removals may move faster only with a published advisory,
maintainer decision, affected-version range, and fail-closed replacement. Never use
an accelerated removal merely to avoid a migration.

## Retired deprecations

None.
