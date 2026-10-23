export type Priority = 1 | 2 | 3;

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type AcademicTask = {
  id: string;
  title: string;
  module: string;
  type: 'HOMEWORK' | 'ASSIGNMENT' | 'PROJECT' | 'TEST' | 'EXAM' | 'OTHER';
  dueAt: string;
  priority: Priority;
  difficulty: number;
  estimatedMinutes: number;
  status: TaskStatus;
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type ScheduleSource = 'openai' | 'local_fallback';

export type StudySession = {
  id: string;
  taskId: string;
  title: string;
  module: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  focus: string;
};

export type StudySchedule = {
  id: string;
  userId: string;
  generatedAt: string;
  source: ScheduleSource;
  model: string | null;
  summary: string;
  sessions: StudySession[];
  warnings: string[];
  routineEvents?: RoutineEvent[] | null;
};

export type RoutineEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  date?: string;
  endDate?: string;
  allDay?: boolean;
  repeat: 'once' | 'daily' | 'selected';
  daysOfWeek: number[];
  timezone: string;
};

export type SchedulePreferences = {
  planningStart?: string;
  planningDays?: number;
  dailyStart?: string;
  dailyEnd?: string;
  sessionMinutes?: number;
  breakMinutes?: number;
  timezone?: string;
  unavailableDates?: string[];
  routineEvents?: RoutineEvent[];
};
