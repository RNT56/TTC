//! Design-for-manufacture checks for printable structural parts (XC-18).
//!
//! These are mesh-derived heuristics over baked primitive buffers. They do not
//! replace exact B-rep/slicer analysis, but they make the validator's MFG-* IDs
//! real and deterministic for the printable structural parts available today.

use crate::MeshBuffers;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PrintProcess {
    Fdm,
    Sla,
}

impl PrintProcess {
    pub fn slug(self) -> &'static str {
        match self {
            PrintProcess::Fdm => "fdm-structural",
            PrintProcess::Sla => "sla-structural",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct PrintProfile {
    pub process: PrintProcess,
    pub min_wall_m: f64,
    pub max_overhang_deg: f64,
    pub max_support_ratio: f64,
    /// Oriented print volume: [bed_x, bed_z, height] in meters.
    pub bed_m: [f64; 3],
}

impl PrintProfile {
    pub fn fdm_structural() -> Self {
        PrintProfile {
            process: PrintProcess::Fdm,
            min_wall_m: 0.0016,
            max_overhang_deg: 45.0,
            max_support_ratio: 0.25,
            bed_m: [0.220, 0.220, 0.250],
        }
    }

    pub fn sla_structural() -> Self {
        PrintProfile {
            process: PrintProcess::Sla,
            min_wall_m: 0.0012,
            max_overhang_deg: 60.0,
            max_support_ratio: 0.50,
            bed_m: [0.145, 0.145, 0.180],
        }
    }
}

pub fn structural_profiles() -> [PrintProfile; 2] {
    [
        PrintProfile::fdm_structural(),
        PrintProfile::sla_structural(),
    ]
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AxisDirection {
    PosX,
    NegX,
    PosY,
    NegY,
    PosZ,
    NegZ,
}

impl AxisDirection {
    fn all() -> [AxisDirection; 6] {
        [
            AxisDirection::PosY,
            AxisDirection::NegY,
            AxisDirection::PosX,
            AxisDirection::NegX,
            AxisDirection::PosZ,
            AxisDirection::NegZ,
        ]
    }

    pub fn label(self) -> &'static str {
        match self {
            AxisDirection::PosX => "+x",
            AxisDirection::NegX => "-x",
            AxisDirection::PosY => "+y",
            AxisDirection::NegY => "-y",
            AxisDirection::PosZ => "+z",
            AxisDirection::NegZ => "-z",
        }
    }

    fn vector(self) -> [f64; 3] {
        match self {
            AxisDirection::PosX => [1.0, 0.0, 0.0],
            AxisDirection::NegX => [-1.0, 0.0, 0.0],
            AxisDirection::PosY => [0.0, 1.0, 0.0],
            AxisDirection::NegY => [0.0, -1.0, 0.0],
            AxisDirection::PosZ => [0.0, 0.0, 1.0],
            AxisDirection::NegZ => [0.0, 0.0, -1.0],
        }
    }

    fn bed_axes(self) -> ([f64; 3], [f64; 3]) {
        match self {
            AxisDirection::PosY => ([1.0, 0.0, 0.0], [0.0, 0.0, 1.0]),
            AxisDirection::NegY => ([1.0, 0.0, 0.0], [0.0, 0.0, -1.0]),
            AxisDirection::PosX => ([0.0, 1.0, 0.0], [0.0, 0.0, 1.0]),
            AxisDirection::NegX => ([0.0, 1.0, 0.0], [0.0, 0.0, -1.0]),
            AxisDirection::PosZ => ([1.0, 0.0, 0.0], [0.0, 1.0, 0.0]),
            AxisDirection::NegZ => ([1.0, 0.0, 0.0], [0.0, -1.0, 0.0]),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DfmProfileAnalysis {
    pub process: PrintProcess,
    pub min_wall_m: f64,
    pub min_wall_ok: bool,
    pub orientation_up: AxisDirection,
    pub oriented_extents_m: [f64; 3],
    pub bed_fit_ok: bool,
    pub max_overhang_deg: f64,
    pub overhang_ok: bool,
    pub support_volume_m3: f64,
    pub support_ratio: f64,
    pub support_ok: bool,
    pub passed: bool,
}

impl DfmProfileAnalysis {
    pub fn failed_checks(&self) -> Vec<&'static str> {
        let mut out = Vec::new();
        if !self.min_wall_ok {
            out.push("MFG-001");
        }
        if !self.overhang_ok {
            out.push("MFG-002");
        }
        if !self.support_ok {
            out.push("MFG-003");
        }
        if !self.bed_fit_ok {
            out.push("MFG-004");
        }
        out
    }
}

#[derive(Debug, Clone)]
struct OrientationAnalysis {
    orientation_up: AxisDirection,
    oriented_extents_m: [f64; 3],
    bed_fit_ok: bool,
    max_overhang_deg: f64,
    overhang_ok: bool,
    support_volume_m3: f64,
    support_ratio: f64,
    support_ok: bool,
}

pub fn analyze_mesh(mesh: &MeshBuffers, profiles: &[PrintProfile]) -> Vec<DfmProfileAnalysis> {
    let min_wall_m = min_axis_extent(mesh);
    profiles
        .iter()
        .map(|profile| {
            let best = AxisDirection::all()
                .into_iter()
                .map(|up| analyze_orientation(mesh, *profile, up))
                .min_by(compare_orientation)
                .unwrap_or_else(|| analyze_orientation(mesh, *profile, AxisDirection::PosY));
            let min_wall_ok = min_wall_m + 1e-12 >= profile.min_wall_m;
            let passed = min_wall_ok && best.bed_fit_ok && best.overhang_ok && best.support_ok;
            DfmProfileAnalysis {
                process: profile.process,
                min_wall_m,
                min_wall_ok,
                orientation_up: best.orientation_up,
                oriented_extents_m: best.oriented_extents_m,
                bed_fit_ok: best.bed_fit_ok,
                max_overhang_deg: best.max_overhang_deg,
                overhang_ok: best.overhang_ok,
                support_volume_m3: best.support_volume_m3,
                support_ratio: best.support_ratio,
                support_ok: best.support_ok,
                passed,
            }
        })
        .collect()
}

fn compare_orientation(a: &OrientationAnalysis, b: &OrientationAnalysis) -> std::cmp::Ordering {
    let failures = |x: &OrientationAnalysis| {
        (!x.bed_fit_ok as u8) + (!x.overhang_ok as u8) + (!x.support_ok as u8)
    };
    (!a.bed_fit_ok)
        .cmp(&(!b.bed_fit_ok))
        .then_with(|| {
            failures(a)
                .cmp(&failures(b))
                .then_with(|| total_cmp(a.support_ratio, b.support_ratio))
        })
        .then_with(|| total_cmp(a.max_overhang_deg, b.max_overhang_deg))
        .then_with(|| total_cmp(a.oriented_extents_m[2], b.oriented_extents_m[2]))
}

fn total_cmp(a: f64, b: f64) -> std::cmp::Ordering {
    a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)
}

fn analyze_orientation(
    mesh: &MeshBuffers,
    profile: PrintProfile,
    orientation_up: AxisDirection,
) -> OrientationAnalysis {
    let up = orientation_up.vector();
    let (bed_u, bed_v) = orientation_up.bed_axes();
    let extents = oriented_extents(mesh, bed_u, bed_v, up);
    let bed_fit_ok = fits_bed(extents, profile.bed_m);
    let (max_overhang_deg, support_volume_m3, support_ratio) =
        overhang_and_support(mesh, up, extents);
    let overhang_ok = max_overhang_deg <= profile.max_overhang_deg + 1e-9;
    let support_ok = support_ratio <= profile.max_support_ratio + 1e-9;
    OrientationAnalysis {
        orientation_up,
        oriented_extents_m: extents,
        bed_fit_ok,
        max_overhang_deg,
        overhang_ok,
        support_volume_m3,
        support_ratio,
        support_ok,
    }
}

fn min_axis_extent(mesh: &MeshBuffers) -> f64 {
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for p in mesh.positions.chunks_exact(3) {
        for axis in 0..3 {
            min[axis] = min[axis].min(p[axis] as f64);
            max[axis] = max[axis].max(p[axis] as f64);
        }
    }
    (0..3)
        .map(|axis| max[axis] - min[axis])
        .filter(|v| v.is_finite())
        .fold(f64::INFINITY, f64::min)
}

fn oriented_extents(
    mesh: &MeshBuffers,
    bed_u: [f64; 3],
    bed_v: [f64; 3],
    up: [f64; 3],
) -> [f64; 3] {
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for p in mesh.positions.chunks_exact(3) {
        let p = [p[0] as f64, p[1] as f64, p[2] as f64];
        for (axis, value) in [dot(p, bed_u), dot(p, bed_v), dot(p, up)]
            .into_iter()
            .enumerate()
        {
            min[axis] = min[axis].min(value);
            max[axis] = max[axis].max(value);
        }
    }
    [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

fn fits_bed(extents: [f64; 3], bed_m: [f64; 3]) -> bool {
    let bed_xy = (extents[0] <= bed_m[0] && extents[1] <= bed_m[1])
        || (extents[0] <= bed_m[1] && extents[1] <= bed_m[0]);
    bed_xy && extents[2] <= bed_m[2]
}

fn overhang_and_support(mesh: &MeshBuffers, up: [f64; 3], extents: [f64; 3]) -> (f64, f64, f64) {
    let mut bed_min = f64::INFINITY;
    for p in mesh.positions.chunks_exact(3) {
        bed_min = bed_min.min(dot([p[0] as f64, p[1] as f64, p[2] as f64], up));
    }
    let mut max_overhang_deg = 0.0f64;
    let mut support_volume = 0.0f64;
    let bed_contact_tol = (extents[2].abs() * 0.01).clamp(0.000_05, 0.000_5);

    for tri in mesh.indices.chunks_exact(3) {
        let a = point(mesh, tri[0]);
        let b = point(mesh, tri[1]);
        let c = point(mesh, tri[2]);
        let ab = sub(b, a);
        let ac = sub(c, a);
        let cr = cross(ab, ac);
        let cr_len = len(cr);
        if cr_len < 1e-18 {
            continue;
        }
        let area = 0.5 * cr_len;
        let n = scale(cr, 1.0 / cr_len);
        let down = -dot(n, up);
        if down <= 1e-9 {
            continue;
        }
        let centroid_up = (dot(a, up) + dot(b, up) + dot(c, up)) / 3.0;
        if centroid_up <= bed_min + bed_contact_tol {
            continue;
        }
        let overhang_deg = down.clamp(0.0, 1.0).asin().to_degrees();
        max_overhang_deg = max_overhang_deg.max(overhang_deg);
        support_volume += area * down * (centroid_up - bed_min).max(0.0);
    }

    let bbox_volume = (extents[0] * extents[1] * extents[2]).max(1e-18);
    (
        max_overhang_deg,
        support_volume,
        support_volume / bbox_volume,
    )
}

fn point(mesh: &MeshBuffers, i: u32) -> [f64; 3] {
    let i = i as usize * 3;
    [
        mesh.positions[i] as f64,
        mesh.positions[i + 1] as f64,
        mesh.positions[i + 2] as f64,
    ]
}

fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn sub(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn len(a: [f64; 3]) -> f64 {
    dot(a, a).sqrt()
}

fn scale(a: [f64; 3], s: f64) -> [f64; 3] {
    [a[0] * s, a[1] * s, a[2] * s]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_with_unsupported_roof() -> MeshBuffers {
        let mut mesh = MeshBuffers::default();
        let points = [
            [-0.05, 0.02, -0.05],
            [0.05, 0.02, -0.05],
            [0.05, 0.02, 0.05],
            [-0.05, 0.02, 0.05],
            [-0.005, 0.0, -0.005],
            [0.005, 0.0, -0.005],
            [0.005, 0.0, 0.005],
            [-0.005, 0.0, 0.005],
        ];
        for p in points {
            mesh.positions
                .extend_from_slice(&[p[0] as f32, p[1] as f32, p[2] as f32]);
        }
        mesh.indices
            .extend_from_slice(&[0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
        mesh
    }

    #[test]
    fn support_estimate_flags_unsupported_overhang_when_orientation_is_constrained() {
        let profile = PrintProfile {
            process: PrintProcess::Fdm,
            min_wall_m: 0.001,
            max_overhang_deg: 45.0,
            max_support_ratio: 0.005,
            bed_m: [0.20, 0.20, 0.05],
        };
        let analysis = analyze_mesh(&table_with_unsupported_roof(), &[profile])
            .pop()
            .unwrap();
        assert!(analysis.bed_fit_ok, "{analysis:#?}");
        assert!(!analysis.overhang_ok, "{analysis:#?}");
        assert!(!analysis.support_ok, "{analysis:#?}");
        assert!(
            analysis.support_ratio > profile.max_support_ratio,
            "{analysis:#?}"
        );
        assert_eq!(analysis.failed_checks(), vec!["MFG-002", "MFG-003"]);
    }

    #[test]
    fn structural_profiles_accept_simple_six_millimeter_plate() {
        let geom = forge_contract::Geom::Box {
            w: 0.03,
            h: 0.006,
            d: 0.11,
        };
        let (mesh, _) = crate::primitives::bake_part(&geom, None).unwrap();
        let analyses = analyze_mesh(&mesh, &structural_profiles());
        assert_eq!(analyses.len(), 2);
        assert!(analyses.iter().all(|a| a.passed), "{analyses:#?}");
        assert!(analyses
            .iter()
            .all(|a| a.orientation_up == AxisDirection::PosY));
    }
}
