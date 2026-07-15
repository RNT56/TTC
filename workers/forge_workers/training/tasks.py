"""Versioned P7 training task definitions.

The live SB3/MuJoCo path consumes the same task shape. Keeping the keyless worker
on that contract lets Studio, scorecards, marketplace listings, and future live
adapters agree on task identity before the heavy runtimes are installed.
"""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any

TASK_SUITE = "p7-v3"
TASK_VERSION = "3.0.0"
TASK_COORDINATE_FRAME = "forge-y-up-rh-m"

DEFAULT_DOMAIN_RANDOMIZATION: dict[str, Any] = {
    "massPct": 15,
    "kvPct": 8,
    "sagPct": 20,
    "latencyMs": [0, 30],
    "friction": [0.4, 1.2],
    "windMps": [0, 4],
    "obsDropoutPct": [0, 5],
}

_DEFAULT_OBSERVATIONS: dict[str, list[str]] = {
    "arm": [
        "estimator.jointPosition",
        "estimator.jointVelocity",
        "target.error",
        "endEffector.pose",
        "powertrain.motorCurrent",
    ],
    "legged": [
        "estimator.basePose",
        "estimator.baseVelocity",
        "estimator.footContact",
        "target.error",
        "powertrain.motorCurrent",
    ],
    "multirotor": [
        "estimator.attitude",
        "estimator.angularRate",
        "estimator.linearVelocity",
        "target.error",
        "battery.normalizedVoltage",
        "powertrain.motorCurrent",
    ],
    "rover": [
        "estimator.pose2d",
        "estimator.velocity",
        "target.error",
        "terrain.contact",
        "powertrain.motorCurrent",
    ],
}

_DEFAULT_ACTIONS: dict[str, list[str]] = {
    "arm": ["jointPosition", "jointVelocity"],
    "legged": ["legPhase", "stepHeight", "turnRate", "bodyHeight"],
    "multirotor": ["throttle", "roll", "pitch", "yaw"],
    "rover": ["drive", "turn"],
}


