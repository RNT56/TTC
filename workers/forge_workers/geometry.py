"""Geometry workers (P5/P6).

CI uses the deterministic fixture path. Deployments can set
`FORGE_OCCT_TESSELLATE_CMD` to replace it with a live OCCT stack while preserving
the same task and artifact contract.
"""

from __future__ import annotations

from typing import Any

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import cache_key
from forge_workers.queue import Job, registry


def tessellate(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("sourceObjectId") or payload.get("assetRef")
    if not source:
        raise ValueError("occt.tessellate requires sourceObjectId or assetRef")
    external = run_json_command(
        "FORGE_OCCT_TESSELLATE_CMD",
        {"task": "occt.tessellate", **payload, "source": source},
        timeout_s=float(payload.get("timeoutS", 1800)),
    )
    if external is not None:
        if external.get("artifactKind") != "geometry":
            external = {"artifactKind": "geometry", **external}
        external.setdefault("source", source)
        external.setdefault("cacheKey", cache_key("occt.tessellate", payload))
        external.setdefault("provider", "external-occt")
        return external
    key = cache_key("occt.tessellate", payload)
    orientation = _orientation(payload)
    profile = _print_profile(payload)
    dfm_artifact_id = f"{key}/dfm-report.json"
    three_mf_key = f"{key}/print.3mf"
    return {
        "artifactKind": "geometry",
        "source": source,
        "cacheKey": key,
        "provider": "fixture",
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
            "orientation": orientation,
            "artifactId": dfm_artifact_id,
            "notes": [],
        },
        "exports": {
            "mesh": f"{key}/mesh.glb",
            "step": f"{key}/source.step",
            "threeMf": three_mf_key,
        },
        "print": {
            "readyForQuote": True,
            "handoff": {"mode": "quote-link", "directCheckout": False},
            "threeMfArtifact": {
                "objectKey": three_mf_key,
                "orientation": orientation,
                "profile": profile,
                "dfmReport": dfm_artifact_id,
            },
            "bomSection": [
                {
                    "kind": "printed-part",
                    "source": source,
                    "quantity": max(1, _int(payload.get("quantity"), 1)),
                    "process": profile["process"],
                    "material": profile["material"],
                    "profileId": profile["id"],
                    "dfmArtifactId": dfm_artifact_id,
                    "threeMfObjectKey": three_mf_key,
                }
            ],
        },
        "fixture": True,
    }


def _orientation(payload: dict[str, Any]) -> dict[str, Any]:
    raw = payload.get("orientation")
    if isinstance(raw, dict):
        up = raw.get("up")
        support = raw.get("supportVolumeCm3")
        return {
            "up": up if isinstance(up, list) and len(up) == 3 else [0, 1, 0],
            "supportVolumeCm3": _float(support, 0.0),
        }
    return {"up": [0, 1, 0], "supportVolumeCm3": 0.0}


def _print_profile(payload: dict[str, Any]) -> dict[str, Any]:
    process = str(payload.get("process", "fdm")).lower()
    material = str(payload.get("material", payload.get("printMaterial", "pla"))).lower()
    layer_height = _float(payload.get("layerHeightMm"), 0.2)
    nozzle = _float(payload.get("nozzleMm"), 0.4)
    infill = max(0.0, min(100.0, _float(payload.get("infillPct"), 35.0)))
    return {
        "id": f"{process}:{material}:{layer_height:.2f}mm:{infill:.0f}pct",
        "process": process,
        "material": material,
        "layerHeightMm": layer_height,
        "nozzleMm": nozzle,
        "infillPct": infill,
    }


def _float(value: Any, default: float) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


def _int(value: Any, default: int) -> int:
    if isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return default
    return default


@registry.register("occt.tessellate")
def handle_tessellate(job: Job) -> dict[str, Any]:
    return tessellate(job.payload)
