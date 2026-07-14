//! QA-007 governed JSON Patch adversarial corpus.

use std::path::Path;

#[test]
fn json_patch_boundary_corpus_matches_pinned_outcomes() {
    let corpus: serde_json::Value = serde_json::from_str(include_str!(
        "../../../evals/fuzz/boundaries/json-patch.json"
    ))
    .expect("JSON Patch boundary corpus parses");
    assert_eq!(corpus["version"], "forge-boundary-fuzz.v1");
    assert_eq!(corpus["surface"], "json-patch");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let base = std::fs::read_to_string(root.join(corpus["base"].as_str().expect("base path")))
        .expect("base contract reads");
    let cases = corpus["cases"].as_array().expect("cases array");
    assert!(cases.len() >= 8);

    for case in cases {
        let id = case["id"].as_str().expect("case id");
        let input = &case["input"];
        let patch = if let Some(raw) = input["rawPatch"].as_str() {
            raw.to_string()
        } else {
            serde_json::to_string(&input["patch"]).expect("patch serializes")
        };
        let result = forge_contract::patch::apply_patch(&base, &patch);
        match case["expect"]["outcome"].as_str() {
            Some("accept") => {
                let output = result.unwrap_or_else(|error| panic!("{id} rejected: {error}"));
                forge_contract::validate_shape(&output)
                    .unwrap_or_else(|error| panic!("{id} emitted invalid shape: {error}"));
            }
            Some("reject") => {
                let error = result.unwrap_err();
                if let Some(expected) = case["expect"]["contains"].as_str() {
                    assert!(
                        error.to_string().contains(expected),
                        "{id} error '{}' does not contain '{expected}'",
                        error
                    );
                }
            }
            other => panic!("{id} has invalid expected outcome {other:?}"),
        }
    }
}
