import { useState, useCallback, useEffect, useMemo } from 'react';
import { Calendar, Clock, CheckCircle, Trash2, CalendarRange } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createOperatorAvailability,
  deleteOperatorAvailability,
  listOperatorAvailability,
  listOperatorLocations,
} from '../lib/api';
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
  addDaysString,
  businessDateRangeToInstants,
  businessLocalDateTimeToInstant,
  dateInTimezone,
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
const EMPTY_LIST = [];

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
  return [...list].sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

const EmployeeAvailabilityPage = () => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [selectedDate, setSelectedDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [workdays, setWorkdays] = useState(DEFAULT_WORKDAYS);
  const [selectedLocationId, setSelectedLocationId] = useState('');

  const fetchEntries = useCallback(async () => {
    const locations = await listOperatorLocations();
    const primary = locations.find((location) => location.isPrimary) ?? locations[0];
    if (!primary) return { locations: [], entries: [] };
    const from = businessDateRangeToInstants(todayString(), primary.timezone).windowStartsAt;
    const to = businessDateRangeToInstants(addDaysString(92), primary.timezone).windowEndsAt;
    const entries = await listOperatorAvailability({ from, to });
    return { locations, entries };
  }, []);
  const { data, setData, loading, error } = useAsyncData(fetchEntries, {
    enabled: Boolean(userId),
    errorMessage: 'שגיאה בטעינת הזמינות הקיימת.',
  });
  const { isBusy, message, setMessage, run } = useAction();

  const entries = data?.entries ?? EMPTY_LIST;
  const locations = data?.locations ?? EMPTY_LIST;
  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) ??
    locations.find((location) => location.isPrimary) ??
    locations[0];
  const timezoneByLocation = useMemo(
    () => new Map(locations.map((location) => [location.id, location.timezone])),
    [locations]
  );

  useEffect(() => {
    if (!selectedLocationId && selectedLocation) setSelectedLocationId(selectedLocation.id);
  }, [selectedLocation, selectedLocationId]);
  const isSubmitting = isBusy('add');
  const isBulkBusy = isBusy('bulk');

  const overlapsExisting = (date, start, end) => {
    if (!selectedLocation) return false;
    const startsAt = businessLocalDateTimeToInstant(date, start, selectedLocation.timezone);
    const endsAt = businessLocalDateTimeToInstant(date, end, selectedLocation.timezone);
    return entries.some(
      (entry) =>
        entry.locationId === selectedLocation.id &&
        entry.kind === 'Available' &&
        entry.startsAt < endsAt &&
        entry.endsAt > startsAt
    );
  };

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
    if (!selectedLocation) {
      setMessage({ type: 'error', text: 'לא הוגדר מיקום לעסק.' });
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
      async () => {
        const [entry] = await createOperatorAvailability([
          {
            locationId: selectedLocation.id,
            kind: 'Available',
            startsAt: businessLocalDateTimeToInstant(
              selectedDate,
              startTime,
              selectedLocation.timezone
            ),
            endsAt: businessLocalDateTimeToInstant(
              selectedDate,
              endTime,
              selectedLocation.timezone
            ),
          },
        ]);
        return entry;
      },
      {
        success: `זמינות נשמרה: ${formatHebrewDate(selectedDate)}, ${startTime}-${endTime}`,
        errorFallback: 'שגיאה בשמירת הזמינות. יש לנסות שוב.',
      }
    );
    if (ok) {
      setData((prev) => ({ ...prev, entries: sortEntries([...prev.entries, entry]) }));
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
    if (!selectedLocation) {
      setMessage({ type: 'error', text: 'לא הוגדר מיקום לעסק.' });
      return;
    }

    const intervals = [];
    for (const date of candidates) {
      if (overlapsExisting(date, startTime, endTime)) {
        skipped += 1;
      } else {
        intervals.push({
          locationId: selectedLocation.id,
          kind: 'Available',
          startsAt: businessLocalDateTimeToInstant(date, startTime, selectedLocation.timezone),
          endsAt: businessLocalDateTimeToInstant(date, endTime, selectedLocation.timezone),
        });
      }
    }

    if (intervals.length === 0) {
      setMessage({
        type: 'info',
        text: 'כל הימים בטווח כבר פתוחים או שאינם בימי העבודה שנבחרו.',
      });
      return;
    }

    if (intervals.length > 20) {
      const confirmed = window.confirm(`לפתוח זמינות ב-${intervals.length} ימים?`);
      if (!confirmed) return;
    }

    const { ok, result: created } = await run(
      'bulk',
      () => createOperatorAvailability(intervals),
      { errorFallback: 'שגיאה בפתיחה מרוכזת. יש לנסות שוב.' }
    );
    if (ok) {
      const createdRows = created ?? [];
      setData((prev) => ({
        ...prev,
        entries: sortEntries([...prev.entries, ...createdRows]),
      }));
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
    const { ok } = await run(id, () => deleteOperatorAvailability(id), {
      errorFallback: 'שגיאה במחיקה. ייתכן שכבר שובצו לך טיפולים בחלון זה.',
    });
    if (ok) setData((prev) => ({
      ...prev,
      entries: prev.entries.filter((entry) => entry.id !== id),
    }));
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
          <label htmlFor="location-input">מיקום</label>
          <select
            id="location-input"
            value={selectedLocation?.id ?? ''}
            onChange={(event) => setSelectedLocationId(event.target.value)}
            disabled={locations.length <= 1}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        </div>
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
                {formatHebrewDate(
                  dateInTimezone(
                    entry.startsAt,
                    timezoneByLocation.get(entry.locationId) ??
                      selectedLocation?.timezone ??
                      'Asia/Jerusalem'
                  )
                )} ·{' '}
                {toTimeDisplay(
                  entry.startsAt,
                  timezoneByLocation.get(entry.locationId) ??
                    selectedLocation?.timezone
                )}-
                {toTimeDisplay(
                  entry.endsAt,
                  timezoneByLocation.get(entry.locationId) ??
                    selectedLocation?.timezone
                )}
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
