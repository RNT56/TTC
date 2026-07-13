"""Geometry workers (P5/P6).

CI uses the deterministic fixture path. Deployments can set
`FORGE_OCCT_TESSELLATE_CMD` to replace it with a live OCCT stack while preserving
the same task and artifact contract.
"""

from __future__ import annotations

from typing import Any

from forge_workers.external import run_json_command
from forge_workers.license_exports import (
    build_license_export_manifest,
    copy_allowlisted_geometry_metadata,
    filter_export_references,
    manifest_sha256,
    restricted_bom_rows,
)
from forge_workers.modal_adapter import cache_key
from forge_workers.queue import Job, registry


def tessellate(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("sourceObjectId") or payload.get("assetRef")
    if not source:
        raise ValueError("occt.tessellate requires sourceObjectId or assetRef")
    key = cache_key("occt.tessellate", payload)
    license_manifest = build_license_export_manifest(payload, str(source))
    license_manifest_sha256 = manifest_sha256(license_manifest)
    external = run_json_command(
        "FORGE_OCCT_TESSELLATE_CMD",
        {
            "task": "occt.tessellate",
            **payload,
            "source": source,
            "licenseExportManifest": license_manifest,
            "licenseExportManifestSha256": license_manifest_sha256,
        },
        timeout_s=float(payload.get("timeoutS", 1800)),
    )
    if external is not None:
        result = {
            "artifactKind": "geometry",
            "source": source,
            "cacheKey": key,
            "provider": "external-occt",
            **copy_allowlisted_geometry_metadata(external),
            "exports": filter_export_references(license_manifest, key, external),
            "licenseExport": license_manifest,
            "licenseExportManifestSha256": license_manifest_sha256,
        }
        result["print"] = _print_handoff(
            payload,
            source,
            result["exports"],
            license_manifest,
            result.get("dfm"),
        )
        return result
    orientation = _orientation(payload)
    profile = _print_profile(payload)
    dfm_artifact_id = f"{key}/dfm-report.json"
    exports = filter_export_references(license_manifest, key)
    dfm = {
        "process": payload.get("process", "fdm"),
        "pass": True,
        "orientation": orientation,
        "artifactId": dfm_artifact_id,
        "notes": [],
    }
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
        "dfm": dfm,
        "exports": exports,
        "licenseExport": license_manifest,
        "licenseExportManifestSha256": license_manifest_sha256,
        "print": _print_handoff(payload, source, exports, license_manifest, dfm),
        "fixture": True,
    }


def _print_handoff(
    payload: dict[str, Any],
    source: Any,
    exports: dict[str, str],
    license_manifest: dict[str, Any],
    dfm: Any,
) -> dict[str, Any]:
    if not license_manifest["fullGeometryAllowed"]:
        return {
            "readyForQuote": False,
            "handoff": {
                "mode": "source-link",
                "directCheckout": False,
                "reason": "restricted geometry is replaced by a fit envelope and cannot be printed",
            },
            "bomSection": restricted_bom_rows(license_manifest),
        }

    orientation = _orientation(payload)
    profile = _print_profile(payload)
    dfm_record = dfm if isinstance(dfm, dict) else {}
    dfm_artifact_id = dfm_record.get("artifactId")
    dfm_pass = dfm_record.get("pass") is True
    three_mf_key = exports.get("threeMf")
    ready = dfm_pass and isinstance(three_mf_key, str) and bool(three_mf_key)
    return {
        "readyForQuote": ready,
        "handoff": {"mode": "quote-link", "directCheckout": False},
        "threeMfArtifact": {
            "objectKey": three_mf_key,
            "orientation": orientation,
            "profile": profile,
            "dfmReport": dfm_artifact_id,
            "licenseManifest": exports["licenseManifest"],
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
                "licenseManifest": exports["licenseManifest"],
            }
        ],
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
