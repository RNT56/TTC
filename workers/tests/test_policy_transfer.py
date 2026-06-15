from forge_workers.policy_transfer import assess_policy_transfer


OBS = ["estimator.attitude", "target.error", "battery.normalizedVoltage"]
ACTIONS = ["throttle", "roll", "pitch", "yaw"]


def _policy(**overrides):
    policy = {
        "task": {"id": "gate-slalom", "family": "multirotor"},
        "io": {
            "observations": OBS,
            "actions": ACTIONS,
            "onnxHeader": {"contractHash": "aa" * 32, "archetype": "multirotor", "task": "gate-slalom"},
        },
        "onnx": {"cacheKey": "policy:gate-slalom", "exportable": True},
        "scorecard": {"exportable": True, "task": "gate-slalom"},
    }
    policy.update(overrides)
    return policy


def _target(**overrides):
    target = {
        "contractHash": "bb" * 32,
        "meta": {"archetype": "multirotor"},
        "io": {
            "observations": OBS,
            "actions": ACTIONS,
            "onnxHeader": {"contractHash": "bb" * 32, "archetype": "multirotor"},
        },
    }
    target.update(overrides)
    return target


def test_assessment_allows_direct_transfer_for_matching_exportable_policy():
    result = assess_policy_transfer({"policy": _policy(), "buyerTwin": _target()})

    assert result["status"] == "direct-transfer"
    assert result["directTransfer"]
    assert not result["fineTuneRequired"]
    assert result["fineTuneOffer"] is None
    assert result["compatibility"] == {"archetype": "match", "observations": "match", "actions": "match"}
    assert result["reasons"] == []


def test_assessment_offers_fine_tune_for_archetype_mismatch():
    result = assess_policy_transfer(
        {
            "policy": _policy(),
            "buyerTwin": _target(meta={"archetype": "rover"}, io={"observations": OBS, "actions": ACTIONS}),
        }
    )

    assert result["status"] == "fine-tune-required"
    assert not result["directTransfer"]
    assert result["fineTuneRequired"]
    assert result["fineTuneOffer"]["kind"] == "fine-tune-against-buyer-twin"
    assert result["fineTuneOffer"]["basePolicyCacheKey"] == "policy:gate-slalom"
    assert "archetype mismatch: policy multirotor vs buyer rover" in result["reasons"]


def test_assessment_offers_fine_tune_for_io_layout_mismatch():
    target = _target(io={"observations": [*OBS, "wind.body"], "actions": ACTIONS})

    result = assess_policy_transfer({"policy": _policy(), "buyerTwin": target})

    assert result["status"] == "fine-tune-required"
    assert result["compatibility"]["observations"] == "mismatch"
    assert result["compatibility"]["actions"] == "match"
    assert result["fineTuneOffer"]["requiredEvidence"] == [
        "fresh p7-scorecard-v1",
        "estimator-smoke pass",
        "matching buyer-twin I/O header",
    ]
    assert "observation layout mismatch" in result["reasons"]


def test_assessment_blocks_non_exportable_policy():
    policy = _policy(scorecard={"exportable": False, "task": "gate-slalom"})

    result = assess_policy_transfer({"policy": policy, "buyerTwin": _target()})

    assert result["status"] == "blocked"
    assert not result["directTransfer"]
    assert not result["fineTuneRequired"]
    assert result["fineTuneOffer"] is None
    assert result["reasons"] == ["policy scorecard is not exportable"]


def test_assessment_requires_buyer_twin_io_before_direct_transfer():
    result = assess_policy_transfer({"policy": _policy(), "buyerTwin": {"meta": {"archetype": "multirotor"}}})

    assert result["status"] == "fine-tune-required"
    assert result["compatibility"]["archetype"] == "match"
    assert result["compatibility"]["observations"] == "mismatch"
    assert result["compatibility"]["actions"] == "mismatch"
    assert "buyer twin observation layout missing" in result["reasons"]
    assert "buyer twin action layout missing" in result["reasons"]
