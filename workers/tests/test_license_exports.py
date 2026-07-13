import json
import sys

import pytest

from forge_workers.contract import LICENSE_EXPORT_MANIFEST_FORMAT_VERSION
from forge_workers.geometry import tessellate
from forge_workers.license_exports import build_license_export_manifest, manifest_sha256


def license_record(license_class: str, export_policy: str) -> dict:
    return {
        "id": f"lic_{license_class}",
        "class": license_class,
        "terms": f"fixture terms for {license_class}",
        "sourceUrl": f"https://example.com/licenses/{license_class}",
        "exportPolicy": export_policy,
    }


def restricted_payload() -> dict:
    return {
        "assetRef": "obj://restricted-motor.step",
        "componentId": "cmp_restricted_motor",
        "license": license_record("no-redistribution", "envelope-link-out"),
        "envelopeMm": {"xMm": 28, "yMm": 34, "zMm": 28},
        "datumPorts": [
            {
                "id": "mount",
                "type": "motor-mount-16x16-M3",
                "frame": [[0, 0, 0], [0, 0, 0]],
            }
        ],
    }


def test_attribution_export_embeds_versioned_manifest_reference():
    result = tessellate(
        {
            "assetRef": "obj://attributed-frame.step",
            "license": license_record("attribution", "attribution-manifest-required"),
        }
    )

    manifest = result["licenseExport"]
    assert manifest["schemaVersion"] == LICENSE_EXPORT_MANIFEST_FORMAT_VERSION
    assert manifest["assemblyPolicy"] == "attribution-manifest-required"
    assert manifest["fullGeometryAllowed"]
    assert manifest["attributions"] == [
        {
            "assetId": "obj://attributed-frame.step",
            "componentId": None,
            "licenseId": "lic_attribution",
            "licenseClass": "attribution",
            "terms": "fixture terms for attribution",
            "sourceUrl": "https://example.com/licenses/attribution",
        }
    ]
    assert result["exports"]["step"].endswith("/source.step")
    assert result["exports"]["threeMf"].endswith("/print.3mf")
    assert result["exports"]["licenseManifest"].endswith("/license-export-manifest.json")
    assert result["licenseExportManifestSha256"] == manifest_sha256(manifest)


def test_restricted_geometry_becomes_envelope_link_out_and_cannot_quote():
    result = tessellate(restricted_payload())

    manifest = result["licenseExport"]
    asset = manifest["assets"][0]
    assert manifest["assemblyPolicy"] == "envelope-substitution"
    assert not manifest["fullGeometryAllowed"]
    assert asset["exportDisposition"] == "dimensioned-envelope-link-out"
    assert asset["envelopeMm"] == {"xMm": 28.0, "yMm": 34.0, "zMm": 28.0}
    assert result["exports"]["mesh"].endswith("/derived-lod.glb")
    assert result["exports"]["step"].endswith("/envelope.step")
    assert result["exports"]["threeMf"].endswith("/envelope.3mf")
    assert "source.step" not in json.dumps(result)
    assert not result["print"]["readyForQuote"]
    assert "threeMfArtifact" not in result["print"]
    assert result["print"]["bomSection"] == [
        {
            "kind": "catalog-part",
            "assetId": "obj://restricted-motor.step",
            "componentId": "cmp_restricted_motor",
            "quantity": 1,
            "geometryDisposition": "dimensioned-envelope-link-out",
            "sourceUrl": "https://example.com/licenses/no-redistribution",
            "licenseClass": "no-redistribution",
        }
    ]


