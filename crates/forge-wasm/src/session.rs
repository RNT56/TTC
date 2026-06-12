//! CoreSession — the `tick` boundary call (architecture §2): fixed-step motion
//! advanced in core, pose matrices written to a flat buffer the render layer
//! interpolates from. Deterministic: same contract + same input sequence →
//! bit-identical pose streams (D17; golden-number corpus member).

use forge_contract::ModelSpec;
use forge_geometry::{body_offset, node_world_posed, node_world_with_joints, Mat4};
use forge_motion::biped::BipedDriver;
use forge_motion::fpv::FpvDriver;
use forge_motion::quadruped::QuadrupedDriver;
use forge_motion::{InputFrame, RoverDriver, StickInput, DT};
use std::collections::BTreeMap;

/// Drive-mode camera-flat forward for stick-to-world mapping; the face owns
/// camera-relative input later (P1-013) — core pins world +Z, the same basis
/// the oracle tapes were recorded under.
const CAM_FORWARD: [f64; 3] = [0.0, 0.0, 1.0];

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
            forge_contract::Archetype::Multirotor => DriverState::Multirotor(FpvDriver::new(&spec)),
            forge_contract::Archetype::Biped => DriverState::Biped(BipedDriver::new(&spec)),
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
                let world = node_world_posed(&self.spec, &Self::pose_map(&driver.poses))
                    .map_err(|e| e.to_string())?;
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
                let world = node_world_posed(&self.spec, &Self::pose_map(&driver.poses))
                    .map_err(|e| e.to_string())?;
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
