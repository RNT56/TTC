//! forge-sim — the simulation models: propulsion, battery sag, estimator-in-sim,
//! and the HUD derivations (AUW, TWR, hover throttle, current, endurance).
//!
//! Every HUD claim is a closed-form consequence of the models here, with the
//! assumptions listed alongside the numbers (doctrine #4). Formulas are plan
//! Appendix C:
//!   n ≈ Kv·V_eff·u · T = C_T·ρ·n²·D⁴ · Q = C_Q·ρ·n²·D⁵
//!   V_eff = V₀ − I·R_int · endurance ≈ 0.8·C / I_avg
//!   complementary estimator: θ̂ = α(θ̂ + ω·dt) + (1−α)·θ_accel
//!
//! Rapier world coupling lands at P6 (P6-001); these models are engine-agnostic.

#![forbid(unsafe_code)]

pub mod export;
pub mod heavy;
pub mod interop;
pub mod rapier;
pub mod runtime;
pub mod thrust_table;
pub mod training;

use forge_contract::{Archetype, CatalogComponent, CatalogSource, Estimator, ModelSpec};
use forge_geometry::BakedModel;
use serde::{Deserialize, Serialize};
use thrust_table::ThrustTable;

/// Nominal LiPo cell voltage (stated assumption, surfaced in the HUD).
pub const NOMINAL_CELL_V: f64 = 3.7;
/// Default static thrust coefficient when no thrust table is published
/// (blade-element-lite placeholder; XC-06 replaces this with table interpolation).
pub const DEFAULT_CT: f64 = 0.11;
/// Rotor figure of merit (induced → shaft power), stated assumption.
pub const FIGURE_OF_MERIT: f64 = 0.7;
/// Electrical efficiency motor+ESC, stated assumption.
pub const ELECTRICAL_EFF: f64 = 0.85;
/// Usable battery capacity convention from Appendix C (endurance ≈ 0.8·C/I).
pub const USABLE_CAPACITY: f64 = 0.8;

// ---------------------------------------------------------------------------
// propulsion
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowertrainPoint {
    /// Per-motor thrust, newtons.
    pub thrust_n: f64,
    /// Per-motor electrical current, amperes.
    pub current_a: f64,
    /// Effective voltage after sag, volts.
    pub v_eff: f64,
    /// Rotor speed, rev/s.
    pub n_rev_s: f64,
}

#[derive(Debug, Clone)]
pub struct Powertrain {
    pub motor_kv: f64,
    pub motor_r_ohm: f64,
    pub battery_v0: f64,
    pub battery_r_ohm: f64,
    pub prop_d_m: f64,
    pub ct: f64,
    pub n_motors: usize,
    pub air_density: f64,
    /// Published bench data (XC-06): when present, the table is truth and the
    /// C_T estimate path retires.
    pub table: Option<ThrustTable>,
}

impl Powertrain {
    /// Build the deterministic browser/fixture powertrain from inline
    /// ModelSpec constants. Catalog-only contracts fail closed because the
    /// browser facade deliberately has no mutable catalog authority.
    pub fn from_inline_spec(spec: &ModelSpec) -> Result<Self, String> {
        let battery =
            spec.sim.battery.as_ref().ok_or_else(|| {
                "policy observation requires inline battery constants".to_string()
            })?;
        let prop = spec.sim.props.first().ok_or_else(|| {
            "policy observation requires an inline prop specification".to_string()
        })?;
        if spec.sim.motors.is_empty() {
            return Err("policy observation requires inline motor constants".to_string());
        }
        let mut kv_sum = 0.0;
        let mut resistance_sum = 0.0;
        for motor in &spec.sim.motors {
            kv_sum += motor
                .kv
                .ok_or_else(|| "policy observation requires every motor kv inline".to_string())?;
            resistance_sum += motor.r_int_mohm.ok_or_else(|| {
                "policy observation requires every motor resistance inline".to_string()
            })? / 1000.0;
        }
        let motor_count = spec.sim.motors.len();
        Ok(Powertrain {
            motor_kv: kv_sum / motor_count as f64,
            motor_r_ohm: resistance_sum / motor_count as f64,
            battery_v0: battery.cells as f64 * NOMINAL_CELL_V,
            battery_r_ohm: battery.r_int_mohm / 1000.0,
            prop_d_m: prop.diameter_in * 0.0254,
            ct: DEFAULT_CT,
            n_motors: motor_count,
            air_density: spec.env.air_density,
            table: None,
        })
    }

    /// Evaluate the powertrain at throttle u ∈ [0,1]. Battery sag is resolved by
    /// fixed-point iteration on V_eff (converges in a handful of steps for sane
    /// configurations).
    pub fn at_throttle(&self, u: f64) -> PowertrainPoint {
        let u = u.clamp(0.0, 1.0);
        if let Some(table) = &self.table {
            return self.at_throttle_table(u, table);
        }
        let disc_area = std::f64::consts::PI * self.prop_d_m * self.prop_d_m / 4.0;
        let mut v_eff = self.battery_v0;
        let mut point = PowertrainPoint {
            thrust_n: 0.0,
            current_a: 0.0,
            v_eff,
            n_rev_s: 0.0,
        };
        for _ in 0..12 {
            let n_rev_s = (self.motor_kv * v_eff * u / 60.0).max(0.0);
            let thrust = self.ct * self.air_density * n_rev_s * n_rev_s * self.prop_d_m.powi(4);
            // induced power (momentum theory) → shaft via FM → electrical via η
            let p_ind = if thrust > 0.0 {
                forge_num::pow(thrust, 1.5) / (2.0 * self.air_density * disc_area).sqrt()
            } else {
                0.0
            };
            let p_elec = p_ind / (FIGURE_OF_MERIT * ELECTRICAL_EFF);
            let i_motor = if v_eff > 1e-6 { p_elec / v_eff } else { 0.0 };
            let i_total = i_motor * self.n_motors as f64;
            let next_v =
                (self.battery_v0 - i_total * self.battery_r_ohm - i_motor * self.motor_r_ohm)
                    .max(0.5 * self.battery_v0);
            point = PowertrainPoint {
                thrust_n: thrust,
                current_a: i_motor,
                v_eff: next_v,
                n_rev_s,
            };
            if (next_v - v_eff).abs() < 1e-6 {
                break;
            }
            v_eff = next_v;
        }
        point
    }

