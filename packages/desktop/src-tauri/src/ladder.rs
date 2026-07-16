use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

pub const DEPLOYMENT_LADDER_SCHEMA_VERSION: &str = "forge-deployment-ladder/1.0.0";
pub const DEPLOYMENT_LADDER_CONTROL_SCHEMA_VERSION: &str = "forge-deployment-ladder-control/1.0.0";
pub const DEPLOYMENT_LADDER_MATURITY: &str = "local-ux-rehearsal";
pub const DEPLOYMENT_LADDER_START_CONFIRMATION: &str =
    "I confirm this is a rehearsal-only ladder session and grants no hardware authority";
pub const DEPLOYMENT_LADDER_END_CONFIRMATION: &str =
    "I confirm this rehearsal is ended and no hardware authority was granted";
pub const HITL_CONFIRMATION: &str =
    "I physically confirm the controller is bench-connected, actuators are disabled, and the supervisor fallback is ready";
pub const CONSTRAINED_CONFIRMATION: &str =
    "I physically confirm the restraint, observer, hardware kill switch, and supervisor fallback are ready";
pub const FREE_CONFIRMATION: &str =
    "I physically confirm the declared envelope, observer, hardware kill switch, fresh battery, telemetry recording, and supervisor fallback are ready";

const D12_RIGS: [&str; 2] = [
    "ref_quad_kakute-h7-source-one-5in",
    "ref_rover_waveshare-ugv-rover-pt-pi5-ros2",
];
const STAGES: [&str; 4] = ["sitl", "hitl", "constrained", "free"];
const PHYSICAL_CONFIRMATION_STAGES: [&str; 3] = ["hitl", "constrained", "free"];
const POLICY_RATE_HZ: u32 = 50;
const SUPERVISOR_RATE_HZ: u32 = 200;
const MISSED_INFERENCE_FALLBACK: &str = "position-hold-or-manual";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeploymentLadderStartRequest {
    pub session_id: String,
    pub reference_rig_id: String,
    pub model_id: String,
    pub contract_hash: String,
    pub lockfile_hash: String,
    pub policy_artifact_id: String,
    pub policy_export_gate: String,
    pub supervisor_job_id: String,
    pub supervisor_decision: String,
    pub supervisor_allow_policy: bool,
    pub policy_rate_hz: u32,
    pub supervisor_rate_hz: u32,
    pub firmware_rate_loop_untouched: bool,
    pub missed_inference_fallback: String,
    pub physical_confirmation: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeploymentLadderAdvanceRequest {
    pub session_id: String,
    pub from_stage: String,
    pub to_stage: String,
    pub physical_confirmation: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeploymentLadderResetRequest {
    pub session_id: String,
    pub physical_confirmation: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentLadderStatus {
    pub schema_version: &'static str,
    pub contract_schema_version: &'static str,
    pub state: &'static str,
    pub rehearsal_maturity: &'static str,
    pub session_id: Option<String>,
    pub reference_rig_id: Option<String>,
    pub model_id: Option<String>,
    pub contract_hash: Option<String>,
    pub lockfile_hash: Option<String>,
    pub policy_artifact_id: Option<String>,
    pub supervisor_job_id: Option<String>,
    pub current_stage: Option<&'static str>,
    pub next_stage: Option<&'static str>,
    pub acknowledged_stages: Vec<&'static str>,
    pub stage_order: Vec<&'static str>,
    pub physical_confirmation_stages: Vec<&'static str>,
    pub transition_count: u8,
    pub policy_rate_hz: u32,
    pub supervisor_rate_hz: u32,
    pub firmware_rate_loop_untouched: bool,
    pub missed_inference_fallback: &'static str,
    pub policy_advisory: bool,
    pub supervisor_authority: bool,
    pub no_auto_arm: bool,
    pub client_evidence_bound: bool,
    pub deployment_evidence_verified: bool,
    pub physical_confirmation_evidence_verified: bool,
    pub hardware_execution_authorized: bool,
    pub device_identity_verified: bool,
    pub field_session_verified: bool,
    pub external_beta_enabled: bool,
}

#[derive(Debug, Clone)]
struct DeploymentLadderSession {
    request: DeploymentLadderStartRequest,
    stage_index: usize,
}

#[derive(Debug, Default)]
pub struct DeploymentLadderRuntime {
    session: Mutex<Option<DeploymentLadderSession>>,
}

impl DeploymentLadderRuntime {
    pub fn status(&self) -> Result<DeploymentLadderStatus, String> {
        let guard = self
            .session
            .lock()
            .map_err(|_| "deployment ladder runtime lock is poisoned".to_string())?;
        Ok(match guard.as_ref() {
            Some(session) => status_for_session(session),
            None => inactive_status(),
        })
    }

    pub fn start(
        &self,
        request: DeploymentLadderStartRequest,
    ) -> Result<DeploymentLadderStatus, String> {
        validate_start_request(&request)?;
        let mut guard = self
            .session
            .lock()
            .map_err(|_| "deployment ladder runtime lock is poisoned".to_string())?;
        if guard.is_some() {
            return Err(
                "a deployment-ladder rehearsal is already active; end it before starting another"
                    .to_string(),
            );
        }
        let session = DeploymentLadderSession {
            request,
            stage_index: 0,
        };
        let status = status_for_session(&session);
        *guard = Some(session);
        Ok(status)
    }

    pub fn advance(
        &self,
        request: DeploymentLadderAdvanceRequest,
    ) -> Result<DeploymentLadderStatus, String> {
        let mut guard = self
            .session
            .lock()
            .map_err(|_| "deployment ladder runtime lock is poisoned".to_string())?;
        let session = guard
            .as_mut()
            .ok_or_else(|| "no deployment-ladder rehearsal is active".to_string())?;
        if request.session_id != session.request.session_id {
            return Err("deployment-ladder session identity mismatch".to_string());
        }
        if session.stage_index + 1 >= STAGES.len() {
            return Err(
                "the deployment-ladder rehearsal is already at free operation; end it explicitly"
                    .to_string(),
            );
        }
        let expected_from = STAGES[session.stage_index];
        let expected_to = STAGES[session.stage_index + 1];
        if request.from_stage != expected_from || request.to_stage != expected_to {
            return Err(format!(
                "deployment-ladder transitions cannot be skipped: expected {expected_from} -> {expected_to}"
            ));
        }
        let expected_confirmation = confirmation_for(expected_to)
            .expect("every hardware-touching successor has a confirmation");
        if request.physical_confirmation != expected_confirmation {
            return Err(format!(
                "the exact {expected_to} physical-confirmation interaction is required"
            ));
        }
        session.stage_index += 1;
        Ok(status_for_session(session))
    }

    pub fn reset(
        &self,
        request: DeploymentLadderResetRequest,
    ) -> Result<DeploymentLadderStatus, String> {
        let mut guard = self
            .session
            .lock()
            .map_err(|_| "deployment ladder runtime lock is poisoned".to_string())?;
        let session = guard
            .as_ref()
            .ok_or_else(|| "no deployment-ladder rehearsal is active".to_string())?;
        if request.session_id != session.request.session_id {
            return Err("deployment-ladder session identity mismatch".to_string());
        }
        if request.physical_confirmation != DEPLOYMENT_LADDER_END_CONFIRMATION {
            return Err("the exact rehearsal-end confirmation is required".to_string());
        }
        *guard = None;
        Ok(inactive_status())
    }
}

pub fn deployment_ladder_runtime() -> &'static DeploymentLadderRuntime {
    static RUNTIME: OnceLock<DeploymentLadderRuntime> = OnceLock::new();
    RUNTIME.get_or_init(DeploymentLadderRuntime::default)
}

fn inactive_status() -> DeploymentLadderStatus {
    DeploymentLadderStatus {
        schema_version: DEPLOYMENT_LADDER_CONTROL_SCHEMA_VERSION,
        contract_schema_version: DEPLOYMENT_LADDER_SCHEMA_VERSION,
        state: "inactive",
        rehearsal_maturity: DEPLOYMENT_LADDER_MATURITY,
        session_id: None,
        reference_rig_id: None,
        model_id: None,
        contract_hash: None,
        lockfile_hash: None,
        policy_artifact_id: None,
        supervisor_job_id: None,
        current_stage: None,
        next_stage: Some(STAGES[0]),
        acknowledged_stages: Vec::new(),
        stage_order: STAGES.to_vec(),
        physical_confirmation_stages: PHYSICAL_CONFIRMATION_STAGES.to_vec(),
        transition_count: 0,
        policy_rate_hz: POLICY_RATE_HZ,
        supervisor_rate_hz: SUPERVISOR_RATE_HZ,
        firmware_rate_loop_untouched: true,
        missed_inference_fallback: MISSED_INFERENCE_FALLBACK,
        policy_advisory: true,
        supervisor_authority: true,
        no_auto_arm: true,
        client_evidence_bound: false,
        deployment_evidence_verified: false,
        physical_confirmation_evidence_verified: false,
        hardware_execution_authorized: false,
        device_identity_verified: false,
        field_session_verified: false,
        external_beta_enabled: false,
    }
}

fn status_for_session(session: &DeploymentLadderSession) -> DeploymentLadderStatus {
    let mut status = inactive_status();
    status.state = if session.stage_index + 1 == STAGES.len() {
        "rehearsal-complete"
    } else {
        "rehearsing"
    };
    status.session_id = Some(session.request.session_id.clone());
    status.reference_rig_id = Some(session.request.reference_rig_id.clone());
    status.model_id = Some(session.request.model_id.clone());
    status.contract_hash = Some(session.request.contract_hash.clone());
    status.lockfile_hash = Some(session.request.lockfile_hash.clone());
    status.policy_artifact_id = Some(session.request.policy_artifact_id.clone());
    status.supervisor_job_id = Some(session.request.supervisor_job_id.clone());
    status.current_stage = Some(STAGES[session.stage_index]);
    status.next_stage = STAGES.get(session.stage_index + 1).copied();
    status.acknowledged_stages = STAGES[..=session.stage_index].to_vec();
    status.transition_count = u8::try_from(session.stage_index).expect("four ladder stages fit u8");
    status.client_evidence_bound = true;
    status
}

fn validate_start_request(request: &DeploymentLadderStartRequest) -> Result<(), String> {
    for (label, value) in [
        ("sessionId", request.session_id.as_str()),
        ("modelId", request.model_id.as_str()),
        ("policyArtifactId", request.policy_artifact_id.as_str()),
        ("supervisorJobId", request.supervisor_job_id.as_str()),
    ] {
        if !is_safe_id(value) {
            return Err(format!(
                "deployment-ladder {label} must use 1 through 128 safe ASCII characters"
            ));
        }
    }
    if !D12_RIGS.contains(&request.reference_rig_id.as_str()) {
        return Err(
            "deployment-ladder rehearsal requires one frozen D12 reference rig".to_string(),
        );
    }
    if !is_sha256(&request.contract_hash) || !is_sha256(&request.lockfile_hash) {
        return Err(
            "deployment-ladder contract and lockfile hashes must be lowercase SHA-256 values"
                .to_string(),
        );
    }
    if request.policy_export_gate != "exportable"
        || request.supervisor_decision != "policy-advisory"
        || !request.supervisor_allow_policy
    {
        return Err(
            "deployment-ladder rehearsal requires an exportable policy and passing advisory supervisor result"
                .to_string(),
        );
    }
    if request.policy_rate_hz != POLICY_RATE_HZ
        || request.supervisor_rate_hz != SUPERVISOR_RATE_HZ
        || !request.firmware_rate_loop_untouched
        || request.missed_inference_fallback != MISSED_INFERENCE_FALLBACK
    {
        return Err("deployment-ladder D9 control-rate authority has drifted".to_string());
    }
    if request.physical_confirmation != DEPLOYMENT_LADDER_START_CONFIRMATION {
        return Err("the exact rehearsal-only start confirmation is required".to_string());
    }
    Ok(())
}

fn confirmation_for(stage: &str) -> Option<&'static str> {
    match stage {
        "hitl" => Some(HITL_CONFIRMATION),
        "constrained" => Some(CONSTRAINED_CONFIRMATION),
        "free" => Some(FREE_CONFIRMATION),
        _ => None,
    }
}

fn is_safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start_request() -> DeploymentLadderStartRequest {
        DeploymentLadderStartRequest {
            session_id: "ladder-session-1".to_string(),
            reference_rig_id: D12_RIGS[1].to_string(),
            model_id: "model-1".to_string(),
            contract_hash: "11".repeat(32),
            lockfile_hash: "22".repeat(32),
            policy_artifact_id: "policy-1".to_string(),
            policy_export_gate: "exportable".to_string(),
            supervisor_job_id: "supervisor-1".to_string(),
            supervisor_decision: "policy-advisory".to_string(),
            supervisor_allow_policy: true,
            policy_rate_hz: POLICY_RATE_HZ,
            supervisor_rate_hz: SUPERVISOR_RATE_HZ,
            firmware_rate_loop_untouched: true,
            missed_inference_fallback: MISSED_INFERENCE_FALLBACK.to_string(),
            physical_confirmation: DEPLOYMENT_LADDER_START_CONFIRMATION.to_string(),
        }
    }

    fn advance_request(from: &str, to: &str) -> DeploymentLadderAdvanceRequest {
        DeploymentLadderAdvanceRequest {
            session_id: "ladder-session-1".to_string(),
            from_stage: from.to_string(),
            to_stage: to.to_string(),
            physical_confirmation: confirmation_for(to).unwrap_or("").to_string(),
        }
    }

    #[test]
    fn rehearsal_is_shell_owned_sequential_and_permanently_non_authorizing() {
        let runtime = DeploymentLadderRuntime::default();
        let inactive = runtime.status().expect("inactive status");
        assert_eq!(inactive.state, "inactive");
        assert_eq!(inactive.next_stage, Some("sitl"));
        assert!(!inactive.hardware_execution_authorized);

        let sitl = runtime
            .start(start_request())
            .expect("start SITL rehearsal");
        assert_eq!(sitl.state, "rehearsing");
        assert_eq!(sitl.current_stage, Some("sitl"));
        assert_eq!(sitl.next_stage, Some("hitl"));
        assert!(sitl.client_evidence_bound);

        for (from, to) in [
            ("sitl", "hitl"),
            ("hitl", "constrained"),
            ("constrained", "free"),
        ] {
            let status = runtime
                .advance(advance_request(from, to))
                .expect("exact next rehearsal transition");
            assert_eq!(status.current_stage, Some(to));
            assert!(!status.deployment_evidence_verified);
            assert!(!status.physical_confirmation_evidence_verified);
            assert!(!status.hardware_execution_authorized);
            assert!(!status.device_identity_verified);
            assert!(!status.field_session_verified);
            assert!(!status.external_beta_enabled);
            assert!(status.no_auto_arm);
            assert!(status.policy_advisory);
            assert!(status.supervisor_authority);
        }
        let complete = runtime.status().expect("complete rehearsal status");
        assert_eq!(complete.state, "rehearsal-complete");
        assert_eq!(complete.acknowledged_stages, STAGES);
        assert_eq!(complete.next_stage, None);
        assert!(runtime
            .advance(advance_request("free", "free"))
            .expect_err("free cannot advance")
            .contains("already at free"));

        let inactive = runtime
            .reset(DeploymentLadderResetRequest {
                session_id: "ladder-session-1".to_string(),
                physical_confirmation: DEPLOYMENT_LADDER_END_CONFIRMATION.to_string(),
            })
            .expect("end rehearsal explicitly");
        assert_eq!(inactive.state, "inactive");
        assert!(!inactive.client_evidence_bound);
    }

    #[test]
    fn rehearsal_refuses_skips_confirmation_drift_and_parallel_sessions() {
        let runtime = DeploymentLadderRuntime::default();
        runtime.start(start_request()).expect("start rehearsal");
        assert!(runtime
            .start(start_request())
            .expect_err("parallel rehearsal must fail")
            .contains("already active"));

        let mut skip = advance_request("sitl", "constrained");
        skip.physical_confirmation = CONSTRAINED_CONFIRMATION.to_string();
        assert!(runtime
            .advance(skip)
            .expect_err("stage skip must fail")
            .contains("cannot be skipped"));

        let mut wrong_phrase = advance_request("sitl", "hitl");
        wrong_phrase.physical_confirmation = "continue".to_string();
        assert!(runtime
            .advance(wrong_phrase)
            .expect_err("confirmation substitution must fail")
            .contains("exact hitl"));

        let mut wrong_session = advance_request("sitl", "hitl");
        wrong_session.session_id = "other-session".to_string();
        assert!(runtime
            .advance(wrong_session)
            .expect_err("session substitution must fail")
            .contains("identity mismatch"));

        assert!(runtime
            .reset(DeploymentLadderResetRequest {
                session_id: "ladder-session-1".to_string(),
                physical_confirmation: "end".to_string(),
            })
            .expect_err("reset confirmation substitution must fail")
            .contains("exact rehearsal-end"));

        assert_eq!(
            runtime.status().expect("unchanged status").current_stage,
            Some("sitl")
        );
    }

    #[test]
    fn start_refuses_d9_evidence_scope_and_unknown_fields() {
        let runtime = DeploymentLadderRuntime::default();
        let mut wrong_rate = start_request();
        wrong_rate.supervisor_rate_hz = 199;
        assert!(runtime
            .start(wrong_rate)
            .expect_err("D9 rate drift must fail")
            .contains("D9"));

        let mut held = start_request();
        held.policy_export_gate = "held".to_string();
        assert!(runtime
            .start(held)
            .expect_err("held policy must fail")
            .contains("exportable policy"));

        let mut wrong_rig = start_request();
        wrong_rig.reference_rig_id = "other-rig".to_string();
        assert!(runtime
            .start(wrong_rig)
            .expect_err("non-D12 rig must fail")
            .contains("D12"));

        let mut value = serde_json::to_value(start_request()).expect("serialize start request");
        value.as_object_mut().expect("request object").insert(
            "hardwareExecutionAuthorized".to_string(),
            serde_json::json!(true),
        );
        assert!(serde_json::from_value::<DeploymentLadderStartRequest>(value).is_err());
    }

    #[test]
    fn checked_contract_matches_native_versions_order_and_confirmations() {
        let contract: serde_json::Value =
            serde_json::from_str(include_str!("../../deployment-ladder.json"))
                .expect("deployment ladder JSON parses");
        assert_eq!(contract["schemaVersion"], DEPLOYMENT_LADDER_SCHEMA_VERSION);
        assert_eq!(
            contract["controlSchemaVersion"],
            DEPLOYMENT_LADDER_CONTROL_SCHEMA_VERSION
        );
        assert_eq!(
            contract["startConfirmation"],
            DEPLOYMENT_LADDER_START_CONFIRMATION
        );
        let stages = contract["stages"]
            .as_array()
            .expect("contract stages are an array");
        assert_eq!(
            stages
                .iter()
                .map(|stage| stage["id"].as_str().expect("stage id"))
                .collect::<Vec<_>>(),
            STAGES
        );
        for (stage, confirmation) in [
            ("hitl", HITL_CONFIRMATION),
            ("constrained", CONSTRAINED_CONFIRMATION),
            ("free", FREE_CONFIRMATION),
        ] {
            let entry = stages
                .iter()
                .find(|entry| entry["id"] == stage)
                .expect("hardware stage exists");
            assert_eq!(entry["transitionConfirmation"], confirmation);
            assert_eq!(entry["physicalConfirmation"], true);
        }
        assert_eq!(contract["authority"]["hardwareExecutionAuthorized"], false);
        assert_eq!(contract["authority"]["deploymentEvidenceVerified"], false);
        assert_eq!(contract["authority"]["noAutoArm"], true);
    }
}
