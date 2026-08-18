import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { formatHebrewDate, formatDuration, toTimeDisplay } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import './BookingSuccessPage.css';

export const BOOKING_CONFIRMATION_KEY = 'bookingConfirmation';

function readStoredConfirmation(bookingPath) {
  try {
    const raw = sessionStorage.getItem(BOOKING_CONFIRMATION_KEY);
    const confirmation = raw ? JSON.parse(raw) : null;
    return (confirmation?.bookingPath || '/book') === bookingPath
      ? confirmation
      : null;
  } catch {
    return null;
  }
}

// Booking details arrive via router state from CustomerBookingPage. On a
// refresh or direct visit the state is gone, so we fall back to the copy
// persisted in sessionStorage at booking time.
const BookingSuccessPage = () => {
  const { state } = useLocation();
  const { businessSlug } = useParams();
  const routeBookingPath = businessSlug ? `/book/${businessSlug}` : '/book';
  const stateMatchesRoute =
    state?.booking && (state.bookingPath || '/book') === routeBookingPath;
  const confirmation = stateMatchesRoute
    ? state
    : readStoredConfirmation(routeBookingPath);
  const booking = confirmation?.booking;
  const serviceNames = confirmation?.serviceNames || [];
  const customerName = confirmation?.customerName;
  const bookingPath = confirmation?.bookingPath || routeBookingPath;
  const timezone = confirmation?.timezone;

  return (
    <PageContainer size="sm" className="success-page">
      <div className="success-header">
        <CheckCircle size={80} className="success-icon" />
        <h1>התור שלך נקבע בהצלחה!</h1>

        {booking ? (
          <div className="booking-details">
            <h3>פרטי הביקור:</h3>
            {booking.appointment_id && (
              <p><strong>מספר אישור:</strong> {booking.appointment_id}</p>
            )}
            {customerName && <p><strong>שם:</strong> {customerName}</p>}
            {serviceNames.length > 0 && (
              <p><strong>שירותים:</strong> {serviceNames.join(', ')}</p>
            )}
            <p><strong>תאריך:</strong> {formatHebrewDate(booking.visit_date)}</p>
            <p>
              <strong>שעה:</strong>{' '}
              {booking.end_time
                ? `${toTimeDisplay(booking.start_time, timezone)} עד ${toTimeDisplay(booking.end_time, timezone)}`
                : toTimeDisplay(booking.start_time, timezone)}
            </p>
            <p><strong>זמן מוערך:</strong> {formatDuration(booking.total_duration)}</p>
            <p><strong>מחיר:</strong> ₪{booking.total_price}</p>
            {!confirmation.bookingPath && (
              <Link to="/book/manage" className="manage-link">
                לביטול או שינוי התור
              </Link>
            )}
          </div>
        ) : (
          <p>ההזמנה נקלטה במערכת. נתראה בקרוב!</p>
        )}

        <Link to={bookingPath} className="btn-secondary">
          <ArrowRight size={18} />
          חזרה להזמנת תור נוסף
        </Link>
      </div>
    </PageContainer>
  );
};

export default BookingSuccessPage;
