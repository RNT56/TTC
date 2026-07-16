# Studio UI — implementation doc

**Status:** P1 shell and truthful equipped-variant configurator live; P4 account/model/generation/share/review/job panels live; output-aware heavy-job artifact registry and platform panels live · **Phases:** P1 shell, grows every phase · **Home:**
`packages/studio` · **Plan refs:** §5, §6
(v3.0) · **Decisions:** D3, D4, D14, D15, D16, D32, D34, D41

## 1. Purpose

The browser studio shell: React 19 + Zustand hosting the render layer, the core
facade, the configurator, the HUD, and every later surface (training, courses,
bridge, co-design). **Local-first**: contracts live on the user's machine; viewing,
configuring, validating (in-WASM, instant), and simulating work offline — the server
is for generation, heavy geometry, training, catalog, sharing. The same bundle runs
inside FORGE Desktop's webview at P8 (D15).

The WASM facade intentionally carries no proprietary platform catalog. Studio always
runs the local validator when loading a contract. For a catalog-backed model returned
by the gateway, it retains the catalog-aware native report only when the local report
proves the same non-empty contract hash, report format, schema version, and validator
version; any mismatch falls back to the local fail-closed verdict. The displayed
`target` therefore states whether the active verdict is `wasm` or `native` rather than
implying offline catalog authority.

The shared gateway client advertises `application/json` only for requests that
actually carry a string JSON body. Bodyless mutations such as admitted-model sharing
must reach the route's authorization and status guard; an empty JSON content type
would make Fastify reject the transport before those product invariants execute.

## 2. State architecture (the one rule that matters)

**Truth stays in the core; loop state stays out of React.** The core facade owns
bake/tick/validate/patch (architecture §2); render/physics state lives in the
facade's shared regions, sampled by the UI at UI cadence (≤ 2 ms budget). Zustand
holds document/UI state: open contract, selection, pane layout, equip state, job
notifications. React renders panes and forms — never the 3D frame, and never
geometry math.

In the local Compose profile and production-preview acceptance surface, the Studio
calls `/v1` and `/auth` on its own origin; Vite proxies those paths to the gateway
service through `FORGE_GATEWAY_PROXY`. This preserves cookie/header behavior without
inventing a second CORS security surface.

## 3. Surfaces by phase

| Phase | Surface |
|---|---|
| P1 | viewport (orbit/follow), configurator pane (variant cards, greyed-with-reason), explode/blueprint/selection controls, jog teach-pendant, pause/frame-step, HUD v0, perf overlay (P1-017) |
| P2 | draft semantics groundwork; validator report viewer (incremental in-WASM checks as you edit) |
| P3 | compatibility explanations on cards; BOM export; lockfile upgrade diff UI (XC-03) |
| P4 | account/session panel (`/v1/me`, Auth.js GitHub links), model registry save/list, deterministic edit prompt (`POST /v1/models/:id/edit`), server-backed admitted-only share (`?share=` viewer + public `/v1/share/:shareId`), catalog review panel (`GET/PATCH /v1/reviews`), generation panel using staged SSE (`POST /v1/generate/stream`) with template/Anthropic provider selection, BYO key in session storage, attempt diagnostics, draft/admitted scene loading, Brief-25 eval summary; expandable D34 privacy-authority panel shows exact notices and independent grant/withdraw state |
| P5 | owned-upload-backed photoscan launcher requires explicit per-object processing consent, then renders D13/refit/cache/candidate details, linked blob access, recent photoscan artifacts, and editable alignment controls/readout for scale, axis, and ports; mesh-click placement remains polish |
| P6 | HUD analytics full (AUW/TWR/hover/current/endurance with inspectable assumptions); disturbance controls |
| P7 | training output renders scorecard, robustness grid, IO counts, ONNX metadata, linked policy artifacts, owner-scoped artifact access, and explicit per-log consent before telemetry-backed training; one click selects the active admitted model, starts the fixture or configured-local job with an idempotency key, polls to terminal state, and fetches retained bytes through the authenticated same-origin policy-model route; playback lazy-loads exact ONNX Runtime Web 1.27.0/WASM, verifies the declared `forge-policy-tensor` major plus scorecard/lineage/model/delivery digest, selects Rust estimator observer v1 or v2, and feeds bounded actions to CoreSession at 50 Hz; D42 makes tensor-v2 `[1,14]` current with estimator body velocity while retaining exact v1 `[1,11]` read execution; current task-v3 consumers verify frame/hash/control authority and advance bounded waypoint chains only from estimator target error; the controlled hover trainer is protected through PR #64, P7-011 object-backed delivery through PR #68/`9131289`, the waypoint trainer/consumer through PR #70/`f220d25`, P7-012 implementation/evidence through PR #72/`8e094c0` and PR #73/`6bfa60f`, and D44's worker-side ground trainers through PR #75/`90b1691`; the flight-only browser consumer explicitly refuses `forge-ground-policy-tensor` until a reviewed ground observer/actuator exists; exact passing-policy delivery integration, a full training workspace, rover/quadruped browser loading, deployed training, and production storage operations remain open |
| P8 | D30 lab-gated hardware bridge; config-diff, telemetry/replay, supervisor, system-ID, crash/ghost metadata, replay artifacts, telemetry logs, and maintenance records render in job/artifact panels; per-log sharing grant/withdraw and explicit share action are available; protected Desktop serial target/readback exists and D50's native background-recorder/archive is protected at local recorder-integration maturity through PR #87/`d8afe7f`; D51 protects a Desktop-only path input, native streaming verifier, and strict bounded archive-self-consistency summary with device/field/sharing/training nonclaims through PR #89/`b5418ac`; recorder status/start/stop controls, object-backed gateway materialization, WebSerial/WebUSB, ladder UX, ghost scrubber, real adapter/device capture, and field proof remain open |
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

