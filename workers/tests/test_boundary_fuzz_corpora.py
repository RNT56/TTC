"""QA-007 governed replay/provider/citation/export/hardware boundary corpora."""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Any, Callable

import pytest

from forge_workers.bridge import compile_config_diff, ingest_telemetry, supervisor_check
from forge_workers.etl.adapters import _parse_catalog_row_json
from forge_workers.etl.citations import Citation, check_citations
from forge_workers.license_exports import build_license_export_manifest
from forge_workers.replay import verify_replay


ROOT = Path(__file__).resolve().parents[2]
CORPUS_DIR = ROOT / "evals" / "fuzz" / "boundaries"


def _corpus(name: str) -> dict[str, Any]:
    value = json.loads((CORPUS_DIR / f"{name}.json").read_text(encoding="utf-8"))
    assert value["version"] == "forge-boundary-fuzz.v1"
    assert value["surface"] == name
    assert len(value["cases"]) >= 8
    return value


def _materialize(value: Any) -> Any:
    if isinstance(value, list):
        return [_materialize(entry) for entry in value]
    if not isinstance(value, dict):
        return value
    if set(value) == {"$number"}:
        return {
            "nan": math.nan,
            "infinity": math.inf,
            "-infinity": -math.inf,
        }[value["$number"]]
    return {key: _materialize(entry) for key, entry in value.items()}


def _pointer_parent(document: Any, pointer: str) -> tuple[Any, str]:
    assert pointer.startswith("/")
    parts = [part.replace("~1", "/").replace("~0", "~") for part in pointer[1:].split("/")]
    parent = document
    for part in parts[:-1]:
        parent = parent[int(part)] if isinstance(parent, list) else parent[part]
    return parent, parts[-1]


def _mutate(document: Any, mutation: Any) -> Any:
    if mutation is None:
        return document
    parent, key = _pointer_parent(document, mutation["path"])
    if mutation.get("$delete") is True:
        if isinstance(parent, list):
            parent.pop(int(key))
        else:
            parent.pop(key)
    else:
        value = _materialize(mutation["value"])
        if isinstance(parent, list):
            parent[int(key)] = value
        else:
            parent[key] = value
    return document


def _assert_error(test_case: dict[str, Any], call: Callable[[], Any]) -> None:
    with pytest.raises((RuntimeError, ValueError)) as caught:
        call()
    fragment = test_case["expect"].get("contains")
    if fragment:
        assert fragment in str(caught.value), (test_case["id"], caught.value)


def test_replay_boundary_corpus_matches_worker_outcomes():
    corpus = _corpus("replay")
    for test_case in corpus["cases"]:
        raw = _materialize(test_case["input"])
        tape = {
            "schemaVersion": raw["schemaVersion"],
            "frames": [{"t": timestamp} for timestamp in raw["timestamps"]],
        }

        def run():
            return verify_replay(
                {"tape": tape, **({"expectedHash": raw["expectedHash"]} if "expectedHash" in raw else {})}
            )

        if test_case["expect"]["outcome"] == "accept":
            assert run()["verified"], test_case["id"]
            continue
        try:
            result = run()
        except (RuntimeError, ValueError) as error:
            fragment = test_case["expect"].get("contains")
            if fragment:
                assert fragment in str(error), (test_case["id"], error)
        else:
            assert not result["verified"], test_case["id"]
            fragment = test_case["expect"].get("contains")
            if fragment:
                assert fragment in str(result["rejectReason"]), test_case["id"]
    _assert_error(
        {"id": "replay-extreme-integer", "expect": {"contains": "finite numeric"}},
        lambda: verify_replay(
            {"tape": {"schemaVersion": "1.0.0", "frames": [{"t": 10**400}]}}
        ),
    )


def test_provider_output_boundary_corpus_matches_parser_outcomes():
    corpus = _corpus("provider-output")
    for test_case in corpus["cases"]:
        input_value = test_case["input"]
        if "rawCanonicalRowJson" in input_value:
            raw = input_value["rawCanonicalRowJson"]
        else:
            row = _materialize(copy.deepcopy(corpus["fixture"]))
            if "generator" in input_value:
                cursor = row
                for index in range(input_value["generator"]["depth"]):
                    cursor["extra"] = {"index": index}
                    cursor = cursor["extra"]
            else:
                _mutate(row, input_value.get("mutation"))
            raw = json.dumps(row, separators=(",", ":"))
        if test_case["expect"]["outcome"] == "accept":
            assert _parse_catalog_row_json(raw)["id"] == corpus["fixture"]["id"]
        else:
            _assert_error(test_case, lambda raw=raw: _parse_catalog_row_json(raw))


