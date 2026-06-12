//! Golden-number support (XT-001, D17): canonical scenes hashed inside the
//! core so native and WASM outputs compare bit-for-bit without any
//! serialization ambiguity. The hash is FNV-1a 64 over the exact bit patterns
//! of the f32 buffers — if a single ULP differs anywhere, the hash differs.
//!
//! The scripted input tape below is part of the corpus definition: changing it
//! is a golden-suite version bump, never a silent edit.

use crate::session::CoreSession;
use forge_motion::InputFrame;

const FNV_OFFSET: u64 = 0xcbf29ce484222325;
const FNV_PRIME: u64 = 0x100000001b3;

#[derive(Debug, Clone, Default)]
pub struct Fnv1a(u64);

impl Fnv1a {
    pub fn new() -> Self {
        Fnv1a(FNV_OFFSET)
    }
    pub fn update_bytes(&mut self, bytes: &[u8]) {
        for b in bytes {
            self.0 ^= u64::from(*b);
            self.0 = self.0.wrapping_mul(FNV_PRIME);
        }
    }
    pub fn update_f32s(&mut self, values: &[f32]) {
        for v in values {
            self.update_bytes(&v.to_bits().to_le_bytes());
        }
    }
    pub fn update_u32s(&mut self, values: &[u32]) {
        for v in values {
            self.update_bytes(&v.to_le_bytes());
        }
    }
    pub fn finish(&self) -> u64 {
        self.0
    }
}

/// The scripted input tape: deterministic, exercises every v0 driver path.
/// 600 fixed steps at 120 Hz (5 s): throttle/drive ramp, then yaw/turn, then
/// release. Inputs are exact dyadic fractions so the tape itself carries no
/// parse ambiguity.
fn scripted_input(step: u32) -> InputFrame {
    let phase = step / 150; // four 1.25 s phases
    match phase {
        0 => InputFrame {
            throttle: 0.5,
            drive: 0.5,
            ..Default::default()
        },
        1 => InputFrame {
            throttle: 0.75,
            drive: 1.0,
            yaw: 0.25,
            turn: 0.25,
            ..Default::default()
        },
        2 => InputFrame {
            throttle: 0.625,
            drive: 0.75,
            pitch: 0.125,
            ..Default::default()
        },
        _ => InputFrame::default(),
    }
}

pub const GOLDEN_STEPS: u32 = 600;
pub const GOLDEN_SUITE_VERSION: &str = "1";

/// Run the canonical scene for one contract: bake hash + tick-stream hash.
/// Returns a small JSON report; identical strings across targets = pass.
pub fn golden_report(contract_json: &str) -> Result<String, String> {
    let spec = forge_contract::validate_shape(contract_json).map_err(|e| e.to_string())?;
    let baked = forge_geometry::bake(&spec).map_err(|e| e.to_string())?;

    let mut bake_hash = Fnv1a::new();
    for part in &baked.parts {
        bake_hash.update_f32s(&part.mesh.positions);
        bake_hash.update_f32s(&part.mesh.normals);
        bake_hash.update_u32s(&part.mesh.indices);
    }
    for m in baked.node_world.values() {
        let as_f32: Vec<f32> = m.iter().map(|v| *v as f32).collect();
        bake_hash.update_f32s(&as_f32);
    }

    let mut session = CoreSession::new(contract_json)?;
    let mut tick_hash = Fnv1a::new();
    let dt = 1.0 / 120.0;
    for step in 0..GOLDEN_STEPS {
        session.step(dt, &scripted_input(step))?;
        tick_hash.update_f32s(session.pose_buffer());
    }

    Ok(format!(
        "{{\"suite\":\"{}\",\"id\":\"{}\",\"steps\":{},\"counts\":{{\"parts\":{},\"faces\":{},\"vertices\":{}}},\"bakeHash\":\"{:016x}\",\"tickHash\":\"{:016x}\"}}",
        GOLDEN_SUITE_VERSION,
        spec.meta.id,
        GOLDEN_STEPS,
        baked.parts.len(),
        baked.total_polygons,
        baked.total_vertices,
        bake_hash.finish(),
        tick_hash.finish(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn golden_reports_are_deterministic() {
        let doc = include_str!("../../../examples/vx2-mini.forge.json");
        let a = golden_report(doc).unwrap();
        let b = golden_report(doc).unwrap();
        assert_eq!(a, b, "same input → identical report");
        assert!(a.contains("bakeHash") && a.contains("tickHash"));
    }

    #[test]
    fn hash_is_ulp_sensitive() {
        let mut a = Fnv1a::new();
        a.update_f32s(&[1.0f32]);
        let mut b = Fnv1a::new();
        b.update_f32s(&[f32::from_bits(1.0f32.to_bits() + 1)]);
        assert_ne!(a.finish(), b.finish(), "one ULP must change the hash");
    }

    #[test]
    fn all_four_examples_produce_reports() {
        for doc in [
            include_str!("../../../examples/vx2-mini.forge.json"),
            include_str!("../../../examples/qd-mini.forge.json"),
            include_str!("../../../examples/hrx7.forge.json"),
            include_str!("../../../examples/vx2-hornet.forge.json"),
        ] {
            let r = golden_report(doc).unwrap();
            assert!(r.contains("tickHash"), "{r}");
        }
    }
}
