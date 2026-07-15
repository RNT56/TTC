//! FPV quad flight driver — line-faithful port of the frozen prototype's
//! VX-2 Hornet pipeline (`prototype/cad-object-studio.html`, `pose`/
//! `drvUpdate`/`post`, lines ~471–521): idle layer (hover drift, prop spin,
//! camera scan, antenna flex), angle-mode flight (velocity integration with
//! linear drag, bounded arena, tilt servos), the per-motor RPM mixer, and the
//! always-on secondary layer (world placement, camera servo settle).
//!
//! This is the *drive-mode flight model* for multirotor contracts — the
//! physics-grade propulsion stack lives in `forge-sim` (thrust tables,
//! battery sag); this layer is what the studio flies and what the oracle
//! tapes pin (P1-001). Same fidelity contract as the biped: `forge_num`
//! transcendentals for cross-target bit-exactness (D17), tolerance-banded
//! against the JS tapes. Node addressing follows the prototype naming
//! (`root`, `cam`, `ant`, spinners `s0..s3`); absent nodes are skipped.

use crate::{NodePose, PoseBuffer, Servo, StickInput};
use forge_contract::ModelSpec;

#[derive(Debug, Clone)]
pub struct FpvDriver {
    pub poses: PoseBuffer,
    root: Option<usize>,
    cam: Option<usize>,
    ant: Option<usize>,
    spin: [Option<usize>; 4],
    /// World position; starts at the hover point (0, hover, 0).
    pub pos: [f64; 3],
    pub vel: [f64; 3],
    pub yaw_h: f64,
    t_p: f64,
    t_r: f64,
    angular_rate: [f64; 3],
    spin_a: [f64; 4],
    cam_servo: [Servo; 3],
    move_target: Option<[f64; 2]>,
    /// Arena half-extent in x/z (monolith literal 1.25; `params.pen`).
    pen: f64,
    /// Hover reference height (monolith ty = 0.40) — pose offsets are
    /// relative to it.
    hover: f64,
    /// Full-stick tilt, rad (monolith literal 0.40; `params.tiltMaxRad`).
    tilt_max: f64,
    /// Yaw rate at full stick, rad/s (monolith literal 2.4; `params.yawRate`).
    yaw_rate: f64,
}

impl FpvDriver {
    pub fn new(spec: &ModelSpec) -> Self {
        let poses = PoseBuffer::from_spec(spec);
        let idx = |n: &str| poses.idx(n);
        let param = |k: &str, def: f64| {
            spec.driver
                .params
                .get(k)
                .and_then(|v| v.as_f64())
                .unwrap_or(def)
        };
        FpvDriver {
            root: idx("root"),
            cam: idx("cam"),
            ant: idx("ant"),
            spin: [idx("s0"), idx("s1"), idx("s2"), idx("s3")],
            pen: param("pen", 1.25),
            tilt_max: param("tiltMaxRad", 0.40),
            yaw_rate: param("yawRate", 2.4),
            hover: 0.40,
            poses,
            pos: [0.0, 0.40, 0.0],
            vel: [0.0; 3],
            yaw_h: 0.0,
            t_p: 0.0,
            t_r: 0.0,
            angular_rate: [0.0; 3],
            spin_a: [0.0; 4],
            cam_servo: [Servo::new(14.0, 0.85, 0.0); 3],
            move_target: None,
        }
    }

    /// Fly-to target on the ground plane (x, z); position + velocity
    /// feedback steers pitch/roll until parked within 7 cm at < 0.15 m/s.
    pub fn set_move_target(&mut self, target: Option<[f64; 2]>) {
        self.move_target = target;
    }

    /// Camera focus point (monolith drvFocus).
    pub fn focus(&self) -> [f64; 3] {
        self.pos
    }

    /// Internal motion truth consumed only by the simulation-side estimator.
    /// Browser policy callers never receive this value directly (D8).
    pub fn policy_truth(&self) -> MultirotorMotionTruth {
        MultirotorMotionTruth {
            position_m: self.pos,
            attitude_rad: [self.t_r, self.t_p, self.yaw_h],
            angular_rate_rad_s: self.angular_rate,
        }
    }

    /// Monolith drvReset: velocity only — pose, heading, tilt and servo
    /// states persist deliberately.
    pub fn reset(&mut self) {
        self.vel = [0.0; 3];
    }

    /// One fixed step: drvUpdate(dt, t) then post(dt).
    pub fn tick(&mut self, input: &StickInput, dt: f64, t: f64) {
        self.idle_pose(t);
        self.flight(input, dt);
        self.post(dt);
    }

