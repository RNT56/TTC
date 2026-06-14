//! forge-validate CLI — the gatekeeper as a distributable artifact (D17).
//!
//!   forge-validate run <contract.json> [--report out.json] [--as-draft]
//!   forge-validate bake <contract.json> [--out bake.json]
//!   forge-validate patch <contract.json> <patch.json> [--out out.json]
//!   forge-validate migrate <contract.json> [--to 2.1.0|current] [--out out.json]
//!   forge-validate env <env.json> [--report out.json] [--as-draft]
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
        Some("patch") => cmd_patch(&args[1..]),
        Some("migrate") => cmd_migrate(&args[1..]),
        Some("env") => cmd_env(&args[1..]),
        Some("schema") => cmd_schema(&args[1..]),
        _ => {
            eprintln!(
                "usage: forge-validate run <contract.json> [--report out.json] [--catalog dir] [--as-draft]\n       forge-validate bake <contract.json> [--out bake.json] [--catalog dir]\n       forge-validate bom <contract.json> [--out bom.csv|bom.json] [--format csv|json] [--catalog dir]\n       forge-validate patch <contract.json> <patch.json> [--out out.json]\n       forge-validate migrate <contract.json> [--to 2.1.0|current] [--out out.json]\n       forge-validate env <env.json> [--report out.json] [--as-draft]\n       forge-validate schema [--out schema.json]"
            );
            ExitCode::from(1)
        }
    }
}

