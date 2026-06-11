# Model Contract v2.1 — implementation doc

**Status:** not started · **Phases:** P0 (authoring), evolves always · **Package:**
`packages/contract` *(proposed)* · **Plan refs:** §4, Appendix A · **Decisions:** D5,
D7, D8, D10, D15

## 1. Purpose

The contract is the heart of the system: **a model is a JSON document; the only code
lives in versioned engine libraries the document references by name and
parameterizes.** This one decision makes models LLM-generable, machine-checkable,
diffable, shareable, and safe. Every other system either produces contracts
(generation, import, co-design), checks them (harness), or compiles them (render,
motion, sim, training, manufacturing, BOM).

## 2. Responsibilities & non-goals

Owns: the JSON Schema, TypeBox codegen of TS types, schema versioning + migrations
(XC-23), lockfile semantics, and the *definitions* of compile-target mappings.
Does not own: compiler implementations (live with their engines), validation logic
(harness), catalog data (component DB).

## 3. Document structure (field reference)

A `ModelSpec`:

| Block | Contents | Notes |
|---|---|---|
| `meta` | id, name, semver version, archetype tag, license, provenance chain `{kind: human \| parametric-generator \| llm-generation, promptHash?, modelVersion?, seed?}` | provenance validated by `PRV-*` checks |
| `env` | `{gravity: 9.80665, airDensity: 1.225, wind: {mean, gust}}` | no physical constant is ambient; overridable per scene/course |
| `skeleton[]` | `{name, parent, pos[m], rot[rad], limits[[minX,maxX],[minY,maxY],[minZ,maxZ]], joint?: {type: fixed\|revolute\|spherical, axis, maxTorqueNm?, maxVelRad?}}` | one tree drives visuals AND physics export |
| `parts[]` | `{node, geom, material, color, explode?, renderBias?, comp?, mass?: {value_g \| density_kgm3}, collision?: auto\|hull\|primitive\|none}` | `geom` is the tagged union below |
| `slots[]` | `{id, label, mountNodes[], joint?, variants[]}`; variant = `{id, name, desc, parts[]} \| {id, componentRef, ports{}}` | `componentRef` is semver-ranged into the catalog |
| `lockfile` | map `componentRef@range → exact immutable revision` | D5; admission requires full resolution |
| `ports[]` | `{id, node, frame, type}` — type from the connector taxonomy (mechanical patterns, electrical, data) | couplers/fasteners/wires *generated* from resolution |
| `chains[]` + per-part `explode` | staged disassembly windows `{dir, mag, t0, t1}` | coverage is a completeness gate |
| `driver` | `{archetype: biped\|multirotor\|rover\|arm\|quadruped\|fixedwing, params{...}}` | **never code** (D15) |
| `materials` | five classes gloss/metal/satin/matte/rubber → PBR; extensible to textured PBR for imported meshes | a material on every part is a gate |
| `sim` | masses/overrides; `colliders: {policy, budget{perNode: 8, perModel: 24}}` (D7); propulsion `{motors[{kv, r_int, mount} \| {ref, mount}], props[{diameter_in, pitch_in, blades, ct_table?}], battery{cells, capacity_mAh, c_rating, r_int}}`; `estimator: {kind: complementary\|ekf, gyroNoise, accelNoise, bias, latency_ms}` (D8) | auto-populated where slots are catalog-backed |

**Geometry tagged union:** `box, cbox, taper, cyl, lathe(profile|spline), squircle,
loft(profile, stations[]), mesh(ref)` — `mesh` admits imported real-part geometry with
smoothing groups. Worked example: plan Appendix A (v2.1 JSON).

## 4. Conventions (binding, plan §3.2/§4)

Y-up right-handed meters internally (exporters convert to Z-up for URDF/MJCF/STEP);
radians; seconds; **grams at the schema surface, kg internally**; manufacturing
tolerance ±0.1 mm default with explicit tolerance fields where geometry meets
manufacturing; semver on contracts, components, schema itself.

## 5. Completeness gates — "no static models" (plan §4.3)

Admission requires (harness check IDs in parentheses — see
[`validation-harness.md`](validation-harness.md)):
material on every part (CTR-005); blueprint renders cleanly (RND-002); declared driver
archetype passing its smoke test (BEH-001); idle pose holds ground contact (GEO-002);
explode coverage ≥ 80 % with ≥ 1 leader-flagged subassembly per slot (CTR-004); ports
resolved or explicitly capped (CTR-002); mass closure ≤ 2 % (GEO-006); collider
compounds within budget (CTR-007); lockfile fully resolved (CTR-006).

## 6. Compile targets (one contract, many artifacts)

| Target | Consumer | Owner |
|---|---|---|
| GPU mesh buffers + scene graph | render engine | `engines/render` |
| MJCF | training | `engines/sim` exporters |
| URDF + ros2_control | ROS 2 deployment, third-party sims | `engines/sim` exporters |
| STEP / 3MF / STL | manufacturing (license-filtered, D10) | OCCT worker |
| BOM (CSV/JSON) | purchasing | gateway |
| firmware config diffs | hardware bridge | `link`/bridge |
| ONNX policy I/O header | learning engine | `engines/policy` |

**Import direction (P6):** URDF/MJCF importer — links→nodes, visual geoms→mesh parts
(decimation + optional refit), collision geoms→compounds, joints→joint blocks;
imported models are monolithic (no slots) until a user carves slots in the editor.

## 7. Versioning & migrations

Schema is semver'd. A v2.3 contract must load in a v2.5 studio (compatibility matrix);
migrations are scripts in `packages/contract/migrations` run by the migration runner
(XC-23). Breaking schema changes require a DECISIONS entry. The lockfile pins catalog
revisions; the *schema version* pins contract shape — both travel with the document.

## 8. TypeScript surface *(proposed)*

```ts
// packages/contract
export type ModelSpec = Static<typeof ModelSpecSchema>;   // TypeBox-derived
export function validateShape(doc: unknown): ShapeResult; // schema-only (CTR-001)
export function resolveLockfile(spec: ModelSpec, catalog: CatalogClient): Promise<Resolution>;
export function migrate(doc: unknown, toVersion: string): ModelSpec;
export const SCHEMA_VERSION: string;
```

Python workers validate against the same published JSON Schema artifact — the schema
file is the inter-language contract; never hand-mirror types.

## 9. Dependencies

None (the root package). Everything depends on it.

## 10. Validation & testing

Schema round-trip tests (Appendix-A example + both P0 translated models); migration
tests (every historical version → current); fuzz the tagged unions (XC-24 feeds
this); lockfile resolution unit tests incl. missing-revision failure modes.

## 11. Phase mapping

- **P0:** author schema v2.1 (P0-001), TypeBox codegen (P0-002), translate humanoid +
  VX-2 + 31 variants (P0-005..007).
- **P2:** migration runner (XC-23). **P3:** lockfile resolution live (P3-006).
- **P6:** importer (P6-009). Evolves with every system after.

## 12. Open questions

Left/right asymmetric slot UX (OD-03 — schema already supports); exact
`componentRef` range syntax (npm-style semver assumed *(proposed)*); whether `chains`
belong per-model or can be slot-contributed (currently per-model).
