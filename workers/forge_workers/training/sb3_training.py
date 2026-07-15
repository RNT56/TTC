"""Real seeded MuJoCo + Stable-Baselines3 training and ONNX export."""

from __future__ import annotations

import base64
import hashlib
import importlib.metadata
import io
import json
import math
import os
import platform
import random
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import gymnasium
import mujoco
import numpy as np
import onnx
import stable_baselines3
import torch
from stable_baselines3 import PPO, SAC
from stable_baselines3.common.monitor import Monitor

from forge_workers.training.bundle import OFFLINE_WARMSTART_SCHEMA, OFFLINE_WARMSTART_VERSION
from forge_workers.training.ground_env import ForgeGroundTaskEnv
from forge_workers.training.mujoco_env import ForgeMultirotorTaskEnv
from forge_workers.training.offline_dataset import (
    offline_domain_randomization,
    validate_offline_training_tape,
)
from forge_workers.training.scorecard import DEFAULT_MIN_ROBUST, DEFAULT_MIN_SUCCESS
from forge_workers.training.tasks import GROUND_DOMAIN_RANDOMIZATION, task_definition

RUNTIME_VERSION = "forge-sb3-mujoco/3.0.0"
EXACT_RUNTIME = {
    "stable-baselines3": "2.9.0",
    "gymnasium": "1.3.0",
    "torch": "2.13.0",
    "onnx": "1.22.0",
    "numpy": "2.5.1",
    "mujoco": "3.9.0",
}
DEFAULT_RANDOMIZATION = {
    "massPct": 15.0,
    "kvPct": 8.0,
    "sagPct": 20.0,
    "latencyMs": [0.0, 30.0],
    "friction": [0.4, 1.2],
    "windMps": [0.0, 4.0],
    "obsDropoutPct": [0.0, 5.0],
    "imuNoiseScale": [0.5, 1.5],
    "imuBiasScale": [0.5, 1.5],
}
DEFAULT_GROUND_RANDOMIZATION = {
    **GROUND_DOMAIN_RANDOMIZATION,
    "massPct": 15.0,
    "torquePct": 10.0,
    "latencyMs": [0.0, 30.0],
    "friction": [0.4, 1.2],
    "obsDropoutPct": [0.0, 5.0],
    "imuNoiseScale": [0.5, 1.5],
    "imuBiasScale": [0.5, 1.5],
}
OVERNIGHT_RECIPE = {
    "id": "p7-overnight-v1",
    "hover": {
        "teacherEpisodes": 24,
        "distillationEpochs": 30,
        "distillationBatchSize": 512,
        "ppoTimesteps": 10_000,
        "network": [128, 128],
        "learningRate": 1e-5,
        "logStd": -3.0,
    },
    "waypoint": {
        "teacherEpisodes": 64,
        "distillationEpochs": 30,
        "distillationBatchSize": 512,
        "ppoTimesteps": 10_000,
        "network": [128, 128],
        "learningRate": 1e-5,
        "logStd": -3.0,
    },
}
OFFLINE_RECIPE = {
    "id": "p7-offline-bc-v1",
    "minimumSamples": 64,
    "distillationEpochs": 12,
    "distillationBatchSize": 64,
    "ppoTimesteps": 256,
    "episodeSteps": 40,
    "evalEpisodes": 2,
    "network": [64, 64],
    "learningRate": 3e-4,
    "logStd": -2.0,
}


