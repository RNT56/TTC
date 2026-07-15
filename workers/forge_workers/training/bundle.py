"""Admitted-model snapshot and Rust training-bundle authority boundary."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

SNAPSHOT_SCHEMA = "forge-admitted-model-snapshot/1.0.0"
TRAINING_BUNDLE_VERSION = "2.0.0"
POLICY_TENSOR_SCHEMA = "forge-policy-tensor"
POLICY_TENSOR_VERSION = "2.0.0"
LEGACY_POLICY_TENSOR_VERSION = "1.0.0"
LEGACY_POLICY_INPUT_LAYOUT = (
    "estimator.attitude.rollRad",
    "estimator.attitude.pitchRad",
    "estimator.attitude.yawRad",
    "estimator.angularRate.rollRadS",
    "estimator.angularRate.pitchRadS",
    "estimator.angularRate.yawRadS",
    "target.error.bodyXM",
    "target.error.bodyYM",
    "target.error.bodyZM",
    "battery.normalizedVoltage",
    "powertrain.normalizedMotorCurrent",
)
POLICY_INPUT_LAYOUT = (
    "estimator.attitude.rollRad",
    "estimator.attitude.pitchRad",
    "estimator.attitude.yawRad",
    "estimator.angularRate.rollRadS",
    "estimator.angularRate.pitchRadS",
    "estimator.angularRate.yawRadS",
    "estimator.linearVelocity.bodyXMps",
    "estimator.linearVelocity.bodyYMps",
    "estimator.linearVelocity.bodyZMps",
    "target.error.bodyXM",
    "target.error.bodyYM",
    "target.error.bodyZM",
    "battery.normalizedVoltage",
    "powertrain.normalizedMotorCurrent",
)
POLICY_OUTPUT_LAYOUT = ("throttle", "roll", "pitch", "yaw")
GROUND_TRAINING_BUNDLE_VERSION = "1.0.0"
GROUND_POLICY_TENSOR_SCHEMA = "forge-ground-policy-tensor"
GROUND_POLICY_TENSOR_VERSION = "1.0.0"
GROUND_POLICY_INPUT_LAYOUT = (
    "estimator.attitude.rollRad",
    "estimator.attitude.pitchRad",
    "estimator.attitude.yawRad",
    "estimator.angularRate.rollRadS",
    "estimator.angularRate.pitchRadS",
    "estimator.angularRate.yawRadS",
    "estimator.linearVelocity.bodyXMps",
    "estimator.linearVelocity.bodyZMps",
    "target.error.bodyXM",
    "target.error.bodyZM",
    "actuation.normalizedEffort",
)
PINNED_MUJOCO_VERSION = "3.9.0"
MAX_CONTRACT_BYTES = 512 * 1024
MAX_BUNDLE_BYTES = 2 * 1024 * 1024


def compile_training_bundle(payload: dict[str, Any]) -> dict[str, Any]:
    """Verify the immutable gateway snapshot and compile it through Rust truth."""

    snapshot = _snapshot(payload)
    contract_json = snapshot["contractJson"]
    contract_hash = snapshot["contractHash"]
    actual_hash = hashlib.sha256(contract_json.encode("utf-8")).hexdigest()
    if actual_hash != contract_hash:
        raise ValueError("admitted model snapshot contract hash mismatch")
    if payload.get("contractHash") != contract_hash:
        raise ValueError("job contract hash does not match admitted model snapshot")

    validator = _validator_binary()
    contract_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            suffix=".forge.json",
            prefix="forge-training-",
            delete=False,
        ) as handle:
            handle.write(contract_json)
            contract_path = handle.name
        completed = subprocess.run(
            [validator, "training-bundle", contract_path, "--contract-hash", contract_hash],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
            env={**os.environ, "NO_COLOR": "1"},
        )
    finally:
        if contract_path is not None:
            Path(contract_path).unlink(missing_ok=True)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or "forge-validate rejected the training bundle"
        raise RuntimeError(detail[:2_000])
    if len(completed.stdout.encode("utf-8")) > MAX_BUNDLE_BYTES:
        raise ValueError("training bundle exceeds the worker boundary")
    try:
        bundle = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise ValueError("forge-validate training bundle was not JSON") from error
    return validate_training_bundle(bundle, contract_hash)


def validate_training_bundle(value: Any, contract_hash: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("training bundle must be an object")
    if value.get("artifactKind") == "groundTrainingMuJoCoBundle":
        return _validate_ground_training_bundle(value, contract_hash)
    _exact(value, {
        "artifactKind",
        "schemaVersion",
        "contractHash",
        "archetype",
        "mujocoVersion",
        "rootBodyName",
        "mjcf",
        "timestepS",
        "controlPeriodS",
        "substeps",
        "massKg",
        "gravityMS2",
        "hoverThrottle",
        "tensor",
        "estimator",
        "powertrain",
        "control",
        "assumptions",
    }, "training bundle")
    if value.get("artifactKind") != "trainingMuJoCoBundle":
        raise ValueError("unsupported training bundle artifact kind")
    if value.get("schemaVersion") != TRAINING_BUNDLE_VERSION:
        raise ValueError("unsupported training bundle version")
    if value.get("contractHash") != contract_hash:
        raise ValueError("training bundle contract hash mismatch")
    if value.get("archetype") != "multirotor":
        raise ValueError("training bundle archetype is not supported")
    if value.get("mujocoVersion") != PINNED_MUJOCO_VERSION:
        raise ValueError("training bundle MuJoCo version drifted")
    if not _bounded_string(value.get("rootBodyName"), 1, 120):
        raise ValueError("training bundle rootBodyName is invalid")
    mjcf = value.get("mjcf")
    if (
        not isinstance(mjcf, str)
        or not mjcf.startswith("<!-- generated by forge-sim from contract ")
        or mjcf.count("<freejoint/>") != 1
        or len(mjcf.encode("utf-8")) > MAX_CONTRACT_BYTES
        or "\x00" in mjcf
    ):
        raise ValueError("training bundle MJCF is not bounded contract-derived floating-root XML")
    folded_mjcf = mjcf.casefold()
    if any(
        token in folded_mjcf
        for token in ("<!doctype", "<include", "xi:include", "<plugin", "<extension", "file=")
    ):
        raise ValueError("training bundle MJCF may not load external files, plugins, or includes")
    timestep = _finite(value, "timestepS", positive=True)
    control_period = _finite(value, "controlPeriodS", positive=True)
    substeps = value.get("substeps")
    if (
        substeps != 4
        or timestep > 1.0
        or control_period > 1.0
        or abs(timestep * substeps - control_period) > 1e-12
    ):
        raise ValueError("training bundle timestep/substep contract drifted")
    mass_kg = _finite(value, "massKg", positive=True)
    gravity_m_s2 = _finite(value, "gravityMS2", positive=True)
    if mass_kg > 100_000 or gravity_m_s2 > 100:
        raise ValueError("training bundle mass or gravity exceeds the supported bound")
    hover = _finite(value, "hoverThrottle", positive=True)
    if hover > 1.0:
        raise ValueError("training bundle hover throttle is outside (0, 1]")
    _tensor(value.get("tensor"))
    _estimator(value.get("estimator"))
    _powertrain(value.get("powertrain"), mass_kg=mass_kg, gravity_m_s2=gravity_m_s2)
    _control(value.get("control"))
    assumptions = value.get("assumptions")
    if not isinstance(assumptions, list) or not assumptions or not all(_bounded_string(item, 1, 500) for item in assumptions):
        raise ValueError("training bundle assumptions are required and bounded")
    return value


def _validate_ground_training_bundle(value: dict[str, Any], contract_hash: str) -> dict[str, Any]:
    _exact(
        value,
        {
            "artifactKind",
            "schemaVersion",
            "contractHash",
            "archetype",
            "mujocoVersion",
            "rootBodyName",
            "mjcf",
            "timestepS",
            "controlPeriodS",
            "substeps",
            "massKg",
            "gravityMS2",
            "tensor",
            "estimator",
            "control",
            "assumptions",
        },
        "ground training bundle",
    )
    if value.get("schemaVersion") != GROUND_TRAINING_BUNDLE_VERSION:
        raise ValueError("unsupported ground training bundle version")
    if value.get("contractHash") != contract_hash:
        raise ValueError("ground training bundle contract hash mismatch")
    archetype = value.get("archetype")
    if archetype not in {"rover", "quadruped"}:
        raise ValueError("ground training bundle archetype is not supported")
    if value.get("mujocoVersion") != PINNED_MUJOCO_VERSION:
        raise ValueError("ground training bundle MuJoCo version drifted")
    if not _bounded_string(value.get("rootBodyName"), 1, 120):
        raise ValueError("ground training bundle rootBodyName is invalid")
    mjcf = value.get("mjcf")
    if (
        not isinstance(mjcf, str)
        or not mjcf.startswith("<!-- generated by forge-sim from contract ")
        or mjcf.count("<freejoint/>") != 1
        or mjcf.count('name="forge_training_ground"') != 1
        or len(mjcf.encode("utf-8")) > MAX_CONTRACT_BYTES
        or "\x00" in mjcf
    ):
        raise ValueError("ground training MJCF is not bounded contract-derived floating-root XML")
    folded_mjcf = mjcf.casefold()
    if any(
        token in folded_mjcf
        for token in ("<!doctype", "<include", "xi:include", "<plugin", "<extension", "file=")
    ):
        raise ValueError("ground training MJCF may not load external files, plugins, or includes")
    timestep = _finite(value, "timestepS", positive=True)
    control_period = _finite(value, "controlPeriodS", positive=True)
    if (
        value.get("substeps") != 4
        or timestep > 1.0
        or control_period > 1.0
        or abs(timestep * 4 - control_period) > 1e-12
    ):
        raise ValueError("ground training bundle timestep/substep contract drifted")
    if _finite(value, "massKg", positive=True) > 100_000 or _finite(
        value, "gravityMS2", positive=True
    ) > 100:
        raise ValueError("ground training bundle mass or gravity exceeds the supported bound")
    _estimator(value.get("estimator"))
    joints = _ground_control(value.get("control"), archetype, mjcf)
    _ground_tensor(value.get("tensor"), archetype, joints)
    assumptions = value.get("assumptions")
    if not isinstance(assumptions, list) or not assumptions or not all(
        _bounded_string(item, 1, 500) for item in assumptions
    ):
        raise ValueError("ground training bundle assumptions are required and bounded")
    return value


def _ground_control(value: Any, archetype: str, mjcf: str) -> list[dict[str, Any]]:
    if not isinstance(value, dict):
        raise ValueError("ground training control authority is missing")
    expected = (
        {"mode", "joints", "wheelRadiusM", "trackWidthM"}
        if archetype == "rover"
        else {"mode", "joints"}
    )
    _exact(value, expected, "ground control authority")
    expected_mode = (
        "differential-drive-torque-v1"
        if archetype == "rover"
        else "normalized-joint-torque-v1"
    )
    if value.get("mode") != expected_mode:
        raise ValueError("ground training control mode drifted")
    joints = value.get("joints")
    bounds = (2, 8) if archetype == "rover" else (8, 24)
    if not isinstance(joints, list) or not bounds[0] <= len(joints) <= bounds[1]:
        raise ValueError("ground training control joint count is unsupported")
    names: set[str] = set()
    sides: set[str] = set()
    for row in joints:
        if not isinstance(row, dict):
            raise ValueError("ground training control joint must be an object")
        _exact(
            row,
            {
                "name",
                "motorName",
                "side",
                "lowerRad",
                "upperRad",
                "maxTorqueNm",
                "maxVelocityRadS",
            },
            "ground training control joint",
        )
        name = row.get("name")
        motor = row.get("motorName")
        side = row.get("side")
        if not _bounded_string(name, 1, 120) or name in names:
            raise ValueError("ground training control joint names must be bounded and unique")
        if motor != f"{name}_motor" or f'name="{motor}"' not in mjcf:
            raise ValueError("ground training motor authority drifted from contract MJCF")
        if side not in {"left", "right", "center"}:
            raise ValueError("ground training joint side is unsupported")
        lower = _finite(row, "lowerRad")
        upper = _finite(row, "upperRad")
        if lower >= upper:
            raise ValueError("ground training joint limits are invalid")
        if _finite(row, "maxTorqueNm", positive=True) > 1_000_000 or _finite(
            row, "maxVelocityRadS", positive=True
        ) > 1_000_000:
            raise ValueError("ground training joint authority exceeds the supported bound")
        names.add(name)
        sides.add(str(side))
    if archetype == "rover":
        if not {"left", "right"}.issubset(sides):
            raise ValueError("ground rover control requires left and right wheel authority")
        if _finite(value, "wheelRadiusM", positive=True) > 10 or _finite(
            value, "trackWidthM", positive=True
        ) > 100:
            raise ValueError("ground rover geometry authority exceeds the supported bound")
    return joints


def _ground_tensor(value: Any, archetype: str, joints: list[dict[str, Any]]) -> None:
    if not isinstance(value, dict):
        raise ValueError("ground training tensor is missing")
    _exact(value, {"schema", "schemaVersion", "coordinateFrame", "input", "output", "rateHz"}, "ground tensor")
    if (
        value.get("schema") != GROUND_POLICY_TENSOR_SCHEMA
        or value.get("schemaVersion") != GROUND_POLICY_TENSOR_VERSION
        or value.get("coordinateFrame") != "forge-y-up-rh-m"
        or value.get("rateHz") != 50
    ):
        raise ValueError("ground training policy tensor authority drifted")
    names = [str(joint["name"]) for joint in joints]
    input_layout = list(GROUND_POLICY_INPUT_LAYOUT)
    output_layout = ["drive", "turn"]
    if archetype == "quadruped":
        input_layout += [f"estimator.jointPosition.{name}Rad" for name in names]
        input_layout += [f"estimator.jointVelocity.{name}RadS" for name in names]
        output_layout = [f"jointTorque.{name}" for name in names]
    expected = {
        "input": ("observations", [1, len(input_layout)], input_layout),
        "output": ("actions", [1, len(output_layout)], output_layout),
    }
    for key, (name, shape, layout) in expected.items():
        axis = value.get(key)
        if not isinstance(axis, dict):
            raise ValueError(f"ground training tensor {key} is missing")
        _exact(axis, {"name", "shape", "layout"}, f"ground tensor {key}")
        if axis.get("name") != name or axis.get("shape") != shape or axis.get("layout") != layout:
            raise ValueError(f"ground training tensor {key} drifted")


def _snapshot(payload: dict[str, Any]) -> dict[str, str]:
    value = payload.get("modelSnapshot")
    if not isinstance(value, dict):
        raise ValueError("live training requires a gateway-owned admitted model snapshot")
    _exact(value, {"schemaVersion", "modelId", "contractHash", "contractJson"}, "model snapshot")
    if value.get("schemaVersion") != SNAPSHOT_SCHEMA:
        raise ValueError("unsupported admitted model snapshot version")
    model_id = value.get("modelId")
    contract_hash = value.get("contractHash")
    contract_json = value.get("contractJson")
    if not _bounded_string(model_id, 1, 200):
        raise ValueError("model snapshot modelId is invalid")
    if not isinstance(contract_hash, str) or len(contract_hash) != 64 or any(char not in "0123456789abcdef" for char in contract_hash):
        raise ValueError("model snapshot contractHash must be lowercase SHA-256")
    if (
        not isinstance(contract_json, str)
        or not contract_json.startswith("{")
        or len(contract_json.encode("utf-8")) > MAX_CONTRACT_BYTES
        or "\x00" in contract_json
    ):
        raise ValueError("model snapshot contractJson is invalid or too large")
    return {
        "schemaVersion": SNAPSHOT_SCHEMA,
        "modelId": model_id,
        "contractHash": contract_hash,
        "contractJson": contract_json,
    }


def _validator_binary() -> str:
    configured = os.getenv("FORGE_VALIDATE_BIN", "forge-validate")
    candidate = shutil.which(configured) if os.path.sep not in configured else configured
    if not candidate or not Path(candidate).is_file() or not os.access(candidate, os.X_OK):
        raise RuntimeError("FORGE_VALIDATE_BIN must name an executable forge-validate binary")
    return str(candidate)


def _tensor(value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError("training bundle tensor is missing")
    _exact(value, {"schema", "schemaVersion", "coordinateFrame", "input", "output", "rateHz"}, "tensor")
    if value.get("schema") != POLICY_TENSOR_SCHEMA or value.get("schemaVersion") != POLICY_TENSOR_VERSION:
        raise ValueError("training bundle policy tensor version drifted")
    if value.get("coordinateFrame") != "forge-y-up-rh-m" or value.get("rateHz") != 50:
        raise ValueError("training bundle policy tensor frame/rate drifted")
    expected = {
        "input": ("observations", [1, 14], list(POLICY_INPUT_LAYOUT)),
        "output": ("actions", [1, 4], list(POLICY_OUTPUT_LAYOUT)),
    }
    for key, (name, shape, layout) in expected.items():
        axis = value.get(key)
        if not isinstance(axis, dict):
            raise ValueError(f"training bundle tensor {key} is missing")
        _exact(axis, {"name", "shape", "layout"}, f"tensor {key}")
        if axis.get("name") != name or axis.get("shape") != shape or axis.get("layout") != layout:
            raise ValueError(f"training bundle tensor {key} drifted")


def _estimator(value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError("training bundle estimator is missing")
    _exact(value, {"gyroNoise", "accelNoise", "bias", "latencyMs"}, "estimator")
    for key in ("gyroNoise", "accelNoise", "bias", "latencyMs"):
        number = _finite(value, key)
        if number < 0:
            raise ValueError(f"training bundle estimator {key} must be non-negative")
        maximum = 10_000.0 if key == "latencyMs" else 100.0
        if number > maximum:
            raise ValueError(f"training bundle estimator {key} exceeds the supported bound")


def _powertrain(value: Any, *, mass_kg: float, gravity_m_s2: float) -> None:
    if not isinstance(value, dict):
        raise ValueError("training bundle powertrain is missing")
    _exact(value, {"nominalVoltageV", "maxTotalCurrentA", "curve"}, "powertrain")
    nominal_voltage = _finite(value, "nominalVoltageV", positive=True)
    max_current = _finite(value, "maxTotalCurrentA", positive=True)
    if nominal_voltage > 1_000 or max_current > 1_000_000:
        raise ValueError("training bundle powertrain voltage/current exceeds the supported bound")
    curve = value.get("curve")
    if not isinstance(curve, list) or len(curve) != 101:
        raise ValueError("training bundle powertrain curve must have 101 points")
    previous = -1.0
    previous_thrust = -1.0
    for index, point in enumerate(curve):
        if not isinstance(point, dict):
            raise ValueError("training bundle powertrain point must be an object")
        _exact(point, {"throttle", "totalThrustN", "normalizedVoltage", "normalizedCurrent"}, "power point")
        throttle = _finite(point, "throttle")
        thrust = _finite(point, "totalThrustN")
        voltage = _finite(point, "normalizedVoltage")
        current = _finite(point, "normalizedCurrent")
        if abs(throttle - index / 100.0) > 1e-12 or throttle <= previous:
            raise ValueError("training bundle throttle grid drifted")
        if thrust < previous_thrust or thrust > 1_000_000 or not 0 <= voltage <= 1 or not 0 <= current <= 1:
            raise ValueError("training bundle power point is outside physical bounds")
        previous = throttle
        previous_thrust = thrust
    if previous_thrust <= mass_kg * gravity_m_s2:
        raise ValueError("training bundle power curve lacks authority above computed weight")


def _control(value: Any) -> None:
    if not isinstance(value, dict):
        raise ValueError("training bundle control authority is missing")
    _exact(
        value,
        {
            "armRadiusM",
            "tiltMaxRad",
            "yawRateRadS",
            "maxRollPitchTorqueNm",
            "maxYawTorqueNm",
        },
        "control authority",
    )
    for key in (
        "armRadiusM",
        "tiltMaxRad",
        "yawRateRadS",
        "maxRollPitchTorqueNm",
        "maxYawTorqueNm",
    ):
        if _finite(value, key, positive=True) > 1_000_000:
            raise ValueError(f"training bundle control {key} exceeds the supported bound")


def _finite(value: dict[str, Any], key: str, *, positive: bool = False) -> float:
    raw = value.get(key)
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        raise ValueError(f"{key} must be finite")
    number = float(raw)
    if not (-float("inf") < number < float("inf")) or (positive and number <= 0):
        raise ValueError(f"{key} must be {'positive and ' if positive else ''}finite")
    return number


def _exact(value: dict[str, Any], keys: set[str], surface: str) -> None:
    if set(value) != keys:
        raise ValueError(f"{surface} fields drifted")


def _bounded_string(value: Any, minimum: int, maximum: int) -> bool:
    return isinstance(value, str) and minimum <= len(value) <= maximum


__all__ = [
    "GROUND_POLICY_INPUT_LAYOUT",
    "GROUND_POLICY_TENSOR_SCHEMA",
    "GROUND_POLICY_TENSOR_VERSION",
    "GROUND_TRAINING_BUNDLE_VERSION",
    "LEGACY_POLICY_INPUT_LAYOUT",
    "LEGACY_POLICY_TENSOR_VERSION",
    "PINNED_MUJOCO_VERSION",
    "POLICY_INPUT_LAYOUT",
    "POLICY_OUTPUT_LAYOUT",
    "POLICY_TENSOR_SCHEMA",
    "POLICY_TENSOR_VERSION",
    "SNAPSHOT_SCHEMA",
    "TRAINING_BUNDLE_VERSION",
    "compile_training_bundle",
    "validate_training_bundle",
]
