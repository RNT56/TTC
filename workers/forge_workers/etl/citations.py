"""Per-field citation discipline for catalog ingestion (plan §8.3, doctrine #2).

Every extracted datum carries a source citation or the row does not publish —
low-confidence extractions queue for human review; nothing auto-publishes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

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
    cited = {c.field_path for c in citations}

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

    low = [c.field_path for c in citations if c.confidence < REVIEW_CONFIDENCE_FLOOR]
    if float(row.get("confidence", 0.0)) < REVIEW_CONFIDENCE_FLOOR:
        low.append("row.confidence")
    needs_review = bool(low)
    if low:
        problems.append(
            f"low-confidence extractions (review queue): {', '.join(sorted(low))}"
        )

    return IngestVerdict(
        publishable=not problems,
        needs_review=needs_review,
        problems=problems,
    )


def _lookup(row: dict[str, Any], dotted: str) -> Any:
    node: Any = row
    for key in dotted.split("."):
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node
