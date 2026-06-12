//! JSON-Patch (RFC 6902 subset) for the core `patch` boundary call: the
//! conversational-editing path compiles NL edits to these operations (P4),
//! applied with incremental re-validation and re-bake (plan §8.1).
//!
//! Supported ops: add, replace, remove, test. Paths are JSON Pointers
//! (RFC 6901), with `-` for array append.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum PatchOp {
    Add { path: String, value: Value },
    Replace { path: String, value: Value },
    Remove { path: String },
    Test { path: String, value: Value },
}

#[derive(Debug, PartialEq)]
pub struct PatchError {
    pub op_index: usize,
    pub message: String,
}

impl std::fmt::Display for PatchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "patch op {}: {}", self.op_index, self.message)
    }
}

impl std::error::Error for PatchError {}

/// Apply a patch document to a contract JSON string. The result is re-checked
/// against the schema (CTR-001 shape) — a patch can never produce an unparseable
/// contract silently.
pub fn apply_patch(contract_json: &str, patch_json: &str) -> Result<String, PatchError> {
    let mut doc: Value = serde_json::from_str(contract_json).map_err(|e| PatchError {
        op_index: 0,
        message: format!("contract is not JSON: {e}"),
    })?;
    let ops: Vec<PatchOp> = serde_json::from_str(patch_json).map_err(|e| PatchError {
        op_index: 0,
        message: format!("patch is not a JSON-Patch array: {e}"),
    })?;

    for (i, op) in ops.iter().enumerate() {
        apply_one(&mut doc, op).map_err(|message| PatchError {
            op_index: i,
            message,
        })?;
    }

    let out = serde_json::to_string(&doc).expect("value serializes");
    // shape gate: the patched document must still be a valid ModelSpec
    crate::validate_shape(&out).map_err(|e| PatchError {
        op_index: ops.len().saturating_sub(1),
        message: format!("patched document fails the schema: {e}"),
    })?;
    Ok(out)
}

fn apply_one(doc: &mut Value, op: &PatchOp) -> Result<(), String> {
    match op {
        PatchOp::Test { path, value } => {
            let cur = resolve(doc, path)?;
            if cur != value {
                return Err(format!("test failed at '{path}'"));
            }
            Ok(())
        }
        PatchOp::Replace { path, value } => {
            let slot = resolve_mut(doc, path)?;
            *slot = value.clone();
            Ok(())
        }
        PatchOp::Remove { path } => remove_at(doc, path),
        PatchOp::Add { path, value } => add_at(doc, path, value.clone()),
    }
}

fn split_pointer(path: &str) -> Result<Vec<String>, String> {
    if path.is_empty() {
        return Ok(vec![]);
    }
    if !path.starts_with('/') {
        return Err(format!("pointer '{path}' must start with '/'"));
    }
    Ok(path[1..]
        .split('/')
        .map(|t| t.replace("~1", "/").replace("~0", "~"))
        .collect())
}

fn resolve<'a>(doc: &'a Value, path: &str) -> Result<&'a Value, String> {
    let mut node = doc;
    for tok in split_pointer(path)? {
        node = step(node, &tok)?;
    }
    Ok(node)
}

fn resolve_mut<'a>(doc: &'a mut Value, path: &str) -> Result<&'a mut Value, String> {
    let mut node = doc;
    for tok in split_pointer(path)? {
        node = step_mut(node, &tok)?;
    }
    Ok(node)
}

fn step<'a>(node: &'a Value, tok: &str) -> Result<&'a Value, String> {
    match node {
        Value::Object(m) => m.get(tok).ok_or_else(|| format!("no member '{tok}'")),
        Value::Array(a) => {
            let i: usize = tok.parse().map_err(|_| format!("bad index '{tok}'"))?;
            a.get(i)
                .ok_or_else(|| format!("index {i} out of bounds ({})", a.len()))
        }
        _ => Err(format!("cannot index scalar with '{tok}'")),
    }
}

fn step_mut<'a>(node: &'a mut Value, tok: &str) -> Result<&'a mut Value, String> {
    match node {
        Value::Object(m) => m.get_mut(tok).ok_or_else(|| format!("no member '{tok}'")),
        Value::Array(a) => {
            let len = a.len();
            let i: usize = tok.parse().map_err(|_| format!("bad index '{tok}'"))?;
            a.get_mut(i)
                .ok_or_else(|| format!("index {i} out of bounds ({len})"))
        }
        _ => Err(format!("cannot index scalar with '{tok}'")),
    }
}

