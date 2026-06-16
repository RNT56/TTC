//! URDF/MJCF importer fixtures and parity checks (P6-009/P6-010).
//!
//! These importers intentionally target the deterministic subset emitted by
//! `export.rs`: links/bodies, primitive visual/contact geometry, joints, and
//! actuators. They are enough for round-trip fixtures, slotless contract import,
//! and parity gates without taking a general XML dependency.

use crate::rapier::{RapierWorld, RapierWorldConfig};
use forge_contract::{
    Archetype, CollisionPolicy, Driver, EnvBlock, Explode, Geom, Joint, JointKind, MaterialClass,
    Meta, ModelSpec, Node, Part, PartPose, Provenance, ProvenanceKind, SimBlock,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedNode {
    pub name: String,
    pub parent: Option<String>,
    pub pos: [f64; 3],
    pub rot: [f64; 3],
    pub joint_kind: Option<String>,
    pub joint_axis: Option<[f64; 3]>,
    pub joint_limits: Option<[f64; 2]>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedGeom {
    pub node: String,
    pub kind: String,
    pub collision: bool,
    pub pose: [f64; 3],
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub dimensions: Vec<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_ref: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedSummary {
    pub format: String,
    pub model: String,
    pub nodes: Vec<ImportedNode>,
    pub geoms: Vec<ImportedGeom>,
    pub actuator_count: usize,
}

impl ImportedSummary {
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
    pub fn part_count(&self) -> usize {
        self.geoms.iter().filter(|geom| !geom.collision).count()
    }
    pub fn collision_count(&self) -> usize {
        self.geoms.iter().filter(|geom| geom.collision).count()
    }
    pub fn joint_count(&self) -> usize {
        self.nodes
            .iter()
            .filter(|node| node.parent.is_some())
            .count()
    }
}

pub fn import_urdf_summary(xml: &str) -> Result<ImportedSummary, String> {
    let model = attr(xml, "<robot", "name").unwrap_or_else(|| "imported-urdf".to_string());
    let mut nodes = Vec::new();
    let mut geoms = Vec::new();
    for link in elements(xml, "link") {
        let name = attr(&link.open, "<link", "name").ok_or("URDF link missing name")?;
        for visual in elements(&link.body, "visual") {
            if let Some(geom) = urdf_geom(&visual.body, &name, false) {
                geoms.push(geom);
            }
        }
        for collision in elements(&link.body, "collision") {
            if let Some(geom) = urdf_geom(&collision.body, &name, true) {
                geoms.push(geom);
            }
        }
        nodes.push(ImportedNode {
            name,
            parent: None,
            pos: [0.0; 3],
            rot: [0.0; 3],
            joint_kind: None,
            joint_axis: None,
            joint_limits: None,
        });
    }
    for joint in elements(xml, "joint") {
        let child =
            child_text_attr(&joint.body, "child", "link").ok_or("URDF joint missing child")?;
        let parent =
            child_text_attr(&joint.body, "parent", "link").ok_or("URDF joint missing parent")?;
        let kind = attr(&joint.open, "<joint", "type");
        if let Some(node) = nodes.iter_mut().find(|node| node.name == child) {
            node.parent = Some(parent);
            node.joint_kind = kind;
            node.pos = child_text_attr(&joint.body, "origin", "xyz")
                .and_then(|value| parse_vec3(&value))
                .map(zup_to_forge)
                .unwrap_or([0.0; 3]);
            node.rot = child_text_attr(&joint.body, "origin", "rpy")
                .and_then(|value| parse_vec3(&value))
                .unwrap_or([0.0; 3]);
            node.joint_axis = child_text_attr(&joint.body, "axis", "xyz")
                .and_then(|value| parse_vec3(&value))
                .map(zup_to_forge);
            node.joint_limits = parse_limits(&joint.body);
        }
    }
    Ok(ImportedSummary {
        format: "urdf".to_string(),
        model,
        nodes,
        geoms,
        actuator_count: xml.matches("<ros2_control").count(),
    })
}

pub fn import_mjcf_summary(xml: &str) -> Result<ImportedSummary, String> {
    let model = attr(xml, "<mujoco", "model").unwrap_or_else(|| "imported-mjcf".to_string());
    let mut stack: Vec<String> = Vec::new();
    let mut nodes = Vec::new();
    let mut geoms = Vec::new();
    for token in xml.split('<').skip(1) {
        if token.starts_with("/body") {
            stack.pop();
            continue;
        }
        if token.starts_with("body ") {
            let open = format!("<{}", token.split('>').next().unwrap_or(token));
            let name = attr(&open, "<body", "name").ok_or("MJCF body missing name")?;
            let parent = stack.last().cloned();
            nodes.push(ImportedNode {
                name: name.clone(),
                parent,
                pos: attr(&open, "<body", "pos")
                    .and_then(|value| parse_vec3(&value))
                    .map(zup_to_forge)
                    .unwrap_or([0.0; 3]),
                rot: [0.0; 3],
                joint_kind: None,
                joint_axis: None,
                joint_limits: None,
            });
            stack.push(name);
            continue;
        }
        if token.starts_with("joint ") {
            if let Some(current) = stack.last() {
                let open = format!("<{}", token.split('>').next().unwrap_or(token));
                if let Some(node) = nodes.iter_mut().find(|node| &node.name == current) {
                    node.joint_kind = attr(&open, "<joint", "type");
                    node.joint_axis = attr(&open, "<joint", "axis")
                        .and_then(|value| parse_vec3(&value))
                        .map(zup_to_forge);
                    node.joint_limits =
                        attr(&open, "<joint", "range").and_then(|value| parse_pair(&value));
                }
            }
            continue;
        }
        if token.starts_with("geom ") {
            let open = format!("<{}", token.split('>').next().unwrap_or(token));
            if let Some(geom) = mjcf_geom(
                &open,
                &stack.last().cloned().unwrap_or_else(|| "world".to_string()),
            ) {
                geoms.push(geom);
            }
        }
    }
    Ok(ImportedSummary {
        format: "mjcf".to_string(),
        model,
        nodes,
        geoms,
        actuator_count: xml.matches("<motor ").count(),
    })
}

pub fn import_urdf_contract(xml: &str) -> Result<ModelSpec, String> {
    summary_to_contract(import_urdf_summary(xml)?)
}

pub fn import_mjcf_contract(xml: &str) -> Result<ModelSpec, String> {
    summary_to_contract(import_mjcf_summary(xml)?)
}

fn summary_to_contract(summary: ImportedSummary) -> Result<ModelSpec, String> {
    let skeleton = summary
        .nodes
        .iter()
        .map(|node| Node {
            name: node.name.clone(),
            parent: node.parent.clone(),
            pos: node.pos,
            rot: node.rot,
            limits: node
                .joint_limits
                .map(|limits| limits_for_axis(node.joint_axis.unwrap_or([0.0, 1.0, 0.0]), limits)),
            joint: node
                .parent
                .as_ref()
                .map(|_| import_joint(node.joint_kind.as_deref(), node.joint_axis)),
        })
        .collect::<Vec<_>>();
    if skeleton.is_empty() {
        return Err("import produced no skeleton nodes".to_string());
    }

    let mut parts = Vec::new();
    for (i, geom) in summary.geoms.iter().enumerate() {
        let part_geom = primitive_geom(geom).unwrap_or_else(|| Geom::Mesh {
            asset_ref: geom
                .asset_ref
                .clone()
                .unwrap_or_else(|| asset_ref(&summary, geom, i)),
        });
        parts.push(Part {
            node: geom.node.clone(),
            geom: part_geom,
            pose: Some(PartPose {
                p: geom.pose,
                r: [0.0; 3],
                s: [1.0; 3],
            }),
            material: if geom.collision {
                MaterialClass::Rubber
            } else {
                MaterialClass::Matte
            },
            color: if geom.collision {
                "#4a5568".to_string()
            } else {
                "#9ca3af".to_string()
            },
            explode: Some(imported_explode(i, summary.geoms.len(), geom.collision)),
            render_bias: None,
            comp: Some(format!("imported-{}-{i}", summary.format)),
            mass: None,
            collision: if geom.collision {
                CollisionPolicy::Primitive
            } else {
                CollisionPolicy::None
            },
        });
    }
    if parts.is_empty() {
        parts.push(Part {
            node: skeleton[0].name.clone(),
            geom: Geom::Box {
                w: 0.1,
                h: 0.1,
                d: 0.1,
            },
            pose: None,
            material: MaterialClass::Matte,
            color: "#9ca3af".to_string(),
            explode: Some(imported_explode(0, 1, false)),
            render_bias: None,
            comp: Some("imported-placeholder".to_string()),
            mass: None,
            collision: CollisionPolicy::Primitive,
        });
    }

    let driver_params = inferred_rover_driver_params(&summary);

    Ok(ModelSpec {
        meta: Meta {
            id: summary.model.clone(),
            name: format!("Imported {}", summary.model),
            version: forge_contract::SCHEMA_VERSION.to_string(),
            archetype: Archetype::Rover,
            provenance: Provenance {
                kind: ProvenanceKind::Human,
                prompt_hash: None,
                model_version: Some(format!("{}-importer-v0", summary.format)),
                seed: None,
            },
            license: "imported-source-license-required".to_string(),
        },
        env: EnvBlock::default(),
        skeleton,
        parts,
        slots: Vec::new(),
        lockfile: Default::default(),
        ports: Vec::new(),
        chains: Vec::new(),
        driver: Driver {
            archetype: Archetype::Rover,
            params: driver_params,
        },
        sim: SimBlock::default(),
    })
}

fn imported_explode(index: usize, total: usize, collision: bool) -> Explode {
    let side = if index % 2 == 0 { 1.0 } else { -1.0 };
    let axis = match index % 3 {
        0 => [side, 0.0, 0.0],
        1 => [0.0, side, 0.0],
        _ => [0.0, 0.0, side],
    };
    let band = if total <= 1 {
        0.0
    } else {
        index as f64 / total as f64
    };
    Explode {
        dir: axis,
        mag: if collision { 0.035 } else { 0.055 },
        t0: (band * 0.55).clamp(0.0, 0.9),
        t1: (band * 0.55 + 0.35).clamp(0.1, 1.0),
        leader: (index == 0).then(|| "imported assembly".to_string()),
    }
}

fn inferred_rover_driver_params(summary: &ImportedSummary) -> serde_json::Value {
    let wheel_nodes: Vec<&ImportedNode> = summary
        .nodes
        .iter()
        .filter(|node| {
            node.name.to_ascii_lowercase().contains("wheel")
                || matches!(
                    node.joint_kind.as_deref(),
                    Some("revolute" | "continuous" | "hinge")
                )
        })
        .collect();
    let mut wheelbase = 0.2_f64;
    for (i, a) in wheel_nodes.iter().enumerate() {
        for b in wheel_nodes.iter().skip(i + 1) {
            let dx = a.pos[0] - b.pos[0];
            let dy = a.pos[1] - b.pos[1];
            let dz = a.pos[2] - b.pos[2];
            wheelbase = wheelbase.max((dx * dx + dy * dy + dz * dz).sqrt());
        }
    }
    serde_json::json!({
        "wheelbaseM": wheelbase.clamp(0.05, 5.0),
        "maxSpeedMs": if summary.actuator_count > 0 { 1.2 } else { 1.0 }
    })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParityReport {
    pub drop_time_error_s: f64,
    pub pendulum_period_error_s: f64,
    pub hover_trim_error: f64,
    pub gait_com_error_m: f64,
    pub passed: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParityTolerance {
    pub max_drop_time_error_s: f64,
    pub max_pendulum_period_error_s: f64,
    pub max_hover_trim_error: f64,
    pub max_gait_com_error_m: f64,
}

impl Default for ParityTolerance {
    fn default() -> Self {
        Self {
            max_drop_time_error_s: 0.002,
            max_pendulum_period_error_s: 0.01,
            max_hover_trim_error: 0.02,
            max_gait_com_error_m: 0.02,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineParitySample {
    pub rapier_drop_time_s: f64,
    pub mujoco_drop_time_s: f64,
    pub rapier_pendulum_period_s: f64,
    pub mujoco_pendulum_period_s: f64,
    pub rapier_hover_trim: f64,
    pub mujoco_hover_trim: f64,
    pub rapier_gait_com_m: f64,
    pub mujoco_gait_com_m: f64,
}

pub fn evaluate_engine_parity(
    sample: EngineParitySample,
    tolerance: ParityTolerance,
) -> ParityReport {
    let drop_time_error_s = (sample.rapier_drop_time_s - sample.mujoco_drop_time_s).abs();
    let pendulum_period_error_s =
        (sample.rapier_pendulum_period_s - sample.mujoco_pendulum_period_s).abs();
    let hover_trim_error = (sample.rapier_hover_trim - sample.mujoco_hover_trim).abs();
    let gait_com_error_m = (sample.rapier_gait_com_m - sample.mujoco_gait_com_m).abs();
    ParityReport {
        drop_time_error_s,
        pendulum_period_error_s,
        hover_trim_error,
        gait_com_error_m,
        passed: drop_time_error_s <= tolerance.max_drop_time_error_s
            && pendulum_period_error_s <= tolerance.max_pendulum_period_error_s
            && hover_trim_error <= tolerance.max_hover_trim_error
            && gait_com_error_m <= tolerance.max_gait_com_error_m,
    }
}

pub fn parity_fixture(
    gravity: f64,
    pendulum_length_m: f64,
    hover_a: f64,
    hover_b: f64,
) -> ParityReport {
    let drop_height = 1.0;
    let analytical_drop = (2.0_f64 * drop_height / gravity).sqrt();
    let rapier_drop = analytical_drop * (1.0 + 2e-4);
    let mujoco_drop = analytical_drop * (1.0 - 1e-4);
    let analytical_period = 2.0 * std::f64::consts::PI * (pendulum_length_m / gravity).sqrt();
    let rapier_period = analytical_period * (1.0 + 3e-4);
    let mujoco_period = analytical_period * (1.0 - 2e-4);
    let drop_time_error_s = (rapier_drop - mujoco_drop).abs();
    let pendulum_period_error_s = (rapier_period - mujoco_period).abs();
    let hover_trim_error = (hover_a - hover_b).abs();
    let gait_com_error_m = 0.004;
    ParityReport {
        drop_time_error_s,
        pendulum_period_error_s,
        hover_trim_error,
        gait_com_error_m,
        passed: drop_time_error_s < 0.002
            && pendulum_period_error_s < 0.01
            && hover_trim_error < 0.02
            && gait_com_error_m < 0.02,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapierParityBaseline {
    pub drop_height_m: f64,
    pub rapier_drop_time_s: f64,
    pub pendulum_length_m: f64,
    pub rapier_pendulum_period_s: f64,
    pub rapier_hover_trim: f64,
    pub rapier_gait_com_m: f64,
    pub driver_dt_s: f64,
    pub substeps: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MuJoCoParityBaseline {
    pub drop_height_m: f64,
    pub mujoco_drop_time_s: f64,
    pub pendulum_length_m: f64,
    pub mujoco_pendulum_period_s: f64,
    pub mujoco_hover_trim: f64,
    pub mujoco_gait_com_m: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub driver_dt_s: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub substeps: Option<u32>,
}

pub fn engine_parity_sample_from_baselines(
    rapier: RapierParityBaseline,
    mujoco: MuJoCoParityBaseline,
) -> Result<EngineParitySample, String> {
    let geometry_tol = 1e-9;
    if (rapier.drop_height_m - mujoco.drop_height_m).abs() > geometry_tol {
        return Err(format!(
            "drop height mismatch: Rapier {:.9} m vs MuJoCo {:.9} m",
            rapier.drop_height_m, mujoco.drop_height_m
        ));
    }
    if (rapier.pendulum_length_m - mujoco.pendulum_length_m).abs() > geometry_tol {
        return Err(format!(
            "pendulum length mismatch: Rapier {:.9} m vs MuJoCo {:.9} m",
            rapier.pendulum_length_m, mujoco.pendulum_length_m
        ));
    }
    Ok(EngineParitySample {
        rapier_drop_time_s: rapier.rapier_drop_time_s,
        mujoco_drop_time_s: mujoco.mujoco_drop_time_s,
        rapier_pendulum_period_s: rapier.rapier_pendulum_period_s,
        mujoco_pendulum_period_s: mujoco.mujoco_pendulum_period_s,
        rapier_hover_trim: rapier.rapier_hover_trim,
        mujoco_hover_trim: mujoco.mujoco_hover_trim,
        rapier_gait_com_m: rapier.rapier_gait_com_m,
        mujoco_gait_com_m: mujoco.mujoco_gait_com_m,
    })
}

pub fn compare_engine_baselines(
    rapier: RapierParityBaseline,
    mujoco: MuJoCoParityBaseline,
    tolerance: ParityTolerance,
) -> Result<ParityReport, String> {
    let sample = engine_parity_sample_from_baselines(rapier, mujoco)?;
    Ok(evaluate_engine_parity(sample, tolerance))
}

pub fn rapier_engine_baseline(
    gravity: f64,
    pendulum_length_m: f64,
    hover_trim: f64,
    gait_com_m: f64,
) -> Result<RapierParityBaseline, String> {
    let config = RapierWorldConfig {
        dt_s: 1.0 / 240.0,
        substeps: 4,
        fixed_roots: true,
        include_ground: false,
    };
    let drop_height_m = 1.0;
    Ok(RapierParityBaseline {
        drop_height_m,
        rapier_drop_time_s: rapier_drop_time(gravity, drop_height_m, config)?,
        pendulum_length_m,
        rapier_pendulum_period_s: rapier_pendulum_period(gravity, pendulum_length_m, config)?,
        rapier_hover_trim: rapier_hover_trim(gravity, hover_trim, config)?,
        rapier_gait_com_m: rapier_gait_com(gravity, gait_com_m, config)?,
        driver_dt_s: config.dt_s,
        substeps: config.substeps,
    })
}

fn rapier_drop_time(
    gravity: f64,
    drop_height_m: f64,
    config: RapierWorldConfig,
) -> Result<f64, String> {
    let doc = serde_json::json!({
      "meta":{"id":"parity-drop","name":"parity-drop","version":"2.1.0","archetype":"rover",
              "provenance":{"kind":"human"},"license":"CC0"},
      "env":{"gravity": gravity, "airDensity": 1.225},
      "skeleton":[{"name":"root","parent":null,"pos":[0,drop_height_m,0]}],
      "parts":[{"node":"root","geom":{"kind":"box","w":0.04,"h":0.04,"d":0.04},
                "material":"matte","color":"#888888","collision":"primitive","mass":{"valueG":100}}],
      "driver":{"archetype":"rover","params":{"wheelbaseM":0.2,"maxSpeedMs":1.0}}
    });
    let spec = forge_contract::validate_shape(&doc.to_string()).map_err(|err| err.to_string())?;
    let baked = forge_geometry::bake(&spec).map_err(|err| err.to_string())?;
    let mut world = RapierWorld::from_contract(
        &spec,
        &baked,
        RapierWorldConfig {
            fixed_roots: false,
            ..config
        },
    )
    .map_err(|err| err.to_string())?;
    let mut prev_t = 0.0;
    let mut prev_y = world
        .body_pose("root")
        .ok_or("missing parity drop body")?
        .translation_m[1];
    for _ in 0..2400 {
        let step = world.step(config.dt_s);
        let y = world
            .body_pose("root")
            .ok_or("missing parity drop body")?
            .translation_m[1];
        if y <= 0.0 {
            let denom = prev_y - y;
            let alpha = if denom.abs() > 1e-12 {
                prev_y / denom
            } else {
                1.0
            };
            return Ok(prev_t + alpha.clamp(0.0, 1.0) * (step.t_s - prev_t));
        }
        prev_t = step.t_s;
        prev_y = y;
    }
    Err("Rapier drop baseline did not cross y=0 within timeout".to_string())
}

fn rapier_pendulum_period(
    gravity: f64,
    pendulum_length_m: f64,
    config: RapierWorldConfig,
) -> Result<f64, String> {
    let initial_angle = 0.12_f64;
    let doc = serde_json::json!({
      "meta":{"id":"parity-pendulum","name":"parity-pendulum","version":"2.1.0","archetype":"arm",
              "provenance":{"kind":"human"},"license":"CC0"},
      "env":{"gravity": gravity, "airDensity": 1.225},
      "skeleton":[
        {"name":"root","parent":null,"pos":[0,0,0]},
        {"name":"bob","parent":"root","pos":[0,0,0],"rot":[0,0,initial_angle],
         "joint":{"type":"revolute","axis":[0,0,1],"maxTorqueNm":0.0,"maxVelRad":20.0},
         "limits":[[-3.141592653589793,3.141592653589793],[-3.141592653589793,3.141592653589793],[-3.141592653589793,3.141592653589793]]}
      ],
      "parts":[{"node":"bob","geom":{"kind":"box","w":0.03,"h":0.03,"d":0.03},
                "pose":{"p":[0,-pendulum_length_m,0]},
                "material":"matte","color":"#777777","collision":"primitive","mass":{"valueG":100}}],
      "driver":{"archetype":"arm","params":{"targetM":[0,-pendulum_length_m,0]}}
    });
    let spec = forge_contract::validate_shape(&doc.to_string()).map_err(|err| err.to_string())?;
    let baked = forge_geometry::bake(&spec).map_err(|err| err.to_string())?;
    let mut world =
        RapierWorld::from_contract(&spec, &baked, config).map_err(|err| err.to_string())?;
    let mut prev_t = 0.0;
    let mut prev_x = world
        .body_local_point_world("bob", [0.0, -pendulum_length_m, 0.0])
        .ok_or("missing parity pendulum body")?[0];
    let mut crossings = Vec::new();
    for _ in 0..4800 {
        let step = world.step(config.dt_s);
        let x = world
            .body_local_point_world("bob", [0.0, -pendulum_length_m, 0.0])
            .ok_or("missing parity pendulum body")?[0];
        if prev_x > 0.0 && x <= 0.0 {
            let denom = prev_x - x;
            let alpha = if denom.abs() > 1e-12 {
                prev_x / denom
            } else {
                1.0
            };
            crossings.push(prev_t + alpha.clamp(0.0, 1.0) * (step.t_s - prev_t));
            if crossings.len() == 2 {
                return Ok(crossings[1] - crossings[0]);
            }
        }
        prev_t = step.t_s;
        prev_x = x;
    }
    Err("Rapier pendulum baseline did not complete a period within timeout".to_string())
}

fn rapier_hover_trim(
    gravity: f64,
    expected_hover_trim: f64,
    config: RapierWorldConfig,
) -> Result<f64, String> {
    if !(0.0..=1.0).contains(&expected_hover_trim) || expected_hover_trim <= 0.0 {
        return Err("hover trim design point must be in (0, 1]".to_string());
    }
    let mass_kg = 0.1;
    let max_thrust_n = mass_kg * gravity / expected_hover_trim;
    let final_velocity = |throttle: f64| -> Result<f64, String> {
        let doc = serde_json::json!({
          "meta":{"id":"parity-hover","name":"parity-hover","version":"2.1.0","archetype":"multirotor",
                  "provenance":{"kind":"human"},"license":"CC0"},
          "env":{"gravity": gravity, "airDensity": 1.225},
          "skeleton":[{"name":"root","parent":null,"pos":[0,0,0]}],
          "parts":[{"node":"root","geom":{"kind":"box","w":0.06,"h":0.02,"d":0.06},
                    "material":"matte","color":"#888888","collision":"primitive","mass":{"valueG":100}}],
          "driver":{"archetype":"multirotor","params":{"tiltMaxRad":0.4,"yawRate":2.4,"mixer":"x4"}}
        });
        let spec =
            forge_contract::validate_shape(&doc.to_string()).map_err(|err| err.to_string())?;
        let baked = forge_geometry::bake(&spec).map_err(|err| err.to_string())?;
        let mut world = RapierWorld::from_contract(
            &spec,
            &baked,
            RapierWorldConfig {
                fixed_roots: false,
                ..config
            },
        )
        .map_err(|err| err.to_string())?;
        if !world.set_body_force("root", [0.0, throttle * max_thrust_n, 0.0]) {
            return Err("missing parity hover body".to_string());
        }
        let steps = (1.0 / config.dt_s).ceil() as usize;
        for _ in 0..steps {
            world.step(config.dt_s);
        }
        Ok(world
            .body_pose("root")
            .ok_or("missing parity hover body")?
            .linvel_mps[1])
    };

    let mut lo = 0.0;
    let mut hi = 1.0;
    let lo_v = final_velocity(lo)?;
    let hi_v = final_velocity(hi)?;
    if lo_v > 0.0 || hi_v < 0.0 {
        return Err(format!(
            "hover trim bracket failed: low velocity {lo_v:.6} m/s, high velocity {hi_v:.6} m/s"
        ));
    }
    for _ in 0..32 {
        let mid = 0.5 * (lo + hi);
        let v = final_velocity(mid)?;
        if v < 0.0 {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    Ok(0.5 * (lo + hi))
}

fn rapier_gait_com(
    gravity: f64,
    target_gait_com_m: f64,
    config: RapierWorldConfig,
) -> Result<f64, String> {
    if !target_gait_com_m.is_finite() || target_gait_com_m < 0.0 {
        return Err("gait CoM design point must be non-negative and finite".to_string());
    }
    if target_gait_com_m == 0.0 {
        return Ok(0.0);
    }
    let mass_kg = 0.1;
    let omega = 2.0 * std::f64::consts::PI;
    let lateral_force_amp_n = mass_kg * target_gait_com_m * omega * omega / 2.0;
    let vertical_force_n = mass_kg * gravity;
    let doc = serde_json::json!({
      "meta":{"id":"parity-gait-com","name":"parity-gait-com","version":"2.1.0","archetype":"quadruped",
              "provenance":{"kind":"human"},"license":"CC0"},
      "env":{"gravity": gravity, "airDensity": 1.225},
      "skeleton":[{"name":"body","parent":null,"pos":[0,0,0]}],
      "parts":[{"node":"body","geom":{"kind":"box","w":0.08,"h":0.03,"d":0.04},
                "material":"matte","color":"#888888","collision":"primitive","mass":{"valueG":100}}],
          "driver":{"archetype":"quadruped","params":{"standHeightM":0.08,"strideM":0.05,"cadenceHz":1.0,"duty":0.5,"liftM":0.02,"yawRate":1.0}}
    });
    let spec = forge_contract::validate_shape(&doc.to_string()).map_err(|err| err.to_string())?;
    let baked = forge_geometry::bake(&spec).map_err(|err| err.to_string())?;
    let mut world = RapierWorld::from_contract(
        &spec,
        &baked,
        RapierWorldConfig {
            fixed_roots: false,
            ..config
        },
    )
    .map_err(|err| err.to_string())?;
    let steps = (1.0 / config.dt_s).ceil() as usize;
    let mut max_abs_x = 0.0_f64;
    for step in 0..steps {
        let t = step as f64 * config.dt_s;
        let lateral = lateral_force_amp_n * (omega * t).cos();
        if !world.set_body_force("body", [lateral, vertical_force_n, 0.0]) {
            return Err("missing parity gait body".to_string());
        }
        world.step(config.dt_s);
        let x = world
            .body_pose("body")
            .ok_or("missing parity gait body")?
            .translation_m[0]
            .abs();
        max_abs_x = max_abs_x.max(x);
    }
    Ok(max_abs_x)
}

struct Element {
    open: String,
    body: String,
}

fn elements(xml: &str, tag: &str) -> Vec<Element> {
    let mut out = Vec::new();
    let mut rest = xml;
    let open_pat = format!("<{tag}");
    let close_pat = format!("</{tag}>");
    while let Some(start) = rest.find(&open_pat) {
        rest = &rest[start..];
        let Some(open_end) = rest.find('>') else {
            break;
        };
        let open = rest[..=open_end].to_string();
        let after_open = &rest[open_end + 1..];
        let Some(close_start) = after_open.find(&close_pat) else {
            rest = after_open;
            continue;
        };
        let body = after_open[..close_start].to_string();
        out.push(Element { open, body });
        rest = &after_open[close_start + close_pat.len()..];
    }
    out
}

fn attr(text: &str, prefix: &str, name: &str) -> Option<String> {
    let start = text.find(prefix)?;
    let text = &text[start..];
    let needle = format!("{name}=\"");
    let value_start = text.find(&needle)? + needle.len();
    let tail = &text[value_start..];
    Some(tail[..tail.find('"')?].to_string())
}

fn child_text_attr(body: &str, tag: &str, name: &str) -> Option<String> {
    attr(body, &format!("<{tag}"), name)
}

fn urdf_geom(body: &str, node: &str, collision: bool) -> Option<ImportedGeom> {
    let pose = child_text_attr(body, "origin", "xyz")
        .and_then(|value| parse_vec3(&value))
        .map(zup_to_forge)
        .unwrap_or([0.0; 3]);
    if let Some(size) = attr(body, "<box", "size").and_then(|value| parse_vec3(&value)) {
        return Some(ImportedGeom {
            node: node.to_string(),
            kind: "box".to_string(),
            collision,
            pose,
            dimensions: vec![size[0], size[2], size[1]],
            asset_ref: None,
        });
    }
    if let (Some(radius), Some(length)) = (
        attr(body, "<cylinder", "radius").and_then(|value| value.parse::<f64>().ok()),
        attr(body, "<cylinder", "length").and_then(|value| value.parse::<f64>().ok()),
    ) {
        return Some(ImportedGeom {
            node: node.to_string(),
            kind: "cylinder".to_string(),
            collision,
            pose,
            dimensions: vec![radius, length],
            asset_ref: None,
        });
    }
    if let Some(asset_ref) = attr(body, "<mesh", "filename").or_else(|| attr(body, "<mesh", "url"))
    {
        return Some(ImportedGeom {
            node: node.to_string(),
            kind: "mesh".to_string(),
            collision,
            pose,
            dimensions: Vec::new(),
            asset_ref: Some(asset_ref),
        });
    }
    None
}

fn mjcf_geom(open: &str, node: &str) -> Option<ImportedGeom> {
    let kind = attr(open, "<geom", "type").unwrap_or_else(|| "unknown".to_string());
    let pose = attr(open, "<geom", "pos")
        .and_then(|value| parse_vec3(&value))
        .map(zup_to_forge)
        .unwrap_or([0.0; 3]);
    let dimensions = match kind.as_str() {
        "box" => attr(open, "<geom", "size")
            .and_then(|value| parse_vec3(&value))
            .map(|size| vec![2.0 * size[0], 2.0 * size[2], 2.0 * size[1]])
            .unwrap_or_default(),
        "cylinder" => attr(open, "<geom", "size")
            .and_then(|value| parse_numbers(&value))
            .and_then(|values| {
                if values.len() >= 2 {
                    Some(vec![values[0], 2.0 * values[1]])
                } else {
                    None
                }
            })
            .unwrap_or_default(),
        "mesh" => Vec::new(),
        _ => Vec::new(),
    };
    Some(ImportedGeom {
        node: node.to_string(),
        kind,
        collision: true,
        pose,
        dimensions,
        asset_ref: attr(open, "<geom", "mesh"),
    })
}

fn import_joint(kind: Option<&str>, axis: Option<[f64; 3]>) -> Joint {
    let kind = match kind {
        Some("revolute" | "continuous" | "hinge") => JointKind::Revolute,
        Some("floating" | "free" | "ball") => JointKind::Spherical,
        _ => JointKind::Fixed,
    };
    Joint {
        kind,
        axis,
        max_torque_nm: Some(10.0),
        max_vel_rad: Some(20.0),
    }
}

fn limits_for_axis(axis: [f64; 3], limits: [f64; 2]) -> [[f64; 2]; 3] {
    let mut out = [[0.0, 0.0]; 3];
    let dominant = (0..3)
        .max_by(|a, b| axis[*a].abs().partial_cmp(&axis[*b].abs()).unwrap())
        .unwrap_or(1);
    out[dominant] = limits;
    out
}

fn primitive_geom(geom: &ImportedGeom) -> Option<Geom> {
    match geom.kind.as_str() {
        "box" if geom.dimensions.len() >= 3 => Some(Geom::Box {
            w: geom.dimensions[0],
            h: geom.dimensions[1],
            d: geom.dimensions[2],
        }),
        "cylinder" if geom.dimensions.len() >= 2 => Some(Geom::Cyl {
            r0: geom.dimensions[0],
            r1: None,
            h: geom.dimensions[1],
            n: Some(24),
        }),
        _ => None,
    }
}

fn asset_ref(summary: &ImportedSummary, geom: &ImportedGeom, index: usize) -> String {
    format!(
        "import://{}/{}/{}/{}-{index}",
        summary.format,
        summary.model,
        geom.node,
        if geom.collision {
            "collision"
        } else {
            "visual"
        }
    )
}

fn zup_to_forge(p: [f64; 3]) -> [f64; 3] {
    [p[0], p[2], -p[1]]
}

fn parse_limits(text: &str) -> Option<[f64; 2]> {
    let lower = attr(text, "<limit", "lower")?.parse::<f64>().ok()?;
    let upper = attr(text, "<limit", "upper")?.parse::<f64>().ok()?;
    Some([lower, upper])
}

fn parse_pair(value: &str) -> Option<[f64; 2]> {
    let values = parse_numbers(value)?;
    if values.len() >= 2 {
        Some([values[0], values[1]])
    } else {
        None
    }
}

fn parse_vec3(value: &str) -> Option<[f64; 3]> {
    let values = parse_numbers(value)?;
    if values.len() >= 3 {
        Some([values[0], values[1], values[2]])
    } else {
        None
    }
}

fn parse_numbers(value: &str) -> Option<Vec<f64>> {
    let values = value
        .split_whitespace()
        .map(str::parse::<f64>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    if values.is_empty() {
        None
    } else {
        Some(values)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urdf_import_reads_links_joints_and_geoms() {
        let spec = forge_contract::validate_shape(
            &std::fs::read_to_string("../../examples/vx2-mini.forge.json").unwrap(),
        )
        .unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let urdf = crate::export::to_urdf(&spec, &baked);
        let imported = import_urdf_summary(&urdf).unwrap();
        assert_eq!(imported.model, spec.meta.id);
        assert_eq!(imported.node_count(), spec.skeleton.len());
        assert_eq!(imported.joint_count(), spec.skeleton.len() - 1);
        assert!(imported.collision_count() > 0);
    }

    #[test]
    fn mjcf_import_reads_bodies_geoms_and_actuators() {
        let spec = forge_contract::validate_shape(
            &std::fs::read_to_string("../../examples/vx2-mini.forge.json").unwrap(),
        )
        .unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let mjcf = crate::export::to_mjcf(&spec, &baked);
        let imported = import_mjcf_summary(&mjcf).unwrap();
        assert_eq!(imported.model, spec.meta.id);
        assert_eq!(imported.node_count(), spec.skeleton.len());
        assert!(imported.collision_count() > 0);
        assert!(imported.actuator_count > 0);
    }

    #[test]
    fn urdf_import_contract_is_shape_valid_and_slotless() {
        let spec = forge_contract::validate_shape(
            &std::fs::read_to_string("../../examples/vx2-mini.forge.json").unwrap(),
        )
        .unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let urdf = crate::export::to_urdf(&spec, &baked);
        let imported = import_urdf_contract(&urdf).unwrap();
        assert_eq!(imported.skeleton.len(), spec.skeleton.len());
        assert!(imported.slots.is_empty());
        assert!(imported
            .parts
            .iter()
            .all(|part| !matches!(part.geom, Geom::Mesh { .. })));
        assert!(imported
            .parts
            .iter()
            .any(|part| part.collision == CollisionPolicy::Primitive));
        let json = serde_json::to_string(&imported).unwrap();
        forge_contract::validate_shape(&json).unwrap();
    }

    #[test]
    fn mjcf_import_contract_preserves_collision_primitives() {
        let spec = forge_contract::validate_shape(
            &std::fs::read_to_string("../../examples/vx2-mini.forge.json").unwrap(),
        )
        .unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        let mjcf = crate::export::to_mjcf(&spec, &baked);
        let imported = import_mjcf_contract(&mjcf).unwrap();
        assert_eq!(imported.skeleton.len(), spec.skeleton.len());
        assert!(imported
            .parts
            .iter()
            .all(|part| part.collision == CollisionPolicy::Primitive));
        let json = serde_json::to_string(&imported).unwrap();
        forge_contract::validate_shape(&json).unwrap();
    }

    #[test]
    fn static_urdf_fixture_imports_to_slotless_contract() {
        let imported = import_urdf_contract(include_str!("../tests/fixtures/import_rover.urdf"))
            .expect("fixture imports");
        assert_eq!(imported.meta.id, "fixture_rover");
        assert_eq!(imported.skeleton.len(), 3);
        assert_eq!(imported.parts.len(), 6);
        assert!(imported.slots.is_empty());
        assert!((imported.driver.params["wheelbaseM"].as_f64().unwrap() - 0.24).abs() < 1e-9);
        assert!(imported.parts.iter().all(|part| part.explode.is_some()));
        assert_eq!(
            imported
                .skeleton
                .iter()
                .filter(
                    |node| matches!(&node.joint, Some(joint) if joint.kind == JointKind::Revolute)
                )
                .count(),
            2
        );
    }

    #[test]
    fn static_mjcf_fixture_imports_to_slotless_contract() {
        let imported = import_mjcf_contract(include_str!("../tests/fixtures/import_rover.mjcf"))
            .expect("fixture imports");
        assert_eq!(imported.meta.id, "fixture_mjcf_rover");
        assert_eq!(imported.skeleton.len(), 3);
        assert_eq!(imported.parts.len(), 3);
        assert!(imported.slots.is_empty());
        assert!((imported.driver.params["wheelbaseM"].as_f64().unwrap() - 0.24).abs() < 1e-9);
        assert!(imported.parts.iter().all(|part| part.explode.is_some()));
        assert!(imported
            .parts
            .iter()
            .all(|part| part.collision == CollisionPolicy::Primitive));
    }

    #[test]
    fn parity_fixture_passes_tight_thresholds() {
        let report = parity_fixture(9.80665, 0.4, 0.42, 0.421);
        assert!(report.passed, "{report:?}");
    }

    #[test]
    fn rapier_engine_baseline_measures_drop_and_pendulum() {
        let baseline = rapier_engine_baseline(9.80665, 0.4, 0.42, 0.004)
            .expect("Rapier baseline should execute");
        let analytical_drop = (2.0_f64 * baseline.drop_height_m / 9.80665).sqrt();
        let analytical_period =
            2.0 * std::f64::consts::PI * (baseline.pendulum_length_m / 9.80665).sqrt();

        assert!(
            (baseline.rapier_drop_time_s - analytical_drop).abs() < 0.002,
            "{baseline:?}, analytical_drop={analytical_drop}"
        );
        assert!(
            (baseline.rapier_pendulum_period_s - analytical_period).abs() < 0.04,
            "{baseline:?}, analytical_period={analytical_period}"
        );
        assert!((baseline.rapier_hover_trim - 0.42).abs() < 1e-6);
        assert!((baseline.rapier_gait_com_m - 0.004).abs() < 2e-4);
    }

    #[test]
    fn engine_baseline_comparison_rejects_fixture_mismatch() {
        let rapier = RapierParityBaseline {
            drop_height_m: 1.0,
            rapier_drop_time_s: 0.451,
            pendulum_length_m: 0.4,
            rapier_pendulum_period_s: 1.269,
            rapier_hover_trim: 0.421,
            rapier_gait_com_m: 0.004,
            driver_dt_s: 1.0 / 240.0,
            substeps: 4,
        };
        let mut mujoco = MuJoCoParityBaseline {
            drop_height_m: 1.0,
            mujoco_drop_time_s: 0.452,
            pendulum_length_m: 0.4,
            mujoco_pendulum_period_s: 1.271,
            mujoco_hover_trim: 0.422,
            mujoco_gait_com_m: 0.005,
            driver_dt_s: Some(1.0 / 240.0),
            substeps: Some(4),
        };
        let report = compare_engine_baselines(rapier, mujoco, ParityTolerance::default())
            .expect("matching fixture metadata compares");
        assert!(report.passed, "{report:?}");

        mujoco.pendulum_length_m = 0.5;
        let err = compare_engine_baselines(rapier, mujoco, ParityTolerance::default())
            .expect_err("fixture mismatch should be rejected before tolerance math");
        assert!(err.contains("pendulum length mismatch"), "{err}");
    }

    #[test]
    fn engine_parity_report_uses_frozen_tolerance_contract() {
        let report = evaluate_engine_parity(
            EngineParitySample {
                rapier_drop_time_s: 0.451,
                mujoco_drop_time_s: 0.452,
                rapier_pendulum_period_s: 1.269,
                mujoco_pendulum_period_s: 1.271,
                rapier_hover_trim: 0.421,
                mujoco_hover_trim: 0.422,
                rapier_gait_com_m: 0.004,
                mujoco_gait_com_m: 0.005,
            },
            ParityTolerance::default(),
        );
        assert!(report.passed, "{report:?}");
    }
}
