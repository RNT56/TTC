"""GPU provider seam for P5/P7/P9 workers.

The Modal implementation is intentionally an injectable adapter. CI and local
acceptance use FixtureGpuAdapter so no live token, network, or GPU is required.
"""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Callable, Protocol

from forge_workers.faults import ProviderRecoveryPendingError, ProviderUnavailableError
from forge_workers.modal_app import (
    MODAL_APP_NAME,
    MODAL_SDK_VERSION,
    MODAL_TRAIN_FUNCTION,
    MODAL_TRAIN_TIMEOUT_S,
    deployment_contract,
)
from forge_workers.net_security import assert_bounded_json, fetch_public_https


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def cache_key(prefix: str, payload: Any) -> str:
    digest = hashlib.sha256(stable_json(payload).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{digest}"


class GpuAdapter(Protocol):
    def run(self, task: str, payload: dict[str, Any]) -> dict[str, Any]: ...


@dataclass(frozen=True)
class FixtureGpuAdapter:
    provider: str = "fixture"

    def run(self, task: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "provider": self.provider,
            "task": task,
            "cacheKey": cache_key(task, payload),
            "deterministic": True,
        }


@dataclass(frozen=True)
class ModalGpuAdapter:
    app_name: str = MODAL_APP_NAME
    function_loader: Callable[[], Any] | None = field(default=None, repr=False, compare=False)
    call_loader: Callable[[str], Any] | None = field(default=None, repr=False, compare=False)
    resume_call_id: str | None = None
    resume_identity: dict[str, Any] | None = field(default=None, repr=False, compare=False)
    call_sink: Callable[[str, dict[str, Any]], None] | None = field(
        default=None, repr=False, compare=False
    )
    cancellation_requested: Callable[[], bool] | None = field(
        default=None, repr=False, compare=False
    )
    cancelled_sink: Callable[[str], None] | None = field(default=None, repr=False, compare=False)
    clock: Callable[[], float] = field(default=time.monotonic, repr=False, compare=False)

    def run(self, task: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not os.getenv("MODAL_TOKEN_ID") or not os.getenv("MODAL_TOKEN_SECRET"):
            raise RuntimeError("Modal backend requires MODAL_TOKEN_ID and MODAL_TOKEN_SECRET")
        if task == "train.policy":
            return self._run_training(payload)
        endpoint = os.getenv("FORGE_MODAL_ENDPOINT")
        if not endpoint:
            raise RuntimeError(
                f"Modal task {task} requires FORGE_MODAL_ENDPOINT; no provider call was submitted"
            )
        body = {
            "task": task,
            "payload": payload,
            "cacheKey": cache_key(task, payload),
            "appName": self.app_name,
        }
        request = urllib.request.Request(
            endpoint,
            data=stable_json(body).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-modal-token-id": os.environ["MODAL_TOKEN_ID"],
                "x-modal-token-secret": os.environ["MODAL_TOKEN_SECRET"],
            },
            method="POST",
        )
        try:
            timeout_s = float(os.getenv("FORGE_MODAL_TIMEOUT_S", "30"))
            payload_timeout = payload.get("timeoutS")
            if isinstance(payload_timeout, (int, float)) and math.isfinite(float(payload_timeout)):
                timeout_s = min(timeout_s, float(payload_timeout))
            raw, _content_type = fetch_public_https(
                request,
                label="Modal backend",
                timeout_s=max(1.0, timeout_s),
                max_bytes=4 * 1024 * 1024,
                allowed_content_types=("application/json", "application/problem+json"),
                allowed_hosts=((urllib.parse.urlsplit(endpoint).hostname or ""),),
            )
            result = json.loads(raw.decode("utf-8"))
        except urllib.error.URLError as exc:
            raise ProviderUnavailableError("Modal backend request failed") from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RuntimeError("Modal backend returned invalid JSON") from exc
        if not isinstance(result, dict):
            raise RuntimeError("Modal backend returned non-object JSON")
        assert_bounded_json(result, label="Modal backend response", max_bytes=4 * 1024 * 1024)
        result.setdefault("provider", "modal")
        result.setdefault("task", task)
        result.setdefault("cacheKey", body["cacheKey"])
        return result

    def _run_training(self, payload: dict[str, Any]) -> dict[str, Any]:
        environment, version, source_revision, contract_hash = _training_deployment_identity()
        expected = deployment_contract(source_revision)
        if expected["contractHash"] != contract_hash:
            raise RuntimeError("configured Modal deployment contract hash does not match source authority")
        started = self.clock()
        recovering = self.resume_call_id is not None
        if recovering:
            call_id = self.resume_call_id
            identity = self.resume_identity
            if not isinstance(call_id, str) or not 3 <= len(call_id) <= 200:
                raise RuntimeError("Modal recovery requires a bounded provider call ID")
            if not isinstance(identity, dict):
                raise RuntimeError("Modal recovery requires persisted deployment identity")
            expected_identity = {
                "environment": environment,
                "functionVersion": version,
                "sourceRevision": source_revision,
                "deploymentContractHash": contract_hash,
            }
            if any(identity.get(key) != value for key, value in expected_identity.items()):
                raise RuntimeError("persisted Modal call identity does not match configured deployment")
            submitted_at = identity.get("submittedAt")
            if not isinstance(submitted_at, str) or not submitted_at:
                raise RuntimeError("Modal recovery requires persisted submit time")
            try:
                call = self.call_loader(call_id) if self.call_loader is not None else _function_call(call_id)
            except Exception as error:  # noqa: BLE001 - unresolved identity must never spawn anew.
                raise ProviderRecoveryPendingError("persisted Modal call could not be reattached") from error
        else:
            function = self.function_loader() if self.function_loader is not None else _training_function(
                environment, version
            )
            submitted_at = datetime.now(UTC).isoformat()
            call = function.spawn(payload)
            call_id = getattr(call, "object_id", None)
            if not isinstance(call_id, str) or not 3 <= len(call_id) <= 200:
                raise RuntimeError("Modal training call did not return a bounded provider call ID")
        timeout_s = _training_timeout(payload)
        if not recovering and self.call_sink is not None:
            try:
                self.call_sink(
                    call_id,
                    {
                        "environment": environment,
                        "functionVersion": version,
                        "sourceRevision": source_revision,
                        "deploymentContractHash": contract_hash,
                        "submittedAt": submitted_at,
                    },
                )
            except Exception:
                call.cancel(terminate_containers=True)
                if self.cancelled_sink is not None:
                    self.cancelled_sink(call_id)
                raise
        deadline = started + timeout_s
        while True:
            if self.cancellation_requested is not None and self.cancellation_requested():
                call.cancel(terminate_containers=True)
                if self.cancelled_sink is not None:
                    self.cancelled_sink(call_id)
                raise ProviderUnavailableError("Modal training call was cancelled by job authority")
            remaining = deadline - self.clock()
            if remaining <= 0:
                call.cancel(terminate_containers=True)
                if self.cancelled_sink is not None:
                    self.cancelled_sink(call_id)
                raise ProviderUnavailableError("Modal training call timed out and was cancelled")
            try:
                result = call.get(timeout=min(5.0, remaining))
                break
            except TimeoutError:
                continue
            except Exception as error:  # noqa: BLE001 - provider errors cross a stable boundary.
                if recovering or self.call_sink is not None:
                    raise ProviderRecoveryPendingError(
                        "persisted Modal call remains unresolved"
                    ) from error
                raise ProviderUnavailableError("Modal training call failed") from error
        if not isinstance(result, dict):
            raise RuntimeError("Modal training returned non-object JSON")
        assert_bounded_json(result, label="Modal training response", max_bytes=8 * 1024 * 1024)
        evidence = result.get("providerEvidence")
        required = {
            "provider": "modal",
            "appName": self.app_name,
            "functionName": MODAL_TRAIN_FUNCTION,
            "sourceRevision": source_revision,
            "deploymentContractHash": contract_hash,
            "sdkVersion": MODAL_SDK_VERSION,
            "networkBlocked": True,
            "modalAccessRestricted": True,
            "functionSecrets": [],
            "singleUseContainer": True,
            "providerRetries": 0,
        }
        if not isinstance(evidence, dict) or any(evidence.get(key) != value for key, value in required.items()):
            raise RuntimeError("Modal training provider evidence is missing or drifted")
        result["providerEvidence"] = {
            **evidence,
            "environment": environment,
            "functionVersion": version,
            "functionCallId": call_id,
            "submittedAt": submitted_at,
            "clientCompletedAt": datetime.now(UTC).isoformat(),
            "clientWallTimeS": self.clock() - started,
            "recoveredByFunctionCallId": recovering,
        }
        return result

    def cancel(self, function_call_id: str) -> None:
        if not isinstance(function_call_id, str) or not 3 <= len(function_call_id) <= 200:
            raise ValueError("Modal function call ID is invalid")
        call = self.call_loader(function_call_id) if self.call_loader is not None else _function_call(
            function_call_id
        )
        call.cancel(terminate_containers=True)


def _training_deployment_identity() -> tuple[str, int, str, str]:
    environment = os.getenv("FORGE_MODAL_ENVIRONMENT", "").strip()
    raw_version = os.getenv("FORGE_MODAL_FUNCTION_VERSION", "").strip()
    source_revision = os.getenv("FORGE_MODAL_SOURCE_REVISION", "").strip()
    contract_hash = os.getenv("FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH", "").strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,79}", environment):
        raise RuntimeError("Modal training requires a bounded FORGE_MODAL_ENVIRONMENT")
    try:
        version = int(raw_version)
    except ValueError as error:
        raise RuntimeError("Modal training requires an exact FORGE_MODAL_FUNCTION_VERSION") from error
    if version <= 0 or version > 9_007_199_254_740_991:
        raise RuntimeError("Modal training requires a positive FORGE_MODAL_FUNCTION_VERSION")
    if len(source_revision) != 40 or any(char not in "0123456789abcdef" for char in source_revision):
        raise RuntimeError("Modal training requires an exact FORGE_MODAL_SOURCE_REVISION")
    if len(contract_hash) != 64 or any(char not in "0123456789abcdef" for char in contract_hash):
        raise RuntimeError("Modal training requires an exact deployment contract hash")
    return environment, version, source_revision, contract_hash


