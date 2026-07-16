#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const HARDWARE_ENV: &str = "FORGE_DESKTOP_ENABLE_HARDWARE";
const D30_LAB_SIGNOFF_ENV: &str = "FORGE_DESKTOP_D30_LAB_SIGNOFF";
const LAB_MODE_ENV: &str = "FORGE_HARDWARE_LAB_MODE";
const BRIDGE_CONFIG_SCHEMA_VERSION: &str = "forge-bridge-config/1.0.0";
const BRIDGE_SERIAL_RECEIPT_SCHEMA_VERSION: &str = "forge-bridge-serial-receipt/1.0.0";
const BETAFLIGHT_CLI_VERSION: &str = "2025.12";
const SERIAL_PHYSICAL_CONFIRMATION: &str = "I understand this will write hardware configuration";
const BETAFLIGHT_SERIAL_BAUD: u32 = 115_200;
const BETAFLIGHT_FAILSAFE_DELAY_MIN_DS: u16 = 2;
const BETAFLIGHT_FAILSAFE_DELAY_MAX_DS: u16 = 200;
const MAX_CONFIG_BYTES: usize = 64 * 1024;
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
struct BridgeConfigArtifact {
    schema_version: String,
    artifact_kind: String,
    firmware: String,
    firmware_version: String,
    diff_hash: String,
    requires_physical_confirmation: bool,
    no_auto_arm: bool,
    lines: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SerialWriteRequest {
    port: String,
    baud: u32,
    config_artifact: BridgeConfigArtifact,
    reference_rig_id: Option<String>,
    physical_confirmation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerialWriteReceipt {
    schema_version: &'static str,
    reference_rig_id: String,
    port: String,
    baud: u32,
    firmware: String,
    firmware_version: String,
    diff_hash: String,
    bytes_transmitted: usize,
    transmitted_at_unix_ms: u128,
    no_auto_arm: bool,
    target_firmware_version_verified: bool,
    application_verified: bool,
    operator_readback_required: bool,
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

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn validate_config_artifact(artifact: &BridgeConfigArtifact) -> Result<Vec<u8>, String> {
    if artifact.schema_version != BRIDGE_CONFIG_SCHEMA_VERSION {
        return Err(format!(
            "unsupported bridge config schema {}; expected {BRIDGE_CONFIG_SCHEMA_VERSION}",
            artifact.schema_version
        ));
    }
    if artifact.artifact_kind != "bridge-config" {
        return Err("native serial writes require a bridge-config artifact".to_string());
    }
    if artifact.firmware != "betaflight" {
        return Err(
            "native serial writes currently support only reviewed Betaflight config artifacts"
                .to_string(),
        );
    }
    if artifact.firmware_version != BETAFLIGHT_CLI_VERSION {
        return Err(format!(
            "native serial writes require the reviewed Betaflight {BETAFLIGHT_CLI_VERSION} command contract"
        ));
    }
    if !artifact.requires_physical_confirmation || !artifact.no_auto_arm {
        return Err(
            "bridge config must require physical confirmation and forbid auto-arm".to_string(),
        );
    }
    if artifact.lines.len() != 3 {
        return Err(
            "bridge config v1 must contain exactly header, failsafe_delay, and save lines"
                .to_string(),
        );
    }
    let expected_header = format!(
        "# FORGE generated {} {} config diff",
        artifact.firmware, artifact.firmware_version
    );
    if artifact.lines.first() != Some(&expected_header) {
        return Err("bridge config header does not match firmware authority".to_string());
    }
    if artifact.lines.last().map(String::as_str) != Some("save") {
        return Err("bridge config must end with exactly one save command".to_string());
    }

    let failsafe_delay = artifact.lines[1]
        .strip_prefix("set failsafe_delay = ")
        .ok_or_else(|| {
            "bridge config v1 requires exactly the reviewed failsafe_delay setting".to_string()
        })?
        .parse::<u16>()
        .map_err(|_| {
            "bridge config failsafe_delay must be an integer from 2 through 200 deciseconds"
                .to_string()
        })?;
    if !(BETAFLIGHT_FAILSAFE_DELAY_MIN_DS..=BETAFLIGHT_FAILSAFE_DELAY_MAX_DS)
        .contains(&failsafe_delay)
    {
        return Err(
            "bridge config failsafe_delay must be an integer from 2 through 200 deciseconds"
                .to_string(),
        );
    }
    let canonical_lines = serde_json::to_vec(&artifact.lines)
        .map_err(|err| format!("serialize bridge config lines: {err}"))?;
    let expected_hash = sha256_hex(&canonical_lines);
    if artifact.diff_hash != expected_hash {
        return Err("bridge config diffHash does not match the exact ordered lines".to_string());
    }
    let mut payload = artifact.lines.join("\n").into_bytes();
    payload.push(b'\n');
    if payload.len() > MAX_CONFIG_BYTES {
        return Err(format!(
            "bridge config exceeds the {MAX_CONFIG_BYTES}-byte serial limit"
        ));
    }
    Ok(payload)
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
fn write_serial_config(request: SerialWriteRequest) -> Result<SerialWriteReceipt, String> {
    transmit_serial_config(request, hardware_enabled())
}

fn transmit_serial_config(
    request: SerialWriteRequest,
    gate_enabled: bool,
) -> Result<SerialWriteReceipt, String> {
    let (rig_id, payload) = prepare_serial_write(&request, gate_enabled)?;
    let available_port_names = serialport::available_ports()
        .map_err(|err| format!("list serial ports before write: {err}"))?
        .into_iter()
        .map(|port| port.port_name)
        .collect::<Vec<_>>();
    require_enumerated_serial_port(&request.port, &available_port_names)?;
    let mut port = serialport::new(&request.port, request.baud)
        .timeout(Duration::from_secs(2))
        .open()
        .map_err(|err| format!("open serial port '{}': {err}", request.port))?;
    write_serial_payload(port.as_mut(), &request.port, &payload)?;
    serial_write_receipt(request, rig_id, payload.len())
}

fn prepare_serial_write(
    request: &SerialWriteRequest,
    gate_enabled: bool,
) -> Result<(String, Vec<u8>), String> {
    if !gate_enabled {
        return Err(disabled_status().reason);
    }
    if request.physical_confirmation != SERIAL_PHYSICAL_CONFIRMATION {
        return Err("physical confirmation phrase mismatch".to_string());
    }
    if request.port.trim().is_empty() || request.baud != BETAFLIGHT_SERIAL_BAUD {
        return Err(format!(
            "a listed serial port and the reviewed {BETAFLIGHT_SERIAL_BAUD} baud rate are required"
        ));
    }
    let rig_id = request.reference_rig_id.as_deref().ok_or_else(|| {
        "referenceRigId is required for native D12 lab hardware access".to_string()
    })?;
    require_d12_rig(Some(rig_id))?;
    if rig_id != D12_RIGS[0] {
        return Err(
            "Betaflight serial configuration is limited to the D12 reference quad".to_string(),
        );
    }
    let payload = validate_config_artifact(&request.config_artifact)?;
    Ok((rig_id.to_string(), payload))
}

fn require_enumerated_serial_port(
    requested: &str,
    available_port_names: &[String],
) -> Result<(), String> {
    if available_port_names.iter().any(|name| name == requested) {
        Ok(())
    } else {
        Err("serial writes are limited to a port reported by the operating system".to_string())
    }
}

fn write_serial_payload(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
    payload: &[u8],
) -> Result<(), String> {
    port.write_all(payload)
        .map_err(|err| format!("write serial config '{port_label}': {err}"))?;
    port.flush()
        .map_err(|err| format!("flush serial config '{port_label}': {err}"))
}

fn serial_write_receipt(
    request: SerialWriteRequest,
    rig_id: String,
    bytes_transmitted: usize,
) -> Result<SerialWriteReceipt, String> {
    Ok(SerialWriteReceipt {
        schema_version: BRIDGE_SERIAL_RECEIPT_SCHEMA_VERSION,
        reference_rig_id: rig_id,
        port: request.port,
        baud: request.baud,
        firmware: request.config_artifact.firmware,
        firmware_version: request.config_artifact.firmware_version,
        diff_hash: request.config_artifact.diff_hash,
        bytes_transmitted,
        transmitted_at_unix_ms: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|err| format!("system clock before UNIX_EPOCH: {err}"))?
            .as_millis(),
        no_auto_arm: true,
        target_firmware_version_verified: false,
        application_verified: false,
        operator_readback_required: true,
    })
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
    use std::io::Read;

    fn test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("forge-desktop-{name}-{stamp}"))
    }

    fn bridge_config(lines: Vec<&str>) -> BridgeConfigArtifact {
        let lines = lines.into_iter().map(str::to_string).collect::<Vec<_>>();
        let canonical = serde_json::to_vec(&lines).expect("canonical lines");
        BridgeConfigArtifact {
            schema_version: BRIDGE_CONFIG_SCHEMA_VERSION.to_string(),
            artifact_kind: "bridge-config".to_string(),
            firmware: "betaflight".to_string(),
            firmware_version: BETAFLIGHT_CLI_VERSION.to_string(),
            diff_hash: sha256_hex(&canonical),
            requires_physical_confirmation: true,
            no_auto_arm: true,
            lines,
        }
    }

    fn serial_request(port: String, artifact: BridgeConfigArtifact) -> SerialWriteRequest {
        SerialWriteRequest {
            port,
            baud: 115_200,
            config_artifact: artifact,
            reference_rig_id: Some(D12_RIGS[0].to_string()),
            physical_confirmation: SERIAL_PHYSICAL_CONFIRMATION.to_string(),
        }
    }

    #[test]
    fn config_artifact_rejects_hash_and_command_substitution() {
        let mut artifact = bridge_config(vec![
            "# FORGE generated betaflight 2025.12 config diff",
            "set failsafe_delay = 10",
            "save",
        ]);
        assert_eq!(
            artifact.diff_hash,
            "0f8173a135515f3759993e7b495e12fbf2f903e667b752bdc226d9612e4736ba"
        );
        assert_eq!(
            validate_config_artifact(&artifact).expect("artifact validates"),
            b"# FORGE generated betaflight 2025.12 config diff\nset failsafe_delay = 10\nsave\n"
        );
        artifact.lines[1] = "arm".to_string();
        assert!(validate_config_artifact(&artifact)
            .expect_err("command substitution must fail")
            .contains("failsafe_delay"));

        let mut artifact = bridge_config(vec![
            "# FORGE generated betaflight 2025.12 config diff",
            "save",
        ]);
        artifact.diff_hash = "00".repeat(32);
        assert!(validate_config_artifact(&artifact)
            .expect_err("hash substitution must fail")
            .contains("exactly header"));

        let artifact = bridge_config(vec![
            "# FORGE generated betaflight 2025.12 config diff",
            "set airmode = ON",
            "save",
        ]);
        assert!(validate_config_artifact(&artifact)
            .expect_err("unreviewed setting must fail")
            .contains("failsafe_delay"));

        let artifact = bridge_config(vec![
            "# FORGE generated betaflight 2025.12 config diff",
            "set failsafe_delay = 1",
            "save",
        ]);
        assert!(validate_config_artifact(&artifact)
            .expect_err("unsafe delay must fail")
            .contains("2 through 200"));

        let mut artifact = bridge_config(vec![
            "# FORGE generated betaflight 2025.12 config diff",
            "set failsafe_delay = 10",
            "save",
        ]);
        artifact.diff_hash = "00".repeat(32);
        assert!(validate_config_artifact(&artifact)
            .expect_err("hash substitution must fail")
            .contains("diffHash"));
    }

    #[test]
    fn serial_write_requires_an_operating_system_enumerated_port() {
        let available = vec!["/dev/cu.usbmodem-d12".to_string()];
        require_enumerated_serial_port("/dev/cu.usbmodem-d12", &available).expect("listed port");
        assert!(
            require_enumerated_serial_port("/tmp/forged-device", &available)
                .expect_err("unlisted path must fail")
                .contains("reported by the operating system")
        );
    }

    #[cfg(unix)]
    #[test]
    fn native_serial_write_uses_a_real_pseudo_terminal_and_returns_honest_receipt() {
        use std::os::fd::AsRawFd;
        use std::time::Instant;

        let (mut master, mut slave) = serialport::TTYPort::pair().expect("pseudo terminal pair");
        let flags = unsafe { libc::fcntl(master.as_raw_fd(), libc::F_GETFL) };
        assert!(flags >= 0, "read pseudo-terminal flags");
        assert_eq!(
            unsafe { libc::fcntl(master.as_raw_fd(), libc::F_SETFL, flags | libc::O_NONBLOCK) },
            0,
            "make pseudo-terminal nonblocking"
        );
        let artifact = bridge_config(vec![
            "# FORGE generated betaflight 2025.12 config diff",
            "set failsafe_delay = 10",
            "save",
        ]);
        let request = serial_request("pseudo-terminal".to_string(), artifact);
        let (rig_id, expected) = prepare_serial_write(&request, true).expect("prepared write");
        let expected_len = expected.len();
        let reader = std::thread::spawn(move || {
            let deadline = Instant::now() + Duration::from_secs(2);
            let mut actual = Vec::with_capacity(expected_len);
            while actual.len() < expected_len && Instant::now() < deadline {
                let mut chunk = [0_u8; 1024];
                match master.read(&mut chunk) {
                    Ok(0) => std::thread::sleep(Duration::from_millis(5)),
                    Ok(count) => actual.extend_from_slice(&chunk[..count]),
                    Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(err) => panic!("read transmitted bytes: {err}"),
                }
            }
            actual
        });
        write_serial_payload(&mut slave, "pseudo-terminal", &expected).expect("serial write");
        let receipt = serial_write_receipt(request, rig_id, expected.len()).expect("receipt");
        let actual = reader.join().expect("pseudo-terminal reader");
        assert_eq!(actual, expected);
        assert_eq!(receipt.bytes_transmitted, expected.len());
        assert!(receipt.no_auto_arm);
        assert!(!receipt.target_firmware_version_verified);
        assert!(!receipt.application_verified);
        assert!(receipt.operator_readback_required);
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
