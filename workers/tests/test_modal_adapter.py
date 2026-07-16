from __future__ import annotations

import pytest

from forge_workers.faults import ProviderRecoveryPendingError, ProviderUnavailableError
from forge_workers.modal_adapter import ModalGpuAdapter
from forge_workers.modal_app import deployment_contract


REVISION = "ab" * 20


class FakeCall:
    object_id = "fc-test-call"

    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.timeout = None
        self.cancelled = False

    def get(self, timeout):
        self.timeout = timeout
        if self.error is not None:
            raise self.error
        return self.result

    def cancel(self, terminate_containers=False):
        self.cancelled = terminate_containers


class FakeFunction:
    def __init__(self, call):
        self.call = call
        self.payload = None

    def spawn(self, payload):
        self.payload = payload
        return self.call


def _configure(monkeypatch):
    contract = deployment_contract(REVISION)
    monkeypatch.setenv("MODAL_TOKEN_ID", "test-token-id")
    monkeypatch.setenv("MODAL_TOKEN_SECRET", "test-token-secret")
    monkeypatch.setenv("FORGE_MODAL_ENVIRONMENT", "sandbox")
    monkeypatch.setenv("FORGE_MODAL_FUNCTION_VERSION", "17")
    monkeypatch.setenv("FORGE_MODAL_SOURCE_REVISION", REVISION)
    monkeypatch.setenv("FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH", contract["contractHash"])
    return contract


def _result(contract):
    return {
        "provider": "modal-sb3-mujoco",
        "providerEvidence": {
            "schemaVersion": "forge-modal-provider-evidence/1.0.0",
            "provider": "modal",
            "appName": "forge-workers",
            "functionName": "train_policy_gpu",
            "sourceRevision": REVISION,
            "deploymentContractHash": contract["contractHash"],
            "sdkVersion": "1.5.2",
            "networkBlocked": True,
            "modalAccessRestricted": True,
            "functionSecrets": [],
            "singleUseContainer": True,
            "providerRetries": 0,
        },
    }


def test_training_spawns_exact_versioned_function_and_preserves_call_authority(monkeypatch):
    contract = _configure(monkeypatch)
    call = FakeCall(_result(contract))
    function = FakeFunction(call)
    clock = iter([0.0, 0.1, 0.2])
    recorded = []
    adapter = ModalGpuAdapter(
        function_loader=lambda: function,
        call_sink=lambda call_id, identity: recorded.append((call_id, identity)),
        clock=lambda: next(clock),
    )

    result = adapter.run("train.policy", {"jobKind": "train.policy", "timeoutS": 90})

    assert function.payload == {"jobKind": "train.policy", "timeoutS": 90}
    assert call.timeout == 5.0
    evidence = result["providerEvidence"]
    assert evidence["functionCallId"] == "fc-test-call"
    assert evidence["functionVersion"] == 17
    assert evidence["environment"] == "sandbox"
    assert evidence["clientWallTimeS"] == 0.2
    assert recorded[0][0] == "fc-test-call"
    assert recorded[0][1]["functionVersion"] == 17
    assert not call.cancelled


def test_training_timeout_terminates_provider_container(monkeypatch):
    _configure(monkeypatch)
    call = FakeCall(error=TimeoutError("still running"))
    clock = iter([0.0, 10.0])
    cancelled = []
    adapter = ModalGpuAdapter(
        function_loader=lambda: FakeFunction(call),
        cancelled_sink=cancelled.append,
        clock=lambda: next(clock),
    )

    with pytest.raises(ProviderUnavailableError, match="timed out and was cancelled"):
        adapter.run("train.policy", {"timeoutS": 9})
    assert call.cancelled
    assert cancelled == ["fc-test-call"]


def test_database_cancellation_authority_terminates_provider_container(monkeypatch):
    _configure(monkeypatch)
    call = FakeCall(_result(deployment_contract(REVISION)))
    cancelled = []
    adapter = ModalGpuAdapter(
        function_loader=lambda: FakeFunction(call),
        cancellation_requested=lambda: True,
        cancelled_sink=cancelled.append,
        clock=lambda: 0.0,
    )

    with pytest.raises(ProviderUnavailableError, match="cancelled by job authority"):
        adapter.run("train.policy", {})
    assert call.cancelled
    assert cancelled == ["fc-test-call"]


def test_call_identity_persistence_failure_cancels_unowned_provider_work(monkeypatch):
    _configure(monkeypatch)
    call = FakeCall(_result(deployment_contract(REVISION)))
    cancelled = []

    def fail_to_persist(_call_id, _identity):
        raise RuntimeError("lease was lost before persistence")

    adapter = ModalGpuAdapter(
        function_loader=lambda: FakeFunction(call),
        call_sink=fail_to_persist,
        cancelled_sink=cancelled.append,
        clock=lambda: 0.0,
    )

    with pytest.raises(RuntimeError, match="lease was lost before persistence"):
        adapter.run("train.policy", {})
    assert call.cancelled
    assert cancelled == ["fc-test-call"]


