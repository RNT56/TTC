#!/usr/bin/env node
// XC-24: deterministic ModelSpec fuzz seed checker and minimized regression flow.
//
// Normal mode materializes every seed in evals/fuzz/modelspec-seeds.json, runs
// forge-validate, and pins the verdict plus ERROR check IDs. Minimize mode takes
// any failing contract and greedily removes optional content while preserving a
// requested diagnostic check:
//
//   node scripts/fuzz-contract-seeds.mjs
//   node scripts/fuzz-contract-seeds.mjs --write-seeds-dir artifacts/fuzz-seeds
//   node scripts/fuzz-contract-seeds.mjs --minimize bad.forge.json --check MFG-001 --out minimized.json

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function fail(message) {
  console.error(`fuzz-contract-seeds: ${message}`);
  process.exit(1);
}

const corpusPath = resolve(repoRoot, argValue("--corpus", "evals/fuzz/modelspec-seeds.json"));
const catalogPath = resolve(repoRoot, argValue("--catalog", "catalog"));
const binPath = resolve(repoRoot, argValue("--bin", "target/debug/forge-validate"));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function pointerParts(pointer) {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`bad JSON pointer '${pointer}'`);
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function parentAt(document, pointer, createMissing = false) {
  const parts = pointerParts(pointer);
  if (parts.length === 0) throw new Error("mutation path cannot target the document root");
  let target = document;
  for (const part of parts.slice(0, -1)) {
    if (!(part in target)) {
      if (!createMissing) throw new Error(`path '${pointer}' is missing '${part}'`);
      target[part] = {};
    }
    target = target[part];
    if (typeof target !== "object" || target === null) {
      throw new Error(`path '${pointer}' crosses non-object '${part}'`);
    }
  }
  return [target, parts[parts.length - 1]];
}

function applyMutation(document, mutation) {
  if (!["set", "delete", "append"].includes(mutation.op)) {
    throw new Error(`unknown mutation op '${mutation.op}'`);
  }
  if (typeof mutation.path !== "string") {
    throw new Error("mutation path must be a JSON pointer string");
  }

  if (mutation.op === "set") {
    const [parent, key] = parentAt(document, mutation.path, true);
    parent[key] = mutation.value;
    return;
  }

  if (mutation.op === "delete") {
    const [parent, key] = parentAt(document, mutation.path, false);
    if (Array.isArray(parent)) {
      parent.splice(Number(key), 1);
    } else {
      delete parent[key];
    }
    return;
  }

  const [parent, key] = parentAt(document, mutation.path, true);
  if (parent[key] === undefined) parent[key] = [];
  if (!Array.isArray(parent[key])) throw new Error(`append target '${mutation.path}' is not an array`);
  parent[key].push(mutation.value);
}

function materializeSeed(seed) {
  if (typeof seed.id !== "string" || seed.id.trim() === "") throw new Error("seed.id is required");
  if (typeof seed.base !== "string") throw new Error(`${seed.id}: base path is required`);
  if (!Array.isArray(seed.mutations)) throw new Error(`${seed.id}: mutations must be an array`);
  if (!seed.expect || typeof seed.expect.verdict !== "string" || !Array.isArray(seed.expect.errorChecks)) {
    throw new Error(`${seed.id}: expect.verdict and expect.errorChecks are required`);
  }
  const document = readJson(resolve(repoRoot, seed.base));
  for (const mutation of seed.mutations) applyMutation(document, mutation);
  return document;
}

function runValidator(contractPath, reportPath) {
  const validatorArgs = ["run", contractPath, "--catalog", catalogPath, "--report", reportPath];
  try {
    if (existsSync(binPath)) {
      execFileSync(binPath, validatorArgs, { cwd: repoRoot, stdio: "pipe" });
    } else {
      execFileSync("cargo", ["run", "-q", "-p", "forge-validate", "--", ...validatorArgs], {
        cwd: repoRoot,
        stdio: "pipe",
      });
    }
  } catch {
    // Rejections intentionally exit non-zero; the report is the contract.
  }
  if (!existsSync(reportPath)) {
    throw new Error(`validator did not write report for ${contractPath}`);
  }
  return readJson(reportPath);
}

function errorChecks(report) {
  return [
    ...new Set(
      report.results
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => diagnostic.check),
    ),
  ].sort();
}

function allChecks(report) {
  return [...new Set(report.results.map((diagnostic) => diagnostic.check))].sort();
}

