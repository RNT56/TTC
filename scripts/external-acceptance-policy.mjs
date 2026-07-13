import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const REGISTRY_PATH = "docs/external-acceptance/milestones.json";
export const REGISTRY_VERSION = "forge.external-acceptance-registry.v1";
export const EVIDENCE_VERSION = "forge.external-acceptance.v1";
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const REQUIRED_MILESTONES = [
  "builder",
  "photoscan",
  "training",
  "course",
  "lab",
  "print",
  "marketplace",
  "maintenance",
];

const STATUS = new Set(["incomplete", "passed", "failed", "stopped"]);
const STEP_STATUS = new Set(["not-run", "passed", "failed", "stopped"]);
const ENVIRONMENTS = new Set(["sandbox", "live", "controlled-lab"]);
const MATURITY = new Set(["contract", "fixture", "sandbox", "live", "field-proven"]);
const RETENTION_CLASSES = new Set([
  "user-content",
  "consent-history",
  "safety-refusal-audit",
  "auth-operational",
  "terminal-job-operational",
  "lifecycle-audit",
]);
const VISIBILITY = new Set(["private", "restricted", "public"]);
const FINDING_CATEGORY = new Set([
  "usability",
  "correctness",
  "safety",
  "privacy",
  "reliability",
  "performance",
  "economics",
  "documentation",
]);
const FINDING_SEVERITY = new Set(["info", "low", "medium", "high", "critical"]);
const FINDING_DISPOSITION = new Set(["open", "accepted", "fixed", "not-applicable"]);
const PLACEHOLDER = /(?:\bTBD\b|\bTODO\b|\bCHANGEME\b|<[^>\n]+>)/i;
const SECRET_VALUE = /(?:sk-ant-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9]{20,}|\bBearer\s+[a-zA-Z0-9._~+\/-]{12,})/;
const FORBIDDEN_KEY = /(?:password|secret|api.?key|access.?token|refresh.?token|authorization|cookie|credential)/i;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RUN_ID = /^[a-z][a-z0-9-]{7,95}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const TASK_ID = /^(?:QA|EXT|P\d+|SEC|OPS|GOV|DOC)-\d{3}$/;

function add(errors, condition, message) {
  if (!condition) errors.push(message);
}

function meaningful(value, minimum = 3) {
  return typeof value === "string" && value.trim().length >= minimum && !PLACEHOLDER.test(value);
}

function exactArray(value, expected) {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index]);
}

function uniqueStrings(value, minimum = 1) {
  return Array.isArray(value) &&
    value.length >= minimum &&
    value.every((entry) => meaningful(entry, 1)) &&
    new Set(value).size === value.length;
}

function objectShape(value, { allowed, required = allowed }, prefix, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  const keys = Object.keys(value);
  for (const key of required) {
    if (!keys.includes(key)) errors.push(`${prefix}.${key} is required`);
  }
  for (const key of keys) {
    if (!allowed.includes(key)) errors.push(`${prefix}.${key} is not allowed`);
  }
}

function sameStringSet(value, expected) {
  return Array.isArray(value) &&
    value.length === expected.length &&
    new Set(value).size === value.length &&
    value.every((entry) => expected.includes(entry));
}

