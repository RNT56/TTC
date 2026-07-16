#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![cfg_attr(test, allow(dead_code))]

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const HARDWARE_ENV: &str = "FORGE_DESKTOP_ENABLE_HARDWARE";
const D30_LAB_SIGNOFF_ENV: &str = "FORGE_DESKTOP_D30_LAB_SIGNOFF";
const LAB_MODE_ENV: &str = "FORGE_HARDWARE_LAB_MODE";
const BRIDGE_CONFIG_SCHEMA_VERSION: &str = "forge-bridge-config/1.0.0";
const BRIDGE_SERIAL_RECEIPT_SCHEMA_VERSION: &str = "forge-bridge-serial-receipt/2.0.0";
const BETAFLIGHT_CLI_VERSION: &str = "2025.12";
const SERIAL_PHYSICAL_CONFIRMATION: &str =
    "I confirm propellers are removed and understand this will write hardware configuration";
const BETAFLIGHT_SERIAL_BAUD: u32 = 115_200;
const BETAFLIGHT_FAILSAFE_DELAY_MIN_DS: u16 = 2;
const BETAFLIGHT_FAILSAFE_DELAY_MAX_DS: u16 = 200;
const MAX_CONFIG_BYTES: usize = 64 * 1024;
const MAX_SERIAL_RESPONSE_BYTES: usize = 16 * 1024;
const SERIAL_READ_TIMEOUT: Duration = Duration::from_millis(100);
const SERIAL_RESPONSE_DEADLINE: Duration = Duration::from_secs(3);
const SERIAL_REBOOT_SETTLE: Duration = Duration::from_secs(2);
const SERIAL_RECONNECT_DEADLINE: Duration = Duration::from_secs(15);
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
    target_firmware_version: String,
    pre_write_reported_firmware_identity_sha256: String,
    post_write_reported_firmware_identity_sha256: String,
    pre_write_version_response_sha256: String,
    application_response_sha256: String,
    post_write_version_response_sha256: String,
    readback_failsafe_delay_deciseconds: u16,
    readback_line_sha256: String,
    readback_response_sha256: String,
    no_auto_arm: bool,
    target_firmware_version_verified: bool,
    application_verified: bool,
    operator_readback_required: bool,
    cli_left_arming_disabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TargetFirmwareIdentity {
    firmware_version: String,
    identity_sha256: String,
    response_sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct VerifiedSerialEvidence {
    readback_failsafe_delay_deciseconds: u16,
    pre_write_identity: TargetFirmwareIdentity,
    application_response_sha256: String,
    post_write_identity: TargetFirmwareIdentity,
    readback_line_sha256: String,
    readback_response_sha256: String,
}

#[derive(Debug, Clone, Copy)]
enum SerialResponseTerminator {
    Prompt,
    Saving,
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

fn artifact_failsafe_delay(artifact: &BridgeConfigArtifact) -> Result<u16, String> {
    let failsafe_delay = artifact
        .lines
        .get(1)
        .and_then(|line| line.strip_prefix("set failsafe_delay = "))
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
    Ok(failsafe_delay)
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

    artifact_failsafe_delay(artifact)?;
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

fn response_has_terminator(bytes: &[u8], terminator: SerialResponseTerminator) -> bool {
    match terminator {
        SerialResponseTerminator::Prompt => bytes.ends_with(b"\r\n# ") || bytes.ends_with(b"\n# "),
        SerialResponseTerminator::Saving => [b"\r\n# saving".as_slice(), b"\n# saving".as_slice()]
            .iter()
            .any(|marker| bytes.windows(marker.len()).any(|window| window == *marker)),
    }
}

fn read_serial_response(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
    terminator: SerialResponseTerminator,
) -> Result<Vec<u8>, String> {
    read_serial_response_with_limits(
        port,
        port_label,
        terminator,
        SERIAL_RESPONSE_DEADLINE,
        MAX_SERIAL_RESPONSE_BYTES,
    )
}

fn read_serial_response_with_limits(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
    terminator: SerialResponseTerminator,
    response_deadline: Duration,
    max_response_bytes: usize,
) -> Result<Vec<u8>, String> {
    let deadline = std::time::Instant::now() + response_deadline;
    let mut response = Vec::new();
    while std::time::Instant::now() < deadline {
        if response_has_terminator(&response, terminator) {
            return Ok(response);
        }
        let mut chunk = [0_u8; 1024];
        match port.read(&mut chunk) {
            Ok(0) => thread::sleep(Duration::from_millis(5)),
            Ok(count) => {
                if response.len() + count > max_response_bytes {
                    return Err(format!(
                        "serial response from '{port_label}' exceeds {max_response_bytes} bytes"
                    ));
                }
                response.extend_from_slice(&chunk[..count]);
            }
            Err(err)
                if matches!(
                    err.kind(),
                    std::io::ErrorKind::TimedOut
                        | std::io::ErrorKind::WouldBlock
                        | std::io::ErrorKind::Interrupted
                ) => {}
            Err(err) => {
                return Err(format!("read serial response from '{port_label}': {err}"));
            }
        }
    }
    Err(format!(
        "timed out waiting for a bounded Betaflight CLI response from '{port_label}'"
    ))
}

fn write_serial_command(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
    command: &str,
) -> Result<(), String> {
    let mut bytes = command.as_bytes().to_vec();
    bytes.extend_from_slice(b"\r\n");
    port.write_all(&bytes)
        .map_err(|err| format!("write Betaflight CLI command to '{port_label}': {err}"))?;
    port.flush()
        .map_err(|err| format!("flush Betaflight CLI command to '{port_label}': {err}"))
}

fn normalized_response_lines(response: &[u8]) -> Result<Vec<String>, String> {
    let text = std::str::from_utf8(response)
        .map_err(|_| "Betaflight CLI response must be valid UTF-8".to_string())?;
    if text.chars().any(|character| {
        character == '\0' || (character.is_control() && !matches!(character, '\r' | '\n' | '\t'))
    }) {
        return Err("Betaflight CLI response contains unsupported control bytes".to_string());
    }
    Ok(text
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

fn supported_betaflight_version(token: &str) -> Option<String> {
    let parts = token.split('.').collect::<Vec<_>>();
    if parts.len() != 3
        || parts[0] != "2025"
        || parts[1] != "12"
        || parts[2].is_empty()
        || !parts[2].bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    parts[2].parse::<u16>().ok()?;
    Some(token.to_string())
}

fn parse_target_firmware_identity(response: &[u8]) -> Result<TargetFirmwareIdentity, String> {
    let lines = normalized_response_lines(response)?;
    let identity_lines = lines
        .iter()
        .filter(|line| line.starts_with("# Betaflight / "))
        .collect::<Vec<_>>();
    if identity_lines.len() != 1 {
        return Err(
            "target version handshake requires exactly one Betaflight identity line".to_string(),
        );
    }
    let identity_line = identity_lines[0];
    if !identity_line.contains(" MSP API: ") {
        return Err("Betaflight identity line is missing its MSP API authority".to_string());
    }
    let after_firmware = identity_line
        .strip_prefix("# Betaflight / ")
        .expect("identity prefix was checked");
    let board_end = after_firmware.find(") ").ok_or_else(|| {
        "Betaflight identity line is missing its target/board boundary".to_string()
    })?;
    let version_token = after_firmware[(board_end + 2)..]
        .split_whitespace()
        .next()
        .ok_or_else(|| "Betaflight identity line is missing its firmware version".to_string())?;
    let firmware_version = supported_betaflight_version(version_token).ok_or_else(|| {
        "target version handshake requires one stable Betaflight 2025.12 patch version".to_string()
    })?;
    Ok(TargetFirmwareIdentity {
        firmware_version,
        identity_sha256: sha256_hex(identity_line.as_bytes()),
        response_sha256: sha256_hex(response),
    })
}

fn parse_config_application_confirmation(
    response: &[u8],
    expected_failsafe_delay: u16,
) -> Result<(), String> {
    let lines = normalized_response_lines(response)?;
    if lines
        .iter()
        .any(|line| line.contains("ERROR") || line.contains("INVALID"))
    {
        return Err("Betaflight rejected the reviewed configuration command".to_string());
    }
    let expected_set = format!("failsafe_delay set to {expected_failsafe_delay}");
    if lines.iter().filter(|line| *line == &expected_set).count() != 1 {
        return Err(
            "Betaflight did not confirm exactly one expected failsafe_delay update".to_string(),
        );
    }
    if lines
        .iter()
        .filter(|line| line.as_str() == "# saving")
        .count()
        != 1
    {
        return Err("Betaflight did not confirm exactly one persistent save".to_string());
    }
    Ok(())
}

fn parse_failsafe_readback(
    response: &[u8],
    expected_failsafe_delay: u16,
) -> Result<String, String> {
    let lines = normalized_response_lines(response)?;
    if lines
        .iter()
        .any(|line| line.contains("ERROR") || line.contains("INVALID"))
    {
        return Err("Betaflight rejected the failsafe_delay readback query".to_string());
    }
    let prefix = "failsafe_delay = ";
    let readbacks = lines
        .iter()
        .filter_map(|line| line.strip_prefix(prefix).map(|value| (line, value)))
        .collect::<Vec<_>>();
    if readbacks.len() != 1 {
        return Err(
            "post-write verification requires exactly one failsafe_delay readback".to_string(),
        );
    }
    let observed = readbacks[0]
        .1
        .parse::<u16>()
        .map_err(|_| "failsafe_delay readback is not an integer".to_string())?;
    if observed != expected_failsafe_delay {
        return Err(format!(
            "failsafe_delay readback mismatch: expected {expected_failsafe_delay}, observed {observed}"
        ));
    }
    Ok(sha256_hex(readbacks[0].0.as_bytes()))
}

fn enter_betaflight_cli(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
) -> Result<(), String> {
    write_serial_command(port, port_label, "#")?;
    read_serial_response(port, port_label, SerialResponseTerminator::Prompt)?;
    Ok(())
}

fn verify_target_firmware_session(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
) -> Result<TargetFirmwareIdentity, String> {
    enter_betaflight_cli(port, port_label)?;
    write_serial_command(port, port_label, "version")?;
    let response = read_serial_response(port, port_label, SerialResponseTerminator::Prompt)?;
    parse_target_firmware_identity(&response)
}

fn apply_config_session(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
    payload: &[u8],
    expected_failsafe_delay: u16,
) -> Result<String, String> {
    write_serial_payload(port, port_label, payload)?;
    let response = read_serial_response(port, port_label, SerialResponseTerminator::Saving)?;
    parse_config_application_confirmation(&response, expected_failsafe_delay)?;
    Ok(sha256_hex(&response))
}

fn verify_config_readback_session(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
    expected_identity: &TargetFirmwareIdentity,
    expected_failsafe_delay: u16,
) -> Result<(TargetFirmwareIdentity, String, String), String> {
    let identity = verify_target_firmware_session(port, port_label)?;
    if identity.firmware_version != expected_identity.firmware_version
        || identity.identity_sha256 != expected_identity.identity_sha256
    {
        return Err(
            "post-write reported firmware identity does not match the pre-write Betaflight target"
                .to_string(),
        );
    }
    write_serial_command(port, port_label, "get failsafe_delay")?;
    let response = read_serial_response(port, port_label, SerialResponseTerminator::Prompt)?;
    let readback_line_sha256 = parse_failsafe_readback(&response, expected_failsafe_delay)?;
    let readback_response_sha256 = sha256_hex(&response);
    Ok((identity, readback_line_sha256, readback_response_sha256))
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
    let (rig_id, payload, expected_failsafe_delay) = prepare_serial_write(&request, gate_enabled)?;
    let available_port_names = serialport::available_ports()
        .map_err(|err| format!("list serial ports before write: {err}"))?
        .into_iter()
        .map(|port| port.port_name)
        .collect::<Vec<_>>();
    require_enumerated_serial_port(&request.port, &available_port_names)?;
    let mut port = serialport::new(&request.port, request.baud)
        .timeout(SERIAL_READ_TIMEOUT)
        .open()
        .map_err(|err| format!("open serial port '{}': {err}", request.port))?;
    let pre_write_identity = verify_target_firmware_session(port.as_mut(), &request.port)
        .map_err(|err| format!("target version handshake failed before any config write: {err}"))?;
    let application_response_sha256 = apply_config_session(
        port.as_mut(),
        &request.port,
        &payload,
        expected_failsafe_delay,
    )
    .map_err(|err| {
        format!(
            "configuration bytes may have reached the target but persistent application was not proven; keep the rig disarmed and inspect it manually: {err}"
        )
    })?;
    drop(port);

    let mut port = reopen_serial_port_after_reboot(&request.port, request.baud).map_err(|err| {
        format!(
            "Betaflight confirmed the save but post-write reconnect failed; keep the rig disarmed and inspect it manually: {err}"
        )
    })?;
    let (post_write_identity, readback_line_sha256, readback_response_sha256) =
        verify_config_readback_session(
            port.as_mut(),
            &request.port,
            &pre_write_identity,
            expected_failsafe_delay,
        )
        .map_err(|err| {
            format!(
                "Betaflight confirmed the save but exact post-write readback failed; keep the rig disarmed and inspect it manually: {err}"
            )
        })?;
    serial_write_receipt(
        request,
        rig_id,
        payload.len(),
        VerifiedSerialEvidence {
            readback_failsafe_delay_deciseconds: expected_failsafe_delay,
            pre_write_identity,
            application_response_sha256,
            post_write_identity,
            readback_line_sha256,
            readback_response_sha256,
        },
    )
}

fn prepare_serial_write(
    request: &SerialWriteRequest,
    gate_enabled: bool,
) -> Result<(String, Vec<u8>, u16), String> {
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
    let failsafe_delay = artifact_failsafe_delay(&request.config_artifact)?;
    Ok((rig_id.to_string(), payload, failsafe_delay))
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

fn reopen_serial_port_after_reboot(
    requested_port: &str,
    baud: u32,
) -> Result<Box<dyn serialport::SerialPort>, String> {
    thread::sleep(SERIAL_REBOOT_SETTLE);
    let deadline = std::time::Instant::now() + SERIAL_RECONNECT_DEADLINE;
    let mut last_open_error = None;
    let mut last_enumeration_error = None;
    let mut enumerated_successfully = false;
    while std::time::Instant::now() < deadline {
        let available = match serialport::available_ports() {
            Ok(available) => {
                enumerated_successfully = true;
                available
            }
            Err(err) => {
                last_enumeration_error = Some(err.to_string());
                thread::sleep(Duration::from_millis(100));
                continue;
            }
        };
        if available
            .iter()
            .any(|candidate| candidate.port_name == requested_port)
        {
            match serialport::new(requested_port, baud)
                .timeout(SERIAL_READ_TIMEOUT)
                .open()
            {
                Ok(port) => return Ok(port),
                Err(err) => last_open_error = Some(err.to_string()),
            }
        }
        thread::sleep(Duration::from_millis(100));
    }
    match last_open_error {
        Some(err) => Err(format!(
            "serial port '{requested_port}' reappeared but could not be reopened within {} seconds: {err}",
            SERIAL_RECONNECT_DEADLINE.as_secs()
        )),
        None if !enumerated_successfully => Err(format!(
            "serial ports could not be enumerated within {} seconds after Betaflight reboot: {}",
            SERIAL_RECONNECT_DEADLINE.as_secs(),
            last_enumeration_error.as_deref().unwrap_or("unknown error")
        )),
        None => Err(format!(
            "serial port '{requested_port}' did not reappear within {} seconds",
            SERIAL_RECONNECT_DEADLINE.as_secs()
        )),
    }
}

fn serial_write_receipt(
    request: SerialWriteRequest,
    rig_id: String,
    bytes_transmitted: usize,
    evidence: VerifiedSerialEvidence,
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
        target_firmware_version: evidence.pre_write_identity.firmware_version,
        pre_write_reported_firmware_identity_sha256: evidence.pre_write_identity.identity_sha256,
        post_write_reported_firmware_identity_sha256: evidence.post_write_identity.identity_sha256,
        pre_write_version_response_sha256: evidence.pre_write_identity.response_sha256,
        application_response_sha256: evidence.application_response_sha256,
        post_write_version_response_sha256: evidence.post_write_identity.response_sha256,
        readback_failsafe_delay_deciseconds: evidence.readback_failsafe_delay_deciseconds,
        readback_line_sha256: evidence.readback_line_sha256,
        readback_response_sha256: evidence.readback_response_sha256,
        no_auto_arm: true,
        target_firmware_version_verified: true,
        application_verified: true,
        operator_readback_required: false,
        cli_left_arming_disabled: true,
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
    use serialport::SerialPort;
    use std::io::{Read, Write};

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

    fn version_response(version: &str) -> Vec<u8> {
        format!(
            "version\r\n# Betaflight / KAKUTEH7 (KH7) {version} Jun 28 2026 / 12:00:00 (abcdef0) MSP API: 1.47\r\n# "
        )
        .into_bytes()
    }

    #[cfg(unix)]
    fn spawn_fake_betaflight(
        mut master: serialport::TTYPort,
        steps: Vec<(Vec<u8>, Vec<u8>)>,
    ) -> std::thread::JoinHandle<()> {
        std::thread::spawn(move || {
            master
                .set_timeout(Duration::from_secs(2))
                .expect("fake target timeout");
            for (expected, response) in steps {
                let mut actual = vec![0_u8; expected.len()];
                master
                    .read_exact(&mut actual)
                    .expect("read exact CLI request from Desktop");
                assert_eq!(actual, expected);
                master
                    .write_all(&response)
                    .expect("write fake Betaflight response");
            }
            std::thread::sleep(Duration::from_millis(50));
        })
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

        let mut request = serial_request("pseudo-terminal".to_string(), artifact);
        request.physical_confirmation =
            "I understand this will write hardware configuration".to_string();
        assert!(prepare_serial_write(&request, true)
            .expect_err("pre-D49 confirmation must fail")
            .contains("confirmation phrase mismatch"));
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
    fn native_serial_protocol_uses_two_real_pseudo_terminal_sessions_and_exact_readback() {
        let artifact = bridge_config(vec![
            "# FORGE generated betaflight 2025.12 config diff",
            "set failsafe_delay = 10",
            "save",
        ]);
        let request = serial_request("pseudo-terminal".to_string(), artifact);
        let (rig_id, payload, expected_failsafe_delay) =
            prepare_serial_write(&request, true).expect("prepared write");
        let expected_version_response = version_response("2025.12.5");
        let expected_application_response = b"failsafe_delay set to 10\r\n# saving".to_vec();
        let expected_readback_response =
            b"get failsafe_delay\r\nfailsafe_delay = 10\r\nAllowed range: 1 - 200\r\n# ".to_vec();

        let (pre_master, mut pre_slave) =
            serialport::TTYPort::pair().expect("pre-write pseudo terminal pair");
        pre_slave
            .set_timeout(SERIAL_READ_TIMEOUT)
            .expect("pre-write timeout");
        let pre_target = spawn_fake_betaflight(
            pre_master,
            vec![
                (
                    b"#\r\n".to_vec(),
                    b"\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'\r\n# ".to_vec(),
                ),
                (b"version\r\n".to_vec(), expected_version_response.clone()),
                (payload.clone(), expected_application_response.clone()),
            ],
        );
        let pre_write_identity = verify_target_firmware_session(&mut pre_slave, "pseudo-terminal")
            .expect("pre-write identity");
        let application_response_sha256 = apply_config_session(
            &mut pre_slave,
            "pseudo-terminal",
            &payload,
            expected_failsafe_delay,
        )
        .expect("target confirms set and save");
        drop(pre_slave);
        pre_target.join().expect("pre-write target completes");

        let (post_master, mut post_slave) =
            serialport::TTYPort::pair().expect("post-write pseudo terminal pair");
        post_slave
            .set_timeout(SERIAL_READ_TIMEOUT)
            .expect("post-write timeout");
        let post_target = spawn_fake_betaflight(
            post_master,
            vec![
                (
                    b"#\r\n".to_vec(),
                    b"\r\nEntering CLI Mode, type 'exit' to reboot, or 'help'\r\n# ".to_vec(),
                ),
                (b"version\r\n".to_vec(), expected_version_response.clone()),
                (
                    b"get failsafe_delay\r\n".to_vec(),
                    expected_readback_response.clone(),
                ),
            ],
        );
        let (post_write_identity, readback_line_sha256, readback_response_sha256) =
            verify_config_readback_session(
                &mut post_slave,
                "pseudo-terminal",
                &pre_write_identity,
                expected_failsafe_delay,
            )
            .expect("post-write readback");
        drop(post_slave);
        post_target.join().expect("post-write target completes");

        let receipt = serial_write_receipt(
            request,
            rig_id,
            payload.len(),
            VerifiedSerialEvidence {
                readback_failsafe_delay_deciseconds: expected_failsafe_delay,
                pre_write_identity,
                application_response_sha256,
                post_write_identity,
                readback_line_sha256,
                readback_response_sha256,
            },
        )
        .expect("receipt");
        assert_eq!(receipt.schema_version, "forge-bridge-serial-receipt/2.0.0");
        assert_eq!(receipt.bytes_transmitted, payload.len());
        assert_eq!(receipt.target_firmware_version, "2025.12.5");
        assert_eq!(receipt.readback_failsafe_delay_deciseconds, 10);
        assert_eq!(
            receipt.pre_write_reported_firmware_identity_sha256,
            receipt.post_write_reported_firmware_identity_sha256
        );
        assert_eq!(
            receipt.pre_write_version_response_sha256,
            sha256_hex(&expected_version_response)
        );
        assert_eq!(
            receipt.application_response_sha256,
            sha256_hex(&expected_application_response)
        );
        assert_eq!(
            receipt.post_write_version_response_sha256,
            sha256_hex(&expected_version_response)
        );
        assert_eq!(
            receipt.readback_line_sha256,
            sha256_hex(b"failsafe_delay = 10")
        );
        assert_eq!(
            receipt.readback_response_sha256,
            sha256_hex(&expected_readback_response)
        );
        for digest in [
            &receipt.pre_write_version_response_sha256,
            &receipt.application_response_sha256,
            &receipt.post_write_version_response_sha256,
            &receipt.readback_line_sha256,
            &receipt.readback_response_sha256,
        ] {
            assert_eq!(digest.len(), 64);
            assert!(digest.bytes().all(|byte| byte.is_ascii_hexdigit()));
        }
        assert!(receipt.no_auto_arm);
        assert!(receipt.target_firmware_version_verified);
        assert!(receipt.application_verified);
        assert!(!receipt.operator_readback_required);
        assert!(receipt.cli_left_arming_disabled);
    }

    #[cfg(unix)]
    #[test]
    fn serial_response_limits_refuse_timeout_and_oversize() {
        let (_idle_master, mut idle_slave) =
            serialport::TTYPort::pair().expect("idle pseudo terminal pair");
        idle_slave
            .set_timeout(Duration::from_millis(5))
            .expect("idle timeout");
        assert!(read_serial_response_with_limits(
            &mut idle_slave,
            "idle-target",
            SerialResponseTerminator::Prompt,
            Duration::from_millis(30),
            MAX_SERIAL_RESPONSE_BYTES,
        )
        .expect_err("silent target must time out")
        .contains("timed out"));

        let (mut noisy_master, mut noisy_slave) =
            serialport::TTYPort::pair().expect("noisy pseudo terminal pair");
        noisy_slave
            .set_timeout(Duration::from_millis(5))
            .expect("noisy timeout");
        let writer = std::thread::spawn(move || {
            noisy_master
                .write_all(b"1234\n")
                .expect("write oversized response");
            std::thread::sleep(Duration::from_millis(100));
        });
        let oversized_error = read_serial_response_with_limits(
            &mut noisy_slave,
            "noisy-target",
            SerialResponseTerminator::Prompt,
            Duration::from_millis(100),
            4,
        )
        .expect_err("oversized response must fail");
        assert!(
            oversized_error.contains("exceeds 4 bytes"),
            "unexpected oversize error: {oversized_error}"
        );
        writer.join().expect("noisy writer completes");
    }

    #[test]
    fn target_identity_and_readback_parsers_refuse_drift_or_ambiguity() {
        assert!(!response_has_terminator(
            b"version\r\n# Betaflight / KAKUTEH7",
            SerialResponseTerminator::Prompt,
        ));
        assert!(response_has_terminator(
            b"version\r\n# Betaflight / KAKUTEH7 (KH7) 2025.12.5 x / y (abcdef0) MSP API: 1.47\r\n# ",
            SerialResponseTerminator::Prompt,
        ));
        assert!(
            parse_target_firmware_identity(&version_response("2026.6.0"))
                .expect_err("wrong firmware family must fail")
                .contains("stable Betaflight 2025.12")
        );

        let mut ambiguous = version_response("2025.12.5");
        ambiguous.extend_from_slice(
            b"\r\n# Betaflight / OTHER (OTHER) 2025.12.5 Jun 28 2026 / 12:00:00 (1234567) MSP API: 1.47\r\n# ",
        );
        assert!(parse_target_firmware_identity(&ambiguous)
            .expect_err("duplicate identity must fail")
            .contains("exactly one Betaflight identity"));

        assert!(parse_failsafe_readback(b"failsafe_delay = 11\r\n# ", 10)
            .expect_err("mismatch must fail")
            .contains("expected 10, observed 11"));
        assert!(
            parse_failsafe_readback(b"failsafe_delay = 10\r\nfailsafe_delay = 10\r\n# ", 10,)
                .expect_err("duplicate readback must fail")
                .contains("exactly one failsafe_delay readback")
        );
        assert!(parse_config_application_confirmation(
            b"failsafe_delay set to 10\r\n# ERROR: save failed\r\n# saving",
            10,
        )
        .expect_err("target error must fail")
        .contains("rejected"));
        assert!(normalized_response_lines(b"version\0\r\n# ")
            .expect_err("control bytes must fail")
            .contains("control bytes"));
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
