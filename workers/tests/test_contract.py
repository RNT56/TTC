import json
from pathlib import Path

from forge_workers.contract import validate_model_spec


def repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "examples" / "vx2-mini.forge.json").exists():
            return parent
    raise FileNotFoundError("repo root with examples/ not found")


def test_demo_contract_validates_against_emitted_schema():
    doc = json.loads((repo_root() / "examples" / "vx2-mini.forge.json").read_text())
    assert validate_model_spec(doc) == []


def test_garbage_fails_schema():
    errors = validate_model_spec({"nope": True})
    assert errors, "missing required blocks must fail"
