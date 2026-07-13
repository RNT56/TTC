import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const RECORD_SECTIONS = [
  "Artifact IDs",
  "Changed paths",
  "Drift classification",
  "Why this is intentional",
  "Source-of-truth change",
  "Compatibility and user impact",
  "Evidence before",
  "Evidence after",
  "Reviewer focus",
  "Decision and task references",
];

const ALLOWED_CLASSIFICATIONS = new Set([
  "schema",
  "render",
  "physics",
  "validator",
  "fixture",
  "generated-runtime",
]);
const PLACEHOLDER = /(?:\bTBD\b|\bTODO\b|<[^>\n]+>|\[fill[^\]]*\])/i;
const REGISTRY_PATH = "docs/golden-artifact-registry.json";
const REQUIRED_RECORD_DIRECTORY = "docs/golden-updates";
const REQUIRED_IMMUTABLE_PATHS = ["prototype/cad-object-studio.html"];

function normalizeRepoPath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function patternRoot(pattern) {
  return pattern.endsWith("/**") ? pattern.slice(0, -3) : pattern;
}

export function pathMatches(pattern, path) {
  const normalizedPattern = normalizeRepoPath(pattern);
  const normalizedPath = normalizeRepoPath(path);
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath.startsWith(`${prefix}/`);
  }
  return normalizedPath === normalizedPattern;
}

function patternsOverlap(left, right) {
  const normalizedLeft = normalizeRepoPath(left);
  const normalizedRight = normalizeRepoPath(right);
  const leftRecursive = normalizedLeft.endsWith("/**");
  const rightRecursive = normalizedRight.endsWith("/**");
  const leftRoot = patternRoot(normalizedLeft);
  const rightRoot = patternRoot(normalizedRight);
  if (!leftRecursive && !rightRecursive) return normalizedLeft === normalizedRight;
  if (leftRecursive && rightRecursive) {
    return leftRoot === rightRoot || leftRoot.startsWith(`${rightRoot}/`) || rightRoot.startsWith(`${leftRoot}/`);
  }
  return leftRecursive
    ? normalizedRight.startsWith(`${leftRoot}/`)
    : normalizedLeft.startsWith(`${rightRoot}/`);
}

