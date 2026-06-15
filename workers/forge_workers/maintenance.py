"""Maintenance twin workers (P12).

The maintenance twin turns telemetry and explode-chain data into deterministic
wear estimates, crash windows, repair steps, reorder hints, and fleet summaries.
"""

from __future__ import annotations

from typing import Any

from forge_workers.queue import Job, registry


def estimate_wear(payload: dict[str, Any]) -> dict[str, Any]:
    samples = payload.get("samples", [])
    if not isinstance(samples, list) or len(samples) < 2:
        return {
            "artifactKind": "wear-estimate",
            "motorHours": 0.0,
            "packCycles": 0.0,
            "rIntMohm": None,
            "warnings": ["insufficient telemetry"],
        }
    nominal_v = float(payload.get("nominalVoltageV", 16.8))
    capacity_mah = max(1.0, float(payload.get("capacityMah", 1500)))
    amp_hours = 0.0
    weighted_r = 0.0
    r_weight = 0.0
    throttle_time = 0.0
    for prev, cur in zip(samples, samples[1:]):
        dt_h = max(0.0, float(cur.get("t", 0)) - float(prev.get("t", 0))) / 3600.0
        current = max(0.0, 0.5 * (float(prev.get("currentA", 0)) + float(cur.get("currentA", 0))))
        throttle = max(0.0, 0.5 * (float(prev.get("throttle", 0)) + float(cur.get("throttle", 0))))
        amp_hours += current * dt_h
        throttle_time += throttle * dt_h
        if current > 1.0:
            voltage = 0.5 * (float(prev.get("voltageV", nominal_v)) + float(cur.get("voltageV", nominal_v)))
            weighted_r += max(0.0, nominal_v - voltage) / current * 1000.0 * current
            r_weight += current
    r_int = weighted_r / r_weight if r_weight else None
    warnings: list[str] = []
    if r_int is not None and r_int > 120:
        warnings.append("internal resistance estimate is high")
    return {
        "artifactKind": "wear-estimate",
        "motorHours": throttle_time,
        "packCycles": amp_hours / (capacity_mah / 1000.0),
        "rIntMohm": r_int,
        "warnings": warnings,
    }


def crash_forensics(payload: dict[str, Any]) -> dict[str, Any]:
    samples = payload.get("samples", [])
    threshold = float(payload.get("thresholdG", 10.0))
    if not isinstance(samples, list) or not samples:
        raise ValueError("maintenance.crash-forensics requires samples")
    impact = next((sample for sample in samples if float(sample.get("accelG", 0)) >= threshold), None)
    if impact is None:
        return {"artifactKind": "crash-forensics", "crashDetected": False, "window": None}
    t = float(impact.get("t", 0))
    pre = float(payload.get("preS", 2.0))
    post = float(payload.get("postS", 4.0))
    first_t = float(samples[0].get("t", t))
    window = {"startS": max(first_t, t - pre), "impactS": t, "endS": t + post}
    ghost = _ghost_divergence(samples, window["startS"], window["endS"], float(payload.get("ghostWarnM", 0.35)))
    return {
        "artifactKind": "crash-forensics",
        "crashDetected": True,
        "window": window,
        "ghostOverlay": {
            "enabled": True,
            "divergenceMetric": payload.get("divergenceMetric", "position-rmse"),
            "divergence": ghost,
        },
        "scrub": {
            "frameCount": sum(1 for sample in samples if window["startS"] <= float(sample.get("t", 0)) <= window["endS"]),
            "preS": pre,
            "postS": post,
        },
    }


def _ghost_divergence(samples: list[Any], start_s: float, end_s: float, warn_m: float) -> dict[str, Any]:
    distances: list[float] = []
    for sample in samples:
        if not isinstance(sample, dict):
            continue
        t = float(sample.get("t", 0))
        if t < start_s or t > end_s:
            continue
        actual = _position(sample, "positionM", "actualPositionM", "actual")
        ghost = _position(sample, "ghostPositionM", "predictedPositionM", "ghost")
        if actual is None or ghost is None:
            continue
        distances.append(sum((a - b) ** 2 for a, b in zip(actual, ghost)) ** 0.5)
    if not distances:
        return {"sampleCount": 0, "maxM": None, "rmsM": None, "warnM": warn_m, "status": "missing"}
    rms = (sum(distance * distance for distance in distances) / len(distances)) ** 0.5
    max_m = max(distances)
    return {
        "sampleCount": len(distances),
        "maxM": round(max_m, 4),
        "rmsM": round(rms, 4),
        "warnM": warn_m,
        "status": "diverged" if max_m >= warn_m else "tracking",
    }


def _position(sample: dict[str, Any], *keys: str) -> list[float] | None:
    for key in keys:
        value = sample.get(key)
        if isinstance(value, list) and len(value) >= 3:
            return [float(value[0]), float(value[1]), float(value[2])]
        if isinstance(value, dict):
            nested = value.get("positionM") or value.get("xyz")
            if isinstance(nested, list) and len(nested) >= 3:
                return [float(nested[0]), float(nested[1]), float(nested[2])]
    return None


