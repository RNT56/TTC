//! P1-001 oracle parity: the Rust biped + FPV driver ports replay the exact
//! scripted input tapes recorded from the frozen prototype's own pipeline
//! (`scripts/extract-trajectories.mjs` → `prototype/trajectories/*.tape.json`)
//! and must land every rot/off channel of every node within a tight tolerance
//! band of the JS oracle.
//!
//! Why banded and not bit-exact: the tapes were produced by a JS engine whose
//! sin/cos/acos/atan2 differ from our `forge_num` (pure-Rust libm) by ULPs.
//! Bit-exactness IS required across our own targets — that's the golden-number
//! suite's job (XT-001) — while this test pins semantic fidelity to the
//! prototype. Measured max deviation at port time: 4.4e-16 (biped) and
//! 7.1e-15 (fpv) over 300 recorded frames × all rot/off channels — ULP-level
//! agreement. The 1e-9 band leaves ~6 orders of magnitude of headroom while
//! still catching any real port bug (a wrong constant, op order, or layer
//! sequence blows past 1e-6 within a few frames).

use forge_motion::biped::BipedDriver;
use forge_motion::fpv::FpvDriver;
use forge_motion::{StickInput, DT};

const TOLERANCE: f64 = 1e-9;

fn repo(path: &str) -> String {
    format!("{}/../../{path}", env!("CARGO_MANIFEST_DIR"))
}

fn load_json(path: &str) -> serde_json::Value {
    let text = std::fs::read_to_string(repo(path)).unwrap_or_else(|e| panic!("{path}: {e}"));
    serde_json::from_str(&text).unwrap()
}

fn spec(path: &str) -> forge_contract::ModelSpec {
    forge_contract::validate_shape(&std::fs::read_to_string(repo(path)).unwrap()).unwrap()
}

/// The extractor passes `t` through `toFixed(10)` (a decimal string the VM
/// re-parses), so the oracle saw a quantized clock. (step+1)/120 never lands
/// on a decimal tie at 10 digits, so Rust's `{:.10}` rounds identically.
fn t_quantized(step: usize) -> f64 {
    format!("{:.10}", (step as f64 + 1.0) * DT).parse().unwrap()
}

/// Scripted input tapes — must mirror scripts/extract-trajectories.mjs
/// verbatim; changing them there is a corpus version bump that lands here too.
fn hrx7_input(step: usize) -> StickInput {
    let mut input = StickInput::default();
    match step / 150 {
        0 => {
            input.mz = 1.0;
        }
        1 => {
            input.mz = 1.0;
            input.run = true;
        }
        2 => {
            input.mz = 0.5;
            input.yaw = 0.5;
        }
        _ => {}
    }
    input
}

fn fpv_input(step: usize) -> StickInput {
    let mut input = StickInput::default();
    match step / 150 {
        0 => {
            input.thr = 0.75;
        }
        1 => {
            input.mz = 0.5;
            input.thr = 0.25;
        }
        2 => {
            input.mz = 0.25;
            input.mx = 0.25;
            input.yaw = 0.5;
        }
        _ => {
            input.thr = -0.25;
        }
    }
    input
}

struct Replay {
    /// max |rust − tape| over every compared channel
    max_dev: f64,
    /// flat pose stream for bit-determinism comparison between runs
    stream: Vec<u64>,
}

