import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { StatCard } from '../components/StatCard';
import { useTasks } from '../context/TaskContext';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';
import { AcademicTask } from '../types';

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function completionDates(tasks: AcademicTask[]) {
  return new Set(
    tasks
      .filter(
        (task) =>
          task.status === 'COMPLETED' &&
          typeof task.updatedAt === 'string',
      )
      .map((task) => {
        const completedAt = new Date(task.updatedAt as string);

        return Number.isNaN(completedAt.getTime())
          ? null
          : dayKey(completedAt);
      })
      .filter((value): value is string => value !== null),
  );
}

function calculateStudyStreak(tasks: AcademicTask[]) {
  const completedDays = completionDates(tasks);

  if (completedDays.size === 0) {
    return 0;
  }

  const cursor = new Date();

  /*
   * A streak remains active if the user completed a task
   * today or yesterday.
   */
  if (!completedDays.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);

    if (!completedDays.has(dayKey(cursor))) {
      return 0;
    }
  }

  let streak = 0;

  while (completedDays.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getAchievements(
  completed: number,
  total: number,
  streak: number,
) {
  const achievements: string[] = [];

  if (completed >= 1) {
    achievements.push('🏆 Completed your first task');
  }

  if (completed >= 3) {
    achievements.push('⭐ Completed 3 tasks');
  }

  if (completed >= 5) {
    achievements.push('🎯 Completed 5 tasks');
  }

  if (streak >= 3) {
    achievements.push('🔥 3-day study streak');
  }

  if (streak >= 5) {
    achievements.push('🔥 5-day study streak');
  }

  if (total > 0 && completed === total) {
    achievements.push('✅ Completed all current tasks');
  }

  return achievements;
}

export function ProgressScreen() {
  const styles = useThemeStyles(createStyles);
  const { tasks } = useTasks();

  const completed = tasks.filter(
    (task) => task.status === 'COMPLETED',
  ).length;

  const pending = tasks.length - completed;

  const percentage = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0;

  const streak = calculateStudyStreak(tasks);

  const achievements = getAchievements(
    completed,
    tasks.length,
    streak,
  );

  return (
    <Screen>
      <Text style={styles.title}>Progress Dashboard</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Task completion</Text>

        <Text style={styles.big}>
          {completed}/{tasks.length}
        </Text>

        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${percentage}%` },
            ]}
          />
        </View>

        <Text style={styles.percent}>
          {percentage}% completed
        </Text>
      </View>

      <View style={styles.stats}>
        <StatCard
          label="Completed"
          value={String(completed)}
        />

        <StatCard
          label="Pending"
          value={String(pending)}
        />

        <StatCard
          label="Study streak"
          value={String(streak)}
          helper={streak === 1 ? 'day' : 'days'}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>
          Recent achievements
        </Text>

        {achievements.length > 0 ? (
          achievements.map((achievement) => (
            <Text
              key={achievement}
              style={styles.achievement}
            >
              {achievement}
            </Text>
          ))
        ) : (
          <Text style={styles.emptyAchievement}>
            Complete your first task to unlock an achievement.
          </Text>
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: {
      color: colors.text,
      fontSize: 26,
      fontWeight: '900',
    },

    card: {
      backgroundColor: colors.surface,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      gap: 10,
    },

    label: {
      color: colors.muted,
      fontWeight: '700',
    },

    big: {
      color: colors.text,
      fontSize: 34,
      fontWeight: '900',
    },

    track: {
      height: 12,
      backgroundColor: colors.border,
      borderRadius: 20,
      overflow: 'hidden',
    },

    fill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 20,
    },

    percent: {
      color: colors.primary,
      fontWeight: '800',
    },

    stats: {
      flexDirection: 'row',
      gap: 10,
    },

    achievement: {
      color: colors.text,
      paddingVertical: 4,
    },

    emptyAchievement: {
      color: colors.muted,
      paddingVertical: 4,
      lineHeight: 20,
    },
  });