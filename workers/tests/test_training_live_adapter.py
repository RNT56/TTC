import json
import sys

from forge_workers.training.jobs import fit_sysid, train_offline_bc, train_policy
from forge_workers.training.bundle import POLICY_INPUT_LAYOUT, POLICY_OUTPUT_LAYOUT
from forge_workers.training.offline_dataset import (
    offline_domain_randomization,
    stable_sha256,
    validate_offline_training_tape,
)
from forge_workers.training.tasks import task_definition


def _command(tmp_path, payload):
    script = tmp_path / "sb3_cmd.py"
    output = json.dumps(payload)
    script.write_text(
        "import json, sys\n"
        "json.loads(sys.stdin.read())\n"
        f"print({output!r})\n"
    )
    return f"{sys.executable} {script}"


def _offline_command(tmp_path, payload):
    script = tmp_path / "offline_cmd.py"
    output = json.dumps(payload)
    script.write_text(
        "import json, sys\n"
        "json.loads(sys.stdin.read())\n"
        f"print({output!r})\n"
    )
    return f"{sys.executable} {script}"


def _authorized_policy(contract_hash: str) -> dict:
    task = task_definition("hover-hold")
    targets = [
        {"kind": target["kind"], "xyzM": target["xyz"], "radiusM": target["radiusM"]}
        for target in task["env"]["targets"]
    ]
    return {
        "provider": "live-sb3",
        "cacheKey": "policy:pass",
        "task": {
            "id": task["id"],
            "suite": task["suite"],
            "version": task["version"],
            "coordinateFrame": task["coordinateFrame"],
            "definitionHash": task["definitionHash"],
            "target": {"xyzM": targets[0]["xyzM"]},
            "targets": targets,
        },
        "io": {
            "observations": ["estimator.attitude", "estimator.angularRate", "target.error"],
            "actions": list(POLICY_OUTPUT_LAYOUT),
            "onnxHeader": {
                "contractHash": contract_hash,
                "task": task["id"],
                "taskVersion": task["version"],
                "taskDefinitionHash": task["definitionHash"],
            },
            "tensor": {
                "schema": "forge-policy-tensor",
                "schemaVersion": "2.0.0",
                "coordinateFrame": "forge-y-up-rh-m",
                "input": {"name": "observations", "shape": [1, 14], "layout": list(POLICY_INPUT_LAYOUT)},
                "output": {"name": "actions", "shape": [1, 4], "layout": list(POLICY_OUTPUT_LAYOUT)},
                "rateHz": 50,
            },
        },
        "scorecard": {
            "task": task["id"],
            "taskVersion": task["version"],
            "successRate": 0.93,
            "robustness": {"mass+15%": 0.86, "kv-8%": 0.84, "wind4ms": 0.79},
            "energyWh": 2.0,
            "trainedOnEstimator": True,
            "lineage": {
                "contractHash": contract_hash,
                "seed": "11",
                "codeVersion": "live",
                "taskDefinitionHash": task["definitionHash"],
            },
            "exportable": True,
        },
    }


def test_external_policy_is_rejected_when_trained_on_ground_truth(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_SB3_TRAIN_CMD",
        _command(
            tmp_path,
            {
                "artifactKind": "policy",
                "provider": "live-sb3",
                "cacheKey": "policy:gt",
                "scorecard": {
                    "successRate": 0.99,
                    "robustness": {"mass+15%": 0.94, "kv-8%": 0.93},
                    "energyWh": 1.8,
                    "trainedOnEstimator": False,
                    "lineage": {"contractHash": "ab" * 32, "seed": "5", "codeVersion": "live"},
                    "exportable": True,
                },
            },
        ),
    )

    result = train_policy({"contractHash": "ab" * 32, "seed": 5})

    assert result["provider"] == "live-sb3"
    assert result["exportGate"] == "blocked"
    assert not result["onnx"]["exportable"]
    assert not result["scorecard"]["exportable"]
    assert any("SIM-004" in reason for reason in result["scorecard"]["reasons"])


def test_external_policy_missing_scorecard_fields_fails_closed(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_SB3_TRAIN_CMD",
        _command(tmp_path, {"provider": "live-sb3", "cacheKey": "policy:missing"}),
    )

    result = train_policy({"contractHash": "cd" * 32, "seed": 9})

    assert result["exportGate"] == "blocked"
    assert not result["scorecard"]["exportable"]
    assert "robustness grid missing" in result["scorecard"]["reasons"]
    assert "energyWh must be positive" in result["scorecard"]["reasons"]


