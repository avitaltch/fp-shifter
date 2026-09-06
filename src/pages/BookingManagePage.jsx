import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CalendarClock } from 'lucide-react';
import {
  cancelPublicManagedBooking,
  loadPublicManagedAppointment,
} from '../lib/api';
import { useAction } from '../hooks/useAction';
import { formatHebrewDate, toTimeDisplay } from '../lib/dates';
import { readFragmentCapability } from '../lib/capabilityTokens';
import PageContainer from '../components/PageContainer/PageContainer';
import Alert from '../components/Alert/Alert';
import './BookingManagePage.css';

const STATUS_LABEL = {
  Pending: 'ממתין',
  Confirmed: 'מאושר',
  Cancelled: 'בוטל',
  Completed: 'הושלם',
};

const BookingManagePage = () => {
  const { businessSlug } = useParams();
  const { hash, pathname, search } = useLocation();
  const managementToken = readFragmentCapability(hash, 'sm');
  const [appointment, setAppointment] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const { isBusy, message, setMessage, run } = useAction();

  useEffect(() => {
    if (!hash) return;
    window.history.replaceState(window.history.state, '', `${pathname}${search}`);
  }, [hash, pathname, search]);

  useEffect(() => {
    if (!managementToken) {
      setMessage({ type: 'error', text: 'קישור ניהול התור חסר או אינו תקין.' });
      return;
    }
    let active = true;
    run(
      'lookup',
      () => loadPublicManagedAppointment(businessSlug, managementToken),
      { errorFallback: 'שגיאה באיתור התור.' }
    ).then(({ ok, result }) => {
      if (active && ok) setAppointment(result);
    });
    return () => {
      active = false;
    };
  }, [businessSlug, managementToken, run, setMessage]);

  const handleCancel = async () => {
    if (!appointment) return;
    if (!window.confirm('האם לבטל את התור?')) return;

    const { ok } = await run(
      'cancel',
      () => cancelPublicManagedBooking(businessSlug, managementToken),
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
        <p className="subtitle">
          צפייה בפרטי התור וביטול מאובטח דרך הקישור האישי
        </p>
      </div>

      <Alert type={message?.type}>{message?.text}</Alert>

      {!appointment && isBusy('lookup') && (
        <p className="manage-loading" role="status">טוען את פרטי התור...</p>
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
              ? `${toTimeDisplay(appointment.start_time, appointment.timezone)} עד ${toTimeDisplay(appointment.end_time, appointment.timezone)}`
              : toTimeDisplay(appointment.start_time, appointment.timezone)}
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
              <Link
                to={`/book/${businessSlug}`}
                className="btn-primary rebook-link"
              >
                קביעת תור חדש
              </Link>
            </div>
          ) : (
            <button
              type="button"
              className="cancel-btn"
              onClick={handleCancel}
              disabled={isBusy('cancel')}
            >
              {isBusy('cancel') ? 'מבטל...' : 'ביטול התור'}
            </button>
          )}

        </div>
      )}
    </PageContainer>
  );
};

export default BookingManagePage;
