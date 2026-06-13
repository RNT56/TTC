//! P3-007 proof pair — the P3 exit criterion "proof pair renders to
//! datasheet dimensions within tolerance", executed: the catalog rows'
//! cited dimensions drive primitive geometry whose baked AABB must land
//! within 1 % of the datasheet numbers; masses come from the rows (sourced,
//! never derived from the primitive approximation — D18's
//! mass-properties-correct bar); the resolver pins both refs; the compat
//! engine finds the pair electrically compatible.

use forge_contract::CatalogSource;
use forge_validate::file_catalog::FileCatalog;
use std::path::Path;

fn catalog() -> FileCatalog {
    FileCatalog::load(Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../catalog"
    )))
    .unwrap()
}

fn baked_aabb(geom: &forge_contract::Geom) -> [f64; 3] {
    let (mesh, _) = forge_geometry::primitives::bake_part(geom, None).unwrap();
    let mut min = [f64::MAX; 3];
    let mut max = [f64::MIN; 3];
    for v in mesh.positions.chunks(3) {
        for a in 0..3 {
            min[a] = min[a].min(v[a] as f64);
            max[a] = max[a].max(v[a] as f64);
        }
    }
    [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

fn within(observed: f64, expected: f64, tol: f64) -> bool {
    (observed - expected).abs() <= expected * tol
}

#[test]
fn motor_renders_to_datasheet_dimensions_within_tolerance() {
    let cat = catalog();
    let row = cat.get("cmp_motor_emax-eco2-2207-1900kv").unwrap();
    let d_mm = row.dims["diameterMm"];
    let h_mm = row.dims["heightMm"];
    // the proof geometry: a cylinder straight from the cited envelope (m)
    let geom = forge_contract::Geom::Cyl {
        r0: d_mm / 2.0 / 1000.0,
        r1: None,
        h: h_mm / 1000.0,
        n: Some(24),
    };
    let aabb = baked_aabb(&geom);
    // a 24-gon inscribes the circle: width = d·cos(π/24) ≥ 0.991·d — inside 1 %
    assert!(
        within(aabb[0] * 1000.0, d_mm, 0.01),
        "x {} vs {d_mm}",
        aabb[0] * 1000.0
    );
    assert!(
        within(aabb[2] * 1000.0, d_mm, 0.01),
        "z {} vs {d_mm}",
        aabb[2] * 1000.0
    );
    assert!(
        within(aabb[1] * 1000.0, h_mm, 0.001),
        "h {} vs {h_mm}",
        aabb[1] * 1000.0
    );
    // mass is the datasheet's, carried on the row (never derived from the
    // primitive approximation)
    assert_eq!(row.mass_g, 31.5);
    assert_eq!(row.elec.kv, Some(1900.0));
}

#[test]
fn battery_renders_to_datasheet_dimensions_within_tolerance() {
    let cat = catalog();
    let row = cat.get("cmp_batt_cnhl-black-4s-1500").unwrap();
    let (l, w, h) = (
        row.dims["lengthMm"],
        row.dims["widthMm"],
        row.dims["heightMm"],
    );
    let geom = forge_contract::Geom::Box {
        w: l / 1000.0,
        h: h / 1000.0,
        d: w / 1000.0,
    };
    let aabb = baked_aabb(&geom);
    assert!(within(aabb[0] * 1000.0, l, 0.001));
    assert!(within(aabb[1] * 1000.0, h, 0.001));
    assert!(within(aabb[2] * 1000.0, w, 0.001));
    assert_eq!(row.mass_g, 164.0);
}

#[test]
fn proof_pair_resolves_and_is_compatible() {
    let cat = catalog();
    // the resolver pins both refs from the proof contract
    let doc = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../examples/vx2-proof.forge.json"
    ))
    .unwrap();
    let spec = forge_contract::validate_shape(&doc).unwrap();
    let pins = forge_contract::pin_refs(&spec, &cat).unwrap();
    assert_eq!(
        pins.get("cmp_motor_emax-eco2-2207-1900kv@^1.0.0").unwrap(),
        "cmp_motor_emax-eco2-2207-1900kv@1.0.0"
    );
    assert_eq!(
        pins.get("cmp_batt_cnhl-black-4s-1500@^1.0.0").unwrap(),
        "cmp_batt_cnhl-black-4s-1500@1.0.0"
    );
    // and the pair is electrically compatible: 4S window inside the motor's
    // 3–6S rating; no mount/connector counterparties present to violate
    let build = [
        cat.record("cmp_motor_emax-eco2-2207-1900kv").unwrap(),
        cat.record("cmp_batt_cnhl-black-4s-1500").unwrap(),
    ];
    let violations = forge_validate::compat::check_build(&build);
    assert!(violations.is_empty(), "{violations:?}");
    // rows below full confidence carry an explicit review requirement
    // (P3-004 review-queue semantics) — never silently trustworthy
    for row in cat.rows() {
        if row.confidence < 1.0 {
            assert!(row.review.is_some(), "{} needs a review note", row.id);
        }
        assert!(!row.citations.is_empty(), "{} cites nothing", row.id);
        assert!(
            !row.license.id.is_empty(),
            "{} has no license ledger id",
            row.id
        );
        assert!(
            row.prices.iter().any(|p| p.purchasable),
            "{} has no purchasable SKU",
            row.id
        );
    }
}

