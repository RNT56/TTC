# Generation Pipeline (Text-to-CAD) — implementation doc

**Status:** P4 context + validator-loop synthesis + opt-in Claude transport live · **Phases:** P4 (GA), P10 (environments) · **Home:**
`packages/gateway` (orchestrator context, deterministic synthesis, and Anthropic tool-pass adapter live) · **Plan refs:** §8 (v3.0) ·
**Decisions:** D3, D14, D16, D17, D25, D26, D-evals

## 1. Purpose

The loop the studio is named for: natural language → admitted, complete, animated
contract — as an **orchestrated, validator-gated pipeline**, never a single prompt.
Generation quality is an engineering quantity with CI and a dashboard (Brief-25).

P4 starts with the catalog review loop (D25): live fetch/Claude/OCCT ingestion may
draft rows, but generated artifacts can only consume reviewed catalog truth. The
gateway and studio expose the review queue, audit notes, and export-policy filters.
Workers expose injectable source-fetch, Claude-style extraction, and OCCT geometry
adapter seams; fixture adapters are the deterministic CI oracle, while live
transport/executors remain deployment-owned.

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

Live 2026-06-13: `POST /v1/generate/context` implements the deterministic stage-2
context path. It builds a hash-addressed prompt prefix from the emitted schema,
engine docs, and schema-true examples, and retrieves only catalog components with
approved review rows plus non-blocked export policies. It returns
`mode: "context-only"` and blocked reasons when no approved catalog truth matches.

Also live 2026-06-13: `POST /v1/generate` runs the first executable synthesis loop.
The default adapter is deterministic and exemplar-backed so local/CI behavior does
not require live Claude keys. The opt-in Anthropic provider (`provider:
"anthropic"`) calls the Messages API through a strict client-tool pass:
`forge_emit_modelspec` is forced via `tool_choice`, its `input_schema` is the
schemars-emitted ModelSpec schema, and repair calls switch to the D26 repair model
with validator diagnostics in context. Keys are supplied per request through
`x-forge-anthropic-key` or `anthropicApiKey`, or by deployment-owned
`ANTHROPIC_API_KEY`; the gateway never returns the key. Every candidate is run
through `forge-validate`; rejected contracts may be repaired up to three times;
exhausted attempts are re-run with D14 draft semantics and returned with
diagnostics. The route stamps generated contracts with model version, prompt hash,
and seed, returns the validator report, and records admitted/draft/rejected
generations in `generated_artifacts` with the contract, report, attempts, model
pins, and approved-catalog context. `POST /v1/generate/stream` is available as an
SSE-compatible start/complete/error event surface for the studio. Explicit
multi-pass stage splitting remains P4 follow-up work.

## 3. Conversational editing (P4-005)

"Make the arms 20 % longer" / "swap to ducted props" compile to **JSON-Patch
operations** against the live contract, validated incrementally, applied with
rebuild-in-place via the core's patch/re-bake path (explode/jog state preserved;
re-bake ≤ 10 ms). Budget: < 3 s end to end.

## 4. Cost & model discipline (D3)

Frontier tier for full synthesis, high-reasoning tier for repair, smaller tiers for
edits/classification/ETL extraction; **Batch API** for catalog ingestion; **prompt
caching** for the schema prefix; **BYO Anthropic key honored throughout**, metered
credits for keyless users. Model strings, context limits, output caps, and pricing
were pinned on 2026-06-13 from official Anthropic docs and recorded in D26:
`claude-fable-5` for synthesis, `claude-opus-4-8` for repair,
`claude-sonnet-4-6` for edits, and `claude-haiku-4-5-20251001` for ETL. The gateway
exposes the executable pin set at `GET /v1/generate/models`.

## 5. Brief-25 — generation quality as CI (D-evals, P4-009/010)

Twenty-five canonical briefs spanning archetypes, scales, and real-part constraints,
run as a **permanent regression suite** on every prompt change, schema change,
pattern-library update, and LLM model-version bump. Tracked: admission rate (GA gate:
≥ 20/25 without human repair), repair-iteration count, diversity metrics — on a
dashboard, over time. A model bump that regresses the dashboard does not ship.

Live scaffold: [`evals/brief25.corpus.json`](../../evals/brief25.corpus.json)
holds the 25 canonical briefs. `pnpm eval:brief25` runs the deterministic template
provider through the gateway generation loop with fixture catalog rows and writes a
machine-readable report to `artifacts/evals/brief25-latest.json`. CI runs the same
script in real-validator mode and uploads `brief25-ci.json`; the time-series
dashboard remains follow-up work.

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
WASM + binary), component DB (retrieval + componentRefs), review queue API
(`GET /v1/reviews`, `PATCH /v1/reviews/:id` with audit/export policy),
`POST /v1/generate/context`, `POST /v1/generate`, `POST /v1/generate/stream`,
`generated_artifacts`, injectable synthesis/source/Claude/OCCT adapters, Anthropic API, `studio` (BYO-key settings, streaming
viewport, draft UX XC-16).

## 9. Testing

Brief-25 (the centerpiece); generation context tests; adapter-fixture ingestion tests; diagnostic-consumption unit tests (every harness check ID
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
