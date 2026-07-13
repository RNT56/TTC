use forge_contract::{migrate, migrate_with_report, ProvenanceKind, SCHEMA_VERSION};

fn legacy_doc() -> String {
    serde_json::json!({
        "schemaVersion": "2.0.0",
        "meta": {
            "id": "legacy-rover",
            "name": "Legacy Rover",
            "version": "0.2.0",
            "archetype": "rover",
            "provenance": {
                "kind": "parametric_generator",
                "prompt_hash": "prompt-abc",
                "model_version": "gen-1"
            },
            "license": "CC0",
            "schema_version": "2.0.0"
        },
        "env": {
            "air_density": 1.21
        },
        "skeleton": [{
            "name": "root",
            "parent": null,
            "pos": [0.0, 0.0, 0.0],
            "joint": {
                "type": "fixed",
                "max_torque_nm": 0.6,
                "max_vel_rad": 1.5
            }
        }],
        "parts": [{
            "node": "root",
            "geom": {"kind": "box", "w": 0.12, "h": 0.02, "d": 0.08},
            "material": "matte",
            "color": "#112233",
            "render_bias": 0.02,
            "mass": {
                "value_g": 12.5,
                "density_kgm3": 1240.0
            }
        }],
        "slots": [{
            "id": "battery",
            "label": "Battery",
            "mount_nodes": ["root"],
            "variants": [{
                "id": "pack",
                "component_ref": "cmp_pack@^1.0.0"
            }]
        }],
        "driver": {"archetype": "rover", "params": {}},
        "sim": {
            "battery": {
                "cells": 2,
                "capacityMah": 1100.0,
                "rIntMohm": 24.0,
                "c_rating": 35.0
            },
            "motors": [{
                "mount": "root",
                "component_ref": "cmp_motor@^1.0.0",
                "max_current_a": 12.0,
                "dir": 1
            }],
            "props": [{
                "diameter_in": 3.0,
                "pitch_in": 2.0,
                "blades": 2,
                "ct_table": "ct-mini"
            }],
            "estimator": {
                "kind": "complementary",
                "gyro_noise": 0.01,
                "accel_noise": 0.02,
                "bias": 0.001,
                "latencyMs": 5.0
            },
            "aggregate_mass_g": 240.0
        }
    })
    .to_string()
}

#[test]
fn migrates_legacy_aliases_to_current_schema() {
    let report = migrate_with_report(&legacy_doc(), "current").unwrap();

    assert_eq!(report.from_schema_version, "2.0.0");
    assert_eq!(report.to_schema_version, SCHEMA_VERSION);
    assert!(report
        .applied
        .contains(&"drop-schema-version-marker".to_string()));
    assert!(report.applied.contains(&"field-aliases-v2.1".to_string()));
    assert!(report
        .applied
        .contains(&"component-ref-aliases".to_string()));
    assert!(report
        .applied
        .contains(&"provenance-kind-aliases".to_string()));
    assert!(report
        .applied
        .contains(&"equip-single-variant-slots-v2.2".to_string()));

    let spec = report.spec;
    assert_eq!(
        spec.meta.provenance.kind,
        ProvenanceKind::ParametricGenerator
    );
    assert_eq!(
        spec.meta.provenance.prompt_hash.as_deref(),
        Some("prompt-abc")
    );
    assert_eq!(spec.env.air_density, 1.21);
    assert_eq!(
        spec.skeleton[0].joint.as_ref().unwrap().max_torque_nm,
        Some(0.6)
    );
    assert_eq!(spec.parts[0].render_bias, Some(0.02));
    assert_eq!(spec.parts[0].mass.as_ref().unwrap().value_g, Some(12.5));
    assert_eq!(spec.slots[0].mount_nodes, vec!["root".to_string()]);
    assert_eq!(spec.slots[0].equipped_variant_id.as_deref(), Some("pack"));
    assert_eq!(
        spec.slots[0].variants[0].component_ref.as_deref(),
        Some("cmp_pack@^1.0.0")
    );
    assert_eq!(spec.sim.battery.as_ref().unwrap().capacity_mah, 1100.0);
    assert_eq!(spec.sim.battery.as_ref().unwrap().r_int_mohm, 24.0);
    assert_eq!(
        spec.sim.motors[0].component_ref.as_deref(),
        Some("cmp_motor@^1.0.0")
    );
    assert_eq!(spec.sim.estimator.as_ref().unwrap().latency_ms, 5.0);
    assert_eq!(spec.sim.aggregate_mass_g, Some(240.0));

    let current = serde_json::to_value(&spec).unwrap();
    assert!(current.get("schemaVersion").is_none());
    assert_eq!(
        current
            .pointer("/meta/provenance/kind")
            .and_then(serde_json::Value::as_str),
        Some("parametric-generator")
    );
    assert!(current.pointer("/parts/0/renderBias").is_some());
    assert!(current.pointer("/sim/battery/capacity_mAh").is_some());
    assert!(current.pointer("/sim/motors/0/ref").is_some());
}

#[test]
fn migrate_returns_typed_spec_for_current_target() {
    let spec = migrate(&legacy_doc(), SCHEMA_VERSION).unwrap();
    assert_eq!(spec.meta.id, "legacy-rover");
}

#[test]
fn rejects_unsupported_targets() {
    let err = migrate_with_report(&legacy_doc(), "3.0.0").unwrap_err();
    assert!(err.message.contains("unsupported migration target"));
}

#[test]
fn refuses_to_guess_among_multiple_legacy_variants() {
    let mut value: serde_json::Value = serde_json::from_str(&legacy_doc()).unwrap();
    let variants = value["slots"][0]["variants"].as_array_mut().unwrap();
    variants.push(serde_json::json!({
        "id": "other-pack",
        "componentRef": "cmp_pack_other@^1.0.0"
    }));
    let err = migrate_with_report(&value.to_string(), "current").unwrap_err();
    assert!(err.message.contains("multiple legacy variants"));
    assert!(err.message.contains("set equippedVariantId explicitly"));
}