#[test]
fn sim004_flags_inline_vs_equipped_drift_once() {
    let cat = catalog();
    let doc = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../examples/vx2-proof.forge.json"
    ))
    .unwrap()
    // de-reconcile: pretend the inline sim still says 1750 — all four motors
    .replace("\"kv\": 1900", "\"kv\": 1750");
    let report = forge_validate::run_full(&doc, &cat, &forge_validate::Options::default());
    let sim004: Vec<_> = report
        .results
        .iter()
        .filter(|d| d.check == "SIM-004")
        .collect();
    assert_eq!(sim004.len(), 1, "deduped to one warn per distinct kv");
    assert!(sim004[0].message.contains("1750") && sim004[0].message.contains("1900"));
    // and the reconciled contract on disk is clean
    let clean = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../examples/vx2-proof.forge.json"
    ))
    .unwrap();
    let report = forge_validate::run_full(&clean, &cat, &forge_validate::Options::default());
    assert!(report.results.iter().all(|d| d.check != "SIM-004"));
}

#[test]
fn bom_exports_purchasable_catalog_skus() {
    let cat = catalog();
    let doc = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../examples/vx2-proof.forge.json"
    ))
    .unwrap();
    let spec = forge_contract::validate_shape(&doc).unwrap();
    let baked = forge_geometry::bake(&spec).unwrap();
    let rows = forge_validate::bom_rows_with_catalog(&spec, &baked, &cat);
    let motor = rows
        .iter()
        .find(|r| r.component_id.as_deref() == Some("cmp_motor_emax-eco2-2207-1900kv"))
        .unwrap();
    assert_eq!(motor.quantity, 4);
    assert_eq!(motor.sku.as_deref(), Some("0101096015"));
    assert_eq!(motor.license_class.as_deref(), Some("open"));
    assert!(motor.price.unwrap() > 0.0);

    let battery = rows
        .iter()
        .find(|r| r.component_id.as_deref() == Some("cmp_batt_cnhl-black-4s-1500"))
        .unwrap();
    assert_eq!(battery.sku.as_deref(), Some("1501304BK-2PACK"));
    assert_eq!(battery.currency.as_deref(), Some("USD"));

    let csv = forge_validate::bom_csv(&rows);
    assert!(csv.contains("componentId"));
    assert!(csv.contains("0101096015"));
    assert!(csv.contains("1501304BK-2PACK"));
}

#[test]
fn catalog_hud_responds_to_pack_swap() {
    let cat = catalog();
    let doc = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../examples/vx2-proof.forge.json"
    ))
    .unwrap();
    let spec = forge_contract::validate_shape(&doc).unwrap();
    let baked = forge_geometry::bake(&spec).unwrap();
    let base = forge_sim::derive_hud_with_catalog(&spec, &baked, &cat).unwrap();

    let mut swapped = spec.clone();
    let old_ref = "cmp_batt_cnhl-black-4s-1500@^1.0.0";
    let new_ref = "cmp_batt_cnhl-black-v2-4s-1300@^1.0.0";
    for slot in &mut swapped.slots {
        for variant in &mut slot.variants {
            if variant.component_ref.as_deref() == Some(old_ref) {
                variant.component_ref = Some(new_ref.to_string());
                variant.name = Some("CNHL Black Series V2.0 4S 1300 mAh 130C".to_string());
            }
        }
    }
    swapped.lockfile.remove(old_ref);
    swapped.lockfile.insert(
        new_ref.to_string(),
        "cmp_batt_cnhl-black-v2-4s-1300@1.0.0".to_string(),
    );
    let swapped_hud = forge_sim::derive_hud_with_catalog(&swapped, &baked, &cat).unwrap();

    assert!(
        swapped_hud.hover_throttle.unwrap() < base.hover_throttle.unwrap(),
        "lighter 1300 mAh pack should lower hover throttle"
    );
    assert!(
        swapped_hud.endurance_min.unwrap() < base.endurance_min.unwrap(),
        "lower capacity pack should reduce endurance"
    );
}

#[test]
fn reference_rig_manifests_resolve_to_catalog_revisions() {
    let cat = catalog();
    let root = Path::new(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../catalog/reference-rigs"
    ));
    let mut rigs = 0;
    for entry in std::fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        rigs += 1;
        let value: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        for item in value["items"].as_array().unwrap() {
            let id = item["componentId"].as_str().unwrap();
            let rev = item["revision"].as_str().unwrap();
            assert!(cat.has_revision(id, rev), "{}@{} missing", id, rev);
        }
    }
    assert_eq!(rigs, 2);
}
