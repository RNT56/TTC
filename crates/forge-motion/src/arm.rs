//! Arm driver (P2-003): deterministic planar damped-least-squares IK.
//!
//! v0 uses a simple convention that keeps the contract data-only: revolute
//! skeleton nodes are the joints, `driver.params.jointNodes` can pin their order,
//! and the end effector is either `driver.params.endEffectorNode` or the last
//! skeleton leaf. The solver runs in the Y/Z plane around each joint's X axis.

use crate::{clamp_velocity, dls_step, InputFrame};
use forge_contract::{JointKind, ModelSpec};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub struct ArmParams {
    /// Desired end-effector target in the arm base frame, meters.
    pub target_m: [f64; 3],
    /// Optional ordered joint-node list; otherwise revolute skeleton nodes are used.
    pub joint_nodes: Vec<String>,
    /// Optional end-effector node used for the final link length.
    pub end_effector_node: Option<String>,
    /// DLS damping λ.
    pub damping: f64,
    /// Fraction of each IK step to apply.
    pub step_gain: f64,
    /// Per-iteration clamp for Δθ, radians.
    pub max_step_rad: f64,
    /// Solver iterations per driver tick.
    pub iterations: usize,
    /// Reached threshold, meters.
    pub reach_tolerance_m: f64,
    /// Soft null-space posture target, radians.
    pub posture_bias_rad: f64,
}

impl Default for ArmParams {
    fn default() -> Self {
        ArmParams {
            target_m: [0.0, -0.10, 0.32],
            joint_nodes: Vec::new(),
            end_effector_node: None,
            damping: 0.08,
            step_gain: 0.85,
            max_step_rad: 0.12,
            iterations: 32,
            reach_tolerance_m: 0.02,
            posture_bias_rad: 0.0,
        }
    }
}

impl ArmParams {
    pub fn from_spec(spec: &ModelSpec) -> Self {
        serde_json::from_value(spec.driver.params.clone()).unwrap_or_default()
    }
}

#[derive(Debug, Clone)]
pub struct ArmJoint {
    pub node: String,
    pub length_m: f64,
    pub limits: Option<[f64; 2]>,
    pub max_vel_rad: Option<f64>,
}

#[derive(Debug, Clone, Default)]
pub struct ArmOutputs {
    pub joint_targets: Vec<(String, f64)>,
    pub end_effector_m: [f64; 3],
    pub error_m: f64,
    pub reached: bool,
}

#[derive(Debug, Clone)]
pub struct ArmDriver {
    pub params: ArmParams,
    pub joints: Vec<ArmJoint>,
    pub angles: Vec<f64>,
    out: ArmOutputs,
}

impl ArmDriver {
    pub fn new(spec: &ModelSpec) -> Self {
        let params = ArmParams::from_spec(spec);
        let joints = discover_arm_joints(spec, &params);
        ArmDriver {
            angles: vec![0.0; joints.len()],
            joints,
            params,
            out: ArmOutputs::default(),
        }
    }

    pub fn tick(&mut self, _input: &InputFrame, dt: f64) -> &ArmOutputs {
        let n = self.joints.len();
        if n == 0 {
            self.out = self.outputs();
            return &self.out;
        }

        let iterations = self.params.iterations.clamp(1, 128);
        let mut jac = vec![[0.0; 2]; n];
        let mut dtheta = vec![0.0; n];
        for _ in 0..iterations {
            let current = planar_fk(&self.joints, &self.angles);
            let err = [
                self.params.target_m[1] - current[0],
                self.params.target_m[2] - current[1],
            ];
            if hypot2(err) <= self.params.reach_tolerance_m {
                break;
            }
            planar_jacobian(&self.joints, &self.angles, &mut jac);
            dls_step(&jac, err, self.params.damping.max(1e-6), &mut dtheta);
            for (i, angle) in self.angles.iter_mut().enumerate() {
                let posture = (self.params.posture_bias_rad - *angle) * 0.02;
                let raw_step = (dtheta[i] * self.params.step_gain + posture).clamp(
                    -self.params.max_step_rad.abs(),
                    self.params.max_step_rad.abs(),
                );
                let step = clamp_velocity(self.joints[i].max_vel_rad, raw_step / dt.max(1e-9)) * dt;
                *angle = (*angle + step).clamp(
                    self.joints[i]
                        .limits
                        .map(|l| l[0])
                        .unwrap_or(-std::f64::consts::PI),
                    self.joints[i]
                        .limits
                        .map(|l| l[1])
                        .unwrap_or(std::f64::consts::PI),
                );
            }
        }
        self.out = self.outputs();
        &self.out
    }

    fn outputs(&self) -> ArmOutputs {
        let yz = planar_fk(&self.joints, &self.angles);
        let end_effector_m = [0.0, yz[0], yz[1]];
        let error_m = ((self.params.target_m[1] - yz[0]).powi(2)
            + (self.params.target_m[2] - yz[1]).powi(2))
        .sqrt();
        ArmOutputs {
            joint_targets: self
                .joints
                .iter()
                .zip(&self.angles)
                .map(|(joint, angle)| (joint.node.clone(), *angle))
                .collect(),
            end_effector_m,
            error_m,
            reached: error_m <= self.params.reach_tolerance_m,
        }
    }
}

