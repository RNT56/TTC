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
use forge_contract::{
    CatalogCitation, CatalogComponent, CatalogElec, CatalogLicense, CatalogMech, CatalogPrice,
    CatalogSource, CatalogThrustPoint, CatalogThrustTable, Revision, RevisionSource,
};
use forge_sim::thrust_table::{ThrustPoint, ThrustTable};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

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
    /// License ledger entry for the ROW + any geometry it carries (D10).
    pub license: RowLicense,
    pub source: String,
    /// Extraction confidence ∈ (0, 1]; < 1 keeps the row in review.
    pub confidence: f64,
    #[serde(default)]
    pub review: Option<String>,
    /// Per-field citations: field → {value as printed, source URLs, accessed}.
    pub citations: BTreeMap<String, Citation>,
    pub prices: Vec<RowPrice>,
    #[serde(default)]
    pub thrust_tables: Vec<RowThrustTable>,
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
    pub pitch_in: Option<f64>,
    pub blades: Option<u32>,
    pub motor_spacing_mm: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowLicense {
    pub id: String,
    pub class: String,
    pub terms: String,
    pub source_url: String,
    pub export_policy: String,
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
pub struct RowPrice {
    pub vendor: String,
    pub sku: String,
    pub url: String,
    pub amount: f64,
    pub currency: String,
    pub fetched_at: String,
    pub region: String,
    pub purchasable: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowThrustTable {
    pub id: String,
    pub prop: String,
    pub voltage: f64,
    pub confidence: f64,
    pub source_url: String,
    pub points: Vec<RowThrustPoint>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowThrustPoint {
    pub throttle: f64,
    pub thrust_g: f64,
    pub current_a: f64,
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
    row_sha256: BTreeMap<String, String>,
    authority_sha256: String,
}

impl FileCatalog {
    /// Load every `*.json` under `<dir>/components`. Rows must parse fully —
    /// a malformed catalog is an error, not a silent skip.
    pub fn load(dir: &Path) -> Result<FileCatalog, String> {
        let components = dir.join("components");
        let mut rows = BTreeMap::new();
        let entries =
            std::fs::read_dir(&components).map_err(|e| format!("{}: {e}", components.display()))?;
        let mut paths: Vec<PathBuf> = entries
            .map(|entry| {
                entry
                    .map(|entry| entry.path())
                    .map_err(|error| error.to_string())
            })
            .collect::<Result<_, _>>()?;
        paths.retain(|path| {
            path.extension().and_then(|extension| extension.to_str()) == Some("json")
        });
        paths.sort();

        let mut row_sha256 = BTreeMap::new();
        let mut authority = Sha256::new();
        authority.update(b"forge-file-catalog-authority-v1\0");
        for path in paths {
            let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
            let text = std::str::from_utf8(&bytes)
                .map_err(|e| format!("{}: catalog rows must be UTF-8: {e}", path.display()))?;
            let row: CatalogRow =
                serde_json::from_str(text).map_err(|e| format!("{}: {e}", path.display()))?;
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
            validate_license(&row)?;
            validate_prices(&row)?;
            validate_citations(&row)?;
            validate_thrust_tables(&row)?;
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
            let filename = path
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or_else(|| format!("{}: catalog filename must be UTF-8", path.display()))?;
            let relative_path = format!("components/{filename}");
            let digest = format!("{:x}", Sha256::digest(&bytes));
            authority.update(relative_path.as_bytes());
            authority.update(b"\0");
            authority.update(digest.as_bytes());
            authority.update(b"\n");
            row_sha256.insert(row.id.clone(), digest);
            if rows.insert(row.id.clone(), row).is_some() {
                return Err(format!(
                    "{}: duplicate catalog component id",
                    path.display()
                ));
            }
        }
        Ok(FileCatalog {
            rows,
            row_sha256,
            authority_sha256: format!("{:x}", authority.finalize()),
        })
    }

    pub fn rows(&self) -> impl Iterator<Item = &CatalogRow> {
        self.rows.values()
    }

    pub fn get(&self, id: &str) -> Option<&CatalogRow> {
        self.rows.get(id)
    }

    /// Deterministic authority over every sorted component filename and raw-row
    /// SHA-256. This binds a co-design run to the exact repository catalog bytes.
    pub fn authority_sha256(&self) -> &str {
        &self.authority_sha256
    }

    pub fn row_sha256(&self, id: &str) -> Option<&str> {
        self.row_sha256.get(id).map(String::as_str)
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
        self.component(component_id)
            .map(|row| forge_contract::RowSummary {
                category: row.category,
                mass_g: row.mass_g,
                kv: row.elec.kv,
                capacity_mah: row.elec.capacity_mah,
                max_thrust_g: row.max_thrust_g,
                v_min: row.elec.v_min,
                v_max: row.elec.v_max,
                max_current_a: row.elec.max_current_a,
                max_discharge_a: row.elec.max_discharge_a,
                connectors: row.elec.connectors,
            })
    }

    fn component(&self, component_id: &str) -> Option<CatalogComponent> {
        self.rows.get(component_id).map(row_to_component)
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

fn validate_license(row: &CatalogRow) -> Result<(), String> {
    if row.license.id.trim().is_empty()
        || row.license.class.trim().is_empty()
        || row.license.terms.trim().is_empty()
        || row.license.source_url.trim().is_empty()
        || row.license.export_policy.trim().is_empty()
    {
        return Err(format!(
            "{}: license ledger entry requires id/class/terms/sourceUrl/exportPolicy",
            row.id
        ));
    }
    match row.license.class.as_str() {
        "open" | "attribution" | "no-redistribution" | "view-only" => Ok(()),
        other => Err(format!("{}: unknown license class '{other}'", row.id)),
    }
}

fn validate_prices(row: &CatalogRow) -> Result<(), String> {
    if row.prices.is_empty() {
        return Err(format!("{}: at least one price/SKU row required", row.id));
    }
    let purchasable = row.prices.iter().any(|p| p.purchasable);
    if !purchasable {
        return Err(format!(
            "{}: at least one price row must be purchasable for P3 BOM export",
            row.id
        ));
    }
    for p in &row.prices {
        if p.vendor.trim().is_empty()
            || p.sku.trim().is_empty()
            || p.url.trim().is_empty()
            || p.currency.trim().is_empty()
            || p.fetched_at.trim().is_empty()
            || p.region.trim().is_empty()
            || p.amount.is_nan()
            || p.amount < 0.0
        {
            return Err(format!("{}: malformed price row for {}", row.id, p.vendor));
        }
    }
    Ok(())
}

fn validate_citations(row: &CatalogRow) -> Result<(), String> {
    let mut required = vec!["massG", "license", "prices"];
    match row.category.as_str() {
        "motor" => required.extend([
            "elec.kv",
            "elec.vMin",
            "elec.vMax",
            "elec.maxCurrentA",
            "mech.mountPattern",
            "mech.propShaft",
        ]),
        "battery" => required.extend([
            "dims",
            "elec.vMin",
            "elec.vMax",
            "elec.maxDischargeA",
            "elec.connectors",
            "elec.capacityMah",
        ]),
        "prop" => required.extend(["mech.propDiameterIn", "mech.pitchIn", "mech.blades"]),
        "frame" => required.extend(["dims", "mech.mountPattern", "mech.motorSpacingMm"]),
        "esc" => required.extend([
            "dims",
            "elec.vMin",
            "elec.vMax",
            "elec.maxCurrentA",
            "mech.mountPattern",
        ]),
        "fc" => required.extend(["dims", "elec.vMin", "elec.vMax", "mech.mountPattern"]),
        "rover" => required.extend(["dims"]),
        _ => {}
    }
    for field in required {
        let Some(cite) = row.citations.get(field) else {
            return Err(format!("{}: missing citation for {field}", row.id));
        };
        if cite.value.trim().is_empty()
            || cite.sources.is_empty()
            || cite.accessed.trim().is_empty()
        {
            return Err(format!("{}: malformed citation for {field}", row.id));
        }
    }
    Ok(())
}

fn validate_thrust_tables(row: &CatalogRow) -> Result<(), String> {
    for table in &row.thrust_tables {
        if table.id.trim().is_empty()
            || table.prop.trim().is_empty()
            || table.source_url.trim().is_empty()
            || !(table.confidence > 0.0 && table.confidence <= 1.0)
            || table.points.is_empty()
        {
            return Err(format!("{}: malformed thrust table {}", row.id, table.id));
        }
        let pts: Vec<ThrustPoint> = table
            .points
            .iter()
            .map(|p| ThrustPoint {
                voltage: table.voltage,
                throttle: p.throttle,
                thrust_n: p.thrust_g * 9.80665 / 1000.0,
                current_a: p.current_a,
            })
            .collect();
        ThrustTable::from_points(&pts)
            .map_err(|e| format!("{}: thrust table {}: {e}", row.id, table.id))?;
    }
    Ok(())
}

fn row_to_component(row: &CatalogRow) -> CatalogComponent {
    CatalogComponent {
        id: row.id.clone(),
        brand: row.brand.clone(),
        model: row.model.clone(),
        category: row.category.clone(),
        mass_g: row.mass_g,
        dims: row.dims.clone(),
        elec: CatalogElec {
            v_min: row.elec.v_min,
            v_max: row.elec.v_max,
            max_current_a: row.elec.max_current_a,
            max_discharge_a: row.elec.max_discharge_a,
            kv: row.elec.kv,
            capacity_mah: row.elec.capacity_mah,
            connectors: row.elec.connectors.clone(),
        },
        mech: CatalogMech {
            mount_pattern: row.mech.mount_pattern.clone(),
            prop_shaft: row.mech.prop_shaft.clone(),
            prop_diameter_in: row.mech.prop_diameter_in,
            pitch_in: row.mech.pitch_in,
            blades: row.mech.blades,
            motor_spacing_mm: row.mech.motor_spacing_mm,
        },
        max_thrust_g: row.max_thrust_g,
        license: CatalogLicense {
            id: row.license.id.clone(),
            class: row.license.class.clone(),
            terms: row.license.terms.clone(),
            source_url: row.license.source_url.clone(),
            export_policy: row.license.export_policy.clone(),
        },
        source: row.source.clone(),
        confidence: row.confidence,
        review: row.review.clone(),
        citations: row
            .citations
            .iter()
            .map(|(field, citation)| {
                (
                    field.clone(),
                    CatalogCitation {
                        value: citation.value.clone(),
                        sources: citation.sources.clone(),
                        accessed: citation.accessed.clone(),
                        note: citation.note.clone(),
                    },
                )
            })
            .collect(),
        prices: row
            .prices
            .iter()
            .map(|p| CatalogPrice {
                vendor: p.vendor.clone(),
                sku: p.sku.clone(),
                url: p.url.clone(),
                amount: p.amount,
                currency: p.currency.clone(),
                fetched_at: p.fetched_at.clone(),
                region: p.region.clone(),
                purchasable: p.purchasable,
            })
            .collect(),
        thrust_tables: row
            .thrust_tables
            .iter()
            .map(|t| CatalogThrustTable {
                id: t.id.clone(),
                prop: t.prop.clone(),
                voltage: t.voltage,
                confidence: t.confidence,
                source_url: t.source_url.clone(),
                points: t
                    .points
                    .iter()
                    .map(|p| CatalogThrustPoint {
                        voltage: t.voltage,
                        throttle: p.throttle,
                        thrust_n: p.thrust_g * 9.80665 / 1000.0,
                        current_a: p.current_a,
                    })
                    .collect(),
            })
            .collect(),
    }
}
