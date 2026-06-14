import sys

import pytest

from forge_workers.etl.adapters import (
    ClaudeExtractionAdapter,
    EnvelopeOcctAdapter,
    FixtureClaudeExtractor,
    FixtureSourceFetcher,
    OcctTessellationAdapter,
    SourceBundle,
)
from forge_workers.etl.ingest import ingest_payload, ingest_with_adapters
from test_citations import full_citations, motor_row


def cited_row():
    row = motor_row()
    row["dims"] = {"xMm": 28.0, "yMm": 28.0, "zMm": 17.0}
    row["citations"] = {
        c.field_path: {"value": "fixture text", "sources": [c.source_url], "accessed": "2026-06-13"}
        for c in full_citations()
    }
    return row


def test_fixture_fetch_extract_geometry_path_is_deterministic():
    bundle = SourceBundle.from_text("fixture://motor-x2207", "ExampleCo X2207 captured source")
    row = cited_row()
    fetcher = FixtureSourceFetcher({"fixture://motor-x2207": bundle})
    extractor = FixtureClaudeExtractor(
        {
            bundle.sha256: {
                "canonicalRow": row,
                "sourceConflicts": ["retailer current rating differs from datasheet"],
            }
        }
    )

    out = ingest_with_adapters(
        "fixture://motor-x2207",
        fetcher=fetcher,
        extractor=extractor,
        geometry_adapter=EnvelopeOcctAdapter(),
    )

    assert out["sourceBundle"]["sha256"] == bundle.sha256
    assert out["row"]["geometry"]["kind"] == "envelope"
    assert out["needsReview"]
    assert any("source conflict" in record["reason"] for record in out["reviewQueue"])
    assert row.get("geometry") is None, "fixture rows must not be mutated by adapters"


def test_injected_claude_adapter_can_emit_canonical_rows():
    bundle = SourceBundle.from_text("fixture://motor-x2207", "captured source")
    adapter = ClaudeExtractionAdapter(
        extractor=lambda source: {"canonicalRow": cited_row(), "sourceConflicts": [source.sha256]}
    )

    extraction = adapter.extract(bundle)

    assert extraction["canonicalRow"]["id"] == "cmp_motor_example-x2207"
    assert extraction["sourceConflicts"] == [bundle.sha256]


def test_claude_adapter_requires_key_or_injection(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    bundle = SourceBundle.from_text("fixture://motor-x2207", "captured source")

    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        ClaudeExtractionAdapter().extract(bundle)


def test_occt_adapter_requires_injected_executor():
    bundle = SourceBundle.from_text("fixture://motor-x2207", "captured source")

    with pytest.raises(RuntimeError, match="OCCT"):
        OcctTessellationAdapter().attach_geometry(cited_row(), bundle)


def test_injected_occt_adapter_attaches_geometry():
    bundle = SourceBundle.from_text("fixture://motor-x2207", "captured source")
    adapter = OcctTessellationAdapter(
        lambda _row, source: {"kind": "mesh-lod", "source": source.source_url, "lods": [0, 1, 2]}
    )

    row = adapter.attach_geometry(cited_row(), bundle)

    assert row["geometry"]["kind"] == "mesh-lod"
    assert row["geometry"]["lods"] == [0, 1, 2]


def test_handler_payload_can_use_source_extraction_and_geometry_adapters():
    row = cited_row()
    out = ingest_payload(
        {
            "sourceUrl": "fixture://motor-x2207",
            "sourceBundle": {"body": "ExampleCo X2207 captured source"},
            "extraction": {"canonicalRow": row, "sourceConflicts": []},
            "geometry": {"kind": "mesh-lod", "lods": [0, 1, 2]},
        }
    )

    assert out["row"]["geometry"]["kind"] == "mesh-lod"
    assert out["sourceBundle"]["source_url"] == "fixture://motor-x2207"
    assert not out["needsReview"]


def test_command_backed_claude_adapter(monkeypatch, tmp_path):
    script = tmp_path / "extract.py"
    script.write_text(
        "import json, sys\n"
        "payload = json.load(sys.stdin)\n"
        "print(json.dumps({'canonicalRow': {'id': payload['sourceBundle']['sha256']}, 'sourceConflicts': []}))\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("FORGE_CLAUDE_EXTRACT_CMD", f"{sys.executable} {script}")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    bundle = SourceBundle.from_text("fixture://motor-x2207", "captured source")
    extraction = ClaudeExtractionAdapter().extract(bundle)

    assert extraction["canonicalRow"]["id"] == bundle.sha256


def test_command_backed_occt_adapter(monkeypatch, tmp_path):
    script = tmp_path / "occt.py"
    script.write_text(
        "import json, sys\n"
        "payload = json.load(sys.stdin)\n"
        "print(json.dumps({'kind': 'mesh-lod', 'source': payload['sourceBundle']['source_url'], 'lods': [0, 1]}))\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("FORGE_OCCT_TESSELLATE_CMD", f"{sys.executable} {script}")
    bundle = SourceBundle.from_text("fixture://motor-x2207", "captured source")

    row = OcctTessellationAdapter().attach_geometry(cited_row(), bundle)

    assert row["geometry"]["kind"] == "mesh-lod"
    assert row["geometry"]["source"] == "fixture://motor-x2207"
