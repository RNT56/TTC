//! P3-003 compatibility rule engine — CORE-side (truth lives in core, D16;
//! the component-database doc's earlier gateway placement was *(proposed)*
//! and is corrected — gateway and studio consume these results, the same
//! bits everywhere via the facade, D17). Every violation carries an
//! explanation string: compatibility is explained, never merely enforced —
//! the explanation is the reason a configurator card greys out.
//!
//! v0 scope, honestly stated: rules evaluate DECLARED component records
//! (the checked surface of catalog rows). Prop-tip clearance is the
//! spacing-vs-diameter form; the full geometric BVH sweep against frame
//! geometry is XC-09. TWR floors need thrust + AUW from the caller (they
//! come from thrust tables / HUD derivations, not invented here).

use crate::Diagnostic;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Motor,
    Esc,
    Fc,
    Battery,
    Prop,
    Frame,
    Other,
}

/// Electrical surface of a catalog row (datasheet-sourced; absent fields
/// simply skip the rules that need them — placeholders never pass silently).
#[derive(Debug, Clone, Default)]
pub struct ElecSpec {
    /// Operating voltage window, volts.
    pub v_min: Option<f64>,
    pub v_max: Option<f64>,
    /// Motor/ESC: maximum continuous draw, amps.
    pub max_current_a: Option<f64>,
    /// Battery: maximum continuous discharge, amps.
    pub max_discharge_a: Option<f64>,
    /// Connector taxonomy ids, e.g. "XT60", "JST-PH-2".
    pub connectors: Vec<String>,
}

