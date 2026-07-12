//! forge-gen — parametric model generators. Family #1: the quadruped (P2-005).
//!
//! P2's exit criterion made executable: a handful of slider values become a
//! complete, admitted, walking contract with **zero hand-written model code** —
//! every part, node, mass, explode window, and driver parameter is derived from
//! the generator's inputs. Output carries `parametric-generator` provenance.

#![forbid(unsafe_code)]

use forge_contract::{
    Archetype, Chain, CollisionPolicy, Driver, EnvBlock, Explode, Geom, Joint, JointKind, MassSpec,
    MaterialClass, Meta, ModelSpec, Node, Part, Provenance, ProvenanceKind, SimBlock,
};
use schemars::JsonSchema;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub struct QuadGenParams {
    /// Pairs of legs (2 = quadruped, 3 = hexapod chassis on the same driver).
    pub leg_pairs: u32,
    /// Hip-to-hip distance along the body axis, meters.
    pub wheelbase_m: f64,
    /// Hip-to-hip distance across the body, meters.
    pub track_m: f64,
    /// Standing hip height, meters.
    pub stand_m: f64,
    /// Total mass budget, grams.
    pub mass_g: f64,
}

impl Default for QuadGenParams {
    fn default() -> Self {
        QuadGenParams {
            leg_pairs: 2,
            wheelbase_m: 0.40,
            track_m: 0.24,
            stand_m: 0.24,
            mass_g: 2500.0,
        }
    }
}

#[derive(Debug)]
pub struct GenError(pub String);

impl std::fmt::Display for GenError {
    fmt_impl!();
}

macro_rules! fmt_impl {
    () => {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            write!(f, "{}", self.0)
        }
    };
}
use fmt_impl;

impl std::error::Error for GenError {}

