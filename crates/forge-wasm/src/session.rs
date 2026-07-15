//! CoreSession — the `tick` boundary call (architecture §2): fixed-step motion
//! advanced in core, pose matrices written to a flat buffer the render layer
//! interpolates from. Deterministic: same contract + same input sequence →
//! bit-identical pose streams (D17; golden-number corpus member).

use forge_contract::ModelSpec;
use forge_geometry::{body_offset, node_world_posed, node_world_with_joints, Mat4};
use forge_motion::biped::BipedDriver;
use forge_motion::fpv::{FpvDriver, MultirotorMotionTruth};
use forge_motion::quadruped::QuadrupedDriver;
use forge_motion::{InputFrame, RoverDriver, StickInput, DT};
use forge_sim::{ComplementaryFilter, Powertrain};
use std::collections::BTreeMap;

/// Drive-mode camera-flat forward for stick-to-world mapping; the face owns
/// camera-relative input later (P1-013) — core pins world +Z, the same basis
/// the oracle tapes were recorded under.
const CAM_FORWARD: [f64; 3] = [0.0, 0.0, 1.0];

/// `forge-policy-tensor` 1.0.0 multirotor input order. Category-level policy
/// metadata remains stable; this scalar layout is the executable ONNX boundary.
pub const MULTIROTOR_POLICY_LAYOUT: [&str; 11] =
    forge_sim::training::MULTIROTOR_POLICY_INPUT_LAYOUT;

struct MultirotorPolicyObserver {
    attitude: [ComplementaryFilter; 3],
    estimated_position_m: [f64; 3],
    position_alpha: f64,
    powertrain: Powertrain,
    nominal_voltage_v: f64,
    max_total_current_a: f64,
    normalized_voltage: f64,
    normalized_current: f64,
}

impl MultirotorPolicyObserver {
    fn new(spec: &ModelSpec, truth: MultirotorMotionTruth) -> Result<Self, String> {
        let estimator = spec.sim.estimator.as_ref().ok_or_else(|| {
            "policy observation requires a ModelSpec estimator block (D8)".to_string()
        })?;
        if !matches!(estimator.kind, forge_contract::EstimatorKind::Complementary) {
            return Err(
                "browser policy observation currently supports the complementary estimator only"
                    .to_string(),
            );
        }
        let powertrain = Powertrain::from_inline_spec(spec)?;
        let nominal_voltage_v = powertrain.battery_v0;
        let max_total_current_a = spec
            .sim
            .motors
            .iter()
            .map(|motor| {
                motor.max_current_a.ok_or_else(|| {
                    "policy observation requires every motor current limit inline".to_string()
                })
            })
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .sum::<f64>();
        if !(max_total_current_a.is_finite() && max_total_current_a > 0.0) {
            return Err(
                "policy observation requires a positive total motor current limit".to_string(),
            );
        }
        let mut attitude = [
            ComplementaryFilter::from_spec(estimator, 7),
            ComplementaryFilter::from_spec(estimator, 11),
            ComplementaryFilter::from_spec(estimator, 13),
        ];
        for (filter, initial) in attitude.iter_mut().zip(truth.attitude_rad) {
            filter.theta_hat = initial;
        }
        let latency_s = estimator.latency_ms.max(0.0) / 1000.0;
        let position_alpha = (DT / (latency_s + DT)).clamp(0.02, 1.0);
        Ok(MultirotorPolicyObserver {
            attitude,
            estimated_position_m: truth.position_m,
            position_alpha,
            powertrain,
            nominal_voltage_v,
            max_total_current_a,
            normalized_voltage: 1.0,
            normalized_current: 0.0,
        })
    }

    fn step(&mut self, truth: MultirotorMotionTruth, input: &InputFrame) {
        for axis in 0..3 {
            self.attitude[axis].step(truth.angular_rate_rad_s[axis], truth.attitude_rad[axis], DT);
            self.estimated_position_m[axis] +=
                (truth.position_m[axis] - self.estimated_position_m[axis]) * self.position_alpha;
        }
        let power = self.powertrain.at_throttle(input.throttle.abs());
        self.normalized_voltage = (power.v_eff / self.nominal_voltage_v).clamp(0.0, 1.0);
        self.normalized_current = (power.current_a * self.powertrain.n_motors as f64
            / self.max_total_current_a)
            .clamp(0.0, 1.0);
    }

