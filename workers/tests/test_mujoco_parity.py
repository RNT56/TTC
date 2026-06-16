import json
from io import StringIO

from forge_workers.mujoco_parity import (
    MuJoCoParityRequest,
    baseline_artifact,
    drop_mjcf,
    gait_mjcf,
    hover_mjcf,
    main,
    pendulum_mjcf,
    request_from_payload,
)


def test_request_parsing_defaults_and_rejects_wrong_task():
    request = request_from_payload({"task": "sim.parity", "pendulumLengthM": 0.5})
    assert request.gravity == 9.80665
    assert request.drop_height_m == 1.0
    assert request.pendulum_length_m == 0.5
    assert request.substeps == 4

    try:
        request_from_payload({"task": "train.policy"})
    except ValueError as exc:
        assert "unsupported task" in str(exc)
    else:
        raise AssertionError("wrong task should be rejected")


def test_mujoco_mjcf_fixtures_are_parameterized_from_request():
    request = MuJoCoParityRequest(
        gravity=3.711,
        drop_height_m=2.0,
        pendulum_length_m=0.75,
        driver_dt_s=1.0 / 120.0,
        substeps=2,
    )
    drop = drop_mjcf(request)
    pendulum = pendulum_mjcf(request)
    hover = hover_mjcf(request)
    gait = gait_mjcf(request)

    assert 'model="forge-parity-drop"' in drop
    assert 'gravity="0 0 -3.711"' in drop
    assert 'pos="0 0 2"' in drop
    assert 'timestep="0.00416666666667"' in drop
    assert 'model="forge-parity-pendulum"' in pendulum
    assert 'pos="0 0 -0.75"' in pendulum
    assert 'name="bob_tip"' in pendulum
    assert 'model="forge-parity-hover"' in hover
    assert 'name="hover"' in hover
    assert 'mass="0.1"' in hover
    assert 'model="forge-parity-gait-com"' in gait
    assert 'name="gait"' in gait
    assert 'name="gait_geom"' in gait


def test_baseline_artifact_matches_validator_decode_shape():
    request = MuJoCoParityRequest(hover_trim=0.43, gait_com_m=0.006)
    artifact = baseline_artifact(
        request,
        drop_time_s=0.451,
        pendulum_period_s=1.27,
        hover_trim=0.431,
        gait_com_m=0.0061,
        provider="unit",
    )

    assert artifact["artifactKind"] == "simParityMuJoCoBaseline"
    assert artifact["provider"] == "unit"
    assert artifact["baseline"]["dropHeightM"] == 1.0
    assert artifact["baseline"]["mujocoDropTimeS"] == 0.451
    assert artifact["baseline"]["mujocoHoverTrim"] == 0.431
    assert artifact["baseline"]["mujocoGaitComM"] == 0.0061


def test_command_fails_closed_when_mujoco_is_not_installed(monkeypatch):
    def _missing(_payload):
        raise RuntimeError("MuJoCo Python package is not installed")

    monkeypatch.setattr("forge_workers.mujoco_parity.run_baseline", _missing)
    stdout = StringIO()
    stderr = StringIO()
    code = main(
        stdin=StringIO(json.dumps({"task": "sim.parity"})),
        stdout=stdout,
        stderr=stderr,
    )

    assert code == 2
    assert stdout.getvalue() == ""
    assert "MuJoCo Python package is not installed" in stderr.getvalue()
