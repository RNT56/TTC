from forge_workers.etl.citations import Citation, check_citations
from forge_workers.etl.ingest import ingest_fixture


def motor_row():
    return {
        "id": "cmp_motor_example-x2207",
        "brand": "ExampleCo",
        "model": "X2207",
        "category": "motor",
        "massG": 32.4,
        "elec": {"kv": 1750, "vMin": 11.1, "vMax": 25.2, "maxCurrentA": 38.0},
        "mech": {"mountPattern": "motor-16x16-M3", "propShaft": "prop-shaft-M5"},
        "license": {
            "id": "lic_exampleco_datasheet",
            "class": "open",
            "terms": "public datasheet",
            "sourceUrl": "https://example.com/datasheet.pdf",
            "exportPolicy": "full-geometry-ok",
        },
        "prices": [
            {
                "vendor": "Example Store",
                "sku": "X2207-1750",
                "url": "https://example.com/x2207",
                "amount": 19.99,
                "currency": "USD",
                "fetchedAt": "2026-06-13",
                "region": "US",
                "purchasable": True,
            }
        ],
        "confidence": 0.97,
    }


def full_citations():
    url = "https://example.com/datasheet.pdf"
    return [
        Citation("massG", url, "fixture-etl", 0.97),
        Citation("elec.kv", url, "fixture-etl", 0.99),
        Citation("elec.vMin", url, "fixture-etl", 0.99),
        Citation("elec.vMax", url, "fixture-etl", 0.99),
        Citation("elec.maxCurrentA", url, "fixture-etl", 0.99),
        Citation("mech.mountPattern", url, "fixture-etl", 0.95),
        Citation("mech.propShaft", url, "fixture-etl", 0.95),
        Citation("license", url, "fixture-etl", 0.97),
        Citation("prices", url, "fixture-etl", 0.97),
    ]


def test_fully_cited_row_publishes():
    verdict = check_citations("motor", motor_row(), full_citations())
    assert verdict.publishable, verdict.problems
    assert not verdict.needs_review


def test_uncited_field_blocks_publication():
    cites = [c for c in full_citations() if c.field_path != "elec.kv"]
    verdict = check_citations("motor", motor_row(), cites)
    assert not verdict.publishable
    assert any("uncited field: elec.kv" in p for p in verdict.problems)


def test_missing_license_is_non_optional_d10():
    row = motor_row()
    row.pop("license")
    verdict = check_citations("motor", row, full_citations())
    assert not verdict.publishable
    assert any("D10" in p for p in verdict.problems)


def test_low_confidence_goes_to_review():
    cites = full_citations()
    cites[0] = Citation("massG", cites[0].source_url, "fixture-etl", 0.4)
    verdict = check_citations("motor", motor_row(), cites)
    assert verdict.needs_review
    assert not verdict.publishable


def test_missing_price_blocks_p3_bom_publication():
    row = motor_row()
    row["prices"] = []
    verdict = check_citations("motor", row, full_citations())
    assert not verdict.publishable
    assert any("price" in p for p in verdict.problems)


def test_fixture_ingest_emits_review_queue_for_low_confidence_row():
    row = motor_row()
    row["confidence"] = 0.7
    row["review"] = "owner verification required"
    row["citations"] = {
        c.field_path: {
            "value": "quoted",
            "sources": [c.source_url],
            "accessed": "2026-06-13",
        }
        for c in full_citations()
    }
    out = ingest_fixture({"canonicalRow": row})
    assert out["needsReview"]
    assert out["reviewQueue"]
    assert out["reviewQueue"][0]["artifact_id"] == row["id"]


def test_queue_registry_dispatch():
    from forge_workers.queue import HandlerRegistry, Job

    reg = HandlerRegistry()

    @reg.register("etl.ingest-component")
    def _handle(job: Job):
        return {"ok": True, "task": job.task}

    out = reg.dispatch(Job(id="1", task="etl.ingest-component", payload={}, idempotency_key="k"))
    assert out == {"ok": True, "task": "etl.ingest-component"}
    try:
        reg.dispatch(Job(id="2", task="nope", payload={}, idempotency_key="k"))
        raise AssertionError("unknown task must raise")
    except KeyError:
        pass
