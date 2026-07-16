use std::process::Command;

fn validator_bin() -> &'static str {
    env!("CARGO_BIN_EXE_forge-validate")
}

#[test]
fn short_version_reports_package_semver() {
    let output = Command::new(validator_bin())
        .arg("--version")
        .output()
        .expect("validator runs");
    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).expect("utf8").trim(),
        format!("forge-validate {}", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn json_version_reports_independent_data_contracts() {
    let output = Command::new(validator_bin())
        .args(["version", "--json"])
        .output()
        .expect("validator runs");
    assert!(output.status.success());
    let value: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("version JSON parses");
    assert_eq!(value["packageVersion"], env!("CARGO_PKG_VERSION"));
    assert_eq!(
        value["modelSpecSchemaVersion"],
        forge_contract::SCHEMA_VERSION
    );
    assert_eq!(
        value["validatorReportVersion"],
        forge_validate::REPORT_FORMAT_VERSION
    );
    assert_eq!(
        value["replayFormatVersion"],
        forge_sim::runtime::REPLAY_FORMAT_VERSION
    );
    assert_eq!(
        value["envSpecSchemaVersion"],
        forge_sim::runtime::ENVSPEC_SCHEMA_VERSION
    );
    assert_eq!(
        value["recorderVerificationFormatVersion"],
        forge_validate::recorder::RECORDER_VERIFICATION_SCHEMA_VERSION
    );
}
