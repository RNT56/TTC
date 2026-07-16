import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPLOYMENT_LADDER_CONTROL_SCHEMA_VERSION,
  DEPLOYMENT_LADDER_END_CONFIRMATION,
  DEPLOYMENT_LADDER_FALLBACK,
  DEPLOYMENT_LADDER_MATURITY,
  DEPLOYMENT_LADDER_POLICY_RATE_HZ,
  DEPLOYMENT_LADDER_SCHEMA_VERSION,
  DEPLOYMENT_LADDER_STAGES,
  DEPLOYMENT_LADDER_START_CONFIRMATION,
  DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ,
  advanceDeploymentLadder,
  confirmationForStage,
  getDeploymentLadderStatus,
  isPassingSupervisorDecision,
  nextDeploymentStage,
  parseDeploymentLadderStatus,
  resetDeploymentLadder,
  startDeploymentLadder,
  type DeploymentLadderStage,
  type DeploymentLadderStartRequest,
  type DeploymentLadderStatus,
  type DesktopDeploymentLadderRuntime,
} from "../src/deploymentLadder";

const STAGE_ORDER = DEPLOYMENT_LADDER_STAGES.map((stage) => stage.id);

function statusFixture(stage: DeploymentLadderStage | null): DeploymentLadderStatus {
  const index = stage === null ? -1 : STAGE_ORDER.indexOf(stage);
  return {
    schemaVersion: DEPLOYMENT_LADDER_CONTROL_SCHEMA_VERSION,
    contractSchemaVersion: DEPLOYMENT_LADDER_SCHEMA_VERSION,
    state: stage === null ? "inactive" : stage === "free" ? "rehearsal-complete" : "rehearsing",
    rehearsalMaturity: DEPLOYMENT_LADDER_MATURITY,
    sessionId: stage === null ? null : "ladder-session-1",
    referenceRigId: stage === null ? null : "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
    modelId: stage === null ? null : "model-1",
    contractHash: stage === null ? null : "11".repeat(32),
    lockfileHash: stage === null ? null : "22".repeat(32),
    policyArtifactId: stage === null ? null : "policy-1",
    supervisorJobId: stage === null ? null : "supervisor-1",
    currentStage: stage,
    nextStage: stage === null ? "sitl" : STAGE_ORDER[index + 1] ?? null,
    acknowledgedStages: stage === null ? [] : STAGE_ORDER.slice(0, index + 1),
    stageOrder: [...STAGE_ORDER],
    physicalConfirmationStages: ["hitl", "constrained", "free"],
    transitionCount: Math.max(0, index),
    policyRateHz: DEPLOYMENT_LADDER_POLICY_RATE_HZ,
    supervisorRateHz: DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ,
    firmwareRateLoopUntouched: true,
    missedInferenceFallback: DEPLOYMENT_LADDER_FALLBACK,
    policyAdvisory: true,
    supervisorAuthority: true,
    noAutoArm: true,
    clientEvidenceBound: stage !== null,
    deploymentEvidenceVerified: false,
    physicalConfirmationEvidenceVerified: false,
    hardwareExecutionAuthorized: false,
    deviceIdentityVerified: false,
    fieldSessionVerified: false,
    externalBetaEnabled: false,
  };
}

function startRequest(): DeploymentLadderStartRequest {
  return {
    sessionId: "ladder-session-1",
    referenceRigId: "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
    modelId: "model-1",
    contractHash: "11".repeat(32),
    lockfileHash: "22".repeat(32),
    policyArtifactId: "policy-1",
    policyExportGate: "exportable",
    supervisorJobId: "supervisor-1",
    supervisorDecision: "policy-advisory",
    supervisorAllowPolicy: true,
    policyRateHz: DEPLOYMENT_LADDER_POLICY_RATE_HZ,
    supervisorRateHz: DEPLOYMENT_LADDER_SUPERVISOR_RATE_HZ,
    firmwareRateLoopUntouched: true,
    missedInferenceFallback: DEPLOYMENT_LADDER_FALLBACK,
    physicalConfirmation: DEPLOYMENT_LADDER_START_CONFIRMATION,
  };
}

