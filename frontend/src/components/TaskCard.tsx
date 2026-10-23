import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AcademicTask } from '../types';
import { ThemeColors } from '../theme/colors';
import { useTheme, useThemeStyles } from '../context/ThemeContext';

type Props = {
  task: AcademicTask;
  onPress?: () => void;
  onToggle?: () => void;
};

const priorityText = { 1: 'Low', 2: 'Medium', 3: 'High' } as const;

export function TaskCard({ task, onPress, onToggle }: Props) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const priorityColor = { 1: colors.success, 2: colors.warning, 3: colors.danger } as const;
  const completed = task.status === 'COMPLETED';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.84 }]}
    >
      <Pressable onPress={onToggle} style={[styles.checkbox, completed && styles.checkboxDone]}>
        <Text style={styles.checkText}>{completed ? '✓' : ''}</Text>
      </Pressable>
      <View style={styles.content}>
        <Text style={[styles.title, completed && styles.completed]}>{task.title}</Text>
        <Text style={styles.meta}>
          {task.module} • {new Date(task.dueAt).toLocaleDateString()}
        </Text>
        <Text style={[styles.priority, { color: priorityColor[task.priority] }]}>
          {priorityText[task.priority]} priority
        </Text>
      </View>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkText: { color: colors.onAccent, fontWeight: '900' },
    content: { flex: 1, gap: 3 },
    title: { color: colors.text, fontSize: 15, fontWeight: '700' },
    completed: { textDecorationLine: 'line-through', color: colors.muted },
    meta: { color: colors.muted, fontSize: 12 },
    priority: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  });
