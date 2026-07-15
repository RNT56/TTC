import io
import json

import pytest

from forge_workers.training import offline_runner
import forge_workers.training.sb3_training as sb3_training


@pytest.mark.parametrize(
    ("payload", "message"),
    [
        ([], "one JSON object"),
        ({"jobKind": "train.policy", "recipe": "p7-offline-bc-v1"}, "requests only"),
        ({"jobKind": "train.offline-bc", "recipe": "unknown"}, "requires p7-offline-bc-v1"),
    ],
)
def test_offline_runner_rejects_wrong_authority(payload, message):
    stdout = io.StringIO()
    stderr = io.StringIO()

    assert offline_runner.main(io.StringIO(json.dumps(payload)), stdout, stderr) == 2
    assert stdout.getvalue() == ""
    assert message in stderr.getvalue()


def test_offline_runner_emits_one_finite_json_document(monkeypatch):
    request = {
        "jobKind": "train.offline-bc",
        "recipe": "p7-offline-bc-v1",
        "contractHash": "ab" * 32,
    }
    monkeypatch.setattr(offline_runner, "compile_training_bundle", lambda payload: {"request": payload})
    monkeypatch.setattr(
        sb3_training,
        "train_sb3_policy",
        lambda payload, bundle: {"artifactKind": "policy", "payload": payload, "bundle": bundle},
    )
    stdout = io.StringIO()
    stderr = io.StringIO()

    assert offline_runner.main(io.StringIO(json.dumps(request)), stdout, stderr) == 0
    assert stderr.getvalue() == ""
    assert json.loads(stdout.getvalue()) == {
        "artifactKind": "policy",
        "payload": request,
        "bundle": {"request": request},
    }


def test_offline_runner_bounds_stdin_before_parsing():
    stdout = io.StringIO()
    stderr = io.StringIO()

    assert offline_runner.main(io.StringIO("x" * (4 * 1024 * 1024 + 1)), stdout, stderr) == 2
    assert "exceeds 4 MiB" in stderr.getvalue()