_TASKS: dict[str, dict[str, Any]] = {
    "hover-hold": {
        "family": "multirotor",
        "curriculum": ["stabilize", "hold-altitude", "reject-wind"],
        "horizonS": 60.0,
        "env": {
            "boundsM": [8, 5, 8],
            "terrain": {"kind": "flat", "friction": 0.8},
            "spawn": {"pose": [0, 1.2, 0, 0, 0, 0]},
            "targets": [{"kind": "position", "xyz": [0, 1.5, 0], "radiusM": 0.25}],
            "disturbances": {"windMps": [0, 4], "gustEveryS": 8},
        },
        "metrics": ["positionRmseM", "attitudeRmseDeg", "energyWh", "failsafeCount"],
    },
    "waypoint-chain": {
        "family": "multirotor",
        "curriculum": ["single-waypoint", "three-waypoint", "timed-chain"],
        "horizonS": 90.0,
        "env": {
            "boundsM": [30, 8, 20],
            "terrain": {"kind": "flat", "friction": 0.8},
            "spawn": {"pose": [-10, 1.2, 0, 0, 0, 0]},
            "targets": [
                {"kind": "waypoint", "xyz": [-4, 2, 2], "radiusM": 0.8},
                {"kind": "waypoint", "xyz": [3, 2.5, -3], "radiusM": 0.8},
                {"kind": "waypoint", "xyz": [10, 1.8, 0], "radiusM": 0.8},
            ],
        },
        "metrics": ["waypointsHit", "taskTimeS", "energyWh", "pathEfficiency"],
    },
    "gate-slalom": {
        "family": "multirotor",
        "curriculum": ["wide-gates", "offset-gates", "timed-slalom"],
        "horizonS": 75.0,
        "env": {
            "boundsM": [24, 6, 8],
            "terrain": {"kind": "flat", "friction": 0.8},
            "spawn": {"pose": [-9, 1.5, 0, 0, 0, 0]},
            "gates": [
                {"id": "g1", "center": [-4, 1.6, -1.5], "sizeM": [2.5, 1.8]},
                {"id": "g2", "center": [0, 1.8, 1.5], "sizeM": [2.2, 1.6]},
                {"id": "g3", "center": [5, 1.5, -1.0], "sizeM": [2.0, 1.5]},
            ],
        },
        "metrics": ["gatesCleared", "taskTimeS", "collisionCount", "energyWh"],
    },
    "velocity-tracking": {
        "family": "multirotor",
        "curriculum": ["axis-speed", "vector-speed", "gust-tracking"],
        "horizonS": 60.0,
        "env": {
            "boundsM": [20, 6, 20],
            "terrain": {"kind": "flat", "friction": 0.8},
            "spawn": {"pose": [0, 1.4, 0, 0, 0, 0]},
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
            "boundsM": [14, 3, 8],
            "terrain": {"kind": "flat", "friction": 0.9},
            "spawn": {"pose": [-5, 0.35, 0, 0, 0, 0]},
            "targets": [{"kind": "position", "xyz": [5, 0.35, 0], "radiusM": 0.5}],
        },
        "metrics": ["targetDistanceM", "fallCount", "comStability", "energyWh"],
    },
    "rough-terrain": {
        "family": "legged",
        "curriculum": ["low-noise", "stepped", "rough"],
        "horizonS": 90.0,
        "env": {
            "boundsM": [16, 4, 8],
            "terrain": {"kind": "heightfield", "amplitudeM": 0.12, "friction": 0.85},
            "spawn": {"pose": [-6, 0.45, 0, 0, 0, 0]},
            "targets": [{"kind": "position", "xyz": [6, 0.45, 0], "radiusM": 0.7}],
        },
        "metrics": ["distanceM", "fallCount", "footSlip", "energyWh"],
    },
    "push-recovery": {
        "family": "legged",
        "curriculum": ["small-push", "lateral-push", "random-push"],
        "horizonS": 45.0,
        "env": {
            "boundsM": [8, 3, 8],
            "terrain": {"kind": "flat", "friction": 0.9},
            "spawn": {"pose": [0, 0.4, 0, 0, 0, 0]},
            "disturbances": {"impulseN": [10, 45], "directions": ["x", "z"]},
        },
        "metrics": ["recoveryTimeS", "fallCount", "comDeviationM"],
    },
    "line-follow": {
        "family": "rover",
        "curriculum": ["straight-line", "curves", "occluded-line"],
        "horizonS": 70.0,
        "env": {
            "boundsM": [20, 2, 10],
            "terrain": {"kind": "flat", "friction": 0.75},
            "spawn": {"pose": [-8, 0.1, 0, 0, 0, 0]},
            "path": {"kind": "polyline", "plane": "xz", "points": [[-8, 0], [-2, 1.5], [3, -1.5], [8, 0]]},
        },
        "metrics": ["crossTrackErrorM", "lapProgress", "energyWh"],
    },
    "obstacle-course": {
        "family": "rover",
        "curriculum": ["wide-obstacles", "narrow-passage", "timed-course"],
        "horizonS": 100.0,
        "env": {
            "boundsM": [24, 3, 12],
            "terrain": {"kind": "flat", "friction": 0.75},
            "spawn": {"pose": [-10, 0.1, 0, 0, 0, 0]},
            "obstacles": [
                {"kind": "box", "center": [-4, 0.4, -1.5], "sizeM": [1.5, 0.8, 2.5]},
                {"kind": "box", "center": [1, 0.4, 1.5], "sizeM": [1.2, 0.8, 2.0]},
                {"kind": "box", "center": [6, 0.4, 0], "sizeM": [1.0, 0.8, 2.0]},
            ],
            "targets": [{"kind": "position", "xyz": [10, 0.1, 0], "radiusM": 0.8}],
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
            "targets": [{"kind": "end-effector", "xyz": [0.45, 0.35, 0.2], "radiusM": 0.03}],
        },
        "metrics": ["trackingRmseM", "overshootM", "settlingTimeS", "energyWh"],
    },
}


