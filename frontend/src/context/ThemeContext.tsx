import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as lightColors, darkColors, ThemeColors } from '../theme/colors';

const STORAGE_KEY = 'studysmart.darkMode';

type ThemeContextValue = {
  colors: ThemeColors;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [darkMode, updateDarkMode] = useState(false);
  const [ready, setReady] = useState(false);
  const pendingThemeWrites = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (active) updateDarkMode(value === 'true');
      })
      .catch(() => {
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      darkMode,
      colors: darkMode ? darkColors : lightColors,
      setDarkMode: (enabled) => {
        updateDarkMode(enabled);
        pendingThemeWrites.current = pendingThemeWrites.current
          .then(() => AsyncStorage.setItem(STORAGE_KEY, String(enabled)))
          .catch(() => {});
      },
    }),
    [darkMode],
  );

  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);

  if (!theme) throw new Error('useTheme must be used within ThemeProvider');

  return theme;
}

export function useThemeStyles<T>(createStyles: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();

  return useMemo(() => createStyles(colors), [createStyles, colors]);
}
