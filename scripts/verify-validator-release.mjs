#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MAX_NATIVE_ARCHIVE_BYTES,
  MAX_NATIVE_BINARY_BYTES,
  MAX_NATIVE_METADATA_BYTES,
  MAX_WASM_ARCHIVE_BYTES,
  MAX_WASM_MEMBER_BYTES,
  listArchiveEntries,
  readArchiveMember,
  validateArchiveEntries,
} from "./archive-policy.mjs";

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`missing ${flag}`);
  return args[index + 1];
};
const dir = resolve(value("--dir"));
const example = resolve(value("--example"));
const manifest = JSON.parse(readFileSync(join(dir, "release-manifest.json"), "utf8"));
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
for (const line of readFileSync(join(dir, "SHA256SUMS"), "utf8").trim().split("\n")) {
  const [expected, name] = line.split(/\s{2,}/);
  if (!name || digest(join(dir, name)) !== expected) throw new Error(`checksum mismatch: ${name}`);
}
const sbom = JSON.parse(readFileSync(join(dir, "forge-artifacts.spdx.json"), "utf8"));
if (!String(sbom.spdxVersion ?? "").startsWith("SPDX-") || !sbom.packages?.length) {
  throw new Error("artifact SBOM is missing SPDX packages");
}

const nativeBundles = [
  { target: "linux-x86_64", pattern: /-linux-x86_64\.tar\.gz$/, binary: "forge-validate" },
  { target: "macos-x86_64", pattern: /-macos-x86_64\.tar\.gz$/, binary: "forge-validate" },
  { target: "windows-x86_64", pattern: /-windows-x86_64\.zip$/, binary: "forge-validate.exe" },
];
const names = readdirSync(dir);
const archives = new Map(
  nativeBundles.map((bundle) => {
    const name = names.find((candidate) => bundle.pattern.test(candidate));
    if (!name) throw new Error(`${bundle.target} bundle missing`);
    return [bundle.target, { ...bundle, name }];
  }),
);
const hostTarget = platform() === "linux"
  ? "linux-x86_64"
  : platform() === "darwin"
    ? "macos-x86_64"
    : platform() === "win32"
      ? "windows-x86_64"
      : null;
if (!hostTarget) throw new Error(`unsupported release verification host: ${platform()} ${arch()}`);
const native = archives.get(hostTarget);
if (!native) throw new Error(`native bundle unavailable for ${platform()} ${arch()}`);
const temp = mkdtempSync(join(tmpdir(), "forge-release-verify-"));
try {
  const archive = join(dir, native.name);
  const folderName = native.name.replace(/(?:\.tar\.gz|\.zip)$/, "");
  const compressed = native.name.endsWith(".tar.gz");
  const member = `${folderName}/${native.binary}`;
  const metadataMembers = ["INSTALL.md", "LICENSE", "NOTICE", "artifact-manifest.json"]
    .map((name) => `${folderName}/${name}`);
  const entries = listArchiveEntries(archive, compressed, MAX_NATIVE_ARCHIVE_BYTES, `${native.target} bundle`);
  validateArchiveEntries(entries, [folderName, ...metadataMembers, member], `${native.target} bundle`);
  for (const metadataMember of metadataMembers) {
    readArchiveMember(archive, metadataMember, compressed, MAX_NATIVE_METADATA_BYTES, `${native.target} metadata`);
  }
  readArchiveMember(archive, member, compressed, MAX_NATIVE_BINARY_BYTES, `${native.target} binary`);
  execFileSync("tar", [native.name.endsWith(".zip") ? "-xf" : "-xzf", archive, "-C", temp]);
  const folder = join(temp, folderName);
  const binary = join(folder, native.binary);
  if (!statSync(binary).isFile() || statSync(binary).size > MAX_NATIVE_BINARY_BYTES) {
    throw new Error(`${native.target} bundle binary is not a bounded regular file`);
  }
  if (platform() !== "win32" && (statSync(binary).mode & 0o111) === 0) {
    throw new Error(`${native.target} bundle binary is not executable`);
  }
  const version = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
  if (version !== `forge-validate ${manifest.version}`) throw new Error(`version mismatch: ${version}`);
  execFileSync(binary, ["run", example], { stdio: "inherit" });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
const wasm = names.find((name) => /^forge-validate-wasm-.*\.tgz$/.test(name));
if (!wasm) throw new Error("WASM package missing");
const wasmArchive = join(dir, wasm);
const wasmAllowed = [
  "package/LICENSE",
  "package/NOTICE",
  "package/README.md",
  "package/package.json",
  "package/forge_wasm.js",
  "package/forge_wasm.d.ts",
  "package/forge_wasm_bg.wasm",
  "package/forge_wasm_bg.wasm.d.ts",
];
const wasmEntries = listArchiveEntries(wasmArchive, true, MAX_WASM_ARCHIVE_BYTES, "WASM package");
validateArchiveEntries(wasmEntries, wasmAllowed, "WASM package");
for (const member of wasmAllowed) {
  readArchiveMember(wasmArchive, member, true, MAX_WASM_MEMBER_BYTES, `WASM member ${member}`);
}
const consumer = mkdtempSync(join(tmpdir(), "forge-wasm-consumer-"));
try {
  writeFileSync(join(consumer, "package.json"), '{"name":"forge-release-consumer","private":true,"type":"module"}\n');
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", join(dir, wasm)],
    { cwd: consumer, stdio: "inherit" },
  );
  writeFileSync(
    join(consumer, "verify.mjs"),
    `import { readFile } from "node:fs/promises";
import init, { version } from "@forge/validate-wasm";
const bytes = await readFile(new URL("./node_modules/@forge/validate-wasm/forge_wasm_bg.wasm", import.meta.url));
await init({ module_or_path: bytes });
const info = JSON.parse(version());
if (info.packageVersion !== process.argv[2]) throw new Error(\`WASM version mismatch: \${info.packageVersion}\`);
console.log(\`clean WASM consumer reports \${info.packageVersion}\`);
`,
  );
  execFileSync(process.execPath, ["verify.mjs", manifest.version], { cwd: consumer, stdio: "inherit" });
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
console.log(
  `verified downloaded validator release v${manifest.version}: checksums, SPDX, ${native.target} smoke, clean WASM install`,
);
