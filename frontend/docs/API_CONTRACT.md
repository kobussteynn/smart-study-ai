# Mobile API contract

These are the routes used by the mobile app. Field names match the JSON sent by the services in `src/services/`. Use `/docs` on a running backend for the full schemas.

## Current authentication

Task, routine, and schedule requests send `X-User-ID`. If the backend has a `STUDYSMART_API_TOKEN`, they also need that shared bearer token. This setup is for testing: the backend does not verify that the supplied user ID belongs to the caller.

`POST /api/usage/suggestions` separately requires a Google ID token as its bearer token. See [the backend README](../../backend/README.md) for the remaining authentication work.

## Academic tasks

- `GET /tasks`
- `POST /tasks`
- `GET /tasks/{task_id}`
- `PUT /tasks/{task_id}`
- `DELETE /tasks/{task_id}`
- `PATCH /tasks/{task_id}/status`

For example, `POST /tasks` accepts:

```json
{
  "title": "Finish database schema",
  "module": "Data Design",
  "type": "ASSIGNMENT",
  "dueAt": "2026-11-02T18:00:00+02:00",
  "priority": 3,
  "difficulty": 4,
  "estimatedMinutes": 180,
  "status": "PENDING"
}
```

The response adds `id`, `createdAt`, and `updatedAt`. Priority ranges from 1 to 3 and difficulty from 1 to 5. To complete a task, send `{"status":"COMPLETED"}` to its status route. Deleting a task returns `204` with no response body.

## Schedule

- `GET /schedule`
- `POST /schedule/generate`
- `GET /routines`
- `PUT /routines`

Schedule generation returns a saved plan. `GET /schedule` returns the latest plan or `null`. A plan includes the following fields:

```json
{
  "id": "schedule-id",
  "userId": "user-id",
  "generatedAt": "2026-09-28T12:00:00Z",
  "source": "openai",
  "model": "gpt-4o-mini",
  "summary": "A balanced plan for the next seven days.",
  "sessions": [
    {
      "id": "session-id",
      "taskId": "task-id",
      "title": "Database assignment",
      "module": "Data Design",
      "startAt": "2026-09-29T17:00:00+02:00",
      "endAt": "2026-09-29T17:50:00+02:00",
      "durationMinutes": 50,
      "focus": "Complete the schema design"
    }
  ],
  "warnings": []
}
```

The frontend types in `src/types/index.ts` describe this response. `source` can be `openai` or `local_fallback`; the latter does not require an AI model. Plans can also include `routineEvents`, the snapshot of activities used to generate them. The Schedule screen uses that snapshot to hide a plan after activities change.

`PUT /routines` replaces the saved activity list. Send an empty list to clear it:

```json
{
  "routineEvents": [
    {
      "id": "weekday-class",
      "title": "Class",
      "startTime": "09:00",
      "endTime": "10:00",
      "repeat": "selected",
      "daysOfWeek": [1, 2, 3, 4, 5],
      "timezone": "Africa/Johannesburg"
    }
  ]
}
```

Weekdays use JavaScript numbering: Sunday is 0. One-off events need `date`; all-day one-off events can also have an inclusive `endDate`. The backend uses saved routines when generating a schedule.

## Android usage suggestions

`POST /api/usage/suggestions` accepts entertainment minutes and up to 30 pending task summaries. Per-app usage stays on the device. The endpoint returns study suggestions within the supplied time budget; it does not store usage history.

## Errors the app needs to handle

| Status | Example                                                               | Response in the app                                                |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `401`  | Shared access token rejected, or Google token expired for suggestions | Check test configuration or sign in again, depending on the route. |
| `404`  | Task no longer exists for the supplied user                           | Reload the task list.                                              |
| `409`  | Activities changed while generating or saving a schedule              | Reload activities and request a new plan.                          |
| `422`  | Invalid task or routine fields                                        | Show the validation details and let the user correct the form.     |
| `429`  | Too many suggestion requests                                          | Wait before retrying.                                              |

The app calculates progress from task records, reads usage through the native Android bridge, and keeps profile preferences locally. There are no separate progress, screen-time storage, or profile routes.