    /// Table-driven evaluation: thrust and current come from bench data at
    /// (V_eff, u); sag still resolves by fixed point on V_eff.
    fn at_throttle_table(&self, u: f64, table: &ThrustTable) -> PowertrainPoint {
        let mut v_eff = self.battery_v0;
        let mut point = PowertrainPoint {
            thrust_n: 0.0,
            current_a: 0.0,
            v_eff,
            n_rev_s: 0.0,
        };
        for _ in 0..12 {
            let (thrust, i_motor) = table.lookup(v_eff, u);
            let i_total = i_motor * self.n_motors as f64;
            let next_v =
                (self.battery_v0 - i_total * self.battery_r_ohm - i_motor * self.motor_r_ohm)
                    .max(0.5 * self.battery_v0);
            let n_rev_s = (self.motor_kv * next_v * u / 60.0).max(0.0);
            point = PowertrainPoint {
                thrust_n: thrust,
                current_a: i_motor,
                v_eff: next_v,
                n_rev_s,
            };
            if (next_v - v_eff).abs() < 1e-6 {
                break;
            }
            v_eff = next_v;
        }
        point
    }
}

// ---------------------------------------------------------------------------
// estimator-in-sim (D8)
// ---------------------------------------------------------------------------

/// Deterministic LCG noise source (no external RNG dep; golden-number friendly).
#[derive(Debug, Clone)]
pub struct NoiseLcg {
    state: u64,
}

impl NoiseLcg {
    pub fn new(seed: u64) -> Self {
        NoiseLcg {
            state: seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407),
        }
    }
    pub fn next_unit(&mut self) -> f64 {
        self.state = self
            .state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        ((self.state >> 11) as f64) / ((1u64 << 53) as f64)
    }
    /// Approximately normal(0,1) via Irwin–Hall (sum of 12 uniforms − 6).
    pub fn next_normal(&mut self) -> f64 {
        (0..12).map(|_| self.next_unit()).sum::<f64>() - 6.0
    }
}

/// Complementary attitude filter (Appendix C). Policies observe THIS output,
/// never ground truth (D8 / SIM-004).
#[derive(Debug, Clone)]
pub struct ComplementaryFilter {
    pub alpha: f64,
    pub theta_hat: f64,
    gyro_bias: f64,
    gyro_noise: f64,
    accel_noise: f64,
    last_gyro: f64,
    noise: NoiseLcg,
}

impl ComplementaryFilter {
    pub fn from_spec(est: &Estimator, seed: u64) -> Self {
        ComplementaryFilter {
            alpha: 0.98,
            theta_hat: 0.0,
            gyro_bias: est.bias,
            gyro_noise: est.gyro_noise,
            accel_noise: est.accel_noise,
            last_gyro: 0.0,
            noise: NoiseLcg::new(seed),
        }
    }

    /// Step with true gyro rate (rad/s) and true accel-derived angle (rad);
    /// sensor corruption (bias + noise) is injected inside — the caller never
    /// hands the policy ground truth.
    pub fn step(&mut self, true_rate: f64, true_accel_angle: f64, dt: f64) -> f64 {
        let gyro = true_rate + self.gyro_bias + self.gyro_noise * self.noise.next_normal();
        let accel = true_accel_angle + self.accel_noise * self.noise.next_normal();
        self.last_gyro = gyro;
        self.theta_hat = self.alpha * (self.theta_hat + gyro * dt) + (1.0 - self.alpha) * accel;
        self.theta_hat
    }

    /// Last corrupted gyro sample presented to the estimator. Policies may
    /// consume this sensor-side value; simulator truth remains private.
    pub fn last_gyro(&self) -> f64 {
        self.last_gyro
    }
}

// ---------------------------------------------------------------------------
// HUD — derived, never decorative
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hud {
    /// All-up weight, grams (Σ part masses).
    pub auw_g: f64,
    /// Thrust-to-weight at full throttle (multirotor only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub twr: Option<f64>,
    /// Hover throttle u ∈ [0,1] if a hover trim exists (SIM-001).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hover_throttle: Option<f64>,
    /// Total current at hover, amperes.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hover_current_a: Option<f64>,
    /// Endurance at hover, minutes (0.8·C/I convention).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endurance_min: Option<f64>,
    /// Max total thrust, gram-force.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_thrust_g: Option<f64>,
    /// Every modeling assumption behind the numbers (doctrine #4).
    pub assumptions: Vec<String>,
}

#[derive(Debug)]
pub enum HudError {
    MissingBattery,
    MissingMotors,
    MissingMotorKv,
    MissingProps,
    CatalogRowIncomplete(String),
}

impl std::fmt::Display for HudError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            HudError::MissingBattery => "sim.battery required for powertrain HUD",
            HudError::MissingMotors => "sim.motors required for powertrain HUD",
            HudError::MissingMotorKv => {
                "motor kv unavailable (inline kv or resolved catalog ref required)"
            }
            HudError::MissingProps => "sim.props required for powertrain HUD",
            HudError::CatalogRowIncomplete(id) => {
                return write!(f, "catalog row '{id}' is incomplete for HUD derivation");
            }
        };
        write!(f, "{s}")
    }
}

impl std::error::Error for HudError {}

/// Derive the HUD from a contract + its bake. Non-multirotor archetypes get
/// AUW only (their powertrain analytics land with their drivers).
pub fn derive_hud(spec: &ModelSpec, baked: &BakedModel) -> Result<Hud, HudError> {
    derive_hud_inner(spec, baked, None)
}

