# FORGE — A Text-to-CAD Robotics Studio
### Vision, Architecture, and the End-to-End Plan
*Working codename: **FORGE** — Fabricate · Operate · Rehearse · Generate · Export*
*Version 1.0 · June 2026 · Status: planning paper (nothing in here is built yet except the prototype it audits)*

---

## 0. Abstract

FORGE is a browser-first studio in which a person describes a machine in natural language, receives a fully realized, animated, physically parameterized 3D model of it, swaps its components for real, purchasable parts with exact geometry and real electrical and mass properties, verifies on paper and in simulation that the machine works, trains autonomous behaviors for it in a digital rehearsal space, and finally deploys both the parts list and the trained behavior to the physical machine built from those parts. The product thesis is a closed loop: **describe → assemble → verify → rehearse → deploy**. The prototype — a single ~83 KB HTML file containing a software rasterizer, two articulated models, a component-swap configurator, procedural couplers, locomotion and flight controllers, and a headless validation harness — has proven the data model and the interaction language. This paper specifies what the real system is: its architecture, its technology stack with justifications, its five core engines and their algorithms, its AI integrations, its component database, its training and sim-to-real pipeline, its safety and legal posture, and a phased roadmap with exit criteria, effort estimates, and a risk register. The governing doctrine throughout: **this is not a toy**. Every model carries SI units, real masses, real constraints, and must pass an automated gatekeeper before it exists in the system.

---

## 1. Vision

### 1.1 The loop

A user opens FORGE and types: *"a 5-inch freestyle quad with a long-range battery and a ducted prop option, under 650 g."* Thirty seconds later they are orbiting a rendered, exploded-view-capable, flyable model whose motors, stack, battery, and props are either schema-generated parts or real SKUs from the component catalog. The HUD reads all-up weight, thrust-to-weight, hover throttle, and estimated flight time — computed, not decorative. They click the battery, the configurator pane offers three real packs that physically fit and electrically suffice, and the numbers update. They press Drive and fly it with real thrust curves. They open the Training tab, pick "gate slalom," and a policy trains server-side overnight against a physics-accurate twin. The next morning they watch the trained policy fly the virtual quad through the course, export the BOM, order the parts, build the machine, and flash the same policy — through a guarded, staged deployment ladder — onto the companion computer of the real aircraft. The same loop holds for a rover, a robot arm, a quadruped, and eventually a biped: *whatever is possible*.

### 1.2 The three user promises

**Generate.** Users create components and complete machines through conversation with Claude (the Fable 5 class model via the Anthropic API). Generation is never freeform geometry soup: the model emits schema-constrained part lists, skeletons, slots, and controller parameters, and nothing enters the studio without passing the validation gatekeeper. Generated machines are never static — every admitted model ships with materials on every part, a blueprint projection, an idle animation, a working archetype driver, and a staged explode sequence. *Completeness is enforced, not encouraged.*

**Real parts.** Users build with reality. A curated component database turns datasheets and manufacturer CAD into exact, parametric 3D parts carrying mass, electrical constants, mounting patterns, and purchase links. Users swap real parts onto generated frames, or assemble entirely from catalog parts. For the long tail with no published CAD, users photograph the part and an image-to-3D pipeline (TRELLIS-class reconstruction followed by primitive refitting) returns an editable parametric model rather than a triangle soup.

**Autonomy.** Users teach their machines. Each model compiles to a physics description (MJCF/URDF), trains in a rehearsal environment with domain randomization, and exports a portable policy (ONNX). The same policy runs in-browser to demonstrate autonomy on the digital twin, and — through an explicit, safety-gated sim-to-real protocol — on the physical machine built from the same parts.

### 1.3 The doctrine: not a toy

Six commitments separate FORGE from a sandbox game:

1. **SI units everywhere.** Meters, kilograms, newtons, volts, ampere-hours. The 1.70 m humanoid and 0.46 m quad in the prototype already obey this; it becomes a schema invariant.
2. **Mass and inertia are computed or sourced**, never invented — from catalog datasheets when the part is real, from geometry × material density when generated.
3. **Electrical and mechanical compatibility are checked**, not assumed: mounting patterns, voltage windows, current budgets, prop clearance, joint torque margins.
4. **Every claim on the HUD is derived from a model with stated assumptions** — thrust from Kv/voltage/prop tables, endurance from capacity and sag-modeled draw — and the assumptions are inspectable.
5. **Manufacturability is an export target.** Generated structural parts emit STEP/3MF/STL with print-orientation and wall-thickness checks; the BOM names real SKUs.
6. **The validator is sovereign.** No model — human-authored, parametrically generated, or LLM-generated — is admitted to the registry, the marketplace, or the training queue without passing the automated harness.

### 1.4 Who it is for

The early adopter is the **FPV builder** — the ecosystem with the most standardized parts, the cheapest hardware loop, and an existing culture of configuration and simulation. Behind them: the **robotics educator** who needs a verifiable design-to-behavior curriculum surface; the **research prototyper** who wants morphology-and-policy co-design without owning a sim stack; the **hardware tinkerer** building rovers and arms from hobby servos; and ultimately the **hardware startup** using FORGE as a pre-CAD ideation and feasibility surface. Each persona enters at a different point of the loop and the architecture must let them: catalog-first users never touch generation; generation-first users may never buy a part.

---

## 2. Prototype audit — what the monolith proved and where it ends

The HTML prototype (cad-object-studio.html) is the reference implementation of the interaction model and the data contract. An honest ledger:

**Proven and carried forward.**
The **node/part/slot/port contract**: a skeleton of named transform nodes; parts as baked vertex/face/normal/material records attached to nodes; swappable slots with variant builders; a port table from which procedural couplers (12 bellows/boots/collars on the humanoid) are *generated* to bridge whatever variants are equipped. The **animation stack**: idle pose layer, phase-gait locomotion with closed-form 2-bone leg IK and planted-feet idle, FPV angle-mode flight with a per-motor mixer, an always-on secondary layer (critically damped servos, scan detents, actuator telltales), per-joint limits, click-to-move with arrive behavior, and a follow camera. The **inspection language**: staged explode with leader lines, blueprint mode, component-scoped selection, a jog teach-pendant, pause and frame-step. The **configurator**: 31 validated variants across 11 slots, a floating parts pane, rebuild-in-place preserving explode and jog state. The **shading model**: smoothing-group normals, hemispheric ambient with warm/cool grading, metallic-tinted specular, Fresnel rim, quantized shade cache. And most importantly the **headless validation harness**: simulated clock, synthetic input, NaN scans, ground-contact probes, variant sweeps, drive regressions — the embryo of the gatekeeper.

