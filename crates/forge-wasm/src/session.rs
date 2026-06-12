//! CoreSession — the `tick` boundary call (architecture §2): fixed-step motion
//! advanced in core, pose matrices written to a flat buffer the render layer
//! interpolates from. Deterministic: same contract + same input sequence →
//! bit-identical pose streams (D17; golden-number corpus member).

use forge_contract::ModelSpec;
use forge_geometry::{body_offset, node_world_with_joints, Mat4};
use forge_motion::quadruped::QuadrupedDriver;
use forge_motion::{clamp_velocity, InputFrame, MultirotorDriver, RoverDriver, DT};
use std::collections::BTreeMap;

enum DriverState {
    Multirotor {
        driver: MultirotorDriver,
        motor_out: Vec<f64>,
        /// (spinner node, spin direction, max rad/s) per motor index.
        spinners: Vec<(String, f64, f64)>,
        angles: BTreeMap<String, f64>,
    },
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
    accumulator: f64,
    /// 16 f32 per node, column-major, written every completed fixed step.
    pose: Vec<f32>,
    pub ticks: u64,
}

impl CoreSession {
    pub fn new(contract_json: &str) -> Result<Self, String> {
        let spec = forge_contract::validate_shape(contract_json).map_err(|e| e.to_string())?;
        let node_names: Vec<String> = spec.skeleton.iter().map(|n| n.name.clone()).collect();

        let driver = match spec.meta.archetype {
            forge_contract::Archetype::Multirotor => {
                let driver = MultirotorDriver::new(&spec);
                // spinner = revolute child of each motor mount
                let spinners = spec
                    .sim
                    .motors
                    .iter()
                    .enumerate()
                    .filter_map(|(i, m)| {
                        let spinner = spec.skeleton.iter().find(|n| {
                            n.parent.as_deref() == Some(m.mount.as_str())
                                && n.joint
                                    .as_ref()
                                    .map(|j| matches!(j.kind, forge_contract::JointKind::Revolute))
                                    .unwrap_or(false)
                        })?;
                        let max_vel = spinner
                            .joint
                            .as_ref()
                            .and_then(|j| j.max_vel_rad)
                            .unwrap_or(300.0);
                        let dir =
                            m.dir
                                .map(f64::from)
                                .unwrap_or(if i % 2 == 0 { 1.0 } else { -1.0 });
                        Some((spinner.name.clone(), dir, max_vel))
                    })
                    .collect::<Vec<_>>();
                let n = spec.sim.motors.len();
                DriverState::Multirotor {
                    driver,
                    motor_out: vec![0.0; n],
                    spinners,
                    angles: BTreeMap::new(),
                }
            }
            forge_contract::Archetype::Rover => DriverState::Rover(RoverDriver::new(&spec)),
            forge_contract::Archetype::Quadruped => DriverState::Quadruped {
                driver: QuadrupedDriver::new(&spec),
                angles: BTreeMap::new(),
            },
            _ => DriverState::Static,
        };

        let mut session = CoreSession {
            pose: vec![0.0; node_names.len() * 16],
            node_names,
            spec,
            driver,
            accumulator: 0.0,
            ticks: 0,
        };
        session.write_pose(None, &BTreeMap::new())?;
        Ok(session)
    }

    pub fn node_names(&self) -> &[String] {
        &self.node_names
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
        match &mut self.driver {
            DriverState::Multirotor {
                driver,
                motor_out,
                spinners,
                angles,
            } => {
                driver.tick(input, DT, motor_out);
                for (i, (node, dir, max_vel)) in spinners.iter().enumerate() {
                    let u = motor_out.get(i).copied().unwrap_or(0.0);
                    let rate = clamp_velocity(Some(*max_vel), dir * u * max_vel);
                    *angles.entry(node.clone()).or_insert(0.0) += rate * DT;
                }
                let angles = angles.clone();
                self.write_pose(None, &angles)
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

    fn write_pose(
        &mut self,
        root_offset: Option<Mat4>,
        angles: &BTreeMap<String, f64>,
    ) -> Result<(), String> {
        let world = node_world_with_joints(&self.spec, angles, root_offset.as_ref())
            .map_err(|e| e.to_string())?;
        for (i, name) in self.node_names.iter().enumerate() {
            if let Some(m) = world.get(name) {
                for (k, v) in m.iter().enumerate() {
                    self.pose[i * 16 + k] = *v as f32;
                }
            }
        }
        Ok(())
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
    fn multirotor_spinners_spin_under_throttle() {
        let mut s = CoreSession::new(QUAD).unwrap();
        let before: Vec<f32> = s.pose_buffer().to_vec();
        let input = InputFrame {
            throttle: 0.6,
            ..Default::default()
        };
        let steps = s.step(1.0, &input).unwrap();
        assert_eq!(steps, 120, "one second = 120 fixed steps");
        let i = idx(&s, "s0") * 16;
        let after = s.pose_buffer();
        // the spinner's rotation columns moved; its translation did not
        assert!((after[i] - before[i]).abs() > 1e-6, "rotation advanced");
        assert!(
            (after[i + 12] - before[i + 12]).abs() < 1e-6,
            "translation fixed"
        );
        assert!(after.iter().all(|v| v.is_finite()));
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
