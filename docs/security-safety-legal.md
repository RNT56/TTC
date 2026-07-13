# SECURITY · SAFETY · LEGAL

Source: plan §17 (binding), expanded into actionable gates and checklists. Anything
touching admission, exports, hardware deployment, or user content must comply with
this document.

## 1. Security model

**No code in contracts (D19).** The central decision: a model is data; drivers are
parameterized references into versioned engine libraries. The future user-controller
path is sandboxed WASM — no I/O, fuel-metered, capability-limited API (read
joints/sensors, write joint targets), version-pinned, marketplace-reviewed — and is
post-P7 pending sandbox design review (OD-04).

**Provenance everywhere.** Prompts and outputs hash-logged; every generated asset
carries its validator report; every policy carries training-run lineage; every
deployment carries its ladder history. Provenance fields are validated
(`PRV-*` checks) — missing provenance is an admission failure.

**Surface minimization.** Compute workers have no public network surface (queue-driven
only). One stateful service (Postgres) bounds the audit surface. Server secrets never
reach the client; BYO Anthropic keys are client-held and sent per request to the
generation endpoint, which forwards them to Anthropic but never persists or returns
them.

**Bridge safety = security.** The bridge never auto-arms; ladder transitions require
deliberate physical confirmation; pairing-code auth for FORGE Link; the supervisor
(≥ 200 Hz) can always veto the policy (~50 Hz advisory) and owns the fallback (D9).

## 2. Platform exclusions (absolute)

FORGE excludes weapons: **no targeting systems, munition payloads, or interdiction
modules** in the catalog, the generation pipeline, or the marketplace. Briefs in that
direction are refused **and the refusal is logged**. The prototype's "combat" naming
flavor does not survive into the product — purge it during P0 translation (check
naming in translated contracts).

Implementation evidence (2026-07-13, `SEC-002`): a versioned deterministic guard now
runs before retrieval/provider/mutation work on generation context, synchronous and
streaming generation, course generation, and model edits; direct generation APIs
also refuse independently. It records only a prompt hash and length bucket,
policy/detector versions, category/rule IDs, surface, provider/archetype, optional
owner, and timestamp in `generation_refusals`. The schema has no raw-prompt or
credential column, responses do not echo content, stream starts expose only a hash,
and audit-store failure prevents all downstream work. Provider instructions remain
defense in depth, not the enforcement boundary. This proves the local/fixture and
live-provider entry contract; production alerting, abuse-rate controls, policy review,
and external adversarial evaluation remain `OPS-*`/`SEC-006` work.

## 3. Legal gates (entry conditions, not posture)

| Gate | When | What must happen before the phase ships |
|---|---|---|
| **ToS / liability review** | entry to **P8** | accepted by D30 for controlled D12 lab pilots: deployment-ladder UX, safety-supervisor disclaimers, telemetry consent language, physical confirmation, no-auto-arm, D12 rig allowlist, and advisory policy authority. External beta or non-D12 hardware requires a later rollout gate. |
| **Dual-use sanity check** | entry to **P11 policy sharing** | export-control adjacency review for autonomy software (EU dual-use regulation, US EAR). Hobby-scale exposure expected minimal — but the check is scheduled, not assumed. Record in DECISIONS. |
| **UGC moderation policy** | ships **with** the P11 marketplace | written policy: report flow, takedown SLA, repeat-infringer rule; covers models, courses, skills, listings. |
| **Trademark scan** | before public launch | FORGE is a working codename (OD-01). |

## 4. License-aware export matrix (D10)

Every catalog asset carries a license class at ingestion — **non-optional**; the ETL
pipeline rejects assets without a ledger entry.

| License class | Studio render | STEP / 3MF export | BOM |
|---|---|---|---|
| `open` | ✓ | ✓ full geometry | ✓ |
| `attribution` | ✓ | ✓ with embedded attribution manifest | ✓ |
| `no-redistribution` | ✓ (derived LODs only) | **excluded** — bounding envelope + datum ports + link-out to source CAD | ✓ (SKU link) |
| `view-only` | ✓ (derived LODs only) | **excluded** — envelope substitute | ✓ (SKU link) |

Consequence: a whole-assembly export is always legal by construction — restricted
meshes degrade to dimensioned envelopes that preserve fit while the BOM points at the
source. Implementation: export filter in the exporters keyed on the ledger
([`systems/component-database.md`](systems/component-database.md) §5; XC-17).

