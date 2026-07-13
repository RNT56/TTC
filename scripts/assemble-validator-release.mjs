#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`missing ${flag}`);
  return args[index + 1];
};
const input = resolve(value("--input"));
const out = resolve(value("--out"));
const sourceSha = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const epoch = Number(execFileSync("git", ["show", "-s", "--format=%ct", sourceSha], { encoding: "utf8" }).trim());
const gnuTar = execFileSync("tar", ["--version"], { encoding: "utf8" }).includes("GNU tar");
const version = readFileSync("Cargo.toml", "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!version) throw new Error("workspace version missing");

function files(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

function tree(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? [path, ...tree(path)] : [path];
  });
}

function dirs(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    if (/^forge-validate-\d+\.\d+\.\d+-/.test(entry)) found.push(path);
    found.push(...dirs(path));
  }
  return found;
}

function normalizeTimes(dir) {
  for (const path of [...tree(dir), dir]) utimesSync(path, epoch, epoch);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const bundles = dirs(input);
if (bundles.length !== 3) throw new Error(`expected 3 native bundles, found ${bundles.length}`);
for (const dir of bundles) {
  const name = basename(dir);
  const binary = join(dir, name.includes("windows") ? "forge-validate.exe" : "forge-validate");
  if (!existsSync(binary)) throw new Error(`native bundle is missing ${basename(binary)}: ${name}`);
  chmodSync(binary, name.includes("windows") ? 0o644 : 0o755);
  normalizeTimes(dir);
  if (name.includes("windows")) {
    execFileSync("zip", ["-X", "-q", "-r", join(out, `${name}.zip`), name], { cwd: dirname(dir) });
  } else {
    const archive = join(out, `${name}.tar.gz`);
    const tarPath = archive.slice(0, -3);
    const tarArgs = gnuTar
      ? ["--sort=name", `--mtime=@${epoch}`, "--owner=0", "--group=0", "--numeric-owner", "-cf", tarPath, name]
      : ["-cf", tarPath, name];
    execFileSync("tar", tarArgs, {
      cwd: dirname(dir),
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    execFileSync("gzip", ["-n", "-9", "-f", tarPath]);
  }
}
const wasm = files(input).filter((path) => /^forge-validate-wasm-\d+\.\d+\.\d+\.tgz$/.test(basename(path)));
if (wasm.length !== 1) throw new Error(`expected 1 WASM package, found ${wasm.length}`);
copyFileSync(wasm[0], join(out, basename(wasm[0])));
const notes = `docs/releases/v${version}.md`;
if (!existsSync(notes)) throw new Error(`missing release notes for v${version}`);
copyFileSync(notes, join(out, "RELEASE-NOTES.md"));
console.log(`assembled ${bundles.length} native bundles and ${wasm.length} WASM package`);
