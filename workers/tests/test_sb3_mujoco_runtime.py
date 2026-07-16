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
from forge_workers.training.ground_env import ForgeGroundTaskEnv
from forge_workers.training.mujoco_env import (
    ForgeHoverEnv,
    ForgeMultirotorTaskEnv,
    _matrix_to_rpy,
)
from forge_workers.training.jobs import train_policy
from forge_workers.training.sb3_training import (
    _device_authority,
    _teacher_action,
    _training_device,
    train_sb3_policy,
)
from forge_workers.training.tasks import task_definition, task_definition_hash

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = ROOT / "target" / "debug" / "forge-validate"
CONTRACT = ROOT / "examples" / "vx2-mini.forge.json"
ROVER_CONTRACT = ROOT / "workers" / "tests" / "fixtures" / "rover-training.forge.json"
QUADRUPED_CONTRACT = ROOT / "examples" / "qd-mini.forge.json"


def _compile_contract(path: Path) -> dict:
    contract_json = path.read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    payload = {
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": SNAPSHOT_SCHEMA,
            "modelId": path.stem,
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
    }
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
        return compile_training_bundle(payload)


@pytest.fixture(scope="module")
def bundle() -> dict:
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    return _compile_contract(CONTRACT)


@pytest.fixture(scope="module")
def rover_bundle() -> dict:
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    return _compile_contract(ROVER_CONTRACT)


@pytest.fixture(scope="module")
def quadruped_bundle() -> dict:
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    return _compile_contract(QUADRUPED_CONTRACT)


def test_mujoco_environment_uses_exact_tensor_and_never_exposes_truth(bundle):
    env = ForgeHoverEnv(bundle, episode_steps=20, fixed_scenario={"windMps": 0.0})
    observation, info = env.reset(seed=17)
    assert observation.shape == (14,)
    assert np.isfinite(observation).all()
    assert info["trainedOnEstimator"] is True
    assert info["truthExposedToPolicy"] is False

    hover = np.zeros(4, dtype=np.float32)
    for _ in range(5):
        observation, reward, terminated, truncated, info = env.step(hover)
        assert np.isfinite(observation).all()
        assert np.isfinite(reward)
        assert info["truthExposedToPolicy"] is False
        if terminated or truncated:
            break


def test_y_up_attitude_decomposition_preserves_roll_pitch_yaw_axis_meaning():
    roll, pitch, yaw = 0.21, -0.17, 0.31
    sin_r, cos_r = np.sin(roll), np.cos(roll)
    sin_p, cos_p = np.sin(pitch), np.cos(pitch)
    sin_y, cos_y = np.sin(yaw), np.cos(yaw)
    rotate_x = np.asarray([[1, 0, 0], [0, cos_r, -sin_r], [0, sin_r, cos_r]])
    rotate_z = np.asarray([[cos_p, -sin_p, 0], [sin_p, cos_p, 0], [0, 0, 1]])
    rotate_y = np.asarray([[cos_y, 0, sin_y], [0, 1, 0], [-sin_y, 0, cos_y]])

    actual = _matrix_to_rpy(rotate_y @ rotate_z @ rotate_x)

    np.testing.assert_allclose(actual, [roll, pitch, yaw], atol=1e-12, rtol=0.0)


def test_v2_teacher_uses_body_velocity_and_normalized_flight_targets(bundle):
    observation = np.zeros(14, dtype=np.float32)
    observation[6] = 1.0
    observation[9] = 2.0
    action = _teacher_action(observation, bundle, "waypoint-chain")

    assert action.shape == (4,)
    assert np.isfinite(action).all()
    assert -1.0 <= action[0] <= 1.0
    assert action[2] < 0.0

    observation[6] = 0.0
    without_velocity_damping = _teacher_action(observation, bundle, "waypoint-chain")
    assert without_velocity_damping[2] < action[2]


def test_overnight_recipe_owns_algorithm_horizon_and_randomization(bundle):
    with pytest.raises(ValueError, match="requires PPO"):
        train_sb3_policy(
            {"task": "hover-hold", "recipe": "p7-overnight-v1", "algorithm": "sac"},
            bundle,
        )
    with pytest.raises(ValueError, match="owns its timestep, horizon"):
        train_sb3_policy(
            {"task": "hover-hold", "recipe": "p7-overnight-v1", "totalTimesteps": 64},
            bundle,
        )
    with pytest.raises(ValueError, match="frozen domain-randomization"):
        train_sb3_policy(
            {
                "task": "hover-hold",
                "recipe": "p7-overnight-v1",
                "domainRandomization": {"windMps": [0.0, 0.0]},
            },
            bundle,
        )


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

    hover = np.zeros(4, dtype=np.float32)
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


