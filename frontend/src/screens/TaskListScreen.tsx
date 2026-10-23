import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { TaskCard } from '../components/TaskCard';
import { useTasks } from '../context/TaskContext';
import { RootStackParamList } from '../navigation/types';
import { ThemeColors } from '../theme/colors';
import { useTheme, useThemeStyles } from '../context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Tasks'>;

type Filter = 'ALL' | 'PENDING' | 'COMPLETED';

export function TaskListScreen({ navigation }: Props) {
  const styles = useThemeStyles(createStyles);
  const { colors } = useTheme();
  const { tasks, loading, error, refreshTasks, toggleComplete } = useTasks();
  const [filter, setFilter] = useState<Filter>('ALL');

  const visible = tasks.filter(
    (task) =>
      filter === 'ALL' ||
      (filter === 'COMPLETED' ? task.status === 'COMPLETED' : task.status !== 'COMPLETED'),
  );

  return (
    <Screen>
      <View style={styles.filters}>
        {(['ALL', 'PENDING', 'COMPLETED'] as Filter[]).map((item) => (
          <Text
            key={item}
            onPress={() => setFilter(item)}
            style={[styles.filter, filter === item && styles.filterActive]}
          >
            {item}
          </Text>
        ))}
      </View>
      {loading && <ActivityIndicator color={colors.primary} />}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry} onPress={() => void refreshTasks()}>
            Try again
          </Text>
        </View>
      )}
      {visible.length === 0 ? (
        <Text style={styles.empty}>No tasks in this filter.</Text>
      ) : (
        visible.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onToggle={() => void toggleComplete(task.id)}
            onPress={() => navigation.navigate('EditTask', { taskId: task.id })}
          />
        ))
      )}
      <AppButton title="+ Add Task" onPress={() => navigation.navigate('AddTask')} />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    filters: { flexDirection: 'row', gap: 8 },
    filter: {
      flex: 1,
      textAlign: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 10,
      color: colors.muted,
      fontWeight: '700',
      fontSize: 11,
    },
    filterActive: { backgroundColor: colors.primary, color: '#FFF', borderColor: colors.primary },
    empty: { textAlign: 'center', paddingVertical: 36, color: colors.muted },
    errorCard: {
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.danger,
    },
    errorText: { color: colors.text },
    retry: { color: colors.primary, fontWeight: '800', marginTop: 8 },
  });
