from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Iterable
from uuid import uuid4

import httpx

from .models import (
    AIScheduleDraft,
    get_timezone,
    SchedulePreferences,
    ScheduleSource,
    StudySchedule,
    StudySession,
    TaskRecord,
    TaskStatus,
)


class InvalidScheduleError(ValueError):
    pass


class IncompleteScheduleError(InvalidScheduleError):
    pass


def _active_tasks(tasks: Iterable[TaskRecord]) -> list[TaskRecord]:
    return [
        task for task in tasks if task.status not in {TaskStatus.COMPLETED, TaskStatus.CANCELLED}
    ]


def _planning_start(preferences: SchedulePreferences) -> date:
    if preferences.planning_start:
        return preferences.planning_start

    return datetime.now(get_timezone(preferences.timezone)).date()


def _task_due_in_zone(task: TaskRecord, zone) -> datetime:
    due_at = task.due_at

    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=zone)

    return due_at.astimezone(zone)


def _busy_intervals(preferences: SchedulePreferences, day: date) -> list[tuple[datetime, datetime]]:
    """Occupied intervals on a planning date in the requested planning timezone.

    Includes events begun on prior dates (overnight) and neighboring dates
    converted from a routine's potentially different IANA timezone.
    """

    zone = get_timezone(preferences.timezone)
    day_start = datetime.combine(day, datetime.min.time(), tzinfo=zone)
    day_end = datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=zone)
    intervals: list[tuple[datetime, datetime]] = []

    for event in preferences.routine_events:
        event_zone = get_timezone(event.timezone)

        for offset in (-2, -1, 0, 1, 2):
            origin = day + timedelta(days=offset)

            if event.repeat == "once" and not event.date <= origin <= (
                event.end_date or event.date
            ):
                continue
            if event.repeat == "selected" and origin.isoweekday() % 7 not in event.days_of_week:
                continue

            start_time = datetime.min.time() if event.all_day else event.start_time
            end_time = datetime.min.time() if event.all_day else event.end_time
            start = datetime.combine(origin, start_time, tzinfo=event_zone)
            end_date = origin + timedelta(days=event.all_day or end_time <= start_time)
            end = datetime.combine(end_date, end_time, tzinfo=event_zone)


            start = start.astimezone(timezone.utc).astimezone(zone)
            end = end.astimezone(timezone.utc).astimezone(zone)

            if start < day_end and end > day_start:
                intervals.append((max(day_start, start), min(day_end, end)))

    intervals.sort(key=lambda pair: pair[0].astimezone(timezone.utc))

    merged: list[tuple[datetime, datetime]] = []

    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            last_start, last_end = merged[-1]
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))

    return merged


