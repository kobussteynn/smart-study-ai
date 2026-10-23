from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from typing import Any, Protocol
from uuid import uuid4

from .models import RoutineEvent, StudySchedule, TaskCreate, TaskRecord, TaskUpdate


class RecordNotFoundError(LookupError):
    pass


class ActivitiesChangedError(ValueError):
    pass


class Store(Protocol):
    def get_routines(self, user_id: str) -> list[RoutineEvent] | None: ...

    def save_routines(self, user_id: str, events: list[RoutineEvent]) -> None: ...

    def list_tasks(self, user_id: str) -> list[TaskRecord]: ...

    def get_task(self, user_id: str, task_id: str) -> TaskRecord: ...

    def create_task(self, user_id: str, task: TaskCreate) -> TaskRecord: ...

    def update_task(self, user_id: str, task_id: str, update: TaskUpdate) -> TaskRecord: ...

    def delete_task(self, user_id: str, task_id: str) -> None: ...

    def save_schedule(self, user_id: str, schedule: StudySchedule) -> None: ...

    def latest_schedule(self, user_id: str) -> StudySchedule | None: ...


class JsonStore:
    """Small JSON repository with atomic replacement for safe local persistence."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = RLock()

    @staticmethod
    def _empty_store() -> dict[str, Any]:
        return {"version": 1, "users": {}}

    @staticmethod
    def _user(data: dict[str, Any], user_id: str) -> dict[str, Any]:
        return data["users"].setdefault(user_id, {"tasks": [], "schedules": []})

    def _read(self) -> dict[str, Any]:
        if not self.path.exists():
            return self._empty_store()
        with self.path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict) or not isinstance(data.get("users"), dict):
            raise ValueError(f"Invalid data-store format in {self.path}")

        return data

    def _write(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)

        temporary = self.path.with_suffix(f"{self.path.suffix}.{uuid4().hex}.tmp")

        try:
            with temporary.open("w", encoding="utf-8") as handle:
                json.dump(data, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())

            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def list_tasks(self, user_id: str) -> list[TaskRecord]:
        with self._lock:
            tasks = self._user(self._read(), user_id)["tasks"]

            return [TaskRecord.model_validate(task) for task in tasks]

    def get_task(self, user_id: str, task_id: str) -> TaskRecord:
        for task in self.list_tasks(user_id):
            if task.id == task_id:
                return task

        raise RecordNotFoundError(task_id)

    def create_task(self, user_id: str, task: TaskCreate) -> TaskRecord:
        now = datetime.now(timezone.utc)
        record = TaskRecord(
            id=str(uuid4()),
            createdAt=now,
            updatedAt=now,
            **task.model_dump(),
        )

        with self._lock:
            data = self._read()

            self._user(data, user_id)["tasks"].append(record.model_dump(mode="json", by_alias=True))
            self._write(data)

        return record

    def update_task(self, user_id: str, task_id: str, update: TaskUpdate) -> TaskRecord:
        with self._lock:
            data = self._read()
            tasks = self._user(data, user_id)["tasks"]

            for index, raw_task in enumerate(tasks):
                current = TaskRecord.model_validate(raw_task)

                if current.id != task_id:
                    continue

                values = current.model_dump(by_alias=False)

                values.update(update.model_dump(exclude_unset=True, by_alias=False))

                values["updated_at"] = datetime.now(timezone.utc)
                updated = TaskRecord.model_validate(values)
                tasks[index] = updated.model_dump(mode="json", by_alias=True)

                self._write(data)

                return updated

        raise RecordNotFoundError(task_id)

    def delete_task(self, user_id: str, task_id: str) -> None:
        with self._lock:
            data = self._read()
            tasks = self._user(data, user_id)["tasks"]

            for index, raw_task in enumerate(tasks):
                if raw_task.get("id") == task_id:
                    del tasks[index]

                    self._write(data)

                    return

        raise RecordNotFoundError(task_id)

    def save_schedule(self, user_id: str, schedule: StudySchedule) -> None:
        with self._lock:
            data = self._read()
            user = self._user(data, user_id)
            stored_events = user.get("routines")

            if (
                stored_events is not None
                and schedule.routine_events is not None
                and [RoutineEvent.model_validate(item) for item in stored_events]
                != schedule.routine_events
            ):
                raise ActivitiesChangedError("Activities changed before saving the plan")

            schedules = user["schedules"]

            schedules.append(schedule.model_dump(mode="json", by_alias=True))

            del schedules[:-20]

            self._write(data)

    def latest_schedule(self, user_id: str) -> StudySchedule | None:
        with self._lock:
            schedules = self._user(self._read(), user_id)["schedules"]

            if not schedules:
                return None

            return StudySchedule.model_validate(schedules[-1])

    def get_routines(self, user_id: str) -> list[RoutineEvent] | None:
        with self._lock:
            raw = self._user(self._read(), user_id).get("routines")

            return None if raw is None else [RoutineEvent.model_validate(item) for item in raw]

    def save_routines(self, user_id: str, events: list[RoutineEvent]) -> None:
        with self._lock:
            data = self._read()
            self._user(data, user_id)["routines"] = [
                event.model_dump(mode="json", by_alias=True) for event in events
            ]

            self._write(data)
