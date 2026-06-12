//! Quadruped driver — the first NEW archetype, proving the contract
//! generalizes (plan §7.3): trot/walk phase gait with per-leg IK.
//!
//! Skeleton convention *(proposed — reconciled at PRE-002)*: each leg is a
//! chain `hip_<id>` → `knee_<id>` → `foot_<id>`; segment lengths come from the
//! child node offsets. Trot pairs legs diagonally by the sign of the hip's
//! local (x, z).

use crate::{leg_ik, InputFrame};
use forge_contract::ModelSpec;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub struct QuadrupedParams {
    /// Standing hip-to-ground height, meters.
    pub stand_height_m: f64,
    /// Full stride length at drive = 1, meters.
    pub stride_m: f64,
    /// Gait cycles per second.
    pub cadence_hz: f64,
    /// Stance fraction of the cycle (0.5 = trot timing).
    pub duty: f64,
    /// Swing-phase foot lift, meters.
    pub lift_m: f64,
    /// Turn rate at turn = 1, rad/s.
    pub yaw_rate: f64,
}

impl Default for QuadrupedParams {
    fn default() -> Self {
        QuadrupedParams {
            stand_height_m: 0.22,
            stride_m: 0.18,
            cadence_hz: 2.0,
            duty: 0.5,
            lift_m: 0.05,
            yaw_rate: 1.2,
        }
    }
}

impl QuadrupedParams {
    pub fn from_spec(spec: &ModelSpec) -> Self {
        serde_json::from_value(spec.driver.params.clone()).unwrap_or_default()
    }
}

#[derive(Debug, Clone)]
pub struct Leg {
    pub id: String,
    pub hip_node: String,
    pub knee_node: String,
    /// Thigh / shank lengths from the skeleton offsets.
    pub l1: f64,
    pub l2: f64,
    /// Trot phase offset (0.0 or 0.5 for diagonal pairs).
    pub phase_offset: f64,
}