    fn observations(&self, target_world_m: [f64; 3]) -> Result<[f64; 11], String> {
        if !target_world_m.iter().all(|value| value.is_finite()) {
            return Err("policy target must contain finite SI coordinates".to_string());
        }
        if target_world_m.iter().any(|value| value.abs() > 1_000.0) {
            return Err("policy target exceeds the 1 km browser-playback bound".to_string());
        }
        let attitude = [
            self.attitude[0].theta_hat,
            self.attitude[1].theta_hat,
            self.attitude[2].theta_hat,
        ];
        let rate = [
            self.attitude[0].last_gyro(),
            self.attitude[1].last_gyro(),
            self.attitude[2].last_gyro(),
        ];
        let error_world = [
            target_world_m[0] - self.estimated_position_m[0],
            target_world_m[1] - self.estimated_position_m[1],
            target_world_m[2] - self.estimated_position_m[2],
        ];
        let (sin_yaw, cos_yaw) = (forge_num::sin(attitude[2]), forge_num::cos(attitude[2]));
        let error_body = [
            error_world[0] * cos_yaw - error_world[2] * sin_yaw,
            error_world[1],
            error_world[0] * sin_yaw + error_world[2] * cos_yaw,
        ];
        let values = [
            attitude[0].clamp(-std::f64::consts::PI, std::f64::consts::PI),
            attitude[1].clamp(-std::f64::consts::PI, std::f64::consts::PI),
            attitude[2].clamp(-std::f64::consts::PI, std::f64::consts::PI),
            rate[0].clamp(-20.0, 20.0),
            rate[1].clamp(-20.0, 20.0),
            rate[2].clamp(-20.0, 20.0),
            error_body[0].clamp(-100.0, 100.0),
            error_body[1].clamp(-100.0, 100.0),
            error_body[2].clamp(-100.0, 100.0),
            self.normalized_voltage,
            self.normalized_current,
        ];
        if values.iter().all(|value| value.is_finite()) {
            Ok(values)
        } else {
            Err("policy observation produced a non-finite value".to_string())
        }
    }
}

enum DriverState {
    /// Oracle FPV flight (PRE-002 port): drag-limited velocity flight, tilt,
    /// per-motor mixer spin — full pose channels.
    Multirotor(FpvDriver),
    /// Oracle biped gait (PRE-002 port): phase gait + IK + servo settle.
    Biped(BipedDriver),
    Rover(RoverDriver),
    Quadruped {
        driver: QuadrupedDriver,
        angles: BTreeMap<String, f64>,
    },
    /// Archetypes whose drivers land P2+ hold the idle pose.
    Static,
}

pub struct CoreSession {
    spec: ModelSpec,
    /// Stable node order for the pose buffer (skeleton declaration order).
    node_names: Vec<String>,
    driver: DriverState,
    policy_observer: Option<MultirotorPolicyObserver>,
    policy_observer_error: Option<String>,
    accumulator: f64,
    /// 16 f32 per node, column-major, written every completed fixed step.
    pose: Vec<f32>,
    /// Teach-pendant jog offsets (P1-013): per-node euler [rx, ry] added over
    /// the driver's pose layers — the monolith's jog semantics. Inspection
    /// state, never part of the golden corpus (the scripted input sets none).
    jog: BTreeMap<String, [f64; 2]>,
    pub ticks: u64,
}

impl CoreSession {
    pub fn new(contract_json: &str) -> Result<Self, String> {
        let spec = forge_contract::validate_shape(contract_json).map_err(|e| e.to_string())?;
        let node_names: Vec<String> = spec.skeleton.iter().map(|n| n.name.clone()).collect();

        let driver = match spec.meta.archetype {
            forge_contract::Archetype::Multirotor => DriverState::Multirotor(FpvDriver::new(&spec)),
            forge_contract::Archetype::Biped => DriverState::Biped(BipedDriver::new(&spec)),
            forge_contract::Archetype::Rover => DriverState::Rover(RoverDriver::new(&spec)),
            forge_contract::Archetype::Quadruped => DriverState::Quadruped {
                driver: QuadrupedDriver::new(&spec),
                angles: BTreeMap::new(),
            },
            _ => DriverState::Static,
        };

        let (policy_observer, policy_observer_error) = match &driver {
            DriverState::Multirotor(driver) => {
                match MultirotorPolicyObserver::new(&spec, driver.policy_truth()) {
                    Ok(observer) => (Some(observer), None),
                    Err(error) => (None, Some(error)),
                }
            }
            _ => (
                None,
                Some(
                    "browser ONNX policy playback currently supports multirotor contracts only"
                        .to_string(),
                ),
            ),
        };

        let mut session = CoreSession {
            pose: vec![0.0; node_names.len() * 16],
            node_names,
            spec,
            driver,
            policy_observer,
            policy_observer_error,
            accumulator: 0.0,
            jog: BTreeMap::new(),
            ticks: 0,
        };
        session.write_pose(None, &BTreeMap::new())?;
        Ok(session)
    }

