"""Maintenance twin workers (P12).

The maintenance twin turns telemetry and explode-chain data into deterministic
wear estimates, crash windows, repair steps, reorder hints, and fleet summaries.
"""

from __future__ import annotations

import math
from typing import Any

from forge_workers.queue import Job, registry


GHOST_OVERLAY_SCHEMA = "forge-ghost-overlay"
GHOST_OVERLAY_VERSION = "1.0.0"
GHOST_OVERLAY_FRAME = "forge-y-up-rh-m"
GHOST_MAX_DURATION_S = 600.0
GHOST_MAX_SOURCE_SAMPLES = 100_000
GHOST_MAX_RENDER_POINTS = 6_001


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
    samples = _validated_crash_samples(payload.get("samples", []))
    threshold = _bounded_finite(payload.get("thresholdG", 10.0), "thresholdG", minimum=0.01, maximum=1000.0)
    warn_m = _bounded_finite(payload.get("ghostWarnM", 0.35), "ghostWarnM", minimum=0.0, maximum=1000.0)
    pre = _bounded_finite(payload.get("preS", 2.0), "preS", minimum=0.0, maximum=30.0)
    post = _bounded_finite(payload.get("postS", 4.0), "postS", minimum=0.0, maximum=30.0)
    metric = payload.get("divergenceMetric", "position-rmse")
    if metric != "position-rmse":
        raise ValueError("maintenance.crash-forensics supports only position-rmse divergence")
    overlay = _ghost_overlay(samples, warn_m, metric)
    impact = next((sample for sample in samples if sample["accelG"] >= threshold), None)
    if impact is None:
        return {
            "artifactKind": "crash-forensics",
            "crashDetected": False,
            "window": None,
            "ghostOverlay": overlay,
            "scrub": {"frameCount": 0, "preS": pre, "postS": post},
        }
    t = float(impact.get("t", 0))
    first_t = float(samples[0].get("t", t))
    last_t = float(samples[-1].get("t", t))
    window = {"startS": max(first_t, t - pre), "impactS": t, "endS": min(last_t, t + post)}
    overlay["divergence"] = _ghost_divergence(samples, window["startS"], window["endS"], warn_m)
    return {
        "artifactKind": "crash-forensics",
        "crashDetected": True,
        "window": window,
        "ghostOverlay": overlay,
        "scrub": {
            "frameCount": sum(1 for sample in samples if window["startS"] <= float(sample.get("t", 0)) <= window["endS"]),
            "preS": pre,
            "postS": post,
        },
    }


def _validated_crash_samples(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list) or not value:
        raise ValueError("maintenance.crash-forensics requires samples")
    if len(value) > GHOST_MAX_SOURCE_SAMPLES:
        raise ValueError("maintenance.crash-forensics sample count exceeds limit")
    samples: list[dict[str, Any]] = []
    previous_t: float | None = None
    for index, sample in enumerate(value):
        if not isinstance(sample, dict):
            raise ValueError(f"maintenance.crash-forensics sample {index} must be an object")
        t = _bounded_finite(sample.get("t"), f"samples[{index}].t", minimum=0.0, maximum=1.0e12)
        accel_g = _bounded_finite(sample.get("accelG", 0.0), f"samples[{index}].accelG", minimum=0.0, maximum=1000.0)
        if previous_t is not None and t <= previous_t:
            raise ValueError("maintenance.crash-forensics sample time must be strictly increasing")
        samples.append({**sample, "t": t, "accelG": accel_g})
        previous_t = t
    if samples[-1]["t"] - samples[0]["t"] > GHOST_MAX_DURATION_S + 1.0e-9:
        raise ValueError("maintenance.crash-forensics duration exceeds 600 seconds")
    return samples


