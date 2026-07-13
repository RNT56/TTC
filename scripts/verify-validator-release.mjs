#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

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
const linux = readdirSync(dir).find((name) => /-linux-x86_64\.tar\.gz$/.test(name));
if (!linux) throw new Error("Linux x86_64 bundle missing");
const temp = mkdtempSync(join(tmpdir(), "forge-release-verify-"));
try {
  execFileSync("tar", ["-xzf", join(dir, linux), "-C", temp]);
  const folder = join(temp, linux.replace(/\.tar\.gz$/, ""));
  const binary = join(folder, "forge-validate");
  if ((statSync(binary).mode & 0o111) === 0) throw new Error("Linux bundle binary is not executable");
  const version = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
  if (version !== `forge-validate ${manifest.version}`) throw new Error(`version mismatch: ${version}`);
  execFileSync(binary, ["run", example], { stdio: "inherit" });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
const wasm = readdirSync(dir).find((name) => /^forge-validate-wasm-.*\.tgz$/.test(name));
if (!wasm) throw new Error("WASM package missing");
const entries = execFileSync("tar", ["-tzf", join(dir, wasm)], { encoding: "utf8" });
for (const required of ["package/package.json", "package/forge_wasm.js", "package/forge_wasm_bg.wasm"]) {
  if (!entries.split("\n").includes(required)) throw new Error(`WASM package missing ${required}`);
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
console.log(`verified downloaded validator release v${manifest.version}: checksums, SPDX, Linux smoke, clean WASM install`);
