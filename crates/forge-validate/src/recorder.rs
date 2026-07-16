//! Sovereign, streaming verification for the frozen recorder archive v1.
//!
//! The verifier reads the exact five files from a private directory. It does
//! not confer device identity, sharing, training, lab, or field authority.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{BufRead, BufReader, Read},
    path::Path,
};

pub const RECORDER_VERIFICATION_SCHEMA_VERSION: &str = "forge-recorder-verification/1.0.0";
pub const RECORDER_ARCHIVE_SCHEMA_VERSION: &str = "forge-recorder-archive/1.0.0";
pub const RECORDER_FRAME_SCHEMA_VERSION: &str = "forge-telemetry-frame/1.0.0";
pub const RECORDER_RECEIPT_SCHEMA_VERSION: &str = "forge-recorder-receipt/1.0.0";
pub const REPLAY_SCHEMA_VERSION: &str = "1.0.0";

pub const RECORDER_MANIFEST_FILE: &str = "forge-recorder-manifest.json";
pub const RECORDER_FRAME_FILE: &str = "telemetry.frames.jsonl";
pub const RECORDER_INDEX_FILE: &str = "telemetry.index.jsonl";
pub const RECORDER_REPLAY_FILE: &str = "telemetry.replay.json";
pub const RECORDER_RECEIPT_FILE: &str = "forge-recorder-receipt.json";

