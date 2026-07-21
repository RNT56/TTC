import io
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker

from forge_workers.observability import (
    OBSERVABILITY_EVENT_SCHEMA,
    WorkerObservabilityRuntimeContext,
    create_stdout_worker_observation_sink,
    create_worker_attempt_completed_observation,
    create_worker_attempt_started_observation,
    serialize_worker_observation,
    validate_worker_observation,
)
from forge_workers.queue import HandlerRegistry, Job, run_once


REVISION = "a" * 40
REQUEST_ID = "00000000-0000-4000-8000-000000000001"
ATTEMPT_ID = "00000000-0000-4000-8000-000000000002"
TRACE_ID = "b" * 32
PARENT_SPAN_ID = "c" * 16
SPAN_ID = "d" * 16


def observable_job(**overrides):
    values = {
        "id": "job-observability-1",
        "task": "unit.echo",
        "payload": {"secret": "payload-must-never-be-logged"},
        "idempotency_key": "secret-idempotency-key",
        "attempts": 2,
        "provider": "local",
        "observability_request_id": REQUEST_ID,
        "observability_trace_id": TRACE_ID,
        "observability_parent_span_id": PARENT_SPAN_ID,
        "observability_attempt_id": ATTEMPT_ID,
        "observability_span_id": SPAN_ID,
        "lease_token": "lease-token-must-never-be-logged",
    }
    values.update(overrides)
    return Job(**values)


def schema_validator():
    root = Path(__file__).resolve().parents[2]
    schema = json.loads((root / "schema" / "forge-observability-event.v2.schema.json").read_text())
    return Draft202012Validator(schema, format_checker=FormatChecker())


def test_worker_attempt_events_match_v2_schema_and_exclude_sensitive_content():
    runtime = WorkerObservabilityRuntimeContext(environment="sandbox", source_revision=REVISION)
    job = observable_job()
    started = create_worker_attempt_started_observation(job, runtime)
    completed = create_worker_attempt_completed_observation(
        job,
        runtime,
        outcome="retry-scheduled",
        duration_ms=12.34567,
        error_code="provider-unavailable",
        retry_after_seconds=5.0,
    )

    assert started["schemaVersion"] == OBSERVABILITY_EVENT_SCHEMA
    assert completed["attributes"]["durationMs"] == 12.346
    assert validate_worker_observation(started) == []
    assert validate_worker_observation(completed) == []
    schema_validator().validate(started)
    schema_validator().validate(completed)
    serialized = f"{serialize_worker_observation(started)}\n{serialize_worker_observation(completed)}"
    for forbidden in (
        "payload-must-never-be-logged",
        "secret-idempotency-key",
        "lease-token-must-never-be-logged",
        "authorization",
        "prompt",
        "errorMessage",
    ):
        assert forbidden not in serialized


def test_worker_event_validation_refuses_extensions_and_authority_contradictions():
    runtime = WorkerObservabilityRuntimeContext(environment="sandbox", source_revision=REVISION)
    event = create_worker_attempt_completed_observation(
        observable_job(),
        runtime,
        outcome="succeeded",
        duration_ms=1,
    )

    with_payload = {**event, "payload": {"prompt": "private"}}
    assert "top-level allowlist" in serialize_errors(with_payload)

    unpaired_request = json.loads(json.dumps(event))
    unpaired_request["correlation"]["parentSpanId"] = None
    assert "present together" in serialize_errors(unpaired_request)

    contradictory = json.loads(json.dumps(event))
    contradictory["level"] = "error"
    contradictory["attributes"]["errorCode"] = "handler-failed"
    assert "level contradicts outcome" in serialize_errors(contradictory)
    assert "cannot carry an error" in serialize_errors(contradictory)

    unbound_managed = json.loads(json.dumps(event))
    unbound_managed["source"]["revision"] = None
    assert "require an exact source revision" in serialize_errors(unbound_managed)

    invalid_calendar = json.loads(json.dumps(event))
    invalid_calendar["occurredAt"] = "2026-02-31T13:00:00.000Z"
    assert "bounded UTC timestamp" in serialize_errors(invalid_calendar)


def serialize_errors(event):
    try:
        serialize_worker_observation(event)
    except ValueError as error:
        return str(error)
    raise AssertionError("unsafe event was accepted")


class Store:
    def __init__(self, job):
        self.job = job
        self.succeeded = False
        self.events = []

    def claim_one(self, _tasks):
        job, self.job = self.job, None
        return job

    def mark_succeeded(self, _job, _output):
        self.succeeded = True
        return True

    def mark_failed(self, _job, _error, _code):
        return True

    def mark_retryable(self, _job, _error, _code, _retry_after_seconds):
        return "queued"

    def record_event(self, job_id, event, payload):
        self.events.append((job_id, event, payload))


def test_run_once_emits_two_json_lines_and_sink_failure_cannot_change_job_authority():
    handlers = HandlerRegistry()

    @handlers.register("unit.echo")
    def echo(_job):
        return {"ok": True}

    output = io.StringIO()
    store = Store(observable_job())
    clock = iter((10.0, 10.012345))
    assert run_once(
        store,
        handlers,
        observation_sink=create_stdout_worker_observation_sink(output),
        observability_runtime=WorkerObservabilityRuntimeContext(
            environment="ci",
            source_revision=None,
        ),
        monotonic=lambda: next(clock),
    )
    assert store.succeeded is True
    lines = output.getvalue().splitlines()
    assert len(lines) == 2
    assert [json.loads(line)["eventName"] for line in lines] == [
        "worker.job.attempt.started",
        "worker.job.attempt.completed",
    ]
    assert json.loads(lines[1])["attributes"] == {
        "attempt": 2,
        "durationMs": 12.345,
        "errorCode": None,
        "outcome": "succeeded",
        "provider": "local",
        "retryAfterSeconds": None,
        "task": "unit.echo",
    }

    failing_store = Store(observable_job(observability_attempt_id="00000000-0000-4000-8000-000000000003"))
    assert run_once(
        failing_store,
        handlers,
        observation_sink=lambda _event: (_ for _ in ()).throw(RuntimeError("sink unavailable")),
        observability_runtime=WorkerObservabilityRuntimeContext(
            environment="ci",
            source_revision=None,
        ),
    )
    assert failing_store.succeeded is True