function iso(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function finiteMeasurement(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function inspectBounds(value) {
  const errors = [];
  let nodes = 0;
  let exhausted = false;
  function visit(current, path, depth, ancestors) {
    if (exhausted) return;
    nodes += 1;
    if (nodes > 25_000) {
      errors.push("manifest exceeds the 25,000-node evidence boundary");
      exhausted = true;
      return;
    }
    if (depth > 16) {
      errors.push(`${path}: manifest nesting exceeds 16 levels`);
      return;
    }
    if (typeof current === "string" && current.length > 4_096) {
      errors.push(`${path}: string exceeds the 4,096-character evidence boundary`);
      return;
    }
    if (!current || typeof current !== "object") return;
    if (ancestors.has(current)) {
      errors.push(`${path}: cyclic evidence structures are forbidden`);
      return;
    }
    const entries = Array.isArray(current)
      ? current.map((entry, index) => [index, entry])
      : Object.entries(current);
    if (entries.length > 2_000) {
      errors.push(`${path}: container exceeds the 2,000-entry evidence boundary`);
      return;
    }
    ancestors.add(current);
    for (const [key, entry] of entries) visit(entry, `${path}.${key}`, depth + 1, ancestors);
    ancestors.delete(current);
  }
  visit(value, "manifest", 0, new WeakSet());
  return errors;
}

function walkForSecrets(value, path, errors, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return;
    seen.add(value);
    value.forEach((entry, index) => walkForSecrets(entry, `${path}[${index}]`, errors, seen));
    return;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return;
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) errors.push(`${path}.${key}: secret-bearing keys are forbidden in acceptance evidence`);
      walkForSecrets(entry, `${path}.${key}`, errors, seen);
    }
    return;
  }
  if (typeof value === "string" && SECRET_VALUE.test(value)) {
    errors.push(`${path}: possible credential material is forbidden in acceptance evidence`);
  }
}

function safeEvidenceRef(value) {
  if (typeof value !== "string" || value.length > 500) return false;
  if (value.startsWith("urn:sha256:")) return SHA256.test(value.slice("urn:sha256:".length));
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!["https:", "s3:", "evidence:"].includes(parsed.protocol)) return false;
  return !parsed.username && !parsed.password && !parsed.search && !parsed.hash && meaningful(parsed.hostname, 1);
}

export function readRegistry(root = process.cwd()) {
  return JSON.parse(readFileSync(resolve(root, REGISTRY_PATH), "utf8"));
}

export function milestoneById(registry, milestoneId) {
  return registry.milestones.find((milestone) => milestone.id === milestoneId) ?? null;
}

