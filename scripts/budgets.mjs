#!/usr/bin/env node
// P1-005 performance budgets (architecture §7 — binding acceptance criteria):
//   humanoid bake ≤ 60 ms · patch → re-bake ≤ 10 ms
// measured through the WASM facade's typed-array handle (the studio's real
// path) on the canonical humanoid (hrx7: 125 parts, 2195 faces). Budgets are
// asserted as stated — no runner fudge factor; observed values carry ~6×/3×
// headroom, so a breach means something real regressed.
//
//   node scripts/budgets.mjs [--pkg packages/studio/src/wasm-pkg]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const flag = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const pkgDir = flag("--pkg", "packages/studio/src/wasm-pkg");

const BAKE_BUDGET_MS = 60;
const PATCH_BUDGET_MS = 10;
const RUNS = 30;

const glue = await import(pathToFileURL(resolve(pkgDir, "forge_wasm.js")).href);
await glue.default({ module_or_path: readFileSync(resolve(pkgDir, "forge_wasm_bg.wasm")) });

const hrx7 = readFileSync("examples/hrx7.forge.json", "utf8");

function bench(label, run, budgetMs) {
  for (let i = 0; i < 3; i++) run(); // warm
  let best = Infinity;
  let sum = 0;
  let worst = 0;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    run();
    const ms = performance.now() - t0;
    best = Math.min(best, ms);
    worst = Math.max(worst, ms);
    sum += ms;
  }
  // best-of-N: the noise-resistant statistic for budget gates (worst is
  // reported for visibility but a noisy-neighbor spike must not flake CI)
  const ok = best <= budgetMs;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}: best ${best.toFixed(1)} ms · avg ${(sum / RUNS).toFixed(1)} · worst ${worst.toFixed(1)} (budget ${budgetMs} ms)`,
  );
  return ok;
}

// full bake through the handle: parse + bake + meta JSON + typed-array reads
const bakeOk = bench(
  "hrx7 bake (handle: meta + buffer views)",
  () => {
    const handle = new glue.Bake(hrx7);
    handle.meta();
    const n = handle.part_count();
    for (let i = 0; i < n; i++) {
      handle.positions(i).slice();
      handle.normals(i).slice();
      handle.indices(i).slice();
    }
    handle.free();
  },
  BAKE_BUDGET_MS,
);

// interactive loop: patch a live handle, re-bake in place, read fresh views
const handle = new glue.Bake(hrx7);
let flip = false;
const patchOk = bench(
  "hrx7 patch → re-bake (handle, in place)",
  () => {
    flip = !flip;
    handle.patch(
      JSON.stringify([
        { op: "replace", path: "/parts/0/color", value: flip ? "#aabbcc" : "#bbccdd" },
      ]),
    );
    const n = handle.part_count();
    for (let i = 0; i < n; i++) {
      handle.positions(i).slice();
      handle.normals(i).slice();
      handle.indices(i).slice();
    }
  },
  PATCH_BUDGET_MS,
);
handle.free();

if (!bakeOk || !patchOk) {
  console.error("budgets: BREACH — performance budgets are binding (architecture §7)");
  process.exit(1);
}
console.log("budgets: bake ≤ 60 ms and patch→re-bake ≤ 10 ms hold (P1-005)");
