import hashlib
import json
from io import StringIO
from types import SimpleNamespace

import pytest

from forge_workers.mjx_benchmark import (
    CONTROLLED_PROTOCOL,
    PINNED_VERSIONS,
    _validate_request,
    _verify_checkout,
    main,
)


def _request(**overrides):
    contract_json = '{"id":"unit"}'
    contract_hash = hashlib.sha256(contract_json.encode()).hexdigest()
    payload = {
        "artifactKind": "mjxBenchmarkRequest",
        "schemaVersion": "1.0.0",
        "task": "sim.mjx-benchmark",
        "sourceRevision": "a" * 40,
        "requestSha256": "0" * 64,
        "worktreeClean": True,
        "maturity": "controlled-feasibility",
        "morphology": "p7-hover-multirotor",
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": "forge-admitted-model-snapshot/1.0.0",
            "modelId": "unit",
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
        "protocol": dict(CONTROLLED_PROTOCOL),
        "runtimePins": dict(PINNED_VERSIONS),
    }
    payload.update(overrides)
    if "requestSha256" not in overrides:
        body = {
            key: value
            for key, value in payload.items()
            if key not in {"sourceRevision", "requestSha256"}
        }
        payload["requestSha256"] = hashlib.sha256(
            json.dumps(
                body,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode()
        ).hexdigest()
    return payload


def test_request_accepts_only_the_frozen_protocol_and_runtime():
    assert _validate_request(_request())["worktreeClean"] is True

    changed_protocol = dict(CONTROLLED_PROTOCOL, repeats=4)
    with pytest.raises(ValueError, match="frozen controlled-feasibility"):
        _validate_request(_request(protocol=changed_protocol))

    changed_runtime = dict(PINNED_VERSIONS, jax="0.10.3")
    with pytest.raises(ValueError, match="reviewed P7-010 stack"):
        _validate_request(_request(runtimePins=changed_runtime))


def test_request_rejects_hash_and_authority_drift():
    with pytest.raises(ValueError, match="requestSha256"):
        _validate_request(_request(requestSha256="0" * 64))
    with pytest.raises(ValueError, match="worktreeClean"):
        _validate_request(_request(worktreeClean="yes"))
    with pytest.raises(ValueError, match="sourceRevision"):
        _validate_request(_request(sourceRevision="main"))


def test_direct_command_verifies_revision_and_cleanliness(monkeypatch):
    responses = iter(
        [
            SimpleNamespace(returncode=0, stdout=f"{'a' * 40}\n"),
            SimpleNamespace(returncode=0, stdout=""),
        ]
    )
    monkeypatch.setattr(
        "forge_workers.mjx_benchmark.subprocess.run",
        lambda *_args, **_kwargs: next(responses),
    )
    _verify_checkout(_request())

    responses = iter([SimpleNamespace(returncode=0, stdout=f"{'b' * 40}\n")])
    monkeypatch.setattr(
        "forge_workers.mjx_benchmark.subprocess.run",
        lambda *_args, **_kwargs: next(responses),
    )
    with pytest.raises(RuntimeError, match="sourceRevision"):
        _verify_checkout(_request())

    responses = iter(
        [
            SimpleNamespace(returncode=0, stdout=f"{'a' * 40}\n"),
            SimpleNamespace(returncode=0, stdout=" M workers/example.py\n"),
        ]
    )
    monkeypatch.setattr(
        "forge_workers.mjx_benchmark.subprocess.run",
        lambda *_args, **_kwargs: next(responses),
    )
    with pytest.raises(RuntimeError, match="worktreeClean"):
        _verify_checkout(_request())


def test_command_fails_closed_before_emitting_partial_json(monkeypatch):
    def _failed(_payload):
        raise RuntimeError("reviewed MJX runtime is unavailable")

    monkeypatch.setattr(
        "forge_workers.mjx_benchmark.run_feasibility_benchmark",
        _failed,
    )
    stdout = StringIO()
    stderr = StringIO()

    code = main(
        stdin=StringIO(json.dumps(_request())),
        stdout=stdout,
        stderr=stderr,
    )

    assert code == 2
    assert stdout.getvalue() == ""
    assert "reviewed MJX runtime is unavailable" in stderr.getvalue()
