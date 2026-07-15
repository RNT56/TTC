"""Gymnasium environment over the Rust-owned P7 MuJoCo training bundle."""

from __future__ import annotations

import math
from collections import deque
from typing import Any

import gymnasium as gym
import mujoco
import numpy as np
from gymnasium import spaces

from forge_workers.training.bundle import PINNED_MUJOCO_VERSION, validate_training_bundle
from forge_workers.training.tasks import (
    TASK_COORDINATE_FRAME,
    TASK_SUITE,
    TASK_VERSION,
    task_definition,
    task_definition_hash,
)

_FORGE_TO_MUJOCO = np.asarray(
    [
        [1.0, 0.0, 0.0],
        [0.0, 0.0, -1.0],
        [0.0, 1.0, 0.0],
    ],
    dtype=np.float64,
)

_OBS_LOW = np.asarray(
    [
        -math.pi,
        -math.pi,
        -math.pi,
        -20.0,
        -20.0,
        -20.0,
        -20.0,
        -20.0,
        -20.0,
        -100.0,
        -100.0,
        -100.0,
        0.0,
        0.0,
    ],
    dtype=np.float32,
)
_OBS_HIGH = np.asarray(
    [
        math.pi,
        math.pi,
        math.pi,
        20.0,
        20.0,
        20.0,
        20.0,
        20.0,
        20.0,
        100.0,
        100.0,
        100.0,
        1.0,
        1.0,
    ],
    dtype=np.float32,
)