fn add_at(doc: &mut Value, path: &str, value: Value) -> Result<(), String> {
    let toks = split_pointer(path)?;
    let Some((last, parents)) = toks.split_last() else {
        *doc = value;
        return Ok(());
    };
    let mut node = doc;
    for tok in parents {
        node = step_mut(node, tok)?;
    }
    match node {
        Value::Object(m) => {
            m.insert(last.clone(), value);
            Ok(())
        }
        Value::Array(a) => {
            if last == "-" {
                a.push(value);
                return Ok(());
            }
            let i: usize = last.parse().map_err(|_| format!("bad index '{last}'"))?;
            if i > a.len() {
                return Err(format!("index {i} out of bounds ({})", a.len()));
            }
            a.insert(i, value);
            Ok(())
        }
        _ => Err("cannot add into a scalar".to_string()),
    }
}

fn remove_at(doc: &mut Value, path: &str) -> Result<(), String> {
    let toks = split_pointer(path)?;
    let Some((last, parents)) = toks.split_last() else {
        return Err("cannot remove the document root".to_string());
    };
    let mut node = doc;
    for tok in parents {
        node = step_mut(node, tok)?;
    }
    match node {
        Value::Object(m) => {
            m.remove(last.as_str())
                .ok_or_else(|| format!("no member '{last}'"))?;
            Ok(())
        }
        Value::Array(a) => {
            let i: usize = last.parse().map_err(|_| format!("bad index '{last}'"))?;
            if i >= a.len() {
                return Err(format!("index {i} out of bounds ({})", a.len()));
            }
            a.remove(i);
            Ok(())
        }
        _ => Err("cannot remove from a scalar".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DOC: &str = r##"{
      "meta":{"id":"p","name":"p","version":"2.1.0","archetype":"rover",
              "provenance":{"kind":"human"},"license":"CC0"},
      "skeleton":[{"name":"root","parent":null,"pos":[0,0,0]}],
      "parts":[{"node":"root","geom":{"kind":"box","w":0.2,"h":0.05,"d":0.3},
                "material":"matte","color":"#333333"}],
      "driver":{"archetype":"rover","params":{"maxSpeedMs":1.0}}
    }"##;

    #[test]
    fn replace_and_test_ops() {
        let patch = r##"[
          {"op":"test","path":"/driver/params/maxSpeedMs","value":1.0},
          {"op":"replace","path":"/driver/params/maxSpeedMs","value":2.5},
          {"op":"replace","path":"/parts/0/geom/w","value":0.4}
        ]"##;
        let out = apply_patch(DOC, patch).unwrap();
        let spec = crate::validate_shape(&out).unwrap();
        assert_eq!(
            spec.driver.params.get("maxSpeedMs").unwrap().as_f64(),
            Some(2.5)
        );
        assert!(
            matches!(spec.parts[0].geom, crate::Geom::Box { w, .. } if (w - 0.4).abs() < 1e-12)
        );
    }

    #[test]
    fn add_appends_to_arrays_and_objects() {
        let patch = r##"[
          {"op":"add","path":"/skeleton/-","value":{"name":"head","parent":"root","pos":[0,0.1,0]}},
          {"op":"add","path":"/driver/params/turnRate","value":1.2}
        ]"##;
        let out = apply_patch(DOC, patch).unwrap();
        let spec = crate::validate_shape(&out).unwrap();
        assert_eq!(spec.skeleton.len(), 2);
        assert_eq!(spec.skeleton[1].name, "head");
    }

    #[test]
    fn remove_works_and_schema_gate_holds() {
        // removing a required block must fail the shape gate
        let patch = r#"[{"op":"remove","path":"/driver"}]"#;
        let err = apply_patch(DOC, patch).unwrap_err();
        assert!(err.message.contains("schema"), "{err}");
    }

    #[test]
    fn failed_test_op_reports_index() {
        let patch = r#"[{"op":"test","path":"/meta/id","value":"wrong"}]"#;
        let err = apply_patch(DOC, patch).unwrap_err();
        assert_eq!(err.op_index, 0);
    }

    #[test]
    fn bad_paths_are_errors() {
        for p in [
            r#"[{"op":"replace","path":"/nope/x","value":1}]"#,
            r#"[{"op":"remove","path":"/skeleton/9"}]"#,
            r#"[{"op":"replace","path":"no-slash","value":1}]"#,
        ] {
            assert!(apply_patch(DOC, p).is_err(), "{p}");
        }
    }
}
