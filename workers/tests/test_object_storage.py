import hashlib
from datetime import UTC, datetime

import pytest

from forge_workers.faults import PartialObjectUploadError
from forge_workers.object_storage import (
    MAX_POLICY_MODEL_BYTES,
    ObjectStoreConfig,
    S3PolicyObjectStore,
    object_store_config_from_env,
)


class Response:
    def __init__(self, body: bytes = b"") -> None:
        self.body = body
        self.closed = False

    def read(self, size: int) -> bytes:
        return self.body[:size]

    def close(self) -> None:
        self.closed = True


def config() -> ObjectStoreConfig:
    return ObjectStoreConfig(
        endpoint="https://objects.example.test/storage",
        region="eu-central-1",
        bucket="forge-artifacts",
        access_key_id="fixture-key",
        secret_access_key="fixture-secret-value",
        force_path_style=True,
        timeout_s=12,
    )


def test_production_configuration_fails_closed_for_defaults_and_plain_http():
    with pytest.raises(RuntimeError, match="credentials"):
        object_store_config_from_env(
            {
                "NODE_ENV": "production",
                "FORGE_OBJECT_ENDPOINT": "https://objects.example.test",
                "FORGE_OBJECT_BUCKET": "forge-artifacts",
            }
        )

    with pytest.raises(RuntimeError, match="credentials"):
        object_store_config_from_env(
            {
                "FORGE_DEPLOYMENT_ENVIRONMENT": "production",
                "FORGE_OBJECT_ENDPOINT": "https://objects.example.test",
                "FORGE_OBJECT_BUCKET": "forge-artifacts",
            }
        )
    with pytest.raises(RuntimeError, match="HTTPS"):
        object_store_config_from_env(
            {
                "NODE_ENV": "production",
                "FORGE_OBJECT_ENDPOINT": "http://objects.internal",
                "FORGE_OBJECT_BUCKET": "forge-artifacts",
                "FORGE_OBJECT_ACCESS_KEY_ID": "production-key",
                "FORGE_OBJECT_SECRET_ACCESS_KEY": "production-secret-value",
            }
        )


def test_put_signs_and_writes_only_the_exact_content_addressed_bytes():
    requests = []
    response = Response()

    def transport(request, timeout):
        requests.append((request, timeout))
        return response

    model = b"exact-policy-bytes"
    digest = hashlib.sha256(model).hexdigest()
    store = S3PolicyObjectStore(
        config(),
        transport=transport,
        now=lambda: datetime(2026, 7, 15, 12, 0, tzinfo=UTC),
    )
    result = store.put_policy(
        object_key=f"users/user-1/policy-onnx/{digest}",
        model_bytes=model,
        sha256=digest,
    )

    request, timeout = requests[0]
    headers = {name.lower(): value for name, value in request.header_items()}
    assert request.method == "PUT"
    assert request.full_url.endswith(f"/storage/forge-artifacts/users/user-1/policy-onnx/{digest}")
    assert request.data == model
    assert timeout == 12
    assert headers["x-amz-content-sha256"] == digest
    assert headers["authorization"].startswith("AWS4-HMAC-SHA256 Credential=fixture-key/")
    assert "fixture-secret-value" not in headers["authorization"]
    assert result.byte_size == len(model)
    assert result.sha256 == digest
    assert response.closed


def test_put_refuses_digest_substitution_before_transport():
    store = S3PolicyObjectStore(config(), transport=lambda _request, _timeout: Response())
    with pytest.raises(RuntimeError, match="SHA-256 authority"):
        store.put_policy(
            object_key="users/user-1/policy-onnx/not-the-digest",
            model_bytes=b"policy",
            sha256="0" * 64,
        )


def test_read_is_bounded_and_rejects_truncation_or_substitution():
    model = b"retained-policy"
    digest = hashlib.sha256(model).hexdigest()
    key = f"users/user-1/policy-onnx/{digest}"
    exact = Response(model)
    store = S3PolicyObjectStore(config(), transport=lambda _request, _timeout: exact)
    assert store.read_policy(object_key=key, byte_size=len(model), sha256=digest) == model
    assert exact.closed

    tampered = S3PolicyObjectStore(config(), transport=lambda _request, _timeout: Response(b"wrong-policy!!"))
    with pytest.raises(PartialObjectUploadError, match="exact verification"):
        tampered.read_policy(object_key=key, byte_size=len(model), sha256=digest)

    with pytest.raises(RuntimeError, match="read authority"):
        store.read_policy(object_key=key, byte_size=MAX_POLICY_MODEL_BYTES + 1, sha256=digest)