const BETAFLIGHT_SERIAL_BAUD: u32 = 115_200;
const MAX_RECORDER_FRAME_BYTES: usize = 64 * 1024;
pub const MAX_RECORDER_ARCHIVE_BYTES: u64 = 512 * 1024 * 1024;
const RECORDER_ARCHIVE_METADATA_RESERVE_BYTES: u64 = 1024 * 1024;
const MAX_RECORDER_FRAMES: u64 = 1_000_000;
const D12_RIGS: &[&str] = &[
    "ref_quad_kakute-h7-source-one-5in",
    "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
];

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecorderArchiveManifest {
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
struct RecorderStopReceipt {
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

/// Machine-readable proof that archive-v1 semantics were checked by the
/// sovereign native validator. All broader authority fields are nonclaims.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecorderVerificationReport {
    pub schema_version: String,
    pub archive_schema_version: String,
    pub replay_schema_version: String,
    pub receipt_schema_version: String,
    pub artifact_id: String,
    pub reference_rig_id: String,
    pub contract_hash: String,
    pub lockfile_hash: String,
    pub source_port_sha256: String,
    pub sample_rate_hz: u32,
    pub started_at_unix_ms: u128,
    pub stopped_at_unix_ms: u128,
    pub frame_count: u64,
    pub duration_s: f64,
    pub aggregate_byte_size: u64,
    pub frame_file_sha256: String,
    pub index_file_sha256: String,
    pub replay_file_sha256: String,
    pub capture_maturity: String,
    pub archive_semantics_verified: bool,
    pub capture_complete: bool,
    pub capture_consent_confirmed: bool,
    pub user_owned: bool,
    pub sharing_authorized: bool,
    pub training_reuse_authorized: bool,
    pub recorded_device_attested: bool,
    pub device_identity_verified: bool,
    pub field_session_verified: bool,
    pub no_auto_arm: bool,
}

struct ReplayBinding<'a> {
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

fn replay_prefix(binding: ReplayBinding<'_>) -> Result<Vec<u8>, String> {
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
        .map_err(|error| format!("serialize replay schema version: {error}"))?;
    prefix.extend_from_slice(b",\"header\":");
    serde_json::to_writer(&mut prefix, &header)
        .map_err(|error| format!("serialize replay header: {error}"))?;
    prefix.extend_from_slice(b",\"frames\":[");
    Ok(prefix)
}

fn is_sha256(value: &str) -> bool {
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

fn archive_file_lengths(directory: &Path) -> Result<u64, String> {
    let metadata = fs::symlink_metadata(directory).map_err(|error| {
        format!(
            "inspect recorder archive '{}': {error}",
            directory.display()
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
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
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("list recorder archive '{}': {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("read recorder archive entry: {error}"))?;
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
            .map_err(|error| format!("inspect recorder archive entry '{name}': {error}"))?;
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
    let file = File::open(path).map_err(|error| format!("open recorder {label}: {error}"))?;
    let mut bytes = Vec::new();
    file.take(RECORDER_ARCHIVE_METADATA_RESERVE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("read recorder {label}: {error}"))?;
    if bytes.len() as u64 > RECORDER_ARCHIVE_METADATA_RESERVE_BYTES {
        return Err(format!(
            "recorder {label} exceeds the {RECORDER_ARCHIVE_METADATA_RESERVE_BYTES}-byte metadata cap"
        ));
    }
    let value: T = serde_json::from_slice(&bytes)
        .map_err(|error| format!("parse recorder {label}: {error}"))?;
    let mut canonical = serde_json::to_vec_pretty(&value)
        .map_err(|error| format!("canonicalize recorder {label}: {error}"))?;
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
        .map_err(|error| format!("read recorder {label}: {error}"))?;
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
        .map_err(|error| format!("parse recorder {label}: {error}"))?;
    let mut canonical = serde_json::to_vec(&value)
        .map_err(|error| format!("canonicalize recorder {label}: {error}"))?;
    canonical.push(b'\n');
    if *line != canonical {
        return Err(format!("recorder {label} is not canonical JSONL"));
    }
    Ok(Some(value))
}

fn validate_manifest(manifest: &RecorderArchiveManifest) -> Result<(), String> {
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
    if !is_sha256(&manifest.contract_hash)
        || !is_sha256(&manifest.lockfile_hash)
        || !is_sha256(&manifest.source_port_sha256)
    {
        return Err("recorder manifest hashes must be lowercase SHA-256 values".to_string());
    }
    if !manifest.environment.is_object() {
        return Err("recorder manifest environment must be an object".to_string());
    }
    let environment_bytes = serde_json::to_vec(&manifest.environment)
        .map_err(|error| format!("serialize recorder manifest environment: {error}"))?;
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

fn validate_receipt(
    receipt: &RecorderStopReceipt,
    manifest: &RecorderArchiveManifest,
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
    if !is_sha256(&receipt.frame_file_sha256)
        || !is_sha256(&receipt.index_file_sha256)
        || !is_sha256(&receipt.replay_file_sha256)
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

fn verify_next_index_entry(
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

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|error| format!("open '{}': {error}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let count = file
            .read(&mut buffer)
            .map_err(|error| format!("read '{}': {error}", path.display()))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Verifies the exact archive-v1 directory with bounded, streaming reads.
pub fn verify_archive(directory: &Path) -> Result<RecorderVerificationReport, String> {
    let initial_archive_bytes = archive_file_lengths(directory)?;
    let manifest: RecorderArchiveManifest =
        read_canonical_pretty_json(&directory.join(RECORDER_MANIFEST_FILE), "manifest")?;
    validate_manifest(&manifest)?;
    let receipt: RecorderStopReceipt =
        read_canonical_pretty_json(&directory.join(RECORDER_RECEIPT_FILE), "receipt")?;
    validate_receipt(&receipt, &manifest)?;

    let mut frames = BufReader::new(
        File::open(directory.join(RECORDER_FRAME_FILE))
            .map_err(|error| format!("open recorder frame file: {error}"))?,
    );
    let mut index = BufReader::new(
        File::open(directory.join(RECORDER_INDEX_FILE))
            .map_err(|error| format!("open recorder index file: {error}"))?,
    );
    let mut frame_line = Vec::new();
    let mut index_line = Vec::new();
    let mut frame_hasher = Sha256::new();
    let mut index_hasher = Sha256::new();
    let mut expected_replay_hasher = Sha256::new();
    expected_replay_hasher.update(replay_prefix(ReplayBinding {
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
        if !frame.t.is_finite() || last_t.is_some_and(|last| frame.t <= last) {
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
            verify_next_index_entry(
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
        verify_next_index_entry(
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
    let actual_replay_sha256 = file_sha256(&directory.join(RECORDER_REPLAY_FILE))?;
    if frame_file_sha256 != receipt.frame_file_sha256
        || index_file_sha256 != receipt.index_file_sha256
        || expected_replay_sha256 != receipt.replay_file_sha256
        || actual_replay_sha256 != receipt.replay_file_sha256
    {
        return Err(
            "recorder archive hash or reconstructed replay verification failed".to_string(),
        );
    }
    if archive_file_lengths(directory)? != initial_archive_bytes {
        return Err("recorder archive changed size during verification".to_string());
    }

    Ok(RecorderVerificationReport {
        schema_version: RECORDER_VERIFICATION_SCHEMA_VERSION.to_string(),
        archive_schema_version: RECORDER_ARCHIVE_SCHEMA_VERSION.to_string(),
        replay_schema_version: REPLAY_SCHEMA_VERSION.to_string(),
        receipt_schema_version: RECORDER_RECEIPT_SCHEMA_VERSION.to_string(),
        artifact_id: manifest.artifact_id,
        reference_rig_id: manifest.reference_rig_id,
        contract_hash: manifest.contract_hash,
        lockfile_hash: manifest.lockfile_hash,
        source_port_sha256: manifest.source_port_sha256,
        sample_rate_hz: manifest.sample_rate_hz,
        started_at_unix_ms: receipt.started_at_unix_ms,
        stopped_at_unix_ms: receipt.stopped_at_unix_ms,
        frame_count,
        duration_s,
        aggregate_byte_size: initial_archive_bytes,
        frame_file_sha256,
        index_file_sha256,
        replay_file_sha256: actual_replay_sha256,
        capture_maturity: receipt.capture_maturity,
        archive_semantics_verified: true,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs::OpenOptions,
        io::Write,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_directory(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("test clock")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "forge-recorder-validator-{label}-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir(&directory).expect("create test archive");
        directory
    }

    fn write_pretty(path: &Path, value: &impl Serialize) {
        let mut bytes = serde_json::to_vec_pretty(value).expect("serialize pretty JSON");
        bytes.push(b'\n');
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(path)
            .expect("create JSON file");
        file.write_all(&bytes).expect("write JSON file");
    }

    fn fixture(directory: &Path) {
        let contract_hash = "11".repeat(32);
        let lockfile_hash = "22".repeat(32);
        let source_port_sha256 = "33".repeat(32);
        let manifest = RecorderArchiveManifest {
            schema_version: RECORDER_ARCHIVE_SCHEMA_VERSION.to_string(),
            replay_schema_version: REPLAY_SCHEMA_VERSION.to_string(),
            frame_schema_version: RECORDER_FRAME_SCHEMA_VERSION.to_string(),
            receipt_schema_version: RECORDER_RECEIPT_SCHEMA_VERSION.to_string(),
            artifact_id: "art_validator_fixture".to_string(),
            reference_rig_id: D12_RIGS[0].to_string(),
            sample_rate_hz: 8,
            started_at_unix_ms: 1_700_000_000_000,
            contract_hash: contract_hash.clone(),
            lockfile_hash: lockfile_hash.clone(),
            environment: serde_json::json!({"windMps": 0.0}),
            seed: 7,
            source_kind: "serial-jsonl".to_string(),
            source_port_sha256: source_port_sha256.clone(),
            source_baud: BETAFLIGHT_SERIAL_BAUD,
            capture_maturity: "local-serial-integration".to_string(),
            recorded_device_attested: false,
            frame_file: RECORDER_FRAME_FILE.to_string(),
            index_file: RECORDER_INDEX_FILE.to_string(),
            replay_file: RECORDER_REPLAY_FILE.to_string(),
            receipt_file: RECORDER_RECEIPT_FILE.to_string(),
            capture_consent_confirmed: true,
            user_owned: true,
            sharing_authorized: false,
            training_reuse_authorized: false,
            no_auto_arm: true,
        };
        write_pretty(&directory.join(RECORDER_MANIFEST_FILE), &manifest);

        let frames = [
            ReplayFrame {
                t: 0.0,
                state: serde_json::json!({"batteryV": 16.8}),
            },
            ReplayFrame {
                t: 0.25,
                state: serde_json::json!({"batteryV": 16.7}),
            },
            ReplayFrame {
                t: 0.5,
                state: serde_json::json!({"batteryV": 16.6}),
            },
        ];
        let mut frame_bytes = Vec::new();
        let mut offsets = Vec::new();
        for frame in &frames {
            offsets.push(frame_bytes.len() as u64);
            serde_json::to_writer(&mut frame_bytes, frame).expect("serialize frame");
            frame_bytes.push(b'\n');
        }
        fs::write(directory.join(RECORDER_FRAME_FILE), &frame_bytes).expect("write frames");

        let entries = [
            RecorderIndexEntry {
                sequence: 0,
                t: frames[0].t,
                byte_offset: offsets[0],
            },
            RecorderIndexEntry {
                sequence: 2,
                t: frames[2].t,
                byte_offset: offsets[2],
            },
        ];
        let mut index_bytes = Vec::new();
        for entry in entries {
            serde_json::to_writer(&mut index_bytes, &entry).expect("serialize index");
            index_bytes.push(b'\n');
        }
        fs::write(directory.join(RECORDER_INDEX_FILE), &index_bytes).expect("write index");

        let mut replay_bytes = replay_prefix(ReplayBinding {
            contract_hash: &contract_hash,
            lockfile_hash: &lockfile_hash,
            seed: manifest.seed,
            environment: &manifest.environment,
            artifact_id: &manifest.artifact_id,
            reference_rig_id: &manifest.reference_rig_id,
            source_kind: &manifest.source_kind,
            source_port_sha256: &source_port_sha256,
            capture_maturity: &manifest.capture_maturity,
        })
        .expect("replay prefix");
        for (index, line) in frame_bytes
            .split(|byte| *byte == b'\n')
            .filter(|line| !line.is_empty())
            .enumerate()
        {
            if index > 0 {
                replay_bytes.push(b',');
            }
            replay_bytes.extend_from_slice(line);
        }
        replay_bytes.extend_from_slice(b"]}\n");
        fs::write(directory.join(RECORDER_REPLAY_FILE), &replay_bytes).expect("write replay");

        let receipt = RecorderStopReceipt {
            schema_version: RECORDER_RECEIPT_SCHEMA_VERSION.to_string(),
            archive_schema_version: RECORDER_ARCHIVE_SCHEMA_VERSION.to_string(),
            replay_schema_version: REPLAY_SCHEMA_VERSION.to_string(),
            frame_schema_version: RECORDER_FRAME_SCHEMA_VERSION.to_string(),
            artifact_id: manifest.artifact_id,
            reference_rig_id: manifest.reference_rig_id,
            contract_hash,
            lockfile_hash,
            started_at_unix_ms: manifest.started_at_unix_ms,
            stopped_at_unix_ms: manifest.started_at_unix_ms + 500,
            frame_count: frames.len() as u64,
            duration_s: 0.5,
            frame_file_sha256: format!("{:x}", Sha256::digest(&frame_bytes)),
            index_file_sha256: format!("{:x}", Sha256::digest(&index_bytes)),
            replay_file_sha256: format!("{:x}", Sha256::digest(&replay_bytes)),
            source_port_sha256,
            capture_complete: true,
            capture_maturity: "local-serial-integration".to_string(),
            capture_consent_confirmed: true,
            recorded_device_attested: false,
            user_owned: true,
            sharing_authorized: false,
            training_reuse_authorized: false,
            no_auto_arm: true,
        };
        write_pretty(&directory.join(RECORDER_RECEIPT_FILE), &receipt);
    }

    #[test]
    fn verifies_exact_archive_and_keeps_broader_authority_false() {
        let directory = test_directory("valid");
        fixture(&directory);
        let report = verify_archive(&directory).expect("archive verifies");
        assert_eq!(report.schema_version, RECORDER_VERIFICATION_SCHEMA_VERSION);
        assert_eq!(report.artifact_id, "art_validator_fixture");
        assert_eq!(report.frame_count, 3);
        assert_eq!(report.duration_s.to_bits(), 0.5_f64.to_bits());
        assert!(report.archive_semantics_verified);
        assert!(!report.recorded_device_attested);
        assert!(!report.device_identity_verified);
        assert!(!report.field_session_verified);
        assert!(!report.sharing_authorized);
        assert!(!report.training_reuse_authorized);
        fs::remove_dir_all(directory).expect("cleanup fixture");
    }

    #[test]
    fn rejects_replay_and_index_substitution() {
        let replay_directory = test_directory("replay-tamper");
        fixture(&replay_directory);
        fs::write(replay_directory.join(RECORDER_REPLAY_FILE), b"{}\n").expect("tamper replay");
        assert!(verify_archive(&replay_directory)
            .expect_err("replay substitution must fail")
            .contains("hash or reconstructed replay"));
        fs::remove_dir_all(replay_directory).expect("cleanup replay fixture");

        let index_directory = test_directory("index-tamper");
        fixture(&index_directory);
        fs::write(
            index_directory.join(RECORDER_INDEX_FILE),
            b"{\"sequence\":0,\"t\":0.0,\"byteOffset\":1}\n",
        )
        .expect("tamper index");
        assert!(verify_archive(&index_directory)
            .expect_err("index substitution must fail")
            .contains("does not match frame 0"));
        fs::remove_dir_all(index_directory).expect("cleanup index fixture");
    }
}
