import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { StatCard } from '../components/StatCard';
import { useTasks } from '../context/TaskContext';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';

export function ProgressScreen() {
  const styles = useThemeStyles(createStyles);
  const { tasks } = useTasks();
  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
  const pending = tasks.length - completed;
  const percentage = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;

  return (
    <Screen>
      <Text style={styles.title}>Progress Dashboard</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Task completion</Text>
        <Text style={styles.big}>
          {completed}/{tasks.length}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percentage}%` }]} />
        </View>
        <Text style={styles.percent}>{percentage}% completed</Text>
      </View>
      <View style={styles.stats}>
        <StatCard label="Completed" value={String(completed)} />
        <StatCard label="Pending" value={String(pending)} />
        <StatCard label="Study streak" value="5" helper="days" />
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Recent achievements</Text>
        <Text style={styles.achievement}>🏆 Completed your first prototype task</Text>
        <Text style={styles.achievement}>🔥 5-day study streak</Text>
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: { color: colors.text, fontSize: 26, fontWeight: '900' },
    card: {
      backgroundColor: colors.surface,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      gap: 10,
    },
    label: { color: colors.muted, fontWeight: '700' },
    big: { color: colors.text, fontSize: 34, fontWeight: '900' },
    track: { height: 12, backgroundColor: colors.border, borderRadius: 20, overflow: 'hidden' },
    fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 20 },
    percent: { color: colors.primary, fontWeight: '800' },
    stats: { flexDirection: 'row', gap: 10 },
    achievement: { color: colors.text, paddingVertical: 4 },
  });
