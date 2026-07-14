"""Per-field citation discipline for catalog ingestion (plan §8.3, doctrine #2).

Every extracted datum carries a source citation or the row does not publish —
low-confidence extractions queue for human review; nothing auto-publishes.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlsplit

#: Fields that must be cited for a canonical component row to be publishable.
REQUIRED_CITED_FIELDS: dict[str, tuple[str, ...]] = {
    "motor": (
        "massG",
        "elec.kv",
        "elec.vMin",
        "elec.vMax",
        "elec.maxCurrentA",
        "mech.mountPattern",
        "mech.propShaft",
        "license",
        "prices",
    ),
    "battery": (
        "massG",
        "dims",
        "elec.capacityMah",
        "elec.vMin",
        "elec.vMax",
        "elec.maxDischargeA",
        "elec.connectors",
        "license",
        "prices",
    ),
    "prop": ("massG", "mech.propDiameterIn", "mech.pitchIn", "mech.blades", "license", "prices"),
    "frame": ("massG", "dims", "mech.mountPattern", "mech.motorSpacingMm", "license", "prices"),
    "esc": (
        "massG",
        "dims",
        "elec.vMin",
        "elec.vMax",
        "elec.maxCurrentA",
        "mech.mountPattern",
        "license",
        "prices",
    ),
    "fc": ("massG", "dims", "elec.vMin", "elec.vMax", "mech.mountPattern", "license", "prices"),
    "rover": ("massG", "dims", "license", "prices"),
}

#: Extractions below this confidence go to the human review queue.
REVIEW_CONFIDENCE_FLOOR = 0.8


@dataclass(frozen=True)
class Citation:
    field_path: str
    source_url: str
    extractor: str
    confidence: float


@dataclass(frozen=True)
class IngestVerdict:
    publishable: bool
    needs_review: bool
    problems: list[str] = field(default_factory=list)


def check_citations(
    category: str,
    row: dict[str, Any],
    citations: list[Citation],
) -> IngestVerdict:
    """Gate a candidate component row on citation completeness + confidence."""
    problems: list[str] = []
    cited = {
        citation.field_path
        for citation in citations
        if isinstance(citation.field_path, str) and citation.field_path.strip()
    }

    required = REQUIRED_CITED_FIELDS.get(category)
    if required is None:
        problems.append(f"unknown category '{category}'")
        return IngestVerdict(publishable=False, needs_review=True, problems=problems)

    for path in required:
        if _lookup(row, path) is None:
            problems.append(f"missing required field: {path}")
        elif path not in cited:
            problems.append(f"uncited field: {path}")

    license_row = row.get("license")
    if not isinstance(license_row, dict) or not license_row.get("id") or not license_row.get("class"):
        problems.append("license ledger entry is non-optional (D10)")

    prices = row.get("prices")
    if not isinstance(prices, list) or not any(p.get("purchasable") for p in prices if isinstance(p, dict)):
        problems.append("purchasable price/SKU is required for P3 BOM export")

    invalid_confidence: list[str] = []
    low: list[str] = []
    for index, citation in enumerate(citations):
        label = (
            citation.field_path
            if isinstance(citation.field_path, str) and citation.field_path.strip()
            else f"citation[{index}]"
        )
        if not isinstance(citation.extractor, str) or not citation.extractor.strip():
            problems.append(f"invalid citation extractor: {label}")
        if not _valid_source_url(citation.source_url):
            problems.append(f"invalid citation source URL: {label}")
        confidence = _confidence(citation.confidence)
        if confidence is None:
            invalid_confidence.append(label)
        elif confidence < REVIEW_CONFIDENCE_FLOOR:
            low.append(label)

    row_confidence = _confidence(row.get("confidence"))
    if row_confidence is None:
        invalid_confidence.append("row.confidence")
    elif row_confidence < REVIEW_CONFIDENCE_FLOOR:
        low.append("row.confidence")
    if invalid_confidence:
        problems.append(
            "invalid confidence values: " + ", ".join(sorted(invalid_confidence))
        )
    needs_review = bool(low or invalid_confidence)
    if low:
        problems.append(
            f"low-confidence extractions (review queue): {', '.join(sorted(low))}"
        )

    return IngestVerdict(
        publishable=not problems,
        needs_review=needs_review,
        problems=problems,
    )


def _confidence(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        number = float(value)
    except OverflowError:
        return None
    return number if math.isfinite(number) and 0.0 <= number <= 1.0 else None


def _valid_source_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    try:
        parsed = urlsplit(value)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and bool(parsed.hostname)
        and parsed.username is None
        and parsed.password is None
        and not parsed.fragment
    )


def _lookup(row: dict[str, Any], dotted: str) -> Any:
    node: Any = row
    for key in dotted.split("."):
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node
