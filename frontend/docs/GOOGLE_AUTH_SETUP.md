# Google sign-in setup

Android sign-in is already wired through `@react-native-google-signin/google-signin` in `src/context/AuthContext.tsx`. The web branch uses a demo account. This guide covers the configuration needed to run the Android flow and the backend work still outstanding.

## Use the existing Android project

Install dependencies in `frontend/` and use a native development build. Expo Go cannot load the sign-in library. Keep the checked-in Android project: `expo prebuild --clean` removes the manually integrated usage-tracking files.

## Configure the Google project

1. Open Google Cloud Console.
2. Create or select the StudySmart AI project.
3. Configure the OAuth consent screen.
4. Create the OAuth client(s) you need.
5. For Android, use package name: `com.group9.studysmartai`.
6. Add the SHA-1 fingerprint for your development/release signing certificate.

## Set the web client ID

Set the OAuth web client ID in `frontend/.env`:

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

`AuthContext.tsx` reads this value when configuring Google sign-in. For usage suggestions, set the backend's `GOOGLE_WEB_CLIENT_ID` to the same value. Do not put OAuth client secrets in the mobile app.

## Build and run

From `frontend/`, with the Android SDK and the required JDK installed:

```bash
npm install
npm run android
```

Restart Metro with `npx expo start --clear` after changing `.env`. Rebuild installed release apps to include new environment values.

## Finish backend authentication

The Android flow currently keeps the Google profile ID, name, and email in app state. Task and schedule calls still send a client-supplied user ID. There is no implemented `/auth/google` route or backend per-user session for those calls.

Before storing real student records, send Google's signed ID token to the backend, verify it there, and use the verified subject to identify the account. The usage-suggestions route already verifies Google tokens, but task, routine, and schedule routes need their own authenticated access. See [the backend authentication notes](../../backend/README.md#request-authentication).

## Check on a device

- Open the app while signed out and confirm the Login screen appears.
- Sign in with Google and confirm the Dashboard shows the selected account.
- Cancel sign-in and check that the app stays on Login.
- Sign out and confirm the Login screen returns.
- Close and reopen the app to check the actual session behavior. `AuthContext` currently holds the profile in memory; persistent session restoration remains to be implemented.

Once backend authentication is added, also test expired tokens, tokens for another client, and attempts to access another account's records.
