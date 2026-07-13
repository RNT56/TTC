//! forge-wasm — the single WASM facade crate (D16/D17): the same core bits the
//! binary runs, compiled for the browser.
//!
//! Boundary shapes (architecture §2): `validate`/`bake` over JSON strings for
//! interop, plus the P1-005 typed paths — a stateful `Bake` handle whose mesh
//! buffers cross as **typed-array views over wasm linear memory** (meta stays
//! JSON; geometry never round-trips through JSON), and `Session.pose_view`,
//! the zero-copy per-frame pose buffer. Views are valid only until the next
//! wasm memory growth: consumers read them synchronously.
//!
//! This crate is the one sanctioned home for `unsafe` (BEST-PRACTICES §5:
//! "outside the facade's view plumbing") — each use is a `js_sys` typed-array
//! view with a SAFETY note; everything beneath stays `forbid(unsafe_code)`.

pub mod golden;
pub mod session;

use forge_validate::{run_full, EmptyCatalog, Options};

/// Machine-readable facade and data-contract versions for loaders and support
/// tooling. Package SemVer governs the exported WASM API; data formats retain
/// their independent versions.
pub fn version_json() -> String {
    serde_json::json!({
        "packageVersion": env!("CARGO_PKG_VERSION"),
        "modelSpecSchemaVersion": forge_contract::SCHEMA_VERSION,
        "validatorReportVersion": forge_validate::REPORT_FORMAT_VERSION,
        "replayFormatVersion": forge_sim::runtime::REPLAY_FORMAT_VERSION,
        "envSpecSchemaVersion": forge_sim::runtime::ENVSPEC_SCHEMA_VERSION,
    })
    .to_string()
}

/// Run the full validation suite; returns the report JSON (`target: "wasm"`).
pub fn validate_json(contract_json: &str) -> String {
    let opts = Options {
        target: "wasm",
        ..Default::default()
    };
    let report = run_full(contract_json, &EmptyCatalog, &opts);
    serde_json::to_string(&report).expect("report serializes")
}

/// Bake a contract; returns `{counts, hud, baked}` JSON or an error report.
pub fn bake_json(contract_json: &str) -> Result<String, String> {
    let spec = forge_contract::validate_shape(contract_json).map_err(|e| e.to_string())?;
    let baked = forge_geometry::bake(&spec).map_err(|e| e.to_string())?;
    let hud = forge_sim::derive_hud(&spec, &baked).ok();
    let artifact = serde_json::json!({
        "contractHash": forge_contract::contract_hash(&spec),
        "schemaVersion": forge_contract::SCHEMA_VERSION,
        "counts": {
            "parts": baked.parts.len(),
            "faces": baked.total_polygons,
            "vertices": baked.total_vertices,
            "triangles": baked.total_faces,
        },
        "hud": hud,
        "baked": baked,
    });
    Ok(artifact.to_string())
}

/// Emit the JSON Schema (the LLM constraint + codegen source).
pub fn schema_json() -> String {
    forge_contract::emit_json_schema()
}

/// The meta half of a bake artifact — counts, HUD, node transforms, part
/// table — WITHOUT mesh buffers (those cross the boundary as typed-array
/// views, P1-005). Field names match the JSON `bake` artifact.
pub fn bake_meta_json(
    spec: &forge_contract::ModelSpec,
    baked: &forge_geometry::BakedModel,
) -> String {
    let hud = forge_sim::derive_hud(spec, baked).ok();
    serde_json::json!({
        "contractHash": forge_contract::contract_hash(spec),
        "schemaVersion": forge_contract::SCHEMA_VERSION,
        "counts": {
            "parts": baked.parts.len(),
            "faces": baked.total_polygons,
            "vertices": baked.total_vertices,
            "triangles": baked.total_faces,
        },
        "hud": hud,
        "baked": {
            "node_world": baked.node_world,
            "parts": baked.parts.iter().map(|p| serde_json::json!({
                "part_index": p.part_index,
                "node": p.node,
                "material": p.material,
                "color": p.color,
                "collision": p.collision,
                "explode": p.explode,
                "poly_verts": p.poly_verts,
                "poly_faces": p.poly_faces,
                "vertices": p.mesh.vertex_count(),
                "triangles": p.mesh.face_count(),
            })).collect::<Vec<_>>(),
        },
    })
    .to_string()
}