def test_ground_environments_use_exact_dynamic_tensors_and_mechanical_energy(
    rover_bundle, quadruped_bundle
):
    cases = (
        (rover_bundle, "line-follow", (11,), (2,)),
        (quadruped_bundle, "walk-to-target", (27,), (8,)),
    )
    for ground_bundle, task_id, observation_shape, action_shape in cases:
        env = ForgeGroundTaskEnv(
            ground_bundle,
            task=task_definition(task_id),
            episode_steps=20,
            fixed_scenario={"dropoutPct": 0.0},
        )
        observation, info = env.reset(seed=41)
        assert observation.shape == observation_shape
        assert env.action_space.shape == action_shape
        assert np.isfinite(observation).all()
        assert info["truthExposedToPolicy"] is False
        action = np.full(action_shape, 0.25, dtype=np.float32)
        for _ in range(5):
            observation, reward, terminated, truncated, info = env.step(action)
            assert np.isfinite(observation).all()
            assert np.isfinite(reward)
            if terminated or truncated:
                break
        assert info["energyWh"] > 0.0
        assert info["energySemantics"] == "simulated-positive-mechanical-joint-work"
        env.close()


def test_ground_randomization_refuses_authority_beyond_v1_envelope(rover_bundle):
    base = {
        "task": "line-follow",
        "algorithm": "ppo",
        "seed": 42,
        "totalTimesteps": 64,
        "episodeSteps": 20,
        "evalEpisodes": 1,
    }
    with pytest.raises(ValueError, match=r"massPct.*\[0, 15\]"):
        train_sb3_policy(
            {**base, "domainRandomization": {"massPct": 15.01}}, rover_bundle
        )
    with pytest.raises(ValueError, match=r"torquePct.*\[0, 10\]"):
        train_sb3_policy(
            {**base, "domainRandomization": {"torquePct": 10.01}}, rover_bundle
        )


def test_ground_target_progress_uses_estimator_state_only(rover_bundle, quadruped_bundle):
    for ground_bundle, task_id in (
        (rover_bundle, "line-follow"),
        (quadruped_bundle, "walk-to-target"),
    ):
        env = ForgeGroundTaskEnv(
            ground_bundle,
            task=task_definition(task_id),
            episode_steps=20,
            fixed_scenario={"latencyMs": 1_000.0, "dropoutPct": 0.0},
        )
        _, info = env.reset(seed=43)
        expected_targets = 3 if task_id == "line-follow" else 1
        for completed in range(1, expected_targets + 1):
            env._estimated_position = env.target_forge_m.copy()
            observation, reward, terminated, truncated, info = env.step(
                np.zeros(env.action_space.shape, dtype=np.float32)
            )
            assert np.isfinite(observation).all()
            assert np.isfinite(reward)
            assert info["targetsCompleted"] == completed
            assert info["targetAdvanceSource"] == "estimator.target.error"
            assert info["truthExposedToPolicy"] is False
        assert info["taskCompleted"] is True
        assert info["taskSuccessFraction"] == 1.0
        assert terminated and not truncated
        env.close()


def test_ground_runtime_refuses_task_substitution_and_unsupported_shapes(rover_bundle):
    with pytest.raises(ValueError, match="task/archetype mismatch"):
        ForgeGroundTaskEnv(rover_bundle, task=task_definition("walk-to-target"))

    substituted = task_definition("line-follow")
    substituted["env"]["path"]["points"][1] = [-1, 1.5]
    substituted["definitionHash"] = task_definition_hash(substituted)
    with pytest.raises(ValueError, match="exact worker-owned definition"):
        ForgeGroundTaskEnv(rover_bundle, task=substituted)

    with pytest.raises(ValueError, match="unsupported task"):
        ForgeGroundTaskEnv(rover_bundle, task=task_definition("obstacle-course"))


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
    assert result["io"]["tensor"]["input"]["shape"] == [1, 14]
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

    assert result["task"]["suite"] == "p7-v3"
    assert result["task"]["version"] == "3.0.0"
    assert result["task"]["coordinateFrame"] == "forge-y-up-rh-m"
    assert len(result["task"]["targets"]) == 3
    assert result["io"]["onnxHeader"]["task"] == "waypoint-chain"
    assert result["io"]["onnxHeader"]["taskDefinitionHash"] == result["task"]["definitionHash"]
    assert result["scorecard"]["task"] == "waypoint-chain"
    assert result["scorecard"]["taskVersion"] == "3.0.0"
    assert result["scorecard"]["lineage"]["taskDefinitionHash"] == result["task"]["definitionHash"]
    assert result["training"]["targetAdvanceSource"] == "estimator.target.error"
    assert result["training"]["evaluations"]["baseline"]["completionRequired"] is True
    graph = onnx.load_from_string(
        __import__("base64").b64decode(result["onnx"]["modelBase64"], validate=True)
    )
    metadata = {entry.key: entry.value for entry in graph.metadata_props}
    assert metadata["forge.task"] == "waypoint-chain"
    assert metadata["forge.taskVersion"] == "3.0.0"
    assert metadata["forge.taskDefinitionHash"] == result["task"]["definitionHash"]


