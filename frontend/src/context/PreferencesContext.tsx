import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

import { defaultPreferences, Preferences, readPreferences } from '../services/preferences';

export type { Preferences } from '../services/preferences';

type PreferencesContextValue = {
  preferences: Preferences;
  ready: boolean;
  error: string;
  updatePreferences: (changes: Partial<Preferences>) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const storageKey = user ? `studysmart_preferences_${user.id}` : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [error, setError] = useState('');
  const latestPreferences = useRef(defaultPreferences);
  const pendingWrites = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;

    setLoadedKey(null);
    latestPreferences.current = defaultPreferences;
    setPreferences(defaultPreferences);
    setError('');

    if (storageKey)
      pendingWrites.current
        .then(() => AsyncStorage.getItem(storageKey))
        .then((raw) => {
          if (active) {
            latestPreferences.current = readPreferences(raw);
            setPreferences(latestPreferences.current);
          }
        })
        .catch(() => {
          if (active) setError('Could not load saved preferences. Default values are shown.');
        })
        .finally(() => {
          if (active) setLoadedKey(storageKey);
        });

    return () => {
      active = false;
    };
  }, [storageKey]);

  const ready = !!storageKey && storageKey === loadedKey;
  const updatePreferences = (changes: Partial<Preferences>) => {
    if (!ready || !storageKey) return;

    const updatedPreferences = { ...latestPreferences.current, ...changes };

    latestPreferences.current = updatedPreferences;
    setPreferences(updatedPreferences);
    setError('');
    pendingWrites.current = pendingWrites.current
      .then(() => AsyncStorage.setItem(storageKey, JSON.stringify(updatedPreferences)))
      .catch(() => setError('Could not save preferences. Please try changing the setting again.'));
  };

  return (
    <PreferencesContext.Provider value={{ preferences, ready, error, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);

  if (!value) throw new Error('usePreferences requires PreferencesProvider');

  return value;
}
