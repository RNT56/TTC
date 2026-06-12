//! Biped driver — line-faithful port of the frozen prototype's HRX-7
//! locomotion pipeline (`prototype/cad-object-studio.html`, `pose`/`legIK`/
//! `drvUpdate`/`post`, lines ~286–371): idle layer (breathing, head scan, arm
//! sway), phase-gait locomotion with analytic 2-bone leg IK, then the
//! always-on secondary layer (world placement, head-scan detents, critically
//! damped servo settle on head/arms, actuator telltales).
//!
//! Fidelity contract (P1-001): bit-exact across our targets (every
//! transcendental routes through `forge_num`, D17); tolerance-banded against
//! the JS oracle tapes in `prototype/trajectories/` (JS engine libm differs
//! from ours by ULPs — see `tests/tape_parity.rs` for the measured band).
//!
//! Node addressing follows the prototype's skeleton naming (`root`, `chest`,
//! `head`, `sh±1`, `el±1`, `ha±1`, `hp±1`, `kn±1`, `an±1`, `kx±1`, `ex±1`);
//! nodes absent from the contract are skipped. Expression groupings below
//! intentionally mirror the JS source so the FP op order is identical.

use crate::{NodePose, PoseBuffer, Servo, StickInput};
use forge_contract::ModelSpec;

/// −1 / +1 side suffixes in monolith order.
const SIDES: [i32; 2] = [-1, 1];
/// Monolith servo map insertion order: head, sh-1, sh1, el-1, el1, ha-1, ha1.
const SERVO_NODES: [&str; 7] = ["head", "sh-1", "sh1", "el-1", "el1", "ha-1", "ha1"];

#[allow(clippy::approx_constant)] // the monolith's literal TAU, kept verbatim for oracle fidelity
const TAU_M: f64 = 6.2831853;

#[derive(Debug, Clone)]
pub struct BipedDriver {
    pub poses: PoseBuffer,
    // cached node indices (None = node absent from this contract)
    root: Option<usize>,
    chest: Option<usize>,
    head: Option<usize>,
    sh: [Option<usize>; 2],
    el: [Option<usize>; 2],
    ha: [Option<usize>; 2],
    hp: [Option<usize>; 2],
    kn: [Option<usize>; 2],
    an: [Option<usize>; 2],
    kx: [Option<usize>; 2],
    ex: [Option<usize>; 2],
    servos: Vec<(usize, [Servo; 3])>,
    /// Thigh / shank lengths (monolith L1 = L2 = 0.39), from the skeleton.
    l1: f64,
    l2: f64,
    /// Walkable square half-extent (monolith literal 2.35; `params.pen`).
    pen: f64,
    // drive state (monolith globals pos/heading/speed/wWalk/phase)
    pub pos: [f64; 2],
    pub heading: f64,
    speed: f64,
    w_walk: f64,
    phase: f64,
    move_target: Option<[f64; 2]>,
}

impl BipedDriver {
    pub fn new(spec: &ModelSpec) -> Self {
        let poses = PoseBuffer::from_spec(spec);
        let idx = |n: &str| poses.idx(n);
        let side_idx = |stem: &str| SIDES.map(|s| idx(&format!("{stem}{s}")));
        let servos = SERVO_NODES
            .iter()
            .filter_map(|n| idx(n))
            .map(|i| (i, [Servo::new(16.0, 0.8, 0.0); 3]))
            .collect();
        let leg_len =
            |n: &str, default: f64| spec.node(n).map(|n| n.pos[1].abs()).unwrap_or(default);
        BipedDriver {
            root: idx("root"),
            chest: idx("chest"),
            head: idx("head"),
            sh: side_idx("sh"),
            el: side_idx("el"),
            ha: side_idx("ha"),
            hp: side_idx("hp"),
            kn: side_idx("kn"),
            an: side_idx("an"),
            kx: side_idx("kx"),
            ex: side_idx("ex"),
            servos,
            l1: leg_len("kn-1", 0.39),
            l2: leg_len("an-1", 0.39),
            pen: spec
                .driver
                .params
                .get("pen")
                .and_then(|v| v.as_f64())
                .unwrap_or(2.35),
            poses,
            pos: [0.0; 2],
            heading: 0.0,
            speed: 0.0,
            w_walk: 0.0,
            phase: 0.0,
            move_target: None,
        }
    }

