//! Contract-derived MuJoCo training bundle for the P7 worker runtime.
//!
//! The Rust core remains authoritative for geometry, mass, powertrain, estimator
//! configuration, coordinate conversion, and executable policy tensor metadata.
//! Python owns the Gymnasium/SB3 orchestration, but it must consume this bounded
//! bundle rather than reinterpret a user-authored contract.

use forge_contract::{
    Archetype, CatalogComponent, CatalogSource, EstimatorKind, Geom, JointKind, ModelSpec,
};
use forge_geometry::BakedModel;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const TRAINING_BUNDLE_VERSION: &str = "2.0.0";
pub const CATALOG_TRAINING_BUNDLE_VERSION: &str = "4.0.0";
pub const CATALOG_TRAINING_PHYSICS_SCHEMA: &str = "forge-training-catalog-physics";
pub const CATALOG_TRAINING_PHYSICS_VERSION: &str = "2.0.0";
pub const CATALOG_TRAINING_CURVE_READBACK_SCHEMA: &str = "forge-training-catalog-curve-readback";
pub const CATALOG_TRAINING_CURVE_READBACK_VERSION: &str = "1.0.0";
pub const POLICY_TENSOR_SCHEMA: &str = "forge-policy-tensor";
pub const POLICY_TENSOR_VERSION: &str = "2.0.0";
pub const TRAINING_MUJOCO_VERSION: &str = "3.9.0";
pub const POLICY_RATE_HZ: u32 = 50;
pub const MUJOCO_SUBSTEPS: u32 = 4;
pub const MUJOCO_TIMESTEP_S: f64 = 1.0 / (POLICY_RATE_HZ as f64 * MUJOCO_SUBSTEPS as f64);

pub const MULTIROTOR_POLICY_INPUT_LAYOUT: [&str; 14] = [
    "estimator.attitude.rollRad",
    "estimator.attitude.pitchRad",
    "estimator.attitude.yawRad",
    "estimator.angularRate.rollRadS",
    "estimator.angularRate.pitchRadS",
    "estimator.angularRate.yawRadS",
    "estimator.linearVelocity.bodyXMps",
    "estimator.linearVelocity.bodyYMps",
    "estimator.linearVelocity.bodyZMps",
    "target.error.bodyXM",
    "target.error.bodyYM",
    "target.error.bodyZM",
    "battery.normalizedVoltage",
    "powertrain.normalizedMotorCurrent",
];

