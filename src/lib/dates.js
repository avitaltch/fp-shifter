// Date helpers — always LOCAL time, never toISOString() (which is UTC and
// gives yesterday's date during the first hours of an Israeli day).

/** YYYY-MM-DD of a Date in local time. */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's date as YYYY-MM-DD, local time. */
export function todayString() {
  return toDateString(new Date());
}

/** YYYY-MM-DD of today + n days, local time. */
export function addDaysString(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

// The booking server (business_now() in supabase/functions.sql) works in
// Asia/Jerusalem. Customers may book from other timezones, so the date
// picker bounds must follow the salon's calendar day, not the browser's.
const JERUSALEM_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date as YYYY-MM-DD in the salon's timezone (Asia/Jerusalem). */
export function jerusalemTodayString() {
  return JERUSALEM_DATE_FORMAT.format(new Date());
}

/** YYYY-MM-DD of Jerusalem-today + n days. */
export function jerusalemAddDaysString(n) {
  const [y, m, d] = jerusalemTodayString().split('-').map(Number);
  return toDateString(new Date(y, m - 1, d + n));
}

/** "HH:MM" from a Postgres time value ("HH:MM:SS"). */
export function toTimeDisplay(time) {
  return time ? time.slice(0, 5) : '';
}

/** Hebrew long date for a YYYY-MM-DD string (parsed as local, not UTC). */
export function formatHebrewDate(dateString) {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "שעה ו-15 דקות" style duration label from minutes. */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} דקות`;
  const hours = h === 1 ? 'שעה' : `${h} שעות`;
  return m === 0 ? hours : `${hours} ו-${m} דקות`;
}
