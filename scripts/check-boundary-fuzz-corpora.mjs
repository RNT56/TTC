#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const corpusDir = join(root, "evals", "fuzz", "boundaries");
const expectedFiles = [
  "catalog-citations.json",
  "catalog-performance-grid.json",
  "envspec.json",
  "export-policy.json",
  "hardware-payloads.json",
  "imports.json",
  "json-patch.json",
  "provider-output.json",
  "replay.json",
];
const version = "forge-boundary-fuzz.v1";
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const specialNumbers = new Set(["nan", "infinity", "-infinity"]);

function fail(message) {
  throw new Error(`boundary-fuzz-corpora: ${message}`);
}

function sameArray(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function inspectSpecialNumbers(value, location) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSpecialNumbers(entry, `${location}/${index}`));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Object.hasOwn(value, "$number")) {
    if (Object.keys(value).length !== 1 || !specialNumbers.has(value.$number)) {
      fail(`${location} has an invalid $number sentinel`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    inspectSpecialNumbers(entry, `${location}/${key}`);
  }
}

const actualFiles = readdirSync(corpusDir).filter((name) => name.endsWith(".json"));
if (!sameArray(actualFiles, expectedFiles)) {
  fail(`exact file set drifted: expected ${expectedFiles.join(", ")}; got ${actualFiles.sort().join(", ")}`);
}

const ids = new Set();
let total = 0;
for (const file of expectedFiles) {
  const path = join(corpusDir, file);
  let corpus;
  try {
    corpus = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const surface = basename(file, ".json");
  if (corpus.version !== version) fail(`${file} version must be ${version}`);
  if (corpus.surface !== surface) fail(`${file} surface must be ${surface}`);
  if (typeof corpus.description !== "string" || corpus.description.trim().length < 24) {
    fail(`${file} needs a substantive description`);
  }
  if (!Array.isArray(corpus.cases) || corpus.cases.length < 8) {
    fail(`${file} must contain at least eight reviewed cases`);
  }
  for (const [index, testCase] of corpus.cases.entries()) {
    const location = `${file} case ${index}`;
    if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) {
      fail(`${location} must be an object`);
    }
    if (typeof testCase.id !== "string" || !idPattern.test(testCase.id)) {
      fail(`${location} has an invalid stable id`);
    }
    if (ids.has(testCase.id)) fail(`duplicate case id ${testCase.id}`);
    ids.add(testCase.id);
    if (typeof testCase.focus !== "string" || testCase.focus.trim().length < 16) {
      fail(`${testCase.id} needs a substantive focus`);
    }
    if (!testCase.input || typeof testCase.input !== "object" || Array.isArray(testCase.input)) {
      fail(`${testCase.id} needs an input object`);
    }
    if (!testCase.expect || !["accept", "reject"].includes(testCase.expect.outcome)) {
      fail(`${testCase.id} expect.outcome must be accept or reject`);
    }
    if (testCase.expect.contains !== undefined && typeof testCase.expect.contains !== "string") {
      fail(`${testCase.id} expect.contains must be a string`);
    }
    inspectSpecialNumbers(testCase.input, `${file}/${testCase.id}/input`);
    total += 1;
  }
  console.log(`ok   ${surface}: ${corpus.cases.length} reviewed cases`);
}

console.log(`boundary-fuzz-corpora: ${expectedFiles.length} surfaces and ${total} cases are structurally pinned`);
