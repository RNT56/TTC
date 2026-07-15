"""Contract-derived rover and quadruped MuJoCo training environments."""

from __future__ import annotations

import math
from collections import deque
from typing import Any

import gymnasium as gym
import mujoco
import numpy as np
from gymnasium import spaces

from forge_workers.training.bundle import PINNED_MUJOCO_VERSION, validate_training_bundle
from forge_workers.training.mujoco_env import _FORGE_TO_MUJOCO, _matrix_to_rpy
from forge_workers.training.tasks import (
    GROUND_TASK_SUITE,
    GROUND_TASK_VERSION,
    TASK_COORDINATE_FRAME,
    task_definition,
    task_definition_hash,
)


class ForgeGroundTaskEnv(gym.Env[np.ndarray, np.ndarray]):
    """A rover or quadruped task whose policy sees estimator state only."""

    metadata = {"render_modes": []}

    def __init__(
        self,
        bundle: dict[str, Any],
        *,
        task: dict[str, Any],
        randomization: dict[str, Any] | None = None,
        episode_steps: int = 500,
        fixed_scenario: dict[str, float] | None = None,
    ) -> None:
        contract_hash = bundle.get("contractHash") if isinstance(bundle, dict) else None
        if not isinstance(contract_hash, str):
            raise ValueError("ground training bundle contract hash is missing")
        self.bundle = validate_training_bundle(bundle, contract_hash)
        if self.bundle.get("artifactKind") != "groundTrainingMuJoCoBundle":
            raise ValueError("ground task runtime requires a ground training bundle")
        if getattr(mujoco, "__version__", "unknown") != PINNED_MUJOCO_VERSION:
            raise RuntimeError(
                f"MuJoCo runtime drifted: expected {PINNED_MUJOCO_VERSION}, got {mujoco.__version__}"
            )
        if not 20 <= episode_steps <= 100_000:
            raise ValueError("episode_steps must be between 20 and 100000")
        self.task = _validate_ground_task(task, str(self.bundle["archetype"]))
        self.task_id = str(self.task["id"])
        self.family = str(self.task["family"])
        self.episode_steps = episode_steps
        self.randomization = dict(randomization or {})
        self.fixed_scenario = _finite_ground_scenario(fixed_scenario or {})
        self.control_period_s = float(self.bundle["controlPeriodS"])
        self.substeps = int(self.bundle["substeps"])

        self.model = mujoco.MjModel.from_xml_string(str(self.bundle["mjcf"]))
        if abs(float(self.model.opt.timestep) - float(self.bundle["timestepS"])) > 1e-12:
            raise RuntimeError("MuJoCo compiled timestep differs from the ground training bundle")
        self.data = mujoco.MjData(self.model)
        self.body_id = mujoco.mj_name2id(
            self.model, mujoco.mjtObj.mjOBJ_BODY, str(self.bundle["rootBodyName"])
        )
        if self.body_id < 1:
            raise RuntimeError("ground training root body is absent from compiled MuJoCo model")
        root_joint_adr = int(self.model.body_jntadr[self.body_id])
        if (
            int(self.model.body_jntnum[self.body_id]) < 1
            or int(self.model.jnt_type[root_joint_adr]) != int(mujoco.mjtJoint.mjJNT_FREE)
        ):
            raise RuntimeError("ground training root does not own a MuJoCo free joint")
        self.free_qpos_adr = int(self.model.jnt_qposadr[root_joint_adr])

        self.joints: list[dict[str, Any]] = []
        for authority in self.bundle["control"]["joints"]:
            joint_name = f"{authority['name']}_joint"
            joint_id = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_JOINT, joint_name)
            actuator_id = mujoco.mj_name2id(
                self.model, mujoco.mjtObj.mjOBJ_ACTUATOR, str(authority["motorName"])
            )
            if joint_id < 0 or actuator_id < 0:
                raise RuntimeError("ground control joint or motor is absent from compiled MuJoCo")
            self.joints.append(
                {
                    **authority,
                    "jointId": joint_id,
                    "qposAdr": int(self.model.jnt_qposadr[joint_id]),
                    "dofAdr": int(self.model.jnt_dofadr[joint_id]),
                    "actuatorId": actuator_id,
                }
            )
        output_count = int(self.bundle["tensor"]["output"]["shape"][1])
        input_count = int(self.bundle["tensor"]["input"]["shape"][1])
        self.action_space = spaces.Box(-1.0, 1.0, shape=(output_count,), dtype=np.float32)
        self.observation_space = spaces.Box(
            low=np.full(input_count, -100.0, dtype=np.float32),
            high=np.full(input_count, 100.0, dtype=np.float32),
            dtype=np.float32,
        )
        self.spawn_forge_m = np.asarray(self.task["env"]["spawn"]["pose"][:3], dtype=np.float64)
        self.bounds_forge_m = np.asarray(self.task["env"]["boundsM"], dtype=np.float64)
        self.targets, self.target_radius_m = _ground_targets(self.task)
        self._base_mass = self.model.body_mass.copy()
        self._base_inertia = self.model.body_inertia.copy()
        self._base_friction = self.model.geom_friction.copy()
        self._action_queue: deque[np.ndarray] = deque()
        self._applied_torques = np.zeros(len(self.joints), dtype=np.float64)

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        del options
        mujoco.mj_resetData(self.model, self.data)
        self._scenario = self.fixed_scenario or self._sample_scenario()
        self.model.body_mass[:] = self._base_mass * self._scenario["massScale"]
        self.model.body_inertia[:] = self._base_inertia * self._scenario["massScale"]
        self.model.geom_friction[:] = self._base_friction
        self.model.geom_friction[:, 0] *= self._scenario["frictionScale"]
        self.data.qpos[self.free_qpos_adr : self.free_qpos_adr + 3] = (
            _FORGE_TO_MUJOCO @ self.spawn_forge_m
        )
        self.data.ctrl.fill(0.0)
        mujoco.mj_forward(self.model, self.data)

        self._step = 0
        self._energy_wh = 0.0
        self._task_completed = False
        self._target_index = 1 if self.task_id == "line-follow" else 0
        self._targets_completed = 0
        self.target_forge_m = self.targets[self._target_index].copy()
        self._estimated_angles = np.zeros(3, dtype=np.float64)
        self._last_gyro = np.zeros(3, dtype=np.float64)
        self._estimated_position = self._position_forge().copy()
        self._estimated_velocity = np.zeros(3, dtype=np.float64)
        self._estimated_joint_position = np.asarray(
            [self.data.qpos[joint["qposAdr"]] for joint in self.joints], dtype=np.float64
        )
        self._estimated_joint_velocity = np.zeros(len(self.joints), dtype=np.float64)
        self._normalized_effort = 0.0
        latency_steps = int(
            round(self._scenario["latencyMs"] / (self.control_period_s * 1_000.0))
        )
        self._action_queue = deque(
            [np.zeros(self.action_space.shape, dtype=np.float32) for _ in range(latency_steps + 1)],
            maxlen=latency_steps + 1,
        )
        observation = self._observation(update=True)
        self._previous_error_m = float(np.linalg.norm(observation[8:10]))
        return observation, self._info(False, False)

    def step(
        self, action: np.ndarray
    ) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        requested = np.asarray(action, dtype=np.float32)
        if requested.shape != self.action_space.shape or not np.isfinite(requested).all():
            raise ValueError("ground policy action must match its finite fixed tensor shape")
        self._action_queue.append(np.clip(requested, -1.0, 1.0))
        applied = self._action_queue[0]
        torques = self._control_torques(applied)
        applied_torque_sum = np.zeros(len(self.joints), dtype=np.float64)
        normalized_effort_sum = 0.0
        mechanical_work_j = 0.0
        for _ in range(self.substeps):
            self.data.ctrl.fill(0.0)
            applied_torques = np.zeros(len(self.joints), dtype=np.float64)
            for index, (joint, requested_torque) in enumerate(
                zip(self.joints, torques, strict=True)
            ):
                velocity = float(self.data.qvel[joint["dofAdr"]])
                torque = float(requested_torque)
                if abs(velocity) >= float(joint["maxVelocityRadS"]) and velocity * torque > 0:
                    torque = 0.0
                self.data.ctrl[joint["actuatorId"]] = torque
                applied_torques[index] = torque
            mujoco.mj_step(self.model, self.data)
            mechanical_power_w = sum(
                max(0.0, float(torque) * float(self.data.qvel[joint["dofAdr"]]))
                for joint, torque in zip(self.joints, applied_torques, strict=True)
            )
            mechanical_work_j += mechanical_power_w * float(self.bundle["timestepS"])
            applied_torque_sum += applied_torques
            normalized_effort_sum += float(
                np.mean(
                    [
                        abs(torque) / float(joint["maxTorqueNm"])
                        for joint, torque in zip(self.joints, applied_torques, strict=True)
                    ]
                )
            )
        self._applied_torques = applied_torque_sum / self.substeps
        self._normalized_effort = normalized_effort_sum / self.substeps
        self._energy_wh += mechanical_work_j / 3_600.0
        self._step += 1

        observation = self._observation(update=True)
        position_error = float(np.linalg.norm(observation[8:10]))
        tilt = float(np.linalg.norm(observation[:2]))
        rate = float(np.linalg.norm(observation[3:6]))
        instant_success = position_error <= self.target_radius_m and tilt < 0.8
        target_advanced = False
        if instant_success:
            target_advanced = True
            self._targets_completed += 1
            if self.task_id == "line-follow" and self._target_index + 1 < len(self.targets):
                self._target_index += 1
                self.target_forge_m = self.targets[self._target_index].copy()
                observation = self._observation(update=False)
            else:
                self._task_completed = True
        progress_m = self._previous_error_m - position_error
        self._previous_error_m = (
            float(np.linalg.norm(observation[8:10]))
            if target_advanced and not self._task_completed
            else position_error
        )
        position = self._position_forge()
        unsafe = bool(
            not np.isfinite(self.data.qpos).all()
            or position[1] < -0.05
            or np.any(np.abs(position) > self.bounds_forge_m * 0.5 + 0.5)
            or tilt > 1.5
        )
        terminated = unsafe or self._task_completed
        truncated = self._step >= self.episode_steps
        reward_contract = self.task["reward"]
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

    def _control_torques(self, action: np.ndarray) -> np.ndarray:
        torque_scale = self._scenario["torqueScale"]
        if self.family == "rover":
            drive, turn = float(action[0]), float(action[1])
            efforts = {
                "left": float(np.clip(drive - turn, -1.0, 1.0)),
                "right": float(np.clip(drive + turn, -1.0, 1.0)),
            }
            return np.asarray(
                [
                    efforts[str(joint["side"])]
                    * float(joint["maxTorqueNm"])
                    * torque_scale
                    for joint in self.joints
                ],
                dtype=np.float64,
            )
        return np.asarray(
            [
                float(command) * float(joint["maxTorqueNm"]) * torque_scale
                for joint, command in zip(self.joints, action, strict=True)
            ],
            dtype=np.float64,
        )

    def _sample_scenario(self) -> dict[str, float]:
        randomization = self.randomization
        mass_pct = _bounded_percent(randomization.get("massPct"), 15.0, 15.0)
        torque_pct = _bounded_percent(randomization.get("torquePct"), 10.0, 10.0)
        latency = _pair(randomization.get("latencyMs"), (0.0, 30.0))
        friction = _pair(randomization.get("friction"), (0.4, 1.2))
        dropout = _pair(randomization.get("obsDropoutPct"), (0.0, 5.0))
        noise = _pair(randomization.get("imuNoiseScale"), (0.5, 1.5))
        bias = _pair(randomization.get("imuBiasScale"), (0.5, 1.5))
        return {
            "massScale": float(self.np_random.uniform(1 - mass_pct / 100, 1 + mass_pct / 100)),
            "torqueScale": float(self.np_random.uniform(1 - torque_pct / 100, 1.0)),
            "latencyMs": float(self.np_random.uniform(*latency)),
            "frictionScale": float(self.np_random.uniform(*friction) / 0.8),
            "dropoutPct": float(self.np_random.uniform(*dropout)),
            "imuNoiseScale": float(self.np_random.uniform(*noise)),
            "imuBiasScale": float(self.np_random.uniform(*bias)),
        }

    def _observation(self, *, update: bool) -> np.ndarray:
        rotation_mujoco = self.data.xmat[self.body_id].reshape(3, 3)
        rotation_forge = _FORGE_TO_MUJOCO.T @ rotation_mujoco @ _FORGE_TO_MUJOCO
        truth_angles = _matrix_to_rpy(rotation_forge)
        angular_mujoco = np.asarray(self.data.cvel[self.body_id, :3], dtype=np.float64)
        truth_rate = (_FORGE_TO_MUJOCO.T @ angular_mujoco)[[0, 2, 1]]
        truth_position = self._position_forge()
        truth_joint_position = np.asarray(
            [self.data.qpos[joint["qposAdr"]] for joint in self.joints], dtype=np.float64
        )
        truth_joint_velocity = np.asarray(
            [self.data.qvel[joint["dofAdr"]] for joint in self.joints], dtype=np.float64
        )
        if update:
            estimator = self.bundle["estimator"]
            noise_scale = self._scenario["imuNoiseScale"]
            gyro = truth_rate + float(estimator["bias"]) * self._scenario["imuBiasScale"]
            gyro += self.np_random.normal(0.0, float(estimator["gyroNoise"]) * noise_scale, 3)
            accel_angles = truth_angles + self.np_random.normal(
                0.0, float(estimator["accelNoise"]) * noise_scale, 3
            )
            self._estimated_angles = 0.98 * (
                self._estimated_angles + gyro * self.control_period_s
            ) + 0.02 * accel_angles
            self._last_gyro = gyro
            latency_s = self._scenario["latencyMs"] / 1_000.0
            alpha = float(
                np.clip(self.control_period_s / (latency_s + self.control_period_s), 0.02, 1.0)
            )
            previous = self._estimated_position.copy()
            self._estimated_position += (truth_position - self._estimated_position) * alpha
            raw_velocity = (self._estimated_position - previous) / self.control_period_s
            tau = float(self.task["reward"]["control"]["velocityFilterTauS"])
            velocity_alpha = self.control_period_s / (tau + self.control_period_s)
            self._estimated_velocity += (raw_velocity - self._estimated_velocity) * velocity_alpha
            encoder_noise = float(estimator["accelNoise"]) * noise_scale * 0.01
            self._estimated_joint_position += (
                truth_joint_position - self._estimated_joint_position
            ) * alpha
            self._estimated_joint_position += self.np_random.normal(
                0.0, encoder_noise, len(self.joints)
            )
            self._estimated_joint_velocity += (
                truth_joint_velocity - self._estimated_joint_velocity
            ) * alpha
        yaw = float(self._estimated_angles[2])
        sin_yaw, cos_yaw = math.sin(yaw), math.cos(yaw)
        error = self.target_forge_m - self._estimated_position
        error_body = np.asarray(
            [error[0] * cos_yaw - error[2] * sin_yaw, error[0] * sin_yaw + error[2] * cos_yaw]
        )
        velocity = self._estimated_velocity
        velocity_body = np.asarray(
            [
                velocity[0] * cos_yaw - velocity[2] * sin_yaw,
                velocity[0] * sin_yaw + velocity[2] * cos_yaw,
            ]
        )
        values = [
            *np.clip(self._estimated_angles, -math.pi, math.pi),
            *np.clip(self._last_gyro, -20.0, 20.0),
            *np.clip(velocity_body, -20.0, 20.0),
            *np.clip(error_body, -100.0, 100.0),
            float(np.clip(self._normalized_effort, 0.0, 1.0)),
        ]
        if self.family == "legged":
            values.extend(float(value) for value in np.clip(self._estimated_joint_position, -100, 100))
            values.extend(float(value) for value in np.clip(self._estimated_joint_velocity, -100, 100))
        observation = np.asarray(values, dtype=np.float32)
        if observation.shape != self.observation_space.shape:
            raise RuntimeError("ground estimator observation drifted from the Rust tensor")
        if update and self._scenario["dropoutPct"] > 0:
            sensor_indices = [*range(8), *range(11, len(observation))]
            dropout = self.np_random.random(len(sensor_indices)) < self._scenario["dropoutPct"] / 100.0
            for index, dropped in zip(sensor_indices, dropout, strict=True):
                if dropped:
                    observation[index] = 0.0
        return np.clip(observation, self.observation_space.low, self.observation_space.high)

    def _position_forge(self) -> np.ndarray:
        return _FORGE_TO_MUJOCO.T @ np.asarray(self.data.xpos[self.body_id], dtype=np.float64)

    def _info(self, instant_success: bool, target_advanced: bool) -> dict[str, Any]:
        target_count = len(self.targets) - 1 if self.task_id == "line-follow" else 1
        fraction = self._targets_completed / max(1, target_count)
        return {
            "taskId": self.task_id,
            "instantSuccess": instant_success,
            "successFraction": fraction,
            "taskSuccessFraction": fraction,
            "activeTargetIndex": self._target_index,
            "targetsCompleted": self._targets_completed,
            "targetCount": target_count,
            "targetAdvanced": target_advanced,
            "taskCompleted": self._task_completed,
            "energyWh": self._energy_wh,
            "energySemantics": "simulated-positive-mechanical-joint-work",
            "scenario": dict(self._scenario),
            "trainedOnEstimator": True,
            "targetAdvanceSource": "estimator.target.error",
            "truthExposedToPolicy": False,
        }


