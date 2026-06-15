"""Commerce handoff normalizers for P11 vendor and print integrations.

These helpers keep provider-specific vendor refresh and print quote responses in a
single shape before gateway routes persist them. They intentionally produce quote
links only: ForgedTTC does not create carts, take payment, or model seller payouts
in the usage-beta slice.
"""

from __future__ import annotations

from typing import Any

from forge_workers.external import run_json_command


DEFAULT_VENDOR_RATE_LIMIT = {"requestsPerMinute": 30, "cacheTtlS": 3600}


def refresh_vendor_offers(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_VENDOR_REFRESH_CMD",
        {"task": "commerce.vendor-refresh", **payload},
        timeout_s=float(payload.get("timeoutS", 120)),
    )
    source = external if external is not None else _record(payload.get("vendorRefresh", payload))
    raw_offers = source.get("offers", [])
    offers: list[dict[str, Any]] = []
    held: list[dict[str, Any]] = []
    for raw in raw_offers if isinstance(raw_offers, list) else []:
        offer, reasons = _vendor_offer(raw, str(payload.get("componentId", source.get("componentId", ""))))
        if reasons:
            held.append({"input": raw, "reasons": reasons})
        elif offer is not None:
            offers.append(offer)
    return {
        "artifactKind": "vendor-offer-refresh",
        "provider": str(source.get("provider", "external-vendor" if external is not None else "payload")),
        "offers": offers,
        "heldOffers": held,
        "rateLimit": _rate_limit(source.get("rateLimit", payload.get("rateLimit"))),
        "provenance": _provenance(source, payload),
    }


def request_print_quote(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_PRINT_QUOTE_CMD",
        {"task": "commerce.print-quote", **payload},
        timeout_s=float(payload.get("timeoutS", 300)),
    )
    source = external if external is not None else _record(payload.get("printQuote", payload))
    blockers = _print_quote_blockers(source, payload)
    offers: list[dict[str, Any]] = []
    held: list[dict[str, Any]] = []
    if not blockers:
        raw_offers = source.get("offers", [source.get("offer", {})])
        for raw in raw_offers if isinstance(raw_offers, list) else []:
            offer, reasons = _print_offer(raw)
            if reasons:
                held.append({"input": raw, "reasons": reasons})
            elif offer is not None:
                offers.append(offer)
    return {
        "artifactKind": "print-quote-handoff",
        "provider": str(source.get("provider", "external-print" if external is not None else "payload")),
        "status": "quoted" if offers and not blockers else "blocked",
        "checkout": "off-platform",
        "blockers": blockers,
        "request": {
            "dfmArtifactId": _first_string(source.get("dfmArtifactId"), payload.get("dfmArtifactId")),
            "artifact3mf": _artifact_ref(source, payload, "3mf"),
            "printProfile": _artifact_ref(source, payload, "profile"),
        },
        "offers": offers,
        "heldOffers": held,
    }


def _vendor_offer(raw: Any, fallback_component_id: str) -> tuple[dict[str, Any] | None, list[str]]:
    if not isinstance(raw, dict):
        return None, ["vendor offer must be an object"]
    reasons: list[str] = []
    component_id = _first_string(raw.get("componentId"), raw.get("component_id"), fallback_component_id)
    vendor = _first_string(raw.get("vendor"), raw.get("provider"))
    url = _first_string(raw.get("url"), raw.get("offerUrl"), raw.get("productUrl"))
    price = _number(raw.get("price"), None)
    currency = _first_string(raw.get("currency"))
    provenance = _record(raw.get("provenance"))
    source_url = _first_string(provenance.get("sourceUrl"), raw.get("sourceUrl"), url)
    if not component_id:
        reasons.append("componentId missing")
    if not vendor:
        reasons.append("vendor missing")
    if not _is_url(url):
        reasons.append("offer URL must be http(s)")
    if price is None or price < 0:
        reasons.append("non-negative price missing")
    if price is not None and not currency:
        reasons.append("currency missing")
    if not _is_url(source_url):
        reasons.append("provenance sourceUrl must be http(s)")
    if reasons:
        return None, reasons
    return (
        {
            "componentId": component_id,
            "vendor": vendor,
            "sku": _first_string(raw.get("sku"), raw.get("vendorSku")),
            "url": url,
            "price": round(price, 4),
            "currency": currency,
            "availability": _first_string(raw.get("availability")) or "unknown",
            "source": _source(raw.get("source")),
            "provenance": {
                "sourceUrl": source_url,
                "retrievedAt": _first_string(provenance.get("retrievedAt"), raw.get("retrievedAt")),
                "rateLimitKey": _first_string(provenance.get("rateLimitKey"), raw.get("rateLimitKey"), vendor),
            },
        },
        [],
    )