class ForgeMultirotorTaskEnv(gym.Env[np.ndarray, np.ndarray]):
    """A bounded multirotor task whose policy sees estimator output, never truth."""

    metadata = {"render_modes": []}

    def __init__(
        self,
        bundle: dict[str, Any],
        *,
        task: dict[str, Any] | None = None,
        randomization: dict[str, Any] | None = None,
        episode_steps: int = 500,
        fixed_scenario: dict[str, float] | None = None,
    ) -> None:
        contract_hash = bundle.get("contractHash") if isinstance(bundle, dict) else None
        if not isinstance(contract_hash, str):
            raise ValueError("training bundle contract hash is missing")
        self.bundle = validate_training_bundle(bundle, contract_hash)
        runtime_version = getattr(mujoco, "__version__", "unknown")
        if runtime_version != PINNED_MUJOCO_VERSION:
            raise RuntimeError(
                f"MuJoCo runtime drifted: expected {PINNED_MUJOCO_VERSION}, got {runtime_version}"
            )
        if not 20 <= episode_steps <= 100_000:
            raise ValueError("episode_steps must be between 20 and 100000")
        self.task = _validate_multirotor_task(task or task_definition("hover-hold"))
        self.task_id = str(self.task["id"])
        task_env = self.task["env"]
        self.spawn_forge_m = np.asarray(task_env["spawn"]["pose"][:3], dtype=np.float64)
        self.bounds_forge_m = np.asarray(task_env["boundsM"], dtype=np.float64)
        self.targets = tuple(
            {
                "kind": str(target["kind"]),
                "xyz": np.asarray(target["xyz"], dtype=np.float64),
                "radiusM": float(target["radiusM"]),
            }
            for target in task_env["targets"]
        )

        self.model = mujoco.MjModel.from_xml_string(self.bundle["mjcf"])
        if abs(float(self.model.opt.timestep) - float(self.bundle["timestepS"])) > 1e-12:
            raise RuntimeError("MuJoCo compiled timestep differs from the training bundle")
        self.data = mujoco.MjData(self.model)
        self.body_id = mujoco.mj_name2id(
            self.model,
            mujoco.mjtObj.mjOBJ_BODY,
            self.bundle["rootBodyName"],
        )
        if self.body_id < 1:
            raise RuntimeError("training root body is absent from compiled MuJoCo model")
        joint_adr = int(self.model.body_jntadr[self.body_id])
        joint_count = int(self.model.body_jntnum[self.body_id])
        if joint_count < 1 or int(self.model.jnt_type[joint_adr]) != int(mujoco.mjtJoint.mjJNT_FREE):
            raise RuntimeError("training root does not own a MuJoCo free joint")
        self.free_qpos_adr = int(self.model.jnt_qposadr[joint_adr])

        self.action_space = spaces.Box(low=-1.0, high=1.0, shape=(4,), dtype=np.float32)
        self.observation_space = spaces.Box(low=_OBS_LOW, high=_OBS_HIGH, dtype=np.float32)
        self.episode_steps = episode_steps
        self._target_index = 0
        self._targets_completed = 0
        self._task_completed = False
        self.target_forge_m = self.targets[0]["xyz"].copy()
        self.randomization = dict(randomization or {})
        self.fixed_scenario = dict(fixed_scenario or {})
        self.substeps = int(self.bundle["substeps"])
        self.control_period_s = float(self.bundle["controlPeriodS"])
        self._base_mass = self.model.body_mass.copy()
        self._base_inertia = self.model.body_inertia.copy()
        self._base_friction = self.model.geom_friction.copy()
        self._curve_throttle = np.asarray(
            [point["throttle"] for point in self.bundle["powertrain"]["curve"]],
            dtype=np.float64,
        )
        self._curve_thrust = np.asarray(
            [point["totalThrustN"] for point in self.bundle["powertrain"]["curve"]],
            dtype=np.float64,
        )
        self._curve_voltage = np.asarray(
            [point["normalizedVoltage"] for point in self.bundle["powertrain"]["curve"]],
            dtype=np.float64,
        )
        self._curve_current = np.asarray(
            [point["normalizedCurrent"] for point in self.bundle["powertrain"]["curve"]],
            dtype=np.float64,
        )
        self._step = 0
        self._success_steps = 0
        self._energy_wh = 0.0
        self._previous_error_m = 0.0
        self._estimated_angles = np.zeros(3, dtype=np.float64)
        self._estimated_position = self.target_forge_m.copy()
        self._estimated_velocity = np.zeros(3, dtype=np.float64)
        self._last_gyro = np.zeros(3, dtype=np.float64)
        self._voltage = 1.0
        self._current = 0.0
        self._scenario: dict[str, float] = {}
        self._action_queue: deque[np.ndarray] = deque()

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        scenario = self._sample_scenario()
        if options and isinstance(options.get("scenario"), dict):
            scenario.update(_finite_scenario(options["scenario"]))
        scenario.update(_finite_scenario(self.fixed_scenario))
        self._scenario = scenario

        self.model.body_mass[:] = self._base_mass * scenario["massScale"]
        self.model.body_inertia[:] = self._base_inertia * scenario["massScale"]
        self.model.geom_friction[:] = self._base_friction
        if self.model.geom_friction.size:
            self.model.geom_friction[:, 0] *= scenario["frictionScale"]
        mujoco.mj_resetData(self.model, self.data)
        mujoco.mj_setConst(self.model, self.data)

        qpos = self.free_qpos_adr
        spawn_forge = self.spawn_forge_m + self.np_random.uniform(
            low=np.asarray([-0.35, -0.2, -0.35]),
            high=np.asarray([0.35, 0.2, 0.35]),
        )
        self.data.qpos[qpos : qpos + 3] = _FORGE_TO_MUJOCO @ spawn_forge
        self.data.qpos[qpos + 3 : qpos + 7] = np.asarray([1.0, 0.0, 0.0, 0.0])
        mujoco.mj_forward(self.model, self.data)

        self._step = 0
        self._success_steps = 0
        self._energy_wh = 0.0
        self._target_index = 0
        self._targets_completed = 0
        self._task_completed = False
        self.target_forge_m = self.targets[0]["xyz"].copy()
        self._estimated_angles.fill(0.0)
        self._estimated_position = spawn_forge.copy()
        self._estimated_velocity.fill(0.0)
        self._previous_error_m = float(np.linalg.norm(self.target_forge_m - spawn_forge))
        self._last_gyro.fill(0.0)
        self._voltage = 1.0
        self._current = 0.0
        latency_steps = int(round(scenario["latencyMs"] / (self.control_period_s * 1_000.0)))
        # Policy actions are normalized flight targets. Zero collective means
        # contract-derived hover trim, matching browser drive-mode semantics;
        # latency therefore starts from a neutral stick frame.
        neutral_action = np.zeros(4, dtype=np.float64)
        self._action_queue = deque((neutral_action.copy() for _ in range(latency_steps + 1)))
        observation = self._observation(update=False)
        return observation, self._info(False, False)

    def step(self, action: np.ndarray) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        bounded_action = np.asarray(action, dtype=np.float64).reshape(-1)
        if bounded_action.shape != (4,) or not np.isfinite(bounded_action).all():
            raise ValueError("policy action must be a finite 4-vector")
        bounded_action = np.clip(bounded_action, -1.0, 1.0)
        self._action_queue.append(bounded_action)
        applied = self._action_queue.popleft()

        hover_throttle = float(self.bundle["hoverThrottle"])
        throttle = (
            hover_throttle + applied[0] * (1.0 - hover_throttle)
            if applied[0] >= 0.0
            else hover_throttle * (1.0 + applied[0])
        )
        thrust_n = float(np.interp(throttle, self._curve_throttle, self._curve_thrust))
        thrust_n *= self._scenario["kvScale"] ** 2
        thrust_n *= self._scenario["sagScale"]
        self._voltage = float(np.interp(throttle, self._curve_throttle, self._curve_voltage))
        self._voltage *= self._scenario["sagScale"]
        self._current = float(np.interp(throttle, self._curve_throttle, self._curve_current))

        rotation_mujoco = self.data.xmat[self.body_id].reshape(3, 3).copy()
        force_local_mujoco = np.asarray([0.0, 0.0, thrust_n], dtype=np.float64)
        force_world = rotation_mujoco @ force_local_mujoco
        force_world += np.asarray([0.08 * self._scenario["windMps"], 0.0, 0.0])
        # The public roll/pitch/yaw values are bounded flight targets, never
        # raw torque fractions. This deterministic inner loop mirrors the
        # angle/rate mode used by the browser motion driver while retaining
        # the Rust-derived physical torque ceilings.
        reward_contract = self.task["reward"]
        inner_control = reward_contract["control"]
        desired_roll = -applied[1] * float(self.bundle["control"]["tiltMaxRad"])
        desired_pitch = applied[2] * float(self.bundle["control"]["tiltMaxRad"])
        desired_yaw_rate = applied[3] * float(self.bundle["control"]["yawRateRadS"])
        attitude_proportional = float(inner_control["attitudeProportional"])
        rate_damping = float(inner_control["angularRateDamping"])
        yaw_rate_proportional = float(inner_control["yawRateProportional"])
        roll_effort = (
            attitude_proportional * (desired_roll - self._estimated_angles[0])
            - rate_damping * self._last_gyro[0]
        )
        pitch_effort = (
            attitude_proportional * (desired_pitch - self._estimated_angles[1])
            - rate_damping * self._last_gyro[1]
        )
        yaw_effort = yaw_rate_proportional * (desired_yaw_rate - self._last_gyro[2])
        torque_local_forge = np.asarray(
            [
                np.clip(roll_effort, -1.0, 1.0)
                * float(self.bundle["control"]["maxRollPitchTorqueNm"]),
                np.clip(yaw_effort, -1.0, 1.0)
                * float(self.bundle["control"]["maxYawTorqueNm"]),
                np.clip(pitch_effort, -1.0, 1.0)
                * float(self.bundle["control"]["maxRollPitchTorqueNm"]),
            ],
            dtype=np.float64,
        )
        torque_world = rotation_mujoco @ (_FORGE_TO_MUJOCO @ torque_local_forge)
        self.data.xfrc_applied.fill(0.0)
        self.data.xfrc_applied[self.body_id, :3] = force_world
        self.data.xfrc_applied[self.body_id, 3:] = torque_world
        for _ in range(self.substeps):
            mujoco.mj_step(self.model, self.data)
        self.data.xfrc_applied.fill(0.0)

        self._step += 1
        volts = self._voltage * float(self.bundle["powertrain"]["nominalVoltageV"])
        amps = self._current * float(self.bundle["powertrain"]["maxTotalCurrentA"])
        self._energy_wh += volts * amps * self.control_period_s / 3_600.0
        observation = self._observation(update=True)
        position_error = float(np.linalg.norm(observation[9:12]))
        tilt = float(np.linalg.norm(observation[:2]))
        rate = float(np.linalg.norm(observation[3:6]))
        active_target = self.targets[self._target_index]
        instant_success = (
            position_error <= float(active_target["radiusM"])
            and tilt < 0.25
            and rate < 0.6
        )
        if instant_success:
            self._success_steps += 1
        target_advanced = False
        if active_target["kind"] == "waypoint" and position_error <= float(active_target["radiusM"]):
            self._targets_completed += 1
            target_advanced = True
            if self._targets_completed == len(self.targets):
                self._task_completed = True
            else:
                self._target_index += 1
                self.target_forge_m = self.targets[self._target_index]["xyz"].copy()
                observation = self._observation(update=False)
        progress_m = self._previous_error_m - position_error
        self._previous_error_m = (
            float(np.linalg.norm(observation[9:12]))
            if target_advanced and not self._task_completed
            else position_error
        )
        position_forge = self._position_forge()
        unsafe = bool(
            not np.isfinite(self.data.qpos).all()
            or position_forge[1] < -0.2
            or np.any(np.abs(position_forge) > self.bounds_forge_m * 0.5 + 0.5)
            or tilt > 1.5
        )
        terminated = unsafe or self._task_completed
        truncated = self._step >= self.episode_steps
        reward = (
            math.exp(-float(reward_contract["proximityDecayPerM"]) * position_error)
            + float(reward_contract["progressWeight"]) * progress_m
            + (float(reward_contract["instantSuccessBonus"]) if instant_success else 0.0)
            + (float(reward_contract["targetAdvanceBonus"]) if target_advanced else 0.0)
            + (float(reward_contract["taskCompletionBonus"]) if self._task_completed else 0.0)
            - float(reward_contract["tiltPenalty"]) * tilt
            - float(reward_contract["angularRatePenalty"]) * rate
            - float(reward_contract["actionPenalty"]) * float(np.square(applied).sum())
            - (float(reward_contract["unsafeTerminationPenalty"]) if unsafe else 0.0)
        )
        return observation, float(reward), terminated, truncated, self._info(instant_success, target_advanced)

    def _sample_scenario(self) -> dict[str, float]:
        mass_pct = _range_max(self.randomization.get("massPct"), 15.0)
        kv_pct = _range_max(self.randomization.get("kvPct"), 8.0)
        sag_pct = _range_max(self.randomization.get("sagPct"), 20.0)
        latency_min, latency_max = _pair(self.randomization.get("latencyMs"), (0.0, 30.0))
        friction_min, friction_max = _pair(self.randomization.get("friction"), (0.4, 1.2))
        wind_min, wind_max = _pair(self.randomization.get("windMps"), (0.0, 4.0))
        dropout_min, dropout_max = _pair(self.randomization.get("obsDropoutPct"), (0.0, 5.0))
        noise_min, noise_max = _pair(self.randomization.get("imuNoiseScale"), (0.5, 1.5))
        bias_min, bias_max = _pair(self.randomization.get("imuBiasScale"), (0.5, 1.5))
        return {
            "massScale": float(self.np_random.uniform(1.0 - mass_pct / 100.0, 1.0 + mass_pct / 100.0)),
            "kvScale": float(self.np_random.uniform(1.0 - kv_pct / 100.0, 1.0 + kv_pct / 100.0)),
            "sagScale": float(self.np_random.uniform(1.0 - sag_pct / 100.0, 1.0)),
            "latencyMs": float(self.np_random.uniform(latency_min, latency_max)),
            "frictionScale": float(self.np_random.uniform(friction_min, friction_max) / 0.8),
            "windMps": float(self.np_random.uniform(wind_min, wind_max)),
            "dropoutPct": float(self.np_random.uniform(dropout_min, dropout_max)),
            "imuNoiseScale": float(self.np_random.uniform(noise_min, noise_max)),
            "imuBiasScale": float(self.np_random.uniform(bias_min, bias_max)),
        }

    def _observation(self, *, update: bool) -> np.ndarray:
        rotation_mujoco = self.data.xmat[self.body_id].reshape(3, 3)
        rotation_forge = _FORGE_TO_MUJOCO.T @ rotation_mujoco @ _FORGE_TO_MUJOCO
        truth_angles = _matrix_to_rpy(rotation_forge)
        angular_mujoco = np.asarray(self.data.cvel[self.body_id, :3], dtype=np.float64)
        angular_forge_xyz = _FORGE_TO_MUJOCO.T @ angular_mujoco
        # Forge is Y-up: roll is rotation about X, pitch about Z, and yaw
        # about Y. The executable tensor is ordered roll/pitch/yaw, not raw
        # coordinate-axis order.
        truth_rate = angular_forge_xyz[[0, 2, 1]]
        truth_position = self._position_forge()
        if update:
            estimator = self.bundle["estimator"]
            noise_scale = self._scenario["imuNoiseScale"]
            gyro = truth_rate + float(estimator["bias"]) * self._scenario["imuBiasScale"] + self.np_random.normal(
                0.0,
                float(estimator["gyroNoise"]) * noise_scale,
                size=3,
            )
            accel_angle = truth_angles + self.np_random.normal(
                0.0,
                float(estimator["accelNoise"]) * noise_scale,
                size=3,
            )
            self._estimated_angles = 0.98 * (
                self._estimated_angles + gyro * self.control_period_s
            ) + 0.02 * accel_angle
            self._last_gyro = gyro
            latency_s = self._scenario["latencyMs"] / 1_000.0
            position_alpha = float(np.clip(self.control_period_s / (latency_s + self.control_period_s), 0.02, 1.0))
            previous_position = self._estimated_position.copy()
            self._estimated_position += (truth_position - self._estimated_position) * position_alpha
            raw_velocity = (self._estimated_position - previous_position) / self.control_period_s
            velocity_tau_s = float(self.task["reward"]["control"]["velocityFilterTauS"])
            velocity_alpha = self.control_period_s / (velocity_tau_s + self.control_period_s)
            self._estimated_velocity += (raw_velocity - self._estimated_velocity) * velocity_alpha
        error_world = self.target_forge_m - self._estimated_position
        yaw = float(self._estimated_angles[2])
        sin_yaw, cos_yaw = math.sin(yaw), math.cos(yaw)
        error_body = np.asarray(
            [
                error_world[0] * cos_yaw - error_world[2] * sin_yaw,
                error_world[1],
                error_world[0] * sin_yaw + error_world[2] * cos_yaw,
            ],
            dtype=np.float64,
        )
        velocity_body = np.asarray(
            [
                self._estimated_velocity[0] * cos_yaw - self._estimated_velocity[2] * sin_yaw,
                self._estimated_velocity[1],
                self._estimated_velocity[0] * sin_yaw + self._estimated_velocity[2] * cos_yaw,
            ],
            dtype=np.float64,
        )
        observation = np.concatenate(
            [
                np.clip(self._estimated_angles, -math.pi, math.pi),
                np.clip(self._last_gyro, -20.0, 20.0),
                np.clip(velocity_body, -20.0, 20.0),
                np.clip(error_body, -100.0, 100.0),
                np.asarray([self._voltage, self._current]),
            ]
        ).astype(np.float32)
        if update and self._scenario["dropoutPct"] > 0:
            dropout = self.np_random.random(9) < self._scenario["dropoutPct"] / 100.0
            observation[:9][dropout] = 0.0
        return np.clip(observation, _OBS_LOW, _OBS_HIGH).astype(np.float32)

    def _position_forge(self) -> np.ndarray:
        return _FORGE_TO_MUJOCO.T @ np.asarray(self.data.xpos[self.body_id], dtype=np.float64)

    def _info(self, instant_success: bool, target_advanced: bool) -> dict[str, Any]:
        success_fraction = (
            self._targets_completed / len(self.targets)
            if self.targets[0]["kind"] == "waypoint"
            else self._success_steps / max(1, self._step)
        )
        return {
            "taskId": self.task_id,
            "instantSuccess": instant_success,
            "successFraction": success_fraction,
            "taskSuccessFraction": success_fraction,
            "activeTargetIndex": self._target_index,
            "targetsCompleted": self._targets_completed,
            "targetCount": len(self.targets),
            "targetAdvanced": target_advanced,
            "taskCompleted": self._task_completed,
            "energyWh": self._energy_wh,
            "scenario": dict(self._scenario),
            "trainedOnEstimator": True,
            "targetAdvanceSource": "estimator.target.error",
            "truthExposedToPolicy": False,
        }


