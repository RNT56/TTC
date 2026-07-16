# Hardware Bridge, Recorder, FORGE Desktop & the Deployment Ladder — implementation doc

**Status:** deterministic bridge jobs live; D48 native serial transport is implemented at local integration maturity; D30 accepted controlled D12 lab pilots; target handshake/readback, capture, and lab/field evidence remain gated · **Phases:** P8 · **Home:**
studio bridge logic (TS) + worker jobs + `packages/desktop` (Tauri scaffold) + FORGE Link image plan ·
**Plan refs:** §11, §15, §5.6 (v3.0) · **Decisions:** D9, D12, D15

## 1. Purpose

The crossing from rehearsal to reality: configure real flight controllers from the
contract, ingest telemetry, replay reality against the twin (**ghost**), fit reality
back into the contract (**system ID**), and walk policies up a **deployment ladder
that is never skipped**. This converts the bridge from a deployment feature into the
data flywheel's heaviest gear. P8 also ships **FORGE Desktop** (D15) — the bridge's
power surface.

**Entry gate:** ToS/liability legal review for controlled D12 lab pilots is
accepted by D30 ([`security-safety-legal.md`](../security-safety-legal.md) §3).
The implementation gate remains explicit: `d28.hardware` must be accepted in
`platform_gate_signoffs`, deployment must set hardware lab mode envs, the provider
must be local, the request must target one of the D12 reference rigs, and physical
confirmation is required before any non-fixture hardware-touching job or Desktop
native command can progress. External beta or non-D12 rigs require a later rollout
gate.

## 2. Browser-native surfaces (Chromium floor)

- **WebSerial FC configuration** in the Betaflight-configurator pattern — the
  canonical proof that our early adopters already flash firmware from a browser
  tab — read/write the firmware config diffs the contract compiles (P8-001).
- **Telemetry ingest** over WebSerial/WebUSB into the recorder (P8-002).
- Non-Chromium browsers get the viewer and the files — stated, not discovered (D15).

Live 2026-06-14: `bridge.config-diff`, `bridge.telemetry-ingest`, and
`bridge.supervisor-check` are executable worker jobs and Studio launch buttons. They
compile FC diffs, normalize telemetry into replay tapes, and apply fail-closed
supervisor checks. D30 accepts the legal/hardware gate for controlled D12 lab
pilots only; browser serial writes and real device capture now await the lab
adapter plus the runtime gates. The gateway rejects non-fixture live bridge jobs
unless D30's `d28.hardware` signoff is active, `FORGE_HARDWARE_LAB_MODE=1`, the
provider is local, and the reference rig is one of the pinned D12 quad/rover IDs.

QA-007 hardens the deterministic worker boundary before any adapter exists: all JSON
is byte/depth/node bounded;
telemetry is finite, unique, and normalized by timestamp; supervisor vectors are
exact finite 3-vectors and safety thresholds are finite and physically positive.
Malformed input fails rather than defaulting to an apparently safe state. None of
this bypasses physical confirmation or enables a hardware write.

D48 replaces the old generic safe-token config compiler with
`forge-bridge-config/1.0.0`. After the queue strips its framework-owned `timeoutS`,
the v1 producer accepts exactly the `firmware`, `mixer`, and `rates` fields and
scopes them to the D12 `quadx` reference quad,
but the writable artifact contains only the reviewed Betaflight 2025.12
`failsafe_delay` setting (integer 2–200 deciseconds) and final `save`. It carries the
exact firmware/version, physical-confirmation and no-auto-arm flags, ordered lines,
and SHA-256 of the canonical line array. ArduPilot, ROS 2, mixer/mode changes,
arbitrary CLI settings, and raw caller-authored diffs are not accepted by v1.

## 3. FORGE Desktop (Tauri, ships P8 — D15)

Not a contingency: a scheduled product surface that arrives when it has a real job.
**Desktop v1 = the same web bundle in a webview + native plugins:**

| Plugin | Job |
|---|---|
| serial (serialport-rs) | raw serial on every OS, past every browser limit (P8-012) |
| filesystem | big log archives on a real filesystem instead of OPFS (P8-013) |
| background recorder | field telemetry capture with the laptop lid closed (P8-013) |

