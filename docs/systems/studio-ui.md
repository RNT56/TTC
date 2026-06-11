# Studio UI — implementation doc

**Status:** not started · **Phases:** P1 shell, grows every phase · **Package:**
`packages/studio` *(proposed — the only React package)* · **Plan refs:** §5, §6 ·
**Decisions:** D3, D4, D11, D14

## 1. Purpose

The browser studio shell: React 19 + Zustand hosting the engines, the configurator,
the HUD, and every later surface (training, courses, bridge, co-design). **Local-
first**: contracts live on the user's machine; viewing, configuring, validating, and
simulating work offline — the server is for generation, heavy geometry, training,
catalog, sharing.

## 2. State architecture (the one rule that matters)

**Loop state stays out of React.** Render/motion/physics state lives in engine
stores + SharedArrayBuffer mirrors, sampled by the UI at UI cadence (≤ 2 ms budget).
Zustand holds document/UI state: open contract, selection, pane layout, equip state,
job notifications. React renders panes and forms — never the 3D frame.

## 3. Surfaces by phase

| Phase | Surface |
|---|---|
| P1 | viewport (orbit/follow), configurator pane (variant cards, greyed-with-reason), explode/blueprint/selection controls, jog teach-pendant, pause/frame-step, HUD v0, perf overlay (P1-012) |
| P2 | draft semantics groundwork; validator report viewer |
| P3 | compatibility explanations on cards; BOM export; lockfile upgrade diff UI (XC-03) |
| P4 | generation chat + streaming slots into viewport; draft-state UX (XC-16); share-URL **read-only viewer** (D4: orbit, explode, blueprint, drive demo — no account); BYO-key + credits settings (D3) |
| P5 | photoscan alignment UI (known-dimension scale, axis snap, port authoring) |
| P6 | HUD analytics full (AUW/TWR/hover/current/endurance with inspectable assumptions); disturbance controls |
| P7 | training tab: task picker, job status, scorecard renderer (XC-21), policy playback toggle |
| P8 | bridge tab: FC config, ladder UX with physical confirmations, recorder/ghost scrubber |
| P9–P12 | Pareto-front explorer; course editor/leaderboards; marketplace/classroom; maintenance twin views |

## 4. Local-first persistence *(proposed)*

Contracts + drafts in OPFS/IndexedDB with explicit file export/import (a contract is
a JSON file the user owns); recent-models list; offline queue for server jobs.
Share = upload-on-action (D4), never implicit sync. Anonymous-local mode is
first-class (Auth.js only adds identity for server features).

## 5. Browser floor (D11)

Chromium-first: COOP/COEP for SharedArrayBuffer, WebSerial for the bridge.
Firefox/Safari: viewer-grade — feature-detect and degrade with *stated* capability
messaging, not silent breakage. iOS: viewer. The share-URL viewer (D4) must work
everywhere viewer-grade.

## 6. Budgets

≤ 2 ms UI inside the frame; cold load < 2.5 s to interactive (code-split engines,
lazy OCCT/ONNX); rebuild-in-place preserves explode/jog state on equip (the
prototype's proven interaction).

## 7. Dependencies

All engine packages, `contract`, gateway client. Hosts ONNX Runtime Web playback and
the recorder views.

## 8. Testing

Playwright smoke flows per phase exit criterion (open → orbit → equip → explode;
share-link logged-out view at P4); state-architecture lint (no engine imports into
React render paths *(proposed: eslint rule)*); pane snapshot tests; perf overlay
assertions on canonical scenes.

## 9. Open questions

React vs Solid revisit after P1 profiling (OD-02, P1-013); pane system build-vs-adopt
(dockable layout libs vs thin custom); photoscan alignment UI ship timing (OD-07).
