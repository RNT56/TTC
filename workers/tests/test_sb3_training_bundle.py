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
CATALOG_CONTRACT = ROOT / "examples" / "vx2-proof.forge.json"
CATALOG = ROOT / "catalog"
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


def catalog_request() -> dict:
    contract_json = CATALOG_CONTRACT.read_text(encoding="utf-8")
    contract_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    return {
        "jobKind": "train.policy",
        "task": "hover-hold",
        "modelId": "vx2-proof",
        "contractHash": contract_hash,
        "modelSnapshot": {
            "schemaVersion": SNAPSHOT_SCHEMA,
            "modelId": "vx2-proof",
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


def test_catalog_snapshot_binds_mass_inertia_and_rejects_inapplicable_bench_table(monkeypatch):
    if not VALIDATOR.is_file():
        pytest.skip("forge-validate binary is not built")
    monkeypatch.setenv("FORGE_VALIDATE_BIN", str(VALIDATOR))
    with pytest.raises(RuntimeError, match="validator verdict is Rejected"):
        compile_training_bundle(catalog_request())

    bundle = compile_training_bundle(catalog_request(), catalog_path=CATALOG)
    assert bundle["schemaVersion"] == "3.0.0"
    assert bundle["massKg"] == 0.769
    physics = bundle["catalogPhysics"]
    assert physics["schemaVersion"] == "forge-training-catalog-physics/1.0.0"
    assert physics["baseContractMassKg"] == 0.479
    assert physics["equippedCatalogMassKg"] == pytest.approx(0.29)
    assert physics["totalMassKg"] == bundle["massKg"]
    assert physics["batteryOperatingVoltageV"] == [14.8, 16.8]
    assert physics["equippedProp"] == {
        "diameterIn": 5.0,
        "pitchIn": 4.3,
        "blades": 3,
        "source": "inline:sim.props[0]",
    }
    assert [component["slotId"] for component in physics["components"]] == [
        "battery",
        "rotors",
    ]
    motor = next(
        component for component in physics["components"] if component["category"] == "motor"
    )
    assert motor["quantity"] == 4
    assert motor["geometry"]["model"] == "uniform-cylinder-y"
    assert motor["thrustTables"][0]["pointCount"] == 2
    assert motor["thrustTables"][0]["voltageRangeV"] == [25.2, 25.2]
    assert motor["thrustTables"][0]["usedForCurve"] is False
    assert len(motor["thrustTables"][0]["inapplicabilityReasons"]) == 2
    assert physics["powertrainModel"] == (
        "catalog-motor-battery-analytic-fallback-rejected-bench-table-v1"
    )
    assert "forge-sim.DEFAULT_CT" in physics["inlineFallbacks"]
    assert bundle["powertrain"]["maxTotalCurrentA"] == 120.0
    assert bundle["powertrain"]["curve"][-1]["totalThrustN"] > (
        bundle["massKg"] * bundle["gravityMS2"]
    )
    assert any("exact equipped catalog masses" in assumption for assumption in bundle["assumptions"])


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

    catalog_bundle = compile_training_bundle(catalog_request(), catalog_path=CATALOG)
    catalog_mass = copy.deepcopy(catalog_bundle)
    catalog_mass["catalogPhysics"]["equippedCatalogMassKg"] += 0.001
    with pytest.raises(ValueError, match="mass closure"):
        validate_training_bundle(catalog_mass, catalog_request()["contractHash"])

    catalog_row = copy.deepcopy(catalog_bundle)
    catalog_row["catalogPhysics"]["components"][0]["rowSha256"] = "A" * 64
    with pytest.raises(ValueError, match="lower-case SHA-256"):
        validate_training_bundle(catalog_row, catalog_request()["contractHash"])

    catalog_inertia = copy.deepcopy(catalog_bundle)
    catalog_inertia["catalogPhysics"]["components"][0]["geometry"]["inertiaKgM2"][0] = 0
    with pytest.raises(ValueError, match="principal inertia"):
        validate_training_bundle(catalog_inertia, catalog_request()["contractHash"])

    catalog_inertia_formula = copy.deepcopy(catalog_bundle)
    catalog_inertia_formula["catalogPhysics"]["components"][0]["geometry"][
        "inertiaKgM2"
    ][0] *= 2
    with pytest.raises(ValueError, match="does not match its mass and dimensions"):
        validate_training_bundle(catalog_inertia_formula, catalog_request()["contractHash"])

    catalog_applicability = copy.deepcopy(catalog_bundle)
    motor = next(
        component
        for component in catalog_applicability["catalogPhysics"]["components"]
        if component["category"] == "motor"
    )
    motor["thrustTables"][0]["usedForCurve"] = True
    with pytest.raises(ValueError, match="thrust-table authority"):
        validate_training_bundle(catalog_applicability, catalog_request()["contractHash"])

    catalog_coverage = copy.deepcopy(catalog_bundle)
    motor = next(
        component
        for component in catalog_coverage["catalogPhysics"]["components"]
        if component["category"] == "motor"
    )
    motor["thrustTables"][0]["voltageRangeV"] = [14.8, 16.8]
    motor["thrustTables"][0]["voltageV"] = 14.8
    motor["thrustTables"][0]["prop"] = "5x4.3"
    with pytest.raises(ValueError, match="applicability is false"):
        validate_training_bundle(catalog_coverage, catalog_request()["contractHash"])

    catalog_multiple_rejected = copy.deepcopy(catalog_bundle)
    motor = next(
        component
        for component in catalog_multiple_rejected["catalogPhysics"]["components"]
        if component["category"] == "motor"
    )
    second_rejected = copy.deepcopy(motor["thrustTables"][0])
    second_rejected["id"] = "second-inapplicable-table"
    motor["thrustTables"].append(second_rejected)
    assert (
        validate_training_bundle(
            catalog_multiple_rejected, catalog_request()["contractHash"]
        )
        is catalog_multiple_rejected
    )

    catalog_ambiguous = copy.deepcopy(catalog_multiple_rejected)
    motor = next(
        component
        for component in catalog_ambiguous["catalogPhysics"]["components"]
        if component["category"] == "motor"
    )
    for table in motor["thrustTables"]:
        table["voltageV"] = 14.8
        table["voltageRangeV"] = [14.8, 16.8]
        table["prop"] = "5x4.3"
        table["usedForCurve"] = True
        table["inapplicabilityReasons"] = []
    catalog_ambiguous["catalogPhysics"]["powertrainModel"] = (
        "catalog-motor-battery-applicability-checked-thrust-table-v1"
    )
    catalog_ambiguous["catalogPhysics"]["inlineFallbacks"] = [
        "sim.battery.rIntMohm",
        "sim.motors[].rIntMohm",
    ]
    with pytest.raises(ValueError, match="applicability drifted"):
        validate_training_bundle(catalog_ambiguous, catalog_request()["contractHash"])

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
