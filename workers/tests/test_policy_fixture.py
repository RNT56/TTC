import base64
import hashlib

from forge_workers.training.jobs import train_policy
from forge_workers.training.policy_fixture import MODEL_BASE64, MODEL_BYTE_SIZE, MODEL_SHA256


def test_hover_policy_fixture_binds_real_onnx_bytes_and_tensor_contract():
    raw = base64.b64decode(MODEL_BASE64, validate=True)
    assert len(raw) == MODEL_BYTE_SIZE
    assert hashlib.sha256(raw).hexdigest() == MODEL_SHA256

    result = train_policy({"contractHash": "ab" * 32, "seed": 7})
    assert result["scorecard"]["exportable"] is True
    assert result["scorecard"]["estimatorSmoke"] == "passed"
    assert result["io"]["tensor"]["schema"] == "forge-policy-tensor"
    assert result["io"]["tensor"]["schemaVersion"] == "2.0.0"
    assert result["io"]["tensor"]["coordinateFrame"] == "forge-y-up-rh-m"
    assert result["io"]["tensor"]["input"]["shape"] == [1, 14]
    assert result["io"]["tensor"]["output"]["shape"] == [1, 4]
    assert result["onnx"]["modelBase64"] == MODEL_BASE64
    assert result["onnx"]["sha256"] == MODEL_SHA256


def test_non_hover_fixture_stays_held_without_fabricated_model_bytes():
    result = train_policy({"contractHash": "ab" * 32, "seed": 7, "task": "gate-slalom"})
    assert result["scorecard"]["exportable"] is False
    assert "modelBase64" not in result["onnx"]
    assert any("no executable deterministic ONNX fixture" in reason for reason in result["scorecard"]["reasons"])
