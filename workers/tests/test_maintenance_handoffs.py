from forge_workers.maintenance import repair_sheet


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
