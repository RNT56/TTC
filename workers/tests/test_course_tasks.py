from forge_workers.training.jobs import train_policy
from forge_workers.training.tasks import course_task_definition


def fixture_course():
    return {
        "id": "fixture-slalom",
        "name": "Fixture slalom",
        "kind": "slalom",
        "boundsM": [20, 6, 20],
        "terrain": {"kind": "flat"},
        "tasks": ["gate-slalom"],
        "spawns": [{"id": "start", "pose": {"p": [0, 0, 0]}, "archetypeFilter": ["multirotor"]}],
        "gates": [{"id": "g1", "pose": {"p": [4, 1, 0]}, "widthM": 1.2, "heightM": 0.8}],
        "win": {"gateOrder": ["g1"], "timeLimitS": 30, "contactPenalties": True},
    }


def test_env_spec_compiles_to_p7_task_shape_without_conversion_work():
    task = course_task_definition(fixture_course())

    assert task["id"] == "course:fixture-slalom"
    assert task["suite"] == "p7-v1"
    assert task["source"] == "course"
    assert task["sourceTask"] == "gate-slalom"
    assert task["family"] == "multirotor"
    assert task["horizonS"] == 30.0
    assert task["course"] == {"id": "fixture-slalom", "name": "Fixture slalom", "version": "1.0.0"}
    assert task["env"]["boundsM"] == [20, 6, 20]
    assert task["env"]["gates"][0]["center"] == [4, 1, 0]
    assert task["reward"]["gateOrder"] == ["g1"]


def test_train_policy_accepts_env_spec_as_task_source():
    result = train_policy({"contractHash": "ab" * 32, "seed": 7, "envSpec": fixture_course()})

    assert result["task"]["id"] == "course:fixture-slalom"
    assert result["task"]["sourceTask"] == "gate-slalom"
    assert result["task"]["reward"]["timeLimitS"] == 30.0
    assert result["io"]["onnxHeader"]["task"] == "course:fixture-slalom"
    assert result["scorecard"]["task"] == "course:fixture-slalom"
