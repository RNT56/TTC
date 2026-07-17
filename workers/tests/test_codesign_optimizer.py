import pytest

from forge_workers.codesign import evaluate


def test_codesign_ladder_returns_admitted_pareto_points_under_course_constraints():
    result = evaluate(
        {
            "modelId": "quad-course",
            "candidateBudget": 200,
            "constraints": {
                "maxMassG": 850,
                "minEnduranceMin": 8,
                "maxTaskTimeS": 21,
                "minScore": 0.70,
            },
        }
    )

    assert result["optimizer"]["candidateBudget"] == 200
    assert result["schemaVersion"] == "forge-codesign-evaluation/1.0.0"
    assert result["optimizer"]["tier0BudgetMs"] == 50
    assert result["benchmark"]["tier0MaxMs"] < 50
    assert result["benchmark"]["tier2CandidateBudget"] == 200
    assert len(result["pareto"]) >= 3
    assert all(candidate["admitted"] for candidate in result["pareto"])
    assert all(candidate["admission"]["pass"] for candidate in result["pareto"])
    assert any(candidate["tier"] == "training-finalist" for candidate in result["candidates"])


def test_codesign_constraints_hold_impossible_candidates_out_of_pareto_front():
    result = evaluate(
        {
            "modelId": "impossible-course",
            "candidateBudget": 24,
            "constraints": {
                "maxMassG": 650,
                "minEnduranceMin": 12,
                "maxTaskTimeS": 12,
                "minScore": 0.95,
            },
        }
    )

    assert result["pareto"] == []
    assert any(not candidate["admitted"] for candidate in result["candidates"])
    assert any("tier2:" in reason for candidate in result["candidates"] for reason in candidate["admission"]["reasons"])


def test_codesign_candidate_prefix_is_stable_when_budget_expands():
    small = evaluate({"modelId": "stable", "candidateBudget": 12})
    wide = evaluate({"modelId": "stable", "candidateBudget": 24})

    assert small["candidates"] == wide["candidates"][:12]


def test_external_codesign_output_is_never_passed_through_without_exact_authority(monkeypatch):
    monkeypatch.setattr(
        "forge_workers.codesign.run_json_command",
        lambda *_args, **_kwargs: {"artifactKind": "codesign", "candidates": []},
    )

    with pytest.raises(ValueError, match="fields are not exact"):
        evaluate({"modelId": "untrusted"})
