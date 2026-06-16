//! forge-validate — the sovereign gatekeeper (D17: same bits everywhere).
//!
//! v0 implements the structural/contract checks plus the powertrain and
//! stability checks that the current engines support. Check IDs follow
//! docs/systems/validation-harness.md and stabilize at P2-001; v0-only
//! provisional members are marked. Diagnostics are machine-readable data — the
//! generation repair loop (P4) and co-design oracle (P9) consume them.

#![forbid(unsafe_code)]

use forge_contract::{
    Archetype, CatalogSource, CollisionPolicy, MaterialClass, ModelSpec, ProvenanceKind,
};
use forge_geometry::BakedModel;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
// ---------------------------------------------------------------------------
// report clock — provenance metadata only; judgment NEVER depends on it (D17).
// std::time::{SystemTime, Instant} trap (`unreachable`) on
// wasm32-unknown-unknown, so the facade target reads the host clock through
// js-sys — the same glue the facade already requires.
// ---------------------------------------------------------------------------

pub mod compat;
#[cfg(not(target_arch = "wasm32"))]
pub mod file_catalog;

#[cfg(not(target_arch = "wasm32"))]
mod clock {
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    pub fn now_unix_s() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    }

    pub struct Stopwatch(Instant);
    impl Stopwatch {
        pub fn start() -> Self {
            Stopwatch(Instant::now())
        }
        pub fn elapsed_ms(&self) -> u64 {
            self.0.elapsed().as_millis() as u64
        }
    }
}

#[cfg(target_arch = "wasm32")]
mod clock {
    pub fn now_unix_s() -> u64 {
        (js_sys::Date::now() / 1000.0) as u64
    }

