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
reach the client; BYO Anthropic keys are client-held and per-request.

**Bridge safety = security.** The bridge never auto-arms; ladder transitions require
deliberate physical confirmation; pairing-code auth for FORGE Link; the supervisor
(≥ 200 Hz) can always veto the policy (~50 Hz advisory) and owns the fallback (D9).

## 2. Platform exclusions (absolute)

FORGE excludes weapons: **no targeting systems, munition payloads, or interdiction
modules** in the catalog, the generation pipeline, or the marketplace. Briefs in that
direction are refused **and the refusal is logged**. The prototype's "combat" naming
flavor does not survive into the product — purge it during P0 translation (check
naming in translated contracts).

## 3. Legal gates (entry conditions, not posture)

| Gate | When | What must happen before the phase ships |
|---|---|---|
| **ToS / liability review** | entry to **P8** | counsel reviews: deployment-ladder UX, safety-supervisor disclaimers, telemetry consent language. No hardware-deployment feature ships first. Record sign-off in DECISIONS. |
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

## 6. Operating reality (what we tell users)

The studio surfaces, but does not adjudicate, airspace and robotics rules — EU drone
classes, Remote ID, RF regulation — with jurisdiction-aware pointers. Operation
remains the user's responsibility, and the deployment-ladder gates repeat it. Print
ordering transmits geometry and recommended profiles; print outcomes belong to the
service and the user. Scorecards are honest about what they measure: we promise a
rigorous rehearsal space and a supervised path onto hardware the user owns; **we do
not promise any policy is safe in the open world**, and the UX says so at every gate.

## 7. Engineering checklist (apply to any PR in these areas)

- [ ] New invariant → harness check with stable ID + doc update
- [ ] Generated artifact path → provenance fields populated and validated
- [~] Export path → license class/export policy consulted; envelope fallback works in the ingestion/review slice, exporter enforcement still pending
- [x] Catalog ingestion → per-field citations + license ledger entry + review queue
- [ ] Bridge/deployment surface → no auto-arm path; physical confirmation; supervisor
      authority preserved; D9 rates stated in UX copy
- [ ] Generation surface → weapons-brief refusal path intact and logged
- [ ] User content (photos/logs/models) → consent and deletion semantics honored
