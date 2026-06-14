"""Co-design oracle/evaluation workers (P9).

The keyless implementation generates deterministic JSON-Patch candidates with a
budgeted optimizer-shaped search. Higher tiers can swap in Optuna/CMA-ES and
Modal-backed simulation without changing the queue contract.
"""

from __future__ import annotations

import hashlib
import json
import math
import random
from typing import Any

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import configured_gpu_adapter
from forge_workers.queue import Job, registry


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode("utf-8")).hexdigest()[:10]


def _seed(payload: dict[str, Any]) -> int:
    if isinstance(payload.get("seed"), int):
        return int(payload["seed"])
    seed_payload = {key: value for key, value in payload.items() if key not in {"budget", "candidateBudget"}}
    return int(_digest(seed_payload), 16)


def evaluate(payload: dict[str, Any]) -> dict[str, Any]:
    external = run_json_command(
        "FORGE_CODESIGN_CMD",
        {"task": "codesign.evaluate", **payload},
        timeout_s=float(payload.get("timeoutS", 12 * 3600)),
    )
    if external is not None:
        if external.get("artifactKind") == "codesign":
            return external
        return {
            "artifactKind": "codesign",
            "provider": external.get("provider", "external-optimizer"),
            "cacheKey": external.get("cacheKey", f"codesign.external:{_digest(payload)}"),
            "manifold": external.get("manifold", payload.get("manifold", {})),
            "tiers": external.get("tiers", ["validator-oracle", "rapier-smoke", "mujoco-rollout", "training-finalist"]),
            "candidates": external.get("candidates", []),
            "pareto": external.get("pareto", []),
            "benchmark": external.get("benchmark"),
        }
    base = payload.get("modelId") or payload.get("contractHash") or "candidate"
    gpu = configured_gpu_adapter().run("codesign.evaluate", payload)
    budget = _candidate_budget(payload)
    seed = _seed(payload)
    manifold = payload.get(
        "manifold",
        {
            "categorical": ["battery", "prop", "motor"],
            "continuous": ["mass", "armLength", "capacityMah", "maxSpeedMs"],
            "bounds": {"mass": [0.7, 1.15], "capacityMah": [1300, 2200]},
        },
    )
    constraints = _constraints(payload)
    candidates = _search_candidates(base, payload, budget, seed, constraints)
    pareto = _pareto(candidates)
    tier0_ms = [float(c["evaluations"]["tier0"]["runtimeMs"]) for c in candidates]
    tier2_ms = [float(c["evaluations"]["tier2"]["runtimeMs"]) for c in candidates if c["evaluations"]["tier2"]["pass"]]
    return {
        "artifactKind": "codesign",
        "provider": gpu["provider"],
        "cacheKey": gpu["cacheKey"],
        "manifold": manifold,
        "constraints": constraints,
        "tiers": ["validator-oracle", "rapier-smoke", "mujoco-rollout", "training-finalist"],
        "optimizer": {
            "algorithm": "deterministic-cma-tpe-fixture",
            "candidateBudget": budget,
            "seed": seed,
            "liveAdapter": "FORGE_CODESIGN_CMD",
            "tier2EngineBacked": False,
            "tier0BudgetMs": 50,
            "tier2Evaluated": len(tier2_ms),
            "trainingFinalists": sum(1 for candidate in candidates if candidate["tier"] == "training-finalist"),
        },
        "benchmark": {
            "tier0MaxMs": round(max(tier0_ms) if tier0_ms else 0.0, 3),
            "tier0BudgetMs": 50,
            "tier2CandidateBudget": budget,
            "tier2EstimatedRuntimeHours": round(sum(tier2_ms) / 3_600_000, 4),
            "overnightBudgetHours": float(payload.get("overnightBudgetHours", 12.0)),
            "engineBacked": False,
        },
        "candidates": candidates,
        "pareto": pareto,
    }


def _candidate_budget(payload: dict[str, Any]) -> int:
    raw = payload.get("candidateBudget", payload.get("budget", 24))
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = 24
    return max(3, min(200, value))


