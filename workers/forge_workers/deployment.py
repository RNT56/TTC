"""Fail-closed managed deployment bootstrap for the private worker process."""

from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Mapping

DEPLOYMENT_MANIFEST_VERSION = "1.0.0"
DEPLOYMENT_ENVIRONMENTS = (
    "local",
    "ci",
    "sandbox",
    "staging",
    "production",
    "controlled-lab",
)
_WORKER_ENVIRONMENTS = frozenset(("sandbox", "staging", "production"))
_GIT_HASH = re.compile(r"^[a-f0-9]{40}$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_MAX_MANIFEST_BYTES = 1024 * 1024


def _mapping(value: object, label: str) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise RuntimeError(f"{label} is invalid")
    return value


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name)
    if not value:
        raise RuntimeError(f"managed worker startup requires {name}")
    return value


def assert_deployment_bootstrap(env: Mapping[str, str] | None = None) -> None:
    """Require exact non-secret deployment authority before managed worker startup."""

    values = os.environ if env is None else env
    node_environment = values.get("NODE_ENV")
    deployment_environment = values.get("FORGE_DEPLOYMENT_ENVIRONMENT")
    if node_environment != "production":
        if deployment_environment in _WORKER_ENVIRONMENTS:
            raise RuntimeError("managed worker environment requires NODE_ENV=production")
        return
    if deployment_environment not in _WORKER_ENVIRONMENTS:
        raise RuntimeError("production worker requires sandbox, staging, or production deployment environment")
    if values.get("FORGE_ENV"):
        raise RuntimeError("managed worker startup rejects legacy FORGE_ENV")

    manifest_path = Path(_required(values, "FORGE_DEPLOYMENT_MANIFEST"))
    expected_digest = _required(values, "FORGE_DEPLOYMENT_MANIFEST_SHA256")
    artifact_digest = _required(values, "FORGE_DEPLOYMENT_ARTIFACT_SHA256")
    source_revision = _required(values, "FORGE_SOURCE_REVISION")
    if _SHA256.fullmatch(expected_digest) is None:
        raise RuntimeError("FORGE_DEPLOYMENT_MANIFEST_SHA256 is invalid")
    if _SHA256.fullmatch(artifact_digest) is None:
        raise RuntimeError("FORGE_DEPLOYMENT_ARTIFACT_SHA256 is invalid")
    if _GIT_HASH.fullmatch(source_revision) is None:
        raise RuntimeError("FORGE_SOURCE_REVISION is invalid")
    if values.get("FORGE_RUNTIME_SECRETS_SOURCE") != "files":
        raise RuntimeError("managed worker startup requires file-mounted runtime secrets")
    size = manifest_path.stat().st_size
    if not manifest_path.is_file() or size <= 0 or size > _MAX_MANIFEST_BYTES:
        raise RuntimeError("deployment manifest file size is invalid")
    manifest_bytes = manifest_path.read_bytes()
    if hashlib.sha256(manifest_bytes).hexdigest() != expected_digest:
        raise RuntimeError("deployment manifest digest mismatch")
    try:
        manifest = _mapping(json.loads(manifest_bytes), "deployment manifest")
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise RuntimeError("deployment manifest is not valid JSON") from error
    source = _mapping(manifest.get("source"), "deployment manifest source")
    configuration = _mapping(manifest.get("configuration"), "deployment manifest configuration")
    configuration_values = _mapping(configuration.get("values"), "deployment manifest configuration values")
    artifacts = manifest.get("artifacts")
    has_workers = isinstance(artifacts, list) and any(
        isinstance(artifact, dict)
        and artifact.get("component") == "workers"
        and artifact.get("sha256") == artifact_digest
        for artifact in artifacts
    )
    if not (
        manifest.get("schemaVersion") == f"forge-deployment-manifest/{DEPLOYMENT_MANIFEST_VERSION}"
        and manifest.get("status") == "active"
        and manifest.get("environment") == deployment_environment
        and source.get("revision") == source_revision
        and source.get("protectedMain") is True
        and source.get("worktreeClean") is True
        and configuration_values.get("FORGE_DEPLOYMENT_ENVIRONMENT") == deployment_environment
        and configuration_values.get("FORGE_SOURCE_REVISION") == source_revision
        and configuration_values.get("NODE_ENV") == "production"
        and has_workers
    ):
        raise RuntimeError("deployment manifest does not authorize this worker process")
