from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone, tzinfo
from enum import Enum, IntEnum
from typing import Literal
from datetime import date as CalendarDate
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def get_timezone(value: str) -> tzinfo:
    try:
        return ZoneInfo(value)
    except ZoneInfoNotFoundError:


        if value == "Africa/Johannesburg":
            return timezone(timedelta(hours=2), name=value)
        if value in {"UTC", "Etc/UTC"}:
            return timezone.utc

        raise


class ApiModel(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        validate_by_name=True,
        serialize_by_alias=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class TaskType(str, Enum):
    HOMEWORK = "HOMEWORK"
    ASSIGNMENT = "ASSIGNMENT"
    PROJECT = "PROJECT"
    TEST = "TEST"
    EXAM = "EXAM"
    OTHER = "OTHER"


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Priority(IntEnum):
    LOW = 1
    MEDIUM = 2
    HIGH = 3


class TaskBase(ApiModel):
    title: str = Field(min_length=1, max_length=160)
    module: str = Field(min_length=1, max_length=120)
    type: TaskType = TaskType.ASSIGNMENT
    due_at: datetime = Field(alias="dueAt")
    priority: Priority = Priority.MEDIUM
    difficulty: int = Field(default=3, ge=1, le=5)
    estimated_minutes: int = Field(alias="estimatedMinutes", ge=1, le=100_000)
    status: TaskStatus = TaskStatus.PENDING


class TaskCreate(TaskBase):
    pass


class TaskUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    module: str | None = Field(default=None, min_length=1, max_length=120)
    type: TaskType | None = None
    due_at: datetime | None = Field(default=None, alias="dueAt")
    priority: Priority | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)
    estimated_minutes: int | None = Field(default=None, alias="estimatedMinutes", ge=1, le=100_000)
    status: TaskStatus | None = None

    @model_validator(mode="after")
    def require_change(self) -> "TaskUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one task field must be supplied")

        return self


class TaskRecord(TaskBase):
    id: str
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")


class TaskStatusUpdate(ApiModel):
    status: TaskStatus


class RoutineEvent(ApiModel):

    id: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=160)
    start_time: time = Field(default=time(0, 0), alias="startTime")
    end_time: time = Field(default=time(0, 0), alias="endTime")
    all_day: bool = Field(default=False, alias="allDay")
    date: CalendarDate | None = None
    end_date: CalendarDate | None = Field(default=None, alias="endDate")
    repeat: Literal["once", "daily", "selected"]
    days_of_week: list[int] = Field(default_factory=list, alias="daysOfWeek", max_length=7)
    timezone: str = "Africa/Johannesburg"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            get_timezone(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Unknown IANA timezone") from exc

        return value

    @model_validator(mode="after")
    def valid_recurrence(self) -> "RoutineEvent":
        if not self.all_day and self.start_time == self.end_time:
            raise ValueError("startTime and endTime must differ")
        if self.repeat == "once" and self.date is None:
            raise ValueError("date is required for a one-time routine")
        if self.end_date is not None:
            if not self.all_day or self.repeat != "once" or self.date is None:
                raise ValueError("endDate requires a one-time all-day event")
            if self.end_date < self.date:
                raise ValueError("endDate cannot precede date")
        if self.repeat == "selected" and not self.days_of_week:
            raise ValueError("daysOfWeek is required for selected-day routines")
        if len(set(self.days_of_week)) != len(self.days_of_week) or any(
            type(day) is not int or not 0 <= day <= 6 for day in self.days_of_week
        ):
            raise ValueError("daysOfWeek must have unique integers from 0 through 6")

        return self


class RoutineSettings(ApiModel):
    routine_events: list[RoutineEvent] = Field(alias="routineEvents", max_length=200)


class SchedulePreferences(ApiModel):
    planning_start: date | None = Field(default=None, alias="planningStart")
    planning_days: int = Field(default=7, alias="planningDays", ge=1, le=30)
    daily_start: time = Field(default=time(18, 0), alias="dailyStart")
    daily_end: time = Field(default=time(21, 0), alias="dailyEnd")
    session_minutes: int = Field(default=50, alias="sessionMinutes", ge=15, le=180)
    break_minutes: int = Field(default=10, alias="breakMinutes", ge=0, le=60)
    timezone: str = "Africa/Johannesburg"
    unavailable_dates: list[date] = Field(default_factory=list, alias="unavailableDates")
    routine_events: list[RoutineEvent] = Field(
        default_factory=list, alias="routineEvents", max_length=200
    )

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            get_timezone(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Unknown IANA timezone") from exc

        return value

    @model_validator(mode="after")
    def valid_daily_window(self) -> "SchedulePreferences":
        if self.daily_end <= self.daily_start:
            raise ValueError("dailyEnd must be later than dailyStart")

        return self


class StudySession(ApiModel):
    id: str
    task_id: str = Field(alias="taskId")
    title: str
    module: str
    start_at: datetime = Field(alias="startAt")
    end_at: datetime = Field(alias="endAt")
    duration_minutes: int = Field(alias="durationMinutes", ge=1)
    focus: str = Field(min_length=1, max_length=240)


class ScheduleSource(str, Enum):
    OPENAI = "openai"
    LOCAL_FALLBACK = "local_fallback"


class StudySchedule(ApiModel):
    id: str
    user_id: str = Field(alias="userId")
    generated_at: datetime = Field(alias="generatedAt")
    source: ScheduleSource
    model: str | None = None
    summary: str
    sessions: list[StudySession]
    warnings: list[str] = Field(default_factory=list)
    routine_events: list[RoutineEvent] | None = Field(default=None, alias="routineEvents")


class AISession(ApiModel):
    task_id: str
    start_at: datetime
    end_at: datetime
    focus: str


class AIScheduleDraft(ApiModel):
    summary: str
    sessions: list[AISession]
    warnings: list[str]
