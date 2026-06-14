//! XC-24 corpus contract: the generator fuzz seeds are stable, uniquely named,
//! and use the minimized mutation vocabulary consumed by scripts/fuzz-contract-seeds.mjs.

use std::collections::BTreeSet;

#[test]
fn modelspec_fuzz_seed_corpus_shape_is_pinned() {
    let corpus: serde_json::Value =
        serde_json::from_str(include_str!("../../../evals/fuzz/modelspec-seeds.json")).unwrap();
    assert_eq!(corpus["version"], "modelspec-fuzz-seeds.v1");
    let seeds = corpus["seeds"].as_array().expect("seeds array");
    assert!(seeds.len() >= 8, "expected a meaningful seed set");

    let mut ids = BTreeSet::new();
    let mut covered_checks = BTreeSet::new();
    for seed in seeds {
        let id = seed["id"].as_str().expect("seed id");
        assert!(ids.insert(id.to_string()), "duplicate seed id {id}");
        assert!(seed["base"].as_str().is_some(), "{id} missing base");
        assert!(seed["focus"].as_str().is_some(), "{id} missing focus");
        let mutations = seed["mutations"].as_array().expect("mutations array");
        assert!(!mutations.is_empty(), "{id} has no mutations");
        for mutation in mutations {
            let op = mutation["op"].as_str().expect("mutation op");
            assert!(
                matches!(op, "set" | "delete" | "append"),
                "{id} uses unknown op {op}",
            );
            let path = mutation["path"].as_str().expect("mutation path");
            assert!(
                path.starts_with('/'),
                "{id} path is not a JSON pointer: {path}"
            );
        }
        let expect = &seed["expect"];
        assert!(matches!(
            expect["verdict"].as_str(),
            Some("admitted" | "draft" | "rejected")
        ));
        for check in expect["errorChecks"].as_array().expect("errorChecks array") {
            covered_checks.insert(check.as_str().expect("check id").to_string());
        }
    }

    for required in [
        "CTR-001", "CTR-002", "CTR-005", "CTR-006", "CTR-007", "GEO-006", "MFG-001", "MFG-004",
        "PRV-001",
    ] {
        assert!(
            covered_checks.contains(required),
            "missing fuzz seed for {required}"
        );
    }
}
