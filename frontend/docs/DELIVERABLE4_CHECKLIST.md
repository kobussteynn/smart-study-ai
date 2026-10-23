# Deliverable 4 implementation checklist

Frontend and sign-in owners: Taiwo and Emma.

This list reflects the current implementation. Checked items mean the code exists; they do not record a fresh device test.

## Interface

- [x] Login, dashboard, task list, and task form
- [x] Schedule and routine editor
- [x] Progress, Android analytics, and profile settings
- [x] Shared components, navigation, and themes
- [x] Task validation and API error messages

## Integration

- [x] Task CRUD through the backend
- [x] Schedule generation and saved schedules
- [x] Saved routines and conflict checks
- [x] Google sign-in on Android
- [x] Native Android usage data and editable categories
- [x] Opt-in usage suggestions with Google token verification
- [x] Local deadline reminders
- [x] Configurable backend URL and temporary shared access token
- [ ] Verified Google identity for task, routine, and schedule requests
- [ ] Study streak and achievements derived from recorded activity

## Device checks before assessment

Record results against the build being submitted. See [usage checks](../../android-usage/README.md#checks) and [reminder setup](settings.md) for the steps.

- [ ] Sign in and sign out using the registered Android build
- [ ] Add, edit, complete, and delete a task against the configured backend
- [ ] Change a routine and regenerate the schedule
- [ ] Grant and revoke usage access, then refresh Analytics
- [ ] Request suggestions with AI opt-in enabled
- [ ] Enable reminders and receive a test notification
- [ ] Check error messages with the backend unavailable
