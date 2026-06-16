use forge_validate::{EmptyCatalog, Options, Severity, Verdict};

fn assert_import_is_admitted_and_driveable(spec: &forge_contract::ModelSpec) {
    let doc = serde_json::to_string(spec).expect("imported contract serializes");
    let report = forge_validate::run_full(&doc, &EmptyCatalog, &Options::default());
    let errors: Vec<_> = report
        .results
        .iter()
        .filter(|diag| diag.severity == Severity::Error)
        .collect();
    assert_eq!(
        report.verdict,
        Verdict::Admitted,
        "imported contract must be admitted; errors: {errors:#?}"
    );

    let mut rover = forge_motion::RoverDriver::new(spec);
    let input = forge_motion::InputFrame {
        drive: 1.0,
        ..Default::default()
    };
    let steps = (1.0 / forge_motion::DT / rover.max_speed_ms).ceil() as usize;
    for _ in 0..steps {
        rover.tick(&input, forge_motion::DT);
    }
    let dist = (rover.pose[0] * rover.pose[0] + rover.pose[1] * rover.pose[1]).sqrt();
    assert!(
        (dist - 1.0).abs() <= 0.05,
        "imported rover drove {dist:.3} m instead of 1 m"
    );
}

#[test]
fn external_urdf_import_is_admitted_and_driveable() {
    let spec = forge_sim::interop::import_urdf_contract(include_str!(
        "../../forge-sim/tests/fixtures/import_rover.urdf"
    ))
    .expect("external URDF fixture imports");
    assert_eq!(spec.meta.id, "fixture_rover");
    assert_import_is_admitted_and_driveable(&spec);
}

#[test]
fn external_mjcf_import_is_admitted_and_driveable() {
    let spec = forge_sim::interop::import_mjcf_contract(include_str!(
        "../../forge-sim/tests/fixtures/import_rover.mjcf"
    ))
    .expect("external MJCF fixture imports");
    assert_eq!(spec.meta.id, "fixture_mjcf_rover");
    assert_import_is_admitted_and_driveable(&spec);
}
