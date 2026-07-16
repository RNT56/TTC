# SECURITY · SAFETY · LEGAL

Source: plan §17 (binding), expanded into actionable gates and checklists. Anything
touching admission, exports, hardware deployment, or user content must comply with
this document. Authentication, network, secret, upload, worker, callback, abuse, and
archive controls are owned by [`THREAT-MODEL.md`](THREAT-MODEL.md).

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
generation endpoint in `x-forge-anthropic-key`, which forwards them to Anthropic but
never persists, logs, or returns them. JSON body keys and server-key fallback on the
HTTP surface are refused.

**Bridge safety = security.** The bridge never auto-arms; ladder transitions require
deliberate physical confirmation; pairing-code auth for FORGE Link; the supervisor
(≥ 200 Hz) can always veto the policy (~50 Hz advisory) and owns the fallback (D9).

### 1.1 Application threat boundary (SEC-006)

The deterministic gateway/worker boundary now fails closed on production auth
misconfiguration, untrusted origin/host input, oversized or structurally hostile JSON,
private/redirecting/unbounded external endpoints, unconstrained worker commands,
unsafe object declarations, secret reflection/persistence, and unexpected release
archive contents. Prompt/retrieval/provider text stays untrusted data; reviewed
catalog policy, local refusal, allowlisted results, and the validator remain the hard
authorities.

These controls establish contract/fixture maturity. They do not prove deployed secret
custody, connection-time egress enforcement against DNS rebinding, multi-replica rate
or cost quotas, provider/APM log redaction, container isolation, callback authenticity,
or incident/rotation/restore exercises. The canonical assets, actors, trust-boundary
table, negative-test matrix, deployment checklist, and residual risks are in
[`THREAT-MODEL.md`](THREAT-MODEL.md).

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
- **Pattern library consent (D2/D34)**: admitted models contribute only after an
  explicit per-model opt-in; no marketplace default, geometry, or attribution is
  inferred. Withdrawal removes the contributed retrieval row.

Implementation evidence (2026-07-13, `SEC-003..005`, extended by P7-011):
authenticated user-data export 1.5.0 reads a repeatable snapshot covering account metadata, generated artifacts,
models/shares, photoscan records, object metadata and download endpoints, jobs,
replays, policies, courses, leaderboards, marketplace/classroom activity, telemetry,
maintenance, quote requests, refusals, and pattern contributions. OAuth credentials,
session/verification tokens, and provider keys are excluded. Exact-confirmation
account deletion locks the owner, explicitly removes content that `SET NULL` would
orphan, deletes S3-compatible payloads before commit, and returns a versioned receipt
only after both stores succeed. Version 1.2 added redacted hold history and backup-
copy status without operator authority/evidence references. Version 1.3 adds the
authoritative policy job binding and byte-free delivery metadata; it never embeds
the retained ONNX payload. That payload remains owner-scoped behind the authenticated
same-origin policy route, so browser code receives neither cross-origin object-store
credentials nor a durable inline copy. Populated Postgres and MinIO upload/delete/
404 proof pass locally. P7-011 is complete through protected PR #68/`9131289`;
artifact `8340587390` self-binds to that clean revision and proves one winner,
stale/substitution refusal, cancellation without database authority, exact retained
readback, owner-scoped browser execution, and byte-free user-data export metadata at
controlled S3-compatible sandbox maturity. Production bucket policy, durability,
orphan inventory/deletion, and storage SLO evidence remain deployment/OPS-006 work.

D53 additionally includes the owner's recorder materialization rows and five private
blob references. The export retains only the sanitized plan and explicit authority
nonclaims; recorder bytes remain authenticated object downloads, and local paths or
presigned upload URLs never enter the export. Materialization does not grant telemetry
sharing or training reuse.

