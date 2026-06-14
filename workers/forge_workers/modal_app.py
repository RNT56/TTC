"""Optional Modal entrypoint for burst GPU workers.

This module is not imported by local/CI worker registration. Deployments can run
`modal deploy -m forge_workers.modal_app` after installing Modal and the heavy
family-specific dependencies in the image.
"""

from __future__ import annotations

from typing import Any

from forge_workers import register_all_handlers
from forge_workers.queue import Job, registry

try:  # pragma: no cover - Modal is deployment-only.
    import modal
except ModuleNotFoundError:  # pragma: no cover
    modal = None  # type: ignore[assignment]


if modal is not None:  # pragma: no cover - exercised by deployment smoke tests.
    image = (
        modal.Image.debian_slim(python_version="3.12")
        .pip_install("jsonschema>=4.21")
        .apt_install("colmap")
    )
    app = modal.App("forge-workers")

    @app.function(image=image, timeout=12 * 60 * 60, gpu="any")
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


__all__ = ["app"]
