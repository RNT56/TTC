"""Scorecards — the policy gatekeeper artifact (plan §7.5).

Sub-threshold policies do not export; policies trained on ground truth are
rejected (estimator smoke, D8 / SIM-004). The SB3 pipeline that *produces*
scorecards lands at P7; the gate itself is real now.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Scorecard:
    task: str
    task_version: str
    success_rate: float
    """Success across the nominal evaluation episodes, 0..1."""
    robustness: dict[str, float] = field(default_factory=dict)
    """Success rate per randomization-grid cell (mass+15%, kv-8%, …)."""
    energy_wh: float = 0.0
    trained_on_estimator: bool = True
    """False = the policy observed ground truth during training (D8 violation)."""
    lineage: dict[str, str] = field(default_factory=dict)
    """contractHash, lockfileHash, configHash, codeVersion, seed — PRV-002."""


@dataclass(frozen=True)
class GateResult:
    exportable: bool
    reasons: list[str]


# Default thresholds *(provisional — frozen per task version with P7 data)*.
DEFAULT_MIN_SUCCESS = 0.85
DEFAULT_MIN_ROBUST = 0.70
REQUIRED_LINEAGE = ("contractHash", "seed")


def gate(card: Scorecard,
         min_success: float = DEFAULT_MIN_SUCCESS,
         min_robust: float = DEFAULT_MIN_ROBUST) -> GateResult:
    """The export gate: estimator smoke (SIM-004), thresholds, lineage (PRV-002)."""
    reasons: list[str] = []
    if not card.trained_on_estimator:
        reasons.append(
            "SIM-004 estimator_smoke: policy trained on ground truth (D8)"
        )
    if card.success_rate < min_success:
        reasons.append(
            f"success_rate {card.success_rate:.2f} < {min_success:.2f}"
        )
    weak = [k for k, v in card.robustness.items() if v < min_robust]
    if weak:
        reasons.append(
            f"robustness below {min_robust:.2f} in grid cells: {', '.join(sorted(weak))}"
        )
    missing = [k for k in REQUIRED_LINEAGE if k not in card.lineage]
    if missing:
        reasons.append(f"PRV-002 lineage missing: {', '.join(missing)}")
    return GateResult(exportable=not reasons, reasons=reasons)
