//! forge-validate CLI — the gatekeeper as a distributable artifact (D17).
//!
//!   forge-validate run <contract.json> [--report out.json] [--as-draft]
//!   forge-validate bake <contract.json> [--out bake.json]
//!   forge-validate schema [--out schema.json]
//!
//! Exit codes: 0 admitted/ok · 1 usage or I/O error · 2 rejected · 3 draft.

use forge_validate::{run_full, EmptyCatalog, Options, Severity, Verdict};
use serde::Serialize;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("run") => cmd_run(&args[1..]),
        Some("bake") => cmd_bake(&args[1..]),
        Some("bom") => cmd_bom(&args[1..]),
        Some("schema") => cmd_schema(&args[1..]),
        _ => {
            eprintln!(
                "usage: forge-validate run <contract.json> [--report out.json] [--as-draft]\n       forge-validate bake <contract.json> [--out bake.json]\n       forge-validate bom <contract.json> [--out bom.csv]\n       forge-validate schema [--out schema.json]"
            );
            ExitCode::from(1)
        }
    }
}

fn flag_value(args: &[String], flag: &str) -> Option<String> {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1).cloned())
}

fn cmd_run(args: &[String]) -> ExitCode {
    let Some(path) = args.first().filter(|a| !a.starts_with("--")) else {
        eprintln!("run: missing <contract.json>");
        return ExitCode::from(1);
    };
    let doc = match std::fs::read_to_string(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("run: cannot read {path}: {e}");
            return ExitCode::from(1);
        }
    };
    let opts = Options {
        as_draft: args.iter().any(|a| a == "--as-draft"),
        ..Default::default()
    };
    let report = run_full(&doc, &EmptyCatalog, &opts);

    let errors = report
        .results
        .iter()
        .filter(|d| d.severity == Severity::Error)
        .count();
    let warns = report
        .results
        .iter()
        .filter(|d| d.severity == Severity::Warn)
        .count();
    eprintln!(
        "forge-validate {} · target {} · {} parts · {} faces · {} errors · {} warns → {:?}",
        report.validator_version,
        report.target,
        report.counts.parts,
        report.counts.faces,
        errors,
        warns,
        report.verdict
    );
    for diag in &report.results {
        eprintln!("  [{:?}] {} — {}", diag.severity, diag.check, diag.message);
    }
    if let Some(hud) = &report.hud {
        eprintln!(
            "  HUD: AUW {:.0} g · TWR {} · hover {} · endurance {} min",
            hud.auw_g,
            hud.twr
                .map(|v| format!("{v:.2}"))
                .unwrap_or_else(|| "—".into()),
            hud.hover_throttle
                .map(|v| format!("{:.0} %", v * 100.0))
                .unwrap_or_else(|| "—".into()),
            hud.endurance_min
                .map(|v| format!("{v:.1}"))
                .unwrap_or_else(|| "—".into()),
        );
    }

    if let Some(out) = flag_value(args, "--report") {
        if let Err(e) = write_json(&out, &report) {
            eprintln!("run: cannot write report {out}: {e}");
            return ExitCode::from(1);
        }
    }
    match report.verdict {
        Verdict::Admitted => ExitCode::SUCCESS,
        Verdict::Rejected => ExitCode::from(2),
        Verdict::Draft => ExitCode::from(3),
    }
}

/// The bake artifact the studio consumes (truth from core; TS only renders).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BakeArtifact {
    contract_hash: String,
    schema_version: String,
    counts: forge_validate::Counts,
    #[serde(skip_serializing_if = "Option::is_none")]
    hud: Option<forge_sim::Hud>,
    baked: forge_geometry::BakedModel,
}

fn cmd_bake(args: &[String]) -> ExitCode {
    let Some(path) = args.first().filter(|a| !a.starts_with("--")) else {
        eprintln!("bake: missing <contract.json>");
        return ExitCode::from(1);
    };
    let doc = match std::fs::read_to_string(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("bake: cannot read {path}: {e}");
            return ExitCode::from(1);
        }
    };
    let spec = match forge_contract::validate_shape(&doc) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("bake: CTR-001 schema_invalid: {e}");
            return ExitCode::from(2);
        }
    };
    let baked = match forge_geometry::bake(&spec) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("bake: {e}");
            return ExitCode::from(2);
        }
    };
    let artifact = BakeArtifact {
        contract_hash: forge_contract::contract_hash(&spec),
        schema_version: forge_contract::SCHEMA_VERSION.to_string(),
        counts: forge_validate::Counts {
            parts: baked.parts.len(),
            faces: baked.total_faces,
            vertices: baked.total_vertices,
        },
        hud: forge_sim::derive_hud(&spec, &baked).ok(),
        baked,
    };
    eprintln!(
        "bake: {} parts · {} faces · {} vertices",
        artifact.counts.parts, artifact.counts.faces, artifact.counts.vertices
    );
    match flag_value(args, "--out") {
        Some(out) => {
            if let Err(e) = write_json(&out, &artifact) {
                eprintln!("bake: cannot write {out}: {e}");
                return ExitCode::from(1);
            }
            ExitCode::SUCCESS
        }
        None => {
            println!(
                "{}",
                serde_json::to_string(&artifact).expect("artifact serializes")
            );
            ExitCode::SUCCESS
        }
    }
}

fn cmd_bom(args: &[String]) -> ExitCode {
    let Some(path) = args.first().filter(|a| !a.starts_with("--")) else {
        eprintln!("bom: missing <contract.json>");
        return ExitCode::from(1);
    };
    let doc = match std::fs::read_to_string(path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("bom: cannot read {path}: {e}");
            return ExitCode::from(1);
        }
    };
    let spec = match forge_contract::validate_shape(&doc) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("bom: CTR-001 schema_invalid: {e}");
            return ExitCode::from(2);
        }
    };
    let baked = match forge_geometry::bake(&spec) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("bom: {e}");
            return ExitCode::from(2);
        }
    };
    let csv = forge_validate::bom_csv(&forge_validate::bom_rows(&spec, &baked));
    match flag_value(args, "--out") {
        Some(out) => match std::fs::write(&out, csv) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("bom: cannot write {out}: {e}");
                ExitCode::from(1)
            }
        },
        None => {
            print!("{csv}");
            ExitCode::SUCCESS
        }
    }
}

fn cmd_schema(args: &[String]) -> ExitCode {
    let schema = forge_contract::emit_json_schema();
    match flag_value(args, "--out") {
        Some(out) => match std::fs::write(&out, schema) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("schema: cannot write {out}: {e}");
                ExitCode::from(1)
            }
        },
        None => {
            println!("{schema}");
            ExitCode::SUCCESS
        }
    }
}

fn write_json<T: Serialize>(path: &str, value: &T) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(value).expect("value serializes");
    std::fs::write(path, json)
}
