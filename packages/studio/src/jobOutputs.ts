export interface JsonPatchOp {
  op: "add" | "replace" | "remove" | "test" | string;
  path: string;
  value?: unknown;
}

export interface PhotoscanOutput {
  artifactKind: "photoscan";
  sourceImages?: unknown[];
  objectCache?: { key?: string; provider?: string };
  alignment?: { scaleLocked?: boolean; axesLocked?: boolean; portsMarked?: boolean };
  acceptance?: {
    gate?: string;
    pass?: boolean;
    fitCoveragePct?: number;
    hausdorffPct?: number;
    scaleErrorPct?: number;
    axisErrorDeg?: number;
    meshClassFallback?: boolean;
  };
  primitiveRefit?: { kind?: string; rmsMm?: number; confidence?: number }[];
  candidateComponent?: { id?: string; confidence?: number; review?: string; reviewRequired?: boolean };
}

export interface PolicyOutput {
  artifactKind: "policy";
  formatVersion?: string;
  algorithm?: string;
  task?: {
    id?: string;
    suite?: string;
    version?: string;
    coordinateFrame?: string;
    definitionHash?: string;
    curriculumStage?: number;
    horizonS?: number;
    target?: { xyzM?: number[] };
    targets?: { kind?: string; xyzM?: number[]; radiusM?: number }[];
  };
  io?: {
    observations?: string[];
    actions?: string[];
    onnxHeader?: Record<string, string | number | boolean | null>;
    tensor?: {
      schema?: string;
      schemaVersion?: string;
      coordinateFrame?: string;
      input?: { name?: string; shape?: number[]; layout?: string[] };
      output?: { name?: string; shape?: number[]; layout?: string[] };
      rateHz?: number;
    };
  };
  domainRandomization?: Record<string, unknown>;
  onnx?: {
    cacheKey?: string;
    opset?: number;
    fixture?: boolean;
    path?: string;
    byteSize?: number;
    sha256?: string;
    modelBase64?: string;
  };
  delivery?: {
    storage?: string;
    objectBacked?: boolean;
    jobId?: string;
    byteSize?: number;
    sha256?: string;
    artifactBlobId?: string;
    policyArtifactId?: string;
    modelRevision?: { modelId?: string | null; contractHash?: string | null };
  };
  scorecard?: {
    task?: string;
    taskVersion?: string;
    successRate?: number;
    returnMean?: number;
    estimatorSmoke?: string;
    trainedOnEstimator?: boolean;
    exportGate?: string;
    robustness?: Record<string, number>;
    energyWh?: number;
    exportable?: boolean;
    reasons?: string[];
    lineage?: Record<string, unknown>;
  };
}

export interface ReplayOutput {
  artifactKind: "replay" | "telemetry-replay";
  verified?: boolean;
  tamperHash?: string;
  tapeHash?: string;
  frameCount?: number;
  durationS?: number;
  rejectReason?: string | null;
}

export interface CodesignCandidate {
  id: string;
  patch?: JsonPatchOp[];
  tier?: string;
  admitted?: boolean;
  metrics?: { massG?: number; enduranceMin?: number; taskTimeS?: number; score?: number; energyWh?: number };
  evaluations?: Record<string, { pass?: boolean; engine?: string; engineBacked?: boolean; held?: boolean }>;
  lineage?: { maturity?: string; candidateSnapshotSha256?: string; mujocoRuntime?: string };
}

export interface CodesignOutput {
  schemaVersion?: "forge-codesign-evaluation/1.0.0";
  artifactKind: "codesign";
  provider?: string;
  cacheKey?: string;
  tiers?: string[];
  manifold?: Record<string, unknown>;
  source?: { maturity?: string; sourceRevisionRecorded?: boolean };
  optimizer?: { algorithm?: string; engineBacked?: boolean; overnightComplete?: boolean; trainingFinalists?: number };
  benchmark?: { tier0MaxMs?: number; tier0BudgetMs?: number; controlledSmoke?: boolean; engineBacked?: boolean };
  nonclaims?: Record<string, boolean>;
  candidates?: CodesignCandidate[];
  pareto?: CodesignCandidate[];
}

