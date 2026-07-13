#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  REGISTRY_PATH,
  MAX_MANIFEST_BYTES,
  createManifest,
  milestoneById,
  readRegistry,
  renderRunbook,
  validateManifest,
  validateRegistry,
} from "./external-acceptance-policy.mjs";

const root = process.cwd();

function fail(message) {
  console.error(`external-acceptance: FAILED — ${message}`);
  process.exitCode = 1;
}

function usage() {
  console.log(`Usage:
  node scripts/external-acceptance.mjs check
  node scripts/external-acceptance.mjs list
  node scripts/external-acceptance.mjs init <milestone> --out <directory> [--run-id <id>]
  node scripts/external-acceptance.mjs validate <manifest-or-run-directory>

Milestones: builder, photoscan, training, course, lab, print, marketplace, maintenance

The init command refuses repository-local output. Raw acceptance material belongs in
an access-controlled evidence store, not source control.`);
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function defaultRunId(milestoneId) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
  return `${milestoneId}-${timestamp}-${randomBytes(4).toString("hex")}`;
}

function insideRoot(path) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function resolveManifestPath(input) {
  const target = resolve(input);
  if (!existsSync(target)) throw new Error(`manifest path does not exist: ${target}`);
  if (target.endsWith(".json")) return target;
  return resolve(target, "acceptance.json");
}

function readJson(path) {
  const size = statSync(path).size;
  if (size > MAX_MANIFEST_BYTES) throw new Error(`manifest exceeds ${MAX_MANIFEST_BYTES} bytes: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function check(registry) {
  const errors = validateRegistry(registry);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  for (const milestone of registry.milestones) {
    const manifest = createManifest(registry, milestone.id, {
      runId: `${milestone.id}-template-check`,
      createdAt: "2026-07-13T00:00:00.000Z",
    });
    const templateErrors = validateManifest(manifest, registry, { requireComplete: false });
    if (templateErrors.length > 0) throw new Error(`${milestone.id} template:\n${templateErrors.join("\n")}`);
    const runbook = renderRunbook(registry, milestone.id, manifest);
    for (const term of [milestone.id, milestone.programGate, milestone.taskIds[0], milestone.steps[0].id, "Stop conditions", "Data handling"]) {
      if (!runbook.includes(term)) throw new Error(`${milestone.id} runbook is missing '${term}'`);
    }
  }
  console.log(`external-acceptance: ${registry.milestones.length} milestone contracts and generated templates passed`);
}

function list(registry) {
  for (const milestone of registry.milestones) {
    console.log(`${milestone.id}\t${milestone.programGate}\t${milestone.targetMaturity}\t${milestone.taskIds.join(",")}\t${milestone.title}`);
  }
}

function init(registry, args) {
  const milestoneId = args[0];
  if (!milestoneId) throw new Error("init requires a milestone ID");
  const milestone = milestoneById(registry, milestoneId);
  if (!milestone) throw new Error(`unknown milestone '${milestoneId}'`);
  const rawOut = option(args, "--out");
  if (!rawOut) throw new Error("init requires --out <directory>");
  const out = resolve(rawOut);
  if (insideRoot(out)) throw new Error("refusing repository-local run output; choose an access-controlled path outside the repository");
  if (existsSync(out) && readdirSync(out).length > 0) throw new Error(`output directory is not empty: ${out}`);
  mkdirSync(out, { recursive: true, mode: 0o700 });
  const runId = option(args, "--run-id") ?? defaultRunId(milestone.id);
  const manifest = createManifest(registry, milestone.id, { runId });
  writeFileSync(resolve(out, "acceptance.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  writeFileSync(resolve(out, "RUNBOOK.md"), renderRunbook(registry, milestone.id, manifest), { mode: 0o600, flag: "wx" });
  console.log(`external-acceptance: initialized ${milestone.id} run '${runId}' at ${out}`);
  console.log(`external-acceptance: complete the pack, then validate ${resolve(out, "acceptance.json")}`);
}

function validate(registry, input) {
  if (!input) throw new Error("validate requires a manifest file or run directory");
  const path = resolveManifestPath(input);
  if (!existsSync(path)) throw new Error(`missing ${path}`);
  const manifest = readJson(path);
  const errors = validateManifest(manifest, registry, { requireComplete: true });
  if (errors.length > 0) throw new Error(`${path}:\n${errors.join("\n")}`);
  console.log(`external-acceptance: ${manifest.runId} ${manifest.status} evidence is structurally complete for ${manifest.milestone}`);
}

try {
  const registry = readRegistry(root);
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "check":
      check(registry);
      break;
    case "list":
      check(registry);
      list(registry);
      break;
    case "init":
      check(registry);
      init(registry, args);
      break;
    case "validate":
      check(registry);
      validate(registry, args[0]);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      usage();
      break;
    default:
      usage();
      throw new Error(`unknown command '${command}' (registry: ${REGISTRY_PATH})`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
