"""Catalog ETL worker family (P3): etl.ingest-component. Nothing auto-publishes."""

from forge_workers.etl.ingest import ingest_fixture, ingest_payload

__all__ = ["ingest_fixture", "ingest_payload"]
