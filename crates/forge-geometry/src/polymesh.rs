//! Prototype-exact polygon meshes (PRE-002 reconciliation).
//!
//! These builders are line-by-line ports of the frozen monolith's primitives
//! (`prototype/cad-object-studio.html` @ `prototype-final`) — the executable
//! specification. Vertex and polygon-face counts must match it exactly: they
//! are the P0-004 byte-equivalence quantities. Solids are **origin-centered**
//! (y ∈ [−h/2, +h/2]) for taper/box/cbox/cyl; lathe profiles carry absolute y.
//!
//! Polygons (quads, n-gons) are the contract-level truth; triangulation for
//! GPU buffers happens at bake (`bake_part`), after pose application and the
//! prototype's centroid-based outward-orientation fix (its `P()` function).

/// Shared-vertex polygon mesh, exactly the monolith's `{v, f}` records.
#[derive(Debug, Clone, Default)]
pub struct PolyMesh {
    pub v: Vec<[f64; 3]>,
    pub f: Vec<Vec<u32>>,
}

/// Monolith `taper(wB,dB,wT,dT,h)`: 8 verts, 6 quad faces, centered.
pub fn taper(w_b: f64, d_b: f64, w_t: f64, d_t: f64, h: f64) -> PolyMesh {
    let (xb, zb, xt, zt, y) = (w_b / 2.0, d_b / 2.0, w_t / 2.0, d_t / 2.0, h / 2.0);
    PolyMesh {
        v: vec![
            [-xb, -y, -zb],
            [xb, -y, -zb],
            [xb, -y, zb],
            [-xb, -y, zb],
            [-xt, y, -zt],
            [xt, y, -zt],
            [xt, y, zt],
            [-xt, y, zt],
        ],
        f: vec![
            vec![0, 1, 2, 3],
            vec![4, 5, 6, 7],
            vec![0, 1, 5, 4],
            vec![1, 2, 6, 5],
            vec![2, 3, 7, 6],
            vec![3, 0, 4, 7],
        ],
    }
}

/// Monolith `box(w,h,d)` = `taper(w,d,w,d,h)`.
pub fn cuboid(w: f64, h: f64, d: f64) -> PolyMesh {
    taper(w, d, w, d, h)
}

/// Monolith `cbox(w,h,d,c)`: chamfered box — 24 verts, 26 faces.
pub fn cbox(w: f64, h: f64, d: f64, c: f64) -> PolyMesh {
    let (x, y, z) = (w / 2.0, h / 2.0, d / 2.0);
    let c = c.min(x * 0.45).min(y * 0.45).min(z * 0.45);
    let ci = |sx: i32, sy: i32, sz: i32| -> u32 {
        let mut idx = 0u32;
        if sx < 0 {
            idx += 4;
        }
        if sy < 0 {
            idx += 2;
        }
        if sz < 0 {
            idx += 1;
        }
        idx
    };
    let ord: [[i32; 3]; 8] = [
        [1, 1, 1],
        [1, 1, -1],
        [1, -1, 1],
        [1, -1, -1],
        [-1, 1, 1],
        [-1, 1, -1],
        [-1, -1, 1],
        [-1, -1, -1],
    ];
    let mut v = Vec::with_capacity(24);
    for s in ord {
        let (sx, sy, sz) = (s[0] as f64, s[1] as f64, s[2] as f64);
        v.push([sx * x, sy * (y - c), sz * (z - c)]);
        v.push([sx * (x - c), sy * y, sz * (z - c)]);
        v.push([sx * (x - c), sy * (y - c), sz * z]);
    }
    let mut f: Vec<Vec<u32>> = Vec::with_capacity(26);
    f.push(vec![
        ci(1, 1, 1) * 3,
        ci(1, 1, -1) * 3,
        ci(1, -1, -1) * 3,
        ci(1, -1, 1) * 3,
    ]);
    f.push(vec![
        ci(-1, 1, 1) * 3,
        ci(-1, -1, 1) * 3,
        ci(-1, -1, -1) * 3,
        ci(-1, 1, -1) * 3,
    ]);
    f.push(vec![
        ci(1, 1, 1) * 3 + 1,
        ci(-1, 1, 1) * 3 + 1,
        ci(-1, 1, -1) * 3 + 1,
        ci(1, 1, -1) * 3 + 1,
    ]);
    f.push(vec![
        ci(1, -1, 1) * 3 + 1,
        ci(1, -1, -1) * 3 + 1,
        ci(-1, -1, -1) * 3 + 1,
        ci(-1, -1, 1) * 3 + 1,
    ]);
    f.push(vec![
        ci(1, 1, 1) * 3 + 2,
        ci(1, -1, 1) * 3 + 2,
        ci(-1, -1, 1) * 3 + 2,
        ci(-1, 1, 1) * 3 + 2,
    ]);
    f.push(vec![
        ci(1, 1, -1) * 3 + 2,
        ci(-1, 1, -1) * 3 + 2,
        ci(-1, -1, -1) * 3 + 2,
        ci(1, -1, -1) * 3 + 2,
    ]);
    let sgn = [1, -1];
    for sx in sgn {
        for sy in sgn {
            let (a, b) = (ci(sx, sy, 1), ci(sx, sy, -1));
            f.push(vec![a * 3, a * 3 + 1, b * 3 + 1, b * 3]);
        }
    }
    for sx in sgn {
        for sz in sgn {
            let (a, b) = (ci(sx, 1, sz), ci(sx, -1, sz));
            f.push(vec![a * 3, a * 3 + 2, b * 3 + 2, b * 3]);
        }
    }
    for sy in sgn {
        for sz in sgn {
            let (a, b) = (ci(1, sy, sz), ci(-1, sy, sz));
            f.push(vec![a * 3 + 1, a * 3 + 2, b * 3 + 2, b * 3 + 1]);
        }
    }
    for i in 0..8u32 {
        f.push(vec![i * 3, i * 3 + 1, i * 3 + 2]);
    }
    PolyMesh { v, f }
}

