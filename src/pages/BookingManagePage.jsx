import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import { customerGetAppointment, customerCancelAppointment } from '../lib/api';
import { useAction } from '../hooks/useAction';
import { formatHebrewDate, toTimeDisplay } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import Alert from '../components/Alert/Alert';
import { BOOKING_CONFIRMATION_KEY } from './BookingSuccessPage';
import './BookingManagePage.css';

const STATUS_LABEL = {
  Pending: 'ממתין',
  Confirmed: 'מאושר',
  Cancelled: 'בוטל',
  Completed: 'הושלם',
};

function readStoredConfirmation() {
  try {
    const raw = sessionStorage.getItem(BOOKING_CONFIRMATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const BookingManagePage = () => {
  const [phone, setPhone] = useState('');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [appointment, setAppointment] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const { busyKey, message, setMessage, run } = useAction();

  useEffect(() => {
    const stored = readStoredConfirmation();
    if (!stored) return;
    if (stored.booking?.appointment_id) {
      setConfirmationNumber(String(stored.booking.appointment_id));
    }
    if (stored.phone) {
      setPhone(String(stored.phone));
    }
  }, []);

  const handleLookup = async (e) => {
    e.preventDefault();
    setAppointment(null);
    setCancelled(false);

    const id = confirmationNumber.trim();
    const phoneValue = phone.trim();
    if (!id || !phoneValue) {
      setMessage({ type: 'error', text: 'נא להזין מספר אישור ומספר טלפון.' });
      return;
    }

    const { ok, result } = await run(
      'lookup',
      () => customerGetAppointment(id, phoneValue),
      { errorFallback: 'שגיאה באיתור התור.' }
    );
    if (ok) setAppointment(result);
  };

  const handleCancel = async () => {
    if (!appointment) return;
    if (!window.confirm('האם לבטל את התור?')) return;

    const { ok } = await run(
      'cancel',
      () => customerCancelAppointment(appointment.appointment_id, phone.trim()),
      {
        success: 'התור בוטל בהצלחה.',
        errorFallback: 'שגיאה בביטול התור.',
      }
    );
    if (ok) {
      setCancelled(true);
      setAppointment((prev) => (prev ? { ...prev, status: 'Cancelled' } : prev));
    }
  };

  const isCancelled = cancelled || appointment?.status === 'Cancelled';
  const serviceNames = Array.isArray(appointment?.service_names)
    ? appointment.service_names
    : [];

  return (
    <PageContainer size="sm" className="manage-page">
      <div className="manage-header">
        <CalendarClock size={40} className="manage-icon" aria-hidden="true" />
        <h1>ניהול תור</h1>
        <p className="subtitle">איתור תור קיים לפי מספר אישור ומספר טלפון</p>
      </div>

      <Alert type={message?.type}>{message?.text}</Alert>

      {!appointment && (
        <form onSubmit={handleLookup} className="manage-form">
          <div className="input-group">
            <label htmlFor="manage-confirmation">מספר אישור</label>
            <input
              id="manage-confirmation"
              type="text"
              value={confirmationNumber}
              onChange={(e) => setConfirmationNumber(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="manage-phone">טלפון</label>
            <input
              id="manage-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
          </div>
          <button
            type="submit"
            className="submit-btn"
            disabled={busyKey === 'lookup'}
          >
            {busyKey === 'lookup' ? 'מחפש...' : 'איתור תור'}
          </button>
        </form>
      )}

      {appointment && (
        <div className="manage-details">
          <h2>פרטי התור</h2>
          {appointment.customer_first_name && (
            <p><strong>שם:</strong> {appointment.customer_first_name}</p>
          )}
          <p><strong>תאריך:</strong> {formatHebrewDate(appointment.visit_date)}</p>
          <p>
            <strong>שעה:</strong>{' '}
            {appointment.end_time
              ? `${toTimeDisplay(appointment.start_time)} עד ${toTimeDisplay(appointment.end_time)}`
              : toTimeDisplay(appointment.start_time)}
          </p>
          {serviceNames.length > 0 && (
            <p><strong>שירותים:</strong> {serviceNames.join(', ')}</p>
          )}
          <p>
            <strong>סטטוס:</strong>{' '}
            <span className={isCancelled ? 'status-cancelled' : 'status-active'}>
              {STATUS_LABEL[appointment.status] || appointment.status}
            </span>
          </p>

          {isCancelled ? (
            <div className="rebook-block">
              <p className="rebook-copy">התור בוטל. לקביעת תור חדש:</p>
              <Link to="/book" className="btn-primary rebook-link">
                קביעת תור חדש
              </Link>
            </div>
          ) : (
            <button
              type="button"
              className="cancel-btn"
              onClick={handleCancel}
              disabled={busyKey === 'cancel'}
            >
              {busyKey === 'cancel' ? 'מבטל...' : 'ביטול התור'}
            </button>
          )}

          <button
            type="button"
            className="btn-secondary lookup-again"
            onClick={() => {
              setAppointment(null);
              setCancelled(false);
              setMessage(null);
            }}
          >
            חיפוש תור אחר
          </button>
        </div>
      )}
    </PageContainer>
  );
};

export default BookingManagePage;
