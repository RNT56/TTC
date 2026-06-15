"""Policy transfer compatibility for P11 skill listings.

The marketplace can only promise direct policy reuse when the policy's scorecard
is exportable and the buyer twin has the same archetype plus the same policy I/O
layout. Otherwise the honest offer is a fine-tune job against the buyer's twin.
"""

from __future__ import annotations

from typing import Any


def assess_policy_transfer(payload: dict[str, Any]) -> dict[str, Any]:
    policy = _record(payload.get("policy", payload))
    target = _record(payload.get("buyerTwin", payload.get("targetTwin", payload.get("target", {}))))
    policy_io = _policy_io(policy)
    target_io = _policy_io(target)
    policy_archetype = _policy_archetype(policy, policy_io)
    target_archetype = _target_archetype(target, target_io)
    reasons: list[str] = []

    scorecard = _record(policy.get("scorecard"))
    policy_exportable = _bool(scorecard.get("exportable"), False) and _bool(_record(policy.get("onnx")).get("exportable"), True)
    if not policy_exportable:
        reasons.append("policy scorecard is not exportable")

    archetype_match = bool(policy_archetype and target_archetype and policy_archetype == target_archetype)
    if not policy_archetype:
        reasons.append("policy archetype missing")
    if not target_archetype:
        reasons.append("buyer twin archetype missing")
    if policy_archetype and target_archetype and not archetype_match:
        reasons.append(f"archetype mismatch: policy {policy_archetype} vs buyer {target_archetype}")

    observations_match = _layout_match(policy_io["observations"], target_io["observations"], "observation", reasons)
    actions_match = _layout_match(policy_io["actions"], target_io["actions"], "action", reasons)
    direct = policy_exportable and archetype_match and observations_match and actions_match
    fine_tune = None if direct or not policy_exportable else _fine_tune_offer(policy, target, reasons, policy_archetype, target_archetype)
    status = "direct-transfer" if direct else "blocked" if not policy_exportable else "fine-tune-required"

    return {
        "artifactKind": "policy-transfer-assessment",
        "status": status,
        "directTransfer": direct,
        "fineTuneRequired": fine_tune is not None,
        "policy": {
            "archetype": policy_archetype,
            "task": _task_id(policy),
            "cacheKey": _record(policy.get("onnx")).get("cacheKey"),
            "scorecardExportable": policy_exportable,
        },
        "buyerTwin": {
            "archetype": target_archetype,
            "contractHash": _first_string(_record(target_io["header"]).get("contractHash"), target.get("contractHash")),
        },
        "compatibility": {
            "archetype": "match" if archetype_match else "mismatch",
            "observations": "match" if observations_match else "mismatch",
            "actions": "match" if actions_match else "mismatch",
        },
        "fineTuneOffer": fine_tune,
        "reasons": reasons,
    }


def _policy_io(source: dict[str, Any]) -> dict[str, Any]:
    io = _record(source.get("io", source.get("policyIo", source.get("policyIO", {}))))
    header = _record(io.get("onnxHeader", source.get("onnxHeader", {})))
    observations = _strings(io.get("observations", source.get("observations", header.get("observations"))))
    actions = _strings(io.get("actions", source.get("actions", header.get("actions"))))
    return {"observations": observations, "actions": actions, "header": header}


def _policy_archetype(policy: dict[str, Any], io: dict[str, Any]) -> str | None:
    task = _record(policy.get("task"))
    header = _record(io.get("header"))
    return _first_string(
        header.get("archetype"),
        header.get("modelArchetype"),
        policy.get("archetype"),
        policy.get("modelArchetype"),
        task.get("archetype"),
        task.get("family"),
    )


def _target_archetype(target: dict[str, Any], io: dict[str, Any]) -> str | None:
    meta = _record(target.get("meta"))
    driver = _record(target.get("driver"))
    header = _record(io.get("header"))
    return _first_string(
        header.get("archetype"),
        header.get("modelArchetype"),
        target.get("archetype"),
        target.get("modelArchetype"),
        meta.get("archetype"),
        driver.get("archetype"),
    )


def _layout_match(policy_layout: list[str], target_layout: list[str], label: str, reasons: list[str]) -> bool:
    if not policy_layout:
        reasons.append(f"policy {label} layout missing")
        return False
    if not target_layout:
        reasons.append(f"buyer twin {label} layout missing")
        return False
    if policy_layout != target_layout:
        reasons.append(f"{label} layout mismatch")
        return False
    return True


def _fine_tune_offer(
    policy: dict[str, Any],
    target: dict[str, Any],
    reasons: list[str],
    policy_archetype: str | None,
    target_archetype: str | None,
) -> dict[str, Any]:
    return {
        "kind": "fine-tune-against-buyer-twin",
        "task": "train.policy",
        "basePolicyCacheKey": _record(policy.get("onnx")).get("cacheKey"),
        "sourceTask": _task_id(policy),
        "policyArchetype": policy_archetype,
        "targetArchetype": target_archetype,
        "targetContractHash": _first_string(target.get("contractHash"), _record(_policy_io(target)["header"]).get("contractHash")),
        "requiredEvidence": ["fresh p7-scorecard-v1", "estimator-smoke pass", "matching buyer-twin I/O header"],
        "reasons": list(reasons),
    }


def _task_id(policy: dict[str, Any]) -> str | None:
    task = policy.get("task")
    if isinstance(task, str):
        return task
    if isinstance(task, dict):
        return _first_string(task.get("id"), task.get("task"), task.get("name"))
    scorecard = _record(policy.get("scorecard"))
    return _first_string(scorecard.get("task"))


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, (str, int, float))]


def _first_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return None


def _bool(value: Any, default: bool) -> bool:
    return value if isinstance(value, bool) else default
