//! XC-09 — geometric collision truth: per-part BVH over world-space
//! triangles plus Möller interval triangle-triangle intersection. Upgrades
//! GEO-003 from AABB candidacy to confirmed mesh intersection, and is the
//! substrate for animation-frame scans (GEO-008) and the geometric prop
//! sweep (CAT-004 v1, when catalog rows carry meshes).
//!
//! Determinism: pure f64 arithmetic over the baked f32 vertices — no
//! transcendentals, no platform-dependent paths (D17).

use crate::{transform_point, Mat4, MeshBuffers};

type Tri = [[f64; 3]; 3];

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
fn dot(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Möller's interval test (1997): triangles intersect iff each straddles the
/// other's plane and their intervals on the plane-intersection line overlap.
/// Coplanar pairs are treated as non-intersecting (touching faces are the
/// prototype's design language, not interference).
pub fn tri_tri_intersect(t1: &Tri, t2: &Tri) -> bool {
    const EPS: f64 = 1e-12;

    let n2 = cross(sub(t2[1], t2[0]), sub(t2[2], t2[0]));
    let d2 = -dot(n2, t2[0]);
    let dv1 = [
        dot(n2, t1[0]) + d2,
        dot(n2, t1[1]) + d2,
        dot(n2, t1[2]) + d2,
    ];
    let (a, b, c) = (dv1[0], dv1[1], dv1[2]);
    if (a > EPS && b > EPS && c > EPS) || (a < -EPS && b < -EPS && c < -EPS) {
        return false;
    }

    let n1 = cross(sub(t1[1], t1[0]), sub(t1[2], t1[0]));
    let d1 = -dot(n1, t1[0]);
    let dv2 = [
        dot(n1, t2[0]) + d1,
        dot(n1, t2[1]) + d1,
        dot(n1, t2[2]) + d1,
    ];
    let (e, f, g) = (dv2[0], dv2[1], dv2[2]);
    if (e > EPS && f > EPS && g > EPS) || (e < -EPS && f < -EPS && g < -EPS) {
        return false;
    }

    // coplanar → not interference for our purposes
    if a.abs() <= EPS && b.abs() <= EPS && c.abs() <= EPS {
        return false;
    }

    // intersection line direction; project on the dominant axis
    let dir = cross(n1, n2);
    let axis = if dir[0].abs() >= dir[1].abs() && dir[0].abs() >= dir[2].abs() {
        0
    } else if dir[1].abs() >= dir[2].abs() {
        1
    } else {
        2
    };
    let p1 = [t1[0][axis], t1[1][axis], t1[2][axis]];
    let p2 = [t2[0][axis], t2[1][axis], t2[2][axis]];

    let interval = |p: [f64; 3], dv: [f64; 3]| -> Option<(f64, f64)> {
        // pair the vertex on one side with the two on the other
        let (solo, i, j) = if dv[0] * dv[1] > 0.0 {
            (2, 0, 1)
        } else if dv[0] * dv[2] > 0.0 {
            (1, 0, 2)
        } else {
            (0, 1, 2)
        };
        let denom_i = dv[i] - dv[solo];
        let denom_j = dv[j] - dv[solo];
        if denom_i.abs() <= EPS || denom_j.abs() <= EPS {
            return None; // degenerate straddle — treat as touching, not crossing
        }
        let t_i = p[i] + (p[solo] - p[i]) * (dv[i] / denom_i);
        let t_j = p[j] + (p[solo] - p[j]) * (dv[j] / denom_j);
        Some((t_i.min(t_j), t_i.max(t_j)))
    };

    let (Some((lo1, hi1)), Some((lo2, hi2))) = (interval(p1, dv1), interval(p2, dv2)) else {
        return false;
    };
    lo1.max(lo2) <= hi1.min(hi2)
}

#[derive(Debug, Clone, Copy)]
struct Aabb {
    min: [f64; 3],
    max: [f64; 3],
}

impl Aabb {
    fn of_tri(t: &Tri) -> Aabb {
        let mut min = t[0];
        let mut max = t[0];
        for v in &t[1..] {
            for a in 0..3 {
                min[a] = min[a].min(v[a]);
                max[a] = max[a].max(v[a]);
            }
        }
        Aabb { min, max }
    }
    fn union(self, o: Aabb) -> Aabb {
        let mut r = self;
        for a in 0..3 {
            r.min[a] = r.min[a].min(o.min[a]);
            r.max[a] = r.max[a].max(o.max[a]);
        }
        r
    }
    fn overlaps(&self, o: &Aabb) -> bool {
        (0..3).all(|a| self.min[a] <= o.max[a] && self.max[a] >= o.min[a])
    }
    fn longest_axis(&self) -> usize {
        let e = [
            self.max[0] - self.min[0],
            self.max[1] - self.min[1],
            self.max[2] - self.min[2],
        ];
        if e[0] >= e[1] && e[0] >= e[2] {
            0
        } else if e[1] >= e[2] {
            1
        } else {
            2
        }
    }
}

#[derive(Debug)]
enum Node {
    Leaf {
        bounds: Aabb,
        start: usize,
        count: usize,
    },
    Branch {
        bounds: Aabb,
        left: usize,
        right: usize,
    },
}

/// A world-space triangle BVH for one baked part at one pose.
#[derive(Debug)]
pub struct PartBvh {
    tris: Vec<Tri>,
    order: Vec<usize>,
    nodes: Vec<Node>,
    root: usize,
}

const LEAF_SIZE: usize = 8;

impl PartBvh {
    pub fn build(mesh: &MeshBuffers, world: &Mat4) -> PartBvh {
        let v = |i: u32| {
            let p = &mesh.positions[i as usize * 3..i as usize * 3 + 3];
            transform_point(world, [p[0] as f64, p[1] as f64, p[2] as f64])
        };
        let tris: Vec<Tri> = mesh
            .indices
            .chunks(3)
            .map(|t| [v(t[0]), v(t[1]), v(t[2])])
            .collect();
        let mut order: Vec<usize> = (0..tris.len()).collect();
        let mut nodes = Vec::new();
        let boxes: Vec<Aabb> = tris.iter().map(Aabb::of_tri).collect();
        let root = Self::split(&tris, &boxes, &mut order, 0, tris.len(), &mut nodes);
        PartBvh {
            tris,
            order,
            nodes,
            root,
        }
    }

    fn split(
        tris: &[Tri],
        boxes: &[Aabb],
        order: &mut [usize],
        start: usize,
        end: usize,
        nodes: &mut Vec<Node>,
    ) -> usize {
        let mut bounds = boxes[order[start]];
        for &i in &order[start + 1..end] {
            bounds = bounds.union(boxes[i]);
        }
        if end - start <= LEAF_SIZE {
            nodes.push(Node::Leaf {
                bounds,
                start,
                count: end - start,
            });
            return nodes.len() - 1;
        }
        let axis = bounds.longest_axis();
        let centroid = |i: usize| (tris[i][0][axis] + tris[i][1][axis] + tris[i][2][axis]) / 3.0;
        order[start..end].sort_by(|&a, &b| centroid(a).total_cmp(&centroid(b)));
        let mid = (start + end) / 2;
        let left = Self::split(tris, boxes, order, start, mid, nodes);
        let right = Self::split(tris, boxes, order, mid, end, nodes);
        nodes.push(Node::Branch {
            bounds,
            left,
            right,
        });
        nodes.len() - 1
    }

    fn bounds(&self, n: usize) -> &Aabb {
        match &self.nodes[n] {
            Node::Leaf { bounds, .. } | Node::Branch { bounds, .. } => bounds,
        }
    }

    /// True if any triangle of `self` properly intersects any of `other`.
    pub fn intersects(&self, other: &PartBvh) -> bool {
        if self.tris.is_empty() || other.tris.is_empty() {
            return false;
        }
        let mut stack = vec![(self.root, other.root)];
        while let Some((a, b)) = stack.pop() {
            if !self.bounds(a).overlaps(other.bounds(b)) {
                continue;
            }
            match (&self.nodes[a], &other.nodes[b]) {
                (
                    Node::Leaf { start, count, .. },
                    Node::Leaf {
                        start: s2,
                        count: c2,
                        ..
                    },
                ) => {
                    for &i in &self.order[*start..start + count] {
                        for &j in &other.order[*s2..s2 + c2] {
                            if tri_tri_intersect(&self.tris[i], &other.tris[j]) {
                                return true;
                            }
                        }
                    }
                }
                (Node::Branch { left, right, .. }, _) => {
                    stack.push((*left, b));
                    stack.push((*right, b));
                }
                (_, Node::Branch { left, right, .. }) => {
                    stack.push((a, *left));
                    stack.push((a, *right));
                }
            }
        }
        false
    }
}

/// Node-local AABB of a mesh (the cheap per-frame candidate filter for the
/// animation sweep, GEO-008).
pub fn mesh_local_aabb(mesh: &MeshBuffers) -> ([f64; 3], [f64; 3]) {
    let mut min = [f64::MAX; 3];
    let mut max = [f64::MIN; 3];
    for v in mesh.positions.chunks(3) {
        for a in 0..3 {
            min[a] = min[a].min(v[a] as f64);
            max[a] = max[a].max(v[a] as f64);
        }
    }
    (min, max)
}

/// Conservative world AABB: the local box's 8 corners through the matrix.
pub fn transformed_aabb(local: ([f64; 3], [f64; 3]), m: &Mat4) -> ([f64; 3], [f64; 3]) {
    let (lo, hi) = local;
    let mut min = [f64::MAX; 3];
    let mut max = [f64::MIN; 3];
    for cx in [lo[0], hi[0]] {
        for cy in [lo[1], hi[1]] {
            for cz in [lo[2], hi[2]] {
                let p = transform_point(m, [cx, cy, cz]);
                for a in 0..3 {
                    min[a] = min[a].min(p[a]);
                    max[a] = max[a].max(p[a]);
                }
            }
        }
    }
    (min, max)
}

pub fn aabbs_overlap(a: ([f64; 3], [f64; 3]), b: ([f64; 3], [f64; 3]), tol: f64) -> bool {
    (0..3).all(|k| a.0[k] + tol < b.1[k] && b.0[k] + tol < a.1[k])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity;

    fn unit_box_mesh(offset: [f32; 3]) -> MeshBuffers {
        // 12-tri unit cube centered at offset
        let p = |x: f32, y: f32, z: f32| {
            [
                x - 0.5 + offset[0],
                y - 0.5 + offset[1],
                z - 0.5 + offset[2],
            ]
        };
        let corners = [
            p(0., 0., 0.),
            p(1., 0., 0.),
            p(1., 1., 0.),
            p(0., 1., 0.),
            p(0., 0., 1.),
            p(1., 0., 1.),
            p(1., 1., 1.),
            p(0., 1., 1.),
        ];
        let quads = [
            [0, 3, 2, 1],
            [4, 5, 6, 7],
            [0, 1, 5, 4],
            [2, 3, 7, 6],
            [1, 2, 6, 5],
            [3, 0, 4, 7],
        ];
        let mut positions = Vec::new();
        for c in corners {
            positions.extend_from_slice(&c);
        }
        let mut indices = Vec::new();
        for q in quads {
            indices.extend_from_slice(&[q[0], q[1], q[2], q[0], q[2], q[3]]);
        }
        MeshBuffers {
            normals: vec![0.0; positions.len()],
            positions,
            indices,
        }
    }

    #[test]
    fn tri_tri_basic_cases() {
        let a: Tri = [[0., 0., 0.], [1., 0., 0.], [0., 1., 0.]];
        // crossing through the plane of `a`
        let b: Tri = [[0.2, 0.2, -0.5], [0.4, 0.2, 0.5], [0.2, 0.4, 0.5]];
        assert!(tri_tri_intersect(&a, &b));
        // far away
        let c: Tri = [[5., 5., 5.], [6., 5., 5.], [5., 6., 5.]];
        assert!(!tri_tri_intersect(&a, &c));
        // parallel above
        let d: Tri = [[0., 0., 1.], [1., 0., 1.], [0., 1., 1.]];
        assert!(!tri_tri_intersect(&a, &d));
        // coplanar overlap → by policy NOT interference
        let e: Tri = [[0.1, 0.1, 0.], [0.9, 0.1, 0.], [0.1, 0.9, 0.]];
        assert!(!tri_tri_intersect(&a, &e));
    }

    #[test]
    fn bvh_detects_real_interpenetration_and_clears_separation() {
        let id = identity();
        let a = PartBvh::build(&unit_box_mesh([0., 0., 0.]), &id);
        let overlapping = PartBvh::build(&unit_box_mesh([0.5, 0.3, 0.2]), &id);
        assert!(a.intersects(&overlapping));
        let separate = PartBvh::build(&unit_box_mesh([2.0, 0., 0.]), &id);
        assert!(!a.intersects(&separate));
        // AABB-overlapping but mesh-disjoint: small box in the corner gap…
        // a box fully INSIDE another has no surface intersection — contained
        let contained = PartBvh::build(
            &{
                let mut m = unit_box_mesh([0., 0., 0.]);
                for v in m.positions.iter_mut() {
                    *v *= 0.4;
                }
                m
            },
            &id,
        );
        assert!(
            !a.intersects(&contained),
            "containment without surface crossing is not a surface intersection"
        );
    }
}