def _local_schedule(
    user_id: str,
    tasks: list[TaskRecord],
    preferences: SchedulePreferences,
    model: str | None,
    warning: str | None = None,
) -> StudySchedule:
    zone = get_timezone(preferences.timezone)
    start_date = _planning_start(preferences)
    task_map = {task.id: task for task in _active_tasks(tasks)}
    ordered = sorted(
        task_map.values(),
        key=lambda task: (
            _task_due_in_zone(task, zone),
            -int(task.priority),
            -task.difficulty,
        ),
    )
    remaining = {task.id: task.estimated_minutes for task in ordered}
    sessions: list[StudySession] = []

    for offset in range(preferences.planning_days):
        day = start_date + timedelta(days=offset)

        if day in preferences.unavailable_dates:
            continue

        cursor = datetime.combine(day, preferences.daily_start, tzinfo=zone)
        day_end = datetime.combine(day, preferences.daily_end, tzinfo=zone)
        busy = _busy_intervals(preferences, day)
        blocked_task_ids: set[str] = set()

        while cursor < day_end:

            occupying = next(((start, end) for start, end in busy if start <= cursor < end), None)

            if occupying is not None:
                cursor = occupying[1]

                continue

            next_busy = next((start for start, _ in busy if start > cursor), day_end)
            candidates = [
                task
                for task in ordered
                if task.id not in blocked_task_ids
                and remaining[task.id] > 0
                and cursor < _task_due_in_zone(task, zone)
            ]

            if not candidates:
                break

            task = candidates[0]
            due_at = _task_due_in_zone(task, zone)
            available_end = min(day_end, due_at, next_busy)
            available_minutes = int((available_end - cursor).total_seconds() // 60)

            if available_minutes < 15:
                if available_end == day_end:
                    break
                if available_end == next_busy:

                    cursor = next_busy

                    continue

                blocked_task_ids.add(task.id)

                continue

            duration = min(
                preferences.session_minutes,
                remaining[task.id],
                available_minutes,
            )
            end_at = cursor + timedelta(minutes=duration)

            sessions.append(
                StudySession(
                    id=str(uuid4()),
                    taskId=task.id,
                    title=task.title,
                    module=task.module,
                    startAt=cursor,
                    endAt=end_at,
                    durationMinutes=duration,
                    focus=f"Work on {task.title}",
                )
            )

            remaining[task.id] -= duration
            cursor = end_at + timedelta(minutes=preferences.break_minutes)

    warnings = [warning] if warning else []

    for task in ordered:
        if remaining[task.id] > 0:
            warnings.append(
                f"{task.title} still needs {remaining[task.id]} minute(s); add availability or reduce workload."
            )

    return StudySchedule(
        id=str(uuid4()),
        userId=user_id,
        generatedAt=datetime.now(timezone.utc),
        source=ScheduleSource.LOCAL_FALLBACK,
        model=model,
        summary=(
            f"Created {len(sessions)} study session(s) across "
            f"{preferences.planning_days} planning day(s)."
        ),
        sessions=sessions,
        warnings=warnings,
        routineEvents=preferences.routine_events,
    )


def _validate_ai_draft(
    user_id: str,
    tasks: list[TaskRecord],
    preferences: SchedulePreferences,
    draft: AIScheduleDraft,
    model: str,
) -> StudySchedule:
    zone = get_timezone(preferences.timezone)
    start_date = _planning_start(preferences)
    last_date = start_date + timedelta(days=preferences.planning_days - 1)
    task_map = {task.id: task for task in _active_tasks(tasks)}
    scheduled_minutes: defaultdict[str, int] = defaultdict(int)
    converted: list[StudySession] = []
    warnings: list[str] = []

    for item in sorted(draft.sessions, key=lambda session: session.start_at):
        task = task_map.get(item.task_id)

        if task is None:
            raise InvalidScheduleError(f"Unknown task ID: {item.task_id}")

        start_at = item.start_at
        end_at = item.end_at

        if start_at.tzinfo is None or end_at.tzinfo is None:
            raise InvalidScheduleError("All session timestamps must include a timezone")

        start_at = start_at.astimezone(zone)
        end_at = end_at.astimezone(zone)
        duration = int((end_at - start_at).total_seconds() // 60)

        if duration < 1 or duration > preferences.session_minutes:
            raise InvalidScheduleError("Session duration is outside the configured range")
        if not start_date <= start_at.date() <= last_date:
            raise InvalidScheduleError("Session is outside the planning period")
        if start_at.date() in preferences.unavailable_dates:
            raise InvalidScheduleError("Session occurs on an unavailable date")
        if end_at.date() != start_at.date():
            raise InvalidScheduleError("Study sessions must end on their start date")
        if start_at.time().replace(tzinfo=None) < preferences.daily_start:
            raise InvalidScheduleError("Session starts before daily availability")
        if end_at.time().replace(tzinfo=None) > preferences.daily_end:
            raise InvalidScheduleError("Session ends after daily availability")
        if end_at > _task_due_in_zone(task, zone):
            raise InvalidScheduleError("Session ends after its task deadline")

        remaining_minutes = task.estimated_minutes - scheduled_minutes[task.id]

        if remaining_minutes <= 0:
            continue
        if duration > remaining_minutes:
            duration = remaining_minutes
            end_at = start_at + timedelta(minutes=duration)

            warnings.append(f"Trimmed excess time for {task.title} to match its estimate.")
        for busy_start, busy_end in _busy_intervals(preferences, start_at.date()):
            if start_at < busy_end and end_at > busy_start:
                raise InvalidScheduleError("AI session overlaps a routine event")

        scheduled_minutes[task.id] += duration

        converted.append(
            StudySession(
                id=str(uuid4()),
                taskId=task.id,
                title=task.title,
                module=task.module,
                startAt=start_at,
                endAt=end_at,
                durationMinutes=duration,
                focus=item.focus,
            )
        )

    for previous, current in zip(converted, converted[1:]):
        required_start = previous.end_at + timedelta(minutes=preferences.break_minutes)

        if current.start_at < required_start:
            raise InvalidScheduleError("Sessions overlap or omit the configured break")

    for task in task_map.values():
        missing = task.estimated_minutes - scheduled_minutes[task.id]

        if missing > 0:
            warnings.append(f"{task.title} still needs {missing} minute(s).")

    local_capacity = sum(
        session.duration_minutes
        for session in _local_schedule(
            user_id, list(task_map.values()), preferences, model=None
        ).sessions
    )

    if sum(scheduled_minutes.values()) < local_capacity:
        raise IncompleteScheduleError("The AI schedule omitted study time that fits")

    return StudySchedule(
        id=str(uuid4()),
        userId=user_id,
        generatedAt=datetime.now(timezone.utc),
        source=ScheduleSource.OPENAI,
        model=model,
        summary=draft.summary,
        sessions=converted,
        warnings=warnings,
        routineEvents=preferences.routine_events,
    )


def _ai_schedule(
    user_id: str,
    tasks: list[TaskRecord],
    preferences: SchedulePreferences,
    api_key: str,
    model: str,
) -> StudySchedule:
    active = _active_tasks(tasks)
    start_date = _planning_start(preferences)
    zone = get_timezone(preferences.timezone)
    baseline = _local_schedule(user_id, active, preferences, model=None)
    blocked_intervals = []

    for offset in range(preferences.planning_days):
        day = start_date + timedelta(days=offset)

        if day in preferences.unavailable_dates:
            intervals = [
                (
                    datetime.combine(day, datetime.min.time(), tzinfo=zone),
                    datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=zone),
                )
            ]
        else:
            intervals = _busy_intervals(preferences, day)

        blocked_intervals.extend(
            {"startAt": start.isoformat(), "endAt": end.isoformat()} for start, end in intervals
        )

    payload = {
        "timezone": preferences.timezone,
        "planningStart": start_date.isoformat(),
        "planningDays": preferences.planning_days,
        "dailyStart": preferences.daily_start.isoformat(),
        "dailyEnd": preferences.daily_end.isoformat(),
        "sessionMinutes": preferences.session_minutes,
        "breakMinutes": preferences.break_minutes,
        "unavailableDates": [day.isoformat() for day in preferences.unavailable_dates],
        "routineEvents": [
            event.model_dump(mode="json", by_alias=True) for event in preferences.routine_events
        ],
        "blockedIntervals": blocked_intervals,
        "tasks": [task.model_dump(mode="json", by_alias=True) for task in active],
        "totalRequiredMinutes": sum(task.estimated_minutes for task in active),
        "feasibleSessions": [
            {
                "task_id": session.task_id,
                "start_at": session.start_at.isoformat(),
                "end_at": session.end_at.isoformat(),
                "durationMinutes": session.duration_minutes,
            }
            for session in baseline.sessions
        ],
    }
    instructions = (
        "Create a practical study schedule from the supplied tasks and availability. "
        "Use only supplied task IDs. Prioritize near deadlines, then priority and difficulty. "
        "Split long tasks across sessions, never exceed each task's estimatedMinutes, and "
        "do not schedule after dueAt. Use timezone-aware ISO 8601 timestamps. Keep sessions "
        "inside the planning period and daily window, honor unavailable dates and breaks. "
        "Treat all routineEvents as occupied, respecting their repeat rules, "
        "selected weekdays (Sunday=0), timezones, and overnight events. "
        "blockedIntervals contains the exact occupied intervals in the planning timezone, "
        "including unavailable dates and expanded recurring events. Never place any part "
        "of a study session inside these intervals. A session may end exactly when a "
        "blocked interval starts or start exactly when it ends. "
        "State any workload that cannot fit in warnings. When capacity exists, schedule "
        "exactly each task's estimatedMinutes. Before answering, add the session durations "
        "for each task ID and verify they equal that task's estimate."
        " feasibleSessions is a complete, constraint-checked starting timetable. "
        "Use it as the starting point and provide specific study guidance in focus. "
        "Never reduce the amount of study time it allocates."
    )
    request_body = {
        "model": model,
        "instructions": instructions,
        "input": json.dumps(payload),
        "text": {
            "format": {
                "type": "json_schema",
                "name": "study_schedule",
                "strict": True,
                "schema": AIScheduleDraft.model_json_schema(),
            }
        },
        "store": False,
    }

    with httpx.Client(timeout=45.0) as client:
        response = client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {api_key}"},
            json=request_body,
        )

    response.raise_for_status()

    response_body = response.json()
    output_text = next(
        (
            content["text"]
            for output in response_body.get("output", [])
            for content in output.get("content", [])
            if content.get("type") == "output_text" and content.get("text")
        ),
        None,
    )

    if output_text is None:
        raise InvalidScheduleError("The model did not return a schedule")

    draft = AIScheduleDraft.model_validate_json(output_text)

    try:
        return _validate_ai_draft(user_id, active, preferences, draft, model)
    except IncompleteScheduleError:


        focuses = {item.task_id: item.focus for item in draft.sessions}
        repaired = AIScheduleDraft.model_validate(
            {
                "summary": draft.summary,
                "warnings": [],
                "sessions": [
                    {
                        "task_id": session.task_id,
                        "start_at": session.start_at,
                        "end_at": session.end_at,
                        "focus": focuses.get(session.task_id, session.focus),
                    }
                    for session in baseline.sessions
                ],
            }
        )
        result = _validate_ai_draft(user_id, active, preferences, repaired, model)
        result.summary = (
            "AI-guided study plan with session times adjusted to cover the available workload."
        )

        result.warnings.append("Adjusted session times to include all study time that fits.")

        return result


def generate_schedule(
    user_id: str,
    tasks: list[TaskRecord],
    preferences: SchedulePreferences,
) -> StudySchedule:
    active = _active_tasks(tasks)
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    if not active:
        return _local_schedule(user_id, [], preferences, model=None)

    api_key = os.getenv("OPENAI_API_KEY", "").strip()

    if not api_key:
        return _local_schedule(
            user_id,
            active,
            preferences,
            model=None,
            warning="OPENAI_API_KEY is not configured; used the local scheduler.",
        )
    try:
        return _ai_schedule(user_id, active, preferences, api_key, model)
    except Exception as exc:
        reason = f"{type(exc).__name__}: {exc}".rstrip(": ")

        return _local_schedule(
            user_id,
            active,
            preferences,
            model=model,
            warning=f"AI schedule generation failed; used the local scheduler ({reason}).",
        )
