import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  createTask,
  deleteTask as deleteTaskRequest,
  getTasks,
  TaskInput,
  updateTask as updateTaskRequest,
  updateTaskStatus,
} from '../services/taskApi';
import { AcademicTask } from '../types';
import { useAuth } from './AuthContext';

type TaskContextValue = {
  tasks: AcademicTask[];
  loading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
  addTask: (task: TaskInput) => Promise<void>;
  updateTask: (id: string, task: Partial<TaskInput>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleComplete: (id: string) => Promise<void>;
};

const TaskContext = createContext<TaskContextValue | undefined>(undefined);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not reach the backend.';
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AcademicTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTasks = useCallback(async () => {
    if (!user) {
      setTasks([]);
      setError(null);

      return;
    }

    setLoading(true);
    setError(null);

    try {
      setTasks(await getTasks(user.id));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const requireUser = () => {
    if (!user) throw new Error('Sign in before managing tasks.');

    return user;
  };

  const runTaskChange = async (change: (userId: string) => Promise<void>) => {
    const { id } = requireUser();

    setError(null);

    try {
      await change(id);
    } catch (requestError) {
      const message = errorMessage(requestError);

      setError(message);

      throw new Error(message);
    }
  };

  const addTask = (task: TaskInput) =>
    runTaskChange(async (userId) => {
      const created = await createTask(userId, task);

      setTasks((current) => [created, ...current]);
    });

  const updateTask = (id: string, changes: Partial<TaskInput>) =>
    runTaskChange(async (userId) => {
      const updated = await updateTaskRequest(userId, id, changes);

      setTasks((current) => current.map((task) => (task.id === id ? updated : task)));
    });

  const deleteTask = (id: string) =>
    runTaskChange(async (userId) => {
      await deleteTaskRequest(userId, id);
      setTasks((current) => current.filter((task) => task.id !== id));
    });

  const toggleComplete = async (id: string) => {
    requireUser();

    const existing = tasks.find((task) => task.id === id);

    if (!existing) return;

    await runTaskChange(async (userId) => {
      const updated = await updateTaskStatus(
        userId,
        id,
        existing.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED',
      );

      setTasks((current) => current.map((task) => (task.id === id ? updated : task)));
    });
  };

  const value: TaskContextValue = {
    tasks,
    loading,
    error,
    refreshTasks,
    addTask,
    updateTask,
    deleteTask,
    toggleComplete,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const value = useContext(TaskContext);

  if (!value) throw new Error('useTasks must be used inside TaskProvider');

  return value;
}
