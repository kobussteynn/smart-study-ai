import { RoutineEvent } from '../types';
import { apiRequest } from './api';

export function getRoutines(userId: string) {
  return apiRequest<RoutineEvent[] | null>('/routines', { headers: { 'X-User-ID': userId } });
}

export function saveRoutines(userId: string, events: RoutineEvent[]) {
  return apiRequest<RoutineEvent[]>('/routines', {
    method: 'PUT',
    headers: { 'X-User-ID': userId },
    body: JSON.stringify({ routineEvents: events }),
  });
}