**At end of life.**
The **painter's-algorithm renderer**. The seamless-display pass (deterministic tie-broken sorting, authored depth-bias layers, cap-fan tessellation, prism banding, strut de-interpenetration) made draw order stable and removed the worst artifacts, but the user-observed verdict stands: *limb shimmer is reduced, not gone*. This is structural, not a bug: where solids genuinely overlap — and our design language deliberately overlaps shells, boots, and struts — no per-face ordering is correct, and occlusion cycles among three or more faces have no valid sort at all. A painter can be stable; it cannot be true. **Conclusion: the depth-buffered renderer is not an "if needed" exit; it is the first engineering milestone of the real system.** The part format (vertices, faces, per-face normals, materials) is already exactly what a GPU pipeline consumes, so the entire model layer survives the swap untouched.
Also EOL: the **single-file monolith** (no modules, no types, no tests-as-code, no persistence, no server, no identity), the **CPU raster budget** (~4–6 k faces), and **drivers as closures** (code, not data — unauditable, unsandboxable, ungenerable).

---

## 3. The Model Contract v2 — data, not code

The contract is the heart of the system. In the prototype, a model is `{skeleton nodes, slot registry + variant builders, port table, chains, pose(), drv{update,focus,reset}, post(), lim}` plus one registry line — a rover or quadruped is a weekend of geometry plus one driver. The prototype's variant builders are already ~90 % declarative: primitive, dimensions, transform, material, explode metadata. Contract v2 finishes the move: **a model is a JSON document, and the only code is in versioned engine libraries the document references by name and parameterizes.**

### 3.1 Schema overview

A `ModelSpec` contains (full sketch in Appendix A):

- **`meta`** — id, name, semver, author/provenance (human | parametric-generator | llm-generation with prompt hash), license, archetype tag.
- **`skeleton`** — named nodes `{name, parent, pos[m], rot[rad], limits[[minX,maxX],[minY,maxY],[minZ,maxZ]], joint:{type: fixed|revolute|spherical, axis, maxTorqueNm?, maxVelRad?}}`. Joint torque/velocity fields exist so the same skeleton drives both visual articulation and physics export.
- **`parts`** — array of `PartSpec`: `{node, geom, material, color, explode?, renderBias?, comp?, mass?: {value_g | density_kgm3}, collision?: auto|hull|primitive|none}` where `geom` is a tagged union over the primitive vocabulary — `box, cbox, taper, cyl, lathe(profile|spline), squircle, loft(profile, stations[]), mesh(ref)` — the last admitting imported real-part meshes with smoothing groups.
- **`slots`** — `{id, label, mountNodes[], joint?, variants[{id, name, desc, parts[], ports{...}}]}` exactly as proven, plus `componentRef?` allowing a variant to be *backed by a catalog SKU* rather than inline parts.
- **`ports`** — typed connection points: `{id, node, frame, type}` where `type` draws from a connector taxonomy (§7.2): mechanical patterns (`stack-30.5×30.5-M3`, `motor-mount-16×16-M3`, `prop-shaft-M5`), electrical (`XT60`, `XT30`, `JST-PH-2`), data (`UART`, `I2C`). Couplers, fasteners, and wiring are *generated* from port resolution, generalizing the prototype's procedural bellows.
- **`chains` + per-part `explode`** — the staged disassembly windows, unchanged in spirit; required coverage is a completeness gate.
- **`driver`** — `{archetype: biped|multirotor|rover|arm|quadruped|fixedwing, params{...}}`. Drivers are **library code keyed by archetype**, parameterized by the document (gait frequency curves, stride limits, mixer geometry, Ackermann geometry, IK chain definitions). No arbitrary code ships inside a contract — this is a security and generability decision. A later escape hatch admits user controllers as **sandboxed WASM modules** with a capability-limited API (read joints/sensors, write joint targets; no I/O), version-pinned and marketplace-reviewed.
- **`materials`** — the five-class system (gloss/metal/satin/matte/rubber) mapped to PBR parameters, extensible to textured PBR for imported meshes.
- **`sim`** — masses (computed or sourced), per-part collision policy, aggregate overrides, and for powered archetypes the propulsion block: `{motors[{kv, r_int, mount}], props[{diameter_in, pitch_in, blades, ct_table?}], battery{cells, capacity_mAh, c_rating, r_int}}` — populated automatically when slots are backed by catalog components.

### 3.2 Conventions

Internal coordinate system **Y-up, right-handed, meters** (matching the prototype and Three.js); exporters convert to Z-up for URDF/MJCF/STEP. Angles in radians, masses in grams at the schema surface (kg internally), time in seconds, fixed-point-free floats with explicit tolerance fields where geometry meets manufacturing (±0.1 mm default).

### 3.3 Completeness gates — "no static models"

Per the product requirement that *generation includes full shader, blueprint, movement, and animation at all times*, admission requires: every part has a material; the blueprint projection renders without degenerate faces; a driver archetype is declared and its smoke test passes (biped walks 1 m without NaN or ground penetration > 1 mm; multirotor holds altitude ±5 cm in still air; rover tracks a 1 m arc); an idle pose exists and keeps ground contact within tolerance; explode windows cover ≥ 80 % of parts with at least one leader-flagged subassembly per slot; all declared ports resolve or are explicitly capped; mass closure (Σ part masses = aggregate within 2 %).

### 3.4 Compile targets

One contract, many artifacts — this is the architectural keystone:

