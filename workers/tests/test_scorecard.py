from forge_workers.training.scorecard import Scorecard, gate


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
