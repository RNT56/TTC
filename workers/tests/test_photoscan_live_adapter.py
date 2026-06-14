import json
import sys

from forge_workers.photoscan import run_photoscan


def _command(tmp_path, payload):
    script = tmp_path / "photoscan_cmd.py"
    script.write_text(
        "import json, sys\n"
        "json.loads(sys.stdin.read())\n"
        f"print(json.dumps({json.dumps(payload)}))\n"
    )
    return f"{sys.executable} {script}"


def test_single_image_command_output_is_normalized_with_d13_cache_and_slo(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_PHOTOSCAN_CMD",
        _command(
            tmp_path,
            {
                "provider": "live-trellis",
                "cacheKey": "photoscan-live:abc",
                "fitCoveragePct": 74.0,
                "hausdorffPct": 1.1,
                "confidence": 0.81,
                "durationS": 244.0,
                "primitiveRefit": [{"kind": "cylinder", "coveragePct": 41.0}],
            },
        ),
    )

    result = run_photoscan({"images": ["front"], "scale": {"mm": 42}, "axes": "z"}, multiview=False)

    assert result["artifactKind"] == "photoscan"
    assert result["provider"] == "live-trellis"
    assert result["objectCache"] == {"key": "photoscan-live:abc", "provider": "live-trellis", "permanent": True}
    assert result["pipeline"][1]["stage"] == "reconstruction"
    assert result["acceptance"]["pass"]
    assert result["acceptance"]["rejectReasons"] == []
    assert result["slo"] == {"targetS": 300.0, "durationS": 244.0, "pass": True, "cachePermanent": True}
    assert result["candidateComponent"]["reviewRequired"]


def test_command_output_fails_closed_when_d13_metrics_are_missing(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_PHOTOSCAN_CMD",
        _command(tmp_path, {"provider": "live-trellis", "cacheKey": "photoscan-live:missing", "durationS": 120.0}),
    )

    result = run_photoscan({"images": ["front"]}, multiview=False)

    assert not result["acceptance"]["pass"]
    assert result["acceptance"]["meshClassFallback"]
    assert "D13 fit coverage missing" in result["acceptance"]["rejectReasons"]
    assert "D13 Hausdorff metric missing" in result["acceptance"]["rejectReasons"]


def test_multiview_command_uses_colmap_env_and_carries_view_graph(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_COLMAP_CMD",
        _command(
            tmp_path,
            {
                "provider": "live-colmap",
                "cacheKey": "photoscan-live:multi",
                "fitCoveragePct": 82.0,
                "hausdorffPct": 0.9,
                "confidence": 0.86,
                "durationS": 299.0,
                "colmap": {"viewCount": 3, "matchedPairs": 3, "sparsePointCount": 5000, "densePointCount": 90000},
            },
        ),
    )

    result = run_photoscan({"images": ["front", "left", "right"]}, multiview=True)

    assert result["provider"] == "live-colmap"
    assert result["acceptance"]["path"] == "colmap"
    assert result["acceptance"]["pass"]
    assert result["colmap"]["viewCount"] == 3
    assert result["colmap"]["matchedPairs"] == 3
    assert result["slo"]["pass"]