def _print_quote_blockers(source: dict[str, Any], payload: dict[str, Any]) -> list[str]:
    blockers: list[str] = []
    if not _dfm_passed(source, payload):
        blockers.append("DfM report must pass before print quote handoff")
    if _artifact_ref(source, payload, "3mf") is None:
        blockers.append("oriented 3MF artifact missing")
    if _artifact_ref(source, payload, "profile") is None:
        blockers.append("print profile artifact missing")
    return blockers


def _print_offer(raw: Any) -> tuple[dict[str, Any] | None, list[str]]:
    if not isinstance(raw, dict):
        return None, ["print offer must be an object"]
    url = _first_string(raw.get("quoteUrl"), raw.get("url"), raw.get("handoffUrl"))
    if not _is_url(url):
        return None, ["quote URL must be http(s)"]
    terms = _record(raw.get("terms"))
    return (
        {
            "provider": _first_string(raw.get("provider"), raw.get("vendor")) or "print-provider",
            "providerQuoteId": _first_string(raw.get("providerQuoteId"), raw.get("quoteId")),
            "quoteUrl": url,
            "price": _number(raw.get("price"), None),
            "currency": _first_string(raw.get("currency")),
            "leadTimeDays": _number(raw.get("leadTimeDays"), None),
            "expiresAt": _first_string(raw.get("expiresAt")),
            "material": _first_string(raw.get("material")),
            "terms": {**terms, "noDirectPayment": True, "checkout": "off-platform"},
        },
        [],
    )


def _dfm_passed(source: dict[str, Any], payload: dict[str, Any]) -> bool:
    dfm = _record(source.get("dfm", payload.get("dfm")))
    if isinstance(source.get("dfmPass"), bool):
        return source["dfmPass"]
    if isinstance(payload.get("dfmPass"), bool):
        return payload["dfmPass"]
    if isinstance(dfm.get("passed"), bool):
        return dfm["passed"]
    return dfm.get("status") == "pass"


def _artifact_ref(source: dict[str, Any], payload: dict[str, Any], kind: str) -> str | None:
    direct_keys = ("artifact3mf", "threeMfArtifact", "threeMFArtifact") if kind == "3mf" else ("printProfile", "profileArtifact")
    direct = _first_string(*(source.get(key) for key in direct_keys), *(payload.get(key) for key in direct_keys))
    if direct:
        return direct
    artifacts = source.get("artifacts", payload.get("artifacts", []))
    if not isinstance(artifacts, list):
        return None
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        artifact_kind = str(artifact.get("kind", artifact.get("type", ""))).lower()
        artifact_id = _first_string(artifact.get("id"), artifact.get("artifactId"), artifact.get("objectKey"))
        if kind == "3mf" and ("3mf" in artifact_kind or str(artifact_id).lower().endswith(".3mf")):
            return artifact_id
        if kind == "profile" and "profile" in artifact_kind:
            return artifact_id
    return None


def _rate_limit(value: Any) -> dict[str, int]:
    raw = _record(value)
    return {
        "requestsPerMinute": int(_number(raw.get("requestsPerMinute"), DEFAULT_VENDOR_RATE_LIMIT["requestsPerMinute"])),
        "cacheTtlS": int(_number(raw.get("cacheTtlS"), DEFAULT_VENDOR_RATE_LIMIT["cacheTtlS"])),
    }


def _provenance(source: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    raw = _record(source.get("provenance", payload.get("provenance")))
    return {
        "sourceUrl": _first_string(raw.get("sourceUrl"), source.get("sourceUrl"), payload.get("sourceUrl")),
        "retrievedAt": _first_string(raw.get("retrievedAt"), source.get("retrievedAt"), payload.get("retrievedAt")),
    }


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _source(value: Any) -> str:
    raw = str(value) if isinstance(value, str) else "live"
    return raw if raw in {"catalog", "live", "sandbox"} else "live"


def _number(value: Any, default: float | None) -> float | None:
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


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return None


def _is_url(value: str | None) -> bool:
    return bool(value and (value.startswith("https://") or value.startswith("http://")))
