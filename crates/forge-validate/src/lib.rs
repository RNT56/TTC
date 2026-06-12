//! forge-validate — the sovereign gatekeeper (D17: same bits everywhere).
//!
//! v0 implements the structural/contract checks plus the powertrain and
//! stability checks that the current engines support. Check IDs follow
//! docs/systems/validation-harness.md and stabilize at P2-001; v0-only
//! provisional members are marked. Diagnostics are machine-readable data — the
//! generation repair loop (P4) and co-design oracle (P9) consume them.

#![forbid(unsafe_code)]

use forge_contract::{Archetype, CatalogSource, CollisionPolicy, ModelSpec, ProvenanceKind};
use forge_geometry::BakedModel;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub const VALIDATOR_VERSION: &str = env!("CARGO_PKG_VERSION");
/// Per-model face budget (default quality tier) — provisional until P1 profiling.
pub const DEFAULT_FACE_BUDGET: usize = 50_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warn,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subject {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    pub check: String,
    pub severity: Severity,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<Subject>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub units: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<f64>,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

impl Diagnostic {
    fn error(check: &str, message: impl Into<String>) -> Self {
        Diagnostic {
            check: check.into(),
            severity: Severity::Error,
            subject: None,
            observed: None,
            limit: None,
            units: None,
            phase: None,
            message: message.into(),
            hint: None,
        }
    }
    fn warn(check: &str, message: impl Into<String>) -> Self {
        Diagnostic {
            severity: Severity::Warn,
            ..Diagnostic::error(check, message)
        }
    }
    fn subject(mut self, kind: &str, id: impl Into<String>) -> Self {
        self.subject = Some(Subject {
            kind: kind.into(),
            id: id.into(),
        });
        self
    }
    fn observed(mut self, v: f64) -> Self {
        self.observed = Some(v);
        self
    }
    fn limit(mut self, v: serde_json::Value) -> Self {
        self.limit = Some(v);
        self
    }
    fn units(mut self, u: &str) -> Self {
        self.units = Some(u.into());
        self
    }
    fn hint(mut self, h: impl Into<String>) -> Self {
        self.hint = Some(h.into());
        self
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Admitted,
    Draft,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub contract_hash: String,
    pub lockfile_hash: String,
    pub schema_version: String,
    pub validator_version: String,
    pub seed: u64,
    /// "native" | "wasm" — same bits, stated target (D17).
    pub target: String,
    pub started_at: u64,
    pub duration_ms: u64,
    pub results: Vec<Diagnostic>,
    pub verdict: Verdict,
    /// Derived HUD (assumptions inspectable) when the powertrain supports it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hud: Option<forge_sim::Hud>,
    pub counts: Counts,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub parts: usize,
    /// Polygon faces — the monolith's counting (P0-004 equivalence quantity).
    pub faces: usize,
    /// Polygon-mesh vertices (P0-004 equivalence quantity).
    pub vertices: usize,
    /// Render triangles (GEO-004 budget quantity).
    pub triangles: usize,
}

#[derive(Debug, Clone)]
pub struct Options {
    pub face_budget: usize,
    pub seed: u64,
    pub target: &'static str,
    /// Failed runs become drafts (D14 pipeline semantics) instead of rejections.
    pub as_draft: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            face_budget: DEFAULT_FACE_BUDGET,
            seed: 0,
            target: "native",
            as_draft: false,
        }
    }
}

/// An empty catalog: every componentRef is unresolved (pre-P3 reality).
pub struct EmptyCatalog;
impl CatalogSource for EmptyCatalog {
    fn has_revision(&self, _: &str, _: &str) -> bool {
        false
    }
}

