import { RoutineEvent, StudySchedule } from '../types';

function withSeconds(time: string): string {
  return time.length === 5 ? `${time}:00` : time;
}

export function routineSignature(events: RoutineEvent[]): string {
  const normalizedEvents = events.map((event) => {
    const isOneOff = event.repeat === 'once';
    const weekdays =
      event.repeat === 'selected'
        ? [...event.daysOfWeek].sort((first, second) => first - second)
        : [];

    return {
      id: event.id,
      title: event.title,
      allDay: event.allDay ?? false,
      startTime: event.allDay ? '00:00:00' : withSeconds(event.startTime),
      endTime: event.allDay ? '00:00:00' : withSeconds(event.endTime),
      repeat: event.repeat,
      date: isOneOff ? (event.date ?? null) : null,
      endDate: event.allDay && isOneOff ? (event.endDate ?? null) : null,
      daysOfWeek: weekdays,
      timezone: event.timezone,
    };
  });

  normalizedEvents.sort((first, second) => first.id.localeCompare(second.id));

  return JSON.stringify(normalizedEvents);
}

export function matchesRoutineSnapshot(
  schedule: StudySchedule | null,
  userId: string | undefined,
  events: RoutineEvent[] | null,
): schedule is StudySchedule {
  if (!schedule || !userId || !events) {
    return false;
  }

  if (schedule.userId !== userId || schedule.routineEvents == null) {
    return false;
  }

  return routineSignature(schedule.routineEvents) === routineSignature(events);
}