Live 2026-07-16: `@forge/desktop` wraps the Studio bundle and integrates
`serialport-rs` for OS port enumeration, opening, exact writes, and flush. The native
consumer independently rejects schema, artifact kind, firmware/version, command,
range, order, hash, confirmation, no-auto-arm, rig, baud, and unenumerated-path
substitution. It accepts only the D12 reference quad, the hardware-enable,
D30-signoff, and lab-mode env gates, the exact physical-confirmation phrase, and
115200 baud. A real Unix
pseudo-terminal integration test proves the exact artifact bytes cross the native
transport. The versioned receipt records bytes transmitted while explicitly setting
`targetFirmwareVersionVerified=false`, `applicationVerified=false`, and
`operatorReadbackRequired=true`; it is not flight-controller, HITL, or lab proof.
The recorder command separately initializes a real filesystem archive manifest under
the same fail-closed lab boundary.

P8-012 is complete at deterministic/native transport integration maturity. Target
firmware handshake and post-write readback belong to the real D12 lab adapter and
must precede any applied-configuration claim. Browser WebSerial write/capture, live
sidecar telemetry capture, build/signing, and updater delivery remain open; real
bench/field evidence is still P8-001/P8-009/P8-010/P8-014/EXT-004. A native-core
fast path inside the shell (bypassing WASM) is available
later if profiling asks — not v1 scope. Desktop exit proof: **a field log captured
by Desktop replays with visible ghost divergence** (P8-014). Studio can scrub
fixture crash-window/ghost metadata; live Desktop field-log capture and replay
evidence remain the open hardware proof.

## 4. The flight recorder & ghost protocol (P8-003/004)

Every real session logs into the **same replay format** as sim sessions:
`{contract hash + lockfile, env, telemetry tape}`. The studio replays reality with
the twin's prediction overlaid — the **ghost** — making divergence visible second by
second; crash forensics becomes scrubbing the last three seconds and watching where
the ghost separated. Budget: 60 fps scrubbing over a 10-min log (indexed tape,
decimated overlay geometry). Logs feed two pipelines: the system-ID fitter and the
curriculum-from-reality path (BC/offline RL). **Telemetry logs are the user's**;
sharing is per-log explicit.

D45 narrows the training handoff. Offline training requires a separate active
`training.reuse` grant for the exact owned log; sharing consent never implies reuse.
The gateway selects the stored tape and admitted model revision, and withdrawal
cancels queued/running `train.policy` and `train.offline-bc` work that names that log.
Only a future P8 recorder that can attest the exact policy observation tensor plus
reviewed or supervisor-approved normalized actions may declare `recorded-device`
maturity. The current P7-009 worker rejects that maturity rather than trusting a
client label. Its smoke uses `controlled-synthetic` pairs, so it does not close
P8-002, P8-003, a D12 lab run, or any field evidence. PR #77/protected `2c7562d`
closes only the source-bound controlled-synthetic P7-009 seam; retained artifact
`8359446894` does not upgrade this hardware boundary.

## 5. System identification (P8-005)

Bench thrust pulls, logged flights, joint step responses → fitting job
(`train.sysid-fit`) → updated sim block (true Kv under load, R_int, motor time
constants, friction) → policy fine-tunes against the corrected twin. **A guided
ritual, not an expert chore** — the ghost makes the residual gap visible.

Live 2026-06-14: the fixture `train.sysid-fit` path estimates battery internal
resistance from telemetry samples and emits a JSON-Patch proposal for the sim block.

## 6. FORGE Link (P8-006; XC-19)

Flashable companion-computer image (Pi-class): rosbridge + MAVLink router + ONNX/
TFLite runtime + **pairing-code auth**. Makes the ladder turnkey where a companion
computer is required (ROS 2 graphs, MAVLink routing, onboard policy install).

Live 2026-06-14: the checked manifest at
`packages/desktop/forge-link/manifest.json` pins the required services, ports,
pairing-code TTL, no-auto-arm policy, and policy/supervisor rate contract. The
actual image build remains open.

## 7. The deployment ladder (product-enforced, never skipped)

1. **SITL** — policy flies the twin under full randomization; scorecard must pass.
2. **HITL** — real FC/microcontroller in the loop over serial; validates timing and
   interfaces.
