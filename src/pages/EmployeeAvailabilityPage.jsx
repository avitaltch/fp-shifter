import { useState, useCallback } from 'react';
import { Calendar, Clock, CheckCircle, Trash2, CalendarRange } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listMyAvailability, addAvailability, addAvailabilityBulk, deleteAvailability } from '../lib/api';
import { useAsyncData } from '../hooks/useAsyncData';
import { useAction } from '../hooks/useAction';
import {
  todayString,
  toTimeDisplay,
  formatHebrewDate,
  weekdayIndex,
  endOfWeekString,
  startOfNextWeekString,
  endOfMonthString,
  startOfNextMonthString,
  endOfNextMonthString,
  datesInRange,
} from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import PageHeader from '../components/PageHeader/PageHeader';
import Alert from '../components/Alert/Alert';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import EmptyState from '../components/EmptyState/EmptyState';
import './EmployeeAvailabilityPage.css';

// Half-hour options 07:00–22:00
const TIME_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const h = String(Math.floor(i / 2) + 7).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

const WEEKDAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
// Default: Sunday–Thursday on, Friday–Saturday off
const DEFAULT_WORKDAYS = [true, true, true, true, true, false, false];

const BULK_ACTIONS = [
  { key: 'thisWeek', label: 'פתח את השבוע' },
  { key: 'nextWeek', label: 'פתח את השבוע הבא' },
  { key: 'thisMonth', label: 'פתח את החודש' },
  { key: 'nextMonth', label: 'פתח את החודש הבא' },
];

function rangeForBulk(kind) {
  const today = todayString();
  switch (kind) {
    case 'thisWeek':
      return { start: today, end: endOfWeekString(today) };
    case 'nextWeek': {
      const start = startOfNextWeekString(today);
      return { start, end: endOfWeekString(start) };
    }
    case 'thisMonth':
      return { start: today, end: endOfMonthString(today) };
    case 'nextMonth':
      return { start: startOfNextMonthString(today), end: endOfNextMonthString(today) };
    default:
      return { start: today, end: today };
  }
}

function sortEntries(list) {
  return [...list].sort(
    (a, b) =>
      a.available_date.localeCompare(b.available_date) ||
      a.start_time.localeCompare(b.start_time)
  );
}

