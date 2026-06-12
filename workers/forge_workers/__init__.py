"""FORGE compute plane (plan §5.2): queue-driven, idempotent, no public surface.

Payloads are validated against the schemars-emitted JSON Schema — the
inter-language contract (D16). Never hand-mirror the contract types here.
"""

__all__ = ["contract", "queue"]
