# prototype/ — the executable specification (PRE-002)

**Status: DELIVERED 2026-06-12** by the project owner; committed byte-exact and
tagged **`prototype-final`**.

| Fact | Value |
|---|---|
| File | `cad-object-studio.html` (50,967 bytes) |
| sha256 | `ca93489e05df87f94c0da0aacbedfd41a24274b19ab5a440df46bee3d5d21cbe` |
| Models | `hrx7` — HRX-7 Mk II humanoid · `fpv` — VX-2 Hornet quad |
| Extracted counts | hrx7: **125 parts · 2195 faces · 2581 vertices · 20 nodes · 15 chains** · fpv: **73 parts · 924 faces · 1250 vertices · 14 nodes · 13 chains** (`extracted-counts.json`, via `scripts/extract-counts.mjs`) |

## Vintage note (recorded honestly)

This is the **pre-configurator build**: it carries the node/part registry
(`N`/`P` with explode windows + leader flags), the chains table, the idle poses,
the biped gait + closed-form 2-bone IK (L1 = L2 = 0.39 — Appendix C verbatim),
the FPV angle-mode driver + per-motor mixer, servo settle (ω 14–16, ζ 0.8–0.85),
blueprint mode, jog, and click-to-move — but **not** the slot/variant
configurator (31 variants / 11 slots), port tables, procedural bellows,
squircle/loft primitives, or the headless harness that plan §3 audits in the
**~83 KB** build. If that later build exists, deliver it the same way and it
supersedes the variant-related gates (P0-007); if it does not, P0-007 is
re-scoped by a decision entry.

The drone's original "combat" naming flavor is preserved here byte-exact (freeze
rules) and does **not** survive into translations or the product (plan §17.2).

## Freeze rules (binding, plan §3 + D21)

1. Committed **byte-exact as received** — never reformatted, never fixed.
2. Tagged `prototype-final`; never modified after. Corrections of understanding
   go in docs, never here.
3. Extraction (P0-008) evaluates **copies** of its code (`scripts/
   extract-counts.mjs` slices the pure builder segment into a Node vm sandbox);
   nothing ever touches the file.

## The pipeline it anchors

| Step | Status |
|---|---|
| P0-008 extraction — part/face/vertex counts | **done** → `extracted-counts.json` |
| P0-008 extraction — recorded trajectories (gait/flight tapes for golden numbers) | open |
| P0-005/006 translations — hrx7 + fpv → `ModelSpec` JSON | open (now unblocked) |
| P0-004 byte-equivalence — `scripts/compare-counts.mjs` extraction vs `forge-validate bake` | runner ready; runs when translations land |
| P1-006 golden-number corpus | gated on trajectory recording |
