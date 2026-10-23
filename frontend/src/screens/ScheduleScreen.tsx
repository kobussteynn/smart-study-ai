import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { Screen } from '../components/Screen';
import { useAuth } from '../context/AuthContext';
import { scheduleWindow } from '../services/preferences';
import { usePreferences } from '../context/PreferencesContext';
import { useTasks } from '../context/TaskContext';
import { generateSchedule, getLatestSchedule } from '../services/scheduleApi';
import { ThemeColors } from '../theme/colors';
import { useTheme, useThemeStyles } from '../context/ThemeContext';
import { RoutineEvent, StudySchedule, StudySession } from '../types';
import { RoutineEditor } from '../components/RoutineEditor';
import { matchesRoutineSnapshot } from '../services/routineSignature';

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function ScheduleScreen() {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const { tasks } = useTasks();
  const { preferences, ready: preferencesReady } = usePreferences();
  const { user } = useAuth();
  const [savedSchedule, setSchedule] = useState<StudySchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routineState, setRoutineState] = useState<{
    userId: string;
    events: RoutineEvent[];
  } | null>(null);
  const handleRoutineChange = useCallback((userId: string, events: RoutineEvent[] | null) => {
    setRoutineState(events ? { userId, events } : null);
  }, []);
  const routinesReady = Boolean(user && routineState?.userId === user.id);
  const schedule = matchesRoutineSnapshot(
    savedSchedule,
    user?.id,
    routinesReady ? routineState!.events : null,
  )
    ? savedSchedule
    : null;
  const outdated = routinesReady && savedSchedule?.userId === user?.id && !schedule;

  useEffect(() => {
    if (!user) return;

    let active = true;

    setLoading(true);
    getLatestSchedule(user.id)
      .then((latest) => {
        if (active) setSchedule(latest);
      })
      .catch((requestError: unknown) => {
        if (active)
          setError(
            requestError instanceof Error ? requestError.message : 'Could not load the schedule.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const createSchedule = async () => {
    if (!user || !preferencesReady || !routineState || routineState.userId !== user.id) return;

    setLoading(true);
    setError(null);

    try {
      setSchedule(
        await generateSchedule(user.id, {
          planningDays: 7,
          ...scheduleWindow(preferences),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg',
          routineEvents: routineState.events,
        }),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Could not generate the schedule.',
      );
    } finally {
      setLoading(false);
    }
  };

  const days = useMemo(() => {
    const grouped = new Map<string, StudySession[]>();

    schedule?.sessions.forEach((session) => {
      const key = new Date(session.startAt).toDateString();

      grouped.set(key, [...(grouped.get(key) ?? []), session]);
    });

    return Array.from(grouped.entries());
  }, [schedule]);

  const totalMinutes =
    schedule?.sessions.reduce((total, session) => total + session.durationMinutes, 0) ?? 0;

  return (
    <Screen contentStyle={styles.screenContent}>
      <View>
        <Text style={styles.eyebrow}>SMART PLANNER</Text>
        <Text style={styles.title}>Your study schedule</Text>
        <Text style={styles.subtitle}>
          Turn upcoming work into focused, manageable study sessions.
        </Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIcon}>
            <Text style={styles.heroIconText}>AI</Text>
          </View>
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>BACKEND CONNECTED</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>A clear plan for every deadline</Text>
        <Text style={styles.heroBody}>
          Sessions are arranged around task urgency, workload, and regular breaks.
        </Text>
      </View>

      <AppButton
        title={loading ? 'Generating…' : savedSchedule ? 'Refresh Schedule' : 'Generate Schedule'}
        onPress={() => void createSchedule()}
        disabled={loading || tasks.length === 0 || !routinesReady || !preferencesReady}
      />
      <RoutineEditor onEventsChange={handleRoutineChange} />

      {outdated && (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Schedule needs refreshing</Text>
          <Text style={styles.warningText}>
            The saved plan does not match your current activities. Refresh Schedule to create a plan
            that avoids them.
          </Text>
        </View>
      )}

      {loading && !schedule && <ActivityIndicator size="large" color={colors.primary} />}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not connect to the planner</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!schedule ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Text style={styles.emptyIconText}>▣</Text>
          </View>
          <Text style={styles.emptyTitle}>Your plan will appear here</Text>
          <Text style={styles.emptyText}>
            {tasks.length
              ? 'Generate a schedule from your tasks using the connected planner.'
              : 'Add a pending task before generating your study schedule.'}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>PLAN OVERVIEW</Text>
            <Text style={styles.summaryText}>{schedule.summary}</Text>
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{schedule.sessions.length}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{Math.round((totalMinutes / 60) * 10) / 10}h</Text>
                <Text style={styles.statLabel}>Study time</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statValue}>{days.length}</Text>
                <Text style={styles.statLabel}>Days</Text>
              </View>
            </View>
          </View>

          {days.map(([day, sessions]) => (
            <View key={day} style={styles.daySection}>
              <View style={styles.dayHeader}>
                <Text style={styles.day}>{formatDay(sessions[0].startAt)}</Text>
                <Text style={styles.dayCount}>
                  {sessions.length} session{sessions.length === 1 ? '' : 's'}
                </Text>
              </View>
              {sessions.map((session, index) => (
                <View key={session.id} style={styles.timelineRow}>
                  <View style={styles.timeline}>
                    <View style={styles.timelineDot} />
                    {index < sessions.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.sessionCard}>
                    <View style={styles.sessionTopRow}>
                      <Text style={styles.time}>
                        {formatTime(session.startAt)} – {formatTime(session.endAt)}
                      </Text>
                      <View style={styles.durationBadge}>
                        <Text style={styles.durationText}>{session.durationMinutes} min</Text>
                      </View>
                    </View>
                    <Text style={styles.task}>{session.title}</Text>
                    <Text style={styles.module}>{session.module}</Text>
                    <Text style={styles.focus}>{session.focus}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}

          {schedule.warnings.length > 0 && (
            <View style={styles.warningCard}>
              <Text style={styles.warningTitle}>Planning note</Text>
              {schedule.warnings.map((warning) => (
                <Text key={warning} style={styles.warningText}>
                  • {warning}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screenContent: { paddingBottom: 32 },
    eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
    title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 4 },
    subtitle: { color: colors.muted, marginTop: 4, lineHeight: 20 },
    hero: { backgroundColor: colors.primary, borderRadius: 20, padding: 18, gap: 10 },
    heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    heroIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroIconText: { color: '#FFFFFF', fontWeight: '900', fontSize: 17 },
    previewBadge: {
      backgroundColor: 'rgba(255,255,255,0.16)',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    previewBadgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 10, letterSpacing: 0.7 },
    heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
    heroBody: { color: '#EDEAFF', lineHeight: 20 },
    empty: {
      padding: 28,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    emptyIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyIconText: { color: colors.primary, fontSize: 22, fontWeight: '900' },
    emptyTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
    emptyText: { color: colors.muted, textAlign: 'center', marginTop: 7, lineHeight: 20 },
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 17,
    },
    summaryLabel: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    summaryText: { color: colors.text, fontWeight: '700', lineHeight: 20, marginTop: 7 },
    statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
    stat: { flex: 1, alignItems: 'center' },
    statValue: { color: colors.text, fontSize: 21, fontWeight: '900' },
    statLabel: { color: colors.muted, fontSize: 11, marginTop: 3 },
    statDivider: { width: 1, height: 32, backgroundColor: colors.border },
    daySection: { gap: 10 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    day: { color: colors.text, fontWeight: '900', fontSize: 17 },
    dayCount: { color: colors.muted, fontSize: 11, fontWeight: '700' },
    timelineRow: { flexDirection: 'row' },
    timeline: { width: 24, alignItems: 'center' },
    timelineDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      marginTop: 18,
      backgroundColor: colors.primary,
      borderWidth: 3,
      borderColor: colors.primarySoft,
    },
    timelineLine: { width: 2, flex: 1, minHeight: 70, backgroundColor: colors.primarySoft },
    sessionCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 15,
      padding: 15,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 2,
    },
    sessionTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    time: { color: colors.primary, fontWeight: '800', fontSize: 12 },
    durationBadge: {
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    durationText: { color: colors.primaryDark, fontWeight: '800', fontSize: 10 },
    task: { color: colors.text, fontWeight: '900', fontSize: 16, marginTop: 10 },
    module: { color: colors.muted, fontSize: 12, marginTop: 3 },
    focus: {
      color: colors.text,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 9,
      paddingTop: 9,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    warningCard: {
      backgroundColor: colors.warningSoft,
      borderRadius: 15,
      padding: 15,
      borderWidth: 1,
      borderColor: '#F2DDA4',
    },
    warningTitle: { color: colors.text, fontWeight: '900' },
    warningText: { color: colors.muted, marginTop: 6, lineHeight: 18 },
    errorCard: {
      backgroundColor: colors.surface,
      borderRadius: 15,
      padding: 15,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    errorTitle: { color: colors.danger, fontWeight: '900' },
    errorText: { color: colors.text, marginTop: 6, lineHeight: 18 },
  });
