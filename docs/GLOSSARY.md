# GLOSSARY

Project vocabulary. Terms used in the plan, docs, and (eventually) code.

| Term | Meaning |
|---|---|
| **Admission** | A contract passing the validation harness and entering the registry. Gate for training, export, sharing. |
| **Archetype** | A machine family with a library driver: `biped`, `multirotor`, `rover`, `arm`, `quadruped` (later `fixedwing`). |
| **AUW** | All-up weight — total mass of the configured machine, derived from part masses. |
| **BOM** | Bill of materials — purchasable SKUs (and printed parts) compiled from a contract. |
| **Brief** | A structured design intent (archetype, scale, mass budget, style, part preferences) parsed from a user prompt. |
| **Brief-25** | The 25-brief generation benchmark run as permanent CI (D-evals). |
| **BVH** | Bounding-volume hierarchy — per-part acceleration structure for interference queries. |
| **Chain** | An ordered disassembly sequence driving the staged explode view. |
| **Collision compound** | Per-node set of ≤ 8 convex collider pieces (≤ 24/model) standing in for visual geometry in physics (D7). |
| **Companion computer** | Pi/Jetson-class onboard computer running policies (ONNX/TFLite), speaking MAVLink offboard — policies never run on rate-loop firmware. |
| **Contract / ModelSpec** | The JSON document fully describing a machine (Model Contract v2.1). The unit of generation, validation, compilation, sharing — and the language-portable boundary the Rust core and web face agree on (D16). |
| **Core boundary** | The narrow facade between the Rust core and the TS face: **bake / tick / validate / patch**, zero-copy buffer views, no per-frame JSON. Frozen at P0. |
| **Co-design** | Optimizer-driven search over contract space against user objectives, validator as constraint oracle, returning a Pareto front of admitted designs. |
| **Coupler** | Procedurally generated bridging geometry (bellows/boots/collars/fasteners) emitted from port resolution — never hand-modeled per variant. |
| **Deployment ladder** | The enforced sim-to-real sequence: SITL → HITL → constrained reality → free operation. Never skipped. |
| **DfM** | Design for manufacture — printability checks (min wall, overhang, support volume, bed fit). |
| **Domain randomization** | Training-time variation of masses, motor constants, latency, noise, friction, wind so policies survive reality. |
| **Draft** | A failed generation persisted with its diagnostics; renders and edits but cannot train, export, or share (D14). |
| **Driver** | Library code keyed by archetype, parameterized by the contract; the only behavior a model has. |
| **EnvSpec** | The environment/course sibling schema: terrain, gates, spawns, win conditions, env block. |
| **Estimator block** | Contract-specified state estimator (complementary/EKF with noise, bias, latency); policies observe its output, never ground truth (D8). |
| **Explode** | Staged disassembly animation with per-part windows and leader lines. |
| **FORGE Desktop** | The Tauri shell shipping at P8 (D15): the same web bundle in a webview plus native plugins — serialport-rs serial, real filesystem, background recorder. The bridge's power surface. |
| **FORGE Link** | The flashable companion-computer image (rosbridge, MAVLink router, ONNX runtime, pairing-code auth). |
| **forge-core** | The Rust workspace of truth (D16): `forge-contract`, `forge-geometry`, `forge-motion`, `forge-sim`, `forge-validate` — dual-compiled to native and WASM. Apache-2.0. |
| **forge-validate** | The gatekeeper as an artifact (D17): one implementation shipped as static binary, npm WASM package, and crates.io crate — bit-exact across targets. |
| **Flywheel** | The compounding data loop: admitted models → pattern library; telemetry → tighter twins + curricula; community courses/skills → head starts. |
| **Gatekeeper** | The validation harness in its sovereign role — same machine admits first-party, generated, and community content. |
| **Ghost (overlay)** | The twin's predicted trajectory rendered under real telemetry; divergence made visible for forensics and system ID. |
| **Golden test** | Comparison against a stored known-good artifact (image, exporter output, fixture counts). |
| **Golden-number suite** | The cross-target exactness gate (D17): canonical scenes and recorded trajectories asserted bit-identical native↔WASM in CI on every core change (XT-001). |
| **HITL** | Hardware-in-the-loop — real FC/microcontroller in the loop against the simulator over serial. |
| **HUD** | The studio's live readout (AUW, TWR, hover throttle, current, endurance) — derived, assumptions inspectable. |
| **Lockfile** | Per-model resolution of semver `componentRef`s to immutable catalog revisions (D5). |
| **MJCF** | MuJoCo's model format — the training compile target. |
| **Monolith / prototype** | `cad-object-studio.html`, the single-file reference implementation; frozen as executable specification — and the parity oracle for the Rust port (D16). |
| **Pattern library** | Validated part-group idioms harvested (with consent) from admitted models; grounds generation retrieval. |
| **Parity suite** | Cross-engine tests (drop, pendulum, hover trim, gait CoM) keeping Rapier and MuJoCo within tolerance; training side canonical (D20). Distinct from the golden-number suite (which compares our own targets). |
| **Port** | A typed connection point (mechanical pattern, electrical connector, data bus) on a node; couplers/fasteners/wires are generated from port resolution. |
| **Primitive refit** | Converting scanned meshes back to parametric primitives (RANSAC planes/cylinders/spheres/cones, lathe profiles); measured acceptance per D13. |
| **Proof pair** | The first two real catalog components (2207-class motor + 4S 1500 mAh pack) backing VX-2 slots at P3. |
| **Provenance** | The origin chain on every artifact: model versions, prompt hashes, seeds, validator reports, training lineage, ladder history. |
| **Reference rigs** | The frozen physical test fixtures (D12): ArduPilot-capable 5″ quad + Pi-class rover. |
| **Replay** | A serialized session: {contract hash + lockfile, env, seed, input/telemetry tape}. Bit-exact and verifiable on any surface (D17); server re-verification is anti-cheat hygiene. |
| **Scorecard** | A policy's gatekeeper artifact: success rate, robustness across the randomization grid, energy. Sub-threshold → no export. |
| **Success ladder** | The four rungs (D18): R1 best build-verification surface (P1–P4) · R2 the standard path to simulation-ready models (P5–P7) · R3 the autonomy loop as product (P7–P9) · R4 the platform (P10–P12). |
| **Shimmer** | The painter's-algorithm artifact on overlapping solids in the prototype; structurally unfixable there; dies by construction with a z-buffer (P1 exit criterion). |
| **SITL** | Software-in-the-loop — policy flies the twin under full randomization. |
| **Skill** | A tradeable trained policy: ONNX + derived I/O header + scorecard + lineage. |
| **Slot / Variant** | A swappable mount point on a model / one equipable option for it (inline parts or `componentRef`). |
| **Safety supervisor** | The ≥ 200 Hz authority wrapping deployed policies: geofence, envelopes, battery floor, kill switch, fallback controller (D9). |
| **System ID** | Fitting real telemetry (thrust pulls, logs, step responses) back into the contract's sim block. |
| **TWR** | Thrust-to-weight ratio. Freestyle floor: reject < 1.8, warn < 2.5. |
| **Twin (digital)** | The simulated instance of a contract used for verification, training, and ghost comparison. |
| **Upstream of CAD** | The positioning (D18): FORGE answers "give me a verified, simulated, trainable machine from parts that exist" — mass-properties-correct over surface-exact; mechanical CAD consumes FORGE's STEP output downstream. |
| **URDF** | ROS robot description format — deployment compile target and (P6) import source. |
| **Validator / harness** | The deterministic headless check suite. See gatekeeper. |
| **Wedge** | The market-entry strategy: be the place FPV builds are verified before money is spent (D1). |

External tools/libraries (one-liners): **Three.js** (rendering) · **Rapier**
(client physics — the same Rust crate natively and as WASM) · **MuJoCo/MJX**
(training physics, CPU/GPU) · **Manifold** (CSG, behind a core trait) ·
**OpenCascade/OCCT** (B-rep, STEP, fillets, DfM — server-side) · **meshoptimizer**
(decimation/LOD) · **ONNX Runtime Web** (in-browser inference) · **TRELLIS**
(image→3D) · **COLMAP** (photogrammetry) · **Stable-Baselines3** (PPO/SAC) ·
**Optuna** (Bayesian optimization) · **schemars** (Rust types → JSON Schema, the
schema's single source) · **wasm-pack / wasm-bindgen** (the WASM facade build) ·
**napi-rs** (native Node bindings, hot-path option) · **Tauri** (FORGE Desktop
shell) · **serialport-rs** (Desktop serial plugin) · **TypeBox** (gateway route
schemas) · **graphile-worker** (Postgres job queue) · **pgvector** (embedding
search).
