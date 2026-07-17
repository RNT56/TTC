from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

import pytest

pytest.importorskip("cmaes")
pytest.importorskip("gymnasium")
pytest.importorskip("mujoco")
pytest.importorskip("numpy")
pytest.importorskip("optuna")

import forge_workers.codesign_search as codesign_search
from forge_workers.codesign_batch import (
    _candidate_expected,
    _checkpoint_payload,
    _refresh,
    advance_batch,
    validate_checkpoint,
)
from forge_workers.codesign_runtime import _sha, _stable_json
from forge_workers.codesign_search import _proposal_runtime_authority, build_search_plan
from forge_workers.training.tasks import task_definition

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "examples" / "vx2-proof.forge.json"


def _payload() -> dict:
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))
    contract_json = json.dumps(contract, sort_keys=True, separators=(",", ":"))
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    search = {
        "task": "codesign.search-plan",
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": "forge-admitted-model-snapshot/1.0.0",
            "modelId": "vx2-proof",
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
        "candidateBudget": 200,
        "seed": 60,
        "constraints": {
            "maxMassG": 850,
            "minEnduranceMin": 8,
            "maxTaskTimeS": 21,
            "minScore": 0.70,
        },
    }
    return {**search, "task": "codesign.engine-batch", "searchPlan": build_search_plan(search)}


@pytest.fixture(scope="module")
def batch_payload() -> dict:
    return _payload()


def _fake_evaluator(snapshot: dict, contract: dict, plan: dict, proposal: dict) -> dict:
    ordinal = proposal["ordinal"]
    candidate_hash = proposal["lineage"]["candidateSnapshotSha256"]
    choice = proposal["catalogChoice"]
    catalog_authority = plan["source"]["catalogChoiceAuthority"]
    native = {
        "schemaVersion": "forge-codesign-native-evaluation/2.0.0",
        "artifactKind": "codesignNativeEvaluation",
        "candidateSnapshotSha256": candidate_hash,
        "passed": True,
        "tier0": {
            "engine": "forge-validate-native",
            "engineBacked": True,
            "passed": True,
            "runtimeMs": 8,
            "hud": {
                "auwG": 479,
                "enduranceMin": round(30.0 - ordinal * 0.05, 6),
            },
        },
        "tier1": {
            "engine": "rapier3d/0.33.0",
            "engineBacked": True,
            "passed": True,
            "steps": 120,
            "substeps": 2,
            "simulatedDurationS": 1.0,
            "trajectorySha256": hashlib.sha256(f"rapier:{ordinal}".encode()).hexdigest(),
        },
        "catalogProof": {
            "schemaVersion": "forge-codesign-catalog-proof/1.0.0",
            "catalogAuthoritySha256": catalog_authority["catalogAuthoritySha256"],
            "resolutionComplete": True,
            "equippedComponents": [
                {
                    "slotId": choice["slotId"],
                    "variantId": choice["choiceId"],
                    "componentRef": choice["componentRef"],
                    "exactRevision": choice["exactRevision"],
                    "componentId": choice["componentId"],
                    "category": choice["category"],
                    "rowSha256": choice["rowSha256"],
                    "massG": choice["massG"],
                    "capacityMah": choice["capacityMah"],
                    "maxDischargeA": choice["maxDischargeA"],
                    "confidence": choice["confidence"],
                    "reviewRequired": choice["reviewRequired"],
                    "review": choice["review"],
                    "license": choice["license"],
                }
            ],
            "marketplacePublicationReviewed": False,
            "marketplaceExposable": False,
        },
        "nonclaims": {
            "mujocoEvaluated": False,
            "trainedPolicyEvaluated": False,
            "buildReady": False,
            "hardwareAuthority": False,
            "fieldEvidence": False,
        },
    }
    task = task_definition("hover-hold")
    rollout = {
        "engine": "mujoco/3.9.0",
        "engineBacked": True,
        "controller": "forge-estimator-teacher-v1",
        "trainedPolicy": False,
        "estimatorOnly": True,
        "task": {"id": task["id"], "version": task["version"], "definitionHash": task["definitionHash"]},
        "episodes": 2,
        "stepsPerEpisode": 200,
        "controlPeriodS": 0.02,
        "simulatedDurationS": 8.0,
        "successRate": 1.0,
        "meanSuccessFraction": round(0.70 + ordinal / 1000.0, 6),
        "meanEnergyWh": round(0.04 + ordinal / 1_000_000.0, 12),
        "meanReward": 1.0,
        "meanTimeToFirstSuccessS": 1.0,
        "unsafeEpisodes": 0,
        "meanFinalPositionErrorM": 0.1,
        "rolloutSha256": hashlib.sha256(f"mujoco:{ordinal}".encode()).hexdigest(),
        "trainingAuthority": {
            "schemaVersion": "forge-codesign-training-authority/2.0.0",
            "trainingBundleSchema": "4.0.0",
            "trainingBundleSha256": hashlib.sha256(
                f"training-bundle:{ordinal}".encode()
            ).hexdigest(),
            "catalogPhysicsSchema": "forge-training-catalog-physics/2.0.0",
            "catalogPhysicsSha256": hashlib.sha256(
                f"catalog-physics:{ordinal}".encode()
            ).hexdigest(),
            "catalogAuthoritySha256": catalog_authority["catalogAuthoritySha256"],
            "massKg": 0.769,
            "catalogNativeMassInertia": True,
            "catalogBenchTableAuthority": True,
            "catalogBenchGridRetained": True,
            "catalogBenchTableUsed": False,
            "catalogCurveReadbackSchema": (
                "forge-training-catalog-curve-readback/1.0.0"
            ),
            "catalogCurveReadbackVerified": False,
            "powertrainModel": (
                "catalog-motor-battery-analytic-fallback-rejected-bench-table-v1"
            ),
            "inlineFallbacks": [
                "sim.battery.rIntMohm",
                "sim.motors[].rIntMohm",
                "sim.motors[].maxCurrentA",
                "sim.props[0].diameterIn,pitchIn,blades",
                "forge-sim.DEFAULT_CT",
            ],
        },
    }
    return _candidate_expected(
        snapshot,
        contract,
        plan,
        proposal,
        native,
        10.0 + ordinal / 1000.0,
        rollout,
        20.0 + ordinal / 1000.0,
    )


