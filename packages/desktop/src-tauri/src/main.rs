#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderArchiveManifest {
    schema_version: u32,
    artifact_id: String,
    reference_rig_id: String,
    sample_rate_hz: u32,
    started_at_unix_ms: u128,
    replay_file: String,
    no_auto_arm: bool,
}

fn hardware_enabled() -> bool {
    std::env::var(HARDWARE_ENV).ok().as_deref() == Some("1")
        && std::env::var(D30_LAB_SIGNOFF_ENV).ok().as_deref() == Some("1")
        && std::env::var(LAB_MODE_ENV).ok().as_deref() == Some("1")
}

fn disabled_status() -> BridgeStatus {
    bridge_status_with_reason(if hardware_enabled() {
        "hardware bridge enabled for D12 lab mode by environment".to_string()
    } else {
        format!(
            "{HARDWARE_ENV}=1, {D30_LAB_SIGNOFF_ENV}=1, and {LAB_MODE_ENV}=1 are required for native D12 lab hardware access"
        )
    })
}

fn bridge_status_with_reason(reason: String) -> BridgeStatus {
    BridgeStatus {
        enabled: hardware_enabled(),
        reason,
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

fn serial_port_kind(kind: &serialport::SerialPortType) -> String {
    match kind {
        serialport::SerialPortType::UsbPort(info) => {
            let product = info.product.as_deref().unwrap_or("usb");
            let serial = info.serial_number.as_deref().unwrap_or("unknown");
            format!("usb:{product}:{serial}")
        }
        serialport::SerialPortType::BluetoothPort => "bluetooth".to_string(),
        serialport::SerialPortType::PciPort => "pci".to_string(),
        serialport::SerialPortType::Unknown => "unknown".to_string(),
    }
}

fn normalize_config_payload(config_diff: &str) -> Vec<u8> {
    let mut payload = config_diff.as_bytes().to_vec();
    if !payload.ends_with(b"\n") {
        payload.push(b'\n');
    }
    payload
}

fn write_recorder_manifest(
    request: &RecorderRequest,
    rig_id: &str,
) -> Result<(PathBuf, RecorderArchiveManifest), String> {
    let output_dir = Path::new(&request.output_dir);
    fs::create_dir_all(output_dir).map_err(|err| format!("create recorder archive: {err}"))?;
    let manifest = RecorderArchiveManifest {
        schema_version: 1,
        artifact_id: request.artifact_id.clone(),
        reference_rig_id: rig_id.to_string(),
        sample_rate_hz: request.sample_rate_hz,
        started_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|err| format!("system clock before UNIX_EPOCH: {err}"))?
            .as_millis(),
        replay_file: "telemetry.replay.jsonl".to_string(),
        no_auto_arm: true,
    };
    let path = output_dir.join("forge-recorder-manifest.json");
    let json = serde_json::to_vec_pretty(&manifest)
        .map_err(|err| format!("serialize recorder manifest: {err}"))?;
    fs::write(&path, json).map_err(|err| format!("write recorder manifest: {err}"))?;
    Ok((path, manifest))
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
    serialport::available_ports()
        .map_err(|err| format!("list serial ports: {err}"))
        .map(|ports| {
            ports
                .into_iter()
                .map(|port| SerialPortInfo {
                    name: port.port_name,
                    kind: serial_port_kind(&port.port_type),
                })
                .collect()
        })
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
    let payload = normalize_config_payload(&request.config_diff);
    let mut port = serialport::new(&request.port, request.baud)
        .timeout(Duration::from_secs(2))
        .open()
        .map_err(|err| format!("open serial port '{}': {err}", request.port))?;
    port.write_all(&payload)
        .map_err(|err| format!("write serial config '{}': {err}", request.port))?;
    port.flush()
        .map_err(|err| format!("flush serial config '{}': {err}", request.port))?;
    Ok(bridge_status_with_reason(format!(
        "serial config written to {} with no-auto-arm bridge gates",
        request.port
    )))
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
    let rig_id = request.reference_rig_id.as_deref().ok_or_else(|| {
        "referenceRigId is required for native D12 lab hardware access".to_string()
    })?;
    require_d12_rig(Some(rig_id))?;
    let (manifest_path, _) = write_recorder_manifest(&request, rig_id)?;
    Ok(bridge_status_with_reason(format!(
        "background recorder archive initialized at {}; live capture remains operator-controlled",
        manifest_path.display()
    )))
}

#[tauri::command]
fn stop_background_recording() -> BridgeStatus {
    disabled_status()
}

#[cfg(not(test))]
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

#[cfg(test)]
fn main() {}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("forge-desktop-{name}-{stamp}"))
    }

    #[test]
    fn config_payload_gets_trailing_newline_only_once() {
        assert_eq!(normalize_config_payload("set x=1"), b"set x=1\n");
        assert_eq!(normalize_config_payload("set x=1\n"), b"set x=1\n");
    }

    #[test]
    fn recorder_manifest_is_written_to_real_filesystem_archive() {
        let dir = test_dir("recorder");
        let request = RecorderRequest {
            artifact_id: "art_replay_1".to_string(),
            output_dir: dir.to_string_lossy().into_owned(),
            sample_rate_hz: 120,
            reference_rig_id: Some("ref_rover_waveshare-ugv-rover-pt-pi5-ros2".to_string()),
            physical_confirmation: "I consent to record this telemetry log".to_string(),
        };
        let (path, manifest) =
            write_recorder_manifest(&request, request.reference_rig_id.as_deref().unwrap())
                .expect("manifest writes");
        assert!(path.exists());
        assert_eq!(manifest.artifact_id, "art_replay_1");
        assert_eq!(manifest.sample_rate_hz, 120);
        assert!(manifest.no_auto_arm);
        let raw = fs::read_to_string(&path).expect("manifest readable");
        assert!(raw.contains("\"replayFile\""));
        fs::remove_dir_all(dir).expect("cleanup");
    }
}
