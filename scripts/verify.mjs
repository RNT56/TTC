#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const temp = mkdtempSync(join(tmpdir(), "forge-verify-"));
const wasmPackage = join(temp, "wasm-pkg");
let step = 0;

function run(label, command, args) {
  step += 1;
  console.log(`\n[verify ${step}] ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) {
    throw new Error(`${label}: could not start ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label}: ${command} exited with status ${result.status}`);
  }
}

function assertSame(label, left, right) {
  if (readFileSync(left).equals(readFileSync(right))) return;
  throw new Error(`${label}: ${left} differs from ${right}`);
}

try {
  run("Immutable workflow action pins", "node", ["scripts/check-actions-pinned.mjs"]);
  run("Deployment topology and configuration policy", "pnpm", ["verify:deployment"]);
  run("Hardened deployable runtime contract", "pnpm", ["verify:hardened-runtime"]);
  run("Compatibility matrix and version contracts", "node", ["scripts/check-compatibility.mjs"]);
  run("Generated API, event, and artifact documentation", "pnpm", ["verify:docs-contracts"]);
  run("Postgres migration runner policy", "pnpm", ["db:migrations:test"]);
  run("Golden artifact review policy", "pnpm", ["verify:goldens"]);
  run("External acceptance evidence policy", "pnpm", ["verify:external-acceptance"]);
  run("Rust formatting", "cargo", ["fmt", "--all", "--check"]);
  run("Rust Clippy", "cargo", ["clippy", "--workspace", "--", "-D", "warnings"]);
  run("Rust workspace tests", "cargo", ["test", "--workspace"]);
  run("WASM target cross-compile", "cargo", ["build", "-p", "forge-wasm", "--target", "wasm32-unknown-unknown"]);
  run("Validator demo admission", "cargo", ["run", "-q", "-p", "forge-validate", "--", "run", "examples/vx2-mini.forge.json"]);

  const generatedSchema = join(temp, "forge-modelspec.schema.json");
  run("Generate schema oracle", "cargo", [
    "run",
    "-q",
    "-p",
    "forge-validate",
    "--",
    "schema",
    "--out",
    generatedSchema,
  ]);
  assertSame("Schema drift", generatedSchema, "schema/forge-modelspec.schema.json");

  run("TypeScript workspace build", "pnpm", ["-r", "build"]);
  run("Studio ONNX policy runtime tests", "pnpm", ["--filter", "@forge/studio", "test"]);
  run("Gateway tests with real validator", "pnpm", ["--filter", "@forge/gateway", "test"]);
  run("Brief-25 real-validator gate", "pnpm", [
    "eval:brief25",
    "--",
    "--validator",
    "real",
    "--out",
    join(temp, "brief25.json"),
  ]);

  run("Frozen-prototype count extraction", "node", [
    "scripts/extract-counts.mjs",
    "prototype/cad-object-studio.html",
    "--out",
    join(temp, "extracted-counts.json"),
  ]);
  run("Frozen-prototype translation", "node", ["scripts/translate-monolith.mjs"]);
  run("Translated contract drift", "git", [
    "diff",
    "--exit-code",
    "--",
    "examples/hrx7.forge.json",
    "examples/vx2-hornet.forge.json",
  ]);
  run("HRX-7 bake oracle", "cargo", [
    "run",
    "-q",
    "-p",
    "forge-validate",
    "--",
    "bake",
    "examples/hrx7.forge.json",
    "--out",
    join(temp, "hrx7.bake.json"),
  ]);
  run("VX-2 Hornet bake oracle", "cargo", [
    "run",
    "-q",
    "-p",
    "forge-validate",
    "--",
    "bake",
    "examples/vx2-hornet.forge.json",
    "--out",
    join(temp, "vx2.bake.json"),
  ]);
  run("Frozen-prototype count comparison", "node", [
    "scripts/compare-counts.mjs",
    "prototype/extracted-counts.json",
    join(temp, "hrx7.bake.json"),
    join(temp, "vx2.bake.json"),
  ]);

  run("Native golden binary", "cargo", ["build", "-p", "forge-wasm", "--bin", "forge-golden"]);
  run("Fresh WASM facade", "pnpm", [
    "exec",
    "wasm-pack",
    "build",
    "crates/forge-wasm",
    "--target",
    "web",
    "--release",
    "--out-dir",
    wasmPackage,
    "--out-name",
    "forge_wasm",
  ]);
  run("Fresh native/WASM parity", "node", [
    "scripts/golden-compare.mjs",
    "--pkg",
    wasmPackage,
    "--bin",
    "target/debug/forge-golden",
  ]);
  run("Committed native/WASM parity", "node", [
    "scripts/golden-compare.mjs",
    "--pkg",
    "packages/studio/src/wasm-pkg",
    "--bin",
    "target/debug/forge-golden",
  ]);
  run("Deterministic performance budgets", "node", ["scripts/budgets.mjs", "--pkg", wasmPackage]);
  run("Declared first-party verdicts", "node", ["scripts/validate-all.mjs"]);
  run("Deterministic trajectory extraction", "node", ["scripts/extract-trajectories.mjs"]);
  run("Trajectory oracle drift", "git", ["diff", "--exit-code", "--", "prototype/trajectories"]);

  run("Contract fuzz corpus", "pnpm", ["fuzz:contract:check"]);
  run("Pinned simulation parity", "pnpm", ["sim:parity:check"]);
  run("Archive extraction policy", "node", ["--test", "scripts/archive-policy.test.mjs"]);
  run("Validator release packaging", "pnpm", ["release:validator:check"]);
  run("Pilot and hardware-policy invariants", "pnpm", ["pilot:check"]);
  run("Python worker tests", "pnpm", ["--filter", "@forge/workers", "test"]);
  run("Real seeded multirotor + ground MuJoCo-SB3-ONNX smoke", "node", [
    "scripts/training-smoke.mjs",
    "--out",
    join(temp, "p7-sb3-smoke.json"),
  ]);
  run("Exact telemetry BC + randomized PPO fine-tune", "node", [
    "scripts/offline-training-smoke.mjs",
    "--out",
    join(temp, "p7-offline-training.json"),
  ]);
  run("Controlled MuJoCo-MJX feasibility", "node", [
    "scripts/mjx-feasibility-smoke.mjs",
    "--out",
    join(temp, "p7-mjx-feasibility.json"),
  ]);
  run("Co-design cross-platform authority policy", "pnpm", ["codesign:platform-compare:test"]);
  run("Controlled native/Rapier/MuJoCo co-design smoke", "node", [
    "scripts/codesign-engine-smoke.mjs",
    "--out",
    join(temp, "p9-engine-smoke.json"),
  ]);
  run("Pinned CMA-ES/TPE 200-proposal co-design search plan", "node", [
    "scripts/codesign-search-plan-smoke.mjs",
    "--out",
    join(temp, "p9-search-plan.json"),
  ]);
  run("Checkpointed exact-hash 200-candidate co-design engine batch", "node", [
    "scripts/codesign-engine-batch-smoke.mjs",
    "--out",
    join(temp, "p9-engine-batch.json"),
  ]);
  run("Whitespace and patch hygiene", "node", ["scripts/check-patch-hygiene.mjs"]);

  console.log(`\nverify: ${step} required local gates passed`);
} catch (error) {
  console.error(`\nverify: FAILED — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
