"""D72 deny-by-default structured events for private worker attempts."""

from __future__ import annotations

import json
import os
import re
import secrets
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Mapping, Protocol, TextIO

OBSERVABILITY_EVENT_VERSION = "2.0.0"
OBSERVABILITY_EVENT_SCHEMA = f"forge-observability-event/{OBSERVABILITY_EVENT_VERSION}"
WORKER_OBSERVABILITY_SERVICE_VERSION = "0.2.0"
MAX_OBSERVABILITY_EVENT_BYTES = 4_096
OBSERVABILITY_ENVIRONMENTS = (
    "local",
    "ci",
    "sandbox",
    "staging",
    "production",
    "controlled-lab",
)

_GIT_HASH = re.compile(r"^[a-f0-9]{40}$")
_UUID_V4 = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
_TRACE_ID = re.compile(r"^(?!0{32}$)[a-f0-9]{32}$")
_SPAN_ID = re.compile(r"^(?!0{16}$)[a-f0-9]{16}$")
_SAFE_JOB_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
_SAFE_TASK = re.compile(r"^[a-z][a-z0-9.-]{0,79}$")
_SAFE_ERROR_CODE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")


@dataclass(frozen=True)
class WorkerObservabilityRuntimeContext:
    environment: str
    source_revision: str | None


class ObservableJob(Protocol):
    id: str
    task: str
    provider: str
    attempts: int
    observability_request_id: str | None
    observability_trace_id: str
    observability_parent_span_id: str | None
    observability_attempt_id: str
    observability_span_id: str


WorkerObservation = dict[str, Any]
WorkerObservationSink = Callable[[WorkerObservation], None]


def new_trace_id() -> str:
    return secrets.token_hex(16)


def new_span_id() -> str:
    return secrets.token_hex(8)


def new_attempt_id() -> str:
    return str(uuid.uuid4())


def worker_observability_runtime_context(
    env: Mapping[str, str] | None = None,
) -> WorkerObservabilityRuntimeContext:
    values = os.environ if env is None else env
    requested = values.get("FORGE_DEPLOYMENT_ENVIRONMENT")
    environment = requested if requested in OBSERVABILITY_ENVIRONMENTS else "local"
    revision = values.get("FORGE_SOURCE_REVISION")
    return WorkerObservabilityRuntimeContext(
        environment=environment,
        source_revision=revision if revision and _GIT_HASH.fullmatch(revision) else None,
    )


def _timestamp(value: datetime | None = None) -> str:
    instant = value or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    milliseconds = instant.astimezone(timezone.utc).isoformat(timespec="milliseconds")
    return milliseconds.replace("+00:00", "Z")


def _correlation(job: ObservableJob) -> dict[str, str | None]:
    return {
        "requestId": job.observability_request_id,
        "traceId": job.observability_trace_id,
        "spanId": job.observability_span_id,
        "parentSpanId": job.observability_parent_span_id,
        "actorDigest": None,
        "jobId": job.id,
        "attemptId": job.observability_attempt_id,
        "providerCallId": None,
        "deploymentId": None,
    }


def _base_event(
    job: ObservableJob,
    runtime: WorkerObservabilityRuntimeContext,
    *,
    event_name: str,
    level: str,
    attributes: dict[str, Any],
    occurred_at: datetime | None,
) -> WorkerObservation:
    return {
        "schemaVersion": OBSERVABILITY_EVENT_SCHEMA,
        "occurredAt": _timestamp(occurred_at),
        "clock": {"source": "system", "timezone": "UTC"},
        "level": level,
        "eventName": event_name,
        "service": "workers",
        "serviceVersion": WORKER_OBSERVABILITY_SERVICE_VERSION,
        "environment": runtime.environment,
        "source": {
            "component": "workers/forge_workers",
            "revision": runtime.source_revision,
        },
        "correlation": _correlation(job),
        "attributes": attributes,
    }


