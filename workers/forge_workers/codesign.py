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
    candidates = _search_candidates(base, payload, budget, seed)
    pareto = _pareto(candidates)
    return {
        "artifactKind": "codesign",
        "provider": gpu["provider"],
        "cacheKey": gpu["cacheKey"],
        "manifold": manifold,
        "tiers": ["validator-oracle", "fixture-rapier", "short-rollout", "modal-finalist"],
        "optimizer": {
            "algorithm": "deterministic-cma-tpe-fixture",
            "candidateBudget": budget,
            "seed": seed,
            "liveAdapter": "FORGE_CODESIGN_CMD",
            "tier2EngineBacked": False,
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


def _search_candidates(base: str, payload: dict[str, Any], budget: int, seed: int) -> list[dict[str, Any]]:
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
        color = colors[index % len(colors)]
        material = materials[(index + int(capacity_axis * 10)) % len(materials)]
        candidate_id = f"{base}-{family}-{index:03d}-{_digest([id_payload, index, metrics])}"
        tier_lane = index % 10
        if tier_lane < 5:
            tier = "validator-oracle"
        elif tier_lane < 8:
            tier = "fixture-rapier"
        else:
            tier = "short-rollout"
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
                "admitted": True,
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
        "score": round(max(0.0, min(1.0, score)), 4),
    }


def _pareto(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    front: list[dict[str, Any]] = []
    for candidate in candidates:
        metrics = candidate["metrics"]
        dominated = False
        for other in candidates:
            if other is candidate:
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
