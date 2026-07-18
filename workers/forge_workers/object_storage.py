"""Bounded S3-compatible policy object I/O for the private worker plane.

The worker already receives explicit object-store credentials in its deployment
environment. This module keeps the runtime dependency-free, signs only exact
content-addressed requests, and never exposes credentials or a public worker API.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Callable, Protocol

from forge_workers.faults import PartialObjectUploadError

MAX_POLICY_MODEL_BYTES = 4 * 1024 * 1024
_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_KEY_SEGMENT = re.compile(r"^[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$")


@dataclass(frozen=True)
class ObjectStoreConfig:
    endpoint: str
    region: str
    bucket: str
    access_key_id: str
    secret_access_key: str
    force_path_style: bool
    timeout_s: float


@dataclass(frozen=True)
class StoredPolicyObject:
    bucket: str
    object_key: str
    byte_size: int
    sha256: str
    content_type: str = "application/octet-stream"


class PolicyObjectStore(Protocol):
    def put_policy(self, *, object_key: str, model_bytes: bytes, sha256: str) -> StoredPolicyObject: ...


Transport = Callable[[urllib.request.Request, float], object]


def object_store_config_from_env(env: dict[str, str] | None = None) -> ObjectStoreConfig:
    values = os.environ if env is None else env
    endpoint = values.get("FORGE_OBJECT_ENDPOINT", "http://localhost:9000")
    parsed = urllib.parse.urlsplit(endpoint)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError("FORGE_OBJECT_ENDPOINT must be a credential-free HTTP(S) endpoint")
    bucket = values.get("FORGE_OBJECT_BUCKET", "forge-artifacts")
    if not _BUCKET.fullmatch(bucket):
        raise RuntimeError("FORGE_OBJECT_BUCKET must be an S3-compatible bucket name")
    access_key_id = values.get("FORGE_OBJECT_ACCESS_KEY_ID", values.get("AWS_ACCESS_KEY_ID", "forge"))
    secret_access_key = values.get(
        "FORGE_OBJECT_SECRET_ACCESS_KEY",
        values.get("AWS_SECRET_ACCESS_KEY", "forge-dev-only"),
    )
    production = (
        values.get("NODE_ENV") == "production"
        or values.get("FORGE_DEPLOYMENT_ENVIRONMENT") == "production"
        or values.get("FORGE_ENV") == "production"
    )
    if production:
        if not values.get("FORGE_OBJECT_ENDPOINT") or not values.get("FORGE_OBJECT_BUCKET"):
            raise RuntimeError("production object storage endpoint and bucket must be explicit")
        if (
            not values.get("FORGE_OBJECT_ACCESS_KEY_ID")
            or not values.get("FORGE_OBJECT_SECRET_ACCESS_KEY")
            or access_key_id == "forge"
            or secret_access_key == "forge-dev-only"
            or len(secret_access_key) < 16
        ):
            raise RuntimeError("production object storage requires explicit non-development credentials")
        if parsed.scheme != "https" and values.get("FORGE_OBJECT_ALLOW_INSECURE_INTERNAL") != "1":
            raise RuntimeError("production object storage requires HTTPS unless internal HTTP is explicit")
    try:
        timeout_s = float(values.get("FORGE_OBJECT_WRITE_TIMEOUT_S", "30"))
    except ValueError as exc:
        raise RuntimeError("FORGE_OBJECT_WRITE_TIMEOUT_S is invalid") from exc
    if not 1 <= timeout_s <= 120:
        raise RuntimeError("FORGE_OBJECT_WRITE_TIMEOUT_S must be between 1 and 120 seconds")
    return ObjectStoreConfig(
        endpoint=endpoint.rstrip("/"),
        region=values.get("FORGE_OBJECT_REGION", values.get("AWS_REGION", "us-east-1")),
        bucket=bucket,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        force_path_style=values.get("FORGE_OBJECT_FORCE_PATH_STYLE", "1") != "0",
        timeout_s=timeout_s,
    )


class S3PolicyObjectStore:
    def __init__(
        self,
        config: ObjectStoreConfig | None = None,
        *,
        transport: Transport | None = None,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.config = config or object_store_config_from_env()
        self._transport = transport or _urlopen
        self._now = now or (lambda: datetime.now(UTC))

    def put_policy(self, *, object_key: str, model_bytes: bytes, sha256: str) -> StoredPolicyObject:
        _validate_policy_object(object_key, model_bytes, sha256)
        checksum = base64.b64encode(bytes.fromhex(sha256)).decode("ascii")
        response = self._request(
            "PUT",
            object_key,
            body=model_bytes,
            extra_headers={
                "content-type": "application/octet-stream",
                "x-amz-checksum-sha256": checksum,
            },
        )
        _close_response(response)
        return StoredPolicyObject(
            bucket=self.config.bucket,
            object_key=object_key,
            byte_size=len(model_bytes),
            sha256=sha256,
        )

    def read_policy(self, *, object_key: str, byte_size: int, sha256: str) -> bytes:
        if not 0 < byte_size <= MAX_POLICY_MODEL_BYTES or not _SHA256.fullmatch(sha256):
            raise RuntimeError("policy object read authority is invalid")
        _validate_object_key(object_key)
        response = self._request("GET", object_key, body=b"", extra_headers={})
        try:
            data = response.read(byte_size + 1)  # type: ignore[attr-defined]
        except Exception as exc:  # noqa: BLE001 - storage transport is untrusted.
            raise PartialObjectUploadError("object storage policy download failed") from exc
        finally:
            _close_response(response)
        if len(data) != byte_size or hashlib.sha256(data).hexdigest() != sha256:
            raise PartialObjectUploadError("object storage policy download failed exact verification")
        return data

    def _request(
        self,
        method: str,
        object_key: str,
        *,
        body: bytes,
        extra_headers: dict[str, str],
    ) -> object:
        _validate_object_key(object_key)
        timestamp = self._now().astimezone(UTC)
        amz_date = timestamp.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = timestamp.strftime("%Y%m%d")
        url, host, canonical_uri = _object_url(self.config, object_key)
        payload_hash = hashlib.sha256(body).hexdigest()
        canonical_headers_map = {
            "host": host,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
            **{key.lower(): value.strip() for key, value in extra_headers.items()},
        }
        signed_header_names = sorted(canonical_headers_map)
        canonical_headers = "".join(f"{name}:{canonical_headers_map[name]}\n" for name in signed_header_names)
        signed_headers = ";".join(signed_header_names)
        canonical_request = "\n".join(
            [method, canonical_uri, "", canonical_headers, signed_headers, payload_hash]
        )
        scope = f"{date_stamp}/{self.config.region}/s3/aws4_request"
        string_to_sign = "\n".join(
            [
                "AWS4-HMAC-SHA256",
                amz_date,
                scope,
                hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
            ]
        )
        signing_key = _signature_key(self.config.secret_access_key, date_stamp, self.config.region)
        signature = hmac.new(signing_key, string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
        authorization = (
            f"AWS4-HMAC-SHA256 Credential={self.config.access_key_id}/{scope}, "
            f"SignedHeaders={signed_headers}, Signature={signature}"
        )
        request = urllib.request.Request(
            url,
            data=body if method == "PUT" else None,
            method=method,
            headers={
                **canonical_headers_map,
                "authorization": authorization,
                **({"content-length": str(len(body))} if method == "PUT" else {}),
            },
        )
        try:
            return self._transport(request, self.config.timeout_s)
        except urllib.error.HTTPError as exc:
            retry_after = exc.headers.get("retry-after") if exc.headers else None
            message = f"object storage {method} failed with HTTP {exc.code}"
            if exc.code in {408, 425, 429} or 500 <= exc.code <= 599:
                error = PartialObjectUploadError(message)
                if retry_after and retry_after.isdigit():
                    error.retry_after_seconds = min(float(retry_after), 900.0)
                raise error from exc
            raise RuntimeError(message) from exc
        except (OSError, TimeoutError) as exc:
            raise PartialObjectUploadError(f"object storage {method} transport failed") from exc


def _urlopen(request: urllib.request.Request, timeout_s: float) -> object:
    return urllib.request.urlopen(request, timeout=timeout_s)  # noqa: S310 - endpoint is explicit deployment config.


def _object_url(config: ObjectStoreConfig, object_key: str) -> tuple[str, str, str]:
    parsed = urllib.parse.urlsplit(config.endpoint)
    encoded_key = urllib.parse.quote(object_key, safe="/-_.~")
    base_path = parsed.path.rstrip("/")
    if config.force_path_style:
        canonical_uri = f"{base_path}/{config.bucket}/{encoded_key}" or "/"
        host = parsed.netloc
    else:
        canonical_uri = f"{base_path}/{encoded_key}" or "/"
        port = f":{parsed.port}" if parsed.port else ""
        host = f"{config.bucket}.{parsed.hostname}{port}"
    return urllib.parse.urlunsplit((parsed.scheme, host, canonical_uri, "", "")), host, canonical_uri


def _signature_key(secret: str, date_stamp: str, region: str) -> bytes:
    date_key = hmac.new(("AWS4" + secret).encode("utf-8"), date_stamp.encode("utf-8"), hashlib.sha256).digest()
    region_key = hmac.new(date_key, region.encode("utf-8"), hashlib.sha256).digest()
    service_key = hmac.new(region_key, b"s3", hashlib.sha256).digest()
    return hmac.new(service_key, b"aws4_request", hashlib.sha256).digest()


def _validate_policy_object(object_key: str, model_bytes: bytes, sha256: str) -> None:
    _validate_object_key(object_key)
    if not 0 < len(model_bytes) <= MAX_POLICY_MODEL_BYTES:
        raise RuntimeError("policy model bytes are outside the supported range")
    if not _SHA256.fullmatch(sha256) or hashlib.sha256(model_bytes).hexdigest() != sha256:
        raise RuntimeError("policy model bytes do not match their SHA-256 authority")


def _validate_object_key(object_key: str) -> None:
    if (
        not object_key
        or len(object_key) > 1024
        or object_key.startswith("/")
        or ".." in object_key.split("/")
        or not _KEY_SEGMENT.fullmatch(object_key)
    ):
        raise RuntimeError("object key is invalid")


def _close_response(response: object) -> None:
    close = getattr(response, "close", None)
    if callable(close):
        close()


__all__ = [
    "MAX_POLICY_MODEL_BYTES",
    "ObjectStoreConfig",
    "PolicyObjectStore",
    "S3PolicyObjectStore",
    "StoredPolicyObject",
    "object_store_config_from_env",
]
