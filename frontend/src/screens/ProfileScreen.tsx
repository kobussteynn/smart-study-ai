import { useReminders } from '../context/ReminderContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { usePreferences } from '../context/PreferencesContext';
import React from 'react';
import { StyleSheet, Switch, Text, View, Pressable } from 'react-native';
import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { useAuth } from '../context/AuthContext';
import { ThemeColors } from '../theme/colors';
import { useTheme, useThemeStyles } from '../context/ThemeContext';

export function ProfileScreen() {
  const styles = useThemeStyles(createStyles);
  const { user, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { preferences, updatePreferences, ready, error } = usePreferences();
  const { enable, status, error: reminderError } = useReminders();
  const { darkMode, setDarkMode } = useTheme();

  return (
    <Screen>
      <Text style={styles.title}>Profile & Settings</Text>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user?.name.slice(0, 1)}</Text>
        </View>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>
      <View style={styles.card}>
        <Setting
          label="Task reminders"
          value={preferences.reminders}
          onValueChange={(value) => {
            if (value) {
              navigation.navigate('ReminderSettings');
              void enable();
            } else updatePreferences({ reminders: false });
          }}
          disabled={!ready}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Set up task reminders"
          onPress={() => navigation.navigate('ReminderSettings')}
          style={{ paddingVertical: 8 }}
        >
          <Text style={styles.link}>
            {preferences.reminders
              ? 'Change reminder timing or send a test ›'
              : 'Set up deadline notifications ›'}
          </Text>
          <Text style={styles.hint}>
            {reminderError ||
              (preferences.reminders
                ? status
                : 'Choose when your phone reminds you before tasks are due.')}
          </Text>
        </Pressable>
        <Setting label="Dark mode" value={darkMode} onValueChange={setDarkMode} />
      </View>
      <View style={styles.card}>
        <Pressable
          accessibilityRole="button"
          style={{ paddingVertical: 10 }}
          onPress={() => navigation.navigate('ReminderSettings')}
        >
          <Text style={styles.link}>{'Reminder Settings   ›'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={{ paddingVertical: 10 }}
          onPress={() => navigation.navigate('StudyPreferences')}
        >
          <Text style={styles.link}>{'Study Preferences   ›'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={{ paddingVertical: 10 }}
          onPress={() => navigation.navigate('HelpSupport')}
        >
          <Text style={styles.link}>{'Help & Support   ›'}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={{ paddingVertical: 10 }}
          onPress={() => navigation.navigate('PrivacyPolicy')}
        >
          <Text style={styles.link}>{'Privacy Policy   ›'}</Text>
        </Pressable>
      </View>
      {!!error && <Text style={styles.link}>{error}</Text>}
      <AppButton title="Logout" variant="danger" onPress={signOut} />
    </Screen>
  );
}

function Setting({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);

  return (
    <View style={styles.setting}>
      <Text style={styles.link}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary }}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    title: { color: colors.text, fontSize: 26, fontWeight: '900' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 13,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.accentSurface,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: colors.primary, fontSize: 26, fontWeight: '900' },
    name: { textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '900' },
    email: { textAlign: 'center', color: colors.muted },
    setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    hint: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
    link: { color: colors.text, fontWeight: '600' },
  });
