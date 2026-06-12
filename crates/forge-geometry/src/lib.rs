//! forge-geometry — primitives & bake (flat buffers), mass properties, AABB
//! interference (v0).
//!
//! The bake emits exactly what both a GPU pipeline and the validator consume:
//! `f32` positions/normals, `u32` indices, per part. Output must be byte-stable
//! (deterministic vertex order) — P0 byte-equivalence and the golden-number suite
//! (XT-001) depend on it. No fast-math, no I/O, no DOM (D16/D17).
//!
//! Primitive parameterizations beyond plan Appendix A are *(proposed)* pending
//! prototype reconciliation (PRE-002).

#![forbid(unsafe_code)]

pub mod massprops;
pub mod primitives;

use forge_contract::{CollisionPolicy, Explode, MassSpec, MaterialClass, ModelSpec};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// Flat mesh buffers for one part (node-local space).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct MeshBuffers {
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub indices: Vec<u32>,
}

impl MeshBuffers {
    pub fn face_count(&self) -> usize {
        self.indices.len() / 3
    }
    pub fn vertex_count(&self) -> usize {
        self.positions.len() / 3
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BakedPart {
    pub part_index: usize,
    pub node: String,
    pub material: MaterialClass,
    pub color: String,
    pub collision: CollisionPolicy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explode: Option<Explode>,
    pub mesh: MeshBuffers,
}

/// Column-major 4×4 (Three.js `Matrix4.fromArray` order).
pub type Mat4 = [f64; 16];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BakedModel {
    pub parts: Vec<BakedPart>,
    /// node name → world transform (column-major 4×4).
    pub node_world: BTreeMap<String, Mat4>,
    pub total_faces: usize,
    pub total_vertices: usize,
}

#[derive(Debug)]
pub enum BakeError {
    UnknownNode {
        part_index: usize,
        node: String,
    },
    MeshRefUnsupported {
        part_index: usize,
        asset_ref: String,
    },
    BadGeom {
        part_index: usize,
        message: String,
    },
    SkeletonCycle {
        node: String,
    },
}

impl std::fmt::Display for BakeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BakeError::UnknownNode { part_index, node } => {
                write!(f, "part {part_index}: unknown node '{node}'")
            }
            BakeError::MeshRefUnsupported {
                part_index,
                asset_ref,
            } => write!(
                f,
                "part {part_index}: mesh ref '{asset_ref}' requires the asset store (P5)"
            ),
            BakeError::BadGeom {
                part_index,
                message,
            } => {
                write!(f, "part {part_index}: {message}")
            }
            BakeError::SkeletonCycle { node } => write!(f, "skeleton cycle at '{node}'"),
        }
    }
}

impl std::error::Error for BakeError {}

/// Bake a contract: every part → flat buffers; every node → world transform.
pub fn bake(spec: &ModelSpec) -> Result<BakedModel, BakeError> {
    let node_world = node_world_transforms(spec)?;
    let mut parts = Vec::with_capacity(spec.parts.len());
    let mut total_faces = 0usize;
    let mut total_vertices = 0usize;
    for (i, part) in spec.parts.iter().enumerate() {
        if !node_world.contains_key(&part.node) {
            return Err(BakeError::UnknownNode {
                part_index: i,
                node: part.node.clone(),
            });
        }
        let mesh = primitives::build(&part.geom).map_err(|e| match e {
            primitives::BuildError::MeshRef(asset_ref) => BakeError::MeshRefUnsupported {
                part_index: i,
                asset_ref,
            },
            primitives::BuildError::Degenerate(message) => BakeError::BadGeom {
                part_index: i,
                message,
            },
        })?;
        total_faces += mesh.face_count();
        total_vertices += mesh.vertex_count();
        parts.push(BakedPart {
            part_index: i,
            node: part.node.clone(),
            material: part.material,
            color: part.color.clone(),
            collision: part.collision,
            explode: part.explode.clone(),
            mesh,
        });
    }
    Ok(BakedModel {
        parts,
        node_world,
        total_faces,
        total_vertices,
    })
}

/// World transforms for every skeleton node. Euler order: rotate X, then Y,
/// then Z (R = Rz·Ry·Rx), translation applied in the parent frame.
pub fn node_world_transforms(spec: &ModelSpec) -> Result<BTreeMap<String, Mat4>, BakeError> {
    let mut world: BTreeMap<String, Mat4> = BTreeMap::new();
    let mut remaining: Vec<&forge_contract::Node> = spec.skeleton.iter().collect();
    let mut progress = true;
    while !remaining.is_empty() && progress {
        progress = false;
        remaining.retain(|n| {
            let parent_m = match &n.parent {
                None => Some(identity()),
                Some(p) => world.get(p).copied(),
            };
            match parent_m {
                None => true, // parent not resolved yet, keep
                Some(pm) => {
                    let local = trs(n.pos, n.rot);
                    world.insert(n.name.clone(), mul(pm, local));
                    progress = true;
                    false
                }
            }
        });
    }
    if let Some(stuck) = remaining.first() {
        return Err(BakeError::SkeletonCycle {
            node: stuck.name.clone(),
        });
    }
    Ok(world)
}

