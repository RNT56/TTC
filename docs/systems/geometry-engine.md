# Geometry Engine (`forge-geometry` + server jobs) — implementation doc

**Status:** not started · **Phases:** P1 (Rust port), P5 refit, P6 DfM · **Home:**
`crates/forge-geometry` + OCCT server jobs *(proposed)* · **Plan refs:** §7.1,
Appendix C (v3.0) · **Decisions:** D7, D13, D16, D-r1

## 1. Purpose

Everything shape: the primitive vocabulary and its **bake** (the flat
vertex/normal/index buffers everything else consumes — render, physics, validator),
CSG, mass properties, interference detection, procedural connections, scan
refitting, decimation, and design-for-manufacture checks. Pure, math-and-data Rust —
no I/O, no DOM — dual-compiled per D16; the harness and the render layer both
consume its output.

## 2. Modules *(proposed layout)*

```
crates/forge-geometry/src/
├── primitives/     # box, cbox, taper, cyl, lathe(profile|spline), squircle, loft, mesh-ref
├── bake/           # primitives → byte-stable flat buffers (positions/normals f32,
│                   # indices u32, material ids) with smoothing-group normals
├── csg/            # CSG trait: Manifold native (C API) / Manifold WASM in-browser
├── massprops/      # signed-tetrahedron volume/centroid/inertia; density by material class
├── bvh/            # per-part BVHs, tri-tri interference queries (XC-09)
├── couplers/       # port-graph resolution → couplers, fastener sets, wire list (XC-11/12)
├── refit/          # shared types + D13 acceptance metric (heavy lifting in Python worker)
├── lod/            # meshoptimizer wrapper (native + WASM): quadric decimation, LOD chain
├── dfm/            # min-wall, overhang, support volume, bed fit (XC-18)
└── colliders/      # compound auto-fitter: hulls/primitives per node within D7 budget (XC-10)
```

OCCT work (STEP I/O, fillets, exact B-rep, DfM evaluation on B-rep) is server-side
in the OCCT worker ([`compute-workers.md`](compute-workers.md)) — OCCT is heavy and
ours is batch work (plan §6); STEP export is first-class per the positioning (D18).

## 3. Key implementation points

**Primitives & bake (P1-002).** 1:1 port of the prototype's builders with
smoothing-group normals and analytic normals where closed-form. Output must be
**byte-stable** (deterministic vertex order/welding) — P0's byte-equivalence and the
golden-number suite both depend on it. Budgets: humanoid bake ≤ 60 ms; incremental
patch re-bake ≤ 10 ms (facade path).

**Mass properties.** Divergence-theorem signed tetrahedra per part → volume,
centroid, inertia tensor; density from material class or part override; catalog
parts use datasheet mass with geometry-derived inertia *(proposed: flag when
datasheet mass and geometric volume imply implausible density — likely warn-level
check)*.

**Interference (XC-09).** Per-part BVHs, refitted on pose change; tri-tri tests.
Serves GEO-003 (joint-limit sweep, ≤ 0.5 mm penetration), the motion engine's
self-collision guards, and the configurator's prop-clearance checks. This replaces
eyeballed clipping fixes forever.

**Procedural connections v2 (XC-11, XC-12).** Port-graph resolution emits: couplers
sized from the *equipped* variants' port dimensions (generalizing the prototype's 12
bellows/boots/collars), fastener sets at mount patterns, and a wire list from
electrical port pairs. Wiring v1 = cosmetic verlet splines + exact BOM wire list;
routed harness design through joints is deferred research (D-r1).

**Primitive refit (P5; D13).** Efficient RANSAC (Schnabel et al. 2007) for
planes/cylinders/spheres/cones; lathe profiles via PCA axis estimation, radial
binning, spline fit. Acceptance is measured: **≥ 70 % surface-area fit coverage AND
Hausdorff residual ≤ 1.5 % of bounding diagonal — else the part admits as
mesh-class.** Residual mesh kept for unfittable regions. Runs in the photoscan
worker; this crate owns the shared types and the canonical acceptance-metric
implementation.

**LOD.** Quadric error metrics via meshoptimizer (native + WASM); catalog parts
≤ 800 tris LOD0, ≤ 150 LOD1.

**DfM (XC-18).** Per process profile (FDM/SLA presets): minimum wall, overhang
angle, support-volume estimate, bed fit. Live 2026-06-14: the validator runs an
FDM v0 profile over inline printable structural parts (`MFG-001..004`): ≥ 1.2 mm
minimum wall, unsupported-overhang warnings above 45° from vertical, support-area
warnings above 25 %, and oriented fit against a 500 mm lab bed. Failing parts carry
diagnostics + suggested fixes ("thicken the thin axis", "split the part") and feed
print ordering (P11-006). Worker `occt.tessellate` output now carries DfM report
refs, oriented 3MF refs, print profiles, and printed-part BOM quote metadata for
handoff surfaces. SLA presets, exact B-rep wall analysis, true OCCT-generated
orientation, and live provider quote submission remain open.

**Collider auto-fitter (XC-10).** Per-node compounds (hulls/fitted primitives)
within D7 budgets (≤ 8/node, ≤ 24/model); fidelity prioritized at contact-critical
nodes (feet, props, bumpers).

## 4. Dependencies

`forge-contract` only (+ Manifold behind the CSG trait, meshoptimizer). Consumed by
`forge-validate`, `forge-sim`, the render layer (via the facade's bake), and the
Python workers (acceptance metric spec is canonical here).

## 5. Testing

Differential tests vs the JS oracle during the port; mass-property goldens vs
analytic solids (box/cylinder/sphere within 0.1 %); bake byte-stability fixtures vs
the monolith (P0-008 recordings); golden-number membership for bake outputs (XT-001,
incl. Manifold native-vs-WASM parity); CSG robustness fuzz; interference known-pairs
suite; refit acceptance corpus (clean scans, noisy scans, unfittable organic
shapes); DfM fixtures per process profile.

## 6. Phase mapping & backlog

P1: port — primitives/bake/massprops/BVH (P1-002, XC-09). P2: couplers v2 (XC-11).
P3: wire-list emitter (XC-12). P5: refit (P5-003). P6: collider auto-fitter (XC-10),
DfM (XC-18).

## 7. Open questions

Manifold memory strategy for large CSG chains (pool vs per-op instantiation);
Manifold native-C vs WASM build output parity (golden-number coverage required —
see core-runtime §10); whether squircle/loft normals stay analytic or bake
(prototype baked — match it for the port, revisit after).