    fn node(&mut self, i: Option<usize>) -> Option<&mut NodePose> {
        i.map(|i| &mut self.poses.poses[i])
    }

    /// pose(t): hover drift, alternating prop spin, camera scan, antenna flex.
    fn idle_pose(&mut self, t: f64) {
        use forge_num::sin;
        self.poses.reset();
        if let Some(n) = self.node(self.root) {
            n.off[1] = 0.020 * sin(t * 1.05) + 0.006 * sin(t * 2.6);
            n.rot[0] = 0.030 * sin(t * 0.68);
            n.rot[2] = 0.024 * sin(t * 0.51 + 1.2);
            n.rot[1] = 0.06 * sin(t * 0.17);
        }
        if let Some(n) = self.node(self.cam) {
            n.rot[0] = 0.028 * sin(t * 0.85) + 0.008 * sin(t * 3.1);
            n.rot[1] = 0.02 * sin(t * 0.33);
        }
        if let Some(n) = self.node(self.ant) {
            n.rot[0] = 0.055 * sin(t * 1.9 + 0.5) + 0.018 * sin(t * 5.2);
        }
        for q in 0..4 {
            let dir = if q % 2 == 1 { -1.0 } else { 1.0 };
            if let Some(n) = self.node(self.spin[q]) {
                n.rot[1] = dir * (8.5 + q as f64 * 0.6) * t;
            }
        }
    }

    /// drvUpdate after pose(t): sticks (or fly-to feedback) → drag-limited
    /// velocity integration in the bounded arena → tilt servos → mixer.
    fn flight(&mut self, input: &StickInput, dt: f64) {
        use forge_num::{cos, hypot, sin};
        let previous_attitude = [self.t_r, self.t_p, self.yaw_h];
        let mut p_in = input.mz;
        let mut r_in = input.mx;
        let y_in = input.yaw;
        let th = input.thr;
        if let Some(mt) = self.move_target {
            let ex2 = mt[0] - self.pos[0];
            let ez2 = mt[1] - self.pos[2];
            let d2 = (ex2 * ex2 + ez2 * ez2).sqrt();
            let cyw = cos(self.yaw_h);
            let syw = sin(self.yaw_h);
            let vbz = self.vel[0] * syw + self.vel[2] * cyw;
            let vbx = self.vel[0] * cyw - self.vel[2] * syw;
            if d2 < 0.07 && hypot(self.vel[0], self.vel[2]) < 0.15 {
                self.move_target = None;
            } else {
                p_in = (-1.0_f64).max(1.0_f64.min((ex2 * syw + ez2 * cyw) * 1.6 - vbz * 0.85));
                r_in = (-1.0_f64).max(1.0_f64.min((ex2 * cyw - ez2 * syw) * 1.6 - vbx * 0.85));
            }
        }
        self.yaw_h += y_in * self.yaw_rate * dt;
        let ax = sin(self.yaw_h) * p_in * 3.2 + cos(self.yaw_h) * r_in * 3.2;
        let az = cos(self.yaw_h) * p_in * 3.2 - sin(self.yaw_h) * r_in * 3.2;
        self.vel[0] += (ax - self.vel[0] * 1.7) * dt;
        self.vel[2] += (az - self.vel[2] * 1.7) * dt;
        self.vel[1] += (th * 2.6 - self.vel[1] * 2.4) * dt;
        self.pos[0] += self.vel[0] * dt;
        self.pos[1] += self.vel[1] * dt;
        self.pos[2] += self.vel[2] * dt;
        if self.pos[0] < -self.pen {
            self.pos[0] = -self.pen;
            self.vel[0] = 0.0;
        }
        if self.pos[0] > self.pen {
            self.pos[0] = self.pen;
            self.vel[0] = 0.0;
        }
        if self.pos[2] < -self.pen {
            self.pos[2] = -self.pen;
            self.vel[2] = 0.0;
        }
        if self.pos[2] > self.pen {
            self.pos[2] = self.pen;
            self.vel[2] = 0.0;
        }
        if self.pos[1] < 0.12 {
            self.pos[1] = 0.12;
            self.vel[1] = 0.0;
        }
        if self.pos[1] > 1.45 {
            self.pos[1] = 1.45;
            self.vel[1] = 0.0;
        }
        self.t_p += (p_in * self.tilt_max - self.t_p) * 1.0_f64.min(dt * 7.0);
        self.t_r += (-r_in * self.tilt_max - self.t_r) * 1.0_f64.min(dt * 7.0);
        if dt > 0.0 {
            self.angular_rate = [
                (self.t_r - previous_attitude[0]) / dt,
                (self.t_p - previous_attitude[1]) / dt,
                (self.yaw_h - previous_attitude[2]) / dt,
            ];
        }
        // mixer: per-motor RPM from throttle / pitch / roll / yaw demand
        for q in 0..4 {
            let sx3 = if q == 0 || q == 3 { 1.0 } else { -1.0 };
            let sz3 = if q < 2 { 1.0 } else { -1.0 };
            let dr = if q % 2 == 1 { -1.0 } else { 1.0 };
            let mut rpm = 8.5 + q as f64 * 0.3 + th * 1.8 + th.abs() * 1.4
                - p_in * 1.6 * sz3
                - r_in * 1.6 * sx3
                + y_in * 1.1 * dr;
            if rpm < 3.0 {
                rpm = 3.0;
            }
            self.spin_a[q] += dr * rpm * dt;
            let angle = self.spin_a[q];
            if let Some(n) = self.node(self.spin[q]) {
                n.rot[1] = angle;
            }
        }
    }

