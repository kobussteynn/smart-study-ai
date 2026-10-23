# Backend

FastAPI handles tasks, routines, schedules, and usage-based study suggestions. Start it from this folder:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` to try requests. The mobile app connects to the same service for all features.

## Configuration

| Variable                  | Use                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`          | Enables AI scheduling and usage suggestions. Without it, schedules use the local planner. |
| `OPENAI_MODEL`            | Scheduling model; defaults to `gpt-4o-mini`.                                              |
| `STUDYSMART_STORAGE`      | `json` by default; set to `database` for PostgreSQL.                                      |
| `STUDYSMART_DATA_FILE`    | JSON file location; defaults to `./data/store.json`, relative to `backend/`.              |
| `DATABASE_URL`            | Required when using database storage.                                                     |
| `STUDYSMART_API_TOKEN`    | Optional shared access token for task, routine, and schedule routes.                      |
| `GOOGLE_WEB_CLIENT_ID`    | Google token audience for usage suggestions. Match the frontend's web client ID.          |
| `STUDYSMART_CORS_ORIGINS` | Comma-separated browser origins. The defaults cover local Expo development.               |

Copy configuration values into a local `.env`; keep credentials out of source control.

## Request authentication

Tasks, routines, and schedules use `X-User-ID`, defaulting to `demo-user` if omitted. When `STUDYSMART_API_TOKEN` is set, these routes also require `Authorization: Bearer <token>`. The frontend reads the shared token from `EXPO_PUBLIC_API_TOKEN`.

This is temporary test access. The app bundles the shared token, and callers can choose another user's ID. Before storing real student data, these routes need to verify a Google ID token and derive ownership from its subject. The app also needs to handle expired credentials. Sign-out currently clears the Google client and app state; there is no backend user session to revoke.

Usage suggestions already verify Google ID tokens separately. `/health` is public.

## Tasks and schedules

The [mobile API contract](../frontend/docs/API_CONTRACT.md) lists routes and payload examples. The request models are in `app/models.py` and the handlers are in `app/main.py`.

`POST /schedule/generate` uses the account's saved tasks and routines. The local planner orders active tasks by deadline, then priority and difficulty. It fits sessions into the daily window, skips busy periods, and reports work that cannot fit.

With OpenAI configured, the scheduler supplies a checked timetable to the model. If the answer leaves work out, it can retain the model's task guidance while repairing session times. An unusable answer falls back to the local planner. Deadlines, availability, activity conflicts, breaks, and allocated minutes are checked before a plan is saved.

Plans include the routine snapshot used to generate them. If routines change during generation or before saving, the API returns `409`; reload activities and generate again. The app also hides old plans after activity changes.

Try generation against a local service with the shared token unset:

```powershell
$headers = @{ 'X-User-ID' = 'demo-user' }
$body = @{
  planningDays = 7
  dailyStart = '18:00'
  dailyEnd = '21:00'
  sessionMinutes = 50
  breakMinutes = 10
  timezone = 'Africa/Johannesburg'
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://localhost:8000/schedule/generate -Headers $headers -ContentType application/json -Body $body
```

Add a task first if you want study sessions in the result.

## PostgreSQL and JSON import

For database storage, set:

```env
STUDYSMART_STORAGE=database
DATABASE_URL=postgresql://user:password@host:port/database
```

`app/database.py` normalizes the connection URL for Psycopg and creates missing tables on startup. JSON and database storage implement the same interface, so the routes return the same response shapes.

To import an existing JSON store:

1. Back up the source file and point `STUDYSMART_DATA_FILE` at it.
2. Configure database storage and set `STUDYSMART_MIGRATE_JSON=1`.
3. Start the backend. The import validates records and commits them together, preserving IDs and ownership.
4. After a successful import, unset the migration flag.

The importer refuses a nonempty target without an import marker. Reusing the same source is a no-op; changing that source after import causes startup to fail. The source file remains available for recovery, but new database writes do not update it.

## Android usage suggestions

`POST /api/usage/suggestions` accepts total entertainment minutes and up to 30 pending task summaries. It requires a Google ID token in `Authorization: Bearer <id-token>`, plus server configuration for `GOOGLE_WEB_CLIENT_ID` and `OPENAI_API_KEY`.

The endpoint checks the study blocks against the supplied tasks and time budget. Each verified Google subject is limited to five requests per minute per process. Multiple workers would need a shared rate limiter.

App names and per-app usage stay on the phone. This endpoint stores no usage history. See [Android usage setup](../android-usage/README.md) for permissions, data handling, and device checks.

## Tests

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
```

Tests are in `tests/`, covering API access, storage, migration, recurring routines, schedule constraints, and usage suggestions.
