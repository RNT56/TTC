//! P3-006/XC-03: lockfile resolution — semver ranges → immutable pins (D5).
//! Stability is the contract: a catalog update never silently moves a model;
//! movement happens only through the explicit upgrade flow, which reports
//! every diff for re-validation (LIF-001).

use forge_contract::semver::Version;
use forge_contract::{
    pin_refs, upgrade_lockfile, CatalogSource, ModelSpec, Revision, RevisionSource,
};
use std::collections::BTreeMap;

/// In-memory catalog: (id, version, yanked) triples.
struct Mem(Vec<(&'static str, &'static str, bool)>);

impl CatalogSource for Mem {
    fn has_revision(&self, id: &str, rev: &str) -> bool {
        self.0.iter().any(|(i, v, _)| *i == id && *v == rev)
    }
}
impl RevisionSource for Mem {
    fn revisions(&self, id: &str) -> Vec<Revision> {
        self.0
            .iter()
            .filter(|(i, _, _)| *i == id)
            .map(|(_, v, yanked)| Revision {
                version: Version::parse(v).unwrap(),
                yanked: *yanked,
            })
            .collect()
    }
}

fn spec_with(refs: &[&str], lockfile: &[(&str, &str)]) -> ModelSpec {
    let variants: Vec<serde_json::Value> = refs
        .iter()
        .enumerate()
        .map(|(i, r)| {
            serde_json::json!({"id": format!("v{i}"), "label": format!("v{i}"), "componentRef": r})
        })
        .collect();
    let lock: BTreeMap<&str, &str> = lockfile.iter().copied().collect();
    let doc = serde_json::json!({
      "meta": {"id": "lk", "name": "lk", "version": "2.1.0", "archetype": "multirotor",
               "provenance": {"kind": "human"}, "license": "CC0"},
      "skeleton": [{"name": "root", "parent": null, "pos": [0, 0, 0]}],
      "parts": [{"node": "root", "geom": {"kind": "box", "w": 0.1, "h": 0.02, "d": 0.1},
                 "material": "matte", "color": "#333333"}],
      "slots": [{"id": "s", "label": "s", "mountNodes": ["root"],
                 "equippedVariantId": "v0", "variants": variants}],
      "driver": {"archetype": "multirotor", "params": {}},
      "lockfile": lock,
    });
    forge_contract::validate_shape(&doc.to_string()).unwrap()
}

#[test]
fn only_the_equipped_alternative_is_pinned() {
    let cat = Mem(vec![
        ("cmp_selected", "1.2.0", false),
        ("cmp_spare", "9.0.0", false),
    ]);
    let spec = spec_with(&["cmp_selected@^1.0.0", "cmp_spare@^9.0.0"], &[]);
    let lock = pin_refs(&spec, &cat).unwrap();
    assert_eq!(lock.len(), 1);
    assert_eq!(
        lock.get("cmp_selected@^1.0.0").map(String::as_str),
        Some("cmp_selected@1.2.0")
    );
    assert!(!lock.contains_key("cmp_spare@^9.0.0"));
}

#[test]
fn fresh_resolution_picks_newest_matching_non_yanked() {
    let cat = Mem(vec![
        ("cmp_m", "1.0.0", false),
        ("cmp_m", "1.2.0", false),
        ("cmp_m", "1.3.0", true), // yanked — never freshly selected
        ("cmp_m", "2.0.0", false),
    ]);
    let spec = spec_with(&["cmp_m@^1.0.0"], &[]);
    let lock = pin_refs(&spec, &cat).unwrap();
    assert_eq!(lock.get("cmp_m@^1.0.0").unwrap(), "cmp_m@1.2.0");
}

#[test]
fn existing_pins_are_stable_until_upgraded() {
    let cat = Mem(vec![("cmp_m", "1.0.0", false), ("cmp_m", "1.5.0", false)]);
    let spec = spec_with(&["cmp_m@^1.0.0"], &[("cmp_m@^1.0.0", "cmp_m@1.0.0")]);
    // pin_refs keeps the old pin even though 1.5.0 exists
    let lock = pin_refs(&spec, &cat).unwrap();
    assert_eq!(lock.get("cmp_m@^1.0.0").unwrap(), "cmp_m@1.0.0");
    // the upgrade flow is the explicit mover, and it reports the diff
    let (upgraded, diffs) = upgrade_lockfile(&spec, &cat).unwrap();
    assert_eq!(upgraded.get("cmp_m@^1.0.0").unwrap(), "cmp_m@1.5.0");
    assert_eq!(diffs.len(), 1);
    assert_eq!(
        (diffs[0].from.as_str(), diffs[0].to.as_str()),
        ("cmp_m@1.0.0", "cmp_m@1.5.0")
    );
}

#[test]
fn yanked_pin_survives_but_upgrade_moves_off_it() {
    // history is immutable: an existing pin to a now-yanked revision still
    // verifies; upgrading selects the newest non-yanked instead
    let cat = Mem(vec![("cmp_m", "1.1.0", true), ("cmp_m", "1.1.5", false)]);
    let spec = spec_with(&["cmp_m@~1.1.0"], &[("cmp_m@~1.1.0", "cmp_m@1.1.0")]);
    let lock = pin_refs(&spec, &cat).unwrap();
    assert_eq!(
        lock.get("cmp_m@~1.1.0").unwrap(),
        "cmp_m@1.1.0",
        "existing pin kept"
    );
    let (upgraded, diffs) = upgrade_lockfile(&spec, &cat).unwrap();
    assert_eq!(upgraded.get("cmp_m@~1.1.0").unwrap(), "cmp_m@1.1.5");
    assert_eq!(diffs.len(), 1);
}

#[test]
fn selected_unsatisfiable_ranges_and_bad_refs_error_with_reasons() {
    let cat = Mem(vec![("cmp_m", "2.0.0", false)]);
    let spec = spec_with(&["cmp_m@^1.0.0"], &[]);
    let errors = pin_refs(&spec, &cat).unwrap_err();
    assert_eq!(errors.len(), 1);
    assert!(errors.iter().any(|e| e.reason.contains("no published")));

    let bad = spec_with(&["no-at-sign"], &[]);
    let errors = pin_refs(&bad, &cat).unwrap_err();
    assert_eq!(errors.len(), 1);
    assert!(errors[0].reason.contains("not '<id>@<range>'"));
}
