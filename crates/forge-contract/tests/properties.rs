//! Property-based tests over the schema heart: whatever the generators
//! produce, (1) parse → serialize → parse is a fixed point (no silent
//! mutation of admitted documents), and (2) the patch engine either applies
//! with the shape gate intact or errors — it never panics and never emits
//! a document that fails the shape check.

use proptest::prelude::*;

fn doc(id: String, w: f64, h: f64, d: f64, color: String, mass: Option<f64>) -> String {
    let mass = match mass {
        Some(g) => format!(r#","mass":{{"valueG":{g}}}"#),
        None => String::new(),
    };
    format!(
        r##"{{"meta":{{"id":"{id}","name":"{id}","version":"2.1.0","archetype":"rover",
             "provenance":{{"kind":"human"}},"license":"CC0"}},
            "skeleton":[{{"name":"root","parent":null,"pos":[0,0,0]}}],
            "parts":[{{"node":"root","geom":{{"kind":"box","w":{w},"h":{h},"d":{d}}},
                      "material":"matte","color":"{color}"{mass}}}],
            "driver":{{"archetype":"rover","params":{{}}}}}}"##
    )
}

fn dim() -> impl Strategy<Value = f64> {
    // positive, finite, sane meters — the schema's domain
    (1u32..40000).prop_map(|n| n as f64 / 10000.0)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn parse_serialize_is_a_fixed_point(
        id in "[a-z][a-z0-9-]{0,15}",
        w in dim(), h in dim(), d in dim(),
        mass in proptest::option::of(1u32..100000u32),
    ) {
        let text = doc(id, w, h, d, "#aabbcc".into(), mass.map(|g| g as f64));
        let spec = forge_contract::validate_shape(&text).unwrap();
        let once = serde_json::to_string(&spec).unwrap();
        let spec2 = forge_contract::validate_shape(&once).unwrap();
        let twice = serde_json::to_string(&spec2).unwrap();
        prop_assert_eq!(once, twice);
        prop_assert_eq!(
            forge_contract::contract_hash(&spec),
            forge_contract::contract_hash(&spec2)
        );
    }

    #[test]
    fn patch_never_panics_and_keeps_shape(
        w in dim(), h in dim(), d in dim(),
        path in prop_oneof![
            Just("/parts/0/color".to_string()),
            Just("/parts/0/geom/w".to_string()),
            Just("/meta/name".to_string()),
            Just("/parts/9/color".to_string()),   // out of range
            Just("/nope/where".to_string()),       // bad pointer
        ],
        value in prop_oneof![
            Just(serde_json::json!("#123456")),
            Just(serde_json::json!(0.25)),
            Just(serde_json::json!(null)),
            Just(serde_json::json!({"x": 1})),
        ],
    ) {
        let text = doc("p".into(), w, h, d, "#aabbcc".into(), None);
        let patch = serde_json::json!([{"op": "replace", "path": path, "value": value}]).to_string();
        // refusal is always acceptable; panicking is not — and the gate's
        // promise is that anything that comes back is shape-valid
        if let Ok(next) = forge_contract::patch::apply_patch(&text, &patch) {
            prop_assert!(forge_contract::validate_shape(&next).is_ok());
        }
    }
}
