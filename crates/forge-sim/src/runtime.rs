//! Deterministic runtime seams for P6/P10.
//!
//! These are small, dependency-free contracts that higher-fidelity Rapier,
//! MuJoCo, course, and replay implementations plug into. They are executable
//! now and fixture-friendly in CI.

use forge_contract::ModelSpec;
use forge_geometry::BakedModel;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapierBody {
    pub node: String,
    pub mass_kg: f64,
    pub collider_count: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapierScene {
    pub body_count: usize,
    pub collider_count: u32,
    pub bodies: Vec<RapierBody>,
    pub auto_fit_policy: String,
}

pub fn compile_rapier_fixture(spec: &ModelSpec, baked: &BakedModel) -> RapierScene {
    let mut by_node: BTreeMap<String, RapierBody> = spec
        .skeleton
        .iter()
        .map(|node| {
            (
                node.name.clone(),
                RapierBody {
                    node: node.name.clone(),
                    mass_kg: 0.0,
                    collider_count: 0,
                },
            )
        })
        .collect();
    for baked_part in &baked.parts {
        let part = &spec.parts[baked_part.part_index];
        let entry = by_node.entry(part.node.clone()).or_insert(RapierBody {
            node: part.node.clone(),
            mass_kg: 0.0,
            collider_count: 0,
        });
        entry.mass_kg +=
            forge_geometry::part_mass_g(&part.mass, part.material, &baked_part.mesh) / 1000.0;
        if !matches!(part.collision, forge_contract::CollisionPolicy::None) {
            entry.collider_count += 1;
        }
    }
    let bodies: Vec<_> = by_node.into_values().collect();
    RapierScene {
        body_count: bodies.len(),
        collider_count: bodies.iter().map(|body| body.collider_count).sum(),
        bodies,
        auto_fit_policy: spec.sim.colliders.policy.clone(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SagEstimate {
    pub nominal_v: f64,
    pub sag_v: f64,
    pub effective_v: f64,
}

pub fn estimate_battery_sag(cells: u32, r_int_mohm: f64, current_a: f64) -> SagEstimate {
    let nominal_v = cells as f64 * crate::NOMINAL_CELL_V;
    let sag_v = (r_int_mohm / 1000.0) * current_a.max(0.0);
    SagEstimate {
        nominal_v,
        sag_v,
        effective_v: (nominal_v - sag_v).max(nominal_v * 0.5),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayFrame {
    pub t: f64,
    #[serde(default)]
    pub state: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayTape {
    pub schema_version: String,
    pub frames: Vec<ReplayFrame>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayVerification {
    pub verified: bool,
    pub frame_count: usize,
    pub tape_hash: String,
    pub reject_reason: Option<String>,
}

pub fn verify_replay(tape: &ReplayTape, expected_hash: Option<&str>) -> ReplayVerification {
    let tape_hash = fnv1a_hex(&serde_json::to_string(tape).expect("replay tape serializes"));
    let monotonic = tape.frames.windows(2).all(|pair| pair[0].t < pair[1].t);
    let hash_ok = expected_hash
        .map(|expected| expected == tape_hash)
        .unwrap_or(true);
    let reject_reason = if tape.frames.is_empty() {
        Some("replay has no frames".to_string())
    } else if !monotonic {
        Some("replay timestamps are not strictly increasing".to_string())
    } else if !hash_ok {
        Some("replay hash mismatch".to_string())
    } else {
        None
    };
    ReplayVerification {
        verified: reject_reason.is_none(),
        frame_count: tape.frames.len(),
        tape_hash,
        reject_reason,
    }
}

fn fnv1a_hex(text: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvObstacle {
    pub id: String,
    pub center_m: [f64; 3],
    pub size_m: [f64; 3],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvTerrain {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_m: Option<[f64; 2]>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvPose {
    pub p: [f64; 3],
    #[serde(default)]
    pub r: [f64; 3],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvGate {
    pub id: String,
    pub pose: EnvPose,
    pub width_m: f64,
    pub height_m: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvSpawn {
    pub id: String,
    pub pose: EnvPose,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub archetype_filter: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvWin {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub gate_order: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_limit_s: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contact_penalties: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvSpec {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub bounds_m: [f64; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terrain: Option<EnvTerrain>,
    #[serde(default)]
    pub tasks: Vec<String>,
    #[serde(default)]
    pub obstacles: Vec<EnvObstacle>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub gates: Vec<EnvGate>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spawns: Vec<EnvSpawn>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub win: Option<EnvWin>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub env: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvDiagnostic {
    pub check: String,
    pub severity: String,
    pub message: String,
}

pub fn validate_envspec(env: &EnvSpec) -> Vec<EnvDiagnostic> {
    let mut diagnostics = Vec::new();
    if env.id.trim().is_empty() || env.name.trim().is_empty() {
        diagnostics.push(diag("ENV-001", "error", "EnvSpec id/name are required"));
    }
    if env
        .bounds_m
        .iter()
        .any(|value| !value.is_finite() || *value <= 0.0)
    {
        diagnostics.push(diag(
            "ENV-002",
            "error",
            "bounds_m must be positive finite meters",
        ));
    }
    if env.tasks.is_empty() {
        diagnostics.push(diag(
            "ENV-003",
            "error",
            "at least one task adapter is required",
        ));
    }
    if env.spawns.is_empty() {
        diagnostics.push(diag("ENV-001", "error", "at least one spawn is required"));
    }
    for spawn in &env.spawns {
        if !inside_bounds(spawn.pose.p, env.bounds_m) {
            diagnostics.push(diag(
                "ENV-001",
                "error",
                format!("spawn '{}' is outside bounds_m", spawn.id),
            ));
        }
    }
    for obstacle in &env.obstacles {
        if obstacle
            .size_m
            .iter()
            .any(|value| !value.is_finite() || *value <= 0.0)
        {
            diagnostics.push(diag(
                "ENV-004",
                "error",
                format!("obstacle '{}' has invalid size_m", obstacle.id),
            ));
        }
        if !inside_bounds(obstacle.center_m, env.bounds_m) {
            diagnostics.push(diag(
                "ENV-004",
                "error",
                format!("obstacle '{}' is outside bounds_m", obstacle.id),
            ));
        }
    }
    for gate in &env.gates {
        if gate.id.trim().is_empty() || gate.width_m <= 0.0 || gate.height_m <= 0.0 {
            diagnostics.push(diag(
                "ENV-004",
                "error",
                format!("gate '{}' has invalid dimensions", gate.id),
            ));
        }
        if !inside_bounds(gate.pose.p, env.bounds_m) {
            diagnostics.push(diag(
                "ENV-002",
                "error",
                format!("gate '{}' is outside bounds_m", gate.id),
            ));
        }
    }
    if let Some(win) = &env.win {
        if win
            .time_limit_s
            .is_some_and(|value| !value.is_finite() || value <= 0.0)
        {
            diagnostics.push(diag(
                "ENV-003",
                "error",
                "win.time_limit_s must be positive finite seconds",
            ));
        }
        for gate_id in &win.gate_order {
            if !env.gates.iter().any(|gate| &gate.id == gate_id) {
                diagnostics.push(diag(
                    "ENV-002",
                    "error",
                    format!("win gate_order references missing gate '{}'", gate_id),
                ));
            }
        }
    }
    diagnostics
}

fn inside_bounds(p: [f64; 3], bounds: [f64; 3]) -> bool {
    p.iter()
        .zip(bounds)
        .all(|(coord, bound)| coord.is_finite() && coord.abs() <= bound / 2.0)
}

fn diag(check: &str, severity: &str, message: impl Into<String>) -> EnvDiagnostic {
    EnvDiagnostic {
        check: check.to_string(),
        severity: severity.to_string(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sag_is_clamped_to_half_nominal() {
        let sag = estimate_battery_sag(4, 500.0, 100.0);
        assert_eq!(sag.nominal_v, 14.8);
        assert_eq!(sag.effective_v, 7.4);
    }

    #[test]
    fn replay_verification_rejects_tamper_and_time_regressions() {
        let tape = ReplayTape {
            schema_version: "replay.v1".to_string(),
            frames: vec![
                ReplayFrame {
                    t: 0.0,
                    state: serde_json::json!({"x": 0}),
                },
                ReplayFrame {
                    t: 0.1,
                    state: serde_json::json!({"x": 1}),
                },
            ],
        };
        let ok = verify_replay(&tape, None);
        assert!(ok.verified);
        assert!(!verify_replay(&tape, Some("bad")).verified);

        let bad_time = ReplayTape {
            frames: vec![
                ReplayFrame {
                    t: 1.0,
                    state: serde_json::json!({}),
                },
                ReplayFrame {
                    t: 0.5,
                    state: serde_json::json!({}),
                },
            ],
            ..tape
        };
        assert_eq!(
            verify_replay(&bad_time, None).reject_reason.as_deref(),
            Some("replay timestamps are not strictly increasing")
        );
    }

    #[test]
    fn envspec_gate_reports_missing_tasks() {
        let env = EnvSpec {
            id: "course-a".to_string(),
            name: "Course A".to_string(),
            kind: "slalom".to_string(),
            bounds_m: [10.0, 3.0, 10.0],
            tasks: vec![],
            obstacles: vec![],
            terrain: None,
            gates: vec![],
            spawns: vec![EnvSpawn {
                id: "start".to_string(),
                pose: EnvPose {
                    p: [0.0, 0.0, 0.0],
                    r: [0.0; 3],
                },
                archetype_filter: vec!["multirotor".to_string()],
            }],
            win: None,
            env: None,
        };
        let diagnostics = validate_envspec(&env);
        assert!(diagnostics.iter().any(|diag| diag.check == "ENV-003"));
    }

    #[test]
    fn envspec_gate_accepts_gates_spawns_and_win_condition() {
        let env = EnvSpec {
            id: "course-b".to_string(),
            name: "Course B".to_string(),
            kind: "slalom".to_string(),
            bounds_m: [20.0, 6.0, 20.0],
            terrain: Some(EnvTerrain {
                kind: "flat".to_string(),
                size_m: Some([20.0, 20.0]),
            }),
            tasks: vec!["gate-slalom".to_string()],
            obstacles: vec![EnvObstacle {
                id: "block-a".to_string(),
                center_m: [2.0, 0.5, 0.0],
                size_m: [0.5, 1.0, 0.5],
            }],
            gates: vec![EnvGate {
                id: "g1".to_string(),
                pose: EnvPose {
                    p: [4.0, 1.0, 0.0],
                    r: [0.0; 3],
                },
                width_m: 1.2,
                height_m: 0.8,
            }],
            spawns: vec![EnvSpawn {
                id: "start".to_string(),
                pose: EnvPose {
                    p: [0.0, 0.0, 0.0],
                    r: [0.0; 3],
                },
                archetype_filter: vec!["multirotor".to_string()],
            }],
            win: Some(EnvWin {
                gate_order: vec!["g1".to_string()],
                time_limit_s: Some(30.0),
                contact_penalties: Some(true),
            }),
            env: None,
        };
        assert!(validate_envspec(&env).is_empty());
    }
}
