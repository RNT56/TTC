# Generation Pipeline (Text-to-CAD) — implementation doc

**Status:** not started · **Phases:** P4 (GA), P10 (environments) · **Home:**
`packages/gateway` (orchestrator) *(proposed)* · **Plan refs:** §8 (v3.0) ·
**Decisions:** D3, D14, D16, D17, D-evals

## 1. Purpose

The loop the studio is named for: natural language → admitted, complete, animated
contract — as an **orchestrated, validator-gated pipeline**, never a single prompt.
Generation quality is an engineering quantity with CI and a dashboard (Brief-25).

## 2. The five stages (P4-001)

1. **Intent parse** — user message + studio context → structured brief (archetype,
   scale, mass budget, style tags, real-part preferences).
2. **Retrieval** — pgvector over the component catalog and the **pattern library**
   (validated part-group idioms harvested from admitted models under the D2 consent
   terms, XC-13); retrieved exemplars ride along as schema-true few-shot context; the
   **schemars-emitted schema** + engine docs sit in a **prompt-cached prefix**
   (XC-14) — the same schema artifact `forge-contract` is built from (D16).
3. **Constrained synthesis** — Claude emits *only* contract JSON via tool use with
   the JSON Schema enforced. **Multi-pass emission order:** skeleton + slots + ports
   + driver params first; per-slot parts second; materials/explode/sim third. Small
   emissions are checkable and cheap to repair; slots stream into the viewport as
   they validate (60 s budget).
4. **Validator in the loop** — every pass runs `forge-validate` (in-process WASM for
   instant feedback, the binary in CI — **same bits, D17**); failures return as
   machine-readable diagnostics (the [`validation-harness.md`](validation-harness.md)
   §4 format: `ground_penetration: an1 −4.2 mm @ phase 0.31`,
   `port_unresolved: XT60@batt`, `collider_budget: 31 > 24`); the model self-repairs,
   **bounded at three iterations**.
5. **Admission or draft (D14)** — passing contracts are provenance-stamped (model
   version, prompt hash, seed, validator report) and admitted; exhausted repairs
   persist as **editable drafts** carrying diagnostics — drafts render and edit but
   cannot train, export, or share.

## 3. Conversational editing (P4-005)

"Make the arms 20 % longer" / "swap to ducted props" compile to **JSON-Patch
operations** against the live contract, validated incrementally, applied with
rebuild-in-place via the core's patch/re-bake path (explode/jog state preserved;
re-bake ≤ 10 ms). Budget: < 3 s end to end.

## 4. Cost & model discipline (D3)

Frontier tier (Fable-5 class) for full synthesis and repair reasoning; smaller tiers
(Sonnet/Haiku class) for edits, classification, ETL extraction; **Batch API** for
catalog ingestion; **prompt caching** for the schema prefix; **BYO Anthropic key
honored throughout**, metered credits for keyless users. Model strings, context
limits, and pricing are **pinned at implementation time** from
https://docs.claude.com/en/api/overview and recorded in DECISIONS (P4-011) — they
move faster than any planning document.

## 5. Brief-25 — generation quality as CI (D-evals, P4-009/010)

Twenty-five canonical briefs spanning archetypes, scales, and real-part constraints,
run as a **permanent regression suite** on every prompt change, schema change,
pattern-library update, and LLM model-version bump. Tracked: admission rate (GA gate:
≥ 20/25 without human repair), repair-iteration count, diversity metrics — on a
dashboard, over time. A model bump that regresses the dashboard does not ship.

## 6. Environment generation (P10, §8.5)

The same pipeline with a smaller schema: text → EnvSpec (terrain, gates, obstacles,
win conditions) through the same gatekeeper pattern (ENV-* checks). Design the
orchestrator schema-generic now (P4-013); ship env generation with P10.

## 7. Ambient intelligence (later phases)

Embedding search across models/parts/patterns/courses/skills; **BOM agent** resolving
catalog slots to live vendor offers (P11); **doc agent** compiling any admitted model
into a build sheet — exploded steps in chain order, fastener counts from port
resolution, wire list from electrical ports.

## 8. Dependencies

`forge-contract` (schemars schema + types), `forge-validate` (the repair oracle —
WASM + binary), component DB (retrieval + componentRefs), Anthropic API, `studio`
(streaming viewport, draft UX XC-16).

## 9. Testing

Brief-25 (the centerpiece); diagnostic-consumption unit tests (every harness check ID
must be repairable-or-surfaced — no diagnostic the orchestrator can't route);
fuzz briefs (adversarial, dimensional extremes) with failures minimized into
regression cases (XC-24); patch-editing round-trip tests; provenance completeness
(PRV-001) on every admitted artifact.

## 10. Phase mapping & backlog

P4: P4-001..013, XC-13/14/15/16. P10: env generation. P11: BOM/doc agents.

## 11. Open questions

Exact multi-pass tool-schema decomposition (one tool per pass vs one tool with a
`pass` discriminator); repair-context window management across iterations (full
history vs last-diagnostics-only); how drafts surface in search (likely: private
only).
