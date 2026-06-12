//! forge-wasm — the single WASM facade crate (D16/D17): the same core bits the
//! binary runs, compiled for the browser.
//!
//! v0 exposes `validate` and `bake` over JSON strings. The zero-copy buffer-view
//! discipline from the frozen boundary (architecture §2) is the P1-005
//! refinement: positions/normals/indices become views over linear memory once
//! the studio consumes the facade directly (tracked in TODO P1-005).

pub mod session;

use forge_validate::{run_full, EmptyCatalog, Options};

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

    /// JSON-Patch application with shape re-check (the `patch` boundary call).
    #[wasm_bindgen]
    pub fn patch(contract_json: &str, patch_json: &str) -> Result<String, JsValue> {
        forge_contract::patch::apply_patch(contract_json, patch_json)
            .map_err(|e| JsValue::from_str(&e.to_string()))
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

        /// Advance and return the pose buffer (16 f32 per node, column-major).
        /// v0 copies out; zero-copy views over linear memory are the P1-005
        /// refinement.
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
        ) -> Result<Vec<f32>, JsValue> {
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
                .map_err(|e| JsValue::from_str(&e))?;
            Ok(self.inner.pose_buffer().to_vec())
        }
    }
}

#[cfg(test)]
mod tests {
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
