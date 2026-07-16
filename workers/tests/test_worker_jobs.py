import pytest

from forge_workers import register_all_handlers
from forge_workers.faults import (
    JobTimeoutError,
    PartialObjectUploadError,
    ProviderRateLimitError,
    ProviderUnavailableError,
    retry_delay_seconds,
)
from forge_workers.object_storage import StoredPolicyObject
from forge_workers.queue import (
    HandlerRegistry,
    Job,
    PostgresQueueStore,
    _prepare_policy_delivery,
    run_once,
    registry,
)
from forge_workers.training.tasks import task_ids


class FakeStore:
    def __init__(self, job: Job | None):
        self.job = job
        self.succeeded: tuple[Job, dict] | None = None
        self.failed: tuple[Job, str, str] | None = None
        self.retried: tuple[Job, str, str, float] | None = None
        self.events: list[tuple[str, str, dict]] = []
        self.claimed_tasks: list[str] = []

    def claim_one(self, tasks):
        self.claimed_tasks = list(tasks)
        job = self.job
        self.job = None
        return job

    def mark_succeeded(self, job: Job, output: dict) -> bool:
        self.succeeded = (job, output)
        return True

    def mark_failed(self, job: Job, error: str, code: str) -> bool:
        self.failed = (job, error, code)
        return True

    def mark_retryable(self, job: Job, error: str, code: str, retry_after_seconds: float) -> str:
        self.retried = (job, error, code, retry_after_seconds)
        if job.attempts >= job.max_attempts:
            self.failed = (job, error, code)
            return "failed"
        return "queued"

    def record_event(self, job_id: str, event: str, payload: dict) -> None:
        self.events.append((job_id, event, payload))


def test_all_standard_tasks_register():
    register_all_handlers()
    assert {
        "etl.ingest-component",
        "occt.tessellate",
        "photoscan.single",
        "photoscan.multiview",
        "train.policy",
        "train.offline-bc",
        "train.sysid-fit",
        "replay.verify",
        "codesign.evaluate",
        "bridge.config-diff",
        "bridge.telemetry-ingest",
        "bridge.supervisor-check",
        "commerce.vendor-refresh",
        "maintenance.estimate-wear",
        "maintenance.crash-forensics",
        "maintenance.repair-sheet",
        "maintenance.fleet-summary",
    }.issubset(set(registry.tasks()))


def test_vendor_refresh_task_routes_through_the_registered_normalizer(monkeypatch):
    monkeypatch.setenv("FORGE_VENDOR_REFRESH_CMD", "fixture-vendor-refresh")
    monkeypatch.setattr(
        "forge_workers.commerce.run_json_command",
        lambda _env, payload, *, timeout_s: payload,
    )
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="vendor-job",
            task="commerce.vendor-refresh",
            payload={
                "componentId": "cmp_motor",
                "offers": [
                    {
                        "vendor": "Fixture Vendor",
                        "sku": "MOTOR-1",
                        "url": "https://vendor.example.test/motor-1",
                        "price": 19.5,
                        "currency": "usd",
                        "availability": "in_stock",
                    }
                ],
            },
            idempotency_key="vendor-refresh-1",
        )
    )

    assert result["artifactKind"] == "vendor-offer-refresh"
    assert result["heldOffers"] == []
    assert result["offers"][0]["componentId"] == "cmp_motor"
    assert result["offers"][0]["currency"] == "USD"
    assert result["offers"][0]["availability"] == "in-stock"


