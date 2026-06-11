# Geometry Engine — implementation doc

**Status:** not started · **Phases:** P0–P1 core, P5 refit, P6 DfM · **Package:**
`packages/geometry` *(proposed)* · **Plan refs:** §7.1, Appendix C · **Decisions:**
D7, D13, D-r1

## 1. Purpose

Everything shape: the primitive vocabulary, CSG, mass properties, interference
detection, procedural connections, scan refitting, decimation, and
design-for-manufacture checks. Pure, framework-free, headless-testable — the harness
and the render engine both consume it.

## 2. Modules *(proposed layout)*

```
packages/geometry/src/
├── primitives/     # box, cbox, taper, cyl, lathe(profile|spline), squircle, loft, mesh-ref
├── csg/            # Manifold WASM wrapper: union/difference/intersection, hulls, shell/offset
├── massprops/      # signed-tetrahedron volume/centroid/inertia; density by material class
├── bvh/            # per-part BVHs, tri-tri interference queries (XC-09)
├── couplers/       # port-graph resolution → couplers, fastener sets, wire list (XC-11/12)
├── refit/          # shared types for primitive refit (heavy lifting in Python worker)
├── lod/            # meshoptimizer wrapper: quadric decimation, LOD chain
├── dfm/            # min-wall, overhang, support volume, bed fit (XC-18)
└── colliders/      # compound auto-fitter: hulls/primitives per node within D7 budget (XC-10)
```

OCCT work (STEP I/O, fillets, exact B-rep) is server-side in the OCCT worker
([`compute-workers.md`](compute-workers.md)); OpenCascade.js loads lazily in a client
worker only where B-rep truth is needed interactively.

## 3. Key implementation points

**Primitives (P0-004).** 1:1 port of the prototype's builders with smoothing-group
normals and analytic normals where closed-form. Output must be **byte-stable**
(deterministic vertex order/welding) — P0's byte-equivalence criterion depends on it.
Output shape: indexed `{positions, normals, faces, smoothingGroups, materialClass}`.

**Mass properties.** Divergence-theorem signed tetrahedra per part → volume, centroid,
inertia tensor; density from material class or part override; catalog parts use
datasheet mass with geometry-derived inertia *(proposed: flag when datasheet mass and
geometric volume imply implausible density — likely warn-level check)*.

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
worker; this package owns the shared types and the acceptance metric implementation.

**LOD.** Quadric error metrics via meshoptimizer; catalog parts ≤ 800 tris LOD0,
≤ 150 LOD1.

**DfM (XC-18).** Per process profile (FDM/SLA presets): minimum wall, overhang angle,
support-volume estimate, bed fit. Failing parts carry diagnostics + suggested fixes
("thicken to 1.6 mm", "add chamfer") → MFG-* checks; feeds print ordering (P11-006).

**Collider auto-fitter (XC-10).** Per-node compounds (hulls/fitted primitives) within
D7 budgets (≤ 8/node, ≤ 24/model); fidelity prioritized at contact-critical nodes
(feet, props, bumpers).

## 4. Dependencies

`contract` only. Consumed by harness, render, sim, studio, workers (acceptance metric
re-implemented or bound in Python — keep the metric spec here canonical).

## 5. Testing

Mass-property goldens vs analytic solids (box/cylinder/sphere within 0.1 %); CSG
robustness fuzz (Manifold handles degeneracy, but our wrappers must not amplify);
primitive byte-stability fixtures vs the monolith; interference known-pairs suite;
refit acceptance corpus (clean scans, noisy scans, unfittable organic shapes); DfM
fixtures per process profile.

## 6. Phase mapping & backlog

P0: primitives + massprops (P0-004). P1: BVH service (XC-09) for GEO-003. P2:
couplers v2 (XC-11). P3: wire-list emitter (XC-12). P5: refit (P5-003). P6: collider
auto-fitter (XC-10), DfM (XC-18).

## 7. Open questions

Manifold WASM memory strategy for large CSG chains (pool vs per-op instantiation);
whether squircle/loft normals stay analytic or bake (prototype baked — match it for
P0, revisit after).
