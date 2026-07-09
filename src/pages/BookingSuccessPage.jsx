import { Link, useLocation } from 'react-router-dom';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { formatHebrewDate, formatDuration, toTimeDisplay } from '../lib/dates';
import PageContainer from '../components/PageContainer/PageContainer';
import './BookingSuccessPage.css';

// Real booking details arrive via router state from CustomerBookingPage.
const BookingSuccessPage = () => {
  const { state } = useLocation();
  const booking = state?.booking;
  const serviceNames = state?.serviceNames || [];

  return (
    <PageContainer size="sm" className="success-page">
      <div className="success-header">
        <CheckCircle size={80} className="success-icon" />
        <h1>התור שלך נקבע בהצלחה!</h1>

        {booking ? (
          <div className="booking-details">
            <h3>פרטי הביקור:</h3>
            {serviceNames.length > 0 && (
              <p><strong>שירותים:</strong> {serviceNames.join(', ')}</p>
            )}
            <p><strong>תאריך:</strong> {formatHebrewDate(booking.visit_date)}</p>
            <p><strong>שעה:</strong> {toTimeDisplay(booking.start_time)}</p>
            <p><strong>זמן מוערך:</strong> {formatDuration(booking.total_duration)}</p>
            <p><strong>מחיר:</strong> ₪{booking.total_price}</p>
          </div>
        ) : (
          <p>ההזמנה נקלטה במערכת. נתראה בקרוב!</p>
        )}

        <Link to="/book" className="btn-secondary">
          <ArrowRight size={18} />
          חזרה להזמנת תור נוסף
        </Link>
      </div>
    </PageContainer>
  );
};

export default BookingSuccessPage;
