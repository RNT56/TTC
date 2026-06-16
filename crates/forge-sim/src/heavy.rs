//! Deterministic heavy-path seams for P6-P12.
//!
//! These utilities are deliberately dependency-light. They make the high-cost
//! paths executable in local/CI runs while live Rapier, MuJoCo, SB3, COLMAP,
//! bridge hardware, and marketplace services stay behind adapters.

use crate::runtime::{EnvSpec, ReplayTape, ReplayVerification};
use crate::{NoiseLcg, PowertrainPoint, ReplayHeader};
use forge_contract::{CollisionPolicy, ModelSpec};
use forge_geometry::{BakedModel, MeshBuffers};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColliderPrimitive {
    pub node: String,
    pub part_index: usize,
    pub kind: String,
    pub center_m: [f64; 3],
    pub half_extents_m: [f64; 3],
    pub radius_m: Option<f64>,
    pub height_m: Option<f64>,
    pub volume_m3: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColliderFitReport {
    pub collider_count: usize,
    pub per_node: BTreeMap<String, usize>,
    pub primitives: Vec<ColliderPrimitive>,
    pub overflow_nodes: Vec<String>,
    pub policy: String,
}

pub fn fit_compound_colliders(spec: &ModelSpec, baked: &BakedModel) -> ColliderFitReport {
    let per_node_budget = spec.sim.colliders.budget.per_node as usize;
    let mut by_node: BTreeMap<String, Vec<ColliderPrimitive>> = BTreeMap::new();
    for baked_part in &baked.parts {
        let part = &spec.parts[baked_part.part_index];
        if matches!(part.collision, CollisionPolicy::None) {
            continue;
        }
        let Some(mut primitive) = primitive_from_mesh(
            &baked_part.node,
            baked_part.part_index,
            part.collision,
            &baked_part.mesh,
        ) else {
            continue;
        };
        if matches!(part.collision, CollisionPolicy::Hull) {
            primitive.kind = "convex-hull".to_string();
        }
        by_node
            .entry(baked_part.node.clone())
            .or_default()
            .push(primitive);
    }

    let mut primitives = Vec::new();
    let mut per_node = BTreeMap::new();
    let mut overflow_nodes = Vec::new();
    for (node, mut node_primitives) in by_node {
        node_primitives.sort_by(|a, b| {
            b.volume_m3
                .partial_cmp(&a.volume_m3)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.part_index.cmp(&b.part_index))
        });
        if node_primitives.len() > per_node_budget {
            overflow_nodes.push(node.clone());
            node_primitives.truncate(per_node_budget);
        }
        per_node.insert(node, node_primitives.len());
        primitives.extend(node_primitives);
    }
    primitives.sort_by(|a, b| {
        a.node
            .cmp(&b.node)
            .then_with(|| a.part_index.cmp(&b.part_index))
    });
    ColliderFitReport {
        collider_count: primitives.len(),
        per_node,
        primitives,
        overflow_nodes,
        policy: spec.sim.colliders.policy.clone(),
    }
}