    /// Click-to-move target on the ground plane (x, z); the arrive behavior
    /// clears it within 9 cm.
    pub fn set_move_target(&mut self, target: Option<[f64; 2]>) {
        self.move_target = target;
    }

    /// Camera focus point (monolith drvFocus).
    pub fn focus(&self) -> [f64; 3] {
        [self.pos[0], 0.88, self.pos[1]]
    }

    /// Monolith drvReset: speed and gait blend only — pose, heading and servo
    /// states persist deliberately.
    pub fn reset(&mut self) {
        self.speed = 0.0;
        self.w_walk = 0.0;
    }

    /// One fixed step: drvUpdate(dt, t) (idle pose + locomotion) then post(dt)
    /// (world placement, detents, servo settle, telltales).
    pub fn tick(&mut self, input: &StickInput, cam_forward: [f64; 3], dt: f64, t: f64) {
        self.idle_pose(t);
        self.drive(input, cam_forward, dt);
        self.post(dt);
    }

    fn rot(&mut self, i: Option<usize>) -> Option<&mut NodePose> {
        i.map(|i| &mut self.poses.poses[i])
    }

    /// pose(t): breathing, head scan, arm sway. Resets every channel first.
    fn idle_pose(&mut self, t: f64) {
        use forge_num::sin;
        self.poses.reset();
        if let Some(n) = self.rot(self.root) {
            n.off[1] = 0.010 * sin(t * 1.5);
            n.rot[1] = 0.025 * sin(t * 0.22);
        }
        if let Some(n) = self.rot(self.chest) {
            n.rot[0] = 0.014 * sin(t * 1.5 + 0.5);
        }
        if let Some(n) = self.rot(self.head) {
            n.rot[1] = 0.20 * sin(t * 0.35) + 0.05 * sin(t * 1.0);
            n.rot[0] = 0.04 * sin(t * 0.26);
        }
        if let Some(n) = self.rot(self.sh[0]) {
            n.rot[0] = 0.05 * sin(t * 1.5 + std::f64::consts::PI);
            n.rot[2] = -0.015 * sin(t * 0.9);
        }
        if let Some(n) = self.rot(self.sh[1]) {
            n.rot[0] = 0.05 * sin(t * 1.5);
            n.rot[2] = 0.015 * sin(t * 0.9 + 1.0);
        }
        if let Some(n) = self.rot(self.el[0]) {
            n.rot[0] = -0.22 - 0.04 * sin(t * 1.5 + 1.0);
        }
        if let Some(n) = self.rot(self.el[1]) {
            n.rot[0] = -0.34 - 0.05 * sin(t * 1.5 + 2.1);
        }
        if let Some(n) = self.rot(self.ha[0]) {
            n.rot[0] = -0.08;
        }
        if let Some(n) = self.rot(self.ha[1]) {
            n.rot[0] = -0.10;
        }
    }

    /// legIK(s, dy, dz): monolith's closed-form variant — reach clamped to
    /// L1+L2−0.004, cos β clamped to ±1, foot kept under the hip plane.
    fn leg_ik(&mut self, side: usize, dy: f64, dz: f64) {
        let (l1, l2) = (self.l1, self.l2);
        let mut d = (dy * dy + dz * dz).sqrt();
        let m_d = l1 + l2 - 0.004;
        if d > m_d {
            d = m_d;
        }
        let cb = ((d * d - l1 * l1 - l2 * l2) / (2.0 * l1 * l2)).clamp(-1.0, 1.0);
        let beta = forge_num::acos(cb);
        let gamma = forge_num::atan2(dz, -dy);
        let delta = forge_num::atan2(l2 * forge_num::sin(beta), l1 + l2 * forge_num::cos(beta));
        if let Some(n) = self.rot(self.hp[side]) {
            n.rot[0] = -gamma - delta;
        }
        if let Some(n) = self.rot(self.kn[side]) {
            n.rot[0] = beta;
        }
    }