    /// post(dt): world placement (offsets relative to the hover height),
    /// flight tilt, camera servo settle.
    fn post(&mut self, dt: f64) {
        let (pos, yaw_h, t_p, t_r, hover) = (self.pos, self.yaw_h, self.t_p, self.t_r, self.hover);
        if let Some(n) = self.node(self.root) {
            n.off[0] += pos[0];
            n.off[1] += pos[1] - hover;
            n.off[2] += pos[2];
            n.rot[1] += yaw_h;
            n.rot[0] += t_p;
            n.rot[2] += t_r;
        }
        if let Some(cam) = self.cam {
            let n = &mut self.poses.poses[cam];
            for (a, servo) in self.cam_servo.iter_mut().enumerate() {
                n.rot[a] = servo.step(n.rot[a], dt);
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MultirotorMotionTruth {
    pub position_m: [f64; 3],
    pub attitude_rad: [f64; 3],
    pub angular_rate_rad_s: [f64; 3],
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DT;

    fn vx2() -> ModelSpec {
        let json = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../examples/vx2-hornet.forge.json"
        ))
        .unwrap();
        forge_contract::validate_shape(&json).unwrap()
    }

    #[test]
    fn discovers_skeleton_and_params() {
        let d = FpvDriver::new(&vx2());
        assert!(d.root.is_some() && d.cam.is_some() && d.ant.is_some());
        assert!(d.spin.iter().all(Option::is_some));
        assert_eq!((d.pen, d.tilt_max, d.yaw_rate), (1.25, 0.4, 2.4));
    }

    #[test]
    fn climbs_descends_and_respects_the_ceiling() {
        let mut d = FpvDriver::new(&vx2());
        let up = StickInput {
            thr: 1.0,
            ..Default::default()
        };
        for step in 0..600 {
            d.tick(&up, DT, (step + 1) as f64 * DT);
        }
        assert_eq!(d.pos[1], 1.45, "ceiling clamp engaged");
        let down = StickInput {
            thr: -1.0,
            ..Default::default()
        };
        for step in 600..1800 {
            d.tick(&down, DT, (step + 1) as f64 * DT);
        }
        assert_eq!(d.pos[1], 0.12, "floor clamp engaged");
        assert!(d
            .poses
            .poses()
            .iter()
            .all(|p| p.rot.iter().chain(&p.off).all(|v| v.is_finite())));
    }

    #[test]
    fn props_counter_rotate_and_never_stall() {
        let mut d = FpvDriver::new(&vx2());
        let input = StickInput::default(); // zero sticks → rpm floor (≥ 3)
        for step in 0..240 {
            d.tick(&input, DT, (step + 1) as f64 * DT);
        }
        // even index spins +, odd −, magnitudes grow monotonically
        assert!(d.spin_a[0] > 0.0 && d.spin_a[2] > 0.0);
        assert!(d.spin_a[1] < 0.0 && d.spin_a[3] < 0.0);
        for q in 0..4 {
            // ≥ rpm floor × 2 s of accumulated angle
            assert!(
                d.spin_a[q].abs() >= 3.0 * 2.0 - 1e-9,
                "q{q} {}",
                d.spin_a[q]
            );
        }
    }

    #[test]
    fn fly_to_parks_within_tolerance() {
        let mut d = FpvDriver::new(&vx2());
        d.set_move_target(Some([0.8, -0.5]));
        let input = StickInput::default();
        for step in 0..2400 {
            d.tick(&input, DT, (step + 1) as f64 * DT);
        }
        assert!(d.move_target.is_none(), "arrived and cleared");
        let dx = d.pos[0] - 0.8;
        let dz = d.pos[2] + 0.5;
        assert!((dx * dx + dz * dz).sqrt() < 0.25, "parked near the target");
    }
}
