import pytest

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
    assert result["window"] == {"startS": 0.0, "impactS": 2.0, "endS": 3.0}
    assert result["scrub"]["frameCount"] == 4
    assert divergence["sampleCount"] == 4
    assert divergence["status"] == "diverged"
    assert divergence["maxM"] == 1.1
    assert result["ghostOverlay"]["schemaVersion"] == "forge-ghost-overlay/1.0.0"
    assert result["ghostOverlay"]["frame"] == "forge-y-up-rh-m"
    assert result["ghostOverlay"]["sourceMaturity"] == "unverified"
    assert result["ghostOverlay"]["renderPointCount"] == 4
    assert result["ghostOverlay"]["recordedDeviceVerified"] is False
    assert result["ghostOverlay"]["fieldSessionVerified"] is False


def test_crash_forensics_decimates_and_indexes_a_ten_minute_si_trace():
    samples = []
    for index in range(36_001):
        time_s = index / 60.0
        actual_x = time_s / 100.0
        actual_z = (index % 600) / 600.0
        divergence_m = 0.02 + max(0.0, time_s - 480.0) * 0.008
        samples.append(
            {
                "t": time_s,
                "accelG": 12.0 if index == 32_400 else 1.0,
                "positionM": [actual_x, 1.0, actual_z],
                "ghostPositionM": [actual_x - divergence_m, 1.0, actual_z],
            }
        )

    result = crash_forensics(
        {
            "samples": samples,
            "thresholdG": 10.0,
            "ghostWarnM": 0.35,
            "preS": 3.0,
            "postS": 3.0,
        }
    )

    overlay = result["ghostOverlay"]
    assert result["window"] == {"startS": 537.0, "impactS": 540.0, "endS": 543.0}
    assert overlay["enabled"] is True
    assert overlay["sourceSampleCount"] == 36_001
    assert overlay["sourceSampleRateHz"] == 60.0
    assert overlay["durationS"] == 600.0
    assert overlay["renderPointCount"] == 6_001
    assert overlay["renderRateHz"] == 10.0
    assert overlay["maxRenderPointCount"] == 6_001
    assert len(overlay["seekIndex"]) == 601
    assert overlay["seekIndex"][540] == [540.0, 5_400]
    assert overlay["points"][5_400][0] == 540.0
    assert overlay["points"][-1][0] == 600.0
    assert overlay["divergence"]["status"] == "diverged"


def test_crash_forensics_disables_incomplete_overlay_and_refuses_time_drift():
    incomplete = crash_forensics(
        {
            "samples": [
                {"t": 0.0, "accelG": 1.0, "positionM": [0, 0, 0], "ghostPositionM": [0, 0, 0]},
                {"t": 1.0, "accelG": 1.0},
            ]
        }
    )
    assert incomplete["crashDetected"] is False
    assert incomplete["ghostOverlay"]["enabled"] is False
    assert incomplete["ghostOverlay"]["points"] == []
    assert incomplete["ghostOverlay"]["disabledReason"] == "complete position pairs are required"

    with pytest.raises(ValueError, match="strictly increasing"):
        crash_forensics({"samples": [{"t": 1.0}, {"t": 1.0}]})
    with pytest.raises(ValueError, match="out of range"):
        crash_forensics({"samples": [{"t": 0.0}, {"t": float("nan")}]})
    with pytest.raises(ValueError, match="duration exceeds 600 seconds"):
        crash_forensics({"samples": [{"t": 0.0}, {"t": 600.01}]})


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
