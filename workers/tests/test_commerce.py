import json
import sys

import pytest

from forge_workers.commerce import refresh_vendor_offers, request_print_quote


def _command(tmp_path, payload):
    script = tmp_path / "commerce_cmd.py"
    output = json.dumps(payload)
    script.write_text(
        "import json, sys\n"
        "json.loads(sys.stdin.read())\n"
        f"print({output!r})\n"
    )
    return f"{sys.executable} {script}"


def test_vendor_refresh_normalizes_external_offer_with_provenance(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_VENDOR_REFRESH_CMD",
        _command(
            tmp_path,
            {
                "provider": "live-vendor",
                "rateLimit": {"requestsPerMinute": 12, "cacheTtlS": 900},
                "offers": [
                    {
                        "componentId": "cmp_motor",
                        "vendor": "Example Parts",
                        "sku": "MTR-1",
                        "url": "https://vendor.example/mtr-1",
                        "price": "29.95",
                        "currency": "USD",
                        "availability": "in_stock",
                        "source": "live",
                        "provenance": {
                            "sourceUrl": "https://vendor.example/catalog/mtr-1",
                            "retrievedAt": "2026-06-15T10:00:00Z",
                        },
                    }
                ],
            },
        ),
    )

    result = refresh_vendor_offers({"componentId": "cmp_motor", "timeoutS": 5})

    assert result["artifactKind"] == "vendor-offer-refresh"
    assert result["provider"] == "live-vendor"
    assert result["rateLimit"] == {"requestsPerMinute": 12, "cacheTtlS": 900}
    assert result["heldOffers"] == []
    assert result["offers"][0]["price"] == 29.95
    assert result["offers"][0]["availability"] == "in-stock"
    assert result["offers"][0]["provenance"]["sourceUrl"] == "https://vendor.example/catalog/mtr-1"


def test_vendor_refresh_holds_invalid_offer_rows(monkeypatch):
    monkeypatch.delenv("FORGE_VENDOR_REFRESH_CMD", raising=False)

    result = refresh_vendor_offers(
        {
            "componentId": "cmp_motor",
            "offers": [
                {
                    "vendor": "Example Parts",
                    "url": "ftp://vendor.example/mtr-1",
                    "price": -1,
                    "currency": "USD",
                }
            ],
        }
    )

    assert result["offers"] == []
    assert result["heldOffers"][0]["reasons"] == [
        "offer URL must be credential-free public HTTPS",
        "non-negative price missing",
        "provenance sourceUrl must be credential-free public HTTPS",
    ]
    assert "input" not in result["heldOffers"][0]


def test_vendor_refresh_fails_closed_on_oversized_or_nonfinite_provider_truth(monkeypatch):
    monkeypatch.delenv("FORGE_VENDOR_REFRESH_CMD", raising=False)
    with pytest.raises(RuntimeError, match="offer limit"):
        refresh_vendor_offers({"offers": [{}] * 51})

    result = refresh_vendor_offers(
        {
            "offers": [
                {
                    "componentId": "cmp_motor",
                    "vendor": "Example Parts",
                    "url": "https://127.0.0.1/private",
                    "price": "NaN",
                    "currency": "US dollars",
                }
            ],
            "rateLimit": {"requestsPerMinute": 100_000, "cacheTtlS": -1},
        }
    )

    assert result["offers"] == []
    assert result["rateLimit"] == {"requestsPerMinute": 600, "cacheTtlS": 1}
    assert result["heldOffers"][0]["componentId"] == "cmp_motor"
    assert result["heldOffers"][0]["reasons"] == [
        "offer URL must be credential-free public HTTPS",
        "non-negative price missing",
        "provenance sourceUrl must be credential-free public HTTPS",
    ]

    with pytest.raises(RuntimeError, match="timeoutS"):
        refresh_vendor_offers({"timeoutS": "NaN", "offers": []})


def test_print_quote_blocks_without_dfm_and_artifacts(monkeypatch):
    monkeypatch.delenv("FORGE_PRINT_QUOTE_CMD", raising=False)

    result = request_print_quote({"dfm": {"passed": False}, "offers": []})

    assert result["status"] == "blocked"
    assert result["offers"] == []
    assert result["blockers"] == [
        "DfM report must pass before print quote handoff",
        "oriented 3MF artifact missing",
        "print profile artifact missing",
    ]


def test_print_quote_normalizes_external_link_handoff(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_PRINT_QUOTE_CMD",
        _command(
            tmp_path,
            {
                "provider": "live-print",
                "dfmPass": True,
                "artifacts": [
                    {"kind": "oriented-3mf", "id": "obj/arm.3mf"},
                    {"kind": "print-profile", "id": "profile-pa12-cf"},
                ],
                "offers": [
                    {
                        "provider": "Print Provider",
                        "providerQuoteId": "quote-1",
                        "quoteUrl": "https://print.example/quote-1",
                        "price": 18.5,
                        "currency": "USD",
                        "leadTimeDays": 6,
                        "material": "pa12-cf",
                        "terms": {"region": "US"},
                    }
                ],
            },
        ),
    )

    result = request_print_quote({"timeoutS": 5})

    assert result["status"] == "quoted"
    assert result["checkout"] == "off-platform"
    assert result["request"]["artifact3mf"] == "obj/arm.3mf"
    assert result["request"]["printProfile"] == "profile-pa12-cf"
    assert result["offers"][0]["quoteUrl"] == "https://print.example/quote-1"
    assert result["offers"][0]["terms"]["noDirectPayment"]
    assert result["offers"][0]["terms"]["checkout"] == "off-platform"
