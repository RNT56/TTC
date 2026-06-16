//! Engine-backed Rapier runtime adapter (P6-001).
//!
//! The serialized scene summary lives in `runtime`; this module turns that
//! summary plus the deterministic collider fit into an executable Rapier world.

use crate::heavy::fit_compound_colliders;
use crate::runtime::{compile_rapier_fixture, RapierScene};
use forge_contract::ModelSpec;
use forge_geometry::{BakedModel, Mat4};
use rapier3d::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapierWorldConfig {
    /// Driver frame duration. The default 1/120 s frame is split into two 240 Hz
    /// physics substeps.
    pub dt_s: f64,
    pub substeps: u32,
    pub fixed_roots: bool,
    pub include_ground: bool,
}

impl Default for RapierWorldConfig {
    fn default() -> Self {
        Self {
            dt_s: 1.0 / 120.0,
            substeps: 2,
            fixed_roots: false,
            include_ground: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapierBodyPose {
    pub node: String,
    pub translation_m: [f64; 3],
    pub rotation_wxyz: [f64; 4],
    pub linvel_mps: [f64; 3],
    pub angvel_radps: [f64; 3],
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RapierStepResult {
    pub t_s: f64,
    pub substeps: u32,
    pub body_count: usize,
    pub collider_count: usize,
    pub joint_count: usize,
    pub poses: Vec<RapierBodyPose>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum RapierBuildError {
    BadConfig(String),
    MissingNodeWorld(String),
    MissingBody(String),
    MissingParent { node: String, parent: String },
}

impl std::fmt::Display for RapierBuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RapierBuildError::BadConfig(message) => write!(f, "{message}"),
            RapierBuildError::MissingNodeWorld(node) => {
                write!(f, "node '{node}' has no baked world transform")
            }
            RapierBuildError::MissingBody(node) => write!(f, "node '{node}' has no Rapier body"),
            RapierBuildError::MissingParent { node, parent } => {
                write!(
                    f,
                    "joint node '{node}' references missing parent body '{parent}'"
                )
            }
        }
    }
}

impl std::error::Error for RapierBuildError {}

struct CompiledJoint {
    handle: ImpulseJointHandle,
    max_torque_nm: Option<f64>,
    max_vel_rad: Option<f64>,
    revolute: bool,
}

pub struct RapierWorld {
    world: PhysicsWorld,
    scene: RapierScene,
    config: RapierWorldConfig,
    t_s: f64,
    node_order: Vec<String>,
    bodies_by_node: BTreeMap<String, RigidBodyHandle>,
    joints_by_node: BTreeMap<String, CompiledJoint>,
}

impl RapierWorld {
    pub fn from_contract(
        spec: &ModelSpec,
        baked: &BakedModel,
        config: RapierWorldConfig,
    ) -> Result<Self, RapierBuildError> {
        if !config.dt_s.is_finite() || config.dt_s <= 0.0 {
            return Err(RapierBuildError::BadConfig(
                "Rapier dt_s must be positive and finite".to_string(),
            ));
        }
        if config.substeps == 0 {
            return Err(RapierBuildError::BadConfig(
                "Rapier substeps must be at least 1".to_string(),
            ));
        }

        let scene = compile_rapier_fixture(spec, baked);
        let colliders = fit_compound_colliders(spec, baked);
        let mut world = PhysicsWorld::new();
        world.gravity = Vector::new(0.0, -(spec.env.gravity as Real), 0.0);
        world.integration_parameters.dt = (config.dt_s / f64::from(config.substeps)) as Real;

        if config.include_ground {
            let ground = RigidBodyBuilder::fixed()
                .translation(Vector::new(0.0, -0.05, 0.0))
                .build();
            let collider = ColliderBuilder::cuboid(50.0, 0.05, 50.0)
                .friction(0.8)
                .build();
            world.insert(ground, collider);
        }

        let roots: BTreeMap<_, _> = spec
            .skeleton
            .iter()
            .map(|node| (node.name.as_str(), node.parent.is_none()))
            .collect();
        let fitted_colliders_by_node = colliders.per_node.clone();
        let mut bodies_by_node = BTreeMap::new();
        let mut node_order = Vec::new();
        for body in &scene.bodies {
            let transform = baked
                .node_world
                .get(&body.node)
                .copied()
                .ok_or_else(|| RapierBuildError::MissingNodeWorld(body.node.clone()))?;
            let is_fixed_root =
                config.fixed_roots && roots.get(body.node.as_str()).copied().unwrap_or(false);
            let has_fitted_colliders = fitted_colliders_by_node
                .get(&body.node)
                .copied()
                .unwrap_or(0)
                > 0;
            let builder = if is_fixed_root || body.mass_kg <= 0.0 {
                RigidBodyBuilder::fixed().pose(mat4_to_pose(transform))
            } else if has_fitted_colliders {
                RigidBodyBuilder::dynamic().pose(mat4_to_pose(transform))
            } else {
                RigidBodyBuilder::dynamic()
                    .pose(mat4_to_pose(transform))
                    .additional_mass(body.mass_kg.max(1e-6) as Real)
            };
            let handle = world.insert_body(builder.build());
            bodies_by_node.insert(body.node.clone(), handle);
            node_order.push(body.node.clone());
        }

        for primitive in &colliders.primitives {
            let handle = *bodies_by_node
                .get(&primitive.node)
                .ok_or_else(|| RapierBuildError::MissingBody(primitive.node.clone()))?;
            let part = &spec.parts[primitive.part_index];
            let baked_part = baked
                .parts
                .iter()
                .find(|part| part.part_index == primitive.part_index);
            let mass_kg = baked_part
                .map(|part_mesh| {
                    forge_geometry::part_mass_g(&part.mass, part.material, &part_mesh.mesh) / 1000.0
                })
                .unwrap_or(0.0);
            let center = vec3(primitive.center_m);
            let collider = match primitive.kind.as_str() {
                "cylinder" => ColliderBuilder::cylinder(
                    primitive
                        .height_m
                        .unwrap_or(2.0 * primitive.half_extents_m[1]) as Real
                        / 2.0,
                    primitive.radius_m.unwrap_or(primitive.half_extents_m[0]) as Real,
                ),
                _ => ColliderBuilder::cuboid(
                    primitive.half_extents_m[0] as Real,
                    primitive.half_extents_m[1] as Real,
                    primitive.half_extents_m[2] as Real,
                ),
            }
            .mass(mass_kg.max(1e-6) as Real)
            .position(Pose::from_translation(center))
            .build();
            world
                .colliders
                .insert_with_parent(collider, handle, &mut world.bodies);
        }

        let node_by_name: BTreeMap<_, _> = spec
            .skeleton
            .iter()
            .map(|node| (node.name.as_str(), node))
            .collect();
        let mut joints_by_node = BTreeMap::new();
        for joint in &scene.joints {
            let child = *bodies_by_node
                .get(&joint.node)
                .ok_or_else(|| RapierBuildError::MissingBody(joint.node.clone()))?;
            let parent = *bodies_by_node.get(&joint.parent).ok_or_else(|| {
                RapierBuildError::MissingParent {
                    node: joint.node.clone(),
                    parent: joint.parent.clone(),
                }
            })?;
            let node = node_by_name
                .get(joint.node.as_str())
                .ok_or_else(|| RapierBuildError::MissingBody(joint.node.clone()))?;
            let parent_anchor = vec3(node.pos);
            let child_anchor = Vector::ZERO;
            let axis = normalized(joint.axis.unwrap_or([0.0, 1.0, 0.0]));
            let (handle, revolute) = match joint.kind.as_str() {
                "revolute" => {
                    let mut builder = RevoluteJointBuilder::new(axis)
                        .local_anchor1(parent_anchor)
                        .local_anchor2(child_anchor)
                        .contacts_enabled(false);
                    if let Some(limits) = joint_limit(axis, joint.limits) {
                        builder = builder.limits(limits);
                    }
                    if let Some(max_torque) = joint.max_torque_nm {
                        builder = builder.motor_max_force(max_torque.max(0.0) as Real);
                    }
                    if let Some(max_vel) = joint.max_vel_rad {
                        builder = builder.motor_velocity(0.0, max_vel.max(0.0) as Real);
                    }
                    (
                        world
                            .impulse_joints
                            .insert(parent, child, builder.build(), true),
                        true,
                    )
                }
                "spherical" => (
                    world.impulse_joints.insert(
                        parent,
                        child,
                        SphericalJointBuilder::new()
                            .local_anchor1(parent_anchor)
                            .local_anchor2(child_anchor)
                            .contacts_enabled(false)
                            .build(),
                        true,
                    ),
                    false,
                ),
                _ => (
                    world.impulse_joints.insert(
                        parent,
                        child,
                        FixedJointBuilder::new()
                            .local_anchor1(parent_anchor)
                            .local_anchor2(child_anchor)
                            .contacts_enabled(false)
                            .build(),
                        true,
                    ),
                    false,
                ),
            };
            joints_by_node.insert(
                joint.node.clone(),
                CompiledJoint {
                    handle,
                    max_torque_nm: joint.max_torque_nm,
                    max_vel_rad: joint.max_vel_rad,
                    revolute,
                },
            );
        }

        Ok(Self {
            world,
            scene,
            config,
            t_s: 0.0,
            node_order,
            bodies_by_node,
            joints_by_node,
        })
    }

    pub fn scene(&self) -> &RapierScene {
        &self.scene
    }

    pub fn body_pose(&self, node: &str) -> Option<RapierBodyPose> {
        let handle = self.bodies_by_node.get(node)?;
        let body = self.world.bodies.get(*handle)?;
        Some(body_pose(node, body))
    }

    pub fn body_local_point_world(&self, node: &str, local_m: [f64; 3]) -> Option<[f64; 3]> {
        let handle = self.bodies_by_node.get(node)?;
        let body = self.world.bodies.get(*handle)?;
        let p = body.position().transform_point(vec3(local_m));
        Some([f64::from(p.x), f64::from(p.y), f64::from(p.z)])
    }

    pub fn set_body_velocity(
        &mut self,
        node: &str,
        linvel_mps: [f64; 3],
        angvel_radps: [f64; 3],
    ) -> bool {
        let Some(handle) = self.bodies_by_node.get(node).copied() else {
            return false;
        };
        let Some(body) = self.world.bodies.get_mut(handle) else {
            return false;
        };
        body.set_linvel(vec3(linvel_mps), true);
        body.set_angvel(vec3(angvel_radps), true);
        true
    }

    pub fn set_body_force(&mut self, node: &str, force_n: [f64; 3]) -> bool {
        let Some(handle) = self.bodies_by_node.get(node).copied() else {
            return false;
        };
        let Some(body) = self.world.bodies.get_mut(handle) else {
            return false;
        };
        body.reset_forces(true);
        body.add_force(vec3(force_n), true);
        true
    }

    pub fn set_joint_motor_velocity(
        &mut self,
        node: &str,
        target_vel_rad: f64,
        factor: f64,
    ) -> bool {
        let Some(meta) = self.joints_by_node.get(node) else {
            return false;
        };
        if !meta.revolute {
            return false;
        }
        let clamped = match meta.max_vel_rad {
            Some(max_vel) => target_vel_rad.clamp(-max_vel.abs(), max_vel.abs()),
            None => target_vel_rad,
        };
        let Some(joint) = self.world.impulse_joints.get_mut(meta.handle, true) else {
            return false;
        };
        joint
            .data
            .set_motor_velocity(JointAxis::AngX, clamped as Real, factor.max(0.0) as Real);
        if let Some(max_torque) = meta.max_torque_nm {
            joint
                .data
                .set_motor_max_force(JointAxis::AngX, max_torque.max(0.0) as Real);
        }
        true
    }

    pub fn joint_motor_target_velocity(&self, node: &str) -> Option<f64> {
        let meta = self.joints_by_node.get(node)?;
        let joint = self.world.impulse_joints.get(meta.handle)?;
        joint
            .data
            .motor(JointAxis::AngX)
            .map(|motor| f64::from(motor.target_vel))
    }

    pub fn step(&mut self, dt_s: f64) -> RapierStepResult {
        let dt_s = if dt_s.is_finite() && dt_s > 0.0 {
            dt_s
        } else {
            self.config.dt_s
        };
        let substeps = self.config.substeps.max(1);
        self.world.integration_parameters.dt = (dt_s / f64::from(substeps)) as Real;
        for _ in 0..substeps {
            self.world.step();
        }
        self.t_s += dt_s;
        RapierStepResult {
            t_s: self.t_s,
            substeps,
            body_count: self.bodies_by_node.len(),
            collider_count: self.world.colliders.len(),
            joint_count: self.world.impulse_joints.len(),
            poses: self.poses(),
        }
    }

    pub fn poses(&self) -> Vec<RapierBodyPose> {
        self.node_order
            .iter()
            .filter_map(|node| self.body_pose(node))
            .collect()
    }
}

fn body_pose(node: &str, body: &RigidBody) -> RapierBodyPose {
    let t = body.translation();
    let q = body.rotation();
    let lin = body.linvel();
    let ang = body.angvel();
    RapierBodyPose {
        node: node.to_string(),
        translation_m: [f64::from(t.x), f64::from(t.y), f64::from(t.z)],
        rotation_wxyz: [
            f64::from(q.w),
            f64::from(q.x),
            f64::from(q.y),
            f64::from(q.z),
        ],
        linvel_mps: [f64::from(lin.x), f64::from(lin.y), f64::from(lin.z)],
        angvel_radps: [f64::from(ang.x), f64::from(ang.y), f64::from(ang.z)],
    }
}

fn mat4_to_pose(m: Mat4) -> Pose {
    let x = Vector::new(m[0] as Real, m[1] as Real, m[2] as Real);
    let y = Vector::new(m[4] as Real, m[5] as Real, m[6] as Real);
    let z = Vector::new(m[8] as Real, m[9] as Real, m[10] as Real);
    let rot = Rotation::from_mat3(&Matrix::from_cols(x, y, z));
    Pose::from_parts(
        Vector::new(m[12] as Real, m[13] as Real, m[14] as Real),
        rot,
    )
}

fn vec3(v: [f64; 3]) -> Vector {
    Vector::new(v[0] as Real, v[1] as Real, v[2] as Real)
}

fn normalized(axis: [f64; 3]) -> Vector {
    let v = vec3(axis);
    let n = v.length();
    if n <= 1e-6 {
        Vector::Y
    } else {
        v / n
    }
}

fn joint_limit(axis: Vector, limits: Option<[[f64; 2]; 3]>) -> Option<[Real; 2]> {
    let limits = limits?;
    let components = [axis.x.abs(), axis.y.abs(), axis.z.abs()];
    let dominant = components
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(index, _)| index)
        .unwrap_or(1);
    Some([limits[dominant][0] as Real, limits[dominant][1] as Real])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec_from_json(doc: serde_json::Value) -> (ModelSpec, BakedModel) {
        let spec = forge_contract::validate_shape(&doc.to_string()).unwrap();
        let baked = forge_geometry::bake(&spec).unwrap();
        (spec, baked)
    }

    fn falling_cube() -> (ModelSpec, BakedModel) {
        spec_from_json(serde_json::json!({
          "meta":{"id":"rapier-drop","name":"rapier-drop","version":"2.1.0","archetype":"rover",
                  "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[{"name":"root","parent":null,"pos":[0,1,0]}],
          "parts":[{"node":"root","geom":{"kind":"box","w":0.1,"h":0.1,"d":0.1},
                    "material":"matte","color":"#888888","collision":"primitive","mass":{"valueG":100}}],
          "driver":{"archetype":"rover","params":{"wheelbaseM":0.2,"maxSpeedMs":1.0}}
        }))
    }

    fn arm_spec() -> (ModelSpec, BakedModel) {
        spec_from_json(serde_json::json!({
          "meta":{"id":"rapier-arm","name":"rapier-arm","version":"2.1.0","archetype":"arm",
                  "provenance":{"kind":"human"},"license":"CC0"},
          "skeleton":[
            {"name":"root","parent":null,"pos":[0,0,0]},
            {"name":"link","parent":"root","pos":[0,0.2,0],
             "joint":{"type":"revolute","axis":[1,0,0],"maxTorqueNm":0.7,"maxVelRad":2.5},
             "limits":[[-0.5,0.5],[0,0],[0,0]]}
          ],
          "parts":[
            {"node":"root","geom":{"kind":"box","w":0.08,"h":0.08,"d":0.08},
             "material":"matte","color":"#333333","collision":"primitive","mass":{"valueG":200}},
            {"node":"link","geom":{"kind":"box","w":0.04,"h":0.22,"d":0.04},
             "material":"matte","color":"#555555","collision":"primitive","mass":{"valueG":80}}
          ],
          "driver":{"archetype":"arm","params":{"targetM":[0,0.3,0.1]}}
        }))
    }

    #[test]
    fn rapier_world_steps_dynamic_body_under_contract_gravity() {
        let (spec, baked) = falling_cube();
        let mut world =
            RapierWorld::from_contract(&spec, &baked, RapierWorldConfig::default()).unwrap();
        let before = world.body_pose("root").unwrap().translation_m[1];
        let result = world.step(1.0 / 60.0);
        let after = world.body_pose("root").unwrap().translation_m[1];

        assert_eq!(result.body_count, 1);
        assert_eq!(result.collider_count, 1);
        assert!(
            after < before,
            "expected body to fall: before={before}, after={after}"
        );
        assert!(result.poses[0].linvel_mps[1] < 0.0);
    }

    #[test]
    fn rapier_world_builds_contract_colliders_joints_and_motor_limits() {
        let (spec, baked) = arm_spec();
        let mut world = RapierWorld::from_contract(
            &spec,
            &baked,
            RapierWorldConfig {
                fixed_roots: true,
                ..RapierWorldConfig::default()
            },
        )
        .unwrap();

        assert_eq!(world.scene().body_count, 2);
        assert_eq!(world.scene().joint_count, 1);
        assert_eq!(world.scene().collider_count, 2);
        assert!(world.set_joint_motor_velocity("link", 8.0, 1.0));
        assert_eq!(world.joint_motor_target_velocity("link"), Some(2.5));
        let result = world.step(1.0 / 120.0);
        assert_eq!(result.joint_count, 1);
        assert_eq!(result.collider_count, 2);
    }

    #[test]
    fn rapier_world_rejects_bad_step_config() {
        let (spec, baked) = falling_cube();
        let err = match RapierWorld::from_contract(
            &spec,
            &baked,
            RapierWorldConfig {
                substeps: 0,
                ..RapierWorldConfig::default()
            },
        ) {
            Ok(_) => panic!("expected bad Rapier config to be rejected"),
            Err(err) => err,
        };
        assert_eq!(
            err,
            RapierBuildError::BadConfig("Rapier substeps must be at least 1".to_string())
        );
    }
}