/// Mechanical surface of a catalog row.
#[derive(Debug, Clone, Default)]
pub struct MechSpec {
    /// Mount-pattern taxonomy id, e.g. "stack-30.5x30.5-M3", "motor-16x16-M3".
    pub mount_pattern: Option<String>,
    /// Prop: diameter in inches (the ecosystem's unit; converted internally).
    pub prop_diameter_in: Option<f64>,
    /// Frame: motor-to-motor spacing, mm (adjacent arms).
    pub motor_spacing_mm: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct ComponentRecord {
    pub id: String,
    pub category: Category,
    pub mass_g: f64,
    pub elec: ElecSpec,
    pub mech: MechSpec,
}

/// TWR floors per flight preset (CAT-005): reject below the hard floor,
/// warn below the comfort floor.
#[derive(Debug, Clone, Copy)]
pub struct TwrPreset {
    pub name: &'static str,
    pub reject_below: f64,
    pub warn_below: f64,
}

pub const FREESTYLE: TwrPreset = TwrPreset {
    name: "freestyle",
    reject_below: 1.8,
    warn_below: 2.5,
};

/// Evaluate every applicable pair/aggregate rule over a candidate build.
/// Returns diagnostics only for violations — an empty vec is compatible.
pub fn check_build(components: &[ComponentRecord]) -> Vec<Diagnostic> {
    let mut d = Vec::new();
    let of = |cat: Category| components.iter().filter(move |c| c.category == cat);

    // CAT-001 mount-pattern equality: every stack part vs the frame
    if let Some(frame) = of(Category::Frame).next() {
        if let Some(frame_pattern) = &frame.mech.mount_pattern {
            for part in components
                .iter()
                .filter(|c| matches!(c.category, Category::Esc | Category::Fc))
            {
                match &part.mech.mount_pattern {
                    Some(p) if p == frame_pattern => {}
                    Some(p) => d.push(
                        Diagnostic::error(
                            "CAT-001",
                            format!(
                                "mount_pattern: '{}' mounts {p} but frame '{}' provides {frame_pattern}",
                                part.id, frame.id
                            ),
                        )
                        .subject("component", &part.id)
                        .hint("stack patterns must be equal — adapters are a separate component"),
                    ),
                    None => d.push(
                        Diagnostic::warn(
                            "CAT-001",
                            format!(
                                "mount_pattern: '{}' declares no pattern — cannot verify against frame '{}'",
                                part.id, frame.id
                            ),
                        )
                        .subject("component", &part.id),
                    ),
                }
            }
        }
    }

    // CAT-002 voltage window: battery ↔ ESC ↔ motor intersection non-empty
    let windows: Vec<(&str, f64, f64)> = components
        .iter()
        .filter(|c| {
            matches!(
                c.category,
                Category::Battery | Category::Esc | Category::Motor
            )
        })
        .filter_map(|c| match (c.elec.v_min, c.elec.v_max) {
            (Some(lo), Some(hi)) => Some((c.id.as_str(), lo, hi)),
            _ => None,
        })
        .collect();
    if windows.len() >= 2 {
        let lo = windows.iter().map(|w| w.1).fold(f64::MIN, f64::max);
        let hi = windows.iter().map(|w| w.2).fold(f64::MAX, f64::min);
        if lo > hi {
            let detail = windows
                .iter()
                .map(|(id, a, b)| format!("{id}: {a:.1}–{b:.1} V"))
                .collect::<Vec<_>>()
                .join(", ");
            d.push(
                Diagnostic::error(
                    "CAT-002",
                    format!("voltage_window: empty intersection across {detail}"),
                )
                .units("V")
                .hint("battery, ESC and motors must share an operating voltage range"),
            );
        }
    }

    // CAT-003 current budget: battery discharge ≥ Σ motor max × 1.2
    let motor_draw: f64 = of(Category::Motor)
        .filter_map(|m| m.elec.max_current_a)
        .sum();
    if motor_draw > 0.0 {
        if let Some(batt) = of(Category::Battery).next() {
            if let Some(discharge) = batt.elec.max_discharge_a {
                let need = motor_draw * 1.2;
                if discharge < need {
                    d.push(
                        Diagnostic::error(
                            "CAT-003",
                            format!(
                                "current_budget: '{}' delivers {discharge:.0} A but motors demand {motor_draw:.0} A × 1.2 = {need:.0} A",
                                batt.id
                            ),
                        )
                        .subject("component", &batt.id)
                        .observed(discharge)
                        .limit(serde_json::Value::from(need))
                        .units("A"),
                    );
                }
            }
        }
    }

    // CAT-004 prop tip clearance (v0 spacing form; geometric BVH = XC-09):
    // adjacent tip circles must not overlap — spacing ≥ prop diameter
    if let (Some(frame), Some(prop)) = (of(Category::Frame).next(), of(Category::Prop).next()) {
        if let (Some(spacing_mm), Some(d_in)) =
            (frame.mech.motor_spacing_mm, prop.mech.prop_diameter_in)
        {
            let d_mm = d_in * 25.4;
            if d_mm > spacing_mm {
                d.push(
                    Diagnostic::error(
                        "CAT-004",
                        format!(
                            "prop_clearance: {d_in}\" props ({d_mm:.0} mm) overlap at {spacing_mm:.0} mm motor spacing on '{}'",
                            frame.id
                        ),
                    )
                    .observed(d_mm)
                    .limit(serde_json::Value::from(spacing_mm))
                    .units("mm"),
                );
            }
        }
    }

    // CAT-006 connectors: battery ↔ ESC must share an electrical connector
    if let (Some(batt), Some(esc)) = (of(Category::Battery).next(), of(Category::Esc).next()) {
        if !batt.elec.connectors.is_empty() && !esc.elec.connectors.is_empty() {
            let shared = batt
                .elec
                .connectors
                .iter()
                .any(|c| esc.elec.connectors.contains(c));
            if !shared {
                d.push(
                    Diagnostic::error(
                        "CAT-006",
                        format!(
                            "connectors: '{}' offers [{}] but '{}' accepts [{}] — no match",
                            batt.id,
                            batt.elec.connectors.join(", "),
                            esc.id,
                            esc.elec.connectors.join(", ")
                        ),
                    )
                    .hint("pigtail adapters are their own catalog components"),
                );
            }
        }
    }

    d
}

/// CAT-005 TWR floor per preset. Thrust and AUW come from the caller —
/// thrust tables / HUD derivations, never invented here.
pub fn check_twr(total_thrust_g: f64, auw_g: f64, preset: TwrPreset) -> Option<Diagnostic> {
    if auw_g <= 0.0 {
        return None;
    }
    let twr = total_thrust_g / auw_g;
    if twr < preset.reject_below {
        Some(
            Diagnostic::error(
                "CAT-005",
                format!(
                    "twr_floor: {twr:.2} < {} ({} hard floor)",
                    preset.reject_below, preset.name
                ),
            )
            .observed(twr)
            .limit(serde_json::Value::from(preset.reject_below)),
        )
    } else if twr < preset.warn_below {
        Some(
            Diagnostic::warn(
                "CAT-005",
                format!(
                    "twr_floor: {twr:.2} < {} ({} comfort floor)",
                    preset.warn_below, preset.name
                ),
            )
            .observed(twr)
            .limit(serde_json::Value::from(preset.warn_below)),
        )
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Severity;

    // FIXTURES — synthetic records for rule-logic tests only; never catalog
    // rows (catalog admission requires datasheet citations, D10/P3-004)
    fn frame() -> ComponentRecord {
        ComponentRecord {
            id: "fix_frame".into(),
            category: Category::Frame,
            mass_g: 120.0,
            elec: ElecSpec::default(),
            mech: MechSpec {
                mount_pattern: Some("stack-30.5x30.5-M3".into()),
                motor_spacing_mm: Some(160.0),
                ..Default::default()
            },
        }
    }

    fn battery(connector: &str, discharge: f64) -> ComponentRecord {
        ComponentRecord {
            id: "fix_batt".into(),
            category: Category::Battery,
            mass_g: 180.0,
            elec: ElecSpec {
                v_min: Some(12.8),
                v_max: Some(16.8),
                max_discharge_a: Some(discharge),
                connectors: vec![connector.into()],
                ..Default::default()
            },
            mech: MechSpec::default(),
        }
    }

    fn esc(pattern: &str, connector: &str) -> ComponentRecord {
        ComponentRecord {
            id: "fix_esc".into(),
            category: Category::Esc,
            mass_g: 12.0,
            elec: ElecSpec {
                v_min: Some(7.4),
                v_max: Some(25.2),
                max_current_a: Some(45.0),
                connectors: vec![connector.into()],
                ..Default::default()
            },
            mech: MechSpec {
                mount_pattern: Some(pattern.into()),
                ..Default::default()
            },
        }
    }

    fn motor(v_max: f64, max_a: f64) -> ComponentRecord {
        ComponentRecord {
            id: "fix_motor".into(),
            category: Category::Motor,
            mass_g: 32.0,
            elec: ElecSpec {
                v_min: Some(7.4),
                v_max: Some(v_max),
                max_current_a: Some(max_a),
                ..Default::default()
            },
            mech: MechSpec::default(),
        }
    }

    fn prop(diameter_in: f64) -> ComponentRecord {
        ComponentRecord {
            id: "fix_prop".into(),
            category: Category::Prop,
            mass_g: 4.0,
            elec: ElecSpec::default(),
            mech: MechSpec {
                prop_diameter_in: Some(diameter_in),
                ..Default::default()
            },
        }
    }

    #[test]
    fn compatible_build_is_clean() {
        let build = [
            frame(),
            battery("XT60", 240.0),
            esc("stack-30.5x30.5-M3", "XT60"),
            motor(16.8, 30.0),
            prop(5.0),
        ];
        assert!(check_build(&build).is_empty());
    }

    #[test]
    fn each_rule_fires_with_an_explanation() {
        // CAT-001 wrong pattern
        let d = check_build(&[frame(), esc("stack-20x20-M2", "XT60")]);
        assert!(d
            .iter()
            .any(|x| x.check == "CAT-001" && x.message.contains("20x20")));
        // CAT-002 disjoint windows
        let d = check_build(&[battery("XT60", 240.0), motor(11.0, 30.0)]);
        let cat2 = d.iter().find(|x| x.check == "CAT-002").unwrap();
        assert!(cat2.message.contains("V"), "{}", cat2.message);
        // CAT-003 weak battery: 4 motors × 30 A × 1.2 = 144 > 100
        let d = check_build(&[
            battery("XT60", 100.0),
            motor(16.8, 30.0),
            motor(16.8, 30.0),
            motor(16.8, 30.0),
            motor(16.8, 30.0),
        ]);
        let cat3 = d.iter().find(|x| x.check == "CAT-003").unwrap();
        assert!(cat3.message.contains("144"), "{}", cat3.message);
        // CAT-004 7" props on a 160 mm frame
        let d = check_build(&[frame(), prop(7.0)]);
        assert!(d
            .iter()
            .any(|x| x.check == "CAT-004" && x.message.contains("178")));
        // CAT-006 connector mismatch
        let d = check_build(&[battery("XT30", 240.0), esc("stack-30.5x30.5-M3", "XT60")]);
        assert!(d
            .iter()
            .any(|x| x.check == "CAT-006" && x.message.contains("XT30")));
    }

    #[test]
    fn twr_floor_rejects_warns_and_passes() {
        let reject = check_twr(700.0, 500.0, FREESTYLE).unwrap(); // 1.4
        assert_eq!(reject.severity, Severity::Error);
        let warn = check_twr(1000.0, 500.0, FREESTYLE).unwrap(); // 2.0
        assert_eq!(warn.severity, Severity::Warn);
        assert!(check_twr(1500.0, 500.0, FREESTYLE).is_none()); // 3.0
    }

    #[test]
    fn undeclared_fields_skip_rules_but_unknown_pattern_warns() {
        // a frame with no pattern: CAT-001 cannot run at all
        let mut f = frame();
        f.mech.mount_pattern = None;
        assert!(check_build(&[f, esc("stack-30.5x30.5-M3", "XT60")]).is_empty());
        // an ESC with no pattern against a declared frame: explicit warn
        let mut e = esc("stack-30.5x30.5-M3", "XT60");
        e.mech.mount_pattern = None;
        let d = check_build(&[frame(), e]);
        assert!(d
            .iter()
            .any(|x| x.check == "CAT-001" && x.severity == Severity::Warn));
    }
}
