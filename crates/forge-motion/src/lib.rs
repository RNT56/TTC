//! forge-motion — the deterministic fixed-step (120 Hz) layer stack: archetype
//! drivers, closed-form IK, critically damped servos, the quad mixer, and the
//! constraint layer. Ticked in core, render-interpolated by the face (D16).
//!
//! All math is straight from plan Appendix C — the shipped formulas. No
//! fast-math, no allocation in the tick path (D17).

#![forbid(unsafe_code)]

pub mod params;
pub mod quadruped;

use forge_contract::{Archetype, ModelSpec};

/// The canonical fixed timestep (s): 120 Hz driver tick.
pub const DT: f64 = 1.0 / 120.0;

// ---------------------------------------------------------------------------
// servo layer — critically damped second order (Appendix C)
//   ẍ = ω²(x_t − x) − 2ζω·ẋ, semi-implicit Euler; stable for ω·dt < 2.
//   Shipping range ω 14–16, ζ 0.8–0.85.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Servo {
    pub omega: f64,
    pub zeta: f64,
    pub x: f64,
    pub v: f64,
}

impl Servo {
    pub fn new(omega: f64, zeta: f64, x0: f64) -> Self {
        Servo {
            omega,
            zeta,
            x: x0,
            v: 0.0,
        }
    }

    /// Semi-implicit Euler step toward `target`.
    pub fn step(&mut self, target: f64, dt: f64) -> f64 {
        let a = self.omega * self.omega * (target - self.x) - 2.0 * self.zeta * self.omega * self.v;
        self.v += a * dt;
        self.x += self.v * dt;
        self.x
    }
}

// ---------------------------------------------------------------------------
// 2-bone leg IK (closed form, Appendix C)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LegPose {
    pub hip_pitch: f64,
    pub knee: f64,
    pub ankle: f64,
}

/// Hip-frame target (dy, dz): dy is downward reach (negative y), dz forward.
/// D = √(dy²+dz²) clamped below L1+L2; knee β = acos((D²−L1²−L2²)/2L1L2);
/// γ = atan2(dz, −dy); δ = atan2(L2 sin β, L1 + L2 cos β);
/// hip pitch = −γ−δ; level ankle = −(hip + knee).
pub fn leg_ik(l1: f64, l2: f64, dy: f64, dz: f64) -> LegPose {
    let reach_max = (l1 + l2) * 0.99999;
    let d = (dy * dy + dz * dz).sqrt().min(reach_max).max(1e-9);
    let cos_beta = ((d * d - l1 * l1 - l2 * l2) / (2.0 * l1 * l2)).clamp(-1.0, 1.0);
    let beta = forge_num::acos(cos_beta);
    let gamma = forge_num::atan2(dz, -dy);
    let delta = forge_num::atan2(l2 * forge_num::sin(beta), l1 + l2 * forge_num::cos(beta));
    let hip = -gamma - delta;
    LegPose {
        hip_pitch: hip,
        knee: beta,
        ankle: -(hip + beta),
    }
}

/// Forward kinematics of the same chain (for tests / oracle parity): returns
/// foot (dy, dz) in the hip frame. Angle convention matches `leg_ik`: at zero
/// angles the leg hangs straight down (−Y); positive pitch rotates the thigh
/// forward (+Z); the knee angle is interior (0 = straight).
pub fn leg_fk(l1: f64, l2: f64, pose: &LegPose) -> (f64, f64) {
    let t1 = pose.hip_pitch;
    let knee_dir = t1 + pose.knee;
    let dy = -(l1 * forge_num::cos(t1) + l2 * forge_num::cos(knee_dir));
    let dz = -(l1 * forge_num::sin(t1) + l2 * forge_num::sin(knee_dir));
    (dy, dz)
}

// ---------------------------------------------------------------------------
// damped-least-squares IK step (arms): Δθ = Jᵀ(JJᵀ + λ²I)⁻¹ e  (2D variant)
// ---------------------------------------------------------------------------

