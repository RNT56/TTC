import { invoke, isTauri } from "@tauri-apps/api/core";

export const DEPLOYMENT_LADDER_SCHEMA_VERSION = "forge-deployment-ladder/1.0.0";
export const DEPLOYMENT_LADDER_CONTROL_SCHEMA_VERSION =
  "forge-deployment-ladder-control/1.0.0";
export const DEPLOYMENT_LADDER_MATURITY = "local-ux-rehearsal";
export const DEPLOYMENT_LADDER_START_CONFIRMATION =
  "I confirm this is a rehearsal-only ladder session and grants no hardware authority";
export const DEPLOYMENT_LADDER_END_CONFIRMATION =
  "I confirm this rehearsal is ended and no hardware authority was granted";
export const DEPLOYMENT_LADDER_POLICY_RATE_HZ = 50;
export const DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ = 200;
export const DEPLOYMENT_LADDER_FALLBACK = "position-hold-or-manual";

export const DEPLOYMENT_LADDER_STAGES = [
  {
    id: "sitl",
    label: "SITL",
    requires: ["admitted model", "exportable scorecard", "passing supervisor check"],
    transitionConfirmation: null,
  },
  {
    id: "hitl",
    label: "HITL",
    requires: ["SITL pass", "real controller connected", "timing report"],
    transitionConfirmation:
      "I physically confirm the controller is bench-connected, actuators are disabled, and the supervisor fallback is ready",
  },
  {
    id: "constrained",
    label: "Constrained Reality",
    requires: ["HITL pass", "physical restraint", "observer", "hardware kill switch"],
    transitionConfirmation:
      "I physically confirm the restraint, observer, hardware kill switch, and supervisor fallback are ready",
  },
  {
    id: "free",
    label: "Free Operation",
    requires: ["constrained pass", "declared envelope", "fresh battery", "telemetry recording"],
    transitionConfirmation:
      "I physically confirm the declared envelope, observer, hardware kill switch, fresh battery, telemetry recording, and supervisor fallback are ready",
  },
] as const;

export type DeploymentLadderStage = (typeof DEPLOYMENT_LADDER_STAGES)[number]["id"];
export type DeploymentLadderState = "inactive" | "rehearsing" | "rehearsal-complete";

export interface DeploymentLadderStartRequest {
  sessionId: string;
  referenceRigId: string;
  modelId: string;
  contractHash: string;
  lockfileHash: string;
  policyArtifactId: string;
  policyExportGate: "exportable";
  supervisorJobId: string;
  supervisorDecision: "policy-advisory";
  supervisorAllowPolicy: true;
  policyRateHz: typeof DEPLOYMENT_LADDER_POLICY_RATE_HZ;
  supervisorRateHz: typeof DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ;
  firmwareRateLoopUntouched: true;
  missedInferenceFallback: typeof DEPLOYMENT_LADDER_FALLBACK;
  physicalConfirmation: typeof DEPLOYMENT_LADDER_START_CONFIRMATION;
}

export interface DeploymentLadderAdvanceRequest {
  sessionId: string;
  fromStage: DeploymentLadderStage;
  toStage: Exclude<DeploymentLadderStage, "sitl">;
  physicalConfirmation: string;
}

export interface DeploymentLadderResetRequest {
  sessionId: string;
  physicalConfirmation: typeof DEPLOYMENT_LADDER_END_CONFIRMATION;
}

export interface DeploymentLadderStatus {
  schemaVersion: typeof DEPLOYMENT_LADDER_CONTROL_SCHEMA_VERSION;
  contractSchemaVersion: typeof DEPLOYMENT_LADDER_SCHEMA_VERSION;
  state: DeploymentLadderState;
  rehearsalMaturity: typeof DEPLOYMENT_LADDER_MATURITY;
  sessionId: string | null;
  referenceRigId: string | null;
  modelId: string | null;
  contractHash: string | null;
  lockfileHash: string | null;
  policyArtifactId: string | null;
  supervisorJobId: string | null;
  currentStage: DeploymentLadderStage | null;
  nextStage: DeploymentLadderStage | null;
  acknowledgedStages: DeploymentLadderStage[];
  stageOrder: DeploymentLadderStage[];
  physicalConfirmationStages: Exclude<DeploymentLadderStage, "sitl">[];
  transitionCount: number;
  policyRateHz: typeof DEPLOYMENT_LADDER_POLICY_RATE_HZ;
  supervisorRateHz: typeof DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ;
  firmwareRateLoopUntouched: true;
  missedInferenceFallback: typeof DEPLOYMENT_LADDER_FALLBACK;
  policyAdvisory: true;
  supervisorAuthority: true;
  noAutoArm: true;
  clientEvidenceBound: boolean;
  deploymentEvidenceVerified: false;
  physicalConfirmationEvidenceVerified: false;
  hardwareExecutionAuthorized: false;
  deviceIdentityVerified: false;
  fieldSessionVerified: false;
  externalBetaEnabled: false;
}

