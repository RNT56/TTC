"""Deterministic D60 CMA-ES/TPE proposal-plan evidence.

This module executes the real pinned proposal algorithms but deliberately does not
evaluate a design.  The resulting 200-proposal plan has no validator, Rapier,
MuJoCo, training, Pareto, overnight-result, provider, build, hardware, or field
authority.  A later worker lane must consume the exact proposal hashes and attach
sovereign engine evidence before any candidate can be admitted.
"""

from __future__ import annotations

import copy
import hashlib
import importlib.metadata
import json
import math
import os
import platform
import sys
from pathlib import Path
from typing import Any, TextIO

import cmaes
import numpy as np
import optuna

from forge_workers.net_security import assert_bounded_json

SEARCH_PLAN_SCHEMA = "forge-codesign-search-plan"
SEARCH_PLAN_VERSION = "2.0.0"
SEARCH_PLAN_EVIDENCE_VERSION = "2.0.0"
SEARCH_PLAN_RUNTIME = "forge-codesign-search-plan/2.0.0"
SEARCH_PLAN_MATURITY = "platform-bound-algorithm-proposal-plan"
PROPOSAL_RUNTIME_AUTHORITY_SCHEMA = "forge-codesign-proposal-runtime-authority"
PROPOSAL_RUNTIME_AUTHORITY_VERSION = "1.0.0"
SNAPSHOT_SCHEMA = "forge-admitted-model-snapshot/1.0.0"
OPTUNA_VERSION = "4.9.0"
CMAES_VERSION = "0.13.0"
NUMPY_VERSION = "2.5.1"
TOTAL_PROPOSALS = 200
CMA_PROPOSALS = 100
TPE_PROPOSALS = 100
CMA_POPULATION = 10
CMA_GENERATIONS = CMA_PROPOSALS // CMA_POPULATION
TPE_STARTUP_TRIALS = 20
MAX_INPUT_BYTES = 4 * 1024 * 1024

BOUNDS = {
    "motorKvScale": (0.94, 1.06),
    "propDiameterScale": (0.94, 1.06),
    "batteryCapacityScale": (0.90, 1.10),
}
PROFILE_TARGETS = {
    "balanced": (1.00, 1.00, 1.00),
    "endurance-prior": (0.97, 1.02, 1.08),
    "agility-prior": (1.05, 0.97, 0.94),
    "lightweight-prior": (0.98, 0.98, 0.92),
}
NONCLAIMS = {
    "validatorEvaluated": False,
    "rapierEvaluated": False,
    "mujocoEvaluated": False,
    "candidateAdmitted": False,
    "paretoComputed": False,
    "physicalConstraintsEvaluated": False,
    "overnight200Candidate": False,
    "trainedFinalist": False,
    "catalogChoiceSearch": False,
    "providerSandbox": False,
    "buildReady": False,
    "hardwareAuthority": False,
    "fieldEvidence": False,
}


def _stable_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def _sha(value: str | bytes) -> str:
    encoded = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(encoded).hexdigest()


def _exact(value: dict[str, Any], fields: set[str], label: str) -> None:
    if set(value) != fields:
        raise ValueError(f"{label} fields are not exact")


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label} must be finite")
    return float(value)


def _sha256_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or len(value) != 64 or any(
        character not in "0123456789abcdef" for character in value
    ):
        raise ValueError(f"{label} must be a lower-case SHA-256 digest")
    return value


def _nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a non-empty string")
    return value


def _canonical_number(value: float) -> int | float:
    """Match JSON's language-neutral integer spelling for whole finite values."""
    return int(value) if value.is_integer() else value


def _distribution_record_sha256(name: str) -> str:
    try:
        distribution = importlib.metadata.distribution(name)
    except importlib.metadata.PackageNotFoundError as error:
        raise RuntimeError(f"co-design search dependency {name} is absent") from error
    records = [
        entry
        for entry in distribution.files or []
        if str(entry).endswith(".dist-info/RECORD")
    ]
    if len(records) != 1:
        raise RuntimeError(f"co-design search dependency {name} lacks one exact RECORD")
    record = distribution.locate_file(records[0])
    if not record.is_file():
        raise RuntimeError(f"co-design search dependency {name} RECORD is absent")
    return _sha(record.read_bytes())