function validateRegistry(registry, root) {
  const errors = [];
  if (registry.schemaVersion !== "golden-artifact-registry.v1") {
    errors.push("registry schemaVersion must be golden-artifact-registry.v1");
  }
  if (registry.recordDirectory !== REQUIRED_RECORD_DIRECTORY) {
    errors.push(`registry recordDirectory must remain '${REQUIRED_RECORD_DIRECTORY}' so prior records stay append-only`);
  }
  if (!Array.isArray(registry.immutablePaths)) {
    errors.push("registry immutablePaths must be an array");
  }
  if (!Array.isArray(registry.artifacts) || registry.artifacts.length === 0) {
    errors.push("registry artifacts must be a non-empty array");
    return errors;
  }

  const registryArtifact = registry.artifacts.find((artifact) => artifact.id === "golden-policy-registry");
  if (!registryArtifact?.paths?.includes(REGISTRY_PATH)) {
    errors.push(`registry must protect itself as artifact 'golden-policy-registry' at ${REGISTRY_PATH}`);
  }
  for (const required of REQUIRED_IMMUTABLE_PATHS) {
    if (!registry.immutablePaths?.includes(required)) {
      errors.push(`registry immutablePaths must retain '${required}'`);
    }
  }

  const ids = new Set();
  const ownedPatterns = [];
  for (const artifact of registry.artifacts) {
    if (!artifact || typeof artifact !== "object") {
      errors.push("every registry artifact must be an object");
      continue;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artifact.id ?? "")) {
      errors.push(`artifact id '${artifact.id ?? ""}' must be lower-kebab-case`);
    } else if (ids.has(artifact.id)) {
      errors.push(`artifact id '${artifact.id}' is duplicated`);
    } else {
      ids.add(artifact.id);
    }
    if (!ALLOWED_CLASSIFICATIONS.has(artifact.classification)) {
      errors.push(`artifact '${artifact.id}' has unsupported classification '${artifact.classification}'`);
    }
    for (const field of ["owner", "sourceOfTruth", "regenerate"]) {
      if (typeof artifact[field] !== "string" || artifact[field].trim().length < 3) {
        errors.push(`artifact '${artifact.id}' field '${field}' must be a meaningful string`);
      }
    }
    if (typeof artifact.compatibilityReview !== "boolean") {
      errors.push(`artifact '${artifact.id}' compatibilityReview must be boolean`);
    }
    if (!Array.isArray(artifact.verify) || artifact.verify.length === 0 || artifact.verify.some((v) => typeof v !== "string" || v.trim().length < 3)) {
      errors.push(`artifact '${artifact.id}' verify must contain at least one command`);
    }
    if (!Array.isArray(artifact.paths) || artifact.paths.length === 0) {
      errors.push(`artifact '${artifact.id}' paths must be a non-empty array`);
      continue;
    }
    const artifactPatterns = new Set();
    for (const pattern of artifact.paths) {
      if (typeof pattern !== "string" || pattern.length === 0 || (/[*?[]/.test(pattern) && !pattern.endsWith("/**"))) {
        errors.push(`artifact '${artifact.id}' path '${pattern}' may be exact or end in /** only`);
        continue;
      }
      if (artifactPatterns.has(pattern)) {
        errors.push(`artifact '${artifact.id}' path '${pattern}' is duplicated`);
        continue;
      }
      artifactPatterns.add(pattern);
      if (!existsSync(resolve(root, patternRoot(pattern)))) {
        errors.push(`artifact '${artifact.id}' registered path '${patternRoot(pattern)}' does not exist`);
      }
      ownedPatterns.push({ id: artifact.id, pattern });
    }
  }

  for (let left = 0; left < ownedPatterns.length; left += 1) {
    for (let right = left + 1; right < ownedPatterns.length; right += 1) {
      const a = ownedPatterns[left];
      const b = ownedPatterns[right];
      if (a.id !== b.id && patternsOverlap(a.pattern, b.pattern)) {
        errors.push(`registry ownership overlaps between '${a.id}' (${a.pattern}) and '${b.id}' (${b.pattern})`);
      }
    }
  }

  for (const path of registry.immutablePaths ?? []) {
    if (typeof path !== "string" || path.length === 0 || path.includes("*")) {
      errors.push(`immutable path '${path}' must be an exact repository path`);
    } else if (!existsSync(resolve(root, path))) {
      errors.push(`immutable path '${path}' does not exist`);
    }
  }
  return errors;
}

function sectionMap(content) {
  const headings = [...content.matchAll(/^## ([^\n]+)\s*$/gm)];
  const sections = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? content.length;
    sections.set(heading[1].trim(), content.slice(start, end).trim());
  }
  return sections;
}

function backtickValues(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
}

export function parseRecord(path, content) {
  const errors = [];
  const basename = path.split("/").at(-1) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(basename)) {
    errors.push(`${path}: filename must be YYYY-MM-DD-lower-kebab-case.md`);
  }
  if (!/^# Golden artifact update: .{8,}$/.test(content.split("\n", 1)[0])) {
    errors.push(`${path}: first-level title must start with '# Golden artifact update: '`);
  }
  if (PLACEHOLDER.test(content)) {
    errors.push(`${path}: unresolved placeholder text is not allowed`);
  }

  const sections = sectionMap(content);
  for (const heading of RECORD_SECTIONS) {
    const value = sections.get(heading) ?? "";
    const minimum = ["Artifact IDs", "Changed paths", "Drift classification"].includes(heading) ? 5 : 12;
    if (value.length < minimum) errors.push(`${path}: section '${heading}' is missing or too short`);
  }

  const artifactIds = backtickValues(sections.get("Artifact IDs") ?? "");
  const changedPaths = backtickValues(sections.get("Changed paths") ?? "").map(normalizeRepoPath);
  const classifications = backtickValues(sections.get("Drift classification") ?? "");
  if (artifactIds.length === 0) errors.push(`${path}: Artifact IDs must list backticked registry IDs`);
  if (changedPaths.length === 0) errors.push(`${path}: Changed paths must list backticked repository paths`);
  if (classifications.length === 0 || classifications.some((value) => !ALLOWED_CLASSIFICATIONS.has(value))) {
    errors.push(`${path}: Drift classification must use backticked values from ${[...ALLOWED_CLASSIFICATIONS].join(", ")}`);
  }
  if (new Set(artifactIds).size !== artifactIds.length) errors.push(`${path}: Artifact IDs must not contain duplicates`);
  if (new Set(changedPaths).size !== changedPaths.length) errors.push(`${path}: Changed paths must not contain duplicates`);
  return { path, artifactIds, changedPaths, classifications, errors };
}

