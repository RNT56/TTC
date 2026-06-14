"""Versioned P7 training task definitions.

The live SB3/MuJoCo path consumes the same task shape. Keeping the keyless worker
on that contract lets Studio, scorecards, marketplace listings, and future live
adapters agree on task identity before the heavy runtimes are installed.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

TASK_SUITE = "p7-v1"
TASK_VERSION = "1.0.0"


_TASKS: dict[str, dict[str, Any]] = {
    "hover-hold": {
        "family": "multirotor",
        "curriculum": ["stabilize", "hold-altitude", "reject-wind"],
        "horizonS": 60.0,
        "env": {
            "boundsM": [8, 8, 5],
            "terrain": {"kind": "flat", "friction": 0.8},
            "spawn": {"pose": [0, 0, 1.2, 0, 0, 0]},
            "targets": [{"kind": "position", "xyz": [0, 0, 1.5], "radiusM": 0.25}],
            "disturbances": {"windMps": [0, 4], "gustEveryS": 8},
        },
        "metrics": ["positionRmseM", "attitudeRmseDeg", "energyWh", "failsafeCount"],
    },
    "waypoint-chain": {
        "family": "multirotor",
        "curriculum": ["single-waypoint", "three-waypoint", "timed-chain"],
        "horizonS": 90.0,
        "env": {
            "boundsM": [30, 20, 8],
            "terrain": {"kind": "flat", "friction": 0.8},
            "spawn": {"pose": [-10, 0, 1.2, 0, 0, 0]},
            "targets": [
                {"kind": "waypoint", "xyz": [-4, 2, 2], "radiusM": 0.8},
                {"kind": "waypoint", "xyz": [3, -3, 2.5], "radiusM": 0.8},
                {"kind": "waypoint", "xyz": [10, 0, 1.8], "radiusM": 0.8},
            ],
        },
        "metrics": ["waypointsHit", "taskTimeS", "energyWh", "pathEfficiency"],
    },
    "gate-slalom": {
        "family": "multirotor",
        "curriculum": ["wide-gates", "offset-gates", "timed-slalom"],
        "horizonS": 75.0,
        "env": {
            "boundsM": [24, 8, 6],
            "terrain": {"kind": "flat", "friction": 0.8},
            "spawn": {"pose": [-9, 0, 1.5, 0, 0, 0]},
            "gates": [
                {"id": "g1", "center": [-4, -1.5, 1.6], "sizeM": [2.5, 1.8]},
                {"id": "g2", "center": [0, 1.5, 1.8], "sizeM": [2.2, 1.6]},
                {"id": "g3", "center": [5, -1.0, 1.5], "sizeM": [2.0, 1.5]},
            ],
        },
        "metrics": ["gatesCleared", "taskTimeS", "collisionCount", "energyWh"],
    },
    "velocity-tracking": {
        "family": "multirotor",
        "curriculum": ["axis-speed", "vector-speed", "gust-tracking"],
        "horizonS": 60.0,
        "env": {
            "boundsM": [20, 20, 6],
            "terrain": {"kind": "flat", "friction": 0.8},
            "spawn": {"pose": [0, 0, 1.4, 0, 0, 0]},
            "targets": [{"kind": "velocity", "mps": [2.5, 0, 0], "toleranceMps": 0.3}],
            "disturbances": {"windMps": [0, 3]},
        },
        "metrics": ["velocityRmseMps", "overshootMps", "energyWh"],
    },
    "walk-to-target": {
        "family": "legged",
        "curriculum": ["stand", "step", "walk-target"],
        "horizonS": 80.0,
        "env": {
            "boundsM": [14, 8, 3],
            "terrain": {"kind": "flat", "friction": 0.9},
            "spawn": {"pose": [-5, 0, 0.35, 0, 0, 0]},
            "targets": [{"kind": "position", "xyz": [5, 0, 0.35], "radiusM": 0.5}],
        },
        "metrics": ["targetDistanceM", "fallCount", "comStability", "energyWh"],
    },
    "rough-terrain": {
        "family": "legged",
        "curriculum": ["low-noise", "stepped", "rough"],
        "horizonS": 90.0,
        "env": {
            "boundsM": [16, 8, 4],
            "terrain": {"kind": "heightfield", "amplitudeM": 0.12, "friction": 0.85},
            "spawn": {"pose": [-6, 0, 0.45, 0, 0, 0]},
            "targets": [{"kind": "position", "xyz": [6, 0, 0.45], "radiusM": 0.7}],
        },
        "metrics": ["distanceM", "fallCount", "footSlip", "energyWh"],
    },
    "push-recovery": {
        "family": "legged",
        "curriculum": ["small-push", "lateral-push", "random-push"],
        "horizonS": 45.0,
        "env": {
            "boundsM": [8, 8, 3],
            "terrain": {"kind": "flat", "friction": 0.9},
            "spawn": {"pose": [0, 0, 0.4, 0, 0, 0]},
            "disturbances": {"impulseN": [10, 45], "directions": ["x", "y"]},
        },
        "metrics": ["recoveryTimeS", "fallCount", "comDeviationM"],
    },
    "line-follow": {
        "family": "rover",
        "curriculum": ["straight-line", "curves", "occluded-line"],
        "horizonS": 70.0,
        "env": {
            "boundsM": [20, 10, 2],
            "terrain": {"kind": "flat", "friction": 0.75},
            "spawn": {"pose": [-8, 0, 0.1, 0, 0, 0]},
            "path": {"kind": "polyline", "points": [[-8, 0], [-2, 1.5], [3, -1.5], [8, 0]]},
        },
        "metrics": ["crossTrackErrorM", "lapProgress", "energyWh"],
    },
    "obstacle-course": {
        "family": "rover",
        "curriculum": ["wide-obstacles", "narrow-passage", "timed-course"],
        "horizonS": 100.0,
        "env": {
            "boundsM": [24, 12, 3],
            "terrain": {"kind": "flat", "friction": 0.75},
            "spawn": {"pose": [-10, 0, 0.1, 0, 0, 0]},
            "obstacles": [
                {"kind": "box", "center": [-4, -1.5, 0.4], "sizeM": [1.5, 2.5, 0.8]},
                {"kind": "box", "center": [1, 1.5, 0.4], "sizeM": [1.2, 2.0, 0.8]},
                {"kind": "box", "center": [6, 0, 0.4], "sizeM": [1.0, 2.0, 0.8]},
            ],
            "targets": [{"kind": "position", "xyz": [10, 0, 0.1], "radiusM": 0.8}],
        },
        "metrics": ["collisionCount", "taskTimeS", "pathEfficiency", "energyWh"],
    },
    "reach-track": {
        "family": "arm",
        "curriculum": ["static-reach", "moving-target", "disturbed-track"],
        "horizonS": 40.0,
        "env": {
            "boundsM": [2, 2, 2],
            "terrain": {"kind": "bench", "friction": 0.8},
            "spawn": {"pose": [0, 0, 0, 0, 0, 0]},
            "targets": [{"kind": "end-effector", "xyz": [0.45, 0.2, 0.35], "radiusM": 0.03}],
        },
        "metrics": ["trackingRmseM", "overshootM", "settlingTimeS", "energyWh"],
    },
}


def task_definition(task_id: str, *, curriculum_stage: int | None = None, horizon_s: float | None = None) -> dict[str, Any]:
    """Return a deep-copied task definition with caller overrides applied."""

    base = deepcopy(_TASKS.get(task_id, _TASKS["hover-hold"]))
    definition = {
        "id": task_id if task_id in _TASKS else "hover-hold",
        "suite": TASK_SUITE,
        "version": TASK_VERSION,
        **base,
    }
    if curriculum_stage is not None:
        definition["curriculumStage"] = curriculum_stage
    else:
        definition["curriculumStage"] = 1
    if horizon_s is not None:
        definition["horizonS"] = horizon_s
    return definition


def task_ids() -> list[str]:
    return sorted(_TASKS)
