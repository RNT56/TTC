from __future__ import annotations

import copy
import hashlib
from pathlib import Path

import pytest

pytest.importorskip("gymnasium")
pytest.importorskip("mujoco")
pytest.importorskip("numpy")

from forge_workers.codesign import validate_external_result
from forge_workers.codesign_runtime import evaluate

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "examples" / "vx2-mini.forge.json"


def _payload() -> dict:
    contract_json = CONTRACT.read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    return {
        "task": "codesign.evaluate",
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": "forge-admitted-model-snapshot/1.0.0",
            "modelId": "vx2-mini",
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
        "candidateBudget": 3,
        "seed": 59,
    }


@pytest.fixture(scope="module")
def engine_result() -> tuple[dict, dict]:
    validator = ROOT / "target" / "debug" / "forge-validate"
    if not validator.is_file():
        pytest.skip("forge-validate debug binary is not built")
    payload = _payload()
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("FORGE_VALIDATE_BIN", str(validator))
        result = evaluate(payload)
    return payload, result


def test_engine_runtime_binds_real_native_rapier_and_mujoco_evidence(engine_result):
    payload, result = engine_result
    assert validate_external_result(result, payload) == result
    assert result["schemaVersion"] == "forge-codesign-evaluation/1.0.0"
    assert result["benchmark"]["engineBacked"] is True
    assert result["benchmark"]["controlledSmoke"] is True
    assert result["benchmark"]["overnightComplete"] is False
    assert len(result["candidates"]) == 3
    assert len([candidate for candidate in result["candidates"] if candidate["admitted"]]) >= 2
    assert result["pareto"]
    for candidate in result["candidates"]:
        assert candidate["nativeEvaluation"]["candidateSnapshotSha256"] == candidate["lineage"]["candidateSnapshotSha256"]
        assert candidate["evaluations"]["tier3"]["evaluated"] is False
        assert candidate["evaluations"]["tier3"]["held"] is True
    for candidate in result["candidates"]:
        if not candidate["admitted"]:
            continue
        assert candidate["evaluations"]["tier0"]["engineBacked"] is True
        assert candidate["evaluations"]["tier1"]["engine"] == "rapier3d/0.33.0"
        assert candidate["evaluations"]["tier2"]["engine"] == "mujoco/3.9.0"
        assert candidate["evaluations"]["tier2"]["evidence"]["trainedPolicy"] is False
        assert candidate["evaluations"]["tier2"]["evidence"]["estimatorOnly"] is True


def test_worker_recomputes_patch_and_native_hashes_instead_of_trusting_external_result(engine_result):
    payload, result = engine_result
    tampered_patch = copy.deepcopy(result)
    tampered_patch["candidates"][0]["patch"][0]["value"] = "tampered"
    with pytest.raises(ValueError, match="lineage drifted"):
        validate_external_result(tampered_patch, payload)

    tampered_native = copy.deepcopy(result)
    tampered_native["candidates"][0]["nativeEvaluation"]["tier1"]["trajectorySha256"] = "0" * 64
    with pytest.raises(ValueError, match="lineage drifted"):
        validate_external_result(tampered_native, payload)


def test_worker_rejects_control_plane_and_benchmark_drift(engine_result):
    payload, result = engine_result
    for path, value, message in (
        (("source", "runtime"), "unreviewed/9.9.9", "source drifted"),
        (("manifold", "catalogChoiceSearch"), True, "manifold or constraints drifted"),
        (("constraints", "minScore"), 0.1, "manifold or constraints drifted"),
        (("optimizer", "algorithm"), "cma-es", "optimizer budget drifted"),
        (("benchmark", "tier0MaxMs"), 0, "benchmark tier count drifted"),
    ):
        tampered = copy.deepcopy(result)
        tampered[path[0]][path[1]] = value
        with pytest.raises(ValueError, match=message):
            validate_external_result(tampered, payload)

    tampered_verdict = copy.deepcopy(result)
    tampered_verdict["candidates"][0]["evaluations"]["tier2"]["pass"] = False
    tampered_verdict["candidates"][0]["admitted"] = False
    tampered_verdict["candidates"][0]["admission"]["pass"] = False
    with pytest.raises(ValueError, match="tier2 verdict drifted"):
        validate_external_result(tampered_verdict, payload)


def test_controlled_runtime_refuses_to_masquerade_as_the_overnight_optimizer(monkeypatch):
    validator = ROOT / "target" / "debug" / "forge-validate"
    if not validator.is_file():
        pytest.skip("forge-validate debug binary is not built")
    payload = _payload()
    payload["candidateBudget"] = 200
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(validator))
    with pytest.raises(ValueError, match="separately evidenced overnight optimizer"):
        evaluate(payload)

    payload["candidateBudget"] = 3.0
    with pytest.raises(ValueError, match="candidateBudget must be an integer"):
        evaluate(payload)


def test_controlled_candidate_identity_and_engine_trajectory_are_seed_stable(engine_result, monkeypatch):
    payload, first = engine_result
    validator = ROOT / "target" / "debug" / "forge-validate"
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(validator))
    second = evaluate(payload)

    assert [candidate["lineage"]["candidateSnapshotSha256"] for candidate in first["candidates"]] == [
        candidate["lineage"]["candidateSnapshotSha256"] for candidate in second["candidates"]
    ]
    assert [candidate["nativeEvaluation"].get("tier1", {}).get("trajectorySha256") for candidate in first["candidates"]] == [
        candidate["nativeEvaluation"].get("tier1", {}).get("trajectorySha256") for candidate in second["candidates"]
    ]
    assert [
        candidate["evaluations"]["tier2"].get("evidence", {}).get("rolloutSha256")
        if candidate["evaluations"]["tier2"].get("evidence")
        else None
        for candidate in first["candidates"]
    ] == [
        candidate["evaluations"]["tier2"].get("evidence", {}).get("rolloutSha256")
        if candidate["evaluations"]["tier2"].get("evidence")
        else None
        for candidate in second["candidates"]
    ]