function artifactMatches(registry, path) {
  return registry.artifacts.filter((artifact) => artifact.paths.some((pattern) => pathMatches(pattern, path)));
}

function effectiveRegistry(registry, baselineRegistry) {
  if (!baselineRegistry) return registry;
  const artifacts = new Map();
  for (const artifact of [...baselineRegistry.artifacts, ...registry.artifacts]) {
    const previous = artifacts.get(artifact.id);
    artifacts.set(artifact.id, {
      ...previous,
      ...artifact,
      paths: [...new Set([...(previous?.paths ?? []), ...artifact.paths])],
    });
  }
  return {
    ...registry,
    artifacts: [...artifacts.values()],
    immutablePaths: [
      ...new Set([...(baselineRegistry.immutablePaths ?? []), ...(registry.immutablePaths ?? []), ...REQUIRED_IMMUTABLE_PATHS]),
    ],
  };
}

function isReviewRecord(registry, path) {
  const prefix = `${registry.recordDirectory}/`;
  return path.startsWith(prefix) && path.endsWith(".md") && path !== `${prefix}README.md`;
}

export function evaluatePolicy({ registry, baselineRegistry = null, root = process.cwd(), changedPaths, addedRecords }) {
  const errors = validateRegistry(registry, root);
  const policyRegistry = effectiveRegistry(registry, baselineRegistry);
  const normalizedChanges = [...new Set(changedPaths.map(normalizeRepoPath))].sort();
  const addedByPath = new Map(addedRecords.map((record) => [normalizeRepoPath(record.path), record.content]));
  const protectedChanges = [];

  for (const path of normalizedChanges) {
    if ((policyRegistry.immutablePaths ?? []).some((immutable) => pathMatches(immutable, path))) {
      errors.push(`${path}: immutable oracle input may not change; supersede it through a decision instead`);
    }
    const artifacts = artifactMatches(policyRegistry, path);
    if (artifacts.length > 1) {
      errors.push(`${path}: registry ownership overlaps across ${artifacts.map((item) => item.id).join(", ")}`);
    }
    if (artifacts.length === 1) protectedChanges.push({ path, artifact: artifacts[0] });
    if (isReviewRecord(registry, path) && !addedByPath.has(path)) {
      errors.push(`${path}: golden update records are append-only; add a correction record instead`);
    }
  }

  const parsedRecords = [];
  for (const [path, content] of addedByPath) {
    if (!isReviewRecord(registry, path)) continue;
    const parsed = parseRecord(path, content);
    parsedRecords.push(parsed);
    errors.push(...parsed.errors);
  }

  if (protectedChanges.length > 0 && parsedRecords.length === 0) {
    errors.push(`protected golden artifacts changed without a new record under ${registry.recordDirectory}`);
  }
  if (protectedChanges.length === 0 && parsedRecords.length > 0) {
    errors.push("a golden update record was added without a protected artifact change in the same patch");
  }

  const registryIds = new Set(policyRegistry.artifacts.map((artifact) => artifact.id));
  for (const record of parsedRecords) {
    for (const id of record.artifactIds) {
      if (!registryIds.has(id)) errors.push(`${record.path}: unknown artifact id '${id}'`);
    }
    for (const path of record.changedPaths) {
      const match = protectedChanges.find((change) => change.path === path);
      if (!match) errors.push(`${record.path}: cited path '${path}' is not a protected change in this patch`);
      else if (!record.artifactIds.includes(match.artifact.id)) {
        errors.push(`${record.path}: cited path '${path}' requires artifact id '${match.artifact.id}'`);
      } else if (!record.classifications.includes(match.artifact.classification)) {
        errors.push(`${record.path}: cited path '${path}' requires classification '${match.artifact.classification}'`);
      }
    }
  }

  for (const change of protectedChanges) {
    const covering = parsedRecords.filter((record) => record.changedPaths.includes(change.path));
    if (covering.length === 0) errors.push(`${change.path}: no new golden update record cites this change`);
    if (covering.length > 1) errors.push(`${change.path}: multiple golden update records cite the same change`);
  }
  for (const record of parsedRecords) {
    const usedIds = new Set(record.changedPaths.flatMap((path) => artifactMatches(policyRegistry, path).map((artifact) => artifact.id)));
    for (const id of record.artifactIds) {
      if (registryIds.has(id) && !usedIds.has(id)) errors.push(`${record.path}: artifact id '${id}' has no cited changed path`);
    }
  }

  return { errors, protectedChanges, parsedRecords };
}

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || `status ${result.status}`}`);
  }
  return result;
}

function revision(root, name) {
  const result = git(root, ["rev-parse", "--verify", "--quiet", `${name}^{commit}`], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function names(root, args) {
  const result = git(root, [...args, "-z"]);
  return result.stdout.split("\0").filter(Boolean).map(normalizeRepoPath);
}

function comparison(root) {
  const requested = process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : "origin/main";
  const base = revision(root, requested);
  const head = revision(root, "HEAD");
  if (base && head && base !== head) return { range: `${requested}...HEAD`, baseRevision: requested };
  if (revision(root, "HEAD^")) return { range: "HEAD^..HEAD", baseRevision: "HEAD^" };
  throw new Error("no committed comparison range is available; fetch the base branch or parent history");
}

export function collectGitPolicyInput(root, registry) {
  const { range, baseRevision } = comparison(root);
  const changedPaths = new Set([
    ...names(root, ["diff", "--name-only", "--diff-filter=ACDMRTUXB"]),
    ...names(root, ["diff", "--cached", "--name-only", "--diff-filter=ACDMRTUXB"]),
    ...names(root, ["diff", "--name-only", "--diff-filter=ACDMRTUXB", range]),
    ...names(root, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  const addedPaths = new Set([
    ...names(root, ["diff", "--cached", "--name-only", "--diff-filter=A"]),
    ...names(root, ["diff", "--name-only", "--diff-filter=A", range]),
    ...names(root, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  const addedRecords = [...addedPaths]
    .filter((path) => isReviewRecord(registry, path))
    .map((path) => ({ path, content: readFileSync(resolve(root, path), "utf8") }));
  const baselineResult = git(root, ["show", `${baseRevision}:${REGISTRY_PATH}`], { allowFailure: true });
  const baselineRegistry = baselineResult.status === 0 ? JSON.parse(baselineResult.stdout) : null;
  return { range, changedPaths: [...changedPaths], addedRecords, baselineRegistry };
}

export function checkRepository(root = process.cwd()) {
  const registryPath = resolve(root, REGISTRY_PATH);
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const input = collectGitPolicyInput(root, registry);
  const result = evaluatePolicy({
    registry,
    baselineRegistry: input.baselineRegistry,
    root,
    changedPaths: input.changedPaths,
    addedRecords: input.addedRecords,
  });
  return { ...result, range: input.range, registry };
}