def create_worker_attempt_started_observation(
    job: ObservableJob,
    runtime: WorkerObservabilityRuntimeContext,
    *,
    occurred_at: datetime | None = None,
) -> WorkerObservation:
    return _base_event(
        job,
        runtime,
        event_name="worker.job.attempt.started",
        level="info",
        attributes={
            "task": job.task,
            "provider": job.provider,
            "attempt": max(1, job.attempts),
        },
        occurred_at=occurred_at,
    )


def create_worker_attempt_completed_observation(
    job: ObservableJob,
    runtime: WorkerObservabilityRuntimeContext,
    *,
    outcome: str,
    duration_ms: float,
    error_code: str | None = None,
    retry_after_seconds: float | None = None,
    occurred_at: datetime | None = None,
) -> WorkerObservation:
    level = "info" if outcome == "succeeded" else "error" if outcome == "failed" else "warn"
    return _base_event(
        job,
        runtime,
        event_name="worker.job.attempt.completed",
        level=level,
        attributes={
            "task": job.task,
            "provider": job.provider,
            "attempt": max(1, job.attempts),
            "outcome": outcome,
            "durationMs": round(max(0.0, duration_ms), 3),
            "errorCode": error_code,
            "retryAfterSeconds": retry_after_seconds,
        },
        occurred_at=occurred_at,
    )


def _exact_keys(value: object, expected: set[str]) -> bool:
    return isinstance(value, dict) and set(value) == expected


