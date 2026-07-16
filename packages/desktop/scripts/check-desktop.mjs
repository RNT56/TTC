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
  "write_serial_config",
  "start_background_recording",
  "stop_background_recording",
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
assert(main.includes("forge-recorder-manifest.json"), "desktop recorder must initialize a filesystem archive manifest");

console.log("desktop: scaffold, FORGE Link manifest, and deployment ladder checks passed");
