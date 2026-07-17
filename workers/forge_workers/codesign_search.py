"""Deterministic D64 catalog-backed CMA-ES/TPE proposal-plan evidence.

This module executes the real pinned proposal algorithms but deliberately does not
evaluate a design.  The resulting 200-proposal plan has no validator, Rapier,
MuJoCo, training, Pareto, overnight-result, provider, build, hardware, or field
authority.  The separately versioned engine-batch worker must consume the exact
proposal hashes and attach sovereign engine evidence before any candidate can be
admitted.
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
SEARCH_PLAN_VERSION = "3.0.0"
SEARCH_PLAN_EVIDENCE_VERSION = "3.0.0"
SEARCH_PLAN_RUNTIME = "forge-codesign-search-plan/3.0.0"
SEARCH_PLAN_MATURITY = "catalog-bound-platform-algorithm-proposal-plan"
PROPOSAL_RUNTIME_AUTHORITY_SCHEMA = "forge-codesign-proposal-runtime-authority"
PROPOSAL_RUNTIME_AUTHORITY_VERSION = "1.0.0"
CATALOG_CHOICE_AUTHORITY_SCHEMA = "forge-codesign-catalog-choice-authority"
CATALOG_CHOICE_AUTHORITY_VERSION = "1.0.0"
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
    "tiltMaxRad": (0.32, 0.48),
    "yawRateRadS": (2.0, 2.8),
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
    "catalogMarketplacePublicationReviewed": False,
    "catalogLivePersistence": False,
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


def catalog_dir() -> Path:
    configured = os.environ.get("FORGE_CATALOG_DIR", "").strip()
    root = Path(configured) if configured else Path(__file__).resolve().parents[2] / "catalog"
    if not (root / "components").is_dir():
        raise RuntimeError("co-design catalog components directory is absent")
    return root


def _catalog_rows(root: Path) -> tuple[str, dict[str, tuple[dict[str, Any], str]]]:
    paths = sorted((root / "components").glob("*.json"))
    if not paths:
        raise RuntimeError("co-design catalog contains no component rows")
    authority = hashlib.sha256()
    authority.update(b"forge-file-catalog-authority-v1\0")
    rows: dict[str, tuple[dict[str, Any], str]] = {}
    for path in paths:
        raw = path.read_bytes()
        row_sha256 = _sha(raw)
        authority.update(f"components/{path.name}".encode("utf-8"))
        authority.update(b"\0")
        authority.update(row_sha256.encode("ascii"))
        authority.update(b"\n")
        try:
            row = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as error:
            raise ValueError(f"co-design catalog row {path.name} is invalid") from error
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            raise ValueError(f"co-design catalog row {path.name} has no exact identity")
        if row["id"] in rows:
            raise ValueError("co-design catalog component ids are not unique")
        rows[row["id"]] = (row, row_sha256)
    return authority.hexdigest(), rows


def _catalog_choice_authority(contract: dict[str, Any]) -> dict[str, Any]:
    root = catalog_dir()
    catalog_authority_sha256, rows = _catalog_rows(root)
    lockfile = contract.get("lockfile")
    slots = contract.get("slots")
    if not isinstance(lockfile, dict) or not isinstance(slots, list):
        raise ValueError("co-design catalog search requires slots and an exact lockfile")
    candidates: list[tuple[int, dict[str, Any], list[dict[str, Any]]]] = []
    for slot_index, slot in enumerate(slots):
        if not isinstance(slot, dict) or not isinstance(slot.get("variants"), list):
            continue
        choices: list[dict[str, Any]] = []
        for variant in slot["variants"]:
            if not isinstance(variant, dict):
                choices = []
                break
            choice_id = variant.get("id")
            slot_id = slot.get("id")
            if (
                not isinstance(choice_id, str)
                or not choice_id
                or not isinstance(slot_id, str)
                or not slot_id
            ):
                choices = []
                break
            component_ref = variant.get("componentRef")
            pin = lockfile.get(component_ref) if isinstance(component_ref, str) else None
            if not isinstance(pin, str) or "@" not in pin:
                choices = []
                break
            component_id, revision = pin.rsplit("@", 1)
            if component_ref.rsplit("@", 1)[0] != component_id:
                choices = []
                break
            record = rows.get(component_id)
            if record is None:
                choices = []
                break
            row, row_sha256 = record
            revisions = row.get("revisions")
            if not isinstance(revisions, list) or not any(
                isinstance(item, dict)
                and item.get("version") == revision
                and item.get("yanked") is False
                for item in revisions
            ):
                choices = []
                break
            if row.get("category") != "battery":
                choices = []
                break
            elec = row.get("elec")
            license_value = row.get("license")
            if not isinstance(elec, dict) or not isinstance(license_value, dict):
                raise ValueError("co-design battery catalog row lacks electrical or license authority")
            capacity = _finite(elec.get("capacityMah"), "catalog battery capacity")
            max_discharge = _finite(
                elec.get("maxDischargeA"), "catalog battery maximum discharge"
            )
            mass = _finite(row.get("massG"), "catalog battery mass")
            confidence = _finite(row.get("confidence"), "catalog row confidence")
            review = row.get("review")
            if capacity <= 0 or max_discharge <= 0 or mass <= 0 or not 0 < confidence <= 1:
                raise ValueError("co-design battery catalog row values are outside bounds")
            if review is not None and not isinstance(review, str):
                raise ValueError("co-design catalog review authority is invalid")
            license_proof = {
                "id": license_value.get("id"),
                "class": license_value.get("class"),
                "sourceUrl": license_value.get("sourceUrl"),
                "exportPolicy": license_value.get("exportPolicy"),
            }
            if any(
                not isinstance(value, str) or not value for value in license_proof.values()
            ):
                raise ValueError("co-design catalog license authority is incomplete")
            if not license_proof["sourceUrl"].startswith("https://"):
                raise ValueError("co-design catalog license source must use HTTPS")
            choices.append(
                {
                    "choiceId": choice_id,
                    "slotId": slot_id,
                    "componentRef": component_ref,
                    "exactRevision": pin,
                    "componentId": component_id,
                    "rowSha256": row_sha256,
                    "category": "battery",
                    "massG": _canonical_number(mass),
                    "capacityMah": _canonical_number(capacity),
                    "maxDischargeA": _canonical_number(max_discharge),
                    "cRating": _canonical_number(max_discharge / (capacity / 1000)),
                    "confidence": confidence,
                    "reviewRequired": confidence < 1 or review is not None,
                    "review": review,
                    "license": license_proof,
                }
            )
        if len(choices) >= 2:
            candidates.append((slot_index, slot, choices))
    if len(candidates) != 1:
        raise ValueError("co-design catalog search requires exactly one multi-choice battery slot")
    slot_index, slot, choices = candidates[0]
    choices.sort(key=lambda choice: choice["choiceId"])
    equipped = slot.get("equippedVariantId")
    if equipped not in {choice["choiceId"] for choice in choices}:
        raise ValueError("co-design catalog search requires one exact equipped battery variant")
    value = {
        "schemaVersion": f"{CATALOG_CHOICE_AUTHORITY_SCHEMA}/{CATALOG_CHOICE_AUTHORITY_VERSION}",
        "catalogAuthoritySha256": catalog_authority_sha256,
        "searchSlotId": slot.get("id"),
        "searchSlotIndex": slot_index,
        "baseEquippedChoiceId": equipped,
        "choices": choices,
        "marketplacePublicationReviewed": False,
        "marketplaceExposable": False,
        "authoritySha256": "",
    }
    value["authoritySha256"] = _sha(
        _stable_json({key: item for key, item in value.items() if key != "authoritySha256"})
    )
    return value


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
        raise ValueError("co-design search v3 requires exactly 200 proposals")
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


def _base_values(
    contract: dict[str, Any], catalog_authority: dict[str, Any]
) -> dict[str, float | int]:
    meta = contract.get("meta")
    sim = contract.get("sim")
    driver = contract.get("driver")
    if (
        not isinstance(meta, dict)
        or meta.get("archetype") != "multirotor"
        or not isinstance(sim, dict)
        or not isinstance(driver, dict)
        or not isinstance(driver.get("params"), dict)
    ):
        raise ValueError("co-design search v3 supports admitted catalog-backed multirotors only")
    battery = sim.get("battery")
    if not isinstance(battery, dict):
        raise ValueError("co-design search requires an inline battery")
    params = driver["params"]
    tilt = _finite(params.get("tiltMaxRad"), "driver.params.tiltMaxRad")
    yaw = _finite(params.get("yawRate"), "driver.params.yawRate")
    capacity = _finite(battery.get("capacity_mAh"), "battery.capacity_mAh")
    c_rating = _finite(battery.get("cRating"), "battery.cRating")
    base_choice = next(
        choice
        for choice in catalog_authority["choices"]
        if choice["choiceId"] == catalog_authority["baseEquippedChoiceId"]
    )
    if capacity != float(base_choice["capacityMah"]):
        raise ValueError("co-design base battery simulation does not match its equipped catalog revision")
    if c_rating != float(base_choice["cRating"]):
        raise ValueError("co-design base battery discharge does not match its equipped catalog revision")
    if not BOUNDS["tiltMaxRad"][0] <= tilt <= BOUNDS["tiltMaxRad"][1]:
        raise ValueError("co-design base tilt limit is outside the reviewed manifold")
    if not BOUNDS["yawRateRadS"][0] <= yaw <= BOUNDS["yawRateRadS"][1]:
        raise ValueError("co-design base yaw rate is outside the reviewed manifold")
    return {
        "searchSlotIndex": int(catalog_authority["searchSlotIndex"]),
        "tiltMaxRad": tilt,
        "yawRateRadS": yaw,
    }


def _clamp(name: str, value: float) -> float:
    low, high = BOUNDS[name]
    return min(high, max(low, float(value)))


def _acquisition_loss(
    parameters: tuple[float, float], choice: dict[str, Any], choices: list[dict[str, Any]]
) -> float:
    choice_index = next(index for index, item in enumerate(choices) if item["choiceId"] == choice["choiceId"])
    fraction = (choice_index + 1) / (len(choices) + 1)
    normalized = []
    for index, name in enumerate(BOUNDS):
        low, high = BOUNDS[name]
        target = low + fraction * (high - low)
        normalized.append((parameters[index] - target) / (high - low))
    smooth = sum((index + 1) * value * value for index, value in enumerate(normalized))
    coupling = abs(normalized[0] - normalized[1]) * 0.075
    return float(smooth + coupling + choice_index * 0.0025)


def _candidate_patch(
    parameters: tuple[float, float],
    base: dict[str, float | int],
    choice: dict[str, Any],
) -> list[dict[str, Any]]:
    tilt_max_rad, yaw_rate_rad_s = parameters
    return [
        {
            "op": "replace",
            "path": f"/slots/{int(base['searchSlotIndex'])}/equippedVariantId",
            "value": choice["choiceId"],
        },
        {
            "op": "replace",
            "path": "/sim/battery/capacity_mAh",
            "value": choice["capacityMah"],
        },
        {
            "op": "replace",
            "path": "/sim/battery/cRating",
            "value": choice["cRating"],
        },
        {
            "op": "replace",
            "path": "/driver/params/tiltMaxRad",
            "value": _canonical_number(round(tilt_max_rad, 9)),
        },
        {
            "op": "replace",
            "path": "/driver/params/yawRate",
            "value": _canonical_number(round(yaw_rate_rad_s, 9)),
        },
    ]


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
    base: dict[str, float | int],
    catalog_authority: dict[str, Any],
    ordinal: int,
    algorithm: str,
    choice: dict[str, Any],
    parameters: tuple[float, float],
    acquisition_loss: float,
) -> dict[str, Any]:
    rounded = tuple(round(_clamp(name, parameters[index]), 9) for index, name in enumerate(BOUNDS))
    patch = _candidate_patch(rounded, base, choice)
    candidate = apply_search_patch(contract, patch)
    candidate_json = _stable_json(candidate)
    patch_json = _stable_json(patch)
    return {
        "id": f"proposal-{ordinal:03d}-{_sha(candidate_json)[:12]}",
        "ordinal": ordinal,
        "algorithm": algorithm,
        "catalogChoice": copy.deepcopy(choice),
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
            "catalogAuthoritySha256": catalog_authority["catalogAuthoritySha256"],
            "catalogChoiceAuthoritySha256": catalog_authority["authoritySha256"],
            "selectedRowSha256": choice["rowSha256"],
            "selectedExactRevision": choice["exactRevision"],
        },
    }


def _cma_proposals(
    contract: dict[str, Any],
    base: dict[str, float | int],
    catalog_authority: dict[str, Any],
    seed: int,
) -> list[dict[str, Any]]:
    names = list(BOUNDS)
    bounds = np.asarray([BOUNDS[name] for name in names], dtype=np.float64)
    optimizer = cmaes.CMA(
        mean=np.asarray([(low + high) / 2 for low, high in BOUNDS.values()], dtype=np.float64),
        sigma=0.03,
        bounds=bounds,
        population_size=CMA_POPULATION,
        seed=seed,
    )
    proposals: list[dict[str, Any]] = []
    choice = next(
        item
        for item in catalog_authority["choices"]
        if item["choiceId"] == catalog_authority["baseEquippedChoiceId"]
    )
    for _generation in range(CMA_GENERATIONS):
        solutions: list[tuple[np.ndarray, float]] = []
        for _member in range(CMA_POPULATION):
            vector = optimizer.ask()
            parameters = tuple(float(value) for value in vector)
            loss = _acquisition_loss(parameters, choice, catalog_authority["choices"])
            ordinal = len(proposals)
            proposals.append(
                _proposal(contract, base, catalog_authority, ordinal, "cma-es", choice, parameters, loss)
            )
            solutions.append((vector, loss))
        optimizer.tell(solutions)
    return proposals


def _tpe_proposals(
    contract: dict[str, Any],
    base: dict[str, float | int],
    catalog_authority: dict[str, Any],
    seed: int,
) -> list[dict[str, Any]]:
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    sampler = optuna.samplers.TPESampler(
        seed=seed + 1,
        n_startup_trials=TPE_STARTUP_TRIALS,
        multivariate=False,
    )
    study = optuna.create_study(direction="minimize", sampler=sampler)
    proposals: list[dict[str, Any]] = []
    choices = catalog_authority["choices"]
    choice_ids = [choice["choiceId"] for choice in choices]
    for index in range(TPE_PROPOSALS):
        trial = study.ask()
        choice_id = trial.suggest_categorical("batteryComponentRevision", choice_ids)
        choice = next(item for item in choices if item["choiceId"] == choice_id)
        parameters = tuple(
            trial.suggest_float(name, BOUNDS[name][0], BOUNDS[name][1]) for name in BOUNDS
        )
        loss = _acquisition_loss(parameters, choice, choices)
        study.tell(trial, loss)
        proposals.append(
            _proposal(
                contract,
                base,
                catalog_authority,
                CMA_PROPOSALS + index,
                "optuna-tpe",
                choice,
                parameters,
                loss,
            )
        )
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
    catalog_authority = _catalog_choice_authority(contract)
    base = _base_values(contract, catalog_authority)
    seed = _seed(payload, snapshot["contractHash"])
    constraints = _constraints(payload)
    source_revision, dependency_manifest_sha256, runtime_authority = _runtime_authority()
    proposals = _cma_proposals(contract, base, catalog_authority, seed) + _tpe_proposals(
        contract, base, catalog_authority, seed
    )
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
            "catalogChoiceAuthority": catalog_authority,
            "resumePolicy": "exact-proposal-runtime-authority",
            "heterogeneousResumeAllowed": False,
            "runtime": SEARCH_PLAN_RUNTIME,
            "maturity": SEARCH_PLAN_MATURITY,
        },
        "manifold": {
            "source": "exact-admitted-catalog-backed-multirotor-contract",
            "categorical": [
                {
                    "name": "batteryComponentRevision",
                    "slotId": catalog_authority["searchSlotId"],
                    "choices": copy.deepcopy(catalog_authority["choices"]),
                }
            ],
            "continuous": [
                {
                    "name": name,
                    "bounds": [_canonical_number(value) for value in bounds],
                }
                for name, bounds in BOUNDS.items()
            ],
            "units": {"tiltMaxRad": "rad", "yawRateRadS": "rad/s"},
            "catalogChoiceSearch": True,
            "equippedVariantSemantics": "exactly-one-equipped-d32",
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
                "categoricalSearch": False,
            },
            "optunaTpe": {
                "library": "optuna",
                "version": OPTUNA_VERSION,
                "proposals": TPE_PROPOSALS,
                "startupTrials": TPE_STARTUP_TRIALS,
                "multivariate": False,
                "feedback": "bounded-diversity-acquisition-v1",
                "engineFeedback": False,
                "categoricalSearch": True,
            },
        },
        "proposals": proposals,
        "nonclaims": dict(NONCLAIMS),
        "planSha256": "",
    }
    value["planSha256"] = _sha(_stable_json(_plan_hash_payload(value)))
    value["cacheKey"] = (
        f"codesign.search:v3:{snapshot['contractHash'][:16]}:"
        f"{catalog_authority['authoritySha256'][:16]}:"
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