export interface ControlledCodesignDisclosure {
  tier0MaxMs: number;
  tier0BudgetMs: number;
  candidateCount: number;
  paretoCount: number;
}

const CONTROLLED_CODESIGN_NONCLAIMS = [
  "cmaEsExecuted",
  "optunaTpeExecuted",
  "overnight200Candidate",
  "trainedFinalist",
  "catalogChoiceSearch",
  "providerSandbox",
  "buildReady",
  "hardwareAuthority",
  "fieldEvidence",
] as const;

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

export function controlledCodesignDisclosure(value: unknown): ControlledCodesignDisclosure | null {
  const output = asRecord(value);
  const source = asRecord(output?.source);
  const optimizer = asRecord(output?.optimizer);
  const benchmark = asRecord(output?.benchmark);
  const nonclaims = asRecord(output?.nonclaims);
  const tiers = output?.tiers;
  const candidates = output?.candidates;
  const pareto = output?.pareto;
  const tier0MaxMs = benchmark?.tier0MaxMs;
  const tier0BudgetMs = benchmark?.tier0BudgetMs;
  const sourceRevision = source?.sourceRevision;
  const dependencyManifestSha256 = source?.dependencyManifestSha256;
  if (
    output?.schemaVersion !== "forge-codesign-evaluation/1.0.0"
    || output.artifactKind !== "codesign"
    || output.provider !== "forge-local-engine-codesign"
    || source?.runtime !== "forge-codesign-engine-smoke/1.0.0"
    || source.maturity !== "local-engine-controlled-smoke"
    || source.sourceRevisionRecorded !== true
    || typeof sourceRevision !== "string"
    || !/^[0-9a-f]{40}$/.test(sourceRevision)
    || typeof dependencyManifestSha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(dependencyManifestSha256)
    || optimizer?.algorithm !== "deterministic-controlled-smoke"
    || optimizer.engineBacked !== true
    || optimizer.overnightComplete !== false
    || optimizer.trainingFinalists !== 0
    || benchmark?.engineBacked !== true
    || benchmark.controlledSmoke !== true
    || benchmark.overnightComplete !== false
    || typeof tier0MaxMs !== "number"
    || !Number.isFinite(tier0MaxMs)
    || tier0MaxMs < 0
    || typeof tier0BudgetMs !== "number"
    || !Number.isFinite(tier0BudgetMs)
    || tier0BudgetMs !== 50
    || !Array.isArray(tiers)
    || tiers.join("\0") !== "validator-oracle\0rapier-smoke\0mujoco-rollout\0training-finalist-held"
    || !nonclaims
    || !hasExactKeys(nonclaims, CONTROLLED_CODESIGN_NONCLAIMS)
    || CONTROLLED_CODESIGN_NONCLAIMS.some((key) => nonclaims[key] !== false)
    || !Array.isArray(candidates)
    || candidates.length < 3
    || candidates.length > 9
    || !Array.isArray(pareto)
  ) {
    return null;
  }
  const candidateIds = new Set<string>();
  for (const candidateValue of candidates) {
    const candidate = asRecord(candidateValue);
    const lineage = asRecord(candidate?.lineage);
    const evaluations = asRecord(candidate?.evaluations);
    const tier0 = asRecord(evaluations?.tier0);
    const tier1 = asRecord(evaluations?.tier1);
    const tier2 = asRecord(evaluations?.tier2);
    const tier3 = asRecord(evaluations?.tier3);
    const candidateSnapshotSha256 = lineage?.candidateSnapshotSha256;
    const nativeEvaluationSha256 = lineage?.nativeEvaluationSha256;
    if (
      typeof candidate?.id !== "string"
      || candidateIds.has(candidate.id)
      || typeof candidate.admitted !== "boolean"
      || lineage?.maturity !== "local-engine-controlled-smoke"
      || lineage.mujocoRuntime !== "3.9.0"
      || lineage.trainingBundleSchema !== "2.0.0"
      || typeof candidateSnapshotSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(candidateSnapshotSha256)
      || typeof nativeEvaluationSha256 !== "string"
      || !/^[0-9a-f]{64}$/.test(nativeEvaluationSha256)
      || tier0?.engine !== "forge-validate-native"
      || tier0.engineBacked !== true
      || typeof tier0.pass !== "boolean"
      || tier1?.engine !== "rapier3d/0.33.0"
      || tier1.engineBacked !== true
      || typeof tier1.pass !== "boolean"
      || tier2?.engine !== "mujoco/3.9.0"
      || typeof tier2.pass !== "boolean"
      || (tier2.pass && tier2.engineBacked !== true)
      || tier3?.engine !== "not-run"
      || tier3.engineBacked !== false
      || tier3.pass !== false
      || tier3.evaluated !== false
      || tier3.held !== true
      || (candidate.admitted && (tier0.pass !== true || tier1.pass !== true || tier2.pass !== true))
    ) {
      return null;
    }
    candidateIds.add(candidate.id);
  }
  const paretoIds = new Set<string>();
  for (const candidateValue of pareto) {
    const candidate = asRecord(candidateValue);
    if (
      typeof candidate?.id !== "string"
      || !candidateIds.has(candidate.id)
      || candidate.admitted !== true
      || paretoIds.has(candidate.id)
    ) {
      return null;
    }
    paretoIds.add(candidate.id);
  }
  return { tier0MaxMs, tier0BudgetMs, candidateCount: candidates.length, paretoCount: pareto.length };
}

