# Hardware Bridge, Recorder, FORGE Desktop & the Deployment Ladder — implementation doc

**Status:** deterministic bridge jobs live; D48 native serial transport is protected at deterministic integration maturity through PR #83/`fd26845`; D49 target handshake/save/readback is protected at local integration maturity through PR #85/`4647a10`; D50/P8-013 background recorder/archive is protected at local recorder-integration maturity through PR #87/`d8afe7f`; D51 streaming archive inspection and its Studio read-only import panel are protected at local archive-inspection maturity through PR #89/`b5418ac`; D52 versioned recorder status/start/stop is protected at local recorder-control maturity through PR #91/`a8120ab`; D53 private five-object materialization is protected at local private-object-integrity maturity through PR #93/`08d892f`; D30 accepted controlled D12 lab pilots; sovereign gateway archive admission, real-adapter/device capture, and lab/field evidence remain gated · **Phases:** P8 · **Home:**
studio bridge logic (TS) + worker jobs + `packages/desktop` (Tauri scaffold) + FORGE Link image plan ·
**Plan refs:** §11, §15, §5.6 (v3.0) · **Decisions:** D9, D12, D15, D30, D48, D49, D50, D51, D52, D53

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
transport. Historical `forge-bridge-serial-receipt/1.0.0` records only that
transport and never upgrades to application proof.

D49's protected local implementation keeps the D48 artifact unchanged and makes a
success receipt conditional on two bounded serial sessions. Before any config byte,
Desktop requires the props-removed confirmation, enters the CLI, queries `version`,
and accepts one stable numeric Betaflight `2025.12.x` identity with MSP API authority.
It then requires the exact `failsafe_delay set to N` and `# saving` acknowledgements,
waits for the same OS path to return after reboot, repeats and hash-compares the
reported firmware identity, and accepts exactly one matching `get failsafe_delay`
value. UTF-8/control-byte checks, 16 KiB response caps, three-second response bounds,
a two-second reboot settle, and a fifteen-second reconnect ceiling fail closed.
Only the complete path emits `forge-bridge-serial-receipt/2.0.0` with the full patch
version, pre/post identity hashes, digests of the four authoritative response byte streams,
normalized readback-line value/hash, target/application verification true,
operator-readback false, and the target still CLI-arming-disabled. Any ambiguity
after transmission returns no receipt and tells the operator to keep the rig disarmed
for manual inspection. A two-session real Unix pseudo-terminal fixture proves the
wire protocol and refusals; it does not identify a physical FC uniquely or prove a
real FC, lab, HITL, tethered, supervisor, or field run.

D50's protected P8-013 implementation replaces the manifest-only recorder stub with
one exclusive in-shell background capture thread. Start requires the same D30/D12
environment gates, exact per-log consent phrase, one OS-enumerated port at 115200
baud, a new non-existing archive path, lowercase contract/lockfile SHA-256 values,
and a bounded environment. The dedicated `forge-telemetry-frame/1.0.0` serial-JSONL
codec binds every finite object-shaped frame to the artifact ID, exact contiguous
sequence, and strictly increasing time; 64-KiB frame, depth/node, one-million-frame,
and aggregate 512-MiB caps fail closed. `forge-recorder-archive/1.0.0` retains canonical
append-only frames plus a sparse byte-offset index. Explicit stop drains buffered
input, rejects an empty or partial frame, flushes and syncs both files, finalizes one
replay 1.0.0 document, hashes frames/index/replay, and only then emits
`forge-recorder-receipt/1.0.0`. Invalid/interrupted archives have no completed replay
or success receipt, and existing paths are never overwritten. Manifest, replay, and
receipt bind exact capture-consent confirmation, user ownership, sharing/training
reuse false, no-auto-arm, `local-serial-integration`, and
`recordedDeviceAttested=false`; capture consent grants neither sharing nor training.
Real pseudo-terminal tests prove background capture, exact replay/index/hash output,
sequence-drift refusal, single-recorder exclusivity, and no overwrite. This is not
adapter/device identity, OS suspend, WebSerial/WebUSB, lab, field, ghost, system-ID,
or recorded-device training evidence.