pub fn rapier_pose_buffer_from_poses(poses: &[forge_sim::rapier::RapierBodyPose]) -> Vec<f32> {
    let mut buffer = Vec::with_capacity(poses.len() * 16);
    for pose in poses {
        buffer.extend_from_slice(&pose_matrix(pose.translation_m, pose.rotation_wxyz));
    }
    buffer
}

fn pose_matrix(translation: [f64; 3], rotation_wxyz: [f64; 4]) -> [f32; 16] {
    let [mut w, mut x, mut y, mut z] = rotation_wxyz;
    let norm = (w * w + x * x + y * y + z * z).sqrt();
    if norm > 1e-9 {
        w /= norm;
        x /= norm;
        y /= norm;
        z /= norm;
    } else {
        w = 1.0;
        x = 0.0;
        y = 0.0;
        z = 0.0;
    }

    let xx = x * x;
    let yy = y * y;
    let zz = z * z;
    let xy = x * y;
    let xz = x * z;
    let yz = y * z;
    let wx = w * x;
    let wy = w * y;
    let wz = w * z;

    let m00 = 1.0 - 2.0 * (yy + zz);
    let m01 = 2.0 * (xy - wz);
    let m02 = 2.0 * (xz + wy);
    let m10 = 2.0 * (xy + wz);
    let m11 = 1.0 - 2.0 * (xx + zz);
    let m12 = 2.0 * (yz - wx);
    let m20 = 2.0 * (xz - wy);
    let m21 = 2.0 * (yz + wx);
    let m22 = 1.0 - 2.0 * (xx + yy);

    [
        m00 as f32,
        m10 as f32,
        m20 as f32,
        0.0,
        m01 as f32,
        m11 as f32,
        m21 as f32,
        0.0,
        m02 as f32,
        m12 as f32,
        m22 as f32,
        0.0,
        translation[0] as f32,
        translation[1] as f32,
        translation[2] as f32,
        1.0,
    ]
}

#[cfg(target_arch = "wasm32")]
mod wasm_bindings {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub fn validate(contract_json: &str) -> String {
        super::validate_json(contract_json)
    }

    #[wasm_bindgen]
    pub fn bake(contract_json: &str) -> Result<String, JsValue> {
        super::bake_json(contract_json).map_err(|e| JsValue::from_str(&e))
    }

    #[wasm_bindgen]
    pub fn schema() -> String {
        super::schema_json()
    }

    #[wasm_bindgen]
    pub fn version() -> String {
        super::version_json()
    }

    /// Golden-number report (XT-001): must equal the native binary's output
    /// byte for byte.
    #[wasm_bindgen]
    pub fn golden(contract_json: &str) -> Result<String, JsValue> {
        super::golden::golden_report(contract_json).map_err(|e| JsValue::from_str(&e))
    }

