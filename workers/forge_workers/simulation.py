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