PR #87 protects that local boundary at `d8afe7f`: exact head `5e668a1` passed PR CI
`29485412948`/security `29485412987`, reviewed tree `528a878` is byte-identical at
the squash, and post-merge CI `29486146093`/security `29486147436` pass. D51 below
protects read-only Studio archive inspection and D52 protects the control seam;
the reviewed adapter, named D12 device, suspend, lab, field, and recorded-device gates
remain separate.

D51 adds the first protected read side without changing archive v1. Desktop accepts
one absolute directory containing exactly the five canonical real regular files;
symlinks, special files, missing/extra names, aggregate oversize, unsupported majors,
unknown/non-canonical metadata, filename or authority drift, and non-canonical frames
or index entries fail closed. The verifier streams the tape and sparse index, rechecks
frame/state/time/count/duration bounds and every expected stride/final byte offset,
hashes the retained frame and index bytes, reconstructs the exact replay-v1 digest,
and compares it with both the retained replay and clean-stop receipt. It never loads
the 512-MiB tape or replay into the webview and never requires hardware-enable
authority because inspection is read-only.

Studio invokes only `inspect_recorder_archive` through exact Tauri API 2.11.1,
strictly validates `forge-recorder-inspection/1.0.0`, and renders bounded identity,
path, hash, count, duration, and nonclaim fields. It uploads or gateway-materializes
no frame. A passing result establishes local archive-v1 self-consistency only, not a
signature or independent authenticity proof, device identity, recorded-device or
field maturity, sharing/training consent, lab evidence, ghost, or system-ID result.
Fourteen native tests, sixteen Studio tests, the declared three-engine browser matrix,
and the complete 40-step local gate under Python 3.12.13 pass. PR #89 exact head
`dcaed0f` passed CI `29490845998`/security `29490846046`; reviewed tree `2d57349` is
byte-identical at protected `b5418ac`, whose post-merge CI `29491389298`/security
`29491389270` pass. This protects inspection self-consistency only.

D52 is protected at local recorder-control maturity and does not change any archive
v1 byte. Native `recorder_status` returns exact
`forge-recorder-control/1.0.0` state: inactive has no capture identity; recording and
finished retain the shell-owned artifact, path, D12 rig, admitted contract/lockfile
hashes, hashed source port, rate, start time, local-integration maturity, and explicit
private/no-training/no-device/no-field/no-auto-arm semantics. The recorder thread and
status survive webview reloads. A finished thread remains collectable through explicit
stop, which returns the unchanged persisted receipt v1 on success or the bounded
recorder error on failure; stop does not re-check the hardware-enable environment, so
an already-running capture can still be safely drained after configuration changes.

Studio strictly parses bridge status, at most 256 bounded OS-enumerated ports, control
status, and receipt fields. Its start button is available only in Desktop when the
bridge is enabled, the shell is inactive, a port is selected, per-log consent is
checked, and the current validator report is admitted with lowercase contract and
lockfile SHA-256 plus a non-negative seed. The request is independently bounded in
TypeScript and Rust: safe artifact ID, new absolute path of at most 4096 UTF-8 bytes,
one D12 rig, exact 115200 baud, 1..1000 Hz rate, exact confirmation, finite bounded
environment, hashes, and seed. Browser builds fail before invoke. Studio receives no
frames and creates no gateway row. Focused evidence is fourteen native
tests and twenty Studio tests plus typecheck/build; the three-engine browser matrix
and all 40 local gates pass under Python 3.12.7. Exact head `69db857`, reviewed tree
`25be1d3`, PR CI/security `29495505253`/`29495505262`, protected `a8120ab`, and
post-merge CI/security `29496148793`/`29496148796` pass. Object-backed gateway
materialization must be designed separately because the current JSONB request-body
telemetry path cannot honestly carry the archive's 512-MiB maximum.