/// Discover legs from the `hip_*` / `knee_*` / `foot_*` naming convention.
pub fn discover_legs(spec: &ModelSpec) -> Vec<Leg> {
    let mut legs = Vec::new();
    for node in &spec.skeleton {
        let Some(id) = node.name.strip_prefix("hip_") else {
            continue;
        };
        let knee_name = format!("knee_{id}");
        let foot_name = format!("foot_{id}");
        let (Some(knee), Some(foot)) = (spec.node(&knee_name), spec.node(&foot_name)) else {
            continue;
        };
        let len = |p: [f64; 3]| (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt();
        // diagonal pairing: same-sign (x·z) legs share a phase
        let diag = node.pos[0] * node.pos[2];
        legs.push(Leg {
            id: id.to_string(),
            hip_node: node.name.clone(),
            knee_node: knee_name,
            l1: len(knee.pos).max(1e-6),
            l2: len(foot.pos).max(1e-6),
            phase_offset: if diag >= 0.0 { 0.0 } else { 0.5 },
        });
    }
    legs.sort_by(|a, b| a.id.cmp(&b.id));
    legs
}

#[derive(Debug, Clone, Default)]
pub struct QuadOutputs {
    /// (node name, target angle about the leg plane axis) — hip pitch and knee.
    pub joint_targets: Vec<(String, f64)>,
    /// Body pose: x, z, heading (rad).
    pub body: [f64; 3],
    /// Foot height above ground per leg (diagnostics / contact checks).
    pub foot_clearance: Vec<f64>,
}

#[derive(Debug, Clone)]
pub struct QuadrupedDriver {
    pub params: QuadrupedParams,
    pub legs: Vec<Leg>,
    phase: f64,
    pose: [f64; 3],
    out: QuadOutputs,
}

impl QuadrupedDriver {
    pub fn new(spec: &ModelSpec) -> Self {
        QuadrupedDriver {
            params: QuadrupedParams::from_spec(spec),
            legs: discover_legs(spec),
            phase: 0.0,
            pose: [0.0; 3],
            out: QuadOutputs::default(),
        }
    }

    /// Body pose (x, z, heading) without advancing the gait.
    pub fn body(&self) -> [f64; 3] {
        self.pose
    }

    /// Foot target in the hip frame at gait phase p ∈ [0,1):
    /// stance sweeps the foot backward on the ground; swing returns it forward
    /// with a sinusoidal lift.
    fn foot_target(&self, p: f64, drive: f64) -> (f64, f64, f64) {
        let s = self.params.stride_m * drive.clamp(-1.0, 1.0);
        let d = self.params.duty.clamp(0.2, 0.8);
        let (dz, lift) = if p < d {
            let q = p / d;
            (s / 2.0 - s * q, 0.0)
        } else {
            let q = (p - d) / (1.0 - d);
            (
                -s / 2.0 + s * q,
                self.params.lift_m * forge_num::sin(std::f64::consts::PI * q),
            )
        };
        let dy = -(self.params.stand_height_m - lift);
        (dy, dz, lift)
    }

    pub fn tick(&mut self, input: &InputFrame, dt: f64) -> &QuadOutputs {
        let drive = input.drive.clamp(-1.0, 1.0);
        self.phase = (self.phase + self.params.cadence_hz * dt).rem_euclid(1.0);

        self.out.joint_targets.clear();
        self.out.foot_clearance.clear();
        for leg in &self.legs {
            let p = (self.phase + leg.phase_offset).rem_euclid(1.0);
            let (dy, dz, lift) = self.foot_target(p, drive);
            let pose = leg_ik(leg.l1, leg.l2, dy, dz);
            self.out
                .joint_targets
                .push((leg.hip_node.clone(), pose.hip_pitch));
            self.out
                .joint_targets
                .push((leg.knee_node.clone(), pose.knee));
            self.out.foot_clearance.push(lift);
        }

        // body advance: v ≈ stride × cadence at full drive (stated approximation)
        let speed = drive * self.params.stride_m * self.params.cadence_hz;
        self.pose[2] += input.turn.clamp(-1.0, 1.0) * self.params.yaw_rate * dt;
        self.pose[0] += speed * forge_num::sin(self.pose[2]) * dt;
        self.pose[1] += speed * forge_num::cos(self.pose[2]) * dt;
        self.out.body = self.pose;
        &self.out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DT;

    fn quad_spec() -> ModelSpec {
        // minimal 4-leg skeleton following the naming convention
        let mut doc = serde_json::json!({
          "meta":{"id":"q","name":"q","version":"2.1.0","archetype":"quadruped",
                  "provenance":{"kind":"parametric-generator"},"license":"CC0"},
          "skeleton":[{"name":"root","parent":null,"pos":[0,0.25,0]}],
          "parts":[{"node":"root","geom":{"kind":"box","w":0.3,"h":0.08,"d":0.5},
                    "material":"matte","color":"#333333","mass":{"valueG":2000}}],
          "driver":{"archetype":"quadruped",
                    "params":{"standHeightM":0.22,"strideM":0.18,"cadenceHz":2.0}}
        });
        let legs = [
            ("fl", 0.12, 0.2),
            ("fr", -0.12, 0.2),
            ("rl", 0.12, -0.2),
            ("rr", -0.12, -0.2),
        ];
        for (id, x, z) in legs {
            let sk = doc["skeleton"].as_array_mut().unwrap();
            sk.push(
                serde_json::json!({"name":format!("hip_{id}"),"parent":"root","pos":[x,0.0,z],
                "joint":{"type":"revolute","axis":[1,0,0]}}),
            );
            sk.push(
                serde_json::json!({"name":format!("knee_{id}"),"parent":format!("hip_{id}"),
                "pos":[0.0,-0.12,0.0],"joint":{"type":"revolute","axis":[1,0,0]}}),
            );
            sk.push(
                serde_json::json!({"name":format!("foot_{id}"),"parent":format!("knee_{id}"),
                "pos":[0.0,-0.12,0.0]}),
            );
        }
        forge_contract::validate_shape(&doc.to_string()).unwrap()
    }

    #[test]
    fn discovers_four_legs_with_diagonal_phases() {
        let legs = discover_legs(&quad_spec());
        assert_eq!(legs.len(), 4);
        let phase = |id: &str| legs.iter().find(|l| l.id == id).unwrap().phase_offset;
        // diagonal pairs share phase: (fl, rr) vs (fr, rl)
        assert_eq!(phase("fl"), phase("rr"));
        assert_eq!(phase("fr"), phase("rl"));
        assert_ne!(phase("fl"), phase("fr"));
        assert!((legs[0].l1 - 0.12).abs() < 1e-12 && (legs[0].l2 - 0.12).abs() < 1e-12);
    }

    #[test]
    fn walks_a_meter_with_finite_joints() {
        let spec = quad_spec();
        let mut driver = QuadrupedDriver::new(&spec);
        let input = InputFrame {
            drive: 1.0,
            ..Default::default()
        };
        let v = driver.params.stride_m * driver.params.cadence_hz;
        let max_lift = driver.params.lift_m;
        let steps = (1.0 / v / DT).ceil() as usize;
        for _ in 0..steps {
            let out = driver.tick(&input, DT);
            for (node, angle) in &out.joint_targets {
                assert!(angle.is_finite(), "{node} angle not finite");
            }
            for c in &out.foot_clearance {
                assert!(*c >= -1e-9 && *c <= max_lift + 1e-9);
            }
        }
        let dist = (driver.pose[0].powi(2) + driver.pose[1].powi(2)).sqrt();
        assert!((dist - 1.0).abs() < 0.05, "walked {dist} m");
    }

    #[test]
    fn stationary_when_drive_is_zero() {
        let spec = quad_spec();
        let mut driver = QuadrupedDriver::new(&spec);
        let input = InputFrame::default();
        for _ in 0..240 {
            driver.tick(&input, DT);
        }
        assert!(driver.pose[0].abs() < 1e-12 && driver.pose[1].abs() < 1e-12);
    }
}
