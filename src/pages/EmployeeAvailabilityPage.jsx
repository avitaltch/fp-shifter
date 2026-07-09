import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, CheckCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { listMyAvailability, addAvailability, deleteAvailability } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { todayString, toTimeDisplay, formatHebrewDate } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import LoadingSpinner from '../components/LoadingSpinner/LoadingSpinner';
import EmptyState from '../components/EmptyState/EmptyState';
import './EmployeeAvailabilityPage.css';

// Half-hour options 07:00–22:00
const TIME_OPTIONS = Array.from({ length: 31 }, (_, i) => {
  const h = String(Math.floor(i / 2) + 7).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

const EmployeeAvailabilityPage = () => {
  const { session } = useAuth();
  const [selectedDate, setSelectedDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('16:00');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const fetchEntries = useCallback(async () => {
    if (!session) return;
    try {
      setLoading(true);
      setEntries(await listMyAvailability(session.user.id, todayString()));
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'שגיאה בטעינת הזמינות הקיימת.' });
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const overlapsExisting = (date, start, end) =>
    entries.some(
      (a) =>
        a.available_date === date &&
        toTimeDisplay(a.start_time) < end &&
        toTimeDisplay(a.end_time) > start
    );

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

    setIsSubmitting(true);
    try {
      const entry = await addAvailability({
        userId: session.user.id,
        date: selectedDate,
        startTime,
        endTime,
      });
      setEntries((prev) =>
        [...prev, entry].sort(
          (a, b) =>
            a.available_date.localeCompare(b.available_date) ||
            a.start_time.localeCompare(b.start_time)
        )
      );
      setMessage({
        type: 'success',
        text: `זמינות נשמרה: ${formatHebrewDate(selectedDate)}, ${startTime}-${endTime}`,
      });
      setSelectedDate('');
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: friendlyError(err, 'שגיאה בשמירת הזמינות. יש לנסות שוב.') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setMessage(null);
    try {
      await deleteAvailability(id);
      setEntries((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error(err);
      setMessage({
        type: 'error',
        text: friendlyError(err, 'שגיאה במחיקה. ייתכן שכבר שובצו לך טיפולים בחלון זה.'),
      });
    }
  };

  return (
    <PageContainer size="sm" className="availability-page">
      <header className="page-header">
        <CheckCircle size={32} className="header-icon" />
        <h1>הזנת זמינות - אזור אישי</h1>
        <p>כאן ניתן לעדכן את צוות הניהול לגבי זמינות לקבלת לקוחות.</p>
      </header>

      <form onSubmit={handleSubmit} className="availability-form">
        <div className="input-group">
          <label htmlFor="date-input"><Calendar size={18} /> תאריך</label>
          <input
            id="date-input"
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
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

        {message && (
          <p className={message.type === 'error' ? 'error-text' : 'success-text'}>
            {message.text}
          </p>
        )}

        <button type="submit" className="submit-btn" disabled={isSubmitting || !selectedDate}>
          {isSubmitting ? <LoadingSpinner text="מעדכן..." inline={true} /> : (
            <>
              <CheckCircle size={18} />
              שמור זמינות
            </>
          )}
        </button>
      </form>

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
