import json
import sys

from forge_workers.simulation import mjx_benchmark_report


def _rows(*, parity=True, throughput=3.4, cpu_hit=True, tier2_miss=0.0):
    return [
        {
            "morphology": "d12-quad",
            "cpuMujocoStepsPerS": 1000,
            "mjxStepsPerS": 3600,
            "costNormalizedThroughput": throughput,
            "cpuOvernightTargetHit": cpu_hit,
            "tier2BudgetMissPct": tier2_miss,
            "parityPassed": parity,
            "parityMaxErrorPct": 0.8,
        },
        {
            "morphology": "d12-rover",
            "cpuMujocoStepsPerS": 900,
            "mjxStepsPerS": 3300,
            "costNormalizedThroughput": throughput,
            "cpuOvernightTargetHit": True,
            "tier2BudgetMissPct": 0.0,
            "parityPassed": parity,
            "parityMaxErrorPct": 0.6,
        },
        {
            "morphology": "legged",
            "cpuMujocoStepsPerS": 700,
            "mjxStepsPerS": 2500,
            "costNormalizedThroughput": throughput,
            "cpuOvernightTargetHit": True,
            "tier2BudgetMissPct": 0.0,
            "parityPassed": parity,
            "parityMaxErrorPct": 1.0,
        },
    ]


def _command(tmp_path, payload):
    script = tmp_path / "mjx_cmd.py"
    output = json.dumps(payload)
    script.write_text(
        "import json, sys\n"
        "json.loads(sys.stdin.read())\n"
        f"print({output!r})\n"
    )
    return f"{sys.executable} {script}"


def test_mjx_report_fails_closed_without_external_or_payload(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)

    result = mjx_benchmark_report({})

    assert result["artifactKind"] == "mjx-benchmark"
    assert not result["adopt"]
    assert not result["adoptionTriggered"]
    assert "FORGE_MJX_BENCH_CMD is not configured" in result["blockers"][0]
    assert "missing benchmark morphologies" in result["blockers"][1]


def test_mjx_report_does_not_adopt_when_cpu_meets_budget(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)

    result = mjx_benchmark_report({"benchmark": {"provider": "lab", "morphologies": _rows()}})

    assert result["provider"] == "lab"
    assert not result["adoptionTriggered"]
    assert result["decisionEligible"]
    assert not result["adopt"]
    assert result["blockers"] == []
    assert result["decisions"][0]["reasons"] == ["CPU MuJoCo/SB3 met overnight and tier-2 budgets"]


def test_mjx_report_adopts_when_cpu_misses_and_mjx_passes(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)

    result = mjx_benchmark_report(
        {"benchmark": {"provider": "lab", "morphologies": _rows(cpu_hit=False, tier2_miss=31.0)}}
    )

    assert result["adoptionTriggered"]
    assert result["adopt"]
    assert result["blockers"] == []
    assert result["decisions"][0]["adopt"]


def test_mjx_report_blocks_missing_parity_and_low_throughput(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)

    result = mjx_benchmark_report(
        {"benchmark": {"provider": "lab", "morphologies": _rows(parity=False, throughput=2.5, cpu_hit=False)}}
    )

    assert result["adoptionTriggered"]
    assert not result["adopt"]
    assert "one or more MJX runs exceeded frozen parity bands" in result["blockers"]
    assert any("throughput below 3x" in blocker for blocker in result["blockers"])
    assert not result["decisions"][0]["throughputOk"]
    assert not result["decisions"][0]["parityPassed"]


def test_mjx_report_blocks_low_throughput_for_any_required_morphology(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)
    rows = _rows(cpu_hit=False, throughput=3.5)
    rows[1]["costNormalizedThroughput"] = 2.7

    result = mjx_benchmark_report({"benchmark": {"provider": "lab", "morphologies": rows}})

    assert result["adoptionTriggered"]
    assert not result["adopt"]
    assert result["blockers"] == ["MJX throughput below 3x for benchmark morphologies: d12-rover"]


def test_mjx_report_treats_non_finite_measurements_as_failed_evidence(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)
    rows = _rows(cpu_hit=False, throughput=3.5)
    rows[0]["mjxStepsPerS"] = float("nan")
    rows[0].pop("costNormalizedThroughput")

    result = mjx_benchmark_report({"benchmark": {"provider": "lab", "morphologies": rows}})

    assert result["morphologies"][0]["mjxStepsPerS"] == 0.0
    assert not result["adopt"]
    assert any("throughput below 3x" in blocker for blocker in result["blockers"])


