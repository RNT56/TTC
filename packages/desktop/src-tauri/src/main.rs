#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};

const HARDWARE_ENV: &str = "FORGE_DESKTOP_ENABLE_HARDWARE";
const D30_LAB_SIGNOFF_ENV: &str = "FORGE_DESKTOP_D30_LAB_SIGNOFF";
const LAB_MODE_ENV: &str = "FORGE_HARDWARE_LAB_MODE";
const D12_RIGS: &[&str] = &[
    "ref_quad_kakute-h7-source-one-5in",
    "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeStatus {
    enabled: bool,
    reason: String,
    no_auto_arm: bool,
    policy_rate_hz: u32,
    supervisor_rate_hz: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SerialWriteRequest {
    port: String,
    baud: u32,
    config_diff: String,
    reference_rig_id: Option<String>,
    physical_confirmation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerialPortInfo {
    name: String,
    kind: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecorderRequest {
    artifact_id: String,
    output_dir: String,
    sample_rate_hz: u32,
    reference_rig_id: Option<String>,
    physical_confirmation: String,
}

fn hardware_enabled() -> bool {
    std::env::var(HARDWARE_ENV).ok().as_deref() == Some("1")
        && std::env::var(D30_LAB_SIGNOFF_ENV).ok().as_deref() == Some("1")
        && std::env::var(LAB_MODE_ENV).ok().as_deref() == Some("1")
}

fn disabled_status() -> BridgeStatus {
    BridgeStatus {
        enabled: hardware_enabled(),
        reason: if hardware_enabled() {
            "hardware bridge enabled for D12 lab mode by environment".to_string()
        } else {
            format!(
                "{HARDWARE_ENV}=1, {D30_LAB_SIGNOFF_ENV}=1, and {LAB_MODE_ENV}=1 are required for native D12 lab hardware access"
            )
        },
        no_auto_arm: true,
        policy_rate_hz: 50,
        supervisor_rate_hz: 200,
    }
}

fn require_d12_rig(reference_rig_id: Option<&str>) -> Result<(), String> {
    let Some(rig_id) = reference_rig_id else {
        return Err("referenceRigId is required for native D12 lab hardware access".to_string());
    };
    if D12_RIGS.contains(&rig_id) {
        Ok(())
    } else {
        Err("native hardware access is limited to D12 reference rigs in lab mode".to_string())
    }
}

#[tauri::command]
fn bridge_status() -> BridgeStatus {
    disabled_status()
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    if !hardware_enabled() {
        return Ok(Vec::new());
    }
    Err("serialport-rs integration is enabled only in signed D12 lab builds".to_string())
}

#[tauri::command]
fn write_serial_config(request: SerialWriteRequest) -> Result<BridgeStatus, String> {
    if !hardware_enabled() {
        return Err(disabled_status().reason);
    }
    if request.physical_confirmation != "I understand this will write hardware configuration" {
        return Err("physical confirmation phrase mismatch".to_string());
    }
    if request.port.trim().is_empty() || request.baud == 0 || request.config_diff.trim().is_empty()
    {
        return Err("port, baud, and configDiff are required".to_string());
    }
    require_d12_rig(request.reference_rig_id.as_deref())?;
    Err("native serial write implementation is blocked until the D12 lab adapter is installed".to_string())
}

#[tauri::command]
fn start_background_recording(request: RecorderRequest) -> Result<BridgeStatus, String> {
    if !hardware_enabled() {
        return Err(disabled_status().reason);
    }
    if request.physical_confirmation != "I consent to record this telemetry log" {
        return Err("telemetry consent phrase mismatch".to_string());
    }
    if request.artifact_id.trim().is_empty()
        || request.output_dir.trim().is_empty()
        || request.sample_rate_hz == 0
    {
        return Err("artifactId, outputDir, and sampleRateHz are required".to_string());
    }
    require_d12_rig(request.reference_rig_id.as_deref())?;
    Err("background recorder sidecar implementation is blocked until the D12 lab adapter is installed".to_string())
}

#[tauri::command]
fn stop_background_recording() -> BridgeStatus {
    disabled_status()
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            bridge_status,
            list_serial_ports,
            write_serial_config,
            start_background_recording,
            stop_background_recording
        ])
        .run(tauri::generate_context!())
        .expect("FORGE Desktop failed to start");
}
