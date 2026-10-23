"""Tests for recurring availability, independent of the storage implementation."""

import json
from datetime import date, datetime

import httpx
import pytest
from pydantic import ValidationError

from app.models import AIScheduleDraft, RoutineEvent, SchedulePreferences, TaskRecord
from app.scheduler import (
    InvalidScheduleError,
    _busy_intervals,
    _validate_ai_draft,
    generate_schedule,
)


def task(**changes):
    payload = {
        "id": "task-1",
        "title": "Revision",
        "module": "Math",
        "dueAt": "2030-02-10T23:00:00+02:00",
        "priority": 2,
        "difficulty": 2,
        "estimatedMinutes": 360,
        "status": "PENDING",
        "createdAt": "2030-01-01T10:00:00+02:00",
        "updatedAt": "2030-01-01T10:00:00+02:00",
    }

    payload.update(changes)

    return TaskRecord.model_validate(payload)


def routine(**changes):
    payload = {
        "id": "lunch",
        "title": "Lunch",
        "startTime": "18:00",
        "endTime": "19:00",
        "repeat": "daily",
        "daysOfWeek": [],
        "timezone": "Africa/Johannesburg",
    }

    payload.update(changes)

    return RoutineEvent.model_validate(payload)


def prefs(**changes):
    params = {
        "planningStart": "2030-01-02",
        "planningDays": 2,
        "dailyStart": "18:00",
        "dailyEnd": "21:00",
        "sessionMinutes": 45,
        "breakMinutes": 10,
        "timezone": "Africa/Johannesburg",
    }

    params.update(changes)

    return SchedulePreferences.model_validate(params)


def assert_clear(schedule, blocked):
    for session in schedule.sessions:
        for start, end in _busy_intervals(blocked, session.start_at.date()):
            assert not (session.start_at < end and session.end_at > start), (
                session.start_at,
                session.end_at,
                start,
                end,
            )