def task_definition(task_id: str, *, curriculum_stage: int | None = None, horizon_s: float | None = None) -> dict[str, Any]:
    """Return a deep-copied task definition with caller overrides applied."""

    base = deepcopy(_TASKS.get(task_id, _TASKS["hover-hold"]))
    family = str(base.get("family", "multirotor"))
    definition = {
        "id": task_id if task_id in _TASKS else "hover-hold",
        "suite": TASK_SUITE,
        "version": TASK_VERSION,
        "coordinateFrame": TASK_COORDINATE_FRAME,
        "archetype": family,
        **base,
        "observations": _DEFAULT_OBSERVATIONS.get(family, _DEFAULT_OBSERVATIONS["multirotor"]),
        "actions": _DEFAULT_ACTIONS.get(family, _DEFAULT_ACTIONS["multirotor"]),
        "reward": _reward_definition(base["metrics"], family),
        "termination": {
            "timeoutS": base["horizonS"],
            "outOfBounds": base["env"]["boundsM"],
            "unsafeContact": family in {"legged", "rover", "arm"},
        },
        "success": {
            "metrics": base["metrics"],
            "minSuccessRate": 0.9,
            "maxEnergyWh": None,
        },
        "domainRandomization": deepcopy(DEFAULT_DOMAIN_RANDOMIZATION),
    }
    if curriculum_stage is not None:
        definition["curriculumStage"] = curriculum_stage
    else:
        definition["curriculumStage"] = 1
    if horizon_s is not None:
        definition["horizonS"] = horizon_s
    definition["definitionHash"] = task_definition_hash(definition)
    return definition


def _reward_definition(metrics: list[str], family: str) -> dict[str, Any]:
    if family != "multirotor":
        return {
            "terms": metrics,
            "energyPenalty": "energyWh",
            "safetyPenalty": "collisionCount",
        }
    return {
        "schema": "p7-multirotor-reward-v1",
        "terms": metrics,
        "proximityDecayPerM": 0.5,
        "progressWeight": 8.0,
        "instantSuccessBonus": 3.0,
        "targetAdvanceBonus": 50.0,
        "taskCompletionBonus": 100.0,
        "unsafeTerminationPenalty": 100.0,
        "tiltPenalty": 0.05,
        "angularRatePenalty": 0.01,
        "actionPenalty": 0.005,
        "control": {
            "mode": "normalized-flight-target-v1",
            "attitudeProportional": 0.04,
            "angularRateDamping": 0.004,
            "yawRateProportional": 0.04,
            "velocityFilterTauS": 0.06,
        },
        "energyPenalty": "energyWh",
        "safetyPenalty": "failsafeCount",
    }


