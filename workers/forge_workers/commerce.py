"""Commerce handoff normalizers for P11 vendor and print integrations.

These helpers keep provider-specific vendor refresh and print quote responses in a
single shape before gateway routes persist them. They intentionally produce quote
links only: ForgedTTC does not create carts, take payment, or model seller payouts
in the usage-beta slice.
"""

from __future__ import annotations

import ipaddress
import math
import os
import urllib.parse
from typing import Any

from forge_workers.external import run_json_command
from forge_workers.queue import Job, registry


DEFAULT_VENDOR_RATE_LIMIT = {"requestsPerMinute": 30, "cacheTtlS": 3600}
MAX_VENDOR_OFFERS = 50


def refresh_vendor_offers(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_VENDOR_REFRESH_CMD",
        {"task": "commerce.vendor-refresh", **payload},
        timeout_s=_bounded_timeout(payload.get("timeoutS"), default=120.0, maximum=120.0),
    )
    source = external if external is not None else _record(payload.get("vendorRefresh", payload))
    raw_offers = source.get("offers", [])
    if not isinstance(raw_offers, list):
        raise RuntimeError("vendor refresh output requires an offers array")
    if len(raw_offers) > MAX_VENDOR_OFFERS:
        raise RuntimeError("vendor refresh output exceeds the offer limit")
    offers: list[dict[str, Any]] = []
    held: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_offers):
        offer, reasons = _vendor_offer(raw, str(payload.get("componentId", source.get("componentId", ""))))
        if reasons:
            held.append(_held_vendor_offer(index, raw, reasons))
        elif offer is not None:
            offers.append(offer)
    return {
        "artifactKind": "vendor-offer-refresh",
        "provider": _bounded_string(
            source.get("provider", "external-vendor" if external is not None else "payload"),
            120,
        ) or "unknown-vendor",
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
    component_id = _first_bounded_string(200, raw.get("componentId"), raw.get("component_id"), fallback_component_id)
    vendor = _first_bounded_string(120, raw.get("vendor"), raw.get("provider"))
    sku = _first_bounded_string(160, raw.get("sku"), raw.get("vendorSku"))
    url = _first_bounded_string(2000, raw.get("url"), raw.get("offerUrl"), raw.get("productUrl"))
    price = _number(raw.get("price"), None)
    currency = _first_bounded_string(3, raw.get("currency"))
    provenance = _record(raw.get("provenance"))
    source_url = _first_bounded_string(2000, provenance.get("sourceUrl"), raw.get("sourceUrl"), url)
    if not component_id:
        reasons.append("componentId missing")
    if not vendor:
        reasons.append("vendor missing")
    if not _is_https_url(url):
        reasons.append("offer URL must be credential-free public HTTPS")
    if price is None or price < 0:
        reasons.append("non-negative price missing")
    if price is not None and (currency is None or len(currency) != 3 or not currency.isalpha()):
        reasons.append("three-letter currency missing")
    if not _is_https_url(source_url):
        reasons.append("provenance sourceUrl must be credential-free public HTTPS")
    if reasons:
        return None, reasons
    return (
        {
            "componentId": component_id,
            "vendor": vendor,
            "sku": sku,
            "url": url,
            "price": round(price, 4),
            "currency": currency.upper(),
            "availability": _availability(raw.get("availability")),
            "source": _source(raw.get("source")),
            "provenance": {
                "sourceUrl": source_url,
                "retrievedAt": _first_bounded_string(64, provenance.get("retrievedAt"), raw.get("retrievedAt")),
                "rateLimitKey": _first_bounded_string(
                    160,
                    provenance.get("rateLimitKey"),
                    raw.get("rateLimitKey"),
                    vendor,
                ),
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
    if not _is_https_url(url):
        return None, ["quote URL must be credential-free public HTTPS"]
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
        "requestsPerMinute": int(
            max(1, min(_number(raw.get("requestsPerMinute"), DEFAULT_VENDOR_RATE_LIMIT["requestsPerMinute"]), 600))
        ),
        "cacheTtlS": int(max(1, min(_number(raw.get("cacheTtlS"), DEFAULT_VENDOR_RATE_LIMIT["cacheTtlS"]), 86_400))),
    }


def _provenance(source: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    raw = _record(source.get("provenance", payload.get("provenance")))
    source_url = _first_bounded_string(2000, raw.get("sourceUrl"), source.get("sourceUrl"), payload.get("sourceUrl"))
    return {
        "sourceUrl": source_url if _is_https_url(source_url) else None,
        "retrievedAt": _first_bounded_string(
            64,
            raw.get("retrievedAt"),
            source.get("retrievedAt"),
            payload.get("retrievedAt"),
        ),
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
        number = float(value)
        return number if math.isfinite(number) else default
    if isinstance(value, str):
        try:
            number = float(value)
            return number if math.isfinite(number) else default
        except ValueError:
            return default
    return default


def _bounded_timeout(value: Any, *, default: float, maximum: float) -> float:
    if value is None:
        return default
    timeout = _number(value, None)
    if timeout is None or timeout < 1:
        raise RuntimeError("vendor refresh timeoutS must be a finite number between 1 and 120")
    return min(timeout, maximum)


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return None


def _bounded_string(value: Any, max_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped if stripped and len(stripped) <= max_length else None


def _first_bounded_string(max_length: int, *values: Any) -> str | None:
    for value in values:
        bounded = _bounded_string(value, max_length)
        if bounded is not None:
            return bounded
    return None


def _availability(value: Any) -> str:
    normalized = str(value).strip().lower().replace("_", "-") if isinstance(value, str) else "unknown"
    aliases = {
        "available": "in-stock",
        "in-stock": "in-stock",
        "back-order": "backorder",
        "backorder": "backorder",
        "out-of-stock": "out-of-stock",
        "unavailable": "out-of-stock",
    }
    return aliases.get(normalized, "unknown")


def _held_vendor_offer(index: int, raw: Any, reasons: list[str]) -> dict[str, Any]:
    record = _record(raw)
    return {
        "index": index,
        "componentId": _first_bounded_string(200, record.get("componentId"), record.get("component_id")),
        "vendor": _first_bounded_string(120, record.get("vendor"), record.get("provider")),
        "sku": _first_bounded_string(160, record.get("sku"), record.get("vendorSku")),
        "reasons": reasons,
    }


def _is_https_url(value: str | None) -> bool:
    if not value:
        return False
    try:
        parsed = urllib.parse.urlsplit(value)
        hostname = (parsed.hostname or "").rstrip(".").lower()
        if (
            parsed.scheme != "https"
            or not hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.fragment
            or hostname == "localhost"
            or hostname.endswith((".localhost", ".local"))
        ):
            return False
        try:
            return ipaddress.ip_address(hostname).is_global
        except ValueError:
            return True
    except (TypeError, ValueError):
        return False


@registry.register("commerce.vendor-refresh")
def handle_vendor_refresh(job: Job) -> dict[str, Any]:
    if not os.environ.get("FORGE_VENDOR_REFRESH_CMD", "").strip():
        raise RuntimeError("FORGE_VENDOR_REFRESH_CMD is required for queued vendor refresh jobs")
    return refresh_vendor_offers(job.payload)