/// P3 catalog-backed HUD derivation. Resolved catalog rows override inline sim
/// constants while inline values remain the authoring fallback for generated
/// or synthetic examples.
pub fn derive_hud_with_catalog(
    spec: &ModelSpec,
    baked: &BakedModel,
    catalog: &dyn CatalogSource,
) -> Result<Hud, HudError> {
    derive_hud_inner(spec, baked, Some(catalog))
}

fn derive_hud_inner(
    spec: &ModelSpec,
    baked: &BakedModel,
    catalog: Option<&dyn CatalogSource>,
) -> Result<Hud, HudError> {
    let mut auw_g = forge_geometry::model_mass_g(spec, baked);
    let mut assumptions = vec![
        "masses: geometry × material-class density unless a part states valueG/densityKgm3"
            .to_string(),
    ];
    if let Some(catalog) = catalog {
        let equipped = catalog_equipped_mass_g(spec, catalog);
        if equipped > 0.0 {
            auw_g += equipped;
            assumptions.push(format!(
                "catalog-equipped component masses included in AUW: +{equipped:.1} g"
            ));
        }
    }

    if !matches!(spec.meta.archetype, Archetype::Multirotor) {
        return Ok(Hud {
            auw_g,
            twr: None,
            hover_throttle: None,
            hover_current_a: None,
            endurance_min: None,
            max_thrust_g: None,
            assumptions,
        });
    }

    let catalog_battery = catalog.and_then(|c| first_catalog_component(spec, c, "battery"));
    let catalog_motor = catalog.and_then(|c| first_catalog_component(spec, c, "motor"));
    let catalog_prop = catalog.and_then(|c| first_catalog_component(spec, c, "prop"));

    let battery = resolve_battery(spec, catalog_battery.as_ref())?;
    if spec.sim.motors.is_empty() {
        return Err(HudError::MissingMotors);
    }
    let prop = resolve_prop(spec, catalog_prop.as_ref())?;
    let kv = resolve_motor_kv(spec, catalog_motor.as_ref())?;
    let motor_r = resolve_motor_r_ohm(spec);
    let mut table_rejections = Vec::new();
    let mut applicable_tables = Vec::new();
    if let Some(motor) = catalog_motor.as_ref() {
        for candidate in &motor.thrust_tables {
            let reasons = thrust_table_inapplicability(candidate, &battery, &prop);
            if !reasons.is_empty() {
                table_rejections.push(format!(
                    "catalog bench table {} not used: {}",
                    candidate.id,
                    reasons.join("; ")
                ));
                continue;
            }
            let points: Vec<thrust_table::ThrustPoint> = candidate
                .points
                .iter()
                .map(|p| thrust_table::ThrustPoint {
                    voltage: p.voltage,
                    throttle: p.throttle,
                    thrust_n: p.thrust_n,
                    current_a: p.current_a,
                })
                .collect();
            match ThrustTable::from_points(&points) {
                Ok(table) => applicable_tables.push((candidate.id.clone(), table)),
                Err(error) => {
                    table_rejections.push(format!(
                        "catalog bench table {} not used: invalid rectangular grid ({error})",
                        candidate.id
                    ));
                }
            }
        }
    }
    let table = match applicable_tables.len() {
        0 => None,
        1 => applicable_tables.pop().map(|(_, table)| table),
        _ => {
            table_rejections.push(format!(
                "catalog bench tables {} not used: multiple applicable tables are ambiguous",
                applicable_tables
                    .iter()
                    .map(|(id, _)| id.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
            None
        }
    };

    let pt = Powertrain {
        motor_kv: kv,
        motor_r_ohm: motor_r,
        battery_v0: battery.cells as f64 * NOMINAL_CELL_V,
        battery_r_ohm: battery.r_int_mohm / 1000.0,
        prop_d_m: prop.diameter_in * 0.0254,
        ct: DEFAULT_CT,
        n_motors: spec.sim.motors.len(),
        air_density: spec.env.air_density,
        table,
    };

    assumptions.push(format!(
        "battery V0 = cells × {NOMINAL_CELL_V} V nominal; sag via R_int fixed point"
    ));
    if let Some(row) = catalog_battery.as_ref() {
        assumptions.push(format!(
            "battery constants resolved from catalog row {} ({})",
            row.id, row.model
        ));
    }
    if let Some(row) = catalog_motor.as_ref() {
        assumptions.push(format!(
            "motor constants resolved from catalog row {} ({})",
            row.id, row.model
        ));
    }
    if pt.table.is_some() {
        assumptions.push("thrust/current from an applicability-checked catalog bench table".into());
    } else {
        assumptions.push(format!(
            "C_T = {DEFAULT_CT} blade-element-lite default (no thrust table)"
        ));
    }
    assumptions.extend(table_rejections);
    assumptions.push(format!(
        "power: momentum theory, figure of merit {FIGURE_OF_MERIT}, electrical η {ELECTRICAL_EFF}"
    ));
    assumptions.push(format!(
        "endurance = {USABLE_CAPACITY}·C / I_hover (usable-capacity rule)"
    ));

    let weight_n = auw_g / 1000.0 * spec.env.gravity;
    let full = pt.at_throttle(1.0);
    let max_thrust_n = full.thrust_n * pt.n_motors as f64;
    let twr = max_thrust_n / weight_n;

    // hover trim: bisect total thrust = weight (thrust is monotonic in u)
    let hover = if max_thrust_n > weight_n {
        let (mut lo, mut hi) = (0.0f64, 1.0f64);
        for _ in 0..60 {
            let mid = 0.5 * (lo + hi);
            let t = pt.at_throttle(mid).thrust_n * pt.n_motors as f64;
            if t < weight_n {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        Some(0.5 * (lo + hi))
    } else {
        None
    };

    let (hover_current, endurance) = match hover {
        Some(u) => {
            let p = pt.at_throttle(u);
            let i_total = p.current_a * pt.n_motors as f64;
            let hours = USABLE_CAPACITY * (battery.capacity_mah / 1000.0) / i_total.max(1e-9);
            (Some(i_total), Some(hours * 60.0))
        }
        None => (None, None),
    };

    Ok(Hud {
        auw_g,
        twr: Some(twr),
        hover_throttle: hover,
        hover_current_a: hover_current,
        endurance_min: endurance,
        max_thrust_g: Some(max_thrust_n / spec.env.gravity * 1000.0),
        assumptions,
    })
}

#[derive(Debug, Clone, Copy)]
struct ResolvedBattery {
    cells: u32,
    capacity_mah: f64,
    r_int_mohm: f64,
    min_voltage_v: f64,
    max_voltage_v: f64,
}

#[derive(Debug, Clone, Copy)]
struct ResolvedProp {
    diameter_in: f64,
    pitch_in: f64,
    blades: u32,
}

fn first_catalog_component(
    spec: &ModelSpec,
    catalog: &dyn CatalogSource,
    category: &str,
) -> Option<CatalogComponent> {
    for slot in &spec.slots {
        let Some(component_ref) = slot
            .equipped_variant()
            .and_then(|variant| variant.component_ref.as_ref())
        else {
            continue;
        };
        let Some(pin) = spec.lockfile.get(component_ref) else {
            continue;
        };
        let Some((id, _)) = pin.rsplit_once('@') else {
            continue;
        };
        let Some(component) = catalog.component(id) else {
            continue;
        };
        if component.category == category {
            return Some(component);
        }
    }
    None
}

fn catalog_equipped_mass_g(spec: &ModelSpec, catalog: &dyn CatalogSource) -> f64 {
    let mut total = 0.0;
    for slot in &spec.slots {
        let quantity = slot.mount_nodes.len().max(1) as f64;
        let Some(component_ref) = slot
            .equipped_variant()
            .and_then(|variant| variant.component_ref.as_ref())
        else {
            continue;
        };
        let Some(pin) = spec.lockfile.get(component_ref) else {
            continue;
        };
        let Some((id, _)) = pin.rsplit_once('@') else {
            continue;
        };
        if let Some(component) = catalog.component(id) {
            total += component.mass_g * quantity;
        }
    }
    total
}

fn resolve_battery(
    spec: &ModelSpec,
    catalog_battery: Option<&CatalogComponent>,
) -> Result<ResolvedBattery, HudError> {
    let inline = spec.sim.battery.as_ref();
    if let Some(row) = catalog_battery {
        let capacity_mah = row
            .elec
            .capacity_mah
            .or_else(|| inline.map(|b| b.capacity_mah))
            .ok_or_else(|| HudError::CatalogRowIncomplete(row.id.clone()))?;
        let cells = row
            .elec
            .v_min
            .map(|v| (v / NOMINAL_CELL_V).round().max(1.0) as u32)
            .or_else(|| inline.map(|b| b.cells))
            .ok_or_else(|| HudError::CatalogRowIncomplete(row.id.clone()))?;
        let r_int_mohm = inline.map(|b| b.r_int_mohm).unwrap_or(0.0);
        return Ok(ResolvedBattery {
            cells,
            capacity_mah,
            r_int_mohm,
            min_voltage_v: row
                .elec
                .v_min
                .ok_or_else(|| HudError::CatalogRowIncomplete(row.id.clone()))?,
            max_voltage_v: row
                .elec
                .v_max
                .ok_or_else(|| HudError::CatalogRowIncomplete(row.id.clone()))?,
        });
    }
    let battery = inline.ok_or(HudError::MissingBattery)?;
    Ok(ResolvedBattery {
        cells: battery.cells,
        capacity_mah: battery.capacity_mah,
        r_int_mohm: battery.r_int_mohm,
        min_voltage_v: battery.cells as f64 * NOMINAL_CELL_V,
        max_voltage_v: battery.cells as f64 * 4.2,
    })
}

fn resolve_prop(
    spec: &ModelSpec,
    catalog_prop: Option<&CatalogComponent>,
) -> Result<ResolvedProp, HudError> {
    if let Some(row) = catalog_prop {
        if let (Some(diameter_in), Some(pitch_in), Some(blades)) = (
            row.mech.prop_diameter_in,
            row.mech.pitch_in,
            row.mech.blades,
        ) {
            return Ok(ResolvedProp {
                diameter_in,
                pitch_in,
                blades,
            });
        }
        return Err(HudError::CatalogRowIncomplete(row.id.clone()));
    }
    let prop = spec.sim.props.first().ok_or(HudError::MissingProps)?;
    Ok(ResolvedProp {
        diameter_in: prop.diameter_in,
        pitch_in: prop.pitch_in,
        blades: prop.blades,
    })
}

fn parsed_table_prop(value: &str) -> Option<(f64, f64)> {
    let normalized = value.trim().to_ascii_lowercase().replace(' ', "");
    let (diameter, pitch) = normalized.split_once('x')?;
    let diameter = diameter.parse::<f64>().ok()?;
    let pitch = pitch.parse::<f64>().ok()?;
    (diameter.is_finite() && pitch.is_finite() && diameter > 0.0 && pitch > 0.0)
        .then_some((diameter, pitch))
}

fn thrust_table_inapplicability(
    table: &forge_contract::CatalogThrustTable,
    battery: &ResolvedBattery,
    prop: &ResolvedProp,
) -> Vec<String> {
    let mut reasons = Vec::new();
    let min_table_voltage = table
        .points
        .iter()
        .map(|point| point.voltage)
        .fold(f64::INFINITY, f64::min);
    let max_table_voltage = table
        .points
        .iter()
        .map(|point| point.voltage)
        .fold(f64::NEG_INFINITY, f64::max);
    if !min_table_voltage.is_finite()
        || !max_table_voltage.is_finite()
        || min_table_voltage > battery.min_voltage_v + 1e-9
        || max_table_voltage < battery.max_voltage_v - 1e-9
    {
        reasons.push(format!(
            "voltage grid [{min_table_voltage:.3}, {max_table_voltage:.3}] V does not cover equipped battery [{:.3}, {:.3}] V",
            battery.min_voltage_v, battery.max_voltage_v
        ));
    }
    match parsed_table_prop(&table.prop) {
        Some((diameter, pitch))
            if (diameter - prop.diameter_in).abs() <= 1e-9
                && (pitch - prop.pitch_in).abs() <= 1e-9 => {}
        Some((diameter, pitch)) => reasons.push(format!(
            "bench prop {diameter}x{pitch} does not match equipped prop {}x{}",
            prop.diameter_in, prop.pitch_in
        )),
        None => reasons.push(format!(
            "bench prop '{}' is not a canonical diameter×pitch authority",
            table.prop
        )),
    }
    if prop.blades == 0 {
        reasons.push("equipped prop blade count is not positive".to_string());
    }
    reasons
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct CatalogTrainingTableApplicability {
    pub id: String,
    pub used_for_curve: bool,
    pub inapplicability_reasons: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct CatalogTrainingPowertrain {
    pub powertrain: Powertrain,
    pub max_total_current_a: f64,
    pub table_applicability: Vec<CatalogTrainingTableApplicability>,
    pub inline_fallbacks: Vec<String>,
    pub battery_operating_voltage_v: [f64; 2],
    pub prop_diameter_in: f64,
    pub prop_pitch_in: f64,
    pub prop_blades: u32,
    pub prop_source: String,
}

fn resolve_motor_kv(
    spec: &ModelSpec,
    catalog_motor: Option<&CatalogComponent>,
) -> Result<f64, HudError> {
    if let Some(row) = catalog_motor {
        return row
            .elec
            .kv
            .ok_or_else(|| HudError::CatalogRowIncomplete(row.id.clone()));
    }
    spec.sim
        .motors
        .iter()
        .filter_map(|m| m.kv)
        .next()
        .ok_or(HudError::MissingMotorKv)
}

fn resolve_motor_r_ohm(spec: &ModelSpec) -> f64 {
    spec.sim
        .motors
        .iter()
        .filter_map(|m| m.r_int_mohm)
        .next()
        .unwrap_or(0.0)
        / 1000.0
}

/// Catalog-bound powertrain authority for the multirotor training bundle
/// major. Equipped motor and battery rows are mandatory. A bench table drives
/// the curve only when its voltage grid covers the battery range and its prop
/// matches exactly; otherwise the artifact names every inline fallback.
pub(crate) fn catalog_training_powertrain(
    spec: &ModelSpec,
    catalog: &dyn CatalogSource,
) -> Result<CatalogTrainingPowertrain, String> {
    if spec.sim.motors.is_empty() {
        return Err("catalog training requires inline motor mounts".to_string());
    }
    let motor = first_catalog_component(spec, catalog, "motor")
        .ok_or_else(|| "catalog training requires an equipped motor row".to_string())?;
    let battery = first_catalog_component(spec, catalog, "battery")
        .ok_or_else(|| "catalog training requires an equipped battery row".to_string())?;
    let resolved_battery =
        resolve_battery(spec, Some(&battery)).map_err(|error| error.to_string())?;
    let catalog_prop = first_catalog_component(spec, catalog, "prop");
    let prop = resolve_prop(spec, catalog_prop.as_ref()).map_err(|error| error.to_string())?;
    let motor_kv = motor
        .elec
        .kv
        .ok_or_else(|| format!("catalog motor row '{}' lacks kv authority", motor.id))?;
    let mut inline_fallbacks = vec![
        "sim.battery.rIntMohm".to_string(),
        "sim.motors[].rIntMohm".to_string(),
    ];
    if motor.thrust_tables.is_empty() {
        return Err(format!(
            "catalog motor row '{}' lacks a thrust table authority",
            motor.id
        ));
    }
    let assessments = motor
        .thrust_tables
        .iter()
        .map(|table| thrust_table_inapplicability(table, &resolved_battery, &prop))
        .collect::<Vec<_>>();
    let applicable_indexes = assessments
        .iter()
        .enumerate()
        .filter_map(|(index, reasons)| reasons.is_empty().then_some(index))
        .collect::<Vec<_>>();
    if applicable_indexes.len() > 1 {
        return Err(format!(
            "catalog motor row '{}' has multiple applicable thrust tables; curve authority is ambiguous",
            motor.id
        ));
    }
    let selected_index = applicable_indexes.first().copied();
    let selected_table = if let Some(index) = selected_index {
        let points = motor.thrust_tables[index]
            .points
            .iter()
            .map(|point| thrust_table::ThrustPoint {
                voltage: point.voltage,
                throttle: point.throttle,
                thrust_n: point.thrust_n,
                current_a: point.current_a,
            })
            .collect::<Vec<_>>();
        Some(
            ThrustTable::from_points(&points)
                .map_err(|error| format!("catalog motor thrust table is invalid: {error}"))?,
        )
    } else {
        None
    };
    let table_applicability = motor
        .thrust_tables
        .iter()
        .zip(assessments)
        .enumerate()
        .map(
            |(index, (table, reasons))| CatalogTrainingTableApplicability {
                id: table.id.clone(),
                used_for_curve: Some(index) == selected_index,
                inapplicability_reasons: reasons,
            },
        )
        .collect();
    let per_motor_current_a = if selected_table.is_some() {
        motor.elec.max_current_a.ok_or_else(|| {
            format!(
                "catalog motor row '{}' lacks maximum-current authority",
                motor.id
            )
        })?
    } else {
        inline_fallbacks.extend([
            "sim.motors[].maxCurrentA".to_string(),
            "sim.props[0].diameterIn,pitchIn,blades".to_string(),
            "forge-sim.DEFAULT_CT".to_string(),
        ]);
        spec.sim
            .motors
            .iter()
            .filter_map(|motor| motor.max_current_a)
            .reduce(f64::min)
            .ok_or_else(|| {
                "catalog training needs an inline motor current fallback when no bench table is applicable"
                    .to_string()
            })?
    };
    let mut max_total_current_a = per_motor_current_a * spec.sim.motors.len() as f64;
    if let Some(discharge_limit) = battery.elec.max_discharge_a {
        max_total_current_a = max_total_current_a.min(discharge_limit);
    }
    if !max_total_current_a.is_finite() || max_total_current_a <= 0.0 {
        return Err("catalog training current authority is not positive finite".to_string());
    }
    Ok(CatalogTrainingPowertrain {
        powertrain: Powertrain {
            motor_kv,
            motor_r_ohm: resolve_motor_r_ohm(spec),
            battery_v0: resolved_battery.cells as f64 * NOMINAL_CELL_V,
            battery_r_ohm: resolved_battery.r_int_mohm / 1000.0,
            prop_d_m: prop.diameter_in * 0.0254,
            ct: DEFAULT_CT,
            n_motors: spec.sim.motors.len(),
            air_density: spec.env.air_density,
            table: selected_table,
        },
        max_total_current_a,
        table_applicability,
        inline_fallbacks,
        battery_operating_voltage_v: [
            resolved_battery.min_voltage_v,
            resolved_battery.max_voltage_v,
        ],
        prop_diameter_in: prop.diameter_in,
        prop_pitch_in: prop.pitch_in,
        prop_blades: prop.blades,
        prop_source: catalog_prop
            .map(|component| format!("catalog:{}", component.id))
            .unwrap_or_else(|| "inline:sim.props[0]".to_string()),
    })
}

// ---------------------------------------------------------------------------
// replay envelope (D17): {contract hash + lockfile, env, seed, input tape}
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayHeader {
    pub contract_hash: String,
    pub lockfile_hash: String,
    pub env: forge_contract::EnvBlock,
    pub seed: u64,
    pub schema_version: String,
}

impl ReplayHeader {
    pub fn for_spec(spec: &ModelSpec, seed: u64) -> Self {
        ReplayHeader {
            contract_hash: forge_contract::contract_hash(spec),
            lockfile_hash: forge_contract::lockfile_hash(spec),
            env: spec.env.clone(),
            seed,
            schema_version: forge_contract::SCHEMA_VERSION.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use forge_contract::{
        validate_shape, CatalogComponent, CatalogThrustPoint, CatalogThrustTable,
    };

    #[test]
    fn bench_table_applicability_requires_voltage_coverage_and_exact_prop() {
        let battery = ResolvedBattery {
            cells: 4,
            capacity_mah: 1500.0,
            r_int_mohm: 18.0,
            min_voltage_v: 14.8,
            max_voltage_v: 16.8,
        };
        let prop = ResolvedProp {
            diameter_in: 5.0,
            pitch_in: 4.3,
            blades: 3,
        };
        let table = |prop: &str, voltages: &[f64]| CatalogThrustTable {
            id: "applicability".to_string(),
            prop: prop.to_string(),
            voltage: voltages[0],
            confidence: 1.0,
            source_url: "https://example.invalid/table".to_string(),
            points: voltages
                .iter()
                .flat_map(|voltage| {
                    [0.0, 1.0].map(|throttle| CatalogThrustPoint {
                        voltage: *voltage,
                        throttle,
                        thrust_n: throttle * 10.0,
                        current_a: throttle * 20.0,
                    })
                })
                .collect(),
        };
        assert!(
            thrust_table_inapplicability(&table("5x4.3", &[14.8, 16.8]), &battery, &prop)
                .is_empty()
        );
        let wrong_voltage = thrust_table_inapplicability(&table("5x4.3", &[25.2]), &battery, &prop);
        assert_eq!(wrong_voltage.len(), 1);
        assert!(wrong_voltage[0].contains("does not cover"));
        let wrong_prop =
            thrust_table_inapplicability(&table("5x4.6", &[14.8, 16.8]), &battery, &prop);
        assert_eq!(wrong_prop.len(), 1);
        assert!(wrong_prop[0].contains("does not match"));
    }

    struct VariantCatalog;
    impl CatalogSource for VariantCatalog {
        fn has_revision(&self, component_id: &str, revision: &str) -> bool {
            matches!(
                (component_id, revision),
                ("cmp_selected", "1.0.0") | ("cmp_spare", "1.0.0")
            )
        }

        fn component(&self, component_id: &str) -> Option<CatalogComponent> {
            let (category, mass_g) = match component_id {
                "cmp_selected" => ("battery", 25.0),
                "cmp_spare" => ("motor", 900.0),
                _ => return None,
            };
            Some(CatalogComponent {
                id: component_id.to_string(),
                category: category.to_string(),
                mass_g,
                ..CatalogComponent::default()
            })
        }
    }

    fn catalog_variant_spec() -> ModelSpec {
        validate_shape(
            &serde_json::json!({
              "meta":{"id":"catalog-variants","name":"catalog variants","version":"2.2.0",
                      "archetype":"rover","provenance":{"kind":"human"},"license":"CC0"},
              "skeleton":[{"name":"root","parent":null,"pos":[0,0,0]}],
              "parts":[{"node":"root","geom":{"kind":"box","w":0.1,"h":0.1,"d":0.1},
                        "material":"matte","color":"#111111","mass":{"valueG":10}}],
              "slots":[{"id":"power","label":"Power","mountNodes":["root","root"],
                "equippedVariantId":"selected","variants":[
                  {"id":"selected","componentRef":"cmp_selected@^1"},
                  {"id":"spare","componentRef":"cmp_spare@^1"}
                ]}],
              "lockfile":{
                "cmp_selected@^1":"cmp_selected@1.0.0",
                "cmp_spare@^1":"cmp_spare@1.0.0"
              },
              "driver":{"archetype":"rover","params":{}}
            })
            .to_string(),
        )
        .unwrap()
    }

    fn inline_variant_spec(equipped: &str) -> ModelSpec {
        validate_shape(
            &serde_json::json!({
              "meta":{"id":"inline-variants","name":"inline variants","version":"2.2.0",
                      "archetype":"rover","provenance":{"kind":"human"},"license":"CC0"},
              "skeleton":[{"name":"root","parent":null,"pos":[0,0,0]}],
              "parts":[{"node":"root","geom":{"kind":"box","w":0.1,"h":0.1,"d":0.1},
                        "material":"matte","color":"#111111","collision":"primitive",
                        "mass":{"valueG":10}}],
              "slots":[{"id":"payload","label":"Payload","mountNodes":["root"],
                "equippedVariantId":equipped,"variants":[
                  {"id":"selected","parts":[
                    {"node":"root","geom":{"kind":"box","w":0.02,"h":0.02,"d":0.02},
                     "material":"matte","color":"#222222","collision":"primitive",
                     "mass":{"valueG":2}}
                  ]},
                  {"id":"spare","parts":[
                    {"node":"root","geom":{"kind":"cyl","r0":0.015,"h":0.03,"n":16},
                     "material":"metal","color":"#333333","collision":"primitive",
                     "mass":{"valueG":7}},
                    {"node":"root","geom":{"kind":"box","w":0.03,"h":0.01,"d":0.03},
                     "material":"matte","color":"#444444","collision":"primitive",
                     "mass":{"valueG":8}}
                  ]}
                ]}],
              "driver":{"archetype":"rover","params":{}}
            })
            .to_string(),
        )
        .unwrap()
    }

    fn quad_spec() -> ModelSpec {
        validate_shape(
            r##"{
          "meta":{"id":"q","name":"q","version":"2.1.0","archetype":"multirotor",
                  "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[
            {"name":"root","parent":null,"pos":[0,0.1,0]},
            {"name":"m0","parent":"root","pos":[0.106,0.018,0.106]},
            {"name":"m1","parent":"root","pos":[-0.106,0.018,0.106]},
            {"name":"m2","parent":"root","pos":[-0.106,0.018,-0.106]},
            {"name":"m3","parent":"root","pos":[0.106,0.018,-0.106]}
          ],
          "parts":[
            {"node":"root","geom":{"kind":"cbox","w":0.16,"h":0.03,"d":0.16,"ch":0.02},
             "material":"matte","color":"#222222","mass":{"valueG":650}}
          ],
          "driver":{"archetype":"multirotor","params":{}},
          "sim":{
            "battery":{"cells":4,"capacity_mAh":1500,"r_int_mohm":18},
            "motors":[
              {"kv":1750,"r_int_mohm":60,"maxCurrentA":30,"mount":"m0"},
              {"kv":1750,"r_int_mohm":60,"maxCurrentA":30,"mount":"m1"},
              {"kv":1750,"r_int_mohm":60,"maxCurrentA":30,"mount":"m2"},
              {"kv":1750,"r_int_mohm":60,"maxCurrentA":30,"mount":"m3"}
            ],
            "props":[{"diameterIn":5.0,"pitchIn":4.3,"blades":3}]
          }
        }"##,
        )
        .unwrap()
    }

    #[test]
    fn thrust_is_monotonic_in_throttle_and_sag_lowers_voltage() {
        let pt = Powertrain {
            motor_kv: 1750.0,
            motor_r_ohm: 0.06,
            battery_v0: 14.8,
            battery_r_ohm: 0.018,
            prop_d_m: 0.127,
            ct: DEFAULT_CT,
            n_motors: 4,
            air_density: 1.225,
            table: None,
        };
        let mut last = -1.0;
        for k in 0..=10 {
            let p = pt.at_throttle(k as f64 / 10.0);
            assert!(p.thrust_n >= last, "monotonic thrust");
            last = p.thrust_n;
        }
        let p_low = pt.at_throttle(0.2);
        let p_high = pt.at_throttle(1.0);
        assert!(p_high.v_eff < p_low.v_eff, "more current → more sag");
    }

    #[test]
    fn hud_finds_plausible_hover_for_a_5in_quad() {
        let spec = quad_spec();
        let baked = forge_geometry::bake(&spec).unwrap();
        let hud = derive_hud(&spec, &baked).unwrap();
        let twr = hud.twr.unwrap();
        assert!(twr > 1.8 && twr < 8.0, "freestyle-plausible TWR, got {twr}");
        let hover = hud.hover_throttle.expect("hover trim exists");
        assert!(hover > 0.2 && hover < 0.75, "SIM-001 window, got {hover}");
        let endurance = hud.endurance_min.unwrap();
        assert!(
            endurance > 2.0 && endurance < 60.0,
            "sane endurance, got {endurance}"
        );
        assert!(!hud.assumptions.is_empty(), "assumptions are inspectable");
    }

    #[test]
    fn auw_only_for_non_multirotor() {
        let spec = validate_shape(
            r##"{"meta":{"id":"r","name":"r","version":"2.1.0","archetype":"rover",
                 "provenance":{"kind":"human"},"license":"CC0"},
                 "skeleton":[{"name":"root","parent":null,"pos":[0,0,0]}],
                 "parts":[{"node":"root","geom":{"kind":"box","w":0.2,"h":0.05,"d":0.3},
                           "material":"matte","color":"#333333","mass":{"valueG":500}}],
                 "driver":{"archetype":"rover","params":{}}}"##,
        )
        .unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let hud = derive_hud(&spec, &baked).unwrap();
        assert!((hud.auw_g - 500.0).abs() < 1e-9);
        assert!(hud.twr.is_none());
    }

    #[test]
    fn catalog_mass_and_category_use_only_the_equipped_alternative() {
        let spec = catalog_variant_spec();
        assert_eq!(catalog_equipped_mass_g(&spec, &VariantCatalog), 50.0);
        let battery = first_catalog_component(&spec, &VariantCatalog, "battery").unwrap();
        assert_eq!(battery.id, "cmp_selected");
        assert!(first_catalog_component(&spec, &VariantCatalog, "motor").is_none());

        let baked = forge_geometry::bake(&spec).unwrap();
        let hud = derive_hud_with_catalog(&spec, &baked, &VariantCatalog).unwrap();
        assert!((hud.auw_g - 60.0).abs() < 1e-9);
    }

    #[test]
    fn sim_runtime_and_exports_use_only_the_equipped_inline_alternative() {
        let selected = inline_variant_spec("selected");
        let selected_bake = forge_geometry::bake(&selected).unwrap();
        assert_eq!(selected_bake.parts.len(), 2);
        assert_eq!(
            selected_bake.parts[1].source_path,
            "/slots/0/variants/0/parts/0"
        );

        let selected_scene = runtime::compile_rapier_fixture(&selected, &selected_bake);
        assert_eq!(selected_scene.collider_count, 2);
        assert!((selected_scene.bodies[0].mass_kg - 0.012).abs() < 1e-9);
        let selected_fit = heavy::fit_compound_colliders(&selected, &selected_bake);
        assert_eq!(selected_fit.collider_count, 2);
        let selected_world = rapier::RapierWorld::from_contract(
            &selected,
            &selected_bake,
            rapier::RapierWorldConfig::default(),
        )
        .unwrap();
        assert_eq!(selected_world.scene().collider_count, 2);

        let selected_urdf = export::to_urdf(&selected, &selected_bake);
        assert_eq!(selected_urdf.matches("<visual>").count(), 2);
        assert_eq!(selected_urdf.matches("<collision>").count(), 2);
        assert!(selected_urdf.contains("<mass value=\"0.012\"/>"));
        let selected_mjcf = export::to_mjcf(&selected, &selected_bake);
        assert_eq!(selected_mjcf.matches("<geom ").count(), 2);
        assert!(selected_mjcf.contains("mass=\"0.012\""));

        let spare = inline_variant_spec("spare");
        let spare_bake = forge_geometry::bake(&spare).unwrap();
        assert_eq!(spare_bake.parts.len(), 3);
        assert_eq!(
            spare_bake.parts[1].source_path,
            "/slots/0/variants/1/parts/0"
        );
        assert_eq!(
            spare_bake.parts[2].source_path,
            "/slots/0/variants/1/parts/1"
        );

        let spare_scene = runtime::compile_rapier_fixture(&spare, &spare_bake);
        assert_eq!(spare_scene.collider_count, 3);
        assert!((spare_scene.bodies[0].mass_kg - 0.025).abs() < 1e-9);
        assert_eq!(
            heavy::fit_compound_colliders(&spare, &spare_bake).collider_count,
            3
        );
        assert!(rapier::RapierWorld::from_contract(
            &spare,
            &spare_bake,
            rapier::RapierWorldConfig::default(),
        )
        .is_ok());

        let spare_urdf = export::to_urdf(&spare, &spare_bake);
        assert_eq!(spare_urdf.matches("<visual>").count(), 3);
        assert_eq!(spare_urdf.matches("<collision>").count(), 3);
        assert!(spare_urdf.contains("<mass value=\"0.025\"/>"));
        let spare_mjcf = export::to_mjcf(&spare, &spare_bake);
        assert_eq!(spare_mjcf.matches("<geom ").count(), 3);
        assert!(spare_mjcf.contains("mass=\"0.025\""));
    }

    #[test]
    fn estimator_tracks_and_never_exposes_ground_truth_path() {
        let est = Estimator {
            kind: forge_contract::EstimatorKind::Complementary,
            gyro_noise: 0.02,
            accel_noise: 0.08,
            bias: 0.01,
            latency_ms: 8.0,
        };
        let mut f = ComplementaryFilter::from_spec(&est, 42);
        let truth = 0.3f64;
        let mut last = 0.0;
        for _ in 0..2000 {
            last = f.step(0.0, truth, 1.0 / 120.0);
        }
        assert!(
            (last - truth).abs() < 0.1,
            "converges near truth, got {last}"
        );
        // determinism: same seed → same trajectory (golden-number friendly)
        let mut f2 = ComplementaryFilter::from_spec(&est, 42);
        let mut last2 = 0.0;
        for _ in 0..2000 {
            last2 = f2.step(0.0, truth, 1.0 / 120.0);
        }
        assert_eq!(
            last.to_bits(),
            last2.to_bits(),
            "bit-identical with same seed"
        );
    }

    #[test]
    fn table_overrides_estimate_and_hover_matches_closed_form() {
        use crate::thrust_table::{ThrustPoint, ThrustTable};
        // bench data: thrust = 8·u N per motor (voltage-independent), I = 10·u A
        let mut pts = Vec::new();
        for v in [12.0, 16.8] {
            for k in 0..=10 {
                let u = k as f64 / 10.0;
                pts.push(ThrustPoint {
                    voltage: v,
                    throttle: u,
                    thrust_n: 8.0 * u,
                    current_a: 10.0 * u,
                });
            }
        }
        let pt = Powertrain {
            motor_kv: 1750.0,
            motor_r_ohm: 0.0,
            battery_v0: 14.8,
            battery_r_ohm: 0.0,
            prop_d_m: 0.127,
            ct: DEFAULT_CT,
            n_motors: 4,
            air_density: 1.225,
            table: Some(ThrustTable::from_points(&pts).unwrap()),
        };
        // hover for 1.2 kg at g=9.80665: per-motor T = 2.94 N → u = T/8 = 0.3678
        let weight_n: f64 = 1.2 * 9.80665;
        let per_motor = weight_n / 4.0;
        let (mut lo, mut hi) = (0.0f64, 1.0f64);
        for _ in 0..50 {
            let mid = 0.5 * (lo + hi);
            if pt.at_throttle(mid).thrust_n < per_motor {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        let u = 0.5 * (lo + hi);
        assert!(
            (u - per_motor / 8.0).abs() < 1e-3,
            "u {u} vs {}",
            per_motor / 8.0
        );
        // current comes from the table, not the momentum-theory estimate
        let p = pt.at_throttle(u);
        assert!((p.current_a - 10.0 * u).abs() < 1e-6);
    }

    #[test]
    fn replay_header_carries_hashes() {
        let spec = quad_spec();
        let h = ReplayHeader::for_spec(&spec, 7);
        assert_eq!(h.contract_hash.len(), 64);
        assert_eq!(h.schema_version, forge_contract::SCHEMA_VERSION);
    }
}
