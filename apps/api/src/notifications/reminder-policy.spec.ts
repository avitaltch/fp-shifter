import { describe, expect, it } from 'vitest';
import { scheduleAppointmentReminders } from './reminder-policy';

const startsAt = new Date('2030-02-01T12:00:00.000Z');

describe('scheduleAppointmentReminders', () => {
  it('schedules all reminders at the 30-day boundary', () => {
    const result = scheduleAppointmentReminders(
      new Date(startsAt.getTime() - 30 * 86_400_000),
      startsAt,
    );

    expect(result).toEqual([
      { kind: 'Reminder7d', scheduledFor: new Date('2030-01-25T12:00:00.000Z') },
      { kind: 'Reminder24h', scheduledFor: new Date('2030-01-31T12:00:00.000Z') },
      { kind: 'Reminder1h', scheduledFor: new Date('2030-02-01T11:00:00.000Z') },
    ]);
  });

  it('omits the seven-day reminder below 30 days', () => {
    const result = scheduleAppointmentReminders(
      new Date(startsAt.getTime() - 30 * 86_400_000 + 1),
      startsAt,
    );

    expect(result.map(({ kind }) => kind)).toEqual([
      'Reminder24h',
      'Reminder1h',
    ]);
  });

  it('schedules only the one-hour reminder below 24 hours', () => {
    const result = scheduleAppointmentReminders(
      new Date(startsAt.getTime() - 23 * 60 * 60 * 1_000),
      startsAt,
    );

    expect(result.map(({ kind }) => kind)).toEqual(['Reminder1h']);
  });

  it('schedules no reminder when less than one hour remains', () => {
    expect(
      scheduleAppointmentReminders(
        new Date(startsAt.getTime() - 60 * 60 * 1_000 + 1),
        startsAt,
      ),
    ).toEqual([]);
  });
});
