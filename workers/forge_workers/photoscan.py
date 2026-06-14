"""Fixture-backed photoscan workers (P5).

Live photogrammetry and OCCT refit remain behind adapters. These handlers make
the queue contract executable with deterministic object-cache keys, D13-style
acceptance, primitive refit records, and candidate component rows.
"""

from __future__ import annotations

from typing import Any

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import configured_gpu_adapter
from forge_workers.queue import Job, registry


def _images(payload: dict[str, Any]) -> list[str]:
    raw = payload.get("images") or payload.get("imageObjectIds") or []
    if isinstance(raw, str):
        return [raw]
    if isinstance(raw, list):
        return [str(item) for item in raw]
    return []


def run_photoscan(payload: dict[str, Any], *, multiview: bool) -> dict[str, Any]:
    images = _images(payload)
    minimum = 2 if multiview else 1
    if len(images) < minimum:
        raise ValueError(f"photoscan requires at least {minimum} image(s)")
    external = run_json_command(
        "FORGE_COLMAP_CMD" if multiview else "FORGE_PHOTOSCAN_CMD",
        {"task": "photoscan.multiview" if multiview else "photoscan.single", **payload, "images": images},
        timeout_s=float(payload.get("timeoutS", 300)),
    )
    if external is not None:
        if external.get("artifactKind") == "photoscan":
            return external
        cache = external.get("cacheKey") or external.get("objectCacheKey") or "external-photoscan"
        confidence = float(external.get("confidence", 0.78 if multiview else 0.68))
        return {
            "artifactKind": "photoscan",
            "provider": external.get("provider", "external"),
            "sourceImages": images,
            "objectCache": {"key": str(cache), "provider": external.get("provider", "external")},
            "alignment": external.get("alignment", {"scaleLocked": bool(payload.get("scale")), "axesLocked": bool(payload.get("axes")), "portsMarked": bool(payload.get("ports"))}),
            "acceptance": external.get(
                "acceptance",
                {
                    "gate": "D13",
                    "pass": bool(external.get("accepted", confidence >= 0.65)),
                    "fitCoveragePct": external.get("fitCoveragePct"),
                    "hausdorffPct": external.get("hausdorffPct"),
                },
            ),
            "primitiveRefit": external.get("primitiveRefit", []),
            "candidateComponent": external.get(
                "candidateComponent",
                {
                    "id": f"cmp_photoscan_{str(cache).split(':')[-1]}",
                    "source": "photoscan",
                    "confidence": confidence,
                    "review": "photoscan candidate requires owner port/scale review",
                },
            ),
        }
    gpu = configured_gpu_adapter().run(
        "photoscan.multiview" if multiview else "photoscan.single",
        {"images": images, "scale": payload.get("scale"), "axes": payload.get("axes")},
    )
    confidence = 0.78 if multiview else 0.68
    return {
        "artifactKind": "photoscan",
        "sourceImages": images,
        "objectCache": {"key": gpu["cacheKey"], "provider": gpu["provider"]},
        "alignment": {
            "scaleLocked": bool(payload.get("scale")),
            "axesLocked": bool(payload.get("axes")),
            "portsMarked": bool(payload.get("ports")),
        },
        "acceptance": {
            "gate": "D13",
            "pass": confidence >= 0.65,
            "scaleErrorPct": 1.4 if multiview else 2.6,
            "axisErrorDeg": 1.8 if multiview else 3.2,
        },
        "primitiveRefit": [
            {"kind": "box", "rmsMm": 1.8, "confidence": confidence},
            {"kind": "cylinder", "rmsMm": 2.4, "confidence": confidence - 0.08},
        ],
        "candidateComponent": {
            "id": f"cmp_photoscan_{gpu['cacheKey'].split(':')[-1]}",
            "source": "photoscan",
            "confidence": confidence,
            "review": "photoscan candidate requires owner port/scale review",
        },
    }


@registry.register("photoscan.single")
def handle_single(job: Job) -> dict[str, Any]:
    return run_photoscan(job.payload, multiview=False)


@registry.register("photoscan.multiview")
def handle_multiview(job: Job) -> dict[str, Any]:
    return run_photoscan(job.payload, multiview=True)