def task_definition_hash(definition: dict[str, Any]) -> str:
    """Return the canonical digest of a task without its self-referential hash."""

    canonical = deepcopy(definition)
    canonical.pop("definitionHash", None)
    encoded = json.dumps(
        canonical,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def course_task_definition(
    env_spec: dict[str, Any],
    *,
    course_id: str | None = None,
    curriculum_stage: int | None = None,
    horizon_s: float | None = None,
    archetype: str | None = None,
) -> dict[str, Any]:
    """Compile an EnvSpec/course object into the P7 task shape."""

    meta = _record(env_spec.get("meta"))
    resolved_id = str(course_id or meta.get("id") or env_spec.get("id") or "course")
    name = str(meta.get("name") or env_spec.get("name") or resolved_id)
    task_id = _course_task_id(env_spec)
    base = task_definition(task_id, curriculum_stage=curriculum_stage, horizon_s=horizon_s)
    win = _record(env_spec.get("win"))
    compiled_horizon = horizon_s if horizon_s is not None else _number(win.get("timeLimitS"), _number(env_spec.get("timeLimitS"), base["horizonS"]))
    family = archetype or _course_family(env_spec, str(base["family"]))
    compiled = {
        **base,
        "id": f"course:{resolved_id}",
        "sourceTask": task_id,
        "source": "course",
        "family": family,
        "horizonS": compiled_horizon,
        "course": {
            "id": resolved_id,
            "name": name,
            "version": str(meta.get("version") or env_spec.get("version") or "1.0.0"),
        },
        "env": _course_env(env_spec, base["env"]),
        "reward": _course_reward(env_spec, task_id),
    }
    compiled["definitionHash"] = task_definition_hash(compiled)
    return compiled


def task_ids() -> list[str]:
    return sorted(_TASKS)


def _course_task_id(env_spec: dict[str, Any]) -> str:
    tasks = _strings(env_spec.get("tasks"))
    for task in tasks:
        if task in _TASKS:
            return task
    kind = str(env_spec.get("kind", "")).lower()
    if "slalom" in kind or _list(env_spec.get("gates")):
        return "gate-slalom"
    if "line" in kind or _record(env_spec.get("path")):
        return "line-follow"
    if "obstacle" in kind or _list(env_spec.get("obstacles")):
        return "obstacle-course"
    if "reach" in kind:
        return "reach-track"
    return "waypoint-chain"


def _course_family(env_spec: dict[str, Any], default: str) -> str:
    for spawn in _list(env_spec.get("spawns")):
        archetypes = _strings(_record(spawn).get("archetypeFilter"))
        if archetypes:
            return archetypes[0]
    task_id = _course_task_id(env_spec)
    if task_id in {"line-follow", "obstacle-course"}:
        return "rover"
    if task_id == "reach-track":
        return "arm"
    return default


def _course_env(env_spec: dict[str, Any], base_env: dict[str, Any]) -> dict[str, Any]:
    env = deepcopy(base_env)
    if isinstance(env_spec.get("boundsM"), list):
        env["boundsM"] = env_spec["boundsM"]
    if isinstance(env_spec.get("terrain"), dict):
        env["terrain"] = env_spec["terrain"]
    spawns = _list(env_spec.get("spawns"))
    if spawns:
        env["spawn"] = _record(spawns[0])
    gates = _course_gates(env_spec.get("gates"))
    if gates:
        env["gates"] = gates
    obstacles = _list(env_spec.get("obstacles"))
    if obstacles:
        env["obstacles"] = obstacles
    path = _record(env_spec.get("path"))
    if path:
        env["path"] = path
    env_block = _record(env_spec.get("env"))
    if env_block:
        env["courseEnv"] = env_block
    return env


def _course_gates(value: Any) -> list[dict[str, Any]]:
    gates: list[dict[str, Any]] = []
    for gate in _list(value):
        row = _record(gate)
        pose = _record(row.get("pose"))
        center = pose.get("p") if isinstance(pose.get("p"), list) else row.get("center")
        width = _number(row.get("widthM"), 1.0)
        height = _number(row.get("heightM"), 1.0)
        gates.append(
            {
                "id": str(row.get("id", f"gate-{len(gates) + 1}")),
                "center": center if isinstance(center, list) else [0, 0, 0],
                "sizeM": row.get("sizeM") if isinstance(row.get("sizeM"), list) else [width, height],
            }
        )
    return gates


def _course_reward(env_spec: dict[str, Any], task_id: str) -> dict[str, Any]:
    win = _record(env_spec.get("win"))
    return {
        "source": "env-spec",
        "task": task_id,
        "gateOrder": _strings(win.get("gateOrder")),
        "timeLimitS": _number(win.get("timeLimitS"), _number(env_spec.get("timeLimitS"), 0.0)),
        "contactPenalties": bool(win.get("contactPenalties", env_spec.get("contactPenalties", True))),
    }


def _record(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _strings(value: Any) -> list[str]:
    return [str(item) for item in value] if isinstance(value, list) else []


def _number(value: Any, default: float) -> float:
    return float(value) if isinstance(value, (int, float)) else default
