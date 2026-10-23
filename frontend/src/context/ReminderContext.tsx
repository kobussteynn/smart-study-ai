import React, { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { usePreferences } from './PreferencesContext';
import { useTasks } from './TaskContext';
import { useAuth } from './AuthContext';
import { reminderPlan } from '../services/reminderPlan';

type Notifications = typeof import('expo-notifications');

const CHANNEL = 'task-deadlines';
const PREFIX = 'studysmart-deadline-';
const ReminderContext = createContext<
  | { status: string; error: string; enable: () => Promise<void>; test: () => Promise<void> }
  | undefined
>(undefined);

export function ReminderProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { tasks } = useTasks();
  const { preferences, ready, updatePreferences } = usePreferences();
  const [notifications, setNotifications] = useState<Notifications | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [status, setStatus] = useState('Checking notification availability…');
  const [error, setError] = useState('');
  const notificationQueue = useRef(Promise.resolve());
  const updateVersion = useRef(0);

  useEffect(() => {
    let active = true;

    if (Platform.OS === 'web') {
      setStatus('Phone reminders require an Android or iOS build.');

      return;
    }

    import('expo-notifications')
      .then(async (notificationsApi) => {
        notificationsApi.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });

        if (Platform.OS === 'android')
          await notificationsApi.setNotificationChannelAsync(CHANNEL, {
            name: 'Task deadlines',
            importance: notificationsApi.AndroidImportance.DEFAULT,
          });

        const permission = await notificationsApi.getPermissionsAsync();

        if (active) {
          setNotifications(notificationsApi);
          setPermissionGranted(permission.granted);
          setStatus(
            permission.granted
              ? 'Phone notifications are allowed.'
              : 'Phone notification permission has not been granted.',
          );
        }
      })
      .catch(() => {
        if (active)
          setStatus('Rebuild and reinstall the Android app to activate phone notifications.');
      });

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!notifications) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active')
        void notifications
          .getPermissionsAsync()
          .then((permission) => {
            setPermissionGranted(permission.granted);
            setStatus(
              permission.granted
                ? 'Phone notifications are allowed.'
                : 'Notifications are blocked. Enable them in phone settings.',
            );
          })
          .catch(() => setError('Could not read notification permission.'));
    });

    return () => subscription.remove();
  }, [notifications]);
  useEffect(() => {
    if (!notifications) return;

    const current = ++updateVersion.current;

    notificationQueue.current = notificationQueue.current
      .then(async () => {
        const scheduled = await notifications.getAllScheduledNotificationsAsync();

        for (const item of scheduled)
          if (item.identifier.startsWith(PREFIX))
            await notifications.cancelScheduledNotificationAsync(item.identifier);
        if (
          current !== updateVersion.current ||
          !user ||
          !ready ||
          !permissionGranted ||
          !preferences.reminders
        )
          return;
        for (const { task, date } of reminderPlan(tasks, preferences.reminderHours)) {
          if (current !== updateVersion.current) break;

          await notifications.scheduleNotificationAsync({
            identifier: PREFIX + task.id,
            content: {
              title: task.title,
              body: `${task.module} is due ${new Date(task.dueAt).toLocaleString()}.`,
              sound: 'default',
            },
            trigger: {
              type: notifications.SchedulableTriggerInputTypes.DATE,
              date,
              channelId: CHANNEL,
            },
          });
        }
      })
      .catch(() => setError('Could not schedule reminders. Check phone settings and try again.'));

    return () => {
      updateVersion.current++;
    };
  }, [
    notifications,
    user?.id,
    ready,
    permissionGranted,
    preferences.reminders,
    preferences.reminderHours,
    tasks,
  ]);

  const enable = async () => {
    setError('');

    if (!notifications) {
      setError('Phone reminders need a rebuilt Android app with the notifications module.');

      return;
    }
    try {
      const permission = await notifications.requestPermissionsAsync();

      setPermissionGranted(permission.granted);
      setStatus(
        permission.granted
          ? 'Phone notifications are allowed.'
          : 'Notifications are blocked. Open phone settings to allow them.',
      );
      updatePreferences({ reminders: permission.granted });
    } catch {
      setError('Could not request notification access. Please try again.');
    }
  };
  const test = async () => {
    if (!notifications || !permissionGranted) {
      setError('Enable phone notifications first.');

      return;
    }
    try {
      await notifications.scheduleNotificationAsync({
        identifier: PREFIX + 'test',
        content: {
          title: 'StudySmart AI',
          body: 'Your task reminders are ready.',
          sound: 'default',
        },
        trigger: {
          type: notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          channelId: CHANNEL,
        },
      });
      setStatus('Test scheduled. A notification should appear in about 5 seconds.');
      setError('');
    } catch {
      setError('Could not send the test notification.');
    }
  };

  return (
    <ReminderContext.Provider value={{ status, error, enable, test }}>
      {children}
    </ReminderContext.Provider>
  );
}

export function useReminders() {
  const value = useContext(ReminderContext);

  if (!value) throw new Error('useReminders requires ReminderProvider');

  return value;
}