fn replay(
    tape: &serde_json::Value,
    mut tick: impl FnMut(usize) -> Vec<(f64, f64, f64, f64, f64, f64)>,
) -> Replay {
    let nodes: Vec<&str> = tape["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_str().unwrap())
        .collect();
    let frames = tape["frames"].as_array().unwrap();
    let steps = tape["steps"].as_u64().unwrap() as usize;
    let every = tape["recordEvery"].as_u64().unwrap() as usize;
    assert_eq!(tape["dt"].as_f64().unwrap(), DT);
    assert_eq!(frames.len(), steps / every);

    let mut max_dev = 0.0_f64;
    let mut stream = Vec::new();
    let mut recorded = 0usize;
    for step in 0..steps {
        let poses = tick(step);
        assert_eq!(poses.len(), nodes.len(), "driver covers every tape node");
        if (step + 1) % every == 0 {
            let frame = frames[recorded].as_array().unwrap();
            recorded += 1;
            for (i, (rx, ry, rz, ox, oy, oz)) in poses.iter().enumerate() {
                let ch = |c: usize| frame[i * 9 + c].as_f64().unwrap();
                for (got, want) in [
                    (*rx, ch(3)),
                    (*ry, ch(4)),
                    (*rz, ch(5)),
                    (*ox, ch(6)),
                    (*oy, ch(7)),
                    (*oz, ch(8)),
                ] {
                    max_dev = max_dev.max((got - want).abs());
                    stream.push(got.to_bits());
                }
            }
        }
    }
    Replay { max_dev, stream }
}

fn biped_run(tape: &serde_json::Value) -> Replay {
    let spec = spec("examples/hrx7.forge.json");
    let mut driver = BipedDriver::new(&spec);
    let nodes: Vec<String> = tape["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_str().unwrap().to_string())
        .collect();
    replay(tape, move |step| {
        driver.tick(&hrx7_input(step), [0.0, 0.0, 1.0], DT, t_quantized(step));
        nodes
            .iter()
            .map(|n| {
                let p = driver.poses.get(n).unwrap();
                (p.rot[0], p.rot[1], p.rot[2], p.off[0], p.off[1], p.off[2])
            })
            .collect()
    })
}

fn fpv_run(tape: &serde_json::Value) -> Replay {
    let spec = spec("examples/vx2-hornet.forge.json");
    let mut driver = FpvDriver::new(&spec);
    let nodes: Vec<String> = tape["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_str().unwrap().to_string())
        .collect();
    replay(tape, move |step| {
        driver.tick(&fpv_input(step), DT, t_quantized(step));
        nodes
            .iter()
            .map(|n| {
                let p = driver.poses.get(n).unwrap();
                (p.rot[0], p.rot[1], p.rot[2], p.off[0], p.off[1], p.off[2])
            })
            .collect()
    })
}

#[test]
fn biped_port_matches_the_hrx7_tape() {
    let tape = load_json("prototype/trajectories/hrx7.tape.json");
    let run = biped_run(&tape);
    eprintln!("hrx7 tape max deviation: {:.3e}", run.max_dev);
    assert!(
        run.max_dev < TOLERANCE,
        "biped port drifted from the JS oracle: max dev {:.3e} ≥ {TOLERANCE:.0e}",
        run.max_dev
    );
    // and the port is deterministic on this target, bit for bit (D17)
    let again = biped_run(&tape);
    assert_eq!(run.stream, again.stream, "bit-identical replay");
}

#[test]
fn fpv_port_matches_the_fpv_tape() {
    let tape = load_json("prototype/trajectories/fpv.tape.json");
    let run = fpv_run(&tape);
    eprintln!("fpv tape max deviation: {:.3e}", run.max_dev);
    assert!(
        run.max_dev < TOLERANCE,
        "fpv port drifted from the JS oracle: max dev {:.3e} ≥ {TOLERANCE:.0e}",
        run.max_dev
    );
    let again = fpv_run(&tape);
    assert_eq!(run.stream, again.stream, "bit-identical replay");
}

#[test]
fn tape_skeleton_positions_match_the_translated_contracts() {
    // the tape's static pos channels and the contract skeleton both descend
    // from the same monolith source — they must agree exactly
    for (tape_path, spec_path) in [
        (
            "prototype/trajectories/hrx7.tape.json",
            "examples/hrx7.forge.json",
        ),
        (
            "prototype/trajectories/fpv.tape.json",
            "examples/vx2-hornet.forge.json",
        ),
    ] {
        let tape = load_json(tape_path);
        let spec = spec(spec_path);
        let nodes = tape["nodes"].as_array().unwrap();
        let frame0 = tape["frames"][0].as_array().unwrap();
        for (i, name) in nodes.iter().enumerate() {
            let name = name.as_str().unwrap();
            let node = spec
                .node(name)
                .unwrap_or_else(|| panic!("{spec_path} is missing tape node {name}"));
            for c in 0..3 {
                assert_eq!(
                    frame0[i * 9 + c].as_f64().unwrap(),
                    node.pos[c],
                    "{name}.pos[{c}] differs between tape and contract"
                );
            }
        }
    }
}