    pub fn node_names(&self) -> &[String] {
        &self.node_names
    }

    /// Set a teach-pendant jog offset on a node (zeros clear it). Applied on
    /// the posed driver paths (biped/multirotor) over the pose layers.
    pub fn set_jog(&mut self, node: &str, rx: f64, ry: f64) {
        if rx == 0.0 && ry == 0.0 {
            self.jog.remove(node);
        } else {
            self.jog.insert(node.to_string(), [rx, ry]);
        }
    }

    pub fn clear_jog(&mut self) {
        self.jog.clear();
    }

    /// Camera focus point for drive mode (the prototype's drvFocus): the
    /// driver's body position at its natural viewing height, or the origin
    /// for static archetypes.
    pub fn focus(&self) -> [f64; 3] {
        match &self.driver {
            DriverState::Multirotor(d) => d.focus(),
            DriverState::Biped(d) => d.focus(),
            DriverState::Rover(d) => [d.pose[0], 0.0, d.pose[1]],
            DriverState::Quadruped { driver, .. } => {
                let b = driver.body();
                [b[0], 0.0, b[1]]
            }
            DriverState::Static => [0.0; 3],
        }
    }

    pub fn policy_layout(&self) -> Result<Vec<String>, String> {
        if let Some(error) = &self.policy_observer_error {
            return Err(error.clone());
        }
        Ok(MULTIROTOR_POLICY_LAYOUT
            .iter()
            .map(|name| (*name).to_string())
            .collect())
    }

    /// Estimator-derived ONNX input for a world-space SI target. Motion truth
    /// is consumed inside the observer and never crosses this boundary (D8).
    pub fn policy_observations(&self, target_world_m: [f64; 3]) -> Result<Vec<f64>, String> {
        if let Some(error) = &self.policy_observer_error {
            return Err(error.clone());
        }
        let observer = self
            .policy_observer
            .as_ref()
            .ok_or_else(|| "policy observer is unavailable".to_string())?;
        observer
            .observations(target_world_m)
            .map(|values| values.to_vec())
    }

    /// Pose buffer: `node_names().len() × 16` f32, column-major per node.
    pub fn pose_buffer(&self) -> &[f32] {
        &self.pose
    }

    /// Advance by wall-clock dt; motion runs in fixed 120 Hz steps (the
    /// accumulator carries the remainder — render interpolation is the face's
    /// job). Returns the number of fixed steps executed. Death-spiral clamping
    /// is the render loop's responsibility: batch callers (replay, training
    /// playback) legitimately advance large dts.
    pub fn step(&mut self, dt: f64, input: &InputFrame) -> Result<u32, String> {
        self.accumulator += dt.max(0.0);
        let mut steps = 0u32;
        while self.accumulator >= DT {
            self.accumulator -= DT;
            self.fixed_step(input)?;
            steps += 1;
            self.ticks += 1;
        }
        Ok(steps)
    }

    fn fixed_step(&mut self, input: &InputFrame) -> Result<(), String> {
        // absolute driver clock, (tick+1)·DT — the oracle tapes' convention
        let t = (self.ticks + 1) as f64 * DT;
        match &mut self.driver {
            DriverState::Multirotor(driver) => {
                // air mapping: pitch = forward, roll = strafe
                let stick = StickInput {
                    mx: input.roll,
                    mz: input.pitch,
                    yaw: input.yaw,
                    thr: input.throttle,
                    run: false,
                };
                driver.tick(&stick, DT, t);
                if let Some(observer) = self.policy_observer.as_mut() {
                    observer.step(driver.policy_truth(), input);
                }
                let mut poses = Self::pose_map(&driver.poses);
                Self::apply_jog(&self.jog, &mut poses);
                let world = node_world_posed(&self.spec, &poses).map_err(|e| e.to_string())?;
                self.write_world(&world);
                Ok(())
            }
            DriverState::Biped(driver) => {
                // ground mapping: drive = forward, turn = heading (like rover)
                let stick = StickInput {
                    mx: input.roll,
                    mz: input.drive,
                    yaw: input.turn,
                    thr: 0.0,
                    run: false,
                };
                driver.tick(&stick, CAM_FORWARD, DT, t);
                let mut poses = Self::pose_map(&driver.poses);
                Self::apply_jog(&self.jog, &mut poses);
                let world = node_world_posed(&self.spec, &poses).map_err(|e| e.to_string())?;
                self.write_world(&world);
                Ok(())
            }
            DriverState::Rover(driver) => {
                driver.tick(input, DT);
                let offset = body_offset(driver.pose[0], driver.pose[1], driver.pose[2]);
                self.write_pose(Some(offset), &BTreeMap::new())
            }
            DriverState::Quadruped { driver, angles } => {
                let out = driver.tick(input, DT);
                angles.clear();
                for (node, angle) in &out.joint_targets {
                    angles.insert(node.clone(), *angle);
                }
                let offset = body_offset(out.body[0], out.body[1], out.body[2]);
                let angles = angles.clone();
                self.write_pose(Some(offset), &angles)
            }
            DriverState::Static => Ok(()),
        }
    }

