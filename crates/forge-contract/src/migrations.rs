//! Schema compatibility migrations for historical ModelSpec documents (XC-23).

use crate::{validate_shape, ModelSpec, SCHEMA_VERSION};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    pub from_schema_version: String,
    pub to_schema_version: String,
    pub applied: Vec<String>,
    pub spec: ModelSpec,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MigrationError {
    pub message: String,
}

impl MigrationError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for MigrationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for MigrationError {}

/// Migrate a document to the current ModelSpec schema and return the typed spec.
pub fn migrate(doc: &str, to_version: &str) -> Result<ModelSpec, MigrationError> {
    Ok(migrate_with_report(doc, to_version)?.spec)
}

/// Migrate a document to the current ModelSpec schema with an audit report.
pub fn migrate_with_report(doc: &str, to_version: &str) -> Result<MigrationReport, MigrationError> {
    let target = normalize_target(to_version)?;
    let mut value: Value =
        serde_json::from_str(doc).map_err(|e| MigrationError::new(format!("invalid JSON: {e}")))?;
    let mut applied = Vec::new();
    let from_schema_version =
        take_schema_version_marker(&mut value, &mut applied).unwrap_or_else(|| "unknown".into());

    normalize_value(&mut value, &mut applied);

    let migrated = serde_json::to_string(&value)
        .map_err(|e| MigrationError::new(format!("cannot serialize migrated JSON: {e}")))?;
    let spec = validate_shape(&migrated)
        .map_err(|e| MigrationError::new(format!("migrated document is not schema-valid: {e}")))?;

    Ok(MigrationReport {
        from_schema_version,
        to_schema_version: target.to_string(),
        applied,
        spec,
    })
}

fn normalize_target(to_version: &str) -> Result<&'static str, MigrationError> {
    let requested = to_version.trim();
    if requested.is_empty() || requested == "current" || requested == SCHEMA_VERSION {
        Ok(SCHEMA_VERSION)
    } else {
        Err(MigrationError::new(format!(
            "unsupported migration target '{requested}' (only {SCHEMA_VERSION} is available)"
        )))
    }
}

fn take_schema_version_marker(value: &mut Value, applied: &mut Vec<String>) -> Option<String> {
    let Value::Object(root) = value else {
        return None;
    };
    let version = remove_version_marker(root);
    let meta_version = root
        .get_mut("meta")
        .and_then(Value::as_object_mut)
        .and_then(remove_version_marker);
    if version.is_some() || meta_version.is_some() {
        record(applied, "drop-schema-version-marker");
    }
    version.or(meta_version)
}

fn remove_version_marker(map: &mut Map<String, Value>) -> Option<String> {
    ["schemaVersion", "schema_version", "$schemaVersion"]
        .into_iter()
        .find_map(|key| map.remove(key))
        .map(|value| match value {
            Value::String(s) => s,
            other => other.to_string(),
        })
}

fn normalize_value(value: &mut Value, applied: &mut Vec<String>) {
    match value {
        Value::Object(map) => {
            normalize_component_refs(map, applied);
            normalize_field_aliases(map, applied);
            normalize_provenance_kind(map, applied);
            for child in map.values_mut() {
                normalize_value(child, applied);
            }
        }
        Value::Array(items) => {
            for child in items {
                normalize_value(child, applied);
            }
        }
        _ => {}
    }
}

fn normalize_component_refs(map: &mut Map<String, Value>, applied: &mut Vec<String>) {
    if map.contains_key("mount") {
        rename_field(
            map,
            "component_ref",
            "ref",
            applied,
            "component-ref-aliases",
        );
        rename_field(map, "componentRef", "ref", applied, "component-ref-aliases");
    } else {
        rename_field(
            map,
            "component_ref",
            "componentRef",
            applied,
            "component-ref-aliases",
        );
    }
}

fn normalize_field_aliases(map: &mut Map<String, Value>, applied: &mut Vec<String>) {
    const ALIASES: &[(&str, &str)] = &[
        ("mount_nodes", "mountNodes"),
        ("render_bias", "renderBias"),
        ("max_torque_nm", "maxTorqueNm"),
        ("max_vel_rad", "maxVelRad"),
        ("air_density", "airDensity"),
        ("value_g", "valueG"),
        ("density_kgm3", "densityKgm3"),
        ("prompt_hash", "promptHash"),
        ("model_version", "modelVersion"),
        ("capacityMah", "capacity_mAh"),
        ("capacity_mah", "capacity_mAh"),
        ("rIntMohm", "r_int_mohm"),
        ("rIntMOhm", "r_int_mohm"),
        ("latencyMs", "latency_ms"),
        ("gyro_noise", "gyroNoise"),
        ("accel_noise", "accelNoise"),
        ("aggregate_mass_g", "aggregateMassG"),
        ("c_rating", "cRating"),
        ("max_current_a", "maxCurrentA"),
        ("diameter_in", "diameterIn"),
        ("pitch_in", "pitchIn"),
        ("ct_table", "ctTable"),
    ];
    for (from, to) in ALIASES {
        rename_field(map, from, to, applied, "field-aliases-v2.1");
    }
}

fn normalize_provenance_kind(map: &mut Map<String, Value>, applied: &mut Vec<String>) {
    let Some(Value::String(kind)) = map.get_mut("kind") else {
        return;
    };
    let next = match kind.as_str() {
        "parametric_generator" => "parametric-generator",
        "llm_generation" => "llm-generation",
        _ => return,
    };
    *kind = next.to_string();
    record(applied, "provenance-kind-aliases");
}

fn rename_field(
    map: &mut Map<String, Value>,
    from: &str,
    to: &str,
    applied: &mut Vec<String>,
    label: &str,
) {
    let Some(value) = map.remove(from) else {
        return;
    };
    map.entry(to.to_string()).or_insert(value);
    record(applied, label);
}

fn record(applied: &mut Vec<String>, label: &str) {
    if !applied.iter().any(|existing| existing == label) {
        applied.push(label.to_string());
    }
}
