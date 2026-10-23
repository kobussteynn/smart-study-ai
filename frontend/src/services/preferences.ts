export type Preferences = {
  reminders: boolean;
  reminderHours: number;
  sessionMinutes: number;
  breakMinutes: number;
  startHour: number;
  dailyMinutes: number;
};

export const defaultPreferences: Preferences = {
  reminders: false,
  reminderHours: 24,
  sessionMinutes: 25,
  breakMinutes: 5,
  startHour: 9,
  dailyMinutes: 120,
};

export function readPreferences(raw: string | null): Preferences {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...defaultPreferences };
    }

    const saved = parsed as Record<string, unknown>;
    const readNumber = (key: Exclude<keyof Preferences, 'reminders'>, choices: number[]) => {
      const value = saved[key];

      if (typeof value === 'number' && choices.includes(value)) {
        return value;
      }

      return defaultPreferences[key];
    };

    return {
      reminders: typeof saved.reminders === 'boolean' ? saved.reminders : false,
      reminderHours: readNumber('reminderHours', [1, 6, 24, 48]),
      sessionMinutes: readNumber('sessionMinutes', [25, 45, 60]),
      breakMinutes: readNumber('breakMinutes', [5, 10, 15]),
      startHour: readNumber('startHour', [7, 9, 14, 18]),
      dailyMinutes: readNumber('dailyMinutes', [60, 120, 180, 240]),
    };
  } catch {
    return { ...defaultPreferences };
  }
}

export function scheduleWindow(preferences: Preferences) {
  const studyHours = preferences.dailyMinutes / 60;
  const endHour = preferences.startHour + studyHours;

  return {
    dailyStart: `${String(preferences.startHour).padStart(2, '0')}:00`,
    dailyEnd: `${String(endHour).padStart(2, '0')}:00`,
    sessionMinutes: preferences.sessionMinutes,
    breakMinutes: preferences.breakMinutes,
  };
}
