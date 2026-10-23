import { AcademicTask } from '../types';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const MAX_SCHEDULED_REMINDERS = 50;

export function reminderPlan(tasks: AcademicTask[], reminderHours: number, now = Date.now()) {
  const reminders: { task: AcademicTask; date: Date }[] = [];
  const leadTime = reminderHours * MILLISECONDS_PER_HOUR;

  for (const task of tasks) {
    if (task.status !== 'PENDING' && task.status !== 'IN_PROGRESS') {
      continue;
    }

    const deadline = new Date(task.dueAt).getTime();
    const date = new Date(deadline - leadTime);
    const reminderTime = date.getTime();

    if (!Number.isFinite(reminderTime) || reminderTime <= now) {
      continue;
    }

    reminders.push({ task, date });
  }

  reminders.sort((first, second) => first.date.getTime() - second.date.getTime());

  return reminders.slice(0, MAX_SCHEDULED_REMINDERS);
}
