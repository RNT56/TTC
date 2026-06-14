import json
import sys

from forge_workers.training.jobs import train_offline_bc, train_policy


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
            {
                "provider": "live-sb3",
                "cacheKey": "policy:pass",
                "observations": ["estimator.attitude"],
                "actions": ["throttle"],
                "scorecard": {
                    "successRate": 0.93,
                    "robustness": {"mass+15%": 0.86, "kv-8%": 0.84, "wind4ms": 0.79},
                    "energyWh": 2.0,
                    "trainedOnEstimator": True,
                    "lineage": {"contractHash": "ef" * 32, "seed": "11", "codeVersion": "live"},
                    "exportable": True,
                },
            },
        ),
    )

    result = train_policy({"contractHash": "ef" * 32, "seed": 11})

    assert result["exportGate"] == "exportable"
    assert result["onnx"]["exportable"]
    assert result["scorecard"]["schemaVersion"] == "p7-scorecard-v1"
    assert result["scorecard"]["thresholds"] == {"minSuccess": 0.85, "minRobustness": 0.7}
    assert result["scorecard"]["reasons"] == []


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