@pytest.mark.parametrize(
    ("fixture_name", "task_id", "archetype", "input_count", "action_count", "target_count"),
    [
        ("rover_bundle", "line-follow", "rover", 11, 2, 4),
        ("quadruped_bundle", "walk-to-target", "quadruped", 27, 8, 1),
    ],
)
def test_real_ground_trainers_update_and_export_exact_task_bound_onnx(
    request,
    fixture_name,
    task_id,
    archetype,
    input_count,
    action_count,
    target_count,
):
    ground_bundle = request.getfixturevalue(fixture_name)
    result = train_sb3_policy(
        {
            "task": task_id,
            "algorithm": "ppo",
            "seed": 47,
            "totalTimesteps": 64,
            "episodeSteps": 20,
            "evalEpisodes": 1,
        },
        ground_bundle,
    )

    assert result["archetype"] == archetype
    assert result["task"]["suite"] == "p7-ground-v1"
    assert result["task"]["version"] == "1.0.0"
    assert len(result["task"]["targets"]) == target_count
    assert result["io"]["tensor"]["schema"] == "forge-ground-policy-tensor"
    assert result["io"]["tensor"]["input"]["shape"] == [1, input_count]
    assert result["io"]["tensor"]["output"]["shape"] == [1, action_count]
    assert result["io"]["onnxHeader"]["observationCount"] == str(input_count)
    assert result["io"]["onnxHeader"]["actionCount"] == str(action_count)
    assert result["training"]["optimizerUpdated"] is True
    assert result["training"]["truthExposedToPolicy"] is False
    assert result["training"]["energySemantics"] == "simulated-positive-mechanical-joint-work"
    assert result["training"]["evaluations"]["baseline"]["completionRequired"] is True
    assert set(result["scorecard"]["robustness"]) == {
        "mass+15%",
        "torque-10%",
        "friction-50%",
    }
    assert result["scorecard"]["energyWh"] > 0.0
    assert result["scorecard"]["energySemantics"] == "simulated-positive-mechanical-joint-work"
    graph = onnx.load_from_string(
        __import__("base64").b64decode(result["onnx"]["modelBase64"], validate=True)
    )
    metadata = {entry.key: entry.value for entry in graph.metadata_props}
    assert metadata["forge.archetype"] == archetype
    assert metadata["forge.task"] == task_id
    assert metadata["forge.taskDefinitionHash"] == result["task"]["definitionHash"]


def test_cpu_device_authority_is_explicit_and_never_claims_acceleration():
    assert _training_device("cpu") == "cpu"
    assert _device_authority("cpu") == {
        "requested": "cpu",
        "resolved": "cpu",
        "accelerator": False,
        "backend": "cpu",
        "cpuFallbackAllowed": False,
    }


