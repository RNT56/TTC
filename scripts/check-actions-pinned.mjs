#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const workflowsDir = join(process.cwd(), ".github", "workflows");
const workflowFiles = readdirSync(workflowsDir)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();
const mutable = [];
let checked = 0;

for (const name of workflowFiles) {
  const body = readFileSync(join(workflowsDir, name), "utf8");
  for (const match of body.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)) {
    const reference = match[1];
    if (reference.startsWith("./")) continue;
    checked += 1;
    const separator = reference.lastIndexOf("@");
    const revision = separator >= 0 ? reference.slice(separator + 1) : "";
    if (!/^[0-9a-f]{40}$/i.test(revision)) {
      const line = body.slice(0, match.index).split("\n").length;
      mutable.push(`${name}:${line}: ${reference}`);
    }
  }
}

if (mutable.length > 0) {
  console.error("workflow actions must use immutable 40-character commit SHAs:");
  console.error(mutable.join("\n"));
  process.exit(1);
}

console.log(`workflow action pins: ${checked} references across ${workflowFiles.length} files`);
