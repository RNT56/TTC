"""Source-bound P7-010 MuJoCo/MJX feasibility benchmark.

The command intentionally proves less than the P7-010 adoption decision. It runs
one admitted multirotor training bundle through native MuJoCo and MJX-JAX, records
steady-state throughput separately from JIT compilation, and measures an exact
same-state/same-control parity trajectory. The centralized report remains blocked
until the D12 quad, D12 rover, and legged rows come from declared accelerator,
budget, and cost evidence.
"""

from __future__ import annotations

import contextlib
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import statistics
import subprocess
import sys
import time
from typing import Any, TextIO

from forge_workers.simulation import evaluate_mjx_benchmark_source
from forge_workers.training.bundle import compile_training_bundle

REQUEST_VERSION = "1.0.0"
RESULT_VERSION = "1.0.0"
MAX_REQUEST_BYTES = 2 * 1024 * 1024
PINNED_VERSIONS = {
    "numpy": "2.5.1",
    "mujoco": "3.9.0",
    "mujocoMjx": "3.9.0",
    "jax": "0.10.2",
    "jaxlib": "0.10.2",
}
CONTROLLED_PROTOCOL = {
    "seed": 710,
    "initialQvelScaleMicroradS": 1_000,
    "controlScaleNanonewtonM": 100,
    "batchSize": 16,
    "rolloutSteps": 64,
    "paritySteps": 64,
    "cpuThreads": 4,
    "repeats": 3,
    "unrollSteps": 1,
    "solver": "newton",
    "iterations": 1,
    "lsIterations": 4,
    "jaxEnableX64": True,
}
PARITY_QPOS_ABS = 1.0e-4
PARITY_QVEL_ABS = 5.0e-4


