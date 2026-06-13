//! forge-golden — the native side of the cross-target golden-number suite
//! (XT-001, D17). Prints one report line per contract; the WASM side
//! (scripts/golden-compare.mjs) must produce byte-identical lines.
//!
//!   forge-golden <contract.json> [<contract.json> …]

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("usage: forge-golden <contract.json> [<contract.json> …]");
        return ExitCode::from(1);
    }
    for path in &args {
        let doc = match std::fs::read_to_string(path) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("forge-golden: cannot read {path}: {e}");
                return ExitCode::from(1);
            }
        };
        match forge_wasm::golden::golden_report(&doc) {
            Ok(report) => println!("{report}"),
            Err(e) => {
                eprintln!("forge-golden: {path}: {e}");
                return ExitCode::from(2);
            }
        }
    }
    ExitCode::SUCCESS
}
