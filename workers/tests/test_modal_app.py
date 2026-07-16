import json

import forge_workers.modal_app as modal_app
import pytest
from forge_workers.modal_app import app, deployment_contract, modal_profile, modal_profiles
from forge_workers.training.jobs import _modal_training_payload


def test_modal_app_imports_without_requiring_modal_client():
    assert hasattr(modal_app, "app")
    assert isinstance(modal_profiles(), dict)


def test_modal_profiles_cover_live_gpu_tasks():
    profiles = modal_profiles()

    assert {"photoscan.single", "photoscan.multiview", "train.policy", "codesign.evaluate"}.issubset(
        profiles.keys()
    )
    assert profiles["photoscan.single"]["gpu"] == "any"
    assert profiles["photoscan.single"]["sloS"] == 300
    assert profiles["photoscan.single"]["timeoutS"] == 300
    assert profiles["photoscan.single"]["commandEnv"] == ["FORGE_PHOTOSCAN_CMD"]
    assert profiles["photoscan.multiview"]["aptPackages"] == ["colmap"]
    assert profiles["photoscan.multiview"]["commandEnv"] == ["FORGE_COLMAP_CMD"]


def test_modal_training_and_codesign_profiles_pin_live_dependencies():
    train = modal_profile("train.policy").as_dict()
    offline = modal_profile("train.offline-bc").as_dict()
    codesign = modal_profile("codesign.evaluate").as_dict()

    assert train["timeoutS"] == 8 * 60 * 60
    assert train["gpu"] == "L4"
    assert "numpy==2.5.1" in train["pipPackages"]
    assert "gymnasium==1.3.0" in train["pipPackages"]
    assert "torch==2.13.0" in train["pipPackages"]
    assert "stable-baselines3==2.9.0" in train["pipPackages"]
    assert "onnx==1.22.0" in train["pipPackages"]
    assert "mujoco==3.9.0" in train["pipPackages"]
    assert "jsonschema==4.26.0" in train["pipPackages"]
    assert all("==" in package for package in train["pipPackages"])
    assert train["commandEnv"] == []
    assert offline["timeoutS"] == 60 * 60
    assert offline["gpu"] is None
    assert offline["pipPackages"] == train["pipPackages"]
    assert offline["aptPackages"] == train["aptPackages"]
    assert offline["commandEnv"] == ["FORGE_OFFLINE_RL_CMD"]
    assert codesign["commandEnv"] == ["FORGE_CODESIGN_CMD", "FORGE_MUJOCO_PARITY_CMD", "FORGE_MJX_BENCH_CMD"]
    assert "optuna>=3.6" in codesign["pipPackages"]


def test_modal_cpu_profiles_and_fallback_are_explicit():
    sysid = modal_profile("train.sysid-fit").as_dict()
    fallback = modal_profile("unknown.task").as_dict()

    assert sysid["gpu"] is None
    assert not sysid["contentAddressedReuseRequired"]
    assert sysid["commandEnv"] == ["FORGE_SYSID_FIT_CMD"]
    assert fallback["task"] == "*"
    assert fallback["family"] == "generic"
    assert fallback["gpu"] is None
    assert not fallback["contentAddressedReuseRequired"]


def test_modal_profiles_are_json_serializable():
    json.dumps(modal_profiles(), sort_keys=True)


def test_modal_training_deployment_contract_is_source_bound_and_fail_closed():
    revision = "ab" * 20
    contract = deployment_contract(revision)

    assert contract["sourceRevision"] == revision
    assert contract["sdkVersion"] == "1.5.2"
    assert contract["resources"] == {
        "gpu": "L4",
        "cpu": 4.0,
        "memoryMiB": 16_384,
        "ephemeralDiskMiB": 20_480,
        "region": "eu-west",
        "maxContainers": 1,
        "minContainers": 0,
        "bufferContainers": 0,
        "timeoutS": 8 * 60 * 60,
        "retries": 0,
        "preemptible": True,
        "singleUseContainers": True,
    }
    assert contract["security"] == {
        "functionSecrets": [],
        "networkBlocked": True,
        "modalAccessRestricted": True,
        "inputSecretsAllowed": False,
    }
    assert contract["runtimeEnvironment"] == {
        "MUJOCO_GL": "egl",
        "PYTHONHASHSEED": "0",
        "CUBLAS_WORKSPACE_CONFIG": ":4096:8",
    }
    assert contract["retention"]["providerInputOutputMaximumDays"] == 7
    assert contract["retention"]["recordedDeviceInputsAllowed"] is False
    assert len(contract["contractHash"]) == 64
    assert deployment_contract(revision) == contract
    assert deployment_contract("cd" * 20)["contractHash"] != contract["contractHash"]


def test_modal_training_projection_excludes_snapshot_and_arbitrary_job_fields():
    projected = _modal_training_payload(
        {
            "contractHash": "ab" * 32,
            "modelId": "model-private",
            "modelSnapshot": {"contractJson": "private"},
            "task": "hover-hold",
            "seed": 1201,
            "apiKey": "must-not-cross-provider-boundary",
        },
        {"artifactKind": "trainingMuJoCoBundle"},
    )

    assert projected == {
        "contractHash": "ab" * 32,
        "task": "hover-hold",
        "seed": 1201,
        "jobKind": "train.policy",
        "trainingBundle": {"artifactKind": "trainingMuJoCoBundle"},
    }


def test_modal_training_function_rejects_unreviewed_input_fields(monkeypatch):
    revision = "ab" * 20
    contract = deployment_contract(revision)
    monkeypatch.setenv("FORGE_SOURCE_REVISION", revision)
    monkeypatch.setenv("FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH", contract["contractHash"])

    with pytest.raises(ValueError, match="unsupported fields"):
        modal_app._run_train_policy_gpu(
            {"jobKind": "train.policy", "apiKey": "must-not-enter-provider-retention"}
        )


def test_modal_training_result_requires_exact_single_l4_authority():
    result = {
        "training": {
            "device": "cuda",
            "optimizerUpdated": True,
            "deterministicAlgorithms": True,
            "truthExposedToPolicy": False,
            "parameterDigestBefore": "a" * 64,
            "parameterDigestAfter": "b" * 64,
            "deviceAuthority": {
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
        }
    }
    assert modal_app._assert_exact_l4_result(result) is result
    result["training"]["deviceAuthority"]["name"] = "NVIDIA A10"
    with pytest.raises(RuntimeError, match="declared L4"):
        modal_app._assert_exact_l4_result(result)
