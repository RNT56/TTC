# Platform — sharing, marketplace, classroom, maintenance twin

**Status:** not started · **Phases:** P4 (sharing), P11 (platform), P12 (maintenance
twin) · **Home:** gateway + studio *(proposed)* · **Plan refs:** §2, §14.2, §16 ·
**Decisions:** D2, D3, D4, D10, D12-adjacent

## 1. Purpose

The community and lifecycle layer on top of an already-useful single-player studio.
Deliberately last (scope-gravity defense): sharing ships early (P4) because it is
nearly free and is the growth loop; transactions, education, and lifecycle products
ship when the loop beneath them is real.

## 2. Sharing (P4 — D4)

Read-only contract URLs: any model renders for anyone with the link — orbit, explode,
blueprint, drive demo — **no account required**, viewer-grade on every browser
(D11). Implementation: public share id → contract snapshot (hash-pinned + lockfile)
→ the studio's viewer mode. Drafts cannot be shared (D14).

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
- Economics decided inside P11 with real usage data (OD-05); pattern-library
  contribution terms per D2 (marketplace listings opt-in by default).

## 4. Classroom mode (P11-004)

Briefs become assignments; **the gatekeeper becomes the grader**: an instructor
authors a brief + rubric (validator config + scorecard thresholds); students submit
contracts and policies; grading is automatic, explainable, and **identical to
production admission**. Education is a sim-only-safe beachhead with real budgets.

## 5. BOM agent & print ordering (P11-005/006)

BOM agent resolves catalog slots to live vendor offers. Printed structural parts:
DfM-passing parts export as oriented 3MF with print profiles and hand off to
print-service APIs (Craftcloud-class aggregators) — the BOM gains a "printed parts"
section, closing *build it* for custom geometry. Liability posture: we transmit
geometry and recommended profiles; the service and the user own print outcomes.

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

## 7. Accounts & tiers (P11-001; D3)

Auth.js; anonymous-local stays first-class. Free forever: view, configure, validate,
local-sim. Paid: metered credits (GPU jobs, keyless generation), training passes,
catalog pro (price tracking, availability alerts), marketplace fees.

## 8. Dependencies

Everything below it: registries, validation reports, scorecards/lineage, component
DB + license ledger (export rules apply to listings), DfM module, recorder logs
(maintenance twin), courses (community).

## 9. Testing

Share-link anonymous render (P4 exit criterion); listing-without-report rejection;
skill transfer-compatibility checks (header matching); classroom grading equivalence
(same artifact, same verdict as production admission); print-handoff contract tests
against a sandbox aggregator API; wear-model unit tests on synthetic logs.

## 10. Open questions

Marketplace economics (OD-05); listing curation vs pure gatekeeper admission at
launch; classroom LMS integrations (defer); fleet view scope (solo fleets first).