def test_vendor_refresh_materialization_revalidates_and_records_job_provenance(monkeypatch):
    monkeypatch.setenv("FORGE_VENDOR_REFRESH_CMD", "fixture-vendor-refresh")
    monkeypatch.setattr(
        "forge_workers.commerce.run_json_command",
        lambda _env, payload, *, timeout_s: payload,
    )
    register_all_handlers()
    output = registry.dispatch(
        Job(
            id="vendor-job",
            task="commerce.vendor-refresh",
            payload={
                "componentId": "cmp_motor",
                "offers": [
                    {
                        "vendor": "Fixture Vendor",
                        "sku": "MOTOR-1",
                        "url": "https://vendor.example.test/motor-1",
                        "price": 19.5,
                        "currency": "USD",
                        "availability": "in-stock",
                    }
                ],
            },
            idempotency_key="vendor-refresh-1",
        )
    )

    class CaptureConnection:
        def __init__(self):
            self.calls = []

        def execute(self, sql, params):
            self.calls.append((sql, params))

    connection = CaptureConnection()
    store = object.__new__(PostgresQueueStore)
    store._conn = connection
    store._jsonb = lambda value: value
    store._materialize_job_output(
        job_id="vendor-job",
        owner_user_id="user-fixture",
        job_input={"componentId": "cmp_motor"},
        output=output,
    )

    assert len(connection.calls) == 1
    sql, params = connection.calls[0]
    assert "INSERT INTO vendor_offers" in sql
    assert params[:8] == [
        "cmp_motor",
        "Fixture Vendor",
        "MOTOR-1",
        "https://vendor.example.test/motor-1",
        19.5,
        "USD",
        "in-stock",
        "live",
    ]
    assert params[8]["jobId"] == "vendor-job"
    assert params[8]["refreshedBy"] == "user-fixture"
    assert params[8]["normalizedBy"] == "forge-workers"

    bad_output = {**output, "offers": [{**output["offers"][0], "url": "https://127.0.0.1/private"}]}
    with pytest.raises(RuntimeError, match="URL is invalid"):
        store._materialize_job_output(
            job_id="bad-vendor-job",
            owner_user_id="user-fixture",
            job_input={},
            output=bad_output,
        )
    assert len(connection.calls) == 1


def test_policy_delivery_strips_bytes_and_materializes_exact_job_bound_evidence(monkeypatch):
    register_all_handlers()
    output = registry.dispatch(
        Job(
            id="policy-job",
            task="train.policy",
            payload={"contractHash": "ab" * 32, "seed": 7},
            idempotency_key="policy-idempotency",
        )
    )
    job_input = {
        "modelId": "model-1",
        "contractHash": "ab" * 32,
        "modelSnapshot": {"modelId": "model-1", "contractHash": "ab" * 32},
    }
    prepared = _prepare_policy_delivery(
        job_id="policy-job",
        owner_user_id="user-fixture",
        job_input=job_input,
        output=output,
    )
    assert "modelBase64" not in prepared.output["onnx"]
    assert prepared.output["delivery"]["modelRevision"] == {
        "modelId": "model-1",
        "contractHash": "ab" * 32,
    }

    class Result:
        def __init__(self, row):
            self.row = row

        def fetchone(self):
            return self.row

    class CaptureConnection:
        def __init__(self):
            self.calls = []

        def execute(self, sql, params):
            self.calls.append((sql, params))
            if "INSERT INTO object_blobs" in sql:
                return Result({"id": "blob-policy"})
            if "INSERT INTO policy_artifacts" in sql:
                return Result({"id": "policy-artifact"})
            return Result(None)

    connection = CaptureConnection()
    store = object.__new__(PostgresQueueStore)
    store._conn = connection
    store._jsonb = lambda value: value
    stored = StoredPolicyObject(
        bucket="forge-artifacts",
        object_key=prepared.object_key,
        byte_size=prepared.byte_size,
        sha256=prepared.sha256,
    )
    final_output = store._materialize_job_output(
        job_id="policy-job",
        owner_user_id="user-fixture",
        job_input=job_input,
        output=prepared.output,
        prepared_policy=prepared,
        stored_policy=stored,
    )

    assert final_output is not None
    assert final_output["delivery"]["artifactBlobId"] == "blob-policy"
    assert final_output["delivery"]["policyArtifactId"] == "policy-artifact"
    policy_sql, policy_params = next(
        (sql, params) for sql, params in connection.calls if "INSERT INTO policy_artifacts" in sql
    )
    assert "ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO NOTHING" in policy_sql
    assert policy_params[1:4] == ["policy-job", "model-1", "hover-hold"]
    assert "modelBase64" not in policy_params[5]["onnx"]


def test_vendor_refresh_queue_handler_fails_closed_without_a_command(monkeypatch):
    monkeypatch.delenv("FORGE_VENDOR_REFRESH_CMD", raising=False)
    register_all_handlers()
    with pytest.raises(RuntimeError, match="FORGE_VENDOR_REFRESH_CMD is required"):
        registry.dispatch(
            Job(
                id="vendor-job-unconfigured",
                task="commerce.vendor-refresh",
                payload={"componentIds": ["cmp_motor"]},
                idempotency_key="vendor-refresh-unconfigured",
            )
        )


