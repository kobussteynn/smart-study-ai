import { AcademicTask, TaskStatus } from '../types';
import { apiRequest } from './api';

export type TaskInput = Omit<AcademicTask, 'id'>;

const userHeaders = (userId: string) => ({ 'X-User-ID': userId });

export function getTasks(userId: string) {
  return apiRequest<AcademicTask[]>('/tasks', { headers: userHeaders(userId) });
}

export function createTask(userId: string, task: TaskInput) {
  return apiRequest<AcademicTask>('/tasks', {
    method: 'POST',
    headers: userHeaders(userId),
    body: JSON.stringify(task),
  });
}

export function updateTask(userId: string, taskId: string, changes: Partial<TaskInput>) {
  return apiRequest<AcademicTask>(`/tasks/${taskId}`, {
    method: 'PUT',
    headers: userHeaders(userId),
    body: JSON.stringify(changes),
  });
}

export function updateTaskStatus(userId: string, taskId: string, status: TaskStatus) {
  return apiRequest<AcademicTask>(`/tasks/${taskId}/status`, {
    method: 'PATCH',
    headers: userHeaders(userId),
    body: JSON.stringify({ status }),
  });
}

export function deleteTask(userId: string, taskId: string) {
  return apiRequest<void>(`/tasks/${taskId}`, {
    method: 'DELETE',
    headers: userHeaders(userId),
  });
}