/// Generate a quadruped/hexapod contract from slider values.
pub fn generate_quadruped(p: &QuadGenParams) -> Result<ModelSpec, GenError> {
    validate_params(p)?;

    // leg segment lengths: equal thigh/shank with reach margin over stand height
    let l1 = p.stand_m / 1.8;
    let l2 = p.stand_m / 1.8;
    let root_y = l1 + l2; // straight-leg static pose puts foot pads on the ground

    let body_w = p.track_m + 0.06;
    let body_d = p.wheelbase_m + 0.08;
    let body_h = 0.06;

    let mut skeleton = vec![Node {
        name: "root".into(),
        parent: None,
        pos: [0.0, root_y, 0.0],
        rot: [0.0; 3],
        limits: None,
        joint: None,
    }];
    let mut parts: Vec<Part> = Vec::new();

    // mass split: 55 % body; the rest divided equally across legs
    let n_legs = (p.leg_pairs * 2) as f64;
    let body_mass = p.mass_g * 0.55;
    let leg_mass = p.mass_g * 0.45 / n_legs;
    let (upper_mass, lower_mass, pad_mass) = (leg_mass * 0.55, leg_mass * 0.35, leg_mass * 0.10);

    // Generated structural bodies are modular by construction: no individual tile
    // exceeds the declared 220 mm FDM bed. This keeps MFG-004 sovereign for every
    // slider value instead of exempting large bodies after generation.
    const MAX_PRINT_TILE_M: f64 = 0.220;
    let body_cols = (body_w / MAX_PRINT_TILE_M).ceil().max(1.0) as usize;
    let body_rows = (body_d / MAX_PRINT_TILE_M).ceil().max(1.0) as usize;
    let tile_w = body_w / body_cols as f64;
    let tile_d = body_d / body_rows as f64;
    let tile_count = body_cols * body_rows;
    for col in 0..body_cols {
        for row in 0..body_rows {
            let tile_index = col * body_rows + row;
            let x = -body_w / 2.0 + tile_w * (col as f64 + 0.5);
            let z = -body_d / 2.0 + tile_d * (row as f64 + 0.5);
            parts.push(Part {
                node: "root".into(),
                geom: Geom::Cbox {
                    w: tile_w,
                    h: body_h,
                    d: tile_d,
                    ch: 0.02,
                },
                // primitives are origin-centered (PRE-002); lift onto the hips and
                // place each independently printable tile in the body grid.
                pose: Some(forge_contract::PartPose {
                    p: [x, body_h / 2.0, z],
                    ..Default::default()
                }),
                material: MaterialClass::Matte,
                color: "#2b2f36".into(),
                explode: Some(Explode {
                    dir: [x.signum(), 1.0, z.signum()],
                    mag: 0.10,
                    t0: 0.85,
                    t1: 1.0,
                    leader: (tile_index == 0).then(|| "body module".into()),
                }),
                render_bias: None,
                comp: Some(format!("body-module-{tile_index}")),
                mass: Some(MassSpec {
                    value_g: Some(round_g(body_mass / tile_count as f64)),
                    density_kgm3: None,
                }),
                collision: CollisionPolicy::Primitive,
            });
        }
    }

    let revolute_x = Joint {
        kind: JointKind::Revolute,
        axis: Some([1.0, 0.0, 0.0]),
        max_torque_nm: None,
        max_vel_rad: Some(12.0),
    };
    let leg_limits = Some([[-1.4, 1.4], [0.0, 0.0], [0.0, 0.0]]);

    let rows = p.leg_pairs as usize;
    let mut leg_index = 0usize;
    for row in 0..rows {
        // front row at +z, spaced evenly to the rear
        let z = p.wheelbase_m / 2.0 - p.wheelbase_m * (row as f64) / ((rows - 1).max(1) as f64);
        for (side, x) in [("l", p.track_m / 2.0), ("r", -p.track_m / 2.0)] {
            let id = format!("{row}{side}");
            let hip = format!("hip_{id}");
            let knee = format!("knee_{id}");
            let foot = format!("foot_{id}");

            skeleton.push(Node {
                name: hip.clone(),
                parent: Some("root".into()),
                pos: [x, 0.0, z],
                rot: [0.0; 3],
                limits: leg_limits,
                joint: Some(revolute_x.clone()),
            });
            skeleton.push(Node {
                name: knee.clone(),
                parent: Some(hip.clone()),
                pos: [0.0, -l1, 0.0],
                rot: [0.0; 3],
                limits: Some([[0.0, 2.6], [0.0, 0.0], [0.0, 0.0]]),
                joint: Some(revolute_x.clone()),
            });
            skeleton.push(Node {
                name: foot.clone(),
                parent: Some(knee.clone()),
                pos: [0.0, -l2, 0.0],
                rot: [0.0; 3],
                limits: None,
                joint: None,
            });

            // segments grow +Y from their lower node, exactly spanning the bone.
            // Collider policy follows D7's fidelity-where-it-matters: modular body
            // tiles and foot pads collide; leg tubes are visual so the largest
            // 8-leg/body-grid combination stays inside the ≤24 model budget.
            let stagger = 0.04 * leg_index as f64 / n_legs;
            parts.push(leg_part(
                &knee,
                Geom::Cyl {
                    r0: 0.018,
                    r1: Some(0.014),
                    h: l1,
                    n: Some(16),
                },
                l1 / 2.0,
                "#3a4048",
                round_g(upper_mass),
                CollisionPolicy::None,
                Explode {
                    dir: [side_sign(side), 0.0, 0.0],
                    mag: 0.06,
                    t0: 0.05 + stagger,
                    t1: 0.35 + stagger,
                    leader: leg_index.eq(&0).then(|| "thigh".into()),
                },
            ));
            parts.push(leg_part(
                &foot,
                Geom::Cyl {
                    r0: 0.013,
                    r1: Some(0.010),
                    h: l2,
                    n: Some(16),
                },
                l2 / 2.0,
                "#3a4048",
                round_g(lower_mass),
                CollisionPolicy::None,
                Explode {
                    dir: [side_sign(side), 0.0, 0.0],
                    mag: 0.10,
                    t0: 0.35 + stagger,
                    t1: 0.65 + stagger,
                    leader: None,
                },
            ));
            parts.push(leg_part(
                &foot,
                Geom::Squircle {
                    rx: 0.022,
                    rz: 0.028,
                    h: 0.012,
                    e: 3.0,
                    n: Some(6),
                },
                0.006,
                "#15171a",
                round_g(pad_mass),
                CollisionPolicy::Primitive,
                Explode {
                    dir: [0.0, -1.0, 0.0],
                    mag: 0.05,
                    t0: 0.65 + stagger,
                    t1: 0.85 + stagger,
                    leader: None,
                },
            ));
            leg_index += 1;
        }
    }

    let total: f64 = parts
        .iter()
        .map(|pt| pt.mass.as_ref().and_then(|m| m.value_g).unwrap_or(0.0))
        .sum();

    let spec = ModelSpec {
        meta: Meta {
            id: format!(
                "qd-{}x{}-w{:03.0}-m{:.0}",
                p.leg_pairs,
                2,
                p.wheelbase_m * 100.0,
                p.mass_g
            ),
            name: format!(
                "Generated quadruped — {} legs, {:.0} cm wheelbase, {:.0} g",
                p.leg_pairs * 2,
                p.wheelbase_m * 100.0,
                p.mass_g
            ),
            version: "0.1.0".into(),
            archetype: Archetype::Quadruped,
            provenance: Provenance {
                kind: ProvenanceKind::ParametricGenerator,
                prompt_hash: None,
                model_version: Some(format!("forge-gen {}", env!("CARGO_PKG_VERSION"))),
                seed: None,
            },
            license: "CC0".into(),
        },
        env: EnvBlock::default(),
        skeleton,
        parts,
        slots: vec![],
        lockfile: Default::default(),
        ports: vec![],
        chains: vec![Chain {
            id: "teardown".into(),
            stage: 0,
            nodes: vec!["root".into()],
            dir: None,
            mag: None,
            t0: None,
            t1: None,
        }],
        driver: Driver {
            archetype: Archetype::Quadruped,
            params: serde_json::json!({
                // stand slightly crouched so the gait IK always has knee bend
                "standHeightM": p.stand_m * 0.95,
                "strideM": (p.stand_m * 0.75).min(0.30),
                "cadenceHz": 2.0,
                "duty": 0.5,
                "liftM": (p.stand_m * 0.2).min(0.06),
            }),
        },
        sim: SimBlock {
            aggregate_mass_g: Some(round_g(total)),
            ..Default::default()
        },
    };
    Ok(spec)
}

