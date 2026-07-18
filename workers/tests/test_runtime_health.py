from __future__ import annotations

from pathlib import Path

import pytest

from forge_workers.health import process_is_live, worker_is_ready
from forge_workers.runtime_secrets import load_managed_runtime_secrets


def test_runtime_secrets_load_regular_bounded_files(tmp_path: Path) -> None:
    (tmp_path / "DATABASE_URL").write_text("postgres://runtime\n", encoding="utf-8")
    (tmp_path / "FORGE_OBJECT_SECRET_ACCESS_KEY").write_text("s" * 32, encoding="utf-8")
    env = {"FORGE_RUNTIME_SECRETS_DIRECTORY": str(tmp_path)}
    assert load_managed_runtime_secrets(env) == ("DATABASE_URL", "FORGE_OBJECT_SECRET_ACCESS_KEY")
    assert env["DATABASE_URL"] == "postgres://runtime"
    assert env["FORGE_RUNTIME_SECRETS_SOURCE"] == "files"


def test_runtime_secrets_reject_ambiguity_links_and_multiline(tmp_path: Path) -> None:
    (tmp_path / "DATABASE_URL").write_text("postgres://file", encoding="utf-8")
    with pytest.raises(RuntimeError, match="ambiguous"):
        load_managed_runtime_secrets(
            {"FORGE_RUNTIME_SECRETS_DIRECTORY": str(tmp_path), "DATABASE_URL": "postgres://env"}
        )

    (tmp_path / "DATABASE_URL").unlink()
    target = tmp_path / "target"
    target.write_text("postgres://target", encoding="utf-8")
    (tmp_path / "DATABASE_URL").symlink_to(target)
    with pytest.raises(RuntimeError, match="invalid"):
        load_managed_runtime_secrets({"FORGE_RUNTIME_SECRETS_DIRECTORY": str(tmp_path)})

    (tmp_path / "DATABASE_URL").unlink()
    (tmp_path / "DATABASE_URL").write_text("first\nsecond", encoding="utf-8")
    with pytest.raises(RuntimeError, match="invalid content"):
        load_managed_runtime_secrets({"FORGE_RUNTIME_SECRETS_DIRECTORY": str(tmp_path)})


def test_worker_liveness_is_process_only(tmp_path: Path) -> None:
    command = tmp_path / "cmdline"
    command.write_bytes(b"python\x00-m\x00forge_workers.runner\x00")
    assert process_is_live(command) is True
    command.write_bytes(b"python\x00-m\x00forge_workers.health\x00")
    assert process_is_live(command) is False


def test_worker_readiness_fails_closed_without_runtime_dependencies() -> None:
    assert worker_is_ready({}) is False