def test_mjx_report_requires_all_required_morphologies(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)
    incomplete = _rows(cpu_hit=False)[:2]

    result = mjx_benchmark_report({"benchmark": {"provider": "lab", "morphologies": incomplete}})

    assert result["adoptionTriggered"]
    assert not result["adopt"]
    assert result["blockers"] == ["missing benchmark morphologies: legged"]


def test_mjx_report_normalizes_external_command_output(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "FORGE_MJX_BENCH_CMD",
        _command(tmp_path, {"provider": "live-mjx", "rows": _rows(cpu_hit="false", tier2_miss="28.5")}),
    )

    result = mjx_benchmark_report({"timeoutS": 5})

    assert result["provider"] == "live-mjx"
    assert result["adopt"]
    assert result["morphologies"][0]["cpuOvernightTargetHit"] is False
    assert result["morphologies"][0]["tier2BudgetMissPct"] == 28.5


def test_controlled_feasibility_evidence_remains_decision_ineligible(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)
    source = {
        "provider": "forge-mujoco-mjx-jax",
        "maturity": "controlled-feasibility",
        "sourceRevision": "a" * 40,
        "worktreeClean": True,
        "morphologies": [
            {
                "morphology": "p7-hover-multirotor",
                "cpuMujocoStepsPerS": 50_000,
                "mjxStepsPerS": 8_000,
                "costNormalizedThroughput": None,
                "cpuOvernightTargetHit": None,
                "tier2BudgetMissPct": None,
                "parityPassed": True,
                "sourceBound": True,
                "worktreeClean": True,
                "acceleratorBackend": None,
                "budgetEvidence": False,
                "costEvidence": False,
            }
        ],
    }

    result = mjx_benchmark_report({"benchmark": source})

    assert result["maturity"] == "controlled-feasibility"
    assert result["sourceRevision"] == "a" * 40
    assert not result["adoptionTriggered"]
    assert not result["decisionEligible"]
    assert not result["adopt"]
    assert any("d12-quad, d12-rover, legged" in blocker for blocker in result["blockers"])
    assert any("cost-normalized throughput evidence missing" in blocker for blocker in result["blockers"])
    assert any("declared accelerator evidence missing" in blocker for blocker in result["blockers"])
    assert any("budget evidence missing" in blocker for blocker in result["blockers"])
    assert any("cost evidence missing" in blocker for blocker in result["blockers"])


def test_strict_three_morphology_evidence_can_authorize_the_existing_rule(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)
    rows = _rows(cpu_hit=False, tier2_miss=31.0)
    request_sha = "d" * 64
    for row in rows:
        row.update(
            {
                "sourceBound": True,
                "sourceRevision": "b" * 40,
                "worktreeClean": True,
                "contractSha256": "e" * 64,
                "mjcfSha256": "f" * 64,
                "requestSha256": request_sha,
                "acceleratorBackend": "gpu",
                "budgetEvidence": True,
                "costEvidence": True,
            }
        )
    source = {
        "provider": "declared-gpu-lab",
        "maturity": "sandbox",
        "sourceRevision": "b" * 40,
        "requestSha256": request_sha,
        "worktreeClean": True,
        "morphologies": rows,
    }

    result = mjx_benchmark_report({"benchmark": source})

    assert result["blockers"] == []
    assert result["adoptionTriggered"]
    assert result["decisionEligible"]
    assert result["adopt"]


def test_strict_complete_evidence_can_authorize_rejection_when_cpu_meets_budget(monkeypatch):
    monkeypatch.delenv("FORGE_MJX_BENCH_CMD", raising=False)
    rows = _rows(cpu_hit=True, tier2_miss=0.0)
    request_sha = "1" * 64
    for row in rows:
        row.update(
            {
                "sourceBound": True,
                "sourceRevision": "c" * 40,
                "worktreeClean": True,
                "contractSha256": "2" * 64,
                "mjcfSha256": "3" * 64,
                "requestSha256": request_sha,
                "acceleratorBackend": "gpu",
                "budgetEvidence": True,
                "costEvidence": True,
            }
        )

    result = mjx_benchmark_report(
        {
            "benchmark": {
                "provider": "declared-gpu-lab",
                "maturity": "sandbox",
                "sourceRevision": "c" * 40,
                "requestSha256": request_sha,
                "worktreeClean": True,
                "morphologies": rows,
            }
        }
    )

    assert result["blockers"] == []
    assert result["decisionEligible"]
    assert not result["adoptionTriggered"]
    assert not result["adopt"]
