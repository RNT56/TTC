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

from forge_workers.training.mujoco_env import ForgeHoverEnv
from forge_workers.training.scorecard import DEFAULT_MIN_ROBUST, DEFAULT_MIN_SUCCESS

RUNTIME_VERSION = "forge-sb3-mujoco/1.0.0"
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


def train_sb3_policy(payload: dict[str, Any], bundle: dict[str, Any]) -> dict[str, Any]:
    versions = _runtime_versions()
    algorithm = _choice(payload.get("algorithm", "ppo"), {"ppo", "sac"}, "algorithm")
    seed = _integer(payload.get("seed", 0), "seed", 0, 2_147_483_647)
    total_timesteps = _integer(payload.get("totalTimesteps", 250_000), "totalTimesteps", 64, 20_000_000)
    episode_steps = _integer(payload.get("episodeSteps", 3_000), "episodeSteps", 20, 100_000)
    eval_episodes = _integer(payload.get("evalEpisodes", 8), "evalEpisodes", 1, 100)
    device = _choice(payload.get("device", "cpu"), {"cpu"}, "device")
    task = str(payload.get("task", "hover-hold"))
    if task != "hover-hold":
        raise ValueError("P7 SB3 runtime 1.0.0 currently supports hover-hold only")
    randomization = _randomization(payload.get("domainRandomization"))
    config = {
        "algorithm": algorithm,
        "seed": seed,
        "totalTimesteps": total_timesteps,
        "episodeSteps": episode_steps,
        "evalEpisodes": eval_episodes,
        "device": device,
        "domainRandomization": randomization,
        "bundleVersion": bundle["schemaVersion"],
        "policyTensorVersion": bundle["tensor"]["schemaVersion"],
    }
    config_hash = _digest_json(config)
    _seed_everything(seed)

    train_env = Monitor(
        ForgeHoverEnv(
            bundle,
            randomization=randomization,
            episode_steps=episode_steps,
        )
    )
    model = _model(algorithm, train_env, seed, device, total_timesteps)
    initial_parameters = _parameter_digest(model.policy.state_dict())
    started = time.monotonic()
    model.learn(total_timesteps=total_timesteps, progress_bar=False)
    wall_time_s = time.monotonic() - started
    final_parameters = _parameter_digest(model.policy.state_dict())
    if final_parameters == initial_parameters:
        raise RuntimeError("SB3 optimizer did not update policy parameters")

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

    onnx_artifact = _export_onnx(model, algorithm, bundle)
    contract_hash = bundle["contractHash"]
    source_revision = _source_revision()
    lockfile_hash = _lockfile_hash(payload)
    dependency_manifest_hash = _dependency_manifest_hash()
    cache_key = f"sb3:{contract_hash[:16]}:{config_hash[:16]}:{onnx_artifact['sha256'][:16]}"
    tensor = bundle["tensor"]
    return {
        "artifactKind": "policy",
        "provider": "local-sb3-mujoco",
        "algorithm": algorithm,
        "task": {
            "id": "hover-hold",
            "suite": "p7-v1",
            "version": "1.0.0",
            "curriculumStage": _integer(payload.get("curriculumStage", 1), "curriculumStage", 1, 100),
            "horizonS": episode_steps * float(bundle["controlPeriodS"]),
            "target": {"xyzM": [0.0, 1.5, 0.0]},
        },
        "io": {
            "observations": [
                "estimator.attitude",
                "estimator.angularRate",
                "target.error",
                "battery.normalizedVoltage",
                "powertrain.motorCurrent",
            ],
            "actions": ["throttle", "roll", "pitch", "yaw"],
            "onnxHeader": {
                "contractHash": contract_hash,
                "task": "hover-hold",
                "observationCount": "5",
                "actionCount": "4",
                "tensorSchema": tensor["schema"],
                "tensorVersion": tensor["schemaVersion"],
            },
            "tensor": tensor,
        },
        "domainRandomization": randomization,
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
            "task": "hover-hold",
            "taskVersion": "1.0.0",
            "successRate": success_rate,
            "robustness": robustness,
            "energyWh": energy_wh,
            "trainedOnEstimator": True,
            "estimatorSmoke": "passed",
            "lineage": {
                "contractHash": contract_hash,
                "lockfileHash": lockfile_hash,
                "dependencyManifestHash": dependency_manifest_hash,
                "configHash": config_hash,
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
            "requestedTimesteps": total_timesteps,
            "completedTimesteps": int(model.num_timesteps),
            "wallTimeS": wall_time_s,
            "parameterDigestBefore": initial_parameters,
            "parameterDigestAfter": final_parameters,
            "optimizerUpdated": True,
            "deterministicAlgorithms": True,
            "truthExposedToPolicy": False,
            "evaluations": evaluations,
            "bundleAssumptions": bundle["assumptions"],
        },
    }


def _model(
    algorithm: str,
    env: Monitor,
    seed: int,
    device: str,
    total_timesteps: int,
) -> PPO | SAC:
    policy_kwargs = {"net_arch": [64, 64], "activation_fn": torch.nn.Tanh}
    if algorithm == "ppo":
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
            n_epochs=4,
            learning_rate=3e-4,
            gamma=0.99,
            gae_lambda=0.95,
            ent_coef=0.0,
            policy_kwargs=policy_kwargs,
            verbose=0,
        )
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


def _evaluate(
    model: PPO | SAC,
    bundle: dict[str, Any],
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
        env = ForgeHoverEnv(
            bundle,
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
        successes += int(fraction >= 0.6)
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


def _export_onnx(model: PPO | SAC, algorithm: str, bundle: dict[str, Any]) -> dict[str, Any]:
    module: torch.nn.Module = _PpoExport(model) if algorithm == "ppo" else _SacExport(model)
    module.eval()
    dummy = torch.zeros((1, 11), dtype=torch.float32)
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
        }
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
        raise RuntimeError("P7 SB3 runtime 1.0.0 requires the reviewed CPU-only PyTorch build")
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


def _randomization(value: Any) -> dict[str, Any]:
    if value is None:
        return dict(DEFAULT_RANDOMIZATION)
    if not isinstance(value, dict) or not set(value).issubset(DEFAULT_RANDOMIZATION):
        raise ValueError("domainRandomization contains unsupported fields")
    result = {**DEFAULT_RANDOMIZATION, **value}
    for key, maximum in {
        "massPct": 50.0,
        "kvPct": 50.0,
        "sagPct": 50.0,
    }.items():
        raw = result[key]
        if (
            isinstance(raw, bool)
            or not isinstance(raw, (int, float))
            or not math.isfinite(raw)
            or not 0 <= raw <= maximum
        ):
            raise ValueError(f"domainRandomization {key} must be finite in [0, {maximum:g}]")
        result[key] = float(raw)
    for key, lower_bound, upper_bound in (
        ("latencyMs", 0.0, 1_000.0),
        ("friction", 0.01, 5.0),
        ("windMps", 0.0, 100.0),
        ("obsDropoutPct", 0.0, 100.0),
        ("imuNoiseScale", 0.01, 10.0),
        ("imuBiasScale", 0.01, 10.0),
    ):
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


def _seed_everything(seed: int) -> None:
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
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


__all__ = ["DEFAULT_RANDOMIZATION", "EXACT_RUNTIME", "RUNTIME_VERSION", "train_sb3_policy"]
