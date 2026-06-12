#!/usr/bin/env node
// XT-001: cross-target golden-number comparison (D17). Runs the SAME canonical
// scenes through the native forge-golden binary and the WASM facade in Node,
// and requires byte-identical report lines — bake buffers and the 600-step
// tick stream hashed to the ULP inside the core on both targets.
//
//   node scripts/golden-compare.mjs [--pkg <dir>] [--bin <forge-golden>]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const pkgDir = flag("--pkg", "packages/studio/src/wasm-pkg");
const nativeBin = flag("--bin", "target/debug/forge-golden");

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
const glue = await import(pathToFileURL(join(process.cwd(), pkgDir, "forge_wasm.js")).href);
const wasmBytes = readFileSync(join(pkgDir, "forge_wasm_bg.wasm"));
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

if (failures > 0) {
  console.error(
    `golden-compare: ${failures} mismatch(es) — native and WASM disagree (XT-001/D17 violation)`,
  );
  process.exit(1);
}
console.log("golden-compare: native ↔ WASM bit-identical on all canonical scenes (XT-001)");