def test_mps_device_refuses_cpu_fallback(monkeypatch):
    monkeypatch.setenv("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    with pytest.raises(RuntimeError, match="forbids PYTORCH_ENABLE_MPS_FALLBACK"):
        _training_device("mps")


def test_mps_device_refuses_non_apple_host(monkeypatch):
    monkeypatch.delenv("PYTORCH_ENABLE_MPS_FALLBACK", raising=False)
    monkeypatch.setattr("platform.system", lambda: "Linux")
    monkeypatch.setattr("platform.machine", lambda: "x86_64")
    with pytest.raises(RuntimeError, match="Apple silicon"):
        _training_device("mps")


def test_cuda_device_refuses_non_linux_host(monkeypatch):
    monkeypatch.setattr("platform.system", lambda: "Darwin")
    with pytest.raises(RuntimeError, match="reviewed Linux deployment runtime"):
        _training_device("cuda")


def test_cuda_device_refuses_cpu_only_torch_build(monkeypatch):
    monkeypatch.setattr("platform.system", lambda: "Linux")
    monkeypatch.setattr("torch.version.cuda", None)
    with pytest.raises(RuntimeError, match="does not include CUDA support"):
        _training_device("cuda")


def test_cuda_device_refuses_unavailable_container_gpu(monkeypatch):
    monkeypatch.setattr("platform.system", lambda: "Linux")
    monkeypatch.setattr("torch.version.cuda", "13.0")
    monkeypatch.setattr("torch.cuda.is_available", lambda: False)
    with pytest.raises(RuntimeError, match="not available in this container"):
        _training_device("cuda")


def test_cuda_device_authority_is_exact_and_forbids_cpu_fallback(monkeypatch):
    class Properties:
        total_memory = 24 * 1024**3

    monkeypatch.setattr("platform.system", lambda: "Linux")
    monkeypatch.setattr("torch.version.cuda", "13.0")
    monkeypatch.setattr("torch.cuda.is_available", lambda: True)
    monkeypatch.setattr("torch.cuda.device_count", lambda: 1)
    monkeypatch.setattr("torch.cuda.current_device", lambda: 0)
    monkeypatch.setattr("torch.cuda.get_device_name", lambda _index: "NVIDIA L4")
    monkeypatch.setattr("torch.cuda.get_device_capability", lambda _index: (8, 9))
    monkeypatch.setattr("torch.cuda.get_device_properties", lambda _index: Properties())
    monkeypatch.setattr("torch.backends.cudnn.version", lambda: 91002)

    assert _training_device("cuda") == "cuda"
    assert _device_authority("cuda") == {
        "requested": "cuda",
        "resolved": "cuda",
        "accelerator": True,
        "backend": "cuda",
        "name": "NVIDIA L4",
        "deviceIndex": 0,
        "deviceCount": 1,
        "computeCapability": "8.9",
        "totalMemoryBytes": 24 * 1024**3,
        "cudaRuntime": "13.0",
        "cudnnVersion": 91002,
        "cpuFallbackAllowed": False,
    }


@pytest.mark.skipif(
    not __import__("torch").backends.mps.is_available(),
    reason="MPS consumer hardware is not available",
)
def test_real_mps_training_resolves_exact_accelerator_and_exports_cpu_onnx(bundle, monkeypatch):
    monkeypatch.delenv("PYTORCH_ENABLE_MPS_FALLBACK", raising=False)
    result = train_sb3_policy(
        {
            "task": "hover-hold",
            "algorithm": "ppo",
            "seed": 43,
            "totalTimesteps": 64,
            "episodeSteps": 20,
            "evalEpisodes": 1,
            "device": "mps",
        },
        bundle,
    )

    authority = result["training"]["deviceAuthority"]
    assert result["training"]["device"] == "mps"
    assert authority["requested"] == authority["resolved"] == "mps"
    assert authority["backend"] == "mps"
    assert authority["accelerator"] is True
    assert authority["cpuFallbackAllowed"] is False
    assert authority["name"]
    assert authority["coreCount"] > 0
    graph = onnx.load_from_string(
        __import__("base64").b64decode(result["onnx"]["modelBase64"], validate=True)
    )
    assert graph.graph.input[0].name == "observations"


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


def test_ground_same_seed_reproduces_policy_scorecard_and_onnx(rover_bundle):
    payload = {
        "task": "line-follow",
        "algorithm": "ppo",
        "seed": 53,
        "totalTimesteps": 64,
        "episodeSteps": 20,
        "evalEpisodes": 1,
    }
    first = train_sb3_policy(payload, rover_bundle)
    second = train_sb3_policy(payload, rover_bundle)

    assert first["scorecard"] == second["scorecard"]
    assert first["training"]["parameterDigestAfter"] == second["training"]["parameterDigestAfter"]
    assert first["onnx"]["sha256"] == second["onnx"]["sha256"]


def test_worker_command_accepts_exact_ground_tensor_but_keeps_scorecard_gate(monkeypatch):
    contract_json = ROVER_CONTRACT.read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
    monkeypatch.setenv(
        "FORGE_SB3_TRAIN_CMD",
        f"{sys.executable} -m forge_workers.training.sb3_runner",
    )
    result = train_policy(
        {
            "modelId": "rover-training",
            "contractHash": contract_hash,
            "modelSnapshot": {
                "schemaVersion": SNAPSHOT_SCHEMA,
                "modelId": "rover-training",
                "contractHash": contract_hash,
                "contractJson": contract_json,
            },
            "task": "line-follow",
            "algorithm": "ppo",
            "seed": 59,
            "totalTimesteps": 64,
            "episodeSteps": 20,
            "evalEpisodes": 1,
        }
    )

    assert result["provider"] == "local-sb3-mujoco"
    assert result["archetype"] == "rover"
    assert result["io"]["tensor"]["schema"] == "forge-ground-policy-tensor"
    assert result["scorecard"]["energySemantics"] == "simulated-positive-mechanical-joint-work"
    assert not any(
        "authority" in reason or "unsupported or drifted" in reason
        for reason in result["scorecard"]["reasons"]
    )
    assert result["exportGate"] in {"exportable", "blocked"}


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