class ForgeHoverEnv(ForgeMultirotorTaskEnv):
    """Compatibility entry point for the worker-owned hover task."""

    def __init__(
        self,
        bundle: dict[str, Any],
        *,
        randomization: dict[str, Any] | None = None,
        episode_steps: int = 500,
        fixed_scenario: dict[str, float] | None = None,
    ) -> None:
        super().__init__(
            bundle,
            task=task_definition("hover-hold"),
            randomization=randomization,
            episode_steps=episode_steps,
            fixed_scenario=fixed_scenario,
        )


def _validate_multirotor_task(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("training task must be a worker-owned object")
    task_id = value.get("id")
    if task_id not in {"hover-hold", "waypoint-chain"}:
        raise ValueError("real multirotor runtime supports hover-hold and waypoint-chain only")
    if value.get("suite") != TASK_SUITE or value.get("version") != TASK_VERSION:
        raise ValueError(f"training task must use {TASK_SUITE} {TASK_VERSION}")
    if value.get("coordinateFrame") != TASK_COORDINATE_FRAME:
        raise ValueError("training task must use Forge Y-up/right-handed/SI coordinates")
    if value.get("family") != "multirotor" or value.get("archetype") != "multirotor":
        raise ValueError("real multirotor runtime refuses non-multirotor task shapes")
    definition_hash = value.get("definitionHash")
    if (
        not isinstance(definition_hash, str)
        or len(definition_hash) != 64
        or definition_hash != task_definition_hash(value)
    ):
        raise ValueError("training task definition hash is missing or drifted")
    curriculum_stage = value.get("curriculumStage")
    if (
        isinstance(curriculum_stage, bool)
        or not isinstance(curriculum_stage, int)
        or not 1 <= curriculum_stage <= 100
    ):
        raise ValueError("training task curriculum stage is outside its supported bound")
    owned = task_definition(str(task_id), curriculum_stage=curriculum_stage)
    if definition_hash != owned["definitionHash"]:
        raise ValueError("training task is not the exact worker-owned definition")
    env = value.get("env")
    if not isinstance(env, dict):
        raise ValueError("training task env is missing")
    bounds = _bounded_vector(env.get("boundsM"), "training task bounds", positive=True)
    spawn = env.get("spawn")
    pose = spawn.get("pose") if isinstance(spawn, dict) else None
    if not isinstance(pose, list) or len(pose) != 6:
        raise ValueError("training task spawn must be a six-axis Forge pose")
    spawn_xyz = _bounded_vector(pose[:3], "training task spawn")
    if any(abs(spawn_xyz[index]) > bounds[index] * 0.5 for index in range(3)):
        raise ValueError("training task spawn lies outside its declared bounds")
    targets = env.get("targets")
    if not isinstance(targets, list) or not 1 <= len(targets) <= 32:
        raise ValueError("training task requires between one and 32 targets")
    expected_kind = "position" if task_id == "hover-hold" else "waypoint"
    for index, target in enumerate(targets):
        if not isinstance(target, dict) or target.get("kind") != expected_kind:
            raise ValueError(f"training task target {index} has an unsupported kind")
        xyz = _bounded_vector(target.get("xyz"), f"training task target {index}")
        if any(abs(xyz[axis]) > bounds[axis] * 0.5 for axis in range(3)):
            raise ValueError(f"training task target {index} lies outside its declared bounds")
        radius = target.get("radiusM")
        if (
            isinstance(radius, bool)
            or not isinstance(radius, (int, float))
            or not math.isfinite(radius)
            or not 0.01 <= float(radius) <= 100.0
        ):
            raise ValueError(f"training task target {index} radius is outside its supported bound")
    return value


def _bounded_vector(value: Any, label: str, *, positive: bool = False) -> tuple[float, float, float]:
    if (
        not isinstance(value, list)
        or len(value) != 3
        or any(
            isinstance(item, bool)
            or not isinstance(item, (int, float))
            or not math.isfinite(item)
            or abs(float(item)) > 2_000.0
            for item in value
        )
    ):
        raise ValueError(f"{label} must be a bounded finite three-vector")
    result = tuple(float(item) for item in value)
    if positive and any(item <= 0 for item in result):
        raise ValueError(f"{label} must be positive")
    return result


def _matrix_to_rpy(rotation: np.ndarray) -> np.ndarray:
    """Decompose a Forge Y-up matrix as roll(X), pitch(Z), yaw(Y).

    This inverts ``R = Ry(yaw) @ Rz(pitch) @ Rx(roll)``. The public policy
    tensor names conceptual flight axes, so using the usual Z-up XYZ
    decomposition would silently exchange pitch and yaw.
    """

    pitch = math.asin(float(np.clip(rotation[1, 0], -1.0, 1.0)))
    if abs(math.cos(pitch)) > 1e-8:
        roll = math.atan2(float(-rotation[1, 2]), float(rotation[1, 1]))
        yaw = math.atan2(float(-rotation[2, 0]), float(rotation[0, 0]))
    else:
        roll = math.atan2(float(rotation[2, 1]), float(rotation[2, 2]))
        yaw = 0.0
    return np.asarray([roll, pitch, yaw], dtype=np.float64)


def _finite_scenario(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        raise ValueError("scenario must be an object")
    allowed = {
        "massScale",
        "kvScale",
        "sagScale",
        "latencyMs",
        "frictionScale",
        "windMps",
        "dropoutPct",
        "imuNoiseScale",
        "imuBiasScale",
    }
    if not set(value).issubset(allowed):
        raise ValueError("scenario contains unsupported fields")
    result: dict[str, float] = {}
    for key, raw in value.items():
        if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw):
            raise ValueError(f"scenario {key} must be finite")
        result[key] = float(raw)
    for key in allowed:
        if key not in result:
            continue
        if key in {"massScale", "kvScale", "sagScale", "frictionScale", "imuNoiseScale", "imuBiasScale"} and result[key] <= 0:
            raise ValueError(f"scenario {key} must be positive")
        if key in {"latencyMs", "windMps", "dropoutPct"} and result[key] < 0:
            raise ValueError(f"scenario {key} must be non-negative")
        if key in {
            "massScale",
            "kvScale",
            "sagScale",
            "frictionScale",
            "imuNoiseScale",
            "imuBiasScale",
        } and result[key] > 10:
            raise ValueError(f"scenario {key} exceeds its supported bound")
        if key == "latencyMs" and result[key] > 10_000:
            raise ValueError("scenario latencyMs exceeds its supported bound")
        if key == "windMps" and result[key] > 100:
            raise ValueError("scenario windMps exceeds its supported bound")
        if key == "dropoutPct" and result[key] > 100:
            raise ValueError("scenario dropoutPct exceeds its supported bound")
    return result


def _range_max(value: Any, default: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return default
    return float(np.clip(value, 0.0, 100.0))


def _pair(value: Any, default: tuple[float, float]) -> tuple[float, float]:
    if (
        not isinstance(value, list)
        or len(value) != 2
        or any(isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item) for item in value)
    ):
        return default
    low, high = float(value[0]), float(value[1])
    if low < 0 or high < low:
        return default
    return low, high


__all__ = ["ForgeHoverEnv", "ForgeMultirotorTaskEnv"]
