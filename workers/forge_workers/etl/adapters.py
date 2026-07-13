"""Injectable ETL adapters for P4 catalog ingestion.

The fixture adapters are the CI path. Live HTTP, Claude, and OCCT integrations plug
into the same protocol later, but absence of credentials or executors is explicit
instead of falling through to partial catalog rows.
"""

from __future__ import annotations

import copy
import hashlib
import os
import time
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Protocol

from forge_workers.external import run_json_command
from forge_workers.net_security import AddressResolver, fetch_public_https


@dataclass(frozen=True)
class SourceBundle:
    source_url: str
    body: str
    content_type: str
    fetched_at: str
    sha256: str

    @classmethod
    def from_text(
        cls,
        source_url: str,
        body: str,
        *,
        content_type: str = "text/plain",
        fetched_at: str = "2026-06-13T00:00:00Z",
    ) -> "SourceBundle":
        digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
        return cls(source_url, body, content_type, fetched_at, digest)

    def to_json(self) -> dict[str, Any]:
        return asdict(self)


class SourceFetcher(Protocol):
    def fetch(self, source_url: str) -> SourceBundle:
        """Return a captured or live source bundle."""


class CatalogExtractor(Protocol):
    def extract(self, bundle: SourceBundle) -> dict[str, Any]:
        """Return {"canonicalRow": ..., "sourceConflicts": [...]}."""


class GeometryAdapter(Protocol):
    def attach_geometry(self, row: dict[str, Any], bundle: SourceBundle) -> dict[str, Any]:
        """Attach reviewed or fallback geometry metadata to a candidate row."""


class FixtureSourceFetcher:
    def __init__(self, fixtures: Mapping[str, SourceBundle | Mapping[str, Any]]):
        self._fixtures = fixtures

    def fetch(self, source_url: str) -> SourceBundle:
        fixture = self._fixtures[source_url]
        if isinstance(fixture, SourceBundle):
            return fixture
        return SourceBundle(
            source_url=str(fixture["sourceUrl"]),
            body=str(fixture["body"]),
            content_type=str(fixture.get("contentType", "text/plain")),
            fetched_at=str(fixture.get("fetchedAt", "2026-06-13T00:00:00Z")),
            sha256=str(fixture["sha256"]),
        )


class HttpSourceFetcher:
    def __init__(
        self,
        *,
        timeout_s: float = 10.0,
        min_interval_s: float = 1.0,
        max_bytes: int = 2 * 1024 * 1024,
        resolver: AddressResolver | None = None,
        opener: Any | None = None,
    ):
        self.timeout_s = max(1.0, min(float(timeout_s), 120.0))
        self.min_interval_s = max(0.0, min(float(min_interval_s), 60.0))
        self.max_bytes = max(1024, min(int(max_bytes), 8 * 1024 * 1024))
        self.resolver = resolver
        self.opener = opener
        self._last_fetch = 0.0

    def fetch(self, source_url: str) -> SourceBundle:
        now = time.monotonic()
        wait_s = self.min_interval_s - (now - self._last_fetch)
        if wait_s > 0:
            time.sleep(wait_s)
        request = urllib.request.Request(source_url, headers={"User-Agent": "ForgedTTC-catalog-etl/0.1"})
        options: dict[str, Any] = {}
        if self.resolver is not None:
            options["resolver"] = self.resolver
        if self.opener is not None:
            options["opener"] = self.opener
        raw, content_type = fetch_public_https(
            request,
            label="catalog source",
            timeout_s=self.timeout_s,
            max_bytes=self.max_bytes,
            allowed_content_types=("text/*", "application/json", "application/ld+json", "application/xml"),
            **options,
        )
        self._last_fetch = time.monotonic()
        body = raw.decode("utf-8", errors="replace")
        return SourceBundle(
            source_url=source_url,
            body=body,
            content_type=content_type,
            fetched_at=datetime.now(timezone.utc).isoformat(),
            sha256=hashlib.sha256(raw).hexdigest(),
        )


class FixtureClaudeExtractor:
    def __init__(self, extractions: Mapping[str, Mapping[str, Any]]):
        self._extractions = extractions

    def extract(self, bundle: SourceBundle) -> dict[str, Any]:
        extraction = self._extractions.get(bundle.sha256) or self._extractions.get(bundle.source_url)
        if extraction is None:
            raise KeyError(f"no fixture extraction for {bundle.source_url} ({bundle.sha256})")
        return copy.deepcopy(dict(extraction))


class ClaudeExtractionAdapter:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        extractor: Callable[[SourceBundle], Mapping[str, Any]] | None = None,
    ):
        self.api_key = api_key if api_key is not None else os.environ.get("ANTHROPIC_API_KEY")
        self._extractor = extractor

    def extract(self, bundle: SourceBundle) -> dict[str, Any]:
        if self._extractor is not None:
            return copy.deepcopy(dict(self._extractor(bundle)))
        external = run_json_command(
            "FORGE_CLAUDE_EXTRACT_CMD",
            {"task": "etl.extract-component", "sourceBundle": bundle.to_json(), "apiKeyConfigured": bool(self.api_key)},
            timeout_s=900,
        )
        if external is not None:
            return copy.deepcopy(external)
        if not self.api_key:
            raise RuntimeError("Claude extraction requires ANTHROPIC_API_KEY or an injected extractor")
        raise NotImplementedError("live Claude transport is intentionally provided by the deployment adapter")


class EnvelopeOcctAdapter:
    """Deterministic geometry fallback: fit-preserving envelope, no mesh truth."""

    def attach_geometry(self, row: dict[str, Any], bundle: SourceBundle) -> dict[str, Any]:
        next_row = copy.deepcopy(row)
        if "geometry" not in next_row:
            next_row["geometry"] = {
                "kind": "envelope",
                "dims": copy.deepcopy(next_row.get("dims", {})),
                "source": bundle.source_url,
                "confidence": float(next_row.get("confidence", 0.0)),
                "review": "OCCT tessellation not supplied; export degrades to envelope geometry.",
            }
        return next_row


class OcctTessellationAdapter:
    def __init__(self, tessellate: Callable[[dict[str, Any], SourceBundle], Mapping[str, Any]] | None = None):
        self._tessellate = tessellate

    def attach_geometry(self, row: dict[str, Any], bundle: SourceBundle) -> dict[str, Any]:
        next_row = copy.deepcopy(row)
        if self._tessellate is not None:
            geometry = dict(self._tessellate(next_row, bundle))
        else:
            external = run_json_command(
                "FORGE_OCCT_TESSELLATE_CMD",
                {"task": "etl.occt-tessellate", "row": next_row, "sourceBundle": bundle.to_json()},
                timeout_s=1800,
            )
            if external is None:
                raise RuntimeError("OCCT tessellation requires an injected executor or FORGE_OCCT_TESSELLATE_CMD")
            geometry = external
        next_row["geometry"] = copy.deepcopy(geometry)
        return next_row
