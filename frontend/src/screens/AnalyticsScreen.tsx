import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Switch, Text, View } from 'react-native';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { StatCard } from '../components/StatCard';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';
import { categoryFor, usageTracking, UsageApp, UsageCategory } from '../services/usage';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';

const categories: UsageCategory[] = ['entertainment', 'productivity', 'education', 'other'];

export function AnalyticsScreen({ preview = false }: { preview?: boolean }) {
  const styles = useThemeStyles(createStyles);

  preview = __DEV__ && preview;

  const [devicePreview, setDevicePreview] = useState(false);
  const sampleMode = preview && !devicePreview;
  const { tasks } = useTasks();
  const { user } = useAuth();
  const [permitted, setPermitted] = useState(false);
  const [apps, setApps] = useState<UsageApp[]>([]);
  const [overrides, setOverrides] = useState<Record<string, UsageCategory>>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [consented, setConsented] = useState(false);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const generation = useRef(0);
  const usageGeneration = useRef(0);
  const key = preview
    ? 'usage_categories_development_preview_' + (sampleMode ? 'sample' : 'device')
    : `usage_categories_${user?.id ?? 'guest'}`;

  useEffect(() => {
    let active = true;

    setOverrides({});
    setSuggestions([]);
    setConsented(false);
    setCategoriesReady(false);
    AsyncStorage.getItem(key)
      .then((value) => {
        const parsed = value ? JSON.parse(value) : {};

        if (active)
          setOverrides(
            parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {},
          );
      })
      .catch(() => {
        if (active) setOverrides({});
      })
      .finally(() => {
        if (active) setCategoriesReady(true);
      });

    return () => {
      active = false;
      generation.current++;
    };
  }, [key]);
  useEffect(() => {
    generation.current++;
    setSuggestions([]);
    setBusy(false);
  }, [tasks]);

  const refresh = useCallback(async () => {
    const request = ++usageGeneration.current;

    generation.current++;
    setSuggestions([]);
    setBusy(false);

    if (sampleMode) {
      setPermitted(true);
      setError('');
      setApps([
        { packageName: 'com.google.android.youtube', appName: 'YouTube (sample)', minutes: 45 },
        {
          packageName: 'com.google.android.apps.docs',
          appName: 'Google Drive (sample)',
          minutes: 20,
        },
        { packageName: 'com.duolingo', appName: 'Duolingo (sample)', minutes: 15 },
      ]);

      return;
    }
    if (!usageTracking) {
      setError('Usage tracking requires the installed Android app.');

      return;
    }
    try {
      const granted = await usageTracking.hasPermission();

      if (request !== usageGeneration.current) return;

      setPermitted(granted);

      if (!granted) {
        setApps([]);
        setError('');

        return;
      }

      const currentApps = await usageTracking.getTodayUsage();

      if (request !== usageGeneration.current) return;

      setApps(currentApps.sort((a, b) => b.minutes - a.minutes));
      setError('');
    } catch (e) {
      if (request === usageGeneration.current) {
        setApps([]);
        setError(e instanceof Error ? e.message : 'Could not read device usage.');
      }
    }
  }, [sampleMode]);

  useFocusEffect(
    useCallback(() => {
      refresh();

      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') refresh();
      });

      return () => {
        subscription.remove();
        usageGeneration.current++;
        generation.current++;
      };
    }, [refresh]),
  );

  const changeCategory = async (packageName: string) => {
    if (!categoriesReady) return;

    generation.current++;
    setSuggestions([]);
    setBusy(false);

    const current = categoryFor(packageName, overrides);
    const updated = {
      ...overrides,
      [packageName]: categories[(categories.indexOf(current) + 1) % categories.length],
    };

    setOverrides(updated);

    try {
      await AsyncStorage.setItem(key, JSON.stringify(updated));
    } catch {
      setError('Could not save your category choice.');
    }
  };
  const totals = apps.reduce(
    (acc, app) => {
      acc[categoryFor(app.packageName, overrides)] += app.minutes;

      return acc;
    },
    { entertainment: 0, productivity: 0, education: 0, other: 0 },
  );
  const pending = tasks
    .filter(
      (task) =>
        (task.status === 'PENDING' || task.status === 'IN_PROGRESS') && task.estimatedMinutes > 0,
    )
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || b.priority - a.priority)
    .slice(0, 30);
  const recommend = async () => {
    if (sampleMode) {
      setSuggestions([
        `Sample suggestion: use ${Math.min(25, Math.floor(totals.entertainment))} minutes for Database Revision, then take a short break. This example is not generated by AI.`,
      ]);
      setError('');

      return;
    }
    if (preview || !consented || !permitted || !user || !categoriesReady) return;

    const requestGeneration = ++generation.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    setBusy(true);
    setError('');
    setSuggestions([]);

    try {
      const { idToken } = await GoogleSignin.getTokens();

      if (requestGeneration !== generation.current) return;

      const response = await apiRequest<{ suggestions: string[] }>('/api/usage/suggestions', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          entertainmentMinutes: Math.floor(totals.entertainment),
          tasks: pending.map((task) => ({
            title: task.title,
            module: task.module,
            dueAt: task.dueAt,
            priority: task.priority,
            estimatedMinutes: task.estimatedMinutes,
          })),
        }),
      });

      if (requestGeneration === generation.current) setSuggestions(response.suggestions);
    } catch (e) {
      if (requestGeneration === generation.current)
        setError(
          controller.signal.aborted
            ? 'The request timed out. Please try again.'
            : e instanceof Error
              ? e.message
              : 'Suggestions are unavailable.',
        );
    } finally {
      clearTimeout(timeout);

      if (requestGeneration === generation.current) setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>Phone app usage</Text>
      {preview && (
        <View style={styles.card}>
          <Text style={styles.section}>
            {sampleMode ? 'Sample data · development only' : 'Real device usage · development only'}
          </Text>
          <Text style={styles.body}>
            {sampleMode
              ? 'These minutes and suggestions are examples. No data is sent.'
              : 'These minutes are read from this Android device and stay on this phone. AI suggestions require Google sign-in.'}
          </Text>
          <AppButton
            title={sampleMode ? 'Read real device usage' : 'Return to sample data'}
            variant="outline"
            onPress={() => {
              generation.current++;
              usageGeneration.current++;
              setApps([]);
              setPermitted(false);
              setSuggestions([]);
              setConsented(false);
              setDevicePreview(!devicePreview);
            }}
          />
        </View>
      )}
      <Text style={styles.subtitle}>
        {sampleMode
          ? 'Sample day · fictional minutes.'
          : 'Today · real foreground usage on this Android device.'}
      </Text>
      {!sampleMode && !usageTracking && (
        <Text style={styles.body}>
          Usage tracking needs an Android development build or installed APK. It is unavailable in
          Expo Go, on iOS, and on the web.
        </Text>
      )}
      {!sampleMode && !!usageTracking && !permitted && (
        <View style={styles.card}>
          <Text style={styles.body}>
            Allow Usage Access in Android settings to see time spent in each app. This access is
            optional and can be revoked in settings. App-level usage stays on this phone.
          </Text>
          <AppButton
            title="Grant usage access"
            onPress={() =>
              usageTracking
                ?.openPermissionSettings()
                .catch(() => setError('Could not open Android settings.'))
            }
          />
        </View>
      )}
      {permitted && (
        <>
          <View style={styles.stats}>
            <StatCard label="Entertainment" value={`${Math.floor(totals.entertainment)}m`} />
            <StatCard label="Productivity" value={`${Math.floor(totals.productivity)}m`} />
            <StatCard label="Education" value={`${Math.floor(totals.education)}m`} />
          </View>
          <View style={styles.card}>
            <Text style={styles.section}>App usage breakdown</Text>
            <Text style={styles.subtitle}>
              Tap a category to change it. Other apps are excluded from entertainment suggestions.
            </Text>
            {apps.length === 0 && (
              <Text style={styles.body}>No app activity recorded today yet.</Text>
            )}
            {apps.map((app) => (
              <View key={app.packageName} style={styles.appRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.appName}>{app.appName ?? app.packageName}</Text>
                  <Text
                    accessibilityRole="button"
                    accessibilityLabel={`Change category for ${app.appName ?? app.packageName}`}
                    style={styles.subtitle}
                    onPress={() => changeCategory(app.packageName)}
                  >
                    {categoryFor(app.packageName, overrides)} · change category
                  </Text>
                </View>
                <Text style={styles.minutes}>
                  {app.minutes < 1 ? '<1' : Math.floor(app.minutes)}m
                </Text>
              </View>
            ))}
          </View>
          {(!preview || sampleMode) && (
            <View style={styles.card}>
              <Text style={styles.section}>Study suggestions</Text>
              <Text style={styles.body}>
                Use some entertainment time for tasks already on your plan.
              </Text>
              <Text style={styles.subtitle}>
                {preview
                  ? 'Preview suggestions are fixed examples; no data is sent.'
                  : 'If you enable AI suggestions, your entertainment minutes and up to 30 pending task titles, subjects, deadlines, priorities, and estimates are sent to our server and OpenAI when you tap below. App names and individual app usage are not sent.'}
              </Text>
              <View style={styles.appRow}>
                <Text style={styles.body}>
                  {preview ? 'Enable sample suggestions' : 'Allow AI suggestions'}
                </Text>
                <Switch
                  accessibilityLabel="Allow sending task details for AI suggestions"
                  value={consented}
                  onValueChange={(value) => {
                    generation.current++;
                    setBusy(false);
                    setSuggestions([]);
                    setConsented(value);
                  }}
                />
              </View>
              {(Math.floor(totals.entertainment) === 0 || (!preview && pending.length === 0)) && (
                <Text style={styles.subtitle}>
                  Add a pending task with a time estimate and record at least one minute of
                  entertainment usage to get suggestions.
                </Text>
              )}
              <AppButton
                title={
                  busy ? 'Generating…' : preview ? 'Show sample suggestion' : 'Get AI suggestions'
                }
                disabled={
                  busy ||
                  !consented ||
                  !categoriesReady ||
                  Math.floor(totals.entertainment) === 0 ||
                  (!preview && pending.length === 0)
                }
                onPress={recommend}
              />
              {suggestions.map((suggestion, index) => (
                <Text key={index} style={styles.body}>
                  • {suggestion}
                </Text>
              ))}
            </View>
          )}
          <AppButton title="Refresh usage" variant="outline" onPress={refresh} />
          {!sampleMode && (
            <AppButton
              title="Manage usage access"
              variant="outline"
              onPress={() =>
                usageTracking
                  ?.openPermissionSettings()
                  .catch(() => setError('Could not open Android settings.'))
              }
            />
          )}
          {sampleMode && (
            <>
              <AppButton
                title="Preview empty usage"
                variant="outline"
                onPress={() => {
                  generation.current++;
                  setApps([]);
                  setSuggestions([]);
                  setError('');
                }}
              />
              <AppButton
                title="Preview request failure"
                variant="outline"
                onPress={() => {
                  setSuggestions([]);
                  setError('Sample error: suggestions are unavailable. Please try again.');
                }}
              />
            </>
          )}
        </>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: { color: colors.text, fontSize: 26, fontWeight: '900' },
    subtitle: { color: colors.muted, fontSize: 13 },
    stats: { flexDirection: 'row', gap: 6 },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    section: { color: colors.text, fontWeight: '900', fontSize: 16 },
    appRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingTop: 8,
    },
    appName: { color: colors.text, fontWeight: '700' },
    minutes: { color: colors.muted, width: 48, textAlign: 'right' },
    body: { color: colors.text, lineHeight: 20 },
    error: { color: colors.danger },
  });