/// Run the full v0 suite over a raw JSON document.
pub fn run_full(doc: &str, catalog: &dyn CatalogSource, opts: &Options) -> Report {
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let t0 = std::time::Instant::now();

    let mut results: Vec<Diagnostic> = Vec::new();
    let mut hud = None;
    let mut counts = Counts::default();
    let (contract_hash, lockfile_hash, schema_version);

    match forge_contract::validate_shape(doc) {
        Err(e) => {
            results.push(
                Diagnostic::error("CTR-001", format!("schema_invalid: {e}"))
                    .hint("document must validate against the emitted JSON Schema"),
            );
            contract_hash = String::new();
            lockfile_hash = String::new();
            schema_version = forge_contract::SCHEMA_VERSION.to_string();
        }
        Ok(spec) => {
            contract_hash = forge_contract::contract_hash(&spec);
            lockfile_hash = forge_contract::lockfile_hash(&spec);
            schema_version = forge_contract::SCHEMA_VERSION.to_string();
            let (mut diags, baked) = run_checks(&spec, catalog, opts);
            if let Some(b) = &baked {
                counts = Counts {
                    parts: b.parts.len(),
                    faces: b.total_polygons,
                    vertices: b.total_vertices,
                    triangles: b.total_faces,
                };
                match forge_sim::derive_hud(&spec, b) {
                    Ok(h) => hud = Some(h),
                    Err(e) => diags.push(
                        Diagnostic::warn("SIM-001", format!("powertrain_hud_unavailable: {e}"))
                            .hint("inline motor kv / battery / props enable SIM checks pre-P3"),
                    ),
                }
            }
            results.append(&mut diags);
        }
    }

    let has_error = results.iter().any(|d| d.severity == Severity::Error);
    let verdict = if !has_error {
        Verdict::Admitted
    } else if opts.as_draft {
        Verdict::Draft
    } else {
        Verdict::Rejected
    };

    Report {
        contract_hash,
        lockfile_hash,
        schema_version,
        validator_version: VALIDATOR_VERSION.to_string(),
        seed: opts.seed,
        target: opts.target.to_string(),
        started_at,
        duration_ms: t0.elapsed().as_millis() as u64,
        results,
        verdict,
        hud,
        counts,
    }
}