Implementation evidence (2026-07-13, `SEC-001`): gateway fixture and Python worker
exporters validate every asset, derive the assembly policy, bind the independently
versioned license-export manifest, substitute restricted geometry with complete
millimeter envelopes and datum ports, and emit source-link BOM rows instead of print
artifacts. The external OCCT seam receives the manifest hash and fails closed unless
it proves required attribution embedding/restricted-geometry exclusion; its output is
allowlisted so raw restricted references and arbitrary provider fields cannot cross
the boundary. This proves deterministic/adapter enforcement, not counsel review or a
live provider artifact audit.

## 5. Privacy

- **Local-first**: designs never leave the machine unless shared; server artifacts
  are user-scoped.
- **Photos** (image→3D): grant processing rights only; deletion on request; never
  training data without explicit opt-in.
- **Telemetry logs are the user's**: sharing a log (leaderboard run, marketplace
  scorecard) is an explicit per-log action.
- **Pattern library consent (D2)**: admitted models contribute anonymized structural
  idioms — opt-out per model; marketplace-listed models opt-in by default; no
  geometry attribution without consent. Consent flags travel with the harvester
  (XC-13).

Implementation evidence (2026-07-13, `SEC-003`): authenticated user-data export
1.0.0 reads a repeatable snapshot covering account metadata, generated artifacts,
models/shares, photoscan records, object metadata and download endpoints, jobs,
replays, policies, courses, leaderboards, marketplace/classroom activity, telemetry,
maintenance, quote requests, refusals, and pattern contributions. OAuth credentials,
session/verification tokens, and provider keys are excluded. Exact-confirmation
account deletion locks the owner, explicitly removes content that `SET NULL` would
orphan, deletes S3-compatible payloads before commit, and returns a versioned receipt
only after both stores succeed. Populated Postgres and MinIO upload/delete/404 proof
pass locally. This is primary-store proof; consent withdrawal is SEC-004 and legal
holds, tombstones, retention, and backup deletion/restoration are SEC-005.

## 6. Operating reality (what we tell users)

The studio surfaces, but does not adjudicate, airspace and robotics rules — EU drone
classes, Remote ID, RF regulation — with jurisdiction-aware pointers. Operation
remains the user's responsibility, and the deployment-ladder gates repeat it. Print
ordering transmits geometry and recommended profiles; print outcomes belong to the
service and the user. Scorecards are honest about what they measure: we promise a
rigorous rehearsal space and a supervised path onto hardware the user owns; **we do
not promise any policy is safe in the open world**, and the UX says so at every gate.

## 7. Engineering checklist (apply to any PR in these areas)

- [ ] New invariant → harness check with stable ID + doc update (`QA-007/008`)
- [ ] Generated artifact path → provenance fields populated and validated
- [x] Export path → license class/export policy consulted; versioned attribution manifest, assembly policy, restricted-envelope/datum/link-out substitution, external proof binding, and adversarial provider filtering are enforced (`SEC-001`, 2026-07-13)
- [x] Catalog ingestion → per-field citations + license ledger entry + review queue
- [x] Bridge/deployment surface → D30 accepted for controlled D12 lab pilots only;
      no auto-arm path; physical confirmation; supervisor
      authority preserved; D9 rates stated in UX copy
- [x] Generation surface → deterministic pre-retrieval/provider refusal on context,
      generation/stream, course-generation, model-edit, and direct-library paths;
      minimal non-content audit row; secret/prompt redaction; audit failure fail-closed
      (`SEC-002`, 2026-07-13)
- [x] User content → owner-scoped versioned export, secret exclusion, explicit
      primary-row purge, S3-compatible deletion, and storage-failure rollback
      (`SEC-003`, 2026-07-13)
- [ ] User content → explicit consent/withdrawal plus retention, legal-hold,
      tombstone, backup-deletion, and restore semantics (`SEC-004..005`)
- [ ] Auth/provider/object/job surfaces → threat model, rate limits, negative tests, redaction, and credential rotation (`SEC-006`)
- [ ] Policy sharing → current dual-use/export-control gate, per-policy signoff, moderation ownership, and external rollout decision (`SEC-007`)
- [ ] Desktop/Link release → signed artifacts, update rollback, pairing/revocation, and fault-injection evidence (`SEC-008`)