export function validateRegistry(registry) {
  const errors = [];
  add(errors, registry?.schemaVersion === REGISTRY_VERSION, `registry schemaVersion must be ${REGISTRY_VERSION}`);
  add(errors, registry?.evidenceVersion === EVIDENCE_VERSION, `registry evidenceVersion must be ${EVIDENCE_VERSION}`);
  add(errors, registry?.dataPolicy?.repositoryStoresRawEvidence === false, "registry must forbid raw evidence in the repository");
  add(errors, registry?.dataPolicy?.repositoryStoresSecrets === false, "registry must forbid secrets in the repository");
  add(errors, exactArray(registry?.maturityVocabulary, [...MATURITY]), "registry maturity vocabulary must remain ordered and complete");
  add(errors, Array.isArray(registry?.milestones), "registry milestones must be an array");
  if (!Array.isArray(registry?.milestones)) return errors;

  const ids = registry.milestones.map((milestone) => milestone?.id);
  add(errors, exactArray(ids, REQUIRED_MILESTONES), `registry milestones must be exactly ${REQUIRED_MILESTONES.join(", ")}`);
  add(errors, new Set(ids).size === ids.length, "registry milestone IDs must be unique");

  for (const milestone of registry.milestones) {
    const prefix = `milestone '${milestone?.id ?? "unknown"}'`;
    add(errors, ID.test(milestone?.id ?? ""), `${prefix} ID must be lower-kebab-case`);
    add(errors, meaningful(milestone?.title, 8), `${prefix} title is missing`);
    add(errors, uniqueStrings(milestone?.taskIds, 2), `${prefix} taskIds must be unique and non-empty`);
    if (Array.isArray(milestone?.taskIds)) {
      add(errors, milestone.taskIds.includes("QA-010"), `${prefix} must reference QA-010`);
      add(errors, milestone.taskIds.some((taskId) => /^EXT-00[1-8]$/.test(taskId)), `${prefix} must reference its EXT milestone`);
      for (const taskId of milestone.taskIds) add(errors, TASK_ID.test(taskId), `${prefix} has invalid task ID '${taskId}'`);
    }
    add(errors, /^G[2-7]$/.test(milestone?.programGate ?? ""), `${prefix} programGate must be G2..G7`);
    add(errors, MATURITY.has(milestone?.targetMaturity), `${prefix} targetMaturity is invalid`);
    add(
      errors,
      uniqueStrings(milestone?.allowedEnvironments) && milestone.allowedEnvironments.every((entry) => ENVIRONMENTS.has(entry)),
      `${prefix} allowedEnvironments are invalid`,
    );
    add(errors, uniqueStrings(milestone?.requiredRoles, 2), `${prefix} requiredRoles must contain at least two unique roles`);
    add(errors, uniqueStrings(milestone?.requiredSignoffs, 1), `${prefix} requiredSignoffs are missing`);
    add(errors, Array.isArray(milestone?.independentRoles), `${prefix} independentRoles must be an array`);
    for (const role of milestone.requiredSignoffs ?? []) {
      add(errors, milestone.requiredRoles?.includes(role), `${prefix} signoff role '${role}' is not a required participant role`);
    }
    for (const role of milestone.independentRoles ?? []) {
      add(errors, milestone.requiredRoles?.includes(role), `${prefix} independent role '${role}' is not a required participant role`);
    }
    add(errors, uniqueStrings(milestone?.requiredAuthorityRefs, 1), `${prefix} authority references are missing`);
    add(errors, uniqueStrings(milestone?.requiredMeasurements, 1), `${prefix} measurements are missing`);
    add(errors, uniqueStrings(milestone?.prerequisites, 2), `${prefix} prerequisites are incomplete`);
    add(errors, uniqueStrings(milestone?.stopConditions, 2), `${prefix} stop conditions are incomplete`);
    add(errors, Array.isArray(milestone?.steps) && milestone.steps.length >= 5, `${prefix} must define at least five steps`);
    const stepIds = (milestone.steps ?? []).map((step) => step?.id);
    add(errors, new Set(stepIds).size === stepIds.length, `${prefix} step IDs must be unique`);
    for (const step of milestone.steps ?? []) {
      add(errors, ID.test(step?.id ?? "") && step.id.startsWith(`${milestone.id}-`), `${prefix} has invalid step ID '${step?.id}'`);
      add(errors, meaningful(step?.title, 6), `${prefix} step '${step?.id}' title is missing`);
      add(errors, meaningful(step?.instruction, 20), `${prefix} step '${step?.id}' instruction is incomplete`);
      add(errors, uniqueStrings(step?.requiredEvidenceKinds, 1), `${prefix} step '${step?.id}' evidence kinds are missing`);
    }
  }

  const lab = milestoneById(registry, "lab");
  const labText = JSON.stringify(lab ?? {}).toLowerCase();
  for (const term of ["d30", "d12", "no-auto-arm", "physical confirmation", "supervisor", "rover", "quad"]) {
    add(errors, labText.includes(term), `lab milestone must retain safety term '${term}'`);
  }
  const builder = milestoneById(registry, "builder");
  add(errors, builder?.independentRoles?.includes("participant"), "builder participant must remain independent");
  return errors;
}

export function createManifest(registry, milestoneId, { runId, createdAt = new Date().toISOString() }) {
  const milestone = milestoneById(registry, milestoneId);
  if (!milestone) throw new Error(`unknown milestone '${milestoneId}'`);
  if (!RUN_ID.test(runId ?? "")) throw new Error("runId must be a pseudonymous lower-kebab identifier between 8 and 96 characters");
  return {
    schemaVersion: registry.evidenceVersion,
    registryVersion: registry.schemaVersion,
    runId,
    milestone: milestone.id,
    taskIds: [...milestone.taskIds],
    programGate: milestone.programGate,
    status: "incomplete",
    claimedMaturity: milestone.targetMaturity,
    createdAt,
    startedAt: null,
    completedAt: null,
    source: {
      commitSha: null,
      productVersion: null,
      environment: null,
      deploymentId: null,
    },
    participants: milestone.requiredRoles.map((role) => ({
      role,
      pseudonymousId: null,
      independent: milestone.independentRoles.includes(role),
      independenceStatement: null,
    })),
    authorityRefs: Object.fromEntries(milestone.requiredAuthorityRefs.map((name) => [name, null])),
    steps: milestone.steps.map((step) => ({
      id: step.id,
      status: "not-run",
      evidenceRefs: [],
      notes: null,
    })),
    artifacts: [],
    measurements: Object.fromEntries(milestone.requiredMeasurements.map((name) => [name, null])),
    findings: [],
    findingsReview: {
      usabilityReviewed: false,
      correctnessReviewed: false,
      summary: null,
    },
    incidents: [],
    signoffs: milestone.requiredSignoffs.map((role) => ({
      role,
      pseudonymousId: null,
      attestation: null,
      signedAt: null,
      signatureRef: null,
    })),
    outcome: {
      criteriaMet: false,
      summary: null,
      limitations: [],
      followUpTaskIds: [],
    },
  };
}

