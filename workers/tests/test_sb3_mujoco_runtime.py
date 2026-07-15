from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np
import onnx
import pytest

pytest.importorskip("gymnasium")
pytest.importorskip("stable_baselines3")
pytest.importorskip("onnx")
pytest.importorskip("torch")

from forge_workers.training.bundle import SNAPSHOT_SCHEMA, compile_training_bundle
from forge_workers.training.mujoco_env import ForgeHoverEnv, ForgeMultirotorTaskEnv
from forge_workers.training.jobs import train_policy
from forge_workers.training.sb3_training import train_sb3_policy
from forge_workers.training.tasks import task_definition, task_definition_hash

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = ROOT / "target" / "debug" / "forge-validate"
CONTRACT = ROOT / "examples" / "vx2-mini.forge.json"


@pytest.fixture(scope="module")
def bundle() -> dict:
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    contract_json = CONTRACT.read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    payload = {
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": SNAPSHOT_SCHEMA,
            "modelId": "vx2-mini",
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
    }
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
        return compile_training_bundle(payload)


def test_mujoco_environment_uses_exact_tensor_and_never_exposes_truth(bundle):
    env = ForgeHoverEnv(bundle, episode_steps=20, fixed_scenario={"windMps": 0.0})
    observation, info = env.reset(seed=17)
    assert observation.shape == (11,)
    assert np.isfinite(observation).all()
    assert info["trainedOnEstimator"] is True
    assert info["truthExposedToPolicy"] is False

    hover = np.asarray([2 * bundle["hoverThrottle"] - 1, 0, 0, 0], dtype=np.float32)
    for _ in range(5):
        observation, reward, terminated, truncated, info = env.step(hover)
        assert np.isfinite(observation).all()
        assert np.isfinite(reward)
        assert info["truthExposedToPolicy"] is False
        if terminated or truncated:
            break


def test_waypoint_environment_advances_sequential_targets_from_estimator_error_only(bundle):
    env = ForgeMultirotorTaskEnv(
        bundle,
        task=task_definition("waypoint-chain"),
        episode_steps=20,
        fixed_scenario={"latencyMs": 1_000.0, "windMps": 0.0, "dropoutPct": 0.0},
    )
    observation, info = env.reset(seed=19)
    assert info["activeTargetIndex"] == 0
    assert info["targetCount"] == 3
    assert info["targetAdvanceSource"] == "estimator.target.error"
    assert info["truthExposedToPolicy"] is False

    hover = np.asarray([2 * bundle["hoverThrottle"] - 1, 0, 0, 0], dtype=np.float32)
    for expected_completed in (1, 2, 3):
        env._estimated_position = env.target_forge_m.copy()
        observation, reward, terminated, truncated, info = env.step(hover)
        assert np.isfinite(observation).all()
        assert np.isfinite(reward)
        assert info["targetsCompleted"] == expected_completed
        assert info["targetAdvanced"] is True
        assert info["truthExposedToPolicy"] is False
        if expected_completed < 3:
            assert info["activeTargetIndex"] == expected_completed
            assert not terminated
        else:
            assert info["taskCompleted"] is True
            assert info["taskSuccessFraction"] == 1.0
            assert terminated
            assert not truncated


def test_real_multirotor_environment_refuses_drifted_and_unsupported_task_shapes(bundle):
    wrong_frame = task_definition("waypoint-chain")
    wrong_frame["coordinateFrame"] = "z-up"
    wrong_frame["definitionHash"] = task_definition_hash(wrong_frame)
    with pytest.raises(ValueError, match="Y-up"):
        ForgeMultirotorTaskEnv(bundle, task=wrong_frame)

    rover_shape = task_definition("waypoint-chain")
    rover_shape["family"] = "rover"
    rover_shape["definitionHash"] = task_definition_hash(rover_shape)
    with pytest.raises(ValueError, match="non-multirotor"):
        ForgeMultirotorTaskEnv(bundle, task=rover_shape)

    substituted_target = task_definition("waypoint-chain")
    substituted_target["env"]["targets"][0]["xyz"] = [-3, 2, 2]
    substituted_target["definitionHash"] = task_definition_hash(substituted_target)
    with pytest.raises(ValueError, match="exact worker-owned definition"):
        ForgeMultirotorTaskEnv(bundle, task=substituted_target)

    with pytest.raises(ValueError, match="supports hover-hold and waypoint-chain only"):
        ForgeMultirotorTaskEnv(bundle, task=task_definition("gate-slalom"))


