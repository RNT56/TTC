"""GPU provider seam for P5/P7/P9 workers.

The Modal implementation is intentionally an injectable adapter. CI and local
acceptance use FixtureGpuAdapter so no live token, network, or GPU is required.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Protocol

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
    app_name: str = "forge-workers"

    def run(self, task: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not os.getenv("MODAL_TOKEN_ID") or not os.getenv("MODAL_TOKEN_SECRET"):
            raise RuntimeError("Modal backend requires MODAL_TOKEN_ID and MODAL_TOKEN_SECRET")
        endpoint = os.getenv("FORGE_MODAL_ENDPOINT")
        body = {
            "task": task,
            "payload": payload,
            "cacheKey": cache_key(task, payload),
            "appName": self.app_name,
        }
        if endpoint:
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
                raw, _content_type = fetch_public_https(
                    request,
                    label="Modal backend",
                    timeout_s=float(os.getenv("FORGE_MODAL_TIMEOUT_S", "30")),
                    max_bytes=4 * 1024 * 1024,
                    allowed_content_types=("application/json", "application/problem+json"),
                    allowed_hosts=((urllib.parse.urlsplit(endpoint).hostname or ""),),
                )
                result = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError, urllib.error.URLError) as exc:
                raise RuntimeError("Modal backend returned invalid JSON") from exc
            if not isinstance(result, dict):
                raise RuntimeError("Modal backend returned non-object JSON")
            assert_bounded_json(result, label="Modal backend response", max_bytes=4 * 1024 * 1024)
            result.setdefault("provider", "modal")
            result.setdefault("task", task)
            result.setdefault("cacheKey", body["cacheKey"])
            return result
        return {
            "provider": "modal",
            "task": task,
            "cacheKey": body["cacheKey"],
            "submitted": True,
            "appName": self.app_name,
            "endpointConfigured": False,
        }


def configured_gpu_adapter() -> GpuAdapter:
    if os.getenv("FORGE_GPU_BACKEND") == "modal":
        return ModalGpuAdapter()
    return FixtureGpuAdapter()
