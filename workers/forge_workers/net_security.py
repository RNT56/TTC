"""Fail-closed network and JSON boundaries for deployment-owned worker adapters."""

from __future__ import annotations

import ipaddress
import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from forge_workers.faults import ProviderRateLimitError, ProviderUnavailableError

DEFAULT_HTTP_BYTES = 2 * 1024 * 1024
MAX_JSON_DEPTH = 24
MAX_JSON_NODES = 50_000

AddressResolver = Callable[[str, int], Sequence[str]]


def _default_resolver(hostname: str, port: int) -> Sequence[str]:
    return sorted(
        {
            str(record[4][0])
            for record in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        }
    )


def validate_public_https_url(
    raw: str,
    *,
    label: str,
    allowed_hosts: Sequence[str] = (),
    resolver: AddressResolver = _default_resolver,
) -> urllib.parse.SplitResult:
    try:
        parsed = urllib.parse.urlsplit(raw)
        port = parsed.port or 443
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"{label} must be an absolute HTTPS URL") from exc
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if (
        parsed.scheme != "https"
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        raise RuntimeError(f"{label} must be credential-free HTTPS without a fragment")
    if hostname == "localhost" or hostname.endswith((".localhost", ".local")):
        raise RuntimeError(f"{label} resolves to a private host")
    normalized_allowlist = {host.rstrip(".").lower() for host in allowed_hosts}
    if normalized_allowlist and hostname not in normalized_allowlist:
        raise RuntimeError(f"{label} host is not allowlisted")
    try:
        literal = ipaddress.ip_address(hostname)
        addresses = [literal]
    except ValueError:
        try:
            addresses = [ipaddress.ip_address(value) for value in resolver(hostname, port)]
        except (OSError, ValueError) as exc:
            raise RuntimeError(f"{label} host resolution failed") from exc
    if not addresses or any(not address.is_global for address in addresses):
        raise RuntimeError(f"{label} resolves to a private or reserved address")
    return parsed


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201
        return None


def fetch_public_https(
    request: urllib.request.Request,
    *,
    label: str,
    timeout_s: float,
    max_bytes: int = DEFAULT_HTTP_BYTES,
    allowed_content_types: Sequence[str],
    allowed_hosts: Sequence[str] = (),
    resolver: AddressResolver = _default_resolver,
    opener: Any | None = None,
) -> tuple[bytes, str]:
    parsed = validate_public_https_url(
        request.full_url,
        label=label,
        allowed_hosts=allowed_hosts,
        resolver=resolver,
    )
    timeout = max(1.0, min(float(timeout_s), 120.0))
    size_limit = max(1024, min(int(max_bytes), 8 * 1024 * 1024))
    transport = opener or urllib.request.build_opener(_NoRedirect())
    try:
        with transport.open(request, timeout=timeout) as response:
            if int(getattr(response, "status", 200)) < 200 or int(getattr(response, "status", 200)) >= 300:
                raise RuntimeError(f"{label} failed")
            final = urllib.parse.urlsplit(response.geturl())
            if final.hostname != parsed.hostname or final.scheme != parsed.scheme:
                raise RuntimeError(f"{label} redirects are not allowed")
            declared = response.headers.get("content-length")
            if declared and int(declared) > size_limit:
                raise RuntimeError(f"{label} response exceeds the byte limit")
            content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            if not any(
                content_type == allowed or (allowed.endswith("/*") and content_type.startswith(allowed[:-1]))
                for allowed in allowed_content_types
            ):
                raise RuntimeError(f"{label} returned an unsupported content type")
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = response.read(min(64 * 1024, size_limit - total + 1))
                if not chunk:
                    break
                total += len(chunk)
                if total > size_limit:
                    raise RuntimeError(f"{label} response exceeds the byte limit")
                chunks.append(chunk)
            return b"".join(chunks), content_type
    except RuntimeError:
        raise
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raw_retry_after = exc.headers.get("retry-after", "5") if exc.headers is not None else "5"
            try:
                retry_after = float(raw_retry_after)
            except (TypeError, ValueError):
                retry_after = 5.0
            raise ProviderRateLimitError(retry_after) from exc
        raise ProviderUnavailableError(f"{label} request failed") from exc
    except (OSError, urllib.error.URLError) as exc:
        raise ProviderUnavailableError(f"{label} request failed") from exc
    except ValueError as exc:
        raise RuntimeError(f"{label} response was invalid") from exc


def assert_bounded_json(
    value: Any,
    *,
    label: str,
    max_bytes: int = DEFAULT_HTTP_BYTES,
    max_depth: int = MAX_JSON_DEPTH,
    max_nodes: int = MAX_JSON_NODES,
) -> None:
    try:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, RecursionError) as exc:
        raise RuntimeError(f"{label} is not bounded JSON") from exc
    if len(encoded) > max_bytes:
        raise RuntimeError(f"{label} exceeds the byte limit")
    stack: list[tuple[Any, int]] = [(value, 0)]
    nodes = 0
    while stack:
        current, depth = stack.pop()
        nodes += 1
        if nodes > max_nodes:
            raise RuntimeError(f"{label} exceeds the node limit")
        if depth > max_depth:
            raise RuntimeError(f"{label} exceeds the nesting limit")
        if isinstance(current, Mapping):
            if len(current) > 2_000 or any(not isinstance(key, str) or key in {"__proto__", "prototype", "constructor"} for key in current):
                raise RuntimeError(f"{label} contains invalid object keys")
            stack.extend((entry, depth + 1) for entry in current.values())
        elif isinstance(current, (list, tuple)):
            if len(current) > 10_000:
                raise RuntimeError(f"{label} exceeds the array limit")
            stack.extend((entry, depth + 1) for entry in current)
        elif current is not None and not isinstance(current, (str, int, float, bool)):
            raise RuntimeError(f"{label} contains a non-JSON value")
