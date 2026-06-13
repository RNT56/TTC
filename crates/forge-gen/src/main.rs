//! forge-gen CLI — parametric families as commands.
//!
//!   forge-gen quadruped [--leg-pairs N] [--wheelbase M] [--track M]
//!                       [--stand M] [--mass-g G] [--out file.json]

use forge_gen::{generate_quadruped, QuadGenParams};
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("quadruped") => cmd_quadruped(&args[1..]),
        _ => {
            eprintln!(
                "usage: forge-gen quadruped [--leg-pairs N] [--wheelbase M] [--track M] [--stand M] [--mass-g G] [--out file.json]"
            );
            ExitCode::from(1)
        }
    }
}

fn flag<T: std::str::FromStr>(args: &[String], name: &str) -> Option<T> {
    args.iter()
        .position(|a| a == name)
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
}

fn cmd_quadruped(args: &[String]) -> ExitCode {
    let defaults = QuadGenParams::default();
    let params = QuadGenParams {
        leg_pairs: flag(args, "--leg-pairs").unwrap_or(defaults.leg_pairs),
        wheelbase_m: flag(args, "--wheelbase").unwrap_or(defaults.wheelbase_m),
        track_m: flag(args, "--track").unwrap_or(defaults.track_m),
        stand_m: flag(args, "--stand").unwrap_or(defaults.stand_m),
        mass_g: flag(args, "--mass-g").unwrap_or(defaults.mass_g),
    };
    let spec = match generate_quadruped(&params) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("forge-gen: {e}");
            return ExitCode::from(1);
        }
    };
    let json = serde_json::to_string_pretty(&spec).expect("spec serializes");
    eprintln!(
        "forge-gen: {} — {} nodes · {} parts · {:.0} g",
        spec.meta.id,
        spec.skeleton.len(),
        spec.parts.len(),
        spec.sim.aggregate_mass_g.unwrap_or(0.0)
    );
    match args
        .iter()
        .position(|a| a == "--out")
        .and_then(|i| args.get(i + 1))
    {
        Some(out) => match std::fs::write(out, json) {
            Ok(()) => ExitCode::SUCCESS,
            Err(e) => {
                eprintln!("forge-gen: cannot write {out}: {e}");
                ExitCode::from(1)
            }
        },
        None => {
            println!("{json}");
            ExitCode::SUCCESS
        }
    }
}