def test_exact_200_candidate_batch_pauses_cancels_resumes_and_selects_finalists(batch_payload):
    paused = advance_batch(batch_payload, max_candidates=7, evaluator=_fake_evaluator)
    assert paused["scheduler"]["state"] == "paused"
    assert paused["scheduler"]["nextOrdinal"] == 7
    assert paused["pareto"] == []
    assert paused["finalists"] == []

    cancelled = advance_batch(
        batch_payload,
        paused,
        cancel_requested=True,
        evaluator=_fake_evaluator,
    )
    assert cancelled["scheduler"]["state"] == "cancelled"
    assert cancelled["scheduler"]["nextOrdinal"] == 7
    assert cancelled["scheduler"]["attempts"][-1]["candidatesEvaluated"] == 0

    completed = advance_batch(batch_payload, cancelled, evaluator=_fake_evaluator)
    assert validate_checkpoint(completed, batch_payload) == completed
    assert completed["schemaVersion"] == "forge-codesign-engine-batch/5.0.0"
    assert completed["artifactKind"] == "codesignEngineBatch"
    assert (
        completed["source"]["maturity"]
        == "catalog-grid-readback-platform-local-engine-200-batch"
    )
    assert completed["source"]["trainingPhysics"] == {
        "trainingBundleSchema": "4.0.0",
        "catalogPhysicsSchema": "forge-training-catalog-physics/2.0.0",
        "catalogNativeMassInertia": True,
        "catalogBenchTableApplicability": "bound-and-fail-closed",
        "catalogExactGridRetained": True,
        "curveReadbackSchema": "forge-training-catalog-curve-readback/1.0.0",
        "independentCurveReadback": "required-when-grid-selected",
        "analyticFallbackAllowed": True,
    }
    assert completed["scheduler"]["state"] == "complete"
    assert completed["scheduler"]["completedCandidates"] == 200
    assert completed["scheduler"]["resumeObserved"] is True
    assert completed["scheduler"]["cancellationObserved"] is True
    assert completed["scheduler"]["resumePolicy"] == (
        "exact-proposal-catalog-and-training-authority"
    )
    assert completed["scheduler"]["heterogeneousResumeAllowed"] is False
    assert completed["scheduler"]["requiredRuntimeAuthoritySha256"] == (
        completed["source"]["proposalRuntimeAuthority"]["authoritySha256"]
    )
    assert completed["scheduler"]["requiredCatalogAuthoritySha256"] == (
        completed["source"]["catalogChoiceAuthority"]["catalogAuthoritySha256"]
    )
    assert [candidate["ordinal"] for candidate in completed["candidates"]] == list(range(200))
    assert completed["benchmark"]["exactCandidateHashesEvaluated"] == 200
    assert completed["benchmark"]["nativeEvaluated"] == 200
    assert completed["benchmark"]["rapierEvaluated"] == 200
    assert completed["benchmark"]["mujocoEvaluated"] == 200
    assert completed["benchmark"]["engineBatchComplete"] is True
    assert completed["benchmark"]["overnightComplete"] is False
    assert len(completed["pareto"]) >= 3
    assert len(completed["finalists"]) == 3
    assert all(finalist["tier3Status"] == "held-not-run" for finalist in completed["finalists"])
    assert all(
        candidate["lineage"]["proposalRuntimeAuthoritySha256"]
        == completed["source"]["proposalRuntimeAuthority"]["authoritySha256"]
        for candidate in completed["candidates"]
    )
    assert {
        candidate["catalogChoice"]["choiceId"] for candidate in completed["candidates"]
    } == {"cnhl-4s-1500", "cnhl-v2-4s-1300"}
    assert all(
        candidate["lineage"]["catalogAuthoritySha256"]
        == completed["source"]["catalogChoiceAuthority"]["catalogAuthoritySha256"]
        for candidate in completed["candidates"]
    )
    assert all(
        candidate["evaluations"]["tier2"]["evidence"]["trainingAuthority"][
            "catalogNativeMassInertia"
        ]
        is True
        and candidate["lineage"]["trainingBundleSchema"] == "4.0.0"
        for candidate in completed["candidates"]
    )
    assert completed["cost"]["providerBillingVerified"] is False
    assert completed["cost"]["providerChargedAmount"] is None
    assert all(value is False for value in completed["nonclaims"].values())


