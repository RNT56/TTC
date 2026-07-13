"""FORGE compute plane (plan §5.2): queue-driven, idempotent, no public surface.

Payloads are validated against the schemars-emitted JSON Schema — the
inter-language contract (D16). Never hand-mirror the contract types here.
"""

from __future__ import annotations


def register_all_handlers() -> None:
    """Import every fixture-backed worker family exactly once."""

    from forge_workers import bridge as _bridge
    from forge_workers import codesign as _codesign
    from forge_workers import commerce as _commerce
    from forge_workers import geometry as _geometry
    from forge_workers import maintenance as _maintenance
    from forge_workers import photoscan as _photoscan
    from forge_workers import replay as _replay
    from forge_workers.etl import ingest as _ingest
    from forge_workers.training import jobs as _training_jobs

    _ = (_bridge, _codesign, _commerce, _geometry, _maintenance, _photoscan, _replay, _ingest, _training_jobs)


__all__ = ["contract", "queue", "register_all_handlers"]
