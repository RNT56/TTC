from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

import pytest

pytest.importorskip("cmaes")
pytest.importorskip("numpy")
pytest.importorskip("optuna")

import forge_workers.codesign_search as codesign_search
from forge_workers.codesign_search import (
    CMAES_VERSION,
    NONCLAIMS,
    OPTUNA_VERSION,
    PROPOSAL_RUNTIME_AUTHORITY_SCHEMA,
    PROPOSAL_RUNTIME_AUTHORITY_VERSION,
    _proposal_runtime_authority,
    apply_search_patch,
    build_search_plan,
    validate_search_plan,
)

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "examples" / "vx2-mini.forge.json"


def _payload(seed: int = 60) -> dict:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    contract_json = json.dumps(contract, sort_keys=True, separators=(",", ":"))
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    return {
        "task": "codesign.search-plan",
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": "forge-admitted-model-snapshot/1.0.0",
            "modelId": "vx2-mini",
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
        "candidateBudget": 200,
        "seed": seed,
        "constraints": {
            "maxMassG": 850,
            "minEnduranceMin": 8,
            "maxTaskTimeS": 21,
            "minScore": 0.70,
        },
    }


@pytest.fixture(scope="module")
def search_plan() -> tuple[dict, dict]:
    payload = _payload()
    return payload, build_search_plan(payload)


def _stable_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def test_real_pinned_algorithms_produce_exact_mixed_200_proposal_plan(search_plan):
    _payload_value, result = search_plan

    assert result["schemaVersion"] == "forge-codesign-search-plan/2.0.0"
    assert result["source"]["maturity"] == "platform-bound-algorithm-proposal-plan"
    assert result["source"]["dependencyManifestSha256"] == hashlib.sha256(
        (ROOT / "workers" / "pyproject.toml").read_bytes()
    ).hexdigest()
    authority = result["source"]["proposalRuntimeAuthority"]
    assert authority == _proposal_runtime_authority()
    assert result["source"]["resumePolicy"] == "exact-proposal-runtime-authority"
    assert result["source"]["heterogeneousResumeAllowed"] is False
    assert authority["schemaVersion"] == (
        f"{PROPOSAL_RUNTIME_AUTHORITY_SCHEMA}/{PROPOSAL_RUNTIME_AUTHORITY_VERSION}"
    )
    assert result["cacheKey"] == (
        f"codesign.search:v2:{result['source']['baseContractHash'][:16]}:"
        f"{authority['authoritySha256'][:16]}:{result['planSha256'][:16]}"
    )
    assert result["algorithms"]["candidateBudget"] == 200
    assert result["algorithms"]["cmaEs"] == {
        "library": "cmaes",
        "version": CMAES_VERSION,
        "proposals": 100,
        "populationSize": 10,
        "generations": 10,
        "feedback": "bounded-diversity-acquisition-v1",
        "engineFeedback": False,
    }
    assert result["algorithms"]["optunaTpe"] == {
        "library": "optuna",
        "version": OPTUNA_VERSION,
        "proposals": 100,
        "startupTrials": 20,
        "multivariate": False,
        "feedback": "bounded-diversity-acquisition-v1",
        "engineFeedback": False,
    }
    assert len(result["proposals"]) == 200
    assert [proposal["algorithm"] for proposal in result["proposals"]].count("cma-es") == 100
    assert [proposal["algorithm"] for proposal in result["proposals"]].count("optuna-tpe") == 100
    assert {proposal["profile"] for proposal in result["proposals"][100:]} <= {
        "balanced",
        "endurance-prior",
        "agility-prior",
        "lightweight-prior",
    }
    assert result["manifold"]["catalogChoiceSearch"] is False
    assert result["nonclaims"] == NONCLAIMS