D53 implements that narrow materialization seam without changing archive v1. Native
`prepare_recorder_archive_upload` reruns D51 and returns path-free
`forge-recorder-upload-plan/1.0.0` identity plus exact five-file length/type/hash
declarations. The authenticated gateway stages five distinct private object rows and
presigned checksum-bound PUTs. Desktop requires one explicit
`FORGE_DESKTOP_OBJECT_UPLOAD_ORIGIN`, HTTPS except loopback development, exact origin,
complete signature query, exact content-type/checksum headers, no redirects, no
system proxy, and streams each file with a sized blocking body off the async command
thread. It returns `forge-recorder-upload/1.0.0` with gateway integrity still false.

Gateway completion independently inspects all five stored objects, uses the existing
staged-object compare-and-set, and reads only capped manifest/receipt bytes to bind the
artifact, rig, hashes, times/count, and frame/index/replay object digests. Migration
0025 advances the row only when status, object integrity, and materialized time agree.
This sets `gatewayObjectIntegrityVerified=true` but permanently leaves
`gatewayArchiveSemanticsVerified=false` alongside false device, field, recorded-
device, sharing, and training authority. The gateway has not streamed and replayed
the frame/index/replay semantics, so D53 is not telemetry admission or authenticity.
PR #93 exact head `5d1af49`, reviewed tree `90d8cbf`, protected `08d892f`, PR
CI/security `29501475412`/`29501475414`, and post-merge CI/security
`29502180736`/`29502180788` protect only this local private-object-integrity maturity.

P8-012 is complete at protected deterministic/native transport integration
maturity through PR #83/`fd26845` and exact PR/post-merge CI/security. D49 owns the
protected local target-firmware handshake and post-write readback protocol through
PR #85/`4647a10`, reviewed tree `dfa0007`, and exact PR/post-merge CI/security; the
first real props-off D12 execution and retained acceptance pack remain required
before any lab-applied-configuration claim. Browser WebSerial write/capture, live
device adapter capture, build/signing, and updater delivery remain open; real
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
artifact schema/version/command/range/hash refusal, unenumerated port refusal,
wrong/ambiguous firmware identity, bounded response/reconnect behavior, exact set/save
acknowledgement, mismatched/duplicate readback, partial-state guidance, and the full
two-session serial protocol over real pseudo-terminals. The minimum implementation gate is
`pnpm --filter @forge/desktop test`, locked Desktop Cargo fmt/Clippy/tests, Python
3.12 hardware-boundary tests, and `pnpm verify:desktop-native`; a real-device claim
additionally requires the D49 protocol to pass against the named FC with retained raw
responses/hashes and signed lab evidence. HITL harness against the reference FC
responses/hashes and signed lab evidence. Recorder changes additionally require
exact archive/frame/receipt versions, consent and OS-enumerated-source refusal,
bounded JSON/bytes/frames, contiguous sequence and increasing time, exclusive
no-overwrite creation, background-thread start/stop, partial/empty/error refusal,
flush/sync-before-receipt ordering, exact frame/index/replay hashes, replay-v1
round-trip, sparse byte-offset indexing, private-by-default flags, and explicit false
device attestation over a real pseudo-terminal. HITL harness against the reference FC
(timing/interface validation); recorder round-trip (log → replay → ghost render — bit-exact under D17); sysid fit on
synthetic telemetry with known ground truth (fit must recover injected constants);
supervisor unit tests (envelope breach → fallback within deadline); pairing-auth
tests; Desktop plugin integration tests on all three OSes; gateway/Desktop gate tests
for D30/D28 fail-closed behavior, D12 lab-only behavior, physical confirmation, and
"never auto-arm". The registered QA-007 hardware corpus adds fourteen accepted and
refused payloads for unreviewed config authority, unsafe failsafe bounds,
finite/duplicate telemetry, vector arity, geofence bounds, kill-switch typing, and
advisory/hold outcomes.

## 12. Open questions

Tauri updater/signing strategy per OS (decide at P8-011); real device-adapter codec
and identity/attestation contract above D50's local serial-JSONL seam; FORGE Link
build tooling (pi-gen assumed *(proposed)*).