fn primitive_from_mesh(
    node: &str,
    part_index: usize,
    policy: CollisionPolicy,
    mesh: &MeshBuffers,
) -> Option<ColliderPrimitive> {
    if mesh.positions.len() < 3 {
        return None;
    }
    let mut min = [f64::INFINITY; 3];
    let mut max = [f64::NEG_INFINITY; 3];
    for p in mesh.positions.chunks_exact(3) {
        for axis in 0..3 {
            let value = f64::from(p[axis]);
            min[axis] = min[axis].min(value);
            max[axis] = max[axis].max(value);
        }
    }
    let center = [
        0.5 * (min[0] + max[0]),
        0.5 * (min[1] + max[1]),
        0.5 * (min[2] + max[2]),
    ];
    let half = [
        0.5 * (max[0] - min[0]).max(1e-6),
        0.5 * (max[1] - min[1]).max(1e-6),
        0.5 * (max[2] - min[2]).max(1e-6),
    ];
    let volume = 8.0 * half[0] * half[1] * half[2];
    let xz_round = (half[0] - half[2]).abs() <= 0.08 * half[0].max(half[2]).max(1e-6);
    let kind = if matches!(policy, CollisionPolicy::Primitive | CollisionPolicy::Auto) && xz_round {
        "cylinder"
    } else {
        "box"
    };
    Some(ColliderPrimitive {
        node: node.to_string(),
        part_index,
        kind: kind.to_string(),
        center_m: center,
        half_extents_m: half,
        radius_m: (kind == "cylinder").then_some(half[0].max(half[2])),
        height_m: (kind == "cylinder").then_some(2.0 * half[1]),
        volume_m3: volume,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BladeElementInput {
    pub kv: f64,
    pub voltage_v: f64,
    pub throttle: f64,
    pub prop_diameter_m: f64,
    pub air_density: f64,
    pub ct: f64,
    pub cq: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BladeElementEstimate {
    pub point: PowertrainPoint,
    pub torque_nm: f64,
    pub shaft_power_w: f64,
}

pub fn blade_element_lite(input: BladeElementInput) -> BladeElementEstimate {
    let throttle = input.throttle.clamp(0.0, 1.0);
    let n_rev_s = (input.kv * input.voltage_v * throttle / 60.0).max(0.0);
    let thrust_n = input.ct * input.air_density * n_rev_s.powi(2) * input.prop_diameter_m.powi(4);
    let torque_nm = input.cq * input.air_density * n_rev_s.powi(2) * input.prop_diameter_m.powi(5);
    let shaft_power_w = torque_nm * 2.0 * std::f64::consts::PI * n_rev_s;
    BladeElementEstimate {
        point: PowertrainPoint {
            thrust_n,
            current_a: if input.voltage_v > 1e-9 {
                shaft_power_w / input.voltage_v
            } else {
                0.0
            },
            v_eff: input.voltage_v,
            n_rev_s,
        },
        torque_nm,
        shaft_power_w,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisturbanceProfile {
    pub wind_mean_mps: f64,
    pub gust_mps: f64,
    pub payload_shift_m: [f64; 3],
    pub sensor_dropout_pct: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DisturbanceSample {
    pub wind_mps: [f64; 3],
    pub payload_shift_m: [f64; 3],
    pub sensor_available: bool,
}

pub fn sample_disturbance(profile: DisturbanceProfile, seed: u64, step: u64) -> DisturbanceSample {
    let mut noise = NoiseLcg::new(seed ^ step.wrapping_mul(0x9e37_79b9_7f4a_7c15));
    let gust = profile.gust_mps.max(0.0);
    let wind = [
        profile.wind_mean_mps + gust * 0.35 * noise.next_normal(),
        gust * 0.12 * noise.next_normal(),
        gust * 0.35 * noise.next_normal(),
    ];
    let dropout = profile.sensor_dropout_pct.clamp(0.0, 100.0) / 100.0;
    DisturbanceSample {
        wind_mps: wind,
        payload_shift_m: profile.payload_shift_m,
        sensor_available: noise.next_unit() >= dropout,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayEnvelope {
    pub header: ReplayHeader,
    pub tape: ReplayTape,
}

pub fn verify_replay_envelope(
    envelope: &ReplayEnvelope,
    expected_contract_hash: Option<&str>,
) -> ReplayVerification {
    if let Some(expected) = expected_contract_hash {
        if envelope.header.contract_hash != expected {
            return ReplayVerification {
                verified: false,
                frame_count: envelope.tape.frames.len(),
                tape_hash: String::new(),
                reject_reason: Some("contract hash mismatch".to_string()),
            };
        }
    }
    crate::runtime::verify_replay(&envelope.tape, None)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TaskKind {
    HoverHold,
    WaypointChain,
    GateSlalom,
    VelocityTracking,
    WalkToTarget,
    RoughTerrain,
    PushRecovery,
    LineFollow,
    ObstacleCourse,
    ReachTrack,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSpec {
    pub id: String,
    pub kind: TaskKind,
    pub env_id: String,
    pub horizon_s: f64,
    pub success_threshold: f64,
    pub curriculum_stage: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObsActionSpec {
    pub observations: Vec<String>,
    pub actions: Vec<String>,
    pub onnx_header: BTreeMap<String, String>,
}

pub fn course_to_task(env: &EnvSpec, archetype: &str) -> TaskSpec {
    let kind = if env.tasks.iter().any(|task| task.contains("gate")) {
        TaskKind::GateSlalom
    } else if archetype == "quadruped" || archetype == "biped" {
        TaskKind::WalkToTarget
    } else if archetype == "arm" {
        TaskKind::ReachTrack
    } else {
        TaskKind::WaypointChain
    };
    TaskSpec {
        id: format!("task_{}_{}", env.id, archetype),
        kind,
        env_id: env.id.clone(),
        horizon_s: 60.0,
        success_threshold: 0.8,
        curriculum_stage: 1,
    }
}

pub fn derive_obs_action(spec: &ModelSpec, task: &TaskSpec) -> ObsActionSpec {
    let mut observations = vec![
        "estimator.attitude".to_string(),
        "estimator.angularRate".to_string(),
        "target.error".to_string(),
        "battery.normalizedVoltage".to_string(),
    ];
    if !spec.sim.motors.is_empty() {
        observations.push("powertrain.motorCurrent".to_string());
    }
    let actions = match spec.meta.archetype {
        forge_contract::Archetype::Multirotor | forge_contract::Archetype::Fixedwing => {
            vec![
                "throttle".to_string(),
                "roll".to_string(),
                "pitch".to_string(),
                "yaw".to_string(),
            ]
        }
        forge_contract::Archetype::Rover => vec!["speed".to_string(), "turnRate".to_string()],
        forge_contract::Archetype::Arm => vec!["jointTargets".to_string()],
        forge_contract::Archetype::Quadruped | forge_contract::Archetype::Biped => {
            vec!["gaitPhase".to_string(), "bodyVelocity".to_string()]
        }
    };
    let mut onnx_header = BTreeMap::new();
    onnx_header.insert("taskId".to_string(), task.id.clone());
    onnx_header.insert(
        "archetype".to_string(),
        format!("{:?}", spec.meta.archetype).to_lowercase(),
    );
    onnx_header.insert(
        "observationCount".to_string(),
        observations.len().to_string(),
    );
    onnx_header.insert("actionCount".to_string(), actions.len().to_string());
    ObsActionSpec {
        observations,
        actions,
        onnx_header,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MjxBenchmark {
    pub cpu_mujoco_steps_per_s: f64,
    pub mjx_steps_per_s: f64,
    pub cpu_overnight_target_hit: bool,
    pub tier2_budget_miss_pct: f64,
    pub parity_passed: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MjxAdoptionDecision {
    pub adopt: bool,
    pub speedup: f64,
    pub reasons: Vec<String>,
}

pub fn evaluate_mjx_adoption(benchmark: MjxBenchmark) -> MjxAdoptionDecision {
    let speedup = if benchmark.cpu_mujoco_steps_per_s > 0.0 {
        benchmark.mjx_steps_per_s / benchmark.cpu_mujoco_steps_per_s
    } else {
        f64::INFINITY
    };
    let mut reasons = Vec::new();
    let cpu_needs_help =
        !benchmark.cpu_overnight_target_hit || benchmark.tier2_budget_miss_pct > 25.0;
    if !cpu_needs_help {
        reasons.push("CPU MuJoCo/SB3 already meets overnight and tier-2 budgets".to_string());
    }
    if speedup < 3.0 {
        reasons.push(format!("MJX speedup {:.2}x is below 3x threshold", speedup));
    }
    if !benchmark.parity_passed {
        reasons.push("MJX parity is outside frozen tolerance bands".to_string());
    }
    MjxAdoptionDecision {
        adopt: reasons.is_empty(),
        speedup,
        reasons,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetySupervisorConfig {
    pub geofence_radius_m: f64,
    pub max_attitude_rad: f64,
    pub max_rate_rad_s: f64,
    pub min_battery_v: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupervisorInput {
    pub position_m: [f64; 3],
    pub attitude_rad: [f64; 3],
    pub rate_rad_s: [f64; 3],
    pub battery_v: f64,
    pub kill_switch: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupervisorDecision {
    pub allow_policy: bool,
    pub command: String,
    pub reasons: Vec<String>,
}

pub fn supervisor_decision(
    config: SafetySupervisorConfig,
    input: SupervisorInput,
) -> SupervisorDecision {
    let mut reasons = Vec::new();
    let radius = (input.position_m[0].powi(2) + input.position_m[2].powi(2)).sqrt();
    if input.kill_switch {
        reasons.push("kill switch asserted".to_string());
    }
    if radius > config.geofence_radius_m {
        reasons.push("geofence exceeded".to_string());
    }
    if input
        .attitude_rad
        .iter()
        .any(|v| v.abs() > config.max_attitude_rad)
    {
        reasons.push("attitude envelope exceeded".to_string());
    }
    if input
        .rate_rad_s
        .iter()
        .any(|v| v.abs() > config.max_rate_rad_s)
    {
        reasons.push("rate envelope exceeded".to_string());
    }
    if input.battery_v < config.min_battery_v {
        reasons.push("battery floor reached".to_string());
    }
    SupervisorDecision {
        allow_policy: reasons.is_empty(),
        command: if reasons.is_empty() {
            "policy-advisory".to_string()
        } else {
            "supervisor-hold".to_string()
        },
        reasons,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TelemetrySample {
    pub t: f64,
    pub voltage_v: f64,
    pub current_a: f64,
    pub throttle: f64,
    pub accel_g: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WearEstimate {
    pub motor_hours: f64,
    pub pack_cycles: f64,
    pub r_int_mohm_estimate: Option<f64>,
    pub warnings: Vec<String>,
}

pub fn estimate_wear(
    samples: &[TelemetrySample],
    nominal_voltage_v: f64,
    capacity_mah: f64,
) -> WearEstimate {
    if samples.len() < 2 {
        return WearEstimate {
            motor_hours: 0.0,
            pack_cycles: 0.0,
            r_int_mohm_estimate: None,
            warnings: vec!["insufficient telemetry".to_string()],
        };
    }
    let mut ah = 0.0;
    let mut weighted_r = 0.0;
    let mut r_weight = 0.0;
    for pair in samples.windows(2) {
        let dt_h = ((pair[1].t - pair[0].t).max(0.0)) / 3600.0;
        let current = 0.5 * (pair[0].current_a + pair[1].current_a).max(0.0);
        ah += current * dt_h;
        if current > 1.0 {
            let v = 0.5 * (pair[0].voltage_v + pair[1].voltage_v);
            weighted_r += ((nominal_voltage_v - v).max(0.0) / current) * 1000.0 * current;
            r_weight += current;
        }
    }
    let duration_h = (samples.last().unwrap().t - samples.first().unwrap().t).max(0.0) / 3600.0;
    let motor_hours = duration_h * samples.iter().map(|s| s.throttle.max(0.0)).sum::<f64>()
        / samples.len() as f64;
    let pack_cycles = ah / (capacity_mah.max(1.0) / 1000.0);
    let r_int = (r_weight > 0.0).then_some(weighted_r / r_weight);
    let mut warnings = Vec::new();
    if pack_cycles > 0.8 {
        warnings.push("single log consumed most of a pack cycle".to_string());
    }
    if r_int.is_some_and(|r| r > 120.0) {
        warnings.push("internal resistance estimate is high".to_string());
    }
    WearEstimate {
        motor_hours,
        pack_cycles,
        r_int_mohm_estimate: r_int,
        warnings,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashWindow {
    pub start_s: f64,
    pub impact_s: f64,
    pub end_s: f64,
}

pub fn detect_crash_window(
    samples: &[TelemetrySample],
    threshold_g: f64,
    pre_s: f64,
    post_s: f64,
) -> Option<CrashWindow> {
    samples
        .iter()
        .find(|sample| sample.accel_g >= threshold_g)
        .map(|sample| CrashWindow {
            start_s: (sample.t - pre_s).max(samples.first().map(|s| s.t).unwrap_or(sample.t)),
            impact_s: sample.t,
            end_s: sample.t + post_s,
        })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairStep {
    pub order: usize,
    pub node: String,
    pub part_index: usize,
    pub action: String,
    pub reorder_sku: Option<String>,
}

pub fn repair_sheet(
    spec: &ModelSpec,
    damaged_nodes: &[String],
    reorder_skus: &BTreeMap<String, String>,
) -> Vec<RepairStep> {
    let damaged: BTreeSet<&str> = damaged_nodes.iter().map(String::as_str).collect();
    let mut steps: Vec<_> = spec
        .parts
        .iter()
        .enumerate()
        .filter(|(_, part)| damaged.contains(part.node.as_str()))
        .map(|(index, part)| {
            let t0 = part
                .explode
                .as_ref()
                .map(|explode| explode.t0)
                .unwrap_or(0.5);
            (t0, index, part)
        })
        .collect();
    steps.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.1.cmp(&b.1))
    });
    steps
        .into_iter()
        .enumerate()
        .map(|(order, (_, index, part))| RepairStep {
            order: order + 1,
            node: part.node.clone(),
            part_index: index,
            action: format!(
                "remove, inspect, and replace part {index} on node '{}'",
                part.node
            ),
            reorder_sku: part
                .comp
                .as_ref()
                .and_then(|component| reorder_skus.get(component).cloned()),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use forge_contract::validate_shape;

    fn sample_quad() -> ModelSpec {
        validate_shape(
            r##"{
          "meta":{"id":"q","name":"q","version":"2.1.0","archetype":"multirotor",
                  "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[{"name":"root","parent":null,"pos":[0,0,0]}],
          "parts":[
            {"node":"root","geom":{"kind":"cbox","w":0.16,"h":0.03,"d":0.16,"ch":0.02},
             "material":"matte","color":"#222222","mass":{"valueG":120},
             "collision":"primitive","comp":"plate",
             "explode":{"dir":[0,1,0],"mag":0.1,"t0":0.3,"t1":0.5}},
            {"node":"root","geom":{"kind":"cyl","r0":0.03,"h":0.02,"n":16},
             "material":"metal","color":"#aaaaaa","mass":{"valueG":30},
             "collision":"auto","comp":"standoff",
             "explode":{"dir":[0,1,0],"mag":0.1,"t0":0.8,"t1":0.9}}
          ],
          "driver":{"archetype":"multirotor","params":{}},
          "sim":{
            "battery":{"cells":4,"capacity_mAh":1500,"r_int_mohm":18},
            "colliders":{"policy":"per-node-compound","budget":{"perNode":1,"perModel":4}},
            "motors":[{"kv":1750,"mount":"root"}],
            "props":[{"diameterIn":5.0,"pitchIn":4.3,"blades":3}]
          }
        }"##,
        )
        .unwrap()
    }

    #[test]
    fn collider_fitter_respects_per_node_budget() {
        let spec = sample_quad();
        let baked = forge_geometry::bake(&spec).unwrap();
        let fit = fit_compound_colliders(&spec, &baked);
        assert_eq!(fit.collider_count, 1);
        assert_eq!(fit.overflow_nodes, vec!["root"]);
        assert_eq!(fit.per_node.get("root"), Some(&1));
    }

    #[test]
    fn blade_element_lite_is_monotonic_and_computes_torque() {
        let low = blade_element_lite(BladeElementInput {
            kv: 1750.0,
            voltage_v: 14.8,
            throttle: 0.25,
            prop_diameter_m: 0.127,
            air_density: 1.225,
            ct: 0.11,
            cq: 0.004,
        });
        let high = blade_element_lite(BladeElementInput {
            throttle: 0.75,
            ..low_input()
        });
        assert!(high.point.thrust_n > low.point.thrust_n);
        assert!(high.torque_nm > low.torque_nm);
    }

    fn low_input() -> BladeElementInput {
        BladeElementInput {
            kv: 1750.0,
            voltage_v: 14.8,
            throttle: 0.25,
            prop_diameter_m: 0.127,
            air_density: 1.225,
            ct: 0.11,
            cq: 0.004,
        }
    }

    #[test]
    fn disturbances_are_deterministic_and_can_drop_sensors() {
        let profile = DisturbanceProfile {
            wind_mean_mps: 2.0,
            gust_mps: 1.0,
            payload_shift_m: [0.01, 0.0, 0.0],
            sensor_dropout_pct: 100.0,
        };
        let a = sample_disturbance(profile, 7, 3);
        let b = sample_disturbance(profile, 7, 3);
        assert_eq!(a, b);
        assert!(!a.sensor_available);
    }

    #[test]
    fn course_task_derives_io_header() {
        let env = EnvSpec {
            id: "gate-course".to_string(),
            name: "Gate course".to_string(),
            version: "1.0.0".to_string(),
            kind: "course".to_string(),
            bounds_m: [10.0, 5.0, 10.0],
            provenance: None,
            license: None,
            terrain: None,
            tasks: vec!["gate-slalom".to_string()],
            obstacles: vec![],
            gates: vec![],
            spawns: vec![],
            win: None,
            env: None,
        };
        let task = course_to_task(&env, "multirotor");
        assert_eq!(task.kind, TaskKind::GateSlalom);
        let spec = sample_quad();
        let io = derive_obs_action(&spec, &task);
        assert!(io.observations.contains(&"estimator.attitude".to_string()));
        assert_eq!(
            io.onnx_header.get("actionCount").map(String::as_str),
            Some("4")
        );
    }

    #[test]
    fn supervisor_fails_closed() {
        let decision = supervisor_decision(
            SafetySupervisorConfig {
                geofence_radius_m: 5.0,
                max_attitude_rad: 0.8,
                max_rate_rad_s: 3.0,
                min_battery_v: 13.2,
            },
            SupervisorInput {
                position_m: [6.0, 0.0, 0.0],
                attitude_rad: [0.0, 0.0, 0.0],
                rate_rad_s: [0.0, 0.0, 0.0],
                battery_v: 14.0,
                kill_switch: false,
            },
        );
        assert!(!decision.allow_policy);
        assert_eq!(decision.reasons, vec!["geofence exceeded"]);
    }

    #[test]
    fn mjx_adoption_requires_need_speed_and_parity() {
        let adopt = evaluate_mjx_adoption(MjxBenchmark {
            cpu_mujoco_steps_per_s: 1000.0,
            mjx_steps_per_s: 3500.0,
            cpu_overnight_target_hit: false,
            tier2_budget_miss_pct: 40.0,
            parity_passed: true,
        });
        assert!(adopt.adopt, "{adopt:?}");

        let reject = evaluate_mjx_adoption(MjxBenchmark {
            cpu_mujoco_steps_per_s: 1000.0,
            mjx_steps_per_s: 2500.0,
            cpu_overnight_target_hit: true,
            tier2_budget_miss_pct: 0.0,
            parity_passed: true,
        });
        assert!(!reject.adopt);
        assert!(reject
            .reasons
            .iter()
            .any(|reason| reason.contains("already meets")));
    }

    #[test]
    fn wear_and_crash_are_computed_from_telemetry() {
        let samples = vec![
            TelemetrySample {
                t: 0.0,
                voltage_v: 16.8,
                current_a: 0.0,
                throttle: 0.0,
                accel_g: 1.0,
            },
            TelemetrySample {
                t: 60.0,
                voltage_v: 15.8,
                current_a: 20.0,
                throttle: 0.5,
                accel_g: 2.0,
            },
            TelemetrySample {
                t: 61.0,
                voltage_v: 15.7,
                current_a: 22.0,
                throttle: 0.2,
                accel_g: 12.0,
            },
        ];
        let wear = estimate_wear(&samples, 16.8, 1500.0);
        assert!(wear.pack_cycles > 0.0);
        assert!(wear.r_int_mohm_estimate.is_some());
        let crash = detect_crash_window(&samples, 10.0, 2.0, 4.0).unwrap();
        assert_eq!(crash.impact_s, 61.0);
    }

    #[test]
    fn repair_sheet_follows_explode_reverse_order() {
        let spec = sample_quad();
        let mut skus = BTreeMap::new();
        skus.insert("standoff".to_string(), "SKU-STANDOFF".to_string());
        let steps = repair_sheet(&spec, &["root".to_string()], &skus);
        assert_eq!(steps[0].reorder_sku.as_deref(), Some("SKU-STANDOFF"));
        assert_eq!(steps[0].part_index, 1);
    }
}