function validateArtifact(artifact, index, errors) {
  const prefix = `artifacts[${index}]`;
  objectShape(artifact, {
    allowed: ["id", "kind", "ref", "sha256", "retentionClass", "visibility", "containsPersonalData", "subjectDigest", "deleteAfter"],
    required: ["id", "kind", "ref", "sha256", "retentionClass", "visibility", "containsPersonalData"],
  }, prefix, errors);
  add(errors, ID.test(artifact?.id ?? ""), `${prefix}.id must be lower-kebab-case`);
  add(errors, ID.test(artifact?.kind ?? ""), `${prefix}.kind must be lower-kebab-case`);
  add(errors, safeEvidenceRef(artifact?.ref), `${prefix}.ref must be an opaque urn:sha256, HTTPS, S3, or evidence reference without credentials/query/fragment`);
  add(errors, SHA256.test(artifact?.sha256 ?? ""), `${prefix}.sha256 must be lowercase SHA-256`);
  if (typeof artifact?.ref === "string" && artifact.ref.startsWith("urn:sha256:") && SHA256.test(artifact?.sha256 ?? "")) {
    add(errors, artifact.ref.slice("urn:sha256:".length) === artifact.sha256, `${prefix}.ref digest must equal sha256`);
  }
  add(errors, RETENTION_CLASSES.has(artifact?.retentionClass), `${prefix}.retentionClass is invalid`);
  add(errors, VISIBILITY.has(artifact?.visibility), `${prefix}.visibility is invalid`);
  add(errors, typeof artifact?.containsPersonalData === "boolean", `${prefix}.containsPersonalData must be boolean`);
  if (artifact?.containsPersonalData === true) {
    add(errors, artifact.visibility !== "public", `${prefix} cannot be public when it contains personal data`);
    add(errors, SHA256.test(artifact?.subjectDigest ?? ""), `${prefix}.subjectDigest is required for personal data`);
    add(errors, iso(artifact?.deleteAfter), `${prefix}.deleteAfter is required for personal data`);
  }
}

function validateFinding(finding, index, artifactIds, errors) {
  const prefix = `findings[${index}]`;
  add(errors, ID.test(finding?.id ?? ""), `${prefix}.id must be lower-kebab-case`);
  add(errors, FINDING_CATEGORY.has(finding?.category), `${prefix}.category is invalid`);
  add(errors, FINDING_SEVERITY.has(finding?.severity), `${prefix}.severity is invalid`);
  add(errors, meaningful(finding?.summary, 8) && finding.summary.length <= 500, `${prefix}.summary must be 8..500 characters without placeholders`);
  add(errors, FINDING_DISPOSITION.has(finding?.disposition), `${prefix}.disposition is invalid`);
  add(errors, Array.isArray(finding?.evidenceRefs), `${prefix}.evidenceRefs must be an array`);
  for (const ref of finding?.evidenceRefs ?? []) add(errors, artifactIds.has(ref), `${prefix} references unknown artifact '${ref}'`);
}

