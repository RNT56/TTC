"""Fixture-backed training workers (P7/P8).

SB3, MuJoCo, ONNX export, and system-ID can be installed per deployment image.
The local handler contract is deterministic and gates policy export through the
same scorecard object used by tests.
"""

from __future__ import annotations

from typing import Any

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import configured_gpu_adapter
from forge_workers.queue import Job, registry
from forge_workers.training.scorecard import Scorecard, gate


def train_policy(payload: dict[str, Any]) -> dict[str, Any]:
    task = str(payload.get("task", "hover-hold"))
    contract_hash = str(payload.get("contractHash", "00" * 32))
    seed = str(payload.get("seed", "0"))
    external = run_json_command(
        "FORGE_SB3_TRAIN_CMD",
        {"task": "train.policy", **payload},
        timeout_s=float(payload.get("timeoutS", 12 * 3600)),
    )
    if external is not None:
        if external.get("artifactKind") == "policy":
            return external
        scorecard = external.get("scorecard") if isinstance(external.get("scorecard"), dict) else {}
        exportable = bool(scorecard.get("exportable", external.get("exportable", False))) if isinstance(scorecard, dict) else False
        return {
            "artifactKind": "policy",
            "provider": external.get("provider", "external-sb3"),
            "algorithm": external.get("algorithm", payload.get("algorithm", "ppo")),
            "task": external.get("task", {"id": task, "suite": "p7-v1", "curriculumStage": int(payload.get("curriculumStage", 1)), "horizonS": float(payload.get("horizonS", 60))}),
            "io": external.get(
                "io",
                {
                    "observations": external.get("observations", []),
                    "actions": external.get("actions", []),
                    "onnxHeader": external.get(
                        "onnxHeader",
                        {"contractHash": contract_hash, "task": task, "observationCount": "0", "actionCount": "0"},
                    ),
                },
            ),
            "domainRandomization": external.get("domainRandomization", payload.get("domainRandomization", {})),
            "onnx": external.get("onnx", {"cacheKey": external.get("cacheKey", f"external-sb3:{contract_hash[:12]}"), "opset": 18, "fixture": False}),
            "scorecard": {
                **scorecard,
                "task": scorecard.get("task", task) if isinstance(scorecard, dict) else task,
                "taskVersion": scorecard.get("taskVersion", payload.get("taskVersion", "1.0.0")) if isinstance(scorecard, dict) else "1.0.0",
                "lineage": scorecard.get("lineage", {"contractHash": contract_hash, "seed": seed, "codeVersion": external.get("codeVersion", "external-sb3")}) if isinstance(scorecard, dict) else {},
                "exportable": exportable,
                "reasons": scorecard.get("reasons", [] if exportable else ["external scorecard did not mark policy exportable"]) if isinstance(scorecard, dict) else [],
            },
        }
    gpu = configured_gpu_adapter().run("train.policy", payload)
    card = Scorecard(
        task=task,
        task_version=str(payload.get("taskVersion", "1.0.0")),
        success_rate=float(payload.get("successRate", 0.91)),
        robustness={
            "mass+15%": float(payload.get("massRobustness", 0.84)),
            "kv-8%": float(payload.get("kvRobustness", 0.88)),
            "wind4ms": float(payload.get("windRobustness", 0.79)),
        },
        energy_wh=float(payload.get("energyWh", 2.2)),
        trained_on_estimator=bool(payload.get("trainedOnEstimator", True)),
        lineage={"contractHash": contract_hash, "seed": seed, "codeVersion": "fixture-p7-v1"},
    )
    result = gate(card)
    observations = [
        "estimator.attitude",
        "estimator.angularRate",
        "target.error",
        "battery.normalizedVoltage",
        "powertrain.motorCurrent",
    ]
    actions = payload.get("actions") or ["throttle", "roll", "pitch", "yaw"]
    randomization = payload.get(
        "domainRandomization",
        {
            "massPct": 15,
            "kvPct": 8,
            "sagPct": 20,
            "latencyMs": [0, 30],
            "friction": [0.4, 1.2],
            "windMps": [0, 4],
            "obsDropoutPct": [0, 5],
        },
    )
    return {
        "artifactKind": "policy",
        "provider": gpu["provider"],
        "algorithm": str(payload.get("algorithm", "ppo-fixture")),
        "task": {
            "id": task,
            "suite": "p7-v1",
            "curriculumStage": int(payload.get("curriculumStage", 1)),
            "horizonS": float(payload.get("horizonS", 60)),
        },
        "io": {
            "observations": observations,
            "actions": actions,
            "onnxHeader": {
                "contractHash": contract_hash,
                "task": task,
                "observationCount": str(len(observations)),
                "actionCount": str(len(actions)),
            },
        },
        "domainRandomization": randomization,
        "onnx": {"cacheKey": gpu["cacheKey"], "opset": 18, "fixture": True, "path": f"{gpu['cacheKey']}/policy.onnx"},
        "scorecard": {
            "task": card.task,
            "taskVersion": card.task_version,
            "successRate": card.success_rate,
            "robustness": card.robustness,
            "energyWh": card.energy_wh,
            "lineage": card.lineage,
            "exportable": result.exportable,
            "reasons": result.reasons,
        },
    }


def fit_sysid(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_SYSID_FIT_CMD",
        {"task": "train.sysid-fit", **payload},
        timeout_s=float(payload.get("timeoutS", 1800)),
    )
    if external is not None:
        if external.get("artifactKind") == "sysid":
            return external
        return {
            "artifactKind": "sysid",
            "sampleCount": external.get("sampleCount", len(payload.get("samples", [])) if isinstance(payload.get("samples"), list) else 0),
            "fit": external.get("fit", {}),
            "simPatch": external.get("simPatch", []),
            "rejectReason": external.get("rejectReason"),
        }
    samples = payload.get("samples", [])
    sample_count = len(samples) if isinstance(samples, list) else 0
    accepted = sample_count >= 3
    sag_errors: list[float] = []
    current_values: list[float] = []
    sample_rows = samples if isinstance(samples, list) else []
    for sample in sample_rows:
        if not isinstance(sample, dict):
            continue
        voltage = float(sample.get("voltageV", payload.get("nominalVoltageV", 16.8)))
        current = float(sample.get("currentA", 0))
        nominal = float(payload.get("nominalVoltageV", 16.8))
        if current > 0:
            sag_errors.append(max(0.0, nominal - voltage))
            current_values.append(current)
    r_int_mohm = None
    if current_values:
        r_int_mohm = sum((sag / current) * 1000 for sag, current in zip(sag_errors, current_values)) / len(current_values)
    return {
        "artifactKind": "sysid",
        "sampleCount": sample_count,
        "fit": {
            "batterySagRmse": 0.041 if accepted else None,
            "currentRmseA": 1.2 if accepted else None,
            "rIntMohm": r_int_mohm,
            "frictionScale": float(payload.get("frictionScale", 1.0)),
            "timeConstantMs": float(payload.get("timeConstantMs", 45.0)),
            "accepted": accepted,
        },
        "simPatch": [{"op": "replace", "path": "/sim/battery/r_int_mohm", "value": round(r_int_mohm, 3)}] if accepted and r_int_mohm is not None else [],
        "rejectReason": None if accepted else "system-ID requires at least 3 telemetry samples",
    }


@registry.register("train.policy")
def handle_train_policy(job: Job) -> dict[str, Any]:
    return train_policy(job.payload)


@registry.register("train.sysid-fit")
def handle_sysid(job: Job) -> dict[str, Any]:
    return fit_sysid(job.payload)
