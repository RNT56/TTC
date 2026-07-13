import io
import json
import sys

import pytest

from forge_workers.etl.adapters import HttpSourceFetcher
from forge_workers.external import run_json_command
from forge_workers.net_security import assert_bounded_json, validate_public_https_url


class FakeResponse:
    def __init__(self, body: bytes, *, url: str, content_type: str = "application/json", status: int = 200):
        self._body = io.BytesIO(body)
        self._url = url
        self.status = status
        self.headers = {
            "content-type": content_type,
            "content-length": str(len(body)),
        }

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def geturl(self):
        return self._url

    def read(self, size=-1):
        return self._body.read(size)


class FakeOpener:
    def __init__(self, response: FakeResponse):
        self.response = response

    def open(self, _request, *, timeout):
        assert 1 <= timeout <= 120
        return self.response


def public_resolver(_hostname: str, _port: int):
    return ["8.8.8.8", "2606:4700:4700::1111"]


def test_worker_url_policy_rejects_credentials_private_ranges_and_host_drift():
    for candidate in (
        "http://example.test/source",
        "https://user:pass@example.test/source",
        "https://127.0.0.1/source",
        "https://169.254.169.254/latest/meta-data",
        "https://[::1]/source",
    ):
        with pytest.raises(RuntimeError):
            validate_public_https_url(candidate, label="source")
    with pytest.raises(RuntimeError, match="allowlisted"):
        validate_public_https_url(
            "https://example.test/source",
            label="source",
            allowed_hosts=("provider.example.test",),
            resolver=public_resolver,
        )


def test_http_source_fetch_is_https_only_bounded_no_redirect_and_content_typed():
    url = "https://catalog.example.test/motor.json"
    fetcher = HttpSourceFetcher(
        min_interval_s=0,
        max_bytes=1024,
        resolver=public_resolver,
        opener=FakeOpener(FakeResponse(b'{"motor":"x2207"}', url=url)),
    )
    bundle = fetcher.fetch(url)
    assert bundle.body == '{"motor":"x2207"}'
    assert bundle.content_type == "application/json"

    redirected = HttpSourceFetcher(
        min_interval_s=0,
        resolver=public_resolver,
        opener=FakeOpener(FakeResponse(b"{}", url="https://other.example.test/redirect")),
    )
    with pytest.raises(RuntimeError, match="redirect"):
        redirected.fetch(url)

    oversized = FakeResponse(b"x" * 1025, url=url, content_type="text/plain")
    with pytest.raises(RuntimeError, match="byte limit"):
        HttpSourceFetcher(
            min_interval_s=0,
            max_bytes=1024,
            resolver=public_resolver,
            opener=FakeOpener(oversized),
        ).fetch(url)


def test_external_command_output_is_bounded_and_failure_text_is_not_reflected(monkeypatch, tmp_path):
    fail = tmp_path / "fail.py"
    fail.write_text(
        "import sys\nsys.stderr.write('secret=sk-live-123456789')\nsys.exit(7)\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("FORGE_SECURITY_TEST_CMD", f"{sys.executable} {fail}")
    with pytest.raises(RuntimeError, match=r"failed \(exit 7\)") as failed:
        run_json_command("FORGE_SECURITY_TEST_CMD", {"ok": True}, timeout_s=5)
    assert "sk-live" not in str(failed.value)

    large = tmp_path / "large.py"
    large.write_text(
        "import sys\nsys.stdin.read()\nsys.stdout.write('x' * (9 * 1024 * 1024))\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("FORGE_SECURITY_TEST_CMD", f"{sys.executable} {large}")
    with pytest.raises(RuntimeError, match="byte limit"):
        run_json_command("FORGE_SECURITY_TEST_CMD", {"ok": True}, timeout_s=5)


def test_worker_json_guard_rejects_non_finite_and_deep_values():
    with pytest.raises(RuntimeError, match="bounded JSON"):
        assert_bounded_json({"value": float("nan")}, label="payload")
    nested = {"leaf": True}
    for _ in range(30):
        nested = {"next": nested}
    with pytest.raises(RuntimeError, match="nesting"):
        assert_bounded_json(nested, label="payload", max_depth=12)
    assert_bounded_json(json.loads('{"safe":[1,2,3]}'), label="payload")
