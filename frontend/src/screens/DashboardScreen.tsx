import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { StatCard } from '../components/StatCard';
import { TaskCard } from '../components/TaskCard';
import { AppButton } from '../components/AppButton';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TaskContext';
import { RootStackParamList } from '../navigation/types';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';

export function DashboardScreen() {
  const styles = useThemeStyles(createStyles);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { tasks, toggleComplete } = useTasks();
  const pending = tasks.filter(
    (task) => task.status !== 'COMPLETED' && task.status !== 'CANCELLED',
  );
  const completed = tasks.filter((task) => task.status === 'COMPLETED').length;
  const thisWeek = pending.filter(
    (task) => new Date(task.dueAt).getTime() - Date.now() <= 7 * 86400000,
  ).length;

  return (
    <Screen>
      <View>
        <Text style={styles.eyebrow}>STUDYSMART AI</Text>
        <Text style={styles.title}>Welcome back, {user?.name.split(' ')[0]}</Text>
        <Text style={styles.subtitle}>Here is your academic overview.</Text>
      </View>

      <View style={styles.stats}>
        <StatCard label="Pending" value={String(pending.length)} />
        <StatCard label="Due this week" value={String(thisWeek)} />
        <StatCard label="Completed" value={String(completed)} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming tasks</Text>
        <Text style={styles.link} onPress={() => navigation.navigate('Tasks')}>
          View all
        </Text>
      </View>

      {pending.slice(0, 3).map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onToggle={() => void toggleComplete(task.id)}
          onPress={() => navigation.navigate('EditTask', { taskId: task.id })}
        />
      ))}

      <AppButton title="+ Add Task" onPress={() => navigation.navigate('AddTask')} />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
    title: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 4 },
    subtitle: { color: colors.muted, marginTop: 4 },
    stats: { flexDirection: 'row', gap: 10 },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
    link: { color: colors.primary, fontWeight: '700' },
  });
