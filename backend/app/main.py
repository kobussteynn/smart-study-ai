from __future__ import annotations

import os
import hmac
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    RoutineEvent,
    RoutineSettings,
    SchedulePreferences,
    StudySchedule,
    TaskCreate,
    TaskRecord,
    TaskStatusUpdate,
    TaskUpdate,
)
from .scheduler import generate_schedule
from .storage import ActivitiesChangedError, JsonStore, RecordNotFoundError, Store

BACKEND_ROOT = Path(__file__).resolve().parents[1]

load_dotenv(BACKEND_ROOT / ".env")


def _data_path() -> Path:
    configured = Path(os.getenv("STUDYSMART_DATA_FILE", "./data/store.json"))

    return configured if configured.is_absolute() else BACKEND_ROOT / configured


def _create_store() -> Store:
    storage_backend = os.getenv("STUDYSMART_STORAGE", "json").strip().lower()

    if storage_backend == "database":
        database_url = os.getenv("DATABASE_URL", "").strip()

        if not database_url:
            raise RuntimeError("DATABASE_URL must be configured when STUDYSMART_STORAGE=database")

        from .database import DatabaseStore

        database_store = DatabaseStore(database_url)

        if os.getenv("STUDYSMART_MIGRATE_JSON", "").strip() == "1":
            from .migration import import_json_store

            import logging

            counts = import_json_store(database_store, _data_path())

            logging.getLogger("uvicorn.error").info("JSON migration completed: %s", counts)

        return database_store
    if storage_backend != "json":
        raise RuntimeError("STUDYSMART_STORAGE must be either json or database")

    return JsonStore(_data_path())


store = _create_store()
app = FastAPI(title="StudySmart AI API", version="0.1.0")

from .usage_api import router as usage_router

app.include_router(usage_router)

origins = [
    origin.strip()
    for origin in os.getenv(
        "STUDYSMART_CORS_ORIGINS", "http://localhost:8081,http://localhost:19006"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def current_user_id(
    x_user_id: str = Header(default="demo-user"),
    authorization: str | None = Header(default=None),
) -> str:
    api_token = os.getenv("STUDYSMART_API_TOKEN", "").strip()

    if api_token and not hmac.compare_digest(
        (authorization or "").encode(), f"Bearer {api_token}".encode()
    ):
        raise HTTPException(
            status_code=401,
            detail="A valid API access token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = x_user_id.strip()

    if not user_id or len(user_id) > 128:
        raise HTTPException(status_code=400, detail="Invalid X-User-ID")

    return user_id


def _not_found(exc: RecordNotFoundError) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Task {exc.args[0]} was not found")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/tasks", response_model=list[TaskRecord])
def list_tasks(user_id: str = Depends(current_user_id)) -> list[TaskRecord]:
    return store.list_tasks(user_id)


@app.post("/tasks", response_model=TaskRecord, status_code=status.HTTP_201_CREATED)
def create_task(task: TaskCreate, user_id: str = Depends(current_user_id)) -> TaskRecord:
    return store.create_task(user_id, task)


@app.get("/tasks/{task_id}", response_model=TaskRecord)
def get_task(task_id: str, user_id: str = Depends(current_user_id)) -> TaskRecord:
    try:
        return store.get_task(user_id, task_id)
    except RecordNotFoundError as exc:
        raise _not_found(exc) from exc


@app.put("/tasks/{task_id}", response_model=TaskRecord)
def update_task(
    task_id: str,
    update: TaskUpdate,
    user_id: str = Depends(current_user_id),
) -> TaskRecord:
    try:
        return store.update_task(user_id, task_id, update)
    except RecordNotFoundError as exc:
        raise _not_found(exc) from exc


@app.patch("/tasks/{task_id}/status", response_model=TaskRecord)
def update_task_status(
    task_id: str,
    update: TaskStatusUpdate,
    user_id: str = Depends(current_user_id),
) -> TaskRecord:
    try:
        return store.update_task(user_id, task_id, TaskUpdate(status=update.status))
    except RecordNotFoundError as exc:
        raise _not_found(exc) from exc


@app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: str, user_id: str = Depends(current_user_id)) -> Response:
    try:
        store.delete_task(user_id, task_id)
    except RecordNotFoundError as exc:
        raise _not_found(exc) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/schedule", response_model=StudySchedule | None)
def latest_schedule(user_id: str = Depends(current_user_id)) -> StudySchedule | None:
    return store.latest_schedule(user_id)


@app.get("/routines", response_model=list[RoutineEvent] | None)
def get_routines(user_id: str = Depends(current_user_id)) -> list[RoutineEvent] | None:
    events = store.get_routines(user_id)

    if events is None:
        latest = store.latest_schedule(user_id)

        return latest.routine_events if latest else None

    return events


@app.put("/routines", response_model=list[RoutineEvent])
def save_routines(
    settings: RoutineSettings, user_id: str = Depends(current_user_id)
) -> list[RoutineEvent]:
    store.save_routines(user_id, settings.routine_events)

    return settings.routine_events


@app.post("/schedule/generate", response_model=StudySchedule)
def create_schedule(
    preferences: SchedulePreferences | None = None,
    user_id: str = Depends(current_user_id),
) -> StudySchedule:
    preferences = preferences or SchedulePreferences()
    saved_routines = get_routines(user_id)

    if saved_routines is not None:
        preferences = preferences.model_copy(update={"routine_events": saved_routines})
    else:
        store.save_routines(user_id, preferences.routine_events)

    schedule = generate_schedule(
        user_id,
        store.list_tasks(user_id),
        preferences,
    )
    current_routines = get_routines(user_id)

    if current_routines is not None and current_routines != preferences.routine_events:
        raise HTTPException(
            status_code=409,
            detail="Your activities changed while generating the plan. Reload activities and refresh the schedule.",
        )
    try:
        store.save_schedule(user_id, schedule)
    except ActivitiesChangedError as exc:
        raise HTTPException(
            status_code=409,
            detail="Your activities changed before saving the plan. Reload activities and refresh the schedule.",
        ) from exc

    return schedule
