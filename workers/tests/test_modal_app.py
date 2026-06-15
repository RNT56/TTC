import json

import forge_workers.modal_app as modal_app
from forge_workers.modal_app import app, modal_profile, modal_profiles


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
    codesign = modal_profile("codesign.evaluate").as_dict()

    assert train["timeoutS"] == 12 * 60 * 60
    assert train["gpu"] == "any"
    assert "stable-baselines3>=2.3" in train["pipPackages"]
    assert "mujoco>=3.1" in train["pipPackages"]
    assert train["commandEnv"] == ["FORGE_SB3_TRAIN_CMD"]
    assert codesign["commandEnv"] == ["FORGE_CODESIGN_CMD", "FORGE_MUJOCO_PARITY_CMD", "FORGE_MJX_BENCH_CMD"]
    assert "optuna>=3.6" in codesign["pipPackages"]


def test_modal_cpu_profiles_and_fallback_are_explicit():
    sysid = modal_profile("train.sysid-fit").as_dict()
    fallback = modal_profile("unknown.task").as_dict()

    assert sysid["gpu"] is None
    assert not sysid["permanentCacheRequired"]
    assert sysid["commandEnv"] == ["FORGE_SYSID_FIT_CMD"]
    assert fallback["task"] == "*"
    assert fallback["family"] == "generic"
    assert fallback["gpu"] is None
    assert not fallback["permanentCacheRequired"]


def test_modal_profiles_are_json_serializable():
    json.dumps(modal_profiles(), sort_keys=True)