def _validate_ground_task(value: Any, archetype: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("ground training task must be a worker-owned object")
    expected = {"rover": ("line-follow", "rover"), "quadruped": ("walk-to-target", "legged")}
    task_id, family = expected.get(archetype, ("", ""))
    if value.get("id") != task_id or value.get("family") != family or value.get("archetype") != family:
        raise ValueError("ground runtime refuses a task/archetype mismatch or unsupported task")
    if value.get("suite") != GROUND_TASK_SUITE or value.get("version") != GROUND_TASK_VERSION:
        raise ValueError(f"ground task must use {GROUND_TASK_SUITE} {GROUND_TASK_VERSION}")
    if value.get("coordinateFrame") != TASK_COORDINATE_FRAME:
        raise ValueError("ground task must use Forge Y-up/right-handed/SI coordinates")
    definition_hash = value.get("definitionHash")
    if definition_hash != task_definition_hash(value):
        raise ValueError("ground task definition hash is missing or drifted")
    stage = value.get("curriculumStage")
    if isinstance(stage, bool) or not isinstance(stage, int) or not 1 <= stage <= 100:
        raise ValueError("ground task curriculum stage is outside its supported bound")
    if definition_hash != task_definition(task_id, curriculum_stage=stage)["definitionHash"]:
        raise ValueError("ground task is not the exact worker-owned definition")
    return value


def _ground_targets(task: dict[str, Any]) -> tuple[tuple[np.ndarray, ...], float]:
    env = task["env"]
    spawn_y = float(env["spawn"]["pose"][1])
    if task["id"] == "line-follow":
        path = env["path"]
        if path.get("kind") != "polyline" or path.get("plane") != "xz":
            raise ValueError("line-follow requires an xz polyline")
        points = path.get("points")
        if not isinstance(points, list) or not 2 <= len(points) <= 64:
            raise ValueError("line-follow requires between two and 64 path points")
        targets = tuple(np.asarray([point[0], spawn_y, point[1]], dtype=np.float64) for point in points)
        radius = float(path["radiusM"])
    else:
        rows = env.get("targets")
        if not isinstance(rows, list) or len(rows) != 1:
            raise ValueError("walk-to-target requires exactly one target")
        targets = (np.asarray(rows[0]["xyz"], dtype=np.float64),)
        radius = float(rows[0]["radiusM"])
    if not all(np.isfinite(target).all() for target in targets) or not 0.01 <= radius <= 100:
        raise ValueError("ground task targets are outside their supported bounds")
    return targets, radius


def _finite_ground_scenario(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        raise ValueError("ground scenario must be an object")
    defaults = {
        "massScale": 1.0,
        "torqueScale": 1.0,
        "latencyMs": 0.0,
        "frictionScale": 1.0,
        "dropoutPct": 0.0,
        "imuNoiseScale": 1.0,
        "imuBiasScale": 1.0,
    }
    if not set(value).issubset(defaults):
        raise ValueError("ground scenario contains unsupported fields")
    result = {**defaults, **value}
    for key, raw in result.items():
        if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw):
            raise ValueError(f"ground scenario {key} must be finite")
        result[key] = float(raw)
    for key in ("massScale", "frictionScale", "imuNoiseScale", "imuBiasScale"):
        if not 0 < result[key] <= 10:
            raise ValueError(f"ground scenario {key} must be in (0, 10]")
    if not 0 < result["torqueScale"] <= 1:
        raise ValueError("ground scenario torqueScale must be in (0, 1]")
    if not 0 <= result["latencyMs"] <= 10_000 or not 0 <= result["dropoutPct"] <= 100:
        raise ValueError("ground scenario latency or dropout is outside its supported bound")
    return result


def _bounded_percent(value: Any, default: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return default
    return float(np.clip(value, 0.0, maximum))


def _pair(value: Any, default: tuple[float, float]) -> tuple[float, float]:
    if (
        not isinstance(value, list)
        or len(value) != 2
        or any(isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(item) for item in value)
    ):
        return default
    low, high = float(value[0]), float(value[1])
    return default if low < 0 or high < low else (low, high)


__all__ = ["ForgeGroundTaskEnv"]
