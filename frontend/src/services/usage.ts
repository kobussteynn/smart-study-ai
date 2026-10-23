import { NativeModules, Platform } from 'react-native';

export type UsageApp = { packageName: string; appName?: string; minutes: number };

export type UsageCategory = 'entertainment' | 'productivity' | 'education' | 'other';

const entertainment = [
  'instagram',
  'facebook',
  'tiktok',
  'snapchat',
  'youtube',
  'netflix',
  'spotify',
  'reddit',
  'twitter',
  'x.android',
  'whatsapp',
];
const education = ['classroom', 'moodle', 'canvas', 'duolingo', 'khanacademy', 'coursera'];
const productivity = [
  'docs',
  'sheets',
  'drive',
  'notion',
  'todoist',
  'calendar',
  'keep',
  'onenote',
  'office',
];

export function categoryFor(
  packageName: string,
  overrides: Record<string, UsageCategory>,
): UsageCategory {
  if (
    Object.prototype.hasOwnProperty.call(overrides, packageName) &&
    ['entertainment', 'productivity', 'education', 'other'].includes(overrides[packageName])
  )
    return overrides[packageName];

  const name = packageName.toLowerCase();

  if (education.some((word) => name.includes(word))) return 'education';
  if (productivity.some((word) => name.includes(word))) return 'productivity';
  if (entertainment.some((word) => name.includes(word))) return 'entertainment';

  return 'other';
}

export const usageTracking:
  | {
      hasPermission(): Promise<boolean>;
      openPermissionSettings(): Promise<void>;
      getTodayUsage(): Promise<UsageApp[]>;
    }
  | undefined = Platform.OS === 'android' ? NativeModules.UsageTracking : undefined;
