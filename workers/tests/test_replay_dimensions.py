from forge_workers.contract import REPLAY_FORMAT_VERSION
from forge_workers.replay import replay_hash, verify_replay


def test_replay_verification_emits_leaderboard_dimensions_from_header():
    tape = {
        "header": {
            "contractHash": "ab" * 32,
            "courseId": "course-1",
            "modelArchetype": "multirotor",
            "boardClass": "open",
            "modelId": "model-1",
            "policyId": "policy-1",
        },
        "frames": [{"t": 0.0}, {"t": 0.5}, {"t": 1.0}],
    }

    result = verify_replay({"tape": tape, "expectedHash": replay_hash(tape), "expectedContractHash": "ab" * 32})

    assert result["verified"]
    assert result["courseId"] == "course-1"
    assert result["archetype"] == "multirotor"
    assert result["class"] == "open"
    assert result["dimensions"] == {
        "courseId": "course-1",
        "archetype": "multirotor",
        "class": "open",
        "modelId": "model-1",
        "policyId": "policy-1",
        "contractHash": "ab" * 32,
    }


def test_replay_verification_payload_dimensions_override_missing_header_values():
    tape = {
        "header": {"contractHash": "cd" * 32},
        "frames": [{"t": 0.0}, {"t": 1.0}],
    }

    result = verify_replay(
        {
            "tape": tape,
            "courseId": "course-2",
            "archetype": "rover",
            "className": "stock",
            "policyId": "policy-2",
        }
    )

    assert result["verified"]
    assert result["dimensions"]["courseId"] == "course-2"
    assert result["dimensions"]["archetype"] == "rover"
    assert result["dimensions"]["class"] == "stock"
    assert result["dimensions"]["policyId"] == "policy-2"


def test_replay_format_accepts_current_and_rejects_unknown_major():
    current = {
        "schemaVersion": REPLAY_FORMAT_VERSION,
        "frames": [{"t": 0.0}, {"t": 1.0}],
    }
    assert verify_replay({"tape": current})["verified"]
    compatible_minor = {**current, "schemaVersion": "1.1.0"}
    assert verify_replay({"tape": compatible_minor})["verified"]

    unsupported = {
        "schemaVersion": "2.0.0",
        "frames": [{"t": 0.0}, {"t": 1.0}],
    }
    result = verify_replay({"tape": unsupported})
    assert not result["verified"]
    assert result["rejectReason"] == "unsupported replay schema version: 2.0.0"
