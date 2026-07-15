"""Optional MuJoCo producer for the P6-010 engine-parity baseline.

This module is intentionally dependency-light at import time. CI and deployments
that install the pinned `mujoco` Python package can expose it directly as:

    FORGE_MUJOCO_PARITY_CMD="python -m forge_workers.mujoco_parity"

The command reads the JSON request from stdin and emits a
`simParityMuJoCoBaseline` JSON artifact on stdout. Local/CI runs without MuJoCo
keep using deterministic fixtures and captured JSON baselines. Live requests must
carry the contract-derived MJCF emitted by the checked-out Rust exporter; this
module does not maintain a second hand-authored physics model.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from dataclasses import dataclass
from typing import Any, TextIO

MUJOCO_PARITY_REQUEST_VERSION = "1.0.0"
MUJOCO_PARITY_BASELINE_VERSION = "1.0.0"
PINNED_MUJOCO_VERSION = "3.9.0"


@dataclass(frozen=True)
class MuJoCoParityScene:
    body_name: str
    mjcf: str


@dataclass(frozen=True)
class MuJoCoParityRequest:
    source_revision: str = "0" * 40
    request_sha256: str = "0" * 64
    mujoco_version: str = PINNED_MUJOCO_VERSION
    gravity: float = 9.80665
    drop_height_m: float = 1.0
    pendulum_length_m: float = 0.4
    hover_trim: float = 0.42
    gait_com_m: float = 0.004
    driver_dt_s: float = 1.0 / 240.0
    substeps: int = 4
    timeout_s: float = 10.0
    drop: MuJoCoParityScene | None = None
    pendulum: MuJoCoParityScene | None = None
    hover: MuJoCoParityScene | None = None
    gait: MuJoCoParityScene | None = None

    @property
    def timestep_s(self) -> float:
        return self.driver_dt_s / self.substeps


def request_from_payload(payload: dict[str, Any]) -> MuJoCoParityRequest:
    expected_keys = {
        "artifactKind",
        "schemaVersion",
        "task",
        "mujocoVersion",
        "gravity",
        "dropHeightM",
        "pendulumLengthM",
        "hoverTrim",
        "gaitComM",
        "driverDtS",
        "substeps",
        "scenes",
        "sourceRevision",
        "requestSha256",
    }
    if set(payload) != expected_keys:
        raise ValueError("request fields must exactly match schema 1.0.0")
    if payload.get("artifactKind") != "simParityMuJoCoRequest":
        raise ValueError("artifactKind must be 'simParityMuJoCoRequest'")
    if payload.get("schemaVersion") != MUJOCO_PARITY_REQUEST_VERSION:
        raise ValueError(
            f"schemaVersion must be {MUJOCO_PARITY_REQUEST_VERSION}"
        )
    task = payload.get("task")
    if task != "sim.parity":
        raise ValueError(f"unsupported task {task!r}; expected 'sim.parity'")

    source_revision = payload.get("sourceRevision")
    if (
        not isinstance(source_revision, str)
        or len(source_revision) not in (40, 64)
        or any(char not in "0123456789abcdefABCDEF" for char in source_revision)
    ):
        raise ValueError("sourceRevision must be a full hexadecimal Git object ID")
    mujoco_version = payload.get("mujocoVersion")
    if mujoco_version != PINNED_MUJOCO_VERSION:
        raise ValueError(
            f"mujocoVersion must be the reviewed pin {PINNED_MUJOCO_VERSION}"
        )
    request_sha256 = payload.get("requestSha256")
    if (
        not isinstance(request_sha256, str)
        or len(request_sha256) != 64
        or any(char not in "0123456789abcdefABCDEF" for char in request_sha256)
    ):
        raise ValueError("requestSha256 must be a full hexadecimal SHA-256")

    raw_substeps = _finite(payload, "substeps", 4)
    if not raw_substeps.is_integer() or raw_substeps <= 0 or raw_substeps > 64:
        raise ValueError("substeps must be an integer in [1, 64]")
    substeps = int(raw_substeps)

    request = MuJoCoParityRequest(
        source_revision=source_revision,
        request_sha256=request_sha256,
        mujoco_version=mujoco_version,
        gravity=_finite(payload, "gravity", 9.80665),
        drop_height_m=_finite(payload, "dropHeightM", 1.0),
        pendulum_length_m=_finite(payload, "pendulumLengthM", 0.4),
        hover_trim=_finite(payload, "hoverTrim", 0.42),
        gait_com_m=_finite(payload, "gaitComM", 0.004),
        driver_dt_s=_finite(payload, "driverDtS", 1.0 / 240.0),
        substeps=substeps,
        timeout_s=_finite(payload, "timeoutS", 10.0),
        drop=_scene(payload, "drop"),
        pendulum=_scene(payload, "pendulum"),
        hover=_scene(payload, "hover"),
        gait=_scene(payload, "gait"),
    )
    if request.gravity <= 0:
        raise ValueError("gravity must be positive")
    if request.drop_height_m <= 0:
        raise ValueError("dropHeightM must be positive")
    if request.pendulum_length_m <= 0:
        raise ValueError("pendulumLengthM must be positive")
    if request.driver_dt_s <= 0:
        raise ValueError("driverDtS must be positive")
    if request.timeout_s <= 0:
        raise ValueError("timeoutS must be positive")
    if math.ceil(request.timeout_s / request.timestep_s) > 1_000_000:
        raise ValueError("timeoutS/driverDtS/substeps exceed the 1,000,000-step budget")
    request_body = {
        key: value
        for key, value in payload.items()
        if key not in ("sourceRevision", "requestSha256")
    }
    computed_request_sha256 = hashlib.sha256(
        json.dumps(
            request_body,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()
    if request.request_sha256.lower() != computed_request_sha256:
        raise ValueError("requestSha256 does not match the canonical request payload")
    return request


def baseline_artifact(
    request: MuJoCoParityRequest,
    *,
    drop_time_s: float,
    pendulum_period_s: float,
    hover_trim: float | None = None,
    gait_com_m: float | None = None,
    provider: str = "mujoco-python",
) -> dict[str, Any]:
    return {
        "artifactKind": "simParityMuJoCoBaseline",
        "schemaVersion": MUJOCO_PARITY_BASELINE_VERSION,
        "sourceRevision": request.source_revision,
        "requestSha256": request.request_sha256,
        "provider": provider,
        "baseline": {
            "dropHeightM": request.drop_height_m,
            "mujocoDropTimeS": drop_time_s,
            "pendulumLengthM": request.pendulum_length_m,
            "mujocoPendulumPeriodS": pendulum_period_s,
            "mujocoHoverTrim": request.hover_trim if hover_trim is None else hover_trim,
            "mujocoGaitComM": request.gait_com_m if gait_com_m is None else gait_com_m,
            "driverDtS": request.driver_dt_s,
            "substeps": request.substeps,
        },
    }


def run_baseline(payload: dict[str, Any], mujoco_module: Any | None = None) -> dict[str, Any]:
    request = request_from_payload(payload)
    if mujoco_module is None:
        try:
            import mujoco as mujoco_module  # type: ignore[import-not-found]
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "MuJoCo Python package is not installed; install the optional "
                "worker dependency or pass a captured baseline JSON to pnpm sim:parity"
            ) from exc

    version = getattr(mujoco_module, "__version__", "unknown")
    if version != request.mujoco_version:
        raise RuntimeError(
            f"MuJoCo runtime version {version} does not match request pin "
            f"{request.mujoco_version}"
        )

    drop_time_s = measure_drop_time(request, mujoco_module)
    pendulum_period_s = measure_pendulum_period(request, mujoco_module)
    hover_trim = measure_hover_trim(request, mujoco_module)
    gait_com_m = measure_gait_com(request, mujoco_module)
    return baseline_artifact(
        request,
        drop_time_s=drop_time_s,
        pendulum_period_s=pendulum_period_s,
        hover_trim=hover_trim,
        gait_com_m=gait_com_m,
        provider=f"mujoco-python-{version}",
    )


def measure_drop_time(request: MuJoCoParityRequest, mujoco_module: Any) -> float:
    scene = _required_scene(request.drop, "drop")
    model = mujoco_module.MjModel.from_xml_string(scene.mjcf)
    _validate_runtime_model(model, request, "drop")
    data = mujoco_module.MjData(model)
    mujoco_module.mj_forward(model, data)
    body_id = mujoco_module.mj_name2id(
        model, mujoco_module.mjtObj.mjOBJ_BODY, scene.body_name
    )
    prev_t = float(data.time)
    prev_z = float(data.xpos[body_id][2])
    max_steps = math.ceil(request.timeout_s / request.timestep_s)
    for _ in range(max_steps):
        mujoco_module.mj_step(model, data)
        z = float(data.xpos[body_id][2])
        if z <= 0.0:
            denom = prev_z - z
            alpha = prev_z / denom if abs(denom) > 1e-12 else 1.0
            return prev_t + max(0.0, min(1.0, alpha)) * (float(data.time) - prev_t)
        prev_t = float(data.time)
        prev_z = z
    raise RuntimeError("MuJoCo drop baseline did not cross z=0 within timeout")


def measure_pendulum_period(request: MuJoCoParityRequest, mujoco_module: Any) -> float:
    scene = _required_scene(request.pendulum, "pendulum")
    model = mujoco_module.MjModel.from_xml_string(scene.mjcf)
    _validate_runtime_model(model, request, "pendulum")
    data = mujoco_module.MjData(model)
    mujoco_module.mj_forward(model, data)

    body_id = mujoco_module.mj_name2id(
        model, mujoco_module.mjtObj.mjOBJ_BODY, scene.body_name
    )
    prev_t = float(data.time)
    prev_x = float(data.xipos[body_id][0])
    crossings: list[float] = []
    max_steps = math.ceil(request.timeout_s / request.timestep_s)
    for _ in range(max_steps):
        mujoco_module.mj_step(model, data)
        x = float(data.xipos[body_id][0])
        if prev_x > 0.0 and x <= 0.0:
            denom = prev_x - x
            alpha = prev_x / denom if abs(denom) > 1e-12 else 1.0
            crossings.append(prev_t + max(0.0, min(1.0, alpha)) * (float(data.time) - prev_t))
            if len(crossings) == 2:
                return crossings[1] - crossings[0]
        prev_t = float(data.time)
        prev_x = x
    raise RuntimeError("MuJoCo pendulum baseline did not complete a period within timeout")


def measure_hover_trim(request: MuJoCoParityRequest, mujoco_module: Any) -> float:
    if not 0.0 < request.hover_trim <= 1.0:
        raise ValueError("hoverTrim must be in (0, 1]")
    mass_kg = 0.1
    max_thrust_n = mass_kg * request.gravity / request.hover_trim

    def final_velocity(throttle: float) -> float:
        scene = _required_scene(request.hover, "hover")
        model = mujoco_module.MjModel.from_xml_string(scene.mjcf)
        _validate_runtime_model(model, request, "hover")
        data = mujoco_module.MjData(model)
        mujoco_module.mj_forward(model, data)
        body_id = mujoco_module.mj_name2id(
            model, mujoco_module.mjtObj.mjOBJ_BODY, scene.body_name
        )
        runtime_mass_kg = float(model.body_mass[body_id])
        if abs(runtime_mass_kg - mass_kg) > 1e-9:
            raise RuntimeError(
                f"MuJoCo hover mass {runtime_mass_kg:.12g} kg does not match "
                f"canonical {mass_kg:.12g} kg"
            )
        max_steps = math.ceil(1.0 / request.timestep_s)
        for _ in range(max_steps):
            data.xfrc_applied[body_id][2] = throttle * max_thrust_n
            mujoco_module.mj_step(model, data)
        return float(data.qvel[2])

    lo = 0.0
    hi = 1.0
    lo_v = final_velocity(lo)
    hi_v = final_velocity(hi)
    if lo_v > 0.0 or hi_v < 0.0:
        raise RuntimeError(f"MuJoCo hover bracket failed: low {lo_v:.6f} m/s, high {hi_v:.6f} m/s")
    for _ in range(32):
        mid = 0.5 * (lo + hi)
        velocity = final_velocity(mid)
        if velocity < 0.0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def measure_gait_com(request: MuJoCoParityRequest, mujoco_module: Any) -> float:
    if request.gait_com_m < 0.0:
        raise ValueError("gaitComM must be non-negative")
    if request.gait_com_m == 0.0:
        return 0.0
    mass_kg = 0.1
    omega = 2.0 * math.pi
    lateral_force_amp_n = mass_kg * request.gait_com_m * omega * omega / 2.0
    vertical_force_n = mass_kg * request.gravity
    scene = _required_scene(request.gait, "gait")
    model = mujoco_module.MjModel.from_xml_string(scene.mjcf)
    _validate_runtime_model(model, request, "gait")
    data = mujoco_module.MjData(model)
    mujoco_module.mj_forward(model, data)
    body_id = mujoco_module.mj_name2id(
        model, mujoco_module.mjtObj.mjOBJ_BODY, scene.body_name
    )
    runtime_mass_kg = float(model.body_mass[body_id])
    if abs(runtime_mass_kg - mass_kg) > 1e-9:
        raise RuntimeError(
            f"MuJoCo gait mass {runtime_mass_kg:.12g} kg does not match "
            f"canonical {mass_kg:.12g} kg"
        )
    max_abs_x = 0.0
    steps = math.ceil(1.0 / request.timestep_s)
    for step in range(steps):
        t = step * request.timestep_s
        data.xfrc_applied[body_id][0] = lateral_force_amp_n * math.cos(omega * t)
        data.xfrc_applied[body_id][2] = vertical_force_n
        mujoco_module.mj_step(model, data)
        max_abs_x = max(max_abs_x, abs(float(data.xpos[body_id][0])))
    return max_abs_x


def main(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout, stderr: TextIO = sys.stderr) -> int:
    try:
        raw = stdin.read(4 * 1024 * 1024 + 1)
        if len(raw.encode("utf-8")) > 4 * 1024 * 1024:
            raise ValueError("request exceeds the 4 MiB command-input limit")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("request must be a JSON object")
        artifact = run_baseline(payload)
    except Exception as exc:
        print(f"mujoco-parity: {exc}", file=stderr)
        return 2
    print(json.dumps(artifact, sort_keys=True), file=stdout)
    return 0


def _scene(payload: dict[str, Any], name: str) -> MuJoCoParityScene:
    scenes = payload.get("scenes")
    if not isinstance(scenes, dict):
        raise ValueError("scenes must be an object")
    if set(scenes) != {"drop", "pendulum", "hover", "gait"}:
        raise ValueError("scenes must contain exactly drop, pendulum, hover, and gait")
    raw = scenes.get(name)
    if not isinstance(raw, dict):
        raise ValueError(f"scenes.{name} must be an object")
    if set(raw) != {"bodyName", "mjcf"}:
        raise ValueError(f"scenes.{name} fields must exactly match schema 1.0.0")
    body_name = raw.get("bodyName")
    mjcf = raw.get("mjcf")
    if (
        not isinstance(body_name, str)
        or not body_name
        or len(body_name) > 128
        or any(not (char.isalnum() or char in "_.-") for char in body_name)
    ):
        raise ValueError(f"scenes.{name}.bodyName must be a non-empty bounded string")
    lowered = mjcf.lower() if isinstance(mjcf, str) else ""
    if (
        not isinstance(mjcf, str)
        or not mjcf
        or len(mjcf.encode("utf-8")) > 512 * 1024
        or "\x00" in mjcf
        or not mjcf.startswith("<!-- generated by forge-sim from contract parity-")
        or "<mujoco " not in mjcf
        or '<compiler angle="radian"/>' not in mjcf
        or f'name="{body_name}"' not in mjcf
        or any(token in lowered for token in ("<include", "<asset", "<plugin", "file="))
    ):
        raise ValueError(f"scenes.{name}.mjcf must be bounded contract-derived MJCF")
    return MuJoCoParityScene(body_name=body_name, mjcf=mjcf)


def _required_scene(scene: MuJoCoParityScene | None, name: str) -> MuJoCoParityScene:
    if scene is None:
        raise ValueError(f"missing canonical {name} scene")
    return scene


def _validate_runtime_model(
    model: Any, request: MuJoCoParityRequest, scene_name: str
) -> None:
    runtime_timestep_s = float(model.opt.timestep)
    if abs(runtime_timestep_s - request.timestep_s) > 1e-12:
        raise RuntimeError(
            f"MuJoCo {scene_name} timestep {runtime_timestep_s:.12g} s does not "
            f"match requested {request.timestep_s:.12g} s"
        )
    runtime_gravity = tuple(float(value) for value in model.opt.gravity)
    expected_gravity = (0.0, 0.0, -request.gravity)
    if any(
        abs(actual - expected) > 1e-12
        for actual, expected in zip(runtime_gravity, expected_gravity, strict=True)
    ):
        raise RuntimeError(
            f"MuJoCo {scene_name} gravity {runtime_gravity!r} does not match "
            f"requested {expected_gravity!r}"
        )


def _finite(payload: dict[str, Any], key: str, default: float) -> float:
    raw = payload.get(key, default)
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{key} must be a finite number") from exc
    if not math.isfinite(value):
        raise ValueError(f"{key} must be a finite number")
    return value


if __name__ == "__main__":
    raise SystemExit(main())
