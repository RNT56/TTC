from forge_workers.etl.citations import Citation, check_citations


def motor_row():
    return {
        "brand": "ExampleCo",
        "model": "X2207",
        "rev": "v2",
        "mass_g": 32.4,
        "elec": {"kv": 1750},
        "mech": {"mount_pattern": "motor-mount-16x16-M3"},
        "license_id": "lic_exampleco_datasheet",
    }


def full_citations():
    return [
        Citation("mass_g", "https://example.com/datasheet.pdf", "claude-etl", 0.97),
        Citation("elec.kv", "https://example.com/datasheet.pdf", "claude-etl", 0.99),
        Citation("mech.mount_pattern", "https://example.com/datasheet.pdf", "claude-etl", 0.95),
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
    row.pop("license_id")
    verdict = check_citations("motor", row, full_citations())
    assert not verdict.publishable
    assert any("D10" in p for p in verdict.problems)


def test_low_confidence_goes_to_review():
    cites = full_citations()
    cites[0] = Citation("mass_g", cites[0].source_url, "claude-etl", 0.4)
    verdict = check_citations("motor", motor_row(), cites)
    assert verdict.needs_review
    assert not verdict.publishable


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
