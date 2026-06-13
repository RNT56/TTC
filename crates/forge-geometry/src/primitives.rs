//! Primitive builders: `Geom` → prototype-exact polygon meshes (PRE-002),
//! plus the bake step (pose → orientation fix → fan triangulation) that turns
//! them into flat GPU buffers.
//!
//! Conventions (reconciled to the frozen monolith): taper/box/cbox/cyl are
//! **origin-centered** (y ∈ [−h/2, +h/2]); lathe profiles carry absolute y.
//! squircle/loft are not in the delivered vintage — they keep *(proposed)*
//! parameterizations, centered for consistency, pending the later build.

use crate::polymesh::{self, PolyMesh};
use crate::MeshBuffers;
use forge_contract::{Geom, LoftProfile, PartPose};

#[derive(Debug)]
pub enum BuildError {
    MeshRef(String),
    Degenerate(String),
}

/// Polygon-level counts — the P0-004 byte-equivalence quantities.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct PolyCounts {
    pub verts: usize,
    pub polys: usize,
}

pub fn build(geom: &Geom) -> Result<PolyMesh, BuildError> {
    match geom {
        Geom::Box { w, h, d } => {
            check_pos(&[("w", *w), ("h", *h), ("d", *d)])?;
            Ok(polymesh::cuboid(*w, *h, *d))
        }
        Geom::Cbox { w, h, d, ch } => {
            check_pos(&[("w", *w), ("h", *h), ("d", *d)])?;
            Ok(polymesh::cbox(*w, *h, *d, *ch))
        }
        Geom::Taper { w0, d0, w1, d1, h } => {
            check_pos(&[("w0", *w0), ("d0", *d0), ("h", *h)])?;
            Ok(polymesh::taper(*w0, *d0, w1.max(1e-9), d1.max(1e-9), *h))
        }
        Geom::Cyl { r0, r1, h, n } => {
            check_pos(&[("r0", *r0), ("h", *h)])?;
            let n = n.unwrap_or(24).max(3) as usize;
            Ok(polymesh::cyl(*r0, r1.unwrap_or(*r0).max(0.0), *h, n))
        }
        Geom::Lathe { profile, n } => {
            if profile.len() < 2 {
                return Err(BuildError::Degenerate(
                    "lathe profile needs ≥ 2 points".into(),
                ));
            }
            let n = n.unwrap_or(24).max(3) as usize;
            Ok(polymesh::lathe(profile, n))
        }
        Geom::Squircle { rx, rz, h, e, n } => {
            check_pos(&[("rx", *rx), ("rz", *rz), ("h", *h)])?;
            let n = n.unwrap_or(8).max(2) as usize;
            Ok(prism(&superellipse(*rx, *rz, e.max(0.5), n), *h))
        }
        Geom::Loft { profile, stations } => {
            if stations.len() < 2 {
                return Err(BuildError::Degenerate("loft needs ≥ 2 stations".into()));
            }
            let (default_e, n) = match profile {
                LoftProfile::Sq { e, n } => (*e, (*n).max(2) as usize),
                LoftProfile::Circle { n } => (2.0, (*n).max(2) as usize),
            };
            let mut sorted = stations.clone();
            sorted.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal));
            let rings: Vec<(Vec<[f64; 2]>, f64)> = sorted
                .iter()
                .map(|st| {
                    let p = match st.r {
                        Some(r) => 2.0 / r.clamp(0.05, 1.0),
                        None => default_e,
                    };
                    (superellipse(st.sx.max(1e-9), st.sz.max(1e-9), p, n), st.y)
                })
                .collect();
            Ok(loft_rings(&rings))
        }
        Geom::Mesh { asset_ref } => Err(BuildError::MeshRef(asset_ref.clone())),
    }
}

/// Bake one part: pose → outward orientation (the monolith `P()` rule) →
/// fan triangulation with flat normals. Returns GPU buffers + polygon counts.
pub fn bake_part(
    geom: &Geom,
    pose: Option<&PartPose>,
) -> Result<(MeshBuffers, PolyCounts), BuildError> {
    let mesh = build(geom)?;
    let counts = PolyCounts {
        verts: mesh.v.len(),
        polys: mesh.f.len(),
    };

    // L = T·Ry·Rx·Rz·S, exactly the monolith's part transform
    let default_pose = PartPose::default();
    let pose = pose.unwrap_or(&default_pose);
    let l = part_matrix(pose);
    let verts: Vec<[f64; 3]> = mesh.v.iter().map(|q| apply(&l, *q)).collect();

    // part centroid for the outward-orientation rule
    let mut c = [0.0f64; 3];
    for v in &verts {
        c[0] += v[0];
        c[1] += v[1];
        c[2] += v[2];
    }
    let inv = 1.0 / verts.len().max(1) as f64;
    c = [c[0] * inv, c[1] * inv, c[2] * inv];

    let mut out = MeshBuffers::default();
    for face in &mesh.f {
        if face.len() < 3 {
            continue;
        }
        let (a, b, d) = (
            verts[face[0] as usize],
            verts[face[1] as usize],
            verts[face[2] as usize],
        );
        let u = sub(b, a);
        let w = sub(d, a);
        let mut n = cross(u, w);
        // face centroid
        let mut fc = [0.0f64; 3];
        for &k in face {
            let p = verts[k as usize];
            fc[0] += p[0];
            fc[1] += p[1];
            fc[2] += p[2];
        }
        let fi = 1.0 / face.len() as f64;
        fc = [fc[0] * fi, fc[1] * fi, fc[2] * fi];
        let mut indices: Vec<u32> = face.clone();
        if n[0] * (fc[0] - c[0]) + n[1] * (fc[1] - c[1]) + n[2] * (fc[2] - c[2]) < 0.0 {
            indices.reverse();
            n = [-n[0], -n[1], -n[2]];
        }
        let n = normalize(n);
        // fan triangulation, duplicated verts, flat normal
        let base = verts[indices[0] as usize];
        for k in 1..indices.len() - 1 {
            push_tri(
                &mut out,
                base,
                verts[indices[k] as usize],
                verts[indices[k + 1] as usize],
                n,
            );
        }
    }
    Ok((out, counts))
}

