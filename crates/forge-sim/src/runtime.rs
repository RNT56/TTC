//! Deterministic runtime seams for P6/P10.
//!
//! These are small, dependency-free contracts that higher-fidelity Rapier,
//! MuJoCo, course, and replay implementations plug into. They are executable
//! now and fixture-friendly in CI.

use forge_contract::ModelSpec;
use forge_geometry::BakedModel;
use serde::{Deserialize, Serialize};

/// Serialized replay-tape contract. `replay.v1` remains a read-only legacy
/// alias during the documented deprecation window.
pub const REPLAY_FORMAT_VERSION: &str = "1.0.0";
pub const LEGACY_REPLAY_FORMAT_VERSION: &str = "replay.v1";
/// EnvSpec schema contract. `EnvSpec.version` is the document revision and is
/// intentionally separate from this format version.
pub const ENVSPEC_SCHEMA_VERSION: &str = "1.0.0";
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
pub struct RapierJoint {
    pub node: String,
    pub parent: String,
    pub kind: String,
    pub axis: Option<[f64; 3]>,
    pub limits: Option<[[f64; 2]; 3]>,
    pub max_torque_nm: Option<f64>,
    pub max_vel_rad: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapierMotor {
    pub mount: String,
    pub spin_dir: i8,
    pub kv: Option<f64>,
    pub r_int_mohm: Option<f64>,
    pub max_current_a: Option<f64>,
    pub component_ref: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapierScene {
    pub body_count: usize,
    pub collider_count: u32,
    pub joint_count: usize,
    pub motor_count: usize,
    pub bodies: Vec<RapierBody>,
    pub joints: Vec<RapierJoint>,
    pub motors: Vec<RapierMotor>,
    pub auto_fit_policy: String,
}

pub fn compile_rapier_fixture(spec: &ModelSpec, baked: &BakedModel) -> RapierScene {
    let physical_parts = spec.physical_parts_with_paths();
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
        let part = physical_parts[baked_part.part_index].1;
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
    let joints = compile_rapier_joints(spec);
    let motors = compile_rapier_motors(spec);
    RapierScene {
        body_count: bodies.len(),
        collider_count: bodies.iter().map(|body| body.collider_count).sum(),
        joint_count: joints.len(),
        motor_count: motors.len(),
        bodies,
        joints,
        motors,
        auto_fit_policy: spec.sim.colliders.policy.clone(),
    }
}

fn compile_rapier_joints(spec: &ModelSpec) -> Vec<RapierJoint> {
    spec.skeleton
        .iter()
        .filter_map(|node| {
            let joint = node.joint.as_ref()?;
            let parent = node.parent.as_ref()?;
            Some(RapierJoint {
                node: node.name.clone(),
                parent: parent.clone(),
                kind: match joint.kind {
                    forge_contract::JointKind::Fixed => "fixed",
                    forge_contract::JointKind::Revolute => "revolute",
                    forge_contract::JointKind::Spherical => "spherical",
                }
                .to_string(),
                axis: joint.axis,
                limits: node.limits,
                max_torque_nm: joint.max_torque_nm,
                max_vel_rad: joint.max_vel_rad,
            })
        })
        .collect()
}

fn compile_rapier_motors(spec: &ModelSpec) -> Vec<RapierMotor> {
    spec.sim
        .motors
        .iter()
        .enumerate()
        .map(|(index, motor)| RapierMotor {
            mount: motor.mount.clone(),
            spin_dir: motor
                .dir
                .unwrap_or(if index % 2 == 0 { 1 } else { -1 })
                .clamp(-1, 1),
            kv: motor.kv,
            r_int_mohm: motor.r_int_mohm,
            max_current_a: motor.max_current_a,
            component_ref: motor.component_ref.clone(),
        })
        .collect()
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
    let sag_v = (r_int_mohm.max(0.0) / 1000.0) * current_a.max(0.0);
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
    let format_supported = same_semver_major(&tape.schema_version, REPLAY_FORMAT_VERSION)
        || tape.schema_version == LEGACY_REPLAY_FORMAT_VERSION;
    let reject_reason = if !format_supported {
        Some(format!(
            "unsupported replay schema version '{}' (supported major: 1, current: {}, legacy: {})",
            tape.schema_version, REPLAY_FORMAT_VERSION, LEGACY_REPLAY_FORMAT_VERSION
        ))
    } else if tape.frames.is_empty() {
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
    #[serde(default = "default_envspec_schema_version")]
    pub schema_version: String,
    #[serde(default = "default_envspec_version")]
    pub version: String,
    pub kind: String,
    pub bounds_m: [f64; 3],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<serde_json::Value>,
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
    if !same_semver_major(&env.schema_version, ENVSPEC_SCHEMA_VERSION) {
        diagnostics.push(diag(
            "ENV-000",
            "error",
            format!(
                "unsupported EnvSpec schema version '{}' (supported major: 1)",
                env.schema_version
            ),
        ));
    }
    if env.id.trim().is_empty() || env.name.trim().is_empty() {
        diagnostics.push(diag("ENV-001", "error", "EnvSpec id/name are required"));
    }
    if !valid_semver(&env.version) {
        diagnostics.push(diag(
            "ENV-001",
            "error",
            "EnvSpec version must be semantic major.minor.patch",
        ));
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
    for gate in reachable_goal_gates(env) {
        if !env
            .spawns
            .iter()
            .any(|spawn| spawn_can_reach_gate(spawn, gate, &env.obstacles))
        {
            diagnostics.push(diag(
                "ENV-002",
                "error",
                format!("no reachable spawn-to-gate path for '{}'", gate.id),
            ));
        }
    }
    diagnostics
}

fn inside_bounds(p: [f64; 3], bounds: [f64; 3]) -> bool {
    p.iter()
        .zip(bounds)
        .all(|(coord, bound)| coord.is_finite() && coord.abs() <= bound / 2.0)
}

fn default_envspec_version() -> String {
    "0.1.0".to_string()
}

fn default_envspec_schema_version() -> String {
    ENVSPEC_SCHEMA_VERSION.to_string()
}

fn same_semver_major(value: &str, expected: &str) -> bool {
    valid_semver(value) && value.split('.').next() == expected.split('.').next()
}

fn valid_semver(value: &str) -> bool {
    let mut parts = value.split('.');
    let Some(major) = parts.next() else {
        return false;
    };
    let Some(minor) = parts.next() else {
        return false;
    };
    let Some(patch) = parts.next() else {
        return false;
    };
    parts.next().is_none()
        && [major, minor, patch]
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit()))
}

fn reachable_goal_gates(env: &EnvSpec) -> Vec<&EnvGate> {
    if let Some(win) = &env.win {
        if !win.gate_order.is_empty() {
            return win
                .gate_order
                .iter()
                .filter_map(|id| env.gates.iter().find(|gate| &gate.id == id))
                .collect();
        }
    }
    env.gates.iter().collect()
}

fn ground_archetype(spawn: &EnvSpawn) -> bool {
    spawn.archetype_filter.iter().any(|filter| {
        let filter = filter.to_ascii_lowercase();
        filter.contains("rover")
            || filter.contains("legged")
            || filter.contains("quadruped")
            || filter.contains("biped")
            || filter.contains("wheeled")
            || filter.contains("ground")
    })
}

fn spawn_can_reach_gate(spawn: &EnvSpawn, gate: &EnvGate, obstacles: &[EnvObstacle]) -> bool {
    if !ground_archetype(spawn) {
        return true;
    }
    !obstacles
        .iter()
        .any(|obstacle| segment_intersects_obstacle_xz(spawn.pose.p, gate.pose.p, obstacle))
}

fn segment_intersects_obstacle_xz(a: [f64; 3], b: [f64; 3], obstacle: &EnvObstacle) -> bool {
    if obstacle
        .size_m
        .iter()
        .any(|value| !value.is_finite() || *value <= 0.0)
    {
        return false;
    }
    let min_x = obstacle.center_m[0] - obstacle.size_m[0] / 2.0;
    let max_x = obstacle.center_m[0] + obstacle.size_m[0] / 2.0;
    let min_z = obstacle.center_m[2] - obstacle.size_m[2] / 2.0;
    let max_z = obstacle.center_m[2] + obstacle.size_m[2] / 2.0;
    let dx = b[0] - a[0];
    let dz = b[2] - a[2];
    let mut t0 = 0.0;
    let mut t1 = 1.0;
    clip_segment_axis(a[0], dx, min_x, max_x, &mut t0, &mut t1)
        && clip_segment_axis(a[2], dz, min_z, max_z, &mut t0, &mut t1)
        && t0 <= t1
}

fn clip_segment_axis(
    origin: f64,
    delta: f64,
    min: f64,
    max: f64,
    t0: &mut f64,
    t1: &mut f64,
) -> bool {
    if delta.abs() < 1e-12 {
        return origin >= min && origin <= max;
    }
    let inv = 1.0 / delta;
    let mut near = (min - origin) * inv;
    let mut far = (max - origin) * inv;
    if near > far {
        std::mem::swap(&mut near, &mut far);
    }
    *t0 = (*t0).max(near);
    *t1 = (*t1).min(far);
    *t0 <= *t1
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

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-9,
            "expected {actual} to be within tolerance of {expected}"
        );
    }