D41/D42 separately prevent task/tensor-semantic substitution. Current policies
declare task-v3, tensor-v2, the Forge Y-up frame, ordered targets, canonical task
hash, exact scalar layout, and normalized-flight-target meaning; native and external
worker output, scorecard lineage, ONNX header, WASM observer, and Studio must agree
before export or playback. Task/tensor v1 and task v2 remain historical reads rather
than being silently remapped. Browser
waypoint progression accepts only estimator target-error observations and never
render state or simulator truth. This integrity boundary does not make a short
policy safe, passing, hardware-authoritative, or field-ready.

Consent ledger 1.0.0 records immutable grants and withdrawals separately for
photoscan processing, telemetry sharing, pattern contribution, leaderboard
publication, and training reuse. Each event binds the current notice/version/hash to
one owned subject and prior event. Stale grants are inactive; processing/publication
checks run under the same owner lock as the action. Withdrawal cancels affected
pending photoscan/training jobs, makes telemetry private, and removes pattern or
leaderboard publication rows. This is local primary-plane authority evidence, not a
claim that an already completed provider operation or backup can be recalled.

Data-lifecycle 1.0.0 and deletion receipt 2.0.0 implement D35: six versioned
retention classes, append-only time-bounded legal holds, monotonic authority-event
ordering, domain-separated user/object digests, a 30-day maximum backup window,
45-day restore-suppression tombstones, a catalogued provider deletion adapter with
exact subject-manifest idempotency, bounded retry/stale-claim recovery, and a
mandatory manifest/tombstone pre-restore check. Hold mutation, backup registration/
restore evaluation, and account deletion share globally ordered transaction-scoped
user/object locks so authority cannot race the purge. A hold
permits retention only; it never permits use, sharing, training, or operator browsing.
The local Postgres gate proves user/object holds block deletion, user holds block
retention, releases are causal, pre-deletion backups cannot restore tombstoned
subjects, subject-manifest drift and post-deletion capture are refused, late valid
catalog discovery reopens completion, provider failure/stale claims retry without
private error text, user/audit holds defer named retention targets, closed hold chains
expire causally, and tombstones expire only after backup completion.
Production backup/restore, complete catalog automation, provider receipts, and
measured DR remain `OPS-005`, not an SEC-005 live claim.

Policy defaults follow the storage-limitation and accountability principles in
[GDPR Article 5](https://eur-lex.europa.eu/eli/reg/2016/679/art_5/oj/eng), the erasure
and exception boundary in
[GDPR Article 17](https://eur-lex.europa.eu/eli/reg/2016/679/art_17/oj/eng), and the
catalogue, affirmative-deletion, audit, and restore-test practices in
[NIST SP 800-209](https://csrc.nist.gov/pubs/sp/800/209/final) and
[NIST SP 1339](https://csrc.nist.gov/pubs/sp/1339/final). They remain product defaults
pending jurisdiction-specific counsel review, not universal statutory periods.

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
- [x] User content → append-only current-notice consent/withdrawal per owned subject,
      fail-closed action checks, and bounded withdrawal effects (`SEC-004`, 2026-07-13)
- [x] User content → versioned retention, time-bounded legal holds, pseudonymous
      tombstones, catalogued backup deletion/retry, and pre-restore suppression
      semantics (`SEC-005`, contract/fixture, 2026-07-13; live DR remains `OPS-005`)
- [x] Auth/provider/object/job/worker/release surfaces → canonical threat model,
      fail-closed production config, header-only ephemeral keys, bounded JSON/network/
      process/object/archive behavior, classed single-process rate limits, redaction,
      negative tests, and explicit rotation/deployment guidance (`SEC-006`,
      contract/fixture, 2026-07-13; distributed/live operations remain `OPS-*`)
- [ ] Policy sharing → current dual-use/export-control gate, per-policy signoff, moderation ownership, and external rollout decision (`SEC-007`)
- [ ] Desktop/Link release → signed artifacts, update rollback, pairing/revocation, and fault-injection evidence (`SEC-008`)