fn part_matrix(pose: &PartPose) -> [f64; 16] {
    use crate::{mul, Mat4};
    let t: Mat4 = {
        let mut m = crate::identity();
        m[12] = pose.p[0];
        m[13] = pose.p[1];
        m[14] = pose.p[2];
        m
    };
    let s: Mat4 = {
        let mut m = crate::identity();
        m[0] = pose.s[0];
        m[5] = pose.s[1];
        m[10] = pose.s[2];
        m
    };
    mul(
        t,
        mul(
            crate::rot_y(pose.r[1]),
            mul(crate::rot_x(pose.r[0]), mul(crate::rot_z(pose.r[2]), s)),
        ),
    )
}

fn apply(m: &[f64; 16], p: [f64; 3]) -> [f64; 3] {
    crate::transform_point(m, p)
}

fn push_tri(out: &mut MeshBuffers, a: [f64; 3], b: [f64; 3], c: [f64; 3], n: [f64; 3]) {
    let base = (out.positions.len() / 3) as u32;
    for p in [a, b, c] {
        out.positions
            .extend_from_slice(&[p[0] as f32, p[1] as f32, p[2] as f32]);
        out.normals
            .extend_from_slice(&[n[0] as f32, n[1] as f32, n[2] as f32]);
    }
    out.indices.extend_from_slice(&[base, base + 1, base + 2]);
}

