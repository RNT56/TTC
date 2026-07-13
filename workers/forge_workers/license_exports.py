"""D10 license-aware manufacturing export policy.

This module is the authority between geometry providers and persisted/downloaded
artifacts. Provider output is untrusted: callers derive the policy before invoking
the provider, pass the manifest hash into the request, and only retain allowlisted
artifact references after the provider proves that it applied the same policy.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any
from urllib.parse import urlparse

from forge_workers.contract import LICENSE_EXPORT_MANIFEST_FORMAT_VERSION

LICENSE_CLASSES = {"open", "attribution", "no-redistribution", "view-only"}
FULL_GEOMETRY_CLASSES = {"open", "attribution"}
EXPECTED_EXPORT_POLICIES = {
    "open": {"full-geometry-ok"},
    "attribution": {"attribution-manifest-required"},
    "no-redistribution": {"envelope-link-out", "envelope-only"},
    "view-only": {"envelope-link-out", "envelope-only"},
}


def build_license_export_manifest(
    payload: dict[str, Any], source: str
) -> dict[str, Any]:
    """Validate asset licenses and derive one assembly policy."""

    raw_assets = payload.get("assemblyAssets")
    if raw_assets is None:
        raw_assets = [
            {
                "assetId": source,
                "componentId": payload.get("componentId"),
                "license": payload.get("license"),
                "envelopeMm": payload.get("envelopeMm"),
                "datumPorts": payload.get("datumPorts"),
            }
        ]
    if not isinstance(raw_assets, list) or not raw_assets:
        raise ValueError("D10 export requires at least one assembly asset")

    assets = [_normalize_asset(asset, index) for index, asset in enumerate(raw_assets)]
    restricted = [asset for asset in assets if not asset["fullGeometryAllowed"]]
    attributed = [asset for asset in assets if asset["licenseClass"] == "attribution"]
    if restricted:
        assembly_policy = "envelope-substitution"
    elif attributed:
        assembly_policy = "attribution-manifest-required"
    else:
        assembly_policy = "full-geometry-ok"

    attributions = [
        {
            "assetId": asset["assetId"],
            "componentId": asset.get("componentId"),
            "licenseId": asset["licenseId"],
            "licenseClass": asset["licenseClass"],
            "terms": asset["terms"],
            "sourceUrl": asset["sourceUrl"],
        }
        for asset in assets
        if asset["licenseClass"] == "attribution"
    ]
    return {
        "schemaVersion": LICENSE_EXPORT_MANIFEST_FORMAT_VERSION,
        "artifactKind": "license-export-manifest",
        "source": source,
        "assemblyPolicy": assembly_policy,
        "fullGeometryAllowed": not restricted,
        "requiresAttribution": bool(attributed),
        "restrictedAssetCount": len(restricted),
        "attributionAssetCount": len(attributed),
        "assets": assets,
        "attributions": attributions,
    }


def manifest_sha256(manifest: dict[str, Any]) -> str:
    encoded = json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def filter_export_references(
    manifest: dict[str, Any],
    cache_key: str,
    external: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Return only policy-safe artifact references.

    Fixture references are deterministic contract evidence. Live output must carry a
    proof bound to the manifest hash; arbitrary provider fields never pass through.
    """

    restricted = not bool(manifest["fullGeometryAllowed"])
    if external is None:
        references = (
            {
                "mesh": f"{cache_key}/derived-lod.glb",
                "step": f"{cache_key}/envelope.step",
                "threeMf": f"{cache_key}/envelope.3mf",
            }
            if restricted
            else {
                "mesh": f"{cache_key}/mesh.glb",
                "step": f"{cache_key}/source.step",
                "threeMf": f"{cache_key}/print.3mf",
            }
        )
    else:
        _verify_external_proof(manifest, external)
        field = "envelopeExports" if restricted else "exports"
        raw_references = external.get(field)
        if not isinstance(raw_references, dict):
            raise ValueError(f"external OCCT output requires {field}")
        references = _allowlisted_references(raw_references, restricted=restricted)
        for required in ("step", "threeMf"):
            if required not in references:
                raise ValueError(f"external OCCT {field} requires {required}")

    references["licenseManifest"] = f"{cache_key}/license-export-manifest.json"
    return references


