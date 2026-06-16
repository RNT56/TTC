"""Optional MuJoCo producer for the P6-010 engine-parity baseline.

This module is intentionally dependency-light at import time. Deployments that
install the `mujoco` Python package can expose it directly as:

    FORGE_MUJOCO_PARITY_CMD="python -m forge_workers.mujoco_parity"

The command reads the JSON request from stdin and emits a
`simParityMuJoCoBaseline` JSON artifact on stdout. Local/CI runs without MuJoCo
keep using deterministic fixtures and captured JSON baselines.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
import sys
from typing import Any, TextIO


@dataclass(frozen=True)
class MuJoCoParityRequest:
    gravity: float = 9.80665
    drop_height_m: float = 1.0
    pendulum_length_m: float = 0.4
    hover_trim: float = 0.42
    gait_com_m: float = 0.004
    driver_dt_s: float = 1.0 / 240.0
    substeps: int = 4
    timeout_s: float = 10.0

    @property
    def timestep_s(self) -> float:
        return self.driver_dt_s / self.substeps


def request_from_payload(payload: dict[str, Any]) -> MuJoCoParityRequest:
    task = payload.get("task")
    if task not in (None, "sim.parity"):
        raise ValueError(f"unsupported task {task!r}; expected 'sim.parity'")

    substeps = int(_finite(payload, "substeps", 4))
    if substeps <= 0:
        raise ValueError("substeps must be positive")

    request = MuJoCoParityRequest(
        gravity=_finite(payload, "gravity", 9.80665),
        drop_height_m=_finite(payload, "dropHeightM", 1.0),
        pendulum_length_m=_finite(payload, "pendulumLengthM", 0.4),
        hover_trim=_finite(payload, "hoverTrim", 0.42),
        gait_com_m=_finite(payload, "gaitComM", 0.004),
        driver_dt_s=_finite(payload, "driverDtS", 1.0 / 240.0),
        substeps=substeps,
        timeout_s=_finite(payload, "timeoutS", 10.0),
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


def drop_mjcf(request: MuJoCoParityRequest) -> str:
    return f"""<mujoco model="forge-parity-drop">
  <option timestep="{request.timestep_s:.12g}" gravity="0 0 {-request.gravity:.12g}" integrator="Euler"/>
  <worldbody>
    <body name="drop" pos="0 0 {request.drop_height_m:.12g}">
      <freejoint/>
      <geom name="drop_geom" type="box" size="0.02 0.02 0.02" mass="0.1"/>
    </body>
  </worldbody>
</mujoco>
"""


def pendulum_mjcf(request: MuJoCoParityRequest) -> str:
    length = request.pendulum_length_m
    return f"""<mujoco model="forge-parity-pendulum">
  <option timestep="{request.timestep_s:.12g}" gravity="0 0 {-request.gravity:.12g}" integrator="Euler"/>
  <worldbody>
    <body name="pivot" pos="0 0 0">
      <body name="bob" pos="0 0 0">
        <joint name="hinge" type="hinge" axis="0 1 0" damping="0" frictionloss="0" limited="false"/>
        <geom name="bob_geom" type="sphere" pos="0 0 {-length:.12g}" size="0.002" mass="0.1"/>
        <site name="bob_tip" pos="0 0 {-length:.12g}" size="0.001"/>
      </body>
    </body>
  </worldbody>
</mujoco>
"""


def hover_mjcf(request: MuJoCoParityRequest) -> str:
    return f"""<mujoco model="forge-parity-hover">
  <option timestep="{request.timestep_s:.12g}" gravity="0 0 {-request.gravity:.12g}" integrator="Euler"/>
  <worldbody>
    <body name="hover" pos="0 0 0">
      <freejoint/>
      <geom name="hover_geom" type="box" size="0.03 0.03 0.01" mass="0.1"/>
    </body>
  </worldbody>
</mujoco>
"""


def gait_mjcf(request: MuJoCoParityRequest) -> str:
    return f"""<mujoco model="forge-parity-gait-com">
  <option timestep="{request.timestep_s:.12g}" gravity="0 0 {-request.gravity:.12g}" integrator="Euler"/>
  <worldbody>
    <body name="gait" pos="0 0 0">
      <freejoint/>
      <geom name="gait_geom" type="box" size="0.04 0.02 0.015" mass="0.1"/>
    </body>
  </worldbody>
</mujoco>
"""


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

    drop_time_s = measure_drop_time(request, mujoco_module)
    pendulum_period_s = measure_pendulum_period(request, mujoco_module)
    hover_trim = measure_hover_trim(request, mujoco_module)
    gait_com_m = measure_gait_com(request, mujoco_module)
    version = getattr(mujoco_module, "__version__", "unknown")
    return baseline_artifact(
        request,
        drop_time_s=drop_time_s,
        pendulum_period_s=pendulum_period_s,
        hover_trim=hover_trim,
        gait_com_m=gait_com_m,
        provider=f"mujoco-python-{version}",
    )


def measure_drop_time(request: MuJoCoParityRequest, mujoco_module: Any) -> float:
    model = mujoco_module.MjModel.from_xml_string(drop_mjcf(request))
    data = mujoco_module.MjData(model)
    mujoco_module.mj_forward(model, data)
    body_id = mujoco_module.mj_name2id(model, mujoco_module.mjtObj.mjOBJ_BODY, "drop")
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
    model = mujoco_module.MjModel.from_xml_string(pendulum_mjcf(request))
    data = mujoco_module.MjData(model)
    joint_id = mujoco_module.mj_name2id(model, mujoco_module.mjtObj.mjOBJ_JOINT, "hinge")
    qpos_adr = int(model.jnt_qposadr[joint_id])
    data.qpos[qpos_adr] = -0.12
    mujoco_module.mj_forward(model, data)

    site_id = mujoco_module.mj_name2id(model, mujoco_module.mjtObj.mjOBJ_SITE, "bob_tip")
    prev_t = float(data.time)
    prev_x = float(data.site_xpos[site_id][0])
    crossings: list[float] = []
    max_steps = math.ceil(request.timeout_s / request.timestep_s)
    for _ in range(max_steps):
        mujoco_module.mj_step(model, data)
        x = float(data.site_xpos[site_id][0])
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
        model = mujoco_module.MjModel.from_xml_string(hover_mjcf(request))
        data = mujoco_module.MjData(model)
        mujoco_module.mj_forward(model, data)
        body_id = mujoco_module.mj_name2id(model, mujoco_module.mjtObj.mjOBJ_BODY, "hover")
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
    model = mujoco_module.MjModel.from_xml_string(gait_mjcf(request))
    data = mujoco_module.MjData(model)
    mujoco_module.mj_forward(model, data)
    body_id = mujoco_module.mj_name2id(model, mujoco_module.mjtObj.mjOBJ_BODY, "gait")
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
        payload = json.load(stdin)
        if not isinstance(payload, dict):
            raise ValueError("request must be a JSON object")
        artifact = run_baseline(payload)
    except Exception as exc:
        print(f"mujoco-parity: {exc}", file=stderr)
        return 2
    print(json.dumps(artifact, sort_keys=True), file=stdout)
    return 0


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
