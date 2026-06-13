#!/usr/bin/env node
// P2-006: the full validation suite over EVERY first-party contract, with
// declared expectations (examples/expected-verdicts.json). The verdict and
// the exact set of ERROR check ids are pinned — a check regression, a
// quietly-weakened gate, or an undeclared new contract all fail CI.
//
//   node scripts/validate-all.mjs [--bin target/debug/forge-validate]
//
// Runs WITH the file-backed catalog (catalog/) so componentRef contracts
// (the proof pair) resolve — contracts without refs are unaffected.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const bin = flag("--bin", "target/debug/forge-validate");

const expected = JSON.parse(readFileSync("examples/expected-verdicts.json", "utf8"));
const contracts = readdirSync("examples")
  .filter((f) => f.endsWith(".forge.json"))
  .sort();

const tmp = mkdtempSync(join(tmpdir(), "forge-verdicts-"));
let failures = 0;
for (const file of contracts) {
  const id = file.replace(/\.forge\.json$/, "");
  const want = expected[id];
  if (!want) {
    console.error(`FAIL ${file}: no entry in examples/expected-verdicts.json — declare one`);
    failures++;
    continue;
  }
  const out = join(tmp, "report.json");
  try {
    execFileSync(bin, ["run", join("examples", file), "--report", out, "--catalog", "catalog"], { stdio: "pipe" });
  } catch {
    // rejection exits nonzero by design; the report is still written
  }
  const report = JSON.parse(readFileSync(out, "utf8"));
  const errors = [
    ...new Set(report.results.filter((d) => d.severity === "error").map((d) => d.check)),
  ].sort();
  const verdictOk = report.verdict === want.verdict;
  const errorsOk = JSON.stringify(errors) === JSON.stringify([...want.errors].sort());
  const ok = verdictOk && errorsOk;
  if (!ok) failures++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${id}: ${report.verdict} (errors: ${errors.join(", ") || "none"})` +
      (ok ? "" : ` — expected ${want.verdict} (${want.errors.join(", ") || "none"})`),
  );
}
rmSync(tmp, { recursive: true, force: true });

// expectations must not reference contracts that no longer exist
for (const id of Object.keys(expected)) {
  if (id.startsWith("_")) continue;
  if (!contracts.includes(`${id}.forge.json`)) {
    console.error(`FAIL expected-verdicts.json lists '${id}' but examples/${id}.forge.json is gone`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`validate-all: ${failures} contract(s) drifted from declared expectations`);
  process.exit(1);
}
console.log(`validate-all: ${contracts.length} first-party contracts match declared verdicts (P2-006)`);
