//! MJCF / URDF exporters (P6-008, XC-04 goldens): one contract, training- and
//! deployment-grade physics descriptions. The geometry bar is the doctrine's —
//! **mass-properties-correct over surface-exact** (D18): masses, COMs, and
//! inertia tensors are computed from the baked meshes; visual shapes map to the
//! nearest primitive with the approximation noted in an XML comment.
//!
//! Frames: FORGE is Y-up right-handed; URDF/MJCF are Z-up. The conversion is a
//! +90° rotation about X: (x, y, z) → (x, −z, y).

use forge_contract::{Geom, JointKind, ModelSpec, Node};
use forge_geometry::{massprops, BakedModel};

// ---------------------------------------------------------------------------
// frame conversion helpers
// ---------------------------------------------------------------------------

fn to_zup(p: [f64; 3]) -> [f64; 3] {
    [p[0], -p[2], p[1]]
}

/// 3×3 rotation (row-major) for euler XYZ applied X→Y→Z (R = Rz·Ry·Rx),
/// matching forge-geometry's node convention.
fn rot_xyz(rot: [f64; 3]) -> [[f64; 3]; 3] {
    let (sx, cx) = rot[0].sin_cos();
    let (sy, cy) = rot[1].sin_cos();
    let (sz, cz) = rot[2].sin_cos();
    [
        [cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz],
        [cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz],
        [-sy, sx * cy, cx * cy],
    ]
}

/// Conjugate a forge-frame rotation into the Z-up frame: R' = C·R·Cᵀ with
/// C = Rx(+90°).
fn conjugate_zup(r: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
    // C (row-major): x'=x, y'=-z, z'=y
    let c = [[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]];
    let ct = [[1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, -1.0, 0.0]];
    mat_mul(mat_mul(c, r), ct)
}

