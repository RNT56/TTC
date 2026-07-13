#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const outDir = resolve(root, outArg >= 0 ? args[outArg + 1] : "dist-release");
const skipBuilds = args.includes("--skip-builds");
const wasmOnly = args.includes("--wasm-only");
const keepOut = args.includes("--keep-out");
const npmPackageName = process.env.FORGE_WASM_NPM_PACKAGE ?? "@forge/validate-wasm";

const cargoToml = readFileSync(join(root, "Cargo.toml"), "utf8");
const version = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!version) {
  throw new Error("workspace package version not found in Cargo.toml");
}

function run(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(" ");
  console.log(`$ ${printable}`);
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    throw new Error(`${printable} failed with exit ${result.status}`);
  }
}

function copyIfExists(from, to) {
  if (!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function allFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...allFiles(path));
    } else if (stat.isFile()) {
      out.push(path);
    }
  }
  return out;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

if (!keepOut) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

const crates = [
  "forge-num",
  "forge-contract",
  "forge-geometry",
  "forge-motion",
  "forge-sim",
  "forge-validate",
  "forge-wasm",
];

function crateManifest(crate) {
  return join(root, "crates", crate.replace(/^forge-/, "forge-"), "Cargo.toml");
}

function assertInternalDepsAreVersioned() {
  const missing = [];
  for (const crate of readdirSync(join(root, "crates"))) {
    const manifest = join(root, "crates", crate, "Cargo.toml");
    if (!existsSync(manifest)) continue;
    const text = readFileSync(manifest, "utf8");
    for (const [index, line] of text.split("\n").entries()) {
      if (/^\s*forge-[a-z0-9-]+\s*=\s*\{/.test(line) && line.includes("path =") && !line.includes("version =")) {
        missing.push(`${relative(root, manifest)}:${index + 1}: ${line.trim()}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`internal path dependencies need crates.io versions:\n${missing.join("\n")}`);
  }
}

assertInternalDepsAreVersioned();

for (const crate of crates) {
  if (!existsSync(crateManifest(crate))) {
    throw new Error(`missing Cargo manifest for ${crate}`);
  }
  run("cargo", ["package", "-p", crate, "--allow-dirty", "--no-verify", "--list"]);
}

for (const crate of ["forge-num", "forge-contract"]) {
  run("cargo", ["package", "-p", crate, "--allow-dirty", "--no-verify"]);
}
console.log(
  "downstream crates are manifest-checked; full cargo package/publish dry-runs require publishing internal crates first: " +
    crates.join(" -> "),
);

if (!skipBuilds) {
  if (!wasmOnly) {
    run("cargo", ["build", "--release", "-p", "forge-validate"]);
    copyIfExists(
      join(root, "target", "release", process.platform === "win32" ? "forge-validate.exe" : "forge-validate"),
      join(outDir, process.platform === "win32" ? "forge-validate-windows.exe" : "forge-validate"),
    );
  }

  run("pnpm", [
    "exec",
    "wasm-pack",
    "build",
    "crates/forge-wasm",
    "--target",
    "web",
    "--release",
    "--out-dir",
    relative(join(root, "crates", "forge-wasm"), join(outDir, "forge-wasm-pkg")),
    "--out-name",
    "forge_wasm",
  ]);
}

const wasmPkgDir = join(outDir, "forge-wasm-pkg");
if (!existsSync(wasmPkgDir)) {
  throw new Error(`missing ${wasmPkgDir}; rerun without --skip-builds or provide an existing package dir`);
}

const generatedPackageJsonPath = join(wasmPkgDir, "package.json");
const generatedPackageJson = existsSync(generatedPackageJsonPath)
  ? JSON.parse(readFileSync(generatedPackageJsonPath, "utf8"))
  : {};
const packageJson = {
  ...generatedPackageJson,
  name: npmPackageName,
  version,
  description: "FORGE validator WASM facade: validate, bake, patch, schema, and golden-number checks",
  license: "Apache-2.0",
  repository: {
    type: "git",
    url: "git+https://github.com/RNT56/TTC.git",
  },
  keywords: ["forge", "validator", "wasm", "robotics", "cad"],
  sideEffects: false,
  files: [
    "forge_wasm.js",
    "forge_wasm.d.ts",
    "forge_wasm_bg.wasm",
    "forge_wasm_bg.wasm.d.ts",
    "LICENSE",
    "NOTICE",
    "README.md",
  ],
};
writeFileSync(generatedPackageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
copyIfExists(join(root, "LICENSE"), join(wasmPkgDir, "LICENSE"));
copyIfExists(join(root, "NOTICE"), join(wasmPkgDir, "NOTICE"));
copyIfExists(join(root, "README.md"), join(wasmPkgDir, "README.md"));

run("npm", ["pack", "--dry-run", wasmPkgDir]);
run("npm", ["pack", wasmPkgDir, "--pack-destination", outDir]);

const manifest = {
  version,
  crates,
  cratePublishOrder: crates,
  npmPackageName,
  npmPackageDir: relative(root, wasmPkgDir),
  binary: allFiles(outDir)
    .map((path) => relative(outDir, path))
    .find((path) => basename(path).startsWith("forge-validate")) ?? null,
  generatedAt: new Date().toISOString(),
};
writeFileSync(join(outDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const checksumLines = allFiles(outDir)
  .filter((path) => !path.endsWith("SHA256SUMS"))
  .map((path) => `${sha256(path)}  ${relative(outDir, path)}`)
  .sort();
writeFileSync(join(outDir, "SHA256SUMS"), `${checksumLines.join("\n")}\n`);

console.log(`prepared validator release artifacts in ${relative(root, outDir)}`);
