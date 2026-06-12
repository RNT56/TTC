//! Primitive builders: `Geom` → flat mesh buffers.
//!
//! Conventions *(proposed pending PRE-002 reconciliation)*: solids grow from
//! y = 0 to y = h, centered in XZ. Curved sides share vertices with accumulated
//! (smooth) normals; flat sides and caps duplicate vertices for hard edges.
//! Ring orientation: parameter t increases from +X toward +Z; windings below are
//! chosen so triangles face outward (signed volume positive — tested).

use crate::MeshBuffers;
use forge_contract::{Geom, LoftProfile};

#[derive(Debug)]
pub enum BuildError {
    MeshRef(String),
    Degenerate(String),
}

pub fn build(geom: &Geom) -> Result<MeshBuffers, BuildError> {
    match geom {
        Geom::Box { w, h, d } => {
            check_pos(&[("w", *w), ("h", *h), ("d", *d)])?;
            Ok(prism_flat(&rect(*w, *d), &rect(*w, *d), 0.0, *h))
        }
        Geom::Cbox { w, h, d, ch } => {
            check_pos(&[("w", *w), ("h", *h), ("d", *d)])?;
            let ch = ch.clamp(0.0, 0.5 * w.min(*d) - f64::EPSILON);
            let poly = chamfered_rect(*w, *d, ch);
            Ok(prism_flat(&poly, &poly, 0.0, *h))
        }
        Geom::Taper { w0, d0, w1, d1, h } => {
            check_pos(&[("w0", *w0), ("d0", *d0), ("h", *h)])?;
            Ok(prism_flat(
                &rect(*w0, *d0),
                &rect(w1.max(1e-9), d1.max(1e-9)),
                0.0,
                *h,
            ))
        }
        Geom::Cyl { r0, r1, h, n } => {
            check_pos(&[("r0", *r0), ("h", *h)])?;
            let n = n.unwrap_or(24).max(3) as usize;
            let r1 = r1.unwrap_or(*r0);
            let rings = vec![(circle(*r0, n), 0.0), (circle(r1.max(0.0), n), *h)];
            Ok(ring_solid(&rings))
        }
        Geom::Lathe { profile, n } => {
            if profile.len() < 2 {
                return Err(BuildError::Degenerate(
                    "lathe profile needs ≥ 2 points".into(),
                ));
            }
            let n = n.unwrap_or(24).max(3) as usize;
            let rings: Vec<(Vec<[f64; 2]>, f64)> = profile
                .iter()
                .map(|[r, y]| (circle(r.max(0.0), n), *y))
                .collect();
            Ok(ring_solid(&rings))
        }
        Geom::Squircle { rx, rz, h, e, n } => {
            check_pos(&[("rx", *rx), ("rz", *rz), ("h", *h)])?;
            let n = n.unwrap_or(8).max(2) as usize;
            let poly = superellipse(*rx, *rz, e.max(0.5), n);
            let rings = vec![(poly.clone(), 0.0), (poly, *h)];
            Ok(ring_solid(&rings))
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
                    // r ∈ (0,1]: 1 → ellipse (p = 2), → 0 → boxy. *(proposed)*
                    let p = match st.r {
                        Some(r) => 2.0 / r.clamp(0.05, 1.0),
                        None => default_e,
                    };
                    (superellipse(st.sx.max(1e-9), st.sz.max(1e-9), p, n), st.y)
                })
                .collect();
            Ok(ring_solid(&rings))
        }
        Geom::Mesh { asset_ref } => Err(BuildError::MeshRef(asset_ref.clone())),
    }
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
// 2D profiles, ordered with t increasing from +X toward +Z
// ---------------------------------------------------------------------------

fn rect(w: f64, d: f64) -> Vec<[f64; 2]> {
    let (hw, hd) = (w / 2.0, d / 2.0);
    vec![[hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]]
}

