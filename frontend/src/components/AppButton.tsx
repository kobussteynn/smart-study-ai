import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
};

export function AppButton({ title, onPress, variant = 'primary', disabled, style }: Props) {
  const styles = useThemeStyles(createStyles);
  const variantStyle =
    variant === 'outline' ? styles.outline : variant === 'danger' ? styles.danger : styles.primary;

  const textStyle = variant === 'outline' ? styles.outlineText : styles.primaryText;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyle,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.text, textStyle]}>{title}</Text>
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      minHeight: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    primary: { backgroundColor: colors.primary },
    danger: { backgroundColor: colors.danger },
    outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
    text: { fontSize: 15, fontWeight: '700' },
    primaryText: { color: colors.onAccent },
    outlineText: { color: colors.primary },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.82 },
  });