def _constraints(payload: dict[str, Any]) -> dict[str, float]:
    raw = payload.get("constraints")
    values = raw if isinstance(raw, dict) else {}

    def number(name: str, default: float) -> float:
        try:
            return float(values.get(name, payload.get(name, default)))
        except (TypeError, ValueError):
            return default

    return {
        "maxMassG": number("maxMassG", 900.0),
        "minEnduranceMin": number("minEnduranceMin", 6.0),
        "maxTaskTimeS": number("maxTaskTimeS", 24.0),
        "minScore": number("minScore", 0.55),
    }


def _search_candidates(base: str, payload: dict[str, Any], budget: int, seed: int, constraints: dict[str, float]) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    colors = ["#39c8ff", "#7dd87d", "#f6c85f", "#f08a8a", "#b48cff", "#f4f4f4"]
    materials = ["satin", "carbon", "nylon-pa12", "petg-cf"]
    id_payload = {key: value for key, value in payload.items() if key not in {"budget", "candidateBudget"}}
    candidates: list[dict[str, Any]] = []
    for index in range(budget):
        family = "cma-es" if index % 3 != 1 else "tpe"
        phase = index / 199
        if family == "cma-es":
            center = 0.48 + 0.22 * math.sin(seed * 0.001 + index * 0.61)
            sigma = max(0.04, 0.24 * (1.0 - phase))
            mass_axis = min(1.0, max(0.0, rng.gauss(center, sigma)))
            capacity_axis = min(1.0, max(0.0, rng.gauss(0.52 + phase * 0.32, sigma * 0.8)))
        else:
            mass_axis = (index % 7) / 6
            capacity_axis = ((index * 5 + seed) % 11) / 10
        speed_axis = min(1.0, max(0.0, 0.2 + 0.65 * rng.random() + 0.15 * phase))
        metrics = _candidate_metrics(mass_axis, capacity_axis, speed_axis)
        evaluations = _tier_evaluations(metrics, constraints, index)
        admission_reasons = _admission_reasons(evaluations)
        admitted = len(admission_reasons) == 0
        tier = _deepest_tier(evaluations, index)
        color = colors[index % len(colors)]
        material = materials[(index + int(capacity_axis * 10)) % len(materials)]
        candidate_id = f"{base}-{family}-{index:03d}-{_digest([id_payload, index, metrics])}"
        candidates.append(
            {
                "id": candidate_id,
                "patch": [
                    {"op": "replace", "path": "/meta/name", "value": f"FORGE co-design {index + 1:03d}"},
                    {"op": "replace", "path": "/parts/0/color", "value": color},
                    {"op": "replace", "path": "/parts/0/material", "value": material},
                ],
                "tier": tier,
                "algorithm": family,
                "admitted": admitted,
                "admission": {"pass": admitted, "reasons": admission_reasons},
                "evaluations": evaluations,
                "metrics": metrics,
            }
        )
    return candidates


def _candidate_metrics(mass_axis: float, capacity_axis: float, speed_axis: float) -> dict[str, float]:
    mass_g = 650 + 165 * mass_axis + 95 * capacity_axis
    endurance_min = 6.1 + 3.6 * capacity_axis - 1.25 * mass_axis
    task_time_s = 24.0 - 7.0 * speed_axis + 2.5 * mass_axis
    score = 0.48 + 0.28 * speed_axis + 0.22 * capacity_axis - 0.08 * mass_axis
    return {
        "massG": round(mass_g, 2),
        "enduranceMin": round(max(3.0, endurance_min), 3),
        "taskTimeS": round(max(8.0, task_time_s), 3),
        "stabilityMargin": round(max(0.0, 0.28 + 0.18 * capacity_axis - 0.12 * mass_axis), 4),
        "score": round(max(0.0, min(1.0, score)), 4),
    }