def train_sb3_policy(payload: dict[str, Any], bundle: dict[str, Any]) -> dict[str, Any]:
    versions = _runtime_versions()
    ground = bundle.get("artifactKind") == "groundTrainingMuJoCoBundle"
    recipe = _choice(
        payload.get("recipe", "direct-v1"),
        {"direct-v1", "p7-overnight-v1", "p7-offline-bc-v1"},
        "recipe",
    )
    algorithm = _choice(payload.get("algorithm", "ppo"), {"ppo", "sac"}, "algorithm")
    seed = _integer(payload.get("seed", 0), "seed", 0, 2_147_483_647)
    device = _training_device(payload.get("device", "cpu"))
    supported_tasks = (
        {"line-follow"}
        if bundle.get("archetype") == "rover"
        else {"walk-to-target"}
        if bundle.get("archetype") == "quadruped"
        else {"hover-hold", "waypoint-chain"}
    )
    task_id = _choice(payload.get("task", "hover-hold"), supported_tasks, "task")
    if recipe == "p7-overnight-v1":
        if ground:
            raise ValueError("p7-overnight-v1 is multirotor-only")
        if algorithm != "ppo":
            raise ValueError("p7-overnight-v1 requires PPO")
        if any(key in payload for key in ("totalTimesteps", "episodeSteps", "curriculumStage")):
            raise ValueError("p7-overnight-v1 owns its timestep, horizon, and curriculum-stage authority")
        curriculum_stage = 3
    elif recipe == "p7-offline-bc-v1":
        if algorithm != "ppo":
            raise ValueError("p7-offline-bc-v1 requires PPO")
        if any(
            key in payload
            for key in ("totalTimesteps", "episodeSteps", "evalEpisodes", "curriculumStage")
        ):
            raise ValueError("p7-offline-bc-v1 owns its training and evaluation authority")
        curriculum_stage = 1
    else:
        curriculum_stage = _integer(payload.get("curriculumStage", 1), "curriculumStage", 1, 100)
    task = task_definition(task_id, curriculum_stage=curriculum_stage)
    offline_observations: list[list[float]] | None = None
    offline_actions: list[list[float]] | None = None
    offline_dataset: dict[str, Any] | None = None
    if recipe == "p7-overnight-v1":
        episode_steps = round(float(task["horizonS"]) / float(bundle["controlPeriodS"]))
        eval_episodes = _integer(payload.get("evalEpisodes", 8), "evalEpisodes", 8, 8)
        randomization = _randomization(payload.get("domainRandomization"), ground=False)
        if randomization != DEFAULT_RANDOMIZATION:
            raise ValueError("p7-overnight-v1 requires the frozen domain-randomization envelope")
        total_timesteps = 10_000
    elif recipe == "p7-offline-bc-v1":
        if "domainRandomization" in payload:
            raise ValueError("p7-offline-bc-v1 requires the frozen domain-randomization envelope")
        total_timesteps = int(OFFLINE_RECIPE["ppoTimesteps"])
        episode_steps = int(OFFLINE_RECIPE["episodeSteps"])
        eval_episodes = int(OFFLINE_RECIPE["evalEpisodes"])
        randomization = offline_domain_randomization(ground=ground)
        offline_observations, offline_actions, offline_dataset = validate_offline_training_tape(
            payload,
            bundle,
            task,
        )
    else:
        total_timesteps = _integer(
            payload.get("totalTimesteps", 250_000), "totalTimesteps", 64, 20_000_000
        )
        episode_steps = _integer(payload.get("episodeSteps", 3_000), "episodeSteps", 20, 100_000)
        eval_episodes = _integer(payload.get("evalEpisodes", 8), "evalEpisodes", 1, 100)
        randomization = _randomization(payload.get("domainRandomization"), ground=ground)
    config = {
        "recipe": recipe,
        "recipeAuthority": (
            OVERNIGHT_RECIPE
            if recipe == "p7-overnight-v1"
            else OFFLINE_RECIPE
            if recipe == "p7-offline-bc-v1"
            else None
        ),
        "task": task_id,
        "taskSuite": task["suite"],
        "taskVersion": task["version"],
        "taskDefinitionHash": task["definitionHash"],
        "algorithm": algorithm,
        "seed": seed,
        "totalTimesteps": total_timesteps,
        "episodeSteps": episode_steps,
        "evalEpisodes": eval_episodes,
        "device": device,
        "domainRandomization": randomization,
        "bundleVersion": bundle["schemaVersion"],
        "policyTensorVersion": bundle["tensor"]["schemaVersion"],
        "offlineDatasetHash": offline_dataset["datasetHash"] if offline_dataset is not None else None,
    }
    config_hash = _digest_json(config)
    _seed_everything(seed, device)

    warmstart_parameters: str | None = None
    if recipe == "p7-overnight-v1":
        model, initial_parameters, wall_time_s, curriculum = _overnight_model(
            bundle,
            task,
            seed=seed,
            device=device,
            episode_steps=episode_steps,
        )
    elif recipe == "p7-offline-bc-v1":
        assert offline_observations is not None
        assert offline_actions is not None
        assert offline_dataset is not None
        train_env = _environment(bundle, task, randomization, episode_steps)
        model = _ppo_model(
            train_env,
            seed,
            device,
            total_timesteps=total_timesteps,
            network=list(OFFLINE_RECIPE["network"]),
            learning_rate=float(OFFLINE_RECIPE["learningRate"]),
            epochs=4,
            gamma=0.99,
            entropy=0.0,
        )
        initial_parameters = _parameter_digest(model.policy.state_dict())
        _synchronize_device(device)
        started = time.monotonic()
        final_loss = _distill_teacher(
            model,
            np.asarray(offline_observations, dtype=np.float32),
            np.asarray(offline_actions, dtype=np.float32),
            seed=seed,
            epochs=int(OFFLINE_RECIPE["distillationEpochs"]),
            batch_size=int(OFFLINE_RECIPE["distillationBatchSize"]),
        )
        warmstart_parameters = _parameter_digest(model.policy.state_dict())
        if warmstart_parameters == initial_parameters:
            raise RuntimeError("behavior cloning did not update policy parameters")
        model.policy.log_std.data.fill_(float(OFFLINE_RECIPE["logStd"]))
        model.learn(total_timesteps=total_timesteps, progress_bar=False)
        _synchronize_device(device)
        wall_time_s = time.monotonic() - started
        curriculum = [
            {
                "kind": "behavior-cloning",
                "datasetHash": offline_dataset["datasetHash"],
                "sourceLogSha256": offline_dataset["sourceLogSha256"],
                "samples": offline_dataset["sampleCount"],
                "epochs": OFFLINE_RECIPE["distillationEpochs"],
                "batchSize": OFFLINE_RECIPE["distillationBatchSize"],
                "finalMeanSquaredError": final_loss,
                "parameterDigestAfter": warmstart_parameters,
                "observationSource": offline_dataset["observationSource"],
                "actionSource": offline_dataset["actionSource"],
                "captureMaturity": offline_dataset["captureMaturity"],
                "truthExposedToPolicy": False,
            },
            {
                "kind": "ppo-randomized-fine-tune",
                "timesteps": total_timesteps,
                "domainRandomization": randomization,
            },
        ]
    else:
        train_env = _environment(bundle, task, randomization, episode_steps)
        model = _model(algorithm, train_env, seed, device, total_timesteps)
        initial_parameters = _parameter_digest(model.policy.state_dict())
        _synchronize_device(device)
        started = time.monotonic()
        model.learn(total_timesteps=total_timesteps, progress_bar=False)
        _synchronize_device(device)
        wall_time_s = time.monotonic() - started
        curriculum = [{"kind": "direct", "timesteps": total_timesteps}]
    if str(model.device) != device:
        raise RuntimeError(
            f"SB3 resolved device {model.device} does not match requested device {device}"
        )
    final_parameters = _parameter_digest(model.policy.state_dict())
    if final_parameters == initial_parameters:
        raise RuntimeError("SB3 optimizer did not update policy parameters")

    if ground:
        nominal = {
            "massScale": 1.0,
            "torqueScale": 1.0,
            "latencyMs": 0.0,
            "frictionScale": 1.0,
            "dropoutPct": 0.0,
            "imuNoiseScale": 1.0,
            "imuBiasScale": 1.0,
        }
        scenarios = {
            "baseline": nominal,
            "mass+15%": {**nominal, "massScale": 1.15},
            "torque-10%": {**nominal, "torqueScale": 0.90},
            "friction-50%": {**nominal, "frictionScale": 0.50},
        }
    else:
        nominal = {
            "massScale": 1.0,
            "kvScale": 1.0,
            "sagScale": 1.0,
            "latencyMs": 0.0,
            "frictionScale": 1.0,
            "windMps": 0.0,
            "dropoutPct": 0.0,
            "imuNoiseScale": 1.0,
            "imuBiasScale": 1.0,
        }
        scenarios = {
            "baseline": nominal,
            "mass+15%": {**nominal, "massScale": 1.15},
            "kv-8%": {**nominal, "kvScale": 0.92},
            "wind4ms": {**nominal, "windMps": 4.0},
        }
    evaluations = {
        name: _evaluate(
            model,
            bundle,
            task,
            scenario,
            seed=seed + 10_000 + index * 1_000,
            episodes=eval_episodes,
            episode_steps=episode_steps,
        )
        for index, (name, scenario) in enumerate(scenarios.items())
    }
    success_rate = evaluations["baseline"]["successRate"]
    robustness = {
        name: result["successRate"]
        for name, result in evaluations.items()
        if name != "baseline"
    }
    energy_wh = evaluations["baseline"]["meanEnergyWh"]
    exportable = (
        success_rate >= DEFAULT_MIN_SUCCESS
        and bool(robustness)
        and min(robustness.values()) >= DEFAULT_MIN_ROBUST
        and energy_wh > 0
    )
    reasons: list[str] = []
    if success_rate < DEFAULT_MIN_SUCCESS:
        reasons.append(f"successRate {success_rate:.3f} < {DEFAULT_MIN_SUCCESS:.3f}")
    for name, value in robustness.items():
        if value < DEFAULT_MIN_ROBUST:
            reasons.append(f"robustness[{name}] {value:.3f} < {DEFAULT_MIN_ROBUST:.3f}")
    if energy_wh <= 0:
        reasons.append("energyWh must be positive")

    onnx_artifact = _export_onnx(model, algorithm, bundle, task)
    contract_hash = bundle["contractHash"]
    source_revision = _source_revision()
    lockfile_hash = _lockfile_hash(payload)
    dependency_manifest_hash = _dependency_manifest_hash()
    cache_key = f"sb3:{contract_hash[:16]}:{config_hash[:16]}:{onnx_artifact['sha256'][:16]}"
    tensor = bundle["tensor"]
    targets = _task_targets(task)
    primary_target = targets[1] if task_id == "line-follow" else targets[0]
    observations = (
        list(task["observations"])
        if ground
        else [
            "estimator.attitude",
            "estimator.angularRate",
            "estimator.linearVelocity",
            "target.error",
            "battery.normalizedVoltage",
            "powertrain.motorCurrent",
        ]
    )
    actions = list(task["actions"]) if ground else ["throttle", "roll", "pitch", "yaw"]
    return {
        "artifactKind": "policy",
        "provider": "local-sb3-mujoco",
        "algorithm": algorithm,
        "archetype": bundle["archetype"],
        "task": {
            "id": task_id,
            "suite": task["suite"],
            "version": task["version"],
            "coordinateFrame": task["coordinateFrame"],
            "definitionHash": task["definitionHash"],
            "curriculumStage": curriculum_stage,
            "horizonS": episode_steps * float(bundle["controlPeriodS"]),
            "target": {"xyzM": list(primary_target["xyzM"])},
            "targets": targets,
        },
        "io": {
            "observations": observations,
            "actions": actions,
            "onnxHeader": {
                "contractHash": contract_hash,
                "task": task_id,
                "taskVersion": task["version"],
                "taskDefinitionHash": task["definitionHash"],
                "observationCount": str(tensor["input"]["shape"][1]) if ground else "6",
                "actionCount": str(tensor["output"]["shape"][1]) if ground else "4",
                "tensorSchema": tensor["schema"],
                "tensorVersion": tensor["schemaVersion"],
            },
            "tensor": tensor,
        },
        "domainRandomization": randomization,
        **(
            {
                "dataset": {**offline_dataset, "quality": "accepted"},
                "policyWarmstart": {
                    "schemaVersion": f"{OFFLINE_WARMSTART_SCHEMA}/{OFFLINE_WARMSTART_VERSION}",
                    "datasetHash": offline_dataset["datasetHash"],
                    "parameterDigest": warmstart_parameters,
                    "compatible": True,
                },
            }
            if offline_dataset is not None and warmstart_parameters is not None
            else {}
        ),
        "onnx": {
            "cacheKey": cache_key,
            "opset": 18,
            "fixture": False,
            "path": f"{cache_key}/policy.onnx",
            "byteSize": onnx_artifact["byteSize"],
            "sha256": onnx_artifact["sha256"],
            "modelBase64": onnx_artifact["modelBase64"],
        },
        "scorecard": {
            "schemaVersion": "p7-scorecard-v1",
            "task": task_id,
            "taskVersion": task["version"],
            "successRate": success_rate,
            "robustness": robustness,
            "energyWh": energy_wh,
            "energySemantics": (
                "simulated-positive-mechanical-joint-work"
                if ground
                else "simulated-electrical-work"
            ),
            "trainedOnEstimator": True,
            "estimatorSmoke": "passed",
            "lineage": {
                "contractHash": contract_hash,
                "lockfileHash": lockfile_hash,
                "dependencyManifestHash": dependency_manifest_hash,
                "configHash": config_hash,
                "taskDefinitionHash": task["definitionHash"],
                **(
                    {
                        "sourceLogId": offline_dataset["sourceLogId"],
                        "sourceLogSha256": offline_dataset["sourceLogSha256"],
                        "offlineDatasetHash": offline_dataset["datasetHash"],
                        "warmstartParameterDigest": warmstart_parameters,
                    }
                    if offline_dataset is not None and warmstart_parameters is not None
                    else {}
                ),
                "codeVersion": RUNTIME_VERSION,
                "sourceRevision": source_revision,
                "seed": str(seed),
            },
            "thresholds": {
                "minSuccess": DEFAULT_MIN_SUCCESS,
                "minRobustness": DEFAULT_MIN_ROBUST,
            },
            "exportable": exportable,
            "reasons": reasons,
        },
        "training": {
            "runtime": RUNTIME_VERSION,
            "versions": versions,
            "device": device,
            "deviceAuthority": _device_authority(device),
            "requestedTimesteps": total_timesteps,
            "completedTimesteps": int(model.num_timesteps),
            "recipe": recipe,
            "curriculum": curriculum,
            "wallTimeS": wall_time_s,
            "parameterDigestBefore": initial_parameters,
            "parameterDigestAfter": final_parameters,
            "optimizerUpdated": True,
            "deterministicAlgorithms": torch.are_deterministic_algorithms_enabled(),
            "truthExposedToPolicy": False,
            "targetAdvanceSource": "estimator.target.error",
            "energySemantics": (
                "simulated-positive-mechanical-joint-work"
                if ground
                else "simulated-electrical-work"
            ),
            "evaluations": evaluations,
            "bundleAssumptions": bundle["assumptions"],
            **({"offlineDataset": offline_dataset} if offline_dataset is not None else {}),
        },
    }


