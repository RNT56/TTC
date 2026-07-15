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
  algorithm?: string;
  task?: {
    id?: string;
    suite?: string;
    curriculumStage?: number;
    horizonS?: number;
    target?: { xyzM?: number[] };
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
  metrics?: { massG?: number; enduranceMin?: number; score?: number };
}

export interface CodesignOutput {
  artifactKind: "codesign";
  provider?: string;
  cacheKey?: string;
  tiers?: string[];
  manifold?: Record<string, unknown>;
  candidates?: CodesignCandidate[];
  pareto?: CodesignCandidate[];
}

export interface BridgeConfigOutput {
  artifactKind: "bridge-config";
  firmware?: string;
  diffHash?: string;
  requiresPhysicalConfirmation?: boolean;
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