def repair_sheet(payload: dict[str, Any]) -> dict[str, Any]:
    parts = payload.get("parts", [])
    damaged_nodes = set(str(node) for node in payload.get("damagedNodes", []))
    vendor_skus = payload.get("vendorSkus", {})
    vendor_offers = _vendor_offer_index(payload.get("vendorOffers", payload.get("vendorOfferLinks", [])))
    print_quotes = _print_quote_index(payload.get("printQuotes", payload.get("printQuoteOffers", [])))
    if not isinstance(parts, list):
        raise ValueError("maintenance.repair-sheet parts must be a list")
    rows: list[tuple[float, int, dict[str, Any]]] = []
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            continue
        if str(part.get("node")) not in damaged_nodes:
            continue
        explode = part.get("explode", {})
        t0 = float(explode.get("t0", 0.5)) if isinstance(explode, dict) else 0.5
        rows.append((t0, index, part))
    rows.sort(key=lambda row: (-row[0], row[1]))
    steps = []
    for order, (_, index, part) in enumerate(rows, start=1):
        comp = part.get("comp")
        node = str(part.get("node"))
        reorder_sku = vendor_skus.get(comp) if isinstance(vendor_skus, dict) else None
        vendor_offer = vendor_offers.get(str(reorder_sku)) if reorder_sku else None
        print_quote = _match_print_quote(print_quotes, part, index)
        handoff_links = []
        if vendor_offer:
            handoff_links.append({"kind": "vendor-offer", **vendor_offer})
        if print_quote:
            handoff_links.append({"kind": "print-quote", **print_quote})
        steps.append(
            {
                "order": order,
                "node": node,
                "partIndex": index,
                "action": f"remove, inspect, and replace part {index}",
                "reorderSku": reorder_sku,
                "dfmArtifactId": part.get("dfmArtifactId"),
                "vendorOffer": vendor_offer,
                "printQuote": print_quote,
                "handoffLinks": handoff_links,
                "quoteReady": bool(handoff_links),
            }
        )
    quote_links = [link for step in steps for link in step["handoffLinks"]]
    return {
        "artifactKind": "repair-sheet",
        "steps": steps,
        "reorderCount": sum(1 for s in steps if s["reorderSku"]),
        "handoffCount": len(quote_links),
        "quoteLinks": quote_links,
    }


def _vendor_offer_index(raw: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw, list):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for offer in raw:
        if not isinstance(offer, dict):
            continue
        sku = offer.get("sku") or offer.get("vendorSku") or offer.get("reorderSku")
        url = offer.get("url") or offer.get("offerUrl") or offer.get("handoffUrl")
        if not sku or not url:
            continue
        out[str(sku)] = {
            "sku": str(sku),
            "provider": str(offer.get("provider", offer.get("vendor", "vendor"))),
            "url": str(url),
            "price": offer.get("price"),
            "currency": offer.get("currency"),
        }
    return out


def _print_quote_index(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for quote in raw:
        if not isinstance(quote, dict):
            continue
        url = quote.get("url") or quote.get("quoteUrl") or quote.get("handoffUrl")
        if not url:
            continue
        out.append(
            {
                "node": str(quote["node"]) if "node" in quote else None,
                "comp": str(quote["comp"]) if "comp" in quote else None,
                "partIndex": int(quote["partIndex"]) if isinstance(quote.get("partIndex"), int) else None,
                "dfmArtifactId": str(quote["dfmArtifactId"]) if "dfmArtifactId" in quote else None,
                "provider": str(quote.get("provider", "print-provider")),
                "url": str(url),
                "material": quote.get("material"),
                "price": quote.get("price"),
                "currency": quote.get("currency"),
            }
        )
    return out


def _match_print_quote(quotes: list[dict[str, Any]], part: dict[str, Any], part_index: int) -> dict[str, Any] | None:
    for quote in quotes:
        if quote.get("partIndex") == part_index:
            return quote
        if quote.get("dfmArtifactId") and quote.get("dfmArtifactId") == part.get("dfmArtifactId"):
            return quote
        if quote.get("node") and quote.get("node") == str(part.get("node")):
            return quote
        if quote.get("comp") and quote.get("comp") == str(part.get("comp")):
            return quote
    return None


def fleet_summary(payload: dict[str, Any]) -> dict[str, Any]:
    vehicles = payload.get("vehicles", [])
    if not isinstance(vehicles, list):
        raise ValueError("maintenance.fleet-summary vehicles must be a list")
    critical = [v for v in vehicles if isinstance(v, dict) and v.get("status") == "critical"]
    due = [v for v in vehicles if isinstance(v, dict) and float(v.get("packCycles", 0)) >= float(payload.get("cycleLimit", 80))]
    return {
        "artifactKind": "fleet-summary",
        "vehicleCount": len(vehicles),
        "criticalCount": len(critical),
        "serviceDueCount": len(due),
        "nextActions": [
            {"vehicleId": v.get("id"), "action": "service"} for v in due[:10] if isinstance(v, dict)
        ],
    }


@registry.register("maintenance.estimate-wear")
def handle_estimate_wear(job: Job) -> dict[str, Any]:
    return estimate_wear(job.payload)


@registry.register("maintenance.crash-forensics")
def handle_crash_forensics(job: Job) -> dict[str, Any]:
    return crash_forensics(job.payload)


@registry.register("maintenance.repair-sheet")
def handle_repair_sheet(job: Job) -> dict[str, Any]:
    return repair_sheet(job.payload)


@registry.register("maintenance.fleet-summary")
def handle_fleet_summary(job: Job) -> dict[str, Any]:
    return fleet_summary(job.payload)
