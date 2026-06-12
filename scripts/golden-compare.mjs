#!/usr/bin/env node
// XT-001: cross-target golden-number comparison (D17). Runs the SAME canonical
// scenes through the native forge-golden binary and the WASM facade in Node,
// and requires byte-identical report lines — bake buffers and the 600-step
// tick stream hashed to the ULP inside the core on both targets.
//
// Also gates VALIDATOR REPORTS cross-target: native `forge-validate run`
// vs the facade's `validate()`, deep-equal after normalizing the three
// declared-volatile fields (startedAt, durationMs, target). Added after the
// wasm validate path was found trapping on std::time — a path no other gate
// exercised.
//
//   node scripts/golden-compare.mjs [--pkg <dir>] [--bin <forge-golden>]
//                                   [--validator <forge-validate>]
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const pkgDir = flag("--pkg", "packages/studio/src/wasm-pkg");
const nativeBin = flag("--bin", "target/debug/forge-golden");
const validatorBin = flag("--validator", "target/debug/forge-validate");

const EXAMPLES = [
  "examples/vx2-mini.forge.json",
  "examples/qd-mini.forge.json",
  "examples/hrx7.forge.json",
  "examples/vx2-hornet.forge.json",
];

// native reports, one JSON line per example
const nativeLines = execFileSync(nativeBin, EXAMPLES, { encoding: "utf8" })
  .trim()
  .split("\n");

// WASM reports via the facade (web target initialized from bytes — no fetch)
const glue = await import(pathToFileURL(resolve(pkgDir, "forge_wasm.js")).href);
const wasmBytes = readFileSync(resolve(pkgDir, "forge_wasm_bg.wasm"));
await glue.default({ module_or_path: wasmBytes });

let failures = 0;
EXAMPLES.forEach((path, i) => {
  const wasmLine = glue.golden(readFileSync(path, "utf8"));
  const ok = wasmLine === nativeLines[i];
  console.log(`${ok ? "ok  " : "FAIL"} ${path}`);
  if (!ok) {
    console.log(`  native: ${nativeLines[i]}`);
    console.log(`  wasm:   ${wasmLine}`);
    failures += 1;
  }
});

// validator reports: native binary vs facade, volatile fields normalized
const normalize = (report) => {
  const r = JSON.parse(JSON.stringify(report));
  delete r.startedAt;
  delete r.durationMs;
  delete r.target;
  return JSON.stringify(r);
};
const tmp = mkdtempSync(join(tmpdir(), "forge-reports-"));
EXAMPLES.forEach((path) => {
  const out = join(tmp, "report.json");
  // rejection exits nonzero by design — the report file is still written
  spawnSync(validatorBin, ["run", path, "--report", out]);
  const native = normalize(JSON.parse(readFileSync(out, "utf8")));
  const wasm = normalize(JSON.parse(glue.validate(readFileSync(path, "utf8"))));
  const ok = native === wasm;
  console.log(`${ok ? "ok  " : "FAIL"} ${path} (validator report)`);
  if (!ok) {
    console.log(`  native: ${native.slice(0, 400)}`);
    console.log(`  wasm:   ${wasm.slice(0, 400)}`);
    failures += 1;
  }
});
rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.error(
    `golden-compare: ${failures} mismatch(es) — native and WASM disagree (XT-001/D17 violation)`,
  );
  process.exit(1);
}
console.log(
  "golden-compare: native ↔ WASM bit-identical on all canonical scenes + validator reports (XT-001)",
);
