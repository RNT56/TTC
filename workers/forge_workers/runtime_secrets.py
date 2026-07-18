"""Load managed worker secrets from bounded file mounts, never image defaults."""

from __future__ import annotations

import os
from pathlib import Path
from typing import MutableMapping

MANAGED_SECRET_NAMES = (
    "ANTHROPIC_API_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "DATABASE_URL",
    "FORGE_OBJECT_ACCESS_KEY_ID",
    "FORGE_OBJECT_SECRET_ACCESS_KEY",
    "MODAL_TOKEN_ID",
    "MODAL_TOKEN_SECRET",
)


def load_managed_runtime_secrets(env: MutableMapping[str, str] | None = None) -> tuple[str, ...]:
    values = os.environ if env is None else env
    configured = values.get("FORGE_RUNTIME_SECRETS_DIRECTORY")
    if not configured:
        return ()
    directory = Path(configured)
    if not directory.is_absolute() or directory.is_symlink() or not directory.is_dir():
        raise RuntimeError("FORGE_RUNTIME_SECRETS_DIRECTORY must be a real absolute directory")

    loaded: list[str] = []
    for name in MANAGED_SECRET_NAMES:
        path = directory / name
        if not path.exists():
            continue
        if path.is_symlink() or not path.is_file():
            raise RuntimeError(f"managed secret file {path} is invalid")
        size = path.stat().st_size
        if size < 1 or size > 16 * 1024:
            raise RuntimeError(f"managed secret file {path} is invalid")
        raw = path.read_text(encoding="utf-8")
        value = raw[:-1] if raw.endswith("\n") else raw
        if not value or any(character in value for character in ("\x00", "\r", "\n")):
            raise RuntimeError(f"managed secret file {path} has invalid content")
        if name in values:
            raise RuntimeError(f"managed secret {name} has ambiguous file and environment sources")
        values[name] = value
        loaded.append(name)
    values["FORGE_RUNTIME_SECRETS_SOURCE"] = "files"
    return tuple(loaded)