/// World transforms with per-node joint angles applied (the `tick` path):
/// local = T(pos)·R(rot)·R(axis, angle). Root nodes are pre-multiplied by
/// `root_offset` when given (driver body pose).
pub fn node_world_with_joints(
    spec: &ModelSpec,
    joint_angles: &BTreeMap<String, f64>,
    root_offset: Option<&Mat4>,
) -> Result<BTreeMap<String, Mat4>, BakeError> {
    let mut world: BTreeMap<String, Mat4> = BTreeMap::new();
    let mut remaining: Vec<&forge_contract::Node> = spec.skeleton.iter().collect();
    let mut progress = true;
    while !remaining.is_empty() && progress {
        progress = false;
        remaining.retain(|n| {
            let parent_m = match &n.parent {
                None => Some(match root_offset {
                    Some(off) => *off,
                    None => identity(),
                }),
                Some(p) => world.get(p).copied(),
            };
            match parent_m {
                None => true,
                Some(pm) => {
                    let mut local = trs(n.pos, n.rot);
                    if let Some(angle) = joint_angles.get(&n.name) {
                        let axis = n
                            .joint
                            .as_ref()
                            .and_then(|j| j.axis)
                            .unwrap_or([0.0, 1.0, 0.0]);
                        local = mul(local, axis_angle(axis, *angle));
                    }
                    world.insert(n.name.clone(), mul(pm, local));
                    progress = true;
                    false
                }
            }
        });
    }
    if let Some(stuck) = remaining.first() {
        return Err(BakeError::SkeletonCycle {
            node: stuck.name.clone(),
        });
    }
    Ok(world)
}

/// Rodrigues rotation about a (normalized) axis, column-major Mat4.
pub fn axis_angle(axis: [f64; 3], angle: f64) -> Mat4 {
    let len = (axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]).sqrt();
    if len < 1e-12 {
        return identity();
    }
    let (x, y, z) = (axis[0] / len, axis[1] / len, axis[2] / len);
    let (s, c) = angle.sin_cos();
    let t = 1.0 - c;
    [
        t * x * x + c,
        t * x * y + s * z,
        t * x * z - s * y,
        0.0,
        t * x * y - s * z,
        t * y * y + c,
        t * y * z + s * x,
        0.0,
        t * x * z + s * y,
        t * y * z - s * x,
        t * z * z + c,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0,
    ]
}

/// Translation+heading (rotation about +Y) as a Mat4 — driver body poses.
pub fn body_offset(x: f64, z: f64, heading: f64) -> Mat4 {
    let (s, c) = heading.sin_cos();
    [
        c, 0.0, -s, 0.0, //
        0.0, 1.0, 0.0, 0.0, //
        s, 0.0, c, 0.0, //
        x, 0.0, z, 1.0,
    ]
}

pub fn identity() -> Mat4 {
    let mut m = [0.0; 16];
    m[0] = 1.0;
    m[5] = 1.0;
    m[10] = 1.0;
    m[15] = 1.0;
    m
}

/// Column-major multiply: out = a · b.
pub fn mul(a: Mat4, b: Mat4) -> Mat4 {
    let mut o = [0.0; 16];
    for c in 0..4 {
        for r in 0..4 {
            let mut s = 0.0;
            for k in 0..4 {
                s += a[k * 4 + r] * b[c * 4 + k];
            }
            o[c * 4 + r] = s;
        }
    }
    o
}

fn trs(pos: [f64; 3], rot: [f64; 3]) -> Mat4 {
    let (sx, cx) = rot[0].sin_cos();
    let (sy, cy) = rot[1].sin_cos();
    let (sz, cz) = rot[2].sin_cos();
    // R = Rz·Ry·Rx, column-major; translation in the parent frame.
    [
        cy * cz,
        cy * sz,
        -sy,
        0.0,
        sx * sy * cz - cx * sz,
        sx * sy * sz + cx * cz,
        sx * cy,
        0.0,
        cx * sy * cz + sx * sz,
        cx * sy * sz - sx * cz,
        cx * cy,
        0.0,
        pos[0],
        pos[1],
        pos[2],
        1.0,
    ]
}

/// Apply a column-major Mat4 to a point.
pub fn transform_point(m: &Mat4, p: [f64; 3]) -> [f64; 3] {
    [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]
}

// ---------------------------------------------------------------------------
// mass
// ---------------------------------------------------------------------------

/// Default densities per material class, kg/m³ *(proposed — a stated assumption,
/// inspectable via the HUD; parts override via `mass.densityKgm3` or
/// `mass.valueG`)*: plastics for the visual classes, aluminum-class for metal.
pub fn default_density_kgm3(class: MaterialClass) -> f64 {
    match class {
        MaterialClass::Gloss => 1200.0,
        MaterialClass::Metal => 2700.0,
        MaterialClass::Satin => 1200.0,
        MaterialClass::Matte => 1200.0,
        MaterialClass::Rubber => 1100.0,
    }
}

