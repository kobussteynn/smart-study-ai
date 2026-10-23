# Database

The storage code lives in `backend/app/`, rather than in this folder. Use this note to find the schema and the JSON import process.

`database.py` defines the PostgreSQL tables for tasks, schedules, routines, and schedule contexts. It creates missing tables when the database store starts. `storage.py` provides the JSON store used by default in local development, and `migration.py` imports an existing JSON store into the database.

Set `STUDYSMART_STORAGE=database` and `DATABASE_URL` to use PostgreSQL. The import flags and recovery notes are in [the backend README](../backend/README.md).

Records are scoped by user ID, but task and schedule routes currently accept that ID from the client. Database filtering alone does not authenticate a user. Per-app Android usage is kept on the phone, rather than stored in these tables.