| Target | Consumer | Notes |
|---|---|---|
| GPU mesh buffers + scene graph | Render engine | direct mapping; BatchedMesh per material class |
| **MJCF** (MuJoCo) | Training service | bodies from nodes, geoms from collision policy, actuators from joints/motors |
| **URDF** (+ ros2_control) | ROS 2 deployment, third-party sims | shares the MJCF body tree |
| **STEP / 3MF / STL** | Manufacturing | structural generated parts; OCCT-backed |
| **BOM (CSV/JSON)** | Purchasing | catalog-backed slots resolve to SKUs, prices, links |
| Firmware configs | Hardware bridge | Betaflight CLI diff / ArduPilot params / mixer maps from the propulsion block |
| **ONNX policy I/O spec** | Learning engine | observation/action vector layout derived from skeleton + sensors |

---

## 4. Target architecture

```mermaid
flowchart LR
  subgraph CLIENT [Browser Studio — TypeScript]
    UI[React UI · configurator · panes · HUD]
    RE[Render Engine · Three.js WebGL2/WebGPU]
    ME[Motion Engine · archetype drivers]
    PHY[Rapier WASM · physics worker]
    POL[ONNX Runtime Web · policy inference]
    GEO[Geometry kernel · primitives · Manifold WASM]
  end
  subgraph EDGE [Hardware Bridge]
    WS[WebSerial/WebUSB · Betaflight passthrough]
    COMP[Companion link · ROS2 rosbridge / MAVLink]
  end
  subgraph API [Gateway — Fastify/TS]
    VAL[Validation service · headless harness]
    REG[Model & component registry]
    GEN[Generation orchestrator · Anthropic API]
  end
  subgraph DATA [Data plane]
    PG[(Postgres 16 + pgvector + graphile-worker)]
    OBJ[(S3-compatible object storage)]
  end
  subgraph COMPUTE [Python GPU workers — queue-driven]
    TRE[TRELLIS / photogrammetry / primitive refit]
    OCC[OCCT jobs · STEP I/O · fillets · tessellation]
    TRN[MuJoCo (+MJX) · PPO/SAC training]
    ETL[Catalog ingestion · datasheet extraction]
  end
  UI<-->RE; UI<-->ME; ME<-->PHY; POL-->ME
  CLIENT<-->API; API<-->DATA; COMPUTE<-->DATA
  GEN<-->VAL; CLIENT<-->EDGE
```

Five planes. The **client studio** does everything interactive — rendering, motion, scene physics, in-browser policy playback — and works offline against local contracts (local-first; the server is for generation, heavy geometry, training, catalog, and sharing). The **gateway** is thin, typed, and owns the **validation service**: the same harness logic, packaged as a deterministic headless runner (Node + the engine libraries) invoked on every contract admission. The **compute plane** is Python because the gravity of the ML/geometry ecosystem (TRELLIS, trimesh, MuJoCo, COLMAP, OCCT bindings) is Python; workers are queue-driven with no public surface. The **data plane** is deliberately one Postgres instance (with pgvector for embedding search and graphile-worker for the job queue) plus S3-compatible object storage for meshes, photos, policies, and renders — the single-database discipline that has served the rest of your infrastructure. The **hardware bridge** runs in the browser where possible (WebSerial to flight controllers is proven territory in Chromium) with a thin companion path for ROS 2 and MAVLink targets.

---

## 5. Technology stack — decisions and justifications

| Layer | Decision | Beat out | Why |
|---|---|---|---|
| Language (client) | **TypeScript** end-to-end, strict | — | the contract is a type system problem; schema↔types via TypeBox/Zod codegen |
| Build/repo | **Vite + pnpm + Turborepo** monorepo | Nx, bazel | speed, simplicity, solo-friendly; packages: `contract`, `geometry`, `engines/*`, `studio`, `gateway`, `harness` |
| UI | **React 19 + Zustand** | Solid, Svelte | ecosystem depth for panes/forms/dnd; Zustand keeps render-loop state out of React; Solid revisit only if profiling demands |
| 3D | **Three.js** (WebGL2 baseline, `WebGPURenderer` behind a flag) | Babylon.js, PlayCanvas, raw WebGL | largest ecosystem, BatchedMesh/instancing, mature lines/outlines/post stack, TSL gives a WebGPU path without rewrite; Babylon is excellent but heavier and we need a thin custom CAD layer, not an engine framework |
| Client physics | **Rapier** (Rust→WASM) in a Web Worker, fixed 240 Hz substeps | Jolt-wasm, Ammo/Bullet, cannon-es | actively maintained, deterministic-leaning, first-class TS bindings, joint motors and limits map directly from the contract |
| In-browser inference | **ONNX Runtime Web** (WASM/WebGPU EP) | TF.js | ONNX is the export lingua franca from PyTorch policies |
| Geometry kernel | **Our primitive library (TS port)** + **Manifold** (WASM) for booleans/hulls/offsets + **OpenCascade.js** (lazy, worker) for STEP I/O and fillets + **meshoptimizer** (WASM) for decimation/LOD | full OCCT for everything | OCCT alone is huge and slow to load; Manifold is fast and robust for the 95 % CSG case; OCCT only where B-rep truth is required |
| Gateway | **Fastify + TypeBox** on Node 22 | Hono, NestJS, tRPC | schema-validated routes for free, mature, boring |
| Compute workers | **Python 3.12**, queue-driven processes (no public API) | TS-everything | TRELLIS/MuJoCo/COLMAP/trimesh/OCC live here; fighting that gravity costs more than two languages |
| DB / queue / search | **Postgres 16 + pgvector + graphile-worker** | Redis+BullMQ, dedicated vector DB | one stateful service; transactional jobs; pgvector adequate at catalog scale (10⁴–10⁶ rows) |
| Object storage | **S3-compatible** (Hetzner Object Storage or Cloudflare R2) | local disk | meshes/photos/policies/renders; presigned upload from browser |
| Training sim | **MuJoCo** (CPU) with **MJX** (GPU/JAX) when batch RL demands it | Isaac Lab, Brax-only, PyBullet | best contact-model-quality-to-simplicity ratio, MJCF is our compile target, MJX gives massive parallelism later without changing the model format; Isaac is powerful but an operational anchor for a solo team |
| RL stack | **PyTorch + Stable-Baselines3 (PPO/SAC)** first; clean seams to CleanRL/Brax | custom | boring, reproducible baselines before cleverness |
| Image→3D | **TRELLIS-class image-to-3D** on burst GPU; **COLMAP + mesh extraction** for multi-photo | client-side AI | none of this runs client-side credibly; burst on Modal/RunPod, results cached forever |
| LLM | **Anthropic API — Claude Fable 5** for synthesis/repair, smaller tiers (Sonnet/Haiku class) for edits and ETL extraction; tool use with JSON-schema-constrained output; prompt caching for the schema+pattern context; Batch API for catalog ETL | — | current model strings, limits, and pricing are volatile — pinned at implementation time from https://docs.claude.com/en/api/overview |
| Deploy | **Docker Compose on a Hetzner VM** (gateway+PG+workers) + CDN for the studio; GPU burst only | k8s | matches the €-budget single-VM discipline; k8s is a Phase-9 problem if ever |
| Auth | Auth.js (email + OAuth), anonymous-local mode first | custom | identity is not the product |
| Observability | pino logs + OpenTelemetry traces (optional), Sentry | ELK stacks | enough to debug, not an SRE hobby |

