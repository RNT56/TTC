#!/usr/bin/env node
// P0-008: extraction harness for the prototype monolith (read-only).
//
// The monolith's model builders (N/P registry, primitives, buildHumanoid,
// buildDrone) are pure math — no DOM. We slice exactly that segment out of the
// HTML and evaluate it in a Node vm sandbox, then replicate loadModel()'s
// reset+build+count core per model. Output feeds scripts/compare-counts.mjs
// (P0-004 byte-equivalence) and, later, the golden-number corpus (P1-006).
//
//   node scripts/extract-counts.mjs [prototype/cad-object-studio.html] [--out file]
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const args = process.argv.slice(2);
const htmlPath = args.find((a) => !a.startsWith("--")) ?? "prototype/cad-object-studio.html";
const outIdx = args.indexOf("--out");
const outPath = outIdx >= 0 ? args[outIdx + 1] : "prototype/extracted-counts.json";

const html = readFileSync(htmlPath, "utf8");
const sha256 = createHash("sha256").update(html).digest("hex");

// slice: math + primitives + N/P registry + palette + both builders + MODELS
const start = html.indexOf("function mul(a,b)");
const end = html.indexOf("var statsBase=");
if (start < 0 || end < 0 || end <= start) {
  console.error("extract-counts: slice markers not found — monolith layout changed?");
  process.exit(1);
}
const slice = html.slice(start, end);

const context = vm.createContext({
  Math,
  Array,
  Float32Array,
  parseInt,
  console,
});
vm.runInContext(slice, context, { filename: "monolith-slice.js" });

const ids = Object.keys(context.MODELS);
const models = ids.map((id) => {
  // replicate loadModel()'s reset + build + count core (read-only: we never
  // touch the file, only evaluate a copy of its code)
  vm.runInContext(
    "nodes={};matCache={};parts=[];faceTotal=0;chains=[];model=MODELS[" +
      JSON.stringify(id) +
      "].build();",
    context,
  );
  const parts = context.parts;
  const vertices = parts.reduce((s, p) => s + p.v.length, 0);
  return {
    model: id,
    name: context.model.name,
    kind: context.model.kind,
    parts: parts.length,
    faces: context.faceTotal,
    vertices,
    nodes: Object.keys(context.nodes).length,
    chains: context.chains.length,
    leaderFlagged: parts.filter((p) => p.ld).length,
    explodeWindows: parts.filter((p) => p.em > 0).length,
  };
});

const out = {
  source: `${htmlPath} @ sha256:${sha256.slice(0, 16)}…`,
  sha256,
  extractedAt: new Date().toISOString(),
  models,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
for (const m of models) {
  console.log(
    `${m.model} (${m.name}): ${m.parts} parts · ${m.faces} faces · ${m.vertices} vertices · ${m.nodes} nodes · ${m.chains} chains · ${m.explodeWindows} explode windows (${m.leaderFlagged} leader-flagged)`,
  );
}
console.log(`wrote ${outPath}`);
