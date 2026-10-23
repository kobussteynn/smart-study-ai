import React, { useState } from 'react';
import { Keyboard, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';

export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-');
}

export function parseTaskDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);

  if (year < 1000 || year > 9999) return null;

  const date = new Date(year, month - 1, day, 18);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function localDateText(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function TaskDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const styles = useThemeStyles(createStyles);
  const [visible, setVisible] = useState(false);
  const [month, setMonth] = useState(new Date());
  const open = () => {
    Keyboard.dismiss();

    const selected = parseTaskDate(value) ?? new Date();

    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setVisible(true);
  };
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((offset + days) / 7) * 7 },
    (_, i) => i - offset + 1,
  );
  const today = localDateText(new Date());
  const select = (date: string) => {
    onChange(date);
    setVisible(false);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>Due date</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Due date, year month day"
          value={value}
          onChangeText={(text) => onChange(formatDateInput(text))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#A3A7B4"
          keyboardType="number-pad"
          maxLength={10}
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open due date calendar"
          onPress={open}
          style={styles.open}
        >
          <Text style={styles.link}>Calendar</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>
        Type YYYYMMDD — dashes are added automatically — or choose a date.
      </Text>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
            accessibilityLabel="Dismiss calendar"
          />
          <View style={styles.calendar} accessibilityViewIsModal>
            <Text style={styles.title}>Choose due date</Text>
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                disabled={year === 1000 && monthIndex === 0}
                onPress={() => setMonth(new Date(year, monthIndex - 1, 1))}
                style={styles.arrow}
              >
                <Text style={styles.link}>‹</Text>
              </Pressable>
              <Text accessibilityLiveRegion="polite" style={styles.label}>
                {month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                disabled={year === 9999 && monthIndex === 11}
                onPress={() => setMonth(new Date(year, monthIndex + 1, 1))}
                style={styles.arrow}
              >
                <Text style={styles.link}>›</Text>
              </Pressable>
            </View>
            <View style={styles.grid}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <View key={day} style={styles.cell}>
                  <Text style={styles.hint}>{day}</Text>
                </View>
              ))}
              {cells.map((day, index) => {
                if (day < 1 || day > days) return <View key={index} style={styles.cell} />;

                const date = localDateText(new Date(year, monthIndex, day));
                const selected = date === value;

                return (
                  <Pressable
                    key={index}
                    accessibilityRole="button"
                    accessibilityLabel={date}
                    accessibilityState={{ selected }}
                    onPress={() => select(date)}
                    style={[
                      styles.cell,
                      date === today && styles.today,
                      selected && styles.selected,
                    ]}
                  >
                    <Text style={[styles.day, selected && styles.selectedText]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                onPress={() => select(today)}
                style={styles.action}
              >
                <Text style={styles.link}>Today</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setVisible(false)}
                style={styles.action}
              >
                <Text style={styles.link}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    field: { gap: 7 },
    label: { color: colors.text, fontWeight: '700', fontSize: 13 },
    row: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1,
      minHeight: 48,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      color: colors.text,
    },
    open: {
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 12,
    },
    link: { color: colors.primary, fontWeight: '700', fontSize: 15 },
    hint: { color: colors.muted, fontSize: 12 },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    calendar: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 18,
      gap: 12,
    },
    title: { color: colors.text, fontSize: 18, fontWeight: '700' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    arrow: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
      width: '14.285714%',
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
    },
    today: { backgroundColor: colors.background },
    selected: { backgroundColor: colors.primary },
    day: { color: colors.text, fontSize: 15 },
    selectedText: { color: colors.onAccent, fontWeight: '700' },
    footer: { flexDirection: 'row', justifyContent: 'space-between' },
    action: { padding: 12 },
  });