export function validateManifest(manifest, registry, { requireComplete = true } = {}) {
  const errors = [...validateRegistry(registry)];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return [...errors, "manifest must be an object"];
  errors.push(...inspectBounds(manifest));
  objectShape(manifest, {
    allowed: [
      "schemaVersion", "registryVersion", "runId", "milestone", "taskIds", "programGate", "status", "claimedMaturity",
      "createdAt", "startedAt", "completedAt", "source", "participants", "authorityRefs", "steps", "artifacts",
      "measurements", "findings", "findingsReview", "incidents", "signoffs", "outcome",
    ],
  }, "manifest", errors);
  walkForSecrets(manifest, "manifest", errors);

  const milestone = milestoneById(registry, manifest.milestone);
  add(errors, manifest.schemaVersion === registry.evidenceVersion, `manifest schemaVersion must be ${registry.evidenceVersion}`);
  add(errors, manifest.registryVersion === registry.schemaVersion, `manifest registryVersion must be ${registry.schemaVersion}`);
  add(errors, RUN_ID.test(manifest.runId ?? ""), "manifest runId must be a pseudonymous lower-kebab identifier between 8 and 96 characters");
  add(errors, Boolean(milestone), `manifest milestone '${manifest.milestone ?? ""}' is unknown`);
  if (!milestone) return errors;
  add(errors, exactArray(manifest.taskIds, milestone.taskIds), "manifest taskIds must exactly match the milestone registry");
  add(errors, manifest.programGate === milestone.programGate, `manifest programGate must be ${milestone.programGate}`);
  add(errors, STATUS.has(manifest.status), "manifest status is invalid");
  add(errors, manifest.claimedMaturity === milestone.targetMaturity, `manifest claimedMaturity must be ${milestone.targetMaturity}`);
  add(errors, iso(manifest.createdAt), "manifest createdAt must be canonical ISO-8601");

  const complete = requireComplete || manifest.status !== "incomplete";
  objectShape(manifest.source, {
    allowed: ["commitSha", "productVersion", "environment", "deploymentId"],
  }, "source", errors);
  if (complete) {
    add(errors, manifest.status !== "incomplete", "completed validation rejects status 'incomplete'");
    add(errors, iso(manifest.startedAt), "manifest startedAt must be canonical ISO-8601");
    add(errors, iso(manifest.completedAt), "manifest completedAt must be canonical ISO-8601");
    if (iso(manifest.startedAt) && iso(manifest.completedAt)) {
      add(errors, Date.parse(manifest.completedAt) >= Date.parse(manifest.startedAt), "manifest completedAt must not precede startedAt");
    }
    add(errors, COMMIT_SHA.test(manifest.source?.commitSha ?? ""), "source.commitSha must be a full lowercase Git SHA");
    add(errors, meaningful(manifest.source?.productVersion, 1), "source.productVersion is required");
    add(errors, milestone.allowedEnvironments.includes(manifest.source?.environment), "source.environment is not allowed for this milestone");
    add(errors, meaningful(manifest.source?.deploymentId, 3), "source.deploymentId must be an opaque deployment reference");
  }

  const participants = Array.isArray(manifest.participants) ? manifest.participants : [];
  add(errors, exactArray(participants.map((entry) => entry?.role), milestone.requiredRoles), "participant roles must exactly match the milestone registry order");
  const participantByRole = new Map(participants.map((entry) => [entry?.role, entry]));
  participants.forEach((participant, index) => objectShape(participant, {
    allowed: ["role", "pseudonymousId", "independent", "independenceStatement"],
  }, `participants[${index}]`, errors));
  for (const role of milestone.requiredRoles) {
    const participant = participantByRole.get(role);
    if (complete) {
      add(errors, ID.test(participant?.pseudonymousId ?? ""), `participant '${role}' needs a pseudonymousId`);
      add(errors, typeof participant?.independent === "boolean", `participant '${role}' independent must be boolean`);
      if (milestone.independentRoles.includes(role)) {
        add(errors, participant?.independent === true, `participant '${role}' must be independent`);
        add(errors, meaningful(participant?.independenceStatement, 12), `participant '${role}' needs an independence statement`);
      }
    }
  }
  const independentIds = milestone.independentRoles.map((role) => participantByRole.get(role)?.pseudonymousId).filter(Boolean);
  const nonIndependentIds = milestone.requiredRoles.filter((role) => !milestone.independentRoles.includes(role)).map((role) => participantByRole.get(role)?.pseudonymousId).filter(Boolean);
  for (const id of independentIds) add(errors, !nonIndependentIds.includes(id), `independent participant '${id}' cannot fill an owner/facilitator role`);

  const authorityKeys = Object.keys(manifest.authorityRefs ?? {});
  add(errors, sameStringSet(authorityKeys, milestone.requiredAuthorityRefs), "authorityRefs keys must exactly match the milestone registry");
  if (complete) {
    for (const name of milestone.requiredAuthorityRefs) {
      const authority = manifest.authorityRefs?.[name];
      objectShape(authority, { allowed: ["ref", "sha256"] }, `authorityRefs.${name}`, errors);
      add(errors, safeEvidenceRef(authority?.ref), `authorityRefs.${name}.ref is invalid`);
      add(errors, SHA256.test(authority?.sha256 ?? ""), `authorityRefs.${name}.sha256 must be lowercase SHA-256`);
    }
  }

  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  const artifactIds = new Set();
  for (const [index, artifact] of artifacts.entries()) {
    validateArtifact(artifact, index, errors);
    const lifecycleStart = iso(manifest.completedAt) ? manifest.completedAt : manifest.createdAt;
    if (artifact?.containsPersonalData === true && iso(artifact?.deleteAfter) && iso(lifecycleStart)) {
      add(errors, Date.parse(artifact.deleteAfter) > Date.parse(lifecycleStart), `artifacts[${index}].deleteAfter must follow the evidence lifecycle start`);
    }
    if (artifactIds.has(artifact?.id)) errors.push(`artifact ID '${artifact.id}' is duplicated`);
    artifactIds.add(artifact?.id);
  }

  const manifestSteps = Array.isArray(manifest.steps) ? manifest.steps : [];
  add(errors, exactArray(manifestSteps.map((step) => step?.id), milestone.steps.map((step) => step.id)), "manifest step IDs/order must exactly match the milestone registry");
  for (const [index, registeredStep] of milestone.steps.entries()) {
    const step = manifestSteps[index];
    objectShape(step, { allowed: ["id", "status", "evidenceRefs", "notes"] }, `steps[${index}]`, errors);
    add(errors, STEP_STATUS.has(step?.status), `step '${registeredStep.id}' status is invalid`);
    add(errors, Array.isArray(step?.evidenceRefs), `step '${registeredStep.id}' evidenceRefs must be an array`);
    const referencedKinds = new Set();
    for (const ref of step?.evidenceRefs ?? []) {
      add(errors, artifactIds.has(ref), `step '${registeredStep.id}' references unknown artifact '${ref}'`);
      const artifact = artifacts.find((entry) => entry.id === ref);
      if (artifact) referencedKinds.add(artifact.kind);
    }
    if (complete && step?.status === "passed") {
      for (const kind of registeredStep.requiredEvidenceKinds) {
        add(errors, referencedKinds.has(kind), `step '${registeredStep.id}' is missing evidence kind '${kind}'`);
      }
      add(errors, meaningful(step?.notes, 8), `step '${registeredStep.id}' needs bounded result notes`);
    }
  }

  const measurementKeys = Object.keys(manifest.measurements ?? {});
  add(errors, sameStringSet(measurementKeys, milestone.requiredMeasurements), "measurement keys must exactly match the milestone registry");
  if (complete) {
    for (const name of milestone.requiredMeasurements) add(errors, finiteMeasurement(manifest.measurements?.[name]), `measurement '${name}' must be a finite number`);
  }

  add(errors, Array.isArray(manifest.findings), "findings must be an array");
  const findingIds = new Set();
  for (const [index, finding] of (manifest.findings ?? []).entries()) {
    objectShape(finding, { allowed: ["id", "category", "severity", "summary", "disposition", "evidenceRefs"] }, `findings[${index}]`, errors);
    validateFinding(finding, index, artifactIds, errors);
    if (findingIds.has(finding?.id)) errors.push(`finding ID '${finding.id}' is duplicated`);
    findingIds.add(finding?.id);
  }
  objectShape(manifest.findingsReview, { allowed: ["usabilityReviewed", "correctnessReviewed", "summary"] }, "findingsReview", errors);
  if (complete) {
    add(errors, manifest.findingsReview?.usabilityReviewed === true, "findingsReview.usabilityReviewed must be true");
    add(errors, manifest.findingsReview?.correctnessReviewed === true, "findingsReview.correctnessReviewed must be true");
    add(errors, meaningful(manifest.findingsReview?.summary, 12), "findingsReview.summary must explicitly record the review, including when no findings were observed");
  }

  add(errors, Array.isArray(manifest.incidents), "incidents must be an array");
  for (const [index, incident] of (manifest.incidents ?? []).entries()) {
    objectShape(incident, { allowed: ["id", "summary", "disposition", "evidenceRefs"] }, `incidents[${index}]`, errors);
    add(errors, ID.test(incident?.id ?? ""), `incidents[${index}].id must be lower-kebab-case`);
    add(errors, meaningful(incident?.summary, 8), `incidents[${index}].summary is missing`);
    add(errors, meaningful(incident?.disposition, 3), `incidents[${index}].disposition is missing`);
    add(errors, Array.isArray(incident?.evidenceRefs), `incidents[${index}].evidenceRefs must be an array`);
    for (const ref of incident?.evidenceRefs ?? []) add(errors, artifactIds.has(ref), `incidents[${index}] references unknown artifact '${ref}'`);
  }

  const signoffs = Array.isArray(manifest.signoffs) ? manifest.signoffs : [];
  add(errors, exactArray(signoffs.map((entry) => entry?.role), milestone.requiredSignoffs), "signoff roles must exactly match the milestone registry order");
  signoffs.forEach((signoff, index) => objectShape(signoff, {
    allowed: ["role", "pseudonymousId", "attestation", "signedAt", "signatureRef"],
  }, `signoffs[${index}]`, errors));
  if (complete) {
    for (const signoff of signoffs) {
      const participant = participantByRole.get(signoff.role);
      add(errors, signoff.pseudonymousId === participant?.pseudonymousId, `signoff '${signoff.role}' must match the participant pseudonymousId`);
      add(errors, meaningful(signoff.attestation, 12), `signoff '${signoff.role}' needs an attestation`);
      add(errors, iso(signoff.signedAt), `signoff '${signoff.role}' signedAt must be canonical ISO-8601`);
      add(errors, artifactIds.has(signoff.signatureRef), `signoff '${signoff.role}' references unknown signature artifact '${signoff.signatureRef}'`);
    }
  }

  objectShape(manifest.outcome, { allowed: ["criteriaMet", "summary", "limitations", "followUpTaskIds"] }, "outcome", errors);
  if (complete) {
    add(errors, typeof manifest.outcome?.criteriaMet === "boolean", "outcome.criteriaMet must be boolean");
    add(errors, meaningful(manifest.outcome?.summary, 20), "outcome.summary must explain the verdict and boundary");
    add(errors, Array.isArray(manifest.outcome?.limitations), "outcome.limitations must be an array");
    add(errors, Array.isArray(manifest.outcome?.followUpTaskIds), "outcome.followUpTaskIds must be an array");
    for (const taskId of manifest.outcome?.followUpTaskIds ?? []) add(errors, TASK_ID.test(taskId), `outcome follow-up task '${taskId}' is invalid`);
    if (manifest.status === "passed") {
      add(errors, manifest.outcome?.criteriaMet === true, "passed evidence requires outcome.criteriaMet true");
      add(errors, manifestSteps.every((step) => step.status === "passed"), "passed evidence requires every milestone step to pass");
    } else {
      add(errors, manifest.outcome?.criteriaMet === false, `${manifest.status} evidence requires outcome.criteriaMet false`);
      add(errors, manifestSteps.some((step) => step.status === "failed" || step.status === "stopped"), `${manifest.status} evidence needs at least one failed or stopped step`);
    }
  }
  return errors;
}