def test_run_once_claims_and_marks_success():
    handlers = HandlerRegistry()

    @handlers.register("unit.echo")
    def _echo(job: Job) -> dict:
        return {"seen": job.payload["value"]}

    store = FakeStore(Job(id="job-1", task="unit.echo", payload={"value": 42}, idempotency_key="idem-1"))
    assert run_once(store, handlers)
    assert store.claimed_tasks == ["unit.echo"]
    assert store.succeeded is not None
    assert store.succeeded[0].id == "job-1"
    assert store.succeeded[1] == {"seen": 42}
    assert store.failed is None
    assert [event for _, event, _ in store.events] == ["started", "succeeded"]


def test_run_once_marks_handler_failure_without_raising():
    handlers = HandlerRegistry()

    @handlers.register("unit.fail")
    def _fail(_job: Job) -> dict:
        raise ValueError("bad payload")

    store = FakeStore(Job(id="job-2", task="unit.fail", payload={}, idempotency_key="idem-2"))
    assert run_once(store, handlers)
    assert store.succeeded is None
    assert store.failed is not None
    assert store.failed[0].id == "job-2"
    assert "ValueError: bad payload" in store.failed[1]
    assert store.failed[2] == "handler-failed"
    assert [event for _, event, _ in store.events] == ["started", "failed"]


def test_run_once_marks_materialization_failure_without_stopping_the_worker():
    handlers = HandlerRegistry()

    @handlers.register("unit.materialize-fail")
    def _output(_job: Job) -> dict:
        return {"artifactKind": "corrupt"}

    class MaterializationFailureStore(FakeStore):
        def mark_succeeded(self, job: Job, output: dict) -> bool:
            raise RuntimeError("materialization rejected")

    store = MaterializationFailureStore(
        Job(id="job-materialize-fail", task="unit.materialize-fail", payload={}, idempotency_key="idem-fail")
    )
    assert run_once(store, handlers)
    assert store.succeeded is None
    assert store.failed is not None
    assert store.failed[0].id == "job-materialize-fail"
    assert "RuntimeError: materialization rejected" in store.failed[1]
    assert [event for _, event, _ in store.events] == ["started", "failed"]


def test_run_once_discards_output_when_withdrawal_cancelled_the_running_job():
    handlers = HandlerRegistry()

    @handlers.register("unit.slow")
    def _slow(_job: Job) -> dict:
        return {"mustNotMaterialize": True}

    class CancelledStore(FakeStore):
        def mark_succeeded(self, job: Job, output: dict) -> bool:
            self.succeeded = None
            return False

    store = CancelledStore(Job(id="job-cancelled", task="unit.slow", payload={}, idempotency_key="idem-cancelled"))
    assert run_once(store, handlers)
    assert store.succeeded is None
    assert [event for _, event, _ in store.events] == ["started", "discarded"]
    assert store.events[-1][2]["reason"] == "job lease is no longer current"


@pytest.mark.parametrize(
    ("fault", "code"),
    [
        (ProviderUnavailableError(), "provider-unavailable"),
        (JobTimeoutError(), "worker-timeout"),
        (PartialObjectUploadError(), "partial-object-upload"),
    ],
)
def test_retryable_faults_schedule_a_new_bounded_attempt(fault, code):
    handlers = HandlerRegistry()

    @handlers.register("unit.transient")
    def _transient(_job: Job) -> dict:
        raise fault

    job = Job(
        id=f"job-{code}",
        task="unit.transient",
        payload={},
        idempotency_key=f"idem-{code}",
        attempts=1,
        lease_token="lease-current",
    )
    store = FakeStore(job)
    assert run_once(store, handlers)
    assert store.failed is None
    assert store.retried is not None
    assert store.retried[2] == code
    assert store.retried[3] == 5.0
    assert [event for _, event, _ in store.events] == ["started", "retry-scheduled"]
    assert store.events[-1][2]["code"] == code


