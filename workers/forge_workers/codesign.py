"""Co-design oracle/evaluation workers (P9).

The fixture implementation generates deterministic JSON-Patch candidates and a
small Pareto front. Higher tiers can swap in Optuna/CMA-ES and Modal-backed
simulation without changing the queue contract.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from forge_workers.external import run_json_command
from forge_workers.modal_adapter import configured_gpu_adapter
from forge_workers.queue import Job, registry


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode("utf-8")).hexdigest()[:10]


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
    candidates = [
        {
            "id": f"{base}-color-{_digest([payload, 'color'])}",
            "patch": [{"op": "replace", "path": "/parts/0/color", "value": "#39c8ff"}],
            "tier": "validator-oracle",
            "admitted": True,
            "metrics": {"massG": 690, "enduranceMin": 7.1, "score": 0.74},
        },
        {
            "id": f"{base}-material-{_digest([payload, 'material'])}",
            "patch": [{"op": "replace", "path": "/parts/0/material", "value": "satin"}],
            "tier": "fixture-rapier",
            "admitted": True,
            "metrics": {"massG": 735, "enduranceMin": 8.2, "score": 0.81},
        },
        {
            "id": f"{base}-name-{_digest([payload, 'name'])}",
            "patch": [{"op": "replace", "path": "/meta/name", "value": "FORGE co-design candidate"}],
            "tier": "short-rollout",
            "admitted": True,
            "metrics": {"massG": 710, "enduranceMin": 7.5, "score": 0.84},
        },
    ]
    pareto = _pareto(candidates)
    return {
        "artifactKind": "codesign",
        "provider": gpu["provider"],
        "cacheKey": gpu["cacheKey"],
        "manifold": payload.get(
            "manifold",
            {
                "categorical": ["battery", "prop", "motor"],
                "continuous": ["mass", "armLength", "capacityMah", "maxSpeedMs"],
                "bounds": {"mass": [0.7, 1.15], "capacityMah": [1300, 2200]},
            },
        ),
        "tiers": ["validator-oracle", "fixture-rapier", "short-rollout", "modal-finalist"],
        "candidates": candidates,
        "pareto": pareto,
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