def _numpy_runtime() -> dict[str, Any]:
    try:
        from numpy._core import _multiarray_umath

        raw_features = _multiarray_umath.__cpu_features__
    except (AttributeError, ImportError) as error:
        raise RuntimeError("co-design search cannot resolve NumPy CPU authority") from error
    if not isinstance(raw_features, dict) or not raw_features:
        raise RuntimeError("co-design search NumPy CPU authority is empty")
    cpu_features = {
        str(name): bool(enabled)
        for name, enabled in sorted(raw_features.items())
    }
    try:
        configuration = np.show_config(mode="dicts")
    except TypeError as error:
        raise RuntimeError("co-design search NumPy configuration authority is unavailable") from error
    if not isinstance(configuration, dict):
        raise RuntimeError("co-design search NumPy configuration authority is invalid")
    dependencies = configuration.get("Build Dependencies")
    if not isinstance(dependencies, dict):
        raise RuntimeError("co-design search NumPy build dependencies are unavailable")
    blas = dependencies.get("blas")
    lapack = dependencies.get("lapack")
    if not isinstance(blas, dict) or not isinstance(lapack, dict):
        raise RuntimeError("co-design search NumPy BLAS/LAPACK authority is unavailable")
    return {
        "version": np.__version__,
        "distributionRecordSha256": _distribution_record_sha256("numpy"),
        "configurationSha256": _sha(_stable_json(configuration)),
        "cpuFeatures": cpu_features,
        "blas": copy.deepcopy(blas),
        "lapack": copy.deepcopy(lapack),
    }


def _proposal_runtime_authority() -> dict[str, Any]:
    libc_name, libc_version = platform.libc_ver()
    value = {
        "schemaVersion": (
            f"{PROPOSAL_RUNTIME_AUTHORITY_SCHEMA}/{PROPOSAL_RUNTIME_AUTHORITY_VERSION}"
        ),
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "version": platform.version(),
            "machine": platform.machine(),
            "byteOrder": sys.byteorder,
            "libc": {"name": libc_name, "version": libc_version},
        },
        "python": {
            "implementation": platform.python_implementation(),
            "version": platform.python_version(),
            "cacheTag": sys.implementation.cache_tag,
        },
        "numpy": _numpy_runtime(),
        "algorithms": {
            "cmaes": {
                "version": cmaes.__version__,
                "distributionRecordSha256": _distribution_record_sha256("cmaes"),
            },
            "optuna": {
                "version": optuna.__version__,
                "distributionRecordSha256": _distribution_record_sha256("optuna"),
            },
        },
        "authoritySha256": "",
    }
    value["authoritySha256"] = _sha(
        _stable_json({name: item for name, item in value.items() if name != "authoritySha256"})
    )
    return value


