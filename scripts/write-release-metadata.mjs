#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const args = process.argv.slice(2);
const index = args.indexOf("--dir");
if (index < 0 || !args[index + 1]) throw new Error("missing --dir");
const dir = resolve(args[index + 1]);
const version = readFileSync("Cargo.toml", "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!version) throw new Error("workspace version missing");
const sourceSha = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sourceDate = execFileSync("git", ["show", "-s", "--format=%cI", sourceSha], { encoding: "utf8" }).trim();
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const paths = readdirSync(dir)
  .map((name) => join(dir, name))
  .filter((path) => statSync(path).isFile() && !["SHA256SUMS", "release-manifest.json"].includes(basename(path)))
  .sort();
const files = paths.map((path) => ({ name: basename(path), bytes: statSync(path).size, sha256: digest(path) }));
const manifest = {
  artifactKind: "forgedttc-validator-release",
  version,
  sourceRepository: process.env.GITHUB_REPOSITORY ?? "RNT56/TTC",
  sourceSha,
  sourceRef: process.env.GITHUB_REF ?? null,
  sourceDate,
  workflowRunId: process.env.GITHUB_RUN_ID ?? null,
  files,
};
writeFileSync(join(dir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const checksumPaths = [...paths, join(dir, "release-manifest.json")];
writeFileSync(
  join(dir, "SHA256SUMS"),
  `${checksumPaths.map((path) => `${digest(path)}  ${basename(path)}`).sort().join("\n")}\n`,
);
console.log(`release metadata: ${files.length} payload files for v${version}`);
