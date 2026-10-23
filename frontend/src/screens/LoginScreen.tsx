import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { AppButton } from '../components/AppButton';
import { ThemeColors } from '../theme/colors';
import { useThemeStyles } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

export function LoginScreen({ onPreview }: { onPreview?: () => void }) {
  const styles = useThemeStyles(createStyles);
  const { signInGoogle, loading } = useAuth();

  const handleGoogleSignIn = async () => {
    try {
      await signInGoogle();
    } catch (error) {
      console.error('Login screen Google error:', error);

      Alert.alert(
        'Google Sign-In Failed',
        'We could not sign you in with Google. Please try again.',
      );
    }
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>AI</Text>
      </View>

      <Text style={styles.title}>StudySmart AI</Text>

      <Text style={styles.subtitle}>Study smarter. Stress less.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Welcome</Text>

        <Text style={styles.body}>
          Sign in with your Google account to access your personal study planner.
        </Text>

        <AppButton
          title={loading ? 'Signing in...' : 'Continue with Google'}
          variant="outline"
          onPress={handleGoogleSignIn}
          disabled={loading}
        />
        {__DEV__ && onPreview && (
          <AppButton
            title="Preview usage tracker (sample data)"
            variant="outline"
            onPress={onPreview}
          />
        )}

        <Text style={styles.note}>
          StudySmart AI uses Google authentication to securely identify your account.
        </Text>
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    content: {
      justifyContent: 'center',
    },

    logo: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
    },

    logoText: {
      color: colors.onAccent,
      fontSize: 26,
      fontWeight: '900',
    },

    title: {
      textAlign: 'center',
      fontSize: 30,
      fontWeight: '900',
      color: colors.text,
      marginTop: 18,
    },

    subtitle: {
      textAlign: 'center',
      color: colors.muted,
      fontSize: 15,
      marginTop: 8,
      marginBottom: 24,
    },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 16,
    },

    cardTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },

    body: {
      color: colors.muted,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },

    note: {
      color: colors.muted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