**Two physics engines is a feature, not a smell.** Rapier gives interactive, in-browser scene physics; MuJoCo gives training-grade contact dynamics and the RL ecosystem. Parity is managed structurally: both consume the *same* MJCF/URDF compiled from the *same* contract, and a **parity test suite** (drop tests, pendulum periods, hover trim, gait CoM trajectories) asserts agreement within stated tolerances on every engine or exporter upgrade. Where they disagree, the training side is truth and the client side is presentation.

---

## 6. The five engines

### 6.1 Geometry Engine
Owns the primitive vocabulary (1:1 port of `box/cbox/taper/cyl/lathe/spline/squircle/loft` with smoothing groups and analytic normals), CSG via Manifold (union/difference/intersection, convex hulls for collision shapes, shell/offset), fillets and STEP via OCCT jobs, **mass properties** by the divergence theorem (volume, centroid, inertia tensor per part; density from material class or override), **interference detection** via per-part BVHs with triangle-triangle tests (drives the clearance validator and replaces eyeballed clipping fixes: the harness sweeps every joint through its limit box and asserts zero solid-solid penetration above tolerance), **procedural connections v2** (port-graph resolution emitting couplers, fastener sets at mount patterns, and routed wire splines between electrical ports), **primitive refit** for scanned meshes (efficient RANSAC for planes/cylinders/spheres/cones per Schnabel et al.; lathe-profile extraction by axis estimation + radial binning; residual mesh kept for unfittable regions), and **decimation/LOD** via quadric error metrics (meshoptimizer) targeting catalog parts at ≤ 800 tris LOD0 / ≤ 150 LOD1.

### 6.2 Render Engine
Three.js scene graph mirroring the node tree; parts become indexed BufferGeometries batched per material class (BatchedMesh), so the whole humanoid is a handful of draw calls. Material classes map to PBR: gloss (metalness 0.05/roughness 0.12, clearcoat on lenses), metal (0.95/0.35, surface-tinted spec for free), satin (0.1/0.45), matte (0.0/0.85), rubber (0.0/0.95, sheen). Lighting is a three-point IBL-lite rig (key directional with PCF soft shadows, cool sky hemisphere, warm ground bounce — the studio grade the prototype faked per-face becomes physically consistent for free). **Blueprint mode** is a post pass: normal/depth-edge detection composited over a flat pass with the grid shader. **Explode** reuses the chain/window math verbatim, driving per-part instance matrices; leader lines are `Line2` dashed materials with datum dots; selection is a stencil outline. Ambient occlusion via N8AO at quality tiers. And the headline: **the shimmer dies by construction** — a z-buffer resolves interpenetrating solids per pixel, so deliberately overlapping shells, boots, and struts simply render correctly. The `renderBias` field survives only as a polygon-offset hint for true coplanar decals.

### 6.3 Motion Engine
A deterministic, fixed-step (120 Hz) layer stack evaluated in a worker and interpolated for render. **(1) Base layer** — archetype drivers from the library, parameterized by the contract. Biped: the proven phase gait with closed-form 2-bone IK (Appendix C), stride/cadence curves from params, planted-feet idle, heading spring, arrive controller. Multirotor: the angle-mode model, upgraded to consume the simulation engine's forces when physics-coupled. Rover: differential or Ackermann steering with wheel-spin kinematics. Arm: damped-least-squares IK with null-space posture bias. Quadruped: trot/walk generator with per-leg 3-DOF IK — the first new archetype, chosen to prove the contract generalizes. **(2) Constraint layer** — joint limits from the skeleton, velocity clamps, self-collision guards fed by the Geometry Engine's interference queries. **(3) Secondary layer** — critically damped servo filters (ω, ζ per joint class), detents, actuator telltales, verlet cables and antennae. **(4) Policy layer** — an active ONNX policy writes joint or thrust *targets into* this same pipeline, beneath the constraint layer and never above it, so trained behavior cannot command an invalid pose. Keyframe clips and blend trees exist as an additive authoring layer for cinematics, never required for function.

### 6.4 Simulation Engine
Client-side: Rapier bodies generated from the contract (collision policy per part: auto-hull, fitted primitive, or none for decals), revolute joints with motors honoring the contract's torque and velocity limits, friction-materialed ground. **Propulsion model** for multirotors: per-motor RPM from a first-order motor model (n ≈ Kv·V_eff·u with V_eff = V₀ − I·R_total), thrust T = C_T·ρ·n²·D⁴ and torque Q = C_Q·ρ·n²·D⁵, with C_T/C_Q interpolated from catalog thrust tables when published and blade-element-lite estimates when not; a battery model with internal-resistance sag and capacity integration. The HUD's **AUW, thrust-to-weight, hover throttle, instantaneous current, and endurance** are closed-form consequences of these models, with assumptions inspectable. Disturbance injectors (gusts, sensor noise, payload shifts) serve both play and pre-training sanity. Legged contact, slopes, and steps run natively in Rapier; the validator's drive smoke tests execute here headlessly. Server-side training uses MuJoCo from the same compiled MJCF under the §5 parity discipline. Everything is seeded and replayable: a session serializes to {contract hash, seed, input tape}.

