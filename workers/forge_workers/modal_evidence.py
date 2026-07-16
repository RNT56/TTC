"""P7-013 Modal deployment manifest and sandbox-evidence validator."""

from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from forge_workers.modal_app import (
    MODAL_APP_NAME,
    MODAL_SDK_VERSION,
    MODAL_TRAIN_FUNCTION,
    deployment_contract,
)

EVIDENCE_VERSION = "forge-modal-training-sandbox-evidence/1.0.0"


def validate_sandbox_evidence(value: Any, *, source_revision: str) -> dict[str, Any]:
    """Fail closed unless evidence closes every P7-013 sandbox operations control."""

    if not isinstance(value, dict):
        raise ValueError("P7-013 evidence must be one JSON object")
    contract = deployment_contract(source_revision)
    _equal(value.get("schemaVersion"), EVIDENCE_VERSION, "evidence schema")
    _equal(value.get("maturity"), "sandbox", "evidence maturity")

    source = _object(value.get("source"), "source")
    _equal(source.get("revision"), source_revision, "source revision")
    _equal(source.get("checkoutRevision"), source_revision, "checkout revision")
    _equal(source.get("protectedRevision"), True, "protected revision proof")
    _equal(source.get("worktreeDirty"), False, "clean checkout proof")

    deployment = _object(value.get("deployment"), "deployment")
    expected_deployment = {
        "provider": "modal",
        "appName": MODAL_APP_NAME,
        "functionName": MODAL_TRAIN_FUNCTION,
        "deploymentContractHash": contract["contractHash"],
        "sdkVersion": MODAL_SDK_VERSION,
    }
    for key, expected in expected_deployment.items():
        _equal(deployment.get(key), expected, f"deployment {key}")
    _positive_integer(deployment.get("functionVersion"), "deployment functionVersion")
    _bounded_string(deployment.get("environment"), "deployment environment", maximum=80)
    _bounded_string(deployment.get("imageId"), "deployment imageId", maximum=200)
    deployed_at = _datetime(deployment.get("deployedAt"), "deployment deployedAt")

    run = _object(value.get("run"), "run")
    _equal(run.get("status"), "succeeded", "run status")
    _equal(run.get("task"), "train.policy", "run task")
    _bounded_string(run.get("jobId"), "run jobId", maximum=200)
    _bounded_string(run.get("functionCallId"), "run functionCallId", maximum=200)
    _integer(run.get("seed"), "run seed", lower=0, upper=2_147_483_647)
    started_at = _datetime(run.get("startedAt"), "run startedAt")
    completed_at = _datetime(run.get("completedAt"), "run completedAt")
    if deployed_at > started_at or started_at > completed_at:
        raise ValueError("deployment and run timestamps are out of order")
    _finite(run.get("wallTimeS"), "run wallTimeS", lower=0.0, upper=28_800.0)
    _sha256(run.get("providerOutputSha256"), "run providerOutputSha256")
    _sha256(run.get("onnxSha256"), "run onnxSha256")
    parameter_before = _sha256(run.get("parameterDigestBefore"), "run parameterDigestBefore")
    parameter_after = _sha256(run.get("parameterDigestAfter"), "run parameterDigestAfter")
    if parameter_before == parameter_after:
        raise ValueError("run parameter digests do not prove an optimizer update")
    _equal(run.get("scorecardSchema"), "p7-scorecard-v1", "run scorecard schema")
    _equal(run.get("optimizerUpdated"), True, "run optimizer proof")
    _equal(run.get("truthExposedToPolicy"), False, "run policy truth boundary")
    device = _object(run.get("deviceAuthority"), "run deviceAuthority")
    for key, expected in {
        "requested": "cuda",
        "resolved": "cuda",
        "accelerator": True,
        "backend": "cuda",
        "deviceIndex": 0,
        "deviceCount": 1,
        "cpuFallbackAllowed": False,
    }.items():
        _equal(device.get(key), expected, f"run deviceAuthority {key}")
    name = _bounded_string(device.get("name"), "run CUDA device name", maximum=200)
    if "L4" not in name:
        raise ValueError("run CUDA device name does not prove the declared L4 profile")
    _bounded_string(device.get("cudaRuntime"), "run CUDA runtime", maximum=40)
    _bounded_string(device.get("computeCapability"), "run compute capability", maximum=20)
    _positive_integer(device.get("totalMemoryBytes"), "run CUDA device memory")
    _positive_integer(device.get("cudnnVersion"), "run cuDNN version")

    controls = _object(value.get("controls"), "controls")
    security = _object(controls.get("security"), "controls.security")
    for key, expected in {
        "functionSecrets": [],
        "inputSecretsPresent": False,
        "networkBlocked": True,
        "modalAccessRestricted": True,
        "singleUseContainer": True,
        "providerRetries": 0,
    }.items():
        _equal(security.get(key), expected, f"security {key}")

    quota = _object(controls.get("quota"), "controls.quota")
    _equal(quota.get("maxContainers"), 1, "quota maxContainers")
    cap = _finite(quota.get("environmentBudgetUsd"), "quota environmentBudgetUsd", lower=0.01)
    observed = _finite(quota.get("observedSpendUsd"), "quota observedSpendUsd", lower=0.0)
    if observed > cap:
        raise ValueError("observed Modal spend exceeds the declared environment budget")
    _equal(quota.get("budgetAlertConfigured"), True, "quota alert configuration")
    _equal(quota.get("hardStopTested"), True, "quota hard-stop drill")
    _equal(quota.get("hardStopLayer"), "gateway-postgres-quota", "quota hard-stop layer")
    _equal(quota.get("providerBudgetAdvisory"), True, "provider budget limitation")

    cancellation = _object(controls.get("cancellation"), "controls.cancellation")
    _bounded_string(cancellation.get("functionCallId"), "cancellation functionCallId", maximum=200)
    for key in ("providerTerminated", "jobCancelled", "lateResultDiscarded"):
        _equal(cancellation.get(key), True, f"cancellation {key}")
    _finite(cancellation.get("latencyS"), "cancellation latencyS", lower=0.0, upper=300.0)

    refund = _object(controls.get("refund"), "controls.refund")
    debit = _finite(refund.get("debitedCredits"), "refund debitedCredits", lower=0.0)
    refunded = _finite(refund.get("refundedCredits"), "refund refundedCredits", lower=0.0)
    if debit <= 0 or refunded != debit:
        raise ValueError("cancellation refund must exactly reverse a positive test debit")
    _bounded_string(refund.get("ledgerEventId"), "refund ledgerEventId", maximum=200)
    _equal(refund.get("reason"), "provider-cancelled-before-materialization", "refund reason")

    retention = _object(controls.get("retention"), "controls.retention")
    _equal(retention.get("providerInputOutputMaximumDays"), 7, "provider I/O retention")
    _equal(retention.get("controlledNonPersonalInput"), True, "non-personal sandbox input")
    _equal(retention.get("recordedDeviceInput"), False, "recorded-device exclusion")
    _equal(retention.get("authoritativeArtifactDeleted"), True, "artifact deletion drill")
    _equal(
        retention.get("providerCallDeletionMode"),
        "automatic-maximum-7-days",
        "provider-call deletion mode",
    )
    _equal(retention.get("providerManualCallDeletionAvailable"), False, "manual call deletion")
    _equal(retention.get("providerCallExpiryVerified"), True, "provider-call expiry drill")
    _bounded_string(
        retention.get("providerExpiryEvidenceId"),
        "provider expiry evidenceId",
        maximum=200,
    )
    deleted_at = _datetime(retention.get("deletedAt"), "retention deletedAt")
    provider_expired_at = _datetime(
        retention.get("providerExpiredAt"), "retention providerExpiredAt"
    )
    if deleted_at < completed_at:
        raise ValueError("application artifact deletion predates training completion")
    if provider_expired_at < completed_at + timedelta(days=7):
        raise ValueError("provider-call expiry was not verified after the maximum seven-day TTL")

    cost = _object(controls.get("cost"), "controls.cost")
    _equal(cost.get("currency"), "USD", "cost currency")
    _finite(cost.get("providerReportedUsd"), "cost providerReportedUsd", lower=0.0)
    _bounded_string(cost.get("billingReportId"), "cost billingReportId", maximum=200)
    _equal(cost.get("billingLagAcknowledged"), True, "billing lag acknowledgement")
    _equal(cost.get("sourceTagsVerified"), True, "cost tag attribution")
    _equal(cost.get("databaseReconciliationVerified"), True, "cost database reconciliation")
    _bounded_string(cost.get("jobEventId"), "cost jobEventId", maximum=200)
    reconciled_at = _datetime(cost.get("reconciledAt"), "cost reconciledAt")
    if reconciled_at < completed_at:
        raise ValueError("provider cost reconciliation predates training completion")

    slo = _object(controls.get("slo"), "controls.slo")
    queue_target = _finite(slo.get("queueStartTargetS"), "SLO queue target", lower=0.1)
    queue_observed = _finite(slo.get("queueStartObservedS"), "SLO queue observed", lower=0.0)
    completion_target = _finite(slo.get("completionTargetS"), "SLO completion target", lower=1.0)
    completion_observed = _finite(slo.get("completionObservedS"), "SLO completion observed", lower=0.0)
    if queue_observed > queue_target or completion_observed > completion_target:
        raise ValueError("observed Modal run exceeded its declared SLO")
    _equal(slo.get("alertConfigured"), True, "SLO alert configuration")
    _equal(slo.get("alertDeliveryTested"), True, "SLO alert delivery drill")
    _bounded_string(slo.get("owner"), "SLO owner", maximum=120)

    recovery = _object(controls.get("recovery"), "controls.recovery")
    _equal(recovery.get("failureInjected"), True, "recovery failure injection")
    _equal(recovery.get("providerCallResumed"), True, "provider-call recovery")
    _equal(recovery.get("duplicateArtifactPrevented"), True, "recovery duplicate prevention")
    _equal(recovery.get("status"), "passed", "recovery status")
    _bounded_string(recovery.get("evidenceId"), "recovery evidenceId", maximum=200)

    nonclaims = value.get("nonClaims")
    if not isinstance(nonclaims, list) or len(nonclaims) < 3:
        raise ValueError("P7-013 evidence requires at least three explicit non-claims")
    for index, nonclaim in enumerate(nonclaims):
        _bounded_string(nonclaim, f"nonClaims[{index}]", maximum=500)
    return value


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def _equal(value: Any, expected: Any, label: str) -> None:
    if value != expected:
        raise ValueError(f"{label} must be {expected!r}")


