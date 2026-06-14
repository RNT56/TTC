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
        return _external_result(external, payload, images, multiview=multiview)
    gpu = configured_gpu_adapter().run(
        "photoscan.multiview" if multiview else "photoscan.single",
        {"images": images, "scale": payload.get("scale"), "axes": payload.get("axes")},
    )
    confidence = 0.78 if multiview else 0.68
    pipeline = _pipeline(images, multiview=multiview, cache_key=gpu["cacheKey"])
    acceptance = _acceptance(confidence, multiview=multiview)
    review_flags = _review_flags(payload, acceptance)
    return {
        "artifactKind": "photoscan",
        "sourceImages": images,
        "objectCache": {"key": gpu["cacheKey"], "provider": gpu["provider"]},
        "pipeline": pipeline,
        "colmap": _colmap(images) if multiview else None,
        "alignment": {
            "scaleLocked": bool(payload.get("scale")),
            "axesLocked": bool(payload.get("axes")),
            "portsMarked": bool(payload.get("ports")),
            "knownDimensionMm": _known_dimension_mm(payload.get("scale")),
            "axis": payload.get("axes") if isinstance(payload.get("axes"), str) else None,
            "ports": payload.get("ports") if isinstance(payload.get("ports"), list) else [],
        },
        "acceptance": acceptance,
        "primitiveRefit": [
            {"kind": "box", "rmsMm": 1.8, "confidence": confidence, "coveragePct": 42.0 if multiview else 38.0},
            {"kind": "cylinder", "rmsMm": 2.4, "confidence": confidence - 0.08, "coveragePct": 33.0 if multiview else 28.0},
        ],
        "candidateComponent": {
            "id": f"cmp_photoscan_{gpu['cacheKey'].split(':')[-1]}",
            "source": "photoscan",
            "confidence": confidence,
            "reviewRequired": True,
            "ownerReviewFlags": review_flags,
            "dfmState": "candidate",
            "review": "photoscan candidate requires owner port/scale review",
        },
    }


def _external_result(external: dict[str, Any], payload: dict[str, Any], images: list[str], *, multiview: bool) -> dict[str, Any]:
    provider = str(external.get("provider", "external-colmap" if multiview else "external-trellis"))
    cache = str(external.get("cacheKey") or external.get("objectCacheKey") or f"{provider}:uncached")
    confidence = _number(external.get("confidence"), 0.78 if multiview else 0.68)
    acceptance = _external_acceptance(external, confidence=confidence, multiview=multiview)
    duration_s = _number(external.get("durationS", external.get("elapsedS")), 0.0)
    candidate = external.get("candidateComponent") if isinstance(external.get("candidateComponent"), dict) else {}
    primitive_refit = external.get("primitiveRefit") if isinstance(external.get("primitiveRefit"), list) else []
    result = {
        "artifactKind": "photoscan",
        "provider": provider,
        "sourceImages": images,
        "objectCache": {"key": cache, "provider": provider, "permanent": True},
        "pipeline": _external_pipeline(external, images, cache_key=cache, provider=provider, multiview=multiview),
        "colmap": _external_colmap(external, images) if multiview else None,
        "alignment": external.get(
            "alignment",
            {
                "scaleLocked": bool(payload.get("scale")),
                "axesLocked": bool(payload.get("axes")),
                "portsMarked": bool(payload.get("ports")),
                "knownDimensionMm": _known_dimension_mm(payload.get("scale")),
                "axis": payload.get("axes") if isinstance(payload.get("axes"), str) else None,
                "ports": payload.get("ports") if isinstance(payload.get("ports"), list) else [],
            },
        ),
        "acceptance": acceptance,
        "slo": {
            "targetS": 300.0,
            "durationS": duration_s,
            "pass": duration_s > 0 and duration_s <= 300.0,
            "cachePermanent": True,
        },
        "primitiveRefit": primitive_refit,
        "candidateComponent": {
            "id": str(candidate.get("id") or f"cmp_photoscan_{cache.split(':')[-1]}"),
            "source": "photoscan",
            "confidence": confidence,
            "reviewRequired": bool(candidate.get("reviewRequired", True)),
            "ownerReviewFlags": candidate.get("ownerReviewFlags", _review_flags(payload, acceptance)),
            "dfmState": str(candidate.get("dfmState", "candidate")),
            "review": str(candidate.get("review", "photoscan candidate requires owner port/scale review")),
        },
    }
    return result


def _external_acceptance(external: dict[str, Any], *, confidence: float, multiview: bool) -> dict[str, Any]:
    raw = external.get("acceptance") if isinstance(external.get("acceptance"), dict) else {}
    fit_coverage = _optional_number(raw.get("fitCoveragePct", external.get("fitCoveragePct")))
    hausdorff = _optional_number(raw.get("hausdorffPct", external.get("hausdorffPct")))
    scale_error = _optional_number(raw.get("scaleErrorPct", external.get("scaleErrorPct")))
    axis_error = _optional_number(raw.get("axisErrorDeg", external.get("axisErrorDeg")))
    reasons: list[str] = []
    if fit_coverage is None:
        reasons.append("D13 fit coverage missing")
    elif fit_coverage < 70.0:
        reasons.append(f"D13 fit coverage {fit_coverage:.2f}% < 70.00%")
    if hausdorff is None:
        reasons.append("D13 Hausdorff metric missing")
    elif hausdorff > 1.5:
        reasons.append(f"D13 Hausdorff {hausdorff:.2f}% > 1.50%")
    if confidence < 0.65:
        reasons.append(f"confidence {confidence:.2f} < 0.65")
    provider_pass = bool(raw.get("pass", external.get("accepted", True)))
    if not provider_pass:
        reasons.append("provider marked scan rejected")
    return {
        "gate": "D13",
        "pass": not reasons,
        "fitCoveragePct": fit_coverage,
        "hausdorffPct": hausdorff,
        "scaleErrorPct": scale_error,
        "axisErrorDeg": axis_error,
        "meshClassFallback": bool(raw.get("meshClassFallback", len(reasons) > 0)),
        "rejectReasons": reasons,
        "path": "colmap" if multiview else "trellis",
    }