test("invokes the exact shell-owned rehearsal commands without hardware authority", async () => {
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const responses: Record<string, unknown> = {
    deployment_ladder_status: statusFixture(null),
    start_deployment_ladder: statusFixture("sitl"),
    advance_deployment_ladder: statusFixture("hitl"),
    reset_deployment_ladder: statusFixture(null),
  };
  const runtime: DesktopDeploymentLadderRuntime = {
    available: () => true,
    invoke: async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return responses[command] as T;
    },
  };

  assert.equal((await getDeploymentLadderStatus(runtime)).state, "inactive");
  const sitl = await startDeploymentLadder(startRequest(), runtime);
  const hitl = await advanceDeploymentLadder(sitl, {
    sessionId: sitl.sessionId!,
    fromStage: "sitl",
    toStage: "hitl",
    physicalConfirmation: confirmationForStage("hitl"),
  }, runtime);
  assert.equal(hitl.currentStage, "hitl");
  assert.equal(hitl.hardwareExecutionAuthorized, false);
  assert.equal((await resetDeploymentLadder(hitl, runtime)).state, "inactive");
  assert.deepEqual(calls, [
    { command: "deployment_ladder_status", args: undefined },
    { command: "start_deployment_ladder", args: { request: startRequest() } },
    {
      command: "advance_deployment_ladder",
      args: {
        request: {
          sessionId: "ladder-session-1",
          fromStage: "sitl",
          toStage: "hitl",
          physicalConfirmation: confirmationForStage("hitl"),
        },
      },
    },
    {
      command: "reset_deployment_ladder",
      args: {
        request: {
          sessionId: "ladder-session-1",
          physicalConfirmation: DEPLOYMENT_LADDER_END_CONFIRMATION,
        },
      },
    },
  ]);
});

test("strict status parsing refuses stage, rate, field, and authority drift", () => {
  assert.equal(parseDeploymentLadderStatus(statusFixture("constrained")).currentStage, "constrained");

  const promoted = { ...statusFixture("sitl"), hardwareExecutionAuthorized: true };
  assert.throws(() => parseDeploymentLadderStatus(promoted), /promotes unsupported authority/);

  const skipped = { ...statusFixture("free"), acknowledgedStages: ["sitl", "free"] };
  assert.throws(() => parseDeploymentLadderStatus(skipped), /contiguous prefix/);

  const rateDrift = { ...statusFixture("sitl"), supervisorRateHz: 199 };
  assert.throws(() => parseDeploymentLadderStatus(rateDrift), /D9/);

  const extra = { ...statusFixture(null), hardwareArmed: false };
  assert.throws(() => parseDeploymentLadderStatus(extra), /fields have drifted/);

  const inactiveIdentity = { ...statusFixture(null), modelId: "model-1" };
  assert.throws(() => parseDeploymentLadderStatus(inactiveIdentity), /contains rehearsal identity/);
});

test("client refuses browser use, held evidence, skips, and confirmation substitution", async () => {
  const browser: DesktopDeploymentLadderRuntime = {
    available: () => false,
    invoke: async <T>() => statusFixture(null) as T,
  };
  await assert.rejects(() => getDeploymentLadderStatus(browser), /require FORGE Desktop/);

  const runtime: DesktopDeploymentLadderRuntime = {
    available: () => true,
    invoke: async <T>() => statusFixture("sitl") as T,
  };
  const held = { ...startRequest(), policyExportGate: "held" } as unknown as DeploymentLadderStartRequest;
  await assert.rejects(() => startDeploymentLadder(held, runtime), /outside the D9\/D12/);

  const sitl = statusFixture("sitl");
  await assert.rejects(
    () => advanceDeploymentLadder(sitl, {
      sessionId: "ladder-session-1",
      fromStage: "sitl",
      toStage: "constrained",
      physicalConfirmation: confirmationForStage("constrained"),
    }, runtime),
    /exact next stage/,
  );
  await assert.rejects(
    () => advanceDeploymentLadder(sitl, {
      sessionId: "ladder-session-1",
      fromStage: "sitl",
      toStage: "hitl",
      physicalConfirmation: "continue",
    }, runtime),
    /physical confirmation/,
  );
  assert.throws(() => nextDeploymentStage("free"), /final deployment-ladder stage/);
});

test("passing supervisor evidence is exact and D9-bound", () => {
  const passing = {
    artifactKind: "supervisor-decision",
    allowPolicy: true,
    command: "policy-advisory",
    rateHz: { policyAdvisory: 50, supervisor: 200 },
    reasons: [],
  };
  assert.equal(isPassingSupervisorDecision(passing), true);
  assert.equal(isPassingSupervisorDecision({ ...passing, allowPolicy: false }), false);
  assert.equal(isPassingSupervisorDecision({ ...passing, rateHz: { policyAdvisory: 50, supervisor: 199 } }), false);
  assert.equal(isPassingSupervisorDecision({ ...passing, deviceVerified: true }), false);
});
