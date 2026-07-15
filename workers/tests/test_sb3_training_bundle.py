from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

import pytest

from forge_workers.training.bundle import (
    SNAPSHOT_SCHEMA,
    compile_training_bundle,
    validate_training_bundle,
)

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR = ROOT / "target" / "debug" / "forge-validate"
CONTRACT = ROOT / "examples" / "vx2-mini.forge.json"
ROVER_CONTRACT = ROOT / "workers" / "tests" / "fixtures" / "rover-training.forge.json"
QUADRUPED_CONTRACT = ROOT / "examples" / "qd-mini.forge.json"


def request() -> dict:
    contract_json = CONTRACT.read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    return {
        "jobKind": "train.policy",
        "task": "hover-hold",
        "modelId": "vx2-mini",
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": SNAPSHOT_SCHEMA,
            "modelId": "vx2-mini",
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
    }


def ground_request(path: Path, task: str) -> dict:
    contract_json = path.read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    return {
        "jobKind": "train.policy",
        "task": task,
        "modelId": path.stem,
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": SNAPSHOT_SCHEMA,
            "modelId": path.stem,
            "contractHash": contract_hash,
            "contractJson": contract_json,
        },
    }


def test_gateway_snapshot_compiles_through_rust_training_authority(monkeypatch):
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
    bundle = compile_training_bundle(request())

    assert bundle["artifactKind"] == "trainingMuJoCoBundle"
    assert bundle["contractHash"] == request()["contractHash"]
    assert bundle["mujocoVersion"] == "3.9.0"
    assert bundle["schemaVersion"] == "2.0.0"
    assert bundle["tensor"]["schemaVersion"] == "2.0.0"
    assert bundle["tensor"]["input"]["shape"] == [1, 14]
    assert bundle["tensor"]["output"]["shape"] == [1, 4]
    assert "<freejoint/>" in bundle["mjcf"]
    assert len(bundle["powertrain"]["curve"]) == 101
    assert bundle["control"]["tiltMaxRad"] == 0.4
    assert bundle["control"]["yawRateRadS"] == 2.4


def test_snapshot_and_bundle_tampering_fail_closed(monkeypatch):
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
    tampered = request()
    tampered["modelSnapshot"]["contractJson"] += " "
    with pytest.raises(ValueError, match="hash mismatch"):
        compile_training_bundle(tampered)

    bundle = compile_training_bundle(request())
    drifted = copy.deepcopy(bundle)
    drifted["tensor"]["input"]["layout"][0] = "simulator.truth.roll"
    with pytest.raises(ValueError, match="tensor input drifted"):
        validate_training_bundle(drifted, request()["contractHash"])

    extra = copy.deepcopy(bundle)
    extra["providerOverride"] = "untrusted"
    with pytest.raises(ValueError, match="fields drifted"):
        validate_training_bundle(extra, request()["contractHash"])

    external_mjcf = copy.deepcopy(bundle)
    external_mjcf["mjcf"] = external_mjcf["mjcf"].replace(
        "</mujoco>", '<include file="untrusted.xml"/></mujoco>'
    )
    with pytest.raises(ValueError, match="external files"):
        validate_training_bundle(external_mjcf, request()["contractHash"])

    no_thrust_authority = copy.deepcopy(bundle)
    for point in no_thrust_authority["powertrain"]["curve"]:
        point["totalThrustN"] = 0.0
    with pytest.raises(ValueError, match="authority above computed weight"):
        validate_training_bundle(no_thrust_authority, request()["contractHash"])


@pytest.mark.parametrize(
    ("path", "task", "archetype", "input_count", "action_count"),
    [
        (ROVER_CONTRACT, "line-follow", "rover", 11, 2),
        (QUADRUPED_CONTRACT, "walk-to-target", "quadruped", 27, 8),
    ],
)
def test_ground_snapshots_compile_to_exact_contract_derived_authority(
    monkeypatch, path, task, archetype, input_count, action_count
):
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
    payload = ground_request(path, task)
    bundle = compile_training_bundle(payload)

    assert bundle["artifactKind"] == "groundTrainingMuJoCoBundle"
    assert bundle["schemaVersion"] == "1.0.0"
    assert bundle["archetype"] == archetype
    assert bundle["tensor"]["schema"] == "forge-ground-policy-tensor"
    assert bundle["tensor"]["schemaVersion"] == "1.0.0"
    assert bundle["tensor"]["input"]["shape"] == [1, input_count]
    assert bundle["tensor"]["output"]["shape"] == [1, action_count]
    assert bundle["mjcf"].count('name="forge_training_ground"') == 1
    assert bundle["control"]["joints"]
    assert all(joint["maxTorqueNm"] > 0 for joint in bundle["control"]["joints"])
    assert all(joint["maxVelocityRadS"] > 0 for joint in bundle["control"]["joints"])


def test_ground_bundle_tampering_fails_closed(monkeypatch):
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
    payload = ground_request(ROVER_CONTRACT, "line-follow")
    bundle = compile_training_bundle(payload)

    truth_input = copy.deepcopy(bundle)
    truth_input["tensor"]["input"]["layout"][0] = "simulator.truth.roll"
    with pytest.raises(ValueError, match="ground training tensor input drifted"):
        validate_training_bundle(truth_input, payload["contractHash"])

    missing_ground = copy.deepcopy(bundle)
    missing_ground["mjcf"] = missing_ground["mjcf"].replace(
        'name="forge_training_ground"', 'name="removed_ground"'
    )
    with pytest.raises(ValueError, match="ground training MJCF"):
        validate_training_bundle(missing_ground, payload["contractHash"])

    no_torque = copy.deepcopy(bundle)
    no_torque["control"]["joints"][0]["maxTorqueNm"] = 0.0
    with pytest.raises(ValueError, match="maxTorqueNm"):
        validate_training_bundle(no_torque, payload["contractHash"])

    wrong_side = copy.deepcopy(bundle)
    wrong_side["control"]["joints"][0]["side"] = "right"
    with pytest.raises(ValueError, match="left and right"):
        validate_training_bundle(wrong_side, payload["contractHash"])


def test_request_fixture_is_json_bounded():
    encoded = json.dumps(request(), sort_keys=True, separators=(",", ":"), allow_nan=False)
    assert len(encoded.encode("utf-8")) < 512 * 1024