    #[test]
    fn rapier_fixture_carries_bodies_joints_limits_and_motors() {
        let doc = serde_json::json!({
          "meta":{"id":"rapier-fixture","name":"rapier-fixture","version":"2.1.0","archetype":"arm",
                  "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[
            {"name":"root","parent":null,"pos":[0,0,0]},
            {"name":"arm","parent":"root","pos":[0,0.1,0],
             "joint":{"type":"revolute","axis":[1,0,0],"maxTorqueNm":0.8,"maxVelRad":6.0},
             "limits":[[-1.0,1.0],[0,0],[0,0]]}
          ],
          "parts":[
            {"node":"root","geom":{"kind":"box","w":0.08,"h":0.04,"d":0.08},
             "material":"matte","color":"#333333","collision":"primitive","mass":{"valueG":120}},
            {"node":"arm","geom":{"kind":"box","w":0.04,"h":0.04,"d":0.22},
             "material":"matte","color":"#555555","collision":"primitive","mass":{"valueG":80}}
          ],
          "driver":{"archetype":"arm","params":{"targetM":[0,-0.05,0.18]}},
          "sim":{"motors":[{"mount":"arm","kv":900,"r_int_mohm":80,"maxCurrentA":2.5,"dir":-1}]}
        });
        let spec = forge_contract::validate_shape(&doc.to_string()).unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let scene = compile_rapier_fixture(&spec, &baked);

        assert_eq!(scene.body_count, 2);
        assert_eq!(scene.collider_count, 2);
        assert_eq!(scene.joint_count, 1);
        assert_eq!(scene.motor_count, 1);
        assert_eq!(
            scene
                .bodies
                .iter()
                .find(|b| b.node == "arm")
                .unwrap()
                .collider_count,
            1
        );
        assert_close(
            scene.bodies.iter().map(|body| body.mass_kg).sum::<f64>(),
            0.2,
        );

        let joint = &scene.joints[0];
        assert_eq!(joint.node, "arm");
        assert_eq!(joint.parent, "root");
        assert_eq!(joint.kind, "revolute");
        assert_eq!(joint.axis, Some([1.0, 0.0, 0.0]));
        assert_eq!(joint.limits.unwrap()[0], [-1.0, 1.0]);
        assert_eq!(joint.max_torque_nm, Some(0.8));
        assert_eq!(joint.max_vel_rad, Some(6.0));

        let motor = &scene.motors[0];
        assert_eq!(motor.mount, "arm");
        assert_eq!(motor.spin_dir, -1);
        assert_eq!(motor.kv, Some(900.0));
        assert_eq!(motor.r_int_mohm, Some(80.0));
        assert_eq!(motor.max_current_a, Some(2.5));
    }

