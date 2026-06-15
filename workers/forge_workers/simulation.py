"""Live simulation runner seams for P6/P7/P9.

These helpers are intentionally not registered as public job kinds. Existing jobs
(`train.policy` and `codesign.evaluate`) call into live simulation as part of their
own adapters when a deployment configures the commands.
"""

from __future__ import annotations

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
    rows = _benchmark_rows(source)
    decisions = [_mjx_decision(row) for row in rows]
    missing = [name for name in REQUIRED_MJX_MORPHOLOGIES if name not in {row["morphology"] for row in rows}]
    throughput_failures = [
        decision["morphology"]
        for decision in decisions
        if not decision["throughputOk"]
    ]
    blockers = []
    if external is None and source is None:
        blockers.append("FORGE_MJX_BENCH_CMD is not configured and no benchmark payload was supplied")
    if missing:
        blockers.append(f"missing benchmark morphologies: {', '.join(missing)}")
    if any(not decision["parityPassed"] for decision in decisions):
        blockers.append("one or more MJX runs exceeded frozen parity bands")
    if throughput_failures:
        blockers.append(f"MJX throughput below 3x for benchmark morphologies: {', '.join(throughput_failures)}")
    adoption_triggered = any(decision["cpuNeedsHelp"] for decision in decisions)
    adopt = bool(decisions) and not blockers and adoption_triggered
    return {
        "artifactKind": "mjx-benchmark",
        "provider": _provider(source, external),
        "requiredMorphologies": list(REQUIRED_MJX_MORPHOLOGIES),
        "morphologies": rows,
        "decisions": decisions,
        "adoptionTriggered": adoption_triggered,
        "adopt": adopt,
        "blockers": blockers,
    }


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
        cost_normalized = speedup * (cpu_cost / mjx_cost)
        rows.append(
            {
                "morphology": morphology,
                "cpuMujocoStepsPerS": cpu_steps,
                "mjxStepsPerS": mjx_steps,
                "speedup": round(speedup, 4),
                "costNormalizedThroughput": round(_number(raw.get("costNormalizedThroughput"), cost_normalized), 4),
                "cpuOvernightTargetHit": _bool(raw.get("cpuOvernightTargetHit"), True),
                "tier2BudgetMissPct": _number(raw.get("tier2BudgetMissPct"), 0.0),
                "parityPassed": _bool(raw.get("parityPassed"), False),
                "parityMaxErrorPct": _number(raw.get("parityMaxErrorPct"), 0.0),
            }
        )
    return rows


def _mjx_decision(row: dict[str, Any]) -> dict[str, Any]:
    cpu_needs_help = not row["cpuOvernightTargetHit"] or row["tier2BudgetMissPct"] > 25.0
    throughput_ok = row["costNormalizedThroughput"] >= 3.0
    parity_ok = row["parityPassed"]
    reasons = []
    if not cpu_needs_help:
        reasons.append("CPU MuJoCo/SB3 met overnight and tier-2 budgets")
    if not throughput_ok:
        reasons.append("MJX cost-normalized throughput is below 3x")
    if not parity_ok:
        reasons.append("MJX parity is outside frozen tolerance bands")
    return {
        "morphology": row["morphology"],
        "cpuNeedsHelp": cpu_needs_help,
        "throughputOk": throughput_ok,
        "parityPassed": parity_ok,
        "adopt": cpu_needs_help and throughput_ok and parity_ok,
        "reasons": reasons,
    }


def _provider(source: Any, external: dict[str, Any] | None) -> str:
    if isinstance(source, dict) and isinstance(source.get("provider"), str):
        return source["provider"]
    return "external-mjx" if external is not None else "payload"


def _number(value: Any, default: float) -> float:
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


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
