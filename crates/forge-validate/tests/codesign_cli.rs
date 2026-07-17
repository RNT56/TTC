use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::Command;

fn validator_bin() -> &'static str {
    env!("CARGO_BIN_EXE_forge-validate")
}

fn example() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/vx2-mini.forge.json")
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
