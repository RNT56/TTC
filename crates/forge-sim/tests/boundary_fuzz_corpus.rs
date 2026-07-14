//! QA-007 governed import, EnvSpec, and replay boundary corpora.

use forge_sim::interop::{import_mjcf_contract, import_urdf_contract};
use forge_sim::runtime::{validate_envspec, verify_replay, EnvSpec, ReplayFrame, ReplayTape};
use proptest::prelude::*;

fn corpus(path: &str) -> serde_json::Value {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    serde_json::from_str(&std::fs::read_to_string(root.join(path)).expect("boundary corpus reads"))
        .expect("boundary corpus parses")
}

fn assert_result(id: &str, expected: &serde_json::Value, result: Result<(), String>) {
    match expected["outcome"].as_str() {
        Some("accept") => result.unwrap_or_else(|error| panic!("{id} rejected: {error}")),
        Some("reject") => {
            let error = result.unwrap_err();
            if let Some(fragment) = expected["contains"].as_str() {
                assert!(
                    error.contains(fragment),
                    "{id} error '{error}' does not contain '{fragment}'"
                );
            }
        }
        other => panic!("{id} has invalid outcome {other:?}"),
    }
}

#[test]
fn import_boundary_corpus_matches_pinned_outcomes() {
    let corpus = corpus("evals/fuzz/boundaries/imports.json");
    assert_eq!(corpus["version"], "forge-boundary-fuzz.v1");
    let cases = corpus["cases"].as_array().expect("cases array");
    assert!(cases.len() >= 8);
    for case in cases {
        let id = case["id"].as_str().expect("case id");
        let input = &case["input"];
        let xml = input["xml"].as_str().expect("xml string");
        let result = match input["format"].as_str() {
            Some("urdf") => import_urdf_contract(xml).map(|_| ()),
            Some("mjcf") => import_mjcf_contract(xml).map(|_| ()),
            other => panic!("{id} has invalid import format {other:?}"),
        };
        assert_result(id, &case["expect"], result);
    }
}

fn special_number(value: &serde_json::Value) -> Option<f64> {
    match value["$number"].as_str() {
        Some("nan") => Some(f64::NAN),
        Some("infinity") => Some(f64::INFINITY),
        Some("-infinity") => Some(f64::NEG_INFINITY),
        _ => None,
    }
}

fn set_special_env_value(env: &mut EnvSpec, path: &str, value: f64) {
    match path {
        "/boundsM/0" => env.bounds_m[0] = value,
        "/boundsM/1" => env.bounds_m[1] = value,
        "/boundsM/2" => env.bounds_m[2] = value,
        "/gates/0/widthM" => env.gates[0].width_m = value,
        "/gates/0/heightM" => env.gates[0].height_m = value,
        "/spawns/0/pose/p/0" => env.spawns[0].pose.p[0] = value,
        other => panic!("unsupported special EnvSpec mutation {other}"),
    }
}

#[test]
fn envspec_boundary_corpus_matches_pinned_diagnostics() {
    let corpus = corpus("evals/fuzz/boundaries/envspec.json");
    let fixture = corpus["fixture"].clone();
    let cases = corpus["cases"].as_array().expect("cases array");
    for case in cases {
        let id = case["id"].as_str().expect("case id");
        let mut document = fixture.clone();
        let mutation = &case["input"]["mutation"];
        let mut special = None;
        if !mutation.is_null() {
            let path = mutation["path"].as_str().expect("mutation path");
            let value = &mutation["value"];
            if let Some(number) = special_number(value) {
                *document.pointer_mut(path).expect("known mutation path") = serde_json::json!(1.0);
                special = Some((path, number));
            } else {
                *document.pointer_mut(path).expect("known mutation path") = value.clone();
            }
        }
        let mut env: EnvSpec = serde_json::from_value(document)
            .unwrap_or_else(|error| panic!("{id} fixture deserialization failed: {error}"));
        if let Some((path, number)) = special {
            set_special_env_value(&mut env, path, number);
        }
        let diagnostics = validate_envspec(&env);
        match case["expect"]["outcome"].as_str() {
            Some("accept") => assert!(diagnostics.is_empty(), "{id}: {diagnostics:?}"),
            Some("reject") => {
                let check = case["expect"]["check"].as_str().expect("diagnostic check");
                assert!(
                    diagnostics
                        .iter()
                        .any(|diagnostic| diagnostic.check == check),
                    "{id} missing {check}: {diagnostics:?}"
                );
            }
            other => panic!("{id} has invalid outcome {other:?}"),
        }
    }
}

fn timestamp(value: &serde_json::Value) -> f64 {
    value
        .as_f64()
        .or_else(|| special_number(value))
        .expect("timestamp number or sentinel")
}

#[test]
fn replay_boundary_corpus_matches_pinned_outcomes() {
    let corpus = corpus("evals/fuzz/boundaries/replay.json");
    let cases = corpus["cases"].as_array().expect("cases array");
    for case in cases {
        let id = case["id"].as_str().expect("case id");
        let input = &case["input"];
        let tape = ReplayTape {
            schema_version: input["schemaVersion"]
                .as_str()
                .expect("schema version")
                .to_string(),
            frames: input["timestamps"]
                .as_array()
                .expect("timestamps")
                .iter()
                .map(|value| ReplayFrame {
                    t: timestamp(value),
                    state: serde_json::Value::Null,
                })
                .collect(),
        };
        let verification = verify_replay(&tape, input["expectedHash"].as_str());
        match case["expect"]["outcome"].as_str() {
            Some("accept") => assert!(verification.verified, "{id}: {verification:?}"),
            Some("reject") => {
                assert!(!verification.verified, "{id} unexpectedly verified");
                let fragment = case["expect"]["contains"]
                    .as_str()
                    .expect("reason fragment");
                assert!(
                    verification
                        .reject_reason
                        .as_deref()
                        .is_some_and(|reason| reason.contains(fragment)),
                    "{id}: {:?}",
                    verification.reject_reason
                );
            }
            other => panic!("{id} has invalid outcome {other:?}"),
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn arbitrary_import_text_never_panics(text in ".{0,2048}") {
        let _ = import_urdf_contract(&text);
        let _ = import_mjcf_contract(&text);
    }

    #[test]
    fn arbitrary_replay_timestamps_never_panic(times in proptest::collection::vec(any::<f64>(), 0..64)) {
        let tape = ReplayTape {
            schema_version: "1.0.0".to_string(),
            frames: times.into_iter().map(|t| ReplayFrame { t, state: serde_json::Value::Null }).collect(),
        };
        let _ = verify_replay(&tape, None);
    }
}