/// One DLS step for a planar N-joint chain with unit-length jacobian columns
/// supplied by the caller. `jac` is 2×n (rows: e_y, e_z), `err` the task-space
/// error. Returns Δθ (length n). Allocation-free for n ≤ 8.
pub fn dls_step(jac: &[[f64; 2]], err: [f64; 2], lambda: f64, dtheta: &mut [f64]) {
    // A = J·Jᵀ + λ²I  (2×2), x = A⁻¹·err, Δθ = Jᵀ·x
    let mut a00 = lambda * lambda;
    let mut a01 = 0.0;
    let mut a11 = lambda * lambda;
    for col in jac {
        a00 += col[0] * col[0];
        a01 += col[0] * col[1];
        a11 += col[1] * col[1];
    }
    let det = a00 * a11 - a01 * a01;
    let (x0, x1) = if det.abs() < 1e-12 {
        (0.0, 0.0)
    } else {
        (
            (a11 * err[0] - a01 * err[1]) / det,
            (a00 * err[1] - a01 * err[0]) / det,
        )
    };
    for (i, col) in jac.iter().enumerate() {
        dtheta[i] = col[0] * x0 + col[1] * x1;
    }
}

// ---------------------------------------------------------------------------
// quad mixer (Appendix C):
//   rpm_i = base + k_t·thr − k_p·p·s_z(i) − k_r·r·s_x(i) + k_y·y·dir(i)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MixerGains {
    pub k_t: f64,
    pub k_p: f64,
    pub k_r: f64,
    pub k_y: f64,
    pub base: f64,
}

impl Default for MixerGains {
    fn default() -> Self {
        MixerGains {
            k_t: 1.0,
            k_p: 0.25,
            k_r: 0.25,
            k_y: 0.15,
            base: 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MotorGeom {
    /// sign of the mount's x offset from CoM (−1 | +1)
    pub s_x: f64,
    /// sign of the mount's z offset from CoM (−1 | +1)
    pub s_z: f64,
    /// spin direction (+1 CCW, −1 CW)
    pub dir: f64,
}

/// Mix (throttle, pitch, roll, yaw) commands into per-motor outputs, clamped
/// to [0, 1].
pub fn mix(
    gains: &MixerGains,
    motors: &[MotorGeom],
    thr: f64,
    pitch: f64,
    roll: f64,
    yaw: f64,
    out: &mut [f64],
) {
    for (i, m) in motors.iter().enumerate() {
        let u = gains.base + gains.k_t * thr - gains.k_p * pitch * m.s_z - gains.k_r * roll * m.s_x
            + gains.k_y * yaw * m.dir;
        out[i] = u.clamp(0.0, 1.0);
    }
}

/// Derive mixer geometry from the contract's sim block: s_x/s_z from the mount
/// node's position sign, spin from `dir` (defaults alternate by index).
pub fn motor_geometry(spec: &ModelSpec) -> Vec<MotorGeom> {
    spec.sim
        .motors
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let (sx, sz) = spec
                .node(&m.mount)
                .map(|n| (sign(n.pos[0]), sign(n.pos[2])))
                .unwrap_or((1.0, 1.0));
            let dir = m
                .dir
                .map(f64::from)
                .unwrap_or(if i % 2 == 0 { 1.0 } else { -1.0 });
            MotorGeom {
                s_x: sx,
                s_z: sz,
                dir,
            }
        })
        .collect()
}

fn sign(v: f64) -> f64 {
    if v < 0.0 {
        -1.0
    } else {
        1.0
    }
}

// ---------------------------------------------------------------------------
// constraint layer — joint limits & velocity clamps
// ---------------------------------------------------------------------------

/// Clamp a per-axis joint target to the node's declared limits (radians).
pub fn clamp_to_limits(limits: &Option<[[f64; 2]; 3]>, target: [f64; 3]) -> [f64; 3] {
    match limits {
        None => target,
        Some(l) => [
            target[0].clamp(l[0][0], l[0][1]),
            target[1].clamp(l[1][0], l[1][1]),
            target[2].clamp(l[2][0], l[2][1]),
        ],
    }
}

/// Clamp an angular velocity to a joint's `maxVelRad` if declared.
pub fn clamp_velocity(max_vel_rad: Option<f64>, vel: f64) -> f64 {
    match max_vel_rad {
        Some(mv) => vel.clamp(-mv, mv),
        None => vel,
    }
}

// ---------------------------------------------------------------------------
// archetype drivers (v0: multirotor + rover; biped/quadruped/arm land with P1/P2
// gait fixtures from the prototype oracle — PRE-002)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, Default)]
pub struct InputFrame {
    pub throttle: f64,
    pub pitch: f64,
    pub roll: f64,
    pub yaw: f64,
    /// rover: forward command (−1..1) and turn rate (−1..1)
    pub drive: f64,
    pub turn: f64,
}

#[derive(Debug, Clone)]
pub struct MultirotorParams {
    pub tilt_max_rad: f64,
    pub yaw_rate: f64,
    pub gains: MixerGains,
}

impl MultirotorParams {
    /// Read driver params from the contract (`tiltMaxRad`, `yawRate`), defaults
    /// where absent.
    pub fn from_spec(spec: &ModelSpec) -> Self {
        let p = &spec.driver.params;
        MultirotorParams {
            tilt_max_rad: p.get("tiltMaxRad").and_then(|v| v.as_f64()).unwrap_or(0.4),
            yaw_rate: p.get("yawRate").and_then(|v| v.as_f64()).unwrap_or(2.4),
            gains: MixerGains::default(),
        }
    }
}

/// Angle-mode multirotor driver state: servo-filtered attitude targets feeding
/// the mixer. Physics-coupling (forces) arrives with `forge-sim` at P6.
#[derive(Debug, Clone)]
pub struct MultirotorDriver {
    pub params: MultirotorParams,
    pub motors: Vec<MotorGeom>,
    pitch_servo: Servo,
    roll_servo: Servo,
    pub heading: f64,
}

impl MultirotorDriver {
    pub fn new(spec: &ModelSpec) -> Self {
        MultirotorDriver {
            params: MultirotorParams::from_spec(spec),
            motors: motor_geometry(spec),
            pitch_servo: Servo::new(15.0, 0.85, 0.0),
            roll_servo: Servo::new(15.0, 0.85, 0.0),
            heading: 0.0,
        }
    }

