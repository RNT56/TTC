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
assert(main.includes("FORGE_DESKTOP_D28_SIGNOFF"), "native hardware access must require D28 signoff");
assert(main.includes("FORGE_HARDWARE_LAB_MODE"), "native hardware access must require lab mode");
assert(main.includes("ref_quad_kakute-h7-source-one-5in"), "native hardware access must be D12 quad-gated");
assert(main.includes("ref_rover_waveshare-ugv-rover-pt-pi5-ros2"), "native hardware access must be D12 rover-gated");
assert(main.includes("no_auto_arm: true"), "native bridge status must be no-auto-arm");

console.log("desktop: scaffold, FORGE Link manifest, and deployment ladder checks passed");
