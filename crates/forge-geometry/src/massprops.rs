//! Polyhedral mass properties by signed-tetrahedron (divergence-theorem) sums —
//! Eberly's "Polyhedral Mass Properties" formulation. Density-free: returns
//! volume (m³), centroid (m), and the inertia tensor about the centroid for
//! unit density (multiply by ρ for kg·m²).

use crate::MeshBuffers;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MassProperties {
    /// Signed volume, m³ (positive for outward-wound closed meshes).
    pub volume: f64,
    /// Center of mass, meters.
    pub com: [f64; 3],
    /// Inertia tensor about the COM for unit density (kg·m² per kg/m³):
    /// [ixx, iyy, izz, ixy, iyz, ixz].
    pub inertia_unit_density: [f64; 6],
}

#[allow(clippy::many_single_char_names)]
pub fn compute(mesh: &MeshBuffers) -> MassProperties {
    let mut intg = [0.0f64; 10];

    let p = |i: u32| -> [f64; 3] {
        let i = i as usize * 3;
        [
            mesh.positions[i] as f64,
            mesh.positions[i + 1] as f64,
            mesh.positions[i + 2] as f64,
        ]
    };

    for tri in mesh.indices.chunks_exact(3) {
        let [x0, y0, z0] = p(tri[0]);
        let [x1, y1, z1] = p(tri[1]);
        let [x2, y2, z2] = p(tri[2]);

        let a1 = x1 - x0;
        let b1 = y1 - y0;
        let c1 = z1 - z0;
        let a2 = x2 - x0;
        let b2 = y2 - y0;
        let c2 = z2 - z0;
        let d0 = b1 * c2 - b2 * c1;
        let d1 = a2 * c1 - a1 * c2;
        let d2 = a1 * b2 - a2 * b1;

        let (f1x, f2x, f3x, g0x, g1x, g2x) = sub_expressions(x0, x1, x2);
        let (_f1y, f2y, f3y, g0y, g1y, g2y) = sub_expressions(y0, y1, y2);
        let (_f1z, f2z, f3z, g0z, g1z, g2z) = sub_expressions(z0, z1, z2);

        intg[0] += d0 * f1x;
        intg[1] += d0 * f2x;
        intg[2] += d1 * f2y;
        intg[3] += d2 * f2z;
        intg[4] += d0 * f3x;
        intg[5] += d1 * f3y;
        intg[6] += d2 * f3z;
        intg[7] += d0 * (y0 * g0x + y1 * g1x + y2 * g2x);
        intg[8] += d1 * (z0 * g0y + z1 * g1y + z2 * g2y);
        intg[9] += d2 * (x0 * g0z + x1 * g1z + x2 * g2z);
    }

    const K: [f64; 10] = [
        1.0 / 6.0,
        1.0 / 24.0,
        1.0 / 24.0,
        1.0 / 24.0,
        1.0 / 60.0,
        1.0 / 60.0,
        1.0 / 60.0,
        1.0 / 120.0,
        1.0 / 120.0,
        1.0 / 120.0,
    ];
    for (v, k) in intg.iter_mut().zip(K) {
        *v *= k;
    }

    let volume = intg[0];
    let com = if volume.abs() > 1e-30 {
        [intg[1] / volume, intg[2] / volume, intg[3] / volume]
    } else {
        [0.0; 3]
    };

    // inertia about the origin (unit density)
    let mut ixx = intg[5] + intg[6];
    let mut iyy = intg[4] + intg[6];
    let mut izz = intg[4] + intg[5];
    let mut ixy = -intg[7];
    let mut iyz = -intg[8];
    let mut ixz = -intg[9];

    // shift to COM (parallel axis, mass = volume × unit density)
    let m = volume;
    ixx -= m * (com[1] * com[1] + com[2] * com[2]);
    iyy -= m * (com[0] * com[0] + com[2] * com[2]);
    izz -= m * (com[0] * com[0] + com[1] * com[1]);
    ixy += m * com[0] * com[1];
    iyz += m * com[1] * com[2];
    ixz += m * com[0] * com[2];

    MassProperties {
        volume,
        com,
        inertia_unit_density: [ixx, iyy, izz, ixy, iyz, ixz],
    }
}

fn sub_expressions(w0: f64, w1: f64, w2: f64) -> (f64, f64, f64, f64, f64, f64) {
    let temp0 = w0 + w1;
    let f1 = temp0 + w2;
    let temp1 = w0 * w0;
    let temp2 = temp1 + w1 * temp0;
    let f2 = temp2 + w2 * f1;
    let f3 = w0 * temp1 + w1 * temp2 + w2 * f2;
    let g0 = f2 + w0 * (f1 + w0);
    let g1 = f2 + w1 * (f1 + w1);
    let g2 = f2 + w2 * (f1 + w2);
    (f1, f2, f3, g0, g1, g2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::primitives::build;
    use forge_contract::Geom;

    #[test]
    fn unit_cube_about_com() {
        // box builder: y ∈ [0,1], centered XZ
        let m = build(&Geom::Box {
            w: 1.0,
            h: 1.0,
            d: 1.0,
        })
        .unwrap();
        let mp = compute(&m);
        assert!((mp.volume - 1.0).abs() < 1e-9);
        assert!(mp.com[0].abs() < 1e-9 && (mp.com[1] - 0.5).abs() < 1e-9 && mp.com[2].abs() < 1e-9);
        // unit-density cube: I = m·(a²+b²)/12 = 1/6 on each axis about COM
        for k in 0..3 {
            assert!(
                (mp.inertia_unit_density[k] - 1.0 / 6.0).abs() < 1e-9,
                "I[{k}] = {}",
                mp.inertia_unit_density[k]
            );
        }
        for k in 3..6 {
            assert!(mp.inertia_unit_density[k].abs() < 1e-9);
        }
    }

    #[test]
    fn cylinder_inertia_close() {
        let (r, h) = (0.5f64, 1.0f64);
        let m = build(&Geom::Cyl {
            r0: r,
            r1: None,
            h,
            n: Some(512),
        })
        .unwrap();
        let mp = compute(&m);
        let vol = std::f64::consts::PI * r * r * h;
        assert!((mp.volume - vol).abs() / vol < 5e-4);
        // about COM: Iyy (axis) = m r²/2 ; Ixx = Izz = m(3r² + h²)/12, m = vol
        let iyy = vol * r * r / 2.0;
        let ixx = vol * (3.0 * r * r + h * h) / 12.0;
        assert!((mp.inertia_unit_density[1] - iyy).abs() / iyy < 2e-3);
        assert!((mp.inertia_unit_density[0] - ixx).abs() / ixx < 2e-3);
        assert!((mp.inertia_unit_density[2] - ixx).abs() / ixx < 2e-3);
    }
}
