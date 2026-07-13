from forge_workers.geometry import tessellate


def open_license():
    return {
        "id": "lic_owner_open",
        "class": "open",
        "terms": "owner-authorized manufacturing export",
        "sourceUrl": "https://example.com/licenses/owner-open",
        "exportPolicy": "full-geometry-ok",
    }


def test_tessellate_emits_print_quote_handoff_artifacts():
    result = tessellate({"assetRef": "obj://frame.step", "license": open_license()})

    assert result["exports"]["threeMf"].endswith("/print.3mf")
    assert result["dfm"]["artifactId"].endswith("/dfm-report.json")
    assert result["print"]["readyForQuote"]
    assert result["print"]["handoff"] == {"mode": "quote-link", "directCheckout": False}
    assert result["print"]["threeMfArtifact"]["objectKey"] == result["exports"]["threeMf"]
    assert result["print"]["threeMfArtifact"]["dfmReport"] == result["dfm"]["artifactId"]
    assert result["print"]["threeMfArtifact"]["licenseManifest"] == result["exports"]["licenseManifest"]
    assert result["print"]["bomSection"] == [
        {
            "kind": "printed-part",
            "source": "obj://frame.step",
            "quantity": 1,
            "process": "fdm",
            "material": "pla",
            "profileId": "fdm:pla:0.20mm:35pct",
            "dfmArtifactId": result["dfm"]["artifactId"],
            "threeMfObjectKey": result["exports"]["threeMf"],
            "licenseManifest": result["exports"]["licenseManifest"],
        }
    ]


def test_tessellate_carries_custom_print_profile_and_orientation():
    result = tessellate(
        {
            "sourceObjectId": "obj://arm.step",
            "process": "FDM",
            "material": "PETG-CF",
            "quantity": "4",
            "layerHeightMm": "0.16",
            "nozzleMm": 0.6,
            "infillPct": 120,
            "orientation": {"up": [0, 0, 1], "supportVolumeCm3": "3.4"},
            "license": open_license(),
        }
    )

    profile = result["print"]["threeMfArtifact"]["profile"]
    assert profile == {
        "id": "fdm:petg-cf:0.16mm:100pct",
        "process": "fdm",
        "material": "petg-cf",
        "layerHeightMm": 0.16,
        "nozzleMm": 0.6,
        "infillPct": 100.0,
    }
    assert result["dfm"]["orientation"] == {"up": [0, 0, 1], "supportVolumeCm3": 3.4}
    assert result["print"]["bomSection"][0]["quantity"] == 4
