#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const args = process.argv.slice(2);
const value = (flag) => {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`missing ${flag}`);
  return args[index + 1];
};
const binary = resolve(value("--binary"));
const out = resolve(value("--out"));
const platform = value("--platform").toLowerCase();
const arch = value("--arch").toLowerCase().replace("x64", "x86_64").replace("arm64", "aarch64");
const cargoToml = readFileSync("Cargo.toml", "utf8");
const version = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (!version) throw new Error("workspace version missing");
const sourceSha = process.env.GITHUB_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const name = `forge-validate-${version}-${platform}-${arch}`;
const dir = join(out, name);

rmSync(out, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
copyFileSync(binary, join(dir, basename(binary)));
copyFileSync("LICENSE", join(dir, "LICENSE"));
copyFileSync("NOTICE", join(dir, "NOTICE"));
writeFileSync(
  join(dir, "INSTALL.md"),
  `# forge-validate ${version}\n\nPlatform: ${platform}/${arch}\n\nRun \`forge-validate --version\`, then \`forge-validate run model.forge.json\`.\n`,
);
writeFileSync(
  join(dir, "artifact-manifest.json"),
  `${JSON.stringify({ artifactKind: "validator-cli", version, platform, arch, sourceSha, binary: basename(binary) }, null, 2)}\n`,
);
console.log(`packaged ${name}`);
