# Render Engine — implementation doc

**Status:** not started · **Phases:** P1 · **Package:** `packages/engines/render`
*(proposed)* · **Plan refs:** §7.2 · **Decisions:** D11

## 1. Purpose

The Three.js studio layer that replaces the prototype's CPU painter's-algorithm
rasterizer. The headline deliverable is structural: **the shimmer dies by
construction** — a z-buffer resolves deliberately interpenetrating solids (shells,
boots, struts) per pixel, which no per-face sort can ever do. P1's exit criteria are
a golden-scene parity gallery versus the monolith, shimmer gone, and 60 fps on mid
hardware.

## 2. Architecture

- **Scene graph** mirrors the contract's skeleton nodes; parts become indexed
  `BufferGeometry` records batched per material class (`BatchedMesh`) — a whole model
  is a handful of draw calls (budget: ≤ 40/model).
- **WebGL2 baseline**, `WebGPURenderer` behind a flag (TSL gives the path without a
  rewrite). Chromium floor declared (D11).
- The part format from the prototype (vertices, faces, per-face normals, materials)
  maps directly to GPU buffers — the model layer survives the renderer swap untouched.

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
  pass with the grid shader.
- **Explode:** the prototype's chain/window math verbatim, driving per-part instance
  matrices; leader lines as dashed `Line2` with datum dots.
- **Selection:** stencil outline; component-scoped picking (must satisfy BEH-004).
- **`renderBias`** survives only as a polygon-offset hint for true coplanar decals —
  not as a sorting crutch.
- **Quality-tier autoswitcher (XC-22):** degradation ladder AO off → shadow
  resolution → pixel ratio, engaged at scene-scale thresholds (3 models / 400 k tris).

## 5. Budgets (binding)

≤ 6 ms render inside the 16.6 ms frame; ≤ 40 draw calls/model; 150 k-tri scene cap
before tiers engage; cold load < 2.5 s to interactive (code-split, lazy OCCT/ONNX,
streaming WASM compile).

## 6. Dependencies

`contract`, `geometry` (mesh buffers). Hosts: `studio`. The motion engine feeds node
transforms (interpolated from the 120 Hz worker tick); the recorder feeds ghost
overlay geometry (P8).

## 7. Testing

Golden-image perceptual diffs on the canonical camera set (RND-001) — built at P1 as
the parity gallery vs the monolith, then kept forever as regression; blueprint render
check (RND-002); draw-call and frame-budget assertions in a perf harness on
representative scenes.

## 8. Phase mapping & backlog

P1: P1-001..007, P1-010..012; XC-22. P8 adds the ghost overlay consumer
([`hardware-bridge.md`](hardware-bridge.md)).

## 9. Open questions

N8AO vs alternative AO at low tier; whether the parity gallery diffs against
prototype *screenshots* or re-rendered references (prototype screenshots are the
honest baseline — decide tooling at P1-010); WebGPU flag timing.