fn read_file(command: &str, path: &str) -> Result<String, ExitCode> {
    match std::fs::read_to_string(path) {
        Ok(d) => Ok(d),
        Err(e) => {
            eprintln!("{command}: cannot read {path}: {e}");
            Err(ExitCode::from(1))
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
    let doc = match read_file("run", path) {
        Ok(d) => d,
        Err(code) => return code,
    };
    let opts = Options {
        as_draft: args.iter().any(|a| a == "--as-draft"),
        ..Default::default()
    };
    // --catalog <dir>: resolve componentRefs against file-backed rows
    // (P3-007a); without it every ref is unresolved (EmptyCatalog).
    let file_catalog = match load_catalog(args, "run") {
        Ok(c) => c,
        Err(code) => return code,
    };
    let catalog = catalog_ref(file_catalog.as_ref());
    let report = run_full(&doc, catalog, &opts);

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

fn load_catalog(
    args: &[String],
    command: &str,
) -> Result<Option<forge_validate::file_catalog::FileCatalog>, ExitCode> {
    Ok(match flag_value(args, "--catalog") {
        Some(dir) => {
            match forge_validate::file_catalog::FileCatalog::load(std::path::Path::new(&dir)) {
                Ok(c) => Some(c),
                Err(e) => {
                    eprintln!("{command}: catalog load failed: {e}");
                    return Err(ExitCode::from(1));
                }
            }
        }
        None => None,
    })
}

fn catalog_ref(
    file_catalog: Option<&forge_validate::file_catalog::FileCatalog>,
) -> &dyn forge_contract::CatalogSource {
    match file_catalog {
        Some(c) => c,
        None => &EmptyCatalog,
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
    let doc = match read_file("bake", path) {
        Ok(d) => d,
        Err(code) => return code,
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
    let file_catalog = match load_catalog(args, "bake") {
        Ok(c) => c,
        Err(code) => return code,
    };
    let catalog = catalog_ref(file_catalog.as_ref());
    let artifact = BakeArtifact {
        contract_hash: forge_contract::contract_hash(&spec),
        schema_version: forge_contract::SCHEMA_VERSION.to_string(),
        counts: forge_validate::Counts {
            parts: baked.parts.len(),
            faces: baked.total_polygons,
            vertices: baked.total_vertices,
            triangles: baked.total_faces,
        },
        hud: forge_sim::derive_hud_with_catalog(&spec, &baked, catalog).ok(),
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
    let doc = match read_file("bom", path) {
        Ok(d) => d,
        Err(code) => return code,
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
    let file_catalog = match load_catalog(args, "bom") {
        Ok(c) => c,
        Err(code) => return code,
    };
    let catalog = catalog_ref(file_catalog.as_ref());
    let rows = forge_validate::bom_rows_with_catalog(&spec, &baked, catalog);
    let format = flag_value(args, "--format")
        .or_else(|| {
            flag_value(args, "--out").and_then(|out| {
                if out.ends_with(".json") {
                    Some("json".to_string())
                } else {
                    None
                }
            })
        })
        .unwrap_or_else(|| "csv".to_string());
    let body = match format.as_str() {
        "csv" => forge_validate::bom_csv(&rows),
        "json" => serde_json::to_string_pretty(&rows).expect("bom rows serialize"),
        other => {
            eprintln!("bom: unknown --format '{other}' (expected csv|json)");
            return ExitCode::from(1);
        }
    };
    match flag_value(args, "--out") {
        Some(out) => match std::fs::write(&out, body) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("bom: cannot write {out}: {e}");
                ExitCode::from(1)
            }
        },
        None => {
            print!("{body}");
            if format == "json" {
                println!();
            }
            ExitCode::SUCCESS
        }
    }
}

fn cmd_patch(args: &[String]) -> ExitCode {
    let Some(contract_path) = args.first().filter(|a| !a.starts_with("--")) else {
        eprintln!("patch: missing <contract.json>");
        return ExitCode::from(1);
    };
    let Some(patch_path) = args.get(1).filter(|a| !a.starts_with("--")) else {
        eprintln!("patch: missing <patch.json>");
        return ExitCode::from(1);
    };
    let doc = match read_file("patch", contract_path) {
        Ok(d) => d,
        Err(code) => return code,
    };
    let patch = match read_file("patch", patch_path) {
        Ok(d) => d,
        Err(code) => return code,
    };
    let out = match forge_contract::patch::apply_patch(&doc, &patch) {
        Ok(value) => value,
        Err(e) => {
            eprintln!("patch: {e}");
            return ExitCode::from(2);
        }
    };
    match flag_value(args, "--out") {
        Some(path) => match std::fs::write(&path, out) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("patch: cannot write {path}: {e}");
                ExitCode::from(1)
            }
        },
        None => {
            println!("{out}");
            ExitCode::SUCCESS
        }
    }
}

fn cmd_migrate(args: &[String]) -> ExitCode {
    let Some(path) = args.first().filter(|a| !a.starts_with("--")) else {
        eprintln!("migrate: missing <contract.json>");
        return ExitCode::from(1);
    };
    let doc = match read_file("migrate", path) {
        Ok(d) => d,
        Err(code) => return code,
    };
    let target = flag_value(args, "--to").unwrap_or_else(|| forge_contract::SCHEMA_VERSION.into());
    let report = match forge_contract::migrate_with_report(&doc, &target) {
        Ok(report) => report,
        Err(e) => {
            eprintln!("migrate: {e}");
            return ExitCode::from(2);
        }
    };
    eprintln!(
        "migrate: schema {} -> {} · {} step(s)",
        report.from_schema_version,
        report.to_schema_version,
        report.applied.len()
    );
    for step in &report.applied {
        eprintln!("  {step}");
    }
    match flag_value(args, "--out") {
        Some(out) => {
            if let Err(e) = write_json(&out, &report.spec) {
                eprintln!("migrate: cannot write {out}: {e}");
                return ExitCode::from(1);
            }
            ExitCode::SUCCESS
        }
        None => {
            println!(
                "{}",
                serde_json::to_string_pretty(&report.spec).expect("spec serializes")
            );
            ExitCode::SUCCESS
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvCounts {
    tasks: usize,
    obstacles: usize,
    gates: usize,
    spawns: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvReport {
    artifact_kind: &'static str,
    target: &'static str,
    validator_version: String,
    results: Vec<forge_sim::runtime::EnvDiagnostic>,
    verdict: Verdict,
    counts: EnvCounts,
}

fn cmd_env(args: &[String]) -> ExitCode {
    let Some(path) = args.first().filter(|a| !a.starts_with("--")) else {
        eprintln!("env: missing <env.json>");
        return ExitCode::from(1);
    };
    let doc = match read_file("env", path) {
        Ok(d) => d,
        Err(code) => return code,
    };
    let env: forge_sim::runtime::EnvSpec = match serde_json::from_str(&doc) {
        Ok(env) => env,
        Err(e) => {
            eprintln!("env: ENV-000 schema_invalid: {e}");
            return ExitCode::from(2);
        }
    };
    let results = forge_sim::runtime::validate_envspec(&env);
    let has_errors = results.iter().any(|diag| diag.severity == "error");
    let as_draft = args.iter().any(|a| a == "--as-draft");
    let verdict = if has_errors && as_draft {
        Verdict::Draft
    } else if has_errors {
        Verdict::Rejected
    } else {
        Verdict::Admitted
    };
    let report = EnvReport {
        artifact_kind: "env",
        target: "env",
        validator_version: forge_validate::VALIDATOR_VERSION.to_string(),
        results,
        verdict,
        counts: EnvCounts {
            tasks: env.tasks.len(),
            obstacles: env.obstacles.len(),
            gates: env.gates.len(),
            spawns: env.spawns.len(),
        },
    };
    eprintln!(
        "forge-validate env · {} tasks · {} gates · {} spawns → {:?}",
        report.counts.tasks, report.counts.gates, report.counts.spawns, report.verdict
    );
    if let Some(out) = flag_value(args, "--report") {
        if let Err(e) = write_json(&out, &report) {
            eprintln!("env: cannot write report {out}: {e}");
            return ExitCode::from(1);
        }
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(&report).expect("env report serializes")
        );
    }
    match report.verdict {
        Verdict::Admitted => ExitCode::SUCCESS,
        Verdict::Rejected => ExitCode::from(2),
        Verdict::Draft => ExitCode::from(3),
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
