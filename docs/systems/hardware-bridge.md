# Hardware Bridge, Recorder & Deployment Ladder — implementation doc

**Status:** not started · **Phases:** P8 (entry-gated by legal review) · **Home:**
`packages/link` + studio bridge tab *(proposed)* · **Plan refs:** §11, §15 ·
**Decisions:** D9, D11, D12

## 1. Purpose

The crossing from rehearsal to reality: configure real flight controllers from the
contract, ingest telemetry, replay reality against the twin (**ghost**), fit reality
back into the contract (**system ID**), and walk policies up a **deployment ladder
that is never skipped**. This converts the bridge from a deployment feature into the
data flywheel's heaviest gear.

**Hard entry gate:** ToS/liability legal review (ladder UX, supervisor disclaimers,
telemetry consent) before any deployment feature ships
([`security-safety-legal.md`](../security-safety-legal.md) §3).

## 2. Browser-native surfaces (Chromium-only, D11)

- **WebSerial FC configuration** in the Betaflight-configurator pattern: read/write
  the firmware config diffs the contract compiles (P8-001).
- **Telemetry ingest** over WebSerial/WebUSB into the recorder (P8-002).
- Non-Chromium users get the viewer and the files — stated, not discovered.

## 3. The flight recorder & ghost protocol (P8-003/004)

Every real session logs into the **same replay format** as sim sessions:
`{contract hash + lockfile, env, telemetry tape}`. The studio replays reality with
the twin's prediction overlaid — the **ghost** — making divergence visible second by
second; crash forensics becomes scrubbing the last three seconds and watching where
the ghost separated. Budget: 60 fps scrubbing over a 10-min log (indexed tape,
decimated overlay geometry). Logs feed two pipelines: the system-ID fitter and the
curriculum-from-reality path (BC/offline RL). **Telemetry logs are the user's**;
sharing is per-log explicit.

## 4. System identification (P8-005)

Bench thrust pulls, logged flights, joint step responses → fitting job
(`train.sysid-fit`) → updated sim block (true Kv under load, R_int, motor time
constants, friction) → policy fine-tunes against the corrected twin. **A guided
ritual, not an expert chore** — the ghost makes the residual gap visible.

## 5. FORGE Link (P8-006; XC-19)

Flashable companion-computer image (Pi-class): rosbridge + MAVLink router + ONNX/
TFLite runtime + **pairing-code auth**. Makes the ladder turnkey where the browser
cannot reach (ROS 2 graphs, MAVLink routing, onboard policy install). Minimal
fallback: a single-binary daemon.

## 6. The deployment ladder (product-enforced, never skipped)

1. **SITL** — policy flies the twin under full randomization; scorecard must pass.
2. **HITL** — real FC/microcontroller in the loop over serial; validates timing and
   interfaces.
3. **Constrained reality** — tethered hover / wheels-off-ground / harness walking
   with the **safety supervisor** active.
4. **Free operation** within declared envelopes.

Every transition is a **deliberate physical-confirmation interaction**. The bridge
never auto-arms anything.

**Control-rate contract (D9), stated in the UX:** policy advises at ~50 Hz; the
supervisor runs at ≥ 200 Hz; the FC rate loop is never touched; a missed inference
tick degrades to the fallback **by design**.

**Safety supervisor (P8-008):** geofence, attitude and rate envelopes, battery
floor, hardware kill switch, and a fallback controller (manual or position-hold)
that owns the air gap. The policy is an *advisor* the supervisor can veto.

## 7. Deployment targets & honesty (plan §11.4)

Multirotor policies run on companion computers speaking MAVLink offboard to
ArduPilot/PX4-class stacks — never on rate-loop firmware. Rovers/arms via ROS 2
(URDF + ros2_control) or direct microcontroller for simple drives. Legged via vendor
SDKs — late-phase, experimental, behind the harness-walking gate. We promise a
rigorous rehearsal space and a supervised path onto hardware the user owns; **we do
not promise any policy is safe in the open world — and the UX says so at every
gate.**

## 8. Pilots (P8-009/010)

Both reference rigs (D12): the quad walks SITL → HITL → tethered, documented as the
tutorial; the rover deploys via the ROS 2 path. These rigs are the standing
sim-to-real test fixtures.

## 9. Dependencies

`engines/sim` (replay format, twin), `workers/training` (sysid, fine-tune),
firmware config compiler (from the contract's propulsion block), studio bridge tab.

## 10. Testing

HITL harness against the reference FC (timing/interface validation); recorder
round-trip (log → replay → ghost render); sysid fit on synthetic telemetry with
known ground truth (fit must recover injected constants); supervisor unit tests
(envelope breach → fallback within deadline); pairing-auth tests; "never auto-arm"
asserted in code review + integration test.

## 11. Open questions

FORGE Link build tooling (pi-gen vs Nix image *(proposed: pi-gen first)*); Tauri tray
app only if a GUI earns its keep; exact telemetry tape codec (decide with recorder
implementation; must support indexing for 60 fps scrub).