def run_feasibility_benchmark(payload: dict[str, Any]) -> dict[str, Any]:
    request = _validate_request(payload)
    _verify_checkout(request)
    bundle = compile_training_bundle(payload)

    # Heavy packages remain optional and import only at the command boundary.
    import jax  # type: ignore[import-not-found]
    import jax.numpy as jnp  # type: ignore[import-not-found]
    import jaxlib  # type: ignore[import-not-found]
    import mujoco  # type: ignore[import-not-found]
    import numpy as np  # type: ignore[import-not-found]
    # MuJoCo probes optional Warp support on MJX import and currently writes the
    # missing-extra notice to stdout. Preserve the JSON-only command boundary by
    # routing all optional-backend import chatter to stderr.
    with contextlib.redirect_stdout(sys.stderr):
        from mujoco import mjx, rollout  # type: ignore[import-not-found]

    versions = {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "mujoco": mujoco.__version__,
        "mujocoMjx": importlib.metadata.version("mujoco-mjx"),
        "jax": jax.__version__,
        "jaxlib": jaxlib.__version__,
    }
    for name, expected in PINNED_VERSIONS.items():
        if versions[name] != expected:
            raise RuntimeError(
                f"{name} runtime {versions[name]} does not match reviewed pin {expected}"
            )
    if not bool(jax.config.read("jax_enable_x64")):
        raise RuntimeError("JAX_ENABLE_X64=1 is required for MuJoCo/MJX parity")

    model = mujoco.MjModel.from_xml_string(bundle["mjcf"])
    if not math.isclose(
        float(model.opt.timestep), float(bundle["timestepS"]), rel_tol=0.0, abs_tol=1e-12
    ):
        raise RuntimeError("compiled MuJoCo timestep does not match the Rust bundle")
    if model.nu <= 0:
        raise RuntimeError("benchmark model has no actuators")

    protocol = request["protocol"]
    _configure_solver(model, protocol, mujoco)
    initial_states, qvels, controls = _initial_conditions(model, protocol, mujoco, np)
    cpu = _cpu_rollout_benchmark(
        model,
        initial_states,
        controls,
        protocol,
        mujoco,
        np,
        rollout,
    )
    accelerator, compiled_rollout, batched_data = _mjx_rollout_benchmark(
        model,
        qvels,
        controls,
        protocol,
        jax,
        jnp,
        mjx,
        np,
    )
    parity = _parity_check(
        model,
        initial_states[0],
        controls[0, : protocol["paritySteps"]],
        compiled_rollout,
        batched_data,
        protocol,
        jax,
        jnp,
        mujoco,
        np,
    )

    devices = [
        {
            "platform": str(device.platform),
            "kind": str(getattr(device, "device_kind", device)),
            "id": int(device.id),
        }
        for device in jax.devices()
    ]
    accelerator_backend = next(
        (device["platform"] for device in devices if device["platform"] != "cpu"),
        None,
    )
    speedup = accelerator["stepsPerS"] / cpu["stepsPerS"]
    row = {
        "morphology": request["morphology"],
        "cpuMujocoStepsPerS": cpu["stepsPerS"],
        "mjxStepsPerS": accelerator["stepsPerS"],
        "speedup": round(speedup, 4),
        "costNormalizedThroughput": None,
        "cpuOvernightTargetHit": None,
        "tier2BudgetMissPct": None,
        "parityPassed": parity["passed"],
        "parityMaxErrorPct": parity["maxRelativeErrorPct"],
        "sourceBound": True,
        "sourceRevision": request["sourceRevision"],
        "worktreeClean": request["worktreeClean"],
        "contractSha256": request["contractHash"],
        "mjcfSha256": hashlib.sha256(bundle["mjcf"].encode("utf-8")).hexdigest(),
        "requestSha256": request["requestSha256"],
        "acceleratorBackend": accelerator_backend,
        "costEvidence": False,
        "budgetEvidence": False,
    }
    source = {
        "artifactKind": "mjxFeasibilityMeasurements",
        "schemaVersion": RESULT_VERSION,
        "provider": "forge-mujoco-mjx-jax",
        "maturity": "controlled-feasibility",
        "sourceRevision": request["sourceRevision"],
        "requestSha256": request["requestSha256"],
        "worktreeClean": request["worktreeClean"],
        "model": {
            "id": request["modelSnapshot"]["modelId"],
            "morphology": request["morphology"],
            "contractSha256": request["contractHash"],
            "mjcfSha256": row["mjcfSha256"],
            "archetype": bundle["archetype"],
            "timestepS": bundle["timestepS"],
            "substeps": bundle["substeps"],
        },
        "runtime": versions,
        "hardware": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "processor": platform.processor() or "unknown",
            "logicalCpuCount": os.cpu_count(),
            "jaxDefaultBackend": jax.default_backend(),
            "jaxDevices": devices,
        },
        "protocol": protocol,
        "cpu": cpu,
        "mjx": accelerator,
        "parity": parity,
        "morphologies": [row],
        "nonClaims": [
            "This controlled CPU-backed feasibility run is not D12 quad, D12 rover, or legged benchmark evidence.",
            "It does not measure PPO/SAC wall time, an overnight target, accelerator economics, or deployed GPU operations.",
            "MJX adoption remains forbidden until every centralized decision blocker is cleared by exact protected evidence.",
        ],
    }
    report = evaluate_mjx_benchmark_source(source)
    if report["adopt"] or report["decisionEligible"]:
        raise RuntimeError("controlled feasibility evidence must not authorize MJX adoption")
    return report