fn chamfered_rect(w: f64, d: f64, ch: f64) -> Vec<[f64; 2]> {
    if ch <= 0.0 {
        return rect(w, d);
    }
    let (hw, hd) = (w / 2.0, d / 2.0);
    vec![
        [hw, -hd + ch],
        [hw, hd - ch],
        [hw - ch, hd],
        [-hw + ch, hd],
        [-hw, hd - ch],
        [-hw, -hd + ch],
        [-hw + ch, -hd],
        [hw - ch, -hd],
    ]
}

fn circle(r: f64, n: usize) -> Vec<[f64; 2]> {
    (0..n)
        .map(|i| {
            let t = (i as f64) / (n as f64) * std::f64::consts::TAU;
            [r * t.cos(), r * t.sin()]
        })
        .collect()
}

/// Superellipse |x/rx|^p + |z/rz|^p = 1, sampled 4·n points.
fn superellipse(rx: f64, rz: f64, p: f64, n_per_quadrant: usize) -> Vec<[f64; 2]> {
    let n = 4 * n_per_quadrant;
    let k = 2.0 / p;
    (0..n)
        .map(|i| {
            let t = (i as f64) / (n as f64) * std::f64::consts::TAU;
            let (s, c) = t.sin_cos();
            [
                rx * c.abs().powf(k) * c.signum(),
                rz * s.abs().powf(k) * s.signum(),
            ]
        })
        .collect()
}

// ---------------------------------------------------------------------------
// solid builders
// ---------------------------------------------------------------------------

struct Builder {
    m: MeshBuffers,
}

impl Builder {
    fn new() -> Self {
        Builder {
            m: MeshBuffers::default(),
        }
    }

    fn push_vert(&mut self, p: [f64; 3], n: [f64; 3]) -> u32 {
        let i = (self.m.positions.len() / 3) as u32;
        self.m
            .positions
            .extend_from_slice(&[p[0] as f32, p[1] as f32, p[2] as f32]);
        self.m
            .normals
            .extend_from_slice(&[n[0] as f32, n[1] as f32, n[2] as f32]);
        i
    }

    /// Flat triangle: duplicated vertices, face normal.
    fn tri_flat(&mut self, a: [f64; 3], b: [f64; 3], c: [f64; 3]) {
        let n = normalize(cross(sub(b, a), sub(c, a)));
        let ia = self.push_vert(a, n);
        let ib = self.push_vert(b, n);
        let ic = self.push_vert(c, n);
        self.m.indices.extend_from_slice(&[ia, ib, ic]);
    }

    fn quad_flat(&mut self, a: [f64; 3], b: [f64; 3], c: [f64; 3], d: [f64; 3]) {
        self.tri_flat(a, b, c);
        self.tri_flat(a, c, d);
    }
}

/// Prism/frustum between two same-count convex polygons (flat sides + flat caps).
fn prism_flat(bottom: &[[f64; 2]], top: &[[f64; 2]], y0: f64, y1: f64) -> MeshBuffers {
    debug_assert_eq!(bottom.len(), top.len());
    let n = bottom.len();
    let b3: Vec<[f64; 3]> = bottom.iter().map(|p| [p[0], y0, p[1]]).collect();
    let t3: Vec<[f64; 3]> = top.iter().map(|p| [p[0], y1, p[1]]).collect();
    let mut bld = Builder::new();
    // sides: outward winding (b[i+1], b[i], t[i], t[i+1])
    for i in 0..n {
        let j = (i + 1) % n;
        bld.quad_flat(b3[j], b3[i], t3[i], t3[j]);
    }
    // caps (convex fan)
    let bc = centroid(&b3);
    let tc = centroid(&t3);
    for i in 0..n {
        let j = (i + 1) % n;
        bld.tri_flat(bc, b3[i], b3[j]); // bottom, faces -Y
        bld.tri_flat(tc, t3[j], t3[i]); // top, faces +Y
    }
    bld.m
}

