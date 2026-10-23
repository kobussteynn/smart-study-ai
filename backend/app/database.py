from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    DateTime,
    Integer,
    JSON,
    String,
    Text,
    create_engine,
    delete,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column

from .models import RoutineEvent, StudySchedule, TaskCreate, TaskRecord, TaskUpdate
from .storage import ActivitiesChangedError, RecordNotFoundError


class Base(DeclarativeBase):
    pass


class TaskRow(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(160))
    module: Mapped[str] = mapped_column(String(120))
    task_type: Mapped[str] = mapped_column("type", String(24))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    priority: Mapped[int] = mapped_column(Integer)
    difficulty: Mapped[int] = mapped_column(Integer)
    estimated_minutes: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScheduleRow(Base):
    __tablename__ = "schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source: Mapped[str] = mapped_column(String(32))
    model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    summary: Mapped[str] = mapped_column(Text)
    sessions: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    warnings: Mapped[list[str]] = mapped_column(JSON)


class RoutineRow(Base):
    __tablename__ = "routines"

    user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    events: Mapped[list[dict[str, Any]]] = mapped_column(JSON)


class ScheduleContextRow(Base):
    __tablename__ = "schedule_contexts"

    schedule_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    routine_events: Mapped[list[dict[str, Any]]] = mapped_column(JSON)


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url.removeprefix("postgres://")
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url.removeprefix("postgresql://")

    return url


class DatabaseStore:
    """SQL storage compatible with Railway PostgreSQL and local SQLite tests."""

    def __init__(self, database_url: str) -> None:
        self.engine = create_engine(normalize_database_url(database_url), pool_pre_ping=True)

        Base.metadata.create_all(self.engine)

    @staticmethod
    def _task_record(row: TaskRow) -> TaskRecord:
        return TaskRecord(
            id=row.id,
            title=row.title,
            module=row.module,
            type=row.task_type,
            dueAt=row.due_at,
            priority=row.priority,
            difficulty=row.difficulty,
            estimatedMinutes=row.estimated_minutes,
            status=row.status,
            createdAt=row.created_at,
            updatedAt=row.updated_at,
        )

    @staticmethod
    def _apply_task(row: TaskRow, values: dict[str, Any]) -> None:
        mapping = {
            "title": "title",
            "module": "module",
            "type": "task_type",
            "due_at": "due_at",
            "priority": "priority",
            "difficulty": "difficulty",
            "estimated_minutes": "estimated_minutes",
            "status": "status",
        }

        for field, column in mapping.items():
            if field not in values:
                continue

            value = values[field]

            setattr(row, column, value.value if hasattr(value, "value") else value)

    def list_tasks(self, user_id: str) -> list[TaskRecord]:
        with Session(self.engine) as session:
            rows = session.scalars(
                select(TaskRow)
                .where(TaskRow.user_id == user_id)
                .order_by(TaskRow.due_at, TaskRow.created_at)
            ).all()

            return [self._task_record(row) for row in rows]

    def get_task(self, user_id: str, task_id: str) -> TaskRecord:
        with Session(self.engine) as session:
            row = session.scalar(
                select(TaskRow).where(TaskRow.id == task_id, TaskRow.user_id == user_id)
            )

            if row is None:
                raise RecordNotFoundError(task_id)

            return self._task_record(row)

    def create_task(self, user_id: str, task: TaskCreate) -> TaskRecord:
        now = datetime.now(timezone.utc)
        row = TaskRow(
            id=str(uuid4()),
            user_id=user_id,
            title=task.title,
            module=task.module,
            task_type=task.type.value,
            due_at=task.due_at,
            priority=int(task.priority),
            difficulty=task.difficulty,
            estimated_minutes=task.estimated_minutes,
            status=task.status.value,
            created_at=now,
            updated_at=now,
        )

        with Session(self.engine) as session:
            session.add(row)
            session.commit()
            session.refresh(row)

            return self._task_record(row)

    def update_task(self, user_id: str, task_id: str, update: TaskUpdate) -> TaskRecord:
        with Session(self.engine) as session:
            row = session.scalar(
                select(TaskRow).where(TaskRow.id == task_id, TaskRow.user_id == user_id)
            )

            if row is None:
                raise RecordNotFoundError(task_id)

            self._apply_task(row, update.model_dump(exclude_unset=True, by_alias=False))

            row.updated_at = datetime.now(timezone.utc)

            session.commit()
            session.refresh(row)

            return self._task_record(row)

    def delete_task(self, user_id: str, task_id: str) -> None:
        with Session(self.engine) as session:
            result = session.execute(
                delete(TaskRow).where(TaskRow.id == task_id, TaskRow.user_id == user_id)
            )

            if result.rowcount == 0:
                raise RecordNotFoundError(task_id)

            session.commit()

    def save_schedule(self, user_id: str, schedule: StudySchedule) -> None:
        row = ScheduleRow(
            id=schedule.id,
            user_id=user_id,
            generated_at=schedule.generated_at,
            source=schedule.source.value,
            model=schedule.model,
            summary=schedule.summary,
            sessions=[item.model_dump(mode="json", by_alias=True) for item in schedule.sessions],
            warnings=list(schedule.warnings),
        )

        with Session(self.engine) as session:
            routines = session.scalar(
                select(RoutineRow).where(RoutineRow.user_id == user_id).with_for_update()
            )

            if (
                routines is not None
                and schedule.routine_events is not None
                and [RoutineEvent.model_validate(item) for item in routines.events]
                != schedule.routine_events
            ):
                raise ActivitiesChangedError("Activities changed before saving the plan")

            session.add(row)

            if schedule.routine_events is not None:
                session.add(
                    ScheduleContextRow(
                        schedule_id=schedule.id,
                        routine_events=[
                            event.model_dump(mode="json", by_alias=True)
                            for event in schedule.routine_events
                        ],
                    )
                )

            session.commit()

    def latest_schedule(self, user_id: str) -> StudySchedule | None:
        with Session(self.engine) as session:
            row = session.scalar(
                select(ScheduleRow)
                .where(ScheduleRow.user_id == user_id)
                .order_by(ScheduleRow.generated_at.desc())
                .limit(1)
            )

            if row is None:
                return None

            context = session.get(ScheduleContextRow, row.id)

            return StudySchedule(
                id=row.id,
                userId=row.user_id,
                generatedAt=row.generated_at,
                source=row.source,
                model=row.model,
                summary=row.summary,
                sessions=row.sessions,
                warnings=row.warnings,
                routineEvents=context.routine_events if context else None,
            )

    def get_routines(self, user_id: str) -> list[RoutineEvent] | None:
        with Session(self.engine) as session:
            row = session.get(RoutineRow, user_id)

            return (
                None if row is None else [RoutineEvent.model_validate(item) for item in row.events]
            )

    def save_routines(self, user_id: str, events: list[RoutineEvent]) -> None:
        with Session(self.engine) as session:
            session.merge(
                RoutineRow(
                    user_id=user_id,
                    events=[event.model_dump(mode="json", by_alias=True) for event in events],
                )
            )
            session.commit()
