import json

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import DatabaseStore
from app.migration import JsonImportRow, import_json_store
from app.models import RoutineEvent, SchedulePreferences, TaskCreate
from app.scheduler import generate_schedule
from app.storage import JsonStore


def source(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    path = tmp_path / "store.json"
    json_store = JsonStore(path)
    task = json_store.create_task(
        "student",
        TaskCreate(
            title="Exam revision",
            module="Math",
            dueAt="2030-01-05T18:00:00+02:00",
            estimatedMinutes=120,
        ),
    )
    events = [
        RoutineEvent(
            id="holiday",
            title="Holiday",
            allDay=True,
            repeat="once",
            date="2030-01-03",
            timezone="Africa/Johannesburg",
        )
    ]

    json_store.save_routines("student", events)

    plan = generate_schedule(
        "student",
        [task],
        SchedulePreferences(planningStart="2030-01-02", routineEvents=events),
    )

    json_store.save_schedule("student", plan)

    database = DatabaseStore(f'sqlite+pysqlite:///{(tmp_path / "database.db").as_posix()}')

    return path, database, task, events, plan


def test_migration_preserves_ids_activities_and_schedule_and_is_idempotent(tmp_path, monkeypatch):
    path, database, task, events, plan = source(tmp_path, monkeypatch)

    assert import_json_store(database, path) == {
        "users": 1,
        "tasks": 1,
        "schedules": 1,
        "routines": 1,
    }
    assert database.get_task("student", task.id).title == task.title
    assert database.get_routines("student") == events
    assert database.latest_schedule("student").id == plan.id
    assert database.latest_schedule("student").routine_events == events
    assert database.list_tasks("other") == []
    assert import_json_store(database, path) == {"alreadyImported": 1}

    database.save_routines("student", [])

    assert import_json_store(database, path) == {"alreadyImported": 1}
    assert database.get_routines("student") == []


def test_invalid_source_does_not_partially_import(tmp_path, monkeypatch):
    path, database, task, _, _ = source(tmp_path, monkeypatch)
    data = json.loads(path.read_text())

    data["users"]["student"]["tasks"].append({"title": "Invalid task"})
    path.write_text(json.dumps(data))

    with pytest.raises(ValueError):
        import_json_store(database, path)
    assert database.list_tasks("student") == []


def test_nonempty_target_is_not_overwritten(tmp_path, monkeypatch):
    path, database, task, _, _ = source(tmp_path, monkeypatch)
    existing = database.create_task(
        "existing",
        TaskCreate(
            title="Existing work",
            module="Other",
            dueAt="2030-01-05T18:00:00+02:00",
            estimatedMinutes=60,
        ),
    )

    with pytest.raises(RuntimeError, match="not empty"):
        import_json_store(database, path)
    assert database.get_task("existing", existing.id).title == "Existing work"
    assert database.list_tasks("student") == []


def test_changed_source_and_missing_source_fail_safely(tmp_path, monkeypatch):
    path, database, _, _, _ = source(tmp_path, monkeypatch)

    import_json_store(database, path)
    path.write_bytes(path.read_bytes() + b"\n")

    with pytest.raises(RuntimeError, match="changed"):
        import_json_store(database, path)
    with pytest.raises(RuntimeError, match="does not exist"):
        import_json_store(database, tmp_path / "missing.json")


def test_database_error_rolls_back_entire_import(tmp_path, monkeypatch):
    path, database, _, _, _ = source(tmp_path, monkeypatch)
    data = json.loads(path.read_text())
    data["users"]["other"] = {
        "tasks": [data["users"]["student"]["tasks"][0]],
        "schedules": [],
    }

    path.write_text(json.dumps(data))

    with pytest.raises(IntegrityError):
        import_json_store(database, path)
    assert database.list_tasks("student") == []
    assert database.get_routines("student") is None
    with Session(database.engine) as session:
        assert session.get(JsonImportRow, "initial-json-store") is None
