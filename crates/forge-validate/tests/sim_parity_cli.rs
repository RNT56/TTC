use serde_json::json;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

fn validator_bin() -> &'static str {
    env!("CARGO_BIN_EXE_forge-validate")
}

fn temp_path(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
        "forge-sim-parity-cli-{}-{name}.json",
        std::process::id()
    ))
}

#[test]
fn sim_parity_cli_emits_rapier_baseline_and_compares_mujoco_sample() {
    let rapier_path = temp_path("rapier");
    let mujoco_path = temp_path("mujoco");
    let drift_path = temp_path("mujoco-drift");

    let baseline_output = Command::new(validator_bin())
        .args(["sim-parity", "rapier-baseline", "--out"])
        .arg(&rapier_path)
        .output()
        .expect("rapier-baseline command runs");
    assert!(
        baseline_output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&baseline_output.stderr)
    );

    let baseline_artifact: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&rapier_path).expect("rapier baseline file"))
            .expect("rapier baseline is JSON");
    assert_eq!(baseline_artifact["artifactKind"], "simParityRapierBaseline");
    let baseline = &baseline_artifact["baseline"];
    let mujoco = json!({
        "dropHeightM": baseline["dropHeightM"].as_f64().unwrap(),
        "mujocoDropTimeS": baseline["rapierDropTimeS"].as_f64().unwrap(),
        "pendulumLengthM": baseline["pendulumLengthM"].as_f64().unwrap(),
        "mujocoPendulumPeriodS": baseline["rapierPendulumPeriodS"].as_f64().unwrap(),
        "mujocoHoverTrim": baseline["rapierHoverTrim"].as_f64().unwrap(),
        "mujocoGaitComM": baseline["rapierGaitComM"].as_f64().unwrap(),
        "driverDtS": baseline["driverDtS"].as_f64().unwrap(),
        "substeps": baseline["substeps"].as_u64().unwrap()
    });
    fs::write(
        &mujoco_path,
        serde_json::to_string_pretty(&mujoco).expect("mujoco sample serializes"),
    )
    .expect("write mujoco sample");

    let compare_output = Command::new(validator_bin())
        .args(["sim-parity", "compare", "--rapier"])
        .arg(&rapier_path)
        .args(["--mujoco"])
        .arg(&mujoco_path)
        .output()
        .expect("compare command runs");
    assert!(
        compare_output.status.success(),
        "stderr={}",
        String::from_utf8_lossy(&compare_output.stderr)
    );
    let comparison: serde_json::Value =
        serde_json::from_slice(&compare_output.stdout).expect("comparison is JSON");
    assert_eq!(comparison["artifactKind"], "simParityComparison");
    assert_eq!(comparison["report"]["passed"], true);

    let mut drift = mujoco;
    drift["mujocoDropTimeS"] = json!(baseline["rapierDropTimeS"].as_f64().unwrap() + 0.1);
    fs::write(
        &drift_path,
        serde_json::to_string_pretty(&drift).expect("drift sample serializes"),
    )
    .expect("write drift sample");
    let drift_output = Command::new(validator_bin())
        .args(["sim-parity", "compare", "--rapier"])
        .arg(&rapier_path)
        .args(["--mujoco"])
        .arg(&drift_path)
        .output()
        .expect("drift compare command runs");
    assert_eq!(
        drift_output.status.code(),
        Some(2),
        "stderr={}",
        String::from_utf8_lossy(&drift_output.stderr)
    );

    let _ = fs::remove_file(rapier_path);
    let _ = fs::remove_file(mujoco_path);
    let _ = fs::remove_file(drift_path);
}