def test_external_policy_with_complete_scorecard_exports(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_SB3_TRAIN_CMD",
        _command(
            tmp_path,
            _authorized_policy("ef" * 32),
        ),
    )

    result = train_policy({"contractHash": "ef" * 32, "seed": 11})

    assert result["exportGate"] == "exportable"
    assert result["onnx"]["exportable"]
    assert result["scorecard"]["schemaVersion"] == "p7-scorecard-v1"
    assert result["scorecard"]["thresholds"] == {"minSuccess": 0.85, "minRobustness": 0.7}
    assert result["scorecard"]["reasons"] == []

    drifted = train_policy({"contractHash": "aa" * 32, "seed": 11})
    assert drifted["exportGate"] == "blocked"
    assert "lineage contractHash does not match" in " ".join(drifted["scorecard"]["reasons"])

    monkeypatch.setenv(
        "FORGE_SB3_TRAIN_CMD",
        _command(
            tmp_path,
            {
                "provider": "live-sb3",
                "onnx": {"modelBase64": "!!!", "byteSize": 3, "sha256": "0" * 64, "opset": 18},
                "scorecard": {
                    "successRate": 0.93,
                    "robustness": {"mass+15%": 0.86},
                    "energyWh": 2.0,
                    "trainedOnEstimator": True,
                    "lineage": {"contractHash": "ef" * 32, "seed": "11"},
                    "exportable": True,
                },
            },
        ),
    )
    tampered = train_policy({"contractHash": "ef" * 32, "seed": 11})
    assert tampered["exportGate"] == "blocked"
    assert "ONNX bytes do not match" in " ".join(tampered["scorecard"]["reasons"])


def test_external_offline_bc_accepts_dataset_but_blocks_policy_export(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_OFFLINE_RL_CMD",
        _offline_command(
            tmp_path,
            {
                "provider": "live-offline-rl",
                "cacheKey": "offline:pass",
                "dataset": {
                    "sampleCount": 12,
                    "durationS": 2.5,
                    "observationColumns": ["estimator.attitude"],
                    "actionColumns": ["action.throttle"],
                },
                "policyWarmstart": {"cacheKey": "offline:pass", "compatible": True},
                "scorecard": {"exportable": True, "lineage": {"contractHash": "aa" * 32, "seed": "3"}},
            },
        ),
    )

    result = train_offline_bc({"contractHash": "aa" * 32, "seed": 3, "task": "hover-hold"})

    assert result["provider"] == "live-offline-rl"
    assert result["dataset"]["quality"] == "accepted"
    assert result["policyWarmstart"]["compatible"]
    assert not result["scorecard"]["exportable"]
    assert result["scorecard"]["reasons"] == ["offline BC warmstart requires live fine-tune before export"]


def test_external_offline_bc_fails_closed_without_actions(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_OFFLINE_RL_CMD",
        _offline_command(
            tmp_path,
            {
                "artifactKind": "offline-learning",
                "provider": "live-offline-rl",
                "dataset": {"sampleCount": 2, "observationColumns": ["estimator.attitude"]},
                "policyWarmstart": {"cacheKey": "offline:bad", "compatible": True},
            },
        ),
    )

    result = train_offline_bc({"contractHash": "bb" * 32, "seed": 4})

    assert result["dataset"]["quality"] == "held"
    assert not result["policyWarmstart"]["compatible"]
    assert result["rejectReason"] == "offline BC requires at least 3 samples"
    assert "offline BC requires action columns" in result["notes"]
    assert not result["scorecard"]["exportable"]