def _validate_proposal_runtime_authority(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("co-design proposal runtime authority must be an object")
    _exact(
        value,
        {"schemaVersion", "platform", "python", "numpy", "algorithms", "authoritySha256"},
        "co-design proposal runtime authority",
    )
    if value.get("schemaVersion") != (
        f"{PROPOSAL_RUNTIME_AUTHORITY_SCHEMA}/{PROPOSAL_RUNTIME_AUTHORITY_VERSION}"
    ):
        raise ValueError("co-design proposal runtime authority version is unsupported")
    platform_value = value.get("platform")
    python_value = value.get("python")
    numpy_value = value.get("numpy")
    algorithms = value.get("algorithms")
    if not all(isinstance(item, dict) for item in (platform_value, python_value, numpy_value, algorithms)):
        raise ValueError("co-design proposal runtime authority fields are invalid")
    _exact(
        platform_value,
        {"system", "release", "version", "machine", "byteOrder", "libc"},
        "co-design proposal platform authority",
    )
    _exact(
        python_value,
        {"implementation", "version", "cacheTag"},
        "co-design proposal Python authority",
    )
    _exact(
        numpy_value,
        {
            "version",
            "distributionRecordSha256",
            "configurationSha256",
            "cpuFeatures",
            "blas",
            "lapack",
        },
        "co-design proposal NumPy authority",
    )
    _exact(algorithms, {"cmaes", "optuna"}, "co-design proposal algorithm authority")
    libc = platform_value.get("libc")
    if not isinstance(libc, dict):
        raise ValueError("co-design proposal libc authority is invalid")
    _exact(libc, {"name", "version"}, "co-design proposal libc authority")
    for name in ("system", "release", "version", "machine"):
        _nonempty_string(platform_value.get(name), f"co-design proposal platform {name}")
    if platform_value.get("byteOrder") not in {"little", "big"}:
        raise ValueError("co-design proposal platform byte order is invalid")
    for name in ("name", "version"):
        if not isinstance(libc.get(name), str):
            raise ValueError(f"co-design proposal libc {name} must be a string")
    for name in ("implementation", "version", "cacheTag"):
        _nonempty_string(python_value.get(name), f"co-design proposal Python {name}")
    if python_value.get("implementation") != "CPython":
        raise ValueError("co-design proposal Python implementation is unsupported")
    if numpy_value.get("version") != NUMPY_VERSION:
        raise ValueError("co-design proposal NumPy version drifted from the reviewed pin")
    _sha256_string(
        numpy_value.get("distributionRecordSha256"),
        "co-design proposal NumPy distribution RECORD",
    )
    _sha256_string(
        numpy_value.get("configurationSha256"),
        "co-design proposal NumPy configuration",
    )
    cpu_features = numpy_value.get("cpuFeatures")
    if not isinstance(cpu_features, dict) or not cpu_features or any(
        not isinstance(name, str) or not name or not isinstance(enabled, bool)
        for name, enabled in cpu_features.items()
    ):
        raise ValueError("co-design proposal NumPy CPU authority is invalid")
    for name in ("blas", "lapack"):
        if not isinstance(numpy_value.get(name), dict):
            raise ValueError(f"co-design proposal NumPy {name} authority is invalid")
    for name in ("cmaes", "optuna"):
        algorithm = algorithms.get(name)
        if not isinstance(algorithm, dict):
            raise ValueError(f"co-design proposal {name} authority is invalid")
        _exact(
            algorithm,
            {"version", "distributionRecordSha256"},
            f"co-design proposal {name} authority",
        )
        expected_version = CMAES_VERSION if name == "cmaes" else OPTUNA_VERSION
        if algorithm.get("version") != expected_version:
            raise ValueError(f"co-design proposal {name} version drifted from the reviewed pin")
        _sha256_string(
            algorithm.get("distributionRecordSha256"),
            f"co-design proposal {name} distribution RECORD",
        )
    expected_sha = _sha(
        _stable_json({name: item for name, item in value.items() if name != "authoritySha256"})
    )
    if _sha256_string(
        value.get("authoritySha256"), "co-design proposal runtime authority"
    ) != expected_sha:
        raise ValueError("co-design proposal runtime authority hash drifted")
    assert_bounded_json(
        value,
        label="co-design proposal runtime authority",
        max_bytes=64 * 1024,
        max_depth=12,
        max_nodes=2_000,
    )
    return value


def _runtime_authority() -> tuple[str | None, str, dict[str, Any]]:
    if optuna.__version__ != OPTUNA_VERSION or cmaes.__version__ != CMAES_VERSION:
        raise RuntimeError("co-design search dependency versions drifted from the reviewed pins")
    revision = os.environ.get("FORGE_SOURCE_REVISION", "").strip() or None
    if revision is not None and (
        len(revision) != 40 or any(character not in "0123456789abcdef" for character in revision)
    ):
        raise ValueError("FORGE_SOURCE_REVISION must be a full lower-case Git SHA")
    manifest = Path(__file__).resolve().parents[1] / "pyproject.toml"
    if not manifest.is_file():
        raise RuntimeError("worker dependency manifest is absent")
    authority = _proposal_runtime_authority()
    _validate_proposal_runtime_authority(authority)
    return revision, _sha(manifest.read_bytes()), authority


def _snapshot(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    if payload.get("task") != "codesign.search-plan":
        raise ValueError("co-design search requires task=codesign.search-plan")
    if payload.get("manifold") is not None:
        raise ValueError("co-design search derives its exact manifold; caller manifolds are forbidden")
    _exact(
        payload,
        {"task", "contractHash", "modelSnapshot", "candidateBudget", "seed", "constraints"},
        "co-design search input",
    )
    snapshot = payload.get("modelSnapshot")
    if not isinstance(snapshot, dict):
        raise ValueError("co-design search requires a gateway-owned admitted model snapshot")
    _exact(snapshot, {"schemaVersion", "modelId", "contractHash", "contractJson"}, "model snapshot")
    if snapshot.get("schemaVersion") != SNAPSHOT_SCHEMA:
        raise ValueError("co-design search snapshot version is unsupported")
    model_id = snapshot.get("modelId")
    contract_hash = snapshot.get("contractHash")
    contract_json = snapshot.get("contractJson")
    if not isinstance(model_id, str) or not 1 <= len(model_id) <= 160:
        raise ValueError("co-design search modelId is invalid")
    if not isinstance(contract_hash, str) or len(contract_hash) != 64 or any(
        character not in "0123456789abcdef" for character in contract_hash
    ):
        raise ValueError("co-design search contractHash is invalid")
    if not isinstance(contract_json, str) or len(contract_json.encode("utf-8")) > 512 * 1024:
        raise ValueError("co-design search contractJson is invalid")
    if _sha(contract_json) != contract_hash or payload.get("contractHash") != contract_hash:
        raise ValueError("co-design search snapshot hash authority drifted")
    raw_budget = payload.get("candidateBudget")
    if isinstance(raw_budget, bool) or not isinstance(raw_budget, int) or raw_budget != TOTAL_PROPOSALS:
        raise ValueError("co-design search v2 requires exactly 200 proposals")
    try:
        contract = json.loads(contract_json)
    except (json.JSONDecodeError, RecursionError) as error:
        raise ValueError("co-design search contractJson is not JSON") from error
    if not isinstance(contract, dict):
        raise ValueError("co-design search contract must be an object")
    assert_bounded_json(
        contract,
        label="co-design search contract",
        max_bytes=512 * 1024,
        max_depth=32,
        max_nodes=50_000,
    )
    return snapshot, contract


def _seed(payload: dict[str, Any], contract_hash: str) -> int:
    raw = payload.get("seed")
    if raw is None:
        return int(contract_hash[:12], 16)
    if isinstance(raw, bool) or not isinstance(raw, int) or not 0 <= raw <= 2**32 - 1:
        raise ValueError("co-design search seed must be an integer in 0..2^32-1")
    return raw


def _constraints(payload: dict[str, Any]) -> dict[str, int | float]:
    raw = payload.get("constraints", {})
    if not isinstance(raw, dict) or not set(raw).issubset(
        {"maxMassG", "minEnduranceMin", "maxTaskTimeS", "minScore"}
    ):
        raise ValueError("co-design search constraints are invalid")
    defaults = {
        "maxMassG": 900.0,
        "minEnduranceMin": 6.0,
        "maxTaskTimeS": 24.0,
        "minScore": 0.55,
    }
    finite = {
        name: _finite(raw.get(name, default), f"constraints.{name}")
        for name, default in defaults.items()
    }
    if finite["maxMassG"] <= 0 or finite["minEnduranceMin"] < 0 or finite["maxTaskTimeS"] <= 0:
        raise ValueError("co-design search constraints are outside positive bounds")
    if not 0 <= finite["minScore"] <= 1:
        raise ValueError("co-design search minScore must be in 0..1")
    return {name: _canonical_number(value) for name, value in finite.items()}


def _base_values(contract: dict[str, Any]) -> tuple[list[float], list[float], float]:
    meta = contract.get("meta")
    sim = contract.get("sim")
    if not isinstance(meta, dict) or meta.get("archetype") != "multirotor" or not isinstance(sim, dict):
        raise ValueError("co-design search v2 supports admitted inline multirotors only")
    motors = sim.get("motors")
    props = sim.get("props")
    battery = sim.get("battery")
    if not isinstance(motors, list) or not motors or not isinstance(props, list) or not props:
        raise ValueError("co-design search requires inline motors and props")
    if not isinstance(battery, dict):
        raise ValueError("co-design search requires an inline battery")
    motor_kv = [
        _finite(motor.get("kv") if isinstance(motor, dict) else None, f"motor[{index}].kv")
        for index, motor in enumerate(motors)
    ]
    prop_diameter = [
        _finite(prop.get("diameterIn") if isinstance(prop, dict) else None, f"prop[{index}].diameterIn")
        for index, prop in enumerate(props)
    ]
    capacity = _finite(battery.get("capacity_mAh"), "battery.capacity_mAh")
    if any(value <= 0 for value in (*motor_kv, *prop_diameter, capacity)):
        raise ValueError("co-design search electrical values must be positive")
    return motor_kv, prop_diameter, capacity


def _clamp(name: str, value: float) -> float:
    low, high = BOUNDS[name]
    return min(high, max(low, float(value)))


def _acquisition_loss(parameters: tuple[float, float, float], profile: str) -> float:
    target = PROFILE_TARGETS[profile]
    normalized = []
    for index, name in enumerate(BOUNDS):
        low, high = BOUNDS[name]
        normalized.append((parameters[index] - target[index]) / (high - low))
    smooth = sum((index + 1) * value * value for index, value in enumerate(normalized))
    coupling = abs(normalized[0] + normalized[1] - normalized[2]) * 0.075
    profile_bias = list(PROFILE_TARGETS).index(profile) * 0.0025
    return float(smooth + coupling + profile_bias)


def _candidate_patch(
    parameters: tuple[float, float, float],
    base: tuple[list[float], list[float], float],
) -> list[dict[str, Any]]:
    motor_scale, prop_scale, capacity_scale = parameters
    motor_kv, prop_diameter, capacity = base
    patch: list[dict[str, Any]] = []
    patch.extend(
        {
            "op": "replace",
            "path": f"/sim/motors/{index}/kv",
            "value": _canonical_number(round(value * motor_scale, 6)),
        }
        for index, value in enumerate(motor_kv)
    )
    patch.extend(
        {
            "op": "replace",
            "path": f"/sim/props/{index}/diameterIn",
            "value": _canonical_number(round(value * prop_scale, 6)),
        }
        for index, value in enumerate(prop_diameter)
    )
    patch.append(
        {
            "op": "replace",
            "path": "/sim/battery/capacity_mAh",
            "value": _canonical_number(round(capacity * capacity_scale, 6)),
        }
    )
    return patch


def _pointer_tokens(pointer: str) -> list[str]:
    if not pointer.startswith("/") or pointer == "/":
        raise ValueError("co-design search patch path must be a non-root JSON Pointer")
    return [token.replace("~1", "/").replace("~0", "~") for token in pointer[1:].split("/")]


def apply_search_patch(contract: dict[str, Any], patch: list[dict[str, Any]]) -> dict[str, Any]:
    result: Any = copy.deepcopy(contract)
    for operation in patch:
        if not isinstance(operation, dict) or set(operation) != {"op", "path", "value"}:
            raise ValueError("co-design search patch operation is not exact")
        if operation["op"] != "replace" or not isinstance(operation["path"], str):
            raise ValueError("co-design search accepts replace operations only")
        parent = result
        tokens = _pointer_tokens(operation["path"])
        for token in tokens[:-1]:
            if isinstance(parent, list):
                if not token.isdigit() or int(token) >= len(parent):
                    raise ValueError("co-design search patch index is outside the contract")
                parent = parent[int(token)]
            elif isinstance(parent, dict) and token in parent:
                parent = parent[token]
            else:
                raise ValueError("co-design search patch path is absent")
        leaf = tokens[-1]
        if isinstance(parent, list):
            if not leaf.isdigit() or int(leaf) >= len(parent):
                raise ValueError("co-design search patch leaf is outside the contract")
            parent[int(leaf)] = copy.deepcopy(operation["value"])
        elif isinstance(parent, dict) and leaf in parent:
            parent[leaf] = copy.deepcopy(operation["value"])
        else:
            raise ValueError("co-design search patch replace target is absent")
    if not isinstance(result, dict):
        raise ValueError("co-design search patch did not preserve a contract object")
    return result


def _proposal(
    contract: dict[str, Any],
    base: tuple[list[float], list[float], float],
    ordinal: int,
    algorithm: str,
    profile: str,
    parameters: tuple[float, float, float],
    acquisition_loss: float,
) -> dict[str, Any]:
    rounded = tuple(round(_clamp(name, parameters[index]), 9) for index, name in enumerate(BOUNDS))
    patch = _candidate_patch(rounded, base)
    candidate = apply_search_patch(contract, patch)
    candidate_json = _stable_json(candidate)
    patch_json = _stable_json(patch)
    return {
        "id": f"proposal-{ordinal:03d}-{_sha(candidate_json)[:12]}",
        "ordinal": ordinal,
        "algorithm": algorithm,
        "profile": profile,
        "parameters": {
            name: _canonical_number(rounded[index]) for index, name in enumerate(BOUNDS)
        },
        "acquisition": {
            "evaluator": "bounded-diversity-acquisition-v1",
            "loss": _canonical_number(round(acquisition_loss, 12)),
            "physicalObjective": False,
            "engineFeedback": False,
        },
        "patch": patch,
        "lineage": {
            "patchSha256": _sha(patch_json),
            "candidateSnapshotSha256": _sha(candidate_json),
        },
    }


def _cma_proposals(
    contract: dict[str, Any], base: tuple[list[float], list[float], float], seed: int
) -> list[dict[str, Any]]:
    names = list(BOUNDS)
    bounds = np.asarray([BOUNDS[name] for name in names], dtype=np.float64)
    optimizer = cmaes.CMA(
        mean=np.ones(len(names), dtype=np.float64),
        sigma=0.04,
        bounds=bounds,
        population_size=CMA_POPULATION,
        seed=seed,
    )
    proposals: list[dict[str, Any]] = []
    for _generation in range(CMA_GENERATIONS):
        solutions: list[tuple[np.ndarray, float]] = []
        for _member in range(CMA_POPULATION):
            vector = optimizer.ask()
            parameters = tuple(float(value) for value in vector)
            loss = _acquisition_loss(parameters, "balanced")
            ordinal = len(proposals)
            proposals.append(_proposal(contract, base, ordinal, "cma-es", "balanced", parameters, loss))
            solutions.append((vector, loss))
        optimizer.tell(solutions)
    return proposals


def _tpe_proposals(
    contract: dict[str, Any], base: tuple[list[float], list[float], float], seed: int
) -> list[dict[str, Any]]:
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    sampler = optuna.samplers.TPESampler(
        seed=seed + 1,
        n_startup_trials=TPE_STARTUP_TRIALS,
        multivariate=False,
    )
    study = optuna.create_study(direction="minimize", sampler=sampler)
    proposals: list[dict[str, Any]] = []
    profiles = list(PROFILE_TARGETS)
    for index in range(TPE_PROPOSALS):
        trial = study.ask()
        profile = trial.suggest_categorical("electricalProfile", profiles)
        parameters = tuple(
            trial.suggest_float(name, BOUNDS[name][0], BOUNDS[name][1]) for name in BOUNDS
        )
        loss = _acquisition_loss(parameters, profile)
        study.tell(trial, loss)
        proposals.append(_proposal(contract, base, CMA_PROPOSALS + index, "optuna-tpe", profile, parameters, loss))
    return proposals


def _plan_hash_payload(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": value["source"],
        "manifold": value["manifold"],
        "constraints": value["constraints"],
        "algorithms": value["algorithms"],
        "proposals": value["proposals"],
        "nonclaims": value["nonclaims"],
    }


def build_search_plan(payload: dict[str, Any]) -> dict[str, Any]:
    assert_bounded_json(
        payload,
        label="co-design search input",
        max_bytes=MAX_INPUT_BYTES,
        max_depth=36,
        max_nodes=60_000,
    )
    snapshot, contract = _snapshot(payload)
    base = _base_values(contract)
    seed = _seed(payload, snapshot["contractHash"])
    constraints = _constraints(payload)
    source_revision, dependency_manifest_sha256, runtime_authority = _runtime_authority()
    proposals = _cma_proposals(contract, base, seed) + _tpe_proposals(contract, base, seed)
    if len(proposals) != TOTAL_PROPOSALS:
        raise RuntimeError("co-design search did not produce exactly 200 proposals")
    candidate_hashes = [proposal["lineage"]["candidateSnapshotSha256"] for proposal in proposals]
    if len(set(candidate_hashes)) != TOTAL_PROPOSALS:
        raise RuntimeError("co-design search produced duplicate candidate snapshots")
    value = {
        "schemaVersion": f"{SEARCH_PLAN_SCHEMA}/{SEARCH_PLAN_VERSION}",
        "artifactKind": "codesignSearchPlan",
        "provider": "forge-local-algorithm-search",
        "source": {
            "snapshotSchema": SNAPSHOT_SCHEMA,
            "modelId": snapshot["modelId"],
            "baseContractHash": snapshot["contractHash"],
            "sourceRevision": source_revision,
            "sourceRevisionRecorded": source_revision is not None,
            "dependencyManifestSha256": dependency_manifest_sha256,
            "proposalRuntimeAuthority": runtime_authority,
            "resumePolicy": "exact-proposal-runtime-authority",
            "heterogeneousResumeAllowed": False,
            "runtime": SEARCH_PLAN_RUNTIME,
            "maturity": SEARCH_PLAN_MATURITY,
        },
        "manifold": {
            "source": "exact-admitted-inline-multirotor-contract",
            "categorical": [{"name": "electricalProfile", "choices": list(PROFILE_TARGETS)}],
            "continuous": [{"name": name, "bounds": list(bounds)} for name, bounds in BOUNDS.items()],
            "units": {"motorKv": "rpm/V", "propDiameter": "in", "batteryCapacity": "mAh"},
            "catalogChoiceSearch": False,
        },
        "constraints": constraints,
        "algorithms": {
            "candidateBudget": TOTAL_PROPOSALS,
            "seed": seed,
            "cmaEs": {
                "library": "cmaes",
                "version": CMAES_VERSION,
                "proposals": CMA_PROPOSALS,
                "populationSize": CMA_POPULATION,
                "generations": CMA_GENERATIONS,
                "feedback": "bounded-diversity-acquisition-v1",
                "engineFeedback": False,
            },
            "optunaTpe": {
                "library": "optuna",
                "version": OPTUNA_VERSION,
                "proposals": TPE_PROPOSALS,
                "startupTrials": TPE_STARTUP_TRIALS,
                "multivariate": False,
                "feedback": "bounded-diversity-acquisition-v1",
                "engineFeedback": False,
            },
        },
        "proposals": proposals,
        "nonclaims": dict(NONCLAIMS),
        "planSha256": "",
    }
    value["planSha256"] = _sha(_stable_json(_plan_hash_payload(value)))
    value["cacheKey"] = (
        f"codesign.search:v2:{snapshot['contractHash'][:16]}:"
        f"{runtime_authority['authoritySha256'][:16]}:{value['planSha256'][:16]}"
    )
    return value


def validate_search_plan(value: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("co-design search plan must be an object")
    _exact(
        value,
        {
            "schemaVersion",
            "artifactKind",
            "provider",
            "cacheKey",
            "source",
            "manifold",
            "constraints",
            "algorithms",
            "proposals",
            "nonclaims",
            "planSha256",
        },
        "co-design search plan",
    )
    if value.get("schemaVersion") != f"{SEARCH_PLAN_SCHEMA}/{SEARCH_PLAN_VERSION}":
        raise ValueError("co-design search plan version is unsupported")
    if value.get("artifactKind") != "codesignSearchPlan" or value.get("provider") != "forge-local-algorithm-search":
        raise ValueError("co-design search plan identity drifted")
    if value.get("nonclaims") != NONCLAIMS:
        raise ValueError("co-design search plan nonclaims drifted")
    source = value.get("source")
    if not isinstance(source, dict):
        raise ValueError("co-design search plan source is invalid")
    if (
        source.get("resumePolicy") != "exact-proposal-runtime-authority"
        or source.get("heterogeneousResumeAllowed") is not False
    ):
        raise ValueError("co-design search plan proposal runtime policy drifted")
    authority = _validate_proposal_runtime_authority(source.get("proposalRuntimeAuthority"))
    current_authority = _proposal_runtime_authority()
    _validate_proposal_runtime_authority(current_authority)
    if _stable_json(authority) != _stable_json(current_authority):
        raise ValueError("co-design search plan proposal runtime authority does not match this worker")
    if value.get("planSha256") != _sha(_stable_json(_plan_hash_payload(value))):
        raise ValueError("co-design search plan hash drifted")
    replayed = build_search_plan(payload)
    if _stable_json(value) != _stable_json(replayed):
        raise ValueError("co-design search plan deterministic replay drifted")
    return value


def main(stdin: TextIO = sys.stdin, stdout: TextIO = sys.stdout, stderr: TextIO = sys.stderr) -> int:
    try:
        encoded = (
            stdin.buffer.read(MAX_INPUT_BYTES + 1)
            if hasattr(stdin, "buffer")
            else stdin.read(MAX_INPUT_BYTES + 1).encode("utf-8")
        )
        if len(encoded) > MAX_INPUT_BYTES:
            raise ValueError("co-design search input exceeds the worker boundary")
        payload = json.loads(encoded.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("co-design search input must be an object")
        value = build_search_plan(payload)
        validate_search_plan(value, payload)
        stdout.write(_stable_json(value))
        stdout.write("\n")
        return 0
    except (ValueError, RuntimeError, json.JSONDecodeError, UnicodeDecodeError, RecursionError) as error:
        stderr.write(f"codesign-search: {error}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
