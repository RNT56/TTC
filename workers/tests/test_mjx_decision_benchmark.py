import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from forge_workers.mjx_benchmark import CONTROLLED_PROTOCOL, PINNED_VERSIONS
from forge_workers.mjx_decision_benchmark import (
    CASE_AUTHORITY,
    OVERNIGHT_TARGET_SECONDS,
    TIER2_CANDIDATE_COUNT,
    TIER2_TARGET_SECONDS,
    _require_accelerator,
    validate_decision_request,
)

ROOT = Path(__file__).parents[2]
CASE_FILES = {
    "d12-quad": "examples/vx2-mini.forge.json",
    "d12-rover": "workers/tests/fixtures/rover-training.forge.json",
    "legged": "examples/qd-mini.forge.json",
}


def _stable_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha(value):
    return hashlib.sha256(value).hexdigest()


def _request(**overrides):
    revision = "a" * 40
    cases = []
    for morphology, contract_path in CASE_FILES.items():
        contract = json.loads((ROOT / contract_path).read_text())
        contract_json = _stable_json(contract)
        contract_hash = _sha(contract_json.encode())
        authority = dict(CASE_AUTHORITY[morphology])
        authority["authoritySha256"] = _sha(
            (ROOT / authority["authorityPath"]).read_bytes()
        )
        cases.append(
            {
                "morphology": morphology,
                "contractHash": contract_hash,
                "modelSnapshot": {
                    "schemaVersion": "forge-admitted-model-snapshot/1.0.0",
                    "modelId": contract["meta"]["id"],
                    "contractHash": contract_hash,
                    "contractJson": contract_json,
                },
                "authority": authority,
            }
        )
    budget = {
        "artifactKind": "p7-mjx-cpu-budget-evidence",
        "schemaVersion": "1.0.0",
        "sourceRevision": revision,
        "worktreeClean": True,
        "overnightTargetSeconds": OVERNIGHT_TARGET_SECONDS,
        "tier2CandidateCount": TIER2_CANDIDATE_COUNT,
        "tier2TargetSeconds": TIER2_TARGET_SECONDS,
        "measurements": [
            {
                "morphology": case["morphology"],
                "contractSha256": case["contractHash"],
                "trainingRecipe": f"{case['morphology']}-reviewed-v1",
                "cpuHostSku": "cpu-4",
                "cpuHardwareSha256": "e" * 64,
                "cpuBenchmarkProtocolSha256": _sha(
                    _stable_json(CONTROLLED_PROTOCOL).encode()
                ),
                "cpuMujocoStepsPerS": 100_000.0,
                "cpuTrainingWallSeconds": 1000.0,
                "cpuTrainingScorecardPassed": True,
                "cpuTier2WallSeconds": 50_000.0,
                "evidenceArtifactSha256": "b" * 64,
            }
            for case in cases
        ],
    }
    cost = {
        "artifactKind": "p7-mjx-cost-evidence",
        "schemaVersion": "1.0.0",
        "sourceRevision": revision,
        "provider": "reviewed-lab",
        "currency": "USD",
        "retrievedAt": "2026-07-16T00:00:00Z",
        "sourceUrl": "https://example.test/provider-rate",
        "rateOrReceiptSha256": "c" * 64,
        "cpuHost": {
            "sku": "cpu-4",
            "backend": "cpu",
            "deviceKind": "x86_64 4 vCPU",
            "usdPerHour": 0.2,
        },
        "acceleratorHost": {
            "sku": "gpu-l4",
            "backend": "gpu",
            "deviceKind": "NVIDIA L4",
            "usdPerHour": 1.0,
        },
    }
    payload = {
        "artifactKind": "mjxDecisionRequest",
        "schemaVersion": "2.0.0",
        "task": "sim.mjx-benchmark",
        "sourceRevision": revision,
        "requestSha256": "0" * 64,
        "worktreeClean": True,
        "maturity": "sandbox",
        "cases": cases,
        "protocol": dict(CONTROLLED_PROTOCOL),
        "runtimePins": dict(PINNED_VERSIONS),
        "requiredAccelerator": {
            "backend": "gpu",
            "deviceKind": "NVIDIA L4",
            "fallbackForbidden": True,
            "precision": "float64",
        },
        "budgetEvidence": budget,
        "costEvidence": cost,
    }
    payload.update(overrides)
    if "requestSha256" not in overrides:
        body = {
            key: value
            for key, value in payload.items()
            if key not in {"sourceRevision", "requestSha256"}
        }
        payload["requestSha256"] = _sha(_stable_json(body).encode())
    return payload