def test_catalog_citation_boundary_corpus_matches_publication_outcomes():
    corpus = _corpus("catalog-citations")
    for test_case in corpus["cases"]:
        value = _materialize(copy.deepcopy(corpus["fixture"]))
        _mutate(value, test_case["input"].get("mutation"))
        citations = [
            Citation(
                field_path=entry["fieldPath"],
                source_url=entry["sourceUrl"],
                extractor=entry["extractor"],
                confidence=entry["confidence"],
            )
            for entry in value["citations"]
        ]
        verdict = check_citations(value["category"], value["row"], citations)
        expected = test_case["expect"]
        assert verdict.publishable is (expected["outcome"] == "accept"), test_case["id"]
        if "publishable" in expected:
            assert verdict.publishable is expected["publishable"]
        if "needsReview" in expected:
            assert verdict.needs_review is expected["needsReview"]
        if expected.get("contains"):
            assert expected["contains"] in " | ".join(verdict.problems), test_case["id"]
    extreme = copy.deepcopy(corpus["fixture"])
    extreme["row"]["confidence"] = 10**400
    verdict = check_citations(
        extreme["category"],
        extreme["row"],
        [
            Citation(
                field_path=entry["fieldPath"],
                source_url=entry["sourceUrl"],
                extractor=entry["extractor"],
                confidence=entry["confidence"],
            )
            for entry in extreme["citations"]
        ],
    )
    assert not verdict.publishable and verdict.needs_review
    assert "invalid confidence values" in " | ".join(verdict.problems)


def _catalog_grid_row(fixture: dict[str, Any], shape: str) -> dict[str, Any]:
    row = copy.deepcopy(fixture)
    if shape == "current":
        return row
    if shape not in {"legacy-markerless", "legacy-explicit"}:
        raise AssertionError(f"unknown catalog grid shape {shape}")
    if shape == "legacy-markerless":
        row.pop("schemaVersion")
    else:
        row["schemaVersion"] = "1.0.0"
    table = row["thrustTables"][0]
    table["voltage"] = 25.2
    table["points"] = table["points"][:2]
    for point in table["points"]:
        point.pop("voltage")
    return row


def test_catalog_performance_grid_corpus_matches_etl_parser_outcomes():
    corpus = _corpus("catalog-performance-grid")
    for test_case in corpus["cases"]:
        value = _catalog_grid_row(corpus["fixture"], test_case["input"]["shape"])
        if "mutation" in test_case["input"]:
            _mutate(value, test_case["input"]["mutation"])
        for mutation in test_case["input"].get("mutations", []):
            _mutate(value, mutation)
        raw = json.dumps(value, separators=(",", ":"))
        if test_case["expect"]["outcome"] == "reject":
            _assert_error(test_case, lambda raw=raw: _parse_catalog_row_json(raw))
            continue
        parsed = _parse_catalog_row_json(raw)
        version = parsed.get("schemaVersion", "1.0.0")
        assert version == test_case["expect"]["schemaVersion"], test_case["id"]
        table = parsed["thrustTables"][0]
        voltages = [point.get("voltage", table.get("voltage")) for point in table["points"]]
        assert [min(voltages), max(voltages)] == test_case["expect"]["voltageRangeV"]


def test_export_policy_boundary_corpus_matches_d10_outcomes():
    corpus = _corpus("export-policy")
    for test_case in corpus["cases"]:
        input_value = test_case["input"]
        payload = _materialize(copy.deepcopy(corpus["fixtures"][input_value["fixture"]]))
        _mutate(payload, input_value.get("mutation"))
        source = payload.get("assetRef", "obj://qa007-assembly")

        def run():
            return build_license_export_manifest(payload, source)

        if test_case["expect"]["outcome"] == "accept":
            result = run()
            assert result["assemblyPolicy"] == test_case["expect"]["assemblyPolicy"]
        else:
            _assert_error(test_case, run)


def test_hardware_payload_boundary_corpus_matches_fail_closed_outcomes():
    corpus = _corpus("hardware-payloads")
    operations = {
        "config-diff": compile_config_diff,
        "telemetry": ingest_telemetry,
        "supervisor": supervisor_check,
    }
    for test_case in corpus["cases"]:
        input_value = _materialize(test_case["input"])
        run = lambda: operations[input_value["operation"]](input_value["payload"])
        expected = test_case["expect"]
        if expected["outcome"] == "reject":
            _assert_error(test_case, run)
            continue
        result = run()
        if "frameCount" in expected:
            assert result["frameCount"] == expected["frameCount"]
        if "allowPolicy" in expected:
            assert result["allowPolicy"] is expected["allowPolicy"]
        if input_value["operation"] == "config-diff":
            assert result["schemaVersion"] == "forge-bridge-config/1.0.0"
            assert result["requiresPhysicalConfirmation"] is True
            assert result["noAutoArm"] is True
            assert result["lines"][-1] == "save"
    _assert_error(
        {"id": "hardware-extreme-rate", "expect": {"contains": "2 through 200"}},
        lambda: compile_config_diff(
            {
                "firmware": "betaflight",
                "mixer": "quadx",
                "rates": {"failsafe_delay": 10**400},
            }
        ),
    )
    _assert_error(
        {"id": "hardware-extreme-limit", "expect": {"contains": "must be finite"}},
        lambda: supervisor_check(
            {"config": {"maxRateRadS": 10**400}, "state": {}}
        ),
    )
