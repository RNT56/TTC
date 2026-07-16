# Reference Quad Pilot Playbook

**Rig:** `ref_quad_kakute-h7-source-one-5in`
**TODO:** P8-009
**Status:** documented dry-run path. D30 accepts controlled D12 lab pilots, but live
HITL, tethered hover, serial writes, and free operation still require the lab
adapter, lab-mode envs, D12 rig confirmation, physical confirmation, and evidence
capture.

This playbook is the executable tutorial contract for the D12 reference quad. It is
intended to keep the SITL -> HITL -> tethered path repeatable before hardware is
enabled. It does not grant hardware authority: the product must stay no-auto-arm,
the policy remains advisory, and the safety supervisor owns every transition.

## Required Inputs

- Reference rig: `catalog/reference-rigs/ref_quad_kakute-h7-source-one-5in.json`.
- D48 serial artifact: `forge-bridge-config/1.0.0`, reviewed against Betaflight
  2025.12. Before any write, remove propellers, independently read the connected
  target version, and stop unless it exactly matches 2025.12. After transmission,
  read back `failsafe_delay` and retain the response; the Desktop receipt alone says
  only that bytes were transmitted and deliberately leaves target version and
  application unverified.
- Admitted multirotor model with the D12 component refs pinned in the lockfile.
- Passing `train.policy` scorecard for a hover or waypoint task.
- Exportable ONNX header or deterministic fixture policy metadata.
- `packages/desktop/deployment-ladder.json` with `noAutoArm: true`.
- Supervisor config covering geofence, attitude/rate limits, battery floor,
  fallback controller, and hardware kill switch.
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

Expected result: catalog rows resolve, the reference rig lockfile pins are stable,
the Desktop bridge remains no-auto-arm, and this playbook still names the D30
controlled-lab gate.

## Stage 1 - SITL

1. Generate or open the admitted reference quad model.
2. Run `train.policy` with `taskId: "hover-hold"` or a waypoint task.
3. Start policy playback in Studio and keep the supervisor HUD visible.
4. Run replay verification against the emitted tape.

Acceptance:

- Scorecard is exportable and estimator-smoke passed.
- Hover or waypoint playback completes without validator errors.
- Replay verification reports a matching contract hash and timestamp order.
- No deployment-ladder stage past SITL is unlocked by software alone.

## Stage 2 - HITL

D30 lab-gated. This stage connects the Holybro Kakute H7 v2 in bench mode over
serial with props removed only after the runtime gates pass.

Evidence required before passing:

- Config diff compiled from the contract and reviewed before write.
- Timing report showing policy advice near 50 Hz and supervisor decisions at or
  above 200 Hz.
- Firmware rate loop remains untouched.
- Hardware confirmation is recorded by an operator.
- Any missed inference tick falls back to position-hold or manual control.

## Stage 3 - Tethered Hover

D30 lab-gated. This stage uses the D12 quad with the TBS Source One-class frame,
EMAX ECO II 2207 1900KV motors, Tekko32 ESC, cited 5-inch props, and CNHL Black 4S
1500mAh pack only after the runtime gates pass.

Evidence required before passing:

- Tether or equivalent physical restraint is installed and photographed.
- Observer and kill-switch operator are present.
- Supervisor vetoes at least one scripted envelope breach in a dry-run.
- Telemetry is captured and replays with a visible ghost overlay.
- Post-run system-ID proposes either no change or a reviewable sim patch.

## Stop Conditions

- Any validator error, unresolved component ref, or non-exportable scorecard.
- Battery floor, geofence, attitude/rate, or kill-switch supervisor breach.
- Lost telemetry, unordered replay tape, or hash mismatch.
- Any software path attempts to auto-arm or skip physical confirmation.

## Evidence Package

- Contract id, revision, lockfile, and validator report.
- BOM export with SKUs and review/license status.
- Scorecard JSON and ONNX header.
- Deployment ladder stage log.
- Telemetry tape, replay verification, ghost-divergence summary, and sysid patch.