def test_rate_limit_hint_controls_retry_and_attempt_ceiling_fails_closed():
    handlers = HandlerRegistry()

    @handlers.register("unit.rate-limited")
    def _rate_limited(_job: Job) -> dict:
        raise ProviderRateLimitError(37)

    job = Job(
        id="job-rate-limit",
        task="unit.rate-limited",
        payload={},
        idempotency_key="idem-rate-limit",
        attempts=3,
        max_attempts=3,
        lease_token="lease-final",
    )
    store = FakeStore(job)
    assert run_once(store, handlers)
    assert store.retried is not None
    assert store.retried[2:] == ("provider-rate-limited", 37.0)
    assert store.failed is not None
    assert store.failed[2] == "provider-rate-limited"
    assert [event for _, event, _ in store.events] == ["started", "failed"]


def test_retry_delay_is_deterministic_and_caps_untrusted_hints():
    assert retry_delay_seconds(1) == 5.0
    assert retry_delay_seconds(2) == 10.0
    assert retry_delay_seconds(3, 37) == 37.0
    assert retry_delay_seconds(99, 999_999) == 900.0


def test_persisted_attempt_timeout_overrides_untrusted_payload_hint():
    handlers = HandlerRegistry()

    @handlers.register("unit.timeout")
    def _observe_timeout(job: Job) -> dict:
        return {"timeoutS": job.payload["timeoutS"]}

    result = handlers.dispatch(
        Job(
            id="job-timeout-authority",
            task="unit.timeout",
            payload={"timeoutS": 999_999},
            idempotency_key="idem-timeout-authority",
            timeout_seconds=17,
        )
    )
    assert result == {"timeoutS": 17}


def test_photoscan_single_emits_candidate_review_row():
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="j1",
            task="photoscan.single",
            payload={"images": ["obj-front"], "scale": {"mm": 100}, "ports": [{"id": "xt60"}]},
            idempotency_key="scan-1",
        )
    )
    assert result["acceptance"]["pass"]
    assert result["acceptance"]["fitCoveragePct"] >= 70
    assert result["pipeline"][0]["stage"] == "background-removal"
    assert result["pipeline"][1]["provider"] == "fixture-trellis"
    assert result["candidateComponent"]["reviewRequired"]
    assert result["candidateComponent"]["review"]
    assert result["objectCache"]["key"].startswith("photoscan.single:")


def test_photoscan_multiview_requires_multiple_images():
    register_all_handlers()
    with pytest.raises(ValueError, match="at least 2"):
        registry.dispatch(
            Job(
                id="j2",
                task="photoscan.multiview",
                payload={"images": ["obj-front"]},
                idempotency_key="scan-2",
            )
        )


def test_photoscan_multiview_emits_colmap_and_d13_metrics():
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="j2b",
            task="photoscan.multiview",
            payload={"images": ["obj-front", "obj-left", "obj-right"], "scale": 120, "axes": "z"},
            idempotency_key="scan-3",
        )
    )
    assert result["colmap"]["viewCount"] == 3
    assert result["colmap"]["matchedPairs"] == 3
    assert result["pipeline"][1]["provider"] == "fixture-colmap"
    assert result["acceptance"]["hausdorffPct"] <= 1.5
    assert result["alignment"]["knownDimensionMm"] == 120


def test_training_policy_uses_scorecard_gate():
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="j3",
            task="train.policy",
            payload={"contractHash": "ab" * 32, "seed": 7, "successRate": 0.5},
            idempotency_key="train-1",
        )
    )
    assert not result["scorecard"]["exportable"]
    assert result["io"]["onnxHeader"]["actionCount"] == "4"
    assert result["task"]["suite"] == "p7-v3"
    assert result["task"]["version"] == "3.0.0"
    assert result["task"]["coordinateFrame"] == "forge-y-up-rh-m"
    assert len(result["task"]["definitionHash"]) == 64
    assert result["task"]["env"]["targets"]
    assert result["domainRandomization"]["massPct"] == 15
    assert any("success_rate" in reason for reason in result["scorecard"]["reasons"])


def test_training_task_suite_has_versioned_env_definitions():
    expected = {
        "hover-hold",
        "waypoint-chain",
        "gate-slalom",
        "velocity-tracking",
        "walk-to-target",
        "rough-terrain",
        "push-recovery",
        "line-follow",
        "obstacle-course",
        "reach-track",
    }
    assert expected.issubset(set(task_ids()))


