# Platform — sharing, marketplace, classroom, maintenance twin

**Status:** P4 sharing/accounts/model registry live; P11/P12 gates, usage beta, and quote/link commerce scaffolds live behind local routes · **Phases:** P4 (sharing), P11 (platform), P12 (maintenance
twin) · **Home:** gateway + studio · **Plan refs:** §2, §14.2, §16
(v3.0) · **Decisions:** D2, D3, D4, D10, D15, D29, D12-adjacent

## 1. Purpose

The community and lifecycle layer on top of an already-useful single-player studio.
Deliberately last (scope-gravity defense): sharing ships early (P4) because it is
nearly free and is the growth loop; transactions, education, and lifecycle products
ship when the loop beneath them is real.

## 2. Sharing (P4 — D4)

Read-only contract URLs: any model renders for anyone with the link — orbit, explode,
blueprint, drive demo — **no account required**, viewer-grade on every browser
(D15; sharing is the standing argument for the web face). Implementation: public
share id → contract snapshot (hash-pinned + lockfile) → the studio's viewer mode.
Drafts cannot be shared (D14).

Live 2026-06-14: authenticated `POST /v1/models/:id/share` writes immutable
`share_snapshots` for admitted models only. Public `GET /v1/share/:shareId` returns
the viewer contract without auth, and the studio can open server-backed share URLs
via the `?share=` query parameter. Draft and rejected artifacts fail closed.

## 3. Marketplace (P11)

- **Model listings**: admitted contracts only; the **validator report ships with the
  listing** — the gatekeeper is what makes a marketplace possible at all.
- **Skills listings** (P11-003): ONNX + derived I/O header + scorecard ("gate-slalom
  v3 · success 94 % across the randomization grid") + training lineage. Transfer
  honesty: same archetype + compatible observation layout transfers directly;
  otherwise the listing offers a **fine-tune job against the buyer's twin**.
- **Entry gate**: dual-use/export-control sanity check before policy sharing
  ([`security-safety-legal.md`](../security-safety-legal.md) §3); **UGC moderation
  policy ships with the marketplace** (report flow, takedown SLA, repeat-infringer
  rule).
- Economics launch as D29 usage beta: no seller payouts, no revenue share, no direct
  marketplace checkout, and GPU jobs retain credit cost-plus until real usage
  thresholds justify a new decision. Pattern-library contribution terms per D2
  (marketplace listings opt-in by default).

Live 2026-06-14: `marketplace_listings` plus `GET/POST /v1/listings` provide the
local listing scaffold. Listing creation is authenticated and requires an admitted
model report; policy/skill listings require an explicit dual-use/export-control
signoff recorded in `policy_signoffs` after the `p11.policy-sharing` platform gate
is accepted. `POST /v1/listings/:id/usage` records usage-beta views, equips, quote
clicks, policy downloads, and training jobs into marketplace rollups. `GET/POST
/v1/moderation/reports` records user reports with a 72-hour SLA target and
repeat-infringer signal. Seller payouts and revenue share are intentionally absent.
Owner-scoped `object_blobs` registration and S3/MinIO presigned access are live via
`/v1/blobs`, giving photos, policies, telemetry, renders, and mesh artifacts a
shareable storage contract without exposing the bucket publicly.

`GET /v1/platform/gates` exposes current `d28.hardware`,
`p11.policy-sharing`, and `p11.marketplace-economics` signoff state for Studio and
ops surfaces. Signoff mutation is admin/review-token protected.

## 4. Classroom mode (P11-004)

Briefs become assignments; **the gatekeeper becomes the grader**: an instructor
authors a brief + rubric (validator config + scorecard thresholds); students submit
contracts and policies; grading is automatic, explainable, and **identical to
production admission**. Education is a sim-only-safe beachhead with real budgets —
and **`forge-validate` as a free binary makes institutional adoption frictionless**
(D2/D17): a classroom can run the exact grader locally, no account needed.

Live 2026-06-14: `classroom_assignments` and `classroom_submissions` are backed by
`GET/POST /v1/classroom/assignments` and
`GET/POST /v1/classroom/assignments/:id/submissions`. Submissions can reference a
saved model or upload a contract; the gateway runs the same validator, applies the
stored rubric, and persists the validator report plus grade object.

## 5. BOM agent & print ordering (P11-005/006)

BOM agent resolves catalog slots to live vendor offers. Printed structural parts:
DfM-passing parts export as oriented 3MF with print profiles and hand off to
print-service APIs (Craftcloud-class aggregators) — the BOM gains a "printed parts"
section, closing *build it* for custom geometry. Liability posture: we transmit
geometry and recommended profiles; the service and the user own print outcomes.

Live 2026-06-14: `vendor_offers`, `print_quote_requests`, and
`print_quote_offers` back `GET /v1/commerce/vendor-offers`, `POST
/v1/commerce/vendor-offers/refresh`, `GET /v1/commerce/print-quotes`, and `POST
/v1/commerce/print-quotes`. Provider checkout is always off-platform; no payment or
payout ledger exists in this slice.

## 6. Maintenance twin (P12)

After deployment the model becomes the living manual:
- **Wear estimates** from telemetry: motor hours, pack cycle counts and
  internal-resistance drift from logged sag (P12-001).
- **Crash forensics**: scrub the last seconds, watch where the ghost separated
  (P12-002).
- **Repair sheets**: damage assessment maps to the explode view as **repair steps in
  chain order with reorder links** — a logged crash produces an actionable repair
  sheet with parts in the cart (P12-003, the phase exit criterion).
- **Fleet view** for multi-machine users (P12-004).

The model outlives the build — and pulls the user back into the loop where the
flywheel spins again.

Live 2026-06-14: `telemetry_logs`, `maintenance_records`, and
`/v1/maintenance/records` provide the authenticated record scaffold. Worker jobs now
compute wear estimates, crash windows, ordered repair sheets with reorder SKUs, and
fleet service summaries; fixture job creation materializes matching outputs into
the data-plane tables. Studio can refresh vendor quote/link handoffs from repair
SKUs without direct carts. The remaining P12 work is the full Studio scrubber/fleet
UI and live reorder integrations.

## 7. Accounts & tiers (P11-001; D3)

Auth.js; anonymous-local stays first-class. Free forever: view, configure, validate,
local-sim. Paid: metered credits (GPU jobs, keyless generation), training passes,
catalog pro (price tracking, availability alerts), marketplace fees.

Live 2026-06-14: the Fastify gateway exposes `/auth/*` through Auth.js core with the
Postgres adapter schema, GitHub OAuth provider wiring, `/v1/me`, user-owned
`model_registry`, `credit_accounts`, `credit_ledger`, and `usage_events`. Local tests
can use the explicit development header path; production auth is cookie/session
based.

## 8. Dependencies

Everything below it: Auth.js Postgres tables, registries, validation reports,
share snapshots, scorecards/lineage, component DB + license ledger (export rules
apply to listings), DfM module, recorder logs (maintenance twin), courses
(community).

## 9. Testing

Share-link anonymous render (P4 exit criterion); listing-without-report rejection;
platform-gate fail-closed behavior; skill transfer-compatibility checks (header
matching); classroom grading equivalence (same artifact, same verdict as production
admission); vendor/print quote-link contract tests against a sandbox aggregator API;
wear-model unit tests on synthetic logs.

## 10. Open questions

Listing curation vs pure gatekeeper admission at launch; classroom LMS integrations
(defer); fleet view scope (solo fleets first); the next marketplace economics
threshold decision after D29 usage data accumulates.
