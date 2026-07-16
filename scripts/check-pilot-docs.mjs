#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  const full = join(root, path);
  assert(existsSync(full), `missing ${path}`);
  return readFileSync(full, "utf8");
}

const requiredDocs = [
  {
    path: "docs/pilots/reference-quad-pilot.md",
    terms: [
      "ref_quad_kakute-h7-source-one-5in",
      "P8-009",
      "D30",
      "no-auto-arm",
      "SITL",
      "HITL",
      "tethered",
      "supervisor",
      "telemetry",
      "replay verification",
      "ghost",
      "sysid",
      "rehearsal",
    ],
  },
  {
    path: "docs/pilots/reference-rover-pilot.md",
    terms: [
      "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
      "P8-010",
      "D30",
      "no-auto-arm",
      "ROS 2",
      "SITL",
      "HITL",
      "constrained",
      "supervisor",
      "telemetry",
      "replay verification",
      "ghost",
      "sysid",
      "rehearsal",
    ],
  },
];

for (const doc of requiredDocs) {
  const body = read(doc.path);
  for (const term of doc.terms) {
    assert(body.includes(term), `${doc.path} missing required term: ${term}`);
  }
}

const ladder = JSON.parse(read("packages/desktop/deployment-ladder.json"));
assert(ladder.schemaVersion === "forge-deployment-ladder/1.0.0", "deployment ladder schema version mismatch");
assert(ladder.controlSchemaVersion === "forge-deployment-ladder-control/1.0.0", "deployment ladder control schema version mismatch");
assert(ladder.mode === "rehearsal-only", "deployment ladder must remain rehearsal-only");
assert(ladder.noAutoArm === true, "deployment ladder must stay no-auto-arm");
assert(ladder.liveHardwareGate?.decision === "D30", "deployment ladder must name D30");
assert(ladder.liveHardwareGate?.scope === "controlled D12 lab pilots only", "deployment ladder must stay scoped to D12 lab pilots");
assert(ladder.liveHardwareGate?.externalBetaEnabled === false, "deployment ladder must not enable external hardware beta");
assert(
  ladder.stages?.map((stage) => stage.id).join(">") === "sitl>hitl>constrained>free",
  "deployment ladder stage order must stay SITL > HITL > constrained > free",
);
assert(
  ladder.stages?.filter((stage) => stage.id !== "sitl").every((stage) => stage.physicalConfirmation === true),
  "all hardware-touching ladder stages must require physical confirmation",
);
assert(
  ladder.stages?.filter((stage) => stage.id !== "sitl").every((stage) => stage.transitionConfirmation?.startsWith("I physically confirm")),
  "all hardware-touching ladder stages must define exact physical-confirmation interactions",
);
assert(ladder.authority?.policyAdvisory === true, "deployment policy must stay advisory");
assert(ladder.authority?.supervisorAuthority === true, "deployment ladder must retain supervisor authority");
assert(ladder.authority?.noAutoArm === true, "deployment ladder authority must stay no-auto-arm");
assert(ladder.authority?.hardwareExecutionAuthorized === false, "deployment ladder must not authorize hardware execution");
assert(ladder.authority?.deploymentEvidenceVerified === false, "deployment ladder must not fabricate deployment evidence");
assert(ladder.authority?.physicalConfirmationEvidenceVerified === false, "deployment ladder must not fabricate physical-confirmation evidence");

const quadRig = JSON.parse(read("catalog/reference-rigs/ref_quad_kakute-h7-source-one-5in.json"));
const roverRig = JSON.parse(read("catalog/reference-rigs/ref_rover_waveshare-ugv-rover-pt-pi5-ros2.json"));
assert(quadRig.class === "multirotor", "reference quad rig class mismatch");
assert(roverRig.class === "rover", "reference rover rig class mismatch");
assert(
  quadRig.items?.some((item) => item.componentId === "cmp_fc_holybro-kakute-h7-v15"),
  "reference quad must include the Kakute H7 flight controller",
);
assert(
  roverRig.items?.some((item) => item.componentId === "cmp_rover_waveshare-ugv-rover-pt-pi5-ros2"),
  "reference rover must include the Waveshare ROS 2 kit",
);

console.log("pilot-docs: reference quad and rover playbooks are present, D30 lab-gated, and ladder-aligned");