export function renderRunbook(registry, milestoneId, manifest) {
  const milestone = milestoneById(registry, milestoneId);
  if (!milestone) throw new Error(`unknown milestone '${milestoneId}'`);
  const lines = [
    `# ${milestone.title}`,
    "",
    `Run ID: \`${manifest.runId}\`  `,
    `Evidence format: \`${manifest.schemaVersion}\`  `,
    `Tasks: ${milestone.taskIds.map((taskId) => `\`${taskId}\``).join(", ")}  `,
    `Program gate: \`${milestone.programGate}\`  `,
    `Target maturity: \`${milestone.targetMaturity}\``,
    "",
    "> This runbook is a scaffold, not acceptance evidence. A milestone closes only after",
    "> the completed manifest validates, the named roles sign, retained evidence resolves,",
    "> required repository/product gates are green, and the owning TODO is reconciled.",
    "",
    "## Data handling",
    "",
    registry.dataPolicy.publicRecord,
    "",
    registry.dataPolicy.privateRecord,
    "",
    "Do not commit this run directory. Do not paste raw identities, photos, telemetry,",
    "credentials, signed URLs, provider payloads, or signed originals into the manifest.",
    "Use pseudonymous role IDs and content-addressed or access-controlled references.",
    "",
    "## Required roles and authority",
    "",
    `Roles: ${milestone.requiredRoles.map((role) => `\`${role}\``).join(", ")}.`,
    `Independent roles: ${milestone.independentRoles.length ? milestone.independentRoles.map((role) => `\`${role}\``).join(", ") : "none"}.`,
    `Required signoffs: ${milestone.requiredSignoffs.map((role) => `\`${role}\``).join(", ")}.`,
    `Authority references: ${milestone.requiredAuthorityRefs.map((name) => `\`${name}\``).join(", ")}.`,
    "",
    "## Prerequisites",
    "",
    ...milestone.prerequisites.map((entry) => `- ${entry}`),
    "",
    "## Stop conditions",
    "",
    ...milestone.stopConditions.map((entry) => `- ${entry}`),
    "",
    "A stop is a valid evidence outcome. Preserve the failed/stopped record; do not edit",
    "criteria, thresholds, identities, or the tested revision to turn it into a pass.",
    "",
    "## Script",
    "",
    ...milestone.steps.flatMap((step, index) => [
      `### ${index + 1}. ${step.title}`,
      "",
      `Step ID: \`${step.id}\``,
      "",
      step.instruction,
      "",
      `Required evidence kinds: ${step.requiredEvidenceKinds.map((kind) => `\`${kind}\``).join(", ")}.`,
      "",
    ]),
    "## Measurements",
    "",
    ...milestone.requiredMeasurements.map((name) => `- \`${name}\``),
    "",
    "## Completion",
    "",
    "1. Fill `acceptance.json` with exact timestamps, full commit SHA, product version,",
    "   environment/deployment reference, pseudonymous participants, authority references,",
    "   step outcomes, content-addressed artifacts, measurements, findings/incidents, signoffs,",
    "   verdict, limitations, and follow-up task IDs.",
    "2. Validate the completed pack from the repository root:",
    "",
    "   ```bash",
    "   node scripts/external-acceptance.mjs validate /absolute/path/to/private/run",
    "   ```",
    "",
    "3. Store raw evidence under the declared access, retention, export, deletion, and hold",
    "   controls. Commit only a reviewed minimized record when the owning task requires it.",
    "4. Link exact product revision, CI/security evidence, external evidence location, and",
    "   accepted limitations before changing any EXT, phase, gate, or maturity claim.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}
