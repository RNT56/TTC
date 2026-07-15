"""Live simulation runner seams for P6/P7/P9.

These helpers are intentionally not registered as public job kinds. Existing jobs
(`train.policy` and `codesign.evaluate`) call into live simulation as part of their
own adapters when a deployment configures the commands.
"""

from __future__ import annotations

import math
from typing import Any

from forge_workers.external import run_json_command


def run_mujoco_parity(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Run an engine-backed Rapier/MuJoCo parity command when configured."""

    return run_json_command("FORGE_MUJOCO_PARITY_CMD", {"task": "sim.parity", **payload}, timeout_s=float(payload.get("timeoutS", 1800)))


def run_mjx_benchmark(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Run P7-010 benchmark data collection when configured.

    Adoption policy stays outside this helper: MJX is adopted only when benchmark
    output beats CPU MuJoCo/SB3 by the recorded threshold and parity stays inside
    frozen tolerances.
    """

    return run_json_command("FORGE_MJX_BENCH_CMD", {"task": "sim.mjx-benchmark", **payload}, timeout_s=float(payload.get("timeoutS", 7200)))


REQUIRED_MJX_MORPHOLOGIES = ("d12-quad", "d12-rover", "legged")


def mjx_benchmark_report(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize P7-010 benchmark output and apply the MJX adoption rule."""

    external = run_mjx_benchmark(payload)
    source = external if external is not None else payload.get("benchmark")
    return evaluate_mjx_benchmark_source(
        source,
        missing_source=external is None and source is None,
    )


def evaluate_mjx_benchmark_source(
    source: Any,
    *,
    missing_source: bool = False,
) -> dict[str, Any]:
    """Apply the centralized adoption rule to fixture or source-bound evidence."""

    rows = _benchmark_rows(source)
    decisions = [_mjx_decision(row) for row in rows]
    missing = [name for name in REQUIRED_MJX_MORPHOLOGIES if name not in {row["morphology"] for row in rows}]
    throughput_failures = [
        decision["morphology"]
        for decision in decisions
        if decision["throughputOk"] is False
    ]
    throughput_missing = [
        decision["morphology"]
        for decision in decisions
        if decision["throughputOk"] is None
    ]
    budget_measurements_missing = [
        decision["morphology"]
        for decision in decisions
        if decision["cpuNeedsHelp"] is None
    ]
    blockers = []
    if missing_source:
        blockers.append("FORGE_MJX_BENCH_CMD is not configured and no benchmark payload was supplied")
    if missing:
        blockers.append(f"missing benchmark morphologies: {', '.join(missing)}")
    if any(decision["parityPassed"] is not True for decision in decisions):
        blockers.append("one or more MJX runs exceeded frozen parity bands")
    if throughput_missing:
        blockers.append(
            "cost-normalized throughput evidence missing for benchmark morphologies: "
            + ", ".join(throughput_missing)
        )
    if budget_measurements_missing:
        blockers.append(
            "CPU overnight/tier-2 budget measurements missing for benchmark morphologies: "
            + ", ".join(budget_measurements_missing)
        )
    if throughput_failures:
        blockers.append(f"MJX throughput below 3x for benchmark morphologies: {', '.join(throughput_failures)}")
    strict = _strict_evidence(source)
    if strict:
        unbound = [
            row["morphology"]
            for row in rows
            if not _source_bound(row, source)
        ]
        if unbound:
            blockers.append(
                "source-bound clean-checkout evidence missing for benchmark morphologies: "
                + ", ".join(unbound)
            )
        missing_accelerator = [
            row["morphology"] for row in rows if row["acceleratorBackend"] not in {"gpu", "tpu"}
        ]
        if missing_accelerator:
            blockers.append(
                "declared accelerator evidence missing for benchmark morphologies: "
                + ", ".join(missing_accelerator)
            )
        missing_budget = [row["morphology"] for row in rows if not row["budgetEvidence"]]
        if missing_budget:
            blockers.append(
                "CPU overnight/tier-2 budget evidence missing for benchmark morphologies: "
                + ", ".join(missing_budget)
            )
        missing_cost = [row["morphology"] for row in rows if not row["costEvidence"]]
        if missing_cost:
            blockers.append(
                "declared cost evidence missing for benchmark morphologies: "
                + ", ".join(missing_cost)
            )
    adoption_triggered = any(decision["cpuNeedsHelp"] is True for decision in decisions)
    decision_eligible = bool(decisions) and not blockers
    report = {
        "artifactKind": "mjx-benchmark",
        "schemaVersion": "1.0.0",
        "provider": _provider(source),
        "requiredMorphologies": list(REQUIRED_MJX_MORPHOLOGIES),
        "morphologies": rows,
        "decisions": decisions,
        "adoptionTriggered": adoption_triggered,
        "decisionEligible": decision_eligible,
        "adopt": decision_eligible and adoption_triggered,
        "blockers": blockers,
    }
    if isinstance(source, dict):
        for key in (
            "maturity",
            "sourceRevision",
            "requestSha256",
            "worktreeClean",
            "model",
            "runtime",
            "hardware",
            "protocol",
            "cpu",
            "mjx",
            "parity",
            "nonClaims",
        ):
            if key in source:
                report[key] = source[key]
    return report


def _benchmark_rows(source: Any) -> list[dict[str, Any]]:
    if not isinstance(source, dict):
        return []
    raw_rows = source.get("morphologies", source.get("benchmarks", source.get("rows", [])))
    if not isinstance(raw_rows, list):
        return []
    rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        if not isinstance(raw, dict):
            continue
        morphology = raw.get("morphology", raw.get("id", raw.get("name")))
        if not isinstance(morphology, str) or not morphology:
            continue
        cpu_steps = _number(raw.get("cpuMujocoStepsPerS", raw.get("cpuStepsPerS")), 0.0)
        mjx_steps = _number(raw.get("mjxStepsPerS"), 0.0)
        cpu_cost = max(0.000001, _number(raw.get("cpuCostPerHour", raw.get("cpuCostRate")), 1.0))
        mjx_cost = max(0.000001, _number(raw.get("mjxCostPerHour", raw.get("mjxCostRate")), 1.0))
        speedup = mjx_steps / cpu_steps if cpu_steps > 0 else 0.0
        declared_cost_normalized = _optional_number(raw.get("costNormalizedThroughput"))
        cost_normalized = (
            declared_cost_normalized
            if declared_cost_normalized is not None
            else speedup * (cpu_cost / mjx_cost)
            if raw.get("costEvidence") is not False
            else None
        )
        rows.append(
            {
                "morphology": morphology,
                "cpuMujocoStepsPerS": cpu_steps,
                "mjxStepsPerS": mjx_steps,
                "speedup": round(speedup, 4),
                "costNormalizedThroughput": round(cost_normalized, 4)
                if cost_normalized is not None
                else None,
                "cpuOvernightTargetHit": _optional_bool(raw.get("cpuOvernightTargetHit")),
                "tier2BudgetMissPct": _optional_number(raw.get("tier2BudgetMissPct")),
                "parityPassed": _optional_bool(raw.get("parityPassed")),
                "parityMaxErrorPct": _number(raw.get("parityMaxErrorPct"), 0.0),
                "sourceBound": _bool(raw.get("sourceBound"), False),
                "sourceRevision": raw.get("sourceRevision"),
                "worktreeClean": _bool(raw.get("worktreeClean"), False),
                "contractSha256": raw.get("contractSha256"),
                "mjcfSha256": raw.get("mjcfSha256"),
                "requestSha256": raw.get("requestSha256"),
                "acceleratorBackend": raw.get("acceleratorBackend"),
                "costEvidence": _bool(raw.get("costEvidence"), not _strict_evidence(source)),
                "budgetEvidence": _bool(raw.get("budgetEvidence"), not _strict_evidence(source)),
            }
        )
    return rows


def _mjx_decision(row: dict[str, Any]) -> dict[str, Any]:
    has_budget = (
        isinstance(row["cpuOvernightTargetHit"], bool)
        and isinstance(row["tier2BudgetMissPct"], (int, float))
    )
    cpu_needs_help = (
        not row["cpuOvernightTargetHit"] or row["tier2BudgetMissPct"] > 25.0
    ) if has_budget else None
    throughput_ok = (
        row["costNormalizedThroughput"] >= 3.0
        if isinstance(row["costNormalizedThroughput"], (int, float))
        else None
    )
    parity_ok = row["parityPassed"]
    reasons = []
    if cpu_needs_help is None:
        reasons.append("CPU overnight and tier-2 budgets are not measured")
    elif not cpu_needs_help:
        reasons.append("CPU MuJoCo/SB3 met overnight and tier-2 budgets")
    if throughput_ok is None:
        reasons.append("MJX cost-normalized throughput is not measured")
    elif not throughput_ok:
        reasons.append("MJX cost-normalized throughput is below 3x")
    if parity_ok is not True:
        reasons.append("MJX parity is outside frozen tolerance bands")
    return {
        "morphology": row["morphology"],
        "cpuNeedsHelp": cpu_needs_help,
        "throughputOk": throughput_ok,
        "parityPassed": parity_ok,
        "adopt": cpu_needs_help is True and throughput_ok is True and parity_ok is True,
        "reasons": reasons,
    }


def _provider(source: Any) -> str:
    if isinstance(source, dict) and isinstance(source.get("provider"), str):
        return source["provider"]
    return "payload"


def _strict_evidence(source: Any) -> bool:
    return isinstance(source, dict) and source.get("maturity") in {
        "controlled-feasibility",
        "sandbox",
        "live",
        "field-proven",
    }


def _source_bound(row: dict[str, Any], source: Any) -> bool:
    if not isinstance(source, dict):
        return False
    source_revision = source.get("sourceRevision")
    request_sha = source.get("requestSha256")
    return (
        row["sourceBound"]
        and row["worktreeClean"]
        and source.get("worktreeClean") is True
        and _is_hex(source_revision, 40, 64)
        and row["sourceRevision"] == source_revision
        and _is_hex(request_sha, 64)
        and row["requestSha256"] == request_sha
        and _is_hex(row["contractSha256"], 64)
        and _is_hex(row["mjcfSha256"], 64)
    )


def _is_hex(value: Any, *lengths: int) -> bool:
    return (
        isinstance(value, str)
        and len(value) in lengths
        and all(character in "0123456789abcdef" for character in value)
    )


def _number(value: Any, default: float) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value)
        except ValueError:
            return default
    else:
        return default
    return number if math.isfinite(number) else default


def _optional_number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value)
        except ValueError:
            return None
    else:
        return None
    return number if math.isfinite(number) else None


def _bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return default


def _optional_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    return None