def _tier_evaluations(metrics: dict[str, float], constraints: dict[str, float], index: int) -> dict[str, dict[str, Any]]:
    tier0_reasons = []
    if metrics["massG"] > constraints["maxMassG"]:
        tier0_reasons.append(f"mass {metrics['massG']:.1f} g exceeds {constraints['maxMassG']:.1f} g")

    tier0 = {
        "pass": not tier0_reasons,
        "runtimeMs": round(6.0 + (index % 9) * 3.7, 3),
        "engine": "forge-validate-native",
        "checks": ["schema", "validator", "static-physics"],
        "reasons": tier0_reasons,
    }

    tier1_reasons = []
    if not tier0["pass"]:
        tier1_reasons.append("tier0 failed")
    if metrics["stabilityMargin"] < 0.18:
        tier1_reasons.append(f"stability margin {metrics['stabilityMargin']:.2f} < 0.18")
    tier1 = {
        "pass": not tier1_reasons,
        "runtimeMs": round(900.0 + (index % 11) * 70.0, 3),
        "engine": "rapier-smoke-fixture",
        "checks": ["drop", "hover-trim", "collision-budget"],
        "reasons": tier1_reasons,
    }

    tier2_reasons = []
    if not tier1["pass"]:
        tier2_reasons.append("tier1 failed")
    if metrics["enduranceMin"] < constraints["minEnduranceMin"]:
        tier2_reasons.append(f"endurance {metrics['enduranceMin']:.2f} min < {constraints['minEnduranceMin']:.2f} min")
    if metrics["taskTimeS"] > constraints["maxTaskTimeS"]:
        tier2_reasons.append(f"task time {metrics['taskTimeS']:.2f} s > {constraints['maxTaskTimeS']:.2f} s")
    if metrics["score"] < constraints["minScore"]:
        tier2_reasons.append(f"score {metrics['score']:.3f} < {constraints['minScore']:.3f}")
    tier2 = {
        "pass": not tier2_reasons,
        "runtimeMs": round(42_000.0 + (index % 13) * 2500.0, 3),
        "engine": "mujoco-rollout-fixture",
        "checks": ["short-rollout", "energy", "course-objective"],
        "reasons": tier2_reasons,
    }

    tier3_reasons = []
    if not tier2["pass"]:
        tier3_reasons.append("tier2 failed")
    if metrics["score"] < constraints["minScore"] + 0.08:
        tier3_reasons.append("below finalist score margin")
    tier3 = {
        "pass": not tier3_reasons,
        "runtimeMs": round(4_800_000.0 + (index % 5) * 540_000.0, 3),
        "engine": "training-finalist-fixture",
        "checks": ["policy-scorecard", "robustness-grid", "energy"],
        "reasons": tier3_reasons,
    }

    return {"tier0": tier0, "tier1": tier1, "tier2": tier2, "tier3": tier3}


def _admission_reasons(evaluations: dict[str, dict[str, Any]]) -> list[str]:
    if evaluations["tier2"]["pass"]:
        return []
    reasons: list[str] = []
    for tier in ("tier0", "tier1", "tier2"):
        reasons.extend(f"{tier}: {reason}" for reason in evaluations[tier]["reasons"])
    return reasons


def _deepest_tier(evaluations: dict[str, dict[str, Any]], index: int) -> str:
    if evaluations["tier3"]["pass"] and index % 4 == 0:
        return "training-finalist"
    if evaluations["tier2"]["pass"]:
        return "mujoco-rollout"
    if evaluations["tier1"]["pass"]:
        return "rapier-smoke"
    return "validator-oracle"


def _pareto(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    front: list[dict[str, Any]] = []
    for candidate in candidates:
        if not candidate.get("admitted"):
            continue
        metrics = candidate["metrics"]
        dominated = False
        for other in candidates:
            if other is candidate:
                continue
            if not other.get("admitted"):
                continue
            om = other["metrics"]
            at_least = om["score"] >= metrics["score"] and om["enduranceMin"] >= metrics["enduranceMin"] and om["massG"] <= metrics["massG"]
            strictly = om["score"] > metrics["score"] or om["enduranceMin"] > metrics["enduranceMin"] or om["massG"] < metrics["massG"]
            if at_least and strictly:
                dominated = True
                break
        if not dominated:
            front.append(candidate)
    return front


@registry.register("codesign.evaluate")
def handle_codesign(job: Job) -> dict[str, Any]:
    return evaluate(job.payload)
