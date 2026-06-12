# Render Engine — implementation doc

**Status:** not started · **Phases:** P1 · **Home:** `packages/studio` render layer
**(TypeScript, deliberately — D16)** · **Plan refs:** §7.2, §5.2 (v3.0) ·
**Decisions:** D15, D16

## 1. Purpose

The Three.js layer that replaces the prototype's CPU painter's-algorithm rasterizer.
Under the runtime split it is **a thin consumer of core-baked buffers**: rendering is
presentation, not truth, so it stays web by design — rebuilding rendering in wgpu was
always the expensive, non-differentiating rewrite. The headline deliverable is
structural: **the shimmer dies by construction** — a z-buffer resolves deliberately
interpenetrating solids (shells, boots, struts) per pixel, which no per-face sort can
ever do. P1's exit criteria include a golden-scene parity gallery versus the
monolith, shimmer gone, and 60 fps on mid hardware.

## 2. Architecture

- **Input is the core boundary's bake output** (architecture §2): zero-copy views
  over WASM linear memory (`Float32Array` positions/normals, `Uint32Array` indices,
  material ids) wrapped directly as Three.js BufferAttributes. No per-frame JSON; no
  geometry math in TS.
- **Scene graph** mirrors the contract's skeleton nodes; parts batch per material
  class (`BatchedMesh`, *live 2026-06-12: hrx7 = 8 calls shaded / 9 blueprint,
  gallery-gated ≤ 40*) — a whole model is a handful of draw calls (budget:
  ≤ 40/model). Pose matrices come from the core `tick`'s shared region,
  render-interpolated.
- **WebGL2 baseline**, `WebGPURenderer` behind a flag (TSL gives the path without a
  rewrite). Full studio targets the Chromium floor; viewer-grade elsewhere (D15).

## 3. Materials & lighting

Five material classes → PBR:

| Class | metalness | roughness | extras |
|---|---|---|---|
| gloss | 0.05 | 0.12 | clearcoat (lenses) |
| metal | 0.95 | 0.35 | surface-tinted spec for free |
| satin | 0.10 | 0.45 | |
| matte | 0.00 | 0.85 | |
| rubber | 0.00 | 0.95 | sheen |

Lighting: three-point IBL-lite rig — key directional with PCF soft shadows, cool sky
hemisphere, warm ground bounce. The studio grading the prototype faked per-face
becomes physically consistent for free. AO via N8AO at quality tiers.

## 4. Studio features

- **Blueprint mode:** post pass — normal/depth edge detection composited over a flat
  pass with the grid shader. *Live 2026-06-12 (P1-010): view-normal + depth RT,
  full-screen discontinuity shader; replaced the per-part EdgesGeometry objects.*
- **Explode:** the prototype's chain/window math verbatim, driving per-part instance
  matrices; leader lines as dashed `Line2` with datum dots. *Live: all leaders
  merge into ONE LineSegments under the draw-call budget; Line2 fat lines remain
  a cosmetic upgrade.*
- **Selection:** component-scoped picking (must satisfy BEH-004) — *live via
  BatchedMesh batchId raycast*. Outline shipped as an **inverted hull** (back-face
  shell inflated along normals, distance-scaled rim) instead of stencil — one draw
  call, no postprocess dependency, depth-correct; decision recorded at P1-012.
- **`renderBias`** survives only as a polygon-offset hint for true coplanar decals —
  not as a sorting crutch.
- **Quality-tier autoswitcher (XC-22):** degradation ladder AO off → shadow
  resolution → pixel ratio, engaged at scene-scale thresholds (3 models / 400 k tris).

## 5. Budgets (binding)

≤ 6 ms render inside the 16.6 ms frame; ≤ 40 draw calls/model; 150 k-tri scene cap
before tiers engage; cold load < 2.5 s to interactive (code-split, lazy ONNX/CSG,
streaming WASM compile).

## 6. Dependencies

The core facade (bake buffers + tick shared region); `forge-contract` types via
codegen. Hosts: `packages/studio`. The recorder feeds ghost overlay geometry (P8).

## 7. Testing

Golden-image perceptual diffs on the canonical camera set (RND-001) — **live
2026-06-12** as the parity gallery (`pnpm parity`, P1-015): the frozen monolith
(bridged copy, rest pose pinned, chrome suppressed) vs the built studio under
6 shared cameras, gated on Sobel-edge F1 ≥ 0.85 with measured 0.95–0.995;
evidence committed under `docs/assets/parity/`, kept as regression (re-run
locally; CI integration deferred — headless-chromium install flake). Blueprint
render check (RND-002); draw-call and frame-budget assertions in a perf
harness on representative scenes; zero-copy discipline test (no buffer cloning
on the bake path *(proposed: allocation assertions in the perf harness)*).

## 8. Phase mapping & backlog

P1: P1-008..017 studio tasks; XC-22 foundations. P8 adds the ghost overlay consumer
([`hardware-bridge.md`](hardware-bridge.md)).

## 9. Open questions

N8AO vs alternative AO at low tier; WebGPU flag timing. *(Resolved at P1-015:
the gallery diffs against the prototype rendering itself live in the same
headless browser — fresher than stored screenshots and still the honest
baseline, since the frozen monolith is executed read-only.)*
