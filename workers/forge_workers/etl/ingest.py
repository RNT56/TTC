"""Deterministic fixture-backed catalog ingest for P3.

The live fetch -> Claude -> OCCT path is intentionally not required here. A
captured fixture supplies a canonical row; this module validates citation,
license, and review-queue semantics before any caller persists it.
"""

from __future__ import annotations

import copy
from dataclasses import asdict, dataclass
from typing import Any

from forge_workers.etl.adapters import (
    CatalogExtractor,
    ClaudeExtractionAdapter,
    EnvelopeOcctAdapter,
    FixtureSourceFetcher,
    GeometryAdapter,
    HttpSourceFetcher,
    OcctTessellationAdapter,
    SourceBundle,
    SourceFetcher,
)
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


def ingest_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Ingest either a canonical fixture row or a source/extraction adapter payload."""

    if isinstance(payload.get("canonicalRow"), dict):
        return ingest_fixture(payload)
    source_url = payload.get("sourceUrl")
    if not isinstance(source_url, str) or not source_url:
        raise ValueError("ingest payload requires canonicalRow or sourceUrl")
    return ingest_with_adapters(
        source_url,
        fetcher=_payload_fetcher(payload, source_url),
        extractor=_payload_extractor(payload),
        geometry_adapter=_payload_geometry_adapter(payload),
    )


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
    provenance = extraction.get("extractionProvenance")
    if isinstance(provenance, dict):
        result["extractionProvenance"] = copy.deepcopy(provenance)
        if provenance.get("kind") == "llm-extraction":
            result["reviewQueue"].append(
                asdict(
                    ReviewQueueRecord(
                        artifact_id=str(row.get("id", "")),
                        artifact_kind="component",
                        reason="provider extraction requires human catalog review",
                        confidence=float(row.get("confidence", 0.0)),
                        payload=row,
                    )
                )
            )
            result["publishable"] = False
            result["needsReview"] = True
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
    return ingest_payload(job.payload)


def _payload_fetcher(payload: dict[str, Any], source_url: str) -> SourceFetcher:
    bundle = payload.get("sourceBundle")
    if isinstance(bundle, dict):
        source = SourceBundle(
            source_url=str(bundle.get("sourceUrl", source_url)),
            body=str(bundle.get("body", "")),
            content_type=str(bundle.get("contentType", "text/plain")),
            fetched_at=str(bundle.get("fetchedAt", "2026-06-13T00:00:00Z")),
            sha256=str(bundle.get("sha256") or SourceBundle.from_text(source_url, str(bundle.get("body", ""))).sha256),
        )
        return FixtureSourceFetcher({source_url: source})
    if payload.get("allowHttpFetch") is True:
        return HttpSourceFetcher(timeout_s=float(payload.get("timeoutS", 10.0)))
    raise RuntimeError("live source fetch requires sourceBundle fixture or allowHttpFetch=true")


def _payload_extractor(payload: dict[str, Any]) -> CatalogExtractor:
    extraction = payload.get("extraction")
    if isinstance(extraction, dict):
        return ClaudeExtractionAdapter(extractor=lambda _bundle: extraction)
    return ClaudeExtractionAdapter()


def _payload_geometry_adapter(payload: dict[str, Any]) -> GeometryAdapter:
    geometry = payload.get("geometry")
    if isinstance(geometry, dict):
        return OcctTessellationAdapter(lambda _row, _bundle: geometry)
    if payload.get("requireOcct") is True:
        return OcctTessellationAdapter()
    return EnvelopeOcctAdapter()