def test_mixed_assembly_derives_most_restrictive_policy():
    payload = restricted_payload()
    payload["assemblyAssets"] = [
        {
            "assetId": "obj://open-arm.step",
            "license": license_record("open", "full-geometry-ok"),
            "quantity": 4,
        },
        {
            "assetId": "obj://restricted-motor.step",
            "componentId": "cmp_restricted_motor",
            "license": license_record("view-only", "envelope-only"),
            "envelopeMm": {"widthMm": 28, "heightMm": 34, "lengthMm": 28},
            "datumPorts": [
                {
                    "id": "shaft",
                    "type": "prop-shaft-M5",
                    "frame": [[0, 17, 0], [0, 0, 0]],
                }
            ],
        },
    ]

    manifest = build_license_export_manifest(payload, "obj://assembly")
    assert manifest["assemblyPolicy"] == "envelope-substitution"
    assert manifest["restrictedAssetCount"] == 1
    assert manifest["assets"][0]["exportDisposition"] == "full-geometry"
    assert manifest["assets"][1]["exportDisposition"] == "dimensioned-envelope-link-out"


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda payload: payload.pop("license"), "requires a D10 license record"),
        (
            lambda payload: payload["license"].update({"exportPolicy": "full-geometry-ok"}),
            "contradicts license class",
        ),
        (lambda payload: payload.pop("envelopeMm"), "requires envelopeMm"),
        (lambda payload: payload.update({"datumPorts": []}), "requires at least one datum port"),
        (
            lambda payload: payload["license"].update({"sourceUrl": "javascript:alert(1)"}),
            "must be an HTTPS URL",
        ),
    ],
)
def test_restricted_exports_fail_closed_on_missing_or_contradictory_evidence(mutate, message):
    payload = restricted_payload()
    mutate(payload)
    with pytest.raises(ValueError, match=message):
        tessellate(payload)


def test_external_provider_cannot_smuggle_raw_restricted_geometry(monkeypatch, tmp_path):
    script = tmp_path / "adversarial_occt.py"
    script.write_text(
        "import json, sys\n"
        "request = json.load(sys.stdin)\n"
        "print(json.dumps({\n"
        "  'artifactKind': 'geometry',\n"
        "  'secretMeshData': 'raw restricted vertices',\n"
        "  'downloadUrl': 'https://attacker.example/raw.step',\n"
        "  'exports': {'step': 'raw.step', 'threeMf': 'raw.3mf'},\n"
        "  'envelopeExports': {\n"
        "    'mesh': 'raw-restricted.glb',\n"
        "    'derivedLod': 'safe/derived-lod.glb',\n"
        "    'step': 'safe/envelope.step',\n"
        "    'threeMf': 'safe/envelope.3mf'\n"
        "  },\n"
        "  'licenseProof': {\n"
        "    'manifestSha256': request['licenseExportManifestSha256'],\n"
        "    'restrictedGeometryExcluded': True\n"
        "  },\n"
        "  'dfm': {'pass': True, 'artifactId': 'safe/dfm.json'}\n"
        "}))\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("FORGE_OCCT_TESSELLATE_CMD", f"{sys.executable} {script}")

    result = tessellate(restricted_payload())

    assert result["provider"] == "external-occt"
    assert result["exports"]["step"] == "safe/envelope.step"
    assert result["exports"]["threeMf"] == "safe/envelope.3mf"
    assert result["exports"]["mesh"] == "safe/derived-lod.glb"
    assert "secretMeshData" not in result
    assert "downloadUrl" not in result
    assert "raw.step" not in json.dumps(result)
    assert "raw-restricted.glb" not in json.dumps(result)


def test_external_attribution_export_fails_without_embedded_proof(monkeypatch, tmp_path):
    script = tmp_path / "bad_attribution_occt.py"
    script.write_text(
        "import json, sys\n"
        "request = json.load(sys.stdin)\n"
        "print(json.dumps({\n"
        "  'exports': {'step': 'full.step', 'threeMf': 'full.3mf'},\n"
        "  'licenseProof': {'manifestSha256': request['licenseExportManifestSha256']}\n"
        "}))\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("FORGE_OCCT_TESSELLATE_CMD", f"{sys.executable} {script}")

    with pytest.raises(ValueError, match="did not embed required attribution"):
        tessellate(
            {
                "assetRef": "obj://attributed.step",
                "license": license_record("attribution", "attribution-manifest-required"),
            }
        )