/// Solid of stacked rings (same point count), smooth sides via accumulated
/// normals, flat caps at the first/last ring when non-degenerate.
fn ring_solid(rings: &[(Vec<[f64; 2]>, f64)]) -> MeshBuffers {
    let n = rings[0].0.len();
    let mut m = MeshBuffers::default();
    // shared side vertices
    for (ring, y) in rings {
        for p in ring {
            m.positions
                .extend_from_slice(&[p[0] as f32, *y as f32, p[1] as f32]);
            m.normals.extend_from_slice(&[0.0, 0.0, 0.0]);
        }
    }
    let idx = |ring: usize, i: usize| (ring * n + i) as u32;
    let mut acc: Vec<[f64; 3]> = vec![[0.0; 3]; m.positions.len() / 3];
    for r in 0..rings.len() - 1 {
        for i in 0..n {
            let j = (i + 1) % n;
            // outward winding (b[j], b[i], t[i]) + (b[j], t[i], t[j])
            let quads = [
                [idx(r, j), idx(r, i), idx(r + 1, i)],
                [idx(r, j), idx(r + 1, i), idx(r + 1, j)],
            ];
            for tri in quads {
                let pa = vert(&m, tri[0]);
                let pb = vert(&m, tri[1]);
                let pc = vert(&m, tri[2]);
                let fnorm = cross(sub(pb, pa), sub(pc, pa));
                if len(fnorm) < 1e-18 {
                    continue; // degenerate (e.g. cone apex ring) — skip, keep determinism
                }
                m.indices.extend_from_slice(&tri);
                for k in tri {
                    let a = &mut acc[k as usize];
                    a[0] += fnorm[0];
                    a[1] += fnorm[1];
                    a[2] += fnorm[2];
                }
            }
        }
    }
    for (i, a) in acc.iter().enumerate() {
        let nrm = normalize(*a);
        m.normals[i * 3] = nrm[0] as f32;
        m.normals[i * 3 + 1] = nrm[1] as f32;
        m.normals[i * 3 + 2] = nrm[2] as f32;
    }
    // caps (flat, duplicated verts)
    let mut bld = Builder { m };
    let cap = |bld: &mut Builder, ring: &[[f64; 2]], y: f64, top: bool| {
        let pts: Vec<[f64; 3]> = ring.iter().map(|p| [p[0], y, p[1]]).collect();
        if ring_radius(ring) < 1e-9 {
            return;
        }
        let c = centroid(&pts);
        for i in 0..pts.len() {
            let j = (i + 1) % pts.len();
            if top {
                bld.tri_flat(c, pts[j], pts[i]);
            } else {
                bld.tri_flat(c, pts[i], pts[j]);
            }
        }
    };
    let (first_ring, first_y) = &rings[0];
    let (last_ring, last_y) = &rings[rings.len() - 1];
    cap(&mut bld, first_ring, *first_y, false);
    cap(&mut bld, last_ring, *last_y, true);
    bld.m
}

fn ring_radius(ring: &[[f64; 2]]) -> f64 {
    ring.iter()
        .map(|p| (p[0] * p[0] + p[1] * p[1]).sqrt())
        .fold(0.0, f64::max)
}

fn vert(m: &MeshBuffers, i: u32) -> [f64; 3] {
    let i = i as usize * 3;
    [
        m.positions[i] as f64,
        m.positions[i + 1] as f64,
        m.positions[i + 2] as f64,
    ]
}

fn centroid(pts: &[[f64; 3]]) -> [f64; 3] {
    let mut c = [0.0; 3];
    for p in pts {
        c[0] += p[0];
        c[1] += p[1];
        c[2] += p[2];
    }
    let n = pts.len() as f64;
    [c[0] / n, c[1] / n, c[2] / n]
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
    (a[0] * a[0] + a[1] * a[1] + a[2] * a[2]).sqrt()
}

fn normalize(a: [f64; 3]) -> [f64; 3] {
    let l = len(a);
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
        massprops::compute(&build(geom).unwrap()).volume
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
            r1: Some(0.0),
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
        // rectangular frustum: V = h/3 (A0 + A1 + sqrt(A0 A1))
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
        // approximate a unit sphere via a lathe profile
        let k = 64;
        let profile: Vec<[f64; 2]> = (0..=k)
            .map(|i| {
                let phi = std::f64::consts::PI * (i as f64) / (k as f64);
                [phi.sin(), 1.0 - phi.cos()] // r, y ∈ [0,2]
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
            let m = build(&geom).unwrap();
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
