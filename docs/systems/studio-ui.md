# Studio UI — implementation doc

**Status:** P1 shell and truthful equipped-variant configurator live; P4 account/model/generation/share/review/job panels live; output-aware heavy-job artifact registry and platform panels live · **Phases:** P1 shell, grows every phase · **Home:**
`packages/studio` · **Plan refs:** §5, §6
(v3.0) · **Decisions:** D3, D4, D14, D15, D16, D32, D34

## 1. Purpose

The browser studio shell: React 19 + Zustand hosting the render layer, the core
facade, the configurator, the HUD, and every later surface (training, courses,
bridge, co-design). **Local-first**: contracts live on the user's machine; viewing,
configuring, validating (in-WASM, instant), and simulating work offline — the server
is for generation, heavy geometry, training, catalog, sharing. The same bundle runs
inside FORGE Desktop's webview at P8 (D15).

## 2. State architecture (the one rule that matters)

**Truth stays in the core; loop state stays out of React.** The core facade owns
bake/tick/validate/patch (architecture §2); render/physics state lives in the
facade's shared regions, sampled by the UI at UI cadence (≤ 2 ms budget). Zustand
holds document/UI state: open contract, selection, pane layout, equip state, job
notifications. React renders panes and forms — never the 3D frame, and never
geometry math.

In the local Compose profile the Studio calls `/v1` and `/auth` on its own origin;
Vite proxies those paths to the gateway service through `FORGE_GATEWAY_PROXY`. This
preserves cookie/header behavior without inventing a second CORS security surface.

## 3. Surfaces by phase

| Phase | Surface |
|---|---|
| P1 | viewport (orbit/follow), configurator pane (variant cards, greyed-with-reason), explode/blueprint/selection controls, jog teach-pendant, pause/frame-step, HUD v0, perf overlay (P1-017) |
| P2 | draft semantics groundwork; validator report viewer (incremental in-WASM checks as you edit) |
| P3 | compatibility explanations on cards; BOM export; lockfile upgrade diff UI (XC-03) |
| P4 | account/session panel (`/v1/me`, Auth.js GitHub links), model registry save/list, deterministic edit prompt (`POST /v1/models/:id/edit`), server-backed admitted-only share (`?share=` viewer + public `/v1/share/:shareId`), catalog review panel (`GET/PATCH /v1/reviews`), generation panel using staged SSE (`POST /v1/generate/stream`) with template/Anthropic provider selection, BYO key in session storage, attempt diagnostics, draft/admitted scene loading, Brief-25 eval summary; expandable D34 privacy-authority panel shows exact notices and independent grant/withdraw state |
| P5 | owned-upload-backed photoscan launcher requires explicit per-object processing consent, then renders D13/refit/cache/candidate details, linked blob access, recent photoscan artifacts, and editable alignment controls/readout for scale, axis, and ports; mesh-click placement remains polish |
| P6 | HUD analytics full (AUW/TWR/hover/current/endurance with inspectable assumptions); disturbance controls |
| P7 | fixture training job output renders scorecard, robustness grid, IO counts, ONNX metadata, linked policy artifacts, owner-scoped artifact access, one-click CoreSession policy playback, and explicit per-log consent before telemetry-backed training; full training tab and live ONNX Runtime inference remain open |
| P8 | D30 lab-gated hardware bridge; config-diff, telemetry/replay, supervisor, system-ID, crash/ghost metadata, replay artifacts, telemetry logs, and maintenance records render in job/artifact panels; per-log sharing grant/withdraw and explicit share action are available; WebSerial write, ladder UX, recorder/ghost scrubber and **Desktop** serial/recorder plugins remain open |
| P9–P12 | fixture co-design Pareto points, wear, crash, repair, and fleet outputs render in job details; co-design points can apply admitted JSON-Patch candidates through patch/re-bake and save admitted points as openable models through the model admission route; platform panel covers credits, license ledger/export-policy visibility, editable course creation, `?course=<id>` course URLs, replay-verified leaderboard filtering, classroom assignment/submission, marketplace kind/status filtering with row-level usage/equip actions, listing/policy-listing submission, and moderation reports; D34 requires explicit per-model pattern contribution and account-level leaderboard publication grants before those actions; artifact panel includes the maintenance twin dashboard with fleet counts, crash scrubber, wear cards, repair rows, reorder hints, and vendor/print handoff links; live optimizer-backed Pareto depth and live marketplace/provider economics remain open |

Variant cards are not presentation-only state. XC-28 makes the equipped variant
explicit in ModelSpec 2.2. A card change patches only `equippedVariantId`, re-bakes
and re-validates in place, preserves camera/explode/jog state, and preserves selection
by stable source JSON Pointer with same-node fallback. Cards disclose whether an
alternative is inline or catalog-backed; an unpinned catalog ref states that lockfile
resolution is required before admission. Studio never infers the equipped choice from
array order or applies every listed variant.

## 4. Local-first persistence *(proposed)*

Contracts + drafts in OPFS/IndexedDB with explicit file export/import (a contract is
a JSON file the user owns); recent-models list; offline queue for server jobs.
Share = upload-on-action (D4), never implicit sync; fragment shares remain a local
fallback. Anonymous-local mode is first-class (Auth.js only adds identity for server
features). On Desktop, the
filesystem plugin supersedes OPFS for log archives (P8-013).

## 5. Browser floor & surfaces (D15)

Browser is the primary surface, permanently. Full studio requires the Chromium floor
(COOP/COEP for shared memory). Firefox/Safari: viewer-grade — feature-detect and
degrade with *stated* capability messaging, not silent breakage. iOS: viewer. The
share-URL viewer (D4) must work everywhere viewer-grade. FORGE Desktop wraps this
same bundle for the bridge/power jobs.

## 6. Budgets

≤ 2 ms UI inside the frame; cold load < 2.5 s to interactive (code-split, lazy
ONNX/CSG, streaming WASM compile of the ≤ 2 MB facade); rebuild-in-place via the
core patch path preserves explode/jog state on equip (the prototype's proven
interaction, ≤ 10 ms re-bake).

## 7. Dependencies

The core facade (`forge-wasm`), codegen'd contract types, gateway client, ONNX
Runtime Web, recorder views (P8).

## 8. Testing

Playwright smoke flows per phase exit criterion (open → orbit → equip → explode;
share-link logged-out view at P4); state-architecture lint (no geometry/physics math
in React paths *(proposed: eslint rule)*); pane snapshot tests; perf overlay
assertions on canonical scenes.

## 9. Open questions

Pane system build-vs-adopt (dockable layout libs vs thin custom); photoscan
alignment UI ship timing (OD-07); viewer-grade fallback for non-SAB browsers (the
share viewer must run there — likely single-threaded facade build *(proposed)*).