pub const MULTIROTOR_POLICY_OUTPUT_LAYOUT: [&str; 4] = ["throttle", "roll", "pitch", "yaw"];
pub const GROUND_TRAINING_BUNDLE_VERSION: &str = "1.0.0";
pub const GROUND_POLICY_TENSOR_SCHEMA: &str = "forge-ground-policy-tensor";
pub const GROUND_POLICY_TENSOR_VERSION: &str = "1.0.0";
pub const GROUND_POLICY_INPUT_LAYOUT: [&str; 11] = [
    "estimator.attitude.rollRad",
    "estimator.attitude.pitchRad",
    "estimator.attitude.yawRad",
    "estimator.angularRate.rollRadS",
    "estimator.angularRate.pitchRadS",
    "estimator.angularRate.yawRadS",
    "estimator.linearVelocity.bodyXMps",
    "estimator.linearVelocity.bodyZMps",
    "target.error.bodyXM",
    "target.error.bodyZM",
    "actuation.normalizedEffort",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingTensorAxis {
    pub name: String,
    pub shape: Vec<usize>,
    pub layout: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingTensorContract {
    pub schema: String,
    pub schema_version: String,
    pub coordinate_frame: String,
    pub input: TrainingTensorAxis,
    pub output: TrainingTensorAxis,
    pub rate_hz: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingPowerPoint {
    pub throttle: f64,
    pub total_thrust_n: f64,
    pub normalized_voltage: f64,
    pub normalized_current: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingPowertrain {
    pub nominal_voltage_v: f64,
    pub max_total_current_a: f64,
    pub curve: Vec<TrainingPowerPoint>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingControlAuthority {
    pub arm_radius_m: f64,
    pub tilt_max_rad: f64,
    pub yaw_rate_rad_s: f64,
    pub max_roll_pitch_torque_nm: f64,
    pub max_yaw_torque_nm: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingEstimator {
    pub gyro_noise: f64,
    pub accel_noise: f64,
    pub bias: f64,
    pub latency_ms: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingBundle {
    pub artifact_kind: String,
    pub schema_version: String,
    pub contract_hash: String,
    pub archetype: String,
    pub mujoco_version: String,
    pub root_body_name: String,
    pub mjcf: String,
    pub timestep_s: f64,
    pub control_period_s: f64,
    pub substeps: u32,
    pub mass_kg: f64,
    pub gravity_m_s2: f64,
    pub hover_throttle: f64,
    pub tensor: TrainingTensorContract,
    pub estimator: TrainingEstimator,
    pub powertrain: TrainingPowertrain,
    pub control: TrainingControlAuthority,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub catalog_physics: Option<Box<TrainingCatalogPhysics>>,
    pub assumptions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CatalogTrainingAuthority {
    pub catalog_authority_sha256: String,
    pub row_sha256: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingCatalogGeometry {
    pub model: String,
    pub size_m: [f64; 3],
    pub center_of_mass_m: [f64; 3],
    /// Forge-frame `[ixx, iyy, izz, ixy, iyz, ixz]`, kg·m², for one item.
    pub inertia_kg_m2: [f64; 6],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingCatalogThrustPointAuthority {
    pub voltage_v: f64,
    pub throttle: f64,
    pub thrust_n: f64,
    pub current_a: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingCatalogThrustTableAuthority {
    pub id: String,
    pub row_schema_version: String,
    pub prop: String,
    pub voltage_v: f64,
    pub voltage_range_v: [f64; 2],
    pub confidence: f64,
    pub source_url: String,
    pub point_count: usize,
    pub points: Vec<TrainingCatalogThrustPointAuthority>,
    pub used_for_curve: bool,
    pub inapplicability_reasons: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingCatalogCurveReadback {
    pub schema_version: String,
    pub selected_table_id: Option<String>,
    pub table_driven: bool,
    pub curve_point_count: usize,
    pub motor_count: usize,
    pub max_total_current_a: f64,
    pub battery_nominal_voltage_v: f64,
    pub battery_resistance_ohm: f64,
    pub motor_resistance_ohm: f64,
    pub fixed_point_iterations: u32,
    pub convergence_tolerance_v: f64,
    pub minimum_voltage_fraction: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingCatalogPropAuthority {
    pub diameter_in: f64,
    pub pitch_in: f64,
    pub blades: u32,
    pub source: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingCatalogComponent {
    pub slot_id: String,
    pub variant_id: String,
    pub component_ref: String,
    pub exact_revision: String,
    pub component_id: String,
    pub category: String,
    pub row_sha256: String,
    pub mount_nodes: Vec<String>,
    pub quantity: usize,
    pub mass_kg_each: f64,
    pub geometry: TrainingCatalogGeometry,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub thrust_tables: Vec<TrainingCatalogThrustTableAuthority>,
    pub review_required: bool,
    pub license_id: String,
    pub license_class: String,
    pub license_source_url: String,
    pub export_policy: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingCatalogPhysics {
    pub schema_version: String,
    pub catalog_authority_sha256: String,
    pub base_contract_mass_kg: f64,
    pub equipped_catalog_mass_kg: f64,
    pub total_mass_kg: f64,
    pub inertia_model: String,
    pub powertrain_model: String,
    pub inline_fallbacks: Vec<String>,
    pub battery_operating_voltage_v: [f64; 2],
    pub equipped_prop: TrainingCatalogPropAuthority,
    pub curve_readback: TrainingCatalogCurveReadback,
    pub components: Vec<TrainingCatalogComponent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundTrainingJoint {
    pub name: String,
    pub motor_name: String,
    pub side: String,
    pub lower_rad: f64,
    pub upper_rad: f64,
    pub max_torque_nm: f64,
    pub max_velocity_rad_s: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundTrainingControl {
    pub mode: String,
    pub joints: Vec<GroundTrainingJoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wheel_radius_m: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub track_width_m: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroundTrainingBundle {
    pub artifact_kind: String,
    pub schema_version: String,
    pub contract_hash: String,
    pub archetype: String,
    pub mujoco_version: String,
    pub root_body_name: String,
    pub mjcf: String,
    pub timestep_s: f64,
    pub control_period_s: f64,
    pub substeps: u32,
    pub mass_kg: f64,
    pub gravity_m_s2: f64,
    pub tensor: TrainingTensorContract,
    pub estimator: TrainingEstimator,
    pub control: GroundTrainingControl,
    pub assumptions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AnyTrainingBundle {
    Multirotor(TrainingBundle),
    Ground(GroundTrainingBundle),
}

impl AnyTrainingBundle {
    pub fn archetype(&self) -> &str {
        match self {
            Self::Multirotor(bundle) => &bundle.archetype,
            Self::Ground(bundle) => &bundle.archetype,
        }
    }

    pub fn mass_kg(&self) -> f64 {
        match self {
            Self::Multirotor(bundle) => bundle.mass_kg,
            Self::Ground(bundle) => bundle.mass_kg,
        }
    }

    pub fn mujoco_version(&self) -> &str {
        match self {
            Self::Multirotor(bundle) => &bundle.mujoco_version,
            Self::Ground(bundle) => &bundle.mujoco_version,
        }
    }

    pub fn tensor_version(&self) -> &str {
        match self {
            Self::Multirotor(bundle) => &bundle.tensor.schema_version,
            Self::Ground(bundle) => &bundle.tensor.schema_version,
        }
    }
}

pub fn multirotor_training_bundle(
    spec: &ModelSpec,
    baked: &BakedModel,
    contract_hash: &str,
) -> Result<TrainingBundle, String> {
    if !matches!(spec.meta.archetype, Archetype::Multirotor) {
        return Err("P7 training bundle currently supports admitted multirotors only".to_string());
    }
    if contract_hash.len() != 64 || !contract_hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("training bundle contract hash must be 64 hexadecimal characters".to_string());
    }
    let roots: Vec<_> = spec
        .skeleton
        .iter()
        .filter(|node| node.parent.is_none())
        .collect();
    if roots.len() != 1 {
        return Err("P7 multirotor training requires exactly one root body".to_string());
    }
    let estimator = spec
        .sim
        .estimator
        .as_ref()
        .ok_or_else(|| "P7 training requires an explicit estimator block (D8)".to_string())?;
    if !matches!(estimator.kind, EstimatorKind::Complementary) {
        return Err("P7 1.0.0 training supports the complementary estimator only".to_string());
    }

    let powertrain = crate::Powertrain::from_inline_spec(spec)?;
    let max_total_current_a = spec
        .sim
        .motors
        .iter()
        .map(|motor| {
            motor
                .max_current_a
                .ok_or_else(|| "P7 training requires every motor current limit inline".to_string())
        })
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .sum::<f64>();
    if !max_total_current_a.is_finite() || max_total_current_a <= 0.0 {
        return Err("P7 training requires a positive total motor current limit".to_string());
    }

    let mass_kg = forge_geometry::model_mass_g(spec, baked) / 1000.0;
    if !mass_kg.is_finite() || mass_kg <= 0.0 {
        return Err("P7 training requires positive computed model mass".to_string());
    }
    let hud = crate::derive_hud(spec, baked).map_err(|error| error.to_string())?;
    let hover_throttle = hud
        .hover_throttle
        .ok_or_else(|| "P7 training requires a contract-derived hover trim".to_string())?;

    let root_world = baked
        .node_world
        .get(&roots[0].name)
        .ok_or_else(|| "training root is absent from the baked transform table".to_string())?;
    let arm_radius_m = spec
        .sim
        .motors
        .iter()
        .map(|motor| {
            let world = baked.node_world.get(&motor.mount).ok_or_else(|| {
                format!(
                    "training motor mount '{}' is absent from the bake",
                    motor.mount
                )
            })?;
            let dx = world[12] - root_world[12];
            let dz = world[14] - root_world[14];
            Ok((dx * dx + dz * dz).sqrt())
        })
        .collect::<Result<Vec<f64>, String>>()?
        .into_iter()
        .fold(0.0_f64, f64::max);
    if !arm_radius_m.is_finite() || arm_radius_m <= 0.0 {
        return Err("P7 training requires non-zero motor arm radius".to_string());
    }

    let curve = (0..=100)
        .map(|step| {
            let throttle = f64::from(step) / 100.0;
            let point = powertrain.at_throttle(throttle);
            TrainingPowerPoint {
                throttle,
                total_thrust_n: point.thrust_n * powertrain.n_motors as f64,
                normalized_voltage: (point.v_eff / powertrain.battery_v0).clamp(0.0, 1.0),
                normalized_current: (point.current_a * powertrain.n_motors as f64
                    / max_total_current_a)
                    .clamp(0.0, 1.0),
            }
        })
        .collect::<Vec<_>>();
    let max_thrust_n = curve
        .last()
        .map(|point| point.total_thrust_n)
        .unwrap_or(0.0);
    if !max_thrust_n.is_finite() || max_thrust_n <= mass_kg * spec.env.gravity {
        return Err("P7 training requires thrust authority above computed weight".to_string());
    }

    let max_roll_pitch_torque_nm = max_thrust_n * arm_radius_m * 0.5;
    let max_yaw_torque_nm = max_thrust_n * (powertrain.prop_d_m * 0.5) * 0.02;
    let tilt_max_rad = spec
        .driver
        .params
        .get("tiltMaxRad")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(0.4);
    let yaw_rate_rad_s = spec
        .driver
        .params
        .get("yawRate")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(2.4);
    if !tilt_max_rad.is_finite()
        || !yaw_rate_rad_s.is_finite()
        || tilt_max_rad <= 0.0
        || yaw_rate_rad_s <= 0.0
    {
        return Err(
            "P7 training requires positive finite multirotor flight-target bounds".to_string(),
        );
    }
    let mjcf = crate::export::to_mjcf_with_options(
        spec,
        baked,
        crate::export::MjcfExportOptions {
            floating_roots: true,
            timestep_s: Some(MUJOCO_TIMESTEP_S),
            euler_integrator: true,
        },
    )?;

    Ok(TrainingBundle {
        artifact_kind: "trainingMuJoCoBundle".to_string(),
        schema_version: TRAINING_BUNDLE_VERSION.to_string(),
        contract_hash: contract_hash.to_ascii_lowercase(),
        archetype: "multirotor".to_string(),
        mujoco_version: TRAINING_MUJOCO_VERSION.to_string(),
        root_body_name: roots[0].name.clone(),
        mjcf,
        timestep_s: MUJOCO_TIMESTEP_S,
        control_period_s: 1.0 / f64::from(POLICY_RATE_HZ),
        substeps: MUJOCO_SUBSTEPS,
        mass_kg,
        gravity_m_s2: spec.env.gravity,
        hover_throttle,
        tensor: TrainingTensorContract {
            schema: POLICY_TENSOR_SCHEMA.to_string(),
            schema_version: POLICY_TENSOR_VERSION.to_string(),
            coordinate_frame: "forge-y-up-rh-m".to_string(),
            input: TrainingTensorAxis {
                name: "observations".to_string(),
                shape: vec![1, MULTIROTOR_POLICY_INPUT_LAYOUT.len()],
                layout: MULTIROTOR_POLICY_INPUT_LAYOUT
                    .iter()
                    .map(|value| (*value).to_string())
                    .collect(),
            },
            output: TrainingTensorAxis {
                name: "actions".to_string(),
                shape: vec![1, MULTIROTOR_POLICY_OUTPUT_LAYOUT.len()],
                layout: MULTIROTOR_POLICY_OUTPUT_LAYOUT
                    .iter()
                    .map(|value| (*value).to_string())
                    .collect(),
            },
            rate_hz: POLICY_RATE_HZ,
        },
        estimator: TrainingEstimator {
            gyro_noise: estimator.gyro_noise,
            accel_noise: estimator.accel_noise,
            bias: estimator.bias,
            latency_ms: estimator.latency_ms,
        },
        powertrain: TrainingPowertrain {
            nominal_voltage_v: powertrain.battery_v0,
            max_total_current_a,
            curve,
        },
        control: TrainingControlAuthority {
            arm_radius_m,
            tilt_max_rad,
            yaw_rate_rad_s,
            max_roll_pitch_torque_nm,
            max_yaw_torque_nm,
        },
        catalog_physics: None,
        assumptions: vec![
            "MuJoCo consumes forge-sim contract geometry, mass properties, gravity, and a floating root at four physics substeps per 50 Hz policy action".to_string(),
            "thrust, voltage, and current are sampled from forge-sim's inline-constant powertrain model; catalog-only authority fails closed".to_string(),
            "roll/pitch authority is a conservative differential-thrust bound; yaw uses an explicit 2% prop-radius drag-torque proxy pending sourced torque tables".to_string(),
            "normalized roll/pitch/yaw outputs are flight targets consumed by a task-versioned deterministic inner loop; zero collective maps to contract-derived hover trim".to_string(),
            "the worker exposes estimator-derived observations only; simulator truth remains private (D8)".to_string(),
        ],
    })
}

fn lower_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
}

fn catalog_component_geometry(
    component: &CatalogComponent,
) -> Result<TrainingCatalogGeometry, String> {
    let mass_kg = component.mass_g / 1000.0;
    if !mass_kg.is_finite() || mass_kg <= 0.0 {
        return Err(format!(
            "catalog training component '{}' has invalid sourced mass",
            component.id
        ));
    }
    let (model, size_m, inertia_kg_m2) = if let (Some(diameter_mm), Some(height_mm)) = (
        component.dims.get("diameterMm"),
        component.dims.get("heightMm"),
    ) {
        let diameter_m = diameter_mm / 1000.0;
        let height_m = height_mm / 1000.0;
        if !diameter_m.is_finite() || !height_m.is_finite() || diameter_m <= 0.0 || height_m <= 0.0
        {
            return Err(format!(
                "catalog training component '{}' has invalid cylinder dimensions",
                component.id
            ));
        }
        let radius_m = diameter_m * 0.5;
        let transverse = mass_kg * (3.0 * radius_m * radius_m + height_m * height_m) / 12.0;
        let axial = 0.5 * mass_kg * radius_m * radius_m;
        (
            "uniform-cylinder-y".to_string(),
            [diameter_m, height_m, diameter_m],
            [transverse, axial, transverse, 0.0, 0.0, 0.0],
        )
    } else if let (Some(length_mm), Some(width_mm), Some(height_mm)) = (
        component.dims.get("lengthMm"),
        component.dims.get("widthMm"),
        component.dims.get("heightMm"),
    ) {
        let x = width_mm / 1000.0;
        let y = height_mm / 1000.0;
        let z = length_mm / 1000.0;
        if !x.is_finite() || !y.is_finite() || !z.is_finite() || x <= 0.0 || y <= 0.0 || z <= 0.0 {
            return Err(format!(
                "catalog training component '{}' has invalid box dimensions",
                component.id
            ));
        }
        (
            "uniform-box-x-width-y-height-z-length".to_string(),
            [x, y, z],
            [
                mass_kg * (y * y + z * z) / 12.0,
                mass_kg * (x * x + z * z) / 12.0,
                mass_kg * (x * x + y * y) / 12.0,
                0.0,
                0.0,
                0.0,
            ],
        )
    } else {
        return Err(format!(
            "catalog training component '{}' lacks supported sourced dimensions",
            component.id
        ));
    };
    Ok(TrainingCatalogGeometry {
        model,
        size_m,
        center_of_mass_m: [0.0; 3],
        inertia_kg_m2,
    })
}

fn catalog_training_physics(
    spec: &ModelSpec,
    baked: &BakedModel,
    catalog: &dyn CatalogSource,
    authority: &CatalogTrainingAuthority,
    powertrain: &crate::CatalogTrainingPowertrain,
) -> Result<(TrainingCatalogPhysics, Vec<crate::export::LumpedInertial>), String> {
    if !lower_sha256(&authority.catalog_authority_sha256) {
        return Err("catalog training authority must be a lower-case SHA-256".to_string());
    }
    let mut components = Vec::new();
    let mut lumped = Vec::new();
    let mut equipped_catalog_mass_kg = 0.0;
    for slot in &spec.slots {
        let Some(variant) = slot.equipped_variant() else {
            return Err(format!(
                "catalog training slot '{}' has no unique equipped variant",
                slot.id
            ));
        };
        let Some(component_ref) = variant.component_ref.as_ref() else {
            continue;
        };
        let exact_revision = spec.lockfile.get(component_ref).ok_or_else(|| {
            format!(
                "catalog training ref '{}' lacks an exact lockfile pin",
                component_ref
            )
        })?;
        let (component_id, _) = exact_revision.rsplit_once('@').ok_or_else(|| {
            format!(
                "catalog training pin '{}' is not component@revision",
                exact_revision
            )
        })?;
        let component = catalog.component(component_id).ok_or_else(|| {
            format!(
                "catalog training component '{}' is absent from authority",
                component_id
            )
        })?;
        let row_sha256 = authority.row_sha256.get(component_id).ok_or_else(|| {
            format!(
                "catalog training component '{}' lacks raw-row authority",
                component_id
            )
        })?;
        if !lower_sha256(row_sha256) {
            return Err(format!(
                "catalog training row hash for '{}' is invalid",
                component_id
            ));
        }
        if slot.mount_nodes.is_empty() {
            return Err(format!(
                "catalog training slot '{}' has no physical mount nodes",
                slot.id
            ));
        }
        let geometry = catalog_component_geometry(&component)?;
        let mass_kg_each = component.mass_g / 1000.0;
        for node in &slot.mount_nodes {
            if spec.node(node).is_none() {
                return Err(format!(
                    "catalog training mount node '{}' is absent from the contract",
                    node
                ));
            }
            lumped.push(crate::export::LumpedInertial {
                node: node.clone(),
                mass_kg: mass_kg_each,
                com_m: geometry.center_of_mass_m,
                inertia_kg_m2: geometry.inertia_kg_m2,
            });
        }
        let quantity = slot.mount_nodes.len();
        equipped_catalog_mass_kg += mass_kg_each * quantity as f64;
        let thrust_tables = component
            .thrust_tables
            .iter()
            .map(|table| {
                let applicability = powertrain
                    .table_applicability
                    .iter()
                    .find(|entry| entry.id == table.id)
                    .ok_or_else(|| {
                        format!(
                            "catalog thrust table '{}' lacks applicability authority",
                            table.id
                        )
                    })?;
                Ok(TrainingCatalogThrustTableAuthority {
                    id: table.id.clone(),
                    row_schema_version: component.row_schema_version.clone(),
                    prop: table.prop.clone(),
                    voltage_v: table.voltage,
                    voltage_range_v: [
                        table
                            .points
                            .iter()
                            .map(|point| point.voltage)
                            .fold(f64::INFINITY, f64::min),
                        table
                            .points
                            .iter()
                            .map(|point| point.voltage)
                            .fold(f64::NEG_INFINITY, f64::max),
                    ],
                    confidence: table.confidence,
                    source_url: table.source_url.clone(),
                    point_count: table.points.len(),
                    points: table
                        .points
                        .iter()
                        .map(|point| TrainingCatalogThrustPointAuthority {
                            voltage_v: point.voltage,
                            throttle: point.throttle,
                            thrust_n: point.thrust_n,
                            current_a: point.current_a,
                        })
                        .collect(),
                    used_for_curve: applicability.used_for_curve,
                    inapplicability_reasons: applicability.inapplicability_reasons.clone(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        components.push(TrainingCatalogComponent {
            slot_id: slot.id.clone(),
            variant_id: variant.id.clone(),
            component_ref: component_ref.clone(),
            exact_revision: exact_revision.clone(),
            component_id: component_id.to_string(),
            category: component.category.clone(),
            row_sha256: row_sha256.clone(),
            mount_nodes: slot.mount_nodes.clone(),
            quantity,
            mass_kg_each,
            geometry,
            thrust_tables,
            review_required: component.confidence < 1.0 || component.review.is_some(),
            license_id: component.license.id.clone(),
            license_class: component.license.class.clone(),
            license_source_url: component.license.source_url.clone(),
            export_policy: component.license.export_policy.clone(),
        });
    }
    if components.is_empty() {
        return Err(
            "catalog training requires at least one equipped catalog component".to_string(),
        );
    }
    let motor_components = components
        .iter()
        .filter(|component| component.category == "motor")
        .collect::<Vec<_>>();
    if motor_components.len() != 1 || motor_components[0].quantity != spec.sim.motors.len() {
        return Err(
            "catalog training requires one equipped motor row whose mounts exactly match sim.motors"
                .to_string(),
        );
    }
    let battery_components = components
        .iter()
        .filter(|component| component.category == "battery")
        .collect::<Vec<_>>();
    if battery_components.len() != 1 || battery_components[0].quantity != 1 {
        return Err(
            "catalog training requires exactly one singly mounted equipped battery row".to_string(),
        );
    }
    components.sort_by(|left, right| left.slot_id.cmp(&right.slot_id));
    let base_contract_mass_kg = forge_geometry::model_mass_g(spec, baked) / 1000.0;
    let total_mass_kg = base_contract_mass_kg + equipped_catalog_mass_kg;
    let selected_table_id = powertrain
        .table_applicability
        .iter()
        .find(|table| table.used_for_curve)
        .map(|table| table.id.clone());
    Ok((
        TrainingCatalogPhysics {
            schema_version: format!(
                "{CATALOG_TRAINING_PHYSICS_SCHEMA}/{CATALOG_TRAINING_PHYSICS_VERSION}"
            ),
            catalog_authority_sha256: authority.catalog_authority_sha256.clone(),
            base_contract_mass_kg,
            equipped_catalog_mass_kg,
            total_mass_kg,
            inertia_model: "uniform-datasheet-solid-lumped-at-slot-mount-v1".to_string(),
            powertrain_model: if powertrain
                .table_applicability
                .iter()
                .any(|table| table.used_for_curve)
            {
                "catalog-motor-battery-exact-grid-readback-v2".to_string()
            } else {
                "catalog-motor-battery-analytic-fallback-rejected-bench-table-v1".to_string()
            },
            inline_fallbacks: powertrain.inline_fallbacks.clone(),
            battery_operating_voltage_v: powertrain.battery_operating_voltage_v,
            equipped_prop: TrainingCatalogPropAuthority {
                diameter_in: powertrain.prop_diameter_in,
                pitch_in: powertrain.prop_pitch_in,
                blades: powertrain.prop_blades,
                source: powertrain.prop_source.clone(),
            },
            curve_readback: TrainingCatalogCurveReadback {
                schema_version: format!(
                    "{CATALOG_TRAINING_CURVE_READBACK_SCHEMA}/{CATALOG_TRAINING_CURVE_READBACK_VERSION}"
                ),
                table_driven: selected_table_id.is_some(),
                selected_table_id,
                curve_point_count: 101,
                motor_count: powertrain.powertrain.n_motors,
                max_total_current_a: powertrain.max_total_current_a,
                battery_nominal_voltage_v: powertrain.powertrain.battery_v0,
                battery_resistance_ohm: powertrain.powertrain.battery_r_ohm,
                motor_resistance_ohm: powertrain.powertrain.motor_r_ohm,
                fixed_point_iterations: 12,
                convergence_tolerance_v: 1e-6,
                minimum_voltage_fraction: 0.5,
            },
            components,
        },
        lumped,
    ))
}

pub fn multirotor_training_bundle_with_catalog(
    spec: &ModelSpec,
    baked: &BakedModel,
    contract_hash: &str,
    catalog: &dyn CatalogSource,
    authority: &CatalogTrainingAuthority,
) -> Result<TrainingBundle, String> {
    let mut bundle = multirotor_training_bundle(spec, baked, contract_hash)?;
    let powertrain_authority = crate::catalog_training_powertrain(spec, catalog)?;
    let (catalog_physics, lumped) =
        catalog_training_physics(spec, baked, catalog, authority, &powertrain_authority)?;
    let hud = crate::derive_hud_with_catalog(spec, baked, catalog)
        .map_err(|error| format!("catalog training HUD authority failed: {error}"))?;
    let mass_kg = hud.auw_g / 1000.0;
    if (mass_kg - catalog_physics.total_mass_kg).abs() > 1e-12 {
        return Err("catalog training mass disagrees with catalog-backed HUD truth".to_string());
    }
    let powertrain = &powertrain_authority.powertrain;
    let max_total_current_a = powertrain_authority.max_total_current_a;
    let curve = (0..=100)
        .map(|step| {
            let throttle = f64::from(step) / 100.0;
            let point = powertrain.at_throttle(throttle);
            TrainingPowerPoint {
                throttle,
                total_thrust_n: point.thrust_n * powertrain.n_motors as f64,
                normalized_voltage: (point.v_eff / powertrain.battery_v0).clamp(0.0, 1.0),
                normalized_current: (point.current_a * powertrain.n_motors as f64
                    / max_total_current_a)
                    .clamp(0.0, 1.0),
            }
        })
        .collect::<Vec<_>>();
    let max_thrust_n = curve
        .last()
        .map(|point| point.total_thrust_n)
        .unwrap_or(0.0);
    if !max_thrust_n.is_finite() || max_thrust_n <= mass_kg * spec.env.gravity {
        return Err("catalog training powertrain lacks authority above sourced weight".to_string());
    }
    let hover_throttle = {
        let weight_n = mass_kg * spec.env.gravity;
        let (mut low, mut high) = (0.0, 1.0);
        for _ in 0..60 {
            let mid = 0.5 * (low + high);
            if powertrain.at_throttle(mid).thrust_n * (powertrain.n_motors as f64) < weight_n {
                low = mid;
            } else {
                high = mid;
            }
        }
        0.5 * (low + high)
    };
    let mjcf = crate::export::to_mjcf_with_options_and_lumped_inertials(
        spec,
        baked,
        crate::export::MjcfExportOptions {
            floating_roots: true,
            timestep_s: Some(MUJOCO_TIMESTEP_S),
            euler_integrator: true,
        },
        &lumped,
    )?;
    bundle.schema_version = CATALOG_TRAINING_BUNDLE_VERSION.to_string();
    bundle.mjcf = mjcf;
    bundle.mass_kg = mass_kg;
    bundle.hover_throttle = hover_throttle;
    bundle.powertrain = TrainingPowertrain {
        nominal_voltage_v: powertrain.battery_v0,
        max_total_current_a,
        curve,
    };
    bundle.control.max_roll_pitch_torque_nm = max_thrust_n * bundle.control.arm_radius_m * 0.5;
    bundle.control.max_yaw_torque_nm = max_thrust_n * (powertrain.prop_d_m * 0.5) * 0.02;
    bundle.catalog_physics = Some(Box::new(catalog_physics));
    bundle.assumptions = vec![
        "MuJoCo inertials combine contract mass properties with exact equipped catalog masses and sourced-dimension uniform-solid inertias at declared slot mounts".to_string(),
        if powertrain_authority.table_applicability.iter().any(|table| table.used_for_curve) {
            "thrust and current are interpolated only from an equipped catalog bench table whose voltage grid and prop are applicable; complete row and file-catalog byte authority are retained".to_string()
        } else {
            "the equipped catalog bench table is retained but rejected for curve use because its voltage grid and prop do not match; the named blade-element-lite fallback drives the curve".to_string()
        },
        format!(
            "catalog motor Kv and battery voltage/discharge authority are retained; explicit inline fallbacks: {}",
            powertrain_authority.inline_fallbacks.join(", ")
        ),
        "catalog dimensions produce inertia only; collision geometry remains contract-owned and is never invented from a row".to_string(),
        "roll/pitch authority is a conservative differential-thrust bound; yaw uses the documented 2% prop-radius drag-torque proxy".to_string(),
        "the worker exposes estimator-derived observations only; simulator truth remains private (D8)".to_string(),
    ];
    Ok(bundle)
}

pub fn training_bundle(
    spec: &ModelSpec,
    baked: &BakedModel,
    contract_hash: &str,
) -> Result<AnyTrainingBundle, String> {
    match spec.meta.archetype {
        Archetype::Multirotor => multirotor_training_bundle(spec, baked, contract_hash)
            .map(AnyTrainingBundle::Multirotor),
        Archetype::Rover | Archetype::Quadruped => {
            ground_training_bundle(spec, baked, contract_hash).map(AnyTrainingBundle::Ground)
        }
        _ => Err(
            "P7 real training supports multirotor, rover, and quadruped contracts only".to_string(),
        ),
    }
}

pub fn training_bundle_with_catalog(
    spec: &ModelSpec,
    baked: &BakedModel,
    contract_hash: &str,
    catalog: &dyn CatalogSource,
    authority: &CatalogTrainingAuthority,
) -> Result<AnyTrainingBundle, String> {
    match spec.meta.archetype {
        Archetype::Multirotor => {
            multirotor_training_bundle_with_catalog(spec, baked, contract_hash, catalog, authority)
                .map(AnyTrainingBundle::Multirotor)
        }
        Archetype::Rover | Archetype::Quadruped => {
            ground_training_bundle(spec, baked, contract_hash).map(AnyTrainingBundle::Ground)
        }
        _ => Err(
            "P7 real training supports multirotor, rover, and quadruped contracts only".to_string(),
        ),
    }
}

pub fn ground_training_bundle(
    spec: &ModelSpec,
    baked: &BakedModel,
    contract_hash: &str,
) -> Result<GroundTrainingBundle, String> {
    if !matches!(spec.meta.archetype, Archetype::Rover | Archetype::Quadruped) {
        return Err(
            "P7 ground training supports admitted rover and quadruped contracts only".to_string(),
        );
    }
    if contract_hash.len() != 64 || !contract_hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("training bundle contract hash must be 64 hexadecimal characters".to_string());
    }
    let roots: Vec<_> = spec
        .skeleton
        .iter()
        .filter(|node| node.parent.is_none())
        .collect();
    if roots.len() != 1 {
        return Err("P7 ground training requires exactly one root body".to_string());
    }
    let estimator = spec.sim.estimator.as_ref().ok_or_else(|| {
        "P7 ground training requires an explicit estimator block (D8)".to_string()
    })?;
    if !matches!(estimator.kind, EstimatorKind::Complementary) {
        return Err(
            "P7 ground training 1.0.0 supports the complementary estimator only".to_string(),
        );
    }
    let mass_kg = forge_geometry::model_mass_g(spec, baked) / 1000.0;
    if !mass_kg.is_finite() || mass_kg <= 0.0 {
        return Err("P7 ground training requires positive computed model mass".to_string());
    }

    let mut joints = ground_control_joints(spec)?;
    let (archetype, mode, wheel_radius_m, track_width_m, output_layout) = match spec.meta.archetype
    {
        Archetype::Rover => {
            joints.retain(|joint| joint.side == "left" || joint.side == "right");
            if joints.len() < 2
                || !joints.iter().any(|joint| joint.side == "left")
                || !joints.iter().any(|joint| joint.side == "right")
            {
                return Err(
                    "P7 rover training requires at least one bounded left and right wheel joint"
                        .to_string(),
                );
            }
            let radius = rover_wheel_radius(spec, &joints)?;
            let track = rover_track_width(baked, &joints)?;
            (
                "rover",
                "differential-drive-torque-v1",
                Some(radius),
                Some(track),
                vec!["drive".to_string(), "turn".to_string()],
            )
        }
        Archetype::Quadruped => {
            if joints.len() < 8 || joints.len() > 24 {
                return Err(
                    "P7 quadruped training requires between 8 and 24 bounded revolute joints"
                        .to_string(),
                );
            }
            let outputs = joints
                .iter()
                .map(|joint| format!("jointTorque.{}", joint.name))
                .collect();
            (
                "quadruped",
                "normalized-joint-torque-v1",
                None,
                None,
                outputs,
            )
        }
        _ => unreachable!(),
    };

    let mut input_layout = GROUND_POLICY_INPUT_LAYOUT
        .iter()
        .map(|value| (*value).to_string())
        .collect::<Vec<_>>();
    if matches!(spec.meta.archetype, Archetype::Quadruped) {
        input_layout.extend(
            joints
                .iter()
                .map(|joint| format!("estimator.jointPosition.{}Rad", joint.name)),
        );
        input_layout.extend(
            joints
                .iter()
                .map(|joint| format!("estimator.jointVelocity.{}RadS", joint.name)),
        );
    }

    let mjcf = crate::export::to_mjcf_with_options(
        spec,
        baked,
        crate::export::MjcfExportOptions {
            floating_roots: true,
            timestep_s: Some(MUJOCO_TIMESTEP_S),
            euler_integrator: true,
        },
    )?;
    let mjcf = add_ground_plane(&mjcf)?;

    Ok(GroundTrainingBundle {
        artifact_kind: "groundTrainingMuJoCoBundle".to_string(),
        schema_version: GROUND_TRAINING_BUNDLE_VERSION.to_string(),
        contract_hash: contract_hash.to_ascii_lowercase(),
        archetype: archetype.to_string(),
        mujoco_version: TRAINING_MUJOCO_VERSION.to_string(),
        root_body_name: roots[0].name.clone(),
        mjcf,
        timestep_s: MUJOCO_TIMESTEP_S,
        control_period_s: 1.0 / f64::from(POLICY_RATE_HZ),
        substeps: MUJOCO_SUBSTEPS,
        mass_kg,
        gravity_m_s2: spec.env.gravity,
        tensor: TrainingTensorContract {
            schema: GROUND_POLICY_TENSOR_SCHEMA.to_string(),
            schema_version: GROUND_POLICY_TENSOR_VERSION.to_string(),
            coordinate_frame: "forge-y-up-rh-m".to_string(),
            input: TrainingTensorAxis {
                name: "observations".to_string(),
                shape: vec![1, input_layout.len()],
                layout: input_layout,
            },
            output: TrainingTensorAxis {
                name: "actions".to_string(),
                shape: vec![1, output_layout.len()],
                layout: output_layout,
            },
            rate_hz: POLICY_RATE_HZ,
        },
        estimator: TrainingEstimator {
            gyro_noise: estimator.gyro_noise,
            accel_noise: estimator.accel_noise,
            bias: estimator.bias,
            latency_ms: estimator.latency_ms,
        },
        control: GroundTrainingControl {
            mode: mode.to_string(),
            joints,
            wheel_radius_m,
            track_width_m,
        },
        assumptions: vec![
            "MuJoCo consumes forge-sim contract geometry, computed mass properties, gravity, joint limits, and a floating root over an explicit flat contact plane at four physics substeps per 50 Hz policy action".to_string(),
            "every commanded joint torque and velocity limit is explicit in the admitted contract; missing authority fails closed rather than receiving a default".to_string(),
            "the worker exposes corrupted estimator and joint-encoder observations only; simulator pose, velocity, and contact truth remain private (D8)".to_string(),
            "energyWh is simulated positive mechanical joint work only; it is not battery, wall-plug, electricity-cost, device, or field evidence".to_string(),
        ],
    })
}

fn ground_control_joints(spec: &ModelSpec) -> Result<Vec<GroundTrainingJoint>, String> {
    let mut joints = Vec::new();
    for node in spec.skeleton.iter().filter(|node| node.parent.is_some()) {
        let Some(joint) = node.joint.as_ref() else {
            continue;
        };
        if !matches!(joint.kind, JointKind::Revolute) {
            continue;
        }
        let torque = joint.max_torque_nm.ok_or_else(|| {
            format!(
                "P7 ground training joint '{}' requires explicit maxTorqueNm",
                node.name
            )
        })?;
        let velocity = joint.max_vel_rad.ok_or_else(|| {
            format!(
                "P7 ground training joint '{}' requires explicit maxVelRad",
                node.name
            )
        })?;
        if !torque.is_finite() || torque <= 0.0 || !velocity.is_finite() || velocity <= 0.0 {
            return Err(format!(
                "P7 ground training joint '{}' requires positive finite torque and velocity authority",
                node.name
            ));
        }
        let axis = joint.axis.unwrap_or([0.0, 1.0, 0.0]);
        let dominant = (0..3)
            .max_by(|a, b| axis[*a].abs().total_cmp(&axis[*b].abs()))
            .unwrap_or(1);
        let limits = node.limits.ok_or_else(|| {
            format!(
                "P7 ground training joint '{}' requires explicit angular limits",
                node.name
            )
        })?;
        let [lower, upper] = limits[dominant];
        if !lower.is_finite() || !upper.is_finite() || lower >= upper {
            return Err(format!(
                "P7 ground training joint '{}' has invalid angular limits",
                node.name
            ));
        }
        let folded = node.name.to_ascii_lowercase();
        let side = if folded.contains("left") {
            "left"
        } else if folded.contains("right") {
            "right"
        } else if folded.ends_with("_l") || folded.ends_with('l') {
            "left"
        } else if folded.ends_with("_r") || folded.ends_with('r') {
            "right"
        } else {
            "center"
        };
        joints.push(GroundTrainingJoint {
            name: node.name.clone(),
            motor_name: format!("{}_motor", node.name),
            side: side.to_string(),
            lower_rad: lower,
            upper_rad: upper,
            max_torque_nm: torque,
            max_velocity_rad_s: velocity,
        });
    }
    if joints.is_empty() {
        return Err("P7 ground training requires bounded revolute control joints".to_string());
    }
    Ok(joints)
}

fn rover_wheel_radius(spec: &ModelSpec, joints: &[GroundTrainingJoint]) -> Result<f64, String> {
    let names = joints
        .iter()
        .map(|joint| joint.name.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let radii = spec
        .physical_parts_with_paths()
        .into_iter()
        .filter_map(|(_, part)| {
            if !names.contains(part.node.as_str()) {
                return None;
            }
            match part.geom {
                Geom::Cyl { r0, r1, .. } => Some((r0 + r1.unwrap_or(r0)) * 0.5),
                _ => None,
            }
        })
        .filter(|radius| radius.is_finite() && *radius > 0.0)
        .collect::<Vec<_>>();
    if radii.len() < joints.len() {
        return Err(
            "P7 rover training requires one cylindrical wheel on every control joint".to_string(),
        );
    }
    let min = radii.iter().copied().fold(f64::INFINITY, f64::min);
    let max = radii.iter().copied().fold(0.0_f64, f64::max);
    if max - min > 1e-6 {
        return Err("P7 rover training 1.0.0 requires equal wheel radii".to_string());
    }
    Ok((min + max) * 0.5)
}

fn rover_track_width(baked: &BakedModel, joints: &[GroundTrainingJoint]) -> Result<f64, String> {
    let mut left = Vec::new();
    let mut right = Vec::new();
    for joint in joints {
        let world = baked.node_world.get(&joint.name).ok_or_else(|| {
            "P7 rover wheel joint disappeared from the baked transform table".to_string()
        })?;
        match joint.side.as_str() {
            "left" => left.push(world[14]),
            "right" => right.push(world[14]),
            _ => {}
        }
    }
    let left_mean = left.iter().sum::<f64>() / left.len() as f64;
    let right_mean = right.iter().sum::<f64>() / right.len() as f64;
    let width = (left_mean - right_mean).abs();
    if !width.is_finite() || width < 0.05 {
        return Err(
            "P7 rover training requires left/right wheel separation of at least 5 cm".to_string(),
        );
    }
    Ok(width)
}

fn add_ground_plane(mjcf: &str) -> Result<String, String> {
    let marker = "  <worldbody>\n";
    if mjcf.matches(marker).count() != 1 {
        return Err("contract-derived MJCF is missing its exact worldbody marker".to_string());
    }
    Ok(mjcf.replacen(
        marker,
        "  <worldbody>\n    <geom name=\"forge_training_ground\" type=\"plane\" size=\"100 100 0.1\" friction=\"0.8 0.005 0.0001\"/>\n",
        1,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> (ModelSpec, BakedModel) {
        let spec =
            forge_contract::validate_shape(include_str!("../../../examples/vx2-mini.forge.json"))
                .unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        (spec, baked)
    }

    #[test]
    fn bundle_is_contract_derived_and_policy_tensor_exact() {
        let (spec, baked) = fixture();
        let bundle = multirotor_training_bundle(&spec, &baked, &"ab".repeat(32)).unwrap();
        assert_eq!(bundle.schema_version, TRAINING_BUNDLE_VERSION);
        assert_eq!(bundle.mujoco_version, TRAINING_MUJOCO_VERSION);
        assert_eq!(bundle.tensor.input.shape, vec![1, 14]);
        assert_eq!(bundle.tensor.output.shape, vec![1, 4]);
        assert_eq!(bundle.tensor.input.layout[0], "estimator.attitude.rollRad");
        assert!(bundle.mjcf.contains("<freejoint/>"));
        assert!(bundle.mjcf.contains("timestep=\"0.005\""));
        assert_eq!(bundle.powertrain.curve.len(), 101);
        assert!(
            bundle.powertrain.curve.last().unwrap().total_thrust_n
                > bundle.mass_kg * bundle.gravity_m_s2
        );
        assert!(bundle.control.arm_radius_m > 0.1);
    }

    #[test]
    fn bundle_refuses_unsupported_authority() {
        let (mut spec, baked) = fixture();
        spec.meta.archetype = Archetype::Rover;
        assert!(multirotor_training_bundle(&spec, &baked, &"ab".repeat(32))
            .unwrap_err()
            .contains("multirotors only"));

        let (mut spec, baked) = fixture();
        spec.sim.estimator = None;
        assert!(multirotor_training_bundle(&spec, &baked, &"ab".repeat(32))
            .unwrap_err()
            .contains("estimator"));
    }

    #[test]
    fn ground_bundles_are_contract_derived_and_archetype_exact() {
        let rover_doc = include_str!("../../../workers/tests/fixtures/rover-training.forge.json");
        let rover = forge_contract::validate_shape(rover_doc).unwrap();
        let rover_baked = forge_geometry::bake(&rover).unwrap();
        let bundle = ground_training_bundle(&rover, &rover_baked, &"cd".repeat(32)).unwrap();
        assert_eq!(bundle.artifact_kind, "groundTrainingMuJoCoBundle");
        assert_eq!(bundle.schema_version, GROUND_TRAINING_BUNDLE_VERSION);
        assert_eq!(bundle.archetype, "rover");
        assert_eq!(bundle.tensor.input.shape, vec![1, 11]);
        assert_eq!(bundle.tensor.output.layout, vec!["drive", "turn"]);
        assert_eq!(bundle.control.joints.len(), 2);
        assert_eq!(bundle.control.wheel_radius_m, Some(0.04));
        assert_eq!(bundle.control.track_width_m, Some(0.24));
        assert!(bundle.mjcf.contains("forge_training_ground"));

        let quad_doc = include_str!("../../../examples/qd-mini.forge.json");
        let quad = forge_contract::validate_shape(quad_doc).unwrap();
        let quad_baked = forge_geometry::bake(&quad).unwrap();
        let bundle = ground_training_bundle(&quad, &quad_baked, &"ef".repeat(32)).unwrap();
        assert_eq!(bundle.archetype, "quadruped");
        assert_eq!(bundle.tensor.input.shape, vec![1, 27]);
        assert_eq!(bundle.tensor.output.shape, vec![1, 8]);
        assert_eq!(bundle.control.joints.len(), 8);
        assert!(bundle
            .control
            .joints
            .iter()
            .all(|joint| joint.max_torque_nm > 0.0));
    }

    #[test]
    fn ground_bundle_refuses_missing_physical_or_estimator_authority() {
        let doc = include_str!("../../../examples/qd-mini.forge.json");
        let mut spec = forge_contract::validate_shape(doc).unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        spec.skeleton[1].joint.as_mut().unwrap().max_torque_nm = None;
        assert!(ground_training_bundle(&spec, &baked, &"ab".repeat(32))
            .unwrap_err()
            .contains("maxTorqueNm"));

        let mut spec = forge_contract::validate_shape(doc).unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        spec.sim.estimator = None;
        assert!(ground_training_bundle(&spec, &baked, &"ab".repeat(32))
            .unwrap_err()
            .contains("estimator"));
    }
}
