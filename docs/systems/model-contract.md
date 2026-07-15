# Model Contract v2.2 — implementation doc

**Status:** implemented and compatibility-gated · **Phases:** P0 (authoring), evolves always · **Home:**
`crates/forge-contract` · **Plan refs:** §4, Appendix A (v3.0) ·
**Decisions:** D5, D7, D8, D10, D16, D19, D31, D32

## 1. Purpose

The contract is the heart of the system: **a model is a JSON document; the only code
lives in versioned engine libraries the document references by name and
parameterizes.** This one decision makes models LLM-generable, machine-checkable,
diffable, shareable, safe — and language-portable: the contract is the boundary the
Rust core and the web face agree on (D16). Every other system either produces
contracts (generation, import, co-design), checks them (`forge-validate`), or
compiles them (render, motion, sim, training, manufacturing, BOM).

## 2. Responsibilities & non-goals

Owns: the contract types **as Rust** (serde), JSON-Schema emission via **schemars**
(the schema's single source of truth — the same schema the LLM is constrained
against and TS types are codegen'd from, XC-01), schema versioning + migrations
(XC-23), lockfile semantics/resolution, and the *definitions* of compile-target
mappings. Does not own: compiler implementations (live with their engines),
validation logic (`forge-validate`), catalog data (component DB).

## 3. Document structure (field reference)

A `ModelSpec`:

| Block | Contents | Notes |
|---|---|---|
| `meta` | id, name, semver version, archetype tag, license, provenance chain `{kind: human \| parametric-generator \| llm-generation, promptHash?, modelVersion?, seed?}` | provenance validated by `PRV-*` checks |
| `env` | `{gravity: 9.80665, airDensity: 1.225, wind: {mean, gust}}` | no physical constant is ambient; overridable per scene/course |
| `skeleton[]` | `{name, parent, pos[m], rot[rad], limits[[minX,maxX],[minY,maxY],[minZ,maxZ]], joint?: {type: fixed\|revolute\|spherical, axis, maxTorqueNm?, maxVelRad?}}` | one tree drives visuals AND physics export |
| `parts[]` | `{node, geom, material, color, explode?, renderBias?, comp?, mass?: {value_g \| density_kgm3}, collision?: auto\|hull\|primitive\|none}` | `geom` is the tagged union below |
| `slots[]` | v2.2 shape is `{id, label, mountNodes[], joint?, equippedVariantId?, variants[]}`; variant = `{id, name, desc, parts[]} \| {id, componentRef, ports{}}` | `equippedVariantId` must match exactly one unique variant for every non-empty slot. Only that variant contributes parts, catalog refs, ports, simulation, lockfile requirements, or BOM rows (D32/XC-28). `componentRef` is semver-ranged into the catalog. |
| `lockfile` | map `componentRef@range → exact immutable revision` | D5; admission requires full resolution |
| `ports[]` | `{id, node, frame, type}` — type from the connector taxonomy (mechanical patterns, electrical, data) | couplers/fasteners/wires *generated* from resolution |
| `chains[]` + per-part `explode` | staged disassembly windows `{dir, mag, t0, t1}` | coverage is a completeness gate |
| `driver` | `{archetype: biped\|multirotor\|rover\|arm\|quadruped\|fixedwing, params{...}}` | **never code** (D19) |
| `materials` | five classes gloss/metal/satin/matte/rubber → PBR; extensible to textured PBR for imported meshes | a material on every part is a gate |
| `sim` | masses/overrides; `colliders: {policy, budget{perNode: 8, perModel: 24}}` (D7); propulsion `{motors[{kv, r_int, mount} \| {ref, mount}], props[{diameter_in, pitch_in, blades, ct_table?}], battery{cells, capacity_mAh, c_rating, r_int}}`; `estimator: {kind: complementary\|ekf, gyroNoise, accelNoise, bias, latency_ms}` (D8) | auto-populated where slots are catalog-backed |

**Geometry tagged union:** `box, cbox, taper, cyl, lathe(profile|spline), squircle,
loft(profile, stations[]), mesh(ref)` — `mesh` admits imported real-part geometry with
smoothing groups. Worked example: plan Appendix A (v2.1 JSON).

D44 makes optional schema fields explicit capability gates rather than global
defaults. A rover or quadruped entering the real ground trainer must declare one
complementary estimator and, on every commanded revolute joint, a finite axis,
angular limits, positive `maxTorqueNm`, and positive `maxVelRad`. Rover v1 must also
carry equal-radius cylindrical left/right wheel geometry with at least 50 mm track.
The trainer refuses absent authority; it never guesses a motor rating, wheel size,
or control joint. The QD-Mini generator derives its joint torque ceiling as two times
the equal-load static support moment from declared total mass, gravity, stand height,
and leg count, assigns each moving segment's mass/inertia to its actuated parent body,
and emits the explicit complementary estimator. These are generated contract facts,
not Python-side overrides.

## 4. Conventions (binding, plan §4)

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

## 6. Compile targets (one contract, many artifacts — both directions)

| Target | Consumer | Owner |
|---|---|---|
| baked GPU buffers + scene graph | render layer (TS) | `forge-geometry` bake via the facade |
| MJCF | training | `forge-sim` exporters |
| URDF + ros2_control | ROS 2 deployment, third-party sims | `forge-sim` exporters |
| STEP / 3MF / STL | manufacturing (license-filtered, D10; STEP is **first-class**, D18) | OCCT worker |
| BOM (CSV/JSON) | purchasing | gateway |
| firmware config diffs | hardware bridge | bridge/Desktop |
| ONNX policy I/O header | learning engine | training pipeline |

**Import direction (P6):** URDF/MJCF importer — links/bodies→nodes, visual
geoms→mesh-ref parts, collision geoms→primitive collision parts, joints→joint
blocks. The deterministic subset imports to schema-valid, slotless contracts from
static fixtures (`crates/forge-sim/tests/fixtures/import_rover.*`); external
external driveable robot import is live as of 2026-06-15 for the URDF/MJCF
rover fixtures: primitive visuals stay bakeable, imported parts carry explode
windows, inferred rover driver params pass CTR-008, and the full validator
admits the resulting contracts before a `RoverDriver` one-meter smoke.

## 7. Versioning & migrations

Schema is semver'd. Historical contracts load through the Rust migration runner
before the shape gate; the current XC-23 runner targets `2.2.0`/`current`, drops
legacy schema-version markers, normalizes known field aliases, and then re-validates
against the current `ModelSpec`. For a 2.1 slot with one alternative, migration sets
that ID deterministically and records `equip-single-variant-slots-v2.2`. For multiple
alternatives it refuses to guess and requires the author to set `equippedVariantId`
before retrying.

```bash
cargo run -q -p forge-validate -- migrate path/to/model.forge.json --out migrated.forge.json
pnpm schema:migrate path/to/model.forge.json --out migrated.forge.json
```

Breaking schema changes require a DECISIONS entry and a new compatibility row.
The authoritative support range and change/deprecation rules live in
[`../COMPATIBILITY.md`](../COMPATIBILITY.md); `compatibility/compatibility.json` is
checked against source constants by `pnpm verify:compatibility`.
The lockfile pins catalog revisions inside the document; the emitted schema and
validator version pin contract shape at validation time. Historical schema
markers are consumed by migration and omitted from the current typed output.

## 8. Code surface *(proposed)*

```rust
// crates/forge-contract
pub struct ModelSpec { /* serde + schemars derives */ }
pub fn emit_json_schema() -> String;                  // the single schema source
pub fn validate_shape(doc: &str) -> ShapeResult;      // schema-only (CTR-001)
pub fn resolve_lockfile(spec: &ModelSpec, catalog: &dyn CatalogSource) -> Resolution;
pub fn migrate(doc: &str, to_version: &str) -> Result<ModelSpec>;
pub fn migrate_with_report(doc: &str, to_version: &str) -> Result<MigrationReport>;
pub const SCHEMA_VERSION: &str;
```

TS types are **codegen'd from the schemars output** (XC-01) for studio/gateway;
Python workers validate payloads against the same emitted schema artifact. Never
hand-mirror types in any language.

## 9. Dependencies

None (the root crate). Everything depends on it.

## 10. Validation & testing

Schema round-trip tests (Appendix-A example + both P0 translated models); migration
tests (every historical version → current); fuzz the tagged unions (XC-24 feeds
this); lockfile resolution unit tests incl. missing-revision failure modes; codegen
pipeline test (emitted schema → TS types compile and match fixtures). QA-007 adds a
registered JSON Patch corpus covering escaped pointers, array append/bounds, test
failure, required-field removal, unsupported operations, root refusal, malformed
patch documents, and schema closure. Property tests retain the stronger invariant:
arbitrary supported patch attempts either refuse or emit a shape-valid contract and
never panic.

## 11. Phase mapping

- **P0:** author types + schemars emission (P0-001), TS codegen (P0-002), translate
  humanoid + VX-2 + 31 variants (P0-005..007).
- **P2:** migration runner live (XC-23). **P3:** lockfile resolution live (P3-006).
- **P6:** importer (P6-009). Evolves with every system after.

## 12. Open questions

Left/right asymmetric slot UX (OD-03 — schema already supports); exact
`componentRef` range syntax (npm-style semver assumed *(proposed)*); whether `chains`
belong per-model or can be slot-contributed (currently per-model); codegen tool pick
for schemars→TS (json-schema-to-typescript vs typebox-codegen — decide at P0-002).
