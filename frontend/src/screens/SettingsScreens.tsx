import React, { ReactNode } from 'react';
import { Linking, Pressable, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { usePreferences } from '../context/PreferencesContext';
import { useTheme, useThemeStyles } from '../context/ThemeContext';
import { ThemeColors } from '../theme/colors';
import { useReminders } from '../context/ReminderContext';

function Card({ title, children }: { title: string; children: ReactNode }) {
  const styles = useThemeStyles(createStyles);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ children }: { children: ReactNode }) {
  const styles = useThemeStyles(createStyles);

  return <Text style={styles.body}>{children}</Text>;
}

function Choices({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  options: [number, string][];
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const styles = useThemeStyles(createStyles);

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.heading}>{label}</Text>
      <View style={styles.choices}>
        {options.map(([number, text]) => (
          <Pressable
            key={number}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: value === number, disabled }}
            onPress={() => onChange(number)}
            style={[
              styles.choice,
              value === number && styles.selected,
              disabled && { opacity: 0.5 },
            ]}
          >
            <Text style={[styles.body, value === number && styles.selectedText]}>{text}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SaveStatus() {
  const { ready, error } = usePreferences();

  return (
    <Body>
      {error ||
        (ready
          ? 'Changes are saved automatically on this device for your account.'
          : 'Loading preferences…')}
    </Body>
  );
}

export function ReminderSettingsScreen() {
  const { preferences: p, ready, updatePreferences } = usePreferences();
  const { status, error, enable, test } = useReminders();
  const { colors } = useTheme();

  return (
    <Screen>
      <Card title="Task deadline reminders">
        <Body>
          Receive a phone notification before a pending task is due. Task dates use 18:00 as the
          deadline. Completed and cancelled tasks do not send reminders. Up to 50 upcoming reminders
          are scheduled at a time; reopen the app to refresh them.
        </Body>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Body>Enable reminders</Body>
          <Switch
            accessibilityLabel="Enable task reminders"
            trackColor={{ true: colors.primary }}
            disabled={!ready}
            value={p.reminders}
            onValueChange={(value) => {
              if (value) void enable();
              else updatePreferences({ reminders: false });
            }}
          />
        </View>
        <Choices
          label="Remind me before the deadline"
          disabled={!ready}
          value={p.reminderHours}
          options={[
            [1, '1 hour'],
            [6, '6 hours'],
            [24, '1 day'],
            [48, '2 days'],
          ]}
          onChange={(reminderHours) => updatePreferences({ reminderHours })}
        />
      </Card>
      <Card title="Phone notification access">
        <Body>{status}</Body>
        <Body>
          Android may delay reminders due to battery restrictions. If the reminder time has already
          passed, that task will not be scheduled.
        </Body>
        <AppButton
          title="Enable phone notifications"
          disabled={!ready}
          onPress={() => {
            void enable();
          }}
        />
        <AppButton
          title="Send test notification"
          variant="outline"
          disabled={!ready || !p.reminders}
          onPress={() => {
            void test();
          }}
        />
        <AppButton
          title="Open app notification settings"
          variant="outline"
          onPress={() => {
            void Linking.openSettings().catch(() => {});
          }}
        />
        {!!error && <Body>{error}</Body>}
      </Card>
      <SaveStatus />
    </Screen>
  );
}

export function StudyPreferencesScreen() {
  const { preferences: p, ready, updatePreferences } = usePreferences();

  return (
    <Screen>
      <Card title="Build a plan that fits your day">
        <Body>
          These choices set the length and timing of generated study sessions. Session length also
          becomes the default estimate for new tasks.
        </Body>
        <Choices
          label="Study session"
          disabled={!ready}
          value={p.sessionMinutes}
          options={[
            [25, '25 min'],
            [45, '45 min'],
            [60, '60 min'],
          ]}
          onChange={(sessionMinutes) => updatePreferences({ sessionMinutes })}
        />
        <Choices
          label="Break between sessions"
          disabled={!ready}
          value={p.breakMinutes}
          options={[
            [5, '5 min'],
            [10, '10 min'],
            [15, '15 min'],
          ]}
          onChange={(breakMinutes) => updatePreferences({ breakMinutes })}
        />
        <Choices
          label="Daily study window (including breaks)"
          disabled={!ready}
          value={p.dailyMinutes}
          options={[
            [60, '1 hour'],
            [120, '2 hours'],
            [180, '3 hours'],
            [240, '4 hours'],
          ]}
          onChange={(dailyMinutes) => updatePreferences({ dailyMinutes })}
        />
        <Choices
          label="Start studying at"
          disabled={!ready}
          value={p.startHour}
          options={[
            [7, '07:00'],
            [9, '09:00'],
            [14, '14:00'],
            [18, '18:00'],
          ]}
          onChange={(startHour) => updatePreferences({ startHour })}
        />
      </Card>
      <SaveStatus />
    </Screen>
  );
}

export function HelpSupportScreen() {
  const [error, setError] = React.useState('');

  return (
    <Screen>
      <Card title="Tasks and study plans">
        <Body>
          From Home, tap Add Task, enter a title, module, deadline and time estimate, then save. Tap
          a task to edit or delete it, or its checkbox to mark it complete. In Schedule, tap
          Generate New Schedule to build sessions using Study Preferences.
        </Body>
      </Card>
      <Card title="Reminders and dark mode">
        <Body>
          Open Profile → Reminder Settings, enable phone notifications and allow Android
          notification access. Send a test to check delivery. Keep the app installed; force-stopping
          it or restricting battery use can delay delivery. Dark mode is available in Profile and is
          remembered after restart.
        </Body>
      </Card>
      <Card title="Usage analytics and AI">
        <Body>
          Analytics needs optional Android Usage Access. Grant or revoke it from the Analytics
          screen. AI suggestions require your separate permission, a working server connection and
          pending tasks. Sample suggestions are labelled as previews.
        </Body>
      </Card>
      <Card title="Connection or sign-in problems">
        <Body>
          For a development build, keep Metro running and connect the Android emulator to
          http://10.0.2.2:8081. If Google sign-in fails, check your internet connection and try
          again. A changed native module requires a new Android build.
        </Body>
      </Card>
      <Card title="Get support">
        <Body>
          Contact admin@smartstudyai.com, or share a technical summary using an app of your choice.
          Add what went wrong and the steps to reproduce it. Your tasks, email and app usage are
          excluded from the report.
        </Body>
        <AppButton
          title="Email support"
          onPress={() => {
            void Linking.openURL(
              'mailto:admin@smartstudyai.com?subject=StudySmart%20AI%20Support',
            ).catch(() =>
              setError(
                'No email app is available. Contact admin@smartstudyai.com using your email provider.',
              ),
            );
          }}
        />
        <AppButton
          title="Share support report"
          onPress={() => {
            void Share.share({
              message:
                'StudySmart AI 1.0.0\nIssue: [describe the problem]\nSteps: [what you tapped]\nExpected: [what should happen]\nActual: [what happened]',
            }).catch(() => setError('Could not open the share sheet. Please try again.'));
          }}
        />
        {!!error && <Body>{error}</Body>}
      </Card>
    </Screen>
  );
}

export function PrivacyPolicyScreen() {
  return (
    <Screen>
      <Body>StudySmart AI • Updated 17 October 2026</Body>
      <Card title="Sign-in and local data">
        <Body>
          Google Sign-In supplies your Google account ID, name and email to identify your profile.
          Tasks, recurring activities and generated schedules are saved by the configured StudySmart
          server under your account ID. Study preferences are stored on this device. Dark mode is a
          device setting. Signing out does not delete saved tasks or preferences.
        </Body>
      </Card>
      <Card title="Task reminders">
        <Body>
          When you enable reminders and grant notification permission, task titles and deadline
          messages are stored in scheduled notifications on your device. They may be visible on the
          lock screen. You can disable reminders here and control lock-screen visibility in your
          phone settings.
        </Body>
      </Card>
      <Card title="Optional usage access">
        <Body>
          On Android, you can allow access to app usage durations for Analytics. App names and
          per-app usage are processed on the phone. Category changes are saved locally. You can
          revoke Usage Access using Manage usage access in Analytics.
        </Body>
      </Card>
      <Card title="Study scheduling">
        <Body>
          Generating a schedule sends your task details and availability to the configured server.
          The server may use OpenAI to build a plan or use its local scheduling fallback.
        </Body>
      </Card>
      <Card title="Optional AI suggestions">
        <Body>
          Only when you allow AI suggestions and tap Get AI suggestions, the app sends total
          entertainment minutes and up to 30 pending task titles, modules, deadlines, priorities and
          time estimates to the configured StudySmart server. That server uses OpenAI to generate
          suggestions. The request includes a Google sign-in token for authentication. Individual
          app names and per-app usage are not included in that request.
        </Body>
      </Card>
      <Card title="Your choices">
        <Body>
          You can edit or delete individual tasks, disable reminders, revoke Android Usage Access
          and decline AI suggestions. Android app settings → Storage → Clear storage removes this
          installation’s local app data. This does not delete tasks or schedules held by the server,
          your Google account, or data already sent to the AI service. Avoid including sensitive
          information in task titles you choose to send.
        </Body>
      </Card>
      <Card title="Service information">
        <Body>
          Contact admin@smartstudyai.com for privacy questions or requests about server-held data,
          retention or deletion. This development app does not currently provide an in-app account
          deletion service. Google and OpenAI also process information under their own service
          policies.
        </Body>
      </Card>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: 14,
    },
    heading: { color: colors.text, fontSize: 16, fontWeight: '800' },
    body: { color: colors.text, lineHeight: 22 },
    choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choice: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      minHeight: 44,
    },
    selected: { backgroundColor: colors.primary, borderColor: colors.primary },
    selectedText: { color: colors.onAccent },
  });
