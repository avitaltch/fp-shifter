import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  toDateString,
  todayString,
  addDaysString,
  jerusalemTodayString,
  jerusalemAddDaysString,
  toTimeDisplay,
  formatHebrewDate,
  formatDuration,
  weekdayIndex,
  endOfWeekString,
  startOfNextWeekString,
  endOfMonthString,
  startOfNextMonthString,
  endOfNextMonthString,
  datesInRange,
} from './dates';

afterEach(() => {
  vi.useRealTimers();
});

describe('toDateString', () => {
  it('formats a Date as YYYY-MM-DD with zero padding', () => {
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateString(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('todayString', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is consistent with the LOCAL fields of new Date(), not UTC', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayString()).toBe(expected);
  });

  it('uses the local calendar day just after local midnight', () => {
    // 00:30 local time — toISOString() would report the previous day in any
    // timezone ahead of UTC (e.g. Israel); todayString must not.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 9, 0, 30, 0));
    expect(todayString()).toBe('2026-07-09');
  });
});

describe('addDaysString', () => {
  it('adds days and rolls over month boundaries in local time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 30, 12, 0, 0)); // 2026-06-30
    expect(addDaysString(0)).toBe('2026-06-30');
    expect(addDaysString(1)).toBe('2026-07-01');
    expect(addDaysString(6)).toBe('2026-07-06');
  });

  it('rolls over year boundaries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 30, 12, 0, 0)); // 2026-12-30
    expect(addDaysString(3)).toBe('2027-01-02');
  });
});

describe('jerusalemTodayString', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(jerusalemTodayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports the salon's calendar day, not UTC", () => {
    // 22:30 UTC on Jul 9 is already 01:30 on Jul 10 in Asia/Jerusalem (UTC+3)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T22:30:00Z'));
    expect(jerusalemTodayString()).toBe('2026-07-10');
  });

  it('matches the Jerusalem day during Israeli winter (UTC+2)', () => {
    // 23:00 UTC on Jan 5 is 01:00 on Jan 6 in Jerusalem
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T23:00:00Z'));
    expect(jerusalemTodayString()).toBe('2026-01-06');
  });
});

describe('jerusalemAddDaysString', () => {
  it('adds days to the Jerusalem calendar day and rolls over month boundaries', () => {
    // Noon UTC on Jun 30 is Jun 30 in Jerusalem too
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T12:00:00Z'));
    expect(jerusalemAddDaysString(0)).toBe('2026-06-30');
    expect(jerusalemAddDaysString(1)).toBe('2026-07-01');
    expect(jerusalemAddDaysString(60)).toBe('2026-08-29');
  });

  it('starts counting from the Jerusalem day even when UTC lags behind', () => {
    // 22:30 UTC Jul 9 = Jul 10 in Jerusalem, so +1 day is Jul 11
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-09T22:30:00Z'));
    expect(jerusalemAddDaysString(1)).toBe('2026-07-11');
  });
});

describe('toTimeDisplay', () => {
  it('trims Postgres time values to HH:MM', () => {
    expect(toTimeDisplay('09:30:00')).toBe('09:30');
    expect(toTimeDisplay('14:05:59')).toBe('14:05');
  });

  it('returns an empty string for empty input', () => {
    expect(toTimeDisplay(null)).toBe('');
    expect(toTimeDisplay(undefined)).toBe('');
    expect(toTimeDisplay('')).toBe('');
  });
});

describe('formatHebrewDate', () => {
  it('returns an empty string for empty input', () => {
    expect(formatHebrewDate('')).toBe('');
    expect(formatHebrewDate(null)).toBe('');
  });

  it('formats a YYYY-MM-DD string as a Hebrew long date (parsed as local)', () => {
    const result = formatHebrewDate('2026-07-09');
    expect(result).toContain('יולי');
    expect(result).toContain('9');
    expect(result).toContain('2026');
    // 2026-07-09 is a Thursday
    expect(result).toContain('חמישי');
  });
});

describe('formatDuration', () => {
  it('formats minutes only', () => {
    expect(formatDuration(45)).toBe('45 דקות');
  });

  it('formats exactly one hour', () => {
    expect(formatDuration(60)).toBe('שעה');
  });

  it('formats one hour with minutes', () => {
    expect(formatDuration(75)).toBe('שעה ו-15 דקות');
  });

  it('formats whole multiple hours', () => {
    expect(formatDuration(120)).toBe('2 שעות');
  });

  it('formats multiple hours with minutes', () => {
    expect(formatDuration(135)).toBe('2 שעות ו-15 דקות');
  });
});

describe('weekdayIndex', () => {
  it('returns 0 for Sunday through 6 for Saturday', () => {
    // 2026-07-05 is Sunday
    expect(weekdayIndex('2026-07-05')).toBe(0);
    expect(weekdayIndex('2026-07-06')).toBe(1);
    expect(weekdayIndex('2026-07-11')).toBe(6);
  });
});

describe('endOfWeekString / startOfNextWeekString', () => {
  it('ends the Israel week on Saturday', () => {
    expect(endOfWeekString('2026-07-08')).toBe('2026-07-11'); // Wed → Sat
    expect(endOfWeekString('2026-07-05')).toBe('2026-07-11'); // Sun → Sat
    expect(endOfWeekString('2026-07-11')).toBe('2026-07-11'); // Sat → Sat
  });

  it('starts the next week on Sunday', () => {
    expect(startOfNextWeekString('2026-07-08')).toBe('2026-07-12');
    expect(startOfNextWeekString('2026-07-11')).toBe('2026-07-12');
    expect(startOfNextWeekString('2026-07-05')).toBe('2026-07-12');
  });
});

describe('month boundary helpers', () => {
  it('returns the last day of the current month', () => {
    expect(endOfMonthString('2026-07-10')).toBe('2026-07-31');
    expect(endOfMonthString('2026-02-01')).toBe('2026-02-28');
  });

  it('returns the first and last day of the next month', () => {
    expect(startOfNextMonthString('2026-07-10')).toBe('2026-08-01');
    expect(endOfNextMonthString('2026-07-10')).toBe('2026-08-31');
    expect(startOfNextMonthString('2026-12-15')).toBe('2027-01-01');
    expect(endOfNextMonthString('2026-12-15')).toBe('2027-01-31');
  });
});

describe('datesInRange', () => {
  it('lists inclusive YYYY-MM-DD dates', () => {
    expect(datesInRange('2026-07-08', '2026-07-11')).toEqual([
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
    ]);
  });

  it('returns a single day when start equals end', () => {
    expect(datesInRange('2026-07-08', '2026-07-08')).toEqual(['2026-07-08']);
  });

  it('returns an empty list when start is after end', () => {
    expect(datesInRange('2026-07-11', '2026-07-08')).toEqual([]);
  });
});
