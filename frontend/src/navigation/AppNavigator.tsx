import {
  ReminderSettingsScreen,
  StudyPreferencesScreen,
  HelpSupportScreen,
  PrivacyPolicyScreen,
} from '../screens/SettingsScreens';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Button } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabs } from './MainTabs';
import { TaskListScreen } from '../screens/TaskListScreen';
import { TaskFormScreen } from '../screens/TaskFormScreen';
import { RootStackParamList } from './types';
import { ThemeColors } from '../theme/colors';
import { useTheme, useThemeStyles } from '../context/ThemeContext';
import { AnalyticsScreen } from '../screens/AnalyticsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const { colors } = useTheme();
  const styles = useThemeStyles(createStyles);
  const { user, loading } = useAuth();
  const [preview, setPreview] = useState(false);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user && __DEV__ && preview)
    return (
      <PreviewStack.Navigator>
        <PreviewStack.Screen
          name="UsagePreview"
          options={{
            title: 'Development preview',
            headerRight: () => <Button title="Exit" onPress={() => setPreview(false)} />,
          }}
        >
          {() => <AnalyticsScreen preview />}
        </PreviewStack.Screen>
      </PreviewStack.Navigator>
    );
  if (!user) return <LoginScreen onPreview={() => setPreview(true)} />;

  return (
    <Stack.Navigator
      screenOptions={{ headerTintColor: colors.primary, headerTitleStyle: { color: colors.text } }}
    >
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="ReminderSettings"
        component={ReminderSettingsScreen}
        options={{ title: 'Reminder Settings' }}
      />
      <Stack.Screen
        name="StudyPreferences"
        component={StudyPreferencesScreen}
        options={{ title: 'Study Preferences' }}
      />
      <Stack.Screen
        name="HelpSupport"
        component={HelpSupportScreen}
        options={{ title: 'Help & Support' }}
      />
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ title: 'Privacy Policy' }}
      />
      <Stack.Screen name="Tasks" component={TaskListScreen} options={{ title: 'My Tasks' }} />
      <Stack.Screen name="AddTask" component={TaskFormScreen} options={{ title: 'Add Task' }} />
      <Stack.Screen name="EditTask" component={TaskFormScreen} options={{ title: 'Edit Task' }} />
    </Stack.Navigator>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
  });
const PreviewStack = createNativeStackNavigator<{ UsagePreview: undefined }>();
