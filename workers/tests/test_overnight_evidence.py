from __future__ import annotations

import base64
import hashlib

import pytest

from forge_workers.training.overnight_evidence import run_suite


REVISION = "ab" * 20
HARDWARE = {
    "system": "Darwin",
    "machine": "arm64",
    "chip": "Apple test chip",
    "accelerator": {"backend": "mps", "available": True, "built": True},
}


def passing_result(task: str, seed: int) -> dict:
    model = f"onnx:{task}:{seed}".encode()
    return {
        "artifactKind": "policy",
        "task": {"id": task},
        "onnx": {
            "byteSize": len(model),
            "sha256": hashlib.sha256(model).hexdigest(),
            "modelBase64": base64.b64encode(model).decode(),
        },
        "scorecard": {
            "schemaVersion": "p7-scorecard-v1",
            "successRate": 1.0,
            "robustness": {"mass+15%": 1.0, "kv-8%": 1.0, "wind4ms": 1.0},
            "exportable": True,
            "lineage": {"sourceRevision": REVISION, "seed": str(seed)},
        },
        "training": {
            "recipe": "p7-overnight-v1",
            "device": "cpu",
            "truthExposedToPolicy": False,
        },
    }


def test_interrupted_suite_resumes_only_digest_valid_atomic_checkpoints(tmp_path):
    calls: list[str] = []

    def trainer(payload, _bundle):
        calls.append(payload["task"])
        return passing_result(payload["task"], payload["seed"])

    with pytest.raises(RuntimeError, match="intentional evidence interruption"):
        run_suite(
            output_dir=tmp_path,
            power_upper_bound_watts=140,
            resume=False,
            interrupt_after="hover-hold",
            trainer=trainer,
            bundle={},
            source_revision=REVISION,
            hardware=HARDWARE,
            require_clean=False,
        )
    assert calls == ["hover-hold"]
    assert (tmp_path / "hover-hold.json").is_file()
    assert (tmp_path / "hover-hold.onnx").is_file()
    assert not (tmp_path / "suite.json").exists()

    calls.clear()
    summary = run_suite(
        output_dir=tmp_path,
        power_upper_bound_watts=140,
        resume=True,
        trainer=trainer,
        bundle={},
        source_revision=REVISION,
        hardware=HARDWARE,
        require_clean=False,
    )
    assert calls == ["waypoint-chain"]
    assert summary["status"] == "passed"
    assert summary["recovery"]["reusedTasks"] == ["hover-hold"]
    assert all(row["scorecard"]["exportable"] for row in summary["results"])

    (tmp_path / "hover-hold.onnx").write_bytes(b"tampered")
    calls.clear()
    repaired = run_suite(
        output_dir=tmp_path,
        power_upper_bound_watts=140,
        resume=True,
        trainer=trainer,
        bundle={},
        source_revision=REVISION,
        hardware=HARDWARE,
        require_clean=False,
    )
    assert calls == ["hover-hold"]
    assert repaired["recovery"]["reusedTasks"] == ["waypoint-chain"]


def test_suite_refuses_unbounded_power_authority(tmp_path):
    with pytest.raises(ValueError, match="power upper bound"):
        run_suite(
            output_dir=tmp_path,
            power_upper_bound_watts=0,
            resume=False,
            bundle={},
            source_revision=REVISION,
            hardware=HARDWARE,
            require_clean=False,
        )
