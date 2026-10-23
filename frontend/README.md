# Frontend

The React Native app contains task management, study scheduling, progress,
Android usage analytics, and profile settings. It uses Expo with an existing
native Android project.

## Connect the backend

The task and schedule screens use the FastAPI service in `../backend`. Set
`EXPO_PUBLIC_API_BASE_URL` in a local `.env` file before starting Expo. For an
Android phone connected over USB, reverse ports 8081 and 8000 with ADB and use
`http://127.0.0.1:8000` as the API base URL.

For a hosted backend, use its HTTPS URL and set `EXPO_PUBLIC_API_TOKEN` to match
the backend's temporary test access token. Restart Expo with `npx expo start
--clear` after changing `.env`, then reload the app. For an installed release
build, rebuild the app so the new environment values are bundled.

Routines sync with the backend when the Schedule screen opens. The first load
migrates existing local routines if there is no cloud copy. A failed routine load
disables planning rather than assuming there are no activities. After adding or
editing an activity, the previous plan is hidden until Refresh Schedule completes.
Use the All day option for holidays, with an optional inclusive end date.

## Run the native features

Analytics reads Android usage through the Java module after the user grants
Usage Access. Profile holds theme settings, per-account study preferences, and
local deadline reminders. The task form includes a date picker.

Run `npm install` and rebuild the Android app (`npm run android`) to include the
usage module and `expo-notifications`. Expo Go cannot load these native features.
Avoid `expo prebuild --clean`, which removes the manual Java integration.
Configure the same API base URL already used for tasks; no second API service
is required. The backend needs `GOOGLE_WEB_CLIENT_ID` matching the frontend
Google web client ID for AI usage suggestions.

See `docs/settings.md` and `../android-usage/README.md` for setup and device checks.

## Check changes

Run `npm run typecheck` and `npm test` from this folder. These checks do not
replace testing Google sign-in, usage permissions, or notifications on Android.

## Windows native build paths

On Windows the Android app stages generated C++ build files under a short,
checkout-specific folder in the system temporary directory. This avoids the
Ninja 260-character object path failure in deeply nested checkouts. Other
platforms keep the default staging directory.