def test_external_offline_bc_normalizes_exact_bc_to_ppo_policy(tmp_path, monkeypatch):
    contract_hash = "ac" * 32
    external = _authorized_policy(contract_hash)
    task = task_definition("hover-hold")
    tensor = external["io"]["tensor"]
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
                    "observation": [index / 1000] * 14,
                    "action": [0.1, -0.1, 0.05, -0.05],
                },
            }
            for index in range(64)
        ],
    }
    payload = {
        "contractHash": contract_hash,
        "seed": 11,
        "task": "hover-hold",
        "recipe": "p7-offline-bc-v1",
        "telemetryLogId": "log-1",
        "telemetryLogSha256": stable_sha256(tape),
        "tape": tape,
        "jobKind": "caller-controlled-value",
    }
    _, _, summary = validate_offline_training_tape(
        payload,
        {"contractHash": contract_hash, "tensor": tensor},
        task,
    )
    parameter_before = "c" * 64
    parameter_digest = "d" * 64
    parameter_after = "e" * 64
    randomization = offline_domain_randomization(ground=False)
    external["scorecard"]["lineage"].update(
        {
            "sourceLogId": summary["sourceLogId"],
            "sourceLogSha256": summary["sourceLogSha256"],
            "offlineDatasetHash": summary["datasetHash"],
            "warmstartParameterDigest": parameter_digest,
        }
    )
    external.update(
        {
            "artifactKind": "policy",
            "algorithm": "ppo",
            "domainRandomization": randomization,
            "onnx": {
                "cacheKey": "offline-policy:pass",
                "opset": 18,
                "path": "offline-policy:pass/policy.onnx",
                "modelBase64": "b25ueA==",
                "byteSize": 4,
                "sha256": "87e93f89f2be0db364e8be052f79f389e6c2da239831922e24513288af522a43",
            },
            "dataset": {**summary, "quality": "accepted"},
            "policyWarmstart": {
                "schemaVersion": "forge-policy-warmstart/1.0.0",
                "datasetHash": summary["datasetHash"],
                "parameterDigest": parameter_digest,
                "compatible": True,
            },
            "training": {
                "recipe": "p7-offline-bc-v1",
                "requestedTimesteps": 256,
                "completedTimesteps": 256,
                "optimizerUpdated": True,
                "deterministicAlgorithms": True,
                "truthExposedToPolicy": False,
                "device": "cpu",
                "parameterDigestBefore": parameter_before,
                "parameterDigestAfter": parameter_after,
                "curriculum": [
                    {
                        "kind": "behavior-cloning",
                        "datasetHash": summary["datasetHash"],
                        "sourceLogSha256": summary["sourceLogSha256"],
                        "samples": summary["sampleCount"],
                        "epochs": 12,
                        "batchSize": 64,
                        "finalMeanSquaredError": 0.01,
                        "parameterDigestAfter": parameter_digest,
                        "observationSource": "estimator-policy-tensor",
                        "actionSource": "reviewed-controller-action",
                        "captureMaturity": "controlled-synthetic",
                        "truthExposedToPolicy": False,
                    },
                    {
                        "kind": "ppo-randomized-fine-tune",
                        "timesteps": 256,
                        "domainRandomization": randomization,
                    },
                ],
            },
        }
    )
    script = tmp_path / "offline_policy_cmd.py"
    output = json.dumps(external)
    script.write_text(
        "import json, sys\n"
        "request = json.loads(sys.stdin.read())\n"
        "assert request['jobKind'] == 'train.offline-bc'\n"
        f"print({output!r})\n"
    )
    monkeypatch.setenv("FORGE_OFFLINE_RL_CMD", f"{sys.executable} {script}")

    result = train_offline_bc(payload)

    assert result["artifactKind"] == "policy"
    assert result["dataset"] == {**summary, "quality": "accepted"}
    assert result["policyWarmstart"]["parameterDigest"] == parameter_digest
    assert result["exportGate"] == "exportable"
    assert result["scorecard"]["exportable"]

    external["dataset"]["datasetHash"] = "0" * 64
    script.write_text(
        "import json, sys\n"
        "request = json.loads(sys.stdin.read())\n"
        "assert request['jobKind'] == 'train.offline-bc'\n"
        f"print({json.dumps(external)!r})\n"
    )
    substituted = train_offline_bc(payload)
    assert substituted["exportGate"] == "blocked"
    assert substituted["dataset"]["quality"] == "held"
    assert "dataset summary does not match" in " ".join(substituted["scorecard"]["reasons"])

    external["dataset"] = {**summary, "quality": "accepted"}
    external["training"]["curriculum"][1]["domainRandomization"] = {"massPct": 1.0}
    script.write_text(
        "import json, sys\n"
        "request = json.loads(sys.stdin.read())\n"
        "assert request['jobKind'] == 'train.offline-bc'\n"
        f"print({json.dumps(external)!r})\n"
    )
    drifted_recipe = train_offline_bc(payload)
    assert drifted_recipe["exportGate"] == "blocked"
    assert "exact BC-to-PPO recipe" in " ".join(drifted_recipe["scorecard"]["reasons"])

    external["training"]["curriculum"][1]["domainRandomization"] = randomization
    external.pop("onnx")
    script.write_text(
        "import json, sys\n"
        "request = json.loads(sys.stdin.read())\n"
        "assert request['jobKind'] == 'train.offline-bc'\n"
        f"print({json.dumps(external)!r})\n"
    )
    missing_onnx = train_offline_bc(payload)
    assert missing_onnx["exportGate"] == "blocked"
    assert "requires exact bounded ONNX bytes" in " ".join(missing_onnx["scorecard"]["reasons"])


def test_external_sysid_requires_accepted_fit_and_sim_patch(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_SYSID_FIT_CMD",
        _offline_command(
            tmp_path,
            {
                "provider": "live-bench",
                "sampleCount": 12,
                "fit": {"accepted": True, "rIntMohm": 38.2, "batterySagRmse": 0.03, "currentRmseA": 0.8},
                "simPatch": [{"op": "replace", "path": "/sim/battery/r_int_mohm", "value": 38.2}],
            },
        ),
    )

    result = fit_sysid({"samples": [{"t": 0}, {"t": 1}, {"t": 2}]})

    assert result["provider"] == "live-bench"
    assert result["fit"]["accepted"]
    assert result["fit"]["rIntMohm"] == 38.2
    assert result["simPatch"] == [{"op": "replace", "path": "/sim/battery/r_int_mohm", "value": 38.2}]
    assert result["rejectReason"] is None


def test_external_sysid_fails_closed_without_patch(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_SYSID_FIT_CMD",
        _offline_command(tmp_path, {"provider": "live-bench", "sampleCount": 2, "fit": {"accepted": True}}),
    )

    result = fit_sysid({})

    assert not result["fit"]["accepted"]
    assert result["simPatch"] == []
    assert result["rejectReason"] == "system-ID requires at least 3 telemetry samples"
    assert "system-ID fit requires a simPatch" in result["fit"]["reasons"]