const EmployeeAvailabilityPage = () => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [selectedDate, setSelectedDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [workdays, setWorkdays] = useState(DEFAULT_WORKDAYS);

  const fetchEntries = useCallback(() => listMyAvailability(userId, todayString()), [userId]);
  const { data, setData, loading, error } = useAsyncData(fetchEntries, {
    enabled: Boolean(userId),
    errorMessage: 'שגיאה בטעינת הזמינות הקיימת.',
  });
  const { busyKey, message, setMessage, run } = useAction();

  const entries = data ?? [];
  const isSubmitting = busyKey === 'add';
  const isBulkBusy = busyKey === 'bulk';

  const overlapsExisting = (date, start, end) =>
    entries.some(
      (a) =>
        a.available_date === date &&
        toTimeDisplay(a.start_time) < end &&
        toTimeDisplay(a.end_time) > start
    );

  const toggleWorkday = (index) => {
    setWorkdays((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    if (!selectedDate) {
      setMessage({ type: 'error', text: 'יש לבחור תאריך.' });
      return;
    }
    if (startTime >= endTime) {
      setMessage({ type: 'error', text: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' });
      return;
    }
    if (overlapsExisting(selectedDate, startTime, endTime)) {
      setMessage({ type: 'error', text: 'כבר קיימת זמינות חופפת בתאריך זה.' });
      return;
    }

    const { ok, result: entry } = await run(
      'add',
      () => addAvailability({ userId, date: selectedDate, startTime, endTime }),
      {
        success: `זמינות נשמרה: ${formatHebrewDate(selectedDate)}, ${startTime}-${endTime}`,
        errorFallback: 'שגיאה בשמירת הזמינות. יש לנסות שוב.',
      }
    );
    if (ok) {
      setData((prev) => sortEntries([...prev, entry]));
      setSelectedDate('');
    }
  };

  const handleBulkOpen = async (kind) => {
    setMessage(null);

    if (startTime >= endTime) {
      setMessage({ type: 'error', text: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.' });
      return;
    }

    const { start, end } = rangeForBulk(kind);
    const candidates = datesInRange(start, end).filter((d) => workdays[weekdayIndex(d)]);

    let skipped = 0;
    const rows = [];
    for (const date of candidates) {
      if (overlapsExisting(date, startTime, endTime)) {
        skipped += 1;
      } else {
        rows.push({
          user_id: userId,
          available_date: date,
          start_time: startTime,
          end_time: endTime,
        });
      }
    }

    if (rows.length === 0) {
      setMessage({
        type: 'info',
        text: 'כל הימים בטווח כבר פתוחים או שאינם בימי העבודה שנבחרו.',
      });
      return;
    }

    if (rows.length > 20) {
      const confirmed = window.confirm(`לפתוח זמינות ב-${rows.length} ימים?`);
      if (!confirmed) return;
    }

    const { ok, result: created } = await run(
      'bulk',
      () => addAvailabilityBulk(rows),
      { errorFallback: 'שגיאה בפתיחה מרוכזת. יש לנסות שוב.' }
    );
    if (ok) {
      const createdRows = created ?? [];
      setData((prev) => sortEntries([...prev, ...createdRows]));
      const openedText =
        createdRows.length === 1 ? 'נפתח יום אחד' : `נפתחו ${createdRows.length} ימים`;
      const skippedText = skipped === 1 ? 'דולג יום אחד' : `דולגו ${skipped} ימים`;
      setMessage({
        type: 'success',
        text: skipped > 0 ? `${openedText} (${skippedText} — קיימת זמינות חופפת)` : openedText,
      });
    }
  };

  const handleDelete = async (id) => {
    const { ok } = await run(id, () => deleteAvailability(id), {
      errorFallback: 'שגיאה במחיקה. ייתכן שכבר שובצו לך טיפולים בחלון זה.',
    });
    if (ok) setData((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <PageContainer size="sm" className="availability-page">
      <PageHeader
        icon={CheckCircle}
        title="הזנת זמינות - אזור אישי"
        subtitle="כאן ניתן לעדכן את צוות הניהול לגבי זמינות לקבלת לקוחות."
      />

      <form onSubmit={handleSubmit} className="availability-form">
        <div className="input-group">
          <label htmlFor="date-input"><Calendar size={18} /> תאריך</label>
          <input
            id="date-input"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker?.();
              } catch {
                /* already open or unsupported */
              }
            }}
            min={todayString()}
          />
        </div>

        <div className="time-inputs">
          <div className="input-group">
            <label htmlFor="start-time"><Clock size={18} /> משעה</label>
            <select id="start-time" value={startTime} onChange={(e) => setStartTime(e.target.value)}>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="input-group">
            <label htmlFor="end-time"><Clock size={18} /> עד שעה</label>
            <select id="end-time" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <Alert type="error">{error}</Alert>
        <Alert type={message?.type}>{message?.text}</Alert>

        <button type="submit" className="submit-btn" disabled={isSubmitting || !selectedDate}>
          {isSubmitting ? <LoadingSpinner text="מעדכן..." inline={true} /> : (
            <>
              <CheckCircle size={18} />
              שמור זמינות
            </>
          )}
        </button>
      </form>

      <section className="availability-bulk" aria-labelledby="bulk-heading">
        <h2 id="bulk-heading">
          <CalendarRange size={20} aria-hidden="true" />
          פתיחה מרוכזת
        </h2>
        <p className="bulk-hint">
          נפתח את הימים שנבחרו בשעות שמוגדרות למעלה ({startTime}–{endTime}).
        </p>

        <div className="workday-toggles" role="group" aria-label="ימי עבודה">
          {WEEKDAY_LABELS.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`workday-chip${workdays[index] ? ' workday-chip--on' : ''}`}
              aria-pressed={workdays[index]}
              disabled={isBulkBusy}
              onClick={() => toggleWorkday(index)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bulk-actions">
          {BULK_ACTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="bulk-btn"
              disabled={isBulkBusy || isSubmitting}
              onClick={() => handleBulkOpen(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="availability-list">
        <h2>הזמינות שלי הקרובה</h2>
        {loading && <LoadingSpinner text="טוען..." />}
        {!loading && entries.length === 0 && (
          <EmptyState text="עדיין לא הוזנה זמינות עתידית." />
        )}
        {!loading &&
          entries.map((entry) => (
            <div key={entry.id} className="availability-entry">
              <span>
                {formatHebrewDate(entry.available_date)} · {toTimeDisplay(entry.start_time)}-
                {toTimeDisplay(entry.end_time)}
              </span>
              <button
                type="button"
                className="delete-btn"
                aria-label="מחיקת זמינות"
                onClick={() => handleDelete(entry.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
      </section>
    </PageContainer>
  );
};

export default EmployeeAvailabilityPage;
