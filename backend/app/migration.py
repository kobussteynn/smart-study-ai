"""One-time, transactional import of the existing JSON store into SQL storage."""

import hashlib
import json
from pathlib import Path

from sqlalchemy import String, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .database import (
    Base,
    DatabaseStore,
    RoutineRow,
    ScheduleContextRow,
    ScheduleRow,
    TaskRow,
)
from .models import RoutineEvent, StudySchedule, TaskRecord


class JsonImportRow(Base):
    __tablename__ = "json_imports"

    name: Mapped[str] = mapped_column(String(80), primary_key=True)
    digest: Mapped[str] = mapped_column(String(64))


def import_json_store(store: DatabaseStore, path: Path) -> dict[str, int]:
    if not path.is_file():
        raise RuntimeError(
            "JSON migration source does not exist; refusing to start with missing data"
        )

    source = path.read_bytes()
    digest = hashlib.sha256(source).hexdigest()
    payload = json.loads(source)

    if not isinstance(payload, dict) or not isinstance(payload.get("users"), dict):
        raise ValueError("Invalid JSON migration source")


    users = []

    for user_id, data in payload["users"].items():
        if not isinstance(user_id, str) or not user_id.strip() or len(user_id) > 128:
            raise ValueError("Invalid user ID in JSON migration source")

        tasks = [TaskRecord.model_validate(item) for item in data.get("tasks", [])]
        plans = [StudySchedule.model_validate(item) for item in data.get("schedules", [])]

        if any(plan.user_id != user_id for plan in plans):
            raise ValueError("Schedule owner differs from JSON user record")

        raw_routines = data.get("routines")
        events = (
            None
            if raw_routines is None
            else [RoutineEvent.model_validate(item) for item in raw_routines]
        )

        users.append((user_id, tasks, plans, events))

    Base.metadata.create_all(store.engine)

    counts = {"users": len(users), "tasks": 0, "schedules": 0, "routines": 0}

    with Session(store.engine) as session, session.begin():
        marker = session.get(JsonImportRow, "initial-json-store")

        if marker:
            if marker.digest != digest:
                raise RuntimeError(
                    "JSON source changed after migration; refusing to overwrite database data"
                )

            return {"alreadyImported": 1}
        if any(
            session.scalar(select(table).limit(1)) is not None
            for table in (TaskRow, ScheduleRow, RoutineRow)
        ):
            raise RuntimeError(
                "Migration target is not empty; refusing to overwrite existing database data"
            )
        for user_id, tasks, plans, events in users:
            for task in tasks:
                row = TaskRow(
                    id=task.id,
                    user_id=user_id,
                    created_at=task.created_at,
                    updated_at=task.updated_at,
                )

                store._apply_task(row, task.model_dump(by_alias=False))
                session.add(row)

                counts["tasks"] += 1
            for plan in plans:
                session.add(
                    ScheduleRow(
                        id=plan.id,
                        user_id=user_id,
                        generated_at=plan.generated_at,
                        source=plan.source.value,
                        model=plan.model,
                        summary=plan.summary,
                        sessions=[s.model_dump(mode="json", by_alias=True) for s in plan.sessions],
                        warnings=list(plan.warnings),
                    )
                )

                if plan.routine_events is not None:
                    session.add(
                        ScheduleContextRow(
                            schedule_id=plan.id,
                            routine_events=[
                                event.model_dump(mode="json", by_alias=True)
                                for event in plan.routine_events
                            ],
                        )
                    )

                counts["schedules"] += 1
            if events is not None:
                session.add(
                    RoutineRow(
                        user_id=user_id,
                        events=[event.model_dump(mode="json", by_alias=True) for event in events],
                    )
                )

                counts["routines"] += len(events)

        session.add(JsonImportRow(name="initial-json-store", digest=digest))

    return counts
