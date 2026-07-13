# Browser support and accessibility contract

Owner: Studio maintainers

Last reviewed: **2026-07-13**

Task: `QA-003`

This document owns the browser capability tiers and the deterministic accessibility
acceptance boundary for ForgedTTC Studio. It does not replace QA-002's complete
builder-loop test, real assistive-technology review, vendor-device testing, the
Desktop native gate, or external-user acceptance.

## 1. Capability tiers

| Surface | Supported tier | Automated evidence | Boundary |
|---|---|---|---|
| Cross-origin-isolated desktop Chromium family | **Full Studio** | Playwright Chromium runs the production bundle, real WASM, shared viewer/configurator journey, responsive proxy, and reduced-motion proxy | QA-002 separately owns the authenticated gateway/Postgres builder loop; current Chrome, Edge, and Chromium are a shared engine policy, not three separately certified products |
| Desktop Firefox | **Viewer grade** | Playwright Firefox runs the production bundle, real WASM, local validation, share open, orbit, equipped-variant change, explode, blueprint, semantics, focus, contrast, and target-size assertions | platform/provider panes beyond that journey are best effort until separately accepted |
| Desktop Safari/WebKit | **Viewer grade** | Playwright WebKit runs the same viewer-grade journey | the CI engine is a WebKit compatibility proxy, not proof on Apple Safari, macOS hardware, or iOS |
| Mobile browsers | **Viewer grade declaration** | Chromium at 390 x 844 proves narrow-layout containment; runtime detection declares mobile viewer grade | no touch-device, mobile-browser-vendor, screen-reader, thermal, or field proof exists yet |
| FORGE Desktop/Tauri | **Full Studio power surface** | platform-neutral Desktop tests plus the required native macOS compile | native signing, updater, three-OS distribution, serial hardware, and lab proof remain P8/SEC-008 work |

Browser binaries move with the locked `playwright-core` toolchain. A version recorded
in one evidence artifact describes the tested revision; it is not an evergreen claim
that every later browser release is supported. Engine upgrades must rerun both
QA-003 and the relevant QA-002 data-plane path.

Full Studio means the isolated desktop Chromium/Tauri execution surface is eligible
for the repository's complete product gates. Viewer grade is a smaller support
promise: the admitted share/view/configure path above must work with the local WASM
validator, while unlisted hosted or hardware workflows may work but are not part of
that browser's acceptance contract. Viewer-grade engines start on the low visual
quality tier (AO off and device-pixel ratio 1) so software-rendered WebGL cannot
block the accessible viewer surface; users may opt into a higher presentation tier.
This does not change contract, bake, simulation, or validator truth.

## 2. Accessibility and interaction contract

The production Studio bundle must preserve all of these behaviors:

- document language, product title, one main landmark, and one primary heading;
- accessible names for every visible button, link, input, select, and textarea in
  the acceptance fixture;
- a first-class skip link to the Studio controls, a labeled focusable viewer, and a
  visible 3 CSS-pixel focus indicator;
- keyboard viewer controls: arrows orbit, Page Up/Page Down zoom, `E`/`Shift+E`
  adjust explode, and `B` toggles blueprint;
- keyboard-only disclosure and equipped-variant selection, followed by a fresh
  sovereign WASM validator verdict;
- polite live announcements for viewer changes and screen-reader-only instructions;
- at least WCAG AA 4.5:1 contrast for normal muted text and control text in the
  measured fixtures;
- at least 24 x 24 CSS pixels for critical builder targets, with Studio controls
  designed at 28 pixels or larger where the native engine permits;
- no horizontal overflow at the declared narrow viewport and no controls outside
  the viewport;
- `prefers-reduced-motion: reduce` disables control damping and non-essential
  animation/transition behavior and prevents automatic camera following.

This is deterministic semantic and interaction coverage, not an accessibility
certification. Before an external product promise, QA-010/EXT-001 must include a
real keyboard-only user path and findings review; a later qualified accessibility
pass must cover representative screen readers, zoom/reflow, high contrast/forced
colors, voice/touch alternatives, and the intended Apple/mobile devices.

## 3. Required acceptance

From the repository root:

```bash
pnpm --filter @forge/studio build
pnpm exec playwright-core install chromium firefox webkit
FORGE_BROWSER_SUPPORT=1 pnpm verify:browser-support
```

Linux CI installs browser system libraries with:

```bash
pnpm exec playwright-core install --with-deps chromium firefox webkit
```

The runner refuses to start without `FORGE_BROWSER_SUPPORT=1` or a production Studio
bundle. It starts an isolated preview, opens one compressed admitted contract per
engine, requires the hashed WASM asset and validator admission, exercises the shared
journey, and writes `artifacts/e2e/qa003-browser-support.json`. The evidence records
the source and checkout revisions and whether the local worktree was dirty, Studio
version, engine/version, capability tier, WASM asset, initial quality tier,
semantics, keyboard results, critical target dimensions, contrast ratios, and
Chromium-only responsive/reduced-motion results. A failed engine writes a bounded
error plus a full-page screenshot when one is available.

The required `catalog data plane (Postgres)` job owns this matrix after QA-002, and
uploads the whole `artifacts/e2e` directory even on failure. A missing engine, absent
bundle, rejected fixture, missing WASM response, page exception, semantic regression,
or failed assertion is a hard failure; never silently reduce the engine list in CI.

For authenticated persistence and authorization, run QA-002 separately through
`pnpm verify:db` against a disposable isolated database. For performance claims, use
QA-006 on named hardware. For real user/device claims, use the registered QA-010
external-acceptance procedure and preserve its limitations explicitly.

## 4. Change and triage rules

- Treat the tier banner and detection logic as a product contract. A browser may be
  promoted only after its declared workflow, failure behavior, and evidence are in a
  required gate; demotion requires a dated limitation and changelog entry.
- Keep core truth in WASM. Browser-specific branches may choose worker versus local
  session execution, but may not change validator results or fabricate capabilities.
- Use semantic HTML before ARIA. Do not remove focus indicators, replace labels with
  placeholders, depend on color alone, or trap keyboard focus in the viewer.
- Preserve viewer-grade operation when `SharedArrayBuffer` or cross-origin isolation
  is unavailable. The local `CoreSession` fallback is intentional and fail-visible.
- Keep viewer-grade engines usable under software-rendered WebGL: start low with AO
  disabled, prove that tier in the matrix, and treat optional visual quality as a
  presentation choice rather than a prerequisite for validation or configuration.
- Reproduce failures at the exact revision and engine version from the evidence
  file. Attach the bounded evidence/screenshot; do not treat a single-engine rerun as
  proof that the complete matrix passed.