    #[test]
    fn sag_matches_ohms_law_bench_math() {
        let sag = estimate_battery_sag(6, 18.0, 42.0);
        assert_close(sag.nominal_v, 22.2);
        assert_close(sag.sag_v, 0.756);
        assert_close(sag.effective_v, 21.444);
    }

    #[test]
    fn sag_is_clamped_to_half_nominal() {
        let sag = estimate_battery_sag(4, 500.0, 100.0);
        assert_eq!(sag.nominal_v, 14.8);
        assert_eq!(sag.sag_v, 50.0);
        assert_eq!(sag.effective_v, 7.4);
    }

    #[test]
    fn sag_does_not_turn_bad_inputs_into_voltage_gain() {
        let negative_current = estimate_battery_sag(4, 18.0, -10.0);
        assert_close(negative_current.sag_v, 0.0);
        assert_close(negative_current.effective_v, negative_current.nominal_v);

        let negative_resistance = estimate_battery_sag(4, -18.0, 10.0);
        assert_close(negative_resistance.sag_v, 0.0);
        assert_close(
            negative_resistance.effective_v,
            negative_resistance.nominal_v,
        );
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

        let unsupported = ReplayTape {
            schema_version: "2.0.0".to_string(),
            frames: vec![ReplayFrame {
                t: 0.0,
                state: serde_json::Value::Null,
            }],
        };
        let verification = verify_replay(&unsupported, None);
        assert!(!verification.verified);
        assert!(verification
            .reject_reason
            .as_deref()
            .is_some_and(|reason| reason.contains("unsupported replay schema version")));
    }