export interface BridgeConfigOutput {
  schemaVersion: "forge-bridge-config/1.0.0";
  artifactKind: "bridge-config";
  firmware?: string;
  firmwareVersion: "2025.12";
  diffHash?: string;
  requiresPhysicalConfirmation?: boolean;
  noAutoArm: boolean;
  lines?: string[];
}

export interface SupervisorOutput {
  artifactKind: "supervisor-decision";
  allowPolicy?: boolean;
  command?: string;
  rateHz?: { policyAdvisory?: number; supervisor?: number };
  reasons?: string[];
}

export interface WearOutput {
  artifactKind: "wear-estimate";
  motorHours?: number;
  packCycles?: number;
  rIntMohm?: number | null;
  warnings?: string[];
}

export interface CrashOutput {
  artifactKind: "crash-forensics";
  crashDetected?: boolean;
  window?: { startS?: number; impactS?: number; endS?: number } | null;
  ghostOverlay?: { enabled?: boolean; divergenceMetric?: string };
}

export interface RepairOutput {
  artifactKind: "repair-sheet";
  steps?: { order?: number; node?: string; partIndex?: number; action?: string; reorderSku?: string | null }[];
  reorderCount?: number;
}

export interface FleetOutput {
  artifactKind: "fleet-summary";
  vehicleCount?: number;
  criticalCount?: number;
  serviceDueCount?: number;
  nextActions?: { vehicleId?: string; action?: string }[];
}

export interface SysIdOutput {
  artifactKind: "sysid";
  sampleCount?: number;
  fit?: {
    batterySagRmse?: number | null;
    currentRmseA?: number | null;
    rIntMohm?: number | null;
    frictionScale?: number;
    timeConstantMs?: number;
    accepted?: boolean;
  };
  simPatch?: JsonPatchOp[];
  rejectReason?: string | null;
}

export type KnownJobOutput =
  | PhotoscanOutput
  | PolicyOutput
  | ReplayOutput
  | CodesignOutput
  | BridgeConfigOutput
  | SupervisorOutput
  | WearOutput
  | CrashOutput
  | RepairOutput
  | FleetOutput
  | SysIdOutput;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function artifactKind(value: unknown): string | null {
  const record = asRecord(value);
  return typeof record?.artifactKind === "string" ? record.artifactKind : null;
}

export function isKnownJobOutput(value: unknown): value is KnownJobOutput {
  return [
    "photoscan",
    "policy",
    "replay",
    "telemetry-replay",
    "codesign",
    "bridge-config",
    "supervisor-decision",
    "wear-estimate",
    "crash-forensics",
    "repair-sheet",
    "fleet-summary",
    "sysid",
  ].includes(artifactKind(value) ?? "");
}

export function isPatchList(value: unknown): value is JsonPatchOp[] {
  return (
    Array.isArray(value) &&
    value.every((op) => {
      const record = asRecord(op);
      return typeof record?.op === "string" && typeof record.path === "string";
    })
  );
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
