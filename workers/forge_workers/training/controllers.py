"""Reviewed deterministic estimator-side controllers shared by training and smoke evidence."""

from __future__ import annotations

import math
from typing import Any

import numpy as np


def multirotor_teacher_action(
    observation: np.ndarray,
    bundle: dict[str, Any],
    task_id: str,
) -> np.ndarray:
    """Map the exact v2 estimator tensor to bounded normalized flight targets."""

    if observation.shape != (14,) or not np.isfinite(observation).all():
        raise ValueError("teacher requires one finite forge-policy-tensor v2 observation")
    roll, pitch, yaw = (float(value) for value in observation[:3])
    _, _, yaw_rate = (float(value) for value in observation[3:6])
    velocity_x, velocity_y, velocity_z = (float(value) for value in observation[6:9])
    error_x, error_y, error_z = (float(value) for value in observation[9:12])
    position_gain = 0.35 if task_id == "hover-hold" else 0.08
    velocity_gain = 0.08
    desired_roll = float(np.clip(position_gain * error_z - velocity_gain * velocity_z, -0.35, 0.35))
    desired_pitch = float(np.clip(-position_gain * error_x + velocity_gain * velocity_x, -0.35, 0.35))
    vertical_acceleration = float(np.clip(8.0 * error_y - 3.0 * velocity_y, -6.0, 6.0))
    attitude_factor = max(0.7, math.cos(roll) * math.cos(pitch))
    desired_thrust = (
        float(bundle["massKg"])
        * (float(bundle["gravityMS2"]) + vertical_acceleration)
        / attitude_factor
    )
    curve = bundle["powertrain"]["curve"]
    throttle = float(
        np.interp(
            desired_thrust,
            [point["totalThrustN"] for point in curve],
            [point["throttle"] for point in curve],
        )
    )
    hover = float(bundle["hoverThrottle"])
    collective = (throttle - hover) / (1.0 - hover) if throttle >= hover else throttle / hover - 1.0
    tilt_max = float(bundle["control"]["tiltMaxRad"])
    yaw_rate_max = float(bundle["control"]["yawRateRadS"])
    return np.asarray(
        [
            np.clip(collective, -1.0, 1.0),
            np.clip(-desired_roll / tilt_max, -1.0, 1.0),
            np.clip(desired_pitch / tilt_max, -1.0, 1.0),
            np.clip((-yaw - 0.3 * yaw_rate) / yaw_rate_max, -1.0, 1.0),
        ],
        dtype=np.float32,
    )
