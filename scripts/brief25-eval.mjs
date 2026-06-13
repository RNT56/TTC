#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function usage() {
  console.log(`usage: node scripts/brief25-eval.mjs [options]

Options:
  --corpus <path>          Brief corpus JSON (default: evals/brief25.corpus.json)
  --out <path>             Machine-readable JSON output (default: artifacts/evals/brief25-latest.json)
  --validator <auto|real|shape>
                           auto uses target/debug/forge-validate when present, otherwise shape
  --concurrency <n>        Parallel brief workers (default: 4)
  --check-corpus-only      Validate the corpus shape and exit
  --enforce-ga-gate        Exit nonzero if admitted briefs < 20
`);
}

if (hasFlag("--help") || hasFlag("-h")) {
  usage();
  process.exit(0);
}

const corpusPath = resolve(repoRoot, argValue("--corpus", "evals/brief25.corpus.json"));
const outPath = resolve(repoRoot, argValue("--out", "artifacts/evals/brief25-latest.json"));
const validatorMode = argValue("--validator", "auto");
const concurrency = Math.max(1, Math.min(25, Number.parseInt(argValue("--concurrency", "4"), 10) || 4));

const ARCHETYPES = new Set(["biped", "multirotor", "rover", "arm", "quadruped", "fixedwing"]);
const SCALE_CLASSES = new Set(["micro", "mini", "bench", "field", "large", "human-scale"]);
const CONSTRAINT_KINDS = new Set([
  "mass_budget",
  "envelope",
  "real_part",
  "driver",
  "manufacturing",
  "repairability",
  "license",
  "safety",
  "endurance",
  "payload",
]);
const CATALOG_CATEGORIES = new Set(["battery", "esc", "fc", "frame", "motor", "prop", "rover"]);
const EXPORT_POLICIES = new Set([
  "full-geometry-ok",
  "attribution-manifest-required",
  "envelope-link-out",
  "envelope-only",
  "bom-only",
  "blocked",
  "assembly-policy-derived",
]);

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fail(message) {
  throw new Error(message);
}

function expectObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
}

function expectString(value, path, { min = 1, max = 4000, pattern = null } = {}) {
  if (typeof value !== "string") fail(`${path} must be a string`);
  if (value.length < min) fail(`${path} must be at least ${min} character(s)`);
  if (value.length > max) fail(`${path} must be at most ${max} character(s)`);
  if (pattern && !pattern.test(value)) fail(`${path} has invalid format`);
}