def test_offline_bc_builds_sorted_dataset_from_telemetry():
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="j3b",
            task="train.offline-bc",
            payload={
                "task": "gate-slalom",
                "contractHash": "cd" * 32,
                "telemetryLogId": "log-1",
                "tape": {
                    "frames": [
                        {"t": 0.2, "estimator": {"attitude": [0, 0, 0]}, "action": {"throttle": 0.52}},
                        {"t": 0.0, "estimator": {"attitude": [0, 0, 0]}, "action": {"throttle": 0.48}},
                        {"t": 0.1, "target": {"error": [1, 0, 0]}, "cmd": {"yaw": 0.1}},
                    ]
                },
            },
            idempotency_key="bc-1",
        )
    )
    assert result["dataset"]["sampleCount"] == 3
    assert result["dataset"]["durationS"] == 0.2
    assert result["dataset"]["quality"] == "accepted"
    assert result["policyWarmstart"]["compatible"]
    assert "action.throttle" in result["dataset"]["actionColumns"]
    assert "estimator.attitude" in result["dataset"]["observationColumns"]
    assert not result["scorecard"]["exportable"]
    assert "sorted by timestamp" in " ".join(result["notes"])


def test_sysid_requires_samples():
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="j4",
            task="train.sysid-fit",
            payload={"samples": [{"t": 0}, {"t": 1}]},
            idempotency_key="sysid-1",
        )
    )
    assert not result["fit"]["accepted"]


def test_sysid_estimates_r_internal_from_samples():
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="j4b",
            task="train.sysid-fit",
            payload={
                "nominalVoltageV": 16.8,
                "samples": [
                    {"t": 0, "voltageV": 16.4, "currentA": 10},
                    {"t": 1, "voltageV": 16.2, "currentA": 20},
                    {"t": 2, "voltageV": 16.1, "currentA": 20},
                ],
            },
            idempotency_key="sysid-2",
        )
    )
    assert result["fit"]["accepted"]
    assert result["fit"]["rIntMohm"] > 0
    assert result["simPatch"][0]["path"] == "/sim/battery/r_int_mohm"


def test_replay_verification_rejects_tamper_hash():
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="j5",
            task="replay.verify",
            payload={"tape": {"frames": [{"t": 0}, {"t": 1}]}, "expectedHash": "bad"},
            idempotency_key="replay-1",
        )
    )
    assert not result["verified"]
    assert result["rejectReason"] == "replay hash mismatch"


def test_replay_verification_rejects_time_regression():
    register_all_handlers()
    result = registry.dispatch(
        Job(
            id="j5b",
            task="replay.verify",
            payload={"tape": {"frames": [{"t": 1}, {"t": 0}]}},
            idempotency_key="replay-2",
        )
    )
    assert not result["verified"]
    assert result["rejectReason"] == "replay timestamps are not strictly increasing"


def test_geometry_and_codesign_outputs_are_deterministic():
    register_all_handlers()
    geometry = registry.dispatch(
        Job(
            id="j6",
            task="occt.tessellate",
            payload={
                "assetRef": "obj://frame.step",
                "license": {
                    "id": "lic_owner_open",
                    "class": "open",
                    "terms": "owner-authorized manufacturing export",
                    "sourceUrl": "https://example.com/licenses/owner-open",
                    "exportPolicy": "full-geometry-ok",
                },
            },
            idempotency_key="geo-1",
        )
    )
    codesign = registry.dispatch(
        Job(
            id="j7",
            task="codesign.evaluate",
            payload={"modelId": "mdl-test", "candidateBudget": 12},
            idempotency_key="codesign-1",
        )
    )
    codesign_repeat = registry.dispatch(
        Job(
            id="j7b",
            task="codesign.evaluate",
            payload={"modelId": "mdl-test", "candidateBudget": 12},
            idempotency_key="codesign-1b",
        )
    )
    codesign_wide = registry.dispatch(
        Job(
            id="j7c",
            task="codesign.evaluate",
            payload={"modelId": "mdl-test", "candidateBudget": 24},
            idempotency_key="codesign-1c",
        )
    )
    assert geometry["cacheKey"].startswith("occt.tessellate:")
    assert geometry["dfm"]["pass"]
    assert codesign["optimizer"]["algorithm"] == "deterministic-cma-tpe-fixture"
    assert codesign["optimizer"]["candidateBudget"] == 12
    assert len(codesign["candidates"]) == 12
    assert codesign["candidates"] == codesign_repeat["candidates"]
    assert codesign["candidates"] == codesign_wide["candidates"][:12]
    assert len(codesign["pareto"]) >= 1


