from datetime import date, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.database import DatabaseStore
from app.models import RoutineEvent, SchedulePreferences, TaskCreate
from app.scheduler import (
    InvalidScheduleError,
    _busy_intervals,
    _validate_ai_draft,
    generate_schedule,
)
from app.models import AIScheduleDraft
from app.storage import ActivitiesChangedError, JsonStore


def holiday(**changes):
    return RoutineEvent.model_validate(
        dict(
            id="holiday",
            title="Family holiday",
            allDay=True,
            repeat="once",
            date="2030-01-02",
            endDate="2030-01-04",
            timezone="Africa/Johannesburg",
            **changes,
        )
    )


def task_payload():
    return TaskCreate.model_validate(
        {
            "title": "Revision",
            "module": "Math",
            "dueAt": "2030-01-10T23:00:00+02:00",
            "estimatedMinutes": 300,
        }
    )


def config(events):
    return SchedulePreferences(
        planningStart=date(2030, 1, 1),
        planningDays=7,
        dailyStart="18:00",
        dailyEnd="21:00",
        routineEvents=events,
    )


@pytest.mark.parametrize("backend", ["json", "sql"])
def test_cloud_routines_and_schedule_snapshot_persist_and_are_user_scoped(
    backend, tmp_path, monkeypatch
):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    create = lambda: (
        JsonStore(tmp_path / "store.json")
        if backend == "json"
        else DatabaseStore(f'sqlite+pysqlite:///{(tmp_path / "store.db").as_posix()}')
    )
    store = create()
    events = [holiday()]

    assert store.get_routines("student") is None

    store.save_routines("student", events)

    assert store.get_routines("other") is None

    created = store.create_task("student", task_payload())
    plan = generate_schedule("student", [created], config(events))

    assert plan.sessions
    assert all(
        s.start_at.date() not in [date(2030, 1, d) for d in (2, 3, 4)] for s in plan.sessions
    )

    store.save_schedule("student", plan)

    reopened = create()

    assert reopened.get_routines("student") == events
    assert reopened.latest_schedule("student").routine_events == events

    reopened.save_routines("student", [])

    assert create().get_routines("student") == []


def test_all_day_timezone_and_selected_weekday_boundaries():

    event = RoutineEvent(
        id="sport",
        title="Away",
        allDay=True,
        repeat="selected",
        daysOfWeek=[3],
        timezone="UTC",
    )
    prefs = config([event])

    assert _busy_intervals(prefs, date(2030, 1, 1)) == []

    start, end = _busy_intervals(prefs, date(2030, 1, 2))[0]

    assert start.isoformat() == "2030-01-02T02:00:00+02:00"
    assert end.isoformat() == "2030-01-03T00:00:00+02:00"
    assert _busy_intervals(prefs, date(2030, 1, 3))[0][1].isoformat() == "2030-01-03T02:00:00+02:00"


def test_activity_across_international_date_line_still_blocks_planning_day():
    event = RoutineEvent(
        id="away",
        title="Holiday",
        allDay=True,
        repeat="once",
        date=date(2030, 1, 4),
        timezone="Pacific/Kiritimati",
    )
    prefs = SchedulePreferences(
        planningStart=date(2030, 1, 2),
        planningDays=1,
        dailyStart="18:00",
        dailyEnd="23:59",
        timezone="Etc/GMT+12",
        routineEvents=[event],
    )
    start, end = _busy_intervals(prefs, date(2030, 1, 2))[0]

    assert start.isoformat() == "2030-01-02T22:00:00-12:00"
    assert end.isoformat() == "2030-01-03T00:00:00-12:00"


@pytest.mark.parametrize("day", [2, 3, 4])
def test_ai_cannot_plan_inside_any_holiday_date(day, tmp_path):
    store = JsonStore(tmp_path / "store.json")
    task = store.create_task("student", task_payload())
    draft = AIScheduleDraft.model_validate(
        {
            "summary": "Conflict",
            "warnings": [],
            "sessions": [
                {
                    "task_id": task.id,
                    "start_at": f"2030-01-{day:02d}T18:00:00+02:00",
                    "end_at": f"2030-01-{day:02d}T18:30:00+02:00",
                    "focus": "Revision",
                }
            ],
        }
    )

    with pytest.raises(InvalidScheduleError, match="overlaps a routine"):
        _validate_ai_draft("student", [task], config([holiday()]), draft, "test")


@pytest.mark.parametrize(
    "changes",
    [
        {"endDate": "2030-01-01"},
        {"allDay": False},
        {"repeat": "daily"},
    ],
)
def test_invalid_holiday_ranges_rejected(changes):
    payload = holiday().model_dump(mode="json", by_alias=True)

    payload.update(changes)

    with pytest.raises(ValidationError):
        RoutineEvent.model_validate(payload)


def test_api_saved_holiday_cannot_be_omitted_by_schedule_request(monkeypatch, tmp_path):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("STUDYSMART_API_TOKEN", raising=False)
    monkeypatch.setattr(main, "store", JsonStore(tmp_path / "api.json"))

    client = TestClient(main.app)
    headers = {"X-User-ID": "student"}
    events = [holiday().model_dump(mode="json", by_alias=True)]

    assert (
        client.put("/routines", headers=headers, json={"routineEvents": events}).status_code == 200
    )
    assert client.get("/routines", headers={"X-User-ID": "other"}).json() is None
    assert (
        client.post(
            "/tasks",
            headers=headers,
            json=task_payload().model_dump(mode="json", by_alias=True),
        ).status_code
        == 201
    )

    response = client.post(
        "/schedule/generate",
        headers=headers,
        json=config([]).model_dump(mode="json", by_alias=True),
    )

    assert response.status_code == 200
    assert response.json()["routineEvents"] == events
    assert all(
        s["startAt"][:10] not in ["2030-01-02", "2030-01-03", "2030-01-04"]
        for s in response.json()["sessions"]
    )
    assert client.get("/schedule", headers=headers).json()["routineEvents"] == events


def test_routine_changed_during_generation_cannot_save_stale_plan(monkeypatch, tmp_path):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("STUDYSMART_API_TOKEN", raising=False)

    store = JsonStore(tmp_path / "api.json")

    monkeypatch.setattr(main, "store", store)
    store.save_routines("student", [])
    store.create_task("student", task_payload())

    original = main.generate_schedule

    def changing_schedule(user, tasks, preferences):
        plan = original(user, tasks, preferences)

        store.save_routines(user, [holiday()])

        return plan

    monkeypatch.setattr(main, "generate_schedule", changing_schedule)

    response = TestClient(main.app).post(
        "/schedule/generate", headers={"X-User-ID": "student"}, json={}
    )

    assert response.status_code == 409
    assert store.latest_schedule("student") is None


@pytest.mark.parametrize("backend", ["json", "sql"])
def test_storage_rejects_plan_if_routines_change_just_before_save(backend, monkeypatch, tmp_path):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    store = (
        JsonStore(tmp_path / "store.json")
        if backend == "json"
        else DatabaseStore(f'sqlite+pysqlite:///{(tmp_path / "store.db").as_posix()}')
    )

    store.save_routines("student", [])

    created = store.create_task("student", task_payload())
    plan = generate_schedule("student", [created], config([]))

    store.save_routines("student", [holiday()])

    with pytest.raises(ActivitiesChangedError):
        store.save_schedule("student", plan)
    assert store.latest_schedule("student") is None
