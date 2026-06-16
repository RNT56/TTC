//! Typed driver-parameter schemas per archetype (P2-003): contracts carry
//! `driver.params` as data; these DTOs make that data machine-checkable
//! (CTR-008) and LLM-generable (the schemas join the prompt-cached prefix at
//! P4). Parsing is lenient about unknown fields — prototype contracts carry
//! extras (e.g. `pen`) that later drivers will consume — but strict about
//! types.

use forge_contract::{Archetype, ModelSpec};
use schemars::JsonSchema;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub struct MultirotorParamsDto {
    pub tilt_max_rad: f64,
    pub yaw_rate: f64,
    pub mixer: String,
}

impl Default for MultirotorParamsDto {
    fn default() -> Self {
        MultirotorParamsDto {
            tilt_max_rad: 0.4,
            yaw_rate: 2.4,
            mixer: "x4".into(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", default)]
pub struct RoverParamsDto {
    pub wheelbase_m: f64,
    pub max_speed_ms: f64,
}

impl Default for RoverParamsDto {
    fn default() -> Self {
        RoverParamsDto {
            wheelbase_m: 0.2,
            max_speed_ms: 1.0,
        }
    }
}

/// Validate `driver.params` against the archetype's schema (CTR-008,
/// provisional v0 id). Returns a human-readable error on type mismatches;
/// archetypes whose drivers land later (P2) accept anything for now.
pub fn check_driver_params(spec: &ModelSpec) -> Result<(), String> {
    let params = spec.driver.params.clone();
    if params.is_null() {
        return Ok(());
    }
    if !params.is_object() {
        return Err("driver.params must be an object".to_string());
    }
    match spec.driver.archetype {
        Archetype::Multirotor => serde_json::from_value::<MultirotorParamsDto>(params)
            .map(|_| ())
            .map_err(|e| format!("multirotor params: {e}")),
        Archetype::Rover => serde_json::from_value::<RoverParamsDto>(params)
            .map(|_| ())
            .map_err(|e| format!("rover params: {e}")),
        Archetype::Quadruped => serde_json::from_value::<crate::quadruped::QuadrupedParams>(params)
            .map(|_| ())
            .map_err(|e| format!("quadruped params: {e}")),
        Archetype::Arm => serde_json::from_value::<crate::arm::ArmParams>(params)
            .map(|_| ())
            .map_err(|e| format!("arm params: {e}")),
        // biped / fixedwing drivers have no strict param schema yet
        _ => Ok(()),
    }
}

/// The archetype's param JSON Schema (joins the generation prefix at P4).
pub fn params_schema(archetype: &Archetype) -> Option<String> {
    let schema = match archetype {
        Archetype::Multirotor => schemars::schema_for!(MultirotorParamsDto),
        Archetype::Rover => schemars::schema_for!(RoverParamsDto),
        Archetype::Quadruped => schemars::schema_for!(crate::quadruped::QuadrupedParams),
        Archetype::Arm => schemars::schema_for!(crate::arm::ArmParams),
        _ => return None,
    };
    Some(serde_json::to_string_pretty(&schema).expect("schema serializes"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec_with(archetype: &str, params: serde_json::Value) -> ModelSpec {
        let doc = serde_json::json!({
          "meta":{"id":"t","name":"t","version":"2.1.0","archetype":archetype,
                  "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[{"name":"root","parent":null,"pos":[0,0,0]}],
          "parts":[{"node":"root","geom":{"kind":"box","w":0.1,"h":0.1,"d":0.1},
                    "material":"matte","color":"#333333"}],
          "driver":{"archetype":archetype,"params":params}
        });
        forge_contract::validate_shape(&doc.to_string()).unwrap()
    }

    #[test]
    fn valid_params_pass_and_unknown_fields_are_tolerated() {
        let spec = spec_with(
            "multirotor",
            serde_json::json!({"tiltMaxRad":0.4,"yawRate":2.4,"mixer":"x4","pen":[1.25,0.12,1.45]}),
        );
        assert!(check_driver_params(&spec).is_ok());
    }

    #[test]
    fn type_mismatch_is_an_error() {
        let spec = spec_with(
            "multirotor",
            serde_json::json!({"tiltMaxRad":"forty degrees"}),
        );
        let err = check_driver_params(&spec).unwrap_err();
        assert!(err.contains("multirotor params"), "{err}");
    }

    #[test]
    fn schemas_emit_for_implemented_archetypes() {
        for a in [
            Archetype::Multirotor,
            Archetype::Rover,
            Archetype::Quadruped,
            Archetype::Arm,
        ] {
            let s = params_schema(&a).unwrap();
            assert!(s.contains("$schema") || s.contains("properties"), "{s}");
        }
        assert!(params_schema(&Archetype::Biped).is_none());
    }

    #[test]
    fn arm_params_are_checked() {
        let spec = spec_with(
            "arm",
            serde_json::json!({"targetM":[0.0,-0.1,0.3],"iterations":32}),
        );
        assert!(check_driver_params(&spec).is_ok());

        let bad = spec_with("arm", serde_json::json!({"targetM":"reach there"}));
        let err = check_driver_params(&bad).unwrap_err();
        assert!(err.contains("arm params"), "{err}");
    }
}