def test_running_checkpoint_is_fenced_as_interrupted_before_resume(batch_payload):
    paused = advance_batch(batch_payload, max_candidates=2, evaluator=_fake_evaluator)
    running = copy.deepcopy(paused)
    running["scheduler"]["attempts"][-1]["outcome"] = "running"
    running["scheduler"]["state"] = "running"
    running["checkpointSha256"] = ""
    _refresh(running)
    validate_checkpoint(running, batch_payload)

    resumed = advance_batch(batch_payload, running, max_candidates=1, evaluator=_fake_evaluator)
    assert resumed["scheduler"]["attempts"][-2]["outcome"] == "interrupted"
    assert resumed["scheduler"]["attempts"][-1]["startOrdinal"] == 2
    assert resumed["scheduler"]["nextOrdinal"] == 3
    assert resumed["scheduler"]["resumeObserved"] is True


def test_checkpoint_refuses_plan_candidate_verdict_and_hash_substitution(batch_payload):
    checkpoint = advance_batch(batch_payload, max_candidates=2, evaluator=_fake_evaluator)

    hash_tamper = copy.deepcopy(checkpoint)
    hash_tamper["checkpointSha256"] = "0" * 64
    with pytest.raises(ValueError, match="checkpoint hash drifted"):
        validate_checkpoint(hash_tamper, batch_payload)

    candidate_tamper = copy.deepcopy(checkpoint)
    candidate_tamper["candidates"][0]["nativeEvaluation"]["tier1"]["trajectorySha256"] = "f" * 64
    candidate_tamper["checkpointSha256"] = _sha(_stable_json(_checkpoint_payload(candidate_tamper)))
    with pytest.raises(ValueError, match="candidate evidence drifted"):
        validate_checkpoint(candidate_tamper, batch_payload)

    catalog_tamper = copy.deepcopy(checkpoint)
    native = catalog_tamper["candidates"][0]["nativeEvaluation"]
    native["catalogProof"]["equippedComponents"][0]["marketplaceApproved"] = True
    catalog_tamper["candidates"][0]["lineage"]["nativeEvaluationSha256"] = _sha(
        _stable_json(native)
    )
    catalog_tamper["checkpointSha256"] = _sha(
        _stable_json(_checkpoint_payload(catalog_tamper))
    )
    with pytest.raises(ValueError, match="row proof fields are not exact"):
        validate_checkpoint(catalog_tamper, batch_payload)

    training_tamper = copy.deepcopy(checkpoint)
    training_tamper["candidates"][0]["evaluations"]["tier2"]["evidence"][
        "trainingAuthority"
    ]["catalogNativeMassInertia"] = False
    training_tamper["checkpointSha256"] = _sha(
        _stable_json(_checkpoint_payload(training_tamper))
    )
    with pytest.raises(ValueError, match="training authority drifted"):
        validate_checkpoint(training_tamper, batch_payload)

    verdict_tamper = copy.deepcopy(checkpoint)
    verdict_tamper["candidates"][0]["admitted"] = False
    verdict_tamper["checkpointSha256"] = _sha(_stable_json(_checkpoint_payload(verdict_tamper)))
    with pytest.raises(ValueError, match="candidate evidence drifted"):
        validate_checkpoint(verdict_tamper, batch_payload)

    plan_tamper = copy.deepcopy(batch_payload)
    plan_tamper["searchPlan"]["proposals"][0]["lineage"]["candidateSnapshotSha256"] = "e" * 64
    with pytest.raises(ValueError, match="plan hash drifted"):
        advance_batch(plan_tamper, max_candidates=1, evaluator=_fake_evaluator)

    non_object = copy.deepcopy(checkpoint)
    non_object["candidates"][0] = None
    non_object["checkpointSha256"] = _sha(_stable_json(_checkpoint_payload(non_object)))
    with pytest.raises(ValueError, match="candidate must be an object"):
        validate_checkpoint(non_object, batch_payload)

    state_tamper = copy.deepcopy(checkpoint)
    state_tamper["scheduler"]["state"] = "cancelled"
    state_tamper["checkpointSha256"] = _sha(_stable_json(_checkpoint_payload(state_tamper)))
    with pytest.raises(ValueError, match="state lacks its terminal attempt"):
        validate_checkpoint(state_tamper, batch_payload)

    runtime_tamper = copy.deepcopy(checkpoint)
    runtime_tamper["scheduler"]["requiredRuntimeAuthoritySha256"] = "0" * 64
    runtime_tamper["checkpointSha256"] = _sha(_stable_json(_checkpoint_payload(runtime_tamper)))
    with pytest.raises(ValueError, match="durability or scheduling drifted"):
        validate_checkpoint(runtime_tamper, batch_payload)


