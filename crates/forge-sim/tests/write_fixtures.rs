//! Regenerates the XC-04 golden fixtures. Ignored by default — run explicitly
//! after an intentional exporter change and review the diff:
//!   cargo test -p forge-sim --test write_fixtures -- --ignored
#[test]
#[ignore]
fn write_golden_fixtures() {
    let doc = std::fs::read_to_string("../../examples/vx2-mini.forge.json").unwrap();
    let spec = forge_contract::validate_shape(&doc).unwrap();
    let baked = forge_geometry::bake(&spec).unwrap();
    std::fs::write(
        "tests/fixtures/vx2-mini.urdf",
        forge_sim::export::to_urdf(&spec, &baked),
    )
    .unwrap();
    std::fs::write(
        "tests/fixtures/vx2-mini.mjcf.xml",
        forge_sim::export::to_mjcf(&spec, &baked),
    )
    .unwrap();
}
