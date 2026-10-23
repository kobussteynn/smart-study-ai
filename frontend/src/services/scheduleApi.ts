import { SchedulePreferences, StudySchedule } from '../types';
import { apiRequest } from './api';

const userHeaders = (userId: string) => ({ 'X-User-ID': userId });

export function getLatestSchedule(userId: string) {
  return apiRequest<StudySchedule | null>('/schedule', {
    headers: userHeaders(userId),
  });
}

export function generateSchedule(userId: string, preferences: SchedulePreferences = {}) {
  return apiRequest<StudySchedule>('/schedule/generate', {
    method: 'POST',
    headers: userHeaders(userId),
    body: JSON.stringify(preferences),
  });
}
