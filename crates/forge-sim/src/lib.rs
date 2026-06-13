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
pub mod thrust_table;

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
            noise: NoiseLcg::new(seed),
        }
    }

    /// Step with true gyro rate (rad/s) and true accel-derived angle (rad);
    /// sensor corruption (bias + noise) is injected inside — the caller never
    /// hands the policy ground truth.
    pub fn step(&mut self, true_rate: f64, true_accel_angle: f64, dt: f64) -> f64 {
        let gyro = true_rate + self.gyro_bias + self.gyro_noise * self.noise.next_normal();
        let accel = true_accel_angle + self.accel_noise * self.noise.next_normal();
        self.theta_hat = self.alpha * (self.theta_hat + gyro * dt) + (1.0 - self.alpha) * accel;
        self.theta_hat
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
    let table = catalog_motor
        .as_ref()
        .and_then(|m| m.thrust_tables.first())
        .and_then(|t| {
            let points: Vec<thrust_table::ThrustPoint> = t
                .points
                .iter()
                .map(|p| thrust_table::ThrustPoint {
                    voltage: p.voltage,
                    throttle: p.throttle,
                    thrust_n: p.thrust_n,
                    current_a: p.current_a,
                })
                .collect();
            ThrustTable::from_points(&points).ok()
        });

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
        assumptions
            .push("thrust/current from catalog bench table; edge-clamped interpolation".into());
    } else {
        assumptions.push(format!(
            "C_T = {DEFAULT_CT} blade-element-lite default (no thrust table)"
        ));
    }
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
}

#[derive(Debug, Clone, Copy)]
struct ResolvedProp {
    diameter_in: f64,
}

fn first_catalog_component(
    spec: &ModelSpec,
    catalog: &dyn CatalogSource,
    category: &str,
) -> Option<CatalogComponent> {
    for slot in &spec.slots {
        for variant in &slot.variants {
            let Some(component_ref) = &variant.component_ref else {
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
    }
    None
}

fn catalog_equipped_mass_g(spec: &ModelSpec, catalog: &dyn CatalogSource) -> f64 {
    let mut total = 0.0;
    for slot in &spec.slots {
        let quantity = slot.mount_nodes.len().max(1) as f64;
        for variant in &slot.variants {
            let Some(component_ref) = &variant.component_ref else {
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
        });
    }
    let battery = inline.ok_or(HudError::MissingBattery)?;
    Ok(ResolvedBattery {
        cells: battery.cells,
        capacity_mah: battery.capacity_mah,
        r_int_mohm: battery.r_int_mohm,
    })
}

fn resolve_prop(
    spec: &ModelSpec,
    catalog_prop: Option<&CatalogComponent>,
) -> Result<ResolvedProp, HudError> {
    if let Some(row) = catalog_prop {
        if let Some(diameter_in) = row.mech.prop_diameter_in {
            return Ok(ResolvedProp { diameter_in });
        }
        return Err(HudError::CatalogRowIncomplete(row.id.clone()));
    }
    let prop = spec.sim.props.first().ok_or(HudError::MissingProps)?;
    Ok(ResolvedProp {
        diameter_in: prop.diameter_in,
    })
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
    use forge_contract::validate_shape;

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