/// Mass of one baked part in grams (mass spec → density → material default).
pub fn part_mass_g(mass: &Option<MassSpec>, material: MaterialClass, mesh: &MeshBuffers) -> f64 {
    if let Some(m) = mass {
        if let Some(g) = m.value_g {
            return g;
        }
        if let Some(d) = m.density_kgm3 {
            return massprops::compute(mesh).volume * d * 1000.0;
        }
    }
    massprops::compute(mesh).volume * default_density_kgm3(material) * 1000.0
}

/// Total model mass in grams (Σ part masses).
pub fn model_mass_g(spec: &ModelSpec, baked: &BakedModel) -> f64 {
    baked
        .parts
        .iter()
        .map(|bp| {
            let part = &spec.parts[bp.part_index];
            part_mass_g(&part.mass, part.material, &bp.mesh)
        })
        .sum()
}

// ---------------------------------------------------------------------------
// interference v0 — world AABB overlap (GEO-003's full joint sweep is P1+)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Aabb {
    pub min: [f64; 3],
    pub max: [f64; 3],
}

pub fn part_world_aabb(baked: &BakedModel, part: &BakedPart) -> Aabb {
    let m = baked
        .node_world
        .get(&part.node)
        .copied()
        .unwrap_or_else(identity);
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for v in part.mesh.positions.chunks_exact(3) {
        let p = transform_point(&m, [v[0] as f64, v[1] as f64, v[2] as f64]);
        for a in 0..3 {
            min[a] = min[a].min(p[a]);
            max[a] = max[a].max(p[a]);
        }
    }
    Aabb { min, max }
}

/// Pairs of part indices on *different* nodes whose world AABBs interpenetrate
/// by more than `tol` meters on every axis.
pub fn aabb_interferences(baked: &BakedModel, tol: f64) -> Vec<(usize, usize)> {
    let boxes: Vec<(usize, &BakedPart, Aabb)> = baked
        .parts
        .iter()
        .enumerate()
        .map(|(i, p)| (i, p, part_world_aabb(baked, p)))
        .collect();
    let mut out = Vec::new();
    for i in 0..boxes.len() {
        for j in (i + 1)..boxes.len() {
            let (_, pa, a) = &boxes[i];
            let (_, pb, b) = &boxes[j];
            if pa.node == pb.node {
                continue;
            }
            let overlap = (0..3).all(|k| a.min[k] + tol < b.max[k] && b.min[k] + tol < a.max[k]);
            if overlap {
                out.push((i, j));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use forge_contract::validate_shape;

    fn demo_spec() -> ModelSpec {
        validate_shape(
            r##"{
          "meta": {"id":"t","name":"t","version":"2.1.0","archetype":"rover",
                   "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[
            {"name":"root","parent":null,"pos":[0,0,0]},
            {"name":"top","parent":"root","pos":[0,1.0,0],"rot":[0,1.5707963267948966,0]}
          ],
          "parts":[
            {"node":"root","geom":{"kind":"box","w":1,"h":1,"d":1},
             "material":"matte","color":"#888888"},
            {"node":"top","geom":{"kind":"cyl","r0":0.5,"h":1,"n":64},
             "material":"metal","color":"#aaaaaa"}
          ],
          "driver":{"archetype":"rover","params":{}}
        }"##,
        )
        .unwrap()
    }

    #[test]
    fn bake_produces_buffers_and_transforms() {
        let spec = demo_spec();
        let baked = bake(&spec).unwrap();
        assert_eq!(baked.parts.len(), 2);
        assert!(baked.total_faces > 0);
        let top = baked.node_world.get("top").unwrap();
        // translation column
        assert!((top[13] - 1.0).abs() < 1e-12);
        // bake twice → byte-stable
        let again = bake(&spec).unwrap();
        assert_eq!(baked.parts[0].mesh.positions, again.parts[0].mesh.positions);
        assert_eq!(baked.parts[1].mesh.indices, again.parts[1].mesh.indices);
    }

    #[test]
    fn model_mass_sums_parts() {
        let spec = demo_spec();
        let baked = bake(&spec).unwrap();
        let g = model_mass_g(&spec, &baked);
        // box: 1 m³ × 1200 kg/m³ = 1.2e6 g; cylinder: π·0.25·1 × 2700 ≈ 2.12e6 g
        let expect = 1.2e6 + std::f64::consts::PI * 0.25 * 2700.0 * 1000.0;
        assert!(
            (g - expect).abs() / expect < 0.01,
            "got {g}, expect ≈{expect}"
        );
    }

    #[test]
    fn unknown_node_is_error() {
        let mut spec = demo_spec();
        spec.parts[0].node = "nope".into();
        assert!(matches!(bake(&spec), Err(BakeError::UnknownNode { .. })));
    }

    #[test]
    fn aabb_interference_detects_overlap() {
        let mut spec = demo_spec();
        // move "top" down so the cylinder interpenetrates the box
        spec.skeleton[1].pos = [0.0, 0.5, 0.0];
        spec.skeleton[1].rot = [0.0, 0.0, 0.0];
        let baked = bake(&spec).unwrap();
        assert_eq!(aabb_interferences(&baked, 0.0005).len(), 1);
    }
}