def restricted_bom_rows(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    """BOM link-outs for assets whose geometry cannot be redistributed."""

    return [
        {
            "kind": "catalog-part",
            "assetId": asset["assetId"],
            "componentId": asset["componentId"],
            "quantity": asset["quantity"],
            "geometryDisposition": "dimensioned-envelope-link-out",
            "sourceUrl": asset["sourceUrl"],
            "licenseClass": asset["licenseClass"],
        }
        for asset in manifest["assets"]
        if not asset["fullGeometryAllowed"]
    ]


def _normalize_asset(raw: Any, index: int) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError(f"assemblyAssets[{index}] must be an object")
    asset_id = _required_string(raw.get("assetId"), f"assemblyAssets[{index}].assetId")
    license_record = raw.get("license")
    if not isinstance(license_record, dict):
        raise ValueError(f"assemblyAssets[{index}] requires a D10 license record")

    license_id = _required_string(license_record.get("id"), f"{asset_id} license.id")
    license_class = _required_string(license_record.get("class"), f"{asset_id} license.class")
    if license_class not in LICENSE_CLASSES:
        raise ValueError(f"{asset_id} has unsupported license class '{license_class}'")
    terms = _required_string(license_record.get("terms"), f"{asset_id} license.terms")
    source_url = _https_url(license_record.get("sourceUrl"), f"{asset_id} license.sourceUrl")
    export_policy = _required_string(
        license_record.get("exportPolicy"), f"{asset_id} license.exportPolicy"
    )
    if export_policy not in EXPECTED_EXPORT_POLICIES[license_class]:
        raise ValueError(
            f"{asset_id} export policy '{export_policy}' contradicts license class '{license_class}'"
        )

    full_geometry = license_class in FULL_GEOMETRY_CLASSES
    component_id = _optional_string(raw.get("componentId"))
    envelope = None
    datum_ports: list[dict[str, Any]] = []
    if not full_geometry:
        if component_id is None:
            raise ValueError(f"restricted asset {asset_id} requires componentId for BOM link-out")
        envelope = _envelope(raw.get("envelopeMm"), asset_id)
        datum_ports = _datum_ports(raw.get("datumPorts"), asset_id)

    quantity = raw.get("quantity", 1)
    if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
        raise ValueError(f"{asset_id} quantity must be a positive integer")
    disposition = (
        "full-geometry-with-attribution"
        if license_class == "attribution"
        else "full-geometry"
        if full_geometry
        else "dimensioned-envelope-link-out"
    )
    normalized = {
        "assetId": asset_id,
        "componentId": component_id,
        "quantity": quantity,
        "licenseId": license_id,
        "licenseClass": license_class,
        "terms": terms,
        "sourceUrl": source_url,
        "exportPolicy": export_policy,
        "exportDisposition": disposition,
        "fullGeometryAllowed": full_geometry,
    }
    if envelope is not None:
        normalized["envelopeMm"] = envelope
        normalized["datumPorts"] = datum_ports
    return normalized


def _envelope(raw: Any, asset_id: str) -> dict[str, float]:
    if not isinstance(raw, dict):
        raise ValueError(f"restricted asset {asset_id} requires envelopeMm")
    aliases = {
        "xMm": ("xMm", "widthMm"),
        "yMm": ("yMm", "heightMm"),
        "zMm": ("zMm", "depthMm", "lengthMm"),
    }
    envelope: dict[str, float] = {}
    for canonical, candidates in aliases.items():
        value = next((raw.get(candidate) for candidate in candidates if candidate in raw), None)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"restricted asset {asset_id} requires numeric envelopeMm.{canonical}")
        number = float(value)
        if not math.isfinite(number) or number <= 0:
            raise ValueError(f"restricted asset {asset_id} envelopeMm.{canonical} must be positive")
        envelope[canonical] = number
    return envelope


def _datum_ports(raw: Any, asset_id: str) -> list[dict[str, Any]]:
    if not isinstance(raw, list) or not raw:
        raise ValueError(f"restricted asset {asset_id} requires at least one datum port")
    ports: list[dict[str, Any]] = []
    for index, port in enumerate(raw):
        if not isinstance(port, dict):
            raise ValueError(f"{asset_id} datumPorts[{index}] must be an object")
        port_id = _required_string(port.get("id"), f"{asset_id} datumPorts[{index}].id")
        kind = _required_string(port.get("type"), f"{asset_id} datumPorts[{index}].type")
        frame = port.get("frame")
        if (
            not isinstance(frame, list)
            or len(frame) != 2
            or any(not isinstance(vector, list) or len(vector) != 3 for vector in frame)
        ):
            raise ValueError(f"{asset_id} datumPorts[{index}].frame must be two 3-vectors")
        clean_frame: list[list[float]] = []
        for vector in frame:
            clean_vector: list[float] = []
            for value in vector:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise ValueError(f"{asset_id} datumPorts[{index}].frame must be finite")
                number = float(value)
                if not math.isfinite(number):
                    raise ValueError(f"{asset_id} datumPorts[{index}].frame must be finite")
                clean_vector.append(number)
            clean_frame.append(clean_vector)
        ports.append({"id": port_id, "type": kind, "frame": clean_frame})
    return ports


