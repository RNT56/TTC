use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;

fn validator_bin() -> &'static str {
    env!("CARGO_BIN_EXE_forge-validate")
}

fn example() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/vx2-mini.forge.json")
}

fn catalog_example() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/vx2-proof.forge.json")
}

fn catalog() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../catalog")
}

#[test]
fn training_bundle_catalog_major_binds_mass_inertia_and_rejects_inapplicable_table() {
    let path = catalog_example();
    let bytes = std::fs::read(&path).unwrap();
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let output = Command::new(validator_bin())
        .args([
            "training-bundle",
            path.to_str().unwrap(),
            "--contract-hash",
            &hash,
            "--catalog",
            catalog().to_str().unwrap(),
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let bundle: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(bundle["schemaVersion"], "3.0.0");
    assert_eq!(bundle["massKg"], 0.769);
    assert_eq!(
        bundle["catalogPhysics"]["schemaVersion"],
        "forge-training-catalog-physics/1.0.0"
    );
    assert_eq!(bundle["catalogPhysics"]["baseContractMassKg"], 0.479);
    assert_eq!(
        bundle["catalogPhysics"]["batteryOperatingVoltageV"],
        serde_json::json!([14.8, 16.8])
    );
    assert_eq!(bundle["catalogPhysics"]["equippedProp"]["diameterIn"], 5.0);
    assert_eq!(
        bundle["catalogPhysics"]["components"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let motor = bundle["catalogPhysics"]["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|component| component["category"] == "motor")
        .unwrap();
    assert_eq!(motor["quantity"], 4);
    assert_eq!(motor["geometry"]["model"], "uniform-cylinder-y");
    assert_eq!(motor["thrustTables"][0]["pointCount"], 2);
    assert_eq!(
        motor["thrustTables"][0]["voltageRangeV"],
        serde_json::json!([25.2, 25.2])
    );
    assert_eq!(motor["thrustTables"][0]["usedForCurve"], false);
    assert_eq!(
        motor["thrustTables"][0]["inapplicabilityReasons"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(bundle["powertrain"]["maxTotalCurrentA"], 120.0);
    assert!(
        bundle["powertrain"]["curve"][100]["totalThrustN"]
            .as_f64()
            .unwrap()
            > bundle["massKg"].as_f64().unwrap() * 9.80665
    );
}

#[test]
fn codesign_cli_binds_snapshot_and_emits_engine_proof() {
    let path = example();
    let bytes = std::fs::read(&path).unwrap();
    let hash = format!("{:x}", Sha256::digest(&bytes));
    let first = Command::new(validator_bin())
        .args([
            "codesign-evaluate",
            path.to_str().unwrap(),
            "--snapshot-hash",
            &hash,
        ])
        .output()
        .unwrap();
    let second = Command::new(validator_bin())
        .args([
            "codesign-evaluate",
            path.to_str().unwrap(),
            "--snapshot-hash",
            &hash,
        ])
        .output()
        .unwrap();
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    assert!(
        second.status.success(),
        "{}",
        String::from_utf8_lossy(&second.stderr)
    );
    let first: serde_json::Value = serde_json::from_slice(&first.stdout).unwrap();
    let second: serde_json::Value = serde_json::from_slice(&second.stdout).unwrap();
    assert_eq!(
        first["schemaVersion"],
        "forge-codesign-native-evaluation/1.0.0"
    );
    assert_eq!(first["candidateSnapshotSha256"], hash);
    assert_eq!(first["tier0"]["passed"], true);
    assert_eq!(first["tier1"]["engine"], "rapier3d/0.33.0");
    assert_eq!(first["tier1"]["passed"], true);
    assert_eq!(
        first["tier1"]["trajectorySha256"],
        second["tier1"]["trajectorySha256"]
    );
    assert_eq!(first["nonclaims"]["mujocoEvaluated"], false);
}

#[test]
fn codesign_cli_rejects_snapshot_hash_drift_before_evaluation() {
    let path = example();
    let output = Command::new(validator_bin())
        .args([
            "codesign-evaluate",
            path.to_str().unwrap(),
            "--snapshot-hash",
            &"0".repeat(64),
        ])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("snapshot hash mismatch"));
}