    /// JSON-Patch application with shape re-check (the `patch` boundary call).
    #[wasm_bindgen]
    pub fn patch(contract_json: &str, patch_json: &str) -> Result<String, JsValue> {
        forge_contract::patch::apply_patch(contract_json, patch_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Stateful bake handle (P1-005): meta crosses as JSON once; mesh buffers
    /// cross as typed-array views over wasm linear memory — geometry never
    /// round-trips through JSON. Re-bake in place via `patch` (the
    /// configurator loop primitive).
    #[wasm_bindgen]
    pub struct Bake {
        contract_json: String,
        spec: forge_contract::ModelSpec,
        baked: forge_geometry::BakedModel,
    }

    #[wasm_bindgen]
    impl Bake {
        #[wasm_bindgen(constructor)]
        pub fn new(contract_json: &str) -> Result<Bake, JsValue> {
            let spec =
                forge_contract::validate_shape(contract_json).map_err(|e| err(e.to_string()))?;
            let baked = forge_geometry::bake(&spec).map_err(|e| err(e.to_string()))?;
            Ok(Bake {
                contract_json: contract_json.to_string(),
                spec,
                baked,
            })
        }

        /// Counts, HUD, node transforms, part table — everything but buffers.
        pub fn meta(&self) -> String {
            super::bake_meta_json(&self.spec, &self.baked)
        }

        pub fn part_count(&self) -> u32 {
            self.baked.parts.len() as u32
        }

        /// Zero-copy position view for one part (3 f32 per vertex). Valid only
        /// until the next wasm memory growth — consume synchronously.
        pub fn positions(&self, part: u32) -> Result<js_sys::Float32Array, JsValue> {
            let p = self.part(part)?;
            // SAFETY: the view aliases Vec memory owned by `self`, which JS
            // reads synchronously before any further facade call could grow
            // or move wasm linear memory.
            Ok(unsafe { js_sys::Float32Array::view(&p.mesh.positions) })
        }

        /// Zero-copy normal view for one part (3 f32 per vertex); same
        /// lifetime rule as `positions`.
        pub fn normals(&self, part: u32) -> Result<js_sys::Float32Array, JsValue> {
            let p = self.part(part)?;
            // SAFETY: as in `positions`.
            Ok(unsafe { js_sys::Float32Array::view(&p.mesh.normals) })
        }

        /// Zero-copy triangle index view for one part; same lifetime rule as
        /// `positions`.
        pub fn indices(&self, part: u32) -> Result<js_sys::Uint32Array, JsValue> {
            let p = self.part(part)?;
            // SAFETY: as in `positions`.
            Ok(unsafe { js_sys::Uint32Array::view(&p.mesh.indices) })
        }

        /// Apply a JSON-Patch to the contract and re-bake in place; returns
        /// fresh meta. INCREMENTAL: parts whose (geom, pose) are untouched
        /// reuse their buffers — a configurator color patch re-bakes zero
        /// geometry (the ≤ 10 ms budget holds with room for 1000-part models).
        pub fn patch(&mut self, patch_json: &str) -> Result<String, JsValue> {
            let next = forge_contract::patch::apply_patch(&self.contract_json, patch_json)
                .map_err(|e| err(e.to_string()))?;
            let spec = forge_contract::validate_shape(&next).map_err(|e| err(e.to_string()))?;
            // incremental: untouched (geom, pose) reuse their buffers
            let baked = forge_geometry::bake_incremental(&spec, &self.spec, &self.baked)
                .map_err(|e| err(e.to_string()))?;
            self.contract_json = next;
            self.spec = spec;
            self.baked = baked;
            Ok(self.meta())
        }

        /// The current (possibly patched) contract document.
        pub fn contract(&self) -> String {
            self.contract_json.clone()
        }

        fn part(&self, i: u32) -> Result<&forge_geometry::BakedPart, JsValue> {
            self.baked
                .parts
                .get(i as usize)
                .ok_or_else(|| err(format!("part index {i} out of range")))
        }
    }

    fn err(message: String) -> JsValue {
        JsValue::from_str(&message)
    }

    /// The `tick` boundary call as a stateful session.
    #[wasm_bindgen]
    pub struct Session {
        inner: super::session::CoreSession,
    }

    #[wasm_bindgen]
    impl Session {
        #[wasm_bindgen(constructor)]
        pub fn new(contract_json: &str) -> Result<Session, JsValue> {
            super::session::CoreSession::new(contract_json)
                .map(|inner| Session { inner })
                .map_err(|e| JsValue::from_str(&e))
        }

        pub fn node_names(&self) -> Vec<String> {
            self.inner.node_names().to_vec()
        }

        /// Advance the fixed-step clock; returns the number of 120 Hz steps
        /// executed. Read the result through `pose_view` (P1-005 zero-copy).
        #[allow(clippy::too_many_arguments)]
        pub fn step(
            &mut self,
            dt: f64,
            throttle: f64,
            pitch: f64,
            roll: f64,
            yaw: f64,
            drive: f64,
            turn: f64,
        ) -> Result<u32, JsValue> {
            let input = forge_motion::InputFrame {
                throttle,
                pitch,
                roll,
                yaw,
                drive,
                turn,
            };
            self.inner
                .step(dt, &input)
                .map_err(|e| JsValue::from_str(&e))
        }

        /// Drive-mode camera focus (x, y, z) — the driver's body position at
        /// its natural viewing height.
        pub fn focus(&self) -> Vec<f64> {
            self.inner.focus().to_vec()
        }

        /// Teach-pendant jog (P1-013): per-node euler offset over the pose
        /// layers; zeros clear the node.
        pub fn set_jog(&mut self, node: &str, rx: f64, ry: f64) {
            self.inner.set_jog(node, rx, ry);
        }

        pub fn clear_jog(&mut self) {
            self.inner.clear_jog();
        }

        /// Zero-copy pose view (16 f32 per node, column-major, `node_names`
        /// order). Valid only until the next wasm memory growth — read it
        /// synchronously every frame, never hold it.
        pub fn pose_view(&self) -> js_sys::Float32Array {
            // SAFETY: the view aliases the session's pose buffer, which JS
            // reads synchronously before any further facade call could grow
            // or move wasm linear memory.
            unsafe { js_sys::Float32Array::view(self.inner.pose_buffer()) }
        }
    }

    /// Engine-backed Rapier session for browser-worker handoff. The worker owns
    /// this handle and mirrors `pose_view` into a SharedArrayBuffer.
    #[wasm_bindgen]
    pub struct RapierSession {
        world: forge_sim::rapier::RapierWorld,
        node_names: Vec<String>,
        pose: Vec<f32>,
    }

    #[wasm_bindgen]
    impl RapierSession {
        #[wasm_bindgen(constructor)]
        pub fn new(
            contract_json: &str,
            fixed_roots: bool,
            include_ground: bool,
        ) -> Result<RapierSession, JsValue> {
            let spec =
                forge_contract::validate_shape(contract_json).map_err(|e| err(e.to_string()))?;
            let baked = forge_geometry::bake(&spec).map_err(|e| err(e.to_string()))?;
            let world = forge_sim::rapier::RapierWorld::from_contract(
                &spec,
                &baked,
                forge_sim::rapier::RapierWorldConfig {
                    fixed_roots,
                    include_ground,
                    ..forge_sim::rapier::RapierWorldConfig::default()
                },
            )
            .map_err(|e| err(e.to_string()))?;
            let poses = world.poses();
            let node_names = poses.iter().map(|pose| pose.node.clone()).collect();
            let pose = super::rapier_pose_buffer_from_poses(&poses);
            Ok(RapierSession {
                world,
                node_names,
                pose,
            })
        }

        pub fn scene(&self) -> String {
            serde_json::to_string(self.world.scene()).expect("Rapier scene serializes")
        }

        pub fn node_names(&self) -> Vec<String> {
            self.node_names.clone()
        }

        pub fn step(&mut self, dt_s: f64) -> Result<String, JsValue> {
            let result = self.world.step(dt_s);
            self.pose = super::rapier_pose_buffer_from_poses(&result.poses);
            serde_json::to_string(&result).map_err(|e| err(e.to_string()))
        }

        /// Zero-copy Rapier body pose view (16 f32 per body, column-major,
        /// `node_names` order). The worker copies this into its SAB mirror after
        /// every step.
        pub fn pose_view(&self) -> js_sys::Float32Array {
            // SAFETY: the view aliases the session-owned pose Vec. The worker
            // copies it synchronously before the next facade call can replace
            // the Vec.
            unsafe { js_sys::Float32Array::view(&self.pose) }
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn bake_meta_omits_buffers_but_keeps_the_part_table() {
        let doc = include_str!("../../../examples/hrx7.forge.json");
        let spec = forge_contract::validate_shape(doc).unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let meta: serde_json::Value =
            serde_json::from_str(&super::bake_meta_json(&spec, &baked)).unwrap();
        assert_eq!(meta["counts"]["parts"], 125);
        assert_eq!(meta["counts"]["faces"], 2195);
        let parts = meta["baked"]["parts"].as_array().unwrap();
        assert_eq!(parts.len(), 125);
        assert!(parts[0].get("mesh").is_none(), "no buffers in meta");
        assert!(parts[0]["vertices"].as_u64().unwrap() > 0);
        assert!(meta["baked"]["node_world"].get("root").is_some());
    }

    #[test]
    fn rapier_pose_buffer_is_column_major_transform() {
        let poses = vec![forge_sim::rapier::RapierBodyPose {
            node: "root".to_string(),
            translation_m: [1.0, 2.0, 3.0],
            rotation_wxyz: [1.0, 0.0, 0.0, 0.0],
            linvel_mps: [0.0; 3],
            angvel_radps: [0.0; 3],
        }];
        let pose = super::rapier_pose_buffer_from_poses(&poses);
        assert_eq!(pose.len(), 16);
        assert_eq!(
            pose,
            vec![
                1.0, 0.0, 0.0, 0.0, //
                0.0, 1.0, 0.0, 0.0, //
                0.0, 0.0, 1.0, 0.0, //
                1.0, 2.0, 3.0, 1.0,
            ]
        );
    }

    #[test]
    fn facade_validates_and_bakes_native_rlib() {
        // Same code paths the WASM build exports — exercised natively so the
        // facade is tested even where the wasm32 target is unavailable.
        let doc = include_str!("../../../examples/vx2-mini.forge.json");
        let report = super::validate_json(doc);
        assert!(
            report.contains("\"verdict\":\"admitted\""),
            "report: {report}"
        );
        assert!(report.contains("\"target\":\"wasm\""));
        let bake = super::bake_json(doc).unwrap();
        assert!(bake.contains("\"counts\""));
    }
}