D51 keeps local archive bytes outside React. The shared Studio bundle imports exact
`@tauri-apps/api` 2.11.1 and exposes its archive panel only as an available action
when the official Tauri runtime is present. Browser builds display the Desktop-only
boundary and never fall back to a gateway or browser filesystem guess. The frontend
sends one trimmed absolute path under command key `archivePath`, requires the exact
versioned response field set and numeric/hash/privacy bounds, and treats any added,
missing, promoted, or unsupported response as an error. The displayed “verified”
label means native local self-consistency only; the adjacent copy explicitly refuses
device identity, field-session, sharing, and training authority.

## 5. Browser floor & surfaces (D15)

Browser is the primary surface, permanently. Full studio requires the Chromium floor
(COOP/COEP for shared memory). Firefox/Safari: viewer-grade — use the dependency-light
Canvas2D schematic projected from core-baked part centers, with *stated* capability
messaging and no Three.js/WebGL chunk load. iOS: viewer. The
share-URL viewer (D4) must work everywhere viewer-grade. FORGE Desktop wraps this
same bundle for the bridge/power jobs.

## 6. Budgets

≤ 2 ms UI inside the frame; cold load < 2.5 s to interactive (code-split, lazy
ONNX/CSG, streaming WASM compile of the ≤ 2 MB facade); rebuild-in-place via the
core patch path preserves explode/jog state on equip (the prototype's proven
interaction, ≤ 10 ms re-bake).

## 7. Dependencies

The core facade (`forge-wasm`), codegen'd contract types, gateway client, exact
`onnxruntime-web` 1.27.0 through the lazy WASM-only entry, and recorder views (P8).
ONNX assets are bundled same-origin and excluded from first paint.

## 8. Testing

`pnpm verify:browser-e2e` is the QA-002 production-bundle acceptance harness. Against
an explicitly marked, migrated isolated database it proves authenticated startup,
the real built-WASM request and in-browser validator verdict, approved catalog
rendering, streamed deterministic generation, persisted draft share refusal,
deterministic edit/revalidation, admitted anonymous share while private models return
401, course and governed listing persistence, fixture job success, and maintenance
materialization. It writes structured evidence under `artifacts/e2e` and a full-page
screenshot on failure. `pnpm verify:db` owns the supported setup/order and the required
Postgres CI job installs Chromium and downloads the exact validator artifact.

The P7-008 extension adds an eleventh browser flow. It proves no ONNX Runtime asset
was requested during first paint, starts a contract-bound hover policy, waits for
actual ONNX Runtime Web/WASM inference and completed CoreSession playback, and
asserts the lazy JS and WASM assets came from the Studio origin. Focused Studio tests
run both the exact 906-byte tensor-v1 compatibility oracle and current 1,056-byte
tensor-v2 model in WASM, assert the requested observer major/layout, and exercise
tamper, held-scorecard, D8, lineage, layout, unsupported-version, and non-finite
refusal paths.

Protected P7-014 runtime tests preserve legacy one-target playback and add the
versioned waypoint consumer. D42 extends that same consumer to tensor v2/task v3
without mutating its v2 history. The consumer bounds target count/radius/coordinates,
requires exact supported task-suite/version and Y-up task/hash agreement across task metadata,
scorecard lineage, and ONNX header, requests the next Rust estimator snapshot before
running inference, and zeros the advisory after the final waypoint. Tests prove
ordered target requests and refuse task-frame, lineage-hash, and header-version
substitution; no render or MuJoCo truth value is accepted as target authority.

P7-011 extends that flow rather than adding a second browser-only shortcut. The
persisted terminal job must contain byte-free object-backed delivery metadata, the
browser must issue exactly one authenticated same-origin
`GET /v1/policies/:id/model`, and its received content type, length, and SHA-256 must
match before CoreSession playback. Focused tests also reject response-header and
policy-metadata substitution. Protected artifact `8340587390` closes that requirement
on clean `9131289` with the isolated Postgres/S3-compatible one-winner, substitution,
cancellation, exact-readback, and production-browser paths. Preserve the acceptance
on changes; an in-memory test or locally injected reader alone is not durable-
delivery evidence.

`FORGE_BROWSER_SUPPORT=1 pnpm verify:browser-support` is QA-003's separate
production-bundle compatibility and accessibility harness. Chromium, Firefox, and
WebKit each load an admitted fragment through real WASM and prove semantic landmarks,
accessible control names, skip/focus behavior, keyboard orbit/equip/explode/
blueprint, validator sovereignty after equip, contrast, and critical target size.
Chromium additionally proves the full WebGL asset path, 390 x 844 containment, and
reduced-motion behavior. Firefox/WebKit prove positive schematic draw counts and the
absence of dynamic scene/Three.js requests. The
machine-readable result records the exact revision and engine versions under
`artifacts/e2e`; the required Postgres job uploads both browser suites. Support tiers,
commands, and non-claims are owned by [`../BROWSER-SUPPORT.md`](../BROWSER-SUPPORT.md).

QA-006 still owns pane snapshots and real-hardware performance acceptance. QA-003's
semantic proxies do not replace representative screen-reader, Apple/mobile device,
or independent-user review.

## 9. Open questions

Pane system build-vs-adopt (dockable layout libs vs thin custom); photoscan alignment
UI ship timing (OD-07). Viewer-grade non-SAB execution is no longer an open design
question: `CoreSession` falls back to the local WASM session, and the core-baked
Canvas2D scene keeps viewing/configuration independent of WebGL in Firefox/WebKit.
QA-003 exercises both boundaries. Real Safari/iOS and assistive-technology coverage
remain acceptance work rather than architecture ambiguity.
