#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function git(args, options = {}) {
  return spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
}

function resolves(revision) {
  return git(["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]).status === 0;
}

function revision(revisionName) {
  const result = git(["rev-parse", `${revisionName}^{commit}`]);
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function check(args, label) {
  const result = git(["diff", "--check", ...args], { stdio: "inherit" });
  if (result.error) throw new Error(`${label}: could not start git: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}: whitespace errors found`);
}

check([], "working tree");
check(["--cached"], "staged changes");

const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
  .stdout.split("\0")
  .filter(Boolean);
for (const file of untracked) {
  const result = git(["diff", "--no-index", "--check", "--", "/dev/null", file]);
  if (result.error) throw new Error(`untracked file ${file}: could not start git: ${result.error.message}`);
  if ((result.status ?? 2) > 1) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`untracked file ${file}: whitespace errors found`);
  }
}

const requestedBase = process.env.GITHUB_BASE_REF
  ? `origin/${process.env.GITHUB_BASE_REF}`
  : "origin/main";
const head = revision("HEAD");
let range = null;
if (resolves(requestedBase) && revision(requestedBase) !== head) {
  range = `${requestedBase}...HEAD`;
} else if (resolves("HEAD^")) {
  range = "HEAD^..HEAD";
}

if (range === null) {
  throw new Error("no committed comparison range is available; fetch the base branch history");
}
check([range], `committed range ${range}`);
console.log(`patch-hygiene: working tree, index, ${untracked.length} untracked file(s), and ${range} are clean`);