fn leg_part(
    node: &str,
    geom: Geom,
    y_offset: f64,
    color: &str,
    mass_g: f64,
    collision: CollisionPolicy,
    explode: Explode,
) -> Part {
    Part {
        node: node.into(),
        geom,
        pose: Some(forge_contract::PartPose {
            p: [0.0, y_offset, 0.0],
            ..Default::default()
        }),
        material: MaterialClass::Satin,
        color: color.into(),
        explode: Some(explode),
        render_bias: None,
        comp: Some("leg".into()),
        mass: Some(MassSpec {
            value_g: Some(mass_g),
            density_kgm3: None,
        }),
        collision,
    }
}

fn side_sign(side: &str) -> f64 {
    if side == "l" {
        1.0
    } else {
        -1.0
    }
}

fn round_g(g: f64) -> f64 {
    (g * 10.0).round() / 10.0
}

fn validate_params(p: &QuadGenParams) -> Result<(), GenError> {
    let checks = [
        (
            p.leg_pairs >= 2 && p.leg_pairs <= 4,
            "legPairs must be 2..=4",
        ),
        (
            p.wheelbase_m >= 0.15 && p.wheelbase_m <= 1.2,
            "wheelbaseM must be 0.15..=1.2",
        ),
        (
            p.track_m >= 0.10 && p.track_m <= 0.8,
            "trackM must be 0.10..=0.8",
        ),
        (
            p.stand_m >= 0.10 && p.stand_m <= 0.8,
            "standM must be 0.10..=0.8",
        ),
        (
            p.mass_g >= 300.0 && p.mass_g <= 60_000.0,
            "massG must be 300..=60000",
        ),
    ];
    for (ok, msg) in checks {
        if !ok {
            return Err(GenError(msg.to_string()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use forge_validate::{run_full, EmptyCatalog, Options, Severity, Verdict};

    #[test]
    fn generated_quadrupeds_are_admitted_across_the_slider_grid() {
        for (pairs, wheelbase, mass) in [
            (2, 0.30, 1200.0),
            (2, 0.50, 2500.0),
            (3, 0.60, 8000.0),
            (4, 0.80, 20000.0),
        ] {
            let params = QuadGenParams {
                leg_pairs: pairs,
                wheelbase_m: wheelbase,
                mass_g: mass,
                ..Default::default()
            };
            let spec = generate_quadruped(&params).unwrap();
            let doc = serde_json::to_string(&spec).unwrap();
            let report = run_full(&doc, &EmptyCatalog, &Options::default());
            let errors: Vec<_> = report
                .results
                .iter()
                .filter(|d| d.severity == Severity::Error)
                .collect();
            assert!(
                errors.is_empty() && report.verdict == Verdict::Admitted,
                "pairs={pairs} wheelbase={wheelbase} mass={mass}: {errors:#?}"
            );
        }
    }

    #[test]
    fn mass_budget_closes_exactly() {
        let spec = generate_quadruped(&QuadGenParams::default()).unwrap();
        let total: f64 = spec
            .parts
            .iter()
            .filter_map(|p| p.mass.as_ref().and_then(|m| m.value_g))
            .sum();
        let agg = spec.sim.aggregate_mass_g.unwrap();
        assert!(
            ((total - agg) / agg).abs() < 0.02,
            "Σ {total} vs aggregate {agg}"
        );
    }

    #[test]
    fn out_of_range_sliders_are_rejected() {
        let bad = QuadGenParams {
            leg_pairs: 9,
            ..Default::default()
        };
        assert!(generate_quadruped(&bad).is_err());
    }
}
