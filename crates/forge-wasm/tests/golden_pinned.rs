//! Golden hashes pinned in time (XT-001's second axis): any change to core
//! math shows up here as an explicit fixture update, never silently.
//! Regenerate after an INTENTIONAL change:
//!   cargo run -p forge-wasm --bin forge-golden -- examples/*.forge.json \
//!     > crates/forge-wasm/tests/fixtures/golden.jsonl   (review the diff!)

#[test]
fn golden_hashes_match_pinned_fixture() {
    let fixture = include_str!("fixtures/golden.jsonl");
    let examples = [
        "../../examples/vx2-mini.forge.json",
        "../../examples/qd-mini.forge.json",
        "../../examples/hrx7.forge.json",
        "../../examples/vx2-hornet.forge.json",
    ];
    for (path, pinned) in examples.iter().zip(fixture.lines()) {
        let doc = std::fs::read_to_string(path).unwrap();
        let report = forge_wasm::golden::golden_report(&doc).unwrap();
        assert_eq!(
            report, pinned,
            "golden drift for {path} — if intentional, regenerate the fixture and review"
        );
    }
}