    #[test]
    fn envspec_gate_reports_missing_tasks() {
        let env = EnvSpec {
            id: "course-a".to_string(),
            name: "Course A".to_string(),
            schema_version: ENVSPEC_SCHEMA_VERSION.to_string(),
            version: "1.0.0".to_string(),
            kind: "slalom".to_string(),
            bounds_m: [10.0, 3.0, 10.0],
            provenance: None,
            license: None,
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

        let bad_version = EnvSpec {
            version: "draft".to_string(),
            ..env
        };
        let diagnostics = validate_envspec(&bad_version);
        assert!(diagnostics
            .iter()
            .any(|diag| { diag.check == "ENV-001" && diag.message.contains("semantic") }));

        let bad_schema = EnvSpec {
            schema_version: "2.0.0".to_string(),
            ..bad_version
        };
        let diagnostics = validate_envspec(&bad_schema);
        assert!(diagnostics
            .iter()
            .any(|diag| diag.check == "ENV-000" && diag.message.contains("unsupported")));
    }

    #[test]
    fn envspec_gate_accepts_gates_spawns_and_win_condition() {
        let env = EnvSpec {
            id: "course-b".to_string(),
            name: "Course B".to_string(),
            schema_version: ENVSPEC_SCHEMA_VERSION.to_string(),
            version: "1.0.0".to_string(),
            kind: "slalom".to_string(),
            bounds_m: [20.0, 6.0, 20.0],
            provenance: Some(serde_json::json!({"kind": "fixture"})),
            license: Some(serde_json::json!({"id": "CC0-1.0"})),
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

    #[test]
    fn envspec_gate_rejects_blocked_ground_spawn_to_gate() {
        let env = EnvSpec {
            id: "course-c".to_string(),
            name: "Course C".to_string(),
            schema_version: ENVSPEC_SCHEMA_VERSION.to_string(),
            version: "1.0.0".to_string(),
            kind: "rover".to_string(),
            bounds_m: [12.0, 4.0, 6.0],
            provenance: None,
            license: None,
            terrain: Some(EnvTerrain {
                kind: "flat".to_string(),
                size_m: Some([12.0, 6.0]),
            }),
            tasks: vec!["line-follow".to_string()],
            obstacles: vec![EnvObstacle {
                id: "wall".to_string(),
                center_m: [0.0, 0.5, 0.0],
                size_m: [1.5, 1.0, 4.0],
            }],
            gates: vec![EnvGate {
                id: "finish".to_string(),
                pose: EnvPose {
                    p: [4.0, 0.5, 0.0],
                    r: [0.0; 3],
                },
                width_m: 1.0,
                height_m: 0.8,
            }],
            spawns: vec![EnvSpawn {
                id: "start".to_string(),
                pose: EnvPose {
                    p: [-4.0, 0.0, 0.0],
                    r: [0.0; 3],
                },
                archetype_filter: vec!["rover".to_string()],
            }],
            win: Some(EnvWin {
                gate_order: vec!["finish".to_string()],
                time_limit_s: Some(45.0),
                contact_penalties: Some(true),
            }),
            env: None,
        };
        let diagnostics = validate_envspec(&env);
        assert!(diagnostics.iter().any(|diag| {
            diag.check == "ENV-002" && diag.message.contains("no reachable spawn-to-gate path")
        }));
    }
}