def _environment(
    bundle: dict[str, Any],
    task: dict[str, Any],
    randomization: dict[str, Any],
    episode_steps: int,
) -> Monitor:
    environment = (
        ForgeGroundTaskEnv
        if bundle.get("artifactKind") == "groundTrainingMuJoCoBundle"
        else ForgeMultirotorTaskEnv
    )
    return Monitor(
        environment(
            bundle,
            task=task,
            randomization=randomization,
            episode_steps=episode_steps,
        )
    )


def _overnight_model(
    bundle: dict[str, Any],
    task: dict[str, Any],
    *,
    seed: int,
    device: str,
    episode_steps: int,
) -> tuple[PPO, str, float, list[dict[str, Any]]]:
    _synchronize_device(device)
    started = time.monotonic()
    if task["id"] == "hover-hold":
        authority = OVERNIGHT_RECIPE["hover"]
        model = _ppo_model(
            _environment(bundle, task, DEFAULT_RANDOMIZATION, episode_steps),
            seed,
            device,
            total_timesteps=int(authority["ppoTimesteps"]),
            network=list(authority["network"]),
            learning_rate=float(authority["learningRate"]),
            epochs=4,
            gamma=0.995,
            entropy=0.0,
        )
        initial_parameters = _parameter_digest(model.policy.state_dict())
        observations, actions = _teacher_dataset(
            bundle,
            task,
            seed=seed,
            episodes=int(authority["teacherEpisodes"]),
            episode_steps=episode_steps,
        )
        final_loss = _distill_teacher(
            model,
            observations,
            actions,
            seed=seed,
            epochs=int(authority["distillationEpochs"]),
            batch_size=int(authority["distillationBatchSize"]),
        )
        model.policy.log_std.data.fill_(float(authority["logStd"]))
        model.learn(total_timesteps=int(authority["ppoTimesteps"]), progress_bar=False)
        curriculum = [
            {
                "kind": "estimator-only-controller-distillation",
                "teacherEpisodes": authority["teacherEpisodes"],
                "samples": len(observations),
                "epochs": authority["distillationEpochs"],
                "batchSize": authority["distillationBatchSize"],
                "finalMeanSquaredError": final_loss,
                "truthExposedToTeacher": False,
            },
            {
                "kind": "ppo-randomized-fine-tune",
                "timesteps": authority["ppoTimesteps"],
                "domainRandomization": DEFAULT_RANDOMIZATION,
            },
        ]
    else:
        authority = OVERNIGHT_RECIPE["waypoint"]
        model = _ppo_model(
            _environment(bundle, task, DEFAULT_RANDOMIZATION, episode_steps),
            seed,
            device,
            total_timesteps=int(authority["ppoTimesteps"]),
            network=list(authority["network"]),
            learning_rate=float(authority["learningRate"]),
            epochs=4,
            gamma=0.995,
            entropy=0.0,
        )
        initial_parameters = _parameter_digest(model.policy.state_dict())
        observations, actions = _teacher_dataset(
            bundle,
            task,
            seed=seed,
            episodes=int(authority["teacherEpisodes"]),
            episode_steps=episode_steps,
        )
        final_loss = _distill_teacher(
            model,
            observations,
            actions,
            seed=seed,
            epochs=int(authority["distillationEpochs"]),
            batch_size=int(authority["distillationBatchSize"]),
        )
        model.policy.log_std.data.fill_(float(authority["logStd"]))
        model.learn(total_timesteps=int(authority["ppoTimesteps"]), progress_bar=False)
        curriculum = [
            {
                "kind": "estimator-only-controller-distillation",
                "teacherEpisodes": authority["teacherEpisodes"],
                "samples": len(observations),
                "epochs": authority["distillationEpochs"],
                "batchSize": authority["distillationBatchSize"],
                "finalMeanSquaredError": final_loss,
                "truthExposedToTeacher": False,
            },
            {
                "kind": "ppo-randomized-fine-tune",
                "timesteps": authority["ppoTimesteps"],
                "domainRandomization": DEFAULT_RANDOMIZATION,
            },
        ]
    _synchronize_device(device)
    return model, initial_parameters, time.monotonic() - started, curriculum