def _training_function(environment: str, version: int) -> Any:
    try:
        import modal
    except ModuleNotFoundError as error:
        raise RuntimeError("Modal training requires workers[deployment]") from error
    if importlib.metadata.version("modal") != MODAL_SDK_VERSION:
        raise RuntimeError(f"Modal SDK must be exactly {MODAL_SDK_VERSION}")
    return modal.Function.from_name(
        MODAL_APP_NAME,
        MODAL_TRAIN_FUNCTION,
        version=version,
        environment_name=environment,
    )


def _function_call(function_call_id: str) -> Any:
    try:
        import modal
    except ModuleNotFoundError as error:
        raise RuntimeError("Modal cancellation requires workers[deployment]") from error
    if importlib.metadata.version("modal") != MODAL_SDK_VERSION:
        raise RuntimeError(f"Modal SDK must be exactly {MODAL_SDK_VERSION}")
    return modal.FunctionCall.from_id(function_call_id)


def _training_timeout(payload: dict[str, Any]) -> float:
    value = payload.get("timeoutS", MODAL_TRAIN_TIMEOUT_S)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("Modal training timeoutS must be finite")
    return min(max(float(value), 1.0), float(MODAL_TRAIN_TIMEOUT_S))


def configured_gpu_adapter(
    *,
    call_sink: Callable[[str, dict[str, Any]], None] | None = None,
    cancellation_requested: Callable[[], bool] | None = None,
    cancelled_sink: Callable[[str], None] | None = None,
    resume_call_id: str | None = None,
    resume_identity: dict[str, Any] | None = None,
) -> GpuAdapter:
    if os.getenv("FORGE_GPU_BACKEND") == "modal":
        return ModalGpuAdapter(
            call_sink=call_sink,
            cancellation_requested=cancellation_requested,
            cancelled_sink=cancelled_sink,
            resume_call_id=resume_call_id,
            resume_identity=resume_identity,
        )
    return FixtureGpuAdapter()