    /// One 120 Hz tick: stick input → attitude targets → per-motor u ∈ [0,1].
    pub fn tick(&mut self, input: &InputFrame, dt: f64, motor_out: &mut [f64]) {
        let pitch = self
            .pitch_servo
            .step(input.pitch * self.params.tilt_max_rad, dt);
        let roll = self
            .roll_servo
            .step(input.roll * self.params.tilt_max_rad, dt);
        self.heading += input.yaw * self.params.yaw_rate * dt;
        mix(
            &self.params.gains,
            &self.motors,
            input.throttle,
            pitch,
            roll,
            input.yaw,
            motor_out,
        );
    }
}

/// Differential-drive rover kinematics: wheel speeds and pose integration.
#[derive(Debug, Clone)]
pub struct RoverDriver {
    pub wheelbase_m: f64,
    pub max_speed_ms: f64,
    /// pose: x, z, heading
    pub pose: [f64; 3],
}

impl RoverDriver {
    pub fn new(spec: &ModelSpec) -> Self {
        let p = &spec.driver.params;
        RoverDriver {
            wheelbase_m: p.get("wheelbaseM").and_then(|v| v.as_f64()).unwrap_or(0.2),
            max_speed_ms: p.get("maxSpeedMs").and_then(|v| v.as_f64()).unwrap_or(1.0),
            pose: [0.0; 3],
        }
    }

