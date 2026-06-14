"""Geometry worker fixtures (P5/P6).

OCCT ingestion is not required for local closure, but the task contract exists:
an object/cache key in, deterministic tessellation metadata out.
"""

from __future__ import annotations

from typing import Any

from forge_workers.modal_adapter import cache_key
from forge_workers.queue import Job, registry


def tessellate(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("sourceObjectId") or payload.get("assetRef")
    if not source:
        raise ValueError("occt.tessellate requires sourceObjectId or assetRef")
    key = cache_key("occt.tessellate", payload)
    return {
        "artifactKind": "geometry",
        "source": source,
        "cacheKey": key,
        "faces": 512,
        "vertices": 288,
        "lods": [
            {"name": "high", "faces": 512},
            {"name": "medium", "faces": 192},
            {"name": "low", "faces": 96},
        ],
        "collider": {
            "kind": "auto-fit",
            "primitiveCount": 3,
            "budget": {"perNode": 8, "perModel": 24},
            "overflowNodes": [],
        },
        "dfm": {
            "process": payload.get("process", "fdm"),
            "pass": True,
            "orientation": {"up": [0, 1, 0], "supportVolumeCm3": 0.0},
            "notes": [],
        },
        "exports": {
            "mesh": f"{key}/mesh.glb",
            "step": f"{key}/source.step",
            "threeMf": f"{key}/print.3mf",
        },
        "fixture": True,
    }


@registry.register("occt.tessellate")
def handle_tessellate(job: Job) -> dict[str, Any]:
    return tessellate(job.payload)
