import hashlib
import json

import pytest

from forge_workers.deployment import assert_deployment_bootstrap

REVISION = "a" * 40


def fixture(tmp_path, environment="staging"):
    manifest = {
        "schemaVersion": "forge-deployment-manifest/1.0.0",
        "environment": environment,
        "status": "active",
        "source": {
            "revision": REVISION,
            "protectedMain": True,
            "worktreeClean": True,
        },
        "artifacts": [{"component": "workers"}],
        "configuration": {
            "values": {
                "FORGE_DEPLOYMENT_ENVIRONMENT": environment,
                "FORGE_SOURCE_REVISION": REVISION,
                "NODE_ENV": "production",
            }
        },
    }
    manifest_bytes = json.dumps(manifest, separators=(",", ":")).encode()
    path = tmp_path / "manifest.json"
    path.write_bytes(manifest_bytes)
    return path, hashlib.sha256(manifest_bytes).hexdigest()


def managed_env(path, digest):
    return {
        "NODE_ENV": "production",
        "FORGE_DEPLOYMENT_ENVIRONMENT": "staging",
        "FORGE_DEPLOYMENT_MANIFEST": str(path),
        "FORGE_DEPLOYMENT_MANIFEST_SHA256": digest,
        "FORGE_SOURCE_REVISION": REVISION,
    }


def test_local_worker_startup_needs_no_managed_authority():
    assert_deployment_bootstrap({"NODE_ENV": "development"})
    with pytest.raises(RuntimeError, match="requires NODE_ENV=production"):
        assert_deployment_bootstrap({"NODE_ENV": "development", "FORGE_DEPLOYMENT_ENVIRONMENT": "staging"})


def test_production_worker_requires_exact_active_manifest_binding(tmp_path):
    path, digest = fixture(tmp_path)
    assert_deployment_bootstrap(managed_env(path, digest))
    with pytest.raises(RuntimeError, match="digest mismatch"):
        assert_deployment_bootstrap(managed_env(path, "b" * 64))
    with pytest.raises(RuntimeError, match="does not authorize"):
        assert_deployment_bootstrap({**managed_env(path, digest), "FORGE_SOURCE_REVISION": "c" * 40})
    manifest = json.loads(path.read_text())
    manifest["artifacts"] = [{"component": "gateway"}]
    manifest_bytes = json.dumps(manifest, separators=(",", ":")).encode()
    path.write_bytes(manifest_bytes)
    with pytest.raises(RuntimeError, match="does not authorize"):
        assert_deployment_bootstrap(managed_env(path, hashlib.sha256(manifest_bytes).hexdigest()))


def test_production_worker_rejects_missing_authority_and_legacy_alias(tmp_path):
    with pytest.raises(RuntimeError, match="requires sandbox, staging, or production"):
        assert_deployment_bootstrap({"NODE_ENV": "production"})
    path, digest = fixture(tmp_path)
    with pytest.raises(RuntimeError, match="rejects legacy FORGE_ENV"):
        assert_deployment_bootstrap({**managed_env(path, digest), "FORGE_ENV": "production"})