    /// drvUpdate after pose(t): arrive / camera-relative sticks → heading
    /// spring → speed ramp → bounded world integration → blended phase gait.
    fn drive(&mut self, input: &StickInput, cam_forward: [f64; 3], dt: f64) {
        use forge_num::{atan2, cos, hypot, sin};
        let mut tgt = 0.0;
        let mut dirx = 0.0;
        let mut dirz = 0.0;
        let max_s = if input.run { 1.5 } else { 0.85 };
        if let Some(mt) = self.move_target {
            let ex2 = mt[0] - self.pos[0];
            let ez2 = mt[1] - self.pos[1];
            let d2 = (ex2 * ex2 + ez2 * ez2).sqrt();
            if d2 < 0.09 {
                self.move_target = None;
            } else {
                dirx = ex2 / d2;
                dirz = ez2 / d2;
                tgt = (d2 * 1.6).min(max_s);
            }
        }
        if input.mx != 0.0 || input.mz != 0.0 {
            let cy2 = atan2(cam_forward[0], cam_forward[2]);
            dirx = sin(cy2) * input.mz + cos(cy2) * input.mx;
            dirz = cos(cy2) * input.mz - sin(cy2) * input.mx;
            let dl = (dirx * dirx + dirz * dirz).sqrt();
            let dl = if dl == 0.0 { 1.0 } else { dl };
            dirx /= dl;
            dirz /= dl;
            tgt = max_s * 1.0_f64.min(hypot(input.mx, input.mz));
            self.move_target = None;
        }
        if tgt > 0.02 {
            let want = atan2(dirx, dirz);
            let mut d3 = want - self.heading;
            while d3 > std::f64::consts::PI {
                d3 -= TAU_M;
            }
            while d3 < -std::f64::consts::PI {
                d3 += TAU_M;
            }
            self.heading += d3 * 1.0_f64.min(dt * 6.0);
            tgt *= 0.25_f64.max(1.0 - d3.abs() * 0.45);
        }
        self.heading += input.yaw * 2.2 * dt;
        self.speed += (tgt - self.speed) * 1.0_f64.min(dt * 4.0);
        if self.speed < 0.004 {
            self.speed = 0.0;
        }
        self.pos[0] += sin(self.heading) * self.speed * dt;
        self.pos[1] += cos(self.heading) * self.speed * dt;
        self.pos[0] = (-self.pen).max(self.pen.min(self.pos[0]));
        self.pos[1] = (-self.pen).max(self.pen.min(self.pos[1]));

        // gait layer (blended by wWalk)
        let w_t = 1.0_f64.min(self.speed / 0.3);
        self.w_walk += (w_t - self.w_walk) * 1.0_f64.min(dt * 6.0);
        let w = self.w_walk;
        let f = 0.95 + self.speed * 0.55;
        self.phase += dt * f * TAU_M;
        let amp = (0.34_f64).min(self.speed / (4.0 * f)) + 0.015 * w;
        let lift = (0.045 + 0.05 * self.speed) * w;
        let heading = self.heading;
        let speed = self.speed;
        let phase = self.phase;
        if let Some(n) = self.rot(self.root) {
            n.off[1] += -0.02 * w + 0.02 * w * cos(2.0 * phase);
            let swy = 0.014 * w * sin(phase);
            n.off[0] += swy * cos(heading);
            n.off[2] -= swy * sin(heading);
        }
        if let Some(n) = self.rot(self.chest) {
            n.rot[1] = -0.09 * w * sin(phase);
        }
        if let Some(n) = self.rot(self.head) {
            n.rot[1] += 0.07 * w * sin(phase);
        }
        let off1 = self.root.map(|i| self.poses.poses[i].off[1]).unwrap_or(0.0);
        for (side, s) in SIDES.iter().enumerate() {
            let ps = phase + if *s < 0 { 0.0 } else { std::f64::consts::PI };
            let fz = amp * cos(ps);
            let fh = lift * 0.0_f64.max(-sin(ps));
            self.leg_ik(side, (0.105 + fh) - (0.885 + off1), fz);
            let hip_knee = self.hp[side]
                .map(|i| self.poses.poses[i].rot[0])
                .unwrap_or(0.0)
                + self.kn[side]
                    .map(|i| self.poses.poses[i].rot[0])
                    .unwrap_or(0.0);
            if let Some(n) = self.rot(self.an[side]) {
                n.rot[0] = -hip_knee - 0.22 * w * 0.0_f64.max(-sin(ps));
            }
            let swing = 0.34 * cos(ps) * (0.3 + 0.7 * 1.0_f64.min(speed / 0.9)) * w;
            if let Some(n) = self.rot(self.sh[side]) {
                n.rot[0] = n.rot[0] * (1.0 - w) + swing;
            }
            if let Some(n) = self.rot(self.el[side]) {
                n.rot[0] = n.rot[0] * (1.0 - w) + (-0.30 - 0.30 * 0.0_f64.max(-cos(ps))) * w;
            }
        }
    }

