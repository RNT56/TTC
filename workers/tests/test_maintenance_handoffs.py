from forge_workers.maintenance import crash_forensics, repair_sheet


def test_crash_forensics_computes_ghost_divergence_for_scrub_window():
    result = crash_forensics(
        {
            "thresholdG": 8,
            "ghostWarnM": 0.5,
            "samples": [
                {"t": 0.0, "accelG": 1, "positionM": [0, 0, 0], "ghostPositionM": [0, 0, 0]},
                {"t": 1.0, "accelG": 2, "positionM": [1, 0, 0], "ghostPositionM": [0.8, 0, 0]},
                {"t": 2.0, "accelG": 9, "positionM": [2, 0, 0], "ghostPositionM": [1.1, 0, 0]},
                {"t": 3.0, "accelG": 3, "positionM": [3, 0, 0], "ghostPositionM": [1.9, 0, 0]},
            ],
        }
    )

    divergence = result["ghostOverlay"]["divergence"]
    assert result["crashDetected"]
    assert result["window"] == {"startS": 0.0, "impactS": 2.0, "endS": 6.0}
    assert result["scrub"]["frameCount"] == 4
    assert divergence["sampleCount"] == 4
    assert divergence["status"] == "diverged"
    assert divergence["maxM"] == 1.1


def test_repair_sheet_attaches_vendor_and_print_handoff_links():
    result = repair_sheet(
        {
            "damagedNodes": ["arm"],
            "vendorSkus": {"motor": "MOTOR-SKU"},
            "vendorOffers": [
                {
                    "sku": "MOTOR-SKU",
                    "provider": "sandbox-vendor",
                    "url": "https://vendor.example/motor",
                    "price": 29.5,
                    "currency": "USD",
                }
            ],
            "printQuotes": [
                {
                    "dfmArtifactId": "dfm-arm-left",
                    "provider": "sandbox-print",
                    "quoteUrl": "https://print.example/quote/arm",
                    "material": "pa12-cf",
                    "price": 18.2,
                    "currency": "USD",
                }
            ],
            "parts": [
                {"node": "arm", "comp": "arm-shell", "dfmArtifactId": "dfm-arm-left", "explode": {"t0": 0.9}},
                {"node": "arm", "comp": "motor", "explode": {"t0": 0.7}},
            ],
        }
    )

    assert result["reorderCount"] == 1
    assert result["handoffCount"] == 2
    assert {link["kind"] for link in result["quoteLinks"]} == {"vendor-offer", "print-quote"}
    assert result["steps"][0]["printQuote"]["url"] == "https://print.example/quote/arm"
    assert result["steps"][0]["quoteReady"]
    assert result["steps"][1]["vendorOffer"]["url"] == "https://vendor.example/motor"
    assert result["steps"][1]["quoteReady"]


def test_repair_sheet_keeps_steps_actionable_without_quote_links():
    result = repair_sheet(
        {
            "damagedNodes": ["arm"],
            "parts": [{"node": "arm", "comp": "arm-shell", "explode": {"t0": 0.5}}],
        }
    )

    assert result["handoffCount"] == 0
    assert result["quoteLinks"] == []
    assert result["steps"][0]["handoffLinks"] == []
    assert not result["steps"][0]["quoteReady"]