fn run_checks(
    spec: &ModelSpec,
    catalog: &dyn CatalogSource,
    opts: &Options,
) -> (Vec<Diagnostic>, Option<BakedModel>) {
    let mut d: Vec<Diagnostic> = Vec::new();

    // ---- CTR-002 port resolution (v0: node exists; capped counts as resolved)
    for port in &spec.ports {
        if spec.node(&port.node).is_none() {
            d.push(
                Diagnostic::error(
                    "CTR-002",
                    format!("port_unresolved: {}@{}", port.kind, port.id),
                )
                .subject("port", &port.id)
                .hint(format!("port references unknown node '{}'", port.node)),
            );
        } else if port.kind.trim().is_empty() && !port.capped {
            d.push(
                Diagnostic::error("CTR-002", format!("port_untyped: {}", port.id))
                    .subject("port", &port.id)
                    .hint("give the port a connector-taxonomy type or mark it capped"),
            );
        }
    }

    // ---- CTR-003 slot defaults & variant well-formedness
    for slot in &spec.slots {
        if slot.variants.is_empty() {
            d.push(
                Diagnostic::error("CTR-003", format!("slot_empty: {}", slot.id))
                    .subject("slot", &slot.id),
            );
        }
        for v in &slot.variants {
            let has_parts = v.parts.as_ref().map(|p| !p.is_empty()).unwrap_or(false);
            let has_ref = v.component_ref.is_some();
            if has_parts == has_ref {
                d.push(
                    Diagnostic::error(
                        "CTR-003",
                        format!("variant_malformed: {}/{}", slot.id, v.id),
                    )
                    .subject("variant", &v.id)
                    .hint("a variant carries exactly one of inline parts or a componentRef"),
                );
            }
        }
        for mn in &slot.mount_nodes {
            if spec.node(mn).is_none() {
                d.push(
                    Diagnostic::error("CTR-003", format!("slot_mount_unknown: {}@{}", mn, slot.id))
                        .subject("slot", &slot.id),
                );
            }
        }
    }

    // ---- CTR-005 colors parse (material presence is type-enforced)
    for (i, part) in spec.parts.iter().enumerate() {
        if !valid_hex_color(&part.color) {
            d.push(
                Diagnostic::error(
                    "CTR-005",
                    format!("color_invalid: part {i} '{}'", part.color),
                )
                .subject("part", i.to_string())
                .hint("colors are #rrggbb"),
            );
        }
    }

    // ---- CTR-006 lockfile resolution (D5)
    for u in forge_contract::resolve_lockfile(spec, catalog) {
        d.push(
            Diagnostic::error(
                "CTR-006",
                format!("lockfile_unresolved: {}", u.component_ref),
            )
            .subject("componentRef", &u.component_ref)
            .hint(u.reason),
        );
    }

    // ---- CTR-007 collider budget (D7)
    let budget = &spec.sim.colliders.budget;
    let mut per_node: BTreeMap<&str, u32> = BTreeMap::new();
    let mut total = 0u32;
    for part in &spec.parts {
        if part.collision != CollisionPolicy::None {
            *per_node.entry(part.node.as_str()).or_default() += 1;
            total += 1;
        }
    }
    for (node, count) in &per_node {
        if *count > budget.per_node {
            d.push(
                Diagnostic::error(
                    "CTR-007",
                    format!("collider_budget: node {node} {count} > {}", budget.per_node),
                )
                .subject("node", *node)
                .observed(*count as f64)
                .limit(serde_json::json!(budget.per_node)),
            );
        }
    }
    if total > budget.per_model {
        d.push(
            Diagnostic::error(
                "CTR-007",
                format!("collider_budget: {total} > {}", budget.per_model),
            )
            .observed(total as f64)
            .limit(serde_json::json!(budget.per_model))
            .hint("collapse colliders into per-node compounds (D7)"),
        );
    }

    // ---- CTR-008 (provisional v0): driver params validate against the
    // archetype's schema (P2-003)
    if let Err(e) = forge_motion::params::check_driver_params(spec) {
        d.push(
            Diagnostic::error("CTR-008", format!("driver_params: {e}"))
                .hint("archetype param schemas live in forge-motion::params"),
        );
    }

    // ---- PRV-001 provenance on generated content
    if matches!(spec.meta.provenance.kind, ProvenanceKind::LlmGeneration)
        && (spec.meta.provenance.prompt_hash.is_none()
            || spec.meta.provenance.model_version.is_none())
    {
        d.push(
            Diagnostic::error(
                "PRV-001",
                "generated content missing promptHash/modelVersion",
            )
            .subject("meta", &spec.meta.id),
        );
    }

    // ---- bake (geometry checks need buffers)
    let baked = match forge_geometry::bake(spec) {
        Ok(b) => b,
        Err(e) => {
            // GEO-007 (provisional v0 id): the bake itself failed.
            d.push(Diagnostic::error("GEO-007", format!("bake_failed: {e}")));
            return (d, None);
        }
    };

    // ---- GEO-001 NaN/Inf scan (v0: static frame; animation frames land with drivers)
    let mut nan_parts = Vec::new();
    for bp in &baked.parts {
        if bp
            .mesh
            .positions
            .iter()
            .chain(bp.mesh.normals.iter())
            .any(|v| !v.is_finite())
        {
            nan_parts.push(bp.part_index);
        }
    }
    for i in nan_parts {
        d.push(
            Diagnostic::error(
                "GEO-001",
                format!("nan_scan: part {i} has non-finite values"),
            )
            .subject("part", i.to_string()),
        );
    }

    // ---- GEO-004 face budget
    if baked.total_faces > opts.face_budget {
        d.push(
            Diagnostic::error(
                "GEO-004",
                format!("face_budget: {} > {}", baked.total_faces, opts.face_budget),
            )
            .observed(baked.total_faces as f64)
            .limit(serde_json::json!(opts.face_budget))
            .hint("reduce segment counts or part count"),
        );
    }

    // ---- GEO-005 degenerate faces
    for bp in &baked.parts {
        let degenerate = count_degenerate(&bp.mesh);
        if degenerate > 0 {
            d.push(
                Diagnostic::error(
                    "GEO-005",
                    format!("degenerate_faces: part {} has {degenerate}", bp.part_index),
                )
                .subject("part", bp.part_index.to_string())
                .observed(degenerate as f64),
            );
        }
    }

    // ---- GEO-006 mass closure (when an aggregate is declared)
    if let Some(agg) = spec.sim.aggregate_mass_g {
        let sum = forge_geometry::model_mass_g(spec, &baked);
        let rel = ((sum - agg) / agg).abs();
        if rel > 0.02 {
            d.push(
                Diagnostic::error(
                    "GEO-006",
                    format!(
                        "mass_closure: Σparts {sum:.1} g vs aggregate {agg:.1} g ({:.1} %)",
                        rel * 100.0
                    ),
                )
                .observed(rel * 100.0)
                .limit(serde_json::json!(2.0))
                .units("%"),
            );
        }
    }

    // ---- GEO-003 (v0 proxy): static-pose AABB interpenetration, warn-level.
    for (i, j) in forge_geometry::aabb_interferences(&baked, 0.0005) {
        d.push(
            Diagnostic::warn(
                "GEO-003",
                format!("aabb_overlap: parts {i} and {j} interpenetrate (static pose)"),
            )
            .subject("part", i.to_string())
            .hint("v0 AABB proxy — the BVH joint-limit sweep lands P1+ (XC-09)"),
        );
    }

    // ---- BEH-002 servo stability at dt = 50 ms (library invariant)
    {
        let mut servo = forge_motion::Servo::new(15.0, 0.85, 0.0);
        let mut bounded = true;
        for _ in 0..400 {
            let x = servo.step(1.0, 0.05);
            if !x.is_finite() || x.abs() > 10.0 {
                bounded = false;
                break;
            }
        }
        if !bounded || (servo.x - 1.0).abs() > 0.01 {
            d.push(Diagnostic::error("BEH-002", "servo_unstable at dt = 50 ms"));
        }
    }

    // ---- SIM-00x powertrain checks (multirotor with data) + BEH-001 smoke
    if matches!(spec.meta.archetype, Archetype::Multirotor) {
        match forge_sim::derive_hud(spec, &baked) {
            Err(_) => { /* surfaced as SIM warn by run_full */ }
            Ok(hud) => {
                match hud.hover_throttle {
                    None => d.push(
                        Diagnostic::error("SIM-001", "hover_trim: none below full throttle")
                            .hint("increase thrust (motors/props) or reduce mass"),
                    ),
                    Some(u) if u >= 0.75 => d.push(
                        Diagnostic::error("SIM-001", format!("hover_trim: {u:.2} ≥ 0.75"))
                            .observed(u)
                            .limit(serde_json::json!(0.75)),
                    ),
                    Some(_) => {}
                }
                if let Some(twr) = hud.twr {
                    if twr < 1.8 {
                        d.push(
                            Diagnostic::error(
                                "SIM-002",
                                format!("twr_floor: {twr:.2} < 1.8 (freestyle preset)"),
                            )
                            .observed(twr)
                            .limit(serde_json::json!(1.8)),
                        );
                    } else if twr < 2.5 {
                        d.push(
                            Diagnostic::warn(
                                "SIM-002",
                                format!("twr_low: {twr:.2} < 2.5 (freestyle preset)"),
                            )
                            .observed(twr)
                            .limit(serde_json::json!(2.5)),
                        );
                    }
                }
                // SIM-003 current budget
                let battery = spec.sim.battery.as_ref();
                let motor_max: Option<f64> = spec
                    .sim
                    .motors
                    .iter()
                    .map(|m| m.max_current_a)
                    .sum::<Option<f64>>();
                match (battery.and_then(|b| b.c_rating), motor_max, battery) {
                    (Some(c), Some(mm), Some(b)) => {
                        let max_discharge = c * b.capacity_mah / 1000.0;
                        let needed = mm * 1.2;
                        if max_discharge < needed {
                            d.push(
                                Diagnostic::error("SIM-003", format!("current_budget: {max_discharge:.0} A < Σ motors × 1.2 = {needed:.0} A"))
                                    .observed(max_discharge)
                                    .limit(serde_json::json!(needed))
                                    .units("A"),
                            );
                        }
                    }
                    _ => d.push(
                        Diagnostic::warn(
                            "SIM-003",
                            "current_budget skipped: needs battery cRating and motor maxCurrentA",
                        )
                        .hint("catalog-backed components carry these (P3)"),
                    ),
                }
            }
        }
    }

    // ---- BEH-001 archetype smoke (v0 archetype set)
    match spec.meta.archetype {
        Archetype::Multirotor => { /* hover-trim existence above is the v0 smoke */ }
        Archetype::Rover => {
            let mut rover = forge_motion::RoverDriver::new(spec);
            let input = forge_motion::InputFrame {
                drive: 1.0,
                ..Default::default()
            };
            let steps = (1.0 / forge_motion::DT / rover.max_speed_ms).ceil() as usize;
            for _ in 0..steps {
                rover.tick(&input, forge_motion::DT);
            }
            let dist = (rover.pose[0] * rover.pose[0] + rover.pose[1] * rover.pose[1]).sqrt();
            if (dist - 1.0).abs() > 0.05 {
                d.push(
                    Diagnostic::error(
                        "BEH-001",
                        format!("rover_smoke: drove {dist:.3} m, expected 1 m ± 0.05"),
                    )
                    .observed(dist)
                    .units("m"),
                );
            }
        }
        Archetype::Quadruped => {
            let mut driver = forge_motion::quadruped::QuadrupedDriver::new(spec);
            if driver.legs.len() < 4 {
                d.push(
                    Diagnostic::error(
                        "BEH-001",
                        format!(
                            "quadruped_smoke: {} legs found; need ≥ 4 via the hip_/knee_/foot_ chain convention",
                            driver.legs.len()
                        ),
                    )
                    .hint("name leg chains hip_<id> → knee_<id> → foot_<id>"),
                );
            } else {
                let input = forge_motion::InputFrame {
                    drive: 1.0,
                    ..Default::default()
                };
                let v = driver.params.stride_m * driver.params.cadence_hz;
                let steps = (1.0 / v.max(1e-6) / forge_motion::DT).ceil() as usize;
                let mut finite = true;
                for _ in 0..steps.min(100_000) {
                    let out = driver.tick(&input, forge_motion::DT);
                    if out
                        .joint_targets
                        .iter()
                        .any(|(_, angle)| !angle.is_finite())
                    {
                        finite = false;
                        break;
                    }
                }
                let dist = (out_pose(&driver)[0].powi(2) + out_pose(&driver)[1].powi(2)).sqrt();
                if !finite {
                    d.push(Diagnostic::error(
                        "BEH-001",
                        "quadruped_smoke: non-finite joint target during 1 m walk",
                    ));
                } else if (dist - 1.0).abs() > 0.05 {
                    d.push(
                        Diagnostic::error(
                            "BEH-001",
                            format!("quadruped_smoke: walked {dist:.3} m, expected 1 m ± 0.05"),
                        )
                        .observed(dist)
                        .units("m"),
                    );
                }
            }
        }
        _ => d.push(
            Diagnostic::warn(
                "BEH-001",
                format!(
                    "archetype_smoke skipped: {:?} driver lands P2",
                    spec.meta.archetype
                ),
            )
            .hint("biped/arm drivers arrive with the P2+ driver library"),
        ),
    }

    // ---- CTR-004 explode coverage (≥ 80 % of base parts)
    if spec.parts.len() >= 4 {
        let covered = spec.parts.iter().filter(|p| p.explode.is_some()).count();
        let coverage = covered as f64 / spec.parts.len() as f64;
        if coverage < 0.8 {
            d.push(
                Diagnostic::error(
                    "CTR-004",
                    format!("explode_coverage: {:.0} % < 80 %", coverage * 100.0),
                )
                .observed(coverage * 100.0)
                .limit(serde_json::json!(80.0))
                .units("%")
                .hint("add explode windows to parts (leader-flag rule lands with slots/equip)"),
            );
        }
    }

    (d, Some(baked))
}

