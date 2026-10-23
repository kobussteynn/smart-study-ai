import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { usePreferences } from '../context/PreferencesContext';
import { TaskDateField, localDateText, parseTaskDate } from '../components/TaskDateField';
import { useTasks } from '../context/TaskContext';
import { RootStackParamList } from '../navigation/types';
import { Priority } from '../types';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';

type AddProps = NativeStackScreenProps<RootStackParamList, 'AddTask'>;

type EditProps = NativeStackScreenProps<RootStackParamList, 'EditTask'>;

type Props = AddProps | EditProps;

export function TaskFormScreen({ navigation, route }: Props) {
  const styles = useThemeStyles(createStyles);
  const { preferences } = usePreferences();
  const { tasks, addTask, updateTask, deleteTask } = useTasks();
  const taskId = route.name === 'EditTask' ? route.params.taskId : undefined;
  const existing = useMemo(() => tasks.find((task) => task.id === taskId), [tasks, taskId]);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [module, setModule] = useState(existing?.module ?? '');
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? 2);
  const [minutes, setMinutes] = useState(
    String(existing?.estimatedMinutes ?? preferences.sessionMinutes),
  );
  const [dueDate, setDueDate] = useState(existing ? localDateText(new Date(existing.dueAt)) : '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const estimatedMinutes = Number(minutes);

    if (!title.trim() || !module.trim() || !dueDate.trim()) {
      Alert.alert('Check your form', 'Task title, module and due date are required.');

      return;
    }

    const parsedDate = parseTaskDate(dueDate);

    if (!parsedDate) {
      Alert.alert('Invalid date', 'Enter a valid date or choose one from the calendar.');

      return;
    }
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
      Alert.alert('Invalid study time', 'Estimated minutes must be greater than zero.');

      return;
    }

    const data = {
      title: title.trim(),
      module: module.trim(),
      type: existing?.type ?? ('ASSIGNMENT' as const),
      dueAt: parsedDate.toISOString(),
      priority,
      difficulty: existing?.difficulty ?? 3,
      estimatedMinutes,
      status: existing?.status ?? ('PENDING' as const),
    };

    setSaving(true);

    try {
      if (existing) await updateTask(existing.id, data);
      else await addTask(data);

      navigation.goBack();
    } catch (error) {
      Alert.alert(
        'Could not save task',
        error instanceof Error
          ? error.message
          : 'Please check the backend connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!existing) return;

    Alert.alert('Delete task?', 'This permanently removes the task.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setSaving(true);
          void deleteTask(existing.id)
            .then(() => navigation.goBack())
            .catch((error: unknown) =>
              Alert.alert(
                'Could not delete task',
                error instanceof Error
                  ? error.message
                  : 'Please check the backend connection and try again.',
              ),
            )
            .finally(() => setSaving(false));
        },
      },
    ]);
  };

  return (
    <Screen>
      <Field
        label="Task title"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Deliverable 4"
      />
      <Field label="Module" value={module} onChangeText={setModule} placeholder="e.g. ITDMA3-34" />
      <TaskDateField value={dueDate} onChange={setDueDate} />
      <Field
        label="Estimated study time (minutes)"
        value={minutes}
        onChangeText={setMinutes}
        placeholder="90"
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Priority</Text>
      <View style={styles.priorityRow}>
        {([1, 2, 3] as Priority[]).map((item) => (
          <Text
            key={item}
            onPress={() => setPriority(item)}
            style={[styles.priority, priority === item && styles.priorityActive]}
          >
            {item === 1 ? 'Low' : item === 2 ? 'Medium' : 'High'}
          </Text>
        ))}
      </View>

      <AppButton
        title={saving ? 'Saving…' : existing ? 'Save Changes' : 'Create Task'}
        onPress={() => void save()}
        disabled={saving}
      />
      {existing && (
        <AppButton title="Delete Task" variant="danger" onPress={remove} disabled={saving} />
      )}
    </Screen>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  const styles = useThemeStyles(createStyles);

  return (
    <View style={{ gap: 7 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...props} style={styles.input} placeholderTextColor="#A3A7B4" />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    label: { color: colors.text, fontWeight: '700', fontSize: 13 },
    input: {
      minHeight: 48,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      color: colors.text,
    },
    priorityRow: { flexDirection: 'row', gap: 8 },
    priority: {
      flex: 1,
      textAlign: 'center',
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.muted,
      fontWeight: '700',
    },
    priorityActive: { color: '#FFF', backgroundColor: colors.primary, borderColor: colors.primary },
  });
