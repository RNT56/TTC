# Studio UI — implementation doc

**Status:** P1 shell live; P4 review operations started · **Phases:** P1 shell, grows every phase · **Home:**
`packages/studio` · **Plan refs:** §5, §6
(v3.0) · **Decisions:** D3, D4, D14, D15, D16

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

## 3. Surfaces by phase

| Phase | Surface |
|---|---|
| P1 | viewport (orbit/follow), configurator pane (variant cards, greyed-with-reason), explode/blueprint/selection controls, jog teach-pendant, pause/frame-step, HUD v0, perf overlay (P1-017) |
| P2 | draft semantics groundwork; validator report viewer (incremental in-WASM checks as you edit) |
| P3 | compatibility explanations on cards; BOM export; lockfile upgrade diff UI (XC-03) |
| P4 | catalog review panel (`GET/PATCH /v1/reviews`, optional `VITE_FORGE_REVIEW_TOKEN`) for owner approval, audit notes, and export-policy decisions before live-ingested rows feed generation; generation panel (`POST /v1/generate`) with template/Anthropic provider selection, BYO key held in session storage, attempt diagnostics, and draft/admitted scene loading; share-URL **read-only viewer** (D4: orbit, explode, blueprint, drive demo — no account); credit/account settings and streamed slot progress remain pending |
| P5 | photoscan alignment UI (known-dimension scale, axis snap, port authoring) |
| P6 | HUD analytics full (AUW/TWR/hover/current/endurance with inspectable assumptions); disturbance controls |
| P7 | training tab: task picker, job status, scorecard renderer (XC-21), policy playback toggle |
| P8 | bridge tab: FC config, ladder UX with physical confirmations, recorder/ghost scrubber; **Desktop**: same bundle + serial/recorder plugin hooks |
| P9–P12 | Pareto-front explorer; course editor/leaderboards; marketplace/classroom; maintenance twin views |

## 4. Local-first persistence *(proposed)*

Contracts + drafts in OPFS/IndexedDB with explicit file export/import (a contract is
a JSON file the user owns); recent-models list; offline queue for server jobs.
Share = upload-on-action (D4), never implicit sync. Anonymous-local mode is
first-class (Auth.js only adds identity for server features). On Desktop, the
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