    fn pose_map(poses: &forge_motion::PoseBuffer) -> BTreeMap<String, ([f64; 3], [f64; 3])> {
        poses
            .names()
            .iter()
            .cloned()
            .zip(poses.poses().iter().map(|p| (p.rot, p.off)))
            .collect()
    }

    /// Jog over the pose layers (the monolith's `nodes[k].rot += jog[k]`).
    fn apply_jog(
        jog: &BTreeMap<String, [f64; 2]>,
        poses: &mut BTreeMap<String, ([f64; 3], [f64; 3])>,
    ) {
        for (node, j) in jog {
            if let Some((rot, _)) = poses.get_mut(node) {
                rot[0] += j[0];
                rot[1] += j[1];
            }
        }
    }

    fn write_pose(
        &mut self,
        root_offset: Option<Mat4>,
        angles: &BTreeMap<String, f64>,
    ) -> Result<(), String> {
        let world = node_world_with_joints(&self.spec, angles, root_offset.as_ref())
            .map_err(|e| e.to_string())?;
        self.write_world(&world);
        Ok(())
    }

    fn write_world(&mut self, world: &BTreeMap<String, Mat4>) {
        for (i, name) in self.node_names.iter().enumerate() {
            if let Some(m) = world.get(name) {
                for (k, v) in m.iter().enumerate() {
                    self.pose[i * 16 + k] = *v as f32;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const QUAD: &str = include_str!("../../../examples/vx2-mini.forge.json");
    const QD: &str = include_str!("../../../examples/qd-mini.forge.json");

    fn idx(s: &CoreSession, name: &str) -> usize {
        s.node_names().iter().position(|n| n == name).unwrap()
    }

    #[test]
    fn multirotor_flies_and_spins_under_throttle() {
        let mut s = CoreSession::new(QUAD).unwrap();
        let before: Vec<f32> = s.pose_buffer().to_vec();
        let input = InputFrame {
            throttle: 0.6,
            ..Default::default()
        };
        let steps = s.step(1.0, &input).unwrap();
        assert_eq!(steps, 120, "one second = 120 fixed steps");
        let i = idx(&s, "s0") * 16;
        let root = idx(&s, "root") * 16;
        let after = s.pose_buffer();
        // the spinner's rotation columns moved under the mixer
        assert!((after[i] - before[i]).abs() > 1e-6, "rotation advanced");
        // and the oracle flight model climbed the body (throttle → vel.y)
        assert!(
            after[root + 13] - before[root + 13] > 0.2,
            "climbed: Δy = {}",
            after[root + 13] - before[root + 13]
        );
        assert!(after.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn policy_observations_are_estimator_derived_bounded_and_deterministic() {
        let run = || {
            let mut session = CoreSession::new(QUAD).unwrap();
            assert_eq!(session.policy_layout().unwrap().len(), 11);
            let initial = session.policy_observations([0.0, 1.5, 0.0]).unwrap();
            assert!(initial[7] > 1.0, "target starts above the browser twin");
            let input = InputFrame {
                throttle: 0.6,
                roll: 0.1,
                pitch: -0.05,
                yaw: 0.02,
                ..Default::default()
            };
            session.step(0.5, &input).unwrap();
            let observed = session.policy_observations([0.0, 1.5, 0.0]).unwrap();
            assert_eq!(observed.len(), 11);
            assert!(observed.iter().all(|value| value.is_finite()));
            assert!(
                (0.0..1.0).contains(&observed[9]),
                "battery sag is normalized"
            );
            assert!(observed[10] > 0.0, "motor current is model-derived");
            observed
        };
        let (left, right) = (run(), run());
        for (left, right) in left.iter().zip(right) {
            assert_eq!(left.to_bits(), right.to_bits(), "D17 observer determinism");
        }
    }

    #[test]
    fn policy_observation_fails_closed_without_estimator_authority() {
        let mut document: serde_json::Value = serde_json::from_str(QUAD).unwrap();
        document["sim"].as_object_mut().unwrap().remove("estimator");
        let session = CoreSession::new(&document.to_string()).unwrap();
        let error = session.policy_observations([0.0, 1.5, 0.0]).unwrap_err();
        assert!(error.contains("estimator block"));
    }

    #[test]
    fn biped_session_walks_with_the_oracle_gait() {
        let hrx7 = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../examples/hrx7.forge.json"
        ))
        .unwrap();
        let mut s = CoreSession::new(&hrx7).unwrap();
        let input = InputFrame {
            drive: 1.0,
            ..Default::default()
        };
        s.step(2.0, &input).unwrap();
        let root = idx(&s, "root") * 16;
        let z = s.pose_buffer()[root + 14];
        // 0.85 m/s walk target with a 0.25 s ramp ≈ 1.49 m in 2 s
        assert!((1.3..=1.6).contains(&z), "walked z = {z}");
        // knees articulate: the kn-1 node's rotation differs from rest
        let kn = idx(&s, "kn-1") * 16;
        let m = &s.pose_buffer()[kn..kn + 16];
        assert!(m.iter().all(|v| v.is_finite()));
        assert!((m[5] - 1.0).abs() > 1e-3, "knee bent (rot. y-col changed)");
    }

    #[test]
    fn quadruped_session_walks_and_articulates() {
        let mut s = CoreSession::new(QD).unwrap();
        let input = InputFrame {
            drive: 1.0,
            ..Default::default()
        };
        s.step(2.0, &input).unwrap();
        let root = idx(&s, "root") * 16;
        let z = s.pose_buffer()[root + 14];
        // v ≈ stride × cadence; after 2 s the body has clearly advanced
        assert!(z > 0.3, "body advanced, z = {z}");
        let hip = idx(&s, "hip_0l") * 16;
        let m = &s.pose_buffer()[hip..hip + 16];
        assert!(m.iter().all(|v| v.is_finite()));
    }

    #[test]
    fn jog_offsets_compose_over_the_pose_layers() {
        let hrx7 = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../examples/hrx7.forge.json"
        ))
        .unwrap();
        let run = |jog: Option<(&str, f64, f64)>| {
            let mut s = CoreSession::new(&hrx7).unwrap();
            if let Some((node, rx, ry)) = jog {
                s.set_jog(node, rx, ry);
            }
            s.step(0.5, &InputFrame::default()).unwrap();
            s.pose_buffer().to_vec()
        };
        let plain = run(None);
        let jogged = run(Some(("head", 0.0, 0.6)));
        let head = |buf: &[f32], s: &CoreSession| {
            let i = s.node_names().iter().position(|n| n == "head").unwrap();
            buf[i * 16..i * 16 + 16].to_vec()
        };
        let s = CoreSession::new(&hrx7).unwrap();
        assert_ne!(head(&plain, &s), head(&jogged, &s), "jog moved the head");
        // clearing restores the un-jogged stream
        let mut s2 = CoreSession::new(&hrx7).unwrap();
        s2.set_jog("head", 0.0, 0.6);
        s2.set_jog("head", 0.0, 0.0); // zeros clear
        s2.step(0.5, &InputFrame::default()).unwrap();
        assert_eq!(plain, s2.pose_buffer().to_vec());
    }

    #[test]
    fn sessions_are_deterministic_bit_for_bit() {
        let run = || {
            let mut s = CoreSession::new(QUAD).unwrap();
            let input = InputFrame {
                throttle: 0.43,
                yaw: 0.2,
                ..Default::default()
            };
            // uneven dts exercise the accumulator
            for dt in [0.016, 0.007, 0.033, 0.011, 0.016, 0.5] {
                s.step(dt, &input).unwrap();
            }
            s.pose_buffer().to_vec()
        };
        let (a, b) = (run(), run());
        assert_eq!(a.len(), b.len());
        for (x, y) in a.iter().zip(&b) {
            assert_eq!(x.to_bits(), y.to_bits(), "bit-identical pose streams (D17)");
        }
    }
}
