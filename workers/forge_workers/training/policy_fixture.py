"""Digest-bound keyless ONNX fixture shared by the Python training lane.

The byte payload is the same generated opset-18 Gemm+Tanh graph asserted by the
gateway fixture. Duplicate language constants are pinned by independent SHA-256
tests so drift fails closed instead of silently changing policy behavior.
"""

from __future__ import annotations

import copy

MODEL_BASE64 = (
    "CAoSCUZvcmdlZFRUQxoRcDctMDA4LWZpeHR1cmUtdjE6qwMKPwoMb2JzZXJ2YXRpb25zCg1wb2xpY3kud2VpZ2h0Cgtwb2xpY3kuYmlhcxINcG9saWN5LmxpbmVhciIER2VtbQoeCg1wb2xpY3kubGluZWFyEgdhY3Rpb25zIgRUYW5oEh1mb3JnZS1ob3Zlci1wb2xpY3ktZml4dHVyZS12MSrIAQgLCAQQAUINcG9saWN5LndlaWdodEqwAQAAAAAzM7O+AAAAAAAAAAAAAAAAAAAAADMzs74AAAAAAAAAAAAAAAAAAAAAmpmZvgAAAACamRm+AAAAAAAAAAAAAAAAAAAAAJqZGb4AAAAAAAAAAAAAAAAAAAAAmpkZvgAAAADNzAw/AAAAAAAAAADNzEw/AAAAAAAAAAAAAAAAAAAAAAAAAADNzAw/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKiMIBBABQgtwb2xpY3kuYmlhc0oQAAAAAAAAAAAAAAAAAAAAAFoeCgxvYnNlcnZhdGlvbnMSDgoMCAESCAoCCAEKAggLYhkKB2FjdGlvbnMSDgoMCAESCAoCCAEKAggEQgQKABAScikKEmZvcmdlLnRlbnNvclNjaGVtYRITZm9yZ2UtcG9saWN5LXRlbnNvcnIcChNmb3JnZS50ZW5zb3JWZXJzaW9uEgUxLjAuMHK7AgoRZm9yZ2UuaW5wdXRMYXlvdXQSpQJlc3RpbWF0b3IuYXR0aXR1ZGUucm9sbFJhZCxlc3RpbWF0b3IuYXR0aXR1ZGUucGl0Y2hSYWQsZXN0aW1hdG9yLmF0dGl0dWRlLnlhd1JhZCxlc3RpbWF0b3IuYW5ndWxhclJhdGUucm9sbFJhZFMsZXN0aW1hdG9yLmFuZ3VsYXJSYXRlLnBpdGNoUmFkUyxlc3RpbWF0b3IuYW5ndWxhclJhdGUueWF3UmFkUyx0YXJnZXQuZXJyb3IuYm9keVhNLHRhcmdldC5lcnJvci5ib2R5WU0sdGFyZ2V0LmVycm9yLmJvZHlaTSxiYXR0ZXJ5Lm5vcm1hbGl6ZWRWb2x0YWdlLHBvd2VydHJhaW4ubm9ybWFsaXplZE1vdG9yQ3VycmVudHItChJmb3JnZS5vdXRwdXRMYXlvdXQSF3Rocm90dGxlLHJvbGwscGl0Y2gseWF3"
)
MODEL_SHA256 = "222102cc9a55192f00696399f553781ffc095f6fc0e3195d7456fed01a564d62"
MODEL_BYTE_SIZE = 906
INPUT_LAYOUT = [
    "estimator.attitude.rollRad",
    "estimator.attitude.pitchRad",
    "estimator.attitude.yawRad",
    "estimator.angularRate.rollRadS",
    "estimator.angularRate.pitchRadS",
    "estimator.angularRate.yawRadS",
    "target.error.bodyXM",
    "target.error.bodyYM",
    "target.error.bodyZM",
    "battery.normalizedVoltage",
    "powertrain.normalizedMotorCurrent",
]
OUTPUT_LAYOUT = ["throttle", "roll", "pitch", "yaw"]

_FIXTURE = {
    "target": {"xyzM": [0.0, 1.5, 0.0]},
    "tensor": {
        "schema": "forge-policy-tensor",
        "schemaVersion": "1.0.0",
        "coordinateFrame": "forge-y-up-rh-m",
        "input": {"name": "observations", "shape": [1, 11], "layout": INPUT_LAYOUT},
        "output": {"name": "actions", "shape": [1, 4], "layout": OUTPUT_LAYOUT},
        "rateHz": 50,
    },
    "onnx": {
        "opset": 18,
        "fixture": True,
        "byteSize": MODEL_BYTE_SIZE,
        "sha256": MODEL_SHA256,
        "modelBase64": MODEL_BASE64,
    },
}


def hover_policy_fixture() -> dict:
    return copy.deepcopy(_FIXTURE)
