from __future__ import annotations

from copy import deepcopy

import pytest

from forge_workers.modal_app import deployment_contract
from forge_workers.modal_evidence import EVIDENCE_VERSION, validate_sandbox_evidence


REVISION = "ab" * 20


def evidence() -> dict:
    contract = deployment_contract(REVISION)
    return {
        "schemaVersion": EVIDENCE_VERSION,
        "maturity": "sandbox",
        "source": {
            "revision": REVISION,
            "checkoutRevision": REVISION,
            "protectedRevision": True,
            "worktreeDirty": False,
        },
        "deployment": {
            "provider": "modal",
            "appName": "forge-workers",
            "functionName": "train_policy_gpu",
            "functionVersion": 17,
            "environment": "sandbox",
            "imageId": "im-test",
            "deploymentContractHash": contract["contractHash"],
            "sdkVersion": "1.5.2",
            "deployedAt": "2026-07-15T12:00:00Z",
        },
        "run": {
            "status": "succeeded",
            "task": "train.policy",
            "jobId": "job-test",
            "functionCallId": "fc-success",
            "seed": 1201,
            "startedAt": "2026-07-15T12:01:00Z",
            "completedAt": "2026-07-15T12:03:00Z",
            "wallTimeS": 120.0,
            "providerOutputSha256": "1" * 64,
            "onnxSha256": "2" * 64,
            "parameterDigestBefore": "3" * 64,
            "parameterDigestAfter": "4" * 64,
            "scorecardSchema": "p7-scorecard-v1",
            "optimizerUpdated": True,
            "truthExposedToPolicy": False,
            "deviceAuthority": {
                "requested": "cuda",
                "resolved": "cuda",
                "accelerator": True,
                "backend": "cuda",
                "name": "NVIDIA L4",
                "deviceIndex": 0,
                "deviceCount": 1,
                "computeCapability": "8.9",
                "totalMemoryBytes": 24 * 1024**3,
                "cudaRuntime": "13.0",
                "cudnnVersion": 91002,
                "cpuFallbackAllowed": False,
            },
        },
        "controls": {
            "security": {
                "functionSecrets": [],
                "inputSecretsPresent": False,
                "networkBlocked": True,
                "modalAccessRestricted": True,
                "singleUseContainer": True,
                "providerRetries": 0,
            },
            "quota": {
                "maxContainers": 1,
                "environmentBudgetUsd": 25.0,
                "observedSpendUsd": 1.2,
                "budgetAlertConfigured": True,
                "hardStopTested": True,
                "hardStopLayer": "gateway-postgres-quota",
                "providerBudgetAdvisory": True,
            },
            "cancellation": {
                "functionCallId": "fc-cancel",
                "providerTerminated": True,
                "jobCancelled": True,
                "lateResultDiscarded": True,
                "latencyS": 4.0,
            },
            "refund": {
                "debitedCredits": 1.0,
                "refundedCredits": 1.0,
                "ledgerEventId": "usage-refund-test",
                "reason": "provider-cancelled-before-materialization",
            },
            "retention": {
                "providerInputOutputMaximumDays": 7,
                "controlledNonPersonalInput": True,
                "recordedDeviceInput": False,
                "authoritativeArtifactDeleted": True,
                "providerCallDeletionMode": "automatic-maximum-7-days",
                "providerManualCallDeletionAvailable": False,
                "providerCallExpiryVerified": True,
                "providerExpiryEvidenceId": "modal-call-expiry-1201",
                "deletedAt": "2026-07-15T13:00:00Z",
                "providerExpiredAt": "2026-07-22T13:00:00Z",
            },
            "cost": {
                "currency": "USD",
                "providerReportedUsd": 1.2,
                "billingReportId": "billing-test",
                "billingLagAcknowledged": True,
                "sourceTagsVerified": True,
                "databaseReconciliationVerified": True,
                "jobEventId": "provider-cost-reconciled-1",
                "reconciledAt": "2026-07-15T14:00:00Z",
            },
            "slo": {
                "queueStartTargetS": 60.0,
                "queueStartObservedS": 5.0,
                "completionTargetS": 600.0,
                "completionObservedS": 120.0,
                "alertConfigured": True,
                "alertDeliveryTested": True,
                "owner": "platform-oncall",
            },
            "recovery": {
                "failureInjected": True,
                "providerCallResumed": True,
                "duplicateArtifactPrevented": True,
                "status": "passed",
                "evidenceId": "recovery-test",
            },
        },
        "nonClaims": [
            "This sandbox run is not a production live claim.",
            "Controlled simulation is not real-device or field transfer proof.",
            "Provider billing can lag and is reconciled from the cited report.",
        ],
    }


def test_complete_sandbox_evidence_passes():
    value = evidence()
    assert validate_sandbox_evidence(value, source_revision=REVISION) is value


@pytest.mark.parametrize(
    ("path", "value", "message"),
    [
        (("source", "worktreeDirty"), True, "clean checkout"),
        (("deployment", "deploymentContractHash"), "0" * 64, "deployment deploymentContractHash"),
        (("run", "deviceAuthority", "backend"), "cpu", "deviceAuthority backend"),
        (("controls", "security", "networkBlocked"), False, "security networkBlocked"),
        (("controls", "quota", "observedSpendUsd"), 30.0, "exceeds"),
        (("controls", "quota", "hardStopLayer"), "provider-budget", "hard-stop layer"),
        (("controls", "refund", "refundedCredits"), 0.0, "exactly reverse"),
        (("controls", "retention", "recordedDeviceInput"), True, "recorded-device"),
        (("controls", "retention", "providerExpiredAt"), "2026-07-21T13:00:00Z", "seven-day TTL"),
        (("controls", "slo", "completionObservedS"), 601.0, "exceeded"),
        (("controls", "recovery", "duplicateArtifactPrevented"), False, "duplicate"),
    ],
)
def test_incomplete_or_drifted_evidence_fails(path, value, message):
    row = deepcopy(evidence())
    target = row
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(ValueError, match=message):
        validate_sandbox_evidence(row, source_revision=REVISION)