### 6.5 Learning Engine
**Tasks** are versioned environment definitions: hover-hold, waypoint chain, gate slalom, velocity tracking (multirotor); walk-to-target, rough-terrain traverse, push recovery (legged); line-follow and obstacle course (rover); reach/track (arm). **Observation and action spaces derive from the contract** — joint angles/velocities, body IMU, target vectors in body frame; actions are normalized joint or thrust targets — so a policy header is portable metadata. **Algorithms**: PPO as the workhorse (clipped surrogate with GAE; Appendix C) and SAC where sample efficiency matters, via Stable-Baselines3 first for reproducibility. **Domain randomization** is a first-class config block: mass ±15 %, motor Kv ±8 %, battery sag ±20 %, actuation latency 0–30 ms, IMU noise and bias, ground friction 0.4–1.2, wind 0–4 m/s, observation dropout. **Curriculum** stages belong to the task definition (hover before waypoints before slalom). **Outputs**: an ONNX policy plus a scorecard — success rate, robustness across the randomization grid, energy use — which is itself a gatekeeper artifact; sub-threshold policies do not export. A single consumer GPU handles CPU-MuJoCo PPO for these morphologies in hours; MJX unlocks order-of-magnitude batch parallelism when tasks demand it (claim hedged until benchmarked on our models).

---

## 7. AI integrations

### 7.1 Text-to-CAD (the loop the studio is named for)
Generation is an **orchestrated, validator-gated pipeline**, not a single prompt. **(1) Intent parse** — the user's message plus studio context becomes a structured design brief (archetype, scale, mass budget, style tags, real-part preferences). **(2) Retrieval** — pgvector search over the component catalog and a **pattern library** of validated part-group idioms (pauldron, prop guard, sensor head, battery bay) harvested from every admitted model; retrieved exemplars ride along as schema-true few-shot context, while the schema and engine docs sit in a **prompt-cached** prefix. **(3) Constrained synthesis** — Claude (the Fable 5 class model) emits *only* contract JSON via tool use with the JSON Schema enforced: skeleton + slots + ports + driver parameters first, per-slot parts second, materials/explode/sim third. Multi-pass keeps each emission small, checkable, and cheap to repair. **(4) Validator in the loop** — every pass runs the headless harness; failures return as machine-readable diagnostics (`ground_penetration: an1 −4.2 mm @ phase 0.31`, `port_unresolved: XT60@batt`, `face_budget: 6 812 > 6 000`) and the model self-repairs, bounded at three iterations before falling back to the nearest valid pattern or surfacing the diagnostic. **(5) Admission** — passing contracts are stamped with provenance (model version, prompt hash, seed, validator report) and enter the registry.

**Conversational editing** is the same machinery on a smaller lever: "make the arms 20 % longer," "swap to ducted props," "more aggressive stance" compile to JSON-Patch operations against the live contract, validated incrementally, applied with rebuild-in-place. Cost discipline: frontier tier for full synthesis and repair reasoning; smaller tiers for edits, classification, and ETL extraction; catalog ingestion through the Batch API. Model strings, context limits, and pricing are pinned at implementation time from https://docs.claude.com/en/api/overview — they move faster than this document.

### 7.2 Catalog ingestion agents
ETL workers turn the FPV ecosystem's published truth into rows: fetch manufacturer pages, datasheets, and STEP files → Claude-extracted structured specs against the component schema (dimensions, mass, Kv, cells, mount patterns, connectors) with per-field source citation → OCCT tessellation and meshoptimizer LOD chain for geometry → dedupe by (brand, model, revision) → a **license ledger** entry attached to every asset. Low-confidence extractions land in a human review queue; nothing auto-publishes.

### 7.3 Image → 3D (the TRELLIS flow)
For parts without published CAD: the user uploads one to N photos → a GPU job runs background removal → single-image TRELLIS-class reconstruction (or COLMAP multi-view plus mesh extraction when N is large) → manifold repair → decimation → **primitive refit** (§6.1) so the part returns *parametric* — cylinders, boxes, lathe profiles, with a residual mesh only where fitting fails → a browser **alignment UI** where the user states one known dimension (scale), snaps the principal axis, and authors ports → optional datasheet merge for mass and electrical → admission as a catalog component with `source: photoscan` provenance. None of this runs client-side; it is a burst-GPU job cached permanently. Photos are the long tail: datasheet-parametric and manufacturer CAD remain the primary acquisition paths because they are exact.

### 7.4 Ambient intelligence
Embedding search across models, parts, and patterns ("sensor heads under 90 g"); a **BOM agent** resolving catalog slots to live vendor offers (Phase 9); a **doc agent** that turns any admitted model into a build sheet — exploded steps in chain order, fastener counts from port resolution, a wiring list from electrical ports.

---

## 8. The component database and compatibility engine

### 8.1 Schema (Postgres)
`components(id, brand, model, rev, category, dims jsonb, mass_g numeric, elec jsonb, mech jsonb, geometry_ref, lods int[], ports jsonb, price_ref, license_id, source, confidence, embedding vector)` — where `elec` carries `{kv, cells_min, cells_max, max_current_a, r_int_mohm, capacity_mah, c_rating}` as applicable and `mech` carries `{mount_pattern, shaft, thread, prop_interface}`. Supporting tables: `connector_types` (the taxonomy: `stack-30.5×30.5-M3`, `stack-20×20-M2`, `motor-mount-16×16-M3`, `prop-shaft-M5`, `XT60`, `XT30`, `JST-PH`, `UART`, `I2C`, …), `licenses`, `thrust_tables(component_id, voltage, throttle, thrust_g, current_a, rpm)` for motors with published bench data, `prices`, `provenance`.

