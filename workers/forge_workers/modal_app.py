"""Optional Modal entrypoint for burst GPU workers.

This module is not imported by local/CI worker registration. Deployments can run
`modal deploy -m forge_workers.modal_app` after installing Modal and the heavy
family-specific dependencies in the image.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from forge_workers import register_all_handlers
from forge_workers.queue import Job, registry

try:  # pragma: no cover - Modal is deployment-only.
    import modal
except ModuleNotFoundError:  # pragma: no cover
    modal = None  # type: ignore[assignment]


BASE_PIP_PACKAGES = ("jsonschema>=4.21",)


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
    permanent_cache_required: bool = True

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
            "permanentCacheRequired": self.permanent_cache_required,
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
        gpu="any",
        timeout_s=12 * 60 * 60,
        pip_packages=_SB3_PIP_PACKAGES,
        apt_packages=_SIM_APT_PACKAGES,
        command_env=("FORGE_SB3_TRAIN_CMD",),
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
        permanent_cache_required=False,
    ),
}

_FALLBACK_PROFILE = ModalTaskProfile(
    task="*",
    family="generic",
    gpu=None,
    timeout_s=60 * 60,
    permanent_cache_required=False,
)


def modal_profile(task: str) -> ModalTaskProfile:
    """Return the deployment runtime profile for a worker task."""

    return _PROFILES.get(task, _FALLBACK_PROFILE)


def modal_profiles() -> dict[str, dict[str, Any]]:
    """Return all known Modal task profiles as JSON-serializable data."""

    return {task: profile.as_dict() for task, profile in sorted(_PROFILES.items())}


if modal is not None:  # pragma: no cover - exercised by deployment smoke tests.
    all_pip_packages = sorted({package for profile in _PROFILES.values() for package in profile.pip_packages})
    all_apt_packages = sorted({package for profile in _PROFILES.values() for package in profile.apt_packages})
    image = (
        modal.Image.debian_slim(python_version="3.12")
        .pip_install(*all_pip_packages)
        .apt_install(*all_apt_packages)
    )
    app = modal.App("forge-workers")

    @app.function(image=image, timeout=max(profile.timeout_s for profile in _PROFILES.values()), gpu="any")
    def run_task(task: str, payload: dict[str, Any]) -> dict[str, Any]:
        register_all_handlers()
        return registry.dispatch(
            Job(
                id=str(payload.get("jobId", "modal")),
                task=task,
                payload=payload,
                idempotency_key=str(payload.get("idempotencyKey", payload.get("jobId", "modal"))),
            )
        )

else:
    app = None


__all__ = ["ModalTaskProfile", "app", "modal_profile", "modal_profiles"]
