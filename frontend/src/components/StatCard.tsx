import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';

type Props = { label: string; value: string; helper?: string };

export function StatCard({ label, value, helper }: Props) {
  const styles = useThemeStyles(createStyles);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {!!helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      flex: 1,
      minWidth: 100,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: { color: colors.muted, fontSize: 12, fontWeight: '600' },
    value: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 6 },
    helper: { color: colors.muted, fontSize: 11, marginTop: 4 },
  });
