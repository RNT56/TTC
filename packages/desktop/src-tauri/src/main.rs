#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![cfg_attr(test, allow(dead_code))]

mod custody;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use custody::{
    load_and_verify_authorization, write_custody_proof, CustodyBindingInputs,
    RecorderCustodyAuthorization, RecorderCustodyProof, RecorderCustodyProofInputs,
    VerifiedCustodyAuthorization,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    env,
    fs::{self, File, OpenOptions},
    io::{BufRead, BufReader, BufWriter, Read, Write},
    path::{Path, PathBuf},
    sync::{mpsc, Mutex, OnceLock},
    thread::{self, JoinHandle},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const HARDWARE_ENV: &str = "FORGE_DESKTOP_ENABLE_HARDWARE";
const D30_LAB_SIGNOFF_ENV: &str = "FORGE_DESKTOP_D30_LAB_SIGNOFF";
const LAB_MODE_ENV: &str = "FORGE_HARDWARE_LAB_MODE";
const BRIDGE_CONFIG_SCHEMA_VERSION: &str = "forge-bridge-config/1.0.0";
const BRIDGE_SERIAL_RECEIPT_SCHEMA_VERSION: &str = "forge-bridge-serial-receipt/2.0.0";
const RECORDER_ARCHIVE_SCHEMA_VERSION: &str = "forge-recorder-archive/1.0.0";
const RECORDER_FRAME_SCHEMA_VERSION: &str = "forge-telemetry-frame/1.0.0";
const RECORDER_RECEIPT_SCHEMA_VERSION: &str = "forge-recorder-receipt/1.0.0";
const RECORDER_INSPECTION_SCHEMA_VERSION: &str = "forge-recorder-inspection/1.0.0";
const RECORDER_CONTROL_SCHEMA_VERSION: &str = "forge-recorder-control/1.0.0";
const RECORDER_UPLOAD_PLAN_SCHEMA_VERSION: &str = "forge-recorder-upload-plan/1.0.0";
const RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION: &str = "forge-recorder-upload/1.0.0";
const RECORDER_ADAPTER_PROBE_SCHEMA_VERSION: &str = "forge-recorder-adapter-probe/1.0.0";
const RECORDER_ADAPTER_SCHEMA_VERSION: &str = "forge-betaflight-msp-adapter/1.0.0";
const RECORDER_CUSTODY_TRUST_BUNDLE_SCHEMA_VERSION: &str =
    "forge-recorder-custody-trust-bundle/1.0.0";
const RECORDER_CUSTODY_AUTHORIZATION_SCHEMA_VERSION: &str =
    "forge-recorder-custody-authorization/1.0.0";
const RECORDER_CUSTODY_PROOF_SCHEMA_VERSION: &str = "forge-recorder-custody-proof/1.0.0";
const RECORDER_CUSTODY_PURPOSE: &str = "controlled-lab-recorder-custody";
const RECORDER_CUSTODY_TRUST_BUNDLE_ENV: &str = "FORGE_DESKTOP_RECORDER_CUSTODY_TRUST_BUNDLE";
const RECORDER_CUSTODY_TRUST_BUNDLE_SHA256_ENV: &str =
    "FORGE_DESKTOP_RECORDER_CUSTODY_TRUST_BUNDLE_SHA256";
const PROTECTED_REVISION_ENV: &str = "FORGE_DESKTOP_PROTECTED_REVISION";
const RECORDER_UPLOAD_ORIGIN_ENV: &str = "FORGE_DESKTOP_OBJECT_UPLOAD_ORIGIN";
const REPLAY_SCHEMA_VERSION: &str = "1.0.0";
const RECORDER_MANIFEST_FILE: &str = "forge-recorder-manifest.json";
const RECORDER_FRAME_FILE: &str = "telemetry.frames.jsonl";
const RECORDER_INDEX_FILE: &str = "telemetry.index.jsonl";
const RECORDER_REPLAY_FILE: &str = "telemetry.replay.json";
const RECORDER_RECEIPT_FILE: &str = "forge-recorder-receipt.json";
const BETAFLIGHT_CLI_VERSION: &str = "2025.12";
const SERIAL_PHYSICAL_CONFIRMATION: &str =
    "I confirm propellers are removed and understand this will write hardware configuration";
const RECORDER_PHYSICAL_CONFIRMATION: &str = "I consent to record this telemetry log";
const RECORDER_ADAPTER_PROBE_CONFIRMATION: &str =
    "I confirm propellers are removed and authorize a read-only adapter identity probe";
const BETAFLIGHT_SERIAL_BAUD: u32 = 115_200;
const BETAFLIGHT_FAILSAFE_DELAY_MIN_DS: u16 = 2;
const BETAFLIGHT_FAILSAFE_DELAY_MAX_DS: u16 = 200;
const MAX_CONFIG_BYTES: usize = 64 * 1024;
const MAX_SERIAL_RESPONSE_BYTES: usize = 16 * 1024;
const SERIAL_READ_TIMEOUT: Duration = Duration::from_millis(100);
const SERIAL_RESPONSE_DEADLINE: Duration = Duration::from_secs(3);
const SERIAL_REBOOT_SETTLE: Duration = Duration::from_secs(2);
const SERIAL_RECONNECT_DEADLINE: Duration = Duration::from_secs(15);
const RECORDER_READ_TIMEOUT: Duration = Duration::from_millis(100);
const MAX_RECORDER_FRAME_BYTES: usize = 64 * 1024;
const MAX_RECORDER_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const RECORDER_ARCHIVE_METADATA_RESERVE_BYTES: u64 = 1024 * 1024;
const MAX_RECORDER_FRAMES: u64 = 1_000_000;
const MAX_RECORDER_UPLOAD_URL_BYTES: usize = 8 * 1024;
const RECORDER_UPLOAD_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MSP_RESPONSE_DEADLINE: Duration = Duration::from_secs(3);
const MSP_PROTOCOL_VERSION: u8 = 0;
const MSP_API_MAJOR: u8 = 1;
const MSP_API_MINOR: u8 = 47;
const MSP_API_VERSION: u8 = 1;
const MSP_FC_VARIANT: u8 = 2;
const MSP_FC_VERSION: u8 = 3;
const MSP_BOARD_INFO: u8 = 4;
const MSP_BUILD_INFO: u8 = 5;
const MSP_UID: u8 = 160;
const READ_ONLY_MSP_COMMANDS: [u8; 6] = [
    MSP_API_VERSION,
    MSP_FC_VARIANT,
    MSP_FC_VERSION,
    MSP_BOARD_INFO,
    MSP_BUILD_INFO,
    MSP_UID,
];
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderAdapterProbeRequest {
    port: String,
    baud: u32,
    reference_rig_id: Option<String>,
    physical_confirmation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderAdapterProbe {
    schema_version: &'static str,
    adapter_schema_version: &'static str,
    probe_maturity: &'static str,
    reference_rig_id: String,
    source_port_sha256: String,
    os_descriptor_sha256: String,
    baud: u32,
    observed_at_unix_ms: u128,
    firmware: &'static str,
    firmware_version: String,
    msp_protocol_version: u8,
    msp_api_major: u8,
    msp_api_minor: u8,
    flight_controller_variant: String,
    board_identifier: String,
    target_name: String,
    board_name: String,
    manufacturer_id: String,
    device_uid_sha256: String,
    identity_sha256: String,
    pre_identity_response_sha256: String,
    post_identity_response_sha256: String,
    transcript_sha256: String,
    read_only_command_ids: Vec<u8>,
    adapter_protocol_verified: bool,
    stable_identity_observed: bool,
    device_identity_verified: bool,
    cryptographic_device_attestation: bool,
    recorded_device_attested: bool,
    field_session_verified: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    no_auto_arm: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MspIdentityObservation {
    firmware_version: String,
    flight_controller_variant: String,
    board_identifier: String,
    target_name: String,
    board_name: String,
    manufacturer_id: String,
    device_uid_sha256: String,
    identity_sha256: String,
    response_sha256: String,
    packets: Vec<Vec<u8>>,
}

#[derive(Debug, Clone)]
struct MspReply {
    raw: Vec<u8>,
    payload: Vec<u8>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MspIdentityBinding<'a> {
    schema_version: &'static str,
    firmware_version: &'a str,
    msp_protocol_version: u8,
    msp_api_major: u8,
    msp_api_minor: u8,
    flight_controller_variant: &'a str,
    board_identifier: &'a str,
    target_name: &'a str,
    board_name: &'a str,
    manufacturer_id: &'a str,
    device_uid_sha256: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OsSerialDescriptor<'a> {
    schema_version: &'static str,
    port_name: &'a str,
    kind: &'static str,
    usb_vid: Option<u16>,
    usb_pid: Option<u16>,
    usb_serial_number: Option<&'a str>,
    usb_manufacturer: Option<&'a str>,
    usb_product: Option<&'a str>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderRequest {
    artifact_id: String,
    output_dir: String,
    sample_rate_hz: u32,
    reference_rig_id: Option<String>,
    physical_confirmation: String,
    port: String,
    baud: u32,
    contract_hash: String,
    lockfile_hash: String,
    environment: serde_json::Value,
    seed: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderCustodyStartRequest {
    recorder: RecorderRequest,
    model_id: String,
    identity_port: String,
    identity_baud: u32,
    identity_physical_confirmation: String,
    authorization_path: String,
    custody_proof_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderCustodyStopRequest {
    authorization_id: String,
    physical_confirmation: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderArchiveManifest {
    schema_version: &'static str,
    replay_schema_version: &'static str,
    frame_schema_version: &'static str,
    receipt_schema_version: &'static str,
    artifact_id: String,
    reference_rig_id: String,
    sample_rate_hz: u32,
    started_at_unix_ms: u128,
    contract_hash: String,
    lockfile_hash: String,
    environment: serde_json::Value,
    seed: u64,
    source_kind: &'static str,
    source_port_sha256: String,
    source_baud: u32,
    capture_maturity: &'static str,
    recorded_device_attested: bool,
    frame_file: &'static str,
    index_file: &'static str,
    replay_file: String,
    receipt_file: &'static str,
    capture_consent_confirmed: bool,
    user_owned: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    no_auto_arm: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderTelemetryFrame {
    schema_version: String,
    artifact_id: String,
    sequence: u64,
    t: f64,
    state: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReplayFrame {
    t: f64,
    state: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderIndexEntry {
    sequence: u64,
    t: f64,
    byte_offset: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderControlStatus {
    schema_version: &'static str,
    state: &'static str,
    artifact_id: Option<String>,
    archive_path: Option<String>,
    manifest_path: Option<String>,
    reference_rig_id: Option<String>,
    contract_hash: Option<String>,
    lockfile_hash: Option<String>,
    source_port_sha256: Option<String>,
    source_baud: Option<u32>,
    sample_rate_hz: Option<u32>,
    started_at_unix_ms: Option<u128>,
    capture_maturity: Option<&'static str>,
    capture_consent_confirmed: bool,
    recorded_device_attested: bool,
    device_identity_verified: bool,
    field_session_verified: bool,
    user_owned: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    no_auto_arm: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderStopReceipt {
    schema_version: &'static str,
    archive_schema_version: &'static str,
    replay_schema_version: &'static str,
    frame_schema_version: &'static str,
    artifact_id: String,
    reference_rig_id: String,
    contract_hash: String,
    lockfile_hash: String,
    started_at_unix_ms: u128,
    stopped_at_unix_ms: u128,
    frame_count: u64,
    duration_s: f64,
    frame_file_sha256: String,
    index_file_sha256: String,
    replay_file_sha256: String,
    source_port_sha256: String,
    capture_complete: bool,
    capture_maturity: &'static str,
    capture_consent_confirmed: bool,
    recorded_device_attested: bool,
    user_owned: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    no_auto_arm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderArchiveManifestInput {
    schema_version: String,
    replay_schema_version: String,
    frame_schema_version: String,
    receipt_schema_version: String,
    artifact_id: String,
    reference_rig_id: String,
    sample_rate_hz: u32,
    started_at_unix_ms: u128,
    contract_hash: String,
    lockfile_hash: String,
    environment: serde_json::Value,
    seed: u64,
    source_kind: String,
    source_port_sha256: String,
    source_baud: u32,
    capture_maturity: String,
    recorded_device_attested: bool,
    frame_file: String,
    index_file: String,
    replay_file: String,
    receipt_file: String,
    capture_consent_confirmed: bool,
    user_owned: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    no_auto_arm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderStopReceiptInput {
    schema_version: String,
    archive_schema_version: String,
    replay_schema_version: String,
    frame_schema_version: String,
    artifact_id: String,
    reference_rig_id: String,
    contract_hash: String,
    lockfile_hash: String,
    started_at_unix_ms: u128,
    stopped_at_unix_ms: u128,
    frame_count: u64,
    duration_s: f64,
    frame_file_sha256: String,
    index_file_sha256: String,
    replay_file_sha256: String,
    source_port_sha256: String,
    capture_complete: bool,
    capture_maturity: String,
    capture_consent_confirmed: bool,
    recorded_device_attested: bool,
    user_owned: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    no_auto_arm: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderArchiveInspection {
    schema_version: &'static str,
    archive_schema_version: &'static str,
    replay_schema_version: &'static str,
    receipt_schema_version: &'static str,
    artifact_id: String,
    archive_path: String,
    replay_path: String,
    reference_rig_id: String,
    contract_hash: String,
    lockfile_hash: String,
    source_port_sha256: String,
    sample_rate_hz: u32,
    started_at_unix_ms: u128,
    stopped_at_unix_ms: u128,
    frame_count: u64,
    duration_s: f64,
    capture_maturity: String,
    integrity_verified: bool,
    capture_complete: bool,
    capture_consent_confirmed: bool,
    user_owned: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    recorded_device_attested: bool,
    device_identity_verified: bool,
    field_session_verified: bool,
    no_auto_arm: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderUploadFilePlan {
    name: &'static str,
    content_type: &'static str,
    byte_size: u64,
    sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderUploadPlan {
    schema_version: &'static str,
    archive_schema_version: &'static str,
    inspection_schema_version: &'static str,
    artifact_id: String,
    reference_rig_id: String,
    contract_hash: String,
    lockfile_hash: String,
    source_port_sha256: String,
    sample_rate_hz: u32,
    started_at_unix_ms: u128,
    stopped_at_unix_ms: u128,
    frame_count: u64,
    duration_s: f64,
    capture_maturity: String,
    aggregate_byte_size: u64,
    files: Vec<RecorderUploadFilePlan>,
    local_integrity_verified: bool,
    capture_complete: bool,
    capture_consent_confirmed: bool,
    user_owned: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    recorded_device_attested: bool,
    device_identity_verified: bool,
    field_session_verified: bool,
    no_auto_arm: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderUploadContract {
    name: String,
    method: String,
    url: String,
    headers: BTreeMap<String, String>,
    byte_size: u64,
    sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecorderUploadReceipt {
    schema_version: &'static str,
    upload_plan_schema_version: &'static str,
    artifact_id: String,
    uploaded_file_count: usize,
    uploaded_byte_size: u64,
    local_integrity_verified: bool,
    gateway_object_integrity_verified: bool,
    recorded_device_attested: bool,
    device_identity_verified: bool,
    field_session_verified: bool,
    sharing_authorized: bool,
    training_reuse_authorized: bool,
    no_auto_arm: bool,
}

struct ActiveRecorder {
    stop_tx: mpsc::Sender<()>,
    join: JoinHandle<Result<RecorderStopReceipt, String>>,
    status: RecorderControlStatus,
    custody: Option<ActiveRecorderCustody>,
}

struct ActiveRecorderCustody {
    verified: VerifiedCustodyAuthorization,
    authorization_path: PathBuf,
    archive_path: PathBuf,
    proof_path: PathBuf,
    model_id: String,
    telemetry_port: String,
    identity_port: String,
    identity_baud: u32,
    telemetry_start_os_descriptor_sha256: String,
    identity_start_os_descriptor_sha256: String,
    pre_probe: RecorderAdapterProbe,
}

#[derive(Clone, Copy)]
struct CustodyDeploymentAuthority<'a> {
    trust_bundle_path: &'a Path,
    trust_bundle_sha256: &'a str,
    protected_revision: &'a str,
    now_unix_ms: u64,
}

#[derive(Default)]
struct RecorderRuntime {
    active: Mutex<Option<ActiveRecorder>>,
}

static RECORDER_RUNTIME: OnceLock<RecorderRuntime> = OnceLock::new();

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

fn domain_sha256(domain: &[u8], bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(domain);
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn packet_set_sha256(domain: &[u8], packets: &[Vec<u8>]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(domain);
    for packet in packets {
        hasher.update((packet.len() as u32).to_be_bytes());
        hasher.update(packet);
    }
    format!("{:x}", hasher.finalize())
}

fn os_serial_descriptor_sha256(port: &serialport::SerialPortInfo) -> Result<String, String> {
    let descriptor = match &port.port_type {
        serialport::SerialPortType::UsbPort(info) => OsSerialDescriptor {
            schema_version: "forge-os-serial-descriptor/1.0.0",
            port_name: &port.port_name,
            kind: "usb",
            usb_vid: Some(info.vid),
            usb_pid: Some(info.pid),
            usb_serial_number: info.serial_number.as_deref(),
            usb_manufacturer: info.manufacturer.as_deref(),
            usb_product: info.product.as_deref(),
        },
        serialport::SerialPortType::BluetoothPort => OsSerialDescriptor {
            schema_version: "forge-os-serial-descriptor/1.0.0",
            port_name: &port.port_name,
            kind: "bluetooth",
            usb_vid: None,
            usb_pid: None,
            usb_serial_number: None,
            usb_manufacturer: None,
            usb_product: None,
        },
        serialport::SerialPortType::PciPort => OsSerialDescriptor {
            schema_version: "forge-os-serial-descriptor/1.0.0",
            port_name: &port.port_name,
            kind: "pci",
            usb_vid: None,
            usb_pid: None,
            usb_serial_number: None,
            usb_manufacturer: None,
            usb_product: None,
        },
        serialport::SerialPortType::Unknown => OsSerialDescriptor {
            schema_version: "forge-os-serial-descriptor/1.0.0",
            port_name: &port.port_name,
            kind: "unknown",
            usb_vid: None,
            usb_pid: None,
            usb_serial_number: None,
            usb_manufacturer: None,
            usb_product: None,
        },
    };
    let bytes = serde_json::to_vec(&descriptor)
        .map_err(|err| format!("serialize OS serial descriptor: {err}"))?;
    Ok(domain_sha256(b"forge-os-serial-descriptor/1.0.0\0", &bytes))
}

fn recorder_source_port_sha256(port: &str) -> String {
    domain_sha256(b"forge-recorder-source-port/1.0.0\0", port.as_bytes())
}

fn enumerated_port_descriptor_sha256(
    ports: &[serialport::SerialPortInfo],
    requested: &str,
    role: &str,
) -> Result<String, String> {
    let descriptor = ports
        .iter()
        .find(|candidate| candidate.port_name == requested)
        .ok_or_else(|| {
            format!("recorder custody {role} port must be reported by the operating system")
        })?;
    os_serial_descriptor_sha256(descriptor)
}

fn validate_adapter_probe_request(
    request: &RecorderAdapterProbeRequest,
    gate_enabled: bool,
) -> Result<String, String> {
    if !gate_enabled {
        return Err(
            "native adapter identity probing requires the hardware-enable, D30-signoff, and lab-mode gates"
                .to_string(),
        );
    }
    if request.physical_confirmation != RECORDER_ADAPTER_PROBE_CONFIRMATION {
        return Err("adapter identity probe props-off confirmation phrase mismatch".to_string());
    }
    if request.port.trim().is_empty() || request.port.len() > 4_096 {
        return Err("adapter identity probe requires a bounded non-empty serial port".to_string());
    }
    if request.baud != BETAFLIGHT_SERIAL_BAUD {
        return Err(format!(
            "adapter identity probe requires exactly {BETAFLIGHT_SERIAL_BAUD} baud"
        ));
    }
    let rig_id = request.reference_rig_id.as_deref().ok_or_else(|| {
        "referenceRigId is required for the D12 Betaflight adapter probe".to_string()
    })?;
    if rig_id != D12_RIGS[0] {
        return Err("Betaflight MSP adapter v1 is limited to the D12 reference quad".to_string());
    }
    Ok(rig_id.to_string())
}

fn msp_v1_request(command: u8) -> Result<[u8; 6], String> {
    if !READ_ONLY_MSP_COMMANDS.contains(&command) {
        return Err(
            "MSP adapter probe attempted a command outside the read-only allowlist".to_string(),
        );
    }
    Ok([b'$', b'M', b'<', 0, command, command])
}

fn read_exact_before_deadline(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
    size: usize,
    deadline: std::time::Instant,
) -> Result<Vec<u8>, String> {
    let mut bytes = vec![0_u8; size];
    let mut offset = 0;
    while offset < size && std::time::Instant::now() < deadline {
        match port.read(&mut bytes[offset..]) {
            Ok(0) => thread::sleep(Duration::from_millis(2)),
            Ok(count) => offset += count,
            Err(err)
                if matches!(
                    err.kind(),
                    std::io::ErrorKind::TimedOut
                        | std::io::ErrorKind::WouldBlock
                        | std::io::ErrorKind::Interrupted
                ) => {}
            Err(err) => {
                return Err(format!(
                    "read MSP adapter response from '{port_label}': {err}"
                ));
            }
        }
    }
    if offset != size {
        return Err(format!(
            "timed out waiting for a complete bounded MSP adapter response from '{port_label}'"
        ));
    }
    Ok(bytes)
}

fn query_msp_v1(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
    command: u8,
) -> Result<MspReply, String> {
    let request = msp_v1_request(command)?;
    port.write_all(&request)
        .map_err(|err| format!("write read-only MSP request to '{port_label}': {err}"))?;
    port.flush()
        .map_err(|err| format!("flush read-only MSP request to '{port_label}': {err}"))?;

    let deadline = std::time::Instant::now() + MSP_RESPONSE_DEADLINE;
    let header = read_exact_before_deadline(port, port_label, 5, deadline)?;
    if header[..3] != *b"$M>" {
        return Err("MSP adapter response has an invalid or error direction header".to_string());
    }
    let payload_size = header[3] as usize;
    if header[4] != command {
        return Err("MSP adapter response command does not match the active request".to_string());
    }
    let tail = read_exact_before_deadline(port, port_label, payload_size + 1, deadline)?;
    let mut checksum = header[3] ^ header[4];
    for byte in &tail[..payload_size] {
        checksum ^= byte;
    }
    if checksum != tail[payload_size] {
        return Err("MSP adapter response checksum is invalid".to_string());
    }
    let mut raw = header;
    raw.extend_from_slice(&tail);
    Ok(MspReply {
        raw,
        payload: tail[..payload_size].to_vec(),
    })
}

fn bounded_ascii(
    bytes: &[u8],
    label: &str,
    minimum: usize,
    maximum: usize,
) -> Result<String, String> {
    if bytes.len() < minimum
        || bytes.len() > maximum
        || !bytes
            .iter()
            .all(|byte| byte.is_ascii_graphic() || *byte == b' ')
    {
        return Err(format!(
            "MSP {label} is outside its bounded printable ASCII contract"
        ));
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| format!("MSP {label} is not UTF-8"))
}

fn parse_pstring(
    payload: &[u8],
    offset: usize,
    label: &str,
    minimum: usize,
    maximum: usize,
) -> Result<(String, usize), String> {
    let length = *payload
        .get(offset)
        .ok_or_else(|| format!("MSP {label} length is missing"))? as usize;
    let start = offset + 1;
    let end = start
        .checked_add(length)
        .filter(|end| *end <= payload.len())
        .ok_or_else(|| format!("MSP {label} is truncated"))?;
    Ok((
        bounded_ascii(&payload[start..end], label, minimum, maximum)?,
        end,
    ))
}

fn parse_firmware_version(payload: &[u8]) -> Result<String, String> {
    if payload.len() < 4 || payload[0] != 25 || payload[1] != 12 {
        return Err("MSP adapter probe requires stable Betaflight 2025.12.x".to_string());
    }
    let patch = payload[2];
    let (version, end) = parse_pstring(payload, 3, "firmware version", 9, 32)?;
    let expected = format!("2025.12.{patch}");
    if end != payload.len() || version != expected {
        return Err("MSP firmware version bytes and version string disagree".to_string());
    }
    Ok(version)
}

fn parse_board_info(payload: &[u8]) -> Result<(String, String, String, String), String> {
    if payload.len() < 8 {
        return Err("MSP board information is truncated before target identity".to_string());
    }
    if !payload[..4]
        .iter()
        .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || matches!(*byte, 0 | b' '))
    {
        return Err("MSP board identifier contains unsupported bytes".to_string());
    }
    let board_identifier = String::from_utf8(payload[..4].to_vec())
        .map_err(|_| "MSP board identifier is not UTF-8".to_string())?
        .trim_matches(|character| character == '\0' || character == ' ')
        .to_string();
    if board_identifier.is_empty()
        || !board_identifier
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
    {
        return Err("MSP board identifier is not uppercase alphanumeric".to_string());
    }
    let (target_name, offset) = parse_pstring(payload, 8, "target name", 1, 64)?;
    let (board_name, offset) = parse_pstring(payload, offset, "board name", 1, 64)?;
    let (manufacturer_id, offset) = parse_pstring(payload, offset, "manufacturer ID", 1, 32)?;
    if target_name != "KAKUTEH7" {
        return Err("MSP adapter v1 requires the reviewed KAKUTEH7 target".to_string());
    }
    if payload.len().saturating_sub(offset) != 42 {
        return Err(
            "MSP board information must have the exact API 1.47 signature/status tail".to_string(),
        );
    }
    Ok((board_identifier, target_name, board_name, manufacturer_id))
}

fn validate_build_info(payload: &[u8]) -> Result<(), String> {
    if payload.len() < 26
        || !(payload.len() - 26).is_multiple_of(2)
        || !payload[..19]
            .iter()
            .all(|byte| byte.is_ascii_graphic() || *byte == b' ')
        || !payload[19..26]
            .iter()
            .all(|byte| byte.is_ascii_digit() || matches!(*byte, b'a'..=b'f'))
    {
        return Err("MSP build information is truncated or malformed".to_string());
    }
    Ok(())
}

fn observe_msp_identity(
    port: &mut dyn serialport::SerialPort,
    port_label: &str,
) -> Result<MspIdentityObservation, String> {
    let replies = READ_ONLY_MSP_COMMANDS
        .iter()
        .map(|command| query_msp_v1(port, port_label, *command))
        .collect::<Result<Vec<_>, _>>()?;
    if replies[0].payload != [MSP_PROTOCOL_VERSION, MSP_API_MAJOR, MSP_API_MINOR] {
        return Err("MSP adapter probe requires protocol 0 and API 1.47".to_string());
    }
    let flight_controller_variant =
        bounded_ascii(&replies[1].payload, "flight-controller variant", 4, 4)?;
    if flight_controller_variant != "BTFL" {
        return Err("MSP adapter probe requires the Betaflight BTFL variant".to_string());
    }
    let firmware_version = parse_firmware_version(&replies[2].payload)?;
    let (board_identifier, target_name, board_name, manufacturer_id) =
        parse_board_info(&replies[3].payload)?;
    validate_build_info(&replies[4].payload)?;
    if replies[5].payload.len() != 12
        || replies[5].payload.iter().all(|byte| *byte == 0)
        || replies[5].payload.iter().all(|byte| *byte == u8::MAX)
    {
        return Err("MSP UID must be one non-placeholder 96-bit device observation".to_string());
    }
    let device_uid_sha256 =
        domain_sha256(b"forge-recorder-device-uid/1.0.0\0", &replies[5].payload);
    let binding = MspIdentityBinding {
        schema_version: RECORDER_ADAPTER_SCHEMA_VERSION,
        firmware_version: &firmware_version,
        msp_protocol_version: MSP_PROTOCOL_VERSION,
        msp_api_major: MSP_API_MAJOR,
        msp_api_minor: MSP_API_MINOR,
        flight_controller_variant: &flight_controller_variant,
        board_identifier: &board_identifier,
        target_name: &target_name,
        board_name: &board_name,
        manufacturer_id: &manufacturer_id,
        device_uid_sha256: &device_uid_sha256,
    };
    let binding_bytes = serde_json::to_vec(&binding)
        .map_err(|err| format!("serialize MSP identity binding: {err}"))?;
    let packets = replies
        .into_iter()
        .map(|reply| reply.raw)
        .collect::<Vec<_>>();
    Ok(MspIdentityObservation {
        firmware_version,
        flight_controller_variant,
        board_identifier,
        target_name,
        board_name,
        manufacturer_id,
        device_uid_sha256,
        identity_sha256: domain_sha256(b"forge-recorder-adapter-identity/1.0.0\0", &binding_bytes),
        response_sha256: packet_set_sha256(
            b"forge-recorder-adapter-response-set/1.0.0\0",
            &packets,
        ),
        packets,
    })
}

fn probe_recorder_adapter_with_port(
    request: RecorderAdapterProbeRequest,
    gate_enabled: bool,
    os_descriptor_sha256: String,
    mut port: Box<dyn serialport::SerialPort>,
) -> Result<RecorderAdapterProbe, String> {
    let rig_id = validate_adapter_probe_request(&request, gate_enabled)?;
    if !is_sha256_hex(&os_descriptor_sha256) {
        return Err("OS serial descriptor identity must be a lowercase SHA-256".to_string());
    }
    let pre = observe_msp_identity(port.as_mut(), &request.port)?;
    let post = observe_msp_identity(port.as_mut(), &request.port)?;
    if pre != post {
        return Err(
            "MSP adapter identity changed between the required pre/post observations".to_string(),
        );
    }
    let mut transcript = pre.packets.clone();
    transcript.extend(post.packets.clone());
    Ok(RecorderAdapterProbe {
        schema_version: RECORDER_ADAPTER_PROBE_SCHEMA_VERSION,
        adapter_schema_version: RECORDER_ADAPTER_SCHEMA_VERSION,
        probe_maturity: "unattested-read-only-probe",
        reference_rig_id: rig_id,
        source_port_sha256: domain_sha256(
            b"forge-recorder-source-port/1.0.0\0",
            request.port.as_bytes(),
        ),
        os_descriptor_sha256,
        baud: request.baud,
        observed_at_unix_ms: unix_ms()?,
        firmware: "betaflight",
        firmware_version: pre.firmware_version,
        msp_protocol_version: MSP_PROTOCOL_VERSION,
        msp_api_major: MSP_API_MAJOR,
        msp_api_minor: MSP_API_MINOR,
        flight_controller_variant: pre.flight_controller_variant,
        board_identifier: pre.board_identifier,
        target_name: pre.target_name,
        board_name: pre.board_name,
        manufacturer_id: pre.manufacturer_id,
        device_uid_sha256: pre.device_uid_sha256,
        identity_sha256: pre.identity_sha256,
        pre_identity_response_sha256: pre.response_sha256.clone(),
        post_identity_response_sha256: post.response_sha256,
        transcript_sha256: packet_set_sha256(
            b"forge-recorder-adapter-transcript/1.0.0\0",
            &transcript,
        ),
        read_only_command_ids: READ_ONLY_MSP_COMMANDS.to_vec(),
        adapter_protocol_verified: true,
        stable_identity_observed: true,
        device_identity_verified: false,
        cryptographic_device_attestation: false,
        recorded_device_attested: false,
        field_session_verified: false,
        sharing_authorized: false,
        training_reuse_authorized: false,
        no_auto_arm: true,
    })
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

fn unix_ms() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| format!("system clock before UNIX_EPOCH: {err}"))
        .map(|duration| duration.as_millis())
}

fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn bounded_json_nodes(
    value: &serde_json::Value,
    depth: usize,
    nodes: &mut usize,
) -> Result<(), String> {
    if depth > 32 {
        return Err("recorder JSON exceeds the maximum depth of 32".to_string());
    }
    *nodes += 1;
    if *nodes > 2_048 {
        return Err("recorder JSON exceeds the maximum 2048 nodes per frame".to_string());
    }
    match value {
        serde_json::Value::Array(values) => {
            for child in values {
                bounded_json_nodes(child, depth + 1, nodes)?;
            }
        }
        serde_json::Value::Object(values) => {
            for child in values.values() {
                bounded_json_nodes(child, depth + 1, nodes)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_recorder_request(
    request: &RecorderRequest,
    port_is_enumerated: bool,
) -> Result<String, String> {
    if request.physical_confirmation != RECORDER_PHYSICAL_CONFIRMATION {
        return Err("telemetry consent phrase mismatch".to_string());
    }
    if request.artifact_id.is_empty()
        || request.artifact_id.len() > 128
        || !request
            .artifact_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(
            "artifactId must be 1..128 ASCII letters, digits, '.', '_', or '-'".to_string(),
        );
    }
    if request.output_dir.trim().is_empty() || request.output_dir.len() > 4_096 {
        return Err(
            "outputDir must be a non-empty absolute path of at most 4096 UTF-8 bytes".to_string(),
        );
    }
    if !Path::new(&request.output_dir).is_absolute() {
        return Err("outputDir must be absolute for a new recorder archive".to_string());
    }
    if !(1..=1_000).contains(&request.sample_rate_hz) {
        return Err("sampleRateHz must be an integer from 1 through 1000".to_string());
    }
    if request.port.trim().is_empty() || request.baud != BETAFLIGHT_SERIAL_BAUD {
        return Err(format!(
            "recorder serial capture requires a non-empty port and exactly {BETAFLIGHT_SERIAL_BAUD} baud"
        ));
    }
    if !port_is_enumerated {
        return Err("recorder serial port must be reported by the operating system".to_string());
    }
    if !is_sha256_hex(&request.contract_hash) || !is_sha256_hex(&request.lockfile_hash) {
        return Err("contractHash and lockfileHash must be lowercase SHA-256 values".to_string());
    }
    if !request.environment.is_object() {
        return Err("environment must be an object bound into the replay header".to_string());
    }
    let environment_bytes = serde_json::to_vec(&request.environment)
        .map_err(|err| format!("serialize recorder environment: {err}"))?;
    if environment_bytes.len() > MAX_RECORDER_FRAME_BYTES {
        return Err(format!(
            "recorder environment exceeds {MAX_RECORDER_FRAME_BYTES} bytes"
        ));
    }
    let mut nodes = 0;
    bounded_json_nodes(&request.environment, 0, &mut nodes)?;
    let rig_id = request.reference_rig_id.as_deref().ok_or_else(|| {
        "referenceRigId is required for native D12 lab hardware access".to_string()
    })?;
    require_d12_rig(Some(rig_id))?;
    Ok(rig_id.to_string())
}

fn valid_custody_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn validate_custody_start_request(request: &RecorderCustodyStartRequest) -> Result<(), String> {
    validate_recorder_request(&request.recorder, true)?;
    if request.recorder.reference_rig_id.as_deref() != Some(D12_RIGS[0]) {
        return Err("recorder custody v1 is limited to the D12 reference quad".to_string());
    }
    if !valid_custody_token(&request.model_id) {
        return Err("recorder custody modelId must be a bounded safe token".to_string());
    }
    if request.identity_physical_confirmation != RECORDER_ADAPTER_PROBE_CONFIRMATION {
        return Err("recorder custody start requires the exact props-off confirmation".to_string());
    }
    if request.identity_port.trim().is_empty()
        || request.identity_port.len() > 4_096
        || request.identity_baud != BETAFLIGHT_SERIAL_BAUD
    {
        return Err(format!(
            "recorder custody identity probing requires a bounded port at {BETAFLIGHT_SERIAL_BAUD} baud"
        ));
    }
    if request.identity_port == request.recorder.port {
        return Err("recorder custody requires distinct telemetry and identity ports".to_string());
    }
    for (label, path) in [
        ("authorizationPath", request.authorization_path.as_str()),
        ("custodyProofPath", request.custody_proof_path.as_str()),
    ] {
        if path.trim().is_empty() || path.len() > 4_096 || !Path::new(path).is_absolute() {
            return Err(format!(
                "recorder custody {label} must be an absolute path of at most 4096 bytes"
            ));
        }
    }
    if Path::new(&request.custody_proof_path).starts_with(&request.recorder.output_dir) {
        return Err("recorder custody proof must remain outside the five-file archive".to_string());
    }
    Ok(())
}

fn custody_deployment_authority() -> Result<(PathBuf, String, String), String> {
    let trust_bundle_path = env::var(RECORDER_CUSTODY_TRUST_BUNDLE_ENV).map_err(|_| {
        format!("{RECORDER_CUSTODY_TRUST_BUNDLE_ENV} is required for recorder custody")
    })?;
    let trust_bundle_sha256 = env::var(RECORDER_CUSTODY_TRUST_BUNDLE_SHA256_ENV).map_err(|_| {
        format!("{RECORDER_CUSTODY_TRUST_BUNDLE_SHA256_ENV} is required for recorder custody")
    })?;
    let protected_revision = env::var(PROTECTED_REVISION_ENV)
        .map_err(|_| format!("{PROTECTED_REVISION_ENV} is required for recorder custody"))?;
    if !Path::new(&trust_bundle_path).is_absolute() {
        return Err("recorder custody deployment trust-bundle path must be absolute".to_string());
    }
    if !is_sha256_hex(&trust_bundle_sha256)
        || protected_revision.len() != 40
        || !protected_revision
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(
            "recorder custody deployment pin or protected revision is malformed".to_string(),
        );
    }
    Ok((
        PathBuf::from(trust_bundle_path),
        trust_bundle_sha256,
        protected_revision,
    ))
}

fn create_new_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let mut bytes = serde_json::to_vec_pretty(value)
        .map_err(|err| format!("serialize '{}': {err}", path.display()))?;
    bytes.push(b'\n');
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|err| format!("create '{}': {err}", path.display()))?;
    file.write_all(&bytes)
        .map_err(|err| format!("write '{}': {err}", path.display()))?;
    file.sync_all()
        .map_err(|err| format!("sync '{}': {err}", path.display()))
}

fn create_recorder_archive(
    request: &RecorderRequest,
    rig_id: &str,
) -> Result<(RecorderArchiveManifest, File, File), String> {
    let output_dir = Path::new(&request.output_dir);
    fs::create_dir(output_dir).map_err(|err| {
        format!(
            "create exclusive recorder archive '{}': {err}",
            output_dir.display()
        )
    })?;
    let result = (|| {
        let manifest = RecorderArchiveManifest {
            schema_version: RECORDER_ARCHIVE_SCHEMA_VERSION,
            replay_schema_version: REPLAY_SCHEMA_VERSION,
            frame_schema_version: RECORDER_FRAME_SCHEMA_VERSION,
            receipt_schema_version: RECORDER_RECEIPT_SCHEMA_VERSION,
            artifact_id: request.artifact_id.clone(),
            reference_rig_id: rig_id.to_string(),
            sample_rate_hz: request.sample_rate_hz,
            started_at_unix_ms: unix_ms()?,
            contract_hash: request.contract_hash.clone(),
            lockfile_hash: request.lockfile_hash.clone(),
            environment: request.environment.clone(),
            seed: request.seed,
            source_kind: "serial-jsonl",
            source_port_sha256: sha256_hex(request.port.as_bytes()),
            source_baud: request.baud,
            capture_maturity: "local-serial-integration",
            recorded_device_attested: false,
            frame_file: RECORDER_FRAME_FILE,
            index_file: RECORDER_INDEX_FILE,
            replay_file: RECORDER_REPLAY_FILE.to_string(),
            receipt_file: RECORDER_RECEIPT_FILE,
            capture_consent_confirmed: true,
            user_owned: true,
            sharing_authorized: false,
            training_reuse_authorized: false,
            no_auto_arm: true,
        };
        create_new_json(&output_dir.join(RECORDER_MANIFEST_FILE), &manifest)?;
        let frames = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(output_dir.join(manifest.frame_file))
            .map_err(|err| format!("create recorder frame file: {err}"))?;
        let index = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(output_dir.join(manifest.index_file))
            .map_err(|err| format!("create recorder index file: {err}"))?;
        Ok((manifest, frames, index))
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(output_dir);
    }
    result
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|err| format!("open '{}': {err}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|err| format!("read '{}': {err}", path.display()))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[derive(Default)]
struct RecorderProgress {
    frame_count: u64,
    frame_bytes: u64,
    index_bytes: u64,
    first_t: Option<f64>,
    last_t: Option<f64>,
    last_index: Option<RecorderIndexEntry>,
    last_indexed_sequence: Option<u64>,
}

fn append_index_entry(
    entry: &RecorderIndexEntry,
    writer: &mut BufWriter<File>,
) -> Result<u64, String> {
    let mut bytes = serde_json::to_vec(entry)
        .map_err(|err| format!("serialize recorder index entry: {err}"))?;
    bytes.push(b'\n');
    writer
        .write_all(&bytes)
        .map_err(|err| format!("write recorder index entry: {err}"))?;
    Ok(bytes.len() as u64)
}

fn append_recorder_frame(
    line: &[u8],
    request: &RecorderRequest,
    index_stride: u64,
    frame_writer: &mut BufWriter<File>,
    index_writer: &mut BufWriter<File>,
    progress: &mut RecorderProgress,
) -> Result<(), String> {
    if line.is_empty() {
        return Err("recorder telemetry stream contains an empty frame".to_string());
    }
    if line.len() > MAX_RECORDER_FRAME_BYTES {
        return Err(format!(
            "recorder telemetry frame exceeds {MAX_RECORDER_FRAME_BYTES} bytes"
        ));
    }
    if progress.frame_count >= MAX_RECORDER_FRAMES {
        return Err(format!(
            "recorder archive exceeds the {MAX_RECORDER_FRAMES}-frame safety cap"
        ));
    }
    let input: RecorderTelemetryFrame = serde_json::from_slice(line)
        .map_err(|err| format!("parse recorder telemetry frame: {err}"))?;
    if input.schema_version != RECORDER_FRAME_SCHEMA_VERSION {
        return Err(format!(
            "unsupported recorder telemetry frame schema {}; expected {RECORDER_FRAME_SCHEMA_VERSION}",
            input.schema_version
        ));
    }
    if input.artifact_id != request.artifact_id {
        return Err(
            "recorder telemetry frame artifactId does not match the active archive".to_string(),
        );
    }
    if input.sequence != progress.frame_count {
        return Err(format!(
            "recorder telemetry sequence must be exact and contiguous: expected {}, observed {}",
            progress.frame_count, input.sequence
        ));
    }
    if !input.t.is_finite() {
        return Err("recorder telemetry time must be finite".to_string());
    }
    if progress.last_t.is_some_and(|last| input.t <= last) {
        return Err("recorder telemetry time must be strictly increasing".to_string());
    }
    if !input.state.is_object() {
        return Err("recorder telemetry state must be an object".to_string());
    }
    let mut nodes = 0;
    bounded_json_nodes(&input.state, 0, &mut nodes)?;

    let frame = ReplayFrame {
        t: input.t,
        state: input.state,
    };
    let mut bytes = serde_json::to_vec(&frame)
        .map_err(|err| format!("serialize recorder replay frame: {err}"))?;
    bytes.push(b'\n');
    let next_size = progress
        .frame_bytes
        .checked_add(bytes.len() as u64)
        .ok_or_else(|| "recorder archive byte count overflow".to_string())?;
    let entry = RecorderIndexEntry {
        sequence: input.sequence,
        t: input.t,
        byte_offset: progress.frame_bytes,
    };
    let index_entry_bytes = if input.sequence.is_multiple_of(index_stride) {
        serde_json::to_vec(&entry)
            .map_err(|err| format!("serialize recorder index entry: {err}"))?
            .len() as u64
            + 1
    } else {
        0
    };
    let next_index_size = progress
        .index_bytes
        .checked_add(index_entry_bytes)
        .ok_or_else(|| "recorder index byte count overflow".to_string())?;
    let bounded_archive_size = next_size
        .checked_mul(2)
        .and_then(|size| size.checked_add(next_index_size))
        .and_then(|size| size.checked_add(RECORDER_ARCHIVE_METADATA_RESERVE_BYTES))
        .ok_or_else(|| "recorder archive byte count overflow".to_string())?;
    if bounded_archive_size > MAX_RECORDER_ARCHIVE_BYTES {
        return Err(format!(
            "complete recorder archive exceeds the {MAX_RECORDER_ARCHIVE_BYTES}-byte safety cap"
        ));
    }
    if index_entry_bytes > 0 {
        progress.index_bytes = progress
            .index_bytes
            .checked_add(append_index_entry(&entry, index_writer)?)
            .ok_or_else(|| "recorder index byte count overflow".to_string())?;
        progress.last_indexed_sequence = Some(input.sequence);
    }
    frame_writer
        .write_all(&bytes)
        .map_err(|err| format!("write recorder replay frame: {err}"))?;
    progress.frame_bytes = next_size;
    progress.frame_count += 1;
    progress.first_t.get_or_insert(input.t);
    progress.last_t = Some(input.t);
    progress.last_index = Some(entry);
    Ok(())
}

struct RecorderReplayBinding<'a> {
    contract_hash: &'a str,
    lockfile_hash: &'a str,
    seed: u64,
    environment: &'a serde_json::Value,
    artifact_id: &'a str,
    reference_rig_id: &'a str,
    source_kind: &'a str,
    source_port_sha256: &'a str,
    capture_maturity: &'a str,
}

fn recorder_replay_prefix(binding: RecorderReplayBinding<'_>) -> Result<Vec<u8>, String> {
    let header = serde_json::json!({
        "contractHash": binding.contract_hash,
        "lockfileHash": binding.lockfile_hash,
        "seed": binding.seed,
        "env": binding.environment,
        "recorder": {
            "archiveSchemaVersion": RECORDER_ARCHIVE_SCHEMA_VERSION,
            "artifactId": binding.artifact_id,
            "referenceRigId": binding.reference_rig_id,
            "sourceKind": binding.source_kind,
            "sourcePortSha256": binding.source_port_sha256,
            "captureMaturity": binding.capture_maturity,
            "captureConsentConfirmed": true,
            "recordedDeviceAttested": false,
            "noAutoArm": true
        }
    });
    let mut prefix = b"{\"schemaVersion\":".to_vec();
    serde_json::to_writer(&mut prefix, REPLAY_SCHEMA_VERSION)
        .map_err(|err| format!("serialize replay schema version: {err}"))?;
    prefix.extend_from_slice(b",\"header\":");
    serde_json::to_writer(&mut prefix, &header)
        .map_err(|err| format!("serialize replay header: {err}"))?;
    prefix.extend_from_slice(b",\"frames\":[");
    Ok(prefix)
}

fn finalize_replay_file(
    request: &RecorderRequest,
    manifest: &RecorderArchiveManifest,
) -> Result<String, String> {
    let output_dir = Path::new(&request.output_dir);
    let frames_path = output_dir.join(manifest.frame_file);
    let replay_path = output_dir.join(&manifest.replay_file);
    let frames = BufReader::new(
        File::open(&frames_path)
            .map_err(|err| format!("open recorder frame file for replay: {err}"))?,
    );
    let replay_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&replay_path)
        .map_err(|err| format!("create completed replay file: {err}"))?;
    let mut replay = BufWriter::new(replay_file);
    replay
        .write_all(&recorder_replay_prefix(RecorderReplayBinding {
            contract_hash: &request.contract_hash,
            lockfile_hash: &request.lockfile_hash,
            seed: request.seed,
            environment: &request.environment,
            artifact_id: &request.artifact_id,
            reference_rig_id: &manifest.reference_rig_id,
            source_kind: manifest.source_kind,
            source_port_sha256: &manifest.source_port_sha256,
            capture_maturity: manifest.capture_maturity,
        })?)
        .map_err(|err| format!("write replay prefix: {err}"))?;
    for (index, line) in frames.lines().enumerate() {
        let line = line.map_err(|err| format!("read recorder frame file: {err}"))?;
        if index > 0 {
            replay
                .write_all(b",")
                .map_err(|err| format!("write replay frame separator: {err}"))?;
        }
        replay
            .write_all(line.as_bytes())
            .map_err(|err| format!("write completed replay frame: {err}"))?;
    }
    replay
        .write_all(b"]}\n")
        .map_err(|err| format!("write replay suffix: {err}"))?;
    replay
        .flush()
        .map_err(|err| format!("flush completed replay: {err}"))?;
    replay
        .get_ref()
        .sync_all()
        .map_err(|err| format!("sync completed replay: {err}"))?;
    file_sha256(&replay_path)
}

fn recorder_archive_file_lengths(output_dir: &Path) -> Result<u64, String> {
    let archive_metadata = fs::symlink_metadata(output_dir)
        .map_err(|err| format!("inspect recorder archive '{}': {err}", output_dir.display()))?;
    if archive_metadata.file_type().is_symlink() || !archive_metadata.is_dir() {
        return Err("recorder archive path must be a real directory, not a symlink".to_string());
    }
    let expected = [
        RECORDER_MANIFEST_FILE,
        RECORDER_FRAME_FILE,
        RECORDER_INDEX_FILE,
        RECORDER_REPLAY_FILE,
        RECORDER_RECEIPT_FILE,
    ];
    let mut observed = Vec::new();
    let mut aggregate_size = 0_u64;
    for entry in fs::read_dir(output_dir)
        .map_err(|err| format!("list recorder archive '{}': {err}", output_dir.display()))?
    {
        let entry = entry.map_err(|err| format!("read recorder archive entry: {err}"))?;
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| "recorder archive contains a non-UTF-8 filename".to_string())?;
        if !expected.contains(&name.as_str()) {
            return Err(format!(
                "recorder archive contains unexpected entry '{name}'"
            ));
        }
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|err| format!("inspect recorder archive entry '{name}': {err}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!(
                "recorder archive entry '{name}' must be a real regular file, not a symlink"
            ));
        }
        aggregate_size = aggregate_size
            .checked_add(metadata.len())
            .ok_or_else(|| "recorder archive aggregate size overflow".to_string())?;
        observed.push(name);
    }
    observed.sort();
    let mut expected_sorted = expected.map(str::to_string);
    expected_sorted.sort();
    if observed != expected_sorted {
        return Err("recorder archive must contain exactly the five canonical files".to_string());
    }
    if aggregate_size > MAX_RECORDER_ARCHIVE_BYTES {
        return Err(format!(
            "recorder archive exceeds the {MAX_RECORDER_ARCHIVE_BYTES}-byte safety cap"
        ));
    }
    Ok(aggregate_size)
}

fn read_canonical_pretty_json<T>(path: &Path, label: &str) -> Result<T, String>
where
    T: serde::de::DeserializeOwned + Serialize,
{
    let file = File::open(path).map_err(|err| format!("open recorder {label}: {err}"))?;
    let mut bytes = Vec::new();
    file.take(RECORDER_ARCHIVE_METADATA_RESERVE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|err| format!("read recorder {label}: {err}"))?;
    if bytes.len() as u64 > RECORDER_ARCHIVE_METADATA_RESERVE_BYTES {
        return Err(format!(
            "recorder {label} exceeds the {RECORDER_ARCHIVE_METADATA_RESERVE_BYTES}-byte metadata cap"
        ));
    }
    let value: T =
        serde_json::from_slice(&bytes).map_err(|err| format!("parse recorder {label}: {err}"))?;
    let mut canonical = serde_json::to_vec_pretty(&value)
        .map_err(|err| format!("canonicalize recorder {label}: {err}"))?;
    canonical.push(b'\n');
    if bytes != canonical {
        return Err(format!("recorder {label} is not canonical pretty JSON"));
    }
    Ok(value)
}

fn read_canonical_jsonl<T>(
    reader: &mut BufReader<File>,
    line: &mut Vec<u8>,
    label: &str,
    max_bytes: usize,
) -> Result<Option<T>, String>
where
    T: serde::de::DeserializeOwned + Serialize,
{
    line.clear();
    let count = reader
        .take(max_bytes as u64 + 1)
        .read_until(b'\n', line)
        .map_err(|err| format!("read recorder {label}: {err}"))?;
    if count == 0 {
        return Ok(None);
    }
    if count > max_bytes {
        return Err(format!("recorder {label} exceeds {max_bytes} bytes"));
    }
    if line.last() != Some(&b'\n') {
        return Err(format!("recorder {label} is not newline terminated"));
    }
    let value: T = serde_json::from_slice(&line[..line.len() - 1])
        .map_err(|err| format!("parse recorder {label}: {err}"))?;
    let mut canonical = serde_json::to_vec(&value)
        .map_err(|err| format!("canonicalize recorder {label}: {err}"))?;
    canonical.push(b'\n');
    if *line != canonical {
        return Err(format!("recorder {label} is not canonical JSONL"));
    }
    Ok(Some(value))
}

fn validate_recorder_archive_manifest(
    manifest: &RecorderArchiveManifestInput,
) -> Result<(), String> {
    if manifest.schema_version != RECORDER_ARCHIVE_SCHEMA_VERSION
        || manifest.replay_schema_version != REPLAY_SCHEMA_VERSION
        || manifest.frame_schema_version != RECORDER_FRAME_SCHEMA_VERSION
        || manifest.receipt_schema_version != RECORDER_RECEIPT_SCHEMA_VERSION
    {
        return Err("recorder manifest declares an unsupported format version".to_string());
    }
    if manifest.artifact_id.is_empty()
        || manifest.artifact_id.len() > 128
        || !manifest
            .artifact_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(
            "recorder manifest artifactId is outside the v1 identifier grammar".to_string(),
        );
    }
    if !D12_RIGS.contains(&manifest.reference_rig_id.as_str()) {
        return Err("recorder manifest referenceRigId is not a frozen D12 rig".to_string());
    }
    if !(1..=1_000).contains(&manifest.sample_rate_hz) {
        return Err("recorder manifest sampleRateHz is outside 1 through 1000".to_string());
    }
    if !is_sha256_hex(&manifest.contract_hash)
        || !is_sha256_hex(&manifest.lockfile_hash)
        || !is_sha256_hex(&manifest.source_port_sha256)
    {
        return Err("recorder manifest hashes must be lowercase SHA-256 values".to_string());
    }
    if !manifest.environment.is_object() {
        return Err("recorder manifest environment must be an object".to_string());
    }
    let environment_bytes = serde_json::to_vec(&manifest.environment)
        .map_err(|err| format!("serialize recorder manifest environment: {err}"))?;
    if environment_bytes.len() > MAX_RECORDER_FRAME_BYTES {
        return Err(format!(
            "recorder manifest environment exceeds {MAX_RECORDER_FRAME_BYTES} bytes"
        ));
    }
    let mut nodes = 0;
    bounded_json_nodes(&manifest.environment, 0, &mut nodes)?;
    if manifest.source_kind != "serial-jsonl"
        || manifest.source_baud != BETAFLIGHT_SERIAL_BAUD
        || manifest.capture_maturity != "local-serial-integration"
    {
        return Err("recorder manifest source or maturity authority has drifted".to_string());
    }
    if manifest.frame_file != RECORDER_FRAME_FILE
        || manifest.index_file != RECORDER_INDEX_FILE
        || manifest.replay_file != RECORDER_REPLAY_FILE
        || manifest.receipt_file != RECORDER_RECEIPT_FILE
    {
        return Err("recorder manifest filenames do not match archive v1".to_string());
    }
    if !manifest.capture_consent_confirmed
        || !manifest.user_owned
        || manifest.sharing_authorized
        || manifest.training_reuse_authorized
        || manifest.recorded_device_attested
        || !manifest.no_auto_arm
    {
        return Err(
            "recorder manifest privacy, consent, or authority flags have drifted".to_string(),
        );
    }
    Ok(())
}

fn validate_recorder_stop_receipt(
    receipt: &RecorderStopReceiptInput,
    manifest: &RecorderArchiveManifestInput,
) -> Result<(), String> {
    if receipt.schema_version != RECORDER_RECEIPT_SCHEMA_VERSION
        || receipt.archive_schema_version != RECORDER_ARCHIVE_SCHEMA_VERSION
        || receipt.replay_schema_version != REPLAY_SCHEMA_VERSION
        || receipt.frame_schema_version != RECORDER_FRAME_SCHEMA_VERSION
    {
        return Err("recorder receipt declares an unsupported format version".to_string());
    }
    if receipt.artifact_id != manifest.artifact_id
        || receipt.reference_rig_id != manifest.reference_rig_id
        || receipt.contract_hash != manifest.contract_hash
        || receipt.lockfile_hash != manifest.lockfile_hash
        || receipt.started_at_unix_ms != manifest.started_at_unix_ms
        || receipt.source_port_sha256 != manifest.source_port_sha256
    {
        return Err("recorder receipt does not match the archive manifest authority".to_string());
    }
    if receipt.stopped_at_unix_ms < receipt.started_at_unix_ms
        || !(1..=MAX_RECORDER_FRAMES).contains(&receipt.frame_count)
        || !receipt.duration_s.is_finite()
        || receipt.duration_s < 0.0
    {
        return Err("recorder receipt time, duration, or frame count is invalid".to_string());
    }
    if !is_sha256_hex(&receipt.frame_file_sha256)
        || !is_sha256_hex(&receipt.index_file_sha256)
        || !is_sha256_hex(&receipt.replay_file_sha256)
    {
        return Err("recorder receipt file hashes must be lowercase SHA-256 values".to_string());
    }
    if !receipt.capture_complete
        || receipt.capture_maturity != "local-serial-integration"
        || !receipt.capture_consent_confirmed
        || !receipt.user_owned
        || receipt.sharing_authorized
        || receipt.training_reuse_authorized
        || receipt.recorded_device_attested
        || !receipt.no_auto_arm
    {
        return Err(
            "recorder receipt completion, privacy, or authority flags have drifted".to_string(),
        );
    }
    Ok(())
}

fn verify_next_recorder_index_entry(
    reader: &mut BufReader<File>,
    line: &mut Vec<u8>,
    hasher: &mut Sha256,
    expected_sequence: u64,
    expected_t: f64,
    expected_offset: u64,
) -> Result<(), String> {
    let entry = read_canonical_jsonl::<RecorderIndexEntry>(reader, line, "index entry", 256)?
        .ok_or_else(|| "recorder index ended before its required entry".to_string())?;
    if entry.sequence != expected_sequence
        || entry.t.to_bits() != expected_t.to_bits()
        || entry.byte_offset != expected_offset
    {
        return Err(format!(
            "recorder index entry does not match frame {expected_sequence} at byte offset {expected_offset}"
        ));
    }
    hasher.update(line);
    Ok(())
}

fn inspect_recorder_archive_path(output_dir: &Path) -> Result<RecorderArchiveInspection, String> {
    let initial_archive_bytes = recorder_archive_file_lengths(output_dir)?;
    let manifest: RecorderArchiveManifestInput =
        read_canonical_pretty_json(&output_dir.join(RECORDER_MANIFEST_FILE), "manifest")?;
    validate_recorder_archive_manifest(&manifest)?;
    let receipt: RecorderStopReceiptInput =
        read_canonical_pretty_json(&output_dir.join(RECORDER_RECEIPT_FILE), "receipt")?;
    validate_recorder_stop_receipt(&receipt, &manifest)?;

    let mut frames = BufReader::new(
        File::open(output_dir.join(RECORDER_FRAME_FILE))
            .map_err(|err| format!("open recorder frame file: {err}"))?,
    );
    let mut index = BufReader::new(
        File::open(output_dir.join(RECORDER_INDEX_FILE))
            .map_err(|err| format!("open recorder index file: {err}"))?,
    );
    let mut frame_line = Vec::new();
    let mut index_line = Vec::new();
    let mut frame_hasher = Sha256::new();
    let mut index_hasher = Sha256::new();
    let mut expected_replay_hasher = Sha256::new();
    expected_replay_hasher.update(recorder_replay_prefix(RecorderReplayBinding {
        contract_hash: &manifest.contract_hash,
        lockfile_hash: &manifest.lockfile_hash,
        seed: manifest.seed,
        environment: &manifest.environment,
        artifact_id: &manifest.artifact_id,
        reference_rig_id: &manifest.reference_rig_id,
        source_kind: &manifest.source_kind,
        source_port_sha256: &manifest.source_port_sha256,
        capture_maturity: &manifest.capture_maturity,
    })?);
    let index_stride = u64::from((manifest.sample_rate_hz / 4).max(1));
    let mut frame_count = 0_u64;
    let mut frame_offset = 0_u64;
    let mut last_frame_offset = 0_u64;
    let mut first_t: Option<f64> = None;
    let mut last_t: Option<f64> = None;
    while let Some(frame) = read_canonical_jsonl::<ReplayFrame>(
        &mut frames,
        &mut frame_line,
        "frame",
        MAX_RECORDER_FRAME_BYTES + 1,
    )? {
        if frame_count >= MAX_RECORDER_FRAMES {
            return Err(format!(
                "recorder archive exceeds the {MAX_RECORDER_FRAMES}-frame safety cap"
            ));
        }
        if !frame.t.is_finite() || last_t.is_some_and(|last: f64| frame.t <= last) {
            return Err(
                "recorder archive frame time must be finite and strictly increasing".to_string(),
            );
        }
        if !frame.state.is_object() {
            return Err("recorder archive frame state must be an object".to_string());
        }
        let mut nodes = 0;
        bounded_json_nodes(&frame.state, 0, &mut nodes)?;
        if frame_count.is_multiple_of(index_stride) {
            verify_next_recorder_index_entry(
                &mut index,
                &mut index_line,
                &mut index_hasher,
                frame_count,
                frame.t,
                frame_offset,
            )?;
        }
        frame_hasher.update(&frame_line);
        if frame_count > 0 {
            expected_replay_hasher.update(b",");
        }
        expected_replay_hasher.update(&frame_line[..frame_line.len() - 1]);
        last_frame_offset = frame_offset;
        frame_offset = frame_offset
            .checked_add(frame_line.len() as u64)
            .ok_or_else(|| "recorder frame byte offset overflow".to_string())?;
        first_t.get_or_insert(frame.t);
        last_t = Some(frame.t);
        frame_count += 1;
    }
    if frame_count == 0 {
        return Err("recorder archive contains no frames".to_string());
    }
    let last_sequence = frame_count - 1;
    if !last_sequence.is_multiple_of(index_stride) {
        verify_next_recorder_index_entry(
            &mut index,
            &mut index_line,
            &mut index_hasher,
            last_sequence,
            last_t.expect("non-empty recorder archive"),
            last_frame_offset,
        )?;
    }
    if read_canonical_jsonl::<RecorderIndexEntry>(&mut index, &mut index_line, "index entry", 256)?
        .is_some()
    {
        return Err("recorder index contains an unexpected extra entry".to_string());
    }
    if frame_count != receipt.frame_count {
        return Err("recorder receipt frameCount does not match the frame file".to_string());
    }
    let duration_s =
        last_t.expect("non-empty recorder archive") - first_t.expect("non-empty recorder archive");
    if duration_s.to_bits() != receipt.duration_s.to_bits() {
        return Err("recorder receipt duration does not match the frame file".to_string());
    }
    expected_replay_hasher.update(b"]}\n");
    let frame_file_sha256 = format!("{:x}", frame_hasher.finalize());
    let index_file_sha256 = format!("{:x}", index_hasher.finalize());
    let expected_replay_sha256 = format!("{:x}", expected_replay_hasher.finalize());
    let actual_replay_sha256 = file_sha256(&output_dir.join(RECORDER_REPLAY_FILE))?;
    if frame_file_sha256 != receipt.frame_file_sha256
        || index_file_sha256 != receipt.index_file_sha256
        || expected_replay_sha256 != receipt.replay_file_sha256
        || actual_replay_sha256 != receipt.replay_file_sha256
    {
        return Err(
            "recorder archive hash or reconstructed replay verification failed".to_string(),
        );
    }
    if recorder_archive_file_lengths(output_dir)? != initial_archive_bytes {
        return Err("recorder archive changed size during inspection".to_string());
    }
    let canonical_archive = fs::canonicalize(output_dir)
        .map_err(|err| format!("canonicalize recorder archive path: {err}"))?;
    Ok(RecorderArchiveInspection {
        schema_version: RECORDER_INSPECTION_SCHEMA_VERSION,
        archive_schema_version: RECORDER_ARCHIVE_SCHEMA_VERSION,
        replay_schema_version: REPLAY_SCHEMA_VERSION,
        receipt_schema_version: RECORDER_RECEIPT_SCHEMA_VERSION,
        artifact_id: manifest.artifact_id,
        archive_path: canonical_archive.to_string_lossy().into_owned(),
        replay_path: canonical_archive
            .join(RECORDER_REPLAY_FILE)
            .to_string_lossy()
            .into_owned(),
        reference_rig_id: manifest.reference_rig_id,
        contract_hash: manifest.contract_hash,
        lockfile_hash: manifest.lockfile_hash,
        source_port_sha256: manifest.source_port_sha256,
        sample_rate_hz: manifest.sample_rate_hz,
        started_at_unix_ms: receipt.started_at_unix_ms,
        stopped_at_unix_ms: receipt.stopped_at_unix_ms,
        frame_count,
        duration_s,
        capture_maturity: receipt.capture_maturity,
        integrity_verified: true,
        capture_complete: true,
        capture_consent_confirmed: true,
        user_owned: true,
        sharing_authorized: false,
        training_reuse_authorized: false,
        recorded_device_attested: false,
        device_identity_verified: false,
        field_session_verified: false,
        no_auto_arm: true,
    })
}

fn recorder_upload_files() -> [(&'static str, &'static str); 5] {
    [
        (RECORDER_MANIFEST_FILE, "application/json"),
        (RECORDER_FRAME_FILE, "application/x-ndjson"),
        (RECORDER_INDEX_FILE, "application/x-ndjson"),
        (RECORDER_REPLAY_FILE, "application/json"),
        (RECORDER_RECEIPT_FILE, "application/json"),
    ]
}

fn recorder_upload_plan_path(output_dir: &Path) -> Result<RecorderUploadPlan, String> {
    let inspection = inspect_recorder_archive_path(output_dir)?;
    let aggregate_byte_size = recorder_archive_file_lengths(output_dir)?;
    let mut files = Vec::with_capacity(5);
    for (name, content_type) in recorder_upload_files() {
        let path = output_dir.join(name);
        let metadata = fs::symlink_metadata(&path)
            .map_err(|err| format!("inspect recorder upload file '{name}': {err}"))?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(format!(
                "recorder upload file '{name}' must be a real regular file"
            ));
        }
        if metadata.len() == 0 {
            return Err(format!("recorder upload file '{name}' must not be empty"));
        }
        files.push(RecorderUploadFilePlan {
            name,
            content_type,
            byte_size: metadata.len(),
            sha256: file_sha256(&path)?,
        });
    }
    if recorder_archive_file_lengths(output_dir)? != aggregate_byte_size {
        return Err("recorder archive changed size while preparing upload".to_string());
    }
    Ok(RecorderUploadPlan {
        schema_version: RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
        archive_schema_version: RECORDER_ARCHIVE_SCHEMA_VERSION,
        inspection_schema_version: RECORDER_INSPECTION_SCHEMA_VERSION,
        artifact_id: inspection.artifact_id,
        reference_rig_id: inspection.reference_rig_id,
        contract_hash: inspection.contract_hash,
        lockfile_hash: inspection.lockfile_hash,
        source_port_sha256: inspection.source_port_sha256,
        sample_rate_hz: inspection.sample_rate_hz,
        started_at_unix_ms: inspection.started_at_unix_ms,
        stopped_at_unix_ms: inspection.stopped_at_unix_ms,
        frame_count: inspection.frame_count,
        duration_s: inspection.duration_s,
        capture_maturity: inspection.capture_maturity,
        aggregate_byte_size,
        files,
        local_integrity_verified: inspection.integrity_verified,
        capture_complete: inspection.capture_complete,
        capture_consent_confirmed: inspection.capture_consent_confirmed,
        user_owned: inspection.user_owned,
        sharing_authorized: inspection.sharing_authorized,
        training_reuse_authorized: inspection.training_reuse_authorized,
        recorded_device_attested: inspection.recorded_device_attested,
        device_identity_verified: inspection.device_identity_verified,
        field_session_verified: inspection.field_session_verified,
        no_auto_arm: inspection.no_auto_arm,
    })
}

fn strict_upload_origin(value: &str) -> Result<reqwest::Url, String> {
    if value.is_empty() || value.len() > 2_048 {
        return Err(format!(
            "{RECORDER_UPLOAD_ORIGIN_ENV} must be an explicit bounded HTTP(S) origin"
        ));
    }
    let url = reqwest::Url::parse(value)
        .map_err(|_| format!("{RECORDER_UPLOAD_ORIGIN_ENV} is not a valid URL origin"))?;
    if !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err(format!(
            "{RECORDER_UPLOAD_ORIGIN_ENV} must not contain credentials, a path, query, or fragment"
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| format!("{RECORDER_UPLOAD_ORIGIN_ENV} requires a host"))?;
    let safe_loopback_http = url.scheme() == "http"
        && (host.eq_ignore_ascii_case("localhost")
            || host
                .parse::<std::net::IpAddr>()
                .is_ok_and(|address| address.is_loopback()));
    if url.scheme() != "https" && !safe_loopback_http {
        return Err(format!(
            "{RECORDER_UPLOAD_ORIGIN_ENV} requires HTTPS except for an explicit loopback development origin"
        ));
    }
    Ok(url)
}

fn same_url_origin(left: &reqwest::Url, right: &reqwest::Url) -> bool {
    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

fn sha256_base64(sha256: &str) -> Result<String, String> {
    if !is_sha256_hex(sha256) {
        return Err("recorder upload SHA-256 must be lowercase hexadecimal".to_string());
    }
    let bytes = (0..32)
        .map(|index| {
            u8::from_str_radix(&sha256[index * 2..index * 2 + 2], 16)
                .expect("validated recorder upload SHA-256")
        })
        .collect::<Vec<_>>();
    Ok(BASE64_STANDARD.encode(bytes))
}

fn upload_recorder_archive_files_path(
    output_dir: &Path,
    uploads: Vec<RecorderUploadContract>,
    expected_origin: &str,
) -> Result<RecorderUploadReceipt, String> {
    let plan = recorder_upload_plan_path(output_dir)?;
    if uploads.len() != plan.files.len() {
        return Err("recorder upload requires exactly five canonical file contracts".to_string());
    }
    let origin = strict_upload_origin(expected_origin)?;
    let expected_names = plan
        .files
        .iter()
        .map(|file| file.name)
        .collect::<BTreeSet<_>>();
    let supplied_names = uploads
        .iter()
        .map(|upload| upload.name.as_str())
        .collect::<BTreeSet<_>>();
    if supplied_names.len() != uploads.len() || supplied_names != expected_names {
        return Err(
            "recorder upload contracts do not name the exact five canonical files".to_string(),
        );
    }
    let client = reqwest::blocking::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(RECORDER_UPLOAD_TIMEOUT)
        .pool_max_idle_per_host(0)
        .build()
        .map_err(|err| format!("build recorder upload client: {err}"))?;

    for planned in &plan.files {
        let upload = uploads
            .iter()
            .find(|candidate| candidate.name == planned.name)
            .expect("exact upload-name set checked");
        if upload.method != "PUT"
            || upload.byte_size != planned.byte_size
            || upload.sha256 != planned.sha256
        {
            return Err(format!(
                "recorder upload contract for '{}' does not match the inspected local file",
                planned.name
            ));
        }
        if upload.url.is_empty() || upload.url.len() > MAX_RECORDER_UPLOAD_URL_BYTES {
            return Err(format!(
                "recorder upload URL for '{}' is outside the bounded length",
                planned.name
            ));
        }
        let url = reqwest::Url::parse(&upload.url)
            .map_err(|_| format!("recorder upload URL for '{}' is invalid", planned.name))?;
        if !url.username().is_empty()
            || url.password().is_some()
            || url.fragment().is_some()
            || !same_url_origin(&url, &origin)
        {
            return Err(format!(
                "recorder upload URL for '{}' is outside the configured object origin",
                planned.name
            ));
        }
        let query_keys = url
            .query_pairs()
            .map(|(key, _)| key.to_ascii_lowercase())
            .collect::<BTreeSet<_>>();
        for required in [
            "x-amz-algorithm",
            "x-amz-credential",
            "x-amz-date",
            "x-amz-expires",
            "x-amz-signedheaders",
            "x-amz-signature",
        ] {
            if !query_keys.contains(required) {
                return Err(format!(
                    "recorder upload URL for '{}' is not a complete signed object request",
                    planned.name
                ));
            }
        }
        let header_names = upload
            .headers
            .keys()
            .map(|name| name.to_ascii_lowercase())
            .collect::<BTreeSet<_>>();
        if upload.headers.len() != 2
            || header_names
                != BTreeSet::from([
                    "content-type".to_string(),
                    "x-amz-checksum-sha256".to_string(),
                ])
        {
            return Err(format!(
                "recorder upload headers for '{}' are not the exact signed allowlist",
                planned.name
            ));
        }
        let content_type = upload
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case("content-type"))
            .map(|(_, value)| value.as_str());
        let checksum = upload
            .headers
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case("x-amz-checksum-sha256"))
            .map(|(_, value)| value.as_str());
        let expected_checksum = sha256_base64(&planned.sha256)?;
        if content_type != Some(planned.content_type)
            || checksum != Some(expected_checksum.as_str())
        {
            return Err(format!(
                "recorder upload headers for '{}' do not bind its type and SHA-256",
                planned.name
            ));
        }
        let path = output_dir.join(planned.name);
        let file = File::open(&path)
            .map_err(|err| format!("open recorder upload file '{}': {err}", planned.name))?;
        if file
            .metadata()
            .map_err(|err| format!("inspect recorder upload file '{}': {err}", planned.name))?
            .len()
            != planned.byte_size
        {
            return Err(format!(
                "recorder upload file '{}' changed after inspection",
                planned.name
            ));
        }
        let response = client
            .put(url)
            .header(reqwest::header::CONTENT_TYPE, planned.content_type)
            .header("x-amz-checksum-sha256", expected_checksum)
            .body(reqwest::blocking::Body::sized(file, planned.byte_size))
            .send()
            .map_err(|err| format!("upload recorder file '{}': {err}", planned.name))?;
        if !response.status().is_success() {
            return Err(format!(
                "object storage rejected recorder file '{}' with HTTP {}",
                planned.name,
                response.status().as_u16()
            ));
        }
    }

    Ok(RecorderUploadReceipt {
        schema_version: RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION,
        upload_plan_schema_version: RECORDER_UPLOAD_PLAN_SCHEMA_VERSION,
        artifact_id: plan.artifact_id,
        uploaded_file_count: plan.files.len(),
        uploaded_byte_size: plan.aggregate_byte_size,
        local_integrity_verified: true,
        gateway_object_integrity_verified: false,
        recorded_device_attested: false,
        device_identity_verified: false,
        field_session_verified: false,
        sharing_authorized: false,
        training_reuse_authorized: false,
        no_auto_arm: true,
    })
}

fn record_serial_stream(
    request: RecorderRequest,
    manifest: RecorderArchiveManifest,
    mut port: Box<dyn serialport::SerialPort>,
    stop_rx: mpsc::Receiver<()>,
    frame_file: File,
    index_file: File,
) -> Result<RecorderStopReceipt, String> {
    let output_dir = Path::new(&request.output_dir);
    let mut frames = BufWriter::new(frame_file);
    let mut index = BufWriter::new(index_file);
    let mut progress = RecorderProgress::default();
    let mut pending = Vec::new();
    let mut stopping = false;
    let index_stride = u64::from((request.sample_rate_hz / 4).max(1));
    loop {
        if !stopping {
            match stop_rx.try_recv() {
                Ok(()) | Err(mpsc::TryRecvError::Disconnected) => stopping = true,
                Err(mpsc::TryRecvError::Empty) => {}
            }
        }
        let mut chunk = [0_u8; 4096];
        match port.read(&mut chunk) {
            Ok(0) if stopping => break,
            Ok(0) => thread::sleep(Duration::from_millis(5)),
            Ok(count) => {
                for byte in &chunk[..count] {
                    if *byte == b'\n' {
                        if pending.last() == Some(&b'\r') {
                            pending.pop();
                        }
                        append_recorder_frame(
                            &pending,
                            &request,
                            index_stride,
                            &mut frames,
                            &mut index,
                            &mut progress,
                        )?;
                        pending.clear();
                    } else {
                        pending.push(*byte);
                        if pending.len() > MAX_RECORDER_FRAME_BYTES {
                            return Err(format!(
                                "recorder telemetry frame exceeds {MAX_RECORDER_FRAME_BYTES} bytes"
                            ));
                        }
                    }
                }
            }
            Err(err)
                if matches!(
                    err.kind(),
                    std::io::ErrorKind::TimedOut
                        | std::io::ErrorKind::WouldBlock
                        | std::io::ErrorKind::Interrupted
                ) =>
            {
                if stopping {
                    break;
                }
            }
            Err(err) => return Err(format!("read recorder serial stream: {err}")),
        }
    }
    if !pending.is_empty() {
        return Err("recorder stopped with an incomplete telemetry frame".to_string());
    }
    if progress.frame_count == 0 {
        return Err("recorder cannot complete an empty telemetry archive".to_string());
    }
    if let Some(last) = progress.last_index.as_ref() {
        if progress.last_indexed_sequence != Some(last.sequence) {
            progress.index_bytes = progress
                .index_bytes
                .checked_add(append_index_entry(last, &mut index)?)
                .ok_or_else(|| "recorder index byte count overflow".to_string())?;
        }
    }
    frames
        .flush()
        .map_err(|err| format!("flush recorder frames: {err}"))?;
    frames
        .get_ref()
        .sync_all()
        .map_err(|err| format!("sync recorder frames: {err}"))?;
    index
        .flush()
        .map_err(|err| format!("flush recorder index: {err}"))?;
    index
        .get_ref()
        .sync_all()
        .map_err(|err| format!("sync recorder index: {err}"))?;

    let frame_file_sha256 = file_sha256(&output_dir.join(manifest.frame_file))?;
    let index_file_sha256 = file_sha256(&output_dir.join(manifest.index_file))?;
    let replay_file_sha256 = finalize_replay_file(&request, &manifest)?;
    let receipt = RecorderStopReceipt {
        schema_version: RECORDER_RECEIPT_SCHEMA_VERSION,
        archive_schema_version: RECORDER_ARCHIVE_SCHEMA_VERSION,
        replay_schema_version: REPLAY_SCHEMA_VERSION,
        frame_schema_version: RECORDER_FRAME_SCHEMA_VERSION,
        artifact_id: request.artifact_id,
        reference_rig_id: manifest.reference_rig_id,
        contract_hash: request.contract_hash,
        lockfile_hash: request.lockfile_hash,
        started_at_unix_ms: manifest.started_at_unix_ms,
        stopped_at_unix_ms: unix_ms()?,
        frame_count: progress.frame_count,
        duration_s: progress.last_t.unwrap_or(0.0) - progress.first_t.unwrap_or(0.0),
        frame_file_sha256,
        index_file_sha256,
        replay_file_sha256,
        source_port_sha256: manifest.source_port_sha256,
        capture_complete: true,
        capture_maturity: "local-serial-integration",
        capture_consent_confirmed: true,
        recorded_device_attested: false,
        user_owned: true,
        sharing_authorized: false,
        training_reuse_authorized: false,
        no_auto_arm: true,
    };
    create_new_json(&output_dir.join(manifest.receipt_file), &receipt)?;
    Ok(receipt)
}

fn recorder_runtime() -> &'static RecorderRuntime {
    RECORDER_RUNTIME.get_or_init(RecorderRuntime::default)
}

fn inactive_recorder_status() -> RecorderControlStatus {
    RecorderControlStatus {
        schema_version: RECORDER_CONTROL_SCHEMA_VERSION,
        state: "inactive",
        artifact_id: None,
        archive_path: None,
        manifest_path: None,
        reference_rig_id: None,
        contract_hash: None,
        lockfile_hash: None,
        source_port_sha256: None,
        source_baud: None,
        sample_rate_hz: None,
        started_at_unix_ms: None,
        capture_maturity: None,
        capture_consent_confirmed: false,
        recorded_device_attested: false,
        device_identity_verified: false,
        field_session_verified: false,
        user_owned: false,
        sharing_authorized: false,
        training_reuse_authorized: false,
        no_auto_arm: true,
    }
}

fn recorder_status_for(runtime: &RecorderRuntime) -> Result<RecorderControlStatus, String> {
    let active = runtime
        .active
        .lock()
        .map_err(|_| "recorder runtime lock is poisoned".to_string())?;
    let Some(active) = active.as_ref() else {
        return Ok(inactive_recorder_status());
    };
    let mut status = active.status.clone();
    status.state = if active.join.is_finished() {
        "finished"
    } else {
        "recording"
    };
    Ok(status)
}

fn start_recorder_with_port(
    runtime: &RecorderRuntime,
    request: RecorderRequest,
    port: Box<dyn serialport::SerialPort>,
    port_is_enumerated: bool,
) -> Result<RecorderControlStatus, String> {
    let mut active = runtime
        .active
        .lock()
        .map_err(|_| "recorder runtime lock is poisoned".to_string())?;
    start_recorder_with_port_locked(&mut active, request, port, port_is_enumerated, None)
}

fn start_recorder_with_port_locked(
    active: &mut Option<ActiveRecorder>,
    request: RecorderRequest,
    mut port: Box<dyn serialport::SerialPort>,
    port_is_enumerated: bool,
    custody: Option<ActiveRecorderCustody>,
) -> Result<RecorderControlStatus, String> {
    let rig_id = validate_recorder_request(&request, port_is_enumerated)?;
    port.set_timeout(RECORDER_READ_TIMEOUT)
        .map_err(|err| format!("set recorder serial timeout: {err}"))?;
    if active.is_some() {
        return Err("a Desktop background recorder is already active".to_string());
    }
    let (manifest, frame_file, index_file) = create_recorder_archive(&request, &rig_id)?;
    let start_status = RecorderControlStatus {
        schema_version: RECORDER_CONTROL_SCHEMA_VERSION,
        state: "recording",
        artifact_id: Some(request.artifact_id.clone()),
        archive_path: Some(request.output_dir.clone()),
        manifest_path: Some(
            Path::new(&request.output_dir)
                .join(RECORDER_MANIFEST_FILE)
                .to_string_lossy()
                .into_owned(),
        ),
        reference_rig_id: Some(manifest.reference_rig_id.clone()),
        contract_hash: Some(manifest.contract_hash.clone()),
        lockfile_hash: Some(manifest.lockfile_hash.clone()),
        source_port_sha256: Some(manifest.source_port_sha256.clone()),
        source_baud: Some(manifest.source_baud),
        sample_rate_hz: Some(manifest.sample_rate_hz),
        started_at_unix_ms: Some(manifest.started_at_unix_ms),
        capture_maturity: Some("local-serial-integration"),
        capture_consent_confirmed: true,
        recorded_device_attested: false,
        device_identity_verified: false,
        field_session_verified: false,
        user_owned: true,
        sharing_authorized: false,
        training_reuse_authorized: false,
        no_auto_arm: true,
    };
    let archive_path = PathBuf::from(&request.output_dir);
    let (stop_tx, stop_rx) = mpsc::channel();
    let join = thread::Builder::new()
        .name("forge-background-recorder".to_string())
        .spawn(move || {
            record_serial_stream(request, manifest, port, stop_rx, frame_file, index_file)
        })
        .map_err(|err| {
            let _ = fs::remove_dir_all(&archive_path);
            format!("start Desktop background recorder: {err}")
        })?;
    *active = Some(ActiveRecorder {
        stop_tx,
        join,
        status: start_status.clone(),
        custody,
    });
    Ok(start_status)
}

fn stop_recorder(runtime: &RecorderRuntime) -> Result<RecorderStopReceipt, String> {
    let mut guard = runtime
        .active
        .lock()
        .map_err(|_| "recorder runtime lock is poisoned".to_string())?;
    let active = guard
        .as_ref()
        .ok_or_else(|| "no Desktop background recorder is active".to_string())?;
    if active.custody.is_some() {
        return Err(
            "a custodied capture must use the custody stop command so archive completion and proof refusal remain explicit"
                .to_string(),
        );
    }
    let active = guard.take().expect("active recorder checked above");
    let _ = active.stop_tx.send(());
    let result = active
        .join
        .join()
        .map_err(|_| "Desktop background recorder thread panicked".to_string())?;
    drop(guard);
    result
}

fn lock_inactive_recorder(
    runtime: &RecorderRuntime,
) -> Result<std::sync::MutexGuard<'_, Option<ActiveRecorder>>, String> {
    let guard = runtime
        .active
        .lock()
        .map_err(|_| "recorder runtime lock is poisoned".to_string())?;
    if guard.is_some() {
        return Err(
            "read-only adapter identity probing requires the Desktop recorder to be inactive"
                .to_string(),
        );
    }
    Ok(guard)
}

fn custody_probe_request(port: String, baud: u32) -> RecorderAdapterProbeRequest {
    RecorderAdapterProbeRequest {
        port,
        baud,
        reference_rig_id: Some(D12_RIGS[0].to_string()),
        physical_confirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION.to_string(),
    }
}

fn validate_custody_probe(
    probe: &RecorderAdapterProbe,
    authorization: &RecorderCustodyAuthorization,
    phase: &str,
) -> Result<(), String> {
    let binding = &authorization.binding;
    if probe.schema_version != binding.recorder_adapter_probe_schema_version
        || probe.adapter_schema_version != binding.recorder_adapter_schema_version
        || probe.reference_rig_id != binding.reference_rig_id
        || probe.identity_sha256 != binding.expected_identity_sha256
        || probe.device_uid_sha256 != binding.expected_device_uid_sha256
        || probe.source_port_sha256 != binding.identity_source_port_sha256
        || probe.os_descriptor_sha256 != binding.identity_os_descriptor_sha256
    {
        return Err(format!(
            "recorder custody {phase} identity observation does not match the signed authorization"
        ));
    }
    if probe.device_identity_verified
        || probe.cryptographic_device_attestation
        || probe.recorded_device_attested
        || probe.field_session_verified
        || probe.sharing_authorized
        || probe.training_reuse_authorized
        || !probe.no_auto_arm
    {
        return Err(format!(
            "recorder custody {phase} identity observation fabricated authority"
        ));
    }
    Ok(())
}

fn custody_start_with_ports(
    active: &mut Option<ActiveRecorder>,
    request: RecorderCustodyStartRequest,
    available_ports: &[serialport::SerialPortInfo],
    authority: CustodyDeploymentAuthority<'_>,
    identity_port_opener: impl FnOnce() -> Result<Box<dyn serialport::SerialPort>, String>,
    telemetry_port_opener: impl FnOnce() -> Result<Box<dyn serialport::SerialPort>, String>,
) -> Result<RecorderControlStatus, String> {
    validate_custody_start_request(&request)?;
    let telemetry_descriptor_sha256 =
        enumerated_port_descriptor_sha256(available_ports, &request.recorder.port, "telemetry")?;
    let identity_descriptor_sha256 =
        enumerated_port_descriptor_sha256(available_ports, &request.identity_port, "identity")?;
    let telemetry_source_port_sha256 = recorder_source_port_sha256(&request.recorder.port);
    let identity_source_port_sha256 = recorder_source_port_sha256(&request.identity_port);
    let expected = CustodyBindingInputs {
        protected_revision: authority.protected_revision,
        reference_rig_id: D12_RIGS[0],
        artifact_id: &request.recorder.artifact_id,
        model_id: &request.model_id,
        contract_hash: &request.recorder.contract_hash,
        lockfile_hash: &request.recorder.lockfile_hash,
        telemetry_source_port_sha256: &telemetry_source_port_sha256,
        telemetry_os_descriptor_sha256: &telemetry_descriptor_sha256,
        identity_source_port_sha256: &identity_source_port_sha256,
        identity_os_descriptor_sha256: &identity_descriptor_sha256,
        recorder_adapter_probe_schema_version: RECORDER_ADAPTER_PROBE_SCHEMA_VERSION,
        recorder_adapter_schema_version: RECORDER_ADAPTER_SCHEMA_VERSION,
    };
    let verified = load_and_verify_authorization(
        authority.trust_bundle_path,
        authority.trust_bundle_sha256,
        Path::new(&request.authorization_path),
        &expected,
        authority.now_unix_ms,
    )?;
    let identity_port = identity_port_opener()?;
    let pre_probe = probe_recorder_adapter_with_port(
        custody_probe_request(request.identity_port.clone(), request.identity_baud),
        true,
        identity_descriptor_sha256.clone(),
        identity_port,
    )?;
    validate_custody_probe(&pre_probe, &verified.authorization, "start")?;
    let telemetry_port = telemetry_port_opener()?;

    let custody = ActiveRecorderCustody {
        verified,
        authorization_path: PathBuf::from(&request.authorization_path),
        archive_path: PathBuf::from(&request.recorder.output_dir),
        proof_path: PathBuf::from(&request.custody_proof_path),
        model_id: request.model_id,
        telemetry_port: request.recorder.port.clone(),
        identity_port: request.identity_port,
        identity_baud: request.identity_baud,
        telemetry_start_os_descriptor_sha256: telemetry_descriptor_sha256,
        identity_start_os_descriptor_sha256: identity_descriptor_sha256,
        pre_probe,
    };
    start_recorder_with_port_locked(
        active,
        request.recorder,
        telemetry_port,
        true,
        Some(custody),
    )
}

fn validate_custody_stop_request(
    request: &RecorderCustodyStopRequest,
    custody: &ActiveRecorderCustody,
) -> Result<(), String> {
    if request.physical_confirmation != RECORDER_ADAPTER_PROBE_CONFIRMATION {
        return Err("recorder custody stop requires the exact props-off confirmation".to_string());
    }
    if !valid_custody_token(&request.authorization_id)
        || request.authorization_id != custody.verified.authorization.binding.authorization_id
    {
        return Err(
            "recorder custody stop authorizationId does not match the active capture".to_string(),
        );
    }
    Ok(())
}

fn finish_custody_proof(
    custody: ActiveRecorderCustody,
    receipt: &RecorderStopReceipt,
    available_ports: &[serialport::SerialPortInfo],
    identity_port_opener: impl FnOnce() -> Result<Box<dyn serialport::SerialPort>, String>,
    authority: CustodyDeploymentAuthority<'_>,
) -> Result<RecorderCustodyProof, String> {
    let telemetry_stop_descriptor_sha256 =
        enumerated_port_descriptor_sha256(available_ports, &custody.telemetry_port, "telemetry")?;
    let identity_stop_descriptor_sha256 =
        enumerated_port_descriptor_sha256(available_ports, &custody.identity_port, "identity")?;
    if telemetry_stop_descriptor_sha256 != custody.telemetry_start_os_descriptor_sha256
        || identity_stop_descriptor_sha256 != custody.identity_start_os_descriptor_sha256
    {
        return Err("recorder custody OS descriptor changed between start and stop".to_string());
    }
    let binding = &custody.verified.authorization.binding;
    let telemetry_source_port_sha256 = recorder_source_port_sha256(&custody.telemetry_port);
    let identity_source_port_sha256 = recorder_source_port_sha256(&custody.identity_port);
    let expected = CustodyBindingInputs {
        protected_revision: authority.protected_revision,
        reference_rig_id: D12_RIGS[0],
        artifact_id: &receipt.artifact_id,
        model_id: &custody.model_id,
        contract_hash: &receipt.contract_hash,
        lockfile_hash: &receipt.lockfile_hash,
        telemetry_source_port_sha256: &telemetry_source_port_sha256,
        telemetry_os_descriptor_sha256: &telemetry_stop_descriptor_sha256,
        identity_source_port_sha256: &identity_source_port_sha256,
        identity_os_descriptor_sha256: &identity_stop_descriptor_sha256,
        recorder_adapter_probe_schema_version: RECORDER_ADAPTER_PROBE_SCHEMA_VERSION,
        recorder_adapter_schema_version: RECORDER_ADAPTER_SCHEMA_VERSION,
    };
    let stop_verified = load_and_verify_authorization(
        authority.trust_bundle_path,
        authority.trust_bundle_sha256,
        &custody.authorization_path,
        &expected,
        authority.now_unix_ms,
    )?;
    if stop_verified.trust_bundle_sha256 != custody.verified.trust_bundle_sha256
        || stop_verified.authorization_sha256 != custody.verified.authorization_sha256
        || stop_verified.authorization != custody.verified.authorization
    {
        return Err("recorder custody authority changed during the active capture".to_string());
    }
    let identity_port = identity_port_opener()?;
    let post_probe = probe_recorder_adapter_with_port(
        custody_probe_request(custody.identity_port.clone(), custody.identity_baud),
        true,
        identity_stop_descriptor_sha256.clone(),
        identity_port,
    )?;
    validate_custody_probe(&post_probe, &stop_verified.authorization, "stop")?;
    if post_probe.identity_sha256 != custody.pre_probe.identity_sha256
        || post_probe.device_uid_sha256 != custody.pre_probe.device_uid_sha256
        || post_probe.pre_identity_response_sha256 != custody.pre_probe.pre_identity_response_sha256
        || post_probe.post_identity_response_sha256
            != custody.pre_probe.post_identity_response_sha256
        || post_probe.transcript_sha256 != custody.pre_probe.transcript_sha256
    {
        return Err(
            "recorder custody identity or exact response transcript changed between start and stop"
                .to_string(),
        );
    }

    let inspection = inspect_recorder_archive_path(&custody.archive_path)?;
    if inspection.artifact_id != receipt.artifact_id
        || inspection.reference_rig_id != receipt.reference_rig_id
        || inspection.contract_hash != receipt.contract_hash
        || inspection.lockfile_hash != receipt.lockfile_hash
        || inspection.source_port_sha256 != receipt.source_port_sha256
        || inspection.started_at_unix_ms != receipt.started_at_unix_ms
        || inspection.stopped_at_unix_ms != receipt.stopped_at_unix_ms
    {
        return Err("canonical recorder archive does not match the completed receipt".to_string());
    }
    let recorder_receipt_sha256 = file_sha256(&custody.archive_path.join(RECORDER_RECEIPT_FILE))?;
    let proof = RecorderCustodyProof {
        schema_version: RECORDER_CUSTODY_PROOF_SCHEMA_VERSION,
        trust_bundle_schema_version: RECORDER_CUSTODY_TRUST_BUNDLE_SCHEMA_VERSION,
        authorization_schema_version: RECORDER_CUSTODY_AUTHORIZATION_SCHEMA_VERSION,
        recorder_adapter_probe_schema_version: RECORDER_ADAPTER_PROBE_SCHEMA_VERSION.to_string(),
        recorder_adapter_schema_version: RECORDER_ADAPTER_SCHEMA_VERSION.to_string(),
        authorization_id: binding.authorization_id.clone(),
        authorization_sha256: custody.verified.authorization_sha256,
        trust_bundle_id: custody.verified.trust_bundle.bundle_id.clone(),
        trust_bundle_sha256: custody.verified.trust_bundle_sha256,
        acceptance_authority_key_id: custody.verified.authorization.key_id,
        protected_revision: binding.protected_revision.clone(),
        purpose: RECORDER_CUSTODY_PURPOSE.to_string(),
        evidence_pack_schema_version: binding.evidence_pack_schema_version.clone(),
        evidence_pack_sha256: binding.evidence_pack_sha256.clone(),
        required_signoff_set_sha256: binding.required_signoff_set_sha256.clone(),
        reference_rig_id: receipt.reference_rig_id.clone(),
        artifact_id: receipt.artifact_id.clone(),
        model_id: custody.model_id,
        contract_hash: receipt.contract_hash.clone(),
        lockfile_hash: receipt.lockfile_hash.clone(),
        telemetry_source_port_sha256,
        telemetry_start_os_descriptor_sha256: custody.telemetry_start_os_descriptor_sha256,
        telemetry_stop_os_descriptor_sha256: telemetry_stop_descriptor_sha256,
        identity_source_port_sha256,
        identity_start_os_descriptor_sha256: custody.identity_start_os_descriptor_sha256,
        identity_stop_os_descriptor_sha256: identity_stop_descriptor_sha256,
        expected_identity_sha256: binding.expected_identity_sha256.clone(),
        pre_identity_sha256: custody.pre_probe.identity_sha256,
        post_identity_sha256: post_probe.identity_sha256,
        expected_device_uid_sha256: binding.expected_device_uid_sha256.clone(),
        pre_device_uid_sha256: custody.pre_probe.device_uid_sha256,
        post_device_uid_sha256: post_probe.device_uid_sha256,
        pre_observed_at_unix_ms: custody.pre_probe.observed_at_unix_ms,
        post_observed_at_unix_ms: post_probe.observed_at_unix_ms,
        start_pre_identity_response_sha256: custody.pre_probe.pre_identity_response_sha256,
        start_post_identity_response_sha256: custody.pre_probe.post_identity_response_sha256,
        start_transcript_sha256: custody.pre_probe.transcript_sha256,
        stop_pre_identity_response_sha256: post_probe.pre_identity_response_sha256,
        stop_post_identity_response_sha256: post_probe.post_identity_response_sha256,
        stop_transcript_sha256: post_probe.transcript_sha256,
        recorder_receipt_sha256,
        capture_started_at_unix_ms: receipt.started_at_unix_ms,
        capture_stopped_at_unix_ms: receipt.stopped_at_unix_ms,
        proof_created_at_unix_ms: unix_ms()?,
        acceptance_authority_signature_verified: true,
        identity_continuity_verified: true,
        capture_consent_confirmed: true,
        no_auto_arm: true,
        cryptographic_device_attestation: false,
        recorded_device_attested: false,
        device_identity_verified: false,
        field_session_verified: false,
        sharing_authorized: false,
        training_reuse_authorized: false,
    };
    write_custody_proof(RecorderCustodyProofInputs {
        proof_path: custody.proof_path,
        archive_path: custody.archive_path,
        proof: proof.clone(),
    })?;
    Ok(proof)
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
fn probe_recorder_adapter(
    request: RecorderAdapterProbeRequest,
) -> Result<RecorderAdapterProbe, String> {
    validate_adapter_probe_request(&request, hardware_enabled())?;
    let recorder_guard = lock_inactive_recorder(recorder_runtime())?;
    let available = serialport::available_ports()
        .map_err(|err| format!("list serial ports before adapter probe: {err}"))?;
    let descriptor = available
        .iter()
        .find(|candidate| candidate.port_name == request.port)
        .ok_or_else(|| {
            "adapter identity probe port must be reported by the operating system".to_string()
        })?;
    let descriptor_sha256 = os_serial_descriptor_sha256(descriptor)?;
    let port = serialport::new(&request.port, request.baud)
        .timeout(SERIAL_READ_TIMEOUT)
        .open()
        .map_err(|err| format!("open adapter identity probe port '{}': {err}", request.port))?;
    let result =
        probe_recorder_adapter_with_port(request, hardware_enabled(), descriptor_sha256, port);
    drop(recorder_guard);
    result
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
fn recorder_status() -> Result<RecorderControlStatus, String> {
    recorder_status_for(recorder_runtime())
}

#[tauri::command]
fn start_background_recording(request: RecorderRequest) -> Result<RecorderControlStatus, String> {
    if !hardware_enabled() {
        return Err(disabled_status().reason);
    }
    let available = serialport::available_ports()
        .map_err(|err| format!("list serial ports before recorder capture: {err}"))?
        .into_iter()
        .map(|port| port.port_name)
        .collect::<Vec<_>>();
    require_enumerated_serial_port(&request.port, &available)?;
    validate_recorder_request(&request, true)?;
    let port = serialport::new(&request.port, request.baud)
        .timeout(RECORDER_READ_TIMEOUT)
        .open()
        .map_err(|err| format!("open recorder serial port '{}': {err}", request.port))?;
    start_recorder_with_port(recorder_runtime(), request, port, true)
}

#[tauri::command]
fn start_custodied_background_recording(
    request: RecorderCustodyStartRequest,
) -> Result<RecorderControlStatus, String> {
    if !hardware_enabled() {
        return Err(disabled_status().reason);
    }
    validate_custody_start_request(&request)?;
    let mut active = lock_inactive_recorder(recorder_runtime())?;
    let available_ports = serialport::available_ports()
        .map_err(|err| format!("list serial ports before custodied capture: {err}"))?;
    let (trust_bundle_path, trust_bundle_sha256, protected_revision) =
        custody_deployment_authority()?;
    let now_unix_ms = u64::try_from(unix_ms()?)
        .map_err(|_| "system time exceeds recorder custody u64 range".to_string())?;
    let identity_path = request.identity_port.clone();
    let identity_baud = request.identity_baud;
    let telemetry_path = request.recorder.port.clone();
    let telemetry_baud = request.recorder.baud;
    custody_start_with_ports(
        &mut active,
        request,
        &available_ports,
        CustodyDeploymentAuthority {
            trust_bundle_path: &trust_bundle_path,
            trust_bundle_sha256: &trust_bundle_sha256,
            protected_revision: &protected_revision,
            now_unix_ms,
        },
        || {
            serialport::new(&identity_path, identity_baud)
                .timeout(SERIAL_READ_TIMEOUT)
                .open()
                .map_err(|err| format!("open custody identity port '{identity_path}': {err}"))
        },
        || {
            serialport::new(&telemetry_path, telemetry_baud)
                .timeout(RECORDER_READ_TIMEOUT)
                .open()
                .map_err(|err| format!("open custodied telemetry port '{telemetry_path}': {err}"))
        },
    )
}

#[tauri::command]
fn stop_background_recording() -> Result<RecorderStopReceipt, String> {
    stop_recorder(recorder_runtime())
}

#[tauri::command]
fn stop_custodied_background_recording(
    request: RecorderCustodyStopRequest,
) -> Result<RecorderCustodyProof, String> {
    let runtime = recorder_runtime();
    let mut guard = runtime
        .active
        .lock()
        .map_err(|_| "recorder runtime lock is poisoned".to_string())?;
    let active_ref = guard
        .as_ref()
        .ok_or_else(|| "no Desktop background recorder is active".to_string())?;
    let custody_ref = active_ref
        .custody
        .as_ref()
        .ok_or_else(|| "the active Desktop recorder was not started under custody".to_string())?;
    validate_custody_stop_request(&request, custody_ref)?;
    let active = guard.take().expect("active recorder checked above");
    let _ = active.stop_tx.send(());
    let receipt = active
        .join
        .join()
        .map_err(|_| "Desktop background recorder thread panicked".to_string())?
        .map_err(|err| format!("custodied recorder did not complete its v1 archive: {err}"))?;
    let custody = active
        .custody
        .expect("custodied recorder checked before clean stop");
    let result = (|| {
        let available_ports = serialport::available_ports()
            .map_err(|err| format!("list serial ports after custodied capture: {err}"))?;
        let (trust_bundle_path, trust_bundle_sha256, protected_revision) =
            custody_deployment_authority()?;
        let now_unix_ms = u64::try_from(unix_ms()?)
            .map_err(|_| "system time exceeds recorder custody u64 range".to_string())?;
        let identity_path = custody.identity_port.clone();
        let identity_baud = custody.identity_baud;
        finish_custody_proof(
            custody,
            &receipt,
            &available_ports,
            || {
                serialport::new(&identity_path, identity_baud)
                    .timeout(SERIAL_READ_TIMEOUT)
                    .open()
                    .map_err(|err| {
                        format!("open custody identity port '{identity_path}' at stop: {err}")
                    })
            },
            CustodyDeploymentAuthority {
                trust_bundle_path: &trust_bundle_path,
                trust_bundle_sha256: &trust_bundle_sha256,
                protected_revision: &protected_revision,
                now_unix_ms,
            },
        )
    })();
    drop(guard);
    result.map_err(|err| {
        format!(
            "recorder archive completed but custody proof was not created; the five-file archive remains valid and unpromoted: {err}"
        )
    })
}

fn strict_recorder_archive_path(archive_path: String) -> Result<PathBuf, String> {
    if archive_path.trim().is_empty() || archive_path.len() > 4_096 {
        return Err("archivePath must be a non-empty path of at most 4096 bytes".to_string());
    }
    let output_dir = PathBuf::from(archive_path);
    if !output_dir.is_absolute() {
        return Err("archivePath must be absolute".to_string());
    }
    Ok(output_dir)
}

#[tauri::command]
fn inspect_recorder_archive(archive_path: String) -> Result<RecorderArchiveInspection, String> {
    let output_dir = strict_recorder_archive_path(archive_path)?;
    inspect_recorder_archive_path(&output_dir)
}

#[tauri::command]
fn prepare_recorder_archive_upload(archive_path: String) -> Result<RecorderUploadPlan, String> {
    let output_dir = strict_recorder_archive_path(archive_path)?;
    recorder_upload_plan_path(&output_dir)
}

#[tauri::command]
async fn upload_recorder_archive_files(
    archive_path: String,
    uploads: Vec<RecorderUploadContract>,
) -> Result<RecorderUploadReceipt, String> {
    let output_dir = strict_recorder_archive_path(archive_path)?;
    let expected_origin = env::var(RECORDER_UPLOAD_ORIGIN_ENV)
        .map_err(|_| format!("{RECORDER_UPLOAD_ORIGIN_ENV} is required before recorder upload"))?;
    tauri::async_runtime::spawn_blocking(move || {
        upload_recorder_archive_files_path(&output_dir, uploads, &expected_origin)
    })
    .await
    .map_err(|err| format!("recorder upload task failed: {err}"))?
}

#[cfg(not(test))]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            bridge_status,
            list_serial_ports,
            probe_recorder_adapter,
            write_serial_config,
            recorder_status,
            start_background_recording,
            start_custodied_background_recording,
            stop_background_recording,
            stop_custodied_background_recording,
            inspect_recorder_archive,
            prepare_recorder_archive_upload,
            upload_recorder_archive_files
        ])
        .run(tauri::generate_context!())
        .expect("FORGE Desktop failed to start");
}

#[cfg(test)]
fn main() {}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use serialport::SerialPort;
    use std::io::{Read, Write};
    #[cfg(unix)]
    use std::net::TcpListener;

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

    fn recorder_request(dir: &Path, artifact_id: &str) -> RecorderRequest {
        RecorderRequest {
            artifact_id: artifact_id.to_string(),
            output_dir: dir.to_string_lossy().into_owned(),
            sample_rate_hz: 120,
            reference_rig_id: Some(D12_RIGS[1].to_string()),
            physical_confirmation: RECORDER_PHYSICAL_CONFIRMATION.to_string(),
            port: "pseudo-terminal".to_string(),
            baud: BETAFLIGHT_SERIAL_BAUD,
            contract_hash: "11".repeat(32),
            lockfile_hash: "22".repeat(32),
            environment: serde_json::json!({"courseId": "bench", "windMps": 0.0}),
            seed: 17,
        }
    }

    fn recorder_frame(artifact_id: &str, sequence: u64, t: f64) -> Vec<u8> {
        let mut bytes = serde_json::to_vec(&serde_json::json!({
            "schemaVersion": RECORDER_FRAME_SCHEMA_VERSION,
            "artifactId": artifact_id,
            "sequence": sequence,
            "t": t,
            "state": {
                "positionM": [t, 0.0, 0.0],
                "batteryV": 16.0 - t
            }
        }))
        .expect("frame serializes");
        bytes.push(b'\n');
        bytes
    }

    #[cfg(unix)]
    fn complete_test_recorder_archive(dir: &Path, artifact_id: &str) -> RecorderStopReceipt {
        let runtime = RecorderRuntime::default();
        let (mut master, slave) =
            serialport::TTYPort::pair().expect("recorder pseudo terminal pair");
        start_recorder_with_port(
            &runtime,
            recorder_request(dir, artifact_id),
            Box::new(slave),
            true,
        )
        .expect("test recorder starts");
        for sequence in 0..3 {
            master
                .write_all(&recorder_frame(
                    artifact_id,
                    sequence,
                    sequence as f64 * 0.25,
                ))
                .expect("write test telemetry frame");
        }
        master.flush().expect("flush test telemetry frames");
        thread::sleep(Duration::from_millis(150));
        stop_recorder(&runtime).expect("test recorder stops")
    }

    #[cfg(unix)]
    fn recorder_upload_contracts(
        plan: &RecorderUploadPlan,
        origin: &str,
    ) -> Vec<RecorderUploadContract> {
        plan.files
            .iter()
            .map(|file| RecorderUploadContract {
                name: file.name.to_string(),
                method: "PUT".to_string(),
                url: format!(
                    "{origin}/{}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=test&X-Amz-Date=20260716T000000Z&X-Amz-Expires=60&X-Amz-SignedHeaders=content-type%3Bhost%3Bx-amz-checksum-sha256&X-Amz-Signature={}",
                    file.name,
                    "ab".repeat(32)
                ),
                headers: BTreeMap::from([
                    ("content-type".to_string(), file.content_type.to_string()),
                    (
                        "x-amz-checksum-sha256".to_string(),
                        sha256_base64(&file.sha256).expect("plan hash encodes"),
                    ),
                ]),
                byte_size: file.byte_size,
                sha256: file.sha256.clone(),
            })
            .collect()
    }

    #[cfg(unix)]
    fn read_test_http_request(mut stream: std::net::TcpStream) -> (String, Vec<u8>) {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .expect("test HTTP timeout");
        let mut bytes = Vec::new();
        let (header_end, content_length) = loop {
            let mut chunk = [0_u8; 4096];
            let count = stream.read(&mut chunk).expect("read upload request");
            assert!(count > 0, "upload request ended before headers");
            bytes.extend_from_slice(&chunk[..count]);
            if let Some(header_end) = bytes.windows(4).position(|window| window == b"\r\n\r\n") {
                let headers =
                    std::str::from_utf8(&bytes[..header_end]).expect("HTTP headers UTF-8");
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        line.split_once(':').and_then(|(name, value)| {
                            name.eq_ignore_ascii_case("content-length")
                                .then(|| value.trim().parse::<usize>().expect("content length"))
                        })
                    })
                    .expect("sized upload has content length");
                break (header_end + 4, content_length);
            }
            assert!(bytes.len() < 32 * 1024, "HTTP headers exceed test cap");
        };
        while bytes.len() < header_end + content_length {
            let mut chunk = [0_u8; 4096];
            let count = stream.read(&mut chunk).expect("read upload body");
            assert!(count > 0, "upload request ended before declared body");
            bytes.extend_from_slice(&chunk[..count]);
        }
        let request_line = std::str::from_utf8(&bytes[..header_end])
            .expect("HTTP request UTF-8")
            .lines()
            .next()
            .expect("HTTP request line")
            .to_string();
        let body = bytes[header_end..header_end + content_length].to_vec();
        stream
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .expect("write upload response");
        (request_line, body)
    }

    fn rewrite_pretty_json(path: &Path, value: &impl Serialize) {
        let mut bytes = serde_json::to_vec_pretty(value).expect("pretty JSON serializes");
        bytes.push(b'\n');
        fs::write(path, bytes).expect("rewrite pretty JSON");
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

    fn adapter_probe_request() -> RecorderAdapterProbeRequest {
        RecorderAdapterProbeRequest {
            port: "pseudo-terminal".to_string(),
            baud: BETAFLIGHT_SERIAL_BAUD,
            reference_rig_id: Some(D12_RIGS[0].to_string()),
            physical_confirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION.to_string(),
        }
    }

    fn msp_reply(command: u8, payload: &[u8]) -> Vec<u8> {
        assert!(payload.len() <= u8::MAX as usize);
        let mut bytes = vec![b'$', b'M', b'>', payload.len() as u8, command];
        bytes.extend_from_slice(payload);
        let checksum = bytes[3..].iter().fold(0_u8, |value, byte| value ^ byte);
        bytes.push(checksum);
        bytes
    }

    fn pstring(value: &str) -> Vec<u8> {
        assert!(value.len() <= u8::MAX as usize);
        let mut bytes = vec![value.len() as u8];
        bytes.extend_from_slice(value.as_bytes());
        bytes
    }

    fn msp_board_info_payload(target: &str) -> Vec<u8> {
        let mut payload = b"KH7\0".to_vec();
        payload.extend_from_slice(&[0, 0, 2, 1]);
        payload.extend_from_slice(&pstring(target));
        payload.extend_from_slice(&pstring("Kakute H7 V1.5"));
        payload.extend_from_slice(&pstring("HBRO"));
        payload.extend_from_slice(&[0_u8; 32]);
        payload.extend_from_slice(&[9, 0, 0x80, 0x3e, 0, 0, 0, 0, 4, 1]);
        payload
    }

    fn msp_identity_payloads(uid: [u8; 12]) -> Vec<(u8, Vec<u8>)> {
        let mut version = vec![25, 12, 5];
        version.extend_from_slice(&pstring("2025.12.5"));
        vec![
            (
                MSP_API_VERSION,
                vec![MSP_PROTOCOL_VERSION, MSP_API_MAJOR, MSP_API_MINOR],
            ),
            (MSP_FC_VARIANT, b"BTFL".to_vec()),
            (MSP_FC_VERSION, version),
            (MSP_BOARD_INFO, msp_board_info_payload("KAKUTEH7")),
            (MSP_BUILD_INFO, b"Jul 16 202612:00:00abcdef0".to_vec()),
            (MSP_UID, uid.to_vec()),
        ]
    }

    #[cfg(unix)]
    fn custody_available_ports() -> Vec<serialport::SerialPortInfo> {
        vec![
            serialport::SerialPortInfo {
                port_name: "custody-telemetry-port".to_string(),
                port_type: serialport::SerialPortType::Unknown,
            },
            serialport::SerialPortInfo {
                port_name: "custody-identity-port".to_string(),
                port_type: serialport::SerialPortType::Unknown,
            },
        ]
    }

    #[cfg(unix)]
    fn custody_expected_identity(uid: [u8; 12]) -> (String, String) {
        let uid_sha256 = domain_sha256(b"forge-recorder-device-uid/1.0.0\0", &uid);
        let binding = MspIdentityBinding {
            schema_version: RECORDER_ADAPTER_SCHEMA_VERSION,
            firmware_version: "2025.12.5",
            msp_protocol_version: MSP_PROTOCOL_VERSION,
            msp_api_major: MSP_API_MAJOR,
            msp_api_minor: MSP_API_MINOR,
            flight_controller_variant: "BTFL",
            board_identifier: "KH7",
            target_name: "KAKUTEH7",
            board_name: "Kakute H7 V1.5",
            manufacturer_id: "HBRO",
            device_uid_sha256: &uid_sha256,
        };
        let identity_bytes = serde_json::to_vec(&binding).expect("identity binding serializes");
        (
            domain_sha256(b"forge-recorder-adapter-identity/1.0.0\0", &identity_bytes),
            uid_sha256,
        )
    }

    #[cfg(unix)]
    fn lower_hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    #[cfg(unix)]
    fn write_custody_authority(
        root: &Path,
        request: &RecorderCustodyStartRequest,
        available_ports: &[serialport::SerialPortInfo],
        uid: [u8; 12],
        now: u64,
    ) -> (PathBuf, String, String) {
        let protected_revision = "c".repeat(40);
        let signing_key = SigningKey::from_bytes(&[23_u8; 32]);
        let trust = custody::RecorderCustodyTrustBundle {
            schema_version: RECORDER_CUSTODY_TRUST_BUNDLE_SCHEMA_VERSION.to_string(),
            bundle_id: "controlled-lab-bundle-1".to_string(),
            purpose: RECORDER_CUSTODY_PURPOSE.to_string(),
            keys: vec![custody::RecorderCustodyTrustKey {
                key_id: "controlled-lab-key-1".to_string(),
                algorithm: "Ed25519".to_string(),
                public_key_hex: lower_hex(signing_key.verifying_key().as_bytes()),
                not_before_unix_ms: now - 10_000,
                not_after_unix_ms: now + 3_600_000,
                revoked_at_unix_ms: None,
            }],
        };
        let trust_bytes = serde_json::to_vec_pretty(&trust).expect("trust bundle serializes");
        let trust_path = root.join("custody-trust.json");
        fs::write(&trust_path, &trust_bytes).expect("write custody trust bundle");
        let telemetry_descriptor_sha256 =
            enumerated_port_descriptor_sha256(available_ports, &request.recorder.port, "telemetry")
                .expect("telemetry descriptor");
        let identity_descriptor_sha256 =
            enumerated_port_descriptor_sha256(available_ports, &request.identity_port, "identity")
                .expect("identity descriptor");
        let (expected_identity_sha256, expected_device_uid_sha256) = custody_expected_identity(uid);
        let binding = custody::RecorderCustodyAuthorizationBinding {
            authorization_id: "custody-authorization-1".to_string(),
            purpose: RECORDER_CUSTODY_PURPOSE.to_string(),
            protected_revision: protected_revision.clone(),
            evidence_pack_schema_version: "forge.external-acceptance.v1".to_string(),
            evidence_pack_sha256: "31".repeat(32),
            required_signoff_set_sha256: "32".repeat(32),
            reference_rig_id: D12_RIGS[0].to_string(),
            artifact_id: request.recorder.artifact_id.clone(),
            model_id: request.model_id.clone(),
            contract_hash: request.recorder.contract_hash.clone(),
            lockfile_hash: request.recorder.lockfile_hash.clone(),
            telemetry_source_port_sha256: recorder_source_port_sha256(&request.recorder.port),
            telemetry_os_descriptor_sha256: telemetry_descriptor_sha256,
            identity_source_port_sha256: recorder_source_port_sha256(&request.identity_port),
            identity_os_descriptor_sha256: identity_descriptor_sha256,
            recorder_adapter_probe_schema_version: RECORDER_ADAPTER_PROBE_SCHEMA_VERSION
                .to_string(),
            recorder_adapter_schema_version: RECORDER_ADAPTER_SCHEMA_VERSION.to_string(),
            expected_identity_sha256,
            expected_device_uid_sha256,
            issued_at_unix_ms: now - 2_000,
            not_before_unix_ms: now - 1_000,
            expires_at_unix_ms: now + 60_000,
            capture_consent_confirmed: true,
            no_auto_arm: true,
            cryptographic_device_attestation: false,
            recorded_device_attested: false,
            field_session_verified: false,
            sharing_authorized: false,
            training_reuse_authorized: false,
        };
        let mut signed_message = b"forge-recorder-custody-authorization/1.0.0\0".to_vec();
        signed_message
            .extend_from_slice(&serde_json::to_vec(&binding).expect("custody binding serializes"));
        let authorization = custody::RecorderCustodyAuthorization {
            schema_version: RECORDER_CUSTODY_AUTHORIZATION_SCHEMA_VERSION.to_string(),
            key_id: "controlled-lab-key-1".to_string(),
            algorithm: "Ed25519".to_string(),
            signature_hex: lower_hex(&signing_key.sign(&signed_message).to_bytes()),
            binding,
        };
        fs::write(
            &request.authorization_path,
            serde_json::to_vec_pretty(&authorization).expect("authorization serializes"),
        )
        .expect("write custody authorization");
        (trust_path, sha256_hex(&trust_bytes), protected_revision)
    }

    #[cfg(unix)]
    fn custody_start_request(root: &Path, artifact_id: &str) -> RecorderCustodyStartRequest {
        let archive = root.join("archive");
        let mut recorder = recorder_request(&archive, artifact_id);
        recorder.reference_rig_id = Some(D12_RIGS[0].to_string());
        recorder.port = "custody-telemetry-port".to_string();
        RecorderCustodyStartRequest {
            recorder,
            model_id: "admitted-model-1".to_string(),
            identity_port: "custody-identity-port".to_string(),
            identity_baud: BETAFLIGHT_SERIAL_BAUD,
            identity_physical_confirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION.to_string(),
            authorization_path: root
                .join("custody-authorization.json")
                .to_string_lossy()
                .into_owned(),
            custody_proof_path: root
                .join("custody-proof.json")
                .to_string_lossy()
                .into_owned(),
        }
    }

    #[cfg(unix)]
    fn execute_custody_round_trip(
        root: &Path,
        start_uid: [u8; 12],
        stop_uid: [u8; 12],
        precreate_proof: bool,
    ) -> (Result<RecorderCustodyProof, String>, PathBuf, PathBuf) {
        fs::create_dir_all(root).expect("custody test root");
        let request = custody_start_request(root, "custodied-artifact");
        let archive_path = PathBuf::from(&request.recorder.output_dir);
        let proof_path = PathBuf::from(&request.custody_proof_path);
        if precreate_proof {
            fs::write(&proof_path, b"existing proof must not be overwritten\n")
                .expect("precreate custody proof");
        }
        let available_ports = custody_available_ports();
        let now = u64::try_from(unix_ms().expect("current test time")).expect("u64 time");
        let (trust_path, trust_pin, protected_revision) =
            write_custody_authority(root, &request, &available_ports, start_uid, now);

        let (identity_start_master, identity_start_slave) =
            serialport::TTYPort::pair().expect("start identity pseudo terminal pair");
        let identity_start_target = spawn_fake_msp(
            identity_start_master,
            vec![
                msp_identity_payloads(start_uid),
                msp_identity_payloads(start_uid),
            ],
        );
        let (mut telemetry_master, telemetry_slave) =
            serialport::TTYPort::pair().expect("telemetry pseudo terminal pair");
        let runtime = RecorderRuntime::default();
        let mut guard = lock_inactive_recorder(&runtime).expect("inactive recorder lock");
        custody_start_with_ports(
            &mut guard,
            request,
            &available_ports,
            CustodyDeploymentAuthority {
                trust_bundle_path: &trust_path,
                trust_bundle_sha256: &trust_pin,
                protected_revision: &protected_revision,
                now_unix_ms: now,
            },
            move || Ok(Box::new(identity_start_slave)),
            move || Ok(Box::new(telemetry_slave)),
        )
        .expect("custodied recorder starts after signed identity observation");
        drop(guard);
        identity_start_target
            .join()
            .expect("start identity target completes");
        for sequence in 0..3 {
            telemetry_master
                .write_all(&recorder_frame(
                    "custodied-artifact",
                    sequence,
                    sequence as f64 * 0.25,
                ))
                .expect("write custodied telemetry frame");
        }
        telemetry_master
            .flush()
            .expect("flush custodied telemetry frames");
        thread::sleep(Duration::from_millis(150));

        let mut guard = runtime.active.lock().expect("custody stop lock");
        let active_ref = guard.as_ref().expect("custodied recorder active");
        validate_custody_stop_request(
            &RecorderCustodyStopRequest {
                authorization_id: "custody-authorization-1".to_string(),
                physical_confirmation: RECORDER_ADAPTER_PROBE_CONFIRMATION.to_string(),
            },
            active_ref.custody.as_ref().expect("custody context"),
        )
        .expect("custody stop confirmation");
        let active = guard.take().expect("take custodied recorder");
        let _ = active.stop_tx.send(());
        let receipt = active
            .join
            .join()
            .expect("recorder thread joins")
            .expect("recorder archive completes");
        let custody = active.custody.expect("custody context survives capture");
        let (identity_stop_master, identity_stop_slave) =
            serialport::TTYPort::pair().expect("stop identity pseudo terminal pair");
        let identity_stop_target = spawn_fake_msp(
            identity_stop_master,
            vec![
                msp_identity_payloads(stop_uid),
                msp_identity_payloads(stop_uid),
            ],
        );
        let result = finish_custody_proof(
            custody,
            &receipt,
            &available_ports,
            move || Ok(Box::new(identity_stop_slave)),
            CustodyDeploymentAuthority {
                trust_bundle_path: &trust_path,
                trust_bundle_sha256: &trust_pin,
                protected_revision: &protected_revision,
                now_unix_ms: now + 1_000,
            },
        );
        drop(guard);
        identity_stop_target
            .join()
            .expect("stop identity target completes");
        (result, archive_path, proof_path)
    }

    #[cfg(unix)]
    fn spawn_fake_msp(
        mut master: serialport::TTYPort,
        passes: Vec<Vec<(u8, Vec<u8>)>>,
    ) -> std::thread::JoinHandle<()> {
        std::thread::spawn(move || {
            master
                .set_timeout(Duration::from_secs(2))
                .expect("fake MSP target timeout");
            for pass in passes {
                for (command, payload) in pass {
                    let expected = msp_v1_request(command).expect("read-only MSP request");
                    let mut request = [0_u8; 6];
                    master
                        .read_exact(&mut request)
                        .expect("read exact MSP request from Desktop");
                    assert_eq!(request, expected);
                    master
                        .write_all(&msp_reply(command, &payload))
                        .expect("write fake MSP response");
                }
            }
            std::thread::sleep(Duration::from_millis(50));
        })
    }

    #[cfg(unix)]
    fn query_fake_msp_reply(reply: Vec<u8>) -> Result<MspReply, String> {
        let (mut master, mut slave) =
            serialport::TTYPort::pair().expect("single-reply pseudo terminal pair");
        slave
            .set_timeout(SERIAL_READ_TIMEOUT)
            .expect("single-reply pseudo terminal timeout");
        let target = std::thread::spawn(move || {
            let mut request = [0_u8; 6];
            master
                .read_exact(&mut request)
                .expect("read single MSP request");
            assert_eq!(
                request,
                msp_v1_request(MSP_API_VERSION).expect("API version request")
            );
            master.write_all(&reply).expect("write single MSP reply");
            std::thread::sleep(Duration::from_millis(50));
        });
        let result = query_msp_v1(&mut slave, "pseudo-terminal", MSP_API_VERSION);
        target.join().expect("single-reply target completes");
        result
    }

    #[cfg(unix)]
    #[test]
    fn read_only_msp_adapter_probe_observes_stable_identity_without_attestation() {
        let uid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        let (master, mut slave) =
            serialport::TTYPort::pair().expect("adapter pseudo terminal pair");
        slave
            .set_timeout(SERIAL_READ_TIMEOUT)
            .expect("adapter pseudo terminal timeout");
        let target = spawn_fake_msp(
            master,
            vec![msp_identity_payloads(uid), msp_identity_payloads(uid)],
        );
        let probe = probe_recorder_adapter_with_port(
            adapter_probe_request(),
            true,
            "aa".repeat(32),
            Box::new(slave),
        )
        .expect("read-only adapter probe succeeds");
        target.join().expect("fake MSP target completes");

        assert_eq!(probe.schema_version, RECORDER_ADAPTER_PROBE_SCHEMA_VERSION);
        assert_eq!(
            probe.adapter_schema_version,
            RECORDER_ADAPTER_SCHEMA_VERSION
        );
        assert_eq!(probe.probe_maturity, "unattested-read-only-probe");
        assert_eq!(probe.reference_rig_id, D12_RIGS[0]);
        assert_eq!(probe.firmware_version, "2025.12.5");
        assert_eq!(probe.flight_controller_variant, "BTFL");
        assert_eq!(probe.board_identifier, "KH7");
        assert_eq!(probe.target_name, "KAKUTEH7");
        assert_eq!(probe.read_only_command_ids, READ_ONLY_MSP_COMMANDS);
        assert_eq!(
            probe.pre_identity_response_sha256,
            probe.post_identity_response_sha256
        );
        for digest in [
            &probe.source_port_sha256,
            &probe.os_descriptor_sha256,
            &probe.device_uid_sha256,
            &probe.identity_sha256,
            &probe.pre_identity_response_sha256,
            &probe.post_identity_response_sha256,
            &probe.transcript_sha256,
        ] {
            assert!(is_sha256_hex(digest));
        }
        assert!(probe.adapter_protocol_verified);
        assert!(probe.stable_identity_observed);
        assert!(!probe.device_identity_verified);
        assert!(!probe.cryptographic_device_attestation);
        assert!(!probe.recorded_device_attested);
        assert!(!probe.field_session_verified);
        assert!(!probe.sharing_authorized);
        assert!(!probe.training_reuse_authorized);
        assert!(probe.no_auto_arm);
        let serialized = serde_json::to_string(&probe).expect("probe serializes");
        assert!(!serialized.contains("0102030405060708090a0b0c"));
    }

    #[cfg(unix)]
    #[test]
    fn msp_adapter_probe_refuses_checksum_protocol_target_and_identity_drift() {
        assert!(msp_v1_request(99)
            .expect_err("write-capable or unknown command must fail")
            .contains("read-only allowlist"));
        assert!(parse_firmware_version(&[26, 6, 1, 8, b'2'])
            .expect_err("wrong firmware family must fail")
            .contains("2025.12"));
        assert!(parse_board_info(&msp_board_info_payload("OTHERH7"))
            .expect_err("wrong target must fail")
            .contains("KAKUTEH7"));
        let mut truncated_board = msp_board_info_payload("KAKUTEH7");
        truncated_board.pop();
        assert!(parse_board_info(&truncated_board)
            .expect_err("board API tail drift must fail")
            .contains("exact API 1.47"));
        assert!(validate_build_info(b"Jul 16 202612:00:00ABCDEF0")
            .expect_err("uppercase git identity must fail")
            .contains("build information"));
        assert!(validate_build_info(b"Jul 16 202612:00:00abcdef0\x01")
            .expect_err("partial build option must fail")
            .contains("build information"));

        let mut bad_checksum = msp_reply(MSP_API_VERSION, &[0, 1, 47]);
        *bad_checksum.last_mut().expect("checksum byte") ^= 0xff;
        let checksum_error =
            query_fake_msp_reply(bad_checksum).expect_err("bad checksum must fail");
        assert!(
            checksum_error.contains("checksum"),
            "unexpected checksum refusal: {checksum_error}"
        );

        let mut error_direction = msp_reply(MSP_API_VERSION, &[0, 1, 47]);
        error_direction[2] = b'!';
        assert!(query_fake_msp_reply(error_direction)
            .expect_err("MSP error direction must fail")
            .contains("direction"));

        let mut wrong_command = msp_reply(MSP_FC_VARIANT, b"BTFL");
        wrong_command[4] = MSP_FC_VARIANT;
        assert!(query_fake_msp_reply(wrong_command)
            .expect_err("wrong echoed command must fail")
            .contains("active request"));

        let first_uid = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        let (api_master, mut api_slave) =
            serialport::TTYPort::pair().expect("wrong-API pseudo terminal pair");
        api_slave
            .set_timeout(SERIAL_READ_TIMEOUT)
            .expect("wrong-API pseudo terminal timeout");
        let mut wrong_api = msp_identity_payloads(first_uid);
        wrong_api[0].1 = vec![MSP_PROTOCOL_VERSION, MSP_API_MAJOR, MSP_API_MINOR - 1];
        let api_target = spawn_fake_msp(api_master, vec![wrong_api]);
        assert!(probe_recorder_adapter_with_port(
            adapter_probe_request(),
            true,
            "cc".repeat(32),
            Box::new(api_slave),
        )
        .expect_err("wrong MSP API must fail")
        .contains("API 1.47"));
        api_target.join().expect("wrong-API target completes");

        let (uid_master, mut uid_slave) =
            serialport::TTYPort::pair().expect("placeholder-UID pseudo terminal pair");
        uid_slave
            .set_timeout(SERIAL_READ_TIMEOUT)
            .expect("placeholder-UID pseudo terminal timeout");
        let uid_target = spawn_fake_msp(uid_master, vec![msp_identity_payloads([0_u8; 12])]);
        assert!(probe_recorder_adapter_with_port(
            adapter_probe_request(),
            true,
            "dd".repeat(32),
            Box::new(uid_slave),
        )
        .expect_err("placeholder UID must fail")
        .contains("non-placeholder"));
        uid_target.join().expect("placeholder-UID target completes");

        let second_uid = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        let (master, mut slave) = serialport::TTYPort::pair().expect("drift pseudo terminal pair");
        slave
            .set_timeout(SERIAL_READ_TIMEOUT)
            .expect("drift pseudo terminal timeout");
        let target = spawn_fake_msp(
            master,
            vec![
                msp_identity_payloads(first_uid),
                msp_identity_payloads(second_uid),
            ],
        );
        assert!(probe_recorder_adapter_with_port(
            adapter_probe_request(),
            true,
            "bb".repeat(32),
            Box::new(slave),
        )
        .expect_err("identity drift must fail")
        .contains("changed between"));
        target.join().expect("drift target completes");

        let mut wrong_rig = adapter_probe_request();
        wrong_rig.reference_rig_id = Some(D12_RIGS[1].to_string());
        assert!(validate_adapter_probe_request(&wrong_rig, true)
            .expect_err("rover cannot use Betaflight adapter")
            .contains("reference quad"));
        assert!(
            validate_adapter_probe_request(&adapter_probe_request(), false)
                .expect_err("disabled gates must fail")
                .contains("hardware-enable")
        );
    }

    #[cfg(unix)]
    #[test]
    fn signed_custody_brackets_clean_archive_and_writes_separate_nonclaim_proof() {
        let root = test_dir("custody-round-trip");
        let uid = [1, 3, 5, 7, 9, 11, 2, 4, 6, 8, 10, 12];
        let (result, archive_path, proof_path) = execute_custody_round_trip(&root, uid, uid, false);
        let proof = result.expect("matching start/stop identity creates custody proof");
        assert_eq!(proof.schema_version, RECORDER_CUSTODY_PROOF_SCHEMA_VERSION);
        assert_eq!(proof.authorization_id, "custody-authorization-1");
        assert!(is_sha256_hex(&proof.authorization_sha256));
        assert!(proof.acceptance_authority_signature_verified);
        assert!(proof.identity_continuity_verified);
        assert!(proof.capture_consent_confirmed);
        assert!(proof.no_auto_arm);
        assert!(!proof.cryptographic_device_attestation);
        assert!(!proof.recorded_device_attested);
        assert!(!proof.device_identity_verified);
        assert!(!proof.field_session_verified);
        assert!(!proof.sharing_authorized);
        assert!(!proof.training_reuse_authorized);
        assert_eq!(proof.pre_identity_sha256, proof.post_identity_sha256);
        assert_eq!(proof.pre_device_uid_sha256, proof.post_device_uid_sha256);
        assert_eq!(
            proof.start_pre_identity_response_sha256,
            proof.stop_pre_identity_response_sha256
        );
        assert_eq!(proof.start_transcript_sha256, proof.stop_transcript_sha256);
        assert!(proof.pre_observed_at_unix_ms <= proof.capture_started_at_unix_ms);
        assert!(proof.capture_started_at_unix_ms <= proof.capture_stopped_at_unix_ms);
        assert!(proof.capture_stopped_at_unix_ms <= proof.post_observed_at_unix_ms);
        assert!(proof.post_observed_at_unix_ms <= proof.proof_created_at_unix_ms);
        assert!(is_sha256_hex(&proof.recorder_receipt_sha256));
        assert!(proof_path.is_file());
        assert_eq!(
            fs::read_dir(&archive_path)
                .expect("list canonical archive")
                .count(),
            5
        );
        inspect_recorder_archive_path(&archive_path).expect("archive v1 remains canonical");
        let proof_json = fs::read_to_string(&proof_path).expect("proof is readable");
        assert!(!proof_json.contains("signatureHex"));
        assert!(!proof_json.contains("privateKey"));
        fs::remove_dir_all(root).expect("custody round-trip cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn custody_identity_substitution_or_existing_proof_preserves_valid_archive_without_proof() {
        let substitution_root = test_dir("custody-substitution");
        let start_uid = [1, 3, 5, 7, 9, 11, 2, 4, 6, 8, 10, 12];
        let stop_uid = [12, 10, 8, 6, 4, 2, 11, 9, 7, 5, 3, 1];
        let (substitution, archive_path, proof_path) =
            execute_custody_round_trip(&substitution_root, start_uid, stop_uid, false);
        assert!(substitution
            .expect_err("identity substitution must refuse custody")
            .contains("signed authorization"));
        assert!(!proof_path.exists());
        inspect_recorder_archive_path(&archive_path)
            .expect("identity substitution does not erase the valid archive");
        fs::remove_dir_all(substitution_root).expect("substitution cleanup");

        let overwrite_root = test_dir("custody-overwrite");
        let (overwrite, archive_path, proof_path) =
            execute_custody_round_trip(&overwrite_root, start_uid, start_uid, true);
        assert!(overwrite
            .expect_err("existing proof must refuse overwrite")
            .contains("create custody proof"));
        assert_eq!(
            fs::read_to_string(proof_path).expect("existing proof remains untouched"),
            "existing proof must not be overwritten\n"
        );
        inspect_recorder_archive_path(&archive_path)
            .expect("overwrite refusal does not erase the valid archive");
        fs::remove_dir_all(overwrite_root).expect("overwrite cleanup");
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

    #[cfg(unix)]
    #[test]
    fn background_recorder_captures_indexed_replay_over_a_real_pseudo_terminal() {
        let dir = test_dir("recorder");
        let request = recorder_request(&dir, "art_replay_1");
        let runtime = RecorderRuntime::default();
        assert!(lock_inactive_recorder(&runtime).is_ok());
        let inactive = recorder_status_for(&runtime).expect("inactive recorder status");
        assert_eq!(inactive.schema_version, RECORDER_CONTROL_SCHEMA_VERSION);
        assert_eq!(inactive.state, "inactive");
        assert_eq!(inactive.artifact_id, None);
        assert!(!inactive.capture_consent_confirmed);
        assert!(!inactive.recorded_device_attested);
        assert!(!inactive.user_owned);
        assert!(inactive.no_auto_arm);
        let (mut master, slave) = serialport::TTYPort::pair().expect("recorder pseudo terminal");
        let start = start_recorder_with_port(&runtime, request, Box::new(slave), true)
            .expect("recorder starts");
        let probe_while_recording_error = match lock_inactive_recorder(&runtime) {
            Ok(_) => panic!("adapter probe must refuse an active recorder"),
            Err(error) => error,
        };
        assert!(probe_while_recording_error.contains("recorder to be inactive"));
        assert_eq!(start.schema_version, RECORDER_CONTROL_SCHEMA_VERSION);
        assert_eq!(start.state, "recording");
        assert_eq!(start.artifact_id.as_deref(), Some("art_replay_1"));
        assert_eq!(start.reference_rig_id.as_deref(), Some(D12_RIGS[1]));
        assert!(start.contract_hash.as_deref().is_some_and(is_sha256_hex));
        assert!(start.lockfile_hash.as_deref().is_some_and(is_sha256_hex));
        assert_eq!(start.source_baud, Some(BETAFLIGHT_SERIAL_BAUD));
        assert_eq!(start.sample_rate_hz, Some(120));
        assert_eq!(start.capture_maturity, Some("local-serial-integration"));
        assert!(start.capture_consent_confirmed);
        assert!(!start.recorded_device_attested);
        assert!(!start.device_identity_verified);
        assert!(!start.field_session_verified);
        assert!(start.user_owned);
        assert!(!start.sharing_authorized);
        assert!(!start.training_reuse_authorized);
        assert!(start.no_auto_arm);
        assert_eq!(
            recorder_status_for(&runtime)
                .expect("active recorder status")
                .state,
            "recording"
        );

        for sequence in 0..3 {
            master
                .write_all(&recorder_frame(
                    "art_replay_1",
                    sequence,
                    sequence as f64 * 0.25,
                ))
                .expect("write telemetry frame");
        }
        master.flush().expect("flush telemetry frames");
        thread::sleep(Duration::from_millis(150));
        let receipt = stop_recorder(&runtime).expect("recorder stops cleanly");
        assert_eq!(receipt.schema_version, RECORDER_RECEIPT_SCHEMA_VERSION);
        assert_eq!(receipt.frame_count, 3);
        assert_eq!(receipt.duration_s, 0.5);
        assert!(receipt.capture_complete);
        assert!(receipt.capture_consent_confirmed);
        assert!(!receipt.recorded_device_attested);
        assert!(receipt.user_owned);
        assert!(!receipt.sharing_authorized);
        assert!(!receipt.training_reuse_authorized);
        assert!(receipt.no_auto_arm);
        assert_eq!(
            recorder_status_for(&runtime)
                .expect("stopped recorder status")
                .state,
            "inactive"
        );

        let manifest: serde_json::Value = serde_json::from_slice(
            &fs::read(dir.join("forge-recorder-manifest.json")).expect("manifest readable"),
        )
        .expect("manifest parses");
        assert_eq!(
            manifest["schemaVersion"],
            serde_json::json!(RECORDER_ARCHIVE_SCHEMA_VERSION)
        );
        assert_eq!(manifest["recordedDeviceAttested"], false);
        assert_eq!(
            manifest["receiptSchemaVersion"],
            RECORDER_RECEIPT_SCHEMA_VERSION
        );
        assert_eq!(manifest["captureConsentConfirmed"], true);
        assert_eq!(manifest["sharingAuthorized"], false);

        let frame_bytes =
            fs::read(dir.join("telemetry.frames.jsonl")).expect("frame file readable");
        let frames = std::str::from_utf8(&frame_bytes)
            .expect("frame file is UTF-8")
            .lines()
            .map(|line| serde_json::from_str::<serde_json::Value>(line).expect("frame parses"))
            .collect::<Vec<_>>();
        assert_eq!(frames.len(), 3);
        assert_eq!(frames[2]["t"], 0.5);
        assert_eq!(frames[2]["state"]["positionM"][0], 0.5);

        let index = fs::read_to_string(dir.join("telemetry.index.jsonl"))
            .expect("index readable")
            .lines()
            .map(|line| serde_json::from_str::<serde_json::Value>(line).expect("index parses"))
            .collect::<Vec<_>>();
        assert_eq!(index.len(), 2);
        assert_eq!(index[0]["sequence"], 0);
        assert_eq!(index[1]["sequence"], 2);
        assert!(index[1]["byteOffset"].as_u64().unwrap() > 0);
        for entry in &index {
            let offset = entry["byteOffset"].as_u64().unwrap() as usize;
            let remainder = &frame_bytes[offset..];
            let line_end = remainder
                .iter()
                .position(|byte| *byte == b'\n')
                .expect("indexed frame is newline terminated");
            let indexed_frame: serde_json::Value =
                serde_json::from_slice(&remainder[..line_end]).expect("indexed frame parses");
            let sequence = entry["sequence"].as_u64().unwrap();
            assert_eq!(indexed_frame["t"], sequence as f64 * 0.25);
        }

        let replay: serde_json::Value = serde_json::from_slice(
            &fs::read(dir.join("telemetry.replay.json")).expect("replay readable"),
        )
        .expect("replay parses");
        assert_eq!(replay["schemaVersion"], REPLAY_SCHEMA_VERSION);
        assert_eq!(replay["header"]["contractHash"], "11".repeat(32));
        assert_eq!(
            replay["header"]["recorder"]["recordedDeviceAttested"],
            false
        );
        assert_eq!(
            replay["header"]["recorder"]["captureConsentConfirmed"],
            true
        );
        assert_eq!(replay["frames"].as_array().unwrap().len(), 3);
        assert_eq!(
            receipt.frame_file_sha256,
            file_sha256(&dir.join("telemetry.frames.jsonl")).expect("frame hash")
        );
        assert_eq!(
            receipt.index_file_sha256,
            file_sha256(&dir.join("telemetry.index.jsonl")).expect("index hash")
        );
        assert_eq!(
            receipt.replay_file_sha256,
            file_sha256(&dir.join("telemetry.replay.json")).expect("replay hash")
        );
        assert!(dir.join("forge-recorder-receipt.json").exists());
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_archive_inspection_verifies_exact_local_integrity_and_nonclaims() {
        let dir = test_dir("recorder-inspection");
        let receipt = complete_test_recorder_archive(&dir, "art_replay_inspection");
        let inspection = inspect_recorder_archive_path(&dir).expect("archive inspects");
        assert_eq!(
            inspection.schema_version,
            RECORDER_INSPECTION_SCHEMA_VERSION
        );
        assert_eq!(inspection.artifact_id, "art_replay_inspection");
        assert_eq!(inspection.frame_count, receipt.frame_count);
        assert_eq!(inspection.duration_s, receipt.duration_s);
        assert_eq!(inspection.sample_rate_hz, 120);
        assert_eq!(inspection.reference_rig_id, D12_RIGS[1]);
        assert!(inspection.integrity_verified);
        assert!(inspection.capture_complete);
        assert!(inspection.capture_consent_confirmed);
        assert!(inspection.user_owned);
        assert!(!inspection.sharing_authorized);
        assert!(!inspection.training_reuse_authorized);
        assert!(!inspection.recorded_device_attested);
        assert!(!inspection.device_identity_verified);
        assert!(!inspection.field_session_verified);
        assert!(inspection.no_auto_arm);
        assert_eq!(
            inspection.archive_path,
            fs::canonicalize(&dir)
                .expect("canonical archive")
                .to_string_lossy()
        );
        assert!(inspection.replay_path.ends_with(RECORDER_REPLAY_FILE));

        let command_result = inspect_recorder_archive(dir.to_string_lossy().into_owned())
            .expect("Tauri inspection command accepts absolute archive path");
        assert_eq!(command_result.artifact_id, inspection.artifact_id);
        assert!(inspect_recorder_archive("relative/archive".to_string())
            .expect_err("relative archive path must fail")
            .contains("must be absolute"));
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_upload_plan_is_exact_sanitized_and_non_authoritative() {
        let dir = test_dir("recorder-upload-plan");
        complete_test_recorder_archive(&dir, "art_upload_plan");
        let plan = recorder_upload_plan_path(&dir).expect("upload plan");
        assert_eq!(plan.schema_version, RECORDER_UPLOAD_PLAN_SCHEMA_VERSION);
        assert_eq!(plan.artifact_id, "art_upload_plan");
        assert_eq!(plan.files.len(), 5);
        assert_eq!(
            plan.files.iter().map(|file| file.name).collect::<Vec<_>>(),
            recorder_upload_files()
                .iter()
                .map(|(name, _)| *name)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            plan.aggregate_byte_size,
            plan.files.iter().map(|file| file.byte_size).sum::<u64>()
        );
        assert!(plan.files.iter().all(|file| is_sha256_hex(&file.sha256)));
        assert!(plan.local_integrity_verified);
        assert!(!plan.recorded_device_attested);
        assert!(!plan.device_identity_verified);
        assert!(!plan.field_session_verified);
        assert!(!plan.sharing_authorized);
        assert!(!plan.training_reuse_authorized);
        let serialized = serde_json::to_string(&plan).expect("plan serializes");
        assert!(!serialized.contains(&dir.to_string_lossy().to_string()));
        assert!(!serialized.contains("archivePath"));
        assert!(!serialized.contains("replayPath"));

        let command_plan = prepare_recorder_archive_upload(dir.to_string_lossy().into_owned())
            .expect("Tauri upload-plan command");
        assert_eq!(command_plan.artifact_id, plan.artifact_id);
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_upload_streams_exact_files_and_keeps_gateway_authority_false() {
        let dir = test_dir("recorder-upload-stream");
        complete_test_recorder_archive(&dir, "art_upload_stream");
        let plan = recorder_upload_plan_path(&dir).expect("upload plan");
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind upload server");
        let origin = format!(
            "http://{}",
            listener.local_addr().expect("listener address")
        );
        let uploads = recorder_upload_contracts(&plan, &origin);
        let server = thread::spawn(move || {
            let mut requests = Vec::new();
            for _ in 0..5 {
                let (stream, _) = listener.accept().expect("accept upload");
                requests.push(read_test_http_request(stream));
            }
            requests
        });

        let receipt = upload_recorder_archive_files_path(&dir, uploads, &origin)
            .expect("five files stream to the configured origin");
        assert_eq!(
            receipt.schema_version,
            RECORDER_UPLOAD_RECEIPT_SCHEMA_VERSION
        );
        assert_eq!(receipt.artifact_id, "art_upload_stream");
        assert_eq!(receipt.uploaded_file_count, 5);
        assert_eq!(receipt.uploaded_byte_size, plan.aggregate_byte_size);
        assert!(receipt.local_integrity_verified);
        assert!(!receipt.gateway_object_integrity_verified);
        assert!(!receipt.recorded_device_attested);
        assert!(!receipt.device_identity_verified);
        assert!(!receipt.field_session_verified);
        assert!(!receipt.sharing_authorized);
        assert!(!receipt.training_reuse_authorized);
        assert!(receipt.no_auto_arm);

        let requests = server.join().expect("upload server completes");
        assert_eq!(requests.len(), plan.files.len());
        for ((request_line, body), planned) in requests.iter().zip(&plan.files) {
            assert!(
                request_line.starts_with(&format!("PUT /{}?", planned.name)),
                "unexpected request line: {request_line}"
            );
            assert_eq!(
                body,
                &fs::read(dir.join(planned.name)).expect("local file readable")
            );
        }
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_upload_refuses_origin_header_and_local_identity_substitution() {
        let dir = test_dir("recorder-upload-refusal");
        complete_test_recorder_archive(&dir, "art_upload_refusal");
        let plan = recorder_upload_plan_path(&dir).expect("upload plan");
        let origin = "https://objects.example.test";

        let mut wrong_origin = recorder_upload_contracts(&plan, origin);
        wrong_origin[0].url =
            wrong_origin[0]
                .url
                .replacen(origin, "https://substitute.example.test", 1);
        assert!(
            upload_recorder_archive_files_path(&dir, wrong_origin, origin)
                .expect_err("origin substitution must fail")
                .contains("outside the configured object origin")
        );

        let mut extra_header = recorder_upload_contracts(&plan, origin);
        extra_header[0]
            .headers
            .insert("authorization".to_string(), "secret".to_string());
        assert!(
            upload_recorder_archive_files_path(&dir, extra_header, origin)
                .expect_err("header substitution must fail")
                .contains("exact signed allowlist")
        );

        let mut wrong_hash = recorder_upload_contracts(&plan, origin);
        wrong_hash[0].sha256 = "00".repeat(32);
        assert!(upload_recorder_archive_files_path(&dir, wrong_hash, origin)
            .expect_err("hash substitution must fail")
            .contains("does not match the inspected local file"));

        assert!(strict_upload_origin("http://objects.example.test")
            .expect_err("non-loopback cleartext origin must fail")
            .contains("requires HTTPS"));
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_archive_inspection_refuses_frame_index_and_authority_tampering() {
        let frame_dir = test_dir("recorder-inspection-frame-tamper");
        complete_test_recorder_archive(&frame_dir, "art_frame_tamper");
        let frame_path = frame_dir.join(RECORDER_FRAME_FILE);
        let mut frames = fs::read_to_string(&frame_path)
            .expect("frames readable")
            .lines()
            .map(|line| serde_json::from_str::<ReplayFrame>(line).expect("frame parses"))
            .collect::<Vec<_>>();
        frames[0].state["batteryV"] = serde_json::json!(15.0);
        let frame_bytes = frames
            .iter()
            .map(|frame| serde_json::to_string(frame).expect("tampered frame serializes"))
            .collect::<Vec<_>>()
            .join("\n");
        fs::write(&frame_path, format!("{frame_bytes}\n")).expect("tamper frame file");
        let frame_error = inspect_recorder_archive_path(&frame_dir)
            .expect_err("frame hash substitution must fail");
        assert!(
            frame_error.contains("hash or reconstructed replay"),
            "unexpected frame error: {frame_error}"
        );
        fs::remove_dir_all(frame_dir).expect("frame cleanup");

        let replay_dir = test_dir("recorder-inspection-replay-tamper");
        complete_test_recorder_archive(&replay_dir, "art_replay_tamper");
        let replay_path = replay_dir.join(RECORDER_REPLAY_FILE);
        let mut replay = fs::read(&replay_path).expect("replay readable");
        replay.push(b' ');
        fs::write(&replay_path, replay).expect("tamper retained replay");
        assert!(inspect_recorder_archive_path(&replay_dir)
            .expect_err("retained replay substitution must fail")
            .contains("hash or reconstructed replay"));
        fs::remove_dir_all(replay_dir).expect("replay cleanup");

        let index_dir = test_dir("recorder-inspection-index-tamper");
        complete_test_recorder_archive(&index_dir, "art_index_tamper");
        let index_path = index_dir.join(RECORDER_INDEX_FILE);
        let mut lines = fs::read_to_string(&index_path)
            .expect("index readable")
            .lines()
            .map(str::to_string)
            .collect::<Vec<_>>();
        let mut first: RecorderIndexEntry =
            serde_json::from_str(&lines[0]).expect("first index entry parses");
        first.byte_offset = 1;
        lines[0] = serde_json::to_string(&first).expect("tampered index serializes");
        fs::write(&index_path, format!("{}\n", lines.join("\n"))).expect("tamper index file");
        assert!(inspect_recorder_archive_path(&index_dir)
            .expect_err("index offset substitution must fail")
            .contains("does not match frame 0"));
        fs::remove_dir_all(index_dir).expect("index cleanup");

        let authority_dir = test_dir("recorder-inspection-authority-tamper");
        complete_test_recorder_archive(&authority_dir, "art_authority_tamper");
        let receipt_path = authority_dir.join(RECORDER_RECEIPT_FILE);
        let mut receipt: RecorderStopReceiptInput =
            serde_json::from_slice(&fs::read(&receipt_path).expect("receipt readable"))
                .expect("receipt parses");
        receipt.recorded_device_attested = true;
        rewrite_pretty_json(&receipt_path, &receipt);
        assert!(inspect_recorder_archive_path(&authority_dir)
            .expect_err("device authority substitution must fail")
            .contains("authority flags have drifted"));
        fs::remove_dir_all(authority_dir).expect("authority cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_archive_inspection_refuses_extra_symlink_and_schema_drift() {
        use std::os::unix::fs::symlink;

        let extra_dir = test_dir("recorder-inspection-extra");
        complete_test_recorder_archive(&extra_dir, "art_extra_entry");
        fs::write(extra_dir.join("notes.txt"), b"not part of archive v1")
            .expect("write unexpected entry");
        assert!(inspect_recorder_archive_path(&extra_dir)
            .expect_err("unexpected file must fail")
            .contains("unexpected entry"));
        fs::remove_dir_all(extra_dir).expect("extra cleanup");

        let symlink_dir = test_dir("recorder-inspection-symlink");
        complete_test_recorder_archive(&symlink_dir, "art_symlink_entry");
        let replay_path = symlink_dir.join(RECORDER_REPLAY_FILE);
        let replay_copy = symlink_dir.with_extension("replay-copy");
        fs::rename(&replay_path, &replay_copy).expect("move replay outside archive");
        symlink(&replay_copy, &replay_path).expect("link replay into archive");
        assert!(inspect_recorder_archive_path(&symlink_dir)
            .expect_err("symlinked archive file must fail")
            .contains("not a symlink"));
        fs::remove_dir_all(symlink_dir).expect("symlink cleanup");
        fs::remove_file(replay_copy).expect("replay copy cleanup");

        let oversized_metadata_dir = test_dir("recorder-inspection-oversized-metadata");
        complete_test_recorder_archive(&oversized_metadata_dir, "art_oversized_metadata");
        fs::write(
            oversized_metadata_dir.join(RECORDER_MANIFEST_FILE),
            vec![b'x'; RECORDER_ARCHIVE_METADATA_RESERVE_BYTES as usize + 1],
        )
        .expect("write oversized manifest");
        assert!(inspect_recorder_archive_path(&oversized_metadata_dir)
            .expect_err("oversized metadata must fail before parsing")
            .contains("metadata cap"));
        fs::remove_dir_all(oversized_metadata_dir).expect("oversized metadata cleanup");

        let oversized_frame_dir = test_dir("recorder-inspection-oversized-frame");
        complete_test_recorder_archive(&oversized_frame_dir, "art_oversized_frame");
        fs::write(
            oversized_frame_dir.join(RECORDER_FRAME_FILE),
            vec![b'x'; MAX_RECORDER_FRAME_BYTES + 2],
        )
        .expect("write oversized frame");
        assert!(inspect_recorder_archive_path(&oversized_frame_dir)
            .expect_err("oversized frame must fail before parsing")
            .contains("exceeds"));
        fs::remove_dir_all(oversized_frame_dir).expect("oversized frame cleanup");

        let schema_dir = test_dir("recorder-inspection-schema");
        complete_test_recorder_archive(&schema_dir, "art_schema_drift");
        let manifest_path = schema_dir.join(RECORDER_MANIFEST_FILE);
        let mut manifest: RecorderArchiveManifestInput =
            serde_json::from_slice(&fs::read(&manifest_path).expect("manifest readable"))
                .expect("manifest parses");
        manifest.schema_version = "forge-recorder-archive/2.0.0".to_string();
        rewrite_pretty_json(&manifest_path, &manifest);
        let schema_error = inspect_recorder_archive_path(&schema_dir)
            .expect_err("unsupported archive major must fail");
        assert!(
            schema_error.contains("unsupported format version"),
            "unexpected schema error: {schema_error}"
        );
        fs::remove_dir_all(schema_dir).expect("schema cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_refuses_sequence_drift_without_a_success_receipt() {
        let dir = test_dir("recorder-drift");
        let request = recorder_request(&dir, "art_replay_drift");
        let runtime = RecorderRuntime::default();
        let (mut master, slave) = serialport::TTYPort::pair().expect("recorder pseudo terminal");
        start_recorder_with_port(&runtime, request, Box::new(slave), true)
            .expect("recorder starts");
        master
            .write_all(&recorder_frame("art_replay_drift", 0, 0.0))
            .expect("write first frame");
        master
            .write_all(&recorder_frame("art_replay_drift", 2, 0.1))
            .expect("write drifted frame");
        master.flush().expect("flush drifted frames");
        thread::sleep(Duration::from_millis(150));
        let failed_status = recorder_status_for(&runtime).expect("finished recorder status");
        assert_eq!(failed_status.state, "finished");
        assert_eq!(
            failed_status.artifact_id.as_deref(),
            Some("art_replay_drift")
        );
        let error = stop_recorder(&runtime).expect_err("sequence drift must fail");
        assert!(error.contains("expected 1, observed 2"), "{error}");
        assert_eq!(
            recorder_status_for(&runtime)
                .expect("cleared recorder status")
                .state,
            "inactive"
        );
        assert!(!dir.join("forge-recorder-receipt.json").exists());
        assert!(!dir.join("telemetry.replay.json").exists());
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_is_exclusive_and_never_overwrites_an_archive() {
        let first_dir = test_dir("recorder-exclusive");
        let second_dir = test_dir("recorder-second");
        let runtime = RecorderRuntime::default();
        let (mut first_master, first_slave) =
            serialport::TTYPort::pair().expect("first recorder pseudo terminal");
        start_recorder_with_port(
            &runtime,
            recorder_request(&first_dir, "art_replay_exclusive"),
            Box::new(first_slave),
            true,
        )
        .expect("first recorder starts");
        let (_second_master, second_slave) =
            serialport::TTYPort::pair().expect("second recorder pseudo terminal");
        let error = start_recorder_with_port(
            &runtime,
            recorder_request(&second_dir, "art_replay_second"),
            Box::new(second_slave),
            true,
        )
        .expect_err("second recorder must be refused");
        assert!(error.contains("already active"));
        assert!(!second_dir.exists());
        first_master
            .write_all(&recorder_frame("art_replay_exclusive", 0, 0.0))
            .expect("write one valid frame");
        first_master.flush().expect("flush one frame");
        thread::sleep(Duration::from_millis(150));
        stop_recorder(&runtime).expect("first recorder stops");

        let (_third_master, third_slave) =
            serialport::TTYPort::pair().expect("third recorder pseudo terminal");
        let overwrite_error = start_recorder_with_port(
            &runtime,
            recorder_request(&first_dir, "art_replay_overwrite"),
            Box::new(third_slave),
            true,
        )
        .expect_err("existing archive must never be overwritten");
        assert!(overwrite_error.contains("exclusive recorder archive"));
        fs::remove_dir_all(first_dir).expect("cleanup");
    }

    #[test]
    fn recorder_request_refuses_untrusted_authority() {
        let dir = test_dir("recorder-authority");
        let mut request = recorder_request(&dir, "art_replay_authority");
        assert!(validate_recorder_request(&request, false)
            .expect_err("unenumerated port must fail")
            .contains("reported by the operating system"));
        request.physical_confirmation = "record telemetry".to_string();
        assert!(validate_recorder_request(&request, true)
            .expect_err("consent substitution must fail")
            .contains("consent phrase mismatch"));
        request.physical_confirmation = RECORDER_PHYSICAL_CONFIRMATION.to_string();
        request.contract_hash = "AA".repeat(32);
        assert!(validate_recorder_request(&request, true)
            .expect_err("uppercase hash must fail")
            .contains("lowercase SHA-256"));
        request.contract_hash = "11".repeat(32);
        request.output_dir = "relative/recorder-archive".to_string();
        assert!(validate_recorder_request(&request, true)
            .expect_err("relative output path must fail")
            .contains("must be absolute"));
        request.output_dir = format!("/{}", "x".repeat(4_097));
        assert!(validate_recorder_request(&request, true)
            .expect_err("oversized output path must fail")
            .contains("at most 4096 UTF-8 bytes"));

        let mut encoded = serde_json::to_value(recorder_request(&dir, "art_replay_unknown_field"))
            .expect("recorder request serializes");
        encoded
            .as_object_mut()
            .expect("recorder request object")
            .insert("sharingAuthorized".to_string(), serde_json::json!(true));
        assert!(serde_json::from_value::<RecorderRequest>(encoded).is_err());
    }

    #[test]
    fn recorder_frame_bounds_refuse_oversize_and_time_drift() {
        let dir = test_dir("recorder-frame-bounds");
        fs::create_dir(&dir).expect("create frame test dir");
        let request = recorder_request(&dir, "art_replay_bounds");
        let frame_file = File::create(dir.join("frames")).expect("create frames");
        let index_file = File::create(dir.join("index")).expect("create index");
        let mut frames = BufWriter::new(frame_file);
        let mut index = BufWriter::new(index_file);
        let mut progress = RecorderProgress::default();
        let oversized = vec![b'x'; MAX_RECORDER_FRAME_BYTES + 1];
        assert!(append_recorder_frame(
            &oversized,
            &request,
            30,
            &mut frames,
            &mut index,
            &mut progress,
        )
        .expect_err("oversized frame must fail")
        .contains("exceeds"));

        let first = recorder_frame("art_replay_bounds", 0, 1.0);
        append_recorder_frame(
            &first[..first.len() - 1],
            &request,
            30,
            &mut frames,
            &mut index,
            &mut progress,
        )
        .expect("first frame accepted");
        let duplicate_time = recorder_frame("art_replay_bounds", 1, 1.0);
        assert!(append_recorder_frame(
            &duplicate_time[..duplicate_time.len() - 1],
            &request,
            30,
            &mut frames,
            &mut index,
            &mut progress,
        )
        .expect_err("duplicate time must fail")
        .contains("strictly increasing"));

        let mut frame_capped = RecorderProgress {
            frame_count: MAX_RECORDER_FRAMES,
            ..RecorderProgress::default()
        };
        let frame_at_cap = recorder_frame(
            "art_replay_bounds",
            MAX_RECORDER_FRAMES,
            MAX_RECORDER_FRAMES as f64,
        );
        assert!(append_recorder_frame(
            &frame_at_cap[..frame_at_cap.len() - 1],
            &request,
            30,
            &mut frames,
            &mut index,
            &mut frame_capped,
        )
        .expect_err("frame count cap must fail")
        .contains("frame safety cap"));

        let mut byte_capped = RecorderProgress {
            frame_bytes: (MAX_RECORDER_ARCHIVE_BYTES - RECORDER_ARCHIVE_METADATA_RESERVE_BYTES) / 2,
            ..RecorderProgress::default()
        };
        let frame_over_archive_cap = recorder_frame("art_replay_bounds", 0, 0.0);
        assert!(append_recorder_frame(
            &frame_over_archive_cap[..frame_over_archive_cap.len() - 1],
            &request,
            30,
            &mut frames,
            &mut index,
            &mut byte_capped,
        )
        .expect_err("complete archive byte cap must fail")
        .contains("complete recorder archive"));
        fs::remove_dir_all(dir).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn recorder_refuses_empty_and_partial_stop_without_a_receipt() {
        let empty_dir = test_dir("recorder-empty");
        let empty_runtime = RecorderRuntime::default();
        let (_empty_master, empty_slave) =
            serialport::TTYPort::pair().expect("empty recorder pseudo terminal");
        start_recorder_with_port(
            &empty_runtime,
            recorder_request(&empty_dir, "art_replay_empty"),
            Box::new(empty_slave),
            true,
        )
        .expect("empty recorder starts");
        let empty_error = stop_recorder(&empty_runtime).expect_err("empty capture must fail");
        assert!(empty_error.contains("empty telemetry archive"));
        assert!(!empty_dir.join("forge-recorder-receipt.json").exists());
        fs::remove_dir_all(empty_dir).expect("empty cleanup");

        let partial_dir = test_dir("recorder-partial");
        let partial_runtime = RecorderRuntime::default();
        let (mut partial_master, partial_slave) =
            serialport::TTYPort::pair().expect("partial recorder pseudo terminal");
        start_recorder_with_port(
            &partial_runtime,
            recorder_request(&partial_dir, "art_replay_partial"),
            Box::new(partial_slave),
            true,
        )
        .expect("partial recorder starts");
        partial_master
            .write_all(b"{\"schemaVersion\":\"forge-telemetry-frame/1.0.0\"")
            .expect("write partial frame");
        partial_master.flush().expect("flush partial frame");
        thread::sleep(Duration::from_millis(50));
        let partial_error = stop_recorder(&partial_runtime).expect_err("partial capture must fail");
        assert!(partial_error.contains("incomplete telemetry frame"));
        assert!(!partial_dir.join("forge-recorder-receipt.json").exists());
        fs::remove_dir_all(partial_dir).expect("partial cleanup");
    }
}
