# Android app-usage module

Owners: Johan and Maritza. The Java bridge is part of the existing React Native
Android app, under
`frontend/android/app/src/main/java/com/group9/studysmartai/`.
This folder holds the feature documentation and dependency-free Java tests.

## Where the feature lives

- `UsageTrackingModule`: checks Usage Access, opens Android settings, and reads today's usage.
- `UsageAccumulator`: clips foreground sessions to local midnight, stops counting on
  pause/lock/screen-off/shutdown, and handles late pause events after app switches.
- `UsageTrackingPackage`: registers `NativeModules.UsageTracking` in `MainApplication.kt`.
- Analytics screen: app labels (package fallback), minutes per app, category totals,
  account-specific local category overrides, permission refresh on return from settings,
  and optional AI study suggestions.
- Python endpoint: verifies Google ID tokens, limits requests, validates structured AI
  output, and constrains study blocks to the supplied time budget and pending tasks.

## Run on Android

1. Configure Google sign-in using `frontend/docs/GOOGLE_AUTH_SETUP.md`.
2. Set up the API using `backend/README.md` and set `frontend/.env` from its example.
   For an Android emulator use `http://10.0.2.2:8000`; for a phone use your computer's
   LAN IP and permit port 8000 through its firewall. Use HTTPS for deployed builds.
3. Install frontend dependencies, then run `npm run android` in `frontend/` with the
   Android SDK and the JDK required by the existing Expo/Gradle project installed.
4. Sign in, open Analytics, tap **Grant usage access**, and enable Smart Study AI.
5. Use another app briefly and return. Set its category if needed. Add a pending task
   with a positive estimate, enable **Allow AI suggestions**, then request suggestions.

The Java module requires a native development build or APK. Expo Go, iOS, and web
cannot provide Android usage data. The app's existing Android minimum SDK applies.
Do not run `expo prebuild --clean`: it deletes these manually integrated native files.

## What the tracker records

Usage access is optional and revocable from **Manage usage access**. No background
service, database upload, or continuous monitoring is implemented. Usage belongs to
the Android device/profile, so the same phone activity is visible to each app account
using that device; only category preferences are scoped by signed-in account locally.
Package names and individual app durations stay on the phone. AI requests explicitly
share the total entertainment minutes and up to 30 pending task details through the
backend to OpenAI. Google ID tokens are sent only to the backend for authentication.
The suggestions endpoint stores no usage history and requests OpenAI `store: false`.
The main API stores tasks, recurring activities and schedules in its configured JSON or PostgreSQL store.

App categories come from editable keyword matches. They cannot tell whether a
particular session was spent studying; unknown apps remain Other. The tracker
counts the most recently resumed app. It does not measure simultaneous
split-screen/PiP viewing or background audio. It looks back one day
before midnight to seed the current session; missing/OEM-delayed events or sessions
starting before that lookback can produce incomplete totals. Values are retained as
fractional minutes, and display rounding does not inflate the AI budget. The study
app itself is excluded. Android package visibility can prevent a friendly app label.

## Checks

From the repository root, with Java tools on PATH:

```powershell
New-Item -ItemType Directory -Force android-usage/build
javac -d android-usage/build frontend/android/app/src/main/java/com/group9/studysmartai/UsageAccumulator.java android-usage/tests/UsageAccumulatorTest.java
java -ea -cp android-usage/build com.group9.studysmartai.UsageAccumulatorTest
```

Device acceptance checks:

- Deny access: no usage appears and the app remains usable.
- Grant access, use an app, return: activity appears without restarting.
- Change category, restart/sign in again: the choice persists for that account.
- Revoke access: returning clears usage and suggestions.
- Screen lock and midnight: only foreground time within today is counted.
- AI opt-in off: no suggestion request can be sent.
- Missing/expired sign-in, missing server key, timeout: a readable error is shown.
- Valid request: suggestions refer to existing tasks and stay within the time budget.

API reference sources: [Android usage events](https://developer.android.com/reference/android/app/usage/UsageEvents.Event),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Google token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
