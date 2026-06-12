//! File-backed catalog (P3-007a): JSON rows under `catalog/components/`,
//! giving the CLI a real `CatalogSource`/`RevisionSource` before Postgres
//! lands (P3-001 runs the same rows through migrations). Native-only — the
//! browser resolves through the gateway.
//!
//! Row provenance is part of the row: per-field citations, a confidence
//! score, and a review note. Rows transcribed without a directly fetched
//! datasheet carry `confidence < 1` and a review requirement — the P3-004
//! human-review-queue semantics, enforced at LOAD time: a sub-confidence
//! row without a review note, or a row without citations, refuses to load.

use crate::compat::{Category, ComponentRecord, ElecSpec, MechSpec};
use forge_contract::semver::Version;
use forge_contract::{CatalogSource, Revision, RevisionSource};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogRow {
    pub id: String,
    pub brand: String,
    pub model: String,
    pub category: String,
    pub mass_g: f64,
    #[serde(default)]
    pub dims: BTreeMap<String, f64>,
    #[serde(default)]
    pub elec: RowElec,
    #[serde(default)]
    pub mech: RowMech,
    /// Datasheet-stated maximum thrust, grams (with the cited prop/voltage).
    #[serde(default)]
    pub max_thrust_g: Option<f64>,
    /// License class for the ROW + any geometry it carries (D10, non-optional).
    pub license_class: String,
    pub source: String,
    /// Extraction confidence ∈ (0, 1]; < 1 keeps the row in review.
    pub confidence: f64,
    #[serde(default)]
    pub review: Option<String>,
    /// Per-field citations: field → {value as printed, source URLs, accessed}.
    pub citations: BTreeMap<String, Citation>,
    pub revisions: Vec<RowRevision>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowElec {
    pub v_min: Option<f64>,
    pub v_max: Option<f64>,
    pub max_current_a: Option<f64>,
    pub max_discharge_a: Option<f64>,
    pub kv: Option<f64>,
    pub capacity_mah: Option<f64>,
    #[serde(default)]
    pub connectors: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowMech {
    pub mount_pattern: Option<String>,
    pub prop_shaft: Option<String>,
    pub prop_diameter_in: Option<f64>,
    pub motor_spacing_mm: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    pub value: String,
    pub sources: Vec<String>,
    pub accessed: String,
    #[serde(default)]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowRevision {
    pub version: String,
    #[serde(default)]
    pub yanked: bool,
}

#[derive(Debug)]
pub struct FileCatalog {
    rows: BTreeMap<String, CatalogRow>,
}

impl FileCatalog {
    /// Load every `*.json` under `<dir>/components`. Rows must parse fully —
    /// a malformed catalog is an error, not a silent skip.
    pub fn load(dir: &Path) -> Result<FileCatalog, String> {
        let components = dir.join("components");
        let mut rows = BTreeMap::new();
        let entries =
            std::fs::read_dir(&components).map_err(|e| format!("{}: {e}", components.display()))?;
        for entry in entries {
            let path = entry.map_err(|e| e.to_string())?.path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let text =
                std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            let row: CatalogRow =
                serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))?;
            if !(row.confidence > 0.0 && row.confidence <= 1.0) {
                return Err(format!("{}: confidence must be in (0, 1]", row.id));
            }
            if row.confidence < 1.0 && row.review.is_none() {
                return Err(format!(
                    "{}: confidence < 1 requires a review note (P3-004 queue semantics)",
                    row.id
                ));
            }
            if row.citations.is_empty() {
                return Err(format!("{}: rows must cite their sources (D10)", row.id));
            }
            if row.revisions.is_empty() {
                return Err(format!("{}: at least one revision required", row.id));
            }
            for rev in &row.revisions {
                if Version::parse(&rev.version).is_none() {
                    return Err(format!(
                        "{}: revision '{}' is not x.y.z",
                        row.id, rev.version
                    ));
                }
            }
            rows.insert(row.id.clone(), row);
        }
        Ok(FileCatalog { rows })
    }

    pub fn rows(&self) -> impl Iterator<Item = &CatalogRow> {
        self.rows.values()
    }

    pub fn get(&self, id: &str) -> Option<&CatalogRow> {
        self.rows.get(id)
    }

    /// The compat engine's view of a row.
    pub fn record(&self, id: &str) -> Option<ComponentRecord> {
        let row = self.rows.get(id)?;
        Some(ComponentRecord {
            id: row.id.clone(),
            category: match row.category.as_str() {
                "motor" => Category::Motor,
                "esc" => Category::Esc,
                "fc" => Category::Fc,
                "battery" => Category::Battery,
                "prop" => Category::Prop,
                "frame" => Category::Frame,
                _ => Category::Other,
            },
            mass_g: row.mass_g,
            elec: ElecSpec {
                v_min: row.elec.v_min,
                v_max: row.elec.v_max,
                max_current_a: row.elec.max_current_a,
                max_discharge_a: row.elec.max_discharge_a,
                connectors: row.elec.connectors.clone(),
            },
            mech: MechSpec {
                mount_pattern: row.mech.mount_pattern.clone(),
                prop_diameter_in: row.mech.prop_diameter_in,
                motor_spacing_mm: row.mech.motor_spacing_mm,
            },
        })
    }
}

impl CatalogSource for FileCatalog {
    fn has_revision(&self, component_id: &str, revision: &str) -> bool {
        self.rows
            .get(component_id)
            .map(|r| r.revisions.iter().any(|v| v.version == revision))
            .unwrap_or(false)
    }

    fn row_summary(&self, component_id: &str) -> Option<forge_contract::RowSummary> {
        let row = self.rows.get(component_id)?;
        Some(forge_contract::RowSummary {
            category: row.category.clone(),
            mass_g: row.mass_g,
            kv: row.elec.kv,
            capacity_mah: row.elec.capacity_mah,
            max_thrust_g: row.max_thrust_g,
        })
    }
}

impl RevisionSource for FileCatalog {
    fn revisions(&self, component_id: &str) -> Vec<Revision> {
        self.rows
            .get(component_id)
            .map(|r| {
                r.revisions
                    .iter()
                    .filter_map(|v| {
                        Version::parse(&v.version).map(|version| Revision {
                            version,
                            yanked: v.yanked,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
}