def test_engine_batch_refuses_partial_budget_extra_fields_and_negative_slice(batch_payload):
    for key, value, message in (
        ("candidateBudget", 199, "exactly 200"),
        ("candidateBudget", 200.0, "exactly 200"),
        ("task", "codesign.evaluate", "task=codesign.engine-batch"),
    ):
        tampered = copy.deepcopy(batch_payload)
        tampered[key] = value
        with pytest.raises(ValueError, match=message):
            advance_batch(tampered, max_candidates=0, evaluator=_fake_evaluator)

    extra = copy.deepcopy(batch_payload)
    extra["callerAuthority"] = True
    with pytest.raises(ValueError, match="input fields are not exact"):
        advance_batch(extra, max_candidates=0, evaluator=_fake_evaluator)

    with pytest.raises(ValueError, match="non-negative integer"):
        advance_batch(batch_payload, max_candidates=-1, evaluator=_fake_evaluator)


def test_engine_batch_refuses_foreign_runtime_before_resume(batch_payload, monkeypatch):
    foreign = copy.deepcopy(_proposal_runtime_authority())
    foreign["platform"]["machine"] = f"{foreign['platform']['machine']}-foreign"
    foreign["authoritySha256"] = _sha(
        _stable_json(
            {name: value for name, value in foreign.items() if name != "authoritySha256"}
        )
    )
    monkeypatch.setattr(codesign_search, "_proposal_runtime_authority", lambda: foreign)
    with pytest.raises(ValueError, match="runtime authority does not match this worker"):
        advance_batch(batch_payload, max_candidates=0, evaluator=_fake_evaluator)


def test_engine_batch_refuses_foreign_catalog_before_resume(batch_payload, monkeypatch):
    real_catalog_rows = codesign_search._catalog_rows

    def foreign_catalog(root: Path):
        _authority, rows = real_catalog_rows(root)
        return "0" * 64, rows

    monkeypatch.setattr(codesign_search, "_catalog_rows", foreign_catalog)
    with pytest.raises(ValueError, match="deterministic replay drifted"):
        advance_batch(batch_payload, max_candidates=0, evaluator=_fake_evaluator)