def _bounded_string(value: Any, label: str, *, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum or "\x00" in value:
        raise ValueError(f"{label} must be a non-empty string of at most {maximum} characters")
    return value


def _integer(value: Any, label: str, *, lower: int, upper: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not lower <= value <= upper:
        raise ValueError(f"{label} must be an integer in [{lower}, {upper}]")
    return value


def _positive_integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")
    return value


def _finite(value: Any, label: str, *, lower: float, upper: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    number = float(value)
    if number < lower or (upper is not None and number > upper):
        suffix = f" and at most {upper:g}" if upper is not None else ""
        raise ValueError(f"{label} must be at least {lower:g}{suffix}")
    return number


def _sha256(value: Any, label: str) -> str:
    if (
        not isinstance(value, str)
        or len(value) != 64
        or any(char not in "0123456789abcdef" for char in value)
    ):
        raise ValueError(f"{label} must be a lowercase SHA-256")
    return value


def _timestamp(value: Any, label: str) -> str:
    _datetime(value, label)
    return value


def _datetime(value: Any, label: str) -> datetime:
    text = _bounded_string(value, label, maximum=80)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{label} must be an ISO-8601 timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone")
    return parsed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    contract_parser = subparsers.add_parser("contract")
    contract_parser.add_argument("--source-revision", required=True)
    validate_parser = subparsers.add_parser("validate")
    validate_parser.add_argument("path", type=Path)
    validate_parser.add_argument("--source-revision", required=True)
    args = parser.parse_args()
    if args.command == "contract":
        result = deployment_contract(args.source_revision)
    else:
        raw = json.loads(args.path.read_text(encoding="utf-8"))
        result = validate_sandbox_evidence(raw, source_revision=args.source_revision)
    print(json.dumps(result, allow_nan=False, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
