# Profile settings

Profile has four settings screens. Each supports back navigation and dark mode.

- Reminder Settings requests phone notification permission, saves a lead time, and schedules local deadline notifications (at most the next 50). Tasks use their existing dueAt timestamp; dates entered through the task form use 18:00 local time. Completing, cancelling, deleting, or editing tasks reschedules reminders. Disabling reminders or signing out cancels this app's pending reminders. Reminders use the operating system scheduler, not a remote push service. Exact delivery depends on battery and notification settings.
- Study Preferences saves session duration, breaks, daily study minutes, and start time per signed-in user. Schedule uses the connected backend to create a seven-day plan that respects saved recurring activities and the selected availability window, including breaks. New tasks default to the selected session duration. The backend uses its existing AI planner with a deterministic local fallback.
- Help & Support includes instructions and a share sheet. The user can edit the report and choose where to send it; opening the sheet does not send anything.
- Privacy Policy describes the current implementation, including optional usage access and opt-in AI requests. The support contact is admin@smartstudyai.com. The project owner should confirm server retention/deletion information before publication.

## Enable phone reminders in the Android development build

Rebuild the installed development client after adding `expo-notifications`, since it includes native code. In Android Studio, sync Gradle, select the emulator, and run the app again. The dependency is autolinked in the existing Android project. Keep the manually integrated Java usage module when changing native configuration.

Keep Metro running. In the rebuilt app, sign in and open Profile → Reminder Settings → Enable phone notifications. Allow Android's permission prompt, then tap Send test notification. The test is scheduled for five seconds later; battery restrictions may delay it. The settings screen explains when the installed build lacks the native module.

No Firebase credentials or remote push server are required for these local notifications.

## Checks

Run `npm run typecheck` and `npm run test:settings` from frontend. The focused tests cover corrupt preferences, allowed values, reminder filtering/timing/capacity, and mapping study preferences to backend availability windows.