def test_bridge_config_telemetry_and_supervisor_paths():
    register_all_handlers()
    config = registry.dispatch(
        Job(
            id="j8",
            task="bridge.config-diff",
            payload={"firmware": "betaflight", "mixer": "quadx", "rates": {"failsafe_delay": 10}},
            idempotency_key="bridge-1",
        )
    )
    assert config["schemaVersion"] == "forge-bridge-config/1.0.0"
    assert config["requiresPhysicalConfirmation"]
    assert config["noAutoArm"]
    assert config["firmwareVersion"] == "2025.12"
    assert config["diffHash"] == "0f8173a135515f3759993e7b495e12fbf2f903e667b752bdc226d9612e4736ba"
    assert config["lines"] == [
        "# FORGE generated betaflight 2025.12 config diff",
        "set failsafe_delay = 10",
        "save",
    ]
    with pytest.raises(ValueError, match="exactly firmware, mixer, and rates"):
        registry.dispatch(
            Job(
                id="j8-extra",
                task="bridge.config-diff",
                payload={
                    "firmware": "betaflight",
                    "mixer": "quadx",
                    "rates": {"failsafe_delay": 10},
                    "command": "arm",
                },
                idempotency_key="bridge-extra",
            )
        )
    replay = registry.dispatch(
        Job(
            id="j9",
            task="bridge.telemetry-ingest",
            payload={
                "contractHash": "ab" * 32,
                "training": {"schemaVersion": "forge-offline-training-tape/1.0.0"},
                "samples": [{"t": 1, "x": 1}, {"t": 0, "x": 0}],
            },
            idempotency_key="bridge-2",
        )
    )
    assert replay["frameCount"] == 2
    assert replay["tape"]["frames"][0]["t"] == 0.0
    assert replay["tape"]["header"]["training"] == {
        "schemaVersion": "forge-offline-training-tape/1.0.0"
    }
    supervisor = registry.dispatch(
        Job(
            id="j10",
            task="bridge.supervisor-check",
            payload={"config": {"geofenceRadiusM": 5}, "state": {"positionM": [6, 0, 0]}},
            idempotency_key="bridge-3",
        )
    )
    assert not supervisor["allowPolicy"]
    assert supervisor["reasons"] == ["geofence exceeded"]


def test_maintenance_twin_paths():
    register_all_handlers()
    samples = [
        {"t": 0, "voltageV": 16.8, "currentA": 0, "throttle": 0, "accelG": 1},
        {"t": 60, "voltageV": 15.8, "currentA": 20, "throttle": 0.5, "accelG": 2},
        {"t": 61, "voltageV": 15.7, "currentA": 22, "throttle": 0.2, "accelG": 12},
    ]
    wear = registry.dispatch(
        Job(
            id="j11",
            task="maintenance.estimate-wear",
            payload={"samples": samples, "nominalVoltageV": 16.8, "capacityMah": 1500},
            idempotency_key="maint-1",
        )
    )
    assert wear["packCycles"] > 0
    crash = registry.dispatch(
        Job(
            id="j12",
            task="maintenance.crash-forensics",
            payload={"samples": samples, "thresholdG": 10},
            idempotency_key="maint-2",
        )
    )
    assert crash["crashDetected"]
    sheet = registry.dispatch(
        Job(
            id="j13",
            task="maintenance.repair-sheet",
            payload={
                "damagedNodes": ["arm"],
                "vendorSkus": {"motor": "MOTOR-SKU"},
                "parts": [
                    {"node": "arm", "comp": "arm", "explode": {"t0": 0.2}},
                    {"node": "arm", "comp": "motor", "explode": {"t0": 0.8}},
                ],
            },
            idempotency_key="maint-3",
        )
    )
    assert sheet["steps"][0]["reorderSku"] == "MOTOR-SKU"
    fleet = registry.dispatch(
        Job(
            id="j14",
            task="maintenance.fleet-summary",
            payload={"vehicles": [{"id": "a", "packCycles": 81}, {"id": "b", "status": "critical"}]},
            idempotency_key="maint-4",
        )
    )
    assert fleet["serviceDueCount"] == 1
    assert fleet["criticalCount"] == 1