def _verify_external_proof(manifest: dict[str, Any], external: dict[str, Any]) -> None:
    proof = external.get("licenseProof")
    if not isinstance(proof, dict):
        raise ValueError("external OCCT output requires licenseProof")
    expected_hash = manifest_sha256(manifest)
    if proof.get("manifestSha256") != expected_hash:
        raise ValueError("external OCCT licenseProof does not match the requested manifest")
    if manifest["requiresAttribution"] and proof.get("attributionEmbedded") is not True:
        raise ValueError("external OCCT output did not embed required attribution")
    if not manifest["fullGeometryAllowed"] and proof.get("restrictedGeometryExcluded") is not True:
        raise ValueError("external OCCT output did not prove restricted geometry exclusion")


def _allowlisted_references(raw: dict[str, Any], *, restricted: bool) -> dict[str, str]:
    references: dict[str, str] = {}
    keys = ("step", "threeMf", "derivedLod") if restricted else ("mesh", "step", "threeMf", "stl")
    for key in keys:
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            references["mesh" if key == "derivedLod" else key] = value.strip()
    return references


def _required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    return _required_string(value, "componentId")


def _https_url(value: Any, field: str) -> str:
    url = _required_string(value, field)
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError(f"{field} must be an HTTPS URL without credentials")
    return url


def copy_allowlisted_geometry_metadata(external: dict[str, Any]) -> dict[str, Any]:
    """Drop unknown provider fields that could smuggle geometry or URLs."""

    metadata: dict[str, Any] = {}
    for key in ("faces", "vertices"):
        value = external.get(key)
        if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
            metadata[key] = value

    lods = external.get("lods")
    if isinstance(lods, list):
        clean_lods = []
        for lod in lods:
            if not isinstance(lod, dict):
                continue
            name = lod.get("name")
            faces = lod.get("faces")
            if (
                isinstance(name, str)
                and name.strip()
                and isinstance(faces, int)
                and not isinstance(faces, bool)
                and faces >= 0
            ):
                clean_lods.append({"name": name.strip(), "faces": faces})
        metadata["lods"] = clean_lods

    collider = external.get("collider")
    if isinstance(collider, dict):
        primitive_count = collider.get("primitiveCount")
        overflow = collider.get("overflowNodes")
        metadata["collider"] = {
            "kind": collider.get("kind") if isinstance(collider.get("kind"), str) else "unknown",
            "primitiveCount": primitive_count
            if isinstance(primitive_count, int) and not isinstance(primitive_count, bool) and primitive_count >= 0
            else 0,
            "overflowNodes": [item for item in overflow if isinstance(item, str)]
            if isinstance(overflow, list)
            else [],
        }

    dfm = external.get("dfm")
    if isinstance(dfm, dict):
        clean_dfm: dict[str, Any] = {
            "pass": dfm.get("pass") is True,
            "notes": [item for item in dfm.get("notes", []) if isinstance(item, str)]
            if isinstance(dfm.get("notes"), list)
            else [],
        }
        for key in ("process", "artifactId"):
            if isinstance(dfm.get(key), str) and dfm[key].strip():
                clean_dfm[key] = dfm[key].strip()
        orientation = dfm.get("orientation")
        if isinstance(orientation, dict):
            up = orientation.get("up")
            support = orientation.get("supportVolumeCm3")
            if (
                isinstance(up, list)
                and len(up) == 3
                and all(isinstance(item, (int, float)) and not isinstance(item, bool) and math.isfinite(item) for item in up)
            ):
                clean_dfm["orientation"] = {
                    "up": [float(item) for item in up],
                    "supportVolumeCm3": float(support)
                    if isinstance(support, (int, float))
                    and not isinstance(support, bool)
                    and math.isfinite(support)
                    and support >= 0
                    else 0.0,
                }
        metadata["dfm"] = clean_dfm
    return metadata
