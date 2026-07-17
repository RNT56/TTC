//! Native validator + Rapier candidate evidence for the P9 co-design ladder.
//!
//! This is deliberately narrower than an optimizer. It evaluates one exact
//! candidate snapshot and returns deterministic tier-0/tier-1 evidence. The
//! Python worker owns search orchestration and the pinned MuJoCo tier, but may
//! not reinterpret this artifact as training or build/field proof.

use crate::file_catalog::FileCatalog;
use crate::{run_full, EmptyCatalog, Options, Severity, Verdict};
use forge_sim::rapier::{RapierWorld, RapierWorldConfig};
use serde::Serialize;
use sha2::{Digest, Sha256};

pub const CODESIGN_NATIVE_EVALUATION_SCHEMA: &str = "forge-codesign-native-evaluation";
pub const CODESIGN_NATIVE_EVALUATION_VERSION: &str = "1.0.0";
pub const CODESIGN_CATALOG_NATIVE_EVALUATION_VERSION: &str = "2.0.0";
pub const CODESIGN_CATALOG_PROOF_SCHEMA: &str = "forge-codesign-catalog-proof";
pub const CODESIGN_CATALOG_PROOF_VERSION: &str = "1.0.0";
pub const RAPIER_ENGINE_VERSION: &str = "rapier3d/0.33.0";
pub const RAPIER_DT_S: f64 = 1.0 / 120.0;
pub const RAPIER_SUBSTEPS: u32 = 2;
pub const RAPIER_STEPS: u32 = 120;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignDiagnostic {
    pub check: String,
    pub severity: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignTier0Proof {
    pub engine: &'static str,
    pub engine_backed: bool,
    pub passed: bool,
    pub report_version: String,
    pub validator_version: String,
    pub contract_hash: String,
    pub runtime_ms: u64,
    pub diagnostics: Vec<CodesignDiagnostic>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hud: Option<forge_sim::Hud>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignTier1Proof {
    pub engine: &'static str,
    pub engine_backed: bool,
    pub passed: bool,
    pub dt_s: f64,
    pub substeps: u32,
    pub steps: u32,
    pub simulated_duration_s: f64,
    pub body_count: usize,
    pub collider_count: usize,
    pub joint_count: usize,
    pub root_node: String,
    pub start_root_translation_m: [f64; 3],
    pub end_root_translation_m: [f64; 3],
    pub max_abs_translation_m: f64,
    pub max_linear_speed_mps: f64,
    pub trajectory_sha256: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignNativeNonclaims {
    pub mujoco_evaluated: bool,
    pub trained_policy_evaluated: bool,
    pub build_ready: bool,
    pub hardware_authority: bool,
    pub field_evidence: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignNativeEvaluation {
    pub schema_version: String,
    pub artifact_kind: &'static str,
    pub candidate_snapshot_sha256: String,
    pub passed: bool,
    pub tier0: CodesignTier0Proof,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier1: Option<CodesignTier1Proof>,
    pub nonclaims: CodesignNativeNonclaims,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignCatalogLicenseProof {
    pub id: String,
    pub class: String,
    pub source_url: String,
    pub export_policy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignEquippedCatalogProof {
    pub slot_id: String,
    pub variant_id: String,
    pub component_ref: String,
    pub exact_revision: String,
    pub component_id: String,
    pub category: String,
    pub row_sha256: String,
    pub mass_g: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capacity_mah: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_discharge_a: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kv: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prop_diameter_in: Option<f64>,
    pub confidence: f64,
    pub review_required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review: Option<String>,
    pub license: CodesignCatalogLicenseProof,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignCatalogProof {
    pub schema_version: String,
    pub catalog_authority_sha256: String,
    pub resolution_complete: bool,
    pub equipped_components: Vec<CodesignEquippedCatalogProof>,
    pub marketplace_publication_reviewed: bool,
    pub marketplace_exposable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodesignCatalogNativeEvaluation {
    pub schema_version: String,
    pub artifact_kind: &'static str,
    pub candidate_snapshot_sha256: String,
    pub passed: bool,
    pub tier0: CodesignTier0Proof,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier1: Option<CodesignTier1Proof>,
    pub catalog_proof: CodesignCatalogProof,
    pub nonclaims: CodesignNativeNonclaims,
}

pub fn evaluate_candidate(doc: &str, snapshot_sha256: &str) -> CodesignNativeEvaluation {
    let report = run_full(doc, &EmptyCatalog, &Options::default());
    let diagnostics = report
        .results
        .iter()
        .map(|diagnostic| CodesignDiagnostic {
            check: diagnostic.check.clone(),
            severity: match diagnostic.severity {
                Severity::Error => "error",
                Severity::Warn => "warn",
            }
            .to_string(),
            message: diagnostic.message.clone(),
        })
        .collect();
    let tier0_passed = report.verdict == Verdict::Admitted;
    let tier0 = CodesignTier0Proof {
        engine: "forge-validate-native",
        engine_backed: true,
        passed: tier0_passed,
        report_version: report.report_version.clone(),
        validator_version: report.validator_version.clone(),
        contract_hash: report.contract_hash.clone(),
        runtime_ms: report.duration_ms,
        diagnostics,
        hud: report.hud.clone(),
    };

    let tier1 = if tier0_passed {
        evaluate_rapier(doc).ok()
    } else {
        None
    };
    let passed = tier0_passed && tier1.as_ref().is_some_and(|proof| proof.passed);
    CodesignNativeEvaluation {
        schema_version: format!(
            "{CODESIGN_NATIVE_EVALUATION_SCHEMA}/{CODESIGN_NATIVE_EVALUATION_VERSION}"
        ),
        artifact_kind: "codesignNativeEvaluation",
        candidate_snapshot_sha256: snapshot_sha256.to_string(),
        passed,
        tier0,
        tier1,
        nonclaims: CodesignNativeNonclaims {
            mujoco_evaluated: false,
            trained_policy_evaluated: false,
            build_ready: false,
            hardware_authority: false,
            field_evidence: false,
        },
    }
}

/// Catalog-aware major of the native co-design artifact. Native v1 remains the
/// historical inline-contract authority; v2 additionally proves the exact file
/// catalog and the sole equipped revision in every catalog-backed slot.
pub fn evaluate_candidate_with_catalog(
    doc: &str,
    snapshot_sha256: &str,
    catalog: &FileCatalog,
) -> CodesignCatalogNativeEvaluation {
    let report = run_full(doc, catalog, &Options::default());
    let diagnostics = report
        .results
        .iter()
        .map(|diagnostic| CodesignDiagnostic {
            check: diagnostic.check.clone(),
            severity: match diagnostic.severity {
                Severity::Error => "error",
                Severity::Warn => "warn",
            }
            .to_string(),
            message: diagnostic.message.clone(),
        })
        .collect();
    let tier0_passed = report.verdict == Verdict::Admitted;
    let tier0 = CodesignTier0Proof {
        engine: "forge-validate-native",
        engine_backed: true,
        passed: tier0_passed,
        report_version: report.report_version.clone(),
        validator_version: report.validator_version.clone(),
        contract_hash: report.contract_hash.clone(),
        runtime_ms: report.duration_ms,
        diagnostics,
        hud: report.hud.clone(),
    };
    let catalog_proof = catalog_proof(doc, catalog);
    let tier1 = if tier0_passed && catalog_proof.resolution_complete {
        evaluate_rapier(doc).ok()
    } else {
        None
    };
    let passed = tier0_passed
        && catalog_proof.resolution_complete
        && tier1.as_ref().is_some_and(|proof| proof.passed);
    CodesignCatalogNativeEvaluation {
        schema_version: format!(
            "{CODESIGN_NATIVE_EVALUATION_SCHEMA}/{CODESIGN_CATALOG_NATIVE_EVALUATION_VERSION}"
        ),
        artifact_kind: "codesignNativeEvaluation",
        candidate_snapshot_sha256: snapshot_sha256.to_string(),
        passed,
        tier0,
        tier1,
        catalog_proof,
        nonclaims: CodesignNativeNonclaims {
            mujoco_evaluated: false,
            trained_policy_evaluated: false,
            build_ready: false,
            hardware_authority: false,
            field_evidence: false,
        },
    }
}

fn catalog_proof(doc: &str, catalog: &FileCatalog) -> CodesignCatalogProof {
    let mut resolution_complete = true;
    let mut equipped_components = Vec::new();
    match forge_contract::validate_shape(doc) {
        Ok(spec) => {
            for slot in &spec.slots {
                let Some(variant) = slot.equipped_variant() else {
                    resolution_complete = false;
                    continue;
                };
                let Some(component_ref) = &variant.component_ref else {
                    continue;
                };
                let Some(pin) = spec.lockfile.get(component_ref) else {
                    resolution_complete = false;
                    continue;
                };
                let Some((component_id, exact_revision)) = pin.rsplit_once('@') else {
                    resolution_complete = false;
                    continue;
                };
                let Some(row) = catalog.get(component_id) else {
                    resolution_complete = false;
                    continue;
                };
                if !row
                    .revisions
                    .iter()
                    .any(|revision| revision.version == exact_revision && !revision.yanked)
                {
                    resolution_complete = false;
                    continue;
                }
                let Some(row_sha256) = catalog.row_sha256(component_id) else {
                    resolution_complete = false;
                    continue;
                };
                equipped_components.push(CodesignEquippedCatalogProof {
                    slot_id: slot.id.clone(),
                    variant_id: variant.id.clone(),
                    component_ref: component_ref.clone(),
                    exact_revision: pin.clone(),
                    component_id: component_id.to_string(),
                    category: row.category.clone(),
                    row_sha256: row_sha256.to_string(),
                    mass_g: row.mass_g,
                    capacity_mah: row.elec.capacity_mah,
                    max_discharge_a: row.elec.max_discharge_a,
                    kv: row.elec.kv,
                    prop_diameter_in: row.mech.prop_diameter_in,
                    confidence: row.confidence,
                    review_required: row.confidence < 1.0 || row.review.is_some(),
                    review: row.review.clone(),
                    license: CodesignCatalogLicenseProof {
                        id: row.license.id.clone(),
                        class: row.license.class.clone(),
                        source_url: row.license.source_url.clone(),
                        export_policy: row.license.export_policy.clone(),
                    },
                });
            }
        }
        Err(_) => resolution_complete = false,
    }
    equipped_components.sort_by(|left, right| left.slot_id.cmp(&right.slot_id));
    CodesignCatalogProof {
        schema_version: format!("{CODESIGN_CATALOG_PROOF_SCHEMA}/{CODESIGN_CATALOG_PROOF_VERSION}"),
        catalog_authority_sha256: catalog.authority_sha256().to_string(),
        resolution_complete,
        equipped_components,
        // Catalog rows carry review requirements, but no explicit owner approval
        // record. Search evidence therefore never promotes marketplace authority.
        marketplace_publication_reviewed: false,
        marketplace_exposable: false,
    }
}

fn evaluate_rapier(doc: &str) -> Result<CodesignTier1Proof, String> {
    let spec = forge_contract::validate_shape(doc).map_err(|error| error.to_string())?;
    let baked = forge_geometry::bake(&spec).map_err(|error| error.to_string())?;
    let root_node = spec
        .skeleton
        .iter()
        .find(|node| node.parent.is_none())
        .map(|node| node.name.clone())
        .ok_or_else(|| "candidate has no root node".to_string())?;
    let mut world = RapierWorld::from_contract(
        &spec,
        &baked,
        RapierWorldConfig {
            dt_s: RAPIER_DT_S,
            substeps: RAPIER_SUBSTEPS,
            fixed_roots: false,
            include_ground: false,
        },
    )
    .map_err(|error| error.to_string())?;
    let start = world
        .body_pose(&root_node)
        .ok_or_else(|| format!("Rapier scene omitted root body '{root_node}'"))?;
    let mut digest = Sha256::new();
    let mut max_abs_translation_m = 0.0_f64;
    let mut max_linear_speed_mps = 0.0_f64;
    let mut end = start.clone();
    let mut finite = true;
    let mut counts = (0_usize, 0_usize, 0_usize);
    for _ in 0..RAPIER_STEPS {
        let step = world.step(RAPIER_DT_S);
        digest.update(serde_json::to_vec(&step).expect("Rapier step serializes"));
        counts = (step.body_count, step.collider_count, step.joint_count);
        for pose in &step.poses {
            for value in pose
                .translation_m
                .iter()
                .chain(pose.rotation_wxyz.iter())
                .chain(pose.linvel_mps.iter())
                .chain(pose.angvel_radps.iter())
            {
                finite &= value.is_finite();
            }
            max_abs_translation_m = pose
                .translation_m
                .iter()
                .fold(max_abs_translation_m, |current, value| {
                    current.max(value.abs())
                });
            let speed = pose
                .linvel_mps
                .iter()
                .map(|value| value * value)
                .sum::<f64>()
                .sqrt();
            max_linear_speed_mps = max_linear_speed_mps.max(speed);
        }
        if let Some(root) = step.poses.iter().find(|pose| pose.node == root_node) {
            end = root.clone();
        } else {
            finite = false;
        }
    }
    let within_bound = max_abs_translation_m <= 100.0 && max_linear_speed_mps <= 250.0;
    Ok(CodesignTier1Proof {
        engine: RAPIER_ENGINE_VERSION,
        engine_backed: true,
        passed: finite && within_bound && counts.0 > 0 && counts.1 > 0,
        dt_s: RAPIER_DT_S,
        substeps: RAPIER_SUBSTEPS,
        steps: RAPIER_STEPS,
        simulated_duration_s: RAPIER_DT_S * f64::from(RAPIER_STEPS),
        body_count: counts.0,
        collider_count: counts.1,
        joint_count: counts.2,
        root_node,
        start_root_translation_m: start.translation_m,
        end_root_translation_m: end.translation_m,
        max_abs_translation_m,
        max_linear_speed_mps,
        trajectory_sha256: format!("{:x}", digest.finalize()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admitted_candidate_produces_deterministic_native_and_rapier_proof() {
        let doc = include_str!("../../../examples/vx2-mini.forge.json");
        let snapshot_hash = format!("{:x}", Sha256::digest(doc.as_bytes()));
        let first = evaluate_candidate(doc, &snapshot_hash);
        let second = evaluate_candidate(doc, &snapshot_hash);

        assert!(first.passed, "{first:#?}");
        assert_eq!(
            first.schema_version,
            "forge-codesign-native-evaluation/1.0.0"
        );
        assert!(first.tier0.passed);
        assert_eq!(first.tier0.hud.as_ref().map(|hud| hud.auw_g), Some(479.0));
        let first_rapier = first.tier1.as_ref().expect("Rapier proof");
        let second_rapier = second.tier1.as_ref().expect("Rapier proof");
        assert!(first_rapier.passed);
        assert_eq!(
            first_rapier.trajectory_sha256,
            second_rapier.trajectory_sha256
        );
        assert_eq!(first_rapier.steps, 120);
        assert!(!first.nonclaims.mujoco_evaluated);
        assert!(!first.nonclaims.trained_policy_evaluated);
    }

    #[test]
    fn rejected_candidate_never_reaches_rapier() {
        let doc = r#"{"meta":{"id":"bad"}}"#;
        let snapshot_hash = format!("{:x}", Sha256::digest(doc.as_bytes()));
        let result = evaluate_candidate(doc, &snapshot_hash);

        assert!(!result.passed);
        assert!(!result.tier0.passed);
        assert!(result.tier1.is_none());
        assert!(result
            .tier0
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.check == "CTR-001"));
    }

    #[test]
    fn catalog_major_binds_only_the_equipped_exact_revision() {
        let catalog = FileCatalog::load(
            &std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../catalog"),
        )
        .expect("catalog loads");
        let doc = include_str!("../../../examples/vx2-proof.forge.json");
        let snapshot_hash = format!("{:x}", Sha256::digest(doc.as_bytes()));
        let first = evaluate_candidate_with_catalog(doc, &snapshot_hash, &catalog);

        assert!(first.passed, "{first:#?}");
        assert_eq!(
            first.schema_version,
            "forge-codesign-native-evaluation/2.0.0"
        );
        assert_eq!(
            first.catalog_proof.catalog_authority_sha256,
            catalog.authority_sha256()
        );
        assert!(!first.catalog_proof.marketplace_publication_reviewed);
        assert!(!first.catalog_proof.marketplace_exposable);
        let battery = first
            .catalog_proof
            .equipped_components
            .iter()
            .find(|component| component.slot_id == "battery")
            .expect("equipped battery proof");
        assert_eq!(battery.variant_id, "cnhl-4s-1500");
        assert_eq!(battery.capacity_mah, Some(1500.0));
        assert!(battery.review_required);
        assert!(first
            .catalog_proof
            .equipped_components
            .iter()
            .all(|component| { component.variant_id != "cnhl-v2-4s-1300" }));

        let mut selected_1300: serde_json::Value = serde_json::from_str(doc).expect("contract");
        selected_1300["slots"][1]["equippedVariantId"] =
            serde_json::Value::String("cnhl-v2-4s-1300".to_string());
        selected_1300["sim"]["battery"]["capacity_mAh"] = serde_json::json!(1300);
        selected_1300["sim"]["battery"]["cRating"] = serde_json::json!(130);
        let selected_1300 = serde_json::to_string(&selected_1300).expect("contract serializes");
        let selected_hash = format!("{:x}", Sha256::digest(selected_1300.as_bytes()));
        let second = evaluate_candidate_with_catalog(&selected_1300, &selected_hash, &catalog);
        let battery = second
            .catalog_proof
            .equipped_components
            .iter()
            .find(|component| component.slot_id == "battery")
            .expect("equipped battery proof");
        assert!(second.passed, "{second:#?}");
        assert_eq!(battery.variant_id, "cnhl-v2-4s-1300");
        assert_eq!(battery.capacity_mah, Some(1300.0));
        assert_eq!(second.tier0.hud.as_ref().map(|hud| hud.auw_g), Some(756.0));
        assert!(second
            .catalog_proof
            .equipped_components
            .iter()
            .all(|component| { component.variant_id != "cnhl-4s-1500" }));
    }
}