function expectNumber(value, path, { min = 0 } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path} must be a finite number`);
  if (value < min) fail(`${path} must be >= ${min}`);
}

function expectArray(value, path, { min = 0 } = {}) {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  if (value.length < min) fail(`${path} must contain at least ${min} item(s)`);
}

function validateVocabulary(corpus) {
  expectObject(corpus.p4Vocabulary, "p4Vocabulary");
  for (const [key, expected] of [
    ["archetypes", ARCHETYPES],
    ["scaleClasses", SCALE_CLASSES],
    ["constraintKinds", CONSTRAINT_KINDS],
    ["catalogCategories", CATALOG_CATEGORIES],
  ]) {
    expectArray(corpus.p4Vocabulary[key], `p4Vocabulary.${key}`, { min: expected.size });
    const actual = new Set(corpus.p4Vocabulary[key]);
    for (const item of expected) {
      if (!actual.has(item)) fail(`p4Vocabulary.${key} is missing '${item}'`);
    }
  }
}

function validateCorpus(corpus) {
  expectObject(corpus, "corpus");
  expectString(corpus.version, "version");
  if (corpus.version !== "brief25.v1") fail("version must be brief25.v1");
  expectString(corpus.name, "name");
  expectString(corpus.description, "description");
  validateVocabulary(corpus);
  expectArray(corpus.briefs, "briefs", { min: 25 });
  if (corpus.briefs.length !== 25) fail(`briefs must contain exactly 25 entries, got ${corpus.briefs.length}`);

  const ids = new Set();
  const archetypes = new Set();
  const scaleClasses = new Set();
  const constraintKinds = new Set();
  const categories = new Set();

  corpus.briefs.forEach((brief, index) => {
    const path = `briefs[${index}]`;
    expectObject(brief, path);
    expectString(brief.id, `${path}.id`, { pattern: /^b25-\d{2}-[a-z0-9-]+$/ });
    if (ids.has(brief.id)) fail(`${path}.id '${brief.id}' is duplicated`);
    ids.add(brief.id);
    expectString(brief.title, `${path}.title`, { max: 120 });
    expectString(brief.archetype, `${path}.archetype`);
    if (!ARCHETYPES.has(brief.archetype)) fail(`${path}.archetype '${brief.archetype}' is not a P4 archetype`);
    archetypes.add(brief.archetype);

    expectObject(brief.scale, `${path}.scale`);
    expectString(brief.scale.class, `${path}.scale.class`);
    if (!SCALE_CLASSES.has(brief.scale.class)) fail(`${path}.scale.class '${brief.scale.class}' is not supported`);
    scaleClasses.add(brief.scale.class);
    expectObject(brief.scale.targetEnvelopeMm, `${path}.scale.targetEnvelopeMm`);
    for (const dim of ["length", "width", "height"]) {
      expectNumber(brief.scale.targetEnvelopeMm[dim], `${path}.scale.targetEnvelopeMm.${dim}`, { min: 1 });
    }
    expectNumber(brief.scale.massBudgetG, `${path}.scale.massBudgetG`, { min: 1 });

    expectArray(brief.catalogCategories, `${path}.catalogCategories`, { min: 1 });
    for (const category of brief.catalogCategories) {
      expectString(category, `${path}.catalogCategories[]`, { max: 80 });
      if (!CATALOG_CATEGORIES.has(category)) fail(`${path}.catalogCategories contains unsupported '${category}'`);
      categories.add(category);
    }
    expectArray(brief.catalogComponentRefs, `${path}.catalogComponentRefs`);
    for (const ref of brief.catalogComponentRefs) {
      expectString(ref, `${path}.catalogComponentRefs[]`, { pattern: /^cmp_[a-z0-9_-]+$/ });
    }

    expectArray(brief.constraints, `${path}.constraints`, { min: 3 });
    for (const [constraintIndex, constraint] of brief.constraints.entries()) {
      const cpath = `${path}.constraints[${constraintIndex}]`;
      expectObject(constraint, cpath);
      expectString(constraint.kind, `${cpath}.kind`);
      if (!CONSTRAINT_KINDS.has(constraint.kind)) fail(`${cpath}.kind '${constraint.kind}' is unsupported`);
      constraintKinds.add(constraint.kind);
      expectString(constraint.value, `${cpath}.value`, { max: 400 });
    }

    expectString(brief.prompt, `${path}.prompt`, { max: 4000 });
    expectArray(brief.tags, `${path}.tags`, { min: 1 });
    for (const tag of brief.tags) expectString(tag, `${path}.tags[]`, { max: 80 });
  });

  for (const archetype of ARCHETYPES) {
    if (!archetypes.has(archetype)) fail(`corpus does not cover archetype '${archetype}'`);
  }
  for (const scaleClass of ["micro", "mini", "bench", "field", "large"]) {
    if (!scaleClasses.has(scaleClass)) fail(`corpus does not cover scale class '${scaleClass}'`);
  }
  for (const kind of ["mass_budget", "real_part", "driver", "manufacturing", "repairability", "safety"]) {
    if (!constraintKinds.has(kind)) fail(`corpus does not cover constraint kind '${kind}'`);
  }
  for (const category of ["battery", "fc", "motor", "prop", "rover"]) {
    if (!categories.has(category)) fail(`corpus does not cover catalog category '${category}'`);
  }

  return {
    ids: [...ids],
    archetypes: [...archetypes].sort(),
    scaleClasses: [...scaleClasses].sort(),
    constraintKinds: [...constraintKinds].sort(),
    catalogCategories: [...categories].sort(),
  };
}

function loadCatalogRows() {
  const componentDir = join(repoRoot, "catalog", "components");
  const files = readdirSync(componentDir).filter((file) => file.endsWith(".json")).sort();
  return files.map((file) => {
    const component = readJson(join(componentDir, file));
    const prices = Array.isArray(component.prices) ? component.prices : [];
    const citations = component.citations && typeof component.citations === "object" ? component.citations : {};
    const revisions = Array.isArray(component.revisions) ? component.revisions : [];
    const revision = revisions.find((item) => item && item.yanked !== true)?.version ?? "1.0.0";
    const exportPolicy = component.license?.exportPolicy ?? "full-geometry-ok";
    if (!EXPORT_POLICIES.has(exportPolicy)) fail(`catalog component ${component.id} has unsupported export policy`);
    return {
      id: component.id,
      brand: component.brand,
      model: component.model,
      rev: revision,
      category: component.category,
      dims: component.dims ?? {},
      mass_g: component.massG ?? 0,
      elec: component.elec ?? {},
      mech: component.mech ?? {},
      confidence: component.confidence ?? 0,
      license_class: component.license?.class ?? "open",
      export_policy: exportPolicy,
      reviewer: "brief25-fixture",
      reviewed_at: "2026-06-13T00:00:00.000Z",
      review_note: "Brief-25 deterministic fixture row from catalog/components",
      price_count: prices.filter((price) => price && price.purchasable !== false).length,
      citation_count: Object.keys(citations).length,
    };
  });
}

function validateComponentRefs(corpus, catalogRows) {
  const known = new Set(catalogRows.map((row) => row.id));
  const missing = [];
  for (const brief of corpus.briefs) {
    for (const ref of brief.catalogComponentRefs) {
      if (!known.has(ref)) missing.push(`${brief.id}:${ref}`);
    }
  }
  if (missing.length > 0) {
    fail(`corpus references unknown catalog component(s): ${missing.join(", ")}`);
  }
}

function createFixtureDb(catalogRows) {
  return {
    async query(_text, params) {
      const [categoriesParam, prompt, limitParam] = params ?? [];
      const categories = Array.isArray(categoriesParam) ? new Set(categoriesParam) : null;
      const promptText = String(prompt ?? "").toLowerCase();
      const limit = Math.max(1, Math.min(20, Number(limitParam ?? 8)));
      const rows = catalogRows
        .filter((row) => categories === null || categories.has(row.category))
        .sort((a, b) => {
          const aMatched = [a.brand, a.model, a.category].some((text) => promptText.includes(String(text).toLowerCase()));
          const bMatched = [b.brand, b.model, b.category].some((text) => promptText.includes(String(text).toLowerCase()));
          if (aMatched !== bMatched) return aMatched ? -1 : 1;
          return `${a.category}:${a.brand}:${a.model}`.localeCompare(`${b.category}:${b.brand}:${b.model}`);
        })
        .slice(0, limit);
      return { rows, rowCount: rows.length };
    },
  };
}

function loadGenerationMaterials() {
  const exemplar = (source) => {
    const contract = readJson(join(repoRoot, source));
    return {
      id: contract.meta?.id ?? source,
      name: contract.meta?.name ?? source,
      archetype: contract.meta?.archetype ?? "unknown",
      source,
      contract,
    };
  };
  return {
    schemaText: readFileSync(join(repoRoot, "schema", "forge-modelspec.schema.json"), "utf8"),
    engineDocs: [
      "# generation-pipeline.md",
      readFileSync(join(repoRoot, "docs", "systems", "generation-pipeline.md"), "utf8"),
      "# model-contract.md",
      readFileSync(join(repoRoot, "docs", "systems", "model-contract.md"), "utf8"),
    ].join("\n\n"),
    exemplars: [
      exemplar("examples/vx2-proof.forge.json"),
      exemplar("examples/qd-mini.forge.json"),
    ],
  };
}

function execFilePromise(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 30_000, ...options }, (error, stdout, stderr) => {
      const code =
        error && typeof error.code === "string"
          ? -1
          : error && typeof error.code === "number"
            ? error.code
            : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

function shapeValidate(contractJson, asDraft) {
  try {
    const contract = JSON.parse(contractJson);
    const results = [];
    if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
      results.push({ check: "CTR-001", severity: "error", message: "contract must be a JSON object" });
    }
    if (!contract?.meta || typeof contract.meta !== "object") {
      results.push({ check: "CTR-001", severity: "error", message: "missing meta block" });
    }
    if (!contract?.driver || typeof contract.driver !== "object") {
      results.push({ check: "CTR-001", severity: "error", message: "missing driver block" });
    }
    if (!Array.isArray(contract?.skeleton)) {
      results.push({ check: "CTR-001", severity: "error", message: "missing skeleton array" });
    }
    if (!Array.isArray(contract?.parts)) {
      results.push({ check: "CTR-001", severity: "error", message: "missing parts array" });
    }
    const hasErrors = results.some((result) => result.severity === "error");
    return {
      exitCode: hasErrors ? (asDraft ? 3 : 2) : 0,
      report: {
        verdict: hasErrors ? (asDraft ? "draft" : "rejected") : "admitted",
        results,
        validator: { kind: "shape-fallback" },
      },
      stderr: "",
    };
  } catch (error) {
    return {
      exitCode: asDraft ? 3 : 2,
      report: {
        verdict: asDraft ? "draft" : "rejected",
        results: [{ check: "CTR-001", severity: "error", message: `invalid JSON: ${error.message}` }],
        validator: { kind: "shape-fallback" },
      },
      stderr: "",
    };
  }
}

async function realValidate(bin, contractJson, asDraft) {
  const dir = mkdtempSync(join(tmpdir(), "brief25-validate-"));
  const contractPath = join(dir, "contract.json");
  const reportPath = join(dir, "report.json");
  try {
    writeFileSync(contractPath, contractJson, "utf8");
    const flags = ["run", contractPath, "--report", reportPath, "--catalog", join(repoRoot, "catalog")];
    if (asDraft) flags.push("--as-draft");
    const { code, stderr } = await execFilePromise(bin, flags);
    let report = null;
    try {
      report = readJson(reportPath);
    } catch {
      report = null;
    }
    return { exitCode: code, report, stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function contractArchetype(contractJson) {
  try {
    const contract = JSON.parse(contractJson);
    return {
      meta: contract?.meta?.archetype ?? null,
      driver: contract?.driver?.archetype ?? null,
    };
  } catch {
    return { meta: null, driver: null };
  }
}

function withArchetypeGate(baseValidator, brief) {
  return async (contractJson, asDraft = false) => {
    const base = await baseValidator(contractJson, asDraft);
    const report = base.report && typeof base.report === "object" ? { ...base.report } : { results: [] };
    const results = Array.isArray(report.results) ? [...report.results] : [];
    const actual = contractArchetype(contractJson);
    const matches = actual.meta === brief.archetype && actual.driver === brief.archetype;
    if (matches) return { ...base, report: { ...report, results } };

    results.push({
      check: "EVAL-ARCHETYPE",
      severity: "error",
      message: `brief archetype '${brief.archetype}' did not match generated contract meta='${actual.meta}' driver='${actual.driver}'`,
    });
    return {
      exitCode: asDraft ? 3 : 2,
      report: {
        ...report,
        verdict: asDraft ? "draft" : "rejected",
        results,
      },
      stderr: base.stderr,
    };
  };
}

function diagnosticSummary(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.results)) return [];
  return report.results
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      check: typeof item.check === "string" ? item.check : "unknown",
      severity: typeof item.severity === "string" ? item.severity : "unknown",
      message: typeof item.message === "string" ? item.message : "",
    }));
}

async function runPool(items, workerCount, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, runWorker));
  return results;
}

function histogram(items) {
  const out = {};
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarize(results, corpusSummary) {
  const verdicts = results.map((result) => result.verdict);
  const repairIterations = results.map((result) => result.repairIterations);
  const sortedRepairs = [...repairIterations].sort((a, b) => a - b);
  const attempts = results.flatMap((result) => result.attempts);
  const diagnostics = results.flatMap((result) => result.diagnostics);
  const gateTarget = 20;
  const admitted = verdicts.filter((verdict) => verdict === "admitted").length;
  return {
    finalVerdictCounts: {
      admitted,
      draft: verdicts.filter((verdict) => verdict === "draft").length,
      rejected: verdicts.filter((verdict) => verdict === "rejected").length,
      blocked: verdicts.filter((verdict) => verdict === "blocked").length,
    },
    attemptVerdictCounts: histogram(attempts.map((attempt) => attempt.verdict)),
    attemptsByPhase: histogram(attempts.map((attempt) => attempt.phase)),
    repairIterations: {
      total: repairIterations.reduce((sum, value) => sum + value, 0),
      min: sortedRepairs[0] ?? 0,
      max: sortedRepairs[sortedRepairs.length - 1] ?? 0,
      average: repairIterations.length
        ? Number((repairIterations.reduce((sum, value) => sum + value, 0) / repairIterations.length).toFixed(3))
        : 0,
      p50: percentile(sortedRepairs, 50),
      p95: percentile(sortedRepairs, 95),
      histogram: histogram(repairIterations.map(String)),
    },
    diagnosticsByCheck: histogram(diagnostics.map((diagnostic) => diagnostic.check)),
    diagnosticsBySeverity: histogram(diagnostics.map((diagnostic) => diagnostic.severity)),
    diversity: {
      archetypes: corpusSummary.archetypes,
      scaleClasses: corpusSummary.scaleClasses,
      constraintKinds: corpusSummary.constraintKinds,
      catalogCategories: corpusSummary.catalogCategories,
    },
    qualityGate: {
      name: "P4 GA admission target",
      admittedWithoutHumanRepairTarget: gateTarget,
      admittedWithoutHumanRepairActual: admitted,
      pass: admitted >= gateTarget,
      enforced: hasFlag("--enforce-ga-gate"),
    },
  };
}

async function main() {
  if (!["auto", "real", "shape"].includes(validatorMode)) {
    fail("--validator must be one of: auto, real, shape");
  }

  const corpusText = readFileSync(corpusPath, "utf8");
  const corpus = JSON.parse(corpusText);
  const corpusSummary = validateCorpus(corpus);
  const catalogRows = loadCatalogRows();
  validateComponentRefs(corpus, catalogRows);

  if (hasFlag("--check-corpus-only")) {
    console.log(`brief25: corpus ok (${corpus.briefs.length} briefs, ${corpusSummary.archetypes.length} archetypes)`);
    return;
  }

  const gatewayModulePath = join(repoRoot, "packages", "gateway", "dist", "generation.js");
  if (!existsSync(gatewayModulePath)) {
    fail("packages/gateway/dist/generation.js is missing; run: pnpm --filter @forge/gateway build");
  }
  const { runGeneration } = await import(pathToFileURL(gatewayModulePath).href);

  const validatorBin = join(repoRoot, "target", "debug", process.platform === "win32" ? "forge-validate.exe" : "forge-validate");
  const selectedValidator =
    validatorMode === "real" || (validatorMode === "auto" && existsSync(validatorBin))
      ? { kind: "real", binary: validatorBin }
      : { kind: "shape", binary: null };
  if (validatorMode === "real" && !existsSync(validatorBin)) {
    fail(`--validator real requested but ${validatorBin} does not exist`);
  }

  const db = createFixtureDb(catalogRows);
  const materials = loadGenerationMaterials();
  const baseValidator = selectedValidator.kind === "real"
    ? (contractJson, asDraft) => realValidate(selectedValidator.binary, contractJson, asDraft)
    : (contractJson, asDraft) => shapeValidate(contractJson, asDraft);

  const startedAt = new Date().toISOString();
  const results = await runPool(corpus.briefs, concurrency, async (brief, index) => {
    const validator = withArchetypeGate(baseValidator, brief);
    const request = {
      prompt: brief.prompt,
      archetype: brief.archetype,
      categories: brief.catalogCategories,
      limit: Math.min(20, Math.max(1, brief.catalogCategories.length + 2)),
      provider: "template",
      seed: index,
      maxRepairIterations: 3,
      includePrefixText: false,
    };
    const response = await runGeneration(db, request, { materials, validator });
    const attempts = response.attempts.map((attempt) => ({
      index: attempt.index,
      phase: attempt.phase,
      modelId: attempt.modelId,
      verdict: attempt.verdict,
      diagnosticChecks: attempt.diagnostics.map((diagnostic) => diagnostic.check ?? "unknown"),
    }));
    const diagnostics = diagnosticSummary(response.report);
    const generated = response.contract ? contractArchetype(JSON.stringify(response.contract)) : { meta: null, driver: null };
    return {
      id: brief.id,
      title: brief.title,
      archetype: brief.archetype,
      scaleClass: brief.scale.class,
      catalogCategories: brief.catalogCategories,
      catalogComponentRefs: brief.catalogComponentRefs,
      verdict: response.verdict,
      repairIterations: attempts.filter((attempt) => attempt.phase === "repair").length,
      attemptCount: attempts.length,
      attempts,
      generatedArchetype: generated,
      retrievedComponentIds: response.context.retrievedComponents.map((component) => component.id),
      blockedReasons: response.blockedReasons,
      diagnostics,
    };
  });

  const artifact = {
    schemaVersion: "brief25-eval.v1",
    startedAt,
    completedAt: new Date().toISOString(),
    mode: "gateway-template",
    provider: "template",
    concurrency,
    validator: {
      ...selectedValidator,
      semanticChecks: ["EVAL-ARCHETYPE"],
    },
    corpus: {
      path: corpusPath.replace(`${repoRoot}/`, ""),
      version: corpus.version,
      count: corpus.briefs.length,
      sha256: sha256(corpusText),
    },
    materials: {
      schemaHash: sha256(materials.schemaText),
      engineDocsHash: sha256(materials.engineDocs),
      exemplarHashes: materials.exemplars.map((exemplar) => ({
        id: exemplar.id,
        archetype: exemplar.archetype,
        hash: sha256(stableJson(exemplar.contract)),
      })),
    },
    summary: summarize(results, corpusSummary),
    briefs: results,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const counts = artifact.summary.finalVerdictCounts;
  console.log(
    `brief25: ${counts.admitted} admitted, ${counts.draft} draft, ${counts.rejected} rejected, ${counts.blocked} blocked ` +
      `(${artifact.summary.repairIterations.total} repair iterations)`,
  );
  console.log(`brief25: wrote ${outPath.replace(`${repoRoot}/`, "")}`);

  if (artifact.summary.qualityGate.enforced && !artifact.summary.qualityGate.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`brief25: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