def test_recovery_reattaches_persisted_call_without_spawning_or_repersisting(monkeypatch):
    contract = _configure(monkeypatch)
    call = FakeCall(_result(contract))
    clock = iter([0.0, 0.1, 0.2])
    persisted_again = []
    adapter = ModalGpuAdapter(
        function_loader=lambda: pytest.fail("recovery must not load or spawn the function"),
        call_loader=lambda call_id: call if call_id == "fc-test-call" else None,
        resume_call_id="fc-test-call",
        resume_identity={
            "environment": "sandbox",
            "functionVersion": 17,
            "sourceRevision": REVISION,
            "deploymentContractHash": contract["contractHash"],
            "submittedAt": "2026-07-15T12:00:00+00:00",
        },
        call_sink=lambda call_id, identity: persisted_again.append((call_id, identity)),
        clock=lambda: next(clock),
    )

    result = adapter.run("train.policy", {"timeoutS": 90})

    assert result["providerEvidence"]["functionCallId"] == "fc-test-call"
    assert result["providerEvidence"]["recoveredByFunctionCallId"] is True
    assert result["providerEvidence"]["submittedAt"] == "2026-07-15T12:00:00+00:00"
    assert persisted_again == []
    assert not call.cancelled


def test_unresolved_recovery_never_spawns_replacement_call(monkeypatch):
    contract = _configure(monkeypatch)
    adapter = ModalGpuAdapter(
        function_loader=lambda: pytest.fail("unresolved recovery must not spawn a replacement"),
        call_loader=lambda _call_id: (_ for _ in ()).throw(RuntimeError("provider unavailable")),
        resume_call_id="fc-test-call",
        resume_identity={
            "environment": "sandbox",
            "functionVersion": 17,
            "sourceRevision": REVISION,
            "deploymentContractHash": contract["contractHash"],
            "submittedAt": "2026-07-15T12:00:00+00:00",
        },
        clock=lambda: 0.0,
    )

    with pytest.raises(ProviderRecoveryPendingError) as raised:
        adapter.run("train.policy", {})
    assert raised.value.code == "provider-recovery-pending"


def test_ambiguous_get_after_persistence_requires_call_id_recovery(monkeypatch):
    _configure(monkeypatch)
    call = FakeCall(error=RuntimeError("provider transport became ambiguous"))
    recorded = []
    adapter = ModalGpuAdapter(
        function_loader=lambda: FakeFunction(call),
        call_sink=lambda call_id, identity: recorded.append((call_id, identity)),
        clock=lambda: 0.0,
    )

    with pytest.raises(ProviderRecoveryPendingError) as raised:
        adapter.run("train.policy", {})
    assert raised.value.code == "provider-recovery-pending"
    assert recorded[0][0] == "fc-test-call"
    assert not call.cancelled


def test_training_refuses_deployment_or_provider_evidence_drift(monkeypatch):
    contract = _configure(monkeypatch)
    monkeypatch.setenv("FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH", "0" * 64)
    adapter = ModalGpuAdapter(function_loader=lambda: FakeFunction(FakeCall(_result(contract))))
    with pytest.raises(RuntimeError, match="does not match source authority"):
        adapter.run("train.policy", {})

    monkeypatch.setenv("FORGE_MODAL_DEPLOYMENT_CONTRACT_HASH", contract["contractHash"])
    drifted = _result(contract)
    drifted["providerEvidence"]["networkBlocked"] = False
    adapter = ModalGpuAdapter(function_loader=lambda: FakeFunction(FakeCall(drifted)))
    with pytest.raises(RuntimeError, match="missing or drifted"):
        adapter.run("train.policy", {})


def test_nontraining_modal_task_never_reports_fake_submission(monkeypatch):
    monkeypatch.setenv("MODAL_TOKEN_ID", "test-token-id")
    monkeypatch.setenv("MODAL_TOKEN_SECRET", "test-token-secret")
    monkeypatch.delenv("FORGE_MODAL_ENDPOINT", raising=False)
    with pytest.raises(RuntimeError, match="no provider call was submitted"):
        ModalGpuAdapter().run("photoscan.single", {})


def test_explicit_cancel_terminates_provider_container():
    call = FakeCall()
    adapter = ModalGpuAdapter(call_loader=lambda call_id: call if call_id == "fc-test" else None)
    adapter.cancel("fc-test")
    assert call.cancelled
