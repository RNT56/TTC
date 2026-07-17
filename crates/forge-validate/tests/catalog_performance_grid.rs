//! D66 compatibility corpus for versioned file-catalog performance grids.

use forge_contract::CatalogSource;
use forge_validate::file_catalog::FileCatalog;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);

fn corpus() -> Value {
    serde_json::from_str(include_str!(
        "../../../evals/fuzz/boundaries/catalog-performance-grid.json"
    ))
    .expect("catalog performance corpus parses")
}

fn materialize(fixture: &Value, shape: &str) -> Value {
    let mut row = fixture.clone();
    match shape {
        "current" => {}
        "legacy-markerless" | "legacy-explicit" => {
            let object = row.as_object_mut().expect("row object");
            if shape == "legacy-markerless" {
                object.remove("schemaVersion");
            } else {
                object.insert(
                    "schemaVersion".to_string(),
                    Value::String("1.0.0".to_string()),
                );
            }
            let table = object["thrustTables"][0]
                .as_object_mut()
                .expect("table object");
            table.insert("voltage".to_string(), serde_json::json!(25.2));
            let points = table["points"].as_array_mut().expect("points array");
            points.truncate(2);
            for point in points {
                point
                    .as_object_mut()
                    .expect("point object")
                    .remove("voltage");
            }
        }
        other => panic!("unknown catalog-grid corpus shape {other}"),
    }
    row
}

fn mutate(document: &mut Value, mutation: &Value) {
    let pointer = mutation["path"].as_str().expect("mutation path");
    if mutation["$delete"] == Value::Bool(true) {
        let (parent_pointer, key) = pointer.rsplit_once('/').expect("nested pointer");
        let parent = document
            .pointer_mut(parent_pointer)
            .expect("known mutation parent");
        if let Some(array) = parent.as_array_mut() {
            array.remove(key.parse::<usize>().expect("array index"));
        } else {
            parent.as_object_mut().expect("object parent").remove(key);
        }
    } else if let Some(target) = document.pointer_mut(pointer) {
        *target = mutation["value"].clone();
    } else {
        let (parent_pointer, key) = pointer.rsplit_once('/').expect("nested pointer");
        document
            .pointer_mut(parent_pointer)
            .expect("known mutation parent")
            .as_object_mut()
            .expect("object parent")
            .insert(key.to_string(), mutation["value"].clone());
    }
}

fn load_one(row: &Value) -> Result<FileCatalog, String> {
    let suffix = NEXT_TEMP.fetch_add(1, Ordering::Relaxed);
    let root = std::env::temp_dir().join(format!(
        "forge-catalog-grid-{}-{suffix}",
        std::process::id()
    ));
    let components = root.join("components");
    std::fs::create_dir_all(&components).expect("temp catalog directory");
    std::fs::write(
        components.join("row.json"),
        serde_json::to_vec_pretty(row).expect("row encodes"),
    )
    .expect("temp catalog row writes");
    let result = FileCatalog::load(&root);
    std::fs::remove_dir_all(&root).expect("temp catalog cleanup");
    result
}

#[test]
fn catalog_performance_grid_corpus_matches_loader_outcomes() {
    let corpus = corpus();
    assert_eq!(corpus["version"], "forge-boundary-fuzz.v1");
    let fixture = &corpus["fixture"];
    let cases = corpus["cases"].as_array().expect("cases array");
    assert!(cases.len() >= 8);
    for test_case in cases {
        let id = test_case["id"].as_str().expect("case id");
        let mut row = materialize(
            fixture,
            test_case["input"]["shape"].as_str().expect("case shape"),
        );
        if let Some(mutation) = test_case["input"].get("mutation") {
            mutate(&mut row, mutation);
        }
        if let Some(mutations) = test_case["input"].get("mutations") {
            for mutation in mutations.as_array().expect("mutations array") {
                mutate(&mut row, mutation);
            }
        }
        match test_case["expect"]["outcome"].as_str() {
            Some("accept") => {
                let catalog = load_one(&row).unwrap_or_else(|error| panic!("{id}: {error}"));
                let component = catalog
                    .component("cmp_motor_grid_fixture")
                    .expect("fixture component");
                assert_eq!(
                    component.row_schema_version,
                    test_case["expect"]["schemaVersion"]
                        .as_str()
                        .expect("expected schema version"),
                    "{id}"
                );
                let points = &component.thrust_tables[0].points;
                let range = [
                    points
                        .iter()
                        .map(|point| point.voltage)
                        .fold(f64::INFINITY, f64::min),
                    points
                        .iter()
                        .map(|point| point.voltage)
                        .fold(f64::NEG_INFINITY, f64::max),
                ];
                let expected = test_case["expect"]["voltageRangeV"]
                    .as_array()
                    .expect("expected voltage range");
                assert_eq!(
                    range,
                    [expected[0].as_f64().unwrap(), expected[1].as_f64().unwrap()]
                );
            }
            Some("reject") => {
                let error = load_one(&row).expect_err(id);
                let fragment = test_case["expect"]["contains"]
                    .as_str()
                    .expect("error fragment");
                assert!(
                    error.contains(fragment),
                    "{id}: error '{error}' does not contain '{fragment}'"
                );
            }
            other => panic!("{id}: invalid outcome {other:?}"),
        }
    }
}