// ---------------------------------------------------------------------------
// BOM v0 (P3-009): parts list with masses; catalog-backed slots resolve to
// SKUs/prices/links once the catalog lands (P3).
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BomRow {
    pub item: String,
    pub node: String,
    pub material: String,
    pub mass_g: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component_ref: Option<String>,
    pub source: String,
}

pub fn bom_rows(spec: &ModelSpec, baked: &BakedModel) -> Vec<BomRow> {
    let mut rows: Vec<BomRow> = baked
        .parts
        .iter()
        .map(|bp| {
            let part = &spec.parts[bp.part_index];
            BomRow {
                item: part
                    .comp
                    .clone()
                    .unwrap_or_else(|| format!("part-{}", bp.part_index)),
                node: part.node.clone(),
                material: format!("{:?}", part.material).to_lowercase(),
                mass_g: forge_geometry::part_mass_g(&part.mass, part.material, &bp.mesh),
                component_ref: None,
                source: "inline".to_string(),
            }
        })
        .collect();
    for slot in &spec.slots {
        for v in &slot.variants {
            if let Some(r) = &v.component_ref {
                rows.push(BomRow {
                    item: format!("{}/{}", slot.id, v.id),
                    node: slot.mount_nodes.first().cloned().unwrap_or_default(),
                    material: String::new(),
                    mass_g: 0.0,
                    component_ref: Some(r.clone()),
                    source: "catalog (resolves at P3)".to_string(),
                });
            }
        }
    }
    rows
}