    /// Returns (left, right) wheel surface speeds (m/s) and integrates pose.
    pub fn tick(&mut self, input: &InputFrame, dt: f64) -> (f64, f64) {
        let v = input.drive.clamp(-1.0, 1.0) * self.max_speed_ms;
        let w = input.turn.clamp(-1.0, 1.0) * (2.0 * self.max_speed_ms / self.wheelbase_m) * 0.5;
        let left = v - w * self.wheelbase_m / 2.0;
        let right = v + w * self.wheelbase_m / 2.0;
        self.pose[2] += w * dt;
        self.pose[0] += v * forge_num::sin(self.pose[2]) * dt;
        self.pose[1] += v * forge_num::cos(self.pose[2]) * dt;
        (left, right)
    }
}

/// Smoke-level driver dispatch used by BEH-001.
pub fn supported_archetype(a: &Archetype) -> bool {
    matches!(
        a,
        Archetype::Multirotor | Archetype::Rover | Archetype::Quadruped
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn servo_is_stable_at_dt_50ms() {
        // BEH-002: no oscillation growth at dt = 50 ms with shipping constants.
        let mut s = Servo::new(15.0, 0.85, 0.0);
        let mut peak: f64 = 0.0;
        for _ in 0..400 {
            let x = s.step(1.0, 0.05);
            peak = peak.max(x.abs());
            assert!(x.is_finite());
        }
        assert!((s.x - 1.0).abs() < 1e-3, "servo settles, got {}", s.x);
        assert!(peak < 1.6, "bounded overshoot, peak {peak}");
    }

    #[test]
    fn servo_converges_fast_at_120hz() {
        let mut s = Servo::new(15.0, 0.85, 0.0);
        for _ in 0..120 {
            s.step(1.0, DT);
        }
        assert!((s.x - 1.0).abs() < 0.01);
    }

    #[test]
    fn leg_ik_round_trips_through_fk() {
        let (l1, l2) = (0.42, 0.41);
        for (dy, dz) in [(-0.70, 0.10), (-0.55, -0.15), (-0.80, 0.0), (-0.40, 0.25)] {
            let pose = leg_ik(l1, l2, dy, dz);
            let (fy, fz) = leg_fk(l1, l2, &pose);
            assert!(
                (fy - dy).abs() < 1e-9 && (fz - dz).abs() < 1e-9,
                "target ({dy},{dz}) → fk ({fy},{fz}) pose {pose:?}"
            );
            // ankle keeps the foot level: hip + knee + ankle = 0
            assert!((pose.hip_pitch + pose.knee + pose.ankle).abs() < 1e-12);
        }
    }

    #[test]
    fn leg_ik_clamps_overreach() {
        // the 1e-5 reach clamp leaves ~0.009 rad of bend (acos is sqrt-sensitive
        // near full extension) — assert "nearly straight", not exactly straight
        let pose = leg_ik(0.5, 0.5, -2.0, 0.0);
        assert!(
            pose.knee.abs() < 0.02,
            "nearly straight at full reach, knee = {}",
            pose.knee
        );
    }

    #[test]
    fn mixer_symmetry() {
        let motors = [
            MotorGeom {
                s_x: 1.0,
                s_z: 1.0,
                dir: 1.0,
            },
            MotorGeom {
                s_x: -1.0,
                s_z: 1.0,
                dir: -1.0,
            },
            MotorGeom {
                s_x: -1.0,
                s_z: -1.0,
                dir: 1.0,
            },
            MotorGeom {
                s_x: 1.0,
                s_z: -1.0,
                dir: -1.0,
            },
        ];
        let g = MixerGains::default();
        let mut out = [0.0; 4];
        // pure throttle → all equal
        mix(&g, &motors, 0.5, 0.0, 0.0, 0.0, &mut out);
        assert!(out.iter().all(|u| (*u - 0.5).abs() < 1e-12));
        // pure pitch → front pair vs back pair differ, sum preserved
        mix(&g, &motors, 0.5, 0.4, 0.0, 0.0, &mut out);
        let sum: f64 = out.iter().sum();
        assert!((sum - 2.0).abs() < 1e-12);
        assert!((out[0] - out[3]).abs() > 1e-9, "pitch splits by s_z");
        // pure yaw → splits by spin direction
        mix(&g, &motors, 0.5, 0.0, 0.0, 0.5, &mut out);
        assert!((out[0] - out[1]).abs() > 1e-9);
    }

    #[test]
    fn dls_reduces_error() {
        // two-joint planar arm, both jacobian columns unit-ish
        let jac = [[0.0, 1.0], [1.0, 0.0]];
        let mut d = [0.0; 2];
        dls_step(&jac, [0.2, -0.1], 0.1, &mut d);
        // moving by Δθ should oppose the error through Jᵀ
        assert!(d[0] < 0.0 && d[1] > 0.0);
    }

    #[test]
    fn limits_clamp() {
        let limits = Some([[-0.5, 0.5], [-1.0, 1.0], [0.0, 0.0]]);
        let out = clamp_to_limits(&limits, [2.0, -0.3, 0.7]);
        assert_eq!(out, [0.5, -0.3, 0.0]);
        assert_eq!(clamp_velocity(Some(3.0), -5.0), -3.0);
    }

    #[test]
    fn rover_tracks_a_straight_meter() {
        let spec = forge_contract::validate_shape(
            r##"{"meta":{"id":"r","name":"r","version":"2.1.0","archetype":"rover",
                 "provenance":{"kind":"human"},"license":"CC0"},
                 "skeleton":[{"name":"root","parent":null,"pos":[0,0,0]}],
                 "parts":[{"node":"root","geom":{"kind":"box","w":0.2,"h":0.05,"d":0.3},
                           "material":"matte","color":"#333333"}],
                 "driver":{"archetype":"rover","params":{"maxSpeedMs":1.0}}}"##,
        )
        .unwrap();
        let mut rover = RoverDriver::new(&spec);
        let input = InputFrame {
            drive: 1.0,
            ..Default::default()
        };
        for _ in 0..120 {
            let (l, r) = rover.tick(&input, DT);
            assert!((l - r).abs() < 1e-12, "straight drive keeps wheels equal");
        }
        // 1 m/s for 1 s → 1 m forward (z axis), within integrator tolerance
        assert!((rover.pose[1] - 1.0).abs() < 1e-6, "z = {}", rover.pose[1]);
        assert!(rover.pose[0].abs() < 1e-9);
    }
}