@pytest.mark.parametrize("algorithm", ["ppo", "sac"])
def test_real_sb3_algorithms_update_and_export_digest_bound_onnx(bundle, algorithm):
    result = train_sb3_policy(
        {
            "task": "hover-hold",
            "algorithm": algorithm,
            "seed": 23,
            "totalTimesteps": 64,
            "episodeSteps": 20,
            "evalEpisodes": 1,
        },
        bundle,
    )

    assert result["provider"] == "local-sb3-mujoco"
    assert result["algorithm"] == algorithm
    assert result["training"]["optimizerUpdated"] is True
    assert result["training"]["truthExposedToPolicy"] is False
    assert result["training"]["parameterDigestBefore"] != result["training"]["parameterDigestAfter"]
    assert result["training"]["versions"]["mujoco"] == "3.9.0"
    assert result["training"]["versions"]["python"].startswith("3.12.")
    assert result["training"]["device"] == "cpu"
    assert result["training"]["evaluations"]["baseline"]["scenario"] == {
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
    assert result["scorecard"]["trainedOnEstimator"] is True
    assert len(result["scorecard"]["lineage"]["sourceRevision"]) == 40
    assert len(result["scorecard"]["lineage"]["lockfileHash"]) == 64
    assert len(result["scorecard"]["lineage"]["dependencyManifestHash"]) == 64
    assert result["io"]["tensor"]["input"]["shape"] == [1, 11]
    assert result["io"]["tensor"]["output"]["shape"] == [1, 4]
    model_bytes = __import__("base64").b64decode(result["onnx"]["modelBase64"], validate=True)
    assert len(model_bytes) == result["onnx"]["byteSize"]
    assert hashlib.sha256(model_bytes).hexdigest() == result["onnx"]["sha256"]


def test_real_waypoint_trainer_exports_task_bound_policy_and_scorecard(bundle):
    result = train_sb3_policy(
        {
            "task": "waypoint-chain",
            "algorithm": "ppo",
            "seed": 29,
            "totalTimesteps": 64,
            "episodeSteps": 20,
            "evalEpisodes": 1,
        },
        bundle,
    )

    assert result["task"]["suite"] == "p7-v2"
    assert result["task"]["version"] == "2.0.0"
    assert result["task"]["coordinateFrame"] == "forge-y-up-rh-m"
    assert len(result["task"]["targets"]) == 3
    assert result["io"]["onnxHeader"]["task"] == "waypoint-chain"
    assert result["io"]["onnxHeader"]["taskDefinitionHash"] == result["task"]["definitionHash"]
    assert result["scorecard"]["task"] == "waypoint-chain"
    assert result["scorecard"]["taskVersion"] == "2.0.0"
    assert result["scorecard"]["lineage"]["taskDefinitionHash"] == result["task"]["definitionHash"]
    assert result["training"]["targetAdvanceSource"] == "estimator.target.error"
    assert result["training"]["evaluations"]["baseline"]["completionRequired"] is True
    graph = onnx.load_from_string(
        __import__("base64").b64decode(result["onnx"]["modelBase64"], validate=True)
    )
    metadata = {entry.key: entry.value for entry in graph.metadata_props}
    assert metadata["forge.task"] == "waypoint-chain"
    assert metadata["forge.taskVersion"] == "2.0.0"
    assert metadata["forge.taskDefinitionHash"] == result["task"]["definitionHash"]


def test_same_seed_reproduces_policy_and_onnx_digests(bundle):
    payload = {
        "task": "waypoint-chain",
        "algorithm": "ppo",
        "seed": 31,
        "totalTimesteps": 64,
        "episodeSteps": 20,
        "evalEpisodes": 1,
    }
    first = train_sb3_policy(payload, bundle)
    second = train_sb3_policy(payload, bundle)

    assert first["scorecard"] == second["scorecard"]
    assert first["training"]["parameterDigestAfter"] == second["training"]["parameterDigestAfter"]
    assert first["onnx"]["sha256"] == second["onnx"]["sha256"]


def test_worker_command_executes_real_runtime_and_reapplies_scorecard_gate(bundle, monkeypatch):
    contract_json = CONTRACT.read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
    monkeypatch.setenv(
        "FORGE_SB3_TRAIN_CMD",
        f"{sys.executable} -m forge_workers.training.sb3_runner",
    )
    result = train_policy(
        {
            "modelId": "vx2-mini",
            "contractHash": contract_hash,
            "modelSnapshot": {
                "schemaVersion": SNAPSHOT_SCHEMA,
                "modelId": "vx2-mini",
                "contractHash": contract_hash,
                "contractJson": contract_json,
            },
            "task": "hover-hold",
            "algorithm": "ppo",
            "seed": 37,
            "totalTimesteps": 64,
            "episodeSteps": 20,
            "evalEpisodes": 1,
        }
    )

    assert result["provider"] == "local-sb3-mujoco"
    assert result["onnx"]["fixture"] is False
    assert result["io"]["tensor"]["schema"] == "forge-policy-tensor"
    assert result["scorecard"]["lineage"]["contractHash"] == contract_hash
    assert result["scorecard"]["trainedOnEstimator"] is True
    assert result["training"]["optimizerUpdated"] is True
    assert result["training"]["truthExposedToPolicy"] is False
    assert result["exportGate"] in {"exportable", "blocked"}