pub fn bom_csv(rows: &[BomRow]) -> String {
    let mut out = String::from("item,node,material,mass_g,componentRef,source\n");
    for r in rows {
        out.push_str(&format!(
            "{},{},{},{:.1},{},{}\n",
            r.item,
            r.node,
            r.material,
            r.mass_g,
            r.component_ref.as_deref().unwrap_or(""),
            r.source
        ));
    }
    out
}

fn out_pose(driver: &forge_motion::quadruped::QuadrupedDriver) -> [f64; 3] {
    // the driver's last outputs carry the body pose; a zero-dt tick re-reads it
    // without advancing the gait
    let mut probe = driver.clone();
    probe.tick(&forge_motion::InputFrame::default(), 0.0).body
}

fn valid_hex_color(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|ch| ch.is_ascii_hexdigit())
}

fn count_degenerate(mesh: &forge_geometry::MeshBuffers) -> usize {
    let p = |i: u32| {
        let i = i as usize * 3;
        [
            mesh.positions[i] as f64,
            mesh.positions[i + 1] as f64,
            mesh.positions[i + 2] as f64,
        ]
    };
    mesh.indices
        .chunks_exact(3)
        .filter(|t| {
            let (a, b, c) = (p(t[0]), p(t[1]), p(t[2]));
            let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            let ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            let cr = [
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0],
            ];
            (cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2]).sqrt() * 0.5 < 1e-12
        })
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    const GOOD: &str = include_str!("../../../examples/vx2-mini.forge.json");

    #[test]
    fn demo_contract_is_admitted() {
        let report = run_full(GOOD, &EmptyCatalog, &Options::default());
        let errors: Vec<_> = report
            .results
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .collect();
        assert!(errors.is_empty(), "unexpected errors: {errors:#?}");
        assert_eq!(report.verdict, Verdict::Admitted);
        assert!(report.hud.is_some(), "multirotor demo derives a HUD");
        assert!(report.counts.faces > 0);
    }

    #[test]
    fn schema_invalid_is_ctr_001() {
        let report = run_full("{\"nope\": true}", &EmptyCatalog, &Options::default());
        assert_eq!(report.verdict, Verdict::Rejected);
        assert!(report.results.iter().any(|d| d.check == "CTR-001"));
    }

    #[test]
    fn unresolved_component_ref_is_ctr_006() {
        let mut spec = forge_contract::validate_shape(GOOD).unwrap();
        spec.slots.push(forge_contract::Slot {
            id: "battery".into(),
            label: "POWER".into(),
            mount_nodes: vec!["root".into()],
            joint: None,
            variants: vec![forge_contract::Variant {
                id: "b1".into(),
                name: None,
                desc: None,
                parts: None,
                component_ref: Some("cmp_pack_4s1500@^2".into()),
                ports: Default::default(),
            }],
        });
        let doc = serde_json::to_string(&spec).unwrap();
        let report = run_full(&doc, &EmptyCatalog, &Options::default());
        assert!(report.results.iter().any(|d| d.check == "CTR-006"));
        assert_eq!(report.verdict, Verdict::Rejected);
    }

    #[test]
    fn draft_semantics_d14() {
        let report = run_full(
            "{\"nope\": true}",
            &EmptyCatalog,
            &Options {
                as_draft: true,
                ..Default::default()
            },
        );
        assert_eq!(report.verdict, Verdict::Draft);
    }

    #[test]
    fn collider_budget_d7() {
        let mut spec = forge_contract::validate_shape(GOOD).unwrap();
        // overflow one node with colliding parts
        for _ in 0..10 {
            spec.parts.push(forge_contract::Part {
                node: "root".into(),
                geom: forge_contract::Geom::Box {
                    w: 0.01,
                    h: 0.01,
                    d: 0.01,
                },
                pose: None,
                material: forge_contract::MaterialClass::Matte,
                color: "#111111".into(),
                explode: None,
                render_bias: None,
                comp: None,
                mass: None,
                collision: forge_contract::CollisionPolicy::Hull,
            });
        }
        let doc = serde_json::to_string(&spec).unwrap();
        let report = run_full(&doc, &EmptyCatalog, &Options::default());
        assert!(report
            .results
            .iter()
            .any(|d| d.check == "CTR-007" && d.severity == Severity::Error));
    }

    #[test]
    fn bom_lists_every_part_with_mass() {
        let spec = forge_contract::validate_shape(GOOD).unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let rows = bom_rows(&spec, &baked);
        assert_eq!(rows.len(), 16);
        let total: f64 = rows.iter().map(|r| r.mass_g).sum();
        assert!((total - 479.0).abs() < 1e-6, "Σ {total}");
        let csv = bom_csv(&rows);
        assert_eq!(csv.lines().count(), 17, "header + 16 rows");
    }

    #[test]
    fn provenance_required_for_generated() {
        let mut spec = forge_contract::validate_shape(GOOD).unwrap();
        spec.meta.provenance.kind = ProvenanceKind::LlmGeneration;
        let doc = serde_json::to_string(&spec).unwrap();
        let report = run_full(&doc, &EmptyCatalog, &Options::default());
        assert!(report.results.iter().any(|d| d.check == "PRV-001"));
    }
}