def test_decision_request_binds_three_proxy_contracts_budget_and_cost(monkeypatch):
    monkeypatch.chdir(ROOT)
    request = _request()

    assert validate_decision_request(request)["cases"][0]["morphology"] == "d12-quad"


def test_decision_request_rejects_d12_exactness_and_authority_drift(monkeypatch):
    monkeypatch.chdir(ROOT)
    request = _request()
    request["cases"][0]["authority"]["exactHardwareTwin"] = True
    with pytest.raises(ValueError, match="exactHardwareTwin drifted"):
        validate_decision_request(request)

    request = _request()
    request["cases"][1]["authority"]["authoritySha256"] = "0" * 64
    with pytest.raises(ValueError, match="authority hash drifted"):
        validate_decision_request(request)


def test_decision_request_rejects_missing_case_and_budget_substitution(monkeypatch):
    monkeypatch.chdir(ROOT)
    request = _request()
    request["cases"] = request["cases"][:2]
    with pytest.raises(ValueError, match="exact ordered"):
        validate_decision_request(request)

    request = _request()
    request["budgetEvidence"]["measurements"][1]["contractSha256"] = "0" * 64
    with pytest.raises(ValueError, match="budget contract hash drifted"):
        validate_decision_request(request)

    request = _request()
    request["budgetEvidence"]["measurements"][2]["cpuBenchmarkProtocolSha256"] = "0" * 64
    with pytest.raises(ValueError, match="CPU benchmark protocol hash drifted"):
        validate_decision_request(request)


def test_decision_request_rejects_metal_and_cost_mismatch(monkeypatch):
    monkeypatch.chdir(ROOT)
    request = _request()
    request["requiredAccelerator"]["backend"] = "metal"
    request["costEvidence"]["acceleratorHost"]["backend"] = "metal"
    with pytest.raises(ValueError, match="CPU and Metal are forbidden"):
        validate_decision_request(request)

    request = _request()
    request["costEvidence"]["acceleratorHost"]["deviceKind"] = "NVIDIA A10G"
    with pytest.raises(ValueError, match="does not match requiredAccelerator"):
        validate_decision_request(request)

    request = _request()
    request["budgetEvidence"]["measurements"][0]["cpuHostSku"] = "different-cpu"
    with pytest.raises(ValueError, match="CPU benchmark host does not match"):
        validate_decision_request(request)


def test_decision_request_rejects_hash_and_source_drift(monkeypatch):
    monkeypatch.chdir(ROOT)
    with pytest.raises(ValueError, match="requestSha256"):
        validate_decision_request(_request(requestSha256="0" * 64))

    request = _request()
    request["budgetEvidence"]["sourceRevision"] = "d" * 40
    with pytest.raises(ValueError, match="clean benchmark source revision"):
        validate_decision_request(request)


def test_accelerator_resolution_forbids_fallback_and_wrong_device():
    required = {
        "backend": "gpu",
        "deviceKind": "NVIDIA L4",
        "fallbackForbidden": True,
        "precision": "float64",
    }
    devices = [{"platform": "gpu", "kind": "NVIDIA L4", "id": 0}]
    assert _require_accelerator(required, SimpleNamespace(default_backend=lambda: "gpu"), devices) == "gpu"

    with pytest.raises(RuntimeError, match="resolved as cpu"):
        _require_accelerator(required, SimpleNamespace(default_backend=lambda: "cpu"), devices)
    with pytest.raises(RuntimeError, match="device kind"):
        _require_accelerator(
            required,
            SimpleNamespace(default_backend=lambda: "gpu"),
            [{"platform": "gpu", "kind": "NVIDIA A10G", "id": 0}],
        )
