"""Contract-schema access for workers.

The schema artifact is emitted by `forge-validate schema` (the Rust types are
the single source, D16). Workers validate inbound ModelSpec payloads against it
before doing any work.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import jsonschema

SCHEMA_ENV_VAR = "FORGE_SCHEMA"
_REPO_RELATIVE = Path("schema") / "forge-modelspec.schema.json"

# Worker output envelopes follow the worker package SemVer until each public
# artifact family has its own independently versioned schema. Replay already
# has that public boundary and therefore carries a separate format version.
WORKER_ARTIFACT_FORMAT_VERSION = "0.2.0"
REPLAY_FORMAT_VERSION = "1.0.0"
LEGACY_REPLAY_FORMAT_VERSION = "replay.v1"
LICENSE_EXPORT_MANIFEST_FORMAT_VERSION = "1.0.0"


def schema_path() -> Path:
    """Locate the emitted schema: $FORGE_SCHEMA, else walk up to the repo root."""
    env = os.environ.get(SCHEMA_ENV_VAR)
    if env:
        return Path(env)
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / _REPO_RELATIVE
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"schema not found; set {SCHEMA_ENV_VAR} or run `forge-validate schema "
        f"--out {_REPO_RELATIVE}` at the repo root"
    )


@lru_cache(maxsize=1)
def load_schema() -> dict[str, Any]:
    with open(schema_path(), encoding="utf-8") as fh:
        return json.load(fh)


def validate_model_spec(doc: dict[str, Any]) -> list[str]:
    """Validate a ModelSpec payload; returns a list of error strings (empty = ok)."""
    validator = jsonschema.Draft202012Validator(load_schema())
    return [
        f"{'/'.join(str(p) for p in err.path) or '<root>'}: {err.message}"
        for err in validator.iter_errors(doc)
    ]