export interface DesktopDeploymentLadderRuntime {
  available(): boolean;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

const tauriRuntime: DesktopDeploymentLadderRuntime = {
  available: () => isTauri(),
  invoke: (command, args) => invoke(command, args),
};

const STATUS_FIELDS = [
  "schemaVersion", "contractSchemaVersion", "state", "rehearsalMaturity", "sessionId",
  "referenceRigId", "modelId", "contractHash", "lockfileHash", "policyArtifactId",
  "supervisorJobId", "currentStage", "nextStage", "acknowledgedStages", "stageOrder",
  "physicalConfirmationStages", "transitionCount", "policyRateHz", "supervisorRateHz",
  "firmwareRateLoopUntouched", "missedInferenceFallback", "policyAdvisory",
  "supervisorAuthority", "noAutoArm", "clientEvidenceBound", "deploymentEvidenceVerified",
  "physicalConfirmationEvidenceVerified", "hardwareExecutionAuthorized", "deviceIdentityVerified",
  "fieldSessionVerified", "externalBetaEnabled",
] as const;

const STAGE_ORDER = DEPLOYMENT_LADDER_STAGES.map((stage) => stage.id);
const PHYSICAL_STAGES = STAGE_ORDER.slice(1);

export function desktopDeploymentLadderAvailable(
  runtime: DesktopDeploymentLadderRuntime = tauriRuntime,
): boolean {
  return runtime.available();
}

export async function getDeploymentLadderStatus(
  runtime: DesktopDeploymentLadderRuntime = tauriRuntime,
): Promise<DeploymentLadderStatus> {
  requireDesktop(runtime);
  return parseDeploymentLadderStatus(await runtime.invoke<unknown>("deployment_ladder_status"));
}

export async function startDeploymentLadder(
  request: DeploymentLadderStartRequest,
  runtime: DesktopDeploymentLadderRuntime = tauriRuntime,
): Promise<DeploymentLadderStatus> {
  requireDesktop(runtime);
  const normalized = validateStartRequest(request);
  const status = parseDeploymentLadderStatus(await runtime.invoke<unknown>(
    "start_deployment_ladder",
    { request: normalized },
  ));
  if (status.state !== "rehearsing"
    || status.currentStage !== "sitl"
    || status.sessionId !== normalized.sessionId
    || status.referenceRigId !== normalized.referenceRigId
    || status.modelId !== normalized.modelId
    || status.contractHash !== normalized.contractHash
    || status.lockfileHash !== normalized.lockfileHash
    || status.policyArtifactId !== normalized.policyArtifactId
    || status.supervisorJobId !== normalized.supervisorJobId) {
    throw new Error("Desktop deployment-ladder start status does not match the bounded rehearsal request");
  }
  return status;
}

export async function advanceDeploymentLadder(
  expectedStatus: DeploymentLadderStatus,
  request: DeploymentLadderAdvanceRequest,
  runtime: DesktopDeploymentLadderRuntime = tauriRuntime,
): Promise<DeploymentLadderStatus> {
  requireDesktop(runtime);
  if (expectedStatus.state === "inactive" || expectedStatus.sessionId === null
    || expectedStatus.currentStage === null || expectedStatus.nextStage === null) {
    throw new Error("no advanceable Desktop deployment-ladder rehearsal is active");
  }
  const expectedNext = nextDeploymentStage(expectedStatus.currentStage);
  const confirmation = confirmationForStage(expectedNext);
  if (request.sessionId !== expectedStatus.sessionId
    || request.fromStage !== expectedStatus.currentStage
    || request.toStage !== expectedNext
    || request.physicalConfirmation !== confirmation) {
    throw new Error("Desktop deployment-ladder advance request must name the exact next stage and physical confirmation");
  }
  const status = parseDeploymentLadderStatus(await runtime.invoke<unknown>(
    "advance_deployment_ladder",
    { request },
  ));
  if (status.sessionId !== expectedStatus.sessionId
    || status.referenceRigId !== expectedStatus.referenceRigId
    || status.modelId !== expectedStatus.modelId
    || status.contractHash !== expectedStatus.contractHash
    || status.lockfileHash !== expectedStatus.lockfileHash
    || status.policyArtifactId !== expectedStatus.policyArtifactId
    || status.supervisorJobId !== expectedStatus.supervisorJobId
    || status.currentStage !== expectedNext
    || status.transitionCount !== expectedStatus.transitionCount + 1) {
    throw new Error("Desktop deployment-ladder transition status drifted from the active rehearsal");
  }
  return status;
}

export async function resetDeploymentLadder(
  expectedStatus: DeploymentLadderStatus,
  runtime: DesktopDeploymentLadderRuntime = tauriRuntime,
): Promise<DeploymentLadderStatus> {
  requireDesktop(runtime);
  if (expectedStatus.state === "inactive" || expectedStatus.sessionId === null) {
    throw new Error("no Desktop deployment-ladder rehearsal is active");
  }
  const request: DeploymentLadderResetRequest = {
    sessionId: expectedStatus.sessionId,
    physicalConfirmation: DEPLOYMENT_LADDER_END_CONFIRMATION,
  };
  const status = parseDeploymentLadderStatus(await runtime.invoke<unknown>(
    "reset_deployment_ladder",
    { request },
  ));
  if (status.state !== "inactive" || status.sessionId !== null || status.currentStage !== null) {
    throw new Error("Desktop deployment-ladder reset did not return to inactive non-authority");
  }
  return status;
}

export function parseDeploymentLadderStatus(value: unknown): DeploymentLadderStatus {
  requireExactFields(value, STATUS_FIELDS, "Desktop deployment-ladder status");
  if (value.schemaVersion !== DEPLOYMENT_LADDER_CONTROL_SCHEMA_VERSION
    || value.contractSchemaVersion !== DEPLOYMENT_LADDER_SCHEMA_VERSION
    || value.rehearsalMaturity !== DEPLOYMENT_LADDER_MATURITY
    || (value.state !== "inactive" && value.state !== "rehearsing" && value.state !== "rehearsal-complete")) {
    throw new Error("Desktop deployment-ladder status declares an unsupported contract or state");
  }
  if (!sameStringArray(value.stageOrder, STAGE_ORDER)
    || !sameStringArray(value.physicalConfirmationStages, PHYSICAL_STAGES)) {
    throw new Error("Desktop deployment-ladder stage order or confirmation scope has drifted");
  }
  if (value.policyRateHz !== DEPLOYMENT_LADDER_POLICY_RATE_HZ
    || value.supervisorRateHz !== DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ
    || value.firmwareRateLoopUntouched !== true
    || value.missedInferenceFallback !== DEPLOYMENT_LADDER_FALLBACK) {
    throw new Error("Desktop deployment-ladder D9 control-rate authority has drifted");
  }
  if (value.policyAdvisory !== true
    || value.supervisorAuthority !== true
    || value.noAutoArm !== true
    || typeof value.clientEvidenceBound !== "boolean"
    || value.deploymentEvidenceVerified !== false
    || value.physicalConfirmationEvidenceVerified !== false
    || value.hardwareExecutionAuthorized !== false
    || value.deviceIdentityVerified !== false
    || value.fieldSessionVerified !== false
    || value.externalBetaEnabled !== false) {
    throw new Error("Desktop deployment-ladder status promotes unsupported authority");
  }
  if (value.state === "inactive") {
    for (const field of [
      "sessionId", "referenceRigId", "modelId", "contractHash", "lockfileHash",
      "policyArtifactId", "supervisorJobId", "currentStage",
    ] as const) {
      if (value[field] !== null) {
        throw new Error("inactive Desktop deployment-ladder status contains rehearsal identity");
      }
    }
    if (value.nextStage !== "sitl" || !sameStringArray(value.acknowledgedStages, [])
      || value.transitionCount !== 0 || value.clientEvidenceBound !== false) {
      throw new Error("inactive Desktop deployment-ladder status contains rehearsal progress");
    }
  } else {
    for (const field of ["sessionId", "modelId", "policyArtifactId", "supervisorJobId"] as const) {
      if (typeof value[field] !== "string" || !isSafeId(value[field])) {
        throw new Error(`Desktop deployment-ladder ${field} is invalid`);
      }
    }
    if (typeof value.referenceRigId !== "string" || !isD12Rig(value.referenceRigId)
      || typeof value.contractHash !== "string" || !isSha256(value.contractHash)
      || typeof value.lockfileHash !== "string" || !isSha256(value.lockfileHash)
      || !isStage(value.currentStage)) {
      throw new Error("active Desktop deployment-ladder identity is invalid");
    }
    const index = STAGE_ORDER.indexOf(value.currentStage);
    const expectedNext = STAGE_ORDER[index + 1] ?? null;
    if (value.nextStage !== expectedNext
      || !sameStringArray(value.acknowledgedStages, STAGE_ORDER.slice(0, index + 1))
      || value.transitionCount !== index
      || value.clientEvidenceBound !== true
      || (value.state === "rehearsal-complete") !== (value.currentStage === "free")) {
      throw new Error("active Desktop deployment-ladder progress is not a contiguous prefix");
    }
  }
  return value as unknown as DeploymentLadderStatus;
}

export function isPassingSupervisorDecision(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const fields = Object.keys(value).sort();
  if (!sameStringArray(fields, ["allowPolicy", "artifactKind", "command", "rateHz", "reasons"].sort())) {
    return false;
  }
  if (value.artifactKind !== "supervisor-decision"
    || value.allowPolicy !== true
    || value.command !== "policy-advisory"
    || !Array.isArray(value.reasons)
    || value.reasons.length !== 0
    || !isRecord(value.rateHz)
    || !sameStringArray(Object.keys(value.rateHz).sort(), ["policyAdvisory", "supervisor"].sort())) {
    return false;
  }
  return value.rateHz.policyAdvisory === DEPLOYMENT_LADDER_POLICY_RATE_HZ
    && value.rateHz.supervisor === DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ;
}

export function nextDeploymentStage(
  stage: DeploymentLadderStage,
): Exclude<DeploymentLadderStage, "sitl"> {
  const index = STAGE_ORDER.indexOf(stage);
  const next = STAGE_ORDER[index + 1];
  if (next === undefined || next === "sitl") {
    throw new Error("free operation is the final deployment-ladder stage");
  }
  return next;
}

export function confirmationForStage(
  stage: Exclude<DeploymentLadderStage, "sitl">,
): string {
  const entry = DEPLOYMENT_LADDER_STAGES.find((candidate) => candidate.id === stage);
  if (!entry || entry.transitionConfirmation === null) {
    throw new Error(`deployment-ladder stage ${stage} has no physical confirmation`);
  }
  return entry.transitionConfirmation;
}

function validateStartRequest(request: DeploymentLadderStartRequest): DeploymentLadderStartRequest {
  if (!isRecord(request)) throw new Error("Desktop deployment-ladder start request must be an object");
  for (const field of ["sessionId", "modelId", "policyArtifactId", "supervisorJobId"] as const) {
    if (!isSafeId(request[field])) {
      throw new Error(`Desktop deployment-ladder ${field} must use 1 through 128 safe ASCII characters`);
    }
  }
  if (!isD12Rig(request.referenceRigId)
    || !isSha256(request.contractHash)
    || !isSha256(request.lockfileHash)
    || request.policyExportGate !== "exportable"
    || request.supervisorDecision !== "policy-advisory"
    || request.supervisorAllowPolicy !== true
    || request.policyRateHz !== DEPLOYMENT_LADDER_POLICY_RATE_HZ
    || request.supervisorRateHz !== DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ
    || request.firmwareRateLoopUntouched !== true
    || request.missedInferenceFallback !== DEPLOYMENT_LADDER_FALLBACK
    || request.physicalConfirmation !== DEPLOYMENT_LADDER_START_CONFIRMATION) {
    throw new Error("Desktop deployment-ladder start request is outside the D9/D12 rehearsal contract");
  }
  return request;
}

function requireDesktop(runtime: DesktopDeploymentLadderRuntime): void {
  if (!runtime.available()) throw new Error("deployment-ladder controls require FORGE Desktop");
}

function requireExactFields<const T extends readonly string[]>(
  value: unknown,
  expected: T,
  label: string,
): asserts value is Record<T[number], unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  if (!sameStringArray(Object.keys(value).sort(), [...expected].sort())) {
    throw new Error(`${label} fields have drifted`);
  }
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isD12Rig(value: unknown): value is string {
  return value === "ref_quad_kakute-h7-source-one-5in"
    || value === "ref_rover_waveshare-ugv-rover-pt-pi5-ros2";
}

function isStage(value: unknown): value is DeploymentLadderStage {
  return typeof value === "string" && STAGE_ORDER.includes(value as DeploymentLadderStage);
}
