from forge_workers.training.scorecard import Scorecard, gate
from forge_workers.training.tasks import task_definition, task_definition_hash, task_ids


def card(**overrides):
    base = dict(
        task="hover-hold",
        task_version="1.0.0",
        success_rate=0.94,
        robustness={"mass+15%": 0.88, "kv-8%": 0.91, "wind4ms": 0.80},
        energy_wh=2.1,
        trained_on_estimator=True,
        lineage={"contractHash": "ab" * 32, "seed": "7"},
    )
    base.update(overrides)
    return Scorecard(**base)


def test_passing_card_exports():
    result = gate(card())
    assert result.exportable, result.reasons


def test_estimator_smoke_rejects_ground_truth_training():
    result = gate(card(trained_on_estimator=False))
    assert not result.exportable
    assert any("SIM-004" in r for r in result.reasons)


def test_sub_threshold_does_not_export():
    result = gate(card(success_rate=0.5))
    assert not result.exportable


def test_weak_grid_cell_blocks_export():
    result = gate(card(robustness={"mass+15%": 0.2}))
    assert not result.exportable
    assert any("mass+15%" in r for r in result.reasons)


def test_missing_robustness_grid_blocks_export():
    result = gate(card(robustness={}))
    assert not result.exportable
    assert any("robustness grid missing" in r for r in result.reasons)


def test_missing_energy_blocks_export():
    result = gate(card(energy_wh=0.0))
    assert not result.exportable
    assert any("energyWh" in r for r in result.reasons)


def test_missing_lineage_is_prv_002():
    result = gate(card(lineage={}))
    assert not result.exportable
    assert any("PRV-002" in r for r in result.reasons)


def test_versioned_task_definitions_cover_expected_suites_and_bind_executable_semantics():
    assert set(task_ids()) == {
        "gate-slalom",
        "hover-hold",
        "line-follow",
        "obstacle-course",
        "push-recovery",
        "reach-track",
        "rough-terrain",
        "velocity-tracking",
        "walk-to-target",
        "waypoint-chain",
    }
    for task_id in task_ids():
        spec = task_definition(task_id)
        ground = task_id in {"line-follow", "walk-to-target"}
        assert spec["suite"] == ("p7-ground-v1" if ground else "p7-v3")
        assert spec["version"] == ("1.0.0" if ground else "3.0.0")
        assert spec["coordinateFrame"] == "forge-y-up-rh-m"
        assert spec["definitionHash"] == task_definition_hash(spec)
        assert spec["observations"]
        assert spec["actions"]
        assert spec["reward"]
        assert spec["termination"]
        assert spec["success"]

    hover = task_definition("hover-hold")
    assert "estimator.linearVelocity" in hover["observations"]
    assert hover["reward"]["schema"] == "p7-multirotor-reward-v1"
    assert hover["reward"]["control"]["mode"] == "normalized-flight-target-v1"
    assert hover["env"]["spawn"]["pose"][:3] == [0, 1.2, 0]
    assert hover["env"]["targets"][0]["xyz"] == [0, 1.5, 0]
    waypoint = task_definition("waypoint-chain")
    assert waypoint["env"]["spawn"]["pose"][:3] == [-10, 1.2, 0]
    assert [target["xyz"] for target in waypoint["env"]["targets"]] == [
        [-4, 2, 2],
        [3, 2.5, -3],
        [10, 1.8, 0],
    ]
    rover = task_definition("line-follow")
    assert rover["reward"]["schema"] == "p7-ground-reward-v1"
    assert rover["reward"]["control"]["mode"] == "differential-drive-torque-v1"
    quadruped = task_definition("walk-to-target")
    assert quadruped["reward"]["control"]["mode"] == "normalized-joint-torque-v1"
