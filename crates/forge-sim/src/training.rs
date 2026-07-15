//! Contract-derived MuJoCo training bundle for the P7 worker runtime.
//!
//! The Rust core remains authoritative for geometry, mass, powertrain, estimator
//! configuration, coordinate conversion, and executable policy tensor metadata.
//! Python owns the Gymnasium/SB3 orchestration, but it must consume this bounded
//! bundle rather than reinterpret a user-authored contract.

use forge_contract::{Archetype, EstimatorKind, ModelSpec};
use forge_geometry::BakedModel;
use serde::{Deserialize, Serialize};

pub const TRAINING_BUNDLE_VERSION: &str = "1.0.0";
pub const POLICY_TENSOR_SCHEMA: &str = "forge-policy-tensor";
pub const POLICY_TENSOR_VERSION: &str = "1.0.0";
pub const TRAINING_MUJOCO_VERSION: &str = "3.9.0";
pub const POLICY_RATE_HZ: u32 = 50;
pub const MUJOCO_SUBSTEPS: u32 = 4;
pub const MUJOCO_TIMESTEP_S: f64 = 1.0 / (POLICY_RATE_HZ as f64 * MUJOCO_SUBSTEPS as f64);

pub const MULTIROTOR_POLICY_INPUT_LAYOUT: [&str; 11] = [
    "estimator.attitude.rollRad",
    "estimator.attitude.pitchRad",
    "estimator.attitude.yawRad",
    "estimator.angularRate.rollRadS",
    "estimator.angularRate.pitchRadS",
    "estimator.angularRate.yawRadS",
    "target.error.bodyXM",
    "target.error.bodyYM",
    "target.error.bodyZM",
    "battery.normalizedVoltage",
    "powertrain.normalizedMotorCurrent",
];

pub const MULTIROTOR_POLICY_OUTPUT_LAYOUT: [&str; 4] = ["throttle", "roll", "pitch", "yaw"];

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
    pub assumptions: Vec<String>,
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
            max_roll_pitch_torque_nm,
            max_yaw_torque_nm,
        },
        assumptions: vec![
            "MuJoCo consumes forge-sim contract geometry, mass properties, gravity, and a floating root at four physics substeps per 50 Hz policy action".to_string(),
            "thrust, voltage, and current are sampled from forge-sim's inline-constant powertrain model; catalog-only authority fails closed".to_string(),
            "roll/pitch authority is a conservative differential-thrust bound; yaw uses an explicit 2% prop-radius drag-torque proxy pending sourced torque tables".to_string(),
            "the worker exposes estimator-derived observations only; simulator truth remains private (D8)".to_string(),
        ],
    })
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
        assert_eq!(bundle.tensor.input.shape, vec![1, 11]);
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
}
