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
  2025.12. D49 keeps this artifact unchanged. Before any write, remove propellers and
  use the protected Desktop protocol to require one stable numeric `2025.12.x`
  identity. Success additionally requires exact set/save acknowledgement,
  reboot/reconnect to the same OS path, the same reported firmware-identity hash, and
  one matching `get failsafe_delay` value. Historical receipt 1.0.0 proves bytes only;
  current receipt 2.0.0 is acceptable protocol evidence only when every verification
  field and hash resolves. Neither receipt is physical-device, lab, HITL, or field
  proof by itself.
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
pnpm --filter @forge/desktop test
pnpm verify:desktop-native
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

D30 lab-gated. This stage connects the Holybro Kakute H7 V1.5 in bench mode over
serial with props removed only after the runtime gates pass.

Evidence required before passing:

- Config diff compiled from the contract and reviewed before write.
- Before capture, D55's read-only MSP probe returns two byte-stable observations on
  the same open port for protocol 0/API 1.47, `BTFL`, stable `2025.12.x`, target
  `KAKUTEH7`, and one UID hash. This is a prerequisite observation only: it is not
  cryptographic device attestation, recorder custody, or lab/field provenance.
- Before any recorder-bound custody run, the acceptance owner issues one short-lived
  D56 authorization from the private retained lab pack. It must bind the exact
  protected revision, evidence/signoff hashes, artifact/contract/lockfile, expected
  D55 identity/UID, and both OS serial descriptor hashes under the configured
  purpose-limited public trust bundle. Fixture keys or an unsigned manifest do not
  satisfy this step. Protected D56 implements the mechanism through PR #100/`1bf127d`,
  but no current run may claim custody until this real-authority step passes.
- After a clean recorder stop and with props removed again, repeat the complete D55
  observation. Only exact signed/pre/post continuity plus the canonical v1 receipt
  may create the separate custody proof outside the five-file archive. A failure
  preserves the valid archive and records custody as failed; it never promotes D54,
  recorded-device, field, sharing, or training authority.
- Private raw pre/post `version`, set/save, and `get failsafe_delay` responses resolve
  byte-for-byte to the four response hashes in one
  `forge-bridge-serial-receipt/2.0.0`; the full patch version,
  expected readback value, same-path reconnect, and CLI-arming-disabled state match.
- A deliberately interrupted/reconnect/power-loss rehearsal produces no success
  receipt, keeps the rig disarmed, and retains its stopped/failed record rather than
  being retried into a pass.
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
- Wrong/ambiguous firmware identity, missing/duplicate set/save acknowledgement,
  reconnect failure, identity drift, readback mismatch, or any receipt-v1 attempt to
  claim application verification.
- Any software path attempts to auto-arm or skip physical confirmation.

## Evidence Package

- Contract id, revision, lockfile, and validator report.
- BOM export with SKUs and review/license status.
- Scorecard JSON and ONNX header.
- Deployment ladder stage log.
- D49 receipt 2.0.0 plus private content-addressed raw CLI responses and the retained
  failure/reconnect/power-loss record; do not place raw device output in Git.
- Telemetry tape, replay verification, ghost-divergence summary, and sysid patch.
