"""Exact Modal deployment contract for burst compute workers.

The P7 training function is deliberately separate from the legacy multi-family
dispatcher. It receives a Rust-compiled, independently validated training bundle,
runs with no secrets or network, and requires one exact CUDA accelerator. Local and
CI imports remain keyless; a provider deployment is never implied by this module.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

try:  # pragma: no cover - Modal is deployment-only.
    import modal
except ModuleNotFoundError:  # pragma: no cover
    modal = None  # type: ignore[assignment]


MODAL_SDK_VERSION = "1.5.2"
MODAL_APP_NAME = "forge-workers"
MODAL_TRAIN_FUNCTION = "train_policy_gpu"
MODAL_TRAIN_GPU = "L4"
MODAL_TRAIN_REGION = "eu-west"
MODAL_TRAIN_TIMEOUT_S = 8 * 60 * 60
MODAL_TRAIN_MAX_CONTAINERS = 1
BASE_PIP_PACKAGES = ("jsonschema==4.26.0",)
DETERMINISTIC_RUNTIME_ENVIRONMENT = {
    "MUJOCO_GL": "egl",
    "PYTHONHASHSEED": "0",
    "CUBLAS_WORKSPACE_CONFIG": ":4096:8",
}


@dataclass(frozen=True)
class ModalTaskProfile:
    task: str
    family: str
    gpu: str | None
    timeout_s: int
    pip_packages: tuple[str, ...] = BASE_PIP_PACKAGES
    apt_packages: tuple[str, ...] = ()
    command_env: tuple[str, ...] = ()
    slo_s: int | None = None
    content_addressed_reuse_required: bool = True

    def as_dict(self) -> dict[str, Any]:
        return {
            "task": self.task,
            "family": self.family,
            "gpu": self.gpu,
            "timeoutS": self.timeout_s,
            "pipPackages": list(self.pip_packages),
            "aptPackages": list(self.apt_packages),
            "commandEnv": list(self.command_env),
            "sloS": self.slo_s,
            "contentAddressedReuseRequired": self.content_addressed_reuse_required,
        }


_SB3_PIP_PACKAGES = (
    *BASE_PIP_PACKAGES,
    "numpy==2.5.1",
    "gymnasium==1.3.0",
    "torch==2.13.0",
    "stable-baselines3==2.9.0",
    "onnx==1.22.0",
    "mujoco==3.9.0",
)
_SIM_APT_PACKAGES = ("libgl1", "libglib2.0-0")

_PROFILES: dict[str, ModalTaskProfile] = {
    "photoscan.single": ModalTaskProfile(
        task="photoscan.single",
        family="photoscan",
        gpu="any",
        timeout_s=5 * 60,
        command_env=("FORGE_PHOTOSCAN_CMD",),
        slo_s=300,
    ),
    "photoscan.multiview": ModalTaskProfile(
        task="photoscan.multiview",
        family="photoscan",
        gpu="any",
        timeout_s=5 * 60,
        apt_packages=("colmap",),
        command_env=("FORGE_COLMAP_CMD",),
        slo_s=300,
    ),
    "train.policy": ModalTaskProfile(
        task="train.policy",
        family="training",
        gpu=MODAL_TRAIN_GPU,
        timeout_s=MODAL_TRAIN_TIMEOUT_S,
        pip_packages=_SB3_PIP_PACKAGES,
        apt_packages=_SIM_APT_PACKAGES,
    ),
    "codesign.evaluate": ModalTaskProfile(
        task="codesign.evaluate",
        family="codesign",
        gpu="any",
        timeout_s=12 * 60 * 60,
        pip_packages=(*BASE_PIP_PACKAGES, "numpy>=1.26", "mujoco>=3.1", "optuna>=3.6"),
        apt_packages=_SIM_APT_PACKAGES,
        command_env=("FORGE_CODESIGN_CMD", "FORGE_MUJOCO_PARITY_CMD", "FORGE_MJX_BENCH_CMD"),
    ),
    "train.offline-bc": ModalTaskProfile(
        task="train.offline-bc",
        family="training",
        gpu=None,
        timeout_s=60 * 60,
        pip_packages=_SB3_PIP_PACKAGES,
        apt_packages=_SIM_APT_PACKAGES,
        command_env=("FORGE_OFFLINE_RL_CMD",),
    ),
    "train.sysid-fit": ModalTaskProfile(
        task="train.sysid-fit",
        family="training",
        gpu=None,
        timeout_s=30 * 60,
        pip_packages=(*BASE_PIP_PACKAGES, "numpy>=1.26"),
        command_env=("FORGE_SYSID_FIT_CMD",),
        content_addressed_reuse_required=False,
    ),
}

_FALLBACK_PROFILE = ModalTaskProfile(
    task="*",
    family="generic",
    gpu=None,
    timeout_s=60 * 60,
    content_addressed_reuse_required=False,
)


def modal_profile(task: str) -> ModalTaskProfile:
    """Return the declared runtime profile for one worker task."""

    return _PROFILES.get(task, _FALLBACK_PROFILE)


def modal_profiles() -> dict[str, dict[str, Any]]:
    """Return all known Modal task profiles as JSON-serializable data."""

    return {task: profile.as_dict() for task, profile in sorted(_PROFILES.items())}


def deployment_contract(source_revision: str | None = None) -> dict[str, Any]:
    """Return the exact P7 training deployment specification and its stable hash."""

    revision = source_revision or _source_revision()
    contract = {
        "schemaVersion": "forge-modal-training-deployment/1.0.0",
        "provider": "modal",
        "sourceRevision": revision,
        "appName": MODAL_APP_NAME,
        "functionName": MODAL_TRAIN_FUNCTION,
        "sdkVersion": MODAL_SDK_VERSION,
        "pythonVersion": "3.12",
        "profile": modal_profile("train.policy").as_dict(),
        "resources": {
            "gpu": MODAL_TRAIN_GPU,
            "cpu": 4.0,
            "memoryMiB": 16_384,
            "ephemeralDiskMiB": 20_480,
            "region": MODAL_TRAIN_REGION,
            "maxContainers": MODAL_TRAIN_MAX_CONTAINERS,
            "minContainers": 0,
            "bufferContainers": 0,
            "timeoutS": MODAL_TRAIN_TIMEOUT_S,
            "retries": 0,
            "preemptible": True,
            "singleUseContainers": True,
        },
        "security": {
            "functionSecrets": [],
            "networkBlocked": True,
            "modalAccessRestricted": True,
            "inputSecretsAllowed": False,
        },
        "runtimeEnvironment": dict(DETERMINISTIC_RUNTIME_ENVIRONMENT),
        "retention": {
            "providerInputOutputMaximumDays": 7,
            "controlledNonPersonalInputsOnly": True,
            "recordedDeviceInputsAllowed": False,
            "authoritativeArtifacts": "gateway-owned content-addressed object storage",
        },
        "authority": {
            "input": "gateway snapshot plus sovereign Rust-compiled training bundle",
            "device": "exact CUDA without CPU fallback",
            "retryOwner": "D38 Postgres attempt lease; provider retries disabled",
            "result": "scorecard-gated exact ONNX bytes",
        },
    }
    return {**contract, "contractHash": _digest_json(contract)}


def _source_revision() -> str:
    revision = os.getenv("FORGE_SOURCE_REVISION", "")
    if not revision:
        root = Path(__file__).resolve().parents[2]
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
        raise RuntimeError("Modal deployment requires an exact 40-character source revision")
    return revision


def _digest_json(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, allow_nan=False, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()


def _assert_exact_l4_result(result: Any) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise RuntimeError("Modal training returned a non-object result")
    training = result.get("training")
    authority = training.get("deviceAuthority") if isinstance(training, dict) else None
    if not isinstance(training, dict) or any(
        training.get(key) != value
        for key, value in {
            "device": "cuda",
            "optimizerUpdated": True,
            "deterministicAlgorithms": True,
            "truthExposedToPolicy": False,
        }.items()
    ):
        raise RuntimeError("Modal training result did not retain deterministic CUDA training authority")
    before = training.get("parameterDigestBefore")
    after = training.get("parameterDigestAfter")
    if (
        not isinstance(before, str)
        or not isinstance(after, str)
        or len(before) != 64
        or len(after) != 64
        or before == after
    ):
        raise RuntimeError("Modal training result did not prove an optimizer update")
    expected = {
        "requested": "cuda",
        "resolved": "cuda",
        "accelerator": True,
        "backend": "cuda",
        "deviceIndex": 0,
        "deviceCount": 1,
        "cpuFallbackAllowed": False,
    }
    if not isinstance(authority, dict) or any(authority.get(key) != value for key, value in expected.items()):
        raise RuntimeError("Modal training result did not retain exact single-CUDA authority")
    name = authority.get("name")
    if not isinstance(name, str) or "L4" not in name:
        raise RuntimeError("Modal training result did not resolve the declared L4")
    for key in ("cudaRuntime", "computeCapability"):
        value = authority.get(key)
        if not isinstance(value, str) or not value or len(value) > 40:
            raise RuntimeError(f"Modal training result has invalid {key}")
    for key in ("totalMemoryBytes", "cudnnVersion"):
        value = authority.get(key)
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            raise RuntimeError(f"Modal training result has invalid {key}")
    return result


def _run_train_policy_gpu(payload: dict[str, Any]) -> dict[str, Any]:
    from forge_workers.training.bundle import validate_training_bundle
    from forge_workers.training.sb3_training import train_sb3_policy

    contract = deployment_contract(_source_revision())
    if os.getenv("FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH") != contract["contractHash"]:
        raise RuntimeError("Modal image deployment contract hash drifted")
    if not isinstance(payload, dict) or payload.get("jobKind") != "train.policy":
        raise ValueError("Modal training accepts train.policy requests only")
    allowed = {
        "jobKind",
        "trainingBundle",
        "contractHash",
        "task",
        "recipe",
        "algorithm",
        "seed",
        "timeoutS",
        "totalTimesteps",
        "episodeSteps",
        "evalEpisodes",
        "curriculumStage",
    }
    if any(key not in allowed for key in payload):
        raise ValueError("Modal training request contains unsupported fields")
    if payload.get("device", "cuda") != "cuda":
        raise ValueError("Modal training owns exact CUDA device authority")
    bundle = validate_training_bundle(payload.get("trainingBundle"), str(payload.get("contractHash")))
    request = {**payload, "device": "cuda"}
    request.pop("trainingBundle", None)
    started = time.monotonic()
    result = _assert_exact_l4_result(train_sb3_policy(request, bundle))
    result["provider"] = "modal-sb3-mujoco"
    result["providerEvidence"] = {
        "schemaVersion": "forge-modal-provider-evidence/1.0.0",
        "provider": "modal",
        "appName": MODAL_APP_NAME,
        "functionName": MODAL_TRAIN_FUNCTION,
        "sourceRevision": contract["sourceRevision"],
        "deploymentContractHash": contract["contractHash"],
        "sdkVersion": MODAL_SDK_VERSION,
        "completedAt": datetime.now(UTC).isoformat(),
        "remoteWallTimeS": time.monotonic() - started,
        "networkBlocked": True,
        "modalAccessRestricted": True,
        "functionSecrets": [],
        "singleUseContainer": True,
        "providerRetries": 0,
    }
    return result


_deploy_revision = os.getenv("FORGE_MODAL_DEPLOY_SOURCE_REVISION", "").strip()

if modal is not None and _deploy_revision:  # pragma: no cover - deployment-only construction.
    _contract = deployment_contract(_deploy_revision)
    training_image = (
        modal.Image.debian_slim(python_version="3.12")
        .pip_install(*_SB3_PIP_PACKAGES)
        .apt_install(*_SIM_APT_PACKAGES)
        .add_local_python_source("forge_workers", copy=True)
        .env(
            {
                "FORGE_SOURCE_REVISION": _contract["sourceRevision"],
                "FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH": _contract["contractHash"],
                **DETERMINISTIC_RUNTIME_ENVIRONMENT,
            }
        )
    )
    app = modal.App(MODAL_APP_NAME)

    train_policy_gpu = app.function(
        image=training_image,
        gpu=MODAL_TRAIN_GPU,
        cpu=4.0,
        memory=16_384,
        ephemeral_disk=20_480,
        min_containers=0,
        max_containers=MODAL_TRAIN_MAX_CONTAINERS,
        buffer_containers=0,
        retries=0,
        timeout=MODAL_TRAIN_TIMEOUT_S,
        region=MODAL_TRAIN_REGION,
        nonpreemptible=False,
        block_network=True,
        restrict_modal_access=True,
        single_use_containers=True,
        include_source=False,
        name=MODAL_TRAIN_FUNCTION,
    )(_run_train_policy_gpu)

elif modal is not None:  # SDK installation alone must not construct a deployable function.
    app = modal.App(MODAL_APP_NAME)
    train_policy_gpu = None
else:
    app = None
    train_policy_gpu = None


__all__ = [
    "MODAL_APP_NAME",
    "MODAL_SDK_VERSION",
    "MODAL_TRAIN_FUNCTION",
    "ModalTaskProfile",
    "app",
    "deployment_contract",
    "modal_profile",
    "modal_profiles",
    "train_policy_gpu",
]
