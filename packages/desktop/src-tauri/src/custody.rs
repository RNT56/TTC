use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub(crate) const TRUST_BUNDLE_SCHEMA_VERSION: &str = "forge-recorder-custody-trust-bundle/1.0.0";
pub(crate) const AUTHORIZATION_SCHEMA_VERSION: &str = "forge-recorder-custody-authorization/1.0.0";
pub(crate) const PROOF_SCHEMA_VERSION: &str = "forge-recorder-custody-proof/1.0.0";
pub(crate) const CUSTODY_PURPOSE: &str = "controlled-lab-recorder-custody";
const AUTHORIZATION_DOMAIN: &[u8] = b"forge-recorder-custody-authorization/1.0.0\0";
const MAX_TRUST_BUNDLE_BYTES: u64 = 64 * 1024;
const MAX_AUTHORIZATION_BYTES: u64 = 128 * 1024;
const MAX_AUTHORIZATION_LIFETIME_MS: u64 = 8 * 60 * 60 * 1_000;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RecorderCustodyTrustBundle {
    pub(crate) schema_version: String,
    pub(crate) bundle_id: String,
    pub(crate) purpose: String,
    pub(crate) keys: Vec<RecorderCustodyTrustKey>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RecorderCustodyTrustKey {
    pub(crate) key_id: String,
    pub(crate) algorithm: String,
    pub(crate) public_key_hex: String,
    pub(crate) not_before_unix_ms: u64,
    pub(crate) not_after_unix_ms: u64,
    pub(crate) revoked_at_unix_ms: Option<u64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RecorderCustodyAuthorization {
    pub(crate) schema_version: String,
    pub(crate) key_id: String,
    pub(crate) algorithm: String,
    pub(crate) signature_hex: String,
    pub(crate) binding: RecorderCustodyAuthorizationBinding,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RecorderCustodyAuthorizationBinding {
    pub(crate) authorization_id: String,
    pub(crate) purpose: String,
    pub(crate) protected_revision: String,
    pub(crate) evidence_pack_schema_version: String,
    pub(crate) evidence_pack_sha256: String,
    pub(crate) required_signoff_set_sha256: String,
    pub(crate) reference_rig_id: String,
    pub(crate) artifact_id: String,
    pub(crate) model_id: String,
    pub(crate) contract_hash: String,
    pub(crate) lockfile_hash: String,
    pub(crate) telemetry_source_port_sha256: String,
    pub(crate) telemetry_os_descriptor_sha256: String,
    pub(crate) identity_source_port_sha256: String,
    pub(crate) identity_os_descriptor_sha256: String,
    pub(crate) recorder_adapter_probe_schema_version: String,
    pub(crate) recorder_adapter_schema_version: String,
    pub(crate) expected_identity_sha256: String,
    pub(crate) expected_device_uid_sha256: String,
    pub(crate) issued_at_unix_ms: u64,
    pub(crate) not_before_unix_ms: u64,
    pub(crate) expires_at_unix_ms: u64,
    pub(crate) capture_consent_confirmed: bool,
    pub(crate) no_auto_arm: bool,
    pub(crate) cryptographic_device_attestation: bool,
    pub(crate) recorded_device_attested: bool,
    pub(crate) field_session_verified: bool,
    pub(crate) sharing_authorized: bool,
    pub(crate) training_reuse_authorized: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct CustodyBindingInputs<'a> {
    pub(crate) protected_revision: &'a str,
    pub(crate) reference_rig_id: &'a str,
    pub(crate) artifact_id: &'a str,
    pub(crate) model_id: &'a str,
    pub(crate) contract_hash: &'a str,
    pub(crate) lockfile_hash: &'a str,
    pub(crate) telemetry_source_port_sha256: &'a str,
    pub(crate) telemetry_os_descriptor_sha256: &'a str,
    pub(crate) identity_source_port_sha256: &'a str,
    pub(crate) identity_os_descriptor_sha256: &'a str,
    pub(crate) recorder_adapter_probe_schema_version: &'a str,
    pub(crate) recorder_adapter_schema_version: &'a str,
}

#[derive(Debug, Clone)]
pub(crate) struct VerifiedCustodyAuthorization {
    pub(crate) trust_bundle: RecorderCustodyTrustBundle,
    pub(crate) trust_bundle_sha256: String,
    pub(crate) authorization_sha256: String,
    pub(crate) authorization: RecorderCustodyAuthorization,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecorderCustodyProof {
    pub(crate) schema_version: &'static str,
    pub(crate) trust_bundle_schema_version: &'static str,
    pub(crate) authorization_schema_version: &'static str,
    pub(crate) recorder_adapter_probe_schema_version: String,
    pub(crate) recorder_adapter_schema_version: String,
    pub(crate) authorization_id: String,
    pub(crate) authorization_sha256: String,
    pub(crate) trust_bundle_id: String,
    pub(crate) trust_bundle_sha256: String,
    pub(crate) acceptance_authority_key_id: String,
    pub(crate) protected_revision: String,
    pub(crate) purpose: String,
    pub(crate) evidence_pack_schema_version: String,
    pub(crate) evidence_pack_sha256: String,
    pub(crate) required_signoff_set_sha256: String,
    pub(crate) reference_rig_id: String,
    pub(crate) artifact_id: String,
    pub(crate) model_id: String,
    pub(crate) contract_hash: String,
    pub(crate) lockfile_hash: String,
    pub(crate) telemetry_source_port_sha256: String,
    pub(crate) telemetry_start_os_descriptor_sha256: String,
    pub(crate) telemetry_stop_os_descriptor_sha256: String,
    pub(crate) identity_source_port_sha256: String,
    pub(crate) identity_start_os_descriptor_sha256: String,
    pub(crate) identity_stop_os_descriptor_sha256: String,
    pub(crate) expected_identity_sha256: String,
    pub(crate) pre_identity_sha256: String,
    pub(crate) post_identity_sha256: String,
    pub(crate) expected_device_uid_sha256: String,
    pub(crate) pre_device_uid_sha256: String,
    pub(crate) post_device_uid_sha256: String,
    pub(crate) pre_observed_at_unix_ms: u128,
    pub(crate) post_observed_at_unix_ms: u128,
    pub(crate) start_pre_identity_response_sha256: String,
    pub(crate) start_post_identity_response_sha256: String,
    pub(crate) start_transcript_sha256: String,
    pub(crate) stop_pre_identity_response_sha256: String,
    pub(crate) stop_post_identity_response_sha256: String,
    pub(crate) stop_transcript_sha256: String,
    pub(crate) recorder_receipt_sha256: String,
    pub(crate) capture_started_at_unix_ms: u128,
    pub(crate) capture_stopped_at_unix_ms: u128,
    pub(crate) proof_created_at_unix_ms: u128,
    pub(crate) acceptance_authority_signature_verified: bool,
    pub(crate) identity_continuity_verified: bool,
    pub(crate) capture_consent_confirmed: bool,
    pub(crate) no_auto_arm: bool,
    pub(crate) cryptographic_device_attestation: bool,
    pub(crate) recorded_device_attested: bool,
    pub(crate) device_identity_verified: bool,
    pub(crate) field_session_verified: bool,
    pub(crate) sharing_authorized: bool,
    pub(crate) training_reuse_authorized: bool,
}

pub(crate) struct RecorderCustodyProofInputs {
    pub(crate) proof_path: PathBuf,
    pub(crate) archive_path: PathBuf,
    pub(crate) proof: RecorderCustodyProof,
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn is_lower_hex(value: &str, size: usize) -> bool {
    value.len() == size
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn is_safe_token(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn decode_hex<const N: usize>(value: &str, label: &str) -> Result<[u8; N], String> {
    if !is_lower_hex(value, N * 2) {
        return Err(format!("{label} must be exactly {} lowercase hex bytes", N));
    }
    let mut result = [0_u8; N];
    for (index, output) in result.iter_mut().enumerate() {
        let offset = index * 2;
        *output = u8::from_str_radix(&value[offset..offset + 2], 16)
            .map_err(|_| format!("{label} contains malformed hex"))?;
    }
    Ok(result)
}

fn read_regular_bounded(path: &Path, limit: u64, label: &str) -> Result<Vec<u8>, String> {
    if !path.is_absolute() {
        return Err(format!("{label} path must be absolute"));
    }
    let symlink = fs::symlink_metadata(path)
        .map_err(|err| format!("inspect {label} '{}': {err}", path.display()))?;
    if symlink.file_type().is_symlink() || !symlink.file_type().is_file() {
        return Err(format!("{label} must be a non-symlink regular file"));
    }
    if symlink.len() == 0 || symlink.len() > limit {
        return Err(format!("{label} must contain 1 through {limit} bytes"));
    }
    let mut bytes = Vec::with_capacity(symlink.len() as usize);
    File::open(path)
        .map_err(|err| format!("open {label} '{}': {err}", path.display()))?
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|err| format!("read {label} '{}': {err}", path.display()))?;
    if bytes.len() as u64 > limit {
        return Err(format!("{label} exceeds {limit} bytes while reading"));
    }
    Ok(bytes)
}

fn validate_trust_bundle(bundle: &RecorderCustodyTrustBundle) -> Result<(), String> {
    if bundle.schema_version != TRUST_BUNDLE_SCHEMA_VERSION {
        return Err("recorder custody trust bundle version is unsupported".to_string());
    }
    if !is_safe_token(&bundle.bundle_id, 128) {
        return Err("recorder custody trust bundle ID is invalid".to_string());
    }
    if bundle.purpose != CUSTODY_PURPOSE {
        return Err("recorder custody trust bundle has the wrong purpose".to_string());
    }
    if bundle.keys.is_empty() || bundle.keys.len() > 32 {
        return Err("recorder custody trust bundle requires 1 through 32 public keys".to_string());
    }
    let mut key_ids = BTreeSet::new();
    for key in &bundle.keys {
        if !is_safe_token(&key.key_id, 128) || !key_ids.insert(key.key_id.as_str()) {
            return Err("recorder custody trust key IDs must be unique safe tokens".to_string());
        }
        if key.algorithm != "Ed25519" || !is_lower_hex(&key.public_key_hex, 64) {
            return Err(
                "recorder custody trust keys must be lowercase Ed25519 public keys".to_string(),
            );
        }
        if key.not_before_unix_ms >= key.not_after_unix_ms {
            return Err("recorder custody trust key validity interval is invalid".to_string());
        }
        if key
            .revoked_at_unix_ms
            .is_some_and(|revoked| revoked < key.not_before_unix_ms)
        {
            return Err("recorder custody trust key revocation predates its validity".to_string());
        }
    }
    Ok(())
}

fn validate_authorization_binding(
    authorization: &RecorderCustodyAuthorization,
    expected: &CustodyBindingInputs<'_>,
    now_unix_ms: u64,
) -> Result<(), String> {
    let binding = &authorization.binding;
    if authorization.schema_version != AUTHORIZATION_SCHEMA_VERSION
        || authorization.algorithm != "Ed25519"
        || !is_safe_token(&authorization.key_id, 128)
        || !is_lower_hex(&authorization.signature_hex, 128)
    {
        return Err("recorder custody authorization envelope is invalid".to_string());
    }
    if !is_safe_token(&binding.authorization_id, 128)
        || binding.purpose != CUSTODY_PURPOSE
        || !is_lower_hex(&binding.protected_revision, 40)
        || binding.evidence_pack_schema_version != "forge.external-acceptance.v1"
        || binding.reference_rig_id != "ref_quad_kakute-h7-source-one-5in"
        || !is_safe_token(&binding.artifact_id, 128)
        || !is_safe_token(&binding.model_id, 128)
    {
        return Err("recorder custody authorization identity or scope is invalid".to_string());
    }
    for (label, value) in [
        ("evidence-pack hash", binding.evidence_pack_sha256.as_str()),
        (
            "signoff-set hash",
            binding.required_signoff_set_sha256.as_str(),
        ),
        ("contract hash", binding.contract_hash.as_str()),
        ("lockfile hash", binding.lockfile_hash.as_str()),
        (
            "telemetry source-port hash",
            binding.telemetry_source_port_sha256.as_str(),
        ),
        (
            "telemetry descriptor hash",
            binding.telemetry_os_descriptor_sha256.as_str(),
        ),
        (
            "identity source-port hash",
            binding.identity_source_port_sha256.as_str(),
        ),
        (
            "identity descriptor hash",
            binding.identity_os_descriptor_sha256.as_str(),
        ),
        (
            "expected identity hash",
            binding.expected_identity_sha256.as_str(),
        ),
        (
            "expected device-UID hash",
            binding.expected_device_uid_sha256.as_str(),
        ),
    ] {
        if !is_lower_hex(value, 64) {
            return Err(format!(
                "recorder custody {label} must be a lowercase SHA-256"
            ));
        }
    }
    if binding.telemetry_source_port_sha256 == binding.identity_source_port_sha256 {
        return Err("recorder custody telemetry and identity ports must be distinct".to_string());
    }
    if binding.recorder_adapter_probe_schema_version != "forge-recorder-adapter-probe/1.0.0"
        || binding.recorder_adapter_schema_version != "forge-betaflight-msp-adapter/1.0.0"
    {
        return Err("recorder custody authorization requires the exact D55 contracts".to_string());
    }
    if binding.issued_at_unix_ms > binding.not_before_unix_ms
        || binding.not_before_unix_ms >= binding.expires_at_unix_ms
        || binding.expires_at_unix_ms - binding.not_before_unix_ms > MAX_AUTHORIZATION_LIFETIME_MS
        || now_unix_ms < binding.not_before_unix_ms
        || now_unix_ms > binding.expires_at_unix_ms
    {
        return Err(
            "recorder custody authorization is outside its bounded validity window".to_string(),
        );
    }
    if !binding.capture_consent_confirmed
        || !binding.no_auto_arm
        || binding.cryptographic_device_attestation
        || binding.recorded_device_attested
        || binding.field_session_verified
        || binding.sharing_authorized
        || binding.training_reuse_authorized
    {
        return Err("recorder custody authorization authority flags have drifted".to_string());
    }
    let exact_matches = [
        (
            binding.protected_revision.as_str(),
            expected.protected_revision,
        ),
        (binding.reference_rig_id.as_str(), expected.reference_rig_id),
        (binding.artifact_id.as_str(), expected.artifact_id),
        (binding.model_id.as_str(), expected.model_id),
        (binding.contract_hash.as_str(), expected.contract_hash),
        (binding.lockfile_hash.as_str(), expected.lockfile_hash),
        (
            binding.telemetry_source_port_sha256.as_str(),
            expected.telemetry_source_port_sha256,
        ),
        (
            binding.telemetry_os_descriptor_sha256.as_str(),
            expected.telemetry_os_descriptor_sha256,
        ),
        (
            binding.identity_source_port_sha256.as_str(),
            expected.identity_source_port_sha256,
        ),
        (
            binding.identity_os_descriptor_sha256.as_str(),
            expected.identity_os_descriptor_sha256,
        ),
        (
            binding.recorder_adapter_probe_schema_version.as_str(),
            expected.recorder_adapter_probe_schema_version,
        ),
        (
            binding.recorder_adapter_schema_version.as_str(),
            expected.recorder_adapter_schema_version,
        ),
    ];
    if exact_matches
        .iter()
        .any(|(actual, wanted)| actual != wanted)
    {
        return Err(
            "recorder custody authorization does not match the protected capture binding"
                .to_string(),
        );
    }
    Ok(())
}

pub(crate) fn load_and_verify_authorization(
    trust_bundle_path: &Path,
    expected_trust_bundle_sha256: &str,
    authorization_path: &Path,
    expected: &CustodyBindingInputs<'_>,
    now_unix_ms: u64,
) -> Result<VerifiedCustodyAuthorization, String> {
    if !is_lower_hex(expected_trust_bundle_sha256, 64) {
        return Err("deployment custody trust-bundle pin must be a lowercase SHA-256".to_string());
    }
    let trust_bundle_bytes = read_regular_bounded(
        trust_bundle_path,
        MAX_TRUST_BUNDLE_BYTES,
        "custody trust bundle",
    )?;
    let trust_bundle_sha256 = sha256_hex(&trust_bundle_bytes);
    if trust_bundle_sha256 != expected_trust_bundle_sha256 {
        return Err(
            "custody trust-bundle bytes do not match the deployment SHA-256 pin".to_string(),
        );
    }
    let trust_bundle: RecorderCustodyTrustBundle = serde_json::from_slice(&trust_bundle_bytes)
        .map_err(|err| format!("parse recorder custody trust bundle: {err}"))?;
    validate_trust_bundle(&trust_bundle)?;

    let authorization_bytes = read_regular_bounded(
        authorization_path,
        MAX_AUTHORIZATION_BYTES,
        "custody authorization",
    )?;
    let authorization_sha256 = sha256_hex(&authorization_bytes);
    let authorization: RecorderCustodyAuthorization = serde_json::from_slice(&authorization_bytes)
        .map_err(|err| format!("parse recorder custody authorization: {err}"))?;
    validate_authorization_binding(&authorization, expected, now_unix_ms)?;

    let key = trust_bundle
        .keys
        .iter()
        .find(|key| key.key_id == authorization.key_id)
        .ok_or_else(|| "custody authorization references an unknown trust key".to_string())?;
    if now_unix_ms < key.not_before_unix_ms
        || now_unix_ms > key.not_after_unix_ms
        || key
            .revoked_at_unix_ms
            .is_some_and(|revoked| revoked <= now_unix_ms)
    {
        return Err("custody authorization trust key is not currently valid".to_string());
    }
    let public_key = decode_hex::<32>(&key.public_key_hex, "custody public key")?;
    let verifying_key = VerifyingKey::from_bytes(&public_key)
        .map_err(|err| format!("parse custody Ed25519 public key: {err}"))?;
    if verifying_key.is_weak() {
        return Err("custody Ed25519 public key is weak".to_string());
    }
    let signature_bytes = decode_hex::<64>(&authorization.signature_hex, "custody signature")?;
    let signature = Signature::from_bytes(&signature_bytes);
    let binding_bytes = serde_json::to_vec(&authorization.binding)
        .map_err(|err| format!("serialize custody authorization binding: {err}"))?;
    let mut message = Vec::with_capacity(AUTHORIZATION_DOMAIN.len() + binding_bytes.len());
    message.extend_from_slice(AUTHORIZATION_DOMAIN);
    message.extend_from_slice(&binding_bytes);
    verifying_key
        .verify_strict(&message, &signature)
        .map_err(|_| "custody authorization signature verification failed".to_string())?;

    Ok(VerifiedCustodyAuthorization {
        trust_bundle,
        trust_bundle_sha256,
        authorization_sha256,
        authorization,
    })
}

pub(crate) fn write_custody_proof(inputs: RecorderCustodyProofInputs) -> Result<(), String> {
    if !inputs.proof_path.is_absolute() {
        return Err("custody proof path must be absolute".to_string());
    }
    let proof_parent = inputs
        .proof_path
        .parent()
        .ok_or_else(|| "custody proof path requires an existing parent directory".to_string())?;
    let parent_metadata = fs::symlink_metadata(proof_parent).map_err(|err| {
        format!(
            "inspect custody proof parent '{}': {err}",
            proof_parent.display()
        )
    })?;
    if parent_metadata.file_type().is_symlink() || !parent_metadata.is_dir() {
        return Err("custody proof parent must be a non-symlink directory".to_string());
    }
    let canonical_parent = fs::canonicalize(proof_parent)
        .map_err(|err| format!("canonicalize custody proof parent: {err}"))?;
    let archive = fs::canonicalize(&inputs.archive_path)
        .map_err(|err| format!("canonicalize recorder archive before custody proof: {err}"))?;
    let file_name = inputs
        .proof_path
        .file_name()
        .ok_or_else(|| "custody proof path requires a file name".to_string())?;
    let canonical_target = canonical_parent.join(file_name);
    if canonical_target.starts_with(&archive) {
        return Err("custody proof must remain outside the exact five-file archive".to_string());
    }
    if inputs.proof.schema_version != PROOF_SCHEMA_VERSION
        || inputs.proof.trust_bundle_schema_version != TRUST_BUNDLE_SCHEMA_VERSION
        || inputs.proof.authorization_schema_version != AUTHORIZATION_SCHEMA_VERSION
    {
        return Err("custody proof schema versions have drifted".to_string());
    }
    let mut bytes = serde_json::to_vec_pretty(&inputs.proof)
        .map_err(|err| format!("serialize recorder custody proof: {err}"))?;
    bytes.push(b'\n');
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&canonical_target)
        .map_err(|err| {
            format!(
                "create custody proof '{}': {err}",
                canonical_target.display()
            )
        })?;
    let write_result = file
        .write_all(&bytes)
        .map_err(|err| {
            format!(
                "write custody proof '{}': {err}",
                canonical_target.display()
            )
        })
        .and_then(|()| {
            file.sync_all().map_err(|err| {
                format!("sync custody proof '{}': {err}", canonical_target.display())
            })
        });
    if let Err(error) = write_result {
        drop(file);
        fs::remove_file(&canonical_target).map_err(|cleanup| {
            format!(
                "{error}; also failed to remove partial custody proof '{}': {cleanup}",
                canonical_target.display()
            )
        })?;
        return Err(error);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("forge-custody-{name}-{stamp}"));
        fs::create_dir(&dir).expect("test directory");
        dir
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    fn fixture_binding(now: u64) -> RecorderCustodyAuthorizationBinding {
        RecorderCustodyAuthorizationBinding {
            authorization_id: "authorization-1".to_string(),
            purpose: CUSTODY_PURPOSE.to_string(),
            protected_revision: "a".repeat(40),
            evidence_pack_schema_version: "forge.external-acceptance.v1".to_string(),
            evidence_pack_sha256: "1".repeat(64),
            required_signoff_set_sha256: "2".repeat(64),
            reference_rig_id: "ref_quad_kakute-h7-source-one-5in".to_string(),
            artifact_id: "artifact-1".to_string(),
            model_id: "model-1".to_string(),
            contract_hash: "3".repeat(64),
            lockfile_hash: "4".repeat(64),
            telemetry_source_port_sha256: "5".repeat(64),
            telemetry_os_descriptor_sha256: "6".repeat(64),
            identity_source_port_sha256: "7".repeat(64),
            identity_os_descriptor_sha256: "8".repeat(64),
            recorder_adapter_probe_schema_version: "forge-recorder-adapter-probe/1.0.0".to_string(),
            recorder_adapter_schema_version: "forge-betaflight-msp-adapter/1.0.0".to_string(),
            expected_identity_sha256: "9".repeat(64),
            expected_device_uid_sha256: "a".repeat(64),
            issued_at_unix_ms: now - 1_000,
            not_before_unix_ms: now - 500,
            expires_at_unix_ms: now + 10_000,
            capture_consent_confirmed: true,
            no_auto_arm: true,
            cryptographic_device_attestation: false,
            recorded_device_attested: false,
            field_session_verified: false,
            sharing_authorized: false,
            training_reuse_authorized: false,
        }
    }

    fn inputs<'a>(binding: &'a RecorderCustodyAuthorizationBinding) -> CustodyBindingInputs<'a> {
        CustodyBindingInputs {
            protected_revision: &binding.protected_revision,
            reference_rig_id: &binding.reference_rig_id,
            artifact_id: &binding.artifact_id,
            model_id: &binding.model_id,
            contract_hash: &binding.contract_hash,
            lockfile_hash: &binding.lockfile_hash,
            telemetry_source_port_sha256: &binding.telemetry_source_port_sha256,
            telemetry_os_descriptor_sha256: &binding.telemetry_os_descriptor_sha256,
            identity_source_port_sha256: &binding.identity_source_port_sha256,
            identity_os_descriptor_sha256: &binding.identity_os_descriptor_sha256,
            recorder_adapter_probe_schema_version: &binding.recorder_adapter_probe_schema_version,
            recorder_adapter_schema_version: &binding.recorder_adapter_schema_version,
        }
    }

    fn write_fixture(
        dir: &Path,
        binding: RecorderCustodyAuthorizationBinding,
        revoked_at_unix_ms: Option<u64>,
    ) -> (PathBuf, String, PathBuf) {
        let signing_key = SigningKey::from_bytes(&[7_u8; 32]);
        let trust_bundle = RecorderCustodyTrustBundle {
            schema_version: TRUST_BUNDLE_SCHEMA_VERSION.to_string(),
            bundle_id: "lab-trust-1".to_string(),
            purpose: CUSTODY_PURPOSE.to_string(),
            keys: vec![RecorderCustodyTrustKey {
                key_id: "acceptance-key-1".to_string(),
                algorithm: "Ed25519".to_string(),
                public_key_hex: hex(signing_key.verifying_key().as_bytes()),
                not_before_unix_ms: binding.not_before_unix_ms - 1_000,
                not_after_unix_ms: binding.expires_at_unix_ms + 1_000,
                revoked_at_unix_ms,
            }],
        };
        let trust_bytes = serde_json::to_vec_pretty(&trust_bundle).expect("trust JSON");
        let trust_path = dir.join("trust.json");
        fs::write(&trust_path, &trust_bytes).expect("write trust");

        let binding_bytes = serde_json::to_vec(&binding).expect("binding JSON");
        let mut message = AUTHORIZATION_DOMAIN.to_vec();
        message.extend_from_slice(&binding_bytes);
        let signature = signing_key.sign(&message);
        let authorization = RecorderCustodyAuthorization {
            schema_version: AUTHORIZATION_SCHEMA_VERSION.to_string(),
            key_id: "acceptance-key-1".to_string(),
            algorithm: "Ed25519".to_string(),
            signature_hex: hex(&signature.to_bytes()),
            binding,
        };
        let authorization_path = dir.join("authorization.json");
        fs::write(
            &authorization_path,
            serde_json::to_vec_pretty(&authorization).expect("authorization JSON"),
        )
        .expect("write authorization");
        (trust_path, sha256_hex(&trust_bytes), authorization_path)
    }

    #[test]
    fn strict_signature_and_exact_capture_binding_pass() {
        let now = 1_900_000_000_000_u64;
        let binding = fixture_binding(now);
        let expected_binding = binding.clone();
        let dir = test_dir("valid");
        let (trust, pin, authorization) = write_fixture(&dir, binding, None);
        let verified = load_and_verify_authorization(
            &trust,
            &pin,
            &authorization,
            &inputs(&expected_binding),
            now,
        )
        .expect("valid authorization");
        assert_eq!(
            verified.authorization.binding.authorization_id,
            "authorization-1"
        );
        assert!(is_lower_hex(&verified.authorization_sha256, 64));
        assert_eq!(verified.trust_bundle.bundle_id, "lab-trust-1");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn tampering_revocation_expiry_and_binding_drift_fail_closed() {
        let now = 1_900_000_000_000_u64;
        let binding = fixture_binding(now);
        let expected_binding = binding.clone();
        let dir = test_dir("refusal");
        let (trust, pin, authorization) = write_fixture(&dir, binding, Some(now));
        assert!(load_and_verify_authorization(
            &trust,
            &pin,
            &authorization,
            &inputs(&expected_binding),
            now,
        )
        .unwrap_err()
        .contains("not currently valid"));

        let dir2 = test_dir("drift");
        let (trust2, pin2, authorization2) = write_fixture(&dir2, fixture_binding(now), None);
        let mut drift = fixture_binding(now);
        drift.artifact_id = "substituted".to_string();
        assert!(load_and_verify_authorization(
            &trust2,
            &pin2,
            &authorization2,
            &inputs(&drift),
            now,
        )
        .unwrap_err()
        .contains("does not match"));
        assert!(load_and_verify_authorization(
            &trust2,
            &"0".repeat(64),
            &authorization2,
            &inputs(&fixture_binding(now)),
            now,
        )
        .unwrap_err()
        .contains("do not match"));
        let _ = fs::remove_dir_all(dir);
        let _ = fs::remove_dir_all(dir2);
    }

    #[test]
    fn malformed_signature_weak_key_wrong_purpose_and_unknown_fields_fail_closed() {
        let now = 1_900_000_000_000_u64;
        let expected_binding = fixture_binding(now);

        let signature_dir = test_dir("signature-tamper");
        let (trust, pin, authorization) =
            write_fixture(&signature_dir, expected_binding.clone(), None);
        let mut envelope: RecorderCustodyAuthorization =
            serde_json::from_slice(&fs::read(&authorization).expect("read authorization"))
                .expect("parse authorization");
        let replacement = if envelope.signature_hex.starts_with("00") {
            "01"
        } else {
            "00"
        };
        envelope.signature_hex.replace_range(0..2, replacement);
        fs::write(
            &authorization,
            serde_json::to_vec_pretty(&envelope).expect("tampered authorization JSON"),
        )
        .expect("write tampered authorization");
        assert!(load_and_verify_authorization(
            &trust,
            &pin,
            &authorization,
            &inputs(&expected_binding),
            now,
        )
        .unwrap_err()
        .contains("signature verification failed"));

        let weak_dir = test_dir("weak-key");
        let (weak_trust, _, weak_authorization) =
            write_fixture(&weak_dir, expected_binding.clone(), None);
        let mut bundle: RecorderCustodyTrustBundle =
            serde_json::from_slice(&fs::read(&weak_trust).expect("read trust bundle"))
                .expect("parse trust bundle");
        bundle.keys[0].public_key_hex = "00".repeat(32);
        let weak_bytes = serde_json::to_vec_pretty(&bundle).expect("weak trust JSON");
        fs::write(&weak_trust, &weak_bytes).expect("write weak trust bundle");
        assert!(load_and_verify_authorization(
            &weak_trust,
            &sha256_hex(&weak_bytes),
            &weak_authorization,
            &inputs(&expected_binding),
            now,
        )
        .unwrap_err()
        .contains("weak"));

        let expired_dir = test_dir("expired");
        let (expired_trust, expired_pin, expired_authorization) =
            write_fixture(&expired_dir, expected_binding.clone(), None);
        assert!(load_and_verify_authorization(
            &expired_trust,
            &expired_pin,
            &expired_authorization,
            &inputs(&expected_binding),
            expected_binding.expires_at_unix_ms + 1,
        )
        .unwrap_err()
        .contains("validity window"));

        let purpose_dir = test_dir("purpose");
        let mut wrong_purpose = expected_binding.clone();
        wrong_purpose.purpose = "general-signing".to_string();
        let (purpose_trust, purpose_pin, purpose_authorization) =
            write_fixture(&purpose_dir, wrong_purpose, None);
        assert!(load_and_verify_authorization(
            &purpose_trust,
            &purpose_pin,
            &purpose_authorization,
            &inputs(&expected_binding),
            now,
        )
        .unwrap_err()
        .contains("scope is invalid"));

        let unknown_dir = test_dir("unknown-field");
        let (unknown_trust, unknown_pin, unknown_authorization) =
            write_fixture(&unknown_dir, expected_binding.clone(), None);
        let mut unknown: serde_json::Value =
            serde_json::from_slice(&fs::read(&unknown_authorization).expect("read authorization"))
                .expect("parse authorization value");
        unknown["callerAuthority"] = serde_json::json!(true);
        fs::write(
            &unknown_authorization,
            serde_json::to_vec_pretty(&unknown).expect("unknown-field JSON"),
        )
        .expect("write unknown-field authorization");
        assert!(load_and_verify_authorization(
            &unknown_trust,
            &unknown_pin,
            &unknown_authorization,
            &inputs(&expected_binding),
            now,
        )
        .unwrap_err()
        .contains("parse recorder custody authorization"));

        for dir in [
            signature_dir,
            weak_dir,
            expired_dir,
            purpose_dir,
            unknown_dir,
        ] {
            let _ = fs::remove_dir_all(dir);
        }
    }
}