### 8.2 Compatibility rules
Declarative constraints evaluated at equip time and by the validator: mount-pattern equality between stack parts and frame; voltage-window intersection across battery↔ESC↔motor; current budget (battery max discharge ≥ Σ motor max × 1.2 safety factor); prop clearance (tip circles versus frame and adjacent tips — the check the prototype already performs geometrically); mass budget versus thrust margin (reject below TWR 1.8 for freestyle presets, warn below 2.5); connector matching across electrical ports. Violations render in the configurator pane as the reason a card is greyed — compatibility is explained, never merely enforced.

### 8.3 The proof pair
Phase 3's concrete deliverable: convert the VX-2's `rotors` and `battery` slots to `componentRef`-backed variants using one real 2207-class motor and one real 4S 1500 mAh-class pack, with dimensions, mass, Kv, and sag parameters taken from the manufacturer datasheets at ingestion time — the ETL citation requirement applies to us too. Success means the rendered geometry matches datasheet dimensions within tolerance, the HUD's hover throttle and endurance change when the pack swaps, and the BOM exports two purchasable SKUs.

---

## 9. Validation and QA as a product surface

The harness that gated every change in the prototype becomes infrastructure: a deterministic **headless runner** (Node plus the engine libraries, render stubbed) executing the full check suite (Appendix B) on every contract write — in CI for first-party models, at admission for generated ones, at publish for marketplace submissions. At platform scale we add: **golden-image render tests** (a canonical camera set with perceptual-diff thresholds) so shading regressions are caught by pixels rather than eyes; **physics regression** (canonical scenes with trajectory tolerance bands) so engine upgrades cannot silently change behavior; **schema versioning** with migration scripts and a compatibility matrix (a v2.3 contract must load in a v2.5 studio); and **generator fuzzing** (adversarial briefs, dimensional extremes) with every failure minimized into a regression case. The gatekeeper is what makes a marketplace possible at all: community models are admitted by the same machine that admits ours, and the validator report ships with the listing.

---

## 10. Autonomy: training and the sim-to-real protocol

This is the summit and it gets blunt treatment. The reality gap is real and archetype-dependent: multirotors cross it routinely (the gap is mostly motor dynamics, latency, and state estimation), wheeled robots cross it easily, and legged contact dynamics remain genuinely hard. The plan respects that gradient instead of pretending it away.

**The deployment ladder** — never skipped, enforced by the product flow. **(1) SITL:** the policy flies the digital twin under full randomization; the scorecard must pass. **(2) HITL:** the real flight controller or microcontroller runs in the loop against the simulator over serial/USB, validating timing and interfaces. **(3) Constrained reality:** tethered hover, wheels-off-ground, or harness walking with the **safety supervisor** active — geofence, attitude and rate envelopes, battery floor, hardware kill switch, and a fallback controller (manual or position-hold) that owns the air gap; the policy is an *advisor* the supervisor can veto. **(4) Free operation** within declared envelopes.

**System identification closes the loop.** Real telemetry — bench thrust pulls, logged flights, joint step responses — flows back through a fitting job that updates the contract's sim block (true Kv under load, R_int, motor time constants, friction), and the policy fine-tunes against the corrected twin. The product makes this a guided ritual rather than an expert chore, and the "ghost overlay" (simulated trajectory drawn under the real one) makes the residual gap visible.