def test_every_proposal_reapplies_to_the_exact_snapshot_and_recomputes_lineage(search_plan):
    payload, result = search_plan
    contract = json.loads(payload["modelSnapshot"]["contractJson"])
    candidate_hashes: set[str] = set()
    parameter_rows: set[str] = set()
    for ordinal, proposal in enumerate(result["proposals"]):
        assert proposal["ordinal"] == ordinal
        assert proposal["acquisition"]["physicalObjective"] is False
        assert proposal["acquisition"]["engineFeedback"] is False
        assert all(operation["path"].startswith("/sim/") for operation in proposal["patch"])
        patch_hash = hashlib.sha256(_stable_json(proposal["patch"]).encode("utf-8")).hexdigest()
        candidate = apply_search_patch(contract, proposal["patch"])
        candidate_hash = hashlib.sha256(_stable_json(candidate).encode("utf-8")).hexdigest()
        assert proposal["lineage"] == {
            "patchSha256": patch_hash,
            "candidateSnapshotSha256": candidate_hash,
        }
        candidate_hashes.add(candidate_hash)
        parameter_rows.add(_stable_json(proposal["parameters"]))
    assert len(candidate_hashes) == 200
    assert len(parameter_rows) == 200


def test_plan_exactly_replays_instead_of_trusting_external_bytes(search_plan):
    payload, result = search_plan
    assert validate_search_plan(result, payload) == result

    tampered = copy.deepcopy(result)
    tampered["proposals"][0]["parameters"]["motorKvScale"] = 1.0
    with pytest.raises(ValueError, match="plan hash drifted"):
        validate_search_plan(tampered, payload)

    tampered_nonclaim = copy.deepcopy(result)
    tampered_nonclaim["nonclaims"]["mujocoEvaluated"] = True
    with pytest.raises(ValueError, match="nonclaims drifted"):
        validate_search_plan(tampered_nonclaim, payload)

    tampered_authority = copy.deepcopy(result)
    tampered_authority["source"]["proposalRuntimeAuthority"]["authoritySha256"] = "0" * 64
    with pytest.raises(ValueError, match="runtime authority hash drifted"):
        validate_search_plan(tampered_authority, payload)

    malformed_authority = copy.deepcopy(result)
    malformed_authority["source"]["proposalRuntimeAuthority"]["numpy"][
        "configurationSha256"
    ] = "not-a-digest"
    with pytest.raises(ValueError, match="NumPy configuration must be"):
        validate_search_plan(malformed_authority, payload)


def test_plan_binds_exact_numeric_runtime_and_refuses_foreign_resume(monkeypatch):
    payload = _payload()
    current = _proposal_runtime_authority()
    foreign = copy.deepcopy(current)
    foreign["platform"]["machine"] = f"{current['platform']['machine']}-foreign"
    foreign["authoritySha256"] = hashlib.sha256(
        _stable_json(
            {name: value for name, value in foreign.items() if name != "authoritySha256"}
        ).encode("utf-8")
    ).hexdigest()
    with monkeypatch.context() as context:
        context.setattr(codesign_search, "_proposal_runtime_authority", lambda: foreign)
        foreign_plan = build_search_plan(payload)

    assert foreign_plan["source"]["proposalRuntimeAuthority"] == foreign
    with pytest.raises(ValueError, match="runtime authority does not match this worker"):
        validate_search_plan(foreign_plan, payload)


def test_search_plan_refuses_budget_manifold_and_seed_authority_drift():
    for key, value, message in (
        ("candidateBudget", 199, "exactly 200 proposals"),
        ("candidateBudget", 200.0, "exactly 200 proposals"),
        ("manifold", {}, "caller manifolds are forbidden"),
        ("seed", -1, "seed must be"),
    ):
        payload = _payload()
        payload[key] = value
        with pytest.raises(ValueError, match=message):
            build_search_plan(payload)

    extra = _payload()
    extra["ignored"] = "not-authority"
    with pytest.raises(ValueError, match="input fields are not exact"):
        build_search_plan(extra)


def test_seed_changes_the_plan_without_changing_the_frozen_authority(search_plan):
    _payload_value, first = search_plan
    second = build_search_plan(_payload(seed=61))

    assert first["planSha256"] != second["planSha256"]
    assert first["source"]["baseContractHash"] == second["source"]["baseContractHash"]
    assert first["algorithms"]["cmaEs"]["version"] == second["algorithms"]["cmaEs"]["version"]
    assert first["algorithms"]["optunaTpe"]["version"] == second["algorithms"]["optunaTpe"]["version"]