pub fn discover_arm_joints(spec: &ModelSpec, params: &ArmParams) -> Vec<ArmJoint> {
    let joint_names = if params.joint_nodes.is_empty() {
        spec.skeleton
            .iter()
            .filter(|node| {
                node.joint
                    .as_ref()
                    .map(|joint| matches!(joint.kind, JointKind::Revolute))
                    .unwrap_or(false)
            })
            .map(|node| node.name.clone())
            .collect::<Vec<_>>()
    } else {
        params.joint_nodes.clone()
    };

    joint_names
        .iter()
        .enumerate()
        .filter_map(|(index, name)| {
            let node = spec.node(name)?;
            let next_name = joint_names
                .get(index + 1)
                .cloned()
                .or_else(|| params.end_effector_node.clone())
                .or_else(|| first_child_name(spec, name));
            let length_m = next_name
                .as_deref()
                .and_then(|child| spec.node(child))
                .map(|child| norm(child.pos))
                .unwrap_or_else(|| norm(node.pos))
                .max(1e-6);
            let limits = node.limits.map(|limits| limits[0]);
            let max_vel_rad = node.joint.as_ref().and_then(|joint| joint.max_vel_rad);
            Some(ArmJoint {
                node: name.clone(),
                length_m,
                limits,
                max_vel_rad,
            })
        })
        .collect()
}

fn first_child_name(spec: &ModelSpec, parent: &str) -> Option<String> {
    spec.skeleton
        .iter()
        .find(|node| node.parent.as_deref() == Some(parent))
        .map(|node| node.name.clone())
}

fn norm(v: [f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

fn planar_fk(joints: &[ArmJoint], angles: &[f64]) -> [f64; 2] {
    let mut theta = 0.0;
    let mut y = 0.0;
    let mut z = 0.0;
    for (joint, angle) in joints.iter().zip(angles.iter()) {
        theta += angle;
        y -= joint.length_m * forge_num::sin(theta);
        z += joint.length_m * forge_num::cos(theta);
    }
    [y, z]
}

fn planar_jacobian(joints: &[ArmJoint], angles: &[f64], out: &mut [[f64; 2]]) {
    for col in out.iter_mut() {
        *col = [0.0; 2];
    }
    let mut theta = 0.0;
    let mut cumulative = Vec::with_capacity(joints.len());
    for angle in angles {
        theta += angle;
        cumulative.push(theta);
    }
    for (i, column) in out.iter_mut().enumerate().take(joints.len()) {
        let mut dy = 0.0;
        let mut dz = 0.0;
        for j in i..joints.len() {
            dy -= joints[j].length_m * forge_num::cos(cumulative[j]);
            dz -= joints[j].length_m * forge_num::sin(cumulative[j]);
        }
        *column = [dy, dz];
    }
}

fn hypot2(v: [f64; 2]) -> f64 {
    (v[0] * v[0] + v[1] * v[1]).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DT;

    fn arm_spec(params: serde_json::Value) -> ModelSpec {
        let doc = serde_json::json!({
          "meta":{"id":"arm","name":"arm","version":"2.1.0","archetype":"arm",
                  "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[
            {"name":"base","parent":null,"pos":[0,0,0]},
            {"name":"shoulder","parent":"base","pos":[0,0,0],
             "joint":{"type":"revolute","axis":[1,0,0],"maxVelRad":8.0},
             "limits":[[-2.2,2.2],[0,0],[0,0]]},
            {"name":"elbow","parent":"shoulder","pos":[0,0,0.22],
             "joint":{"type":"revolute","axis":[1,0,0],"maxVelRad":8.0},
             "limits":[[-2.2,2.2],[0,0],[0,0]]},
            {"name":"wrist","parent":"elbow","pos":[0,0,0.18]}
          ],
          "parts":[
            {"node":"shoulder","geom":{"kind":"box","w":0.04,"h":0.04,"d":0.22},
             "material":"matte","color":"#444444","collision":"primitive"},
            {"node":"elbow","geom":{"kind":"box","w":0.035,"h":0.035,"d":0.18},
             "material":"matte","color":"#555555","collision":"primitive"}
          ],
          "driver":{"archetype":"arm","params":params}
        });
        forge_contract::validate_shape(&doc.to_string()).unwrap()
    }

    #[test]
    fn discovers_revolute_chain_and_lengths() {
        let spec = arm_spec(serde_json::json!({}));
        let params = ArmParams::from_spec(&spec);
        let joints = discover_arm_joints(&spec, &params);
        assert_eq!(joints.len(), 2);
        assert_eq!(joints[0].node, "shoulder");
        assert!((joints[0].length_m - 0.22).abs() < 1e-12);
        assert!((joints[1].length_m - 0.18).abs() < 1e-12);
    }

    #[test]
    fn solves_reachable_planar_target_with_finite_joints() {
        let spec = arm_spec(serde_json::json!({
            "targetM":[0.0,-0.12,0.30],
            "reachToleranceM":0.015,
            "iterations":48
        }));
        let mut driver = ArmDriver::new(&spec);
        let out = driver.tick(&InputFrame::default(), DT);
        assert!(out.reached, "{out:#?}");
        assert!(out.error_m <= 0.015, "{out:#?}");
        assert!(out.joint_targets.iter().all(|(_, angle)| angle.is_finite()));
    }

    #[test]
    fn explicit_joint_order_is_respected() {
        let spec = arm_spec(serde_json::json!({
            "jointNodes":["elbow"],
            "endEffectorNode":"wrist"
        }));
        let driver = ArmDriver::new(&spec);
        assert_eq!(driver.joints.len(), 1);
        assert_eq!(driver.joints[0].node, "elbow");
    }
}