**Deployment targets by archetype.** Multirotor policies do *not* run on Betaflight-class firmware — a rate loop is not a policy host. They run on a **companion computer** (Pi/Jetson class, ONNX/TFLite) speaking MAVLink offboard to ArduPilot/PX4-class stacks, or remain at the trajectory-command level for simpler stacks. Rovers and arms deploy via ROS 2 (the contract's URDF plus a ros2_control mapping) or direct microcontroller targets for simple differential drives. Legged deployment targets the small commercial quadruped and biped kits through vendor SDKs — explicitly late-phase, explicitly experimental, explicitly behind the harness-walking gate.

**What we promise versus what we don't.** We promise a rigorous rehearsal space, portable policies, honest scorecards, guided system identification, and a supervised path onto hardware the user owns. We do not promise that any policy is safe in the open world — and the UX says so at every gate.

---

## 11. Hardware bridge

Browser-native where the platform allows: **WebSerial** for flight-controller configuration in the Betaflight-configurator pattern, reading and writing the firmware config diffs the contract compiles; **WebSerial/WebUSB telemetry** ingestion for system identification; live HUD mirroring of real telemetry against the twin. Where the browser cannot reach — ROS 2 graphs, MAVLink routing, onboard policy installation — a thin **companion daemon** (single static binary; a Tauri tray app later only if a GUI earns its keep) bridges over the local network via rosbridge and MAVLink, authenticated by pairing code. The bridge never auto-arms anything; every transition up the deployment ladder is a deliberate physical-confirmation interaction.

---

## 12. Security, safety, legal

**No code in contracts** — the central security decision. Drivers are parameterized references into versioned libraries; the future user-controller path is sandboxed WASM (no I/O, fuel-metered, capability-limited API) and marketplace-reviewed. **Generated-content provenance:** prompts and outputs are hash-logged; every generated asset carries its validator report. **Licenses:** every catalog asset carries a license record; manufacturer STEP redistribution terms are honored by serving derived LODs only where redistribution is restricted, with link-out to the source; user photo uploads grant processing rights only, deletion on request, never training data without explicit opt-in. **Platform policy:** FORGE excludes weapons — no targeting systems, munition payloads, or interdiction modules in the catalog, generation, or marketplace, and briefs in that direction are refused; the prototype's "combat" naming flavor does not survive into the product. **Regulatory posture:** the studio surfaces, but does not adjudicate, airspace and robotics rules (EU drone classes, Remote ID, RF law) with jurisdiction-aware pointers; operation remains the user's responsibility and the ladder gates repeat it. **Privacy:** local-first contracts mean designs never leave the machine unless shared; server artifacts are user-scoped; the single-Postgres data plane keeps the audit surface small.

---

## 13. Performance budgets

| Surface | Budget | Mechanism |
|---|---|---|
| Client frame | 16.6 ms total: ≤ 6 ms render, ≤ 3 ms motion, ≤ 4 ms physics (worker, amortized), ≤ 2 ms UI | BatchedMesh ≤ 40 draw calls per model; 150 k-tri scene cap; LODs on catalog parts |
| Scene scale | 3 models or 400 k tris before degradation tiers engage | quality tiers: AO off → shadow resolution → pixel ratio |
| Physics | 240 Hz substeps, 120 Hz driver tick, render-interpolated | SharedArrayBuffer state mirror; zero per-frame allocation |
| Cold load | < 2.5 s to interactive on mid hardware; OCCT/ONNX lazy | code-split engines; streaming WASM compile |
| Generation | < 60 s brief → validated model | multi-pass with cached prefix; slots stream into the viewport as they validate |
| Photoscan job | < 5 min photo → parametric part on burst GPU | queue SLO; permanent cache |
| Training | hover-class task to passing scorecard overnight on one consumer GPU | SB3 PPO baseline; MJX path when exceeded |
| Validator | < 10 s full suite per model | headless, parallel checks, BVH reuse |

---

## 14. Roadmap

| Phase | Scope | Exit criteria | Est. (solo + AI pair) |
|---|---|---|---|
| **P0 Freeze & extract** | Monolith tagged as the executable reference; contract schema v2 written; mechanical translation of both models and all 31 variants to JSON; monorepo scaffold | both contracts validate in a Node runner with part/face counts byte-equivalent to the monolith | 1–2 wk |
| **P1 Render & core port** | Three.js studio: scene graph, PBR materials, blueprint, explode + leaders, selection, jog, pane, orbit; motion-engine port (gait/IK, mixer, servos); Rapier worker skeleton | golden-scene parity gallery versus the monolith; **shimmer gone**; 60 fps on mid hardware | 3–4 wk |
| **P2 Data-driven models** | Validation service productized; archetype driver library formalized; parametric family #1 — a quadruped generator with leg-count/wheelbase/mass sliders | a quadruped spec becomes a valid walking model with zero hand-written code; CI green on the full suite | 3 wk |
| **P3 Component DB + proof pair** | Schema, connector taxonomy, compatibility rules, ETL worker, license ledger; VX-2 rotors and battery slots component-backed | proof pair renders to datasheet dimensions; HUD physics responds to the pack swap; BOM exports two purchasable SKUs | 2–3 wk |
| **P4 Text-to-CAD GA** | Generation orchestrator on the Anthropic API: retrieval, multi-pass constrained synthesis, validator-in-loop repair, conversational JSON-Patch editing, provenance stamps | 10 canonical briefs yield admitted models ≥ 8/10 without human repair; edits apply in < 3 s | 3–4 wk |
| **P5 Image → 3D** | TRELLIS/photogrammetry workers, primitive refit, alignment UI, photoscan admission path | a photographed motor becomes an equipable parametric component end to end | 3 wk |
| **P6 Simulation depth** | Full Rapier coupling, propulsion and battery models, HUD analytics, disturbance injectors, MJCF/URDF exporters with the parity suite | hover trim agrees across Rapier and MuJoCo within tolerance; endurance estimate within stated error of bench math | 3 wk |
| **P7 Training service** | Task suite v1, SB3 PPO pipeline, randomization config, scorecards, ONNX export, in-browser policy playback | a trained hover + waypoint policy demonstrably flies the twin in-browser from a one-click job | 4 wk |
| **P8 Hardware bridge** | WebSerial config writer, telemetry ingest, system-ID fitting, companion daemon, deployment-ladder UX with the safety supervisor; pilot on one real quad and one rover | a real quad configured from its contract; SITL → HITL → tethered demonstrated and documented; ghost-overlay telemetry live | 4–6 wk |
| **P9 Platform** | Accounts, sharing, marketplace with gatekeeper-stamped listings, BOM agent with vendor links, collaboration | the first external user publishes a model that strangers equip | open |

**Cross-cutting TODO backlog** (tracked from day one): contract JSON-Schema with TypeBox codegen; harness check IDs and the diagnostic format; MJCF/URDF exporter goldens; thrust-table interpolation module; battery-sag unit tests; BVH interference service; port-graph coupler generator v2; pattern-library harvester; prompt-cache prefix builder; license-ledger UI; pairing-code auth for the bridge; quality-tier autoswitcher; schema migration runner; fuzz corpus seed set; scorecard renderer; ghost-overlay telemetry view.

---

## 15. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sim-to-real gap (especially legged) | High | High | archetype gradient (quads and rovers first), randomization plus system ID as product rituals, ladder gating, honest scorecards |
| LLM emits plausible-but-invalid geometry | High | Med | schema-constrained output, bounded self-repair against machine diagnostics, pattern-library grounding, visible validator reports |
| CAD/license entanglement | Med | High | license ledger from day one, derived-LOD-only serving, link-out fallback, legal review before marketplace launch |
| GPU cost creep (photoscan/training) | Med | Med | burst-only GPUs, permanent caching, Batch API for ETL, MJX only when CPU PPO saturates |
| Scope gravity — it wants to be five products | High | High | the loop is the spine; every phase has exit criteria; marketplace and collaboration deliberately last |
| Two-engine physics divergence | Med | Med | one compiled source of truth, parity suite on every upgrade, training side canonical |
| Solo-builder bus factor | High | Med | boring stack, monorepo, validator-enforced invariants, this document |
| Browser API churn (WebSerial/WebGPU) | Low | Med | WebGL2 baseline; companion daemon fallback for the bridge |

---

## 16. Open decisions log

Naming — FORGE is a working codename pending a trademark scan. React versus Solid, revisited after P1 profiling. Whether arm/leg slots split left/right for asymmetric builds (the contract supports it; the UX is deferred). The WASM user-controller timeline (post-P7, pending sandbox design review). Marketplace economics (revenue share versus free with paid compute). On-device policy fine-tuning from real telemetry (research track). Fixed-wing archetype priority. Whether the photoscan alignment UI ships before or with P5 GA.

---

## Appendix A — Contract schema sketch (abridged)

```json
{
  "meta": {"id":"vx2-hornet","name":"VX-2 Hornet","version":"2.0.0",
    "archetype":"multirotor","provenance":{"kind":"human"},"license":"CC-BY-NC"},
  "skeleton":[
    {"name":"root","parent":null,"pos":[0,0.40,0]},
    {"name":"m0","parent":"root","pos":[0.106,0.018,0.106],"joint":{"type":"fixed"}},
    {"name":"s0","parent":"m0","pos":[0,0.030,0],
     "joint":{"type":"revolute","axis":[0,1,0],"maxVelRad":3000}}
  ],
  "parts":[
    {"node":"root","geom":{"kind":"cbox","w":0.085,"h":0.0075,"d":0.105,"ch":0.003},
     "material":"matte","color":"#23262c","collision":"primitive"},
    {"node":"s0","geom":{"kind":"loft","profile":{"kind":"sq","e":2.0,"n":8},
      "stations":[{"y":0.005,"sx":0.0017,"sz":0.0057,"r":0.55},
                  {"y":0.082,"sx":0.0009,"sz":0.0018,"r":0.16}]},
     "material":"matte","color":"#22262e",
     "explode":{"dir":[0,1,0],"mag":0.035,"t0":0.62,"t1":0.92}}
  ],
  "slots":[
    {"id":"battery","label":"POWER","mountNodes":["batt"],
     "variants":[{"id":"b-real-1","componentRef":"cmp_pack_4s1500_xxx",
                  "ports":{"elec":"XT60"}}]}
  ],
  "ports":[{"id":"batt-out","node":"batt","type":"XT60",
            "frame":[[0,0.03,0.082],[0,0,0]]}],
  "driver":{"archetype":"multirotor",
    "params":{"tiltMaxRad":0.40,"yawRate":2.4,"mixer":"x4","pen":[1.25,0.12,1.45]}},
  "sim":{"battery":{"cells":4,"capacity_mAh":1500,"r_int_mohm":18},
         "motors":[{"ref":"cmp_motor_2207_xxx","mount":"m0"}]}
}
```

## Appendix B — Validation suite (gatekeeper checks)

**Geometry:** NaN/Inf scan over all baked vertices across animation frames; ground contact within [−1 mm, +4 mm] across the idle cycle; joint-limit sweep with BVH solid-solid penetration ≤ 0.5 mm; face budget per quality tier; degenerate and zero-area face scan; mass closure within 2 %. **Contract:** schema validity; port resolution or explicit caps; slot default coverage; explode coverage ≥ 80 % of parts with at least one leader-flagged subassembly per slot; a material on every part. **Behavior:** archetype smoke tests (biped walks 1 m without NaN or > 1 mm penetration; multirotor holds altitude ± 5 cm; rover tracks a 1 m arc); servo stability at dt = 50 ms (no oscillation growth); explode/assemble round-trip determinism; pick resolution (every visible part maps to a component or core). **Simulation:** a hover trim exists below 75 % throttle; TWR floor per preset; battery current budget satisfied. **Render:** golden-image perceptual diff on the canonical camera set; the blueprint pass renders. **Provenance:** prompt and seed hashes present on generated content.

## Appendix C — Algorithms and formula reference

**2-bone leg IK (closed form, as derived and shipped):** for a hip-frame target (dy, dz): D = √(dy² + dz²) clamped below L1 + L2; knee β = acos((D² − L1² − L2²) / 2L1L2); γ = atan2(dz, −dy); δ = atan2(L2 sin β, L1 + L2 cos β); hip pitch = −γ − δ; level ankle = −(hip + knee). **Damped least squares (arms):** Δθ = Jᵀ(JJᵀ + λ²I)⁻¹e. **FABRIK** as the general N-bone fallback. **Servo layer:** ẍ = ω²(x_t − x) − 2ζω·ẋ, semi-implicit Euler, stable for ω·dt < 2 (shipping ω 14–16, ζ 0.8–0.85). **Quad mixer:** rpm_i = base + k_t·thr − k_p·p·s_z(i) − k_r·r·s_x(i) + k_y·y·dir(i). **Propulsion:** n ≈ Kv·V_eff·u; T = C_T·ρ·n²·D⁴; Q = C_Q·ρ·n²·D⁵; V_eff = V₀ − I·R_int; endurance ≈ 0.8·C / I_avg. **Decimation:** quadric error metrics (Garland–Heckbert) via meshoptimizer. **Primitive refit:** efficient RANSAC for planes/cylinders/spheres/cones (Schnabel et al., 2007); lathe profiles via PCA axis estimation, radial binning, and spline fit. **PPO:** L = E[min(r_t(θ)·Â_t, clip(r_t, 1 ± ε)·Â_t)] with GAE(λ) advantages (Schulman et al., 2017). **Domain randomization** per Tobin et al. (2017) and Peng et al. (2018). **Mass properties:** signed-tetrahedron sums (divergence theorem) for volume, centroid, and the inertia tensor.

## Appendix D — Primary references

Anthropic API, tool use, structured outputs, Batch, prompt caching: https://docs.claude.com/en/api/overview (model strings, limits, and pricing pinned at implementation time). Three.js — threejs.org. Rapier — rapier.rs. MuJoCo / MJX — mujoco.org. Manifold — github.com/elalish/manifold. OpenCascade.js — ocjs.org. meshoptimizer — github.com/zeux/meshoptimizer. ONNX Runtime Web — onnxruntime.ai. TRELLIS — github.com/microsoft/TRELLIS. COLMAP — colmap.github.io. Stable-Baselines3 — stable-baselines3.readthedocs.io. Schnabel, Wahl, Klein — *Efficient RANSAC for Point-Cloud Shape Detection* (2007). Garland & Heckbert — *Surface Simplification Using Quadric Error Metrics* (1997). Schulman et al. — *Proximal Policy Optimization* (2017). Tobin et al. — *Domain Randomization for Sim-to-Real* (2017).

---

*End of paper. The prototype stays exactly where it is — as the executable specification this document promotes into a system.*
