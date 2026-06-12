//! FORGE Model Contract v2.1 — the single source of truth for the schema (D16).
//!
//! A model is a JSON document; the only code lives in versioned engine libraries the
//! document references by name and parameterizes (D19). These Rust types carry serde
//! and schemars derives; the schemars-emitted JSON Schema is what the LLM is
//! constrained against and what TS/Python types are generated from. Never
//! hand-mirror these types in another language.
//!
//! Conventions (binding): Y-up right-handed meters internally; radians; seconds;
//! grams at the schema surface (kg internally where engines compute).

#![forbid(unsafe_code)]

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub mod patch;

/// Contract schema version carried by `meta.version`-bearing documents.
pub const SCHEMA_VERSION: &str = "2.1.0";

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum Archetype {
    Biped,
    Multirotor,
    Rover,
    Arm,
    Quadruped,
    Fixedwing,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum ProvenanceKind {
    Human,
    ParametricGenerator,
    LlmGeneration,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Provenance {
    pub kind: ProvenanceKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub id: String,
    pub name: String,
    /// Semver of this model document.
    pub version: String,
    pub archetype: Archetype,
    pub provenance: Provenance,
    pub license: String,
}

// ---------------------------------------------------------------------------
// env — no physical constant is ambient
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Wind {
    #[serde(default)]
    pub mean: f64,
    #[serde(default)]
    pub gust: f64,
}

impl Default for Wind {
    fn default() -> Self {
        Wind {
            mean: 0.0,
            gust: 0.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct EnvBlock {
    /// m/s²
    #[serde(default = "EnvBlock::default_gravity")]
    pub gravity: f64,
    /// kg/m³
    #[serde(default = "EnvBlock::default_air_density")]
    pub air_density: f64,
    #[serde(default)]
    pub wind: Wind,
}

impl EnvBlock {
    fn default_gravity() -> f64 {
        9.80665
    }
    fn default_air_density() -> f64 {
        1.225
    }
}

impl Default for EnvBlock {
    fn default() -> Self {
        EnvBlock {
            gravity: Self::default_gravity(),
            air_density: Self::default_air_density(),
            wind: Wind::default(),
        }
    }
}

// ---------------------------------------------------------------------------
// skeleton
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum JointKind {
    Fixed,
    Revolute,
    Spherical,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Joint {
    #[serde(rename = "type")]
    pub kind: JointKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub axis: Option<[f64; 3]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_torque_nm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_vel_rad: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub name: String,
    /// `None` for the root node.
    pub parent: Option<String>,
    /// Meters, parent-local.
    pub pos: [f64; 3],
    /// Radians, XYZ euler, parent-local.
    #[serde(default)]
    pub rot: [f64; 3],
    /// Per-axis [min,max] joint limits in radians: [[minX,maxX],[minY,maxY],[minZ,maxZ]].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limits: Option<[[f64; 2]; 3]>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub joint: Option<Joint>,
}

// ---------------------------------------------------------------------------
// parts & geometry
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum MaterialClass {
    Gloss,
    Metal,
    Satin,
    Matte,
    Rubber,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum CollisionPolicy {
    #[default]
    Auto,
    Hull,
    Primitive,
    None,
}

/// Mass is either stated directly (grams, schema surface) or derived from the
/// part's volume × a density override; absent → density from the material class.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MassSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value_g: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub density_kgm3: Option<f64>,
}

/// Loft cross-section profile.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum LoftProfile {
    /// Superellipse ("squircle") profile: exponent `e`, sampled with `n` segments
    /// per quadrant.
    Sq {
        e: f64,
        n: u32,
    },
    Circle {
        n: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct LoftStation {
    /// Height of this station along local Y (meters).
    pub y: f64,
    /// Half-extent scale along X (meters).
    pub sx: f64,
    /// Half-extent scale along Z (meters).
    pub sz: f64,
    /// Corner roundness 0..1 (0 = boxy, 1 = elliptical). Parameterization is
    /// *(proposed)* pending prototype reconciliation (PRE-002).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub r: Option<f64>,
}

/// The primitive vocabulary (tagged union). Dimension fields are meters.
/// Exact parameterizations beyond Appendix A are *(proposed)* until reconciled
/// against the prototype (PRE-002).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Geom {
    Box {
        w: f64,
        h: f64,
        d: f64,
    },
    /// Chamfered box: vertical edges cut by `ch`.
    Cbox {
        w: f64,
        h: f64,
        d: f64,
        ch: f64,
    },
    /// Rectangular frustum: bottom (w0,d0) to top (w1,d1) over height h.
    Taper {
        w0: f64,
        d0: f64,
        w1: f64,
        d1: f64,
        h: f64,
    },
    /// Cylinder / cone: bottom radius r0, top radius r1 (defaults to r0), height
    /// h, n radial segments.
    Cyl {
        r0: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        r1: Option<f64>,
        h: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        n: Option<u32>,
    },
    /// Surface of revolution: profile polyline of [radius, y] pairs revolved
    /// around local Y with n segments.
    Lathe {
        profile: Vec<[f64; 2]>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        n: Option<u32>,
    },
    /// Superellipse prism: half-extents rx/rz, exponent e, height h, n segments
    /// per quadrant.
    Squircle {
        rx: f64,
        rz: f64,
        h: f64,
        e: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        n: Option<u32>,
    },
    /// Lofted solid through stations along local Y.
    Loft {
        profile: LoftProfile,
        stations: Vec<LoftStation>,
    },
    /// Imported mesh by asset reference (admitted via the P5 pipeline).
    Mesh {
        #[serde(rename = "ref")]
        asset_ref: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Explode {
    /// Direction (node-local) the part travels during staged explode.
    pub dir: [f64; 3],
    /// Travel magnitude in meters.
    pub mag: f64,
    /// Window within the global explode phase [0,1].
    pub t0: f64,
    pub t1: f64,
    /// Leader-flagged subassembly label (counts toward CTR-004).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub leader: Option<String>,
}

/// Part-local pose applied before node placement (prototype `P(node, mesh,
/// {p, r, s})` — the executable spec). Rotation composes T·Ry·Rx·Rz·S.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PartPose {
    #[serde(default)]
    pub p: [f64; 3],
    #[serde(default)]
    pub r: [f64; 3],
    #[serde(default = "PartPose::unit_scale")]
    pub s: [f64; 3],
}

impl PartPose {
    fn unit_scale() -> [f64; 3] {
        [1.0, 1.0, 1.0]
    }
}

impl Default for PartPose {
    fn default() -> Self {
        PartPose {
            p: [0.0; 3],
            r: [0.0; 3],
            s: [1.0, 1.0, 1.0],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    /// Skeleton node this part attaches to.
    pub node: String,
    pub geom: Geom,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pose: Option<PartPose>,
    pub material: MaterialClass,
    /// Hex color, e.g. "#23262c".
    pub color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub explode: Option<Explode>,
    /// Polygon-offset hint for true coplanar decals only (plan §7.2).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub render_bias: Option<f64>,
    /// Component tag for pick resolution (BEH-004).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comp: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mass: Option<MassSpec>,
    #[serde(default)]
    pub collision: CollisionPolicy,
}

// ---------------------------------------------------------------------------
// slots, ports, chains
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
    /// Inline parts (exactly one of `parts` / `componentRef` must be present —
    /// enforced by CTR-003 semantics, not by shape).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parts: Option<Vec<Part>>,
    /// Semver-ranged reference into the catalog, e.g. "cmp_pack_4s1500@^2" (D5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub component_ref: Option<String>,
    /// Port declarations contributed by this variant (e.g. {"elec": "XT60"}).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub ports: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Slot {
    pub id: String,
    pub label: String,
    pub mount_nodes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub joint: Option<Joint>,
    pub variants: Vec<Variant>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Port {
    pub id: String,
    pub node: String,
    /// Connector taxonomy type, e.g. "XT60", "stack-30.5x30.5-M3", "UART".
    #[serde(rename = "type")]
    pub kind: String,
    /// [[x,y,z],[rx,ry,rz]] node-local frame.
    pub frame: [[f64; 3]; 2],
    /// Explicitly capped ports count as resolved (CTR-002).
    #[serde(default)]
    pub capped: bool,
}

/// Staged disassembly: one row per kinematic-chain node, reconciled to the
/// prototype's chains table `[node, dir, dist, t0, t1]` (PRE-002).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Chain {
    pub id: String,
    pub stage: u32,
    pub nodes: Vec<String>,
    /// Node-local explode direction.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dir: Option<[f64; 3]>,
    /// Travel distance, meters.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mag: Option<f64>,
    /// Window within the global explode phase.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub t0: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub t1: Option<f64>,
}

// ---------------------------------------------------------------------------
// driver — never code (D19)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Driver {
    pub archetype: Archetype,
    /// Archetype-specific parameter block, validated by the driver library's
    /// param schema at admission.
    #[serde(default)]
    pub params: serde_json::Value,
}

// ---------------------------------------------------------------------------
// sim block
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Battery {
    pub cells: u32,
    #[serde(rename = "capacity_mAh")]
    pub capacity_mah: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub c_rating: Option<f64>,
    /// Plan Appendix A spells this snake_case; the appendix is authoritative.
    #[serde(rename = "r_int_mohm")]
    pub r_int_mohm: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct MotorSpec {
    /// Inline motor constants (synthetic/generated parts) …
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kv: Option<f64>,
    #[serde(
        rename = "r_int_mohm",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub r_int_mohm: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_current_a: Option<f64>,
    /// … or a catalog reference (resolved through the lockfile, D5).
    #[serde(rename = "ref", default, skip_serializing_if = "Option::is_none")]
    pub component_ref: Option<String>,
    /// Mount node (e.g. "m0").
    pub mount: String,
    /// Spin direction: +1 CCW, -1 CW (mixer input). Defaults alternate by index.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dir: Option<i8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PropSpec {
    pub diameter_in: f64,
    pub pitch_in: f64,
    pub blades: u32,
    /// Optional published thrust table reference (XC-06).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ct_table: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ColliderBudget {
    #[serde(default = "ColliderBudget::default_per_node")]
    pub per_node: u32,
    #[serde(default = "ColliderBudget::default_per_model")]
    pub per_model: u32,
}

impl ColliderBudget {
    fn default_per_node() -> u32 {
        8
    }
    fn default_per_model() -> u32 {
        24
    }
}

impl Default for ColliderBudget {
    fn default() -> Self {
        ColliderBudget {
            per_node: 8,
            per_model: 24,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ColliderPolicy {
    #[serde(default = "ColliderPolicy::default_policy")]
    pub policy: String,
    #[serde(default)]
    pub budget: ColliderBudget,
}

impl ColliderPolicy {
    fn default_policy() -> String {
        "per-node-compound".to_string()
    }
}

impl Default for ColliderPolicy {
    fn default() -> Self {
        ColliderPolicy {
            policy: Self::default_policy(),
            budget: ColliderBudget::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum EstimatorKind {
    Complementary,
    Ekf,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct Estimator {
    pub kind: EstimatorKind,
    pub gyro_noise: f64,
    pub accel_noise: f64,
    pub bias: f64,
    /// Plan Appendix A spells this snake_case; the appendix is authoritative.
    #[serde(rename = "latency_ms")]
    pub latency_ms: f64,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SimBlock {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub battery: Option<Battery>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub motors: Vec<MotorSpec>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub props: Vec<PropSpec>,
    #[serde(default)]
    pub colliders: ColliderPolicy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimator: Option<Estimator>,
    /// Aggregate mass override in grams; when present, GEO-006 checks closure.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aggregate_mass_g: Option<f64>,
}

// ---------------------------------------------------------------------------
// the document
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ModelSpec {
    pub meta: Meta,
    #[serde(default)]
    pub env: EnvBlock,
    pub skeleton: Vec<Node>,
    pub parts: Vec<Part>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub slots: Vec<Slot>,
    /// componentRef@range → exact immutable revision (D5).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub lockfile: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ports: Vec<Port>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub chains: Vec<Chain>,
    pub driver: Driver,
    #[serde(default)]
    pub sim: SimBlock,
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct ShapeError {
    pub message: String,
    pub line: usize,
    pub column: usize,
}

impl std::fmt::Display for ShapeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} (line {}, column {})",
            self.message, self.line, self.column
        )
    }
}

impl std::error::Error for ShapeError {}

/// Schema-only validation (CTR-001): parse a JSON document into a `ModelSpec`.
pub fn validate_shape(doc: &str) -> Result<ModelSpec, ShapeError> {
    serde_json::from_str(doc).map_err(|e| ShapeError {
        message: e.to_string(),
        line: e.line(),
        column: e.column(),
    })
}

/// Emit the JSON Schema (the single source all other languages derive from).
pub fn emit_json_schema() -> String {
    let schema = schemars::schema_for!(ModelSpec);
    serde_json::to_string_pretty(&schema).expect("schema serializes")
}

/// Canonical content hash of a contract (sha256 over its serde serialization;
/// maps are BTreeMaps so key order is stable).
pub fn contract_hash(spec: &ModelSpec) -> String {
    use sha2::{Digest, Sha256};
    let canonical = serde_json::to_vec(spec).expect("contract serializes");
    let mut h = Sha256::new();
    h.update(&canonical);
    hex(&h.finalize())
}

/// Hash of the lockfile alone (report envelope field).
pub fn lockfile_hash(spec: &ModelSpec) -> String {
    use sha2::{Digest, Sha256};
    let canonical = serde_json::to_vec(&spec.lockfile).expect("lockfile serializes");
    let mut h = Sha256::new();
    h.update(&canonical);
    hex(&h.finalize())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Catalog lookup boundary for lockfile resolution (D5). The real catalog lives
/// in Postgres behind the gateway; tests and the CLI use in-memory sources.
pub trait CatalogSource {
    /// Returns true if `component_id@exact_revision` exists as an immutable revision.
    fn has_revision(&self, component_id: &str, revision: &str) -> bool;
}

#[derive(Debug, Clone, PartialEq)]
pub struct UnresolvedRef {
    pub component_ref: String,
    pub reason: String,
}

/// Resolve every componentRef in the document against the lockfile (D5).
/// Returns the list of unresolved refs (empty = fully resolved, CTR-006 pass).
pub fn resolve_lockfile(spec: &ModelSpec, catalog: &dyn CatalogSource) -> Vec<UnresolvedRef> {
    let mut unresolved = Vec::new();
    let mut check = |component_ref: &str| {
        match spec.lockfile.get(component_ref) {
            None => unresolved.push(UnresolvedRef {
                component_ref: component_ref.to_string(),
                reason: "missing from lockfile".to_string(),
            }),
            Some(pin) => {
                // pin format: "<component_id>@<exact_semver>"
                match pin.rsplit_once('@') {
                    None => unresolved.push(UnresolvedRef {
                        component_ref: component_ref.to_string(),
                        reason: format!("lockfile pin '{pin}' is not '<id>@<version>'"),
                    }),
                    Some((id, rev)) => {
                        if !catalog.has_revision(id, rev) {
                            unresolved.push(UnresolvedRef {
                                component_ref: component_ref.to_string(),
                                reason: format!("pinned revision '{pin}' not in catalog"),
                            });
                        }
                    }
                }
            }
        }
    };
    for slot in &spec.slots {
        for v in &slot.variants {
            if let Some(r) = &v.component_ref {
                check(r);
            }
        }
    }
    for m in &spec.sim.motors {
        if let Some(r) = &m.component_ref {
            check(r);
        }
    }
    unresolved
}

impl ModelSpec {
    /// Look up a skeleton node by name.
    pub fn node(&self, name: &str) -> Option<&Node> {
        self.skeleton.iter().find(|n| n.name == name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Abridged Appendix-A document (plan v3.0) — must round-trip.
    const APPENDIX_A: &str = r##"{
      "meta": {"id":"vx2-hornet","name":"VX-2 Hornet","version":"2.1.0",
        "archetype":"multirotor","provenance":{"kind":"human"},"license":"CC-BY-NC"},
      "env": {"gravity":9.80665,"airDensity":1.225,"wind":{"mean":0,"gust":0}},
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
         "variants":[{"id":"b-real-1","componentRef":"cmp_pack_4s1500@^2",
                      "ports":{"elec":"XT60"}}]}
      ],
      "lockfile":{"cmp_pack_4s1500@^2":"cmp_pack_4s1500@2.3.1",
                  "cmp_motor_2207@^1":"cmp_motor_2207@1.0.4"},
      "ports":[{"id":"batt-out","node":"batt","type":"XT60",
                "frame":[[0,0.03,0.082],[0,0,0]]}],
      "driver":{"archetype":"multirotor",
        "params":{"tiltMaxRad":0.40,"yawRate":2.4,"mixer":"x4","pen":[1.25,0.12,1.45]}},
      "sim":{
        "battery":{"cells":4,"capacity_mAh":1500,"r_int_mohm":18},
        "motors":[{"ref":"cmp_motor_2207@^1","mount":"m0"}],
        "colliders":{"policy":"per-node-compound","budget":{"perNode":8,"perModel":24}},
        "estimator":{"kind":"complementary","gyroNoise":0.02,"accelNoise":0.08,
                     "bias":0.01,"latency_ms":8}
      }
    }"##;

    #[test]
    fn appendix_a_round_trips() {
        let spec = validate_shape(APPENDIX_A).expect("Appendix A parses");
        assert_eq!(spec.meta.id, "vx2-hornet");
        assert!(matches!(spec.meta.archetype, Archetype::Multirotor));
        assert_eq!(spec.skeleton.len(), 3);
        assert_eq!(spec.parts.len(), 2);
        assert_eq!(spec.sim.colliders.budget.per_node, 8);
        assert!(matches!(
            spec.sim.estimator.as_ref().unwrap().kind,
            EstimatorKind::Complementary
        ));
        // round trip: serialize → reparse → equal
        let json = serde_json::to_string(&spec).unwrap();
        let again: ModelSpec = serde_json::from_str(&json).unwrap();
        assert_eq!(spec, again);
    }

    #[test]
    fn geom_tagged_union_parses_all_kinds() {
        let kinds = [
            r#"{"kind":"box","w":1,"h":1,"d":1}"#,
            r#"{"kind":"cbox","w":1,"h":1,"d":1,"ch":0.1}"#,
            r#"{"kind":"taper","w0":1,"d0":1,"w1":0.5,"d1":0.5,"h":1}"#,
            r#"{"kind":"cyl","r0":0.5,"h":1}"#,
            r#"{"kind":"lathe","profile":[[0.1,0],[0.2,0.5],[0.05,1]]}"#,
            r#"{"kind":"squircle","rx":0.5,"rz":0.3,"h":0.2,"e":4}"#,
            r#"{"kind":"mesh","ref":"asset://abc"}"#,
        ];
        for k in kinds {
            let g: Geom = serde_json::from_str(k).unwrap_or_else(|e| panic!("{k}: {e}"));
            let back = serde_json::to_string(&g).unwrap();
            let _: Geom = serde_json::from_str(&back).unwrap();
        }
    }

    #[test]
    fn schema_emits_and_mentions_core_blocks() {
        let s = emit_json_schema();
        for needle in ["skeleton", "lockfile", "estimator", "perNode", "archetype"] {
            assert!(s.contains(needle), "schema should mention {needle}");
        }
    }

    #[test]
    fn hash_is_stable_and_content_sensitive() {
        let a = validate_shape(APPENDIX_A).unwrap();
        let h1 = contract_hash(&a);
        let h2 = contract_hash(&a);
        assert_eq!(h1, h2);
        let mut b = a.clone();
        b.meta.name = "renamed".into();
        assert_ne!(h1, contract_hash(&b));
    }

    struct FakeCatalog;
    impl CatalogSource for FakeCatalog {
        fn has_revision(&self, id: &str, rev: &str) -> bool {
            (id, rev) == ("cmp_pack_4s1500", "2.3.1") || (id, rev) == ("cmp_motor_2207", "1.0.4")
        }
    }

    #[test]
    fn lockfile_resolution() {
        let spec = validate_shape(APPENDIX_A).unwrap();
        assert!(resolve_lockfile(&spec, &FakeCatalog).is_empty());

        let mut broken = spec.clone();
        broken.lockfile.remove("cmp_motor_2207@^1");
        let unresolved = resolve_lockfile(&broken, &FakeCatalog);
        assert_eq!(unresolved.len(), 1);
        assert_eq!(unresolved[0].component_ref, "cmp_motor_2207@^1");
    }

    #[test]
    fn missing_required_field_is_shape_error() {
        let bad = r#"{"meta":{"id":"x"}}"#;
        assert!(validate_shape(bad).is_err());
    }
}