function sameArray(a, b) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function checkCorpus() {
  const corpus = readJson(corpusPath);
  if (corpus.version !== "modelspec-fuzz-seeds.v1") fail("corpus version must be modelspec-fuzz-seeds.v1");
  if (!Array.isArray(corpus.seeds) || corpus.seeds.length < 8) fail("corpus must contain at least 8 seeds");
  const seen = new Set();
  const tmp = mkdtempSync(join(tmpdir(), "forge-fuzz-seeds-"));
  const writeSeedsDir = argValue("--write-seeds-dir");
  let failures = 0;
  try {
    for (const seed of corpus.seeds) {
      if (seen.has(seed.id)) fail(`duplicate seed id '${seed.id}'`);
      seen.add(seed.id);
      const document = materializeSeed(seed);
      const contractPath = join(tmp, `${seed.id}.forge.json`);
      const reportPath = join(tmp, `${seed.id}.report.json`);
      writeJson(contractPath, document);
      if (writeSeedsDir) writeJson(resolve(repoRoot, writeSeedsDir, `${seed.id}.forge.json`), document);
      const report = runValidator(contractPath, reportPath);
      const actualErrors = errorChecks(report);
      const verdictOk = report.verdict === seed.expect.verdict;
      const errorsOk = sameArray(actualErrors, seed.expect.errorChecks);
      const ok = verdictOk && errorsOk;
      if (!ok) failures++;
      console.log(
        `${ok ? "ok  " : "FAIL"} ${seed.id}: ${report.verdict} ` +
          `(errors: ${actualErrors.join(", ") || "none"})` +
          (ok
            ? ""
            : ` - expected ${seed.expect.verdict} (${seed.expect.errorChecks.join(", ") || "none"})`),
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (failures > 0) fail(`${failures} seed(s) drifted`);
  console.log(`fuzz-contract-seeds: ${corpus.seeds.length} seeds match pinned validator outcomes`);
}

function candidateRemovals(document) {
  const candidates = [];
  for (const key of ["slots", "ports", "chains"]) {
    if (Array.isArray(document[key]) && document[key].length > 0) {
      candidates.push((next) => {
        next[key] = [];
      });
    }
  }
  if (document.sim && typeof document.sim === "object") {
    for (const key of ["battery", "motors", "props", "estimator", "aggregateMassG"]) {
      if (key in document.sim) {
        candidates.push((next) => {
          delete next.sim[key];
        });
      }
    }
  }
  for (let i = document.parts.length - 1; i >= 1; i--) {
    candidates.push((next) => {
      next.parts.splice(i, 1);
    });
  }
  for (let i = 0; i < document.parts.length; i++) {
    for (const key of ["pose", "explode", "renderBias", "comp", "mass"]) {
      if (key in document.parts[i]) {
        candidates.push((next) => {
          delete next.parts[i][key];
        });
      }
    }
  }
  return candidates;
}

function reportForDocument(document, tmp, label) {
  const contractPath = join(tmp, `${label}.forge.json`);
  const reportPath = join(tmp, `${label}.report.json`);
  writeJson(contractPath, document);
  return runValidator(contractPath, reportPath);
}

function minimizeContract() {
  const source = argValue("--minimize");
  const check = argValue("--check");
  if (!source || !check) fail("--minimize requires --check <CHECK-ID>");
  const tmp = mkdtempSync(join(tmpdir(), "forge-fuzz-min-"));
  try {
    let current = readJson(resolve(repoRoot, source));
    let report = reportForDocument(current, tmp, "start");
    if (!allChecks(report).includes(check)) fail(`starting contract does not produce ${check}`);

    let changed = true;
    let round = 0;
    while (changed) {
      changed = false;
      for (const remove of candidateRemovals(current)) {
        const candidate = JSON.parse(JSON.stringify(current));
        remove(candidate);
        const candidateReport = reportForDocument(candidate, tmp, `candidate-${round++}`);
        if (allChecks(candidateReport).includes(check)) {
          current = candidate;
          changed = true;
          break;
        }
      }
    }

    const out = argValue("--out");
    const body = `${JSON.stringify(current, null, 2)}\n`;
    if (out) {
      writeFileSync(resolve(repoRoot, out), body);
      console.log(`fuzz-contract-seeds: minimized ${check} regression written to ${out}`);
    } else {
      process.stdout.write(body);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (hasFlag("--help")) {
  console.log(`Usage:
  node scripts/fuzz-contract-seeds.mjs [--corpus evals/fuzz/modelspec-seeds.json] [--bin target/debug/forge-validate]
  node scripts/fuzz-contract-seeds.mjs --write-seeds-dir artifacts/fuzz-seeds
  node scripts/fuzz-contract-seeds.mjs --minimize bad.forge.json --check CHECK-ID [--out minimized.json]`);
  process.exit(0);
}

if (argValue("--minimize")) {
  minimizeContract();
} else {
  checkCorpus();
}