def test_daily_events_block_study(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    config = prefs(routineEvents=[routine().model_dump(mode="json", by_alias=True)])
    result = generate_schedule("student", [task()], config)

    assert result.sessions
    assert result.sessions[0].start_at.hour == 19

    assert_clear(result, config)


def test_selected_weekdays_sunday_zero_convention(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    day = date(2030, 1, 2)
    weekday_js = day.isoweekday() % 7
    config = prefs(
        routineEvents=[
            routine(repeat="selected", daysOfWeek=[weekday_js]).model_dump(
                mode="json", by_alias=True
            )
        ]
    )

    assert _busy_intervals(config, day)
    assert _busy_intervals(config, date(2030, 1, 3)) == []

    assert_clear(generate_schedule("student", [task()], config), config)


def test_once_blocks_only_its_selected_date():
    config = prefs(
        routineEvents=[
            routine(repeat="once", date="2030-01-03").model_dump(mode="json", by_alias=True)
        ]
    )

    assert _busy_intervals(config, date(2030, 1, 2)) == []
    assert len(_busy_intervals(config, date(2030, 1, 3))) == 1


def test_overnight_sleep_blocks_early_morning(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    config = prefs(
        dailyStart="05:00",
        dailyEnd="08:00",
        routineEvents=[
            routine(startTime="22:00", endTime="06:00").model_dump(mode="json", by_alias=True)
        ],
    )
    intervals = _busy_intervals(config, date(2030, 1, 2))

    assert intervals[0][0].hour == 0 and intervals[0][1].hour == 6

    result = generate_schedule("student", [task()], config)

    assert result.sessions and result.sessions[0].start_at.hour == 6

    assert_clear(result, config)


def test_overnight_blocks_late_evening(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    config = prefs(
        dailyStart="21:00",
        dailyEnd="23:00",
        routineEvents=[
            routine(startTime="22:00", endTime="06:00").model_dump(mode="json", by_alias=True)
        ],
    )
    result = generate_schedule("student", [task()], config)

    assert result.sessions and all(s.end_at.hour <= 22 for s in result.sessions)

    assert_clear(result, config)


def test_events_merge_when_overlapping():
    config = prefs(
        routineEvents=[
            routine(id="one", startTime="18:00", endTime="19:30").model_dump(
                mode="json", by_alias=True
            ),
            routine(id="two", startTime="19:00", endTime="20:00").model_dump(
                mode="json", by_alias=True
            ),
        ]
    )
    intervals = _busy_intervals(config, date(2030, 1, 2))

    assert len(intervals) == 1
    assert intervals[0][0].hour == 18 and intervals[0][1].hour == 20


def test_event_timezone_converted_to_planning_timezone():

    config = prefs(
        routineEvents=[
            routine(startTime="16:00", endTime="17:00", timezone="UTC").model_dump(
                mode="json", by_alias=True
            )
        ]
    )
    start, end = _busy_intervals(config, date(2030, 1, 2))[0]

    assert (start.hour, end.hour) == (18, 19)


@pytest.mark.parametrize(
    "changes",
    [
        {"startTime": "18:00", "endTime": "18:00"},
        {"repeat": "once"},
        {"repeat": "selected", "daysOfWeek": []},
        {"repeat": "selected", "daysOfWeek": [8]},
        {"repeat": "selected", "daysOfWeek": [1, 1]},
        {"timezone": "Definitely/NotATimezone"},
    ],
)
def test_invalid_event_rejected(changes):
    with pytest.raises(ValidationError):
        routine(**changes)


def test_legacy_request_without_routines_still_valid(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    config = prefs()

    assert config.routine_events == []
    assert generate_schedule("student", [task()], config).sessions


def test_ai_draft_rejected_if_overlaps_routine():
    config = prefs(planningDays=1, routineEvents=[routine().model_dump(mode="json", by_alias=True)])
    draft = AIScheduleDraft.model_validate(
        {
            "summary": "Overlap example",
            "warnings": [],
            "sessions": [
                {
                    "task_id": "task-1",
                    "start_at": "2030-01-02T18:30:00+02:00",
                    "end_at": "2030-01-02T19:00:00+02:00",
                    "focus": "Study",
                }
            ],
        }
    )

    with pytest.raises(InvalidScheduleError, match="overlaps a routine"):
        _validate_ai_draft("student", [task()], config, draft, "test-model")


def test_ai_failure_falls_back_to_conflict_free_local(monkeypatch):
    from app import scheduler

    monkeypatch.setenv("OPENAI_API_KEY", "dummy-for-test-only")

    config = prefs(routineEvents=[routine().model_dump(mode="json", by_alias=True)])

    def failed_ai(*args):
        raise InvalidScheduleError("AI session overlaps a routine event")

    monkeypatch.setattr(scheduler, "_ai_schedule", failed_ai)

    result = generate_schedule("student", [task()], config)

    assert result.source.value == "local_fallback"

    assert_clear(result, config)


def test_unavailable_dates_maintained(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    config = prefs(
        unavailableDates=["2030-01-02"],
        routineEvents=[routine().model_dump(mode="json", by_alias=True)],
    )
    result = generate_schedule("student", [task()], config)

    assert all(s.start_at.date() != date(2030, 1, 2) for s in result.sessions)

    assert_clear(result, config)


@pytest.mark.parametrize(
    "ai_start, ai_end, expected_source",
    [
        ("19:00", "19:30", "openai"),
        ("18:30", "19:00", "local_fallback"),
    ],
)
def test_openai_request_and_response_respect_busy_times(
    monkeypatch, ai_start, ai_end, expected_source
):
    """Exercise the actual HTTP request, parsing, validation and fallback together."""

    from app import scheduler

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    config = prefs(
        planningDays=2,
        unavailableDates=["2030-01-03"],
        routineEvents=[routine().model_dump(mode="json", by_alias=True)],
    )
    real_client = httpx.Client

    def respond(request):
        body = json.loads(request.content)
        payload = json.loads(body["input"])

        assert payload["routineEvents"][0]["title"] == "Lunch"
        assert payload["blockedIntervals"] == [
            {
                "startAt": "2030-01-02T18:00:00+02:00",
                "endAt": "2030-01-02T19:00:00+02:00",
            },
            {
                "startAt": "2030-01-03T00:00:00+02:00",
                "endAt": "2030-01-04T00:00:00+02:00",
            },
        ]
        assert body["text"]["format"]["strict"] is True

        draft = {
            "summary": "Study after lunch",
            "warnings": [],
            "sessions": [
                {
                    "task_id": "task-1",
                    "start_at": f"2030-01-02T{ai_start}:00+02:00",
                    "end_at": f"2030-01-02T{ai_end}:00+02:00",
                    "focus": "Revision",
                }
            ],
        }

        return httpx.Response(
            200,
            json={
                "output": [
                    {"content": [{"type": "output_text", "text": json.dumps(draft)}]},
                ]
            },
        )

    monkeypatch.setattr(
        scheduler.httpx,
        "Client",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )

    result = generate_schedule("student", [task(estimatedMinutes=30)], config)

    assert result.source.value == expected_source
    assert result.sessions[0].start_at.hour == 19

    assert_clear(result, config)


@pytest.mark.parametrize(
    "event_changes, start_at, end_at",
    [
        (
            {"repeat": "selected", "daysOfWeek": [0, 6]},
            "2030-01-05T18:00:00+02:00",
            "2030-01-05T18:30:00+02:00",
        ),
        (
            {"repeat": "once", "date": "2030-01-02"},
            "2030-01-02T18:00:00+02:00",
            "2030-01-02T18:30:00+02:00",
        ),
        (
            {"startTime": "22:00", "endTime": "06:00"},
            "2030-01-02T05:00:00+02:00",
            "2030-01-02T05:30:00+02:00",
        ),
    ],
)
def test_ai_rejects_weekend_once_and_overnight_conflicts(event_changes, start_at, end_at):
    config = prefs(
        planningDays=7,
        dailyStart="00:00",
        dailyEnd="23:59",
        routineEvents=[routine(**event_changes).model_dump(mode="json", by_alias=True)],
    )
    draft = AIScheduleDraft.model_validate(
        {
            "summary": "Conflicting draft",
            "warnings": [],
            "sessions": [
                {
                    "task_id": "task-1",
                    "start_at": start_at,
                    "end_at": end_at,
                    "focus": "Study",
                }
            ],
        }
    )

    with pytest.raises(InvalidScheduleError, match="overlaps a routine"):
        _validate_ai_draft("student", [task()], config, draft, "test-model")


def test_no_study_when_routines_fill_available_time(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    config = prefs(routineEvents=[routine(endTime="21:00").model_dump(mode="json", by_alias=True)])
    result = generate_schedule("student", [task()], config)

    assert result.sessions == []
    assert any("still needs" in warning for warning in result.warnings)


@pytest.mark.parametrize("returned_minutes", [0, 30])
def test_incomplete_ai_plan_is_completed_with_valid_times(monkeypatch, returned_minutes):
    from app import scheduler

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    config = prefs(routineEvents=[routine().model_dump(mode="json", by_alias=True)])
    real_client = httpx.Client

    def respond(request):
        payload = json.loads(json.loads(request.content)["input"])

        assert sum(s["durationMinutes"] for s in payload["feasibleSessions"]) == 90

        draft = {
            "summary": "Revise key concepts",
            "warnings": [],
            "sessions": (
                [
                    {
                        "task_id": "task-1",
                        "start_at": "2030-01-02T19:00:00+02:00",
                        "end_at": "2030-01-02T19:30:00+02:00",
                        "focus": "Practice algebra questions",
                    }
                ]
                if returned_minutes
                else []
            ),
        }

        return httpx.Response(
            200,
            json={
                "output": [
                    {"content": [{"type": "output_text", "text": json.dumps(draft)}]},
                ]
            },
        )

    monkeypatch.setattr(
        scheduler.httpx,
        "Client",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )

    result = generate_schedule("student", [task(estimatedMinutes=90)], config)

    assert result.source.value == "openai"
    assert sum(s.duration_minutes for s in result.sessions) == 90

    assert_clear(result, config)

    for previous, current in zip(result.sessions, result.sessions[1:]):
        assert (current.start_at - previous.end_at).total_seconds() >= 600
    if returned_minutes:
        assert all(s.focus == "Practice algebra questions" for s in result.sessions)
    assert any("Adjusted session times" in warning for warning in result.warnings)
    assert not any("failed" in warning for warning in result.warnings)