def _ghost_overlay(samples: list[dict[str, Any]], warn_m: float, metric: str) -> dict[str, Any]:
    start_s = samples[0]["t"]
    end_s = samples[-1]["t"]
    duration_s = end_s - start_s
    paired: list[tuple[float, list[float], list[float], float]] = []
    for sample in samples:
        actual = _position(sample, "positionM", "actualPositionM", "actual")
        predicted = _position(sample, "ghostPositionM", "predictedPositionM", "ghost")
        if actual is None or predicted is None:
            continue
        divergence = math.sqrt(sum((left - right) ** 2 for left, right in zip(actual, predicted)))
        paired.append((sample["t"], actual, predicted, divergence))

    complete = len(paired) == len(samples)
    points = _decimate_ghost_points(paired) if complete else []
    seek_index = _ghost_seek_index(points, start_s, end_s) if points else []
    source_rate = (len(samples) - 1) / duration_s if duration_s > 0.0 else 0.0
    render_rate = (len(points) - 1) / duration_s if len(points) > 1 and duration_s > 0.0 else 0.0
    return {
        "schemaVersion": f"{GHOST_OVERLAY_SCHEMA}/{GHOST_OVERLAY_VERSION}",
        "enabled": complete and len(points) >= 2,
        "disabledReason": None if complete and len(points) >= 2 else "complete position pairs are required",
        "frame": GHOST_OVERLAY_FRAME,
        "pointLayout": [
            "timeS",
            "actualXM",
            "actualYM",
            "actualZM",
            "predictedXM",
            "predictedYM",
            "predictedZM",
            "divergenceM",
        ],
        "divergenceMetric": metric,
        "sourceMaturity": "unverified",
        "sourceSampleCount": len(samples),
        "sourceSampleRateHz": round(source_rate, 6),
        "startS": round(start_s, 6),
        "endS": round(end_s, 6),
        "durationS": round(duration_s, 6),
        "renderPointCount": len(points),
        "renderRateHz": round(render_rate, 6),
        "maxRenderPointCount": GHOST_MAX_RENDER_POINTS,
        "points": points,
        "seekIndex": seek_index,
        "divergence": _ghost_divergence(samples, start_s, end_s, warn_m),
        "deviceIdentityVerified": False,
        "recordedDeviceVerified": False,
        "fieldSessionVerified": False,
    }


def _decimate_ghost_points(
    paired: list[tuple[float, list[float], list[float], float]],
) -> list[list[float]]:
    if not paired:
        return []
    stride = max(1, math.ceil((len(paired) - 1) / (GHOST_MAX_RENDER_POINTS - 1)))
    indices = list(range(0, len(paired), stride))
    if indices[-1] != len(paired) - 1:
        indices.append(len(paired) - 1)
    points: list[list[float]] = []
    for index in indices:
        t, actual, predicted, divergence = paired[index]
        points.append(
            [
                round(t, 6),
                *(round(value, 6) for value in actual),
                *(round(value, 6) for value in predicted),
                round(divergence, 6),
            ]
        )
    return points


def _ghost_seek_index(points: list[list[float]], start_s: float, end_s: float) -> list[list[float | int]]:
    index: list[list[float | int]] = []
    point_index = 0
    whole_seconds = int(math.floor(end_s - start_s))
    for offset in range(whole_seconds + 1):
        target = start_s + offset
        while point_index + 1 < len(points) and points[point_index + 1][0] <= target:
            point_index += 1
        index.append([round(target, 6), point_index])
    if not index or index[-1][0] < end_s:
        index.append([round(end_s, 6), len(points) - 1])
    return index


def _bounded_finite(value: Any, label: str, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool):
        raise ValueError(f"maintenance.crash-forensics {label} must be finite")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"maintenance.crash-forensics {label} must be finite") from exc
    if not math.isfinite(number) or number < minimum or number > maximum:
        raise ValueError(f"maintenance.crash-forensics {label} is out of range")
    return number


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
            parsed = _finite_position(value)
            if parsed is not None:
                return parsed
        if isinstance(value, dict):
            nested = value.get("positionM") or value.get("xyz")
            if isinstance(nested, list) and len(nested) >= 3:
                parsed = _finite_position(nested)
                if parsed is not None:
                    return parsed
    return None


def _finite_position(value: list[Any]) -> list[float] | None:
    if any(isinstance(item, bool) for item in value[:3]):
        return None
    try:
        parsed = [float(value[0]), float(value[1]), float(value[2])]
    except (TypeError, ValueError):
        return None
    if not all(math.isfinite(item) and abs(item) <= 1.0e6 for item in parsed):
        return None
    return parsed


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
