# Railway infrastructure

This folder records the temporary Railway setup for mobile testing. The API and
PostgreSQL are configured there; the details below describe the saved setup and
have not been checked against the live deployment in this documentation edit.

## Temporary mobile testing service

- Project: [SmartStudyAI-Temporary](https://railway.com/project/86d90b3f-23f2-476a-bab6-3c426f788de7)
- Service: `studysmart-api`, production environment.
- API: `https://studysmart-api-production.up.railway.app`
- Backend image is built from `backend/Dockerfile`.
- A PostgreSQL service stores tasks, routines, and schedules on its persistent volume.
- `STUDYSMART_STORAGE=database`, `DATABASE_URL` references the Postgres service,
  and `PORT=8000`.
- The API's `/data` volume retains `/data/store.json` as the original migration
  source. It is not updated by new database writes. The one-time import uses
  `STUDYSMART_MIGRATE_JSON=1`; disable that flag after migration succeeds.
- `STUDYSMART_API_TOKEN` is set in Railway; the matching temporary test token is
  in the frontend's ignored local `.env` as `EXPO_PUBLIC_API_TOKEN`.
- Task and schedule endpoints require the bearer token. `/health` is public.

Only test data should be stored here until verified user authentication is
implemented. The shared app token does not verify individual user identities.
The frontend's local `.env` points at this HTTPS endpoint; restart Expo and reload
the phone app after environment changes, or rebuild an installed release app.

The temporary project can incur Railway usage charges while it runs. Remove it
after testing once its stored data is no longer needed. No automatic deletion
is scheduled.
