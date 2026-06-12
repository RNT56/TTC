//! forge-wasm — the single WASM facade crate (D16/D17): the same core bits the
//! binary runs, compiled for the browser.
//!
//! v0 exposes `validate` and `bake` over JSON strings. The zero-copy buffer-view
//! discipline from the frozen boundary (architecture §2) is the P1-005
//! refinement: positions/normals/indices become views over linear memory once
//! the studio consumes the facade directly (tracked in TODO P1-005).

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
            "faces": baked.total_faces,
            "vertices": baked.total_vertices,
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
