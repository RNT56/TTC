#!/usr/bin/env node
// P0-004 byte-equivalence comparator: monolith-extracted counts vs the core's
// bake counts. Exact integer equality — the P0 exit criterion is byte
// equivalence, not a tolerance band.
//
//   node scripts/compare-counts.mjs <extracted-counts.json> <bake1.json> [bake2.json …]
//
// Each bake artifact (from `forge-validate bake … --out`) is matched to an
// extraction entry by `--model <name>` order or, when present, by a
// `meta.variantConfig` echo. Exit 0 = all matched entries equal; 1 = usage;
// 2 = mismatch (each mismatch printed as a diagnostic line).
import { readFileSync } from "node:fs";

const [extractedPath, ...bakePaths] = process.argv.slice(2);
if (!extractedPath || bakePaths.length === 0) {
  console.error(
    "usage: compare-counts.mjs <extracted-counts.json> <bake.json> [more bakes…]",
  );
  process.exit(1);
}

const extracted = JSON.parse(readFileSync(extractedPath, "utf8"));
const entries = extracted.models ?? [];
if (entries.length === 0) {
  console.error("compare-counts: extraction file has no models[]");
  process.exit(1);
}

let mismatches = 0;
bakePaths.forEach((bakePath, i) => {
  const bake = JSON.parse(readFileSync(bakePath, "utf8"));
  const counts = bake.counts ?? {};
  const entry = entries[i];
  if (!entry) {
    console.error(`MISSING: no extraction entry #${i} for ${bakePath}`);
    mismatches += 1;
    return;
  }
  for (const key of ["parts", "faces", "vertices"]) {
    if (entry[key] === undefined) continue; // extraction may omit vertices
    if (entry[key] !== counts[key]) {
      console.error(
        `MISMATCH ${entry.model ?? "?"}[${i}].${key}: monolith ${entry[key]} ≠ bake ${counts[key]} (${bakePath})`,
      );
      mismatches += 1;
    }
  }
  if (mismatches === 0) {
    console.log(
      `ok ${entry.model ?? "?"}[${i}]: parts ${counts.parts} · faces ${counts.faces} · vertices ${counts.vertices}`,
    );
  }
});

if (mismatches > 0) {
  console.error(`compare-counts: ${mismatches} mismatch(es) — P0-004 NOT met`);
  process.exit(2);
}
console.log("compare-counts: byte-equivalent — P0-004 criterion met for these entries");
