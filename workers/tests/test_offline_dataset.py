from __future__ import annotations

import copy

import pytest

from forge_workers.training.bundle import (
    POLICY_INPUT_LAYOUT,
    POLICY_OUTPUT_LAYOUT,
    POLICY_TENSOR_SCHEMA,
    POLICY_TENSOR_VERSION,
)
from forge_workers.training.offline_dataset import (
    stable_sha256,
    validate_offline_training_tape,
)
from forge_workers.training.tasks import task_definition


def _authority() -> tuple[dict, dict, dict]:
    contract_hash = "ab" * 32
    tensor = {
        "schema": POLICY_TENSOR_SCHEMA,
        "schemaVersion": POLICY_TENSOR_VERSION,
        "coordinateFrame": "forge-y-up-rh-m",
        "input": {
            "name": "observations",
            "shape": [1, len(POLICY_INPUT_LAYOUT)],
            "layout": list(POLICY_INPUT_LAYOUT),
        },
        "output": {
            "name": "actions",
            "shape": [1, len(POLICY_OUTPUT_LAYOUT)],
            "layout": list(POLICY_OUTPUT_LAYOUT),
        },
        "rateHz": 50,
    }
    bundle = {"contractHash": contract_hash, "tensor": tensor}
    task = task_definition("hover-hold")
    tape = {
        "schemaVersion": "1.0.0",
        "header": {
            "contractHash": contract_hash,
            "training": {
                "schemaVersion": "forge-offline-training-tape/1.0.0",
                "task": {
                    key: task[key]
                    for key in ("id", "suite", "version", "coordinateFrame", "definitionHash")
                },
                "tensor": tensor,
                "observationSource": "estimator-policy-tensor",
                "actionSource": "reviewed-controller-action",
                "captureMaturity": "controlled-synthetic",
            },
        },
        "frames": [
            {
                "t": index * 0.02,
                "state": {
                    "t": index * 0.02,
                    "observation": [index / 1000] * len(POLICY_INPUT_LAYOUT),
                    "action": [0.1, -0.1, 0.05, -0.05],
                },
            }
            for index in range(64)
        ],
    }
    payload = {
        "telemetryLogId": "log-1",
        "telemetryLogSha256": stable_sha256(tape),
        "tape": tape,
    }
    return payload, bundle, task


def test_exact_offline_tape_builds_source_bound_dataset():
    payload, bundle, task = _authority()

    observations, actions, summary = validate_offline_training_tape(payload, bundle, task)

    assert len(observations) == 64
    assert len(actions) == 64
    assert summary["sampleCount"] == 64
    assert summary["durationS"] == 1.26
    assert summary["sourceLogSha256"] == payload["telemetryLogSha256"]
    assert summary["taskDefinitionHash"] == task["definitionHash"]
    assert summary["observationColumns"] == list(POLICY_INPUT_LAYOUT)
    assert summary["actionColumns"] == list(POLICY_OUTPUT_LAYOUT)
    assert len(summary["datasetHash"]) == 64


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (
            lambda payload: (
                payload["tape"]["frames"][1].__setitem__("t", 0.0),
                payload["tape"]["frames"][1]["state"].__setitem__("t", 0.0),
            ),
            "strictly increasing",
        ),
        (
            lambda payload: payload["tape"]["frames"][0]["state"]["observation"].__setitem__(
                0, float("nan")
            ),
            "finite JSON",
        ),
        (
            lambda payload: payload["tape"]["frames"][0]["state"]["action"].__setitem__(0, 1.1),
            r"outside \[-1.0, 1.0\]",
        ),
        (
            lambda payload: payload["tape"]["frames"][0]["state"].__setitem__(
                "simulatorTruth", [0, 0, 0]
            ),
            "fields drifted",
        ),
        (
            lambda payload: payload["tape"]["header"]["training"].__setitem__(
                "observationSource", "simulator-ground-truth"
            ),
            "estimator policy tensor",
        ),
        (
            lambda payload: payload["tape"]["header"]["training"].__setitem__(
                "captureMaturity", "recorded-device"
            ),
            "capture maturity is missing or unsupported",
        ),
    ],
)
def test_offline_tape_refuses_repair_truth_and_unbounded_values(mutate, message):
    payload, bundle, task = _authority()
    mutate(payload)
    try:
        payload["telemetryLogSha256"] = stable_sha256(payload["tape"])
    except ValueError:
        pass

    with pytest.raises(ValueError, match=message):
        validate_offline_training_tape(payload, bundle, task)


def test_offline_tape_refuses_source_task_and_tensor_substitution():
    payload, bundle, task = _authority()
    drifted = copy.deepcopy(payload)
    drifted["telemetryLogSha256"] = "0" * 64
    with pytest.raises(ValueError, match="hash does not match"):
        validate_offline_training_tape(drifted, bundle, task)

    drifted = copy.deepcopy(payload)
    drifted["tape"]["header"]["training"]["task"]["definitionHash"] = "0" * 64
    drifted["telemetryLogSha256"] = stable_sha256(drifted["tape"])
    with pytest.raises(ValueError, match="task authority drifted"):
        validate_offline_training_tape(drifted, bundle, task)

    drifted = copy.deepcopy(payload)
    drifted["tape"]["header"]["training"]["tensor"]["input"]["layout"].reverse()
    drifted["telemetryLogSha256"] = stable_sha256(drifted["tape"])
    with pytest.raises(ValueError, match="tensor authority drifted"):
        validate_offline_training_tape(drifted, bundle, task)
