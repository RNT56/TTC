//! forge-validate CLI — the gatekeeper as a distributable artifact (D17).
//!
//!   forge-validate run <contract.json> [--report out.json] [--as-draft]
//!   forge-validate bake <contract.json> [--out bake.json]
//!   forge-validate patch <contract.json> <patch.json> [--out out.json]
//!   forge-validate migrate <contract.json> [--to 2.2.0|current] [--out out.json]
//!   forge-validate env <env.json> [--report out.json] [--as-draft]
//!   forge-validate training-bundle <contract.json> --contract-hash <sha256> [--out bundle.json]
//!   forge-validate sim-parity rapier-baseline [--out baseline.json]
//!   forge-validate sim-parity mujoco-request --source-revision <git-sha> [--out request.json]
//!   forge-validate sim-parity compare --mujoco mujoco-baseline.json [--out report.json]
//!   forge-validate schema [--out schema.json]
//!   forge-validate version [--json]
//!
//! Exit codes: 0 admitted/ok · 1 usage or I/O error · 2 rejected · 3 draft.

use forge_validate::{run_full, EmptyCatalog, Options, Severity, Verdict};
use serde::{de::DeserializeOwned, Serialize};
use sha2::{Digest, Sha256};
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
        Some("training-bundle") => cmd_training_bundle(&args[1..]),
        Some("sim-parity") => cmd_sim_parity(&args[1..]),
        Some("schema") => cmd_schema(&args[1..]),
        Some("version") => cmd_version(&args[1..]),
        Some("--version") | Some("-V") => {
            println!("forge-validate {}", forge_validate::VALIDATOR_VERSION);
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!(
                "usage: forge-validate run <contract.json> [--report out.json] [--catalog dir] [--as-draft]\n       forge-validate bake <contract.json> [--out bake.json] [--catalog dir]\n       forge-validate bom <contract.json> [--out bom.csv|bom.json] [--format csv|json] [--catalog dir]\n       forge-validate patch <contract.json> <patch.json> [--out out.json]\n       forge-validate migrate <contract.json> [--to 2.2.0|current] [--out out.json]\n       forge-validate env <env.json> [--report out.json] [--as-draft]\n       forge-validate training-bundle <contract.json> --contract-hash <sha256> [--out bundle.json]\n       forge-validate sim-parity rapier-baseline [--out baseline.json] [--gravity 9.80665] [--pendulum-length 0.4] [--hover-trim 0.42] [--gait-com 0.004]\n       forge-validate sim-parity mujoco-request --source-revision <git-sha> [--out request.json] [--gravity 9.80665] [--pendulum-length 0.4] [--hover-trim 0.42] [--gait-com 0.004]\n       forge-validate sim-parity compare --mujoco mujoco-baseline.json [--rapier rapier-baseline.json] [--out report.json]\n       forge-validate schema [--out schema.json]\n       forge-validate version [--json]"
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

fn cmd_training_bundle(args: &[String]) -> ExitCode {
    let Some(path) = args.first().filter(|arg| !arg.starts_with("--")) else {
        eprintln!("training-bundle: missing <contract.json>");
        return ExitCode::from(1);
    };
    let Some(expected_hash) = flag_value(args, "--contract-hash") else {
        eprintln!("training-bundle: missing --contract-hash <sha256>");
        return ExitCode::from(1);
    };
    if expected_hash.len() != 64 || !expected_hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        eprintln!("training-bundle: --contract-hash must be 64 hexadecimal characters");
        return ExitCode::from(1);
    }
    let doc = match read_file("training-bundle", path) {
        Ok(doc) => doc,
        Err(code) => return code,
    };
    let actual_hash = {
        let mut hash = Sha256::new();
        hash.update(doc.as_bytes());
        format!("{:x}", hash.finalize())
    };
    if actual_hash != expected_hash.to_ascii_lowercase() {
        eprintln!(
            "training-bundle: immutable admitted-model snapshot hash mismatch (expected {expected_hash}, got {actual_hash})"
        );
        return ExitCode::from(2);
    }
    let report = run_full(&doc, &EmptyCatalog, &Options::default());
    if report.verdict != Verdict::Admitted {
        eprintln!(
            "training-bundle: sovereign validator verdict is {:?}; only admitted contracts may train",
            report.verdict
        );
        return ExitCode::from(2);
    }
    let spec = match forge_contract::validate_shape(&doc) {
        Ok(spec) => spec,
        Err(error) => {
            eprintln!("training-bundle: CTR-001 schema_invalid: {error}");
            return ExitCode::from(2);
        }
    };
    let baked = match forge_geometry::bake(&spec) {
        Ok(baked) => baked,
        Err(error) => {
            eprintln!("training-bundle: {error}");
            return ExitCode::from(2);
        }
    };
    let bundle = match forge_sim::training::training_bundle(&spec, &baked, &expected_hash) {
        Ok(bundle) => bundle,
        Err(error) => {
            eprintln!("training-bundle: {error}");
            return ExitCode::from(2);
        }
    };
    eprintln!(
        "forge-validate training-bundle · {} · {:.3} kg · MuJoCo {} · tensor {}",
        bundle.archetype(),
        bundle.mass_kg(),
        bundle.mujoco_version(),
        bundle.tensor_version()
    );
    emit_json("training-bundle", args, &bundle)
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
    report_version: &'static str,
    env_spec_schema_version: String,
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
        report_version: forge_validate::REPORT_FORMAT_VERSION,
        env_spec_schema_version: env.schema_version.clone(),
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionInfo {
    package_version: &'static str,
    model_spec_schema_version: &'static str,
    validator_report_version: &'static str,
    replay_format_version: &'static str,
    env_spec_schema_version: &'static str,
}

fn cmd_version(args: &[String]) -> ExitCode {
    let versions = VersionInfo {
        package_version: forge_validate::VALIDATOR_VERSION,
        model_spec_schema_version: forge_contract::SCHEMA_VERSION,
        validator_report_version: forge_validate::REPORT_FORMAT_VERSION,
        replay_format_version: forge_sim::runtime::REPLAY_FORMAT_VERSION,
        env_spec_schema_version: forge_sim::runtime::ENVSPEC_SCHEMA_VERSION,
    };
    if args.iter().any(|arg| arg == "--json") {
        println!(
            "{}",
            serde_json::to_string_pretty(&versions).expect("versions serialize")
        );
    } else {
        println!("forge-validate {}", versions.package_version);
        println!("ModelSpec schema {}", versions.model_spec_schema_version);
        println!("validator report {}", versions.validator_report_version);
        println!("replay format {}", versions.replay_format_version);
        println!("EnvSpec schema {}", versions.env_spec_schema_version);
    }
    ExitCode::SUCCESS
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimParityRapierBaselineArtifact {
    artifact_kind: &'static str,
    engine: &'static str,
    validator_version: String,
    tolerance: forge_sim::interop::ParityTolerance,
    baseline: forge_sim::interop::RapierParityBaseline,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimParityMuJoCoRequestArtifact {
    #[serde(flatten)]
    request: forge_sim::interop::MuJoCoParityRequest,
    source_revision: String,
    request_sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SimParityComparisonArtifact {
    artifact_kind: &'static str,
    validator_version: String,
    tolerance: forge_sim::interop::ParityTolerance,
    rapier: forge_sim::interop::RapierParityBaseline,
    mujoco: forge_sim::interop::MuJoCoParityBaseline,
    sample: forge_sim::interop::EngineParitySample,
    report: forge_sim::interop::ParityReport,
}

fn cmd_sim_parity(args: &[String]) -> ExitCode {
    match args.first().map(String::as_str) {
        Some("rapier-baseline") => cmd_sim_parity_rapier_baseline(&args[1..]),
        Some("mujoco-request") => cmd_sim_parity_mujoco_request(&args[1..]),
        Some("compare") => cmd_sim_parity_compare(&args[1..]),
        _ => {
            eprintln!(
                "usage: forge-validate sim-parity rapier-baseline [--out baseline.json] [--gravity 9.80665] [--pendulum-length 0.4] [--hover-trim 0.42] [--gait-com 0.004]\n       forge-validate sim-parity mujoco-request --source-revision <git-sha> [--out request.json] [--gravity 9.80665] [--pendulum-length 0.4] [--hover-trim 0.42] [--gait-com 0.004]\n       forge-validate sim-parity compare --mujoco mujoco-baseline.json [--rapier rapier-baseline.json] [--out report.json]"
            );
            ExitCode::from(1)
        }
    }
}

fn cmd_sim_parity_mujoco_request(args: &[String]) -> ExitCode {
    let Some(source_revision) = flag_value(args, "--source-revision") else {
        eprintln!("sim-parity mujoco-request: missing --source-revision <git-sha>");
        return ExitCode::from(1);
    };
    if !(source_revision.len() == 40 || source_revision.len() == 64)
        || !source_revision.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        eprintln!(
            "sim-parity mujoco-request: --source-revision must be a full hexadecimal Git object ID"
        );
        return ExitCode::from(1);
    }
    let gravity = match flag_f64(args, "--gravity", 9.80665, "sim-parity mujoco-request") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let pendulum_length_m =
        match flag_f64(args, "--pendulum-length", 0.4, "sim-parity mujoco-request") {
            Ok(value) => value,
            Err(code) => return code,
        };
    let hover_trim = match flag_f64(args, "--hover-trim", 0.42, "sim-parity mujoco-request") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let gait_com_m = match flag_f64(args, "--gait-com", 0.004, "sim-parity mujoco-request") {
        Ok(value) => value,
        Err(code) => return code,
    };
    let request = match forge_sim::interop::mujoco_parity_request(
        gravity,
        pendulum_length_m,
        hover_trim,
        gait_com_m,
    ) {
        Ok(request) => request,
        Err(error) => {
            eprintln!("sim-parity mujoco-request: {error}");
            return ExitCode::from(2);
        }
    };
    let artifact = SimParityMuJoCoRequestArtifact {
        request_sha256: {
            let mut hash = Sha256::new();
            hash.update(serde_json::to_vec(&request).expect("MuJoCo parity request serializes"));
            hash.finalize()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect()
        },
        request,
        source_revision,
    };
    eprintln!(
        "forge-validate sim-parity mujoco-request · MuJoCo {} · source {}",
        artifact.request.mujoco_version, artifact.source_revision
    );
    emit_json("sim-parity mujoco-request", args, &artifact)
}

fn cmd_sim_parity_rapier_baseline(args: &[String]) -> ExitCode {
    let tolerance = match sim_parity_tolerance(args, "sim-parity rapier-baseline") {
        Ok(tolerance) => tolerance,
        Err(code) => return code,
    };
    let baseline = match rapier_baseline_from_args(args, "sim-parity rapier-baseline") {
        Ok(baseline) => baseline,
        Err(code) => return code,
    };
    let artifact = SimParityRapierBaselineArtifact {
        artifact_kind: "simParityRapierBaseline",
        engine: "rapier",
        validator_version: forge_validate::VALIDATOR_VERSION.to_string(),
        tolerance,
        baseline,
    };
    eprintln!(
        "forge-validate sim-parity rapier-baseline · drop {:.6} s · pendulum {:.6} s",
        artifact.baseline.rapier_drop_time_s, artifact.baseline.rapier_pendulum_period_s
    );
    emit_json("sim-parity rapier-baseline", args, &artifact)
}

fn cmd_sim_parity_compare(args: &[String]) -> ExitCode {
    let Some(mujoco_path) = flag_value(args, "--mujoco") else {
        eprintln!("sim-parity compare: missing --mujoco <baseline.json>");
        return ExitCode::from(1);
    };
    let mujoco: forge_sim::interop::MuJoCoParityBaseline =
        match read_json_baseline("sim-parity compare", &mujoco_path) {
            Ok(baseline) => baseline,
            Err(code) => return code,
        };
    let rapier: forge_sim::interop::RapierParityBaseline = match flag_value(args, "--rapier") {
        Some(path) => match read_json_baseline("sim-parity compare", &path) {
            Ok(baseline) => baseline,
            Err(code) => return code,
        },
        None => match rapier_baseline_from_args(args, "sim-parity compare") {
            Ok(baseline) => baseline,
            Err(code) => return code,
        },
    };
    let tolerance = match sim_parity_tolerance(args, "sim-parity compare") {
        Ok(tolerance) => tolerance,
        Err(code) => return code,
    };
    let sample = match forge_sim::interop::engine_parity_sample_from_baselines(rapier, mujoco) {
        Ok(sample) => sample,
        Err(e) => {
            eprintln!("sim-parity compare: {e}");
            return ExitCode::from(2);
        }
    };
    let report = forge_sim::interop::evaluate_engine_parity(sample, tolerance);
    let artifact = SimParityComparisonArtifact {
        artifact_kind: "simParityComparison",
        validator_version: forge_validate::VALIDATOR_VERSION.to_string(),
        tolerance,
        rapier,
        mujoco,
        sample,
        report,
    };
    eprintln!(
        "forge-validate sim-parity compare · drop Δ {:.6} s · pendulum Δ {:.6} s · hover Δ {:.4} · gait Δ {:.4} m → {}",
        artifact.report.drop_time_error_s,
        artifact.report.pendulum_period_error_s,
        artifact.report.hover_trim_error,
        artifact.report.gait_com_error_m,
        if artifact.report.passed { "passed" } else { "failed" }
    );
    match emit_json("sim-parity compare", args, &artifact) {
        ExitCode::SUCCESS if artifact.report.passed => ExitCode::SUCCESS,
        ExitCode::SUCCESS => ExitCode::from(2),
        code => code,
    }
}

fn rapier_baseline_from_args(
    args: &[String],
    command: &str,
) -> Result<forge_sim::interop::RapierParityBaseline, ExitCode> {
    let gravity = flag_f64(args, "--gravity", 9.80665, command)?;
    let pendulum_length_m = flag_f64(args, "--pendulum-length", 0.4, command)?;
    let hover_trim = flag_f64(args, "--hover-trim", 0.42, command)?;
    let gait_com_m = flag_f64(args, "--gait-com", 0.004, command)?;
    match forge_sim::interop::rapier_engine_baseline(
        gravity,
        pendulum_length_m,
        hover_trim,
        gait_com_m,
    ) {
        Ok(baseline) => Ok(baseline),
        Err(e) => {
            eprintln!("{command}: Rapier baseline failed: {e}");
            Err(ExitCode::from(2))
        }
    }
}

fn sim_parity_tolerance(
    args: &[String],
    command: &str,
) -> Result<forge_sim::interop::ParityTolerance, ExitCode> {
    let mut tolerance = forge_sim::interop::ParityTolerance::default();
    tolerance.max_drop_time_error_s = flag_f64(
        args,
        "--max-drop-error",
        tolerance.max_drop_time_error_s,
        command,
    )?;
    tolerance.max_pendulum_period_error_s = flag_f64(
        args,
        "--max-pendulum-error",
        tolerance.max_pendulum_period_error_s,
        command,
    )?;
    tolerance.max_hover_trim_error = flag_f64(
        args,
        "--max-hover-error",
        tolerance.max_hover_trim_error,
        command,
    )?;
    tolerance.max_gait_com_error_m = flag_f64(
        args,
        "--max-gait-com-error",
        tolerance.max_gait_com_error_m,
        command,
    )?;
    Ok(tolerance)
}

fn flag_f64(args: &[String], flag: &str, default: f64, command: &str) -> Result<f64, ExitCode> {
    let Some(index) = args.iter().position(|arg| arg == flag) else {
        return Ok(default);
    };
    match args.get(index + 1).filter(|raw| !raw.starts_with("--")) {
        Some(raw) => match raw.parse::<f64>() {
            Ok(value) if value.is_finite() => Ok(value),
            _ => {
                eprintln!("{command}: {flag} must be a finite number");
                Err(ExitCode::from(1))
            }
        },
        None => {
            eprintln!("{command}: {flag} requires a value");
            Err(ExitCode::from(1))
        }
    }
}

fn read_json_baseline<T>(command: &str, path: &str) -> Result<T, ExitCode>
where
    T: DeserializeOwned,
{
    let doc = read_file(command, path)?;
    let value: serde_json::Value = match serde_json::from_str(&doc) {
        Ok(value) => value,
        Err(e) => {
            eprintln!("{command}: cannot parse {path} as JSON: {e}");
            return Err(ExitCode::from(1));
        }
    };
    match serde_json::from_value(value.clone()) {
        Ok(decoded) => Ok(decoded),
        Err(root_err) => match value.get("baseline") {
            Some(baseline) => match serde_json::from_value(baseline.clone()) {
                Ok(decoded) => Ok(decoded),
                Err(baseline_err) => {
                    eprintln!(
                        "{command}: cannot decode {path} as baseline: {baseline_err}; root decode also failed: {root_err}"
                    );
                    Err(ExitCode::from(2))
                }
            },
            None => {
                eprintln!("{command}: cannot decode {path} as baseline: {root_err}");
                Err(ExitCode::from(2))
            }
        },
    }
}

fn emit_json<T: Serialize>(command: &str, args: &[String], value: &T) -> ExitCode {
    match flag_value(args, "--out") {
        Some(out) => match write_json(&out, value) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("{command}: cannot write {out}: {e}");
                ExitCode::from(1)
            }
        },
        None => {
            println!(
                "{}",
                serde_json::to_string_pretty(value).expect("value serializes")
            );
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