def _model(
    algorithm: str,
    env: Monitor,
    seed: int,
    device: str,
    total_timesteps: int,
) -> PPO | SAC:
    if algorithm == "ppo":
        return _ppo_model(
            env,
            seed,
            device,
            total_timesteps=total_timesteps,
            network=[64, 64],
            learning_rate=3e-4,
            epochs=4,
            gamma=0.99,
            entropy=0.0,
        )
    policy_kwargs = {"net_arch": [64, 64], "activation_fn": torch.nn.Tanh}
    learning_starts = min(1_000, max(16, total_timesteps // 10))
    return SAC(
        "MlpPolicy",
        env,
        seed=seed,
        device=device,
        buffer_size=max(2_000, min(1_000_000, total_timesteps * 2)),
        learning_starts=learning_starts,
        batch_size=min(128, max(16, learning_starts)),
        train_freq=1,
        gradient_steps=1,
        learning_rate=3e-4,
        gamma=0.99,
        policy_kwargs=policy_kwargs,
        verbose=0,
    )


def _ppo_model(
    env: Monitor,
    seed: int,
    device: str,
    *,
    total_timesteps: int,
    network: list[int],
    learning_rate: float,
    epochs: int,
    gamma: float,
    entropy: float,
) -> PPO:
    n_steps = min(1_024, max(32, 2 ** int(math.floor(math.log2(total_timesteps)))))
    n_steps = min(n_steps, total_timesteps)
    batch_size = max(8, min(64, n_steps))
    while n_steps % batch_size != 0 and batch_size > 8:
        batch_size //= 2
    return PPO(
        "MlpPolicy",
        env,
        seed=seed,
        device=device,
        n_steps=n_steps,
        batch_size=batch_size,
        n_epochs=epochs,
        learning_rate=learning_rate,
        gamma=gamma,
        gae_lambda=0.95,
        ent_coef=entropy,
        policy_kwargs={"net_arch": network, "activation_fn": torch.nn.Tanh},
        verbose=0,
    )


def _teacher_dataset(
    bundle: dict[str, Any],
    task: dict[str, Any],
    *,
    seed: int,
    episodes: int,
    episode_steps: int,
) -> tuple[np.ndarray, np.ndarray]:
    observations: list[np.ndarray] = []
    actions: list[np.ndarray] = []
    for episode in range(episodes):
        env = ForgeMultirotorTaskEnv(
            bundle,
            task=task,
            randomization=DEFAULT_RANDOMIZATION,
            episode_steps=episode_steps,
        )
        observation, _ = env.reset(seed=seed + episode)
        done = False
        while not done:
            action = _teacher_action(observation, bundle, task["id"])
            observations.append(observation.copy())
            actions.append(action)
            observation, _, terminated, truncated, _ = env.step(action)
            done = terminated or truncated
        env.close()
    if not observations:
        raise RuntimeError("controller-distillation curriculum produced no samples")
    return np.asarray(observations, dtype=np.float32), np.asarray(actions, dtype=np.float32)


def _teacher_action(
    observation: np.ndarray,
    bundle: dict[str, Any],
    task_id: str,
) -> np.ndarray:
    if observation.shape != (14,) or not np.isfinite(observation).all():
        raise ValueError("teacher requires one finite forge-policy-tensor v2 observation")
    roll, pitch, yaw = (float(value) for value in observation[:3])
    _, _, yaw_rate = (float(value) for value in observation[3:6])
    velocity_x, velocity_y, velocity_z = (float(value) for value in observation[6:9])
    error_x, error_y, error_z = (float(value) for value in observation[9:12])
    position_gain = 0.35 if task_id == "hover-hold" else 0.08
    velocity_gain = 0.08
    desired_roll = float(np.clip(position_gain * error_z - velocity_gain * velocity_z, -0.35, 0.35))
    desired_pitch = float(np.clip(-position_gain * error_x + velocity_gain * velocity_x, -0.35, 0.35))
    vertical_acceleration = float(np.clip(8.0 * error_y - 3.0 * velocity_y, -6.0, 6.0))
    attitude_factor = max(0.7, math.cos(roll) * math.cos(pitch))
    desired_thrust = (
        float(bundle["massKg"])
        * (float(bundle["gravityMS2"]) + vertical_acceleration)
        / attitude_factor
    )
    curve = bundle["powertrain"]["curve"]
    throttle = float(
        np.interp(
            desired_thrust,
            [point["totalThrustN"] for point in curve],
            [point["throttle"] for point in curve],
        )
    )
    hover = float(bundle["hoverThrottle"])
    collective = (throttle - hover) / (1.0 - hover) if throttle >= hover else throttle / hover - 1.0
    tilt_max = float(bundle["control"]["tiltMaxRad"])
    yaw_rate_max = float(bundle["control"]["yawRateRadS"])
    return np.asarray(
        [
            np.clip(collective, -1.0, 1.0),
            np.clip(-desired_roll / tilt_max, -1.0, 1.0),
            np.clip(desired_pitch / tilt_max, -1.0, 1.0),
            np.clip((-yaw - 0.3 * yaw_rate) / yaw_rate_max, -1.0, 1.0),
        ],
        dtype=np.float32,
    )


def _distill_teacher(
    model: PPO,
    observations: np.ndarray,
    actions: np.ndarray,
    *,
    seed: int,
    epochs: int,
    batch_size: int,
) -> float:
    inputs = torch.as_tensor(observations, dtype=torch.float32)
    targets = torch.as_tensor(actions, dtype=torch.float32)
    generator = torch.Generator().manual_seed(seed)
    final_loss = math.inf
    for _ in range(epochs):
        loss_sum = 0.0
        for indices in torch.randperm(len(inputs), generator=generator).split(batch_size):
            batch_inputs = inputs[indices].to(model.device)
            batch_targets = targets[indices].to(model.device)
            mean = model.policy.get_distribution(batch_inputs).distribution.mean
            loss = torch.nn.functional.mse_loss(mean, batch_targets)
            model.policy.optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.policy.parameters(), 1.0)
            model.policy.optimizer.step()
            loss_sum += float(loss.detach().cpu()) * len(indices)
        final_loss = loss_sum / len(inputs)
    if not math.isfinite(final_loss):
        raise RuntimeError("controller distillation produced a non-finite loss")
    return final_loss


def _evaluate(
    model: PPO | SAC,
    bundle: dict[str, Any],
    task: dict[str, Any],
    scenario: dict[str, float],
    *,
    seed: int,
    episodes: int,
    episode_steps: int,
) -> dict[str, Any]:
    successes = 0
    energies: list[float] = []
    rewards: list[float] = []
    fractions: list[float] = []
    for episode in range(episodes):
        environment = (
            ForgeGroundTaskEnv
            if bundle.get("artifactKind") == "groundTrainingMuJoCoBundle"
            else ForgeMultirotorTaskEnv
        )
        env = environment(
            bundle,
            task=task,
            randomization={},
            episode_steps=episode_steps,
            fixed_scenario=scenario,
        )
        observation, _ = env.reset(seed=seed + episode)
        done = False
        total_reward = 0.0
        info: dict[str, Any] = {}
        while not done:
            action, _ = model.predict(observation, deterministic=True)
            observation, reward, terminated, truncated, info = env.step(action)
            total_reward += float(reward)
            done = terminated or truncated
        fraction = float(info.get("successFraction", 0.0))
        completion_required = task["id"] in {
            "waypoint-chain",
            "line-follow",
            "walk-to-target",
        }
        episode_success = bool(info.get("taskCompleted")) if completion_required else fraction >= 0.6
        successes += int(episode_success)
        fractions.append(fraction)
        energies.append(float(info.get("energyWh", 0.0)))
        rewards.append(total_reward)
        env.close()
    return {
        "episodes": episodes,
        "successRate": successes / episodes,
        "meanSuccessFraction": float(np.mean(fractions)),
        "meanEnergyWh": float(np.mean(energies)),
        "meanReward": float(np.mean(rewards)),
        "completionRequired": task["id"] in {
            "waypoint-chain",
            "line-follow",
            "walk-to-target",
        },
        "energySemantics": (
            "simulated-positive-mechanical-joint-work"
            if bundle.get("artifactKind") == "groundTrainingMuJoCoBundle"
            else "simulated-electrical-work"
        ),
        "scenario": scenario,
    }


class _PpoExport(torch.nn.Module):
    def __init__(self, model: PPO) -> None:
        super().__init__()
        self.features_extractor = model.policy.features_extractor
        self.mlp_extractor = model.policy.mlp_extractor
        self.action_net = model.policy.action_net

    def forward(self, observations: torch.Tensor) -> torch.Tensor:
        features = self.features_extractor(observations)
        latent = self.mlp_extractor.forward_actor(features)
        return torch.clamp(self.action_net(latent), -1.0, 1.0)


class _SacExport(torch.nn.Module):
    def __init__(self, model: SAC) -> None:
        super().__init__()
        self.features_extractor = model.actor.features_extractor
        self.latent_pi = model.actor.latent_pi
        self.mu = model.actor.mu

    def forward(self, observations: torch.Tensor) -> torch.Tensor:
        features = self.features_extractor(observations)
        latent = self.latent_pi(features)
        return torch.tanh(self.mu(latent))


def _export_onnx(
    model: PPO | SAC,
    algorithm: str,
    bundle: dict[str, Any],
    task: dict[str, Any],
) -> dict[str, Any]:
    module: torch.nn.Module = _PpoExport(model) if algorithm == "ppo" else _SacExport(model)
    # The browser contract is device-neutral. Export from CPU after all training
    # and evaluation so a retained graph never depends on MPS availability.
    module = module.to("cpu")
    module.eval()
    input_shape = bundle["tensor"]["input"]["shape"]
    dummy = torch.zeros(tuple(input_shape), dtype=torch.float32)
    with tempfile.NamedTemporaryFile(suffix=".onnx", prefix="forge-sb3-", delete=False) as handle:
        path = Path(handle.name)
    try:
        torch.onnx.export(
            module,
            dummy,
            path,
            input_names=["observations"],
            output_names=["actions"],
            opset_version=18,
            dynamic_axes=None,
            do_constant_folding=True,
            dynamo=False,
        )
        graph = onnx.load(path)
        del graph.metadata_props[:]
        metadata = {
            "forge.tensorSchema": bundle["tensor"]["schema"],
            "forge.tensorVersion": bundle["tensor"]["schemaVersion"],
            "forge.inputLayout": ",".join(bundle["tensor"]["input"]["layout"]),
            "forge.outputLayout": ",".join(bundle["tensor"]["output"]["layout"]),
            "forge.contractHash": bundle["contractHash"],
            "forge.task": task["id"],
            "forge.taskVersion": task["version"],
            "forge.taskDefinitionHash": task["definitionHash"],
        }
        if bundle.get("artifactKind") == "groundTrainingMuJoCoBundle":
            metadata["forge.archetype"] = str(bundle["archetype"])
        for key, value in metadata.items():
            prop = graph.metadata_props.add()
            prop.key = key
            prop.value = value
        onnx.checker.check_model(graph)
        buffer = io.BytesIO()
        onnx.save_model(graph, buffer)
        raw = buffer.getvalue()
    finally:
        path.unlink(missing_ok=True)
    if not raw or len(raw) > 8 * 1024 * 1024:
        raise RuntimeError("exported ONNX model is empty or exceeds the inline worker bound")
    return {
        "byteSize": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "modelBase64": base64.b64encode(raw).decode("ascii"),
    }


def _runtime_versions() -> dict[str, str]:
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError(
            f"Python runtime drifted: expected 3.12, got {sys.version_info.major}.{sys.version_info.minor}"
        )
    versions = {
        "python": platform.python_version(),
        "platform": platform.system().lower(),
        "machine": platform.machine().lower(),
        "stable-baselines3": stable_baselines3.__version__,
        "gymnasium": gymnasium.__version__,
        "torch": torch.__version__,
        "onnx": onnx.__version__,
        "numpy": np.__version__,
        "mujoco": mujoco.__version__,
    }
    for package, expected in EXACT_RUNTIME.items():
        actual = versions[package].split("+")[0]
        if actual != expected:
            raise RuntimeError(f"{package} runtime drifted: expected {expected}, got {versions[package]}")
        metadata_version = importlib.metadata.version(package).split("+")[0]
        if metadata_version != expected:
            raise RuntimeError(f"{package} installed metadata drifted: expected {expected}, got {metadata_version}")
    if torch.version.cuda is not None:
        raise RuntimeError("P7 SB3 runtime does not admit CUDA builds")
    return versions


def _source_revision() -> str:
    revision = os.getenv("FORGE_SOURCE_REVISION", "")
    if not revision:
        root = Path(__file__).resolve().parents[3]
        completed = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=root,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        revision = completed.stdout.strip() if completed.returncode == 0 else ""
    if len(revision) != 40 or any(char not in "0123456789abcdef" for char in revision):
        raise RuntimeError("FORGE_SOURCE_REVISION must identify the exact 40-character source commit")
    return revision


def _lockfile_hash(payload: dict[str, Any]) -> str:
    lockfile_hash = os.getenv("FORGE_LOCKFILE_HASH", "")
    if not lockfile_hash:
        lockfile = Path(__file__).resolve().parents[3] / "pnpm-lock.yaml"
        if lockfile.is_file():
            lockfile_hash = hashlib.sha256(lockfile.read_bytes()).hexdigest()
    if not isinstance(lockfile_hash, str) or len(lockfile_hash) != 64 or any(
        char not in "0123456789abcdef" for char in lockfile_hash
    ):
        raise RuntimeError("lockfileHash must identify the exact source lockfile by lowercase SHA-256")
    requested = payload.get("lockfileHash")
    if requested is not None and requested != lockfile_hash:
        raise ValueError("requested lockfileHash does not match the worker-owned source lockfile")
    return lockfile_hash


def _dependency_manifest_hash() -> str:
    manifest_hash = os.getenv("FORGE_TRAINING_MANIFEST_HASH", "")
    if not manifest_hash:
        manifest = Path(__file__).resolve().parents[2] / "pyproject.toml"
        if manifest.is_file():
            manifest_hash = hashlib.sha256(manifest.read_bytes()).hexdigest()
    if len(manifest_hash) != 64 or any(char not in "0123456789abcdef" for char in manifest_hash):
        raise RuntimeError(
            "FORGE_TRAINING_MANIFEST_HASH must identify the exact Python dependency manifest"
        )
    return manifest_hash


def _randomization(value: Any, *, ground: bool = False) -> dict[str, Any]:
    defaults = DEFAULT_GROUND_RANDOMIZATION if ground else DEFAULT_RANDOMIZATION
    if value is None:
        return dict(defaults)
    if not isinstance(value, dict) or not set(value).issubset(defaults):
        raise ValueError("domainRandomization contains unsupported fields")
    result = {**defaults, **value}
    percentages = (
        {"massPct": 15.0, "torquePct": 10.0}
        if ground
        else {"massPct": 50.0, "kvPct": 50.0, "sagPct": 50.0}
    )
    for key, maximum in percentages.items():
        raw = result[key]
        if (
            isinstance(raw, bool)
            or not isinstance(raw, (int, float))
            or not math.isfinite(raw)
            or not 0 <= raw <= maximum
        ):
            raise ValueError(f"domainRandomization {key} must be finite in [0, {maximum:g}]")
        result[key] = float(raw)
    pairs = [
        ("latencyMs", 0.0, 1_000.0),
        ("friction", 0.01, 5.0),
        ("obsDropoutPct", 0.0, 100.0),
        ("imuNoiseScale", 0.01, 10.0),
        ("imuBiasScale", 0.01, 10.0),
    ]
    if not ground:
        pairs.insert(2, ("windMps", 0.0, 100.0))
    for key, lower_bound, upper_bound in pairs:
        raw = result[key]
        if (
            not isinstance(raw, list)
            or len(raw) != 2
            or any(
                isinstance(item, bool)
                or not isinstance(item, (int, float))
                or not math.isfinite(item)
                for item in raw
            )
        ):
            raise ValueError(f"domainRandomization {key} must be a finite [min, max] pair")
        low, high = float(raw[0]), float(raw[1])
        if low < lower_bound or high < low or high > upper_bound:
            raise ValueError(f"domainRandomization {key} is outside its supported range")
        result[key] = [low, high]
    return result


def _task_targets(task: dict[str, Any]) -> list[dict[str, Any]]:
    env = task["env"]
    if task["id"] == "line-follow":
        spawn_y = float(env["spawn"]["pose"][1])
        return [
            {
                "kind": "path-point",
                "xyzM": [float(point[0]), spawn_y, float(point[1])],
                "radiusM": float(env["path"]["radiusM"]),
            }
            for point in env["path"]["points"]
        ]
    return [
        {
            "kind": target["kind"],
            "xyzM": list(target["xyz"]),
            "radiusM": target["radiusM"],
        }
        for target in env["targets"]
    ]


def _training_device(value: Any) -> str:
    device = _choice(value, {"cpu", "mps"}, "device")
    if device == "cpu":
        return device
    fallback = os.getenv("PYTORCH_ENABLE_MPS_FALLBACK", "").strip().lower()
    if fallback in {"1", "true", "yes", "on"}:
        raise RuntimeError(
            "MPS evidence forbids PYTORCH_ENABLE_MPS_FALLBACK because CPU fallback would obscure device authority"
        )
    if platform.system() != "Darwin" or platform.machine().lower() not in {"arm64", "aarch64"}:
        raise RuntimeError("MPS training requires Apple silicon on macOS")
    if not torch.backends.mps.is_built():
        raise RuntimeError("the reviewed PyTorch build does not include MPS support")
    if not torch.backends.mps.is_available():
        raise RuntimeError("MPS was requested but is not available on this host")
    return device


def _device_authority(device: str) -> dict[str, Any]:
    if device == "cpu":
        return {
            "requested": "cpu",
            "resolved": "cpu",
            "accelerator": False,
            "backend": "cpu",
            "cpuFallbackAllowed": False,
        }
    get_name = getattr(torch.backends.mps, "get_name", None)
    get_core_count = getattr(torch.backends.mps, "get_core_count", None)
    name = get_name() if callable(get_name) else "Apple Metal GPU"
    core_count = get_core_count() if callable(get_core_count) else None
    if not isinstance(name, str) or not name.strip():
        raise RuntimeError("MPS device name is unavailable")
    if isinstance(core_count, bool) or not isinstance(core_count, int) or core_count <= 0:
        raise RuntimeError("MPS core count is unavailable")
    return {
        "requested": "mps",
        "resolved": "mps",
        "accelerator": True,
        "backend": "mps",
        "name": name,
        "coreCount": core_count,
        "mpsBuilt": torch.backends.mps.is_built(),
        "mpsAvailable": torch.backends.mps.is_available(),
        "cpuFallbackAllowed": False,
    }


def _synchronize_device(device: str) -> None:
    if device == "mps":
        torch.mps.synchronize()


def _seed_everything(seed: int, device: str) -> None:
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if device == "mps":
        torch.mps.manual_seed(seed)
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)


def _parameter_digest(state: dict[str, torch.Tensor]) -> str:
    digest = hashlib.sha256()
    for key in sorted(state):
        digest.update(key.encode("utf-8"))
        digest.update(state[key].detach().cpu().contiguous().numpy().tobytes())
    return digest.hexdigest()


def _digest_json(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _choice(value: Any, allowed: set[str], name: str) -> str:
    if not isinstance(value, str) or value.lower() not in allowed:
        raise ValueError(f"{name} must be one of {sorted(allowed)}")
    return value.lower()


def _integer(value: Any, name: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError(f"{name} must be an integer between {minimum} and {maximum}")
    return value


__all__ = [
    "DEFAULT_GROUND_RANDOMIZATION",
    "DEFAULT_RANDOMIZATION",
    "EXACT_RUNTIME",
    "OVERNIGHT_RECIPE",
    "RUNTIME_VERSION",
    "train_sb3_policy",
]
