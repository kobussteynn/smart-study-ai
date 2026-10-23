import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { RoutineEvent } from '../types';
import { getRoutines, saveRoutines } from '../services/routineApi';

type Repeat = RoutineEvent['repeat'];

type Routine = RoutineEvent;

type Props = {
  onEventsChange: (userId: string, events: RoutineEvent[] | null) => void;
};

const weekdays = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const d = new Date(`${value}T12:00:00`);

  return !Number.isNaN(d.getTime()) && todayPartsMatch(d, value);
}

function todayPartsMatch(d: Date, value: string) {
  const [y, m, day] = value.split('-').map(Number);

  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

export function RoutineEditor({ onEventsChange }: Props) {
  const styles = useThemeStyles(createStyles);
  const { user } = useAuth();

  const [events, setEvents] = useState<Routine[]>([]);
  const [saving, setSaving] = useState(false);
  const currentUserId = useRef(user?.id);

  currentUserId.current = user?.id;

  const saveInProgress = useRef(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('13:00');
  const [allDay, setAllDay] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [date, setDate] = useState(todayLocal());
  const [repeat, setRepeat] = useState<Repeat>('daily');
  const [days, setDays] = useState<number[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setLoadedFor(null);
      setEvents([]);

      if (!user?.id)
        return () => {
          active = false;
        };

      const userId = user.id;

      onEventsChange(userId, null);

      const key = `studysmart_routines_${userId}`;

      getRoutines(userId)
        .then(async (remote) => {
          if (!active) return;

          let saved = remote;

          if (saved === null) {
            const value = await AsyncStorage.getItem(key);
            const legacy = value ? JSON.parse(value) : [];

            if (!Array.isArray(legacy)) throw new Error('Invalid routine data');
            if (!active) return;

            saved = await saveRoutines(userId, legacy);
          }
          if (!active) return;

          setEvents(saved);
          setLoadedFor(userId);
        })
        .catch(() => {
          if (!active) return;

          Alert.alert(
            'Routines unavailable',
            'Could not load your saved activities. Scheduling is disabled until they can be loaded. Reopen this screen when connected.',
          );
        });

      return () => {
        active = false;
      };
    }, [user?.id, onEventsChange]),
  );

  useEffect(() => {
    if (!user?.id || loadedFor !== user.id) return;

    onEventsChange(user.id, events);
  }, [events, loadedFor, user?.id, onEventsChange]);

  async function persistEvents(nextEvents: Routine[]) {
    if (!user || loadedFor !== user.id || saveInProgress.current) return false;

    const owner = user.id;

    saveInProgress.current = true;
    setSaving(true);

    try {
      const saved = await saveRoutines(owner, nextEvents);

      if (currentUserId.current !== owner) return false;

      setEvents(saved);
      onEventsChange(owner, saved);

      return true;
    } catch {
      Alert.alert('Event not saved', 'Could not save your routines. Please try again.');

      return false;
    } finally {
      saveInProgress.current = false;
      setSaving(false);
    }
  }

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setStartTime('12:00');
    setEndTime('13:00');
    setAllDay(false);
    setEndDate('');
    setDate(todayLocal());
    setRepeat('daily');
    setDays([]);
  }

  function toggleDay(value: number) {
    setDays((current) =>
      current.includes(value) ? current.filter((x) => x !== value) : [...current, value],
    );
  }

  async function saveRoutine() {
    if (!user || loadedFor !== user.id) return;

    if (!title.trim()) {
      Alert.alert('Missing name', 'Enter an event name.');

      return;
    }

    if (!allDay && (!validTime(startTime) || !validTime(endTime))) {
      Alert.alert('Invalid time', 'Use 24-hour HH:MM format.');

      return;
    }

    if (!allDay && startTime === endTime) {
      Alert.alert('Invalid time', 'Start and end cannot be equal.');

      return;
    }

    if (repeat === 'once' && !validDate(date)) {
      Alert.alert('Invalid date', 'Use YYYY-MM-DD.');

      return;
    }
    if (allDay && repeat === 'once' && endDate && (!validDate(endDate) || endDate < date)) {
      Alert.alert('Invalid end date', 'Use YYYY-MM-DD on or after the start date.');

      return;
    }

    if (repeat === 'selected' && days.length === 0) {
      Alert.alert('Select days', 'Choose at least one weekday.');

      return;
    }

    const routine: Routine = {
      id: editingId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: title.trim(),
      startTime: allDay ? '00:00' : startTime,
      endTime: allDay ? '00:00' : endTime,
      allDay,
      endDate: allDay && repeat === 'once' && endDate ? endDate : undefined,
      date: repeat === 'once' ? date : undefined,
      repeat,
      daysOfWeek: repeat === 'selected' ? [...days].sort() : [],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg',
    };

    const saved = await persistEvents(
      editingId ? events.map((x) => (x.id === editingId ? routine : x)) : [routine, ...events],
    );

    if (saved) resetForm();
  }

  function editRoutine(event: Routine) {
    setEditingId(event.id);
    setTitle(event.title);
    setStartTime(event.startTime.slice(0, 5));
    setEndTime(event.endTime.slice(0, 5));
    setAllDay(event.allDay ?? false);
    setEndDate(event.endDate ?? '');
    setDate(event.date || todayLocal());
    setRepeat(event.repeat);
    setDays(event.daysOfWeek);
  }

  function deleteRoutine(id: string) {
    Alert.alert('Delete event?', 'This will remove the routine.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void persistEvents(events.filter((x) => x.id !== id));
        },
      },
    ]);
  }

  if (!user) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>My Routine</Text>
      <Text style={styles.subtitle}>
        Record busy times for meals, sports, sleep and other activities.
      </Text>

      {loadedFor !== user.id ? (
        <Text>Loading routines...</Text>
      ) : (
        <>
          {events.map((event) => (
            <View key={event.id} style={styles.card}>
              <Text style={styles.eventTitle}>{event.title}</Text>
              <Text style={styles.detail}>
                {event.allDay
                  ? 'All day — no study sessions'
                  : `${event.startTime.slice(0, 5)} - ${event.endTime.slice(0, 5)}`}
              </Text>
              <Text style={styles.detail}>
                {event.repeat === 'daily'
                  ? 'Every day'
                  : event.repeat === 'once'
                    ? `Once: ${event.date}${event.endDate ? ` to ${event.endDate}` : ''}`
                    : event.daysOfWeek.map((day) => weekdays[day].label).join(', ')}
              </Text>
              <View style={styles.actions}>
                <Pressable disabled={saving} onPress={() => editRoutine(event)}>
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable disabled={saving} onPress={() => deleteRoutine(event.id)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <Text style={styles.fieldLabel}>{editingId ? 'Edit Event' : 'Add Routine Event'}</Text>

          <TextInput
            style={styles.input}
            placeholder="Event name (e.g. Lunch)"
            value={title}
            onChangeText={setTitle}
          />

          <Pressable
            onPress={() => setAllDay((value) => !value)}
            style={[styles.option, allDay && styles.selected]}
          >
            <Text style={allDay && styles.selectedText}>
              {allDay ? '✓ All day — block the entire day' : 'All day — block the entire day'}
            </Text>
          </Pressable>

          {!allDay && (
            <>
              <Text style={styles.fieldLabel}>Start time (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="12:00"
              />

              <Text style={styles.fieldLabel}>End time (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="13:00"
              />
            </>
          )}

          <Text style={styles.fieldLabel}>Repeat</Text>
          <View style={styles.options}>
            {(
              [
                ['once', 'Once'],
                ['daily', 'Daily'],
                ['selected', 'Selected days'],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => setRepeat(value)}
                style={[styles.option, repeat === value && styles.selected]}
              >
                <Text style={repeat === value && styles.selectedText}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {repeat === 'once' && (
            <>
              <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="2026-10-02"
              />
              {allDay && (
                <>
                  <Text style={styles.fieldLabel}>End date (optional, inclusive)</Text>
                  <TextInput
                    style={styles.input}
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="YYYY-MM-DD"
                  />
                </>
              )}
            </>
          )}

          {repeat === 'selected' && (
            <View style={styles.options}>
              {weekdays.map((day) => (
                <Pressable
                  key={day.value}
                  style={[styles.day, days.includes(day.value) && styles.selected]}
                  onPress={() => toggleDay(day.value)}
                >
                  <Text style={days.includes(day.value) && styles.selectedText}>{day.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable disabled={saving} style={styles.saveButton} onPress={() => void saveRoutine()}>
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : editingId ? 'Update Event' : '+ Save Event'}
            </Text>
          </Pressable>

          {editingId && (
            <Pressable onPress={resetForm}>
              <Text style={styles.cancel}>Cancel editing</Text>
            </Pressable>
          )}

          <Text style={styles.note}>
            Saved routines sync with your account and are included whenever you generate a new study
            schedule. Changing routines hides the old plan until you refresh it. All-day events
            block every hour of their dates.
          </Text>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.onAccent,
      borderRadius: 16,
      padding: 16,
      marginTop: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heading: { fontSize: 22, fontWeight: '800', color: colors.text },
    subtitle: { color: colors.muted, marginTop: 5, marginBottom: 16 },
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      padding: 12,
      marginBottom: 10,
    },
    eventTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    detail: { color: colors.muted, marginTop: 4 },
    actions: {
      flexDirection: 'row',
      gap: 24,
      marginTop: 12,
    },
    actionText: { color: colors.primary, fontWeight: '700' },
    deleteText: { color: colors.danger, fontWeight: '700' },
    fieldLabel: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
      marginTop: 12,
      marginBottom: 6,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      padding: 12,
      color: colors.text,
    },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      marginVertical: 8,
    },
    option: {
      padding: 9,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.border,
    },
    day: {
      padding: 9,
      borderRadius: 9,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    selectedText: { color: colors.onAccent },
    saveButton: {
      backgroundColor: colors.primary,
      padding: 15,
      alignItems: 'center',
      borderRadius: 12,
      marginTop: 16,
    },
    saveText: { color: colors.onAccent, fontWeight: '800' },
    cancel: { textAlign: 'center', color: colors.primary, marginTop: 12 },
    note: { fontSize: 11, color: colors.muted, marginTop: 14 },
  });