fn mat_mul(a: [[f64; 3]; 3], b: [[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let mut o = [[0.0; 3]; 3];
    for (i, row) in o.iter_mut().enumerate() {
        for (j, cell) in row.iter_mut().enumerate() {
            *cell = (0..3).map(|k| a[i][k] * b[k][j]).sum();
        }
    }
    o
}

/// Fixed-axis RPY (URDF convention, R = Rz(yaw)·Ry(pitch)·Rx(roll)).
fn to_rpy(r: [[f64; 3]; 3]) -> [f64; 3] {
    let pitch = (-r[2][0]).asin();
    if pitch.cos().abs() < 1e-9 {
        // gimbal edge: fold yaw into roll
        return [0.0, pitch, (-r[0][1]).atan2(r[1][1])];
    }
    [r[2][1].atan2(r[2][2]), pitch, r[1][0].atan2(r[0][0])]
}

/// Quaternion (w, x, y, z) from a rotation matrix (Shepperd's method).
fn to_quat(r: [[f64; 3]; 3]) -> [f64; 4] {
    let trace = r[0][0] + r[1][1] + r[2][2];
    if trace > 0.0 {
        let s = (trace + 1.0).sqrt() * 2.0;
        [
            s / 4.0,
            (r[2][1] - r[1][2]) / s,
            (r[0][2] - r[2][0]) / s,
            (r[1][0] - r[0][1]) / s,
        ]
    } else if r[0][0] > r[1][1] && r[0][0] > r[2][2] {
        let s = (1.0 + r[0][0] - r[1][1] - r[2][2]).sqrt() * 2.0;
        [
            (r[2][1] - r[1][2]) / s,
            s / 4.0,
            (r[0][1] + r[1][0]) / s,
            (r[0][2] + r[2][0]) / s,
        ]
    } else if r[1][1] > r[2][2] {
        let s = (1.0 + r[1][1] - r[0][0] - r[2][2]).sqrt() * 2.0;
        [
            (r[0][2] - r[2][0]) / s,
            (r[0][1] + r[1][0]) / s,
            s / 4.0,
            (r[1][2] + r[2][1]) / s,
        ]
    } else {
        let s = (1.0 + r[2][2] - r[0][0] - r[1][1]).sqrt() * 2.0;
        [
            (r[1][0] - r[0][1]) / s,
            (r[0][2] + r[2][0]) / s,
            (r[1][2] + r[2][1]) / s,
            s / 4.0,
        ]
    }
}

// ---------------------------------------------------------------------------
// per-node mass properties (forge frame, node-local)
// ---------------------------------------------------------------------------

struct NodeInertial {
    mass_kg: f64,
    /// COM in node-local Z-up coordinates.
    com_zup: [f64; 3],
    /// [ixx, iyy, izz, ixy, ixz, iyz] about the COM, Z-up axes, kg·m².
    inertia_zup: [f64; 6],
}

fn node_inertial(spec: &ModelSpec, baked: &BakedModel, node: &str) -> NodeInertial {
    let mut mass = 0.0f64;
    let mut com = [0.0f64; 3];
    struct PartTerm {
        m: f64,
        com: [f64; 3],
        i_unit: [f64; 6],
        density: f64,
    }
    let mut terms: Vec<PartTerm> = Vec::new();

    for bp in baked.parts.iter().filter(|bp| bp.node == node) {
        let part = &spec.parts[bp.part_index];
        let mp = massprops::compute(&bp.mesh);
        let m = forge_geometry::part_mass_g(&part.mass, part.material, &bp.mesh) / 1000.0;
        let density = if mp.volume.abs() > 1e-12 {
            m / mp.volume
        } else {
            0.0
        };
        mass += m;
        for (c, pc) in com.iter_mut().zip(mp.com.iter()) {
            *c += m * pc;
        }
        terms.push(PartTerm {
            m,
            com: mp.com,
            i_unit: mp.inertia_unit_density,
            density,
        });
    }
    if mass > 1e-12 {
        for c in &mut com {
            *c /= mass;
        }
    }

    // sum part inertias about the node COM (parallel axis), forge frame
    let mut i = [0.0f64; 6]; // ixx iyy izz ixy iyz ixz (massprops order)
    for t in &terms {
        let d = [t.com[0] - com[0], t.com[1] - com[1], t.com[2] - com[2]];
        let (dx2, dy2, dz2) = (d[0] * d[0], d[1] * d[1], d[2] * d[2]);
        i[0] += t.i_unit[0] * t.density + t.m * (dy2 + dz2);
        i[1] += t.i_unit[1] * t.density + t.m * (dx2 + dz2);
        i[2] += t.i_unit[2] * t.density + t.m * (dx2 + dy2);
        i[3] += t.i_unit[3] * t.density - t.m * d[0] * d[1];
        i[4] += t.i_unit[4] * t.density - t.m * d[1] * d[2];
        i[5] += t.i_unit[5] * t.density - t.m * d[0] * d[2];
    }

    // convert to Z-up: x'=x, y'=-z, z'=y →
    //   Ix'x' = Ixx · Iy'y' = Izz · Iz'z' = Iyy
    //   Ix'y' = -Ixz · Ix'z' = Ixy · Iy'z' = -Iyz
    NodeInertial {
        mass_kg: mass,
        com_zup: to_zup(com),
        inertia_zup: [i[0], i[2], i[1], -i[5], i[3], -i[4]],
    }
}

// ---------------------------------------------------------------------------
// shape mapping (visual/collision approximations, noted in output)
// ---------------------------------------------------------------------------

enum Shape {
    /// full sizes (x, y, z) in Z-up + center offset along the solid's axis
    Box {
        size: [f64; 3],
        zc: f64,
        note: Option<&'static str>,
    },
    Cylinder {
        radius: f64,
        length: f64,
        zc: f64,
        note: Option<&'static str>,
    },
    Skip {
        note: &'static str,
    },
}

fn map_shape(geom: &Geom) -> Shape {
    match geom {
        // taper/box/cbox/cyl are origin-centered (PRE-002 reconciliation)
        Geom::Box { w, h, d } => Shape::Box {
            size: [*w, *d, *h],
            zc: 0.0,
            note: None,
        },
        Geom::Cbox { w, h, d, .. } => Shape::Box {
            size: [*w, *d, *h],
            zc: 0.0,
            note: Some("cbox chamfer dropped (box approximation)"),
        },
        Geom::Taper { w0, d0, w1, d1, h } => Shape::Box {
            size: [(w0 + w1) / 2.0, (d0 + d1) / 2.0, *h],
            zc: 0.0,
            note: Some("taper averaged to a box"),
        },
        Geom::Cyl { r0, r1, h, .. } => Shape::Cylinder {
            radius: (r0 + r1.unwrap_or(*r0)) / 2.0,
            length: *h,
            zc: 0.0,
            note: r1.map(|_| "tapered cylinder averaged"),
        },
        Geom::Squircle { rx, rz, h, .. } => Shape::Box {
            size: [2.0 * rx, 2.0 * rz, *h],
            zc: 0.0,
            note: Some("squircle boxed"),
        },
        Geom::Lathe { profile, .. } => {
            let r = profile.iter().map(|p| p[0]).fold(0.0f64, f64::max);
            let (y0, y1) = profile
                .iter()
                .fold((f64::INFINITY, f64::NEG_INFINITY), |(a, b), p| {
                    (a.min(p[1]), b.max(p[1]))
                });
            Shape::Cylinder {
                radius: r.max(1e-6),
                length: (y1 - y0).max(1e-6),
                zc: (y0 + y1) / 2.0,
                note: Some("lathe bounded by a cylinder"),
            }
        }
        Geom::Loft { stations, .. } => {
            let r = stations
                .iter()
                .map(|s| s.sx.max(s.sz))
                .fold(0.0f64, f64::max);
            let (y0, y1) = stations
                .iter()
                .fold((f64::INFINITY, f64::NEG_INFINITY), |(a, b), s| {
                    (a.min(s.y), b.max(s.y))
                });
            Shape::Cylinder {
                radius: r.max(1e-6),
                length: (y1 - y0).max(1e-6),
                zc: (y0 + y1) / 2.0,
                note: Some("loft bounded by a cylinder"),
            }
        }
        Geom::Mesh { .. } => Shape::Skip {
            note: "mesh ref export lands with the asset store (P5)",
        },
    }
}

fn fnum(v: f64) -> String {
    // stable, compact float formatting for golden fixtures
    let s = format!("{v:.6}");
    s.trim_end_matches('0').trim_end_matches('.').to_string()
}

// ---------------------------------------------------------------------------
// URDF
// ---------------------------------------------------------------------------

/// Export the contract as URDF (Z-up). Joints come from the skeleton; inertials
/// from baked mass properties; visuals/collisions from primitive approximations.
pub fn to_urdf(spec: &ModelSpec, baked: &BakedModel) -> String {
    let mut out = String::new();
    out.push_str("<?xml version=\"1.0\"?>\n");
    out.push_str(&format!(
        "<!-- generated by forge-sim from contract {} (schema {}) — Y-up→Z-up -->\n",
        spec.meta.id,
        forge_contract::SCHEMA_VERSION
    ));
    out.push_str(&format!("<robot name=\"{}\">\n", xml_escape(&spec.meta.id)));

    for node in &spec.skeleton {
        let inertial = node_inertial(spec, baked, &node.name);
        out.push_str(&format!("  <link name=\"{}\">\n", xml_escape(&node.name)));
        if inertial.mass_kg > 1e-9 {
            let [ixx, iyy, izz, ixy, ixz, iyz] = inertial.inertia_zup;
            out.push_str(&format!(
                "    <inertial>\n      <origin xyz=\"{} {} {}\" rpy=\"0 0 0\"/>\n      <mass value=\"{}\"/>\n      <inertia ixx=\"{}\" iyy=\"{}\" izz=\"{}\" ixy=\"{}\" ixz=\"{}\" iyz=\"{}\"/>\n    </inertial>\n",
                fnum(inertial.com_zup[0]), fnum(inertial.com_zup[1]), fnum(inertial.com_zup[2]),
                fnum(inertial.mass_kg),
                fnum(ixx), fnum(iyy), fnum(izz), fnum(ixy), fnum(ixz), fnum(iyz)
            ));
        }
        for bp in baked.parts.iter().filter(|bp| bp.node == node.name) {
            let part = &spec.parts[bp.part_index];
            let collide = part.collision != forge_contract::CollisionPolicy::None;
            match map_shape(&part.geom) {
                Shape::Skip { note } => {
                    out.push_str(&format!("    <!-- part {}: {} -->\n", bp.part_index, note))
                }
                Shape::Box { size, zc, note } => {
                    if let Some(n) = note {
                        out.push_str(&format!("    <!-- part {}: {} -->\n", bp.part_index, n));
                    }
                    let geo = format!(
                        "<box size=\"{} {} {}\"/>",
                        fnum(size[0]),
                        fnum(size[1]),
                        fnum(size[2])
                    );
                    push_urdf_shape(&mut out, &geo, zc, collide);
                }
                Shape::Cylinder {
                    radius,
                    length,
                    zc,
                    note,
                } => {
                    if let Some(n) = note {
                        out.push_str(&format!("    <!-- part {}: {} -->\n", bp.part_index, n));
                    }
                    let geo = format!(
                        "<cylinder radius=\"{}\" length=\"{}\"/>",
                        fnum(radius),
                        fnum(length)
                    );
                    push_urdf_shape(&mut out, &geo, zc, collide);
                }
            }
        }
        out.push_str("  </link>\n");
    }

    for node in spec.skeleton.iter().filter(|n| n.parent.is_some()) {
        out.push_str(&urdf_joint(node));
    }

    out.push_str("</robot>\n");
    out
}

fn push_urdf_shape(out: &mut String, geometry: &str, zc: f64, collide: bool) {
    let block = |tag: &str| {
        format!(
            "    <{tag}>\n      <origin xyz=\"0 0 {}\" rpy=\"0 0 0\"/>\n      <geometry>{geometry}</geometry>\n    </{tag}>\n",
            fnum(zc)
        )
    };
    out.push_str(&block("visual"));
    if collide {
        out.push_str(&block("collision"));
    }
}

fn urdf_joint(node: &Node) -> String {
    let parent = node.parent.as_deref().unwrap_or("root");
    let xyz = to_zup(node.pos);
    let rpy = to_rpy(conjugate_zup(rot_xyz(node.rot)));
    let (kind, axis_limits) = joint_kind_axis(node);
    let mut s = format!(
        "  <joint name=\"{}_joint\" type=\"{}\">\n    <parent link=\"{}\"/>\n    <child link=\"{}\"/>\n    <origin xyz=\"{} {} {}\" rpy=\"{} {} {}\"/>\n",
        xml_escape(&node.name), kind,
        xml_escape(parent), xml_escape(&node.name),
        fnum(xyz[0]), fnum(xyz[1]), fnum(xyz[2]),
        fnum(rpy[0]), fnum(rpy[1]), fnum(rpy[2])
    );
    if let Some((axis, lo, hi, effort, velocity)) = axis_limits {
        s.push_str(&format!(
            "    <axis xyz=\"{} {} {}\"/>\n    <limit lower=\"{}\" upper=\"{}\" effort=\"{}\" velocity=\"{}\"/>\n",
            fnum(axis[0]), fnum(axis[1]), fnum(axis[2]),
            fnum(lo), fnum(hi), fnum(effort), fnum(velocity)
        ));
    }
    s.push_str("  </joint>\n");
    s
}

/// (urdf joint type, Some((zup axis, lower, upper, effort, velocity)) for revolute)
#[allow(clippy::type_complexity)]
fn joint_kind_axis(node: &Node) -> (&'static str, Option<([f64; 3], f64, f64, f64, f64)>) {
    match &node.joint {
        Some(j) if matches!(j.kind, JointKind::Revolute) => {
            let axis = j.axis.unwrap_or([0.0, 1.0, 0.0]);
            // limits: the per-axis pair matching the dominant axis component
            let dominant = (0..3)
                .max_by(|a, b| axis[*a].abs().partial_cmp(&axis[*b].abs()).unwrap())
                .unwrap_or(1);
            let (lo, hi) = node
                .limits
                .map(|l| (l[dominant][0], l[dominant][1]))
                .unwrap_or((-std::f64::consts::PI, std::f64::consts::PI));
            let effort = j.max_torque_nm.unwrap_or(10.0);
            let velocity = j.max_vel_rad.unwrap_or(20.0);
            ("revolute", Some((to_zup(axis), lo, hi, effort, velocity)))
        }
        Some(j) if matches!(j.kind, JointKind::Spherical) => ("floating", None),
        _ => ("fixed", None),
    }
}

// ---------------------------------------------------------------------------
// MJCF
// ---------------------------------------------------------------------------

/// Export the contract as MJCF (Z-up). The body tree nests by skeleton parent;
/// gravity/density come from the contract's env block — never ambient.
pub fn to_mjcf(spec: &ModelSpec, baked: &BakedModel) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "<!-- generated by forge-sim from contract {} (schema {}) — Y-up→Z-up -->\n",
        spec.meta.id,
        forge_contract::SCHEMA_VERSION
    ));
    out.push_str(&format!(
        "<mujoco model=\"{}\">\n",
        xml_escape(&spec.meta.id)
    ));
    out.push_str(&format!(
        "  <option gravity=\"0 0 -{}\" density=\"{}\"/>\n",
        fnum(spec.env.gravity),
        fnum(spec.env.air_density)
    ));
    out.push_str("  <worldbody>\n");

    let roots: Vec<&Node> = spec
        .skeleton
        .iter()
        .filter(|n| n.parent.is_none())
        .collect();
    let mut actuators = String::new();
    for root in roots {
        mjcf_body(spec, baked, root, 2, &mut out, &mut actuators);
    }
    out.push_str("  </worldbody>\n");
    if !actuators.is_empty() {
        out.push_str("  <actuator>\n");
        out.push_str(&actuators);
        out.push_str("  </actuator>\n");
    }
    out.push_str("</mujoco>\n");
    out
}

