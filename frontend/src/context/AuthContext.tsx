import React, { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

import { User } from '../types';

if (Platform.OS !== 'web') {
  GoogleSignin.configure({
    webClientId:
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      '741582484035-16tsu18kq4ae92nmrqflcd76vukqulde.apps.googleusercontent.com',
  });
}

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);

  const signInGoogle = async () => {
    try {
      setLoading(true);

      if (Platform.OS === 'web') {
        setUser({
          id: 'demo-user',
          name: 'Demo Student',
          email: 'demo@studysmart.local',
        });

        return;
      }

      await GoogleSignin.hasPlayServices();

      const response = await GoogleSignin.signIn();

      if (isSuccessResponse(response)) {
        const googleUser = response.data.user;

        setUser({
          id: googleUser.id,
          name: googleUser.name ?? 'Student',
          email: googleUser.email,
        });
      }
    } catch (error) {
      console.error('Google Sign-In error:', error);

      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      setLoading(true);

      if (Platform.OS !== 'web') {
        await GoogleSignin.signOut();
      }

      setUser(null);
    } catch (error) {
      console.error('Google Sign-Out error:', error);
    } finally {
      setLoading(false);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      signInGoogle,
      signOut,
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