def _validate_request(payload: dict[str, Any]) -> dict[str, Any]:
    expected = {
        "artifactKind",
        "schemaVersion",
        "task",
        "sourceRevision",
        "requestSha256",
        "worktreeClean",
        "maturity",
        "morphology",
        "contractHash",
        "modelSnapshot",
        "protocol",
        "runtimePins",
    }
    if set(payload) != expected:
        raise ValueError("request fields must exactly match mjxBenchmarkRequest 1.0.0")
    if payload.get("artifactKind") != "mjxBenchmarkRequest":
        raise ValueError("artifactKind must be 'mjxBenchmarkRequest'")
    if payload.get("schemaVersion") != REQUEST_VERSION:
        raise ValueError(f"schemaVersion must be {REQUEST_VERSION}")
    if payload.get("task") != "sim.mjx-benchmark":
        raise ValueError("task must be 'sim.mjx-benchmark'")
    if payload.get("maturity") != "controlled-feasibility":
        raise ValueError("maturity must be 'controlled-feasibility'")
    if payload.get("morphology") != "p7-hover-multirotor":
        raise ValueError("the controlled runner supports p7-hover-multirotor only")
    if not isinstance(payload.get("worktreeClean"), bool):
        raise ValueError("worktreeClean must be a boolean")
    _hex(payload.get("sourceRevision"), (40, 64), "sourceRevision")
    _hex(payload.get("requestSha256"), (64,), "requestSha256")
    _hex(payload.get("contractHash"), (64,), "contractHash")
    if payload.get("runtimePins") != PINNED_VERSIONS:
        raise ValueError("runtimePins do not match the reviewed P7-010 stack")

    protocol = payload.get("protocol")
    if protocol != CONTROLLED_PROTOCOL:
        raise ValueError("protocol does not match frozen controlled-feasibility 1.0.0")

    request_body = {
        key: value
        for key, value in payload.items()
        if key not in {"sourceRevision", "requestSha256"}
    }
    actual_hash = hashlib.sha256(
        json.dumps(
            request_body,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()
    if actual_hash != payload["requestSha256"]:
        raise ValueError("requestSha256 does not match the canonical request payload")
    return payload


def _initial_conditions(model: Any, protocol: dict[str, Any], mujoco: Any, np: Any):
    rng = np.random.default_rng(protocol["seed"])
    state_spec = mujoco.mjtState.mjSTATE_FULLPHYSICS
    state_size = mujoco.mj_stateSize(model, state_spec)
    initial_states = np.empty((protocol["batchSize"], state_size), dtype=np.float64)
    qvels = np.empty((protocol["batchSize"], model.nv), dtype=np.float64)
    for index in range(protocol["batchSize"]):
        data = mujoco.MjData(model)
        qvel_scale = protocol["initialQvelScaleMicroradS"] * 1.0e-6
        data.qvel[:] = qvel_scale * rng.standard_normal(model.nv)
        mujoco.mj_forward(model, data)
        mujoco.mj_getState(model, data, initial_states[index], state_spec)
        qvels[index] = data.qvel
    control_scale = protocol["controlScaleNanonewtonM"] * 1.0e-9
    controls = control_scale * rng.uniform(
        low=-1.0,
        high=1.0,
        size=(protocol["batchSize"], protocol["rolloutSteps"], model.nu),
    )
    if bool(model.actuator_ctrllimited.any()):
        lower = model.actuator_ctrlrange[:, 0]
        upper = model.actuator_ctrlrange[:, 1]
        controls = np.clip(controls, lower, upper)
    return initial_states, qvels, controls


def _verify_checkout(request: dict[str, Any]) -> None:
    """Bind direct command use to the same checkout identity as the wrapper."""

    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    revision = completed.stdout.strip()
    if completed.returncode != 0 or revision != request["sourceRevision"]:
        raise RuntimeError("sourceRevision does not match the benchmark checkout")
    completed = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("benchmark checkout cleanliness could not be verified")
    clean = not completed.stdout.strip()
    if clean != request["worktreeClean"]:
        raise RuntimeError("worktreeClean does not match the benchmark checkout")


def _configure_solver(model: Any, protocol: dict[str, Any], mujoco: Any) -> None:
    """Apply one frozen solver configuration before either engine runs."""

    model.opt.solver = {
        "cg": mujoco.mjtSolver.mjSOL_CG,
        "newton": mujoco.mjtSolver.mjSOL_NEWTON,
    }[protocol["solver"]]
    model.opt.iterations = protocol["iterations"]
    model.opt.ls_iterations = protocol["lsIterations"]


def _cpu_rollout_benchmark(
    model: Any,
    initial_states: Any,
    controls: Any,
    protocol: dict[str, Any],
    mujoco: Any,
    np: Any,
    rollout: Any,
) -> dict[str, Any]:
    thread_count = min(protocol["cpuThreads"], protocol["batchSize"], os.cpu_count() or 1)
    data = [mujoco.MjData(model) for _ in range(thread_count)]
    samples: list[float] = []
    with rollout.Rollout(nthread=thread_count) as runner:
        runner.rollout(
            model,
            data,
            initial_states,
            controls,
            control_spec=mujoco.mjtState.mjSTATE_CTRL,
        )
        for _ in range(protocol["repeats"]):
            started = time.perf_counter()
            states, _ = runner.rollout(
                model,
                data,
                initial_states,
                controls,
                control_spec=mujoco.mjtState.mjSTATE_CTRL,
            )
            elapsed = time.perf_counter() - started
            if not np.isfinite(states).all():
                raise RuntimeError("native MuJoCo rollout produced non-finite state")
            samples.append(elapsed)
    median = statistics.median(samples)
    steps = protocol["batchSize"] * protocol["rolloutSteps"]
    return {
        "engine": "mujoco-c-rollout",
        "threadCount": thread_count,
        "warmupRuns": 1,
        "timedRuns": protocol["repeats"],
        "sampleSeconds": samples,
        "medianSeconds": median,
        "stepsPerRun": steps,
        "stepsPerS": steps / median,
    }


def _mjx_rollout_benchmark(
    model: Any,
    qvels: Any,
    controls: Any,
    protocol: dict[str, Any],
    jax: Any,
    jnp: Any,
    mjx: Any,
    np: Any,
):
    mjx_model = mjx.put_model(model)

    def make_data(qvel):  # noqa: ANN001
        # qvel replacement invalidates derived dynamics fields. Both engines
        # must start from an explicitly forwarded state before the timed scan.
        return mjx.forward(mjx_model, mjx.make_data(mjx_model).replace(qvel=qvel))

    batched_data = jax.vmap(make_data)(jnp.asarray(qvels))
    device_controls = jnp.asarray(np.swapaxes(controls, 0, 1))
    jax.block_until_ready((batched_data, device_controls))

    def rollout_fn(data, timed_controls):  # noqa: ANN001
        def scan_step(current, control):  # noqa: ANN001
            def one_step(item, action):  # noqa: ANN001
                return mjx.step(mjx_model, item.replace(ctrl=action))

            return jax.vmap(one_step)(current, control), None

        result, _ = jax.lax.scan(
            scan_step,
            data,
            timed_controls,
            unroll=protocol["unrollSteps"],
        )
        return result

    compile_started = time.perf_counter()
    lowered = jax.jit(rollout_fn).lower(batched_data, device_controls)
    compiled = lowered.compile()
    compile_seconds = time.perf_counter() - compile_started
    samples: list[float] = []
    jax.block_until_ready(compiled(batched_data, device_controls))
    for _ in range(protocol["repeats"]):
        started = time.perf_counter()
        result = compiled(batched_data, device_controls)
        jax.block_until_ready(result)
        elapsed = time.perf_counter() - started
        if not np.isfinite(np.asarray(result.qpos)).all():
            raise RuntimeError("MJX rollout produced non-finite state")
        samples.append(elapsed)
    median = statistics.median(samples)
    steps = protocol["batchSize"] * protocol["rolloutSteps"]
    return (
        {
            "engine": "mujoco-mjx-jax",
            "jitCompileSeconds": compile_seconds,
            "warmupRuns": 1,
            "timedRuns": protocol["repeats"],
            "sampleSeconds": samples,
            "medianSeconds": median,
            "stepsPerRun": steps,
            "stepsPerS": steps / median,
        },
        compiled,
        batched_data,
    )


def _parity_check(
    model: Any,
    initial_state: Any,
    controls: Any,
    compiled_rollout: Any,
    batched_data: Any,
    protocol: dict[str, Any],
    jax: Any,
    jnp: Any,
    mujoco: Any,
    np: Any,
) -> dict[str, Any]:
    cpu_data = mujoco.MjData(model)
    mujoco.mj_setState(
        model,
        cpu_data,
        initial_state,
        mujoco.mjtState.mjSTATE_FULLPHYSICS,
    )
    mujoco.mj_forward(model, cpu_data)
    for action in controls:
        cpu_data.ctrl[:] = action
        mujoco.mj_step(model, cpu_data)

    # Reuse the already-compiled fixed-shape benchmark and hold later actions at
    # zero; compare at paritySteps by compiling a smaller exact scan only when the
    # parity window differs from the throughput window.
    if protocol["paritySteps"] == protocol["rolloutSteps"]:
        timed_controls = jnp.asarray(np.swapaxes(controls[None, ...], 0, 1))
        # compiled_rollout expects the benchmark batch shape, so select the first
        # output from the full deterministic run below instead.
        del timed_controls
        full_controls = np.zeros(
            (protocol["batchSize"], protocol["rolloutSteps"], model.nu), dtype=np.float64
        )
        full_controls[0, : protocol["paritySteps"]] = controls
        result = compiled_rollout(
            batched_data,
            jnp.asarray(np.swapaxes(full_controls, 0, 1)),
        )
        jax.block_until_ready(result)
        qpos = np.asarray(result.qpos[0])
        qvel = np.asarray(result.qvel[0])
    else:
        raise RuntimeError("controlled paritySteps must equal rolloutSteps")

    qpos_error = float(np.max(np.abs(qpos - cpu_data.qpos)))
    qvel_error = float(np.max(np.abs(qvel - cpu_data.qvel)))
    state_scale = max(
        1.0,
        float(np.max(np.abs(cpu_data.qpos))),
        float(np.max(np.abs(cpu_data.qvel))),
    )
    max_relative_error_pct = 100.0 * max(qpos_error, qvel_error) / state_scale
    return {
        "steps": protocol["paritySteps"],
        "precision": "float64",
        "qposMaxAbsError": qpos_error,
        "qvelMaxAbsError": qvel_error,
        "maxRelativeErrorPct": max_relative_error_pct,
        "bands": {
            "qposMaxAbs": PARITY_QPOS_ABS,
            "qvelMaxAbs": PARITY_QVEL_ABS,
        },
        "passed": qpos_error <= PARITY_QPOS_ABS and qvel_error <= PARITY_QVEL_ABS,
    }


def _hex(value: Any, lengths: tuple[int, ...], label: str) -> None:
    if (
        not isinstance(value, str)
        or len(value) not in lengths
        or any(char not in "0123456789abcdef" for char in value)
    ):
        joined = " or ".join(str(length) for length in lengths)
        raise ValueError(f"{label} must be {joined} lowercase hexadecimal characters")


def main(
    stdin: TextIO = sys.stdin,
    stdout: TextIO = sys.stdout,
    stderr: TextIO = sys.stderr,
) -> int:
    try:
        raw = stdin.read(MAX_REQUEST_BYTES + 1)
        if not raw or len(raw.encode("utf-8")) > MAX_REQUEST_BYTES:
            raise ValueError("MJX request is empty or exceeds 2 MiB")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise ValueError("MJX request must be one JSON object")
        result = run_feasibility_benchmark(payload)
        json.dump(result, stdout, sort_keys=True, separators=(",", ":"), allow_nan=False)
        stdout.write("\n")
        return 0
    except Exception as error:  # noqa: BLE001 - fail-closed command boundary.
        print(f"forge-mjx-benchmark: {error}", file=stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
