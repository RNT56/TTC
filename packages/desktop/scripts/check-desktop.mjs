import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

async function json(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const tauri = await json("src-tauri/tauri.conf.json");
assert(tauri.productName === "FORGE Desktop", "tauri product name mismatch");
assert(tauri.build?.frontendDist === "../../studio/dist", "desktop must wrap the Studio build");
assert(Array.isArray(tauri.bundle?.targets) && tauri.bundle.targets.length >= 4, "missing OS bundle targets");

const link = await json("forge-link/manifest.json");
const services = new Set(link.services?.map((service) => service.name));
for (const required of ["rosbridge", "mavlink-router", "onnx-runtime", "pairing-auth"]) {
  assert(services.has(required), `FORGE Link missing ${required}`);
}
assert(link.security?.noAutoArm === true, "FORGE Link must never auto-arm");
assert(link.runtimeContract?.supervisorRateHz >= 200, "supervisor loop rate too low");

const ladder = await json("deployment-ladder.json");
assert(ladder.noAutoArm === true, "deployment ladder must never auto-arm");
assert(ladder.stages?.map((stage) => stage.id).join(">") === "sitl>hitl>constrained>free", "deployment ladder stage order mismatch");
assert(ladder.stages.slice(1).every((stage) => stage.physicalConfirmation === true), "hardware stages require physical confirmation");
assert(ladder.liveHardwareGate?.decision === "D30", "deployment ladder must carry the D30 lab signoff decision");
assert(ladder.liveHardwareGate?.scope === "controlled D12 lab pilots only", "deployment ladder must stay scoped to D12 lab pilots");
assert(ladder.liveHardwareGate?.externalBetaEnabled === false, "deployment ladder must not enable external hardware beta");

const main = await readFile(resolve(root, "src-tauri/src/main.rs"), "utf8");
for (const command of [
  "bridge_status",
  "list_serial_ports",
  "probe_recorder_adapter",
  "write_serial_config",
  "start_background_recording",
  "start_custodied_background_recording",
  "stop_background_recording",
  "stop_custodied_background_recording",
]) {
  assert(main.includes(`fn ${command}`), `missing Tauri command ${command}`);
}
assert(main.includes("FORGE_DESKTOP_ENABLE_HARDWARE"), "native hardware access must be env-gated");
assert(main.includes("FORGE_DESKTOP_D30_LAB_SIGNOFF"), "native hardware access must require D30 lab signoff");
assert(main.includes("FORGE_HARDWARE_LAB_MODE"), "native hardware access must require lab mode");
assert(main.includes("ref_quad_kakute-h7-source-one-5in"), "native hardware access must be D12 quad-gated");
assert(main.includes("ref_rover_waveshare-ugv-rover-pt-pi5-ros2"), "native hardware access must be D12 rover-gated");
assert(main.includes("no_auto_arm: true"), "native bridge status must be no-auto-arm");
assert(main.includes("serialport::available_ports"), "desktop must enumerate serial ports through serialport-rs");
assert(main.includes("serialport::new"), "desktop serial writes must use serialport-rs behind gates");
assert(main.includes("forge-bridge-config/1.0.0"), "desktop serial writes must require the versioned bridge config artifact");
assert(main.includes("forge-bridge-serial-receipt/2.0.0"), "desktop serial success must require the readback-proven receipt major");
assert(main.includes('BETAFLIGHT_CLI_VERSION: &str = "2025.12"'), "desktop serial writes must bind the reviewed Betaflight CLI version");
assert(main.includes("I confirm propellers are removed"), "desktop serial writes must require props-off physical confirmation");
assert(main.includes("diffHash does not match"), "desktop serial writes must verify the exact ordered config hash");
assert(main.includes('write_serial_command(port, port_label, "version")'), "desktop must query target firmware identity before and after writing");
assert(main.includes('write_serial_command(port, port_label, "get failsafe_delay")'), "desktop must perform exact post-write readback");
assert(main.includes("target_firmware_version_verified: true"), "successful desktop receipts must verify the connected firmware version");
assert(main.includes("application_verified: true"), "successful desktop receipts must verify persistent application by readback");
assert(main.includes("pre_write_version_response_sha256"), "desktop receipts must bind the exact pre-write version response");
assert(main.includes("application_response_sha256"), "desktop receipts must bind the exact set/save response");
assert(main.includes("post_write_version_response_sha256"), "desktop receipts must bind the exact post-write version response");
assert(main.includes("readback_response_sha256"), "desktop receipts must bind the exact readback response");
assert(main.includes("cli_left_arming_disabled: true"), "desktop must leave the verified target CLI-arming-disabled");
assert(main.includes("keep the rig disarmed and inspect it manually"), "ambiguous post-write state must fail with disarmed operator guidance");
assert(main.includes("forge-recorder-adapter-probe/1.0.0"), "desktop must version the read-only recorder adapter probe");
assert(main.includes("forge-betaflight-msp-adapter/1.0.0"), "desktop must bind the reviewed Betaflight MSP adapter contract");
assert(main.includes("unattested-read-only-probe"), "adapter probing must not imply device attestation");
assert(main.includes("READ_ONLY_MSP_COMMANDS"), "adapter probing must use an exact read-only MSP command allowlist");
assert(main.includes("cryptographic_device_attestation: false"), "MSP identity observation must not fabricate cryptographic attestation");
assert(main.includes("adapter identity probing requires the Desktop recorder to be inactive"), "adapter probing must not race the recorder on one serial port");
assert(main.includes("forge-recorder-manifest.json"), "desktop recorder must initialize a filesystem archive manifest");
assert(main.includes("forge-recorder-archive/1.0.0"), "desktop recorder archives must carry an independent persisted format version");
assert(main.includes("forge-telemetry-frame/1.0.0"), "desktop recorder input frames must carry an exact versioned schema");
assert(main.includes("forge-recorder-receipt/1.0.0"), "clean recorder completion must emit a versioned receipt");
assert(main.includes("serial-jsonl"), "desktop recorder must bind its exact local serial input codec");
assert(main.includes("telemetry.frames.jsonl"), "desktop recorder must retain crash-tolerant ordered frame storage");
assert(main.includes("telemetry.index.jsonl"), "desktop recorder must retain a sparse byte-offset index");
assert(main.includes("telemetry.replay.json"), "desktop recorder must finalize a replay-v1 artifact");
assert(main.includes("recorded_device_attested: false"), "local recorder integration must not fabricate device provenance");
assert(main.includes("capture_consent_confirmed: true"), "completed local archives must retain exact capture-consent confirmation");
assert(main.includes("sharing_authorized: false"), "local recorder archives must remain private by default");
assert(main.includes("training_reuse_authorized: false"), "capture consent must not imply training reuse");
assert(main.includes("create_new(true)"), "desktop recorder files must never overwrite an existing archive");

const custody = await readFile(resolve(root, "src-tauri/src/custody.rs"), "utf8");
const cargo = await readFile(resolve(root, "src-tauri/Cargo.toml"), "utf8");
assert(cargo.includes('ed25519-dalek = { version = "=3.0.0"'), "recorder custody must pin the reviewed Ed25519 verifier");
assert(main.includes("forge-recorder-custody-trust-bundle/1.0.0"), "desktop must version the custody trust bundle");
assert(main.includes("forge-recorder-custody-authorization/1.0.0"), "desktop must version the custody authorization");
assert(main.includes("forge-recorder-custody-proof/1.0.0"), "desktop must version the separate custody proof");
assert(main.includes("FORGE_DESKTOP_RECORDER_CUSTODY_TRUST_BUNDLE_SHA256"), "custody trust roots must be deployment hash-pinned");
assert(main.includes("FORGE_DESKTOP_PROTECTED_REVISION"), "custody must bind the protected product revision");
assert(main.includes("recorder archive completed but custody proof was not created"), "post-capture custody failure must preserve the valid archive explicitly");
assert(main.includes("acceptance_authority_signature_verified: true"), "custody proof must identify acceptance-authority verification");
assert(main.includes("cryptographic_device_attestation: false"), "custody must never fabricate a device signature");
assert(custody.includes("verify_strict"), "custody signatures must use strict Ed25519 verification");
assert(custody.includes("verifying_key.is_weak()"), "custody must reject weak Ed25519 public keys");
assert(custody.includes("MAX_AUTHORIZATION_LIFETIME_MS"), "custody authorization lifetime must remain bounded");
assert(custody.includes("create_new(true)"), "custody proofs must never overwrite existing evidence");
assert(custody.includes("outside the exact five-file archive"), "custody proof must stay outside archive v1");

console.log("desktop: scaffold, FORGE Link manifest, and deployment ladder checks passed");
