import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  toDateString,
  todayString,
  addDaysString,
  toTimeDisplay,
  formatHebrewDate,
  formatDuration,
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
