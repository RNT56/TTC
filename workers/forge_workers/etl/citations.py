"""Per-field citation discipline for catalog ingestion (plan §8.3, doctrine #2).

Every extracted datum carries a source citation or the row does not publish —
low-confidence extractions queue for human review; nothing auto-publishes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

#: Fields that must be cited for a component row to be publishable, per category.
REQUIRED_CITED_FIELDS: dict[str, tuple[str, ...]] = {
    "motor": ("mass_g", "elec.kv", "mech.mount_pattern"),
    "battery": ("mass_g", "elec.capacity_mah", "elec.cells_min", "elec.cells_max"),
    "prop": ("mass_g", "dims.diameter_in", "dims.pitch_in"),
    "frame": ("mass_g", "mech.mount_pattern"),
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


def check_citations(category: str,
                    row: dict[str, Any],
                    citations: list[Citation]) -> IngestVerdict:
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

    if "license_id" not in row or not row["license_id"]:
        problems.append("license ledger entry is non-optional (D10)")

    low = [c.field_path for c in citations if c.confidence < REVIEW_CONFIDENCE_FLOOR]
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
