"""Deterministic fixture-backed catalog ingest for P3.

The live fetch -> Claude -> OCCT path is intentionally not required here. A
captured fixture supplies a canonical row; this module validates citation,
license, and review-queue semantics before any caller persists it.
"""

from __future__ import annotations

import copy
from dataclasses import asdict, dataclass
from typing import Any

from forge_workers.etl.adapters import CatalogExtractor, GeometryAdapter, SourceFetcher
from forge_workers.etl.citations import Citation, IngestVerdict, check_citations
from forge_workers.queue import Job, registry


@dataclass(frozen=True)
class ReviewQueueRecord:
    artifact_id: str
    artifact_kind: str
    reason: str
    confidence: float
    payload: dict[str, Any]


def citations_from_row(row: dict[str, Any]) -> list[Citation]:
    out: list[Citation] = []
    confidence = float(row.get("confidence", 0.0))
    for field_path, citation in row.get("citations", {}).items():
        for source_url in citation.get("sources", []):
            out.append(
                Citation(
                    field_path=field_path,
                    source_url=source_url,
                    extractor="fixture-etl",
                    confidence=confidence,
                )
            )
    return out


def ingest_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    """Return the canonical row plus review-queue records.

    Fixture shape:
      {"sourceBundle": {...}, "canonicalRow": {...}, "sourceConflicts": [...]}
    """
    row = fixture.get("canonicalRow")
    if not isinstance(row, dict):
        raise ValueError("fixture requires canonicalRow")
    category = row.get("category")
    if not isinstance(category, str):
        raise ValueError("canonicalRow.category is required")

    conflicts = [str(c) for c in fixture.get("sourceConflicts", [])]
    return ingest_row(row, conflicts=conflicts)


def ingest_with_adapters(
    source_url: str,
    *,
    fetcher: SourceFetcher,
    extractor: CatalogExtractor,
    geometry_adapter: GeometryAdapter | None = None,
) -> dict[str, Any]:
    bundle = fetcher.fetch(source_url)
    extraction = extractor.extract(bundle)
    row = extraction.get("canonicalRow")
    if not isinstance(row, dict):
        raise ValueError("extractor output requires canonicalRow")
    row = copy.deepcopy(row)
    if geometry_adapter is not None:
        row = geometry_adapter.attach_geometry(row, bundle)
    conflicts = [str(c) for c in extraction.get("sourceConflicts", [])]
    result = ingest_row(row, conflicts=conflicts)
    result["sourceBundle"] = bundle.to_json()
    return result


def ingest_row(row: dict[str, Any], *, conflicts: list[str] | None = None) -> dict[str, Any]:
    category = row.get("category")
    if not isinstance(category, str):
        raise ValueError("canonicalRow.category is required")
    verdict = check_citations(category, row, citations_from_row(row))
    records = review_records(row, verdict, conflicts)
    return {
        "row": row,
        "publishable": verdict.publishable and not records,
        "needsReview": bool(records),
        "problems": verdict.problems,
        "reviewQueue": [asdict(record) for record in records],
    }


def review_records(
    row: dict[str, Any],
    verdict: IngestVerdict,
    conflicts: list[str] | None = None,
) -> list[ReviewQueueRecord]:
    records: list[ReviewQueueRecord] = []
    reasons = list(verdict.problems)
    reasons.extend(f"source conflict: {c}" for c in conflicts or [])
    if row.get("review"):
        reasons.append(str(row["review"]))
    if not reasons and verdict.needs_review:
        reasons.append("confidence below review floor")
    for reason in reasons:
        records.append(
            ReviewQueueRecord(
                artifact_id=str(row.get("id", "")),
                artifact_kind="component",
                reason=reason,
                confidence=float(row.get("confidence", 0.0)),
                payload=row,
            )
        )
    return records


@registry.register("etl.ingest-component")
def handle_ingest_component(job: Job) -> dict[str, Any]:
    return ingest_fixture(job.payload)
