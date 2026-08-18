import type { NotificationKind } from './notification.types';

const DAY_MS = 86_400_000;

export interface ScheduledReminder {
  kind: Extract<NotificationKind, 'Reminder7d' | 'Reminder24h' | 'Reminder1h'>;
  scheduledFor: Date;
}

export function scheduleAppointmentReminders(
  appointmentCreatedAt: Date,
  appointmentStartsAt: Date,
): ScheduledReminder[] {
  const leadTimeMs =
    appointmentStartsAt.getTime() - appointmentCreatedAt.getTime();
  if (leadTimeMs < 0) return [];

  const reminders: ScheduledReminder[] = [];
  if (leadTimeMs >= 30 * DAY_MS) {
    reminders.push({
      kind: 'Reminder7d',
      scheduledFor: new Date(appointmentStartsAt.getTime() - 7 * DAY_MS),
    });
  }
  if (leadTimeMs >= DAY_MS) {
    reminders.push({
      kind: 'Reminder24h',
      scheduledFor: new Date(appointmentStartsAt.getTime() - DAY_MS),
    });
  }
  if (leadTimeMs >= 60 * 60 * 1_000) {
    reminders.push({
      kind: 'Reminder1h',
      scheduledFor: new Date(appointmentStartsAt.getTime() - 60 * 60 * 1_000),
    });
  }
  return reminders;
}