def _canonical_timestamp(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 24:
        return False
    try:
        parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return False
    return _timestamp(parsed) == value


def validate_worker_observation(value: object) -> list[str]:
    errors: list[str] = []
    if not _exact_keys(
        value,
        {
            "schemaVersion",
            "occurredAt",
            "clock",
            "level",
            "eventName",
            "service",
            "serviceVersion",
            "environment",
            "source",
            "correlation",
            "attributes",
        },
    ):
        return ["observation must contain only the versioned top-level allowlist"]
    assert isinstance(value, dict)
    if value["schemaVersion"] != OBSERVABILITY_EVENT_SCHEMA:
        errors.append("schemaVersion is unsupported")
    if not _canonical_timestamp(value["occurredAt"]):
        errors.append("occurredAt must be a bounded UTC timestamp")
    if value["clock"] != {"source": "system", "timezone": "UTC"}:
        errors.append("clock must bind the system UTC source")
    if value["service"] != "workers" or value["serviceVersion"] != WORKER_OBSERVABILITY_SERVICE_VERSION:
        errors.append("service identity/version is invalid")
    if value["environment"] not in OBSERVABILITY_ENVIRONMENTS:
        errors.append("environment is invalid")
    source = value["source"]
    if not _exact_keys(source, {"component", "revision"}):
        errors.append("source must contain only component and revision")
    else:
        assert isinstance(source, dict)
        revision = source["revision"]
        if source["component"] != "workers/forge_workers":
            errors.append("source component is invalid")
        if revision is not None and (not isinstance(revision, str) or _GIT_HASH.fullmatch(revision) is None):
            errors.append("source revision must be a Git hash or null")
        if value["environment"] not in ("local", "ci") and revision is None:
            errors.append("managed-environment observations require an exact source revision")

    correlation = value["correlation"]
    correlation_keys = {
        "requestId",
        "traceId",
        "spanId",
        "parentSpanId",
        "actorDigest",
        "jobId",
        "attemptId",
        "providerCallId",
        "deploymentId",
    }
    if not _exact_keys(correlation, correlation_keys):
        errors.append("correlation must contain only the bounded correlation allowlist")
    else:
        assert isinstance(correlation, dict)
        request_id = correlation["requestId"]
        parent_span_id = correlation["parentSpanId"]
        if request_id is not None and (not isinstance(request_id, str) or _UUID_V4.fullmatch(request_id) is None):
            errors.append("requestId is invalid")
        if not isinstance(correlation["traceId"], str) or _TRACE_ID.fullmatch(correlation["traceId"]) is None:
            errors.append("traceId is invalid")
        if not isinstance(correlation["spanId"], str) or _SPAN_ID.fullmatch(correlation["spanId"]) is None:
            errors.append("spanId is invalid")
        if parent_span_id is not None and (
            not isinstance(parent_span_id, str) or _SPAN_ID.fullmatch(parent_span_id) is None
        ):
            errors.append("parentSpanId is invalid")
        if (request_id is None) != (parent_span_id is None):
            errors.append("requestId and parentSpanId authority must be present together")
        if not isinstance(correlation["jobId"], str) or _SAFE_JOB_ID.fullmatch(correlation["jobId"]) is None:
            errors.append("jobId is invalid")
        if not isinstance(correlation["attemptId"], str) or _UUID_V4.fullmatch(correlation["attemptId"]) is None:
            errors.append("attemptId is invalid")
        for field in ("actorDigest", "providerCallId", "deploymentId"):
            if correlation[field] is not None:
                errors.append(f"{field} is not implemented in worker attempt events")

    event_name = value["eventName"]
    attributes = value["attributes"]
    if event_name == "worker.job.attempt.started":
        if value["level"] != "info":
            errors.append("started event level must be info")
        expected_attributes = {"task", "provider", "attempt"}
    elif event_name == "worker.job.attempt.completed":
        expected_attributes = {
            "task",
            "provider",
            "attempt",
            "outcome",
            "durationMs",
            "errorCode",
            "retryAfterSeconds",
        }
    else:
        errors.append("eventName is unsupported")
        expected_attributes = set()
    if not _exact_keys(attributes, expected_attributes):
        errors.append("attributes do not match the worker event allowlist")
        return errors
    assert isinstance(attributes, dict)
    if not isinstance(attributes["task"], str) or _SAFE_TASK.fullmatch(attributes["task"]) is None:
        errors.append("task is invalid")
    if attributes["provider"] not in ("local", "modal"):
        errors.append("provider is invalid")
    attempt = attributes["attempt"]
    if not isinstance(attempt, int) or isinstance(attempt, bool) or not 1 <= attempt <= 10:
        errors.append("attempt is invalid")
    if event_name == "worker.job.attempt.completed":
        outcome = attributes["outcome"]
        level_by_outcome = {
            "succeeded": "info",
            "retry-scheduled": "warn",
            "failed": "error",
            "discarded": "warn",
        }
        if outcome not in level_by_outcome:
            errors.append("outcome is invalid")
        elif value["level"] != level_by_outcome[outcome]:
            errors.append("level contradicts outcome")
        duration = attributes["durationMs"]
        if (
            not isinstance(duration, (int, float))
            or isinstance(duration, bool)
            or not 0 <= duration <= 28_800_000
        ):
            errors.append("durationMs is invalid")
        error_code = attributes["errorCode"]
        if error_code is not None and (
            not isinstance(error_code, str) or _SAFE_ERROR_CODE.fullmatch(error_code) is None
        ):
            errors.append("errorCode is invalid")
        retry_after = attributes["retryAfterSeconds"]
        if retry_after is not None and (
            not isinstance(retry_after, (int, float))
            or isinstance(retry_after, bool)
            or not 0 <= retry_after <= 900
        ):
            errors.append("retryAfterSeconds is invalid")
        if outcome == "succeeded" and (error_code is not None or retry_after is not None):
            errors.append("succeeded outcome cannot carry an error or retry")
        if outcome == "retry-scheduled" and (error_code is None or retry_after is None):
            errors.append("retry-scheduled outcome requires an error and delay")
        if outcome in ("failed", "discarded") and (error_code is None or retry_after is not None):
            errors.append(f"{outcome} outcome requires one error code and no retry delay")
    return errors


def serialize_worker_observation(event: WorkerObservation) -> str:
    errors = validate_worker_observation(event)
    if errors:
        raise ValueError(f"unsafe observability event refused: {'; '.join(errors)}")
    serialized = json.dumps(
        event,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    if len(serialized.encode("utf-8")) > MAX_OBSERVABILITY_EVENT_BYTES:
        raise ValueError("unsafe observability event refused: serialized event exceeds 4096 bytes")
    return serialized


def create_stdout_worker_observation_sink(
    output: TextIO = sys.stdout,
) -> WorkerObservationSink:
    def sink(event: WorkerObservation) -> None:
        output.write(f"{serialize_worker_observation(event)}\n")
        output.flush()

    return sink