    pub struct Stopwatch(f64);
    impl Stopwatch {
        pub fn start() -> Self {
            Stopwatch(js_sys::Date::now())
        }
        pub fn elapsed_ms(&self) -> u64 {
            (js_sys::Date::now() - self.0).max(0.0) as u64
        }
    }
}

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
    fn phase(mut self, t: f64) -> Self {
        self.phase = Some(t);
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
    let started_at = clock::now_unix_s();
    let t0 = clock::Stopwatch::start();

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
                match forge_sim::derive_hud_with_catalog(&spec, b, catalog) {
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
        duration_ms: t0.elapsed_ms(),
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

    // ---- SIM-004 (provisional): inline sim vs equipped catalog rows —
    // when a slot pins to a row, the contract's inline sim numbers must
    // agree with the datasheet (>5 % drift warns; reconciliation is the
    // configurator equip flow's job, never a silent override).
    for slot in &spec.slots {
        for v in &slot.variants {
            let Some(component_ref) = &v.component_ref else {
                continue;
            };
            let Some(pin) = spec.lockfile.get(component_ref) else {
                continue;
            };
            let Some((id, _)) = pin.rsplit_once('@') else {
                continue;
            };
            let Some(row) = catalog.row_summary(id) else {
                continue;
            };
            let drift = |a: f64, b: f64| (a - b).abs() / b.max(1e-9);
            match row.category.as_str() {
                "motor" => {
                    if let Some(row_kv) = row.kv {
                        let mut seen_kv: Vec<f64> = Vec::new();
                        for m in &spec.sim.motors {
                            if let Some(kv) = m.kv {
                                if seen_kv.contains(&kv) {
                                    continue;
                                }
                                seen_kv.push(kv);
                                if drift(kv, row_kv) > 0.05 {
                                    d.push(
                                        Diagnostic::warn(
                                            "SIM-004",
                                            format!(
                                                "catalog_drift: inline motor kv {kv:.0} vs equipped '{id}' datasheet {row_kv:.0}",
                                            ),
                                        )
                                        .subject("slot", &slot.id)
                                        .observed(kv)
                                        .limit(serde_json::Value::from(row_kv))
                                        .hint("reconcile via the equip flow — inline sim must match the equipped component"),
                                    );
                                }
                            }
                        }
                    }
                }
                "battery" => {
                    if let (Some(row_cap), Some(batt)) =
                        (row.capacity_mah, spec.sim.battery.as_ref())
                    {
                        let cap = batt.capacity_mah;
                        if drift(cap, row_cap) > 0.05 {
                            d.push(
                                Diagnostic::warn(
                                    "SIM-004",
                                    format!(
                                        "catalog_drift: inline battery {cap:.0} mAh vs equipped '{id}' datasheet {row_cap:.0} mAh",
                                    ),
                                )
                                .subject("slot", &slot.id)
                                .observed(cap)
                                .limit(serde_json::Value::from(row_cap))
                                .hint("reconcile via the equip flow — inline sim must match the equipped component"),
                            );
                        }
                    }
                }
                _ => {}
            }
        }
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

    // ---- MFG-001..004 (XC-18): DfM checks for printable structural parts.
    d.extend(run_dfm_checks(spec, &baked));

    // ---- GEO-003 (XC-09): AABB candidacy → BVH tri-tri CONFIRMATION.
    // Confirmed mesh intersections warn (deliberate interpenetration is the
    // prototype's design language); AABB-only candidates stay silent now
    // that real geometry answers. Animation-frame sweep: GEO-008 below.
    let mut static_pairs: std::collections::BTreeSet<(usize, usize)> =
        std::collections::BTreeSet::new();
    {
        let candidates = forge_geometry::aabb_interferences(&baked, 0.0005);
        let mut bvhs: BTreeMap<usize, forge_geometry::collide::PartBvh> = BTreeMap::new();
        for (i, j) in candidates {
            for k in [i, j] {
                bvhs.entry(k).or_insert_with(|| {
                    let p = &baked.parts[k];
                    let world = baked.node_world.get(&p.node).copied().unwrap_or_else(|| {
                        let mut m = [0.0; 16];
                        m[0] = 1.0;
                        m[5] = 1.0;
                        m[10] = 1.0;
                        m[15] = 1.0;
                        m
                    });
                    forge_geometry::collide::PartBvh::build(&p.mesh, &world)
                });
            }
            if bvhs[&i].intersects(&bvhs[&j]) {
                static_pairs.insert((i, j));
                d.push(
                    Diagnostic::warn(
                        "GEO-003",
                        format!("mesh_intersect: parts {i} and {j} interpenetrate (static pose, BVH-confirmed)"),
                    )
                    .subject("part", i.to_string())
                    .hint("deliberate overlap is the design language; confirmed by triangle intersection (XC-09)"),
                );
            }
        }
    }

    // ---- GEO-008 (provisional, XC-09): sampled animation-frame sweep —
    // tick the real driver, pose the skeleton, and report pairs that begin
    // to interpenetrate IN MOTION (static pairs are already recorded above).
    {
        use forge_motion::{StickInput, DT};
        type PoseMap = BTreeMap<String, ([f64; 3], [f64; 3])>;
        let mut frames: Vec<(f64, PoseMap)> = Vec::new();
        let collect = |poses: &forge_motion::PoseBuffer| {
            poses
                .names()
                .iter()
                .cloned()
                .zip(poses.poses().iter().map(|p| (p.rot, p.off)))
                .collect::<PoseMap>()
        };
        match spec.meta.archetype {
            Archetype::Biped => {
                let mut drv = forge_motion::biped::BipedDriver::new(spec);
                let input = StickInput {
                    mz: 1.0,
                    ..Default::default()
                };
                for step in 0..240u32 {
                    let t = (step + 1) as f64 * DT;
                    drv.tick(&input, [0.0, 0.0, 1.0], DT, t);
                    if (step + 1) % 30 == 0 {
                        frames.push((t, collect(&drv.poses)));
                    }
                }
            }
            Archetype::Multirotor => {
                let mut drv = forge_motion::fpv::FpvDriver::new(spec);
                let input = StickInput {
                    mz: 0.5,
                    thr: 0.3,
                    ..Default::default()
                };
                for step in 0..240u32 {
                    let t = (step + 1) as f64 * DT;
                    drv.tick(&input, DT, t);
                    if (step + 1) % 30 == 0 {
                        frames.push((t, collect(&drv.poses)));
                    }
                }
            }
            _ => {}
        }
        if !frames.is_empty() {
            let locals: Vec<([f64; 3], [f64; 3])> = baked
                .parts
                .iter()
                .map(|p| forge_geometry::collide::mesh_local_aabb(&p.mesh))
                .collect();
            let mut seen = static_pairs.clone();
            let mut hits: Vec<(usize, usize, f64)> = Vec::new();
            for (t, poses) in &frames {
                let Ok(world) = forge_geometry::node_world_posed(spec, poses) else {
                    continue;
                };
                let mats: Vec<forge_geometry::Mat4> = baked
                    .parts
                    .iter()
                    .map(|p| {
                        world
                            .get(&p.node)
                            .copied()
                            .unwrap_or_else(forge_geometry::identity)
                    })
                    .collect();
                let boxes: Vec<([f64; 3], [f64; 3])> = (0..baked.parts.len())
                    .map(|i| forge_geometry::collide::transformed_aabb(locals[i], &mats[i]))
                    .collect();
                let mut bvhs: BTreeMap<usize, forge_geometry::collide::PartBvh> = BTreeMap::new();
                for i in 0..baked.parts.len() {
                    for j in (i + 1)..baked.parts.len() {
                        if baked.parts[i].node == baked.parts[j].node
                            || seen.contains(&(i, j))
                            || !forge_geometry::collide::aabbs_overlap(boxes[i], boxes[j], 0.0005)
                        {
                            continue;
                        }
                        for k in [i, j] {
                            bvhs.entry(k).or_insert_with(|| {
                                forge_geometry::collide::PartBvh::build(
                                    &baked.parts[k].mesh,
                                    &mats[k],
                                )
                            });
                        }
                        if bvhs[&i].intersects(&bvhs[&j]) {
                            seen.insert((i, j));
                            hits.push((i, j, *t));
                        }
                    }
                }
            }
            for (i, j, t) in hits.iter().take(8) {
                d.push(
                    Diagnostic::warn(
                        "GEO-008",
                        format!("anim_intersect: parts {i} and {j} first interpenetrate at t = {t:.2} s (sampled drive sweep)"),
                    )
                    .subject("part", i.to_string())
                    .phase(*t)
                    .hint("not present at rest — check joint travel / gait extremes"),
                );
            }
            if hits.len() > 8 {
                d.push(Diagnostic::warn(
                    "GEO-008",
                    format!(
                        "anim_intersect: +{} more moving pairs (showing first 8)",
                        hits.len() - 8
                    ),
                ));
            }
        }
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
        match forge_sim::derive_hud_with_catalog(spec, &baked, catalog) {
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
        Archetype::Biped => {
            let mut driver = forge_motion::biped::BipedDriver::new(spec);
            let input = forge_motion::StickInput {
                mz: 1.0,
                ..Default::default()
            };
            let mut finite = true;
            for step in 0..240 {
                driver.tick(
                    &input,
                    [0.0, 0.0, 1.0],
                    forge_motion::DT,
                    (step + 1) as f64 * forge_motion::DT,
                );
                if !driver
                    .poses
                    .poses()
                    .iter()
                    .all(|p| p.rot.iter().chain(&p.off).all(|v| v.is_finite()))
                {
                    finite = false;
                    break;
                }
            }
            let dist = (driver.pos[0].powi(2) + driver.pos[1].powi(2)).sqrt();
            if !finite {
                d.push(Diagnostic::error(
                    "BEH-001",
                    "biped_smoke: non-finite pose channel during 2 s walk",
                ));
            } else if !(1.3..=1.6).contains(&dist) {
                d.push(
                    Diagnostic::error(
                        "BEH-001",
                        format!(
                            "biped_smoke: walked {dist:.3} m in 2 s, expected ≈1.49 m \
                             (0.85 m/s walk target, 0.25 s speed ramp)"
                        ),
                    )
                    .observed(dist)
                    .units("m"),
                );
            }
        }
        Archetype::Arm => {
            let mut driver = forge_motion::arm::ArmDriver::new(spec);
            if driver.joints.len() < 2 {
                d.push(
                    Diagnostic::error(
                        "BEH-001",
                        format!(
                            "arm_smoke: {} revolute joints found; need at least 2 for reach/track",
                            driver.joints.len()
                        ),
                    )
                    .hint("declare revolute arm joints or set driver.params.jointNodes"),
                );
            } else {
                let tolerance = driver.params.reach_tolerance_m;
                let out = driver.tick(&forge_motion::InputFrame::default(), forge_motion::DT);
                if out
                    .joint_targets
                    .iter()
                    .any(|(_, angle)| !angle.is_finite())
                    || !out.error_m.is_finite()
                {
                    d.push(Diagnostic::error(
                        "BEH-001",
                        "arm_smoke: non-finite IK target during reach solve",
                    ));
                } else if !out.reached {
                    d.push(
                        Diagnostic::error(
                            "BEH-001",
                            format!(
                                "arm_smoke: end effector missed target by {:.3} m, tolerance {:.3} m",
                                out.error_m, tolerance
                            ),
                        )
                        .observed(out.error_m)
                        .limit(serde_json::json!(tolerance))
                        .units("m")
                        .hint("move targetM within reach, add joints, or increase reachToleranceM"),
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
            .hint("fixedwing driver arrives with the P2+ driver library"),
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
    pub quantity: u32,
    pub mass_g: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub component_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sku: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub license_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub citation: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dfm_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dfm_artifact_ref: Option<String>,
    pub source: String,
}

pub fn bom_rows(spec: &ModelSpec, baked: &BakedModel) -> Vec<BomRow> {
    bom_rows_with_catalog(spec, baked, &EmptyCatalog)
}

pub fn bom_rows_with_catalog(
    spec: &ModelSpec,
    baked: &BakedModel,
    catalog: &dyn CatalogSource,
) -> Vec<BomRow> {
    let mut rows: Vec<BomRow> = baked
        .parts
        .iter()
        .map(|bp| {
            let part = &spec.parts[bp.part_index];
            let dfm = dfm_bom_summary(bp.part_index, part, bp);
            BomRow {
                item: part
                    .comp
                    .clone()
                    .unwrap_or_else(|| format!("part-{}", bp.part_index)),
                node: part.node.clone(),
                material: format!("{:?}", part.material).to_lowercase(),
                quantity: 1,
                mass_g: forge_geometry::part_mass_g(&part.mass, part.material, &bp.mesh),
                component_ref: None,
                component_id: None,
                revision: None,
                vendor: None,
                sku: None,
                url: None,
                price: None,
                currency: None,
                license_class: None,
                review_status: None,
                citation: None,
                dfm_status: dfm.as_ref().map(|s| s.status.clone()),
                dfm_artifact_ref: dfm.as_ref().and_then(|s| s.artifact_ref.clone()),
                source: "inline".to_string(),
            }
        })
        .collect();
    for slot in &spec.slots {
        for v in &slot.variants {
            if let Some(r) = &v.component_ref {
                let pin = spec.lockfile.get(r);
                let (component_id, revision) = pin
                    .and_then(|p| p.rsplit_once('@'))
                    .map(|(id, rev)| (Some(id.to_string()), Some(rev.to_string())))
                    .unwrap_or((None, None));
                let component = component_id.as_deref().and_then(|id| catalog.component(id));
                let price = component
                    .as_ref()
                    .and_then(|c| c.prices.iter().find(|p| p.purchasable).or(c.prices.first()));
                let quantity = slot.mount_nodes.len().max(1) as u32;
                let citation = component
                    .as_ref()
                    .and_then(|c| {
                        c.citations
                            .get("prices")
                            .or_else(|| c.citations.get("massG"))
                    })
                    .and_then(|c| c.sources.first().cloned());
                let review_status = component.as_ref().map(|c| {
                    if c.review.is_some() || c.confidence < 1.0 {
                        "needs_review".to_string()
                    } else {
                        "reviewed".to_string()
                    }
                });
                rows.push(BomRow {
                    item: format!("{}/{}", slot.id, v.id),
                    node: slot.mount_nodes.first().cloned().unwrap_or_default(),
                    material: component
                        .as_ref()
                        .map(|c| c.category.clone())
                        .unwrap_or_default(),
                    quantity,
                    mass_g: component
                        .as_ref()
                        .map(|c| c.mass_g * quantity as f64)
                        .unwrap_or(0.0),
                    component_ref: Some(r.clone()),
                    component_id,
                    revision,
                    vendor: price.map(|p| p.vendor.clone()),
                    sku: price.map(|p| p.sku.clone()),
                    url: price.map(|p| p.url.clone()),
                    price: price.map(|p| p.amount * quantity as f64),
                    currency: price.map(|p| p.currency.clone()),
                    license_class: component.as_ref().map(|c| c.license.class.clone()),
                    review_status,
                    citation,
                    dfm_status: None,
                    dfm_artifact_ref: None,
                    source: if component.is_some() {
                        "catalog".to_string()
                    } else {
                        "catalog-unresolved".to_string()
                    },
                });
            }
        }
    }
    rows
}

pub fn bom_csv(rows: &[BomRow]) -> String {
    let mut out = String::from(
        "item,node,material,quantity,mass_g,componentRef,componentId,revision,vendor,sku,url,price,currency,licenseClass,reviewStatus,citation,dfmStatus,dfmArtifactRef,source\n",
    );
    for r in rows {
        let fields = [
            r.item.clone(),
            r.node.clone(),
            r.material.clone(),
            r.quantity.to_string(),
            format!("{:.1}", r.mass_g),
            r.component_ref.clone().unwrap_or_default(),
            r.component_id.clone().unwrap_or_default(),
            r.revision.clone().unwrap_or_default(),
            r.vendor.clone().unwrap_or_default(),
            r.sku.clone().unwrap_or_default(),
            r.url.clone().unwrap_or_default(),
            r.price.map(|p| format!("{p:.2}")).unwrap_or_default(),
            r.currency.clone().unwrap_or_default(),
            r.license_class.clone().unwrap_or_default(),
            r.review_status.clone().unwrap_or_default(),
            r.citation.clone().unwrap_or_default(),
            r.dfm_status.clone().unwrap_or_default(),
            r.dfm_artifact_ref.clone().unwrap_or_default(),
            r.source.clone(),
        ];
        out.push_str(
            &fields
                .iter()
                .map(|f| csv_escape(f))
                .collect::<Vec<_>>()
                .join(","),
        );
        out.push('\n');
    }
    out
}

fn csv_escape(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
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

fn run_dfm_checks(spec: &ModelSpec, baked: &BakedModel) -> Vec<Diagnostic> {
    let mut out = Vec::new();
    for bp in &baked.parts {
        let part = &spec.parts[bp.part_index];
        let Some(analyses) = dfm_analyses(part, bp) else {
            continue;
        };
        if analyses.iter().any(|a| a.passed) {
            continue;
        }
        if let Some(best) = best_dfm_analysis(&analyses) {
            let profile = dfm_profile(best.process);
            for check in best.failed_checks() {
                out.push(dfm_diagnostic(check, bp.part_index, best, profile));
            }
        }
    }
    out
}

fn printable_structural_part(part: &forge_contract::Part) -> bool {
    part.collision != CollisionPolicy::None
        && matches!(
            part.material,
            MaterialClass::Gloss | MaterialClass::Matte | MaterialClass::Satin
        )
}

fn dfm_analyses(
    part: &forge_contract::Part,
    bp: &forge_geometry::BakedPart,
) -> Option<Vec<forge_geometry::dfm::DfmProfileAnalysis>> {
    printable_structural_part(part).then(|| {
        forge_geometry::dfm::analyze_mesh(&bp.mesh, &forge_geometry::dfm::structural_profiles())
    })
}

fn best_dfm_analysis(
    analyses: &[forge_geometry::dfm::DfmProfileAnalysis],
) -> Option<&forge_geometry::dfm::DfmProfileAnalysis> {
    analyses.iter().min_by(|a, b| {
        a.failed_checks()
            .len()
            .cmp(&b.failed_checks().len())
            .then_with(|| cmp_f64(a.support_ratio, b.support_ratio))
            .then_with(|| cmp_f64(a.max_overhang_deg, b.max_overhang_deg))
    })
}

fn dfm_profile(process: forge_geometry::dfm::PrintProcess) -> forge_geometry::dfm::PrintProfile {
    match process {
        forge_geometry::dfm::PrintProcess::Fdm => {
            forge_geometry::dfm::PrintProfile::fdm_structural()
        }
        forge_geometry::dfm::PrintProcess::Sla => {
            forge_geometry::dfm::PrintProfile::sla_structural()
        }
    }
}

fn dfm_diagnostic(
    check: &str,
    part_index: usize,
    analysis: &forge_geometry::dfm::DfmProfileAnalysis,
    profile: forge_geometry::dfm::PrintProfile,
) -> Diagnostic {
    let slug = profile.process.slug();
    match check {
        "MFG-001" => Diagnostic::error(
            "MFG-001",
            format!(
                "min_wall: part {part_index} has {:.2} mm; {slug} requires {:.1} mm",
                analysis.min_wall_m * 1000.0,
                profile.min_wall_m * 1000.0
            ),
        )
        .subject("part", part_index.to_string())
        .observed(analysis.min_wall_m * 1000.0)
        .limit(serde_json::json!({
            "profile": slug,
            "minWallMm": profile.min_wall_m * 1000.0
        }))
        .units("mm")
        .hint("thicken the printable section or mark decorative/non-structural parts collision:none"),
        "MFG-002" => Diagnostic::error(
            "MFG-002",
            format!(
                "overhang: part {part_index} has unsupported surfaces up to {:.0} deg from vertical after best {slug} orientation",
                analysis.max_overhang_deg
            ),
        )
        .subject("part", part_index.to_string())
        .observed(analysis.max_overhang_deg)
        .limit(serde_json::json!({
            "profile": slug,
            "maxOverhangDeg": profile.max_overhang_deg
        }))
        .units("deg")
        .hint("re-orient, add chamfers, or split the part before print quote handoff"),
        "MFG-003" => Diagnostic::error(
            "MFG-003",
            format!(
                "support_volume: part {part_index} needs about {:.1} cm^3 of support ({:.0} % of its oriented bounding volume) for {slug}",
                analysis.support_volume_m3 * 1_000_000.0,
                analysis.support_ratio * 100.0
            ),
        )
        .subject("part", part_index.to_string())
        .observed(analysis.support_ratio * 100.0)
        .limit(serde_json::json!({
            "profile": slug,
            "maxSupportPercent": profile.max_support_ratio * 100.0
        }))
        .units("%")
        .hint("reduce underside shelves, split the component, or choose a support-friendly orientation"),
        "MFG-004" => Diagnostic::error(
            "MFG-004",
            format!(
                "bed_fit: part {part_index} oriented as {} is {:.0} x {:.0} x {:.0} mm; {slug} bed is {:.0} x {:.0} x {:.0} mm",
                analysis.orientation_up.label(),
                analysis.oriented_extents_m[0] * 1000.0,
                analysis.oriented_extents_m[1] * 1000.0,
                analysis.oriented_extents_m[2] * 1000.0,
                profile.bed_m[0] * 1000.0,
                profile.bed_m[1] * 1000.0,
                profile.bed_m[2] * 1000.0
            ),
        )
        .subject("part", part_index.to_string())
        .observed(bed_fit_percent(analysis.oriented_extents_m, profile.bed_m))
        .limit(serde_json::json!({
            "profile": slug,
            "bedMm": [
                profile.bed_m[0] * 1000.0,
                profile.bed_m[1] * 1000.0,
                profile.bed_m[2] * 1000.0
            ],
            "maxFitPercent": 100.0
        }))
        .units("%")
        .hint("split the part or select a larger print process before quote handoff"),
        _ => Diagnostic::error(check, format!("dfm_failed: part {part_index}")),
    }
}

fn bed_fit_percent(extents: [f64; 3], bed_m: [f64; 3]) -> f64 {
    let xy_a = (extents[0] / bed_m[0]).max(extents[1] / bed_m[1]);
    let xy_b = (extents[0] / bed_m[1]).max(extents[1] / bed_m[0]);
    xy_a.min(xy_b).max(extents[2] / bed_m[2]) * 100.0
}

fn cmp_f64(a: f64, b: f64) -> std::cmp::Ordering {
    a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)
}

#[derive(Debug, Clone)]
struct DfmBomSummary {
    status: String,
    artifact_ref: Option<String>,
}

fn dfm_bom_summary(
    part_index: usize,
    part: &forge_contract::Part,
    bp: &forge_geometry::BakedPart,
) -> Option<DfmBomSummary> {
    let analyses = dfm_analyses(part, bp)?;
    let analysis = analyses
        .iter()
        .find(|a| a.passed)
        .or_else(|| best_dfm_analysis(&analyses))?;
    let slug = analysis.process.slug();
    if analysis.passed {
        Some(DfmBomSummary {
            status: format!("pass:{slug}"),
            artifact_ref: Some(format!(
                "urn:forge:dfm:part:{part_index}:profile:{slug}:up:{}",
                analysis.orientation_up.label()
            )),
        })
    } else {
        Some(DfmBomSummary {
            status: format!(
                "fail:{}",
                analysis.failed_checks().join("+").to_ascii_lowercase()
            ),
            artifact_ref: None,
        })
    }
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

    fn arm_contract(params: serde_json::Value) -> String {
        serde_json::json!({
          "meta":{"id":"arm","name":"arm","version":"2.1.0","archetype":"arm",
                  "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[
            {"name":"base","parent":null,"pos":[0,0,0]},
            {"name":"shoulder","parent":"base","pos":[0,0,0],
             "joint":{"type":"revolute","axis":[1,0,0],"maxVelRad":8.0},
             "limits":[[-2.2,2.2],[0,0],[0,0]]},
            {"name":"elbow","parent":"shoulder","pos":[0,0,0.22],
             "joint":{"type":"revolute","axis":[1,0,0],"maxVelRad":8.0},
             "limits":[[-2.2,2.2],[0,0],[0,0]]},
            {"name":"wrist","parent":"elbow","pos":[0,0,0.18]}
          ],
          "parts":[
            {"node":"shoulder","geom":{"kind":"box","w":0.04,"h":0.04,"d":0.22},
             "material":"matte","color":"#444444","collision":"primitive"},
            {"node":"elbow","geom":{"kind":"box","w":0.035,"h":0.035,"d":0.18},
             "material":"matte","color":"#555555","collision":"primitive"}
          ],
          "driver":{"archetype":"arm","params":params}
        })
        .to_string()
    }

    #[test]
    fn arm_driver_params_and_smoke_are_admitted() {
        let doc = arm_contract(serde_json::json!({
            "targetM":[0.0,-0.12,0.30],
            "reachToleranceM":0.02,
            "iterations":48
        }));
        let report = run_full(&doc, &EmptyCatalog, &Options::default());
        let errors: Vec<_> = report
            .results
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .collect();
        assert!(errors.is_empty(), "unexpected errors: {errors:#?}");
        assert_eq!(report.verdict, Verdict::Admitted);
    }

    #[test]
    fn arm_driver_param_type_mismatch_is_ctr_008() {
        let doc = arm_contract(serde_json::json!({"targetM":"near the block"}));
        let report = run_full(&doc, &EmptyCatalog, &Options::default());
        assert_eq!(report.verdict, Verdict::Rejected);
        assert!(report
            .results
            .iter()
            .any(|d| d.check == "CTR-008" && d.severity == Severity::Error));
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
    fn dfm_accepts_demo_without_mfg_errors() {
        let report = run_full(GOOD, &EmptyCatalog, &Options::default());
        assert!(report
            .results
            .iter()
            .all(|d| !d.check.starts_with("MFG-") || d.severity != Severity::Error));
    }

    #[test]
    fn dfm_rejects_too_thin_printed_part() {
        let mut spec = forge_contract::validate_shape(GOOD).unwrap();
        spec.parts[0].geom = forge_contract::Geom::Box {
            w: 0.0008,
            h: 0.02,
            d: 0.02,
        };
        spec.parts[0].material = MaterialClass::Matte;
        let doc = serde_json::to_string(&spec).unwrap();
        let report = run_full(&doc, &EmptyCatalog, &Options::default());
        assert!(report
            .results
            .iter()
            .any(|d| d.check == "MFG-001" && d.severity == Severity::Error));
        assert_eq!(report.verdict, Verdict::Rejected);
    }

    #[test]
    fn dfm_rejects_printed_part_that_does_not_fit_bed() {
        let mut spec = forge_contract::validate_shape(GOOD).unwrap();
        spec.parts[0].geom = forge_contract::Geom::Box {
            w: 0.7,
            h: 0.02,
            d: 0.02,
        };
        spec.parts[0].material = MaterialClass::Matte;
        let doc = serde_json::to_string(&spec).unwrap();
        let report = run_full(&doc, &EmptyCatalog, &Options::default());
        assert!(report
            .results
            .iter()
            .any(|d| d.check == "MFG-004" && d.severity == Severity::Error));
        assert_eq!(report.verdict, Verdict::Rejected);
    }

    #[test]
    fn bom_lists_every_part_with_mass() {
        let spec = forge_contract::validate_shape(GOOD).unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let rows = bom_rows(&spec, &baked);
        assert_eq!(rows.len(), 16);
        let total: f64 = rows.iter().map(|r| r.mass_g).sum();
        assert!((total - 479.0).abs() < 1e-6, "Σ {total}");
        let frame = rows.iter().find(|r| r.item == "part-0").unwrap();
        assert_eq!(frame.dfm_status.as_deref(), Some("pass:fdm-structural"));
        assert!(frame
            .dfm_artifact_ref
            .as_deref()
            .unwrap()
            .contains("profile:fdm-structural"));
        let csv = bom_csv(&rows);
        assert_eq!(csv.lines().count(), 17, "header + 16 rows");
        assert!(csv.contains("dfmStatus"));
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