/// Monolith `cyl(rB,rT,h,n)`: 2n verts, n side quads + 2 n-gon caps, centered.
#[allow(clippy::approx_constant)] // the monolith's literal 6.2831853, NOT f64::TAU:
                                  // golden-number position equivalence against the oracle depends on it (D17/PRE-002)
pub fn cyl(r_b: f64, r_t: f64, h: f64, n: usize) -> PolyMesh {
    let y = h / 2.0;
    let tau = 6.283_185_3_f64;
    let mut v = Vec::with_capacity(2 * n);
    for i in 0..n {
        let a = i as f64 / n as f64 * tau;
        v.push([forge_num::cos(a) * r_b, -y, forge_num::sin(a) * r_b]);
    }
    for i in 0..n {
        let a = i as f64 / n as f64 * tau;
        v.push([forge_num::cos(a) * r_t, y, forge_num::sin(a) * r_t]);
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

/// Monolith `lathe(prof,n)`: revolve [radius, y] profile around Y; rings with
/// r ≤ 0.0006 collapse to a single tip vertex.
#[allow(clippy::approx_constant)] // the monolith's literal — see cyl()
pub fn lathe(prof: &[[f64; 2]], n: usize) -> PolyMesh {
    let tau = 6.283_185_3_f64;
    struct Ring {
        i: u32,
        n: usize,
    }
    let mut v: Vec<[f64; 3]> = Vec::new();
    let mut rings: Vec<Ring> = Vec::new();
    for p in prof {
        let (r, y) = (p[0], p[1]);
        if r <= 0.0006 {
            rings.push(Ring {
                i: v.len() as u32,
                n: 1,
            });
            v.push([0.0, y, 0.0]);
        } else {
            rings.push(Ring {
                i: v.len() as u32,
                n,
            });
            for i in 0..n {
                let a = i as f64 / n as f64 * tau;
                v.push([forge_num::cos(a) * r, y, forge_num::sin(a) * r]);
            }
        }
    }
    let m = prof.len();
    let mut f: Vec<Vec<u32>> = Vec::new();
    for j in 0..m - 1 {
        let (a, b) = (&rings[j], &rings[j + 1]);
        if a.n == n && b.n == n {
            for i in 0..n as u32 {
                let i2 = (i + 1) % n as u32;
                f.push(vec![a.i + i, a.i + i2, b.i + i2, b.i + i]);
            }
        } else if a.n == n && b.n == 1 {
            for i in 0..n as u32 {
                f.push(vec![a.i + i, a.i + (i + 1) % n as u32, b.i]);
            }
        } else if a.n == 1 && b.n == n {
            for i in 0..n as u32 {
                f.push(vec![a.i, b.i + (i + 1) % n as u32, b.i + i]);
            }
        }
    }
    if rings[0].n == n {
        f.push((0..n as u32).map(|i| rings[0].i + i).collect());
    }
    if rings[m - 1].n == n {
        f.push((0..n as u32).map(|i| rings[m - 1].i + i).collect());
    }
    PolyMesh { v, f }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prototype_exact_counts() {
        // the byte-equivalence quantities, per primitive
        let t = taper(1.0, 1.0, 0.5, 0.5, 1.0);
        assert_eq!((t.v.len(), t.f.len()), (8, 6));
        let b = cuboid(1.0, 1.0, 1.0);
        assert_eq!((b.v.len(), b.f.len()), (8, 6));
        let c = cbox(1.0, 1.0, 1.0, 0.1);
        assert_eq!((c.v.len(), c.f.len()), (24, 26));
        let cy = cyl(0.5, 0.5, 1.0, 14);
        assert_eq!((cy.v.len(), cy.f.len()), (28, 16));
        // head lathe from the monolith: 8 points, tip at r=0, n=22
        let prof = [
            [0.070, -0.030],
            [0.092, 0.000],
            [0.102, 0.040],
            [0.103, 0.075],
            [0.096, 0.110],
            [0.078, 0.140],
            [0.048, 0.162],
            [0.0, 0.172],
        ];
        let l = lathe(&prof, 22);
        // 7 full rings ×22 + 1 tip = 155 verts; 6×22 quads + 22 tris + 1 cap = 155 faces
        assert_eq!((l.v.len(), l.f.len()), (155, 155));
    }

    #[test]
    fn solids_are_centered() {
        let b = cuboid(2.0, 4.0, 6.0);
        let ymin = b.v.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
        let ymax = b.v.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
        assert_eq!((ymin, ymax), (-2.0, 2.0));
    }
}
