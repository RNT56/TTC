# Reference Rover Pilot Playbook

**Rig:** `ref_rover_waveshare-ugv-rover-pt-pi5-ros2`
**TODO:** P8-010
**Status:** documented dry-run path. D30 accepts controlled D12 lab pilots, but live
ROS 2 deployment, serial/device writes, and constrained driving still require the
lab adapter, lab-mode envs, D12 rig confirmation, physical confirmation, and
evidence capture.

This playbook is the executable tutorial contract for the D12 Pi-class ROS 2
rover. It follows the same deployment ladder as the quad, but the constrained
reality step is wheels-off-ground or a physically bounded course instead of
tethered hover.

## Required Inputs

- Reference rig: `catalog/reference-rigs/ref_rover_waveshare-ugv-rover-pt-pi5-ros2.json`.
- Admitted rover model with the Waveshare UGV Rover PT PI5 ROS2 Kit component ref.
- Passing `train.policy` scorecard for line-follow, velocity tracking, or obstacle
  course.
- `ros2_control` export and bridge config-diff artifact.
- `packages/desktop/deployment-ladder.json` with `noAutoArm: true`.
- Supervisor config covering speed envelope, geofence, battery floor, fallback
  stop, and hardware kill switch.
- Telemetry consent record before any real capture.
- Replay verification output for every recorded tape.

## Stage 0 - Local Dry Run

Run this before any pilot attempt:

```bash
pnpm db:migrate
pnpm db:seed-catalog
pnpm db:assert-p3
pnpm -r test
node scripts/validate-all.mjs
pnpm --dir packages/desktop check
pnpm pilot:check
```

Expected result: catalog rows resolve, the ROS 2 reference rig row is present, the
Desktop bridge remains no-auto-arm, and this playbook still names the D30
controlled-lab gate.

## Stage 1 - SITL

1. Generate or open the admitted reference rover model.
2. Export URDF with the `ros2_control` sidecar.
3. Run `train.policy` with a line-follow or obstacle-course task.
4. Play the policy in Studio and run replay verification.

Acceptance:

- Scorecard is exportable and estimator-smoke passed.
- Drive playback completes without validator errors.
- Replay verification reports a matching contract hash and timestamp order.
- No deployment-ladder stage past SITL is unlocked by software alone.

## Stage 2 - HITL

D30 lab-gated. This stage connects the rover controller or Pi-class companion
computer in bench mode with wheels off the ground only after the runtime gates
pass.

Evidence required before passing:

- ROS 2 graph, topic names, and command rates match the exported contract.
- Config diff is reviewed before any write.
- Supervisor stop command is confirmed before policy advice is accepted.
- Hardware confirmation is recorded by an operator.
- Any missed inference tick falls back to stop or manual control.

## Stage 3 - Constrained Reality

D30 lab-gated. This stage uses the Waveshare UGV Rover PT PI5 ROS2 Kit inside a
bounded course or with wheels lifted for interface checks only after the runtime
gates pass.

Evidence required before passing:

- Physical boundary and observer are present.
- Geofence and speed envelope are active.
- Supervisor vetoes at least one scripted envelope breach in a dry-run.
- Telemetry is captured and replays with a visible ghost overlay.
- Post-run system-ID proposes either no change or a reviewable sim patch.

## Stop Conditions

- Any validator error, unresolved component ref, or non-exportable scorecard.
- Battery floor, geofence, speed, or kill-switch supervisor breach.
- Lost telemetry, unordered replay tape, or hash mismatch.
- Any software path attempts to auto-arm or skip physical confirmation.

## Evidence Package

- Contract id, revision, lockfile, and validator report.
- BOM export with SKUs and review/license status.
- Scorecard JSON and ONNX header.
- Deployment ladder stage log.
- Telemetry tape, replay verification, ghost-divergence summary, and sysid patch.