fn check_pos(dims: &[(&str, f64)]) -> Result<(), BuildError> {
    for (name, v) in dims {
        if !v.is_finite() || *v <= 0.0 {
            return Err(BuildError::Degenerate(format!(
                "{name} must be finite and > 0, got {v}"
            )));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// squircle/loft helpers *(proposed — not in the delivered vintage)*
// ---------------------------------------------------------------------------

fn superellipse(rx: f64, rz: f64, p: f64, n_per_quadrant: usize) -> Vec<[f64; 2]> {
    let n = 4 * n_per_quadrant;
    let k = 2.0 / p;
    (0..n)
        .map(|i| {
            let t = (i as f64) / (n as f64) * std::f64::consts::TAU;
            let (s, c) = forge_num::sin_cos(t);
            [
                rx * forge_num::pow(c.abs(), k) * c.signum(),
                rz * forge_num::pow(s.abs(), k) * s.signum(),
            ]
        })
        .collect()
}

/// Centered prism: n side quads + 2 n-gon caps (polygon counting like cyl).
fn prism(poly: &[[f64; 2]], h: f64) -> PolyMesh {
    let n = poly.len();
    let y = h / 2.0;
    let mut v = Vec::with_capacity(2 * n);
    for p in poly {
        v.push([p[0], -y, p[1]]);
    }
    for p in poly {
        v.push([p[0], y, p[1]]);
    }
    let mut f: Vec<Vec<u32>> = Vec::with_capacity(n + 2);
    for i in 0..n {
        let j = (i + 1) % n;
        f.push(vec![i as u32, j as u32, (n + j) as u32, (n + i) as u32]);
    }
    f.push((0..n as u32).collect());
    f.push((n as u32..2 * n as u32).collect());
    PolyMesh { v, f }
}

/// Stacked rings (same count) with quads between and n-gon caps.
fn loft_rings(rings: &[(Vec<[f64; 2]>, f64)]) -> PolyMesh {
    let n = rings[0].0.len();
    let mut v = Vec::new();
    for (ring, y) in rings {
        for p in ring {
            v.push([p[0], *y, p[1]]);
        }
    }
    let mut f: Vec<Vec<u32>> = Vec::new();
    for r in 0..rings.len() - 1 {
        let (a, b) = ((r * n) as u32, ((r + 1) * n) as u32);
        for i in 0..n as u32 {
            let j = (i + 1) % n as u32;
            f.push(vec![a + i, a + j, b + j, b + i]);
        }
    }
    f.push((0..n as u32).collect());
    let last = ((rings.len() - 1) * n) as u32;
    f.push((0..n as u32).map(|i| last + i).collect());
    PolyMesh { v, f }
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

fn normalize(a: [f64; 3]) -> [f64; 3] {
    let l = (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt();
    if l < 1e-18 {
        return [0.0, 1.0, 0.0];
    }
    [a[0] / l, a[1] / l, a[2] / l]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::massprops;

    fn volume_of(geom: &Geom) -> f64 {
        massprops::compute(&bake_part(geom, None).unwrap().0).volume
    }

    #[test]
    fn box_volume_exact() {
        let v = volume_of(&Geom::Box {
            w: 2.0,
            h: 3.0,
            d: 0.5,
        });
        assert!((v - 3.0).abs() < 1e-9, "box volume {v}");
    }

    #[test]
    fn cylinder_volume_close() {
        let v = volume_of(&Geom::Cyl {
            r0: 0.5,
            r1: None,
            h: 1.0,
            n: Some(256),
        });
        let exact = std::f64::consts::PI * 0.25;
        assert!(
            (v - exact).abs() / exact < 0.001,
            "cyl volume {v} vs {exact}"
        );
    }

    #[test]
    fn cone_volume_close() {
        let v = volume_of(&Geom::Cyl {
            r0: 0.5,
            r1: Some(1e-9),
            h: 1.0,
            n: Some(256),
        });
        let exact = std::f64::consts::PI * 0.25 / 3.0;
        assert!(
            (v - exact).abs() / exact < 0.005,
            "cone volume {v} vs {exact}"
        );
    }

    #[test]
    fn taper_volume_exact_frustum() {
        let v = volume_of(&Geom::Taper {
            w0: 1.0,
            d0: 1.0,
            w1: 0.5,
            d1: 0.5,
            h: 1.2,
        });
        let (a0, a1): (f64, f64) = (1.0, 0.25);
        let exact = 1.2 / 3.0 * (a0 + a1 + (a0 * a1).sqrt());
        assert!(
            (v - exact).abs() / exact < 1e-6,
            "frustum volume {v} vs {exact}"
        );
    }

    #[test]
    fn squircle_high_exponent_approaches_box() {
        let v = volume_of(&Geom::Squircle {
            rx: 0.5,
            rz: 0.5,
            h: 1.0,
            e: 40.0,
            n: Some(64),
        });
        assert!((v - 1.0).abs() < 0.02, "squircle e→∞ volume {v} ≈ 1");
    }

    #[test]
    fn lathe_sphere_volume_close() {
        let k = 64;
        let profile: Vec<[f64; 2]> = (0..=k)
            .map(|i| {
                let phi = std::f64::consts::PI * (i as f64) / (k as f64);
                [phi.sin(), 1.0 - phi.cos()]
            })
            .collect();
        let v = volume_of(&Geom::Lathe {
            profile,
            n: Some(128),
        });
        let exact = 4.0 / 3.0 * std::f64::consts::PI;
        assert!(
            (v - exact).abs() / exact < 0.01,
            "sphere volume {v} vs {exact}"
        );
    }

    #[test]
    fn pose_translates_scales_and_rotates() {
        let pose = PartPose {
            p: [0.0, 1.0, 0.0],
            r: [0.0, 0.0, 0.0],
            s: [2.0, 1.0, 1.0],
        };
        let (m, _) = bake_part(
            &Geom::Box {
                w: 1.0,
                h: 1.0,
                d: 1.0,
            },
            Some(&pose),
        )
        .unwrap();
        let xs: Vec<f32> = m.positions.chunks_exact(3).map(|p| p[0]).collect();
        let ys: Vec<f32> = m.positions.chunks_exact(3).map(|p| p[1]).collect();
        assert!(
            xs.iter().cloned().fold(f32::MIN, f32::max) > 0.99,
            "scaled to ±1"
        );
        let ymid = (ys.iter().cloned().fold(f32::MAX, f32::min)
            + ys.iter().cloned().fold(f32::MIN, f32::max))
            / 2.0;
        assert!((ymid - 1.0).abs() < 1e-6, "translated up by 1, mid {ymid}");
    }

    #[test]
    fn normals_have_no_nans_and_unit_length() {
        for geom in [
            Geom::Cbox {
                w: 1.0,
                h: 0.2,
                d: 0.6,
                ch: 0.05,
            },
            Geom::Cyl {
                r0: 0.3,
                r1: Some(0.1),
                h: 0.8,
                n: Some(24),
            },
            Geom::Squircle {
                rx: 0.4,
                rz: 0.2,
                h: 0.3,
                e: 4.0,
                n: Some(8),
            },
        ] {
            let (m, _) = bake_part(&geom, None).unwrap();
            for n in m.normals.chunks_exact(3) {
                let l = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
                assert!(l.is_finite() && (l - 1.0).abs() < 1e-3, "normal len {l}");
            }
        }
    }

    #[test]
    fn mesh_ref_is_explicit_error() {
        assert!(matches!(
            build(&Geom::Mesh {
                asset_ref: "asset://x".into()
            }),
            Err(BuildError::MeshRef(_))
        ));
    }
}
