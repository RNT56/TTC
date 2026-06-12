#!/usr/bin/env node
// OD-08: napi-rs hot path vs binary spawn in the gateway — the measurement
// the decision is recorded from (see docs/DECISIONS.md). Two candidates:
//   spawn      — the gateway's shipping path: temp files + execFile of the
//                static forge-validate binary (process isolation, guaranteed
//                bit-equality with CI).
//   in-process — the WASM facade in Node, a conservative PROXY for napi-rs
//                (same in-process characteristics; napi would only be faster).
//
//   node scripts/od08-measure.mjs [--bin target/debug/forge-validate]
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const bin = flag("--bin", "target/debug/forge-validate");
const pkgDir = flag("--pkg", "packages/studio/src/wasm-pkg");

const DOCS = {
  "vx2-mini (16 parts)": readFileSync("examples/vx2-mini.forge.json", "utf8"),
  "hrx7 (125 parts)": readFileSync("examples/hrx7.forge.json", "utf8"),
};

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b);
  return { best: s[0], p50: s[Math.floor(s.length / 2)], worst: s[s.length - 1] };
}

const glue = await import(pathToFileURL(resolve(pkgDir, "forge_wasm.js")).href);
await glue.default({ module_or_path: readFileSync(resolve(pkgDir, "forge_wasm_bg.wasm")) });

const N = 15;
for (const [label, doc] of Object.entries(DOCS)) {
  // spawn path — exactly what the gateway does per request
  const spawnSamples = [];
  for (let i = 0; i < N; i++) {
    const dir = mkdtempSync(join(tmpdir(), "od08-"));
    const contract = join(dir, "c.json");
    const report = join(dir, "r.json");
    writeFileSync(contract, doc);
    const t0 = performance.now();
    try {
      execFileSync(bin, ["run", contract, "--report", report], { stdio: "pipe" });
    } catch {
      // rejection exit codes are fine — the report was produced
    }
    JSON.parse(readFileSync(report, "utf8"));
    spawnSamples.push(performance.now() - t0);
    rmSync(dir, { recursive: true, force: true });
  }
  // in-process path (napi proxy)
  for (let i = 0; i < 3; i++) glue.validate(doc); // warm
  const inprocSamples = [];
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    JSON.parse(glue.validate(doc));
    inprocSamples.push(performance.now() - t0);
  }
  const sp = stats(spawnSamples);
  const ip = stats(inprocSamples);
  console.log(`${label}:`);
  console.log(
    `  spawn      best ${sp.best.toFixed(1)} ms · p50 ${sp.p50.toFixed(1)} · worst ${sp.worst.toFixed(1)}`,
  );
  console.log(
    `  in-process best ${ip.best.toFixed(1)} ms · p50 ${ip.p50.toFixed(1)} · worst ${ip.worst.toFixed(1)}`,
  );
}