fn mjcf_body(
    spec: &ModelSpec,
    baked: &BakedModel,
    node: &Node,
    depth: usize,
    out: &mut String,
    actuators: &mut String,
) {
    let pad = "  ".repeat(depth);
    let xyz = to_zup(node.pos);
    let q = to_quat(conjugate_zup(rot_xyz(node.rot)));
    out.push_str(&format!(
        "{pad}<body name=\"{}\" pos=\"{} {} {}\" quat=\"{} {} {} {}\">\n",
        xml_escape(&node.name),
        fnum(xyz[0]),
        fnum(xyz[1]),
        fnum(xyz[2]),
        fnum(q[0]),
        fnum(q[1]),
        fnum(q[2]),
        fnum(q[3])
    ));

    if let (kind, Some((axis, lo, hi, _effort, _vel))) = joint_kind_axis(node) {
        if kind == "revolute" {
            out.push_str(&format!(
                "{pad}  <joint name=\"{}_joint\" type=\"hinge\" axis=\"{} {} {}\" range=\"{} {}\"/>\n",
                xml_escape(&node.name),
                fnum(axis[0]), fnum(axis[1]), fnum(axis[2]),
                fnum(lo), fnum(hi)
            ));
            actuators.push_str(&format!(
                "    <motor name=\"{}_motor\" joint=\"{}_joint\" gear=\"1\"/>\n",
                xml_escape(&node.name),
                xml_escape(&node.name)
            ));
        }
    }

    let inertial = node_inertial(spec, baked, &node.name);
    if inertial.mass_kg > 1e-9 {
        let [ixx, iyy, izz, ixy, ixz, iyz] = inertial.inertia_zup;
        out.push_str(&format!(
            "{pad}  <inertial pos=\"{} {} {}\" mass=\"{}\" fullinertia=\"{} {} {} {} {} {}\"/>\n",
            fnum(inertial.com_zup[0]),
            fnum(inertial.com_zup[1]),
            fnum(inertial.com_zup[2]),
            fnum(inertial.mass_kg),
            fnum(ixx),
            fnum(iyy),
            fnum(izz),
            fnum(ixy),
            fnum(ixz),
            fnum(iyz)
        ));
    }

    for bp in baked.parts.iter().filter(|bp| bp.node == node.name) {
        let part = &spec.parts[bp.part_index];
        if part.collision == forge_contract::CollisionPolicy::None {
            continue; // MJCF geoms are contact geometry; visual-only parts stay client-side
        }
        match map_shape(&part.geom) {
            Shape::Skip { note } => out.push_str(&format!(
                "{pad}  <!-- part {}: {} -->\n",
                bp.part_index, note
            )),
            Shape::Box { size, zc, note } => {
                if let Some(n) = note {
                    out.push_str(&format!("{pad}  <!-- part {}: {} -->\n", bp.part_index, n));
                }
                out.push_str(&format!(
                    "{pad}  <geom type=\"box\" size=\"{} {} {}\" pos=\"0 0 {}\"/>\n",
                    fnum(size[0] / 2.0),
                    fnum(size[1] / 2.0),
                    fnum(size[2] / 2.0),
                    fnum(zc)
                ));
            }
            Shape::Cylinder {
                radius,
                length,
                zc,
                note,
            } => {
                if let Some(n) = note {
                    out.push_str(&format!("{pad}  <!-- part {}: {} -->\n", bp.part_index, n));
                }
                out.push_str(&format!(
                    "{pad}  <geom type=\"cylinder\" size=\"{} {}\" pos=\"0 0 {}\"/>\n",
                    fnum(radius),
                    fnum(length / 2.0),
                    fnum(zc)
                ));
            }
        }
    }

    for child in spec
        .skeleton
        .iter()
        .filter(|n| n.parent.as_deref() == Some(&node.name))
    {
        mjcf_body(spec, baked, child, depth + 1, out, actuators);
    }
    out.push_str(&format!("{pad}</body>\n"));
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn load(path: &str) -> (ModelSpec, BakedModel) {
        let doc = std::fs::read_to_string(path).unwrap();
        let spec = forge_contract::validate_shape(&doc).unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        (spec, baked)
    }

    #[test]
    fn urdf_structure_and_mass_closure() {
        let (spec, baked) = load("../../examples/vx2-mini.forge.json");
        let urdf = to_urdf(&spec, &baked);
        assert_eq!(urdf.matches("<link ").count(), spec.skeleton.len());
        // mass closure: Σ link masses = AUW within float noise
        let total: f64 = urdf
            .lines()
            .filter_map(|l| l.trim().strip_prefix("<mass value=\""))
            .filter_map(|l| l.trim_end_matches("\"/>").parse::<f64>().ok())
            .sum();
        let auw_kg = forge_geometry::model_mass_g(&spec, &baked) / 1000.0;
        assert!((total - auw_kg).abs() < 1e-3, "{total} vs {auw_kg}");
        // spinners are revolute with the contract's velocity limit
        assert!(urdf.contains("<joint name=\"s0_joint\" type=\"revolute\""));
        assert!(urdf.contains("velocity=\"3000\""));
        assert!(xml_balanced(&urdf), "unbalanced XML");
    }

    #[test]
    fn mjcf_carries_env_and_actuators() {
        let (spec, baked) = load("../../examples/vx2-mini.forge.json");
        let mjcf = to_mjcf(&spec, &baked);
        assert!(mjcf.contains("gravity=\"0 0 -9.80665\""));
        assert!(mjcf.contains("type=\"hinge\""));
        assert!(mjcf.contains("<motor name=\"s0_motor\""));
        // visual-only props are not contact geoms
        assert_eq!(mjcf.matches("<geom ").count(), 12, "collidable parts only");
        assert!(xml_balanced(&mjcf), "unbalanced XML");
    }

    #[test]
    fn quadruped_exports_with_leg_joints() {
        let (spec, baked) = load("../../examples/qd-mini.forge.json");
        let urdf = to_urdf(&spec, &baked);
        assert!(urdf.contains("hip_0l_joint"));
        assert!(urdf.contains("type=\"revolute\""));
        let mjcf = to_mjcf(&spec, &baked);
        assert_eq!(mjcf.matches("<joint ").count(), 8, "hip+knee per leg");
    }

    #[test]
    fn golden_fixtures_match() {
        for (example, fixture, gen) in [
            (
                "../../examples/vx2-mini.forge.json",
                "tests/fixtures/vx2-mini.urdf",
                "urdf",
            ),
            (
                "../../examples/vx2-mini.forge.json",
                "tests/fixtures/vx2-mini.mjcf.xml",
                "mjcf",
            ),
        ] {
            let (spec, baked) = load(example);
            let generated = match gen {
                "urdf" => to_urdf(&spec, &baked),
                _ => to_mjcf(&spec, &baked),
            };
            let golden = std::fs::read_to_string(fixture).unwrap_or_else(|_| {
                panic!("missing golden fixture {fixture} — regenerate via tests/gen_fixtures.sh")
            });
            assert_eq!(generated, golden, "golden drift in {fixture} (XC-04)");
        }
    }

    fn xml_balanced(s: &str) -> bool {
        let opens = s.matches('<').count();
        let closes = s.matches('>').count();
        opens == closes
    }
}