3. **Constrained reality** — tethered hover / wheels-off-ground / harness walking
   with the **safety supervisor** active.
4. **Free operation** within declared envelopes.

Every transition is a **deliberate physical-confirmation interaction**. The bridge
never auto-arms anything.

Live 2026-06-14: `packages/desktop/deployment-ladder.json` is the executable ladder
contract used by package checks. It freezes the SITL → HITL → constrained → free
stage order and requires physical confirmation for all hardware-touching stages.

**Control-rate contract (D9), stated in the UX:** policy advises at ~50 Hz; the
supervisor runs at ≥ 200 Hz; the FC rate loop is never touched; a missed inference
tick degrades to the fallback **by design**.

**Safety supervisor (P8-008):** geofence, attitude and rate envelopes, battery
floor, hardware kill switch, and a fallback controller (manual or position-hold)
that owns the air gap. The policy is an *advisor* the supervisor can veto.

Live 2026-06-14: supervisor decisions are deterministic in Rust and worker code,
including explicit policy-advisory and supervisor loop rates. The hardware loop is
not enabled by this implementation.

## 8. Deployment targets & honesty (plan §11.4)

Multirotor policies run on companion computers speaking MAVLink offboard to
ArduPilot/PX4-class stacks — never on rate-loop firmware. Rovers/arms via ROS 2
(URDF + ros2_control) or direct microcontrollers. Legged via vendor SDKs —
late-phase, experimental, behind the harness-walking gate. We promise a rigorous
rehearsal space and a supervised path onto hardware the user owns; **we do not
promise any policy is safe in the open world — and the UX says so at every gate.**

## 9. Pilots (P8-009/010; D12)

Both reference rigs: the quad walks SITL → HITL → tethered, documented as the
tutorial; the rover deploys via the ROS 2 path. These rigs are the standing
sim-to-real test fixtures.

Live 2026-06-14: the executable dry-run playbooks are
[`reference-quad-pilot.md`](../pilots/reference-quad-pilot.md) and
[`reference-rover-pilot.md`](../pilots/reference-rover-pilot.md). `pnpm pilot:check`
asserts that the playbooks stay tied to the D12 rig IDs, D30, no-auto-arm policy,
SITL/HITL/constrained ladder order, telemetry/replay evidence, and the checked
Desktop deployment ladder. Real HITL, tethered hover, constrained driving, and free
operation now require the D12 lab adapter, lab-mode envs, physical confirmation,
and captured evidence under D30's controlled-lab scope.

## 10. Dependencies

`forge-sim` (replay format, twin), `workers/training` (sysid, fine-tune), firmware
config compiler (from the contract's propulsion block), studio bridge tab, Tauri +
plugin crates (serialport-rs).

## 11. Testing

Native package checks plus Rust tests must cover D30/D12/no-auto-arm/confirmation,
artifact schema/version/command/range/hash refusal, unenumerated port refusal, and
exact serial bytes over a real pseudo-terminal. The minimum implementation gate is
`pnpm --filter @forge/desktop test`, locked Desktop Cargo fmt/Clippy/tests, Python
3.12 hardware-boundary tests, and `pnpm verify:desktop-native`; a real-device claim
additionally requires target-version handshake, post-write readback, and signed lab
evidence. HITL harness against the reference FC (timing/interface validation); recorder
round-trip (log → replay → ghost render — bit-exact under D17); sysid fit on
synthetic telemetry with known ground truth (fit must recover injected constants);
supervisor unit tests (envelope breach → fallback within deadline); pairing-auth
tests; Desktop plugin integration tests on all three OSes; gateway/Desktop gate tests
for D30/D28 fail-closed behavior, D12 lab-only behavior, physical confirmation, and
"never auto-arm". The registered QA-007 hardware corpus adds fourteen accepted and
refused payloads for unreviewed config authority, unsafe failsafe bounds,
finite/duplicate telemetry, vector arity, geofence bounds, kill-switch typing, and
advisory/hold outcomes.

## 12. Open questions

Tauri updater/signing strategy per OS (decide at P8-011); exact telemetry tape codec
(must support indexing for 60 fps scrub); whether the background recorder is a Tauri
sidecar process or in-shell thread; FORGE Link build tooling (pi-gen assumed
*(proposed)*).