    /// post(dt): world placement, head-scan detent, servo settle, telltales.
    fn post(&mut self, dt: f64) {
        let (px, pz, heading) = (self.pos[0], self.pos[1], self.heading);
        if let Some(n) = self.rot(self.root) {
            n.off[0] += px;
            n.off[2] += pz;
            n.rot[1] += heading;
        }
        if let Some(n) = self.rot(self.head) {
            n.rot[1] = forge_num::js_round(n.rot[1] / 0.06) * 0.06;
        }
        for (i, servos) in &mut self.servos {
            let n = &mut self.poses.poses[*i];
            for (a, servo) in servos.iter_mut().enumerate() {
                n.rot[a] = servo.step(n.rot[a], dt);
            }
        }
        for side in 0..2 {
            let kn = self.kn[side]
                .map(|i| self.poses.poses[i].rot[0])
                .unwrap_or(0.0);
            if let Some(n) = self.rot(self.kx[side]) {
                n.rot[0] = -kn * 2.6;
            }
            let el = self.el[side]
                .map(|i| self.poses.poses[i].rot[0])
                .unwrap_or(0.0);
            if let Some(n) = self.rot(self.ex[side]) {
                n.rot[0] = el * 2.6;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DT;

    fn hrx7() -> ModelSpec {
        let json = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../examples/hrx7.forge.json"
        ))
        .unwrap();
        forge_contract::validate_shape(&json).unwrap()
    }

    #[test]
    fn discovers_skeleton_and_leg_lengths() {
        let d = BipedDriver::new(&hrx7());
        assert!(d.root.is_some() && d.head.is_some());
        assert!(d.sh.iter().all(Option::is_some) && d.kn.iter().all(Option::is_some));
        assert_eq!(d.servos.len(), 7);
        assert_eq!((d.l1, d.l2), (0.39, 0.39));
        assert_eq!(d.pen, 2.35);
    }

    #[test]
    fn walks_forward_and_clamps_to_pen() {
        let mut d = BipedDriver::new(&hrx7());
        let input = StickInput {
            mz: 1.0,
            run: true,
            ..Default::default()
        };
        // run forward for 10 s — far enough to hit the +z fence at 2.35 m
        for step in 0..1200 {
            d.tick(&input, [0.0, 0.0, 1.0], DT, (step + 1) as f64 * DT);
        }
        assert_eq!(d.pos[1], 2.35, "clamped at the pen edge");
        assert!(d.pos[0].abs() < 1e-6, "no lateral drift, x = {}", d.pos[0]);
        let root = d.poses.get("root").unwrap();
        assert!((root.off[2] - 2.35).abs() < 0.05, "world placement applied");
        assert!(d
            .poses
            .poses()
            .iter()
            .all(|p| p.rot.iter().chain(&p.off).all(|v| v.is_finite())));
    }

    #[test]
    fn move_target_arrives_and_clears() {
        let mut d = BipedDriver::new(&hrx7());
        d.set_move_target(Some([0.6, 0.4]));
        let input = StickInput::default();
        for step in 0..1800 {
            d.tick(&input, [0.0, 0.0, 1.0], DT, (step + 1) as f64 * DT);
        }
        assert!(d.move_target.is_none(), "arrive cleared the target");
        let dx = d.pos[0] - 0.6;
        let dz = d.pos[1] - 0.4;
        assert!((dx * dx + dz * dz).sqrt() < 0.09 + 1e-9);
    }
}