def _external_pipeline(external: dict[str, Any], images: list[str], *, cache_key: str, provider: str, multiview: bool) -> list[dict[str, Any]]:
    pipeline = external.get("pipeline")
    if isinstance(pipeline, list) and all(isinstance(stage, dict) for stage in pipeline):
        return pipeline
    return [
        {"stage": "background-removal", "provider": provider, "sources": len(images), "cacheKey": f"{cache_key}/mask"},
        {"stage": "reconstruction", "provider": provider, "sources": len(images), "cacheKey": f"{cache_key}/raw-mesh"},
        {"stage": "manifold-repair", "provider": provider, "watertight": bool(external.get("watertight", True)), "cacheKey": f"{cache_key}/manifold"},
        {"stage": "decimation", "provider": provider, "targetFaces": int(external.get("targetFaces", 4800 if multiview else 3200)), "cacheKey": f"{cache_key}/lod0"},
        {"stage": "primitive-refit", "provider": provider, "cacheKey": f"{cache_key}/refit"},
    ]


def _external_colmap(external: dict[str, Any], images: list[str]) -> dict[str, Any]:
    colmap = external.get("colmap")
    if isinstance(colmap, dict):
        return colmap
    return {
        **_colmap(images),
        "sparsePointCount": int(external.get("sparsePointCount", 1200 + 180 * len(images))),
        "densePointCount": int(external.get("densePointCount", 24_000 + 2_400 * len(images))),
    }


def _pipeline(images: list[str], *, multiview: bool, cache_key: str) -> list[dict[str, Any]]:
    source_count = len(images)
    return [
        {"stage": "background-removal", "provider": "fixture-rembg", "sources": source_count, "cacheKey": f"{cache_key}/mask"},
        {
            "stage": "reconstruction",
            "provider": "fixture-colmap" if multiview else "fixture-trellis",
            "sources": source_count,
            "cacheKey": f"{cache_key}/raw-mesh",
        },
        {"stage": "manifold-repair", "provider": "fixture-meshfix", "watertight": True, "cacheKey": f"{cache_key}/manifold"},
        {"stage": "decimation", "provider": "fixture-quadric", "targetFaces": 4800 if multiview else 3200, "cacheKey": f"{cache_key}/lod0"},
        {"stage": "primitive-refit", "provider": "fixture-d13", "cacheKey": f"{cache_key}/refit"},
    ]


def _colmap(images: list[str]) -> dict[str, Any]:
    pairs = max(1, len(images) * (len(images) - 1) // 2)
    return {
        "viewCount": len(images),
        "matchedPairs": pairs,
        "sparsePointCount": 1200 + 180 * len(images),
        "densePointCount": 24_000 + 2_400 * len(images),
        "cameraPoses": [
            {"image": image, "xyz": [round(index * 0.08, 3), round((index % 2) * 0.04, 3), 0.3], "quality": "registered"}
            for index, image in enumerate(images)
        ],
    }


def _acceptance(confidence: float, *, multiview: bool) -> dict[str, Any]:
    fit_coverage = 76.0 if multiview else 71.5
    hausdorff = 1.18 if multiview else 1.42
    return {
        "gate": "D13",
        "pass": confidence >= 0.65 and fit_coverage >= 70.0 and hausdorff <= 1.5,
        "fitCoveragePct": fit_coverage,
        "hausdorffPct": hausdorff,
        "scaleErrorPct": 1.4 if multiview else 2.6,
        "axisErrorDeg": 1.8 if multiview else 3.2,
        "meshClassFallback": False,
    }


def _known_dimension_mm(scale: Any) -> float | None:
    if isinstance(scale, dict):
        value = scale.get("mm") or scale.get("knownDimensionMm")
        return float(value) if isinstance(value, (int, float)) else None
    return float(scale) if isinstance(scale, (int, float)) else None


def _optional_number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _number(value: Any, default: float) -> float:
    maybe = _optional_number(value)
    return maybe if maybe is not None else default


def _review_flags(payload: dict[str, Any], acceptance: dict[str, Any]) -> list[str]:
    flags = ["confirm-scale", "confirm-ports"]
    if not payload.get("axes"):
        flags.append("snap-axis")
    if not acceptance.get("pass"):
        flags.append("d13-refit-review")
    return flags


@registry.register("photoscan.single")
def handle_single(job: Job) -> dict[str, Any]:
    return run_photoscan(job.payload, multiview=False)


@registry.register("photoscan.multiview")
def handle_multiview(job: Job) -> dict[str, Any]:
    return run_photoscan(job.payload, multiview=True)
