from datetime import date, datetime, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.database import DatabaseStore
from app.models import SchedulePreferences, TaskCreate, TaskUpdate
from app.scheduler import generate_schedule
from app.storage import JsonStore


def task_payload(**changes: object) -> TaskCreate:
    values = {
        "title": "Study algorithms",
        "module": "Computer Science",
        "type": "EXAM",
        "dueAt": "2030-01-04T18:00:00+02:00",
        "priority": 3,
        "difficulty": 4,
        "estimatedMinutes": 90,
        "status": "PENDING",
    }

    values.update(changes)

    return TaskCreate.model_validate(values)


def test_json_store_crud_and_user_isolation(tmp_path) -> None:
    store = JsonStore(tmp_path / "store.json")
    created = store.create_task("user-a", task_payload())

    assert store.list_tasks("user-b") == []
    assert store.get_task("user-a", created.id).title == "Study algorithms"

    updated = store.update_task("user-a", created.id, TaskUpdate(title="Study graph algorithms"))

    assert updated.title == "Study graph algorithms"
    assert updated.updated_at >= created.updated_at

    store.delete_task("user-a", created.id)

    assert store.list_tasks("user-a") == []


def test_local_scheduler_honors_time_window_and_deadline(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    store = JsonStore(tmp_path / "store.json")
    task = store.create_task("student", task_payload())
    preferences = SchedulePreferences(
        planningStart=date(2030, 1, 2),
        planningDays=3,
        dailyStart="17:00",
        dailyEnd="19:00",
        sessionMinutes=45,
        breakMinutes=10,
        timezone="Africa/Johannesburg",
    )

    schedule = generate_schedule("student", [task], preferences)

    assert schedule.source.value == "local_fallback"
    assert sum(session.duration_minutes for session in schedule.sessions) == 90
    assert all(session.start_at.time() >= preferences.daily_start for session in schedule.sessions)
    assert all(session.end_at.time() <= preferences.daily_end for session in schedule.sessions)
    assert all(session.end_at <= task.due_at for session in schedule.sessions)


def test_api_serializes_frontend_field_names(monkeypatch, tmp_path) -> None:
    from app import main

    monkeypatch.setattr(main, "store", JsonStore(tmp_path / "api-store.json"))

    client = TestClient(app)
    response = client.post(
        "/tasks",
        json=task_payload().model_dump(mode="json", by_alias=True),
        headers={"X-User-ID": "mobile-user"},
    )

    assert response.status_code == 201

    body = response.json()

    assert body["estimatedMinutes"] == 90
    assert "dueAt" in body and "createdAt" in body and "updatedAt" in body

    schedule_response = client.post(
        "/schedule/generate",
        json={
            "planningStart": "2030-01-02",
            "planningDays": 3,
            "dailyStart": "17:00",
            "dailyEnd": "19:00",
            "timezone": "Africa/Johannesburg",
        },
        headers={"X-User-ID": "mobile-user"},
    )

    assert schedule_response.status_code == 200
    assert schedule_response.json()["sessions"][0]["taskId"] == body["id"]


def test_local_scheduler_reports_work_that_cannot_fit_before_deadline(
    monkeypatch, tmp_path
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    store = JsonStore(tmp_path / "store.json")
    task = store.create_task(
        "student",
        task_payload(
            dueAt="2030-01-02T17:10:00+02:00",
            estimatedMinutes=30,
        ),
    )
    preferences = SchedulePreferences(
        planningStart=date(2030, 1, 2),
        planningDays=1,
        dailyStart="17:00",
        dailyEnd="19:00",
        timezone="Africa/Johannesburg",
    )

    schedule = generate_schedule("student", [task], preferences)

    assert schedule.sessions == []
    assert any("still needs 30 minute(s)" in warning for warning in schedule.warnings)


def test_database_store_is_ready_for_postgres(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    database_path = (tmp_path / "studysmart.db").as_posix()
    store = DatabaseStore(f"sqlite+pysqlite:///{database_path}")
    task = store.create_task("railway-user", task_payload())

    assert store.list_tasks("another-user") == []
    assert store.get_task("railway-user", task.id).title == "Study algorithms"

    updated = store.update_task("railway-user", task.id, TaskUpdate(status="IN_PROGRESS"))

    assert updated.status.value == "IN_PROGRESS"

    schedule = generate_schedule(
        "railway-user",
        [updated],
        SchedulePreferences(
            planningStart=date(2030, 1, 2),
            planningDays=3,
            dailyStart="17:00",
            dailyEnd="19:00",
            timezone="Africa/Johannesburg",
        ),
    )

    store.save_schedule("railway-user", schedule)

    latest = store.latest_schedule("railway-user")

    assert latest is not None
    assert latest.id == schedule.id
    assert sum(item.duration_minutes for item in latest.sessions) == 90
