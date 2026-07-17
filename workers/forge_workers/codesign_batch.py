"""Checkpointed D61 consumer for the exact D60 co-design proposal plan.

The batch owns no proposal generation semantics.  It replays and validates the
exact D60 plan, evaluates its contiguous proposal hashes through the D59 sovereign
native/Rapier/MuJoCo ladder, and writes a hash-bound checkpoint after every
candidate.  Pareto and finalist selection are withheld until all 200 candidates
have engine evidence.  Tier 3, provider billing, catalog choice, build, hardware,
field, and the separate overnight claim remain held.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, TextIO

from forge_workers.codesign_runtime import (
    CODESIGN_NATIVE_EVALUATION_SCHEMA,
    CODESIGN_NATIVE_EVALUATION_VERSION,
    RAPIER_ENGINE,
    ROLLOUT_CONTROL_PERIOD_S,
    ROLLOUT_EPISODES,
    ROLLOUT_STEPS,
    _candidate_snapshot,
    _mujoco_rollout,
    _native_evaluation,
    _pareto,
    _sha,
    _stable_json,
    _tier_records,
    _validate_native_evaluation,
)
from forge_workers.codesign_search import (
    SEARCH_PLAN_SCHEMA,
    SEARCH_PLAN_VERSION,
    TOTAL_PROPOSALS,
    apply_search_patch,
    validate_search_plan,
)
from forge_workers.net_security import assert_bounded_json
from forge_workers.training.bundle import (
    PINNED_MUJOCO_VERSION,
    SNAPSHOT_SCHEMA,
    TRAINING_BUNDLE_VERSION,
    compile_training_bundle,
)
from forge_workers.training.tasks import task_definition

ENGINE_BATCH_SCHEMA = "forge-codesign-engine-batch"
ENGINE_BATCH_VERSION = "1.0.0"
ENGINE_BATCH_EVIDENCE_VERSION = "1.0.0"
ENGINE_BATCH_RUNTIME = "forge-codesign-engine-batch/1.0.0"
ENGINE_BATCH_MATURITY = "local-engine-200-batch"
MAX_INPUT_BYTES = 8 * 1024 * 1024
MAX_CHECKPOINT_BYTES = 32 * 1024 * 1024
TIER3_REASON = "tier 3 is held until a separately evidenced selected-finalist training run"
NONCLAIMS = {
    "overnight200Candidate": False,
    "trainedFinalist": False,
    "catalogChoiceSearch": False,
    "providerSandbox": False,
    "providerBillingVerified": False,
    "buildReady": False,
    "hardwareAuthority": False,
    "fieldEvidence": False,
}

CandidateEvaluator = Callable[[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]], dict[str, Any]]
CheckpointWriter = Callable[[dict[str, Any]], None]


def _exact(value: dict[str, Any], fields: set[str], label: str) -> None:
    if set(value) != fields:
        raise ValueError(f"{label} fields are not exact")


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _search_payload(payload: dict[str, Any]) -> dict[str, Any]:
    _exact(
        payload,
        {
            "task",
            "contractHash",
            "modelSnapshot",
            "candidateBudget",
            "seed",
            "constraints",
            "searchPlan",
        },
        "co-design engine-batch input",
    )
    if payload.get("task") != "codesign.engine-batch":
        raise ValueError("co-design engine batch requires task=codesign.engine-batch")
    if payload.get("candidateBudget") != TOTAL_PROPOSALS:
        raise ValueError("co-design engine batch v1 requires exactly 200 candidates")
    return {
        "task": "codesign.search-plan",
        "contractHash": payload.get("contractHash"),
        "modelSnapshot": payload.get("modelSnapshot"),
        "candidateBudget": payload.get("candidateBudget"),
        "seed": payload.get("seed"),
        "constraints": payload.get("constraints"),
    }


def _validated_inputs(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    assert_bounded_json(
        payload,
        label="co-design engine-batch input",
        max_bytes=MAX_INPUT_BYTES,
        max_depth=40,
        max_nodes=100_000,
    )
    search_payload = _search_payload(payload)
    plan = validate_search_plan(payload.get("searchPlan"), search_payload)
    snapshot = search_payload.get("modelSnapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("co-design engine batch requires an admitted model snapshot")
    try:
        contract = json.loads(snapshot["contractJson"])
    except (KeyError, json.JSONDecodeError, TypeError, RecursionError) as error:
        raise ValueError("co-design engine-batch snapshot is not valid JSON") from error
    if not isinstance(contract, dict):
        raise ValueError("co-design engine-batch contract must be an object")
    return plan, snapshot, contract


def _candidate_expected(
    snapshot: dict[str, Any],
    contract: dict[str, Any],
    plan: dict[str, Any],
    proposal: dict[str, Any],
    native: dict[str, Any],
    native_runtime_ms: float,
    rollout: dict[str, Any] | None,
    rollout_runtime_ms: float,
) -> dict[str, Any]:
    ordinal = proposal["ordinal"]
    candidate_contract = apply_search_patch(contract, proposal["patch"])
    candidate_json, candidate_hash, _training_payload = _candidate_snapshot(
        candidate_contract,
        f"{snapshot['modelId']}:codesign-plan:{ordinal:03d}",
    )
    if candidate_hash != proposal["lineage"]["candidateSnapshotSha256"]:
        raise ValueError("co-design engine-batch proposal candidate hash drifted")
    if _sha(_stable_json(proposal["patch"])) != proposal["lineage"]["patchSha256"]:
        raise ValueError("co-design engine-batch proposal patch hash drifted")
    _validate_native_evaluation(native, candidate_hash)
    if rollout is not None:
        _validate_rollout(rollout)
    evaluations, metrics, admitted, admission_reasons = _tier_records(
        native,
        native_runtime_ms,
        rollout,
        rollout_runtime_ms,
        {name: float(value) for name, value in plan["constraints"].items()},
    )
    evaluations["tier3"]["reasons"] = [TIER3_REASON]
    native_sha = _sha(_stable_json(native))
    record = {
        "id": f"{proposal['id']}-engine",
        "ordinal": ordinal,
        "algorithm": proposal["algorithm"],
        "profile": proposal["profile"],
        "patch": copy.deepcopy(proposal["patch"]),
        "tier": "mujoco-rollout" if evaluations["tier2"]["pass"] else (
            "rapier-smoke" if evaluations["tier1"]["pass"] else "validator-oracle"
        ),
        "admitted": admitted,
        "admission": {"pass": admitted, "reasons": admission_reasons},
        "evaluations": evaluations,
        "metrics": metrics,
        "nativeEvaluation": native,
        "lineage": {
            "baseContractHash": snapshot["contractHash"],
            "searchPlanSchema": f"{SEARCH_PLAN_SCHEMA}/{SEARCH_PLAN_VERSION}",
            "searchPlanSha256": plan["planSha256"],
            "proposalId": proposal["id"],
            "candidateSnapshotSha256": candidate_hash,
            "patchSha256": proposal["lineage"]["patchSha256"],
            "nativeEvaluationSchema": (
                f"{CODESIGN_NATIVE_EVALUATION_SCHEMA}/{CODESIGN_NATIVE_EVALUATION_VERSION}"
            ),
            "nativeEvaluationSha256": native_sha,
            "trainingBundleSchema": TRAINING_BUNDLE_VERSION,
            "mujocoRuntime": PINNED_MUJOCO_VERSION,
            "engineSeed": plan["algorithms"]["seed"] + ordinal * 100,
            "maturity": ENGINE_BATCH_MATURITY,
        },
    }
    if _sha(candidate_json) != candidate_hash:
        raise RuntimeError("co-design engine-batch candidate serialization drifted")
    return record


def _validate_rollout(rollout: dict[str, Any]) -> None:
    _exact(
        rollout,
        {
            "engine",
            "engineBacked",
            "controller",
            "trainedPolicy",
            "estimatorOnly",
            "task",
            "episodes",
            "stepsPerEpisode",
            "controlPeriodS",
            "simulatedDurationS",
            "successRate",
            "meanSuccessFraction",
            "meanEnergyWh",
            "meanReward",
            "meanTimeToFirstSuccessS",
            "unsafeEpisodes",
            "meanFinalPositionErrorM",
            "rolloutSha256",
        },
        "co-design engine-batch MuJoCo rollout",
    )
    task = task_definition("hover-hold")
    if (
        rollout.get("engine") != f"mujoco/{PINNED_MUJOCO_VERSION}"
        or rollout.get("engineBacked") is not True
        or rollout.get("controller") != "forge-estimator-teacher-v1"
        or rollout.get("trainedPolicy") is not False
        or rollout.get("estimatorOnly") is not True
        or rollout.get("task")
        != {"id": task["id"], "version": task["version"], "definitionHash": task["definitionHash"]}
        or rollout.get("episodes") != ROLLOUT_EPISODES
        or rollout.get("stepsPerEpisode") != ROLLOUT_STEPS
    ):
        raise ValueError("co-design engine-batch MuJoCo authority drifted")
    control_period = _finite(rollout.get("controlPeriodS"), "MuJoCo control period")
    simulated = _finite(rollout.get("simulatedDurationS"), "MuJoCo simulated duration")
    if not math.isclose(control_period, ROLLOUT_CONTROL_PERIOD_S, rel_tol=0, abs_tol=1e-12) or not math.isclose(
        simulated,
        ROLLOUT_EPISODES * ROLLOUT_STEPS * control_period,
        rel_tol=0,
        abs_tol=1e-9,
    ):
        raise ValueError("co-design engine-batch MuJoCo time authority drifted")
    for field in (
        "successRate",
        "meanSuccessFraction",
        "meanEnergyWh",
        "meanReward",
        "meanTimeToFirstSuccessS",
        "meanFinalPositionErrorM",
    ):
        _finite(rollout.get(field), f"MuJoCo {field}")
    if not 0 <= float(rollout["successRate"]) <= 1 or not 0 <= float(rollout["meanSuccessFraction"]) <= 1:
        raise ValueError("co-design engine-batch MuJoCo success metrics drifted")
    unsafe = rollout.get("unsafeEpisodes")
    if isinstance(unsafe, bool) or not isinstance(unsafe, int) or not 0 <= unsafe <= ROLLOUT_EPISODES:
        raise ValueError("co-design engine-batch MuJoCo unsafe count drifted")
    digest = rollout.get("rolloutSha256")
    if not isinstance(digest, str) or len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
        raise ValueError("co-design engine-batch MuJoCo digest drifted")


def evaluate_proposal(
    snapshot: dict[str, Any],
    contract: dict[str, Any],
    plan: dict[str, Any],
    proposal: dict[str, Any],
) -> dict[str, Any]:
    """Run one exact D60 proposal through the D59 sovereign engine ladder."""

    ordinal = proposal["ordinal"]
    candidate_contract = apply_search_patch(contract, proposal["patch"])
    candidate_json, candidate_hash, training_payload = _candidate_snapshot(
        candidate_contract,
        f"{snapshot['modelId']}:codesign-plan:{ordinal:03d}",
    )
    if candidate_hash != proposal["lineage"]["candidateSnapshotSha256"]:
        raise ValueError("co-design engine-batch proposal hash does not match the exact candidate")
    native, native_runtime_ms = _native_evaluation(candidate_json, candidate_hash)
    rollout: dict[str, Any] | None = None
    rollout_runtime_ms = 0.0
    if native["passed"] is True:
        bundle = compile_training_bundle(training_payload)
        rollout, rollout_runtime_ms = _mujoco_rollout(
            bundle,
            plan["algorithms"]["seed"] + ordinal * 100,
        )
    return _candidate_expected(
        snapshot,
        contract,
        plan,
        proposal,
        native,
        native_runtime_ms,
        rollout,
        rollout_runtime_ms,
    )


def _validate_candidate(
    candidate: Any,
    snapshot: dict[str, Any],
    contract: dict[str, Any],
    plan: dict[str, Any],
    proposal: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(candidate, dict):
        raise ValueError("co-design engine-batch candidate must be an object")
    _exact(
        candidate,
        {
            "id",
            "ordinal",
            "algorithm",
            "profile",
            "patch",
            "tier",
            "admitted",
            "admission",
            "evaluations",
            "metrics",
            "nativeEvaluation",
            "lineage",
        },
        "co-design engine-batch candidate",
    )
    evaluations = candidate.get("evaluations")
    if not isinstance(evaluations, dict):
        raise ValueError("co-design engine-batch evaluations are invalid")
    tier1 = evaluations.get("tier1")
    tier2 = evaluations.get("tier2")
    if not isinstance(tier1, dict) or not isinstance(tier2, dict):
        raise ValueError("co-design engine-batch tier records are invalid")
    native_runtime_ms = _finite(tier1.get("runtimeMs"), "co-design engine-batch native runtime")
    rollout_runtime_ms = _finite(tier2.get("runtimeMs"), "co-design engine-batch rollout runtime")
    rollout = tier2.get("evidence")
    if rollout is not None and not isinstance(rollout, dict):
        raise ValueError("co-design engine-batch MuJoCo evidence is invalid")
    expected = _candidate_expected(
        snapshot,
        contract,
        plan,
        proposal,
        candidate.get("nativeEvaluation"),
        native_runtime_ms,
        rollout,
        rollout_runtime_ms,
    )
    if _stable_json(candidate) != _stable_json(expected):
        raise ValueError("co-design engine-batch candidate evidence drifted")
    return candidate


def _checkpoint_payload(checkpoint: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in checkpoint.items() if key != "checkpointSha256"}


def _pareto_refs(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "candidateId": candidate["id"],
            "candidateSnapshotSha256": candidate["lineage"]["candidateSnapshotSha256"],
            "metrics": copy.deepcopy(candidate["metrics"]),
        }
        for candidate in _pareto(candidates)
    ]


def _finalists(pareto: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        pareto,
        key=lambda point: (
            -float(point["metrics"]["score"]),
            -float(point["metrics"]["enduranceMin"]),
            float(point["metrics"]["massG"]),
            point["candidateId"],
        ),
    )[:3]
    return [
        {
            "rank": rank,
            "candidateId": point["candidateId"],
            "candidateSnapshotSha256": point["candidateSnapshotSha256"],
            "selection": "engine-admitted-pareto-finalist",
            "tier3Status": "held-not-run",
        }
        for rank, point in enumerate(ranked, start=1)
    ]


def _runtime_hours(milliseconds: float) -> float:
    return round(milliseconds / 3_600_000.0, 9)


def _refresh(checkpoint: dict[str, Any]) -> dict[str, Any]:
    candidates = checkpoint["candidates"]
    scheduler = checkpoint["scheduler"]
    complete = scheduler["nextOrdinal"] == TOTAL_PROPOSALS
    checkpoint["pareto"] = _pareto_refs(candidates) if complete else []
    checkpoint["finalists"] = _finalists(checkpoint["pareto"]) if complete else []
    native_ms = sum(float(candidate["evaluations"]["tier1"]["runtimeMs"]) for candidate in candidates)
    tier2_ms = sum(float(candidate["evaluations"]["tier2"]["runtimeMs"]) for candidate in candidates)
    attempt_ms = sum(float(attempt["runtimeMs"]) for attempt in scheduler["attempts"])
    scheduler["completedCandidates"] = len(candidates)
    scheduler["resumeObserved"] = any(
        attempt["startOrdinal"] > 0 and attempt["candidatesEvaluated"] > 0
        for attempt in scheduler["attempts"]
    )
    scheduler["cancellationObserved"] = any(
        attempt["outcome"] == "cancelled" for attempt in scheduler["attempts"]
    )
    checkpoint["benchmark"] = {
        "candidateBudget": TOTAL_PROPOSALS,
        "exactCandidateHashesEvaluated": len(candidates),
        "nativeEvaluated": len(candidates),
        "rapierEvaluated": sum(
            candidate["evaluations"]["tier1"]["evidence"] is not None for candidate in candidates
        ),
        "mujocoEvaluated": sum(
            candidate["evaluations"]["tier2"]["engineBacked"] is True for candidate in candidates
        ),
        "admittedCandidates": sum(candidate["admitted"] is True for candidate in candidates),
        "paretoPoints": len(checkpoint["pareto"]),
        "selectedFinalists": len(checkpoint["finalists"]),
        "engineBatchComplete": complete,
        "overnightComplete": False,
    }
    checkpoint["cost"] = {
        "measurement": "summed-local-candidate-wall-runtime",
        "nativeEvaluationRuntimeHours": _runtime_hours(native_ms),
        "mujocoRuntimeHours": _runtime_hours(tier2_ms),
        "measuredEngineRuntimeHours": _runtime_hours(native_ms + tier2_ms),
        "attemptWallRuntimeHours": _runtime_hours(attempt_ms),
        "localExecution": True,
        "providerBillingVerified": False,
        "providerChargedAmount": None,
        "providerCurrency": None,
        "energyMeasured": False,
    }
    checkpoint["checkpointSha256"] = _sha(_stable_json(_checkpoint_payload(checkpoint)))
    return checkpoint


def new_checkpoint(payload: dict[str, Any]) -> dict[str, Any]:
    plan, snapshot, _contract = _validated_inputs(payload)
    checkpoint = {
        "schemaVersion": f"{ENGINE_BATCH_SCHEMA}/{ENGINE_BATCH_VERSION}",
        "artifactKind": "codesignEngineBatch",
        "provider": "forge-local-engine-batch",
        "cacheKey": f"codesign.batch:{snapshot['contractHash'][:16]}:{plan['planSha256'][:16]}",
        "source": {
            "snapshotSchema": SNAPSHOT_SCHEMA,
            "modelId": snapshot["modelId"],
            "baseContractHash": snapshot["contractHash"],
            "searchPlanSchema": f"{SEARCH_PLAN_SCHEMA}/{SEARCH_PLAN_VERSION}",
            "searchPlanSha256": plan["planSha256"],
            "candidateCount": TOTAL_PROPOSALS,
            "sourceRevision": plan["source"]["sourceRevision"],
            "sourceRevisionRecorded": plan["source"]["sourceRevisionRecorded"],
            "dependencyManifestSha256": plan["source"]["dependencyManifestSha256"],
            "runtime": ENGINE_BATCH_RUNTIME,
            "maturity": ENGINE_BATCH_MATURITY,
        },
        "manifold": copy.deepcopy(plan["manifold"]),
        "constraints": copy.deepcopy(plan["constraints"]),
        "optimizer": copy.deepcopy(plan["algorithms"]),
        "scheduler": {
            "state": "ready",
            "nextOrdinal": 0,
            "completedCandidates": 0,
            "checkpointEveryCandidate": True,
            "serialExecution": True,
            "resumeObserved": False,
            "cancellationObserved": False,
            "attempts": [],
        },
        "candidates": [],
        "pareto": [],
        "finalists": [],
        "benchmark": {},
        "cost": {},
        "nonclaims": dict(NONCLAIMS),
        "checkpointSha256": "",
    }
    return _refresh(checkpoint)


def _validate_attempts(scheduler: dict[str, Any]) -> None:
    attempts = scheduler.get("attempts")
    if not isinstance(attempts, list):
        raise ValueError("co-design engine-batch attempts are invalid")
    cursor = 0
    allowed = {"running", "paused", "cancelled", "interrupted", "complete"}
    for sequence, attempt in enumerate(attempts, start=1):
        if not isinstance(attempt, dict):
            raise ValueError("co-design engine-batch attempt must be an object")
        _exact(
            attempt,
            {
                "sequence",
                "startOrdinal",
                "endOrdinalExclusive",
                "candidatesEvaluated",
                "requestedLimit",
                "outcome",
                "runtimeMs",
            },
            "co-design engine-batch attempt",
        )
        attempt_sequence = attempt["sequence"]
        start = attempt["startOrdinal"]
        if (
            isinstance(attempt_sequence, bool)
            or not isinstance(attempt_sequence, int)
            or isinstance(start, bool)
            or not isinstance(start, int)
            or attempt_sequence != sequence
            or start != cursor
        ):
            raise ValueError("co-design engine-batch attempt continuity drifted")
        end = attempt["endOrdinalExclusive"]
        evaluated = attempt["candidatesEvaluated"]
        limit = attempt["requestedLimit"]
        if (
            isinstance(end, bool)
            or not isinstance(end, int)
            or isinstance(evaluated, bool)
            or not isinstance(evaluated, int)
            or end - cursor != evaluated
            or not 0 <= end <= TOTAL_PROPOSALS
        ):
            raise ValueError("co-design engine-batch attempt range drifted")
        if limit is not None and (isinstance(limit, bool) or not isinstance(limit, int) or limit < 0):
            raise ValueError("co-design engine-batch attempt limit is invalid")
        if attempt["outcome"] not in allowed or _finite(attempt["runtimeMs"], "attempt runtime") < 0:
            raise ValueError("co-design engine-batch attempt outcome is invalid")
        if attempt["outcome"] == "cancelled" and evaluated != 0:
            raise ValueError("co-design engine-batch cancellation dispatched engine work")
        if attempt["outcome"] == "complete" and end != TOTAL_PROPOSALS:
            raise ValueError("co-design engine-batch complete attempt is incomplete")
        cursor = end
    if cursor != scheduler.get("nextOrdinal"):
        raise ValueError("co-design engine-batch scheduler cursor drifted")
    state = scheduler.get("state")
    if attempts and attempts[-1]["outcome"] == "running" and state != "running":
        raise ValueError("co-design engine-batch running attempt state drifted")
    expected_terminal_outcomes = {
        "running": {"running"},
        "paused": {"paused", "interrupted"},
        "cancelled": {"cancelled"},
        "complete": {"complete"},
    }
    if state in expected_terminal_outcomes and (
        not attempts or attempts[-1]["outcome"] not in expected_terminal_outcomes[state]
    ):
        raise ValueError("co-design engine-batch scheduler state lacks its terminal attempt")


def validate_checkpoint(checkpoint: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(checkpoint, dict):
        raise ValueError("co-design engine checkpoint must be an object")
    _exact(
        checkpoint,
        {
            "schemaVersion",
            "artifactKind",
            "provider",
            "cacheKey",
            "source",
            "manifold",
            "constraints",
            "optimizer",
            "scheduler",
            "candidates",
            "pareto",
            "finalists",
            "benchmark",
            "cost",
            "nonclaims",
            "checkpointSha256",
        },
        "co-design engine checkpoint",
    )
    if checkpoint.get("schemaVersion") != f"{ENGINE_BATCH_SCHEMA}/{ENGINE_BATCH_VERSION}":
        raise ValueError("co-design engine checkpoint version is unsupported")
    if (
        checkpoint.get("artifactKind") != "codesignEngineBatch"
        or checkpoint.get("provider") != "forge-local-engine-batch"
    ):
        raise ValueError("co-design engine checkpoint identity drifted")
    if checkpoint.get("nonclaims") != NONCLAIMS:
        raise ValueError("co-design engine checkpoint nonclaims drifted")
    if checkpoint.get("checkpointSha256") != _sha(_stable_json(_checkpoint_payload(checkpoint))):
        raise ValueError("co-design engine checkpoint hash drifted")
    plan, snapshot, contract = _validated_inputs(payload)
    empty = new_checkpoint(payload)
    for field in ("cacheKey", "source", "manifold", "constraints", "optimizer", "nonclaims"):
        if _stable_json(checkpoint.get(field)) != _stable_json(empty[field]):
            raise ValueError(f"co-design engine checkpoint {field} drifted")
    scheduler = checkpoint.get("scheduler")
    if not isinstance(scheduler, dict):
        raise ValueError("co-design engine checkpoint scheduler is invalid")
    _exact(
        scheduler,
        {
            "state",
            "nextOrdinal",
            "completedCandidates",
            "checkpointEveryCandidate",
            "serialExecution",
            "resumeObserved",
            "cancellationObserved",
            "attempts",
        },
        "co-design engine checkpoint scheduler",
    )
    if scheduler.get("state") not in {"ready", "running", "paused", "cancelled", "complete"}:
        raise ValueError("co-design engine checkpoint scheduler state is invalid")
    next_ordinal = scheduler.get("nextOrdinal")
    completed_candidates = scheduler.get("completedCandidates")
    if (
        isinstance(next_ordinal, bool)
        or not isinstance(next_ordinal, int)
        or not 0 <= next_ordinal <= TOTAL_PROPOSALS
        or isinstance(completed_candidates, bool)
        or not isinstance(completed_candidates, int)
        or completed_candidates != next_ordinal
    ):
        raise ValueError("co-design engine checkpoint scheduler counters are invalid")
    if scheduler.get("checkpointEveryCandidate") is not True or scheduler.get("serialExecution") is not True:
        raise ValueError("co-design engine checkpoint durability or scheduling drifted")
    _validate_attempts(scheduler)
    candidates = checkpoint.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != next_ordinal:
        raise ValueError("co-design engine checkpoint candidate count drifted")
    for ordinal, candidate in enumerate(candidates):
        if not isinstance(candidate, dict):
            raise ValueError("co-design engine-batch candidate must be an object")
        if candidate.get("ordinal") != ordinal:
            raise ValueError("co-design engine checkpoint candidates are not contiguous")
        _validate_candidate(candidate, snapshot, contract, plan, plan["proposals"][ordinal])
    expected = copy.deepcopy(checkpoint)
    expected["checkpointSha256"] = ""
    _refresh(expected)
    if _stable_json(expected) != _stable_json(checkpoint):
        raise ValueError("co-design engine checkpoint derived evidence drifted")
    state = scheduler["state"]
    if state == "ready" and scheduler["attempts"]:
        raise ValueError("co-design engine checkpoint ready state has attempts")
    if state == "complete" and scheduler["nextOrdinal"] != TOTAL_PROPOSALS:
        raise ValueError("co-design engine checkpoint complete state is incomplete")
    if state != "complete" and scheduler["nextOrdinal"] == TOTAL_PROPOSALS:
        raise ValueError("co-design engine checkpoint finished without complete state")
    return checkpoint


def advance_batch(
    payload: dict[str, Any],
    checkpoint: dict[str, Any] | None = None,
    *,
    max_candidates: int | None = None,
    cancel_requested: bool = False,
    evaluator: CandidateEvaluator = evaluate_proposal,
    persist: CheckpointWriter | None = None,
) -> dict[str, Any]:
    plan, snapshot, contract = _validated_inputs(payload)
    value = new_checkpoint(payload) if checkpoint is None else validate_checkpoint(checkpoint, payload)
    value = copy.deepcopy(value)
    if value["scheduler"]["state"] == "complete":
        return value
    if max_candidates is not None and (
        isinstance(max_candidates, bool) or not isinstance(max_candidates, int) or max_candidates < 0
    ):
        raise ValueError("co-design engine-batch max-candidates must be a non-negative integer")
    attempts = value["scheduler"]["attempts"]
    if attempts and attempts[-1]["outcome"] == "running":
        attempts[-1]["outcome"] = "interrupted"
        value["scheduler"]["state"] = "paused"
        _refresh(value)
        if persist is not None:
            persist(value)
    start = value["scheduler"]["nextOrdinal"]
    requested = max_candidates
    limit = min(TOTAL_PROPOSALS, start + (max_candidates if max_candidates is not None else TOTAL_PROPOSALS))
    attempt = {
        "sequence": len(attempts) + 1,
        "startOrdinal": start,
        "endOrdinalExclusive": start,
        "candidatesEvaluated": 0,
        "requestedLimit": requested,
        "outcome": "running",
        "runtimeMs": 0.0,
    }
    attempts.append(attempt)
    started = time.perf_counter()
    if cancel_requested:
        attempt["outcome"] = "cancelled"
        attempt["runtimeMs"] = round((time.perf_counter() - started) * 1_000.0, 3)
        value["scheduler"]["state"] = "cancelled"
        _refresh(value)
        if persist is not None:
            persist(value)
        return validate_checkpoint(value, payload)
    value["scheduler"]["state"] = "running"
    _refresh(value)
    if persist is not None:
        persist(value)
    for ordinal in range(start, limit):
        candidate = evaluator(snapshot, contract, plan, plan["proposals"][ordinal])
        _validate_candidate(candidate, snapshot, contract, plan, plan["proposals"][ordinal])
        value["candidates"].append(candidate)
        value["scheduler"]["nextOrdinal"] = ordinal + 1
        attempt["endOrdinalExclusive"] = ordinal + 1
        attempt["candidatesEvaluated"] = ordinal + 1 - start
        attempt["runtimeMs"] = round((time.perf_counter() - started) * 1_000.0, 3)
        _refresh(value)
        if persist is not None:
            persist(value)
    attempt["outcome"] = "complete" if limit == TOTAL_PROPOSALS else "paused"
    attempt["runtimeMs"] = round((time.perf_counter() - started) * 1_000.0, 3)
    value["scheduler"]["state"] = "complete" if limit == TOTAL_PROPOSALS else "paused"
    _refresh(value)
    if persist is not None:
        persist(value)
    return validate_checkpoint(value, payload)


def _read_checkpoint(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    if path.is_symlink() or not path.is_file():
        raise ValueError("co-design engine checkpoint must be a regular file")
    encoded = path.read_bytes()
    if len(encoded) > MAX_CHECKPOINT_BYTES:
        raise ValueError("co-design engine checkpoint exceeds the worker boundary")
    try:
        value = json.loads(encoded)
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError) as error:
        raise ValueError("co-design engine checkpoint is not valid JSON") from error
    if not isinstance(value, dict):
        raise ValueError("co-design engine checkpoint must be an object")
    assert_bounded_json(
        value,
        label="co-design engine checkpoint",
        max_bytes=MAX_CHECKPOINT_BYTES,
        max_depth=48,
        max_nodes=400_000,
    )
    return value


def _writer(path: Path) -> CheckpointWriter:
    if not path.is_absolute():
        raise ValueError("co-design engine checkpoint path must be absolute")
    if path.exists() and path.is_symlink():
        raise ValueError("co-design engine checkpoint path must not be a symlink")
    if not path.parent.is_dir():
        raise ValueError("co-design engine checkpoint parent must already exist")

    def write(value: dict[str, Any]) -> None:
        encoded = (_stable_json(value) + "\n").encode("utf-8")
        if len(encoded) > MAX_CHECKPOINT_BYTES:
            raise ValueError("co-design engine checkpoint exceeds the worker boundary")
        temporary: str | None = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                prefix=f".{path.name}.",
                suffix=".tmp",
                dir=path.parent,
                delete=False,
            ) as handle:
                temporary = handle.name
                handle.write(encoded)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
            temporary = None
        finally:
            if temporary is not None:
                Path(temporary).unlink(missing_ok=True)

    return write


def _arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate the exact D60 co-design plan with durable checkpoints")
    parser.add_argument("--checkpoint", required=True, type=Path)
    parser.add_argument("--max-candidates", type=int)
    parser.add_argument("--cancel", action="store_true")
    return parser.parse_args(argv)


def main(
    argv: list[str] | None = None,
    stdin: TextIO = sys.stdin,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
) -> int:
    try:
        args = _arguments(argv)
        encoded = (
            stdin.buffer.read(MAX_INPUT_BYTES + 1)
            if hasattr(stdin, "buffer")
            else stdin.read(MAX_INPUT_BYTES + 1).encode("utf-8")
        )
        if len(encoded) > MAX_INPUT_BYTES:
            raise ValueError("co-design engine-batch input exceeds the worker boundary")
        payload = json.loads(encoded.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("co-design engine-batch input must be an object")
        writer = _writer(args.checkpoint)
        checkpoint = _read_checkpoint(args.checkpoint)
        value = advance_batch(
            payload,
            checkpoint,
            max_candidates=args.max_candidates,
            cancel_requested=args.cancel,
            persist=writer,
        )
        stdout.write(_stable_json(value))
        stdout.write("\n")
        return 0
    except (
        ValueError,
        RuntimeError,
        OSError,
        json.JSONDecodeError,
        UnicodeDecodeError,
        RecursionError,
    ) as error:
        stderr.write(f"codesign-batch: {error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
